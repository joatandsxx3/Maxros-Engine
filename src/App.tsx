import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  EngineNode,
  Node,
  Node3D,
  DEFAULT_SCENE_ENVIRONMENT,
  normalizeSceneEnvironment,
  Camera3D,
  DirectionalLight3D,
  PointLight3D,
  Sprite3DNode,
  RigidBody3DNode,
  CollisionShape3DNode,
  Mesh3D,
  Particles3D,
  Path3D,
  Timer,
  AnimationPlayer,
  UILayer,
  Label,
  Button,
  ProgressBar,
  SceneTree,
  Input,
  Tween,
  Shake,
  Log,
  PhysicsServer,
  NodeFactory,
  ScriptClassLoader,
  EXTENDABLE_NODE_CLASSES,
  generateMinimalNodeScriptTemplate,
  toValidClassName,
  createEditorGuidesGroup,
  setEditorAxisGuidesVisibility,
  pickSelectableNodeFromIntersects,
  createCameraNodeVisualHelper,
  createCameraFrustumHelper,
  syncCameraFrustumHelper,
  computeEditorCameraPresetPose,
  createGeometricMiniGameScene,
} from './engine/index.js';
import {
  Play,
  Pause,
  Square,
  StepForward,
  Move,
  RotateCw,
  Maximize2,
  Link2,
  Unlink2,
  Plus,
  Box,
  Circle,
  Image as ImageIcon,
  FolderPlus,
  Trash2,
  Save,
  FolderOpen,
  Code2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Layers,
  Sliders,
  Undo2,
  Redo2,
  Magnet,
  Globe,
  Compass,
  Copy,
  Focus,
  Camera,
  Sparkles,
  CheckCircle2,
  Package,
  Cpu,
  FlaskConical,
  Gamepad2,
  X,
  AlertTriangle,
  ArrowLeft,
  Shield,
  Clapperboard,
  ScrollText,
  MousePointer,
  Grid,
  MoreVertical,
  Monitor,
  Settings,
  Search,
  Pipette,
  Folder,
  List,
  LayoutGrid,
  FilePlus,
  Upload,
  Download,
  Sun,
  Lightbulb,
} from 'lucide-react';
import {
  ProjectManagerScreen,
  ProjectManagerOverview,
} from './components/ProjectManagerScreen';
import {
  ScriptsEditorWorkspace,
  ScriptFileEntry,
  OpenScriptTab,
} from './components/ScriptsEditorWorkspace';

type GizmoMode = 'select' | 'translate' | 'rotate' | 'scale';
type GizmoSpaceMode = 'auto' | 'local' | 'world';
type SimState = 'stopped' | 'playing' | 'paused';
type EditorCamPreset = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';

interface NodeComponentData {
  id: string;
  type: 'Rotator' | 'Oscillator' | 'Thruster';
  enabled: boolean;
  params: Record<string, any>;
}

interface FlatNodeItem {
  uuid: string;
  name: string;
  type: string;
  uniqueName?: boolean;
  groups?: string[];
  scriptsCount?: number;
  scriptCode?: string;
  scriptRef?: {
    uuid: string;
    path?: string | null;
    className?: string | null;
    extendsClass?: string | null;
  } | null;
  sceneInstance?: {
    sourceSceneUuid: string | null;
    sourceScenePath: string | null;
    localOverrides: Record<string, any>;
  } | null;
  depth: number;
  parentUuid: string | null;
  parentName: string | null;
  isTopLevelParent: boolean;
  editorVisible: boolean;
  editorLocked: boolean;
  components: NodeComponentData[];
  autoPosition: { x: number; y: number; z: number };
  rotationDeg: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  // Native Unified Physics Properties (on every EngineNode)
  physicsMode: 'none' | 'dynamic' | 'static' | 'kinematic';
  mass: number;
  useGravity: boolean;
  gravityY: number;
  restitution: number;
  friction: number;
  linearDamping: number;
  floorY: number | null;
  useFloorContact: boolean;
  fixedRotation?: boolean;
  bodyType?: 'dynamic' | 'kinematic' | 'static';
  shapeType?: 'Box' | 'Sphere' | 'Cylinder' | 'Trimesh';
  trimeshSourceShape?: string;
  colliderHeight?: number;
  dimensions?: { x: number; y: number; z: number };
  radius?: number;
  renderMode?: 'sprite' | 'plane';
  width?: number;
  height?: number;
  color?: string;
  texturePath?: string | null;
  meshShape?: string;
  meshColor?: string;
  meshWireframe?: boolean;
  cameraCurrent?: boolean;
  cameraProjection?: 'perspective' | 'orthographic';
  cameraFov?: number;
  cameraAspect?: number;
  cameraSize?: number;
  cameraNear?: number;
  cameraFar?: number;
  animCurrent?: string;
  animClips?: string[];
  uiText?: string;
  uiValue?: number;
}

interface OpenSceneTab {
  id: string;
  name: string;
  filePath: string;
  sceneUuid: string | null;
  isChildScene?: boolean;
  isDirty: boolean;
  sceneData: Record<string, any> | null;
}

interface HudOverlayState {
  visible: boolean;
  titleText: string;
  scoreText: string;
  stateText: string;
  energyValue: number;
  playerTagText: string;
  playerTagScreen: { x: number; y: number; visible: boolean };
}

interface HistoryEntry {
  label: string;
  sceneData: Record<string, any>;
  selectedUuids: string[];
}

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
const AUTOSAVE_STORAGE_KEY = 'maxros_engine_autosave_scene_v1';

const PRE_EXISTING_NODE_TYPES = [
  {
    id: 'Node3D',
    label: 'Node3D',
    desc: 'Nó espacial 3D (Transformação X, Y, Z)',
    badge: '3D',
    color: 'text-rose-400',
  },
  {
    id: 'Mesh3D',
    label: 'Mesh3D',
    desc: 'Modelo / Malha Geométrica 3D',
    badge: 'Malha 3D',
    color: 'text-emerald-400',
  },
  {
    id: 'CollisionShape3D',
    label: 'CollisionShape3D',
    desc: 'Colisão 3D (Box, Sphere, Cylinder, Trimesh)',
    badge: 'Colisão',
    color: 'text-sky-400',
  },
  {
    id: 'Camera3D',
    label: 'Camera3D',
    desc: 'Câmera 3D com Frustum e Preview PiP',
    badge: 'Câmera',
    color: 'text-amber-400',
  },
  {
    id: 'DirectionalLight3D',
    label: 'DirectionalLight3D',
    desc: 'Luz Direcional / Sol 3D',
    badge: 'Luz',
    color: 'text-yellow-300',
  },
  {
    id: 'PointLight3D',
    label: 'PointLight3D',
    desc: 'Luz Pontual Omnidirecional 3D',
    badge: 'Luz',
    color: 'text-orange-300',
  },
  {
    id: 'Sprite3D',
    label: 'Sprite3D',
    desc: 'Sprite / Decalque de Textura 3D',
    badge: 'Visual',
    color: 'text-pink-400',
  },
  {
    id: 'Particles3D',
    label: 'Particles3D',
    desc: 'Emissor de Partículas 3D',
    badge: 'VFX',
    color: 'text-purple-400',
  },
  {
    id: 'Path3D',
    label: 'Path3D',
    desc: 'Curva / Trilha Espacial 3D',
    badge: 'Curva',
    color: 'text-indigo-400',
  },
  {
    id: 'UILayer',
    label: 'UILayer',
    desc: 'Camada de Interface 2D / HUD',
    badge: 'UI 2D',
    color: 'text-teal-300',
  },
  {
    id: 'AnimationPlayer',
    label: 'AnimationPlayer',
    desc: 'Controlador de Clipes de Animação',
    badge: 'Anim',
    color: 'text-rose-400',
  },
  {
    id: 'Timer',
    label: 'Timer',
    desc: 'Temporizador e Eventos por Segundo',
    badge: 'Lógica',
    color: 'text-slate-300',
  },
  {
    id: 'Node',
    label: 'Node',
    desc: 'Nó Base Neutro (Agrupador / Script)',
    badge: 'Base',
    color: 'text-slate-400',
  },
] as const;

const ASSET_PREFABS = [
  {
    id: 'prefab_crate',
    name: 'Caixote Industrial.glb',
    category: 'Modelos',
    badge: 'Box + Física',
    accent: '#f59e0b',
  },
  {
    id: 'prefab_sphere',
    name: 'Esfera Cinética.glb',
    category: 'Modelos',
    badge: 'Sphere + Glow',
    accent: '#94a3b8',
  },
  {
    id: 'prefab_ramp',
    name: 'Rampa Deflexão.glb',
    category: 'Modelos',
    badge: 'Static Box',
    accent: '#64748b',
  },
  {
    id: 'prefab_spinner',
    name: 'Rotor Mecânico.glb',
    category: 'Modelos',
    badge: 'Kinematic + Rotator',
    accent: '#cbd5e1',
  },
  {
    id: 'prefab_bouncer',
    name: 'Cápsula Propulsora.glb',
    category: 'Modelos',
    badge: 'Dynamic + Thruster',
    accent: '#a855f7',
  },
];

const ASSET_TEXTURES = [
  {
    id: 'tex_crate',
    name: 'Madeira Cargo.png',
    path: 'assets/textures/crate_cargo.png',
    color: '#b45309',
  },
  {
    id: 'tex_hazard',
    name: 'Listras Hazard.png',
    path: 'assets/textures/hazard_stripes.png',
    color: '#eab308',
  },
  {
    id: 'tex_metal',
    name: 'Grade Metálica.png',
    path: 'assets/textures/metal_steel.png',
    color: '#475569',
  },
  {
    id: 'tex_neon',
    name: 'Núcleo Neon.png',
    path: 'assets/textures/neon_core.png',
    color: '#22c55e',
  },
];

const BUILTIN_CHILD_SCENES = [
  {
    uuid: 'scene-child-turret-guard-0001',
    name: 'Torreta Guardiã (Cena Filha)',
    path: 'scenes/turret_guard.scene.json',
    buildTemplate: () => {
      const root = new Node3D('TurretGuard');
      root.enablePhysics('dynamic', { mass: 2.5, restitution: 0.25, floorY: 0.5 });
      const baseMesh = new Mesh3D('TurretBaseMesh', {
        shape: 'cylinder',
        color: '#f59e0b',
        roughness: 0.3,
        metalness: 0.6,
      });
      const headMesh = new Mesh3D('TurretCannonMesh', {
        shape: 'octahedron',
        color: '#38bdf8',
        roughness: 0.2,
        metalness: 0.5,
      });
      headMesh.position = { x: 0, y: 0.85, z: 0 };
      const col = new CollisionShape3DNode('TurretCollider', {
        shapeType: 'Box',
        size: { x: 1.1, y: 1.6, z: 1.1 },
      });
      root.add(baseMesh, headMesh, col);
      return root.serialize();
    },
  },
  {
    uuid: 'scene-child-crystal-node-0002',
    name: 'Cristal Energético (Cena Filha)',
    path: 'scenes/energy_crystal.scene.json',
    buildTemplate: () => {
      const root = new Node3D('EnergyCrystal');
      root.components.push({
        id: 'comp_rot_crystal',
        type: 'Rotator',
        enabled: true,
        params: { speedX: 0, speedY: 95, speedZ: 0 },
      });
      const crystalMesh = new Mesh3D('CrystalCoreMesh', {
        shape: 'octahedron',
        color: '#10b981',
        roughness: 0.15,
        metalness: 0.4,
      });
      const col = new CollisionShape3DNode('CrystalCollider', {
        shapeType: 'Sphere',
        radius: 0.65,
      });
      root.add(crystalMesh, col);
      return root.serialize();
    },
  },
];

function roundNum(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(val) || 0) * factor) / factor;
}

/**
 * Decorates EngineNode instances with non-EngineNode Three.js visual helpers
 * (PBR meshes for CollisionShape3DNode, Trimesh 3D model wireframes, selection outlines)
 * while preserving native visuals of Mesh3D, Light3D, and Particles3D.
 */
function attachViewportVisualsToTree(
  root: EngineNode,
  showWireframes: boolean,
  selectedUuidSet: Set<string>
) {
  const selectedNodes: EngineNode[] = [];

  const traverseEngineNodes = (node: EngineNode) => {
    node.visible = node.editorVisible !== false;
    if (selectedUuidSet.has(node.uuid)) {
      selectedNodes.push(node);
    }

    const existingHelper = node.children.find((c) => c.userData?.isColliderHelper);
    if (existingHelper) {
      THREE.Object3D.prototype.remove.call(node, existingHelper);
    }

    const isNodeSelected =
      selectedUuidSet.has(node.uuid) ||
      Boolean(node.parent && selectedUuidSet.has(node.parent.uuid));

    if (node instanceof CollisionShape3DNode) {
      const parentBody = node.parent instanceof RigidBody3DNode ? node.parent : null;
      const hasMeshParent = node.parent instanceof Mesh3D;
      const isStatic =
        parentBody?.bodyType === 'static' || node.parent?.physicsMode === 'static';
      const isKinematic =
        parentBody?.bodyType === 'kinematic' || node.parent?.physicsMode === 'kinematic';

      const helperGroup = new THREE.Group();
      helperGroup.name = `${node.name}__ViewportHelper`;
      helperGroup.userData = {
        isViewportHelper: true,
        isColliderHelper: true,
        ownerUuid: node.uuid,
      };

      const baseColor = isStatic ? 0x1e293b : isKinematic ? 0x7c3aed : 0x3b82f6;
      const trimColor = isStatic ? 0x334155 : isKinematic ? 0xa855f7 : 0x60a5fa;
      const wireColor = isNodeSelected ? 0xfacc15 : isStatic ? 0x64748b : 0x22d3ee;

      if (node.shapeType === 'Trimesh') {
        const trimeshGeo = node.buildTrimeshThreeGeometry();

        if (!hasMeshParent) {
          const hullMat = new THREE.MeshStandardMaterial({
            color: 0x06b6d4,
            roughness: 0.3,
            metalness: 0.4,
            transparent: true,
            opacity: 0.32,
            emissive: isNodeSelected ? new THREE.Color(0x0891b2) : new THREE.Color(0x000000),
            emissiveIntensity: isNodeSelected ? 0.5 : 0,
          });
          const hullMesh = new THREE.Mesh(trimeshGeo.clone(), hullMat);
          hullMesh.userData = { ownerNode: parentBody || node, exactNode: node };
          helperGroup.add(hullMesh);
        }

        const wireGeo = new THREE.WireframeGeometry(trimeshGeo);
        const wireMat = new THREE.LineBasicMaterial({
          color: isNodeSelected ? 0xfacc15 : 0x22d3ee,
          transparent: true,
          opacity: isNodeSelected ? 1.0 : showWireframes ? 0.92 : 0.0,
        });
        const wireSegments = new THREE.LineSegments(wireGeo, wireMat);
        wireSegments.scale.set(1.012, 1.012, 1.012);
        wireSegments.userData = { isColliderWireframe: true };
        helperGroup.add(wireSegments);
      } else if (node.shapeType === 'Cylinder') {
        const r = Math.max(0.05, node.radius);
        const h = Math.max(0.05, node.height || 1.0);
        const cylGeo = new THREE.CylinderGeometry(r, r, h, 24);

        if (!hasMeshParent) {
          const cylMat = new THREE.MeshStandardMaterial({
            color: 0x0ea5e9,
            roughness: 0.28,
            metalness: 0.35,
            emissive: isNodeSelected ? new THREE.Color(0x0369a1) : new THREE.Color(0x000000),
            emissiveIntensity: isNodeSelected ? 0.45 : 0,
          });
          const cylMesh = new THREE.Mesh(cylGeo, cylMat);
          cylMesh.castShadow = true;
          cylMesh.receiveShadow = true;
          cylMesh.userData = { ownerNode: parentBody || node, exactNode: node };
          helperGroup.add(cylMesh);
        }

        const wireGeo = new THREE.EdgesGeometry(
          new THREE.CylinderGeometry(r * 1.015, r * 1.015, h * 1.015, 18)
        );
        const wireMat = new THREE.LineBasicMaterial({
          color: wireColor,
          transparent: true,
          opacity: isNodeSelected ? 0.98 : showWireframes ? 0.85 : 0.0,
        });
        const wireSegments = new THREE.LineSegments(wireGeo, wireMat);
        wireSegments.userData = { isColliderWireframe: true };
        helperGroup.add(wireSegments);
      } else if (node.shapeType === 'Sphere') {
        const r = Math.max(0.05, node.radius);
        if (!hasMeshParent) {
          const hullGeo = new THREE.SphereGeometry(r, 28, 20);
          const hullMat = new THREE.MeshStandardMaterial({
            color: 0x10b981,
            roughness: 0.25,
            metalness: 0.35,
            emissive: isNodeSelected ? new THREE.Color(0x065f46) : new THREE.Color(0x000000),
            emissiveIntensity: isNodeSelected ? 0.45 : 0,
          });
          const hullMesh = new THREE.Mesh(hullGeo, hullMat);
          hullMesh.castShadow = true;
          hullMesh.receiveShadow = true;
          hullMesh.userData = { ownerNode: parentBody || node, exactNode: node };
          helperGroup.add(hullMesh);

          const ringGeo = new THREE.TorusGeometry(r * 0.99, r * 0.045, 12, 32);
          const ringMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            roughness: 0.55,
            metalness: 0.8,
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.userData = { ownerNode: parentBody || node, exactNode: node };
          helperGroup.add(ringMesh);
        }

        const wireGeo = new THREE.EdgesGeometry(new THREE.SphereGeometry(r * 1.02, 14, 10));
        const wireMat = new THREE.LineBasicMaterial({
          color: wireColor,
          transparent: true,
          opacity: isNodeSelected ? 0.95 : showWireframes ? 0.8 : 0.0,
        });
        const wireSegments = new THREE.LineSegments(wireGeo, wireMat);
        wireSegments.userData = { isColliderWireframe: true };
        helperGroup.add(wireSegments);
      } else {
        const sx = Math.max(0.05, node.dimensions.x);
        const sy = Math.max(0.05, node.dimensions.y);
        const sz = Math.max(0.05, node.dimensions.z);

        if (!hasMeshParent) {
          const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
          const boxMat = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: isStatic ? 0.75 : 0.32,
            metalness: isStatic ? 0.15 : 0.45,
            emissive: isNodeSelected ? new THREE.Color(0x1e3a8a) : new THREE.Color(0x000000),
            emissiveIntensity: isNodeSelected ? 0.5 : 0,
          });
          const boxMesh = new THREE.Mesh(boxGeo, boxMat);
          boxMesh.castShadow = !isStatic;
          boxMesh.receiveShadow = true;
          boxMesh.userData = { ownerNode: parentBody || node, exactNode: node };
          helperGroup.add(boxMesh);

          if (!isStatic || sy < 0.8) {
            const innerGeo = new THREE.BoxGeometry(sx * 1.01, sy * 0.18, sz * 1.01);
            const innerMat = new THREE.MeshStandardMaterial({
              color: trimColor,
              roughness: 0.58,
              metalness: 0.7,
            });
            const bandMesh = new THREE.Mesh(innerGeo, innerMat);
            bandMesh.userData = { ownerNode: parentBody || node, exactNode: node };
            helperGroup.add(bandMesh);
          }
        }

        const edgesGeo = new THREE.EdgesGeometry(
          new THREE.BoxGeometry(sx * 1.012, sy * 1.012, sz * 1.012)
        );
        const edgesMat = new THREE.LineBasicMaterial({
          color: wireColor,
          transparent: true,
          opacity: isNodeSelected ? 0.98 : showWireframes ? 0.8 : 0.0,
        });
        const wireSegments = new THREE.LineSegments(edgesGeo, edgesMat);
        wireSegments.userData = { isColliderWireframe: true };
        helperGroup.add(wireSegments);
      }

      THREE.Object3D.prototype.add.call(node, helperGroup);
    } else if (node instanceof Camera3D) {
      const camHelperGroup = createCameraNodeVisualHelper(node, isNodeSelected);
      THREE.Object3D.prototype.add.call(node, camHelperGroup);
    } else if (
      (node.nodeType === 'EngineNode' || node.nodeType === 'Node' || node.nodeType === 'Node3D') &&
      node.parent
    ) {
      const anchorGroup = new THREE.Group();
      anchorGroup.name = `${node.name}__ViewportHelper`;
      anchorGroup.userData = {
        isViewportHelper: true,
        isColliderHelper: true,
        ownerUuid: node.uuid,
      };

      const coreGeo = new THREE.OctahedronGeometry(0.24, 0);
      const coreMat = new THREE.MeshStandardMaterial({
        color: isNodeSelected ? 0xfacc15 : 0xf59e0b,
        roughness: 0.3,
        metalness: 0.6,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.userData = { ownerNode: node, exactNode: node };
      anchorGroup.add(coreMesh);

      THREE.Object3D.prototype.add.call(node, anchorGroup);
    }

    for (const child of node.children) {
      if (child instanceof EngineNode) {
        traverseEngineNodes(child);
      }
    }
  };

  traverseEngineNodes(root);
  return selectedNodes;
}

/**
 * Flattens the EngineNode hierarchy for the Left Node Tree and computes the automatic Position
 * (Global if direct child of root, Local if child of another node).
 * Child Scene Instances (`node.sceneInstance`) appear encapsulated as a single item with a Clapperboard icon (`🎬`).
 */
function flattenEngineTree(
  node: EngineNode,
  sceneRoot: EngineNode,
  depth = 0,
  parentNode: EngineNode | null = null
): FlatNodeItem[] {
  const isTopLevelParent = !parentNode || parentNode === sceneRoot;
  const gp = node.position_global;

  const resolvedPos = isTopLevelParent
    ? { x: roundNum(gp.x), y: roundNum(gp.y), z: roundNum(gp.z) }
    : {
        x: roundNum(node.position.x),
        y: roundNum(node.position.y),
        z: roundNum(node.position.z),
      };

  const item: FlatNodeItem = {
    uuid: node.uuid,
    name: node.name,
    type: node.nodeType,
    uniqueName: Boolean(node.uniqueName),
    groups: Array.isArray(node.groups) ? [...node.groups] : [],
    scriptsCount: Array.isArray(node.scripts) ? node.scripts.length : 0,
    scriptCode:
      Array.isArray(node.scripts) && node.scripts.length > 0 ? node.scripts[0].code || '' : '',
    scriptRef: node.scriptRef ? { ...node.scriptRef } : null,
    sceneInstance: node.sceneInstance
      ? {
          sourceSceneUuid: node.sceneInstance.sourceSceneUuid,
          sourceScenePath: node.sceneInstance.sourceScenePath,
          localOverrides: { ...(node.sceneInstance.localOverrides || {}) },
        }
      : null,
    depth,
    parentUuid: parentNode ? parentNode.uuid : null,
    parentName: parentNode ? parentNode.name : null,
    isTopLevelParent,
    editorVisible: node.editorVisible !== false,
    editorLocked: Boolean(node.editorLocked),
    components: Array.isArray(node.components)
      ? node.components
          .filter((c: any) => c && c.type !== 'Physics')
          .map((c: any) => ({
            id: c.id,
            type: c.type,
            enabled: c.enabled !== false,
            params: { ...(c.params || {}) },
          }))
      : [],
    autoPosition: resolvedPos,
    rotationDeg: {
      x: roundNum(node.rotation.x * RAD2DEG, 1),
      y: roundNum(node.rotation.y * RAD2DEG, 1),
      z: roundNum(node.rotation.z * RAD2DEG, 1),
    },
    scale: {
      x: roundNum(node.scale.x, 2),
      y: roundNum(node.scale.y, 2),
      z: roundNum(node.scale.z, 2),
    },
    physicsMode: node.physicsMode || 'none',
    mass: roundNum(node.mass ?? 1.0, 2),
    useGravity: node.useGravity !== false,
    gravityY: roundNum(node.gravityY ?? -9.82, 2),
    restitution: roundNum(node.restitution ?? 0.35, 2),
    friction: roundNum(node.friction ?? 0.3, 2),
    linearDamping: roundNum(node.linearDamping ?? 0.02, 3),
    floorY: typeof node.floorY === 'number' ? roundNum(node.floorY, 2) : null,
    useFloorContact: node.useFloorContact !== false,
    fixedRotation: Boolean(node.fixedRotation),
  };

  if (node instanceof RigidBody3DNode) {
    item.mass = node.mass;
    item.bodyType = node.bodyType;
    item.linearDamping = roundNum(node.body.linearDamping, 3);
    item.fixedRotation = Boolean(node.body.fixedRotation);
  } else if (node instanceof CollisionShape3DNode) {
    item.shapeType = node.shapeType;
    item.trimeshSourceShape = node.trimeshSourceShape || 'auto';
    item.colliderHeight = roundNum(node.height || 1.0, 2);
    item.dimensions = {
      x: roundNum(node.dimensions.x, 2),
      y: roundNum(node.dimensions.y, 2),
      z: roundNum(node.dimensions.z, 2),
    };
    item.radius = roundNum(node.radius, 2);
  } else if (node instanceof Sprite3DNode) {
    item.renderMode = node.renderMode;
    item.width = roundNum(node.width, 2);
    item.height = roundNum(node.height, 2);
    item.color = `#${node.colorHex}`;
    item.texturePath = node.texturePath;
  } else if (node instanceof Mesh3D) {
    item.meshShape = node.shape;
    item.meshColor = node.color;
    item.meshWireframe = Boolean(node.material?.wireframe);
  } else if (node instanceof Camera3D) {
    item.cameraCurrent = Boolean(node.current);
    item.cameraProjection = node.projection === 'orthographic' ? 'orthographic' : 'perspective';
    item.cameraFov = roundNum(node.fov, 1);
    item.cameraAspect = roundNum(node.aspect ?? 1.7778, 2);
    item.cameraSize = roundNum(node.size, 2);
    item.cameraNear = roundNum(node.near, 2);
    item.cameraFar = roundNum(node.far, 1);
  } else if (node instanceof AnimationPlayer) {
    item.animCurrent = node.current || node.autoplay;
    item.animClips = Object.keys(node.clips || {});
  } else if (node instanceof Label) {
    item.uiText = node.text;
  } else if (node instanceof Button) {
    item.uiText = node.text;
  } else if (node instanceof ProgressBar) {
    item.uiValue = node.value;
  }

  const list: FlatNodeItem[] = [item];
  // Encapsulation rule: if this node is an instantiated Child Scene (`node.sceneInstance`),
  // its internal nodes are owned by the source scene and hidden in the parent hierarchy tree.
  if (!node.sceneInstance) {
    for (const child of node.children) {
      if (
        child instanceof EngineNode &&
        !child.userData?.isViewportHelper &&
        !child.userData?.ownedBySceneInstance
      ) {
        list.push(...flattenEngineTree(child, sceneRoot, depth + 1, node));
      }
    }
  }
  return list;
}

function findEngineNodeByUuid(root: EngineNode | null, uuid: string | null): EngineNode | null {
  if (!root || !uuid) return null;
  if (root.uuid === uuid) return root;
  for (const child of root.children) {
    if (child instanceof EngineNode) {
      const found = findEngineNodeByUuid(child, uuid);
      if (found) return found;
    }
  }
  return null;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRootRef = useRef<EngineNode | null>(null);
  const sceneTreeRef = useRef<SceneTree | null>(null);
  const threeSceneRef = useRef<THREE.Scene | null>(null);
  const editorGuidesRef = useRef<THREE.Group | null>(null);
  const perspCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const multiSelectionProxyRef = useRef<THREE.Object3D | null>(null);
  const relationshipLinesRef = useRef<THREE.LineSegments | null>(null);
  const cameraFrustumHelperRef = useRef<{
    helper: THREE.CameraHelper;
    virtualCamera: THREE.Camera;
    nodeUuid: string;
  } | null>(null);
  const cameraPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const navGizmoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const navGizmoHitRegionsRef = useRef<
    Array<{
      id: EditorCamPreset;
      x: number;
      y: number;
      r: number;
      label: string;
    }>
  >([]);
  const requestRenderRef = useRef<(() => void) | null>(null);

  // Camera Focus target interpolation state (Tecla F & 6 Axis Presets)
  const focusTransitionRef = useRef<{
    active: boolean;
    targetCenter: THREE.Vector3;
    targetCamPos: THREE.Vector3;
  }>({
    active: false,
    targetCenter: new THREE.Vector3(),
    targetCamPos: new THREE.Vector3(),
  });

  // Saved Editor Camera pose when switching to Play Camera
  const savedEditorCamRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  // Undo / Redo Command History Stacks & Clipboard
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const dragStartSnapshotRef = useRef<Record<string, any> | null>(null);
  const clipboardSubtreesRef = useRef<Record<string, any>[]>([]);
  const prePlaySnapshotRef = useRef<Record<string, any> | null>(null);

  // Multi-selection delta tracking when dragging the centroid gizmo
  const multiDragPrevPosRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // Mutable refs for event handlers inside WebGL context
  const simStateRef = useRef<SimState>('stopped');
  const showWireframesRef = useRef<boolean>(true);
  const selectedUuidsRef = useRef<string[]>([]);
  const isLinkingParentRef = useRef<boolean>(false);
  const snapEnabledRef = useRef<boolean>(false);
  const gizmoSpaceRef = useRef<GizmoSpaceMode>('auto');
  const usePlayCamRef = useRef<boolean>(true);
  const cameraPreviewOpenRef = useRef<boolean>(true);
  const hasSceneRootRef = useRef<boolean>(false);

  // React UI State
  const [simState, setSimState] = useState<SimState>('stopped');
  const [timeScale, setTimeScale] = useState<number>(1.0);
  const [usePlayCamera, setUsePlayCamera] = useState<boolean>(true);
  const [editorCamMode, setEditorCamMode] = useState<'perspective' | 'orthographic'>('perspective');
  const [editorCamMenuOpen, setEditorCamMenuOpen] = useState<boolean>(false);
  const [activeViewPresetLabel, setActiveViewPresetLabel] = useState<string>('Livre');
  const [cameraPreviewOpen, setCameraPreviewOpen] = useState<boolean>(true);
  const [hasSceneRoot, setHasSceneRoot] = useState<boolean>(false);
  const [addNodeDropdownOpen, setAddNodeDropdownOpen] = useState<boolean>(false);

  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');
  const [gizmoSpace, setGizmoSpace] = useState<GizmoSpaceMode>('auto');
  const [snapEnabled, setSnapEnabled] = useState<boolean>(false);
  const [showWireframes, setShowWireframes] = useState<boolean>(true);
  const [isLinkingParent, setIsLinkingParent] = useState<boolean>(false);

  const [treeItems, setTreeItems] = useState<FlatNodeItem[]>([]);
  const [selectedUuids, setSelectedUuids] = useState<string[]>([]);
  const [dragOverUuid, setDragOverUuid] = useState<string | null>(null);
  const [sceneEnvironment, setSceneEnvironment] = useState<{
    mode: 'solid_color';
    color: string;
    skybox: string | null;
  }>({ ...DEFAULT_SCENE_ENVIRONMENT });

  const [hudOverlay, setHudOverlay] = useState<HudOverlayState>({
    visible: false,
    titleText: '',
    scoreText: '',
    stateText: '',
    energyValue: 100,
    playerTagText: '',
    playerTagScreen: { x: 0, y: 0, visible: false },
  });

  const [undoCount, setUndoCount] = useState<number>(0);
  const [redoCount, setRedoCount] = useState<number>(0);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [lastAutosaveTime, setLastAutosaveTime] = useState<string>('');

  const [bottomDrawerTab, setBottomDrawerTab] = useState<'assets' | 'tests' | 'logs' | 'closed'>('assets');
  const [engineLogs, setEngineLogs] = useState<any[]>(() => Log.getEntries());
  const [testSuiteReport, setTestSuiteReport] = useState<{
    status: string;
    tests: string[];
  } | null>(null);

  const [showJsonModal, setShowJsonModal] = useState<boolean>(false);
  const [serializedJson, setSerializedJson] = useState<string>('');
  const [physicsBodyCount, setPhysicsBodyCount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>(
    'Cena iniciada: escolha um tipo de Node pré-existente no botão "+" ou no painel para agir como Cena Pai (Raiz)'
  );

  // Studio UI Layout States (Image Reference Layout + Integrated Scripts Editor + Multi-Scene Tabs)
  const [workspaceMode, setWorkspaceMode] = useState<'3D' | 'Scripts'>('3D');
  const [topMenuOpen, setTopMenuOpen] = useState<
    'Projeto' | 'Editar' | 'Cena' | 'Arquivos' | 'Ajuda' | null
  >(null);
  const [playDropdownOpen, setPlayDropdownOpen] = useState<boolean>(false);
  const [leftDockTab, setLeftDockTab] = useState<'Cena' | 'Nós'>('Cena');
  const [rightDockTab, setRightDockTab] = useState<'Inspector' | 'Nós'>('Inspector');
  const [treeSearchQuery, setTreeSearchQuery] = useState<string>('');
  const [axisGuidesVisibility, setAxisGuidesVisibility] = useState<{
    x: boolean;
    y: boolean;
    z: boolean;
  }>({ x: true, y: true, z: true });

  // Multi-Scene Tabs (`[ ○ main.scene ● ] [ 🎬 turret.scene ] [ + ]`)
  const [openSceneTabs, setOpenSceneTabs] = useState<OpenSceneTab[]>([
    {
      id: 'tab_main_scene',
      name: 'main.scene',
      filePath: 'scenes/main.scene.json',
      sceneUuid: null,
      isChildScene: false,
      isDirty: false,
      sceneData: null,
    },
  ]);
  const [activeSceneTabId, setActiveSceneTabId] = useState<string>('tab_main_scene');

  // Integrated Scripts Editor State (`Aba Scripts` + Scroll Icon `📜`)
  const [scriptsList, setScriptsList] = useState<ScriptFileEntry[]>([]);
  const [scriptFolders, setScriptFolders] = useState<string[]>(['scripts']);
  const [openScriptTabs, setOpenScriptTabs] = useState<OpenScriptTab[]>([]);
  const [activeScriptTabUuid, setActiveScriptTabUuid] = useState<string | null>(null);
  const [inspectorScriptDropdownOpen, setInspectorScriptDropdownOpen] = useState<boolean>(false);

  // Bottom Assets Panel State (`Assets > Modelos, Materiais, Texturas, Cenas, Scripts`)
  const [activeAssetFolder, setActiveAssetFolder] = useState<
    'Modelos' | 'Materiais' | 'Texturas' | 'Cenas' | 'Scripts'
  >('Modelos');
  const [assetSearchQuery, setAssetSearchQuery] = useState<string>('');
  const [assetViewMode, setAssetViewMode] = useState<'grid' | 'list'>('grid');
  const [assetIconScale, setAssetIconScale] = useState<number>(1.0);

  // Maxros Engine — Project Manager & Active Project Context State
  const [projectOverview, setProjectOverview] = useState<ProjectManagerOverview | null>(null);
  const [activeProjectContext, setActiveProjectContext] = useState<any | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(false);
  const [projectErrorMsg, setProjectErrorMsg] = useState<string | null>(null);
  const [isValidatingEngine, setIsValidatingEngine] = useState<boolean>(false);

  // Register built-in Child Scene templates so they can be instantiated via Clapperboard (`🎬`) at any time
  useEffect(() => {
    for (const tpl of BUILTIN_CHILD_SCENES) {
      NodeFactory.registerSceneTemplate({
        uuid: tpl.uuid,
        path: tpl.path,
        data: tpl.buildTemplate(),
      });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = Log.onEntry(() => {
      setEngineLogs(Log.getEntries());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Sync refs
  useEffect(() => {
    selectedUuidsRef.current = selectedUuids;
  }, [selectedUuids]);

  useEffect(() => {
    isLinkingParentRef.current = isLinkingParent;
  }, [isLinkingParent]);

  useEffect(() => {
    cameraPreviewOpenRef.current = cameraPreviewOpen;
  }, [cameraPreviewOpen]);

  useEffect(() => {
    snapEnabledRef.current = snapEnabled;
    const tc = transformControlsRef.current;
    if (tc) {
      tc.setTranslationSnap(snapEnabled ? 0.5 : null);
      tc.setRotationSnap(snapEnabled ? 15 * DEG2RAD : null);
      tc.setScaleSnap(snapEnabled ? 0.25 : null);
    }
  }, [snapEnabled]);

  useEffect(() => {
    usePlayCamRef.current = usePlayCamera;
  }, [usePlayCamera]);

  // Warn before closing tab if unsaved changes exist
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const triggerRender = useCallback(() => {
    if (requestRenderRef.current) {
      requestRenderRef.current();
    }
  }, []);

  // Hide Editor Guides (Grid + Origin Axes) during Play with separate Play Camera and restore on Stop
  useEffect(() => {
    if (editorGuidesRef.current) {
      const shouldHideGuides = simState !== 'stopped' && usePlayCamera;
      editorGuidesRef.current.visible = !shouldHideGuides;
      triggerRender();
    }
  }, [simState, usePlayCamera, triggerRender]);

  /**
   * Synchronizes the 3D Viewport background color and fog with the Scene Environment.
   */
  const applyEnvironmentToViewport = useCallback((rawEnv?: any) => {
    const normalized = normalizeSceneEnvironment(rawEnv);
    setSceneEnvironment(normalized);
    const threeScene = threeSceneRef.current;
    if (threeScene) {
      const bg = new THREE.Color(normalized.color);
      threeScene.background = bg;
      if (threeScene.fog instanceof THREE.FogExp2) {
        threeScene.fog.color.copy(bg);
      } else {
        threeScene.fog = new THREE.FogExp2(bg.getHex(), 0.018);
      }
    }
  }, []);

  /**
   * Instantiates, updates, or removes the `THREE.CameraHelper` frustum wireframe in the main
   * 3D Viewport whenever a `Camera3D` (`Camera3DNode`) is selected, edited, or deselected.
   * Never serialized into `.scene.json`.
   */
  const updateSelectedCameraFrustumHelper = useCallback(() => {
    const threeScene = threeSceneRef.current;
    const root = sceneRootRef.current;
    if (!threeScene || !root) return;

    const primaryUuid = selectedUuidsRef.current[0] || null;
    const selectedNode = primaryUuid ? findEngineNodeByUuid(root, primaryUuid) : null;
    const shouldShowFrustum =
      simStateRef.current !== 'playing' &&
      selectedNode instanceof Camera3D &&
      selectedNode.editorVisible !== false;

    if (!shouldShowFrustum || !(selectedNode instanceof Camera3D)) {
      if (cameraFrustumHelperRef.current) {
        threeScene.remove(cameraFrustumHelperRef.current.helper);
        if (typeof cameraFrustumHelperRef.current.helper.dispose === 'function') {
          cameraFrustumHelperRef.current.helper.dispose();
        }
        cameraFrustumHelperRef.current = null;
      }
      return;
    }

    if (
      cameraFrustumHelperRef.current &&
      cameraFrustumHelperRef.current.nodeUuid === selectedNode.uuid
    ) {
      const updatedInPlace = syncCameraFrustumHelper(selectedNode, cameraFrustumHelperRef.current);
      if (updatedInPlace) {
        return;
      }
      threeScene.remove(cameraFrustumHelperRef.current.helper);
      if (typeof cameraFrustumHelperRef.current.helper.dispose === 'function') {
        cameraFrustumHelperRef.current.helper.dispose();
      }
      cameraFrustumHelperRef.current = null;
    } else if (cameraFrustumHelperRef.current) {
      threeScene.remove(cameraFrustumHelperRef.current.helper);
      if (typeof cameraFrustumHelperRef.current.helper.dispose === 'function') {
        cameraFrustumHelperRef.current.helper.dispose();
      }
      cameraFrustumHelperRef.current = null;
    }

    const created = createCameraFrustumHelper(selectedNode);
    threeScene.add(created.helper);
    cameraFrustumHelperRef.current = {
      helper: created.helper,
      virtualCamera: created.virtualCamera,
      nodeUuid: selectedNode.uuid,
    };
  }, []);

  /**
   * Updates the 3D parent-child relationship highlight lines in the viewport.
   */
  const updateRelationshipLines = useCallback(() => {
    const threeScene = threeSceneRef.current;
    const root = sceneRootRef.current;
    if (!threeScene || !root) return;

    if (relationshipLinesRef.current) {
      threeScene.remove(relationshipLinesRef.current);
      relationshipLinesRef.current.geometry.dispose();
      (relationshipLinesRef.current.material as THREE.Material).dispose();
      relationshipLinesRef.current = null;
    }

    const uuids = selectedUuidsRef.current;
    if (uuids.length === 0) return;

    const points: THREE.Vector3[] = [];
    for (const id of uuids) {
      const node = findEngineNodeByUuid(root, id);
      if (!node || node === root) continue;
      const nodePos = node.position_global;

      if (node.parent && node.parent instanceof EngineNode && node.parent !== root) {
        points.push(nodePos.clone(), node.parent.position_global.clone());
      }

      for (const child of node.children) {
        if (child instanceof EngineNode && !child.userData?.isViewportHelper) {
          points.push(nodePos.clone(), child.position_global.clone());
        }
      }
    }

    if (points.length >= 2) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      const segments = new THREE.LineSegments(lineGeo, lineMat);
      segments.renderOrder = 999;
      threeScene.add(segments);
      relationshipLinesRef.current = segments;
    }
  }, []);

  const syncGizmoAttachment = useCallback(
    (uuids: string[], currentSimState: SimState, spaceMode: GizmoSpaceMode = gizmoSpaceRef.current) => {
      const tc = transformControlsRef.current;
      const root = sceneRootRef.current;
      const proxy = multiSelectionProxyRef.current;
      if (!tc || !root || !proxy) return;

      if (currentSimState !== 'stopped' || !hasSceneRootRef.current) {
        tc.detach();
        updateSelectedCameraFrustumHelper();
        triggerRender();
        return;
      }

      const validNodes = uuids
        .map((id) => findEngineNodeByUuid(root, id))
        .filter(
          (n): n is EngineNode =>
            Boolean(
              n &&
                !n.editorLocked &&
                n.editorVisible !== false &&
                !(n instanceof UILayer) &&
                n.nodeType !== 'Node'
            )
        );

      if (validNodes.length === 0) {
        tc.detach();
      } else if (validNodes.length === 1) {
        const single = validNodes[0];
        if (spaceMode === 'auto') {
          const isTopParent = !single.parent || single.parent === root;
          tc.setSpace(isTopParent ? 'world' : 'local');
        } else {
          tc.setSpace(spaceMode);
        }
        tc.attach(single);
      } else {
        const centroid = new THREE.Vector3();
        for (const n of validNodes) {
          centroid.add(n.position_global);
        }
        centroid.divideScalar(validNodes.length);
        proxy.position.copy(centroid);
        proxy.rotation.set(0, 0, 0);
        proxy.scale.set(1, 1, 1);
        proxy.updateMatrixWorld(true);
        multiDragPrevPosRef.current.copy(centroid);
        tc.setSpace('world');
        tc.attach(proxy);
      }

      updateRelationshipLines();
      updateSelectedCameraFrustumHelper();
      triggerRender();
    },
    [triggerRender, updateRelationshipLines, updateSelectedCameraFrustumHelper]
  );

  const syncHudOverlay = useCallback(() => {
    const root = sceneRootRef.current;
    const cam = cameraRef.current;
    const mount = canvasMountRef.current;
    if (!root || !hasSceneRootRef.current) {
      setHudOverlay((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const uiLayerNode =
      root instanceof UILayer
        ? root
        : root.children.find((c): c is UILayer => c instanceof UILayer);
    if (!uiLayerNode || !uiLayerNode.visible) {
      setHudOverlay((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const titleLbl = root.getNodeByName('TitleLabel') as Label | null;
    const scoreLbl = (root.getNodeOrNull('%ScoreLabel') || root.getNodeByName('ScoreLabel')) as Label | null;
    const stateLbl = (root.getNodeOrNull('%StateLabel') || root.getNodeByName('StateLabel')) as Label | null;
    const energyBar = (root.getNodeOrNull('%EnergyBar') || root.getNodeByName('EnergyBar')) as ProgressBar | null;
    const tagLbl = (root.getNodeOrNull('%PlayerTagLabel') || root.getNodeByName('PlayerTagLabel')) as Label | null;
    const playerCore = root.getNodeOrNull('%PlayerCore') || root.getNodeByName('PlayerCore');

    let tagScreen = { x: 0, y: 0, visible: false };
    if (tagLbl && playerCore && cam && mount && mount.clientWidth > 0) {
      const worldPos = playerCore.position_global.clone();
      worldPos.y += 1.05;
      worldPos.project(cam);
      if (worldPos.z < 1) {
        tagScreen = {
          x: (worldPos.x * 0.5 + 0.5) * mount.clientWidth,
          y: (-worldPos.y * 0.5 + 0.5) * mount.clientHeight,
          visible: true,
        };
      }
    }

    setHudOverlay({
      visible: true,
      titleText: titleLbl?.text || '🔷 GUARDIÃO GEOMÉTRICO — ARENA 3D',
      scoreText: scoreLbl?.text || '💎 Cristais: 0  |  🏆 Pontos: 0',
      stateText: stateLbl?.text || 'Estado: EXPLORANDO',
      energyValue: energyBar?.value ?? 100,
      playerTagText: tagLbl?.text || 'Guardião [100%]',
      playerTagScreen: tagScreen,
    });
  }, []);

  const syncUiSnapshot = useCallback(() => {
    const root = sceneRootRef.current;
    if (!root || !hasSceneRootRef.current) {
      setTreeItems([]);
      setPhysicsBodyCount(0);
      setHudOverlay((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    root.updateMatrixWorld(true);
    attachViewportVisualsToTree(
      root,
      showWireframesRef.current,
      new Set(selectedUuidsRef.current)
    );
    updateRelationshipLines();
    updateSelectedCameraFrustumHelper();
    const flat = flattenEngineTree(root, root);
    setTreeItems(flat);
    setPhysicsBodyCount(PhysicsServer.getInstance().getBodyCount());
    syncHudOverlay();
  }, [syncHudOverlay, updateRelationshipLines, updateSelectedCameraFrustumHelper]);

  /**
   * Records a state in the Undo History Stack and triggers Autosave to localStorage.
   */
  const pushUndoSnapshot = useCallback((label: string, snapshotOverride?: Record<string, any>) => {
    const root = sceneRootRef.current;
    if (!root) return;
    const snap = snapshotOverride || root.serialize();
    undoStackRef.current.push({
      label,
      sceneData: snap,
      selectedUuids: [...selectedUuidsRef.current],
    });
    if (undoStackRef.current.length > 40) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setUndoCount(undoStackRef.current.length);
    setRedoCount(0);
    setIsDirty(true);

    try {
      const currentSerialized = root.serialize();
      localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(currentSerialized));
      const now = new Date();
      setLastAutosaveTime(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(
          now.getSeconds()
        ).padStart(2, '0')}`
      );
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  /**
   * Resets the scene into an empty state that prompts the user to select a pre-existing Node
   * type to act as the Scene Root (`Nó Pai da Cena`).
   */
  const handleStartEmptyScenePrompt = useCallback(() => {
    const physics = PhysicsServer.getInstance();
    const threeScene = threeSceneRef.current;
    const tc = transformControlsRef.current;

    if (tc) {
      tc.detach();
    }
    if (cameraFrustumHelperRef.current && threeScene) {
      threeScene.remove(cameraFrustumHelperRef.current.helper);
      cameraFrustumHelperRef.current.helper.dispose?.();
      cameraFrustumHelperRef.current = null;
    }
    if (relationshipLinesRef.current && threeScene) {
      threeScene.remove(relationshipLinesRef.current);
      relationshipLinesRef.current.geometry.dispose();
      (relationshipLinesRef.current.material as THREE.Material).dispose();
      relationshipLinesRef.current = null;
    }
    if (sceneRootRef.current && threeScene) {
      threeScene.remove(sceneRootRef.current);
    }

    physics.clear();
    Tween.clearAll();
    Input.reset();

    setSimState('stopped');
    simStateRef.current = 'stopped';
    hasSceneRootRef.current = false;
    setHasSceneRoot(false);
    sceneRootRef.current = null;
    sceneTreeRef.current = null;
    setTreeItems([]);
    setSelectedUuids([]);
    selectedUuidsRef.current = [];
    setPhysicsBodyCount(0);
    setHudOverlay((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    setStatusMessage(
      'Cena vazia: escolha um tipo de Node pré-existente no botão "+" ou na lista para agir como Nó Pai da Cena'
    );
    triggerRender();
  }, [triggerRender]);

  /**
   * Reconstructs a scene in RAM via NodeFactory, with full validation & multi-selection restoration.
   */
  const loadSceneDataIntoRam = useCallback(
    (
      sceneData: Record<string, any>,
      options: {
        preserveSelectionUuids?: string[];
        autoSelectDefaultIfEmpty?: boolean;
        statusText?: string;
      } = {}
    ) => {
      const physics = PhysicsServer.getInstance();
      const threeScene = threeSceneRef.current;
      const tc = transformControlsRef.current;

      if (tc) {
        tc.detach();
      }

      if (sceneRootRef.current && threeScene) {
        threeScene.remove(sceneRootRef.current);
      }

      physics.clear();
      Tween.clearAll();
      Input.reset();
      const warnings: string[] = [];
      const reconstructedRoot = NodeFactory.createFromData(sceneData, {
        physicsServer: physics,
        strict: false,
        warnings,
      });

      // Eliminate any legacy 'MainSceneRoot' label in favor of a pre-existing Node3D root
      if (reconstructedRoot.name === 'MainSceneRoot') {
        reconstructedRoot.name = 'Node3D';
        if (reconstructedRoot.nodeType === 'EngineNode') {
          reconstructedRoot.nodeType = 'Node3D';
        }
      }

      const st = new SceneTree(reconstructedRoot);
      st.setNodeFactory(NodeFactory);
      sceneTreeRef.current = st;

      if (threeScene) {
        threeScene.add(reconstructedRoot);
      }

      sceneRootRef.current = reconstructedRoot;
      hasSceneRootRef.current = true;
      setHasSceneRoot(true);
      applyEnvironmentToViewport(reconstructedRoot.environment);

      const candidateUuids =
        options.preserveSelectionUuids !== undefined
          ? options.preserveSelectionUuids
          : selectedUuidsRef.current;

      let nextSelected = candidateUuids.filter((id) =>
        Boolean(findEngineNodeByUuid(reconstructedRoot, id))
      );

      if (nextSelected.length === 0 && options.autoSelectDefaultIfEmpty) {
        const preferred =
          reconstructedRoot.getNodeOrNull('%PlayerCore') ||
          reconstructedRoot.children.find(
            (c) => c instanceof RigidBody3DNode && c.bodyType === 'dynamic'
          ) ||
          reconstructedRoot.children.find((c) => c instanceof Mesh3D) ||
          reconstructedRoot.children.find((c) => c instanceof EngineNode) ||
          reconstructedRoot;
        nextSelected = [preferred.uuid];
      }

      setSelectedUuids(nextSelected);
      selectedUuidsRef.current = nextSelected;
      attachViewportVisualsToTree(reconstructedRoot, showWireframesRef.current, new Set(nextSelected));
      syncGizmoAttachment(nextSelected, simStateRef.current);
      syncUiSnapshot();

      if (warnings.length > 0) {
        setStatusMessage(`Aviso de validação: ${warnings[0]}`);
      } else if (options.statusText) {
        setStatusMessage(options.statusText);
      }
      triggerRender();
    },
    [applyEnvironmentToViewport, syncGizmoAttachment, syncUiSnapshot, triggerRender]
  );

  /**
   * Undo (Ctrl+Z)
   */
  const handleUndo = useCallback(() => {
    if (simStateRef.current !== 'stopped' || undoStackRef.current.length === 0) return;
    const root = sceneRootRef.current;
    if (!root) return;

    const currentSnap = root.serialize();
    const prevEntry = undoStackRef.current.pop()!;
    redoStackRef.current.push({
      label: prevEntry.label,
      sceneData: currentSnap,
      selectedUuids: [...selectedUuidsRef.current],
    });

    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);

    loadSceneDataIntoRam(prevEntry.sceneData, {
      preserveSelectionUuids: prevEntry.selectedUuids,
      statusText: `Desfeito: ${prevEntry.label}`,
    });
  }, [loadSceneDataIntoRam]);

  /**
   * Redo (Ctrl+Y / Ctrl+Shift+Z)
   */
  const handleRedo = useCallback(() => {
    if (simStateRef.current !== 'stopped' || redoStackRef.current.length === 0) return;
    const root = sceneRootRef.current;
    if (!root) return;

    const currentSnap = root.serialize();
    const nextEntry = redoStackRef.current.pop()!;
    undoStackRef.current.push({
      label: nextEntry.label,
      sceneData: currentSnap,
      selectedUuids: [...selectedUuidsRef.current],
    });

    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);

    loadSceneDataIntoRam(nextEntry.sceneData, {
      preserveSelectionUuids: nextEntry.selectedUuids,
      statusText: `Refeito: ${nextEntry.label}`,
    });
  }, [loadSceneDataIntoRam]);

  /**
   * Focus Camera on Selected Object(s) (Key F)
   */
  const handleFocusSelected = useCallback(() => {
    const root = sceneRootRef.current;
    const cam = cameraRef.current;
    const orbit = orbitControlsRef.current;
    if (!root || !cam || !orbit) return;

    const nodes = selectedUuidsRef.current
      .map((id) => findEngineNodeByUuid(root, id))
      .filter((n): n is EngineNode => Boolean(n));

    if (nodes.length === 0) return;

    const center = new THREE.Vector3();
    for (const n of nodes) {
      center.add(n.position_global);
    }
    center.divideScalar(nodes.length);

    const viewDir = cam.position.clone().sub(orbit.target).normalize();
    const desiredDistance = 5.8;
    const desiredCamPos = center.clone().add(viewDir.multiplyScalar(desiredDistance));
    desiredCamPos.y = Math.max(center.y + 2.2, desiredCamPos.y);

    focusTransitionRef.current = {
      active: true,
      targetCenter: center,
      targetCamPos: desiredCamPos,
    };
    setStatusMessage(`Câmera focada em "${nodes[0].name}"`);
    triggerRender();
  }, [triggerRender]);

  /**
   * Switches the Editor Viewport Camera between Perspective (`THREE.PerspectiveCamera`)
   * and Orthographic (`THREE.OrthographicCamera`).
   * The Editor Camera only exists in the UI context and is never serialized into `.scene.json`.
   */
  const handleSwitchEditorCameraMode = useCallback(
    (nextMode: 'perspective' | 'orthographic') => {
      const persp = perspCameraRef.current;
      const ortho = orthoCameraRef.current;
      const orbit = orbitControlsRef.current;
      const tc = transformControlsRef.current;
      const mount = canvasMountRef.current;
      if (!persp || !ortho || !orbit || !mount) return;

      const prevCam = cameraRef.current || persp;
      const nextCam = nextMode === 'orthographic' ? ortho : persp;

      nextCam.position.copy(prevCam.position);
      nextCam.quaternion.copy(prevCam.quaternion);
      nextCam.up.copy(prevCam.up);

      const aspect = Math.max(0.1, mount.clientWidth / Math.max(1, mount.clientHeight));
      const dist = Math.max(2, prevCam.position.distanceTo(orbit.target));

      if (nextMode === 'orthographic') {
        const frustumHeight = 2 * dist * Math.tan(THREE.MathUtils.degToRad(persp.fov * 0.5));
        const halfH = frustumHeight / 2;
        const halfW = halfH * aspect;
        ortho.left = -halfW;
        ortho.right = halfW;
        ortho.top = halfH;
        ortho.bottom = -halfH;
        ortho.zoom = 1;
        ortho.updateProjectionMatrix();
      } else {
        persp.aspect = aspect;
        persp.updateProjectionMatrix();
      }

      cameraRef.current = nextCam;
      orbit.object = nextCam;
      orbit.update();
      if (tc) {
        tc.camera = nextCam;
      }

      setEditorCamMode(nextMode);
      setStatusMessage(
        nextMode === 'orthographic'
          ? 'Câmera do Editor alterada para modo Ortográfico (THREE.OrthographicCamera)'
          : 'Câmera do Editor alterada para modo Perspectiva (THREE.PerspectiveCamera)'
      );
      triggerRender();
    },
    [triggerRender]
  );

  /**
   * Aligns the Editor Camera to one of the 6 standard axis presets (Top, Bottom, Left, Right, Front, Back)
   * with smooth exponential damping toward the center of the scene.
   */
  const handleAlignEditorCamera = useCallback(
    (preset: EditorCamPreset) => {
      const cam = cameraRef.current;
      const orbit = orbitControlsRef.current;
      if (!cam || !orbit) return;

      const currentDist = Math.max(8, Math.min(28, cam.position.distanceTo(orbit.target) || 14));
      const sceneCenter = new THREE.Vector3(0, 0.5, 0);
      const pose = computeEditorCameraPresetPose(preset, sceneCenter, currentDist);

      focusTransitionRef.current = {
        active: true,
        targetCenter: pose.targetCenter,
        targetCamPos: pose.targetCamPos,
      };
      setActiveViewPresetLabel(pose.label);
      setEditorCamMenuOpen(false);
      setStatusMessage(`Câmera do Editor alinhada: ${pose.label}`);
      triggerRender();
    },
    [triggerRender]
  );

  /**
   * Handles clicks on the interactive 3D Navigation Gizmo (X/Y/Z ViewHelper) in the top-right corner.
   */
  const handleNavGizmoClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = navGizmoCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

      // Check axis caps (sorted front-to-back so frontmost cap wins)
      const regions = [...navGizmoHitRegionsRef.current].reverse();
      for (const hit of regions) {
        if (Math.hypot(x - hit.x, y - hit.y) <= hit.r + 3) {
          handleAlignEditorCamera(hit.id);
          return;
        }
      }

      // Clicking the center hub toggles Perspective <-> Orthographic
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      if (Math.hypot(x - cx, y - cy) <= 12) {
        handleSwitchEditorCameraMode(
          editorCamMode === 'perspective' ? 'orthographic' : 'perspective'
        );
      }
    },
    [editorCamMode, handleAlignEditorCamera, handleSwitchEditorCameraMode]
  );

  /**
   * Copies the Editor Camera's current world position and rotation to the selected `Camera3D` node.
   */
  const handleAlignSelectedCameraToEditorView = useCallback(() => {
    const root = sceneRootRef.current;
    const editorCam = cameraRef.current;
    const primaryUuid = selectedUuidsRef.current[0] || null;
    const node = findEngineNodeByUuid(root, primaryUuid);
    if (!root || !editorCam || !(node instanceof Camera3D) || simStateRef.current !== 'stopped') {
      return;
    }

    const beforeSnap = root.serialize();
    node.position_global = {
      x: roundNum(editorCam.position.x, 2),
      y: roundNum(editorCam.position.y, 2),
      z: roundNum(editorCam.position.z, 2),
    };
    node.quaternion_global = editorCam.quaternion.clone();
    node.notifySubtreeTransformChanged();

    pushUndoSnapshot(`Alinhar ${node.name} com Visão do Editor`, beforeSnap);
    syncUiSnapshot();
    setStatusMessage(`"${node.name}" alinhada com a pose atual da Câmera do Editor`);
    triggerRender();
  }, [pushUndoSnapshot, syncUiSnapshot, triggerRender]);

  /**
   * Duplicate Selected Node(s) with Entire Subtree (Ctrl+D)
   */
  const handleDuplicateSelected = useCallback(() => {
    const root = sceneRootRef.current;
    if (!root || simStateRef.current !== 'stopped') return;

    const targets = selectedUuidsRef.current
      .map((id) => findEngineNodeByUuid(root, id))
      .filter((n): n is EngineNode => Boolean(n && n !== root && n.parent));

    if (targets.length === 0) return;

    const beforeSnap = root.serialize();
    const newlyCreatedUuids: string[] = [];

    for (const node of targets) {
      const parentNode = node.parent instanceof EngineNode ? node.parent : root;
      const clonedData = NodeFactory.cloneSerializedSubtreeWithNewUuids(node.serialize(), {
        nameSuffix: '_Copia',
        positionOffset: { x: 0.8, y: 0, z: 0.8 },
      });
      const clonedInstance = NodeFactory.createFromData(clonedData, {
        physicsServer: PhysicsServer.getInstance(),
      });
      parentNode.add(clonedInstance);
      NodeFactory._finalizePhysicsSubtree(clonedInstance, PhysicsServer.getInstance());
      newlyCreatedUuids.push(clonedInstance.uuid);
    }

    pushUndoSnapshot('Duplicar nó(s)', beforeSnap);
    setSelectedUuids(newlyCreatedUuids);
    selectedUuidsRef.current = newlyCreatedUuids;
    syncGizmoAttachment(newlyCreatedUuids, simStateRef.current);
    syncUiSnapshot();
    setStatusMessage(`${newlyCreatedUuids.length} nó(s) duplicado(s) com toda a hierarquia (Ctrl+D)`);
    triggerRender();
  }, [pushUndoSnapshot, syncGizmoAttachment, syncUiSnapshot, triggerRender]);

  /**
   * Copy (Ctrl+C) & Paste (Ctrl+V) Subtree
   */
  const handleCopySelected = useCallback(() => {
    const root = sceneRootRef.current;
    if (!root) return;
    const targets = selectedUuidsRef.current
      .map((id) => findEngineNodeByUuid(root, id))
      .filter((n): n is EngineNode => Boolean(n && n !== root));
    if (targets.length === 0) return;
    clipboardSubtreesRef.current = targets.map((n) => n.serialize());
    setStatusMessage(`${targets.length} nó(s) copiado(s) para a área de transferência (Ctrl+C)`);
  }, []);

  const handlePasteClipboard = useCallback(() => {
    const root = sceneRootRef.current;
    if (!root || simStateRef.current !== 'stopped' || clipboardSubtreesRef.current.length === 0)
      return;

    const beforeSnap = root.serialize();
    const pastedUuids: string[] = [];

    for (const serializedItem of clipboardSubtreesRef.current) {
      const clonedData = NodeFactory.cloneSerializedSubtreeWithNewUuids(serializedItem, {
        nameSuffix: '_Colado',
        positionOffset: { x: 1.0, y: 0, z: 1.0 },
      });
      const instance = NodeFactory.createFromData(clonedData, {
        physicsServer: PhysicsServer.getInstance(),
      });
      root.add(instance);
      NodeFactory._finalizePhysicsSubtree(instance, PhysicsServer.getInstance());
      pastedUuids.push(instance.uuid);
    }

    pushUndoSnapshot('Colar nó(s)', beforeSnap);
    setSelectedUuids(pastedUuids);
    selectedUuidsRef.current = pastedUuids;
    syncGizmoAttachment(pastedUuids, simStateRef.current);
    syncUiSnapshot();
    setStatusMessage(`${pastedUuids.length} nó(s) colado(s) na cena (Ctrl+V)`);
    triggerRender();
  }, [pushUndoSnapshot, syncGizmoAttachment, syncUiSnapshot, triggerRender]);

  /**
   * Delete Selected Node(s) and their Entire Subtree (Delete / Backspace)
   */
  const handleDeleteSelected = useCallback(() => {
    const root = sceneRootRef.current;
    if (!root || simStateRef.current !== 'stopped') return;

    // If the user selected the Root Node itself, deleting it resets the scene to the "Choose Root Node" prompt
    if (selectedUuidsRef.current.includes(root.uuid)) {
      handleStartEmptyScenePrompt();
      return;
    }

    const targets = selectedUuidsRef.current
      .map((id) => findEngineNodeByUuid(root, id))
      .filter((n): n is EngineNode => Boolean(n && n !== root && n.parent));

    if (targets.length === 0) return;

    const beforeSnap = root.serialize();
    for (const target of targets) {
      target.traverse((obj: THREE.Object3D) => {
        if (obj instanceof RigidBody3DNode) {
          obj.destroy();
        }
      });
      if (target.parent) {
        target.parent.remove(target);
      }
    }

    pushUndoSnapshot('Excluir nó(s)', beforeSnap);
    const nextSelection: string[] = [];
    setSelectedUuids(nextSelection);
    selectedUuidsRef.current = nextSelection;
    syncGizmoAttachment(nextSelection, simStateRef.current);
    syncUiSnapshot();
    setStatusMessage(`${targets.length} nó(s) e seus filhos foram removidos`);
    triggerRender();
  }, [handleStartEmptyScenePrompt, pushUndoSnapshot, syncGizmoAttachment, syncUiSnapshot, triggerRender]);

  /**
   * Reparents a node (via Top Bar button, Inspector Select, or Tree Drag-and-Drop)
   * while preserving its exact world transform.
   */
  const handleReparentNode = useCallback(
    (childUuid: string, newParentUuid: string) => {
      const root = sceneRootRef.current;
      if (!root || simStateRef.current !== 'stopped') return false;

      const childNode = findEngineNodeByUuid(root, childUuid);
      const targetParent = findEngineNodeByUuid(root, newParentUuid);

      if (!childNode || !targetParent || childNode === root) {
        return false;
      }

      if (childNode === targetParent || childNode.isAncestorOf(targetParent)) {
        setStatusMessage('Vínculo inválido: um nó pai não pode ser filho de seu próprio descendente.');
        return false;
      }

      const beforeSnap = root.serialize();
      const ok = childNode.reparentPreservingWorldTransform(targetParent);
      if (ok) {
        pushUndoSnapshot(`Reparentar ${childNode.name}`, beforeSnap);
        syncGizmoAttachment(selectedUuidsRef.current, simStateRef.current);
        syncUiSnapshot();
        const isNowRootChild = targetParent === root;
        setStatusMessage(
          isNowRootChild
            ? `"${childNode.name}" solto na Raiz mantendo posição no mundo (Position = Global)`
            : `"${childNode.name}" travado como filho de "${targetParent.name}" mantendo posição (Position = Local)`
        );
        triggerRender();
      }
      return ok;
    },
    [pushUndoSnapshot, syncGizmoAttachment, syncUiSnapshot, triggerRender]
  );

  // Initialize Three.js Scene, OrbitControls, TransformControls, and Render Loop
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const defaultBgColor = new THREE.Color(DEFAULT_SCENE_ENVIRONMENT.color);
    const scene = new THREE.Scene();
    scene.background = defaultBgColor.clone();
    scene.fog = new THREE.FogExp2(defaultBgColor.getHex(), 0.018);
    threeSceneRef.current = scene;

    // Multi-selection centroid proxy Object3D
    const multiProxy = new THREE.Object3D();
    multiProxy.name = '__MultiSelectionCentroidProxy';
    scene.add(multiProxy);
    multiSelectionProxyRef.current = multiProxy;

    // Studio Environment Reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const initAspect = Math.max(0.1, mount.clientWidth / Math.max(1, mount.clientHeight));
    const perspCamera = new THREE.PerspectiveCamera(50, initAspect, 0.1, 200);
    perspCamera.position.set(10.5, 7.8, 12.5);
    perspCameraRef.current = perspCamera;

    const orthoHalfH = 7.5;
    const orthoHalfW = orthoHalfH * initAspect;
    const orthoCamera = new THREE.OrthographicCamera(
      -orthoHalfW,
      orthoHalfW,
      orthoHalfH,
      -orthoHalfH,
      0.1,
      200
    );
    orthoCamera.position.copy(perspCamera.position);
    orthoCameraRef.current = orthoCamera;

    cameraRef.current = perspCamera;

    const orbitControls = new OrbitControls(perspCamera, renderer.domElement);
    orbitControls.target.set(0, 1.8, 0);
    orbitControls.enableDamping = !isSoftwareGl;
    orbitControls.dampingFactor = 0.08;
    // Allow full 0..PI polar range so Visão de Cima (Top) and Visão de Baixo (Bottom) work without clamping
    orbitControls.minPolarAngle = 0;
    orbitControls.maxPolarAngle = Math.PI;
    orbitControls.minDistance = 2.0;
    orbitControls.maxDistance = 48;
    orbitControls.update();
    orbitControlsRef.current = orbitControls;

    orbitControls.addEventListener('start', () => {
      focusTransitionRef.current.active = false;
    });

    // TransformControls 3D Gizmo
    const transformControls = new TransformControls(perspCamera, renderer.domElement);
    transformControls.setSize(1.05);
    transformControls.setMode('translate');
    const transformHelper = transformControls.getHelper();
    scene.add(transformHelper);
    transformControlsRef.current = transformControls;

    let isDraggingGizmo = false;

    transformControls.addEventListener('dragging-changed', (event: any) => {
      const dragging = Boolean(event.value);
      isDraggingGizmo = dragging;
      orbitControls.enabled = !dragging;

      if (dragging && sceneRootRef.current) {
        dragStartSnapshotRef.current = sceneRootRef.current.serialize();
        if (transformControls.object === multiSelectionProxyRef.current) {
          multiDragPrevPosRef.current.copy(multiSelectionProxyRef.current.position);
        }
      } else if (!dragging && dragStartSnapshotRef.current && sceneRootRef.current) {
        pushUndoSnapshot('Transformar com Gizmo 3D', dragStartSnapshotRef.current);
        dragStartSnapshotRef.current = null;
        syncUiSnapshot();
      }
    });

    transformControls.addEventListener('objectChange', () => {
      const attachedObj = transformControls.object;
      const root = sceneRootRef.current;
      if (!attachedObj || !root) return;

      if (attachedObj instanceof EngineNode) {
        attachedObj.notifySubtreeTransformChanged();
        syncUiSnapshot();
      } else if (attachedObj === multiSelectionProxyRef.current) {
        // Multi-selection group translation delta
        const deltaPos = attachedObj.position.clone().sub(multiDragPrevPosRef.current);
        multiDragPrevPosRef.current.copy(attachedObj.position);
        for (const id of selectedUuidsRef.current) {
          const n = findEngineNodeByUuid(root, id);
          if (n && n !== root && !n.editorLocked) {
            const gp = n.position_global;
            n.position_global = {
              x: gp.x + deltaPos.x,
              y: gp.y + deltaPos.y,
              z: gp.z + deltaPos.z,
            };
            n.notifySubtreeTransformChanged();
          }
        }
        syncUiSnapshot();
      }
      requestRender();
    });

    transformControls.addEventListener('change', () => {
      requestRender();
    });

    // 3-Point Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.65);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
    keyLight.position.set(12, 18, 10);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 45;
    const d = 12;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
    rimLight.position.set(-10, 8, -12);
    scene.add(rimLight);

    // Editor Visual Guides: Subtle Ground Grid + Anti-Z-Fighting Origin Axes (X:#EF4444, Y:#22C55E, Z:#3B82F6)
    const editorGuidesGroup = createEditorGuidesGroup({ size: 20, divisions: 20 });
    scene.add(editorGuidesGroup);
    editorGuidesRef.current = editorGuidesGroup;

    // Pre-allocated vectors/quaternions for the 3D Navigation Gizmo & PiP Preview (Zero GC in loop)
    const _invCamQuat = new THREE.Quaternion();
    const _axisVec = new THREE.Vector3();

    const GIZMO_AXES: Array<{
      id: EditorCamPreset;
      dir: [number, number, number];
      label: string;
      color: string;
      positive: boolean;
    }> = [
      { id: 'right', dir: [1, 0, 0], label: 'X', color: '#ef4444', positive: true },
      { id: 'left', dir: [-1, 0, 0], label: '-X', color: '#991b1b', positive: false },
      { id: 'top', dir: [0, 1, 0], label: 'Y', color: '#22c55e', positive: true },
      { id: 'bottom', dir: [0, -1, 0], label: '-Y', color: '#166534', positive: false },
      { id: 'front', dir: [0, 0, 1], label: 'Z', color: '#3b82f6', positive: true },
      { id: 'back', dir: [0, 0, -1], label: '-Z', color: '#1e40af', positive: false },
    ];

    /**
     * Draws the interactive 3D Navigation Gizmo (X Red, Y Green, Z Blue) in the top-right corner
     * tied to the inverse rotation of the active Editor Camera.
     */
    function drawNavigationGizmo(activeCam: THREE.Camera) {
      const gizmoCanvas = navGizmoCanvasRef.current;
      if (!gizmoCanvas) return;
      const ctx = gizmoCanvas.getContext('2d');
      if (!ctx) return;

      const w = gizmoCanvas.width;
      const h = gizmoCanvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const armLen = 38;

      ctx.clearRect(0, 0, w, h);

      // Subtle circular compass ring
      ctx.beginPath();
      ctx.arc(cx, cy, armLen + 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.stroke();

      _invCamQuat.copy(activeCam.quaternion).invert();

      const projected = GIZMO_AXES.map((ax) => {
        _axisVec.set(ax.dir[0], ax.dir[1], ax.dir[2]).applyQuaternion(_invCamQuat);
        return {
          ...ax,
          sx: cx + _axisVec.x * armLen,
          sy: cy - _axisVec.y * armLen,
          sz: _axisVec.z,
        };
      }).sort((a, b) => a.sz - b.sz);

      const hitRegions: Array<{
        id: EditorCamPreset;
        x: number;
        y: number;
        r: number;
        label: string;
      }> = [];

      for (const item of projected) {
        // Draw shaft from center for positive axes (and subtle dashed/thin shaft for negative axes)
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(item.sx, item.sy);
        ctx.lineWidth = item.positive ? 2.6 : 1.4;
        ctx.strokeStyle = item.color;
        ctx.globalAlpha = item.sz < -0.15 ? 0.55 : 0.95;
        ctx.stroke();

        // Draw circular axis cap
        const capRadius = item.positive ? 10.5 : 8.0;
        ctx.beginPath();
        ctx.arc(item.sx, item.sy, capRadius, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = item.positive ? '#f8fafc' : 'rgba(248, 250, 252, 0.45)';
        ctx.stroke();

        // Axis label inside cap
        ctx.fillStyle = '#ffffff';
        ctx.font = item.positive ? 'bold 9.5px monospace' : 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, item.sx, item.sy + 0.5);

        hitRegions.push({
          id: item.id,
          x: item.sx,
          y: item.sy,
          r: capRadius,
          label: item.label,
        });
      }

      ctx.globalAlpha = 1.0;

      // Center hub dot
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#e2e8f0';
      ctx.fill();

      navGizmoHitRegionsRef.current = hitRegions;
    }

    /**
     * Renders the real-time Picture-in-Picture Camera Preview into the secondary `<canvas>`
     * in the Right Inspector Panel when a `Camera3D` node is selected and the "Camera Preview"
     * section is open, reusing the single `THREE.WebGLRenderer` via `setViewport` / `setScissor`.
     */
    function renderSelectedCameraPipPreview() {
      if (!cameraPreviewOpenRef.current) return;
      const previewCanvas = cameraPreviewCanvasRef.current;
      const root = sceneRootRef.current;
      if (!previewCanvas || !root || !mount) return;

      const primaryUuid = selectedUuidsRef.current[0] || null;
      const selectedNode = primaryUuid ? findEngineNodeByUuid(root, primaryUuid) : null;
      if (!(selectedNode instanceof Camera3D)) return;

      const pipW = previewCanvas.width || 272;
      const pipH = previewCanvas.height || 153;
      const mainW = mount.clientWidth;
      const mainH = mount.clientHeight;
      if (mainW < 64 || mainH < 64) return;

      const renderW = Math.min(pipW, mainW);
      const renderH = Math.min(pipH, mainH);

      // Keep Frustum Helper synced with any animation/script movement on the selected camera
      if (cameraFrustumHelperRef.current && cameraFrustumHelperRef.current.nodeUuid === selectedNode.uuid) {
        syncCameraFrustumHelper(selectedNode, cameraFrustumHelperRef.current);
      }

      // Build/update camera for the PiP aspect ratio
      const pipCamera = selectedNode._buildThreeCamera(renderW / Math.max(1, renderH));

      // Temporarily hide Editor-only overlays so the PiP preview shows the clean camera view
      const prevGuidesVis = editorGuidesGroup.visible;
      const prevTransformVis = transformHelper.visible;
      const prevRelLinesVis = relationshipLinesRef.current ? relationshipLinesRef.current.visible : false;
      const prevFrustumVis = cameraFrustumHelperRef.current
        ? cameraFrustumHelperRef.current.helper.visible
        : false;
      const selfHelper = selectedNode.children.find((c) => c.userData?.isColliderHelper);
      const prevSelfHelperVis = selfHelper ? selfHelper.visible : false;

      editorGuidesGroup.visible = false;
      transformHelper.visible = false;
      if (relationshipLinesRef.current) relationshipLinesRef.current.visible = false;
      if (cameraFrustumHelperRef.current) cameraFrustumHelperRef.current.helper.visible = false;
      if (selfHelper) selfHelper.visible = false;

      // Render into bottom-left scissor region of the existing WebGLRenderer
      renderer.setViewport(0, 0, renderW, renderH);
      renderer.setScissor(0, 0, renderW, renderH);
      renderer.setScissorTest(true);
      renderer.render(scene, pipCamera);

      // Copy rendered scissor rectangle to the secondary <canvas> in the Inspector
      const ctx2d = previewCanvas.getContext('2d');
      if (ctx2d) {
        const dpr = renderer.getPixelRatio();
        const srcW = Math.round(renderW * dpr);
        const srcH = Math.round(renderH * dpr);
        const srcY = Math.max(0, renderer.domElement.height - srcH);
        ctx2d.clearRect(0, 0, pipW, pipH);
        ctx2d.drawImage(renderer.domElement, 0, srcY, srcW, srcH, 0, 0, pipW, pipH);
      }

      // Restore scissor test, full viewport, and editor helpers
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, mainW, mainH);

      editorGuidesGroup.visible = prevGuidesVis;
      transformHelper.visible = prevTransformVis;
      if (relationshipLinesRef.current) relationshipLinesRef.current.visible = prevRelLinesVis;
      if (cameraFrustumHelperRef.current) {
        cameraFrustumHelperRef.current.helper.visible = prevFrustumVis;
      }
      if (selfHelper) selfHelper.visible = prevSelfHelperVis;
    }

    // Software-WebGL Paced Render & Simulation Loop
    const clock = new THREE.Clock();
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let uiSyncCounter = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync && gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (gl.flush) gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function stepCameraFocusDamping(dt: number) {
      if (!focusTransitionRef.current.active) return false;
      const activeCam = cameraRef.current || perspCamera;
      const { targetCenter, targetCamPos } = focusTransitionRef.current;
      const alpha = 1 - Math.exp(-10 * dt);
      orbitControls.target.lerp(targetCenter, alpha);
      activeCam.position.lerp(targetCamPos, alpha);
      orbitControls.update();
      if (
        orbitControls.target.distanceToSquared(targetCenter) < 0.001 &&
        activeCam.position.distanceToSquared(targetCamPos) < 0.001
      ) {
        orbitControls.target.copy(targetCenter);
        activeCam.position.copy(targetCamPos);
        orbitControls.update();
        focusTransitionRef.current.active = false;
      }
      return true;
    }

    function renderFrameWithPipAndGizmo() {
      const activeCam = cameraRef.current || perspCamera;
      renderSelectedCameraPipPreview();
      renderer.render(scene, activeCam);
      drawNavigationGizmo(activeCam);
    }

    function requestRender() {
      if (simStateRef.current === 'playing') return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        const dt = Math.min(clock.getDelta(), 0.1) || 1 / 60;
        const focusing = stepCameraFocusDamping(dt);
        if (!isSoftwareGl && !focusing) {
          orbitControls.update();
        }
        renderFrameWithPipAndGizmo();
        const done = () => {
          renderBusy = false;
          if (renderDirty || focusTransitionRef.current.active || simStateRef.current === 'playing') {
            if (simStateRef.current === 'playing') tickPhysics();
            else requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    function tickPhysics() {
      if (simStateRef.current !== 'playing') {
        renderBusy = false;
        requestRender();
        return;
      }
      renderBusy = true;
      const rawDelta = Math.min(clock.getDelta(), 0.1) || 1 / 60;
      const physics = PhysicsServer.getInstance();
      const scaledDt = rawDelta * physics.timeScale;

      // Update global Tweens, Shakes, and custom Node Scripts / Animations / PathFollow3D / Particles3D
      Tween.updateAll(scaledDt);
      Shake.updateAll(scaledDt);
      if (sceneRootRef.current) {
        sceneRootRef.current.update(scaledDt);
      }
      Input.stepFrame();

      physics.step(rawDelta);

      uiSyncCounter++;
      if (uiSyncCounter % 3 === 0) {
        syncHudOverlay();
      }
      if (uiSyncCounter % 9 === 0) {
        syncUiSnapshot();
      }

      stepCameraFocusDamping(rawDelta);
      if (!isSoftwareGl) {
        orbitControls.update();
      }
      renderFrameWithPipAndGizmo();

      const nextStep = () => {
        renderBusy = false;
        if (simStateRef.current === 'playing') {
          if (isSoftwareGl) tickPhysics();
          else frameId = requestAnimationFrame(tickPhysics);
        } else {
          requestRender();
        }
      };

      if (isSoftwareGl) {
        afterDraw(nextStep);
      } else {
        frameId = requestAnimationFrame(tickPhysics);
      }
    }

    requestRenderRef.current = () => {
      if (simStateRef.current === 'playing' && !renderBusy) {
        clock.getDelta();
        tickPhysics();
      } else {
        requestRender();
      }
    };

    orbitControls.addEventListener('change', requestRender);

    // Raycasting on 3D Viewport (supports Play mode click-to-move, Single Click, Shift/Ctrl Multi-Selection, Locked Node protection)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isDraggingGizmo) return;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6 || !sceneRootRef.current) return;

      const activeCam = cameraRef.current || perspCamera;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, activeCam);
      const intersects = raycaster.intersectObjects([sceneRootRef.current], true);

      // During Play mode, clicking in the 3D arena moves the Geometric Player toward the clicked point or crystal
      if (simStateRef.current === 'playing') {
        const playerNode = sceneRootRef.current.getNodeOrNull('%PlayerCore');
        if (playerNode && intersects.length > 0) {
          const hitPt = intersects[0].point;
          if (!playerNode.userData.scriptState) playerNode.userData.scriptState = {};
          playerNode.userData.scriptState.targetPoint = { x: hitPt.x, z: hitPt.z };
        }
        return;
      }

      const resolvedNode = pickSelectableNodeFromIntersects(intersects, sceneRootRef.current);

      if (resolvedNode) {
        if (resolvedNode.editorLocked) {
          setStatusMessage(`O nó "${resolvedNode.name}" está travado (cadeado ativo na Árvore)`);
          return;
        }

        if (isLinkingParentRef.current && selectedUuidsRef.current.length > 0) {
          handleReparentNode(selectedUuidsRef.current[0], resolvedNode.uuid);
          setIsLinkingParent(false);
          isLinkingParentRef.current = false;
          return;
        }

        const isMultiToggle = e.shiftKey || e.ctrlKey || e.metaKey;
        let nextSelection: string[];
        if (isMultiToggle) {
          if (selectedUuidsRef.current.includes(resolvedNode.uuid)) {
            nextSelection = selectedUuidsRef.current.filter((id) => id !== resolvedNode.uuid);
          } else {
            nextSelection = [...selectedUuidsRef.current, resolvedNode.uuid];
          }
        } else {
          nextSelection = [resolvedNode.uuid];
        }

        setSelectedUuids(nextSelection);
        selectedUuidsRef.current = nextSelection;
        syncGizmoAttachment(nextSelection, simStateRef.current);
        syncUiSnapshot();
        return;
      }

      // Clicked empty space (or through non-selectable Editor Guides): clear selection unless holding multi-select modifier
      if (isLinkingParentRef.current) {
        setIsLinkingParent(false);
        isLinkingParentRef.current = false;
        return;
      }

      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && selectedUuidsRef.current.length > 0) {
        setSelectedUuids([]);
        selectedUuidsRef.current = [];
        syncGizmoAttachment([], simStateRef.current);
        syncUiSnapshot();
        setStatusMessage('Seleção limpa — exibindo configurações de Ambiente da Cena no painel direito');
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // ResizeObserver for responsive 3-column canvas (updates both Perspective and Orthographic Editor Cameras)
    const resizeObserver = new ResizeObserver(() => {
      if (!mount || mount.clientWidth === 0 || mount.clientHeight === 0) return;
      const aspect = mount.clientWidth / mount.clientHeight;
      perspCamera.aspect = aspect;
      perspCamera.updateProjectionMatrix();

      const orthoHalfHeight = Math.abs(orthoCamera.top);
      orthoCamera.left = -orthoHalfHeight * aspect;
      orthoCamera.right = orthoHalfHeight * aspect;
      orthoCamera.updateProjectionMatrix();

      renderer.setSize(mount.clientWidth, mount.clientHeight);
      requestRender();
    });
    resizeObserver.observe(mount);

    // Start the scene prompting the user to select a pre-existing Node type to act as the Scene Root (Nó Pai da Cena)
    handleStartEmptyScenePrompt();
    perspCamera.position.set(0, 8.5, 11.5);
    orbitControls.target.set(0, 0.5, 0);
    orbitControls.update();
    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      orbitControls.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      if (cameraFrustumHelperRef.current) {
        scene.remove(cameraFrustumHelperRef.current.helper);
        cameraFrustumHelperRef.current.helper.dispose?.();
        cameraFrustumHelperRef.current = null;
      }
      transformControls.detach();
      transformControls.dispose();
      orbitControls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [
    handleReparentNode,
    handleStartEmptyScenePrompt,
    loadSceneDataIntoRam,
    pushUndoSnapshot,
    syncGizmoAttachment,
    syncHudOverlay,
    syncUiSnapshot,
  ]);

  // Global Keyboard Shortcuts & Play Mode Input Forwarding
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLSelectElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === 'F5') {
        e.preventDefault();
        if (simStateRef.current === 'playing') {
          handleStopAndResetSimulation();
        } else {
          handleStartOrResumePlay();
        }
        return;
      }

      // Forward keys to Maxros Engine Input service and Node.input(event) lifecycle when playing
      if (simStateRef.current === 'playing') {
        Input.feedKeyDown(e.code);
        Input.feedKeyDown(e.key);
        if (sceneRootRef.current) {
          const evt = Input.createEvent({
            type: 'keydown',
            key: e.key,
            code: e.code,
          });
          Input.dispatchEventToTree(sceneRootRef.current, evt);
        }
        if (
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', ' '].includes(e.key) ||
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)
        ) {
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'Shift' && transformControlsRef.current && !snapEnabledRef.current) {
        transformControlsRef.current.setTranslationSnap(0.5);
        transformControlsRef.current.setRotationSnap(15 * DEG2RAD);
        transformControlsRef.current.setScaleSnap(0.25);
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (isMod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (isMod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }
      if (isMod && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        handleCopySelected();
        return;
      }
      if (isMod && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        handlePasteClipboard();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleFocusSelected();
        return;
      }
      if (e.key === 'q' || e.key === 'Q') {
        setGizmoMode('select');
        transformControlsRef.current?.detach();
        triggerRender();
      } else if (e.key === 'w' || e.key === 'W') {
        setGizmoMode('translate');
        transformControlsRef.current?.setMode('translate');
        syncGizmoAttachment(selectedUuidsRef.current, simStateRef.current);
        triggerRender();
      } else if (e.key === 'e' || e.key === 'E') {
        setGizmoMode('rotate');
        transformControlsRef.current?.setMode('rotate');
        syncGizmoAttachment(selectedUuidsRef.current, simStateRef.current);
        triggerRender();
      } else if (e.key === 'r' || e.key === 'R') {
        setGizmoMode('scale');
        transformControlsRef.current?.setMode('scale');
        syncGizmoAttachment(selectedUuidsRef.current, simStateRef.current);
        triggerRender();
      } else if (e.key === 'Escape') {
        setAddNodeDropdownOpen(false);
        setTopMenuOpen(null);
        setPlayDropdownOpen(false);
        setInspectorScriptDropdownOpen(false);
        if (isLinkingParentRef.current) {
          setIsLinkingParent(false);
          isLinkingParentRef.current = false;
        } else if (selectedUuidsRef.current.length > 0) {
          setSelectedUuids([]);
          selectedUuidsRef.current = [];
          syncGizmoAttachment([], simStateRef.current);
          syncUiSnapshot();
          setStatusMessage('Seleção limpa (Esc) — exibindo configurações de Ambiente da Cena');
          triggerRender();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      Input.feedKeyUp(e.code);
      Input.feedKeyUp(e.key);
      if (simStateRef.current === 'playing' && sceneRootRef.current) {
        const evt = Input.createEvent({
          type: 'keyup',
          key: e.key,
          code: e.code,
        });
        Input.dispatchEventToTree(sceneRootRef.current, evt);
      }
      if (e.key === 'Shift' && transformControlsRef.current && !snapEnabledRef.current) {
        transformControlsRef.current.setTranslationSnap(null);
        transformControlsRef.current.setRotationSnap(null);
        transformControlsRef.current.setScaleSnap(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    handleCopySelected,
    handleDeleteSelected,
    handleDuplicateSelected,
    handleFocusSelected,
    handlePasteClipboard,
    handleRedo,
    handleUndo,
    syncGizmoAttachment,
    syncUiSnapshot,
    triggerRender,
  ]);

  // Switch Gizmo Mode (Selecionar / Mover / Rotacionar / Escalar)
  const handleSelectGizmoMode = (mode: GizmoMode) => {
    setGizmoMode(mode);
    setIsLinkingParent(false);
    isLinkingParentRef.current = false;
    if (mode === 'select') {
      transformControlsRef.current?.detach();
      triggerRender();
      return;
    }
    if (transformControlsRef.current) {
      transformControlsRef.current.setMode(mode);
      syncGizmoAttachment(selectedUuidsRef.current, simStateRef.current);
      triggerRender();
    }
  };

  // Toggle X/Y/Z Origin Axis Guides visibility in the 3D Viewport
  const handleToggleAxisGuide = useCallback(
    (axis: 'x' | 'y' | 'z') => {
      setAxisGuidesVisibility((prev) => {
        const next = { ...prev, [axis]: !prev[axis] };
        if (editorGuidesRef.current) {
          setEditorAxisGuidesVisibility(editorGuidesRef.current, next);
        }
        triggerRender();
        return next;
      });
    },
    [triggerRender]
  );

  // Cycle Gizmo Coordinate Space (Auto -> Local -> Global)
  const handleCycleGizmoSpace = () => {
    const order: GizmoSpaceMode[] = ['auto', 'local', 'world'];
    const next = order[(order.indexOf(gizmoSpace) + 1) % order.length];
    setGizmoSpace(next);
    gizmoSpaceRef.current = next;
    syncGizmoAttachment(selectedUuidsRef.current, simStateRef.current, next);
  };

  /**
   * Loads the playable Geometric Mini-Game ("Guardião Geométrico: Arena dos Cristais")
   * built exclusively with Mesh3D geometric shapes, Path3D, Particles3D, AnimationPlayer, UILayer & Scripts.
   */
  const handleLoadGeometricMiniGame = (autoStartPlay = true) => {
    setSimState('stopped');
    simStateRef.current = 'stopped';
    setWorkspaceMode('3D');

    const miniGameRoot = createGeometricMiniGameScene();
    const serialized = miniGameRoot.serialize();
    prePlaySnapshotRef.current = serialized;
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoCount(0);
    setRedoCount(0);
    setIsDirty(false);

    loadSceneDataIntoRam(serialized, {
      autoSelectDefaultIfEmpty: true,
      statusText:
        '🎮 Joguinho Geométrico carregado! Use WASD / Setas, Espaço (Pulso) ou clique nos cristais 3D para jogar!',
    });

    if (cameraRef.current && orbitControlsRef.current) {
      cameraRef.current.position.set(0, 10.2, 12.2);
      orbitControlsRef.current.target.set(0, 0.5, 0);
      orbitControlsRef.current.update();
    }

    if (autoStartPlay) {
      setTimeout(() => {
        const root = sceneRootRef.current;
        if (!root) return;
        prePlaySnapshotRef.current = root.serialize();
        root.initializeSceneLifecycle();
        if (editorGuidesRef.current) {
          editorGuidesRef.current.visible = !usePlayCamRef.current;
        }
        setSimState('playing');
        simStateRef.current = 'playing';
        if (sceneTreeRef.current) sceneTreeRef.current.isPlaying = true;
        syncGizmoAttachment(selectedUuidsRef.current, 'playing');
        triggerRender();
      }, 40);
    }
  };

  /**
   * Simulation Controls: Play, Pause, Step +1 Frame, Stop & Auto-Reset
   */
  const handleStartOrResumePlay = () => {
    const root = sceneRootRef.current;
    if (!root || !hasSceneRootRef.current) return;
    setWorkspaceMode('3D');
    setPlayDropdownOpen(false);

    if (simState === 'stopped') {
      prePlaySnapshotRef.current = root.serialize();
      root.initializeSceneLifecycle();
      if (cameraRef.current && orbitControlsRef.current) {
        savedEditorCamRef.current = {
          pos: cameraRef.current.position.clone(),
          target: orbitControlsRef.current.target.clone(),
        };
        if (usePlayCamRef.current) {
          const activeCamNode = NodeFactory.findActiveCameraRecursively(root);
          const isMiniGame = Boolean(root.getNodeOrNull('%PlayerCore'));
          if (activeCamNode && !isMiniGame) {
            const gp = activeCamNode.position_global;
            cameraRef.current.position.set(gp.x, gp.y, gp.z);
            cameraRef.current.quaternion.copy(activeCamNode.quaternion_global);
          } else if (isMiniGame) {
            cameraRef.current.position.set(0, 10.2, 12.2);
            orbitControlsRef.current.target.set(0, 0.5, 0);
          } else {
            cameraRef.current.position.set(0, 6.5, 14.5);
            orbitControlsRef.current.target.set(0, 1.5, 0);
          }
          orbitControlsRef.current.update();
        }
      }
    }

    if (editorGuidesRef.current) {
      editorGuidesRef.current.visible = !usePlayCamRef.current;
    }

    setIsLinkingParent(false);
    isLinkingParentRef.current = false;
    setSimState('playing');
    simStateRef.current = 'playing';
    if (sceneTreeRef.current) sceneTreeRef.current.isPlaying = true;
    syncGizmoAttachment(selectedUuidsRef.current, 'playing');
    setStatusMessage(
      `Execução ativa (${timeScale}x) — Ciclo de vida nativo (start/input/update) e Física unificada ativos`
    );
    triggerRender();
  };

  const handlePauseSimulation = () => {
    if (simState !== 'playing') return;
    setSimState('paused');
    simStateRef.current = 'paused';
    syncUiSnapshot();
    setStatusMessage('Simulação pausada no frame atual — use "+1 Frame" para avançar ou "Parar" para resetar');
    triggerRender();
  };

  const handleStepSingleFrame = () => {
    const root = sceneRootRef.current;
    if (!root || !hasSceneRootRef.current) return;

    if (simState === 'stopped') {
      prePlaySnapshotRef.current = root.serialize();
      root.initializeSceneLifecycle();
    }

    if (editorGuidesRef.current) {
      editorGuidesRef.current.visible = !usePlayCamRef.current;
    }

    setSimState('paused');
    simStateRef.current = 'paused';
    syncGizmoAttachment(selectedUuidsRef.current, 'paused');

    const physics = PhysicsServer.getInstance();
    const dt = (1 / 60) * physics.timeScale;
    root.update(dt);
    physics.step(1 / 60);
    syncUiSnapshot();
    setStatusMessage('Avançou +1 frame de simulação física (1/60s)');
    triggerRender();
  };

  const handleStopAndResetSimulation = () => {
    const root = sceneRootRef.current;
    if (!root || simState === 'stopped') return;

    setSimState('stopped');
    simStateRef.current = 'stopped';

    if (editorGuidesRef.current) {
      editorGuidesRef.current.visible = true;
    }

    // Restore Editor Camera if saved
    if (savedEditorCamRef.current && cameraRef.current && orbitControlsRef.current) {
      cameraRef.current.position.copy(savedEditorCamRef.current.pos);
      orbitControlsRef.current.target.copy(savedEditorCamRef.current.target);
      orbitControlsRef.current.update();
      savedEditorCamRef.current = null;
    }

    const snapshotToRestore = prePlaySnapshotRef.current || root.serialize();
    loadSceneDataIntoRam(snapshotToRestore, {
      preserveSelectionUuids: selectedUuidsRef.current,
      statusText: 'Simulação Física desligada — cena, guias e câmera resetadas para o estado do Editor',
    });
  };

  const handleTimeScaleChange = (newScale: number) => {
    setTimeScale(newScale);
    PhysicsServer.getInstance().setTimeScale(newScale);
    setStatusMessage(`Velocidade da simulação ajustada para ${newScale}x`);
  };

  // Toggle node visibility (Eye icon) or Lock (Padlock icon) in the Tree
  const handleToggleNodeVisible = (uuid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const root = sceneRootRef.current;
    const node = findEngineNodeByUuid(root, uuid);
    if (!root || !node) return;
    node.setEditorVisible(!node.editorVisible);
    syncGizmoAttachment(selectedUuidsRef.current, simStateRef.current);
    syncUiSnapshot();
    triggerRender();
  };

  const handleToggleNodeLocked = (uuid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const root = sceneRootRef.current;
    const node = findEngineNodeByUuid(root, uuid);
    if (!root || !node) return;
    node.setEditorLocked(!node.editorLocked);
    syncGizmoAttachment(selectedUuidsRef.current, simStateRef.current);
    syncUiSnapshot();
    triggerRender();
  };

  /**
   * Instantiates any pre-existing EngineNode type (`Node3D`, `Mesh3D`, `CollisionShape3D`,
   * `Camera3D`, `DirectionalLight3D`, `PointLight3D`, `Sprite3D`, `Particles3D`, `Path3D`,
   * `UILayer`, `AnimationPlayer`, `Timer`, `Node`).
   * - If the scene has no Root Node yet (`!hasSceneRootRef.current`), this node becomes the Scene Root (`Nó Pai da Cena`).
   * - Otherwise, it is added as a child of the currently selected node (or the Scene Root).
   */
  const handleCreatePreExistingNode = useCallback(
    (nodeKind: string) => {
      if (simStateRef.current !== 'stopped') {
        handleStopAndResetSimulation();
      }
      setAddNodeDropdownOpen(false);

      const isCreatingRoot = !hasSceneRootRef.current || !sceneRootRef.current;
      const root = sceneRootRef.current;
      const selectedParent =
        !isCreatingRoot && root
          ? findEngineNodeByUuid(root, selectedUuidsRef.current[0] || null) || root
          : null;

      const idx = isCreatingRoot ? '' : `_${treeItems.length}`;
      let created: any;

      if (nodeKind === 'Node3D') {
        created = new Node3D(`Node3D${idx}`);
      } else if (nodeKind === 'Mesh3D') {
        const mesh = new Mesh3D(`Mesh3D${idx}`, {
          shape: 'octahedron',
          color: '#38bdf8',
          roughness: 0.25,
          metalness: 0.35,
          shapeParams: { radius: 0.85 },
        });
        if (!isCreatingRoot && selectedParent === root) {
          mesh.position = { x: 0, y: 1.4, z: 0 };
        }
        created = mesh;
      } else if (nodeKind === 'CollisionShape3D') {
        const isChildOfMesh = selectedParent instanceof Mesh3D;
        const col = new CollisionShape3DNode({
          name: `CollisionShape3D${idx}`,
          shapeType: isChildOfMesh ? 'Trimesh' : 'Box',
          trimeshSourceShape: 'auto',
          size: { x: 1.2, y: 1.2, z: 1.2 },
          radius: 0.65,
          height: 1.4,
        });
        if (!isCreatingRoot && selectedParent === root) {
          col.position = { x: 0, y: 1.2, z: 0 };
        }
        created = col;
      } else if (nodeKind === 'Camera3D') {
        const camNode = new Camera3D(`Camera3D${idx}`, {
          projection: 'perspective',
          fov: 60,
          aspect: 1.7778,
          near: 0.2,
          far: 60,
          current: false,
        });
        if (!isCreatingRoot) {
          camNode.position = { x: 0, y: 3.5, z: 6.5 };
          camNode.lookAt(0, 0.8, 0);
        }
        created = camNode;
      } else if (nodeKind === 'DirectionalLight3D') {
        const light = new DirectionalLight3D(`DirectionalLight3D${idx}`, {
          color: '#fff7ed',
          intensity: 1.6,
          castShadow: true,
        });
        light.position = { x: 5, y: 9, z: 5 };
        created = light;
      } else if (nodeKind === 'PointLight3D') {
        const light = new PointLight3D(`PointLight3D${idx}`, {
          color: '#38bdf8',
          intensity: 2.2,
          distance: 15,
        });
        light.position = { x: 0, y: 2.5, z: 0 };
        created = light;
      } else if (nodeKind === 'Sprite3D') {
        const sp = new Sprite3DNode({
          name: `Sprite3D${idx}`,
          texturePath: 'assets/textures/hazard_stripes.png',
          renderMode: 'plane',
          width: 1.4,
          height: 1.4,
        });
        if (!isCreatingRoot && selectedParent === root) {
          sp.position = { x: 0, y: 1.5, z: 0 };
        }
        created = sp;
      } else if (nodeKind === 'Particles3D') {
        const pt = new Particles3D(`Particles3D${idx}`, {
          amount: 36,
          lifetime: 1.6,
          speed: 2.4,
          spread: 180,
          color: '#38bdf8',
          size: 0.16,
          emitting: true,
        });
        if (!isCreatingRoot && selectedParent === root) {
          pt.position = { x: 0, y: 1.2, z: 0 };
        }
        created = pt;
      } else if (nodeKind === 'Path3D') {
        created = new Path3D(`Path3D${idx}`);
      } else if (nodeKind === 'UILayer') {
        created = new UILayer(`UILayer${idx}`);
      } else if (nodeKind === 'AnimationPlayer') {
        created = new AnimationPlayer(`AnimationPlayer${idx}`);
      } else if (nodeKind === 'Timer') {
        created = new Timer(`Timer${idx}`, { waitTime: 1.0, autostart: true });
      } else {
        created = new Node(`Node${idx}`);
      }

      if (isCreatingRoot) {
        const threeScene = threeSceneRef.current;
        if (sceneRootRef.current && threeScene) {
          threeScene.remove(sceneRootRef.current);
        }
        created.setEnvironment(sceneEnvironment);
        const st = new SceneTree(created);
        st.setNodeFactory(NodeFactory);
        sceneTreeRef.current = st;
        if (threeScene) {
          threeScene.add(created);
        }
        sceneRootRef.current = created;
        hasSceneRootRef.current = true;
        setHasSceneRoot(true);
        undoStackRef.current = [];
        redoStackRef.current = [];
        setUndoCount(0);
        setRedoCount(0);
        setIsDirty(true);

        const nextSel = [created.uuid];
        setSelectedUuids(nextSel);
        selectedUuidsRef.current = nextSel;
        syncGizmoAttachment(nextSel, simStateRef.current);
        syncUiSnapshot();
        setStatusMessage(
          `Nó Pai da Cena criado: "${created.name}" (${created.nodeType}). Use o botão "+" para adicionar nós filhos!`
        );
        triggerRender();
        return;
      }

      if (!root || !selectedParent) return;
      const beforeSnap = root.serialize();
      selectedParent.add(created);

      // Re-create shape now that CollisionShape3D has its parent attached (for 'Trimesh' auto-detection)
      if (created instanceof CollisionShape3DNode) {
        created.createCannonShape();
        if (selectedParent instanceof RigidBody3DNode) {
          selectedParent.rebuildShapesFromChildren();
        }
      }

      pushUndoSnapshot(`Criar ${created.name}`, beforeSnap);
      const nextSel = [created.uuid];
      setSelectedUuids(nextSel);
      selectedUuidsRef.current = nextSel;
      syncGizmoAttachment(nextSel, simStateRef.current);
      syncUiSnapshot();
      setStatusMessage(
        `"${created.name}" (${created.nodeType}) adicionado como filho de "${selectedParent.name}"`
      );
      triggerRender();
    },
    [
      pushUndoSnapshot,
      sceneEnvironment,
      syncGizmoAttachment,
      syncUiSnapshot,
      treeItems.length,
      triggerRender,
    ]
  );

  // Spawn Prefab or Node at specified world position (used by Bottom Assets Shelf & Drag-and-Drop)
  const spawnAssetAtPosition = useCallback(
    (assetId: string, dropPos = { x: 0, y: 3.5, z: 0 }) => {
      if (simStateRef.current !== 'stopped') {
        handleStopAndResetSimulation();
      }

      // If no Scene Root exists yet, automatically create a Node3D root first
      if (!hasSceneRootRef.current || !sceneRootRef.current) {
        const autoRoot = new Node3D('Node3D');
        autoRoot.setEnvironment(sceneEnvironment);
        const st = new SceneTree(autoRoot);
        st.setNodeFactory(NodeFactory);
        sceneTreeRef.current = st;
        if (threeSceneRef.current) {
          threeSceneRef.current.add(autoRoot);
        }
        sceneRootRef.current = autoRoot;
        hasSceneRootRef.current = true;
        setHasSceneRoot(true);
      }

      const root = sceneRootRef.current;
      if (!root) return;

      const beforeSnap = root.serialize();
      const idx = treeItems.length;
      let created: EngineNode;

      if (assetId === 'prefab_crate' || assetId === 'box') {
        const rb = new RigidBody3DNode({
          name: `CaixoteCargo_${idx}`,
          mass: 2.0,
          bodyType: 'dynamic',
        });
        rb.position = dropPos;
        rb.add(
          new CollisionShape3DNode({
            name: `CollisionShape3D_${idx}`,
            shapeType: 'Box',
            size: { x: 1.2, y: 1.2, z: 1.2 },
          })
        );
        const decal = new Sprite3DNode({
          name: `TexturaCargo_${idx}`,
          texturePath: 'assets/textures/crate_cargo.png',
          renderMode: 'plane',
          width: 0.95,
          height: 0.95,
        });
        decal.position = { x: 0, y: 0, z: 0.62 };
        rb.add(decal);
        created = rb;
      } else if (assetId === 'prefab_sphere' || assetId === 'sphere') {
        const rb = new RigidBody3DNode({
          name: `EsferaCinetica_${idx}`,
          mass: 1.5,
          bodyType: 'dynamic',
        });
        rb.position = dropPos;
        rb.add(
          new CollisionShape3DNode({
            name: `CollisionShape3D_${idx}`,
            shapeType: 'Sphere',
            radius: 0.65,
          })
        );
        created = rb;
      } else if (assetId === 'prefab_ramp') {
        const rb = new RigidBody3DNode({
          name: `RampaDefletora_${idx}`,
          mass: 0,
          bodyType: 'static',
        });
        rb.position = { x: dropPos.x, y: Math.max(1.2, dropPos.y), z: dropPos.z };
        rb.rotation.set(0, 0, -0.25);
        rb.add(
          new CollisionShape3DNode({
            name: `CollisionShape3D_${idx}`,
            shapeType: 'Box',
            size: { x: 3.6, y: 0.35, z: 2.4 },
          })
        );
        rb.syncTransformToBody();
        created = rb;
      } else if (assetId === 'prefab_spinner') {
        const rb = new RigidBody3DNode({
          name: `RotorMecanico_${idx}`,
          mass: 0,
          bodyType: 'kinematic',
        });
        rb.position = { x: dropPos.x, y: Math.max(1.5, dropPos.y), z: dropPos.z };
        rb.components.push({
          id: `comp_rot_${Date.now()}`,
          type: 'Rotator',
          enabled: true,
          params: { speedX: 0, speedY: 90, speedZ: 0 },
        });
        rb.add(
          new CollisionShape3DNode({
            name: `CollisionShape3D_${idx}`,
            shapeType: 'Box',
            size: { x: 3.2, y: 0.4, z: 0.6 },
          })
        );
        created = rb;
      } else if (assetId === 'prefab_bouncer') {
        const rb = new RigidBody3DNode({
          name: `CapsulaPropulsora_${idx}`,
          mass: 1.8,
          bodyType: 'dynamic',
        });
        rb.position = dropPos;
        rb.components.push({
          id: `comp_thr_${Date.now()}`,
          type: 'Thruster',
          enabled: true,
          params: { interval: 1.6, impulseY: 8.5 },
        });
        rb.add(
          new CollisionShape3DNode({
            name: `CollisionShape3D_${idx}`,
            shapeType: 'Sphere',
            radius: 0.6,
          })
        );
        created = rb;
      } else if (assetId === 'sprite') {
        const sp = new Sprite3DNode({
          name: `Sprite3D_${idx}`,
          texturePath: 'assets/textures/hazard_stripes.png',
          renderMode: 'plane',
          width: 1.4,
          height: 1.4,
        });
        sp.position = dropPos;
        created = sp;
      } else if (assetId === 'mesh_geo') {
        const mesh = new Mesh3D({
          name: `Mesh3D_${idx}`,
          shape: 'octahedron',
          color: '#38bdf8',
          roughness: 0.25,
          metalness: 0.35,
          size: { radius: 0.7 },
        });
        mesh.position = dropPos;
        created = mesh;
      } else if (assetId === 'camera') {
        const camNode = new Camera3D(`Camera3D_${idx}`, {
          projection: 'perspective',
          fov: 60,
          aspect: 1.7778,
          near: 0.2,
          far: 45,
          current: false,
        });
        camNode.position = { x: dropPos.x, y: Math.max(2.5, dropPos.y), z: dropPos.z + 4 };
        camNode.lookAt(0, 0.8, 0);
        created = camNode;
      } else {
        const grp = new Node3D(`Node3D_${idx}`);
        grp.position = dropPos;
        created = grp;
      }

      root.add(created);
      pushUndoSnapshot(`Criar ${created.name}`, beforeSnap);
      const nextSel = [created.uuid];
      setSelectedUuids(nextSel);
      selectedUuidsRef.current = nextSel;
      syncGizmoAttachment(nextSel, simStateRef.current);
      syncUiSnapshot();
      setStatusMessage(`"${created.name}" adicionado na cena`);
      triggerRender();
    },
    [
      pushUndoSnapshot,
      sceneEnvironment,
      syncGizmoAttachment,
      syncUiSnapshot,
      treeItems.length,
      triggerRender,
    ]
  );

  // Handle Drag-and-Drop of Assets (Prefabs or Textures) onto the 3D Viewport Canvas
  const handleViewportDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleViewportDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const assetType = e.dataTransfer.getData('application/maxros-asset-type');
    const assetPayload = e.dataTransfer.getData('application/maxros-asset-payload');
    if (!assetType || !assetPayload) return;

    const mount = canvasMountRef.current;
    const cam = cameraRef.current;
    if (!mount || !cam) return;

    const rect = mount.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, cam);

    if (assetType === 'texture') {
      const root = sceneRootRef.current;
      if (!root) return;
      // Check if dropped onto a 3D object
      const hits = raycaster.intersectObjects([root], true);
      for (const hit of hits) {
        if (hit.object.userData?.isColliderWireframe) continue;
        const owner: EngineNode | null = hit.object.userData?.ownerNode || null;
        if (owner) {
          const beforeSnap = root.serialize();
          if (owner instanceof Sprite3DNode) {
            owner.setTexture(assetPayload);
          } else {
            // Find or attach a Sprite3DNode decal child
            let childSprite = owner.children.find(
              (c): c is Sprite3DNode => c instanceof Sprite3DNode
            );
            if (!childSprite) {
              childSprite = new Sprite3DNode({
                name: `${owner.name}_Decal`,
                texturePath: assetPayload,
                renderMode: 'plane',
                width: 1.0,
                height: 1.0,
              });
              childSprite.position = { x: 0, y: 0, z: 0.65 };
              owner.add(childSprite);
            } else {
              childSprite.setTexture(assetPayload);
            }
          }
          pushUndoSnapshot(`Aplicar textura em ${owner.name}`, beforeSnap);
          syncUiSnapshot();
          setStatusMessage(`Textura "${assetPayload}" aplicada em "${owner.name}"`);
          triggerRender();
          return;
        }
      }
      return;
    }

    // Intersect with horizontal plane y = 2.5 to spawn the prefab where dropped
    const dropPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -2.5);
    const intersectPt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dropPlane, intersectPt)) {
      const clampedX = Math.max(-6, Math.min(6, roundNum(intersectPt.x, 1)));
      const clampedZ = Math.max(-6, Math.min(6, roundNum(intersectPt.z, 1)));
      spawnAssetAtPosition(assetPayload, { x: clampedX, y: 3.2, z: clampedZ });
    } else {
      spawnAssetAtPosition(assetPayload, { x: 0, y: 3.5, z: 0 });
    }
  };

  // Property Editors (Right Panel)
  const primarySelectedUuid = selectedUuids[0] || null;
  const selectedItem = primarySelectedUuid
    ? treeItems.find((item) => item.uuid === primarySelectedUuid) || null
    : null;
  const rootItem = treeItems[0] || null;

  const handleClearSelection = useCallback(() => {
    setSelectedUuids([]);
    selectedUuidsRef.current = [];
    syncGizmoAttachment([], simStateRef.current);
    syncUiSnapshot();
    setStatusMessage('Nenhum nó selecionado — editando Ambiente da Cena no painel direito');
    triggerRender();
  }, [syncGizmoAttachment, syncUiSnapshot, triggerRender]);

  const handleEnvironmentColorChange = (rawColor: string) => {
    if (simStateRef.current !== 'stopped') return;
    const normalizedColor = /^#[0-9a-fA-F]{6}$/.test(rawColor.trim())
      ? rawColor.trim().toLowerCase()
      : DEFAULT_SCENE_ENVIRONMENT.color;

    const root = sceneRootRef.current;
    if (!root) {
      applyEnvironmentToViewport({ mode: 'solid_color', color: normalizedColor });
      triggerRender();
      return;
    }
    if (root.environment?.color?.toLowerCase() === normalizedColor) return;

    const beforeSnap = root.serialize();
    const updatedEnv = root.setEnvironment({
      mode: 'solid_color',
      color: normalizedColor,
    });
    applyEnvironmentToViewport(updatedEnv);
    pushUndoSnapshot(`Alterar cor do ambiente (${normalizedColor})`, beforeSnap);
    setStatusMessage(`Ambiente atualizado: Cor sólida ${normalizedColor.toUpperCase()}`);
    triggerRender();
  };

  const handleEnvironmentModeChange = (modeValue: string) => {
    const root = sceneRootRef.current;
    if (!root || simStateRef.current !== 'stopped') return;
    const nextMode = modeValue === 'solid_color' ? 'solid_color' : 'solid_color';
    if (root.environment?.mode === nextMode) return;
    const beforeSnap = root.serialize();
    const updatedEnv = root.setEnvironment({ mode: nextMode });
    applyEnvironmentToViewport(updatedEnv);
    pushUndoSnapshot('Alterar modo do ambiente', beforeSnap);
    triggerRender();
  };

  const handlePositionChange = (axis: 'x' | 'y' | 'z', rawValue: string) => {
    const num = parseFloat(rawValue);
    if (Number.isNaN(num)) return;

    const root = sceneRootRef.current;
    const node = findEngineNodeByUuid(root, primarySelectedUuid);
    if (!root || !node || node.editorLocked) return;

    const beforeSnap = root.serialize();
    const isTopLevelParent = !node.parent || node.parent === root;
    if (isTopLevelParent) {
      const gp = node.position_global;
      node.position_global = {
        x: axis === 'x' ? num : gp.x,
        y: axis === 'y' ? num : gp.y,
        z: axis === 'z' ? num : gp.z,
      };
    } else {
      node.position = {
        x: axis === 'x' ? num : node.position.x,
        y: axis === 'y' ? num : node.position.y,
        z: axis === 'z' ? num : node.position.z,
      };
    }

    if (node.sceneInstance) {
      node.sceneInstance.localOverrides = {
        ...(node.sceneInstance.localOverrides || {}),
        position: { x: node.position.x, y: node.position.y, z: node.position.z },
      };
    }

    node.notifySubtreeTransformChanged();
    pushUndoSnapshot(`Editar Position.${axis}`, beforeSnap);
    syncUiSnapshot();
    triggerRender();
  };

  const handleRotationChange = (axis: 'x' | 'y' | 'z', rawValue: string) => {
    const deg = parseFloat(rawValue);
    if (Number.isNaN(deg)) return;

    const root = sceneRootRef.current;
    const node = findEngineNodeByUuid(root, primarySelectedUuid);
    if (!root || !node || node.editorLocked) return;

    const beforeSnap = root.serialize();
    const rad = deg * DEG2RAD;
    node.rotation.set(
      axis === 'x' ? rad : node.rotation.x,
      axis === 'y' ? rad : node.rotation.y,
      axis === 'z' ? rad : node.rotation.z
    );

    if (node.sceneInstance) {
      node.sceneInstance.localOverrides = {
        ...(node.sceneInstance.localOverrides || {}),
        rotation: { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z },
      };
    }

    node.notifySubtreeTransformChanged();
    pushUndoSnapshot(`Editar Rotation.${axis}`, beforeSnap);
    syncUiSnapshot();
    triggerRender();
  };

  const handleScaleChange = (axis: 'x' | 'y' | 'z', rawValue: string) => {
    const val = parseFloat(rawValue);
    if (Number.isNaN(val) || Math.abs(val) < 0.05) return;

    const root = sceneRootRef.current;
    const node = findEngineNodeByUuid(root, primarySelectedUuid);
    if (!root || !node || node.editorLocked) return;

    const beforeSnap = root.serialize();
    node.scale.set(
      axis === 'x' ? val : node.scale.x,
      axis === 'y' ? val : node.scale.y,
      axis === 'z' ? val : node.scale.z
    );

    if (node.sceneInstance) {
      node.sceneInstance.localOverrides = {
        ...(node.sceneInstance.localOverrides || {}),
        scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
      };
    }

    node.notifySubtreeTransformChanged();
    pushUndoSnapshot(`Editar Scale.${axis}`, beforeSnap);
    syncUiSnapshot();
    triggerRender();
  };

  const handleNodePropertyChange = (prop: string, value: any) => {
    const root = sceneRootRef.current;
    const node = findEngineNodeByUuid(root, primarySelectedUuid);
    if (!root || !node) return;

    const beforeSnap = root.serialize();

    if (prop === 'name') {
      node.name = String(value);
      if (node.sceneInstance) {
        node.sceneInstance.localOverrides = {
          ...(node.sceneInstance.localOverrides || {}),
          name: node.name,
        };
      }
    } else if (prop === 'uniqueName') {
      node.uniqueName = Boolean(value);
    } else if (prop === 'physicsMode') {
      const nextMode =
        value === 'dynamic' || value === 'static' || value === 'kinematic' ? value : 'none';
      node.physicsMode = nextMode;
    } else if (prop === 'nodeMass') {
      node.mass = Math.max(0.05, parseFloat(value) || 1.0);
      if (node instanceof RigidBody3DNode) {
        node.setBodyType(node.bodyType, node.mass);
      }
    } else if (prop === 'useGravity') {
      node.useGravity = Boolean(value);
    } else if (prop === 'gravityY') {
      node.gravityY = parseFloat(value);
      if (Number.isNaN(node.gravityY)) node.gravityY = -9.82;
    } else if (prop === 'restitution') {
      node.restitution = Math.min(1, Math.max(0, parseFloat(value) || 0));
    } else if (prop === 'friction') {
      node.friction = Math.min(1, Math.max(0, parseFloat(value) || 0));
    } else if (prop === 'nodeLinearDamping') {
      node.linearDamping = Math.min(0.99, Math.max(0, parseFloat(value) || 0));
      if (node instanceof RigidBody3DNode) {
        node.body.linearDamping = node.linearDamping;
      }
    } else if (prop === 'floorY') {
      const parsed = parseFloat(value);
      node.floorY = Number.isNaN(parsed) ? 0.5 : parsed;
    } else if (prop === 'useFloorContact') {
      node.useFloorContact = Boolean(value);
    } else if (prop === 'nodeFixedRotation') {
      node.fixedRotation = Boolean(value);
      if (node instanceof RigidBody3DNode) {
        node.body.fixedRotation = Boolean(value);
        node.body.updateMassProperties();
      }
    } else if (prop === 'scriptCode') {
      const codeStr = String(value);
      if (node.scripts && node.scripts.length > 0) {
        node.scripts[0].code = codeStr;
        node.scripts[0]._instance = null;
      } else if (codeStr.trim()) {
        node.attachScript(codeStr, {}, `${node.name}Script`);
      }
    } else if (node instanceof Mesh3D) {
      if (prop === 'meshShape') {
        node.shape = String(value);
        for (const ch of node.children) {
          if (ch instanceof CollisionShape3DNode) {
            ch.createCannonShape();
          }
        }
      } else if (prop === 'meshColor') {
        node.color = String(value);
      } else if (prop === 'meshWireframe') {
        node.wireframe = Boolean(value);
      }
    } else if (node instanceof AnimationPlayer) {
      if (prop === 'animPlay') {
        node.play(String(value));
      }
    } else if (node instanceof RigidBody3DNode) {
      if (prop === 'bodyType') {
        node.setBodyType(value, node.mass || 1);
      } else if (prop === 'mass') {
        const m = Math.max(0, parseFloat(value) || 0);
        node.mass = m;
        node.setBodyType(node.bodyType, m);
      } else if (prop === 'linearDamping') {
        node.body.linearDamping = Math.min(1, Math.max(0, parseFloat(value) || 0));
      } else if (prop === 'fixedRotation') {
        node.body.fixedRotation = Boolean(value);
        node.body.updateMassProperties();
      }
    } else if (node instanceof CollisionShape3DNode) {
      if (prop === 'shapeType') {
        node.shapeType =
          value === 'Sphere' || value === 'Cylinder' || value === 'Trimesh' ? value : 'Box';
      } else if (prop === 'trimeshSourceShape') {
        node.trimeshSourceShape = String(value || 'auto');
      } else if (prop === 'dimX' || prop === 'dimY' || prop === 'dimZ') {
        const v = Math.max(0.1, parseFloat(value) || 0.1);
        if (prop === 'dimX') node.dimensions.x = v;
        if (prop === 'dimY') node.dimensions.y = v;
        if (prop === 'dimZ') node.dimensions.z = v;
      } else if (prop === 'radius') {
        node.radius = Math.max(0.05, parseFloat(value) || 0.5);
      } else if (prop === 'colliderHeight') {
        node.height = Math.max(0.05, parseFloat(value) || 1.0);
      }
      node.createCannonShape();
      if (node.parent instanceof RigidBody3DNode) {
        node.parent.rebuildShapesFromChildren();
      }
    } else if (node instanceof Camera3D) {
      if (prop === 'cameraProjection') {
        node.projection = value === 'orthographic' ? 'orthographic' : 'perspective';
      } else if (prop === 'cameraFov') {
        node.fov = Math.min(160, Math.max(10, parseFloat(value) || 60));
      } else if (prop === 'cameraAspect') {
        node.aspect = Math.min(4.0, Math.max(0.25, parseFloat(value) || 1.7778));
      } else if (prop === 'cameraSize') {
        node.size = Math.min(200, Math.max(0.5, parseFloat(value) || 10));
      } else if (prop === 'cameraNear') {
        const nextNear = Math.max(0.05, parseFloat(value) || 0.1);
        node.near = Math.min(nextNear, Math.max(0.2, node.far - 0.1));
      } else if (prop === 'cameraFar') {
        const nextFar = Math.max(node.near + 0.5, parseFloat(value) || 100);
        node.far = Math.min(2000, nextFar);
      } else if (prop === 'cameraCurrent') {
        const isCurr = Boolean(value);
        if (isCurr) {
          node.makeCurrent();
        } else {
          node.current = false;
        }
      }
      node._buildThreeCamera(node.aspect);
      node.updateMatrixWorld(true);
    } else if (node instanceof Sprite3DNode) {
      if (prop === 'renderMode') {
        node.renderMode = value === 'plane' ? 'plane' : 'sprite';
        node._rebuildVisualRepresentation();
      } else if (prop === 'width') {
        node.width = Math.max(0.1, parseFloat(value) || 1);
        node._rebuildVisualRepresentation();
      } else if (prop === 'height') {
        node.height = Math.max(0.1, parseFloat(value) || 1);
        node._rebuildVisualRepresentation();
      } else if (prop === 'texturePath') {
        node.setTexture(String(value));
      }
    }

    pushUndoSnapshot(`Editar ${prop}`, beforeSnap);
    syncUiSnapshot();
    triggerRender();
  };

  // Auxiliary Behavior Modifiers on Selected Node (Rotator, Oscillator, Thruster)
  // Note: Physics is now natively unified into EngineNode + update(delta)!
  const handleAddScriptComponent = (scriptType: 'Rotator' | 'Oscillator' | 'Thruster') => {
    const root = sceneRootRef.current;
    const node = findEngineNodeByUuid(root, primarySelectedUuid);
    if (!root || !node) return;

    const beforeSnap = root.serialize();
    const defaultParams =
      scriptType === 'Rotator'
        ? { speedX: 0, speedY: 90, speedZ: 0 }
        : scriptType === 'Oscillator'
        ? { axis: 'x', amplitude: 1.5, frequency: 1.0 }
        : { interval: 1.5, impulseY: 8.5 };

    node.components.push({
      id: `comp_${scriptType.toLowerCase()}_${Date.now()}`,
      type: scriptType,
      enabled: true,
      params: defaultParams,
    });

    pushUndoSnapshot(`Adicionar modificador ${scriptType}`, beforeSnap);
    syncUiSnapshot();
    setStatusMessage(`Modificador "${scriptType}" anexado a "${node.name}"`);
  };

  const handleUpdateScriptParam = (compId: string, paramKey: string, rawVal: any) => {
    const root = sceneRootRef.current;
    const node = findEngineNodeByUuid(root, primarySelectedUuid);
    if (!root || !node) return;

    const comp = node.components.find((c) => c.id === compId);
    if (!comp) return;
    comp.params[paramKey] =
      paramKey === 'axis' || paramKey === 'bodyType' ? String(rawVal) : parseFloat(rawVal) || 0;
    syncUiSnapshot();
  };

  const handleRemoveScriptComponent = (compId: string) => {
    const root = sceneRootRef.current;
    const node = findEngineNodeByUuid(root, primarySelectedUuid);
    if (!root || !node) return;

    const beforeSnap = root.serialize();
    node.components = node.components.filter((c) => c.id !== compId);
    pushUndoSnapshot('Remover componente', beforeSnap);
    syncUiSnapshot();
  };

  // ============================================================================
  // CHILD SCENE INSTANCING (`🎬`), MULTI-SCENE TABS & BIDIRECTIONAL PROPAGATION
  // ============================================================================
  const handleInstantiateChildScene = useCallback(
    (sourceSceneUuid: string, sourceScenePath: string, customName?: string) => {
      if (simStateRef.current !== 'stopped') {
        handleStopAndResetSimulation();
      }
      setAddNodeDropdownOpen(false);

      // Ensure Scene Root exists
      if (!hasSceneRootRef.current || !sceneRootRef.current) {
        const autoRoot = new Node3D('Node3D');
        autoRoot.setEnvironment(sceneEnvironment);
        const st = new SceneTree(autoRoot);
        st.setNodeFactory(NodeFactory);
        sceneTreeRef.current = st;
        if (threeSceneRef.current) {
          threeSceneRef.current.add(autoRoot);
        }
        sceneRootRef.current = autoRoot;
        hasSceneRootRef.current = true;
        setHasSceneRoot(true);
      }

      const root = sceneRootRef.current;
      if (!root) return;

      const selectedParent =
        findEngineNodeByUuid(root, selectedUuidsRef.current[0] || null) || root;

      const beforeSnap = root.serialize();
      const childInstance = NodeFactory.instantiateChildScene(
        {
          sourceSceneUuid,
          sourceScenePath,
          localOverrides: customName
            ? { name: customName, position: { x: 0, y: 1.2, z: 0 } }
            : { position: { x: 0, y: 1.2, z: 0 } },
        },
        { physicsServer: PhysicsServer.getInstance() }
      );

      if (!childInstance) {
        setStatusMessage(`Não foi possível instanciar a Cena Filha (${sourceScenePath})`);
        return;
      }

      selectedParent.add(childInstance);
      pushUndoSnapshot(`Instanciar Cena Filha ${childInstance.name}`, beforeSnap);

      const nextSel = [childInstance.uuid];
      setSelectedUuids(nextSel);
      selectedUuidsRef.current = nextSel;
      syncGizmoAttachment(nextSel, simStateRef.current);
      syncUiSnapshot();
      setStatusMessage(
        `🎬 Cena Filha "${childInstance.name}" instanciada! Clique no ícone de Claquete (🎬) na árvore para abrir a cena original.`
      );
      triggerRender();
    },
    [pushUndoSnapshot, sceneEnvironment, syncGizmoAttachment, syncUiSnapshot, triggerRender]
  );

  const handleSelectSceneTab = useCallback(
    (targetTabId: string) => {
      if (targetTabId === activeSceneTabId) {
        setWorkspaceMode('3D');
        return;
      }
      if (simStateRef.current !== 'stopped') {
        handleStopAndResetSimulation();
      }

      const currentRoot = sceneRootRef.current;
      const currentSnapshot = currentRoot ? currentRoot.serialize() : null;

      setOpenSceneTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeSceneTabId
            ? { ...tab, sceneData: currentSnapshot, isDirty }
            : tab
        )
      );

      const targetTab = openSceneTabs.find((t) => t.id === targetTabId);
      setActiveSceneTabId(targetTabId);
      setWorkspaceMode('3D');

      if (targetTab?.sceneData) {
        loadSceneDataIntoRam(targetTab.sceneData, {
          autoSelectDefaultIfEmpty: true,
          statusText: `Aba de cena ativa: ${targetTab.name} (${targetTab.filePath})`,
        });
      }
    },
    [activeSceneTabId, isDirty, loadSceneDataIntoRam, openSceneTabs]
  );

  const handleOpenChildSceneTab = useCallback(
    (sourceSceneUuid: string | null, sourceScenePath: string | null) => {
      if (!sourceSceneUuid && !sourceScenePath) return;
      if (simStateRef.current !== 'stopped') {
        handleStopAndResetSimulation();
      }

      const currentRoot = sceneRootRef.current;
      const currentSnapshot = currentRoot ? currentRoot.serialize() : null;

      // Save current tab snapshot first
      setOpenSceneTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeSceneTabId
            ? { ...tab, sceneData: currentSnapshot, isDirty }
            : tab
        )
      );

      const existingTab = openSceneTabs.find(
        (t) =>
          (sourceSceneUuid && t.sceneUuid === sourceSceneUuid) ||
          (sourceScenePath && t.filePath === sourceScenePath)
      );

      if (existingTab) {
        setActiveSceneTabId(existingTab.id);
        setWorkspaceMode('3D');
        if (existingTab.sceneData) {
          loadSceneDataIntoRam(existingTab.sceneData, {
            autoSelectDefaultIfEmpty: true,
            statusText: `🎬 Editando Cena Original "${existingTab.name}" — salvar propagará para todas as instâncias`,
          });
        }
        return;
      }

      let tplData = NodeFactory.getSceneTemplate(sourceSceneUuid || sourceScenePath || '');
      if (!tplData) {
        const builtin = BUILTIN_CHILD_SCENES.find(
          (b) => b.uuid === sourceSceneUuid || b.path === sourceScenePath
        );
        if (builtin) {
          tplData = builtin.buildTemplate();
          NodeFactory.registerSceneTemplate({
            uuid: builtin.uuid,
            path: builtin.path,
            data: tplData,
          });
        }
      }

      if (!tplData) {
        setStatusMessage(`Template da cena "${sourceScenePath || sourceSceneUuid}" não encontrado.`);
        return;
      }

      const tabName =
        (sourceScenePath || 'child.scene')
          .split('/')
          .pop()
          ?.replace(/\.scene\.json$/i, '.scene') || 'child.scene';
      const newTabId = `tab_${sourceSceneUuid || Date.now()}`;
      const clonedTpl = JSON.parse(JSON.stringify(tplData));

      setOpenSceneTabs((prev) => [
        ...prev.map((t) =>
          t.id === activeSceneTabId ? { ...t, sceneData: currentSnapshot, isDirty } : t
        ),
        {
          id: newTabId,
          name: tabName,
          filePath: sourceScenePath || `scenes/${tabName}.json`,
          sceneUuid: sourceSceneUuid,
          isChildScene: true,
          isDirty: false,
          sceneData: clonedTpl,
        },
      ]);
      setActiveSceneTabId(newTabId);
      setWorkspaceMode('3D');
      loadSceneDataIntoRam(clonedTpl, {
        autoSelectDefaultIfEmpty: true,
        statusText: `🎬 Cena Original "${tabName}" aberta em nova aba — edite e salve (Ctrl+S) para propagar às instâncias!`,
      });
    },
    [activeSceneTabId, isDirty, loadSceneDataIntoRam, openSceneTabs]
  );

  const handleCloseSceneTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (openSceneTabs.length <= 1) return;
      const remaining = openSceneTabs.filter((t) => t.id !== tabId);
      setOpenSceneTabs(remaining);
      if (activeSceneTabId === tabId) {
        const nextTab = remaining[0];
        setActiveSceneTabId(nextTab.id);
        if (nextTab.sceneData) {
          loadSceneDataIntoRam(nextTab.sceneData, {
            autoSelectDefaultIfEmpty: true,
            statusText: `Retornou para a aba "${nextTab.name}"`,
          });
        }
      }
    },
    [activeSceneTabId, loadSceneDataIntoRam, openSceneTabs]
  );

  const handleCreateNewSceneTab = useCallback(() => {
    const currentRoot = sceneRootRef.current;
    const currentSnapshot = currentRoot ? currentRoot.serialize() : null;
    const idx = openSceneTabs.length + 1;
    const newUuid = `scene-custom-${Date.now()}`;
    const newName = `scene_${idx}.scene`;
    const newPath = `scenes/scene_${idx}.scene.json`;
    const freshRoot = new Node3D(`Scene_${idx}`);
    const freshData = freshRoot.serialize();

    NodeFactory.registerSceneTemplate({
      uuid: newUuid,
      path: newPath,
      data: freshData,
    });

    const newTabId = `tab_${newUuid}`;
    setOpenSceneTabs((prev) => [
      ...prev.map((t) =>
        t.id === activeSceneTabId ? { ...t, sceneData: currentSnapshot, isDirty } : t
      ),
      {
        id: newTabId,
        name: newName,
        filePath: newPath,
        sceneUuid: newUuid,
        isChildScene: false,
        isDirty: false,
        sceneData: freshData,
      },
    ]);
    setActiveSceneTabId(newTabId);
    setWorkspaceMode('3D');
    loadSceneDataIntoRam(freshData, {
      autoSelectDefaultIfEmpty: true,
      statusText: `Nova aba de cena criada: ${newName}`,
    });
  }, [activeSceneTabId, isDirty, loadSceneDataIntoRam, openSceneTabs.length]);

  // ============================================================================
  // INTEGRATED SCRIPTS WORKSPACE & SCROLL ICON (`📜`) HANDLERS
  // ============================================================================
  const fetchProjectScripts = useCallback(async () => {
    try {
      const res = await fetch('/api/scripts/list');
      const data = await res.json();
      if (res.ok && Array.isArray(data.scripts)) {
        const loadedEntries: ScriptFileEntry[] = data.scripts.map((s: any) => {
          const reg = ScriptClassLoader.registerScript({
            uuid: s.uuid,
            path: s.relativePath,
            sourceCode: s.content || '',
          });
          return {
            uuid: s.uuid,
            name: s.name,
            relativePath: s.relativePath,
            sourceCode: s.content || '',
            mtimeMs: s.mtimeMs,
            extendsClass: reg.extendsClass,
            className: reg.className,
          };
        });
        setScriptsList(loadedEntries);
        if (Array.isArray(data.folders) && data.folders.length > 0) {
          setScriptFolders(data.folders);
        }
      }
    } catch {
      // Fallback to in-memory registered scripts
      const mem = ScriptClassLoader.getAllScripts().map((d: any) => ({
        uuid: d.uuid,
        name: d.path.split('/').pop() || `${d.className || 'Script'}.js`,
        relativePath: d.path,
        sourceCode: d.sourceCode,
        extendsClass: d.extendsClass,
        className: d.className,
      }));
      setScriptsList(mem);
    }
  }, []);

  useEffect(() => {
    fetchProjectScripts();
  }, [fetchProjectScripts, activeProjectContext?.projectPath]);

  const handleOpenScriptFileInEditor = useCallback((script: ScriptFileEntry) => {
    setOpenScriptTabs((prev) => {
      const exists = prev.find((t) => t.uuid === script.uuid);
      if (exists) return prev;
      const syntaxCheck = ScriptClassLoader.validateSyntax(script.sourceCode, script.name);
      return [
        ...prev,
        {
          uuid: script.uuid,
          name: script.name,
          relativePath: script.relativePath,
          content: script.sourceCode,
          savedContent: script.sourceCode,
          mtimeMs: script.mtimeMs,
          syntaxError: syntaxCheck.valid ? null : syntaxCheck,
          externalConflict: null,
        },
      ];
    });
    setActiveScriptTabUuid(script.uuid);
    setWorkspaceMode('Scripts');
  }, []);

  const handleOpenNodeScriptByUuid = useCallback(
    (scriptUuid: string | null | undefined, nodeFallback?: FlatNodeItem) => {
      if (scriptUuid) {
        const found = scriptsList.find((s) => s.uuid === scriptUuid);
        if (found) {
          handleOpenScriptFileInEditor(found);
          return;
        }
        const reg = ScriptClassLoader.getScript(scriptUuid);
        if (reg) {
          const entry: ScriptFileEntry = {
            uuid: reg.uuid,
            name: reg.path.split('/').pop() || `${reg.className || 'Script'}.js`,
            relativePath: reg.path,
            sourceCode: reg.sourceCode,
            extendsClass: reg.extendsClass,
            className: reg.className,
          };
          handleOpenScriptFileInEditor(entry);
          return;
        }
      }
      if (nodeFallback) {
        setWorkspaceMode('Scripts');
      }
    },
    [handleOpenScriptFileInEditor, scriptsList]
  );

  const handleUpdateScriptTabContent = useCallback((uuid: string, newContent: string) => {
    setOpenScriptTabs((prev) =>
      prev.map((tab) => {
        if (tab.uuid !== uuid) return tab;
        const syntaxCheck = ScriptClassLoader.validateSyntax(newContent, tab.name);
        return {
          ...tab,
          content: newContent,
          syntaxError: syntaxCheck.valid ? null : syntaxCheck,
        };
      })
    );
  }, []);

  const handleSaveScriptTab = useCallback(
    async (uuid: string, forceOverwrite = false) => {
      const tab = openScriptTabs.find((t) => t.uuid === uuid);
      if (!tab) return;

      const syntaxCheck = ScriptClassLoader.validateSyntax(tab.content, tab.name);
      if (!syntaxCheck.valid) {
        setOpenScriptTabs((prev) =>
          prev.map((t) => (t.uuid === uuid ? { ...t, syntaxError: syntaxCheck } : t))
        );
        setStatusMessage(
          `Erro de Sintaxe em ${syntaxCheck.file} (Linha ${syntaxCheck.line}, Col ${syntaxCheck.column}): ${syntaxCheck.message}`
        );
        return;
      }

      const registered = ScriptClassLoader.registerScript({
        uuid: tab.uuid,
        path: tab.relativePath,
        sourceCode: tab.content,
      });

      // Re-apply updated class to any active scene nodes bound to this script UUID
      if (sceneRootRef.current) {
        const rebindTree = (n: EngineNode) => {
          if (n.scriptRef?.uuid === tab.uuid) {
            ScriptClassLoader.applyScriptClassToNode(n, registered);
          }
          for (const ch of n.children) {
            if (ch instanceof EngineNode) rebindTree(ch);
          }
        };
        rebindTree(sceneRootRef.current);
        syncUiSnapshot();
      }

      try {
        const res = await fetch('/api/scripts/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            relativePath: tab.relativePath,
            scriptUuid: tab.uuid,
            content: tab.content,
            expectedMtimeMs: forceOverwrite ? undefined : tab.mtimeMs,
            forceOverwrite,
          }),
        });
        const data = await res.json();

        if (res.status === 409 && data.conflict) {
          setOpenScriptTabs((prev) =>
            prev.map((t) =>
              t.uuid === uuid
                ? {
                    ...t,
                    externalConflict: {
                      diskContent: data.diskContent,
                      diskMtimeMs: data.diskMtimeMs,
                    },
                  }
                : t
            )
          );
          setStatusMessage(
            `Conflito detectado em "${tab.name}": o arquivo foi editado fora do editor.`
          );
          return;
        }

        if (res.ok && data.success) {
          setOpenScriptTabs((prev) =>
            prev.map((t) =>
              t.uuid === uuid
                ? {
                    ...t,
                    savedContent: tab.content,
                    mtimeMs: data.mtimeMs,
                    syntaxError: null,
                    externalConflict: null,
                  }
                : t
            )
          );
          await fetchProjectScripts();
          setStatusMessage(
            `📜 Script "${tab.name}" salvo e compilado com sucesso (extends ${registered.extendsClass || 'Node3D'})`
          );
        }
      } catch {
        // Offline / in-memory save fallback
        setOpenScriptTabs((prev) =>
          prev.map((t) =>
            t.uuid === uuid
              ? { ...t, savedContent: tab.content, syntaxError: null, externalConflict: null }
              : t
          )
        );
      }
    },
    [fetchProjectScripts, openScriptTabs, syncUiSnapshot]
  );

  const handleReloadScriptTabFromDisk = useCallback(
    (uuid: string, diskContent: string, diskMtimeMs: number) => {
      setOpenScriptTabs((prev) =>
        prev.map((t) => {
          if (t.uuid !== uuid) return t;
          const syntaxCheck = ScriptClassLoader.validateSyntax(diskContent, t.name);
          ScriptClassLoader.registerScript({
            uuid: t.uuid,
            path: t.relativePath,
            sourceCode: diskContent,
          });
          return {
            ...t,
            content: diskContent,
            savedContent: diskContent,
            mtimeMs: diskMtimeMs,
            syntaxError: syntaxCheck.valid ? null : syntaxCheck,
            externalConflict: null,
          };
        })
      );
      setStatusMessage('Arquivo recarregado do disco.');
    },
    []
  );

  const handleAssignScriptToSelectedNode = useCallback(
    (scriptUuid: string) => {
      const root = sceneRootRef.current;
      const node = findEngineNodeByUuid(root, primarySelectedUuid);
      if (!root || !node) return;

      const scriptEntry = scriptsList.find((s) => s.uuid === scriptUuid);
      let desc = ScriptClassLoader.getScript(scriptUuid);
      if (!desc && scriptEntry) {
        desc = ScriptClassLoader.registerScript({
          uuid: scriptEntry.uuid,
          path: scriptEntry.relativePath,
          sourceCode: scriptEntry.sourceCode,
        });
      }
      if (!desc) return;

      const beforeSnap = root.serialize();
      const result = ScriptClassLoader.applyScriptClassToNode(node, desc);
      setInspectorScriptDropdownOpen(false);

      if (!result.applied) {
        setStatusMessage(`Incompatibilidade de classe: ${result.reason}`);
        return;
      }

      pushUndoSnapshot(`Vincular script ${desc.className || desc.path}`, beforeSnap);
      syncUiSnapshot();
      setStatusMessage(
        `📜 Classe "${desc.className}" (extends ${desc.extendsClass}) vinculada a "${node.name}"!`
      );
    },
    [primarySelectedUuid, pushUndoSnapshot, scriptsList, syncUiSnapshot]
  );

  const handleRemoveScriptFromSelectedNode = useCallback(() => {
    const root = sceneRootRef.current;
    const node = findEngineNodeByUuid(root, primarySelectedUuid);
    if (!root || !node) return;

    const beforeSnap = root.serialize();
    ScriptClassLoader.removeScriptClassFromNode(node);
    node.scripts = [];
    setInspectorScriptDropdownOpen(false);
    pushUndoSnapshot(`Desvincular script de ${node.name}`, beforeSnap);
    syncUiSnapshot();
    setStatusMessage(`Script desvinculado de "${node.name}"`);
  }, [primarySelectedUuid, pushUndoSnapshot, syncUiSnapshot]);

  const handleCreateNewScript = useCallback(
    async (
      scriptName: string,
      baseClassName: string,
      folderPath: string,
      bindToSelectedNode: boolean
    ) => {
      const cleanClassName = toValidClassName(scriptName, 'CustomNodeScript');
      const fileName = `${cleanClassName}.js`;
      const relPath = `${folderPath.replace(/\/+$/, '')}/${fileName}`;
      const code = generateMinimalNodeScriptTemplate(cleanClassName, baseClassName);

      try {
        const res = await fetch('/api/scripts/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            relativePath: relPath,
            content: code,
            forceOverwrite: true,
          }),
        });
        const data = await res.json();
        const uuid = data.scriptUuid || `script-${Date.now()}`;
        const desc = ScriptClassLoader.registerScript({
          uuid,
          path: relPath,
          sourceCode: code,
        });

        await fetchProjectScripts();

        const newEntry: ScriptFileEntry = {
          uuid,
          name: fileName,
          relativePath: relPath,
          sourceCode: code,
          mtimeMs: data.mtimeMs,
          extendsClass: desc.extendsClass,
          className: desc.className,
        };

        handleOpenScriptFileInEditor(newEntry);

        if (bindToSelectedNode && sceneRootRef.current && primarySelectedUuid) {
          const targetNode = findEngineNodeByUuid(sceneRootRef.current, primarySelectedUuid);
          if (targetNode) {
            ScriptClassLoader.applyScriptClassToNode(targetNode, desc);
            syncUiSnapshot();
          }
        }
        setInspectorScriptDropdownOpen(false);
        setStatusMessage(`📜 Script "${fileName}" criado com template mínimo e aberto no editor!`);
      } catch (err: any) {
        setStatusMessage(`Erro ao criar script: ${err.message}`);
      }
    },
    [fetchProjectScripts, handleOpenScriptFileInEditor, primarySelectedUuid, syncUiSnapshot]
  );

  const handleCreateScriptFolder = useCallback(
    async (folderPath: string) => {
      await fetch('/api/scripts/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      });
      await fetchProjectScripts();
    },
    [fetchProjectScripts]
  );

  const handleRenameScriptFile = useCallback(
    async (script: ScriptFileEntry, newName: string) => {
      const res = await fetch('/api/scripts/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldRelativePath: script.relativePath,
          newName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchProjectScripts();
        setOpenScriptTabs((prev) =>
          prev.map((t) =>
            t.uuid === script.uuid
              ? {
                  ...t,
                  name: data.newRelativePath.split('/').pop() || newName,
                  relativePath: data.newRelativePath,
                }
              : t
          )
        );
        setStatusMessage(`Script renomeado para "${data.newRelativePath}" preservando UUID`);
      }
    },
    [fetchProjectScripts]
  );

  const handleDeleteScriptFile = useCallback(
    async (script: ScriptFileEntry, force = false) => {
      const res = await fetch('/api/scripts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relativePath: script.relativePath,
          scriptUuid: script.uuid,
          force,
        }),
      });
      const data = await res.json();
      if (data.requiresConfirmation) {
        return {
          requiresConfirmation: true,
          dependentNodes: data.dependentNodes || [],
        };
      }
      if (res.ok && data.success) {
        setOpenScriptTabs((prev) => prev.filter((t) => t.uuid !== script.uuid));
        if (activeScriptTabUuid === script.uuid) {
          setActiveScriptTabUuid(null);
        }
        await fetchProjectScripts();
        setStatusMessage(`Script "${script.name}" excluído.`);
      }
      return {};
    },
    [activeScriptTabUuid, fetchProjectScripts]
  );

  // Fetch Maxros Engine Project Manager Overview on startup
  const fetchProjectOverview = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const res = await fetch('/api/projects/overview');
      const data = await res.json();
      if (res.ok) {
        setProjectOverview(data);
        if (data.activeProjectContext) {
          setActiveProjectContext(data.activeProjectContext);
        }
      }
    } catch (err: any) {
      setProjectErrorMsg(`Falha ao carregar projetos: ${err.message}`);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    fetchProjectOverview();
  }, [fetchProjectOverview]);

  const applyOpenedProjectPayload = useCallback(
    (data: any, customStatus?: string) => {
      if (data.overview) {
        setProjectOverview(data.overview);
      }
      if (data.projectContext) {
        setActiveProjectContext(data.projectContext);
      }
      if (data.sceneData) {
        setSimState('stopped');
        simStateRef.current = 'stopped';
        prePlaySnapshotRef.current = data.sceneData;
        undoStackRef.current = [];
        redoStackRef.current = [];
        setUndoCount(0);
        setRedoCount(0);
        setIsDirty(false);

        const mainPath = data.projectContext?.activeScenePath || 'scenes/main.scene.json';
        const mainName =
          mainPath
            .split('/')
            .pop()
            ?.replace(/\.scene\.json$/i, '.scene') || 'main.scene';

        setOpenSceneTabs([
          {
            id: 'tab_main_scene',
            name: mainName,
            filePath: mainPath,
            sceneUuid: data.projectContext?.activeSceneUuid || null,
            isChildScene: false,
            isDirty: false,
            sceneData: data.sceneData,
          },
        ]);
        setActiveSceneTabId('tab_main_scene');

        const rootNodeCandidate =
          Array.isArray(data.sceneData.rootNodes) && data.sceneData.rootNodes.length > 0
            ? data.sceneData.rootNodes[0]
            : data.sceneData;
        const isBareRoot =
          !rootNodeCandidate?.children || rootNodeCandidate.children.length === 0;

        if (isBareRoot) {
          handleStartEmptyScenePrompt();
          return;
        }

        loadSceneDataIntoRam(data.sceneData, {
          autoSelectDefaultIfEmpty: true,
          statusText:
            customStatus ||
            `Projeto "${data.projectContext?.projectName || 'Maxros'}" aberto — raiz ativa: project:// (${mainPath})`,
        });
      }
    },
    [handleStartEmptyScenePrompt, loadSceneDataIntoRam]
  );

  const handleCreateProject = async (payload: {
    name: string;
    folderName: string;
    baseDir: string;
    template: 'standard_3d' | 'empty' | 'geometric_demo';
  }) => {
    setProjectErrorMsg(null);
    const res = await fetch('/api/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setProjectErrorMsg(data.error || 'Erro ao criar projeto.');
      return;
    }
    applyOpenedProjectPayload(
      data,
      `Novo projeto "${payload.name}" criado e aberto com sucesso em project://`
    );
  };

  const handleOpenProject = async (payload: {
    projectPath?: string;
    projectUuid?: string;
    folderName?: string;
    autoMigrateLegacy?: boolean;
  }) => {
    setProjectErrorMsg(null);
    const res = await fetch('/api/projects/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setProjectErrorMsg(data.error || 'Não foi possível abrir o projeto informado.');
      return;
    }
    applyOpenedProjectPayload(data);
  };

  const handleMigrateLegacyProject = async (projectPath: string) => {
    setProjectErrorMsg(null);
    const res = await fetch('/api/projects/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setProjectErrorMsg(data.error || 'Falha ao migrar projeto legado.');
      return;
    }
    applyOpenedProjectPayload(
      data,
      `Projeto legado migrado com sucesso para maxros.project.json + .scene.json`
    );
  };

  const handleRelocateRecentProject = async (oldPathOrUuid: string, newPath: string) => {
    setProjectErrorMsg(null);
    const res = await fetch('/api/projects/relocate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPathOrUuid, newPath }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setProjectErrorMsg(data.error || 'Não foi possível relocar o projeto.');
      return;
    }
    if (data.overview) setProjectOverview(data.overview);
  };

  const handleRemoveRecentProject = async (pathOrUuid: string) => {
    setProjectErrorMsg(null);
    const res = await fetch('/api/projects/remove-recent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pathOrUuid }),
    });
    const data = await res.json();
    if (res.ok && data.overview) {
      setProjectOverview(data.overview);
    }
  };

  const handleUpdateProjectCore = async (projectPath: string) => {
    setProjectErrorMsg(null);
    const res = await fetch('/api/projects/update-core', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      setProjectErrorMsg(data.error || 'Erro ao atualizar runtime core/.');
      return;
    }
    if (data.overview) setProjectOverview(data.overview);
    setStatusMessage(`Runtime core/ atualizado para Maxros Engine v${data.engineVersion}`);
  };

  const handleCloseProject = async () => {
    setSimState('stopped');
    simStateRef.current = 'stopped';
    try {
      const res = await fetch('/api/projects/close', { method: 'POST' });
      const data = await res.json();
      setActiveProjectContext(null);
      if (data.overview) {
        setProjectOverview(data.overview);
      }
    } catch {
      setActiveProjectContext(null);
    }
  };

  const handleResolveUuidConflict = async (conflictUuid: string, keepRelativePath: string) => {
    const res = await fetch('/api/projects/uuid/resolve-conflict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conflictUuid, keepRelativePath }),
    });
    const data = await res.json();
    if (res.ok && data.projectContext) {
      setActiveProjectContext(data.projectContext);
      setStatusMessage(
        `Conflito de UUID ${conflictUuid} resolvido: "${keepRelativePath}" preservado como proprietário original.`
      );
    }
  };

  const handleRecoverMissingSidecar = async (relativePath: string, preferredUuid?: string) => {
    const res = await fetch('/api/projects/uuid/recover-sidecar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath, preferredUuid }),
    });
    const data = await res.json();
    if (res.ok && data.projectContext) {
      setActiveProjectContext(data.projectContext);
      setStatusMessage(
        `Sidecar .uuid recuperado para "${relativePath}" (UUID: ${data.uuid})`
      );
    }
  };

  // Atomic Save & Load (Project-Aware .scene.json + .uuid sidecar + Inside-Out Child Scene Propagation)
  const handleAtomicSaveScene = async () => {
    const root = sceneRootRef.current;
    if (!root) return;

    try {
      const serialized = root.serialize();
      prePlaySnapshotRef.current = serialized;
      const activeTab = openSceneTabs.find((t) => t.id === activeSceneTabId);
      const targetFile =
        activeTab?.filePath || activeProjectContext?.activeScenePath || 'scenes/main.scene.json';
      const targetUuid =
        activeTab?.sceneUuid || activeProjectContext?.activeSceneUuid || undefined;

      // Register in NodeFactory so any parent scenes instantiating this scene receive Inside-Out updates!
      NodeFactory.registerSceneTemplate({
        uuid: targetUuid || targetFile,
        path: targetFile,
        data: serialized,
      });

      // Reconcile all other open scene tabs that contain instances of this scene (Inside-Out propagation)
      setOpenSceneTabs((prev) =>
        prev.map((tab) => {
          if (tab.id === activeSceneTabId) {
            return { ...tab, sceneData: serialized, isDirty: false };
          }
          if (tab.sceneData) {
            const tempRoot = NodeFactory.createFromData(tab.sceneData, {
              physicsServer: PhysicsServer.getInstance(),
            });
            const updatedCount = NodeFactory.reconcileSceneInstances(
              tempRoot,
              targetUuid || targetFile,
              serialized,
              { physicsServer: PhysicsServer.getInstance() }
            );
            if (updatedCount > 0) {
              return { ...tab, sceneData: tempRoot.serialize() };
            }
          }
          return tab;
        })
      );

      const response = await fetch('/api/scene/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: targetFile,
          sceneUuid: targetUuid,
          sceneData: {
            engine: 'Maxros Engine',
            version: '1.0',
            name: root.name || 'Main',
            environment: root.environment,
            rootNodes: [serialized],
          },
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setIsDirty(false);
        if (data.projectContext) {
          setActiveProjectContext(data.projectContext);
        }
        setStatusMessage(
          `Cena salva atomicamente em ${data.filePath || targetFile} — instâncias sincronizadas!`
        );
      } else {
        setStatusMessage(`Erro ao salvar: ${data.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Erro ao salvar: ${err.message}`);
    }
  };

  const handleLoadFromDisk = async () => {
    try {
      setSimState('stopped');
      simStateRef.current = 'stopped';
      const targetScene = activeProjectContext?.activeSceneUuid || 'default_level.scene';
      const response = await fetch(`/api/scene/load?file=${encodeURIComponent(targetScene)}`);
      const data = await response.json();
      if (response.ok && data.sceneData) {
        prePlaySnapshotRef.current = data.sceneData;
        undoStackRef.current = [];
        redoStackRef.current = [];
        setUndoCount(0);
        setRedoCount(0);
        setIsDirty(false);
        if (data.projectContext) {
          setActiveProjectContext(data.projectContext);
        }
        loadSceneDataIntoRam(data.sceneData, {
          statusText: `Cena recarregada do disco: ${data.filePath || data.fileName}`,
        });
      }
    } catch (err: any) {
      setStatusMessage(`Erro ao carregar: ${err.message}`);
    }
  };

  // Run Automated Math & ECS Test Suite (31 Batteries)
  const handleRunAutomatedTests = async () => {
    setIsValidatingEngine(true);
    setBottomDrawerTab('tests');
    try {
      const res = await fetch('/api/engine/validate');
      const report = await res.json();
      setTestSuiteReport(report);
      setStatusMessage(
        `Suíte de Testes Automáticos Maxros Engine concluída: ${report.totalTestsPassed} baterias aprovadas`
      );
    } catch (err: any) {
      setStatusMessage(`Erro ao executar testes: ${err.message}`);
    } finally {
      setIsValidatingEngine(false);
    }
  };

  const validParentCandidates = treeItems.filter((candidate) => {
    if (!selectedItem || !sceneRootRef.current) return false;
    if (candidate.uuid === selectedItem.uuid) return false;
    const selectedNodeObj = findEngineNodeByUuid(sceneRootRef.current, selectedItem.uuid);
    const candidateNodeObj = findEngineNodeByUuid(sceneRootRef.current, candidate.uuid);
    if (!selectedNodeObj || !candidateNodeObj) return false;
    return !selectedNodeObj.isAncestorOf(candidateNodeObj);
  });

  const duplicateConflicts = activeProjectContext?.uuidDiagnostics?.duplicateConflicts || [];
  const missingSidecars = activeProjectContext?.uuidDiagnostics?.missingSidecars || [];

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#090d16] text-slate-100 select-none relative">
      {/* MAXROS ENGINE PROJECT MANAGER ENTRY POINT (Shown whenever no project is open) */}
      {!activeProjectContext && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0B0E14]">
          <ProjectManagerScreen
            overview={projectOverview}
            loading={isLoadingProjects}
            errorMsg={projectErrorMsg}
            onRefreshOverview={fetchProjectOverview}
            onCreateProject={handleCreateProject}
            onOpenProject={handleOpenProject}
            onMigrateLegacyProject={handleMigrateLegacyProject}
            onRelocateRecentProject={handleRelocateRecentProject}
            onRemoveRecentProject={handleRemoveRecentProject}
            onUpdateProjectCore={handleUpdateProjectCore}
            onRunEngineValidation={handleRunAutomatedTests}
            isValidatingEngine={isValidatingEngine}
          />
        </div>
      )}

      {/* TOP BAR: File/History, Gizmo & Snap/Space, Simulation Speed & Play/Pause/Step/Reset */}
      <header className="h-13 shrink-0 flex items-center justify-between gap-2 px-3 bg-[#0d1321] border-b border-slate-800/90 z-20 overflow-x-auto">
        {/* Zone 1: Brand, Active Project Context, Save/Load, Undo/Redo, Dirty Status */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCloseProject}
            title="Voltar ao Gerenciador de Projetos da Maxros Engine"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Projetos</span>
          </button>

          <span className="text-sm font-bold tracking-tight text-slate-100 whitespace-nowrap">
            Maxros Engine
          </span>

          {activeProjectContext && (
            <span
              className="px-2 py-0.5 text-[11px] font-mono bg-slate-800/90 text-emerald-300 border border-slate-700 rounded whitespace-nowrap"
              title={`Raiz dinâmica project:// -> ${activeProjectContext.projectPath}`}
            >
              {activeProjectContext.projectName} ({activeProjectContext.activeScenePath || 'scenes/main.scene.json'})
            </span>
          )}

          <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
            {isDirty ? '· Não salvo' : '· Salvo'}
            {lastAutosaveTime ? ` (Auto ${lastAutosaveTime})` : ''}
          </span>

          <div className="h-4 w-px bg-slate-800 mx-0.5" />

          <button
            type="button"
            disabled={undoCount === 0 || simState !== 'stopped'}
            onClick={handleUndo}
            title="Desfazer (Ctrl+Z)"
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-700 rounded-md transition-colors disabled:opacity-35 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-mono text-[11px]">{undoCount}</span>
          </button>

          <button
            type="button"
            disabled={redoCount === 0 || simState !== 'stopped'}
            onClick={handleRedo}
            title="Refazer (Ctrl+Y)"
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-700 rounded-md transition-colors disabled:opacity-35 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-mono text-[11px]">{redoCount}</span>
          </button>

          <button
            type="button"
            onClick={handleAtomicSaveScene}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/90 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-sky-400" />
            <span>Salvar (.scene.json)</span>
          </button>

          <button
            type="button"
            onClick={handleLoadFromDisk}
            title="Recarregar a cena ativa do disco (project://scenes/)"
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
            <span>Recarregar Cena</span>
          </button>

          <button
            type="button"
            onClick={() => handleLoadGeometricMiniGame(true)}
            title="Carregar e Jogar o Mini-Game 'Guardião Geométrico: Arena dos Cristais'"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Gamepad2 className="w-4 h-4 text-slate-950" />
            <span>🎮 Jogar Demo</span>
          </button>
        </div>

        {/* Zone 2: Gizmo Tools (Mover, Rotacionar, Escalar, Espaço Local/Global, Snap, Focar, Duplicar, Pai/Filho) */}
        <div className="flex items-center gap-1 bg-[#090d16] p-1 rounded-lg border border-slate-800/90 shrink-0">
          <button
            type="button"
            disabled={simState !== 'stopped'}
            onClick={() => handleSelectGizmoMode('translate')}
            title="Mover nos Eixos (W)"
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              gizmoMode === 'translate' && !isLinkingParent && simState === 'stopped'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70 disabled:opacity-40'
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            <span>Mover</span>
          </button>

          <button
            type="button"
            disabled={simState !== 'stopped'}
            onClick={() => handleSelectGizmoMode('rotate')}
            title="Rotacionar (E)"
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              gizmoMode === 'rotate' && !isLinkingParent && simState === 'stopped'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70 disabled:opacity-40'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Girar</span>
          </button>

          <button
            type="button"
            disabled={simState !== 'stopped'}
            onClick={() => handleSelectGizmoMode('scale')}
            title="Escalar (R)"
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              gizmoMode === 'scale' && !isLinkingParent && simState === 'stopped'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70 disabled:opacity-40'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Escalar</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-0.5" />

          {/* Toggle Gizmo Space: Auto / Local / Global */}
          <button
            type="button"
            disabled={simState !== 'stopped'}
            onClick={handleCycleGizmoSpace}
            title="Alternar Espaço das Setas do Gizmo (Auto / Local / Global)"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-300 bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
          >
            {gizmoSpace === 'world' ? (
              <Globe className="w-3.5 h-3.5" />
            ) : (
              <Compass className="w-3.5 h-3.5" />
            )}
            <span>
              Espaço: {gizmoSpace === 'auto' ? 'Auto' : gizmoSpace === 'local' ? 'Local' : 'Global'}
            </span>
          </button>

          {/* Toggle Snap (0.5m / 15° / 0.25x) */}
          <button
            type="button"
            disabled={simState !== 'stopped'}
            onClick={() => setSnapEnabled(!snapEnabled)}
            title="Snap de Grade (0.5m / 15° / 0.25x — ou segure Shift)"
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              snapEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-300 hover:bg-slate-800/70'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>Snap</span>
          </button>

          {/* Focus Object (F) */}
          <button
            type="button"
            onClick={handleFocusSelected}
            title="Focar Câmera no Objeto (Atalho: F)"
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/70 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Focus className="w-3.5 h-3.5 text-sky-400" />
            <span>Focar (F)</span>
          </button>

          {/* Duplicate Subtree (Ctrl+D) */}
          <button
            type="button"
            disabled={simState !== 'stopped' || !selectedItem || selectedItem.depth === 0}
            onClick={handleDuplicateSelected}
            title="Duplicar com Hierarquia (Ctrl+D)"
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/70 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-35"
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Duplicar</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-0.5" />

          {/* Travar Pai no Filho */}
          <button
            type="button"
            disabled={simState !== 'stopped' || !selectedItem || selectedItem.depth === 0}
            onClick={() => {
              const next = !isLinkingParent;
              setIsLinkingParent(next);
              isLinkingParentRef.current = next;
            }}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isLinkingParent
                ? 'bg-amber-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/70 disabled:opacity-40'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>{isLinkingParent ? 'Clique no Pai...' : 'Travar Pai'}</span>
          </button>

          {selectedItem && !selectedItem.isTopLevelParent && rootItem && (
            <button
              type="button"
              disabled={simState !== 'stopped'}
              onClick={() => handleReparentNode(selectedItem.uuid, rootItem.uuid)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/15 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Unlink2 className="w-3.5 h-3.5" />
              <span>Soltar</span>
            </button>
          )}
        </div>

        {/* Zone 3: Simulation Controls (Play, Pause, Step +1f, Speed 0.25x/1x/2x, Play Camera, Stop & Reset) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Speed Selector */}
          <div className="flex items-center bg-[#090d16] p-0.5 rounded-md border border-slate-800 text-[11px] font-mono">
            {[0.25, 1, 2].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => handleTimeScaleChange(spd)}
                className={`px-1.5 py-1 rounded transition-colors cursor-pointer ${
                  timeScale === spd
                    ? 'bg-slate-800 text-sky-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Separate Play Camera Toggle */}
          <button
            type="button"
            onClick={() => setUsePlayCamera(!usePlayCamera)}
            title="Usar Câmera separada durante o Play (preserva a câmera do Editor)"
            className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              usePlayCamera
                ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Cam Play</span>
          </button>

          {/* Play / Pause */}
          {simState === 'playing' ? (
            <button
              type="button"
              onClick={handlePauseSimulation}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Pausar Jogo</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartOrResumePlay}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-md shadow-md shadow-emerald-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{simState === 'paused' ? '▶ Continuar' : '▶ JOGAR (PLAY)'}</span>
            </button>
          )}

          {/* Step +1 Frame */}
          <button
            type="button"
            onClick={handleStepSingleFrame}
            title="Avançar exatamente 1 frame físico (1/60s)"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <StepForward className="w-3.5 h-3.5 text-sky-400" />
            <span>+1f</span>
          </button>

          {/* Stop & Auto-Reset */}
          {simState !== 'stopped' && (
            <button
              type="button"
              onClick={handleStopAndResetSimulation}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Parar (Resetar)</span>
            </button>
          )}
        </div>
      </header>

      {/* UUID DIAGNOSTICS BANNER (Non-silent duplicate conflict & missing sidecar recovery) */}
      {(duplicateConflicts.length > 0 || missingSidecars.length > 0) && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-xs flex flex-col gap-1.5 shrink-0 z-20">
          {duplicateConflicts.map((conflict: any) => (
            <div key={conflict.uuid} className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Conflito de UUID Duplicado ({conflict.uuid}):</strong> detectado entre{' '}
                  {conflict.files.map((f: string) => `"${f}"`).join(' e ')}. Escolha qual arquivo preserva o UUID original:
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {conflict.files.map((fileRel: string) => (
                  <button
                    key={fileRel}
                    type="button"
                    onClick={() => handleResolveUuidConflict(conflict.uuid, fileRel)}
                    className="px-2.5 py-1 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-[11px] cursor-pointer"
                  >
                    Manter em {fileRel}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {missingSidecars.map((missing: any) => (
            <div key={missing.relativePath} className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-sky-400 shrink-0" />
                <span>
                  <strong>Recurso sem sidecar .uuid:</strong> <code className="font-mono">{missing.relativePath}</code>
                  {missing.recoveredUuid
                    ? ` (UUID anterior localizado: ${missing.recoveredUuid})`
                    : ' (Nenhum histórico anterior encontrado)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRecoverMissingSidecar(missing.relativePath, missing.recoveredUuid || undefined)}
                className="px-2.5 py-1 rounded bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold text-[11px] cursor-pointer"
              >
                {missing.recoveredUuid ? 'Restaurar UUID Original' : 'Gerar Novo Sidecar .uuid'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* MAIN 3-COLUMN WORKSPACE */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT PANEL: + Dropdown Menu & Scene Hierarchy (No "Árvore de Nós" title, no forced MainSceneRoot) */}
        <aside className="w-72 shrink-0 bg-[#0d1321] border-r border-slate-800/90 flex flex-col z-10">
          {/* Top Bar with + Dropdown Icon, Nova Cena, and Ambiente */}
          <div className="p-2 border-b border-slate-800 flex items-center justify-between gap-1.5 relative">
            <div className="flex items-center gap-1.5">
              {/* + Dropdown Button */}
              <div className="relative">
                <button
                  type="button"
                  disabled={simState !== 'stopped'}
                  onClick={() => setAddNodeDropdownOpen((prev) => !prev)}
                  title={
                    hasSceneRoot
                      ? 'Adicionar Nó na Cena (Dropdown +)'
                      : 'Escolher Nó Pré-Existente para agir como Cena Pai (Raiz)'
                  }
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>{hasSceneRoot ? 'Adicionar Nó' : 'Criar Cena Pai'}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {addNodeDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-64 max-h-96 overflow-y-auto bg-[#0d1321] border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 space-y-1">
                    <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-sky-400 border-b border-slate-800 flex items-center justify-between">
                      <span>
                        {hasSceneRoot
                          ? selectedItem
                            ? `Filho de ${selectedItem.name}`
                            : `Filho de ${rootItem?.name || 'Raiz'}`
                          : 'Selecionar Nó Pai da Cena'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAddNodeDropdownOpen(false)}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {PRE_EXISTING_NODE_TYPES.map((nodeDef) => (
                      <button
                        key={nodeDef.id}
                        type="button"
                        onClick={() => handleCreatePreExistingNode(nodeDef.id)}
                        className="w-full px-2.5 py-2 rounded-lg text-left hover:bg-slate-800/90 flex items-start justify-between gap-2 transition-colors cursor-pointer group"
                      >
                        <div className="min-w-0">
                          <div className={`text-xs font-semibold ${nodeDef.color} group-hover:underline`}>
                            {nodeDef.label}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {nodeDef.desc}
                          </div>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 shrink-0">
                          {nodeDef.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Nova Cena Vazia (pede para escolher Nó Pai) */}
              <button
                type="button"
                disabled={simState !== 'stopped'}
                onClick={handleStartEmptyScenePrompt}
                title="Limpar cena atual e escolher um novo Nó Pai da Cena"
                className="px-2 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40"
              >
                Nova Cena
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleClearSelection}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors shrink-0 cursor-pointer ${
                  selectedUuids.length === 0
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Editar o Ambiente da Cena"
              >
                Ambiente
              </button>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                {treeItems.length}
              </span>
            </div>
          </div>

          {/* Tree Nodes OR Initial Scene Root Creation Prompt */}
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleClearSelection();
              }
            }}
            className="flex-1 overflow-y-auto p-2 space-y-0.5"
          >
            {!hasSceneRoot ? (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-sky-500/30 space-y-3 text-xs">
                <div className="space-y-1">
                  <div className="font-bold text-sky-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Criar Nó Pai da Cena</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    A cena começa sem raiz fixa. Escolha um tipo de nó pré-existente abaixo para agir como <strong>Cena Pai (Raiz)</strong>:
                  </p>
                </div>

                <div className="space-y-1">
                  {PRE_EXISTING_NODE_TYPES.map((nodeDef) => (
                    <button
                      key={nodeDef.id}
                      type="button"
                      onClick={() => handleCreatePreExistingNode(nodeDef.id)}
                      className="w-full px-2.5 py-2 rounded-lg bg-slate-950/90 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 flex items-center justify-between gap-2 transition-colors cursor-pointer text-left"
                    >
                      <div className="min-w-0">
                        <div className={`text-xs font-semibold ${nodeDef.color}`}>
                          + {nodeDef.label}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {nodeDef.desc}
                        </div>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 shrink-0">
                        Raiz
                      </span>
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-800 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={handleLoadFromDisk}
                    className="w-full px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    Carregar Cena Salva do Projeto (.scene.json)
                  </button>
                </div>
              </div>
            ) : (
              treeItems.map((item) => {
                const isSelected = selectedUuids.includes(item.uuid);
                const isRoot = item.depth === 0;
                const isDragTarget = dragOverUuid === item.uuid;

                return (
                  <div
                    key={item.uuid}
                    draggable={!isRoot && simState === 'stopped'}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/maxros-tree-node', item.uuid);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverUuid !== item.uuid) {
                        setDragOverUuid(item.uuid);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverUuid === item.uuid) {
                        setDragOverUuid(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverUuid(null);
                      const draggedUuid = e.dataTransfer.getData('application/maxros-tree-node');
                      if (draggedUuid && draggedUuid !== item.uuid) {
                        handleReparentNode(draggedUuid, item.uuid);
                      }
                    }}
                    onClick={(e) => {
                      if (isLinkingParent && primarySelectedUuid) {
                        handleReparentNode(primarySelectedUuid, item.uuid);
                        setIsLinkingParent(false);
                        isLinkingParentRef.current = false;
                        return;
                      }
                      const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
                      let nextSel: string[];
                      if (isMulti && !isRoot) {
                        nextSel = selectedUuids.includes(item.uuid)
                          ? selectedUuids.filter((id) => id !== item.uuid)
                          : [...selectedUuids, item.uuid];
                      } else {
                        nextSel = [item.uuid];
                      }
                      setSelectedUuids(nextSel);
                      selectedUuidsRef.current = nextSel;
                      syncGizmoAttachment(nextSel, simStateRef.current);
                      syncUiSnapshot();
                    }}
                    style={{ paddingLeft: `${Math.min(item.depth * 14 + 8, 72)}px` }}
                    className={`group w-full py-1.5 pr-2 rounded-md text-xs flex items-center justify-between gap-1.5 transition-colors cursor-pointer ${
                      isDragTarget
                        ? 'bg-amber-500/25 border border-amber-400 text-amber-200'
                        : isSelected
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800/70 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {!isRoot && <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />}
                      {(item.type === 'Camera3D' || item.type === 'Camera3DNode') && (
                        <span
                          title="Câmera 3D (Clique para ver o Frustum Amarelo e o Camera Preview em Tempo Real)"
                          className="shrink-0"
                        >
                          <Camera
                            className={`w-3.5 h-3.5 ${
                              isSelected ? 'text-amber-300' : 'text-amber-400'
                            }`}
                          />
                        </span>
                      )}
                      {item.type === 'CollisionShape3DNode' && (
                        <span
                          title={`CollisionShape3D (${item.shapeType || 'Box'})`}
                          className="shrink-0"
                        >
                          <Box className="w-3.5 h-3.5 text-emerald-400" />
                        </span>
                      )}
                      <span className={`truncate ${!item.editorVisible ? 'opacity-45 line-through' : ''}`}>
                        {item.uniqueName ? `%${item.name}` : item.name}
                      </span>
                      {(item.components.length > 0 || (item.scriptsCount ?? 0) > 0) && (
                        <span title="Possui Script/Componente (Ex: PhysicsScript)" className="shrink-0">
                          <Cpu className="w-3 h-3 text-purple-400" />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleToggleNodeVisible(item.uuid, e)}
                        title={item.editorVisible ? 'Ocultar nó' : 'Mostrar nó'}
                        className={`p-0.5 rounded hover:bg-slate-700 ${
                          item.editorVisible
                            ? 'text-slate-500 opacity-60 group-hover:opacity-100'
                            : 'text-amber-400 opacity-100'
                        }`}
                      >
                        {item.editorVisible ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleToggleNodeLocked(item.uuid, e)}
                        title={item.editorLocked ? 'Destravar seleção' : 'Travar seleção (Cadeado)'}
                        className={`p-0.5 rounded hover:bg-slate-700 ${
                          item.editorLocked
                            ? 'text-rose-400 opacity-100'
                            : 'text-slate-500 opacity-60 group-hover:opacity-100'
                        }`}
                      >
                        {item.editorLocked ? (
                          <Lock className="w-3 h-3" />
                        ) : (
                          <Unlock className="w-3 h-3" />
                        )}
                      </button>
                      <span className="text-[10px] font-mono text-slate-500 ml-0.5">
                        {item.type.replace('3DNode', '3D')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Left Panel Footer: Colliders Wireframe & Delete */}
          <div className="p-2.5 border-t border-slate-800 flex items-center justify-between gap-1">
            <span className="text-[11px] text-slate-400 font-mono">
              {physicsBodyCount} colisor(es)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={simState !== 'stopped'}
                onClick={() => {
                  const next = !showWireframes;
                  setShowWireframes(next);
                  showWireframesRef.current = next;
                  syncUiSnapshot();
                  triggerRender();
                }}
                title="Exibir/Ocultar Malhas de Colisão (CollisionShape3D)"
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                  showWireframes
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                Colisores
              </button>
              <button
                type="button"
                disabled={!selectedItem || simState !== 'stopped'}
                onClick={() => {
                  if (selectedItem && selectedItem.depth === 0) {
                    handleStartEmptyScenePrompt();
                  } else {
                    handleDeleteSelected();
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/15 rounded transition-colors disabled:opacity-35 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
            </div>
          </div>
        </aside>

        {/* CENTER COLUMN: 3D Viewport + Collapsible Bottom Assets & Automated Tests Shelf */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <main
            onDragOver={handleViewportDragOver}
            onDrop={handleViewportDrop}
            className="relative flex-1 min-h-0 bg-[#090d16] overflow-hidden"
          >
            <div ref={canvasMountRef} className="w-full h-full" />

            {/* OVERLAY DE CRIAÇÃO DO NÓ PAI DA CENA QUANDO A CENA ESTÁ SEM RAIZ */}
            {!hasSceneRoot && (
              <div className="absolute inset-0 z-30 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-lg rounded-2xl bg-[#0d1321] border border-sky-500/40 shadow-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
                        <Plus className="w-4 h-4 text-sky-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          Escolha um Nó Pré-Existente para agir como Cena Pai
                        </h3>
                        <p className="text-xs text-slate-400">
                          Selecione qual tipo de nó será a raiz principal desta cena
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                    {PRE_EXISTING_NODE_TYPES.map((nodeDef) => (
                      <button
                        key={nodeDef.id}
                        type="button"
                        onClick={() => handleCreatePreExistingNode(nodeDef.id)}
                        className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 text-left transition-all cursor-pointer flex flex-col justify-between gap-1"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-bold ${nodeDef.color}`}>
                            {nodeDef.label}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400">
                            {nodeDef.badge}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 line-clamp-1">
                          {nodeDef.desc}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={handleLoadFromDisk}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer"
                    >
                      Restaurar Cena Salva (.scene.json)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadGeometricMiniGame(false)}
                      className="px-3 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40 font-semibold cursor-pointer"
                    >
                      Carregar Cena Demo
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 1. MENU DE MODO DE CÂMERA DO EDITOR (Canto Superior Esquerdo do Viewport) */}
            <div className="absolute top-3 left-4 flex flex-col gap-2 z-20 pointer-events-none">
              <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
                {/* Alternador Perspectiva / Ortográfica */}
                <div className="flex items-center bg-[#0d1321]/95 backdrop-blur-md p-0.5 rounded-lg border border-slate-700/90 shadow-lg">
                  <button
                    type="button"
                    onClick={() => handleSwitchEditorCameraMode('perspective')}
                    title="Câmera do Editor em Projeção Perspectiva (THREE.PerspectiveCamera)"
                    className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                      editorCamMode === 'perspective'
                        ? 'bg-sky-500 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Camera className="w-3 h-3" />
                    <span>Perspectiva</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchEditorCameraMode('orthographic')}
                    title="Câmera do Editor em Projeção Ortográfica (THREE.OrthographicCamera)"
                    className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                      editorCamMode === 'orthographic'
                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Box className="w-3 h-3" />
                    <span>Ortográfica</span>
                  </button>
                </div>

                {/* Menu Dropdown de Alinhamento Rápido da Câmera do Editor */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setEditorCamMenuOpen((prev) => !prev)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 bg-[#0d1321]/95 hover:bg-slate-800/95 backdrop-blur-md rounded-lg border border-slate-700/90 shadow-lg transition-colors cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5 text-sky-400" />
                    <span>Visão: {activeViewPresetLabel}</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>

                  {editorCamMenuOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#0d1321]/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-1.5 z-30 space-y-1">
                      <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800">
                        Projeção da Câmera do Editor
                      </div>
                      <div className="grid grid-cols-2 gap-1 p-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            handleSwitchEditorCameraMode('perspective');
                            setEditorCamMenuOpen(false);
                          }}
                          className={`px-2 py-1.5 rounded text-xs font-medium text-left flex items-center gap-1.5 cursor-pointer ${
                            editorCamMode === 'perspective'
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <Camera className="w-3.5 h-3.5 text-sky-400" />
                          <span>Perspectiva</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleSwitchEditorCameraMode('orthographic');
                            setEditorCamMenuOpen(false);
                          }}
                          className={`px-2 py-1.5 rounded text-xs font-medium text-left flex items-center gap-1.5 cursor-pointer ${
                            editorCamMode === 'orthographic'
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <Box className="w-3.5 h-3.5 text-amber-400" />
                          <span>Ortográfica</span>
                        </button>
                      </div>

                      <div className="px-2 pt-1.5 pb-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-t border-slate-800">
                        Alinhamento Rápido (Olhar para o Centro)
                      </div>
                      {(
                        [
                          { id: 'top', label: 'Visão de Cima (Top)', axis: 'Y+ ↓', color: 'text-emerald-400' },
                          { id: 'bottom', label: 'Visão de Baixo (Bottom)', axis: 'Y- ↑', color: 'text-emerald-500' },
                          { id: 'left', label: 'Visão Esquerda (Left)', axis: 'X- →', color: 'text-rose-500' },
                          { id: 'right', label: 'Visão Direita (Right)', axis: 'X+ ←', color: 'text-rose-400' },
                          { id: 'front', label: 'Visão Frontal (Front)', axis: 'Z+ ↙', color: 'text-sky-400' },
                          { id: 'back', label: 'Visão Traseira (Back)', axis: 'Z- ↗', color: 'text-sky-500' },
                        ] as const
                      ).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleAlignEditorCamera(preset.id)}
                          className="w-full px-2.5 py-1.5 rounded-md text-xs text-slate-200 hover:bg-slate-800 flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <span>{preset.label}</span>
                          <span className={`font-mono text-[11px] font-semibold ${preset.color}`}>
                            {preset.axis}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Botões Rápidos de Eixo no Topo Esquerdo */}
                <div className="hidden xl:flex items-center gap-0.5 bg-[#0d1321]/90 backdrop-blur-md p-0.5 rounded-lg border border-slate-800/90">
                  {(
                    [
                      { id: 'top', short: 'Top (Y+)', color: 'hover:text-emerald-300' },
                      { id: 'bottom', short: 'Bottom (Y-)', color: 'hover:text-emerald-400' },
                      { id: 'left', short: 'Left (X-)', color: 'hover:text-rose-400' },
                      { id: 'right', short: 'Right (X+)', color: 'hover:text-rose-300' },
                      { id: 'front', short: 'Front (Z+)', color: 'hover:text-sky-300' },
                      { id: 'back', short: 'Back (Z-)', color: 'hover:text-sky-400' },
                    ] as const
                  ).map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => handleAlignEditorCamera(btn.id)}
                      title={`Alinhar Câmera do Editor: ${btn.short}`}
                      className={`px-2 py-1 text-[10px] font-mono text-slate-300 ${btn.color} hover:bg-slate-800 rounded transition-colors cursor-pointer`}
                    >
                      {btn.short}
                    </button>
                  ))}
                </div>
              </div>

              {/* Telemetria de Status abaixo do Menu de Câmera */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-xs text-slate-300 font-mono tabular-nums">
                  <span>
                    {simState === 'playing'
                      ? `Simulando (${timeScale}x)`
                      : simState === 'paused'
                      ? 'Simulação Pausada'
                      : 'Modo Editor'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-300">
                    Cam Editor: {editorCamMode === 'perspective' ? 'Perspectiva' : 'Ortográfica'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Gizmo: {gizmoMode.toUpperCase()} ({gizmoSpace.toUpperCase()})
                  </span>
                  {snapEnabled && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-400">Snap 0.5m / 15°</span>
                    </>
                  )}
                  {selectedUuids.length > 1 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-300">
                        Grupo ({selectedUuids.length} objetos)
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-400 max-w-2xl">{statusMessage}</p>
              </div>
            </div>

            {/* 2. GIZMO DE NAVEGAÇÃO 3D INTERATIVO (ViewCube / Eixos X, Y, Z no Canto Superior Direito do Viewport) */}
            <div className="absolute top-3 right-4 z-20 flex flex-col items-end gap-1 select-none">
              <div className="relative bg-[#0d1321]/85 backdrop-blur-md border border-slate-700/80 rounded-2xl p-1.5 shadow-2xl flex flex-col items-center">
                <canvas
                  ref={navGizmoCanvasRef}
                  width={116}
                  height={116}
                  onClick={handleNavGizmoClick}
                  title="Gizmo de Navegação 3D: Clique nos eixos X (vermelho), Y (verde) ou Z (azul) para alinhar a câmera do editor"
                  className="w-[116px] h-[116px] cursor-pointer"
                />
                <div className="flex items-center justify-between w-full px-2 pt-0.5 border-t border-slate-800/80 text-[10px] font-mono">
                  <span className="text-rose-400 font-bold">X</span>
                  <span className="text-emerald-400 font-bold">Y</span>
                  <span className="text-sky-400 font-bold">Z</span>
                  <span className="text-slate-400">{activeViewPresetLabel}</span>
                </div>
              </div>
            </div>

            {/* Prominent Top-Center PLAY Button Overlay when Stopped/Paused in the Mini-Game */}
            {hudOverlay.visible && simState !== 'playing' && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleStartOrResumePlay}
                  className="flex items-center gap-2.5 px-6 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-sm shadow-xl shadow-emerald-500/25 border border-emerald-200 transition-transform active:scale-95 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>JOGAR AGORA (PLAY)</span>
                </button>
                <span className="text-[11px] font-mono text-slate-300 bg-slate-950/80 px-2.5 py-0.5 rounded border border-slate-800">
                  Use WASD / Setas, Espaço (Pulso) ou clique nos cristais 3D
                </span>
              </div>
            )}

            {/* UILayer 2D HUD Overlay (Rendered from UILayer Scene Nodes + 3D Anchored Label) */}
            {hudOverlay.visible && (
              <>
                <div className="absolute top-40 right-4 w-84 bg-[#0f172a]/92 border border-sky-500/40 rounded-xl p-3.5 shadow-2xl backdrop-blur-md z-20 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tracking-wide text-amber-300 flex items-center gap-1.5">
                      <Gamepad2 className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{hudOverlay.titleText}</span>
                    </span>
                    <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/30">
                      UILayer HUD
                    </span>
                  </div>

                  <div className="text-xs font-mono font-semibold text-emerald-300 bg-slate-950/80 px-2.5 py-1.5 rounded-md border border-slate-800">
                    {hudOverlay.scoreText}
                  </div>

                  <div className="text-[11px] font-mono text-slate-300">
                    {hudOverlay.stateText}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>Energia do Pulso (ProgressBar)</span>
                      <span>{Math.round(hudOverlay.energyValue)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-100"
                        style={{ width: `${Math.max(0, Math.min(100, hudOverlay.energyValue))}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const root = sceneRootRef.current;
                        const playerNode = root?.getNodeOrNull('%PlayerCore');
                        if (playerNode) {
                          if (!playerNode.userData.scriptState) playerNode.userData.scriptState = {};
                          playerNode.userData.scriptState.triggerPulse = true;
                        }
                        if (simStateRef.current !== 'playing') {
                          handleStartOrResumePlay();
                        }
                      }}
                      className="px-2.5 py-1.5 text-[11px] font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md transition-colors cursor-pointer"
                    >
                      ⚡ Pulso (Espaço)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const root = sceneRootRef.current;
                        const playerNode = root?.getNodeOrNull('%PlayerCore');
                        if (playerNode) {
                          if (!playerNode.userData.scriptState) playerNode.userData.scriptState = {};
                          playerNode.userData.scriptState.triggerReroll = true;
                        }
                        if (simStateRef.current !== 'playing') {
                          handleStartOrResumePlay();
                        }
                      }}
                      className="px-2.5 py-1.5 text-[11px] font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-md transition-colors cursor-pointer"
                    >
                      🎲 Novo Mapa (RNG)
                    </button>
                  </div>

                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-0.5 border-t border-slate-800/80">
                    <span>Mover: WASD / Setas ou Clique no chão</span>
                    {simState !== 'playing' && (
                      <button
                        type="button"
                        onClick={handleStartOrResumePlay}
                        className="text-emerald-400 hover:underline font-semibold cursor-pointer"
                      >
                        ▶ Iniciar Jogo
                      </button>
                    )}
                  </div>
                </div>

                {/* 3D Anchored Floating Label (Control.anchorTo3D) */}
                {hudOverlay.playerTagScreen.visible && (
                  <div
                    style={{
                      left: `${hudOverlay.playerTagScreen.x}px`,
                      top: `${hudOverlay.playerTagScreen.y}px`,
                    }}
                    className="absolute -translate-x-1/2 -translate-y-full pointer-events-none px-2 py-0.5 rounded bg-slate-950/85 border border-sky-400/50 text-[11px] font-mono font-semibold text-sky-300 shadow-lg whitespace-nowrap z-10"
                  >
                    {hudOverlay.playerTagText}
                  </div>
                )}
              </>
            )}
          </main>

          {/* BOTTOM SHELF: Assets Panel (Drag-to-Scene), Automated Tests & Engine Logs */}
          <section className="shrink-0 bg-[#0d1321] border-t border-slate-800/90 z-10">
            <div className="px-4 py-1.5 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setBottomDrawerTab(bottomDrawerTab === 'assets' ? 'closed' : 'assets')
                  }
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    bottomDrawerTab === 'assets'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Painel de Assets (Arrastar para Cena)</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunAutomatedTests}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    bottomDrawerTab === 'tests'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  <span>Testes Automáticos (26 Baterias)</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setBottomDrawerTab(bottomDrawerTab === 'logs' ? 'closed' : 'logs')
                  }
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    bottomDrawerTab === 'logs'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Console & Logs ({engineLogs.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (sceneRootRef.current) {
                      setSerializedJson(JSON.stringify(sceneRootRef.current.serialize(), null, 2));
                    }
                    setShowJsonModal(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 rounded-md transition-colors cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Inspecionar JSON (.scene)</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  setBottomDrawerTab(bottomDrawerTab === 'closed' ? 'assets' : 'closed')
                }
                className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {bottomDrawerTab === 'closed' ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>

            {bottomDrawerTab === 'assets' && (
              <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-40 overflow-y-auto">
                {/* Prefabs 3D */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-400">
                    Modelos / Prefabs 3D (Arraste para o Viewport 3D ou clique para criar)
                  </span>
                  <div className="grid grid-cols-5 gap-2">
                    {ASSET_PREFABS.map((prefab) => (
                      <div
                        key={prefab.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/maxros-asset-type', 'prefab');
                          e.dataTransfer.setData('application/maxros-asset-payload', prefab.id);
                        }}
                        onClick={() => spawnAssetAtPosition(prefab.id)}
                        className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-sky-500/50 transition-colors cursor-grab active:cursor-grabbing flex flex-col justify-between gap-1"
                      >
                        <div className="flex items-center justify-between">
                          <Box className="w-4 h-4" style={{ color: prefab.accent }} />
                          <span className="text-[10px] font-mono text-slate-400">
                            {prefab.category.split(' ')[0]}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {prefab.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Procedural Textures */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-400">
                    Texturas Procedurais (Arraste sobre um objeto 3D no Viewport)
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {ASSET_TEXTURES.map((tex) => (
                      <div
                        key={tex.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/maxros-asset-type', 'texture');
                          e.dataTransfer.setData('application/maxros-asset-payload', tex.path);
                        }}
                        onClick={() => {
                          if (selectedItem) {
                            handleNodePropertyChange('texturePath', tex.path);
                            setStatusMessage(`Textura "${tex.name}" associada`);
                          }
                        }}
                        className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 transition-colors cursor-grab active:cursor-grabbing flex flex-col justify-between gap-1"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-3 h-3 rounded-sm shrink-0"
                            style={{ backgroundColor: tex.color }}
                          />
                          <span className="text-xs font-medium text-slate-200 truncate">
                            {tex.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 truncate">
                          {tex.path.replace('assets/textures/', '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {bottomDrawerTab === 'tests' && (
              <div className="p-3 max-h-40 overflow-y-auto space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Suíte de Validação Matemática e Arquitetural (Headless Node.js)
                  </span>
                  <button
                    type="button"
                    onClick={handleRunAutomatedTests}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 font-medium cursor-pointer"
                  >
                    Reexecutar Testes
                  </button>
                </div>
                {testSuiteReport ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 font-mono text-[11px]">
                    {testSuiteReport.tests?.map((t, i) => (
                      <div
                        key={i}
                        className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{t}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400">Executando bateria de testes...</p>
                )}
              </div>
            )}

            {bottomDrawerTab === 'logs' && (
              <div className="p-3 max-h-40 overflow-y-auto space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-amber-300 font-semibold">
                    Log Engine & Diagnóstico Estruturado (Códigos E101–E501)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      Log.clear();
                      setEngineLogs([]);
                    }}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-[11px] cursor-pointer"
                  >
                    Limpar Logs
                  </button>
                </div>
                {engineLogs.length === 0 ? (
                  <p className="text-slate-500">Nenhum evento registrado ainda.</p>
                ) : (
                  engineLogs.map((entry, idx) => (
                    <div
                      key={idx}
                      className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                            entry.level === 'error'
                              ? 'bg-rose-500/20 text-rose-300'
                              : entry.level === 'warn'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-sky-500/20 text-sky-300'
                          }`}
                        >
                          {entry.code || entry.level}
                        </span>
                        <span className="text-slate-200 truncate">{entry.message}</span>
                      </div>
                      {entry.nodePath && (
                        <span className="text-slate-500 shrink-0">{entry.nodePath}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT PANEL: Inspetor de Propriedades (Contextual Position, Rotation, Scale, CollisionShape3D, PhysicsScript & Ambiente) */}
        <aside className="w-80 shrink-0 bg-[#0d1321] border-l border-slate-800/90 flex flex-col z-10 overflow-y-auto">
          <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              <h2 className="text-xs font-semibold text-slate-100">Propriedades</h2>
            </div>
            {selectedItem ? (
              <span className="text-[11px] font-mono text-slate-400">
                {selectedItem.type.replace('3DNode', '3D')}
              </span>
            ) : (
              <span className="text-[11px] font-mono text-sky-400">Ambiente</span>
            )}
          </div>

          {selectedItem ? (
            <div className="p-4 space-y-4 text-xs">
              {/* Node Name & Lock/Visibility Banner */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 font-medium">Nome do Nó</label>
                  {selectedItem.editorLocked && (
                    <span className="text-[11px] text-rose-400 font-medium flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Travado
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  disabled={simState !== 'stopped'}
                  value={selectedItem.name}
                  onChange={(e) => handleNodePropertyChange('name', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 font-medium focus:outline-none focus:border-sky-500 disabled:opacity-50"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                  <span>UUID: {selectedItem.uuid.slice(0, 8)}</span>
                  <span>
                    {selectedItem.depth === 0
                      ? 'Cena Pai (Raiz)'
                      : selectedItem.isTopLevelParent
                      ? 'Nó Global'
                      : `Filho de ${selectedItem.parentName}`}
                  </span>
                </div>
              </div>

              {/* 4. PAINEL DE PREVIEW DE CÂMERA EM TEMPO REAL (Picture-in-Picture para Camera3D / Camera3DNode) */}
              {(selectedItem.type === 'Camera3D' || selectedItem.type === 'Camera3DNode') && (
                <div className="rounded-xl border border-amber-500/40 bg-slate-950/90 overflow-hidden shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setCameraPreviewOpen((prev) => !prev);
                      setTimeout(() => triggerRender(), 20);
                    }}
                    className="w-full px-3 py-2 bg-amber-500/10 hover:bg-amber-500/15 border-b border-amber-500/20 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Camera className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-semibold text-amber-200 text-xs">Camera Preview</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">
                        Ao Vivo
                      </span>
                    </div>
                    {cameraPreviewOpen ? (
                      <ChevronUp className="w-3.5 h-3.5 text-amber-300" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-amber-300" />
                    )}
                  </button>

                  {cameraPreviewOpen && (
                    <div className="p-2.5 space-y-2">
                      <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-[#090d16] aspect-video flex items-center justify-center">
                        <canvas
                          ref={cameraPreviewCanvasRef}
                          width={272}
                          height={153}
                          className="w-full h-full block object-cover"
                        />
                        <div className="absolute top-1.5 left-2 px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-amber-300 pointer-events-none">
                          {selectedItem.name} ·{' '}
                          {selectedItem.cameraProjection === 'orthographic'
                            ? `Ortho (${selectedItem.cameraSize ?? 10}m)`
                            : `FOV ${selectedItem.cameraFov ?? 60}°`}
                        </div>
                        <div className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded bg-slate-950/80 text-[9px] font-mono text-slate-400 pointer-events-none">
                          Near {selectedItem.cameraNear ?? 0.1} · Far {selectedItem.cameraFar ?? 100}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1.5 text-[10px] text-slate-400">
                        <span>Frustum amarelo ativo no Viewport</span>
                        <button
                          type="button"
                          disabled={simState !== 'stopped'}
                          onClick={handleAlignSelectedCameraToEditorView}
                          title="Posicionar e rotacionar esta Camera3D exatamente como a Câmera do Editor está olhando agora"
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-medium transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                        >
                          Alinhar com Visão Atual
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Vínculo Pai / Filho */}
              {selectedItem.depth > 0 && (
                <div className="space-y-1.5 border-t border-slate-800/90 pt-3.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-semibold">Vínculo Pai / Filho</label>
                    <span className="text-[11px] text-slate-400">Preserva pose 3D</span>
                  </div>
                  <select
                    disabled={simState !== 'stopped'}
                    value={selectedItem.parentUuid || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        handleReparentNode(selectedItem.uuid, e.target.value);
                      }
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                  >
                    {validParentCandidates.map((cand) => (
                      <option key={cand.uuid} value={cand.uuid}>
                        {cand.depth === 0
                          ? `${cand.name} (Cena Pai / Raiz)`
                          : `${'— '.repeat(cand.depth)}${cand.name}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* SINGLE UNIFIED POSITION (Auto-Resolved: Global if Parent, Local if Child) */}
              <div className="space-y-2 border-t border-slate-800/90 pt-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Position</span>
                  <span className="text-[11px] font-mono text-sky-400">
                    {selectedItem.isTopLevelParent ? 'Auto: Global (Pai)' : 'Auto: Local (Filho)'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 font-mono">
                  {(['x', 'y', 'z'] as const).map((axis) => {
                    const axisColor =
                      axis === 'x'
                        ? 'text-rose-400'
                        : axis === 'y'
                        ? 'text-emerald-400'
                        : 'text-sky-400';
                    return (
                      <div key={`pos-${axis}`} className="space-y-1">
                        <span className={`block text-[11px] uppercase font-semibold ${axisColor}`}>
                          {axis}
                        </span>
                        <input
                          type="number"
                          step={snapEnabled ? '0.5' : '0.1'}
                          disabled={simState !== 'stopped' || selectedItem.editorLocked}
                          value={selectedItem.autoPosition[axis]}
                          onChange={(e) => handlePositionChange(axis, e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 text-xs tabular-nums focus:outline-none focus:border-sky-500 disabled:opacity-50"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ROTATION (X, Y, Z in Degrees) */}
              <div className="space-y-2 border-t border-slate-800/90 pt-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Rotation</span>
                  <span className="text-[11px] font-mono text-slate-400">Graus (°)</span>
                </div>

                <div className="grid grid-cols-3 gap-2 font-mono">
                  {(['x', 'y', 'z'] as const).map((axis) => {
                    const axisColor =
                      axis === 'x'
                        ? 'text-rose-400'
                        : axis === 'y'
                        ? 'text-emerald-400'
                        : 'text-sky-400';
                    return (
                      <div key={`rot-${axis}`} className="space-y-1">
                        <span className={`block text-[11px] uppercase font-semibold ${axisColor}`}>
                          {axis}°
                        </span>
                        <input
                          type="number"
                          step={snapEnabled ? '15' : '5'}
                          disabled={simState !== 'stopped' || selectedItem.editorLocked}
                          value={selectedItem.rotationDeg[axis]}
                          onChange={(e) => handleRotationChange(axis, e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 text-xs tabular-nums focus:outline-none focus:border-sky-500 disabled:opacity-50"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SCALE (X, Y, Z) */}
              <div className="space-y-2 border-t border-slate-800/90 pt-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Scale</span>
                  <span className="text-[11px] font-mono text-slate-400">Multiplicador</span>
                </div>

                <div className="grid grid-cols-3 gap-2 font-mono">
                  {(['x', 'y', 'z'] as const).map((axis) => {
                    const axisColor =
                      axis === 'x'
                        ? 'text-rose-400'
                        : axis === 'y'
                        ? 'text-emerald-400'
                        : 'text-sky-400';
                    return (
                      <div key={`scale-${axis}`} className="space-y-1">
                        <span className={`block text-[11px] uppercase font-semibold ${axisColor}`}>
                          {axis}
                        </span>
                        <input
                          type="number"
                          step={snapEnabled ? '0.25' : '0.1'}
                          min="0.1"
                          disabled={simState !== 'stopped' || selectedItem.editorLocked}
                          value={selectedItem.scale[axis]}
                          onChange={(e) => handleScaleChange(axis, e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 text-xs tabular-nums focus:outline-none focus:border-sky-500 disabled:opacity-50"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* NODE-SPECIFIC PROPERTIES: CollisionShape3D (Separado da Física — Box, Sphere, Cylinder e Trimesh/MeshCollider) */}
              {selectedItem.type === 'CollisionShape3DNode' && (
                <div className="space-y-3 border-t border-slate-800/90 pt-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                      <Box className="w-3.5 h-3.5 text-emerald-400" />
                      <span>CollisionShape3D (Colisão)</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                      {selectedItem.shapeType === 'Trimesh' ? 'MeshCollider 3D' : selectedItem.shapeType || 'Box'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-300 font-medium">
                      Tipo de Colisão (Collision Shape)
                    </label>
                    <select
                      disabled={simState !== 'stopped'}
                      value={selectedItem.shapeType || 'Box'}
                      onChange={(e) => handleNodePropertyChange('shapeType', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-100 font-medium focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Box">BoxShape3D (Caixa 3D)</option>
                      <option value="Sphere">SphereShape3D (Esfera 3D)</option>
                      <option value="Cylinder">CylinderShape3D (Cilindro 3D)</option>
                      <option value="Trimesh">
                        Trimesh / MeshCollider (Desenho do Modelo 3D)
                      </option>
                    </select>
                  </div>

                  {selectedItem.shapeType === 'Trimesh' ? (
                    <div className="space-y-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <div className="text-[11px] text-emerald-200 leading-relaxed">
                        <strong>TrimeshShape3D (MeshCollider):</strong> desenha a malha de colisão exatamente com os vértices e faces do modelo 3D.
                      </div>
                      <div className="space-y-1">
                        <label className="block text-slate-300 font-medium">
                          Molde do Modelo 3D (Trimesh)
                        </label>
                        <select
                          disabled={simState !== 'stopped'}
                          value={selectedItem.trimeshSourceShape || 'auto'}
                          onChange={(e) =>
                            handleNodePropertyChange('trimeshSourceShape', e.target.value)
                          }
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-100"
                        >
                          <option value="auto">
                            Automático (Seguir Desenho do Mesh3D Pai/Irmão)
                          </option>
                          <option value="octahedron">Octahedron (Cristal Octaedro)</option>
                          <option value="icosahedron">Icosahedron (Núcleo Icosaedro)</option>
                          <option value="torus">Torus (Anel 3D)</option>
                          <option value="torusKnot">TorusKnot (Nó Toroidal 3D)</option>
                          <option value="cone">Cone (Cone 3D)</option>
                          <option value="cylinder">Cylinder (Cilindro 3D)</option>
                          <option value="sphere">Sphere (Esfera 3D)</option>
                          <option value="box">Box (Cubo 3D)</option>
                        </select>
                      </div>
                    </div>
                  ) : selectedItem.shapeType === 'Sphere' ? (
                    <div className="space-y-1">
                      <label className="block text-slate-400">Raio da Esfera (m)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        disabled={simState !== 'stopped'}
                        value={selectedItem.radius ?? 0.5}
                        onChange={(e) => handleNodePropertyChange('radius', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 font-mono tabular-nums"
                      />
                    </div>
                  ) : selectedItem.shapeType === 'Cylinder' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="block text-slate-400">Raio (m)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          disabled={simState !== 'stopped'}
                          value={selectedItem.radius ?? 0.5}
                          onChange={(e) => handleNodePropertyChange('radius', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 font-mono tabular-nums"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-slate-400">Altura (m)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          disabled={simState !== 'stopped'}
                          value={selectedItem.colliderHeight ?? 1.2}
                          onChange={(e) => handleNodePropertyChange('colliderHeight', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="block text-slate-400">Dimensões da Caixa (X, Y, Z)</label>
                      <div className="grid grid-cols-3 gap-2 font-mono">
                        <input
                          type="number"
                          step="0.2"
                          min="0.1"
                          disabled={simState !== 'stopped'}
                          value={selectedItem.dimensions?.x ?? 1}
                          onChange={(e) => handleNodePropertyChange('dimX', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 tabular-nums"
                        />
                        <input
                          type="number"
                          step="0.2"
                          min="0.1"
                          disabled={simState !== 'stopped'}
                          value={selectedItem.dimensions?.y ?? 1}
                          onChange={(e) => handleNodePropertyChange('dimY', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 tabular-nums"
                        />
                        <input
                          type="number"
                          step="0.2"
                          min="0.1"
                          disabled={simState !== 'stopped'}
                          value={selectedItem.dimensions?.z ?? 1}
                          onChange={(e) => handleNodePropertyChange('dimZ', e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 tabular-nums"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* NODE-SPECIFIC PROPERTIES: Legacy RigidBody3DNode support */}
              {selectedItem.type === 'RigidBody3DNode' && (
                <div className="space-y-2.5 border-t border-slate-800/90 pt-3.5">
                  <span className="block font-semibold text-slate-200">
                    Corpo Físico (RigidBody3DNode)
                  </span>

                  <div className="space-y-1">
                    <label className="block text-slate-400">Tipo do Corpo</label>
                    <select
                      disabled={simState !== 'stopped'}
                      value={selectedItem.bodyType || 'dynamic'}
                      onChange={(e) => handleNodePropertyChange('bodyType', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-200"
                    >
                      <option value="dynamic">Dynamic (Gravidade e Colisão)</option>
                      <option value="static">Static (Imóvel / Chão)</option>
                      <option value="kinematic">Kinematic (Controlado por Script)</option>
                    </select>
                  </div>

                  {selectedItem.bodyType === 'dynamic' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="block text-slate-400">Massa (kg)</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0.1"
                          disabled={simState !== 'stopped'}
                          value={selectedItem.mass ?? 1}
                          onChange={(e) => handleNodePropertyChange('mass', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 font-mono tabular-nums"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-slate-400">Amortecimento</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          disabled={simState !== 'stopped'}
                          value={selectedItem.linearDamping ?? 0.01}
                          onChange={(e) => handleNodePropertyChange('linearDamping', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-2 pt-0.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={simState !== 'stopped'}
                      checked={Boolean(selectedItem.fixedRotation)}
                      onChange={(e) => handleNodePropertyChange('fixedRotation', e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-sky-500"
                    />
                    <span>Travar rotação física (Fixed Rotation)</span>
                  </label>
                </div>
              )}

              {/* NODE-SPECIFIC PROPERTIES: Sprite3DNode */}
              {selectedItem.type === 'Sprite3DNode' && (
                <div className="space-y-2.5 border-t border-slate-800/90 pt-3.5">
                  <span className="block font-semibold text-slate-200">
                    Visual (Sprite3DNode)
                  </span>

                  <div className="space-y-1">
                    <label className="block text-slate-400">Modo de Renderização</label>
                    <select
                      disabled={simState !== 'stopped'}
                      value={selectedItem.renderMode || 'sprite'}
                      onChange={(e) => handleNodePropertyChange('renderMode', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-200"
                    >
                      <option value="sprite">THREE.Sprite (Billboard)</option>
                      <option value="plane">PlaneGeometry (Malha 3D)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-400">Textura Associada</label>
                    <select
                      disabled={simState !== 'stopped'}
                      value={selectedItem.texturePath || ''}
                      onChange={(e) => handleNodePropertyChange('texturePath', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-200 font-mono text-[11px]"
                    >
                      {ASSET_TEXTURES.map((t) => (
                        <option key={t.id} value={t.path}>
                          {t.name} ({t.path.split('/').pop()})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* NODE-SPECIFIC PROPERTIES: Mesh3D */}
              {selectedItem.type === 'Mesh3D' && (
                <div className="space-y-2.5 border-t border-slate-800/90 pt-3.5">
                  <span className="block font-semibold text-slate-200">
                    Modelo 3D (Mesh3D)
                  </span>

                  <div className="space-y-1">
                    <label className="block text-slate-400">Desenho do Modelo 3D</label>
                    <select
                      disabled={simState !== 'stopped'}
                      value={selectedItem.meshShape || 'box'}
                      onChange={(e) => handleNodePropertyChange('meshShape', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-200"
                    >
                      <option value="box">Box (Cubo)</option>
                      <option value="sphere">Sphere (Esfera)</option>
                      <option value="cylinder">Cylinder (Cilindro)</option>
                      <option value="cone">Cone (Cone)</option>
                      <option value="torus">Torus (Anel)</option>
                      <option value="torusKnot">TorusKnot (Nó Toroidal)</option>
                      <option value="plane">Plane (Plano)</option>
                      <option value="octahedron">Octahedron (Cristal Octaedro)</option>
                      <option value="icosahedron">Icosahedron (Núcleo Icosaedro)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <label className="block text-slate-400">Cor da Malha</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          disabled={simState !== 'stopped'}
                          value={selectedItem.meshColor || '#38bdf8'}
                          onChange={(e) => handleNodePropertyChange('meshColor', e.target.value)}
                          className="w-9 h-8 p-0.5 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                        />
                        <span className="font-mono text-[11px] text-slate-300 uppercase">
                          {selectedItem.meshColor || '#38bdf8'}
                        </span>
                      </div>
                    </div>

                    <label className="flex items-center gap-1.5 pt-4 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={simState !== 'stopped'}
                        checked={Boolean(selectedItem.meshWireframe)}
                        onChange={(e) => handleNodePropertyChange('meshWireframe', e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-sky-500"
                      />
                      <span>Wireframe</span>
                    </label>
                  </div>

                  {/* Atalho direto para criar um CollisionShape3D com o desenho deste modelo 3D (Trimesh) */}
                  <button
                    type="button"
                    disabled={simState !== 'stopped'}
                    onClick={() => handleCreatePreExistingNode('CollisionShape3D')}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar CollisionShape3D (Trimesh do Modelo 3D)</span>
                  </button>
                </div>
              )}

              {/* 3. NODE-SPECIFIC PROPERTIES: Camera3D / Camera3DNode (Frustum Gizmo & Projection Controls) */}
              {(selectedItem.type === 'Camera3D' || selectedItem.type === 'Camera3DNode') && (
                <div className="space-y-3 border-t border-slate-800/90 pt-3.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-amber-400" />
                      <span>Câmera 3D (Camera3DNode)</span>
                    </span>
                    <span className="text-[10px] font-mono text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                      CameraHelper Ativo
                    </span>
                  </div>

                  {/* Tipo de Projeção da Camera3D */}
                  <div className="space-y-1">
                    <label className="block text-slate-400">Projeção da Câmera</label>
                    <select
                      disabled={simState !== 'stopped'}
                      value={selectedItem.cameraProjection || 'perspective'}
                      onChange={(e) => handleNodePropertyChange('cameraProjection', e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-200"
                    >
                      <option value="perspective">Perspectiva (PerspectiveCamera)</option>
                      <option value="orthographic">Ortográfica (OrthographicCamera)</option>
                    </select>
                  </div>

                  {selectedItem.cameraProjection === 'orthographic' ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-400">Tamanho Ortográfico (Size)</label>
                        <span className="font-mono text-[11px] text-amber-300">
                          {selectedItem.cameraSize ?? 10}m
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="200"
                        disabled={simState !== 'stopped'}
                        value={selectedItem.cameraSize ?? 10}
                        onChange={(e) => handleNodePropertyChange('cameraSize', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 font-mono tabular-nums"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-400">Campo de Visão (FOV)</label>
                        <span className="font-mono text-[11px] text-amber-300">
                          {selectedItem.cameraFov ?? 60}°
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="15"
                          max="140"
                          step="1"
                          disabled={simState !== 'stopped'}
                          value={selectedItem.cameraFov ?? 60}
                          onChange={(e) => handleNodePropertyChange('cameraFov', e.target.value)}
                          className="flex-1 accent-amber-400 cursor-pointer"
                        />
                        <input
                          type="number"
                          min="10"
                          max="160"
                          step="1"
                          disabled={simState !== 'stopped'}
                          value={selectedItem.cameraFov ?? 60}
                          onChange={(e) => handleNodePropertyChange('cameraFov', e.target.value)}
                          className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded-md text-slate-100 font-mono tabular-nums text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* Aspect Ratio + Planos Near / Far */}
                  <div className="grid grid-cols-3 gap-2 font-mono">
                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-400">Aspect</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="3.5"
                        disabled={simState !== 'stopped'}
                        value={roundNum(selectedItem.cameraAspect ?? 1.7778, 2)}
                        onChange={(e) => handleNodePropertyChange('cameraAspect', e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 text-xs tabular-nums"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-400">Near Clip</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.05"
                        max="50"
                        disabled={simState !== 'stopped'}
                        value={selectedItem.cameraNear ?? 0.1}
                        onChange={(e) => handleNodePropertyChange('cameraNear', e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 text-xs tabular-nums"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-400">Far Clip</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="2000"
                        disabled={simState !== 'stopped'}
                        value={selectedItem.cameraFar ?? 100}
                        onChange={(e) => handleNodePropertyChange('cameraFar', e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 text-xs tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Câmera Ativa da Cena (Current) */}
                  <label className="flex items-center justify-between pt-1 text-slate-300 cursor-pointer">
                    <span>Câmera Principal da Cena (Current)</span>
                    <input
                      type="checkbox"
                      disabled={simState !== 'stopped'}
                      checked={Boolean(selectedItem.cameraCurrent)}
                      onChange={(e) => handleNodePropertyChange('cameraCurrent', e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-amber-400"
                    />
                  </label>
                </div>
              )}

              {/* NODE-SPECIFIC PROPERTIES: AnimationPlayer */}
              {selectedItem.type === 'AnimationPlayer' && (
                <div className="space-y-2 border-t border-slate-800/90 pt-3.5">
                  <span className="block font-semibold text-slate-200">
                    AnimationPlayer ({selectedItem.animClips?.length || 0} clipes)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedItem.animClips || []).map((clipName) => (
                      <button
                        key={clipName}
                        type="button"
                        onClick={() => handleNodePropertyChange('animPlay', clipName)}
                        className={`px-2.5 py-1 rounded text-xs font-mono cursor-pointer ${
                          selectedItem.animCurrent === clipName
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        ▶ {clipName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* NODE-SPECIFIC PROPERTIES: Unique Name (%Nome) & Node Script */}
              <div className="space-y-2 border-t border-slate-800/90 pt-3.5">
                <label className="flex items-center justify-between text-slate-300 cursor-pointer">
                  <span className="font-medium">Nome Único na Cena (%Nome)</span>
                  <input
                    type="checkbox"
                    disabled={simState !== 'stopped'}
                    checked={Boolean(selectedItem.uniqueName)}
                    onChange={(e) => handleNodePropertyChange('uniqueName', e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-sky-500"
                  />
                </label>

                {selectedItem.scriptCode !== undefined && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300 font-semibold">
                        Script JS do Nó (Lifecycle Hooks)
                      </span>
                      <span className="text-[10px] font-mono text-purple-400">
                        onReady / onProcess
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      disabled={simState !== 'stopped'}
                      value={selectedItem.scriptCode}
                      onChange={(e) => handleNodePropertyChange('scriptCode', e.target.value)}
                      placeholder="// Ex: onProcess(dt) { this.rotate(0, dt, 0); }"
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded-md font-mono text-[11px] text-emerald-300 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                )}
              </div>

              {/* MODULAR COMPONENTS / SCRIPTS SYSTEM (Including PhysicsScript separated from Collision) */}
              <div className="space-y-2.5 border-t border-slate-800/90 pt-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    <span>Scripts / Componentes</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {selectedItem.components.length} ativos
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={simState !== 'stopped'}
                    onClick={() => handleAddScriptComponent('Physics')}
                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 rounded-md transition-colors cursor-pointer disabled:opacity-40"
                  >
                    + Physics (Script Física)
                  </button>
                  <button
                    type="button"
                    disabled={simState !== 'stopped'}
                    onClick={() => handleAddScriptComponent('Rotator')}
                    className="px-2 py-1.5 text-[11px] font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-md transition-colors cursor-pointer disabled:opacity-40"
                  >
                    + Rotator
                  </button>
                  <button
                    type="button"
                    disabled={simState !== 'stopped'}
                    onClick={() => handleAddScriptComponent('Oscillator')}
                    className="px-2 py-1.5 text-[11px] font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-md transition-colors cursor-pointer disabled:opacity-40"
                  >
                    + Oscillator
                  </button>
                  <button
                    type="button"
                    disabled={simState !== 'stopped'}
                    onClick={() => handleAddScriptComponent('Thruster')}
                    className="px-2 py-1.5 text-[11px] font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-md transition-colors cursor-pointer disabled:opacity-40"
                  >
                    + Thruster
                  </button>
                </div>

                {selectedItem.components.map((comp) => (
                  <div
                    key={comp.id}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-purple-300">{comp.type}Script</span>
                      <button
                        type="button"
                        disabled={simState !== 'stopped'}
                        onClick={() => handleRemoveScriptComponent(comp.id)}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {comp.type === 'Physics' && (
                      <div className="space-y-2 font-mono text-[11px]">
                        <div className="space-y-0.5">
                          <span className="text-slate-400 font-sans">Modo do Script de Física</span>
                          <select
                            disabled={simState !== 'stopped'}
                            value={String(comp.params.bodyType || 'dynamic')}
                            onChange={(e) =>
                              handleUpdateScriptParam(comp.id, 'bodyType', e.target.value)
                            }
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 font-sans"
                          >
                            <option value="dynamic">Dynamic (Gravidade e Queda Livre)</option>
                            <option value="static">Static (Fixo / Imóvel)</option>
                            <option value="kinematic">Kinematic (Controlado por Script)</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="space-y-0.5">
                            <span className="text-slate-400">Massa (kg)</span>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={comp.params.mass ?? 1}
                              onChange={(e) =>
                                handleUpdateScriptParam(comp.id, 'mass', e.target.value)
                              }
                              className="w-full px-1.5 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 tabular-nums"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-slate-400">Grav. Y</span>
                            <input
                              type="number"
                              step="0.5"
                              value={comp.params.gravityY ?? -9.82}
                              onChange={(e) =>
                                handleUpdateScriptParam(comp.id, 'gravityY', e.target.value)
                              }
                              className="w-full px-1.5 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 tabular-nums"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-slate-400">Quique</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="1"
                              value={comp.params.restitution ?? 0.35}
                              onChange={(e) =>
                                handleUpdateScriptParam(comp.id, 'restitution', e.target.value)
                              }
                              className="w-full px-1.5 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 tabular-nums"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {comp.type === 'Rotator' && (
                      <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                        {(['speedX', 'speedY', 'speedZ'] as const).map((k) => (
                          <div key={k} className="space-y-0.5">
                            <span className="text-slate-400">{k.replace('speed', 'Vel ')}°/s</span>
                            <input
                              type="number"
                              step="15"
                              value={comp.params[k] ?? 0}
                              onChange={(e) =>
                                handleUpdateScriptParam(comp.id, k, e.target.value)
                              }
                              className="w-full px-1.5 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 tabular-nums"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {comp.type === 'Oscillator' && (
                      <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                        <div className="space-y-0.5">
                          <span className="text-slate-400">Amplitude (m)</span>
                          <input
                            type="number"
                            step="0.2"
                            value={comp.params.amplitude ?? 1.5}
                            onChange={(e) =>
                              handleUpdateScriptParam(comp.id, 'amplitude', e.target.value)
                            }
                            className="w-full px-1.5 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 tabular-nums"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-slate-400">Freq (Hz)</span>
                          <input
                            type="number"
                            step="0.2"
                            value={comp.params.frequency ?? 1.0}
                            onChange={(e) =>
                              handleUpdateScriptParam(comp.id, 'frequency', e.target.value)
                            }
                            className="w-full px-1.5 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 tabular-nums"
                          />
                        </div>
                      </div>
                    )}

                    {comp.type === 'Thruster' && (
                      <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                        <div className="space-y-0.5">
                          <span className="text-slate-400">Intervalo (s)</span>
                          <input
                            type="number"
                            step="0.2"
                            value={comp.params.interval ?? 1.5}
                            onChange={(e) =>
                              handleUpdateScriptParam(comp.id, 'interval', e.target.value)
                            }
                            className="w-full px-1.5 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 tabular-nums"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-slate-400">Impulso Y</span>
                          <input
                            type="number"
                            step="1"
                            value={comp.params.impulseY ?? 8.5}
                            onChange={(e) =>
                              handleUpdateScriptParam(comp.id, 'impulseY', e.target.value)
                            }
                            className="w-full px-1.5 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 tabular-nums"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4 text-xs">
              {/* AMBIENTE DA CENA (Shown when no node is selected) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-100 text-sm">Ambiente</span>
                  <span className="text-[11px] font-mono text-slate-400">.scene</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Configurações de fundo do Viewport 3D salvas junto com a cena. Mudar a cor atualiza o fundo na hora e registra no histórico de Desfazer/Refazer.
                </p>

                {/* Modo do Ambiente */}
                <div className="space-y-1.5 pt-1">
                  <label className="block text-slate-300 font-medium">Modo de Fundo</label>
                  <select
                    disabled={simState !== 'stopped'}
                    value={sceneEnvironment.mode}
                    onChange={(e) => handleEnvironmentModeChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                  >
                    <option value="solid_color">Cor sólida</option>
                  </select>
                </div>

                {/* Seletor de Cor */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-medium">Cor do Ambiente</label>
                    <span className="font-mono text-[11px] text-sky-400 uppercase">
                      {sceneEnvironment.color}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      disabled={simState !== 'stopped'}
                      value={sceneEnvironment.color}
                      onChange={(e) => handleEnvironmentColorChange(e.target.value)}
                      className="w-11 h-9 p-0.5 bg-slate-900 border border-slate-700 rounded-md cursor-pointer disabled:opacity-50 shrink-0"
                    />
                    <input
                      type="text"
                      disabled={simState !== 'stopped'}
                      value={sceneEnvironment.color}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSceneEnvironment((prev) => ({ ...prev, color: val }));
                        if (/^#[0-9a-fA-F]{6}$/.test(val.trim())) {
                          handleEnvironmentColorChange(val.trim());
                        }
                      }}
                      className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500 disabled:opacity-50"
                    />
                  </div>

                  {/* Paleta de Tons de Estúdio + Restaurar Padrão */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Predefinições</span>
                      {sceneEnvironment.color.toLowerCase() !== DEFAULT_SCENE_ENVIRONMENT.color && (
                        <button
                          type="button"
                          disabled={simState !== 'stopped'}
                          onClick={() => handleEnvironmentColorChange(DEFAULT_SCENE_ENVIRONMENT.color)}
                          className="text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
                        >
                          Restaurar padrão
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[
                        { label: 'Padrão', hex: '#1b2434' },
                        { label: 'Ardósia', hex: '#0f172a' },
                        { label: 'Horizonte', hex: '#1e293b' },
                        { label: 'Grafite', hex: '#1c1f26' },
                        { label: 'Petróleo', hex: '#132a2e' },
                      ].map((preset) => (
                        <button
                          key={preset.hex}
                          type="button"
                          disabled={simState !== 'stopped'}
                          onClick={() => handleEnvironmentColorChange(preset.hex)}
                          title={`${preset.label} (${preset.hex})`}
                          className={`h-7 rounded-md border transition-transform cursor-pointer ${
                            sceneEnvironment.color.toLowerCase() === preset.hex
                              ? 'border-sky-400 scale-105'
                              : 'border-slate-700 hover:border-slate-500'
                          }`}
                          style={{ backgroundColor: preset.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Campo Reservado: Skybox */}
                <div className="space-y-1 border-t border-slate-800/90 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Skybox</span>
                    <span className="text-[10px] font-mono text-slate-500">Reservado</span>
                  </div>
                  <div className="px-2.5 py-1.5 bg-slate-900/60 border border-slate-800/80 rounded-md text-[11px] font-mono text-slate-500">
                    {sceneEnvironment.skybox ?? 'null (vazio — previsto na estrutura .scene)'}
                  </div>
                </div>

                {/* Referência rápida das Guias do Editor */}
                <div className="space-y-1.5 border-t border-slate-800/90 pt-3">
                  <span className="block text-slate-400 font-medium">Guias Visuais de Eixo</span>
                  <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
                    <div className="px-2 py-1 rounded bg-slate-900 border border-slate-800/80 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
                      <span className="text-slate-300">Eixo X</span>
                    </div>
                    <div className="px-2 py-1 rounded bg-slate-900 border border-slate-800/80 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
                      <span className="text-slate-300">Eixo Y</span>
                    </div>
                    <div className="px-2 py-1 rounded bg-slate-900 border border-slate-800/80 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
                      <span className="text-slate-300">Eixo Z</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* JSON Modal */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-6">
          <div className="w-full max-w-3xl max-h-[82vh] bg-[#0d1321] border border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  Estrutura Serializada (.scene JSON em Memória RAM)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowJsonModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-4 bg-[#090d16] text-xs font-mono text-slate-300 leading-relaxed select-text">
              {serializedJson}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
