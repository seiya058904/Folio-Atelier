// All-over patterns for the boards and the endpapers.
// A pattern is drawn once as a white-on-transparent mask and then stamped in
// whatever finish is wanted: left white on the foil layer, tinted for print,
// or pressed twice (light and dark) for a blind impression.

import { seededRandom } from "../util.js";

const TAU = Math.PI * 2;

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function star(ctx, x, y, outer, inner) {
  ctx.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (index / 8) * TAU - Math.PI / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// Each routine fills a width × height area; `u` is the repeat unit.
const DRAW = {
  pinstripe(ctx, w, h, u) {
    for (let x = u * 0.18; x < w; x += u * 0.36) line(ctx, x, 0, x, h);
  },

  bands(ctx, w, h, u) {
    for (let x = u * 0.25; x < w; x += u) ctx.fillRect(x, 0, u * 0.5, h);
  },

  diagonal(ctx, w, h, u) {
    for (let x = -h; x < w; x += u * 0.5) line(ctx, x, 0, x + h, h);
  },

  check(ctx, w, h, u) {
    const step = u * 0.7;
    for (let x = step / 2; x < w; x += step) line(ctx, x, 0, x, h);
    for (let y = step / 2; y < h; y += step) line(ctx, 0, y, w, y);
  },

  dots(ctx, w, h, u) {
    const step = u * 0.5;
    for (let row = 0; row * step * 0.866 < h + step; row += 1) {
      for (let x = row % 2 ? step / 2 : 0; x < w + step; x += step) {
        ctx.beginPath();
        ctx.arc(x, row * step * 0.866, u * 0.055, 0, TAU);
        ctx.fill();
      }
    }
  },

  harlequin(ctx, w, h, u) {
    const a = u * 0.8;
    const b = a * 1.62;
    const run = (h * a) / b;
    for (let x = -run - a * 2; x < w + run + a * 2; x += a * 2) {
      line(ctx, x, 0, x + run, h);
      line(ctx, x, 0, x - run, h);
    }
    for (let row = 0; row * b < h + b; row += 1) {
      for (let column = row % 2; column * a < w + a; column += 2) {
        ctx.beginPath();
        ctx.arc(column * a, row * b, u * 0.045, 0, TAU);
        ctx.fill();
      }
    }
  },

  chevron(ctx, w, h, u) {
    const half = u * 0.4;
    const rise = u * 0.24;
    ctx.lineJoin = "miter";
    for (let y = 0; y < h + rise * 2; y += u * 0.42) {
      ctx.beginPath();
      for (let step = 0; step * half < w + half; step += 1) {
        const py = y + (step % 2 ? -rise : 0);
        if (step) ctx.lineTo(step * half, py);
        else ctx.moveTo(0, py);
      }
      ctx.stroke();
    }
  },

  herringbone(ctx, w, h, u) {
    const column = u * 0.5;
    for (let index = 0; index * column < w; index += 1) {
      const lean = index % 2 ? 1 : -1;
      const x = index * column;
      for (let y = -column; y < h + column; y += u * 0.2) {
        line(ctx, x, y, x + column, y + lean * column);
      }
    }
    ctx.globalAlpha = 0.6;
    for (let x = 0; x <= w; x += column) line(ctx, x, 0, x, h);
    ctx.globalAlpha = 1;
  },

  seigaiha(ctx, w, h, u) {
    const r = u * 0.56;
    for (let row = -1; row * r * 0.5 < h + r; row += 1) {
      const y = row * r * 0.5;
      for (let x = row % 2 ? r : 0; x < w + r; x += r * 2) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        [0.95, 0.68, 0.42, 0.18].forEach((scale) => {
          ctx.beginPath();
          ctx.arc(x, y, r * scale, 0, TAU);
          ctx.stroke();
        });
      }
    }
  },

  shippo(ctx, w, h, u) {
    const r = u * 0.46;
    for (let row = 0; row * r < h + r; row += 1) {
      for (let column = row % 2; column * r < w + r; column += 2) {
        ctx.beginPath();
        ctx.arc(column * r, row * r, r, 0, TAU);
        ctx.stroke();
      }
    }
  },

  honeycomb(ctx, w, h, u) {
    const r = u * 0.34;
    const dx = Math.sqrt(3) * r;
    for (let row = 0; row * r * 1.5 < h + r * 2; row += 1) {
      for (let x = row % 2 ? dx / 2 : 0; x < w + dx; x += dx) {
        ctx.beginPath();
        for (let corner = 0; corner < 6; corner += 1) {
          const angle = (corner / 6) * TAU + Math.PI / 6;
          const px = x + Math.cos(angle) * r;
          const py = row * r * 1.5 + Math.sin(angle) * r;
          if (corner) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  },

  meander(ctx, w, h, u) {
    const cell = u * 0.62;
    const k = cell / 5;
    const path = [[0, 4], [0, 0], [4, 0], [4, 4], [1.35, 4], [1.35, 1.35], [2.7, 1.35], [2.7, 2.75]];
    ctx.lineJoin = "miter";
    ctx.lineCap = "square";
    for (let y = k * 0.5; y < h; y += cell) {
      for (let x = k * 0.5; x < w; x += cell) {
        ctx.beginPath();
        path.forEach(([px, py], index) => {
          if (index) ctx.lineTo(x + px * k, y + py * k);
          else ctx.moveTo(x + px * k, y + py * k);
        });
        ctx.stroke();
      }
    }
  },

  stars(ctx, w, h, u) {
    const step = u * 0.64;
    for (let row = 0; row * step < h + step; row += 1) {
      for (let x = row % 2 ? step : 0; x < w + step; x += step * 2) {
        star(ctx, x, row * step, u * 0.13, u * 0.035);
        ctx.beginPath();
        ctx.arc(x + step, row * step, u * 0.026, 0, TAU);
        ctx.fill();
      }
    }
  },

  sprigs(ctx, w, h, u) {
    const stepX = u * 0.9;
    const stepY = u * 0.78;
    const leaf = (x, y, length, angle) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(length * 0.5, -length * 0.3, length, 0);
      ctx.quadraticCurveTo(length * 0.5, length * 0.3, 0, 0);
      ctx.fill();
      ctx.restore();
    };
    for (let row = 0; row * stepY < h + stepY; row += 1) {
      for (let x = row % 2 ? stepX / 2 : 0; x < w + stepX; x += stepX) {
        const y = row * stepY;
        const lean = (row + Math.round(x / stepX)) % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x - lean * u * 0.05, y + u * 0.24);
        ctx.quadraticCurveTo(x - lean * u * 0.06, y, x + lean * u * 0.05, y - u * 0.2);
        ctx.stroke();
        leaf(x - lean * u * 0.04, y + u * 0.08, u * 0.2, lean > 0 ? -0.5 : Math.PI + 0.5);
        leaf(x, y - u * 0.03, u * 0.17, lean > 0 ? Math.PI + 0.6 : -0.6);
        ctx.beginPath();
        ctx.arc(x + lean * u * 0.06, y - u * 0.24, u * 0.045, 0, TAU);
        ctx.fill();
      }
    }
  },

  clouds(ctx, w, h, u) {
    const stepX = u * 1.5;
    const stepY = u * 0.74;
    const r = u * 0.17;
    ctx.lineCap = "round";
    for (let row = 0; row * stepY < h + stepY; row += 1) {
      for (let x = row % 2 ? stepX / 2 : 0; x < w + stepX; x += stepX) {
        const y = row * stepY;
        ctx.beginPath();
        ctx.arc(x - r * 0.5, y - r * 0.2, r, Math.PI * 0.95, Math.PI * 2.55);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x - r * 0.42, y - r * 0.1, r * 0.46, Math.PI * 1.2, Math.PI * 2.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + r * 0.95, y + r * 0.15, r * 0.7, Math.PI * 1.08, Math.PI * 2.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - r * 1.5, y - r * 0.1);
        ctx.quadraticCurveTo(x - r * 2.2, y + r * 0.2, x - r * 2.6, y + r * 0.95);
        ctx.lineTo(x + r * 2.6, y + r * 0.95);
        ctx.stroke();
      }
    }
  },

  marble(ctx, w, h, u, random) {
    const bands = Math.round((h / u) * 4.4);
    const phase = random() * 6;
    for (let band = 0; band < bands; band += 1) {
      const y0 = (band / bands) * h * 1.3 - h * 0.15;
      ctx.globalAlpha = 0.4 + ((band * 37) % 10) / 16;
      ctx.lineWidth = 0.8 + ((band * 13) % 7) * 0.32;
      ctx.beginPath();
      for (let step = 0; step <= 72; step += 1) {
        const t = step / 72;
        const y = y0
          + Math.sin(t * 6.3 + band * 0.7 + phase) * u * 0.52
          + Math.sin(t * 15.1 + band * 1.9) * u * 0.18
          + Math.sin(t * 2.1 + band * 0.31 + phase) * u * 0.9;
        if (step) ctx.lineTo(t * w, y);
        else ctx.moveTo(0, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  speckle(ctx, w, h, u, random) {
    const count = Math.round(((w * h) / (u * u)) * 16);
    for (let dot = 0; dot < count; dot += 1) {
      ctx.globalAlpha = 0.45 + random() * 0.55;
      ctx.beginPath();
      ctx.arc(random() * w, random() * h, u * (0.01 + random() * random() * 0.045), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
};

export const hasPattern = (key) => Boolean(DRAW[key]);

const cache = new Map();
const CACHE_LIMIT = 10;

/**
 * A white-on-transparent mask of a pattern, `pixelWidth` × `pixelHeight`,
 * laid out on a `logical` sheet. Recent masks are cached.
 */
export function patternMask(key, pixelWidth, pixelHeight, logical, { scale = 1, unit = 58, lineWidth = 1.5, seed = 1 } = {}) {
  if (!DRAW[key]) return null;
  const id = [key, pixelWidth, pixelHeight, logical.width, logical.height, scale.toFixed(2), unit, lineWidth, seed].join("|");
  const cached = cache.get(id);
  if (cached) {
    cache.delete(id);
    cache.set(id, cached);
    return cached;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(pixelWidth));
  canvas.height = Math.max(1, Math.round(pixelHeight));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(canvas.width / logical.width, 0, 0, canvas.height / logical.height, 0, 0);
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = lineWidth;
  DRAW[key](ctx, logical.width, logical.height, unit * scale, seededRandom(seed * 7919 + 13));
  cache.set(id, canvas);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return canvas;
}

let tintCanvas = null;

/** Stamp a mask onto `ctx` (which works in logical units) in one colour. */
export function stampPattern(ctx, mask, width, height, color, alpha = 1, dx = 0, dy = 0) {
  if (!mask) return;
  let source = mask;
  if (color !== "#ffffff") {
    if (!tintCanvas) tintCanvas = document.createElement("canvas");
    if (tintCanvas.width !== mask.width || tintCanvas.height !== mask.height) {
      tintCanvas.width = mask.width;
      tintCanvas.height = mask.height;
    }
    const tint = tintCanvas.getContext("2d");
    tint.globalCompositeOperation = "copy";
    tint.drawImage(mask, 0, 0);
    tint.globalCompositeOperation = "source-in";
    tint.fillStyle = color;
    tint.fillRect(0, 0, mask.width, mask.height);
    tint.globalCompositeOperation = "source-over";
    source = tintCanvas;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(source, dx, dy, width, height);
  ctx.restore();
}
