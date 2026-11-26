// The studio workbench: every control that edits the open book.
// Edits go through the store; the engine repaints the 3D book from the same
// change event, so the model is always the thing you are looking at.

import { FONTS, getFont, onFontsLoaded } from "../data/fonts.js";
import {
  BINDING_STYLES,
  BORDERS,
  CORNER_STYLES,
  EDGE_STYLES,
  ENDPAPER_PATTERNS,
  FOILS,
  LAYOUTS,
  MATERIALS,
  MOTIFS,
  PATTERNS,
  PRESETS,
  PRESET_THEMES,
  SPINE_EMBLEMS,
  SPINE_STYLES,
  getFoil,
  getPreset
} from "../data/presets.js";
import { t } from "../i18n.js";
import { whenIdle } from "../motion.js";
import { perf } from "../perf.js";
import { addImage, bookImageIds, getImage, getImageBlob } from "../state/images.js";
import { parseManuscript } from "../state/manuscript.js";
import {
  PAGE_TYPES,
  TRIMS,
  CLASP_METALS,
  applyLayout,
  applyPreset,
  createPage,
  layerText,
  secondFoilFor,
  isStarterPage
} from "../state/schema.js";
import { PAGE_INKS, PAGE_SIZE, paintPage } from "../textures/pages.js";
import {
  PHOTO_ANGLES,
  PHOTO_ASPECTS,
  PHOTO_BACKDROPS,
  PHOTO_TEMPLATES,
  canvasToPngBlob,
  composePhotoCard,
  copyCardToClipboard,
  shareCardNative
} from "../photo.js";
import { buildPdf, encodeGif } from "../share.js";
import { patternMask } from "../textures/patterns.js";
import { PAPER_STOCKS, paintMaterialBase } from "../textures/surface.js";
import { deepClone, uid } from "../util.js";
import {
  colorField,
  group,
  row,
  segmented,
  select,
  slider,
  textArea,
  textField,
  tiles,
  toggle
} from "./controls.js";
import { ICONS, busy, downloadBlob, h, icon, pickFile, toast } from "./dom.js";
import { coverThumbKey, drawCoverThumb, drawMotifGlyph } from "./thumbs.js";

const $ = (selector) => document.querySelector(selector);

const TABS = [
  { id: "design", label: "Design", view: "front" },
  { id: "cover", label: "Cover", view: "front" },
  { id: "spine", label: "Spine", view: "spine" },
  { id: "back", label: "Back", view: "back" },
  { id: "details", label: "Details", view: "details" },
  { id: "structure", label: "Structure", view: "front" },
  { id: "pages", label: "Pages", view: "pages" }
];

const CLOTH_COLORS = [
  "#182a43", "#1537a1", "#24344d", "#78a7bd", "#1f4033", "#4e6248", "#5d6b3a", "#afc400", "#cdbf9f", "#d6c8ad",
  "#b9ae98", "#c24d24", "#c83222", "#9e201b", "#da3b2f", "#5a1a1c", "#4a2046", "#3c4a45", "#17181b", "#efe8da"
];
const INK_COLORS = ["#f3ece0", "#1d1813", "#c6532f", "#b8892f", "#2f4a3c", "#1f3a6b", "#7a2a34"];
const EDGE_COLORS = ["#d9b25f", "#c9ccd1", "#c6532f", "#1f3a6b", "#2f4a3c", "#17181b", "#e7a9b4"];
const LABEL_COLORS = ["#6f1d2a", "#17181b", "#1f4033", "#182a43", "#5a3a22", "#efe6d4", "#b8892f"];
const THREAD_COLORS = ["#f3ece0", "#17181b", "#b8892f", "#c6532f", "#1f3a6b", "#7a2a34"];
const ENDPAPER_COLORS = ["#efe6d4", "#e3d9c4", "#d9c7b2", "#c9d6d2", "#d7c7d0", "#2a2622", "#b9482f", "#30475e"];

const SOURCES = [
  { id: "title", label: "Book title" },
  { id: "subtitle", label: "Subtitle" },
  { id: "author", label: "Author" },
  { id: "series", label: "Series" },
  { id: "custom", label: "Custom text" }
];
const FINISHES = [
  { id: "foil", label: "Foil" },
  { id: "foil2", label: "Second foil" },
  { id: "ink", label: "Print" },
  { id: "blind", label: "Blind" }
];
// The second foil is stored as finish "foil" with `leaf: "second"`, so every
// painter that knows foil keeps working; the control shows it as a finish.
const finishOf = (element) => (element.finish === "foil" && element.leaf === "second" ? "foil2" : element.finish);
const LAYER_NAMES = {
  series: "Series line", title: "Title", subtitle: "Subtitle", author: "Author",
  "spine-title": "Title", "spine-author": "Author", "spine-mark": "Head mark",
  "back-blurb": "Blurb", "back-title": "Title", "back-author": "Author", "back-imprint": "Imprint"
};
const PAGE_LABEL = Object.fromEntries(PAGE_TYPES.map((type) => [type.id, type.label]));
const pageTypeLabel = (type) => t(PAGE_LABEL[type] || "Page");

const percent = (value) => `${Math.round(value * 100)}%`;

export function createStudioUi({ store, engine, audio }) {
  const panel = $("#studio");
  const tabsElement = $("#studio-tabs");
  const body = $("#studio-body");
  const titleElement = $("#studio-title");
  const saveStatus = $("#save-status");
  const undoButton = $("#undo");
  const redoButton = $("#redo");
  const closeButton = $("#close-detail");
  const shareButton = $("#studio-share");
  const shareMenu = $("#studio-share-menu");
  const stageBar = $("#stage-bar");
  const manuscriptInput = $("#manuscript-file");
  const readerBar = $("#reader-bar");
  const previousPage = $("#previous-page");
  const nextPage = $("#next-page");
  const pageLabel = $("#page-label");
  const pageCounter = $("#page-counter");
  const toggleBook = $("#toggle-book");
  const imageInput = $("#image-file");

  let bookId = null;
  let tab = "design";
  let selectedPageId = null;
  let studioPresetTheme = "all";
  const openLayers = new Set();

  // Each tab is built once and then shown or hidden. A pane is rebuilt only
  // when something it displays may have changed behind its back.
  const panes = new Map(); // tab id -> { id, element, stale, scroll, thumbs }
  let currentPane = null;
  let buildingPane = null;

  const book = () => store.get(bookId);

  const markStale = (except = null) => panes.forEach((pane) => {
    if (pane.id !== except) pane.stale = true;
  });

  /** Apply an edit to the open book. */
  function edit(mutate, dirty, { key = null, rerender = false } = {}) {
    if (!bookId) return;
    store.update(bookId, mutate, { dirty, key });
    if (rerender) {
      markStale(tab);
      renderBody();
    } else if (dirty.includes("meta") || dirty.includes("all")) {
      // Shared words appear in the other tabs' previews.
      markStale(tab);
    }
    refreshThumbsSoon();
  }

  async function chooseBookImage(button) {
    const file = await pickFile(imageInput);
    if (!file) return null;
    const done = busy(button);
    try {
      const id = await addImage(file);
      if (!id) toast(t("That image could not be read."));
      return id;
    } catch (error) {
      toast(t("Could not save the image. Check your browser storage and try again."));
      return null;
    } finally {
      done();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Header, tabs                                                       */
  /* ---------------------------------------------------------------- */

  // One underline slides between the tabs, so the tabs are built once (and
  // again only when the language changes) and then just marked.
  const tabIndicator = h("span", { class: "tabs__indicator", "aria-hidden": "true" });

  function renderTabs(rebuild = false) {
    if (rebuild || !tabsElement.querySelector(".tab")) {
      tabsElement.replaceChildren(tabIndicator, ...TABS.map((entry) => h("button", {
        class: "tab",
        type: "button",
        role: "tab",
        id: `tab-${entry.id}`,
        text: t(entry.label),
        onclick: () => setTab(entry.id)
      })));
    }
    tabsElement.querySelectorAll(".tab").forEach((button) => {
      const selected = button.id === `tab-${tab}`;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    body.setAttribute("aria-labelledby", `tab-${tab}`);
    // Place indicator synchronously when tabs are already laid out (zero 1-frame lag).
    placeTabIndicator();
    requestAnimationFrame(() => {
      placeTabIndicator();
      keepTabInView();
      updateTabEdges();
    });
  }

  function placeTabIndicator() {
    const selected = tabsElement.querySelector(".tab[aria-selected='true']");
    if (!selected || !selected.offsetWidth) return;
    tabsElement.style.setProperty("--tab-x", `${selected.offsetLeft + 6}px`);
    tabsElement.style.setProperty("--tab-w", `${Math.max(0, selected.offsetWidth - 12)}px`);
    if (!tabsElement.classList.contains("has-indicator")) {
      tabsElement.classList.add("has-indicator");
      // The first placement is instant; later ones slide.
      requestAnimationFrame(() => tabsElement.classList.add("is-placed"));
    }
  }
  new ResizeObserver(() => {
    placeTabIndicator();
    updateTabEdges();
  }).observe(tabsElement);

  // When the tabs do not fit (English in a narrow panel) the strip scrolls:
  // the side with more fades out, a mouse wheel scrolls it sideways, and the
  // open tab is always brought into view.
  const tabMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  function updateTabEdges() {
    const over = tabsElement.scrollWidth > tabsElement.clientWidth + 1;
    tabsElement.classList.toggle("fade-start", over && tabsElement.scrollLeft > 2);
    tabsElement.classList.toggle("fade-end", over && tabsElement.scrollLeft + tabsElement.clientWidth < tabsElement.scrollWidth - 2);
  }

  function keepTabInView() {
    const selected = tabsElement.querySelector(".tab[aria-selected='true']");
    if (!selected || tabsElement.scrollWidth <= tabsElement.clientWidth + 1) return;
    const margin = 36;
    const start = selected.offsetLeft - margin;
    const end = selected.offsetLeft + selected.offsetWidth + margin;
    const behavior = tabMotion.matches ? "auto" : "smooth";
    if (start < tabsElement.scrollLeft) tabsElement.scrollTo({ left: start, behavior });
    else if (end > tabsElement.scrollLeft + tabsElement.clientWidth) tabsElement.scrollTo({ left: end - tabsElement.clientWidth, behavior });
  }

  tabsElement.addEventListener("scroll", updateTabEdges, { passive: true });
  tabsElement.addEventListener("wheel", (event) => {
    if (tabsElement.scrollWidth <= tabsElement.clientWidth + 1 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    tabsElement.scrollLeft += event.deltaY;
  }, { passive: false });

  function setTab(next, { focusView = true } = {}) {
    setShareMenu(false);
    if (next === tab && currentPane) {
      if (focusView) applyTabView();
      return;
    }
    const started = performance.now();
    // The new tab's content comes in from the side it lies on.
    const from = TABS.findIndex((entry) => entry.id === tab);
    const to = TABS.findIndex((entry) => entry.id === next);
    body.dataset.direction = from < 0 || from === to ? "" : to > from ? "forward" : "back";
    tab = next;
    renderTabs();
    showPane();
    perf.mark("tab", performance.now() - started);
    if (focusView) applyTabView();
  }

  function applyTabView() {
    const entry = TABS.find((candidate) => candidate.id === tab);
    if (tab === "pages") {
      engine.setReadingOpen(true);
    } else if (engine.pageState.open) {
      engine.setReadingOpen(false);
    }
    engine.focusView(entry.view);
  }

  function updateHeader() {
    const current = book();
    if (!current) return;
    titleElement.textContent = current.title;
    undoButton.disabled = !store.canUndo(bookId);
    redoButton.disabled = !store.canRedo(bookId);
  }

  /* ---------------------------------------------------------------- */
  /* Thumbnails                                                         */
  /* ---------------------------------------------------------------- */

  // A thumbnail is painted when its tile scrolls into view, a few per frame,
  // and its picture is kept under a key made of everything it shows: the
  // same cover is never painted twice, however often the panel is rebuilt.
  const thumbCache = new Map(); // key -> canvas
  const THUMB_CACHE_LIMIT = 220;
  const thumbQueue = [];
  let thumbPumping = false;
  let thumbTimer = 0;

  const thumbObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const thumb = entry.target.thumb;
      if (!thumb) return;
      thumb.visible = entry.isIntersecting;
      if (thumb.visible) requestThumb(thumb);
    });
  }, { root: body, rootMargin: "160px 0px" });

  /** Register `canvas` as a thumbnail. `key()` names its content; `paint(canvas)` draws it. */
  function thumb(canvas, key, paint) {
    const entry = { canvas, key, paint, shown: null, visible: false, queued: false };
    canvas.thumb = entry;
    // A rebuilt tab (after a preset, say) shows each thumbnail's picture at
    // once: the cached one if its content is known, otherwise what the same
    // slot showed before, until the new one is painted. Never a blank tile.
    // (The previous picture needs no key: working out twenty keys would cost
    // the click that rebuilt the tab; the pump checks them a frame later.)
    const slot = buildingPane?.thumbs.length ?? -1;
    const before = buildingPane?.previous?.[slot];
    let source = before && before.width === canvas.width && before.height === canvas.height ? before : null;
    if (!source && buildingPane?.previous && thumbCache.size) {
      const name = key();
      source = thumbCache.get(name) || null;
      if (source) entry.shown = name;
    }
    if (source) canvas.getContext("2d").drawImage(source, 0, 0);
    else canvas.classList.add("is-pending");
    buildingPane?.thumbs.push(entry);
    return canvas;
  }

  function requestThumb(entry) {
    if (entry.queued) return;
    entry.queued = true;
    thumbQueue.push(entry);
    if (thumbPumping) return;
    thumbPumping = true;
    requestAnimationFrame(pumpThumbs);
  }

  function pumpThumbs() {
    const started = performance.now();
    while (thumbQueue.length && performance.now() - started < 6) {
      const entry = thumbQueue.shift();
      entry.queued = false;
      const { canvas } = entry;
      if (!canvas.isConnected) continue;
      const key = entry.key();
      if (key === entry.shown) continue;
      const cached = thumbCache.get(key);
      if (cached) {
        const ctx = canvas.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(cached, 0, 0);
        thumbCache.delete(key);
        thumbCache.set(key, cached);
      } else {
        entry.paint(canvas);
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        copy.getContext("2d").drawImage(canvas, 0, 0);
        thumbCache.set(key, copy);
        if (thumbCache.size > THUMB_CACHE_LIMIT) {
          const oldest = thumbCache.keys().next().value;
          const evicted = thumbCache.get(oldest);
          if (evicted) { evicted.width = 0; evicted.height = 0; }
          thumbCache.delete(oldest);
        }
      }
      entry.shown = key;
      if (canvas.classList.contains("is-pending")) {
        // The first picture fades in over its placeholder.
        canvas.classList.remove("is-pending");
        canvas.classList.add("is-fresh");
      }
    }
    if (thumbQueue.length) requestAnimationFrame(pumpThumbs);
    else thumbPumping = false;
  }

  /** Re-check the thumbnails on screen (their keys decide whether they repaint). */
  function refreshThumbs() {
    currentPane?.thumbs.forEach((entry) => {
      if (entry.visible) requestThumb(entry);
    });
  }

  /** After an edit: wait for a pause, so a drag is not competing with thumbnails. */
  function refreshThumbsSoon() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(refreshThumbs, 220);
  }

  /** The book without its pages: all a cover preview needs, and cheap to copy. */
  const coverSample = () => deepClone({ ...book(), pages: [] });

  /** Prefetch the grain of the book `make(value)` when a tile is hovered or pressed. */
  function aheadOfClick(container, make) {
    let last = null;
    const guess = (event) => {
      const value = event.target.closest?.("[data-value]")?.dataset.value;
      if (!value || value === last) return;
      last = value;
      engine.prefetchGrain(make(value));
    };
    container.addEventListener("pointerover", guess);
    container.addEventListener("pointerdown", guess);
  }

  /** A cover tile. `make()` returns the book the tile should show. */
  function coverThumb(make) {
    const canvas = h("canvas", { class: "tile__art", width: 132, height: 198 });
    let sample = null;
    return thumb(canvas, () => {
      sample = make();
      return `cover|${coverThumbKey(sample)}`;
    }, () => drawCoverThumb(canvas, sample, refreshThumbsSoon));
  }

  /** A thumbnail for a select's popover list: painted by the same pump once it is shown. */
  function listThumb(canvas) {
    requestThumb(canvas.thumb);
    return canvas;
  }

  /** A small outline of an onlay shape, for the Shape list. */
  function shapeGlyph(shape) {
    const canvas = h("canvas", { width: 60, height: 60 });
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = getComputedStyle(body).getPropertyValue("--ink-soft").trim() || "#5e5346";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (shape === "oval") ctx.ellipse(30, 30, 17, 23, 0, 0, Math.PI * 2);
    else if (shape === "diamond") {
      ctx.moveTo(30, 6); ctx.lineTo(48, 30); ctx.lineTo(30, 54); ctx.lineTo(12, 30); ctx.closePath();
    } else if (shape === "arch") {
      ctx.moveTo(13, 54); ctx.lineTo(13, 24); ctx.arc(30, 24, 17, Math.PI, 0); ctx.lineTo(47, 54); ctx.closePath();
    } else if (shape === "shield") {
      ctx.moveTo(13, 9); ctx.lineTo(47, 9); ctx.lineTo(47, 30);
      ctx.bezierCurveTo(47, 44, 38, 50, 30, 54);
      ctx.bezierCurveTo(22, 50, 13, 44, 13, 30); ctx.closePath();
    } else if (shape === "octagon") {
      ctx.moveTo(22, 8); ctx.lineTo(38, 8); ctx.lineTo(48, 18); ctx.lineTo(48, 42);
      ctx.lineTo(38, 52); ctx.lineTo(22, 52); ctx.lineTo(12, 42); ctx.lineTo(12, 18); ctx.closePath();
    } else if (shape === "rounded") ctx.roundRect(13, 7, 34, 46, 9);
    else ctx.rect(13, 7, 34, 46);
    ctx.stroke();
    return canvas;
  }

  const glyphInk = () => getComputedStyle(body).getPropertyValue("--ink-soft").trim() || "#231d17";
  const glyphCanvas = () => h("canvas", { class: "tile__glyph", width: 96, height: 96 });

  function motifThumb(key) {
    const canvas = glyphCanvas();
    let ink = "";
    return thumb(canvas, () => {
      ink = glyphInk();
      return `motif|${key}|${ink}`;
    }, () => drawMotifGlyph(canvas, key, ink));
  }

  function patternThumb(key) {
    const canvas = glyphCanvas();
    let ink = "";
    return thumb(canvas, () => {
      ink = glyphInk();
      return `pattern|${key}|${ink}`;
    }, () => {
      const size = canvas.width;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      if (key === "none") {
        drawMotifGlyph(canvas, "none", ink);
        return;
      }
      const mask = patternMask(key, size, size, { width: 150, height: 150 }, { unit: 46, lineWidth: 2, seed: 3 });
      // Some endpaper papers are painted, not masked: no glyph for those.
      if (!mask) {
        drawMotifGlyph(canvas, "none", ink);
        return;
      }
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = ink;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "source-over";
    });
  }

  /** A swatch of a covering material in the book's cloth colour. */
  function materialThumb(kind) {
    const canvas = glyphCanvas();
    return thumb(canvas, () => `material|${kind}|${book().material.color}`, () => {
      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      paintMaterialBase(ctx, canvas.width, canvas.height, book().material.color, kind, 5);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Reusable editors                                                   */
  /* ---------------------------------------------------------------- */

  function finishControls(target, dirty, keyPrefix) {
    const colour = h("div");
    const paintColour = () => {
      colour.replaceChildren(target().finish === "ink" ? colorField({
        label: "Print colour",
        value: target().color,
        swatches: INK_COLORS,
        onInput: (value) => edit(() => { target().color = value; }, dirty, { key: `${keyPrefix}-color` })
      }) : "");
    };
    paintColour();
    return [
      segmented({
        label: "Finish",
        value: finishOf(target()),
        options: FINISHES,
        onChange: (value) => {
          edit(() => {
            const element = target();
            element.finish = value === "foil2" ? "foil" : value;
            element.leaf = value === "foil2" ? "second" : "main";
          }, dirty);
          paintColour();
        }
      }),
      colour
    ];
  }

  function motifEditor(face, extraOptions = []) {
    const motif = () => book()[face].motif;
    const options = [...MOTIFS.slice(0, 1), ...extraOptions, ...MOTIFS.slice(1)];
    return [
      tiles({
        label: "Ornament",
        className: "tiles--motif",
        value: motif().key,
        options,
        render: (option) => motifThumb(option.id),
        onChange: (value) => edit(() => { motif().key = value; }, [face])
      }),
      row(
        slider({
          label: "Size", value: motif().scale, min: 0.25, max: 2.2, step: 0.01, format: percent,
          onInput: (value) => edit(() => { motif().scale = value; }, [face], { key: `${face}-motif-scale` })
        }),
        slider({
          label: "Across", value: motif().x, min: 0.1, max: 0.9, step: 0.005, detent: 0.5, format: percent,
          onInput: (value) => edit(() => { motif().x = value; }, [face], { key: `${face}-motif-x` })
        }),
        slider({
          label: "Down", value: motif().y, min: 0.08, max: 0.92, step: 0.005, format: percent,
          onInput: (value) => edit(() => { motif().y = value; }, [face], { key: `${face}-motif-y` })
        })
      ),
      ...finishControls(motif, [face], `${face}-motif`)
    ];
  }

  function borderEditor(face) {
    const border = () => book()[face].border;
    const options = face === "back" ? BORDERS.filter((entry) => entry.id !== "panel" && entry.id !== "slip") : BORDERS;
    return [
      row(
        select({
          label: "Frame", value: border().style, options,
          // The corner of a small cover, where the frame shows best.
          preview: (option) => {
            const canvas = listThumb(coverThumb(() => {
              const sample = coverSample();
              sample.front.border = { ...sample[face].border, style: option.id };
              return sample;
            }));
            canvas.classList.add("is-corner");
            return canvas;
          },
          onChange: (value) => edit(() => {
            border().style = value;
            if (value === "panel" || value === "slip") { border().finish = "ink"; border().color = "#f1eadf"; }
          }, [face], { rerender: true })
        }),
        slider({
          label: "Inset", value: border().inset, min: 0.025, max: 0.14, step: 0.001,
          format: (value) => `${Math.round(value * 148)} mm`,
          onInput: (value) => edit(() => { border().inset = value; }, [face], { key: `${face}-border-inset` })
        })
      ),
      ...finishControls(border, [face], `${face}-border`)
    ];
  }

  /** One smoothly animated collapsible lettering layer. */
  function layerEditor(face, layerId) {
    const layer = () => book()[face].texts.find((candidate) => candidate.id === layerId);
    const current = layer();
    if (!current) return null;
    const dirty = [face];
    const key = (suffix) => `${face}-${layerId}-${suffix}`;
    const isSpine = face === "spine";
    const removable = layerId.startsWith("extra-");
    const font = getFont(current.font);
    let isOpen = openLayers.has(layerId);

    const preview = h("span", { class: "layer__preview" });
    const details = h("div", { class: "layer", dataset: { open: String(isOpen) } });
    const refreshSummary = () => {
      const value = layerText(book(), layer());
      preview.textContent = value || t("Empty");
      preview.dataset.empty = String(!value);
      details.dataset.hidden = String(!layer().show);
    };
    refreshSummary();

    const customText = h("div");
    const paintCustom = () => {
      const source = layer().source;
      customText.replaceChildren(source === "custom" ? (layerId === "back-blurb"
        ? textArea({
          label: "Text", value: layer().text, placeholder: "A few lines about the book…",
          onInput: (value) => { edit(() => { layer().text = value; }, dirty, { key: key("text") }); refreshSummary(); }
        })
        : textField({
          label: "Text", value: layer().text, placeholder: "Type a line",
          onInput: (value) => { edit(() => { layer().text = value; }, dirty, { key: key("text") }); refreshSummary(); }
        })) : "");
    };
    paintCustom();

    const placement = isSpine
      ? [
        segmented({
          label: "Direction", value: current.orient,
          options: [{ id: "vertical", label: "Along spine" }, { id: "horizontal", label: "Across" }],
          onChange: (value) => edit(() => { layer().orient = value; }, dirty)
        }),
        slider({
          label: "Position", value: current.y, min: 0.05, max: 0.95, step: 0.005, format: percent,
          onInput: (value) => edit(() => { layer().y = value; }, dirty, { key: key("y") })
        })
      ]
      : [
        segmented({
          label: "Alignment", value: current.align,
          options: [{ id: "left", label: "Left" }, { id: "center", label: "Centre" }, { id: "right", label: "Right" }],
          onChange: (value) => edit(() => { layer().align = value; }, dirty)
        }),
        row(
          slider({
            label: "Across", value: current.x, min: 0.04, max: 0.96, step: 0.005, detent: 0.5, format: percent,
            onInput: (value) => edit(() => { layer().x = value; }, dirty, { key: key("x") })
          }),
          slider({
            label: "Down", value: current.y, min: 0.04, max: 0.96, step: 0.005, detent: 0.5, format: percent,
            onInput: (value) => edit(() => { layer().y = value; }, dirty, { key: key("y") })
          }),
          slider({
            label: "Measure", value: current.width, min: 0.2, max: 0.92, step: 0.01, format: percent,
            onInput: (value) => edit(() => { layer().width = value; }, dirty, { key: key("width") })
          })
        )
      ];

    const summaryButton = h("button", {
      type: "button",
      class: "layer__summary",
      "aria-expanded": String(isOpen)
    },
      h("span", { class: "layer__name", text: t(LAYER_NAMES[layerId] || "Line") }),
      preview,
      icon(ICONS.chevron, "layer__chevron")
    );
    const collapse = h("div", { class: "layer__collapse", inert: !isOpen },
      h("div", { class: "layer__body" },
        toggle({
          label: "Show on the cover", value: current.show,
          onChange: (value) => { edit(() => { layer().show = value; }, dirty); refreshSummary(); }
        }),
        select({
          label: "Words", value: current.source, options: SOURCES,
          onChange: (value) => {
            edit(() => { layer().source = value; }, dirty);
            paintCustom();
            refreshSummary();
          }
        }),
        customText,
        row(
          select({
            label: "Typeface", value: current.font, options: FONTS, face: (option) => option.stack,
            onChange: (value) => edit(() => { layer().font = value; }, dirty, { rerender: true })
          }),
          select({
            label: "Weight", value: String(current.weight),
            options: font.weights.map((weight) => ({
              id: String(weight),
              label: { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold" }[weight] || String(weight)
            })),
            onChange: (value) => edit(() => { layer().weight = Number(value); }, dirty)
          })
        ),
        row(
          slider({
            label: "Size", value: current.size, min: 10, max: isSpine ? 110 : 150, step: 1,
            format: (value) => `${Math.round(value)} pt`,
            onInput: (value) => edit(() => { layer().size = value; }, dirty, { key: key("size") })
          }),
          slider({
            label: "Tracking", value: current.tracking, min: -0.04, max: 0.5, step: 0.005, detent: 0,
            format: (value) => `${Math.round(value * 1000)}`,
            onInput: (value) => edit(() => { layer().tracking = value; }, dirty, { key: key("tracking") })
          })
        ),
        h("div", { class: "toggles" },
          toggle({
            label: "Capitals", value: current.upper,
            onChange: (value) => { edit(() => { layer().upper = value; }, dirty); refreshSummary(); }
          }),
          font.italic ? toggle({
            label: "Italic", value: current.italic,
            onChange: (value) => edit(() => { layer().italic = value; }, dirty)
          }) : null,
          isSpine ? null : toggle({
            label: "Vertical", value: Boolean(current.vertical),
            onChange: (value) => edit(() => { layer().vertical = value; }, dirty)
          })
        ),
        placement,
        ...finishControls(layer, dirty, `${face}-${layerId}`),
        removable ? h("button", {
          class: "link-button link-button--danger",
          type: "button",
          text: t("Remove this line"),
          style: { justifySelf: "start" },
          onclick: () => edit(() => {
            const texts = book()[face].texts;
            texts.splice(texts.findIndex((candidate) => candidate.id === layerId), 1);
          }, dirty, { rerender: true })
        }) : null
      )
    );
    summaryButton.addEventListener("click", () => {
      isOpen = !isOpen;
      if (isOpen) openLayers.add(layerId);
      else openLayers.delete(layerId);
      details.dataset.open = String(isOpen);
      summaryButton.setAttribute("aria-expanded", String(isOpen));
      collapse.inert = !isOpen;
      audio.playCue("tap");
    });

    details.append(summaryButton, collapse);
    return details;
  }

  function letteringGroup(face, hint) {
    const current = book();
    const addLine = () => {
      const id = `extra-${uid("t")}`;
      openLayers.add(id);
      edit(() => {
        const texts = book()[face].texts;
        const template = texts.find((layer) => layer.id === "author" || layer.id === "back-author") || texts[0];
        texts.push({
          ...deepClone(template),
          id,
          source: "custom",
          text: t("A new line"),
          show: true,
          vertical: false,
          y: 0.5,
          x: template.align === "left" ? template.x : 0.5
        });
      }, [face], { rerender: true });
    };
    return group("Lettering", hint,
      h("div", {}, current[face].texts.map((layer) => layerEditor(face, layer.id))),
      face !== "spine" ? h("button", {
        class: "link-button", type: "button", text: t("Add a line"), style: { justifySelf: "start" }, onclick: addLine
      }) : null
    );
  }

  /* ---------------------------------------------------------------- */
  /* Tabs                                                               */
  /* ---------------------------------------------------------------- */

  function designTab() {
    const current = book();
    const sharedField = (property, label, placeholder, display = false) => textField({
      label, placeholder, display, value: current[property],
      onInput: (value) => {
        edit(() => { book()[property] = property === "title" ? value || t("Untitled") : value; }, ["meta"], { key: `meta-${property}` });
        updateHeader();
      }
    });

    const presetTiles = tiles({
      label: "Binding preset",
      className: "tiles--presets",
      value: current.preset,
      options: PRESETS,
      render: (option) => h("span", { class: "tile__frame" }, coverThumb(() => applyPreset(coverSample(), option.id))),
      onChange: (value) => {
        audio.playCue("select", { gain: 0.5 });
        edit(() => { applyPreset(book(), value); }, ["all"], { rerender: true });
      }
    });
    presetTiles.querySelectorAll("[role='radio']").forEach((button) => {
      const p = getPreset(button.dataset.value);
      button.dataset.theme = p.theme || "gallery";
      button.dataset.rounded = String(p.structure?.corners === "rounded");
    });

    const themeNote = h("p", { class: "preset-theme-note preset-theme-note--studio" });
    const themeBar = h("div", {
      class: "preset-themes preset-themes--studio",
      role: "tablist",
      "aria-label": t("Binding themes")
    });
    const applyStudioTheme = (themeId) => {
      studioPresetTheme = themeId;
      const entry = PRESET_THEMES.find((item) => item.id === themeId) || PRESET_THEMES[0];
      const filtered = entry.id !== "all";
      presetTiles.dataset.filtered = String(filtered);
      themeNote.textContent = t(entry.subtitle);
      themeBar.querySelectorAll("[role='tab']").forEach((btn) => {
        const selected = btn.dataset.theme === entry.id;
        btn.setAttribute("aria-selected", String(selected));
        btn.tabIndex = selected ? 0 : -1;
      });
      presetTiles.querySelectorAll("[role='radio']").forEach((btn) => {
        btn.hidden = filtered && btn.dataset.theme !== entry.id;
      });
      refreshThumbs();
    };
    themeBar.replaceChildren(...PRESET_THEMES.map((entry) => h("button", {
      type: "button",
      role: "tab",
      class: "preset-theme-btn",
      dataset: { theme: entry.id },
      text: t(entry.label),
      onclick: () => {
        audio.playCue("tap");
        applyStudioTheme(entry.id);
      }
    })));
    applyStudioTheme(studioPresetTheme);

    const activePreset = getPreset(current.preset);
    const activeFoilColor = activePreset.foil && typeof activePreset.foil === "object"
      ? (activePreset.foil.color || getFoil(activePreset.foil.preset).color)
      : getFoil(activePreset.foil).color;
    const activeFoilObj = typeof activePreset.foil === "object"
      ? getFoil(activePreset.foil.preset)
      : getFoil(activePreset.foil);
    const activeFoilMetal = (activePreset.foil?.metalness ?? activeFoilObj.metalness) > 0.5;
    const matDot = h("i", { class: "preset-swatch" });
    matDot.style.setProperty("--swatch", activePreset.material.color);
    const foilDot = h("i", { class: `preset-swatch${activeFoilMetal ? " preset-swatch--metal" : ""}` });
    foilDot.style.setProperty("--swatch", activeFoilColor);
    const presetSummary = h("div", { class: "preset-summary preset-summary--studio" },
      h("div", { class: "preset-summary__line" },
        h("span", { class: "preset-swatches", "aria-hidden": "true" }, matDot, foilDot),
        h("p", { class: "microcopy", text: t(activePreset.note) })
      ),
      activePreset.tags?.length
        ? h("div", { class: "preset-tags" }, ...activePreset.tags.map((tag) => h("span", { class: "preset-tag", text: t(tag) })))
        : null
    );

    const foilSwatches = FOILS.filter((foil) => foil.id !== "custom").map((foil) => ({
      color: foil.color, label: foil.label, value: foil.id, metal: foil.metalness > 0.5
    }));
    const pattern = () => book().pattern;

    // Material swatches are painted with the same code as the boards.
    const materialTiles = tiles({
      label: "Covering",
      className: "tiles--motif tiles--material",
      value: current.material.kind,
      options: MATERIALS,
      render: (option) => materialThumb(option.id),
      onChange: (value) => edit(() => { book().material.kind = value; }, ["material"])
    });
    // The pointer resting on a tile (or a finger coming down on it) is a
    // good guess at the next click: its grain is painted ahead, off the main
    // thread, so the board only has to copy it.
    aheadOfClick(presetTiles, (id) => applyPreset(coverSample(), id));
    aheadOfClick(materialTiles, (id) => {
      const sample = coverSample();
      sample.material.kind = id;
      return sample;
    });

    return [
      group("The book", "These words are shared by the cover, spine, back and title page.",
        sharedField("title", "Title", "Untitled", true),
        sharedField("subtitle", "Subtitle", "Optional"),
        row(sharedField("author", "Author", "Your name"), sharedField("series", "Series", "Optional"))
      ),
      group("Bindings", "A complete starting point: cloth, foil, layout and ornament. Your words and pages are kept.",
        themeBar,
        themeNote,
        presetTiles,
        presetSummary
      ),
      group("Material", null,
        materialTiles,
        colorField({
          label: "Colour", value: current.material.color, swatches: CLOTH_COLORS,
          onInput: (value) => edit(() => {
            const target = book();
            target.material.color = value;
            // A hand-picked colour leaves the preset's room behind.
            target.palette = null;
          }, ["material"], { key: "material-color" })
        }),
        segmented({
          label: "Binding", value: current.material.binding || "full", options: BINDING_STYLES,
          onChange: (value) => edit(() => { book().material.binding = value; }, ["material"], { rerender: true })
        }),
        current.material.binding && current.material.binding !== "full" ? colorField({
          label: current.material.binding === "half" ? "Spine & corners" : "Spine",
          value: current.material.second, swatches: CLOTH_COLORS,
          onInput: (value) => edit(() => { book().material.second = value; }, ["material"], { key: "material-second" })
        }) : null
      ),
      group("Pattern", "An all-over pattern on the boards: stamped in foil, printed, or pressed blind into the covering.",
        tiles({
          label: "Pattern",
          className: "tiles--motif",
          value: current.pattern.key,
          options: PATTERNS,
          render: (option) => patternThumb(option.id),
          onChange: (value) => edit(() => { pattern().key = value; }, ["material"], { rerender: true })
        }),
        current.pattern.key !== "none" ? [
          row(
            slider({
              label: "Size", value: current.pattern.scale, min: 0.5, max: 2.4, step: 0.01, format: percent,
              onInput: (value) => edit(() => { pattern().scale = value; }, ["material"], { key: "pattern-scale" })
            }),
            slider({
              label: "Strength", value: current.pattern.opacity ?? 0.6, min: 0.1, max: 1, step: 0.01, format: percent,
              onInput: (value) => edit(() => { pattern().opacity = value; }, ["material"], { key: "pattern-opacity" })
            })
          ),
          ...finishControls(pattern, ["material"], "pattern"),
          toggle({
            label: "Carry across the spine", value: Boolean(current.pattern.spine),
            onChange: (value) => edit(() => { pattern().spine = value; }, ["material"])
          })
        ] : null
      ),
      group("Foil", "Used for everything stamped in foil on the boards and spine. Give any element the finish Second foil to stamp it in a second colour.",
        colorField({
          label: "Foil", value: current.foil.preset, swatches: foilSwatches,
          onInput: (value, custom) => edit(() => {
            const target = book();
            if (custom) {
              target.foil = { ...target.foil, preset: "custom", color: value };
            } else {
              const foil = getFoil(value);
              target.foil = {
                preset: foil.id, color: foil.color, metalness: foil.metalness, roughness: foil.roughness,
                iridescence: foil.iridescence || 0, texture: target.foil.texture || "polished",
                second: target.foil.second || secondFoilFor(foil.id)
              };
            }
          }, ["foil"], { key: custom ? "foil-color" : null, rerender: !custom })
        }),
        row(
          slider({
            label: "Metal", value: current.foil.metalness, min: 0, max: 1, step: 0.01, format: percent,
            onInput: (value) => edit(() => { book().foil.metalness = value; }, ["foil"], { key: "foil-metal" })
          }),
          slider({
            label: "Polish", value: 1 - current.foil.roughness, min: 0.2, max: 0.95, step: 0.01, format: percent,
            onInput: (value) => edit(() => { book().foil.roughness = 1 - value; }, ["foil"], { key: "foil-rough" })
          }),
          slider({
            label: "Iridescence", value: current.foil.iridescence || 0, min: 0, max: 1, step: 0.01, format: percent,
            onInput: (value) => edit(() => { book().foil.iridescence = value; }, ["foil"], { key: "foil-iridescence" })
          })
        ),
        segmented({
          label: "Leaf finish", value: current.foil.texture || "polished",
          options: [
            { id: "polished", label: "Polished" },
            { id: "matte", label: "Matte" },
            { id: "brushed", label: "Brushed" }
          ],
          onChange: (value) => edit(() => { book().foil.texture = value; }, ["foil"])
        }),
        colorField({
          label: "Second foil", value: current.foil.second,
          swatches: FOILS.filter((foil) => foil.id !== "custom" && foil.metalness > 0.3).map((foil) => ({
            color: foil.color, label: foil.label, value: foil.color, metal: true
          })),
          onInput: (value) => edit(() => { book().foil.second = value; }, ["foil"], { key: "foil-second" })
        })
      ),
      group("Stamping", "How deep the die presses foil and blind stamps into the boards. Print lies flat.",
        segmented({
          label: "Impression", value: current.stamp.relief,
          options: [
            { id: "deboss", label: "Debossed" },
            { id: "flat", label: "Flat" },
            { id: "emboss", label: "Embossed" }
          ],
          onChange: (value) => edit(() => { book().stamp.relief = value; }, ["foil"])
        }),
        slider({
          label: "Depth", value: current.stamp.depth, min: 0, max: 1, step: 0.01, detent: 0.5, format: percent,
          onInput: (value) => edit(() => { book().stamp.depth = value; }, ["foil"], { key: "stamp-depth" })
        })
      ),
      group("Age", "A well-loved copy: corners and edges rubbed, colour faded by the sun, foil worn thin.",
        row(
          slider({
            label: "Wear", value: current.wear.scuff, min: 0, max: 1, step: 0.01, format: percent,
            onInput: (value) => edit(() => { book().wear.scuff = value; }, ["front", "spine", "back"], { key: "wear-scuff" })
          }),
          slider({
            label: "Sun-fading", value: current.wear.fade, min: 0, max: 1, step: 0.01, format: percent,
            onInput: (value) => edit(() => { book().wear.fade = value; }, ["front", "spine", "back"], { key: "wear-fade" })
          })
        )
      )
    ];
  }

  function coverTab() {
    const current = book();
    const layoutOptions = Object.entries(LAYOUTS).map(([id, layout]) => ({ id, label: layout.label }));

    const image = current.front.image;
    const thumb = h("span", { class: "upload__thumb" });
    if (image?.id) {
      const show = () => {
        const element = getImage(image.id, show);
        if (element) thumb.style.backgroundImage = `url("${element.src}")`;
      };
      show();
    }
    const chooseImage = async (event) => {
      const id = await chooseBookImage(event.currentTarget);
      if (!id) return;
      const apply = (volume) => {
        volume.front.image = { id, mode: volume.front.image?.mode || "full", opacity: 1, treatment: "none", zoom: 1, focusX: 0.5, focusY: 0.5 };
      };
      if (book() === current) edit(() => apply(current), ["front"], { rerender: true });
      else store.update(current.id, apply, { dirty: ["front"] });
    };

    return [
      group("Layout", "How the title, ornament and names sit on the board.",
        tiles({
          label: "Cover layout",
          value: current.front.layout,
          options: layoutOptions,
          render: (option) => coverThumb(() => applyLayout(coverSample(), option.id)),
          onChange: (value) => edit(() => { applyLayout(book(), value); }, ["front"], { rerender: true })
        })
      ),
      group("Border", null, ...borderEditor("front")),
      onlayGroup(),
      sealGroup(),
      group("Ornament", null, ...motifEditor("front")),
      group("Artwork", "Use your own picture as the whole cover or as an inset plate. Foil and print sit on top.",
        h("div", { class: "upload" },
          image ? thumb : null,
          h("button", { class: "link-button", type: "button", text: t(image ? "Replace image" : "Upload an image"), onclick: chooseImage }),
          image ? h("button", {
            class: "link-button link-button--danger", type: "button", text: t("Remove"),
            onclick: () => edit(() => { book().front.image = null; }, ["front"], { rerender: true })
          }) : null
        ),
        image ? row(
          segmented({
            label: "Placement", value: image.mode,
            options: [{ id: "full", label: "Full cover" }, { id: "plate", label: "Plate" }],
            onChange: (value) => edit(() => { book().front.image.mode = value; }, ["front"])
          }),
          slider({
            label: "Strength", value: image.opacity ?? 1, min: 0.1, max: 1, step: 0.01, format: percent,
            onInput: (value) => edit(() => { book().front.image.opacity = value; }, ["front"], { key: "front-image-opacity" })
          })
        ) : null,
        image ? segmented({
          label: "Printed as", value: image.treatment || "none",
          options: [
            { id: "none", label: "Photograph" }, { id: "duotone", label: "Duotone" },
            { id: "halftone", label: "Halftone" }, { id: "engraving", label: "Engraving" }
          ],
          onChange: (value) => edit(() => { book().front.image.treatment = value; }, ["front"])
        }) : null,
        // Framing: enlarge the picture and choose which part of it shows.
        image ? row(
          slider({
            label: "Zoom", value: image.zoom ?? 1, min: 1, max: 3, step: 0.01, format: percent,
            onInput: (value) => edit(() => { book().front.image.zoom = value; }, ["front"], { key: "front-image-zoom" })
          }),
          slider({
            label: "Across", value: image.focusX ?? 0.5, min: 0, max: 1, step: 0.01, format: percent,
            onInput: (value) => edit(() => { book().front.image.focusX = value; }, ["front"], { key: "front-image-x" })
          }),
          slider({
            label: "Down", value: image.focusY ?? 0.5, min: 0, max: 1, step: 0.01, format: percent,
            onInput: (value) => edit(() => { book().front.image.focusY = value; }, ["front"], { key: "front-image-y" })
          })
        ) : null
      ),
      letteringGroup("front", "Each line can use the book's shared words or its own text.")
    ];
  }

  /** A wax seal pressed on the front board. */
  function sealGroup() {
    const current = book().front.seal;
    const change = (mutate, key = null, rerender = false) => edit(() => mutate(book().front.seal), ["front"], { key, rerender });
    return group("Wax seal", "A seal of wax pressed on the board, stamped with a letter or crest.",
      toggle({
        label: "Wax seal", value: current.show,
        onChange: (value) => change((target) => { target.show = value; }, null, true)
      }),
      current.show ? row(
        textField({
          label: "Seal letter", value: current.letter, placeholder: "From the title", maxLength: 1,
          onInput: (value) => change((target) => { target.letter = value; }, "seal-letter")
        }),
        select({
          label: "Crest", value: current.motif || "",
          options: [{ id: "", label: "Letter only" }, ...MOTIFS.slice(1)],
          preview: (option) => listThumb(motifThumb(option.id || "none")),
          onChange: (value) => change((target) => { target.motif = value; })
        })
      ) : null,
      current.show ? colorField({
        label: "Wax", value: current.color, swatches: ["#7a1c17", "#1f2a44", "#2f4a2f", "#1b1714", "#b48a3a", "#5c2542"], custom: true,
        onInput: (value) => change((target) => { target.color = value; }, "seal-color")
      }) : null,
      current.show ? row(
        slider({
          label: "Scale", value: current.scale ?? 1, min: 0.7, max: 1.45, step: 0.01, detent: 1, format: percent,
          onInput: (value) => change((target) => { target.scale = value; }, "seal-scale")
        }),
        slider({
          label: "Across", value: current.x, min: 0.15, max: 0.85, step: 0.01, detent: 0.5, format: percent,
          onInput: (value) => change((target) => { target.x = value; }, "seal-x")
        }),
        slider({
          label: "Down", value: current.y, min: 0.12, max: 0.88, step: 0.01, detent: 0.5, format: percent,
          onInput: (value) => change((target) => { target.y = value; }, "seal-y")
        })
      ) : null
    );
  }

  /* ----- sharing ----- */

  const fileName = (suffix) => `${(book().title || "book").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "book"}${suffix}`;
  let sharing = false;

  /** Run one export at a time, with a word while it works. */
  async function share(message, work) {
    if (sharing) return;
    sharing = true;
    toast(t(message));
    const stopBusy = shareButton ? busy(shareButton) : () => {};
    try {
      // Let the toast and busy underline paint before heavy work starts.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
      await work();
    } catch (error) {
      console.warn(error);
      toast(t("That did not work. Please try again."));
    } finally {
      stopBusy();
      sharing = false;
    }
  }

  function sharePicture() {
    share("Taking the picture…", async () => {
      const blob = await engine.capturePicture();
      if (!blob) throw new Error("no picture");
      downloadBlob(blob, fileName(".png"));
      toast(t("Saved {name}", { name: fileName(".png") }));
    });
  }

  function shareTurntable() {
    share("Turning the book…", async () => {
      const frames = engine.captureTurntable({ frames: 36, size: 360 });
      if (!frames.length) throw new Error("no frames");
      await new Promise((resolve) => setTimeout(resolve, 0));
      downloadBlob(encodeGif(frames, { delay: 6 }), fileName(".gif"));
      toast(t("Saved {name}", { name: fileName(".gif") }));
    });
  }

  function sharePdf() {
    share("Printing the pages…", async () => {
      const current = book();
      const flat = engine.pagination;
      const width = PAGE_SIZE.width * 2;
      const height = PAGE_SIZE.height * 2;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const target = { canvas, context: canvas.getContext("2d"), commit() {} };
      const pages = [];
      for (let index = 0; index < flat.length; index += 1) {
        if (flat.length > 1) {
          toast(t("Printing page {n} of {total}…", { n: index + 1, total: flat.length }), 4000, { inplace: true });
        }
        paintPage(current, flat[index], index, target, () => {});
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
        pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width, height });
        // Yield briefly between pages so the progress indicator and UI stay alive.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!pages.length) throw new Error("no pages");
      downloadBlob(buildPdf(pages, { title: current.title }), fileName(".pdf"));
      toast(t("Saved {name}", { name: fileName(".pdf") }));
    });
  }

  function shareFolio() {
    share("Exporting…", async () => {
      const current = book();
      if (!current) return;
      const images = {};
      for (const id of bookImageIds(current)) {
        const blob = await getImageBlob(id).catch(() => null);
        if (!blob) continue;
        images[id] = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      }
      const payload = { format: "folio-atelier", version: 1, exportedAt: new Date().toISOString(), book: current, images };
      const name = fileName(".folio");
      downloadBlob(new Blob([JSON.stringify(payload)], { type: "application/json" }), name);
      toast(t("Exported {name}.folio", { name: name.replace(/\.folio$/, "") }));
    });
  }

  function setShareMenu(open) {
    if (!shareMenu || !shareButton) return;
    shareMenu.hidden = !open;
    shareButton.setAttribute("aria-expanded", String(open));
  }

  /** A contrasting piece of leather on the front board. */
  function onlayGroup() {
    const onlay = () => book().front.onlay;
    const current = onlay();
    const change = (mutate, key = null) => edit(() => mutate(onlay()), ["front"], { key });
    return group("Onlay", "A piece of contrasting leather laid on the board, or set flush into it.",
      toggle({
        label: "Add a leather piece", value: current.show,
        onChange: (value) => edit(() => { onlay().show = value; }, ["front"], { rerender: true })
      }),
      current.show ? segmented({
        label: "Setting", value: current.mode,
        options: [{ id: "onlay", label: "Laid on" }, { id: "inlay", label: "Set flush" }],
        onChange: (value) => change((target) => { target.mode = value; })
      }) : null,
      current.show ? row(
        select({
          label: "Shape", value: current.shape,
          options: [
            { id: "rect", label: "Rectangle" }, { id: "rounded", label: "Rounded" }, { id: "oval", label: "Oval" },
            { id: "diamond", label: "Diamond" }, { id: "arch", label: "Arch" },
            { id: "shield", label: "Shield" }, { id: "octagon", label: "Octagon" }
          ],
          preview: (option) => shapeGlyph(option.id),
          onChange: (value) => change((target) => { target.shape = value; })
        }),
        select({
          label: "Material", value: current.kind, options: MATERIALS,
          preview: (option) => listThumb(materialThumb(option.id)),
          onChange: (value) => change((target) => { target.kind = value; })
        })
      ) : null,
      current.show ? toggle({
        label: "Gilded border", value: Boolean(current.border),
        onChange: (value) => change((target) => { target.border = value; })
      }) : null,
      current.show ? colorField({
        label: "Leather colour", value: current.color, swatches: CLOTH_COLORS,
        onInput: (value) => change((target) => { target.color = value; }, "onlay-color")
      }) : null,
      current.show ? row(
        slider({
          label: "Width", value: current.width, min: 0.15, max: 0.9, step: 0.01, format: percent,
          onInput: (value) => change((target) => { target.width = value; }, "onlay-width")
        }),
        slider({
          label: "Height", value: current.height, min: 0.1, max: 0.9, step: 0.01, format: percent,
          onInput: (value) => change((target) => { target.height = value; }, "onlay-height")
        }),
        slider({
          label: "Position", value: 1 - current.y, min: 0.1, max: 0.9, step: 0.01, format: percent,
          onInput: (value) => change((target) => { target.y = 1 - value; }, "onlay-y")
        })
      ) : null
    );
  }

  /** Trim size, thickness, closure band and pen loop. */
  function structureTab() {
    const current = book();
    const structure = () => book().structure;
    const change = (mutate, key = null, rerender = false) => edit(() => mutate(structure()), ["details"], { key, rerender });
    return [
      group("Format", "The size of the book and the thickness of its text block.",
        segmented({
          label: "Trim size", value: current.structure.trim, options: TRIMS,
          onChange: (value) => change((target) => { target.trim = value; })
        }),
        slider({
          label: "Thickness", value: current.structure.bulk, min: 0.55, max: 1.6, step: 0.01, detent: 1, format: percent,
          onInput: (value) => change((target) => { target.bulk = value; }, "structure-bulk")
        }),
        segmented({
          label: "Board corners", value: current.structure.corners,
          options: [{ id: "square", label: "Square" }, { id: "rounded", label: "Rounded" }],
          onChange: (value) => change((target) => { target.corners = value; })
        })
      ),
      group("Closure", "An elastic band or metal clasp that holds the book shut. It slips off when you open the book.",
        toggle({
          label: "Elastic band", value: current.structure.band.show,
          onChange: (value) => change((target) => { target.band.show = value; }, null, true)
        }),
        current.structure.band.show ? colorField({
          label: "Band colour", value: current.structure.band.color, swatches: CLOTH_COLORS,
          onInput: (value) => change((target) => { target.band.color = value; }, "band-color")
        }) : null,
        toggle({
          label: "Metal clasp", value: current.structure.clasp.show,
          onChange: (value) => change((target) => { target.clasp.show = value; }, null, true)
        }),
        current.structure.clasp.show ? segmented({
          label: "Clasp style", value: current.structure.clasp.style || "single",
          options: [{ id: "single", label: "Single" }, { id: "twin", label: "Twin" }],
          onChange: (value) => change((target) => { target.clasp.style = value; })
        }) : null,
        current.structure.clasp.show ? segmented({
          label: "Clasp metal", value: current.structure.clasp.metal, options: CLASP_METALS,
          onChange: (value) => change((target) => { target.clasp.metal = value; })
        }) : null
      ),
      group("Pen loop", "A fabric loop on the back board to keep a pen with the book.",
        toggle({
          label: "Pen loop", value: current.structure.penLoop.show,
          onChange: (value) => change((target) => { target.penLoop.show = value; }, null, true)
        }),
        current.structure.penLoop.show ? colorField({
          label: "Loop colour", value: current.structure.penLoop.color, swatches: CLOTH_COLORS,
          onInput: (value) => change((target) => { target.penLoop.color = value; }, "pen-loop-color")
        }) : null
      ),
      group("Pocket and slipcase", "A paper pocket inside the front board, and a case that keeps the book on the shelf. The book slides out of it when you open it.",
        toggle({
          label: "Inside pocket", value: current.structure.pocket.show,
          onChange: (value) => change((target) => { target.pocket.show = value; }, null, true)
        }),
        current.structure.pocket.show ? toggle({
          label: "Insert card", value: current.structure.pocket.card !== false,
          onChange: (value) => change((target) => { target.pocket.card = value; })
        }) : null,
        toggle({
          label: "Slipcase", value: current.structure.slipcase.show,
          onChange: (value) => change((target) => { target.slipcase.show = value; }, null, true)
        }),
        current.structure.slipcase.show ? toggle({
          label: "Slipcase label", value: current.structure.slipcase.label !== false,
          onChange: (value) => change((target) => { target.slipcase.label = value; })
        }) : null,
        current.structure.slipcase.show ? colorField({
          label: "Slipcase colour", value: current.structure.slipcase.color, swatches: CLOTH_COLORS,
          onInput: (value) => change((target) => { target.slipcase.color = value; }, "slipcase-color")
        }) : null
      )
    ];
  }

  function spineTab() {
    const current = book();
    const spine = () => book().spine;
    return [
      group("Structure", null,
        row(
          select({
            label: "Tooling", value: current.spine.style, options: SPINE_STYLES,
            onChange: (value) => edit(() => { spine().style = value; }, ["spine"])
          }),
          select({
            label: "Tail emblem", value: current.spine.emblem, options: SPINE_EMBLEMS,
            onChange: (value) => edit(() => { spine().emblem = value; }, ["spine"])
          })
        ),
        ...finishControls(spine, ["spine"], "spine")
      ),
      group("Title label", "A pasted label behind the title, as on a library binding.",
        toggle({
          label: "Show the label", value: Boolean(current.spine.label?.show),
          onChange: (value) => edit(() => { spine().label.show = value; }, ["spine"], { rerender: true })
        }),
        current.spine.label?.show ? segmented({
          label: "Label shape", value: current.spine.label.shape || "rect",
          options: [{ id: "rect", label: "Rectangle" }, { id: "bevel", label: "Bevelled" }, { id: "oval", label: "Oval" }],
          onChange: (value) => edit(() => { spine().label.shape = value; }, ["spine"])
        }) : null,
        current.spine.label?.show ? toggle({
          label: "Gilded frame", value: current.spine.label.framed !== false,
          onChange: (value) => edit(() => { spine().label.framed = value; }, ["spine"])
        }) : null,
        colorField({
          label: "Label colour", value: current.spine.label.color, swatches: LABEL_COLORS,
          onInput: (value) => edit(() => { spine().label.color = value; spine().label.show = true; }, ["spine"], { key: "spine-label" })
        })
      ),
      letteringGroup("spine", "Long titles shrink to fit. Chinese, Japanese and Korean titles are set upright.")
    ];
  }

  function backTab() {
    const current = book();
    const blurb = () => book().back.texts.find((layer) => layer.id === "back-blurb");
    const badge = () => book().back.badge;
    const badgeStyle = current.back.badge?.style || "none";
    return [
      blurb() ? group("Blurb", "A few lines for the back board.",
        textArea({
          label: "Text", value: blurb().text, placeholder: "What is this book, and who is it for?",
          onInput: (value) => edit(() => { blurb().text = value; blurb().show = true; }, ["back"], { key: "back-blurb-text" })
        })
      ) : null,
      group("Publisher mark", "Add a barcode plate, collector ex-libris stamp, or numbered edition mark to the back cover.",
        segmented({
          label: "Mark", value: badgeStyle,
          options: [
            { id: "none", label: "None" },
            { id: "isbn", label: "ISBN" },
            { id: "exlibris", label: "Ex-Libris" },
            { id: "edition", label: "Edition" }
          ],
          onChange: (value) => edit(() => {
            const target = badge();
            target.style = value;
            if (value === "exlibris" && /^978-/.test(target.code || "")) target.code = "EX LIBRIS";
            else if (value === "edition" && (/^978-/.test(target.code || "") || target.code === "EX LIBRIS")) target.code = "NO. 001 / 500";
            else if (value === "isbn" && !/^\d/.test(target.code || "")) target.code = "978-0-486-28473-6";
          }, ["back"], { rerender: true })
        }),
        badgeStyle !== "none" ? row(
          textField({
            label: badgeStyle === "isbn" ? "ISBN number" : badgeStyle === "edition" ? "Edition number" : "Stamp line",
            value: current.back.badge?.code || "",
            placeholder: badgeStyle === "isbn" ? "978-0-486-28473-6" : badgeStyle === "edition" ? "NO. 001 / 500" : "EX LIBRIS",
            maxLength: 32,
            onInput: (value) => edit(() => { badge().code = value; }, ["back"], { key: "back-badge-code" })
          }),
          badgeStyle !== "exlibris" ? textField({
            label: badgeStyle === "isbn" ? "Price" : "Subline",
            value: current.back.badge?.price || "",
            placeholder: badgeStyle === "isbn" ? "$24.00" : "FOLIO ATELIER EDITION",
            maxLength: 32,
            onInput: (value) => edit(() => { badge().price = value; }, ["back"], { key: "back-badge-price" })
          }) : null
        ) : null
      ),
      group("Ornament", null, ...motifEditor("back", [{ id: "rings", label: "Registration rings" }])),
      group("Border", null,
        h("button", {
          class: "link-button", type: "button", text: t("Match front border"), style: { justifySelf: "start" },
          onclick: () => edit(() => {
            const front = book().front.border;
            const style = ["panel", "slip"].includes(front.style) ? "double" : front.style;
            book().back.border = { ...deepClone(front), style };
          }, ["back"], { rerender: true })
        }),
        ...borderEditor("back")
      ),
      current.back.texts.length ? letteringGroup("back", null) : null
    ];
  }

  function detailsTab() {
    const current = book();
    const details = () => book().details;
    const edgeColour = h("div");
    const paintEdge = () => {
      const style = details().edge.style;
      const fixedEdge = ["plain", "foreedge", "gilt_crimson", "botanical"].includes(style);
      edgeColour.replaceChildren(fixedEdge ? "" : colorField({
        label: ["gilt", "gauffered"].includes(style) ? "Leaf" : style === "sprinkled" ? "Sprinkle" : "Stain",
        value: details().edge.color,
        swatches: EDGE_COLORS,
        metal: ["gilt", "gauffered"].includes(style),
        onInput: (value) => edit(() => { details().edge.color = value; }, ["details"], { key: "edge-color" })
      }));
    };
    paintEdge();

    const boards = ["details", "material"];
    return [
      group("Page edges", "Gilding and staining show on the three trimmed edges of the block.",
        select({
          label: "Finish", value: current.details.edge.style, options: EDGE_STYLES,
          onChange: (value) => {
            edit(() => {
              details().edge.style = value;
              if (value === "gilt" || value === "gauffered") details().edge.color = "#d9b25f";
              if (value === "tinted") details().edge.color = "#c6532f";
            }, ["details"]);
            paintEdge();
          }
        }),
        edgeColour
      ),
      group("Corner pieces", "Metal corners in the book's foil, on the two outer corners of each board.",
        segmented({
          label: "Corners", value: current.details.corners.style, options: CORNER_STYLES,
          onChange: (value) => edit(() => { details().corners.style = value; }, boards)
        })
      ),
      group("Stab stitching", "Thread sewn through the boards and wrapped round the spine, as on a thread-bound book.",
        toggle({
          label: "Sew the binding", value: Boolean(current.details.stitch.show),
          onChange: (value) => edit(() => { details().stitch.show = value; }, boards, { rerender: true })
        }),
        row(
          segmented({
            label: "Holes", value: String(current.details.stitch.holes),
            options: [{ id: "4", label: "Four" }, { id: "6", label: "Six" }],
            onChange: (value) => edit(() => { details().stitch.holes = Number(value); }, boards)
          }),
          segmented({
            label: "Stitch pattern", value: current.details.stitch.pattern || "standard",
            options: [
              { id: "standard", label: "Classic" },
              { id: "asanoha", label: "Hemp leaf" },
              { id: "kikko", label: "Tortoiseshell" }
            ],
            onChange: (value) => edit(() => { details().stitch.pattern = value; }, boards)
          })
        ),
        colorField({
          label: "Thread", value: current.details.stitch.color, swatches: THREAD_COLORS,
          onInput: (value) => edit(() => { details().stitch.color = value; }, boards, { key: "stitch-color" })
        })
      ),
      group("Endpapers", "The sheets pasted inside the boards \u2014 open the cover to see them.",
        select({
          label: "Pattern", value: current.details.endpaper.pattern, options: ENDPAPER_PATTERNS,
          preview: (option) => listThumb(patternThumb(option.id)),
          onChange: (value) => {
            edit(() => { details().endpaper.pattern = value; }, ["details"]);
            engine.setReadingOpen(true);
            engine.focusView("pages");
          }
        }),
        colorField({
          label: "Paper colour", value: current.details.endpaper.color, swatches: ENDPAPER_COLORS,
          onInput: (value) => edit(() => { details().endpaper.color = value; }, ["details"], { key: "endpaper-color" })
        })
      ),
      group("Ribbon & headbands", null,
        h("div", { class: "toggles" },
          toggle({
            label: "Ribbon marker", value: current.details.ribbon.show,
            onChange: (value) => edit(() => { details().ribbon.show = value; }, ["details"])
          }),
          toggle({
            label: "Second ribbon", value: Boolean(current.details.ribbon.double),
            onChange: (value) => edit(() => { details().ribbon.double = value; }, ["details"], { rerender: true })
          })
        ),
        colorField({
          label: "Ribbon", value: current.details.ribbon.color, swatches: EDGE_COLORS,
          onInput: (value) => edit(() => { details().ribbon.color = value; }, ["details"], { key: "ribbon-color" })
        }),
        current.details.ribbon.double ? colorField({
          label: "Second ribbon colour", value: current.details.ribbon.second, swatches: EDGE_COLORS,
          onInput: (value) => edit(() => { details().ribbon.second = value; }, ["details"], { key: "ribbon-second" })
        }) : null,
        colorField({
          label: "Headbands", value: current.details.headband.color, swatches: EDGE_COLORS,
          onInput: (value) => edit(() => { details().headband.color = value; }, ["details"], { key: "headband-color" })
        }),
        toggle({
          label: "Striped headbands", value: Boolean(current.details.headband.striped),
          onChange: (value) => edit(() => { details().headband.striped = value; }, ["details"], { rerender: true })
        }),
        current.details.headband.striped ? colorField({
          label: "Stripe", value: current.details.headband.second, swatches: EDGE_COLORS,
          onInput: (value) => edit(() => { details().headband.second = value; }, ["details"], { key: "headband-second" })
        }) : null
      ),
      group("Paper", "The stock the book is printed on.",
        select({
          label: "Stock", value: current.interior.paper,
          options: Object.entries(PAPER_STOCKS).map(([id, stock]) => ({ id, label: stock.label })),
          onChange: (value) => edit(() => { book().interior.paper = value; }, ["details", "interior"])
        })
      )
    ];
  }

  /* ----- pages ----- */

  function pageSummary(page) {
    const current = book();
    const first = (value) => (value || "").trim().split(/\n/)[0];
    switch (page.type) {
      case "halftitle":
      case "title": return current.title;
      case "part":
      case "chapter": return page.title || t("Untitled");
      case "body": return first(page.heading) || first(page.text) || t("Empty text");
      case "poem": return first(page.title) || first(page.text) || t("Empty");
      case "quote":
      case "epigraph":
      case "dedication": return first(page.text) || t("Empty");
      case "plate": return first(page.caption) || t(page.image ? "Image" : "Ornament");
      case "colophon": return first(page.text) || t("Written for you");
      case "contents": return page.heading || t("Contents");
      case "exlibris": return page.owner || current.author || t("Ex-Libris");
      case "letter": return page.salutation || first(page.text) || t("Letter");
      case "notebook": return t("{count} pages", { count: Math.round(page.count || 1) });
      default: return "—";
    }
  }

  function jumpToPage(pageId) {
    const index = engine.pagination.findIndex((entry) => entry.source === pageId);
    if (index >= 0) engine.goToPage(index);
  }

  function selectPage(pageId, { jump = true } = {}) {
    selectedPageId = pageId;
    renderBody({ keepScroll: true });
    if (jump) jumpToPage(pageId);
  }

  function pageEditor(page) {
    const target = () => book().pages.find((candidate) => candidate.id === page.id);
    const set = (property, { later = false } = {}) => (value) => {
      edit(() => { target()[property] = value; }, ["pages"], { key: `page-${page.id}-${property}` });
      if (later) refreshPageItem(page.id);
    };
    const fields = [];
    if (page.type === "chapter") {
      fields.push(
        textField({ label: "Chapter title", value: page.title, placeholder: "A New Chapter", onInput: set("title", { later: true }) }),
        textArea({
          label: "Text", value: page.text, tall: true,
          placeholder: "Write here. The text continues onto new pages as it grows.",
          onInput: set("text")
        })
      );
    } else if (page.type === "part") {
      fields.push(
        textField({ label: "Part title", value: page.title, placeholder: "Part Title", onInput: set("title", { later: true }) }),
        textArea({ label: "Note", value: page.text, placeholder: "An optional line under the title", onInput: set("text") })
      );
    } else if (page.type === "poem") {
      fields.push(
        textField({ label: "Heading", value: page.title, placeholder: "Optional", onInput: set("title", { later: true }) }),
        textArea({
          label: "Verse", value: page.text, tall: true,
          placeholder: "One line of verse per line. Leave an empty line between stanzas.",
          onInput: set("text", { later: true })
        })
      );
    } else if (page.type === "epigraph") {
      fields.push(
        textArea({ label: "Quotation", value: page.text, onInput: set("text", { later: true }) }),
        textField({ label: "Attribution", value: page.attribution, placeholder: "Optional", onInput: set("attribution") })
      );
    } else if (page.type === "body") {
      fields.push(
        textField({ label: "Heading", value: page.heading, placeholder: "Optional", onInput: set("heading", { later: true }) }),
        textArea({
          label: "Text", value: page.text, tall: true,
          placeholder: "Write here. The text continues onto new pages as it grows.",
          onInput: set("text", { later: true })
        })
      );
    } else if (page.type === "quote") {
      fields.push(
        textArea({ label: "Quotation", value: page.text, onInput: set("text", { later: true }) }),
        textField({ label: "Attribution", value: page.attribution, placeholder: "Optional", onInput: set("attribution") })
      );
    } else if (page.type === "dedication") {
      fields.push(textArea({ label: "Dedication", value: page.text, onInput: set("text", { later: true }) }));
    } else if (page.type === "title") {
      fields.push(
        textField({ label: "Imprint line", value: page.imprint, placeholder: "Folio Atelier", onInput: set("imprint") }),
        h("p", { class: "group__hint", text: t("Title, subtitle, author and series come from the Design tab.") })
      );
    } else if (page.type === "contents") {
      fields.push(
        textField({ label: "Heading", value: page.heading, placeholder: "Contents", onInput: set("heading", { later: true }) }),
        h("p", { class: "group__hint", text: t("The list is built from your chapter openers, with their page numbers.") })
      );
    } else if (page.type === "plate") {
      const volume = book();
      const choose = async (event) => {
        const id = await chooseBookImage(event.currentTarget);
        const plate = volume.pages.find((candidate) => candidate.id === page.id && candidate.type === "plate");
        if (!id || !plate) return;
        const apply = () => { plate.image = id; };
        if (book() === volume) edit(apply, ["pages"], { rerender: true });
        else store.update(volume.id, apply, { dirty: ["pages"] });
      };
      fields.push(
        h("div", { class: "upload" },
          h("button", { class: "link-button", type: "button", text: t(page.image ? "Replace image" : "Upload an image"), onclick: choose }),
          page.image ? h("button", {
            class: "link-button link-button--danger", type: "button", text: t("Remove"),
            onclick: () => edit(() => { target().image = null; }, ["pages"], { rerender: true })
          }) : null
        ),
        page.image ? toggle({
          label: "Fill the whole page", value: Boolean(page.bleed), onChange: set("bleed")
        }) : null,
        page.image ? null : select({
          label: "Ornament", value: page.motif || "",
          options: [{ id: "", label: "Same as the cover" }, ...MOTIFS.slice(1)],
          preview: (option) => listThumb(motifThumb(option.id || book().front.motif.key)),
          onChange: set("motif")
        }),
        textField({ label: "Caption", value: page.caption, placeholder: "Optional", onInput: set("caption", { later: true }) })
      );
    } else if (page.type === "exlibris") {
      fields.push(
        textField({ label: "Owner", value: page.owner || "", placeholder: book().author || "Your name", onInput: set("owner", { later: true }) }),
        textField({ label: "Motto or note", value: page.note || "", placeholder: "Optional", onInput: set("note") }),
        row(
          textField({ label: "Edition number", value: page.edition || "", placeholder: "No. 01 / 50", onInput: set("edition") }),
          select({
            label: "Ornament", value: page.motif || "",
            options: [{ id: "", label: "Same as the cover" }, ...MOTIFS.slice(1)],
            preview: (option) => listThumb(motifThumb(option.id || book().front.motif.key)),
            onChange: set("motif")
          })
        )
      );
    } else if (page.type === "letter") {
      fields.push(
        row(
          textField({ label: "Date & place", value: page.date || "", placeholder: "Autumn, Studio Desk", onInput: set("date") }),
          textField({ label: "Salutation", value: page.salutation || "", placeholder: "Dear Reader,", onInput: set("salutation", { later: true }) })
        ),
        textArea({
          label: "Letter", value: page.text || "", tall: true,
          placeholder: "Write your letter here…",
          onInput: set("text", { later: true })
        }),
        textField({ label: "Sign-off", value: page.signoff || "", placeholder: "With warmth,", onInput: set("signoff") })
      );
    } else if (page.type === "notebook") {
      fields.push(
        select({
          label: "Ruling", value: page.ruling || "lined",
          options: [
            { id: "lined", label: "Lined" },
            { id: "dotted", label: "Dot grid" },
            { id: "grid", label: "Squared" },
            { id: "cornell", label: "Cornell notes" },
            { id: "music", label: "Music staff" },
            { id: "wusilan", label: "Wusilan columns" }
          ],
          onChange: set("ruling")
        }),
        slider({
          label: "Number of pages", value: page.count || 4, min: 1, max: 48, step: 1, format: (value) => String(Math.round(value)),
          onInput: (value) => set("count", { later: true })(Math.round(value))
        })
      );
    } else if (page.type === "colophon") {
      fields.push(textArea({
        label: "Colophon", value: page.text,
        placeholder: "Leave empty and one is written for you from the book's typefaces and binding.",
        onInput: set("text", { later: true })
      }));
    } else {
      fields.push(h("p", { class: "group__hint", text: t(page.type === "halftitle"
        ? "The half-title shows the book's title alone. Change it in the Design tab."
        : "A blank page \u2014 useful for starting a chapter on a right-hand page.") }));
    }
    return h("div", { class: "page-editor" },
      h("div", { class: "page-editor__head" },
        h("h3", { class: "group__title", text: pageTypeLabel(page.type) })
      ),
      fields
    );
  }

  function refreshPageItem(pageId) {
    const page = book()?.pages.find((candidate) => candidate.id === pageId);
    const element = body.querySelector(`[data-page="${pageId}"] .page-item__text`);
    if (page && element) element.textContent = pageSummary(page);
  }

  function movePage(from, to) {
    if (from === to || to < 0 || to >= book().pages.length) return;
    edit(() => {
      const pages = book().pages;
      const [moved] = pages.splice(from, 1);
      pages.splice(to, 0, moved);
    }, ["pages"], { rerender: true });
  }

  function pageList() {
    const current = book();
    let dragIndex = -1;
    const clearDrop = (list) => list.querySelectorAll(".is-drop-before, .is-drop-after").forEach((element) => {
      element.classList.remove("is-drop-before", "is-drop-after");
    });

    const list = h("ol", { class: "page-list" }, current.pages.map((page, index) => {
      const item = h("li", {
        class: "page-item",
        dataset: { page: page.id },
        "aria-current": String(page.id === selectedPageId)
      },
        h("span", {
          class: "page-item__grip",
          title: t("Drag to reorder"),
          onpointerdown: () => { item.draggable = true; },
          onpointerup: () => { item.draggable = false; }
        }, (() => {
          const svg = icon([], "");
          svg.innerHTML = '<circle cx="5.5" cy="4" r="1.1"/><circle cx="10.5" cy="4" r="1.1"/><circle cx="5.5" cy="8" r="1.1"/><circle cx="10.5" cy="8" r="1.1"/><circle cx="5.5" cy="12" r="1.1"/><circle cx="10.5" cy="12" r="1.1"/>';
          return svg;
        })()),
        h("button", { class: "page-item__main", type: "button", onclick: () => selectPage(page.id) },
          h("span", { class: "page-item__type", text: pageTypeLabel(page.type) }),
          h("span", { class: "page-item__text", text: pageSummary(page) })
        ),
        h("span", { class: "page-item__tools" },
          h("button", {
            class: "mini-button", type: "button", "aria-label": t("Move up"), title: t("Move up"), disabled: index === 0,
            onclick: () => movePage(index, index - 1)
          }, icon(ICONS.up)),
          h("button", {
            class: "mini-button", type: "button", "aria-label": t("Move down"), title: t("Move down"), disabled: index === current.pages.length - 1,
            onclick: () => movePage(index, index + 1)
          }, icon(ICONS.down)),
          h("button", {
            class: "mini-button", type: "button", "aria-label": t("Duplicate page"), title: t("Duplicate page"),
            onclick: () => {
              const copy = { ...deepClone(page), id: uid("pg") };
              selectedPageId = copy.id;
              edit(() => { book().pages.splice(index + 1, 0, copy); }, ["pages"], { rerender: true });
            }
          }, icon(ICONS.copy)),
          h("button", {
            class: "mini-button", type: "button", "aria-label": t("Delete page"), title: t("Delete page"), disabled: current.pages.length <= 1,
            onclick: () => {
              if (selectedPageId === page.id) selectedPageId = null;
              edit(() => { book().pages.splice(index, 1); }, ["pages"], { rerender: true });
            }
          }, icon(ICONS.trash))
        )
      );
      item.addEventListener("dragstart", (event) => {
        dragIndex = index;
        item.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", page.id);
      });
      item.addEventListener("dragend", () => {
        item.draggable = false;
        item.classList.remove("is-dragging");
        clearDrop(list);
        dragIndex = -1;
      });
      item.addEventListener("dragover", (event) => {
        if (dragIndex < 0) return;
        event.preventDefault();
        const bounds = item.getBoundingClientRect();
        const after = event.clientY > bounds.top + bounds.height / 2;
        clearDrop(list);
        item.classList.add(after ? "is-drop-after" : "is-drop-before");
      });
      item.addEventListener("drop", (event) => {
        if (dragIndex < 0) return;
        event.preventDefault();
        const bounds = item.getBoundingClientRect();
        const after = event.clientY > bounds.top + bounds.height / 2;
        let to = index + (after ? 1 : 0);
        if (dragIndex < to) to -= 1;
        const from = dragIndex;
        dragIndex = -1;
        movePage(from, to);
      });
      return item;
    }));
    return list;
  }

  function pagesTab() {
    const current = book();
    const interior = () => book().interior;
    const selected = current.pages.find((page) => page.id === selectedPageId) || null;
    const textFonts = FONTS.filter((font) => font.kind !== "display" && font.kind !== "mono" || font.id === "plexmono");

    const addPage = (type) => {
      const page = createPage(type);
      const at = selected ? current.pages.indexOf(selected) + 1 : current.pages.length;
      selectedPageId = page.id;
      edit(() => { book().pages.splice(at, 0, page); }, ["pages"], { rerender: true });
      setTimeout(() => jumpToPage(page.id), 260);
    };

    /*
     * A manuscript becomes pages: parts, chapters, and any opening text as a
     * body page. The starter chapters of a new book make way for it;
     * otherwise it goes before the colophon. One edit, so one undo.
     */
    const importManuscript = async () => {
      const file = await pickFile(manuscriptInput);
      if (!file) return;
      if (file.size > 4_000_000) {
        toast(t("That manuscript is too large to import (4 MB at most)."));
        return;
      }
      let parsed = null;
      try {
        parsed = parseManuscript(await file.text(), { name: file.name });
      } catch (error) {
        parsed = null;
      }
      const sections = parsed?.sections || [];
      if (!sections.length) {
        toast(t("No text was found in that file."));
        return;
      }
      const pages = sections.map((section) => {
        if (section.kind === "part") return createPage("part", { title: section.title, text: section.text });
        if (section.kind === "body") return createPage("body", { heading: "", text: section.text });
        return createPage("chapter", { title: section.title, text: section.text });
      });
      selectedPageId = pages.find((page) => page.type === "chapter")?.id || pages[0].id;
      const untitled = !book().title || book().title === t("Untitled");
      edit(() => {
        const list = book().pages;
        const starters = list.filter(isStarterPage);
        let at = starters.length ? list.indexOf(starters[0]) : list.length;
        if (!starters.length && list[list.length - 1]?.type === "colophon") at = list.length - 1;
        starters.forEach((page) => list.splice(list.indexOf(page), 1));
        list.splice(Math.min(at, list.length), 0, ...pages);
        if (parsed.title && untitled) book().title = parsed.title;
      }, parsed.title && untitled ? ["pages", "meta"] : ["pages"], { rerender: true });
      const chapters = pages.filter((page) => page.type === "chapter").length;
      toast(t(chapters === 1 ? "Imported “{name}”: 1 chapter." : "Imported “{name}”: {count} chapters.", { name: file.name, count: chapters }));
      setTimeout(() => jumpToPage(selectedPageId), 260);
    };

    return [
      group("Pages", "Select a page to edit it and to turn the book to it. Drag to reorder.",
        pageList(),
        selected ? pageEditor(selected) : null,
        h("div", { class: "field" },
          h("span", { class: "field__label", text: t(selected ? "Add after this page" : "Add a page") }),
          h("div", { class: "add-pages" }, PAGE_TYPES.map((type) => h("button", {
            class: "chip", type: "button", title: t(type.note), text: t(type.label), onclick: () => addPage(type.id)
          })))
        ),
        h("div", { class: "field manuscript" },
          h("span", { class: "field__label", text: t("Bring in a manuscript") }),
          h("button", { class: "link-button", type: "button", text: t("Import a .txt or .md file"), onclick: importManuscript }),
          h("p", { class: "group__hint", text: t("Headings become chapters: ## in Markdown (with # for parts), or lines such as “Chapter 3” or “第三章” in plain text. Undo takes the import out again.") })
        )
      ),
      group("Typography", "Applies to every page in the book.",
        row(
          select({
            label: "Text face", value: current.interior.bodyFont, options: textFonts, face: (option) => option.stack,
            onChange: (value) => edit(() => { interior().bodyFont = value; }, ["interior"])
          }),
          select({
            label: "Heading face", value: current.interior.headingFont, options: FONTS, face: (option) => option.stack,
            onChange: (value) => edit(() => { interior().headingFont = value; }, ["interior"])
          })
        ),
        row(
          slider({
            label: "Text size", value: current.interior.scale, min: 0.8, max: 1.35, step: 0.01,
            format: (value) => `${(value * 10.5).toFixed(1)} pt`,
            onInput: (value) => edit(() => { interior().scale = value; }, ["interior"], { key: "interior-scale" })
          }),
          slider({
            label: "Leading", value: current.interior.leading || 1.5, min: 1.25, max: 1.9, step: 0.01,
            format: (value) => value.toFixed(2),
            onInput: (value) => edit(() => { interior().leading = value; }, ["interior"], { key: "interior-leading" })
          })
        ),
        segmented({
          label: "Chapter openings", value: current.interior.chapterStyle || "classic",
          options: [
            { id: "classic", label: "Classic" },
            { id: "centered", label: "Centred" },
            { id: "numeral", label: "Numeral" },
            { id: "ornament", label: "Ornament" }
          ],
          onChange: (value) => edit(() => { interior().chapterStyle = value; }, ["interior"])
        }),
        row(
          segmented({
            label: "Page numbers at", value: current.interior.folioPlace || "outer",
            options: [{ id: "outer", label: "Outer corner" }, { id: "center", label: "Centre" }],
            onChange: (value) => edit(() => { interior().folioPlace = value; }, ["interior"])
          }),
          segmented({
            label: "Printed labels", value: current.interior.labels || "en",
            options: [{ id: "en", label: "English" }, { id: "zh", label: "\u4e2d\u6587" }],
            onChange: (value) => edit(() => { interior().labels = value; }, ["interior"])
          })
        ),
        colorField({
          label: "Ink", value: current.interior.ink || "black", custom: false,
          swatches: Object.entries(PAGE_INKS).map(([id, ink]) => ({ color: ink.color, label: ink.label, value: id })),
          onInput: (value) => edit(() => { interior().ink = value; }, ["interior"])
        }),
        h("p", { class: "group__hint", text: t("Type *** on a line of its own for a section break.") }),
        h("div", { class: "toggles" },
          toggle({ label: "Justified", value: current.interior.justify, onChange: (value) => edit(() => { interior().justify = value; }, ["interior"]) }),
          toggle({ label: "Drop capitals", value: current.interior.dropCap, onChange: (value) => edit(() => { interior().dropCap = value; }, ["interior"]) }),
          toggle({ label: "Running heads", value: current.interior.runningHead, onChange: (value) => edit(() => { interior().runningHead = value; }, ["interior"]) }),
          toggle({ label: "Page numbers", value: current.interior.folios, onChange: (value) => edit(() => { interior().folios = value; }, ["interior"]) })
        )
      )
    ];
  }

  const TAB_BUILDERS = {
    design: designTab,
    cover: coverTab,
    spine: spineTab,
    back: backTab,
    details: detailsTab,
    structure: structureTab,
    pages: pagesTab
  };

  function paneFor(id) {
    let pane = panes.get(id);
    if (!pane) {
      pane = { id, element: h("div", { class: "pane", dataset: { tab: id }, hidden: true }), stale: true, scroll: 0, thumbs: [] };
      panes.set(id, pane);
      body.append(pane.element);
    }
    return pane;
  }

  function buildPane(pane) {
    pane.thumbs.forEach((entry) => thumbObserver.unobserve(entry.canvas));
    pane.previous = pane.thumbs.filter((entry) => entry.shown).length ? pane.thumbs.map((entry) => (entry.shown ? entry.canvas : null)) : null;
    pane.thumbs = [];
    buildingPane = pane;
    try {
      pane.element.replaceChildren(...TAB_BUILDERS[pane.id]().filter(Boolean));
    } finally {
      buildingPane = null;
    }
    pane.stale = false;
    pane.previous = null;
    pane.thumbs.forEach((entry) => thumbObserver.observe(entry.canvas));
  }

  function activate(pane) {
    const entering = currentPane !== pane;
    if (currentPane && entering) currentPane.element.hidden = true;
    pane.element.hidden = false;
    currentPane = pane;
    if (!entering) return;
    // A tab coming into view settles in group by group (CSS; cheap: opacity
    // and transform only). A rebuild of the open tab does not replay it.
    pane.element.classList.remove("is-entering");
    void pane.element.offsetWidth;
    pane.element.classList.add("is-entering");
    clearTimeout(pane.enterTimer);
    pane.enterTimer = setTimeout(() => pane.element.classList.remove("is-entering"), 640);
    prefetchNextTab();
  }

  // While the reader looks at one tab, build the next one in a quiet moment
  // so that it opens at once.
  let prefetchQueued = false;
  function prefetchNextTab() {
    if (prefetchQueued) return;
    prefetchQueued = true;
    whenIdle(() => {
      prefetchQueued = false;
      if (!book() || panel.inert) return;
      const index = TABS.findIndex((entry) => entry.id === tab);
      const next = paneFor(TABS[(index + 1) % TABS.length].id);
      if (next !== currentPane && next.stale) buildPane(next);
    }, 2000);
  }

  // Where the caret was, described by the control's label, so that it can be
  // found again in a rebuilt pane.
  function captureFocus() {
    const element = document.activeElement;
    if (!element || !body.contains(element)) return null;
    const scope = element.closest(".field, .toggle, .tile, .page-item, .layer__summary");
    const label = scope?.querySelector(".field__label, .layer__name, span")?.textContent || "";
    const selection = typeof element.selectionStart === "number" && element.type !== "range"
      ? [element.selectionStart, element.selectionEnd]
      : null;
    // Sliders are elements of their own kind (role), not inputs.
    const tag = element.getAttribute("role") === "slider" ? "[role='slider']" : element.tagName;
    return { tag, type: element.type, value: element.dataset?.value, label, selection };
  }

  function restoreFocus(focus) {
    if (!focus || !currentPane) return;
    const match = [...currentPane.element.querySelectorAll(focus.tag)].find((element) => {
      if (element.type !== focus.type || element.dataset?.value !== focus.value) return false;
      const scope = element.closest(".field, .toggle, .tile, .page-item, .layer__summary");
      return (scope?.querySelector(".field__label, .layer__name, span")?.textContent || "") === focus.label;
    });
    if (!match) return;
    match.focus({ preventScroll: true });
    if (focus.selection) {
      try { match.setSelectionRange(...focus.selection); } catch (error) { /* not a text control */ }
    }
  }

  /** Rebuild the open tab from the book (after an edit that changes its controls). */
  function renderBody({ keepScroll = true } = {}) {
    if (!book()) return;
    const pane = paneFor(tab);
    const scroll = currentPane === pane ? body.scrollTop : pane.scroll;
    const focus = captureFocus();
    const before = currentPane === pane && keepScroll ? listPositions(pane.element) : null;
    buildPane(pane);
    activate(pane);
    body.scrollTop = keepScroll ? scroll : 0;
    restoreFocus(focus);
    if (before) glideList(pane.element, before);
    updateHeader();
  }

  /*
   * A rebuilt list (pages moved, copied, added or removed) glides from where
   * its rows were to where they are now, and new rows open in place, instead
   * of the whole list jumping (FLIP: first, last, invert, play).
   */
  const listMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function listPositions(root) {
    const positions = new Map();
    root?.querySelectorAll("[data-page]").forEach((row) => positions.set(row.dataset.page, row.getBoundingClientRect().top));
    return positions;
  }

  function glideList(root, before) {
    if (listMotion.matches || !before.size || !root?.animate) return;
    const easing = "cubic-bezier(0.2, 0.72, 0.24, 1)";
    root.querySelectorAll("[data-page]").forEach((row) => {
      const was = before.get(row.dataset.page);
      if (was === undefined) {
        row.animate(
          [{ opacity: 0, transform: "translateY(-6px) scale(0.98)" }, { opacity: 1, transform: "none" }],
          { duration: 320, easing, delay: 60 }
        );
        return;
      }
      const shift = was - row.getBoundingClientRect().top;
      if (Math.abs(shift) < 1) return;
      row.animate(
        [{ transform: `translateY(${shift}px)` }, { transform: "none" }],
        { duration: 360, easing }
      );
    });
  }

  /** Show the open tab, building it only if it has never been built or is stale. */
  function showPane() {
    const pane = paneFor(tab);
    if (currentPane && currentPane !== pane) currentPane.scroll = body.scrollTop;
    if (pane.stale) buildPane(pane);
    activate(pane);
    body.scrollTop = pane.scroll;
    refreshThumbs();
    updateHeader();
  }

  /* ---------------------------------------------------------------- */
  /* Reader bar                                                         */
  /* ---------------------------------------------------------------- */

  let followQueued = false;
  function renderPageState(state) {
    previousPage.disabled = state.locked || state.spread === 0;
    nextPage.disabled = state.locked || state.spread >= state.spreads - 1;
    toggleBook.textContent = t(state.open ? "Close book" : "Open book");
    toggleBook.setAttribute("aria-pressed", String(state.open));
    if (photoOpenBook) {
      photoOpenBook.textContent = t(state.open ? "Close book" : "Open book");
      photoOpenBook.setAttribute("aria-pressed", String(state.open));
    }
    if (!state.open) {
      pageLabel.textContent = t("Closed");
      pageCounter.textContent = t("Click the book to open it");
      return;
    }
    const entry = state.right || state.left;
    pageLabel.textContent = entry ? entry.label : t("End of the book");
    const numbers = [state.leftIndex, state.rightIndex].filter((index) => index >= 0).map((index) => index + 1);
    pageCounter.textContent = numbers.length
      ? t(numbers.length > 1 ? "Pages {range} of {count}" : "Page {range} of {count}", { range: numbers.join("–"), count: state.pages })
      : t("{count} pages", { count: state.pages });

    // Keep the page list in step with what the book is showing.
    if (tab === "pages") {
      const visible = [state.right?.source, state.left?.source].filter(Boolean);
      if (visible.length && !visible.includes(selectedPageId)) {
        selectedPageId = visible[0];
        // Rebuild after the turn has started, and once for a quick run of turns.
        if (!followQueued) {
          followQueued = true;
          whenIdle(() => {
            followQueued = false;
            if (tab === "pages" && book()) renderBody({ keepScroll: true });
          }, 240);
        }
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Show / hide                                                        */
  /* ---------------------------------------------------------------- */

  /** Single source of truth for panel, stage bar and reader bar inert states. */
  function syncStudioChrome() {
    const inDetail = Boolean(bookId);
    const inPhoto = inDetail && engine.photoMode;
    const inReading = inDetail && engine.readingMode && !inPhoto;
    const panelActive = inDetail && !inPhoto && !inReading;
    const stageActive = inDetail && !inPhoto && !inReading;
    const readerActive = inDetail && !inPhoto;

    panel.inert = !panelActive;
    panel.setAttribute("aria-hidden", String(!panelActive));
    if (stageBar) {
      stageBar.inert = !stageActive;
      stageBar.setAttribute("aria-hidden", String(!stageActive));
    }
    readerBar.inert = !readerActive;
    readerBar.setAttribute("aria-hidden", String(!readerActive));
  }

  function show(target) {
    bookId = target.id;
    tab = "design";
    selectedPageId = null;
    openLayers.clear();
    setShareMenu(false);
    syncStudioChrome();
    showSaved();
    renderView(engine.view || "front");
    renderRoom(engine.room);
    panes.forEach((pane) => {
      pane.stale = true;
      pane.scroll = 0;
    });
    renderTabs();
    renderBody({ keepScroll: false });
  }

  function hide() {
    setShareMenu(false);
    // Move focus out before the panel is hidden from assistive technology.
    if (panel.contains(document.activeElement) || readerBar.contains(document.activeElement) || stageBar?.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    store.flush();
    bookId = null;
    syncStudioChrome();
  }

  /** Keep the quick-angle stage bar synced with the 3D camera station. */
  function renderView(view) {
    if (!stageBar) return;
    stageBar.querySelectorAll("[data-view]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.view === view));
    });
  }

  /** Keep the quick lighting preview pills synced with the room lighting. */
  function renderRoom(room) {
    if (!stageBar || !room) return;
    stageBar.querySelectorAll("[data-light]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.light === room.light));
    });
  }

  /* ---------------------------------------------------------------- */
  /* Wiring                                                             */
  /* ---------------------------------------------------------------- */

  /* ----- the bottom sheet (phones): drag it up or down, or tap its grabber ----- */

  // Three resting heights, as shares of the screen: a peek, half, and nearly
  // all of it for writing. The book is reframed above it as it moves.
  const SHEET_STOPS = [0.36, 0.5, 0.86];
  const grabber = $("#studio-grabber");
  const sheetHeader = panel.querySelector(".studio__header");
  const experienceElement = $("#experience");
  const narrowView = () => window.innerWidth < 820;
  const sheetDrag = { pointerId: null, startY: 0, from: 0.5, share: 0.5, moved: false, samples: [], swallowClick: false };
  let sheetStop = 0.5;

  function setSheet(share, immediate = false) {
    sheetDrag.share = share;
    // Raised for writing, the sheet leaves room only for a small live view of
    // the book: the reading controls step aside.
    experienceElement.classList.toggle("is-sheet-high", share > 0.7);
    experienceElement.style.setProperty("--sheet-height", `${(share * 100).toFixed(2)}dvh`);
    engine.setSheetShare(share, immediate);
  }

  function onSheetDown(event) {
    if (!narrowView() || event.button !== 0 || event.isPrimary === false) return;
    const onGrabber = grabber.contains(event.target);
    if (!onGrabber && event.target.closest("button, input, a, textarea, [role='tab']")) return;
    Object.assign(sheetDrag, { pointerId: event.pointerId, startY: event.clientY, from: sheetStop, moved: false, samples: [] });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onSheetMove(event) {
    if (sheetDrag.pointerId !== event.pointerId) return;
    const dy = event.clientY - sheetDrag.startY;
    if (!sheetDrag.moved) {
      if (Math.abs(dy) < 6) return;
      sheetDrag.moved = true;
      experienceElement.classList.add("is-sheet-dragging");
    }
    let share = sheetDrag.from - dy / window.innerHeight;
    // Past the lowest and highest stops it gives, but only a little.
    const low = SHEET_STOPS[0];
    const high = SHEET_STOPS[SHEET_STOPS.length - 1];
    if (share < low) share = low - (low - share) * 0.3;
    if (share > high) share = high + (share - high) * 0.3;
    const now = event.timeStamp || performance.now();
    sheetDrag.samples.push([now, share]);
    while (sheetDrag.samples.length > 2 && now - sheetDrag.samples[0][0] > 90) sheetDrag.samples.shift();
    setSheet(share, true);
  }

  function onSheetEnd(event) {
    if (sheetDrag.pointerId !== event.pointerId) return;
    sheetDrag.pointerId = null;
    if (!sheetDrag.moved) return;
    experienceElement.classList.remove("is-sheet-dragging");
    const samples = sheetDrag.samples;
    let velocity = 0;
    if (samples.length >= 2) {
      const [t0, s0] = samples[0];
      const [t1, s1] = samples[samples.length - 1];
      if (t1 > t0 && performance.now() - t1 < 80) velocity = ((s1 - s0) / (t1 - t0)) * 1000;
    }
    // A flick carries it on to the next stop in that direction.
    const projected = sheetDrag.share + velocity * 0.16;
    sheetStop = SHEET_STOPS.reduce((best, stop) => (Math.abs(stop - projected) < Math.abs(best - projected) ? stop : best));
    setSheet(sheetStop);
    sheetDrag.swallowClick = true;
    setTimeout(() => { sheetDrag.swallowClick = false; }, 0);
  }

  [grabber, sheetHeader].forEach((element) => {
    element.addEventListener("pointerdown", onSheetDown);
    element.addEventListener("pointermove", onSheetMove);
    element.addEventListener("pointerup", onSheetEnd);
    element.addEventListener("pointercancel", onSheetEnd);
  });
  grabber.addEventListener("click", () => {
    if (sheetDrag.swallowClick) return;
    sheetStop = sheetStop >= 0.86 ? 0.5 : 0.86;
    setSheet(sheetStop);
  });

  // Subtle top scroll hairline shadow when studio panel body scrolls.
  const updateBodyScroll = () => body.classList.toggle("is-scrolled", body.scrollTop > 4);
  body.addEventListener("scroll", updateBodyScroll, { passive: true });

  /* ----- Photo Studio (viewfinder + collector card darkroom) ----- */
  const photoStudio = $("#photo-studio");
  const photoViewfinder = $("#photo-viewfinder");
  const photoFrame = $("#photo-frame");
  const photoGrid = $("#photo-grid");
  const photoFlash = $("#photo-flash");
  const photoExit = $("#photo-exit");
  const photoGridToggle = $("#photo-grid-toggle");
  const photoOpenBook = $("#photo-open-book");
  const photoAnglesBox = $("#photo-angles");
  const photoAspectsBox = $("#photo-aspects");
  const photoLightsBox = $("#photo-lights");
  const photoBackdropsBox = $("#photo-backdrops");
  const photoShutter = $("#photo-shutter");
  const photoDarkroom = $("#photo-darkroom");
  const photoDeveloping = $("#photo-developing");
  const photoPreview = $("#photo-preview");
  const photoDock = $("#photo-dock");
  const photoTopBar = photoStudio?.querySelector(".photo-top") || null;
  const photoDarkroomControls = $("#photo-darkroom-controls");
  const photoDownload = $("#photo-download");
  const photoCopy = $("#photo-copy");
  const photoShare = $("#photo-share");
  const photoRetake = $("#photo-retake");
  const photoDarkroomClose = $("#photo-darkroom-close");

  const photoState = {
    angle: "photo_hero",
    aspect: "4:5",
    backdrop: "match",
    grid: false,
    template: "specimen",
    showTitle: true,
    showSpecs: true,
    showSwatches: true,
    showMark: true,
    showDate: true,
    caption: "",
    rawCanvas: null,
    darkroomOpen: false,
    developing: false,
    captureToken: 0
  };

  function currentAspectRatio() {
    return (PHOTO_ASPECTS.find((a) => a.id === photoState.aspect) || PHOTO_ASPECTS[0]).ratio;
  }

  function layoutPhotoFrame() {
    if (!photoFrame || !photoStudio || photoStudio.hidden) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const narrow = vw < 820;
    const topRect = photoTopBar?.getBoundingClientRect();
    const dockRect = photoDock?.getBoundingClientRect();
    const safeTop = (topRect && topRect.height > 0 ? topRect.bottom : (narrow ? 66 : 74)) + (narrow ? 12 : 16);
    const safeBottom = (dockRect && dockRect.height > 0 ? dockRect.top : vh - (narrow ? 190 : 158)) - (narrow ? 12 : 18);
    const maxW = Math.max(160, vw - (narrow ? 28 : 96));
    const maxH = Math.max(160, safeBottom - safeTop);
    const ratio = currentAspectRatio();
    let fw = maxW;
    let fh = fw / ratio;
    if (fh > maxH) {
      fh = maxH;
      fw = fh * ratio;
    }
    photoFrame.style.width = `${Math.round(fw)}px`;
    photoFrame.style.height = `${Math.round(fh)}px`;
    photoFrame.style.top = `${Math.round(safeTop + maxH * 0.5)}px`;
  }

  function renderPhotoDock() {
    if (!photoAnglesBox) return;
    photoAnglesBox.replaceChildren(...PHOTO_ANGLES.map((item) => h("button", {
      type: "button",
      role: "radio",
      class: "photo-pill",
      "aria-checked": String(photoState.angle === item.id),
      text: t(item.label),
      onclick: () => {
        photoState.angle = item.id;
        // An open spread is wide: switch portrait framing to 3:2 landscape so
        // both pages stay comfortably inside the viewfinder.
        if (item.id === "photo_spread" && currentAspectRatio() < 1) {
          photoState.aspect = "3:2";
        }
        audio.playCue("tap");
        engine.setPhotoAngle(item.id);
        renderPhotoDock();
        layoutPhotoFrame();
      }
    })));
    photoAspectsBox.replaceChildren(...PHOTO_ASPECTS.map((item) => h("button", {
      type: "button",
      role: "radio",
      class: "photo-pill photo-pill--compact",
      "aria-checked": String(photoState.aspect === item.id),
      text: item.label,
      onclick: () => {
        photoState.aspect = item.id;
        audio.playCue("tap");
        renderPhotoDock();
        layoutPhotoFrame();
      }
    })));
    const lights = [
      { id: "studio", label: "Studio", svg: '<circle cx="8" cy="8" r="2.7"/><path d="M8 2.2v1.6M8 12.2v1.6M2.2 8h1.6M12.2 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12"/>' },
      { id: "morning", label: "Morning", svg: '<path d="M2.5 11.2h11M4.6 11.2a3.4 3.4 0 0 1 6.8 0M8 4.4v1.6M4.2 6.6l1.1 1.1M11.8 6.6l-1.1 1.1"/>' },
      { id: "golden", label: "Golden hour", svg: '<path d="M2.5 11.5h11M4.2 11.5a3.8 3.8 0 0 1 7.6 0M2.8 13.5h10.4"/>' },
      { id: "night", label: "Night", svg: '<path d="M12.2 9.9A4.8 4.8 0 0 1 6.1 3.8a4.8 4.8 0 1 0 6.1 6.1Z"/>' }
    ];
    const currentLight = engine.room?.light || "studio";
    photoLightsBox.replaceChildren(...lights.map((item) => {
      const glyph = icon([], "");
      glyph.innerHTML = item.svg;
      return h("button", {
        type: "button",
        role: "radio",
        class: "stage-bar__light photo-light-btn",
        title: t(item.label),
        "aria-label": t(item.label),
        "aria-checked": String(currentLight === item.id),
        "aria-pressed": String(currentLight === item.id),
        onclick: () => {
          audio.playCue("tap");
          engine.setRoom({ light: item.id });
          try { localStorage.setItem("folio-atelier-room", JSON.stringify(engine.room)); } catch (e) { /* private */ }
          renderPhotoDock();
        }
      }, glyph);
    }));
    photoBackdropsBox.replaceChildren(...PHOTO_BACKDROPS.map((item) => h("button", {
      type: "button",
      role: "radio",
      class: "photo-backdrop-dot",
      title: t(item.label),
      "aria-label": t(item.label),
      "aria-checked": String(photoState.backdrop === item.id),
      style: { background: item.swatch },
      onclick: () => {
        photoState.backdrop = item.id;
        audio.playCue("swatch");
        engine.setPhotoBackdrop?.(item.id);
        renderPhotoDock();
      }
    })));
    photoGrid.hidden = !photoState.grid;
    photoGridToggle.setAttribute("aria-pressed", String(photoState.grid));
    const isOpen = engine.pageState.open;
    photoOpenBook.textContent = t(isOpen ? "Close book" : "Open book");
    photoOpenBook.setAttribute("aria-pressed", String(isOpen));
  }

  function renderDarkroomPreview() {
    const current = book();
    if (!photoState.rawCanvas || !current || !photoPreview) return;
    composePhotoCard(photoState.rawCanvas, current, {
      template: photoState.template,
      showTitle: photoState.showTitle,
      showSpecs: photoState.showSpecs,
      showSwatches: photoState.showSwatches,
      showMark: photoState.showMark,
      showDate: photoState.showDate,
      caption: photoState.caption,
      light: engine.room?.light || "studio",
      transparent: photoState.backdrop === "transparent",
      pageCount: engine.pagination.length || current.pages.length,
      scale: 0.65,
      target: photoPreview
    });
    photoPreview.classList.toggle("is-transparent", photoState.template === "clean" && photoState.backdrop === "transparent");
  }

  function renderDarkroomControls() {
    if (!photoDarkroomControls) return;
    const isClean = photoState.template === "clean";
    const infoToggles = [
      !isClean ? toggle({
        label: "Title & author", value: photoState.showTitle,
        onChange: (value) => { photoState.showTitle = value; renderDarkroomPreview(); }
      }) : null,
      !isClean ? toggle({
        label: "Craft specs", value: photoState.showSpecs,
        onChange: (value) => { photoState.showSpecs = value; renderDarkroomPreview(); }
      }) : null,
      !isClean ? toggle({
        label: "Palette swatches", value: photoState.showSwatches,
        onChange: (value) => { photoState.showSwatches = value; renderDarkroomPreview(); }
      }) : null,
      toggle({
        label: "Atelier mark", value: photoState.showMark,
        onChange: (value) => { photoState.showMark = value; renderDarkroomPreview(); }
      }),
      toggle({
        label: "Date & light", value: photoState.showDate,
        onChange: (value) => { photoState.showDate = value; renderDarkroomPreview(); }
      })
    ].filter(Boolean);

    photoDarkroomControls.replaceChildren(
      h("div", { class: "photo-section" },
        h("span", { class: "field__label", text: t("Card style") }),
        h("div", { class: "photo-templates", role: "radiogroup", "aria-label": t("Card style") },
          PHOTO_TEMPLATES.map((tpl) => h("button", {
            type: "button",
            role: "radio",
            class: "photo-template-btn",
            "aria-checked": String(photoState.template === tpl.id),
            text: t(tpl.label),
            onclick: () => {
              photoState.template = tpl.id;
              audio.playCue("tap");
              renderDarkroomControls();
              renderDarkroomPreview();
            }
          }))
        )
      ),
      h("div", { class: "photo-section" },
        h("span", { class: "field__label", text: t("Card details") }),
        h("div", { class: "photo-toggles" }, infoToggles)
      ),
      !isClean ? h("div", { class: "photo-section" },
        textField({
          label: "Ex-Libris caption",
          value: photoState.caption,
          placeholder: "An optional note on the print…",
          maxLength: 72,
          onInput: (value) => {
            photoState.caption = value;
            renderDarkroomPreview();
          }
        })
      ) : null
    );
    const canShare = Boolean(navigator.share && navigator.canShare);
    if (photoShare) photoShare.hidden = !canShare;
  }

  function openDarkroom(rawCanvas) {
    photoState.rawCanvas = rawCanvas;
    photoState.darkroomOpen = true;
    photoState.developing = false;
    photoViewfinder.hidden = true;
    photoDarkroom.hidden = false;
    photoDarkroom.classList.remove("is-developing");
    if (photoDeveloping) photoDeveloping.hidden = true;
    renderDarkroomControls();
    renderDarkroomPreview();
    photoDownload?.focus({ preventScroll: true });
  }

  function closeDarkroom({ exitStudio = false } = {}) {
    photoState.captureToken += 1;
    photoState.developing = false;
    photoState.darkroomOpen = false;
    photoDarkroom.classList.remove("is-developing");
    if (photoDeveloping) photoDeveloping.hidden = true;
    photoDarkroom.hidden = true;
    photoViewfinder.hidden = false;
    if (photoState.rawCanvas) {
      photoState.rawCanvas.width = 0;
      photoState.rawCanvas.height = 0;
      photoState.rawCanvas = null;
    }
    if (exitStudio) engine.setPhotoMode(false);
    else if (engine.photoMode) layoutPhotoFrame();
  }

  function exportCardCanvas() {
    const current = book();
    if (!photoState.rawCanvas || !current) return null;
    return composePhotoCard(photoState.rawCanvas, current, {
      template: photoState.template,
      showTitle: photoState.showTitle,
      showSpecs: photoState.showSpecs,
      showSwatches: photoState.showSwatches,
      showMark: photoState.showMark,
      showDate: photoState.showDate,
      caption: photoState.caption,
      light: engine.room?.light || "studio",
      transparent: photoState.backdrop === "transparent",
      pageCount: engine.pagination.length || current.pages.length,
      scale: 1
    });
  }

  function triggerPhotoCapture() {
    if (!book() || !engine.photoMode || photoState.darkroomOpen || photoState.developing) return;
    const token = (photoState.captureToken += 1);
    photoState.developing = true;
    audio.playCue("shutter");
    if (photoFlash) {
      photoFlash.classList.remove("is-flashing");
      void photoFlash.offsetWidth;
      photoFlash.classList.add("is-flashing");
    }
    const frameRect = photoFrame?.getBoundingClientRect();
    const cropHeightRatio = frameRect && frameRect.height > 40 ? frameRect.height / window.innerHeight : 0.72;
    // Open the darkroom immediately in a smooth "Developing print…" state so
    // the shutter feels instantaneous and hides the WebGL supersampling cost.
    photoState.darkroomOpen = true;
    photoViewfinder.hidden = true;
    photoDarkroom.hidden = false;
    photoDarkroom.classList.add("is-developing");
    if (photoDeveloping) photoDeveloping.hidden = false;
    renderDarkroomControls();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (token !== photoState.captureToken || !engine.photoMode || !photoState.darkroomOpen) return;
        const captured = engine.captureStudioPhoto({
          aspect: currentAspectRatio(),
          maxEdge: 1440,
          backdrop: photoState.backdrop,
          cropHeightRatio
        });
        if (token !== photoState.captureToken || !engine.photoMode || !photoState.darkroomOpen) {
          if (captured) { captured.width = 0; captured.height = 0; }
          return;
        }
        if (!captured) {
          closeDarkroom({ exitStudio: false });
          toast(t("That did not work. Please try again."));
          return;
        }
        openDarkroom(captured);
      });
    });
  }

  function renderPhotoMode(on) {
    if (!photoStudio) return;
    if (on) {
      setShareMenu(false);
      photoState.angle = "photo_hero";
      photoState.backdrop = "match";
      photoState.darkroomOpen = false;
      photoState.developing = false;
      photoState.captureToken += 1;
      photoStudio.hidden = false;
      photoViewfinder.hidden = false;
      photoDarkroom.hidden = true;
      photoDarkroom.classList.remove("is-developing");
      if (photoDeveloping) photoDeveloping.hidden = true;
      engine.setPhotoBackdrop?.("match");
      renderPhotoDock();
      layoutPhotoFrame();
      requestAnimationFrame(layoutPhotoFrame);
    } else {
      closeDarkroom({ exitStudio: false });
      photoStudio.hidden = true;
      engine.setPhotoBackdrop?.("match");
    }
    syncStudioChrome();
  }

  $("#open-photo-studio")?.addEventListener("click", () => {
    audio.playCue("tap");
    engine.setPhotoMode(true);
  });
  $("#share-photo-studio")?.addEventListener("click", () => {
    setShareMenu(false);
    audio.playCue("tap");
    engine.setPhotoMode(true);
  });
  photoExit?.addEventListener("click", () => {
    audio.playCue("tap");
    engine.setPhotoMode(false);
  });
  photoGridToggle?.addEventListener("click", () => {
    photoState.grid = !photoState.grid;
    audio.playCue("tap");
    renderPhotoDock();
  });
  photoOpenBook?.addEventListener("click", () => {
    engine.toggleReading();
    setTimeout(renderPhotoDock, 40);
  });
  photoShutter?.addEventListener("click", triggerPhotoCapture);
  photoRetake?.addEventListener("click", () => {
    audio.playCue("tap");
    closeDarkroom({ exitStudio: false });
  });
  photoDarkroomClose?.addEventListener("click", () => {
    audio.playCue("tap");
    closeDarkroom({ exitStudio: true });
  });
  photoDownload?.addEventListener("click", async () => {
    const out = exportCardCanvas();
    if (!out) return;
    const blob = await canvasToPngBlob(out);
    out.width = 0; out.height = 0;
    if (!blob) return;
    const suffix = photoState.template === "clean" ? ".png" : `-${photoState.template}.png`;
    downloadBlob(blob, fileName(suffix));
    toast(t("Saved {name}", { name: fileName(suffix) }));
  });
  photoCopy?.addEventListener("click", async () => {
    const out = exportCardCanvas();
    if (!out) return;
    try {
      const ok = await copyCardToClipboard(out);
      toast(t(ok ? "Copied card to clipboard" : "Clipboard copy is unavailable here"));
    } catch (error) {
      toast(t("Clipboard copy is unavailable here"));
    } finally {
      out.width = 0; out.height = 0;
    }
  });
  photoShare?.addEventListener("click", async () => {
    const out = exportCardCanvas();
    if (!out) return;
    try {
      const status = await shareCardNative(out, fileName(`-${photoState.template}.png`), book()?.title);
      if (status === "unsupported") toast(t("Native share is unavailable here — use Save PNG"));
    } finally {
      out.width = 0; out.height = 0;
    }
  });
  window.addEventListener("resize", () => {
    if (engine.photoMode && !photoState.darkroomOpen) layoutPhotoFrame();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && photoState.darkroomOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeDarkroom({ exitStudio: false });
    }
  }, true);

  closeButton.addEventListener("click", () => engine.closeDetail());
  undoButton.addEventListener("click", () => store.step(bookId, -1));
  redoButton.addEventListener("click", () => store.step(bookId, 1));
  shareButton?.addEventListener("click", () => {
    audio.playCue("tap");
    setShareMenu(shareMenu.hidden);
  });
  $("#share-picture")?.addEventListener("click", () => { setShareMenu(false); sharePicture(); });
  $("#share-turntable")?.addEventListener("click", () => { setShareMenu(false); shareTurntable(); });
  $("#share-pdf")?.addEventListener("click", () => { setShareMenu(false); sharePdf(); });
  $("#share-folio")?.addEventListener("click", () => { setShareMenu(false); shareFolio(); });
  document.addEventListener("pointerdown", (event) => {
    if (shareMenu && !shareMenu.hidden && !shareMenu.contains(event.target) && !shareButton.contains(event.target)) {
      setShareMenu(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shareMenu && !shareMenu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      setShareMenu(false);
      shareButton?.focus({ preventScroll: true });
    }
  }, true);

  // Quick 3D camera angles & studio lighting switcher on the workshop stage.
  stageBar?.addEventListener("click", (event) => {
    const viewBtn = event.target.closest("[data-view]");
    if (viewBtn) {
      const view = viewBtn.dataset.view;
      audio.playCue("tap");
      if (engine.pageState.open && view !== "front") engine.setReadingOpen(false, false);
      engine.focusView(view);
      return;
    }
    const lightBtn = event.target.closest("[data-light]");
    if (lightBtn) {
      audio.playCue("tap");
      engine.setRoom({ light: lightBtn.dataset.light });
      try { localStorage.setItem("folio-atelier-room", JSON.stringify(engine.room)); } catch (e) { /* private */ }
    }
  });

  previousPage.addEventListener("click", () => engine.turnPage(-1));
  nextPage.addEventListener("click", () => engine.turnPage(1));
  toggleBook.addEventListener("click", () => engine.toggleReading());
  const readingButton = $("#reading-mode");
  const readingLabel = $("#reading-mode-label");
  readingButton.addEventListener("click", () => engine.setReadingMode(!engine.readingMode));

  /** Reading mode on or off: the button says how to leave, and the panel leaves the tab order. */
  function renderReading(on) {
    readingLabel.textContent = t(on ? "Leave reading" : "Read");
    readingButton.setAttribute("aria-pressed", String(on));
    syncStudioChrome();
    if (on) setShareMenu(false);
    if (on && panel.contains(document.activeElement)) readingButton.focus({ preventScroll: true });
  }
  $("#reset-view").addEventListener("click", () => engine.resetView());

  tabsElement.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = TABS.findIndex((entry) => entry.id === tab);
    setTab(TABS[(index + step + TABS.length) % TABS.length].id);
    tabsElement.querySelector("[aria-selected='true']")?.focus();
  });

  window.addEventListener("keydown", (event) => {
    if (!bookId || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
    const target = event.target;
    // Leave native undo alone while the caret is in a text field.
    if (target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(target.tagName) && target.type !== "range") return;
    event.preventDefault();
    store.step(bookId, event.shiftKey ? 1 : -1);
  });

  store.on("change", ({ book: changed, restored }) => {
    if (changed.id !== bookId) return;
    updateHeader();
    if (restored) {
      markStale();
      renderBody({ keepScroll: true });
      refreshThumbsSoon();
    }
  });
  onFontsLoaded(refreshThumbsSoon);
  store.on("history", ({ id }) => { if (id === bookId) updateHeader(); });
  store.on("saving", ({ book: saving }) => {
    if (saving.id !== bookId) return;
    saveStatus.textContent = t("Saving…");
  });
  /** The resting status: saved, or plainly not, when the browser keeps nothing. */
  function showSaved(detail = false) {
    if (!store.persistent) {
      saveStatus.textContent = t("Not saved — kept for this visit only");
      saveStatus.dataset.state = "error";
      return;
    }
    saveStatus.textContent = t(detail ? "Saved to this browser" : "Saved");
    saveStatus.dataset.state = "ok";
  }

  store.on("saved", ({ book: saved }) => {
    if (saved.id !== bookId) return;
    showSaved(true);
  });
  store.on("save-state", ({ ok }) => {
    if (ok) showSaved(true);
    else {
      saveStatus.textContent = t("Not saved — storage is unavailable");
      saveStatus.dataset.state = "error";
    }
  });

  /** Redraw everything that carries words, after the language changes. */
  function relocalize() {
    if (!bookId) return;
    showSaved();
    markStale();
    renderTabs(true);
    renderBody({ keepScroll: true });
    renderPageState(engine.pageState);
    renderReading(engine.readingMode);
    if (engine.photoMode) {
      renderPhotoDock();
      if (photoState.darkroomOpen) {
        renderDarkroomControls();
        renderDarkroomPreview();
      }
    }
  }

  return {
    show,
    hide,
    relocalize,
    renderPageState,
    renderReading,
    renderPhotoMode,
    renderView,
    renderRoom,
    focus: () => closeButton.focus({ preventScroll: true })
  };
}
