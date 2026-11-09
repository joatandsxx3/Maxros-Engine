import fs from 'node:fs';
import path from 'node:path';
import { MAXROS_INSTALLATION_ROOT } from './ProjectPathResolver.js';
import { ProjectValidator } from './ProjectValidator.js';

const DEFAULT_RECENT_CONFIG_PATH = path.join(
  MAXROS_INSTALLATION_ROOT,
  '.maxros-engine',
  'recent_projects.json'
);

/**
 * RecentProjects stores and retrieves the real history of projects opened by the user.
 *
 * Architectural Guarantees:
 * - Belongs to the Maxros Engine installation (`.maxros-engine/recent_projects.json`),
 *   never inside individual projects.
 * - Demo projects (`"type": "demo"`) are NOT pre-populated into RecentProjects on install.
 * - Detects when a project directory was moved or deleted (`available: false`) and allows
 *   relocating the project path.
 */
export class RecentProjects {
  /**
   * @param {string | { configFilePath?: string }} [options={}]
   */
  constructor(options = {}) {
    if (typeof options === 'string' && options.trim()) {
      const resolved = path.resolve(options.trim());
      this.configFilePath = resolved.endsWith('.json')
        ? resolved
        : path.join(resolved, 'recent_projects.json');
    } else if (options && typeof options === 'object' && options.configFilePath) {
      this.configFilePath = path.resolve(options.configFilePath);
    } else {
      this.configFilePath = DEFAULT_RECENT_CONFIG_PATH;
    }
  }

  _readRawList() {
    try {
      if (!fs.existsSync(this.configFilePath)) {
        return [];
      }
      const parsed = JSON.parse(fs.readFileSync(this.configFilePath, 'utf8'));
      return Array.isArray(parsed?.recent) ? parsed.recent : [];
    } catch {
      return [];
    }
  }

  _writeRawList(list) {
    const dir = path.dirname(this.configFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      this.configFilePath,
      JSON.stringify(
        {
          engine: 'Maxros Engine',
          updatedAt: new Date().toISOString(),
          recent: list,
        },
        null,
        2
      ),
      'utf8'
    );
  }

  /**
   * Records a project in the recent projects history when opened or created by the user.
   *
   * @param {{ projectPath?: string, path?: string, projectName?: string, name?: string, projectUuid?: string, uuid?: string, engineVersion?: string, type?: string }} entry
   */
  recordOpenedProject(entry) {
    const rawPath = entry?.projectPath || entry?.path;
    if (!entry || !rawPath) return [];
    const absPath = path.resolve(rawPath);
    const projectUuid = entry.projectUuid || entry.uuid || null;
    const projectName = entry.projectName || entry.name || path.basename(absPath);

    const existing = this._readRawList().filter((item) => {
      const itemPath = item.projectPath || item.path;
      const itemUuid = item.projectUuid || item.uuid;
      return (
        (!itemPath || path.resolve(itemPath) !== absPath) &&
        (!projectUuid || itemUuid !== projectUuid)
      );
    });

    const manifestPath = path.join(absPath, 'maxros.project.json');
    const record = {
      uuid: projectUuid,
      projectUuid,
      name: projectName,
      projectName,
      path: absPath,
      projectPath: absPath,
      projectFile: manifestPath,
      manifestPath,
      engineVersion: entry.engineVersion || '1.0.0',
      type: entry.type || 'user',
      lastOpenedAt: new Date().toISOString(),
    };

    const next = [record, ...existing].slice(0, 20);
    this._writeRawList(next);
    return this.getRecentProjects();
  }

  /**
   * Alias for `getRecentProjects()`.
   */
  list() {
    return this.getRecentProjects();
  }

  /**
   * Returns the list of recent projects with real-time availability and validation status.
   */
  getRecentProjects() {
    const rawList = this._readRawList();
    return rawList.map((item) => {
      const targetPath = item.projectPath || item.path;
      const check = ProjectValidator.locateProjectIdentity(targetPath);
      if (!check.valid || !check.projectRoot || !check.manifestPath) {
        return {
          ...item,
          uuid: item.projectUuid || item.uuid || null,
          projectUuid: item.projectUuid || item.uuid || null,
          name: item.projectName || item.name,
          projectName: item.projectName || item.name,
          path: targetPath,
          projectPath: targetPath,
          projectFile: item.manifestPath || item.projectFile,
          manifestPath: item.manifestPath || item.projectFile,
          available: false,
          status: 'missing',
          statusMessage: 'Caminho não disponível (o projeto foi movido ou removido).',
        };
      }

      try {
        const manifest = JSON.parse(fs.readFileSync(check.manifestPath, 'utf8'));
        const resolvedUuid = manifest.uuid || item.projectUuid || item.uuid || null;
        const resolvedName = manifest.name || item.projectName || item.name;
        return {
          ...item,
          uuid: resolvedUuid,
          projectUuid: resolvedUuid,
          name: resolvedName,
          projectName: resolvedName,
          path: check.projectRoot,
          projectPath: check.projectRoot,
          projectFile: check.manifestPath,
          manifestPath: check.manifestPath,
          engineVersion: manifest.engine_version || item.engineVersion || '1.0.0',
          type: manifest.type || item.type || 'user',
          available: true,
          isLegacy: check.isLegacyManifest,
          status: check.isLegacyManifest ? 'legacy' : 'available',
          statusMessage: check.isLegacyManifest
            ? 'Formato legado detectado — elegível para migração'
            : 'Disponível',
        };
      } catch {
        return {
          ...item,
          uuid: item.projectUuid || item.uuid || null,
          projectUuid: item.projectUuid || item.uuid || null,
          name: item.projectName || item.name,
          projectName: item.projectName || item.name,
          path: targetPath,
          projectPath: targetPath,
          available: false,
          status: 'corrupted',
          statusMessage: 'Manifesto do projeto ilegível ou corrompido.',
        };
      }
    });
  }

  /**
   * Updates the stored path of a moved project in the recent projects list.
   *
   * @param {string} oldPathOrUuid
   * @param {string} newTargetPath
   */
  relocateProject(oldPathOrUuid, newTargetPath) {
    const check = ProjectValidator.locateProjectIdentity(newTargetPath);
    if (!check.valid || !check.projectRoot || !check.manifestPath) {
      return {
        success: false,
        error: check.error || 'O novo caminho selecionado não contém um projeto válido.',
      };
    }

    const manifest = JSON.parse(fs.readFileSync(check.manifestPath, 'utf8'));
    const normOld = path.resolve(String(oldPathOrUuid || ''));
    const list = this._readRawList();
    let updated = false;

    const next = list.map((item) => {
      const itemPath = item.projectPath || item.path;
      const itemUuid = item.projectUuid || item.uuid;
      if (
        (itemPath && path.resolve(itemPath) === normOld) ||
        itemUuid === oldPathOrUuid ||
        (manifest.uuid && itemUuid === manifest.uuid)
      ) {
        updated = true;
        const resolvedUuid = manifest.uuid || itemUuid || null;
        const resolvedName = manifest.name || item.projectName || item.name;
        return {
          ...item,
          uuid: resolvedUuid,
          projectUuid: resolvedUuid,
          name: resolvedName,
          projectName: resolvedName,
          path: check.projectRoot,
          projectPath: check.projectRoot,
          projectFile: check.manifestPath,
          manifestPath: check.manifestPath,
          engineVersion: manifest.engine_version || item.engineVersion || '1.0.0',
          lastOpenedAt: new Date().toISOString(),
        };
      }
      return item;
    });

    if (!updated) {
      const resolvedUuid = manifest.uuid || null;
      const resolvedName = manifest.name || path.basename(check.projectRoot);
      next.unshift({
        uuid: resolvedUuid,
        projectUuid: resolvedUuid,
        name: resolvedName,
        projectName: resolvedName,
        path: check.projectRoot,
        projectPath: check.projectRoot,
        projectFile: check.manifestPath,
        manifestPath: check.manifestPath,
        engineVersion: manifest.engine_version || '1.0.0',
        type: manifest.type || 'user',
        lastOpenedAt: new Date().toISOString(),
      });
    }

    this._writeRawList(next);
    const updatedList = this.getRecentProjects();
    return Object.assign(updatedList, {
      success: true,
      list: updatedList,
    });
  }

  removeProject(pathOrUuid) {
    return this.removeRecentProject(pathOrUuid);
  }

  removeRecentProject(pathOrUuid) {
    const norm = path.resolve(String(pathOrUuid || ''));
    const next = this._readRawList().filter((item) => {
      const itemPath = item.projectPath || item.path;
      const itemUuid = item.projectUuid || item.uuid;
      return (!itemPath || path.resolve(itemPath) !== norm) && itemUuid !== pathOrUuid;
    });
    this._writeRawList(next);
    const updatedList = this.getRecentProjects();
    return Object.assign(updatedList, {
      success: true,
      list: updatedList,
    });
  }

  clear() {
    this._writeRawList([]);
  }
}
