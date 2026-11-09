import * as THREE from 'three';

/**
 * Maxros Engine - Native Non-Positional Classes, Services & Resources
 */

// ============================================================================
// 1. LOG & STRUCTURED ENGINE ERROR CODES (E101 - E501)
// ============================================================================
export const ENGINE_ERROR_CODES = {
  E101: 'Nó não encontrado no caminho informado',
  E102: 'Ciclo na árvore de nós (nó adicionado dentro de si mesmo)',
  E103: 'Nome único (%Nome) duplicado na mesma cena',
  E201: 'Recurso não encontrado ou falha ao carregar arquivo',
  E202: 'Formato de arquivo incompatível com o tipo de recurso',
  E301: 'Erro na execução de método do script (com linha e pilha)',
  E302: 'Propriedade exportada com valor de tipo diferente do declarado',
  E401: 'Corpo físico sem CollisionShape3D filho',
  E501: 'Sinal emitido ou conectado sem ter sido declarado no nó'
};

export class Log {
  static _level = 'debug';
  static _entries = [];
  static _groups = [];
  static _listeners = new Set();

  static _levels = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };

  static setLevel(level) {
    if (Log._levels[level] !== undefined) {
      Log._level = level;
    }
  }

  static onEntry(listener) {
    Log._listeners.add(listener);
    return () => Log._listeners.delete(listener);
  }

  static _record(level, message, code = null, tag = null, details = null) {
    if (Log._levels[level] < Log._levels[Log._level]) return null;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      code,
      tag: tag || (Log._groups.length > 0 ? Log._groups.join('/') : null),
      message: code && ENGINE_ERROR_CODES[code]
        ? `[${code}] ${ENGINE_ERROR_CODES[code]} — ${message}`
        : String(message),
      details
    };
    Log._entries.push(entry);
    if (Log._entries.length > 500) {
      Log._entries.shift();
    }
    for (const fn of Log._listeners) {
      try { fn(entry); } catch (_) { /* ignore */ }
    }
    return entry;
  }

  static log(...args) {
    return Log._record('info', args.map(String).join(' '));
  }

  static info(...args) {
    return Log._record('info', args.map(String).join(' '));
  }

  static warn(msgOrCode, ...rest) {
    if (ENGINE_ERROR_CODES[msgOrCode]) {
      return Log._record('warn', rest.map(String).join(' '), msgOrCode);
    }
    return Log._record('warn', [msgOrCode, ...rest].map(String).join(' '));
  }

  static error(msgOrCode, ...rest) {
    if (ENGINE_ERROR_CODES[msgOrCode]) {
      return Log._record('error', rest.map(String).join(' '), msgOrCode);
    }
    return Log._record('error', [msgOrCode, ...rest].map(String).join(' '));
  }

  static debug(...args) {
    return Log._record('debug', args.map(String).join(' '));
  }

  static assert(condicao, mensagem = 'Asserção falhou') {
    if (!condicao) {
      Log._record('error', mensagem, null, 'ASSERT');
      return false;
    }
    return true;
  }

  static tag(etiqueta) {
    return {
      log: (...a) => Log._record('info', a.map(String).join(' '), null, etiqueta),
      info: (...a) => Log._record('info', a.map(String).join(' '), null, etiqueta),
      warn: (...a) => Log._record('warn', a.map(String).join(' '), null, etiqueta),
      error: (...a) => Log._record('error', a.map(String).join(' '), null, etiqueta),
      debug: (...a) => Log._record('debug', a.map(String).join(' '), null, etiqueta)
    };
  }

  static group(titulo) {
    Log._groups.push(titulo);
  }

  static groupEnd() {
    Log._groups.pop();
  }

  static getEntries() {
    return [...Log._entries];
  }

  static clear() {
    Log._entries = [];
  }
}

// ============================================================================
// 2. SIGNAL (PUB/SUB EVENT CHANNEL)
// ============================================================================
export class Signal {
  constructor(name = 'signal') {
    this.name = name;
    this._listeners = [];
  }

  connect(fn, alvo = null) {
    if (typeof fn !== 'function') return () => {};
    const sub = { fn, alvo, once: false };
    this._listeners.push(sub);
    return () => this.disconnect(fn, alvo);
  }

  once(fn, alvo = null) {
    if (typeof fn !== 'function') return () => {};
    const sub = { fn, alvo, once: true };
    this._listeners.push(sub);
    return () => this.disconnect(fn, alvo);
  }

  disconnect(fn, alvo = null) {
    this._listeners = this._listeners.filter(
      (s) => !(s.fn === fn && (alvo === null || s.alvo === alvo))
    );
  }

  emit(...args) {
    const snapshot = [...this._listeners];
    for (const sub of snapshot) {
      if (sub.once) {
        this.disconnect(sub.fn, sub.alvo);
      }
      try {
        if (sub.alvo) {
          sub.fn.apply(sub.alvo, args);
        } else {
          sub.fn(...args);
        }
      } catch (err) {
        Log.error('E301', `Erro em listener do sinal "${this.name}": ${err.message}`);
      }
    }
  }

  waitFor() {
    return new Promise((resolve) => {
      this.once((...args) => resolve(args.length <= 1 ? args[0] : args));
    });
  }
}

// ============================================================================
// 3. EASING FUNCTIONS
// ============================================================================
export const Easing = {
  linear: (t) => t,
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  easeInBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInOutBack: (t) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeInBounce: (t) => 1 - Easing.easeOutBounce(1 - t),
  easeInOutBounce: (t) =>
    t < 0.5 ? (1 - Easing.easeOutBounce(1 - 2 * t)) / 2 : (1 + Easing.easeOutBounce(2 * t - 1)) / 2,
  get(nameOrFn) {
    if (typeof nameOrFn === 'function') return nameOrFn;
    return Easing[nameOrFn] || Easing.linear;
  }
};

// ============================================================================
// 4. TWEEN (PROCEDURAL VALUE INTERPOLATION)
// ============================================================================
export class Tween {
  static _activeTweens = new Set();

  static updateAll(dt) {
    for (const tw of [...Tween._activeTweens]) {
      tw.update(dt);
    }
  }

  static clearAll() {
    Tween._activeTweens.clear();
  }

  constructor(ownerNode = null) {
    this.ownerNode = ownerNode;
    this._steps = [];
    this._currentStepIndex = 0;
    this._mode = 'sequence';
    this._loopsRemaining = 1;
    this._paused = false;
    this._killed = false;
    this._finishedEmitted = false;
    this.finished = new Signal('finished');
    this.stepFinished = new Signal('stepFinished');
    Tween._activeTweens.add(this);
  }

  parallel() {
    this._mode = 'parallel';
    return this;
  }

  sequence() {
    this._mode = 'sequence';
    return this;
  }

  loop(vezes = -1) {
    this._loopsRemaining = vezes;
    return this;
  }

  to(alvo, valoresFinais, duracao = 0.5, easing = 'easeOutQuad') {
    const step = {
      type: 'to',
      alvo,
      valoresFinais: { ...valoresFinais },
      valoresIniciais: null,
      duracao: Math.max(0.0001, Number(duracao)),
      elapsed: 0,
      easingFn: Easing.get(easing),
      done: false
    };
    this._addStep(step);
    return this;
  }

  custom(fn, de = 0, ate = 1, duracao = 0.5, easing = 'linear') {
    const step = {
      type: 'custom',
      fn,
      de: Number(de),
      ate: Number(ate),
      duracao: Math.max(0.0001, Number(duracao)),
      elapsed: 0,
      easingFn: Easing.get(easing),
      done: false
    };
    this._addStep(step);
    return this;
  }

  wait(segundos = 0.5) {
    const step = {
      type: 'wait',
      duracao: Math.max(0, Number(segundos)),
      elapsed: 0,
      done: false
    };
    this._addStep(step);
    return this;
  }

  call(fn) {
    const step = {
      type: 'call',
      fn,
      duracao: 0,
      elapsed: 0,
      done: false
    };
    this._addStep(step);
    return this;
  }

  _addStep(step) {
    if (this._mode === 'parallel' && this._steps.length > 0) {
      this._steps[this._steps.length - 1].push(step);
    } else {
      this._steps.push([step]);
    }
  }

  pause() {
    this._paused = true;
    return this;
  }

  resume() {
    this._paused = false;
    return this;
  }

  kill() {
    this._killed = true;
    Tween._activeTweens.delete(this);
  }

  _resetSteps() {
    this._currentStepIndex = 0;
    for (const group of this._steps) {
      for (const step of group) {
        step.elapsed = 0;
        step.done = false;
        step.valoresIniciais = null;
      }
    }
  }

  update(dt) {
    if (this._killed || this._paused) return;
    if (this.ownerNode && this.ownerNode.isDestroyed) {
      this.kill();
      return;
    }
    if (this._steps.length === 0 || this._currentStepIndex >= this._steps.length) {
      if (!this._finishedEmitted) {
        this._finishedEmitted = true;
        this.finished.emit();
      }
      Tween._activeTweens.delete(this);
      return;
    }

    const group = this._steps[this._currentStepIndex];
    let allDone = true;

    for (const step of group) {
      if (step.done) continue;

      if (step.type === 'call') {
        try { step.fn(); } catch (e) { Log.error('E301', e.message); }
        step.done = true;
        continue;
      }

      if (step.type === 'to' && !step.valoresIniciais) {
        step.valoresIniciais = {};
        for (const key of Object.keys(step.valoresFinais)) {
          const cur = step.alvo[key];
          if (cur && typeof cur === 'object' && 'x' in cur) {
            step.valoresIniciais[key] = { x: cur.x, y: cur.y, z: cur.z ?? 0 };
          } else {
            step.valoresIniciais[key] = Number(cur) || 0;
          }
        }
      }

      step.elapsed += dt;
      const rawT = step.duracao <= 0 ? 1 : Math.min(1, step.elapsed / step.duracao);
      const easedT = step.easingFn ? step.easingFn(rawT) : rawT;

      if (step.type === 'to') {
        for (const [key, endVal] of Object.entries(step.valoresFinais)) {
          const startVal = step.valoresIniciais[key];
          if (startVal && typeof startVal === 'object' && typeof endVal === 'object') {
            const nx = startVal.x + (endVal.x - startVal.x) * easedT;
            const ny = startVal.y + (endVal.y - startVal.y) * easedT;
            const nz = (startVal.z ?? 0) + ((endVal.z ?? 0) - (startVal.z ?? 0)) * easedT;
            if (step.alvo[key] && typeof step.alvo[key].set === 'function') {
              step.alvo[key].set(nx, ny, nz);
            } else {
              step.alvo[key] = { x: nx, y: ny, z: nz };
            }
          } else {
            step.alvo[key] = startVal + (Number(endVal) - startVal) * easedT;
          }
        }
      } else if (step.type === 'custom') {
        const val = step.de + (step.ate - step.de) * easedT;
        step.fn(val);
      }

      if (rawT >= 1) {
        step.done = true;
      } else {
        allDone = false;
      }
    }

    if (allDone) {
      this.stepFinished.emit(this._currentStepIndex);
      this._currentStepIndex++;
      if (this._currentStepIndex >= this._steps.length) {
        if (this._loopsRemaining === -1 || this._loopsRemaining > 1) {
          if (this._loopsRemaining > 1) this._loopsRemaining--;
          this._resetSteps();
        } else {
          this._finishedEmitted = true;
          this.finished.emit();
          Tween._activeTweens.delete(this);
        }
      }
    }
  }
}

// ============================================================================
// 5. RNG (DETERMINISTIC SEEDED PRNG - MULBERRY32)
// ============================================================================
export class Rng {
  constructor(seed = Rng.randomSeed()) {
    this.setState(seed);
  }

  static randomSeed() {
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
  }

  static _hashSeed(seed) {
    if (typeof seed === 'number') return (seed >>> 0) || 1;
    const str = String(seed);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) || 1;
  }

  getState() {
    return this._state >>> 0;
  }

  setState(estado) {
    this._state = Rng._hashSeed(estado);
  }

  next() {
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this._state = this._state >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min, max) {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return Math.floor(this.next() * (hi - lo + 1)) + lo;
  }

  float(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }

  chance(probabilidade = 0.5) {
    return this.next() < Number(probabilidade);
  }

  pick(lista) {
    if (!Array.isArray(lista) || lista.length === 0) return undefined;
    return lista[this.int(0, lista.length - 1)];
  }

  weighted(listaComPesos) {
    if (!Array.isArray(listaComPesos) || listaComPesos.length === 0) return undefined;
    let total = 0;
    for (const entry of listaComPesos) {
      total += Math.max(0, Number(entry.weight ?? entry.peso ?? 1));
    }
    if (total <= 0) return listaComPesos[0].item ?? listaComPesos[0].value;
    let r = this.next() * total;
    for (const entry of listaComPesos) {
      const w = Math.max(0, Number(entry.weight ?? entry.peso ?? 1));
      if (r < w) return entry.item ?? entry.value ?? entry;
      r -= w;
    }
    const last = listaComPesos[listaComPesos.length - 1];
    return last.item ?? last.value ?? last;
  }

  shuffle(lista) {
    const arr = [...lista];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  fork() {
    return new Rng(this.int(1, 0x7fffffff));
  }
}

// ============================================================================
// 6. SHAKE (PROCEDURAL TREMOR RESTORING INITIAL POSE)
// ============================================================================
export class Shake {
  static _activeShakes = new Set();

  static play(no, config = {}) {
    if (!no) return null;
    const instance = new Shake(no, config);
    Shake._activeShakes.add(instance);
    return instance;
  }

  static updateAll(dt) {
    for (const sh of [...Shake._activeShakes]) {
      sh.update(dt);
    }
  }

  constructor(node, config = {}) {
    this.node = node;
    this.strength = config.strength ?? 0.25;
    this.duration = Math.max(0.01, config.duration ?? 0.35);
    this.frequency = config.frequency ?? 25;
    this.decay = config.decay ?? 'linear';
    this.axes = config.axes || { x: 1, y: 1, z: 0 };
    this.rng = new Rng(config.seed ?? Rng.randomSeed());
    this.elapsed = 0;
    this._originPos = node.position ? { x: node.position.x, y: node.position.y, z: node.position.z ?? 0 } : { x: 0, y: 0, z: 0 };
    this._lastOffset = { x: 0, y: 0, z: 0 };
    this.finished = new Signal('finished');
  }

  stop() {
    if (this.node && this.node.position) {
      const p = this.node.position;
      this.node.position = {
        x: p.x - this._lastOffset.x,
        y: p.y - this._lastOffset.y,
        z: (p.z ?? 0) - this._lastOffset.z
      };
    }
    this._lastOffset = { x: 0, y: 0, z: 0 };
    Shake._activeShakes.delete(this);
  }

  update(dt) {
    if (!this.node || this.node.isDestroyed) {
      Shake._activeShakes.delete(this);
      return;
    }
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.stop();
      this.finished.emit();
      return;
    }

    const progress = this.elapsed / this.duration;
    const envelope = this.decay === 'exponential'
      ? Math.pow(1 - progress, 2)
      : 1 - progress;

    const currentAmp = typeof this.strength === 'number'
      ? { x: this.strength, y: this.strength, z: this.strength }
      : { x: this.strength.x ?? 0.2, y: this.strength.y ?? 0.2, z: this.strength.z ?? 0 };

    const ox = (this.rng.float(-1, 1)) * currentAmp.x * (this.axes.x ?? 1) * envelope;
    const oy = (this.rng.float(-1, 1)) * currentAmp.y * (this.axes.y ?? 1) * envelope;
    const oz = (this.rng.float(-1, 1)) * currentAmp.z * (this.axes.z ?? 0) * envelope;

    const p = this.node.position;
    this.node.position = {
      x: (p.x - this._lastOffset.x) + ox,
      y: (p.y - this._lastOffset.y) + oy,
      z: ((p.z ?? 0) - this._lastOffset.z) + oz
    };
    this._lastOffset = { x: ox, y: oy, z: oz };
  }
}

// ============================================================================
// 7. STATE MACHINE (FINITE STATE MACHINE)
// ============================================================================
export class StateMachine {
  constructor(config = {}) {
    this.states = config.states || {};
    this.current = null;
    this.previous = null;
    this.history = [];
    this.stateChanged = new Signal('stateChanged');

    if (config.initial && this.states[config.initial]) {
      this.go(config.initial);
    }
  }

  can(novoEstado) {
    if (!this.states[novoEstado]) return false;
    if (!this.current) return true;
    const curDef = this.states[this.current];
    if (curDef && Array.isArray(curDef.allowedTransitions)) {
      return curDef.allowedTransitions.includes(novoEstado);
    }
    return true;
  }

  go(novoEstado, dados = undefined) {
    if (!this.can(novoEstado)) return false;
    const de = this.current;
    if (de && this.states[de] && typeof this.states[de].exit === 'function') {
      this.states[de].exit(novoEstado, dados);
    }
    this.previous = de;
    this.current = novoEstado;
    this.history.push(novoEstado);
    if (this.history.length > 50) this.history.shift();

    const paraDef = this.states[novoEstado];
    if (paraDef && typeof paraDef.enter === 'function') {
      paraDef.enter(dados, de);
    }
    this.stateChanged.emit(de, novoEstado, dados);
    return true;
  }

  update(dt) {
    if (this.current && this.states[this.current] && typeof this.states[this.current].update === 'function') {
      this.states[this.current].update(dt);
    }
  }
}

// ============================================================================
// 8. SAVE (VERSIONED PERSISTENCE SERVICE)
// ============================================================================
export class Save {
  static _memoryStore = new Map();
  static namespace = 'maxros_game';
  static currentSlot = 'slot_1';
  static version = 1;
  static _migrations = new Map();

  static _key(chave) {
    return `${Save.namespace}:${Save.currentSlot}:${chave}`;
  }

  static slot(nomeDoSlot) {
    Save.currentSlot = String(nomeDoSlot || 'slot_1');
    return Save;
  }

  static set(chave, valor) {
    const payload = JSON.stringify({ _v: Save.version, value: valor });
    const fullKey = Save._key(chave);
    Save._memoryStore.set(fullKey, payload);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(fullKey, payload); } catch (_) { /* ignore */ }
    }
  }

  static get(chave, valorPadrao = null) {
    const fullKey = Save._key(chave);
    let raw = Save._memoryStore.get(fullKey);
    if (raw === undefined && typeof localStorage !== 'undefined') {
      try { raw = localStorage.getItem(fullKey) ?? undefined; } catch (_) { /* ignore */ }
    }
    if (raw === undefined) return valorPadrao;
    try {
      const parsed = JSON.parse(raw);
      let data = parsed.value;
      let v = parsed._v ?? 1;
      while (v < Save.version && Save._migrations.has(v)) {
        data = Save._migrations.get(v)(data);
        v++;
      }
      return data;
    } catch (_) {
      return valorPadrao;
    }
  }

  static has(chave) {
    const fullKey = Save._key(chave);
    if (Save._memoryStore.has(fullKey)) return true;
    if (typeof localStorage !== 'undefined') {
      try { return localStorage.getItem(fullKey) !== null; } catch (_) { /* ignore */ }
    }
    return false;
  }

  static remove(chave) {
    const fullKey = Save._key(chave);
    Save._memoryStore.delete(fullKey);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(fullKey); } catch (_) { /* ignore */ }
    }
  }

  static clear() {
    const prefix = `${Save.namespace}:${Save.currentSlot}:`;
    for (const k of [...Save._memoryStore.keys()]) {
      if (k.startsWith(prefix)) Save._memoryStore.delete(k);
    }
  }

  static migrate(versaoAntiga, fn) {
    Save._migrations.set(Number(versaoAntiga), fn);
  }
}

// ============================================================================
// 9. INPUT (UNIFIED INPUT SERVICE — Section 9 of Integrated Spec)
// ============================================================================
export class Input {
  static _pressedKeys = new Set();
  static _justPressedKeys = new Set();
  static _justReleasedKeys = new Set();
  static _heldKeys = new Set();
  static _editorFocusBlocked = false;
  static _actions = new Map([
    ['move_up', ['KeyW', 'ArrowUp', 'w', 'W']],
    ['move_down', ['KeyS', 'ArrowDown', 's', 'S']],
    ['move_left', ['KeyA', 'ArrowLeft', 'a', 'A']],
    ['move_right', ['KeyD', 'ArrowRight', 'd', 'D']],
    ['jump', ['Space', ' ', 'KeyW', 'ArrowUp']],
    ['action', ['Space', ' ', 'Enter']]
  ]);
  static _pointer = { x: 0, y: 0, down: false, justPressed: false, justReleased: false };

  /**
   * Blocks or unblocks game input when the user is typing in editor text inputs, menus, or the Script Editor.
   * @param {boolean} blocked
   */
  static setEditorFocusBlocked(blocked) {
    Input._editorFocusBlocked = Boolean(blocked);
    if (Input._editorFocusBlocked) {
      Input._pressedKeys.clear();
      Input._justPressedKeys.clear();
      Input._justReleasedKeys.clear();
      Input._heldKeys.clear();
    }
  }

  static isEditorFocusBlocked() {
    return Input._editorFocusBlocked;
  }

  static bindAction(nome, listaDeTeclas) {
    Input._actions.set(nome, Array.isArray(listaDeTeclas) ? listaDeTeclas : [listaDeTeclas]);
  }

  static _resolveKeys(acaoOuTecla) {
    if (Input._actions.has(acaoOuTecla)) {
      return Input._actions.get(acaoOuTecla);
    }
    return [acaoOuTecla];
  }

  static _resolveActionForKey(codeOrKey) {
    for (const [actionName, keys] of Input._actions.entries()) {
      if (keys.includes(codeOrKey)) return actionName;
    }
    return null;
  }

  /**
   * Returns the current state of an action or key: `'pressed'`, `'held'`, `'released'`, or `'idle'`.
   * @param {string} acaoOuTecla
   * @returns {'pressed' | 'held' | 'released' | 'idle'}
   */
  static getState(acaoOuTecla) {
    if (Input._editorFocusBlocked) return 'idle';
    const keys = Input._resolveKeys(acaoOuTecla);
    if (keys.some((k) => Input._justPressedKeys.has(k))) return 'pressed';
    if (keys.some((k) => Input._heldKeys.has(k) || Input._pressedKeys.has(k))) return 'held';
    if (keys.some((k) => Input._justReleasedKeys.has(k))) return 'released';
    return 'idle';
  }

  static isPressed(acaoOuTecla) {
    if (Input._editorFocusBlocked) return false;
    return Input._resolveKeys(acaoOuTecla).some((k) => Input._pressedKeys.has(k));
  }

  static isHeld(acaoOuTecla) {
    if (Input._editorFocusBlocked) return false;
    return Input._resolveKeys(acaoOuTecla).some(
      (k) => Input._heldKeys.has(k) || (Input._pressedKeys.has(k) && !Input._justPressedKeys.has(k))
    );
  }

  static isJustPressed(acaoOuTecla) {
    if (Input._editorFocusBlocked) return false;
    return Input._resolveKeys(acaoOuTecla).some((k) => Input._justPressedKeys.has(k));
  }

  static isJustReleased(acaoOuTecla) {
    if (Input._editorFocusBlocked) return false;
    return Input._resolveKeys(acaoOuTecla).some((k) => Input._justReleasedKeys.has(k));
  }

  // Snake_case methods required by Section 9.2 of the specification:
  static is_action_pressed(acaoOuTecla) {
    return Input.isPressed(acaoOuTecla);
  }

  static is_action_just_pressed(acaoOuTecla) {
    return Input.isJustPressed(acaoOuTecla);
  }

  static is_action_just_released(acaoOuTecla) {
    return Input.isJustReleased(acaoOuTecla);
  }

  static is_action_held(acaoOuTecla) {
    return Input.isHeld(acaoOuTecla);
  }

  static getPointer() {
    if (Input._editorFocusBlocked) {
      return { x: Input._pointer.x, y: Input._pointer.y, down: false, justPressed: false, justReleased: false };
    }
    return { ...Input._pointer };
  }

  /**
   * Creates a normalized InputEvent object with `consume()` support.
   * @param {Record<string, any>} rawEvent
   */
  static createEvent(rawEvent = {}) {
    const key = rawEvent.code || rawEvent.key || '';
    const state =
      rawEvent.state ||
      (rawEvent.type === 'keyup' || rawEvent.type === 'released'
        ? 'released'
        : rawEvent.repeat
        ? 'held'
        : 'pressed');
    const action = rawEvent.action || Input._resolveActionForKey(key);

    return {
      type: rawEvent.type || 'key',
      key: rawEvent.key || key,
      code: rawEvent.code || key,
      action,
      state, // 'pressed' | 'released' | 'held'
      button: rawEvent.button ?? 0,
      x: rawEvent.x ?? Input._pointer.x,
      y: rawEvent.y ?? Input._pointer.y,
      consumed: false,
      consume() {
        this.consumed = true;
      },
      isActionPressed(targetAction) {
        return (state === 'pressed' || state === 'held') && (action === targetAction || Input._resolveKeys(targetAction).includes(key));
      },
      isActionJustPressed(targetAction) {
        return state === 'pressed' && (action === targetAction || Input._resolveKeys(targetAction).includes(key));
      },
      isActionReleased(targetAction) {
        return state === 'released' && (action === targetAction || Input._resolveKeys(targetAction).includes(key));
      },
    };
  }

  static feedKeyDown(codeOrKey) {
    if (Input._editorFocusBlocked) return null;
    const alreadyDown = Input._pressedKeys.has(codeOrKey);
    if (!alreadyDown) {
      Input._justPressedKeys.add(codeOrKey);
    } else {
      Input._heldKeys.add(codeOrKey);
    }
    Input._pressedKeys.add(codeOrKey);
    return Input.createEvent({
      type: 'keydown',
      key: codeOrKey,
      code: codeOrKey,
      state: alreadyDown ? 'held' : 'pressed',
    });
  }

  static feedKeyUp(codeOrKey) {
    if (Input._editorFocusBlocked) return null;
    Input._pressedKeys.delete(codeOrKey);
    Input._heldKeys.delete(codeOrKey);
    Input._justReleasedKeys.add(codeOrKey);
    return Input.createEvent({
      type: 'keyup',
      key: codeOrKey,
      code: codeOrKey,
      state: 'released',
    });
  }

  static feedPointer(x, y, down) {
    if (Input._editorFocusBlocked) return;
    if (down && !Input._pointer.down) Input._pointer.justPressed = true;
    if (!down && Input._pointer.down) Input._pointer.justReleased = true;
    Input._pointer.x = x;
    Input._pointer.y = y;
    Input._pointer.down = down;
  }

  /**
   * Distributes an input event to all active, non-paused nodes in the scene tree,
   * stopping immediately if a node consumes the event via `event.consume()` (or returns `true`).
   *
   * @param {any} rootNode
   * @param {Record<string, any>} rawOrEvent
   * @returns {Record<string, any> | null}
   */
  static dispatchEventToTree(rootNode, rawOrEvent) {
    if (!rootNode || Input._editorFocusBlocked) return null;
    const evt =
      rawOrEvent && typeof rawOrEvent.consume === 'function'
        ? rawOrEvent
        : Input.createEvent(rawOrEvent || {});

    if (typeof rootNode.dispatchInput === 'function') {
      rootNode.dispatchInput(evt);
    }
    return evt;
  }

  static stepFrame() {
    for (const k of Input._justPressedKeys) {
      if (Input._pressedKeys.has(k)) {
        Input._heldKeys.add(k);
      }
    }
    Input._justPressedKeys.clear();
    Input._justReleasedKeys.clear();
    Input._pointer.justPressed = false;
    Input._pointer.justReleased = false;
  }

  static reset() {
    Input._pressedKeys.clear();
    Input._justPressedKeys.clear();
    Input._justReleasedKeys.clear();
    Input._heldKeys.clear();
    Input._editorFocusBlocked = false;
    Input._pointer = { x: 0, y: 0, down: false, justPressed: false, justReleased: false };
  }
}

// ============================================================================
// 10. RESOURCES: MATERIAL, TEXTURES, CANVAS2D, CURVE3D, ANIMATIONCLIP, THEME, DATA
// ============================================================================
export class Material {
  constructor(config = {}) {
    this.type = config.type || 'standard';
    this.color = config.color || '#ffffff';
    this.roughness = config.roughness ?? 0.35;
    this.metalness = config.metalness ?? 0.15;
    this.emissive = config.emissive || '#000000';
    this.emissiveIntensity = config.emissiveIntensity ?? 0;
    this.opacity = config.opacity ?? 1;
    this.transparent = config.transparent ?? (this.opacity < 1);
    this.wireframe = Boolean(config.wireframe);
    this.side = config.side || 'front';
    this.blending = config.blending || 'normal';
    this.map = config.map || null;
  }

  toThreeMaterial() {
    const sideMap = {
      front: THREE.FrontSide,
      back: THREE.BackSide,
      double: THREE.DoubleSide
    };
    const common = {
      color: new THREE.Color(this.color),
      opacity: this.opacity,
      transparent: this.transparent || this.opacity < 1,
      wireframe: this.wireframe,
      side: sideMap[this.side] || THREE.FrontSide
    };
    if (this.type === 'unlit') {
      return new THREE.MeshBasicMaterial(common);
    }
    if (this.type === 'phong') {
      return new THREE.MeshPhongMaterial({
        ...common,
        emissive: new THREE.Color(this.emissive),
        emissiveIntensity: this.emissiveIntensity
      });
    }
    return new THREE.MeshStandardMaterial({
      ...common,
      roughness: this.roughness,
      metalness: this.metalness,
      emissive: new THREE.Color(this.emissive),
      emissiveIntensity: this.emissiveIntensity
    });
  }

  serialize() {
    return {
      type: this.type,
      color: this.color,
      roughness: this.roughness,
      metalness: this.metalness,
      emissive: this.emissive,
      emissiveIntensity: this.emissiveIntensity,
      opacity: this.opacity,
      transparent: this.transparent,
      wireframe: this.wireframe,
      side: this.side,
      blending: this.blending
    };
  }
}

export class ImageTexture {
  constructor(config = {}) {
    this.source = config.source || '';
    this.filter = config.filter || 'linear';
    this.wrap = config.wrap || 'clamp';
    this.repeat = config.repeat || { x: 1, y: 1 };
    this.offset = config.offset || { x: 0, y: 0 };
    this.flipY = config.flipY ?? true;
  }
}

export class Canvas2D {
  constructor(width = 256, height = 256) {
    this.width = width;
    this.height = height;
    this.commands = [];
  }

  clear(cor = 'transparent') {
    this.commands = [{ op: 'clear', cor }];
    return this;
  }

  rect(x, y, l, a, estilo = {}) {
    this.commands.push({ op: 'rect', x, y, l, a, estilo });
    return this;
  }

  roundRect(x, y, l, a, r = 4, estilo = {}) {
    this.commands.push({ op: 'roundRect', x, y, l, a, r, estilo });
    return this;
  }

  circle(x, y, r, estilo = {}) {
    this.commands.push({ op: 'circle', x, y, r, estilo });
    return this;
  }

  line(x1, y1, x2, y2, estilo = {}) {
    this.commands.push({ op: 'line', x1, y1, x2, y2, estilo });
    return this;
  }

  polygon(pontos, estilo = {}) {
    this.commands.push({ op: 'polygon', pontos, estilo });
    return this;
  }

  text(str, x, y, estilo = {}) {
    this.commands.push({ op: 'text', str, x, y, estilo });
    return this;
  }

  image(fonte, x, y, l, a) {
    this.commands.push({ op: 'image', fonte, x, y, l, a });
    return this;
  }

  withTransform(pos, rot, esc, fn) {
    this.commands.push({ op: 'save', pos, rot, esc });
    fn(this);
    this.commands.push({ op: 'restore' });
    return this;
  }
}

export class CanvasTexture {
  constructor(width = 256, height = 256) {
    this.width = width;
    this.height = height;
    this.canvas = new Canvas2D(width, height);
    this.dirty = true;
  }

  draw(fn) {
    fn(this.canvas);
    this.dirty = true;
  }

  clear(cor = 'transparent') {
    this.canvas.clear(cor);
    this.dirty = true;
  }
}

export class Curve3D {
  constructor(points = []) {
    this.points = points.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 }));
  }

  sample(t) {
    if (this.points.length === 0) return { x: 0, y: 0, z: 0 };
    if (this.points.length === 1) return { ...this.points[0] };
    const clamped = Math.max(0, Math.min(1, Number(t) || 0));
    const totalSegments = this.points.length - 1;
    const scaled = clamped * totalSegments;
    const idx = Math.min(totalSegments - 1, Math.floor(scaled));
    const frac = scaled - idx;
    const a = this.points[idx];
    const b = this.points[idx + 1];
    return {
      x: a.x + (b.x - a.x) * frac,
      y: a.y + (b.y - a.y) * frac,
      z: a.z + (b.z - a.z) * frac
    };
  }

  sampleTangent(t) {
    const eps = 0.01;
    const p1 = this.sample(Math.max(0, t - eps));
    const p2 = this.sample(Math.min(1, t + eps));
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / len, y: dy / len, z: dz / len };
  }

  serialize() {
    return this.points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  }
}

export class AnimationClip {
  constructor(config = {}) {
    this.name = config.name || 'default';
    this.length = Math.max(0.01, Number(config.length ?? 1.0));
    this.loop = Boolean(config.loop ?? false);
    this.tracks = Array.isArray(config.tracks) ? config.tracks : [];
  }

  serialize() {
    return {
      name: this.name,
      length: this.length,
      loop: this.loop,
      tracks: JSON.parse(JSON.stringify(this.tracks))
    };
  }
}

export class Theme {
  constructor(config = {}) {
    this.fontFamily = config.fontFamily || 'Inter, system-ui, sans-serif';
    this.fontSize = config.fontSize || 14;
    this.colors = {
      primary: '#10b981',
      background: 'rgba(15, 23, 42, 0.85)',
      text: '#f8fafc',
      border: 'rgba(148, 163, 184, 0.25)',
      ...(config.colors || {})
    };
  }
}

export class DataResource {
  constructor(schema = {}, values = {}) {
    this.schema = schema;
    this.values = { ...values };
  }

  validate() {
    for (const [key, expectedType] of Object.entries(this.schema)) {
      if (this.values[key] !== undefined && typeof this.values[key] !== expectedType) {
        Log.error('E302', `Campo "${key}" esperava ${expectedType}, recebeu ${typeof this.values[key]}`);
        return false;
      }
    }
    return true;
  }
}

export class ResourceRegistry {
  static _cache = new Map();

  static register(path, resource) {
    ResourceRegistry._cache.set(path, resource);
    return resource;
  }

  static get(path) {
    if (!ResourceRegistry._cache.has(path)) {
      Log.error('E201', `Recurso não encontrado: ${path}`);
      return null;
    }
    return ResourceRegistry._cache.get(path);
  }

  static has(path) {
    return ResourceRegistry._cache.has(path);
  }

  static clear() {
    ResourceRegistry._cache.clear();
  }
}

// ============================================================================
// 11. AUDIO SERVICE & PLAYLIST
// ============================================================================
export class Audio {
  static buses = {
    master: { volume: 1, muted: false },
    music: { volume: 0.8, muted: false },
    sfx: { volume: 1, muted: false },
    ui: { volume: 0.9, muted: false }
  };

  static setBusVolume(bus, vol) {
    if (Audio.buses[bus]) Audio.buses[bus].volume = Math.max(0, Math.min(1, Number(vol)));
  }

  static setBusMuted(bus, muted) {
    if (Audio.buses[bus]) Audio.buses[bus].muted = Boolean(muted);
  }
}

export class Playlist {
  constructor(tracks = [], mode = 'sequential') {
    this.tracks = [...tracks];
    this.mode = mode; // 'sequential' | 'shuffle' | 'repeatOne'
    this.currentIndex = 0;
  }

  next(rng = new Rng()) {
    if (this.tracks.length === 0) return null;
    if (this.mode === 'repeatOne') return this.tracks[this.currentIndex];
    if (this.mode === 'shuffle') {
      this.currentIndex = rng.int(0, this.tracks.length - 1);
      return this.tracks[this.currentIndex];
    }
    this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
    return this.tracks[this.currentIndex];
  }
}
