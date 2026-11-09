import * as CANNON from 'cannon-es';
import { EngineNode } from './EngineNode.js';

/**
 * CollisionShape3DNode defines a geometric collision shape (Box or Sphere)
 * without any visual representation.
 * When added as a child of a `RigidBody3DNode`, it injects its `CANNON.Shape`
 * with its local position and quaternion offset into the parent's `CANNON.Body`.
 */
export class CollisionShape3DNode extends EngineNode {
  /**
   * @param {object} [options={}]
   * @param {string} [options.name='CollisionShape3DNode']
   * @param {'Box'|'Sphere'} [options.shapeType='Box']
   * @param {{ x: number, y: number, z: number }} [options.size={ x: 1, y: 1, z: 1 }]
   * @param {{ x: number, y: number, z: number }} [options.halfExtents]
   * @param {number} [options.radius=0.5]
   */
  constructor(options = {}) {
    const {
      name = 'CollisionShape3DNode',
      shapeType = 'Box',
      size = { x: 1, y: 1, z: 1 },
      halfExtents,
      radius = 0.5,
    } = options;

    super(name);
    this.nodeType = 'CollisionShape3DNode';

    /** @type {'Box'|'Sphere'} */
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

    /** @type {CANNON.Shape|null} */
    this.cannonShape = this.createCannonShape();
  }

  /**
   * Normalizes shapeType string ('box'/'Box' -> 'Box', 'sphere'/'Sphere' -> 'Sphere').
   * @param {string} rawType
   * @returns {'Box'|'Sphere'}
   */
  _normalizeShapeType(rawType) {
    const normalized = String(rawType || 'Box').trim().toLowerCase();
    if (normalized === 'sphere') return 'Sphere';
    if (normalized === 'box') return 'Box';
    throw new Error(`Unsupported CollisionShape3DNode shapeType: "${rawType}". Supported: "Box", "Sphere".`);
  }

  /**
   * Instantiates the corresponding CANNON.Shape (CANNON.Box or CANNON.Sphere),
   * factoring in the node's local scale so scaled colliders match visual expectations.
   * @returns {CANNON.Box | CANNON.Sphere}
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

    // Default: CANNON.Box uses halfExtents (width/2, height/2, depth/2)
    const hx = Math.max(0.0001, (this.dimensions.x * sx) / 2);
    const hy = Math.max(0.0001, (this.dimensions.y * sy) / 2);
    const hz = Math.max(0.0001, (this.dimensions.z * sz) / 2);

    this.cannonShape = new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
    return this.cannonShape;
  }

  /**
   * Hook invoked when attached to a parent EngineNode.
   * If the parent is a RigidBody3DNode (has `rebuildShapesFromChildren`),
   * injects this shape into the parent's `CANNON.Body`.
   * @param {EngineNode} parent
   * @protected
   */
  _onAttachedToParent(parent) {
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
      // Temporarily filter out `this` since super.remove() runs right after _onDetachedFromParent
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
   * Serializes the collider type, dimensions, radius/size, and relative transform.
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

    this.createCannonShape();

    if (this.parent && typeof this.parent.rebuildShapesFromChildren === 'function') {
      this.parent.rebuildShapesFromChildren();
    }

    return this;
  }
}
