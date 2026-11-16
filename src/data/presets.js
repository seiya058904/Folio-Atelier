// Design vocabulary: materials, foils, cover layouts and whole-book presets.
//
// The first seven presets carry forward the colour systems, cloth, foil and
// motifs of the seven bindings in The Complete Shelf, with their product names
// and artwork removed so they work as neutral starting points.

export const MATERIALS = [
  { id: "cloth", label: "Bookcloth", note: "Fine woven cotton" },
  { id: "linen", label: "Linen", note: "Coarse natural weave" },
  { id: "leather", label: "Leather", note: "Pebbled grain, soft sheen" },
  { id: "paper", label: "Paper", note: "Uncoated laid stock" },
  { id: "velvet", label: "Velvet", note: "Deep pile, strong sheen" }
];

export const FOILS = [
  { id: "gold", label: "Gold", color: "#e2b866", metalness: 0.95, roughness: 0.2 },
  { id: "antique", label: "Antique gold", color: "#efc16d", metalness: 0.94, roughness: 0.26 },
  { id: "copper", label: "Copper", color: "#c87046", metalness: 0.94, roughness: 0.2 },
  { id: "rose", label: "Rose gold", color: "#efb0aa", metalness: 0.92, roughness: 0.22 },
  { id: "silver", label: "Silver", color: "#dbe8f1", metalness: 0.95, roughness: 0.18 },
  { id: "aluminum", label: "Aluminium", color: "#e4e7e5", metalness: 0.9, roughness: 0.3 },
  { id: "white", label: "White pigment", color: "#f6f1e6", metalness: 0.04, roughness: 0.62 },
  { id: "black", label: "Black gloss", color: "#171a16", metalness: 0.34, roughness: 0.22 },
  { id: "custom", label: "Custom", color: "#ffffff", metalness: 0.9, roughness: 0.22 }
];

export const BORDERS = [
  { id: "none", label: "None" },
  { id: "single", label: "Single rule" },
  { id: "double", label: "Double rule" },
  { id: "triple", label: "Thick & thin" },
  { id: "corners", label: "Corner marks" },
  { id: "deco", label: "Deco corners" },
  { id: "arch", label: "Arch" },
  { id: "panel", label: "Title panel" }
];

export const MOTIFS = [
  { id: "none", label: "None" },
  { id: "brackets", label: "Nested brackets" },
  { id: "paths", label: "Crossing paths" },
  { id: "caret", label: "Caret & staves" },
  { id: "orbits", label: "Orbits" },
  { id: "modules", label: "Modules" },
  { id: "frames", label: "Nested frames" },
  { id: "compass", label: "Drafting compass" },
  { id: "sun", label: "Sunburst" },
  { id: "laurel", label: "Laurel wreath" },
  { id: "moon", label: "Moon phases" },
  { id: "waves", label: "Waves" },
  { id: "star", label: "Compass star" },
  { id: "branch", label: "Botanical branch" },
  { id: "lattice", label: "Diamond lattice" },
  { id: "monogram", label: "Monogram" }
];

export const SPINE_STYLES = [
  { id: "frame", label: "Framed" },
  { id: "bands", label: "Raised bands" },
  { id: "rules", label: "Head & tail rules" },
  { id: "none", label: "Plain" }
];

export const EDGE_STYLES = [
  { id: "plain", label: "Natural" },
  { id: "gilt", label: "Gilt" },
  { id: "tinted", label: "Stained" }
];

export const ENDPAPER_PATTERNS = [
  { id: "grid", label: "Fine grid" },
  { id: "plain", label: "Plain" },
  { id: "stripe", label: "Pinstripe" },
  { id: "dots", label: "Dots" },
  { id: "marble", label: "Marbled" }
];

/* ---------- cover layouts ---------- */
// Sizes are in pixels on a 768 × 1152 cover; x / y / width are 0..1 fractions.

const text = (id, source, overrides) => ({
  id,
  source,
  text: "",
  show: true,
  font: "cormorant",
  size: 40,
  weight: 500,
  italic: false,
  tracking: 0,
  upper: false,
  align: "center",
  x: 0.5,
  y: 0.5,
  width: 0.78,
  lineHeight: 1.04,
  finish: "foil",
  color: "#f4eee6",
  ...overrides
});

export const LAYOUTS = {
  classic: {
    label: "Classic",
    front: {
      border: { style: "double", inset: 0.055, finish: "foil", color: "#f4eee6" },
      motif: { x: 0.5, y: 0.37, scale: 1, finish: "foil", color: "#f4eee6", opacity: 0.9 },
      texts: [
        text("series", "series", { font: "inter", size: 17, weight: 500, tracking: 0.24, upper: true, y: 0.105 }),
        text("title", "title", { size: 92, weight: 500, y: 0.7, width: 0.76 }),
        text("subtitle", "subtitle", { font: "inter", size: 16, weight: 500, tracking: 0.2, upper: true, y: 0.79 }),
        text("author", "author", { size: 30, weight: 500, italic: true, y: 0.895 })
      ]
    }
  },
  editorial: {
    label: "Editorial",
    front: {
      border: { style: "none", inset: 0.055, finish: "foil", color: "#f4eee6" },
      motif: { x: 0.56, y: 0.36, scale: 1.25, finish: "foil", color: "#f4eee6", opacity: 0.9 },
      texts: [
        text("series", "series", { font: "inter", size: 15, weight: 500, tracking: 0.2, upper: true, align: "left", x: 0.075, y: 0.062 }),
        text("title", "title", { size: 84, weight: 500, align: "left", x: 0.075, y: 0.855, width: 0.84 }),
        text("subtitle", "subtitle", { font: "inter", size: 15, weight: 500, tracking: 0.18, upper: true, align: "left", x: 0.078, y: 0.925 }),
        text("author", "author", { font: "inter", size: 15, weight: 500, tracking: 0.18, upper: true, align: "right", x: 0.925, y: 0.062 })
      ]
    }
  },
  plate: {
    label: "Plate",
    front: {
      border: { style: "single", inset: 0.06, finish: "foil", color: "#f4eee6" },
      motif: { x: 0.5, y: 0.55, scale: 1.5, finish: "foil", color: "#f4eee6", opacity: 0.9 },
      texts: [
        text("series", "series", { font: "inter", size: 15, weight: 500, tracking: 0.24, upper: true, y: 0.925 }),
        text("title", "title", { font: "playfair", size: 78, weight: 500, y: 0.185 }),
        text("subtitle", "subtitle", { size: 28, italic: true, y: 0.275 }),
        text("author", "author", { font: "inter", size: 17, weight: 500, tracking: 0.22, upper: true, y: 0.865 })
      ]
    }
  },
  minimal: {
    label: "Minimal",
    front: {
      border: { style: "none", inset: 0.055, finish: "foil", color: "#f4eee6" },
      motif: { x: 0.5, y: 0.82, scale: 0.42, finish: "foil", color: "#f4eee6", opacity: 0.9 },
      texts: [
        text("series", "series", { show: false, font: "inter", size: 15, weight: 500, tracking: 0.24, upper: true, y: 0.1 }),
        text("title", "title", { font: "jost", size: 54, weight: 400, tracking: 0.1, upper: true, y: 0.4 }),
        text("subtitle", "subtitle", { show: false, size: 26, italic: true, y: 0.47 }),
        text("author", "author", { font: "jost", size: 18, weight: 400, tracking: 0.24, upper: true, y: 0.475 })
      ]
    }
  },
  monument: {
    label: "Monument",
    front: {
      border: { style: "deco", inset: 0.05, finish: "foil", color: "#f4eee6" },
      motif: { x: 0.5, y: 0.2, scale: 0.6, finish: "foil", color: "#f4eee6", opacity: 0.9 },
      texts: [
        text("series", "series", { font: "cinzel", size: 16, weight: 500, tracking: 0.3, upper: true, y: 0.905 }),
        text("title", "title", { font: "cinzel", size: 76, weight: 500, tracking: 0.06, upper: true, y: 0.5, width: 0.74, lineHeight: 1.16 }),
        text("subtitle", "subtitle", { size: 28, italic: true, y: 0.645 }),
        text("author", "author", { font: "cinzel", size: 22, weight: 500, tracking: 0.2, upper: true, y: 0.8 })
      ]
    }
  },
  panel: {
    label: "Label",
    front: {
      border: { style: "panel", inset: 0.055, finish: "ink", color: "#f1eadf" },
      motif: { x: 0.5, y: 0.74, scale: 0.8, finish: "foil", color: "#f4eee6", opacity: 0.9 },
      texts: [
        text("series", "series", { font: "inter", size: 14, weight: 600, tracking: 0.24, upper: true, y: 0.215, finish: "ink", color: "#2a231c" }),
        text("title", "title", { font: "caslon", size: 58, weight: 400, y: 0.3, width: 0.6, finish: "ink", color: "#1e1813" }),
        text("subtitle", "subtitle", { show: false, size: 24, italic: true, y: 0.37, finish: "ink", color: "#2a231c" }),
        text("author", "author", { size: 26, italic: true, y: 0.385, finish: "ink", color: "#2a231c" })
      ]
    }
  }
};

/* ---------- whole-book presets ---------- */

const palette = (paper, paperDeep, paperPale, ink, inkSoft, shelf, shelfDark, light, fill) => ({
  paper, paperDeep, paperPale, ink, inkSoft, wall: paper, shelf, shelfDark, light, fill
});

export const PRESETS = [
  {
    id: "ultramarine",
    label: "Ultramarine",
    note: "Ultramarine cloth · copper foil",
    material: { kind: "cloth", color: "#182a43" },
    foil: "copper",
    layout: "classic",
    motif: "brackets",
    palette: palette("#171a24", "#10131b", "#f1eadf", "#f4eee6", "#b9b4ae", "#3a2118", "#1c0e0a", "#f4d7b9", "#9fb3c9")
  },
  {
    id: "ember",
    label: "Ember",
    note: "Burnt-orange cloth · antique gold",
    material: { kind: "cloth", color: "#c24d24" },
    foil: "antique",
    layout: "classic",
    motif: "paths",
    palette: palette("#762f1b", "#572113", "#ffe4c5", "#fff0df", "#e3bfa8", "#402015", "#1d0d08", "#ffd19a", "#dc8c6b")
  },
  {
    id: "citron",
    label: "Citron",
    note: "Citron cloth · black gloss",
    material: { kind: "cloth", color: "#afc400" },
    foil: "black",
    layout: "editorial",
    motif: "caret",
    palette: palette("#c3cf21", "#9eaa16", "#f0f2c9", "#171914", "#485015", "#3b2418", "#1c0f09", "#fff6ce", "#dce37e")
  },
  {
    id: "cobalt",
    label: "Cobalt",
    note: "Cobalt cloth · cool silver",
    material: { kind: "cloth", color: "#1537a1" },
    foil: "silver",
    layout: "plate",
    motif: "orbits",
    palette: palette("#142a80", "#0b1953", "#dbe8f1", "#f3f5f2", "#b5c7e9", "#3b2117", "#1a0d08", "#e5edf2", "#5f85dc")
  },
  {
    id: "vermilion",
    label: "Vermilion",
    note: "Vermilion cloth · rose gold",
    material: { kind: "cloth", color: "#c83222" },
    foil: "rose",
    layout: "editorial",
    motif: "modules",
    palette: palette("#a62c21", "#7f1e17", "#ffe0d5", "#fff0e8", "#e9bbb2", "#432016", "#1f0d08", "#ffd1bc", "#d66d66")
  },
  {
    id: "coral",
    label: "Coral",
    note: "Coral cloth · blush foil",
    material: { kind: "cloth", color: "#da3b2f" },
    foil: { preset: "custom", color: "#ff8eab", metalness: 0.9, roughness: 0.21 },
    layout: "classic",
    motif: "frames",
    palette: palette("#ae2830", "#7f1822", "#ffe0df", "#fff0e9", "#efb9b4", "#402016", "#1d0d08", "#ffc3bb", "#e46d78")
  },
  {
    id: "glacier",
    label: "Glacier",
    note: "Icy-cyan cloth · aluminium",
    material: { kind: "cloth", color: "#78a7bd" },
    foil: "aluminum",
    layout: "plate",
    motif: "compass",
    palette: palette("#7ea5b7", "#5e8699", "#e6f0f2", "#102a36", "#274b5a", "#382017", "#1b0e09", "#eef5f2", "#add1df")
  },
  {
    id: "nocturne",
    label: "Nocturne",
    note: "Black leather · gold",
    material: { kind: "leather", color: "#17181b" },
    foil: "gold",
    layout: "monument",
    motif: "laurel",
    edge: { style: "gilt", color: "#d9b25f" }
  },
  {
    id: "oxblood",
    label: "Oxblood",
    note: "Oxblood leather · antique gold",
    material: { kind: "leather", color: "#5a1a1c" },
    foil: "antique",
    layout: "classic",
    motif: "star",
    spine: "bands",
    edge: { style: "gilt", color: "#d9b25f" }
  },
  {
    id: "oat",
    label: "Oat",
    note: "Natural linen · black pigment",
    material: { kind: "linen", color: "#cdbf9f" },
    foil: "black",
    layout: "minimal",
    motif: "branch"
  },
  {
    id: "forest",
    label: "Forest",
    note: "Forest linen · gold",
    material: { kind: "linen", color: "#1f4033" },
    foil: "gold",
    layout: "plate",
    motif: "sun"
  },
  {
    id: "plum",
    label: "Plum",
    note: "Plum velvet · rose gold",
    material: { kind: "velvet", color: "#4a2046" },
    foil: "rose",
    layout: "monument",
    motif: "moon"
  },
  {
    id: "bone",
    label: "Bone",
    note: "Bone paper · printed label",
    material: { kind: "paper", color: "#3c4a45" },
    foil: "white",
    layout: "panel",
    motif: "waves",
    edge: { style: "tinted", color: "#c6532f" }
  },
  {
    id: "blank",
    label: "Blank",
    note: "Plain cloth, nothing printed",
    material: { kind: "cloth", color: "#b9ae98" },
    foil: "gold",
    layout: "classic",
    motif: "none",
    blank: true
  }
];

export const getPreset = (id) => PRESETS.find((preset) => preset.id === id) || PRESETS[0];
export const getFoil = (id) => FOILS.find((foil) => foil.id === id) || FOILS[0];
