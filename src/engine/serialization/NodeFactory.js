import * as THREE from 'three';
import { EngineNode, Node, Node3D } from '../nodes/EngineNode.js';
import { Sprite3DNode } from '../nodes/Sprite3DNode.js';
import { RigidBody3DNode } from '../nodes/RigidBody3DNode.js';
import { CollisionShape3DNode } from '../nodes/CollisionShape3DNode.js';
import {
  Camera3D,
  Light3D,
  DirectionalLight3D,
  PointLight3D,
  SpotLight3D,
  AmbientLight3D,
  HemisphereLight3D,
  Mesh3D,
  Label3D,
  Particles3D,
  Path3D,
  PathFollow3D,
  PickArea3D,
  Timer,
  AudioPlayer,
  AnimationPlayer,
  UILayer,
  Control,
  Panel,
  Label,
  Button,
  CheckBox,
  Slider,
  ProgressBar,
  TextureRect,
  TextInput,
  HBox,
  VBox,
  Grid,
  ScrollContainer
} from '../nodes/SceneNodes.js';
import { PhysicsServer } from '../physics/PhysicsServer.js';
import { ScriptClassLoader } from '../scripting/ScriptClassLoader.js';
import { SceneTree } from '../core/SceneTree.js';

/**
 * Registry of supported EngineNode / Node / Node3D classes keyed by their `type` string.
 * Designed to be extensible via `NodeFactory.registerNodeType()` and resilient
 * against unknown or corrupted node types when loading `.scene` files.
 */
export class NodeFactory {
  /** @type {Map<string, Record<string, any>>} */
  static _sceneTemplates = new Map();

  /** @type {Map<string, typeof EngineNode>} */
  static _registry = new Map([
    // Base & Legacy Aliases
    ['EngineNode', EngineNode],
    ['Node', Node],
    ['Node3D', Node3D],
    ['Sprite3DNode', Sprite3DNode],
    ['Sprite3D', Sprite3DNode],
    ['RigidBody3DNode', RigidBody3DNode],
    ['RigidBody3D', RigidBody3DNode],
    ['CollisionShape3DNode', CollisionShape3DNode],
    ['CollisionShape3D', CollisionShape3DNode],

    // 3D Scene Nodes (Section 7)
    ['Camera3D', Camera3D],
    ['Camera3DNode', Camera3D],
    ['Light3D', Light3D],
    ['DirectionalLight3D', DirectionalLight3D],
    ['PointLight3D', PointLight3D],
    ['SpotLight3D', SpotLight3D],
    ['AmbientLight3D', AmbientLight3D],
    ['HemisphereLight3D', HemisphereLight3D],
    ['Mesh3D', Mesh3D],
    ['Label3D', Label3D],
    ['Particles3D', Particles3D],
    ['Path3D', Path3D],
    ['PathFollow3D', PathFollow3D],
    ['PickArea3D', PickArea3D],

    // Time, Audio & Animation (Sections 9, 10, 11)
    ['Timer', Timer],
    ['AudioPlayer', AudioPlayer],
    ['AnimationPlayer', AnimationPlayer],

    // UI Nodes (Section 12)
    ['UILayer', UILayer],
    ['Control', Control],
    ['Panel', Panel],
    ['Label', Label],
    ['Button', Button],
    ['CheckBox', CheckBox],
    ['Slider', Slider],
    ['ProgressBar', ProgressBar],
    ['TextureRect', TextureRect],
    ['TextInput', TextInput],
    ['HBox', HBox],
    ['VBox', VBox],
    ['Grid', Grid],
    ['ScrollContainer', ScrollContainer],
  ]);

  /**
   * Registers a new node class in the factory for future extensibility.
   * @param {string} typeName
   * @param {typeof EngineNode} NodeClass
   */
  static registerNodeType(typeName, NodeClass) {
    if (!typeName || typeof typeName !== 'string') {
      throw new Error('NodeFactory.registerNodeType requires a non-empty string typeName');
    }
    if (typeof NodeClass !== 'function') {
      throw new Error(`NodeFactory.registerNodeType requires a constructor for "${typeName}"`);
    }
    NodeFactory._registry.set(typeName, NodeClass);
  }

  /**
   * Registers a serialized scene template by UUID and/or path so child scene instances
   * (`sceneInstance`) can resolve their internal hierarchy automatically.
   *
   * @param {{ uuid?: string, path?: string, sceneData: Record<string, any> }} params
   */
  static registerSceneTemplate({ uuid, path: scenePath, sceneData }) {
    if (!sceneData || typeof sceneData !== 'object') return;
    const cloned = JSON.parse(JSON.stringify(sceneData));
    if (uuid) {
      NodeFactory._sceneTemplates.set(uuid, cloned);
    }
    if (scenePath) {
      NodeFactory._sceneTemplates.set(scenePath, cloned);
      const clean = String(scenePath).replace(/^project:\/\//, '').replace(/^\/+/, '');
      NodeFactory._sceneTemplates.set(clean, cloned);
    }
  }

  /**
   * Looks up a registered scene template by `{ sourceSceneUuid, sourceScenePath }` or string key.
   * @param {any} refOrKey
   */
  static getSceneTemplate(refOrKey) {
    if (!refOrKey) return null;
    if (typeof refOrKey === 'string') {
      const clean = refOrKey.replace(/^project:\/\//, '').replace(/^\/+/, '');
      return (
        NodeFactory._sceneTemplates.get(refOrKey) ||
        NodeFactory._sceneTemplates.get(clean) ||
        null
      );
    }
    if (typeof refOrKey === 'object') {
      const uuid = refOrKey.sourceSceneUuid || refOrKey.uuid;
      const p = refOrKey.sourceScenePath || refOrKey.path;
      if (uuid && NodeFactory._sceneTemplates.has(uuid)) {
        return NodeFactory._sceneTemplates.get(uuid);
      }
      if (p) {
        const clean = String(p).replace(/^project:\/\//, '').replace(/^\/+/, '');
        if (NodeFactory._sceneTemplates.has(p)) return NodeFactory._sceneTemplates.get(p);
        if (NodeFactory._sceneTemplates.has(clean)) return NodeFactory._sceneTemplates.get(clean);
      }
    }
    return null;
  }

  /**
   * Instantiates an existing Scene (`.scene.json`) as an encapsulated Child Scene Node inside a parent scene.
   *
   * - Creates a completely independent deep instance with fresh UUIDs for all internal nodes so
   *   multiple instances (`Guard_A`, `Guard_B`) never share mutable runtime references.
   * - Marks internal children with `userData.ownedBySceneInstance = instanceRoot.uuid` so the Editor
   *   hierarchy tree displays the instance as a single encapsulated node with the Clapperboard icon (`🎬`).
   * - Applies `localOverrides` (`name`, `position`, `rotation`, `scale`, `editorVisible`, etc.) without
   *   mutating the source scene data.
   *
   * @param {Record<string, any>} sourceSceneData
   * @param {object} [options={}]
   * @param {string} [options.sourceSceneUuid='']
   * @param {string} [options.sourceScenePath='']
   * @param {string} [options.instanceName]
   * @param {string} [options.instanceUuid]
   * @param {Record<string, any>} [options.localOverrides={}]
   * @param {PhysicsServer} [options.physicsServer]
   * @returns {EngineNode}
   */
  static instantiateChildScene(sourceSceneData, options = {}) {
    if (!sourceSceneData || typeof sourceSceneData !== 'object') {
      throw new Error('NodeFactory.instantiateChildScene requires valid sourceSceneData');
    }

    const {
      sourceSceneUuid = sourceSceneData.sceneUuid || sourceSceneData.uuid || '',
      sourceScenePath = sourceSceneData.scenePath || '',
      instanceName,
      instanceUuid,
      localOverrides = {},
      physicsServer = PhysicsServer.getInstance(),
    } = options;

    if (sourceSceneUuid || sourceScenePath) {
      NodeFactory.registerSceneTemplate({
        uuid: sourceSceneUuid,
        path: sourceScenePath,
        sceneData: sourceSceneData,
      });
    }

    // Clone the entire source scene hierarchy with fresh UUIDs so every instance is 100% isolated in Runtime
    const clonedData = NodeFactory.cloneSerializedSubtreeWithNewUuids(sourceSceneData, {
      nameSuffix: '',
      positionOffset: { x: 0, y: 0, z: 0 },
    });

    if (instanceUuid) {
      clonedData.uuid = instanceUuid;
    }

    const instanceRoot = NodeFactory.createFromData(clonedData, {
      physicsServer,
      _ignoreSceneInstanceHydration: true,
    });

    // Mark all internal descendants as owned by this child scene instance
    const markOwnedDescendants = (parentNode) => {
      for (const ch of parentNode.children) {
        if (ch instanceof EngineNode) {
          ch.userData.ownedBySceneInstance = instanceRoot.uuid;
          markOwnedDescendants(ch);
        }
      }
    };
    markOwnedDescendants(instanceRoot);

    const effectiveOverrides = {
      ...(localOverrides || {}),
      ...(instanceName ? { name: instanceName } : {}),
    };

    instanceRoot.sceneInstance = {
      sourceSceneUuid,
      sourceScenePath,
      localOverrides: JSON.parse(JSON.stringify(effectiveOverrides)),
    };

    NodeFactory.applyLocalOverridesToInstance(instanceRoot, effectiveOverrides);
    return instanceRoot;
  }

  /**
   * Applies `localOverrides` from a parent scene onto a Child Scene instance (`Outside-In` encapsulation).
   * @param {EngineNode} instanceRoot
   * @param {Record<string, any>} overrides
   */
  static applyLocalOverridesToInstance(instanceRoot, overrides = {}) {
    if (!instanceRoot || !overrides || typeof overrides !== 'object') return;

    if (typeof overrides.name === 'string' && overrides.name.trim()) {
      instanceRoot.name = overrides.name.trim();
    }
    if (typeof overrides.editorVisible === 'boolean') {
      instanceRoot.setEditorVisible(overrides.editorVisible);
    }
    if (overrides.position && typeof overrides.position === 'object') {
      instanceRoot.position = {
        x: Number(overrides.position.x ?? instanceRoot.position.x),
        y: Number(overrides.position.y ?? instanceRoot.position.y),
        z: Number(overrides.position.z ?? instanceRoot.position.z),
      };
    }
    if (overrides.rotation && typeof overrides.rotation === 'object') {
      instanceRoot.rotation.set(
        Number(overrides.rotation.x ?? instanceRoot.rotation.x),
        Number(overrides.rotation.y ?? instanceRoot.rotation.y),
        Number(overrides.rotation.z ?? instanceRoot.rotation.z),
        overrides.rotation.order || instanceRoot.rotation.order
      );
    }
    if (overrides.scale && typeof overrides.scale === 'object') {
      instanceRoot.scale.set(
        Number(overrides.scale.x ?? instanceRoot.scale.x),
        Number(overrides.scale.y ?? instanceRoot.scale.y),
        Number(overrides.scale.z ?? instanceRoot.scale.z)
      );
    }
    if (overrides.physics && typeof overrides.physics === 'object') {
      instanceRoot.enablePhysics(
        overrides.physics.physicsMode || instanceRoot.physicsMode || 'dynamic',
        overrides.physics
      );
    }
    if (overrides.properties && typeof overrides.properties === 'object') {
      for (const [k, v] of Object.entries(overrides.properties)) {
        instanceRoot[k] = v;
      }
    }
    instanceRoot.updateMatrix();
    instanceRoot.updateMatrixWorld(true);
  }

  /**
   * Propagates structural changes from a saved Source Scene (`Inside-Out`) to all matching Child Scene
   * instances inside `parentRootNode`, while strictly preserving each instance's `uuid` and `localOverrides`.
   *
   * @param {EngineNode} parentRootNode
   * @param {string} sourceUuidOrPath
   * @param {Record<string, any>} updatedSourceSceneData
   * @param {object} [options={}]
   * @returns {number} Count of updated instances
   */
  static reconcileSceneInstances(parentRootNode, sourceUuidOrPath, updatedSourceSceneData, options = {}) {
    if (!parentRootNode || !updatedSourceSceneData) return 0;
    const { physicsServer = PhysicsServer.getInstance() } = options;

    const cleanTarget = String(sourceUuidOrPath || '').replace(/^project:\/\//, '').replace(/^\/+/, '');
    NodeFactory.registerSceneTemplate({
      uuid: updatedSourceSceneData.sceneUuid || updatedSourceSceneData.uuid || cleanTarget,
      path: cleanTarget,
      sceneData: updatedSourceSceneData,
    });

    let updatedCount = 0;

    const visit = (node) => {
      if (!node || !(node instanceof EngineNode)) return;

      if (node.sceneInstance) {
        const instUuid = node.sceneInstance.sourceSceneUuid || '';
        const instPath = String(node.sceneInstance.sourceScenePath || '')
          .replace(/^project:\/\//, '')
          .replace(/^\/+/, '');

        if (
          (cleanTarget && (instUuid === cleanTarget || instPath === cleanTarget)) ||
          (updatedSourceSceneData.uuid && instUuid === updatedSourceSceneData.uuid)
        ) {
          // Capture current local overrides before rebuilding internal hierarchy
          const preservedOverrides = {
            ...(node.sceneInstance.localOverrides || {}),
            name: node.name,
            editorVisible: node.editorVisible,
            position: {
              x: node.position.x,
              y: node.position.y,
              z: node.position.z,
            },
            rotation: {
              x: node.rotation.x,
              y: node.rotation.y,
              z: node.rotation.z,
              order: node.rotation.order,
            },
            scale: {
              x: node.scale.x,
              y: node.scale.y,
              z: node.scale.z,
            },
          };

          // Remove old internal children owned by this scene instance
          for (const ch of [...node.children]) {
            if (ch instanceof EngineNode) {
              ch.destroy();
            }
          }

          // Re-instantiate fresh internal children from updatedSourceSceneData
          const freshTemplate = NodeFactory.cloneSerializedSubtreeWithNewUuids(updatedSourceSceneData, {
            nameSuffix: '',
            positionOffset: { x: 0, y: 0, z: 0 },
          });

          // Apply updated root properties (such as newly attached script on the source root)
          if (freshTemplate.script) {
            node.scriptRef = { ...freshTemplate.script };
            ScriptClassLoader.applyScriptClassToNode(node, node.scriptRef);
          }

          if (Array.isArray(freshTemplate.children)) {
            for (const childData of freshTemplate.children) {
              const childNode = NodeFactory.createFromData(childData, {
                physicsServer,
                _isRoot: false,
              });
              const markDesc = (n) => {
                n.userData.ownedBySceneInstance = node.uuid;
                for (const c of n.children) {
                  if (c instanceof EngineNode) markDesc(c);
                }
              };
              markDesc(childNode);
              node.add(childNode);
            }
          }

          node.sceneInstance.localOverrides = preservedOverrides;
          NodeFactory.applyLocalOverridesToInstance(node, preservedOverrides);
          updatedCount++;
          return;
        }
      }

      for (const ch of [...node.getChildren()]) {
        visit(ch);
      }
    };

    visit(parentRootNode);
    return updatedCount;
  }

  /**
   * Recursively searches for an active `Camera3D` across the scene and any instantiated child scenes.
   * @param {EngineNode} rootNode
   */
  static findActiveCameraRecursively(rootNode) {
    return SceneTree.findActiveCamera(rootNode);
  }

  /**
   * Validates a parsed `.scene` JSON structure before instantiation.
   * Returns a normalized structure and a list of non-fatal warnings.
   *
   * @param {any} rawData
   * @returns {{ valid: boolean, warnings: string[], sanitizedData: Record<string, any> | null }}
   */
  static validateSceneData(rawData) {
    const warnings = [];
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      return {
        valid: false,
        warnings: ['O conteúdo do arquivo .scene.json / .scene não é um objeto JSON válido na raiz.'],
        sanitizedData: null,
      };
    }

    const effectiveRoot =
      !rawData.type && Array.isArray(rawData.rootNodes) && rawData.rootNodes.length > 0
        ? {
            ...rawData.rootNodes[0],
            environment: rawData.rootNodes[0]?.environment || rawData.environment,
          }
        : rawData;

    const inspectNode = (nodeObj, pathStr) => {
      if (!nodeObj || typeof nodeObj !== 'object') {
        warnings.push(`Nó inválido em ${pathStr}: substituído por EngineNode vazio.`);
        return { type: 'EngineNode', name: 'RecoveredNode', children: [] };
      }

      const typeStr = typeof nodeObj.type === 'string' ? nodeObj.type : 'EngineNode';
      if (!NodeFactory._registry.has(typeStr)) {
        warnings.push(
          `Tipo de nó desconhecido "${typeStr}" em ${pathStr} ("${nodeObj.name || 'sem_nome'}"): carregado com fallback seguro para EngineNode.`
        );
      }

      const safeChildren = [];
      if (Array.isArray(nodeObj.children)) {
        nodeObj.children.forEach((child, idx) => {
          safeChildren.push(inspectNode(child, `${pathStr}.children[${idx}]`));
        });
      }

      return {
        ...nodeObj,
        type: typeStr,
        children: safeChildren,
      };
    };

    const sanitizedData = inspectNode(effectiveRoot, 'root');
    return {
      valid: true,
      warnings,
      sanitizedData,
    };
  }

  /**
   * Deep-clones a serialized node subtree and assigns fresh Three.js UUIDs to every node
   * in the hierarchy so duplicating (`Ctrl+D`) or pasting (`Ctrl+V`) never causes UUID collisions.
   *
   * @param {Record<string, any>} serializedNode
   * @param {object} [options={}]
   * @returns {Record<string, any>}
   */
  static cloneSerializedSubtreeWithNewUuids(serializedNode, options = {}) {
    const {
      nameSuffix = '_Copia',
      positionOffset = { x: 0.6, y: 0, z: 0.6 },
      _isRoot = true,
    } = options;

    const cloned = JSON.parse(JSON.stringify(serializedNode));

    const assignNewUuids = (nodeData, isTop) => {
      nodeData.uuid = THREE.MathUtils.generateUUID();
      if (isTop && nameSuffix) {
        nodeData.name = `${nodeData.name || nodeData.type}${nameSuffix}`;
        if (nodeData.position && positionOffset) {
          nodeData.position.x = Number(nodeData.position.x || 0) + (positionOffset.x || 0);
          nodeData.position.y = Number(nodeData.position.y || 0) + (positionOffset.y || 0);
          nodeData.position.z = Number(nodeData.position.z || 0) + (positionOffset.z || 0);
        }
      }
      if (Array.isArray(nodeData.components)) {
        nodeData.components.forEach((comp, idx) => {
          comp.id = `comp_${idx}_${THREE.MathUtils.generateUUID().slice(0, 8)}`;
        });
      }
      if (Array.isArray(nodeData.children)) {
        nodeData.children.forEach((child) => assignNewUuids(child, false));
      }
    };

    assignNewUuids(cloned, _isRoot);
    return cloned;
  }

  /**
   * Alias conveniente para createFromData.
   */
  static deserialize(data, options = {}) {
    return NodeFactory.createFromData(data, options);
  }

  /**
   * Reconstructs an entire hierarchy of EngineNodes from a parsed JSON object.
   *
   * @param {Record<string, any>} rawData - Parsed JSON node or scene container data.
   * @param {object} [options={}]
   * @returns {EngineNode}
   */
  static createFromData(rawData, options = {}) {
    if (!rawData || typeof rawData !== 'object') {
      throw new Error('NodeFactory.createFromData requires a valid parsed JSON object');
    }

    const data =
      !rawData.type && Array.isArray(rawData.rootNodes) && rawData.rootNodes.length > 0
        ? {
            ...rawData.rootNodes[0],
            environment: rawData.rootNodes[0]?.environment || rawData.environment,
          }
        : rawData;

    const {
      physicsServer = PhysicsServer.getInstance(),
      strict = false,
      warnings = [],
      _isRoot = true,
      _ignoreSceneInstanceHydration = false,
    } = options;

    // If this node is a serialized Child Scene Instance (`data.sceneInstance`) and a template is registered,
    // hydrate its internal hierarchy from the template and apply `localOverrides`
    if (data.sceneInstance && !_ignoreSceneInstanceHydration) {
      const template = NodeFactory.getSceneTemplate(data.sceneInstance);
      if (template) {
        return NodeFactory.instantiateChildScene(template, {
          sourceSceneUuid: data.sceneInstance.sourceSceneUuid,
          sourceScenePath: data.sceneInstance.sourceScenePath,
          instanceName: data.name,
          instanceUuid: data.uuid,
          localOverrides: {
            position: data.position,
            rotation: data.rotation,
            scale: data.scale,
            editorVisible: data.editorVisible,
            ...(data.sceneInstance.localOverrides || {}),
          },
          physicsServer,
        });
      }
    }

    const nodeType = data.type || 'EngineNode';
    let NodeClass = NodeFactory._registry.get(nodeType);
    let isUnknownFallback = false;

    if (!NodeClass) {
      if (strict) {
        throw new Error(
          `NodeFactory: Unknown node type "${nodeType}". Registered types: ${[
            ...NodeFactory._registry.keys(),
          ].join(', ')}`
        );
      }
      warnings.push(
        `Tipo de nó desconhecido "${nodeType}" ("${data.name || 'Node'}"): convertido para EngineNode preservando atributos.`
      );
      NodeClass = EngineNode;
      isUnknownFallback = true;
    }

    /** @type {EngineNode} */
    let node;
    if (NodeClass === RigidBody3DNode) {
      node = new RigidBody3DNode({
        name: data.name || 'RigidBody3DNode',
        physicsServer,
        autoRegister: false,
      });
    } else {
      node = new NodeClass({ name: data.name || nodeType });
    }

    if (isUnknownFallback) {
      const { children: _c, ...restAttributes } = data;
      node.userData.originalUnknownType = nodeType;
      node.userData.unknownNodeAttributes = restAttributes;
    }

    node.deserialize(data);

    // If the node has an associated JavaScript class (`data.script` / `node.scriptRef`) registered in ScriptClassLoader,
    // specialize the node directly into that extended class!
    if (node.scriptRef && (node.scriptRef.uuid || node.scriptRef.path)) {
      const descriptor = ScriptClassLoader.getScriptDescriptor(node.scriptRef);
      if (descriptor) {
        ScriptClassLoader.applyScriptClassToNode(node, descriptor);
      }
    }

    if (Array.isArray(data.children)) {
      for (const childData of data.children) {
        if (!childData || typeof childData !== 'object') continue;
        const childNode = NodeFactory.createFromData(childData, {
          physicsServer,
          strict,
          warnings,
          _isRoot: false,
        });
        node.add(childNode);
      }
    }

    if (_isRoot) {
      node.updateMatrixWorld(true);
      NodeFactory._finalizePhysicsSubtree(node, physicsServer);
    }

    return node;
  }

  /**
   * @param {EngineNode} currentNode
   * @param {PhysicsServer} physicsServer
   */
  static _finalizePhysicsSubtree(currentNode, physicsServer) {
    if (currentNode instanceof RigidBody3DNode) {
      currentNode.rebuildShapesFromChildren();
      currentNode.syncTransformToBody();
      currentNode.body.force.set(0, 0, 0);
      currentNode.body.torque.set(0, 0, 0);
      if (physicsServer) {
        physicsServer.registerBody(currentNode);
      }
    }

    for (const child of currentNode.children) {
      if (child instanceof EngineNode) {
        NodeFactory._finalizePhysicsSubtree(child, physicsServer);
      }
    }
  }
}
