// Shared canvas-texture plumbing. The renderer is bound once at start-up so
// painters can configure anisotropy without importing the engine.

import * as THREE from "three";

let maxAnisotropy = 8;

export function bindRenderer(renderer) {
  maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
}

export function configureCanvasTexture(texture, { color = true, anisotropy = 16 } = {}) {
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(anisotropy, maxAnisotropy);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/**
 * A canvas-backed texture that can be repainted and resized in place.
 * Resizing disposes the GPU copy so Three re-allocates storage.
 */
export function createPaintTexture(width, height, options) {
  const canvas = makeCanvas(width, height);
  const texture = configureCanvasTexture(new THREE.CanvasTexture(canvas), options);
  return {
    canvas,
    texture,
    context: canvas.getContext("2d"),
    resize(nextWidth, nextHeight) {
      const w = Math.max(1, Math.round(nextWidth));
      const h = Math.max(1, Math.round(nextHeight));
      if (canvas.width === w && canvas.height === h) return false;
      texture.dispose();
      canvas.width = w;
      canvas.height = h;
      return true;
    },
    commit() {
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
      canvas.width = 1;
      canvas.height = 1;
    }
  };
}
