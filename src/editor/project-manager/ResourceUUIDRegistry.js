import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Directories excluded from receiving `.uuid` sidecars (Refinement #1).
 */
const EXCLUDED_TOP_DIRS = new Set(['core', '.maxros', '.core3d', 'node_modules', '.git']);

/**
 * Root-level project manifest files excluded from receiving `.uuid` sidecars
 * because `maxros.project.json` stores its own `uuid` internally.
 */
const EXCLUDED_MANIFEST_FILES = new Set([
  'maxros.project.json',
  'project.maxros',
  'project.core3d',
  'package.json',
  'package-lock.json',
]);

/**
 * Resource extensions eligible for `.uuid` sidecar identification.
 */
const ELIGIBLE_RESOURCE_EXTENSIONS = [
  '.scene.json',
  '.script.js',
  '.material.json',
  '.input.json',
  '.scene',
  '.glb',
  '.gltf',
  '.obj',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.hdr',
  '.mp3',
  '.wav',
  '.ogg',
  '.json',
  '.js',
];

/**
 * Generates a standard RFC 4122 v4 UUID.
 * @returns {string}
 */
export function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Validates whether a string is a canonical UUID.
 * @param {any} value
 * @returns {boolean}
 */
export function isValidUUID(value) {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

/**
 * ResourceUUIDRegistry manages the persistent `.uuid` sidecar files and the
 * reconstructible `UUID <-> RelativePath` index for a Maxros Engine project.
 *
 * Architectural Guarantees:
 * 1. Selective Sidecars: Only project resources (`.scene.json`, `.script.js`, `.material.json`,
 *    `.input.json`, 3D models, textures, audio, etc.) receive `<file>.uuid` sidecars.
 *    `maxros.project.json`, `core/`, `.maxros/`, and `.uuid` files NEVER receive sidecars.
 * 2. Lifecycle Persistence: Creating or importing generates a new UUID; editing, renaming,
 *    or moving preserves the UUID; deleting removes the `.uuid` sidecar.
 * 3. Missing Sidecar Recovery: Distinguishes brand-new files from existing resources that
 *    lost their `.uuid` sidecar, attempting to recover the previous UUID from the last
 *    metadata snapshot or scene references before proposing a controlled recovery.
 * 4. Non-Silent Duplicate Detection: Never silently overwrites duplicate UUIDs; reports
 *    conflicts with involved files, existing scene references, legitimate owner analysis,
 *    and explicit resolution methods.
 */
export class ResourceUUIDRegistry {
  /**
   * @param {string} projectRootPath
   */
  constructor(projectRootPath) {
    if (!projectRootPath || typeof projectRootPath !== 'string') {
      throw new Error('ResourceUUIDRegistry requires a valid projectRootPath.');
    }
    this.projectRoot = path.resolve(projectRootPath);
    /** @type {Map<string, { uuid: string, relativePath: string, type: string, mtimeMs: number }>} */
    this.byUuid = new Map();
    /** @type {Map<string, string>} relativePath -> uuid */
    this.byPath = new Map();
    /** @type {Map<string, string>} historical relativePath -> uuid from snapshot */
    this._snapshotPathMap = new Map();
    /** @type {Array<any>} */
    this.conflicts = [];
    /** @type {Array<any>} */
    this.missingSidecars = [];
    /** @type {Array<any>} */
    this.recoveredSidecars = [];

    this._loadSnapshotIfAvailable();
  }

  get snapshotFilePath() {
    return path.join(this.projectRoot, '.maxros', 'metadata', 'uuid_registry.json');
  }

  /**
   * Determines the resource category for a project-relative path.
   * @param {string} relPath
   * @returns {string}
   */
  static classifyResourceType(relPath) {
    const lower = relPath.toLowerCase();
    if (lower.endsWith('.scene.json') || lower.endsWith('.scene')) return 'scene';
    if (lower.endsWith('.script.js') || (lower.startsWith('scripts/') && lower.endsWith('.js')))
      return 'script';
    if (lower.endsWith('.material.json')) return 'material';
    if (lower.endsWith('.input.json')) return 'input';
    if (/\.(glb|gltf|obj)$/.test(lower)) return 'model';
    if (/\.(png|jpg|jpeg|webp|svg|hdr)$/.test(lower)) return 'texture';
    if (/\.(mp3|wav|ogg)$/.test(lower)) return 'audio';
    return 'resource';
  }

  /**
   * Checks whether a project-relative file path is eligible for a `.uuid` sidecar.
   * Strictly enforces Refinement #1.
   *
   * @param {string} relPath
   * @returns {boolean}
   */
  static isEligibleForUUID(relPath) {
    if (!relPath || typeof relPath !== 'string') return false;
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized) return false;

    // Never create a sidecar for a `.uuid` file or temporary atomic write file
    if (normalized.endsWith('.uuid') || normalized.includes('.tmp.')) return false;

    const segments = normalized.split('/');
    const topSegment = segments[0];

    // Exclude `core/`, `.maxros/`, `.core3d/`, `node_modules/`, `.git/`
    if (EXCLUDED_TOP_DIRS.has(topSegment)) return false;

    // Exclude root-level project manifests (`maxros.project.json`, `project.maxros`, `project.core3d`)
    if (segments.length === 1 && EXCLUDED_MANIFEST_FILES.has(topSegment)) return false;

    const lower = normalized.toLowerCase();
    return ELIGIBLE_RESOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  static getSidecarPath(resourceAbsPath) {
    return `${resourceAbsPath}.uuid`;
  }

  _loadSnapshotIfAvailable() {
    try {
      if (fs.existsSync(this.snapshotFilePath)) {
        const raw = JSON.parse(fs.readFileSync(this.snapshotFilePath, 'utf8'));
        if (raw && raw.entries && typeof raw.entries === 'object') {
          for (const [relPath, uuid] of Object.entries(raw.entries)) {
            if (isValidUUID(uuid)) {
              this._snapshotPathMap.set(relPath, String(uuid).trim());
            }
          }
        }
      }
    } catch {
      // Snapshot is optional and reconstructible
    }
  }

  /**
   * Saves the current verified registry mapping into `.maxros/metadata/uuid_registry.json`.
   */
  saveSnapshot() {
    try {
      const metaDir = path.dirname(this.snapshotFilePath);
      if (!fs.existsSync(metaDir)) {
        fs.mkdirSync(metaDir, { recursive: true });
      }
      const entries = {};
      for (const [relPath, uuid] of this.byPath.entries()) {
        entries[relPath] = uuid;
      }
      for (const [relPath, uuid] of this._snapshotPathMap.entries()) {
        if (!(relPath in entries)) {
          entries[relPath] = uuid;
        }
      }
      fs.writeFileSync(
        this.snapshotFilePath,
        JSON.stringify(
          {
            engine: 'Maxros Engine',
            updatedAt: new Date().toISOString(),
            entries,
          },
          null,
          2
        ),
        'utf8'
      );
    } catch {
      // Non-fatal if .maxros is read-only
    }
  }

  /**
   * Collects all UUID references across `.scene.json` files and `maxros.project.json`
   * to aid in duplicate conflict analysis and missing sidecar recovery.
   *
   * @returns {Map<string, Array<{ sourceFile: string, slotType: string, nodeName?: string }>>}
   */
  collectProjectReferences() {
    const refs = new Map();
    const recordRef = (uuid, info) => {
      if (!isValidUUID(uuid)) return;
      const key = uuid.trim();
      if (!refs.has(key)) refs.set(key, []);
      refs.get(key).push(info);
    };

    // 1. Check `maxros.project.json` main_scene
    const manifestPath = path.join(this.projectRoot, 'maxros.project.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest?.main_scene && typeof manifest.main_scene === 'object' && manifest.main_scene.uuid) {
          recordRef(manifest.main_scene.uuid, {
            sourceFile: 'maxros.project.json',
            slotType: 'scene',
          });
        }
      } catch {
        // Ignore malformed manifest during scan
      }
    }

    // 2. Check all `.scene.json` files in `scenes/`
    const scenesDir = path.join(this.projectRoot, 'scenes');
    if (fs.existsSync(scenesDir)) {
      const walkScenes = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkScenes(full);
          } else if (entry.name.endsWith('.scene.json') || entry.name.endsWith('.scene')) {
            const relScene = path.relative(this.projectRoot, full).replace(/\\/g, '/');
            try {
              const sceneData = JSON.parse(fs.readFileSync(full, 'utf8'));
              const walkNodes = (node) => {
                if (!node || typeof node !== 'object') return;
                if (node.script && typeof node.script === 'object' && node.script.uuid) {
                  recordRef(node.script.uuid, {
                    sourceFile: relScene,
                    slotType: 'script',
                    nodeName: node.name,
                  });
                }
                if (Array.isArray(node.scripts)) {
                  for (const s of node.scripts) {
                    if (s && typeof s === 'object' && s.uuid) {
                      recordRef(s.uuid, {
                        sourceFile: relScene,
                        slotType: 'script',
                        nodeName: node.name,
                      });
                    }
                  }
                }
                if (node.material && typeof node.material === 'object' && node.material.uuid) {
                  recordRef(node.material.uuid, {
                    sourceFile: relScene,
                    slotType: 'material',
                    nodeName: node.name,
                  });
                }
                if (node.texture && typeof node.texture === 'object' && node.texture.uuid) {
                  recordRef(node.texture.uuid, {
                    sourceFile: relScene,
                    slotType: 'texture',
                    nodeName: node.name,
                  });
                }
                if (Array.isArray(node.children)) {
                  for (const ch of node.children) walkNodes(ch);
                }
              };
              const rootNodes = Array.isArray(sceneData.rootNodes) ? sceneData.rootNodes : [sceneData];
              for (const rn of rootNodes) {
                walkNodes(rn);
              }
            } catch {
              // Ignore malformed scene JSON
            }
          }
        }
      };
      walkScenes(scenesDir);
    }

    return refs;
  }

  /**
   * Scans the project directory, reads all `.uuid` sidecars for eligible resources,
   * detects missing sidecars (recovering previous identity when deterministically possible),
   * and detects duplicate UUID conflicts WITHOUT silent overwrites.
   *
   * @param {object} [options={}]
   * @param {boolean} [options.recoverKnownIdentities=false]
   * @param {boolean} [options.generateForBrandNewFiles=false]
   * @param {boolean} [options.autoRegisterUntracked=false]
   */
  scanProject(options = {}) {
    const generateForNew = Boolean(
      options.generateForBrandNewFiles || options.autoRegisterUntracked
    );
    const recoverKnownIdentities =
      typeof options.recoverKnownIdentities === 'boolean'
        ? options.recoverKnownIdentities
        : generateForNew;

    this.byUuid.clear();
    this.byPath.clear();
    this.conflicts = [];
    this.missingSidecars = [];
    this.recoveredSidecars = [];

    const referencesMap = this.collectProjectReferences();
    /** @type {Map<string, Array<{ relativePath: string, type: string, mtimeMs: number }>>} */
    const rawUuidOccurrences = new Map();
    /** @type {Array<{ relativePath: string, absPath: string, type: string }>} */
    const filesWithoutSidecar = [];

    const walk = (currentDir) => {
      if (!fs.existsSync(currentDir)) return;
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(this.projectRoot, fullPath).replace(/\\/g, '/');
        const topSeg = relPath.split('/')[0];

        if (entry.isDirectory()) {
          if (EXCLUDED_TOP_DIRS.has(topSeg)) continue;
          walk(fullPath);
          continue;
        }

        if (!ResourceUUIDRegistry.isEligibleForUUID(relPath)) {
          continue;
        }

        const sidecarPath = ResourceUUIDRegistry.getSidecarPath(fullPath);
        const resourceType = ResourceUUIDRegistry.classifyResourceType(relPath);
        const stat = fs.statSync(fullPath);

        if (fs.existsSync(sidecarPath)) {
          const rawUuid = fs.readFileSync(sidecarPath, 'utf8').trim().toLowerCase();
          if (isValidUUID(rawUuid)) {
            if (!rawUuidOccurrences.has(rawUuid)) {
              rawUuidOccurrences.set(rawUuid, []);
            }
            rawUuidOccurrences.get(rawUuid).push({
              relativePath: relPath,
              type: resourceType,
              mtimeMs: stat.mtimeMs,
            });
          } else {
            filesWithoutSidecar.push({ relativePath: relPath, absPath: fullPath, type: resourceType });
          }
        } else {
          filesWithoutSidecar.push({ relativePath: relPath, absPath: fullPath, type: resourceType });
        }
      }
    };

    walk(this.projectRoot);

    // 1. Process UUID occurrences & detect duplicate conflicts without silent changes
    for (const [uuid, fileList] of rawUuidOccurrences.entries()) {
      if (fileList.length === 1) {
        const single = fileList[0];
        this.byUuid.set(uuid, {
          uuid,
          relativePath: single.relativePath,
          type: single.type,
          mtimeMs: single.mtimeMs,
        });
        this.byPath.set(single.relativePath, uuid);
        this._snapshotPathMap.set(single.relativePath, uuid);
      } else {
        // CONFLICT DETECTED (Refinement #2): Multiple files share the same UUID
        const refs = referencesMap.get(uuid) || [];
        let legitimateFile = null;

        // Check if historical snapshot remembers the original owner
        for (const candidate of fileList) {
          if (this._snapshotPathMap.get(candidate.relativePath) === uuid) {
            legitimateFile = candidate.relativePath;
            break;
          }
        }

        // If snapshot didn't disambiguate, check if all references expect a specific resource type
        if (!legitimateFile && refs.length > 0) {
          const expectedTypes = new Set(refs.map((r) => r.slotType));
          if (expectedTypes.size === 1) {
            const expectedType = [...expectedTypes][0];
            const matchingCandidates = fileList.filter((f) => f.type === expectedType);
            if (matchingCandidates.length === 1) {
              legitimateFile = matchingCandidates[0].relativePath;
            }
          }
        }

        const ambiguousReferences = legitimateFile ? [] : refs;

        // If we can deterministically identify the legitimate original owner, preserve it in `byUuid`
        // while keeping the conflict flagged so the duplicate file is never silently ignored or overwritten.
        if (legitimateFile) {
          const legEntry = fileList.find((f) => f.relativePath === legitimateFile);
          if (legEntry) {
            this.byUuid.set(uuid, {
              uuid,
              relativePath: legEntry.relativePath,
              type: legEntry.type,
              mtimeMs: legEntry.mtimeMs,
            });
            this.byPath.set(legEntry.relativePath, uuid);
          }
        }

        this.conflicts.push({
          code: 'UUID_DUPLICATE_CONFLICT',
          uuid,
          files: fileList.map((f) => f.relativePath),
          fileDetails: fileList,
          references: refs,
          legitimateFile,
          originalOwnerCandidate: legitimateFile,
          ambiguousReferences,
          requiresIntervention: !legitimateFile || ambiguousReferences.length > 0,
          message: legitimateFile
            ? `Conflito de UUID duplicado (${uuid}) entre [${fileList
                .map((f) => f.relativePath)
                .join(', ')}]. Identidade original preservada para "${legitimateFile}".`
            : `Conflito ambíguo de UUID duplicado (${uuid}) entre [${fileList
                .map((f) => f.relativePath)
                .join(', ')}]. Intervenção necessária para evitar carregar o recurso incorreto.`,
        });
      }
    }

    // 2. Process files missing `.uuid` sidecars (Refinement #4)
    for (const missing of filesWithoutSidecar) {
      const snapshotUuid = this._snapshotPathMap.get(missing.relativePath);
      const isSnapshotUuidFree =
        snapshotUuid && !this.byUuid.has(snapshotUuid) && !rawUuidOccurrences.has(snapshotUuid);

      // Also check if an unmapped reference in scenes/manifest matches this exact resource type
      let orphanRefUuid = null;
      if (!isSnapshotUuidFree) {
        const unmappedMatchingRefs = [];
        for (const [refUuid, refList] of referencesMap.entries()) {
          if (!this.byUuid.has(refUuid) && !rawUuidOccurrences.has(refUuid)) {
            if (refList.some((r) => r.slotType === missing.type)) {
              unmappedMatchingRefs.push(refUuid);
            }
          }
        }
        const missingSameTypeCount = filesWithoutSidecar.filter((f) => f.type === missing.type).length;
        if (unmappedMatchingRefs.length === 1 && missingSameTypeCount === 1) {
          orphanRefUuid = unmappedMatchingRefs[0];
        }
      }

      const recoverableUuid = isSnapshotUuidFree ? snapshotUuid : orphanRefUuid;

      if (recoverKnownIdentities && recoverableUuid) {
        const sidecarPath = ResourceUUIDRegistry.getSidecarPath(missing.absPath);
        fs.writeFileSync(sidecarPath, `${recoverableUuid}\n`, 'utf8');
        const stat = fs.statSync(missing.absPath);
        this.byUuid.set(recoverableUuid, {
          uuid: recoverableUuid,
          relativePath: missing.relativePath,
          type: missing.type,
          mtimeMs: stat.mtimeMs,
        });
        this.byPath.set(missing.relativePath, recoverableUuid);
        this._snapshotPathMap.set(missing.relativePath, recoverableUuid);
        this.recoveredSidecars.push({
          relativePath: missing.relativePath,
          recoveredUuid: recoverableUuid,
          source: isSnapshotUuidFree ? 'snapshot' : 'scene_reference',
        });
      } else if (generateForNew) {
        const freshUuid = this._generateUniqueProjectUUID();
        const sidecarPath = ResourceUUIDRegistry.getSidecarPath(missing.absPath);
        fs.writeFileSync(sidecarPath, `${freshUuid}\n`, 'utf8');
        const stat = fs.statSync(missing.absPath);
        this.byUuid.set(freshUuid, {
          uuid: freshUuid,
          relativePath: missing.relativePath,
          type: missing.type,
          mtimeMs: stat.mtimeMs,
        });
        this.byPath.set(missing.relativePath, freshUuid);
        this._snapshotPathMap.set(missing.relativePath, freshUuid);
      } else {
        this.missingSidecars.push({
          code: 'UUID_SIDECAR_MISSING',
          relativePath: missing.relativePath,
          type: missing.type,
          recoverableUuid: recoverableUuid || null,
          recoveredUuid: recoverableUuid || null,
          message: `O recurso "${missing.relativePath}" está sem seu arquivo auxiliar .uuid.`,
        });
      }
    }

    this.saveSnapshot();

    return {
      totalRegistered: this.byUuid.size,
      conflicts: this.conflicts,
      duplicateConflicts: this.conflicts,
      missingSidecars: this.missingSidecars,
      recoveredSidecars: this.recoveredSidecars,
    };
  }

  _generateUniqueProjectUUID() {
    let candidate = generateUUID().toLowerCase();
    while (this.byUuid.has(candidate)) {
      candidate = generateUUID().toLowerCase();
    }
    return candidate;
  }

  /**
   * Explicitly resolves a duplicate UUID conflict by preserving `keepRelativePath`
   * with the original UUID and assigning a brand-new unique UUID to the other conflicting file(s).
   *
   * @param {string} conflictUuid
   * @param {string | { keepRelativePath: string }} resolutionOrPath
   */
  resolveDuplicateConflict(conflictUuid, resolutionOrPath) {
    const normConflictUuid = String(conflictUuid || '').trim().toLowerCase();
    const keepRelativePath =
      typeof resolutionOrPath === 'string'
        ? resolutionOrPath
        : resolutionOrPath?.keepRelativePath || '';

    if (this.conflicts.length === 0) {
      this.scanProject({ recoverKnownIdentities: false, generateForBrandNewFiles: false });
    }

    const conflict = this.conflicts.find((c) => c.uuid.toLowerCase() === normConflictUuid);
    if (!conflict) {
      return {
        success: false,
        error: `No active conflict found for UUID "${normConflictUuid}".`,
      };
    }
    const normalizedKeep = keepRelativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!conflict.files.includes(normalizedKeep)) {
      return {
        success: false,
        error: `File "${normalizedKeep}" is not part of the duplicate conflict for UUID "${normConflictUuid}".`,
      };
    }

    const reassigned = [];
    for (const relPath of conflict.files) {
      if (relPath === normalizedKeep) continue;
      const absPath = path.join(this.projectRoot, relPath);
      const sidecarPath = ResourceUUIDRegistry.getSidecarPath(absPath);
      const newUuid = this._generateUniqueProjectUUID();
      fs.writeFileSync(sidecarPath, `${newUuid}\n`, 'utf8');
      this._snapshotPathMap.set(relPath, newUuid);
      reassigned.push({ relativePath: relPath, newUuid });
    }

    this._snapshotPathMap.set(normalizedKeep, normConflictUuid);
    this.scanProject({ recoverKnownIdentities: true });
    return {
      success: true,
      preserved: { relativePath: normalizedKeep, uuid: normConflictUuid },
      reassigned,
    };
  }

  /**
   * Controlled recovery for an existing file whose `.uuid` sidecar is missing.
   *
   * @param {string} relPath
   * @param {string | { preferredUuid?: string, allowNewUuid?: boolean }} [options={}]
   */
  recoverMissingSidecar(relPath, options = {}) {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const absPath = path.join(this.projectRoot, normalized);
    if (!fs.existsSync(absPath)) {
      return {
        success: false,
        error: `Resource file not found at "${normalized}".`,
      };
    }
    if (!ResourceUUIDRegistry.isEligibleForUUID(normalized)) {
      return {
        success: false,
        error: `File "${normalized}" is not eligible for a .uuid sidecar.`,
      };
    }

    const opts =
      typeof options === 'string'
        ? { preferredUuid: options, allowNewUuid: true }
        : { allowNewUuid: true, ...(options || {}) };

    const snapshotUuid = this._snapshotPathMap.get(normalized);
    const wasRecoveredFromHistory = Boolean(opts.preferredUuid || snapshotUuid);
    let targetUuid = (opts.preferredUuid || snapshotUuid || '').toLowerCase() || null;

    if (targetUuid && this.byUuid.has(targetUuid) && this.byUuid.get(targetUuid)?.relativePath !== normalized) {
      return {
        success: false,
        error: `Cannot recover with UUID "${targetUuid}": already in use by another resource.`,
      };
    }

    if (!targetUuid) {
      if (!opts.allowNewUuid) {
        return {
          success: false,
          error: `Previous identity for "${normalized}" could not be determined automatically.`,
        };
      }
      targetUuid = this._generateUniqueProjectUUID();
    }

    const sidecarPath = ResourceUUIDRegistry.getSidecarPath(absPath);
    fs.writeFileSync(sidecarPath, `${targetUuid}\n`, 'utf8');
    const stat = fs.statSync(absPath);
    const type = ResourceUUIDRegistry.classifyResourceType(normalized);

    this.byUuid.set(targetUuid, {
      uuid: targetUuid,
      relativePath: normalized,
      type,
      mtimeMs: stat.mtimeMs,
    });
    this.byPath.set(normalized, targetUuid);
    this._snapshotPathMap.set(normalized, targetUuid);
    this.missingSidecars = this.missingSidecars.filter((m) => m.relativePath !== normalized);
    this.saveSnapshot();

    return {
      success: true,
      relativePath: normalized,
      uuid: targetUuid,
      wasRecoveredFromHistory,
    };
  }

  /**
   * Ensures a `.uuid` sidecar exists for an eligible resource file.
   *
   * @param {string} relOrAbsPath
   * @param {string} [forcedUuid]
   * @returns {string | null}
   */
  ensureSidecarForFile(relOrAbsPath, forcedUuid) {
    const absPath = path.isAbsolute(relOrAbsPath)
      ? path.resolve(relOrAbsPath)
      : path.resolve(this.projectRoot, relOrAbsPath);
    const relPath = path.relative(this.projectRoot, absPath).replace(/\\/g, '/');

    if (!ResourceUUIDRegistry.isEligibleForUUID(relPath)) {
      return null;
    }

    const sidecarPath = ResourceUUIDRegistry.getSidecarPath(absPath);
    if (fs.existsSync(sidecarPath)) {
      const existing = fs.readFileSync(sidecarPath, 'utf8').trim().toLowerCase();
      if (isValidUUID(existing)) {
        const stat = fs.statSync(absPath);
        this.byUuid.set(existing, {
          uuid: existing,
          relativePath: relPath,
          type: ResourceUUIDRegistry.classifyResourceType(relPath),
          mtimeMs: stat.mtimeMs,
        });
        this.byPath.set(relPath, existing);
        this._snapshotPathMap.set(relPath, existing);
        this.saveSnapshot();
        return existing;
      }
    }

    const uuid =
      forcedUuid && isValidUUID(forcedUuid)
        ? forcedUuid.trim().toLowerCase()
        : this._generateUniqueProjectUUID();
    if (this.byUuid.has(uuid) && this.byUuid.get(uuid)?.relativePath !== relPath) {
      throw new Error(`Duplicate UUID "${uuid}" rejected for "${relPath}".`);
    }

    fs.writeFileSync(sidecarPath, `${uuid}\n`, 'utf8');
    const stat = fs.statSync(absPath);
    this.byUuid.set(uuid, {
      uuid,
      relativePath: relPath,
      type: ResourceUUIDRegistry.classifyResourceType(relPath),
      mtimeMs: stat.mtimeMs,
    });
    this.byPath.set(relPath, uuid);
    this._snapshotPathMap.set(relPath, uuid);
    this.saveSnapshot();
    return uuid;
  }

  /**
   * Alias for `ensureSidecarForFile(relOrAbsPath, forcedUuid)`.
   */
  ensureResourceUUID(relOrAbsPath, forcedUuid) {
    return this.ensureSidecarForFile(relOrAbsPath, forcedUuid);
  }

  /**
   * Creates a new project resource file and automatically generates its `.uuid` sidecar.
   *
   * @param {string} relPath
   * @param {string | Buffer} content
   * @param {string} [forcedUuid]
   * @returns {{ uuid: string, relativePath: string, absolutePath: string, sidecarPath: string }}
   */
  createResourceFile(relPath, content, forcedUuid) {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!ResourceUUIDRegistry.isEligibleForUUID(normalized)) {
      throw new Error(`File "${normalized}" is not an eligible project resource for UUID tracking.`);
    }
    const absPath = path.join(this.projectRoot, normalized);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const sidecarPath = ResourceUUIDRegistry.getSidecarPath(absPath);
    const isBrandNew = !fs.existsSync(absPath);
    fs.writeFileSync(absPath, content);

    let uuid;
    if (forcedUuid && isValidUUID(forcedUuid)) {
      uuid = forcedUuid.trim().toLowerCase();
      fs.writeFileSync(sidecarPath, `${uuid}\n`, 'utf8');
    } else if (isBrandNew || !fs.existsSync(sidecarPath)) {
      uuid = this._generateUniqueProjectUUID();
      fs.writeFileSync(sidecarPath, `${uuid}\n`, 'utf8');
    } else {
      uuid = fs.readFileSync(sidecarPath, 'utf8').trim().toLowerCase();
    }

    const stat = fs.statSync(absPath);
    this.byUuid.set(uuid, {
      uuid,
      relativePath: normalized,
      type: ResourceUUIDRegistry.classifyResourceType(normalized),
      mtimeMs: stat.mtimeMs,
    });
    this.byPath.set(normalized, uuid);
    this._snapshotPathMap.set(normalized, uuid);
    this.saveSnapshot();

    return {
      uuid,
      relativePath: normalized,
      absolutePath: absPath,
      sidecarPath,
    };
  }

  /**
   * Updates the content of an existing resource file while strictly preserving its UUID.
   *
   * @param {string} relPath
   * @param {string | Buffer} newContent
   * @returns {{ uuid: string, relativePath: string }}
   */
  updateResourceContent(relPath, newContent) {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const absPath = path.join(this.projectRoot, normalized);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Cannot update non-existent resource "${normalized}".`);
    }
    const existingUuid = this.getUUIDForPath(normalized) || this.ensureSidecarForFile(absPath) || '';
    fs.writeFileSync(absPath, newContent);
    const stat = fs.statSync(absPath);
    this.byUuid.set(existingUuid, {
      uuid: existingUuid,
      relativePath: normalized,
      type: ResourceUUIDRegistry.classifyResourceType(normalized),
      mtimeMs: stat.mtimeMs,
    });
    return { uuid: existingUuid, relativePath: normalized };
  }

  /**
   * Imports an external file into the project and generates a brand-new UUID for the imported copy.
   *
   * @param {string} externalSourcePath
   * @param {string} targetRelPath
   */
  importResourceFile(externalSourcePath, targetRelPath) {
    const content = fs.readFileSync(externalSourcePath);
    return this.createResourceFile(targetRelPath, content);
  }

  /**
   * Moves or renames a resource file inside the project, moving its `.uuid` sidecar alongside it
   * so its UUID and all scene references remain 100% intact.
   *
   * @param {string} oldRelPath
   * @param {string} newRelPath
   */
  moveResourceFile(oldRelPath, newRelPath) {
    const normOld = oldRelPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const normNew = newRelPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const oldAbs = path.join(this.projectRoot, normOld);
    const newAbs = path.join(this.projectRoot, normNew);

    if (!fs.existsSync(oldAbs)) {
      throw new Error(`Source resource "${normOld}" does not exist.`);
    }

    const oldSidecar = ResourceUUIDRegistry.getSidecarPath(oldAbs);
    const newSidecar = ResourceUUIDRegistry.getSidecarPath(newAbs);

    const preservedUuid = fs.existsSync(oldSidecar)
      ? fs.readFileSync(oldSidecar, 'utf8').trim().toLowerCase()
      : this.byPath.get(normOld) || this._generateUniqueProjectUUID();

    const targetDir = path.dirname(newAbs);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.renameSync(oldAbs, newAbs);
    if (fs.existsSync(oldSidecar)) {
      fs.renameSync(oldSidecar, newSidecar);
    } else {
      fs.writeFileSync(newSidecar, `${preservedUuid}\n`, 'utf8');
    }

    this.byPath.delete(normOld);
    this._snapshotPathMap.delete(normOld);

    const stat = fs.statSync(newAbs);
    this.byUuid.set(preservedUuid, {
      uuid: preservedUuid,
      relativePath: normNew,
      type: ResourceUUIDRegistry.classifyResourceType(normNew),
      mtimeMs: stat.mtimeMs,
    });
    this.byPath.set(normNew, preservedUuid);
    this._snapshotPathMap.set(normNew, preservedUuid);
    this.saveSnapshot();

    return {
      uuid: preservedUuid,
      oldRelativePath: normOld,
      newRelativePath: normNew,
    };
  }

  /**
   * Deletes a resource file AND its `.uuid` sidecar so if a new file with the same name
   * is created later, it receives a brand-new UUID.
   *
   * @param {string} relPath
   */
  deleteResourceFile(relPath) {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const absPath = path.join(this.projectRoot, normalized);
    const sidecarPath = ResourceUUIDRegistry.getSidecarPath(absPath);

    const existingUuid =
      this.byPath.get(normalized) ||
      (fs.existsSync(sidecarPath) ? fs.readFileSync(sidecarPath, 'utf8').trim().toLowerCase() : null);

    if (fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
    }
    if (fs.existsSync(sidecarPath)) {
      fs.unlinkSync(sidecarPath);
    }

    if (existingUuid) {
      this.byUuid.delete(existingUuid);
    }
    this.byPath.delete(normalized);
    this._snapshotPathMap.delete(normalized);
    this.saveSnapshot();

    return {
      deletedRelativePath: normalized,
      removedUuid: existingUuid,
    };
  }

  /**
   * Lists all registered project resources.
   */
  listResources() {
    const list = [];
    for (const entry of this.byUuid.values()) {
      const absPath = path.join(this.projectRoot, entry.relativePath);
      list.push({
        uuid: entry.uuid,
        relativePath: entry.relativePath,
        projectUri: `project://${entry.relativePath}`,
        absolutePath: absPath,
        type: entry.type,
        mtimeMs: entry.mtimeMs,
      });
    }
    return list;
  }

  /**
   * Resolves a resource UUID to its current project-relative path, `project://` URI, and absolute path.
   *
   * @param {string} uuid
   * @returns {{ uuid: string, relativePath: string, projectUri: string, absolutePath: string, type: string } | null}
   */
  resolveUUID(uuid) {
    if (!isValidUUID(uuid)) return null;
    const entry = this.byUuid.get(uuid.trim().toLowerCase());
    if (!entry) return null;
    const absPath = path.join(this.projectRoot, entry.relativePath);
    if (!fs.existsSync(absPath)) return null;
    return {
      uuid: entry.uuid,
      relativePath: entry.relativePath,
      projectUri: `project://${entry.relativePath}`,
      absolutePath: absPath,
      type: entry.type,
    };
  }

  /**
   * Returns the UUID associated with a project-relative path.
   *
   * @param {string} relPath
   * @returns {string | null}
   */
  getUUIDForPath(relPath) {
    const normalized = relPath.replace(/\\/g, '/').replace(/^project:\/\//, '').replace(/^\/+/, '');
    if (this.byPath.has(normalized)) {
      return this.byPath.get(normalized) || null;
    }
    const sidecar = ResourceUUIDRegistry.getSidecarPath(path.join(this.projectRoot, normalized));
    if (fs.existsSync(sidecar)) {
      const raw = fs.readFileSync(sidecar, 'utf8').trim().toLowerCase();
      if (isValidUUID(raw)) return raw;
    }
    return null;
  }

  /**
   * Detects broken UUID references across `maxros.project.json` and all `.scene.json` files.
   *
   * @returns {Array<{ uuid: string, sourceFile: string, slotType: string, nodeName?: string }>}
   */
  findBrokenReferences() {
    const broken = [];
    const refsMap = this.collectProjectReferences();
    for (const [uuid, refList] of refsMap.entries()) {
      const resolved = this.resolveUUID(uuid);
      if (!resolved) {
        for (const r of refList) {
          broken.push({
            uuid,
            sourceFile: r.sourceFile,
            slotType: r.slotType,
            nodeName: r.nodeName,
          });
        }
      }
    }
    return broken;
  }
}
