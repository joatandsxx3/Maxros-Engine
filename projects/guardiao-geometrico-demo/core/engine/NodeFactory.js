import * as THREE from 'three';
import { EngineNode, Node, Node3D } from './EngineNode.js';
import { Sprite3DNode } from './Sprite3DNode.js';
import { RigidBody3DNode } from './RigidBody3DNode.js';
import { CollisionShape3DNode } from './CollisionShape3DNode.js';
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
} from './SceneNodes.js';
import { PhysicsServer } from './PhysicsServer.js';

/**
 * Registry of supported EngineNode / Node / Node3D classes keyed by their `type` string.
 * Designed to be extensible via `NodeFactory.registerNodeType()` and resilient
 * against unknown or corrupted node types when loading `.scene` files.
 */
export class NodeFactory {
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
    } = options;

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
