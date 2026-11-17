// The 3D experience: room, shelf, cameras, the shelf <-> inspection state
// machine, and all pointer interaction with the book (cover, pages, orbit).
//
//   shelf -> opening -> detail (closed / reading) -> closing -> shelf
//
// Interaction, page physics and the deterministic transitions come from
// The Complete Shelf. The engine now renders whatever books the library
// holds, and repaints a book live while it is being edited in the studio.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { createBookRig, createMesh, HIT_LAYER, PRINTED_LEAVES } from "./book/rig.js";
import { ensureFonts, onFontsLoaded } from "./data/fonts.js";
import { detectQuality, lowerQuality } from "./scene/quality.js";
import { t } from "./i18n.js";
import { ease, stepSpring, whenIdle } from "./motion.js";
import { perf } from "./perf.js";
import { bookPalette, coverFontRuns } from "./state/schema.js";
import { bindRenderer } from "./textures/gl.js";
import { forgetMeasurements, pageFontRuns, paginate } from "./textures/pages.js";
import { getContactShadowTexture } from "./textures/surface.js";
import { ATELIER_PALETTE, seededRandom } from "./util.js";

const WOOD_TEXTURE_URL = "./assets/walnut.webp";
const woodTextureImage = new Image();
woodTextureImage.decoding = "async";
woodTextureImage.src = WOOD_TEXTURE_URL;
let woodTextureReady = false;

const experience = document.querySelector("#experience");
const canvas = document.querySelector("#scene");
const loading = document.querySelector("#loading");
const fallbackStatus = document.querySelector("#fallback-status");
const studioPanel = document.querySelector("#studio");
const liveRegion = document.querySelector("#live-region");
const pointerLabel = document.querySelector("#pointer-label");
const pointerLabelIndex = document.querySelector("#pointer-label-index");
const pointerLabelTitle = document.querySelector("#pointer-label-title");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
// Set by anything that moved the scene this frame; the loop sleeps without it.
let motion = false;
let cameraMotion = false;
/** Frame-rate independent easing that also reports whether it still moves. */
const damp = (current, target, lambda, delta) => {
  const next = THREE.MathUtils.damp(current, target, lambda, delta);
  if (delta > 0 && Math.abs(next - current) > delta * 0.001) motion = true;
  return next;
};
const smoothstep = (value) => value * value * (3 - 2 * value);
const smootherstep = (value) => (
  value * value * value * (value * (value * 6 - 15) + 10)
);
const pad = (value) => String(value).padStart(2, "0");

// Texture resolutions, shadow size and post-processing for this device.
let quality = detectQuality();
let composer = null;
let occlusionPass = null;
// The drawing buffer has its own antialiasing only when nothing is composed.
let contextAntialias = true;
let basePixelRatio = 1;
// Resolution multiplier: 1 at rest, lowered while moving on slow machines.
let renderScale = 1;
let motionScale = 1;
const RENDER_SCALES = [1, 0.85, 0.7, 0.58];
const SLOW_FRAME_MS = 21;
const FAST_FRAME_MS = 17.6;
const frameBudget = { ema: 0, streak: 0, cooldown: 0, slow: 0, upAt: 0, retry: 4000 };

// The loop renders only while something moves. After the last interaction the
// room keeps its slow ambient drift for a while, then goes fully idle.
const AMBIENT_MS = 9000;
const AMBIENT_FADE_MS = 2200;
const AMBIENT_FRAME_MS = 30;
let lastActivity = performance.now();
let lastRenderAt = 0;
let activeUntil = 0;
let wakeRender = true;
let ambient = 1;
let ambientClock = 0;
let shadowHold = 4;
let dustPoints = null;

// Books on their way off the shelf (deleted): they lift and fade, then go.
const leavingRigs = [];
const LEAVE_SECONDS = 0.44;
// The cover swings on a spring so that it overshoots a little and settles.
const coverSpring = { value: 0, velocity: 0 };
// The ribbon marker swings when the book is handled.
const ribbonSway = { value: 0, velocity: 0 };
// A pass of light over the foil when the stamping changes.
let glintTime = 1;
const GLINT_SECONDS = 0.6;

// Edits are merged per book and painted once per frame.
const pendingRepaints = new Map();
const draftRigs = new Set();
const DRAFT_SETTLE_MS = 170;
let settleTimer = 0;
// Bumped when fonts or images arrive, so printed pages know to repaint.
let pageEpoch = 0;
let paginateCost = 0;
let lazyPaintPending = false;
// A short flourish on the open book when its whole binding changes.
let rebindTime = 1;

let audio = { playCue() {}, unlock() {}, handleVisibility() {}, dispose() {} };
let hooks = {};
let books = [];

let reducedMotion = reducedMotionQuery.matches;
let renderer;
let scene;
let camera;
let controls;
let environmentTarget;
let shelfStage;
let bookRigs = [];
let hitTargets = [];
let rafId = 0;
let lastTime = performance.now();
let mode = "hero";
let transitionTime = 0;
let position = 0;
let targetPosition = 0;
let selectedIndex = -1;
let hoveredIndex = -1;
let wheelIdle = 0;
let focusReturnTarget = null;
let activeBook = null;
let readingOpen = false;
let detailBookHovered = false;
let currentSpread = 0;
let pointerDirty = false;
let suspended = false;
let viewWidth = window.innerWidth;
let viewHeight = window.innerHeight;
let detailViewOffsetX = 0;
let currentViewOffsetX = 0;
let detailSafeWidth = viewWidth * 0.6;
let themeInitialized = false;
let themeMoving = false;
let themeKey = "";
let pageRefreshTimer = 0;
let pendingView = null;

const roomMaterials = {
  floor: null,
  wall: null,
  shelf: null,
  shelfDark: null,
  shadow: null
};
const roomLights = {
  hemisphere: null,
  key: null,
  softKey: null,
  fill: null,
  rim: null,
  backFill: null,
  spineRake: null,
  pageRake: null
};
const themeTargets = {
  floor: new THREE.Color(0xd8c8aa),
  wall: new THREE.Color(0xe9dfcb),
  shelf: new THREE.Color(0x4a2b1d),
  shelfDark: new THREE.Color(0x2a170f),
  shadow: new THREE.Color(0x2f1d13),
  fog: new THREE.Color(0xe9dfcb),
  hemisphere: new THREE.Color(0xfff8e8),
  hemisphereGround: new THREE.Color(0x5b4030),
  key: new THREE.Color(0xffe8c2),
  fill: new THREE.Color(0xd8e3e7),
  rim: new THREE.Color(0xd5a45e)
};

const pointer = {
  ndc: new THREE.Vector2(3, 3),
  clientX: 0,
  clientY: 0
};
const pageDrag = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  progress: 0,
  peakProgress: 0,
  committed: false,
  progressVelocity: 0,
  verticalBias: 0,
  lastProgress: 0,
  lastTime: 0,
  direction: 0,
  kind: null
};
const detailPress = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  moved: false,
  allowClick: false
};
const viewTween = {
  active: false,
  time: 0,
  duration: 0.85,
  from: new THREE.Spherical(),
  to: new THREE.Spherical(),
  fromTarget: new THREE.Vector3(),
  current: new THREE.Spherical()
};

const raycaster = new THREE.Raycaster();
raycaster.layers.enable(HIT_LAYER);
const shelfCameraPosition = new THREE.Vector3();
const shelfCameraTarget = new THREE.Vector3();
const inspectPosition = new THREE.Vector3();
const inspectCameraPosition = new THREE.Vector3();
const inspectCameraTarget = new THREE.Vector3();
const transitionCameraTarget = new THREE.Vector3();
const openingBookPosition = new THREE.Vector3();
const openingBookQuaternion = new THREE.Quaternion();
const openingBookScale = new THREE.Vector3();
const openingMotionPosition = new THREE.Vector3();
const openingMotionQuaternion = new THREE.Quaternion();
const restingMotionPosition = new THREE.Vector3();
const restingMotionQuaternion = new THREE.Quaternion();
const openingCameraPosition = new THREE.Vector3();
const openingCameraTarget = new THREE.Vector3();
const openingShelfPosition = new THREE.Vector3();
const inspectShelfPosition = new THREE.Vector3(0, -4.2, -3);
const inspectBookQuaternion = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.055, -0.14, 0)
);
const inspectBookScale = new THREE.Vector3();
const closingBookPosition = new THREE.Vector3();
const closingBookStartPosition = new THREE.Vector3();
const closingBookStartQuaternion = new THREE.Quaternion();
const closingBookStartScale = new THREE.Vector3();
const closingBookQuaternion = new THREE.Quaternion();
const closingBookScale = new THREE.Vector3(1.09, 1.09, 1.09);
const closingMotionPosition = new THREE.Vector3();
const closingMotionQuaternion = new THREE.Quaternion();
const closingCameraPosition = new THREE.Vector3();
const closingCameraTarget = new THREE.Vector3();
const closingShelfPosition = new THREE.Vector3();
const shelfRestPosition = new THREE.Vector3();
const scratchVector = new THREE.Vector3();
const shelfBoardTop = 0.47;
const spacing = 1.5;
const PAGE_TURN_COMMIT_PROGRESS = 0.18;
const COVER_OPEN_COMMIT_PROGRESS = 0.16;
const COVER_CLOSE_COMMIT_PROGRESS = 0.2;
const DETAIL_TRANSITION_DURATION = 0.92;
const SHELF_TRANSITION_DURATION = 0.92;
let openingViewOffsetX = 0;
let closingViewOffsetX = 0;

const shared = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
  walnut: new THREE.MeshStandardMaterial({
    color: 0x4a2b1d,
    roughness: 0.58,
    metalness: 0
  }),
  walnutDark: new THREE.MeshStandardMaterial({
    color: 0x2a170f,
    roughness: 0.7,
    metalness: 0
  })
};

const emit = (name, ...args) => hooks[name]?.(...args);
const announce = (message) => { liveRegion.textContent = message; };

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

function configureResponsiveTargets() {
  const narrow = viewWidth < 820;
  shelfCameraPosition.set(0, narrow ? 2.02 : 1.92, narrow ? 8.7 : 8.1);
  shelfCameraTarget.set(0, narrow ? 1.57 : 1.55, 0);
  inspectPosition.set(narrow ? 0 : -2.25, narrow ? 2.42 : 1.56, narrow ? 0.15 : 0);
  inspectCameraPosition.set(narrow ? 0 : -0.52, narrow ? 1.7 : 1.78, narrow ? 7.4 : 5.25);
  inspectCameraTarget.copy(inspectPosition);
  // On phones the workbench covers the lower half, so aim below the book.
  if (narrow) inspectCameraTarget.y -= 1.05;

  if (narrow) {
    detailViewOffsetX = 0;
    detailSafeWidth = viewWidth;
    return;
  }

  const panelWidth = studioPanel.offsetWidth || viewWidth * 0.32;
  const panelLeft = viewWidth - panelWidth;
  const gutter = clamp(viewWidth * 0.03, 24, 48);
  detailSafeWidth = Math.max(viewWidth * 0.42, panelLeft - gutter);
  const wideLayoutProgress = clamp((viewWidth - 820) / 620, 0, 1);
  const bookCenterRatio = lerp(0.55, 0.6, wideLayoutProgress);
  const desiredBookCenter = detailSafeWidth * bookCenterRatio;
  detailViewOffsetX = Math.max(0, viewWidth * 0.5 - desiredBookCenter);
}

function getInspectScale() {
  if (!activeBook || viewWidth < 820) return 0.82;
  const distance = Math.abs(inspectCameraPosition.z - inspectPosition.z);
  const worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const pixelsPerWorld = viewHeight / Math.max(worldHeight, 0.001);
  const estimatedBookWidth = activeBook.base.width * pixelsPerWorld * 1.16;
  const scaleForSafeWidth = (detailSafeWidth * 0.72) / Math.max(estimatedBookWidth, 1);
  return clamp(scaleForSafeWidth, 0.9, 1.32);
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

const PAGE_THEME_INTERVAL_MS = 180;
let pendingPageTheme = null;
let pageThemeAt = -1000;
let pageThemeTimer = 0;
let themeRequestAt = -1000;

function applyPageTheme() {
  clearTimeout(pageThemeTimer);
  pageThemeTimer = 0;
  if (!pendingPageTheme) return;
  const { palette, accent } = pendingPageTheme;
  pendingPageTheme = null;
  pageThemeAt = performance.now();
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--paper", palette.paper);
  rootStyle.setProperty("--paper-deep", palette.paperDeep);
  rootStyle.setProperty("--paper-pale", palette.paperPale);
  rootStyle.setProperty("--ink", palette.ink);
  rootStyle.setProperty("--ink-soft", palette.inkSoft);
  rootStyle.setProperty("--walnut", palette.shelf);
  rootStyle.setProperty("--walnut-deep", palette.shelfDark);
  rootStyle.setProperty("--rule", `color-mix(in srgb, ${palette.ink} 24%, transparent)`);
  rootStyle.setProperty("--accent", accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.paper);
}

function applyTheme(palette, accent) {
  // Restyling the whole page is not free; skip it when nothing changed.
  const key = JSON.stringify([palette, accent]);
  if (key === themeKey) return;
  themeKey = key;
  // Restyling the interface recalculates the style of the whole page, which
  // grows with the studio. A single change (a swatch) restyles at once; while
  // a colour is being dragged the 3D room follows every frame and the page
  // waits until the hand rests.
  pendingPageTheme = { palette, accent };
  const now = performance.now();
  const streaming = now - themeRequestAt < PAGE_THEME_INTERVAL_MS;
  themeRequestAt = now;
  clearTimeout(pageThemeTimer);
  if (!streaming && now - pageThemeAt >= PAGE_THEME_INTERVAL_MS) applyPageTheme();
  else pageThemeTimer = setTimeout(applyPageTheme, PAGE_THEME_INTERVAL_MS);

  themeTargets.floor.set(palette.paperDeep);
  themeTargets.wall.set(palette.wall);
  themeTargets.shelf.set(palette.shelf);
  themeTargets.shelfDark.set(palette.shelfDark);
  themeTargets.shadow.set(palette.shelfDark);
  themeTargets.fog.set(palette.wall);
  themeTargets.hemisphere.set(palette.paperPale);
  themeTargets.hemisphereGround.set(palette.shelf);
  themeTargets.key.set(palette.light);
  themeTargets.fill.set(palette.fill);
  themeTargets.rim.set(accent);

  applyRoomToTargets();

  if (!themeInitialized || reducedMotion) {
    themeInitialized = true;
    setThemeColorsImmediately();
  } else {
    themeMoving = true;
  }
  requestFrame();
}

/* ------------------------------------------------------------------ */
/* The room: shelf style and light, chosen for the whole library       */
/* ------------------------------------------------------------------ */

// The room is the reader's: its colours come from these settings, not from the
// book in view. ("Follow the book" brings back the original behaviour, where
// each book's palette tints the walls, the floor and the light.)
const SHELF_STYLES = {
  walnut: {},
  oak: { tint: "#b98a5b", darkTint: "#8a6440", mix: 0.72 },
  white: { tint: "#ece6db", darkTint: "#d5ccbe", mix: 0.92, plain: true, roughness: 0.62 },
  steel: { tint: "#2d2e31", darkTint: "#17181a", mix: 0.94, plain: true, roughness: 0.36, metalness: 0.6 },
  ledge: { frameless: true }
};

const LIGHT_PRESETS = {
  studio: {},
  morning: { key: "#fff4e4", mix: 0.55, wall: "#f3eee6", wallMix: 0.3, intensity: { key: 1.08, hemisphere: 1.25, fill: 1.8, softKey: 0.95 } },
  golden: { key: "#ffad62", mix: 0.62, wall: "#e9b57f", wallMix: 0.28, rim: "#ff9a4a", intensity: { key: 1.15, hemisphere: 0.8, rim: 1.6, fill: 0.5 } },
  // Night: the room light is down and the softbox, warmed, plays the lamp.
  // No light is added: a new light would recompile every material.
  night: {
    key: "#ffbf73", mix: 0.85, wall: "#1d1b24", wallMix: 0.72,
    // The interface goes dark with the room, so its words stay legible.
    palette: {
      paper: "#2a272e", paperDeep: "#1f1d23", paperPale: "#3a3640", ink: "#f0e8db", inkSoft: "#bdb1a1",
      wall: "#2a272e"
    },
    intensity: { key: 0.3, hemisphere: 0.28, fill: 0.2, softKey: 1.25, backFill: 0.3, rim: 0.7, spineRake: 0.8, pageRake: 0.7 }
  }
};

let room = { shelf: "walnut", light: "studio", follow: false };
const ROOM_ACCENT = "#a8643a";
let studioAccent = "";

/** The room's own palette: the paper studio, as lit by the chosen light. */
function roomPalette() {
  return { ...ATELIER_PALETTE, ...(LIGHT_PRESETS[room.light]?.palette || {}) };
}
const roomFrame = [];

/** Bend the palette targets towards the chosen shelf and light. */
function applyRoomToTargets() {
  const shelf = SHELF_STYLES[room.shelf] || {};
  if (shelf.tint) {
    themeTargets.shelf.lerp(new THREE.Color(shelf.tint), shelf.mix);
    themeTargets.shelfDark.lerp(new THREE.Color(shelf.darkTint), shelf.mix);
    themeTargets.hemisphereGround.lerp(new THREE.Color(shelf.tint), shelf.mix * 0.5);
  }
  const light = LIGHT_PRESETS[room.light] || {};
  if (light.key) {
    const key = new THREE.Color(light.key);
    themeTargets.key.lerp(key, light.mix);
    themeTargets.hemisphere.lerp(key, light.mix * 0.5);
  }
  if (light.rim) themeTargets.rim.lerp(new THREE.Color(light.rim), 0.6);
  if (light.wall) {
    const wall = new THREE.Color(light.wall);
    themeTargets.wall.lerp(wall, light.wallMix);
    themeTargets.fog.lerp(wall, light.wallMix);
    themeTargets.floor.lerp(wall, light.wallMix * 0.8);
  }
}

/** Light strengths, shelf surface and frame for the current room. */
function applyRoomSettings() {
  const light = LIGHT_PRESETS[room.light] || {};
  Object.entries(roomLights).forEach(([name, source]) => {
    if (!source || source.userData.base === undefined) return;
    source.intensity = source.userData.base * (light.intensity?.[name] ?? 1);
  });
  const shelf = SHELF_STYLES[room.shelf] || {};
  [shared.walnut, shared.walnutDark].forEach((material) => {
    const wantMap = !shelf.plain;
    if (wantMap && !material.map && material.userData.woodMap) {
      material.map = material.userData.woodMap;
      material.needsUpdate = true;
    } else if (!wantMap && material.map) {
      material.userData.woodMap = material.map;
      material.map = null;
      material.needsUpdate = true;
    }
    material.roughness = shelf.roughness ?? material.userData.baseRoughness ?? material.roughness;
    material.metalness = shelf.metalness ?? material.userData.baseMetalness ?? material.metalness;
  });
  roomFrame.forEach((mesh) => { mesh.visible = !shelf.frameless; });
  shadowHold = 4;
}

/** Choose the shelf style and light for the room. */
function setRoom(next = {}) {
  room = {
    shelf: SHELF_STYLES[next.shelf] ? next.shelf : room.shelf,
    light: LIGHT_PRESETS[next.light] ? next.light : room.light,
    follow: typeof next.follow === "boolean" ? next.follow : room.follow
  };
  if (!scene) return;
  applyRoomSettings();
  themeKey = "";
  applySelectedTheme();
  requestFrame();
}

function applySelectedTheme() {
  const book = books[selectedIndex];
  if (room.follow && book) applyTheme(bookPalette(book), book.foil.color);
  else applyTheme(roomPalette(), ROOM_ACCENT);
  // The book still lends its foil to the studio's accents. Set on the panel
  // alone, so only the panel is restyled.
  const accent = book && !room.follow ? book.foil.color : "";
  if (accent !== studioAccent) {
    studioAccent = accent;
    if (accent) studioPanel.style.setProperty("--accent", accent);
    else studioPanel.style.removeProperty("--accent");
  }
}

/* ------------------------------------------------------------------ */
/* Library <-> rigs                                                    */
/* ------------------------------------------------------------------ */

function rebuildHitTargets() {
  hitTargets = bookRigs.map((rig) => rig.hit);
}

function rigFor(id) {
  return bookRigs.find((rig) => rig.data.id === id) || null;
}

/** Start loading the web fonts a cover needs; `onFontsArrived` repaints. */
function requestCoverFonts(rig) {
  ensureFonts(coverFontRuns(rig.data));
}

let fontsTimer = 0;

/**
 * More web fonts have finished loading. Boards whose lettering was waiting
 * for them repaint (their signatures say so); the open book is measured and
 * printed again, since real glyphs have different widths.
 */
function onFontsArrived() {
  clearTimeout(fontsTimer);
  fontsTimer = setTimeout(() => {
    // Through the board-by-board pass: a font often lands mid-flight.
    bookRigs.forEach((rig) => {
      if (rig.painted) draftRigs.add(rig);
    });
    if (draftRigs.size) scheduleSettle(0);
    forgetMeasurements();
    pageEpoch += 1;
    if (activeBook) paginateActive();
    shadowHold = 3;
    requestFrame();
  }, 90);
}

/** First paint of a book's boards (books out of sight are left unpainted). */
function paintRig(rig) {
  rig.repaint();
  requestCoverFonts(rig);
  shadowHold = 3;
}

/* ----- warm-up: books near the view get ready before they arrive ----- */

// A book scrolling into view for the first time used to pay for everything in
// that frame: painting its boards, compiling the shader variants its
// materials need (100-200 ms each on ANGLE) and uploading its textures. In
// idle time, every book does it ahead, nearest first, one small step at a
// time. (A scroll along the shelf paints them all anyway.)
const WARM_RANGE = Infinity;
let warmHandle = 0;

function rigTextures(rig) {
  const found = new Set();
  rig.root.traverse((object) => {
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach((material) => {
      if (!material) return;
      for (const key in material) {
        const value = material[key];
        if (value && value.isTexture) found.add(value);
      }
      const relief = material.userData?.relief?.map?.value;
      if (relief?.isTexture) found.add(relief);
    });
  });
  return found;
}

function scheduleWarmup() {
  if (warmHandle || !renderer || suspended) return;
  warmHandle = whenIdle(warmStep, 2400);
}

function warmStep(deadline) {
  warmHandle = 0;
  // Only on the shelf: in the studio every quiet moment belongs to the open
  // book (returning to the shelf starts it again).
  if (!renderer || suspended || mode !== "hero") return;
  // Painting a book takes a few tens of milliseconds: only while the shelf is
  // still (an ambient frame may wait, nobody sees it) or when it is overdue.
  const still = position === targetPosition && wheelIdle <= 0;
  const roomy = deadline.didTimeout || (still && deadline.timeRemaining() > 2);
  const near = bookRigs
    .map((rig, index) => [Math.abs(index - targetPosition), rig])
    .filter(([distance]) => distance <= WARM_RANGE)
    .sort((a, b) => a[0] - b[0]);
  for (const [, rig] of near) {
    if (!rig.painted) {
      if (!roomy) continue;
      paintRig(rig);
      scheduleWarmup();
      return;
    }
    if (!rig.compiled) {
      rig.compiled = true;
      // Parallel where the browser can (KHR_parallel_shader_compile). The
      // program depends on where it draws (tone mapping and colour space are
      // off inside the composer), so compile against the same target.
      compileQuietly(rig.root);
      scheduleWarmup();
      return;
    }
    let uploaded = 0;
    for (const texture of rigTextures(rig)) {
      if (texture.version > 0 && renderer.properties.get(texture).__version !== texture.version) {
        renderer.initTexture(texture);
        uploaded += 1;
        if (uploaded >= 2) break;
      }
    }
    if (uploaded) {
      scheduleWarmup();
      return;
    }
  }
  if (!roomy && near.some(([, rig]) => !rig.painted)) scheduleWarmup();
}

/** Compile an object's programs in parallel, for the target the scene draws into. */
function compileQuietly(object) {
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(composer ? composer.readBuffer : null);
  const done = renderer.compileAsync(object, camera, scene).catch(() => {});
  renderer.setRenderTarget(previous);
  return done;
}

/* ----- shader variants for the studio ----- */

// Edits in the studio can switch a material feature on or off (a silk cloth
// has sheen, a holographic foil iridescence), and Three then compiles a new
// program in the middle of the frame. Once per visit, the open book's
// stand-ins for every variant are compiled in idle time, a few at a time.
let variantsWarm = false;

function prewarmVariants() {
  if (variantsWarm || !activeBook || !renderer || mode !== "detail") return;
  variantsWarm = true;
  const stands = [...activeBook.shaderVariants().children];
  const release = (batch) => batch.forEach((stand) => {
    // Keep the material (it holds the program); let go of the book's canvases.
    for (const key in stand.material) {
      if (stand.material[key]?.isTexture) stand.material[key] = null;
    }
    stand.material.userData = {};
  });
  const next = () => {
    if (!stands.length || !renderer) return;
    const batch = stands.splice(0, 4);
    const group = new THREE.Group();
    batch.forEach((stand) => group.add(stand));
    compileQuietly(group).then(() => {
      release(batch);
      whenIdle(next, 1500);
    });
  };
  whenIdle(next, 1500);
}

function buildRig(book) {
  const rig = createBookRig(book, {
    resolution: quality.shelf,
    lazy: true,
    onAsset: () => {
      if (!bookRigs.includes(rig)) return;
      pageEpoch += 1;
      if (rig.painted) rig.repaint({ force: true });
      if (rig === activeBook) schedulePageRefresh(0);
      requestFrame();
    }
  });
  return rig;
}

function addBook(book, index = bookRigs.length, { from = null } = {}) {
  const rig = buildRig(book);
  bookRigs.splice(index, 0, rig);
  rebuildHitTargets();
  shelfStage.add(rig.root);
  snapRigToShelfSlot(rig, index);
  paintRig(rig);
  const source = from ? rigFor(from) : null;
  if (source && source !== rig && !reducedMotion) {
    // A copy slides out from behind the book it was made from.
    rig.root.position.copy(source.root.position);
    rig.root.position.z -= 0.06;
    rig.root.rotation.copy(source.root.rotation);
    rig.root.scale.copy(source.root.scale);
  } else if (!reducedMotion) {
    // A new binding settles onto the shelf from just above it.
    rig.root.position.y += 0.62;
    rig.root.rotation.z += 0.16;
    rig.root.rotation.y -= 0.5;
    rig.root.scale.multiplyScalar(0.9);
    rig.opacity = 0;
    rig.fadeMaterials.forEach((material) => { material.opacity = 0; });
  }
  requestFrame();
  return rig;
}

function removeBook(id) {
  const index = bookRigs.findIndex((rig) => rig.data.id === id);
  if (index < 0) return;
  const [rig] = bookRigs.splice(index, 1);
  pendingRepaints.delete(rig);
  draftRigs.delete(rig);
  rig.hit.visible = false;
  if (reducedMotion || mode !== "hero" || !rig.root.visible) {
    rig.dispose();
  } else {
    // It lifts off the shelf and fades; its neighbours close the gap.
    rig.leaving = 0;
    rig.leaveFrom = rig.root.position.y;
    leavingRigs.push(rig);
  }
  rebuildHitTargets();
  hoveredIndex = -1;
  const shifted = selectedIndex > index ? selectedIndex - 1 : selectedIndex;
  const next = clamp(shifted, 0, Math.max(0, bookRigs.length - 1));
  selectedIndex = -2;
  targetPosition = next;
  updateSelection(next, false);
  requestFrame();
}

/**
 * A book's spec changed. The work is queued and done once in the next frame,
 * however many edits arrive before it. `interactive` edits (a slider being
 * dragged, typing) are painted at draft resolution and sharpened at rest.
 */
function refreshBook(book, dirty = ["all"], { interactive = false } = {}) {
  const rig = rigFor(book.id);
  if (!rig) return;
  const entry = pendingRepaints.get(rig) || { dirty: new Set(), draft: true };
  dirty.forEach((key) => entry.dirty.add(key));
  entry.draft = entry.draft && interactive;
  pendingRepaints.set(rig, entry);
  requestFrame();
}

function flushRepaints() {
  if (!pendingRepaints.size) return;
  let streaming = false;
  pendingRepaints.forEach((entry, rig) => {
    if (entry.draft) streaming = true;
    if (!bookRigs.includes(rig)) return;
    const has = (key) => entry.dirty.has("all") || entry.dirty.has(key);
    if (rig.painted) {
      // An edit that repaints the whole book at once (a preset, a material)
      // is shown as a draft straight away and sharpened board by board, so
      // the click is answered in the next frame instead of after a pause.
      const wholeBook = entry.dirty.has("all") || entry.dirty.has("material");
      const draft = (entry.draft || wholeBook) && rig === activeBook;
      const hidden = draft ? rig.hiddenFaces(camera) : null;
      // The endpapers are inside the boards: out of sight while the book is shut.
      if (hidden) hidden.endpaper = !readingOpen;
      if (rig.repaint({ draft, hidden })) draftRigs.add(rig);
      if (has("front") || has("spine") || has("back") || has("meta")) requestCoverFonts(rig);
    }
    if (books[selectedIndex] === rig.data) applySelectedTheme();
    if (rig !== activeBook) return;
    if (entry.dirty.has("all") && mode === "detail" && !reducedMotion) {
      rebindTime = 0;
      kickRibbon(0.7);
    }
    // A change made with one click (not a drag) is answered by the foil;
    // a whole-book change glints once it is sharp.
    const sharpLater = entry.dirty.has("all") || entry.dirty.has("material");
    if (!entry.draft && !sharpLater && (has("foil") || has("front") || has("spine") || has("back"))) startGlint();
    // The pages borrow the cover ornament and the cloth colour.
    const motifKey = rig.data.front.motif.key;
    const motifChanged = motifKey !== rig.pageMotif;
    rig.pageMotif = motifKey;
    if (has("pages") || has("interior") || has("meta") || has("material") || motifChanged) {
      refreshPagesAfterEdit(entry.draft && (entry.dirty.has("pages") || entry.dirty.has("interior")));
    }
  });
  pendingRepaints.clear();
  shadowHold = 3;
  // A drag sharpens once the hand rests; a single click right after its
  // draft has been seen.
  if (draftRigs.size) scheduleSettle(streaming ? DRAFT_SETTLE_MS : 50);
}

let settleEpoch = 0;

/** Start (or restart) the board-by-board full-size pass after `delay` ms. */
function scheduleSettle(delay) {
  clearTimeout(settleTimer);
  settleEpoch += 1;
  settleTimer = setTimeout(settleDrafts, delay);
}

/**
 * The hand has rested: repaint draft boards at full resolution, one board per
 * frame across all books (each is tens of milliseconds at studio resolution),
 * the open book and the boards facing the camera first. Nothing is painted
 * while a book flies between the shelf and the studio.
 */
function settleDrafts() {
  if (mode === "opening" || mode === "closing") {
    settleTimer = setTimeout(settleDrafts, 120);
    return;
  }
  const order = [...draftRigs].sort((a, b) => Number(b === activeBook) - Number(a === activeBook));
  let painted = 0;
  for (const rig of order) {
    if (painted) break;
    if (!bookRigs.includes(rig) || !rig.painted) {
      draftRigs.delete(rig);
      continue;
    }
    const hidden = rig === activeBook ? rig.hiddenFaces(camera) : null;
    const more = rig.repaint({ budget: 1, hidden });
    painted += rig.paintedFaces;
    if (!more) draftRigs.delete(rig);
  }
  shadowHold = Math.max(shadowHold, 2);
  requestFrame();
  if (draftRigs.size) {
    // Let this board reach the screen before painting the next.
    const epoch = settleEpoch;
    requestAnimationFrame(() => {
      if (epoch !== settleEpoch) return;
      settleTimer = setTimeout(settleDrafts, 0);
    });
    return;
  }
  startGlint();
}

/* ------------------------------------------------------------------ */
/* Selection and shelf navigation                                      */
/* ------------------------------------------------------------------ */

function updateSelection(index, shouldAnnounce = false) {
  const count = books.length;
  const nextIndex = count ? clamp(index, 0, count - 1) : -1;
  if (nextIndex === selectedIndex && !shouldAnnounce) return;
  const previousIndex = selectedIndex;
  selectedIndex = nextIndex;
  applySelectedTheme();
  scheduleWarmup();
  if (previousIndex >= 0 && nextIndex >= 0 && previousIndex !== nextIndex) {
    audio.playCue("navigate");
  }
  const book = books[selectedIndex] || null;
  emit("onSelect", selectedIndex, book);
  if (shouldAnnounce && book) {
    announce(t("Selected {title}, book {n} of {count}.", { title: book.title, n: selectedIndex + 1, count }));
  }
}

function selectIndex(index, origin) {
  if (mode !== "hero" || !books.length) return;
  targetPosition = clamp(index, 0, books.length - 1);
  focusReturnTarget = origin || null;
  updateSelection(targetPosition, true);
  requestFrame();
}

function navigate(direction, origin) {
  if (mode !== "hero" || !books.length) return;
  targetPosition = clamp(Math.round(targetPosition) + direction, 0, books.length - 1);
  focusReturnTarget = origin || null;
  updateSelection(targetPosition, true);
  requestFrame();
}

function alignShelfToSelection() {
  targetPosition = Math.max(0, selectedIndex);
  position = targetPosition;
}

function shelfSlot(index) {
  const offset = index - position;
  const distance = Math.abs(offset);
  const focus = 1 - clamp(distance, 0, 1);
  const fadeProgress = clamp((distance - 2.55) / 0.7, 0, 1);
  return {
    offset,
    distance,
    focus,
    opacity: 1 - smoothstep(fadeProgress),
    x: offset * spacing,
    z: 0.13 + focus * 0.24 - Math.min(distance, 2.8) * 0.07,
    rotationY: -clamp(offset, -4, 4) * 0.105,
    rotationZ: -clamp(offset, -4, 4) * 0.018,
    scale: 1 + focus * 0.09
  };
}

function snapRigToShelfSlot(rig, index) {
  const slot = shelfSlot(index);
  rig.root.position.set(
    slot.x,
    shelfBoardTop + rig.base.height * 0.5 + slot.focus * 0.15,
    slot.z
  );
  rig.root.rotation.set(0, slot.rotationY, slot.rotationZ);
  rig.root.scale.setScalar(slot.scale);
  rig.motion.position.y = 0;
  rig.motion.rotation.set(0, 0, 0);
  rig.frontPivot.rotation.y = 0;
  rig.pagePivots.forEach((pagePivot) => {
    pagePivot.rotation.y = 0;
    pagePivot.rotation.z = 0;
    pagePivot.position.z = pagePivot.userData.restZ;
    updateFlexiblePage(pagePivot, 0, 0, true);
  });
  rig.opacity = slot.opacity;
  rig.fadeMaterials.forEach((material) => {
    material.opacity = slot.opacity;
  });
  rig.contactShadow.visible = true;
  rig.contactShadow.material.opacity = slot.opacity * 0.24;
  rig.hit.visible = slot.opacity > 0.12;
  rig.lastOffset = slot.offset;
}

function updateShelfLayout(delta, elapsed) {
  if (mode === "hero") {
    const limit = Math.max(0, books.length - 1);
    position = reducedMotion
      ? targetPosition
      : damp(position, targetPosition, 9.5, delta);
    if (Math.abs(position - targetPosition) < 0.0005) position = targetPosition;

    if (wheelIdle > 0) {
      wheelIdle -= delta;
      if (wheelIdle <= 0) targetPosition = clamp(Math.round(targetPosition), 0, limit);
    }

    // The selection follows where the shelf is going, not where it is on the
    // way: a jump across several books (or a slow, throttled window) must not
    // select each book it passes, nor fall back to the one it left.
    if (books.length) {
      const nearest = clamp(Math.round(targetPosition), 0, limit);
      if (nearest !== selectedIndex) updateSelection(nearest, false);
    }
  }

  let paintBudget = 2;
  lazyPaintPending = false;
  bookRigs.forEach((rig, index) => {
    if (rig.root.parent !== shelfStage) return;

    const slot = shelfSlot(index);
    const targetY = shelfBoardTop + rig.base.height * 0.5 + slot.focus * 0.15;
    const speed = reducedMotion ? 1000 : 12;
    rig.lastOffset = slot.offset;

    rig.root.position.x = damp(rig.root.position.x, slot.x, speed, delta);
    rig.root.position.y = damp(rig.root.position.y, targetY, speed * 0.6, delta);
    rig.root.position.z = damp(rig.root.position.z, slot.z, speed, delta);
    rig.root.rotation.y = damp(rig.root.rotation.y, slot.rotationY, speed, delta);
    rig.root.rotation.z = damp(rig.root.rotation.z, slot.rotationZ, speed, delta);
    rig.root.scale.setScalar(damp(rig.root.scale.x, slot.scale, speed, delta));

    rig.opacity = reducedMotion
      ? slot.opacity
      : damp(rig.opacity, slot.opacity, 14, delta);
    rig.root.visible = rig.opacity > 0.004;
    rig.fadeMaterials.forEach((material) => {
      material.opacity = rig.opacity;
    });
    rig.contactShadow.visible = true;
    rig.contactShadow.material.opacity = rig.opacity * 0.24;
    rig.hit.visible = rig.opacity > 0.12;
    if (!rig.root.visible) return;
    if (rig.hasBand && rig.updateBand(delta, { tug: hoveredIndex === index && !reducedMotion })) motion = true;
    if (!rig.painted) {
      // Books are painted as they come into view, at most two a frame.
      if (paintBudget > 0) {
        paintBudget -= 1;
        paintRig(rig);
      } else {
        lazyPaintPending = true;
      }
    }

    const isHovered = hoveredIndex === index && mode === "hero";
    const hoverPreview = isHovered && !reducedMotion;
    const hoverAngle = hoverPreview && !rig.hasBand ? -0.085 : 0;
    const settle = reducedMotion ? 1000 : 13;
    rig.frontPivot.rotation.y = damp(rig.frontPivot.rotation.y, hoverAngle, settle, delta);
    rig.pagePivots.forEach((pagePivot) => {
      pagePivot.rotation.y = damp(pagePivot.rotation.y, 0, settle, delta);
      pagePivot.rotation.z = damp(pagePivot.rotation.z, 0, settle, delta);
      pagePivot.position.z = damp(pagePivot.position.z, pagePivot.userData.restZ, settle, delta);
      updateFlexiblePage(pagePivot, 0, delta);
    });

    // The ambient bob is eased without waking the loop: it fades out by itself.
    const idle = Math.sin(elapsed * 0.72 + index * 0.8) * 0.012 * slot.focus * ambient;
    rig.motion.position.y = THREE.MathUtils.damp(rig.motion.position.y, idle + (hoverPreview ? 0.035 : 0), 9, delta);
    rig.motion.rotation.x = damp(rig.motion.rotation.x, hoverPreview ? pointer.ndc.y * 0.035 : 0, 10, delta);
    rig.motion.rotation.y = damp(rig.motion.rotation.y, hoverPreview ? -pointer.ndc.x * 0.035 : 0, 10, delta);
  });
}

/* ------------------------------------------------------------------ */
/* Reading: pagination, the leaf window, spreads                       */
/* ------------------------------------------------------------------ */

const spreadLimit = () => (activeBook ? activeBook.leafCount : 0);

function leafBaseFor(rig, spread) {
  return clamp(spread - 2, 0, Math.max(0, rig.leafCount - PRINTED_LEAVES));
}

function printLeaf(rig, pivot, leaf) {
  pivot.userData.leaf = leaf;
  [0, 1].forEach((side) => {
    const index = leaf * 2 + side;
    rig.setLeafPage(pivot, side, rig.flat[index] || null, index, quality.page, pageEpoch);
  });
}

/** Put a recycled leaf straight into its resting pose on one of the piles. */
function settleLeaf(pivot, turned) {
  const order = pivot.userData.order;
  pivot.rotation.y = turned ? -Math.PI + 0.085 + order * 0.014 : -0.038 + order * 0.008;
  pivot.rotation.z = 0;
  pivot.position.z = turned ? pivot.userData.turnedZ : pivot.userData.restZ;
  const flex = pivot.userData.flex;
  flex.curveVelocity = 0;
  flex.twistVelocity = 0;
  updateFlexiblePage(pivot, 0.012, 0, true);
}

/**
 * Only four leaves carry print. As the reader moves through a longer book the
 * leaf at the bottom of one pile is quietly moved under the other pile and
 * printed with the pages that are about to come into view.
 */
// A recycled leaf lies hidden under a pile, so its print can wait for a quiet
// moment instead of holding up the click that turned the page.
let deferredLeaf = null;

function printDeferredLeaf() {
  const job = deferredLeaf;
  if (!job) return;
  deferredLeaf = null;
  if (job.rig.leaves.includes(job.pivot) && bookRigs.includes(job.rig)) printLeaf(job.rig, job.pivot, job.leaf);
}

function deferLeafPrint(rig, pivot, leaf) {
  printDeferredLeaf();
  deferredLeaf = { rig, pivot, leaf };
  whenIdle(printDeferredLeaf, 260);
}

// While a book flies in from the shelf it is shut and its pages cannot be
// seen, so printing them (tens of milliseconds a leaf, plus the upload) waits
// for its arrival and then goes one leaf per quiet moment. Opening the book,
// or turning to a page, prints whatever is still owed at once.
const leafQueue = [];
let leafQueueHandle = 0;

function flushLeafQueue() {
  while (leafQueue.length) {
    const { rig, pivot, leaf } = leafQueue.shift();
    if (rig.leaves.includes(pivot) && bookRigs.includes(rig)) printLeaf(rig, pivot, leaf);
  }
}

function drainLeafQueue() {
  leafQueueHandle = 0;
  const job = leafQueue.shift();
  if (!job) return;
  if (job.rig.leaves.includes(job.pivot) && bookRigs.includes(job.rig)) printLeaf(job.rig, job.pivot, job.leaf);
  shadowHold = Math.max(shadowHold, 1);
  requestFrame();
  if (leafQueue.length) leafQueueHandle = whenIdle(drainLeafQueue, 400);
}

/** Queue the whole leaf window of `rig` for printing (see above). */
function queueLeafWindow(rig) {
  leafQueue.length = 0;
  rig.leafBase = leafBaseFor(rig, currentSpread);
  rig.assignLeafSlots();
  for (let order = 0; order < PRINTED_LEAVES; order += 1) {
    leafQueue.push({ rig, pivot: rig.leaves[order], leaf: rig.leafBase + order });
  }
}

function startLeafQueue() {
  if (leafQueue.length && !leafQueueHandle) leafQueueHandle = whenIdle(drainLeafQueue, 400);
}

function syncLeafWindow(rig, force = false) {
  // Anything still owed is printed before the leaves move.
  flushLeafQueue();
  const base = leafBaseFor(rig, currentSpread);
  const shift = base - rig.leafBase;
  if (!force && shift === 0) return;
  rig.leafBase = base;
  printDeferredLeaf();

  if (!force && shift === 1) {
    const [pivot] = rig.leaves.splice(0, 1);
    rig.leaves.splice(PRINTED_LEAVES - 1, 0, pivot);
    rig.assignLeafSlots();
    settleLeaf(pivot, false);
    deferLeafPrint(rig, pivot, base + PRINTED_LEAVES - 1);
  } else if (!force && shift === -1) {
    const [pivot] = rig.leaves.splice(PRINTED_LEAVES - 1, 1);
    rig.leaves.unshift(pivot);
    rig.assignLeafSlots();
    settleLeaf(pivot, true);
    deferLeafPrint(rig, pivot, base);
  } else {
    rig.assignLeafSlots();
    for (let order = 0; order < PRINTED_LEAVES; order += 1) {
      printLeaf(rig, rig.leaves[order], base + order);
    }
  }
}

function paginateActive() {
  const rig = activeBook;
  if (!rig) return;
  const started = performance.now();
  rig.flat = paginate(rig.data);
  paginateCost = performance.now() - started;
  perf.mark("paginate", paginateCost);
  rig.leafCount = Math.max(1, Math.ceil(rig.flat.length / 2));
  currentSpread = clamp(currentSpread, 0, rig.leafCount);
  if (mode === "opening") queueLeafWindow(rig);
  else syncLeafWindow(rig, true);
  perf.mark("pages", performance.now() - started);
  emitPageState(false);
  emit("onPagination", rig.flat);
  shadowHold = 3;
  requestFrame();
}

function preparePages() {
  const rig = activeBook;
  if (!rig) return;
  rig.pageMotif = rig.data.front.motif.key;
  paginateActive();
  // `onFontsArrived` measures and prints again when the faces land.
  ensureFonts(pageFontRuns(rig.data));
}

/**
 * Reprint the pages after an edit. Typing into an open book is shown in the
 * same frame while pagination is quick, and at a steady rhythm when the book
 * is long; a closed book, or an edit that only tints the pages, waits for a
 * pause instead.
 */
function refreshPagesAfterEdit(typing) {
  if (typing && readingOpen) {
    if (paginateCost < 6) schedulePageRefresh(0);
    // Keep a pending refresh: it must not be pushed back by every keystroke.
    else if (!pageRefreshTimer) schedulePageRefresh(clamp(paginateCost * 3, 50, 240));
    return;
  }
  schedulePageRefresh(readingOpen ? 160 : 380);
}

function schedulePageRefresh(delay = 120) {
  clearTimeout(pageRefreshTimer);
  if (delay <= 0) {
    pageRefreshTimer = 0;
    if (activeBook) preparePages();
    return;
  }
  pageRefreshTimer = setTimeout(() => {
    pageRefreshTimer = 0;
    if (activeBook) preparePages();
  }, delay);
}

/** Pages edited while the book was shut are printed before it opens. */
function flushPageRefresh() {
  if (!pageRefreshTimer) return;
  clearTimeout(pageRefreshTimer);
  pageRefreshTimer = 0;
  if (activeBook) preparePages();
}

function pageState() {
  const rig = activeBook;
  const flat = rig?.flat || [];
  const leftIndex = currentSpread * 2 - 1;
  const rightIndex = currentSpread * 2;
  return {
    open: readingOpen,
    locked: mode !== "detail" || !readingOpen,
    spread: currentSpread,
    spreads: spreadLimit() + 1,
    pages: flat.length,
    leftIndex: leftIndex >= 0 && leftIndex < flat.length ? leftIndex : -1,
    rightIndex: rightIndex < flat.length ? rightIndex : -1,
    left: flat[leftIndex] || null,
    right: flat[rightIndex] || null
  };
}

function emitPageState(shouldAnnounce = false) {
  const state = pageState();
  emit("onPageState", state);
  if (shouldAnnounce && activeBook && readingOpen) {
    const label = state.right?.label || state.left?.label || t("End of the book");
    announce(t("Spread {n} of {count}: {label}.", { n: state.spread + 1, count: state.spreads, label }));
  }
}

function setReadingOpen(open, shouldAnnounce = true) {
  if (mode !== "detail" || readingOpen === open) return;
  cancelPageDrag();
  flushLeafQueue();
  if (open) flushPageRefresh();
  readingOpen = open;
  audio.playCue(readingOpen ? "open" : "close");
  if (!readingOpen) {
    currentSpread = 0;
    syncLeafWindow(activeBook);
  }
  canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  emitPageState(false);
  pointerDirty = true;
  kickRibbon(readingOpen ? -0.9 : 0.6);

  if (shouldAnnounce && activeBook) {
    announce(readingOpen
      ? t("{title} opened. Drag a page or use the arrow keys to read.", { title: activeBook.data.title })
      : t("{title} closed.", { title: activeBook.data.title }));
  }
  requestFrame();
}

function turnPage(direction) {
  if (mode !== "detail" || !readingOpen) return;
  const nextSpread = clamp(currentSpread + direction, 0, spreadLimit());
  if (nextSpread === currentSpread) return;
  currentSpread = nextSpread;
  syncLeafWindow(activeBook);
  audio.playCue("page", { rate: direction > 0 ? 1 : 0.93 });
  kickRibbon(direction * -0.35);
  emitPageState(true);
  requestFrame();
}

/** Open the book at the spread that shows a given physical page. */
function goToPage(pageIndex) {
  if (mode !== "detail" || !activeBook) return;
  flushPageRefresh();
  const spread = clamp(Math.ceil(pageIndex / 2), 0, spreadLimit());
  if (!readingOpen) {
    readingOpen = true;
    audio.playCue("open");
  } else if (spread !== currentSpread) {
    audio.playCue("page");
  }
  cancelPageDrag();
  currentSpread = spread;
  syncLeafWindow(activeBook);
  canvas.classList.remove("has-closed-book-hover");
  emitPageState(false);
  requestFrame();
}

function updatePaginatedBook(rig, delta, openAmount = 1) {
  const amount = clamp(openAmount, 0, 1);
  const speed = reducedMotion ? 1000 : 10.5;
  const hovering = mode === "detail" && !readingOpen && detailBookHovered && !reducedMotion;
  // A banded book does not crack open under the pointer: the band tugs instead.
  const hoverCrack = hovering && !rig.hasBand ? -0.16 : 0;
  const coverTarget = amount > 0
    ? (-Math.PI + 0.055) * amount
    : hoverCrack;
  const localSpread = currentSpread - rig.leafBase;

  if (mode !== "detail" || reducedMotion || pageDrag.active) {
    // Under the hand, and in transit, the cover simply follows.
    rig.frontPivot.rotation.y = damp(rig.frontPivot.rotation.y, coverTarget, speed, delta);
    coverSpring.velocity = 0;
  } else {
    coverSpring.value = rig.frontPivot.rotation.y;
    if (coverSpring.value !== coverTarget || coverSpring.velocity !== 0) {
      if (stepSpring(coverSpring, coverTarget, 132, 15.5, delta)) motion = true;
      // The board cannot pass through the block, nor fold back on the spine.
      if (coverSpring.value > 0 || coverSpring.value < -Math.PI + 0.012) {
        coverSpring.value = clamp(coverSpring.value, -Math.PI + 0.012, 0);
        coverSpring.velocity = 0;
      }
      rig.frontPivot.rotation.y = coverSpring.value;
    }
  }
  // The band slips off the fore-edge as the cover is opened, and back on.
  const bandOpen = coverTarget < -0.02 || rig.frontPivot.rotation.y < -0.02;
  if (rig.updateBand(reducedMotion ? 1 : delta, { open: bandOpen, tug: hovering })) motion = true;

  rig.leaves.forEach((pagePivot, leafOrder) => {
    let pageTarget = 0;
    let positionTarget = pagePivot.userData.restZ;
    let pageTwistTarget = 0;
    let dragCurveBoost = 0;
    let flexTwistTarget = 0;

    if (leafOrder < PRINTED_LEAVES) {
      const isTurned = leafOrder < localSpread;
      const unturnedTarget = -0.038 + leafOrder * 0.008;
      const turnedTarget = -Math.PI + 0.085 + leafOrder * 0.014;
      pageTarget = isTurned ? turnedTarget : unturnedTarget;
      positionTarget = isTurned
        ? pagePivot.userData.turnedZ
        : pagePivot.userData.restZ;

      if (pageDrag.active && pageDrag.direction !== 0) {
        const dragLeafOrder = pageDrag.direction > 0
          ? localSpread
          : localSpread - 1;
        if (leafOrder === dragLeafOrder) {
          const dragProgress = smoothstep(pageDrag.progress);
          const dragEnvelope = Math.sin(Math.PI * dragProgress);
          const speedResponse = clamp(Math.abs(pageDrag.progressVelocity) / 5.5, 0, 1);
          const signedSpeed = clamp(pageDrag.progressVelocity / 5.5, -1, 1);
          pageTarget = pageDrag.direction > 0
            ? lerp(unturnedTarget, turnedTarget, dragProgress)
            : lerp(turnedTarget, unturnedTarget, dragProgress);
          positionTarget = pageDrag.direction > 0
            ? lerp(pagePivot.userData.restZ, pagePivot.userData.turnedZ, dragProgress)
            : lerp(pagePivot.userData.turnedZ, pagePivot.userData.restZ, dragProgress);
          pageTwistTarget = pageDrag.direction
            * dragEnvelope
            * (0.014 + pageDrag.verticalBias * 0.026);
          dragCurveBoost = dragEnvelope * (0.032 + speedResponse * 0.064);
          flexTwistTarget = dragEnvelope * (
            pageDrag.verticalBias * 0.08
            + signedSpeed * pageDrag.direction * 0.03
          );
        }
      }

      pagePivot.position.z = damp(
        pagePivot.position.z,
        pagePivot.userData.restZ
          + (positionTarget - pagePivot.userData.restZ) * amount,
        speed,
        delta
      );
    } else {
      pageTarget = -0.006 + (leafOrder - PRINTED_LEAVES) * 0.003;
      pagePivot.position.z = damp(
        pagePivot.position.z,
        pagePivot.userData.restZ,
        speed,
        delta
      );
    }

    pagePivot.rotation.y = damp(pagePivot.rotation.y, pageTarget * amount, speed, delta);
    pagePivot.rotation.z = damp(pagePivot.rotation.z, pageTwistTarget * amount, speed, delta);
    const turnProgress = clamp(Math.abs(pagePivot.rotation.y) / Math.PI, 0, 1);
    const curveTarget = amount > 0
      ? amount * (0.011 + Math.sin(Math.PI * turnProgress) * 0.078 + dragCurveBoost)
      : 0;
    updateFlexiblePage(pagePivot, curveTarget, delta, false, flexTwistTarget * amount);
  });
}

function applyPageReleaseImpulse(turnDirection) {
  if (!activeBook || turnDirection === 0) return;
  const localSpread = currentSpread - activeBook.leafBase;
  const pagePivot = activeBook.leaves[turnDirection > 0 ? localSpread : localSpread - 1];
  const flex = pagePivot?.userData.flex;
  if (!flex) return;

  const speedResponse = clamp(Math.abs(pageDrag.progressVelocity) / 5.5, 0.12, 1);
  flex.curveVelocity = clamp(flex.curveVelocity + speedResponse * 0.46, -1.8, 1.8);
  flex.twistVelocity = clamp(
    flex.twistVelocity
      + pageDrag.verticalBias * 0.38
      + clamp(pageDrag.progressVelocity / 5.5, -1, 1) * turnDirection * 0.14,
    -1.6,
    1.6
  );
}

/* ------------------------------------------------------------------ */
/* Hover, click, wheel                                                 */
/* ------------------------------------------------------------------ */

function bookIndexAtPointer() {
  raycaster.setFromCamera(pointer.ndc, camera);
  const hits = raycaster.intersectObjects(hitTargets, false);
  return hits.length ? hitTargets.indexOf(hits[0].object) : -1;
}

function setHovered(index) {
  if (hoveredIndex === index) return;
  hoveredIndex = index;
  canvas.classList.toggle("has-book-hover", index >= 0);
  if (index >= 0 && books[index]) {
    pointerLabelIndex.textContent = index === selectedIndex ? t("Open in the atelier") : t("Volume {n}", { n: pad(index + 1) });
    pointerLabelTitle.textContent = books[index].title;
    pointerLabel.setAttribute("aria-hidden", "false");
  } else {
    pointerLabel.setAttribute("aria-hidden", "true");
  }
  requestFrame();
}

function onCanvasClick(event) {
  if (mode === "detail" && !readingOpen && event.button === 0) {
    if (!detailPress.allowClick) return;
    detailPress.allowClick = false;
    setPointerFromEvent(event);
    if (!activeBookAtPointer()) return;
    event.preventDefault();
    setReadingOpen(true);
    return;
  }
  if (mode !== "hero" || event.button !== 0) return;
  setPointerFromEvent(event);
  const clickedBookIndex = bookIndexAtPointer();
  if (clickedBookIndex < 0) return;
  event.preventDefault();
  if (clickedBookIndex !== selectedIndex) {
    selectIndex(clickedBookIndex, canvas);
    return;
  }
  openDetail(canvas);
}

function onWheel(event) {
  if (mode !== "hero" || !books.length) return;
  if (event.target instanceof Element && event.target.closest("[data-scroll]")) return;
  event.preventDefault();
  audio.unlock();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  targetPosition = clamp(
    targetPosition + clamp(delta * 0.0022, -0.72, 0.72),
    -0.3,
    books.length - 0.7
  );
  wheelIdle = 0.14;
  requestFrame();
}

/* ------------------------------------------------------------------ */
/* Shelf <-> detail                                                    */
/* ------------------------------------------------------------------ */

function openDetail(origin = null) {
  if (mode !== "hero" || selectedIndex < 0 || !bookRigs[selectedIndex]) return;
  audio.playCue("select");
  mode = "opening";
  transitionTime = 0;
  readingOpen = false;
  detailBookHovered = false;
  currentSpread = 0;
  resetDetailPress();
  focusReturnTarget = origin instanceof HTMLElement && origin !== canvas ? origin : null;
  activeBook = bookRigs[selectedIndex];
  activeBook.contactShadow.visible = false;
  activeBook.root.visible = true;
  activeBook.opacity = 1;
  activeBook.fadeMaterials.forEach((material) => { material.opacity = 1; });
  activeBook.leafBase = 0;
  if (!activeBook.painted) paintRig(activeBook);
  // The boards are sharpened to studio resolution once the book has arrived
  // (board by board, see finishOpening): painting them now would stall the
  // flight from the shelf.
  if (activeBook.setResolution(quality.detail, { defer: true })) draftRigs.add(activeBook);
  activeBook.setLeafShadows(quality.leafShadows);
  preparePages();
  experience.classList.add("mode-detail", "is-opening");
  pointerLabel.setAttribute("aria-hidden", "true");
  setHovered(-1);
  emit("onMode", mode, activeBook.data);
  // The studio panel has its final width once it is shown.
  configureResponsiveTargets();

  activeBook.root.updateWorldMatrix(true, true);
  activeBook.root.matrixWorld.decompose(
    openingBookPosition,
    openingBookQuaternion,
    openingBookScale
  );
  openingCameraPosition.copy(camera.position);
  openingCameraTarget.copy(transitionCameraTarget);
  openingShelfPosition.copy(shelfStage.position);
  openingMotionPosition.copy(activeBook.motion.position);
  openingMotionQuaternion.copy(activeBook.motion.quaternion);
  openingViewOffsetX = currentViewOffsetX;
  scene.add(activeBook.root);
  activeBook.root.position.copy(openingBookPosition);
  activeBook.root.quaternion.copy(openingBookQuaternion);
  activeBook.root.scale.copy(openingBookScale);
  applyDetailViewOffset();
  controls.enabled = false;
  announce(t("{title} taken to the atelier.", { title: activeBook.data.title }));

  if (reducedMotion) {
    finishOpening();
  }
  requestFrame();
}

function finishOpening() {
  if (!activeBook) return;
  applyOpeningPose(1);
  mode = "detail";
  transitionTime = 1;
  controls.target.copy(inspectCameraTarget);
  controls.enabled = true;
  controls.enableDamping = !reducedMotion;
  controls.update();
  experience.classList.remove("is-opening");
  emit("onMode", mode, activeBook.data);
  emitPageState(false);
  coverSpring.velocity = 0;
  kickRibbon(0.8);
  if (draftRigs.size) scheduleSettle(0);
  startLeafQueue();
  prewarmVariants();
  if (pendingView) {
    const view = pendingView;
    pendingView = null;
    focusView(view);
  }
}

function closeDetail() {
  if (mode !== "detail") return;
  audio.playCue(readingOpen ? "close" : "select", {
    gain: readingOpen ? 1 : 0.72
  });
  // Leaves not yet printed stay as they are: the next visit prints afresh.
  leafQueue.length = 0;
  cancelPageDrag();
  resetDetailPress();
  clearTimeout(pageRefreshTimer);
  pageRefreshTimer = 0;
  viewTween.active = false;
  pendingView = null;
  mode = "closing";
  transitionTime = 0;
  readingOpen = false;
  detailBookHovered = false;
  currentSpread = 0;
  syncLeafWindow(activeBook);
  canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  controls.enabled = false;
  closingBookStartPosition.copy(activeBook.root.position);
  closingBookStartQuaternion.copy(activeBook.root.quaternion);
  closingBookStartScale.copy(activeBook.root.scale);
  closingMotionPosition.copy(activeBook.motion.position);
  closingMotionQuaternion.copy(activeBook.motion.quaternion);
  closingCameraPosition.copy(camera.position);
  closingCameraTarget.copy(controls.target);
  closingShelfPosition.copy(shelfStage.position);
  closingViewOffsetX = currentViewOffsetX;
  transitionCameraTarget.copy(closingCameraTarget);
  experience.classList.remove("is-opening");
  alignShelfToSelection();
  closingBookPosition.set(
    0,
    shelfBoardTop + activeBook.base.height * 0.5 + 0.15,
    0.37
  );
  bookRigs.forEach((rig, index) => {
    if (rig !== activeBook && rig.root.parent === shelfStage) {
      snapRigToShelfSlot(rig, index);
    }
  });
  experience.classList.remove("mode-detail");
  emit("onMode", mode, activeBook.data);
  emitPageState(false);
  announce(t("Returning {title} to the shelf.", { title: activeBook.data.title }));
  if (reducedMotion) {
    finishClosing();
  }
  requestFrame();
}

function finishClosing() {
  if (!activeBook) return;
  applyClosingPose(1);
  shelfStage.attach(activeBook.root);
  const index = bookRigs.indexOf(activeBook);
  snapRigToShelfSlot(activeBook, index);
  activeBook.contactShadow.visible = true;
  activeBook.clearLeaves();
  activeBook.setLeafShadows(false);
  activeBook.swayRibbon(0);
  activeBook.setGlint(0);
  ribbonSway.value = 0;
  ribbonSway.velocity = 0;
  glintTime = 1;
  activeBook.motion.scale.setScalar(1);
  activeBook.setResolution(quality.shelf);
  controls.target.copy(shelfCameraTarget);
  mode = "hero";
  transitionTime = 0;
  const book = activeBook.data;
  activeBook = null;
  emit("onMode", mode, book);
  scheduleWarmup();
  announce(t("{title} returned to the shelf.", { title: book.title }));
  requestAnimationFrame(() => focusReturnTarget?.focus?.({ preventScroll: true }));
}

/* ------------------------------------------------------------------ */
/* Inspection views                                                    */
/* ------------------------------------------------------------------ */

// Camera stations around the book, as offsets from the default inspection
// view: `turn` swings around the book, `tilt` raises (-) or lowers (+) the eye.
const VIEWS = {
  front: { turn: 0, tilt: 0, zoom: 1 },
  spine: { turn: -1.74, tilt: 0, zoom: 0.94 },
  back: { turn: Math.PI - 0.42, tilt: 0, zoom: 1 },
  details: { turn: 1.02, tilt: -0.36, zoom: 1.06 },
  pages: { turn: -0.2, tilt: -0.1, zoom: 1.08 }
};

function focusView(name) {
  const view = VIEWS[name] || VIEWS.front;
  if (mode !== "detail") {
    pendingView = mode === "opening" ? name : null;
    return;
  }
  const home = new THREE.Spherical().setFromVector3(
    scratchVector.copy(inspectCameraPosition).sub(inspectCameraTarget)
  );
  viewTween.from.setFromVector3(scratchVector.copy(camera.position).sub(controls.target));
  viewTween.fromTarget.copy(controls.target);
  viewTween.to.set(
    clamp(home.radius * view.zoom, controls.minDistance, controls.maxDistance),
    clamp(home.phi + view.tilt, controls.minPolarAngle + 0.02, controls.maxPolarAngle - 0.02),
    home.theta + view.turn
  );
  // Travel the short way round.
  const turn = viewTween.to.theta - viewTween.from.theta;
  viewTween.to.theta = viewTween.from.theta + Math.atan2(Math.sin(turn), Math.cos(turn));
  viewTween.time = 0;
  viewTween.active = true;
  if (reducedMotion) viewTween.time = 1;
  requestFrame();
}

function updateViewTween(delta) {
  if (!viewTween.active) return;
  viewTween.time = Math.min(1, viewTween.time + delta / viewTween.duration);
  const eased = smootherstep(viewTween.time);
  viewTween.current.set(
    lerp(viewTween.from.radius, viewTween.to.radius, eased),
    lerp(viewTween.from.phi, viewTween.to.phi, eased),
    lerp(viewTween.from.theta, viewTween.to.theta, eased)
  );
  controls.target.lerpVectors(viewTween.fromTarget, inspectCameraTarget, eased);
  camera.position.setFromSpherical(viewTween.current).add(controls.target);
  camera.lookAt(controls.target);
  if (viewTween.time >= 1) viewTween.active = false;
}

function resetInspectionView() {
  if (mode !== "detail") return;
  focusView("front");
  announce(t("View reset."));
}

/* ------------------------------------------------------------------ */
/* Frame loop                                                          */
/* ------------------------------------------------------------------ */

function frame(time) {
  rafId = 0;
  const frameStarted = performance.now();
  const frameGap = time - lastTime;
  const delta = Math.min(frameGap / 1000, 0.05);
  lastTime = time;
  motion = false;
  cameraMotion = false;

  const idleFor = frameStarted - lastActivity;
  ambient = reducedMotion ? 0 : clamp((AMBIENT_MS - idleFor) / AMBIENT_FADE_MS, 0, 1);
  ambientClock += delta * ambient;

  flushRepaints();
  if (pointerDirty) updateHover();
  updateShelfLayout(delta, ambientClock);
  updateLeaving(delta);
  updateTransition(delta);
  updateDust();
  const themeIsMoving = updateTheme(delta);

  if (mode === "detail") {
    if (pageDrag.active) {
      pageDrag.progressVelocity = damp(pageDrag.progressVelocity, 0, 9, delta);
    }
    if (viewTween.active) {
      updateViewTween(delta);
      cameraMotion = true;
    } else if (controls.update()) {
      cameraMotion = true;
    }
    updatePaginatedBook(activeBook, delta, getDetailOpenAmount());
    updateRebind(delta);
    updateRibbon(delta);
    updateGlint(delta);
  }

  const shelfMoving = Math.abs(position - targetPosition) > 0.0005 || wheelIdle > 0;
  const active = motion
    || cameraMotion
    || mode === "opening"
    || mode === "closing"
    || shelfMoving
    || themeIsMoving
    || viewTween.active
    || pageDrag.active
    || rebindTime < 1
    || glintTime < 1
    || leavingRigs.length > 0
    || lazyPaintPending
    || pendingRepaints.size > 0;
  if (active) activeUntil = frameStarted + 160;
  const busy = frameStarted < activeUntil;
  const keepGoing = !suspended && (busy || ambient > 0);

  // Ambient-only frames are drawn at a gentle rate; the last frame before
  // sleeping is always drawn, at full resolution.
  const due = active || wakeRender || !keepGoing || frameStarted - lastRenderAt >= AMBIENT_FRAME_MS;
  if (due) {
    wakeRender = false;
    applyRenderScale(busy && keepGoing ? motionScale : 1);
    if (motion || !keepGoing || (ambient > 0 && mode === "hero")) shadowHold = Math.max(shadowHold, 2);
    renderFrame();
    lastRenderAt = frameStarted;
    perf.frame(frameGap, performance.now() - frameStarted, perf.enabled && [
      motion ? "m" : "", cameraMotion ? "c" : "", shelfMoving ? "s" : "", themeIsMoving ? "t" : "",
      lazyPaintPending ? "l" : "", active ? "" : "-", renderScale < 1 ? renderScale : ""
    ].join(""));
    watchFrameBudget(frameGap, active, frameStarted);
  }

  // Something inside the frame may already have asked for the next one.
  if (keepGoing && !rafId) rafId = requestAnimationFrame(frame);
}

function updateLeaving(delta) {
  for (let index = leavingRigs.length - 1; index >= 0; index -= 1) {
    const rig = leavingRigs[index];
    rig.leaving = Math.min(1, rig.leaving + delta / LEAVE_SECONDS);
    const lift = ease.outCubic(rig.leaving);
    const fade = 1 - ease.smooth(Math.max(0, rig.leaving * 1.25 - 0.25));
    rig.root.position.y = rig.leaveFrom + lift * 0.42;
    rig.root.rotation.z -= delta * 0.22;
    rig.opacity = fade;
    rig.fadeMaterials.forEach((material) => { material.opacity = fade; });
    rig.contactShadow.material.opacity = fade * 0.24;
    motion = true;
    if (rig.leaving >= 1) {
      leavingRigs.splice(index, 1);
      rig.dispose();
    }
  }
}

/** Set the ribbon swinging; `strength` is an angular kick. */
function kickRibbon(strength) {
  if (reducedMotion) return;
  ribbonSway.velocity += strength;
  requestFrame();
}

function updateRibbon(delta) {
  if (!activeBook || (ribbonSway.value === 0 && ribbonSway.velocity === 0)) return;
  if (stepSpring(ribbonSway, 0, 58, 6.4, delta, 0.002)) motion = true;
  activeBook.swayRibbon(ribbonSway.value);
}

function startGlint() {
  if (reducedMotion || mode !== "detail") return;
  glintTime = 0;
  requestFrame();
}

function updateGlint(delta) {
  if (glintTime >= 1 || !activeBook) return;
  glintTime = Math.min(1, glintTime + delta / GLINT_SECONDS);
  activeBook.setGlint(ease.pulse(glintTime));
}

function updateRebind(delta) {
  if (rebindTime >= 1 || !activeBook) return;
  rebindTime = Math.min(1, rebindTime + delta / 0.62);
  motion = true;
  const swing = Math.sin(Math.PI * rebindTime) * (1 - rebindTime);
  activeBook.motion.rotation.y = swing * 0.42;
  activeBook.motion.scale.setScalar(1 - Math.sin(Math.PI * rebindTime) * 0.035);
  if (rebindTime >= 1) {
    activeBook.motion.rotation.y = 0;
    activeBook.motion.scale.setScalar(1);
  }
}

/* ------------------------------------------------------------------ */
/* Rendering and post-processing                                       */
/* ------------------------------------------------------------------ */

function buildComposer() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // At two device pixels per CSS pixel, 2x multisampling is already clean.
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: basePixelRatio >= 1.75 ? 2 : 4
  });
  composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  occlusionPass = null;

  if (quality.post) {
    // Ambient occlusion: the gutter, the hinge, books against the shelf.
    // It is soft by nature, so it is computed at reduced resolution.
    const scale = quality.aoScale;
    const occlusion = new GTAOPass(scene, camera, Math.ceil(size.x * scale), Math.ceil(size.y * scale));
    occlusion.setSize = (width, height) => {
      GTAOPass.prototype.setSize.call(occlusion, Math.ceil(width * scale), Math.ceil(height * scale));
    };
    occlusion.updateGtaoMaterial({ radius: 0.2, distanceExponent: 1.4, thickness: 1.2, scale: 1.05, samples: 12 });
    occlusion.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6 * Math.max(scale, 0.66), rings: 2, samples: 12 });
    occlusion.blendIntensity = 0.82;
    composer.addPass(occlusion);
    occlusionPass = occlusion;
  }

  // Bloom and depth of field were tried here and removed: both soften the
  // printed page, and a book you are typesetting has to stay sharp.
  composer.addPass(new OutputPass());
}

function renderFrame() {
  // Shadows are redrawn only when something that casts one has moved.
  renderer.shadowMap.needsUpdate = shadowHold > 0;
  if (shadowHold > 0) shadowHold -= 1;
  if (composer) composer.render();
  else renderer.render(scene, camera);
  if (perf.syncGpu) renderer.getContext().finish();
}

/* ----- sharing: a still of the view, and a turntable of the open book ----- */

let lastCapture = null;

/** The view as it is now, as a PNG. */
function capturePicture() {
  if (!renderer) return Promise.resolve(null);
  shadowHold = Math.max(shadowHold, 1);
  renderFrame();
  // The drawing buffer is read in the same task as the render.
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * The open book turning once round its own axis: `frames` square RGBA
 * frames of `size` pixels, cropped round the book. Rendered in one go and
 * then put back exactly as it was.
 */
function captureTurntable({ frames = 36, size = 360 } = {}) {
  if (!activeBook || mode !== "detail" || !renderer) return [];
  const rig = activeBook;
  const start = rig.root.rotation.y;
  // Crop to the sphere the book sweeps as it turns (an open book is wide).
  const pivot = new THREE.Vector3();
  rig.root.getWorldPosition(pivot);
  const box = new THREE.Box3();
  rig.motion.updateWorldMatrix(true, true);
  rig.motion.traverseVisible((object) => {
    if (object.isMesh && !object.layers.isEnabled(HIT_LAYER)) box.expandByObject(object, false);
  });
  // Turning about the vertical axis, the book sweeps a circle in plan.
  let swing = 0;
  [box.min.x, box.max.x].forEach((x) => [box.min.z, box.max.z].forEach((z) => {
    swing = Math.max(swing, Math.hypot(x - pivot.x, z - pivot.z));
  }));
  const reach = Math.max(swing, (box.max.y - box.min.y) * 0.5);
  const centre = new THREE.Vector3(pivot.x, (box.min.y + box.max.y) * 0.5, pivot.z);
  // Step the camera back along its line of sight until that sphere fits.
  const savedCamera = camera.position.clone();
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const fit = (reach * 1.12) / Math.tan(Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect))) + swing * 2;
  const distance = camera.position.distanceTo(centre);
  if (fit > distance) {
    camera.position.copy(centre).addScaledVector(forward, -fit);
    camera.updateMatrixWorld();
  }
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(reach);
  const edge = centre.clone().add(right).project(camera);
  // The near side of the turning book is closer to the camera, so larger.
  const away = camera.position.distanceTo(centre);
  const nearer = away / Math.max(0.1, away - swing);
  centre.project(camera);
  const radius = Math.abs(edge.x - centre.x) * 0.5 * canvas.width * nearer;
  const side = clamp(radius * 2.08, 64, Math.min(canvas.width, canvas.height));
  lastCapture = { reach, swing, fit, distance, radius, side, fov: camera.fov, zoom: camera.zoom, height: canvas.height };
  const sx = clamp((centre.x + 1) * 0.5 * canvas.width - side / 2, 0, canvas.width - side);
  const sy = clamp((1 - centre.y) * 0.5 * canvas.height - side / 2, 0, canvas.height - side);
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  const result = [];
  for (let index = 0; index < frames; index += 1) {
    rig.root.rotation.y = start + (index / frames) * Math.PI * 2;
    shadowHold = 1;
    renderFrame();
    ctx.drawImage(canvas, sx, sy, side, side, 0, 0, size, size);
    result.push(ctx.getImageData(0, 0, size, size));
  }
  rig.root.rotation.y = start;
  camera.position.copy(savedCamera);
  camera.updateMatrixWorld();
  shadowHold = 3;
  requestFrame();
  return result;
}

/** Resolution used for this frame: reduced while moving if the machine needs it. */
function applyRenderScale(next) {
  if (next === renderScale || !renderer) return;
  renderScale = next;
  const ratio = basePixelRatio * renderScale;
  renderer.setPixelRatio(ratio);
  if (composer) {
    composer.setPixelRatio(ratio);
    composer.setSize(viewWidth, viewHeight);
  }
}

/**
 * Keep motion smooth. While frames run long the moving resolution steps down;
 * after a spell of smooth frames it is tried one step higher again. Only when
 * the lowest step is still too slow does the whole tier drop.
 */
function watchFrameBudget(gap, active, now) {
  const budget = frameBudget;
  if (!active || gap <= 0 || gap > 120) {
    budget.streak = 0;
    return;
  }
  budget.ema = budget.streak ? lerp(budget.ema, gap, 0.12) : gap;
  budget.streak += 1;
  if (budget.cooldown > 0) {
    budget.cooldown -= 1;
    return;
  }
  const step = RENDER_SCALES.indexOf(motionScale);
  if (budget.ema > SLOW_FRAME_MS && budget.streak > 14) {
    if (step < RENDER_SCALES.length - 1) {
      motionScale = RENDER_SCALES[step + 1];
      budget.cooldown = 24;
      budget.streak = 0;
      budget.upAt = now + budget.retry;
      budget.retry = Math.min(budget.retry * 2, 60000);
    } else if (budget.ema > 30) {
      budget.slow += 1;
      if (budget.slow > 150) {
        budget.slow = 0;
        stepQualityDown();
      }
    }
  } else if (budget.ema < FAST_FRAME_MS && step > 0 && now > budget.upAt && budget.streak > 90) {
    motionScale = RENDER_SCALES[step - 1];
    budget.cooldown = 24;
    budget.streak = 0;
  } else if (budget.ema < SLOW_FRAME_MS) {
    budget.slow = 0;
  }
}

function stepQualityDown() {
  const next = lowerQuality(quality);
  if (!next) return;
  quality = next;
  motionScale = 1;
  frameBudget.retry = 4000;
  if (composer) {
    composer.dispose();
    composer = null;
    occlusionPass = null;
  }
  if (roomLights.key) {
    roomLights.key.shadow.mapSize.set(quality.shadow, quality.shadow);
    roomLights.key.shadow.map?.dispose();
    roomLights.key.shadow.map = null;
  }
  activeBook?.setLeafShadows(quality.leafShadows);
  // The canvas was created without its own antialiasing when it started on
  // the composed tier, so keep a composer (without occlusion) for that.
  if (!contextAntialias) {
    try {
      buildComposer();
    } catch (error) {
      composer = null;
    }
  }
  shadowHold = 4;
  resize();
}

function resize() {
  viewWidth = window.innerWidth;
  viewHeight = window.innerHeight;
  configureResponsiveTargets();
  renderer.setSize(viewWidth, viewHeight, false);
  basePixelRatio = Math.min(window.devicePixelRatio || 1, viewWidth < 820 ? 1.5 : quality.pixelRatio);
  const pixelRatio = basePixelRatio * renderScale;
  renderer.setPixelRatio(pixelRatio);
  if (composer) {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(viewWidth, viewHeight);
  }
  shadowHold = 4;
  camera.aspect = viewWidth / viewHeight;
  camera.updateProjectionMatrix();

  if (mode === "hero") {
    camera.position.copy(shelfCameraPosition);
    transitionCameraTarget.copy(shelfCameraTarget);
    currentViewOffsetX = 0;
    applyDetailViewOffset();
    camera.lookAt(shelfCameraTarget);
  } else if (mode === "detail" && activeBook) {
    activeBook.root.position.copy(inspectPosition);
    activeBook.root.scale.setScalar(getInspectScale());
    transitionCameraTarget.copy(inspectCameraTarget);
    currentViewOffsetX = detailViewOffsetX;
    applyDetailViewOffset();
    viewTween.active = false;
    camera.position.copy(inspectCameraPosition);
    controls.target.copy(inspectCameraTarget);
    controls.update();
  }
  requestFrame();
}

const isTyping = (target) => target instanceof HTMLElement && (
  target.isContentEditable
  || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
  || target.getAttribute("role") === "combobox"
);

function onKeyDown(event) {
  if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
  const typing = isTyping(event.target);

  if (event.key === "Escape" && mode === "detail") {
    event.preventDefault();
    if (typing) event.target.blur();
    else closeDetail();
    return;
  }
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

  if (mode === "detail" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    if (event.target instanceof HTMLElement && event.target.closest("[role='tablist'], [role='radiogroup']")) return;
    event.preventDefault();
    turnPage(event.key === "ArrowLeft" ? -1 : 1);
    return;
  }

  if (mode !== "hero") return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    navigate(-1, document.activeElement);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    navigate(1, document.activeElement);
  }
}

function onVisibilityChange() {
  suspended = document.hidden;
  audio.handleVisibility(suspended);
  if (!suspended) {
    lastTime = performance.now();
    requestFrame();
    scheduleWarmup();
  } else {
    settlePageDrag(true);
    resetDetailPress();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }
}

function onReducedMotionChange(event) {
  cancelPageDrag();
  resetDetailPress();
  reducedMotion = event.matches;
  controls.enableDamping = !reducedMotion;
  if (reducedMotion) {
    position = targetPosition;
  }
  requestFrame();
}

function showFallback(message) {
  loading.hidden = true;
  experience.classList.remove("webgl-ready");
  fallbackStatus.textContent = message;
  emit("onFallback", message);
}

function handleContextLost(event) {
  event.preventDefault();
  cancelPageDrag();
  resetDetailPress();
  suspended = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  showFallback(t("The 3D view paused after losing its graphics context. Your books are saved; reload to continue."));
}

function disposeExperience() {
  suspended = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  audio.dispose();
  controls?.dispose();
  bookRigs.forEach((rig) => rig.dispose());
  environmentTarget?.dispose();
  composer?.dispose();
  renderer?.dispose();
}

/* ------------------------------------------------------------------ */
/* Start-up and public API                                             */
/* ------------------------------------------------------------------ */

async function initialize(options) {
  audio = options.audio || audio;
  hooks = options.hooks || {};
  books = options.books;

  const woodTexturePromise = woodTextureImage.decode().then(() => true, () => false);

  try {
    // With post-processing the scene is multisampled in the composer's own
    // target, so the canvas does not need a second set of samples.
    contextAntialias = !quality.post;
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: contextAntialias,
      alpha: true,
      powerPreference: "high-performance"
    });
  } catch (error) {
    showFallback(t("WebGL is unavailable in this browser, so the 3D atelier cannot open here."));
    return false;
  }

  bindRenderer(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xe9dfcb, 0.027);
  // Looking past the back wall shows the room colour, never a black void.
  scene.background = scene.fog.color;
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  environmentTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.72;
  pmremGenerator.dispose();

  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  shelfStage = new THREE.Group();
  shelfStage.name = "continuous-shelf-stage";
  scene.add(shelfStage);

  configureResponsiveTargets();
  camera.position.copy(shelfCameraPosition);
  camera.lookAt(shelfCameraTarget);

  controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.075;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 2.4;
  controls.maxDistance = 7.6;
  controls.minPolarAngle = Math.PI * 0.2;
  controls.maxPolarAngle = Math.PI * 0.78;
  controls.target.copy(shelfCameraTarget);
  controls.addEventListener("change", requestFrame);
  controls.addEventListener("end", requestFrame);
  controls.addEventListener("start", () => { viewTween.active = false; });

  RectAreaLightUniformsLib.init();
  addRoom();
  addLights();
  addDust();

  bookRigs = books.map((book) => {
    const rig = buildRig(book);
    shelfStage.add(rig.root);
    return rig;
  });
  rebuildHitTargets();
  selectedIndex = -2;
  updateSelection(0, false);
  bookRigs.forEach((rig, index) => {
    snapRigToShelfSlot(rig, index);
    // Only the books in view are painted now; the rest wait their turn.
    if (rig.opacity > 0.004) paintRig(rig);
  });
  resize();

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("pointerdown", onDetailBookPointerDown, { capture: true });
  canvas.addEventListener("pointermove", onDetailBookPointerMove, { capture: true });
  canvas.addEventListener("pointerup", onDetailBookPointerEnd, { capture: true });
  canvas.addEventListener("pointercancel", onDetailBookPointerEnd, { capture: true });
  canvas.addEventListener("lostpointercapture", onDetailBookPointerEnd, { capture: true });
  canvas.addEventListener("pointerdown", onPagePointerDown, { capture: true });
  canvas.addEventListener("pointermove", onPagePointerMove, { capture: true });
  canvas.addEventListener("pointerup", onPagePointerEnd, { capture: true });
  canvas.addEventListener("pointercancel", onPagePointerEnd, { capture: true });
  canvas.addEventListener("lostpointercapture", onPagePointerEnd, { capture: true });
  window.addEventListener("pointerup", onWindowPagePointerEnd);
  window.addEventListener("pointercancel", onWindowPagePointerEnd);
  experience.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("webglcontextlost", handleContextLost);
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  reducedMotionQuery.addEventListener("change", onReducedMotionChange);
  onFontsLoaded(onFontsArrived);
  experience.addEventListener("pointerdown", onFirstAudioPointer, true);
  window.addEventListener("keydown", onFirstAudioKeydown, true);
  window.addEventListener("beforeunload", disposeExperience, { once: true });

  if (quality.post) {
    try {
      buildComposer();
      resize();
    } catch (error) {
      composer = null;
    }
  }
  perf.setInfo(() => ({
    tier: quality.name,
    post: Boolean(occlusionPass),
    pixelRatio: Math.round(renderer.getPixelRatio() * 100) / 100,
    scale: motionScale,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    textures: renderer.info.memory.textures,
    geometries: renderer.info.memory.geometries,
    programs: renderer.info.programs?.length || 0
  }));
  renderFrame();
  // Keep the loading mark up until the covers in view have their real type
  // (briefly: a slow font must not hold the room back), then fade it away.
  const coverRuns = bookRigs.filter((rig) => rig.painted).flatMap((rig) => coverFontRuns(rig.data));
  Promise.race([
    ensureFonts(coverRuns),
    new Promise((resolve) => setTimeout(resolve, 1400))
  ]).then(() => {
    bookRigs.forEach((rig) => { if (rig.painted) rig.repaint(); });
    shadowHold = 3;
    if (!suspended) renderFrame();
    experience.classList.add("webgl-ready");
    loading.classList.add("is-done");
    scheduleWarmup();
    setTimeout(() => { loading.hidden = true; }, reducedMotion ? 0 : 560);
    requestFrame();
  });

  woodTexturePromise.then((ready) => {
    if (!ready || suspended || !renderer) return;
    woodTextureReady = true;
    applyWoodTexture();
  });
  return true;
}

export const engine = {
  init: initialize,
  capturePicture,
  captureTurntable,
  setRoom,
  get room() { return { ...room }; },
  addBook,
  removeBook,
  refreshBook,
  select: selectIndex,
  navigate,
  openDetail,
  closeDetail,
  setReadingOpen,
  toggleReading: () => setReadingOpen(!readingOpen),
  turnPage,
  goToPage,
  focusView,
  resetView: resetInspectionView,
  resize,
  showFallback,
  get mode() { return mode; },
  get quality() { return quality.name; },
  get selectedIndex() { return selectedIndex; },
  get activeBookId() { return activeBook?.data.id || null; },
  get pageState() { return pageState(); },
  get pagination() { return activeBook?.flat || []; },
  /** Development hooks, used by the benchmark and by tests. */
  debug: {
    get renderScale() { return renderScale; },
    get motionScale() { return motionScale; },
    set motionScale(value) { if (RENDER_SCALES.includes(value)) motionScale = value; },
    stepQualityDown: () => stepQualityDown(),
    get activeRig() { return activeBook; },
    get rigs() { return bookRigs; },
    get scene() { return scene; },
    get renderer() { return renderer; },
    get lastCapture() { return lastCapture; },
    get camera() { return camera; }
  }
};

/* ------------------------------------------------------------------ */
/* Carried over from The Complete Shelf                                */
/* ------------------------------------------------------------------ */

function updateFlexiblePage(
  pagePivot,
  targetCurve,
  delta,
  immediate = false,
  targetTwist = 0
) {
  const flex = pagePivot.userData.flex;
  if (!flex) return;
  const settleImmediately = immediate || reducedMotion;
  const step = Math.min(delta, 0.033);
  let nextCurve = targetCurve;
  let nextTwist = targetTwist;

  if (settleImmediately) {
    flex.curveVelocity = 0;
    flex.twistVelocity = 0;
  } else {
    const curveAcceleration = (
      (targetCurve - flex.curve) * 178
      - flex.curveVelocity * 19
    );
    const twistAcceleration = (
      (targetTwist - flex.twist) * 210
      - flex.twistVelocity * 21
    );
    flex.curveVelocity = clamp(
      flex.curveVelocity + curveAcceleration * step,
      -1.8,
      1.8
    );
    flex.twistVelocity = clamp(
      flex.twistVelocity + twistAcceleration * step,
      -1.6,
      1.6
    );
    nextCurve = clamp(
      flex.curve + flex.curveVelocity * step,
      -0.025,
      0.19
    );
    nextTwist = clamp(
      flex.twist + flex.twistVelocity * step,
      -0.12,
      0.12
    );

    if (
      Math.abs(targetCurve - nextCurve) < 0.00002
      && Math.abs(flex.curveVelocity) < 0.0008
    ) {
      nextCurve = targetCurve;
      flex.curveVelocity = 0;
    }
    if (
      Math.abs(targetTwist - nextTwist) < 0.00002
      && Math.abs(flex.twistVelocity) < 0.0008
    ) {
      nextTwist = targetTwist;
      flex.twistVelocity = 0;
    }
  }

  if (
    !settleImmediately
    && Math.abs(nextCurve - flex.curve) < 0.00001
    && Math.abs(targetCurve - nextCurve) < 0.00001
    && Math.abs(nextTwist - flex.twist) < 0.00001
    && Math.abs(targetTwist - nextTwist) < 0.00001
  ) return;

  flex.curve = nextCurve;
  flex.twist = nextTwist;
  if (!settleImmediately) motion = true;
  flex.surfaces.forEach((surface) => {
    const { position, base, direction, geometry } = surface;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const offset = vertex * 3;
      const x = base[offset];
      const y = base[offset + 1];
      const u = x + 0.5;
      const mappedU = direction > 0 ? u : 1 - u;
      const arch = Math.sin(Math.PI * mappedU);
      const freeEdgeLift = mappedU * mappedU * 0.16;
      const shape = arch * 0.84 + freeEdgeLift;
      const diagonalTwist = (
        nextTwist
        * y
        * Math.pow(mappedU, 1.35)
      );
      const softRipple = (
        nextTwist
        * Math.sin(mappedU * Math.PI * 2)
        * (1 - Math.min(1, Math.abs(y) * 1.65))
        * 0.09
      );
      const z = (
        nextCurve * shape * (1 + y * 0.14)
        + diagonalTwist
        + softRipple
      ) * direction;
      position.setXYZ(vertex, x, y, z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  });
}

function setPointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.clientX = event.clientX;
  pointer.clientY = event.clientY;
  pointer.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointerDirty = true;
}

function updateHover() {
  pointerDirty = false;
  if (mode === "detail" && activeBook) {
    setHovered(-1);
    if (readingOpen) {
      detailBookHovered = false;
      canvas.classList.remove("has-closed-book-hover");
      canvas.classList.toggle(
        "has-page-hover",
        pageDrag.active
          || Boolean(pageSurfaceAtPointer())
          || Boolean(coverSurfaceAtPointer())
      );
    } else {
      detailBookHovered = Boolean(coverSurfaceAtPointer());
      canvas.classList.remove("has-page-hover");
      canvas.classList.toggle(
        "has-closed-book-hover",
        detailBookHovered
      );
    }
    return;
  }
  detailBookHovered = false;
  canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  if (mode !== "hero") {
    setHovered(-1);
    return;
  }
  setHovered(bookIndexAtPointer());
}

function activeBookAtPointer() {
  if (mode !== "detail" || !activeBook) return false;
  activeBook.root.updateWorldMatrix(true, true);
  raycaster.setFromCamera(pointer.ndc, camera);
  return raycaster.intersectObject(activeBook.hit, false).length > 0;
}

function pageSurfaceAtPointer() {
  if (mode !== "detail" || !activeBook || !readingOpen) return null;
  activeBook.root.updateWorldMatrix(true, true);
  raycaster.setFromCamera(pointer.ndc, camera);
  const hits = raycaster.intersectObjects(
    activeBook.pageGestureSurfaces,
    false
  );
  return hits.length ? hits[0].object : null;
}

function coverSurfaceAtPointer() {
  if (
    mode !== "detail"
    || !activeBook
    || currentSpread !== 0
  ) return null;
  activeBook.root.updateWorldMatrix(true, true);
  raycaster.setFromCamera(pointer.ndc, camera);
  const hits = raycaster.intersectObject(activeBook.frontCover, false);
  return hits.length ? hits[0].object : null;
}

function resetPageDrag() {
  const capturedPointerId = pageDrag.pointerId;
  pageDrag.active = false;
  pageDrag.pointerId = null;
  pageDrag.progress = 0;
  pageDrag.peakProgress = 0;
  pageDrag.committed = false;
  pageDrag.progressVelocity = 0;
  pageDrag.verticalBias = 0;
  pageDrag.lastProgress = 0;
  pageDrag.lastTime = 0;
  pageDrag.direction = 0;
  pageDrag.kind = null;
  canvas.classList.remove("is-page-dragging");
  controls.enabled = mode === "detail";
  if (
    capturedPointerId !== null
    && canvas.hasPointerCapture?.(capturedPointerId)
  ) {
    canvas.releasePointerCapture(capturedPointerId);
  }
}

function settlePageDrag(commitLatchedGesture = false) {
  if (!pageDrag.active) return false;
  const turnDirection = pageDrag.direction;
  const shouldCloseCover = commitLatchedGesture
    && pageDrag.kind === "cover-close"
    && pageDrag.committed;
  const shouldOpenCover = commitLatchedGesture
    && pageDrag.kind === "cover-open"
    && pageDrag.committed;
  const shouldTurnPage = commitLatchedGesture
    && pageDrag.kind === "page"
    && pageDrag.committed
    && turnDirection !== 0;
  if (shouldTurnPage) {
    applyPageReleaseImpulse(turnDirection);
  }
  resetPageDrag();
  if (shouldCloseCover) {
    setReadingOpen(false);
  } else if (shouldOpenCover) {
    setReadingOpen(true);
  } else if (shouldTurnPage) {
    turnPage(turnDirection);
  } else {
    requestFrame();
  }
  return shouldCloseCover || shouldOpenCover || shouldTurnPage;
}

function cancelPageDrag() {
  settlePageDrag(false);
}

function resetDetailPress() {
  detailPress.active = false;
  detailPress.pointerId = null;
  detailPress.moved = false;
  detailPress.allowClick = false;
}

function onDetailBookPointerDown(event) {
  if (
    mode !== "detail"
    || readingOpen
    || event.button !== 0
    || event.isPrimary === false
  ) return;

  setPointerFromEvent(event);
  detailPress.allowClick = false;
  if (!activeBookAtPointer()) return;
  detailPress.active = true;
  detailPress.pointerId = event.pointerId;
  detailPress.startX = event.clientX;
  detailPress.startY = event.clientY;
  detailPress.moved = false;
}

function onDetailBookPointerMove(event) {
  if (!detailPress.active || event.pointerId !== detailPress.pointerId) return;
  if (
    Math.hypot(
      event.clientX - detailPress.startX,
      event.clientY - detailPress.startY
    ) > 16
  ) {
    detailPress.moved = true;
  }
}

function onDetailBookPointerEnd(event) {
  if (!detailPress.active || event.pointerId !== detailPress.pointerId) return;
  detailPress.allowClick = event.type === "pointerup" && !detailPress.moved;
  detailPress.active = false;
  detailPress.pointerId = null;
}

function onPagePointerDown(event) {
  if (
    mode !== "detail"
    || !activeBook
    || event.button !== 0
    || event.isPrimary === false
  ) return;

  setPointerFromEvent(event);
  const coverSurface = coverSurfaceAtPointer();
  const pageSurface = readingOpen ? pageSurfaceAtPointer() : null;
  if (!coverSurface && !pageSurface) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  // Lifting a leaf (or the cover) can show the one beneath: make sure it is printed.
  flushLeafQueue();
  printDeferredLeaf();
  pageDrag.active = true;
  pageDrag.pointerId = event.pointerId;
  pageDrag.startX = event.clientX;
  pageDrag.startY = event.clientY;
  pageDrag.progress = 0;
  pageDrag.peakProgress = 0;
  pageDrag.committed = false;
  pageDrag.progressVelocity = 0;
  pageDrag.verticalBias = 0;
  pageDrag.lastProgress = 0;
  pageDrag.lastTime = event.timeStamp || performance.now();
  pageDrag.direction = 0;
  pageDrag.kind = coverSurface
    ? readingOpen
      ? "cover-close"
      : "cover-open"
    : "page";
  controls.enabled = false;
  canvas.classList.add("has-page-hover", "is-page-dragging");
  canvas.setPointerCapture?.(event.pointerId);
  requestFrame();
}

function updatePageDragMotion(event, deltaY) {
  const eventTime = event.timeStamp || performance.now();
  const elapsed = clamp(
    (eventTime - pageDrag.lastTime) / 1000,
    0.008,
    0.08
  );
  const instantVelocity = clamp(
    (pageDrag.progress - pageDrag.lastProgress) / elapsed,
    -8,
    8
  );
  pageDrag.progressVelocity = lerp(
    pageDrag.progressVelocity,
    instantVelocity,
    0.42
  );
  pageDrag.verticalBias = lerp(
    pageDrag.verticalBias,
    clamp(deltaY / 180, -1, 1),
    0.36
  );
  pageDrag.lastProgress = pageDrag.progress;
  pageDrag.lastTime = eventTime;
}

function updatePageDragFromEvent(event) {
  setPointerFromEvent(event);

  const deltaX = event.clientX - pageDrag.startX;
  const deltaY = event.clientY - pageDrag.startY;
  const horizontalDistance = Math.abs(deltaX);

  if (
    pageDrag.kind === "cover-open"
    || pageDrag.kind === "cover-close"
  ) {
    const openingCover = pageDrag.kind === "cover-open";
    const signedDistance = openingCover ? -deltaX : deltaX;
    const commitProgress = openingCover
      ? COVER_OPEN_COMMIT_PROGRESS
      : COVER_CLOSE_COMMIT_PROGRESS;
    pageDrag.direction = 0;
    pageDrag.progress = (
      horizontalDistance >= 3
      && horizontalDistance >= Math.abs(deltaY) * 0.72
    )
      ? clamp(Math.max(0, signedDistance) / 140, 0, 1)
      : 0;
    pageDrag.peakProgress = Math.max(
      pageDrag.peakProgress,
      pageDrag.progress
    );
    if (pageDrag.peakProgress >= commitProgress) {
      pageDrag.committed = true;
    }
    updatePageDragMotion(event, deltaY);
    return;
  }

  if (
    horizontalDistance < 3
    || horizontalDistance < Math.abs(deltaY) * 0.72
  ) {
    pageDrag.progress = 0;
  } else {
    if (pageDrag.direction === 0 && horizontalDistance >= 6) {
      const direction = deltaX < 0 ? 1 : -1;
      const directionAvailable = direction > 0
        ? currentSpread < spreadLimit()
        : currentSpread > 0;
      pageDrag.direction = directionAvailable ? direction : 0;
    }

    const signedDistance = pageDrag.direction > 0 ? -deltaX : deltaX;
    pageDrag.progress = pageDrag.direction !== 0
      ? clamp(Math.max(0, signedDistance) / 150, 0, 1)
      : 0;
    pageDrag.peakProgress = Math.max(
      pageDrag.peakProgress,
      pageDrag.progress
    );
    if (pageDrag.peakProgress >= PAGE_TURN_COMMIT_PROGRESS) {
      pageDrag.committed = true;
    }
  }
  updatePageDragMotion(event, deltaY);
}

function onPagePointerMove(event) {
  if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  updatePageDragFromEvent(event);

  requestFrame();
}

function onPagePointerEnd(event) {
  if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
  if (event.type === "pointerup") updatePageDragFromEvent(event);
  const dragKind = pageDrag.kind;
  const releaseDistance = Math.hypot(
    event.clientX - pageDrag.startX,
    event.clientY - pageDrag.startY
  );
  const shouldClickOpen = event.type === "pointerup"
    && dragKind === "cover-open"
    && !pageDrag.committed
    && releaseDistance <= 12;
  if (pageDrag.committed) {
    settlePageDrag(true);
  } else if (shouldClickOpen) {
    resetPageDrag();
    detailPress.allowClick = false;
    setReadingOpen(true);
  } else {
    if (dragKind === "cover-open") {
      detailPress.allowClick = false;
    }
    cancelPageDrag();
  }
}

function onWindowPagePointerEnd(event) {
  if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
  if (event.type === "pointerup") updatePageDragFromEvent(event);
  settlePageDrag(true);
}

function positionPointerLabel() {
  pointerLabel.style.left = `${pointer.clientX}px`;
  pointerLabel.style.top = `${pointer.clientY}px`;
}

function onPointerMove(event) {
  setPointerFromEvent(event);
  positionPointerLabel();
  requestFrame();
}

function onPointerLeave() {
  pointer.ndc.set(3, 3);
  pointerDirty = false;
  detailBookHovered = false;
  setHovered(-1);
  if (!pageDrag.active) {
    canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  }
}

function applyOpeningPose(progress) {
  const eased = smootherstep(clamp(progress, 0, 1));
  const shelfClearEased = smootherstep(clamp(progress / 0.68, 0, 1));
  inspectBookScale.setScalar(getInspectScale());
  shelfStage.position.lerpVectors(
    openingShelfPosition,
    inspectShelfPosition,
    shelfClearEased
  );
  activeBook.root.position.lerpVectors(
    openingBookPosition,
    inspectPosition,
    eased
  );
  activeBook.root.quaternion.slerpQuaternions(
    openingBookQuaternion,
    inspectBookQuaternion,
    eased
  );
  activeBook.root.scale.lerpVectors(
    openingBookScale,
    inspectBookScale,
    eased
  );
  activeBook.motion.position.lerpVectors(
    openingMotionPosition,
    restingMotionPosition,
    eased
  );
  activeBook.motion.quaternion.slerpQuaternions(
    openingMotionQuaternion,
    restingMotionQuaternion,
    eased
  );
  camera.position.lerpVectors(
    openingCameraPosition,
    inspectCameraPosition,
    eased
  );
  transitionCameraTarget.lerpVectors(
    openingCameraTarget,
    inspectCameraTarget,
    eased
  );
  currentViewOffsetX = lerp(openingViewOffsetX, detailViewOffsetX, eased);
  applyDetailViewOffset();
  camera.lookAt(transitionCameraTarget);
}

function applyClosingPose(progress) {
  const eased = smootherstep(clamp(progress, 0, 1));
  const shelfReturnEased = smootherstep(
    clamp((progress - 0.24) / 0.76, 0, 1)
  );
  shelfStage.position.lerpVectors(
    closingShelfPosition,
    shelfRestPosition,
    shelfReturnEased
  );
  activeBook.root.position.lerpVectors(
    closingBookStartPosition,
    closingBookPosition,
    eased
  );
  activeBook.root.quaternion.slerpQuaternions(
    closingBookStartQuaternion,
    closingBookQuaternion,
    eased
  );
  activeBook.root.scale.lerpVectors(
    closingBookStartScale,
    closingBookScale,
    eased
  );
  activeBook.motion.position.lerpVectors(
    closingMotionPosition,
    restingMotionPosition,
    eased
  );
  activeBook.motion.quaternion.slerpQuaternions(
    closingMotionQuaternion,
    restingMotionQuaternion,
    eased
  );
  camera.position.lerpVectors(
    closingCameraPosition,
    shelfCameraPosition,
    eased
  );
  transitionCameraTarget.lerpVectors(
    closingCameraTarget,
    shelfCameraTarget,
    eased
  );
  currentViewOffsetX = lerp(closingViewOffsetX, 0, eased);
  applyDetailViewOffset();
  camera.lookAt(transitionCameraTarget);
}

function applyDetailViewOffset() {
  if (Math.abs(currentViewOffsetX) < 0.5) {
    camera.clearViewOffset();
    return;
  }
  camera.setViewOffset(
    viewWidth,
    viewHeight,
    currentViewOffsetX,
    0,
    viewWidth,
    viewHeight
  );
}

function createWoodTexture(repeatX, repeatY, rotation = 0) {
  if (!woodTextureReady) return null;
  const texture = new THREE.Texture(woodTextureImage);
  texture.name = "editorial-walnut";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.center.set(0.5, 0.5);
  texture.rotation = rotation;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function applyWoodTexture() {
  if (!woodTextureReady || !renderer) return;
  // A painted or steel shelf keeps the grain aside until wood comes back.
  const plain = Boolean(SHELF_STYLES[room.shelf]?.plain);

  const woodMap = createWoodTexture(7, 1.65, Math.PI * 0.5);
  const darkWoodMap = woodMap?.clone() || null;

  if (darkWoodMap) {
    darkWoodMap.name = "editorial-walnut-dark";
    darkWoodMap.needsUpdate = true;
  }

  shared.walnut.userData.woodMap = woodMap;
  shared.walnutDark.userData.woodMap = darkWoodMap;
  shared.walnut.map = plain ? null : woodMap;
  shared.walnut.needsUpdate = true;
  shared.walnutDark.map = plain ? null : darkWoodMap;
  shared.walnutDark.needsUpdate = true;
  requestFrame();
}

function addRoom() {
  const floor = createMesh(shared.plane, new THREE.MeshStandardMaterial({
    color: 0xd8c8aa,
    roughness: 0.92,
    metalness: 0
  }), "paper-floor", false, true);
  floor.scale.set(30, 20, 1);
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = -0.02;
  scene.add(floor);

  const back = createMesh(shared.plane, new THREE.MeshStandardMaterial({
    color: 0xe9dfcb,
    roughness: 1,
    metalness: 0
  }), "paper-backdrop", false, true);
  back.scale.set(28, 14, 1);
  back.position.set(0, 5.5, -3.3);
  scene.add(back);

  const shelf = createMesh(shared.box, shared.walnut, "walnut-shelf");
  shelf.scale.set(17, 0.28, 1.08);
  shelf.position.set(0, 0.33, -0.03);
  shelfStage.add(shelf);

  const shelfLip = createMesh(shared.box, shared.walnutDark, "walnut-shelf-lip");
  shelfLip.scale.set(17.05, 0.075, 1.14);
  shelfLip.position.set(0, 0.205, 0.02);
  shelfStage.add(shelfLip);

  const backRail = createMesh(shared.box, shared.walnut, "walnut-back-rail");
  backRail.scale.set(17, 0.17, 0.2);
  backRail.position.set(0, 0.68, -0.52);
  shelfStage.add(backRail);

  [-7.65, 7.65].forEach((x, index) => {
    const upright = createMesh(shared.box, shared.walnutDark, `shelf-upright-${index}`);
    upright.scale.set(0.2, 3.8, 0.72);
    upright.position.set(x, 2.05, -0.28);
    shelfStage.add(upright);
    roomFrame.push(upright);
  });
  roomFrame.push(backRail);

  const shadowStrip = createMesh(shared.plane, new THREE.MeshBasicMaterial({
    color: 0x2f1d13,
    alphaMap: getContactShadowTexture(),
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  }), "shelf-contact-shadow", false, false);
  shadowStrip.scale.set(16, 0.85, 1);
  shadowStrip.rotation.x = -Math.PI * 0.5;
  shadowStrip.position.set(0, 0.49, 0.06);
  shelfStage.add(shadowStrip);

  roomMaterials.floor = floor.material;
  roomMaterials.wall = back.material;
  roomMaterials.shelf = shared.walnut;
  roomMaterials.shelfDark = shared.walnutDark;
  roomMaterials.shadow = shadowStrip.material;
}

function addLights() {
  roomLights.hemisphere = new THREE.HemisphereLight(0xfff8e8, 0x5b4030, 0.56);
  scene.add(roomLights.hemisphere);

  const key = new THREE.DirectionalLight(0xffe8c2, 1.42);
  key.name = "shadow-key";
  key.position.set(-4.6, 7.4, 5.8);
  key.castShadow = true;
  key.shadow.mapSize.set(quality.shadow, quality.shadow);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -1.5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 18;
  key.shadow.bias = -0.00018;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 3.5;
  scene.add(key);
  roomLights.key = key;

  const softKey = new THREE.RectAreaLight(0xffe8c2, 5.4, 4.8, 5.6);
  softKey.name = "cloth-softbox";
  softKey.position.set(-3.2, 5.5, 4.6);
  softKey.lookAt(0, 1.45, 0);
  scene.add(softKey);
  roomLights.softKey = softKey;

  const fill = new THREE.DirectionalLight(0xd8e3e7, 0.3);
  fill.name = "cool-fill";
  fill.position.set(5.5, 3.6, 4.2);
  scene.add(fill);
  roomLights.fill = fill;

  const rim = new THREE.RectAreaLight(0xd5a45e, 3.45, 1.6, 4.8);
  rim.name = "foil-rake";
  rim.position.set(3.8, 3.6, -2.1);
  rim.lookAt(-0.2, 1.5, 0);
  scene.add(rim);
  roomLights.rim = rim;

  const backFill = new THREE.RectAreaLight(0xd8e3e7, 2.7, 3.8, 4.8);
  backFill.name = "back-cover-softbox";
  backFill.position.set(-1.8, 2.9, -4.5);
  backFill.lookAt(-0.1, 1.45, 0);
  scene.add(backFill);
  roomLights.backFill = backFill;

  const spineRake = new THREE.RectAreaLight(0xffe8c2, 1.9, 0.9, 4.6);
  spineRake.name = "spine-rake";
  spineRake.position.set(-4.6, 3.2, 1.1);
  spineRake.lookAt(-0.55, 1.5, 0);
  scene.add(spineRake);
  roomLights.spineRake = spineRake;

  const pageRake = new THREE.RectAreaLight(0xfff7e7, 2.15, 1.15, 3.8);
  pageRake.name = "page-edge-rake";
  pageRake.position.set(4.2, 4.8, 3.1);
  pageRake.lookAt(0.65, 1.55, 0);
  scene.add(pageRake);
  roomLights.pageRake = pageRake;
  Object.values(roomLights).forEach((source) => { if (source) source.userData.base = source.intensity; });
  [shared.walnut, shared.walnutDark].forEach((material) => {
    material.userData.baseRoughness = material.roughness;
    material.userData.baseMetalness = material.metalness;
  });
  applyRoomSettings();
}

function addDust() {
  const dustCount = 110;
  const positions = new Float32Array(dustCount * 3);
  const random = seededRandom(20260728);
  for (let index = 0; index < dustCount; index += 1) {
    positions[index * 3] = (random() - 0.5) * 14;
    positions[index * 3 + 1] = 0.7 + random() * 4.7;
    positions[index * 3 + 2] = -1.7 + random() * 4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xc3a97b,
    size: 0.014,
    transparent: true,
    opacity: 0.3,
    depthWrite: false
  });
  const dust = new THREE.Points(geometry, material);
  dust.name = "paper-dust";
  dust.userData.isDust = true;
  scene.add(dust);
  dustPoints = dust;
}

function setThemeColorsImmediately() {
  roomMaterials.floor?.color.copy(themeTargets.floor);
  roomMaterials.wall?.color.copy(themeTargets.wall);
  roomMaterials.shelf?.color.copy(themeTargets.shelf);
  roomMaterials.shelfDark?.color.copy(themeTargets.shelfDark);
  roomMaterials.shadow?.color.copy(themeTargets.shadow);
  scene?.fog?.color.copy(themeTargets.fog);
  roomLights.hemisphere?.color.copy(themeTargets.hemisphere);
  roomLights.hemisphere?.groundColor.copy(themeTargets.hemisphereGround);
  roomLights.key?.color.copy(themeTargets.key);
  roomLights.softKey?.color.copy(themeTargets.key);
  roomLights.fill?.color.copy(themeTargets.fill);
  roomLights.rim?.color.copy(themeTargets.rim);
  roomLights.backFill?.color.copy(themeTargets.fill);
  roomLights.spineRake?.color.copy(themeTargets.key);
  roomLights.pageRake?.color.copy(themeTargets.hemisphere);
  themeMoving = false;
}

function updateTheme(delta) {
  if (!themeMoving) return false;
  const amount = 1 - Math.exp(-delta * 5.5);
  let largestGap = 0;
  const easeColor = (current, target) => {
    if (!current) return;
    const redGap = current.r - target.r;
    const greenGap = current.g - target.g;
    const blueGap = current.b - target.b;
    largestGap = Math.max(
      largestGap,
      redGap * redGap + greenGap * greenGap + blueGap * blueGap
    );
    current.lerp(target, amount);
  };

  easeColor(roomMaterials.floor?.color, themeTargets.floor);
  easeColor(roomMaterials.wall?.color, themeTargets.wall);
  easeColor(roomMaterials.shelf?.color, themeTargets.shelf);
  easeColor(roomMaterials.shelfDark?.color, themeTargets.shelfDark);
  easeColor(roomMaterials.shadow?.color, themeTargets.shadow);
  easeColor(scene?.fog?.color, themeTargets.fog);
  easeColor(roomLights.hemisphere?.color, themeTargets.hemisphere);
  easeColor(roomLights.hemisphere?.groundColor, themeTargets.hemisphereGround);
  easeColor(roomLights.key?.color, themeTargets.key);
  easeColor(roomLights.softKey?.color, themeTargets.key);
  easeColor(roomLights.fill?.color, themeTargets.fill);
  easeColor(roomLights.rim?.color, themeTargets.rim);
  easeColor(roomLights.backFill?.color, themeTargets.fill);
  easeColor(roomLights.spineRake?.color, themeTargets.key);
  easeColor(roomLights.pageRake?.color, themeTargets.hemisphere);

  if (largestGap < 0.0000025) {
    setThemeColorsImmediately();
  }
  return themeMoving;
}

function updateTransition(delta) {
  if (mode === "opening" || mode === "closing") motion = true;
  if (mode === "opening") {
    transitionTime = Math.min(
      1,
      transitionTime + delta / DETAIL_TRANSITION_DURATION
    );
    applyOpeningPose(transitionTime);
    updatePaginatedBook(activeBook, delta, 0);
    if (transitionTime >= 1) finishOpening();
  } else if (mode === "closing") {
    transitionTime = Math.min(
      1,
      transitionTime + delta / SHELF_TRANSITION_DURATION
    );
    applyClosingPose(transitionTime);
    updatePaginatedBook(activeBook, delta, 0);
    if (transitionTime >= 1) finishClosing();
  } else if (mode === "hero") {
    shelfStage.position.y = damp(shelfStage.position.y, 0, 10, delta);
    shelfStage.position.z = damp(shelfStage.position.z, 0, 10, delta);
    camera.position.x = damp(camera.position.x, shelfCameraPosition.x, 8, delta);
    camera.position.y = damp(camera.position.y, shelfCameraPosition.y, 8, delta);
    camera.position.z = damp(camera.position.z, shelfCameraPosition.z, 8, delta);
    transitionCameraTarget.copy(shelfCameraTarget);
    currentViewOffsetX = 0;
    applyDetailViewOffset();
    camera.lookAt(shelfCameraTarget);
  }
}

function updateDust() {
  if (reducedMotion || !dustPoints) return;
  dustPoints.rotation.y = ambientClock * 0.012;
  dustPoints.position.y = Math.sin(ambientClock * 0.17) * 0.025;
}

/** Wake the loop: something changed, or the user did something. */
function requestFrame() {
  lastActivity = performance.now();
  wakeRender = true;
  if (!rafId && !suspended) {
    // After a sleep the first frame must not see a long gap as a slow frame.
    lastTime = lastActivity;
    rafId = requestAnimationFrame(frame);
  }
}

function getDetailOpenAmount() {
  if (pageDrag.active && pageDrag.kind === "cover-open") {
    return smoothstep(pageDrag.progress);
  }
  if (!readingOpen) return 0;
  if (pageDrag.active && pageDrag.kind === "cover-close") {
    return 1 - smoothstep(pageDrag.progress);
  }
  return 1;
}

function onWindowBlur() {
  settlePageDrag(true);
  resetDetailPress();
}

function onFirstAudioPointer(event) {
  if (event.target instanceof Element && event.target.closest("#audio-controls")) return;
  audio.unlock();
  experience.removeEventListener("pointerdown", onFirstAudioPointer, true);
}

function onFirstAudioKeydown() {
  audio.unlock();
  window.removeEventListener("keydown", onFirstAudioKeydown, true);
}
