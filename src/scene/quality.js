// Rendering tiers. The tier is picked from the device, can be forced with
// `?quality=high|balanced|lite`, and is stepped down once if the first
// seconds of rendering turn out to be too slow for the machine.

const TIERS = {
  // Desktop GPUs: full-resolution textures, ambient occlusion, 4x MSAA.
  high: { shelf: 0.75, detail: 2, page: 2, pixelRatio: 2, shadow: 4096, post: true, leafShadows: true },
  // Phones and integrated graphics: crisp textures, no post-processing.
  balanced: { shelf: 0.5, detail: 1.5, page: 1.5, pixelRatio: 1.5, shadow: 2048, post: false, leafShadows: true },
  // Fallback for anything that still struggles.
  lite: { shelf: 0.5, detail: 1, page: 1, pixelRatio: 1, shadow: 1024, post: false, leafShadows: false }
};

const ORDER = ["high", "balanced", "lite"];
const STORAGE_KEY = "folio-atelier-quality";

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

export function detectQuality() {
  const forced = new URLSearchParams(location.search).get("quality");
  const stored = readStored();
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const lowMemory = (navigator.deviceMemory || 8) <= 4;
  let name = coarse || lowMemory ? "balanced" : "high";
  if (TIERS[stored] && ORDER.indexOf(stored) > ORDER.indexOf(name)) name = stored;
  if (TIERS[forced]) name = forced;
  return { name, forced: Boolean(TIERS[forced]), ...TIERS[name] };
}

/** The next tier down, or null when already at the lowest. Remembers the choice. */
export function lowerQuality(current) {
  if (current.forced) return null;
  const next = ORDER[ORDER.indexOf(current.name) + 1];
  if (!next) return null;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch (error) {
    // Remembering the tier is optional.
  }
  return { name: next, forced: false, ...TIERS[next] };
}
