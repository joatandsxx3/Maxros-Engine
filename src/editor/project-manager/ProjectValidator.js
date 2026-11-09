import fs from 'node:fs';
import path from 'node:path';
import { ResourceUUIDRegistry, isValidUUID } from './ResourceUUIDRegistry.js';

export const CURRENT_ENGINE_NAME = 'Maxros Engine';
export const CURRENT_ENGINE_VERSION = '1.0.0';
export const PROJECT_MANIFEST_FILENAME = 'maxros.project.json';
export const LEGACY_MANIFEST_FILENAMES = ['project.maxros', 'project.core3d'];

/**
 * ProjectValidator verifies project identity, directory integrity, core engine version,
 * and UUID resource consistency before opening or migrating a project.
 */
export class ProjectValidator {
  /**
   * Locates the project root directory and manifest file given either a directory path
   * or a direct path to `maxros.project.json` / `project.maxros` / `project.core3d`.
   *
   * @param {string} targetPath
   * @returns {{ valid: boolean, projectRoot: string | null, manifestPath: string | null, manifestFileName: string | null, isLegacyManifest: boolean, error?: string }}
   */
  static locateProjectIdentity(targetPath) {
    if (!targetPath || typeof targetPath !== 'string' || !targetPath.trim()) {
      return {
        valid: false,
        projectRoot: null,
        manifestPath: null,
        manifestFileName: null,
        isLegacyManifest: false,
        error: 'Caminho do projeto vazio ou inválido.',
      };
    }

    const resolved = path.resolve(targetPath.trim());
    if (!fs.existsSync(resolved)) {
      return {
        valid: false,
        projectRoot: null,
        manifestPath: null,
        manifestFileName: null,
        isLegacyManifest: false,
        error: `O caminho informado não existe no disco: "${resolved}".`,
      };
    }

    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      const base = path.basename(resolved);
      if (base === PROJECT_MANIFEST_FILENAME) {
        return {
          valid: true,
          projectRoot: path.dirname(resolved),
          manifestPath: resolved,
          manifestFileName: base,
          isLegacyManifest: false,
        };
      }
      if (LEGACY_MANIFEST_FILENAMES.includes(base)) {
        return {
          valid: true,
          projectRoot: path.dirname(resolved),
          manifestPath: resolved,
          manifestFileName: base,
          isLegacyManifest: true,
        };
      }
      return {
        valid: false,
        projectRoot: null,
        manifestPath: null,
        manifestFileName: null,
        isLegacyManifest: false,
        error: `O arquivo selecionado ("${base}") não é um manifesto válido (${PROJECT_MANIFEST_FILENAME}).`,
      };
    }

    if (stat.isDirectory()) {
      const primaryManifest = path.join(resolved, PROJECT_MANIFEST_FILENAME);
      if (fs.existsSync(primaryManifest) && fs.statSync(primaryManifest).isFile()) {
        return {
          valid: true,
          projectRoot: resolved,
          manifestPath: primaryManifest,
          manifestFileName: PROJECT_MANIFEST_FILENAME,
          isLegacyManifest: false,
        };
      }

      for (const legacyName of LEGACY_MANIFEST_FILENAMES) {
        const legacyPath = path.join(resolved, legacyName);
        if (fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) {
          return {
            valid: true,
            projectRoot: resolved,
            manifestPath: legacyPath,
            manifestFileName: legacyName,
            isLegacyManifest: true,
          };
        }
      }

      return {
        valid: false,
        projectRoot: null,
        manifestPath: null,
        manifestFileName: null,
        isLegacyManifest: false,
        error: `A pasta "${path.basename(
          resolved
        )}" não contém um arquivo ${PROJECT_MANIFEST_FILENAME} válido. Pastas arbitrárias não podem ser abertas como projetos.`,
      };
    }

    return {
      valid: false,
      projectRoot: null,
      manifestPath: null,
      manifestFileName: null,
      isLegacyManifest: false,
      error: 'O destino selecionado não é um diretório nem arquivo de projeto válido.',
    };
  }

  /**
   * Performs comprehensive validation of a project directory or manifest file.
   *
   * @param {string} targetPath
   * @param {{ recoverKnownIdentities?: boolean }} [options={}]
   */
  static validateProject(targetPath, options = {}) {
    const loc = ProjectValidator.locateProjectIdentity(targetPath);
    if (!loc.valid || !loc.projectRoot || !loc.manifestPath) {
      const errMsg = loc.error || 'Projeto inválido.';
      return {
        valid: false,
        error: errMsg,
        errors: [errMsg],
        warnings: [],
        isLegacy: false,
        legacyDetected: false,
        legacyFiles: [],
      };
    }

    const projectRoot = loc.projectRoot;
    const warnings = [];
    const legacyFiles = [];
    let isLegacy = loc.isLegacyManifest;
    if (loc.isLegacyManifest && loc.manifestFileName) {
      legacyFiles.push(loc.manifestFileName);
    }

    // Check for legacy `.core3d` directory that has not been migrated to `.maxros` yet
    if (
      fs.existsSync(path.join(projectRoot, '.core3d')) &&
      (!fs.existsSync(path.join(projectRoot, '.maxros')) || loc.isLegacyManifest)
    ) {
      isLegacy = true;
      legacyFiles.push('.core3d/');
      warnings.push('Diretório legado .core3d/ detectado (elegível para migração para .maxros/).');
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(loc.manifestPath, 'utf8'));
    } catch (err) {
      const errMsg = `JSON corrompido em "${loc.manifestFileName}": ${err.message}`;
      return {
        valid: false,
        projectRoot,
        manifestPath: loc.manifestPath,
        error: errMsg,
        errors: [errMsg],
        warnings,
        isLegacy,
        legacyDetected: isLegacy,
        legacyFiles,
      };
    }

    if (!manifest || typeof manifest !== 'object') {
      const errMsg = `Estrutura inválida em "${loc.manifestFileName}".`;
      return {
        valid: false,
        projectRoot,
        manifestPath: loc.manifestPath,
        error: errMsg,
        errors: [errMsg],
        warnings,
        isLegacy,
        legacyDetected: isLegacy,
        legacyFiles,
      };
    }

    // Check legacy engine identifiers
    if (
      manifest.engine === 'CoreStudio' ||
      manifest.engine === 'Core3D Studio' ||
      manifest.engine === 'Core3D'
    ) {
      isLegacy = true;
      warnings.push(
        `Identificador legado de engine "${manifest.engine}" detectado (será atualizado para "${CURRENT_ENGINE_NAME}").`
      );
    }

    if (!isValidUUID(manifest.uuid)) {
      isLegacy = true;
      warnings.push('Manifesto do projeto ainda não possui um UUID de projeto válido.');
    }

    if (typeof manifest.main_scene === 'string') {
      isLegacy = true;
      warnings.push(
        `Cena principal referenciada por caminho ("${manifest.main_scene}") em vez de UUID ({ "uuid": "..." }).`
      );
    }

    // Check for unmigrated legacy `.scene` files in `scenes/`
    const scenesDir = path.join(projectRoot, manifest.folders?.scenes || 'scenes');
    if (fs.existsSync(scenesDir)) {
      const allSceneFiles = fs.readdirSync(scenesDir);
      const unmigratedLegacyScenes = allSceneFiles.filter(
        (f) =>
          f.endsWith('.scene') &&
          !f.endsWith('.tmp.scene') &&
          !allSceneFiles.includes(`${f.slice(0, -'.scene'.length)}.scene.json`)
      );
      if (unmigratedLegacyScenes.length > 0) {
        isLegacy = true;
        for (const ls of unmigratedLegacyScenes) {
          legacyFiles.push(`scenes/${ls}`);
        }
        warnings.push(
          `${unmigratedLegacyScenes.length} arquivo(s) de cena com extensão antiga (.scene) detectado(s) para migração (.scene.json).`
        );
      }
    }

    // Check `core/version.json`
    const coreDir = path.join(projectRoot, manifest.folders?.core || 'core');
    const coreVersionPath = path.join(coreDir, 'version.json');
    let coreVersionInfo = null;
    if (fs.existsSync(coreVersionPath)) {
      try {
        coreVersionInfo = JSON.parse(fs.readFileSync(coreVersionPath, 'utf8'));
      } catch {
        warnings.push('Arquivo core/version.json está malformado.');
      }
    } else {
      warnings.push('Arquivo core/version.json ausente na pasta do projeto.');
    }

    // Scan UUID sidecars
    const registry = new ResourceUUIDRegistry(projectRoot);
    const scanReport = registry.scanProject({
      recoverKnownIdentities: options.recoverKnownIdentities !== false,
      generateForBrandNewFiles: false,
    });

    const brokenReferences = registry.findBrokenReferences();

    // Resolve `main_scene`
    let resolvedMainScene = null;
    if (manifest.main_scene && typeof manifest.main_scene === 'object' && manifest.main_scene.uuid) {
      resolvedMainScene = registry.resolveUUID(manifest.main_scene.uuid);
      if (!resolvedMainScene) {
        warnings.push(
          `A cena principal referenciada pelo UUID "${manifest.main_scene.uuid}" não foi localizada no registro do projeto.`
        );
      }
    } else if (typeof manifest.main_scene === 'string') {
      const candidatePath = path.join(projectRoot, manifest.main_scene);
      if (fs.existsSync(candidatePath)) {
        resolvedMainScene = {
          uuid: registry.getUUIDForPath(manifest.main_scene) || null,
          relativePath: manifest.main_scene.replace(/\\/g, '/'),
          projectUri: `project://${manifest.main_scene.replace(/\\/g, '/')}`,
          absolutePath: candidatePath,
          type: 'scene',
        };
      }
    }

    const engineVersion =
      coreVersionInfo?.engine_version || manifest.engine_version || CURRENT_ENGINE_VERSION;
    const isUpdateAvailable = engineVersion !== CURRENT_ENGINE_VERSION;
    const isValidModernProject = !isLegacy && Boolean(resolvedMainScene);
    const errors = !isValidModernProject
      ? warnings.length > 0
        ? [...warnings]
        : ['Projeto requer migração ou cena principal ausente.']
      : [];

    return {
      valid: isValidModernProject,
      projectRoot,
      manifestPath: loc.manifestPath,
      manifestFileName: loc.manifestFileName,
      manifest,
      projectUuid: manifest.uuid || null,
      projectName: manifest.name || path.basename(projectRoot),
      projectType: manifest.type === 'demo' ? 'demo' : 'user',
      engineVersion,
      coreVersion: engineVersion,
      currentEngineVersion: CURRENT_ENGINE_VERSION,
      isUpdateAvailable,
      coreVersionMismatch: isUpdateAvailable,
      isLegacy,
      legacyDetected: isLegacy,
      legacyFiles,
      resolvedMainScene,
      mainSceneRelativePath: resolvedMainScene?.relativePath || null,
      uuidScan: scanReport,
      brokenReferences,
      warnings,
      errors,
      error: errors[0] || undefined,
      registry,
    };
  }
}
