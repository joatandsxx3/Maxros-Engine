import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeFactory } from './NodeFactory.js';
import { PhysicsServer } from '../physics/PhysicsServer.js';
import { EngineNode } from '../nodes/EngineNode.js';

/**
 * EditorSceneManager handles loading `.scene.json` (and legacy `.scene`) files into RAM
 * and saving in-memory scene hierarchies to disk using an atomic write-and-rename protocol.
 */
export class EditorSceneManager {
  /**
   * @param {object} [options={}]
   * @param {PhysicsServer} [options.physicsServer]
   */
  constructor(options = {}) {
    /** @type {PhysicsServer} */
    this.physicsServer = options.physicsServer || PhysicsServer.getInstance();
  }

  /**
   * Resolves the temporary file path used for atomic writes.
   * Examples:
   * - `/path/to/level1.scene.json` -> `/path/to/level1.tmp.scene.json`
   * - `/path/to/level1.scene` -> `/path/to/level1.tmp.scene`
   *
   * @param {string} filePath
   * @returns {string}
   */
  static getTempFilePath(filePath) {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    const base = path.basename(resolved);

    if (base.endsWith('.scene.json')) {
      const stem = base.slice(0, -'.scene.json'.length);
      return path.join(dir, `${stem}.tmp.scene.json`);
    }

    const ext = path.extname(resolved) || '.scene';
    const baseName = path.basename(resolved, ext);
    return path.join(dir, `${baseName}.tmp${ext}`);
  }

  /**
   * Atomically writes a JSON scene object to `filePath` (`*.tmp.scene.json` / `*.tmp.scene` + `fsyncSync` + `renameSync`)
   * and ensures its `.uuid` sidecar exists if saving a `.scene.json` file.
   *
   * @param {string} filePath
   * @param {any} serializedData
   * @returns {{ filePath: string, tempFilePath: string, bytesWritten: number, uuidSidecarPath: string | null }}
   */
  static writeAtomicSceneJson(filePath, serializedData) {
    const targetPath = path.resolve(filePath);
    const targetDir = path.dirname(targetPath);
    const tempPath = EditorSceneManager.getTempFilePath(targetPath);

    let fileDescriptor = null;

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const jsonPayload = JSON.stringify(serializedData, null, 2);

      fileDescriptor = fs.openSync(tempPath, 'w');
      fs.writeFileSync(fileDescriptor, jsonPayload, { encoding: 'utf8' });
      fs.fsyncSync(fileDescriptor);
      fs.closeSync(fileDescriptor);
      fileDescriptor = null;

      fs.renameSync(tempPath, targetPath);

      let uuidSidecarPath = null;
      if (targetPath.endsWith('.scene.json')) {
        uuidSidecarPath = `${targetPath}.uuid`;
        if (!fs.existsSync(uuidSidecarPath)) {
          const generatedUuid =
            typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID().toLowerCase()
              : '00000000-0000-4000-8000-000000000000';
          fs.writeFileSync(uuidSidecarPath, `${generatedUuid}\n`, 'utf8');
        }
      }

      return {
        filePath: targetPath,
        tempFilePath: tempPath,
        bytesWritten: Buffer.byteLength(jsonPayload, 'utf8'),
        uuidSidecarPath,
      };
    } catch (error) {
      if (fileDescriptor !== null) {
        try {
          fs.closeSync(fileDescriptor);
        } catch {
          // Ignore close errors during exception handling
        }
      }

      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // Ignore unlink errors during cleanup
        }
      }

      throw new Error(`Failed to atomically save scene to "${targetPath}": ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Atomically saves the in-memory scene root to a `.scene.json` or `.scene` file on disk.
   *
   * @param {EngineNode} scene
   * @param {string} filePath
   * @returns {{ filePath: string, tempFilePath: string, bytesWritten: number, uuidSidecarPath?: string | null }}
   */
  saveScene(scene, filePath) {
    if (!scene || typeof scene.serialize !== 'function') {
      throw new Error('EditorSceneManager.saveScene requires a valid root EngineNode implementing serialize()');
    }
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('EditorSceneManager.saveScene requires a valid target filePath string');
    }

    const serializedData = scene.serialize();
    return EditorSceneManager.writeAtomicSceneJson(filePath, serializedData);
  }

  /**
   * Loads a `.scene.json` or `.scene` file from disk, parses its JSON structure, and reconstructs
   * the entire node hierarchy (visuals, transforms, and physics bodies) in RAM.
   *
   * @param {string} filePath
   * @param {object} [options={}]
   * @param {boolean} [options.clearPhysicsBeforeLoad=false] - Optionally clear existing physics world bodies before loading.
   * @returns {EngineNode} Reconstructed root EngineNode in RAM.
   */
  loadScene(filePath, options = {}) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('EditorSceneManager.loadScene requires a valid filePath string');
    }

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Scene file not found at "${resolvedPath}"`);
    }

    const rawContent = fs.readFileSync(resolvedPath, { encoding: 'utf8' });

    let parsedData;
    try {
      parsedData = JSON.parse(rawContent);
    } catch (parseError) {
      throw new Error(`Malformed JSON in scene file "${resolvedPath}": ${parseError.message}`, {
        cause: parseError,
      });
    }

    if (options.clearPhysicsBeforeLoad && this.physicsServer) {
      this.physicsServer.clear();
    }

    // Support both container format ({ engine: 'Maxros Engine', rootNodes: [...] }) and direct root node format
    const rootNodeData =
      Array.isArray(parsedData.rootNodes) && parsedData.rootNodes.length > 0 && !parsedData.type
        ? parsedData.rootNodes[0]
        : parsedData;

    const rootNode = NodeFactory.createFromData(rootNodeData, {
      physicsServer: this.physicsServer,
    });

    return rootNode;
  }
}
