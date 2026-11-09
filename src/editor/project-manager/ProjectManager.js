import fs from 'fs';
import path from 'path';
import {
  DEFAULT_PROJECTS_DIR,
  MAXROS_INSTALLATION_ROOT,
  MAXROS_MANIFEST_FILENAME,
  globalPathResolver
} from './ProjectPathResolver.js';
import { ProjectCreator, MAXROS_ENGINE_VERSION } from './ProjectCreator.js';
import { ProjectLoader } from './ProjectLoader.js';
import { ProjectValidator } from './ProjectValidator.js';
import { RecentProjects } from './RecentProjects.js';
import { ResourceUUIDRegistry, isValidUUID } from './ResourceUUIDRegistry.js';
import { EditorSceneManager } from '../../engine/serialization/EditorSceneManager.js';

/**
 * ProjectManager
 *
 * Ponto central de coordenação do Gerenciador de Projetos da Maxros Engine:
 * - Provisiona a demonstração oficial (`projects/guardiao-geometrico-demo`, `"type": "demo"`) sem poluir `RecentProjects`.
 * - Mantém as 3 seções separadas:
 *   1. Meus Projetos (`type: "user"`)
 *   2. Projetos Recentes (`RecentProjects` - histórico real de aberturas)
 *   3. Demonstrações e Exemplos (`type: "demo"`)
 * - Gerencia o `activeProjectContext` e garante que `project://` aponte sempre para a raiz do projeto aberto.
 */
export class ProjectManager {
  /**
   * @param {{
   *   projectsRootDir?: string,
   *   storageDir?: string,
   *   autoProvisionDemo?: boolean
   * }} [options]
   */
  constructor(options = {}) {
    this.projectsRootDir = options.projectsRootDir
      ? path.resolve(options.projectsRootDir)
      : DEFAULT_PROJECTS_DIR;
    this.recentProjects = new RecentProjects(options.storageDir);
    this.activeProjectContext = null;

    fs.mkdirSync(this.projectsRootDir, { recursive: true });

    if (options.autoProvisionDemo !== false) {
      this.ensureOfficialDemoProject();
    }
  }

  /**
   * Garante que a demonstração oficial "Guardião Geométrico: Arena dos Cristais"
   * esteja instalada em `projects/guardiao-geometrico-demo` com `"type": "demo"`.
   * Importante: NUNCA adiciona a demo automaticamente em `RecentProjects`.
   */
  ensureOfficialDemoProject() {
    const demoFolderName = 'guardiao-geometrico-demo';
    const demoDir = path.join(this.projectsRootDir, demoFolderName);
    const manifestPath = path.join(demoDir, MAXROS_MANIFEST_FILENAME);

    if (fs.existsSync(manifestPath)) {
      const validation = ProjectValidator.validateProject(demoDir);
      if (validation.valid) {
        return demoDir;
      }
      // Se estiver corrompido, remover pasta da demo para recriá-la limpa
      try {
        fs.rmSync(demoDir, { recursive: true, force: true });
      } catch {
        return null;
      }
    }

    const res = ProjectCreator.createProject({
      name: 'Guardião Geométrico: Arena dos Cristais',
      folderName: demoFolderName,
      baseDir: this.projectsRootDir,
      template: 'geometric_demo',
      type: 'demo',
      trusted: true
    });

    return res.success ? res.projectPath : null;
  }

  /**
   * Escaneia o diretório de projetos (`projects/`) e retorna os projetos classificados em:
   * - `myProjects` (`type: "user"`)
   * - `recentProjects` (histórico real de projetos abertos)
   * - `demoProjects` (`type: "demo"`)
   */
  getOverview() {
    this.ensureOfficialDemoProject();

    const myProjects = [];
    const demoProjects = [];
    const seenPaths = new Set();

    const inspectProjectDir = (dirPath) => {
      const normalized = path.resolve(dirPath);
      if (seenPaths.has(normalized)) return;
      if (!fs.existsSync(normalized)) return;

      const validation = ProjectValidator.validateProject(normalized);
      if (!validation.valid || !validation.manifest) return;

      seenPaths.add(normalized);
      const manifest = validation.manifest;
      let lastModified = null;
      try {
        const stat = fs.statSync(validation.manifestPath);
        lastModified = stat.mtime.toISOString();
      } catch {
        lastModified = new Date().toISOString();
      }

      const summary = {
        uuid: manifest.uuid,
        name: manifest.name,
        folderName: path.basename(normalized),
        path: normalized,
        projectFile: validation.manifestPath,
        type: manifest.type === 'demo' ? 'demo' : 'user',
        engineVersion: manifest.engine_version,
        coreVersion: validation.coreVersion || manifest.engine_version,
        coreVersionMismatch: validation.coreVersionMismatch,
        mainSceneUuid: manifest.main_scene?.uuid || null,
        mainSceneRelativePath: validation.mainSceneRelativePath || 'scenes/main.scene.json',
        lastModified,
        trusted: manifest.trust_policy?.trusted !== false
      };

      if (summary.type === 'demo') {
        demoProjects.push(summary);
      } else {
        myProjects.push(summary);
      }
    };

    // 1. Escanear pastas dentro de `this.projectsRootDir`
    if (fs.existsSync(this.projectsRootDir)) {
      const entries = fs.readdirSync(this.projectsRootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          inspectProjectDir(path.join(this.projectsRootDir, entry.name));
        }
      }
    }

    // 2. Incluir também projetos do usuário abertos de outros diretórios presentes em RecentProjects
    const recentList = this.recentProjects.list();
    for (const recentItem of recentList) {
      if (recentItem.available && recentItem.path) {
        inspectProjectDir(recentItem.path);
      }
    }

    myProjects.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    demoProjects.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return {
      engineName: 'Maxros Engine',
      engineVersion: MAXROS_ENGINE_VERSION,
      defaultProjectsDir: this.projectsRootDir,
      installationRoot: MAXROS_INSTALLATION_ROOT,
      myProjects,
      recentProjects: recentList,
      demoProjects,
      activeProjectContext: this.activeProjectContext
    };
  }

  /**
   * Cria um novo projeto e opcionalmente já o abre como projeto ativo.
   *
   * @param {{
   *   name: string,
   *   folderName?: string,
   *   baseDir?: string,
   *   template?: 'standard_3d' | 'empty' | 'geometric_demo',
   *   type?: 'user' | 'demo',
   *   openAfterCreate?: boolean
   * }} options
   */
  createProject(options) {
    const createRes = ProjectCreator.createProject({
      name: options.name,
      folderName: options.folderName,
      baseDir: options.baseDir || this.projectsRootDir,
      template: options.template || 'standard_3d',
      type: options.type || 'user',
      trusted: true
    });

    if (!createRes.success || !createRes.projectPath) {
      return createRes;
    }

    if (options.openAfterCreate !== false) {
      const openRes = this.openProject(createRes.projectPath, {
        recordInRecent: true
      });
      return {
        ...createRes,
        opened: openRes.success,
        projectContext: openRes.projectContext,
        sceneData: openRes.sceneData
      };
    }

    return createRes;
  }

  /**
   * Abre um projeto existente, atualiza `project://` para a raiz desse projeto
   * e registra a abertura em `RecentProjects`.
   *
   * @param {string} targetPath
   * @param {{
   *   autoMigrateLegacy?: boolean,
   *   recordInRecent?: boolean,
   *   trustProjectScripts?: boolean
   * }} [options]
   */
  openProject(targetPath, options = {}) {
    const openResult = ProjectLoader.openProject(targetPath, {
      autoMigrateLegacy: options.autoMigrateLegacy === true,
      autoRebuildMissingDotMaxros: true,
      trustProjectScripts: options.trustProjectScripts
    });

    if (!openResult.success || !openResult.projectContext) {
      return openResult;
    }

    this.activeProjectContext = openResult.projectContext;

    if (options.recordInRecent !== false) {
      this.recentProjects.recordOpenedProject({
        uuid: openResult.projectContext.projectUuid,
        name: openResult.projectContext.projectName,
        path: openResult.projectContext.projectPath,
        projectFile: openResult.projectContext.projectFile,
        type: openResult.projectContext.projectType,
        engineVersion: openResult.projectContext.engineVersion
      });
    }

    return openResult;
  }

  /**
   * Fecha o projeto atualmente aberto e limpa a raiz dinâmica `project://`.
   */
  closeProject() {
    this.activeProjectContext = null;
    globalPathResolver.clearProjectRoot();
    return {
      success: true,
      activeProjectContext: null
    };
  }

  /**
   * Atualiza explicitamente o runtime `core/` de um projeto para a versão atual da Maxros Engine.
   *
   * @param {string} [targetProjectPath]
   */
  updateProjectCoreRuntime(targetProjectPath) {
    const projectRoot = targetProjectPath
      ? path.resolve(targetProjectPath)
      : this.activeProjectContext?.projectPath;

    if (!projectRoot || !fs.existsSync(projectRoot)) {
      return {
        success: false,
        error: 'Projeto não encontrado para atualização do runtime core/.'
      };
    }

    const coreInfo = ProjectCreator.provisionProjectCoreRuntime(projectRoot);
    const manifestPath = path.join(projectRoot, MAXROS_MANIFEST_FILENAME);
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        manifest.engine_version = MAXROS_ENGINE_VERSION;
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
      } catch {
        // Ignorar falha de atualização secundária
      }
    }

    if (this.activeProjectContext && this.activeProjectContext.projectPath === projectRoot) {
      this.activeProjectContext.coreVersion = MAXROS_ENGINE_VERSION;
      this.activeProjectContext.engineVersion = MAXROS_ENGINE_VERSION;
      this.activeProjectContext.coreVersionMismatch = false;
    }

    return {
      success: true,
      coreInfo,
      engineVersion: MAXROS_ENGINE_VERSION
    };
  }

  /**
   * Carrega uma cena `.scene.json` específica do projeto ativo por UUID ou caminho relativo (`scenes/...`).
   *
   * @param {string} sceneIdentifier UUID da cena ou caminho (`project://scenes/main.scene.json` ou `scenes/main.scene.json`)
   */
  loadProjectScene(sceneIdentifier) {
    if (!this.activeProjectContext || !this.activeProjectContext.projectPath) {
      return {
        success: false,
        error: 'Nenhum projeto Maxros Engine está aberto no momento.'
      };
    }

    const projectRoot = this.activeProjectContext.projectPath;
    const registry = new ResourceUUIDRegistry(projectRoot);
    registry.scanProject({ autoRegisterUntracked: true });

    let resolved = null;
    if (isValidUUID(sceneIdentifier)) {
      resolved = registry.resolveUUID(sceneIdentifier.trim().toLowerCase());
    } else if (typeof sceneIdentifier === 'string' && sceneIdentifier.trim().length > 0) {
      const normalizedRel = sceneIdentifier
        .trim()
        .replace(/^project:\/\//, '')
        .replace(/^res:\/\//, '')
        .replace(/\.scene$/, '.scene.json');
      const uuid = registry.getUUIDForPath(normalizedRel);
      if (uuid) {
        resolved = registry.resolveUUID(uuid);
      } else {
        const candidateAbs = globalPathResolver.resolvePath(`project://${normalizedRel}`);
        if (fs.existsSync(candidateAbs)) {
          const ensuredUuid = registry.ensureResourceUUID(normalizedRel);
          resolved = {
            uuid: ensuredUuid,
            relativePath: normalizedRel,
            projectUri: `project://${normalizedRel}`,
            absolutePath: candidateAbs
          };
        }
      }
    }

    if (!resolved || !fs.existsSync(resolved.absolutePath)) {
      return {
        success: false,
        error: `Cena "${sceneIdentifier}" não encontrada no projeto "${this.activeProjectContext.projectName}".`
      };
    }

    try {
      const raw = fs.readFileSync(resolved.absolutePath, 'utf-8');
      const sceneData = JSON.parse(raw);
      ProjectLoader.hydrateSceneUUIDReferences(sceneData, registry, {
        trusted: this.activeProjectContext.trusted
      });

      this.activeProjectContext.activeSceneUuid = resolved.uuid;
      this.activeProjectContext.activeScenePath = resolved.relativePath;

      return {
        success: true,
        sceneUuid: resolved.uuid,
        scenePath: resolved.relativePath,
        sceneVirtualPath: resolved.projectUri,
        sceneData
      };
    } catch (err) {
      return {
        success: false,
        error: `Erro ao carregar cena "${resolved.relativePath}": ${err.message}`
      };
    }
  }

  /**
   * Salva uma cena `.scene.json` atomicamente dentro do projeto ativo, preservando seu `.uuid` sidecar
   * e sincronizando scripts modificados para seus arquivos `.script.js` correspondentes.
   *
   * @param {any} sceneData Objeto JSON serializado da cena
   * @param {string} [targetSceneIdentifier] UUID ou caminho relativo da cena (padrão: cena ativa do projeto)
   */
  saveProjectScene(sceneData, targetSceneIdentifier) {
    if (!this.activeProjectContext || !this.activeProjectContext.projectPath) {
      return {
        success: false,
        error: 'Nenhum projeto Maxros Engine está aberto para salvar a cena.'
      };
    }

    const projectRoot = this.activeProjectContext.projectPath;
    const registry = new ResourceUUIDRegistry(projectRoot);
    registry.scanProject({ autoRegisterUntracked: true });

    let targetRelPath = this.activeProjectContext.activeScenePath || 'scenes/main.scene.json';
    if (targetSceneIdentifier) {
      if (isValidUUID(targetSceneIdentifier)) {
        const resolved = registry.resolveUUID(targetSceneIdentifier);
        if (resolved) {
          targetRelPath = resolved.relativePath;
        }
      } else if (typeof targetSceneIdentifier === 'string') {
        let cleaned = targetSceneIdentifier
          .trim()
          .replace(/^project:\/\//, '')
          .replace(/^res:\/\//, '');
        if (cleaned.endsWith('.scene')) {
          cleaned = `${cleaned.slice(0, -'.scene'.length)}.scene.json`;
        } else if (!cleaned.endsWith('.scene.json')) {
          cleaned = `${cleaned}.scene.json`;
        }
        if (!cleaned.includes('/')) {
          cleaned = `scenes/${cleaned}`;
        }
        targetRelPath = cleaned;
      }
    }

    // Sincronizar scripts inline novos ou editados nos nós para arquivos .script.js com referência UUID
    const syncNodeScripts = (nodeObj) => {
      if (!nodeObj || typeof nodeObj !== 'object') return;

      if (Array.isArray(nodeObj.scripts) && nodeObj.scripts.length > 0) {
        const primaryScript = nodeObj.scripts[0];
        if (primaryScript && typeof primaryScript.code === 'string') {
          let scriptUuid =
            (nodeObj.script && isValidUUID(nodeObj.script.uuid) && nodeObj.script.uuid.toLowerCase()) ||
            (isValidUUID(primaryScript.uuid) && primaryScript.uuid.toLowerCase()) ||
            null;

          if (scriptUuid) {
            const existingScript = registry.resolveUUID(scriptUuid);
            if (existingScript) {
              registry.updateResourceContent(existingScript.relativePath, primaryScript.code);
              nodeObj.script = { uuid: scriptUuid };
            } else {
              // Criar arquivo .script.js preservando o UUID
              const safeScriptFile = this.sanitizeScriptFilename(primaryScript.name || nodeObj.name || 'node');
              const created = registry.createResourceFile(
                `scripts/${safeScriptFile}`,
                primaryScript.code,
                scriptUuid
              );
              nodeObj.script = { uuid: created.uuid };
              primaryScript.uuid = created.uuid;
            }
          } else {
            // Criar um novo recurso .script.js e vincular por UUID
            const safeScriptFile = this.sanitizeScriptFilename(primaryScript.name || nodeObj.name || 'node');
            let scriptRelPath = `scripts/${safeScriptFile}`;
            // Se já existir e pertencer a este nome de script, atualizar ou gerar sufixo
            const existingUuid = registry.getUUIDForPath(scriptRelPath);
            if (existingUuid) {
              registry.updateResourceContent(scriptRelPath, primaryScript.code);
              nodeObj.script = { uuid: existingUuid };
              primaryScript.uuid = existingUuid;
            } else {
              const created = registry.createResourceFile(scriptRelPath, primaryScript.code);
              nodeObj.script = { uuid: created.uuid };
              primaryScript.uuid = created.uuid;
            }
          }
        }
      }

      if (Array.isArray(nodeObj.children)) {
        for (const child of nodeObj.children) {
          syncNodeScripts(child);
        }
      }
    };

    const sceneCopy = JSON.parse(JSON.stringify(sceneData));
    sceneCopy.engine = 'Maxros Engine';
    sceneCopy.version = sceneCopy.version || '1.0';
    if (Array.isArray(sceneCopy.rootNodes)) {
      for (const rootNode of sceneCopy.rootNodes) {
        syncNodeScripts(rootNode);
      }
    }

    const absScenePath = globalPathResolver.resolvePath(`project://${targetRelPath}`);
    fs.mkdirSync(path.dirname(absScenePath), { recursive: true });

    // Preservar UUID existente caso o arquivo já exista
    const existingSceneUuid = registry.getUUIDForPath(targetRelPath);

    // Escrita atômica via EditorSceneManager (.tmp.scene.json + fsync + rename)
    EditorSceneManager.writeAtomicSceneJson(absScenePath, sceneCopy);

    // Garantir o sidecar .uuid preservando o UUID anterior (ou gerando um novo se for cena nova)
    const finalSceneUuid = registry.ensureResourceUUID(targetRelPath, existingSceneUuid || undefined);

    // Atualizar listas de recursos no contexto ativo
    const refreshedDiagnostics = registry.scanProject({ autoRegisterUntracked: true });
    const allResources = registry.listResources();
    this.activeProjectContext.availableScenes = allResources.filter((r) => r.type === 'scene');
    this.activeProjectContext.availableScripts = allResources.filter((r) => r.type === 'script');
    this.activeProjectContext.availableMaterials = allResources.filter((r) => r.type === 'material');
    this.activeProjectContext.availableResources = allResources;
    this.activeProjectContext.activeSceneUuid = finalSceneUuid;
    this.activeProjectContext.activeScenePath = targetRelPath;
    this.activeProjectContext.uuidDiagnostics = {
      ...refreshedDiagnostics,
      brokenSceneReferences: registry.findBrokenReferences(sceneCopy)
    };

    return {
      success: true,
      sceneUuid: finalSceneUuid,
      scenePath: targetRelPath,
      sceneVirtualPath: `project://${targetRelPath}`,
      absolutePath: absScenePath
    };
  }

  /**
   * Normaliza o nome de arquivo de um script para terminar em `.script.js`.
   * @param {string} rawName
   */
  sanitizeScriptFilename(rawName) {
    let base = String(rawName || 'script')
      .trim()
      .replace(/\.script\.js$/i, '')
      .replace(/\.js$/i, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!base) base = 'node_logic';
    return `${base}.script.js`;
  }
}

export const globalProjectManager = new ProjectManager();
