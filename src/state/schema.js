// BookSpec: the single serialisable description of a user's book.
// Everything the 3D rig and the page painters need is derived from this.

import { deepClone, derivePalette, hashSeed, luminance, mixHex, uid } from "../util.js";
import { FOILS, LAYOUTS, getFoil, getPreset } from "../data/presets.js";

export const SCHEMA_VERSION = 1;

/** Standard trim: one shared hardcover format for every book. */
export const BOOK_FORMAT = Object.freeze({ width: 1.06, height: 1.59, depth: 0.27 });

export const PAGE_TYPES = [
  { id: "halftitle", label: "Half-title", note: "The title alone" },
  { id: "title", label: "Title page", note: "Title, subtitle, author" },
  { id: "dedication", label: "Dedication", note: "A short line, centred" },
  { id: "contents", label: "Contents", note: "Built from your chapters" },
  { id: "chapter", label: "Chapter opener", note: "Number, title, opening text" },
  { id: "body", label: "Body text", note: "Flows across pages" },
  { id: "quote", label: "Pull quote", note: "A large quotation" },
  { id: "plate", label: "Plate", note: "Image or ornament with caption" },
  { id: "colophon", label: "Colophon", note: "Notes on the edition" },
  { id: "blank", label: "Blank", note: "An empty page" }
];

const PAGE_DEFAULTS = {
  halftitle: () => ({}),
  title: () => ({ imprint: "" }),
  dedication: () => ({ text: "For those who keep making." }),
  contents: () => ({ heading: "Contents" }),
  chapter: () => ({ title: "A New Chapter", text: "" }),
  body: () => ({ heading: "", text: "" }),
  quote: () => ({ text: "A book is a place you can return to.", attribution: "" }),
  plate: () => ({ image: null, motif: "", caption: "" }),
  colophon: () => ({ text: "" }),
  blank: () => ({})
};

export function createPage(type, fields = {}) {
  const make = PAGE_DEFAULTS[type] || PAGE_DEFAULTS.blank;
  return { id: uid("pg"), type: PAGE_DEFAULTS[type] ? type : "blank", ...make(), ...fields };
}

const OPENING_TEXT = [
  "Every book begins as an empty room. There is a table, a window, and the particular quiet that comes before anything has been decided. This page is that room: replace these lines with your own.",
  "Write the way you would speak to one attentive reader. Leave the long explanations for later chapters, and let the first paragraphs do only what first paragraphs must — open the door, and make it easy to step inside.",
  "When the text grows longer than a single page it continues onto the next one by itself, so you can simply keep writing. Add chapters, quotations and plates from the page list, and drag them into the order you want."
].join("\n\n");

export function defaultPages() {
  return [
    createPage("halftitle"),
    createPage("blank"),
    createPage("title"),
    createPage("dedication"),
    createPage("contents"),
    createPage("blank"),
    createPage("chapter", { title: "The Empty Room", text: OPENING_TEXT }),
    createPage("quote", { text: "Make the thing you wish you had found on the shelf.", attribution: "" }),
    createPage("chapter", { title: "What Comes Next", text: "" }),
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
      roughness: foil.roughness ?? base.roughness
    };
  }
  const base = getFoil(foil);
  return { preset: base.id, color: base.color, metalness: base.metalness, roughness: base.roughness };
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
  if (layoutId !== "panel") {
    front.border.color = ink;
    front.texts.forEach((layer) => { layer.color = ink; });
  }
  front.motif.color = ink;
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
    emblem: preset.blank ? "none" : "ring",
    finish: "foil",
    color: ink,
    texts: [
      {
        id: "spine-title", source: "title", text: "", show: !preset.blank,
        font: "cormorant", size: 66, weight: 500, italic: false, tracking: 0.01, upper: false,
        orient: "vertical", y: 0.5, finish: "foil", color: ink
      },
      {
        id: "spine-author", source: "author", text: "", show: !preset.blank,
        font: "inter", size: 19, weight: 500, italic: false, tracking: 0.2, upper: true,
        orient: "vertical", y: 0.8, finish: "foil", color: ink
      },
      {
        id: "spine-mark", source: "custom", text: "I", show: !preset.blank,
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
    endpaper: { color: mixHex(color, "#efe6d4", 0.72), pattern: "grid" },
    ribbon: { show: true, color: mixHex(foil.color, color, 0.28) },
    headband: { color: mixHex(foil.color, "#c6a66d", 0.5) }
  };
}

function buildInterior() {
  return {
    bodyFont: "garamond",
    headingFont: "cormorant",
    paper: "cream",
    scale: 1,
    runningHead: true,
    folios: true,
    dropCap: true,
    justify: true
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
  book.material = { kind: preset.material.kind, color };
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
    pages: defaultPages()
  };
  applyPreset(book, presetId);
  return book;
}

export function duplicateBook(source) {
  const book = deepClone(source);
  book.id = uid("book");
  book.createdAt = Date.now();
  book.updatedAt = book.createdAt;
  book.title = `${source.title} (copy)`;
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

/** One-line description of the binding, e.g. "Ultramarine cloth · copper foil". */
export function bindingLabel(book) {
  const material = { cloth: "Bookcloth", linen: "Linen", leather: "Leather", paper: "Paper", velvet: "Velvet" }[book.material.kind] || "Cloth";
  const foil = FOILS.find((candidate) => candidate.id === book.foil.preset);
  return `${material} · ${foil && foil.id !== "custom" ? foil.label.toLowerCase() : "custom foil"}`;
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
  book.interior = { ...base.interior, ...(value.interior || {}) };
  book.details = {
    edge: { ...base.details.edge, ...(value.details?.edge || {}) },
    endpaper: { ...base.details.endpaper, ...(value.details?.endpaper || {}) },
    ribbon: { ...base.details.ribbon, ...(value.details?.ribbon || {}) },
    headband: { ...base.details.headband, ...(value.details?.headband || {}) }
  };
  ["front", "back"].forEach((face) => {
    const stored = value[face] || {};
    book[face] = {
      ...base[face],
      ...stored,
      border: { ...base[face].border, ...(stored.border || {}) },
      motif: { ...base[face].motif, ...(stored.motif || {}) },
      texts: Array.isArray(stored.texts) && stored.texts.length
        ? stored.texts.map((layer) => ({ ...base[face].texts[0], ...layer }))
        : base[face].texts
    };
  });
  book.spine = {
    ...base.spine,
    ...(value.spine || {}),
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
