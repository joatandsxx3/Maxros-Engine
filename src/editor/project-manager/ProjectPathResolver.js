import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Root directory of the Maxros Engine installation (resolved relative to this module,
 * never depending on an arbitrary process.cwd()).
 */
export const MAXROS_INSTALLATION_ROOT = path.resolve(__dirname, '../../..');
export const DEFAULT_PROJECTS_DIR = path.join(MAXROS_INSTALLATION_ROOT, 'projects');
export const ENGINE_INTERNAL_RESOURCES_DIR = path.join(MAXROS_INSTALLATION_ROOT, 'src', 'engine');
export const USER_PERSISTENT_DATA_DIR = path.join(MAXROS_INSTALLATION_ROOT, '.maxros-engine', 'user_data');
export const MAXROS_MANIFEST_FILENAME = 'maxros.project.json';

/**
 * ProjectPathResolver centralizes virtual path resolution for Maxros Engine:
 * - `project://` -> Exclusively points to the physical root of the currently open project
 *                   (where `maxros.project.json` resides). Never points to MAXROS_INSTALLATION_ROOT
 *                   or DEFAULT_PROJECTS_DIR.
 * - `engine://`  -> Points to internal resources distributed with Maxros Engine.
 * - `user://`    -> Points to the persistent user data directory (saves, settings).
 */
export class ProjectPathResolver {
  /**
   * @param {string | { projectRoot?: string, engineRoot?: string, userRoot?: string }} [options={}]
   */
  constructor(options = {}) {
    const opts = typeof options === 'string' ? { projectRoot: options } : options || {};
    this._projectRoot = opts.projectRoot ? path.resolve(opts.projectRoot) : null;
    this._engineRoot = opts.engineRoot
      ? path.resolve(opts.engineRoot)
      : ENGINE_INTERNAL_RESOURCES_DIR;
    this._userRoot = opts.userRoot
      ? path.resolve(opts.userRoot)
      : USER_PERSISTENT_DATA_DIR;
  }

  /**
   * Updates the active `project://` root when a project is created, opened, or switched.
   * Rejects setting `project://` to the Maxros Engine installation root or the general `projects/` root.
   *
   * @param {string | null} projectRootPath
   */
  setProjectRoot(projectRootPath) {
    if (!projectRootPath) {
      this._projectRoot = null;
      return null;
    }

    const resolved = path.resolve(projectRootPath);
    if (resolved === MAXROS_INSTALLATION_ROOT) {
      throw new Error(
        'Invalid project root: project:// cannot point to the Maxros Engine installation root.'
      );
    }
    if (resolved === DEFAULT_PROJECTS_DIR) {
      throw new Error(
        'Invalid project root: project:// cannot point to the general projects/ container directory.'
      );
    }

    this._projectRoot = resolved;
    return this._projectRoot;
  }

  clearProjectRoot() {
    this._projectRoot = null;
  }

  getProjectRoot() {
    return this._projectRoot;
  }

  getEngineRoot() {
    return this._engineRoot;
  }

  getUserRoot() {
    if (!fs.existsSync(this._userRoot)) {
      fs.mkdirSync(this._userRoot, { recursive: true });
    }
    return this._userRoot;
  }

  /**
   * Checks whether `targetPath` is strictly inside `baseRoot` (preventing `..` traversal escapes).
   *
   * @param {string} targetPath
   * @param {string} baseRoot
   * @returns {boolean}
   */
  static isPathInsideRoot(targetPath, baseRoot) {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedBase = path.resolve(baseRoot);
    if (resolvedTarget === resolvedBase) return true;
    const relative = path.relative(resolvedBase, resolvedTarget);
    return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  }

  /**
   * Resolves a virtual URI (`project://`, `engine://`, `user://`) or a project-relative path
   * into an absolute filesystem path, enforcing root boundaries.
   *
   * @param {string} uriOrRelativePath
   * @returns {string}
   */
  resolve(uriOrRelativePath) {
    if (typeof uriOrRelativePath !== 'string' || !uriOrRelativePath.trim()) {
      throw new Error('ProjectPathResolver.resolve requires a non-empty path string.');
    }

    const raw = uriOrRelativePath.trim().replace(/\\/g, '/');

    if (raw.startsWith('project://')) {
      if (!this._projectRoot) {
        throw new Error('Cannot resolve "project://": no active project is currently open.');
      }
      const subPath = raw.slice('project://'.length).replace(/^\/+/, '');
      const resolved = path.resolve(this._projectRoot, subPath);
      if (!ProjectPathResolver.isPathInsideRoot(resolved, this._projectRoot)) {
        throw new Error(`Acesso negado (Security error): path "${raw}" escapes the active project:// root.`);
      }
      return resolved;
    }

    if (raw.startsWith('engine://')) {
      const subPath = raw.slice('engine://'.length).replace(/^\/+/, '');
      const resolved = path.resolve(this._engineRoot, subPath);
      if (!ProjectPathResolver.isPathInsideRoot(resolved, this._engineRoot)) {
        throw new Error(`Acesso negado (Security error): path "${raw}" escapes the engine:// root.`);
      }
      return resolved;
    }

    if (raw.startsWith('user://')) {
      const userRoot = this.getUserRoot();
      const subPath = raw.slice('user://'.length).replace(/^\/+/, '');
      const resolved = path.resolve(userRoot, subPath);
      if (!ProjectPathResolver.isPathInsideRoot(resolved, userRoot)) {
        throw new Error(`Acesso negado (Security error): path "${raw}" escapes the user:// root.`);
      }
      return resolved;
    }

    // Legacy `res://` compatibility mapped safely to `project://`
    if (raw.startsWith('res://')) {
      if (!this._projectRoot) {
        throw new Error('Cannot resolve legacy "res://": no active project is currently open.');
      }
      const subPath = raw.slice('res://'.length).replace(/^\/+/, '');
      const resolved = path.resolve(this._projectRoot, subPath);
      if (!ProjectPathResolver.isPathInsideRoot(resolved, this._projectRoot)) {
        throw new Error(`Acesso negado (Security error): path "${raw}" escapes the active project:// root.`);
      }
      return resolved;
    }

    if (!this._projectRoot) {
      throw new Error(`Cannot resolve relative path "${raw}": no active project is open.`);
    }

    const resolved = path.resolve(this._projectRoot, raw);
    if (!ProjectPathResolver.isPathInsideRoot(resolved, this._projectRoot)) {
      throw new Error(`Acesso negado (Security error): relative path "${raw}" escapes the active project:// root.`);
    }
    return resolved;
  }

  /**
   * Alias for `resolve(uriOrRelativePath)`.
   * @param {string} uriOrRelativePath
   * @returns {string}
   */
  resolvePath(uriOrRelativePath) {
    return this.resolve(uriOrRelativePath);
  }

  /**
   * Converts an absolute path inside the active project into a normalized relative path
   * (e.g. `scenes/main.scene.json`).
   *
   * @param {string} absOrRelPath
   * @returns {string}
   */
  toProjectRelative(absOrRelPath) {
    if (!this._projectRoot) {
      throw new Error('No active project root configured.');
    }
    const abs = absOrRelPath.startsWith('project://')
      ? this.resolve(absOrRelPath)
      : path.resolve(this._projectRoot, absOrRelPath);
    if (!ProjectPathResolver.isPathInsideRoot(abs, this._projectRoot)) {
      throw new Error(`Path "${absOrRelPath}" is outside the active project root.`);
    }
    return path.relative(this._projectRoot, abs).replace(/\\/g, '/');
  }

  /**
   * Formats a path inside the active project as `project://<relative>`.
   *
   * @param {string} absOrRelPath
   * @returns {string}
   */
  toProjectUri(absOrRelPath) {
    const rel = this.toProjectRelative(absOrRelPath);
    return rel ? `project://${rel}` : 'project://';
  }
}

export const globalPathResolver = new ProjectPathResolver();
