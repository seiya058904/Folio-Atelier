// Interior pages: pagination (text flows across as many pages as it needs)
// and the painters for each page template.
// Pages are authored on a logical 512 × 768 sheet.

import { fontString, getFont } from "../data/fonts.js";
import { t } from "../i18n.js";
import { getImage } from "../state/images.js";
import { FOILS, MATERIALS } from "../data/presets.js";

// The book's own colophon is printed in the book's language, not the interface's.
const ZH_MATERIAL = {
  cloth: "\u4e66\u5e03", buckram: "\u7c97\u5e06\u5e03", linen: "\u4e9a\u9ebb", canvas: "\u753b\u5e03", denim: "\u725b\u4ed4\u5e03",
  silk: "\u4e1d\u7ef8", velvet: "\u4e1d\u7ed2", leather: "\u76ae\u9769", suede: "\u9e82\u76ae", snakeskin: "\u86c7\u7eb9\u76ae",
  vellum: "\u7f8a\u76ae\u7eb8", paper: "\u7eb8\u9762", cork: "\u8f6f\u6728", wood: "\u6728\u7eb9", acrylic: "\u4e9a\u514b\u529b",
  washi: "\u548c\u7eb8", lacquer: "\u5927\u6f06", tweed: "\u7c97\u82b1\u5462"
};
const ZH_FOIL = {
  gold: "\u91d1\u7b94", antique: "\u53e4\u91d1\u7b94", champagne: "\u9999\u69df\u91d1\u7b94", copper: "\u94dc\u7b94", bronze: "\u9752\u94dc\u7b94",
  rose: "\u73ab\u7470\u91d1\u7b94", silver: "\u94f6\u7b94", aluminum: "\u94dd\u7b94", platinum: "\u94c2\u91d1\u7b94", gunmetal: "\u67aa\u7070\u7b94",
  emerald: "\u7fe1\u7fe0\u7b94", verdigris: "\u94dc\u7eff\u7b94", sapphire: "\u84dd\u5b9d\u77f3\u7b94", ruby: "\u7ea2\u5b9d\u77f3\u7b94",
  holo: "\u5e7b\u5f69\u7b94", aurora: "\u6781\u5149\u7b94", pearl: "\u73cd\u73e0\u7b94", white: "\u767d\u8272\u989c\u6599", black: "\u4eae\u9ed1"
};
import { hashSeed, mixHex, pad, rgba, seededRandom } from "../util.js";
import { drawMotif, hasMotif } from "./motifs.js";
import { paintContext } from "./gl.js";
import { PAPER_STOCKS, drawPaperSurface } from "./surface.js";
import { breakText, drawLine, fitDisplayText, setTracking, tokenize } from "./text.js";

export const PAGE_SIZE = { width: 512, height: 768 };

const W = PAGE_SIZE.width;
const H = PAGE_SIZE.height;
const MARGIN = { top: 92, bottom: 88, inner: 62, outer: 50 };
const TEXT_WIDTH = W - MARGIN.inner - MARGIN.outer;
const TEXT_BOTTOM = H - MARGIN.bottom;
const CONTENTS_ROWS = 15;

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

const CN_DIGITS = "\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d";
export function chineseNumber(number) {
  const value = Math.max(1, Math.floor(number));
  if (value < 10) return CN_DIGITS[value];
  if (value < 20) return `\u5341${value % 10 ? CN_DIGITS[value % 10] : ""}`;
  if (value < 100) return `${CN_DIGITS[Math.floor(value / 10)]}\u5341${value % 10 ? CN_DIGITS[value % 10] : ""}`;
  return String(value);
}

/** Words the book itself prints, in the language chosen for this book. */
function printed(book) {
  const zh = book.interior.labels === "zh";
  return zh
    ? {
      zh,
      chapter: (number) => `\u7b2c${chineseNumber(number)}\u7ae0`,
      part: (number) => `\u7b2c${chineseNumber(number)}\u90e8`,
      numeral: chineseNumber,
      colophon: "\u7248\u672c\u8bb0",
      contents: "\u76ee\u5f55",
      untitled: "\u672a\u547d\u540d",
      emptyContents: "\u6dfb\u52a0\u7ae0\u8282\u540e\uff0c\u4f1a\u5217\u5728\u8fd9\u91cc\u3002"
    }
    : {
      zh,
      chapter: (number) => `CHAPTER ${roman(number)}`,
      part: (number) => `PART ${roman(number)}`,
      numeral: roman,
      colophon: "COLOPHON",
      contents: "Contents",
      untitled: "Untitled",
      emptyContents: "Chapters you add will be listed here."
    };
}

function bodyMetrics(book) {
  const scale = book.interior.scale || 1;
  const size = 15.2 * scale;
  const zh = book.interior.labels === "zh";
  return { size, lineHeight: size * (book.interior.leading || 1.5), indent: size * (zh ? 2 : 1.25), indentFirst: zh };
}

// Slightly heavier than a printer would choose: screen minification thins strokes.
const bodyFont = (book, size, extra = {}) => fontString({ font: book.interior.bodyFont, weight: 500, ...extra }, size);
const headFont = (book, size, extra = {}) => fontString({ font: book.interior.headingFont, weight: 600, ...extra }, size);
const SMALL = (size, weight = 500) => `${weight} ${size}px "Inter", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif`;

/* ---------- measurement ---------- */

// Measuring text is the slow part of pagination, and while someone types
// almost every word is one that was measured a moment ago.
const widthTables = new Map(); // font shorthand -> Map(text -> width)
const flowCache = new Map(); // flow key -> page-sized chunks of lines
const longFlows = new Map(); // source -> latest layout, for edits within a manuscript
const FLOW_CACHE_LIMIT = 240;
const LONG_FLOW_THRESHOLD = 16000;
const LONG_FLOW_BUDGET = 600000;
let longFlowLength = 0;

function widthTable(font) {
  let table = widthTables.get(font);
  if (!table) {
    if (widthTables.size > 24) widthTables.clear();
    table = new Map();
    widthTables.set(font, table);
  }
  return table;
}

function measured(ctx, table, text) {
  let width = table.get(text);
  if (width === undefined) {
    if (table.size > 40000) table.clear();
    width = ctx.measureText(text).width;
    table.set(text, width);
  }
  return width;
}

/** Call when new fonts have loaded: every cached width may be wrong. */
export function forgetMeasurements() {
  widthTables.clear();
  flowCache.clear();
  longFlows.clear();
  longFlowLength = 0;
}

/* ---------- flowing text ---------- */

/**
 * Break running text into lines. Paragraphs after the first are indented and
 * an optional drop cap narrows the opening lines.
 */
function flowText(ctx, text, options, previous = null, paragraphsOut = null) {
  const { width, indent, dropLines = 0, dropWidth = 0, indentFirst = false, verse = false } = options;
  const raw = String(text || "");
  const paragraphs = verse
    ? raw.replace(/\s+$/, "").split("\n")
    : raw.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const table = widthTable(ctx.font);
  const spaceWidth = measured(ctx, table, " ");
  const lines = [];
  let afterBreak = false;
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (verse && !paragraph.trim()) {
      lines.push({ tokens: [], width: 0, last: true, max: width, offset: 0 });
      return;
    }
    // A line of asterisks or dashes is a section break, set as an ornament.
    if (!verse && /^(\*\s*){3,}$|^[-\u2013\u2014]{3,}$/.test(paragraph)) {
      lines.push({ tokens: [], ornament: true, width: 0, last: true, max: width, offset: 0 });
      afterBreak = true;
      return;
    }
    const flush = afterBreak;
    afterBreak = false;
    const cached = previous?.[paragraphIndex];
    if (cached?.text === paragraph && cached.flush === flush) {
      paragraphsOut[paragraphIndex] = cached;
      for (const line of cached.lines) lines.push(line);
      return;
    }
    const start = lines.length;
    const tokens = tokenize(verse ? paragraph.trim() : paragraph);
    let current = [];
    let lineWidth = 0;
    let lineInParagraph = 0;
    const available = () => {
      const dropped = paragraphIndex === 0 && lineInParagraph < dropLines ? dropWidth : 0;
      let indented = 0;
      if (verse) indented = lineInParagraph > 0 ? indent : 0;
      else if (lineInParagraph === 0 && !flush && !dropped && (paragraphIndex > 0 || indentFirst)) indented = indent;
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
      const tokenWidth = measured(ctx, table, token.text);
      const gap = current.length && token.space ? spaceWidth : 0;
      if (current.length && lineWidth + gap + tokenWidth > available().max) push(false);
      const lead = current.length && token.space ? spaceWidth : 0;
      current.push({ ...token, width: tokenWidth, lead });
      lineWidth += lead + tokenWidth;
    });
    push(true);
    if (paragraphsOut) paragraphsOut[paragraphIndex] = { text: paragraph, flush, lines: lines.slice(start) };
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
  let flat = [];
  const chapters = [];
  const words = printed(book);
  let chapterNumber = 0;
  let partNumber = 0;
  let hasContents = false;

  const flow = (source, text, firstTop, options) => {
    const font = bodyFont(book, metrics.size);
    const style = [font, metrics.lineHeight, metrics.indent, metrics.indentFirst, firstTop, JSON.stringify(options)].join("|");
    const long = text.length >= LONG_FLOW_THRESHOLD;
    const key = long ? JSON.stringify([book.id, source]) : `${style}|${text}`;
    const previous = long ? longFlows.get(key) : null;
    const cached = long
      ? (previous?.style === style && previous.text === text ? previous.chunks : null)
      : flowCache.get(key);
    if (cached) {
      const cache = long ? longFlows : flowCache;
      cache.delete(key);
      cache.set(key, long ? previous : cached);
      return cached;
    }
    ctx.font = font;
    ctx.letterSpacing = "0px";
    const paragraphs = long ? [] : null;
    const lines = flowText(ctx, text, {
      width: TEXT_WIDTH, indent: metrics.indent, indentFirst: metrics.indentFirst, ...options
    }, previous?.style === style ? previous.paragraphs : null, paragraphs);
    const chunks = [];
    let top = firstTop;
    let index = 0;
    while (index < lines.length) {
      const capacity = Math.max(1, Math.floor((TEXT_BOTTOM - top) / metrics.lineHeight) + 1);
      chunks.push(lines.slice(index, index + capacity));
      index += capacity;
      top = MARGIN.top + 22;
    }
    if (long) {
      if (previous) longFlowLength -= previous.text.length;
      longFlows.delete(key);
      longFlows.set(key, { style, text, chunks, paragraphs });
      longFlowLength += text.length;
      while (longFlowLength > LONG_FLOW_BUDGET && longFlows.size > 1) {
        const oldest = longFlows.keys().next().value;
        longFlowLength -= longFlows.get(oldest).text.length;
        longFlows.delete(oldest);
      }
    } else {
      flowCache.set(key, chunks);
      if (flowCache.size > FLOW_CACHE_LIMIT) flowCache.delete(flowCache.keys().next().value);
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
      const titleLines = fitDisplayText(ctx, page.title || words.untitled, {
        size: 38, maxWidth: TEXT_WIDTH, maxLines: 3, minScale: 0.6,
        setFont: (size) => { ctx.font = headFont(book, size); }
      });
      const textTop = 232 + titleLines.lines.length * titleLines.size * 1.1 + 62;
      const chunks = flow(page.id, rest, textTop, cap ? { dropLines: 3, dropWidth } : {});
      chapters.push({ number: chapterNumber, title: page.title || words.untitled, page: flat.length + 1 });
      flat.push({
        type: "chapter", source: page.id, number: chapterNumber, title: page.title || words.untitled,
        cap, dropWidth, textTop, lines: chunks[0] || []
      });
      chunks.slice(1).forEach((lines) => {
        flat.push({ type: "text", source: page.id, running: page.title || "", lines });
      });
    } else if (page.type === "part") {
      partNumber += 1;
      chapters.push({ part: true, number: partNumber, title: page.title || words.untitled, page: flat.length + 1 });
      flat.push({ type: "part", source: page.id, number: partNumber, title: page.title || words.untitled, page });
    } else if (page.type === "poem") {
      const hasTitle = Boolean(page.title?.trim());
      const firstTop = MARGIN.top + 30 + (hasTitle ? 58 : 0);
      const chunks = flow(page.id, page.text || "", firstTop, { verse: true, width: TEXT_WIDTH - 30, indent: metrics.size * 1.4 });
      (chunks.length ? chunks : [[]]).forEach((lines, index) => {
        flat.push({
          type: "verse", source: page.id, running: page.title || "",
          heading: index === 0 && hasTitle ? page.title.trim() : "", lines
        });
      });
    } else if (page.type === "body") {
      const hasHeading = Boolean(page.heading?.trim());
      const firstTop = MARGIN.top + 22 + (hasHeading ? 62 : 0);
      const chunks = flow(page.id, page.text || "", firstTop, {});
      (chunks.length ? chunks : [[]]).forEach((lines, index) => {
        flat.push({
          type: "text", source: page.id, running: page.heading || "",
          heading: index === 0 && hasHeading ? page.heading.trim() : "",
          lines
        });
      });
    } else if (page.type === "letter") {
      const hasSalutation = Boolean(page.salutation?.trim());
      const firstTop = MARGIN.top + 68 + (hasSalutation ? 38 : 0);
      const chunks = flow(page.id, page.text || "", firstTop, {});
      (chunks.length ? chunks : [[]]).forEach((lines, index, arr) => {
        flat.push({
          type: "letter", source: page.id, running: page.date || "",
          first: index === 0,
          last: index === arr.length - 1,
          page,
          lines
        });
      });
    } else if (page.type === "notebook") {
      const count = Math.max(1, Math.min(48, Math.round(page.count || 1)));
      for (let index = 0; index < count; index += 1) flat.push({ type: "notebook", source: page.id, page });
    } else if (page.type === "contents") {
      hasContents = true;
      flat.push({ type: "contents", source: page.id, heading: page.heading || words.contents, chapters });
    } else {
      flat.push({ type: page.type, source: page.id, page });
    }
  });

  // Expand contents after gathering the chapter list. Number chapters against
  // the expanded book so a long contents section can point past itself.
  if (hasContents && chapters.length > CONTENTS_ROWS) {
    const chapterAt = new Map(chapters.map((chapter) => [chapter.page - 1, chapter]));
    const contents = [];
    for (let start = 0; start < chapters.length; start += CONTENTS_ROWS) {
      contents.push(chapters.slice(start, start + CONTENTS_ROWS));
    }
    let folio = 1;
    flat = flat.flatMap((entry, index) => {
      const chapter = chapterAt.get(index);
      if (chapter) chapter.page = folio;
      if (entry.type === "contents") {
        folio += contents.length;
        return contents.map((rows) => ({ ...entry, chapters: rows }));
      }
      folio += 1;
      return [entry];
    });
  }

  flat.forEach((entry, index) => {
    entry.folio = index + 1;
    // Read at display time so it follows the interface language.
    Object.defineProperty(entry, "label", { get: () => entryLabel(entry), enumerable: true });
  });
  return flat;
}

const TYPE_LABELS = {
  halftitle: "Half-title", title: "Title page", dedication: "Dedication", epigraph: "Epigraph",
  quote: "Quotation", plate: "Plate", colophon: "Colophon", blank: "Blank", contents: "Contents",
  notebook: "Notebook", exlibris: "Ex-Libris", letter: "Letter"
};

/** What the reader bar calls a page, in the interface language. */
export function entryLabel(entry) {
  if (entry.type === "chapter") return t("Chapter {n} \u00b7 {title}", { n: entry.number, title: entry.title });
  if (entry.type === "part") return t("Part {n} \u00b7 {title}", { n: entry.number, title: entry.title });
  if (entry.type === "text") return entry.heading || entry.running || t("Text");
  if (entry.type === "verse") return entry.heading || entry.running || t("Verse");
  return t(TYPE_LABELS[entry.type] || "Page");
}

/** Runs of text + fonts used inside the book, for preloading. */
export function pageFontRuns(book) {
  const body = [];
  const head = [book.title, book.subtitle, book.author];
  book.pages.forEach((page) => {
    if (page.title) head.push(page.title);
    if (page.heading) head.push(page.heading);
    if (page.owner) head.push(page.owner);
    ["text", "caption", "attribution", "imprint", "note", "edition", "date", "salutation", "signoff"].forEach((field) => {
      if (page[field]) body.push(page[field]);
    });
  });
  const sample = (parts) => parts.filter(Boolean).join(" ").slice(0, 380) || "A";
  const bodyFace = getFont(book.interior.bodyFont);
  return [
    { font: book.interior.bodyFont, weight: 500, text: sample(body) },
    { font: book.interior.bodyFont, weight: 500, italic: bodyFace.italic, text: sample(body) },
    { font: book.interior.headingFont, weight: 600, text: sample(head) },
    { font: book.interior.headingFont, weight: 600, italic: true, text: sample(head) },
    { font: book.interior.headingFont, weight: 400, italic: true, text: sample(head) },
    { font: "inter", weight: 500, text: sample([book.title, ...head]).toUpperCase() },
    book.interior.labels === "zh"
      ? { font: "notosanssc", weight: 500, text: "\u7b2c\u7ae0\u90e8\u76ee\u5f55\u7248\u672c\u8bb0\u85cf\u4e66\u7968\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341" }
      : null
  ];
}

/* ---------- painters ---------- */

export const PAGE_INKS = {
  black: { label: "Black", color: "#1b1612" },
  sepia: { label: "Sepia", color: "#4a2f1b" },
  blue: { label: "Blue-black", color: "#1b2440" },
  green: { label: "Bottle green", color: "#1d3328" },
  burgundy: { label: "Oxblood", color: "#6b1d24" },
  slate: { label: "Slate", color: "#3b434d" },
  ivory: { label: "Warm ivory", color: "#e5d3a8" }
};

function inks(book) {
  const darkPaper = Boolean(PAPER_STOCKS[book.interior.paper]?.dark);
  const key = book.interior.ink || "black";
  const raw = (PAGE_INKS[key] || PAGE_INKS.black).color;
  if (darkPaper) {
    // On dark obsidian art stock, lift inks to luminous parchment/metallic tones for luxury legibility.
    const text = key === "ivory" ? "#efe2c4" : mixHex(raw, "#f2eadc", 0.84);
    const accent = mixHex(book.foil?.color || "#d8b464", "#f3e7d1", 0.25);
    return { text, soft: rgba(text, 0.7), accent, rule: rgba(accent, 0.45), darkPaper: true };
  }
  const text = key === "ivory" ? "#7a643d" : raw;
  const accent = mixHex(book.material.binding && book.material.binding !== "full" ? book.material.second : book.material.color, "#211b16", 0.5);
  return { text, soft: rgba(text, 0.66), accent, rule: rgba(accent, 0.55), darkPaper: false };
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
    if (line.ornament) {
      // Section break: three small lozenges.
      const y = top + index * metrics.lineHeight - metrics.size * 0.3;
      ctx.save();
      ctx.fillStyle = ink.accent;
      [-1, 0, 1].forEach((offset) => {
        const x = left + line.max / 2 + offset * metrics.size * 1.5;
        const r = metrics.size * (offset ? 0.17 : 0.24);
        ctx.beginPath();
        ctx.moveTo(x, y - r * 1.3);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r * 1.3);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
      return;
    }
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
  const running = entry.type === "text" || entry.type === "verse";
  if (book.interior.runningHead && running) {
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
  if (book.interior.folios && (running || ["chapter", "contents", "quote"].includes(entry.type))) {
    const outer = running && book.interior.folioPlace !== "center";
    ctx.fillStyle = ink.soft;
    ctx.font = bodyFont(book, 12.5);
    ctx.textAlign = outer ? (recto ? "right" : "left") : "center";
    const x = outer ? (recto ? right : left) : left + TEXT_WIDTH / 2;
    const number = String(entry.folio);
    ctx.fillText(outer ? number : `\u2014 ${number} \u2014`, x, H - 50);
  }
}

const PAINT = {
  blank() {},

  /** Writing paper: lines, dots, grid, Cornell notes, music staves, or traditional Wusilan columns. */
  notebook(ctx, book, entry, recto, ink) {
    const ruling = entry.page?.ruling || "lined";
    const left = recto ? MARGIN.inner : MARGIN.outer;
    const right = left + TEXT_WIDTH;
    const top = MARGIN.top;
    const bottom = H - MARGIN.bottom;
    const pitch = ruling === "lined" ? 25 : 18;
    ctx.save();
    ctx.fillStyle = ink.rule;
    ctx.strokeStyle = ink.rule;
    if (ruling === "lined") {
      for (let y = top + pitch; y <= bottom; y += pitch) ctx.fillRect(left, y, TEXT_WIDTH, 0.8);
    } else if (ruling === "dotted") {
      for (let y = top; y <= bottom; y += pitch) {
        for (let x = left; x <= right + 0.5; x += pitch) {
          ctx.beginPath();
          ctx.arc(x, y, 1.05, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (ruling === "cornell") {
      const headerY = top + 36;
      const summaryY = bottom - 108;
      const cueX = left + TEXT_WIDTH * 0.29;
      ctx.fillRect(left, headerY, TEXT_WIDTH, 1.2);
      ctx.fillRect(left, summaryY, TEXT_WIDTH, 1.2);
      ctx.fillRect(cueX, headerY, 1.1, summaryY - headerY);
      ctx.globalAlpha = 0.65;
      for (let y = headerY + 24; y < summaryY - 6; y += 24) ctx.fillRect(cueX + 10, y, right - cueX - 10, 0.7);
      for (let y = summaryY + 24; y <= bottom; y += 24) ctx.fillRect(left, y, TEXT_WIDTH, 0.7);
    } else if (ruling === "music") {
      const staves = 10;
      const lineGap = 6.4;
      const staffHeight = lineGap * 4;
      const stride = (bottom - top - staffHeight) / (staves - 1);
      ctx.lineWidth = 0.75;
      for (let s = 0; s < staves; s += 1) {
        const y0 = top + s * stride;
        for (let l = 0; l < 5; l += 1) {
          const y = y0 + l * lineGap;
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
        }
        ctx.fillRect(left, y0, 1.2, staffHeight);
        ctx.fillRect(right - 1.2, y0, 1.2, staffHeight);
      }
    } else if (ruling === "wusilan") {
      // Traditional East Asian vertical woodblock frame (乌丝栏 / 朱丝栏) with double outer border & fishtail mark.
      const padX = 8;
      const x0 = left + padX;
      const w = TEXT_WIDTH - padX * 2;
      const y0 = top - 8;
      const h = bottom - y0 + 8;
      ctx.lineWidth = 2.2;
      ctx.strokeRect(x0, y0, w, h);
      ctx.lineWidth = 0.85;
      ctx.strokeRect(x0 + 5, y0 + 5, w - 10, h - 10);
      const cols = 10;
      const colW = (w - 10) / cols;
      ctx.globalAlpha = 0.72;
      for (let c = 1; c < cols; c += 1) {
        const x = x0 + 5 + c * colW;
        ctx.beginPath();
        ctx.moveTo(x, y0 + 5);
        ctx.lineTo(x, y0 + h - 5);
        ctx.stroke();
      }
      // Classic fishtail (鱼尾) bookmark ornament in the binding-side center column
      ctx.globalAlpha = 0.85;
      const tailX = recto ? x0 + 5 : x0 + w - 5 - colW;
      const tailY = y0 + h * 0.27;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(tailX + colW, tailY);
      ctx.lineTo(tailX + colW, tailY + 11);
      ctx.lineTo(tailX + colW * 0.5, tailY + 6);
      ctx.lineTo(tailX, tailY + 11);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let y = top; y <= bottom + 0.5; y += pitch) {
        ctx.moveTo(left, y);
        ctx.lineTo(left + Math.floor(TEXT_WIDTH / pitch) * pitch, y);
      }
      const lastY = top + Math.floor((bottom - top) / pitch) * pitch;
      for (let x = left; x <= right + 0.5; x += pitch) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, lastY);
      }
      ctx.stroke();
    }
    ctx.restore();
  },

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
    const rows = entry.chapters;
    const step = Math.min(34, (TEXT_BOTTOM - 214) / Math.max(rows.length, 1));
    const words = printed(book);
    rows.forEach((chapter, index) => {
      const y = 218 + index * step;
      ctx.fillStyle = chapter.part ? ink.accent : ink.soft;
      ctx.font = SMALL(8.6);
      setTracking(ctx, 0.16, 8.6);
      ctx.textAlign = "left";
      ctx.fillText(chapter.part ? "\u25c6" : words.numeral(chapter.number), left, y - 1);
      ctx.letterSpacing = "0px";
      ctx.fillStyle = ink.text;
      ctx.font = chapter.part ? headFont(book, 16) : bodyFont(book, 16);
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
      ctx.fillText(printed(book).emptyContents, left, 218);
    }
  },

  chapter(ctx, book, entry, recto, ink, metrics) {
    const left = recto ? MARGIN.inner : MARGIN.outer;
    const style = book.interior.chapterStyle || "classic";
    const centre = style === "centered" || style === "ornament";
    const anchor = centre ? left + TEXT_WIDTH / 2 : left;
    const words = printed(book);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ink.accent;
    ctx.textAlign = centre ? "center" : "left";
    if (style === "ornament") {
      const motifKey = hasMotif(book.front?.motif?.key) ? book.front.motif.key : "fleur";
      drawMotif(ctx, motifKey, { cx: anchor, cy: 132, size: 28, color: ink.accent, alpha: 0.88, lineWidth: 1.3, text: book.title });
      ctx.fillStyle = ink.rule;
      ctx.fillRect(anchor - 74, 132, 34, 0.9);
      ctx.fillRect(anchor + 40, 132, 34, 0.9);
      ctx.fillStyle = ink.accent;
      ctx.font = SMALL(9.2);
      setTracking(ctx, 0.26, 9.2);
      ctx.fillText(words.chapter(entry.number), anchor + 9.2 * 0.13, 174);
      ctx.letterSpacing = "0px";
    } else if (style === "numeral") {
      ctx.font = headFont(book, 50, { weight: 400 });
      ctx.fillText(words.numeral(entry.number), left - 1, 184);
    } else {
      ctx.font = SMALL(9.4);
      setTracking(ctx, 0.26, 9.4);
      ctx.fillText(words.chapter(entry.number), anchor + (centre ? 9.4 * 0.13 : 0), 170);
      ctx.letterSpacing = "0px";
    }
    ctx.fillStyle = ink.text;
    const fitted = fitDisplayText(ctx, entry.title, {
      size: 38, maxWidth: TEXT_WIDTH, maxLines: 3, minScale: 0.6,
      setFont: (size) => { ctx.font = headFont(book, size); }
    });
    ctx.font = headFont(book, fitted.size);
    fitted.lines.forEach((line, index) => {
      drawLine(ctx, line, anchor, 232 + index * fitted.size * 1.1, { align: centre ? "center" : "left" });
    });
    const ruleY = 232 + (fitted.lines.length - 1) * fitted.size * 1.1 + 26;
    ctx.fillStyle = ink.rule;
    ctx.fillRect(centre ? anchor - 22 : left, ruleY, 44, 1.2);
    if (entry.cap) {
      const capSize = metrics.lineHeight * 2.86;
      ctx.fillStyle = ink.accent;
      ctx.font = headFont(book, capSize);
      ctx.textAlign = "left";
      ctx.fillText(entry.cap, left - 1, entry.textTop + metrics.lineHeight * 2 + 1);
    }
    drawRunningText(ctx, book, entry, entry.textTop, left, metrics, ink);
  },

  part(ctx, book, entry, recto, ink) {
    ctx.textBaseline = "alphabetic";
    const motif = book.front.motif.key;
    if (hasMotif(motif)) {
      drawMotif(ctx, motif, { cx: W / 2, cy: 196, size: 26, color: ink.accent, alpha: 0.8, lineWidth: 1, text: book.title });
    }
    ctx.fillStyle = ink.accent;
    centered(ctx, printed(book).part(entry.number), 286, TEXT_WIDTH, { font: (size) => SMALL(size), size: 10, tracking: 0.3, maxLines: 1 });
    ctx.fillStyle = ink.text;
    const bottom = centered(ctx, entry.title, 344, TEXT_WIDTH * 0.9, {
      font: (size) => headFont(book, size), size: 42, maxLines: 3, lineHeight: 1.12, minScale: 0.55
    });
    ctx.fillStyle = ink.rule;
    ctx.fillRect(W / 2 - 22, bottom - 8, 44, 1.2);
    if (entry.page.text) {
      ctx.fillStyle = ink.soft;
      centered(ctx, entry.page.text, bottom + 36, TEXT_WIDTH * 0.76, {
        font: (size) => bodyFont(book, size, { italic: true }), size: 15, lineHeight: 1.5, maxLines: 6, minScale: 0.8
      });
    }
  },

  epigraph(ctx, book, entry, recto, ink) {
    const left = recto ? MARGIN.inner : MARGIN.outer;
    const width = TEXT_WIDTH * 0.68;
    const x = left + TEXT_WIDTH - width;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ink.text;
    ctx.font = bodyFont(book, 15.4, { italic: true });
    const lines = breakText(ctx, entry.page.text || "", width).slice(0, 14);
    lines.forEach((line, index) => drawLine(ctx, line, x, 214 + index * 24, { align: "left" }));
    if (entry.page.attribution) {
      ctx.fillStyle = ink.soft;
      ctx.font = SMALL(9.2);
      setTracking(ctx, 0.2, 9.2);
      ctx.textAlign = "right";
      ctx.fillText(`\u2014 ${entry.page.attribution.toUpperCase()}`, left + TEXT_WIDTH, 214 + lines.length * 24 + 16);
      ctx.letterSpacing = "0px";
    }
  },

  verse(ctx, book, entry, recto, ink, metrics) {
    const left = (recto ? MARGIN.inner : MARGIN.outer) + 30;
    let top = MARGIN.top + 30;
    ctx.textBaseline = "alphabetic";
    if (entry.heading) {
      ctx.fillStyle = ink.text;
      ctx.font = headFont(book, 23, { italic: true, weight: 400 });
      ctx.textAlign = "left";
      ctx.fillText(entry.heading, left, top + 6);
      top += 58;
    }
    drawRunningText(ctx, { ...book, interior: { ...book.interior, justify: false } }, entry, top, left, metrics, ink);
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
    if (image && entry.page.bleed) {
      const scale = Math.max(W / image.naturalWidth, H / image.naturalHeight);
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      ctx.drawImage(image, (W - w) / 2, (H - h) / 2, w, h);
      const gutter = ctx.createLinearGradient(recto ? 0 : W, 0, recto ? 70 : W - 70, 0);
      gutter.addColorStop(0, "rgba(20,14,8,0.34)");
      gutter.addColorStop(1, "rgba(20,14,8,0)");
      ctx.fillStyle = gutter;
      ctx.fillRect(0, 0, W, H);
      return;
    }
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

  exlibris(ctx, book, entry, recto, ink) {
    const left = recto ? MARGIN.inner : MARGIN.outer;
    const cx = left + TEXT_WIDTH / 2;
    const words = printed(book);
    const fx = left + 26;
    const fy = 128;
    const fw = TEXT_WIDTH - 52;
    const fh = 508;
    ctx.save();
    ctx.strokeStyle = ink.accent;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.strokeStyle = ink.rule;
    ctx.lineWidth = 0.85;
    ctx.strokeRect(fx + 9, fy + 9, fw - 18, fh - 18);
    // Corner diamond studs
    ctx.fillStyle = ink.accent;
    [[fx + 17, fy + 17], [fx + fw - 17, fy + 17], [fx + 17, fy + fh - 17], [fx + fw - 17, fy + fh - 17]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(dx, dy - 3.5);
      ctx.lineTo(dx + 3.5, dy);
      ctx.lineTo(dx, dy + 3.5);
      ctx.lineTo(dx - 3.5, dy);
      ctx.closePath();
      ctx.fill();
    });
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ink.accent;
    ctx.font = SMALL(10);
    setTracking(ctx, 0.34, 10);
    ctx.textAlign = "center";
    ctx.fillText(words.zh ? "\u85cf\u4e66\u7968 \u00b7 EX LIBRIS" : "EX LIBRIS", cx + 1.6, fy + 58);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = ink.rule;
    ctx.fillRect(cx - 46, fy + 72, 92, 0.9);
    const motifKey = hasMotif(entry.page?.motif) ? entry.page.motif : hasMotif(book.front?.motif?.key) ? book.front.motif.key : "fleur";
    drawMotif(ctx, motifKey, { cx, cy: fy + 206, size: 112, color: ink.accent, alpha: 0.92, lineWidth: 1.6, text: book.title });
    ctx.fillStyle = ink.rule;
    ctx.fillRect(cx - 56, fy + 332, 112, 0.9);
    const owner = (entry.page?.owner || book.author || "Folio Atelier").trim();
    ctx.fillStyle = ink.text;
    const afterOwner = centered(ctx, owner, fy + 382, fw - 58, {
      font: (size) => headFont(book, size), size: 28, maxLines: 2, lineHeight: 1.2, minScale: 0.6
    });
    if (entry.page?.note) {
      ctx.fillStyle = ink.soft;
      centered(ctx, entry.page.note, afterOwner + 6, fw - 66, {
        font: (size) => bodyFont(book, size, { italic: true }), size: 13.5, maxLines: 3, lineHeight: 1.4
      });
    }
    if (entry.page?.edition) {
      ctx.fillStyle = ink.soft;
      ctx.font = SMALL(9.2);
      setTracking(ctx, 0.22, 9.2);
      ctx.textAlign = "center";
      ctx.fillText(entry.page.edition.toUpperCase(), cx + 1, fy + fh - 26);
      ctx.letterSpacing = "0px";
    }
    ctx.restore();
  },

  letter(ctx, book, entry, recto, ink, metrics) {
    const left = recto ? MARGIN.inner : MARGIN.outer;
    const right = left + TEXT_WIDTH;
    ctx.textBaseline = "alphabetic";
    let top = MARGIN.top + 22;
    if (entry.first) {
      if (entry.page?.date) {
        ctx.fillStyle = ink.soft;
        ctx.font = bodyFont(book, 13.5, { italic: true });
        ctx.textAlign = "right";
        ctx.fillText(entry.page.date, right, MARGIN.top + 18);
        ctx.fillStyle = ink.rule;
        ctx.fillRect(right - 92, MARGIN.top + 28, 92, 0.7);
      }
      top = MARGIN.top + 68;
      if (entry.page?.salutation) {
        ctx.fillStyle = ink.text;
        ctx.font = headFont(book, 20, { italic: true, weight: 400 });
        ctx.textAlign = "left";
        ctx.fillText(entry.page.salutation, left, top);
        top += 38;
      }
    }
    drawRunningText(ctx, book, entry, top, left, metrics, ink);
    if (entry.last && entry.page?.signoff) {
      const signY = Math.min(TEXT_BOTTOM - 8, top + entry.lines.length * metrics.lineHeight + 34);
      ctx.fillStyle = ink.text;
      ctx.font = headFont(book, 19, { italic: true, weight: 400 });
      ctx.textAlign = "right";
      ctx.fillText(entry.page.signoff, right, signY);
    }
  },

  colophon(ctx, book, entry, recto, ink) {
    const left = recto ? MARGIN.inner : MARGIN.outer;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ink.accent;
    ctx.font = SMALL(9.4);
    setTracking(ctx, 0.26, 9.4);
    ctx.textAlign = "left";
    const words = printed(book);
    ctx.fillText(words.colophon, left, 388);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = ink.rule;
    ctx.fillRect(left, 402, 44, 1);
    const custom = (entry.page.text || "").trim();
    const face = (id, part) => {
      const names = getFont(id).label.split(" · ");
      return names[part] || names[0];
    };
    const binding = MATERIALS.find((candidate) => candidate.id === book.material.kind) || MATERIALS[0];
    const foil = FOILS.find((candidate) => candidate.id === book.foil.preset);
    const automatic = words.zh
      ? `\u300a${book.title}\u300b${book.author ? `\uff0c${book.author} \u8457` : ""}\u3002\u6b63\u6587\u4f7f\u7528 ${face(book.interior.bodyFont, 1)}\uff0c\u6807\u9898\u4f7f\u7528 ${face(book.interior.headingFont, 1)}\uff1b${ZH_MATERIAL[binding.id] || "\u5e03\u9762"}\u88c5\u5e27\uff0c${foil && ZH_FOIL[foil.id] ? ZH_FOIL[foil.id] : "\u5b9a\u5236\u7b94"}\u70eb\u5370\u3002\n\n\u4e8e Folio Atelier \u624b\u5de5\u8bbe\u8ba1\u5236\u4f5c\u3002`
      : `${book.title}${book.author ? ` by ${book.author}` : ""} was set in ${face(book.interior.bodyFont, 0)} with headings in ${face(book.interior.headingFont, 0)}, and bound in ${binding.label.toLowerCase()} with ${foil && foil.id !== "custom" ? foil.label.toLowerCase() : "custom foil"}.\n\nDesigned and made by hand in Folio Atelier.`;
    const text = custom || automatic;
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
// The paper under the print: thousands of fibres and flecks, the same for
// every page of a stock. Four sheets per stock and size are kept (neighbouring
// leaves differ) and laid down whole, instead of drawing the fibres again for
// every page and every keystroke.
const paperSheets = new Map();
const PAPER_SHEET_LIMIT = 8;

function paperSheet(stock, variant, pixelWidth, pixelHeight) {
  const key = `${stock}|${variant}|${pixelWidth}x${pixelHeight}`;
  const cached = paperSheets.get(key);
  if (cached) {
    paperSheets.delete(key);
    paperSheets.set(key, cached);
    return cached;
  }
  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const ctx = paintContext(canvas);
  ctx.setTransform(pixelWidth / W, 0, 0, pixelHeight / H, 0, 0);
  drawPaperSurface(ctx, W, H, seededRandom(hashSeed(`paper-sheet-${stock}-${variant}`)), stock);
  paperSheets.set(key, canvas);
  if (paperSheets.size > PAPER_SHEET_LIMIT) {
    const oldest = paperSheets.keys().next().value;
    paperSheets.get(oldest).width = 1;
    paperSheets.delete(oldest);
  }
  return canvas;
}

export function paintPage(book, entry, index, target, onAsset) {
  const { context: ctx, canvas } = target;
  const recto = index % 2 === 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.letterSpacing = "0px";
  ctx.drawImage(paperSheet(book.interior.paper || "cream", index % 4, canvas.width, canvas.height), 0, 0, W, H);

  // Gutter shadow: the sheet curls gently into the bound spine valley.
  const darkStock = Boolean(PAPER_STOCKS[book.interior.paper]?.dark);
  const gutter = ctx.createLinearGradient(recto ? 0 : W, 0, recto ? 88 : W - 88, 0);
  gutter.addColorStop(0, darkStock ? "rgba(0,0,0,0.52)" : "rgba(32,22,13,0.34)");
  gutter.addColorStop(0.14, darkStock ? "rgba(0,0,0,0.28)" : "rgba(36,26,16,0.18)");
  gutter.addColorStop(0.42, darkStock ? "rgba(0,0,0,0.1)" : "rgba(40,30,20,0.06)");
  gutter.addColorStop(0.75, "rgba(40,30,20,0.015)");
  gutter.addColorStop(1, "rgba(40,30,20,0)");
  ctx.fillStyle = gutter;
  ctx.fillRect(0, 0, W, H);

  // Subtle paper light roll-off near the outer edge for page tactility.
  const outerShade = ctx.createLinearGradient(recto ? W : 0, 0, recto ? W - 26 : 26, 0);
  outerShade.addColorStop(0, darkStock ? "rgba(255,248,232,0.04)" : "rgba(48,38,26,0.06)");
  outerShade.addColorStop(1, darkStock ? "rgba(255,248,232,0)" : "rgba(48,38,26,0)");
  ctx.fillStyle = outerShade;
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

/** Everything `paintPage` reads for one entry, as a string. */
export function pageSignature(book, entry) {
  return JSON.stringify([
    book.id, book.interior, book.title, book.subtitle, book.author, book.series,
    book.front.motif.key, book.material, book.foil.preset, entry
  ], (key, value) => (key === "label" ? undefined : value));
}

export const pageLabel = (entry, index) => (entry ? entry.label : `Page ${pad(index + 1)}`);
