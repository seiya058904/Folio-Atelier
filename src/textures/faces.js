// Cover painters. Each board is two layers, plus an optional third:
//   base   — the dyed material plus anything printed or blind-stamped into it
//   foil   — a white-on-transparent mask that the metallic foil material uses
//   relief — a height map for stamping depth: mid grey is the board, darker
//            is pressed in, lighter stands proud (see `stampTone`)
// Layouts are authored on a logical 768 × 1152 board (320 × 1536 for the spine)
// and scaled to whatever resolution the rig asks for.

import { fontString, fontToken } from "../data/fonts.js";
import { getImage } from "../state/images.js";
import { layerText } from "../state/schema.js";
import { hashSeed, hexToRgb, mixHex, rgba, seededRandom } from "../util.js";
import { drawMotif, hasMotif } from "./motifs.js";
import { hasPattern, patternMask, stampPattern } from "./patterns.js";
import { paintMaterialBase } from "./surface.js";
import { breakText, drawLine, fitDisplayText, isCjk, lineString, setTracking } from "./text.js";

export const FACE_SIZE = {
  front: { width: 768, height: 1152 },
  back: { width: 768, height: 1152 },
  spine: { width: 320, height: 1536 }
};

function begin(target, logical) {
  const { context: ctx, canvas } = target;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / logical.width, 0, 0, canvas.height / logical.height, 0, 0);
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0px";
  return ctx;
}

/** A height-map layer: everything starts at the level of the board. */
function beginRelief(target, logical) {
  if (!target) return null;
  const ctx = begin(target, logical);
  ctx.fillStyle = RELIEF_LEVEL;
  ctx.fillRect(0, 0, logical.width, logical.height);
  return ctx;
}

const RELIEF_LEVEL = "#808080";

/** The height a stamp leaves in the relief layer. */
function stampTone(book) {
  const relief = book.stamp?.relief;
  if (relief === "emboss") return "#ffffff";
  return relief === "deboss" ? "#000000" : RELIEF_LEVEL;
}

/** Trace an onlay's outline (logical board units). */
function traceOnlay(ctx, onlay, width, height, inset = 0) {
  const w = onlay.width * width - inset * 2;
  const h = onlay.height * height - inset * 2;
  const x = onlay.x * width - w / 2;
  const y = onlay.y * height - h / 2;
  ctx.beginPath();
  if (onlay.shape === "oval") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (onlay.shape === "diamond") {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
  } else if (onlay.shape === "arch") {
    const radius = Math.min(w / 2, h * 0.6);
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + radius);
    ctx.arc(x + w / 2, y + radius, w / 2, Math.PI, 0);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  } else if (onlay.shape === "rounded") {
    ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.12);
  } else {
    ctx.rect(x, y, w, h);
  }
}

/**
 * Onlay: a pared piece of leather laid on the board, standing a little proud
 * with a soft shadow. Inlay: the same piece set flush into a cut-out, seen by
 * the fine line where the two meet.
 */
function drawOnlay(layers, book, onlay, width, height) {
  if (!onlay?.show) return;
  const ctx = layers.base;
  const inlay = onlay.mode === "inlay";
  ctx.save();
  if (!inlay) {
    ctx.shadowColor = "rgba(0,0,0,0.34)";
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 2.5;
    ctx.fillStyle = onlay.color;
    traceOnlay(ctx, onlay, width, height);
    ctx.fill();
    ctx.shadowColor = "transparent";
  }
  traceOnlay(ctx, onlay, width, height);
  ctx.clip();
  paintMaterialBase(ctx, width, height, onlay.color, onlay.kind, book.seed + 19, { overlay: fastGrain });
  ctx.restore();
  ctx.save();
  traceOnlay(ctx, onlay, width, height, inlay ? 0 : 1.2);
  ctx.lineWidth = inlay ? 1.8 : 1.4;
  ctx.strokeStyle = inlay ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.16)";
  ctx.stroke();
  ctx.restore();
  if (layers.relief) {
    const relief = layers.relief;
    relief.save();
    traceOnlay(relief, onlay, width, height);
    if (inlay) {
      relief.lineWidth = 2.2;
      relief.strokeStyle = "#000000";
      relief.stroke();
    } else {
      relief.fillStyle = "#c4c4c4";
      relief.fill();
    }
    relief.restore();
  }
}

/**
 * The ink an element leaves on the foil layer: white for the main foil,
 * magenta (no green) for the second. The foil shader tells them apart by the
 * green channel and tints each with its own leaf colour; red stays full, so
 * both press the same depth.
 */
export const leafInk = (element) => (element?.leaf === "second" ? "#ff00ff" : "#ffffff");

/**
 * Route an element's drawing routine to the right layer for its finish.
 * foil  → white (or magenta, second foil) on the foil mask
 * ink   → the element's own colour, printed on the material
 * blind → a tone-on-tone impression pressed into the material
 */
function withFinish(layers, element, draw) {
  const { finish, color } = element;
  if (finish === "foil") {
    draw(layers.foil, leafInk(element));
  } else if (finish === "blind") {
    const ctx = layers.base;
    ctx.save();
    ctx.translate(1.3, 1.5);
    draw(ctx, "rgba(255,255,255,0.11)");
    ctx.restore();
    draw(ctx, "rgba(0,0,0,0.3)");
  } else {
    draw(layers.base, color);
  }
  // Foil and blind stamps are pressed with a heated die; print lies flat.
  if (layers.relief && finish !== "ink") draw(layers.relief, layers.tone);
}

/* ---------- boards: material, two-tone binding, all-over pattern ---------- */

// Set while painting drafts and thumbnails: the grain comes from a cached
// overlay (see `paintMaterialBase`). Full-size boards paint it afresh.
let fastGrain = false;
export function setFastGrain(value) {
  fastGrain = Boolean(value);
}

const STRIP = 0.2;
const TIP = 0.215;

/** Trace the second-colour areas of a quarter or half binding. */
function tracePartRegion(ctx, binding, width, height, hinge) {
  const left = hinge === "left";
  ctx.beginPath();
  ctx.rect(left ? 0 : width * (1 - STRIP), 0, width * STRIP, height);
  if (binding === "half") {
    const x = left ? width : 0;
    const dir = left ? -1 : 1;
    const leg = width * TIP;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + dir * leg, 0);
    ctx.lineTo(x, leg);
    ctx.closePath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + dir * leg, height);
    ctx.lineTo(x, height - leg);
    ctx.closePath();
  }
}

function stampFinish(layers, mask, width, height, element, opacity) {
  const { finish, color } = element;
  if (finish === "foil") {
    stampPattern(layers.foil, mask, width, height, leafInk(element), opacity);
  } else if (finish === "blind") {
    stampPattern(layers.base, mask, width, height, "rgb(255,255,255)", 0.13 * opacity, 1.3, 1.5);
    stampPattern(layers.base, mask, width, height, "rgb(0,0,0)", 0.34 * opacity);
  } else {
    stampPattern(layers.base, mask, width, height, color, opacity);
  }
  if (layers.relief && finish !== "ink") stampPattern(layers.relief, mask, width, height, layers.tone, opacity);
}

function paintBoard(layers, target, book, face, width, height) {
  const material = book.material;
  const hinge = face === "back" ? "right" : "left";
  const ctx = layers.base;
  const seed = book.seed + (face === "back" ? 3 : 0);
  const twoTone = material.binding === "quarter" || material.binding === "half";
  paintMaterialBase(ctx, width, height, material.color, material.kind, seed, { flip: hinge === "right", overlay: fastGrain });

  const pattern = book.pattern;
  if (pattern && hasPattern(pattern.key)) {
    const mask = patternMask(pattern.key, target.canvas.width, target.canvas.height, { width, height }, {
      scale: pattern.scale || 1, seed: book.seed
    });
    const clipFoil = pattern.finish === "foil" && twoTone;
    if (clipFoil) {
      layers.foil.save();
      tracePartRegion(layers.foil, material.binding, width, height, hinge);
      layers.foil.rect(0, 0, width, height);
      layers.foil.clip("evenodd");
    }
    stampFinish(layers, mask, width, height, pattern, pattern.opacity ?? 0.6);
    if (clipFoil) layers.foil.restore();
  }

  if (twoTone) {
    const left = hinge === "left";
    ctx.save();
    tracePartRegion(ctx, material.binding, width, height, hinge);
    ctx.clip();
    paintMaterialBase(ctx, width, height, material.second, material.kind, seed + 11, { flip: !left, overlay: fastGrain });
    ctx.restore();
    // The second covering laps over the first: a lit edge with a shadow beside it.
    const seam = (x1, y1, x2, y2, nx, ny) => {
      ctx.save();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.moveTo(x1 + nx * 1.6, y1 + ny * 1.6);
      ctx.lineTo(x2 + nx * 1.6, y2 + ny * 1.6);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.moveTo(x1 - nx * 0.6, y1 - ny * 0.6);
      ctx.lineTo(x2 - nx * 0.6, y2 - ny * 0.6);
      ctx.stroke();
      ctx.restore();
    };
    const dir = left ? 1 : -1;
    const stripX = left ? width * STRIP : width * (1 - STRIP);
    seam(stripX, 0, stripX, height, dir, 0);
    if (material.binding === "half") {
      const x = left ? width : 0;
      const leg = width * TIP;
      seam(x - dir * leg, 0, x, leg, -dir * 0.7, 0.7);
      seam(x - dir * leg, height, x, height - leg, -dir * 0.7, -0.7);
    }
  }

  // Stab binding: thread through holes near the hinge, wrapped round the spine.
  const stitch = book.details.stitch;
  if (stitch?.show) {
    const left = hinge === "left";
    const x = left ? width * 0.062 : width * (1 - 0.062);
    const edge = left ? 0 : width;
    const holes = stitchHoles(stitch.holes);
    ctx.save();
    ctx.lineCap = "round";
    const thread = (x1, y1, x2, y2) => {
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      ctx.moveTo(x1 + 1, y1 + 1.4);
      ctx.lineTo(x2 + 1, y2 + 1.4);
      ctx.stroke();
      ctx.strokeStyle = stitch.color;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    thread(x, 0, x, height);
    holes.forEach((position) => thread(edge, position * height, x, position * height));
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    holes.forEach((position) => {
      ctx.beginPath();
      ctx.arc(x, position * height, 2.3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}

export const stitchHoles = (count) => (Number(count) === 6
  ? [0.05, 0.14, 0.38, 0.62, 0.86, 0.95]
  : [0.07, 0.355, 0.645, 0.93]);

/** Metal corner pieces, cut into the foil layer at the fore-edge corners. */
function drawCorners(ctx, style, width, height, hinge) {
  if (!style || style === "none") return;
  const left = hinge === "left";
  const x = left ? width : 0;
  const dir = left ? -1 : 1;
  const leg = width * 0.17;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  [[0, 1], [height, -1]].forEach(([y, dy]) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * leg, y);
    if (style === "scalloped") {
      ctx.quadraticCurveTo(x + dir * leg * 0.62, y + dy * leg * 0.3, x + dir * leg * 0.5, y + dy * leg * 0.5);
      ctx.quadraticCurveTo(x + dir * leg * 0.3, y + dy * leg * 0.62, x, y + dy * leg);
    } else {
      ctx.lineTo(x, y + dy * leg);
    }
    ctx.closePath();
    ctx.fill();
    if (style !== "plain") {
      // Engraving: lines and a rivet cut out of the leaf.
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = 1.6;
      [0.52, 0.66].forEach((t) => {
        ctx.beginPath();
        ctx.moveTo(x + dir * leg * t, y + dy * 5);
        ctx.lineTo(x + dir * 5, y + dy * leg * t);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.arc(x + dir * leg * 0.2, y + dy * leg * 0.2, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x + dir * leg * 0.2, y + dy * leg * 0.2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

/* ---------- borders ---------- */

const CORNERS = (m, width, height) => [[m, m, 1, 1], [width - m, m, -1, 1], [m, height - m, 1, -1], [width - m, height - m, -1, -1]];

function drawBorder(ctx, color, style, inset, width, height) {
  const m = inset * width;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineJoin = "miter";
  const rect = (offset, lineWidth) => {
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(m + offset, m + offset, width - (m + offset) * 2, height - (m + offset) * 2);
  };
  // Run `unit(a, pitch)` along all four sides; (a, b) are along / inward.
  const sides = (offset, target, unit) => {
    const o = m + offset;
    [
      [o, o, 1, 0, 0, 1, width - o * 2],
      [width - o, o, 0, 1, -1, 0, height - o * 2],
      [width - o, height - o, -1, 0, 0, -1, width - o * 2],
      [o, height - o, 0, -1, 1, 0, height - o * 2]
    ].forEach(([x0, y0, ux, uy, vx, vy, length]) => {
      const count = Math.max(1, Math.round(length / target));
      const pitch = length / count;
      const at = (a, b) => [x0 + ux * a + vx * b, y0 + uy * a + vy * b];
      for (let index = 0; index < count; index += 1) unit(index * pitch, pitch, at);
    });
  };
  if (style === "single") {
    rect(0, 2.2);
  } else if (style === "double") {
    rect(0, 2);
    rect(13, 2);
  } else if (style === "triple") {
    rect(0, 6);
    rect(13, 1.6);
    rect(21, 1.6);
  } else if (style === "rounded") {
    [[0, 2.2, 34], [12, 1.3, 24]].forEach(([offset, lineWidth, radius]) => {
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.roundRect(m + offset, m + offset, width - (m + offset) * 2, height - (m + offset) * 2, radius);
      ctx.stroke();
    });
  } else if (style === "corners") {
    const arm = width * 0.085;
    ctx.lineWidth = 2.4;
    CORNERS(m, width, height).forEach(([x, y, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * arm);
      ctx.stroke();
    });
  } else if (style === "deco") {
    rect(0, 2);
    const step = width * 0.034;
    ctx.lineWidth = 1.6;
    CORNERS(m, width, height).forEach(([x, y, dx, dy]) => {
      for (let ring = 1; ring <= 3; ring += 1) {
        const reach = step * (4 - ring) * 1.5;
        ctx.beginPath();
        ctx.moveTo(x + dx * (ring * step + reach), y + dy * ring * step);
        ctx.lineTo(x + dx * ring * step, y + dy * ring * step);
        ctx.lineTo(x + dx * ring * step, y + dy * (ring * step + reach));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x + dx * step * 4.6, y + dy * step * 4.6, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (style === "ornate") {
    // A ticket frame: corners bitten out by quarter circles, with a curl in each.
    const q = width * 0.062;
    const frame = (offset, lineWidth) => {
      const l = m + offset;
      const r = width - m - offset;
      const t = m + offset;
      const b = height - m - offset;
      const radius = q - offset * 0.2;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(l + radius, t);
      ctx.lineTo(r - radius, t);
      ctx.arc(r, t, radius, Math.PI, Math.PI / 2, true);
      ctx.lineTo(r, b - radius);
      ctx.arc(r, b, radius, Math.PI * 1.5, Math.PI, true);
      ctx.lineTo(l + radius, b);
      ctx.arc(l, b, radius, 0, Math.PI * 1.5, true);
      ctx.lineTo(l, t + radius);
      ctx.arc(l, t, radius, Math.PI / 2, 0, true);
      ctx.closePath();
      ctx.stroke();
    };
    frame(0, 2.2);
    frame(11, 1.2);
    CORNERS(m, width, height).forEach(([x, y, dx, dy]) => {
      ctx.beginPath();
      ctx.arc(x + dx * q * 0.2, y + dy * q * 0.2, 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x + dx * q * 0.2, y + dy * q * 0.2, q * 0.46, 0, Math.PI * 2);
      ctx.stroke();
      const cx = x + dx * q * 1.5;
      const cy = y + dy * q * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7);
      ctx.lineTo(cx + 5, cy);
      ctx.lineTo(cx, cy + 7);
      ctx.lineTo(cx - 5, cy);
      ctx.closePath();
      ctx.fill();
    });
  } else if (style === "beaded") {
    rect(13, 1.4);
    sides(0, 15, (a, pitch, at) => {
      const [x, y] = at(a + pitch / 2, 0);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (style === "meander") {
    rect(0, 2);
    rect(27, 2);
    ctx.lineWidth = 1.7;
    ctx.lineCap = "square";
    const key = [[0.12, 0.76], [0.12, 0.24], [0.88, 0.24], [0.88, 0.76], [0.38, 0.76], [0.38, 0.5], [0.64, 0.5]];
    const band = 27;
    sides(0, 27, (a, pitch, at) => {
      // Leave the four corner squares clear.
      if (a < band - 1) return;
      ctx.beginPath();
      key.forEach(([u, v], index) => {
        const [x, y] = at(a + u * pitch, v * band);
        if (index) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
    CORNERS(m, width, height).forEach(([x, y, dx, dy]) => {
      ctx.fillRect(x + dx * band * 0.5 - 4, y + dy * band * 0.5 - 4, 8, 8);
    });
  } else if (style === "scallop") {
    rect(0, 2.2);
    ctx.lineWidth = 1.5;
    sides(0, 30, (a, pitch, at) => {
      const [x1, y1] = at(a, 0);
      const [cx, cy] = at(a + pitch / 2, pitch * 0.62);
      const [x2, y2] = at(a + pitch, 0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
    });
  } else if (style === "lozenge") {
    rect(0, 2.2);
    const o = m + 12;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(width / 2, o);
    ctx.lineTo(width - o, height / 2);
    ctx.lineTo(width / 2, height - o);
    ctx.lineTo(o, height / 2);
    ctx.closePath();
    ctx.stroke();
    CORNERS(m + 30, width, height).forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x + 8, y);
      ctx.lineTo(x, y + 12);
      ctx.lineTo(x - 8, y);
      ctx.closePath();
      ctx.fill();
    });
  } else if (style === "fillets") {
    // Gold-tooled fillets: a thick and a thin line with a dotted roll between.
    rect(0, 3.2);
    rect(9, 1.2);
    rect(30, 1.2);
    sides(19.5, 11, (a, pitch, at) => {
      const [x, y] = at(a + pitch / 2, 0);
      ctx.beginPath();
      ctx.arc(x, y, 1.9, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (style === "roll") {
    // A decorative roll: a running leaf-and-berry band between two fillets.
    rect(0, 1.8);
    rect(30, 1.8);
    ctx.lineWidth = 1.3;
    sides(15, 24, (a, pitch, at) => {
      const [x0, y0] = at(a, 0);
      const [cx, cy] = at(a + pitch * 0.5, -7);
      const [x1, y1] = at(a + pitch, 0);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
      const [lx, ly] = at(a + pitch * 0.5, 5);
      ctx.beginPath();
      ctx.ellipse(lx, ly, 4.2, 2, Math.atan2(y1 - y0, x1 - x0), 0, Math.PI * 2);
      ctx.fill();
      const [bx, by] = at(a, 0);
      ctx.beginPath();
      ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (style === "fleurons") {
    // A panel frame of two fillets with a fleuron tooled into each corner.
    rect(0, 2.4);
    rect(10, 1.1);
    const reach = width * 0.07;
    CORNERS(m + 10, width, height).forEach(([x, y, dx, dy]) => {
      ctx.save();
      ctx.translate(x + dx * reach, y + dy * reach);
      // Each fleuron points into its corner.
      ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      drawMotif(ctx, "fleur", { cx: 0, cy: 0, size: reach * 0.62, color, alpha: 1, lineWidth: 1.6, text: "" });
      ctx.restore();
    });
  } else if (style === "arch") {
    const left = m;
    const right = width - m;
    const radius = (right - left) / 2;
    [0, 13].forEach((offset, index) => {
      ctx.lineWidth = index ? 1.6 : 2.2;
      ctx.beginPath();
      ctx.moveTo(left + offset, height - m - offset);
      ctx.lineTo(left + offset, m + radius);
      ctx.arc(width / 2, m + radius, radius - offset, Math.PI, 0);
      ctx.lineTo(right - offset, height - m - offset);
      ctx.closePath();
      ctx.stroke();
    });
  }
  ctx.restore();
}

/** The pasted paper label used by the "Label" layout. */
function drawPanel(layers, border, width, height) {
  // "slip" is the tall title slip of a thread-bound book, pasted near the hinge.
  const slip = border.style === "slip";
  const x = width * (slip ? 0.105 : 0.15);
  const y = height * (slip ? 0.075 : 0.155);
  const w = width * (slip ? 0.2 : 0.7);
  const h = height * (slip ? 0.51 : 0.3);
  if (border.finish === "ink") {
    const ctx = layers.base;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = border.color;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = rgba("#1c1712", 0.55);
    const gap = slip ? 8 : 13;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x + gap, y + gap, w - gap * 2, h - gap * 2);
    if (!slip) {
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x + 19, y + 19, w - 38, h - 38);
    }
    ctx.restore();
  } else {
    withFinish(layers, border, (ctx, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.strokeRect(x, y, w, h);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 11, y + 11, w - 22, h - 22);
      ctx.restore();
    });
  }
}

/* ---------- text ---------- */

/**
 * Set a line down the sheet. CJK reads upright, one character per line;
 * anything else is turned a quarter and reads top to bottom.
 */
function drawVerticalText(ctx, text, layer, cx, cy, room, maxSize) {
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  if (isCjk(text) && !/[A-Za-z]{2,}/.test(text)) {
    const characters = [...text.replace(/\s+/g, "")];
    let size = Math.min(layer.size, maxSize);
    let pitch = size * (1.12 + (layer.tracking || 0));
    if (pitch * characters.length > room) {
      size *= room / (pitch * characters.length);
      pitch = size * (1.12 + (layer.tracking || 0));
    }
    ctx.font = fontString(layer, size);
    ctx.letterSpacing = "0px";
    const top = cy - (pitch * (characters.length - 1)) / 2;
    characters.forEach((character, index) => {
      ctx.fillText(character, cx, top + index * pitch);
    });
    return;
  }
  let size = Math.min(layer.size, maxSize);
  const setFont = (value) => {
    ctx.font = fontString(layer, value);
    setTracking(ctx, layer.tracking, value);
  };
  setFont(size);
  const measured = ctx.measureText(text).width;
  if (measured > room) {
    size *= room / measured;
    setFont(size);
  }
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(text, (layer.tracking || 0) * size * 0.5, size * 0.04);
}

function drawTextLayer(layers, book, layer, width, height) {
  if (!layer.show) return;
  const text = layerText(book, layer).trim();
  if (!text) return;
  if (layer.vertical) {
    withFinish(layers, layer, (ctx, color) => {
      ctx.save();
      ctx.fillStyle = color;
      drawVerticalText(ctx, text, layer, layer.x * width, layer.y * height, (layer.width || 0.5) * height, width * 0.24);
      ctx.restore();
    });
    return;
  }
  const maxWidth = (layer.width || 0.8) * width;
  const isDisplay = layer.size >= 44;

  withFinish(layers, layer, (ctx, color) => {
    ctx.save();
    ctx.fillStyle = color;
    const setFont = (size) => {
      ctx.font = fontString(layer, size);
      setTracking(ctx, layer.tracking, size);
    };
    const fitted = fitDisplayText(ctx, text, {
      size: layer.size,
      maxWidth,
      maxLines: isDisplay ? 3 : 14,
      minScale: isDisplay ? 0.4 : 0.7,
      setFont
    });
    setFont(fitted.size);
    const lineHeight = fitted.size * (layer.lineHeight || 1.05);
    const block = lineHeight * (fitted.lines.length - 1);
    let top = layer.y * height - block / 2;
    if (layer.anchor === "top") top = layer.y * height;
    if (layer.anchor === "bottom") top = layer.y * height - block;
    // Tracking adds a trailing gap after the last glyph; nudge centred and
    // right-aligned lines so the visible letters stay optically placed.
    const trail = (layer.tracking || 0) * fitted.size;
    const x = layer.x * width + (layer.align === "center" ? trail / 2 : layer.align === "right" ? trail : 0);
    ctx.textBaseline = "middle";
    fitted.lines.forEach((line, index) => {
      drawLine(ctx, line, x, top + index * lineHeight, { align: layer.align });
    });
    ctx.restore();
  });
}

function drawMotifLayer(layers, book, motif, width, height) {
  if (!motif || !hasMotif(motif.key)) return;
  const size = Math.min(width, height) * 0.22 * (motif.scale || 1);
  withFinish(layers, motif, (ctx, color) => {
    drawMotif(ctx, motif.key, {
      cx: motif.x * width,
      cy: motif.y * height,
      size,
      color,
      alpha: motif.finish === "foil" ? 1 : motif.opacity ?? 0.9,
      lineWidth: Math.max(2.6, size * 0.016),
      text: book.title
    });
  });
}

/* ---------- image ---------- */

/* ---------- image treatments: duotone, halftone, engraving ---------- */

/** The treatment chosen for the front picture, with inks taken from the cloth. */
function imageTreatment(book) {
  const image = book.front.image;
  const kind = image?.treatment || "none";
  if (kind === "none") return null;
  const cloth = book.material.color;
  return {
    kind,
    id: image.id,
    dark: mixHex(cloth, "#120e0b", 0.7),
    light: mixHex(cloth, "#f4ecdc", 0.82)
  };
}

// Treated pictures are cached: a drag elsewhere on the cover repaints the
// board many times, and the treatment does not change with it.
const treatedCache = new Map();

function luminanceAt(data, index) {
  return (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
}

const smooth = (edge0, edge1, value) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * The picture cropped to width x height device pixels and treated: duotone
 * maps light and dark to two inks, halftone prints it as a dot screen,
 * engraving as lines that swell in the shadows.
 */
function treatedImage(image, imageId, treatment, width, height, dark, light, frame) {
  const [sx, sy, sw, sh] = cropSource(image, width, height, frame);
  const key = `${imageId}|${treatment}|${width}x${height}|${dark}|${light}|${[sx, sy, sw, sh].map(Math.round)}`;
  if (treatedCache.has(key)) return treatedCache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  const data = pixels.data;
  const [dr, dg, db] = hexToRgb(dark);
  const [lr, lg, lb] = hexToRgb(light);
  // amount: 0 is bare paper, 1 full ink.
  const ink = (index, amount) => {
    data[index] = lr + (dr - lr) * amount;
    data[index + 1] = lg + (dg - lg) * amount;
    data[index + 2] = lb + (db - lb) * amount;
    data[index + 3] = 255;
  };
  // Coarse enough to read on a board seen whole, fine enough to read as a print.
  const cell = Math.max(6, Math.round(Math.max(width, height) / 62));
  const toneOf = (index) => smooth(0.08, 0.92, luminanceAt(data, index));
  if (treatment === "duotone") {
    for (let index = 0; index < data.length; index += 4) {
      ink(index, 1 - smooth(0.04, 0.96, luminanceAt(data, index)));
    }
  } else if (treatment === "halftone") {
    // The tone at each dot's centre, on a screen turned 45 degrees.
    const tone = new Float32Array(width * height);
    for (let index = 0, p = 0; p < tone.length; index += 4, p += 1) tone[p] = toneOf(index);
    const c = Math.SQRT1_2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const u = (x * c + y * c) / cell;
        const v = (-x * c + y * c) / cell;
        const cu = Math.floor(u) + 0.5;
        const cv = Math.floor(v) + 0.5;
        const cx = Math.min(width - 1, Math.max(0, Math.round((cu - cv) * c * cell)));
        const cy = Math.min(height - 1, Math.max(0, Math.round((cu + cv) * c * cell)));
        const radius = Math.sqrt(1 - tone[cy * width + cx]) * 0.72;
        const distance = Math.hypot(u - cu, v - cv);
        ink((y * width + x) * 4, 1 - smooth(radius - 0.06, radius + 0.06, distance));
      }
    }
  } else if (treatment === "engraving") {
    const spacing = Math.max(5, cell * 0.9);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const darkness = 1 - toneOf(index);
        // The lines follow a gentle wave, as an engraver's burin does.
        const line = (((y + Math.sin(x / (spacing * 9)) * spacing * 0.6) / spacing) % 1 + 1) % 1;
        const distance = Math.abs(line - 0.5) * 2;
        ink(index, 1 - smooth(darkness * 0.95 - 0.12, darkness * 0.95 + 0.04, distance));
      }
    }
  }
  ctx.putImageData(pixels, 0, 0);
  treatedCache.set(key, canvas);
  if (treatedCache.size > 6) treatedCache.delete(treatedCache.keys().next().value);
  return canvas;
}

/**
 * The part of the picture that fills a w x h box: cover-fitted, then
 * enlarged by `frame.zoom` about the point `frame.focusX`, `frame.focusY`
 * (0..1 across and down the picture).
 */
function cropSource(image, w, h, frame) {
  const zoom = Math.min(4, Math.max(1, frame?.zoom ?? 1));
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight) * zoom;
  const sw = w / scale;
  const sh = h / scale;
  const fx = Math.min(1, Math.max(0, frame?.focusX ?? 0.5));
  const fy = Math.min(1, Math.max(0, frame?.focusY ?? 0.5));
  return [(image.naturalWidth - sw) * fx, (image.naturalHeight - sh) * fy, sw, sh];
}

function drawCoverImage(ctx, image, x, y, w, h, treatment = null, frame = null) {
  if (treatment) {
    // Treated at the board's device resolution (capped), then placed.
    const transform = ctx.getTransform();
    const scaleX = Math.hypot(transform.a, transform.b);
    const scaleY = Math.hypot(transform.c, transform.d);
    const factor = Math.min(1, 1400 / Math.max(w * scaleX, h * scaleY, 1));
    const width = Math.max(8, Math.round(w * scaleX * factor));
    const height = Math.max(8, Math.round(h * scaleY * factor));
    ctx.drawImage(treatedImage(image, treatment.id, treatment.kind, width, height, treatment.dark, treatment.light, frame), x, y, w, h);
    return;
  }
  const [sx, sy, sw, sh] = cropSource(image, w, h, frame);
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

/* ---------- wear ---------- */

/**
 * Age: rubbed corners and edges, sun-fading, and foil worn away where hands
 * hold the book. `outer` is the side away from the hinge ("right" on the
 * front board, "left" on the back); the spine wears at head and tail.
 */
function applyWear(layers, book, width, height, face) {
  const wear = book.wear;
  if (!wear || (!wear.scuff && !wear.fade)) return;
  const ctx = layers.base;
  const random = seededRandom(hashSeed(`wear-${book.seed}-${face}`));
  ctx.save();
  if (wear.fade > 0) {
    // Light bleaches the dye: strongest along the top, and on the whole spine.
    ctx.globalCompositeOperation = "saturation";
    ctx.fillStyle = `rgba(128,128,128,${wear.fade * 0.55})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "screen";
    const fade = ctx.createLinearGradient(0, 0, 0, height);
    const top = wear.fade * (face === "spine" ? 0.34 : 0.24);
    fade.addColorStop(0, `rgba(255,244,222,${top})`);
    fade.addColorStop(face === "spine" ? 1 : 0.55, `rgba(255,244,222,${face === "spine" ? top * 0.6 : 0})`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, height);
  }
  if (wear.scuff > 0) {
    ctx.globalCompositeOperation = "screen";
    const rub = (x, y, radius, strength) => {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(235,220,196,${strength})`);
      glow.addColorStop(1, "rgba(235,220,196,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    const s = wear.scuff;
    if (face === "spine") {
      [0, height].forEach((y) => rub(width / 2, y, width * 0.9, s * 0.4));
    } else {
      const x = face === "front" ? width : 0;
      [0, height].forEach((y) => rub(x, y, width * 0.16, s * 0.55));
      // The fore-edge is rubbed along its whole length.
      const edge = ctx.createLinearGradient(x, 0, face === "front" ? width - 26 : 26, 0);
      edge.addColorStop(0, `rgba(235,220,196,${s * 0.28})`);
      edge.addColorStop(1, "rgba(235,220,196,0)");
      ctx.fillStyle = edge;
      ctx.fillRect(face === "front" ? width - 26 : 0, 0, 26, height);
    }
    // Small scratches and specks across the board.
    ctx.globalCompositeOperation = "source-over";
    const count = Math.round(s * (face === "spine" ? 60 : 140));
    for (let index = 0; index < count; index += 1) {
      ctx.strokeStyle = random() > 0.5 ? `rgba(255,240,215,${0.06 + random() * 0.1})` : `rgba(0,0,0,${0.05 + random() * 0.08})`;
      ctx.lineWidth = 0.6 + random();
      const x = random() * width;
      const y = random() * height;
      const angle = random() * Math.PI;
      const length = 3 + random() * 18;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    }
    // Foil flakes away, most where the book is handled.
    const foil = layers.foil;
    foil.save();
    foil.globalCompositeOperation = "destination-out";
    const flakes = Math.round(s * s * (face === "spine" ? 900 : 1600));
    for (let index = 0; index < flakes; index += 1) {
      const edgeBias = random() < 0.5;
      const x = edgeBias && face !== "spine" ? (face === "front" ? width - random() * width * 0.3 : random() * width * 0.3) : random() * width;
      const y = edgeBias && face === "spine" ? (random() < 0.5 ? random() * height * 0.15 : height - random() * height * 0.15) : random() * height;
      foil.fillStyle = `rgba(0,0,0,${0.4 + random() * 0.6})`;
      foil.beginPath();
      foil.arc(x, y, 0.8 + random() * 2.6, 0, Math.PI * 2);
      foil.fill();
    }
    foil.restore();
  }
  ctx.restore();
}

/* ---------- boards ---------- */

/** Hand the layers named in `commit` to the GPU (both when it is omitted). */
function commitLayers(baseTarget, foilTarget, commit) {
  if (!commit || commit.base) baseTarget.commit();
  if (!commit || commit.foil) foilTarget.commit();
}

export function paintFront(book, baseTarget, foilTarget, onAsset, commit, reliefTarget = null) {
  const { width, height } = FACE_SIZE.front;
  const layers = {
    base: begin(baseTarget, FACE_SIZE.front),
    foil: begin(foilTarget, FACE_SIZE.front),
    relief: beginRelief(reliefTarget, FACE_SIZE.front),
    tone: stampTone(book)
  };
  const front = book.front;
  paintBoard(layers, baseTarget, book, "front", width, height);
  drawOnlay(layers, book, front.onlay, width, height);

  if (front.image?.id) {
    const image = getImage(front.image.id, onAsset);
    if (image) {
      const ctx = layers.base;
      ctx.save();
      ctx.globalAlpha = front.image.opacity ?? 1;
      if (front.image.mode === "plate") {
        const x = width * 0.13;
        const y = height * 0.115;
        const w = width * 0.74;
        const h = height * 0.5;
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 9;
        ctx.shadowOffsetY = 3;
        drawCoverImage(ctx, image, x, y, w, h, imageTreatment(book), front.image);
      } else {
        drawCoverImage(ctx, image, 0, 0, width, height, imageTreatment(book), front.image);
        ctx.globalAlpha = 1;
        const shade = ctx.createLinearGradient(0, 0, width, 0);
        shade.addColorStop(0, "rgba(0,0,0,0.2)");
        shade.addColorStop(0.055, "rgba(255,255,255,0.02)");
        shade.addColorStop(0.92, "rgba(0,0,0,0)");
        shade.addColorStop(1, "rgba(0,0,0,0.12)");
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
    }
  }

  if (front.border.style === "panel" || front.border.style === "slip") {
    drawPanel(layers, front.border, width, height);
  } else if (front.border.style !== "none") {
    withFinish(layers, front.border, (ctx, color) => {
      drawBorder(ctx, color, front.border.style, front.border.inset, width, height);
    });
  }
  drawMotifLayer(layers, book, front.motif, width, height);
  front.texts.forEach((layer) => drawTextLayer(layers, book, layer, width, height));
  drawCorners(layers.foil, book.details.corners?.style, width, height, "left");
  applyWear(layers, book, width, height, "front");
  commitLayers(baseTarget, foilTarget, commit);
  reliefTarget?.commit();
}

export function paintBack(book, baseTarget, foilTarget, onAsset, commit, reliefTarget = null) {
  const { width, height } = FACE_SIZE.back;
  const layers = {
    base: begin(baseTarget, FACE_SIZE.back),
    foil: begin(foilTarget, FACE_SIZE.back),
    relief: beginRelief(reliefTarget, FACE_SIZE.back),
    tone: stampTone(book)
  };
  const back = book.back;
  paintBoard(layers, baseTarget, book, "back", width, height);

  if (!["none", "panel", "slip"].includes(back.border.style)) {
    withFinish(layers, back.border, (ctx, color) => {
      drawBorder(ctx, color, back.border.style, back.border.inset, width, height);
    });
  }
  drawMotifLayer(layers, book, back.motif, width, height);
  back.texts.forEach((layer) => drawTextLayer(layers, book, layer, width, height));
  drawCorners(layers.foil, book.details.corners?.style, width, height, "right");
  applyWear(layers, book, width, height, "back");
  commitLayers(baseTarget, foilTarget, commit);
  reliefTarget?.commit();
}

function drawSpineText(layers, book, layer, width, height, room) {
  if (!layer.show) return;
  const text = layerText(book, layer).trim();
  if (!text) return;
  withFinish(layers, layer, (ctx, color) => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    if (layer.orient === "horizontal") {
      const setFont = (size) => {
        ctx.font = fontString(layer, size);
        setTracking(ctx, layer.tracking, size);
      };
      const fitted = fitDisplayText(ctx, text, {
        size: layer.size, maxWidth: width * 0.62, maxLines: 4, minScale: 0.45, setFont
      });
      setFont(fitted.size);
      const lineHeight = fitted.size * 1.16;
      const top = layer.y * height - (lineHeight * (fitted.lines.length - 1)) / 2;
      const trail = (layer.tracking || 0) * fitted.size * 0.5;
      fitted.lines.forEach((line, index) => {
        ctx.fillText(lineString(line), width / 2 + trail, top + index * lineHeight);
      });
    } else {
      drawVerticalText(ctx, text, layer, width / 2, layer.y * height, room, width * 0.54);
    }
    ctx.restore();
  });
}

const BAND_POSITIONS = [0.135, 0.3, 0.7, 0.865];
const BANDED = new Set(["bands", "panels", "compartments"]);

export function paintSpine(book, baseTarget, foilTarget, onAsset, commit, reliefTarget = null) {
  const { width, height } = FACE_SIZE.spine;
  const layers = {
    base: begin(baseTarget, FACE_SIZE.spine),
    foil: begin(foilTarget, FACE_SIZE.spine),
    relief: beginRelief(reliefTarget, FACE_SIZE.spine),
    tone: stampTone(book)
  };
  const spine = book.spine;
  const material = book.material;
  const twoTone = material.binding === "quarter" || material.binding === "half";
  paintMaterialBase(layers.base, width, height, twoTone ? material.second : material.color, material.kind, book.seed + 7, { spine: true, overlay: fastGrain });

  const pattern = book.pattern;
  if (!twoTone && pattern?.spine && hasPattern(pattern.key)) {
    const mask = patternMask(pattern.key, baseTarget.canvas.width, baseTarget.canvas.height, { width, height }, {
      scale: (pattern.scale || 1) * 1.3, seed: book.seed + 1
    });
    stampFinish(layers, mask, width, height, pattern, pattern.opacity ?? 0.6);
  }

  const stitch = book.details.stitch;
  if (stitch?.show) {
    const ctx = layers.base;
    ctx.save();
    stitchHoles(stitch.holes).forEach((position) => {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(0, position * height + 0.6, width, 4.6);
      ctx.fillStyle = stitch.color;
      ctx.fillRect(0, position * height - 1.7, width, 3.4);
    });
    ctx.restore();
  }

  // A pasted title label, as on a leather-backed library binding.
  const title = spine.texts.find((layer) => layer.id === "spine-title");
  const labelled = Boolean(spine.label?.show && title);
  const labelHalf = labelled ? (title.orient === "horizontal" ? 0.085 : 0.2) * height : 0;
  if (labelled) {
    const ctx = layers.base;
    const top = title.y * height - labelHalf;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = spine.label.color;
    ctx.fillRect(22, top, width - 44, labelHalf * 2);
    ctx.restore();
    const shade = ctx.createLinearGradient(0, 0, width, 0);
    shade.addColorStop(0, "rgba(0,0,0,0.16)");
    shade.addColorStop(0.3, "rgba(255,255,255,0.04)");
    shade.addColorStop(1, "rgba(0,0,0,0.14)");
    ctx.fillStyle = shade;
    ctx.fillRect(22, top, width - 44, labelHalf * 2);
  }

  withFinish(layers, spine, (ctx, color) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (labelled) {
      [-1, 1].forEach((side) => {
        ctx.fillRect(30, title.y * height + side * (labelHalf - 9) - 1, width - 60, 2);
      });
    }
    if (spine.style === "frame" || spine.style === "double") {
      ctx.lineWidth = 2.4;
      ctx.strokeRect(30, 38, width - 60, height - 76);
      if (spine.style === "double") {
        ctx.lineWidth = 1.2;
        ctx.strokeRect(40, 48, width - 80, height - 96);
      }
    } else if (spine.style === "rules") {
      [44, 60, height - 60, height - 44].forEach((y, index) => {
        ctx.fillRect(26, y, width - 52, index === 0 || index === 3 ? 4 : 1.6);
      });
    } else if (BANDED.has(spine.style)) {
      BAND_POSITIONS.forEach((position) => {
        const y = position * height;
        ctx.fillRect(18, y - 9, width - 36, 2);
        ctx.fillRect(18, y + 7, width - 36, 2);
      });
      [36, height - 36].forEach((y) => ctx.fillRect(18, y - 2, width - 36, 4));
      if (spine.style === "compartments") {
        // Tooled compartments: a fillet round each one and a fleuron in
        // those that carry no lettering.
        const stops = [36 / height, ...BAND_POSITIONS, 1 - 36 / height];
        const lettered = spine.texts
          .filter((layer) => layer.show && layerText(book, layer).trim())
          .map((layer) => layer.y);
        ctx.lineWidth = 1.1;
        for (let index = 0; index < stops.length - 1; index += 1) {
          const top = stops[index] * height + 18;
          const bottom = stops[index + 1] * height - 18;
          if (bottom - top < 40) continue;
          ctx.strokeRect(28, top, width - 56, bottom - top);
          ctx.strokeRect(36, top + 8, width - 72, bottom - top - 16);
          const occupied = lettered.some((y) => y > stops[index] && y < stops[index + 1])
            || (labelled && title.y > stops[index] && title.y < stops[index + 1]);
          if (occupied) continue;
          drawMotif(ctx, "fleur", {
            cx: width / 2, cy: (top + bottom) / 2, size: Math.min(34, (bottom - top) * 0.3),
            color, alpha: 1, lineWidth: 1.6, text: ""
          });
        }
      }
      if (spine.style === "panels") {
        const stops = [36 / height, ...BAND_POSITIONS, 1 - 36 / height];
        ctx.lineWidth = 1.2;
        for (let index = 0; index < stops.length - 1; index += 1) {
          const top = stops[index] * height + 22;
          const bottom = stops[index + 1] * height - 22;
          if (labelled && index === 2) continue;
          ctx.strokeRect(34, top, width - 68, bottom - top);
        }
        const cy = ((BAND_POSITIONS[0] + BAND_POSITIONS[1]) / 2) * height;
        ctx.beginPath();
        ctx.moveTo(width / 2, cy - 30);
        ctx.lineTo(width / 2 + 20, cy);
        ctx.lineTo(width / 2, cy + 30);
        ctx.lineTo(width / 2 - 20, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (spine.emblem === "diamond") {
      const y = height - 122;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(width / 2, y - 30);
      ctx.lineTo(width / 2 + 21, y);
      ctx.lineTo(width / 2, y + 30);
      ctx.lineTo(width / 2 - 21, y);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(width / 2, y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (spine.emblem === "star") {
      const y = height - 122;
      ctx.beginPath();
      for (let index = 0; index < 16; index += 1) {
        const radius = index % 2 ? 7 : index % 4 === 0 ? 28 : 16;
        const angle = (index / 16) * Math.PI * 2 - Math.PI / 2;
        const px = width / 2 + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (index) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    if (spine.emblem === "ring") {
      const y = height - 122;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(width / 2, y, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(width / 2 - 24, y);
      ctx.lineTo(width / 2 + 24, y);
      ctx.stroke();
    }
    ctx.restore();
  });

  if (spine.emblem === "motif" && hasMotif(book.front.motif.key)) {
    withFinish(layers, spine, (ctx, color) => {
      drawMotif(ctx, book.front.motif.key, {
        cx: width / 2, cy: height - 128, size: 44, color, alpha: 1, lineWidth: 2, text: book.title
      });
    });
  }

  if (BANDED.has(spine.style)) {
    // Raised bands: a soft shadow under each cord so the bump reads in the dye too.
    const ctx = layers.base;
    BAND_POSITIONS.forEach((position) => {
      const y = position * height;
      const shade = ctx.createLinearGradient(0, y - 16, 0, y + 20);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(0.35, "rgba(255,255,255,0.07)");
      shade.addColorStop(0.7, "rgba(0,0,0,0.2)");
      shade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, y - 16, width, 36);
      // The cord under the leather stands proud of the spine.
      if (layers.relief) {
        const cord = layers.relief.createLinearGradient(0, y - 12, 0, y + 12);
        cord.addColorStop(0, RELIEF_LEVEL);
        cord.addColorStop(0.5, "#f0f0f0");
        cord.addColorStop(1, RELIEF_LEVEL);
        layers.relief.fillStyle = cord;
        layers.relief.fillRect(0, y - 12, width, 24);
      }
    });
  }

  spine.texts.forEach((layer) => {
    const room = labelled && layer.id === "spine-title" ? labelHalf * 2 - 44 : height * 0.56;
    drawSpineText(layers, book, layer, width, height, room);
  });
  applyWear(layers, book, width, height, "spine");
  commitLayers(baseTarget, foilTarget, commit);
  reliefTarget?.commit();
}

/* ---------- signatures ---------- */

// Everything a painter reads, split by the layer it lands on, so the rig can
// skip a repaint (or just the upload of one layer) when nothing it shows has
// changed. Anything stamped in foil goes to the foil layer; print and blind
// impressions go to the base.

const split = (finish, value, parts) => {
  (finish === "foil" ? parts.foil : parts.base).push(value);
  // Foil and blind stamps also leave their shape in the relief layer.
  if (finish !== "ink") parts.relief.push(value);
};

function textParts(book, layers, parts) {
  layers.forEach((layer) => {
    if (!layer.show) return;
    const text = layerText(book, layer);
    split(layer.finish, [layer, text, fontToken({ ...layer, text })], parts);
  });
}

// Two ornaments are lettered: an initial, and a seal character.
function motifFontToken(key, title) {
  if (key === "monogram") return fontToken({ font: "cormorant", weight: 500, text: (title || "A").slice(0, 1) });
  if (key === "seal") return fontToken({ font: "notoserifsc", weight: 700, text: [...(title || "A")][0] });
  return "";
}

export function faceSignatures(book, face) {
  const parts = { base: [], foil: [], relief: [book.stamp?.relief] };
  const { material, pattern, details } = book;
  const twoTone = material.binding === "quarter" || material.binding === "half";
  parts.base.push(material, book.seed, details.stitch, book.wear);
  if (book.wear?.scuff) parts.foil.push(book.wear.scuff);
  if (face === "spine") {
    const spine = book.spine;
    const title = spine.texts.find((layer) => layer.id === "spine-title");
    const label = [spine.label, title?.y, title?.orient];
    const motif = spine.emblem === "motif" ? [book.front.motif.key, book.title] : null;
    parts.base.push(label, spine.style);
    parts.foil.push(label);
    parts.relief.push(label, BANDED.has(spine.style), spine.texts.map((layer) => [layer.show, layer.y]));
    if (!twoTone && pattern?.spine && hasPattern(pattern.key)) split(pattern.finish, pattern, parts);
    split(spine.finish, [spine.style, spine.emblem, spine.color, spine.leaf, motif], parts);
    textParts(book, spine.texts, parts);
  } else {
    const side = book[face];
    if (pattern && hasPattern(pattern.key)) split(pattern.finish, [pattern, twoTone ? material.binding : ""], parts);
    if (face === "front") {
      parts.base.push(side.image, side.image?.id ? Boolean(getImage(side.image.id)) : null);
      if (side.onlay?.show) {
        parts.base.push(side.onlay);
        parts.relief.push([side.onlay.mode, side.onlay.shape, side.onlay.x, side.onlay.y, side.onlay.width, side.onlay.height]);
      }
    }
    // A pasted panel always prints its paper on the base, whatever its rule is.
    if (side.border.style === "panel" || side.border.style === "slip") parts.base.push(side.border);
    split(side.border.finish, side.border, parts);
    if (hasMotif(side.motif?.key)) split(side.motif.finish, [side.motif, book.title, motifFontToken(side.motif.key, book.title)], parts);
    textParts(book, side.texts, parts);
    parts.foil.push(details.corners);
  }
  return { base: JSON.stringify(parts.base), foil: JSON.stringify(parts.foil), relief: JSON.stringify(parts.relief) };
}

export function endpaperSignature(book) {
  const { endpaper } = book.details;
  return JSON.stringify([
    endpaper, book.material.color, book.seed,
    endpaper.pattern === "grid" ? [book.front.motif.key, book.title] : null
  ]);
}

/* ---------- endpapers ---------- */

export function paintEndpaper(book, target) {
  const logical = { width: 512, height: 768 };
  const ctx = begin(target, logical);
  const { width, height } = logical;
  const { color, pattern } = book.details.endpaper;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  const line = rgba(book.material.color, 0.34);

  ctx.save();
  ctx.strokeStyle = line;
  ctx.fillStyle = line;
  ctx.lineWidth = 1;
  if (pattern === "grid") {
    for (let x = 28; x < width; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 24; y < height; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    drawMotif(ctx, book.front.motif.key, {
      cx: width / 2, cy: height * 0.38, size: 112, color: rgba(book.material.color, 0.5), alpha: 0.8, lineWidth: 2, text: book.title
    });
  } else if (pattern === "stripe") {
    for (let x = 10; x < width; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  } else if (pattern === "dots") {
    for (let y = 16; y < height; y += 26) {
      for (let x = (Math.round(y / 26) % 2 ? 16 : 29); x < width; x += 26) {
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (pattern !== "marble" && hasPattern(pattern)) {
    const mask = patternMask(pattern, target.canvas.width, target.canvas.height, logical, {
      unit: 40, lineWidth: 1, seed: book.seed
    });
    // Paste is laid on thick; the other papers are printed lightly.
    stampPattern(ctx, mask, width, height, book.material.color, pattern === "paste" ? 0.52 : 0.36);
  } else if (pattern === "marble") {
    ctx.lineWidth = 1.4;
    for (let band = 0; band < 46; band += 1) {
      const y0 = (band / 46) * height * 1.3 - height * 0.15;
      ctx.globalAlpha = 0.35 + ((band * 37) % 10) / 16;
      ctx.beginPath();
      for (let step = 0; step <= 64; step += 1) {
        const t = step / 64;
        const x = t * width;
        const y = y0
          + Math.sin(t * 6.3 + band * 0.7) * 26
          + Math.sin(t * 15.1 + band * 1.9) * 9
          + Math.sin(t * 2.1 + band * 0.31) * 44;
        if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();

  // Soft paper tooth over the tint.
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let fleck = 0; fleck < 900; fleck += 1) {
    const x = (Math.sin(fleck * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(fleck * 78.233) * 12543.123) % 1;
    ctx.fillStyle = fleck % 2 ? "rgba(255,255,255,0.05)" : "rgba(60,48,32,0.04)";
    ctx.fillRect(Math.abs(x) * width, Math.abs(y) * height, 1.2, 1.2);
  }
  ctx.restore();
  target.commit();
}
