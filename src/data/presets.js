// Design vocabulary: materials, foils, cover layouts and whole-book presets.
//
// The first seven presets carry forward the colour systems, cloth, foil and
// motifs of the seven bindings in The Complete Shelf, with their product names
// and artwork removed so they work as neutral starting points.

export const MATERIALS = [
  { id: "cloth", label: "Bookcloth", note: "Fine woven cotton" },
  { id: "buckram", label: "Buckram", note: "Heavy, open canvas weave" },
  { id: "linen", label: "Linen", note: "Coarse natural weave" },
  { id: "silk", label: "Silk", note: "Fine rib, liquid sheen" },
  { id: "leather", label: "Leather", note: "Pebbled grain, soft sheen" },
  { id: "suede", label: "Suede", note: "Brushed nap, no shine" },
  { id: "vellum", label: "Vellum", note: "Smooth, faintly veined skin" },
  { id: "paper", label: "Paper", note: "Uncoated laid stock" },
  { id: "velvet", label: "Velvet", note: "Deep pile, strong sheen" },
  { id: "canvas", label: "Canvas", note: "Thick, uneven cotton duck" },
  { id: "denim", label: "Denim", note: "Diagonal twill, pale weft showing" },
  { id: "cork", label: "Cork", note: "Pressed granules, warm and matte" },
  { id: "snakeskin", label: "Snakeskin", note: "Domed scales with a soft gloss" },
  { id: "wood", label: "Wood veneer", note: "Sliced grain under a satin lacquer" },
  { id: "acrylic", label: "Acrylic", note: "Smooth cast sheet, high gloss" },
  { id: "washi", label: "Washi", note: "Handmade mulberry paper with long fibres" },
  { id: "lacquer", label: "Lacquer", note: "Hand-rubbed urushi lustre, deep satin gloss" },
  { id: "tweed", label: "Tweed", note: "Heathered woollen twill with warm flecks" }
];

export const BINDING_STYLES = [
  { id: "full", label: "Full" },
  { id: "quarter", label: "Quarter" },
  { id: "half", label: "Half" }
];

export const FOILS = [
  { id: "gold", label: "Gold", color: "#e2b866", metalness: 0.95, roughness: 0.2 },
  { id: "antique", label: "Antique gold", color: "#efc16d", metalness: 0.94, roughness: 0.26 },
  { id: "champagne", label: "Champagne", color: "#ecd9b0", metalness: 0.93, roughness: 0.22 },
  { id: "copper", label: "Copper", color: "#c87046", metalness: 0.94, roughness: 0.2 },
  { id: "bronze", label: "Bronze", color: "#9a6a3c", metalness: 0.93, roughness: 0.3 },
  { id: "rose", label: "Rose gold", color: "#efb0aa", metalness: 0.92, roughness: 0.22 },
  { id: "silver", label: "Silver", color: "#dbe8f1", metalness: 0.95, roughness: 0.18 },
  { id: "aluminum", label: "Aluminium", color: "#e4e7e5", metalness: 0.9, roughness: 0.3 },
  { id: "gunmetal", label: "Gunmetal", color: "#6c7480", metalness: 0.94, roughness: 0.28 },
  { id: "platinum", label: "Platinum", color: "#e5e3de", metalness: 0.96, roughness: 0.22 },
  { id: "verdigris", label: "Verdigris", color: "#5e9b8b", metalness: 0.82, roughness: 0.36 },
  { id: "emerald", label: "Emerald", color: "#3fae84", metalness: 0.93, roughness: 0.2 },
  { id: "sapphire", label: "Sapphire", color: "#4f7fe0", metalness: 0.93, roughness: 0.2 },
  { id: "ruby", label: "Ruby", color: "#d2414f", metalness: 0.93, roughness: 0.2 },
  { id: "aurora", label: "Aurora gold", color: "#edd08e", metalness: 0.95, roughness: 0.16, iridescence: 0.85 },
  { id: "holo", label: "Holographic", color: "#e9eef4", metalness: 0.96, roughness: 0.14, iridescence: 1 },
  { id: "pearl", label: "Pearl", color: "#f4efe6", metalness: 0.3, roughness: 0.3, iridescence: 0.7 },
  { id: "white", label: "White pigment", color: "#f6f1e6", metalness: 0.04, roughness: 0.62 },
  { id: "black", label: "Black gloss", color: "#171a16", metalness: 0.34, roughness: 0.22 },
  { id: "custom", label: "Custom", color: "#ffffff", metalness: 0.9, roughness: 0.22 }
];

export const BORDERS = [
  { id: "none", label: "None" },
  { id: "single", label: "Single rule" },
  { id: "double", label: "Double rule" },
  { id: "triple", label: "Thick & thin" },
  { id: "rounded", label: "Rounded rule" },
  { id: "corners", label: "Corner marks" },
  { id: "deco", label: "Deco corners" },
  { id: "ornate", label: "Flourished corners" },
  { id: "beaded", label: "Beaded" },
  { id: "meander", label: "Greek key" },
  { id: "scallop", label: "Scalloped" },
  { id: "lozenge", label: "Lozenge" },
  { id: "arch", label: "Arch" },
  { id: "fillets", label: "Tooled fillets" },
  { id: "roll", label: "Leaf roll" },
  { id: "fleurons", label: "Corner fleurons" },
  { id: "panel", label: "Title panel" },
  { id: "slip", label: "Title slip" }
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
  { id: "monogram", label: "Monogram" },
  { id: "seal", label: "Seal" },
  { id: "lotus", label: "Lotus" },
  { id: "cloud", label: "Auspicious cloud" },
  { id: "peaks", label: "Peaks" },
  { id: "bamboo", label: "Bamboo" },
  { id: "crescent", label: "Crescent & stars" },
  { id: "tree", label: "Tree" },
  { id: "feather", label: "Quill" },
  { id: "key", label: "Key" },
  { id: "hourglass", label: "Hourglass" },
  { id: "eye", label: "Eye" },
  { id: "anchor", label: "Anchor" },
  { id: "fleur", label: "Fleur-de-lis" },
  { id: "crown", label: "Crown" },
  { id: "knot", label: "Eight-point star" },
  { id: "rosette", label: "Rosette" },
  { id: "book", label: "Book" },
  { id: "heart", label: "Heart" },
  { id: "astrolabe", label: "Astrolabe" },
  { id: "moth", label: "Moth" },
  { id: "plum", label: "Plum blossom" },
  { id: "swallow", label: "Swallow" },
  { id: "archway", label: "Archway" },
  { id: "rose", label: "Tudor rose" }
];

// All-over patterns for the boards and the endpapers.
export const PATTERNS = [
  { id: "none", label: "None" },
  { id: "pinstripe", label: "Pinstripe" },
  { id: "bands", label: "Awning stripe" },
  { id: "diagonal", label: "Diagonal" },
  { id: "check", label: "Check" },
  { id: "dots", label: "Dots" },
  { id: "harlequin", label: "Harlequin" },
  { id: "chevron", label: "Chevron" },
  { id: "herringbone", label: "Herringbone" },
  { id: "seigaiha", label: "Wave scales" },
  { id: "shippo", label: "Linked circles" },
  { id: "honeycomb", label: "Honeycomb" },
  { id: "meander", label: "Fret" },
  { id: "stars", label: "Stars" },
  { id: "sprigs", label: "Sprigs" },
  { id: "clouds", label: "Clouds" },
  { id: "marble", label: "Marbled" },
  { id: "speckle", label: "Sprinkled" },
  { id: "paste", label: "Paste paper" },
  { id: "contour", label: "Contour map" },
  { id: "damask", label: "Damask" },
  { id: "celestial", label: "Celestial chart" },
  { id: "artnouveau", label: "Art Nouveau vines" },
  { id: "icecrack", label: "Ice-crackle lattice" }
];

export const SPINE_STYLES = [
  { id: "frame", label: "Framed" },
  { id: "double", label: "Double frame" },
  { id: "bands", label: "Raised bands" },
  { id: "bands5", label: "Five raised bands" },
  { id: "panels", label: "Panelled" },
  { id: "compartments", label: "Tooled compartments" },
  { id: "artdeco", label: "Art Deco steps" },
  { id: "rules", label: "Head & tail rules" },
  { id: "none", label: "Plain" }
];

export const SPINE_EMBLEMS = [
  { id: "none", label: "None" },
  { id: "ring", label: "Ring" },
  { id: "diamond", label: "Diamond" },
  { id: "star", label: "Star" },
  { id: "fleur", label: "Fleur-de-lis" },
  { id: "crown", label: "Crown" },
  { id: "crescent", label: "Crescent" },
  { id: "seal", label: "Seal" },
  { id: "motif", label: "Ornament" }
];

export const EDGE_STYLES = [
  { id: "plain", label: "Natural" },
  { id: "gilt", label: "Gilt" },
  { id: "gilt_crimson", label: "Red under gold" },
  { id: "tinted", label: "Stained" },
  { id: "sprinkled", label: "Sprinkled" },
  { id: "ombre", label: "Ombré" },
  { id: "marbled", label: "Marbled" },
  { id: "paste", label: "Paste" },
  { id: "gauffered", label: "Gauffered" },
  { id: "botanical", label: "Fore-edge botanical" }
];

export const CORNER_STYLES = [
  { id: "none", label: "None" },
  { id: "plain", label: "Plain" },
  { id: "engraved", label: "Engraved" },
  { id: "scalloped", label: "Scalloped" },
  { id: "filigree", label: "Filigree" }
];

export const ENDPAPER_PATTERNS = [
  { id: "grid", label: "Fine grid" },
  { id: "plain", label: "Plain" },
  { id: "stripe", label: "Pinstripe" },
  { id: "dots", label: "Dots" },
  { id: "marble", label: "Marbled" },
  { id: "harlequin", label: "Harlequin" },
  { id: "seigaiha", label: "Wave scales" },
  { id: "shippo", label: "Linked circles" },
  { id: "honeycomb", label: "Honeycomb" },
  { id: "meander", label: "Fret" },
  { id: "stars", label: "Stars" },
  { id: "sprigs", label: "Sprigs" },
  { id: "clouds", label: "Clouds" },
  { id: "chevron", label: "Chevron" },
  { id: "paste", label: "Paste paper" },
  { id: "contour", label: "Contour map" },
  { id: "damask", label: "Damask" },
  { id: "celestial", label: "Celestial chart" },
  { id: "artnouveau", label: "Art Nouveau vines" },
  { id: "icecrack", label: "Ice-crackle lattice" }
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
  vertical: false,
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
  },
  slip: {
    label: "Title slip",
    front: {
      border: { style: "slip", inset: 0.055, finish: "ink", color: "#f1eadf" },
      motif: { x: 0.64, y: 0.66, scale: 1.05, finish: "foil", color: "#f4eee6", opacity: 0.9 },
      texts: [
        text("series", "series", { show: false, font: "inter", size: 14, weight: 500, tracking: 0.24, upper: true, y: 0.94 }),
        text("title", "title", { font: "notoserifsc", size: 54, weight: 600, vertical: true, x: 0.205, y: 0.33, width: 0.44, finish: "ink", color: "#1e1813" }),
        text("subtitle", "subtitle", { show: false, size: 22, vertical: true, x: 0.36, y: 0.33, width: 0.4 }),
        text("author", "author", { font: "notoserifsc", size: 22, weight: 500, vertical: true, tracking: 0.12, x: 0.86, y: 0.8, width: 0.3 })
      ]
    }
  },
  column: {
    label: "Column",
    front: {
      border: { style: "single", inset: 0.055, finish: "foil", color: "#f4eee6" },
      motif: { x: 0.3, y: 0.3, scale: 0.85, finish: "foil", color: "#f4eee6", opacity: 0.9 },
      texts: [
        text("series", "series", { font: "inter", size: 14, weight: 500, tracking: 0.24, upper: true, x: 0.3, y: 0.905, width: 0.4 }),
        text("title", "title", { size: 88, weight: 500, vertical: true, x: 0.76, y: 0.5, width: 0.78 }),
        text("subtitle", "subtitle", { size: 24, italic: true, vertical: true, x: 0.6, y: 0.5, width: 0.7 }),
        text("author", "author", { font: "inter", size: 16, weight: 500, tracking: 0.22, upper: true, x: 0.3, y: 0.86, width: 0.4 })
      ]
    }
  },
  swiss: {
    label: "Swiss grid",
    front: {
      border: { style: "none", inset: 0.055, finish: "foil", color: "#f4eee6" },
      motif: { x: 0.72, y: 0.68, scale: 1.05, finish: "foil", color: "#f4eee6", opacity: 0.9 },
      texts: [
        text("series", "series", { font: "grotesk", size: 14, weight: 600, tracking: 0.24, upper: true, align: "left", x: 0.085, y: 0.085 }),
        text("title", "title", { font: "grotesk", size: 84, weight: 600, align: "left", x: 0.085, y: 0.27, width: 0.82, lineHeight: 0.96 }),
        text("subtitle", "subtitle", { font: "inter", size: 17, weight: 400, align: "left", x: 0.085, y: 0.44, width: 0.56, lineHeight: 1.3 }),
        text("author", "author", { font: "plexmono", size: 16, weight: 500, tracking: 0.14, upper: true, align: "left", x: 0.085, y: 0.905, width: 0.5 })
      ]
    }
  },
  crest: {
    label: "Crest",
    front: {
      border: { style: "fillets", inset: 0.055, finish: "foil", color: "#f4eee6" },
      motif: { x: 0.5, y: 0.5, scale: 1.38, finish: "foil", color: "#f4eee6", opacity: 0.95 },
      texts: [
        text("series", "series", { font: "cinzel", size: 14, weight: 500, tracking: 0.32, upper: true, y: 0.125 }),
        text("title", "title", { font: "cinzel", size: 64, weight: 600, tracking: 0.08, upper: true, y: 0.235, width: 0.74 }),
        text("subtitle", "subtitle", { size: 25, italic: true, y: 0.775 }),
        text("author", "author", { font: "cinzel", size: 18, weight: 500, tracking: 0.26, upper: true, y: 0.865 })
      ]
    }
  },
  gallery: {
    label: "Gallery",
    front: {
      border: { style: "single", inset: 0.04, finish: "foil", color: "#f4eee6" },
      motif: { x: 0.5, y: 0.44, scale: 1.65, finish: "foil", color: "#f4eee6", opacity: 0.92 },
      texts: [
        text("series", "series", { font: "inter", size: 13, weight: 500, tracking: 0.28, upper: true, align: "left", x: 0.08, y: 0.092 }),
        text("title", "title", { font: "bodoni", size: 80, weight: 500, align: "left", x: 0.08, y: 0.785, width: 0.84, lineHeight: 1.0 }),
        text("subtitle", "subtitle", { font: "bodoni", size: 22, italic: true, align: "left", x: 0.08, y: 0.885, width: 0.7 }),
        text("author", "author", { font: "inter", size: 13, weight: 500, tracking: 0.24, upper: true, align: "right", x: 0.92, y: 0.092 })
      ]
    }
  },
  poetic: {
    label: "Poetic",
    front: {
      border: { style: "corners", inset: 0.06, finish: "foil", color: "#f4eee6" },
      motif: { x: 0.32, y: 0.68, scale: 1.02, finish: "foil", color: "#f4eee6", opacity: 0.9 },
      texts: [
        text("series", "series", { font: "notoserifsc", size: 16, weight: 500, tracking: 0.22, vertical: true, x: 0.86, y: 0.22, width: 0.28 }),
        text("title", "title", { font: "notoserifsc", size: 74, weight: 600, vertical: true, x: 0.72, y: 0.44, width: 0.66 }),
        text("subtitle", "subtitle", { font: "notoserifsc", size: 22, weight: 400, vertical: true, x: 0.56, y: 0.5, width: 0.56 }),
        text("author", "author", { font: "notoserifsc", size: 22, weight: 500, tracking: 0.14, vertical: true, x: 0.18, y: 0.78, width: 0.3 })
      ]
    }
  }
};

/* ---------- whole-book presets (6 curated themes × 4 flagship editions = 24) ---------- */

const palette = (paper, paperDeep, paperPale, ink, inkSoft, shelf, shelfDark, light, fill) => ({
  paper, paperDeep, paperPale, ink, inkSoft, wall: paper, shelf, shelfDark, light, fill
});

export const PRESET_THEMES = [
  { id: "all", label: "All", subtitle: "Twenty-four handcrafted bindings spanning six ateliers" },
  { id: "heritage", label: "Heritage", subtitle: "Fine press leathers, vellum, gilt tooling, clasps & raised bands" },
  { id: "eastern", label: "Eastern", subtitle: "Urushi lacquer, stab stitching, imperial silk & Kyoto washi" },
  { id: "botanical", label: "Botanical", subtitle: "Herbarium linen, Highland tweed, walnut veneer & alpine cork" },
  { id: "journal", label: "Journals", subtitle: "Quarter canvas, washed denim, velvet suede & quiet starting points" },
  { id: "gallery", label: "Modernist", subtitle: "Burnt orange, Swiss citron, frosted glacier acrylic & flagship cloth" },
  { id: "nocturnal", label: "Nocturnal", subtitle: "Klein cobalt star charts, aurora iridescence, velvet & snakeskin" }
];

export const PRESETS = [
  /* ===== Theme 1: Heritage & Fine Press (4) ===== */
  {
    id: "nocturne",
    theme: "heritage",
    label: "Nocturne",
    note: "Black leather · gold · gauffered edges · slipcase",
    tags: ["Slipcase", "5 raised bands", "Gauffered"],
    specimen: { en: "Nocturnes", zh: "暗夜奏鸣", authorEn: "F. Chopin", authorZh: "肖邦" },
    material: { kind: "leather", color: "#15161a" },
    foil: { preset: "gold", color: "#e8c06e", second: "#f2e1ba", texture: "polished" },
    layout: "monument",
    motif: "laurel",
    border: "fillets",
    frontOverrides: {
      texts: {
        subtitle: { leaf: "second" },
        series: { leaf: "second" }
      }
    },
    spine: {
      style: "bands5",
      emblem: "crown",
      label: { show: true, shape: "rect", framed: true, color: "#5c171c" }
    },
    back: {
      border: { style: "single", inset: 0.055, finish: "foil" },
      motif: { key: "laurel", x: 0.5, y: 0.34, scale: 0.92 },
      badge: { style: "edition", code: "NO. 001 / 250", price: "ATELIER FINE PRESS" }
    },
    details: {
      edge: { style: "gauffered", color: "#dfb662" },
      endpaper: { color: "#231e1b", pattern: "damask" },
      ribbon: { show: true, color: "#7a1d22", double: true, second: "#dfb662" },
      headband: { color: "#7a1d22", striped: true, second: "#dfb662" }
    },
    structure: {
      trim: "standard",
      bulk: 1.14,
      pocket: { show: true, card: true },
      slipcase: { show: true, color: "#1c1b20", label: true }
    },
    stamp: { relief: "deboss", depth: 0.64 },
    interior: { paper: "ivory", ink: "black", bodyFont: "garamond", headingFont: "cinzel", chapterStyle: "ornament" },
    palette: palette("#19181b", "#101012", "#f2eadc", "#f5efe4", "#bdb5a8", "#2f1e16", "#150c08", "#f6dfbc", "#8e8896")
  },
  {
    id: "oxblood",
    theme: "heritage",
    label: "Oxblood",
    note: "Oxblood leather · shield inlay · twin brass clasps",
    tags: ["Twin clasps", "Shield inlay", "Filigree"],
    specimen: { en: "Chronicles", zh: "勃艮第编年", authorEn: "H. Valois", authorZh: "瓦卢瓦" },
    material: { kind: "leather", color: "#4d1519" },
    foil: { preset: "antique", color: "#f0c572", second: "#d07c4e", texture: "brushed" },
    layout: "crest",
    motif: "archway",
    border: "arch",
    frontOverrides: {
      onlay: {
        show: true, mode: "inlay", shape: "shield", kind: "leather", border: true,
        color: "#260b0e", x: 0.5, y: 0.51, width: 0.52, height: 0.37
      },
      motif: { y: 0.495, scale: 1.04 },
      texts: {
        title: { font: "cinzel", size: 62, y: 0.225 },
        subtitle: { y: 0.785, leaf: "second" },
        author: { y: 0.87 }
      }
    },
    spine: { style: "compartments", emblem: "fleur" },
    back: {
      border: { style: "double", inset: 0.055, finish: "foil" },
      motif: { key: "key", x: 0.5, y: 0.34, scale: 0.92 },
      badge: { style: "exlibris", code: "BIBLIOTHECA PRIVATA" }
    },
    details: {
      edge: { style: "gilt_crimson", color: "#e0b760" },
      corners: "filigree",
      endpaper: { color: "#3d181b", pattern: "marble" },
      ribbon: { show: true, color: "#dfb560", double: false },
      headband: { color: "#4d1519", striped: true, second: "#e6c37a" }
    },
    structure: {
      trim: "standard",
      bulk: 1.24,
      clasp: { show: true, metal: "brass", style: "twin" }
    },
    stamp: { relief: "deboss", depth: 0.68 },
    wear: { scuff: 0.14, fade: 0.05 },
    interior: { paper: "aged", ink: "sepia", bodyFont: "caslon", headingFont: "cinzel", chapterStyle: "ornament" },
    palette: palette("#3a1518", "#240c0e", "#f4e7d6", "#f7ede0", "#cfb3ac", "#381c14", "#180a06", "#f5d4a6", "#9a5054")
  },
  {
    id: "atlas",
    theme: "heritage",
    label: "Atlas",
    note: "Aged vellum · wax seal · brass clasp · marbled edges",
    tags: ["Wax seal", "Brass clasp", "Marbled"],
    specimen: { en: "Mare Nostrum", zh: "四海舆图志", authorEn: "A. Mercator", authorZh: "墨卡托" },
    material: { kind: "vellum", color: "#ebe0c6" },
    foil: { preset: "bronze", color: "#7a4920", metalness: 0.9, roughness: 0.3, second: "#283948", texture: "brushed" },
    layout: "classic",
    motif: "anchor",
    border: "ornate",
    pattern: { key: "contour", finish: "blind", scale: 1.15, opacity: 0.52 },
    frontOverrides: {
      seal: { show: true, color: "#801e1a", letter: "", motif: "compass", scale: 0.94, x: 0.80, y: 0.83 },
      texts: {
        title: { font: "cormorant", size: 88, y: 0.69 }
      }
    },
    spine: {
      style: "double",
      emblem: "star",
      label: { show: true, shape: "oval", framed: true, color: "#263847" }
    },
    back: {
      border: { style: "ornate", inset: 0.055, finish: "foil" },
      motif: { key: "waves", x: 0.5, y: 0.34, scale: 1.0 },
      badge: { style: "edition", code: "FOLIO MARITIMA", price: "CHART IV" }
    },
    details: {
      edge: { style: "marbled", color: "#3b5a6a" },
      corners: "engraved",
      endpaper: { color: "#dfd3b8", pattern: "contour" },
      ribbon: { show: true, color: "#801e1a", double: true, second: "#263847" },
      headband: { color: "#263847", striped: true, second: "#ebe0c6" }
    },
    structure: {
      trim: "standard",
      bulk: 1.08,
      clasp: { show: true, metal: "brass", style: "single" }
    },
    stamp: { relief: "deboss", depth: 0.55 },
    wear: { scuff: 0.16, fade: 0.07 },
    interior: { paper: "aged", ink: "navy", bodyFont: "garamond", headingFont: "cormorant", chapterStyle: "classic" },
    palette: palette("#dfd5be", "#c9bc9f", "#f6efe1", "#221b14", "#665848", "#3e2618", "#1d1009", "#fff4dc", "#b8aa90")
  },
  {
    id: "almanac",
    theme: "heritage",
    label: "Almanac",
    note: "Half leather · marbled sides · bevelled spine label",
    tags: ["Half leather", "Marbled", "Sprinkled"],
    specimen: { en: "The Almanac", zh: "岁时博物志", authorEn: "R. Hooke", authorZh: "胡克" },
    material: { kind: "leather", color: "#cbb38a", binding: "half", second: "#3b2316" },
    foil: { preset: "antique", color: "#efc26e", second: "#c87046", texture: "brushed" },
    layout: "panel",
    motif: "hourglass",
    pattern: { key: "marble", finish: "ink", color: "#5e2c1c", opacity: 0.52 },
    frontOverrides: {
      motif: { finish: "ink", color: "#341e12", opacity: 0.88, scale: 0.84, y: 0.74 }
    },
    spine: {
      style: "bands",
      emblem: "diamond",
      label: { show: true, shape: "bevel", framed: true, color: "#6c1c20" }
    },
    back: {
      motif: { key: "sun", x: 0.5, y: 0.34, scale: 0.9, finish: "ink", color: "#341e12" },
      badge: { style: "exlibris", code: "EX LIBRIS · ATELIER" }
    },
    details: {
      edge: { style: "sprinkled", color: "#8c2b1f" },
      endpaper: { color: "#d9c7a8", pattern: "marble" },
      ribbon: { show: true, color: "#6c1c20", double: false },
      headband: { color: "#6c1c20", striped: true, second: "#e8d6b2" }
    },
    structure: {
      trim: "standard",
      bulk: 1.06,
      pocket: { show: true, card: true }
    },
    stamp: { relief: "deboss", depth: 0.55 },
    wear: { scuff: 0.22, fade: 0.09 },
    interior: { paper: "aged", ink: "sepia", bodyFont: "caslon", headingFont: "playfair", chapterStyle: "centered" },
    palette: palette("#cdbba0", "#b69f7e", "#f5ecdc", "#261a12", "#695340", "#3a2115", "#190d07", "#f8e3be", "#a88f70")
  },

  /* ===== Theme 2: Eastern Craft & Poetry (4) ===== */
  {
    id: "cinnabar",
    theme: "eastern",
    label: "Cinnabar",
    note: "Urushi lacquer · antique gold · red under gold",
    tags: ["Urushi lacquer", "Filigree", "Red under gold"],
    specimen: { en: "Plum & Snow", zh: "寒梅诗笺", authorEn: "Lin Bu", authorZh: "林逋" },
    material: { kind: "lacquer", color: "#7d1f18" },
    foil: { preset: "antique", color: "#f3c978", second: "#f6ebd4", texture: "polished" },
    layout: "poetic",
    motif: "plum",
    border: "meander",
    pattern: { key: "icecrack", finish: "blind", scale: 1.06, opacity: 0.72 },
    frontOverrides: {
      motif: { x: 0.34, y: 0.66, scale: 1.12 },
      texts: {
        title: { font: "xiaowei", size: 76 },
        author: { leaf: "second" }
      }
    },
    spine: { style: "bands5", emblem: "seal" },
    back: {
      border: { style: "meander", inset: 0.055, finish: "foil" },
      motif: { key: "cloud", x: 0.5, y: 0.34, scale: 0.96 },
      badge: { style: "edition", code: "NO. 01 / 88", price: "URUSHI EDITION" }
    },
    details: {
      edge: { style: "gilt_crimson", color: "#e3bc68" },
      corners: "filigree",
      endpaper: { color: "#4d1512", pattern: "clouds" },
      ribbon: { show: true, color: "#e3bc68", double: true, second: "#9e241b" },
      headband: { color: "#7d1f18", striped: true, second: "#e3bc68" }
    },
    structure: { trim: "standard", bulk: 0.95 },
    stamp: { relief: "deboss", depth: 0.56 },
    interior: { paper: "rice", ink: "burgundy", bodyFont: "notoserifsc", headingFont: "xiaowei", chapterStyle: "ornament" },
    palette: palette("#541915", "#380f0c", "#f6ebd9", "#f8efe0", "#d9b4a8", "#3a1b13", "#180905", "#fbd8a8", "#a8564a")
  },
  {
    id: "ink",
    theme: "eastern",
    label: "Ink",
    note: "Indigo paper · 6-hole hemp-leaf stitch · vermilion seal",
    tags: ["Asanoha stitch", "Title slip", "Rice paper"],
    specimen: { en: "Indigo Notes", zh: "蓝染手抄", authorEn: "Bashō", authorZh: "松尾芭蕉" },
    material: { kind: "paper", color: "#182746" },
    foil: { preset: "champagne", color: "#f0e2c2", metalness: 0.65, roughness: 0.36, texture: "matte" },
    layout: "slip",
    motif: "seal",
    pattern: { key: "seigaiha", finish: "blind", scale: 1.05, opacity: 0.65 },
    frontOverrides: {
      motif: { finish: "ink", color: "#c83426", opacity: 0.96, scale: 0.92, x: 0.66, y: 0.68 }
    },
    spine: { style: "none", emblem: "none" },
    back: {
      motif: { key: "bamboo", x: 0.5, y: 0.42, scale: 0.92 }
    },
    details: {
      edge: { style: "plain", color: "#e8dfc8" },
      endpaper: { color: "#efe6d2", pattern: "plain" },
      ribbon: { show: false, color: "#c83426" },
      stitch: { show: true, color: "#ebe0c8", holes: 6, pattern: "asanoha" }
    },
    structure: { trim: "standard", bulk: 0.68 },
    stamp: { relief: "flat", depth: 0.35 },
    interior: { paper: "rice", ink: "navy", bodyFont: "notoserifsc", headingFont: "notoserifsc", chapterStyle: "classic" },
    palette: palette("#1b263b", "#111929", "#f0e8d8", "#f3ece0", "#aeb9cc", "#301f17", "#150c08", "#e8dfc8", "#657ca0")
  },
  {
    id: "jade",
    theme: "eastern",
    label: "Jade",
    note: "Celadon jade silk · gilded oval inlay · blind clouds",
    tags: ["Silk inlay", "Gilt edges", "Double ribbon"],
    specimen: { en: "Jade Pavilion", zh: "翠微清集", authorEn: "Wang Wei", authorZh: "王维" },
    material: { kind: "silk", color: "#1e564a" },
    foil: { preset: "gold", color: "#f3da90", second: "#e0eee6", texture: "polished" },
    layout: "crest",
    motif: "lotus",
    border: "double",
    pattern: { key: "clouds", finish: "blind", scale: 1.06, opacity: 0.84 },
    frontOverrides: {
      onlay: {
        show: true, mode: "inlay", shape: "oval", kind: "silk", border: true,
        color: "#123830", x: 0.5, y: 0.515, width: 0.56, height: 0.355
      },
      motif: { scale: 1.06, y: 0.505 },
      texts: {
        title: { font: "cormorant", size: 70, upper: false, tracking: 0.03, y: 0.22 },
        subtitle: { leaf: "second", y: 0.785 },
        author: { y: 0.87 }
      }
    },
    spine: {
      style: "panels",
      emblem: "motif",
      label: { show: true, shape: "rect", framed: true, color: "#123830" }
    },
    back: {
      border: { style: "single", inset: 0.055, finish: "foil" },
      motif: { key: "swallow", x: 0.5, y: 0.34, scale: 0.96 },
      badge: { style: "exlibris", code: "CELADON PAVILION" }
    },
    details: {
      edge: { style: "gilt", color: "#e8c872" },
      endpaper: { color: "#cfe2d8", pattern: "seigaiha" },
      ribbon: { show: true, color: "#e8c872", double: true, second: "#b83d30" },
      headband: { color: "#1e564a", striped: true, second: "#e8c872" }
    },
    structure: { trim: "standard", bulk: 0.94 },
    stamp: { relief: "deboss", depth: 0.54 },
    interior: { paper: "rice", ink: "green", bodyFont: "notoserifsc", headingFont: "cormorant", chapterStyle: "ornament" },
    palette: palette("#1f4e43", "#13332b", "#edf4ee", "#f1f5ef", "#b1cec4", "#332117", "#160d08", "#f6e7c2", "#65a494")
  },
  {
    id: "kyoto",
    theme: "eastern",
    label: "Kyoto",
    note: "Mulberry washi · tortoiseshell stitch · brush bamboo",
    tags: ["Washi", "Kikko stitch", "Vertical layout"],
    specimen: { en: "Pine & Mist", zh: "楮纸松风", authorEn: "S. Sōseki", authorZh: "夏目漱石" },
    material: { kind: "washi", color: "#f0e8d6" },
    foil: { preset: "copper", color: "#944324", metalness: 0.84, roughness: 0.34, texture: "matte" },
    layout: "column",
    motif: "bamboo",
    border: "corners",
    frontOverrides: {
      border: { finish: "ink", color: "#233b2e", inset: 0.06 },
      motif: { finish: "ink", color: "#233b2e", opacity: 0.92, x: 0.32, y: 0.36, scale: 1.04 },
      texts: {
        title: { font: "notoserifsc", size: 76, finish: "ink", color: "#1c2620", x: 0.78 },
        subtitle: { finish: "foil", x: 0.62 },
        author: { finish: "ink", color: "#233b2e" },
        series: { finish: "foil" }
      }
    },
    spine: { style: "none", emblem: "none" },
    back: {
      motif: { key: "peaks", x: 0.5, y: 0.4, scale: 0.94, finish: "ink", color: "#233b2e" }
    },
    details: {
      edge: { style: "plain", color: "#e9e0cc" },
      endpaper: { color: "#e5dbc5", pattern: "shippo" },
      ribbon: { show: false, color: "#9e2a22" },
      stitch: { show: true, color: "#9e2a22", holes: 4, pattern: "kikko" }
    },
    structure: { trim: "standard", bulk: 0.72 },
    stamp: { relief: "flat", depth: 0.3 },
    interior: { paper: "rice", ink: "sepia", bodyFont: "notoserifsc", headingFont: "mashan", chapterStyle: "classic" },
    palette: palette("#e7dfd0", "#d1c6ad", "#f8f4e9", "#23201b", "#6b6356", "#3d271a", "#1c100a", "#fff7e5", "#c2b69f")
  },

  /* ===== Theme 3: Botanical & Naturalist (4) ===== */
  {
    id: "herbarium",
    theme: "botanical",
    label: "Herbarium",
    note: "Oatmeal linen · botanical edges · moss wax seal",
    tags: ["Botanical edge", "Wax seal", "Scalloped"],
    specimen: { en: "Flora Botanica", zh: "草木标本集", authorEn: "M. Merian", authorZh: "梅里安" },
    material: { kind: "linen", color: "#ede5d2" },
    foil: { preset: "bronze", color: "#7f5122", metalness: 0.88, roughness: 0.3, second: "#274331", texture: "brushed" },
    layout: "crest",
    motif: "moth",
    border: "roll",
    pattern: { key: "artnouveau", finish: "blind", scale: 1.15, opacity: 0.56 },
    frontOverrides: {
      border: { finish: "foil", inset: 0.055 },
      motif: { finish: "ink", color: "#213c2c", opacity: 0.92, scale: 1.38, y: 0.5 },
      seal: { show: true, color: "#355138", letter: "", motif: "branch", scale: 0.9, x: 0.79, y: 0.84 },
      texts: {
        title: { font: "playfair", size: 62, upper: false, tracking: 0.02, finish: "ink", color: "#1d3225", y: 0.215 },
        series: { finish: "foil", y: 0.12 },
        subtitle: { finish: "ink", color: "#355138", y: 0.775 },
        author: { finish: "foil", y: 0.865 }
      }
    },
    spine: { style: "compartments", emblem: "motif" },
    back: {
      border: { style: "roll", inset: 0.055, finish: "foil" },
      motif: { key: "branch", x: 0.5, y: 0.36, scale: 1.0, finish: "ink", color: "#213c2c" },
      badge: { style: "exlibris", code: "HERBARIUM FOLIO" }
    },
    details: {
      edge: { style: "botanical", color: "#3b5e42" },
      corners: "scalloped",
      endpaper: { color: "#dfe5d5", pattern: "sprigs" },
      ribbon: { show: true, color: "#355138", double: true, second: "#9a6a3c" },
      headband: { color: "#274331", striped: true, second: "#e5dec9" }
    },
    structure: { trim: "standard", bulk: 1.02 },
    stamp: { relief: "deboss", depth: 0.52 },
    interior: { paper: "ivory", ink: "green", bodyFont: "garamond", headingFont: "playfair", chapterStyle: "ornament" },
    palette: palette("#dfd8c5", "#c8bea6", "#f6f1e4", "#1f2b22", "#59685a", "#3c2719", "#1b1009", "#fbf3de", "#aeb6a0")
  },
  {
    id: "forest",
    theme: "botanical",
    label: "Forest",
    note: "Highland tweed · saddle-leather diamond · copper clasp",
    tags: ["Tweed", "Leather onlay", "Copper clasp"],
    specimen: { en: "Sylva", zh: "高地林野", authorEn: "J. Evelyn", authorZh: "伊夫林" },
    material: { kind: "tweed", color: "#233c2e" },
    foil: { preset: "gold", color: "#ebc570", second: "#d68454", texture: "polished" },
    layout: "plate",
    motif: "sun",
    border: "fleurons",
    pattern: { key: "herringbone", finish: "blind", scale: 1.1, opacity: 0.45 },
    frontOverrides: {
      onlay: {
        show: true, mode: "onlay", shape: "diamond", kind: "leather", border: true,
        color: "#4d2a18", x: 0.5, y: 0.555, width: 0.58, height: 0.4
      },
      motif: { y: 0.555, scale: 0.92 },
      texts: {
        title: { font: "fraunces", size: 76, y: 0.18 },
        subtitle: { leaf: "second", y: 0.27 }
      }
    },
    spine: { style: "bands", emblem: "star" },
    back: {
      border: { style: "single", inset: 0.055, finish: "foil" },
      motif: { key: "tree", x: 0.5, y: 0.34, scale: 0.96 }
    },
    details: {
      edge: { style: "gilt", color: "#dfc06c" },
      endpaper: { color: "#d5ddd0", pattern: "sprigs" },
      ribbon: { show: true, color: "#c87046", double: false },
      headband: { color: "#233c2e", striped: true, second: "#ebc570" }
    },
    structure: {
      trim: "standard",
      bulk: 1.08,
      clasp: { show: true, metal: "copper", style: "single" }
    },
    stamp: { relief: "deboss", depth: 0.58 },
    interior: { paper: "cream", ink: "green", bodyFont: "garamond", headingFont: "fraunces", chapterStyle: "classic" },
    palette: palette("#1f3328", "#14221a", "#f0ecdf", "#f2eee2", "#a9baae", "#392317", "#190e08", "#f7e0b5", "#618670")
  },
  {
    id: "cedar",
    theme: "botanical",
    label: "Cedar",
    note: "Walnut veneer · minimalist champagne · wood slipcase",
    tags: ["Wood veneer", "Slipcase", "Paste edges"],
    specimen: { en: "Timber & Grain", zh: "杉木年轮", authorEn: "G. Nakashima", authorZh: "中岛胜寿" },
    material: { kind: "wood", color: "#5c3a23" },
    foil: { preset: "champagne", color: "#f5e4be", second: "#d27d4e", texture: "brushed" },
    layout: "minimal",
    motif: "tree",
    border: "triple",
    frontOverrides: {
      border: { inset: 0.055 },
      motif: { y: 0.78, scale: 0.64 },
      texts: {
        title: { font: "marcellus", size: 62, tracking: 0.09, y: 0.36, width: 0.74 },
        author: { font: "inter", size: 17, tracking: 0.24, y: 0.455 }
      }
    },
    spine: { style: "frame", emblem: "diamond" },
    back: {
      border: { style: "single", inset: 0.055, finish: "foil" },
      motif: { key: "branch", x: 0.5, y: 0.34, scale: 0.94 },
      badge: { style: "edition", code: "CEDAR SERIES · I", price: "HAND-VENEERED" }
    },
    details: {
      edge: { style: "paste", color: "#b66138" },
      corners: "plain",
      endpaper: { color: "#dfd1bc", pattern: "paste" },
      ribbon: { show: true, color: "#c26436", double: false },
      headband: { color: "#5c3a23", striped: true, second: "#f5e4be" }
    },
    structure: {
      trim: "standard",
      bulk: 1.04,
      slipcase: { show: true, color: "#442a18", label: true }
    },
    stamp: { relief: "deboss", depth: 0.52 },
    interior: { paper: "kraft", ink: "sepia", bodyFont: "garamond", headingFont: "marcellus", chapterStyle: "centered" },
    palette: palette("#462c1c", "#2d1a0f", "#f4ead9", "#f6ede0", "#ccb7a2", "#3a2215", "#190d07", "#f7dab2", "#9e775a")
  },
  {
    id: "expedition",
    theme: "botanical",
    label: "Expedition",
    note: "Roasted cork · blind topography · geodetic compass · elastic band",
    tags: ["Cork", "Topographic", "Elastic band"],
    specimen: { en: "High Passes", zh: "山脊勘记", authorEn: "A. Humboldt", authorZh: "洪堡" },
    material: { kind: "cork", color: "#b3875b" },
    foil: { preset: "black", color: "#1d150f", second: "#e38c52", texture: "matte" },
    layout: "plate",
    motif: "star",
    border: "corners",
    pattern: { key: "contour", finish: "blind", scale: 1.25, opacity: 0.72 },
    frontOverrides: {
      border: { inset: 0.055 },
      motif: { x: 0.445, y: 0.565, scale: 1.18 },
      texts: {
        title: { font: "marcellus", size: 58, upper: true, tracking: 0.1, x: 0.445, y: 0.21, width: 0.64 },
        subtitle: { font: "cormorant", italic: true, size: 26, x: 0.445, y: 0.305, width: 0.62, leaf: "second" },
        author: { font: "plexmono", size: 14, tracking: 0.22, x: 0.445, y: 0.865, width: 0.6 },
        series: { font: "plexmono", size: 13, tracking: 0.24, x: 0.445, y: 0.915, width: 0.6, leaf: "second" }
      }
    },
    spine: { style: "rules", emblem: "star" },
    back: {
      border: { style: "corners", inset: 0.055, finish: "foil" },
      motif: { key: "peaks", x: 0.5, y: 0.35, scale: 0.94 },
      badge: { style: "edition", code: "SURVEY FOLIO · IV", price: "ALPINE ARCHIVE" }
    },
    details: {
      edge: { style: "tinted", color: "#3d281a" },
      endpaper: { color: "#e5d5bc", pattern: "contour" },
      ribbon: { show: true, color: "#3d281a", double: false },
      headband: { color: "#3d281a", striped: true, second: "#e5d5bc" }
    },
    structure: {
      trim: "standard",
      bulk: 0.92,
      corners: "rounded",
      band: { show: true, color: "#362216" },
      penLoop: { show: true, color: "#362216" },
      pocket: { show: true, card: true }
    },
    stamp: { relief: "deboss", depth: 0.66 },
    interior: { paper: "kraft", ink: "sepia", bodyFont: "garamond", headingFont: "marcellus", chapterStyle: "centered" },
    palette: palette("#d6c1a2", "#bda380", "#f7efe0", "#1e160f", "#56412b", "#3a2215", "#190d07", "#fce9c9", "#cbb08c")
  },

  /* ===== Theme 4: Journals & Quiet Editions (4) ===== */
  {
    id: "harlequin",
    theme: "journal",
    label: "Harlequin",
    note: "Quarter duck canvas · printed lozenges · crimson diamond",
    tags: ["Quarter canvas", "Diamond onlay", "Stained edge"],
    specimen: { en: "Commedia", zh: "菱格剧目", authorEn: "C. Goldoni", authorZh: "哥尔多尼" },
    material: { kind: "canvas", color: "#efe5cf", binding: "quarter", second: "#701b29" },
    foil: { preset: "gold", color: "#ecc670", second: "#701b29", texture: "polished" },
    layout: "panel",
    motif: "knot",
    pattern: { key: "harlequin", finish: "ink", color: "#701b29", opacity: 0.44 },
    frontOverrides: {
      onlay: {
        show: true, mode: "onlay", shape: "diamond", kind: "leather", border: true,
        color: "#6b1927", x: 0.5, y: 0.74, width: 0.34, height: 0.24
      },
      motif: { x: 0.5, y: 0.74, scale: 0.62, finish: "foil" }
    },
    spine: {
      style: "double",
      emblem: "diamond",
      label: { show: true, shape: "oval", framed: true, color: "#3a1019" }
    },
    back: {
      motif: { key: "knot", x: 0.5, y: 0.34, scale: 0.88, finish: "ink", color: "#701b29" },
      badge: { style: "exlibris", code: "TEATRO VENEZIA" }
    },
    details: {
      edge: { style: "tinted", color: "#701b29" },
      endpaper: { color: "#e8d9c8", pattern: "harlequin" },
      ribbon: { show: true, color: "#701b29", double: true, second: "#ecc670" },
      headband: { color: "#701b29", striped: true, second: "#efe5cf" }
    },
    structure: { trim: "standard", bulk: 0.98, pocket: { show: true, card: true } },
    stamp: { relief: "deboss", depth: 0.52 },
    interior: { paper: "blush", ink: "burgundy", bodyFont: "caslon", headingFont: "playfair", chapterStyle: "ornament" },
    palette: palette("#dfd2bd", "#c6b499", "#f8f0e2", "#261619", "#6d4d52", "#3b2019", "#1a0c09", "#fcecd4", "#b89b8d")
  },
  {
    id: "selvedge",
    theme: "journal",
    label: "Selvedge",
    note: "Washed indigo denim · copper foil · rounded field journal",
    tags: ["Denim", "Rounded", "Elastic band"],
    specimen: { en: "Field Log", zh: "丹宁行记", authorEn: "No. 14", authorZh: "行旅十四" },
    material: { kind: "denim", color: "#324e73" },
    foil: { preset: "copper", color: "#f49b62", second: "#f6e8ce", texture: "brushed" },
    layout: "editorial",
    motif: "compass",
    border: "corners",
    frontOverrides: {
      motif: { x: 0.45, y: 0.37, scale: 1.1 },
      texts: {
        title: { font: "grotesk", size: 74, weight: 600, width: 0.72 },
        series: { font: "plexmono" },
        author: { font: "plexmono", x: 0.8 },
        subtitle: { font: "plexmono", leaf: "second" }
      }
    },
    spine: { style: "rules", emblem: "diamond" },
    back: {
      motif: { key: "compass", x: 0.72, y: 0.32, scale: 0.85 },
      badge: { style: "edition", code: "SELVEDGE NO. 14", price: "FIELD EDITION" }
    },
    details: {
      edge: { style: "tinted", color: "#b8542e" },
      endpaper: { color: "#d2dce6", pattern: "stripe" },
      ribbon: { show: true, color: "#b8542e", double: false },
      headband: { color: "#b8542e", striped: true, second: "#eae0ce" }
    },
    structure: {
      trim: "standard",
      bulk: 0.86,
      corners: "rounded",
      band: { show: true, color: "#a14424" },
      penLoop: { show: true, color: "#a14424" },
      pocket: { show: true, card: true }
    },
    stamp: { relief: "deboss", depth: 0.5 },
    wear: { scuff: 0.1, fade: 0.06 },
    interior: { paper: "kraft", ink: "navy", bodyFont: "plexmono", headingFont: "grotesk", chapterStyle: "numeral" },
    palette: palette("#2e4461", "#1e2f45", "#eef2f6", "#f2f4f6", "#b2c3d8", "#3b2216", "#1a0e08", "#f7dbc2", "#7898be")
  },
  {
    id: "bone",
    theme: "journal",
    label: "Bone",
    note: "Chalk-bone suede · blind deboss frame · terracotta monogram",
    tags: ["Bone suede", "Blind frame", "Terracotta edge"],
    specimen: { en: "White Silence", zh: "素骨清音", authorEn: "K. Hara", authorZh: "原研哉" },
    material: { kind: "suede", color: "#eee8db" },
    foil: { preset: "black", color: "#1c1a18", metalness: 0.1, roughness: 0.58, second: "#c44b28", texture: "matte" },
    layout: "classic",
    motif: "monogram",
    border: "single",
    frontOverrides: {
      border: { finish: "blind", inset: 0.058 },
      motif: { finish: "ink", color: "#be4927", opacity: 0.94, x: 0.5, y: 0.365, scale: 0.96 },
      texts: {
        series: { font: "inter", size: 13, tracking: 0.28, y: 0.118, finish: "ink", color: "#be4927" },
        title: { font: "bodoni", size: 78, weight: 500, y: 0.68, width: 0.76, finish: "ink", color: "#1a1816" },
        subtitle: { font: "cormorant", italic: true, size: 26, upper: false, tracking: 0.02, y: 0.775, finish: "ink", color: "#61584d" },
        author: { font: "inter", size: 14, tracking: 0.24, upper: true, italic: false, y: 0.885, finish: "ink", color: "#1a1816" }
      }
    },
    spine: { style: "rules", emblem: "ring", finish: "ink", color: "#1a1816" },
    back: {
      border: { style: "single", inset: 0.058, finish: "blind" },
      motif: { key: "rings", x: 0.5, y: 0.34, scale: 0.9, finish: "ink", color: "#be4927" },
      badge: { style: "isbn", code: "978-0-8112-2904-3", price: "$28" }
    },
    details: {
      edge: { style: "tinted", color: "#c64e2a" },
      endpaper: { color: "#e6dfd1", pattern: "plain" },
      ribbon: { show: true, color: "#c64e2a", double: false },
      headband: { color: "#c64e2a", striped: true, second: "#eee8db" }
    },
    structure: { trim: "standard", bulk: 0.94, pocket: { show: true, card: true } },
    stamp: { relief: "deboss", depth: 0.72 },
    interior: { paper: "white", ink: "black", bodyFont: "garamond", headingFont: "bodoni", chapterStyle: "centered" },
    palette: palette("#e4ddd0", "#cdc3b0", "#f8f4ec", "#1d1a16", "#635a4f", "#3c271a", "#1c100a", "#fff8ec", "#c8bfb0")
  },
  {
    id: "blank",
    theme: "journal",
    label: "Bare",
    note: "Plain natural bookcloth · clean tabula rasa canvas",
    tags: ["Unprinted", "Minimal", "Custom canvas"],
    specimen: { en: "Untitled", zh: "素面胚书", authorEn: "", authorZh: "" },
    material: { kind: "cloth", color: "#cbbda6" },
    foil: "gold",
    layout: "classic",
    motif: "none",
    blank: true,
    details: {
      edge: { style: "plain", color: "#e7dfcf" },
      endpaper: { color: "#ece5d5", pattern: "plain" },
      ribbon: { show: true, color: "#8c7f67", double: false },
      headband: { color: "#b6a98f", striped: false, second: "#efe7d6" }
    },
    structure: { trim: "standard", bulk: 0.96 },
    stamp: { relief: "deboss", depth: 0.45 },
    interior: { paper: "cream", ink: "black", bodyFont: "garamond", headingFont: "cormorant", chapterStyle: "classic" },
    palette: palette("#dad2c1", "#c2b7a3", "#f7f2e7", "#231f1a", "#6b6459", "#3c271a", "#1c100a", "#fff6e5", "#c0b7a5")
  },

  /* ===== Theme 5: Modernist & Editorial (4) ===== */
  {
    id: "ultramarine",
    theme: "gallery",
    label: "Ultramarine",
    note: "Ultramarine cloth · luminous copper · atelier flagship",
    tags: ["Signature", "Copper foil", "Double ribbon"],
    specimen: { en: "The Atelier", zh: "群青工坊", authorEn: "Folio Press", authorZh: "制书工坊" },
    material: { kind: "cloth", color: "#162640" },
    foil: { preset: "copper", color: "#e48854", second: "#f0dcaf", texture: "polished" },
    layout: "classic",
    motif: "brackets",
    border: "double",
    pattern: { key: "pinstripe", finish: "blind", scale: 1.0, opacity: 0.34 },
    frontOverrides: {
      texts: {
        series: { leaf: "second" },
        subtitle: { leaf: "second" }
      }
    },
    spine: { style: "frame", emblem: "ring" },
    back: {
      border: { style: "single", inset: 0.055, finish: "foil" },
      motif: { key: "rings", x: 0.71, y: 0.325, scale: 1.0 },
      badge: { style: "edition", code: "ATELIER EDITION", price: "VOL. I" }
    },
    details: {
      edge: { style: "plain", color: "#e7dfcf" },
      endpaper: { color: "#dbe0e6", pattern: "grid" },
      ribbon: { show: true, color: "#c87046", double: true, second: "#e6dcc8" },
      headband: { color: "#162640", striped: true, second: "#e48854" }
    },
    structure: { trim: "standard", bulk: 1.0 },
    stamp: { relief: "deboss", depth: 0.54 },
    interior: { paper: "cream", ink: "black", bodyFont: "garamond", headingFont: "cormorant", chapterStyle: "classic" },
    palette: palette("#171c28", "#10141e", "#f1eadf", "#f4eee6", "#b8b4b0", "#3a2118", "#1c0e0a", "#f5d7b8", "#9fb3ca")
  },
  {
    id: "ember",
    theme: "gallery",
    label: "Ember",
    note: "Burnt-orange cloth · bright champagne gold · red under gold",
    tags: ["Burnt orange", "Dual foil", "Red under gold"],
    specimen: { en: "Solstice", zh: "余烬炽橙", authorEn: "L. Barragán", authorZh: "巴拉干" },
    material: { kind: "cloth", color: "#cc4a1b" },
    foil: { preset: "champagne", color: "#fff0c4", metalness: 0.78, roughness: 0.22, second: "#1b1410", texture: "polished" },
    layout: "classic",
    motif: "paths",
    border: "double",
    frontOverrides: {
      motif: { scale: 1.15, y: 0.365 },
      texts: {
        title: { font: "fraunces", size: 88, weight: 500, y: 0.695 },
        series: { leaf: "second" },
        subtitle: { leaf: "second", y: 0.795 }
      }
    },
    spine: { style: "frame", emblem: "ring" },
    back: {
      border: { style: "single", inset: 0.055, finish: "foil" },
      motif: { key: "paths", x: 0.5, y: 0.34, scale: 1.02 },
      badge: { style: "edition", code: "SOLSTICE PRESS", price: "ED. II" }
    },
    details: {
      edge: { style: "gilt_crimson", color: "#f0c874" },
      endpaper: { color: "#f6dfca", pattern: "stripe" },
      ribbon: { show: true, color: "#1b1410", double: true, second: "#f0c874" },
      headband: { color: "#cc4a1b", striped: true, second: "#fff0c4" }
    },
    structure: { trim: "standard", bulk: 1.0 },
    stamp: { relief: "deboss", depth: 0.56 },
    interior: { paper: "ivory", ink: "black", bodyFont: "garamond", headingFont: "fraunces", chapterStyle: "numeral" },
    palette: palette("#7d3018", "#5c2110", "#ffe7cc", "#fff2e2", "#e7c3ab", "#402015", "#1d0d08", "#ffd6a0", "#e28f6a")
  },
  {
    id: "citron",
    theme: "gallery",
    label: "Citron",
    note: "Acid-citron buckram · Swiss grid · jet-black edges",
    tags: ["Swiss grid", "Black edges", "ISBN plate"],
    specimen: { en: "Neue Grafik", zh: "瑞士网格", authorEn: "J. Müller", authorZh: "米勒" },
    material: { kind: "buckram", color: "#bccd16" },
    foil: { preset: "black", color: "#141612", texture: "polished" },
    layout: "swiss",
    motif: "caret",
    spine: { style: "rules", emblem: "none" },
    back: {
      motif: { key: "modules", x: 0.72, y: 0.32, scale: 0.86 },
      badge: { style: "isbn", code: "978-3-03778-612-3", price: "CHF 68" }
    },
    details: {
      edge: { style: "tinted", color: "#151714" },
      endpaper: { color: "#ebefbe", pattern: "grid" },
      ribbon: { show: true, color: "#151714", double: false },
      headband: { color: "#151714", striped: true, second: "#bccd16" }
    },
    structure: { trim: "standard", bulk: 0.94 },
    stamp: { relief: "deboss", depth: 0.45 },
    interior: { paper: "white", ink: "black", bodyFont: "inter", headingFont: "grotesk", chapterStyle: "numeral" },
    palette: palette("#c2ce22", "#9ca816", "#f0f2c9", "#171914", "#464e14", "#3b2418", "#1c0f09", "#fff6ce", "#dce37e")
  },
  {
    id: "glacier",
    theme: "gallery",
    label: "Glacier",
    note: "Frosted ice-blue acrylic · arctic Bodoni · frosted inlay",
    tags: ["Cast acrylic", "Gallery layout", "Frosted inlay"],
    specimen: { en: "Glass & Ice", zh: "冰川光影", authorEn: "P. Zumthor", authorZh: "卒姆托" },
    material: { kind: "acrylic", color: "#99bfd2" },
    foil: { preset: "platinum", color: "#f6fafd", metalness: 0.94, roughness: 0.16, second: "#132c3d", texture: "polished" },
    layout: "gallery",
    motif: "compass",
    border: "single",
    frontOverrides: {
      onlay: {
        show: true, mode: "inlay", shape: "rect", kind: "acrylic", border: true,
        color: "#c8dfec", x: 0.5, y: 0.425, width: 0.66, height: 0.46
      },
      border: { finish: "ink", color: "#132c3d", inset: 0.045 },
      motif: { finish: "ink", color: "#163549", opacity: 0.9, scale: 1.38, y: 0.425 },
      texts: {
        title: { font: "bodoni", size: 80, finish: "ink", color: "#102432", y: 0.79 },
        subtitle: { font: "bodoni", finish: "ink", color: "#21465e", y: 0.885 },
        series: { finish: "ink", color: "#193a4f" },
        author: { finish: "ink", color: "#193a4f" }
      }
    },
    spine: { style: "rules", emblem: "ring", finish: "ink", color: "#102432" },
    back: {
      border: { style: "single", inset: 0.045, finish: "ink", color: "#132c3d" },
      motif: { key: "orbits", x: 0.5, y: 0.34, scale: 0.96, finish: "ink", color: "#163549" },
      badge: { style: "isbn", code: "978-3-7757-5018-9", price: "€64" }
    },
    details: {
      edge: { style: "tinted", color: "#dce8ef" },
      endpaper: { color: "#e0ecf2", pattern: "grid" },
      ribbon: { show: true, color: "#132c3d", double: false },
      headband: { color: "#132c3d", striped: true, second: "#dce8ef" }
    },
    structure: { trim: "standard", bulk: 0.96 },
    stamp: { relief: "flat", depth: 0.32 },
    interior: { paper: "grey", ink: "slate", bodyFont: "inter", headingFont: "bodoni", chapterStyle: "numeral" },
    palette: palette("#89b1c4", "#6892a7", "#eef5f8", "#102836", "#294e61", "#382017", "#1b0e09", "#f2f8fa", "#b4d5e3")
  },

  /* ===== Theme 6: Nocturnal & Avant-Garde (4) ===== */
  {
    id: "cobalt",
    theme: "nocturnal",
    label: "Cobalt",
    note: "Klein cobalt cloth · silver astrolabe · blind star chart",
    tags: ["Klein cobalt", "Astrolabe", "Silver gilt"],
    specimen: { en: "Uranometria", zh: "钴蓝星盘", authorEn: "J. Bayer", authorZh: "拜耳" },
    material: { kind: "cloth", color: "#1538a8" },
    foil: { preset: "silver", color: "#ebf5fd", second: "#f2cc74", texture: "polished" },
    layout: "plate",
    motif: "astrolabe",
    border: "beaded",
    pattern: { key: "celestial", finish: "blind", scale: 1.08, opacity: 0.8 },
    frontOverrides: {
      motif: { scale: 1.48, y: 0.55 },
      texts: {
        subtitle: { leaf: "second" },
        series: { leaf: "second" }
      }
    },
    spine: { style: "double", emblem: "crescent" },
    back: {
      border: { style: "beaded", inset: 0.055, finish: "foil" },
      motif: { key: "orbits", x: 0.5, y: 0.35, scale: 1.04 },
      badge: { style: "edition", code: "OBSERVATORY FOLIO", price: "PLATE XII" }
    },
    details: {
      edge: { style: "gilt", color: "#d8e6f2" },
      endpaper: { color: "#152f7e", pattern: "celestial" },
      ribbon: { show: true, color: "#d8e6f2", double: true, second: "#f2cc74" },
      headband: { color: "#1538a8", striped: true, second: "#d8e6f2" }
    },
    structure: { trim: "standard", bulk: 1.06 },
    stamp: { relief: "deboss", depth: 0.56 },
    interior: { paper: "grey", ink: "navy", bodyFont: "garamond", headingFont: "playfair", chapterStyle: "ornament" },
    palette: palette("#142b82", "#0b1a56", "#dceaf4", "#f3f6f8", "#b5c9ec", "#3b2117", "#1a0d08", "#e7f0f7", "#6389e0")
  },
  {
    id: "aurora",
    theme: "nocturnal",
    label: "Aurora",
    note: "Boreal buckram · spectral lunar arc · blind aurora curtains",
    tags: ["Spectral foil", "Lunar phases", "Obsidian paper"],
    specimen: { en: "Borealis", zh: "极光月相", authorEn: "N. Lind", authorZh: "林德" },
    material: { kind: "buckram", color: "#101829" },
    foil: { preset: "holo", color: "#e8f2fc", metalness: 0.96, roughness: 0.16, iridescence: 0.92, second: "#f2d692", texture: "polished" },
    layout: "plate",
    motif: "moon",
    border: "rounded",
    pattern: { key: "contour", finish: "blind", scale: 1.48, opacity: 0.65 },
    frontOverrides: {
      border: { inset: 0.052 },
      motif: { x: 0.5, y: 0.565, scale: 1.32 },
      texts: {
        title: { font: "italiana", size: 84, tracking: 0.05, y: 0.215, width: 0.78 },
        subtitle: { font: "cormorant", italic: true, size: 26, y: 0.305, leaf: "second" },
        author: { font: "inter", size: 15, tracking: 0.26, y: 0.855, leaf: "second" },
        series: { font: "inter", size: 13, tracking: 0.28, y: 0.91 }
      }
    },
    spine: { style: "double", emblem: "crescent" },
    back: {
      border: { style: "rounded", inset: 0.052, finish: "foil" },
      motif: { key: "star", x: 0.5, y: 0.35, scale: 0.98 },
      badge: { style: "edition", code: "BOREALIS · MMXXVI", price: "SPECTRAL FOIL" }
    },
    details: {
      edge: { style: "gilt", color: "#dce8f4" },
      endpaper: { color: "#121c30", pattern: "celestial" },
      ribbon: { show: true, color: "#dce8f4", double: true, second: "#f2d692" },
      headband: { color: "#101829", striped: true, second: "#dce8f4" }
    },
    structure: { trim: "standard", bulk: 1.0 },
    stamp: { relief: "emboss", depth: 0.56 },
    interior: { paper: "obsidian", ink: "ivory", bodyFont: "garamond", headingFont: "italiana", chapterStyle: "ornament" },
    palette: palette("#121a2b", "#0a101d", "#edf2f8", "#f1f4f8", "#a4b3ca", "#2c1e1a", "#130b09", "#e6effa", "#6e86b8")
  },
  {
    id: "plum",
    theme: "nocturnal",
    label: "Plum",
    note: "Plum velvet · rose gold · Art Deco spine · rose clasp",
    tags: ["Velvet", "Art Deco", "Rose clasp"],
    specimen: { en: "Nocturne Rose", zh: "丝绒蔷薇", authorEn: "C. Rossetti", authorZh: "罗塞蒂" },
    material: { kind: "velvet", color: "#451842" },
    foil: { preset: "rose", color: "#f8c9c2", second: "#ecc87d", texture: "polished" },
    layout: "monument",
    motif: "rose",
    border: "deco",
    pattern: { key: "damask", finish: "blind", scale: 1.08, opacity: 0.72 },
    frontOverrides: {
      motif: { y: 0.215, scale: 0.72 },
      texts: {
        subtitle: { leaf: "second" }
      }
    },
    spine: { style: "artdeco", emblem: "fleur" },
    back: {
      border: { style: "deco", inset: 0.055, finish: "foil" },
      motif: { key: "rose", x: 0.5, y: 0.34, scale: 0.96 },
      badge: { style: "exlibris", code: "SALON VELOURS" }
    },
    details: {
      edge: { style: "gilt", color: "#eab8ae" },
      corners: "scalloped",
      endpaper: { color: "#52254d", pattern: "damask" },
      ribbon: { show: true, color: "#eab8ae", double: true, second: "#ecc87d" },
      headband: { color: "#451842", striped: true, second: "#f8c9c2" }
    },
    structure: {
      trim: "standard",
      bulk: 1.06,
      clasp: { show: true, metal: "rose", style: "single" }
    },
    stamp: { relief: "deboss", depth: 0.62 },
    interior: { paper: "blush", ink: "burgundy", bodyFont: "garamond", headingFont: "cinzel", chapterStyle: "ornament" },
    palette: palette("#3a1738", "#250d24", "#f7eaf0", "#f8eff3", "#d3b5c7", "#351b1b", "#170a0b", "#f9d6d2", "#a26390")
  },
  {
    id: "verdigris",
    theme: "nocturnal",
    label: "Verdigris",
    note: "Emerald snakeskin · octagon inlay · verdigris patina · iron clasp",
    tags: ["Snakeskin", "Octagon inlay", "Iron clasp"],
    specimen: { en: "Arcana", zh: "铜绿秘卷", authorEn: "Paracelsus", authorZh: "帕拉塞尔苏斯" },
    material: { kind: "snakeskin", color: "#152a26" },
    foil: { preset: "verdigris", color: "#78ceb6", metalness: 0.84, roughness: 0.3, second: "#ecc772", texture: "brushed" },
    layout: "crest",
    motif: "eye",
    border: "lozenge",
    frontOverrides: {
      onlay: {
        show: true, mode: "inlay", shape: "octagon", kind: "leather", border: true,
        color: "#0c1a17", x: 0.5, y: 0.505, width: 0.52, height: 0.34
      },
      motif: { y: 0.505, scale: 1.24, leaf: "second" },
      texts: {
        title: { font: "cinzel", size: 64, y: 0.225 },
        series: { leaf: "second" }
      }
    },
    spine: { style: "artdeco", emblem: "diamond" },
    back: {
      border: { style: "lozenge", inset: 0.055, finish: "foil" },
      motif: { key: "astrolabe", x: 0.5, y: 0.35, scale: 0.94, leaf: "second" },
      badge: { style: "edition", code: "ARCANA · VII", price: "OBSIDIAN PRESS" }
    },
    details: {
      edge: { style: "ombre", color: "#3d8573" },
      endpaper: { color: "#152623", pattern: "honeycomb" },
      ribbon: { show: true, color: "#78ceb6", double: true, second: "#ecc772" },
      headband: { color: "#152a26", striped: true, second: "#78ceb6" }
    },
    structure: {
      trim: "standard",
      bulk: 1.12,
      clasp: { show: true, metal: "iron", style: "single" }
    },
    stamp: { relief: "emboss", depth: 0.6 },
    interior: { paper: "obsidian", ink: "ivory", bodyFont: "garamond", headingFont: "cinzel", chapterStyle: "ornament" },
    palette: palette("#152422", "#0c1614", "#eaf2ef", "#edf3f0", "#9eb8b1", "#2b2019", "#130d09", "#d6efe5", "#5a9a8b")
  }
];

// Backward-compatibility aliases for books saved with earlier preset ids.
const PRESET_ALIASES = {
  vermilion: "ember",
  coral: "ember",
  oat: "blank",
  meadow: "herbarium",
  midnight: "cobalt"
};

export const getPreset = (id) => {
  const direct = PRESETS.find((preset) => preset.id === id);
  if (direct) return direct;
  const alias = PRESET_ALIASES[id];
  return (alias && PRESETS.find((preset) => preset.id === alias)) || PRESETS[0];
};
export const getFoil = (id) => FOILS.find((foil) => foil.id === id) || FOILS[0];
