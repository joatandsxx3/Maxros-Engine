import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EngineNode } from './EngineNode.js';
import { PhysicsServer } from './PhysicsServer.js';
import { CollisionShape3DNode } from './CollisionShape3DNode.js';

const _identityMatrix = new THREE.Matrix4();
const _invParentMatrix = new THREE.Matrix4();
const _parentWorldQuat = new THREE.Quaternion();
const _tempPos = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();

/**
 * Maps human-readable body type strings to CANNON.Body numeric types.
 */
export const BODY_TYPES = Object.freeze({
  dynamic: CANNON.Body.DYNAMIC,
  kinematic: CANNON.Body.KINEMATIC,
  static: CANNON.Body.STATIC,
});

/**
 * RigidBody3DNode bridges Three.js scene graph transforms and a CANNON.Body instance.
 *
 * Architectural resolution for Hierarchy vs. Physics World Space:
 * - `CANNON.Body` always lives in absolute World Space.
 * - When `RigidBody3DNode` has no parent (or its parent has an identity world matrix),
 *   local space equals world space, so:
 *     `this.position.copy(cannonBody.position);`
 *     `this.quaternion.copy(cannonBody.quaternion);`
 *   executes directly.
 * - When `RigidBody3DNode` is nested inside a transformed parent `EngineNode`,
 *   `syncBodyToTransform()` automatically converts `cannonBody.position` and
 *   `cannonBody.quaternion` into local coordinates relative to `this.parent.matrixWorld`,
 *   preventing double-transformation artifacts.
 */
export class RigidBody3DNode extends EngineNode {
  /**
   * @param {object} [options={}]
   * @param {string} [options.name='RigidBody3DNode']
   * @param {number} [options.mass=1]
   * @param {'dynamic'|'kinematic'|'static'} [options.bodyType='dynamic']
   * @param {number} [options.linearDamping=0.01]
   * @param {number} [options.angularDamping=0.01]
   * @param {boolean} [options.fixedRotation=false]
   * @param {boolean} [options.allowSleep=true]
   * @param {PhysicsServer} [options.physicsServer]
   * @param {boolean} [options.autoRegister=true]
   */
  constructor(options = {}) {
    const {
      name = 'RigidBody3DNode',
      mass = 1,
      bodyType = 'dynamic',
      linearDamping = 0.01,
      angularDamping = 0.01,
      fixedRotation = false,
      allowSleep = true,
      physicsServer = PhysicsServer.getInstance(),
      autoRegister = true,
    } = options;

    super(name);
    this.nodeType = 'RigidBody3DNode';

    /** @type {PhysicsServer} */
    this.physicsServer = physicsServer;

    /** @type {'dynamic'|'kinematic'|'static'} */
    this.bodyType = bodyType in BODY_TYPES ? bodyType : mass === 0 ? 'static' : 'dynamic';

    /** @type {number} */
    this.mass = this.bodyType === 'static' || this.bodyType === 'kinematic' ? 0 : Number(mass);

    /** @type {boolean} */
    this._isSyncingFromPhysics = false;
    /** @type {boolean} */
    this._transformDirty = true;

    /** @type {CANNON.Body} */
    this.body = new CANNON.Body({
      mass: this.mass,
      type: BODY_TYPES[this.bodyType],
      linearDamping: Number(linearDamping),
      angularDamping: Number(angularDamping),
      fixedRotation: Boolean(fixedRotation),
      allowSleep: Boolean(allowSleep),
    });

    if (autoRegister && this.physicsServer) {
      this.physicsServer.registerBody(this);
    }
  }

  /**
   * Sets the body type ('dynamic', 'kinematic', 'static') and updates mass properties.
   * @param {'dynamic'|'kinematic'|'static'} type
   * @param {number} [newMass]
   */
  setBodyType(type, newMass) {
    if (!(type in BODY_TYPES)) {
      throw new Error(`Unsupported RigidBody3DNode bodyType: "${type}"`);
    }
    this.bodyType = type;
    if (newMass !== undefined) {
      this.mass = Number(newMass);
    }
    this.body.type = BODY_TYPES[type];
    this.body.mass = type === 'dynamic' ? this.mass : 0;
    this.body.updateMassProperties();
    this.body.wakeUp();
  }

  /**
   * Triggered when `position` or `position_global` or `deserialize` modifies the node's transform.
   * Pushes the visual world transform to the CANNON.Body.
   */
  _onTransformChanged() {
    if (!this._isSyncingFromPhysics && this.body) {
      this._transformDirty = true;
      this.syncTransformToBody();
      if (this.children.length > 0) {
        this.rebuildShapesFromChildren();
      }
    }
  }

  /**
   * When attached to a new parent node, updates the CANNON.Body world transform
   * to reflect the inherited parent transformation.
   * @param {EngineNode} _parent
   */
  _onAttachedToParent(_parent) {
    this.syncTransformToBody();
  }

  /**
   * Copies this node's global Three.js transform into the CANNON.Body.
   */
  syncTransformToBody() {
    if (!this.body) return;

    const worldPos = this.position_global;
    const worldQuat = this.quaternion_global;

    this.body.position.set(worldPos.x, worldPos.y, worldPos.z);
    this.body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
    this._transformDirty = false;
  }

  /**
   * Synchronizes the CANNON.Body world transform back to this Three.js visual node.
   * Implements the direct copy required by the specification when at root/identity parent,
   * and compensates for parent world matrices when nested inside a transformed parent hierarchy.
   */
  syncBodyToTransform() {
    if (!this.body) return;

    this._isSyncingFromPhysics = true;
    const cannonBody = this.body;

    const hasTransformedParent =
      this.parent &&
      (this.parent.updateWorldMatrix(true, false), !this.parent.matrixWorld.equals(_identityMatrix));

    if (!hasTransformedParent) {
      // Direct copy as specified for root-level or identity-parented rigid bodies
      this.position.copy(cannonBody.position);
      this.quaternion.copy(cannonBody.quaternion);
    } else {
      // Convert CANNON world space into Three.js local space relative to parent
      _invParentMatrix.copy(this.parent.matrixWorld).invert();
      _tempPos.set(cannonBody.position.x, cannonBody.position.y, cannonBody.position.z);
      _tempPos.applyMatrix4(_invParentMatrix);
      this.position.copy(_tempPos);

      this.parent.getWorldQuaternion(_parentWorldQuat);
      _parentWorldQuat.invert();
      _tempQuat.set(
        cannonBody.quaternion.x,
        cannonBody.quaternion.y,
        cannonBody.quaternion.z,
        cannonBody.quaternion.w
      );
      _tempQuat.premultiply(_parentWorldQuat);
      this.quaternion.copy(_tempQuat);
    }

    this.updateMatrixWorld(true);
    this._isSyncingFromPhysics = false;
    this._transformDirty = false;
  }

  /**
   * Rebuilds all shapes on the internal CANNON.Body from child CollisionShape3DNodes.
   * Prevents shape duplication and ensures offsets/orientations are accurate.
   */
  rebuildShapesFromChildren() {
    if (!this.body) return;

    // Clear existing shapes on the CANNON.Body
    this.body.shapes.length = 0;
    this.body.shapeOffsets.length = 0;
    this.body.shapeOrientations.length = 0;

    for (const child of this.children) {
      if (child instanceof CollisionShape3DNode) {
        const shape = child.createCannonShape();
        const offset = new CANNON.Vec3(child.position.x, child.position.y, child.position.z);
        const orientation = new CANNON.Quaternion(
          child.quaternion.x,
          child.quaternion.y,
          child.quaternion.z,
          child.quaternion.w
        );
        this.body.addShape(shape, offset, orientation);
      }
    }

    this.body.updateMassProperties();
    this.body.updateBoundingRadius();
    this.body.aabbNeedsUpdate = true;
  }

  /**
   * Per-frame update: synchronizes physical transformations with the visual object
   * and updates child EngineNodes.
   * @param {number} [delta=1/60]
   */
  update(delta = 1 / 60) {
    this.syncBodyToTransform();
    super.update(delta);
  }

  /**
   * Removes the body from the PhysicsServer when disposed/destroyed.
   */
  destroy() {
    if (this.physicsServer) {
      this.physicsServer.unregisterBody(this);
    }
  }

  /**
   * Serializes the RigidBody3DNode including mass, bodyType, damping, velocities, and children.
   * @returns {Record<string, any>}
   */
  serialize() {
    const baseData = super.serialize();
    return {
      ...baseData,
      type: 'RigidBody3DNode',
      mass: this.mass,
      bodyType: this.bodyType,
      linearDamping: this.body.linearDamping,
      angularDamping: this.body.angularDamping,
      fixedRotation: this.body.fixedRotation,
      allowSleep: this.body.allowSleep,
      linearVelocity: {
        x: this.body.velocity.x,
        y: this.body.velocity.y,
        z: this.body.velocity.z,
      },
      angularVelocity: {
        x: this.body.angularVelocity.x,
        y: this.body.angularVelocity.y,
        z: this.body.angularVelocity.z,
      },
    };
  }

  /**
   * Restores the RigidBody3DNode state and updates its registration in the PhysicsServer.
   * @param {Record<string, any>} data
   * @returns {this}
   */
  deserialize(data) {
    const previousUuid = this.uuid;
    super.deserialize(data);

    const parsedMass = typeof data.mass === 'number' ? data.mass : 1;
    const parsedType =
      typeof data.bodyType === 'string' && data.bodyType in BODY_TYPES
        ? data.bodyType
        : parsedMass === 0
        ? 'static'
        : 'dynamic';

    this.mass = parsedMass;
    this.setBodyType(parsedType, parsedMass);

    if (typeof data.linearDamping === 'number') {
      this.body.linearDamping = data.linearDamping;
    }
    if (typeof data.angularDamping === 'number') {
      this.body.angularDamping = data.angularDamping;
    }
    if (typeof data.fixedRotation === 'boolean') {
      this.body.fixedRotation = data.fixedRotation;
      this.body.updateMassProperties();
    }
    if (typeof data.allowSleep === 'boolean') {
      this.body.allowSleep = data.allowSleep;
    }
    if (data.linearVelocity) {
      this.body.velocity.set(
        Number(data.linearVelocity.x ?? 0),
        Number(data.linearVelocity.y ?? 0),
        Number(data.linearVelocity.z ?? 0)
      );
    }
    if (data.angularVelocity) {
      this.body.angularVelocity.set(
        Number(data.angularVelocity.x ?? 0),
        Number(data.angularVelocity.y ?? 0),
        Number(data.angularVelocity.z ?? 0)
      );
    }

    this.syncTransformToBody();

    if (this.physicsServer) {
      this.physicsServer.rebindNodeUuid(previousUuid, this);
    }

    return this;
  }
}
