// Procedural surface maps: binding materials (cloth, linen, leather, paper,
// velvet), paper stock, page edges and the soft contact shadow.
// Height fields are tileable; normal and roughness maps are derived from them
// and shared by every book that uses the same material.

import * as THREE from "three";
import { clamp, hashSeed, seededRandom } from "../util.js";
import { configureCanvasTexture, makeCanvas, paintContext } from "./gl.js";

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
  buckram(field) {
    // The same plain weave as bookcloth, heavier and less even.
    HEIGHT_FIELDS.cloth(field);
    const slub = valueNoise(20, 433);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        field[y * SIZE + x] += (slub(x / SIZE, (y / SIZE) * 2) - 0.5) * 0.3;
      }
    }
  },
  silk(field) {
    // Fine horizontal rib with a slow drift, which gives the watered look.
    const drift = valueNoise(7, 311);
    const fine = valueNoise(96, 17);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        const rib = Math.sin((y + (drift(u, v) - 0.5) * 5) * Math.PI * 0.5);
        field[y * SIZE + x] = 0.5 + rib * 0.2 + (fine(u, v) - 0.5) * 0.08;
      }
    }
  },
  suede(field) {
    const a = valueNoise(128, 613);
    const b = valueNoise(48, 71);
    const nap = valueNoise(8, 29);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        field[y * SIZE + x] = 0.5 + (a(u, v) - 0.5) * 0.4 + (b(u, v) - 0.5) * 0.2 + (nap(u, v) - 0.5) * 0.3;
      }
    }
  },
  vellum(field) {
    const cells = worley(7, 907);
    const soft = valueNoise(12, 43);
    const fine = valueNoise(96, 9);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        const [near, second] = cells(u, v);
        const vein = 1 - clamp((second - near) * 9, 0, 1);
        field[y * SIZE + x] = 0.5 + soft(u, v) * 0.18 - vein * 0.1 + (fine(u, v) - 0.5) * 0.05;
      }
    }
  },
  canvas(field) {
    // Coarse plain weave of thick, uneven yarns.
    const slub = valueNoise(16, 271);
    const pitch = 16;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const across = Math.sin((Math.PI * (x % pitch + 0.5)) / pitch);
        const along = Math.sin((Math.PI * (y % pitch + 0.5)) / pitch);
        const warpOnTop = (Math.floor(x / pitch) + Math.floor(y / pitch)) % 2 === 0;
        const crown = warpOnTop ? Math.pow(across, 0.5) * (0.6 + 0.4 * along) : Math.pow(along, 0.5) * (0.6 + 0.4 * across);
        field[y * SIZE + x] = 0.12 + crown * 0.72 + (slub(x / SIZE, (y / SIZE) * 3) - 0.5) * 0.26;
      }
    }
  },
  denim(field) {
    // 3/1 twill: diagonal wales running up to the right (period divides SIZE).
    const slub = valueNoise(24, 389);
    const pitch = 8;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const wale = Math.sin((((x + y) % (pitch * 2)) / (pitch * 2)) * Math.PI);
        const thread = Math.sin((Math.PI * (y % pitch + 0.5)) / pitch);
        field[y * SIZE + x] = 0.2 + wale * 0.48 + thread * 0.14 + (slub(x / SIZE, (y / SIZE) * 4) - 0.5) * 0.2;
      }
    }
  },
  cork(field) {
    // Granules of bark pressed together, with dark pits between them.
    const grains = worley(40, 5101);
    const fine = valueNoise(96, 13);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        const [near, second] = grains(u, v);
        const pit = clamp((second - near) * 6, 0, 1);
        field[y * SIZE + x] = 0.22 + Math.pow(pit, 0.4) * 0.5 + (fine(u, v) - 0.5) * 0.26;
      }
    }
  },
  snakeskin(field) {
    // Overlapping scales in offset rows, each a little domed.
    const soft = valueNoise(12, 641);
    const across = 16;
    const down = 16;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const row = Math.floor(y / down);
        const shift = row % 2 ? across * 0.5 : 0;
        const u = ((x + shift) % across) / across - 0.5;
        const v = (y % down) / down - 0.5;
        const dome = clamp(1 - Math.hypot(u * 1.3, v * 1.1) * 1.8, 0, 1);
        field[y * SIZE + x] = 0.16 + Math.sqrt(dome) * 0.6 + (soft(x / SIZE, y / SIZE) - 0.5) * 0.12;
      }
    }
  },
  wood(field) {
    // Sliced veneer: long, gently wandering growth lines and fine pores.
    const drift = valueNoise(4, 1777);
    const pores = valueNoise(128, 59);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const u = x / SIZE;
        const v = y / SIZE;
        const line = Math.sin(((x + (drift(u, v) - 0.5) * 40) * Math.PI * 2) / 16);
        field[y * SIZE + x] = 0.5 + line * 0.14 + (pores(u, v) - 0.5) * 0.18;
      }
    }
  },
  acrylic(field) {
    // Cast sheet: almost perfectly smooth, with the faintest ripple.
    const ripple = valueNoise(4, 2003);
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        field[y * SIZE + x] = 0.5 + (ripple(x / SIZE, y / SIZE) - 0.5) * 0.04;
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
    repeat: [5, 7.5], normal: 0.4, slope: 2.0, roughBase: 0.5, roughRange: 0.2,
    roughness: 0.74, metalness: 0, sheen: 0.08, sheenRoughness: 0.6, sheenFromFoil: false,
    clearcoat: 0.16, clearcoatRoughness: 0.5, thread: "none"
  },
  paper: {
    repeat: [2, 3], normal: 0.22, slope: 1.2, roughBase: 0.82, roughRange: 0.14,
    roughness: 0.92, metalness: 0, sheen: 0, sheenRoughness: 1, sheenFromFoil: false,
    clearcoat: 0, clearcoatRoughness: 0.7, thread: "fibre"
  },
  buckram: {
    repeat: [4.6, 6.9], normal: 0.9, slope: 1.6, roughBase: 0.8, roughRange: 0.2,
    roughness: 1, metalness: 0, sheen: 0.16, sheenRoughness: 0.9, sheenFromFoil: false,
    clearcoat: 0, clearcoatRoughness: 0.7, thread: "woven"
  },
  silk: {
    repeat: [5, 7.5], normal: 0.34, slope: 1.3, roughBase: 0.4, roughRange: 0.24,
    roughness: 0.72, metalness: 0.04, sheen: 1, sheenRoughness: 0.24, sheenFromFoil: false,
    clearcoat: 0.06, clearcoatRoughness: 0.4, thread: "silk"
  },
  suede: {
    repeat: [5, 7.5], normal: 0.42, slope: 1.5, roughBase: 0.9, roughRange: 0.1,
    roughness: 1, metalness: 0, sheen: 0.6, sheenRoughness: 0.8, sheenFromFoil: false,
    clearcoat: 0, clearcoatRoughness: 0.7, thread: "none"
  },
  vellum: {
    repeat: [1.6, 2.4], normal: 0.2, slope: 1.6, roughBase: 0.42, roughRange: 0.22,
    roughness: 0.62, metalness: 0, sheen: 0.05, sheenRoughness: 0.6, sheenFromFoil: false,
    clearcoat: 0.22, clearcoatRoughness: 0.42, thread: "none"
  },
  canvas: {
    repeat: [3, 4.5], normal: 1, slope: 1.7, roughBase: 0.84, roughRange: 0.16,
    roughness: 1, metalness: 0, sheen: 0.12, sheenRoughness: 0.9, sheenFromFoil: false,
    clearcoat: 0, clearcoatRoughness: 0.7, thread: "slub"
  },
  denim: {
    repeat: [5, 7.5], normal: 0.8, slope: 1.6, roughBase: 0.82, roughRange: 0.16,
    roughness: 1, metalness: 0, sheen: 0.18, sheenRoughness: 0.85, sheenFromFoil: false,
    clearcoat: 0, clearcoatRoughness: 0.7, thread: "twill"
  },
  cork: {
    repeat: [2.4, 3.6], normal: 0.9, slope: 1.8, roughBase: 0.86, roughRange: 0.12,
    roughness: 1, metalness: 0, sheen: 0.04, sheenRoughness: 1, sheenFromFoil: false,
    clearcoat: 0, clearcoatRoughness: 0.7, thread: "speckle"
  },
  snakeskin: {
    repeat: [4, 6], normal: 0.7, slope: 2.2, roughBase: 0.42, roughRange: 0.3,
    roughness: 0.66, metalness: 0.02, sheen: 0.12, sheenRoughness: 0.5, sheenFromFoil: false,
    clearcoat: 0.3, clearcoatRoughness: 0.36, thread: "scales"
  },
  wood: {
    repeat: [1, 1.5], normal: 0.26, slope: 1.4, roughBase: 0.5, roughRange: 0.2,
    roughness: 0.7, metalness: 0, sheen: 0, sheenRoughness: 1, sheenFromFoil: false,
    clearcoat: 0.34, clearcoatRoughness: 0.32, thread: "wood"
  },
  acrylic: {
    repeat: [1, 1.5], normal: 0.05, slope: 1, roughBase: 0.06, roughRange: 0.04,
    roughness: 0.12, metalness: 0, sheen: 0, sheenRoughness: 1, sheenFromFoil: false,
    clearcoat: 1, clearcoatRoughness: 0.04, thread: "none"
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
export function paintMaterialBase(ctx, width, height, color, kind, seed, { spine = false, flip = false, overlay = false } = {}) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  // The grain does not depend on the dye. Where the same board is painted
  // over and over (a colour being dragged, a grid of thumbnails) `overlay`
  // keeps it as a transparent sheet and lays it on in one go, instead of
  // rasterising thousands of strokes every time.
  // Studio-size boards are cached too (a few, they are large): a book is
  // repainted many times as it is edited, and its grain never changes, so
  // after the first paint a board costs a fill and one copy. Shelf-size
  // boards, painted once each, are drawn directly unless asked otherwise.
  const transform = ctx.getTransform();
  const pixelWidth = Math.round(width * transform.a);
  const pixelHeight = Math.round(height * transform.d);
  const studio = pixelWidth * pixelHeight > GRAIN_CACHE_PIXELS;
  if ((overlay || studio) && transform.b === 0 && transform.c === 0 && pixelWidth > 0 && pixelHeight > 0) {
    ctx.drawImage(grainOverlay(pixelWidth, pixelHeight, width, height, kind, seed, spine, flip), 0, 0, width, height);
    return;
  }
  paintGrain(ctx, width, height, kind, seed, spine, flip);
}

const GRAIN_CACHE_PIXELS = 768 * 1152;
// Small sheets (drafts, the shelf, thumbnails) and studio-size ones, apart.
const grainCaches = { small: { limit: 24, entries: new Map() }, large: { limit: 4, entries: new Map() } };

function grainOverlay(pixelWidth, pixelHeight, width, height, kind, seed, spine, flip) {
  const key = [pixelWidth, pixelHeight, width, height, kind, seed, spine, flip].join("|");
  const cache = pixelWidth * pixelHeight <= GRAIN_CACHE_PIXELS ? grainCaches.small : grainCaches.large;
  const cached = cache.entries.get(key);
  if (cached) {
    cache.entries.delete(key);
    cache.entries.set(key, cached);
    return cached;
  }
  const canvas = makeCanvas(pixelWidth, pixelHeight);
  const ctx = paintContext(canvas);
  ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
  paintGrain(ctx, width, height, kind, seed, spine, flip);
  cache.entries.set(key, canvas);
  if (cache.entries.size > cache.limit) {
    const oldest = cache.entries.keys().next().value;
    cache.entries.get(oldest).width = 1;
    cache.entries.delete(oldest);
  }
  return canvas;
}

/** Threads, fibres or mottling, and the shading at the board edges. */
function paintGrain(ctx, width, height, kind, seed, spine, flip) {
  const look = MATERIAL_LOOK[kind] || MATERIAL_LOOK.cloth;
  const random = seededRandom(hashSeed(`${kind}-${seed}-${spine ? "s" : "f"}`));

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
  } else if (look.thread === "silk") {
    // Long, faint weft lines.
    const count = Math.round(900 * area);
    for (let thread = 0; thread < count; thread += 1) {
      const y = random() * height;
      const x = random() * width;
      ctx.strokeStyle = random() > 0.5
        ? `rgba(255,255,255,${0.02 + random() * 0.035})`
        : `rgba(0,0,0,${0.015 + random() * 0.03})`;
      ctx.lineWidth = 0.4 + random() * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 60 + random() * 260, y + (random() - 0.5) * 1.2);
      ctx.stroke();
    }
  } else if (look.thread === "twill") {
    // Denim shows pale weft between the dyed diagonal wales.
    const count = Math.round(2600 * area);
    for (let thread = 0; thread < count; thread += 1) {
      const x = random() * width;
      const y = random() * height;
      const length = 6 + random() * 20;
      ctx.strokeStyle = random() > 0.35
        ? `rgba(255,255,255,${0.03 + random() * 0.05})`
        : `rgba(0,0,0,${0.02 + random() * 0.03})`;
      ctx.lineWidth = 0.5 + random() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length * 0.7, y - length * 0.7);
      ctx.stroke();
    }
  } else if (look.thread === "speckle") {
    // Cork: dark and light granules.
    const count = Math.round(5200 * area);
    for (let grain = 0; grain < count; grain += 1) {
      const radius = 0.8 + random() * 3.2;
      ctx.fillStyle = random() > 0.45
        ? `rgba(40,20,5,${0.08 + random() * 0.16})`
        : `rgba(255,236,200,${0.05 + random() * 0.1})`;
      ctx.beginPath();
      ctx.arc(random() * width, random() * height, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (look.thread === "scales") {
    // Each scale is a little darker at its rim.
    const across = 26;
    const down = 34;
    ctx.lineWidth = 1.4;
    for (let row = 0; row * down < height + down; row += 1) {
      for (let column = -1; column * across < width + across; column += 1) {
        const x = column * across + (row % 2 ? across / 2 : 0);
        ctx.strokeStyle = `rgba(0,0,0,${0.08 + random() * 0.08})`;
        ctx.beginPath();
        ctx.ellipse(x, row * down, across * 0.48, down * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else if (look.thread === "wood") {
    // Growth rings seen edge-on: long, wavy, darker lines.
    for (let line = 0; line < width; line += 6 + random() * 14) {
      ctx.strokeStyle = `rgba(60,30,10,${0.05 + random() * 0.1})`;
      ctx.lineWidth = 0.8 + random() * 2.4;
      ctx.beginPath();
      const wave = 4 + random() * 10;
      const phase = random() * Math.PI * 2;
      for (let y = 0; y <= height; y += 24) {
        const x = line + Math.sin(y / 140 + phase) * wave;
        if (y) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
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
  }

  /*
   * Everything else here is soft (mottling 40-190 units across, the shading
   * at the edges), so it is drawn on a sheet a quarter of the size and laid on
   * scaled up once: a sixteenth of the pixels for the same look. At studio
   * size the two full-board gradients and the mottling cost 25-60 ms of
   * rasterising; the threads above are the only fine detail.
   */
  const scale = Math.abs(ctx.getTransform().a) || 1;
  const mottled = !["woven", "slub", "silk", "twill", "speckle", "scales", "wood", "fibre"].includes(look.thread);
  // Small boards (the shelf, drafts) with threads gain nothing from a sheet
  // of their own: there the gradients go straight on.
  const sheet = mottled || width * height * scale * scale > GRAIN_CACHE_PIXELS;
  const small = sheet ? makeCanvas(Math.max(2, Math.ceil((width * scale) / 4)), Math.max(2, Math.ceil((height * scale) / 4))) : null;
  const mottle = small ? paintContext(small) : ctx;
  if (small) mottle.setTransform(small.width / width, 0, 0, small.height / height, 0, 0);
  if (mottled) {
    // Leather and velvet: broad, soft tonal mottling instead of threads.
    const count = Math.round(70 * area);
    for (let blot = 0; blot < count; blot += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 40 + random() * 150;
      const gradient = mottle.createRadialGradient(x, y, 0, x, y, radius);
      const tone = random() > 0.5 ? "255,255,255" : "0,0,0";
      gradient.addColorStop(0, `rgba(${tone},${0.01 + random() * 0.018})`);
      gradient.addColorStop(1, `rgba(${tone},0)`);
      mottle.fillStyle = gradient;
      mottle.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  // Board edges catch less light: darker towards the hinge and the fore-edge.
  const edge = flip ? mottle.createLinearGradient(width, 0, 0, 0) : mottle.createLinearGradient(0, 0, width, 0);
  edge.addColorStop(0, `rgba(0,0,0,${spine ? 0.2 : 0.17})`);
  edge.addColorStop(spine ? 0.14 : 0.055, "rgba(255,255,255,0.03)");
  edge.addColorStop(spine ? 0.62 : 0.9, "rgba(255,255,255,0)");
  edge.addColorStop(1, `rgba(0,0,0,${spine ? 0.16 : 0.11})`);
  mottle.fillStyle = edge;
  mottle.fillRect(0, 0, width, height);

  const foot = mottle.createLinearGradient(0, height * 0.8, 0, height);
  foot.addColorStop(0, "rgba(0,0,0,0)");
  foot.addColorStop(1, "rgba(0,0,0,0.09)");
  mottle.fillStyle = foot;
  mottle.fillRect(0, 0, width, height);

  // Bilinear is exact for the gradients and invisible on the soft blots.
  if (small) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.drawImage(small, 0, 0, width, height);
    ctx.restore();
  }
}

/* ---------- paper ---------- */

export const PAPER_STOCKS = {
  cream: { label: "Cream", base: "#e8e1d3", warm: "103,87,64" },
  white: { label: "Bright white", base: "#f1eeea", warm: "96,92,88" },
  ivory: { label: "Ivory", base: "#efe6cf", warm: "118,94,54" },
  grey: { label: "Soft grey", base: "#dcdad5", warm: "80,80,84" },
  aged: { label: "Aged", base: "#e1d2ad", warm: "124,92,44" },
  blush: { label: "Blush", base: "#efdfd8", warm: "128,84,76" },
  rice: { label: "Rice paper", base: "#f1ede2", warm: "110,104,84", fibre: 2.4 }
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
  for (let fibre = 0; fibre < 2400 * area * (paper.fibre || 1); fibre += 1) {
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

const pageEdgeCache = new Map();

/**
 * Textures for the trimmed edges of the block. The plain pair is tinted by the
 * material colour (natural, gilt, stained); `sprinkled` and `ombre` bake the
 * colour into the texture.
 */
/** Edge finishes whose colour is painted into the edge texture. */
export const BAKED_EDGES = new Set(["sprinkled", "ombre", "marbled", "paste", "gauffered"]);

export function getPageEdgeTextures(variant = "plain", color = "#c6532f") {
  const baked = BAKED_EDGES.has(variant);
  const key = baked ? `${variant}-${color}` : "plain";
  if (pageEdgeCache.has(key)) return pageEdgeCache.get(key);

  const make = (width, height, suffix) => {
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const random = seededRandom(hashSeed(`edge-${suffix}`));
    ctx.fillStyle = "#dcd5c7";
    ctx.fillRect(0, 0, width, height);
    if (variant === "ombre") {
      // Stain that fades from the tail to the head (fore-edge) or from the
      // fore-edge inwards (head and tail).
      const fade = suffix === "fore"
        ? ctx.createLinearGradient(0, height, 0, 0)
        : ctx.createLinearGradient(width, 0, 0, 0);
      fade.addColorStop(0, color);
      fade.addColorStop(suffix === "fore" ? 0.92 : 0.8, "rgba(220,213,199,0)");
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    if (variant === "marbled") {
      // Combed marbling: wandering veins of the colour and a lighter tint.
      const veins = Math.round((width * height) / 2600);
      for (let vein = 0; vein < veins; vein += 1) {
        const y = random() * height;
        const amplitude = 6 + random() * 26;
        const period = 40 + random() * 120;
        const phase = random() * Math.PI * 2;
        ctx.strokeStyle = random() > 0.4 ? color : "rgba(250,244,230,0.8)";
        ctx.globalAlpha = 0.35 + random() * 0.5;
        ctx.lineWidth = 1 + random() * 6;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 6) {
          const yy = y + Math.sin(x / period + phase) * amplitude + Math.sin(x / (period * 0.3)) * amplitude * 0.2;
          if (x) ctx.lineTo(x, yy);
          else ctx.moveTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (variant === "paste") {
      // German paste paper: coloured paste dragged into fans with a comb.
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
      const fan = Math.max(28, Math.min(width, height) * 0.9);
      ctx.strokeStyle = "rgba(250,244,230,0.55)";
      ctx.lineWidth = 1.6;
      for (let cy = 0; cy < height + fan; cy += fan) {
        for (let cx = 0; cx < width + fan; cx += fan) {
          for (let ring = 3; ring < fan * 0.6; ring += 4) {
            ctx.beginPath();
            ctx.arc(cx, cy, ring, Math.PI, Math.PI * 1.5);
            ctx.stroke();
          }
        }
      }
    }
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
    if (variant === "sprinkled") {
      ctx.fillStyle = color;
      const count = Math.round((width * height) / 150);
      for (let dot = 0; dot < count; dot += 1) {
        ctx.globalAlpha = 0.5 + random() * 0.5;
        ctx.beginPath();
        ctx.arc(random() * width, random() * height, 0.8 + random() * random() * 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (variant === "gauffered") {
      // Gilt, then tooled with a heated wheel: a lattice of small dots.
      ctx.fillStyle = "rgba(60,40,10,0.55)";
      const pitch = suffix === "fore" ? 14 : 10;
      for (let y = pitch / 2; y < height; y += pitch) {
        for (let x = pitch / 2; x < width; x += pitch) {
          const offset = Math.round(y / pitch) % 2 ? pitch / 2 : 0;
          ctx.beginPath();
          ctx.arc(x + offset, y, pitch * 0.16, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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

  const textures = baked
    ? { fore: make(256, 1024, "fore"), headTail: make(1024, 192, "head-tail") }
    : { fore: make(512, 2048, "fore"), headTail: make(2048, 384, "head-tail") };
  pageEdgeCache.set(key, textures);
  // Dragging the colour picker makes many variants; keep only the recent ones.
  if (pageEdgeCache.size > 9) {
    const oldest = [...pageEdgeCache.keys()].find((candidate) => candidate !== "plain");
    const stale = pageEdgeCache.get(oldest);
    stale.fore.dispose();
    stale.headTail.dispose();
    pageEdgeCache.delete(oldest);
  }
  return textures;
}

/** Two-colour striped silk for headbands. */
const headbandCache = new Map();
export function getHeadbandTexture(first, second) {
  const key = `${first}-${second}`;
  if (headbandCache.has(key)) return headbandCache.get(key);
  const canvas = makeCanvas(8, 64);
  const ctx = canvas.getContext("2d");
  for (let band = 0; band < 8; band += 1) {
    ctx.fillStyle = band % 2 ? second : first;
    ctx.fillRect(0, band * 8, 8, 8);
  }
  const texture = configureCanvasTexture(new THREE.CanvasTexture(canvas));
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 2.5);
  headbandCache.set(key, texture);
  if (headbandCache.size > 12) {
    const oldest = headbandCache.keys().next().value;
    headbandCache.get(oldest).dispose();
    headbandCache.delete(oldest);
  }
  return texture;
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
