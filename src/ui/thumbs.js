// Flat previews for the interface: real covers painted by the same code that
// paints the 3D boards, plus small ornament glyphs.

import { paintFront } from "../textures/faces.js";
import { drawMotif } from "../textures/motifs.js";
import { mixHex } from "../util.js";

const target = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext("2d"), commit() {} };
};

let scratchBase = null;
let scratchFoil = null;

/** Paint a book's front cover (cloth, print and foil) onto a canvas. */
export function drawCoverThumb(canvas, book, onAsset) {
  const width = canvas.width;
  const height = canvas.height;
  if (!scratchBase || scratchBase.canvas.width !== width) {
    scratchBase = target(width, height);
    scratchFoil = target(width, height);
  }
  paintFront(book, scratchBase, scratchFoil, onAsset);

  // Tint the white foil mask with the foil colour and a diagonal sheen.
  const foil = scratchFoil.context;
  foil.setTransform(1, 0, 0, 1, 0, 0);
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

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(scratchBase.canvas, 0, 0);
  ctx.drawImage(scratchFoil.canvas, 0, 0);
}

/** Draw an ornament glyph in the current text colour of `canvas`. */
export function drawMotifGlyph(canvas, key) {
  const size = canvas.width;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const color = getComputedStyle(canvas).color || "#231d17";
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
