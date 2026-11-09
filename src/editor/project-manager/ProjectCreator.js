import fs from 'node:fs';
import path from 'node:path';
import {
  MAXROS_INSTALLATION_ROOT,
  DEFAULT_PROJECTS_DIR,
} from './ProjectPathResolver.js';
import {
  ResourceUUIDRegistry,
  generateUUID,
} from './ResourceUUIDRegistry.js';
import {
  CURRENT_ENGINE_NAME,
  CURRENT_ENGINE_VERSION,
  PROJECT_MANIFEST_FILENAME,
} from './ProjectValidator.js';
import {
  EngineNode,
  Camera3D,
  DirectionalLight3D,
  AmbientLight3D,
  Mesh3D,
  RigidBody3DNode,
  CollisionShape3DNode,
  createGeometricMiniGameScene,
} from '../../engine/index.js';
import { PhysicsServer } from '../../engine/physics/PhysicsServer.js';

export const MAXROS_ENGINE_VERSION = CURRENT_ENGINE_VERSION;

/**
 * Runtime-only dependency graph starting from the engine runtime entry point.
 * Editor-only helpers (`EditorGuides.js`), editor disk managers (`EditorSceneManager.js`),
 * test suites (`validate.js`), and demos (`GeometricMiniGame.js`) are strictly excluded from `core/`.
 */
const RUNTIME_GRAPH_MODULES = [
  {
    id: 'native/NativeClasses.js',
    sourceRel: 'src/engine/core/NativeClasses.js',
    targetRel: 'core/native/NativeClasses.js',
    rewriteImports: (code) => code,
  },
  {
    id: 'engine/SceneTree.js',
    sourceRel: 'src/engine/core/SceneTree.js',
    targetRel: 'core/engine/SceneTree.js',
    rewriteImports: (code) =>
      code.replace(/from\s+['"]\.\/NativeClasses\.js['"]/g, "from '../native/NativeClasses.js'"),
  },
  {
    id: 'engine/PhysicsServer.js',
    sourceRel: 'src/engine/physics/PhysicsServer.js',
    targetRel: 'core/engine/PhysicsServer.js',
    rewriteImports: (code) => code,
  },
  {
    id: 'engine/EngineNode.js',
    sourceRel: 'src/engine/nodes/EngineNode.js',
    targetRel: 'core/engine/EngineNode.js',
    rewriteImports: (code) =>
      code.replace(
        /from\s+['"]\.\.\/core\/NativeClasses\.js['"]/g,
        "from '../native/NativeClasses.js'"
      ),
  },
  {
    id: 'engine/CollisionShape3DNode.js',
    sourceRel: 'src/engine/nodes/CollisionShape3DNode.js',
    targetRel: 'core/engine/CollisionShape3DNode.js',
    rewriteImports: (code) => code,
  },
  {
    id: 'engine/RigidBody3DNode.js',
    sourceRel: 'src/engine/nodes/RigidBody3DNode.js',
    targetRel: 'core/engine/RigidBody3DNode.js',
    rewriteImports: (code) =>
      code.replace(
        /from\s+['"]\.\.\/physics\/PhysicsServer\.js['"]/g,
        "from './PhysicsServer.js'"
      ),
  },
  {
    id: 'engine/Sprite3DNode.js',
    sourceRel: 'src/engine/nodes/Sprite3DNode.js',
    targetRel: 'core/engine/Sprite3DNode.js',
    rewriteImports: (code) => code,
  },
  {
    id: 'engine/SceneNodes.js',
    sourceRel: 'src/engine/nodes/SceneNodes.js',
    targetRel: 'core/engine/SceneNodes.js',
    rewriteImports: (code) =>
      code.replace(
        /from\s+['"]\.\.\/core\/NativeClasses\.js['"]/g,
        "from '../native/NativeClasses.js'"
      ),
  },
  {
    id: 'engine/NodeFactory.js',
    sourceRel: 'src/engine/serialization/NodeFactory.js',
    targetRel: 'core/engine/NodeFactory.js',
    rewriteImports: (code) =>
      code
        .replace(/from\s+['"]\.\.\/nodes\//g, "from './")
        .replace(
          /from\s+['"]\.\.\/physics\/PhysicsServer\.js['"]/g,
          "from './PhysicsServer.js'"
        ),
  },
];

/**
 * ProjectCreator handles transactional creation of Maxros Engine projects,
 * provisioning the dependency-graph-based runtime in `core/` (including `package.json`
 * and `package-lock.json`), generating initial scenes/resources with `.uuid` sidecars,
 * and writing `maxros.project.json` with `"main_scene": { "uuid": "..." }`.
 */
export class ProjectCreator {
  /**
   * Converts a human-readable project name into a clean folder slug.
   * Example: "A Lenda dos Cristais" -> "a-lenda-dos-cristais"
   *
   * @param {string} projectName
   * @returns {string}
   */
  static suggestFolderName(projectName) {
    const cleaned = String(projectName || 'novo-projeto')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return cleaned || 'novo-projeto';
  }

  /**
   * Provisions or updates the `core/` directory inside a project root using the
   * runtime dependency graph and generates `core/runtime/package.json` + `core/runtime/package-lock.json`.
   *
   * @param {string} projectRoot
   * @param {{ engineVersion?: string }} [options={}]
   */
  static provisionProjectCoreRuntime(projectRoot, options = {}) {
    const engineVersion = options.engineVersion || CURRENT_ENGINE_VERSION;
    const coreDir = path.join(projectRoot, 'core');
    const engineDir = path.join(coreDir, 'engine');
    const nativeDir = path.join(coreDir, 'native');
    const runtimeDir = path.join(coreDir, 'runtime');

    fs.mkdirSync(engineDir, { recursive: true });
    fs.mkdirSync(nativeDir, { recursive: true });
    fs.mkdirSync(runtimeDir, { recursive: true });

    let totalBytes = 0;
    const graphManifest = [];

    for (const mod of RUNTIME_GRAPH_MODULES) {
      const srcAbs = path.join(MAXROS_INSTALLATION_ROOT, mod.sourceRel);
      const dstAbs = path.join(projectRoot, mod.targetRel);
      const rawSource = fs.readFileSync(srcAbs, 'utf8');
      const transformed = mod.rewriteImports(rawSource);
      fs.writeFileSync(dstAbs, transformed, 'utf8');
      const size = Buffer.byteLength(transformed, 'utf8');
      totalBytes += size;
      graphManifest.push({
        module: mod.id,
        bytes: size,
      });
    }

    // Write `core/engine/index.js` barrel entrypoint for the project runtime
    const engineIndexCode = [
      "export * from '../native/NativeClasses.js';",
      "export * from './SceneTree.js';",
      "export * from './EngineNode.js';",
      "export * from './Sprite3DNode.js';",
      "export * from './RigidBody3DNode.js';",
      "export * from './CollisionShape3DNode.js';",
      "export * from './SceneNodes.js';",
      "export * from './PhysicsServer.js';",
      "export * from './NodeFactory.js';",
      '',
    ].join('\n');
    fs.writeFileSync(path.join(engineDir, 'index.js'), engineIndexCode, 'utf8');
    totalBytes += Buffer.byteLength(engineIndexCode, 'utf8');

    // Read exact versions of `three` and `cannon-es` from root package.json
    let threeVersion = '0.187.0';
    let cannonVersion = '0.20.0';
    try {
      const rootPkg = JSON.parse(
        fs.readFileSync(path.join(MAXROS_INSTALLATION_ROOT, 'package.json'), 'utf8')
      );
      if (rootPkg?.dependencies?.three) {
        threeVersion = String(rootPkg.dependencies.three).replace(/^[\^~]/, '');
      }
      if (rootPkg?.dependencies?.['cannon-es']) {
        cannonVersion = String(rootPkg.dependencies['cannon-es']).replace(/^[\^~]/, '');
      }
    } catch {
      // Keep default pinned versions
    }

    // Write `core/runtime/package.json`
    const runtimePkg = {
      name: 'maxros-project-runtime',
      private: true,
      version: engineVersion,
      description: 'Standalone reproducible runtime for Maxros Engine project',
      type: 'module',
      main: './runtime.js',
      dependencies: {
        three: threeVersion,
        'cannon-es': cannonVersion,
      },
    };
    const runtimePkgStr = JSON.stringify(runtimePkg, null, 2);
    fs.writeFileSync(path.join(runtimeDir, 'package.json'), runtimePkgStr, 'utf8');
    totalBytes += Buffer.byteLength(runtimePkgStr, 'utf8');

    // Write `core/runtime/package-lock.json` (Refinement #5: lockfile preserving direct & transitive runtime deps)
    const runtimeLock = {
      name: 'maxros-project-runtime',
      version: engineVersion,
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name: 'maxros-project-runtime',
          version: engineVersion,
          dependencies: {
            three: threeVersion,
            'cannon-es': cannonVersion,
          },
        },
        'node_modules/three': {
          version: threeVersion,
          resolved: `https://registry.npmjs.org/three/-/three-${threeVersion}.tgz`,
          license: 'MIT',
        },
        'node_modules/cannon-es': {
          version: cannonVersion,
          resolved: `https://registry.npmjs.org/cannon-es/-/cannon-es-${cannonVersion}.tgz`,
          license: 'MIT',
        },
      },
    };
    const runtimeLockStr = JSON.stringify(runtimeLock, null, 2);
    fs.writeFileSync(path.join(runtimeDir, 'package-lock.json'), runtimeLockStr, 'utf8');
    totalBytes += Buffer.byteLength(runtimeLockStr, 'utf8');

    // Write `core/runtime/runtime.js` bootstrapper
    const runtimeBootstrapCode = [
      "import * as Engine from '../engine/index.js';",
      '',
      'export function createProjectRuntime(sceneData) {',
      '  const physics = Engine.PhysicsServer.getInstance();',
      '  physics.clear();',
      '  const root = Engine.NodeFactory.createFromData(sceneData, { physicsServer: physics });',
      '  const tree = new Engine.SceneTree(root);',
      '  tree.setNodeFactory(Engine.NodeFactory);',
      '  return { root, tree, physics, Engine };',
      '}',
      '',
      'export { Engine };',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(runtimeDir, 'runtime.js'), runtimeBootstrapCode, 'utf8');
    totalBytes += Buffer.byteLength(runtimeBootstrapCode, 'utf8');

    // Write `core/version.json`
    const versionMetadata = {
      engine: CURRENT_ENGINE_NAME,
      engine_version: engineVersion,
      project_version: 1,
      provisionedAt: new Date().toISOString(),
      totalRuntimeBytes: totalBytes,
      externalDependencies: {
        three: threeVersion,
        'cannon-es': cannonVersion,
      },
      dependencyGraph: graphManifest,
    };
    fs.writeFileSync(
      path.join(coreDir, 'version.json'),
      JSON.stringify(versionMetadata, null, 2),
      'utf8'
    );

    return versionMetadata;
  }

  /**
   * Ensures `.maxros/` auxiliary directories exist inside `projectRoot`.
   *
   * @param {string} projectRoot
   */
  static ensureDotMaxrosStructure(projectRoot) {
    const dotMaxros = path.join(projectRoot, '.maxros');
    const subdirs = ['cache', 'imports', 'thumbnails', 'metadata', 'editor'];
    for (const sub of subdirs) {
      fs.mkdirSync(path.join(dotMaxros, sub), { recursive: true });
    }
    return dotMaxros;
  }

  /**
   * Builds the serialized scene data for one of the 3 initial templates:
   * - `'standard_3d'` (default): Camera3D, DirectionalLight3D, AmbientLight3D, and a simple ground floor.
   * - `'empty'`: Clean root node only.
   * - `'geometric_demo'`: Independent copy of the Geometric Mini-Game scene.
   *
   * @param {'standard_3d' | 'empty' | 'geometric_demo'} template
   * @param {{ scriptUuid?: string, materialUuid?: string }} [refs={}]
   */
  static buildInitialSceneData(template = 'standard_3d', refs = {}) {
    const tempPhysics = new PhysicsServer();
    let root;

    if (template === 'empty') {
      root = new EngineNode('Node3D');
      root.nodeType = 'Node3D';
    } else if (template === 'geometric_demo') {
      root = createGeometricMiniGameScene();
      const playerCore = root.getNodeOrNull('%PlayerCore') || root.getNodeByName('PlayerCore');
      if (playerCore && refs.scriptUuid) {
        playerCore.scriptRef = { uuid: refs.scriptUuid };
        if (playerCore.scripts && playerCore.scripts.length > 0) {
          playerCore.scripts[0].uuid = refs.scriptUuid;
        }
      }
      const floorNode = root.getNodeByName('PlataformaOctogonal');
      if (floorNode && refs.materialUuid) {
        floorNode.materialRef = { uuid: refs.materialUuid };
      }
    } else {
      // 'standard_3d' (Default): Node3D root + Camera + Light + Simple Ground Plane
      root = new EngineNode('Node3D');
      root.nodeType = 'Node3D';

      const cam = new Camera3D('MainCamera', {
        current: true,
        projection: 'perspective',
        fov: 55,
        near: 0.1,
        far: 200,
      });
      cam.uniqueName = true;
      cam.position = { x: 0, y: 5.5, z: 10.5 };
      cam.setRotationDegrees({ x: -25, y: 0, z: 0 });
      root.add(cam);

      const sun = new DirectionalLight3D('DirectionalSunLight', {
        color: '#f8fafc',
        intensity: 1.5,
        castShadow: true,
      });
      sun.position = { x: 6, y: 12, z: 6 };
      root.add(sun);

      const ambient = new AmbientLight3D('AmbientFillLight', {
        color: '#94a3b8',
        intensity: 0.5,
      });
      root.add(ambient);

      const groundBody = new RigidBody3DNode({
        name: 'GroundFloor',
        mass: 0,
        bodyType: 'static',
        physicsServer: tempPhysics,
      });
      groundBody.position = { x: 0, y: -0.25, z: 0 };
      groundBody.add(
        new CollisionShape3DNode({
          name: 'GroundCollider',
          shapeType: 'Box',
          size: { x: 14, y: 0.5, z: 14 },
        })
      );
      const groundVisual = new Mesh3D('GroundMesh', {
        shape: 'box',
        shapeParams: { width: 14, height: 0.5, depth: 14 },
        color: '#334155',
        roughness: 0.7,
        metalness: 0.2,
      });
      if (refs.materialUuid) {
        groundVisual.materialRef = { uuid: refs.materialUuid };
      }
      if (refs.scriptUuid) {
        groundVisual.scriptRef = { uuid: refs.scriptUuid };
      }
      groundBody.add(groundVisual);
      root.add(groundBody);
    }

    const serialized = root.serialize();
    tempPhysics.clear();
    return {
      engine: CURRENT_ENGINE_NAME,
      version: '1.0',
      name: root.name || 'Node3D',
      environment: root.environment || null,
      rootNodes: [serialized],
    };
  }

  /**
   * Transactionally creates a new Maxros Engine project on disk.
   * If any step fails, cleans up the staging directory so no partial/corrupted project remains.
   *
   * @param {object} options
   * @param {string} options.name - Display name of the project (independent of folder name)
   * @param {string} [options.folderName] - Physical folder name (auto-suggested if omitted)
   * @param {string} [options.baseDir] - Parent directory (defaults to DEFAULT_PROJECTS_DIR)
   * @param {'standard_3d' | 'empty' | 'geometric_demo'} [options.template='standard_3d']
   * @param {'user' | 'demo'} [options.type='user']
   * @param {boolean} [options.overwriteIfExists=false]
   */
  static createProject(options) {
    const projectName = String(options?.name || '').trim();
    if (!projectName) {
      return {
        success: false,
        error: 'O nome do projeto é obrigatório.',
      };
    }

    const folderName = ProjectCreator.suggestFolderName(options?.folderName || projectName);
    const rawBaseDir = options?.baseDir ? String(options.baseDir).trim() : '';
    const baseDir =
      !rawBaseDir || rawBaseDir === './projects' || rawBaseDir === 'projects'
        ? DEFAULT_PROJECTS_DIR
        : path.resolve(rawBaseDir);

    const finalProjectPath = path.join(baseDir, folderName);
    if (fs.existsSync(finalProjectPath) && !options?.overwriteIfExists) {
      return {
        success: false,
        error: `A pasta de destino "${finalProjectPath}" já existe. Escolha outro nome de pasta ou diretório.`,
      };
    }

    const template =
      options?.template === 'empty' || options?.template === 'geometric_demo'
        ? options.template
        : 'standard_3d';
    const projectType = options?.type === 'demo' ? 'demo' : 'user';

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const stagingId = generateUUID().slice(0, 8);
    const stagingPath = path.join(baseDir, `.creating_${folderName}_${stagingId}`);

    try {
      fs.mkdirSync(stagingPath, { recursive: true });

      // 1. Create standard project directories
      const folders = {
        core: 'core',
        scenes: 'scenes',
        scripts: 'scripts',
        assets: 'assets',
        resources: 'resources',
      };

      for (const dirName of Object.values(folders)) {
        fs.mkdirSync(path.join(stagingPath, dirName), { recursive: true });
      }
      fs.mkdirSync(path.join(stagingPath, 'assets', 'textures'), { recursive: true });

      // 2. Provision `.maxros/` auxiliary directories (no `.uuid` sidecars!)
      ProjectCreator.ensureDotMaxrosStructure(stagingPath);

      // 3. Provision reproducible `core/` runtime (no `.uuid` sidecars!)
      const coreVersionInfo = ProjectCreator.provisionProjectCoreRuntime(stagingPath);

      // 4. Initialize ResourceUUIDRegistry on staging directory
      const registry = new ResourceUUIDRegistry(stagingPath);

      // 5. Create initial `.script.js`, `.material.json`, `.input.json` resources with `.uuid` sidecars
      let scriptRecord = null;
      let materialRecord = null;

      if (template !== 'empty') {
        const scriptFileName =
          template === 'geometric_demo' ? 'scripts/player_controller.script.js' : 'scripts/main.script.js';
        const scriptSource =
          template === 'geometric_demo'
            ? [
                '// Maxros Engine - Script de Controle do Guardião Geométrico (.script.js)',
                'export default {',
                '  onReady(node) {',
                '    node.defineSignal("crystalCollected");',
                '  },',
                '  onProcess(dt, node) {',
                '    node.rotation.y += dt * 1.5;',
                '  }',
                '};',
                '',
              ].join('\n')
            : [
                '// Maxros Engine - Script Inicial do Projeto (.script.js)',
                'export default {',
                '  onReady(node) {',
                '    // Inicialização do nó',
                '  },',
                '  onProcess(dt, node) {',
                '    // Atualização por frame',
                '  }',
                '};',
                '',
              ].join('\n');

        scriptRecord = registry.createResourceFile(scriptFileName, scriptSource);
      }

      const materialPayload = {
        name: template === 'geometric_demo' ? 'ArenaOctogonalMaterial' : 'DefaultGroundMaterial',
        type: 'standard',
        color: template === 'geometric_demo' ? '#1e293b' : '#334155',
        roughness: 0.65,
        metalness: 0.25,
      };
      materialRecord = registry.createResourceFile(
        'resources/default_floor.material.json',
        JSON.stringify(materialPayload, null, 2)
      );

      const inputPayload = {
        actions: {
          move_left: ['KeyA', 'ArrowLeft'],
          move_right: ['KeyD', 'ArrowRight'],
          move_up: ['KeyW', 'ArrowUp'],
          move_down: ['KeyS', 'ArrowDown'],
          action: ['Space', 'Enter'],
        },
      };
      registry.createResourceFile(
        'resources/default.input.json',
        JSON.stringify(inputPayload, null, 2)
      );

      // 6. Build initial `scenes/main.scene.json` referencing resources by UUID and generate `main.scene.json.uuid`
      const initialSceneData = ProjectCreator.buildInitialSceneData(template, {
        scriptUuid: scriptRecord?.uuid,
        materialUuid: materialRecord?.uuid,
      });

      const mainSceneRecord = registry.createResourceFile(
        'scenes/main.scene.json',
        JSON.stringify(initialSceneData, null, 2)
      );

      // 7. Create `maxros.project.json` referencing `main_scene` by UUID (Refinement #3)
      // Note: `maxros.project.json` does NOT receive a `.uuid` sidecar (Refinement #1)
      const projectUuid = generateUUID();
      const projectManifest = {
        uuid: projectUuid,
        engine: CURRENT_ENGINE_NAME,
        engine_version: coreVersionInfo.engine_version,
        project_version: 1,
        name: projectName,
        type: projectType,
        template,
        main_scene: {
          uuid: mainSceneRecord.uuid,
        },
        folders,
        trust_policy: {
          origin: projectType === 'demo' ? 'official_demo' : 'local_user',
          trusted: true,
        },
        created_at: new Date().toISOString(),
      };

      fs.writeFileSync(
        path.join(stagingPath, PROJECT_MANIFEST_FILENAME),
        JSON.stringify(projectManifest, null, 2),
        'utf8'
      );

      // Save final registry snapshot in `.maxros/metadata/uuid_registry.json`
      registry.saveSnapshot();

      // 8. Commit transactionally: replace target directory if overwriteIfExists, then rename staging -> final
      if (fs.existsSync(finalProjectPath) && options?.overwriteIfExists) {
        fs.rmSync(finalProjectPath, { recursive: true, force: true });
      }
      fs.renameSync(stagingPath, finalProjectPath);

      return {
        success: true,
        projectUuid,
        projectName,
        folderName,
        projectPath: finalProjectPath,
        manifestPath: path.join(finalProjectPath, PROJECT_MANIFEST_FILENAME),
        manifest: projectManifest,
        mainSceneUuid: mainSceneRecord.uuid,
        mainSceneRelativePath: mainSceneRecord.relativePath,
        engineVersion: coreVersionInfo.engine_version,
      };
    } catch (error) {
      // Full transactional rollback: clean up staging directory
      if (fs.existsSync(stagingPath)) {
        try {
          fs.rmSync(stagingPath, { recursive: true, force: true });
        } catch {
          // Ignore cleanup error
        }
      }
      return {
        success: false,
        error: `Falha transacional ao criar projeto "${projectName}": ${error.message}`,
      };
    }
  }
}
