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
 * A canvas-backed texture that can be repainted and resized.
 *
 * Uploads are the largest cost of a repaint, so they take the browser's fast
 * path: the canvas goes up unflipped (the texture transform flips it back for
 * every map that samples it), and `opaque` layers go up premultiplied, which
 * for opaque pixels is the canvas's own storage and needs no conversion.
 *
 * A board goes back and forth between two sizes (a small draft while it is
 * edited, full size at rest). Giving a texture new dimensions makes the GPU
 * allocate fresh storage, which stalled the frame that sharpened each board;
 * so the previous size is kept as a spare and switching back to it reuses its
 * storage. `canvas`, `context` and `texture` always name the current size:
 * whoever samples it must take `texture` again after a resize. `trim()` lets
 * the spare go (a book back on the shelf does not need its studio size).
 */
export function createPaintTexture(width, height, { opaque = false, ...options } = {}) {
  const make = (w, h) => {
    const canvas = makeCanvas(w, h);
    const texture = configureCanvasTexture(new THREE.CanvasTexture(canvas), options);
    texture.flipY = false;
    texture.repeat.set(1, -1);
    texture.offset.set(0, 1);
    texture.premultiplyAlpha = opaque;
    return { canvas, texture, context: paintContext(canvas) };
  };
  const release = (variant) => {
    variant.texture.dispose();
    variant.canvas.width = 1;
    variant.canvas.height = 1;
  };
  let current = make(width, height);
  let spare = null;
  return {
    get canvas() { return current.canvas; },
    get context() { return current.context; },
    get texture() { return current.texture; },
    /** Switch to `nextWidth` × `nextHeight`. True when the size changed (repaint it all). */
    resize(nextWidth, nextHeight) {
      const w = Math.max(1, Math.round(nextWidth));
      const h = Math.max(1, Math.round(nextHeight));
      if (current.canvas.width === w && current.canvas.height === h) return false;
      if (spare && spare.canvas.width === w && spare.canvas.height === h) {
        [current, spare] = [spare, current];
        return true;
      }
      if (spare) release(spare);
      spare = current;
      current = make(w, h);
      return true;
    },
    trim() {
      if (spare) release(spare);
      spare = null;
    },
    commit() {
      current.texture.needsUpdate = true;
      perf.upload(current.canvas.width * current.canvas.height);
    },
    dispose() {
      release(current);
      this.trim();
    }
  };
}
