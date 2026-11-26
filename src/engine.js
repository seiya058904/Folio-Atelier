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
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
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
import { bookPalette, coverFontRuns, createBook } from "./state/schema.js";
import { bindRenderer } from "./textures/gl.js";
import { prefetchBoardGrain } from "./textures/faces.js";
import { forgetMeasurements, pageFontRuns, paginate } from "./textures/pages.js";
import { MATERIAL_LOOK, createWoodMicroMaps, getContactShadowTexture, getMaterialMaps } from "./textures/surface.js";
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
let shadowTick = 0;
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
// One slot per saved volume. Only the volumes around the camera own a rig.
let bookRigs = [];
let hitTargets = [];
let shelfJump = null;
const SHELF_LOAD_RADIUS = 4;
const SHELF_KEEP_RADIUS = 7;
const SHELF_CACHE_SIZE = 2 * SHELF_KEEP_RADIUS + 1;
const compiledPrograms = new Set();
const programOwners = new Set();
let rafId = 0;
let lastTime = performance.now();
let mode = "hero";
let transitionTime = 0;
let position = 0;
let targetPosition = 0;
let selectedIndex = -1;
let hoveredIndex = -1;
let wheelIdle = 0;
// The shelf rides a critically damped spring, so a fling hands its speed on
// and a new target never jerks it (it settles in the time the old easing did).
const shelfSpring = { value: 0, velocity: 0 };
// The pointer near the outer edge of an open page lifts its corner a little,
// as a hand about to turn it would: `side` is 1 (next) or -1 (previous).
const pagePeek = { side: 0, held: 0, amount: 0, tilt: 0 };
const SHELF_STIFFNESS = 219;
const SHELF_DAMPING = 29.6;
let focusReturnTarget = null;
let activeBook = null;
let readingOpen = false;
let detailBookHovered = false;
let currentSpread = 0;
let pointerDirty = false;
let suspended = false;
let graphicsUnavailable = false;
let viewWidth = window.innerWidth;
let viewHeight = window.innerHeight;
let detailViewOffsetX = 0;
let currentViewOffsetX = 0;
// On a narrow screen an open book is twice as wide as the shut one it was
// framed for. As the cover opens the view widens and slides to keep the
// whole spread in sight (0: framed shut, 1: framed open).
let readingFit = 0;
// On phones the studio is a bottom sheet the reader can raise or lower: the
// book is framed in the room left above it (`sheetShare` is its share of the
// screen height; 0.5 is what the inspection view was laid out for).
let sheetShare = 0.5;
let sheetShown = 0.5;
// Reading mode: the workbench withdraws and the open spread fills the screen
// (`readingAmount` eases the framing between the two).
let readingMode = false;
// Photo Studio mode: workbench withdraws, book centers cleanly inside viewfinder.
let photoMode = false;
let photoAmount = 0;
// Ambient occlusion strength; reading mode lightens it so the page stays clean.
const AO_BLEND = 0.82;
let lastCameraMotion = false;
// The view the reader was on before reading, to return to on leaving.
let viewBeforeReading = "front";
// Reading is a visit: leaving it puts back what was there (a shut book is shut again).
let openBeforeReading = false;
let currentViewName = "front";
let readingAmount = 0;
// The framing moves on the camera's own timeline (same length, same curve),
// so the swing and the zoom start and land together, as one motion.
let readingDuration = 0.7;
let quietTimer = 0;
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
const roomMeshes = {
  floor: null,
  wall: null
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
  spanPx: 220,
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
  shelfCameraPosition.set(0, narrow ? 1.82 : 1.92, narrow ? 8.85 : 8.1);
  shelfCameraTarget.set(0, narrow ? 1.18 : 1.55, 0);
  inspectPosition.set(narrow ? 0 : -2.25, narrow ? 2.26 : 1.56, narrow ? 0.15 : 0);
  inspectCameraPosition.set(narrow ? 0 : -0.52, narrow ? 1.66 : 1.78, narrow ? 7.45 : 5.25);
  inspectCameraTarget.copy(inspectPosition);
  // On phones the workbench covers the lower half and the stage bar sits above,
  // so frame the book centered cleanly between stage-bar and reader-bar.
  if (narrow) inspectCameraTarget.y -= 0.96;

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
  if (!activeBook) return 0.77;
  const trimMul = activeBook.trimScale || 1;
  if (viewWidth < 820) return clamp(0.77 / Math.max(1, trimMul * 0.96), 0.62, 0.77);
  const distance = Math.abs(inspectCameraPosition.z - inspectPosition.z);
  const worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const pixelsPerWorld = viewHeight / Math.max(worldHeight, 0.001);
  const estimatedBookWidth = activeBook.base.width * trimMul * pixelsPerWorld * 1.16;
  const estimatedBookHeight = activeBook.base.height * trimMul * pixelsPerWorld * 1.06;
  const safeHeight = Math.max(260, viewHeight - 186);
  const scaleForSafeWidth = (detailSafeWidth * 0.72) / Math.max(estimatedBookWidth, 1);
  const scaleForSafeHeight = safeHeight / Math.max(estimatedBookHeight, 1);
  return clamp(Math.min(scaleForSafeWidth, scaleForSafeHeight), 0.66, 1.32);
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
  tameRoomForNeutral();

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

/*
 * Tone mapping is Khronos PBR Neutral: a cloth renders the colour of its
 * swatch (ACES turned vermilion to coral and halved the chroma of citron).
 * The room was tuned under ACES, which greys out pale warm colours; under
 * Neutral the walls and the lights would keep all their warmth, so their
 * saturation is scaled back to the look they were tuned for.
 */
const TONE_MAPPING = THREE.NeutralToneMapping;
const TONE_EXPOSURE = 0.84;
const ROOM_CHROMA = { surface: 0.55, light: 0.55 };
const tameScratch = { h: 0, s: 0, l: 0 };
function tameRoomForNeutral() {
  const tame = (color, factor) => {
    color.getHSL(tameScratch);
    color.setHSL(tameScratch.h, tameScratch.s * factor, tameScratch.l);
  };
  ["wall", "fog", "floor"].forEach((name) => tame(themeTargets[name], ROOM_CHROMA.surface));
  ["key", "hemisphere", "rim", "fill"].forEach((name) => tame(themeTargets[name], ROOM_CHROMA.light));
}

/*
 * Bespoke procedural Atelier Photography Studio environment for PMREM
 * reflections. Overhead silk scrim, tall vertical key softbox, warm rim strip,
 * cool fill bounce and dark negative-fill flags create crisp dark-to-bright
 * contrast on metallic gold/copper/silver foil, brass hardware and pebbled hide.
 * Rebuilt only when the lighting preset changes (keeps every shader program).
 */
const ENVIRONMENTS = {
  studio: {
    base: "#2d2a26",
    ceiling: "#f8f3ea", ceilingPower: 2.3,
    key: "#fff3df", keyPower: 4.8,
    rim: "#f2c68a", rimPower: 3.6,
    fill: "#d5e4f0", fillPower: 1.9,
    floor: "#5c4635", floorPower: 0.75
  },
  morning: {
    base: "#333942",
    ceiling: "#f7fbff", ceilingPower: 2.6,
    key: "#fff7ec", keyPower: 4.6,
    rim: "#c9e0f5", rimPower: 2.8,
    fill: "#cce2f8", fillPower: 2.9,
    floor: "#695b4e", floorPower: 0.85
  },
  golden: {
    base: "#221a20",
    ceiling: "#f5c694", ceilingPower: 1.8,
    key: "#ffae62", keyPower: 5.6,
    rim: "#ff8c3a", rimPower: 5.2,
    fill: "#6a759c", fillPower: 1.25,
    floor: "#52321e", floorPower: 0.75
  },
  night: {
    base: "#07060a",
    ceiling: "#1b1724", ceilingPower: 0.35,
    key: "#ffbb66", keyPower: 5.2,
    rim: "#ff9b44", rimPower: 2.8,
    fill: "#2a3352", fillPower: 0.55,
    floor: "#24160d", floorPower: 0.32
  }
};
let environmentKey = "";
let pmrem = null;

function createAtelierEnvironmentScene(preset) {
  const envScene = new THREE.Scene();
  const mat = (color, intensity = 1, side = THREE.FrontSide) => new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    side
  });

  // Dark studio enclosure (negative fill gives foil & brass genuine contrast)
  const roomBox = new THREE.Mesh(new THREE.BoxGeometry(20, 14, 20), mat(preset.base, 1, THREE.BackSide));
  roomBox.position.y = 3;
  envScene.add(roomBox);

  // Soft overhead silk scrim diffuser
  const ceilingScrim = new THREE.Mesh(new THREE.PlaneGeometry(11, 8), mat(preset.ceiling, preset.ceilingPower));
  ceilingScrim.position.set(0, 9.6, 0.5);
  ceilingScrim.rotation.x = Math.PI * 0.5;
  envScene.add(ceilingScrim);

  // Tall vertical key softbox (left-front) — sweeps bright specular highlight down spine & cover foil
  const keyBox = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 7.6), mat(preset.key, preset.keyPower));
  keyBox.position.set(-6.5, 4.2, 5.2);
  keyBox.lookAt(0, 1.5, 0);
  envScene.add(keyBox);

  // Focused hot strip inside the key softbox for crisp metal catchlights
  const keyCore = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 5.8), mat(preset.key, preset.keyPower * 1.9));
  keyCore.position.set(-6.2, 4.4, 5.4);
  keyCore.lookAt(0, 1.5, 0);
  envScene.add(keyCore);

  // Opposite cool window fill panel (right-front)
  const fillPanel = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 6.2), mat(preset.fill, preset.fillPower));
  fillPanel.position.set(7.6, 3.6, 3.8);
  fillPanel.lookAt(0, 1.5, 0);
  envScene.add(fillPanel);

  // Narrow raking rim strip (right-rear) — lights raised spine cords & metal corner bevels
  const rimStrip = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 6.8), mat(preset.rim, preset.rimPower));
  rimStrip.position.set(5.4, 4.2, -5.2);
  rimStrip.lookAt(0, 1.5, 0);
  envScene.add(rimStrip);

  // Secondary back-left subtle strip for back-cover metallic grazing reflections
  const backStrip = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5.2), mat(preset.fill, preset.fillPower * 0.85));
  backStrip.position.set(-4.2, 3.4, -6.4);
  backStrip.lookAt(0, 1.5, 0);
  envScene.add(backStrip);

  // Warm timber floor bounce
  const floorBounce = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), mat(preset.floor, preset.floorPower));
  floorBounce.position.set(0, -3.5, 0);
  floorBounce.rotation.x = -Math.PI * 0.5;
  envScene.add(floorBounce);

  return envScene;
}

function buildEnvironment(name) {
  if (!renderer || !scene) return;
  const look = ENVIRONMENTS[name] || ENVIRONMENTS.studio;
  if (environmentKey === name) return;
  environmentKey = name;
  const reflection = createAtelierEnvironmentScene(look);
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(reflection, 0.032);
  reflection.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  });
  environmentTarget?.dispose();
  environmentTarget = target;
  scene.environment = target.texture;
  shadowHold = Math.max(shadowHold, 1);
}

/** Light strengths, shelf surface and frame for the current room. */
function applyRoomSettings() {
  buildEnvironment(room.light);
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
      material.bumpMap = material.userData.woodBump || null;
      material.roughnessMap = material.userData.woodRough || null;
      material.needsUpdate = true;
    } else if (!wantMap && material.map) {
      material.userData.woodMap = material.map;
      material.map = null;
      material.bumpMap = null;
      material.roughnessMap = null;
      material.needsUpdate = true;
    }
    material.roughness = shelf.roughness ?? material.userData.baseRoughness ?? material.roughness;
    material.metalness = shelf.metalness ?? material.userData.baseMetalness ?? material.metalness;
  });
  roomFrame.forEach((mesh) => { mesh.visible = !shelf.frameless; });
  if (lamp) {
    const night = room.light === "night";
    lamp.visible = night;
    lamp.userData.shade.emissiveIntensity = night ? 1.15 : 0;
    if (lamp.userData.pool) lamp.userData.pool.visible = night;
  }
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
  emit("onRoomChange", { ...room });
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
  hitTargets = [];
  bookRigs.forEach((rig, index) => {
    rig.hit.userData.shelfIndex = index;
    hitTargets.push(rig.hit);
  });
}

function rigFor(id) {
  return bookRigs.find((rig) => rig?.data.id === id) || null;
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
// idle time, the resident neighbours do it ahead, nearest first, one small
// step at a time. Distant books retain only their saved specifications.
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
  if (!renderer || suspended || mode !== "hero" || shelfJump) return;
  // Painting a book takes a few tens of milliseconds: only while the shelf is
  // still (an ambient frame may wait, nobody sees it) or when it is overdue.
  const still = position === targetPosition && wheelIdle <= 0;
  const large = books.length > SHELF_CACHE_SIZE;
  if (large && !still) return;
  const roomy = deadline.didTimeout || (still && deadline.timeRemaining() > 2);
  // The book at rest in front is the likeliest to be opened.
  if (still && bookRigs[selectedIndex]) prefetchBoardGrain(bookRigs[selectedIndex].data, quality.detail);
  const near = [];
  bookRigs.forEach((rig, index) => {
    const distance = Math.abs(index - position);
    if (!large || distance <= SHELF_LOAD_RADIUS) near.push([distance, rig]);
  });
  near.sort((a, b) => a[0] - b[0]);
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
      const done = compileQuietly(rig.root).finally(() => {
        if (rig.compiling === done) rig.compiling = null;
        if (large) scheduleWarmup();
      });
      rig.compiling = done;
      if (!large) scheduleWarmup();
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
  let materials;
  try {
    materials = renderer.compile(object, camera, scene);
  } finally {
    renderer.setRenderTarget(previous);
  }
  if (!renderer.extensions.has("KHR_parallel_shader_compile")) return Promise.resolve();
  // Three r165's compileAsync assumes every material stays alive while it
  // polls. Closing the tab or disposing a variant can remove its program.
  return new Promise((resolve) => {
    const check = () => {
      if (graphicsUnavailable) {
        resolve();
        return;
      }
      for (const material of materials) {
        const program = renderer.properties.get(material).currentProgram;
        if (!program || program.isReady()) materials.delete(material);
      }
      if (materials.size) setTimeout(check, 10);
      else resolve();
    };
    check();
  });
}

function compileVisibleScene() {
  const visible = new THREE.Group();
  scene.traverseVisible((object) => {
    if (object.material && object.layers.test(camera.layers)) visible.add(object.clone(false));
  });
  return compileQuietly(visible);
}

/* ----- the first book: compiled before it is made ----- */

// On an empty shelf nothing has been compiled, and the first book used to pay
// for every program it needs (well over a second on ANGLE) in the frame it
// appeared. A stand-in binding is compiled in idle time instead, with its
// studio variants, and kept (unpainted, never drawn) until a real book holds
// the same programs.
let standIn = null;

function prewarmFirstBook() {
  if (standIn || bookRigs.length || !renderer || suspended) return;
  const rig = createBookRig(createBook(), { resolution: quality.shelf, lazy: true });
  standIn = rig;
  const variants = rig.shaderVariants();
  whenIdle(() => {
    if (standIn !== rig || !renderer) return;
    compileQuietly(rig.root).then(() => whenIdle(() => {
      if (standIn === rig && renderer) {
        compileQuietly(variants).then(() => {
          variants.children.forEach((stand) => keepCompiledMaterial(stand.material));
        });
      }
    }, 2000));
  }, 2000);
}

function releaseStandIn() {
  if (!standIn) return;
  const rig = standIn;
  standIn = null;
  // Once the real book has drawn, its own materials hold the programs.
  setTimeout(() => releaseShelfRig(rig), 4000);
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
  // Every covering's normal and roughness maps (about 20 ms of arithmetic
  // each, the first time), one per quiet moment, so choosing one is a copy.
  const kinds = Object.keys(MATERIAL_LOOK);
  const mapsNext = (deadline) => {
    while (kinds.length && (deadline.didTimeout || deadline.timeRemaining() > 24)) {
      getMaterialMaps(kinds.shift());
      if (deadline.didTimeout) break;
    }
    if (kinds.length) whenIdle(mapsNext, 3000);
  };
  whenIdle(mapsNext, 3000);
  const stands = [...activeBook.shaderVariants().children];
  const next = () => {
    if (!stands.length || !renderer || suspended) return;
    const batch = stands.splice(0, 4);
    const group = new THREE.Group();
    batch.forEach((stand) => group.add(stand));
    compileQuietly(group).then(() => {
      batch.forEach((stand) => keepCompiledMaterial(stand.material));
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
      if (rig.painted) rig.repaint({ force: true, fade: rig === activeBook ? swapSeconds(SWAP_ASSET) : 0 });
      if (rig === activeBook) schedulePageRefresh(0);
      requestFrame();
    }
  });
  return rig;
}

function mountShelfRig(book, index) {
  const rig = buildRig(book);
  bookRigs[index] = rig;
  shelfStage.add(rig.root);
  snapRigToShelfSlot(rig, index);
  rig.root.visible = rig.opacity > 0.004;
  return rig;
}

function releaseShelfRig(rig) {
  pendingRepaints.delete(rig);
  draftRigs.delete(rig);
  rig.root.removeFromParent();
  if (rig.compiling) rig.compiling.then(() => rig.dispose(keepCompiledMaterial));
  else rig.dispose(keepCompiledMaterial);
}

function keepCompiledMaterial(material) {
  // Three r165 releases a program with its last material. Keep one owner
  // for each known variant, without retaining the volume's texture data.
  const properties = renderer.properties.get(material);
  const programs = properties.programs;
  if (!programs || ![...programs.values()].some((program) => !compiledPrograms.has(program))) {
    material.dispose();
    return;
  }
  for (const program of programs.values()) compiledPrograms.add(program);
  programOwners.add(material);
  for (const key in material) {
    if (material[key]?.isTexture) material[key] = null;
  }
  material.userData = {};
  delete properties.uniforms;
  delete properties.environment;
  delete properties.envMap;
}

function syncShelfRigs() {
  let changed = false;
  const large = books.length > SHELF_CACHE_SIZE;
  if (large) {
    bookRigs.forEach((rig, index) => {
      if (rig === activeBook || (shelfDrag.active && shelfDrag.index === index)
        || Math.abs(dragSlotIndex(index) - position) <= SHELF_KEEP_RADIUS) return;
      delete bookRigs[index];
      releaseShelfRig(rig);
      if (hoveredIndex === index) setHovered(-1);
      changed = true;
    });
  }
  // During a reorder, one volume can borrow an adjacent slot.
  const radius = SHELF_LOAD_RADIUS + Number(shelfDrag.active);
  const first = large ? Math.max(0, Math.ceil(position - radius)) : 0;
  const last = large ? Math.min(books.length - 1, Math.floor(position + radius)) : books.length - 1;
  for (let index = first; index <= last; index += 1) {
    if (bookRigs[index]) continue;
    mountShelfRig(books[index], index);
    changed = true;
  }
  if (changed) {
    rebuildHitTargets();
    scheduleWarmup();
  }
}

function addBook(book, index = bookRigs.length, { from = null } = {}) {
  releaseStandIn();
  bookRigs.splice(index, 0, undefined);
  delete bookRigs[index];
  if (books.length > SHELF_CACHE_SIZE && Math.abs(index - position) > SHELF_LOAD_RADIUS) {
    rebuildHitTargets();
    requestFrame();
    return null;
  }
  const rig = mountShelfRig(book, index);
  rebuildHitTargets();
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
    rig.setOpacity(0);
  }
  requestFrame();
  return rig;
}

function removeBook(id) {
  const index = books.findIndex((book) => book.id === id);
  if (index < 0) return;
  const [rig] = bookRigs.splice(index, 1);
  if (rig) {
    if (reducedMotion || mode !== "hero" || !rig.root.visible) {
      releaseShelfRig(rig);
    } else {
      pendingRepaints.delete(rig);
      draftRigs.delete(rig);
      rig.hit.visible = false;
      // It lifts off the shelf and fades; its neighbours close the gap.
      rig.leaving = 0;
      rig.leaveFrom = rig.root.position.y;
      leavingRigs.push(rig);
    }
  }
  rebuildHitTargets();
  hoveredIndex = -1;
  if (!bookRigs.length) whenIdle(prewarmFirstBook, 3000);
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
      // Anything but a stream of edits (a drag, typing) fades in on the book in hand.
      const fade = rig === activeBook && !entry.draft ? swapSeconds(wholeBook ? SWAP_WHOLE : SWAP_CLICK) : 0;
      if (rig.repaint({ draft, hidden, fade })) draftRigs.add(rig);
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

// Cross-fade lengths (seconds) for a board repainted on the book in hand: a
// whole new binding, a single click, the sharp board after its draft, fonts
// or pictures arriving. None with reduced motion, nor in the middle of a flight.
const SWAP_WHOLE = 0.36;
const SWAP_CLICK = 0.22;
const SWAP_SHARPEN = 0.26;
const SWAP_ASSET = 0.3;
const swapSeconds = (seconds) => (reducedMotion || mode !== "detail" ? 0 : seconds);

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
  // Not while the book flies, nor during the rebinding swing of a preset:
  // a full-size board is tens of milliseconds, and a frame lost in motion is
  // seen where one lost at rest is not. The draft carries the swing.
  if (mode === "opening" || mode === "closing" || rebindTime < 1) {
    settleTimer = setTimeout(settleDrafts, rebindTime < 1 ? 60 : 120);
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
    const more = rig.repaint({ budget: 1, hidden, fade: rig === activeBook ? swapSeconds(SWAP_SHARPEN) : 0 });
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
  const distance = targetPosition - position;
  // A distant search result or marker falls outside both visible windows.
  // Bring in its neighbouring volumes from the same direction, without
  // constructing every intervening binding during the glide.
  if (books.length > SHELF_CACHE_SIZE && Math.abs(distance) > 2 * SHELF_LOAD_RADIUS) {
    position = reducedMotion ? targetPosition : targetPosition - Math.sign(distance) * 2;
    shelfSpring.velocity = 0;
    setHovered(-1);
    syncShelfRigs();
    const job = compileVisibleScene();
    shelfJump = job;
    // A second jump can unmount these volumes before linking finishes.
    bookRigs.forEach((rig) => {
      if (!rig.root.visible) return;
      const done = rig.compiling ? Promise.all([rig.compiling, job]) : job;
      rig.compiling = done;
      done.then(() => { if (rig.compiling === done) rig.compiling = null; });
    });
    job.then(() => {
      if (shelfJump !== job) return;
      shelfJump = null;
      scheduleWarmup();
      requestFrame();
    });
  }
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
  shelfSpring.velocity = 0;
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

/**
 * The room is ready and the veil lifts: the books in view are set down on
 * the shelf one after another, nearest the middle first, while the interface
 * comes in around them (`is-arriving` in the CSS).
 */
function beginArrival() {
  if (reducedMotion) return;
  experience.classList.add("is-arriving");
  setTimeout(() => experience.classList.remove("is-arriving"), 2400);
  bookRigs.forEach((rig, index) => {
    if (rig.root.parent !== shelfStage) return;
    const distance = Math.abs(index - targetPosition);
    if (distance > 4) return;
    // After the veil has mostly lifted, one book every tenth of a second.
    rig.arrival = 0.3 + distance * 0.1;
    rig.settling = 1.1;
    rig.root.position.y += 0.2;
    rig.root.rotation.z += (index < targetPosition ? 1 : -1) * 0.04;
    rig.setOpacity(0);
    rig.contactShadow.material.opacity = 0;
    rig.root.visible = false;
  });
  requestFrame();
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
    updateFlexiblePage(pagePivot, 0, 0, true, 0, 0);
  });
  rig.setOpacity(slot.opacity);
  rig.setRibbonShelfRest?.(1);
  rig.contactShadow.visible = true;
  rig.contactShadow.material.opacity = slot.opacity * 0.34;
  rig.hit.visible = slot.opacity > 0.12;
  rig.lastOffset = slot.offset;
}

function updateShelfLayout(delta, elapsed) {
  if (mode === "hero") {
    const limit = Math.max(0, books.length - 1);
    if (shelfPan.active) {
      // Under the hand: `position` was set from the pointer.
      shelfSpring.value = position;
    } else if (reducedMotion) {
      position = targetPosition;
      shelfSpring.velocity = 0;
    } else {
      shelfSpring.value = position;
      stepSpring(shelfSpring, targetPosition, SHELF_STIFFNESS, SHELF_DAMPING, delta, 0.0004);
      position = shelfSpring.value;
    }
    if (Math.abs(position - targetPosition) < 0.0005 && Math.abs(shelfSpring.velocity) < 0.004) {
      if (position !== targetPosition || shelfSpring.velocity !== 0) scheduleWarmup();
      position = targetPosition;
      shelfSpring.velocity = 0;
    }

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

  syncShelfRigs();
  let paintBudget = 2;
  lazyPaintPending = false;
  bookRigs.forEach((rig, index) => {
    if (rig.root.parent !== shelfStage) return;
    // Waiting for its turn to be set down (see beginArrival).
    if (rig.arrival > 0) {
      rig.arrival -= delta;
      motion = true;
      return;
    }
    // Just set down: it comes to rest more gently than a shelf move.
    const settling = rig.settling > 0;
    if (settling) {
      rig.settling -= delta;
      motion = true;
    }

    const dragged = shelfDrag.active && index === shelfDrag.index;
    const slot = shelfSlot(dragSlotIndex(index));
    // The book being moved is lifted off the shelf and brought forward.
    if (dragged) slot.z += 0.28;
    const targetY = shelfBoardTop + rig.base.height * 0.5 + slot.focus * 0.15 + (dragged ? 0.12 : 0);
    const speed = reducedMotion ? 1000 : settling ? 8.5 : 12;
    rig.lastOffset = slot.offset;

    rig.root.position.x = damp(rig.root.position.x, slot.x, speed, delta);
    rig.root.position.y = damp(rig.root.position.y, targetY, speed * 0.6, delta);
    rig.root.position.z = damp(rig.root.position.z, slot.z, speed, delta);
    rig.root.rotation.y = damp(rig.root.rotation.y, slot.rotationY, speed, delta);
    rig.root.rotation.z = damp(rig.root.rotation.z, slot.rotationZ, speed, delta);
    rig.root.scale.setScalar(damp(rig.root.scale.x, slot.scale, speed, delta));

    const nextOpacity = reducedMotion
      ? slot.opacity
      : damp(rig.opacity, slot.opacity, settling ? 6 : 14, delta);
    rig.root.visible = nextOpacity > 0.004;
    rig.setOpacity(nextOpacity);
    rig.contactShadow.visible = true;
    rig.contactShadow.material.opacity = nextOpacity * 0.34;
    rig.hit.visible = nextOpacity > 0.12;
    if (!rig.root.visible) return;
    rig.setRibbonShelfRest?.(1);
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

    const isHovered = hoveredIndex === index && mode === "hero" && !shelfDrag.active;
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

function printLeaf(rig, pivot, leaf, sides = [0, 1]) {
  pivot.userData.leaf = leaf;
  sides.forEach((side) => {
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
  const dir = turned ? -1 : 1;
  updateFlexiblePage(pivot, 0.008 * dir, 0, true, 0, 0.032 * dir);
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
    const { rig, pivot, leaf, side } = leafQueue.shift();
    if (rig.leaves.includes(pivot) && bookRigs.includes(rig)) printLeaf(rig, pivot, leaf, [side]);
  }
}

/** One page (one side of a leaf) per idle moment: each is tens of milliseconds. */
function queueLeaf(rig, pivot, leaf) {
  leafQueue.push({ rig, pivot, leaf, side: 0 }, { rig, pivot, leaf, side: 1 });
}

function drainLeafQueue() {
  leafQueueHandle = 0;
  const job = leafQueue.shift();
  if (!job) return;
  if (job.rig.leaves.includes(job.pivot) && bookRigs.includes(job.rig)) printLeaf(job.rig, job.pivot, job.leaf, [job.side]);
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
    queueLeaf(rig, rig.leaves[order], rig.leafBase + order);
  }
}

function startLeafQueue() {
  if (leafQueue.length && !leafQueueHandle) leafQueueHandle = whenIdle(drainLeafQueue, 400);
}

function syncLeafWindow(rig, force = false) {
  // A reflow supersedes the outstanding work. Printing it first would use
  // the new text on old slots, then paint those same textures again.
  if (force) {
    leafQueue.length = 0;
    deferredLeaf = null;
  } else {
    flushLeafQueue();
    printDeferredLeaf();
  }
  const base = leafBaseFor(rig, currentSpread);
  const shift = base - rig.leafBase;
  if (!force && shift === 0) return;
  rig.leafBase = base;
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
    // Only the open spread is printed now; the leaves lying under the piles
    // (or all of them, while the book is shut) follow one per quiet moment.
    // A preset or a cloth colour reprints every page, and eight pages with
    // their uploads in one frame was the largest stall left in the studio.
    leafQueue.length = 0;
    for (let order = 0; order < PRINTED_LEAVES; order += 1) {
      const leaf = base + order;
      const inView = readingOpen && (leaf === currentSpread || leaf === currentSpread - 1);
      if (inView) printLeaf(rig, rig.leaves[order], leaf);
      else queueLeaf(rig, rig.leaves[order], leaf);
    }
    startLeafQueue();
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
  // Shutting the book ends reading mode.
  if (!open && readingMode) setReadingMode(false);
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
  const peekWanted = mode === "detail" && readingOpen && !pageDrag.active && !reducedMotion ? pagePeek.side : 0;
  if (peekWanted) pagePeek.held = peekWanted;
  const peekBefore = pagePeek.amount;
  pagePeek.amount = damp(pagePeek.amount, peekWanted ? 1 : 0, peekWanted ? 8 : 11, delta);
  if (!peekWanted && pagePeek.amount < 0.003) pagePeek.amount = 0;
  if (Math.abs(pagePeek.amount - peekBefore) > 0.0005) motion = true;
  const peekLeaf = pagePeek.amount > 0
    ? (pagePeek.held > 0 ? localSpread : localSpread - 1)
    : -1;
  const peek = ease.smooth(pagePeek.amount);

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
      } else if (leafOrder === peekLeaf) {
        // The corner nearest the pointer comes up first.
        pageTarget += (pagePeek.held > 0 ? -1 : 1) * peek * 0.1;
        dragCurveBoost = peek * 0.045;
        flexTwistTarget = peek * pagePeek.tilt * 0.07;
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
    const midTurn = Math.sin(Math.PI * turnProgress);
    // Arch direction flips sign smoothly via cos(rotation.y) so BOTH right-hand
    // unturned leaves (+z local = +z world) and left-hand turned leaves (-z local = +z world)
    // bow gracefully toward the reader without ever clipping into the front cover.
    const archDir = Math.cos(pagePivot.rotation.y);
    const curveTarget = amount > 0
      ? amount * (0.008 * archDir + midTurn * 0.082 + dragCurveBoost)
      : 0;
    const restArchTarget = amount > 0 && leafOrder < PRINTED_LEAVES
      ? amount * 0.032 * archDir * (1 - midTurn * 0.85)
      : 0;
    updateFlexiblePage(pagePivot, curveTarget, delta, false, flexTwistTarget * amount, restArchTarget);
  });
  rig.setSpreadProgress?.(currentSpread / Math.max(1, spreadLimit()), amount);
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
  if (shelfJump) return -1;
  raycaster.setFromCamera(pointer.ndc, camera);
  const hits = raycaster.intersectObjects(hitTargets.filter((hit) => hit.visible), false);
  return hits[0]?.object.userData.shelfIndex ?? -1;
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

/* ----- moving a book along the shelf ----- */

// Press a book and drag it sideways: it lifts off the shelf and follows the
// pointer while its neighbours make room. Alt + arrow keys do the same.
const shelfDrag = { pointerId: null, index: -1, startX: 0, startY: 0, offset: 0, pixels: 100, active: false, target: -1, dropped: false };

/** Screen pixels between two neighbouring places on the shelf. */
function slotPixels() {
  const a = new THREE.Vector3(0, shelfBoardTop, 0.2);
  const b = new THREE.Vector3(spacing, shelfBoardTop, 0.2);
  shelfStage.localToWorld(a).project(camera);
  shelfStage.localToWorld(b).project(camera);
  return Math.max(24, Math.abs(b.x - a.x) * 0.5 * viewWidth);
}

/* ----- sliding the shelf by hand ----- */

// Drag the shelf (on a touch screen, swipe it anywhere) and it follows the
// hand one to one; let go and it carries on at the hand's speed and settles
// on a book. Past either end it gives, with growing resistance. With a mouse,
// pressing a book and dragging moves that book instead; on a touch screen a
// book is picked up by holding it still for a moment.
const shelfPan = { pointerId: null, active: false, startX: 0, startY: 0, from: 0, pixels: 100, samples: [], index: -1, hold: 0 };
const HOLD_TO_LIFT_MS = 380;

/** Resistance past the ends of the shelf: gives a little, then less and less. */
const rubber = (over) => 0.55 * (1 - 1 / (1 + over * 1.7));

function panPosition(raw) {
  const limit = Math.max(0, books.length - 1);
  if (raw < 0) return -rubber(-raw);
  if (raw > limit) return limit + rubber(raw - limit);
  return raw;
}

/** Pick a book up to carry it along the shelf (a held touch). */
function liftBook(index, start) {
  Object.assign(shelfDrag, {
    pointerId: start.pointerId, index, target: index, offset: 0, active: true,
    startX: start.clientX, startY: start.clientY, pixels: slotPixels()
  });
  canvas.setPointerCapture?.(start.pointerId);
  canvas.classList.add("is-moving-book");
  setHovered(-1);
  navigator.vibrate?.(8);
  audio.playCue("navigate");
  requestFrame();
}

function onShelfPointerDown(event) {
  if (mode !== "hero" || event.button !== 0 || event.isPrimary === false || !books.length) return;
  setPointerFromEvent(event);
  const index = bookIndexAtPointer();
  const touch = Boolean(event.pointerType) && event.pointerType !== "mouse";
  if (!touch && index >= 0) {
    if (books.length < 2) return;
    Object.assign(shelfDrag, {
      pointerId: event.pointerId, index, target: index, offset: 0, active: false,
      startX: event.clientX, startY: event.clientY, pixels: slotPixels()
    });
    return;
  }
  clearTimeout(shelfPan.hold);
  Object.assign(shelfPan, {
    pointerId: event.pointerId, active: false, startX: event.clientX, startY: event.clientY,
    from: position, pixels: slotPixels(), samples: [], index, hold: 0
  });
  if (touch && index >= 0 && books.length >= 2) {
    const start = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    shelfPan.hold = setTimeout(() => {
      if (shelfPan.pointerId !== start.pointerId || shelfPan.active || mode !== "hero") return;
      shelfPan.pointerId = null;
      liftBook(index, start);
    }, HOLD_TO_LIFT_MS);
  }
}

function onShelfPointerMove(event) {
  if (mode !== "hero") return;
  if (shelfPan.pointerId === event.pointerId) {
    const dx = event.clientX - shelfPan.startX;
    const dy = event.clientY - shelfPan.startY;
    if (!shelfPan.active) {
      if (Math.hypot(dx, dy) > 10) clearTimeout(shelfPan.hold);
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dx) < Math.abs(dy)) {
        shelfPan.pointerId = null;
        return;
      }
      shelfPan.active = true;
      shelfPan.startX = event.clientX;
      shelfPan.from = position;
      shelfSpring.velocity = 0;
      wheelIdle = 0;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add("is-panning");
      setHovered(-1);
      audio.unlock();
    }
    const raw = shelfPan.from - (event.clientX - shelfPan.startX) / shelfPan.pixels;
    position = panPosition(raw);
    targetPosition = position;
    const now = event.timeStamp || performance.now();
    shelfPan.samples.push([now, raw]);
    while (shelfPan.samples.length > 2 && now - shelfPan.samples[0][0] > 90) shelfPan.samples.shift();
    requestFrame();
    return;
  }
  if (shelfDrag.pointerId !== event.pointerId) return;
  const dx = event.clientX - shelfDrag.startX;
  if (!shelfDrag.active) {
    if (Math.abs(dx) < 9 || Math.abs(dx) < Math.abs(event.clientY - shelfDrag.startY)) return;
    shelfDrag.active = true;
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.add("is-moving-book");
    setHovered(-1);
  }
  shelfDrag.offset = clamp(dx / shelfDrag.pixels, -shelfDrag.index - 0.4, books.length - 0.6 - shelfDrag.index);
  shelfDrag.target = clamp(Math.round(shelfDrag.index + shelfDrag.offset), 0, books.length - 1);
  requestFrame();
}

/** Release a pan: carry the hand's speed on, and settle on the book it reaches. */
function releasePan(cancelled) {
  const samples = shelfPan.samples;
  let velocity = 0;
  if (!cancelled && samples.length >= 2) {
    const [t0, p0] = samples[0];
    const [t1, p1] = samples[samples.length - 1];
    // A hand that stopped before letting go throws nothing.
    const stale = performance.now() - t1 > 80;
    if (t1 > t0 && !stale) velocity = clamp(((p1 - p0) / (t1 - t0)) * 1000, -28, 28);
  }
  const limit = Math.max(0, books.length - 1);
  const projected = position + velocity * 0.3;
  targetPosition = clamp(Math.round(projected), 0, limit);
  shelfSpring.velocity = reducedMotion ? 0 : velocity;
  shelfPan.active = false;
  canvas.classList.remove("is-panning");
  // The click that follows the release is not a selection.
  shelfDrag.dropped = true;
  setTimeout(() => { shelfDrag.dropped = false; }, 0);
  requestFrame();
}

function onShelfPointerEnd(event) {
  if (shelfPan.pointerId === event.pointerId) {
    clearTimeout(shelfPan.hold);
    shelfPan.pointerId = null;
    if (shelfPan.active) releasePan(event.type === "pointercancel");
    return;
  }
  if (shelfDrag.pointerId !== event.pointerId) return;
  shelfDrag.pointerId = null;
  if (!shelfDrag.active) return;
  shelfDrag.active = false;
  canvas.classList.remove("is-moving-book");
  // The click that follows the release is not a selection.
  shelfDrag.dropped = true;
  setTimeout(() => { shelfDrag.dropped = false; }, 0);
  if (event.type !== "pointercancel" && shelfDrag.target !== shelfDrag.index) moveBook(shelfDrag.index, shelfDrag.target);
  requestFrame();
}

/** Where a book stands while another is being dragged past it. */
function dragSlotIndex(index) {
  if (!shelfDrag.active) return index;
  const { index: from, target } = shelfDrag;
  if (index === from) return from + shelfDrag.offset;
  if (from < target && index > from && index <= target) return index - 1;
  if (from > target && index < from && index >= target) return index + 1;
  return index;
}

/** Move the book at `from` to `to`: the rigs here, the library through `onMove`. */
function moveBook(from, to) {
  const book = books[from];
  if (from === to || !book) return;
  const [rig] = bookRigs.splice(from, 1);
  bookRigs.splice(to, 0, rig);
  if (!rig) delete bookRigs[to];
  rebuildHitTargets();
  hoveredIndex = -1;
  emit("onMove", book.id, to);
  selectedIndex = to;
  targetPosition = to;
  position = clamp(position + (to - from), 0, Math.max(0, books.length - 1));
  emit("onSelect", selectedIndex, book);
  audio.playCue("navigate");
  announce(t("Moved {title} to place {n} of {count}.", { title: book.title, n: to + 1, count: books.length }));
  requestFrame();
}

function onCanvasClick(event) {
  if (shelfDrag.dropped) return;
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
  if (document.querySelector("dialog[open]")) return;
  if (event.target instanceof Element && event.target.closest("dialog, [data-scroll], .finder, .room-panel, .select__list, .picker, .share-menu")) return;
  event.preventDefault();
  audio.unlock();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  // Past either end each notch goes less far: the shelf gives, then holds.
  const limit = Math.max(0, books.length - 1);
  const over = Math.max(0, -targetPosition, targetPosition - limit);
  const step = clamp(delta * 0.0022, -0.72, 0.72);
  const outward = (step < 0 && targetPosition <= 0) || (step > 0 && targetPosition >= limit);
  targetPosition = clamp(
    targetPosition + (outward ? step / (1 + over * 9) : step),
    -0.3,
    limit + 0.3
  );
  wheelIdle = 0.14;
  requestFrame();
}

/* ------------------------------------------------------------------ */
/* Shelf <-> detail                                                    */
/* ------------------------------------------------------------------ */

function openDetail(origin = null) {
  if (mode !== "hero" || !books[selectedIndex]) return;
  // A finder jump can be opened before the spring has reached its target.
  if (!bookRigs[selectedIndex]) {
    alignShelfToSelection();
    syncShelfRigs();
  }
  audio.playCue("select");
  mode = "opening";
  transitionTime = 0;
  currentViewName = "front";
  readingOpen = false;
  detailBookHovered = false;
  currentSpread = 0;
  resetDetailPress();
  focusReturnTarget = origin instanceof HTMLElement && origin !== canvas ? origin : null;
  activeBook = bookRigs[selectedIndex];
  // Its studio-size grain is painted off the main thread during the flight.
  prefetchBoardGrain(activeBook.data, quality.detail);
  activeBook.contactShadow.visible = false;
  activeBook.root.visible = true;
  activeBook.setOpacity(1);
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
  activeBook.setRibbonShelfRest?.(0);
  updateShadowFrustum(true);
  emit("onMode", mode, activeBook.data);
  emit("onViewChange", currentViewName);
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
  // The flight home shuts the book by itself: no separate close on the way.
  if (photoMode) setPhotoMode(false);
  if (readingMode) setReadingMode(false, { restore: false });
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
  syncShelfRigs();
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
  leafQueue.length = 0;
  deferredLeaf = null;
  activeBook.clearLeaves();
  activeBook.flat = [];
  activeBook.setLeafShadows(false);
  activeBook.setRibbonShelfRest?.(1);
  activeBook.swayRibbon(0);
  activeBook.setGlint(0);
  ribbonSway.value = 0;
  ribbonSway.velocity = 0;
  glintTime = 1;
  activeBook.motion.scale.setScalar(1);
  activeBook.releaseSwaps();
  activeBook.setResolution(quality.shelf);
  activeBook.setCase(1);
  controls.target.copy(shelfCameraTarget);
  mode = "hero";
  transitionTime = 0;
  updateShadowFrustum(false);
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
  pages: { turn: -0.2, tilt: -0.1, zoom: 1.08 },
  // Square on to the spread, looking a little down onto it, as a reader does.
  reading: { turn: 0, tilt: -0.3, zoom: 1 },
  // Curated Photo Studio camera stations (balanced margins for viewfinder & collector cards)
  photo_hero: { turn: -0.36, tilt: -0.12, zoom: 1.08 },
  photo_front: { turn: 0.14, tilt: -0.04, zoom: 1.04 },
  photo_spine: { turn: -1.62, tilt: -0.06, zoom: 1.04 },
  photo_detail: { turn: 0.72, tilt: -0.3, zoom: 0.78 },
  photo_spread: { turn: 0.06, tilt: -0.28, zoom: 1.38 },
  photo_editorial: { turn: -0.68, tilt: -0.44, zoom: 1.14 }
};

function focusView(name) {
  const view = VIEWS[name] || VIEWS.front;
  if (VIEWS[name]) {
    currentViewName = name;
    emit("onViewChange", currentViewName);
  }
  if (mode !== "detail") {
    pendingView = mode === "opening" ? name : null;
    return;
  }
  const home = new THREE.Spherical().setFromVector3(
    scratchVector.copy(inspectCameraPosition).sub(inspectCameraTarget)
  );
  // Reading looks square onto the pages, whichever way the book is turned.
  if (name === "reading" && activeBook) {
    const facing = scratchVector.set(0, 0, 1).applyQuaternion(activeBook.root.quaternion);
    view.turn = Math.atan2(facing.x, facing.z) - home.theta;
  }
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
  // A short move is quick; a swing round to the back takes its time and
  // eases out a little on the way, as a camera on a dolly would.
  const swing = Math.abs(viewTween.to.theta - viewTween.from.theta);
  const lift = Math.abs(viewTween.to.phi - viewTween.from.phi);
  viewTween.duration = clamp(0.5 + swing * 0.17 + lift * 0.3, 0.5, 1.05);
  viewTween.breath = Math.min(0.07, swing * 0.024);
  viewTween.time = 0;
  viewTween.active = true;
  if (reducedMotion) viewTween.time = 1;
  requestFrame();
}

function updateViewTween(delta) {
  if (!viewTween.active) return;
  viewTween.time = Math.min(1, viewTween.time + delta / viewTween.duration);
  const eased = smootherstep(viewTween.time);
  const breath = 1 + Math.sin(Math.PI * eased) * (viewTween.breath || 0);
  viewTween.current.set(
    lerp(viewTween.from.radius, viewTween.to.radius, eased) * breath,
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

let typicalGap = 1000 / 60;
let slowGapStreak = 0;

function frame(time) {
  rafId = 0;
  if (shelfJump) return;
  const frameStarted = performance.now();
  const frameGap = time - lastTime;
  // A lone long frame (a board painted, a texture uploaded) is absorbed:
  // motion carries on from where it was by about one ordinary frame instead
  // of jumping ahead by the whole gap. If 3+ consecutive frames run steadily
  // slower (e.g. power-saver or 24-30Hz display), let typicalGap adapt so
  // transitions and animations keep real time instead of locking in slow-mo.
  const rawSpike = frameGap > typicalGap * 2.2;
  slowGapStreak = rawSpike && frameGap < 120 ? slowGapStreak + 1 : 0;
  const spike = rawSpike && slowGapStreak <= 2;
  if ((!spike || slowGapStreak >= 3) && frameGap > 0 && frameGap < 100) {
    typicalGap += (Math.min(frameGap, 66) - typicalGap) * (slowGapStreak >= 3 ? 0.3 : 0.1);
  }
  const delta = Math.min((spike ? typicalGap * 1.5 : frameGap) / 1000, 0.05);
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
  if (mode !== "detail" && readingFit > 0) updateReadingFit(delta);
  if (mode !== "detail" && readingAmount > 0) updateReadingAmount(delta);
  if (mode !== "detail" && photoAmount > 0) updatePhotoAmount(delta);
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
    updateReadingFit(delta);
    updateSheetShare(delta);
    updateReadingAmount(delta);
    updatePhotoAmount(delta);
    updateRebind(delta);
    // Subtle hand-in-book inspection tilt on the closed cover so metallic foil
    // and pebbled grain catch grazing light as the pointer glides across it.
    if (rebindTime >= 1) {
      const parallax = !readingOpen && detailBookHovered && !reducedMotion && !pageDrag.active && !viewTween.active;
      const targetRx = parallax ? pointer.ndc.y * 0.022 : 0;
      const targetRy = parallax ? -pointer.ndc.x * 0.026 : 0;
      activeBook.motion.rotation.x = damp(activeBook.motion.rotation.x, targetRx, 8.5, delta);
      activeBook.motion.rotation.y = damp(activeBook.motion.rotation.y, targetRy, 8.5, delta);
    }
    if (activeBook.stepSwaps(delta)) motion = true;
    const targetInspectScale = getInspectScale();
    if (Math.abs(activeBook.root.scale.x - targetInspectScale) > 0.001) {
      const nextScale = reducedMotion ? targetInspectScale : damp(activeBook.root.scale.x, targetInspectScale, 10, delta);
      activeBook.root.scale.setScalar(Math.abs(nextScale - targetInspectScale) < 0.001 ? targetInspectScale : nextScale);
      motion = true;
    }
    updateRibbon(delta);
    updateGlint(delta);
  }

  const shelfMoving = Math.abs(position - targetPosition) > 0.0005 || shelfSpring.velocity !== 0 || wheelIdle > 0;
  const active = motion
    || cameraMotion
    || mode === "opening"
    || mode === "closing"
    || shelfMoving
    || themeIsMoving
    || viewTween.active
    || pageDrag.active
    || shelfDrag.active
    || shelfPan.active
    || rebindTime < 1
    || glintTime < 1
    || leavingRigs.length > 0
    || Boolean(activeBook?.hasActiveSwaps)
    || lazyPaintPending
    || pendingRepaints.size > 0;
  if (active) activeUntil = frameStarted + 160;
  const busy = frameStarted < activeUntil;
  const keepGoing = !suspended && (busy || ambient > 0);

  // Ambient-only frames are drawn at a gentle rate; the last frame before
  // sleeping is always drawn, at full resolution. Reading mode always stays
  // sharp at full resolution so printed text never blurs.
  const due = active || wakeRender || !keepGoing || frameStarted - lastRenderAt >= AMBIENT_FRAME_MS;
  if (due) {
    wakeRender = false;
    applyRenderScale(busy && keepGoing && !readingMode ? motionScale : 1);
    // Throttle 4096px shadow redraw to every 2nd frame during fast shelf sweeps,
    // and guarantee a crisp full shadow refresh the instant velocity settles.
    shadowTick += 1;
    const fastShelfSweep = mode === "hero" && shelfMoving && Math.abs(shelfSpring.velocity) > 1.8;
    if (motion || shelfMoving || mode === "opening" || mode === "closing" || rebindTime < 1 || leavingRigs.length > 0) {
      if (!fastShelfSweep || shadowTick % 2 === 0) shadowHold = Math.max(shadowHold, fastShelfSweep ? 1 : 2);
    }
    renderFrame();
    lastRenderAt = frameStarted;
    const frameWork = performance.now() - frameStarted;
    perf.frame(frameGap, frameWork, perf.enabled && [
      motion ? "m" : "", cameraMotion ? "c" : "", shelfMoving ? "s" : "", themeIsMoving ? "t" : "",
      lazyPaintPending ? "l" : "", active ? "" : "-", renderScale < 1 ? renderScale : ""
    ].join(""));
    watchFrameBudget(frameGap, active, frameStarted, frameWork);
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
    rig.setOpacity(fade);
    rig.contactShadow.material.opacity = fade * 0.34;
    motion = true;
    if (rig.leaving >= 1) {
      leavingRigs.splice(index, 1);
      releaseShelfRig(rig);
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

let sceneStats = { calls: 0, triangles: 0 };

function buildComposer() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // At two device pixels per CSS pixel, 2x multisampling is already clean.
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: basePixelRatio >= 1.75 ? 2 : 4
  });
  composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const baseRender = renderPass.render.bind(renderPass);
  renderPass.render = (r, writeBuffer, readBuffer, deltaTime, maskActive) => {
    baseRender(r, writeBuffer, readBuffer, deltaTime, maskActive);
    sceneStats.calls = r.info.render.calls;
    sceneStats.triangles = r.info.render.triangles;
  };
  composer.addPass(renderPass);
  occlusionPass = null;

  if (quality.post) {
    // Ambient occlusion: the gutter, the hinge, books against the shelf.
    // It is soft by nature, so it is computed at reduced resolution.
    const scale = quality.aoScale;
    const occlusion = new GTAOPass(scene, camera, Math.ceil(size.x * scale), Math.ceil(size.y * scale));
    occlusion.setSize = (width, height) => {
      GTAOPass.prototype.setSize.call(occlusion, Math.ceil(width * scale), Math.ceil(height * scale));
    };
    // A short distance fall-off: a leaf a hair above the block occludes it
    // only faintly, so stacked pages keep clean edges instead of a grainy band
    // (books against the shelf are unchanged). Denoised over a wider disc
    // at the same cost (more samples or rings doubled the denoise on every
    // frame, enough to cost the shelf sweep a frame step).
    occlusion.updateGtaoMaterial({ radius: 0.2, distanceExponent: 1.4, distanceFallOff: 0.1, thickness: 1.2, scale: 1.05, samples: 12 });
    occlusion.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 9 * Math.max(scale, 0.66), rings: 2, samples: 12 });
    occlusion.blendIntensity = AO_BLEND;
    composer.addPass(occlusion);
    occlusionPass = occlusion;
  }

  // Bloom and depth of field were tried here and removed: both soften the
  // printed page, and a book you are typesetting has to stay sharp.
  composer.addPass(new OutputPass());
}

function disposeComposer() {
  if (!composer) return;
  composer.passes.forEach((pass) => pass.dispose());
  composer.dispose();
  composer = null;
  occlusionPass = null;
}

function renderFrame() {
  // Shadows are redrawn only when something that casts one has moved.
  renderer.shadowMap.needsUpdate = shadowHold > 0;
  if (shadowHold > 0) shadowHold -= 1;
  if (composer) composer.render();
  else {
    renderer.render(scene, camera);
    sceneStats.calls = renderer.info.render.calls;
    sceneStats.triangles = renderer.info.render.triangles;
  }
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

const STUDIO_BACKDROPS = {
  cream: { wall: "#f4eee2", floor: "#e8dfd0" },
  linen: { wall: "#e2d7c4", floor: "#d4c7b2" },
  sage: { wall: "#d7dfd6", floor: "#c6d0c4" },
  charcoal: { wall: "#1a191e", floor: "#141318", dark: true }
};

let photoBackdrop = "match";
let photoBackdropSaved = null;

/** Live studio sweep / transparent cutout preview while inside Photo Studio. */
function setPhotoBackdrop(next = "match") {
  const id = next === "transparent" || STUDIO_BACKDROPS[next] ? next : "match";
  if (id === photoBackdrop && (id !== "match" || !photoBackdropSaved)) return;
  if (!scene || !renderer) {
    photoBackdrop = id;
    return;
  }
  if (id === "match") {
    photoBackdrop = "match";
    experience.classList.remove("is-photo-cutout");
    if (photoBackdropSaved) {
      if (roomMeshes.floor) roomMeshes.floor.visible = photoBackdropSaved.floorVis;
      if (roomMeshes.wall) roomMeshes.wall.visible = photoBackdropSaved.wallVis;
      if (dustPoints) dustPoints.visible = photoBackdropSaved.dustVis;
      if (shelfStage) shelfStage.visible = photoBackdropSaved.shelfVis;
      scene.background = photoBackdropSaved.bg;
      scene.fog = photoBackdropSaved.fog;
      if (roomMaterials.wall) {
        roomMaterials.wall.emissive.copy(photoBackdropSaved.wallEmissive);
        roomMaterials.wall.emissiveIntensity = photoBackdropSaved.wallEmissiveI;
      }
      if (roomMaterials.floor) {
        roomMaterials.floor.emissive.copy(photoBackdropSaved.floorEmissive);
        roomMaterials.floor.emissiveIntensity = photoBackdropSaved.floorEmissiveI;
      }
      renderer.setClearColor(photoBackdropSaved.clearColor, photoBackdropSaved.clearAlpha);
      photoBackdropSaved = null;
    }
    if (room.follow && activeBook?.data) applyTheme(bookPalette(activeBook.data), activeBook.data.foil.color);
    else applyTheme(roomPalette(), ROOM_ACCENT);
    requestFrame();
    return;
  }
  if (!photoBackdropSaved) {
    photoBackdropSaved = {
      floorVis: roomMeshes.floor ? roomMeshes.floor.visible : true,
      wallVis: roomMeshes.wall ? roomMeshes.wall.visible : true,
      dustVis: dustPoints ? dustPoints.visible : true,
      shelfVis: shelfStage ? shelfStage.visible : true,
      bg: scene.background,
      fog: scene.fog,
      wallEmissive: roomMaterials.wall ? roomMaterials.wall.emissive.clone() : new THREE.Color(),
      wallEmissiveI: roomMaterials.wall ? roomMaterials.wall.emissiveIntensity : 0,
      floorEmissive: roomMaterials.floor ? roomMaterials.floor.emissive.clone() : new THREE.Color(),
      floorEmissiveI: roomMaterials.floor ? roomMaterials.floor.emissiveIntensity : 0,
      clearColor: renderer.getClearColor(new THREE.Color()),
      clearAlpha: renderer.getClearAlpha()
    };
  }
  photoBackdrop = id;
  if (id === "transparent") {
    experience.classList.add("is-photo-cutout");
    if (roomMeshes.floor) roomMeshes.floor.visible = false;
    if (roomMeshes.wall) roomMeshes.wall.visible = false;
    if (dustPoints) dustPoints.visible = false;
    if (shelfStage) shelfStage.visible = false;
    scene.background = null;
    scene.fog = null;
    renderer.setClearColor(0x000000, 0);
  } else {
    experience.classList.remove("is-photo-cutout");
    const sweep = STUDIO_BACKDROPS[id];
    const wc = new THREE.Color(sweep.wall);
    const fc = new THREE.Color(sweep.floor);
    if (roomMeshes.floor) roomMeshes.floor.visible = photoBackdropSaved.floorVis;
    if (roomMeshes.wall) roomMeshes.wall.visible = photoBackdropSaved.wallVis;
    if (dustPoints) dustPoints.visible = false;
    if (shelfStage) shelfStage.visible = photoBackdropSaved.shelfVis;
    scene.background = wc;
    scene.fog = photoBackdropSaved.fog;
    themeTargets.wall.copy(wc);
    themeTargets.floor.copy(fc);
    themeTargets.fog.copy(wc);
    themeMoving = true;
    if (roomMaterials.wall) {
      roomMaterials.wall.color.copy(wc);
      roomMaterials.wall.emissive.copy(wc);
      roomMaterials.wall.emissiveIntensity = sweep.dark ? 0.16 : 0.44;
    }
    if (roomMaterials.floor) {
      roomMaterials.floor.color.copy(fc);
      roomMaterials.floor.emissive.copy(fc);
      roomMaterials.floor.emissiveIntensity = sweep.dark ? 0.16 : 0.44;
    }
    renderer.setClearColor(wc, 1);
  }
  requestFrame();
}

/**
 * Render an exact-aspect, 2x-supersampled studio photograph of the active book
 * matching the live viewfinder framing. Supports custom studio sweep backdrops
 * as well as true alpha=0 transparent PNG cutouts. Restores live state cleanly.
 */
function captureStudioPhoto({ aspect = 4 / 5, maxEdge = 1800, backdrop = "match", cropHeightRatio = 0.78 } = {}) {
  if (!renderer || !scene || !camera) return null;
  const safeAspect = clamp(Number(aspect) || 0.8, 0.4, 2.2);
  const edge = clamp(Math.round(Number(maxEdge) || 1800), 600, 2400);
  const outW = safeAspect >= 1 ? edge : Math.round(edge * safeAspect);
  const outH = safeAspect >= 1 ? Math.round(edge / safeAspect) : edge;
  const ratio = clamp(Number(cropHeightRatio) || 0.78, 0.25, 1);
  const transparent = backdrop === "transparent";
  const sweep = STUDIO_BACKDROPS[backdrop] || null;

  // Snapshot live state
  const savedPixelRatio = renderer.getPixelRatio();
  const savedSize = renderer.getSize(new THREE.Vector2());
  const savedAspect = camera.aspect;
  const savedZoom = camera.zoom;
  const savedView = camera.view ? { ...camera.view } : null;
  const savedBg = scene.background;
  const savedFog = scene.fog;
  const savedFogColor = scene.fog ? scene.fog.color.clone() : null;
  const savedWallColor = roomMaterials.wall ? roomMaterials.wall.color.clone() : null;
  const savedWallEmissive = roomMaterials.wall ? roomMaterials.wall.emissive.clone() : null;
  const savedWallEmissiveI = roomMaterials.wall ? roomMaterials.wall.emissiveIntensity : 0;
  const savedFloorColor = roomMaterials.floor ? roomMaterials.floor.color.clone() : null;
  const savedFloorEmissive = roomMaterials.floor ? roomMaterials.floor.emissive.clone() : null;
  const savedFloorEmissiveI = roomMaterials.floor ? roomMaterials.floor.emissiveIntensity : 0;
  const savedFloorVis = roomMeshes.floor ? roomMeshes.floor.visible : true;
  const savedWallVis = roomMeshes.wall ? roomMeshes.wall.visible : true;
  const savedDustVis = dustPoints ? dustPoints.visible : true;
  const savedShelfVis = shelfStage ? shelfStage.visible : true;
  const savedClearColor = renderer.getClearColor(new THREE.Color());
  const savedClearAlpha = renderer.getClearAlpha();

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext("2d");

  try {
    // Configure exact viewfinder sub-frustum at full target resolution
    camera.aspect = outW / outH;
    camera.zoom = savedZoom / ratio;
    camera.clearViewOffset();
    if (savedView && savedView.enabled && (Math.abs(savedView.offsetX) > 0.5 || Math.abs(savedView.offsetY) > 0.5)) {
      const scaleY = outH / Math.max(1, viewHeight * ratio);
      camera.setViewOffset(outW, outH, savedView.offsetX * scaleY, savedView.offsetY * scaleY, outW, outH);
    }
    camera.updateProjectionMatrix();

    if (transparent) {
      if (roomMeshes.floor) roomMeshes.floor.visible = false;
      if (roomMeshes.wall) roomMeshes.wall.visible = false;
      if (dustPoints) dustPoints.visible = false;
      if (shelfStage) shelfStage.visible = false;
      scene.background = null;
      scene.fog = null;
      renderer.setClearColor(0x000000, 0);
    } else if (sweep) {
      const wc = new THREE.Color(sweep.wall);
      const fc = new THREE.Color(sweep.floor);
      scene.background = wc;
      if (scene.fog) scene.fog.color.copy(wc);
      if (roomMaterials.wall) {
        roomMaterials.wall.color.copy(wc);
        roomMaterials.wall.emissive.copy(wc);
        roomMaterials.wall.emissiveIntensity = sweep.dark ? 0.16 : 0.44;
      }
      if (roomMaterials.floor) {
        roomMaterials.floor.color.copy(fc);
        roomMaterials.floor.emissive.copy(fc);
        roomMaterials.floor.emissiveIntensity = sweep.dark ? 0.16 : 0.44;
      }
      if (dustPoints) dustPoints.visible = false;
    }

    renderer.setPixelRatio(1);
    renderer.setSize(outW, outH, false);

    if (transparent || !composer) {
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
    } else {
      composer.setPixelRatio(1);
      composer.setSize(outW, outH);
      composer.render();
    }
    outCtx.clearRect(0, 0, outW, outH);
    outCtx.drawImage(canvas, 0, 0, outW, outH);
  } finally {
    // Restore exact live state with zero flicker
    if (roomMeshes.floor) roomMeshes.floor.visible = savedFloorVis;
    if (roomMeshes.wall) roomMeshes.wall.visible = savedWallVis;
    if (dustPoints) dustPoints.visible = savedDustVis;
    if (shelfStage) shelfStage.visible = savedShelfVis;
    scene.background = savedBg;
    scene.fog = savedFog;
    if (scene.fog && savedFogColor) scene.fog.color.copy(savedFogColor);
    if (roomMaterials.wall && savedWallColor) {
      roomMaterials.wall.color.copy(savedWallColor);
      roomMaterials.wall.emissive.copy(savedWallEmissive);
      roomMaterials.wall.emissiveIntensity = savedWallEmissiveI;
    }
    if (roomMaterials.floor && savedFloorColor) {
      roomMaterials.floor.color.copy(savedFloorColor);
      roomMaterials.floor.emissive.copy(savedFloorEmissive);
      roomMaterials.floor.emissiveIntensity = savedFloorEmissiveI;
    }
    renderer.setClearColor(savedClearColor, savedClearAlpha);
    renderer.setPixelRatio(savedPixelRatio);
    renderer.setSize(savedSize.x, savedSize.y, false);
    if (composer) {
      composer.setPixelRatio(savedPixelRatio);
      composer.setSize(savedSize.x, savedSize.y);
    }
    camera.aspect = savedAspect;
    camera.zoom = savedZoom;
    if (savedView && savedView.enabled) {
      camera.setViewOffset(savedView.fullWidth, savedView.fullHeight, savedView.offsetX, savedView.offsetY, savedView.width, savedView.height);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    renderFrame();
  }
  return out;
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
function watchFrameBudget(gap, active, now, workMs = 0) {
  const budget = frameBudget;
  // Ignore rAF throttling from unfocused/occluded windows or low-refresh power-saver
  // displays where actual frame work is trivial: only downgrade when our own rendering
  // is genuinely straining the device.
  if (!active || gap <= 0 || gap > 120 || !document.hasFocus()) {
    budget.streak = 0;
    return;
  }
  const throttled = gap > SLOW_FRAME_MS && workMs > 0 && workMs < 8;
  if (throttled) {
    budget.streak = 0;
    budget.slow = 0;
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
  disposeComposer();
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
      disposeComposer();
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
    updateShadowFrustum(true);
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

  if (readingMode) rouse();
  if (event.key === "Escape" && mode === "detail") {
    event.preventDefault();
    if (typing) event.target.blur();
    else if (photoMode) setPhotoMode(false);
    else if (readingMode) setReadingMode(false);
    else closeDetail();
    return;
  }
  if (mode === "hero" && event.altKey && !typing && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    const to = clamp(selectedIndex + (event.key === "ArrowLeft" ? -1 : 1), 0, books.length - 1);
    moveBook(selectedIndex, to);
    return;
  }
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

  if (mode === "detail" && !readingMode) {
    // Never leak studio/camera shortcuts behind the modal Photo Studio darkroom.
    const darkroom = document.getElementById("photo-darkroom");
    if (darkroom && !darkroom.hidden) return;
    const onControl = event.target instanceof HTMLElement
      && Boolean(event.target.closest("button, a, [role='button'], [role='switch'], [role='tab'], [role='slider'], [role='tablist'], [role='radiogroup']"));
    if (!photoMode) {
      if (event.key === "1") { event.preventDefault(); focusView("front"); return; }
      if (event.key === "2") { event.preventDefault(); focusView("spine"); return; }
      if (event.key === "3") { event.preventDefault(); focusView("back"); return; }
      if (event.key === "4") { event.preventDefault(); focusView("details"); return; }
    }
    if (event.key === "p" || event.key === "P") { event.preventDefault(); setPhotoMode(!photoMode); return; }
    if (event.code === "Space" && !onControl) {
      event.preventDefault();
      setReadingOpen(!readingOpen);
      return;
    }
  }

  if (mode === "detail" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    const darkroom = document.getElementById("photo-darkroom");
    if (darkroom && !darkroom.hidden) return;
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
  if (graphicsUnavailable) return;
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
  graphicsUnavailable = true;
  suspended = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  showFallback(t("The 3D view paused after losing its graphics context. Your books are saved; reload to continue."));
}

function disposeExperience() {
  graphicsUnavailable = true;
  suspended = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  audio.dispose();
  controls?.dispose();
  bookRigs.forEach((rig) => rig.dispose());
  programOwners.forEach((material) => material.dispose());
  programOwners.clear();
  compiledPrograms.clear();
  environmentTarget?.dispose();
  pmrem?.dispose();
  disposeComposer();
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
  renderer.toneMapping = TONE_MAPPING;
  renderer.toneMappingExposure = TONE_EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xe9dfcb, 0.027);
  // Looking past the back wall shows the room colour, never a black void.
  scene.background = scene.fog.color;
  buildEnvironment(room.light);
  scene.environmentIntensity = 0.72;

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

  bookRigs = new Array(books.length);
  syncShelfRigs();
  selectedIndex = -2;
  updateSelection(0, false);
  bookRigs.forEach((rig) => {
    // Only the books in view are painted now; the rest wait their turn.
    if (rig.opacity > 0.004) paintRig(rig);
  });
  resize();

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onShelfPointerDown);
  canvas.addEventListener("pointermove", onShelfPointerMove);
  canvas.addEventListener("pointerup", onShelfPointerEnd);
  canvas.addEventListener("pointercancel", onShelfPointerEnd);
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
  window.addEventListener("pointerdown", onReadingPointerDown, true);
  window.addEventListener("pointerup", onReadingPointerUp, true);
  window.addEventListener("pointermove", () => { if (readingMode) rouse(); }, { passive: true });
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
      disposeComposer();
    }
  }
  perf.setInfo(() => ({
    tier: quality.name,
    post: Boolean(occlusionPass),
    pixelRatio: Math.round(renderer.getPixelRatio() * 100) / 100,
    scale: motionScale,
    calls: sceneStats.calls || renderer.info.render.calls,
    triangles: sceneStats.triangles || renderer.info.render.triangles,
    textures: renderer.info.memory.textures,
    geometries: renderer.info.memory.geometries,
    programs: renderer.info.programs?.length || 0
  }));
  // Let ANGLE link the visible materials in parallel before the first draw.
  // Shader diagnostics and the first shadow/post pass still happen normally.
  await compileVisibleScene();
  if (graphicsUnavailable) return false;
  renderFrame();
  // Keep the loading mark up until the covers in view have their real type
  // (briefly: a slow font must not hold the room back), then fade it away.
  const coverRuns = bookRigs.filter((rig) => rig.painted).flatMap((rig) => coverFontRuns(rig.data));
  Promise.race([
    ensureFonts(coverRuns),
    new Promise((resolve) => setTimeout(resolve, 1400))
  ]).then(() => {
    if (graphicsUnavailable) return;
    bookRigs.forEach((rig) => { if (rig.painted) rig.repaint(); });
    shadowHold = 3;
    if (!suspended) renderFrame();
    experience.classList.add("webgl-ready");
    beginArrival();
    loading.style.setProperty("--progress", "1");
    loading.classList.add("is-done");
    scheduleWarmup();
    // After the room has come in, so the arrival never waits on it.
    if (!bookRigs.length) setTimeout(() => whenIdle(prewarmFirstBook, 4000), 2600);
    // The night lamp's materials, so choosing the night light does not stall.
    if (lamp) whenIdle(() => compileQuietly(lamp), 3000);
    setTimeout(() => { loading.hidden = true; }, reducedMotion ? 0 : 560);
    requestFrame();
  });

  woodTexturePromise.then((ready) => {
    if (!ready || graphicsUnavailable || !renderer) return;
    woodTextureReady = true;
    applyWoodTexture();
  });
  return true;
}

export const engine = {
  init: initialize,
  capturePicture,
  captureStudioPhoto,
  captureTurntable,
  setRoom,
  get room() { return { ...room }; },
  addBook,
  removeBook,
  refreshBook,
  /** The new-book dialog is open: have the first book's programs ready. */
  prepareFirstBook: () => { if (!standIn && !bookRigs.length) whenIdle(prewarmFirstBook, 300); },
  /** Paint a book's grain ahead, draft and studio size (a likely next edit). */
  prefetchGrain: (book) => {
    prefetchBoardGrain(book, 1);
    prefetchBoardGrain(book, quality.detail);
  },
  select: selectIndex,
  navigate,
  openDetail,
  closeDetail,
  setReadingOpen,
  toggleReading: () => setReadingOpen(!readingOpen),
  turnPage,
  goToPage,
  focusView,
  setPhotoMode,
  setPhotoAngle,
  setPhotoBackdrop,
  get photoMode() { return photoMode; },
  get view() { return currentViewName; },
  resetView: resetInspectionView,
  setSheetShare,
  setReadingMode,
  get readingMode() { return readingMode; },
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
    get occlusion() { return occlusionPass; },
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
  targetTwist = 0,
  targetRestArch = 0
) {
  const flex = pagePivot.userData.flex;
  if (!flex) return;
  const settleImmediately = immediate || reducedMotion;
  const step = Math.min(delta, 0.033);
  let nextCurve = targetCurve;
  let nextTwist = targetTwist;
  let nextRestArch = targetRestArch;

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
    nextRestArch = THREE.MathUtils.damp(flex.restArch || 0, targetRestArch, 11, step);

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
    if (Math.abs(targetRestArch - nextRestArch) < 0.00005) {
      nextRestArch = targetRestArch;
    }
  }

  if (
    !settleImmediately
    && Math.abs(nextCurve - flex.curve) < 0.00001
    && Math.abs(targetCurve - nextCurve) < 0.00001
    && Math.abs(nextTwist - flex.twist) < 0.00001
    && Math.abs(targetTwist - nextTwist) < 0.00001
    && Math.abs(nextRestArch - (flex.restArch || 0)) < 0.00001
    && Math.abs(targetRestArch - nextRestArch) < 0.00001
  ) return;

  flex.curve = nextCurve;
  flex.twist = nextTwist;
  flex.restArch = nextRestArch;
  if (!settleImmediately) motion = true;

  // Precomputed basis + inline analytical normals (zero trig/pow, zero computeVertexNormals).
  for (let s = 0; s < flex.surfaces.length; s += 1) {
    const surface = flex.surfaces[s];
    const {
      position, normal, base, archBasis, dArchDu, restArchBasis, dRestArchDu,
      twistBasis, dTwistDu, dTwistDv
    } = surface;
    const posArr = position.array;
    const normArr = normal.array;
    const count = position.count;
    for (let v = 0; v < count; v += 1) {
      const o = v * 3;
      posArr[o + 2] = nextCurve * archBasis[v] + nextRestArch * restArchBasis[v] + nextTwist * twistBasis[v];
      const dzdx = nextCurve * dArchDu[v] + nextRestArch * dRestArchDu[v] + nextTwist * dTwistDu[v];
      const dzdy = nextTwist * dTwistDv[v] + nextCurve * archBasis[v] * 0.14;
      const invLen = 1 / Math.hypot(dzdx, dzdy, 1);
      normArr[o] = -dzdx * invLen;
      normArr[o + 1] = -dzdy * invLen;
      normArr[o + 2] = invLen;
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
    void base;
  }
}

function setPointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.clientX = event.clientX;
  pointer.clientY = event.clientY;
  pointer.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointerDirty = true;
}

const peekLocalScratch = new THREE.Vector3();

/** Single-pass detail hover evaluation (1 matrix update, 1 raycast). */
function updateHover() {
  pointerDirty = false;
  if (shelfDrag.active || document.querySelector("dialog[open]")) {
    setHovered(-1);
    return false;
  }
  if (mode === "detail" && activeBook) {
    setHovered(-1);
    activeBook.root.updateWorldMatrix(true, true);
    raycaster.setFromCamera(pointer.ndc, camera);
    if (readingOpen) {
      detailBookHovered = false;
      canvas.classList.remove("has-closed-book-hover");
      let side = 0;
      let overBook = pageDrag.active;
      if (!pageDrag.active) {
        const targets = currentSpread === 0
          ? [...activeBook.pageGestureSurfaces, activeBook.frontCover]
          : activeBook.pageGestureSurfaces;
        const hit = raycaster.intersectObjects(targets, false)[0];
        if (hit) {
          overBook = true;
          const obj = hit.object;
          if (activeBook.pageSurfaces.includes(obj)) {
            const pivot = obj.parent;
            if (pivot) {
              peekLocalScratch.copy(hit.point);
              pivot.worldToLocal(peekLocalScratch);
              const w = obj.scale.x || 1;
              const h = obj.scale.y || 1;
              if (peekLocalScratch.x / w >= 0.66) {
                pagePeek.tilt = clamp(peekLocalScratch.y / (h * 0.5), -1, 1);
                const turned = pivot.rotation.y < -Math.PI / 2;
                side = turned
                  ? (currentSpread > 0 ? -1 : 0)
                  : (currentSpread < spreadLimit() ? 1 : 0);
              }
            }
          }
        }
      }
      const changed = side !== pagePeek.side;
      if (changed) pagePeek.side = side;
      canvas.classList.toggle("has-page-hover", overBook);
      return changed || side !== 0;
    }
    const prevHover = detailBookHovered;
    detailBookHovered = raycaster.intersectObject(activeBook.frontCover, false).length > 0;
    canvas.classList.remove("has-page-hover");
    canvas.classList.toggle("has-closed-book-hover", detailBookHovered);
    return detailBookHovered !== prevHover || detailBookHovered;
  }
  detailBookHovered = false;
  canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  if (mode !== "hero") {
    setHovered(-1);
    return false;
  }
  const prev = hoveredIndex;
  const next = bookIndexAtPointer();
  setHovered(next);
  return next !== prev || next >= 0;
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
  controls.enabled = mode === "detail" && !readingMode;
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

/** Project the open spread width onto screen pixels so page drag tracks 1:1. */
function measurePageSpanPx() {
  if (!activeBook) return 220;
  const a = new THREE.Vector3(-activeBook.base.width * 0.5, 0, 0);
  const b = new THREE.Vector3(activeBook.base.width * 0.5, 0, 0);
  activeBook.root.updateWorldMatrix(true, true);
  activeBook.root.localToWorld(a).project(camera);
  activeBook.root.localToWorld(b).project(camera);
  // Full 180-degree turn travels roughly 1.55x one page's projected screen width.
  const pagePx = Math.abs(b.x - a.x) * 0.5 * viewWidth;
  return clamp(pagePx * 1.35, 110, 520);
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
  flushLeafQueue();
  printDeferredLeaf();
  pageDrag.active = true;
  pageDrag.pointerId = event.pointerId;
  pageDrag.startX = event.clientX;
  pageDrag.startY = event.clientY;
  pageDrag.spanPx = measurePageSpanPx();
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
  const span = pageDrag.spanPx || 220;

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
      ? clamp(Math.max(0, signedDistance) / (span * 0.85), 0, 1)
      : 0;
    pageDrag.peakProgress = Math.max(
      pageDrag.peakProgress,
      pageDrag.progress
    );
    updatePageDragMotion(event, deltaY);
    // Commit on crossing threshold OR a brisk flick; pulling back under 8% cancels naturally.
    pageDrag.committed = (pageDrag.progress >= commitProgress && pageDrag.progressVelocity > -0.6)
      || (pageDrag.progress >= 0.06 && pageDrag.progressVelocity > 1.35);
    return;
  }

  if (
    horizontalDistance < 3
    || horizontalDistance < Math.abs(deltaY) * 0.72
  ) {
    pageDrag.progress = 0;
  } else {
    if (pageDrag.direction === 0 && horizontalDistance >= 5) {
      const direction = deltaX < 0 ? 1 : -1;
      const directionAvailable = direction > 0
        ? currentSpread < spreadLimit()
        : currentSpread > 0;
      pageDrag.direction = directionAvailable ? direction : 0;
    }

    const signedDistance = pageDrag.direction > 0 ? -deltaX : deltaX;
    pageDrag.progress = pageDrag.direction !== 0
      ? clamp(Math.max(0, signedDistance) / span, 0, 1)
      : 0;
    pageDrag.peakProgress = Math.max(
      pageDrag.peakProgress,
      pageDrag.progress
    );
  }
  updatePageDragMotion(event, deltaY);
  pageDrag.committed = pageDrag.direction !== 0 && (
    (pageDrag.progress >= Math.max(PAGE_TURN_COMMIT_PROGRESS, 0.24) && pageDrag.progressVelocity > -0.6)
    || (pageDrag.progress >= 0.06 && pageDrag.progressVelocity > 1.4)
  );
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
  if (hoveredIndex >= 0) positionPointerLabel();
  // Avoid waking WebGL when moving over empty background; evaluate hover
  // cheaply and wake only if a hover target changed or is actively tracked.
  if (shelfDrag.active || shelfPan.active || pageDrag.active) return;
  const needsFrame = updateHover();
  if (hoveredIndex >= 0) positionPointerLabel();
  if (needsFrame) requestFrame();
}

function onPointerLeave() {
  pointer.ndc.set(3, 3);
  if (pagePeek.side) {
    pagePeek.side = 0;
    requestFrame();
  }
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

/** How far to widen the view, and slide it, to frame the open spread. */
function readingFrame() {
  if (!activeBook) return { zoom: 1, shift: 0 };
  const distance = Math.max(0.5, camera.position.distanceTo(activeBook.root.position));
  const worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const pixelsPerWorld = viewHeight / worldHeight;
  const shut = activeBook.base.width * activeBook.root.scale.x;
  const zoom = clamp((viewWidth * 0.94) / (shut * 2.08 * pixelsPerWorld), 0.5, 1);
  // The spread is centred on the spine, half a board left of the shut book.
  return { zoom, shift: -(shut * 0.5) * pixelsPerWorld * zoom };
}

const plainCamera = new THREE.PerspectiveCamera();
const spinePoint = new THREE.Vector3();

/**
 * Reading mode: the open spread as large as fits the whole screen, with its
 * spine at the centre. Works out where the spine falls with an unshifted,
 * unzoomed copy of the camera, then the zoom and the offset that centre it.
 */
function readingModeFrame() {
  if (!activeBook) return { zoom: 1, x: 0, y: 0 };
  const distance = Math.max(0.5, camera.position.distanceTo(activeBook.root.position));
  const worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const pixelsPerWorld = viewHeight / worldHeight;
  const scale = activeBook.root.scale.x;
  const spread = activeBook.base.width * scale * 2.08 * pixelsPerWorld;
  const tall = activeBook.base.height * scale * 1.1 * pixelsPerWorld;
  // Room to breathe round the spread: it should sit on the page, not fill it.
  const zoom = clamp(Math.min((viewWidth * 0.84) / spread, (viewHeight * 0.76) / tall), 0.5, 1.9);
  plainCamera.copy(camera);
  plainCamera.zoom = 1;
  plainCamera.clearViewOffset();
  activeBook.frontPivot.getWorldPosition(spinePoint).project(plainCamera);
  return { zoom, x: spinePoint.x * zoom * viewWidth * 0.5, y: -spinePoint.y * zoom * viewHeight * 0.5 };
}

function applyDetailViewOffset() {
  let zoom = 1;
  let shift = 0;
  let lift = 0;
  if (readingFit > 0) {
    const fit = readingFrame();
    zoom = lerp(1, fit.zoom, readingFit);
    shift = fit.shift * readingFit;
  }
  if (viewWidth < 820 && activeBook && sheetShown !== 0.5) {
    // Centre the book in the room above the sheet, and size it to that room.
    const room = Math.max(0.12, 1 - sheetShown);
    zoom *= clamp(room / 0.5, 0.42, 1.3);
    lift = (sheetShown - 0.5) * 0.5 * viewHeight;
  }
  let offset = currentViewOffsetX + shift;
  if (readingAmount > 0) {
    const full = readingModeFrame();
    const eased = smootherstep(readingAmount);
    zoom = lerp(zoom, full.zoom, eased);
    offset = lerp(offset, full.x, eased);
    lift = lerp(lift, full.y, eased);
  }
  if (photoAmount > 0) {
    const pe = smootherstep(photoAmount);
    offset = lerp(offset, 0, pe);
    if (viewWidth < 820 && activeBook) {
      // On narrow mobile screens, inspectCameraTarget sits below the book; project the book center
      // directly into the exact vertical center of the mobile viewfinder aperture above the photo dock.
      plainCamera.copy(camera);
      plainCamera.zoom = 1;
      plainCamera.clearViewOffset();
      activeBook.root.getWorldPosition(spinePoint).project(plainCamera);
      const photoZoom = readingOpen ? 0.78 : 0.96;
      const desiredScreenY = (viewHeight - 104) * 0.5;
      const currentScreenY = (1 - spinePoint.y * photoZoom) * 0.5 * viewHeight;
      const mobileLift = currentScreenY - desiredScreenY;
      zoom = lerp(zoom, photoZoom, pe);
      lift = lerp(lift, mobileLift, pe);
    } else {
      lift = lerp(lift, 0, pe);
    }
  }
  if (occlusionPass) occlusionPass.blendIntensity = AO_BLEND * (1 - 0.55 * smootherstep(readingAmount));
  camera.zoom = zoom;
  if (Math.abs(offset) < 0.5 && Math.abs(lift) < 0.5) {
    camera.clearViewOffset();
    return;
  }
  camera.setViewOffset(
    viewWidth,
    viewHeight,
    offset,
    lift,
    viewWidth,
    viewHeight
  );
}

/** The studio sheet's share of the screen height (phones). `immediate` while dragged. */
function setSheetShare(share, immediate = false) {
  sheetShare = clamp(share, 0.2, 0.95);
  if (immediate || reducedMotion) {
    sheetShown = sheetShare;
    applyDetailViewOffset();
  }
  requestFrame();
}

function updateReadingAmount(delta) {
  const want = readingMode && mode === "detail" ? 1 : 0;
  if (readingAmount === want) {
    // The camera may still be swinging round to face the pages (and has just
    // stopped, on the frame after): keep the spread centred.
    if (want && (cameraMotion || lastCameraMotion)) applyDetailViewOffset();
    lastCameraMotion = cameraMotion;
    return;
  }
  readingAmount = reducedMotion
    ? want
    : clamp(readingAmount + Math.sign(want - readingAmount) * (delta / readingDuration), 0, 1);
  applyDetailViewOffset();
  motion = true;
}

function updatePhotoAmount(delta) {
  const want = photoMode && mode === "detail" ? 1 : 0;
  if (photoAmount === want) return;
  photoAmount = reducedMotion
    ? want
    : clamp(photoAmount + Math.sign(want - photoAmount) * (delta / 0.42), 0, 1);
  applyDetailViewOffset();
  motion = true;
}

function setPhotoMode(on) {
  on = Boolean(on) && mode === "detail";
  if (on === photoMode) return;
  if (on && readingMode) setReadingMode(false, { restore: false });
  photoMode = on;
  experience.classList.toggle("is-photo", photoMode);
  cancelPageDrag();
  controls.enabled = mode === "detail" && !readingMode;
  if (photoMode) {
    focusView("photo_hero");
    announce(t("Photo Studio opened. Orbit freely or choose an angle, then capture."));
  } else {
    setPhotoBackdrop("match");
    focusView(readingOpen ? "pages" : "front");
  }
  emit("onPhotoMode", photoMode);
  requestFrame();
}

function setPhotoAngle(preset) {
  if (mode !== "detail") return;
  if (preset === "photo_spread") {
    if (!readingOpen) setReadingOpen(true, false);
  } else if (preset === "photo_front" || preset === "photo_spine") {
    if (readingOpen) setReadingOpen(false, false);
  }
  focusView(preset);
}

/*
 * Reading mode. The panel withdraws, the book opens if it was shut and turns
 * square to the reader, and the spread is framed on the whole screen. Pages
 * turn with the arrow keys, a tap on either side, a swipe, or a drag of the
 * page itself; the controls fade while the reader reads. Escape leaves.
 */
function setReadingMode(on, { restore = true } = {}) {
  on = Boolean(on) && mode === "detail";
  if (on === readingMode) return;
  if (on && photoMode) setPhotoMode(false);
  readingMode = on;
  experience.classList.toggle("is-reading", on);
  cancelPageDrag();
  controls.enabled = !on;
  if (on) {
    viewBeforeReading = currentViewName === "reading" ? "front" : currentViewName;
    openBeforeReading = readingOpen;
    if (!readingOpen) setReadingOpen(true, false);
    focusView("reading");
    readingDuration = viewTween.duration;
    announce(t("Reading. Use the arrow keys or tap either side to turn the page; Escape to leave."));
  } else {
    experience.classList.remove("is-quiet");
    if (restore && !openBeforeReading && readingOpen) setReadingOpen(false, false);
    focusView(viewBeforeReading);
    readingDuration = viewTween.duration;
  }
  rouse();
  emit("onReadingMode", on);
  requestFrame();
}

/** The reader moved: bring the controls back, and fade them again after a pause. */
function rouse() {
  clearTimeout(quietTimer);
  experience.classList.remove("is-quiet");
  if (readingMode) quietTimer = setTimeout(() => experience.classList.add("is-quiet"), 2600);
}

// A tap on either side of the screen turns the page; a swipe does too.
const readingTap = { pointerId: null, x: 0, y: 0, at: 0 };

function onReadingPointerDown(event) {
  rouse();
  if (!readingMode || event.target !== canvas || event.isPrimary === false) return;
  Object.assign(readingTap, { pointerId: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() });
}

function onReadingPointerUp(event) {
  if (!readingMode || readingTap.pointerId !== event.pointerId) return;
  readingTap.pointerId = null;
  // A page that was really dragged turns itself; a tap on a page is a tap.
  if (pageDrag.active && (pageDrag.committed || pageDrag.direction !== 0)) return;
  const dx = event.clientX - readingTap.x;
  const dy = event.clientY - readingTap.y;
  const quick = performance.now() - readingTap.at < 450;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4 && quick) {
    turnPage(dx < 0 ? 1 : -1);
  } else if (Math.hypot(dx, dy) < 8 && quick) {
    const side = event.clientX / viewWidth;
    if (side > 0.6) turnPage(1);
    else if (side < 0.4) turnPage(-1);
  }
}

function updateSheetShare(delta) {
  if (sheetShown === sheetShare) return;
  // Matches the sheet's own CSS transition (--duration-base, ease-out).
  sheetShown = damp(sheetShown, sheetShare, 11, delta);
  if (Math.abs(sheetShown - sheetShare) < 0.001) sheetShown = sheetShare;
  applyDetailViewOffset();
  motion = true;
}

function updateReadingFit(delta) {
  const want = viewWidth < 820 && activeBook && mode === "detail" ? getDetailOpenAmount() : 0;
  if (readingFit === want) return;
  readingFit = reducedMotion ? want : damp(readingFit, want, 6.5, delta);
  if (Math.abs(readingFit - want) < 0.002) readingFit = want;
  applyDetailViewOffset();
  motion = true;
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
  const plain = Boolean(SHELF_STYLES[room.shelf]?.plain);

  const woodMap = createWoodTexture(7, 1.65, Math.PI * 0.5);
  const darkWoodMap = woodMap?.clone() || null;
  const micro = createWoodMicroMaps(woodTextureImage, 7, 1.65, Math.PI * 0.5);

  if (darkWoodMap) {
    darkWoodMap.name = "editorial-walnut-dark";
    darkWoodMap.needsUpdate = true;
  }

  shared.walnut.userData.woodMap = woodMap;
  shared.walnut.userData.woodBump = micro.bump;
  shared.walnut.userData.woodRough = micro.roughness;
  shared.walnutDark.userData.woodMap = darkWoodMap;
  shared.walnutDark.userData.woodBump = micro.bump;
  shared.walnutDark.userData.woodRough = micro.roughness;

  shared.walnut.map = plain ? null : woodMap;
  shared.walnut.bumpMap = plain ? null : micro.bump;
  shared.walnut.bumpScale = 0.008;
  shared.walnut.roughnessMap = plain ? null : micro.roughness;
  shared.walnut.needsUpdate = true;

  shared.walnutDark.map = plain ? null : darkWoodMap;
  shared.walnutDark.bumpMap = plain ? null : micro.bump;
  shared.walnutDark.bumpScale = 0.007;
  shared.walnutDark.roughnessMap = plain ? null : micro.roughness;
  shared.walnutDark.needsUpdate = true;
  requestFrame();
}

/** Soft warm radial glow decal cast on the timber shelf under the night lamp. */
function createLampPoolTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  grad.addColorStop(0, "rgba(255,214,142,0.52)");
  grad.addColorStop(0.35, "rgba(255,186,104,0.26)");
  grad.addColorStop(0.72, "rgba(255,158,74,0.07)");
  grad.addColorStop(1, "rgba(255,140,56,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addRoom() {
  // Matte paper floor & seamless 360-degree studio cyclorama use MeshLambertMaterial:
  // skips all 5 RectAreaLight LTC lookups on 80%+ of screen pixels while soft
  // synced emissive bounce keeps gallery paper luminous and floor shadows delicate.
  const floor = createMesh(shared.plane, new THREE.MeshLambertMaterial({
    color: 0xd8c8aa,
    emissive: 0xd8c8aa,
    emissiveIntensity: 0.46
  }), "paper-floor", false, true);
  floor.scale.set(52, 52, 1);
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = -0.02;
  scene.add(floor);

  // Seamless wrap-around studio cyclorama wall (no visible vertical seam when orbiting to spine/back/edge).
  const wallGeo = new THREE.CylinderGeometry(22, 22, 24, 48, 1, true);
  const back = createMesh(wallGeo, new THREE.MeshLambertMaterial({
    color: 0xe9dfcb,
    emissive: 0xe9dfcb,
    emissiveIntensity: 0.4,
    side: THREE.BackSide
  }), "paper-backdrop", false, true);
  back.position.set(0, 9.5, 0);
  scene.add(back);

  // Handcrafted chamfered timber bookshelf (beveled edges catch soft grazing highlights).
  const shelf = createMesh(new RoundedBoxGeometry(17, 0.28, 1.08, 3, 0.022), shared.walnut, "walnut-shelf");
  shelf.position.set(0, 0.33, -0.03);
  shelfStage.add(shelf);

  const shelfLip = createMesh(new RoundedBoxGeometry(17.08, 0.08, 1.15, 3, 0.016), shared.walnutDark, "walnut-shelf-lip");
  shelfLip.position.set(0, 0.205, 0.02);
  shelfStage.add(shelfLip);

  const backRail = createMesh(new RoundedBoxGeometry(17, 0.17, 0.2, 2, 0.015), shared.walnut, "walnut-back-rail");
  backRail.position.set(0, 0.68, -0.52);
  shelfStage.add(backRail);

  const uprightGeo = new RoundedBoxGeometry(0.2, 3.8, 0.72, 2, 0.018);
  [-7.65, 7.65].forEach((x, index) => {
    const upright = createMesh(uprightGeo, shared.walnutDark, `shelf-upright-${index}`);
    upright.position.set(x, 2.05, -0.28);
    shelfStage.add(upright);
    roomFrame.push(upright);
  });
  roomFrame.push(backRail);

  const shadowStrip = createMesh(shared.plane, new THREE.MeshBasicMaterial({
    color: 0x2f1d13,
    alphaMap: getContactShadowTexture(),
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  }), "shelf-contact-shadow", false, false);
  shadowStrip.scale.set(16, 0.9, 1);
  shadowStrip.rotation.x = -Math.PI * 0.5;
  shadowStrip.position.set(0, 0.482, 0.06);
  shelfStage.add(shadowStrip);

  addLamp();

  roomMaterials.floor = floor.material;
  roomMaterials.wall = back.material;
  roomMeshes.floor = floor;
  roomMeshes.wall = back;
  roomMaterials.shelf = shared.walnut;
  roomMaterials.shelfDark = shared.walnutDark;
  roomMaterials.shadow = shadowStrip.material;
}

/**
 * A brass desk lamp standing at the left end of the shelf. Shown with the
 * night light (no light is added at runtime: that would recompile shaders).
 */
let lamp = null;
function addLamp() {
  const brass = new THREE.MeshStandardMaterial({ color: 0xc29852, metalness: 0.9, roughness: 0.26 });
  const shade = new THREE.MeshStandardMaterial({ color: 0x1e3024, roughness: 0.34, metalness: 0.28 });
  const shadeInside = new THREE.MeshStandardMaterial({
    color: 0xf7ebd0, roughness: 0.65, metalness: 0, side: THREE.BackSide,
    emissive: 0xffc070, emissiveIntensity: 0
  });
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff5dc });
  lamp = new THREE.Group();
  lamp.name = "night-lamp";
  const base = createMesh(new THREE.CylinderGeometry(0.195, 0.235, 0.044, 40), brass, "lamp-base");
  base.position.y = 0.022;
  const baseCollar = createMesh(new THREE.CylinderGeometry(0.055, 0.145, 0.036, 32), brass, "lamp-collar");
  baseCollar.position.y = 0.058;
  const stem = createMesh(new THREE.CylinderGeometry(0.015, 0.018, 1.25, 16), brass, "lamp-stem");
  stem.position.set(0.12, 0.64, 0);
  stem.rotation.z = -0.19;
  const arm = createMesh(new THREE.CylinderGeometry(0.013, 0.015, 0.62, 16), brass, "lamp-arm");
  arm.position.set(0.47, 1.27, 0.03);
  arm.rotation.z = -1.2;
  const joint = createMesh(new THREE.SphereGeometry(0.029, 16, 12), brass, "lamp-joint");
  joint.position.set(0.24, 1.25, 0);
  const hoodGeometry = new THREE.CylinderGeometry(0.062, 0.245, 0.31, 40, 1, true);
  const hood = createMesh(hoodGeometry, shade, "lamp-shade");
  hood.position.set(0.76, 1.12, 0.05);
  hood.rotation.z = 0.5;
  const hoodInside = createMesh(hoodGeometry, shadeInside, "lamp-shade-inside", false, false);
  hood.add(hoodInside);
  // Subtle rolled brass rim around the lip of the green enamel shade
  const shadeRim = createMesh(new THREE.TorusGeometry(0.244, 0.006, 10, 40), brass, "lamp-shade-rim", false, true);
  shadeRim.rotation.x = Math.PI * 0.5;
  shadeRim.position.y = -0.153;
  hood.add(shadeRim);
  const cap = createMesh(new THREE.SphereGeometry(0.064, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), brass, "lamp-cap");
  cap.position.set(0.684, 1.252, 0.05);
  cap.rotation.z = 0.5;
  const bulb = createMesh(new THREE.SphereGeometry(0.068, 20, 14), glow, "lamp-bulb", false, false);
  bulb.position.set(0.79, 1.06, 0.05);
  // Warm radial pool of lamplight cast onto the walnut shelf directly below the shade
  const pool = createMesh(shared.plane, new THREE.MeshBasicMaterial({
    map: createLampPoolTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.72
  }), "lamp-light-pool", false, false);
  pool.scale.set(2.8, 1.05, 1);
  pool.rotation.x = -Math.PI * 0.5;
  pool.position.set(1.15, 0.008, 0.08);
  pool.visible = false;

  lamp.add(base, baseCollar, stem, arm, joint, hood, cap, bulb, pool);
  lamp.position.set(-3.35, shelfBoardTop, -0.12);
  lamp.rotation.y = 0.25;
  lamp.visible = false;
  lamp.userData.shade = shadeInside;
  lamp.userData.pool = pool;
  shelfStage.add(lamp);
}

/** Tighten the directional shadow frustum around the single book in studio mode for sharper hardware shadows. */
function updateShadowFrustum(detail = false) {
  const key = roomLights.key;
  if (!key) return;
  if (detail) {
    key.target.position.copy(inspectPosition);
    key.position.set(inspectPosition.x - 3.6, inspectPosition.y + 5.4, inspectPosition.z + 4.4);
    key.shadow.camera.left = -3.6;
    key.shadow.camera.right = 3.6;
    key.shadow.camera.top = 3.6;
    key.shadow.camera.bottom = -3.6;
    key.shadow.camera.near = 1.2;
    key.shadow.camera.far = 16;
    key.shadow.radius = 5.0;
  } else {
    key.target.position.set(0, 1.4, 0);
    key.position.set(-4.6, 7.4, 5.8);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -1.5;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 18;
    key.shadow.radius = 3.5;
  }
  key.target.updateMatrixWorld();
  key.shadow.camera.updateProjectionMatrix();
  shadowHold = Math.max(shadowHold, 3);
}

function addLights() {
  roomLights.hemisphere = new THREE.HemisphereLight(0xfff8e8, 0x5b4030, 0.56);
  scene.add(roomLights.hemisphere);

  const key = new THREE.DirectionalLight(0xffe8c2, 1.42);
  key.name = "shadow-key";
  key.position.set(-4.6, 7.4, 5.8);
  key.target.position.set(0, 1.4, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(quality.shadow, quality.shadow);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -1.5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 18;
  key.shadow.bias = -0.00015;
  key.shadow.normalBias = 0.014;
  key.shadow.radius = 3.5;
  scene.add(key, key.target);
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

function syncCycloramaBounce() {
  const isNight = room.light === "night";
  if (roomMaterials.floor) {
    roomMaterials.floor.emissive.copy(roomMaterials.floor.color);
    roomMaterials.floor.emissiveIntensity = isNight ? 0.16 : 0.46;
  }
  if (roomMaterials.wall) {
    roomMaterials.wall.emissive.copy(roomMaterials.wall.color);
    roomMaterials.wall.emissiveIntensity = isNight ? 0.14 : 0.4;
  }
}

function setThemeColorsImmediately() {
  roomMaterials.floor?.color.copy(themeTargets.floor);
  roomMaterials.wall?.color.copy(themeTargets.wall);
  syncCycloramaBounce();
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
  syncCycloramaBounce();
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
    // A book in a slipcase slides out of it first; ribbon releases smoothly from the shelf.
    activeBook.setCase(1 - clamp(transitionTime / 0.35, 0, 1));
    activeBook.setRibbonShelfRest?.(1 - smootherstep(clamp(transitionTime / 0.55, 0, 1)));
    updatePaginatedBook(activeBook, delta, 0);
    if (transitionTime >= 1) finishOpening();
  } else if (mode === "closing") {
    transitionTime = Math.min(
      1,
      transitionTime + delta / SHELF_TRANSITION_DURATION
    );
    applyClosingPose(transitionTime);
    // ...and slides back in as it lands; ribbon lays gracefully onto the shelf board.
    activeBook.setCase(clamp((transitionTime - 0.65) / 0.35, 0, 1));
    activeBook.setRibbonShelfRest?.(smootherstep(clamp((transitionTime - 0.45) / 0.55, 0, 1)));
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
