// The hardcover rig: boards, spine, hinges, endpapers, page block, flexible
// leaves, headbands, ribbon, foil layers and contact shadow.
// Construction follows The Complete Shelf; what changed is that every surface
// is now driven by a BookSpec and can be repainted in place while editing.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BOOK_FORMAT, bookPalette } from "../state/schema.js";
import { perf } from "../perf.js";
import { clamp } from "../util.js";
import {
  FACE_SIZE,
  endpaperSignature,
  faceSignatures,
  paintBack,
  paintEndpaper,
  paintFront,
  paintSpine,
  setFastGrain
} from "../textures/faces.js";
import { createPaintTexture } from "../textures/gl.js";
import { PAGE_SIZE, pageSignature, paintPage } from "../textures/pages.js";
import {
  getContactShadowTexture,
  getHeadbandTexture,
  getMaterialMaps,
  getPageEdgeTextures,
  getPaperFaceTexture
} from "../textures/surface.js";

export const PRINTED_LEAVES = 4;
/** Pointer hit volumes are raycast only, never rendered. */
export const HIT_LAYER = 1;
export const FLEXIBLE_PAGE_SEGMENTS = 18;
export const FLEXIBLE_PAGE_VERTICAL_SEGMENTS = 8;

const BLANK_LEAVES = 2;
/** Texture scale used for boards while a control is being dragged. */
const DRAFT_SCALE = 1;
const DRAFT_SCALE_MANY = 0.75;

const shared = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
  geometry: null
};

export function createMesh(geometry, material, name, cast = true, receive = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function createRoundedPlaneGeometry(width, height, radius) {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const corner = Math.min(radius, halfWidth, halfHeight);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + corner, -halfHeight);
  shape.lineTo(halfWidth - corner, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + corner);
  shape.lineTo(halfWidth, halfHeight - corner);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - corner, halfHeight);
  shape.lineTo(-halfWidth + corner, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - corner);
  shape.lineTo(-halfWidth, -halfHeight + corner);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + corner, -halfHeight);

  const geometry = new THREE.ShapeGeometry(shape, 8);
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    uv[index * 2] = (position.getX(index) + halfWidth) / width;
    uv[index * 2 + 1] = (position.getY(index) + halfHeight) / height;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function createPageBlockGeometry(width, height, depth, radius) {
  const geometry = new RoundedBoxGeometry(width, height, depth, 4, radius);
  const position = geometry.getAttribute("position");
  const halfWidth = width * 0.5;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const normalizedX = clamp((x + halfWidth) / width, 0, 1);
    const gutterProgress = clamp(normalizedX / 0.16, 0, 1);
    const gutterEase = gutterProgress * gutterProgress * (3 - 2 * gutterProgress);
    const gutterCompression = (1 - gutterEase) * 0.012;
    const foreEdgeCharacter = Math.pow(normalizedX, 8) * Math.sin(position.getY(index) * 31) * 0.00055;
    position.setZ(index, Math.sign(z || 1) * Math.max(0, Math.abs(z) - gutterCompression + foreEdgeCharacter));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A rounded spine: a shallow arc across the thickness of the book, extruded
 * along its height. `x = 0` is where the arc meets the boards and the curve
 * swells towards -x. With `shell` the piece has thickness and end caps;
 * without, it is just the outer skin (used for the foil layer).
 */
function createSpineGeometry(span, height, bulge, thickness, shell = true, segments = 20) {
  const positions = [];
  const uvs = [];
  const half = height * 0.5;
  const arc = (index) => {
    const t = index / segments;
    const z = (t - 0.5) * span;
    const k = (2 * z) / span;
    return { t, z, x: -bulge * (1 - k * k) };
  };
  const quad = (a, b, c, d, uvA, uvB, uvC, uvD) => {
    positions.push(...a, ...b, ...c, ...b, ...d, ...c);
    uvs.push(...uvA, ...uvB, ...uvC, ...uvB, ...uvD, ...uvC);
  };
  const edge = [0.03, 0.5];
  for (let index = 0; index < segments; index += 1) {
    const p = arc(index);
    const q = arc(index + 1);
    // Outer skin, facing away from the book.
    quad(
      [p.x, -half, p.z], [q.x, -half, q.z], [p.x, half, p.z], [q.x, half, q.z],
      [p.t, 0], [q.t, 0], [p.t, 1], [q.t, 1]
    );
    if (!shell) continue;
    const pi = p.x + thickness;
    const qi = q.x + thickness;
    // Inner skin, then the head and tail caps.
    quad([qi, -half, q.z], [pi, -half, p.z], [qi, half, q.z], [pi, half, p.z], edge, edge, edge, edge);
    quad([p.x, half, p.z], [q.x, half, q.z], [pi, half, p.z], [qi, half, q.z], edge, edge, edge, edge);
    quad([q.x, -half, q.z], [p.x, -half, p.z], [qi, -half, q.z], [pi, -half, p.z], edge, edge, edge, edge);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  // Smooth the shading across the arc: facets share no vertices, so set the
  // outer normals analytically from the curve.
  if (!shell) {
    const normal = geometry.getAttribute("normal");
    const position = geometry.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) {
      const k = (2 * position.getZ(index)) / span;
      const slope = (4 * bulge * k) / span;
      const length = Math.hypot(1, slope);
      normal.setXYZ(index, -1 / length, 0, -slope / length);
    }
  } else {
    const normal = geometry.getAttribute("normal");
    const position = geometry.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) {
      if (Math.abs(normal.getY(index)) > 0.5) continue;
      const k = (2 * position.getZ(index)) / span;
      const slope = (4 * bulge * k) / span;
      const length = Math.hypot(1, slope);
      const sign = normal.getX(index) < 0 ? 1 : -1;
      normal.setXYZ(index, (-1 / length) * sign, 0, (-slope / length) * sign);
    }
  }
  return geometry;
}

// One trim size for every book, so the heavy geometry is built once and shared.
const DIM = (() => {
  const { width, height, depth } = BOOK_FORMAT;
  const board = 0.032;
  const spineWidth = 0.082;
  return {
    width,
    height,
    depth,
    board,
    coverRadius: 0.0045,
    pageRadius: 0.0025,
    spineRadius: 0.0015,
    spineBoardThickness: 0.014,
    spineBulge: 0.024,
    spineWidth,
    pageWidth: width - 0.074,
    pageHeight: height - 0.068,
    pageDepth: depth - 0.026
  };
})();

function sharedGeometry() {
  if (shared.geometry) return shared.geometry;
  const d = DIM;
  shared.geometry = {
    cover: new RoundedBoxGeometry(d.width, d.height, d.board, 2, d.coverRadius),
    pageBlock: createPageBlockGeometry(d.pageWidth, d.pageHeight, d.pageDepth, d.pageRadius),
    coverSurface: createRoundedPlaneGeometry(d.width - 0.007, d.height - 0.007, 0.0035),
    endpaper: createRoundedPlaneGeometry(d.width - 0.045, d.height - 0.045, 0.003),
    spine: createSpineGeometry(d.depth + d.board * 1.94, d.height - 0.008, d.spineBulge, d.spineBoardThickness, true),
    spineFoil: createSpineGeometry(d.depth + d.board * 1.94, d.height - 0.008, d.spineBulge, 0, false),
    spineLining: new RoundedBoxGeometry(d.spineWidth * 0.68, d.height - 0.056, Math.max(0.045, d.pageDepth - 0.008), 1, 0.0015),
    headband: new THREE.CylinderGeometry(0.012, 0.012, d.pageDepth * 0.88, 12, 1, false),
    ribbon: createRoundedPlaneGeometry(0.034, d.pageHeight * 0.76, 0.002)
  };
  return shared.geometry;
}

function addTurnIns(pivot, side, insideZ, material) {
  const { width, height } = DIM;
  const stripDepth = 0.002;
  const border = 0.018;
  const longWidth = width - border * 0.7;
  const longHeight = height - border * 2.2;
  [
    ["head", width * 0.5, height * 0.5 - border * 0.56, longWidth, border],
    ["tail", width * 0.5, -height * 0.5 + border * 0.56, longWidth, border],
    ["spine", border * 0.56, 0, border, longHeight],
    ["fore", width - border * 0.56, 0, border, longHeight]
  ].forEach(([edge, x, y, stripWidth, stripHeight]) => {
    const strip = createMesh(shared.box, material, `${side}-turn-in-${edge}`, false, true);
    strip.scale.set(stripWidth, stripHeight, stripDepth);
    strip.position.set(x, y, insideZ);
    pivot.add(strip);
  });
}

const physical = (parameters) => new THREE.MeshPhysicalMaterial({ transparent: true, ...parameters });

// Stamping depth. The painted boards carry a cloth normal map, and Three
// ignores a bump map once a normal map is set, so the relief layer is added
// on top of the normal map here. Every board shares one shader program; the
// relief texture and depth are per material.
const RELIEF_PARS = `
uniform sampler2D reliefMap;
uniform float reliefScale;
vec3 reliefNormal( vec3 surfPos, vec3 surfNorm, vec2 uv, float faceDir ) {
  vec2 du = dFdx( uv );
  vec2 dv = dFdy( uv );
  float h = texture2D( reliefMap, uv ).x;
  float bx = reliefScale * ( texture2D( reliefMap, uv + du ).x - h );
  float by = reliefScale * ( texture2D( reliefMap, uv + dv ).x - h );
  vec3 sx = normalize( dFdx( surfPos ) );
  vec3 sy = normalize( dFdy( surfPos ) );
  vec3 r1 = cross( sy, surfNorm );
  vec3 r2 = cross( surfNorm, sx );
  float det = dot( sx, r1 ) * faceDir;
  vec3 grad = sign( det ) * ( bx * r1 + by * r2 );
  return normalize( abs( det ) * surfNorm - grad );
}
`;

function compileRelief(shader) {
  shader.uniforms.reliefMap = this.userData.relief.map;
  shader.uniforms.reliefScale = this.userData.relief.scale;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <bumpmap_pars_fragment>", `#include <bumpmap_pars_fragment>\n${RELIEF_PARS}`)
    .replace(
      "#include <normal_fragment_maps>",
      "#include <normal_fragment_maps>\nif ( reliefScale != 0.0 ) normal = reliefNormal( - vViewPosition, normal, vMapUv, faceDirection );"
    );
}

function withRelief(material) {
  material.userData.relief = { map: { value: null }, scale: { value: 0 } };
  material.onBeforeCompile = compileRelief;
  return material;
}

// Height of a full stamp at depth 1. The height map steps over a texel or two,
// so it needs a much larger scale than a soft bump map.
const RELIEF_STRENGTH = 12;

/**
 * Build a complete book from a spec.
 * `resolution` scales every painted texture (1 = 768 px wide covers).
 */
export function createBookRig(book, { resolution = 0.75, onAsset = () => {}, lazy = false } = {}) {
  const d = DIM;
  const g = sharedGeometry();
  const root = new THREE.Group();
  root.name = `book-${book.id}`;
  const motion = new THREE.Group();
  motion.name = "book-motion";
  root.add(motion);

  /* ----- paint targets ----- */
  let scale = resolution;
  const sized = (face, s = scale) => [FACE_SIZE[face].width * s, FACE_SIZE[face].height * s];
  const targets = {
    front: createPaintTexture(...sized("front")),
    frontFoil: createPaintTexture(...sized("front")),
    spine: createPaintTexture(...sized("spine")),
    spineFoil: createPaintTexture(...sized("spine")),
    back: createPaintTexture(...sized("back")),
    backFoil: createPaintTexture(...sized("back")),
    endpaper: createPaintTexture(384, 576)
  };
  const stampDepth = () => clamp(rig.data.stamp?.depth ?? 0.5, 0, 1);
  const stampSign = () => (rig.data.stamp?.relief === "deboss" ? -1 : 1);
  const onlayShown = () => Boolean(rig.data.front.onlay?.show);
  const reliefOn = () => ((rig.data.stamp?.relief ?? "flat") !== "flat" && stampDepth() > 0) || onlayShown();
  // Relief maps are made only for books that use them, at half size: a
  // height map needs less detail than the picture on top of it.
  const reliefTarget = (face, wanted) => {
    const key = `${face}Relief`;
    const [width, height] = sized(face, wanted * 0.5);
    if (!targets[key]) targets[key] = createPaintTexture(width, height, { color: false, anisotropy: 4 });
    else targets[key].resize(width, height);
    return targets[key];
  };
  const paperFace = getPaperFaceTexture(book.interior.paper);
  const edges = getPageEdgeTextures();

  /* ----- materials ----- */
  const cloth = physical({ color: book.material.color });
  const coverArt = withRelief(physical({ map: targets.front.texture }));
  const spineArt = withRelief(physical({ map: targets.spine.texture, side: THREE.DoubleSide }));
  const backArt = withRelief(physical({ map: targets.back.texture, side: THREE.DoubleSide }));
  const artFor = { front: coverArt, spine: spineArt, back: backArt };
  const foilParameters = (target, side) => ({
    map: target.texture,
    bumpMap: target.texture,
    bumpScale: 0.016,
    clearcoat: 0.18,
    clearcoatRoughness: 0.12,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side
  });
  const foilArt = physical(foilParameters(targets.frontFoil, THREE.FrontSide));
  const spineFoilArt = physical(foilParameters(targets.spineFoil, THREE.DoubleSide));
  const backFoilArt = physical(foilParameters(targets.backFoil, THREE.DoubleSide));
  const endpaperMaterial = physical({
    map: targets.endpaper.texture, bumpMap: paperFace, bumpScale: 0.0018,
    roughness: 0.94, metalness: 0, sheen: 0.025, sheenRoughness: 1, side: THREE.DoubleSide
  });
  const foreEdgeMaterial = physical({
    map: edges.fore, bumpMap: edges.fore, bumpScale: 0.0022, side: THREE.DoubleSide
  });
  const headTailEdgeMaterial = physical({
    map: edges.headTail, bumpMap: edges.headTail, bumpScale: 0.0015, side: THREE.DoubleSide
  });
  const grooveMaterial = physical({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const pageMaterial = physical({
    color: 0xe7dfcf, map: paperFace, bumpMap: paperFace, bumpScale: 0.0014,
    roughness: 0.95, metalness: 0, sheen: 0.025, sheenRoughness: 1
  });
  const headbandMaterial = physical({ roughness: 0.58, metalness: 0.16, sheen: 0.14, sheenRoughness: 0.76 });
  const signatureMaterial = physical({ color: 0xb5aa97, roughness: 0.98, metalness: 0 });
  const ribbonMaterial = physical({
    roughness: 0.62, metalness: 0.08, sheen: 0.36, sheenRoughness: 0.68, side: THREE.DoubleSide
  });
  const sheetMaterial = () => physical({
    color: 0xeee6d7, map: paperFace, bumpMap: paperFace, bumpScale: 0.0012,
    roughness: 0.96, metalness: 0, sheen: 0.02, sheenRoughness: 1, side: THREE.FrontSide
  });

  /* ----- page block and boards ----- */
  const pageBlock = createMesh(g.pageBlock, pageMaterial, "page-block");
  pageBlock.position.x = 0.018;
  motion.add(pageBlock);

  const backPivot = new THREE.Group();
  backPivot.name = "back-cover-pivot";
  backPivot.position.set(-d.width * 0.5, 0, -d.depth * 0.5 - d.board * 0.5);
  const backCover = createMesh(g.cover, cloth, "back-cover");
  backCover.position.x = d.width * 0.5;
  backPivot.add(backCover);
  const backPlane = createMesh(g.coverSurface, backArt, "back-cover-art", false, false);
  backPlane.position.set(d.width * 0.5, 0, -d.board * 0.55);
  backPlane.rotation.y = Math.PI;
  backPivot.add(backPlane);
  const backFoilPlane = createMesh(g.coverSurface, backFoilArt, "back-foil-art", false, false);
  backFoilPlane.position.set(d.width * 0.5, 0, -d.board * 0.605);
  backFoilPlane.rotation.y = Math.PI;
  backPivot.add(backFoilPlane);
  const backEndpaper = createMesh(g.endpaper, endpaperMaterial, "back-endpaper", false, true);
  backEndpaper.position.set(d.width * 0.5, 0, d.board * 0.515);
  backPivot.add(backEndpaper);
  addTurnIns(backPivot, "back", d.board * 0.53, cloth);
  const backGroove = createMesh(shared.plane, grooveMaterial, "back-hinge-groove", false, false);
  backGroove.scale.set(0.012, d.height * 0.94, 1);
  backGroove.position.set(0.038, 0, -d.board * 0.535);
  backGroove.rotation.y = Math.PI;
  backPivot.add(backGroove);
  motion.add(backPivot);

  const frontPivot = new THREE.Group();
  frontPivot.name = "front-cover-pivot";
  frontPivot.position.set(-d.width * 0.5, 0, d.depth * 0.5 + d.board * 0.5);
  const frontCover = createMesh(g.cover, cloth, "front-cover");
  frontCover.position.x = d.width * 0.5;
  frontPivot.add(frontCover);
  const coverPlane = createMesh(g.coverSurface, coverArt, "cover-art", false, false);
  coverPlane.position.set(d.width * 0.5, 0, d.board * 0.55);
  frontPivot.add(coverPlane);
  const foilPlane = createMesh(g.coverSurface, foilArt, "foil-art", false, false);
  foilPlane.position.set(d.width * 0.5, 0, d.board * 0.605);
  frontPivot.add(foilPlane);
  const frontEndpaper = createMesh(g.endpaper, endpaperMaterial, "front-endpaper", false, true);
  frontEndpaper.position.set(d.width * 0.5, 0, -d.board * 0.515);
  frontEndpaper.rotation.y = Math.PI;
  frontPivot.add(frontEndpaper);
  addTurnIns(frontPivot, "front", -d.board * 0.53, cloth);
  const frontGroove = createMesh(shared.plane, grooveMaterial, "front-hinge-groove", false, false);
  frontGroove.scale.set(0.012, d.height * 0.94, 1);
  frontGroove.position.set(0.038, 0, d.board * 0.655);
  frontPivot.add(frontGroove);
  motion.add(frontPivot);

  /* ----- leaves ----- */
  // `leaves` is ordered top to bottom of the closed stack. The first
  // PRINTED_LEAVES carry pages and are recycled as the reader moves through
  // a long book; the rest are blank sheets that give the block its body.
  const leaves = [];
  const pageSurfaces = [];
  const sheetMaterials = [];
  const visiblePageWidth = d.pageWidth - d.spineWidth * 0.42;
  for (let order = 0; order < PRINTED_LEAVES + BLANK_LEAVES; order += 1) {
    const pivot = new THREE.Group();
    pivot.name = `leaf-${order}`;
    const faces = [1, -1].map((direction) => {
      const geometry = new THREE.PlaneGeometry(1, 1, FLEXIBLE_PAGE_SEGMENTS, FLEXIBLE_PAGE_VERTICAL_SEGMENTS);
      const material = sheetMaterial();
      sheetMaterials.push(material);
      const mesh = createMesh(geometry, material, `leaf-${order}-${direction > 0 ? "front" : "back"}`, false, true);
      mesh.scale.set(visiblePageWidth, d.pageHeight - 0.014, 1);
      mesh.position.set(visiblePageWidth * 0.5, 0, 0.00022 * direction);
      if (direction < 0) mesh.rotation.y = Math.PI;
      pivot.add(mesh);
      pageSurfaces.push(mesh);
      return {
        mesh,
        material,
        target: null,
        surface: {
          geometry,
          position: geometry.attributes.position,
          base: Float32Array.from(geometry.attributes.position.array),
          direction
        }
      };
    });
    pivot.userData.faces = faces;
    pivot.userData.printed = order < PRINTED_LEAVES;
    pivot.userData.flex = {
      curve: 0,
      curveVelocity: 0,
      twist: 0,
      twistVelocity: 0,
      surfaces: faces.map((face) => face.surface)
    };
    motion.add(pivot);
    leaves.push(pivot);
  }

  /** Stack heights depend on a leaf's place in the pile; call after reordering. */
  function assignLeafSlots() {
    const count = leaves.length;
    leaves.forEach((pivot, order) => {
      const stackIndex = count - 1 - order;
      pivot.userData.order = order;
      pivot.userData.restZ = d.pageDepth * 0.5 + 0.0015 + stackIndex * 0.0015;
      pivot.userData.turnedZ = d.depth * 0.5 + d.board + 0.004 + order * 0.0015;
      pivot.position.x = -d.width * 0.5 + d.spineWidth * 0.65;
    });
  }
  assignLeafSlots();
  leaves.forEach((pivot) => { pivot.position.z = pivot.userData.restZ; });

  /* ----- spine, headbands, ribbon, edges ----- */
  const spine = createMesh(g.spine, spineArt, "rounded-spine");
  spine.position.x = -d.width * 0.5 - 0.003;
  motion.add(spine);
  const spineFoil = createMesh(g.spineFoil, spineFoilArt, "spine-foil", false, false);
  spineFoil.position.x = spine.position.x - 0.0007;
  motion.add(spineFoil);
  const spineLining = createMesh(g.spineLining, endpaperMaterial, "spine-lining");
  spineLining.position.set(-d.width * 0.5 + d.spineWidth * 0.38, 0, 0);
  motion.add(spineLining);

  [-1, 1].forEach((direction) => {
    const headband = createMesh(g.headband, headbandMaterial, `headband-${direction}`);
    headband.rotation.x = Math.PI * 0.5;
    headband.position.set(-d.pageWidth * 0.5 + 0.046, direction * (d.pageHeight * 0.5 - 0.004), 0);
    motion.add(headband);
  });

  const ribbon = createMesh(g.ribbon, ribbonMaterial, "ribbon-bookmark", false, true);
  ribbon.position.set(
    -d.pageWidth * 0.5 + 0.09 + (book.seed % 3) * 0.018,
    -d.pageHeight * 0.17,
    d.pageDepth * 0.5 + 0.003
  );
  ribbon.rotation.z = (book.seed % 2 ? -1 : 1) * 0.014;
  motion.add(ribbon);
  const secondRibbonMaterial = ribbonMaterial.clone();
  const secondRibbon = createMesh(g.ribbon, secondRibbonMaterial, "ribbon-bookmark-2", false, true);
  secondRibbon.position.set(ribbon.position.x + 0.058, ribbon.position.y - 0.03, ribbon.position.z + 0.0006);
  secondRibbon.rotation.z = -ribbon.rotation.z * 1.6;
  motion.add(secondRibbon);

  for (let index = 0; index < 6; index += 1) {
    const signature = createMesh(shared.box, signatureMaterial, `page-signature-${index + 1}`, false, true);
    signature.scale.set(0.0035, 0.00135, d.pageDepth * 0.91);
    signature.position.set(
      0.018 + d.pageWidth * 0.5 + 0.001,
      -d.pageHeight * 0.5 + ((index + 1) / 7) * d.pageHeight,
      0
    );
    motion.add(signature);
  }

  const foreEdge = createMesh(shared.plane, foreEdgeMaterial, "fore-edge", false, true);
  foreEdge.scale.set(d.pageDepth * 0.94, d.pageHeight - 0.028, 1);
  foreEdge.rotation.y = Math.PI * 0.5;
  foreEdge.position.set(0.018 + d.pageWidth * 0.5 + 0.002, 0, 0);
  motion.add(foreEdge);
  [-1, 1].forEach((direction) => {
    const edge = createMesh(shared.plane, headTailEdgeMaterial, direction > 0 ? "head-edge" : "tail-edge", false, true);
    edge.scale.set(d.pageWidth - 0.035, d.pageDepth * 0.94, 1);
    edge.rotation.x = direction > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    edge.position.set(0.018, direction * (d.pageHeight * 0.5 + 0.002), 0);
    motion.add(edge);
  });

  /* ----- hit target and contact shadow ----- */
  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const hit = createMesh(shared.box, hitMaterial, "hit-target", false, false);
  hit.scale.set(d.width * 1.34, d.height * 1.2, Math.max(d.depth * 4, 1));
  hit.position.set(-d.spineWidth * 0.18, 0, 0.12);
  hit.layers.set(HIT_LAYER);
  motion.add(hit);

  const contactShadowMaterial = new THREE.MeshBasicMaterial({
    alphaMap: getContactShadowTexture(),
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const contactShadow = createMesh(shared.plane, contactShadowMaterial, "contact-shadow", false, false);
  contactShadow.scale.set(d.width * 1.22, d.depth * 2.05, 1);
  contactShadow.rotation.x = -Math.PI * 0.5;
  contactShadow.position.set(0, -d.height * 0.5 - 0.022, 0.025);
  root.add(contactShadow);

  const fadeMaterials = [
    cloth, coverArt, foilArt, spineArt, spineFoilArt, backArt, backFoilArt,
    endpaperMaterial, foreEdgeMaterial, headTailEdgeMaterial, grooveMaterial,
    pageMaterial, ...sheetMaterials, headbandMaterial, signatureMaterial, ribbonMaterial,
    secondRibbonMaterial
  ];

  /* ----- look: everything that is a material parameter rather than paint ----- */
  let lookReady = false;
  function applyLook() {
    const spec = rig.data;
    const maps = getMaterialMaps(spec.material.kind);
    const look = maps.look;
    const foilColor = new THREE.Color(spec.foil.color);
    const sheenColor = look.sheenFromFoil
      ? foilColor
      : new THREE.Color(spec.material.color).lerp(new THREE.Color(0xffffff), 0.42);

    [cloth, coverArt, spineArt, backArt].forEach((material) => {
      material.normalMap = maps.normal;
      material.normalScale.setScalar(material === cloth ? look.normal : look.normal * 0.86);
      material.roughnessMap = maps.roughness;
      material.roughness = look.roughness;
      material.metalness = look.metalness;
      material.sheen = look.sheen;
      material.sheenRoughness = look.sheenRoughness;
      material.sheenColor.copy(sheenColor);
      material.clearcoat = look.clearcoat;
      material.clearcoatRoughness = look.clearcoatRoughness;
      // Adding maps for the first time changes the shader program.
      if (!lookReady) material.needsUpdate = true;
    });
    lookReady = true;
    cloth.color.set(spec.material.color);
    const twoTone = spec.material.binding === "quarter" || spec.material.binding === "half";
    grooveMaterial.color.set(twoTone ? spec.material.second : spec.material.color).multiplyScalar(0.42);

    [foilArt, spineFoilArt, backFoilArt].forEach((material) => {
      material.color.copy(foilColor);
      material.metalness = spec.foil.metalness;
      material.roughness = spec.foil.roughness;
      // Pigment foils sit flat; metallic foils are pressed deeper. Debossed
      // foil sits below the board, embossed foil stands above it.
      const metallic = spec.foil.metalness > 0.5;
      const texture = spec.foil.texture || "polished";
      material.bumpScale = (metallic ? 0.017 : 0.008) * stampDepth() * 2 * stampSign();
      material.roughness = Math.min(1, spec.foil.roughness + (texture === "matte" ? 0.34 : texture === "brushed" ? 0.06 : 0));
      material.clearcoat = texture === "matte" ? 0 : metallic ? 0.18 : 0.04;
      // Leaf catches more of the room than cloth does, and never goes fully
      // dark when it faces away from the lights.
      material.envMapIntensity = (metallic ? 2.1 : 1) * (texture === "matte" ? 0.62 : 1);
      // Rolled leaf has a faint grain that stretches its highlights.
      const anisotropy = texture === "matte" ? 0 : texture === "brushed" ? 0.9 : metallic ? 0.34 : 0;
      if ((material.anisotropy > 0) !== (anisotropy > 0)) material.needsUpdate = true;
      material.anisotropy = anisotropy;
      material.emissive.copy(foilColor);
      material.emissiveIntensity = metallic ? 0.2 : 0.06;
      // Holographic and pearl foils: thin-film colour that shifts with the view.
      const iridescence = spec.foil.iridescence || 0;
      if ((material.iridescence > 0) !== (iridescence > 0)) material.needsUpdate = true;
      material.iridescence = iridescence;
      material.iridescenceIOR = 1.9;
      material.iridescenceThicknessRange = [180, 620];
      if (iridescence > 0) material.emissiveIntensity *= 1 - iridescence * 0.7;
      material.userData.rest = { emissive: material.emissiveIntensity, environment: material.envMapIntensity };
    });
    if (glint > 0) setGlint(glint);

    // A laid-on piece of leather always stands proud, even on a flat book.
    const reliefScale = reliefOn() ? Math.max(stampDepth(), onlayShown() ? 0.4 : 0) * RELIEF_STRENGTH : 0;
    Object.entries(artFor).forEach(([face, material]) => {
      const target = targets[`${face}Relief`];
      material.userData.relief.map.value = target ? target.texture : null;
      material.userData.relief.scale.value = target && !shown[face].reliefStale ? reliefScale : 0;
    });

    const edge = spec.details.edge;
    const baked = edge.style === "sprinkled" || edge.style === "ombre";
    const edgeMaps = getPageEdgeTextures(baked ? edge.style : "plain", edge.color);
    foreEdgeMaterial.map = edgeMaps.fore;
    headTailEdgeMaterial.map = edgeMaps.headTail;
    [foreEdgeMaterial, headTailEdgeMaterial].forEach((material) => {
      if (edge.style === "gilt") {
        material.color.set(edge.color || "#d9b25f");
        material.metalness = 0.92;
        material.roughness = 0.34;
        material.sheen = 0;
      } else if (edge.style === "tinted") {
        material.color.set(edge.color || "#c6532f");
        material.metalness = 0;
        material.roughness = 0.9;
        material.sheen = 0.02;
      } else {
        material.color.set(0xffffff);
        material.metalness = 0;
        material.roughness = 0.93;
        material.sheen = 0.018;
      }
    });

    ribbon.visible = spec.details.ribbon.show !== false;
    ribbonMaterial.color.set(spec.details.ribbon.color);
    secondRibbon.visible = ribbon.visible && Boolean(spec.details.ribbon.double);
    secondRibbonMaterial.color.set(spec.details.ribbon.second || spec.details.ribbon.color);
    const headband = spec.details.headband;
    const stripes = headband.striped ? getHeadbandTexture(headband.color, headband.second || "#f3ece0") : null;
    if (Boolean(headbandMaterial.map) !== Boolean(stripes)) headbandMaterial.needsUpdate = true;
    headbandMaterial.map = stripes;
    if (stripes) headbandMaterial.color.set(0xffffff);
    else headbandMaterial.color.set(headband.color);
    contactShadowMaterial.color.set(bookPalette(spec).shelfDark);

    const stock = getPaperFaceTexture(spec.interior.paper);
    [pageMaterial, ...sheetMaterials].forEach((material) => {
      if (material.map === rig.paperFace) material.map = stock;
      material.bumpMap = stock;
    });
    endpaperMaterial.bumpMap = stock;
    rig.paperFace = stock;
  }

  const PAINTERS = { front: paintFront, spine: paintSpine, back: paintBack };
  // What each board currently shows: content signatures per layer and the
  // texture scale it was painted at.
  const shown = { front: {}, spine: {}, back: {}, endpaper: {} };

  /** Paint one board if needed. Returns true if it still owes a full-size pass. */
  function repaintFace(face, signature, { force, draft, draftScale, hidden }) {
    const state = shown[face];
    const relief = reliefOn();
    const changed = {
      base: force || state.base !== signature.base,
      foil: force || state.foil !== signature.foil,
      relief: relief && (force || state.relief !== signature.relief || Boolean(state.reliefStale))
    };
    const content = changed.base || changed.foil || changed.relief;
    // A board turned away from the camera is left for the full-size pass.
    if (draft && content && hidden) return true;
    // Edits made while dragging are painted small; the full-size pass follows
    // when the hand rests (a call with `draft` off).
    let wanted = scale;
    if (draft) wanted = content ? Math.min(scale, draftScale) : state.scale ?? scale;
    if (!content && state.scale === wanted) return wanted < scale;
    const base = targets[face];
    const foil = targets[`${face}Foil`];
    if (state.scale !== wanted) {
      base.resize(...sized(face, wanted));
      foil.resize(...sized(face, wanted));
      changed.base = true;
      changed.foil = true;
      changed.relief = relief;
    }
    // While dragging, a board whose stamps move lies flat; its relief is
    // pressed again in the full-size pass (cheaper, and never out of step).
    const reliefLayer = changed.relief && !draft ? reliefTarget(face, wanted) : null;
    if (changed.relief) state.reliefStale = !reliefLayer;
    setFastGrain(wanted < scale);
    try {
      perf.paint(face, () => PAINTERS[face](rig.data, base, foil, onAsset, changed, reliefLayer));
    } finally {
      setFastGrain(false);
    }
    state.base = signature.base;
    state.foil = signature.foil;
    if (reliefLayer) state.relief = signature.relief;
    state.scale = wanted;
    return wanted < scale || Boolean(state.reliefStale);
  }

  function repaintEndpaper(force, defer) {
    const state = shown.endpaper;
    const size = scale > 1 ? 2 : 1;
    const signature = endpaperSignature(rig.data);
    if (!force && state.base === signature && state.scale === size) return false;
    if (defer) return true;
    if (state.scale !== size) targets.endpaper.resize(384 * size, 576 * size);
    perf.paint("endpaper", () => paintEndpaper(rig.data, targets.endpaper));
    state.base = signature;
    state.scale = size;
    return false;
  }

  /**
   * Bring the painted boards up to date with the spec. Each painter is skipped
   * when what it shows has not changed. `force` repaints regardless (new fonts
   * or images arrived). `draft` is for edits arriving in a stream: changed
   * boards are painted at reduced resolution, and those named in `hidden`
   * (turned away from the camera) not at all.
   * Returns true while any board is still waiting for its full-size pass.
   */
  function repaint({ force = false, draft = false, hidden = null } = {}) {
    rig.painted = true;
    const faces = ["front", "spine", "back"];
    const signatures = faces.map((face) => faceSignatures(rig.data, face));
    // Several boards at once (a colour, a material) get a smaller draft.
    const busy = signatures.filter((signature, index) => {
      const state = shown[faces[index]];
      return !hidden?.[faces[index]] && (state.base !== signature.base || state.foil !== signature.foil
        || (reliefOn() && state.relief !== signature.relief));
    }).length;
    const draftScale = busy > 1 ? DRAFT_SCALE_MANY : DRAFT_SCALE;
    let pending = false;
    faces.forEach((face, index) => {
      if (repaintFace(face, signatures[index], { force, draft, draftScale, hidden: hidden?.[face] })) pending = true;
    });
    if (repaintEndpaper(force, draft && hidden?.endpaper)) pending = true;
    applyLook();
    return pending;
  }

  const facingProbes = [
    ["front", coverPlane, new THREE.Vector3(0, 0, 1), -0.05],
    ["back", backPlane, new THREE.Vector3(0, 0, 1), -0.05],
    // The spine is rounded, so it stays in sight well past edge-on.
    ["spine", spine, new THREE.Vector3(-1, 0, 0), -0.45]
  ];
  const probeNormal = new THREE.Vector3();
  const probeCentre = new THREE.Vector3();

  /** Which boards are turned away from the camera: `{ front, spine, back }`. */
  function hiddenFaces(camera) {
    root.updateWorldMatrix(true, true);
    const result = {};
    facingProbes.forEach(([face, mesh, direction, limit]) => {
      probeNormal.copy(direction).transformDirection(mesh.matrixWorld);
      mesh.getWorldPosition(probeCentre);
      probeCentre.subVectors(camera.position, probeCentre).normalize();
      result[face] = probeNormal.dot(probeCentre) < limit;
    });
    return result;
  }

  /** Change the texture resolution of the painted boards. */
  function setResolution(next) {
    if (next === scale) return;
    scale = next;
    if (rig.painted) repaint();
  }

  /** Print a page on one side of a leaf (or leave it blank when `entry` is null). */
  function setLeafPage(pivot, side, entry, index, pageScale, epoch = 0) {
    const face = pivot.userData.faces[side];
    if (!entry) {
      face.material.map = rig.paperFace;
      return;
    }
    const width = Math.round(PAGE_SIZE.width * pageScale);
    const height = Math.round(PAGE_SIZE.height * pageScale);
    const signature = `${width}x${height}|${index}|${epoch}|${pageSignature(rig.data, entry)}`;
    if (!face.target) face.target = createPaintTexture(width, height);
    else face.target.resize(width, height);
    if (face.signature !== signature) {
      perf.paint("page", () => paintPage(rig.data, entry, index, face.target, onAsset));
      face.signature = signature;
    }
    face.material.map = face.target.texture;
  }

  const ribbonRest = ribbon.rotation.z;
  const secondRibbonRest = secondRibbon.rotation.z;

  /** Swing the ribbon markers by `angle` radians from where they hang. */
  function swayRibbon(angle) {
    ribbon.rotation.z = ribbonRest + angle;
    secondRibbon.rotation.z = secondRibbonRest - angle * 0.8;
  }

  // A pass of light over the foil: 0 is the resting look, 1 the brightest.
  let glint = 0;
  function setGlint(value) {
    glint = value;
    [foilArt, spineFoilArt, backFoilArt].forEach((material) => {
      const base = material.userData.rest;
      if (!base) return;
      material.emissiveIntensity = base.emissive * (1 + glint * 2.4);
      material.envMapIntensity = base.environment * (1 + glint * 0.9);
    });
  }

  /** Turning leaves throw real shadows on the pages beneath (inspection only). */
  function setLeafShadows(enabled) {
    leaves.forEach((pivot) => pivot.userData.faces.forEach((face) => {
      face.mesh.castShadow = enabled && pivot.userData.printed;
    }));
  }

  /** Free every printed page texture (when the book goes back on the shelf). */
  function clearLeaves() {
    leaves.forEach((pivot) => {
      pivot.userData.faces.forEach((face) => {
        face.material.map = rig.paperFace;
        face.target?.dispose();
        face.target = null;
        face.signature = null;
      });
    });
  }

  function dispose() {
    clearLeaves();
    Object.values(targets).forEach((target) => target.dispose());
    leaves.forEach((pivot) => pivot.userData.faces.forEach((face) => face.surface.geometry.dispose()));
    [...fadeMaterials, hitMaterial, contactShadowMaterial].forEach((material) => material.dispose());
    root.removeFromParent();
  }

  const rig = {
    data: book,
    root,
    motion,
    frontPivot,
    frontCover,
    pageBlock,
    leaves,
    get pagePivots() { return leaves; },
    pageSurfaces,
    pageGestureSurfaces: [...pageSurfaces, pageBlock],
    hit,
    contactShadow,
    paperFace,
    opacity: 1,
    painted: false,
    lastOffset: null,
    fadeMaterials,
    base: { width: d.width, height: d.height, depth: d.depth },
    // Reading state, owned by the engine while this book is open.
    flat: [],
    leafCount: 0,
    leafBase: 0,
    assignLeafSlots,
    applyLook,
    repaint,
    hiddenFaces,
    setResolution,
    setLeafPage,
    setLeafShadows,
    swayRibbon,
    setGlint,
    clearLeaves,
    dispose
  };

  if (lazy) applyLook();
  else repaint();
  return rig;
}
