import * as THREE from 'three';
import { Signal, Tween, Shake, Input, Save, Audio, Log, Rng, StateMachine, Easing } from '../core/NativeClasses.js';

const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();
const _worldScale = new THREE.Vector3();
const _invParentMatrix = new THREE.Matrix4();
const _localPos = new THREE.Vector3();

/**
 * Default scene environment configuration.
 * Mode is currently fixed to `'solid_color'` with a neutral dark slate-blue background (`#1e2430`)
 * and a reserved `skybox` slot (`null`) for future expansion.
 */
export const DEFAULT_SCENE_ENVIRONMENT = Object.freeze({
  mode: 'solid_color',
  color: '#1e2430',
  skybox: null,
});

/**
 * Normalizes an arbitrary environment object into a valid scene environment structure.
 * @param {any} [rawEnv]
 * @returns {{ mode: 'solid_color', color: string, skybox: string | null }}
 */
export function normalizeSceneEnvironment(rawEnv) {
  if (!rawEnv || typeof rawEnv !== 'object') {
    return { ...DEFAULT_SCENE_ENVIRONMENT };
  }
  const rawColor =
    typeof rawEnv.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawEnv.color.trim())
      ? rawEnv.color.trim().toLowerCase()
      : DEFAULT_SCENE_ENVIRONMENT.color;

  return {
    mode: 'solid_color',
    color: rawColor,
    skybox: rawEnv.skybox ?? null,
  };
}

/**
 * Maxros Engine - EngineNode / Node / Node3D
 * Base de todos os nós da árvore de cenas, combinando:
 * - Compatibilidade integral com THREE.Object3D, PhysicsServer, RigidBody3DNode e testes existentes
 * - API completa de Node (Seção 3) e Node3D (Seção 7): sinais, grupos, caminhos, scripts, tweens e ciclo de vida
 */
export class EngineNode extends THREE.Object3D {
  /**
   * @param {string | Record<string, any>} [nameOrOptions='EngineNode']
   */
  constructor(nameOrOptions = 'EngineNode') {
    super();

    const resolvedName =
      typeof nameOrOptions === 'object' && nameOrOptions !== null
        ? nameOrOptions.name || 'EngineNode'
        : String(nameOrOptions ?? 'EngineNode');

    const ownPosDesc = Object.getOwnPropertyDescriptor(this, 'position');
    this._rawPosition = (ownPosDesc && ownPosDesc.value instanceof THREE.Vector3)
      ? ownPosDesc.value
      : new THREE.Vector3();
    this._name = resolvedName;
    this.nodeType = 'EngineNode';
    this.isEngineNode = true;

    // Visibilidade e bloqueio no editor
    this.editorVisible = true;
    this.editorLocked = false;

    // Componentes modulares, Scripts e Referências por UUID da Maxros Engine
    this.components = [];
    this.scripts = [];
    /** @type {{ uuid: string, path?: string, className?: string, extendsType?: string } | null} */
    this.scriptRef = null;
    /** @type {{ uuid: string } | null} */
    this.materialRef = null;
    /** @type {{ uuid: string } | null} */
    this.textureRef = null;
    /**
     * Metadata when this Node is an instance of a Child Scene (.scene.json)
     * @type {{ sourceSceneUuid: string, sourceScenePath: string, localOverrides: Record<string, any> } | null}
     */
    this.sceneInstance = null;

    this._scriptTime = 0;
    this._scriptBasePosition = null;
    this._scriptBaseScale = null;
    this._thrusterAccum = 0;

    // ==========================================================================
    // CICLO DE VIDA NATIVO E ESTADOS DO NODE (Seções 6, 7 e 8)
    // ==========================================================================
    /** @type {'active' | 'inactive' | 'paused' | 'destroyed'} */
    this.nodeState = 'active';
    this._startCalled = false;
    this._onDestroyCalled = false;
    this._sceneLifecycleStarted = false;
    this._inFrameStep = false;
    this._hasExtendedScriptClass = false;
    this._extendedClassName = null;
    this._extendedScriptFile = null;
    this._scriptDiagnostic = null;
    this._scriptInstanceFaulted = false;
    this._lastRuntimeError = null;

    // ==========================================================================
    // FÍSICA UNIFICADA DIRETA NO NODE (Substitui o antigo PhysicsScript)
    // ==========================================================================
    /** @type {'none' | 'dynamic' | 'static' | 'kinematic'} */
    this._physicsMode = 'none';
    this.useGravity = true;
    this.gravityY = -9.82;
    this.gravityScale = 1.0;
    this.mass = 1.0;
    this.restitution = 0.35;
    this.friction = 0.3;
    this.linearDamping = 0.02;
    this.angularDamping = 0.01;
    this.fixedRotation = false;
    this.floorY = 0.5;
    this.useFloorContact = true;

    this.velocity = new THREE.Vector3(0, 0, 0);
    this.angularVelocity = new THREE.Vector3(0, 0, 0);
    this.acceleration = new THREE.Vector3(0, 0, 0);
    this._queuedForce = new THREE.Vector3(0, 0, 0);
    this._queuedImpulse = new THREE.Vector3(0, 0, 0);
    this._queuedTorque = new THREE.Vector3(0, 0, 0);
    this._onFloorState = false;
    this._activeContacts = [];
    this._previousCollidingUuids = new Set();
    this._cannonSteppedInCurrentTick = false;

    // Preserva atributos de nós desconhecidos na desserialização/serialização
    this.unknownAttributes = {};

    // Ambiente da cena
    this.environment = { ...DEFAULT_SCENE_ENVIRONMENT };

    // Atributos de Node (Seção 3)
    this.uniqueName = false;
    this.tree = null;
    this.owner = null;
    this.groups = [];
    this.processMode = 'inherit'; // 'inherit' | 'pausable' | 'whenPaused' | 'always' | 'disabled'
    this.processPriority = 0;
    this.tickRate = 0;
    this._tickAccumulator = 0;
    this.runInEditor = false;
    this.isInsideTree = false;
    this.isReady = false;
    this.isDestroyed = false;
    this.meta = {};
    this._intervals = [];

    // Sinais embutidos (Seção 3.6 + 7 + Colisões Físicas)
    this._signals = new Map();
    const builtInSignals = [
      'ready',
      'enteredTree',
      'exitingTree',
      'childAdded',
      'childRemoved',
      'renamed',
      'destroyed',
      'transformChanged',
      'visibilityChanged',
      'collided',
      'bodyEntered',
      'bodyExited',
    ];
    for (const sig of builtInSignals) {
      this._signals.set(sig, new Signal(sig));
    }

    Object.defineProperty(this, 'position', {
      get() {
        return this._rawPosition;
      },
      set(val) {
        this._setPositionInternal(val);
      },
      enumerable: true,
      configurable: true,
    });
  }

  notifySubtreeTransformChanged() {
    this.updateMatrix();
    this.updateMatrixWorld(true);
    this._onTransformChanged();
    for (const child of this.children) {
      if (child instanceof EngineNode && typeof child.notifySubtreeTransformChanged === 'function') {
        child.notifySubtreeTransformChanged();
      }
    }
  }

  get name() {
    return this._name;
  }

  set name(novoNome) {
    const antigo = this._name;
    this._name = String(novoNome ?? '');
    if (antigo !== undefined && antigo !== this._name && this._signals) {
      this.emit('renamed', antigo, this._name);
    }
  }

  get type() {
    return this.nodeType;
  }

  set type(val) {
    this.nodeType = val;
  }

  setEnvironment(env) {
    this.environment = normalizeSceneEnvironment({
      ...this.environment,
      ...(env || {}),
    });
    return this;
  }

  // ============================================================================
  // TRANSFORMAÇÃO LOCAL E GLOBAL (Seção 7 + Compatibilidade)
  // ============================================================================
  /**
   * @returns {any}
   */
  get position() {
    return this._rawPosition;
  }

  /**
   * @param {THREE.Vector3 | { x: number, y: number, z: number } | any} value
   */
  set position(value) {
    this._setPositionInternal(value);
  }

  _setPositionInternal(value) {
    if (!value || typeof value !== 'object') {
      throw new TypeError('EngineNode.position expects an object or THREE.Vector3 with { x, y, z }.');
    }

    const x = Number(value.x ?? 0);
    const y = Number(value.y ?? 0);
    const z = Number(value.z ?? 0);

    this._rawPosition.set(x, y, z);
    this.updateMatrix();
    this.updateMatrixWorld(true);
    this._onTransformChanged();
    if (this._signals) this.emit('transformChanged');
  }

  get localPosition() {
    return this._rawPosition;
  }

  /**
   * @returns {any}
   */
  get position_global() {
    this.updateWorldMatrix(true, false);
    this.getWorldPosition(_worldPos);
    return _worldPos.clone();
  }

  /**
   * @param {THREE.Vector3 | { x: number, y: number, z: number } | any} worldVec
   */
  set position_global(worldVec) {
    if (!worldVec || typeof worldVec !== 'object') {
      throw new TypeError('EngineNode.position_global expects an object or THREE.Vector3 with { x, y, z }.');
    }

    const wx = Number(worldVec.x ?? 0);
    const wy = Number(worldVec.y ?? 0);
    const wz = Number(worldVec.z ?? 0);

    if (this.parent) {
      this.parent.updateWorldMatrix(true, false);
      _invParentMatrix.copy(this.parent.matrixWorld).invert();
      _localPos.set(wx, wy, wz).applyMatrix4(_invParentMatrix);
      this._rawPosition.copy(_localPos);
    } else {
      this._rawPosition.set(wx, wy, wz);
    }

    this.updateMatrix();
    this.updateMatrixWorld(true);
    this._onTransformChanged();
    if (this._signals) this.emit('transformChanged');
  }

  /**
   * @returns {any}
   */
  get globalPosition() {
    return this.position_global;
  }

  /**
   * @param {THREE.Vector3 | { x: number, y: number, z: number } | any} val
   */
  set globalPosition(val) {
    this.position_global = val;
  }

  setGlobalPosition(val) {
    this.position_global = val;
  }

  get quaternion_global() {
    this.updateWorldMatrix(true, false);
    this.getWorldQuaternion(_worldQuat);
    return _worldQuat.clone();
  }

  set quaternion_global(qVal) {
    const targetQ = new THREE.Quaternion(qVal.x ?? 0, qVal.y ?? 0, qVal.z ?? 0, qVal.w ?? 1);
    if (this.parent && this.parent instanceof EngineNode) {
      const parentQ = this.parent.quaternion_global;
      this.quaternion.copy(parentQ.clone().invert().multiply(targetQ));
    } else {
      this.quaternion.copy(targetQ);
    }
    this.updateMatrix();
    this.updateMatrixWorld(true);
    this._onTransformChanged();
    if (this._signals) this.emit('transformChanged');
  }

  get globalQuaternion() {
    return this.quaternion_global;
  }

  set globalQuaternion(qVal) {
    this.quaternion_global = qVal;
  }

  get scale_global() {
    this.updateWorldMatrix(true, false);
    this.getWorldScale(_worldScale);
    return _worldScale.clone();
  }

  getRotationDegrees() {
    const radToDeg = 180 / Math.PI;
    return {
      x: Number((this.rotation.x * radToDeg).toFixed(2)),
      y: Number((this.rotation.y * radToDeg).toFixed(2)),
      z: Number((this.rotation.z * radToDeg).toFixed(2))
    };
  }

  setRotationDegrees(deg) {
    const degToRad = Math.PI / 180;
    if (typeof deg.x === 'number') this.rotation.x = deg.x * degToRad;
    if (typeof deg.y === 'number') this.rotation.y = deg.y * degToRad;
    if (typeof deg.z === 'number') this.rotation.z = deg.z * degToRad;
    this.updateMatrix();
    this.updateMatrixWorld(true);
    this._onTransformChanged();
    if (this._signals) this.emit('transformChanged');
  }

  translate(vetor, espaco = 'local') {
    const delta = new THREE.Vector3(vetor.x ?? 0, vetor.y ?? 0, vetor.z ?? 0);
    if (espaco === 'global') {
      const gp = this.position_global;
      this.position_global = { x: gp.x + delta.x, y: gp.y + delta.y, z: gp.z + delta.z };
    } else {
      delta.applyQuaternion(this.quaternion);
      this._rawPosition.add(delta);
      this.updateMatrix();
      this.updateMatrixWorld(true);
      this._onTransformChanged();
      this.emit('transformChanged');
    }
  }

  rotate(eixo, anguloEmGraus, espaco = 'local') {
    const axisVec = new THREE.Vector3(eixo.x ?? 0, eixo.y ?? 1, eixo.z ?? 0).normalize();
    const rad = (Number(anguloEmGraus) || 0) * (Math.PI / 180);
    if (espaco === 'global') {
      this.rotateOnWorldAxis(axisVec, rad);
    } else {
      this.rotateOnAxis(axisVec, rad);
    }
    this.updateMatrix();
    this.updateMatrixWorld(true);
    this._onTransformChanged();
    this.emit('transformChanged');
  }

  toGlobal(pontoLocal) {
    this.updateWorldMatrix(true, false);
    const v = new THREE.Vector3(pontoLocal.x ?? 0, pontoLocal.y ?? 0, pontoLocal.z ?? 0);
    return this.localToWorld(v);
  }

  toLocal(pontoGlobal) {
    this.updateWorldMatrix(true, false);
    const v = new THREE.Vector3(pontoGlobal.x ?? 0, pontoGlobal.y ?? 0, pontoGlobal.z ?? 0);
    return this.worldToLocal(v);
  }

  shake(config = {}) {
    return Shake.play(this, config);
  }

  _onTransformChanged() {
    // Subclasses override as needed
  }

  // ============================================================================
  // HIERARQUIA E BUSCA DE NÓS (Seção 3.1 e 3.2)
  // ============================================================================
  add(...objects) {
    for (const obj of objects) {
      if (obj === this || (obj && typeof obj.isAncestorOf === 'function' && obj.isAncestorOf(this))) {
        Log.error('E102', `Tentativa de ciclo: "${obj?.name}" adicionado em "${this.name}".`);
        continue;
      }
      if (obj && obj.uniqueName) {
        const root = this.getRootNode();
        const dup = root._findUniqueInSubtree(obj.name, obj);
        if (dup) {
          Log.error('E103', `Nome único "%${obj.name}" duplicado na mesma cena.`);
        }
      }
      super.add(obj);
      if (obj instanceof EngineNode) {
        obj.owner = this.owner || this.getRootNode();
        obj.updateMatrixWorld(true);
        obj._onAttachedToParent(this);
        if (this._signals) this.emit('childAdded', obj);
        const tree = this.getTree();
        if (tree) {
          tree._propagateTree(obj, true);
        }
        const root = this.getRootNode();
        if (root && (root._sceneLifecycleStarted || this._sceneLifecycleStarted || this._startCalled)) {
          obj.initializeSceneLifecycle();
        }
      }
    }
    return this;
  }

  remove(...objects) {
    for (const obj of objects) {
      const wasChild = this.children.includes(obj);
      const tree = this.getTree();
      if (wasChild && obj instanceof EngineNode && tree) {
        tree._propagateTree(obj, false);
      }
      if (wasChild && obj instanceof EngineNode) {
        obj._onDetachedFromParent(this);
      }
      super.remove(obj);
      if (wasChild && obj instanceof EngineNode && this._signals) {
        this.emit('childRemoved', obj);
      }
    }
    return this;
  }

  addChild(no) {
    return this.add(no);
  }

  removeChild(no) {
    return this.remove(no);
  }

  moveChild(no, novoIndice) {
    const idx = this.children.indexOf(no);
    if (idx === -1) return this;
    this.children.splice(idx, 1);
    const targetIdx = Math.max(0, Math.min(this.children.length, Number(novoIndice) || 0));
    this.children.splice(targetIdx, 0, no);
    return this;
  }

  getParent() {
    return this.parent instanceof EngineNode ? this.parent : null;
  }

  getChildren() {
    return this.children.filter((c) => c instanceof EngineNode && !c.userData?.isViewportHelper);
  }

  getChildCount() {
    return this.getChildren().length;
  }

  getChild(indice) {
    return this.getChildren()[indice] || null;
  }

  isAncestorOf(outroNo) {
    if (!outroNo) return false;
    let curr = outroNo.parent;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parent;
    }
    return false;
  }

  getTree() {
    if (this.tree) return this.tree;
    let curr = this;
    while (curr.parent) {
      curr = curr.parent;
      if (curr.tree) return curr.tree;
    }
    return null;
  }

  getRootNode() {
    let curr = this;
    while (curr.parent && curr.parent instanceof EngineNode) {
      curr = curr.parent;
    }
    return curr;
  }

  reparentPreservingWorldTransform(newParent) {
    if (!newParent || newParent === this) return false;
    let cursor = newParent;
    while (cursor) {
      if (cursor === this) {
        Log.error('E102', `Ciclo na árvore ao reparentar "${this.name}".`);
        return false;
      }
      cursor = cursor.parent;
    }

    this.updateWorldMatrix(true, false);
    const worldMatrix = this.matrixWorld.clone();

    if (this.parent) {
      this.parent.remove(this);
    }

    newParent.updateWorldMatrix(true, false);
    const invParentWorld = new THREE.Matrix4().copy(newParent.matrixWorld).invert();
    const newLocalMatrix = new THREE.Matrix4().multiplyMatrices(invParentWorld, worldMatrix);

    const newPos = new THREE.Vector3();
    const newQuat = new THREE.Quaternion();
    const newScale = new THREE.Vector3();
    newLocalMatrix.decompose(newPos, newQuat, newScale);

    this._rawPosition.copy(newPos);
    this.quaternion.copy(newQuat);
    this.scale.copy(newScale);
    this.rotation.setFromQuaternion(newQuat, this.rotation.order);

    newParent.add(this);
    this.updateMatrix();
    this.updateMatrixWorld(true);
    this._onTransformChanged();

    return true;
  }

  reparent(novoPai, manterTransformacaoGlobal = true) {
    if (!manterTransformacaoGlobal) {
      if (novoPai === this || (novoPai && this.isAncestorOf(novoPai))) {
        Log.error('E102', `Ciclo ao reparentar "${this.name}".`);
        return false;
      }
      if (this.parent) this.parent.remove(this);
      if (novoPai) novoPai.add(this);
      return true;
    }
    return this.reparentPreservingWorldTransform(novoPai);
  }

  _onAttachedToParent(_parent) {
    this._onTransformChanged();
  }

  _onDetachedFromParent(_parent) {
    // Subclasses override as needed
  }

  setEditorVisible(visible) {
    this.editorVisible = Boolean(visible);
    this.visible = this.editorVisible;
    if (this._signals) this.emit('visibilityChanged', this.visible);
    return this;
  }

  setEditorLocked(locked) {
    this.editorLocked = Boolean(locked);
    return this;
  }

  _findUniqueInSubtree(targetName, ignoreNode = null) {
    if (this !== ignoreNode && this.uniqueName && this.name === targetName) {
      return this;
    }
    for (const ch of this.getChildren()) {
      const found = ch._findUniqueInSubtree(targetName, ignoreNode);
      if (found) return found;
    }
    return null;
  }

  getNodeOrNull(caminho) {
    if (!caminho || typeof caminho !== 'string') return null;
    const trimmed = caminho.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('%')) {
      const uName = trimmed.slice(1);
      const root = this.getRootNode();
      return root._findUniqueInSubtree(uName);
    }

    let current = this;
    const parts = trimmed.split('/').filter(Boolean);

    if (trimmed.startsWith('/')) {
      current = this.getRootNode();
      if (parts.length > 0 && parts[0] === current.name) {
        parts.shift();
      }
    }

    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') {
        current = current.getParent();
        if (!current) return null;
      } else if (part.startsWith('%')) {
        current = this.getRootNode()._findUniqueInSubtree(part.slice(1));
        if (!current) return null;
      } else {
        const next = current.getChildren().find((c) => c.name === part);
        if (!next) return null;
        current = next;
      }
    }
    return current;
  }

  getNode(caminho) {
    const found = this.getNodeOrNull(caminho);
    if (!found) {
      Log.error('E101', `Nó não encontrado no caminho "${caminho}" a partir de "${this.name}".`);
    }
    return found;
  }

  hasNode(caminho) {
    return this.getNodeOrNull(caminho) !== null;
  }

  getNodeByName(nome) {
    if (this.name === nome) return this;
    for (const ch of this.getChildren()) {
      const found = ch.getNodeByName(nome);
      if (found) return found;
    }
    return null;
  }

  _matchPattern(str, pattern) {
    if (!pattern || pattern === '*') return true;
    const regexStr = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    return new RegExp(regexStr, 'i').test(str);
  }

  findChild(padrao, recursivo = true) {
    for (const ch of this.getChildren()) {
      if (this._matchPattern(ch.name, padrao)) return ch;
      if (recursivo) {
        const deep = ch.findChild(padrao, true);
        if (deep) return deep;
      }
    }
    return null;
  }

  findChildren(criterio = {}, recursivo = true) {
    const results = [];
    const { name, type, group } = criterio;
    for (const ch of this.getChildren()) {
      let ok = true;
      if (name && !this._matchPattern(ch.name, name)) ok = false;
      if (type && ch.type !== type && ch.nodeType !== type) ok = false;
      if (group && !ch.isInGroup(group)) ok = false;
      if (ok) results.push(ch);
      if (recursivo) {
        results.push(...ch.findChildren(criterio, true));
      }
    }
    return results;
  }

  getPath() {
    const segments = [];
    let curr = this;
    while (curr && curr instanceof EngineNode) {
      segments.unshift(curr.name);
      curr = curr.getParent();
    }
    return '/' + segments.join('/');
  }

  // ============================================================================
  // GRUPOS (Seção 3.4)
  // ============================================================================
  addToGroup(grupo) {
    if (grupo && !this.groups.includes(grupo)) {
      this.groups.push(grupo);
    }
    return this;
  }

  removeFromGroup(grupo) {
    this.groups = this.groups.filter((g) => g !== grupo);
    return this;
  }

  isInGroup(grupo) {
    return this.groups.includes(grupo);
  }

  // ============================================================================
  // SINAIS (Seção 3.5 e 3.6)
  // ============================================================================
  defineSignal(nome) {
    if (!this._signals.has(nome)) {
      this._signals.set(nome, new Signal(nome));
    }
    return this._signals.get(nome);
  }

  connect(sinal, fn, alvo = null) {
    if (!this._signals.has(sinal)) {
      Log.error('E501', `Sinal "${sinal}" conectado sem ter sido declarado no nó "${this.name}".`);
      this.defineSignal(sinal);
    }
    return this._signals.get(sinal).connect(fn, alvo);
  }

  disconnect(sinal, fn, alvo = null) {
    if (!this._signals.has(sinal)) return;
    this._signals.get(sinal).disconnect(fn, alvo);
  }

  emit(sinal, ...args) {
    if (!this._signals || !this._signals.has(sinal)) {
      Log.error('E501', `Sinal "${sinal}" emitido sem ter sido declarado no nó "${this.name}".`);
      return;
    }
    this._signals.get(sinal).emit(...args);
  }

  waitFor(sinal) {
    if (!this._signals.has(sinal)) {
      this.defineSignal(sinal);
    }
    return this._signals.get(sinal).waitFor();
  }

  // ============================================================================
  // TEMPO E INTERPOLAÇÃO (Seção 3.7)
  // ============================================================================
  wait(segundos) {
    const tree = this.getTree();
    if (tree) {
      return tree.createTimer(segundos);
    }
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(segundos) * 1000)));
  }

  every(segundos, fn) {
    const intervalObj = {
      period: Math.max(0.001, Number(segundos) || 0.1),
      elapsed: 0,
      fn,
      cancelled: false,
      cancel() {
        this.cancelled = true;
      }
    };
    this._intervals.push(intervalObj);
    return intervalObj;
  }

  createTween() {
    return new Tween(this);
  }

  // ============================================================================
  // ESTADOS E CICLO DE VIDA NATIVO DAS CLASSES JAVASCRIPT (Seções 6, 7 e 8)
  // ============================================================================
  /**
   * Métodos base seguros do ciclo de vida nativo para permitir `super.start()`,
   * `super.input(event)`, `super.update(delta)` e `super.onDestroy()` em qualquer subclasse JS.
   */
  start() {}

  input(_event) {}

  onDestroy() {}

  /**
   * Define se o Node está ativo (`'active'`) ou inativo (`'inactive'`).
   * Desativar NÃO chama `onDestroy()`, e reativar NÃO executa `start()` novamente se já foi chamado.
   * @param {boolean} active
   */
  setActive(active) {
    if (this.isDestroyed || this.nodeState === 'destroyed') return this;
    this.nodeState = active ? 'active' : 'inactive';
    if (active && !this._startCalled) {
      const root = this.getRootNode();
      if (root && root._sceneLifecycleStarted) {
        this._invokeStartOnce();
      }
    }
    return this;
  }

  /**
   * Pausa ou despausa a execução do Node sem destruí-lo e sem chamar `onDestroy()`.
   * @param {boolean} paused
   */
  setPaused(paused) {
    if (this.isDestroyed || this.nodeState === 'destroyed') return this;
    this.nodeState = paused ? 'paused' : 'active';
    return this;
  }

  isActive() {
    return (
      !this.isDestroyed &&
      this.nodeState === 'active' &&
      this.processMode !== 'disabled'
    );
  }

  isPaused() {
    return this.nodeState === 'paused';
  }

  _handleLifecycleException(methodName, err) {
    const file = this._extendedScriptFile || this.scriptRef?.path || `${this.name}.js`;
    const className = this._extendedClassName || this.constructor?.name || this.nodeType;
    const stack = String(err?.stack || err?.message || '');
    const match =
      stack.match(/<anonymous>:(\d+):(\d+)/) ||
      stack.match(/Function:(\d+):(\d+)/) ||
      stack.match(/:(\d+):(\d+)\)?$/m);
    const line = match ? Math.max(1, parseInt(match[1], 10) - 3) : 1;
    const column = match ? parseInt(match[2], 10) : 1;

    const details = {
      errorType: 'runtime',
      file,
      className,
      nodeName: this.name,
      nodeUuid: this.uuid,
      method: methodName,
      line,
      column,
      message: err?.message || String(err),
      stack,
    };

    this._lastRuntimeError = details;
    this._scriptInstanceFaulted = true;
    Log._record(
      'error',
      `Erro de Runtime em "${file}" -> ${className}.${methodName}() no Node "${this.name}" (linha ${line}, col ${column}): ${details.message}`,
      'E301',
      'ScriptRuntime',
      details
    );
  }

  _invokeStartOnce() {
    if (this._startCalled || !this.isActive() || this._scriptInstanceFaulted) return;
    this._startCalled = true;
    if (!this.isReady) {
      this._onReadyInternal();
    }
    try {
      this.start();
    } catch (err) {
      this._handleLifecycleException('start', err);
    }
  }

  /**
   * Inicializa deterministicamente o ciclo de vida (`start()`) de toda a subárvore ativa.
   * Garante que `start()` rode exatamente uma única vez por instância ativa.
   */
  initializeSceneLifecycle() {
    this._sceneLifecycleStarted = true;
    if (this.isActive()) {
      this._invokeStartOnce();
    }
    const orderedChildren = [...this.getChildren()].sort(
      (a, b) => (a.processPriority || 0) - (b.processPriority || 0)
    );
    for (const child of orderedChildren) {
      child._sceneLifecycleStarted = true;
      child.initializeSceneLifecycle();
    }
    return this;
  }

  // ============================================================================
  // FÍSICA NATIVA UNIFICADA DO NODE (Substitui o antigo PhysicsScript)
  // ============================================================================
  /**
   * @returns {'none' | 'dynamic' | 'static' | 'kinematic'}
   */
  get physicsMode() {
    if (this.nodeType === 'RigidBody3DNode' && this._physicsMode === 'none' && this.bodyType) {
      return this.bodyType;
    }
    return this._physicsMode;
  }

  /**
   * @param {'none' | 'dynamic' | 'static' | 'kinematic'} mode
   */
  set physicsMode(mode) {
    const normalized =
      mode === 'dynamic' || mode === 'static' || mode === 'kinematic' ? mode : 'none';
    this._physicsMode = normalized;
    if (normalized !== 'none' && typeof this.setBodyType === 'function' && this.body) {
      this.setBodyType(normalized, this.mass);
    }
  }

  /**
   * Configura rapidamente a física nativa do Node sem depender de `PhysicsScript`.
   * @param {'dynamic' | 'static' | 'kinematic' | 'none'} [mode='dynamic']
   * @param {Record<string, any>} [config={}]
   */
  enablePhysics(mode = 'dynamic', config = {}) {
    this.physicsMode = mode;
    if (typeof config.mass === 'number') this.mass = Math.max(0, config.mass);
    if (typeof config.gravityY === 'number') this.gravityY = config.gravityY;
    if (typeof config.gravityScale === 'number') this.gravityScale = config.gravityScale;
    if (typeof config.useGravity === 'boolean') this.useGravity = config.useGravity;
    if (typeof config.restitution === 'number') {
      this.restitution = Math.min(1, Math.max(0, config.restitution));
    }
    if (typeof config.friction === 'number') {
      this.friction = Math.min(1, Math.max(0, config.friction));
    }
    if (typeof config.linearDamping === 'number') {
      this.linearDamping = Math.min(0.99, Math.max(0, config.linearDamping));
    }
    if (typeof config.angularDamping === 'number') {
      this.angularDamping = Math.min(0.99, Math.max(0, config.angularDamping));
    }
    if (typeof config.floorY === 'number' || config.floorY === null) {
      this.floorY = config.floorY;
    }
    if (typeof config.useFloorContact === 'boolean') {
      this.useFloorContact = config.useFloorContact;
    }
    if (config.velocity && typeof config.velocity === 'object') {
      this.velocity.set(
        Number(config.velocity.x ?? 0),
        Number(config.velocity.y ?? 0),
        Number(config.velocity.z ?? 0)
      );
    }
    return this;
  }

  /**
   * Aplica uma força contínua `{ x, y, z }` (em Newtons) acumulada para o passo físico do frame.
   * @param {{ x?: number, y?: number, z?: number }} forceVec
   */
  applyForce(forceVec) {
    if (!forceVec || typeof forceVec !== 'object') return this;
    const fx = Number(forceVec.x ?? 0);
    const fy = Number(forceVec.y ?? 0);
    const fz = Number(forceVec.z ?? 0);
    this._queuedForce.x += fx;
    this._queuedForce.y += fy;
    this._queuedForce.z += fz;
    if (this.body && typeof this.body.wakeUp === 'function') {
      this.body.wakeUp();
      this.body.force.x += fx;
      this.body.force.y += fy;
      this.body.force.z += fz;
    }
    return this;
  }

  /**
   * Aplica um impulso instantâneo `{ x, y, z }` alterando a velocidade conforme a massa (`J / m`).
   * @param {{ x?: number, y?: number, z?: number }} impulseVec
   */
  applyImpulse(impulseVec) {
    if (!impulseVec || typeof impulseVec !== 'object') return this;
    const invMass = this.physicsMode === 'static' ? 0 : 1 / Math.max(0.05, Number(this.mass) || 1);
    const dvx = Number(impulseVec.x ?? 0) * invMass;
    const dvy = Number(impulseVec.y ?? 0) * invMass;
    const dvz = Number(impulseVec.z ?? 0) * invMass;
    this.velocity.x += dvx;
    this.velocity.y += dvy;
    this.velocity.z += dvz;
    if (this.body && typeof this.body.wakeUp === 'function') {
      this.body.wakeUp();
      this.body.velocity.x += dvx;
      this.body.velocity.y += dvy;
      this.body.velocity.z += dvz;
    }
    return this;
  }

  /**
   * Aplica torque rotacional `{ x, y, z }`.
   * @param {{ x?: number, y?: number, z?: number }} torqueVec
   */
  applyTorque(torqueVec) {
    if (!torqueVec || typeof torqueVec !== 'object') return this;
    const tx = Number(torqueVec.x ?? 0);
    const ty = Number(torqueVec.y ?? 0);
    const tz = Number(torqueVec.z ?? 0);
    this._queuedTorque.x += tx;
    this._queuedTorque.y += ty;
    this._queuedTorque.z += tz;
    if (this.body && typeof this.body.wakeUp === 'function') {
      this.body.wakeUp();
      this.body.torque.x += tx;
      this.body.torque.y += ty;
      this.body.torque.z += tz;
    }
    return this;
  }

  /**
   * Soma diretamente `{ x, y, z }` à velocidade linear do Node.
   * @param {{ x?: number, y?: number, z?: number }} deltaVec
   */
  addVelocity(deltaVec) {
    if (!deltaVec || typeof deltaVec !== 'object') return this;
    this.velocity.x += Number(deltaVec.x ?? 0);
    this.velocity.y += Number(deltaVec.y ?? 0);
    this.velocity.z += Number(deltaVec.z ?? 0);
    if (this.body && typeof this.body.wakeUp === 'function') {
      this.body.wakeUp();
      this.body.velocity.x = this.velocity.x;
      this.body.velocity.y = this.velocity.y;
      this.body.velocity.z = this.velocity.z;
    }
    return this;
  }

  isOnFloor() {
    return Boolean(this._onFloorState);
  }

  isColliding() {
    return Boolean(this._onFloorState || this._activeContacts.length > 0);
  }

  getContacts() {
    return [...this._activeContacts];
  }

  getCollidingNodes() {
    return this._activeContacts.map((c) => c.otherNode).filter(Boolean);
  }

  /**
   * Calcula os semi-extremos (half-extents `{ hx, hy, hz }`) do colisor do Node
   * a partir de filhos `CollisionShape3DNode` ou da geometria/escala do próprio Node.
   */
  _getEffectiveHalfExtents() {
    const sx = Math.abs(this.scale.x || 1);
    const sy = Math.abs(this.scale.y || 1);
    const sz = Math.abs(this.scale.z || 1);

    for (const ch of this.children) {
      if (ch && ch.nodeType === 'CollisionShape3DNode') {
        if (ch.shapeType === 'Sphere') {
          const r = Math.max(0.05, Number(ch.radius) || 0.5) * Math.max(sx, sy, sz);
          return { hx: r, hy: r, hz: r };
        }
        if (ch.shapeType === 'Cylinder') {
          const r = Math.max(0.05, Number(ch.radius) || 0.5) * Math.max(sx, sz);
          const h = (Math.max(0.05, Number(ch.height) || 1.0) * sy) / 2;
          return { hx: r, hy: h, hz: r };
        }
        if (ch.dimensions) {
          return {
            hx: Math.max(0.05, (Number(ch.dimensions.x) || 1) * sx * 0.5),
            hy: Math.max(0.05, (Number(ch.dimensions.y) || 1) * sy * 0.5),
            hz: Math.max(0.05, (Number(ch.dimensions.z) || 1) * sz * 0.5),
          };
        }
      }
    }

    if (this.nodeType === 'Mesh3D' && this._shapeParams) {
      const p = this._shapeParams;
      if (this._shape === 'sphere') {
        const r = (Number(p.radius) || 0.6) * Math.max(sx, sy, sz);
        return { hx: r, hy: r, hz: r };
      }
      return {
        hx: ((Number(p.width) || 1) * sx) / 2,
        hy: ((Number(p.height) || 1) * sy) / 2,
        hz: ((Number(p.depth) || 1) * sz) / 2,
      };
    }

    return { hx: 0.5 * sx, hy: 0.5 * sy, hz: 0.5 * sz };
  }

  /**
   * Resolve colisões 3D (AABB/contato) contra outros Nodes físicos na mesma árvore de cena,
   * garantindo que nem a simulação nem alterações manuais em `update(delta)` penetrem obstáculos.
   *
   * @param {{ x: number, y: number, z: number }} candidatePos
   */
  _resolveSceneColliderContacts(candidatePos, preStepPos = null) {
    const root = this.getRootNode();
    if (!root || root === this) return;

    const myExt = this._getEffectiveHalfExtents();
    const refOrigin = preStepPos || this._preStepPosition || this._rawPosition;
    const otherNodes = [];
    const collectPhysicalNodes = (n) => {
      if (!n || n === this || n.isDestroyed || !n.isActive()) return;
      const hasColliderChild = n.children.some((c) => c && c.nodeType === 'CollisionShape3DNode');
      if (n.physicsMode !== 'none' || n.nodeType === 'RigidBody3DNode' || hasColliderChild) {
        otherNodes.push(n);
      }
      for (const ch of n.getChildren()) {
        collectPhysicalNodes(ch);
      }
    };
    collectPhysicalNodes(root);

    const newContacts = [];
    for (const other of otherNodes) {
      const otherPos = other._rawPosition;
      const otherExt = other._getEffectiveHalfExtents();

      const dx = candidatePos.x - otherPos.x;
      const dy = candidatePos.y - otherPos.y;
      const dz = candidatePos.z - otherPos.z;

      const approachDx = Math.abs(refOrigin.x - otherPos.x) > 1e-5 ? refOrigin.x - otherPos.x : dx;
      const approachDy = Math.abs(refOrigin.y - otherPos.y) > 1e-5 ? refOrigin.y - otherPos.y : dy;
      const approachDz = Math.abs(refOrigin.z - otherPos.z) > 1e-5 ? refOrigin.z - otherPos.z : dz;

      const overlapX = myExt.hx + otherExt.hx - Math.abs(dx);
      const overlapY = myExt.hy + otherExt.hy - Math.abs(dy);
      const overlapZ = myExt.hz + otherExt.hz - Math.abs(dz);

      if (overlapX > 0 && overlapY > 0 && overlapZ > 0) {
        let nx = 0;
        let ny = 0;
        let nz = 0;

        // Separação pelo eixo de menor penetração (Minimum Translation Vector) respeitando o lado de aproximação
        if (overlapY <= overlapX && overlapY <= overlapZ) {
          ny = approachDy >= 0 ? 1 : -1;
          candidatePos.y = otherPos.y + ny * (myExt.hy + otherExt.hy);
        } else if (overlapX <= overlapY && overlapX <= overlapZ) {
          nx = approachDx >= 0 ? 1 : -1;
          candidatePos.x = otherPos.x + nx * (myExt.hx + otherExt.hx);
        } else {
          nz = approachDz >= 0 ? 1 : -1;
          candidatePos.z = otherPos.z + nz * (myExt.hz + otherExt.hz);
        }

        const relVn = this.velocity.x * nx + this.velocity.y * ny + this.velocity.z * nz;
        const combinedRestitution = Math.min(
          1,
          Math.max(0, Math.max(this.restitution ?? 0.35, other.restitution ?? 0))
        );

        if (relVn < 0) {
          const bounceImpulse = -(1 + combinedRestitution) * relVn;
          this.velocity.x += bounceImpulse * nx;
          this.velocity.y += bounceImpulse * ny;
          this.velocity.z += bounceImpulse * nz;
          if (ny > 0.5 && Math.abs(this.velocity.y) < 0.15) {
            this.velocity.y = 0;
          }
        }

        if (ny > 0.5) {
          this._onFloorState = true;
        }

        const contactInfo = {
          otherNode: other,
          normal: { x: nx, y: ny, z: nz },
          impactVelocity: Math.abs(relVn),
        };
        newContacts.push(contactInfo);
      }
    }

    // Dispara callbacks e sinais de colisão (Enter / Stay / Exit)
    const currentUuids = new Set(newContacts.map((c) => c.otherNode.uuid));
    for (const c of newContacts) {
      const wasColliding = this._previousCollidingUuids.has(c.otherNode.uuid);
      if (!wasColliding) {
        this.emit('bodyEntered', c.otherNode, c);
        this.emit('collided', c.otherNode, c);
        if (typeof this.onCollisionEnter === 'function' && !this._scriptInstanceFaulted) {
          try {
            this.onCollisionEnter(c.otherNode, c);
          } catch (err) {
            this._handleLifecycleException('onCollisionEnter', err);
          }
        }
      } else if (typeof this.onCollisionStay === 'function' && !this._scriptInstanceFaulted) {
        try {
          this.onCollisionStay(c.otherNode, c);
        } catch (err) {
          this._handleLifecycleException('onCollisionStay', err);
        }
      }
    }

    this._previousCollidingUuids = currentUuids;
    this._activeContacts = newContacts;
  }

  /**
   * Executa o passo físico unificado do Node dentro do pipeline de `update(delta)`,
   * integrando gravidade, velocidade, aceleração, forças, massa, quique (`restitution`),
   * atrito (`friction`), amortecimento (`linearDamping`) e resolução de colisões.
   *
   * @param {number} delta
   */
  _stepUnifiedNodePhysics(delta) {
    const mode = this.physicsMode;
    if (mode === 'none' || delta <= 0) return;

    // Se este Node é um RigidBody3DNode que já foi avançado pelo PhysicsServer.step() neste tick,
    // apenas sincroniza intenções do desenvolvedor com o corpo cannon-es sem aplicar gravidade duplicada.
    if (this.nodeType === 'RigidBody3DNode' && this.body && this._cannonSteppedInCurrentTick) {
      this._cannonSteppedInCurrentTick = false;
      return;
    }

    if (mode === 'static') {
      this.velocity.set(0, 0, 0);
      this.angularVelocity.set(0, 0, 0);
      this._queuedForce.set(0, 0, 0);
      return;
    }

    if (mode === 'kinematic') {
      const nextPos = {
        x: this._rawPosition.x + this.velocity.x * delta,
        y: this._rawPosition.y + this.velocity.y * delta,
        z: this._rawPosition.z + this.velocity.z * delta,
      };
      this.position = nextPos;
      if (this.body && typeof this.syncTransformToBody === 'function') {
        this.syncTransformToBody();
      }
      return;
    }

    // Modo 'dynamic':
    const effMass = Math.max(0.05, Number(this.mass) || 1.0);
    const gravY = this.useGravity ? Number(this.gravityY ?? -9.82) * Number(this.gravityScale ?? 1.0) : 0;

    const ax = Number(this.acceleration.x || 0) + this._queuedForce.x / effMass;
    const ay = Number(this.acceleration.y || 0) + gravY + this._queuedForce.y / effMass;
    const az = Number(this.acceleration.z || 0) + this._queuedForce.z / effMass;
    this._queuedForce.set(0, 0, 0);

    this.velocity.x += ax * delta;
    this.velocity.y += ay * delta;
    this.velocity.z += az * delta;

    // Amortecimento linear (resistência do ar / fluido)
    const dampFactor = Math.max(
      0,
      1 - Math.min(0.99, Math.max(0, Number(this.linearDamping ?? 0.02))) * delta * 10
    );
    this.velocity.x *= dampFactor;
    this.velocity.y *= dampFactor;
    this.velocity.z *= dampFactor;

    // Velocidade angular e torque
    if (this._queuedTorque.lengthSq() > 0) {
      this.angularVelocity.x += (this._queuedTorque.x / effMass) * delta;
      this.angularVelocity.y += (this._queuedTorque.y / effMass) * delta;
      this.angularVelocity.z += (this._queuedTorque.z / effMass) * delta;
      this._queuedTorque.set(0, 0, 0);
    }
    if (!this.fixedRotation && this.angularVelocity.lengthSq() > 0) {
      const angDamp = Math.max(
        0,
        1 - Math.min(0.99, Math.max(0, Number(this.angularDamping ?? 0.01))) * delta * 10
      );
      this.angularVelocity.multiplyScalar(angDamp);
      this.rotation.x += this.angularVelocity.x * delta;
      this.rotation.y += this.angularVelocity.y * delta;
      this.rotation.z += this.angularVelocity.z * delta;
    }

    const candidatePos = {
      x: this._rawPosition.x + this.velocity.x * delta,
      y: this._rawPosition.y + this.velocity.y * delta,
      z: this._rawPosition.z + this.velocity.z * delta,
    };

    this._onFloorState = false;
    this._activeContacts = [];

    // 1. Contato com o plano de piso configurado (`floorY`)
    if (this.useFloorContact && typeof this.floorY === 'number' && Number.isFinite(this.floorY)) {
      if (candidatePos.y <= this.floorY) {
        candidatePos.y = this.floorY;
        this._onFloorState = true;
        if (this.velocity.y < 0) {
          const restitution = Math.min(1, Math.max(0, Number(this.restitution ?? 0.35)));
          this.velocity.y = -this.velocity.y * restitution;
          if (Math.abs(this.velocity.y) < 0.15) {
            this.velocity.y = 0;
          }
        }
        // Atrito superficial (`friction`) no contato com o chão
        const frictionFactor = Math.max(
          0,
          1 - Math.min(1, Math.max(0, Number(this.friction ?? 0.3))) * delta * 8
        );
        this.velocity.x *= frictionFactor;
        this.velocity.z *= frictionFactor;
      }
    }

    // 2. Resolução de colisões 3D contra outros Nodes físicos e CollisionShape3DNodes da cena
    this._resolveSceneColliderContacts(candidatePos);

    // 3. Aplica a transformação validada de volta ao Node e ao corpo cannon-es (se existir)
    this.position = candidatePos;
    if (this.body && typeof this.syncTransformToBody === 'function') {
      this.syncTransformToBody();
      this.body.velocity.set(this.velocity.x, this.velocity.y, this.velocity.z);
    }
  }

  // ============================================================================
  // SCRIPTS LEGADOS, COMPONENTES AUXILIARES E PIPELINE DE UPDATE(DELTA)
  // ============================================================================
  /**
   * @param {any} definicaoOuCodigo
   * @param {Record<string, any>} [props={}]
   * @param {string | null} [name=null]
   */
  attachScript(definicaoOuCodigo, props = {}, name = null) {
    if (typeof definicaoOuCodigo === 'string') {
      const entry = {
        name: name || `Script_${this.scripts.length + 1}`,
        code: definicaoOuCodigo,
        enabled: true,
        exports: props && typeof props === 'object' ? { ...props } : {}
      };
      this.scripts.push(entry);
      return entry;
    }
    if (definicaoOuCodigo && typeof definicaoOuCodigo === 'object') {
      const entry = {
        name: name || definicaoOuCodigo.name || `Script_${this.scripts.length + 1}`,
        code: definicaoOuCodigo.code || '',
        enabled: definicaoOuCodigo.enabled !== false,
        exports: definicaoOuCodigo.exports ? { ...definicaoOuCodigo.exports, ...(props || {}) } : { ...(props || {}) },
        _instance: definicaoOuCodigo.instance || definicaoOuCodigo
      };
      this.scripts.push(entry);
      return entry;
    }
    return null;
  }

  getScript(nomeOuIndice = 0) {
    if (typeof nomeOuIndice === 'number') {
      const s = this.scripts[nomeOuIndice];
      return s ? (s._instance || s) : null;
    }
    const found = this.scripts.find((s) => s.name === nomeOuIndice);
    return found ? (found._instance || found) : null;
  }

  _onEnterTreeInternal() {
    this.emit('enteredTree');
    for (const s of this.scripts) {
      if (s && s.enabled !== false && s._instance && typeof s._instance.onEnterTree === 'function') {
        try { s._instance.onEnterTree.call(this, this); } catch (e) { Log.error('E301', e.message); }
      }
    }
  }

  _onReadyInternal() {
    this.isReady = true;
    this.emit('ready');
    for (const s of this.scripts) {
      if (s && s.enabled !== false && s._instance && typeof s._instance.onReady === 'function') {
        try { s._instance.onReady.call(this, this); } catch (e) { Log.error('E301', e.message); }
      }
    }
  }

  _onExitTreeInternal() {
    this.emit('exitingTree');
    for (const s of this.scripts) {
      if (s && s.enabled !== false && s._instance && typeof s._instance.onExitTree === 'function') {
        try { s._instance.onExitTree.call(this, this); } catch (e) { Log.error('E301', e.message); }
      }
    }
  }

  resetScriptState() {
    this._scriptTime = 0;
    this._scriptBasePosition = null;
    this._scriptBaseScale = null;
    this._startCalled = false;
    this._onDestroyCalled = false;
    this._scriptInstanceFaulted = false;
    this._lastRuntimeError = null;
    this._queuedForce.set(0, 0, 0);
    this._queuedImpulse.set(0, 0, 0);
    this._queuedTorque.set(0, 0, 0);
    this._activeContacts = [];
    this._previousCollidingUuids.clear();
    this.userData.scriptState = {};
    for (const s of this.scripts) {
      if (s) s._readyCalled = false;
    }
  }

  /**
   * Executa modificadores auxiliares (`Rotator`, `Oscillator`, `Thruster`, `PulseScale`).
   * Nota arquitetural: `PhysicsScript` foi unificado ao Node e ao `update(delta)` e não existe mais aqui.
   */
  _executeBehaviorComponents(delta) {
    if (!this.components || this.components.length === 0) return;

    if (!this._scriptBasePosition) {
      this._scriptBasePosition = this._rawPosition.clone();
    }
    if (!this._scriptBaseScale) {
      this._scriptBaseScale = this.scale.clone();
    }

    this._scriptTime += delta;
    const degToRad = Math.PI / 180;

    for (const comp of this.components) {
      if (!comp || comp.enabled === false) continue;
      const params = comp.params || {};

      if (comp.type === 'Rotator') {
        const sx = Number(params.speedX ?? 0) * degToRad;
        const sy = Number(params.speedY ?? 45) * degToRad;
        const sz = Number(params.speedZ ?? 0) * degToRad;
        this.rotation.x += sx * delta;
        this.rotation.y += sy * delta;
        this.rotation.z += sz * delta;
        this.updateMatrix();
        this.updateMatrixWorld(true);
        this._onTransformChanged();
      } else if (comp.type === 'Oscillator') {
        const axis = params.axis === 'x' || params.axis === 'z' ? params.axis : 'y';
        const amplitude = Number(params.amplitude ?? 0.5);
        const frequency = Number(params.frequency ?? 1.5);
        const offset = Math.sin(this._scriptTime * frequency * Math.PI * 2) * amplitude;
        const nextPos = this._rawPosition.clone();
        nextPos[axis] = this._scriptBasePosition[axis] + offset;
        this.position = nextPos;
      } else if (comp.type === 'Thruster') {
        const interval = Math.max(0.2, Number(params.interval ?? 1.5));
        const impulseY = Number(params.impulseY ?? 8.5);
        this._thrusterAccum = (this._thrusterAccum || 0) + delta;
        if (this._thrusterAccum >= interval) {
          this._thrusterAccum -= interval;
          this.velocity.y = impulseY;
          if (this.body && typeof this.body.wakeUp === 'function') {
            this.body.wakeUp();
            this.body.velocity.y = impulseY;
          }
        }
      } else if (comp.type === 'PulseScale') {
        const amplitude = Number(params.amplitude ?? 0.2);
        const frequency = Number(params.frequency ?? 2.0);
        const factor = 1 + Math.sin(this._scriptTime * frequency * Math.PI * 2) * amplitude;
        this.scale.set(
          Math.max(0.05, this._scriptBaseScale.x * factor),
          Math.max(0.05, this._scriptBaseScale.y * factor),
          Math.max(0.05, this._scriptBaseScale.z * factor)
        );
        this.updateMatrix();
        this.updateMatrixWorld(true);
        this._onTransformChanged();
      } else if (comp.type === 'CustomScript' && typeof params.expression === 'string') {
        try {
          const fn = new Function('node', 't', 'dt', 'Math', params.expression);
          fn(this, this._scriptTime, delta, Math);
          this.updateMatrix();
          this.updateMatrixWorld(true);
          this._onTransformChanged();
        } catch (err) {
          Log.error('E301', `Erro em CustomScript de "${this.name}": ${err.message}`);
        }
      }
    }
  }

  executeScripts(dt = 1 / 60) {
    if (!Array.isArray(this.scripts) || this.scripts.length === 0) return;
    if (!this.userData.scriptState) {
      this.userData.scriptState = {};
    }

    for (const script of this.scripts) {
      if (!script || script.enabled === false) continue;

      if (script._instance) {
        if (!script._readyCalled) {
          script._readyCalled = true;
          if (typeof script._instance.onReady === 'function') {
            try { script._instance.onReady.call(this, this); } catch (e) { Log.error('E301', e.message); }
          }
        }
        if (typeof script._instance.onProcess === 'function') {
          try { script._instance.onProcess.call(this, dt, this); } catch (e) { Log.error('E301', e.message); }
        }
      }

      if (!script.code || typeof script.code !== 'string') continue;

      try {
        if (script._compiledSource !== script.code) {
          script._compiledFn = new Function(
            'node',
            'dt',
            'state',
            'THREE',
            'Input',
            'Save',
            'Audio',
            'Log',
            'Rng',
            'StateMachine',
            'Tween',
            'Shake',
            'Easing',
            script.code
          );
          script._compiledSource = script.code;
          script._hooks = null;
          script._readyCalled = false;
        }
        if (script._compiledFn) {
          const result = script._compiledFn(
            this,
            dt,
            this.userData.scriptState,
            THREE,
            Input,
            Save,
            Audio,
            Log,
            Rng,
            StateMachine,
            Tween,
            Shake,
            Easing
          );
          if (result && typeof result === 'object') {
            script._hooks = result;
            if (!script._readyCalled) {
              script._readyCalled = true;
              if (typeof result.onReady === 'function') {
                result.onReady.call(this, this, this.userData.scriptState);
              }
            }
            if (typeof result.onProcess === 'function') {
              result.onProcess.call(this, dt, this, this.userData.scriptState);
            }
          }
        }
      } catch (err) {
        Log.error('E301', `Erro no script "${script.name || 'SemNome'}" do nó "${this.name}": ${err.message}`);
      }
    }
  }

  _stepNodeInternal(dt) {
    if (!this.isActive()) return;

    // 1. Intervalos every()
    if (this._intervals.length > 0) {
      this._intervals = this._intervals.filter((iv) => !iv.cancelled);
      for (const iv of this._intervals) {
        iv.elapsed += dt;
        while (iv.elapsed >= iv.period && !iv.cancelled) {
          iv.elapsed -= iv.period;
          try { iv.fn(dt); } catch (e) { Log.error('E301', e.message); }
        }
      }
    }

    // 2. Cadência fixa onTick (se tickRate > 0)
    if (this.tickRate > 0) {
      const period = 1 / this.tickRate;
      this._tickAccumulator += dt;
      while (this._tickAccumulator >= period) {
        this._tickAccumulator -= period;
        for (const s of this.scripts) {
          if (!s || s.enabled === false) continue;
          const hooks = s._instance || s._hooks;
          if (hooks && typeof hooks.onTick === 'function') {
            try { hooks.onTick.call(this, period, this, this.userData.scriptState); } catch (e) { Log.error('E301', e.message); }
          }
        }
      }
    }

    // 3. Modificadores Auxiliares e Scripts Legados
    this._executeBehaviorComponents(dt);
    this.executeScripts(dt);
  }

  /**
   * Pipeline unificado de `update(delta)` que garante:
   * - Execução de `start()` uma única vez se o Node acabou de entrar em execução ativa.
   * - Execução do `update(delta)` da classe JavaScript estendida do desenvolvedor com isolamento de erro.
   * - Integração física unificada (`_stepUnifiedNodePhysics(delta)`) respeitando colisões e sem execução duplicada,
   *   independentemente de a subclasse chamar ou não `super.update(delta)`.
   *
   * @param {number} [delta=1/60]
   * @param {Function | null} [userUpdateFn=null]
   * @param {boolean} [updateChildren=true]
   */
  _runUnifiedUpdatePipeline(delta = 1 / 60, userUpdateFn = null, updateChildren = true) {
    if (!this.isActive()) return;

    // Se `super.update(delta)` foi chamado de dentro do próprio `update(delta)` da subclasse,
    // evita recursão ou execução duplicada no mesmo frame.
    if (this._inFrameStep) {
      return;
    }

    this._inFrameStep = true;
    try {
      if (!this._startCalled) {
        this._invokeStartOnce();
      }

      // 1. Passo interno do Node (timers, intervalos, componentes auxiliares Rotator/Oscillator/Thruster)
      this._stepNodeInternal(delta);

      // 2. Executa o `update(delta)` da classe JavaScript estendida (se existir e não estiver isolada por falha)
      const effectiveUserUpdate =
        userUpdateFn ||
        (this.update && this.update.__rawUserUpdate ? this.update.__rawUserUpdate : null);

      this._preStepPosition = {
        x: this._rawPosition.x,
        y: this._rawPosition.y,
        z: this._rawPosition.z,
      };

      if (effectiveUserUpdate && !this._scriptInstanceFaulted) {
        try {
          effectiveUserUpdate.call(this, delta);
        } catch (err) {
          this._handleLifecycleException('update', err);
        }
      }

      // 3. Executa a simulação física unificada do Node (gravidade, velocidade, forças, quique, atrito e colisões)
      this._stepUnifiedNodePhysics(delta);

      // 4. Propaga para os filhos ativos (quando chamado via `node.update(delta)`)
      if (updateChildren) {
        const orderedChildren = [...this.children].filter((c) => c instanceof EngineNode);
        orderedChildren.sort((a, b) => (a.processPriority || 0) - (b.processPriority || 0));
        for (const child of orderedChildren) {
          if (typeof child.update === 'function') {
            child.update(delta);
          }
        }
      }
    } finally {
      this._inFrameStep = false;
    }
  }

  update(delta = 1 / 60) {
    this._runUnifiedUpdatePipeline(delta, null, true);
  }

  /**
   * Distribui um evento de entrada (`InputEvent`) para este Node e seus filhos ativos,
   * respeitando o consumo de eventos (`event.consume()` ou retorno `true`).
   * @param {any} evento
   */
  dispatchInput(evento) {
    if (!evento || evento.consumed || !this.isActive()) return evento;

    // 1. Método `input(event)` da classe JavaScript estendida
    if (
      typeof this.input === 'function' &&
      this.input !== EngineNode.prototype.input &&
      !this._scriptInstanceFaulted
    ) {
      try {
        const res = this.input(evento);
        if (res === true && typeof evento.consume === 'function') {
          evento.consume();
        }
      } catch (err) {
        this._handleLifecycleException('input', err);
      }
    }

    if (evento.consumed) return evento;

    // 2. Scripts legados com hook `onInput`
    for (const s of this.scripts) {
      if (!s || s.enabled === false) continue;
      const hooks = s._instance || s._hooks;
      if (hooks && typeof hooks.onInput === 'function') {
        try {
          const r = hooks.onInput.call(this, evento, this, this.userData.scriptState);
          if (r === true && typeof evento.consume === 'function') {
            evento.consume();
          }
        } catch (e) {
          Log.error('E301', e.message);
        }
      }
      if (evento.consumed) return evento;
    }

    // 3. Propaga para filhos ativos
    for (const ch of this.getChildren()) {
      ch.dispatchInput(evento);
      if (evento.consumed) break;
    }
    return evento;
  }

  destroy() {
    if (this.isDestroyed || this.nodeState === 'destroyed') return;
    for (const ch of [...this.getChildren()]) {
      ch.destroy();
    }

    // Executa `onDestroy()` da classe JavaScript estendida exatamente uma única vez
    if (!this._onDestroyCalled) {
      this._onDestroyCalled = true;
      if (
        typeof this.onDestroy === 'function' &&
        this.onDestroy !== EngineNode.prototype.onDestroy
      ) {
        try {
          this.onDestroy();
        } catch (err) {
          this._handleLifecycleException('onDestroy', err);
        }
      }
    }

    for (const s of this.scripts) {
      const hooks = s._instance || s._hooks;
      if (hooks && typeof hooks.onDestroy === 'function') {
        try { hooks.onDestroy.call(this, this); } catch (e) { Log.error('E301', e.message); }
      }
    }
    if (this.parent) {
      this.parent.remove(this);
    }
    this._intervals = [];
    this.isDestroyed = true;
    this.nodeState = 'destroyed';
    this.emit('destroyed');
  }

  duplicate() {
    return this.serialize();
  }

  // ============================================================================
  // SERIALIZAÇÃO E DESSERIALIZAÇÃO (.scene.json / .scene)
  // ============================================================================
  /**
   * @param {object} [options={}]
   * @param {boolean} [options.includeInstancedChildren=false]
   */
  serialize(options = {}) {
    const { includeInstancedChildren = false } = options;

    // Se este Node é uma Cena Filha instanciada (`this.sceneInstance`), seus filhos internos pertencem
    // à cena de origem e NÃO são duplicados no `.scene.json` da cena pai — apenas a referência e `localOverrides`.
    const engineChildren =
      this.sceneInstance && !includeInstancedChildren
        ? []
        : this.children.filter(
            (child) =>
              child instanceof EngineNode &&
              !child.userData?.isViewportHelper &&
              (!child.userData?.ownedBySceneInstance || includeInstancedChildren)
          );

    const isRootNode = !(this.parent instanceof EngineNode);
    const unknownAttrs = this.userData?.unknownNodeAttributes || this.unknownAttributes || {};
    const serializedType = this.userData?.originalUnknownType || this.nodeType;

    const primaryScriptUuid =
      (this.scriptRef && typeof this.scriptRef.uuid === 'string' && this.scriptRef.uuid) ||
      (this.scripts[0] && typeof this.scripts[0].uuid === 'string' && this.scripts[0].uuid) ||
      null;
    const primaryScriptPath =
      (this.scriptRef && typeof this.scriptRef.path === 'string' && this.scriptRef.path) || null;

    const hasUnifiedPhysics = this._physicsMode && this._physicsMode !== 'none';

    // Quando é uma instância de Cena Filha, atualiza automaticamente os localOverrides de transformação/nome/visibilidade
    const serializedSceneInstance = this.sceneInstance
      ? {
          sourceSceneUuid: this.sceneInstance.sourceSceneUuid || '',
          sourceScenePath: this.sceneInstance.sourceScenePath || '',
          localOverrides: {
            ...(this.sceneInstance.localOverrides || {}),
            name: this.name,
            editorVisible: this.editorVisible,
            position: {
              x: this._rawPosition.x,
              y: this._rawPosition.y,
              z: this._rawPosition.z,
            },
            rotation: {
              x: this.rotation.x,
              y: this.rotation.y,
              z: this.rotation.z,
              order: this.rotation.order,
            },
            scale: {
              x: this.scale.x,
              y: this.scale.y,
              z: this.scale.z,
            },
          },
        }
      : undefined;

    return {
      ...unknownAttrs,
      type: serializedType,
      uuid: this.uuid,
      name: this.name,
      uniqueName: this.uniqueName || false,
      editorVisible: this.editorVisible,
      editorLocked: this.editorLocked,
      nodeState: this.nodeState === 'destroyed' ? 'active' : this.nodeState,
      processMode: this.processMode || 'inherit',
      processPriority: this.processPriority || 0,
      tickRate: this.tickRate || 0,
      runInEditor: Boolean(this.runInEditor),
      groups: [...this.groups],
      meta: JSON.parse(JSON.stringify(this.meta || {})),
      ...(isRootNode ? { environment: normalizeSceneEnvironment(this.environment) } : {}),
      position: {
        x: this._rawPosition.x,
        y: this._rawPosition.y,
        z: this._rawPosition.z,
      },
      rotation: {
        x: this.rotation.x,
        y: this.rotation.y,
        z: this.rotation.z,
        order: this.rotation.order,
      },
      quaternion: {
        x: this.quaternion.x,
        y: this.quaternion.y,
        z: this.quaternion.z,
        w: this.quaternion.w,
      },
      scale: {
        x: this.scale.x,
        y: this.scale.y,
        z: this.scale.z,
      },
      ...(hasUnifiedPhysics
        ? {
            physics: {
              physicsMode: this._physicsMode,
              mass: this.mass,
              useGravity: this.useGravity,
              gravityY: this.gravityY,
              gravityScale: this.gravityScale,
              restitution: this.restitution,
              friction: this.friction,
              linearDamping: this.linearDamping,
              angularDamping: this.angularDamping,
              fixedRotation: this.fixedRotation,
              floorY: this.floorY,
              useFloorContact: this.useFloorContact,
              velocity: {
                x: this.velocity.x,
                y: this.velocity.y,
                z: this.velocity.z,
              },
            },
          }
        : {}),
      ...(primaryScriptUuid || primaryScriptPath
        ? {
            script: {
              ...(primaryScriptUuid ? { uuid: primaryScriptUuid } : {}),
              ...(primaryScriptPath ? { path: primaryScriptPath } : {}),
              ...(this.scriptRef?.className ? { className: this.scriptRef.className } : {}),
              ...(this.scriptRef?.extendsType ? { extendsType: this.scriptRef.extendsType } : {}),
            },
          }
        : {}),
      ...(serializedSceneInstance ? { sceneInstance: serializedSceneInstance } : {}),
      ...(this.materialRef && this.materialRef.uuid ? { material: { uuid: this.materialRef.uuid } } : {}),
      ...(this.textureRef && this.textureRef.uuid ? { texture: { uuid: this.textureRef.uuid } } : {}),
      components: this.components
        .filter((c) => c && c.type !== 'Physics')
        .map((c) => ({
          id: c.id,
          type: c.type,
          enabled: c.enabled !== false,
          params: { ...(c.params || {}) },
        })),
      scripts: this.scripts.map((s) => ({
        name: s.name || 'Script',
        ...(s.uuid ? { uuid: s.uuid } : {}),
        code: s.code || '',
        enabled: s.enabled !== false,
        exports: s.exports ? { ...s.exports } : {}
      })),
      children: engineChildren.map((child) => child.serialize(options)),
    };
  }

  deserialize(data) {
    if (!data || typeof data !== 'object') return this;

    if (typeof data.uuid === 'string' && data.uuid.length > 0) {
      this.uuid = data.uuid;
    }
    if (typeof data.name === 'string') {
      this._name = data.name;
    }
    if (typeof data.uniqueName === 'boolean') {
      this.uniqueName = data.uniqueName;
    }
    if (typeof data.editorVisible === 'boolean') {
      this.setEditorVisible(data.editorVisible);
    }
    if (typeof data.editorLocked === 'boolean') {
      this.setEditorLocked(data.editorLocked);
    }
    if (
      data.nodeState === 'active' ||
      data.nodeState === 'inactive' ||
      data.nodeState === 'paused'
    ) {
      this.nodeState = data.nodeState;
    }
    if (typeof data.processMode === 'string') {
      this.processMode = data.processMode;
    }
    if (typeof data.processPriority === 'number') {
      this.processPriority = data.processPriority;
    }
    if (typeof data.tickRate === 'number') {
      this.tickRate = data.tickRate;
    }
    if (typeof data.runInEditor === 'boolean') {
      this.runInEditor = data.runInEditor;
    }
    if (Array.isArray(data.groups)) {
      this.groups = [...data.groups];
    }
    if (data.meta && typeof data.meta === 'object') {
      this.meta = JSON.parse(JSON.stringify(data.meta));
    }

    if (data.script && typeof data.script === 'object' && (data.script.uuid || data.script.path)) {
      this.scriptRef = {
        uuid: data.script.uuid || '',
        ...(data.script.path ? { path: data.script.path } : {}),
        ...(data.script.className ? { className: data.script.className } : {}),
        ...(data.script.extendsType ? { extendsType: data.script.extendsType } : {}),
      };
    }
    if (data.sceneInstance && typeof data.sceneInstance === 'object') {
      this.sceneInstance = {
        sourceSceneUuid: data.sceneInstance.sourceSceneUuid || '',
        sourceScenePath: data.sceneInstance.sourceScenePath || '',
        localOverrides: data.sceneInstance.localOverrides
          ? JSON.parse(JSON.stringify(data.sceneInstance.localOverrides))
          : {},
      };
    }
    if (data.material && typeof data.material === 'object' && typeof data.material.uuid === 'string') {
      this.materialRef = { uuid: data.material.uuid };
    }
    if (data.texture && typeof data.texture === 'object' && typeof data.texture.uuid === 'string') {
      this.textureRef = { uuid: data.texture.uuid };
    }

    this.environment = normalizeSceneEnvironment(data.environment);

    const posSource = data.position || data.transform?.position;
    const rotSource = data.rotation || data.transform?.rotation;
    const quatSource = data.quaternion || data.transform?.quaternion;
    const scaleSource = data.scale || data.transform?.scale;

    if (posSource) {
      this._rawPosition.set(
        Number(posSource.x ?? 0),
        Number(posSource.y ?? 0),
        Number(posSource.z ?? 0)
      );
    }

    if (quatSource && typeof quatSource.w === 'number') {
      this.quaternion.set(
        Number(quatSource.x ?? 0),
        Number(quatSource.y ?? 0),
        Number(quatSource.z ?? 0),
        Number(quatSource.w ?? 1)
      );
      this.rotation.setFromQuaternion(this.quaternion, rotSource?.order || 'XYZ');
    } else if (rotSource) {
      this.rotation.set(
        Number(rotSource.x ?? 0),
        Number(rotSource.y ?? 0),
        Number(rotSource.z ?? 0),
        rotSource.order || 'XYZ'
      );
    }

    if (scaleSource) {
      this.scale.set(
        Number(scaleSource.x ?? 1),
        Number(scaleSource.y ?? 1),
        Number(scaleSource.z ?? 1)
      );
    }

    // Restaura propriedades físicas nativas unificadas
    if (data.physics && typeof data.physics === 'object') {
      const p = data.physics;
      this.enablePhysics(p.physicsMode || p.bodyType || 'dynamic', p);
    }

    // Migra automaticamente qualquer `PhysicsScript` legado (`comp.type === 'Physics'`) para as
    // propriedades físicas nativas do Node e remove o componente legado da lista `components`.
    if (Array.isArray(data.components)) {
      const nonPhysicsComponents = [];
      for (let idx = 0; idx < data.components.length; idx++) {
        const c = data.components[idx];
        if (!c) continue;
        if (c.type === 'Physics') {
          const params = c.params || {};
          if (c.enabled !== false) {
            this.enablePhysics(params.bodyType || 'dynamic', {
              mass: Number(params.mass ?? 1.0),
              gravityY: Number(params.gravityY ?? -9.82),
              restitution: Number(params.restitution ?? 0.35),
              linearDamping: Number(params.linearDamping ?? 0.02),
              floorY: Number(params.floorY ?? 0.5),
              velocity: {
                x: Number(params.velocityX ?? 0),
                y: Number(params.velocityY ?? 0),
                z: Number(params.velocityZ ?? 0),
              },
            });
          }
          continue;
        }
        nonPhysicsComponents.push({
          id: c.id || `comp_${idx}_${Date.now()}`,
          type: c.type || 'Rotator',
          enabled: c.enabled !== false,
          params: { ...(c.params || {}) },
        });
      }
      this.components = nonPhysicsComponents;
    }

    if (Array.isArray(data.scripts)) {
      this.scripts = data.scripts.map((s, idx) => ({
        name: s.name || `Script_${idx + 1}`,
        ...(s.uuid ? { uuid: s.uuid } : this.scriptRef?.uuid && idx === 0 ? { uuid: this.scriptRef.uuid } : {}),
        code: s.code || '',
        enabled: s.enabled !== false,
        exports: s.exports ? { ...s.exports } : {}
      }));
    }

    this.resetScriptState();
    this.updateMatrix();
    this.updateMatrixWorld(true);
    this._onTransformChanged();

    return this;
  }
}

/**
 * Classes Node (Seção 3) e Node3D (Seção 7) mantendo 100% de compatibilidade com EngineNode
 */
export class Node extends EngineNode {
  constructor(name = 'Node') {
    super(name);
    this.nodeType = 'Node';
  }
}

export class Node3D extends Node {
  constructor(name = 'Node3D') {
    super(name);
    this.nodeType = 'Node3D';
  }
}
