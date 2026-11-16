// Procedural surface maps: binding materials (cloth, linen, leather, paper,
// velvet), paper stock, page edges and the soft contact shadow.
// Height fields are tileable; normal and roughness maps are derived from them
// and shared by every book that uses the same material.

import * as THREE from "three";
import { clamp, hashSeed, seededRandom } from "../util.js";
import { configureCanvasTexture, makeCanvas } from "./gl.js";

const SIZE = 256;

/* ---------- tileable noise ---------- */

function valueNoise(cells, seed) {
  const random = seededRandom(seed);
  const lattice = new Float32Array(cells * cells);
  for (let index = 0; index < lattice.length; index += 1) lattice[index] = random();
  const fade = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = (((u % 1) + 1) % 1) * cells;
    const y = (((v % 1) + 1) % 1) * cells;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = (x0 + 1) % cells;
    const y1 = (y0 + 1) % cells;
    const fx = fade(x - x0);
    const fy = fade(y - y0);
    const a = lattice[y0 * cells + x0];
    const b = lattice[y0 * cells + x1];
    const c = lattice[y1 * cells + x0];
    const d = lattice[y1 * cells + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function worley(cells, seed) {
  const random = seededRandom(seed);
  const points = new Float32Array(cells * cells * 2);
  for (let index = 0; index < points.length; index += 1) points[index] = random();
  return (u, v) => {
    const x = (((u % 1) + 1) % 1) * cells;
    const y = (((v % 1) + 1) % 1) * cells;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let nearest = 9;
    let second = 9;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const gx = cx + ox;
        const gy = cy + oy;
        const wx = ((gx % cells) + cells) % cells;
        const wy = ((gy % cells) + cells) % cells;
        const px = gx + points[(wy * cells + wx) * 2];
        const py = gy + points[(wy * cells + wx) * 2 + 1];
        const distance = Math.hypot(px - x, py - y);
        if (distance < nearest) {
          second = nearest;
          nearest = distance;
        } else if (distance < second) {
          second = distance;
        }
      }
    }
    return [nearest, second];
  };
}

/* ---------- height fields per material ---------- */

const HEIGHT_FIELDS = {
  cloth(field) {
    // Plain weave: warp and weft threads pass over each other alternately.
    const pitch = 8;
    const irregular = valueNoise(32, 1213);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const across = Math.sin((Math.PI * (x % pitch + 0.5)) / pitch);
        const along = Math.sin((Math.PI * (y % pitch + 0.5)) / pitch);
        const warpOnTop = (Math.floor(x / pitch) + Math.floor(y / pitch)) % 2 === 0;
        const crown = warpOnTop
          ? Math.pow(across, 0.7) * (0.55 + 0.45 * along)
          : Math.pow(along, 0.7) * (0.55 + 0.45 * across);
        field[y * SIZE + x] = 0.16 + crown * 0.7 + (irregular(x / SIZE, y / SIZE) - 0.5) * 0.16;
      }
    }
  },
  linen(field) {
    const slub = valueNoise(24, 811);
    const drift = valueNoise(9, 97);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        const wobble = (drift(u, v) - 0.5) * 2.4;
        const warp = Math.abs(Math.sin((x + wobble) * Math.PI * 0.1875));
        const weft = Math.abs(Math.sin((y - wobble) * Math.PI * 0.15625));
        const over = (Math.floor(x / 5.33) + Math.floor(y / 6.4)) % 2 === 0;
        const thread = over ? warp * 0.36 + weft * 0.1 : weft * 0.36 + warp * 0.1;
        field[y * SIZE + x] = 0.3 + thread + (slub(u * 1.0, v * 3.0) - 0.5) * 0.22;
      }
    }
  },
  leather(field) {
    const cells = worley(22, 4127);
    const fine = worley(64, 733);
    const soft = valueNoise(10, 59);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        const [near, second] = cells(u, v);
        const crease = clamp((second - near) * 3.2, 0, 1);
        const pebble = Math.pow(crease, 0.55);
        const [fineNear] = fine(u, v);
        field[y * SIZE + x] = 0.18 + pebble * 0.62 + (1 - fineNear) * 0.08 + soft(u, v) * 0.14;
      }
    }
  },
  paper(field) {
    const a = valueNoise(64, 31);
    const b = valueNoise(128, 77);
    const laid = valueNoise(6, 5);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        const lines = Math.sin(y * Math.PI * 0.25) * 0.05;
        field[y * SIZE + x] = 0.5 + (a(u, v) - 0.5) * 0.26 + (b(u, v) - 0.5) * 0.18 + lines + (laid(u, v) - 0.5) * 0.1;
      }
    }
  },
  velvet(field) {
    const a = valueNoise(128, 211);
    const nap = valueNoise(12, 19);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        field[y * SIZE + x] = 0.5 + (a(u, v) - 0.5) * 0.5 + (nap(u, v) - 0.5) * 0.28;
      }
    }
  }
};

/** Physically based parameters for each binding material. */
export const MATERIAL_LOOK = {
  cloth: {
    repeat: [8, 12], normal: 0.5, slope: 1.4, roughBase: 0.76, roughRange: 0.22,
    roughness: 0.98, metalness: 0.02, sheen: 0.34, sheenRoughness: 0.76, sheenFromFoil: true,
    clearcoat: 0, clearcoatRoughness: 0.7, thread: "woven"
  },
  linen: {
    repeat: [3.4, 5.4], normal: 0.78, slope: 1.9, roughBase: 0.8, roughRange: 0.2,
    roughness: 1, metalness: 0, sheen: 0.2, sheenRoughness: 0.9, sheenFromFoil: false,
    clearcoat: 0, clearcoatRoughness: 0.7, thread: "slub"
  },
  leather: {
    repeat: [3, 4.6], normal: 0.86, slope: 2.4, roughBase: 0.42, roughRange: 0.3,
    roughness: 0.74, metalness: 0, sheen: 0.08, sheenRoughness: 0.6, sheenFromFoil: false,
    clearcoat: 0.32, clearcoatRoughness: 0.46, thread: "none"
  },
  paper: {
    repeat: [2, 3], normal: 0.22, slope: 1.2, roughBase: 0.82, roughRange: 0.14,
    roughness: 0.92, metalness: 0, sheen: 0, sheenRoughness: 1, sheenFromFoil: false,
    clearcoat: 0, clearcoatRoughness: 0.7, thread: "fibre"
  },
  velvet: {
    repeat: [6, 9], normal: 0.3, slope: 1.3, roughBase: 0.9, roughRange: 0.1,
    roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.38, sheenFromFoil: false,
    clearcoat: 0, clearcoatRoughness: 0.7, thread: "none"
  }
};

const materialMapCache = new Map();

/** Normal + roughness maps for a binding material (shared, cached). */
export function getMaterialMaps(kind) {
  const key = HEIGHT_FIELDS[kind] ? kind : "cloth";
  if (materialMapCache.has(key)) return materialMapCache.get(key);

  const look = MATERIAL_LOOK[key];
  const field = new Float32Array(SIZE * SIZE);
  HEIGHT_FIELDS[key](field);

  const normalCanvas = makeCanvas(SIZE, SIZE);
  const roughnessCanvas = makeCanvas(SIZE, SIZE);
  const normalContext = normalCanvas.getContext("2d");
  const roughnessContext = roughnessCanvas.getContext("2d");
  const normalImage = normalContext.createImageData(SIZE, SIZE);
  const roughnessImage = roughnessContext.createImageData(SIZE, SIZE);
  const sample = (x, y) => field[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = y * SIZE + x;
      const pixel = index * 4;
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * look.slope;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * look.slope;
      const length = Math.hypot(dx, dy, 1);
      normalImage.data[pixel] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 3] = 255;
      // Leather is shinier on the raised pebbles; woven stock is rougher on the threads.
      const height = clamp(field[index], 0, 1);
      const rough = key === "leather"
        ? look.roughBase + (1 - height) * look.roughRange
        : look.roughBase + height * look.roughRange;
      const value = Math.round(clamp(rough, 0, 1) * 255);
      roughnessImage.data[pixel] = value;
      roughnessImage.data[pixel + 1] = value;
      roughnessImage.data[pixel + 2] = value;
      roughnessImage.data[pixel + 3] = 255;
    }
  }
  normalContext.putImageData(normalImage, 0, 0);
  roughnessContext.putImageData(roughnessImage, 0, 0);

  const configure = (canvas, suffix) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `${key}-${suffix}`;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(look.repeat[0], look.repeat[1]);
    return configureCanvasTexture(texture, { color: false, anisotropy: 12 });
  };

  const maps = {
    normal: configure(normalCanvas, "normal"),
    roughness: configure(roughnessCanvas, "roughness"),
    look
  };
  materialMapCache.set(key, maps);
  return maps;
}

/**
 * Paint the base colour of a binding material: flat dye, edge shading and the
 * fine colour variation that makes the surface read as fabric, hide or paper.
 */
export function paintMaterialBase(ctx, width, height, color, kind, seed, { spine = false } = {}) {
  const look = MATERIAL_LOOK[kind] || MATERIAL_LOOK.cloth;
  const random = seededRandom(hashSeed(`${kind}-${seed}-${spine ? "s" : "f"}`));
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  const area = (width * height) / (768 * 1152);
  if (look.thread === "woven" || look.thread === "slub") {
    const count = Math.round((look.thread === "slub" ? 3400 : 2300) * area);
    const strength = look.thread === "slub" ? 1.7 : 1;
    for (let thread = 0; thread < count; thread += 1) {
      const x = random() * width;
      const y = random() * height;
      const vertical = random() > 0.55;
      const length = (look.thread === "slub" ? 10 : 5) + random() * (look.thread === "slub" ? 64 : 28);
      ctx.strokeStyle = random() > 0.5
        ? `rgba(255,255,255,${(0.018 + random() * 0.03) * strength})`
        : `rgba(0,0,0,${(0.016 + random() * 0.028) * strength})`;
      ctx.lineWidth = 0.45 + random() * (look.thread === "slub" ? 1.3 : 0.7);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        vertical ? x + (random() - 0.5) * 1.4 : x + length,
        vertical ? y + length : y + (random() - 0.5) * 1.4
      );
      ctx.stroke();
    }
  } else if (look.thread === "fibre") {
    const count = Math.round(1500 * area);
    for (let fibre = 0; fibre < count; fibre += 1) {
      const x = random() * width;
      const y = random() * height;
      const angle = random() * Math.PI;
      const length = 4 + random() * 18;
      ctx.strokeStyle = random() > 0.5
        ? `rgba(255,255,255,${0.02 + random() * 0.035})`
        : `rgba(0,0,0,${0.015 + random() * 0.03})`;
      ctx.lineWidth = 0.4 + random() * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    }
  } else {
    // Leather and velvet: broad, soft tonal mottling instead of threads.
    const count = Math.round(70 * area);
    for (let blot = 0; blot < count; blot += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 40 + random() * 150;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const tone = random() > 0.5 ? "255,255,255" : "0,0,0";
      gradient.addColorStop(0, `rgba(${tone},${0.02 + random() * 0.035})`);
      gradient.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  // Board edges catch less light: darker towards the hinge and the fore-edge.
  const edge = ctx.createLinearGradient(0, 0, width, 0);
  edge.addColorStop(0, `rgba(0,0,0,${spine ? 0.2 : 0.17})`);
  edge.addColorStop(spine ? 0.14 : 0.055, "rgba(255,255,255,0.03)");
  edge.addColorStop(spine ? 0.62 : 0.9, "rgba(255,255,255,0)");
  edge.addColorStop(1, `rgba(0,0,0,${spine ? 0.16 : 0.11})`);
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, width, height);

  const foot = ctx.createLinearGradient(0, height * 0.8, 0, height);
  foot.addColorStop(0, "rgba(0,0,0,0)");
  foot.addColorStop(1, "rgba(0,0,0,0.09)");
  ctx.fillStyle = foot;
  ctx.fillRect(0, 0, width, height);
}

/* ---------- paper ---------- */

export const PAPER_STOCKS = {
  cream: { label: "Cream", base: "#e8e1d3", warm: "103,87,64" },
  white: { label: "Bright white", base: "#f1eeea", warm: "96,92,88" },
  ivory: { label: "Ivory", base: "#efe6cf", warm: "118,94,54" },
  grey: { label: "Soft grey", base: "#dcdad5", warm: "80,80,84" }
};

export function drawPaperSurface(ctx, width, height, random, stock = "cream") {
  const paper = PAPER_STOCKS[stock] || PAPER_STOCKS.cream;
  ctx.fillStyle = paper.base;
  ctx.fillRect(0, 0, width, height);

  const wash = ctx.createLinearGradient(0, 0, width, height);
  wash.addColorStop(0, "rgba(255,255,255,0.22)");
  wash.addColorStop(0.42, "rgba(255,255,255,0.035)");
  wash.addColorStop(1, `rgba(${paper.warm},0.08)`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  const area = (width * height) / (512 * 768);
  for (let fibre = 0; fibre < 2400 * area; fibre += 1) {
    const x = random() * width;
    const y = random() * height;
    const length = 5 + random() * 34;
    ctx.strokeStyle = random() > 0.44
      ? `rgba(255,255,255,${0.025 + random() * 0.045})`
      : `rgba(${paper.warm},${0.018 + random() * 0.035})`;
    ctx.lineWidth = 0.45 + random() * 0.65;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(Math.min(width, x + length), y + (random() - 0.5) * 2.2);
    ctx.stroke();
  }
  for (let fleck = 0; fleck < 1200 * area; fleck += 1) {
    const tone = Math.round(112 + random() * 94);
    ctx.fillStyle = `rgba(${tone},${tone - 5},${tone - 13},${0.016 + random() * 0.025})`;
    const size = 0.5 + random() * 1.1;
    ctx.fillRect(random() * width, random() * height, size, size);
  }
}

const paperFaceCache = new Map();

/** Blank paper face, shared by the page block and unprinted leaves. */
export function getPaperFaceTexture(stock = "cream") {
  const key = PAPER_STOCKS[stock] ? stock : "cream";
  if (paperFaceCache.has(key)) return paperFaceCache.get(key);
  const canvas = makeCanvas(512, 768);
  drawPaperSurface(canvas.getContext("2d"), 512, 768, seededRandom(hashSeed(`paper-${key}`)), key);
  const texture = configureCanvasTexture(new THREE.CanvasTexture(canvas));
  texture.name = `paper-face-${key}`;
  paperFaceCache.set(key, texture);
  return texture;
}

/* ---------- page edges ---------- */

let pageEdgeTextures = null;

export function getPageEdgeTextures() {
  if (pageEdgeTextures) return pageEdgeTextures;

  const make = (width, height, suffix) => {
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const random = seededRandom(hashSeed(`edge-${suffix}`));
    ctx.fillStyle = "#dcd5c7";
    ctx.fillRect(0, 0, width, height);
    const step = suffix === "fore" ? 2 : 1.35;
    for (let y = 0; y < height; y += step) {
      const shade = Math.round(106 + random() * 74);
      const signature = random() > 0.965;
      ctx.strokeStyle = `rgba(${shade},${shade - 3},${shade - 9},${signature ? 0.34 : 0.13 + random() * 0.13})`;
      ctx.lineWidth = signature ? 1.05 : 0.42 + random() * 0.42;
      ctx.beginPath();
      ctx.moveTo(0, y + (random() - 0.5) * 0.5);
      ctx.bezierCurveTo(
        width * 0.3, y + (random() - 0.5) * 0.9,
        width * 0.72, y + (random() - 0.5) * 0.9,
        width, y + (random() - 0.5) * 0.5
      );
      ctx.stroke();
    }
    const shade = ctx.createLinearGradient(0, 0, width, 0);
    shade.addColorStop(0, "rgba(58,48,35,0.18)");
    shade.addColorStop(0.035, "rgba(255,255,255,0.04)");
    shade.addColorStop(0.86, "rgba(255,255,255,0)");
    shade.addColorStop(1, "rgba(58,48,35,0.12)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);
    return configureCanvasTexture(new THREE.CanvasTexture(canvas));
  };

  pageEdgeTextures = {
    fore: make(512, 2048, "fore"),
    headTail: make(2048, 384, "head-tail")
  };
  return pageEdgeTextures;
}

/* ---------- contact shadow ---------- */

let contactShadowTexture = null;

export function getContactShadowTexture() {
  if (contactShadowTexture) return contactShadowTexture;
  const canvas = makeCanvas(512, 128);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(256, 64, 10, 256, 64, 254);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.38, "rgba(255,255,255,0.62)");
  gradient.addColorStop(0.72, "rgba(255,255,255,0.18)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  contactShadowTexture = configureCanvasTexture(new THREE.CanvasTexture(canvas), {
    color: false,
    anisotropy: 8
  });
  contactShadowTexture.name = "soft-contact-shadow";
  return contactShadowTexture;
}
