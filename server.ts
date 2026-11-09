import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import {
  EngineNode,
  Sprite3DNode,
  RigidBody3DNode,
  CollisionShape3DNode,
  PhysicsServer,
  NodeFactory,
  EditorSceneManager,
} from './src/engine/index.js';
import { runArchitectureValidation } from './src/engine/validate.js';
import {
  globalProjectManager,
  ProjectCreator,
  ProjectLoader,
  ResourceUUIDRegistry,
} from './src/editor/project-manager/index.js';

const PORT = 3000;
const SCENES_DIR = path.resolve(process.cwd(), 'scenes');
const DEFAULT_SCENE_FILE = path.join(SCENES_DIR, 'default_level.scene');

/**
 * Builds the default fallback scene in RAM and saves it atomically to `/scenes/default_level.scene`
 * if it does not exist yet on disk.
 */
function ensureDefaultSceneOnDisk() {
  if (!fs.existsSync(SCENES_DIR)) {
    fs.mkdirSync(SCENES_DIR, { recursive: true });
  }

  if (fs.existsSync(DEFAULT_SCENE_FILE)) {
    return;
  }

  const tempPhysics = new PhysicsServer();
  const sceneManager = new EditorSceneManager({ physicsServer: tempPhysics });

  const root = new EngineNode('MainSceneRoot');

  // 1. Static Ground Floor
  const floorBody = new RigidBody3DNode({
    name: 'StaticArenaFloor',
    mass: 0,
    bodyType: 'static',
    physicsServer: tempPhysics,
  });
  floorBody.position = { x: 0, y: -0.5, z: 0 };
  const floorShape = new CollisionShape3DNode({
    name: 'FloorBoxCollider',
    shapeType: 'Box',
    size: { x: 16, y: 1, z: 16 },
  });
  floorBody.add(floorShape);
  root.add(floorBody);

  // 2. Elevated Platform (Parent Hierarchy Node with Child Static Body & Sprite3D)
  const platformPivot = new EngineNode('ElevatedPlatformGroup');
  platformPivot.position = { x: -2.2, y: 1.6, z: 0 };

  const rampBody = new RigidBody3DNode({
    name: 'InclinedDeflector',
    mass: 0,
    bodyType: 'static',
    physicsServer: tempPhysics,
  });
  rampBody.position = { x: 0, y: 0, z: 0 };
  rampBody.rotation.set(0, 0, -0.22);
  rampBody.syncTransformToBody();

  const rampCollider = new CollisionShape3DNode({
    name: 'DeflectorBoxShape',
    shapeType: 'Box',
    size: { x: 4.2, y: 0.4, z: 3.2 },
  });
  rampBody.add(rampCollider);
  platformPivot.add(rampBody);

  const markerSprite = new Sprite3DNode({
    name: 'PlatformBillboardSprite',
    texturePath: 'assets/textures/beacon_marker.png',
    renderMode: 'sprite',
    width: 1.1,
    height: 1.1,
    color: '#38bdf8',
  });
  markerSprite.position = { x: -1.4, y: 1.4, z: 0 };
  platformPivot.add(markerSprite);
  root.add(platformPivot);

  // 3. Dynamic Crate 1 (Box Collider + Plane Sprite3D)
  const crateA = new RigidBody3DNode({
    name: 'DynamicCargoCrate_A',
    mass: 2.0,
    bodyType: 'dynamic',
    physicsServer: tempPhysics,
  });
  crateA.position = { x: -1.6, y: 5.2, z: 0 };
  crateA.add(
    new CollisionShape3DNode({
      name: 'CrateCollider_A',
      shapeType: 'Box',
      size: { x: 1.2, y: 1.2, z: 1.2 },
    })
  );
  const crateSpriteA = new Sprite3DNode({
    name: 'CrateDecalPlane_A',
    texturePath: 'assets/textures/cargo_crate_a.png',
    renderMode: 'plane',
    width: 0.9,
    height: 0.9,
    color: '#f59e0b',
  });
  crateSpriteA.position = { x: 0, y: 0, z: 0.62 };
  crateA.add(crateSpriteA);
  root.add(crateA);

  // 4. Dynamic Sphere (Sphere Collider + Billboard Sprite3D)
  const sphereBody = new RigidBody3DNode({
    name: 'DynamicKineticSphere',
    mass: 1.5,
    bodyType: 'dynamic',
    physicsServer: tempPhysics,
  });
  sphereBody.position = { x: -2.4, y: 7.8, z: 0.25 };
  sphereBody.add(
    new CollisionShape3DNode({
      name: 'SphereCollider',
      shapeType: 'Sphere',
      radius: 0.65,
    })
  );
  const sphereSprite = new Sprite3DNode({
    name: 'CoreSpriteGlow',
    texturePath: 'assets/textures/sphere_core.png',
    renderMode: 'sprite',
    width: 0.85,
    height: 0.85,
    color: '#10b981',
  });
  sphereBody.add(sphereSprite);
  root.add(sphereBody);

  // 5. Dynamic Crate 2 (Compound Collider: Box + Top Sphere)
  const compoundBody = new RigidBody3DNode({
    name: 'CompoundPhysicsRig',
    mass: 3.0,
    bodyType: 'dynamic',
    physicsServer: tempPhysics,
  });
  compoundBody.position = { x: 1.4, y: 4.5, z: -0.4 };
  compoundBody.add(
    new CollisionShape3DNode({
      name: 'BaseBoxShape',
      shapeType: 'Box',
      size: { x: 1.4, y: 1.0, z: 1.4 },
    })
  );
  const topDomeCollider = new CollisionShape3DNode({
    name: 'TopSphereShape',
    shapeType: 'Sphere',
    radius: 0.55,
  });
  topDomeCollider.position = { x: 0, y: 0.65, z: 0 };
  compoundBody.add(topDomeCollider);
  root.add(compoundBody);

  sceneManager.saveScene(root, DEFAULT_SCENE_FILE);
  tempPhysics.clear();
}

async function startServer() {
  ensureDefaultSceneOnDisk();
  globalProjectManager.ensureOfficialDemoProject();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // ============================================================================
  // MAXROS ENGINE — PROJECT MANAGER & UUID API ROUTES
  // ============================================================================

  // GET /api/projects/overview - Lists Meus Projetos, Projetos Recentes, Demonstrações e contexto ativo
  app.get('/api/projects/overview', (_req, res) => {
    try {
      const overview = globalProjectManager.getOverview();
      res.json(overview);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/projects/suggest-folder - Suggests a sanitized folder name from a project display name
  app.get('/api/projects/suggest-folder', (req, res) => {
    const rawName = String(req.query.name || 'Meu Projeto');
    res.json({
      folderName: ProjectCreator.suggestFolderName(rawName),
    });
  });

  // POST /api/projects/create - Creates a new Maxros Engine project and opens it
  app.post('/api/projects/create', (req, res) => {
    try {
      const { name, folderName, baseDir, template } = req.body || {};
      const result = globalProjectManager.createProject({
        name: String(name || '').trim(),
        folderName: folderName ? String(folderName).trim() : undefined,
        baseDir: baseDir ? String(baseDir).trim() : undefined,
        template: template || 'standard_3d',
        type: 'user',
        openAfterCreate: true,
      });

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.error || 'Falha ao criar o projeto.',
        });
        return;
      }

      res.json({
        ...result,
        overview: globalProjectManager.getOverview(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/projects/open - Opens an existing project by path, folder name, or manifest UUID
  app.post('/api/projects/open', (req, res) => {
    try {
      const { projectPath, projectUuid, folderName, autoMigrateLegacy, trustProjectScripts } = req.body || {};
      let candidatePath = projectPath ? String(projectPath).trim() : '';

      // Se um UUID de manifesto foi enviado (ex.: via seletor nativo de arquivo maxros.project.json),
      // procurar correspondência nos projetos conhecidos se o caminho relativo foi enviado
      if (!candidatePath && folderName) {
        candidatePath = path.join(globalProjectManager.projectsRootDir, String(folderName).trim());
      } else if (candidatePath && !path.isAbsolute(candidatePath)) {
        const inProjectsDir = path.join(globalProjectManager.projectsRootDir, candidatePath);
        if (fs.existsSync(inProjectsDir)) {
          candidatePath = inProjectsDir;
        } else {
          candidatePath = path.resolve(process.cwd(), candidatePath);
        }
      }

      if (!candidatePath && projectUuid) {
        const overview = globalProjectManager.getOverview();
        const allKnown = [
          ...overview.myProjects,
          ...overview.demoProjects,
          ...overview.recentProjects,
        ];
        const matched = allKnown.find((p) => p.uuid === String(projectUuid).toLowerCase());
        if (matched && matched.path) {
          candidatePath = matched.path;
        }
      }

      if (!candidatePath) {
        res.status(400).json({
          success: false,
          error: 'Informe o caminho da pasta do projeto ou selecione um arquivo maxros.project.json válido.',
        });
        return;
      }

      const openResult = globalProjectManager.openProject(candidatePath, {
        autoMigrateLegacy: Boolean(autoMigrateLegacy),
        recordInRecent: true,
        trustProjectScripts: typeof trustProjectScripts === 'boolean' ? trustProjectScripts : undefined,
      });

      if (!openResult.success) {
        res.status(400).json({
          ...openResult,
          overview: globalProjectManager.getOverview(),
        });
        return;
      }

      res.json({
        ...openResult,
        overview: globalProjectManager.getOverview(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/projects/migrate - Explicitly migrates a legacy project (.core3d / .maxros / .scene)
  app.post('/api/projects/migrate', (req, res) => {
    try {
      const { projectPath } = req.body || {};
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'Caminho do projeto legado não informado.' });
        return;
      }
      const migration = ProjectLoader.migrateLegacyProject(String(projectPath));
      if (!migration.success || !migration.projectRoot) {
        res.status(400).json({
          success: false,
          error: migration.errors.join(' '),
          migration,
        });
        return;
      }

      const openResult = globalProjectManager.openProject(migration.projectRoot, {
        recordInRecent: true,
      });

      res.json({
        ...openResult,
        migration,
        overview: globalProjectManager.getOverview(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/projects/close - Closes the active project and returns to Project Manager
  app.post('/api/projects/close', (_req, res) => {
    try {
      globalProjectManager.closeProject();
      res.json({
        success: true,
        overview: globalProjectManager.getOverview(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/projects/relocate - Relocates a moved project in RecentProjects
  app.post('/api/projects/relocate', (req, res) => {
    try {
      const { oldPathOrUuid, newPath } = req.body || {};
      const reloc = globalProjectManager.recentProjects.relocateProject(
        String(oldPathOrUuid || ''),
        String(newPath || '')
      );
      if (!reloc.success) {
        res.status(400).json(reloc);
        return;
      }
      res.json({
        ...reloc,
        overview: globalProjectManager.getOverview(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/projects/remove-recent - Removes a project from RecentProjects list
  app.post('/api/projects/remove-recent', (req, res) => {
    try {
      const { pathOrUuid } = req.body || {};
      globalProjectManager.recentProjects.removeProject(String(pathOrUuid || ''));
      res.json({
        success: true,
        overview: globalProjectManager.getOverview(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/projects/update-core - Explicitly updates the core/ runtime of a project
  app.post('/api/projects/update-core', (req, res) => {
    try {
      const { projectPath } = req.body || {};
      const result = globalProjectManager.updateProjectCoreRuntime(
        projectPath ? String(projectPath) : undefined
      );
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json({
        ...result,
        overview: globalProjectManager.getOverview(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/projects/uuid/resolve-conflict - Non-silent explicit resolution of duplicate UUID conflicts
  app.post('/api/projects/uuid/resolve-conflict', (req, res) => {
    try {
      const active = globalProjectManager.activeProjectContext;
      if (!active || !active.projectPath) {
        res.status(400).json({ success: false, error: 'Nenhum projeto ativo.' });
        return;
      }
      const { conflictUuid, keepRelativePath } = req.body || {};
      const registry = new ResourceUUIDRegistry(active.projectPath);
      const resolution = registry.resolveDuplicateConflict(
        String(conflictUuid || ''),
        String(keepRelativePath || '')
      );
      if (!resolution.success) {
        res.status(400).json(resolution);
        return;
      }
      // Refresh project context diagnostics
      const reopened = globalProjectManager.openProject(active.projectPath, { recordInRecent: false });
      res.json({
        ...resolution,
        projectContext: reopened.projectContext,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/projects/uuid/recover-sidecar - Recovers or assigns a missing .uuid sidecar
  app.post('/api/projects/uuid/recover-sidecar', (req, res) => {
    try {
      const active = globalProjectManager.activeProjectContext;
      if (!active || !active.projectPath) {
        res.status(400).json({ success: false, error: 'Nenhum projeto ativo.' });
        return;
      }
      const { relativePath, preferredUuid } = req.body || {};
      const registry = new ResourceUUIDRegistry(active.projectPath);
      const recovered = registry.recoverMissingSidecar(
        String(relativePath || ''),
        preferredUuid ? String(preferredUuid) : undefined
      );
      if (!recovered.success) {
        res.status(400).json(recovered);
        return;
      }
      const reopened = globalProjectManager.openProject(active.projectPath, { recordInRecent: false });
      res.json({
        ...recovered,
        projectContext: reopened.projectContext,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // SCENE FILES, LOAD & SAVE (Project-Aware `project://scenes/*.scene.json` + Fallback)
  // ============================================================================

  // GET /api/scene/files - Lists available .scene.json (or legacy .scene) files
  app.get('/api/scene/files', (_req, res) => {
    try {
      const active = globalProjectManager.activeProjectContext;
      if (active && active.projectPath) {
        const registry = new ResourceUUIDRegistry(active.projectPath);
        registry.scanProject({ autoRegisterUntracked: true });
        const sceneResources = registry.listResources().filter((r) => r.type === 'scene');
        const files = sceneResources.map((r) => {
          const stat = fs.statSync(r.absolutePath);
          return {
            uuid: r.uuid,
            fileName: path.basename(r.relativePath),
            relativePath: r.relativePath,
            projectUri: r.projectUri,
            bytes: stat.size,
            updatedAt: stat.mtime.toISOString(),
          };
        });
        res.json({
          projectName: active.projectName,
          projectPath: active.projectPath,
          files,
        });
        return;
      }

      if (!fs.existsSync(SCENES_DIR)) {
        fs.mkdirSync(SCENES_DIR, { recursive: true });
      }
      const files = fs
        .readdirSync(SCENES_DIR)
        .filter(
          (f) =>
            (f.endsWith('.scene.json') || f.endsWith('.scene')) &&
            !f.endsWith('.tmp.scene.json') &&
            !f.endsWith('.tmp.scene')
        )
        .map((fileName) => {
          const fullPath = path.join(SCENES_DIR, fileName);
          const stat = fs.statSync(fullPath);
          return {
            fileName,
            bytes: stat.size,
            updatedAt: stat.mtime.toISOString(),
          };
        });
      res.json({ files });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/scene/load - Loads a scene from the active project (`project://scenes/*.scene.json`) or fallback
  app.get('/api/scene/load', (req, res) => {
    try {
      const active = globalProjectManager.activeProjectContext;
      if (active && active.projectPath) {
        const requested = String(req.query.file || active.activeSceneUuid || active.mainSceneUuid || 'scenes/main.scene.json');
        const loadRes = globalProjectManager.loadProjectScene(requested);
        if (!loadRes.success) {
          res.status(404).json({ error: loadRes.error });
          return;
        }
        res.json({
          fileName: path.basename(loadRes.scenePath || 'main.scene.json'),
          filePath: loadRes.sceneVirtualPath,
          sceneUuid: loadRes.sceneUuid,
          registeredPhysicsBodies: 0,
          warnings: [],
          sceneData: loadRes.sceneData,
          projectContext: globalProjectManager.activeProjectContext,
        });
        return;
      }

      const requestedFile = String(req.query.file || 'default_level.scene').replace(/[^a-zA-Z0-9_.-]/g, '');
      const fileName =
        requestedFile.endsWith('.scene.json') || requestedFile.endsWith('.scene')
          ? requestedFile
          : `${requestedFile}.scene`;
      const targetPath = path.join(SCENES_DIR, fileName);

      if (!fs.existsSync(targetPath)) {
        ensureDefaultSceneOnDisk();
      }

      const tempPhysics = new PhysicsServer();
      const manager = new EditorSceneManager({ physicsServer: tempPhysics });
      const targetFile = fs.existsSync(targetPath) ? targetPath : DEFAULT_SCENE_FILE;
      const rawJson = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      const validation = NodeFactory.validateSceneData(rawJson);

      const reconstructedRoot = manager.loadScene(targetFile, { clearPhysicsBeforeLoad: true });

      const serialized = reconstructedRoot.serialize();
      const bodyCount = tempPhysics.getBodyCount();
      tempPhysics.clear();

      res.json({
        fileName: fs.existsSync(targetPath) ? fileName : 'default_level.scene',
        filePath: targetFile,
        registeredPhysicsBodies: bodyCount,
        warnings: validation.warnings,
        sceneData: serialized,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/scene/save - Saves scene atomically to the active project (`project://scenes/*.scene.json`) or fallback
  app.post('/api/scene/save', (req, res) => {
    try {
      const { fileName, sceneUuid, sceneData } = req.body || {};
      if (!sceneData || typeof sceneData !== 'object') {
        res.status(400).json({ error: 'Missing valid sceneData payload' });
        return;
      }

      const active = globalProjectManager.activeProjectContext;
      if (active && active.projectPath) {
        const saveRes = globalProjectManager.saveProjectScene(
          sceneData,
          sceneUuid || fileName || active.activeScenePath || 'scenes/main.scene.json'
        );
        if (!saveRes.success) {
          res.status(400).json({ error: saveRes.error });
          return;
        }
        res.json({
          status: 'ATOMIC_COMMIT_OK',
          fileName: path.basename(saveRes.scenePath || 'main.scene.json'),
          filePath: saveRes.sceneVirtualPath,
          sceneUuid: saveRes.sceneUuid,
          savedAt: new Date().toISOString(),
          projectContext: globalProjectManager.activeProjectContext,
        });
        return;
      }

      const safeName = String(fileName || 'default_level.scene').replace(/[^a-zA-Z0-9_.-]/g, '') || 'default_level.scene';
      const normalizedName =
        safeName.endsWith('.scene.json') || safeName.endsWith('.scene')
          ? safeName
          : `${safeName}.scene`;
      const targetPath = path.join(SCENES_DIR, normalizedName);

      const tempPhysics = new PhysicsServer();
      const manager = new EditorSceneManager({ physicsServer: tempPhysics });

      const rootNodeData =
        Array.isArray(sceneData.rootNodes) && sceneData.rootNodes.length > 0 && !sceneData.type
          ? sceneData.rootNodes[0]
          : sceneData;
      const rootNode = NodeFactory.createFromData(rootNodeData, { physicsServer: tempPhysics });
      const result = manager.saveScene(rootNode, targetPath);
      const bodyCount = tempPhysics.getBodyCount();
      tempPhysics.clear();

      res.json({
        status: 'ATOMIC_COMMIT_OK',
        fileName: normalizedName,
        filePath: result.filePath,
        tempFilePath: result.tempFilePath,
        bytesWritten: result.bytesWritten,
        registeredPhysicsBodies: bodyCount,
        savedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/scene/reset-default - Regenerates the default .scene file on disk
  app.post('/api/scene/reset-default', (_req, res) => {
    try {
      if (fs.existsSync(DEFAULT_SCENE_FILE)) {
        fs.unlinkSync(DEFAULT_SCENE_FILE);
      }
      ensureDefaultSceneOnDisk();
      const tempPhysics = new PhysicsServer();
      const manager = new EditorSceneManager({ physicsServer: tempPhysics });
      const rootNode = manager.loadScene(DEFAULT_SCENE_FILE, { clearPhysicsBeforeLoad: true });
      const serialized = rootNode.serialize();
      tempPhysics.clear();

      res.json({
        fileName: 'default_level.scene',
        sceneData: serialized,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/engine/validate - Runs the Node.js architecture validation suite
  app.get('/api/engine/validate', (_req, res) => {
    try {
      const report = runArchitectureValidation();
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ status: 'FAILED', error: err.message });
    }
  });

  // ============================================================================
  // INTEGRATED SCRIPT EDITOR & MAIN SCENE ROUTES
  // ============================================================================

  // POST /api/projects/set-main-scene - Updates main_scene in maxros.project.json
  app.post('/api/projects/set-main-scene', (req, res) => {
    try {
      const active = globalProjectManager.activeProjectContext;
      if (!active || !active.projectPath) {
        res.status(400).json({ success: false, error: 'Nenhum projeto ativo.' });
        return;
      }
      const { sceneUuid, scenePath } = req.body || {};
      const manifestPath = path.join(active.projectPath, 'maxros.project.json');
      if (!fs.existsSync(manifestPath)) {
        res.status(404).json({ success: false, error: 'Manifesto maxros.project.json não encontrado.' });
        return;
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.main_scene = sceneUuid || scenePath || manifest.main_scene;
      manifest.main_scene_path = scenePath || manifest.main_scene_path || 'scenes/main.scene.json';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
      const reopened = globalProjectManager.openProject(active.projectPath, { recordInRecent: false });
      res.json({
        success: true,
        mainSceneUuid: manifest.main_scene,
        mainScenePath: manifest.main_scene_path,
        projectContext: reopened.projectContext,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Helper to resolve the active project's root and scripts directory
  const resolveProjectScriptsContext = () => {
    const active = globalProjectManager.activeProjectContext;
    const projectRoot = active?.projectPath || path.resolve(process.cwd(), 'projects', 'meu-jogo-3d');
    const scriptsDir = path.join(projectRoot, 'scripts');
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }
    return { projectRoot, scriptsDir };
  };

  // GET /api/scripts/list - Lists all .js / .script.js files and folders inside project://scripts
  app.get('/api/scripts/list', (_req, res) => {
    try {
      const { projectRoot, scriptsDir } = resolveProjectScriptsContext();
      const registry = new ResourceUUIDRegistry(projectRoot);
      registry.scanProject({ autoRegisterUntracked: true });

      const folders: string[] = ['scripts'];
      const files: Array<{
        uuid: string;
        fileName: string;
        relativePath: string;
        projectUri: string;
        sourceCode: string;
        updatedAt: string;
        mtimeMs: number;
      }> = [];

      const walkScripts = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          const rel = path.relative(projectRoot, full).split(path.sep).join('/');
          if (entry.isDirectory()) {
            folders.push(rel);
            walkScripts(full);
          } else if (
            (entry.name.endsWith('.js') || entry.name.endsWith('.script.js')) &&
            !entry.name.endsWith('.uuid')
          ) {
            const stat = fs.statSync(full);
            const uuid = registry.ensureResourceUuid(rel) || '';
            const sourceCode = fs.readFileSync(full, 'utf8');
            files.push({
              uuid,
              fileName: entry.name,
              relativePath: rel,
              projectUri: `project://${rel}`,
              sourceCode,
              updatedAt: stat.mtime.toISOString(),
              mtimeMs: stat.mtimeMs,
            });
          }
        }
      };

      walkScripts(scriptsDir);
      res.json({ folders, files });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/scripts/save - Creates or saves a .js / .script.js file with external conflict check
  app.post('/api/scripts/save', (req, res) => {
    try {
      const { relativePath, sourceCode, expectedMtimeMs, forceOverwrite } = req.body || {};
      const { projectRoot } = resolveProjectScriptsContext();
      let cleanRel = String(relativePath || 'scripts/NewNode.js')
        .replace(/^project:\/\//, '')
        .replace(/^\/+/, '')
        .replace(/\.\./g, '');
      if (!cleanRel.startsWith('scripts/')) {
        cleanRel = `scripts/${cleanRel}`;
      }
      if (!cleanRel.endsWith('.js')) {
        cleanRel = `${cleanRel}.js`;
      }

      const fullPath = path.join(projectRoot, cleanRel);
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      if (fs.existsSync(fullPath) && expectedMtimeMs && !forceOverwrite) {
        const currentStat = fs.statSync(fullPath);
        if (Math.abs(currentStat.mtimeMs - Number(expectedMtimeMs)) > 1500) {
          const diskCode = fs.readFileSync(fullPath, 'utf8');
          if (diskCode !== String(sourceCode ?? '')) {
            res.status(409).json({
              conflict: true,
              error: 'O arquivo foi modificado externamente em disco.',
              diskSourceCode: diskCode,
              diskMtimeMs: currentStat.mtimeMs,
            });
            return;
          }
        }
      }

      fs.writeFileSync(fullPath, String(sourceCode ?? ''), 'utf8');
      const registry = new ResourceUUIDRegistry(projectRoot);
      const uuid = registry.ensureResourceUuid(cleanRel) || '';
      const stat = fs.statSync(fullPath);

      res.json({
        success: true,
        uuid,
        fileName: path.basename(cleanRel),
        relativePath: cleanRel,
        projectUri: `project://${cleanRel}`,
        updatedAt: stat.mtime.toISOString(),
        mtimeMs: stat.mtimeMs,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/scripts/create-folder - Creates a folder inside project://scripts
  app.post('/api/scripts/create-folder', (req, res) => {
    try {
      const { folderPath } = req.body || {};
      const { projectRoot } = resolveProjectScriptsContext();
      let cleanRel = String(folderPath || 'scripts/nova-pasta')
        .replace(/^project:\/\//, '')
        .replace(/^\/+/, '')
        .replace(/\.\./g, '');
      if (!cleanRel.startsWith('scripts/')) {
        cleanRel = `scripts/${cleanRel}`;
      }
      const fullDir = path.join(projectRoot, cleanRel);
      fs.mkdirSync(fullDir, { recursive: true });
      res.json({ success: true, folderPath: cleanRel });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/scripts/rename - Renames or moves a script while preserving its .uuid and node references
  app.post('/api/scripts/rename', (req, res) => {
    try {
      const { oldRelativePath, newRelativePath } = req.body || {};
      const { projectRoot } = resolveProjectScriptsContext();
      const oldClean = String(oldRelativePath || '').replace(/^project:\/\//, '').replace(/^\/+/, '');
      let newClean = String(newRelativePath || '').replace(/^project:\/\//, '').replace(/^\/+/, '');
      if (!newClean.startsWith('scripts/')) {
        newClean = `scripts/${newClean}`;
      }
      if (!newClean.endsWith('.js')) {
        newClean = `${newClean}.js`;
      }

      const registry = new ResourceUUIDRegistry(projectRoot);
      const moveRes = registry.moveOrRenameResource(oldClean, newClean);
      if (!moveRes.success) {
        res.status(400).json(moveRes);
        return;
      }

      res.json({
        success: true,
        uuid: moveRes.uuid,
        oldRelativePath: oldClean,
        newRelativePath: newClean,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/scripts/delete - Checks scene dependencies before deleting a script file
  app.post('/api/scripts/delete', (req, res) => {
    try {
      const { relativePath, uuid, force } = req.body || {};
      const { projectRoot } = resolveProjectScriptsContext();
      const cleanRel = String(relativePath || '').replace(/^project:\/\//, '').replace(/^\/+/, '');
      const fullPath = path.join(projectRoot, cleanRel);

      if (!fs.existsSync(fullPath)) {
        res.status(404).json({ success: false, error: 'Arquivo de script não encontrado.' });
        return;
      }

      // Check if any scene in project://scenes references this script UUID or path
      const scenesDir = path.join(projectRoot, 'scenes');
      const dependentNodes: Array<{ sceneFile: string; nodeName: string }> = [];
      if (fs.existsSync(scenesDir)) {
        const sceneFiles = fs
          .readdirSync(scenesDir)
          .filter((f) => f.endsWith('.scene.json') || f.endsWith('.scene'));
        for (const sf of sceneFiles) {
          try {
            const raw = JSON.parse(fs.readFileSync(path.join(scenesDir, sf), 'utf8'));
            const visit = (n: any) => {
              if (!n || typeof n !== 'object') return;
              if (
                (uuid && n.script?.uuid === uuid) ||
                (cleanRel && n.script?.path && String(n.script.path).includes(cleanRel))
              ) {
                dependentNodes.push({ sceneFile: sf, nodeName: n.name || n.type || 'Node' });
              }
              if (Array.isArray(n.children)) n.children.forEach(visit);
            };
            visit(raw);
          } catch (_) {
            // ignore malformed
          }
        }
      }

      if (dependentNodes.length > 0 && !force) {
        res.json({
          success: false,
          requiresConfirmation: true,
          dependentNodes,
          message: `O script "${cleanRel}" está associado a ${dependentNodes.length} Node(s). Confirme para excluir.`,
        });
        return;
      }

      fs.unlinkSync(fullPath);
      const sidecar = `${fullPath}.uuid`;
      if (fs.existsSync(sidecar)) {
        fs.unlinkSync(sidecar);
      }

      res.json({ success: true, deletedPath: cleanRel });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Maxros Engine Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
