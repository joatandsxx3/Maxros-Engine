import * as CANNON from 'cannon-es';

/**
 * Global Physics Server responsible for managing the CANNON.World instance,
 * stepping the simulation (with configurable timeScale), preventing duplicate
 * body registrations, and synchronizing physical states with visual EngineNodes.
 */
export class PhysicsServer {
  /** @type {PhysicsServer|null} */
  static _instance = null;

  /**
   * Retrieves the singleton instance of the PhysicsServer.
   * @returns {PhysicsServer}
   */
  static getInstance() {
    if (!PhysicsServer._instance) {
      PhysicsServer._instance = new PhysicsServer();
    }
    return PhysicsServer._instance;
  }

  /**
   * @param {object} [options={}]
   * @param {{ x: number, y: number, z: number }} [options.gravity={ x: 0, y: -9.82, z: 0 }]
   * @param {number} [options.fixedTimeStep=1/60]
   * @param {number} [options.maxSubSteps=10]
   */
  constructor(options = {}) {
    const {
      gravity = { x: 0, y: -9.82, z: 0 },
      fixedTimeStep = 1 / 60,
      maxSubSteps = 10,
    } = options;

    /** @type {CANNON.World} */
    this.world = new CANNON.World();
    this.world.gravity.set(gravity.x, gravity.y, gravity.z);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.allowSleep = true;

    /** @type {number} */
    this.fixedTimeStep = fixedTimeStep;
    /** @type {number} */
    this.maxSubSteps = maxSubSteps;
    /** @type {number} Simulation speed multiplier (e.g., 0.25x, 1x, 2x) */
    this.timeScale = 1.0;

    /**
     * Maps EngineNode UUID -> RigidBody3DNode instance.
     * Guarantees 1-to-1 registration and prevents duplicate bodies on scene reload.
     * @type {Map<string, import('../nodes/RigidBody3DNode.js').RigidBody3DNode>}
     */
    this._registeredNodesByUuid = new Map();

    /**
     * Tracks registered CANNON.Body instances for O(1) duplicate checks.
     * @type {Set<CANNON.Body>}
     */
    this._registeredBodies = new Set();
  }

  /**
   * Sets the simulation speed multiplier (0.25, 0.5, 1, 2).
   * @param {number} scale
   */
  setTimeScale(scale) {
    this.timeScale = Math.max(0.05, Math.min(4.0, Number(scale) || 1.0));
  }

  /**
   * Sets the global gravity vector of the physics world.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setGravity(x, y, z) {
    this.world.gravity.set(x, y, z);
  }

  /**
   * Registers a RigidBody3DNode and its internal CANNON.Body into the physics world.
   * Strictly prevents duplicate registrations.
   *
   * @param {import('../nodes/RigidBody3DNode.js').RigidBody3DNode} rigidBodyNode
   * @returns {boolean}
   */
  registerBody(rigidBodyNode) {
    if (!rigidBodyNode || !rigidBodyNode.body) {
      throw new Error('PhysicsServer.registerBody requires a valid RigidBody3DNode with a CANNON.Body');
    }

    const existingNode = this._registeredNodesByUuid.get(rigidBodyNode.uuid);
    if (existingNode) {
      if (existingNode === rigidBodyNode && this._registeredBodies.has(rigidBodyNode.body)) {
        return false;
      }
      this.unregisterBody(existingNode);
    }

    if (!this._registeredBodies.has(rigidBodyNode.body)) {
      this.world.addBody(rigidBodyNode.body);
      this._registeredBodies.add(rigidBodyNode.body);
    }

    this._registeredNodesByUuid.set(rigidBodyNode.uuid, rigidBodyNode);
    return true;
  }

  /**
   * Unregisters a RigidBody3DNode (or UUID) and removes its CANNON.Body from the world.
   * @param {import('../nodes/RigidBody3DNode.js').RigidBody3DNode | string} nodeOrUuid
   * @returns {boolean}
   */
  unregisterBody(nodeOrUuid) {
    const uuid = typeof nodeOrUuid === 'string' ? nodeOrUuid : nodeOrUuid?.uuid;
    if (!uuid) return false;

    const registeredNode = this._registeredNodesByUuid.get(uuid);
    if (!registeredNode) {
      if (
        typeof nodeOrUuid === 'object' &&
        nodeOrUuid.body &&
        this._registeredBodies.has(nodeOrUuid.body)
      ) {
        this.world.removeBody(nodeOrUuid.body);
        this._registeredBodies.delete(nodeOrUuid.body);
        return true;
      }
      return false;
    }

    if (registeredNode.body && this._registeredBodies.has(registeredNode.body)) {
      this.world.removeBody(registeredNode.body);
      this._registeredBodies.delete(registeredNode.body);
    }

    this._registeredNodesByUuid.delete(uuid);
    return true;
  }

  /**
   * Updates the UUID mapping when a node's UUID changes during `deserialize(data)`.
   * @param {string} oldUuid
   * @param {import('../nodes/RigidBody3DNode.js').RigidBody3DNode} rigidBodyNode
   */
  rebindNodeUuid(oldUuid, rigidBodyNode) {
    if (oldUuid !== rigidBodyNode.uuid) {
      this._registeredNodesByUuid.delete(oldUuid);
    }
    const existingWithTargetUuid = this._registeredNodesByUuid.get(rigidBodyNode.uuid);
    if (existingWithTargetUuid && existingWithTargetUuid !== rigidBodyNode) {
      this.unregisterBody(existingWithTargetUuid);
    }
    this.registerBody(rigidBodyNode);
  }

  /**
   * Checks if a node or UUID is registered in the PhysicsServer.
   * @param {import('../nodes/RigidBody3DNode.js').RigidBody3DNode | string} nodeOrUuid
   * @returns {boolean}
   */
  hasBody(nodeOrUuid) {
    const uuid = typeof nodeOrUuid === 'string' ? nodeOrUuid : nodeOrUuid?.uuid;
    return Boolean(uuid && this._registeredNodesByUuid.has(uuid));
  }

  /**
   * Returns the count of active registered physics bodies.
   * @returns {number}
   */
  getBodyCount() {
    return this.world.bodies.length;
  }

  /**
   * Advances the physics simulation (scaled by `this.timeScale`) and synchronizes all visual nodes.
   * @param {number} [deltaTime=1/60]
   */
  step(deltaTime = this.fixedTimeStep) {
    const scaledDelta = deltaTime * this.timeScale;

    // 1. Ensure kinematic bodies or dirty transforms are pushed to cannon-es before stepping
    for (const node of this._registeredNodesByUuid.values()) {
      if (node.bodyType === 'kinematic' || node._transformDirty) {
        node.syncTransformToBody();
      }
    }

    // 2. Step the CANNON.World simulation
    const effectiveFixedStep = this.fixedTimeStep * Math.min(1, this.timeScale);
    if (Math.abs(scaledDelta - effectiveFixedStep) < 1e-6) {
      this.world.step(effectiveFixedStep);
    } else {
      this.world.step(effectiveFixedStep, scaledDelta, this.maxSubSteps);
    }

    // 3. Synchronize physical coordinates back to Three.js visual nodes
    this.syncVisuals();
  }

  /**
   * Synchronizes all registered RigidBody3DNodes with their internal CANNON.Body transforms.
   */
  syncVisuals() {
    for (const node of this._registeredNodesByUuid.values()) {
      node.syncBodyToTransform();
    }
  }

  /**
   * Removes all bodies and cleanly flushes narrowphase/solver contact state
   * so mid-collision resets with many bodies never leave ghost contacts.
   */
  clear() {
    const bodies = [...this.world.bodies];
    for (const body of bodies) {
      body.velocity.setZero();
      body.angularVelocity.setZero();
      body.force.setZero();
      body.torque.setZero();
      this.world.removeBody(body);
    }
    this.world.contacts.length = 0;
    if (this.world.frictionEquations) {
      this.world.frictionEquations.length = 0;
    }
    if (this.world.solver && Array.isArray(this.world.solver.equations)) {
      this.world.solver.equations.length = 0;
    }
    this._registeredNodesByUuid.clear();
    this._registeredBodies.clear();
  }
}

export const physicsServer = PhysicsServer.getInstance();
