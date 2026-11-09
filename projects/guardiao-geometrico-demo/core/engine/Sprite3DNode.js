import * as THREE from 'three';
import { EngineNode } from './EngineNode.js';

/**
 * Creates a deterministic in-memory RGBA DataTexture so that Texture assignment
 * works identically in headless Node.js environments (where HTMLImageElement is absent)
 * as well as browser WebGL contexts.
 *
 * @param {string} texturePath
 * @returns {THREE.DataTexture}
 */
function createProceduralFallbackTexture(texturePath) {
  let hash = 0;
  for (let i = 0; i < texturePath.length; i++) {
    hash = (hash << 5) - hash + texturePath.charCodeAt(i);
    hash |= 0;
  }

  const r = Math.max(48, Math.abs((hash >> 16) & 0xff));
  const g = Math.max(64, Math.abs((hash >> 8) & 0xff));
  const b = Math.max(80, Math.abs(hash & 0xff));

  if (typeof globalThis.document !== 'undefined' && typeof globalThis.document.createElement === 'function') {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const lower = texturePath.toLowerCase();

      if (lower.includes('hazard')) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#0f172a';
        for (let i = -128; i < 256; i += 28) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 14, 0);
          ctx.lineTo(i - 50, 128);
          ctx.lineTo(i - 64, 128);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, 120, 120);
      } else if (lower.includes('crate') || lower.includes('cargo')) {
        ctx.fillStyle = '#92400e';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 4;
        for (let y = 32; y < 128; y += 32) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(128, y);
          ctx.stroke();
        }
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 10;
        ctx.strokeRect(8, 8, 112, 112);
        ctx.beginPath();
        ctx.moveTo(8, 8);
        ctx.lineTo(120, 120);
        ctx.moveTo(120, 8);
        ctx.lineTo(8, 120);
        ctx.stroke();
      } else if (lower.includes('metal') || lower.includes('steel')) {
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        for (let i = 16; i < 128; i += 16) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, 128);
          ctx.moveTo(0, i);
          ctx.lineTo(128, i);
          ctx.stroke();
        }
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 6;
        ctx.strokeRect(5, 5, 118, 118);
      } else if (lower.includes('neon') || lower.includes('orb') || lower.includes('core')) {
        ctx.fillStyle = '#064e3b';
        ctx.fillRect(0, 0, 128, 128);
        const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 58);
        grad.addColorStop(0, '#a7f3d0');
        grad.addColorStop(0.5, '#10b981');
        grad.addColorStop(1, '#064e3b');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(64, 64, 56, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, 116, 116);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 64);
        ctx.lineTo(128, 64);
        ctx.moveTo(64, 0);
        ctx.lineTo(64, 128);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(64, 64, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      const canvasTex = new THREE.CanvasTexture(canvas);
      canvasTex.colorSpace = THREE.SRGBColorSpace;
      canvasTex.needsUpdate = true;
      canvasTex.name = texturePath;
      canvasTex.userData = { sourcePath: texturePath };
      return canvasTex;
    }
  }

  const size = 4;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const stride = i * 4;
    const isChecker = (Math.floor(i / size) + (i % size)) % 2 === 0;
    data[stride] = isChecker ? r : 255;
    data[stride + 1] = isChecker ? g : 255;
    data[stride + 2] = isChecker ? b : 255;
    data[stride + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.name = texturePath;
  texture.userData = { sourcePath: texturePath };
  return texture;
}

/**
 * Visual Node extending EngineNode.
 * Supports either `THREE.Sprite` (billboard) or `THREE.Mesh` with `THREE.PlaneGeometry`.
 */
export class Sprite3DNode extends EngineNode {
  /**
   * @param {object} [options={}]
   * @param {string} [options.name='Sprite3DNode']
   * @param {string|null} [options.texturePath=null]
   * @param {'sprite'|'plane'} [options.renderMode='sprite']
   * @param {number} [options.width=1]
   * @param {number} [options.height=1]
   * @param {number|string} [options.color=0xffffff]
   * @param {number} [options.opacity=1]
   */
  constructor(options = {}) {
    const {
      name = 'Sprite3DNode',
      texturePath = null,
      renderMode = 'sprite',
      width = 1,
      height = 1,
      color = 0xffffff,
      opacity = 1,
    } = options;

    super(name);
    this.nodeType = 'Sprite3DNode';

    /** @type {string|null} */
    this.texturePath = null;
    /** @type {'sprite'|'plane'} */
    this.renderMode = renderMode === 'plane' ? 'plane' : 'sprite';
    /** @type {number} */
    this.width = Number(width) > 0 ? Number(width) : 1;
    /** @type {number} */
    this.height = Number(height) > 0 ? Number(height) : 1;
    /** @type {string} */
    this.colorHex = new THREE.Color(color).getHexString();
    /** @type {number} */
    this.opacity = Number(opacity ?? 1);

    /** @type {THREE.Texture|null} */
    this.texture = null;
    /** @type {THREE.Sprite|THREE.Mesh|null} */
    this.visualObject = null;

    this._rebuildVisualRepresentation();

    if (texturePath) {
      this.setTexture(texturePath);
    }
  }

  /**
   * Builds or rebuilds the underlying THREE.Sprite or THREE.Mesh(PlaneGeometry).
   * Note: `this.visualObject` is a pure THREE.Object3D (not an EngineNode),
   * so it renders in the Three.js scene graph without polluting the serialized EngineNode children.
   */
  _rebuildVisualRepresentation() {
    if (this.visualObject) {
      super.remove(this.visualObject);
      if ('geometry' in this.visualObject && this.visualObject.geometry) {
        this.visualObject.geometry.dispose();
      }
      if (this.visualObject.material) {
        this.visualObject.material.dispose();
      }
      this.visualObject = null;
    }

    const threeColor = new THREE.Color(`#${this.colorHex}`);

    if (this.renderMode === 'plane') {
      const geometry = new THREE.PlaneGeometry(this.width, this.height);
      const material = new THREE.MeshBasicMaterial({
        color: threeColor,
        map: this.texture,
        transparent: true,
        opacity: this.opacity,
        side: THREE.DoubleSide,
      });
      this.visualObject = new THREE.Mesh(geometry, material);
    } else {
      const material = new THREE.SpriteMaterial({
        color: threeColor,
        map: this.texture,
        transparent: true,
        opacity: this.opacity,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(this.width, this.height, 1);
      this.visualObject = sprite;
    }

    this.visualObject.name = `${this.name}__Visual`;
    super.add(this.visualObject);
  }

  /**
   * Associates a texture path with this Sprite3DNode and updates its material.
   * Works in both Node.js (headless) and Browser environments.
   * @param {string|null} texturePath
   * @returns {this}
   */
  setTexture(texturePath) {
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }

    this.texturePath = texturePath ? String(texturePath) : null;

    if (this.texturePath) {
      const hasDOMImage = typeof globalThis.Image !== 'undefined' && typeof globalThis.document !== 'undefined';
      if (hasDOMImage && (this.texturePath.startsWith('data:') || this.texturePath.startsWith('http'))) {
        const loader = new THREE.TextureLoader();
        this.texture = loader.load(this.texturePath);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.userData = { sourcePath: this.texturePath };
      } else {
        this.texture = createProceduralFallbackTexture(this.texturePath);
      }
    }

    if (this.visualObject && this.visualObject.material) {
      this.visualObject.material.map = this.texture;
      this.visualObject.material.needsUpdate = true;
    }

    return this;
  }

  /**
   * Serializes Sprite3DNode attributes including `texturePath` and visual settings.
   * @returns {Record<string, any>}
   */
  serialize() {
    const baseData = super.serialize();
    return {
      ...baseData,
      type: 'Sprite3DNode',
      texturePath: this.texturePath,
      renderMode: this.renderMode,
      width: this.width,
      height: this.height,
      color: `#${this.colorHex}`,
      opacity: this.opacity,
    };
  }

  /**
   * Reconstructs the Sprite3DNode state and visual representation from serialized data.
   * @param {Record<string, any>} data
   * @returns {this}
   */
  deserialize(data) {
    super.deserialize(data);

    if (data.renderMode === 'plane' || data.renderMode === 'sprite') {
      this.renderMode = data.renderMode;
    }
    if (typeof data.width === 'number' && data.width > 0) {
      this.width = data.width;
    }
    if (typeof data.height === 'number' && data.height > 0) {
      this.height = data.height;
    }
    if (data.color !== undefined) {
      this.colorHex = new THREE.Color(data.color).getHexString();
    }
    if (typeof data.opacity === 'number') {
      this.opacity = data.opacity;
    }

    this._rebuildVisualRepresentation();
    this.setTexture(data.texturePath ?? null);

    return this;
  }
}
