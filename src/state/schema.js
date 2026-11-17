// BookSpec: the single serialisable description of a user's book.
// Everything the 3D rig and the page painters need is derived from this.

import { deepClone, derivePalette, hashSeed, luminance, mixHex, uid } from "../util.js";
import { FOILS, LAYOUTS, MATERIALS, getFoil, getPreset } from "../data/presets.js";
import { getLang, t } from "../i18n.js";

export const SCHEMA_VERSION = 2;

/** Standard trim: one shared hardcover format for every book. */
export const BOOK_FORMAT = Object.freeze({ width: 1.06, height: 1.59, depth: 0.27 });

export const PAGE_TYPES = [
  { id: "halftitle", label: "Half-title", note: "The title alone" },
  { id: "title", label: "Title page", note: "Title, subtitle, author" },
  { id: "dedication", label: "Dedication", note: "A short line, centred" },
  { id: "epigraph", label: "Epigraph", note: "A short quotation before the text" },
  { id: "contents", label: "Contents", note: "Built from your chapters" },
  { id: "part", label: "Part title", note: "Divides the book into parts" },
  { id: "chapter", label: "Chapter opener", note: "Number, title, opening text" },
  { id: "body", label: "Body text", note: "Flows across pages" },
  { id: "poem", label: "Verse", note: "Keeps your line breaks" },
  { id: "quote", label: "Pull quote", note: "A large quotation" },
  { id: "plate", label: "Plate", note: "Image or ornament with caption" },
  { id: "colophon", label: "Colophon", note: "Notes on the edition" },
  { id: "blank", label: "Blank", note: "An empty page" }
];

// Starter words for new pages, in the language the interface is using.
const WORDS = {
  en: {
    dedication: "For those who keep making.",
    contents: "Contents",
    chapter: "A New Chapter",
    part: "Part Title",
    quote: "A book is a place you can return to.",
    epigraph: "We read to know we are not alone.",
    poem: "A line of verse\nand then another,\nkept exactly as you break them.",
    firstChapter: "The Empty Room",
    secondChapter: "What Comes Next",
    firstQuote: "Make the thing you wish you had found on the shelf.",
    opening: [
      "Every book begins as an empty room. There is a table, a window, and the particular quiet that comes before anything has been decided. This page is that room: replace these lines with your own.",
      "Write the way you would speak to one attentive reader. Leave the long explanations for later chapters, and let the first paragraphs do only what first paragraphs must \u2014 open the door, and make it easy to step inside.",
      "***",
      "When the text grows longer than a single page it continues onto the next one by itself, so you can simply keep writing. Add chapters, quotations and plates from the page list, and drag them into the order you want."
    ].join("\n\n")
  },
  zh: {
    dedication: "\u732e\u7ed9\u6240\u6709\u4ecd\u5728\u52a8\u624b\u521b\u9020\u7684\u4eba\u3002",
    contents: "\u76ee\u5f55",
    chapter: "\u65b0\u7684\u4e00\u7ae0",
    part: "\u5377\u540d",
    quote: "\u4e66\u662f\u4e00\u4e2a\u53ef\u4ee5\u4e00\u518d\u56de\u53bb\u7684\u5730\u65b9\u3002",
    epigraph: "\u8bfb\u4e66\uff0c\u662f\u4e3a\u4e86\u77e5\u9053\u6211\u4eec\u5e76\u4e0d\u5b64\u5355\u3002",
    poem: "\u4e00\u884c\u8bd7\n\u53c8\u4e00\u884c\uff0c\n\u6309\u4f60\u65ad\u53e5\u7684\u6837\u5b50\u7559\u5728\u7eb8\u4e0a\u3002",
    firstChapter: "\u7a7a\u623f\u95f4",
    secondChapter: "\u63a5\u4e0b\u6765",
    firstQuote: "\u53bb\u505a\u90a3\u672c\u4f60\u5e0c\u671b\u5728\u4e66\u67b6\u4e0a\u9047\u89c1\u7684\u4e66\u3002",
    opening: [
      "\u6bcf\u4e00\u672c\u4e66\u90fd\u4ece\u4e00\u95f4\u7a7a\u623f\u95f4\u5f00\u59cb\u3002\u4e00\u5f20\u684c\u5b50\uff0c\u4e00\u6247\u7a97\uff0c\u8fd8\u6709\u4e00\u5207\u5c1a\u672a\u51b3\u5b9a\u4e4b\u524d\u90a3\u79cd\u7279\u522b\u7684\u5b89\u9759\u3002\u8fd9\u4e00\u9875\u5c31\u662f\u90a3\u95f4\u623f\u95f4\uff1a\u628a\u8fd9\u51e0\u884c\u5b57\u6362\u6210\u4f60\u81ea\u5df1\u7684\u3002",
      "\u50cf\u5bf9\u4e00\u4f4d\u4e13\u5fc3\u7684\u8bfb\u8005\u8bf4\u8bdd\u90a3\u6837\u53bb\u5199\u3002\u957f\u7bc7\u7684\u89e3\u91ca\u7559\u7ed9\u540e\u9762\u7684\u7ae0\u8282\uff0c\u5f00\u5934\u7684\u51e0\u6bb5\u53ea\u505a\u5f00\u5934\u8be5\u505a\u7684\u4e8b\u2014\u2014\u63a8\u5f00\u95e8\uff0c\u8ba9\u4eba\u613f\u610f\u8d70\u8fdb\u6765\u3002",
      "***",
      "\u6587\u5b57\u8d85\u8fc7\u4e00\u9875\u65f6\u4f1a\u81ea\u52a8\u7eed\u5230\u4e0b\u4e00\u9875\uff0c\u6240\u4ee5\u53ea\u7ba1\u5199\u4e0b\u53bb\u3002\u5728\u9875\u9762\u5217\u8868\u91cc\u6dfb\u52a0\u7ae0\u8282\u3001\u5f15\u6587\u548c\u56fe\u7248\uff0c\u518d\u62d6\u52a8\u5b83\u4eec\u6392\u6210\u4f60\u60f3\u8981\u7684\u987a\u5e8f\u3002"
    ].join("\n\n")
  }
};
const words = () => WORDS[getLang()] || WORDS.en;

const PAGE_DEFAULTS = {
  halftitle: () => ({}),
  title: () => ({ imprint: "" }),
  dedication: () => ({ text: words().dedication }),
  epigraph: () => ({ text: words().epigraph, attribution: "" }),
  contents: () => ({ heading: words().contents }),
  part: () => ({ title: words().part, text: "" }),
  chapter: () => ({ title: words().chapter, text: "" }),
  body: () => ({ heading: "", text: "" }),
  poem: () => ({ title: "", text: words().poem }),
  quote: () => ({ text: words().quote, attribution: "" }),
  plate: () => ({ image: null, motif: "", caption: "", bleed: false }),
  colophon: () => ({ text: "" }),
  blank: () => ({})
};

export function createPage(type, fields = {}) {
  const make = PAGE_DEFAULTS[type] || PAGE_DEFAULTS.blank;
  return { id: uid("pg"), type: PAGE_DEFAULTS[type] ? type : "blank", ...make(), ...fields };
}

export function defaultPages() {
  const w = words();
  return [
    createPage("halftitle"),
    createPage("blank"),
    createPage("title"),
    createPage("dedication"),
    createPage("contents"),
    createPage("blank"),
    createPage("chapter", { title: w.firstChapter, text: w.opening }),
    createPage("quote", { text: w.firstQuote, attribution: "" }),
    createPage("chapter", { title: w.secondChapter, text: "" }),
    createPage("colophon")
  ];
}

function resolveFoil(foil) {
  if (foil && typeof foil === "object") {
    const base = getFoil(foil.preset);
    return {
      preset: foil.preset || "custom",
      color: foil.color || base.color,
      metalness: foil.metalness ?? base.metalness,
      roughness: foil.roughness ?? base.roughness,
      iridescence: foil.iridescence ?? base.iridescence ?? 0,
      texture: foil.texture || "polished"
    };
  }
  const base = getFoil(foil);
  return {
    preset: base.id, color: base.color, metalness: base.metalness, roughness: base.roughness,
    iridescence: base.iridescence || 0,
    texture: "polished"
  };
}

/** Printed (non-foil) elements need a colour that reads on the cloth. */
function contrastInk(color) {
  return luminance(color) < 0.28 ? "#f3ece0" : "#1d1813";
}

function buildFront(layoutId, preset, color) {
  const layout = LAYOUTS[layoutId] || LAYOUTS.classic;
  const front = deepClone(layout.front);
  front.layout = LAYOUTS[layoutId] ? layoutId : "classic";
  front.motif.key = preset.motif || "none";
  front.image = null;
  const ink = contrastInk(color);
  // Layouts that print on a pasted label bring their own ink colours.
  if (front.border.finish !== "ink") front.border.color = ink;
  front.texts.forEach((layer) => { if (layer.finish !== "ink") layer.color = ink; });
  front.motif.color = ink;
  // A piece of contrasting leather laid on the board (onlay) or set flush
  // into a cut-out (inlay). Off until the reader adds one.
  front.onlay = {
    show: false, mode: "onlay", shape: "rounded", kind: "leather",
    color: mixHex(color, luminance(color) < 0.3 ? "#e8dcc4" : "#1d1813", 0.55),
    x: 0.5, y: 0.4, width: 0.62, height: 0.3
  };
  if (preset.border) front.border.style = preset.border;
  if (preset.blank) {
    front.border.style = "none";
    front.texts.forEach((layer) => { layer.show = false; });
  }
  return front;
}

function buildSpine(preset, color) {
  const ink = contrastInk(color);
  return {
    style: preset.blank ? "none" : preset.spine || "frame",
    emblem: preset.blank || preset.stitched ? "none" : "ring",
    finish: "foil",
    color: ink,
    label: { show: false, color: mixHex(color, luminance(color) < 0.2 ? "#7a1f2b" : "#1d1813", 0.82) },
    texts: [
      {
        id: "spine-title", source: "title", text: "", show: !preset.blank && !preset.stitched,
        font: "cormorant", size: 66, weight: 500, italic: false, tracking: 0.01, upper: false,
        orient: "vertical", y: 0.5, finish: "foil", color: ink
      },
      {
        id: "spine-author", source: "author", text: "", show: !preset.blank && !preset.stitched,
        font: "inter", size: 19, weight: 500, italic: false, tracking: 0.2, upper: true,
        orient: "vertical", y: 0.8, finish: "foil", color: ink
      },
      {
        id: "spine-mark", source: "custom", text: "I", show: !preset.blank && !preset.stitched,
        font: "inter", size: 24, weight: 500, italic: false, tracking: 0.2, upper: true,
        orient: "horizontal", y: 0.077, finish: "foil", color: ink
      }
    ]
  };
}

function buildBack(preset, color) {
  const ink = contrastInk(color);
  return {
    border: { style: "none", inset: 0.055, finish: "foil", color: ink },
    motif: {
      key: preset.blank ? "none" : "rings", x: 0.71, y: 0.325, scale: 1,
      finish: "foil", color: ink, opacity: 0.9
    },
    texts: [
      {
        id: "back-blurb", source: "custom", text: "", show: true,
        font: "cormorant", size: 30, weight: 500, italic: false, tracking: 0, upper: false,
        align: "left", x: 0.09, y: 0.745, anchor: "bottom", width: 0.74, lineHeight: 1.3, finish: "foil", color: ink
      },
      {
        id: "back-title", source: "title", text: "", show: !preset.blank,
        font: "cormorant", size: 56, weight: 500, italic: false, tracking: 0, upper: false,
        align: "left", x: 0.09, y: 0.83, width: 0.8, lineHeight: 1.05, finish: "foil", color: ink
      },
      {
        id: "back-author", source: "author", text: "", show: !preset.blank,
        font: "inter", size: 15, weight: 500, italic: false, tracking: 0.2, upper: true,
        align: "left", x: 0.092, y: 0.875, width: 0.8, lineHeight: 1.2, finish: "foil", color: ink
      },
      {
        id: "back-imprint", source: "custom", text: "Folio Atelier", show: !preset.blank,
        font: "inter", size: 14, weight: 500, italic: false, tracking: 0.22, upper: true,
        align: "right", x: 0.91, y: 0.938, width: 0.6, lineHeight: 1.2, finish: "foil", color: ink
      }
    ]
  };
}

function buildDetails(preset, color, foil) {
  return {
    edge: preset.edge ? { ...preset.edge } : { style: "plain", color: "#c6532f" },
    endpaper: { color: mixHex(color, "#efe6d4", 0.72), pattern: preset.endpaper || "grid" },
    ribbon: { show: true, color: mixHex(foil.color, color, 0.28), double: false, second: mixHex(foil.color, "#f3ece0", 0.4) },
    headband: { color: mixHex(foil.color, "#c6a66d", 0.5), striped: false, second: "#f3ece0" },
    corners: { style: preset.corners || "none" },
    stitch: { show: Boolean(preset.stitched), color: "#f3ece0", holes: 4 }
  };
}

function buildPattern(preset, color) {
  return {
    key: "none",
    scale: 1,
    finish: "blind",
    color: contrastInk(color),
    opacity: 0.6,
    spine: false,
    ...(preset.pattern || {})
  };
}

function buildInterior() {
  return {
    bodyFont: getLang() === "zh" ? "notoserifsc" : "garamond",
    headingFont: getLang() === "zh" ? "notoserifsc" : "cormorant",
    paper: "cream",
    scale: 1,
    leading: 1.5,
    runningHead: true,
    folios: true,
    folioPlace: "outer",
    dropCap: true,
    justify: true,
    chapterStyle: "classic",
    ink: "black",
    labels: getLang()
  };
}

/** Apply a whole-book preset, keeping the words and pages the user wrote. */
export function applyPreset(book, presetId) {
  const preset = getPreset(presetId);
  const color = preset.material.color;
  const foil = resolveFoil(preset.foil);
  const keep = (existing, next) => {
    if (!existing) return next;
    next.texts.forEach((layer) => {
      const previous = existing.texts?.find((candidate) => candidate.id === layer.id);
      if (previous && previous.source === "custom" && layer.source === "custom") {
        layer.text = previous.text;
      }
    });
    return next;
  };
  book.preset = preset.id;
  book.material = {
    kind: preset.material.kind,
    color,
    binding: preset.material.binding || "full",
    second: preset.material.second || mixHex(color, "#1d1813", 0.55)
  };
  book.pattern = buildPattern(preset, color);
  book.foil = foil;
  book.palette = preset.palette ? { ...preset.palette } : null;
  const image = book.front?.image || null;
  book.front = keep(book.front, buildFront(preset.layout, preset, color));
  book.front.image = image;
  book.spine = keep(book.spine, buildSpine(preset, color));
  book.back = keep(book.back, buildBack(preset, color));
  book.details = buildDetails(preset, color, foil);
  return book;
}

/** Swap only the front-cover arrangement, keeping colours and custom words. */
export function applyLayout(book, layoutId) {
  const preset = { motif: book.front?.motif?.key || "none" };
  const next = buildFront(layoutId, preset, book.material.color);
  next.image = book.front?.image || null;
  if (book.front?.onlay) next.onlay = book.front.onlay;
  book.front?.texts?.forEach((previous) => {
    const layer = next.texts.find((candidate) => candidate.id === previous.id);
    if (layer && previous.source === "custom") {
      layer.source = "custom";
      layer.text = previous.text;
    }
  });
  book.front = next;
  return book;
}

export function createBook({ presetId = "ultramarine", title = "", author = "", subtitle = "" } = {}) {
  const id = uid("book");
  const now = Date.now();
  const book = {
    id,
    version: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    seed: (hashSeed(id) % 89) + 7,
    title: title.trim() || "Untitled",
    subtitle: subtitle.trim(),
    author: author.trim(),
    series: "",
    interior: buildInterior(),
    pages: defaultPages(),
    // Foil and blind stamps: pressed into the board ("deboss"), raised from
    // it ("emboss") or left flat; `depth` runs from 0 to 1.
    stamp: { relief: "deboss", depth: 0.5 }
  };
  applyPreset(book, presetId);
  return book;
}

export function duplicateBook(source) {
  const book = deepClone(source);
  book.id = uid("book");
  book.createdAt = Date.now();
  book.updatedAt = book.createdAt;
  book.title = t("{title} (copy)", { title: source.title });
  book.pages.forEach((page) => { page.id = uid("pg"); });
  return book;
}

/** The text a layer prints, resolved against the book's shared fields. */
export function layerText(book, layer) {
  const raw = layer.source && layer.source !== "custom"
    ? book[layer.source] || ""
    : layer.text || "";
  return layer.upper ? raw.toUpperCase() : raw;
}

export function bookPalette(book) {
  return book.palette || derivePalette(book.material.color, book.foil.color);
}

/** One-line description of the binding, e.g. "Bookcloth \u00b7 copper foil". */
export function bindingLabel(book) {
  const material = MATERIALS.find((candidate) => candidate.id === book.material.kind) || MATERIALS[0];
  const foil = FOILS.find((candidate) => candidate.id === book.foil.preset);
  const foilName = foil && foil.id !== "custom" ? t(foil.label) : t("Custom foil");
  const prefix = { quarter: t("Quarter") + " ", half: t("Half") + " " }[book.material.binding] || "";
  return getLang() === "zh"
    ? `${prefix.trim()}${t(material.label)} \u00b7 ${foilName}`
    : `${prefix}${prefix ? material.label.toLowerCase() : material.label} \u00b7 ${foilName.toLowerCase()}`;
}

/** Collect every styled run in a book, for font preloading. */
export function coverFontRuns(book) {
  const runs = [];
  ["front", "spine", "back"].forEach((face) => {
    book[face]?.texts?.forEach((layer) => {
      if (!layer.show) return;
      runs.push({ font: layer.font, weight: layer.weight, italic: layer.italic, text: layerText(book, layer) });
    });
  });
  if (book.front?.motif?.key === "monogram") {
    runs.push({ font: "cormorant", weight: 500, text: (book.title || "A").slice(0, 1) });
  }
  if (book.front?.motif?.key === "seal") {
    runs.push({ font: "notoserifsc", weight: 700, text: [...(book.title || "A")][0] });
  }
  return runs;
}

/**
 * Validate and repair a stored or imported book. Returns null when the value
 * is not recognisably a book; otherwise fills anything missing with defaults.
 */
export function normalizeBook(value) {
  if (!value || typeof value !== "object" || typeof value.title !== "string") return null;
  const base = createBook({ presetId: value.preset || "ultramarine", title: value.title });
  const book = { ...base, ...deepClone(value) };
  book.version = SCHEMA_VERSION;
  book.id = typeof value.id === "string" && value.id ? value.id : base.id;
  book.material = { ...base.material, ...(value.material || {}) };
  book.foil = { ...base.foil, ...(value.foil || {}) };
  // A foil stored before iridescence existed keeps its plain look.
  if (value.foil && value.foil.iridescence === undefined) book.foil.iridescence = 0;
  if (!["polished", "matte", "brushed"].includes(book.foil.texture)) book.foil.texture = "polished";
  // Books made before stamping depth existed keep their flat boards.
  book.stamp = { relief: "flat", depth: 0.5, ...(value.stamp || {}) };
  if (!["deboss", "emboss", "flat"].includes(book.stamp.relief)) book.stamp.relief = "flat";
  book.stamp.depth = Math.min(1, Math.max(0, Number(book.stamp.depth) || 0));
  book.pattern = { ...base.pattern, ...(value.pattern || {}) };
  if (!value.pattern) book.pattern.key = "none";
  // Books made before these options existed keep the look they had.
  book.interior = { ...base.interior, labels: "en", ...(value.interior || {}) };
  const stored = value.details || {};
  book.details = {
    edge: { ...base.details.edge, ...(stored.edge || {}) },
    endpaper: { ...base.details.endpaper, ...(stored.endpaper || {}) },
    ribbon: { ...base.details.ribbon, ...(stored.ribbon || {}) },
    headband: { ...base.details.headband, ...(stored.headband || {}) },
    corners: { style: "none", ...(stored.corners || {}) },
    stitch: { ...base.details.stitch, show: false, ...(stored.stitch || {}) }
  };
  ["front", "back"].forEach((face) => {
    const stored = value[face] || {};
    book[face] = {
      ...base[face],
      ...stored,
      border: { ...base[face].border, ...(stored.border || {}) },
      ...(face === "front" ? { onlay: { ...base.front.onlay, ...(stored.onlay || {}) } } : {}),
      motif: { ...base[face].motif, ...(stored.motif || {}) },
      texts: Array.isArray(stored.texts) && stored.texts.length
        ? stored.texts.map((layer) => ({ ...base[face].texts[0], vertical: false, ...layer }))
        : base[face].texts
    };
  });
  book.spine = {
    ...base.spine,
    ...(value.spine || {}),
    label: { ...base.spine.label, show: false, ...(value.spine?.label || {}) },
    texts: Array.isArray(value.spine?.texts) && value.spine.texts.length
      ? value.spine.texts.map((layer) => ({ ...base.spine.texts[0], ...layer }))
      : base.spine.texts
  };
  book.pages = Array.isArray(value.pages)
    ? value.pages
      .filter((page) => page && typeof page === "object")
      .map((page) => createPage(page.type, { ...page, id: page.id || uid("pg") }))
    : base.pages;
  return book;
}
