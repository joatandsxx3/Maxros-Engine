import { Signal, Input, Save, Audio, Log, Tween, Shake } from './NativeClasses.js';

/**
 * Maxros Engine - SceneTree (Section 4)
 * Gerencia a árvore ativa de execução, grupos, serviços globais, câmeras e timers.
 */
export class SceneTree {
  /**
   * @param {any} [rootNode=null]
   */
  constructor(rootNode = null) {
    this.root = rootNode;
    this.currentScene = rootNode;
    this.currentCamera = null;
    this._paused = false;
    this.timeScale = 1.0;
    this.time = 0;
    this.frame = 0;
    this.isPlaying = false;
    this.isPreview = false;

    this._services = new Map([
      ['Input', Input],
      ['Save', Save],
      ['Audio', Audio],
      ['Log', Log]
    ]);

    this._timers = [];
    this._initialSnapshot = null;
    this._nodeFactory = null;

    // Signals
    this.sceneChanged = new Signal('sceneChanged');
    this.pausedChanged = new Signal('pausedChanged');
    this.nodeAdded = new Signal('nodeAdded');
    this.nodeRemoved = new Signal('nodeRemoved');

    if (rootNode) {
      this.attachRoot(rootNode);
    }
  }

  get paused() {
    return this._paused;
  }

  set paused(val) {
    const next = Boolean(val);
    if (this._paused !== next) {
      this._paused = next;
      this.pausedChanged.emit(next);
    }
  }

  get nodeCount() {
    if (!this.root) return 0;
    let count = 0;
    const visit = (n) => {
      if (!n || n.userData?.isViewportHelper) return;
      count++;
      for (const ch of n.children || []) visit(ch);
    };
    visit(this.root);
    return count;
  }

  registerService(nome, instancia) {
    this._services.set(nome, instancia);
  }

  getService(nome) {
    return this._services.get(nome) || null;
  }

  hasService(nome) {
    return this._services.has(nome);
  }

  setNodeFactory(factoryClass) {
    this._nodeFactory = factoryClass;
  }

  attachRoot(rootNode) {
    this.root = rootNode;
    this.currentScene = rootNode;
    if (rootNode) {
      this._propagateTree(rootNode, true);
    }
  }

  _propagateTree(node, entering = true) {
    if (!node || node.userData?.isViewportHelper) return;
    if (entering) {
      const wasInTree = node.isInsideTree;
      node.tree = this;
      node.isInsideTree = true;
      if (node.type === 'Camera3D' && node.current) {
        this.currentCamera = node;
      }
      if (!wasInTree) {
        if (typeof node._onEnterTreeInternal === 'function') {
          node._onEnterTreeInternal();
        }
        this.nodeAdded.emit(node);
      }
      for (const ch of node.children || []) {
        this._propagateTree(ch, true);
      }
      if (!node.isReady && typeof node._onReadyInternal === 'function') {
        node._onReadyInternal();
      }
    } else {
      for (const ch of node.children || []) {
        this._propagateTree(ch, false);
      }
      if (node.isInsideTree) {
        if (typeof node._onExitTreeInternal === 'function') {
          node._onExitTreeInternal();
        }
        node.isInsideTree = false;
        node.tree = null;
        this.nodeRemoved.emit(node);
      }
    }
  }

  instantiate(cenaDataOrJson) {
    const data = typeof cenaDataOrJson === 'string' ? JSON.parse(cenaDataOrJson) : cenaDataOrJson;
    if (!this._nodeFactory) {
      throw new Error('NodeFactory não configurado na SceneTree');
    }
    return this._nodeFactory.deserialize(data);
  }

  changeScene(novaCenaOuJson) {
    let nextRoot = novaCenaOuJson;
    if (typeof novaCenaOuJson === 'string' || (novaCenaOuJson && !novaCenaOuJson.isEngineNode)) {
      nextRoot = this.instantiate(novaCenaOuJson);
    }
    if (this.root) {
      this._propagateTree(this.root, false);
    }
    this.attachRoot(nextRoot);
    if (nextRoot && typeof nextRoot.serialize === 'function') {
      this._initialSnapshot = nextRoot.serialize();
    }
    this.sceneChanged.emit(nextRoot);
    return nextRoot;
  }

  reloadScene() {
    if (this._initialSnapshot && this._nodeFactory) {
      return this.changeScene(this._initialSnapshot);
    }
    return this.currentScene;
  }

  getNodesInGroup(grupo) {
    const result = [];
    if (!this.root) return result;
    const visit = (n) => {
      if (!n || n.userData?.isViewportHelper) return;
      if (typeof n.isInGroup === 'function' && n.isInGroup(grupo)) {
        result.push(n);
      }
      for (const ch of n.children || []) visit(ch);
    };
    visit(this.root);
    return result;
  }

  callGroup(grupo, metodo, ...args) {
    const nodes = this.getNodesInGroup(grupo);
    for (const n of nodes) {
      if (typeof n[metodo] === 'function') {
        n[metodo](...args);
      } else if (Array.isArray(n.scripts)) {
        for (const s of n.scripts) {
          if (s._instance && typeof s._instance[metodo] === 'function') {
            s._instance[metodo](...args);
          }
        }
      }
    }
  }

  setGroupProperty(grupo, propriedade, valor) {
    const nodes = this.getNodesInGroup(grupo);
    for (const n of nodes) {
      n[propriedade] = valor;
    }
  }

  emitGroup(grupo, sinal, ...args) {
    const nodes = this.getNodesInGroup(grupo);
    for (const n of nodes) {
      if (typeof n.emit === 'function') {
        n.emit(sinal, ...args);
      }
    }
  }

  createTimer(segundos, ignorePause = false) {
    const waitSec = Math.max(0, Number(segundos) || 0);
    if (waitSec === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this._timers.push({
        remaining: waitSec,
        ignorePause,
        resolve
      });
    });
  }

  stop() {
    this.isPlaying = false;
  }

  /**
   * Avança um quadro completo na SceneTree (Timers, Tweens, Shakes, animações, scripts).
   */
  step(rawDeltaSeconds = 1 / 60) {
    const scaledDt = rawDeltaSeconds * this.timeScale;
    if (!this._paused) {
      this.time += scaledDt;
      this.frame += 1;
    }

    // 1. Atualizar Timers da árvore
    const remainingTimers = [];
    for (const t of this._timers) {
      if (this._paused && !t.ignorePause) {
        remainingTimers.push(t);
        continue;
      }
      t.remaining -= scaledDt;
      if (t.remaining <= 0) {
        t.resolve();
      } else {
        remainingTimers.push(t);
      }
    }
    this._timers = remainingTimers;

    // 2. Atualizar Tweens e Shakes globais
    if (!this._paused) {
      Tween.updateAll(scaledDt);
      Shake.updateAll(scaledDt);
    }

    // 3. Coletar nós ativos ordenados por processPriority
    if (this.root) {
      if (!this.root._sceneLifecycleStarted) {
        this.root._sceneLifecycleStarted = true;
      }

      const nodes = [];
      const collect = (n, inheritedPaused = false) => {
        if (!n || n.userData?.isViewportHelper || n.isDestroyed || n.nodeState === 'destroyed') return;
        if (n.nodeState === 'inactive') return;

        const mode = n.processMode || 'inherit';
        if (mode === 'disabled') return;

        let canRun = true;
        const effectivelyPaused = this._paused || n.nodeState === 'paused' || inheritedPaused;

        if (effectivelyPaused) {
          if (mode === 'pausable' || mode === 'inherit') canRun = false;
          else if (mode === 'whenPaused' || mode === 'always') canRun = true;
        } else {
          if (mode === 'whenPaused') canRun = false;
        }

        if (canRun) {
          nodes.push(n);
        }
        for (const ch of n.children || []) {
          collect(ch, effectivelyPaused);
        }
      };
      collect(this.root, this._paused);

      nodes.sort((a, b) => (a.processPriority || 0) - (b.processPriority || 0));

      for (const n of nodes) {
        if (typeof n._runUnifiedUpdatePipeline === 'function') {
          n._runUnifiedUpdatePipeline(scaledDt, null, false);
        } else if (typeof n._stepNodeInternal === 'function') {
          n._stepNodeInternal(scaledDt);
        }
      }

      // Atualiza currentCamera recursivamente (incluindo cenas filhas instanciadas)
      this.currentCamera = SceneTree.findActiveCamera(this.root);
    }

    Input.stepFrame();
  }

  /**
   * Busca recursivamente uma câmera ativa (`Camera3D` / `Camera3DNode`) em toda a hierarquia,
   * incluindo dentro de Cenas Filhas instanciadas (`sceneInstance`).
   * Se não existir câmera na cena, retorna `null` sem lançar erro (Seção 10).
   *
   * @param {any} rootNode
   * @returns {any | null}
   */
  static findActiveCamera(rootNode) {
    if (!rootNode) return null;
    let firstCameraFallback = null;
    let currentMarkedCamera = null;

    const traverse = (n) => {
      if (!n || n.userData?.isViewportHelper || n.isDestroyed) return;
      if (n.nodeType === 'Camera3D' || n.nodeType === 'Camera3DNode' || n.type === 'Camera3D') {
        if (!firstCameraFallback) firstCameraFallback = n;
        if (n.current && !currentMarkedCamera) {
          currentMarkedCamera = n;
        }
      }
      if (Array.isArray(n.children)) {
        for (const ch of n.children) {
          traverse(ch);
        }
      }
    };

    traverse(rootNode);
    return currentMarkedCamera || firstCameraFallback || null;
  }
}
