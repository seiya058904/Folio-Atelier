// All-over patterns for the boards and the endpapers.
// A pattern is drawn once as a white-on-transparent mask and then stamped in
// whatever finish is wanted: left white on the foil layer, tinted for print,
// or pressed twice (light and dark) for a blind impression.

import { seededRandom } from "../util.js";
import { paintContext } from "./gl.js";

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
    // Each scale hides the ones above it, so drawn one by one it costs a
    // composite switch per scale (about 90 ms for a full-size board). The
    // waves repeat every 2r across and r down: one tile, a whole number of
    // pixels wide, is drawn with its neighbours and then laid as a pattern.
    const scale = Math.abs(ctx.getTransform().a) || 1;
    const across = Math.max(2, Math.round(u * 0.56 * 2 * scale));
    const r = across / (2 * scale);
    const down = Math.max(1, Math.round(r * scale));
    const tile = document.createElement("canvas");
    tile.width = across;
    tile.height = down;
    const t = paintContext(tile);
    t.setTransform(scale, 0, 0, scale, 0, 0);
    t.strokeStyle = ctx.strokeStyle;
    t.fillStyle = "#000000";
    t.lineWidth = ctx.lineWidth;
    const tileW = across / scale;
    const tileH = down / scale;
    for (let row = -4; row * r * 0.5 < tileH + r; row += 1) {
      const y = row * r * 0.5;
      for (let x = (row % 2 ? r : 0) - r * 2; x < tileW + r * 2; x += r * 2) {
        t.globalCompositeOperation = "destination-out";
        t.beginPath();
        t.arc(x, y, r, 0, TAU);
        t.fill();
        t.globalCompositeOperation = "source-over";
        [0.95, 0.68, 0.42, 0.18].forEach((ring) => {
          t.beginPath();
          t.arc(x, y, r * ring, 0, TAU);
          t.stroke();
        });
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ctx.createPattern(tile, "repeat");
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
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

  // Paste paper: coloured paste combed through in swathes, each swathe
  // swaying the other way from its neighbours, the teeth a little uneven.
  paste(ctx, w, h, u, random) {
    const swathe = u * 1.15;
    const teeth = 7;
    const baseWidth = ctx.lineWidth;
    for (let column = -1, sx = -swathe * 0.5; sx < w + swathe; column += 1, sx += swathe) {
      const phase = (column % 2 ? Math.PI : 0) + random() * 0.4;
      const sway = u * (0.2 + random() * 0.08);
      for (let tooth = 0; tooth < teeth; tooth += 1) {
        const offset = (tooth / teeth) * swathe + random() * u * 0.03;
        ctx.globalAlpha = 0.55 + random() * 0.45;
        ctx.lineWidth = baseWidth * (1.6 + random() * 1.8);
        ctx.beginPath();
        for (let step = 0, y = -u * 0.2; y <= h + u * 0.2; step += 1, y += u * 0.12) {
          const x = sx + offset + Math.sin((y / u) * 2.4 + phase) * sway + Math.sin((y / u) * 7.3 + tooth) * u * 0.012;
          if (step) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = baseWidth;
  },

  // A contour map of imaginary country: hills and hollows from a few soft
  // bumps, traced level by level (marching squares), every fifth line heavier.
  contour(ctx, w, h, u, random) {
    const hills = Array.from({ length: Math.max(6, Math.round((w * h) / (u * u * 9))) }, () => ({
      x: random() * w, y: random() * h, r: u * (0.9 + random() * 2.2), a: (random() - 0.35) * 2
    }));
    const tilt = random() * TAU;
    const field = (x, y) => {
      let value = Math.sin((x * Math.cos(tilt) + y * Math.sin(tilt)) / (u * 3.1)) * 0.35;
      for (const hill of hills) {
        const dx = x - hill.x;
        const dy = y - hill.y;
        // Beyond three radii a bump adds nothing visible.
        if (Math.abs(dx) > hill.r * 3 || Math.abs(dy) > hill.r * 3) continue;
        value += hill.a * Math.exp(-(dx * dx + dy * dy) / (hill.r * hill.r));
      }
      return value;
    };
    const cell = Math.max(3, u * 0.14);
    const nx = Math.ceil(w / cell) + 1;
    const ny = Math.ceil(h / cell) + 1;
    const grid = new Float32Array(nx * ny);
    let low = Infinity;
    let high = -Infinity;
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const value = field(i * cell, j * cell);
        grid[j * nx + i] = value;
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
    }
    const step = 0.11;
    const baseWidth = ctx.lineWidth;
    const lerp = (a, b, level) => (level - a) / (b - a || 1e-6);
    for (let index = Math.ceil(low / step); index * step < high; index += 1) {
      const level = index * step;
      ctx.lineWidth = baseWidth * (index % 5 === 0 ? 1.7 : 0.8);
      ctx.globalAlpha = index % 5 === 0 ? 1 : 0.75;
      ctx.beginPath();
      for (let j = 0; j < ny - 1; j += 1) {
        for (let i = 0; i < nx - 1; i += 1) {
          const a = grid[j * nx + i];
          const b = grid[j * nx + i + 1];
          const c = grid[(j + 1) * nx + i + 1];
          const d = grid[(j + 1) * nx + i];
          const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
          if (code === 0 || code === 15) continue;
          const x = i * cell;
          const y = j * cell;
          // Where the level crosses each edge of the cell: top, right, bottom, left.
          const top = [x + lerp(a, b, level) * cell, y];
          const right = [x + cell, y + lerp(b, c, level) * cell];
          const bottom = [x + lerp(d, c, level) * cell, y + cell];
          const left = [x, y + lerp(a, d, level) * cell];
          const segment = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
          switch (code) {
            case 1: case 14: segment(left, bottom); break;
            case 2: case 13: segment(bottom, right); break;
            case 3: case 12: segment(left, right); break;
            case 4: case 11: segment(top, right); break;
            case 6: case 9: segment(top, bottom); break;
            case 7: case 8: segment(left, top); break;
            case 5: segment(left, top); segment(bottom, right); break;
            case 10: segment(top, right); segment(left, bottom); break;
            default: break;
          }
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = baseWidth;
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
  },

  // Classical woven baroque damask ogee medallions
  damask(ctx, w, h, u) {
    const sx = u * 1.15;
    const sy = u * 1.45;
    for (let row = -1; row * sy < h + sy; row += 1) {
      for (let col = -1; col * sx < w + sx; col += 1) {
        const cx = col * sx + (row % 2 ? sx * 0.5 : 0);
        const cy = row * sy;
        // Ogee frame
        ctx.beginPath();
        ctx.moveTo(cx, cy - sy * 0.46);
        ctx.bezierCurveTo(cx + sx * 0.36, cy - sy * 0.2, cx + sx * 0.36, cy + sy * 0.2, cx, cy + sy * 0.46);
        ctx.bezierCurveTo(cx - sx * 0.36, cy + sy * 0.2, cx - sx * 0.36, cy - sy * 0.2, cx, cy - sy * 0.46);
        ctx.stroke();
        // Central stylized palmette
        ctx.beginPath();
        ctx.arc(cx, cy, u * 0.12, 0, TAU);
        ctx.stroke();
        [-1, 1].forEach((s) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy + sy * 0.24);
          ctx.quadraticCurveTo(cx + s * sx * 0.24, cy + sy * 0.02, cx + s * sx * 0.14, cy - sy * 0.16);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx + s * sx * 0.18, cy - sy * 0.04, u * 0.045, 0, TAU);
          ctx.fill();
        });
        ctx.beginPath();
        ctx.arc(cx, cy - sy * 0.25, u * 0.05, 0, TAU);
        ctx.fill();
      }
    }
  },

  // Antique celestial chart: ecliptic arcs, constellation segments and 4-point stars
  celestial(ctx, w, h, u, random) {
    const rStep = u * 1.85;
    ctx.globalAlpha = 0.42;
    for (let r = rStep * 0.6; r < Math.hypot(w, h) * 1.05; r += rStep) {
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.46, r, 0, TAU);
      ctx.stroke();
    }
    for (let a = 0; a < 12; a += 1) {
      const ang = (a / 12) * TAU;
      line(ctx, w * 0.5, h * 0.46, w * 0.5 + Math.cos(ang) * Math.hypot(w, h), h * 0.46 + Math.sin(ang) * Math.hypot(w, h));
    }
    ctx.globalAlpha = 0.9;
    const pts = [];
    const count = Math.round((w * h) / (u * u * 1.4));
    for (let i = 0; i < count; i += 1) {
      const x = random() * w;
      const y = random() * h;
      pts.push([x, y]);
      if (i % 5 === 0) star(ctx, x, y, u * 0.11, u * 0.028);
      else {
        ctx.beginPath();
        ctx.arc(x, y, u * (0.018 + random() * 0.022), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (d > u * 0.4 && d < u * 1.15 && random() < 0.22) line(ctx, pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
      }
    }
    ctx.globalAlpha = 1;
  },

  // Flowing Art Nouveau botanical whiplash vines & lily buds
  artnouveau(ctx, w, h, u) {
    const sx = u * 1.1;
    const sy = u * 1.5;
    for (let col = -1; col * sx < w + sx; col += 1) {
      const x0 = col * sx;
      const dir = col % 2 ? 1 : -1;
      ctx.beginPath();
      for (let y = -sy; y < h + sy; y += sy) {
        ctx.moveTo(x0, y);
        ctx.bezierCurveTo(x0 + dir * sx * 0.55, y + sy * 0.3, x0 - dir * sx * 0.55, y + sy * 0.7, x0, y + sy);
      }
      ctx.stroke();
      for (let y = 0; y < h + sy; y += sy) {
        const bx = x0 + dir * sx * 0.28;
        const by = y + sy * 0.42;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + dir * sx * 0.26, by - sy * 0.16, bx + dir * sx * 0.14, by - sy * 0.26);
        ctx.quadraticCurveTo(bx - dir * sx * 0.04, by - sy * 0.18, bx, by);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bx + dir * sx * 0.12, by - sy * 0.22, u * 0.04, 0, TAU);
        ctx.fill();
      }
    }
  },

  // Traditional East Asian ice-crackle window lattice (Bingliewen)
  icecrack(ctx, w, h, u, random) {
    const step = u * 0.92;
    const cols = Math.ceil(w / step) + 2;
    const rows = Math.ceil(h / step) + 2;
    const pts = [];
    for (let r = 0; r <= rows; r += 1) {
      pts[r] = [];
      for (let c = 0; c <= cols; c += 1) {
        pts[r][c] = [
          (c - 0.5) * step + (random() - 0.5) * step * 0.56,
          (r - 0.5) * step + (random() - 0.5) * step * 0.56
        ];
      }
    }
    ctx.lineJoin = "bevel";
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const a = pts[r][c];
        const b = pts[r][c + 1];
        const d = pts[r + 1][c];
        const e = pts[r + 1][c + 1];
        line(ctx, a[0], a[1], b[0], b[1]);
        line(ctx, a[0], a[1], d[0], d[1]);
        if ((r + c) % 2 === 0) line(ctx, a[0], a[1], e[0], e[1]);
        else line(ctx, b[0], b[1], d[0], d[1]);
      }
    }
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
  const ctx = paintContext(canvas);
  ctx.setTransform(canvas.width / logical.width, 0, 0, canvas.height / logical.height, 0, 0);
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = lineWidth;
  DRAW[key](ctx, logical.width, logical.height, unit * scale, seededRandom(seed * 7919 + 13));
  // Identity for the tint cache, and a way to get the same mask at another
  // size (the relief layer is half the size of the board).
  canvas.maskId = id;
  canvas.remake = (width, height) => patternMask(key, width, height, logical, { scale, unit, lineWidth, seed });
  cache.set(id, canvas);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return canvas;
}

// Tinted copies of masks, by mask and colour. A board stamps the same mask
// in the same colours on every repaint (and on both boards), so the copy is
// made once instead of on every stamp.
const tints = new Map();
const TINT_LIMIT = 4;
const WHITE = new Set(["#ffffff", "#fff", "white", "rgb(255,255,255)", "rgb(255, 255, 255)"]);

function tinted(mask, color) {
  const id = `${mask.maskId || ""}|${mask.width}x${mask.height}|${color}`;
  const cached = mask.maskId ? tints.get(id) : null;
  if (cached) {
    tints.delete(id);
    tints.set(id, cached);
    return cached;
  }
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const tint = paintContext(canvas);
  tint.drawImage(mask, 0, 0);
  tint.globalCompositeOperation = "source-in";
  tint.fillStyle = color;
  tint.fillRect(0, 0, mask.width, mask.height);
  if (mask.maskId) {
    tints.set(id, canvas);
    if (tints.size > TINT_LIMIT) tints.delete(tints.keys().next().value);
  }
  return canvas;
}

/**
 * Stamp a mask onto `ctx` (which works in logical units, `width` × `height`
 * covering the whole canvas) in one colour. The mask is used at the canvas's
 * own pixel size and offsets land on whole pixels, so the browser copies
 * pixels instead of resampling a full-size board.
 */
export function stampPattern(ctx, mask, width, height, color, alpha = 1, dx = 0, dy = 0) {
  if (!mask) return;
  let source = mask;
  if (mask.remake && (ctx.canvas.width !== mask.width || ctx.canvas.height !== mask.height)) {
    source = mask.remake(ctx.canvas.width, ctx.canvas.height);
  }
  if (!WHITE.has(String(color).toLowerCase())) source = tinted(source, color);
  const transform = ctx.getTransform();
  const sx = transform.a || 1;
  const sy = transform.d || 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(source, Math.round(dx * sx) / sx, Math.round(dy * sy) / sy, width, height);
  ctx.restore();
}
