import * as THREE from 'three';
import { EngineNode } from '../nodes/EngineNode.js';

/**
 * Creates the visual Editor Guides group containing:
 * 1. A subtle, semi-transparent ground plane grid (`Y = 0`).
 * 2. Three origin axis lines:
 *    - X Axis in Red (`#EF4444`) along the ground (`(-extent, 0, 0)` to `(+extent, 0, 0)`)
 *    - Y Axis in Green (`#22C55E`) rising vertically (`(0, 0, 0)` to `(0, +extent, 0)`)
 *    - Z Axis in Blue (`#3B82F6`) along the ground (`(0, 0, -extent)` to `(0, 0, +extent)`)
 *
 * Architectural Guarantees:
 * - Rendered above the grid without Z-fighting (`renderOrder`, `polygonOffset`, `depthWrite: false`).
 * - Purely editor-only (`isEditorGuide: true`, not an `EngineNode`), never serialized in `.scene`.
 * - Non-selectable and non-blocking for raycasts (`raycast` overridden to no-op on every guide child).
 *
 * @param {object} [options={}]
 * @param {number} [options.size=20]
 * @param {number} [options.divisions=20]
 * @returns {THREE.Group}
 */
export function createEditorGuidesGroup(options = {}) {
  const { size = 20, divisions = 20 } = options;
  const halfExtent = size / 2;

  const guidesGroup = new THREE.Group();
  guidesGroup.name = '__Maxros_EditorGuides';
  guidesGroup.userData = {
    isEditorGuide: true,
    isViewportHelper: true,
    selectable: false,
  };

  // Disable raycasting on the container itself
  guidesGroup.raycast = () => {};

  // 1. Subtle, slightly transparent ground grid on the XZ plane
  const gridHelper = new THREE.GridHelper(size, divisions, 0x475569, 0x334155);
  gridHelper.name = '__EditorGuide_GroundGrid';
  gridHelper.position.set(0, 0, 0);
  gridHelper.renderOrder = 1;
  gridHelper.userData = { isEditorGuide: true, selectable: false };
  gridHelper.raycast = () => {};

  if (Array.isArray(gridHelper.material)) {
    for (const mat of gridHelper.material) {
      mat.transparent = true;
      mat.opacity = 0.26;
      mat.depthWrite = false;
    }
  } else if (gridHelper.material) {
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.26;
    gridHelper.material.depthWrite = false;
  }

  guidesGroup.add(gridHelper);

  // Helper to build an anti-z-fighting axis line passing through the origin
  const createAxisLine = (name, startVec, endVec, hexColor) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([startVec, endVec]);
    const material = new THREE.LineBasicMaterial({
      color: hexColor,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const line = new THREE.Line(geometry, material);
    line.name = name;
    line.renderOrder = 2; // Drawn cleanly on top of the ground grid (renderOrder = 1)
    line.userData = { isEditorGuide: true, selectable: false, axisColor: hexColor };
    // Never intercept or block selection raycasts
    line.raycast = () => {};
    return line;
  };

  // Slight elevation (0.003) + renderOrder 2 + depthWrite: false prevents any Z-fighting with the grid
  const yLift = 0.003;

  // X Axis — Red (#EF4444) on the ground
  const xAxisLine = createAxisLine(
    '__EditorGuide_AxisX',
    new THREE.Vector3(-halfExtent, yLift, 0),
    new THREE.Vector3(halfExtent, yLift, 0),
    '#EF4444'
  );

  // Y Axis — Green (#22C55E) rising vertically
  const yAxisLine = createAxisLine(
    '__EditorGuide_AxisY',
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, halfExtent, 0),
    '#22C55E'
  );

  // Z Axis — Blue (#3B82F6) on the ground
  const zAxisLine = createAxisLine(
    '__EditorGuide_AxisZ',
    new THREE.Vector3(0, yLift, -halfExtent),
    new THREE.Vector3(0, yLift, halfExtent),
    '#3B82F6'
  );

  // Origin Center Pyramid Marker (matches reference studio viewport origin indicator)
  const originGeo = new THREE.ConeGeometry(0.18, 0.24, 4);
  originGeo.rotateY(Math.PI / 4);
  const originMat = new THREE.MeshStandardMaterial({
    color: 0xfde68a,
    roughness: 0.35,
    metalness: 0.2,
    emissive: new THREE.Color(0xd97706),
    emissiveIntensity: 0.25,
  });
  const originMarker = new THREE.Mesh(originGeo, originMat);
  originMarker.name = '__EditorGuide_OriginMarker';
  originMarker.position.set(0, 0.12, 0);
  originMarker.userData = { isEditorGuide: true, selectable: false };
  originMarker.raycast = () => {};

  guidesGroup.userData.axisLines = {
    x: xAxisLine,
    y: yAxisLine,
    z: zAxisLine,
  };

  guidesGroup.add(xAxisLine, yAxisLine, zAxisLine, originMarker);

  return guidesGroup;
}

/**
 * Toggles the visibility of the X (Red), Y (Green), and Z (Blue) origin axis lines in the 3D Viewport.
 *
 * @param {THREE.Group | null} guidesGroup
 * @param {{ x?: boolean, y?: boolean, z?: boolean }} visibility
 */
export function setEditorAxisGuidesVisibility(guidesGroup, visibility = {}) {
  if (!guidesGroup) return;
  const xLine = guidesGroup.getObjectByName('__EditorGuide_AxisX');
  const yLine = guidesGroup.getObjectByName('__EditorGuide_AxisY');
  const zLine = guidesGroup.getObjectByName('__EditorGuide_AxisZ');

  if (xLine && typeof visibility.x === 'boolean') xLine.visible = visibility.x;
  if (yLine && typeof visibility.y === 'boolean') yLine.visible = visibility.y;
  if (zLine && typeof visibility.z === 'boolean') zLine.visible = visibility.z;
}

/**
 * Filters a list of `THREE.Raycaster` intersections and returns the first selectable
 * `EngineNode` in the scene, strictly ignoring editor guides, collider wireframes,
 * and locked nodes.
 *
 * @param {THREE.Intersection[]} intersects
 * @param {EngineNode | null} sceneRoot
 * @returns {EngineNode | null}
 */
export function pickSelectableNodeFromIntersects(intersects, sceneRoot) {
  if (!Array.isArray(intersects) || !sceneRoot) return null;

  for (const hit of intersects) {
    if (!hit || !hit.object) continue;
    if (hit.object.userData?.isEditorGuide || hit.object.userData?.isColliderWireframe) {
      continue;
    }

    // Check if any ancestor is an Editor Guide
    let ancestorCheck = hit.object;
    let insideGuide = false;
    while (ancestorCheck) {
      if (ancestorCheck.userData?.isEditorGuide) {
        insideGuide = true;
        break;
      }
      ancestorCheck = ancestorCheck.parent;
    }
    if (insideGuide) continue;

    let resolvedNode = null;
    if (hit.object.userData?.ownerNode instanceof EngineNode) {
      resolvedNode = hit.object.userData.ownerNode;
    } else {
      let curr = hit.object;
      while (curr) {
        if (curr instanceof EngineNode) {
          resolvedNode = curr;
          break;
        }
        curr = curr.parent;
      }
    }

    if (
      resolvedNode &&
      (resolvedNode !== sceneRoot ||
        resolvedNode.nodeType !== 'EngineNode')
    ) {
      return resolvedNode;
    }
  }

  return null;
}

/**
 * Cached procedural CanvasTexture for the 3D Camera Icon Badge in the Viewport.
 */
let _cachedCameraIconTexture = null;
function getCameraBadgeTexture() {
  if (_cachedCameraIconTexture) return _cachedCameraIconTexture;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Rounded dark pill background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(10, 22, 108, 84, 20);
  ctx.fill();
  ctx.stroke();

  // Camera body icon
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.roundRect(26, 46, 52, 38, 8);
  ctx.fill();

  // Top film reels
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(39, 38, 9, 0, Math.PI * 2);
  ctx.arc(63, 38, 9, 0, Math.PI * 2);
  ctx.fill();

  // Camera lens cone pointing right
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(78, 56);
  ctx.lineTo(102, 44);
  ctx.lineTo(102, 86);
  ctx.lineTo(78, 74);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  _cachedCameraIconTexture = texture;
  return texture;
}

/**
 * Creates the 3D Viewport visual representation for a `Camera3D` / `Camera3DNode`
 * including:
 * 1. Composite 3D camera body + dual film reels + lens hood (clickable in the viewport to select the camera).
 * 2. Floating 3D Camera Icon Sprite badge above the camera.
 * 3. Built-in Direction Lines on the camera itself (`-Z` forward sight ray + arrowhead + near frame + `+Y` UP triangle)
 *    so the user always sees which direction the camera is pointing even when not selected.
 *
 * Strictly marked with `isViewportHelper: true, isColliderHelper: true` so `EngineNode.serialize()`
 * never includes it in `.scene.json`.
 *
 * @param {EngineNode} cameraNode
 * @param {boolean} [isSelected=false]
 * @returns {THREE.Group}
 */
export function createCameraNodeVisualHelper(cameraNode, isSelected = false) {
  const helperGroup = new THREE.Group();
  helperGroup.name = `${cameraNode.name}__ViewportHelper`;
  helperGroup.userData = {
    isViewportHelper: true,
    isColliderHelper: true,
    isCameraNodeHelper: true,
    ownerUuid: cameraNode.uuid,
  };

  const bodyColor = isSelected ? 0x0284c7 : 0x1e293b;
  const accentColor = isSelected ? 0xfacc15 : 0x38bdf8;
  const dirLineColor = isSelected ? 0xfacc15 : 0x22d3ee;

  // 1. Main Camera Chassis (Box)
  const chassisGeo = new THREE.BoxGeometry(0.46, 0.34, 0.56);
  const chassisMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.35,
    metalness: 0.65,
    emissive: isSelected ? new THREE.Color(0x0369a1) : new THREE.Color(0x000000),
    emissiveIntensity: isSelected ? 0.45 : 0,
  });
  const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
  chassisMesh.userData = { ownerNode: cameraNode, exactNode: cameraNode };
  helperGroup.add(chassisMesh);

  // 2. Dual Top Film Reels (Cylinders)
  const reelGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 16);
  reelGeo.rotateZ(Math.PI / 2);
  const reelMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.3,
    metalness: 0.7,
  });
  const frontReel = new THREE.Mesh(reelGeo, reelMat);
  frontReel.position.set(0, 0.25, -0.11);
  frontReel.userData = { ownerNode: cameraNode, exactNode: cameraNode };
  helperGroup.add(frontReel);

  const backReel = new THREE.Mesh(reelGeo, reelMat);
  backReel.position.set(0, 0.25, 0.15);
  backReel.userData = { ownerNode: cameraNode, exactNode: cameraNode };
  helperGroup.add(backReel);

  // 3. Lens Barrel pointing toward -Z (Three.js camera forward axis)
  const lensGeo = new THREE.CylinderGeometry(0.11, 0.16, 0.26, 16);
  lensGeo.rotateX(Math.PI / 2);
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.2,
    metalness: 0.85,
  });
  const lensMesh = new THREE.Mesh(lensGeo, lensMat);
  lensMesh.position.set(0, 0, -0.38);
  lensMesh.userData = { ownerNode: cameraNode, exactNode: cameraNode };
  helperGroup.add(lensMesh);

  // 4. Floating 3D Camera Icon Badge Sprite above the camera body
  const badgeTex = getCameraBadgeTexture();
  if (badgeTex) {
    const spriteMat = new THREE.SpriteMaterial({
      map: badgeTex,
      transparent: true,
      depthTest: false,
    });
    const iconSprite = new THREE.Sprite(spriteMat);
    iconSprite.position.set(0, 0.62, 0);
    iconSprite.scale.set(0.55, 0.55, 1);
    iconSprite.renderOrder = 10;
    iconSprite.userData = { ownerNode: cameraNode, exactNode: cameraNode };
    helperGroup.add(iconSprite);
  }

  // 5. Built-in Direction Lines on the Camera itself (-Z forward sight arrow + near frame + +Y UP indicator)
  const fovDeg = Math.min(130, Math.max(20, Number(cameraNode.fov) || 60));
  const aspect = Math.max(0.5, Number(cameraNode.aspect) || 16 / 9);
  const sightDist = 1.65;
  const halfH =
    cameraNode.projection === 'orthographic'
      ? Math.min(1.2, Math.max(0.3, (Number(cameraNode.size) || 10) * 0.08))
      : Math.min(1.3, Math.max(0.28, Math.tan(THREE.MathUtils.degToRad(fovDeg * 0.5)) * 0.85));
  const halfW = halfH * Math.min(2.2, aspect);
  const frameZ = -1.25;

  const linePoints = [
    // Central forward optical axis ray from lens (0, 0, -0.48) to arrow tip (0, 0, -sightDist)
    new THREE.Vector3(0, 0, -0.48),
    new THREE.Vector3(0, 0, -sightDist),

    // 4 Pyramid sight rays from lens to the near direction frame at z = frameZ
    new THREE.Vector3(0, 0, -0.42),
    new THREE.Vector3(-halfW, halfH, frameZ),
    new THREE.Vector3(0, 0, -0.42),
    new THREE.Vector3(halfW, halfH, frameZ),
    new THREE.Vector3(0, 0, -0.42),
    new THREE.Vector3(halfW, -halfH, frameZ),
    new THREE.Vector3(0, 0, -0.42),
    new THREE.Vector3(-halfW, -halfH, frameZ),

    // Near direction frame rectangle
    new THREE.Vector3(-halfW, halfH, frameZ),
    new THREE.Vector3(halfW, halfH, frameZ),
    new THREE.Vector3(halfW, halfH, frameZ),
    new THREE.Vector3(halfW, -halfH, frameZ),
    new THREE.Vector3(halfW, -halfH, frameZ),
    new THREE.Vector3(-halfW, -halfH, frameZ),
    new THREE.Vector3(-halfW, -halfH, frameZ),
    new THREE.Vector3(-halfW, halfH, frameZ),

    // +Y "UP" orientation triangle above the top edge of the direction frame
    new THREE.Vector3(-halfW * 0.38, halfH + 0.04, frameZ),
    new THREE.Vector3(0, halfH + 0.24, frameZ),
    new THREE.Vector3(0, halfH + 0.24, frameZ),
    new THREE.Vector3(halfW * 0.38, halfH + 0.04, frameZ),
    new THREE.Vector3(halfW * 0.38, halfH + 0.04, frameZ),
    new THREE.Vector3(-halfW * 0.38, halfH + 0.04, frameZ),
  ];

  const dirGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
  const dirMat = new THREE.LineBasicMaterial({
    color: dirLineColor,
    transparent: true,
    opacity: isSelected ? 0.98 : 0.82,
    depthWrite: false,
  });
  const dirLines = new THREE.LineSegments(dirGeo, dirMat);
  dirLines.name = '__CameraDirectionLines';
  dirLines.userData = { isColliderWireframe: true, isEditorGuide: true };
  dirLines.raycast = () => {};
  helperGroup.add(dirLines);

  // Forward Arrow Cone at tip of -Z optical axis
  const arrowConeGeo = new THREE.ConeGeometry(0.085, 0.24, 12);
  arrowConeGeo.rotateX(-Math.PI / 2); // Point along -Z
  const arrowConeMat = new THREE.MeshBasicMaterial({
    color: dirLineColor,
  });
  const arrowCone = new THREE.Mesh(arrowConeGeo, arrowConeMat);
  arrowCone.position.set(0, 0, -sightDist - 0.08);
  arrowCone.name = '__CameraDirectionArrowTip';
  arrowCone.userData = { isColliderWireframe: true, isEditorGuide: true };
  arrowCone.raycast = () => {};
  helperGroup.add(arrowCone);

  return helperGroup;
}

/**
 * Instantiates or updates a `THREE.CameraHelper` (yellow wireframe frustum showing FOV, Aspect, Near, and Far)
 * bound to a `Camera3D` / `Camera3DNode`.
 *
 * Strictly marked with `isEditorGuide: true, isViewportHelper: true` and `raycast = () => {}`
 * so it never interferes with selection raycasts and is never serialized in `.scene.json`.
 *
 * @param {any} cameraNode
 * @returns {{ helper: THREE.CameraHelper, virtualCamera: THREE.Camera }}
 */
export function createCameraFrustumHelper(cameraNode) {
  const virtualCamera = cameraNode._buildThreeCamera(cameraNode.aspect || 16 / 9);
  const helper = new THREE.CameraHelper(virtualCamera);
  helper.name = `__Maxros_CameraFrustumHelper_${cameraNode.uuid}`;
  helper.userData = {
    isEditorGuide: true,
    isViewportHelper: true,
    isCameraFrustumHelper: true,
    selectable: false,
    targetCameraUuid: cameraNode.uuid,
  };
  helper.raycast = () => {};
  helper.traverse((child) => {
    child.userData = {
      isEditorGuide: true,
      isViewportHelper: true,
      isCameraFrustumHelper: true,
      selectable: false,
    };
    child.raycast = () => {};
  });
  helper.update();
  return { helper, virtualCamera };
}

/**
 * Synchronizes an existing `{ helper, virtualCamera }` pair with the latest transform and
 * optical properties (`fov`, `aspect`, `size`, `near`, `far`, `projection`) of `cameraNode`
 * and calls `helper.update()`.
 *
 * @param {any} cameraNode
 * @param {{ helper: THREE.CameraHelper, virtualCamera: THREE.Camera }} bundle
 * @returns {boolean} True if updated in place, false if projection type changed and requires recreation.
 */
export function syncCameraFrustumHelper(cameraNode, bundle) {
  if (!cameraNode || !bundle || !bundle.helper || !bundle.virtualCamera) return false;
  const { helper, virtualCamera } = bundle;

  const isOrthoNode = cameraNode.projection === 'orthographic';
  const isOrthoCam = virtualCamera.isOrthographicCamera === true;
  if (isOrthoNode !== isOrthoCam) {
    return false; // Caller should recreate helper for new camera projection class
  }

  const aspect =
    typeof cameraNode.aspect === 'number' && cameraNode.aspect > 0 ? cameraNode.aspect : 16 / 9;
  const safeNear = Math.max(0.01, Number(cameraNode.near) || 0.1);
  const safeFar = Math.max(safeNear + 0.5, Number(cameraNode.far) || 1000);

  if (isOrthoCam) {
    const halfH = Math.max(0.1, Number(cameraNode.size) || 10) / 2;
    const halfW = halfH * aspect;
    virtualCamera.left = -halfW;
    virtualCamera.right = halfW;
    virtualCamera.top = halfH;
    virtualCamera.bottom = -halfH;
    virtualCamera.near = safeNear;
    virtualCamera.far = safeFar;
  } else {
    virtualCamera.fov = Math.min(170, Math.max(5, Number(cameraNode.fov) || 60));
    virtualCamera.aspect = aspect;
    virtualCamera.near = safeNear;
    virtualCamera.far = safeFar;
  }

  cameraNode.updateWorldMatrix(true, false);
  virtualCamera.position.copy(cameraNode.globalPosition);
  virtualCamera.quaternion.copy(cameraNode.globalQuaternion);
  virtualCamera.updateProjectionMatrix();
  virtualCamera.updateMatrixWorld(true);
  helper.update();
  return true;
}

/**
 * Computes the Editor Camera target position, lookAt center, and view direction for the
 * 6 standard axis alignment views:
 * - `'top'`:    Y+ looking down (0, -1, 0)
 * - `'bottom'`: Y- looking up   (0, +1, 0)
 * - `'left'`:   X- looking right (+1, 0, 0)
 * - `'right'`:  X+ looking left  (-1, 0, 0)
 * - `'front'`:  Z+ looking back  (0, 0, -1)
 * - `'back'`:   Z- looking forward (0, 0, +1)
 *
 * @param {'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'} preset
 * @param {THREE.Vector3} [center=new THREE.Vector3(0, 0, 0)]
 * @param {number} [distance=14]
 */
export function computeEditorCameraPresetPose(
  preset,
  center = new THREE.Vector3(0, 0, 0),
  distance = 14
) {
  const d = Math.max(2, Number(distance) || 14);
  const c = new THREE.Vector3(center.x || 0, center.y || 0, center.z || 0);
  const pos = c.clone();
  const direction = new THREE.Vector3();
  let label = 'Frontal (Z+)';

  // Tiny epsilon on Z for top/bottom prevents OrbitControls polar-angle singularity while keeping exact axis alignment
  const eps = 0.0001;

  switch (preset) {
    case 'top':
      pos.set(c.x, c.y + d, c.z + eps);
      direction.set(0, -1, 0);
      label = 'Visão de Cima (Top · Y+)';
      break;
    case 'bottom':
      pos.set(c.x, c.y - d, c.z + eps);
      direction.set(0, 1, 0);
      label = 'Visão de Baixo (Bottom · Y-)';
      break;
    case 'left':
      pos.set(c.x - d, c.y, c.z);
      direction.set(1, 0, 0);
      label = 'Visão Esquerda (Left · X-)';
      break;
    case 'right':
      pos.set(c.x + d, c.y, c.z);
      direction.set(-1, 0, 0);
      label = 'Visão Direita (Right · X+)';
      break;
    case 'back':
      pos.set(c.x, c.y, c.z - d);
      direction.set(0, 0, 1);
      label = 'Visão Traseira (Back · Z-)';
      break;
    case 'front':
    default:
      pos.set(c.x, c.y, c.z + d);
      direction.set(0, 0, -1);
      label = 'Visão Frontal (Front · Z+)';
      break;
  }

  return {
    preset,
    label,
    targetCenter: c,
    targetCamPos: pos,
    position: pos,
    lookDirection: direction,
  };
}
