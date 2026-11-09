import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EngineNode } from './EngineNode.js';

/**
 * CollisionShape3DNode (alias CollisionShape3D) defines a geometric or 3D-model-based
 * collision shape ('Box', 'Sphere', 'Cylinder', or 'Trimesh' / MeshCollider).
 *
 * - Can be used standalone in the scene tree, as a child of a `Mesh3D` (where `'Trimesh'`
 *   automatically traces the exact 3D model geometry of its parent `Mesh3D`), or as a child
 *   of a `RigidBody3DNode` / node with a `Physics` script component.
 */
export class CollisionShape3DNode extends EngineNode {
  /**
   * @param {object} [options={}]
   * @param {string} [options.name='CollisionShape3D']
   * @param {'Box'|'Sphere'|'Cylinder'|'Trimesh'} [options.shapeType='Box']
   * @param {{ x: number, y: number, z: number }} [options.size={ x: 1, y: 1, z: 1 }]
   * @param {{ x: number, y: number, z: number }} [options.halfExtents]
   * @param {number} [options.radius=0.5]
   * @param {number} [options.height=1.2]
   * @param {string} [options.trimeshSourceShape='auto']
   */
  constructor(options = {}, extraOptions = {}) {
    const isString = typeof options === 'string';
    const opts = isString ? { name: options, ...(extraOptions || {}) } : options || {};
    const {
      name = 'CollisionShape3D',
      shapeType = 'Box',
      size = { x: 1, y: 1, z: 1 },
      halfExtents,
      radius = 0.5,
      height = 1.2,
      trimeshSourceShape = 'auto',
    } = opts;

    super(name);
    this.nodeType = 'CollisionShape3DNode';

    /** @type {'Box'|'Sphere'|'Cylinder'|'Trimesh'} */
    this.shapeType = this._normalizeShapeType(shapeType);

    /**
     * Full box dimensions { x, y, z }.
     * If `halfExtents` was explicitly passed, `dimensions` is 2 * halfExtents.
     * @type {{ x: number, y: number, z: number }}
     */
    if (halfExtents && typeof halfExtents.x === 'number') {
      this.dimensions = {
        x: Number(halfExtents.x) * 2,
        y: Number(halfExtents.y) * 2,
        z: Number(halfExtents.z) * 2,
      };
    } else {
      this.dimensions = {
        x: Number(size?.x ?? 1),
        y: Number(size?.y ?? 1),
        z: Number(size?.z ?? 1),
      };
    }

    /** @type {number} */
    this.radius = Number(radius ?? 0.5);

    /** @type {number} */
    this.height = Number(height ?? 1.2);

    /**
     * When shapeType === 'Trimesh', specifies which 3D model geometry to trace:
     * 'auto' (traces parent/sibling Mesh3D automatically) or a specific shape name
     * ('octahedron', 'icosahedron', 'torus', 'torusKnot', 'cone', 'cylinder', 'sphere', 'box').
     * @type {string}
     */
    this.trimeshSourceShape = trimeshSourceShape || 'auto';

    /** @type {CANNON.Shape|null} */
    this.cannonShape = this.createCannonShape();
  }

  /**
   * Normalizes shapeType string ('box' -> 'Box', 'sphere' -> 'Sphere', 'cylinder' -> 'Cylinder', 'trimesh'/'mesh' -> 'Trimesh').
   * @param {string} rawType
   * @returns {'Box'|'Sphere'|'Cylinder'|'Trimesh'}
   */
  _normalizeShapeType(rawType) {
    const normalized = String(rawType || 'Box').trim().toLowerCase();
    if (normalized === 'sphere') return 'Sphere';
    if (normalized === 'cylinder' || normalized === 'capsule') return 'Cylinder';
    if (normalized === 'trimesh' || normalized === 'mesh' || normalized === 'meshcollider' || normalized === 'convexhull') {
      return 'Trimesh';
    }
    if (normalized === 'box') return 'Box';
    throw new Error(
      `Unsupported CollisionShape3DNode shapeType: "${rawType}". Supported: "Box", "Sphere", "Cylinder", "Trimesh".`
    );
  }

  /**
   * Builds a THREE.BufferGeometry matching the target 3D model for `'Trimesh'` (Mesh Collider).
   * If attached to a `Mesh3D` parent (or sibling), clones the exact geometry of that 3D model.
   * @returns {THREE.BufferGeometry}
   */
  buildTrimeshThreeGeometry() {
    let sourceShape = this.trimeshSourceShape;
    let shapeParams = {};

    // Inspect parent or sibling Mesh3D if set to 'auto'
    if (!sourceShape || sourceShape === 'auto') {
      const parent = this.parent;
      if (parent && parent.nodeType === 'Mesh3D' && parent._meshObj?.geometry) {
        return parent._meshObj.geometry.clone();
      }
      if (parent && Array.isArray(parent.children)) {
        const siblingMesh = parent.children.find(
          (c) => c !== this && c.nodeType === 'Mesh3D' && c._meshObj?.geometry
        );
        if (siblingMesh && siblingMesh._meshObj?.geometry) {
          return siblingMesh._meshObj.geometry.clone();
        }
      }
      sourceShape = parent?.shape || 'octahedron';
      shapeParams = parent?.shapeParams || {};
    }

    const r = Math.max(0.1, this.radius || 0.65);
    switch (sourceShape) {
      case 'icosahedron':
        return new THREE.IcosahedronGeometry(shapeParams.radius ?? r, shapeParams.detail ?? 0);
      case 'torus':
        return new THREE.TorusGeometry(shapeParams.radius ?? r, shapeParams.tube ?? r * 0.3, 12, 24);
      case 'torusKnot':
        return new THREE.TorusKnotGeometry(shapeParams.radius ?? r * 0.8, shapeParams.tube ?? r * 0.25, 36, 8);
      case 'cone':
        return new THREE.ConeGeometry(shapeParams.radius ?? r, shapeParams.height ?? this.height, 16);
      case 'cylinder':
        return new THREE.CylinderGeometry(
          shapeParams.radiusTop ?? r,
          shapeParams.radiusBottom ?? r,
          shapeParams.height ?? this.height,
          16
        );
      case 'sphere':
        return new THREE.SphereGeometry(shapeParams.radius ?? r, 16, 12);
      case 'box':
        return new THREE.BoxGeometry(this.dimensions.x, this.dimensions.y, this.dimensions.z);
      case 'octahedron':
      default:
        return new THREE.OctahedronGeometry(shapeParams.radius ?? r, shapeParams.detail ?? 0);
    }
  }

  /**
   * Instantiates the corresponding CANNON.Shape (CANNON.Box, CANNON.Sphere, CANNON.Cylinder, or CANNON.Trimesh),
   * factoring in the node's local scale so scaled colliders match visual expectations.
   * @returns {CANNON.Shape}
   */
  createCannonShape() {
    const px = this.parent ? Math.abs(this.parent.scale?.x || 1) : 1;
    const py = this.parent ? Math.abs(this.parent.scale?.y || 1) : 1;
    const pz = this.parent ? Math.abs(this.parent.scale?.z || 1) : 1;

    const sx = Math.abs(this.scale.x || 1) * px;
    const sy = Math.abs(this.scale.y || 1) * py;
    const sz = Math.abs(this.scale.z || 1) * pz;

    if (this.shapeType === 'Sphere') {
      const maxScale = Math.max(sx, sy, sz);
      const effectiveRadius = Math.max(0.0001, this.radius * maxScale);
      this.cannonShape = new CANNON.Sphere(effectiveRadius);
      return this.cannonShape;
    }

    if (this.shapeType === 'Cylinder') {
      const radScale = Math.max(sx, sz);
      const r = Math.max(0.05, this.radius * radScale);
      const h = Math.max(0.05, this.height * sy);
      this.cannonShape = new CANNON.Cylinder(r, r, h, 16);
      return this.cannonShape;
    }

    if (this.shapeType === 'Trimesh') {
      const geom = this.buildTrimeshThreeGeometry();
      const posAttr = geom.attributes.position;
      if (posAttr && posAttr.count >= 3) {
        const vertices = [];
        for (let i = 0; i < posAttr.count; i++) {
          vertices.push(
            posAttr.getX(i) * sx,
            posAttr.getY(i) * sy,
            posAttr.getZ(i) * sz
          );
        }
        const indices = [];
        if (geom.index) {
          const idxArray = geom.index.array;
          for (let i = 0; i < idxArray.length; i++) {
            indices.push(idxArray[i]);
          }
        } else {
          for (let i = 0; i < posAttr.count; i++) {
            indices.push(i);
          }
        }
        geom.dispose();
        this.cannonShape = new CANNON.Trimesh(vertices, indices);
        return this.cannonShape;
      }
      geom.dispose();
    }

    // Default: CANNON.Box uses halfExtents (width/2, height/2, depth/2)
    const hx = Math.max(0.0001, (this.dimensions.x * sx) / 2);
    const hy = Math.max(0.0001, (this.dimensions.y * sy) / 2);
    const hz = Math.max(0.0001, (this.dimensions.z * sz) / 2);

    this.cannonShape = new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
    return this.cannonShape;
  }

  /**
   * Hook invoked when attached to a parent EngineNode.
   * If the parent is a RigidBody3DNode (has `rebuildShapesFromChildren`) or a Mesh3D,
   * updates the collision shape immediately.
   * @param {EngineNode} parent
   * @protected
   */
  _onAttachedToParent(parent) {
    if (this.shapeType === 'Trimesh') {
      this.createCannonShape();
    }
    if (parent && typeof parent.rebuildShapesFromChildren === 'function') {
      parent.rebuildShapesFromChildren();
    }
  }

  /**
   * Hook invoked when detached from a parent EngineNode.
   * Rebuilds the parent's shapes so the removed collider is no longer active on the body.
   * @param {EngineNode} parent
   * @protected
   */
  _onDetachedFromParent(parent) {
    if (parent && typeof parent.rebuildShapesFromChildren === 'function') {
      if (parent.body) {
        const idx = parent.body.shapes.indexOf(this.cannonShape);
        if (idx !== -1) {
          parent.body.shapes.splice(idx, 1);
          parent.body.shapeOffsets.splice(idx, 1);
          parent.body.shapeOrientations.splice(idx, 1);
          parent.body.updateMassProperties();
          parent.body.updateBoundingRadius();
        }
      }
    }
  }

  /**
   * Hook invoked when local position/rotation/scale of the CollisionShape3DNode changes.
   * Updates the shape offset and orientation inside the parent RigidBody3DNode.
   * @protected
   */
  _onTransformChanged() {
    if (this.parent && typeof this.parent.rebuildShapesFromChildren === 'function') {
      this.parent.rebuildShapesFromChildren();
    }
  }

  /**
   * Serializes the collider type, dimensions, radius/size, height, trimeshSourceShape, and relative transform.
   * @returns {Record<string, any>}
   */
  serialize() {
    const baseData = super.serialize();
    return {
      ...baseData,
      type: 'CollisionShape3DNode',
      shapeType: this.shapeType,
      dimensions: {
        x: this.dimensions.x,
        y: this.dimensions.y,
        z: this.dimensions.z,
      },
      halfExtents: {
        x: this.dimensions.x / 2,
        y: this.dimensions.y / 2,
        z: this.dimensions.z / 2,
      },
      radius: this.radius,
      height: this.height,
      trimeshSourceShape: this.trimeshSourceShape,
    };
  }

  /**
   * Reconstructs the CollisionShape3DNode state and updates its parent RigidBody3DNode if attached.
   * @param {Record<string, any>} data
   * @returns {this}
   */
  deserialize(data) {
    super.deserialize(data);

    if (data.shapeType) {
      this.shapeType = this._normalizeShapeType(data.shapeType);
    }

    if (data.dimensions && typeof data.dimensions.x === 'number') {
      this.dimensions = {
        x: Number(data.dimensions.x),
        y: Number(data.dimensions.y),
        z: Number(data.dimensions.z),
      };
    } else if (data.halfExtents && typeof data.halfExtents.x === 'number') {
      this.dimensions = {
        x: Number(data.halfExtents.x) * 2,
        y: Number(data.halfExtents.y) * 2,
        z: Number(data.halfExtents.z) * 2,
      };
    } else if (data.size && typeof data.size.x === 'number') {
      this.dimensions = {
        x: Number(data.size.x),
        y: Number(data.size.y),
        z: Number(data.size.z),
      };
    }

    if (typeof data.radius === 'number') {
      this.radius = data.radius;
    }
    if (typeof data.height === 'number') {
      this.height = data.height;
    }
    if (typeof data.trimeshSourceShape === 'string') {
      this.trimeshSourceShape = data.trimeshSourceShape;
    }

    this.createCannonShape();

    if (this.parent && typeof this.parent.rebuildShapesFromChildren === 'function') {
      this.parent.rebuildShapesFromChildren();
    }

    return this;
  }
}
