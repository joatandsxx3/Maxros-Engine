import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  EngineNode,
  Node,
  Node3D,
} from '../nodes/EngineNode.js';
import { Sprite3DNode } from '../nodes/Sprite3DNode.js';
import { RigidBody3DNode } from '../nodes/RigidBody3DNode.js';
import { CollisionShape3DNode } from '../nodes/CollisionShape3DNode.js';
import {
  Camera3D,
  Light3D,
  DirectionalLight3D,
  PointLight3D,
  SpotLight3D,
  AmbientLight3D,
  HemisphereLight3D,
  Mesh3D,
  Label3D,
  Particles3D,
  Path3D,
  PathFollow3D,
  PickArea3D,
  Timer,
  AudioPlayer,
  AnimationPlayer,
  UILayer,
  Control,
  Panel,
  Label,
  Button,
  CheckBox,
  Slider,
  ProgressBar,
  TextureRect,
  TextInput,
  HBox,
  VBox,
  Grid,
  ScrollContainer,
} from '../nodes/SceneNodes.js';
import {
  Log,
  Signal,
  Easing,
  Tween,
  Rng,
  Shake,
  StateMachine,
  Save,
  Input,
  Material,
  ImageTexture,
  Canvas2D,
  CanvasTexture,
  Curve3D,
  AnimationClip,
  Theme,
  DataResource,
  ResourceRegistry,
  Audio,
  Playlist,
} from '../core/NativeClasses.js';

/**
 * Canonical map of all concrete Node classes available for `export default class X extends <NodeType>`.
 */
export const EXTENDABLE_NODE_CLASSES = Object.freeze({
  EngineNode,
  Node,
  Node3D,
  Mesh3D,
  Camera3D,
  Camera3DNode: Camera3D,
  Light3D,
  DirectionalLight3D,
  PointLight3D,
  SpotLight3D,
  AmbientLight3D,
  HemisphereLight3D,
  Sprite3DNode,
  Sprite3D: Sprite3DNode,
  RigidBody3DNode,
  RigidBody3D: RigidBody3DNode,
  CollisionShape3DNode,
  CollisionShape3D: CollisionShape3DNode,
  Label3D,
  Particles3D,
  Path3D,
  PathFollow3D,
  PickArea3D,
  Timer,
  AudioPlayer,
  AnimationPlayer,
  UILayer,
  Control,
  Panel,
  Label,
  Button,
  CheckBox,
  Slider,
  ProgressBar,
  TextureRect,
  TextInput,
  HBox,
  VBox,
  Grid,
  ScrollContainer,
});

/**
 * Normalizes a node type alias to its canonical class name for compatibility messages.
 * @param {string} typeName
 * @returns {string}
 */
export function normalizeNodeTypeName(typeName) {
  const raw = String(typeName || 'Node3D').trim();
  if (raw === 'Camera3DNode') return 'Camera3D';
  if (raw === 'Sprite3D') return 'Sprite3DNode';
  if (raw === 'RigidBody3D') return 'RigidBody3DNode';
  if (raw === 'CollisionShape3D') return 'CollisionShape3DNode';
  if (raw === 'EngineNode') return 'Node3D';
  return raw;
}

/**
 * Generates a clean, valid JavaScript class identifier from an arbitrary node or file name.
 * @param {string} rawName
 * @returns {string}
 */
export function toValidClassName(rawName) {
  const cleaned = String(rawName || 'CustomNode')
    .replace(/\.script\.js$/i, '')
    .replace(/\.js$/i, '')
    .replace(/^%+/, '')
    .replace(/[^a-zA-Z0-9_]+/g, ' ')
    .trim();

  if (!cleaned) return 'CustomNode';

  const pascal = cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return /^[0-9]/.test(pascal) ? `Node_${pascal}` : pascal;
}

/**
 * Generates the minimal default script template required by Section 5.2:
 * Only `export default class ValidName extends ConcreteNodeType {\n\n}` with no empty lifecycle methods.
 *
 * @param {string} classNameOrNodeName
 * @param {string} concreteNodeType
 * @returns {string}
 */
export function generateMinimalNodeScriptTemplate(classNameOrNodeName, concreteNodeType = 'Node3D') {
  const validClass = toValidClassName(classNameOrNodeName);
  const validBase = EXTENDABLE_NODE_CLASSES[concreteNodeType]
    ? normalizeNodeTypeName(concreteNodeType)
    : 'Node3D';
  return `export default class ${validClass} extends ${validBase} {\n\n}\n`;
}

/**
 * Extracts `class <Name> extends <Base>` metadata from JavaScript source code.
 * @param {string} sourceCode
 * @returns {{ hasExportDefault: boolean, className: string | null, extendsType: string | null, transformedCode: string }}
 */
export function parseScriptClassHeader(sourceCode) {
  const code = String(sourceCode || '');

  // Strip comments only for header inspection while preserving line numbers in transformedCode
  const exportClassRegex =
    /export\s+default\s+class(?:\s+([A-Za-z_$][A-Za-z0-9_$]*))?(?:\s+extends\s+([A-Za-z0-9_$.]+))?\s*\{/;
  const namedDefaultRegex =
    /class\s+([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+extends\s+([A-Za-z0-9_$.]+))?\s*\{/;

  let hasExportDefault = false;
  let className = null;
  let extendsType = null;
  let transformedCode = code;

  const exportMatch = code.match(exportClassRegex);
  if (exportMatch) {
    hasExportDefault = true;
    className = exportMatch[1] || 'AnonymousNodeClass';
    extendsType = exportMatch[2] || null;
    transformedCode = code.replace(
      exportClassRegex,
      `const __ExportedNodeClass = class ${className}${extendsType ? ` extends ${extendsType}` : ''} {`
    );
    transformedCode += '\n;return __ExportedNodeClass;';
  } else {
    const namedMatch = code.match(namedDefaultRegex);
    if (namedMatch && /export\s+default\s+/.test(code)) {
      hasExportDefault = true;
      className = namedMatch[1];
      extendsType = namedMatch[2] || null;
      transformedCode = code.replace(/export\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;?/, 'return $1;');
    } else if (namedMatch) {
      hasExportDefault = true;
      className = namedMatch[1];
      extendsType = namedMatch[2] || null;
      transformedCode = `${code}\n;return ${className};`;
    }
  }

  // Strip static ES import declarations of engine globals since they are injected into scope
  transformedCode = transformedCode.replace(
    /^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm,
    '// [Maxros Engine Scope Import]'
  );

  return {
    hasExportDefault,
    className,
    extendsType,
    transformedCode,
  };
}

/**
 * Extracts line and column numbers from a JavaScript SyntaxError or runtime Error stack.
 * @param {any} error
 * @param {number} [lineOffset=0]
 * @returns {{ line: number | null, column: number | null }}
 */
export function extractErrorLocation(error, lineOffset = 0) {
  const stack = String(error?.stack || error?.message || '');
  // Look for `<anonymous>:line:col` or `Function:line:col` or `eval:line:col`
  const match =
    stack.match(/<anonymous>:(\d+):(\d+)/) ||
    stack.match(/Function:(\d+):(\d+)/) ||
    stack.match(/eval.*?:(\d+):(\d+)/) ||
    stack.match(/:(\d+):(\d+)\)?$/m);

  if (match) {
    const rawLine = parseInt(match[1], 10);
    const rawCol = parseInt(match[2], 10);
    // `new Function(...)` adds 2 wrapper lines at the top in V8
    const adjustedLine = Math.max(1, rawLine - lineOffset);
    return {
      line: Number.isFinite(adjustedLine) ? adjustedLine : 1,
      column: Number.isFinite(rawCol) ? rawCol : 1,
    };
  }
  return { line: 1, column: 1 };
}

/**
 * Global registry and loader for JavaScript Node extension classes (`export default class X extends Node3D`).
 * Works identically in Node.js headless tests and in the Browser editor/runtime.
 */
export class ScriptClassLoader {
  /**
   * Maps script UUID or virtual path -> compiled script descriptor
   * @type {Map<string, {
   *   uuid: string,
   *   path: string,
   *   sourceCode: string,
   *   className: string | null,
   *   extendsType: string | null,
   *   CompiledClass: typeof EngineNode | null,
   *   syntaxError: { file: string, line: number | null, column: number | null, message: string } | null,
   *   updatedAt: number
   * }>}
   */
  static _scriptsByKey = new Map();

  /**
   * Validates the syntax and class structure of a JavaScript file without executing any node instance logic.
   * Distinguishes Syntax Errors from Runtime Errors as required by Section 6.6.
   *
   * @param {string} sourceCode
   * @param {string} [fileName='script.js']
   * @returns {{
   *   valid: boolean,
   *   errorType: 'none' | 'syntax' | 'structure',
   *   file: string,
   *   line: number | null,
   *   column: number | null,
   *   message: string | null,
   *   className: string | null,
   *   extendsType: string | null
   * }}
   */
  static validateSyntax(sourceCode, fileName = 'script.js') {
    const parsed = parseScriptClassHeader(sourceCode);

    try {
      const scopeKeys = [
        ...Object.keys(EXTENDABLE_NODE_CLASSES),
        'THREE',
        'CANNON',
        'Input',
        'Log',
        'Signal',
        'Easing',
        'Tween',
        'Rng',
        'Shake',
        'StateMachine',
        'Save',
        'Material',
        'ImageTexture',
        'Canvas2D',
        'CanvasTexture',
        'Curve3D',
        'AnimationClip',
        'Theme',
        'DataResource',
        'ResourceRegistry',
        'Audio',
        'Playlist',
      ];
      // Compile only (do not invoke) to verify JS syntax
      new Function(...scopeKeys, `"use strict";\n${parsed.transformedCode}`);
    } catch (err) {
      const loc = extractErrorLocation(err, 3);
      return {
        valid: false,
        errorType: 'syntax',
        file: fileName,
        line: loc.line,
        column: loc.column,
        message: err?.message || 'Erro de sintaxe JavaScript',
        className: parsed.className,
        extendsType: parsed.extendsType,
      };
    }

    if (!parsed.hasExportDefault || !parsed.extendsType) {
      return {
        valid: false,
        errorType: 'structure',
        file: fileName,
        line: 1,
        column: 1,
        message: `O script "${fileName}" deve exportar uma classe estendendo um Node da engine (ex.: export default class MeuNode extends Node3D {}).`,
        className: parsed.className,
        extendsType: parsed.extendsType,
      };
    }

    if (!EXTENDABLE_NODE_CLASSES[parsed.extendsType]) {
      return {
        valid: false,
        errorType: 'structure',
        file: fileName,
        line: 1,
        column: 1,
        message: `A classe base "${parsed.extendsType}" em "${fileName}" não é um tipo de Node reconhecido pela Maxros Engine.`,
        className: parsed.className,
        extendsType: parsed.extendsType,
      };
    }

    return {
      valid: true,
      errorType: 'none',
      file: fileName,
      line: null,
      column: null,
      message: null,
      className: parsed.className,
      extendsType: parsed.extendsType,
    };
  }

  /**
   * Compiles a JavaScript class extending a Maxros Engine Node and wraps its lifecycle methods
   * so `update(delta)` integrates seamlessly with the unified physics and lifecycle pipeline.
   *
   * @param {string} sourceCode
   * @param {string} [fileName='script.js']
   */
  static compileScriptClass(sourceCode, fileName = 'script.js') {
    const syntaxCheck = ScriptClassLoader.validateSyntax(sourceCode, fileName);
    if (!syntaxCheck.valid) {
      return {
        valid: false,
        CompiledClass: null,
        className: syntaxCheck.className,
        extendsType: syntaxCheck.extendsType,
        error: syntaxCheck,
      };
    }

    const parsed = parseScriptClassHeader(sourceCode);
    const scopeEntries = [
      ...Object.entries(EXTENDABLE_NODE_CLASSES),
      ['THREE', THREE],
      ['CANNON', CANNON],
      ['Input', Input],
      ['Log', Log],
      ['Signal', Signal],
      ['Easing', Easing],
      ['Tween', Tween],
      ['Rng', Rng],
      ['Shake', Shake],
      ['StateMachine', StateMachine],
      ['Save', Save],
      ['Material', Material],
      ['ImageTexture', ImageTexture],
      ['Canvas2D', Canvas2D],
      ['CanvasTexture', CanvasTexture],
      ['Curve3D', Curve3D],
      ['AnimationClip', AnimationClip],
      ['Theme', Theme],
      ['DataResource', DataResource],
      ['ResourceRegistry', ResourceRegistry],
      ['Audio', Audio],
      ['Playlist', Playlist],
    ];

    const argNames = scopeEntries.map(([k]) => k);
    const argValues = scopeEntries.map(([, v]) => v);

    try {
      const factoryFn = new Function(...argNames, `"use strict";\n${parsed.transformedCode}`);
      const CompiledClass = factoryFn(...argValues);

      if (typeof CompiledClass !== 'function' || !(CompiledClass.prototype instanceof EngineNode)) {
        return {
          valid: false,
          CompiledClass: null,
          className: parsed.className,
          extendsType: parsed.extendsType,
          error: {
            valid: false,
            errorType: 'structure',
            file: fileName,
            line: 1,
            column: 1,
            message: `A classe exportada em "${fileName}" não herda de um Node válido da Maxros Engine.`,
          },
        };
      }

      // Tag the compiled class with metadata
      CompiledClass.__scriptFileName = fileName;
      CompiledClass.__scriptClassName = parsed.className || CompiledClass.name || 'CustomNode';
      CompiledClass.__scriptExtendsType = parsed.extendsType;
      CompiledClass.__scriptSourceCode = sourceCode;

      // Preserve the raw user `update(delta)` method on the prototype and wrap `update(delta)`
      // so direct `node.update(delta)` calls execute the unified lifecycle + physics pipeline once.
      if (
        Object.prototype.hasOwnProperty.call(CompiledClass.prototype, 'update') &&
        !CompiledClass.prototype.update.__isMaxrosWrappedUpdate
      ) {
        const rawUserUpdate = CompiledClass.prototype.update;
        const wrappedUpdate = function (delta = 1 / 60) {
          return this._runUnifiedUpdatePipeline(delta, rawUserUpdate);
        };
        wrappedUpdate.__isMaxrosWrappedUpdate = true;
        wrappedUpdate.__rawUserUpdate = rawUserUpdate;
        CompiledClass.prototype.update = wrappedUpdate;
      }

      return {
        valid: true,
        CompiledClass,
        className: CompiledClass.__scriptClassName,
        extendsType: parsed.extendsType,
        error: null,
      };
    } catch (err) {
      const loc = extractErrorLocation(err, 3);
      return {
        valid: false,
        CompiledClass: null,
        className: parsed.className,
        extendsType: parsed.extendsType,
        error: {
          valid: false,
          errorType: 'syntax',
          file: fileName,
          line: loc.line,
          column: loc.column,
          message: err?.message || 'Falha ao compilar classe do script',
        },
      };
    }
  }

  /**
   * Registers a script in the runtime/editor registry by UUID and/or relative path.
   *
   * @param {object} params
   * @param {string} [params.uuid]
   * @param {string} [params.path]
   * @param {string} params.sourceCode
   */
  static registerScript({ uuid, path: scriptPath, sourceCode }) {
    const fileLabel = scriptPath || uuid || 'script.js';
    const compiled = ScriptClassLoader.compileScriptClass(sourceCode, fileLabel);
    const descriptor = {
      uuid: uuid || '',
      path: scriptPath || '',
      sourceCode: String(sourceCode || ''),
      className: compiled.className,
      extendsType: compiled.extendsType,
      CompiledClass: compiled.CompiledClass,
      syntaxError: compiled.error,
      updatedAt: Date.now(),
    };

    if (uuid) {
      ScriptClassLoader._scriptsByKey.set(uuid, descriptor);
    }
    if (scriptPath) {
      ScriptClassLoader._scriptsByKey.set(scriptPath, descriptor);
      const normalized = scriptPath.replace(/^project:\/\//, '').replace(/^\/+/, '');
      ScriptClassLoader._scriptsByKey.set(normalized, descriptor);
    }

    return descriptor;
  }

  /**
   * Looks up a registered script descriptor by `{ uuid, path }` or string key.
   * @param {any} refOrKey
   */
  static getScriptDescriptor(refOrKey) {
    if (!refOrKey) return null;
    if (typeof refOrKey === 'string') {
      return (
        ScriptClassLoader._scriptsByKey.get(refOrKey) ||
        ScriptClassLoader._scriptsByKey.get(refOrKey.replace(/^project:\/\//, '').replace(/^\/+/, '')) ||
        null
      );
    }
    if (typeof refOrKey === 'object') {
      if (refOrKey.uuid && ScriptClassLoader._scriptsByKey.has(refOrKey.uuid)) {
        return ScriptClassLoader._scriptsByKey.get(refOrKey.uuid);
      }
      if (refOrKey.path) {
        const clean = String(refOrKey.path).replace(/^project:\/\//, '').replace(/^\/+/, '');
        if (ScriptClassLoader._scriptsByKey.has(refOrKey.path)) {
          return ScriptClassLoader._scriptsByKey.get(refOrKey.path);
        }
        if (ScriptClassLoader._scriptsByKey.has(clean)) {
          return ScriptClassLoader._scriptsByKey.get(clean);
        }
      }
    }
    return null;
  }

  /**
   * Validates whether a compiled script class is compatible with a target Node type.
   * Enforces Section 4.2:
   * - If a `Node3D` (or `Mesh3D`, `UILayer`, etc.) receives a script extending an incompatible type,
   *   association/execution is blocked and a clear diagnostic is returned.
   *
   * @param {typeof EngineNode | null} CompiledClass
   * @param {string | EngineNode} targetNodeOrType
   * @param {string} [fileName='script.js']
   * @param {string} [nodeName='Node']
   * @returns {{
   *   compatible: boolean,
   *   file: string,
   *   nodeName: string,
   *   expectedType: string,
   *   foundType: string,
   *   message: string | null
   * }}
   */
  static validateCompatibility(CompiledClass, targetNodeOrType, fileName = 'script.js', nodeName = 'Node') {
    const rawTargetType =
      typeof targetNodeOrType === 'string'
        ? targetNodeOrType
        : targetNodeOrType?.nodeType || targetNodeOrType?.type || 'Node3D';
    const expectedCanon = normalizeNodeTypeName(rawTargetType);
    const ExpectedClass = EXTENDABLE_NODE_CLASSES[expectedCanon] || EXTENDABLE_NODE_CLASSES[rawTargetType] || Node3D;

    if (!CompiledClass || typeof CompiledClass !== 'function') {
      return {
        compatible: false,
        file: fileName,
        nodeName,
        expectedType: expectedCanon,
        foundType: 'Desconhecido',
        message: `O script "${fileName}" não exporta uma classe válida para o Node "${nodeName}" (${expectedCanon}).`,
      };
    }

    const declaredExtends = normalizeNodeTypeName(CompiledClass.__scriptExtendsType || 'Node');
    const DeclaredBaseClass = EXTENDABLE_NODE_CLASSES[declaredExtends] || EngineNode;

    // Compatible if the script extends the exact canonical class of the node
    const isExactMatch = DeclaredBaseClass === ExpectedClass || declaredExtends === expectedCanon;

    if (!isExactMatch) {
      const msg = `Incompatibilidade de tipo no script "${fileName}" associado ao Node "${nodeName}": o Node é do tipo "${expectedCanon}", mas o script estende "${declaredExtends}".`;
      return {
        compatible: false,
        file: fileName,
        nodeName,
        expectedType: expectedCanon,
        foundType: declaredExtends,
        message: msg,
      };
    }

    return {
      compatible: true,
      file: fileName,
      nodeName,
      expectedType: expectedCanon,
      foundType: declaredExtends,
      message: null,
    };
  }

  /**
   * Directly specializes an `EngineNode` instance into its extended JavaScript class
   * (`export default class X extends BaseNodeType`) without creating any separate script attachment object.
   *
   * - Verifies syntax and type compatibility first.
   * - Evaluates field initializers declared on the class (e.g. `speed = 5;`) directly on `node`.
   * - Sets `Object.setPrototypeOf(node, CompiledClass.prototype)` so `node instanceof CompiledClass === true`
   *   and `node instanceof BaseNodeType === true`.
   *
   * @param {EngineNode} node
   * @param {string | { uuid?: string, path?: string, sourceCode?: string, CompiledClass?: any }} scriptSourceOrRef
   * @returns {{ success: boolean, error: string | null, compatibility?: any, syntaxError?: any }}
   */
  static applyScriptClassToNode(node, scriptSourceOrRef) {
    if (!node || !(node instanceof EngineNode)) {
      return { success: false, error: 'Node inválido para associação de classe JavaScript.' };
    }

    let descriptor = null;
    if (typeof scriptSourceOrRef === 'string') {
      const registered = ScriptClassLoader.getScriptDescriptor(scriptSourceOrRef);
      if (registered) {
        descriptor = registered;
      } else {
        const compiled = ScriptClassLoader.compileScriptClass(scriptSourceOrRef, `${node.name}.js`);
        descriptor = {
          uuid: '',
          path: `${node.name}.js`,
          sourceCode: scriptSourceOrRef,
          className: compiled.className,
          extendsType: compiled.extendsType,
          CompiledClass: compiled.CompiledClass,
          syntaxError: compiled.error,
        };
      }
    } else if (scriptSourceOrRef && typeof scriptSourceOrRef === 'object') {
      if (scriptSourceOrRef.CompiledClass) {
        descriptor = scriptSourceOrRef;
      } else if (typeof scriptSourceOrRef.sourceCode === 'string') {
        descriptor = ScriptClassLoader.registerScript({
          uuid: scriptSourceOrRef.uuid,
          path: scriptSourceOrRef.path,
          sourceCode: scriptSourceOrRef.sourceCode,
        });
      } else {
        descriptor = ScriptClassLoader.getScriptDescriptor(scriptSourceOrRef);
      }
    }

    // Preserve the native base prototype on the node so we can always restore it if the script is removed
    const baseTypeName = normalizeNodeTypeName(node.nodeType);
    const BaseNodeClass = EXTENDABLE_NODE_CLASSES[baseTypeName] || EXTENDABLE_NODE_CLASSES[node.nodeType] || EngineNode;
    if (!node._nativeNodePrototype) {
      node._nativeNodePrototype = BaseNodeClass.prototype;
    }

    if (!descriptor) {
      const refLabel =
        typeof scriptSourceOrRef === 'object'
          ? scriptSourceOrRef.path || scriptSourceOrRef.uuid || 'script desconhecido'
          : String(scriptSourceOrRef);
      const errMsg = `Arquivo de script "${refLabel}" ausente ou não localizado para o Node "${node.name}".`;
      node._scriptDiagnostic = {
        status: 'missing',
        file: refLabel,
        message: errMsg,
      };
      Log.error('E201', errMsg);
      return { success: false, error: errMsg };
    }

    if (descriptor.syntaxError || !descriptor.CompiledClass) {
      const syn = descriptor.syntaxError || {
        file: descriptor.path || 'script.js',
        line: 1,
        column: 1,
        message: 'Erro de sintaxe no script.',
      };
      const errMsg = `Erro de sintaxe em "${syn.file}" (linha ${syn.line ?? 1}, col ${syn.column ?? 1}): ${syn.message}`;
      node._scriptDiagnostic = {
        status: 'syntax_error',
        file: syn.file,
        line: syn.line,
        column: syn.column,
        message: errMsg,
      };
      Log.error('E301', errMsg);
      return { success: false, error: errMsg, syntaxError: syn };
    }

    const compat = ScriptClassLoader.validateCompatibility(
      descriptor.CompiledClass,
      node,
      descriptor.path || descriptor.uuid || 'script.js',
      node.name
    );

    if (!compat.compatible) {
      node._scriptDiagnostic = {
        status: 'incompatible',
        file: compat.file,
        expectedType: compat.expectedType,
        foundType: compat.foundType,
        message: compat.message,
      };
      Log.error('E202', compat.message);
      return {
        success: false,
        error: compat.message,
        compatibility: compat,
      };
    }

    const CompiledClass = descriptor.CompiledClass;

    // Reset prototype to native base first before applying new class
    Object.setPrototypeOf(node, node._nativeNodePrototype);

    // Instantiate a temporary blueprint object to capture any ES2022 class field declarations
    // (e.g. `speed = 10; jumpForce = 8;`) and copy only new user-defined own properties onto `node`
    try {
      const baselineKeys = new Set(Object.getOwnPropertyNames(node));
      const blueprint =
        BaseNodeClass === RigidBody3DNode
          ? new CompiledClass({ name: node.name, autoRegister: false })
          : new CompiledClass(node.name);

      for (const key of Object.getOwnPropertyNames(blueprint)) {
        if (!baselineKeys.has(key) && !key.startsWith('_')) {
          node[key] = blueprint[key];
        }
      }
      if (blueprint.body && blueprint.physicsServer) {
        blueprint.physicsServer.unregisterBody(blueprint);
      }
    } catch (ctorErr) {
      const loc = extractErrorLocation(ctorErr, 3);
      const errMsg = `Erro no construtor da classe "${CompiledClass.__scriptClassName}" (${compat.file}:${loc.line}): ${ctorErr.message}`;
      node._scriptDiagnostic = {
        status: 'runtime_error',
        file: compat.file,
        line: loc.line,
        column: loc.column,
        message: errMsg,
      };
      Log.error('E301', errMsg);
      return { success: false, error: errMsg };
    }

    // Directly bind the node's prototype to `CompiledClass.prototype`
    Object.setPrototypeOf(node, CompiledClass.prototype);

    node.scriptRef = {
      uuid: descriptor.uuid || node.scriptRef?.uuid || '',
      path: descriptor.path || node.scriptRef?.path || '',
      className: CompiledClass.__scriptClassName,
      extendsType: compat.foundType,
    };
    node._hasExtendedScriptClass = true;
    node._extendedClassName = CompiledClass.__scriptClassName;
    node._extendedScriptFile = compat.file;
    node._scriptInstanceFaulted = false;
    node._scriptDiagnostic = {
      status: 'valid',
      file: compat.file,
      className: CompiledClass.__scriptClassName,
      extendsType: compat.foundType,
      message: null,
    };

    return {
      success: true,
      error: null,
      compatibility: compat,
    };
  }

  /**
   * Removes the extended JavaScript class from a Node and restores its native prototype.
   * @param {EngineNode} node
   */
  static removeScriptClassFromNode(node) {
    if (!node || !(node instanceof EngineNode)) return;
    if (node._nativeNodePrototype) {
      Object.setPrototypeOf(node, node._nativeNodePrototype);
    }
    node.scriptRef = null;
    node._hasExtendedScriptClass = false;
    node._extendedClassName = null;
    node._extendedScriptFile = null;
    node._scriptDiagnostic = null;
    node._scriptInstanceFaulted = false;
  }

  /**
   * Clears all cached scripts in the loader (useful between isolated test runs).
   */
  static clearRegistry() {
    ScriptClassLoader._scriptsByKey.clear();
  }
}
