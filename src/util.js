// Small shared helpers. No Three.js dependency so data modules stay portable.

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const pad = (value) => String(value).padStart(2, "0");

export function hashSeed(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function uid(prefix = "id") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${random}`;
}

export function deepClone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function debounce(fn, wait) {
  let timer = 0;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

/* ---------- colour ---------- */

export function hexToRgb(hex) {
  let value = String(hex || "#000").replace("#", "");
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const number = parseInt(value.slice(0, 6), 16) || 0;
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

export function rgbToHex(r, g, b) {
  const part = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function mixHex(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t));
}

export function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

export function hslToHex(h, s, l) {
  const hue = (p, q, t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  if (s === 0) return rgbToHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return rgbToHex(
    hue(p, q, h + 1 / 3) * 255,
    hue(p, q, h) * 255,
    hue(p, q, h - 1 / 3) * 255
  );
}

/**
 * Derive the room + interface palette from a cover colour, following the
 * relationships used by the seven original bindings: the wall takes a muted
 * version of the cloth, the shelf stays walnut, the ink flips with luminance.
 */
export function derivePalette(color, foil) {
  const [h, s, l] = hexToHsl(color);
  const dark = luminance(color) < 0.2;
  const wallL = dark ? clamp(l * 0.72, 0.07, 0.3) : clamp(l * 0.96, 0.3, 0.74);
  const wallS = clamp(s * (dark ? 0.62 : 0.86), 0, 0.8);
  const wall = hslToHex(h, wallS, wallL);
  const wallIsDark = luminance(wall) < 0.24;
  return {
    paper: wall,
    paperDeep: hslToHex(h, wallS, wallL * 0.74),
    paperPale: hslToHex(h, clamp(s * 0.5, 0, 0.5), 0.9),
    ink: wallIsDark ? hslToHex(h, 0.22, 0.94) : hslToHex(h, clamp(s * 0.6, 0.1, 0.5), 0.1),
    inkSoft: wallIsDark ? hslToHex(h, 0.16, 0.74) : hslToHex(h, clamp(s * 0.5, 0.1, 0.45), 0.24),
    wall,
    shelf: "#3a2118",
    shelfDark: "#1c0e0a",
    light: mixHex("#ffe6c4", foil || "#ffffff", 0.12),
    fill: hslToHex(h, clamp(s * 0.7, 0.1, 0.6), 0.72)
  };
}

/** The neutral paper-studio palette shown while the shelf is empty. */
export const ATELIER_PALETTE = Object.freeze({
  paper: "#e4dccb",
  paperDeep: "#cfc4ad",
  paperPale: "#f6f0e2",
  ink: "#231d17",
  inkSoft: "#5e5346",
  wall: "#e4dccb",
  shelf: "#4a2b1d",
  shelfDark: "#2a170f",
  light: "#ffe8c2",
  fill: "#d8e3e7"
});
