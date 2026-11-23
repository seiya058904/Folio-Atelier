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
    const letter = ([...(options.text || "A").trim()][0] || "A").toUpperCase();
    ctx.font = `500 ${size * 1.05}px "Cormorant Garamond", "Noto Serif SC", Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const metrics = ctx.measureText(letter);
    const ascent = metrics.actualBoundingBoxAscent || size * 0.7;
    const descent = metrics.actualBoundingBoxDescent || 0;
    ctx.fillText(letter, cx, cy + (ascent - descent) / 2);
  },

  seal(ctx, cx, cy, size, alpha, options) {
    const side = size * 1.56;
    const weight = ctx.lineWidth;
    ctx.lineWidth = weight * 2.2;
    ctx.lineJoin = "round";
    ctx.strokeRect(cx - side / 2, cy - side / 2, side, side);
    ctx.lineWidth = weight;
    const character = [...(options.text || "A").trim()][0] || "A";
    ctx.font = `700 ${size * 1.12}px "Noto Serif SC", "Songti SC", "Cormorant Garamond", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const metrics = ctx.measureText(character);
    const ascent = metrics.actualBoundingBoxAscent || size * 0.8;
    const descent = metrics.actualBoundingBoxDescent || 0;
    ctx.fillText(character.toUpperCase(), cx, cy + (ascent - descent) / 2);
  },

  lotus(ctx, cx, cy, size, alpha) {
    const baseY = cy + size * 0.42;
    const petal = (angle, length, width) => {
      ctx.save();
      ctx.translate(cx, baseY);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(length * 0.5, -width, length, 0);
      ctx.quadraticCurveTo(length * 0.5, width, 0, 0);
      ctx.stroke();
      ctx.restore();
    };
    [[1.12, 0.3, -1.12], [0.7, 0.26, -0.7], [0.36, 0.22, -0.36]].forEach(([spread, width], index) => {
      ctx.globalAlpha = alpha * (0.62 + index * 0.19);
      const length = size * (0.92 + index * 0.16);
      petal(-Math.PI / 2 - spread, length, size * width);
      petal(-Math.PI / 2 + spread, length, size * width);
    });
    ctx.globalAlpha = alpha;
    petal(-Math.PI / 2, size * 1.36, size * 0.24);
    ctx.globalAlpha = alpha * 0.6;
    [0.62, 0.8].forEach((offset, index) => {
      const reach = size * (1 - index * 0.36);
      line(ctx, cx - reach, cy + size * offset, cx + reach, cy + size * offset);
    });
  },

  cloud(ctx, cx, cy, size) {
    const r = size * 0.36;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx - r * 0.5, cy - r * 0.2, r, Math.PI * 0.95, Math.PI * 2.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - r * 0.42, cy - r * 0.1, r * 0.48, Math.PI * 1.2, Math.PI * 2.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + r * 0.95, cy + r * 0.15, r * 0.7, Math.PI * 1.08, Math.PI * 2.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.5, cy - r * 0.1);
    ctx.quadraticCurveTo(cx - r * 2.3, cy + r * 0.2, cx - r * 2.75, cy + r * 0.95);
    ctx.lineTo(cx + r * 2.75, cy + r * 0.95);
    ctx.stroke();
  },

  peaks(ctx, cx, cy, size, alpha) {
    const path = (points) => {
      ctx.beginPath();
      points.forEach(([x, y], index) => {
        if (index) ctx.lineTo(cx + x * size, cy + y * size);
        else ctx.moveTo(cx + x * size, cy + y * size);
      });
      ctx.stroke();
    };
    ctx.lineJoin = "round";
    ctx.globalAlpha = alpha * 0.6;
    path([[-1, 0.62], [-0.52, -0.2], [-0.18, 0.3]]);
    path([[0.16, -0.36], [0.4, -0.5], [0.52, -0.3]]);
    ctx.globalAlpha = alpha;
    path([[-0.5, 0.62], [0.34, -0.82], [1, 0.62]]);
    line(ctx, cx - size, cy + size * 0.62, cx + size, cy + size * 0.62);
    ctx.beginPath();
    ctx.arc(cx - size * 0.52, cy - size * 0.62, size * 0.17, 0, TAU);
    ctx.stroke();
  },

  bamboo(ctx, cx, cy, size, alpha) {
    const stalk = (x, top, bottom, joints, width) => {
      const step = (bottom - top) / joints;
      for (let joint = 0; joint < joints; joint += 1) {
        const y0 = cy + (top + joint * step) * size + size * 0.025;
        const y1 = cy + (top + (joint + 1) * step) * size - size * 0.025;
        ctx.strokeRect(cx + x * size - width / 2, y0, width, y1 - y0);
      }
    };
    stalk(-0.22, -1, 1, 4, size * 0.15);
    ctx.globalAlpha = alpha * 0.7;
    stalk(0.2, -0.56, 1, 3, size * 0.1);
    ctx.globalAlpha = alpha;
    [[-0.14, -0.5, -0.5], [-0.14, -0.5, -0.05], [-0.14, 0, -0.42], [0.26, -0.04, -0.6], [0.26, -0.04, -0.12]]
      .forEach(([x, y, angle]) => leaf(ctx, cx + x * size, cy + y * size, size * 0.62, size * 0.085, angle));
  },

  crescent(ctx, cx, cy, size, alpha) {
    const radius = size * 0.78;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx - size * 0.1, cy, radius, 0, TAU);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(cx - size * 2, cy - size * 2, size * 4, size * 4);
    ctx.arc(cx + size * 0.24, cy - size * 0.14, radius * 0.86, 0, TAU);
    ctx.fill("evenodd");
    ctx.restore();
    const spark = (x, y, reach) => {
      ctx.beginPath();
      for (let index = 0; index < 8; index += 1) {
        const r = index % 2 === 0 ? reach : reach * 0.26;
        const angle = (index / 8) * TAU - Math.PI / 2;
        const px = cx + x * size + Math.cos(angle) * r;
        const py = cy + y * size + Math.sin(angle) * r;
        if (index) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    };
    spark(0.5, -0.5, size * 0.2);
    ctx.globalAlpha = alpha * 0.7;
    spark(0.82, 0.08, size * 0.11);
    spark(0.36, 0.3, size * 0.08);
  },

  tree(ctx, cx, cy, size, alpha) {
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.3, size * 0.7, 0, TAU);
    ctx.stroke();
    line(ctx, cx, cy + size, cx, cy - size * 0.62);
    [[0.34, -0.1, 0.5], [0.08, -0.38, 0.34], [-0.16, 0.08, 0.42], [-0.34, -0.22, 0.3]].forEach(([from, to, reach], index) => {
      const side = index % 2 === 0 ? 1 : -1;
      line(ctx, cx, cy + from * size, cx + side * reach * size, cy + to * size - reach * size * 0.5);
    });
    ctx.globalAlpha = alpha * 0.6;
    line(ctx, cx - size * 0.6, cy + size, cx + size * 0.6, cy + size);
  },

  feather(ctx, cx, cy, size, alpha) {
    const at = (t) => {
      const inverse = 1 - t;
      return [
        cx + (inverse * inverse * -0.5 + 2 * inverse * t * -0.1 + t * t * 0.46) * size,
        cy + (inverse * inverse * 1 + 2 * inverse * t * 0.1 + t * t * -0.96) * size
      ];
    };
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(...at(0));
    ctx.quadraticCurveTo(cx - size * 0.1, cy + size * 0.1, ...at(1));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...at(0.3));
    ctx.bezierCurveTo(cx - size * 0.7, cy - size * 0.1, cx - size * 0.1, cy - size * 0.9, ...at(1));
    ctx.bezierCurveTo(cx + size * 0.75, cy - size * 0.3, cx + size * 0.3, cy + size * 0.45, ...at(0.3));
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.55;
    for (let barb = 0; barb < 6; barb += 1) {
      const [x, y] = at(0.4 + barb * 0.09);
      const reach = size * (0.3 - barb * 0.03);
      line(ctx, x, y, x - reach, y - reach * 0.5);
      line(ctx, x, y, x + reach * 0.9, y + reach * 0.05);
    }
  },

  key(ctx, cx, cy, size) {
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.62, size * 0.34, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.62, size * 0.14, 0, TAU);
    ctx.stroke();
    line(ctx, cx, cy - size * 0.28, cx, cy + size);
    line(ctx, cx - size * 0.16, cy - size * 0.16, cx + size * 0.16, cy - size * 0.16);
    line(ctx, cx, cy + size * 0.62, cx + size * 0.34, cy + size * 0.62);
    line(ctx, cx, cy + size * 0.8, cx + size * 0.24, cy + size * 0.8);
    line(ctx, cx, cy + size * 0.98, cx + size * 0.34, cy + size * 0.98);
  },

  hourglass(ctx, cx, cy, size, alpha) {
    [-1, 1].forEach((side) => {
      line(ctx, cx - size * 0.62, cy + side * size * 0.96, cx + size * 0.62, cy + side * size * 0.96);
      ctx.beginPath();
      ctx.moveTo(cx + side * size * 0.48, cy - size * 0.96);
      ctx.bezierCurveTo(
        cx + side * size * 0.48, cy - size * 0.36, cx + side * size * 0.06, cy - size * 0.2,
        cx + side * size * 0.06, cy
      );
      ctx.bezierCurveTo(
        cx + side * size * 0.06, cy + size * 0.2, cx + side * size * 0.48, cy + size * 0.36,
        cx + side * size * 0.48, cy + size * 0.96
      );
      ctx.stroke();
    });
    ctx.globalAlpha = alpha * 0.75;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.4, cy + size * 0.92);
    ctx.quadraticCurveTo(cx, cy + size * 0.36, cx + size * 0.4, cy + size * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.3, cy - size * 0.5);
    ctx.quadraticCurveTo(cx, cy - size * 0.36, cx + size * 0.3, cy - size * 0.5);
    ctx.quadraticCurveTo(cx + size * 0.1, cy - size * 0.2, cx, cy - size * 0.04);
    ctx.quadraticCurveTo(cx - size * 0.1, cy - size * 0.2, cx - size * 0.3, cy - size * 0.5);
    ctx.fill();
  },

  eye(ctx, cx, cy, size, alpha) {
    ctx.beginPath();
    ctx.moveTo(cx - size, cy);
    ctx.quadraticCurveTo(cx, cy - size * 0.8, cx + size, cy);
    ctx.quadraticCurveTo(cx, cy + size * 0.8, cx - size, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.33, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.14, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.6;
    for (let ray = -3; ray <= 3; ray += 1) {
      const angle = -Math.PI / 2 + ray * 0.3;
      line(
        ctx,
        cx + Math.cos(angle) * size * 0.62, cy + Math.sin(angle) * size * 0.62,
        cx + Math.cos(angle) * size * 0.94, cy + Math.sin(angle) * size * 0.94
      );
    }
  },

  anchor(ctx, cx, cy, size) {
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.82, size * 0.15, 0, TAU);
    ctx.stroke();
    line(ctx, cx, cy - size * 0.67, cx, cy + size * 0.9);
    line(ctx, cx - size * 0.42, cy - size * 0.42, cx + size * 0.42, cy - size * 0.42);
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.2, size * 0.7, Math.PI * 0.06, Math.PI * 0.94);
    ctx.stroke();
    [-1, 1].forEach((side) => {
      const x = cx + side * size * 0.69;
      const y = cy + size * 0.33;
      ctx.beginPath();
      ctx.moveTo(x - side * size * 0.2, y + size * 0.04);
      ctx.lineTo(x + side * size * 0.03, y - size * 0.2);
      ctx.lineTo(x + side * size * 0.16, y + size * 0.1);
      ctx.stroke();
    });
  },

  fleur(ctx, cx, cy, size, alpha) {
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.bezierCurveTo(cx + size * 0.36, cy - size * 0.45, cx + size * 0.24, cy, cx, cy + size * 0.26);
    ctx.bezierCurveTo(cx - size * 0.24, cy, cx - size * 0.36, cy - size * 0.45, cx, cy - size);
    ctx.stroke();
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(cx + side * size * 0.1, cy + size * 0.26);
      ctx.bezierCurveTo(
        cx + side * size * 0.3, cy - size * 0.32, cx + side * size * 0.92, cy - size * 0.56,
        cx + side * size * 0.86, cy - size * 0.04
      );
      ctx.bezierCurveTo(
        cx + side * size * 0.82, cy + size * 0.24, cx + side * size * 0.52, cy + size * 0.22,
        cx + side * size * 0.46, cy + size * 0.04
      );
      ctx.stroke();
      line(ctx, cx + side * size * 0.12, cy + size * 0.44, cx + side * size * 0.42, cy + size * 0.9);
    });
    ctx.strokeRect(cx - size * 0.42, cy + size * 0.28, size * 0.84, size * 0.14);
    line(ctx, cx, cy + size * 0.44, cx, cy + size);
    ctx.globalAlpha = alpha;
  },

  crown(ctx, cx, cy, size, alpha) {
    ctx.lineJoin = "round";
    ctx.beginPath();
    [[-0.8, 0.34], [-0.94, -0.46], [-0.42, 0], [0, -0.74], [0.42, 0], [0.94, -0.46], [0.8, 0.34]].forEach(([x, y], index) => {
      if (index) ctx.lineTo(cx + x * size, cy + y * size);
      else ctx.moveTo(cx + x * size, cy + y * size);
    });
    ctx.stroke();
    ctx.strokeRect(cx - size * 0.8, cy + size * 0.34, size * 1.6, size * 0.26);
    [[-0.94, -0.46], [0, -0.74], [0.94, -0.46]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(cx + x * size, cy + y * size - size * 0.1, size * 0.075, 0, TAU);
      ctx.fill();
    });
    ctx.globalAlpha = alpha * 0.6;
    [-0.5, 0, 0.5].forEach((x) => {
      ctx.beginPath();
      ctx.arc(cx + x * size, cy + size * 0.47, size * 0.05, 0, TAU);
      ctx.fill();
    });
  },

  knot(ctx, cx, cy, size, alpha) {
    const square = (radius, rotation) => {
      ctx.beginPath();
      for (let corner = 0; corner < 4; corner += 1) {
        const angle = rotation + (corner / 4) * TAU;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (corner) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    };
    square(size, 0);
    square(size, Math.PI / 4);
    ctx.globalAlpha = alpha * 0.6;
    square(size * 0.54, 0);
    square(size * 0.54, Math.PI / 4);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.12, 0, TAU);
    ctx.fill();
  },

  rosette(ctx, cx, cy, size, alpha) {
    const radius = size * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = alpha * 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.stroke();
    for (let petal = 0; petal < 6; petal += 1) {
      const angle = (petal / 6) * TAU;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  },

  book(ctx, cx, cy, size, alpha) {
    ctx.lineJoin = "round";
    [-1, 1].forEach((side) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.22);
      ctx.quadraticCurveTo(cx + side * size * 0.5, cy - size * 0.5, cx + side * size, cy - size * 0.28);
      ctx.lineTo(cx + side * size, cy + size * 0.62);
      ctx.quadraticCurveTo(cx + side * size * 0.5, cy + size * 0.4, cx, cy + size * 0.68);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.5;
      for (let row = 0; row < 3; row += 1) {
        const y = cy - size * 0.08 + row * size * 0.2;
        ctx.beginPath();
        ctx.moveTo(cx + side * size * 0.16, y + size * 0.03);
        ctx.quadraticCurveTo(cx + side * size * 0.5, y - size * 0.14, cx + side * size * 0.84, y);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = alpha;
    line(ctx, cx, cy - size * 0.22, cx, cy + size * 0.68);
    ctx.beginPath();
    for (let index = 0; index < 8; index += 1) {
      const r = index % 2 === 0 ? size * 0.2 : size * 0.055;
      const angle = (index / 8) * TAU - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy - size * 0.74 + Math.sin(angle) * r;
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  },

  heart(ctx, cx, cy, size, alpha) {
    const heart = (scale) => {
      const s = size * scale;
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.86);
      ctx.bezierCurveTo(cx - s * 1.5, cy - s * 0.1, cx - s * 0.7, cy - s * 1.2, cx, cy - s * 0.42);
      ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.2, cx + s * 1.5, cy - s * 0.1, cx, cy + s * 0.86);
      ctx.stroke();
    };
    ctx.lineJoin = "round";
    heart(1);
    ctx.globalAlpha = alpha * 0.55;
    heart(0.62);
  },

  astrolabe(ctx, cx, cy, size, alpha) {
    // Armillary ring, ecliptic meridian, degree ticks and suspension throne.
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.94, size * 0.12, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.06, size * 0.82, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.65;
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.06, size * 0.68, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.06, size * 0.68, size * 0.28, -0.45, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.06, size * 0.28, size * 0.68, 0.2, 0, TAU);
    ctx.stroke();
    // Degree ticks round the outer mater
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * TAU;
      const r0 = size * (i % 3 === 0 ? 0.69 : 0.75);
      const r1 = size * 0.82;
      line(ctx, cx + Math.cos(a) * r0, cy + size * 0.06 + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + size * 0.06 + Math.sin(a) * r1);
    }
    ctx.globalAlpha = alpha;
    // Alidade rule with pointer tips
    line(ctx, cx - size * 0.72, cy + size * 0.36, cx + size * 0.72, cy - size * 0.24);
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.06, size * 0.075, 0, TAU);
    ctx.fill();
  },

  moth(ctx, cx, cy, size, alpha) {
    // Nocturnal luna moth with symmetrical forewings, hindwing tails and eyespots.
    ctx.lineJoin = "round";
    [-1, 1].forEach((side) => {
      ctx.globalAlpha = alpha;
      // Forewing
      ctx.beginPath();
      ctx.moveTo(cx + side * size * 0.06, cy - size * 0.22);
      ctx.bezierCurveTo(cx + side * size * 0.56, cy - size * 0.78, cx + side * size * 1.05, cy - size * 0.42, cx + side * size * 0.88, cy + size * 0.02);
      ctx.bezierCurveTo(cx + side * size * 0.72, cy + size * 0.24, cx + side * size * 0.3, cy + size * 0.16, cx + side * size * 0.06, cy + size * 0.08);
      ctx.stroke();
      // Hindwing + swallowtail
      ctx.beginPath();
      ctx.moveTo(cx + side * size * 0.06, cy + size * 0.08);
      ctx.bezierCurveTo(cx + side * size * 0.64, cy + size * 0.14, cx + side * size * 0.68, cy + size * 0.66, cx + side * size * 0.34, cy + size * 0.68);
      ctx.quadraticCurveTo(cx + side * size * 0.28, cy + size * 0.94, cx + side * size * 0.2, cy + size * 0.96);
      ctx.quadraticCurveTo(cx + side * size * 0.18, cy + size * 0.62, cx + side * size * 0.05, cy + size * 0.44);
      ctx.stroke();
      // Eyespots & veins
      ctx.globalAlpha = alpha * 0.65;
      ctx.beginPath();
      ctx.arc(cx + side * size * 0.52, cy - size * 0.16, size * 0.11, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + side * size * 0.52, cy - size * 0.16, size * 0.04, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + side * size * 0.34, cy + size * 0.42, size * 0.065, 0, TAU);
      ctx.stroke();
      // Feathered antenna
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(cx + side * size * 0.05, cy - size * 0.38);
      ctx.quadraticCurveTo(cx + side * size * 0.22, cy - size * 0.72, cx + side * size * 0.36, cy - size * 0.74);
      ctx.stroke();
    });
    // Thorax & abdomen
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.08, size * 0.075, size * 0.44, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.36, size * 0.065, 0, TAU);
    ctx.fill();
  },

  plum(ctx, cx, cy, size, alpha) {
    // Classic winter plum branch with angular twigs and five-petal blossoms.
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.85, cy + size * 0.72);
    ctx.lineTo(cx - size * 0.22, cy + size * 0.16);
    ctx.lineTo(cx + size * 0.14, cy + size * 0.24);
    ctx.lineTo(cx + size * 0.78, cy - size * 0.54);
    ctx.stroke();
    line(ctx, cx - size * 0.22, cy + size * 0.16, cx - size * 0.46, cy - size * 0.56);
    line(ctx, cx + size * 0.14, cy + size * 0.24, cx + size * 0.62, cy + size * 0.48);
    const blossom = (bx, by, r, filled = false) => {
      for (let p = 0; p < 5; p += 1) {
        const a = (p / 5) * TAU - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(bx + Math.cos(a) * r * 0.58, by + Math.sin(a) * r * 0.58, r * 0.42, 0, TAU);
        if (filled) ctx.fill();
        else ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(bx, by, r * 0.18, 0, TAU);
      ctx.fill();
    };
    ctx.globalAlpha = alpha;
    blossom(cx + size * 0.46, cy - size * 0.18, size * 0.24, false);
    blossom(cx - size * 0.42, cy - size * 0.48, size * 0.2, false);
    blossom(cx - size * 0.12, cy + size * 0.12, size * 0.15, false);
    ctx.globalAlpha = alpha * 0.78;
    // Buds
    [[0.78, -0.54], [0.64, 0.48], [-0.56, -0.2], [0.22, -0.34]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(cx + dx * size, cy + dy * size, size * 0.055, 0, TAU);
      ctx.fill();
    });
  },

  swallow(ctx, cx, cy, size, alpha) {
    // Soaring swallow in flight with swept wings and forked tail.
    ctx.lineJoin = "round";
    ctx.beginPath();
    // Upper left swept wing
    ctx.moveTo(cx - size * 0.14, cy - size * 0.08);
    ctx.bezierCurveTo(cx - size * 0.42, cy - size * 0.68, cx - size * 0.96, cy - size * 0.72, cx - size * 0.98, cy - size * 0.44);
    ctx.bezierCurveTo(cx - size * 0.78, cy - size * 0.18, cx - size * 0.46, cy + size * 0.04, cx - size * 0.18, cy + size * 0.14);
    ctx.stroke();
    // Upper right wing
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.14, cy - size * 0.16);
    ctx.bezierCurveTo(cx + size * 0.46, cy - size * 0.66, cx + size * 0.96, cy - size * 0.56, cx + size * 0.94, cy - size * 0.28);
    ctx.bezierCurveTo(cx + size * 0.7, cy - size * 0.02, cx + size * 0.4, cy + size * 0.12, cx + size * 0.12, cy + size * 0.16);
    ctx.stroke();
    // Body, head & forked tail
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.24, cy - size * 0.42);
    ctx.quadraticCurveTo(cx + size * 0.06, cy - size * 0.26, cx - size * 0.06, cy + size * 0.16);
    ctx.lineTo(cx - size * 0.52, cy + size * 0.78);
    ctx.lineTo(cx - size * 0.12, cy + size * 0.42);
    ctx.lineTo(cx + size * 0.16, cy + size * 0.84);
    ctx.lineTo(cx + size * 0.12, cy + size * 0.16);
    ctx.quadraticCurveTo(cx + size * 0.24, cy - size * 0.18, cx + size * 0.24, cy - size * 0.42);
    ctx.stroke();
    // Delicate sprig held in beak
    ctx.globalAlpha = alpha * 0.72;
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.24, cy - size * 0.42);
    ctx.quadraticCurveTo(cx + size * 0.48, cy - size * 0.54, cx + size * 0.66, cy - size * 0.44);
    ctx.stroke();
    leaf(ctx, cx + size * 0.48, cy - size * 0.48, size * 0.16, size * 0.045, -0.5);
  },

  archway(ctx, cx, cy, size, alpha) {
    // Classical arched portal with fluted pilasters, keystone and crescent star inside.
    const w = size * 0.68;
    const base = cy + size * 0.86;
    const spring = cy - size * 0.16;
    ctx.beginPath();
    ctx.moveTo(cx - w, base);
    ctx.lineTo(cx - w, spring);
    ctx.arc(cx, spring, w, Math.PI, 0);
    ctx.lineTo(cx + w, base);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.65;
    const wi = w * 0.78;
    ctx.beginPath();
    ctx.moveTo(cx - wi, base);
    ctx.lineTo(cx - wi, spring);
    ctx.arc(cx, spring, wi, Math.PI, 0);
    ctx.lineTo(cx + wi, base);
    ctx.stroke();
    // Plinth & steps
    ctx.globalAlpha = alpha;
    line(ctx, cx - w * 1.18, base, cx + w * 1.18, base);
    line(ctx, cx - w * 1.05, base - size * 0.08, cx + w * 1.05, base - size * 0.08);
    // Perspective floor & star at apex
    ctx.globalAlpha = alpha * 0.55;
    for (let i = -2; i <= 2; i += 1) {
      line(ctx, cx + i * wi * 0.18, cy + size * 0.32, cx + i * wi * 0.44, base - size * 0.08);
    }
    ctx.globalAlpha = alpha;
    const sy = spring - size * 0.1;
    line(ctx, cx - size * 0.14, sy, cx + size * 0.14, sy);
    line(ctx, cx, sy - size * 0.14, cx, sy + size * 0.14);
  },

  rose(ctx, cx, cy, size, alpha) {
    // Heraldic Tudor rose: double ring of five sculpted petals, sepals and stamen crown.
    const ring = (count, r, petalR, rot) => {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * TAU + rot;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.arc(0, 0, petalR, -Math.PI * 0.58, Math.PI * 0.58);
        ctx.stroke();
        ctx.restore();
      }
    };
    // Five outer pointed sepals
    ctx.globalAlpha = alpha * 0.72;
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU + Math.PI / 5 - Math.PI / 2;
      leaf(ctx, cx + Math.cos(a) * size * 0.56, cy + Math.sin(a) * size * 0.56, size * 0.42, size * 0.1, a);
    }
    ctx.globalAlpha = alpha;
    ring(5, size * 0.46, size * 0.36, -Math.PI / 2);
    ring(5, size * 0.25, size * 0.22, Math.PI / 5 - Math.PI / 2);
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.15, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * size * 0.08, cy + Math.sin(a) * size * 0.08, size * 0.022, 0, TAU);
      ctx.fill();
    }
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
