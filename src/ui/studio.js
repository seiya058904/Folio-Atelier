// The studio workbench: every control that edits the open book.
// Edits go through the store; the engine repaints the 3D book from the same
// change event, so the model is always the thing you are looking at.

import { FONTS, getFont } from "../data/fonts.js";
import {
  BORDERS,
  EDGE_STYLES,
  ENDPAPER_PATTERNS,
  FOILS,
  LAYOUTS,
  MATERIALS,
  MOTIFS,
  PRESETS,
  SPINE_STYLES,
  getFoil
} from "../data/presets.js";
import { addImage, getImage } from "../state/images.js";
import {
  PAGE_TYPES,
  applyLayout,
  applyPreset,
  createPage,
  layerText
} from "../state/schema.js";
import { PAPER_STOCKS } from "../textures/surface.js";
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
import { ICONS, h, icon, pickFile, toast } from "./dom.js";
import { drawCoverThumb, drawMotifGlyph } from "./thumbs.js";

const $ = (selector) => document.querySelector(selector);

const TABS = [
  { id: "design", label: "Design", view: "front" },
  { id: "cover", label: "Cover", view: "front" },
  { id: "spine", label: "Spine", view: "spine" },
  { id: "back", label: "Back", view: "back" },
  { id: "details", label: "Details", view: "details" },
  { id: "pages", label: "Pages", view: "pages" }
];

const CLOTH_COLORS = [
  "#182a43", "#1537a1", "#78a7bd", "#1f4033", "#5d6b3a", "#afc400", "#cdbf9f", "#b9ae98",
  "#c24d24", "#c83222", "#da3b2f", "#5a1a1c", "#4a2046", "#3c4a45", "#17181b", "#efe8da"
];
const INK_COLORS = ["#f3ece0", "#1d1813", "#c6532f", "#b8892f", "#2f4a3c", "#1f3a6b", "#7a2a34"];
const EDGE_COLORS = ["#d9b25f", "#c9ccd1", "#c6532f", "#1f3a6b", "#2f4a3c", "#17181b", "#e7a9b4"];
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
  { id: "ink", label: "Print" },
  { id: "blind", label: "Blind" }
];
const LAYER_NAMES = {
  series: "Series line", title: "Title", subtitle: "Subtitle", author: "Author",
  "spine-title": "Title", "spine-author": "Author", "spine-mark": "Head mark",
  "back-blurb": "Blurb", "back-title": "Title", "back-author": "Author", "back-imprint": "Imprint"
};
const PAGE_LABEL = Object.fromEntries(PAGE_TYPES.map((type) => [type.id, type.label]));

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
  const openLayers = new Set();
  let thumbJobs = [];

  const book = () => store.get(bookId);

  /** Apply an edit to the open book. */
  function edit(mutate, dirty, { key = null, rerender = false } = {}) {
    if (!bookId) return;
    store.update(bookId, mutate, { dirty, key });
    if (rerender) renderBody();
  }

  /* ---------------------------------------------------------------- */
  /* Header, tabs                                                       */
  /* ---------------------------------------------------------------- */

  function renderTabs() {
    tabsElement.replaceChildren(...TABS.map((entry) => h("button", {
      class: "tab",
      type: "button",
      role: "tab",
      id: `tab-${entry.id}`,
      "aria-selected": String(entry.id === tab),
      tabIndex: entry.id === tab ? 0 : -1,
      text: entry.label,
      onclick: () => setTab(entry.id)
    })));
    body.setAttribute("aria-labelledby", `tab-${tab}`);
  }

  function setTab(next, { focusView = true } = {}) {
    if (next === tab && body.childElementCount) {
      if (focusView) applyTabView();
      return;
    }
    tab = next;
    renderTabs();
    renderBody();
    body.scrollTop = 0;
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
  /* Thumbnails (painted after layout so the panel appears at once)     */
  /* ---------------------------------------------------------------- */

  function queueThumb(job) {
    thumbJobs.push(job);
  }

  function flushThumbs() {
    const jobs = thumbJobs;
    thumbJobs = [];
    let index = 0;
    const step = () => {
      const started = performance.now();
      while (index < jobs.length && performance.now() - started < 8) {
        jobs[index]();
        index += 1;
      }
      if (index < jobs.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const coverCanvas = () => h("canvas", { class: "tile__art", width: 132, height: 198 });
  const glyphCanvas = () => h("canvas", { class: "tile__glyph", width: 96, height: 96 });

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
        value: target().finish,
        options: FINISHES,
        onChange: (value) => {
          edit(() => { target().finish = value; }, dirty);
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
        render: (option) => {
          const canvas = glyphCanvas();
          queueThumb(() => drawMotifGlyph(canvas, option.id));
          return canvas;
        },
        onChange: (value) => edit(() => { motif().key = value; }, [face])
      }),
      row(
        slider({
          label: "Size", value: motif().scale, min: 0.25, max: 2.2, step: 0.01, format: percent,
          onInput: (value) => edit(() => { motif().scale = value; }, [face], { key: `${face}-motif-scale` })
        }),
        slider({
          label: "Across", value: motif().x, min: 0.1, max: 0.9, step: 0.005, format: percent,
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
    const options = face === "back" ? BORDERS.filter((entry) => entry.id !== "panel") : BORDERS;
    return [
      row(
        select({
          label: "Frame", value: border().style, options,
          onChange: (value) => edit(() => {
            border().style = value;
            if (value === "panel") { border().finish = "ink"; border().color = "#f1eadf"; }
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

  /** One collapsible lettering layer. */
  function layerEditor(face, layerId) {
    const layer = () => book()[face].texts.find((candidate) => candidate.id === layerId);
    const current = layer();
    if (!current) return null;
    const dirty = [face];
    const key = (suffix) => `${face}-${layerId}-${suffix}`;
    const isSpine = face === "spine";
    const removable = layerId.startsWith("extra-");
    const font = getFont(current.font);

    const preview = h("span", { class: "layer__preview" });
    const details = h("details", { class: "layer", open: openLayers.has(layerId) });
    const refreshSummary = () => {
      const value = layerText(book(), layer());
      preview.textContent = value || "Empty";
      preview.dataset.empty = String(!value);
      details.dataset.hidden = String(!layer().show);
    };
    refreshSummary();
    details.addEventListener("toggle", () => {
      if (details.open) openLayers.add(layerId);
      else openLayers.delete(layerId);
    });

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
            label: "Across", value: current.x, min: 0.04, max: 0.96, step: 0.005, format: percent,
            onInput: (value) => edit(() => { layer().x = value; }, dirty, { key: key("x") })
          }),
          slider({
            label: "Down", value: current.y, min: 0.04, max: 0.96, step: 0.005, format: percent,
            onInput: (value) => edit(() => { layer().y = value; }, dirty, { key: key("y") })
          }),
          slider({
            label: "Measure", value: current.width, min: 0.2, max: 0.92, step: 0.01, format: percent,
            onInput: (value) => edit(() => { layer().width = value; }, dirty, { key: key("width") })
          })
        )
      ];

    details.append(
      h("summary", { class: "layer__summary" },
        h("span", { class: "layer__name", text: LAYER_NAMES[layerId] || "Line" }),
        preview,
        icon(ICONS.chevron, "layer__chevron")
      ),
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
            label: "Typeface", value: current.font, options: FONTS,
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
            label: "Tracking", value: current.tracking, min: -0.04, max: 0.5, step: 0.005,
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
          }) : null
        ),
        placement,
        ...finishControls(layer, dirty, `${face}-${layerId}`),
        removable ? h("button", {
          class: "link-button link-button--danger",
          type: "button",
          text: "Remove this line",
          style: { justifySelf: "start" },
          onclick: () => edit(() => {
            const texts = book()[face].texts;
            texts.splice(texts.findIndex((candidate) => candidate.id === layerId), 1);
          }, dirty, { rerender: true })
        }) : null
      )
    );
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
          text: "A new line",
          show: true,
          y: 0.5,
          x: template.align === "left" ? template.x : 0.5
        });
      }, [face], { rerender: true });
    };
    return group("Lettering", hint,
      h("div", {}, current[face].texts.map((layer) => layerEditor(face, layer.id))),
      face !== "spine" ? h("button", {
        class: "link-button", type: "button", text: "Add a line", style: { justifySelf: "start" }, onclick: addLine
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
        edit(() => { book()[property] = property === "title" ? value || "Untitled" : value; }, ["meta"], { key: `meta-${property}` });
        updateHeader();
      }
    });

    const presetTiles = tiles({
      label: "Binding preset",
      value: current.preset,
      options: PRESETS,
      render: (option) => {
        const canvas = coverCanvas();
        queueThumb(() => {
          const sample = applyPreset(deepClone(book()), option.id);
          drawCoverThumb(canvas, sample);
        });
        return canvas;
      },
      onChange: (value) => {
        audio.playCue("select", { gain: 0.5 });
        edit(() => { applyPreset(book(), value); }, ["all"], { rerender: true });
      }
    });

    const foilSwatches = FOILS.filter((foil) => foil.id !== "custom").map((foil) => ({
      color: foil.color, label: foil.label, value: foil.id, metal: foil.metalness > 0.5
    }));

    return [
      group("The book", "These words are shared by the cover, spine, back and title page.",
        sharedField("title", "Title", "Untitled", true),
        sharedField("subtitle", "Subtitle", "Optional"),
        row(sharedField("author", "Author", "Your name"), sharedField("series", "Series", "Optional"))
      ),
      group("Bindings", "A complete starting point: cloth, foil, layout and ornament. Your words and pages are kept.",
        presetTiles
      ),
      group("Material", null,
        segmented({
          label: "Covering", value: current.material.kind, options: MATERIALS,
          onChange: (value) => edit(() => { book().material.kind = value; }, ["material"])
        }),
        colorField({
          label: "Colour", value: current.material.color, swatches: CLOTH_COLORS,
          onInput: (value) => edit(() => {
            const target = book();
            target.material.color = value;
            // A hand-picked colour leaves the preset's room behind.
            target.palette = null;
          }, ["material"], { key: "material-color" })
        })
      ),
      group("Foil", "Used for everything stamped in foil on the boards and spine.",
        colorField({
          label: "Foil", value: current.foil.preset, swatches: foilSwatches,
          onInput: (value, custom) => edit(() => {
            const target = book();
            if (custom) {
              target.foil = { ...target.foil, preset: "custom", color: value };
            } else {
              const foil = getFoil(value);
              target.foil = { preset: foil.id, color: foil.color, metalness: foil.metalness, roughness: foil.roughness };
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
    const chooseImage = async () => {
      const file = await pickFile(imageInput);
      if (!file) return;
      const id = await addImage(file);
      if (!id) {
        toast("That image could not be read.");
        return;
      }
      edit(() => {
        book().front.image = { id, mode: book().front.image?.mode || "full", opacity: 1 };
      }, ["front"], { rerender: true });
    };

    return [
      group("Layout", "How the title, ornament and names sit on the board.",
        tiles({
          label: "Cover layout",
          value: current.front.layout,
          options: layoutOptions,
          render: (option) => {
            const canvas = coverCanvas();
            queueThumb(() => drawCoverThumb(canvas, applyLayout(deepClone(book()), option.id)));
            return canvas;
          },
          onChange: (value) => edit(() => { applyLayout(book(), value); }, ["front"], { rerender: true })
        })
      ),
      group("Border", null, ...borderEditor("front")),
      group("Ornament", null, ...motifEditor("front")),
      group("Artwork", "Use your own picture as the whole cover or as an inset plate. Foil and print sit on top.",
        h("div", { class: "upload" },
          image ? thumb : null,
          h("button", { class: "link-button", type: "button", text: image ? "Replace image" : "Upload an image", onclick: chooseImage }),
          image ? h("button", {
            class: "link-button link-button--danger", type: "button", text: "Remove",
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
        ) : null
      ),
      letteringGroup("front", "Each line can use the book's shared words or its own text.")
    ];
  }

  function spineTab() {
    const current = book();
    const spine = () => book().spine;
    return [
      group("Structure", null,
        segmented({
          label: "Tooling", value: current.spine.style, options: SPINE_STYLES,
          onChange: (value) => edit(() => { spine().style = value; }, ["spine"])
        }),
        segmented({
          label: "Tail emblem", value: current.spine.emblem,
          options: [{ id: "none", label: "None" }, { id: "ring", label: "Ring" }, { id: "motif", label: "Ornament" }],
          onChange: (value) => edit(() => { spine().emblem = value; }, ["spine"])
        }),
        ...finishControls(spine, ["spine"], "spine")
      ),
      letteringGroup("spine", "Long titles shrink to fit. Chinese, Japanese and Korean titles are set upright.")
    ];
  }

  function backTab() {
    const current = book();
    const blurb = () => book().back.texts.find((layer) => layer.id === "back-blurb");
    return [
      blurb() ? group("Blurb", "A few lines for the back board.",
        textArea({
          label: "Text", value: blurb().text, placeholder: "What is this book, and who is it for?",
          onInput: (value) => edit(() => { blurb().text = value; blurb().show = true; }, ["back"], { key: "back-blurb-text" })
        })
      ) : null,
      group("Ornament", null, ...motifEditor("back", [{ id: "rings", label: "Registration rings" }])),
      group("Border", null, ...borderEditor("back")),
      current.back.texts.length ? letteringGroup("back", null) : null
    ];
  }

  function detailsTab() {
    const current = book();
    const details = () => book().details;
    const edgeColour = h("div");
    const paintEdge = () => {
      edgeColour.replaceChildren(details().edge.style === "plain" ? "" : colorField({
        label: details().edge.style === "gilt" ? "Leaf" : "Stain",
        value: details().edge.color,
        swatches: EDGE_COLORS,
        metal: details().edge.style === "gilt",
        onInput: (value) => edit(() => { details().edge.color = value; }, ["details"], { key: "edge-color" })
      }));
    };
    paintEdge();

    return [
      group("Page edges", "Gilding and staining show on the three trimmed edges of the block.",
        segmented({
          label: "Finish", value: current.details.edge.style, options: EDGE_STYLES,
          onChange: (value) => {
            edit(() => {
              details().edge.style = value;
              if (value === "gilt") details().edge.color = "#d9b25f";
              if (value === "tinted") details().edge.color = "#c6532f";
            }, ["details"]);
            paintEdge();
          }
        }),
        edgeColour
      ),
      group("Endpapers", "The sheets pasted inside the boards — open the cover to see them.",
        select({
          label: "Pattern", value: current.details.endpaper.pattern, options: ENDPAPER_PATTERNS,
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
        toggle({
          label: "Ribbon marker", value: current.details.ribbon.show,
          onChange: (value) => edit(() => { details().ribbon.show = value; }, ["details"])
        }),
        colorField({
          label: "Ribbon", value: current.details.ribbon.color, swatches: EDGE_COLORS,
          onInput: (value) => edit(() => { details().ribbon.color = value; }, ["details"], { key: "ribbon-color" })
        }),
        colorField({
          label: "Headbands", value: current.details.headband.color, swatches: EDGE_COLORS,
          onInput: (value) => edit(() => { details().headband.color = value; }, ["details"], { key: "headband-color" })
        })
      ),
      group("Paper", "The stock the book is printed on.",
        segmented({
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
      case "chapter": return page.title || "Untitled chapter";
      case "body": return first(page.heading) || first(page.text) || "Empty text";
      case "quote":
      case "dedication": return first(page.text) || "Empty";
      case "plate": return first(page.caption) || (page.image ? "Image" : "Ornament");
      case "colophon": return first(page.text) || "Written for you";
      case "contents": return page.heading || "Contents";
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
        h("p", { class: "group__hint", text: "Title, subtitle, author and series come from the Design tab." })
      );
    } else if (page.type === "contents") {
      fields.push(
        textField({ label: "Heading", value: page.heading, placeholder: "Contents", onInput: set("heading", { later: true }) }),
        h("p", { class: "group__hint", text: "The list is built from your chapter openers, with their page numbers." })
      );
    } else if (page.type === "plate") {
      const choose = async () => {
        const file = await pickFile(imageInput);
        if (!file) return;
        const id = await addImage(file);
        if (!id) { toast("That image could not be read."); return; }
        edit(() => { target().image = id; }, ["pages"], { rerender: true });
      };
      fields.push(
        h("div", { class: "upload" },
          h("button", { class: "link-button", type: "button", text: page.image ? "Replace image" : "Upload an image", onclick: choose }),
          page.image ? h("button", {
            class: "link-button link-button--danger", type: "button", text: "Remove",
            onclick: () => edit(() => { target().image = null; }, ["pages"], { rerender: true })
          }) : null
        ),
        page.image ? null : select({
          label: "Ornament", value: page.motif || "",
          options: [{ id: "", label: "Same as the cover" }, ...MOTIFS.slice(1)],
          onChange: set("motif")
        }),
        textField({ label: "Caption", value: page.caption, placeholder: "Optional", onInput: set("caption", { later: true }) })
      );
    } else if (page.type === "colophon") {
      fields.push(textArea({
        label: "Colophon", value: page.text,
        placeholder: "Leave empty and one is written for you from the book's typefaces and binding.",
        onInput: set("text", { later: true })
      }));
    } else {
      fields.push(h("p", { class: "group__hint", text: page.type === "halftitle"
        ? "The half-title shows the book's title alone. Change it in the Design tab."
        : "A blank page — useful for starting a chapter on a right-hand page." }));
    }
    return h("div", { class: "page-editor" },
      h("div", { class: "page-editor__head" },
        h("h3", { class: "group__title", text: PAGE_LABEL[page.type] || "Page" })
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
          title: "Drag to reorder",
          onpointerdown: () => { item.draggable = true; },
          onpointerup: () => { item.draggable = false; }
        }, (() => {
          const svg = icon([], "");
          svg.innerHTML = '<circle cx="5.5" cy="4" r="1.1"/><circle cx="10.5" cy="4" r="1.1"/><circle cx="5.5" cy="8" r="1.1"/><circle cx="10.5" cy="8" r="1.1"/><circle cx="5.5" cy="12" r="1.1"/><circle cx="10.5" cy="12" r="1.1"/>';
          return svg;
        })()),
        h("button", { class: "page-item__main", type: "button", onclick: () => selectPage(page.id) },
          h("span", { class: "page-item__type", text: PAGE_LABEL[page.type] || "Page" }),
          h("span", { class: "page-item__text", text: pageSummary(page) })
        ),
        h("span", { class: "page-item__tools" },
          h("button", {
            class: "mini-button", type: "button", "aria-label": "Move up", disabled: index === 0,
            onclick: () => movePage(index, index - 1)
          }, icon(ICONS.up)),
          h("button", {
            class: "mini-button", type: "button", "aria-label": "Move down", disabled: index === current.pages.length - 1,
            onclick: () => movePage(index, index + 1)
          }, icon(ICONS.down)),
          h("button", {
            class: "mini-button", type: "button", "aria-label": "Duplicate page",
            onclick: () => {
              const copy = { ...deepClone(page), id: uid("pg") };
              selectedPageId = copy.id;
              edit(() => { book().pages.splice(index + 1, 0, copy); }, ["pages"], { rerender: true });
            }
          }, icon(ICONS.copy)),
          h("button", {
            class: "mini-button", type: "button", "aria-label": "Delete page", disabled: current.pages.length <= 1,
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

    return [
      group("Pages", "Select a page to edit it and to turn the book to it. Drag to reorder.",
        pageList(),
        selected ? pageEditor(selected) : null,
        h("div", { class: "field" },
          h("span", { class: "field__label", text: selected ? "Add after this page" : "Add a page" }),
          h("div", { class: "add-pages" }, PAGE_TYPES.map((type) => h("button", {
            class: "chip", type: "button", title: type.note, text: type.label, onclick: () => addPage(type.id)
          })))
        )
      ),
      group("Typography", "Applies to every page in the book.",
        row(
          select({
            label: "Text face", value: current.interior.bodyFont, options: textFonts,
            onChange: (value) => edit(() => { interior().bodyFont = value; }, ["interior"])
          }),
          select({
            label: "Heading face", value: current.interior.headingFont, options: FONTS,
            onChange: (value) => edit(() => { interior().headingFont = value; }, ["interior"])
          })
        ),
        slider({
          label: "Text size", value: current.interior.scale, min: 0.8, max: 1.35, step: 0.01,
          format: (value) => `${(value * 10.5).toFixed(1)} pt`,
          onInput: (value) => edit(() => { interior().scale = value; }, ["interior"], { key: "interior-scale" })
        }),
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
    pages: pagesTab
  };

  function renderBody({ keepScroll = true } = {}) {
    if (!book()) return;
    const scroll = body.scrollTop;
    thumbJobs = [];
    const focused = document.activeElement;
    const focusId = body.contains(focused) ? focused.id : null;
    body.replaceChildren(...TAB_BUILDERS[tab]().filter(Boolean));
    if (keepScroll) body.scrollTop = scroll;
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    flushThumbs();
    updateHeader();
  }

  /* ---------------------------------------------------------------- */
  /* Reader bar                                                         */
  /* ---------------------------------------------------------------- */

  function renderPageState(state) {
    previousPage.disabled = state.locked || state.spread === 0;
    nextPage.disabled = state.locked || state.spread >= state.spreads - 1;
    toggleBook.textContent = state.open ? "Close book" : "Open book";
    toggleBook.setAttribute("aria-pressed", String(state.open));
    if (!state.open) {
      pageLabel.textContent = "Closed";
      pageCounter.textContent = "Click the book to open it";
      return;
    }
    const entry = state.right || state.left;
    pageLabel.textContent = entry ? entry.label : "End of the book";
    const numbers = [state.leftIndex, state.rightIndex].filter((index) => index >= 0).map((index) => index + 1);
    pageCounter.textContent = numbers.length
      ? `${numbers.length > 1 ? "Pages" : "Page"} ${numbers.join("–")} of ${state.pages}`
      : `${state.pages} pages`;

    // Keep the page list in step with what the book is showing.
    if (tab === "pages") {
      const visible = [state.right?.source, state.left?.source].filter(Boolean);
      if (visible.length && !visible.includes(selectedPageId)) {
        selectedPageId = visible[0];
        renderBody({ keepScroll: true });
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Show / hide                                                        */
  /* ---------------------------------------------------------------- */

  function show(target) {
    bookId = target.id;
    tab = "design";
    selectedPageId = null;
    openLayers.clear();
    panel.inert = false;
    panel.setAttribute("aria-hidden", "false");
    readerBar.inert = false;
    readerBar.setAttribute("aria-hidden", "false");
    saveStatus.textContent = "Saved";
    saveStatus.dataset.state = "ok";
    renderTabs();
    renderBody({ keepScroll: false });
    body.scrollTop = 0;
  }

  function hide() {
    panel.inert = true;
    panel.setAttribute("aria-hidden", "true");
    readerBar.inert = true;
    readerBar.setAttribute("aria-hidden", "true");
    store.flush();
    bookId = null;
  }

  /* ---------------------------------------------------------------- */
  /* Wiring                                                             */
  /* ---------------------------------------------------------------- */

  closeButton.addEventListener("click", () => engine.closeDetail());
  undoButton.addEventListener("click", () => store.step(bookId, -1));
  redoButton.addEventListener("click", () => store.step(bookId, 1));
  previousPage.addEventListener("click", () => engine.turnPage(-1));
  nextPage.addEventListener("click", () => engine.turnPage(1));
  toggleBook.addEventListener("click", () => engine.toggleReading());
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
    if (restored) renderBody({ keepScroll: true });
  });
  store.on("history", ({ id }) => { if (id === bookId) updateHeader(); });
  store.on("saving", ({ book: saving }) => {
    if (saving.id !== bookId) return;
    saveStatus.textContent = "Saving…";
  });
  store.on("saved", ({ book: saved }) => {
    if (saved.id !== bookId) return;
    saveStatus.textContent = "Saved to this browser";
    saveStatus.dataset.state = "ok";
  });
  store.on("save-state", ({ ok }) => {
    saveStatus.textContent = ok ? "Saved to this browser" : "Not saved — storage is unavailable";
    saveStatus.dataset.state = ok ? "ok" : "error";
  });

  return { show, hide, renderPageState, focus: () => closeButton.focus({ preventScroll: true }) };
}
