// Ornament library. Each motif draws in the current stroke / fill style,
// centred on (cx, cy) and scaled by `size` (roughly the motif's half-width).
// The first seven are the motifs of the original seven bindings.

const TAU = Math.PI * 2;

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function leaf(ctx, x, y, length, width, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(length * 0.5, -width, length, 0);
  ctx.quadraticCurveTo(length * 0.5, width, 0, 0);
  ctx.fill();
  ctx.restore();
}

const DRAW = {
  brackets(ctx, cx, cy, size, alpha) {
    for (let layer = 0; layer < 3; layer += 1) {
      const inset = layer * size * 0.22;
      const left = cx - size + inset;
      const right = cx + size - inset;
      const top = cy - size * 0.72 + inset;
      const bottom = cy + size * 0.72 - inset;
      ctx.beginPath();
      ctx.moveTo(left + size * 0.25, top);
      ctx.lineTo(left, top);
      ctx.lineTo(left, bottom);
      ctx.lineTo(left + size * 0.25, bottom);
      ctx.moveTo(right - size * 0.25, top);
      ctx.lineTo(right, top);
      ctx.lineTo(right, bottom);
      ctx.lineTo(right - size * 0.25, bottom);
      ctx.stroke();
    }
    const dot = size * 0.035;
    ctx.fillRect(cx - dot, cy - dot, dot * 2, dot * 2);
    ctx.globalAlpha = alpha;
  },

  paths(ctx, cx, cy, size, alpha) {
    ctx.beginPath();
    ctx.moveTo(cx - size, cy + size * 0.35);
    ctx.bezierCurveTo(cx - size * 0.2, cy - size, cx + size * 0.1, cy + size, cx + size, cy - size * 0.25);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - size, cy - size * 0.45);
    ctx.bezierCurveTo(cx - size * 0.25, cy + size, cx + size * 0.3, cy - size, cx + size, cy + size * 0.45);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    for (let point = -1; point <= 1; point += 1) {
      ctx.beginPath();
      ctx.arc(cx + point * size, cy - point * size * 0.25, size * 0.042, 0, TAU);
      ctx.fill();
    }
  },

  caret(ctx, cx, cy, size, alpha) {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.9, cy + size * 0.6);
    ctx.lineTo(cx, cy - size * 0.65);
    ctx.lineTo(cx + size * 0.9, cy + size * 0.6);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.43;
    for (let row = -2; row <= 2; row += 1) {
      line(ctx, cx - size, cy + row * size * 0.28, cx + size, cy + row * size * 0.28);
    }
  },

  orbits(ctx, cx, cy, size, alpha) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, size, size * 0.42, -0.35, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.66;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.72, size, 0.52, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx + size * 0.64, cy - size * 0.34, size * 0.048, 0, TAU);
    ctx.fill();
    const core = size * 0.036;
    ctx.fillRect(cx - core, cy - core, core * 2, core * 2);
  },

  modules(ctx, cx, cy, size, alpha) {
    const module = size * 0.54;
    [
      [-0.55, -0.5, "circle"],
      [0.25, -0.5, "rect"],
      [-0.55, 0.3, "rect"],
      [0.25, 0.3, "circle"]
    ].forEach(([x, y, shape], index) => {
      ctx.globalAlpha = alpha * (0.5 + index * 0.14);
      const px = cx + (x + 0.15) * size;
      const py = cy + (y + 0.1) * size;
      if (shape === "circle") {
        ctx.beginPath();
        ctx.arc(px, py, module * 0.48, 0, TAU);
        ctx.stroke();
      } else {
        ctx.strokeRect(px - module * 0.5, py - module * 0.5, module, module);
      }
    });
  },

  frames(ctx, cx, cy, size, alpha) {
    for (let layer = 0; layer < 4; layer += 1) {
      ctx.globalAlpha = alpha * (1 - layer * 0.19);
      const offset = layer * size * 0.18;
      ctx.strokeRect(cx - size + offset, cy - size * 0.7 + offset, size * 2 - offset * 2, size * 1.4 - offset * 2);
    }
    ctx.globalAlpha = alpha;
    line(ctx, cx - size, cy - size * 0.7, cx + size, cy + size * 0.7);
  },

  compass(ctx, cx, cy, size, alpha) {
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.78, 0.15, Math.PI * 1.82);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.72, cy + size * 0.88);
    ctx.lineTo(cx, cy - size * 0.92);
    ctx.lineTo(cx + size * 0.72, cy + size * 0.88);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.55;
    line(ctx, cx - size, cy, cx + size, cy);
  },

  sun(ctx, cx, cy, size, alpha) {
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.3, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.2, 0, TAU);
    ctx.fill();
    for (let ray = 0; ray < 32; ray += 1) {
      const angle = (ray / 32) * TAU;
      const long = ray % 2 === 0;
      ctx.globalAlpha = alpha * (long ? 1 : 0.6);
      const inner = size * 0.4;
      const outer = size * (long ? 1 : 0.72);
      line(
        ctx,
        cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner,
        cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer
      );
    }
  },

  laurel(ctx, cx, cy, size, alpha) {
    [-1, 1].forEach((side) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.8, Math.PI / 2 + side * 0.25, Math.PI / 2 + side * 2.55, side < 0);
      ctx.stroke();
      for (let step = 0; step < 9; step += 1) {
        const angle = Math.PI / 2 + side * (0.42 + step * 0.245);
        const x = cx + Math.cos(angle) * size * 0.8;
        const y = cy + Math.sin(angle) * size * 0.8;
        const tangent = angle + side * Math.PI * 0.5;
        const length = size * (0.3 - step * 0.012);
        leaf(ctx, x, y, length, size * 0.075, tangent - side * 0.62);
        leaf(ctx, x, y, length * 0.9, size * 0.07, tangent + side * 0.5);
      }
    });
    ctx.globalAlpha = alpha;
  },

  moon(ctx, cx, cy, size, alpha) {
    const radius = size * 0.2;
    for (let phase = -2; phase <= 2; phase += 1) {
      const x = cx + phase * size * 0.46;
      const y = cy + Math.abs(phase) * Math.abs(phase) * size * 0.045;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.stroke();
      if (phase === 0) {
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.99, 0, TAU);
        ctx.fill();
      } else {
        const waxing = phase < 0;
        const fraction = 1 - Math.abs(phase) / 2.6;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.clip();
        ctx.beginPath();
        ctx.arc(x, y, radius, -Math.PI / 2, Math.PI / 2, waxing);
        ctx.ellipse(x, y, radius * Math.abs(1 - fraction * 2), radius, 0, Math.PI / 2, -Math.PI / 2, fraction < 0.5 ? !waxing : waxing);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = alpha * 0.55;
    line(ctx, cx - size, cy + size * 0.42, cx + size, cy + size * 0.42);
  },

  waves(ctx, cx, cy, size, alpha) {
    for (let row = 0; row < 5; row += 1) {
      const y = cy + (row - 2) * size * 0.3;
      ctx.globalAlpha = alpha * (1 - Math.abs(row - 2) * 0.2);
      ctx.beginPath();
      for (let step = 0; step <= 48; step += 1) {
        const t = step / 48;
        const x = cx - size + t * size * 2;
        const wave = Math.sin(t * TAU * 2.5 + row * 0.9) * size * 0.09 * Math.sin(t * Math.PI);
        if (step === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx + size * 0.48, cy - size * 0.92, size * 0.14, 0, TAU);
    ctx.stroke();
  },

  star(ctx, cx, cy, size, alpha) {
    const points = (outer, inner, count, rotation) => {
      ctx.beginPath();
      for (let index = 0; index < count * 2; index += 1) {
        const radius = index % 2 === 0 ? outer : inner;
        const angle = rotation + (index / (count * 2)) * TAU - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    ctx.globalAlpha = alpha * 0.6;
    points(size * 0.66, size * 0.16, 4, Math.PI / 4);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    points(size, size * 0.17, 4, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.42, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.05, 0, TAU);
    ctx.fill();
  },

  branch(ctx, cx, cy, size, alpha) {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.1, cy + size);
    ctx.bezierCurveTo(cx - size * 0.24, cy + size * 0.3, cx + size * 0.26, cy - size * 0.3, cx + size * 0.06, cy - size);
    ctx.stroke();
    for (let step = 0; step < 9; step += 1) {
      const t = 0.1 + step * 0.1;
      const inverse = 1 - t;
      const x = inverse ** 3 * (cx - size * 0.1)
        + 3 * inverse * inverse * t * (cx - size * 0.24)
        + 3 * inverse * t * t * (cx + size * 0.26)
        + t ** 3 * (cx + size * 0.06);
      const y = inverse ** 3 * (cy + size)
        + 3 * inverse * inverse * t * (cy + size * 0.3)
        + 3 * inverse * t * t * (cy - size * 0.3)
        + t ** 3 * (cy - size);
      const side = step % 2 === 0 ? 1 : -1;
      const length = size * (0.5 - step * 0.032);
      ctx.globalAlpha = alpha;
      leaf(ctx, x, y, length, size * 0.1, side > 0 ? -0.72 : Math.PI + 0.72);
    }
    ctx.globalAlpha = alpha;
  },

  lattice(ctx, cx, cy, size, alpha) {
    const step = size * 0.4;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.76, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size * 0.76, cy);
    ctx.closePath();
    ctx.stroke();
    ctx.clip();
    ctx.globalAlpha = alpha * 0.6;
    for (let offset = -6; offset <= 6; offset += 1) {
      line(ctx, cx + offset * step - size * 2, cy - size * 2.63, cx + offset * step + size * 2, cy + size * 2.63);
      line(ctx, cx + offset * step + size * 2, cy - size * 2.63, cx + offset * step - size * 2, cy + size * 2.63);
    }
    ctx.restore();
  },

  monogram(ctx, cx, cy, size, alpha, options) {
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.82, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.92, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    const letter = (options.text || "A").trim().slice(0, 1).toUpperCase() || "A";
    ctx.font = `500 ${size * 1.05}px "Cormorant Garamond", "Noto Serif SC", Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const metrics = ctx.measureText(letter);
    const ascent = metrics.actualBoundingBoxAscent || size * 0.7;
    const descent = metrics.actualBoundingBoxDescent || 0;
    ctx.fillText(letter, cx, cy + (ascent - descent) / 2);
  },

  // Back-cover registration rings, carried over from the original back boards.
  rings(ctx, cx, cy, size, alpha) {
    for (let ring = 0; ring < 5; ring += 1) {
      ctx.globalAlpha = alpha * (0.27 - ring * 0.036);
      ctx.beginPath();
      ctx.arc(cx, cy, size * (0.33 + ring * 0.17), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    line(ctx, cx - size * 0.9, cy, cx + size * 0.7, cy);
    line(ctx, cx, cy - size * 0.9, cx, cy + size * 0.9);
  }
};

export const hasMotif = (key) => Boolean(DRAW[key]);

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} key motif id
 * @param {{cx:number, cy:number, size:number, color:string, alpha?:number, lineWidth?:number, text?:string}} options
 */
export function drawMotif(ctx, key, options) {
  const draw = DRAW[key];
  if (!draw) return;
  const alpha = options.alpha ?? 0.9;
  ctx.save();
  ctx.strokeStyle = options.color;
  ctx.fillStyle = options.color;
  ctx.lineWidth = options.lineWidth ?? Math.max(1.5, options.size * 0.018);
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  ctx.globalAlpha = alpha;
  draw(ctx, options.cx, options.cy, options.size, alpha, options);
  ctx.restore();
}
