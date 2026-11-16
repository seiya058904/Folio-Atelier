// Typeface library for covers and interior pages.
// Faces are loaded on demand through the CSS Font Loading API so that canvas
// text is only painted once the real glyphs are available.

const CJK_FALLBACK = '"Noto Serif SC", "Songti SC", "SimSun", serif';
const CJK_SANS_FALLBACK = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

export const FONTS = [
  { id: "cormorant", label: "Cormorant Garamond", stack: `"Cormorant Garamond", ${CJK_FALLBACK}`, kind: "serif", weights: [400, 500, 600, 700], italic: true },
  { id: "playfair", label: "Playfair Display", stack: `"Playfair Display", ${CJK_FALLBACK}`, kind: "serif", weights: [400, 500, 600, 700], italic: true },
  { id: "garamond", label: "EB Garamond", stack: `"EB Garamond", ${CJK_FALLBACK}`, kind: "serif", weights: [400, 500, 600, 700], italic: true },
  { id: "caslon", label: "Libre Caslon Text", stack: `"Libre Caslon Text", ${CJK_FALLBACK}`, kind: "serif", weights: [400, 700], italic: true },
  { id: "dmserif", label: "DM Serif Display", stack: `"DM Serif Display", ${CJK_FALLBACK}`, kind: "display", weights: [400], italic: true },
  { id: "cinzel", label: "Cinzel", stack: `"Cinzel", ${CJK_FALLBACK}`, kind: "display", weights: [400, 500, 600, 700], italic: false },
  { id: "italiana", label: "Italiana", stack: `"Italiana", ${CJK_FALLBACK}`, kind: "display", weights: [400], italic: false },
  { id: "inter", label: "Inter", stack: `"Inter", ${CJK_SANS_FALLBACK}`, kind: "sans", weights: [400, 500, 600, 700], italic: false },
  { id: "jost", label: "Jost", stack: `"Jost", ${CJK_SANS_FALLBACK}`, kind: "sans", weights: [300, 400, 500, 600], italic: true },
  { id: "grotesk", label: "Space Grotesk", stack: `"Space Grotesk", ${CJK_SANS_FALLBACK}`, kind: "sans", weights: [400, 500, 600, 700], italic: false },
  { id: "plexmono", label: "IBM Plex Mono", stack: `"IBM Plex Mono", ${CJK_SANS_FALLBACK}`, kind: "mono", weights: [400, 500, 600], italic: true },
  { id: "bodoni", label: "Bodoni Moda", stack: `"Bodoni Moda", ${CJK_FALLBACK}`, kind: "serif", weights: [400, 500, 600, 700], italic: true },
  { id: "fraunces", label: "Fraunces", stack: `"Fraunces", ${CJK_FALLBACK}`, kind: "serif", weights: [400, 500, 600, 700], italic: true },
  { id: "marcellus", label: "Marcellus", stack: `"Marcellus", ${CJK_FALLBACK}`, kind: "display", weights: [400], italic: false },
  { id: "pinyon", label: "Pinyon Script", stack: `"Pinyon Script", ${CJK_FALLBACK}`, kind: "display", weights: [400], italic: false },
  { id: "elite", label: "Special Elite", stack: `"Special Elite", ${CJK_SANS_FALLBACK}`, kind: "mono", weights: [400], italic: false },
  { id: "notoserifsc", label: "Noto Serif SC · 思源宋体", stack: CJK_FALLBACK, kind: "cjk", weights: [400, 500, 600, 700], italic: false },
  { id: "notosanssc", label: "Noto Sans SC · 思源黑体", stack: CJK_SANS_FALLBACK, kind: "cjk", weights: [400, 500, 700], italic: false },
  { id: "xiaowei", label: "ZCOOL XiaoWei · 站酷小薇", stack: `"ZCOOL XiaoWei", ${CJK_FALLBACK}`, kind: "cjk", weights: [400], italic: false },
  { id: "mashan", label: "Ma Shan Zheng · 马善政楷书", stack: `"Ma Shan Zheng", ${CJK_FALLBACK}`, kind: "cjk", weights: [400], italic: false },
  { id: "longcang", label: "Long Cang · 龙藏体", stack: `"Long Cang", ${CJK_FALLBACK}`, kind: "cjk", weights: [400], italic: false }
];

const FONT_BY_ID = new Map(FONTS.map((font) => [font.id, font]));

export function getFont(id) {
  return FONT_BY_ID.get(id) || FONT_BY_ID.get("cormorant");
}

export function nearestWeight(font, weight) {
  return font.weights.reduce(
    (best, candidate) => (
      Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best
    ),
    font.weights[0]
  );
}

/** Build a canvas `font` shorthand for a text style at a pixel size. */
export function fontString(style, pixelSize) {
  const font = getFont(style.font);
  const weight = nearestWeight(font, style.weight || 400);
  const italic = style.italic && font.italic ? "italic " : "";
  return `${italic}${weight} ${Math.max(1, pixelSize).toFixed(2)}px ${font.stack}`;
}

const hasCjk = (text) => /[⺀-鿿豈-﫿＀-￯]/.test(text || "");

/**
 * Make sure every face needed to paint the given styled runs is loaded.
 * `runs` is a list of `{ font, weight, italic, text }`.
 * Resolves `true` when something new was loaded (the caller should repaint)
 * and `false` when everything was already available.
 * Never rejects: a missing network just falls back to system faces.
 */
export async function ensureFonts(runs) {
  if (!document.fonts?.load) return false;
  const jobs = [];
  const seen = new Set();
  runs.forEach((run) => {
    if (!run || !run.text) return;
    const font = getFont(run.font);
    const weight = nearestWeight(font, run.weight || 400);
    const italic = run.italic && font.italic ? "italic " : "";
    const sample = run.text.slice(0, 400);
    const families = [font.stack.split(",")[0].trim()];
    if (hasCjk(sample) && font.kind !== "cjk") {
      families.push(font.kind === "serif" || font.kind === "display" ? '"Noto Serif SC"' : '"Noto Sans SC"');
    }
    families.forEach((family) => {
      const shorthand = `${italic}${weight} 32px ${family}`;
      const key = `${shorthand}|${sample}`;
      if (seen.has(key)) return;
      seen.add(key);
      let ready = false;
      try {
        ready = stylesheetReady && document.fonts.check(shorthand, sample);
      } catch (error) {
        ready = false;
      }
      if (!ready) jobs.push(document.fonts.load(shorthand, sample).catch(() => null));
    });
  });
  if (!jobs.length) return false;
  await Promise.race([
    Promise.all([stylesheetLoaded, ...jobs]),
    new Promise((resolve) => setTimeout(resolve, 3500))
  ]);
  return true;
}

// `document.fonts.check` reports true for families with no @font-face yet, so
// wait for the web-font stylesheet before trusting it.
let stylesheetReady = false;
const stylesheetLoaded = new Promise((resolve) => {
  const done = () => { stylesheetReady = true; resolve(); };
  const link = document.querySelector("link[data-fonts]");
  if (!link || link.sheet) done();
  else {
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
    setTimeout(done, 3000);
  }
});
