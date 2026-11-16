// Interior pages: pagination (text flows across as many pages as it needs)
// and the painters for each page template.
// Pages are authored on a logical 512 × 768 sheet.

import { fontString, getFont } from "../data/fonts.js";
import { getImage } from "../state/images.js";
import { bindingLabel } from "../state/schema.js";
import { hashSeed, mixHex, pad, rgba, seededRandom } from "../util.js";
import { drawMotif, hasMotif } from "./motifs.js";
import { drawPaperSurface } from "./surface.js";
import { breakText, drawLine, fitDisplayText, setTracking, tokenize } from "./text.js";

export const PAGE_SIZE = { width: 512, height: 768 };

const W = PAGE_SIZE.width;
const H = PAGE_SIZE.height;
const MARGIN = { top: 92, bottom: 88, inner: 62, outer: 50 };
const TEXT_WIDTH = W - MARGIN.inner - MARGIN.outer;
const TEXT_BOTTOM = H - MARGIN.bottom;

let measureContext = null;
const measure = () => {
  if (!measureContext) measureContext = document.createElement("canvas").getContext("2d");
  return measureContext;
};

const ROMAN = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
export function roman(number) {
  let value = Math.max(1, Math.floor(number));
  let result = "";
  ROMAN.forEach(([amount, glyph]) => {
    while (value >= amount) { result += glyph; value -= amount; }
  });
  return result;
}

function bodyMetrics(book) {
  const scale = book.interior.scale || 1;
  const size = 15.2 * scale;
  return { size, lineHeight: size * 1.5, indent: size * 1.25 };
}

// Slightly heavier than a printer would choose: screen minification thins strokes.
const bodyFont = (book, size, extra = {}) => fontString({ font: book.interior.bodyFont, weight: 500, ...extra }, size);
const headFont = (book, size, extra = {}) => fontString({ font: book.interior.headingFont, weight: 600, ...extra }, size);
const SMALL = (size, weight = 500) => `${weight} ${size}px "Inter", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif`;

/* ---------- flowing text ---------- */

/**
 * Break running text into lines. Paragraphs after the first are indented and
 * an optional drop cap narrows the opening lines.
 */
function flowText(ctx, text, { width, indent, dropLines = 0, dropWidth = 0 }) {
  const paragraphs = String(text || "").split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const spaceWidth = ctx.measureText(" ").width;
  const lines = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const tokens = tokenize(paragraph);
    let current = [];
    let lineWidth = 0;
    let lineInParagraph = 0;
    const available = () => {
      const dropped = paragraphIndex === 0 && lineInParagraph < dropLines ? dropWidth : 0;
      const indented = paragraphIndex > 0 && lineInParagraph === 0 ? indent : 0;
      return { max: width - dropped - indented, offset: dropped + indented };
    };
    const push = (last) => {
      const { max, offset } = available();
      lines.push({ tokens: current, width: lineWidth, last, max, offset });
      current = [];
      lineWidth = 0;
      lineInParagraph += 1;
    };
    tokens.forEach((token) => {
      const tokenWidth = ctx.measureText(token.text).width;
      const gap = current.length && token.space ? spaceWidth : 0;
      if (current.length && lineWidth + gap + tokenWidth > available().max) push(false);
      const lead = current.length && token.space ? spaceWidth : 0;
      current.push({ ...token, width: tokenWidth, lead });
      lineWidth += lead + tokenWidth;
    });
    push(true);
  });
  return lines;
}

function splitDropCap(text) {
  const trimmed = String(text || "").trimStart();
  const match = trimmed.match(/^(["“‘'«(]?)(\p{L}|\p{N})/u);
  if (!match) return { cap: "", rest: trimmed };
  return { cap: match[0], rest: trimmed.slice(match[0].length) };
}

/* ---------- pagination ---------- */

/**
 * Expand the author's page list into the physical pages of the book.
 * Text-bearing templates spill onto continuation pages automatically.
 * Call after the interior fonts are loaded so measurements are true.
 */
export function paginate(book) {
  const ctx = measure();
  const metrics = bodyMetrics(book);
  const flat = [];
  const chapters = [];
  let chapterNumber = 0;

  const flow = (text, firstTop, options) => {
    ctx.font = bodyFont(book, metrics.size);
    ctx.letterSpacing = "0px";
    const lines = flowText(ctx, text, { width: TEXT_WIDTH, indent: metrics.indent, ...options });
    const chunks = [];
    let top = firstTop;
    let index = 0;
    while (index < lines.length) {
      const capacity = Math.max(1, Math.floor((TEXT_BOTTOM - top) / metrics.lineHeight) + 1);
      chunks.push(lines.slice(index, index + capacity));
      index += capacity;
      top = MARGIN.top + 22;
    }
    return chunks;
  };

  book.pages.forEach((page) => {
    if (page.type === "chapter") {
      chapterNumber += 1;
      const useCap = book.interior.dropCap && page.text?.trim();
      const { cap, rest } = useCap ? splitDropCap(page.text) : { cap: "", rest: page.text || "" };
      let dropWidth = 0;
      if (cap) {
        ctx.font = headFont(book, metrics.lineHeight * 2.86);
        dropWidth = ctx.measureText(cap).width + 7;
      }
      // Height of the chapter heading decides where the text can start.
      ctx.font = headFont(book, 38);
      const titleLines = fitDisplayText(ctx, page.title || "Untitled", {
        size: 38, maxWidth: TEXT_WIDTH, maxLines: 3, minScale: 0.6,
        setFont: (size) => { ctx.font = headFont(book, size); }
      });
      const textTop = 232 + titleLines.lines.length * titleLines.size * 1.1 + 62;
      const chunks = flow(rest, textTop, cap ? { dropLines: 3, dropWidth } : {});
      chapters.push({ number: chapterNumber, title: page.title || "Untitled", page: flat.length + 1 });
      flat.push({
        type: "chapter", source: page.id, number: chapterNumber, title: page.title || "Untitled",
        cap, dropWidth, textTop, lines: chunks[0] || [],
        label: `Chapter ${chapterNumber} · ${page.title || "Untitled"}`
      });
      chunks.slice(1).forEach((lines) => {
        flat.push({ type: "text", source: page.id, running: page.title || "", lines, label: page.title || "Text" });
      });
    } else if (page.type === "body") {
      const hasHeading = Boolean(page.heading?.trim());
      const firstTop = MARGIN.top + 22 + (hasHeading ? 62 : 0);
      const chunks = flow(page.text || "", firstTop, {});
      (chunks.length ? chunks : [[]]).forEach((lines, index) => {
        flat.push({
          type: "text", source: page.id, running: page.heading || "",
          heading: index === 0 && hasHeading ? page.heading.trim() : "",
          lines, label: page.heading?.trim() || "Text"
        });
      });
    } else if (page.type === "contents") {
      flat.push({ type: "contents", source: page.id, heading: page.heading || "Contents", label: "Contents", chapters });
    } else {
      const labels = {
        halftitle: "Half-title", title: "Title page", dedication: "Dedication",
        quote: "Quotation", plate: "Plate", colophon: "Colophon", blank: "Blank"
      };
      flat.push({ type: page.type, source: page.id, page, label: labels[page.type] || "Page" });
    }
  });

  flat.forEach((entry, index) => { entry.number = entry.type === "chapter" ? entry.number : entry.number; entry.folio = index + 1; });
  return flat;
}

/** Runs of text + fonts used inside the book, for preloading. */
export function pageFontRuns(book) {
  const body = [];
  const head = [book.title, book.subtitle, book.author];
  book.pages.forEach((page) => {
    if (page.title) head.push(page.title);
    if (page.heading) head.push(page.heading);
    ["text", "caption", "attribution", "imprint"].forEach((field) => { if (page[field]) body.push(page[field]); });
  });
  const sample = (parts) => parts.filter(Boolean).join(" ").slice(0, 380) || "A";
  const bodyFace = getFont(book.interior.bodyFont);
  return [
    { font: book.interior.bodyFont, weight: 500, text: sample(body) },
    { font: book.interior.bodyFont, weight: 500, italic: bodyFace.italic, text: sample(body) },
    { font: book.interior.headingFont, weight: 600, text: sample(head) },
    { font: book.interior.headingFont, weight: 600, italic: true, text: sample(head) },
    { font: book.interior.headingFont, weight: 400, italic: true, text: sample(head) },
    { font: "inter", weight: 500, text: sample([book.title, ...head]).toUpperCase() }
  ];
}

/* ---------- painters ---------- */

function inks(book) {
  const accent = mixHex(book.material.color, "#211b16", 0.5);
  return { text: "#1b1612", soft: "rgba(27,22,18,0.66)", accent, rule: rgba(accent, 0.55) };
}

function centered(ctx, text, y, maxWidth, { font, size, lineHeight = 1.25, maxLines = 6, minScale = 0.6, tracking = 0 }) {
  const fitted = fitDisplayText(ctx, text, {
    size, maxWidth, maxLines, minScale,
    setFont: (value) => { ctx.font = font(value); setTracking(ctx, tracking, value); }
  });
  ctx.font = font(fitted.size);
  setTracking(ctx, tracking, fitted.size);
  const step = fitted.size * lineHeight;
  fitted.lines.forEach((line, index) => {
    drawLine(ctx, line, W / 2 + (tracking * fitted.size) / 2, y + index * step, { align: "center" });
  });
  ctx.letterSpacing = "0px";
  return y + fitted.lines.length * step;
}

function drawRunningText(ctx, book, entry, top, left, metrics, ink) {
  ctx.fillStyle = ink.text;
  ctx.font = bodyFont(book, metrics.size);
  ctx.letterSpacing = "0px";
  ctx.textBaseline = "alphabetic";
  entry.lines.forEach((line, index) => {
    drawLine(ctx, line, left + (line.offset || 0), top + index * metrics.lineHeight, {
      align: "left",
      maxWidth: line.max,
      justify: book.interior.justify
    });
  });
}

function drawFurniture(ctx, book, entry, recto, ink) {
  const left = recto ? MARGIN.inner : MARGIN.outer;
  const right = left + TEXT_WIDTH;
  if (book.interior.runningHead && entry.type === "text") {
    const label = (recto ? entry.running || book.title : book.title).toUpperCase();
    ctx.fillStyle = ink.soft;
    ctx.font = SMALL(8.6);
    setTracking(ctx, 0.2, 8.6);
    ctx.textAlign = recto ? "right" : "left";
    ctx.fillText(label.slice(0, 54), recto ? right - 1.7 : left, 62);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = ink.rule;
    ctx.fillRect(left, 72, TEXT_WIDTH, 0.7);
  }
  if (book.interior.folios && (entry.type === "text" || entry.type === "chapter" || entry.type === "contents" || entry.type === "quote")) {
    ctx.fillStyle = ink.soft;
    ctx.font = bodyFont(book, 12.5);
    ctx.textAlign = entry.type === "text" ? (recto ? "right" : "left") : "center";
    const x = entry.type === "text" ? (recto ? right : left) : left + TEXT_WIDTH / 2;
    ctx.fillText(String(entry.folio), x, H - 50);
  }
}

const PAINT = {
  blank() {},

  halftitle(ctx, book, entry, recto, ink) {
    ctx.fillStyle = ink.text;
    ctx.textBaseline = "alphabetic";
    centered(ctx, book.title, H * 0.36, TEXT_WIDTH * 0.86, {
      font: (size) => headFont(book, size), size: 27, maxLines: 3, lineHeight: 1.2
    });
  },

  title(ctx, book, entry, recto, ink) {
    ctx.textBaseline = "alphabetic";
    if (book.series) {
      ctx.fillStyle = ink.soft;
      centered(ctx, book.series.toUpperCase(), 118, TEXT_WIDTH, { font: (size) => SMALL(size), size: 9.5, tracking: 0.24, maxLines: 2 });
    }
    ctx.fillStyle = ink.text;
    let y = centered(ctx, book.title, 214, TEXT_WIDTH * 0.94, {
      font: (size) => headFont(book, size), size: 50, maxLines: 4, lineHeight: 1.08, minScale: 0.5
    });
    if (book.subtitle) {
      ctx.fillStyle = ink.soft;
      y = centered(ctx, book.subtitle, y + 16, TEXT_WIDTH * 0.84, {
        font: (size) => headFont(book, size, { italic: true, weight: 400 }), size: 20, maxLines: 3, lineHeight: 1.3
      });
    }
    ctx.fillStyle = ink.rule;
    ctx.fillRect(W / 2 - 22, y + 22, 44, 1);
    if (book.author) {
      ctx.fillStyle = ink.text;
      centered(ctx, book.author.toUpperCase(), y + 66, TEXT_WIDTH, { font: (size) => SMALL(size), size: 11.5, tracking: 0.22, maxLines: 2, lineHeight: 1.6 });
    }
    const motif = book.front.motif.key;
    if (hasMotif(motif)) {
      drawMotif(ctx, motif, { cx: W / 2, cy: H - 176, size: 30, color: ink.accent, alpha: 0.8, lineWidth: 1.1, text: book.title });
    }
    ctx.fillStyle = ink.soft;
    centered(ctx, (entry.page.imprint || "Folio Atelier").toUpperCase(), H - 96, TEXT_WIDTH, { font: (size) => SMALL(size), size: 8.8, tracking: 0.24, maxLines: 2, lineHeight: 1.7 });
  },

  dedication(ctx, book, entry, recto, ink) {
    ctx.fillStyle = ink.text;
    ctx.textBaseline = "alphabetic";
    centered(ctx, entry.page.text || "", H * 0.34, TEXT_WIDTH * 0.74, {
      font: (size) => bodyFont(book, size, { italic: true }), size: 18.5, lineHeight: 1.55, maxLines: 9, minScale: 0.75
    });
  },

  contents(ctx, book, entry, recto, ink) {
    const left = recto ? MARGIN.inner : MARGIN.outer;
    const right = left + TEXT_WIDTH;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ink.text;
    ctx.font = headFont(book, 32);
    ctx.textAlign = "left";
    ctx.fillText(entry.heading, left, 150);
    ctx.fillStyle = ink.rule;
    ctx.fillRect(left, 172, TEXT_WIDTH, 0.8);
    const rows = entry.chapters.slice(0, 15);
    const step = Math.min(34, (TEXT_BOTTOM - 214) / Math.max(rows.length, 1));
    rows.forEach((chapter, index) => {
      const y = 218 + index * step;
      ctx.fillStyle = ink.soft;
      ctx.font = SMALL(8.6);
      setTracking(ctx, 0.16, 8.6);
      ctx.textAlign = "left";
      ctx.fillText(roman(chapter.number), left, y - 1);
      ctx.letterSpacing = "0px";
      ctx.fillStyle = ink.text;
      ctx.font = bodyFont(book, 16);
      let title = chapter.title;
      while (title.length > 4 && ctx.measureText(title).width > TEXT_WIDTH - 96) title = `${title.slice(0, -2).trimEnd()}…`;
      ctx.fillText(title, left + 38, y);
      const titleEnd = left + 38 + ctx.measureText(title).width + 8;
      ctx.textAlign = "right";
      const number = String(chapter.page);
      ctx.fillText(number, right, y);
      const numberStart = right - ctx.measureText(number).width - 8;
      ctx.fillStyle = ink.rule;
      for (let x = titleEnd; x < numberStart; x += 5) ctx.fillRect(x, y - 1.6, 1, 1);
    });
    if (!rows.length) {
      ctx.fillStyle = ink.soft;
      ctx.font = bodyFont(book, 15, { italic: true });
      ctx.textAlign = "left";
      ctx.fillText("Chapters you add will be listed here.", left, 218);
    }
  },

  chapter(ctx, book, entry, recto, ink, metrics) {
    const left = recto ? MARGIN.inner : MARGIN.outer;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ink.accent;
    ctx.font = SMALL(9.4);
    setTracking(ctx, 0.26, 9.4);
    ctx.textAlign = "left";
    ctx.fillText(`CHAPTER ${roman(entry.number)}`, left, 170);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = ink.text;
    const fitted = fitDisplayText(ctx, entry.title, {
      size: 38, maxWidth: TEXT_WIDTH, maxLines: 3, minScale: 0.6,
      setFont: (size) => { ctx.font = headFont(book, size); }
    });
    ctx.font = headFont(book, fitted.size);
    fitted.lines.forEach((line, index) => {
      drawLine(ctx, line, left, 232 + index * fitted.size * 1.1, { align: "left" });
    });
    const ruleY = 232 + (fitted.lines.length - 1) * fitted.size * 1.1 + 26;
    ctx.fillStyle = ink.rule;
    ctx.fillRect(left, ruleY, 44, 1.2);
    if (entry.cap) {
      const capSize = metrics.lineHeight * 2.86;
      ctx.fillStyle = ink.accent;
      ctx.font = headFont(book, capSize);
      ctx.textAlign = "left";
      ctx.fillText(entry.cap, left - 1, entry.textTop + metrics.lineHeight * 2 + 1);
    }
    drawRunningText(ctx, book, entry, entry.textTop, left, metrics, ink);
  },

  text(ctx, book, entry, recto, ink, metrics) {
    const left = recto ? MARGIN.inner : MARGIN.outer;
    let top = MARGIN.top + 22;
    if (entry.heading) {
      ctx.fillStyle = ink.text;
      ctx.font = headFont(book, 25);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      let heading = entry.heading;
      while (heading.length > 4 && ctx.measureText(heading).width > TEXT_WIDTH) heading = `${heading.slice(0, -2).trimEnd()}…`;
      ctx.fillText(heading, left, top + 8);
      top += 62;
    }
    drawRunningText(ctx, book, entry, top, left, metrics, ink);
  },

  quote(ctx, book, entry, recto, ink) {
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ink.accent;
    ctx.font = headFont(book, 84);
    ctx.textAlign = "center";
    ctx.fillText("“", W / 2, 232);
    ctx.fillStyle = ink.text;
    const bottom = centered(ctx, entry.page.text || "", 286, TEXT_WIDTH * 0.9, {
      font: (size) => headFont(book, size, { italic: true, weight: 400 }), size: 27, lineHeight: 1.34, maxLines: 9, minScale: 0.55
    });
    if (entry.page.attribution) {
      ctx.fillStyle = ink.rule;
      ctx.fillRect(W / 2 - 16, bottom + 4, 32, 1);
      ctx.fillStyle = ink.soft;
      centered(ctx, entry.page.attribution.toUpperCase(), bottom + 36, TEXT_WIDTH, { font: (size) => SMALL(size), size: 9.4, tracking: 0.22, maxLines: 2, lineHeight: 1.6 });
    }
  },

  plate(ctx, book, entry, recto, ink, metrics, onAsset) {
    const left = recto ? MARGIN.inner : MARGIN.outer;
    const frame = { x: left, y: 96, w: TEXT_WIDTH, h: 470 };
    const image = entry.page.image ? getImage(entry.page.image, onAsset) : null;
    if (image) {
      const scale = Math.min(frame.w / image.naturalWidth, frame.h / image.naturalHeight);
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      ctx.drawImage(image, frame.x + (frame.w - w) / 2, frame.y + (frame.h - h) / 2, w, h);
    } else {
      ctx.strokeStyle = ink.rule;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
      const motif = hasMotif(entry.page.motif) ? entry.page.motif : hasMotif(book.front.motif.key) ? book.front.motif.key : "sun";
      drawMotif(ctx, motif, { cx: W / 2 + (recto ? 6 : -6), cy: frame.y + frame.h / 2, size: 118, color: ink.accent, alpha: 0.82, lineWidth: 1.5, text: book.title });
    }
    if (entry.page.caption) {
      ctx.fillStyle = ink.soft;
      ctx.textBaseline = "alphabetic";
      centered(ctx, entry.page.caption, 606, TEXT_WIDTH * 0.9, {
        font: (size) => bodyFont(book, size, { italic: true }), size: 13.5, lineHeight: 1.45, maxLines: 4
      });
    }
  },

  colophon(ctx, book, entry, recto, ink) {
    const left = recto ? MARGIN.inner : MARGIN.outer;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ink.accent;
    ctx.font = SMALL(9.4);
    setTracking(ctx, 0.26, 9.4);
    ctx.textAlign = "left";
    ctx.fillText("COLOPHON", left, 388);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = ink.rule;
    ctx.fillRect(left, 402, 44, 1);
    const custom = (entry.page.text || "").trim();
    const text = custom || `${book.title}${book.author ? ` by ${book.author}` : ""} was set in ${getFont(book.interior.bodyFont).label.split(" · ")[0]} with headings in ${getFont(book.interior.headingFont).label.split(" · ")[0]}, and bound in ${bindingLabel(book).toLowerCase().replace(" · ", " with ")}.\n\nDesigned and made by hand in Folio Atelier.`;
    ctx.fillStyle = ink.text;
    ctx.font = bodyFont(book, 13.6);
    const lines = breakText(ctx, text, TEXT_WIDTH * 0.82);
    lines.slice(0, 13).forEach((line, index) => {
      drawLine(ctx, line, left, 440 + index * 21, { align: "left" });
    });
    const motif = book.front.motif.key;
    if (hasMotif(motif)) {
      drawMotif(ctx, motif, { cx: left + 24, cy: 300, size: 24, color: ink.accent, alpha: 0.8, lineWidth: 1, text: book.title });
    }
  }
};

/**
 * Paint one physical page onto a paint target.
 * `index` is the 0-based page position; even positions are right-hand pages.
 */
export function paintPage(book, entry, index, target, onAsset) {
  const { context: ctx, canvas } = target;
  const recto = index % 2 === 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.letterSpacing = "0px";
  drawPaperSurface(ctx, W, H, seededRandom(hashSeed(`${book.id}-leaf-${index}`)), book.interior.paper);

  // Gutter shadow: the sheet curls away into the binding.
  const gutter = ctx.createLinearGradient(recto ? 0 : W, 0, recto ? 70 : W - 70, 0);
  gutter.addColorStop(0, "rgba(40,30,20,0.2)");
  gutter.addColorStop(0.4, "rgba(40,30,20,0.05)");
  gutter.addColorStop(1, "rgba(40,30,20,0)");
  ctx.fillStyle = gutter;
  ctx.fillRect(0, 0, W, H);

  if (entry) {
    const ink = inks(book);
    const metrics = bodyMetrics(book);
    ctx.save();
    (PAINT[entry.type] || PAINT.blank)(ctx, book, entry, recto, ink, metrics, onAsset);
    ctx.restore();
    ctx.save();
    ctx.textBaseline = "alphabetic";
    drawFurniture(ctx, book, entry, recto, ink);
    ctx.restore();
  }
  target.commit();
}

export const pageLabel = (entry, index) => (entry ? entry.label : `Page ${pad(index + 1)}`);
