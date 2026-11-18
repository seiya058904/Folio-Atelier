// The hardcover rig: boards, spine, hinges, endpapers, page block, flexible
// leaves, headbands, ribbon, foil layers and contact shadow.
// Construction follows The Complete Shelf; what changed is that every surface
// is now driven by a BookSpec and can be repainted in place while editing.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BOOK_FORMAT, CLASP_METALS, bookPalette, trimScale } from "../state/schema.js";
import { perf } from "../perf.js";
import { clamp, mixHex } from "../util.js";
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
import { createPaintTexture, snapshotTarget, snapshotTexture } from "../textures/gl.js";
import { PAGE_SIZE, pageSignature, paintPage } from "../textures/pages.js";
import {
  BAKED_EDGES,
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

/**
 * A rectangle whose two corners on one side (`foreSide`: +1 for +x, -1 for
 * -x) are rounded by `fore`; the other two by `radius`. UVs span 0..1.
 */
function createFacePlaneGeometry(width, height, radius, fore, foreSide) {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const r = (x) => Math.min(Math.sign(x) === foreSide ? fore : radius, halfWidth, halfHeight);
  const shape = new THREE.Shape();
  const corners = [[halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight], [-halfWidth, -halfHeight]];
  const first = corners[3];
  shape.moveTo(first[0] + r(first[0]), first[1]);
  corners.forEach(([x, y], index) => {
    const radiusHere = r(x);
    const sx = Math.sign(x);
    const sy = Math.sign(y);
    // Arrive along the edge, then turn the corner.
    if (index % 2 === 0) {
      shape.lineTo(x - sx * radiusHere, y);
      shape.quadraticCurveTo(x, y, x, y - sy * radiusHere);
    } else {
      shape.lineTo(x, y - sy * radiusHere);
      shape.quadraticCurveTo(x, y, x - sx * radiusHere, y);
    }
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 10);
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

/** A board with its fore-edge corners rounded (the fore-edge is +x). */
function createRoundedBoardGeometry(width, height, thick, fore, edge) {
  const shape = new THREE.Shape();
  const halfWidth = width * 0.5 - edge;
  const halfHeight = height * 0.5 - edge;
  const r = fore - edge;
  shape.moveTo(-halfWidth, -halfHeight);
  shape.lineTo(halfWidth - r, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + r);
  shape.lineTo(halfWidth, halfHeight - r);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - r, halfHeight);
  shape.lineTo(-halfWidth, halfHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thick - edge * 2,
    bevelEnabled: true,
    bevelThickness: edge,
    bevelSize: edge,
    bevelSegments: 2,
    curveSegments: 10
  });
  geometry.translate(0, 0, -(thick - edge * 2) * 0.5);
  // Same UV span as the square board, so the cloth grain keeps its scale.
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let index = 0; index < position.count; index += 1) {
    uv.setXY(index, position.getX(index) / width + 0.5, position.getY(index) / height + 0.5);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A ribbon marker, its hanging end cut in a swallow tail. */
function createRibbonGeometry(width, length) {
  const halfWidth = width * 0.5;
  const halfLength = length * 0.5;
  const notch = width * 0.62;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, -halfLength);
  shape.lineTo(0, -halfLength + notch);
  shape.lineTo(halfWidth, -halfLength);
  shape.lineTo(halfWidth, halfLength);
  shape.lineTo(-halfWidth, halfLength);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    uv[index * 2] = (position.getX(index) + halfWidth) / width;
    uv[index * 2 + 1] = (position.getY(index) + halfLength) / length;
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

/**
 * The head join of the closure band: a strip of rounded section (`width`
 * across, `thick` deep) running up the front board from `halfHeight - reach`,
 * round the edge with a radius, over the head of the book and down the back
 * board. `outer` is the z of the strip's centre line on the boards. Mirror it
 * in y for the tail.
 */
function createBandJoin(width, thick, halfHeight, outer, reach) {
  const top = halfHeight + thick * 0.5;
  const radius = Math.min(0.011, outer * 0.9);
  const path = [];
  const add = (y, z) => path.push([y, z]);
  add(halfHeight - reach, outer);
  add(top - radius, outer);
  const arc = (cy, cz, from, to) => {
    for (let index = 1; index <= 8; index += 1) {
      const angle = from + ((to - from) * index) / 8;
      add(cy + Math.sin(angle) * radius, cz + Math.cos(angle) * radius);
    }
  };
  arc(top - radius, outer - radius, 0, Math.PI * 0.5);
  add(top, -outer + radius);
  arc(top - radius, -outer + radius, Math.PI * 0.5, Math.PI);
  add(halfHeight - reach, -outer);
  return sweepBand(path, width, thick);
}

/**
 * A strip of rounded section swept along `path` ([y, z] points in the y-z
 * plane). The straight strips and the joins share it, so their sections and
 * their weave meet without a seam. `period` is the weave's repeat along the
 * strip.
 */
function sweepBand(path, width, thick, period = 0.08) {
  // A rounded rectangle for the section (a superellipse).
  const RING = 16;
  const section = [];
  for (let index = 0; index < RING; index += 1) {
    const angle = (index / RING) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    section.push([
      Math.sign(c) * Math.pow(Math.abs(c), 0.4) * width * 0.5,
      Math.sign(s) * Math.pow(Math.abs(s), 0.4) * thick * 0.5
    ]);
  }
  const positions = [];
  const uvs = [];
  let travelled = 0;
  path.forEach(([y, z], index) => {
    const previous = path[Math.max(0, index - 1)];
    const next = path[Math.min(path.length - 1, index + 1)];
    const ty = next[0] - previous[0];
    const tz = next[1] - previous[1];
    const length = Math.hypot(ty, tz) || 1;
    // Outward normal in the y-z plane (away from the book).
    const ny = -tz / length;
    const nz = ty / length;
    if (index > 0) travelled += Math.hypot(y - path[index - 1][0], z - path[index - 1][1]);
    section.forEach(([sx, sn], ring) => {
      positions.push(sx, y + ny * sn, z + nz * sn);
      uvs.push(ring / RING, travelled / period);
    });
  });
  const indices = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    for (let ring = 0; ring < RING; ring += 1) {
      const a = index * RING + ring;
      const b = index * RING + ((ring + 1) % RING);
      const c = a + RING;
      const e = b + RING;
      indices.push(a, c, b, b, c, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Fine woven ribs (light grey, tinted by the material colour): elastic and tape. */
function getWeaveTexture() {
  if (shared.weave) return shared.weave;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 4) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.13)";
    ctx.fillRect(0, y, 64, 1.2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(0, y + 2, 64, 0.8);
  }
  for (let x = 0; x < 64; x += 2) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.03 + ((x * 7) % 5) * 0.012})`;
    ctx.fillRect(x, 0, 1, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  shared.weave = texture;
  return texture;
}

/** A cloth tab with a line of stitches round its edge. */
function getStitchTexture() {
  if (shared.stitch) return shared.stitch;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 3) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.07)";
    ctx.fillRect(0, y, 128, 1);
  }
  // Stitches: short dashes with a shadow, a thread's width in from the edge.
  ctx.lineCap = "round";
  ctx.setLineDash([7, 5]);
  const stitch = (offset, colour) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2.2;
    ctx.strokeRect(13 + offset, 13 + offset, 128 - 26, 256 - 26);
  };
  stitch(0.8, "rgba(0, 0, 0, 0.35)");
  stitch(0, "rgba(255, 255, 255, 0.55)");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  shared.stitch = texture;
  return texture;
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
    endpaper: createRoundedPlaneGeometry(d.width - PASTE_INSET.x * 2, d.height - PASTE_INSET.y * 2, 0.003),
    spine: createSpineGeometry(d.depth + d.board * 1.94, d.height - 0.008, d.spineBulge, d.spineBoardThickness, true),
    spineFoil: createSpineGeometry(d.depth + d.board * 1.94, d.height - 0.008, d.spineBulge, 0, false),
    spineLining: new RoundedBoxGeometry(d.spineWidth * 0.68, d.height - 0.056, Math.max(0.045, d.pageDepth - 0.008), 1, 0.0015),
    headband: new THREE.CylinderGeometry(0.012, 0.012, d.pageDepth * 0.88, 12, 1, false),
    ribbon: createRibbonGeometry(0.034, d.pageHeight * 0.76)
  };
  return shared.geometry;
}

// Boards with rounded fore-edge corners, and the art and endpapers cut to
// match (a plane turned to face the inside has its fore-edge at -x).
const ROUND_CORNER = 0.04;
function roundedGeometry() {
  if (shared.rounded) return shared.rounded;
  const d = DIM;
  shared.rounded = {
    cover: createRoundedBoardGeometry(d.width, d.height, d.board, ROUND_CORNER, d.coverRadius),
    surfaceFore: createFacePlaneGeometry(d.width - 0.007, d.height - 0.007, 0.0035, ROUND_CORNER - 0.0035, 1),
    surfaceBack: createFacePlaneGeometry(d.width - 0.007, d.height - 0.007, 0.0035, ROUND_CORNER - 0.0035, -1),
    endpaperFore: createFacePlaneGeometry(d.width - PASTE_INSET.x * 2, d.height - PASTE_INSET.y * 2, 0.003, ROUND_CORNER - PASTE_INSET.x, 1),
    endpaperBack: createFacePlaneGeometry(d.width - PASTE_INSET.x * 2, d.height - PASTE_INSET.y * 2, 0.003, ROUND_CORNER - PASTE_INSET.x, -1)
  };
  return shared.rounded;
}

/*
 * The covering is turned in over the inside of each board and the paste-down
 * laid over it, a little short of the edges: what shows inside the squares
 * (where a board stands past the pages) is the covering, never the endpaper.
 * The paste-down's inset is wider than the squares (0.034 at head and tail,
 * 0.019 at the fore-edge); the turn-ins reach exactly to its edge, so their
 * step is where the paper begins.
 */
const PASTE_INSET = { x: 0.03, y: 0.05 };

function addTurnIns(pivot, side, insideZ, material) {
  const strips = {};
  ["head", "tail", "spine", "fore"].forEach((edge) => {
    const strip = createMesh(shared.box, material, `${side}-turn-in-${edge}`, false, true);
    strip.position.z = insideZ;
    strip.scale.z = 0.002;
    pivot.add(strip);
    strips[edge] = strip;
  });
  return strips;
}

/** Size the turn-ins for square or rounded corners (rounded: they stop short of the curve). */
function layoutTurnIns(strips, rounded) {
  const { width, height } = DIM;
  const margin = 0.001;
  const across = PASTE_INSET.x - margin;
  const along = PASTE_INSET.y - margin;
  const corner = rounded ? ROUND_CORNER : margin;
  // Hinge and fore-edge strips run the height; head and tail run between them.
  strips.spine.scale.set(across, height - margin * 2, 0.002);
  strips.spine.position.set(margin + across * 0.5, 0, strips.spine.position.z);
  const foreLength = height - corner * 2;
  strips.fore.scale.set(across, foreLength, 0.002);
  strips.fore.position.set(width - margin - across * 0.5, 0, strips.fore.position.z);
  const start = margin + across;
  const stop = rounded ? width - ROUND_CORNER : width - margin - across;
  [["head", 1], ["tail", -1]].forEach(([edge, direction]) => {
    strips[edge].scale.set(stop - start, along, 0.002);
    strips[edge].position.set((start + stop) * 0.5, direction * (height * 0.5 - margin - along * 0.5), strips[edge].position.z);
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

/*
 * Cross-fade. When a board is repainted with something new (a preset, a
 * covering, the sharp board after its draft), what it showed is copied on the
 * GPU first (`snapshotTexture`) and the shader mixes from that copy to the
 * new picture as `swap` runs from 0 to 1. At 1 the copy is not sampled.
 */
const SWAP_PARS = `
uniform sampler2D swapMap;
uniform float swap;
`;
const SWAP_MAP = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  if ( swap < 1.0 ) sampledDiffuseColor = mix( texture2D( swapMap, vMapUv ), sampledDiffuseColor, swap );
  diffuseColor *= sampledDiffuseColor;
#endif
`;

function swapUniforms() {
  return { map: { value: null }, amount: { value: 1 } };
}

function compileRelief(shader) {
  shader.uniforms.reliefMap = this.userData.relief.map;
  shader.uniforms.reliefScale = this.userData.relief.scale;
  shader.uniforms.swapMap = this.userData.swap.map;
  shader.uniforms.swap = this.userData.swap.amount;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <map_pars_fragment>", `#include <map_pars_fragment>\n${SWAP_PARS}`)
    .replace("#include <map_fragment>", SWAP_MAP)
    .replace("#include <bumpmap_pars_fragment>", `#include <bumpmap_pars_fragment>\n${RELIEF_PARS}`)
    .replace(
      "#include <normal_fragment_maps>",
      "#include <normal_fragment_maps>\nif ( reliefScale != 0.0 ) normal = reliefNormal( - vViewPosition, normal, vMapUv, faceDirection );"
    );
}

function withRelief(material) {
  material.userData.relief = { map: { value: null }, scale: { value: 0 } };
  material.userData.swap = swapUniforms();
  material.onBeforeCompile = compileRelief;
  return material;
}

/*
 * Two foils on one board. The foil layer is white where the main foil is
 * stamped and magenta (no green) where the second is; the material itself is
 * white, and this tints each texel, and its glow, with its own leaf colour.
 * Both colours are uniforms, so changing either one repaints nothing.
 */
function compileLeaf(shader) {
  shader.uniforms.leafMain = this.userData.leaf.main;
  shader.uniforms.leafSecond = this.userData.leaf.second;
  shader.uniforms.swapMap = this.userData.swap.map;
  shader.uniforms.swap = this.userData.swap.amount;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <map_pars_fragment>", `#include <map_pars_fragment>\nuniform vec3 leafMain;\nuniform vec3 leafSecond;\n${SWAP_PARS}`)
    .replace("#include <map_fragment>", `vec3 leafTint = leafMain;
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  if ( swap < 1.0 ) sampledDiffuseColor = mix( texture2D( swapMap, vMapUv ), sampledDiffuseColor, swap );
  leafTint = mix( leafMain, leafSecond, clamp( 1.0 - sampledDiffuseColor.g / max( sampledDiffuseColor.r, 0.001 ), 0.0, 1.0 ) );
  diffuseColor *= vec4( leafTint * sampledDiffuseColor.r, sampledDiffuseColor.a );
#endif`)
    .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= leafTint;");
}

/*
 * Show-through: a printed leaf lets a little of the print on its other side
 * through, mirrored, as real paper does. Each face samples its partner's
 * texture at (1 - u, v); thinner stocks show more. One extra sample a pixel.
 */
function compileThrough(shader) {
  shader.uniforms.throughMap = this.userData.through.map;
  shader.uniforms.throughAmount = this.userData.through.amount;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <map_pars_fragment>", "#include <map_pars_fragment>\nuniform sampler2D throughMap;\nuniform float throughAmount;")
    .replace("#include <map_fragment>", `#include <map_fragment>
#ifdef USE_MAP
  if ( throughAmount > 0.0 ) {
    vec3 behind = texture2D( throughMap, vec2( 1.0 - vMapUv.x, vMapUv.y ) ).rgb;
    float ink = clamp( 1.0 - dot( behind, vec3( 0.3333 ) ) / 0.84, 0.0, 1.0 );
    diffuseColor.rgb *= 1.0 - ink * throughAmount;
  }
#endif`);
}

function withThrough(material) {
  material.userData.through = { map: { value: null }, amount: { value: 0 } };
  material.onBeforeCompile = compileThrough;
  return material;
}

// How much of the other side shows through each paper stock.
const SHOW_THROUGH = { rice: 0.14, white: 0.075, cream: 0.07, ivory: 0.07, blush: 0.07, grey: 0.065, aged: 0.06 };

function withLeaf(material) {
  material.userData.leaf = { main: { value: new THREE.Color(1, 1, 1) }, second: { value: new THREE.Color(1, 1, 1) } };
  material.userData.swap = swapUniforms();
  material.onBeforeCompile = compileLeaf;
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
  // The book itself. `body` takes the trim size (width and height only), so
  // the boards and the leaves, which turn, are never scaled unevenly and
  // never thicken; `block` inside it takes the bulk, in depth only: the
  // page block, spine, headbands and edges (see applyStructure).
  const body = new THREE.Group();
  body.name = "book-body";
  motion.add(body);
  const block = new THREE.Group();
  block.name = "book-block";
  body.add(block);
  let bulk = 1;

  /* ----- paint targets ----- */
  let scale = resolution;
  const sized = (face, s = scale) => [FACE_SIZE[face].width * s, FACE_SIZE[face].height * s];
  const targets = {
    front: createPaintTexture(...sized("front"), { opaque: true }),
    frontFoil: createPaintTexture(...sized("front")),
    spine: createPaintTexture(...sized("spine"), { opaque: true }),
    spineFoil: createPaintTexture(...sized("spine")),
    back: createPaintTexture(...sized("back"), { opaque: true }),
    backFoil: createPaintTexture(...sized("back")),
    endpaper: createPaintTexture(384, 576, { opaque: true })
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
    if (!targets[key]) targets[key] = createPaintTexture(width, height, { color: false, anisotropy: 4, opaque: true });
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
  const foilArt = withLeaf(physical(foilParameters(targets.frontFoil, THREE.FrontSide)));
  const spineFoilArt = withLeaf(physical(foilParameters(targets.spineFoil, THREE.DoubleSide)));
  const backFoilArt = withLeaf(physical(foilParameters(targets.backFoil, THREE.DoubleSide)));
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
  const sheetMaterial = () => withThrough(physical({
    color: 0xeee6d7, map: paperFace, bumpMap: paperFace, bumpScale: 0.0012,
    roughness: 0.96, metalness: 0, sheen: 0.02, sheenRoughness: 1, side: THREE.FrontSide
  }));

  /* ----- page block and boards ----- */
  const pageBlock = createMesh(g.pageBlock, pageMaterial, "page-block");
  pageBlock.position.x = 0.018;
  block.add(pageBlock);

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
  const backTurnIns = addTurnIns(backPivot, "back", d.board * 0.53, cloth);
  const backGroove = createMesh(shared.plane, grooveMaterial, "back-hinge-groove", false, false);
  backGroove.scale.set(0.012, d.height * 0.94, 1);
  backGroove.position.set(0.038, 0, -d.board * 0.535);
  backGroove.rotation.y = Math.PI;
  backPivot.add(backGroove);
  body.add(backPivot);

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
  const frontTurnIns = addTurnIns(frontPivot, "front", -d.board * 0.53, cloth);
  const frontGroove = createMesh(shared.plane, grooveMaterial, "front-hinge-groove", false, false);
  frontGroove.scale.set(0.012, d.height * 0.94, 1);
  frontGroove.position.set(0.038, 0, d.board * 0.655);
  frontPivot.add(frontGroove);
  body.add(frontPivot);

  /* ----- wax seal ----- */
  // A seal pressed on the front board: a rounded, slightly irregular disc of
  // wax with a raised rim and a letter (a bump map painted per book).
  if (!shared.seal) {
    const shape = new THREE.Shape();
    const random = (index) => Math.sin(index * 12.9898) * 43758.5453 % 1;
    for (let index = 0; index <= 36; index += 1) {
      const angle = (index / 36) * Math.PI * 2;
      const radius = 0.062 * (1 + Math.abs(random(index + 1)) * 0.09 - 0.045);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.002, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 4, curveSegments: 4
    });
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let index = 0; index < position.count; index += 1) {
      uv.setXY(index, position.getX(index) / 0.14 + 0.5, position.getY(index) / 0.14 + 0.5);
    }
    geometry.computeVertexNormals();
    shared.seal = geometry;
  }
  const sealCanvas = document.createElement("canvas");
  sealCanvas.width = 256;
  sealCanvas.height = 256;
  const sealTexture = new THREE.CanvasTexture(sealCanvas);
  sealTexture.anisotropy = 4;
  const sealMaterial = physical({
    map: sealTexture, bumpMap: sealTexture, bumpScale: 0.016,
    roughness: 0.42, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.35, sheen: 0.2, sheenRoughness: 0.5
  });
  const seal = createMesh(shared.seal, sealMaterial, "wax-seal", true, true);
  seal.scale.set(1.18, 1.18, 1);
  frontPivot.add(seal);
  let sealKey = "";

  function applySeal() {
    const spec = rig.data.front.seal || {};
    seal.visible = Boolean(spec.show);
    if (!seal.visible) return;
    seal.position.set(d.width * (spec.x ?? 0.76), d.height * (0.5 - (spec.y ?? 0.82)), d.board * 0.5);
    sealMaterial.color.set(spec.color || "#7a1c17");
    const letter = (spec.letter || rig.data.title || "").trim().slice(0, 1).toUpperCase();
    if (letter === sealKey) return;
    sealKey = letter;
    const ctx = sealCanvas.getContext("2d");
    const glow = ctx.createRadialGradient(128, 118, 10, 128, 128, 128);
    glow.addColorStop(0, "#d6d6d6");
    glow.addColorStop(1, "#a6a6a6");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 256, 256);
    // The rim raised by the matrix, then a groove inside it.
    ctx.strokeStyle = "#f2f2f2";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(128, 128, 98, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#7c7c7c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(128, 128, 84, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#f4f4f4";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '600 118px "Cormorant Garamond", "Noto Serif SC", serif';
    ctx.fillText(letter || "\u2766", 128, 136);
    sealTexture.needsUpdate = true;
  }

  /* ----- closure band and pen loop ----- */
  // A vertical elastic band near the fore-edge, of rounded section: a strip
  // on each board, joined round the head and the tail with a radius at each
  // edge (the joins are rebuilt when the bulk changes). The back strip is
  // stitched under the back board; the band slips off as the book opens.
  const bandMaterial = physical({ roughness: 0.58, metalness: 0, sheen: 0.55, sheenRoughness: 0.42, map: getWeaveTexture(), clearcoat: 0 });
  const band = new THREE.Group();
  band.name = "closure-band";
  const bandX = d.width * 0.84;
  const BAND_WIDTH = 0.03;
  const BAND_THICK = 0.0042;
  const BAND_REACH = 0.05; // how far each join runs down a board
  const bandStripLength = d.height - BAND_REACH * 2;
  if (!shared.bandStrip) {
    // Swept like the joins, with a whole number of weave repeats, so the weave
    // carries on unbroken into the joins at both ends.
    const half = bandStripLength * 0.5;
    const period = bandStripLength / Math.max(1, Math.round(bandStripLength / 0.08));
    shared.bandStrip = sweepBand([[-half, 0], [0, 0], [half, 0]], BAND_WIDTH, BAND_THICK, period);
  }
  const bandFront = createMesh(shared.bandStrip, bandMaterial, "band-front", true, false);
  bandFront.position.set(bandX, 0, d.board * 0.5 + BAND_THICK * 0.5);
  frontPivot.add(bandFront);
  const bandBack = createMesh(shared.bandStrip, bandMaterial, "band-back", true, false);
  bandBack.position.set(bandX, 0, -d.board * 0.5 - BAND_THICK * 0.5);
  backPivot.add(bandBack);
  const bandWraps = [1, -1].map((side) => {
    const wrap = createMesh(new THREE.BufferGeometry(), bandMaterial, "band-wrap", true, false);
    wrap.position.x = -d.width * 0.5 + bandX;
    wrap.scale.y = side;
    band.add(wrap);
    return wrap;
  });
  let bandBulk = 0;
  function shapeBandWraps() {
    if (bandBulk === bulk) return;
    bandBulk = bulk;
    const outer = (d.depth * bulk) * 0.5 + d.board + BAND_THICK * 0.5;
    const geometry = createBandJoin(BAND_WIDTH, BAND_THICK, d.height * 0.5, outer, BAND_REACH);
    bandWraps.forEach((wrap) => {
      wrap.geometry.dispose();
      wrap.geometry = geometry;
    });
  }
  body.add(band);
  const bandParts = [bandFront, bandBack, band];

  // The pen loop: a flattened fabric tube on a cloth tab, stitched to the
  // back board and standing just off the fore-edge.
  const penLoopMaterial = physical({ roughness: 0.74, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, side: THREE.DoubleSide, map: getWeaveTexture() });
  const penTabMaterial = physical({ roughness: 0.78, metalness: 0, sheen: 0.3, sheenRoughness: 0.6, map: getStitchTexture() });
  if (!shared.penLoop) {
    shared.penLoop = new THREE.CylinderGeometry(0.021, 0.021, 0.17, 24, 1, true);
    shared.penTab = new RoundedBoxGeometry(0.075, 0.17, 0.0024, 2, 0.0011);
  }
  const penLoop = new THREE.Group();
  penLoop.name = "pen-loop-group";
  const penTube = createMesh(shared.penLoop, penLoopMaterial, "pen-loop", true, false);
  penTube.scale.z = 0.62; // pressed flat against the board
  penTube.position.set(d.width * 0.5 + 0.02, 0, -0.008);
  const penTab = createMesh(shared.penTab, penTabMaterial, "pen-tab", true, true);
  penTab.position.set(d.width * 0.5 - 0.016, 0, 0);
  penLoop.add(penTube, penTab);
  penLoop.position.y = d.height * 0.16;
  body.add(penLoop);

  // A metal clasp: a strap from the back board over the fore-edge, hooked to
  // a stud on the front. Like the band, it is undone as the book opens.
  const claspMaterial = physical({ metalness: 1, roughness: 0.3, clearcoat: 0.2, clearcoatRoughness: 0.3 });
  const clasp = new THREE.Group();
  clasp.name = "clasp";
  const claspStrap = createMesh(new THREE.BufferGeometry(), claspMaterial, "clasp-strap", true, false);
  claspStrap.rotation.z = -Math.PI * 0.5; // the join is built round +y; turn it to wrap +x
  const claspStud = createMesh(new THREE.CylinderGeometry(0.011, 0.012, 0.006, 20), claspMaterial, "clasp-stud", true, false);
  claspStud.rotation.x = Math.PI * 0.5;
  clasp.add(claspStrap, claspStud);
  body.add(clasp);
  let claspBulk = 0;
  function shapeClasp() {
    if (claspBulk === bulk) return;
    claspBulk = bulk;
    const outer = (d.depth * bulk) * 0.5 + d.board + 0.0016;
    claspStrap.geometry.dispose();
    claspStrap.geometry = createBandJoin(0.05, 0.0032, d.width * 0.5, outer, 0.085);
    claspStud.position.set(d.width * 0.5 - 0.072, 0, outer + 0.003);
  }

  // A paper pocket inside the front board, over the endpaper (the side the
  // reader sees as soon as the book is opened).
  const pocketMaterial = physical({ roughness: 0.92, metalness: 0, sheen: 0.04, side: THREE.DoubleSide });
  const pocket = new THREE.Group();
  pocket.name = "pocket";
  const pocketHeight = d.height * 0.4;
  const pocketFace = createMesh(shared.plane, pocketMaterial, "pocket", false, true);
  pocketFace.scale.set(d.width - 0.06, pocketHeight, 1);
  const pocketLip = createMesh(shared.box, pocketMaterial, "pocket-lip", false, true);
  pocketLip.scale.set(d.width - 0.06, 0.004, 0.0024);
  pocketLip.position.set(0, pocketHeight * 0.5, 0.0006);
  pocket.add(pocketFace, pocketLip);
  pocket.position.set(d.width * 0.5 - 0.004, -d.height * 0.5 + 0.026 + pocketHeight * 0.5, -d.board * 0.515 - 0.0016);
  pocket.rotation.y = Math.PI;
  frontPivot.add(pocket);

  // A slipcase, open at the spine. The book slides out of it on its way to
  // the studio (see `setCase`).
  if (!shared.caseWeave) {
    shared.caseWeave = getWeaveTexture().clone();
    shared.caseWeave.repeat.set(10, 14);
  }
  const caseMaterial = physical({ roughness: 0.8, metalness: 0, sheen: 0.35, sheenRoughness: 0.7, map: shared.caseWeave });
  const slipcase = new THREE.Group();
  slipcase.name = "slipcase";
  const casePanels = ["front", "back", "head", "tail", "fore"].map((name) => {
    const panel = createMesh(shared.box, caseMaterial, `slipcase-${name}`, true, true);
    slipcase.add(panel);
    return panel;
  });
  // A printed paper label with the title, on the front of the case.
  const caseLabelCanvas = document.createElement("canvas");
  caseLabelCanvas.width = 512;
  caseLabelCanvas.height = 320;
  const caseLabelTexture = new THREE.CanvasTexture(caseLabelCanvas);
  caseLabelTexture.colorSpace = THREE.SRGBColorSpace;
  caseLabelTexture.anisotropy = 4;
  const caseLabelMaterial = physical({ map: caseLabelTexture, roughness: 0.9, metalness: 0 });
  const caseLabel = createMesh(shared.plane, caseLabelMaterial, "slipcase-label", false, true);
  caseLabel.scale.set(d.width * 0.5, d.width * 0.5 * (320 / 512), 1);
  slipcase.add(caseLabel);
  let caseLabelKey = "";
  function paintCaseLabel() {
    const title = rig.data.title || "";
    const author = rig.data.author || "";
    const key = `${title}|${author}`;
    if (key === caseLabelKey) return;
    caseLabelKey = key;
    const ctx = caseLabelCanvas.getContext("2d");
    ctx.fillStyle = "#efe7d6";
    ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = "rgba(60, 40, 25, 0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, 476, 284);
    ctx.lineWidth = 1;
    ctx.strokeRect(28, 28, 456, 264);
    ctx.fillStyle = "#2b2219";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 64;
    ctx.font = `500 ${size}px "Cormorant Garamond", "Noto Serif SC", serif`;
    while (size > 24 && ctx.measureText(title).width > 420) {
      size -= 4;
      ctx.font = `500 ${size}px "Cormorant Garamond", "Noto Serif SC", serif`;
    }
    ctx.fillText(title, 256, author ? 140 : 160);
    if (author) {
      ctx.font = `400 26px "Cormorant Garamond", "Noto Serif SC", serif`;
      ctx.fillStyle = "#5e4c3a";
      ctx.fillText(author, 256, 220);
    }
    caseLabelTexture.needsUpdate = true;
  }
  body.add(slipcase);
  let caseAmount = 1;
  function shapeCase() {
    const wall = 0.009;
    const gap = 0.004;
    const inner = (d.depth * bulk) * 0.5 + d.board + gap;
    const left = -d.width * 0.5 - 0.004;
    const right = d.width * 0.5 + gap;
    const top = d.height * 0.5 + gap;
    const length = right - left;
    const [front, back, head, tail, fore] = casePanels;
    [[front, 1], [back, -1]].forEach(([panel, side]) => {
      panel.scale.set(length + wall, top * 2 + wall * 2, wall);
      panel.position.set((left + right + wall) * 0.5, 0, side * (inner + wall * 0.5));
    });
    [[head, 1], [tail, -1]].forEach(([panel, side]) => {
      panel.scale.set(length + wall, wall, inner * 2);
      panel.position.set((left + right + wall) * 0.5, side * (top + wall * 0.5), 0);
    });
    fore.scale.set(wall, top * 2 + wall * 2, inner * 2);
    fore.position.set(right + wall * 0.5, 0, 0);
    caseLabel.position.set((left + right) * 0.5 + 0.03, d.height * 0.12, inner + wall + 0.0008);
  }

  /** 1: the book sits in its slipcase; 0: it has slid out and the case is gone. */
  function setCase(amount) {
    caseAmount = amount;
    const shown = Boolean(rig.data.structure?.slipcase?.show) && amount > 0.002;
    slipcase.visible = shown;
    if (!shown) return;
    const eased = amount * amount * (3 - 2 * amount);
    slipcase.position.x = (1 - eased) * d.width * 0.9;
    caseMaterial.opacity = rig.opacity * clamp(eased * 1.6, 0, 1);
    caseLabelMaterial.opacity = caseMaterial.opacity;
  }

  /** Trim size, bulk, band and pen loop from the spec. */
  function applyStructure() {
    const structure = rig.data.structure || {};
    const size = trimScale(rig.data);
    bulk = structure.bulk || 1;
    const rounded = structure.corners === "rounded";
    const r = rounded ? roundedGeometry() : null;
    frontCover.geometry = rounded ? r.cover : g.cover;
    backCover.geometry = rounded ? r.cover : g.cover;
    coverPlane.geometry = rounded ? r.surfaceFore : g.coverSurface;
    foilPlane.geometry = rounded ? r.surfaceFore : g.coverSurface;
    backPlane.geometry = rounded ? r.surfaceBack : g.coverSurface;
    backFoilPlane.geometry = rounded ? r.surfaceBack : g.coverSurface;
    frontEndpaper.geometry = rounded ? r.endpaperBack : g.endpaper;
    backEndpaper.geometry = rounded ? r.endpaperFore : g.endpaper;
    layoutTurnIns(frontTurnIns, rounded);
    layoutTurnIns(backTurnIns, rounded);
    body.scale.set(size, size, 1);
    block.scale.set(1, 1, bulk);
    // Stand on the same shelf line whatever the height.
    body.position.y = -d.height * 0.5 * (1 - size);
    // The boards keep their thickness and sit on the block, however thick.
    const halfBlock = (d.depth * bulk) * 0.5;
    frontPivot.position.z = halfBlock + d.board * 0.5;
    backPivot.position.z = -halfBlock - d.board * 0.5;
    // The spine spans the block and both boards.
    const spineSpan = (d.depth * bulk + d.board * 1.94) / ((d.depth + d.board * 1.94) * bulk);
    spine.scale.z = spineSpan;
    spineFoil.scale.z = spineSpan;
    assignLeafSlots();
    contactShadow.scale.set(d.width * 1.22 * size, d.depth * 2.05 * bulk, 1);
    shapeBandWraps();
    const showBand = Boolean(structure.band?.show);
    bandParts.forEach((part) => { part.userData.wanted = showBand; });
    bandMaterial.color.set(structure.band?.color || "#1d1813");
    penLoop.visible = Boolean(structure.penLoop?.show);
    penLoop.position.z = -halfBlock - d.board - 0.0013;
    penLoopMaterial.color.set(structure.penLoop?.color || "#1d1813");
    penTabMaterial.color.set(structure.penLoop?.color || "#1d1813");
    shapeClasp();
    clasp.userData.wanted = Boolean(structure.clasp?.show);
    claspMaterial.color.set((CLASP_METALS.find((metal) => metal.id === structure.clasp?.metal) || CLASP_METALS[0]).color);
    pocket.visible = Boolean(structure.pocket?.show);
    pocketMaterial.color.set(mixHex(rig.data.details?.endpaper?.color || "#efe6d4", "#3a2a1a", 0.12));
    liningMaterial.color.set(mixHex(rig.data.details?.endpaper?.color || "#efe6d4", "#3a2a1a", 0.3));
    shapeCase();
    caseMaterial.color.set(structure.slipcase?.color || "#3a2a20");
    if (structure.slipcase?.show) paintCaseLabel();
    setCase(caseAmount);
    applySeal();
    updateBand(1, { open: frontPivot.rotation.y < -0.02 });
  }

  // `slide` runs 0 (on the book) to 1 (slipped off past the fore-edge);
  // `tug` is a small elastic pull towards the fore-edge under the pointer.
  const bandState = { slide: 0, tug: 0, tugVelocity: 0 };
  const BAND_SLIDE_SECONDS = 0.3;
  const BAND_SLIDE_DISTANCE = d.width * 0.24;

  /**
   * Ease the band towards its place: slipped off when `open`, tugged when
   * `tug`. Returns true while it is still moving.
   */
  function updateBand(delta = 1, { open = false, tug = false } = {}) {
    const bandWanted = Boolean(bandParts[0].userData.wanted);
    const claspWanted = Boolean(clasp.userData.wanted);
    const wanted = bandWanted || claspWanted;
    const target = open ? 1 : 0;
    const step = delta / BAND_SLIDE_SECONDS;
    bandState.slide = target > bandState.slide
      ? Math.min(target, bandState.slide + step)
      : Math.max(target, bandState.slide - step);
    // A lightly damped spring, so the tug gives a little and springs back.
    const tugTarget = tug && !open ? 1 : 0;
    const dt = Math.min(delta, 0.034);
    bandState.tugVelocity += ((tugTarget - bandState.tug) * 260 - bandState.tugVelocity * 18) * dt;
    bandState.tug += bandState.tugVelocity * dt;
    const tugMoving = Math.abs(tugTarget - bandState.tug) > 0.002 || Math.abs(bandState.tugVelocity) > 0.02;
    if (!tugMoving) {
      bandState.tug = tugTarget;
      bandState.tugVelocity = 0;
    }
    const eased = bandState.slide * bandState.slide * (3 - 2 * bandState.slide);
    const shift = eased * BAND_SLIDE_DISTANCE + bandState.tug * 0.012;
    bandFront.position.x = bandX + shift;
    bandBack.position.x = bandX + shift;
    band.position.x = shift;
    clasp.position.x = shift;
    // The strips stand a hair proud of the boards when pulled.
    bandFront.position.z = d.board * 0.5 + BAND_THICK * 0.5 + bandState.tug * 0.003;
    const fade = 1 - clamp((eased - 0.3) / 0.7, 0, 1);
    bandMaterial.opacity = rig.opacity * fade;
    claspMaterial.opacity = rig.opacity * fade;
    const on = bandState.slide < 1;
    bandParts.forEach((part) => { part.visible = bandWanted && on; });
    clasp.visible = claspWanted && on;
    return wanted && (bandState.slide !== target || tugMoving);
  }

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
    body.add(pivot);
    leaves.push(pivot);
  }

  /** Stack heights depend on a leaf's place in the pile; call after reordering. */
  function assignLeafSlots() {
    const count = leaves.length;
    leaves.forEach((pivot, order) => {
      const stackIndex = count - 1 - order;
      pivot.userData.order = order;
      pivot.userData.restZ = (d.pageDepth * bulk) * 0.5 + 0.0015 + stackIndex * 0.0015;
      pivot.userData.turnedZ = (d.depth * bulk) * 0.5 + d.board + 0.004 + order * 0.0015;
      pivot.position.x = -d.width * 0.5 + d.spineWidth * 0.65;
    });
  }
  assignLeafSlots();
  leaves.forEach((pivot) => { pivot.position.z = pivot.userData.restZ; });

  /* ----- spine, headbands, ribbon, edges ----- */
  const spine = createMesh(g.spine, spineArt, "rounded-spine");
  spine.position.x = -d.width * 0.5 - 0.003;
  block.add(spine);
  const spineFoil = createMesh(g.spineFoil, spineFoilArt, "spine-foil", false, false);
  spineFoil.position.x = spine.position.x - 0.0007;
  block.add(spineFoil);
  // The lining glued over the backs of the gatherings: plain paper, a shade
  // of the endpaper (seen from the head and tail, never printed).
  const liningMaterial = physical({ roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
  const spineLining = createMesh(g.spineLining, liningMaterial, "spine-lining");
  spineLining.position.set(-d.width * 0.5 + d.spineWidth * 0.38, 0, 0);
  block.add(spineLining);

  [-1, 1].forEach((direction) => {
    const headband = createMesh(g.headband, headbandMaterial, `headband-${direction}`);
    headband.rotation.x = Math.PI * 0.5;
    headband.position.set(-d.pageWidth * 0.5 + 0.046, direction * (d.pageHeight * 0.5 - 0.004), 0);
    block.add(headband);
  });

  const ribbon = createMesh(g.ribbon, ribbonMaterial, "ribbon-bookmark", false, true);
  ribbon.position.set(
    -d.pageWidth * 0.5 + 0.09 + (book.seed % 3) * 0.018,
    -d.pageHeight * 0.17,
    d.pageDepth * 0.5 + 0.003
  );
  ribbon.rotation.z = (book.seed % 2 ? -1 : 1) * 0.014;
  block.add(ribbon);
  const secondRibbonMaterial = ribbonMaterial.clone();
  const secondRibbon = createMesh(g.ribbon, secondRibbonMaterial, "ribbon-bookmark-2", false, true);
  secondRibbon.position.set(ribbon.position.x + 0.058, ribbon.position.y - 0.03, ribbon.position.z + 0.0006);
  secondRibbon.rotation.z = -ribbon.rotation.z * 1.6;
  block.add(secondRibbon);

  // Gatherings showing on a plain fore-edge. A decorated edge (gilt, stained,
  // marbled) is trimmed smooth before it is coloured: there they are hidden
  // (`applyLook`), or they cross the gold as pale bands.
  const signatureMarks = [];
  for (let index = 0; index < 6; index += 1) {
    const signature = createMesh(shared.box, signatureMaterial, `page-signature-${index + 1}`, false, true);
    signatureMarks.push(signature);
    signature.scale.set(0.0035, 0.00135, d.pageDepth * 0.91);
    signature.position.set(
      0.018 + d.pageWidth * 0.5 + 0.001,
      -d.pageHeight * 0.5 + ((index + 1) / 7) * d.pageHeight,
      0
    );
    block.add(signature);
  }

  const foreEdge = createMesh(shared.plane, foreEdgeMaterial, "fore-edge", false, true);
  foreEdge.scale.set(d.pageDepth * 0.94, d.pageHeight - 0.028, 1);
  foreEdge.rotation.y = Math.PI * 0.5;
  foreEdge.position.set(0.018 + d.pageWidth * 0.5 + 0.002, 0, 0);
  block.add(foreEdge);
  [-1, 1].forEach((direction) => {
    const edge = createMesh(shared.plane, headTailEdgeMaterial, direction > 0 ? "head-edge" : "tail-edge", false, true);
    edge.scale.set(d.pageWidth - 0.035, d.pageDepth * 0.94, 1);
    edge.rotation.x = direction > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    edge.position.set(0.018, direction * (d.pageHeight * 0.5 + 0.002), 0);
    block.add(edge);
  });

  /* ----- hit target and contact shadow ----- */
  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const hit = createMesh(shared.box, hitMaterial, "hit-target", false, false);
  hit.scale.set(d.width * 1.34, d.height * 1.2, Math.max(d.depth * 4, 1));
  hit.position.set(-d.spineWidth * 0.18, 0, 0.12);
  hit.layers.set(HIT_LAYER);
  body.add(hit);

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
    pageMaterial, ...sheetMaterials, headbandMaterial, signatureMaterial, liningMaterial, ribbonMaterial,
    secondRibbonMaterial, bandMaterial, penLoopMaterial, penTabMaterial, claspMaterial, pocketMaterial, caseMaterial, caseLabelMaterial, sealMaterial
  ];

  /* ----- look: everything that is a material parameter rather than paint ----- */
  let lookReady = false;
  /** The painted layers may have changed size (and texture): point the materials at them. */
  function bindPaintedMaps() {
    Object.entries(artFor).forEach(([face, material]) => { material.map = targets[face].texture; });
    [[foilArt, targets.frontFoil], [spineFoilArt, targets.spineFoil], [backFoilArt, targets.backFoil]].forEach(([material, target]) => {
      material.map = target.texture;
      material.bumpMap = target.texture;
    });
    endpaperMaterial.map = targets.endpaper.texture;
  }

  function applyLook() {
    const spec = rig.data;
    bindPaintedMaps();
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

    const secondColor = new THREE.Color(spec.foil.second || spec.foil.color);
    [foilArt, spineFoilArt, backFoilArt].forEach((material) => {
      // The colours are the shader's (see `compileLeaf`); the material is white.
      material.color.setRGB(1, 1, 1);
      material.userData.leaf.main.value.copy(foilColor);
      material.userData.leaf.second.value.copy(secondColor);
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
      material.emissive.setRGB(1, 1, 1);
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

    applyStructure();

    const edge = spec.details.edge;
    const baked = BAKED_EDGES.has(edge.style);
    const plainEdge = !edge.style || edge.style === "plain";
    signatureMarks.forEach((mark) => { mark.visible = plainEdge; });
    const edgeMaps = getPageEdgeTextures(baked ? edge.style : "plain", edge.color);
    foreEdgeMaterial.map = edgeMaps.fore;
    headTailEdgeMaterial.map = edgeMaps.headTail;
    [foreEdgeMaterial, headTailEdgeMaterial].forEach((material) => {
      if (edge.style === "gilt" || edge.style === "gauffered") {
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
    // A headband is silk thread wound round a core: even a plain one shows
    // its turns, a shade darker. (Always a map, so one shader serves both.)
    const second = headband.striped ? headband.second || "#f3ece0" : mixHex(headband.color, "#000000", 0.22);
    const stripes = getHeadbandTexture(headband.color, second);
    if (!headbandMaterial.map) headbandMaterial.needsUpdate = true;
    headbandMaterial.map = stripes;
    headbandMaterial.color.set(0xffffff);
    contactShadowMaterial.color.set(bookPalette(spec).shelfDark);

    const stock = getPaperFaceTexture(spec.interior.paper);
    [pageMaterial, ...sheetMaterials].forEach((material) => {
      if (material.map === rig.paperFace) material.map = stock;
      material.bumpMap = stock;
    });
    endpaperMaterial.bumpMap = stock;
    rig.paperFace = stock;
    rig.showThrough = SHOW_THROUGH[spec.interior.paper] ?? 0.07;
    leaves.forEach(linkShowThrough);
  }

  const PAINTERS = { front: paintFront, spine: paintSpine, back: paintBack };
  // What each board currently shows: content signatures per layer and the
  // texture scale it was painted at.
  const shown = { front: {}, spine: {}, back: {}, endpaper: {} };

  /** Paint one board if needed. Returns true if it still owes a full-size pass. */
  /* ----- cross-fades (see SWAP_MAP) ----- */

  const swapFor = {
    front: [coverArt, foilArt],
    spine: [spineArt, spineFoilArt],
    back: [backArt, backFoilArt]
  };
  // One copy per layer and board, at the logical board size, made when first
  // needed (only the book in the studio fades) and let go on the shelf.
  const swapTargets = {};
  const swapRuns = {};

  function beginSwap(face, duration) {
    const run = swapRuns[face];
    // Repainted again early in a fade: keep fading from the older picture.
    if (run && run.time / run.duration < 0.5) {
      run.time = 0;
      run.duration = duration;
      return;
    }
    let started = false;
    swapFor[face].forEach((material, layer) => {
      const key = `${face}${layer}`;
      const source = material.map;
      if (!source) return;
      if (!swapTargets[key]) {
        swapTargets[key] = snapshotTarget(FACE_SIZE[face].width, FACE_SIZE[face].height, source.colorSpace);
      }
      if (!snapshotTexture(source, swapTargets[key])) {
        material.userData.swap.amount.value = 1;
        material.userData.swap.map.value = null;
        return;
      }
      material.userData.swap.map.value = swapTargets[key].texture;
      material.userData.swap.amount.value = 0;
      started = true;
    });
    if (started) swapRuns[face] = { time: 0, duration };
  }

  /** Advance the fades by `delta` seconds; true while any is running. */
  function stepSwaps(delta) {
    let running = false;
    Object.entries(swapRuns).forEach(([face, run]) => {
      run.time += delta;
      const t = Math.min(1, run.time / run.duration);
      // Ease out: most of the change early, a soft landing.
      const amount = 1 - (1 - t) * (1 - t) * (1 - t);
      swapFor[face].forEach((material) => {
        if (material.userData.swap.map.value) material.userData.swap.amount.value = amount;
      });
      if (t >= 1) {
        swapFor[face].forEach((material) => {
          material.userData.swap.amount.value = 1;
          material.userData.swap.map.value = null;
        });
        delete swapRuns[face];
      } else {
        running = true;
      }
    });
    return running;
  }

  function releaseSwaps() {
    Object.keys(swapRuns).forEach((face) => {
      swapFor[face].forEach((material) => {
        material.userData.swap.amount.value = 1;
        material.userData.swap.map.value = null;
      });
      delete swapRuns[face];
    });
    Object.keys(swapTargets).forEach((key) => {
      swapTargets[key].dispose();
      delete swapTargets[key];
    });
  }

  function repaintFace(face, signature, { force, draft, draftScale, hidden, fade = 0 }) {
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
    if (fade > 0) beginSwap(face, fade);
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
    paintedFaces += 1;
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
  let paintedFaces = 0;

  /**
   * `budget` limits how many boards are painted in this call (the rest report
   * as pending), so a full-size pass can be spread over several frames;
   * boards facing the camera go first.
   */
  function repaint({ force = false, draft = false, hidden = null, budget = Infinity, fade = 0 } = {}) {
    rig.painted = true;
    const faces = ["front", "spine", "back"];
    if (budget < faces.length && hidden) faces.sort((a, b) => Number(Boolean(hidden[a])) - Number(Boolean(hidden[b])));
    const signatures = faces.map((face) => faceSignatures(rig.data, face));
    // Several boards at once (a colour, a material) get a smaller draft.
    const busy = signatures.filter((signature, index) => {
      const state = shown[faces[index]];
      return !hidden?.[faces[index]] && (state.base !== signature.base || state.foil !== signature.foil
        || (reliefOn() && state.relief !== signature.relief));
    }).length;
    const draftScale = busy > 1 ? DRAFT_SCALE_MANY : DRAFT_SCALE;
    let pending = false;
    paintedFaces = 0;
    faces.forEach((face, index) => {
      if (paintedFaces >= budget) {
        const state = shown[face];
        const signature = signatures[index];
        if (force || state.scale !== scale || state.base !== signature.base || state.foil !== signature.foil
          || Boolean(state.reliefStale) || (reliefOn() && state.relief !== signature.relief)) pending = true;
        return;
      }
      if (repaintFace(face, signatures[index], { force, draft, draftScale, hidden: hidden?.[face], fade })) pending = true;
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

  /**
   * Stand-ins for every shader variant the boards and foils can switch to
   * (sheen and clearcoat on the boards; clearcoat, anisotropy and iridescence
   * on the foil). Three compiles a new program, synchronously, the first time
   * a material turns one of these on or off; compiling the stand-ins ahead
   * (in parallel, in idle time) keeps that off the frame of the edit.
   */
  function shaderVariants() {
    const group = new THREE.Group();
    const variant = (source, mesh, set) => {
      // userData holds textures, which a clone would serialise.
      const saved = source.userData;
      source.userData = {};
      const material = source.clone();
      source.userData = saved;
      if (saved.relief || saved.leaf) {
        if (saved.relief) material.userData.relief = saved.relief;
        if (saved.leaf) material.userData.leaf = saved.leaf;
        if (saved.swap) material.userData.swap = saved.swap;
        material.onBeforeCompile = source.onBeforeCompile;
      }
      set(material);
      const stand = new THREE.Mesh(mesh.geometry, material);
      stand.castShadow = mesh.castShadow;
      stand.receiveShadow = mesh.receiveShadow;
      group.add(stand);
    };
    const both = [0, 1];
    [[cloth, frontCover], [coverArt, coverPlane], [backArt, backPlane], [spineArt, spine]].forEach(([material, mesh]) => {
      both.forEach((sheen) => both.forEach((coat) => variant(material, mesh, (target) => {
        target.sheen = sheen * 0.4;
        target.clearcoat = coat * 0.2;
      })));
    });
    // Gilt and gauffered edges drop the paper's sheen, which is a feature switch.
    [[foreEdgeMaterial, foreEdge], [headTailEdgeMaterial, foreEdge]].forEach(([material, mesh]) => {
      both.forEach((sheen) => variant(material, mesh, (target) => {
        target.sheen = sheen * 0.02;
      }));
    });
    [[foilArt, foilPlane], [backFoilArt, backFoilPlane], [spineFoilArt, spineFoil]].forEach(([material, mesh]) => {
      both.forEach((coat) => both.forEach((grain) => both.forEach((film) => variant(material, mesh, (target) => {
        target.clearcoat = coat * 0.18;
        target.anisotropy = grain * 0.34;
        target.iridescence = film * 0.5;
      }))));
    });
    return group;
  }

  /**
   * Change the texture resolution of the painted boards. With `defer`, the
   * boards keep their current pictures until `repaint` reaches them (the
   * engine spreads that over several frames).
   */
  function setResolution(next, { defer = false } = {}) {
    if (next === scale) return false;
    scale = next;
    if (defer) return rig.painted;
    if (rig.painted) repaint();
    // Settled at this size for a while (back on the shelf): let the other go.
    Object.values(targets).forEach((target) => target.trim());
    return false;
  }

  /** Print a page on one side of a leaf (or leave it blank when `entry` is null). */
  /** Each printed face of a leaf shows its partner's print, faintly, through the paper. */
  function linkShowThrough(pivot) {
    const faces = pivot.userData.faces;
    faces.forEach((face, side) => {
      const partner = faces[1 - side].material.map;
      const printed = partner && partner !== rig.paperFace;
      face.material.userData.through.map.value = printed ? partner : null;
      face.material.userData.through.amount.value = printed ? rig.showThrough ?? 0.07 : 0;
    });
  }

  function setLeafPage(pivot, side, entry, index, pageScale, epoch = 0) {
    const face = pivot.userData.faces[side];
    if (!entry) {
      face.material.map = rig.paperFace;
      linkShowThrough(pivot);
      return;
    }
    const width = Math.round(PAGE_SIZE.width * pageScale);
    const height = Math.round(PAGE_SIZE.height * pageScale);
    const signature = `${width}x${height}|${index}|${epoch}|${pageSignature(rig.data, entry)}`;
    if (!face.target) face.target = createPaintTexture(width, height, { opaque: true });
    else if (face.target.resize(width, height)) face.target.trim();
    if (face.signature !== signature) {
      perf.paint("page", () => paintPage(rig.data, entry, index, face.target, onAsset));
      face.signature = signature;
    }
    face.material.map = face.target.texture;
    linkShowThrough(pivot);
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
    releaseSwaps();
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
    /** Boards painted by the last `repaint` call. */
    get paintedFaces() { return paintedFaces; },
    shaderVariants,
    stepSwaps,
    releaseSwaps,
    setResolution,
    setLeafPage,
    setLeafShadows,
    swayRibbon,
    updateBand,
    /** A band or a clasp holds it shut (it does not crack open on hover). */
    get hasBand() { return Boolean(rig.data.structure?.band?.show || rig.data.structure?.clasp?.show); },
    setCase,
    setGlint,
    clearLeaves,
    dispose
  };

  if (lazy) applyLook();
  else repaint();
  return rig;
}
