// The grain of a binding material: threads, fibres or mottling, and the
// shading at the board edges. Pure 2D canvas drawing with no imports beyond
// the seeded random, so the grain worker (`grain-worker.js`) can paint it off
// the main thread. `sheet(w, h)` returns a 2D context for the quarter-size
// soft sheet (a canvas here, an OffscreenCanvas in the worker).

import { hashSeed, seededRandom } from "../util.js";

/** Above this many pixels a board counts as studio size. */
export const GRAIN_CACHE_PIXELS = 768 * 1152;

/** Threads, fibres or mottling, and the shading at the board edges. */
export function paintGrain(ctx, width, height, kind, thread, seed, spine, flip, sheet) {
  const look = { thread };
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
  const useSheet = mottled || width * height * scale * scale > GRAIN_CACHE_PIXELS;
  const soft = useSheet ? sheet(Math.max(2, Math.ceil((width * scale) / 4)), Math.max(2, Math.ceil((height * scale) / 4))) : null;
  const small = soft ? soft.canvas : null;
  const mottle = soft || ctx;
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
