import * as THREE from 'three';
import { Node, Node3D } from './EngineNode.js';
import { Material, Curve3D, AnimationClip, Easing, Rng, Theme } from '../core/NativeClasses.js';

/**
 * Maxros Engine - Todos os Nós de Cena 3D, Tempo, Áudio, Animação e Interface (UI)
 */

// ============================================================================
// 1. CAMERA3D (Seção 7.1)
// ============================================================================
export class Camera3D extends Node3D {
  constructor(nameOrConfig = 'Camera3D', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'Camera3D') : nameOrConfig;
    super(name);
    this.nodeType = 'Camera3D';
    this.current = cfg.current ?? true;
    this.projection = cfg.projection || 'perspective';
    this.fov = cfg.fov ?? 60;
    this.aspect = cfg.aspect ?? 1.7778;
    this.size = cfg.size ?? 10;
    this.near = cfg.near ?? 0.1;
    this.far = cfg.far ?? 1000;
    this.threeCamera = this._buildThreeCamera(this.aspect);
  }

  makeCurrent() {
    this.current = true;
    const root = this.getRootNode();
    const unsetOthers = (n) => {
      if (n !== this && (n.type === 'Camera3D' || n.type === 'Camera3DNode')) n.current = false;
      for (const ch of n.getChildren()) unsetOthers(ch);
    };
    unsetOthers(root);
    const tree = this.getTree();
    if (tree) tree.currentCamera = this;
  }

  _buildThreeCamera(aspectOverride) {
    const aspect =
      typeof aspectOverride === 'number' && aspectOverride > 0
        ? aspectOverride
        : typeof this.aspect === 'number' && this.aspect > 0
        ? this.aspect
        : 16 / 9;
    let cam;
    if (this.projection === 'orthographic') {
      const halfH = this.size / 2;
      const halfW = halfH * aspect;
      cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, this.near, this.far);
    } else {
      cam = new THREE.PerspectiveCamera(this.fov, aspect, this.near, this.far);
    }
    this.updateWorldMatrix(true, false);
    cam.position.copy(this.globalPosition);
    cam.quaternion.copy(this.globalQuaternion);
    cam.updateMatrixWorld(true);
    this.threeCamera = cam;
    return cam;
  }

  worldToScreen(ponto3D, viewport = { width: 800, height: 600 }) {
    const cam = this._buildThreeCamera(viewport.width / Math.max(1, viewport.height));
    const v = new THREE.Vector3(ponto3D.x ?? 0, ponto3D.y ?? 0, ponto3D.z ?? 0);
    v.project(cam);
    return {
      x: (v.x * 0.5 + 0.5) * viewport.width,
      y: (-v.y * 0.5 + 0.5) * viewport.height,
      ndcZ: v.z
    };
  }

  screenToRay(ponto2D, viewport = { width: 800, height: 600 }) {
    const cam = this._buildThreeCamera(viewport.width / Math.max(1, viewport.height));
    const ndc = new THREE.Vector2(
      (ponto2D.x / Math.max(1, viewport.width)) * 2 - 1,
      -(ponto2D.y / Math.max(1, viewport.height)) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, cam);
    return {
      origin: { x: raycaster.ray.origin.x, y: raycaster.ray.origin.y, z: raycaster.ray.origin.z },
      direction: { x: raycaster.ray.direction.x, y: raycaster.ray.direction.y, z: raycaster.ray.direction.z }
    };
  }

  screenToWorld(ponto2D, profundidade = 5, viewport = { width: 800, height: 600 }) {
    const ray = this.screenToRay(ponto2D, viewport);
    return {
      x: ray.origin.x + ray.direction.x * profundidade,
      y: ray.origin.y + ray.direction.y * profundidade,
      z: ray.origin.z + ray.direction.z * profundidade
    };
  }

  serialize() {
    const base = super.serialize();
    base.camera = {
      current: this.current,
      projection: this.projection,
      fov: this.fov,
      aspect: this.aspect,
      size: this.size,
      near: this.near,
      far: this.far
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const c = data.camera || data;
    if (typeof c.current === 'boolean') this.current = c.current;
    if (c.projection) this.projection = c.projection;
    if (typeof c.fov === 'number') this.fov = c.fov;
    if (typeof c.aspect === 'number' && c.aspect > 0) this.aspect = c.aspect;
    if (typeof c.size === 'number') this.size = c.size;
    if (typeof c.near === 'number') this.near = c.near;
    if (typeof c.far === 'number') this.far = c.far;
    this._buildThreeCamera(this.aspect);
    return this;
  }
}

export const Camera3DNode = Camera3D;

// ============================================================================
// 2. LIGHT3D & SUBCLASSES (Seção 7.2)
// ============================================================================
export class Light3D extends Node3D {
  constructor(nameOrConfig = 'Light3D', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'Light3D') : nameOrConfig;
    super(name);
    this.nodeType = 'Light3D';
    this.lightType = cfg.lightType || 'directional';
    this.color = cfg.color || '#ffffff';
    this.intensity = cfg.intensity ?? 1.2;
    this.castShadow = Boolean(cfg.castShadow ?? false);
    this.shadowMapSize = cfg.shadowMapSize || 1024;
    this.shadowBias = cfg.shadowBias ?? -0.0005;
    this.range = cfg.range ?? 20;
    this.decay = cfg.decay ?? 2;
    this.angle = cfg.angle ?? 45;
    this.penumbra = cfg.penumbra ?? 0.2;
    this.groundColor = cfg.groundColor || '#1e293b';

    this._lightHelperObj = null;
    this._rebuildLight();
  }

  _rebuildLight() {
    if (this._lightHelperObj) {
      super.remove(this._lightHelperObj);
    }
    let light;
    const c = new THREE.Color(this.color || '#ffffff');
    switch (this.lightType) {
      case 'point':
        light = new THREE.PointLight(c, this.intensity, this.range, this.decay);
        break;
      case 'spot':
        light = new THREE.SpotLight(c, this.intensity, this.range, (this.angle * Math.PI) / 180, this.penumbra, this.decay);
        break;
      case 'ambient':
        light = new THREE.AmbientLight(c, this.intensity);
        break;
      case 'hemisphere':
        light = new THREE.HemisphereLight(c, new THREE.Color(this.groundColor || '#1e293b'), this.intensity);
        break;
      case 'directional':
      default:
        light = new THREE.DirectionalLight(c, this.intensity);
        break;
    }
    light.userData.isViewportHelper = true;
    this._lightHelperObj = light;
    super.add(light);
  }

  serialize() {
    const base = super.serialize();
    base.light = {
      lightType: this.lightType,
      color: this.color,
      intensity: this.intensity,
      castShadow: this.castShadow,
      shadowMapSize: this.shadowMapSize,
      shadowBias: this.shadowBias,
      range: this.range,
      decay: this.decay,
      angle: this.angle,
      penumbra: this.penumbra,
      groundColor: this.groundColor
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const l = data.light || data;
    if (l.lightType) this.lightType = l.lightType;
    if (l.color) this.color = l.color;
    if (typeof l.intensity === 'number') this.intensity = l.intensity;
    if (typeof l.castShadow === 'boolean') this.castShadow = l.castShadow;
    if (typeof l.range === 'number') this.range = l.range;
    if (typeof l.decay === 'number') this.decay = l.decay;
    if (typeof l.angle === 'number') this.angle = l.angle;
    if (typeof l.penumbra === 'number') this.penumbra = l.penumbra;
    if (l.groundColor) this.groundColor = l.groundColor;
    this._rebuildLight();
    return this;
  }
}

export class DirectionalLight3D extends Light3D {
  constructor(name = 'DirectionalLight3D', config = {}) {
    super(name, { ...config, lightType: 'directional' });
    this.nodeType = 'DirectionalLight3D';
  }
}

export class PointLight3D extends Light3D {
  constructor(name = 'PointLight3D', config = {}) {
    super(name, { ...config, lightType: 'point' });
    this.nodeType = 'PointLight3D';
  }
}

export class SpotLight3D extends Light3D {
  constructor(name = 'SpotLight3D', config = {}) {
    super(name, { ...config, lightType: 'spot' });
    this.nodeType = 'SpotLight3D';
  }
}

export class AmbientLight3D extends Light3D {
  constructor(name = 'AmbientLight3D', config = {}) {
    super(name, { ...config, lightType: 'ambient' });
    this.nodeType = 'AmbientLight3D';
  }
}

export class HemisphereLight3D extends Light3D {
  constructor(name = 'HemisphereLight3D', config = {}) {
    super(name, { ...config, lightType: 'hemisphere' });
    this.nodeType = 'HemisphereLight3D';
  }
}

// ============================================================================
// 3. MESH3D (Seção 7.3 - Formas Geométricas Nativas)
// ============================================================================
export class Mesh3D extends Node3D {
  /**
   * @param {string | Record<string, any>} [nameOrConfig='Mesh3D']
   * @param {Record<string, any>} [config={}]
   */
  constructor(nameOrConfig = 'Mesh3D', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'Mesh3D') : nameOrConfig;
    super(name);
    this.nodeType = 'Mesh3D';
    this._shape = cfg.shape || 'box';
    this._shapeParams = cfg.shapeParams || cfg.size || {};
    this._material = cfg.material instanceof Material
      ? cfg.material
      : new Material(cfg.material || {
          color: cfg.color || '#38bdf8',
          emissive: cfg.emissive || '#000000',
          emissiveIntensity: cfg.emissiveIntensity ?? 0,
          roughness: cfg.roughness ?? 0.35,
          metalness: cfg.metalness ?? 0.2,
          wireframe: Boolean(cfg.wireframe)
        });
    this.castShadow = cfg.castShadow ?? true;
    this.receiveShadow = cfg.receiveShadow ?? true;
    this.pickable = cfg.pickable ?? true;

    this._meshObj = null;
    this.rebuildMesh();
  }

  get shape() {
    return this._shape;
  }

  set shape(val) {
    this._shape = val || 'box';
    this.rebuildMesh();
  }

  get shapeParams() {
    return this._shapeParams;
  }

  set shapeParams(val) {
    this._shapeParams = val || {};
    this.rebuildMesh();
  }

  get color() {
    return this._material.color;
  }

  set color(val) {
    this._material.color = val;
    if (this._meshObj && this._meshObj.material && this._meshObj.material.color) {
      this._meshObj.material.color.set(val);
    }
  }

  get wireframe() {
    return Boolean(this._material.wireframe);
  }

  set wireframe(val) {
    this._material.wireframe = Boolean(val);
    this.rebuildMesh();
  }

  _rebuildMesh() {
    return this.rebuildMesh();
  }

  get material() {
    return this._material;
  }

  set material(mat) {
    this.setMaterial(mat);
  }

  setMaterial(mat) {
    this._material = mat instanceof Material ? mat : new Material(mat || {});
    this.rebuildMesh();
  }

  getMaterial() {
    return this._material;
  }

  _buildGeometry() {
    const p = this._shapeParams || {};
    switch (this._shape) {
      case 'sphere':
        return new THREE.SphereGeometry(p.radius ?? 0.6, p.widthSegments ?? 24, p.heightSegments ?? 18);
      case 'cylinder':
        return new THREE.CylinderGeometry(
          p.radiusTop ?? p.radius ?? 0.5,
          p.radiusBottom ?? p.radius ?? 0.5,
          p.height ?? 1.2,
          p.radialSegments ?? 20
        );
      case 'cone':
        return new THREE.ConeGeometry(p.radius ?? 0.6, p.height ?? 1.3, p.radialSegments ?? 20);
      case 'torus':
        return new THREE.TorusGeometry(p.radius ?? 0.6, p.tube ?? 0.18, p.radialSegments ?? 16, p.tubularSegments ?? 32);
      case 'torusKnot':
        return new THREE.TorusKnotGeometry(p.radius ?? 0.5, p.tube ?? 0.15, p.tubularSegments ?? 48, p.radialSegments ?? 12);
      case 'plane':
        return new THREE.PlaneGeometry(p.width ?? 2, p.height ?? 2);
      case 'octahedron':
        return new THREE.OctahedronGeometry(p.radius ?? 0.65, p.detail ?? 0);
      case 'icosahedron':
        return new THREE.IcosahedronGeometry(p.radius ?? 0.65, p.detail ?? 0);
      case 'box':
      default:
        return new THREE.BoxGeometry(p.width ?? 1, p.height ?? 1, p.depth ?? 1);
    }
  }

  rebuildMesh() {
    if (this._meshObj) {
      if (this._meshObj.geometry) this._meshObj.geometry.dispose();
      if (this._meshObj.material) this._meshObj.material.dispose();
      super.remove(this._meshObj);
    }
    const geom = this._buildGeometry();
    const mat = this._material.toThreeMaterial();
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = this.receiveShadow;
    mesh.userData.isViewportHelper = true;
    mesh.userData.ownerNode = this;
    this._meshObj = mesh;
    super.add(mesh);
  }

  serialize() {
    const base = super.serialize();
    base.mesh = {
      shape: this._shape,
      shapeParams: { ...this._shapeParams },
      material: this._material.serialize(),
      castShadow: this.castShadow,
      receiveShadow: this.receiveShadow,
      pickable: this.pickable
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const m = data.mesh || data;
    if (m.shape) this._shape = m.shape;
    if (m.shapeParams && typeof m.shapeParams === 'object') {
      this._shapeParams = { ...m.shapeParams };
    }
    if (m.material && typeof m.material === 'object') {
      this._material = new Material(m.material);
    } else if (m.color) {
      this._material.color = m.color;
    }
    if (typeof m.castShadow === 'boolean') this.castShadow = m.castShadow;
    if (typeof m.receiveShadow === 'boolean') this.receiveShadow = m.receiveShadow;
    if (typeof m.pickable === 'boolean') this.pickable = m.pickable;
    this.rebuildMesh();
    return this;
  }
}

// ============================================================================
// 4. LABEL3D (Seção 7.5)
// ============================================================================
export class Label3D extends Node3D {
  constructor(nameOrConfig = 'Label3D', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'Label3D') : nameOrConfig;
    super(name);
    this.nodeType = 'Label3D';
    this.text = cfg.text ?? 'Label3D';
    this.font = cfg.font || 'Inter, sans-serif';
    this.fontSize = cfg.fontSize ?? 24;
    this.color = cfg.color || '#ffffff';
    this.outlineColor = cfg.outlineColor || '#000000';
    this.outlineSize = cfg.outlineSize ?? 2;
    this.align = cfg.align || 'center';
    this.maxWidth = cfg.maxWidth ?? 400;
    this.billboard = cfg.billboard || 'spherical';
    this.opacity = cfg.opacity ?? 1;
  }

  serialize() {
    const base = super.serialize();
    base.label3D = {
      text: this.text,
      font: this.font,
      fontSize: this.fontSize,
      color: this.color,
      outlineColor: this.outlineColor,
      outlineSize: this.outlineSize,
      align: this.align,
      maxWidth: this.maxWidth,
      billboard: this.billboard,
      opacity: this.opacity
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const l = data.label3D || data;
    if (typeof l.text === 'string') this.text = l.text;
    if (l.font) this.font = l.font;
    if (typeof l.fontSize === 'number') this.fontSize = l.fontSize;
    if (l.color) this.color = l.color;
    if (l.outlineColor) this.outlineColor = l.outlineColor;
    if (typeof l.outlineSize === 'number') this.outlineSize = l.outlineSize;
    if (l.align) this.align = l.align;
    if (typeof l.maxWidth === 'number') this.maxWidth = l.maxWidth;
    if (l.billboard) this.billboard = l.billboard;
    if (typeof l.opacity === 'number') this.opacity = l.opacity;
    return this;
  }
}

// ============================================================================
// 5. PARTICLES3D (Seção 7.6)
// ============================================================================
export class Particles3D extends Node3D {
  constructor(nameOrConfig = 'Particles3D', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'Particles3D') : nameOrConfig;
    super(name);
    this.nodeType = 'Particles3D';
    this.emitting = cfg.emitting ?? true;
    this.oneShot = Boolean(cfg.oneShot ?? false);
    this.amount = cfg.amount ?? 24;
    this.lifetime = cfg.lifetime ?? 1.0;
    this.explosiveness = cfg.explosiveness ?? 0.5;
    this.spawnShape = cfg.spawnShape || 'sphere';
    this.shapeSize = cfg.shapeSize ?? 0.4;
    this.direction = cfg.direction || { x: 0, y: 1, z: 0 };
    this.spread = cfg.spread ?? 60;
    this.speedMin = cfg.speedMin ?? 1.5;
    this.speedMax = cfg.speedMax ?? 3.5;
    this.gravity = cfg.gravity || { x: 0, y: -3, z: 0 };
    this.damping = cfg.damping ?? 0.1;
    this.sizeStart = cfg.sizeStart ?? 0.18;
    this.sizeEnd = cfg.sizeEnd ?? 0.02;
    this.colorOverLife = cfg.colorOverLife || ['#fde047', '#f97316'];
    this.opacityOverLife = cfg.opacityOverLife || [1, 0];
    this.rotationSpeed = cfg.rotationSpeed ?? 0;
    this.blending = cfg.blending || 'additive';

    this._rng = new Rng(1337);
    this._particles = [];
    this.defineSignal('finished');

    this._pointsObj = null;
    this._initVisualPoints();
    if (this.emitting && !this.oneShot) {
      this.emitBurst(Math.min(12, this.amount));
    }
  }

  _initVisualPoints() {
    if (this._pointsObj) {
      super.remove(this._pointsObj);
    }
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(Math.max(1, this.amount) * 3);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(this.colorOverLife[0] || '#fde047'),
      size: this.sizeStart || 0.18,
      transparent: true,
      opacity: 0.9
    });
    const pts = new THREE.Points(geom, mat);
    pts.userData.isViewportHelper = true;
    this._pointsObj = pts;
    super.add(pts);
  }

  restart() {
    this.clear();
    this.emitting = true;
    this.emitBurst(this.amount);
  }

  emitBurst(quantidade = this.amount) {
    const count = Math.max(1, Number(quantidade) || this.amount);
    for (let i = 0; i < count; i++) {
      const speed = this._rng.float(this.speedMin, this.speedMax);
      const vx = (this.direction.x + this._rng.float(-0.7, 0.7)) * speed;
      const vy = (this.direction.y + this._rng.float(-0.3, 0.9)) * speed;
      const vz = (this.direction.z + this._rng.float(-0.7, 0.7)) * speed;
      this._particles.push({
        x: this._rng.float(-this.shapeSize, this.shapeSize) * 0.25,
        y: this._rng.float(-this.shapeSize, this.shapeSize) * 0.25,
        z: this._rng.float(-this.shapeSize, this.shapeSize) * 0.25,
        vx,
        vy,
        vz,
        age: 0,
        maxLife: Math.max(0.1, this.lifetime * this._rng.float(0.75, 1.25))
      });
    }
    this._syncVisualBuffer();
  }

  stop() {
    this.emitting = false;
  }

  clear() {
    this._particles = [];
    this._syncVisualBuffer();
  }

  _syncVisualBuffer() {
    if (!this._pointsObj) return;
    const maxPts = Math.max(this.amount, this._particles.length, 1);
    const positions = new Float32Array(maxPts * 3);
    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    this._pointsObj.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._pointsObj.geometry.attributes.position.needsUpdate = true;
  }

  _stepNodeInternal(dt) {
    super._stepNodeInternal(dt);
    if (this._particles.length === 0 && !this.emitting) return;

    const alive = [];
    for (const p of this._particles) {
      p.age += dt;
      if (p.age < p.maxLife) {
        p.vx += (this.gravity.x ?? 0) * dt;
        p.vy += (this.gravity.y ?? 0) * dt;
        p.vz += (this.gravity.z ?? 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        alive.push(p);
      }
    }
    const hadParticles = this._particles.length > 0;
    this._particles = alive;

    if (this.emitting && !this.oneShot && this._particles.length < Math.floor(this.amount * 0.5)) {
      this.emitBurst(2);
    } else if (this.oneShot && hadParticles && this._particles.length === 0) {
      this.emitting = false;
      this.emit('finished');
    }

    this._syncVisualBuffer();
  }

  serialize() {
    const base = super.serialize();
    base.particles = {
      emitting: this.emitting,
      oneShot: this.oneShot,
      amount: this.amount,
      lifetime: this.lifetime,
      colorOverLife: [...this.colorOverLife]
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const p = data.particles || data;
    if (typeof p.emitting === 'boolean') this.emitting = p.emitting;
    if (typeof p.oneShot === 'boolean') this.oneShot = p.oneShot;
    if (typeof p.amount === 'number') this.amount = p.amount;
    if (typeof p.lifetime === 'number') this.lifetime = p.lifetime;
    if (Array.isArray(p.colorOverLife)) this.colorOverLife = [...p.colorOverLife];
    this._initVisualPoints();
    return this;
  }
}

// ============================================================================
// 6. PATH3D & PATHFOLLOW3D (Seção 7.7)
// ============================================================================
export class Path3D extends Node3D {
  constructor(nameOrConfig = 'Path3D', points = []) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const name = isObj ? (nameOrConfig.name || 'Path3D') : nameOrConfig;
    const pts = isObj ? (nameOrConfig.curvePoints || nameOrConfig.points || []) : points;
    super(name);
    this.nodeType = 'Path3D';
    this.curve = pts instanceof Curve3D ? pts : new Curve3D(pts);
  }

  serialize() {
    const base = super.serialize();
    base.curvePoints = this.curve.serialize();
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    if (Array.isArray(data.curvePoints)) {
      this.curve = new Curve3D(data.curvePoints);
    }
    return this;
  }
}

export class PathFollow3D extends Node3D {
  constructor(nameOrConfig = 'PathFollow3D', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'PathFollow3D') : nameOrConfig;
    super(name);
    this.nodeType = 'PathFollow3D';
    this._progress = cfg.progress ?? 0;
    this.speed = cfg.speed ?? 0;
    this.loop = cfg.loop ?? true;
    this.rotateAlongPath = cfg.rotateAlongPath ?? true;
    this.offset = cfg.offset || { x: 0, y: 0, z: 0 };
  }

  get progress() {
    return this._progress;
  }

  set progress(val) {
    let next = Number(val) || 0;
    if (this.loop) {
      next = ((next % 1) + 1) % 1;
    } else {
      next = Math.max(0, Math.min(1, next));
    }
    this._progress = next;
    this._updatePositionAlongPath();
  }

  _updatePositionAlongPath() {
    const parent = this.getParent();
    if (!parent || !parent.curve || typeof parent.curve.sample !== 'function') return;
    const pt = parent.curve.sample(this._progress);
    this.position = {
      x: pt.x + (this.offset.x ?? 0),
      y: pt.y + (this.offset.y ?? 0),
      z: pt.z + (this.offset.z ?? 0)
    };
    if (this.rotateAlongPath && typeof parent.curve.sampleTangent === 'function') {
      const tan = parent.curve.sampleTangent(this._progress);
      const yaw = Math.atan2(tan.x, tan.z);
      this.rotation.y = yaw;
    }
  }

  _stepNodeInternal(dt) {
    super._stepNodeInternal(dt);
    if (this.speed !== 0) {
      this.progress = this._progress + this.speed * dt;
    } else {
      this._updatePositionAlongPath();
    }
  }

  serialize() {
    const base = super.serialize();
    base.pathFollow = {
      progress: this._progress,
      speed: this.speed,
      loop: this.loop,
      rotateAlongPath: this.rotateAlongPath,
      offset: { ...this.offset }
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const pf = data.pathFollow || data;
    if (typeof pf.progress === 'number') this._progress = pf.progress;
    if (typeof pf.speed === 'number') this.speed = pf.speed;
    if (typeof pf.loop === 'boolean') this.loop = pf.loop;
    if (typeof pf.rotateAlongPath === 'boolean') this.rotateAlongPath = pf.rotateAlongPath;
    if (pf.offset && typeof pf.offset === 'object') this.offset = { ...pf.offset };
    return this;
  }
}

// ============================================================================
// 7. PICKAREA3D (Seção 7.8)
// ============================================================================
export class PickArea3D extends Node3D {
  constructor(nameOrConfig = 'PickArea3D', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'PickArea3D') : nameOrConfig;
    super(name);
    this.nodeType = 'PickArea3D';
    this.shape = cfg.shape || 'sphere';
    this.size = cfg.size || { x: 1, y: 1, z: 1, radius: 0.9 };
    this.enabled = cfg.enabled ?? true;
    this.pickPriority = cfg.pickPriority ?? 0;
    this.cursor = cfg.cursor || 'pointer';

    this.defineSignal('pointerEnter');
    this.defineSignal('pointerExit');
    this.defineSignal('pointerDown');
    this.defineSignal('pointerUp');
    this.defineSignal('clicked');
  }

  triggerClick(evento = {}) {
    if (!this.enabled) return;
    this.emit('pointerDown', evento);
    this.emit('pointerUp', evento);
    this.emit('clicked', evento);
  }

  serialize() {
    const base = super.serialize();
    base.pickArea = {
      shape: this.shape,
      size: { ...this.size },
      enabled: this.enabled,
      pickPriority: this.pickPriority,
      cursor: this.cursor
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const pa = data.pickArea || data;
    if (pa.shape) this.shape = pa.shape;
    if (pa.size && typeof pa.size === 'object') this.size = { ...pa.size };
    if (typeof pa.enabled === 'boolean') this.enabled = pa.enabled;
    if (typeof pa.pickPriority === 'number') this.pickPriority = pa.pickPriority;
    if (pa.cursor) this.cursor = pa.cursor;
    return this;
  }
}

// ============================================================================
// 8. TIMER (Seção 9)
// ============================================================================
export class Timer extends Node {
  constructor(nameOrConfig = 'Timer', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'Timer') : nameOrConfig;
    super(name);
    this.nodeType = 'Timer';
    this.waitTime = Math.max(0.001, Number(cfg.waitTime ?? 1.0));
    this.oneShot = Boolean(cfg.oneShot ?? false);
    this.autostart = Boolean(cfg.autostart ?? false);
    this.paused = Boolean(cfg.paused ?? false);
    this._running = this.autostart;
    this.timeLeft = this.waitTime;

    this.defineSignal('timeout');
  }

  _onReadyInternal() {
    super._onReadyInternal();
    if (this.autostart) {
      this.start();
    }
  }

  start(tempoOpcional) {
    if (tempoOpcional !== undefined) {
      this.waitTime = Math.max(0.001, Number(tempoOpcional));
    }
    this.timeLeft = this.waitTime;
    this._running = true;
    this.paused = false;
  }

  stop() {
    this._running = false;
  }

  _stepNodeInternal(dt) {
    super._stepNodeInternal(dt);
    if (!this._running || this.paused) return;
    this.timeLeft -= dt;
    while (this.timeLeft <= 0 && this._running) {
      this.emit('timeout');
      if (this.oneShot) {
        this._running = false;
        this.timeLeft = 0;
        break;
      } else {
        this.timeLeft += this.waitTime;
      }
    }
  }

  serialize() {
    const base = super.serialize();
    base.timer = {
      waitTime: this.waitTime,
      oneShot: this.oneShot,
      autostart: this.autostart,
      paused: this.paused
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const t = data.timer || data;
    if (typeof t.waitTime === 'number') this.waitTime = Math.max(0.001, t.waitTime);
    if (typeof t.oneShot === 'boolean') this.oneShot = t.oneShot;
    if (typeof t.autostart === 'boolean') this.autostart = t.autostart;
    if (typeof t.paused === 'boolean') this.paused = t.paused;
    this._running = this.autostart;
    this.timeLeft = this.waitTime;
    return this;
  }
}

// ============================================================================
// 9. AUDIOPLAYER (Seção 10)
// ============================================================================
export class AudioPlayer extends Node3D {
  constructor(nameOrConfig = 'AudioPlayer', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'AudioPlayer') : nameOrConfig;
    super(name);
    this.nodeType = 'AudioPlayer';
    this.src = cfg.src || '';
    this.bus = cfg.bus || 'sfx';
    this.volume = cfg.volume ?? 1.0;
    this.pitch = cfg.pitch ?? 1.0;
    this.loop = Boolean(cfg.loop ?? false);
    this.autoplay = Boolean(cfg.autoplay ?? false);
    this.spatial = Boolean(cfg.spatial ?? false);
    this.refDistance = cfg.refDistance ?? 1;
    this.maxDistance = cfg.maxDistance ?? 25;
    this.rolloffFactor = cfg.rolloffFactor ?? 1;
    this.playing = false;

    this.defineSignal('finished');
  }

  play() {
    this.playing = true;
  }

  stop() {
    this.playing = false;
  }

  pause() {
    this.playing = false;
  }

  resume() {
    this.playing = true;
  }

  seek(_segundos) {}

  fadeIn(_duracao = 0.5) {
    this.playing = true;
  }

  fadeOut(_duracao = 0.5) {
    this.playing = false;
  }

  serialize() {
    const base = super.serialize();
    base.audio = {
      src: this.src,
      bus: this.bus,
      volume: this.volume,
      pitch: this.pitch,
      loop: this.loop,
      autoplay: this.autoplay,
      spatial: this.spatial
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const a = data.audio || data;
    if (typeof a.src === 'string') this.src = a.src;
    if (a.bus) this.bus = a.bus;
    if (typeof a.volume === 'number') this.volume = a.volume;
    if (typeof a.pitch === 'number') this.pitch = a.pitch;
    if (typeof a.loop === 'boolean') this.loop = a.loop;
    if (typeof a.autoplay === 'boolean') this.autoplay = a.autoplay;
    if (typeof a.spatial === 'boolean') this.spatial = a.spatial;
    return this;
  }
}

// ============================================================================
// 10. ANIMATIONPLAYER (Seção 11 - Animação por Quadros-Chave)
// ============================================================================
export class AnimationPlayer extends Node {
  constructor(nameOrConfig = 'AnimationPlayer', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'AnimationPlayer') : nameOrConfig;
    super(name);
    this.nodeType = 'AnimationPlayer';
    this.clips = {};
    this.rootNode = cfg.rootNode || '..';
    this.current = cfg.current || '';
    this.playing = Boolean(cfg.playing ?? false);
    this.speed = cfg.speed ?? 1.0;
    this.autoplay = cfg.autoplay || '';
    this.resetOnStop = cfg.resetOnStop ?? true;
    this._playhead = 0;
    this._queue = [];

    this.defineSignal('started');
    this.defineSignal('finished');
    this.defineSignal('looped');
    this.defineSignal('event');

    if (cfg.clips && typeof cfg.clips === 'object') {
      for (const [k, v] of Object.entries(cfg.clips)) {
        this.addClip(v instanceof AnimationClip ? v : new AnimationClip({ ...v, name: k }));
      }
    }
    if (this.autoplay && this.clips[this.autoplay]) {
      this.play(this.autoplay);
    }
  }

  addClip(clipDef) {
    const clip = clipDef instanceof AnimationClip ? clipDef : new AnimationClip(clipDef);
    this.clips[clip.name] = clip;
    return clip;
  }

  removeClip(nome) {
    delete this.clips[nome];
  }

  has(nome) {
    return Boolean(this.clips[nome]);
  }

  getLength(nome) {
    return this.clips[nome] ? this.clips[nome].length : 0;
  }

  play(nome = this.current || this.autoplay, opcoes = {}) {
    if (!nome || !this.clips[nome]) return;
    if (opcoes.speed !== undefined) this.speed = opcoes.speed;
    this.current = nome;
    this._playhead = opcoes.from ?? 0;
    this.playing = true;
    this.emit('started', nome);
    this._sampleCurrentClip(this._playhead, 0);
  }

  stop() {
    this.playing = false;
    if (this.resetOnStop && this.current && this.clips[this.current]) {
      this._playhead = 0;
      this._sampleCurrentClip(0, 0);
    }
  }

  pause() {
    this.playing = false;
  }

  resume() {
    if (this.current && this.clips[this.current]) {
      this.playing = true;
    }
  }

  seek(segundos) {
    this._playhead = Math.max(0, Number(segundos) || 0);
    this._sampleCurrentClip(this._playhead, 0);
  }

  queue(nome) {
    if (this.clips[nome]) {
      this._queue.push(nome);
    }
  }

  _resolveBaseNode() {
    return this.getNodeOrNull(this.rootNode) || this.getParent() || this;
  }

  _sampleCurrentClip(time, prevTime) {
    const clip = this.clips[this.current];
    if (!clip) return;
    const baseNode = this._resolveBaseNode();
    if (!baseNode) return;

    for (const track of clip.tracks || []) {
      const targetNode = (!track.path || track.path === '.')
        ? baseNode
        : baseNode.getNodeOrNull(track.path);
      if (!targetNode) continue;

      const keys = track.keyframes || track.keys || [];
      if (keys.length === 0) continue;

      if (track.type === 'event') {
        for (const k of keys) {
          if (k.time > prevTime && k.time <= time) {
            this.emit('event', k.name || k.event || 'event', k.data);
          }
        }
        continue;
      }

      if (track.type === 'call') {
        for (const k of keys) {
          if (k.time > prevTime && k.time <= time && typeof targetNode[k.method] === 'function') {
            targetNode[k.method](...(k.args || []));
          }
        }
        continue;
      }

      let k0 = keys[0];
      let k1 = keys[keys.length - 1];
      for (let i = 0; i < keys.length - 1; i++) {
        if (time >= keys[i].time && time <= keys[i + 1].time) {
          k0 = keys[i];
          k1 = keys[i + 1];
          break;
        }
      }

      const span = Math.max(0.0001, k1.time - k0.time);
      const rawT = time <= k0.time ? 0 : time >= k1.time ? 1 : (time - k0.time) / span;
      const easedT = Easing.get(k0.easing || track.easing || 'linear')(rawT);

      const v0 = k0.value;
      const v1 = k1.value;
      let interpVal = v1;

      if (typeof v0 === 'number' && typeof v1 === 'number') {
        interpVal = v0 + (v1 - v0) * easedT;
      } else if (v0 && typeof v0 === 'object' && v1 && typeof v1 === 'object' && 'x' in v0) {
        interpVal = {
          x: v0.x + (v1.x - v0.x) * easedT,
          y: v0.y + (v1.y - v0.y) * easedT,
          z: (v0.z ?? 0) + ((v1.z ?? 0) - (v0.z ?? 0)) * easedT
        };
      }

      const prop = track.property || 'position';
      if (prop === 'rotationDegrees') {
        targetNode.setRotationDegrees(interpVal);
      } else if (prop === 'scale' && targetNode.scale && typeof interpVal === 'object') {
        targetNode.scale.set(interpVal.x, interpVal.y, interpVal.z);
        targetNode.updateMatrix();
        targetNode.updateMatrixWorld(true);
      } else {
        targetNode[prop] = interpVal;
      }
    }
  }

  _stepNodeInternal(dt) {
    super._stepNodeInternal(dt);
    if (!this.playing && this.autoplay && !this.current && this.clips[this.autoplay]) {
      this.play(this.autoplay);
    }
    if (!this.playing || !this.current || !this.clips[this.current]) return;

    const clip = this.clips[this.current];
    const prev = this._playhead;
    this._playhead += dt * this.speed;

    if (this._playhead >= clip.length) {
      this._sampleCurrentClip(clip.length, prev);
      if (clip.loop) {
        this._playhead = this._playhead % clip.length;
        this.emit('looped', clip.name);
      } else if (this._queue.length > 0) {
        const finishedName = clip.name;
        const nextName = this._queue.shift();
        this.emit('finished', finishedName);
        this.play(nextName);
      } else {
        this._playhead = clip.length;
        this.playing = false;
        this.emit('finished', clip.name);
      }
    } else {
      this._sampleCurrentClip(this._playhead, prev);
    }
  }

  serialize() {
    const base = super.serialize();
    const serializedClips = {};
    for (const [k, c] of Object.entries(this.clips)) {
      serializedClips[k] = c.serialize();
    }
    base.animationPlayer = {
      rootNode: this.rootNode,
      current: this.current,
      playing: this.playing,
      speed: this.speed,
      autoplay: this.autoplay,
      resetOnStop: this.resetOnStop,
      clips: serializedClips
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const ap = data.animationPlayer || data;
    if (ap.rootNode) this.rootNode = ap.rootNode;
    if (typeof ap.current === 'string') this.current = ap.current;
    if (typeof ap.playing === 'boolean') this.playing = ap.playing;
    if (typeof ap.speed === 'number') this.speed = ap.speed;
    if (typeof ap.autoplay === 'string') this.autoplay = ap.autoplay;
    if (typeof ap.resetOnStop === 'boolean') this.resetOnStop = ap.resetOnStop;
    if (ap.clips && typeof ap.clips === 'object') {
      this.clips = {};
      for (const [k, c] of Object.entries(ap.clips)) {
        this.addClip(new AnimationClip({ ...c, name: k }));
      }
    }
    if (this.autoplay && this.clips[this.autoplay] && this.playing) {
      this._playhead = 0;
    }
    return this;
  }
}

// ============================================================================
// 11. UI LAYER & CONTROLS (Seção 12)
// ============================================================================
export class UILayer extends Node {
  constructor(nameOrConfig = 'UILayer', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'UILayer') : nameOrConfig;
    super(name);
    this.nodeType = 'UILayer';
    this.layer = cfg.layer ?? 1;
    this.scaleMode = cfg.scaleMode || 'scaleWithScreen';
    this.referenceResolution = cfg.referenceResolution || { width: 1280, height: 720 };
    this.visible = cfg.visible ?? true;
  }

  serialize() {
    const base = super.serialize();
    base.uiLayer = {
      layer: this.layer,
      scaleMode: this.scaleMode,
      referenceResolution: { ...this.referenceResolution },
      visible: this.visible
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const u = data.uiLayer || data;
    if (typeof u.layer === 'number') this.layer = u.layer;
    if (u.scaleMode) this.scaleMode = u.scaleMode;
    if (u.referenceResolution) this.referenceResolution = { ...u.referenceResolution };
    if (typeof u.visible === 'boolean') this.visible = u.visible;
    return this;
  }
}

export class Control extends Node {
  constructor(nameOrConfig = 'Control', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    const name = isObj ? (cfg.name || 'Control') : nameOrConfig;
    super(name);
    this.nodeType = 'Control';
    this.anchor = cfg.anchor || 'topLeft';
    this.offset = cfg.offset || { x: 16, y: 16 };
    this.pivot = cfg.pivot || { x: 0, y: 0 };
    this.uiPosition = cfg.uiPosition || { x: cfg.x ?? 16, y: cfg.y ?? 16 };
    this.size = cfg.size || { width: cfg.width ?? 180, height: cfg.height ?? 40 };
    this.minSize = cfg.minSize || { width: 0, height: 0 };
    this.opacity = cfg.opacity ?? 1;
    this.clipContents = Boolean(cfg.clipContents ?? false);
    this.mouseFilter = cfg.mouseFilter || 'stop';
    this.focusable = Boolean(cfg.focusable ?? false);
    this.disabled = Boolean(cfg.disabled ?? false);
    this.tooltip = cfg.tooltip || '';
    this.theme = cfg.theme instanceof Theme ? cfg.theme : null;
    this.style = cfg.style || {};
    this._anchored3DTarget = cfg.anchored3DTarget || null;
    this._anchored3DOffset = cfg.anchored3DOffset || { x: 0, y: -32 };

    this.defineSignal('pointerEnter');
    this.defineSignal('pointerExit');
    this.defineSignal('pointerDown');
    this.defineSignal('pointerUp');
    this.defineSignal('clicked');
    this.defineSignal('focused');
    this.defineSignal('blurred');
  }

  anchorTo3D(no3DOuCaminho, deslocamentoTela = { x: 0, y: -32 }) {
    this._anchored3DTarget = typeof no3DOuCaminho === 'string' ? no3DOuCaminho : no3DOuCaminho?.name || null;
    this._anchored3DOffset = { x: deslocamentoTela.x ?? 0, y: deslocamentoTela.y ?? -32 };
    return this;
  }

  serialize() {
    const base = super.serialize();
    base.control = {
      anchor: this.anchor,
      offset: { ...this.offset },
      uiPosition: { ...this.uiPosition },
      size: { ...this.size },
      opacity: this.opacity,
      disabled: this.disabled,
      tooltip: this.tooltip,
      style: { ...this.style },
      anchored3DTarget: this._anchored3DTarget,
      anchored3DOffset: { ...this._anchored3DOffset }
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const c = data.control || data;
    if (c.anchor) this.anchor = c.anchor;
    if (c.offset) this.offset = { ...c.offset };
    if (c.uiPosition) this.uiPosition = { ...c.uiPosition };
    if (c.size) this.size = { ...c.size };
    if (typeof c.opacity === 'number') this.opacity = c.opacity;
    if (typeof c.disabled === 'boolean') this.disabled = c.disabled;
    if (typeof c.tooltip === 'string') this.tooltip = c.tooltip;
    if (c.style && typeof c.style === 'object') this.style = { ...c.style };
    if (c.anchored3DTarget !== undefined) this._anchored3DTarget = c.anchored3DTarget;
    if (c.anchored3DOffset) this._anchored3DOffset = { ...c.anchored3DOffset };
    return this;
  }
}

export class Panel extends Control {
  constructor(name = 'Panel', config = {}) {
    super(name, config);
    this.nodeType = 'Panel';
  }
}

export class Label extends Control {
  constructor(nameOrConfig = 'Label', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    super(nameOrConfig, cfg);
    this.nodeType = 'Label';
    this.text = cfg.text ?? 'Label';
    this.fontSize = cfg.fontSize ?? 14;
    this.color = cfg.color || '#f8fafc';
    this.align = cfg.align || 'left';
  }

  serialize() {
    const base = super.serialize();
    base.label = {
      text: this.text,
      fontSize: this.fontSize,
      color: this.color,
      align: this.align
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const l = data.label || data;
    if (typeof l.text === 'string') this.text = l.text;
    if (typeof l.fontSize === 'number') this.fontSize = l.fontSize;
    if (l.color) this.color = l.color;
    if (l.align) this.align = l.align;
    return this;
  }
}

export class Button extends Control {
  constructor(nameOrConfig = 'Button', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    super(nameOrConfig, cfg);
    this.nodeType = 'Button';
    this.text = cfg.text ?? 'Botão';
    this.actionId = cfg.actionId || '';
    this.defineSignal('pressed');
  }

  press() {
    if (this.disabled) return;
    this.emit('pressed');
    this.emit('clicked');
  }

  serialize() {
    const base = super.serialize();
    base.button = {
      text: this.text,
      actionId: this.actionId
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const b = data.button || data;
    if (typeof b.text === 'string') this.text = b.text;
    if (typeof b.actionId === 'string') this.actionId = b.actionId;
    return this;
  }
}

export class CheckBox extends Control {
  constructor(nameOrConfig = 'CheckBox', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    super(nameOrConfig, cfg);
    this.nodeType = 'CheckBox';
    this.checked = Boolean(cfg.checked ?? false);
    this.text = cfg.text || '';
    this.defineSignal('toggled');
  }

  toggle() {
    this.checked = !this.checked;
    this.emit('toggled', this.checked);
  }

  serialize() {
    const base = super.serialize();
    base.checkBox = { checked: this.checked, text: this.text };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const cb = data.checkBox || data;
    if (typeof cb.checked === 'boolean') this.checked = cb.checked;
    if (typeof cb.text === 'string') this.text = cb.text;
    return this;
  }
}

export class Slider extends Control {
  constructor(nameOrConfig = 'Slider', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    super(nameOrConfig, cfg);
    this.nodeType = 'Slider';
    this.min = cfg.min ?? 0;
    this.max = cfg.max ?? 100;
    this.step = cfg.step ?? 1;
    this.value = cfg.value ?? 50;
    this.defineSignal('changed');
  }

  setValue(v) {
    this.value = Math.max(this.min, Math.min(this.max, Number(v) || 0));
    this.emit('changed', this.value);
  }

  serialize() {
    const base = super.serialize();
    base.slider = { min: this.min, max: this.max, step: this.step, value: this.value };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const s = data.slider || data;
    if (typeof s.min === 'number') this.min = s.min;
    if (typeof s.max === 'number') this.max = s.max;
    if (typeof s.step === 'number') this.step = s.step;
    if (typeof s.value === 'number') this.value = s.value;
    return this;
  }
}

export class ProgressBar extends Control {
  constructor(nameOrConfig = 'ProgressBar', config = {}) {
    const isObj = typeof nameOrConfig === 'object' && nameOrConfig !== null;
    const cfg = isObj ? nameOrConfig : config;
    super(nameOrConfig, cfg);
    this.nodeType = 'ProgressBar';
    this.min = cfg.min ?? 0;
    this.max = cfg.max ?? 100;
    this.value = cfg.value ?? 100;
    this.showPercentage = cfg.showPercentage ?? true;
    this.fillColor = cfg.fillColor || '#10b981';
  }

  serialize() {
    const base = super.serialize();
    base.progressBar = {
      min: this.min,
      max: this.max,
      value: this.value,
      showPercentage: this.showPercentage,
      fillColor: this.fillColor
    };
    return base;
  }

  deserialize(data) {
    super.deserialize(data);
    const pb = data.progressBar || data;
    if (typeof pb.min === 'number') this.min = pb.min;
    if (typeof pb.max === 'number') this.max = pb.max;
    if (typeof pb.value === 'number') this.value = pb.value;
    if (typeof pb.showPercentage === 'boolean') this.showPercentage = pb.showPercentage;
    if (pb.fillColor) this.fillColor = pb.fillColor;
    return this;
  }
}

export class TextureRect extends Control {
  constructor(name = 'TextureRect', config = {}) {
    super(name, config);
    this.nodeType = 'TextureRect';
    this.texture = config.texture || '';
    this.stretchMode = config.stretchMode || 'keepAspect';
  }
}

export class TextInput extends Control {
  constructor(name = 'TextInput', config = {}) {
    super(name, config);
    this.nodeType = 'TextInput';
    this.value = config.value || '';
    this.placeholder = config.placeholder || '';
    this.maxLength = config.maxLength ?? 120;
    this.defineSignal('changed');
    this.defineSignal('submitted');
  }
}

export class HBox extends Control {
  constructor(name = 'HBox', config = {}) {
    super(name, config);
    this.nodeType = 'HBox';
    this.gap = config.gap ?? 8;
  }
}

export class VBox extends Control {
  constructor(name = 'VBox', config = {}) {
    super(name, config);
    this.nodeType = 'VBox';
    this.gap = config.gap ?? 8;
  }
}

export class Grid extends Control {
  constructor(name = 'Grid', config = {}) {
    super(name, config);
    this.nodeType = 'Grid';
    this.columns = config.columns ?? 2;
    this.gap = config.gap ?? 8;
  }
}

export class ScrollContainer extends Control {
  constructor(name = 'ScrollContainer', config = {}) {
    super(name, config);
    this.nodeType = 'ScrollContainer';
  }
}
