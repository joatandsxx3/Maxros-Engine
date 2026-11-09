import fs from 'fs';
import path from 'path';
import { ProjectValidator } from './ProjectValidator.js';
import { ProjectCreator } from './ProjectCreator.js';
import { ResourceUUIDRegistry, generateUUID, isValidUUID } from './ResourceUUIDRegistry.js';
import { globalPathResolver, MAXROS_MANIFEST_FILENAME } from './ProjectPathResolver.js';

/**
 * ProjectLoader
 *
 * Responsável por:
 * 1. Abrir e carregar projetos Maxros Engine validando `maxros.project.json`.
 * 2. Atualizar imediatamente o `globalPathResolver` (`project://`) para a raiz física do projeto aberto.
 * 3. Regenerar automaticamente a estrutura `.maxros/` caso tenha sido removida pelo usuário.
 * 4. Resolver `main_scene: { "uuid": "..." }` para o arquivo `.scene.json` real via `ResourceUUIDRegistry`.
 * 5. Migrar de forma segura e não destrutiva projetos legados (`project.core3d`, `project.maxros`, `.core3d/`, `.scene` -> `maxros.project.json`, `.maxros/`, `.scene.json` com sidecars `.uuid`).
 * 6. Avaliar políticas de confiança de scripts (`trust_policy.trusted`).
 */
export class ProjectLoader {
  /**
   * Migra de forma segura e não destrutiva um projeto legado (`project.core3d`, `project.maxros`, `.core3d/`, `.scene`)
   * para o formato oficial `maxros.project.json` + `.scene.json` + sidecars `.uuid`.
   * Os arquivos originais são preservados até que a conversão e validação completem com sucesso.
   *
   * @param {string} targetPath
   * @returns {{
   *   success: boolean,
   *   projectRoot: string | null,
   *   manifestPath: string | null,
   *   migratedFiles: string[],
   *   errors: string[]
   * }}
   */
  static migrateLegacyProject(targetPath) {
    const migratedFiles = [];
    const errors = [];

    if (!targetPath || typeof targetPath !== 'string') {
      return {
        success: false,
        projectRoot: null,
        manifestPath: null,
        migratedFiles,
        errors: ['Caminho inválido para migração de projeto legado.']
      };
    }

    const resolvedInput = path.resolve(targetPath);
    if (!fs.existsSync(resolvedInput)) {
      return {
        success: false,
        projectRoot: null,
        manifestPath: null,
        migratedFiles,
        errors: [`O caminho "${resolvedInput}" não existe.`]
      };
    }

    const stat = fs.statSync(resolvedInput);
    const projectRoot = stat.isDirectory() ? resolvedInput : path.dirname(resolvedInput);

    try {
      // 1. Migrar .core3d/ -> .maxros/ se existir
      const legacyDotDir = path.join(projectRoot, '.core3d');
      const dotMaxrosDir = path.join(projectRoot, '.maxros');
      ProjectCreator.ensureDotMaxrosStructure(projectRoot);

      if (fs.existsSync(legacyDotDir) && fs.statSync(legacyDotDir).isDirectory()) {
        const copyRecursive = (srcDir, destDir) => {
          fs.mkdirSync(destDir, { recursive: true });
          const entries = fs.readdirSync(srcDir, { withFileTypes: true });
          for (const entry of entries) {
            const s = path.join(srcDir, entry.name);
            const d = path.join(destDir, entry.name);
            if (entry.isDirectory()) {
              copyRecursive(s, d);
            } else if (entry.isFile() && !fs.existsSync(d)) {
              fs.copyFileSync(s, d);
            }
          }
        };
        copyRecursive(legacyDotDir, dotMaxrosDir);
        migratedFiles.push('.core3d/ -> .maxros/');
      }

      // 2. Garantir diretórios padrão
      const requiredDirs = ['scenes', 'assets', 'scripts', 'resources', 'build'];
      for (const dirName of requiredDirs) {
        fs.mkdirSync(path.join(projectRoot, dirName), { recursive: true });
      }

      // 3. Garantir core/ runtime se não existir
      if (!fs.existsSync(path.join(projectRoot, 'core', 'version.json'))) {
        ProjectCreator.provisionProjectCoreRuntime(projectRoot);
        migratedFiles.push('core/version.json');
      }

      // 4. Inicializar registro de UUIDs do projeto
      const registry = new ResourceUUIDRegistry(projectRoot);
      registry.scanProject({ autoRegisterUntracked: true });

      // 5. Converter arquivos .scene legados para .scene.json com sidecar .uuid
      const convertLegacyScenesInDir = (dirFullPath) => {
        if (!fs.existsSync(dirFullPath)) return;
        const entries = fs.readdirSync(dirFullPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirFullPath, entry.name);
          if (entry.isDirectory()) {
            if (['core', '.maxros', '.core3d', 'node_modules', '.git'].includes(entry.name)) continue;
            convertLegacyScenesInDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.scene') && !entry.name.endsWith('.tmp.scene')) {
            const baseName = entry.name.slice(0, -'.scene'.length);
            const targetSceneJsonName = `${baseName}.scene.json`;
            const targetSceneJsonPath = path.join(dirFullPath, targetSceneJsonName);

            let sceneObj = null;
            try {
              const rawContent = fs.readFileSync(fullPath, 'utf-8');
              sceneObj = JSON.parse(rawContent);
            } catch (parseErr) {
              errors.push(`Falha ao converter cena legada "${entry.name}": ${parseErr.message}`);
              continue;
            }

            // Converter scripts inline de nós para arquivos .script.js referenciados por UUID se desejado,
            // ou preservar compatibilidade e garantir formato de cena Maxros Engine 1.0
            sceneObj.engine = 'Maxros Engine';
            if (!sceneObj.version) sceneObj.version = '1.0';

            const relTargetScene = path.relative(projectRoot, targetSceneJsonPath).split(path.sep).join('/');
            if (!fs.existsSync(targetSceneJsonPath)) {
              registry.createResourceFile(
                relTargetScene,
                `${JSON.stringify(sceneObj, null, 2)}\n`
              );
              migratedFiles.push(`${entry.name} -> ${targetSceneJsonName}`);
            }
          }
        }
      };

      convertLegacyScenesInDir(projectRoot);
      registry.scanProject({ autoRegisterUntracked: true });

      // 6. Ler manifesto legado (project.core3d ou project.maxros ou maxros.project.json antigo)
      let legacyConfig = {};
      const legacyCore3dFile = path.join(projectRoot, 'project.core3d');
      const legacyMaxrosFile = path.join(projectRoot, 'project.maxros');
      const targetManifestPath = path.join(projectRoot, MAXROS_MANIFEST_FILENAME);

      if (fs.existsSync(targetManifestPath)) {
        try {
          legacyConfig = JSON.parse(fs.readFileSync(targetManifestPath, 'utf-8'));
        } catch {
          legacyConfig = {};
        }
      } else if (fs.existsSync(legacyMaxrosFile)) {
        try {
          legacyConfig = JSON.parse(fs.readFileSync(legacyMaxrosFile, 'utf-8'));
          migratedFiles.push('project.maxros -> maxros.project.json');
        } catch {
          legacyConfig = {};
        }
      } else if (fs.existsSync(legacyCore3dFile)) {
        try {
          legacyConfig = JSON.parse(fs.readFileSync(legacyCore3dFile, 'utf-8'));
          migratedFiles.push('project.core3d -> maxros.project.json');
        } catch {
          legacyConfig = {};
        }
      }

      // 7. Resolver ou criar a cena principal (.scene.json) e obter seu UUID
      let mainSceneUuid = null;
      if (
        legacyConfig.main_scene &&
        typeof legacyConfig.main_scene === 'object' &&
        isValidUUID(legacyConfig.main_scene.uuid)
      ) {
        mainSceneUuid = legacyConfig.main_scene.uuid.toLowerCase();
      } else if (typeof legacyConfig.main_scene === 'string' || typeof legacyConfig.mainScene === 'string') {
        const rawMainScene = String(legacyConfig.main_scene || legacyConfig.mainScene)
          .replace(/^project:\/\//, '')
          .replace(/^res:\/\//, '')
          .replace(/\.scene$/, '.scene.json');

        const candidateUuid = registry.getUUIDForPath(rawMainScene);
        if (candidateUuid) {
          mainSceneUuid = candidateUuid;
        }
      }

      if (!mainSceneUuid) {
        // Procurar scenes/main.scene.json ou qualquer .scene.json
        const defaultMainUuid = registry.getUUIDForPath('scenes/main.scene.json');
        if (defaultMainUuid) {
          mainSceneUuid = defaultMainUuid;
        } else {
          const allResources = registry.listResources();
          const firstScene = allResources.find((r) => r.type === 'scene');
          if (firstScene) {
            mainSceneUuid = firstScene.uuid;
          } else {
            // Criar uma cena padrão se o projeto legado não possuía nenhuma cena
            const sceneData = ProjectCreator.buildInitialSceneData('standard_3d', {});
            const createdMain = registry.createResourceFile(
              'scenes/main.scene.json',
              `${JSON.stringify(sceneData, null, 2)}\n`
            );
            mainSceneUuid = createdMain.uuid;
            migratedFiles.push('scenes/main.scene.json (gerada)');
          }
        }
      }

      const projectUuid = isValidUUID(legacyConfig.uuid) ? legacyConfig.uuid.toLowerCase() : generateUUID();
      const projectName =
        typeof legacyConfig.name === 'string' && legacyConfig.name.trim().length > 0
          ? legacyConfig.name.trim()
          : path.basename(projectRoot);

      const newManifest = {
        uuid: projectUuid,
        engine: 'Maxros Engine',
        engine_version: '1.0.0',
        project_version: 1,
        name: projectName,
        type: legacyConfig.type === 'demo' ? 'demo' : 'user',
        main_scene: {
          uuid: mainSceneUuid
        },
        folders: {
          core: 'core',
          scenes: 'scenes',
          assets: 'assets',
          scripts: 'scripts',
          resources: 'resources',
          build: 'build'
        },
        trust_policy: {
          trusted: true,
          origin: 'migrated_legacy_project'
        }
      };

      fs.writeFileSync(targetManifestPath, `${JSON.stringify(newManifest, null, 2)}\n`, 'utf-8');
      if (!migratedFiles.includes('maxros.project.json')) {
        migratedFiles.push('maxros.project.json');
      }

      return {
        success: errors.length === 0,
        projectRoot,
        manifestPath: targetManifestPath,
        migratedFiles,
        errors
      };
    } catch (err) {
      return {
        success: false,
        projectRoot,
        manifestPath: null,
        migratedFiles,
        errors: [`Erro inesperado durante migração: ${err.message}`]
      };
    }
  }

  /**
   * Abre um projeto Maxros Engine a partir de seu diretório ou arquivo `maxros.project.json`.
   *
   * @param {string} targetPath Caminho da pasta do projeto ou do arquivo `maxros.project.json`
   * @param {{
   *   autoMigrateLegacy?: boolean,
   *   autoRebuildMissingDotMaxros?: boolean,
   *   trustProjectScripts?: boolean
   * }} [options]
   */
  static openProject(targetPath, options = {}) {
    const autoMigrateLegacy = options.autoMigrateLegacy === true;
    const autoRebuildMissingDotMaxros = options.autoRebuildMissingDotMaxros !== false;

    // 1. Validar o projeto primeiro
    let validation = ProjectValidator.validateProject(targetPath);

    // 2. Se for um projeto legado e autoMigrateLegacy estiver ativo, migrar de forma controlada
    if (!validation.valid && validation.legacyDetected && autoMigrateLegacy) {
      const migrationResult = ProjectLoader.migrateLegacyProject(targetPath);
      if (!migrationResult.success) {
        return {
          success: false,
          error: `Falha ao migrar projeto legado: ${migrationResult.errors.join(' | ')}`,
          validation,
          projectContext: null,
          sceneData: null
        };
      }
      validation = ProjectValidator.validateProject(migrationResult.projectRoot);
    }

    if (!validation.valid || !validation.projectRoot || !validation.manifest) {
      return {
        success: false,
        error: validation.errors.join(' '),
        legacyDetected: validation.legacyDetected,
        legacyFiles: validation.legacyFiles,
        validation,
        projectContext: null,
        sceneData: null
      };
    }

    const projectRoot = validation.projectRoot;
    const manifest = validation.manifest;

    // 3. Se `.maxros/` foi apagada pelo usuário, reconstruir automaticamente sem perda de dados
    if (autoRebuildMissingDotMaxros) {
      ProjectCreator.ensureDotMaxrosStructure(projectRoot);
    }

    // 4. Atualizar imediatamente a raiz dinâmica `project://` no resolvedor global
    globalPathResolver.setProjectRoot(projectRoot);

    // 5. Escanear recursos e sidecars `.uuid` do projeto
    const registry = new ResourceUUIDRegistry(projectRoot);
    const uuidDiagnostics = registry.scanProject({ autoRegisterUntracked: true });

    // 6. Resolver a cena principal pelo UUID (`main_scene.uuid`)
    const mainSceneUuid = manifest.main_scene.uuid.toLowerCase();
    let mainSceneResolved = registry.resolveUUID(mainSceneUuid);

    // Caso a cena principal tenha perdido seu sidecar `.uuid`, tentar recuperar automaticamente
    if (!mainSceneResolved && uuidDiagnostics.missingSidecars.length > 0) {
      for (const missing of uuidDiagnostics.missingSidecars) {
        if (missing.relativePath.endsWith('.scene.json')) {
          const recovered = registry.recoverMissingSidecar(missing.relativePath, mainSceneUuid);
          if (recovered.success) {
            mainSceneResolved = registry.resolveUUID(mainSceneUuid);
            break;
          }
        }
      }
    }

    if (!mainSceneResolved || !fs.existsSync(mainSceneResolved.absolutePath)) {
      return {
        success: false,
        error: `Não foi possível localizar o arquivo da cena principal (UUID: ${mainSceneUuid}) no projeto "${manifest.name}".`,
        validation,
        uuidDiagnostics,
        projectContext: null,
        sceneData: null
      };
    }

    // 7. Carregar e hidratar os dados da cena principal, resolvendo referências UUID de scripts
    let sceneData = null;
    try {
      const rawScene = fs.readFileSync(mainSceneResolved.absolutePath, 'utf-8');
      sceneData = JSON.parse(rawScene);
      ProjectLoader.hydrateSceneUUIDReferences(sceneData, registry, {
        trusted:
          typeof options.trustProjectScripts === 'boolean'
            ? options.trustProjectScripts
            : manifest.trust_policy?.trusted !== false
      });
    } catch (err) {
      return {
        success: false,
        error: `Erro ao ler ou interpretar a cena principal "${mainSceneResolved.relativePath}": ${err.message}`,
        validation,
        uuidDiagnostics,
        projectContext: null,
        sceneData: null
      };
    }

    // 8. Verificar referências quebradas na cena principal
    const brokenSceneReferences = registry.findBrokenReferences(sceneData);

    // 9. Atualizar metadados da sessão do editor em `.maxros/editor/last_session.json`
    try {
      const sessionFile = path.join(projectRoot, '.maxros', 'editor', 'last_session.json');
      fs.writeFileSync(
        sessionFile,
        `${JSON.stringify(
          {
            lastOpenedAt: new Date().toISOString(),
            activeSceneUuid: mainSceneUuid,
            activeScenePath: `project://${mainSceneResolved.relativePath}`
          },
          null,
          2
        )}\n`,
        'utf-8'
      );
    } catch {
      // Ignorar falha de gravação em cache descartável
    }

    // 10. Construir a lista de recursos disponíveis no projeto
    const allResources = registry.listResources();
    const availableScenes = allResources.filter((r) => r.type === 'scene');
    const availableScripts = allResources.filter((r) => r.type === 'script');
    const availableMaterials = allResources.filter((r) => r.type === 'material');

    const isTrusted =
      typeof options.trustProjectScripts === 'boolean'
        ? options.trustProjectScripts
        : manifest.trust_policy?.trusted !== false;

    const projectContext = {
      projectUuid: manifest.uuid,
      projectPath: projectRoot,
      projectVirtualRoot: 'project://',
      projectName: manifest.name,
      projectFile: validation.manifestPath,
      projectType: manifest.type,
      projectVersion: manifest.project_version,
      engineVersion: manifest.engine_version,
      coreVersion: validation.coreVersion || manifest.engine_version,
      coreVersionMismatch: validation.coreVersionMismatch,
      corePath: path.join(projectRoot, manifest.folders?.core || 'core'),
      mainSceneUuid,
      mainScenePath: mainSceneResolved.relativePath,
      mainSceneVirtualPath: mainSceneResolved.projectUri,
      activeSceneUuid: mainSceneUuid,
      activeScenePath: mainSceneResolved.relativePath,
      projectSettings: manifest,
      availableScenes,
      availableScripts,
      availableMaterials,
      availableResources: allResources,
      uuidDiagnostics: {
        ...uuidDiagnostics,
        brokenSceneReferences
      },
      trusted: isTrusted,
      isProjectOpen: true
    };

    return {
      success: true,
      error: null,
      validation,
      projectContext,
      sceneData
    };
  }

  /**
   * Hidrata referências `{ "uuid": "..." }` de scripts e materiais dentro da árvore de nós da cena,
   * injetando o código de `.script.js` correspondente nos nós para execução no runtime se o projeto for confiável (`trusted`).
   *
   * @param {any} sceneData
   * @param {ResourceUUIDRegistry} registry
   * @param {{ trusted?: boolean }} [options]
   */
  static hydrateSceneUUIDReferences(sceneData, registry, options = {}) {
    if (!sceneData || typeof sceneData !== 'object') return;
    const trusted = options.trusted !== false;

    const visitNode = (nodeData) => {
      if (!nodeData || typeof nodeData !== 'object') return;

      // Resolver script referenciado por UUID: "script": { "uuid": "..." }
      if (nodeData.script && typeof nodeData.script === 'object' && isValidUUID(nodeData.script.uuid)) {
        const scriptUuid = nodeData.script.uuid.toLowerCase();
        const resolvedScript = registry.resolveUUID(scriptUuid);
        if (resolvedScript && fs.existsSync(resolvedScript.absolutePath)) {
          nodeData.scriptResolvedPath = resolvedScript.projectUri;
          if (trusted) {
            try {
              const code = fs.readFileSync(resolvedScript.absolutePath, 'utf-8');
              const scriptName = path.basename(resolvedScript.relativePath);
              // Se o nó ainda não tem o script carregado em nodeData.scripts, ou se referencia este UUID, sincronizar o código
              if (!Array.isArray(nodeData.scripts) || nodeData.scripts.length === 0) {
                nodeData.scripts = [
                  {
                    name: scriptName,
                    uuid: scriptUuid,
                    code
                  }
                ];
              } else {
                nodeData.scripts = nodeData.scripts.map((s, idx) =>
                  idx === 0 || s.uuid === scriptUuid
                    ? { ...s, name: s.name || scriptName, uuid: scriptUuid, code }
                    : s
                );
              }
            } catch {
              // Ignorar erro de leitura individual
            }
          }
        }
      }

      // Resolver material referenciado por UUID: "material": { "uuid": "..." }
      if (nodeData.material && typeof nodeData.material === 'object' && isValidUUID(nodeData.material.uuid)) {
        const matUuid = nodeData.material.uuid.toLowerCase();
        const resolvedMat = registry.resolveUUID(matUuid);
        if (resolvedMat && fs.existsSync(resolvedMat.absolutePath)) {
          nodeData.materialResolvedPath = resolvedMat.projectUri;
          try {
            const matJson = JSON.parse(fs.readFileSync(resolvedMat.absolutePath, 'utf-8'));
            if (matJson && typeof matJson === 'object') {
              if (matJson.albedoColor && !nodeData.color) {
                nodeData.color = matJson.albedoColor;
              }
            }
          } catch {
            // Ignorar erro de leitura individual
          }
        }
      }

      if (Array.isArray(nodeData.children)) {
        for (const child of nodeData.children) {
          visitNode(child);
        }
      }
    };

    if (Array.isArray(sceneData.rootNodes)) {
      for (const rootNode of sceneData.rootNodes) {
        visitNode(rootNode);
      }
    }
  }
}
