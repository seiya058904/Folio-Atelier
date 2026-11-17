// Shared canvas-texture plumbing. The renderer is bound once at start-up so
// painters can configure anisotropy without importing the engine.

import * as THREE from "three";
import { perf } from "../perf.js";

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
 * A 2D context for a canvas that will be handed to WebGL. Such canvases are
 * kept in main memory: uploading from there is several times faster than
 * reading a GPU-backed canvas back, which is what dominated every repaint.
 */
export function paintContext(canvas) {
  return canvas.getContext("2d", { willReadFrequently: true });
}

/**
 * A canvas-backed texture that can be repainted and resized in place.
 * Resizing disposes the GPU copy so Three re-allocates storage.
 *
 * Uploads are the largest cost of a repaint, so they take the browser's fast
 * path: the canvas goes up unflipped (the texture transform flips it back for
 * every map that samples it), and `opaque` layers go up premultiplied, which
 * for opaque pixels is the canvas's own storage and needs no conversion.
 */
export function createPaintTexture(width, height, { opaque = false, ...options } = {}) {
  const canvas = makeCanvas(width, height);
  const texture = configureCanvasTexture(new THREE.CanvasTexture(canvas), options);
  texture.flipY = false;
  texture.repeat.set(1, -1);
  texture.offset.set(0, 1);
  texture.premultiplyAlpha = opaque;
  return {
    canvas,
    texture,
    context: paintContext(canvas),
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
      perf.upload(canvas.width * canvas.height);
    },
    dispose() {
      texture.dispose();
      canvas.width = 1;
      canvas.height = 1;
    }
  };
}
