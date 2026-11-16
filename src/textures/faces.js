// Cover painters. Each board is two layers:
//   base — the dyed material plus anything printed or blind-stamped into it
//   foil — a white-on-transparent mask that the metallic foil material uses
// Layouts are authored on a logical 768 × 1152 board (320 × 1536 for the spine)
// and scaled to whatever resolution the rig asks for.

import { fontString } from "../data/fonts.js";
import { getImage } from "../state/images.js";
import { layerText } from "../state/schema.js";
import { rgba } from "../util.js";
import { drawMotif, hasMotif } from "./motifs.js";
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

/**
 * Route a drawing routine to the right layer for its finish.
 * foil  → white on the foil mask
 * ink   → the layer's own colour, printed on the material
 * blind → a tone-on-tone impression pressed into the material
 */
function withFinish(layers, finish, color, draw) {
  if (finish === "foil") {
    draw(layers.foil, "#ffffff");
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
}

/* ---------- borders ---------- */

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
  if (style === "single") {
    rect(0, 2.2);
  } else if (style === "double") {
    rect(0, 2);
    rect(13, 2);
  } else if (style === "triple") {
    rect(0, 6);
    rect(13, 1.6);
    rect(21, 1.6);
  } else if (style === "corners") {
    const arm = width * 0.085;
    ctx.lineWidth = 2.4;
    [[m, m, 1, 1], [width - m, m, -1, 1], [m, height - m, 1, -1], [width - m, height - m, -1, -1]]
      .forEach(([x, y, dx, dy]) => {
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
    [[m, m, 1, 1], [width - m, m, -1, 1], [m, height - m, 1, -1], [width - m, height - m, -1, -1]]
      .forEach(([x, y, dx, dy]) => {
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
  const x = width * 0.15;
  const y = height * 0.155;
  const w = width * 0.7;
  const h = height * 0.3;
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
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x + 13, y + 13, w - 26, h - 26);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x + 19, y + 19, w - 38, h - 38);
    ctx.restore();
  } else {
    withFinish(layers, border.finish, border.color, (ctx, color) => {
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

function drawTextLayer(layers, book, layer, width, height) {
  if (!layer.show) return;
  const text = layerText(book, layer).trim();
  if (!text) return;
  const maxWidth = (layer.width || 0.8) * width;
  const isDisplay = layer.size >= 44;

  withFinish(layers, layer.finish, layer.color, (ctx, color) => {
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
  withFinish(layers, motif.finish, motif.color, (ctx, color) => {
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

function drawCoverImage(ctx, image, x, y, w, h) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(
    image,
    (image.naturalWidth - sw) / 2,
    (image.naturalHeight - sh) / 2,
    sw,
    sh,
    x,
    y,
    w,
    h
  );
}

/* ---------- boards ---------- */

export function paintFront(book, baseTarget, foilTarget, onAsset) {
  const { width, height } = FACE_SIZE.front;
  const layers = { base: begin(baseTarget, FACE_SIZE.front), foil: begin(foilTarget, FACE_SIZE.front) };
  const front = book.front;
  paintMaterialBase(layers.base, width, height, book.material.color, book.material.kind, book.seed);

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
        drawCoverImage(ctx, image, x, y, w, h);
      } else {
        drawCoverImage(ctx, image, 0, 0, width, height);
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

  if (front.border.style === "panel") {
    drawPanel(layers, front.border, width, height);
  } else if (front.border.style !== "none") {
    withFinish(layers, front.border.finish, front.border.color, (ctx, color) => {
      drawBorder(ctx, color, front.border.style, front.border.inset, width, height);
    });
  }
  drawMotifLayer(layers, book, front.motif, width, height);
  front.texts.forEach((layer) => drawTextLayer(layers, book, layer, width, height));
  baseTarget.commit();
  foilTarget.commit();
}

export function paintBack(book, baseTarget, foilTarget) {
  const { width, height } = FACE_SIZE.back;
  const layers = { base: begin(baseTarget, FACE_SIZE.back), foil: begin(foilTarget, FACE_SIZE.back) };
  const back = book.back;
  paintMaterialBase(layers.base, width, height, book.material.color, book.material.kind, book.seed + 3);

  if (back.border.style !== "none" && back.border.style !== "panel") {
    withFinish(layers, back.border.finish, back.border.color, (ctx, color) => {
      drawBorder(ctx, color, back.border.style, back.border.inset, width, height);
    });
  }
  drawMotifLayer(layers, book, back.motif, width, height);
  back.texts.forEach((layer) => drawTextLayer(layers, book, layer, width, height));
  baseTarget.commit();
  foilTarget.commit();
}

function drawSpineText(layers, book, layer, width, height) {
  if (!layer.show) return;
  const text = layerText(book, layer).trim();
  if (!text) return;
  withFinish(layers, layer.finish, layer.color, (ctx, color) => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const setFont = (size) => {
      ctx.font = fontString(layer, size);
      setTracking(ctx, layer.tracking, size);
    };
    if (layer.orient === "horizontal") {
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
    } else if (isCjk(text) && !/[A-Za-z]{2,}/.test(text)) {
      // CJK titles read upright, one character per line down the spine.
      const characters = [...text.replace(/\s+/g, "")];
      const room = height * 0.56;
      let size = Math.min(layer.size, width * 0.5);
      let pitch = size * (1.12 + (layer.tracking || 0));
      if (pitch * characters.length > room) {
        size *= room / (pitch * characters.length);
        pitch = size * (1.12 + (layer.tracking || 0));
      }
      ctx.font = fontString(layer, size);
      ctx.letterSpacing = "0px";
      const top = layer.y * height - (pitch * (characters.length - 1)) / 2;
      characters.forEach((character, index) => {
        ctx.fillText(character, width / 2, top + index * pitch);
      });
    } else {
      let size = Math.min(layer.size, width * 0.56);
      setFont(size);
      const room = height * 0.56;
      const measured = ctx.measureText(text).width;
      if (measured > room) {
        size *= room / measured;
        setFont(size);
      }
      ctx.translate(width / 2, layer.y * height);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(text, (layer.tracking || 0) * size * 0.5, size * 0.04);
    }
    ctx.restore();
  });
}

export function paintSpine(book, baseTarget, foilTarget) {
  const { width, height } = FACE_SIZE.spine;
  const layers = { base: begin(baseTarget, FACE_SIZE.spine), foil: begin(foilTarget, FACE_SIZE.spine) };
  const spine = book.spine;
  paintMaterialBase(layers.base, width, height, book.material.color, book.material.kind, book.seed + 7, { spine: true });

  withFinish(layers, spine.finish, spine.color, (ctx, color) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (spine.style === "frame") {
      ctx.lineWidth = 2.4;
      ctx.strokeRect(30, 38, width - 60, height - 76);
    } else if (spine.style === "rules") {
      [44, 60, height - 60, height - 44].forEach((y, index) => {
        ctx.fillRect(26, y, width - 52, index === 0 || index === 3 ? 4 : 1.6);
      });
    } else if (spine.style === "bands") {
      [0.135, 0.3, 0.7, 0.865].forEach((position) => {
        const y = position * height;
        ctx.fillRect(18, y - 9, width - 36, 2);
        ctx.fillRect(18, y + 7, width - 36, 2);
      });
      [36, height - 36].forEach((y) => ctx.fillRect(18, y - 2, width - 36, 4));
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
    withFinish(layers, spine.finish, spine.color, (ctx, color) => {
      drawMotif(ctx, book.front.motif.key, {
        cx: width / 2, cy: height - 128, size: 44, color, alpha: 1, lineWidth: 2, text: book.title
      });
    });
  }

  if (spine.style === "bands") {
    // Raised bands: a soft shadow under each cord so the bump reads in the dye too.
    const ctx = layers.base;
    [0.135, 0.3, 0.7, 0.865].forEach((position) => {
      const y = position * height;
      const shade = ctx.createLinearGradient(0, y - 16, 0, y + 20);
      shade.addColorStop(0, "rgba(0,0,0,0)");
      shade.addColorStop(0.35, "rgba(255,255,255,0.07)");
      shade.addColorStop(0.7, "rgba(0,0,0,0.2)");
      shade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, y - 16, width, 36);
    });
  }

  spine.texts.forEach((layer) => drawSpineText(layers, book, layer, width, height));
  baseTarget.commit();
  foilTarget.commit();
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
