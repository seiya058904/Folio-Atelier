// Flat previews for the interface: real covers painted by the same code that
// paints the 3D boards, plus small ornament glyphs.

import { CLASP_METALS } from "../state/schema.js";
import { faceSignatures, paintFront, setFastGrain } from "../textures/faces.js";
import { drawMotif, hasMotif } from "../textures/motifs.js";
import { hexToRgb, mixHex } from "../util.js";

const target = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext("2d"), commit() {} };
};

let scratchBase = null;
let scratchFoil = null;

function drawThumbCraftAccents(ctx, book, width, height) {
  const structure = book.structure || {};
  const edge = book.details?.edge;

  // Subtle gilded / stained / botanical fore-edge glint along the outer edge.
  if (edge && edge.style && edge.style !== "plain") {
    const sliver = Math.max(2, Math.round(width * 0.022));
    ctx.save();
    if (edge.style === "gilt" || edge.style === "gauffered" || edge.style === "gilt_crimson") {
      const grad = ctx.createLinearGradient(width - sliver, 0, width, height);
      const base = edge.style === "gilt_crimson" ? "#c2553a" : (edge.color || "#d9b25f");
      grad.addColorStop(0, mixHex(base, "#fff4d2", 0.45));
      grad.addColorStop(0.5, edge.color || "#d9b25f");
      grad.addColorStop(1, mixHex(base, "#5a3c12", 0.35));
      ctx.fillStyle = grad;
    } else if (edge.style === "botanical") {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "#d7d0b8");
      grad.addColorStop(0.35, edge.color || "#3d5e43");
      grad.addColorStop(0.7, "#8aa178");
      grad.addColorStop(1, "#dfd6bf");
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = edge.color || "#c6532f";
    }
    ctx.fillRect(width - sliver, 2, sliver, height - 4);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(width - sliver - 1, 2, 1, height - 4);
    ctx.restore();
  }

  // Miniature 3D-shaded wax seal impression.
  const seal = book.front?.seal;
  if (seal?.show) {
    const sx = (seal.x ?? 0.76) * width;
    const sy = (seal.y ?? 0.82) * height;
    const r = width * 0.072 * (seal.scale || 1);
    const wax = seal.color || "#7a1c17";
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.34)";
    ctx.shadowBlur = Math.max(2, r * 0.45);
    ctx.shadowOffsetY = Math.max(1, r * 0.18);
    // Organic wax puddle outer silhouette
    const outer = ctx.createRadialGradient(sx - r * 0.28, sy - r * 0.28, r * 0.1, sx, sy, r * 1.08);
    outer.addColorStop(0, mixHex(wax, "#ffffff", 0.24));
    outer.addColorStop(0.65, wax);
    outer.addColorStop(1, mixHex(wax, "#000000", 0.42));
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * 1.04, r * 0.96, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    // Recessed inner die rim
    ctx.strokeStyle = mixHex(wax, "#000000", 0.36);
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = mixHex(wax, "#ffffff", 0.24);
    ctx.lineWidth = Math.max(0.6, r * 0.06);
    ctx.beginPath();
    ctx.arc(sx - r * 0.04, sy - r * 0.04, r * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    // Crest motif or letter
    if (seal.motif && hasMotif(seal.motif)) {
      drawMotif(ctx, seal.motif, {
        cx: sx, cy: sy, size: r * 0.46, color: mixHex(wax, "#ffffff", 0.36),
        alpha: 0.9, lineWidth: Math.max(0.9, r * 0.09), text: book.title
      });
    } else {
      const ch = [...((seal.letter || book.title || "F").trim())][0]?.toUpperCase() || "F";
      ctx.fillStyle = mixHex(wax, "#ffffff", 0.34);
      ctx.font = `600 ${Math.max(7, r * 0.85)}px "Cormorant Garamond", "Noto Serif SC", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ch, sx, sy + r * 0.04);
    }
    ctx.restore();
  }

  // Elastic closure band near the fore-edge.
  if (structure.band?.show) {
    const bw = Math.max(4, Math.round(width * 0.056));
    const bx = Math.round(width * 0.855);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.34)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = -1;
    ctx.fillStyle = structure.band.color || "#221e1a";
    ctx.fillRect(bx, 0, bw, height);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(bx + 1, 0, 1, height);
    ctx.restore();
  }

  // Metallic clasp tongue(s) gripping the fore-edge.
  if (structure.clasp?.show) {
    const metalColor = (CLASP_METALS.find((m) => m.id === structure.clasp.metal) || CLASP_METALS[0]).color;
    const ys = structure.clasp.style === "twin" ? [height * 0.27, height * 0.73] : [height * 0.5];
    const cw = Math.max(7, width * 0.092);
    const ch = Math.max(5, height * 0.044);
    ctx.save();
    ys.forEach((cy) => {
      const x = width - cw;
      const y = cy - ch * 0.5;
      ctx.shadowColor = "rgba(0,0,0,0.38)";
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      const grad = ctx.createLinearGradient(x, y, x + cw, y + ch);
      grad.addColorStop(0, mixHex(metalColor, "#ffffff", 0.36));
      grad.addColorStop(0.55, metalColor);
      grad.addColorStop(1, mixHex(metalColor, "#000000", 0.35));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, cw + 1, ch, [ch * 0.45, 0, 0, ch * 0.45]);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = mixHex(metalColor, "#ffffff", 0.52);
      ctx.beginPath();
      ctx.arc(x + ch * 0.45, cy, Math.max(1.1, ch * 0.16), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Subtle collector slipcase cue: recessed upper-right corner badge rim.
  if (structure.slipcase?.show) {
    const rim = Math.max(3, Math.round(width * 0.026));
    const caseColor = structure.slipcase.color || "#221e1a";
    ctx.save();
    ctx.fillStyle = mixHex(caseColor, "#000000", 0.18);
    ctx.fillRect(0, 0, width, rim);
    ctx.fillRect(0, height - rim, width, rim);
    ctx.fillRect(width - rim, 0, rim, height);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(0, rim, width - rim, 1);
    ctx.fillRect(0, height - rim - 1, width - rim, 1);
    ctx.restore();
  }
}

/** Paint a book's front cover (cloth, print and foil) onto a canvas. */
export function drawCoverThumb(canvas, book, onAsset) {
  const width = canvas.width;
  const height = canvas.height;
  if (!scratchBase || scratchBase.canvas.width !== width) {
    scratchBase = target(width, height);
    scratchFoil = target(width, height);
  }
  setFastGrain(true);
  try {
    paintFront(book, scratchBase, scratchFoil, onAsset);
  } finally {
    setFastGrain(false);
  }

  // Tint the white foil mask with the foil colour and a diagonal sheen.
  const foil = scratchFoil.context;
  foil.setTransform(1, 0, 0, 1, 0, 0);
  // Elements in the second foil are magenta on the mask (see `leafInk`).
  const second = usesSecondLeaf(book) ? foil.getImageData(0, 0, width, height) : null;
  foil.globalCompositeOperation = "source-in";
  const metallic = book.foil.metalness > 0.5;
  const sheen = foil.createLinearGradient(0, 0, width, height);
  sheen.addColorStop(0, mixHex(book.foil.color, "#ffffff", metallic ? 0.34 : 0.04));
  sheen.addColorStop(0.45, book.foil.color);
  sheen.addColorStop(0.7, mixHex(book.foil.color, "#000000", metallic ? 0.2 : 0.02));
  sheen.addColorStop(1, mixHex(book.foil.color, "#ffffff", metallic ? 0.2 : 0.02));
  foil.fillStyle = sheen;
  foil.fillRect(0, 0, width, height);
  foil.globalCompositeOperation = "source-over";
  if (second) {
    const tinted = foil.getImageData(0, 0, width, height);
    const [r, g, b] = hexToRgb(book.foil.second);
    const mask = second.data;
    const out = tinted.data;
    for (let index = 0; index < out.length; index += 4) {
      if (!mask[index + 3]) continue;
      const amount = 1 - mask[index + 1] / Math.max(1, mask[index]);
      if (amount <= 0.02) continue;
      // Keep the sheen's light and shade, in the second colour.
      const shade = (out[index] + out[index + 1] + out[index + 2]) / Math.max(1, hexLightness(book.foil.color));
      out[index] += (Math.min(255, r * shade) - out[index]) * amount;
      out[index + 1] += (Math.min(255, g * shade) - out[index + 1]) * amount;
      out[index + 2] += (Math.min(255, b * shade) - out[index + 2]) * amount;
    }
    foil.putImageData(tinted, 0, 0);
  }

  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (book.structure?.corners === "rounded") {
    const rad = Math.max(4, Math.round(width * 0.085));
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, [1, rad, rad, 1]);
    ctx.clip();
  }
  ctx.drawImage(scratchBase.canvas, 0, 0);
  ctx.drawImage(scratchFoil.canvas, 0, 0);
  drawThumbCraftAccents(ctx, book, width, height);
  ctx.restore();
}

/** Everything `drawCoverThumb` shows, as a string: a key for caching it. */
export function coverThumbKey(book) {
  const signature = faceSignatures(book, "front");
  const st = book.structure || {};
  const seal = book.front?.seal;
  const edge = book.details?.edge;
  const craft = [
    st.corners || "square",
    st.band?.show ? st.band.color : "",
    st.clasp?.show ? `${st.clasp.metal}:${st.clasp.style}` : "",
    st.slipcase?.show ? st.slipcase.color : "",
    seal?.show ? `${seal.color}:${seal.motif}:${seal.letter}:${seal.scale}:${seal.x}:${seal.y}` : "",
    edge?.style && edge.style !== "plain" ? `${edge.style}:${edge.color}` : ""
  ].join(",");
  return [signature.base, signature.foil, book.foil.color, book.foil.second, book.foil.metalness, craft].join("|");
}

const hexLightness = (hex) => hexToRgb(hex).reduce((sum, value) => sum + value, 0);
const usesSecondLeaf = (book) => faceSignatures(book, "front").foil.includes('"leaf":"second"');

/** Draw an ornament glyph in `color`. */
export function drawMotifGlyph(canvas, key, color = "#231d17") {
  const size = canvas.width;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  if (key === "none") {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = size * 0.02;
    ctx.beginPath();
    ctx.moveTo(size * 0.3, size * 0.7);
    ctx.lineTo(size * 0.7, size * 0.3);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  drawMotif(ctx, key, {
    cx: size / 2,
    cy: size / 2,
    size: size * 0.31,
    color,
    alpha: 1,
    lineWidth: Math.max(1.2, size * 0.02),
    text: "A"
  });
}
