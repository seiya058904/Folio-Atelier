// Collector Photo Card compositor for Photo Studio mode.
// Zero external dependencies: composes a 2x-supersampled WebGL photograph of the
// book with archival typography, craft specifications, colour palette swatches,
// colophon seal, and optional custom ex-libris caption across five templates.

import { FOILS, MATERIALS, getFoil } from "./data/presets.js";
import { getLang, t } from "./i18n.js";
import { TRIMS } from "./state/schema.js";
import { drawMotif, hasMotif } from "./textures/motifs.js";
import { hashSeed, hexToRgb, mixHex, rgba, seededRandom } from "./util.js";

export const PHOTO_ANGLES = [
  { id: "photo_hero", label: "3/4 Hero" },
  { id: "photo_front", label: "Front" },
  { id: "photo_spine", label: "Spine" },
  { id: "photo_detail", label: "Detail" },
  { id: "photo_spread", label: "Spread" },
  { id: "photo_editorial", label: "Editorial" }
];

export const PHOTO_ASPECTS = [
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 }
];

export const PHOTO_BACKDROPS = [
  { id: "match", label: "Room", swatch: "linear-gradient(135deg, #e9dfcb 45%, #38343d 55%)" },
  { id: "cream", label: "Cream", swatch: "#f4eee2" },
  { id: "linen", label: "Linen", swatch: "#e2d7c4" },
  { id: "sage", label: "Sage", swatch: "#d7dfd6" },
  { id: "charcoal", label: "Charcoal", swatch: "#1a191e" },
  { id: "transparent", label: "Cutout", swatch: "repeating-conic-gradient(#d4cfc6 0 25%, #f8f5ef 0 50%) 50% / 10px 10px" }
];

export const PHOTO_TEMPLATES = [
  { id: "specimen", label: "Specimen Card" },
  { id: "film", label: "35mm Film" },
  { id: "polaroid", label: "Polaroid" },
  { id: "poster", label: "Gallery Poster" },
  { id: "clean", label: "Clean Photo" }
];

const LIGHT_LABELS = {
  studio: "Studio",
  morning: "Morning",
  golden: "Golden hour",
  night: "Night"
};

const BINDING_SHORT = {
  full: "Full",
  quarter: "Quarter",
  half: "Half"
};

const EDGE_SHORT = {
  plain: "Natural",
  gilt: "Gilt",
  gauffered: "Gauffered",
  gilt_crimson: "Crimson under gold",
  tinted: "Stained",
  sprinkled: "Sprinkled",
  marbled: "Marbled",
  ombre: "Ombr\u00e9",
  foreedge: "Fore-edge painting",
  botanical: "Botanical"
};

function serialCode(book) {
  const n = (Math.abs(hashSeed(`${book.id || ""}-${book.seed || 0}`)) % 8999) + 1000;
  return `FA \u00b7 NO. ${n}`;
}

function formatDateStamp(light, lang) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const lightLabel = t(LIGHT_LABELS[light] || "Studio");
  return lang === "zh"
    ? `${y}.${m}.${d} \u00b7 ${lightLabel}`
    : `${y}.${m}.${d} \u00b7 ${lightLabel.toUpperCase()}`;
}

function filmDateStamp() {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `'${y} ${m} ${d}`;
}

function bookCraftSpecs(book, pageCount) {
  const mat = MATERIALS.find((m) => m.id === book.material?.kind) || MATERIALS[0];
  const foil = FOILS.find((f) => f.id === book.foil?.preset) || getFoil(book.foil?.preset);
  const trim = TRIMS.find((tr) => tr.id === book.structure?.trim) || TRIMS[2];
  const binding = BINDING_SHORT[book.material?.binding || "full"] || "Full";
  const edge = EDGE_SHORT[book.details?.edge?.style || "plain"] || "Natural";
  const bulkPct = `${Math.round((book.structure?.bulk || 1) * 100)}%`;
  const pages = pageCount || book.pages?.length || 1;
  return {
    covering: `${t(mat.label)} \u00b7 ${t(binding)}`,
    foilEdge: `${t(foil?.id === "custom" ? "Custom foil" : foil?.label || "Gold")} \u00b7 ${t(edge)}`,
    edition: `${t(trim.label)} \u00b7 ${bulkPct} \u00b7 ${pages}p`,
    oneLine: [
      t(mat.label),
      t(foil?.id === "custom" ? "Custom foil" : foil?.label || "Gold"),
      t(trim.label),
      t(edge)
    ].join("  \u00b7  ")
  };
}

function bookSwatches(book) {
  const out = [];
  const push = (hex, metal = false) => {
    if (!hex || typeof hex !== "string") return;
    const norm = hex.toLowerCase();
    if (out.some((item) => item.hex === norm)) return;
    out.push({ hex: norm, metal });
  };
  push(book.material?.color, false);
  if (book.material?.binding && book.material.binding !== "full") push(book.material?.second, false);
  push(book.foil?.color, (book.foil?.metalness ?? 0.9) > 0.45);
  push(book.details?.endpaper?.color, false);
  if (book.details?.ribbon?.show !== false) push(book.details?.ribbon?.color, false);
  return out.slice(0, 5);
}

function drawSwatchChip(ctx, x, y, r, swatch, borderColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (swatch.metal) {
    const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    grad.addColorStop(0, mixHex(swatch.hex, "#ffffff", 0.55));
    grad.addColorStop(0.45, swatch.hex);
    grad.addColorStop(0.82, mixHex(swatch.hex, "#14100c", 0.28));
    grad.addColorStop(1, mixHex(swatch.hex, "#ffffff", 0.28));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = swatch.hex;
  }
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.14);
  ctx.strokeStyle = borderColor;
  ctx.stroke();
  ctx.restore();
}

/** Crisp miniature Folio Atelier publisher colophon emblem. */
function drawAtelierSeal(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, r * 0.065);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.8, r * 0.038);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
  ctx.stroke();
  // Stylized open/bound book monogram inside ring
  const bw = r * 0.58;
  const bh = r * 0.74;
  ctx.lineWidth = Math.max(1.2, r * 0.06);
  ctx.strokeRect(cx - bw * 0.5, cy - bh * 0.5, bw, bh);
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.26, cy - bh * 0.5);
  ctx.lineTo(cx - bw * 0.26, cy + bh * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + bw * 0.12, cy, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintPaperGrain(ctx, w, h, seed, dark = false) {
  const rand = seededRandom(hashSeed(`card-paper-${seed}`));
  ctx.save();
  const specks = Math.min(2200, Math.round((w * h) / 1400));
  for (let i = 0; i < specks; i += 1) {
    const x = rand() * w;
    const y = rand() * h;
    const bright = rand() > 0.5;
    ctx.fillStyle = dark
      ? (bright ? "rgba(255,248,236,0.032)" : "rgba(0,0,0,0.08)")
      : (bright ? "rgba(255,255,255,0.22)" : "rgba(68,52,36,0.045)");
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.restore();
}

function fitFont(ctx, text, family, weight, italic, startSize, minSize, maxWidth) {
  let size = startSize;
  const style = `${italic ? "italic " : ""}${weight}`;
  while (size > minSize) {
    ctx.font = `${style} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= Math.max(1, Math.round(size * 0.06));
  }
  ctx.font = `${style} ${size}px ${family}`;
  return size;
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 2 && ctx.measureText(`${chars.join("")}\u2026`).width > maxWidth) chars.pop();
  return `${chars.join("").trimEnd()}\u2026`;
}

function drawCoverPhoto(ctx, photo, dx, dy, dw, dh) {
  const srcRatio = photo.width / Math.max(1, photo.height);
  const dstRatio = dw / Math.max(1, dh);
  let sx = 0, sy = 0, sw = photo.width, sh = photo.height;
  if (srcRatio > dstRatio) {
    sw = photo.height * dstRatio;
    sx = (photo.width - sw) * 0.5;
  } else {
    sh = photo.width / dstRatio;
    sy = (photo.height - sh) * 0.5;
  }
  ctx.drawImage(photo, sx, sy, sw, sh, dx, dy, dw, dh);
}

const SERIF = '"Cormorant Garamond", "Noto Serif SC", Georgia, serif';
const SANS = '"Inter", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif';
const MONO = '"IBM Plex Mono", "Inter", monospace';

/**
 * Compose a collector photo card onto a high-res canvas.
 * Pass `target` to reuse an existing canvas (zero allocation during live darkroom toggling).
 */
export function composePhotoCard(photoCanvas, book, options = {}) {
  const {
    template = "specimen",
    showTitle = true,
    showSpecs = true,
    showSwatches = true,
    showMark = true,
    showDate = true,
    caption = "",
    light = "studio",
    transparent = false,
    pageCount = 0,
    scale = 1,
    target = null
  } = options;

  const lang = getLang();
  const pw = photoCanvas.width;
  const ph = photoCanvas.height;
  const ratio = pw / Math.max(1, ph);
  const specs = bookCraftSpecs(book, pageCount);
  const swatches = bookSwatches(book);
  const serial = serialCode(book);
  const dateLine = formatDateStamp(light, lang);
  const cleanCaption = String(caption || "").trim();
  const titleText = (book.title || t("Untitled")).trim();
  const authorText = (book.author || "").trim();

  // Compute output card canvas dimensions (high resolution 1440..2000px at scale=1)
  const baseUnit = Math.round(1400 * scale);
  let W;
  let H;
  let pad;
  let headH = 0;
  let footH = 0;
  let imgX;
  let imgY;
  let imgW;
  let imgH;

  if (template === "clean") {
    W = Math.round(pw * scale);
    H = Math.round(ph * scale);
  } else if (template === "poster") {
    W = ratio >= 1 ? Math.round(baseUnit * 1.18) : baseUnit;
    H = Math.round(W / ratio);
  } else if (template === "polaroid") {
    W = ratio >= 1.2 ? Math.round(baseUnit * 1.14) : baseUnit;
    pad = Math.round(W * 0.068);
    imgW = W - pad * 2;
    imgH = Math.round(imgW / Math.max(0.62, Math.min(1.5, ratio)));
    const hasMeta = showTitle || showSpecs || showSwatches || showMark || showDate || cleanCaption;
    footH = Math.round(W * (hasMeta ? 0.255 : 0.19));
    H = pad + imgH + footH;
    imgX = pad;
    imgY = pad;
  } else if (template === "film") {
    W = ratio >= 1.15 ? Math.round(baseUnit * 1.18) : baseUnit;
    const sprocketBand = Math.round(W * 0.092);
    pad = Math.round(W * 0.044);
    imgX = sprocketBand;
    imgW = W - sprocketBand * 2;
    imgH = Math.round(imgW / Math.max(0.56, Math.min(1.65, ratio)));
    headH = Math.round(W * 0.062);
    const hasFoot = showTitle || showSpecs || showSwatches || showMark || cleanCaption;
    footH = Math.round(W * (hasFoot ? (cleanCaption ? 0.195 : 0.168) : 0.068));
    imgY = headH;
    H = headH + imgH + footH;
  } else {
    // Default: "specimen" archival museum specimen card
    W = ratio >= 1.15 ? Math.round(baseUnit * 1.16) : baseUnit;
    pad = Math.round(W * 0.064);
    headH = showMark || showDate ? Math.round(W * 0.056) : Math.round(W * 0.02);
    imgX = pad;
    imgY = pad + headH;
    imgW = W - pad * 2;
    imgH = Math.round(imgW / Math.max(0.58, Math.min(1.6, ratio)));
    let bodyFoot = 0;
    if (showTitle || cleanCaption || showSwatches || showMark) bodyFoot += Math.round(W * 0.135);
    if (cleanCaption && showTitle) bodyFoot += Math.round(W * 0.036);
    if (showSpecs) bodyFoot += Math.round(W * 0.072);
    footH = Math.max(Math.round(W * 0.045), bodyFoot + Math.round(W * 0.04));
    H = imgY + imgH + footH + pad * 0.55;
  }

  const canvas = target || document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(W));
  canvas.height = Math.max(1, Math.round(H));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /* ---------- 5. Clean Photo ---------- */
  if (template === "clean") {
    ctx.drawImage(photoCanvas, 0, 0, canvas.width, canvas.height);
    const u = Math.min(W, H);
    if (showMark || showDate) {
      ctx.save();
      const padM = u * 0.032;
      const text = [showMark ? "FOLIO ATELIER" : "", showDate ? dateLine : ""].filter(Boolean).join("  \u00b7  ");
      ctx.font = `500 ${Math.round(u * 0.017)}px ${SANS}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(24, 19, 14, 0.34)";
      ctx.fillText(text, W - padM + 1, H - padM + 1);
      ctx.fillStyle = "rgba(248, 243, 234, 0.82)";
      ctx.fillText(text, W - padM, H - padM);
      ctx.restore();
    }
    return canvas;
  }

  /* ---------- 4. Gallery Poster ---------- */
  if (template === "poster") {
    if (transparent) {
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.45, W * 0.08, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
      bg.addColorStop(0, mixHex(book.material?.color || "#2a2826", "#f0e8da", 0.78));
      bg.addColorStop(1, mixHex(book.material?.color || "#2a2826", "#cfc3af", 0.55));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
    }
    drawCoverPhoto(ctx, photoCanvas, 0, 0, W, H);

    const m = Math.round(W * 0.045);
    const hasTop = showMark || showDate;
    const hasBottom = showTitle || showSpecs || showSwatches || cleanCaption;

    if (hasTop) {
      const tg = ctx.createLinearGradient(0, 0, 0, H * 0.22);
      tg.addColorStop(0, "rgba(14, 11, 9, 0.54)");
      tg.addColorStop(1, "rgba(14, 11, 9, 0)");
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, W, H * 0.22);
    }
    if (hasBottom) {
      const bg = ctx.createLinearGradient(0, H * 0.62, 0, H);
      bg.addColorStop(0, "rgba(14, 11, 9, 0)");
      bg.addColorStop(0.55, "rgba(14, 11, 9, 0.44)");
      bg.addColorStop(1, "rgba(14, 11, 9, 0.78)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, H * 0.62, W, H * 0.38);
    }

    // Architectural exhibition hairline inset frame
    ctx.save();
    ctx.strokeStyle = "rgba(246, 239, 228, 0.36)";
    ctx.lineWidth = Math.max(1.2, W * 0.0014);
    ctx.strokeRect(m, m, W - m * 2, H - m * 2);
    ctx.restore();

    const inkLight = "#f7f1e6";
    const inkSoft = "rgba(247, 241, 230, 0.74)";
    const innerPad = m + Math.round(W * 0.032);

    if (hasTop) {
      ctx.save();
      ctx.textBaseline = "middle";
      const ty = m + Math.round(W * 0.036);
      ctx.font = `600 ${Math.round(W * 0.0155)}px ${SANS}`;
      ctx.fillStyle = inkLight;
      if (showMark) {
        ctx.textAlign = "left";
        ctx.fillText(`FOLIO ATELIER  \u00b7  ${serial}`, innerPad, ty);
      }
      if (showDate) {
        ctx.textAlign = "right";
        ctx.fillStyle = inkSoft;
        ctx.fillText(dateLine, W - innerPad, ty);
      }
      ctx.restore();
    }

    if (hasBottom) {
      ctx.save();
      let cursorY = H - m - Math.round(W * 0.036);
      if (showSpecs) {
        ctx.font = `500 ${Math.round(W * 0.0145)}px ${SANS}`;
        ctx.fillStyle = inkSoft;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(truncateText(ctx, specs.oneLine.toUpperCase(), W - innerPad * 2 - (showSwatches ? W * 0.24 : 0)), innerPad, cursorY);
        if (showSwatches) {
          const r = Math.round(W * 0.0115);
          swatches.forEach((sw, idx) => {
            const sx = W - innerPad - r - (swatches.length - 1 - idx) * (r * 2.65);
            drawSwatchChip(ctx, sx, cursorY - r * 0.45, r, sw, "rgba(255,255,255,0.65)");
          });
        }
        cursorY -= Math.round(W * 0.04);
      } else if (showSwatches) {
        const r = Math.round(W * 0.012);
        swatches.forEach((sw, idx) => {
          const sx = innerPad + r + idx * (r * 2.75);
          drawSwatchChip(ctx, sx, cursorY - r * 0.5, r, sw, "rgba(255,255,255,0.65)");
        });
        cursorY -= Math.round(W * 0.044);
      }

      if (cleanCaption) {
        ctx.font = `italic 400 ${Math.round(W * 0.023)}px ${SERIF}`;
        ctx.fillStyle = inkSoft;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(`\u201c${truncateText(ctx, cleanCaption, W - innerPad * 2)}\u201d`, innerPad, cursorY);
        cursorY -= Math.round(W * 0.04);
      }

      if (showTitle) {
        if (authorText) {
          ctx.font = `500 ${Math.round(W * 0.0175)}px ${SANS}`;
          ctx.fillStyle = inkSoft;
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(truncateText(ctx, authorText.toUpperCase(), W - innerPad * 2), innerPad, cursorY);
          cursorY -= Math.round(W * 0.036);
        }
        const tSize = fitFont(ctx, titleText, SERIF, 500, false, Math.round(W * 0.068), Math.round(W * 0.032), W - innerPad * 2);
        ctx.fillStyle = inkLight;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(truncateText(ctx, titleText, W - innerPad * 2), innerPad, cursorY);
        cursorY -= tSize * 0.9;
      }

      if (showMark) {
        ctx.fillStyle = "rgba(247, 241, 230, 0.42)";
        ctx.fillRect(innerPad, cursorY - Math.round(W * 0.012), Math.round(W * 0.075), Math.max(1.5, W * 0.0016));
      }
      ctx.restore();
    }
    return canvas;
  }

  /* ---------- 2. 35mm Analog Film ---------- */
  if (template === "film") {
    ctx.fillStyle = "#151412";
    ctx.fillRect(0, 0, W, H);
    paintPaperGrain(ctx, W, H, book.seed || 7, true);

    // Subtle celluloid base warm sheen
    const stripGrad = ctx.createLinearGradient(0, 0, W, H);
    stripGrad.addColorStop(0, "rgba(255, 224, 178, 0.03)");
    stripGrad.addColorStop(0.5, "rgba(0, 0, 0, 0)");
    stripGrad.addColorStop(1, "rgba(255, 210, 150, 0.035)");
    ctx.fillStyle = stripGrad;
    ctx.fillRect(0, 0, W, H);

    // Authentic left & right 35mm sprocket holes
    const holeW = Math.round(W * 0.044);
    const holeH = Math.round(W * 0.064);
    const holeR = Math.round(holeW * 0.22);
    const pitch = Math.round(holeH * 1.56);
    const leftX = Math.round((imgX - holeW) * 0.5);
    const rightX = Math.round(imgX + imgW + (W - imgX - imgW - holeW) * 0.5);
    ctx.save();
    for (let y = Math.round(pitch * 0.25); y < H - holeH * 0.4; y += pitch) {
      [leftX, rightX].forEach((hx) => {
        ctx.fillStyle = "#080706";
        ctx.beginPath();
        ctx.roundRect(hx, y, holeW, holeH, holeR);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 232, 198, 0.1)";
        ctx.lineWidth = Math.max(1, W * 0.0012);
        ctx.stroke();
      });
    }
    ctx.restore();

    // Film rebate markings (Kodak/Ilford gold amber print)
    ctx.save();
    ctx.fillStyle = "#d49b54";
    ctx.font = `600 ${Math.round(W * 0.015)}px ${MONO}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(showMark ? "FOLIO 400 \u00b7 35MM" : "35MM \u00b7 400 ISO", imgX, headH * 0.54);
    ctx.textAlign = "center";
    ctx.fillText("\u25b6  07A", W * 0.5, headH * 0.54);
    ctx.textAlign = "right";
    ctx.fillText(showMark ? serial : "SAFE LIGHT", imgX + imgW, headH * 0.54);
    ctx.restore();

    // Photo frame aperture
    ctx.save();
    ctx.fillStyle = "#0c0b0a";
    ctx.fillRect(imgX - 3, imgY - 3, imgW + 6, imgH + 6);
    if (transparent) {
      ctx.fillStyle = "#22201e";
      ctx.fillRect(imgX, imgY, imgW, imgH);
    }
    ctx.beginPath();
    ctx.rect(imgX, imgY, imgW, imgH);
    ctx.clip();
    drawCoverPhoto(ctx, photoCanvas, imgX, imgY, imgW, imgH);
    // Subtle warm analog vignette
    const vig = ctx.createRadialGradient(
      imgX + imgW * 0.5, imgY + imgH * 0.5, Math.min(imgW, imgH) * 0.36,
      imgX + imgW * 0.5, imgY + imgH * 0.5, Math.max(imgW, imgH) * 0.72
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(18,12,6,0.28)");
    ctx.fillStyle = vig;
    ctx.fillRect(imgX, imgY, imgW, imgH);
    // Classic glowing quartz orange-red date imprint inside frame bottom-right
    if (showDate) {
      const stamp = filmDateStamp();
      ctx.font = `600 ${Math.round(W * 0.024)}px ${MONO}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.shadowColor = "rgba(255, 110, 32, 0.85)";
      ctx.shadowBlur = Math.round(W * 0.012);
      ctx.fillStyle = "#ff8a3d";
      ctx.fillText(stamp, imgX + imgW - Math.round(W * 0.026), imgY + imgH - Math.round(W * 0.022));
      ctx.shadowColor = "transparent";
    }
    ctx.restore();

    // Crisp hairline around exposure aperture
    ctx.strokeStyle = "rgba(240, 224, 198, 0.18)";
    ctx.lineWidth = Math.max(1, W * 0.0012);
    ctx.strokeRect(imgX, imgY, imgW, imgH);

    // Bottom film contact sheet strip
    const footTop = imgY + imgH + Math.round(W * 0.032);
    ctx.save();
    let filmLeftY = footTop;
    if (showTitle) {
      const tSize = fitFont(ctx, titleText, SERIF, 500, false, Math.round(W * 0.039), Math.round(W * 0.024), imgW * (showSwatches ? 0.68 : 0.96));
      ctx.fillStyle = "#f2eadb";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      filmLeftY += tSize * 0.78;
      ctx.fillText(truncateText(ctx, titleText, imgW * (showSwatches ? 0.68 : 0.96)), imgX, filmLeftY);
      if (authorText) {
        filmLeftY += Math.round(W * 0.029);
        ctx.font = `400 ${Math.round(W * 0.0165)}px ${SANS}`;
        ctx.fillStyle = "rgba(232, 222, 204, 0.68)";
        ctx.fillText(truncateText(ctx, authorText, imgW * 0.68), imgX, filmLeftY);
      }
    }
    if (showSwatches) {
      const r = Math.round(W * 0.0115);
      const sy = footTop + Math.round(W * 0.026);
      swatches.forEach((sw, idx) => {
        const sx = imgX + imgW - r - (swatches.length - 1 - idx) * (r * 2.65);
        drawSwatchChip(ctx, sx, sy, r, sw, "rgba(255,244,224,0.45)");
      });
    }
    const bottomY = H - Math.round(W * 0.026);
    if (cleanCaption) {
      ctx.font = `italic 400 ${Math.round(W * 0.0205)}px ${SERIF}`;
      ctx.fillStyle = "#e3c596";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const capY = Math.max(filmLeftY + Math.round(W * 0.032), bottomY - (showSpecs ? Math.round(W * 0.032) : 0));
      ctx.fillText(`\u201c${truncateText(ctx, cleanCaption, imgW)}\u201d`, imgX, capY);
    }
    if (showSpecs) {
      ctx.font = `400 ${Math.round(W * 0.0132)}px ${MONO}`;
      ctx.fillStyle = "rgba(218, 204, 182, 0.62)";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(truncateText(ctx, specs.oneLine, imgW), imgX, bottomY);
    }
    ctx.restore();
    return canvas;
  }

  /* ---------- 3. Polaroid Instant Print ---------- */
  if (template === "polaroid") {
    const paperGrad = ctx.createLinearGradient(0, 0, W, H);
    paperGrad.addColorStop(0, "#faf6ef");
    paperGrad.addColorStop(1, "#f1eadc");
    ctx.fillStyle = paperGrad;
    ctx.fillRect(0, 0, W, H);
    paintPaperGrain(ctx, W, H, (book.seed || 3) + 5, false);

    // Subtle outer border hairline
    ctx.strokeStyle = "rgba(42, 32, 22, 0.14)";
    ctx.lineWidth = Math.max(1.5, W * 0.0018);
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Recessed matte aperture
    ctx.save();
    if (transparent) {
      ctx.fillStyle = "#e9e0cf";
      ctx.fillRect(imgX, imgY, imgW, imgH);
    }
    ctx.beginPath();
    ctx.rect(imgX, imgY, imgW, imgH);
    ctx.clip();
    drawCoverPhoto(ctx, photoCanvas, imgX, imgY, imgW, imgH);
    // Classic Polaroid subtle inner lip shadow
    const topSh = ctx.createLinearGradient(0, imgY, 0, imgY + Math.round(W * 0.016));
    topSh.addColorStop(0, "rgba(24, 16, 10, 0.24)");
    topSh.addColorStop(1, "rgba(24, 16, 10, 0)");
    ctx.fillStyle = topSh;
    ctx.fillRect(imgX, imgY, imgW, Math.round(W * 0.016));
    ctx.restore();

    ctx.strokeStyle = "rgba(38, 28, 18, 0.22)";
    ctx.lineWidth = Math.max(1.2, W * 0.0014);
    ctx.strokeRect(imgX, imgY, imgW, imgH);

    // Chin metadata
    const chinTop = imgY + imgH;
    const chinMid = chinTop + footH * 0.44;
    ctx.save();
    if (showTitle) {
      const maxTW = imgW - (showMark ? Math.round(W * 0.12) : 0);
      const tSize = fitFont(ctx, titleText, SERIF, 500, true, Math.round(W * 0.052), Math.round(W * 0.028), maxTW);
      ctx.fillStyle = "#221b15";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(truncateText(ctx, titleText, maxTW), imgX, chinMid);
      if (authorText) {
        ctx.font = `400 ${Math.round(W * 0.0185)}px ${SANS}`;
        ctx.fillStyle = "#6e6154";
        ctx.fillText(truncateText(ctx, authorText, maxTW), imgX, chinMid + Math.round(tSize * 0.56));
      }
    }
    if (cleanCaption) {
      ctx.font = `italic 400 ${Math.round(W * 0.024)}px ${SERIF}`;
      ctx.fillStyle = "#52463a";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const cy = showTitle ? chinTop + footH * 0.72 : chinMid;
      ctx.fillText(`\u201c${truncateText(ctx, cleanCaption, imgW - Math.round(W * 0.12))}\u201d`, imgX, cy);
    }
    // Bottom chin ledger: swatches + specs + date + embossed seal
    const footLineY = H - Math.round(W * 0.036);
    let leftCursor = imgX;
    if (showSwatches) {
      const r = Math.round(W * 0.01);
      swatches.forEach((sw, idx) => {
        drawSwatchChip(ctx, leftCursor + r + idx * (r * 2.55), footLineY - r * 0.4, r, sw, "rgba(38,28,18,0.28)");
      });
      leftCursor += swatches.length * (r * 2.55) + Math.round(W * 0.022);
    }
    if (showSpecs || showDate) {
      ctx.font = `500 ${Math.round(W * 0.0135)}px ${SANS}`;
      ctx.fillStyle = "#7a6d5e";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const info = [showSpecs ? specs.covering : "", showDate ? dateLine : ""].filter(Boolean).join("  \u00b7  ");
      ctx.fillText(truncateText(ctx, info, W - pad - leftCursor - (showMark ? Math.round(W * 0.09) : 0)), leftCursor, footLineY);
    }
    if (showMark) {
      drawAtelierSeal(ctx, W - pad - Math.round(W * 0.036), chinTop + footH * 0.56, Math.round(W * 0.034), "rgba(62, 50, 38, 0.42)");
    }
    ctx.restore();
    return canvas;
  }

  /* ---------- 1. Specimen Card (Archival Collector Default) ---------- */
  const cardBg = ctx.createLinearGradient(0, 0, 0, H);
  cardBg.addColorStop(0, "#f6f0e5");
  cardBg.addColorStop(1, "#ede4d4");
  ctx.fillStyle = cardBg;
  ctx.fillRect(0, 0, W, H);
  paintPaperGrain(ctx, W, H, book.seed || 11, false);

  // Double archival hairline frame
  const outerFrame = Math.round(W * 0.026);
  const innerFrame = Math.round(W * 0.034);
  ctx.save();
  ctx.strokeStyle = "rgba(42, 33, 24, 0.24)";
  ctx.lineWidth = Math.max(1.4, W * 0.0014);
  ctx.strokeRect(outerFrame, outerFrame, W - outerFrame * 2, H - outerFrame * 2);
  ctx.strokeStyle = "rgba(42, 33, 24, 0.1)";
  ctx.lineWidth = Math.max(1, W * 0.0009);
  ctx.strokeRect(innerFrame, innerFrame, W - innerFrame * 2, H - innerFrame * 2);
  ctx.restore();

  // Top specimen header
  if (showMark || showDate) {
    ctx.save();
    const hy = pad + headH * 0.42;
    ctx.font = `600 ${Math.round(W * 0.0142)}px ${SANS}`;
    ctx.textBaseline = "middle";
    if (showMark) {
      ctx.fillStyle = "#2b231b";
      ctx.textAlign = "left";
      ctx.fillText(
        lang === "zh" ? `FOLIO ATELIER  \u00b7  \u85cf\u4e66\u56fe\u9274` : "FOLIO ATELIER  \u00b7  ARCHIVE SPECIMEN",
        imgX, hy
      );
    }
    if (showDate || showMark) {
      ctx.fillStyle = "#76695a";
      ctx.textAlign = "right";
      ctx.fillText([showMark ? serial : "", showDate ? dateLine : ""].filter(Boolean).join("   "), imgX + imgW, hy);
    }
    ctx.restore();
  }

  // Photograph aperture with soft museum mat shadow
  ctx.save();
  ctx.shadowColor = "rgba(32, 22, 12, 0.14)";
  ctx.shadowBlur = Math.round(W * 0.022);
  ctx.shadowOffsetY = Math.round(W * 0.006);
  ctx.fillStyle = transparent ? "#e8dfd0" : "#dfd5c4";
  ctx.fillRect(imgX, imgY, imgW, imgH);
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.rect(imgX, imgY, imgW, imgH);
  ctx.clip();
  drawCoverPhoto(ctx, photoCanvas, imgX, imgY, imgW, imgH);
  ctx.restore();

  ctx.strokeStyle = "rgba(42, 33, 24, 0.22)";
  ctx.lineWidth = Math.max(1.1, W * 0.0012);
  ctx.strokeRect(imgX, imgY, imgW, imgH);

  // Bottom archival plaque
  let cursorY = imgY + imgH + Math.round(W * 0.044);
  const rightColW = (showSwatches || showMark) ? Math.round(imgW * 0.34) : 0;
  const leftColW = imgW - rightColW - (rightColW ? Math.round(W * 0.03) : 0);

  if (showTitle || cleanCaption || showSwatches || showMark) {
    ctx.save();
    let leftY = cursorY;
    if (showTitle) {
      const tSize = fitFont(ctx, titleText, SERIF, 500, false, Math.round(W * 0.052), Math.round(W * 0.024), leftColW);
      ctx.fillStyle = "#1e1711";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(truncateText(ctx, titleText, leftColW), imgX, leftY + tSize * 0.78);
      leftY += Math.max(tSize * 1.18, Math.round(W * 0.036));
      const subLine = [authorText, book.subtitle].filter(Boolean).join("  \u2014  ");
      if (subLine) {
        const subSize = Math.round(W * 0.0225);
        ctx.font = `italic 400 ${subSize}px ${SERIF}`;
        ctx.fillStyle = "#625548";
        ctx.fillText(truncateText(ctx, subLine, leftColW), imgX, leftY + Math.round(subSize * 0.78));
        leftY += Math.round(subSize * 1.45);
      }
    }
    if (cleanCaption) {
      ctx.font = `italic 400 ${Math.round(W * 0.021)}px ${SERIF}`;
      ctx.fillStyle = "#77593e";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`\u201c${truncateText(ctx, cleanCaption, leftColW)}\u201d`, imgX, leftY + Math.round(W * 0.022));
      leftY += Math.round(W * 0.036);
    }

    // Right column: authentic material palette chips + Atelier colophon seal
    let rightY = cursorY + Math.round(W * 0.018);
    if (showSwatches) {
      const r = Math.round(W * 0.0145);
      swatches.forEach((sw, idx) => {
        const sx = imgX + imgW - r - (swatches.length - 1 - idx) * (r * 2.55);
        drawSwatchChip(ctx, sx, rightY, r, sw, "rgba(38, 28, 18, 0.3)");
      });
      rightY += r * 2.8;
    }
    if (showMark) {
      const sealR = Math.round(W * 0.027);
      if (hasMotif(book.front?.motif?.key)) {
        drawMotif(ctx, book.front.motif.key, {
          cx: imgX + imgW - sealR * 3.9, cy: rightY + sealR * 0.65,
          size: sealR * 1.12, color: "rgba(72, 58, 44, 0.5)", alpha: 1, lineWidth: 1.6, text: book.title || ""
        });
      }
      drawAtelierSeal(ctx, imgX + imgW - sealR, rightY + sealR * 0.65, sealR, "rgba(56, 44, 32, 0.58)");
      rightY += sealR * 1.75;
    }
    cursorY = Math.max(leftY, rightY) + Math.round(W * 0.022);
    ctx.restore();
  }

  // Structured 3-column archival craft specs ledger
  if (showSpecs) {
    ctx.save();
    ctx.strokeStyle = "rgba(42, 33, 24, 0.18)";
    ctx.lineWidth = Math.max(1, W * 0.0012);
    ctx.beginPath();
    ctx.moveTo(imgX, cursorY);
    ctx.lineTo(imgX + imgW, cursorY);
    ctx.stroke();

    const cols = [
      { head: lang === "zh" ? "\u9762\u6599\u4e0e\u88c5\u8ba2" : "COVERING", value: specs.covering },
      { head: lang === "zh" ? "\u70eb\u7b94\u4e0e\u4e66\u53e3" : "FOIL & EDGE", value: specs.foilEdge },
      { head: lang === "zh" ? "\u5f00\u672c\u4e0e\u5185\u9875" : "EDITION", value: specs.edition }
    ];
    const colW = imgW / cols.length;
    const headY = cursorY + Math.round(W * 0.026);
    const valY = headY + Math.round(W * 0.025);
    cols.forEach((col, i) => {
      const x = imgX + i * colW;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `600 ${Math.round(W * 0.0115)}px ${SANS}`;
      ctx.fillStyle = "#847566";
      ctx.fillText(col.head, x, headY);
      ctx.font = `500 ${Math.round(W * 0.0155)}px ${SANS}`;
      ctx.fillStyle = "#2b231b";
      ctx.fillText(truncateText(ctx, col.value, colW - Math.round(W * 0.018)), x, valY);
    });
    ctx.restore();
  }

  return canvas;
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function copyCardToClipboard(canvas) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  const blob = await canvasToPngBlob(canvas);
  if (!blob) return false;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  return true;
}

export async function shareCardNative(canvas, filename, title) {
  const blob = await canvasToPngBlob(canvas);
  if (!blob) return "unsupported";
  const file = new File([blob], filename, { type: "image/png" });
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) return "unsupported";
  try {
    await navigator.share({ files: [file], title: title || "Folio Atelier" });
    return "shared";
  } catch (error) {
    if (error?.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}
