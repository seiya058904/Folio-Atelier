// Shared canvas-texture plumbing. The renderer is bound once at start-up so
// painters can configure anisotropy without importing the engine.

import * as THREE from "three";
import { perf } from "../perf.js";

let maxAnisotropy = 8;
let boundRenderer = null;

export function bindRenderer(renderer) {
  boundRenderer = renderer;
  maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
}

/*
 * A copy of what a texture shows now, kept on the GPU, so a board can fade
 * from its previous picture to the one about to be uploaded. One quad drawn
 * into a render target: a fraction of a millisecond, and no canvas is read.
 */
let copyScene = null;
let copyCamera = null;
let copyMaterial = null;

function copier() {
  if (copyScene) return copyMaterial;
  copyMaterial = new THREE.ShaderMaterial({
    uniforms: { source: { value: null } },
    vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
    fragmentShader: `uniform sampler2D source;
varying vec2 vUv;
void main() { gl_FragColor = texture2D( source, vUv ); }`,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  copyScene = new THREE.Scene();
  copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial));
  copyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return copyMaterial;
}

/** Whether `texture` is on the GPU with its current contents. */
export function isUploaded(texture) {
  if (!boundRenderer || !texture) return false;
  const properties = boundRenderer.properties.get(texture);
  return Boolean(properties.__webglTexture) && properties.__version === texture.version;
}

/**
 * Copy `texture` (as uploaded) into `target`, a render target made by
 * `snapshotTarget`. Returns false when there is nothing on the GPU to copy.
 */
export function snapshotTexture(texture, target) {
  if (!isUploaded(texture)) return false;
  const material = copier();
  material.uniforms.source.value = texture;
  const previous = boundRenderer.getRenderTarget();
  const autoClear = boundRenderer.autoClear;
  boundRenderer.autoClear = false;
  boundRenderer.setRenderTarget(target);
  boundRenderer.render(copyScene, copyCamera);
  boundRenderer.setRenderTarget(previous);
  boundRenderer.autoClear = autoClear;
  material.uniforms.source.value = null;
  return true;
}

/** A render target for `snapshotTexture`, mipmapped like the boards. */
export function snapshotTarget(width, height, colorSpace) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    colorSpace
  });
  target.texture.anisotropy = Math.min(8, maxAnisotropy);
  return target;
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
