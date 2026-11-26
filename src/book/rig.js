// The hardcover rig: boards, spine, hinges, endpapers, page block, flexible
// leaves, headbands, ribbons, 3D hardware (raised bands, metal corner caps,
// articulated clasp, sculpted wax seal), foil layers and contact shadow.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BOOK_FORMAT, CLASP_METALS, bookPalette, trimScale } from "../state/schema.js";
import { perf } from "../perf.js";
import { clamp, mixHex } from "../util.js";
import {
  BANDED,
  FACE_SIZE,
  endpaperSignature,
  faceSignatures,
  paintBack,
  paintEndpaper,
  paintFront,
  paintSpine,
  setFastGrain,
  spineBandPositions
} from "../textures/faces.js";
import { drawMotif, hasMotif } from "../textures/motifs.js";
import { createPaintTexture, snapshotTarget, snapshotTexture } from "../textures/gl.js";
import { PAGE_SIZE, pageSignature, paintPage } from "../textures/pages.js";
import {
  BAKED_EDGES,
  PAPER_STOCKS,
  getContactShadowTexture,
  getCornerBumpTexture,
  getHeadbandBumpTexture,
  getHeadbandTexture,
  getMaterialMaps,
  getPageEdgeTextures,
  getPaperFaceTexture
} from "../textures/surface.js";

export const PRINTED_LEAVES = 4;
/** Pointer hit volumes are raycast only, never rendered. */
export const HIT_LAYER = 1;
export const FLEXIBLE_PAGE_SEGMENTS = 20;
export const FLEXIBLE_PAGE_VERTICAL_SEGMENTS = 8;

const BLANK_LEAVES = 2;
/** Texture scale used for boards while a control is being dragged. */
const DRAFT_SCALE = 1;
const DRAFT_SCALE_MANY = 0.75;
const MAX_SPINE_BANDS = 5;

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
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let index = 0; index < position.count; index += 1) {
    uv.setXY(index, position.getX(index) / width + 0.5, position.getY(index) / height + 0.5);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A naturally draped satin ribbon marker, anchored at y = 0 (tucked inside the
 * spine) and hanging to y = -length with a swallowtail cut and soft S-drape.
 * Each book's ribbon holds its own lightweight vertex buffer so swaying bends
 * it organically along its length instead of rotating a rigid card.
 */
function createDrapedRibbonGeometry(width, length, phase = 0) {
  const segX = 4;
  const segY = 22;
  const halfW = width * 0.5;
  const notch = width * 0.58;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iy = 0; iy <= segY; iy += 1) {
    const t = iy / segY; // 0 = anchored top, 1 = hanging swallowtail tip
    // Keep the upper shaft flush inside the page block (zero front-board clipping)
    // and introduce natural satin drape only along the hanging lower tail.
    const tail = clamp((t - 0.58) / 0.42, 0, 1);
    const drapeZ = tail * tail * 0.011;
    const drapeX = Math.sin(t * Math.PI * 1.3 + phase) * 0.004 * tail;
    for (let ix = 0; ix <= segX; ix += 1) {
      const u = ix / segX; // 0..1 across width
      const edgeDist = Math.abs(u - 0.5) * 2; // 0 at center, 1 at outer edges
      const x = (u - 0.5) * width + drapeX;
      // Swallowtail notch only tapers in smoothly near the tail tip.
      const cut = t > 0.85 ? ((t - 0.85) / 0.15) * (1 - edgeDist) * notch : 0;
      const y = -t * length + cut;
      const cupZ = (edgeDist * edgeDist - 0.35) * 0.0022 * t;
      positions.push(x, y, drapeZ + cupZ);
      uvs.push(u, t * 4);
    }
  }
  const stride = segX + 1;
  for (let iy = 0; iy < segY; iy += 1) {
    for (let ix = 0; ix < segX; ix += 1) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
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
 * swells towards -x.
 */
function createSpineGeometry(span, height, bulge, thickness, shell = true, segments = 22) {
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
    quad(
      [p.x, -half, p.z], [q.x, -half, q.z], [p.x, half, p.z], [q.x, half, q.z],
      [p.t, 0], [q.t, 0], [p.t, 1], [q.t, 1]
    );
    if (!shell) continue;
    const pi = p.x + thickness;
    const qi = q.x + thickness;
    quad([qi, -half, q.z], [pi, -half, p.z], [qi, half, q.z], [pi, half, p.z], edge, edge, edge, edge);
    quad([p.x, half, p.z], [q.x, half, q.z], [pi, half, p.z], [qi, half, q.z], edge, edge, edge, edge);
    quad([q.x, -half, q.z], [p.x, -half, p.z], [qi, -half, q.z], [pi, -half, p.z], edge, edge, edge, edge);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    if (shell && Math.abs(normal.getY(index)) > 0.5) continue;
    const k = (2 * position.getZ(index)) / span;
    const slope = (4 * bulge * k) / span;
    const length = Math.hypot(1, slope);
    const sign = !shell || normal.getX(index) < 0 ? 1 : -1;
    normal.setXYZ(index, (-1 / length) * sign, 0, (-slope / length) * sign);
  }
  return geometry;
}

/**
 * True 3D raised spine cord: sweeps a rounded D-section rib along the exact
 * parabolic spine arc so raised bands catch real grazing studio highlights
 * and cast crisp micro-shadows on the spine.
 */
function createSpineBandGeometry(span, bulge, cordHeight = 0.02, protrusion = 0.0085, arcSegs = 22, ringSegs = 10) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const halfH = cordHeight * 0.5;

  for (let ia = 0; ia <= arcSegs; ia += 1) {
    const t = ia / arcSegs;
    // Slight inset from absolute hinge seam so the cord tapers cleanly into the joint.
    const k = (t - 0.5) * 1.94; // -0.97..+0.97
    const z = k * (span * 0.5);
    const xBase = -bulge * (1 - k * k);
    // Outward normal of spine arc in x-z plane
    const slope = (4 * bulge * k) / span;
    const invLen = 1 / Math.hypot(1, slope);
    const nx = -invLen;
    const nz = -slope * invLen;
    // Taper cord height gently right at the board joints
    const edgeTaper = smoothEdge(1 - Math.abs(k));
    const localOut = protrusion * (0.28 + 0.72 * edgeTaper);

    for (let ir = 0; ir <= ringSegs; ir += 1) {
      const s = ir / ringSegs; // 0..1 across vertical rib profile
      const phi = (s - 0.5) * Math.PI; // -pi/2 .. +pi/2
      const y = Math.sin(phi) * halfH;
      const out = Math.cos(phi) * localOut;
      positions.push(xBase + nx * out, y, z + nz * out);
      uvs.push(t * 0.35, s * 0.08);
    }
  }
  const stride = ringSegs + 1;
  for (let ia = 0; ia < arcSegs; ia += 1) {
    for (let ir = 0; ir < ringSegs; ir += 1) {
      const a = ia * stride + ir;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function smoothEdge(x) {
  const t = clamp(x / 0.18, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Curved woven silk headband following the rounded spine contour.
 */
function createCurvedHeadbandGeometry(depthSpan, bulge, radius = 0.0125) {
  const halfSpan = depthSpan * 0.45;
  const pts = [];
  const segs = 14;
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const z = (t - 0.5) * halfSpan * 2;
    const k = (2 * z) / (depthSpan * 1.05);
    const x = -bulge * 0.48 * (1 - k * k);
    pts.push(new THREE.Vector3(x, 0, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geometry = new THREE.TubeGeometry(curve, 18, radius, 12, false);
  return geometry;
}

/**
 * True 3D wrap-around metal corner protector for the outer corners of a board.
 * Built in local corner space where (0, 0) is the outer corner apex, extending
 * into -x (inward across width) and -y (inward along height), wrapping cleanly
 * around the board thickness `boardThick` in z. Supports both square and rounded
 * boards (`roundRadius > 0`) as well as `plain`, `scalloped`, and `filigree` cuts.
 */
function createCornerCapGeometry(leg, boardThick, style = "plain", roundRadius = 0) {
  const lip = 0.0028;
  const innerLeg = leg * 0.58;
  const r = Math.min(roundRadius, leg * 0.42);

  const traceInnerHypotenuse = (shape, size) => {
    if (style === "filigree") {
      shape.quadraticCurveTo(-size * 0.76, -size * 0.14, -size * 0.64, -size * 0.36);
      shape.quadraticCurveTo(-size * 0.5, -size * 0.46, -size * 0.36, -size * 0.64);
      shape.quadraticCurveTo(-size * 0.14, -size * 0.76, 0, -size);
    } else if (style === "scalloped") {
      shape.quadraticCurveTo(-size * 0.62, -size * 0.3, -size * 0.5, -size * 0.5);
      shape.quadraticCurveTo(-size * 0.3, -size * 0.62, 0, -size);
    } else {
      shape.lineTo(0, -size);
    }
  };

  const makeFace = (size, zPos, flipNormal) => {
    const shape = new THREE.Shape();
    if (r > 0) {
      shape.moveTo(-r, 0);
      shape.lineTo(-size, 0);
      traceInnerHypotenuse(shape, size);
      shape.lineTo(0, -r);
      shape.quadraticCurveTo(0, 0, -r, 0);
    } else {
      shape.moveTo(0, 0);
      shape.lineTo(-size, 0);
      traceInnerHypotenuse(shape, size);
      shape.closePath();
    }
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: lip * 0.72,
      bevelEnabled: true,
      bevelThickness: 0.0009,
      bevelSize: 0.0009,
      bevelSegments: 2,
      curveSegments: 10
    });
    if (flipNormal) {
      g.scale(1, 1, -1);
      const pos = g.getAttribute("position");
      for (let i = 0; i < pos.count; i += 3) {
        const x1 = pos.getX(i + 1), y1 = pos.getY(i + 1), z1 = pos.getZ(i + 1);
        pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
        pos.setXYZ(i + 2, x1, y1, z1);
      }
      g.computeVertexNormals();
    }
    g.translate(0, 0, zPos);
    const pos = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    for (let i = 0; i < pos.count; i += 1) {
      uv.setXY(i, clamp(-pos.getX(i) / leg, 0, 1), clamp(-pos.getY(i) / leg, 0, 1));
    }
    return g;
  };

  // Continuous wrap-around edge shell following either a square or rounded corner contour.
  const rim = new THREE.Shape();
  const out = lip * 0.95;
  const inn = lip * 0.55;
  if (r > 0) {
    const ro = r + out;
    const ri = Math.max(0.004, r - inn);
    rim.moveTo(-leg, out);
    rim.lineTo(-ro, out);
    rim.quadraticCurveTo(out, out, out, -ro);
    rim.lineTo(out, -leg);
    rim.lineTo(-inn, -leg);
    rim.lineTo(-inn, -ri);
    rim.quadraticCurveTo(-inn, -inn, -ri, -inn);
    rim.lineTo(-leg, -inn);
    rim.closePath();
  } else {
    rim.moveTo(-leg, out);
    rim.lineTo(out, out);
    rim.lineTo(out, -leg);
    rim.lineTo(-inn, -leg);
    rim.lineTo(-inn, -inn);
    rim.lineTo(-leg, -inn);
    rim.closePath();
  }
  const wrapDepth = boardThick + lip * 1.35;
  const wrapRim = new THREE.ExtrudeGeometry(rim, {
    depth: wrapDepth,
    bevelEnabled: true,
    bevelThickness: 0.0008,
    bevelSize: 0.0008,
    bevelSegments: 2,
    curveSegments: 10
  });
  wrapRim.translate(0, 0, -wrapDepth * 0.5);
  const wPos = wrapRim.getAttribute("position");
  const wUv = wrapRim.getAttribute("uv");
  for (let i = 0; i < wPos.count; i += 1) {
    wUv.setXY(i, clamp(-wPos.getX(i) / leg, 0, 1), clamp(-wPos.getY(i) / leg, 0, 1));
  }

  const parts = [
    makeFace(leg, boardThick * 0.5 + 0.0004, false),
    makeFace(innerLeg, -boardThick * 0.5 - 0.0004, true),
    wrapRim
  ];
  return mergeGeometriesSimple(parts);
}

/** Mirror a corner geometry across Y while keeping exact +1 determinant & outward normals. */
function mirroredCornerGeometry(source) {
  const clone = source.clone();
  const pos = clone.getAttribute("position");
  const norm = clone.getAttribute("normal");
  const uv = clone.getAttribute("uv");
  for (let i = 0; i < pos.count; i += 1) {
    pos.setY(i, -pos.getY(i));
    norm.setY(i, -norm.getY(i));
  }
  for (let i = 0; i < pos.count; i += 3) {
    const x1 = pos.getX(i + 1), y1 = pos.getY(i + 1), z1 = pos.getZ(i + 1);
    pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x1, y1, z1);
    const nx1 = norm.getX(i + 1), ny1 = norm.getY(i + 1), nz1 = norm.getZ(i + 1);
    norm.setXYZ(i + 1, norm.getX(i + 2), norm.getY(i + 2), norm.getZ(i + 2));
    norm.setXYZ(i + 2, nx1, ny1, nz1);
    if (uv) {
      const u1 = uv.getX(i + 1), v1 = uv.getY(i + 1);
      uv.setXY(i + 1, uv.getX(i + 2), uv.getY(i + 2));
      uv.setXY(i + 2, u1, v1);
    }
  }
  return clone;
}

/**
 * Chamfered slipcase front/back wall panel (unit 1×1×1 bounding box scaled to wall dimensions)
 * with a semicircular thumb-cutout along the spine-side opening edge (-x) so the spine
 * peeks cleanly out and can be gripped by hand.
 */
function createSlipcaseWallGeometry() {
  const hw = 0.5;
  const hh = 0.5;
  const cutR = 0.095;
  const cutY = 0.095;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.lineTo(-hw, cutY);
  shape.absarc(-hw, 0, cutR, Math.PI * 0.5, -Math.PI * 0.5, true);
  shape.lineTo(-hw, -hh);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 16
  });
  g.translate(0, 0, -0.5);
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i += 1) {
    uv.setXY(i, pos.getX(i) + 0.5, pos.getY(i) + 0.5);
  }
  g.computeVertexNormals();
  return g;
}

/** Lightweight non-indexed geometry merger (zero extra addon imports). */
function mergeGeometriesSimple(geos) {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let totalVerts = 0;
  nonIndexed.forEach((g) => { totalVerts += g.getAttribute("position").count; });
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  let offset = 0;
  nonIndexed.forEach((g) => {
    const pos = g.getAttribute("position");
    const norm = g.getAttribute("normal");
    const uv = g.getAttribute("uv");
    positions.set(pos.array, offset * 3);
    if (norm) normals.set(norm.array, offset * 3);
    if (uv) uvs.set(uv.array, offset * 2);
    offset += pos.count;
    g.dispose();
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return merged;
}

/**
 * True 3D sculpted molten wax seal: organic multi-harmonic blob contour with
 * a raised melted bead rim and recessed stamped interior well.
 */
function createWaxSealGeometry(radius = 0.072) {
  const rings = 16;
  const segs = 56;
  const positions = [];
  const uvs = [];
  const indices = [];

  const radiusAt = (angle) => radius * (
    1
    + 0.052 * Math.sin(angle * 3 + 0.45)
    + 0.032 * Math.cos(angle * 5 - 1.1)
    + 0.018 * Math.sin(angle * 7 + 2.3)
    + 0.01 * Math.cos(angle * 11 + 0.7)
  );

  // Height profile across normalized radius s in [0, 1]
  const heightAt = (s, angle) => {
    if (s >= 1) return 0;
    // Recessed flat stamp well for s < 0.68, swollen molten collar around s = 0.84, rounded drop to 0
    const rim = Math.exp(-Math.pow((s - 0.83) / 0.135, 2));
    const rimVariance = 1 + 0.14 * Math.sin(angle * 4 - 0.8) + 0.09 * Math.cos(angle * 6 + 1.5);
    const basePlateau = s < 0.72 ? 0.0044 : 0.0044 * Math.max(0, 1 - Math.pow((s - 0.72) / 0.28, 2.2));
    const edgeDrop = s > 0.9 ? Math.cos(((s - 0.9) / 0.1) * Math.PI * 0.5) : 1;
    return (basePlateau + rim * 0.0072 * rimVariance) * edgeDrop;
  };

  // Center vertex
  positions.push(0, 0, heightAt(0, 0));
  uvs.push(0.5, 0.5);

  for (let ir = 1; ir <= rings; ir += 1) {
    const s = ir / rings;
    for (let is = 0; is < segs; is += 1) {
      const angle = (is / segs) * Math.PI * 2;
      const r = radiusAt(angle) * s;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      const z = heightAt(s, angle);
      positions.push(x, y, z);
      uvs.push(0.5 + (x / (radius * 2.1)), 0.5 + (y / (radius * 2.1)));
    }
  }

  // Center fan
  for (let is = 0; is < segs; is += 1) {
    const next = (is + 1) % segs;
    indices.push(0, 1 + is, 1 + next);
  }
  // Concentric rings
  for (let ir = 1; ir < rings; ir += 1) {
    const row0 = 1 + (ir - 1) * segs;
    const row1 = 1 + ir * segs;
    for (let is = 0; is < segs; is += 1) {
      const next = (is + 1) % segs;
      indices.push(row0 + is, row1 + is, row0 + next);
      indices.push(row0 + next, row1 + is, row1 + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Gusseted paper pocket with a classic curved thumb-notch along its top edge. */
function createPocketGeometry(width, height) {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const notchR = width * 0.11;
  const notchD = notchR * 0.58;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(notchR, hh);
  shape.quadraticCurveTo(notchR * 0.55, hh - notchD, 0, hh - notchD);
  shape.quadraticCurveTo(-notchR * 0.55, hh - notchD, -notchR, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0018,
    bevelEnabled: true,
    bevelThickness: 0.0006,
    bevelSize: 0.0006,
    bevelSegments: 1,
    curveSegments: 14
  });
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i += 1) {
    uv.setXY(i, (position.getX(i) + hw) / width, (position.getY(i) + hh) / height);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The head join of the closure band: a strip of rounded section (`width`
 * across, `thick` deep) running up the front board from `halfHeight - reach`,
 * round the edge with a radius, over the head of the book and down the back
 * board. `outer` is the z of the strip's centre line on the boards.
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
 * plane). Optional `taper` narrows the width gracefully at the front tip
 * (used for the sculpted metal clasp hasp); `closeCaps` seals both ends solid.
 */
function sweepBand(path, width, thick, period = 0.08, taper = false, closeCaps = false) {
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
    const ny = -tz / length;
    const nz = ty / length;
    if (index > 0) travelled += Math.hypot(y - path[index - 1][0], z - path[index - 1][1]);
    // Taper gently at the front clasp tip (index 0) and back hinge end
    const widthScale = taper && index === 0 ? 0.72 : taper && index === 1 ? 0.92 : 1;
    section.forEach(([sx, sn], ring) => {
      positions.push(sx * widthScale, y + ny * sn, z + nz * sn);
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
  if (closeCaps && path.length >= 2) {
    // Seal front (index 0) and rear (index path.length - 1) ends solid.
    const startCenter = positions.length / 3;
    positions.push(0, path[0][0], path[0][1]);
    uvs.push(0.5, 0);
    for (let ring = 0; ring < RING; ring += 1) {
      indices.push(startCenter, ring, (ring + 1) % RING);
    }
    const lastRing = (path.length - 1) * RING;
    const endCenter = positions.length / 3;
    const lastPt = path[path.length - 1];
    positions.push(0, lastPt[0], lastPt[1]);
    uvs.push(0.5, travelled / period);
    for (let ring = 0; ring < RING; ring += 1) {
      indices.push(endCenter, lastRing + ((ring + 1) % RING), lastRing + ring);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Fine woven ribs (light grey, tinted by the material colour): elastic, ribbon and tape. */
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

/** Precompute static flex basis arrays for a leaf surface so page deformation runs with zero trig/pow per frame. */
function precomputeLeafSurface(geometry, direction) {
  const position = geometry.attributes.position;
  const count = position.count;
  const base = Float32Array.from(position.array);
  const archBasis = new Float32Array(count);
  const dArchDu = new Float32Array(count);
  const restArchBasis = new Float32Array(count);
  const dRestArchDu = new Float32Array(count);
  const twistBasis = new Float32Array(count);
  const dTwistDu = new Float32Array(count);
  const dTwistDv = new Float32Array(count);

  const duSign = direction > 0 ? 1 : -1;
  for (let v = 0; v < count; v += 1) {
    const x = base[v * 3];
    const y = base[v * 3 + 1];
    const u = clamp(x + 0.5, 0, 1);
    const mappedU = direction > 0 ? u : 1 - u;

    // Turning-page smooth arch + free-edge lift
    const sinPiU = Math.sin(Math.PI * mappedU);
    const cosPiU = Math.cos(Math.PI * mappedU);
    const yMod = 1 + y * 0.14;
    archBasis[v] = (sinPiU * 0.84 + mappedU * mappedU * 0.16) * yMod * direction;
    dArchDu[v] = (Math.PI * cosPiU * 0.84 + 0.32 * mappedU) * yMod * duSign * direction;

    // Natural open-book resting spine-valley arch: rises steeply out of the bound gutter,
    // crests gently around u=0.28, and settles softly towards the fore-edge.
    const safeU = Math.max(0.0001, mappedU);
    const uPow = Math.pow(safeU, 0.68);
    const archWave = Math.sin(Math.PI * uPow);
    const dampOut = 1 - 0.38 * mappedU;
    restArchBasis[v] = archWave * dampOut * direction;
    const dWave = Math.cos(Math.PI * uPow) * Math.PI * 0.68 * Math.pow(safeU, -0.32);
    dRestArchDu[v] = (dWave * dampOut - archWave * 0.38) * duSign * direction;

    // Diagonal twist + subtle horizontal ripple during drag/peek
    const uTwist = Math.pow(safeU, 1.35);
    const duTwist = 1.35 * Math.pow(safeU, 0.35);
    const absY = Math.abs(y);
    const rippleEnv = 1 - Math.min(1, absY * 1.65);
    const sin2Pi = Math.sin(mappedU * Math.PI * 2);
    const cos2Pi = Math.cos(mappedU * Math.PI * 2);
    twistBasis[v] = (y * uTwist + sin2Pi * rippleEnv * 0.09) * direction;
    dTwistDu[v] = (y * duTwist + Math.PI * 2 * cos2Pi * rippleEnv * 0.09) * duSign * direction;
    const dRippleDv = absY * 1.65 < 1 ? -Math.sign(y) * 1.65 : 0;
    dTwistDv[v] = (uTwist + sin2Pi * dRippleDv * 0.09) * direction;
  }

  return {
    geometry,
    position,
    normal: geometry.attributes.normal,
    base,
    direction,
    archBasis,
    dArchDu,
    restArchBasis,
    dRestArchDu,
    twistBasis,
    dTwistDu,
    dTwistDv
  };
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

const PASTE_INSET = { x: 0.03, y: 0.05 };

function sharedGeometry() {
  if (shared.geometry) return shared.geometry;
  const d = DIM;
  const spineSpan = d.depth + d.board * 2.02;
  const cornerPlain = createCornerCapGeometry(d.width * 0.165, d.board, "plain", 0);
  const cornerScalloped = createCornerCapGeometry(d.width * 0.165, d.board, "scalloped", 0);
  const cornerFiligree = createCornerCapGeometry(d.width * 0.165, d.board, "filigree", 0);
  shared.geometry = {
    cover: new RoundedBoxGeometry(d.width, d.height, d.board, 2, d.coverRadius),
    pageBlock: createPageBlockGeometry(d.pageWidth, d.pageHeight, d.pageDepth, d.pageRadius),
    coverSurface: createRoundedPlaneGeometry(d.width - 0.006, d.height - 0.006, 0.0035),
    endpaper: createRoundedPlaneGeometry(d.width - PASTE_INSET.x * 2, d.height - PASTE_INSET.y * 2, 0.003),
    spine: createSpineGeometry(spineSpan, d.height - 0.006, d.spineBulge, d.spineBoardThickness, true),
    spineFoil: createSpineGeometry(spineSpan, d.height - 0.006, d.spineBulge, 0, false),
    spineBand: createSpineBandGeometry(spineSpan, d.spineBulge),
    spineLining: new RoundedBoxGeometry(d.spineWidth * 0.68, d.height - 0.056, Math.max(0.045, d.pageDepth - 0.008), 1, 0.0015),
    headband: createCurvedHeadbandGeometry(d.pageDepth, d.spineBulge, 0.012),
    cornerPlain,
    cornerPlainMirrored: mirroredCornerGeometry(cornerPlain),
    cornerScalloped,
    cornerScallopedMirrored: mirroredCornerGeometry(cornerScalloped),
    cornerFiligree,
    cornerFiligreeMirrored: mirroredCornerGeometry(cornerFiligree),
    slipcaseWall: createSlipcaseWallGeometry(),
    pocket: createPocketGeometry(d.width - 0.064, d.height * 0.39),
    pocketCard: createRoundedPlaneGeometry(d.width * 0.54, d.height * 0.25, 0.012),
    seal: createWaxSealGeometry(0.072)
  };
  return shared.geometry;
}

const ROUND_CORNER = 0.04;
function roundedGeometry() {
  if (shared.rounded) return shared.rounded;
  const d = DIM;
  const cornerPlain = createCornerCapGeometry(d.width * 0.165, d.board, "plain", ROUND_CORNER);
  const cornerScalloped = createCornerCapGeometry(d.width * 0.165, d.board, "scalloped", ROUND_CORNER);
  const cornerFiligree = createCornerCapGeometry(d.width * 0.165, d.board, "filigree", ROUND_CORNER);
  shared.rounded = {
    cover: createRoundedBoardGeometry(d.width, d.height, d.board, ROUND_CORNER, d.coverRadius),
    surfaceFore: createFacePlaneGeometry(d.width - 0.006, d.height - 0.006, 0.0035, ROUND_CORNER - 0.0035, 1),
    surfaceBack: createFacePlaneGeometry(d.width - 0.006, d.height - 0.006, 0.0035, ROUND_CORNER - 0.0035, -1),
    endpaperFore: createFacePlaneGeometry(d.width - PASTE_INSET.x * 2, d.height - PASTE_INSET.y * 2, 0.003, ROUND_CORNER - PASTE_INSET.x, 1),
    endpaperBack: createFacePlaneGeometry(d.width - PASTE_INSET.x * 2, d.height - PASTE_INSET.y * 2, 0.003, ROUND_CORNER - PASTE_INSET.x, -1),
    cornerPlain,
    cornerPlainMirrored: mirroredCornerGeometry(cornerPlain),
    cornerScalloped,
    cornerScallopedMirrored: mirroredCornerGeometry(cornerScalloped),
    cornerFiligree,
    cornerFiligreeMirrored: mirroredCornerGeometry(cornerFiligree)
  };
  return shared.rounded;
}

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

function layoutTurnIns(strips, rounded) {
  const { width, height } = DIM;
  const margin = 0.001;
  const across = PASTE_INSET.x - margin;
  const along = PASTE_INSET.y - margin;
  const corner = rounded ? ROUND_CORNER : margin;
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

// Solid materials default to opaque (Early-Z enabled!). `setOpacity` flips
// `transparent` on only while a book is fading out at the edges of the shelf.
const physical = (parameters) => new THREE.MeshPhysicalMaterial({ transparent: false, ...parameters });

// Stamping depth + isotropic spine grain scaling + GPU cross-fade.
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
  shader.uniforms.grainScale = this.userData.grainScale;
  shader.vertexShader = shader.vertexShader
    .replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\nuniform vec2 grainScale;")
    .replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
#ifdef USE_NORMALMAP
  vNormalMapUv *= grainScale;
#endif
#ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv *= grainScale;
#endif`
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <map_pars_fragment>", `#include <map_pars_fragment>\n${SWAP_PARS}`)
    .replace("#include <map_fragment>", SWAP_MAP)
    .replace("#include <bumpmap_pars_fragment>", `#include <bumpmap_pars_fragment>\n${RELIEF_PARS}`)
    .replace(
      "#include <normal_fragment_maps>",
      "#include <normal_fragment_maps>\nif ( reliefScale != 0.0 ) normal = reliefNormal( - vViewPosition, normal, vMapUv, faceDirection );"
    );
}

function withRelief(material, grainX = 1, grainY = 1) {
  material.userData.relief = { map: { value: null }, scale: { value: 0 } };
  material.userData.swap = swapUniforms();
  material.userData.grainScale = { value: new THREE.Vector2(grainX, grainY) };
  material.onBeforeCompile = compileRelief;
  return material;
}

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

const SHOW_THROUGH = { rice: 0.14, white: 0.075, cream: 0.07, ivory: 0.07, blush: 0.07, grey: 0.065, aged: 0.06, kraft: 0.04, obsidian: 0 };

function withLeaf(material) {
  material.userData.leaf = { main: { value: new THREE.Color(1, 1, 1) }, second: { value: new THREE.Color(1, 1, 1) } };
  material.userData.swap = swapUniforms();
  material.onBeforeCompile = compileLeaf;
  return material;
}

const RELIEF_STRENGTH = 12;

export function createBookRig(book, { resolution = 0.75, onAsset = () => {}, lazy = false } = {}) {
  const d = DIM;
  const g = sharedGeometry();
  const root = new THREE.Group();
  root.name = `book-${book.id}`;
  const motion = new THREE.Group();
  motion.name = "book-motion";
  root.add(motion);
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
  const spineBandMaterial = physical({ color: book.material.color });
  const coverArt = withRelief(physical({
    map: targets.front.texture,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  }));
  const spineArt = withRelief(physical({
    map: targets.spine.texture,
    side: THREE.DoubleSide
  }), 0.32, 1);
  const backArt = withRelief(physical({
    map: targets.back.texture,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  }));
  const artFor = { front: coverArt, spine: spineArt, back: backArt };
  const foilParameters = (target, side) => ({
    map: target.texture,
    bumpMap: target.texture,
    bumpScale: 0.016,
    clearcoat: 0.18,
    clearcoatRoughness: 0.12,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2.5,
    polygonOffsetUnits: -2,
    side
  });
  const foilArt = withLeaf(physical(foilParameters(targets.frontFoil, THREE.FrontSide)));
  const spineFoilArt = withLeaf(physical(foilParameters(targets.spineFoil, THREE.DoubleSide)));
  const backFoilArt = withLeaf(physical(foilParameters(targets.backFoil, THREE.DoubleSide)));

  const cornerMetalMaterial = physical({
    metalness: 0.94,
    roughness: 0.24,
    bumpMap: getCornerBumpTexture("plain"),
    bumpScale: 0.008,
    clearcoat: 0.16,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.65
  });
  const endpaperMaterial = physical({
    map: targets.endpaper.texture, bumpMap: paperFace, bumpScale: 0.0018,
    roughness: 0.94, metalness: 0, sheen: 0.025, sheenRoughness: 1, side: THREE.DoubleSide
  });
  const foreEdgeMaterial = physical({
    map: edges.fore, bumpMap: edges.fore, bumpScale: 0.0034, side: THREE.DoubleSide
  });
  const headTailEdgeMaterial = physical({
    map: edges.headTail, bumpMap: edges.headTail, bumpScale: 0.0024, side: THREE.DoubleSide
  });
  const grooveMaterial = physical({
    roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1
  });
  const pageMaterial = physical({
    color: 0xe7dfcf, map: paperFace, bumpMap: paperFace, bumpScale: 0.0014,
    roughness: 0.95, metalness: 0, sheen: 0.025, sheenRoughness: 1
  });
  const headbandMaterial = physical({
    bumpMap: getHeadbandBumpTexture(), bumpScale: 0.0055,
    roughness: 0.52, metalness: 0.12, sheen: 0.32, sheenRoughness: 0.62
  });
  const signatureMaterial = physical({ color: 0xb5aa97, roughness: 0.98, metalness: 0 });
  const ribbonMaterial = physical({
    bumpMap: getWeaveTexture(), bumpScale: 0.0022,
    roughness: 0.44, metalness: 0.06, sheen: 0.62, sheenRoughness: 0.36,
    clearcoat: 0.12, clearcoatRoughness: 0.38, side: THREE.DoubleSide
  });
  const sheetMaterial = () => withThrough(physical({
    color: 0xeee6d7, map: paperFace, bumpMap: paperFace, bumpScale: 0.0012,
    roughness: 0.96, metalness: 0, sheen: 0.02, sheenRoughness: 1, side: THREE.FrontSide
  }));

  /* ----- page block and boards ----- */
  const pageBlock = createMesh(g.pageBlock, pageMaterial, "page-block");
  pageBlock.position.x = 0.018;
  block.add(pageBlock);

  // Subtle turned-page left stack block mounted on the inside of the front cover
  // so it rotates flush with frontPivot and swells naturally as the reader advances.
  const leftStack = createMesh(g.pageBlock, pageMaterial, "left-page-stack", false, true);
  leftStack.visible = false;

  const backPivot = new THREE.Group();
  backPivot.name = "back-cover-pivot";
  backPivot.position.set(-d.width * 0.5, 0, -d.depth * 0.5 - d.board * 0.5);
  const backCover = createMesh(g.cover, cloth, "back-cover");
  backCover.position.x = d.width * 0.5;
  backPivot.add(backCover);
  const backPlane = createMesh(g.coverSurface, backArt, "back-cover-art", false, true);
  backPlane.position.set(d.width * 0.5, 0, -d.board * 0.5 - 0.00035);
  backPlane.rotation.y = Math.PI;
  backPivot.add(backPlane);
  const backFoilPlane = createMesh(g.coverSurface, backFoilArt, "back-foil-art", false, false);
  backFoilPlane.position.set(d.width * 0.5, 0, -d.board * 0.5 - 0.00072);
  backFoilPlane.rotation.y = Math.PI;
  backPivot.add(backFoilPlane);
  const backEndpaper = createMesh(g.endpaper, endpaperMaterial, "back-endpaper", false, true);
  backEndpaper.position.set(d.width * 0.5, 0, d.board * 0.5 + 0.0005);
  backPivot.add(backEndpaper);
  const backTurnIns = addTurnIns(backPivot, "back", d.board * 0.5 + 0.001, cloth);
  const backGroove = createMesh(shared.plane, grooveMaterial, "back-hinge-groove", false, false);
  backGroove.scale.set(0.009, d.height * 0.96, 1);
  backGroove.position.set(0.036, 0, -d.board * 0.5 - 0.0005);
  backGroove.rotation.y = Math.PI;
  backPivot.add(backGroove);
  body.add(backPivot);

  const frontPivot = new THREE.Group();
  frontPivot.name = "front-cover-pivot";
  frontPivot.position.set(-d.width * 0.5, 0, d.depth * 0.5 + d.board * 0.5);
  const frontCover = createMesh(g.cover, cloth, "front-cover");
  frontCover.position.x = d.width * 0.5;
  frontPivot.add(frontCover);
  const coverPlane = createMesh(g.coverSurface, coverArt, "cover-art", false, true);
  coverPlane.position.set(d.width * 0.5, 0, d.board * 0.5 + 0.00035);
  frontPivot.add(coverPlane);
  const foilPlane = createMesh(g.coverSurface, foilArt, "foil-art", false, false);
  foilPlane.position.set(d.width * 0.5, 0, d.board * 0.5 + 0.00072);
  frontPivot.add(foilPlane);
  const frontEndpaper = createMesh(g.endpaper, endpaperMaterial, "front-endpaper", false, true);
  frontEndpaper.position.set(d.width * 0.5, 0, -d.board * 0.5 - 0.0005);
  frontEndpaper.rotation.y = Math.PI;
  frontPivot.add(frontEndpaper);
  const frontTurnIns = addTurnIns(frontPivot, "front", -d.board * 0.5 - 0.001, cloth);
  const frontGroove = createMesh(shared.plane, grooveMaterial, "front-hinge-groove", false, false);
  frontGroove.scale.set(0.009, d.height * 0.96, 1);
  frontGroove.position.set(0.036, 0, d.board * 0.5 + 0.0005);
  frontPivot.add(frontGroove);
  frontPivot.add(leftStack);
  body.add(frontPivot);

  /* ----- 3D wrap-around metal corner protectors ----- */
  const frontTopCorner = createMesh(g.cornerPlain, cornerMetalMaterial, "corner-front-top", true, true);
  frontTopCorner.position.set(d.width, d.height * 0.5, 0);
  frontPivot.add(frontTopCorner);

  const frontBottomCorner = createMesh(g.cornerPlainMirrored, cornerMetalMaterial, "corner-front-bottom", true, true);
  frontBottomCorner.position.set(d.width, -d.height * 0.5, 0);
  frontPivot.add(frontBottomCorner);

  // Back board outer face is -z: rotating top-front by PI around X gives bottom-back (-z outer).
  const backBottomCorner = createMesh(g.cornerPlain, cornerMetalMaterial, "corner-back-bottom", true, true);
  backBottomCorner.position.set(d.width, -d.height * 0.5, 0);
  backBottomCorner.rotation.x = Math.PI;
  backPivot.add(backBottomCorner);

  const backTopCorner = createMesh(g.cornerPlainMirrored, cornerMetalMaterial, "corner-back-top", true, true);
  backTopCorner.position.set(d.width, d.height * 0.5, 0);
  backTopCorner.rotation.x = Math.PI;
  backPivot.add(backTopCorner);

  const cornerCaps = [
    { mesh: frontTopCorner, mirrored: false },
    { mesh: frontBottomCorner, mirrored: true },
    { mesh: backBottomCorner, mirrored: false },
    { mesh: backTopCorner, mirrored: true }
  ];

  /* ----- sculpted molten wax seal (512px high-resolution crest or initial) ----- */
  const sealCanvas = document.createElement("canvas");
  sealCanvas.width = 512;
  sealCanvas.height = 512;
  const sealTexture = new THREE.CanvasTexture(sealCanvas);
  sealTexture.anisotropy = 4;
  const sealMaterial = physical({
    map: sealTexture,
    bumpMap: sealTexture,
    bumpScale: 0.026,
    roughness: 0.3,
    metalness: 0.02,
    clearcoat: 0.68,
    clearcoatRoughness: 0.2,
    sheen: 0.24,
    sheenRoughness: 0.45
  });
  const seal = createMesh(g.seal, sealMaterial, "wax-seal", true, true);
  seal.scale.set(1.16, 1.16, 1);
  frontPivot.add(seal);
  let sealKey = "";

  function applySeal() {
    const spec = rig.data.front.seal || {};
    seal.visible = Boolean(spec.show);
    if (!seal.visible) return;
    const sealScale = clamp(spec.scale ?? 1, 0.7, 1.45) * 1.16;
    seal.scale.set(sealScale, sealScale, clamp(spec.scale ?? 1, 0.75, 1.3));
    seal.position.set(d.width * (spec.x ?? 0.76), d.height * (0.5 - (spec.y ?? 0.82)), d.board * 0.5 + 0.0006);
    sealMaterial.color.set(spec.color || "#7a1c17");
    const motifKey = hasMotif(spec.motif) ? spec.motif : "";
    const letter = (spec.letter || rig.data.title || "").trim().slice(0, 1).toUpperCase();
    const nextKey = motifKey ? `m:${motifKey}:${rig.data.title || ""}` : `l:${letter}`;
    if (nextKey === sealKey) return;
    sealKey = nextKey;
    const ctx = sealCanvas.getContext("2d");
    const glow = ctx.createRadialGradient(240, 228, 28, 256, 256, 256);
    glow.addColorStop(0, "#d6d6d6");
    glow.addColorStop(0.68, "#b0b0b0");
    glow.addColorStop(0.84, "#e8e8e8");
    glow.addColorStop(1, "#8c8c8c");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);
    // Recessed stamp groove & beaded rim inside the sculpted wax collar
    ctx.strokeStyle = "#484848";
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(256, 256, 168, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#f6f6f6";
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.arc(256, 256, 152, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#626262";
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(256, 256, 136, 0, Math.PI * 2);
    ctx.stroke();
    if (motifKey) {
      drawMotif(ctx, motifKey, { cx: 260, cy: 262, size: 174, color: "#585858", alpha: 1, lineWidth: 9, text: rig.data.title || "" });
      drawMotif(ctx, motifKey, { cx: 256, cy: 256, size: 174, color: "#fafafa", alpha: 1, lineWidth: 8, text: rig.data.title || "" });
    } else {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '600 216px "Cormorant Garamond", "Noto Serif SC", serif';
      ctx.fillStyle = "#5a5a5a";
      ctx.fillText(letter || "\u2766", 260, 274);
      ctx.fillStyle = "#fafafa";
      ctx.fillText(letter || "\u2766", 256, 268);
    }
    sealTexture.needsUpdate = true;
  }

  /* ----- closure band and pen loop ----- */
  const bandMaterial = physical({ roughness: 0.58, metalness: 0, sheen: 0.55, sheenRoughness: 0.42, map: getWeaveTexture(), clearcoat: 0 });
  const band = new THREE.Group();
  band.name = "closure-band";
  const bandX = d.width * 0.84;
  const BAND_WIDTH = 0.03;
  const BAND_THICK = 0.0042;
  const BAND_REACH = 0.05;
  const bandStripLength = d.height - BAND_REACH * 2;
  if (!shared.bandStrip) {
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

  // Pen loop
  const penLoopMaterial = physical({ roughness: 0.74, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, side: THREE.DoubleSide, map: getWeaveTexture() });
  const penTabMaterial = physical({ roughness: 0.78, metalness: 0, sheen: 0.3, sheenRoughness: 0.6, map: getStitchTexture() });
  if (!shared.penLoop) {
    shared.penLoop = new THREE.CylinderGeometry(0.021, 0.021, 0.17, 24, 1, true);
    shared.penTab = new RoundedBoxGeometry(0.075, 0.17, 0.0024, 2, 0.0011);
  }
  const penLoop = new THREE.Group();
  penLoop.name = "pen-loop-group";
  const penTube = createMesh(shared.penLoop, penLoopMaterial, "pen-loop", true, false);
  penTube.scale.z = 0.62;
  penTube.position.set(d.width * 0.5 + 0.02, 0, -0.008);
  const penTab = createMesh(shared.penTab, penTabMaterial, "pen-tab", true, true);
  penTab.position.set(d.width * 0.5 - 0.016, 0, 0);
  penLoop.add(penTube, penTab);
  penLoop.position.y = d.height * 0.16;
  body.add(penLoop);

  /* ----- articulated 3D bookbinders' metal clasp (single or twin) ----- */
  const claspMaterial = physical({
    metalness: 0.96, roughness: 0.24, clearcoat: 0.22, clearcoatRoughness: 0.26,
    envMapIntensity: 1.75
  });
  if (!shared.claspPlate) {
    shared.claspPlate = new RoundedBoxGeometry(0.056, 0.088, 0.0046, 2, 0.0018);
    shared.claspRivet = new THREE.SphereGeometry(0.0048, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
    shared.claspStud = new THREE.CylinderGeometry(0.0095, 0.0115, 0.0075, 20);
    shared.claspStudCap = new THREE.SphereGeometry(0.0096, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    shared.claspKnuckle = new THREE.CylinderGeometry(0.0075, 0.0075, 0.058, 16);
  }
  const clasp = new THREE.Group();
  clasp.name = "clasp";
  let claspStrapGeo = new THREE.BufferGeometry();
  function createClaspUnit(suffix) {
    const unit = new THREE.Group();
    unit.name = `clasp-unit-${suffix}`;
    const strap = createMesh(claspStrapGeo, claspMaterial, `clasp-strap-${suffix}`, true, true);
    strap.rotation.z = -Math.PI * 0.5;
    const plate = createMesh(shared.claspPlate, claspMaterial, `clasp-plate-${suffix}`, true, true);
    const backPlate = createMesh(shared.claspPlate, claspMaterial, `clasp-back-plate-${suffix}`, true, true);
    const knuckle = createMesh(shared.claspKnuckle, claspMaterial, `clasp-knuckle-${suffix}`, true, true);
    const stud = createMesh(shared.claspStud, claspMaterial, `clasp-stud-${suffix}`, true, true);
    stud.rotation.x = Math.PI * 0.5;
    const studCap = createMesh(shared.claspStudCap, claspMaterial, `clasp-stud-cap-${suffix}`, false, true);
    studCap.rotation.x = Math.PI * 0.5;
    const rivets = [-1, 1].map((side) => {
      const r = createMesh(shared.claspRivet, claspMaterial, `clasp-rivet-${suffix}-${side}`, false, true);
      r.rotation.x = Math.PI * 0.5;
      unit.add(r);
      return r;
    });
    unit.add(strap, plate, backPlate, knuckle, stud, studCap);
    clasp.add(unit);
    return { unit, strap, plate, backPlate, knuckle, stud, studCap, rivets };
  }
  const claspUnits = [createClaspUnit("a"), createClaspUnit("b")];
  body.add(clasp);
  let claspBulk = 0;
  function shapeClasp() {
    const twin = rig.data.structure?.clasp?.style === "twin";
    claspUnits[0].unit.position.y = twin ? d.height * 0.24 : 0;
    claspUnits[1].unit.position.y = -d.height * 0.24;
    claspUnits[1].unit.visible = twin;
    if (claspBulk === bulk) return;
    claspBulk = bulk;
    const outer = (d.depth * bulk) * 0.5 + d.board + 0.0022;
    claspStrapGeo.dispose();
    const top = d.width * 0.5 + 0.0026;
    const radius = Math.min(0.011, outer * 0.9);
    const path = [];
    const add = (y, z) => path.push([y, z]);
    add(d.width * 0.5 - 0.095, outer + 0.0018);
    add(top - radius, outer + 0.0018);
    for (let i = 1; i <= 8; i += 1) {
      const a = (Math.PI * 0.5 * i) / 8;
      add((top - radius) + Math.sin(a) * radius, (outer - radius) + Math.cos(a) * radius);
    }
    add(top, -outer + radius);
    for (let i = 1; i <= 8; i += 1) {
      const a = Math.PI * 0.5 + (Math.PI * 0.5 * i) / 8;
      add((top - radius) + Math.sin(a) * radius, (-outer + radius) + Math.cos(a) * radius);
    }
    add(d.width * 0.5 - 0.088, -outer - 0.001);
    claspStrapGeo = sweepBand(path, 0.052, 0.0044, 0.08, true, true);
    claspUnits.forEach((u) => {
      u.strap.geometry = claspStrapGeo;
      u.plate.position.set(d.width * 0.5 - 0.084, 0, outer - 0.0004);
      u.backPlate.position.set(d.width * 0.5 - 0.072, 0, -outer + 0.0004);
      u.knuckle.position.set(d.width * 0.5 - 0.004, 0, -outer - 0.0015);
      u.stud.position.set(d.width * 0.5 - 0.082, 0, outer + 0.0045);
      u.studCap.position.set(d.width * 0.5 - 0.082, 0, outer + 0.0076);
      u.rivets[0].position.set(d.width * 0.5 - 0.092, 0.029, outer + 0.0016);
      u.rivets[1].position.set(d.width * 0.5 - 0.092, -0.029, outer + 0.0016);
    });
  }

  /* ----- gusseted inside paper pocket + peeking vintage collector card ----- */
  const pocketMaterial = physical({
    bumpMap: paperFace, bumpScale: 0.0016,
    roughness: 0.9, metalness: 0, sheen: 0.05, side: THREE.DoubleSide
  });
  const pocketShadowMaterial = physical({ color: 0x261d14, roughness: 0.98, metalness: 0, side: THREE.DoubleSide });
  const pocketCardCanvas = document.createElement("canvas");
  pocketCardCanvas.width = 256;
  pocketCardCanvas.height = 176;
  const pocketCardTexture = new THREE.CanvasTexture(pocketCardCanvas);
  pocketCardTexture.colorSpace = THREE.SRGBColorSpace;
  pocketCardTexture.anisotropy = 4;
  const pocketCardMaterial = physical({
    map: pocketCardTexture, bumpMap: paperFace, bumpScale: 0.0012,
    roughness: 0.92, metalness: 0, side: THREE.DoubleSide
  });
  let pocketCardKey = "";
  function paintPocketCard() {
    const title = (rig.data.title || "Folio Atelier").slice(0, 22);
    const key = `${title}|${rig.data.foil?.color || "#d8b464"}`;
    if (key === pocketCardKey) return;
    pocketCardKey = key;
    const ctx = pocketCardCanvas.getContext("2d");
    ctx.fillStyle = "#f4ecdc";
    ctx.fillRect(0, 0, 256, 176);
    ctx.strokeStyle = "rgba(80,58,36,0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 236, 156);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(16, 16, 224, 144);
    ctx.fillStyle = "#6c5238";
    ctx.font = '600 11px "Inter", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("EX LIBRIS  \u00b7  FOLIO ATELIER", 128, 38);
    ctx.fillStyle = "#2b2218";
    ctx.font = 'italic 500 20px "Cormorant Garamond", "Noto Serif SC", serif';
    ctx.fillText(title, 128, 66);
    ctx.strokeStyle = "rgba(110,88,62,0.3)";
    for (let y = 92; y <= 144; y += 16) {
      ctx.beginPath();
      ctx.moveTo(32, y);
      ctx.lineTo(224, y);
      ctx.stroke();
    }
    pocketCardTexture.needsUpdate = true;
  }
  const pocket = new THREE.Group();
  pocket.name = "pocket";
  const pocketHeight = d.height * 0.39;
  const pocketFace = createMesh(g.pocket, pocketMaterial, "pocket", false, true);
  // Subtle dark interior depth backing inside the thumb-notch opening
  const pocketBacking = createMesh(shared.plane, pocketShadowMaterial, "pocket-backing", false, false);
  pocketBacking.scale.set(d.width * 0.24, 0.06, 1);
  pocketBacking.position.set(0, pocketHeight * 0.5 - 0.032, -0.0009);
  const pocketCard = createMesh(g.pocketCard, pocketCardMaterial, "pocket-card", false, true);
  pocketCard.position.set(0.035, pocketHeight * 0.26, -0.00025);
  pocketCard.rotation.z = -0.055;
  pocket.add(pocketBacking, pocketCard, pocketFace);
  pocket.position.set(d.width * 0.5 - 0.002, -d.height * 0.5 + 0.052 + pocketHeight * 0.5, -d.board * 0.5 - 0.0024);
  pocket.rotation.y = Math.PI;
  frontPivot.add(pocket);

  /* ----- slipcase (with semicircular thumb-cutout & dynamic hardware clearance) ----- */
  if (!shared.caseWeave) {
    shared.caseWeave = getWeaveTexture().clone();
    shared.caseWeave.repeat.set(10, 14);
  }
  const caseMaterial = physical({ roughness: 0.8, metalness: 0, sheen: 0.35, sheenRoughness: 0.7, map: shared.caseWeave });
  const slipcase = new THREE.Group();
  slipcase.name = "slipcase";
  const casePanels = ["front", "back", "head", "tail", "fore"].map((name) => {
    const geo = name === "front" || name === "back" ? g.slipcaseWall : shared.box;
    const panel = createMesh(geo, caseMaterial, `slipcase-${name}`, true, true);
    slipcase.add(panel);
    return panel;
  });
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
  let caseFade = 1;
  function shapeCase() {
    const wall = 0.0095;
    const structure = rig.data.structure || {};
    const hasCorners = (rig.data.details?.corners?.style || "none") !== "none";
    const hasSeal = Boolean(rig.data.front?.seal?.show);
    const hasBand = Boolean(structure.band?.show);
    const hasClasp = Boolean(structure.clasp?.show);
    // Compute exact inner clearance so 3D corners, wax seal, band & clasp never clip slipcase walls.
    let gapZ = 0.005;
    let gapEdge = 0.005;
    if (hasCorners) { gapZ += 0.0045; gapEdge += 0.0045; }
    if (hasBand) { gapZ = Math.max(gapZ, 0.0085); gapEdge = Math.max(gapEdge, 0.0085); }
    if (hasSeal) { gapZ = Math.max(gapZ, 0.0155); }
    if (hasClasp) { gapZ = Math.max(gapZ, 0.0165); gapEdge = Math.max(gapEdge, 0.013); }
    const inner = (d.depth * bulk) * 0.5 + d.board + gapZ;
    const left = -d.width * 0.5 - 0.004;
    const right = d.width * 0.5 + gapEdge;
    const top = d.height * 0.5 + gapEdge;
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
    caseLabel.visible = structure.slipcase?.label !== false;
    caseLabel.position.set((left + right) * 0.5 + 0.04, d.height * 0.12, inner + wall + 0.0008);
  }

  function syncCaseOpacity() {
    const alpha = rig.opacity * caseFade;
    const opaque = alpha >= 0.999;
    caseMaterial.opacity = alpha;
    caseLabelMaterial.opacity = alpha;
    if (caseMaterial.transparent === opaque) {
      caseMaterial.transparent = !opaque;
      caseMaterial.depthWrite = opaque;
      caseLabelMaterial.transparent = !opaque;
      caseLabelMaterial.depthWrite = opaque;
    }
  }

  function setCase(amount) {
    caseAmount = amount;
    const hasCase = Boolean(rig.data.structure?.slipcase?.show);
    const shown = hasCase && amount > 0.002;
    slipcase.visible = shown;
    // Tuck pen loop cleanly when the book is seated inside its slipcase so it never pierces the fore wall.
    const penWanted = Boolean(rig.data.structure?.penLoop?.show);
    penLoop.visible = penWanted && !(hasCase && amount > 0.22);
    if (!shown) return;
    const eased = amount * amount * (3 - 2 * amount);
    slipcase.position.x = (1 - eased) * d.width * 0.9;
    caseFade = clamp(eased * 1.6, 0, 1);
    syncCaseOpacity();
  }

  /* ----- closure band / clasp slide ----- */
  const bandState = { slide: 0, tug: 0, tugVelocity: 0 };
  let bandFade = 1;
  const BAND_SLIDE_SECONDS = 0.3;
  const BAND_SLIDE_DISTANCE = d.width * 0.24;

  function syncBandOpacity() {
    const alpha = rig.opacity * bandFade;
    const opaque = alpha >= 0.999;
    bandMaterial.opacity = alpha;
    claspMaterial.opacity = alpha;
    if (bandMaterial.transparent === opaque) {
      bandMaterial.transparent = !opaque;
      bandMaterial.depthWrite = opaque;
      claspMaterial.transparent = !opaque;
      claspMaterial.depthWrite = opaque;
    }
  }

  function updateBand(delta = 1, { open = false, tug = false } = {}) {
    const bandWanted = Boolean(bandParts[0].userData.wanted);
    const claspWanted = Boolean(clasp.userData.wanted);
    const wanted = bandWanted || claspWanted;
    const target = open ? 1 : 0;
    const step = delta / BAND_SLIDE_SECONDS;
    bandState.slide = target > bandState.slide
      ? Math.min(target, bandState.slide + step)
      : Math.max(target, bandState.slide - step);
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
    // Mechanical brass clasp unlatch: hinges open outward slightly before gliding away.
    const unlatch = clamp(eased / 0.45, 0, 1);
    clasp.position.x = shift + unlatch * 0.016;
    clasp.rotation.y = -(unlatch * unlatch) * 0.24 - bandState.tug * 0.035;
    bandFront.position.z = d.board * 0.5 + BAND_THICK * 0.5 + bandState.tug * 0.003;
    bandFade = 1 - clamp((eased - 0.3) / 0.7, 0, 1);
    syncBandOpacity();
    const on = bandState.slide < 1;
    bandParts.forEach((part) => { part.visible = bandWanted && on; });
    clasp.visible = claspWanted && on;
    return wanted && (bandState.slide !== target || tugMoving);
  }

  /* ----- leaves ----- */
  const leaves = [];
  const pageSurfaces = [];
  const sheetMaterials = [];
  const visiblePageWidth = d.pageWidth - d.spineWidth * 0.42;
  const visiblePageHeight = d.pageHeight - 0.014;
  for (let order = 0; order < PRINTED_LEAVES + BLANK_LEAVES; order += 1) {
    const pivot = new THREE.Group();
    pivot.name = `leaf-${order}`;
    const faces = [1, -1].map((direction) => {
      const geometry = new THREE.PlaneGeometry(1, 1, FLEXIBLE_PAGE_SEGMENTS, FLEXIBLE_PAGE_VERTICAL_SEGMENTS);
      const material = sheetMaterial();
      sheetMaterials.push(material);
      const mesh = createMesh(geometry, material, `leaf-${order}-${direction > 0 ? "front" : "back"}`, false, true);
      mesh.scale.set(visiblePageWidth, visiblePageHeight, 1);
      mesh.position.set(visiblePageWidth * 0.5, 0, 0.00022 * direction);
      if (direction < 0) mesh.rotation.y = Math.PI;
      pivot.add(mesh);
      pageSurfaces.push(mesh);
      return {
        mesh,
        material,
        target: null,
        surface: precomputeLeafSurface(geometry, direction)
      };
    });
    pivot.userData.faces = faces;
    pivot.userData.printed = order < PRINTED_LEAVES;
    pivot.userData.flex = {
      curve: 0,
      curveVelocity: 0,
      twist: 0,
      twistVelocity: 0,
      restArch: 0,
      surfaces: faces.map((face) => face.surface)
    };
    body.add(pivot);
    leaves.push(pivot);
  }

  let spreadProgress = 0;
  let leftStackDepth = 0;
  function assignLeafSlots() {
    const count = leaves.length;
    const leftLift = leftStackDepth + (leftStackDepth > 0 ? 0.005 : 0);
    leaves.forEach((pivot, order) => {
      const stackIndex = count - 1 - order;
      pivot.userData.order = order;
      pivot.userData.restZ = (d.pageDepth * bulk) * 0.5 + 0.0015 + stackIndex * 0.0015;
      pivot.userData.turnedZ = (d.depth * bulk) * 0.5 + d.board + 0.007 + leftLift + order * 0.0018;
      pivot.position.x = -d.width * 0.5 + d.spineWidth * 0.65;
    });
  }
  assignLeafSlots();
  leaves.forEach((pivot) => { pivot.position.z = pivot.userData.restZ; });

  /** Shift subtle left/right page stack thickness as the reader moves through the book. */
  function setSpreadProgress(ratio, openAmount = 1) {
    const r = clamp(ratio, 0, 1);
    const a = clamp(openAmount, 0, 1);
    spreadProgress = r;
    const showLeft = a > 0.45 && r > 0.14;
    leftStack.visible = showLeft;
    if (showLeft) {
      const thick = Math.max(0.04, (r - 0.1) * 0.24 * bulk) * a;
      leftStackDepth = d.pageDepth * thick;
      leftStack.scale.set(0.94, 0.985, thick);
      // Rest flush on the inside front endpaper (local -z of frontPivot faces the reader when open).
      leftStack.position.set(
        d.spineWidth * 0.65 + d.pageWidth * 0.47,
        0,
        -d.board * 0.5 - 0.0035 - leftStackDepth * 0.5
      );
    } else {
      leftStackDepth = 0;
    }
    assignLeafSlots();
  }

  /* ----- spine, 3D raised bands, headbands, draped ribbons, edges ----- */
  const spine = createMesh(g.spine, spineArt, "rounded-spine");
  spine.position.x = -d.width * 0.5 + 0.0015;
  block.add(spine);
  const spineFoil = createMesh(g.spineFoil, spineFoilArt, "spine-foil", false, false);
  spineFoil.position.x = spine.position.x - 0.00045;
  block.add(spineFoil);

  // Up to five physical 3D raised cords hugging the rounded spine
  const spineBands = new THREE.Group();
  spineBands.name = "spine-raised-bands";
  spineBands.position.x = spine.position.x;
  const bandHeightSpan = d.height - 0.006;
  const spineBandMeshes = [];
  for (let idx = 0; idx < MAX_SPINE_BANDS; idx += 1) {
    const cord = createMesh(g.spineBand, spineBandMaterial, `spine-band-${idx}`, true, true);
    spineBands.add(cord);
    spineBandMeshes.push(cord);
  }
  block.add(spineBands);

  const liningMaterial = physical({ roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
  const spineLining = createMesh(g.spineLining, liningMaterial, "spine-lining");
  spineLining.position.set(-d.width * 0.5 + d.spineWidth * 0.38, 0, 0);
  block.add(spineLining);

  // Curved silk headbands mounted on `body` (decoupled from `block.scale.z` distortion)
  const headbands = [-1, 1].map((direction) => {
    const headband = createMesh(g.headband, headbandMaterial, `headband-${direction}`);
    headband.position.set(-d.pageWidth * 0.5 + 0.04, direction * (d.pageHeight * 0.5 - 0.003), 0);
    body.add(headband);
    return headband;
  });

  // Naturally draped satin ribbons mounted on `body` so `bulk` never stretches their drape.
  const ribbonLength = d.pageHeight * 0.56;
  const ribbonGeo1 = createDrapedRibbonGeometry(0.036, ribbonLength, 0.2);
  const ribbonGeo2 = createDrapedRibbonGeometry(0.034, ribbonLength * 1.08, 1.9);
  const ribbonBase1 = Float32Array.from(ribbonGeo1.attributes.position.array);
  const ribbonBase2 = Float32Array.from(ribbonGeo2.attributes.position.array);

  const ribbonAnchorY = -d.pageHeight * 0.14;
  const ribbon = createMesh(ribbonGeo1, ribbonMaterial, "ribbon-bookmark", true, true);
  ribbon.position.set(
    -d.pageWidth * 0.5 + 0.095 + (book.seed % 3) * 0.018,
    ribbonAnchorY,
    d.pageDepth * 0.5 + 0.003
  );
  body.add(ribbon);

  const secondRibbonMaterial = ribbonMaterial.clone();
  const secondRibbon = createMesh(ribbonGeo2, secondRibbonMaterial, "ribbon-bookmark-2", true, true);
  secondRibbon.position.set(ribbon.position.x + 0.056, ribbonAnchorY - 0.014, ribbon.position.z + 0.0024);
  body.add(secondRibbon);

  // Gatherings showing on a plain fore-edge only.
  const signatureMarks = [];
  for (let index = 0; index < 6; index += 1) {
    const signature = createMesh(shared.box, signatureMaterial, `page-signature-${index + 1}`, false, true);
    signatureMarks.push(signature);
    signature.scale.set(0.0035, 0.00135, d.pageDepth * 0.94);
    signature.position.set(
      0.018 + d.pageWidth * 0.5 + 0.0008,
      -d.pageHeight * 0.5 + ((index + 1) / 7) * d.pageHeight,
      0
    );
    block.add(signature);
  }

  // Edge planes span the full block faces cleanly so fore/head/tail corners meet with zero white gap.
  const foreEdge = createMesh(shared.plane, foreEdgeMaterial, "fore-edge", false, true);
  foreEdge.scale.set(d.pageDepth * 0.992, d.pageHeight - 0.004, 1);
  foreEdge.rotation.y = Math.PI * 0.5;
  foreEdge.position.set(0.018 + d.pageWidth * 0.5 + 0.0012, 0, 0);
  block.add(foreEdge);
  [-1, 1].forEach((direction) => {
    const edge = createMesh(shared.plane, headTailEdgeMaterial, direction > 0 ? "head-edge" : "tail-edge", false, true);
    edge.scale.set(d.pageWidth - 0.006, d.pageDepth * 0.992, 1);
    edge.rotation.x = direction > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    edge.position.set(0.018, direction * (d.pageHeight * 0.5 + 0.0012), 0);
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
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const contactShadow = createMesh(shared.plane, contactShadowMaterial, "contact-shadow", false, false);
  contactShadow.scale.set(d.width * 1.26, d.depth * 2.15, 1);
  contactShadow.rotation.x = -Math.PI * 0.5;
  contactShadow.position.set(0, -d.height * 0.5 - 0.018, 0.025);
  root.add(contactShadow);

  // Split solid materials (opaque at rest for Early-Z!) vs permanently alpha-blended layers.
  const opaqueMaterials = [
    cloth, spineBandMaterial, coverArt, spineArt, backArt, cornerMetalMaterial,
    endpaperMaterial, foreEdgeMaterial, headTailEdgeMaterial, grooveMaterial,
    pageMaterial, ...sheetMaterials, headbandMaterial, signatureMaterial, liningMaterial,
    ribbonMaterial, secondRibbonMaterial, penLoopMaterial, penTabMaterial,
    pocketMaterial, pocketShadowMaterial, pocketCardMaterial, sealMaterial
  ];
  const alphaMaterials = [foilArt, spineFoilArt, backFoilArt];
  const fadeMaterials = [...opaqueMaterials, ...alphaMaterials, bandMaterial, claspMaterial, caseMaterial, caseLabelMaterial];

  function setOpacity(value) {
    rig.opacity = value;
    const opaque = value >= 0.999;
    for (let i = 0; i < opaqueMaterials.length; i += 1) {
      const m = opaqueMaterials[i];
      m.opacity = value;
      if (m.transparent === opaque) {
        m.transparent = !opaque;
        m.depthWrite = opaque;
      }
    }
    for (let i = 0; i < alphaMaterials.length; i += 1) {
      alphaMaterials[i].opacity = value;
    }
    // While the boards are alpha-blended (depthWrite = false during shelf fade-in),
    // hide internal silk ribbons so they never bleed through the front cover.
    const showRibbons = opaque && Boolean(rig.data.details?.ribbon?.show);
    ribbon.visible = showRibbons;
    secondRibbon.visible = showRibbons && (rig.data.details?.ribbon?.count || 1) >= 2;
    syncBandOpacity();
    syncCaseOpacity();
  }

  /* ----- structure & look ----- */
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
    body.position.y = -d.height * 0.5 * (1 - size);
    const halfBlock = (d.depth * bulk) * 0.5;
    frontPivot.position.z = halfBlock + d.board * 0.5;
    backPivot.position.z = -halfBlock - d.board * 0.5;
    // The spine and its raised cords span the block and both boards tightly.
    const spineSpan = (d.depth * bulk + d.board * 2.02) / ((d.depth + d.board * 2.02) * bulk);
    spine.scale.z = spineSpan;
    spineFoil.scale.z = spineSpan;
    spineBands.scale.z = spineSpan;
    // Keep spine cloth/leather normal & roughness grain isotropic across every bulk.
    spineArt.userData.grainScale.value.set(clamp(0.32 * bulk, 0.18, 0.56), 1);
    // Keep curved silk headbands flush with spine depth without distorting their tube cross-section.
    headbands.forEach((hb) => { hb.scale.set(1, 1, clamp(bulk * 0.96, 0.5, 1.56)); });
    // Position silk bookmarks flush against the active page block bulk (decoupled from block.scale.z).
    ribbon.position.z = (d.pageDepth * bulk) * 0.5 + 0.003;
    secondRibbon.position.z = ribbon.position.z + 0.0024;

    // Corner caps match exact square or rounded board geometry at the corner apex.
    frontTopCorner.position.set(d.width, d.height * 0.5, 0);
    frontBottomCorner.position.set(d.width, -d.height * 0.5, 0);
    backTopCorner.position.set(d.width, d.height * 0.5, 0);
    backBottomCorner.position.set(d.width, -d.height * 0.5, 0);

    assignLeafSlots();
    contactShadow.scale.set(d.width * 1.26 * size, d.depth * 2.15 * bulk, 1);
    shapeBandWraps();
    const showBand = Boolean(structure.band?.show);
    bandParts.forEach((part) => { part.userData.wanted = showBand; });
    bandMaterial.color.set(structure.band?.color || "#1d1813");
    penLoop.position.z = -halfBlock - d.board - 0.0013;
    penLoopMaterial.color.set(structure.penLoop?.color || "#1d1813");
    penTabMaterial.color.set(structure.penLoop?.color || "#1d1813");
    shapeClasp();
    clasp.userData.wanted = Boolean(structure.clasp?.show);
    claspMaterial.color.set((CLASP_METALS.find((metal) => metal.id === structure.clasp?.metal) || CLASP_METALS[0]).color);
    pocket.visible = Boolean(structure.pocket?.show);
    pocketCard.visible = Boolean(structure.pocket?.show) && structure.pocket?.card !== false;
    if (pocketCard.visible) paintPocketCard();
    const endpaperHex = rig.data.details?.endpaper?.color || "#efe6d4";
    pocketMaterial.color.set(mixHex(endpaperHex, "#3a2a1a", 0.1));
    pocketShadowMaterial.color.set(mixHex(endpaperHex, "#2a1d14", 0.34));
    liningMaterial.color.set(mixHex(endpaperHex, "#3a2a1a", 0.3));
    shapeCase();
    caseMaterial.color.set(structure.slipcase?.color || "#3a2a20");
    if (structure.slipcase?.show) paintCaseLabel();
    setCase(caseAmount);
    applySeal();
    updateBand(1, { open: frontPivot.rotation.y < -0.02 });
  }

  let lookReady = false;
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

    [cloth, spineBandMaterial, coverArt, spineArt, backArt].forEach((material) => {
      material.normalMap = maps.normal;
      material.normalScale.setScalar(material === cloth || material === spineBandMaterial ? look.normal : look.normal * 0.88);
      material.roughnessMap = maps.roughness;
      material.roughness = look.roughness;
      material.metalness = look.metalness;
      material.sheen = look.sheen;
      material.sheenRoughness = look.sheenRoughness;
      material.sheenColor.copy(sheenColor);
      material.clearcoat = look.clearcoat;
      material.clearcoatRoughness = look.clearcoatRoughness;
      if (!lookReady) material.needsUpdate = true;
    });
    lookReady = true;
    cloth.color.set(spec.material.color);
    const twoTone = spec.material.binding === "quarter" || spec.material.binding === "half";
    const spineDye = twoTone ? spec.material.second : spec.material.color;
    spineBandMaterial.color.set(spineDye).multiplyScalar(0.95);
    const isStab = Boolean(spec.details?.stitch?.show);
    const isBanded = !isStab && BANDED.has(spec.spine?.style);
    spineBands.visible = isBanded;
    if (isBanded) {
      const bandPositions = spineBandPositions(spec.spine.style);
      const spineTitle = spec.spine.texts?.find((layer) => layer.id === "spine-title");
      const labelled = Boolean(spec.spine.label?.show && spineTitle);
      const labelHalf = labelled ? (spineTitle.orient === "horizontal" ? 0.085 : 0.2) : 0;
      const labelMin = labelled ? spineTitle.y - labelHalf - 0.022 : -1;
      const labelMax = labelled ? spineTitle.y + labelHalf + 0.022 : -1;
      spineBandMeshes.forEach((cord, idx) => {
        if (idx >= bandPositions.length) {
          cord.visible = false;
          return;
        }
        const pos = bandPositions[idx];
        cord.position.y = (0.5 - pos) * bandHeightSpan;
        cord.visible = !(labelled && pos > labelMin && pos < labelMax);
      });
    }

    // French grooves only exist on case-bound books, never on stab-stitched bindings.
    const showGroove = !isStab;
    frontGroove.visible = showGroove;
    backGroove.visible = showGroove;
    grooveMaterial.color.set(spineDye).multiplyScalar(0.42);

    const secondColor = new THREE.Color(spec.foil.second || spec.foil.color);
    const metallic = spec.foil.metalness > 0.5;
    const texture = spec.foil.texture || "polished";
    const foilRough = Math.min(1, spec.foil.roughness + (texture === "matte" ? 0.34 : texture === "brushed" ? 0.06 : 0));
    const foilClearcoat = texture === "matte" ? 0 : metallic ? 0.2 : 0.04;
    const foilEnv = (metallic ? 2.15 : 1) * (texture === "matte" ? 0.62 : 1);
    const anisotropy = texture === "matte" ? 0 : texture === "brushed" ? 0.9 : metallic ? 0.34 : 0;
    const iridescence = spec.foil.iridescence || 0;

    [foilArt, spineFoilArt, backFoilArt].forEach((material) => {
      material.color.setRGB(1, 1, 1);
      material.userData.leaf.main.value.copy(foilColor);
      material.userData.leaf.second.value.copy(secondColor);
      material.metalness = spec.foil.metalness;
      material.roughness = foilRough;
      material.bumpScale = (metallic ? 0.017 : 0.008) * stampDepth() * 2 * stampSign();
      material.clearcoat = foilClearcoat;
      material.envMapIntensity = foilEnv;
      if ((material.anisotropy > 0) !== (anisotropy > 0)) material.needsUpdate = true;
      material.anisotropy = anisotropy;
      material.emissive.setRGB(1, 1, 1);
      material.emissiveIntensity = metallic ? 0.16 : 0.05;
      if ((material.iridescence > 0) !== (iridescence > 0)) material.needsUpdate = true;
      material.iridescence = iridescence;
      material.iridescenceIOR = 1.9;
      material.iridescenceThicknessRange = [180, 620];
      if (iridescence > 0) material.emissiveIntensity *= 1 - iridescence * 0.35;
      material.userData.rest = { emissive: material.emissiveIntensity, environment: material.envMapIntensity };
    });

    // 3D metal corner protectors match the book's chosen foil metal, finish, and square/rounded corners.
    const cornerStyle = spec.details.corners?.style || "none";
    const cornersVisible = cornerStyle !== "none";
    const roundedCorners = spec.structure?.corners === "rounded";
    const cornerBank = roundedCorners ? roundedGeometry() : g;
    const cornerKey = cornerStyle === "filigree"
      ? "cornerFiligree"
      : cornerStyle === "scalloped"
        ? "cornerScalloped"
        : "cornerPlain";
    cornerCaps.forEach(({ mesh, mirrored }) => {
      mesh.visible = cornersVisible;
      if (!cornersVisible) return;
      mesh.geometry = cornerBank[mirrored ? `${cornerKey}Mirrored` : cornerKey];
    });
    if (cornersVisible) {
      cornerMetalMaterial.color.copy(foilColor);
      cornerMetalMaterial.metalness = Math.max(0.84, spec.foil.metalness);
      cornerMetalMaterial.roughness = clamp(foilRough + 0.04, 0.16, 0.65);
      cornerMetalMaterial.clearcoat = foilClearcoat;
      cornerMetalMaterial.envMapIntensity = Math.max(1.35, foilEnv * 0.85);
      if ((cornerMetalMaterial.anisotropy > 0) !== (anisotropy > 0)) cornerMetalMaterial.needsUpdate = true;
      cornerMetalMaterial.anisotropy = anisotropy;
      if ((cornerMetalMaterial.iridescence > 0) !== (iridescence > 0)) cornerMetalMaterial.needsUpdate = true;
      cornerMetalMaterial.iridescence = iridescence;
      cornerMetalMaterial.bumpMap = getCornerBumpTexture(cornerStyle);
      cornerMetalMaterial.bumpScale = cornerStyle === "plain" ? 0.003 : cornerStyle === "filigree" ? 0.014 : 0.011;
    }

    if (glint > 0) setGlint(glint);

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
    foreEdgeMaterial.bumpMap = edgeMaps.fore;
    headTailEdgeMaterial.map = edgeMaps.headTail;
    headTailEdgeMaterial.bumpMap = edgeMaps.headTail;
    const paperMeta = PAPER_STOCKS[spec.interior.paper] || PAPER_STOCKS.cream;
    [foreEdgeMaterial, headTailEdgeMaterial].forEach((material) => {
      if (edge.style === "gilt" || edge.style === "gauffered") {
        material.color.set(edge.color || "#d9b25f");
        material.metalness = 0.94;
        material.roughness = 0.28;
        material.envMapIntensity = 1.65;
        material.sheen = 0;
      } else if (edge.style === "gilt_crimson") {
        // Traditional crimson under gold: warm gilded sheen over carmine red edge.
        material.color.set(0xffffff);
        material.metalness = 0.62;
        material.roughness = 0.34;
        material.envMapIntensity = 1.45;
        material.sheen = 0.14;
      } else if (edge.style === "tinted") {
        material.color.set(edge.color || "#c6532f");
        material.metalness = 0;
        material.roughness = 0.88;
        material.envMapIntensity = 1;
        material.sheen = 0.02;
      } else {
        material.color.set(plainEdge && paperMeta.dark ? "#2c2c30" : 0xffffff);
        material.metalness = 0;
        material.roughness = 0.93;
        material.envMapIntensity = 1;
        material.sheen = 0.018;
      }
    });
    // Harmonize page block bevel tint with edge finish & paper stock so corners stay seamless.
    if (edge.style === "gilt" || edge.style === "gauffered") {
      pageMaterial.color.set(mixHex(edge.color || "#d9b25f", "#c9a86a", 0.35));
    } else if (edge.style === "gilt_crimson") {
      pageMaterial.color.set("#8f322a");
    } else if (edge.style === "tinted") {
      pageMaterial.color.set(edge.color || "#c6532f");
    } else {
      pageMaterial.color.set(paperMeta.base || "#e7dfcf");
    }

    ribbon.visible = spec.details.ribbon.show !== false;
    ribbonMaterial.color.set(spec.details.ribbon.color);
    secondRibbon.visible = ribbon.visible && Boolean(spec.details.ribbon.double);
    secondRibbonMaterial.color.set(spec.details.ribbon.second || spec.details.ribbon.color);
    updateRibbonGeometry(true);
    const headband = spec.details.headband;
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
    pocketMaterial.bumpMap = stock;
    rig.paperFace = stock;
    rig.showThrough = SHOW_THROUGH[spec.interior.paper] ?? 0.07;
    leaves.forEach(linkShowThrough);
  }

  const PAINTERS = { front: paintFront, spine: paintSpine, back: paintBack };
  const shown = { front: {}, spine: {}, back: {}, endpaper: {} };

  /* ----- cross-fades ----- */
  const swapFor = {
    front: [coverArt, foilArt],
    spine: [spineArt, spineFoilArt],
    back: [backArt, backFoilArt]
  };
  const swapTargets = {};
  const swapRuns = {};

  function beginSwap(face, duration) {
    const run = swapRuns[face];
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

  function stepSwaps(delta) {
    let running = false;
    Object.entries(swapRuns).forEach(([face, run]) => {
      run.time += delta;
      const t = Math.min(1, run.time / run.duration);
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

  let paintedFaces = 0;

  function repaintFace(face, signature, { force, draft, draftScale, hidden, fade = 0 }) {
    const state = shown[face];
    const relief = reliefOn();
    const changed = {
      base: force || state.base !== signature.base,
      foil: force || state.foil !== signature.foil,
      relief: relief && (force || state.relief !== signature.relief || Boolean(state.reliefStale))
    };
    const content = changed.base || changed.foil || changed.relief;
    if (draft && content && hidden) return true;
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
    const reliefLayer = changed.relief && !draft ? reliefTarget(face, wanted) : null;
    if (changed.relief) state.reliefStale = !reliefLayer;
    setFastGrain(wanted < scale);
    paintedFaces += 1;
    try {
      perf.paint(face, () => PAINTERS[face](rig.data, base, foil, onAsset, changed, reliefLayer, { corners3d: true }));
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

  function repaint({ force = false, draft = false, hidden = null, budget = Infinity, fade = 0 } = {}) {
    rig.painted = true;
    const faces = ["front", "spine", "back"];
    if (budget < faces.length && hidden) faces.sort((a, b) => Number(Boolean(hidden[a])) - Number(Boolean(hidden[b])));
    const signatures = faces.map((face) => faceSignatures(rig.data, face));
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
    ["spine", spine, new THREE.Vector3(-1, 0, 0), -0.45]
  ];
  const probeNormal = new THREE.Vector3();
  const probeCentre = new THREE.Vector3();

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

  /** Stand-ins for every switchable shader feature combination so edits never compile mid-frame. */
  function shaderVariants() {
    const group = new THREE.Group();
    const variant = (source, mesh, set) => {
      const saved = source.userData;
      source.userData = {};
      const material = source.clone();
      source.userData = saved;
      if (saved.relief || saved.leaf) {
        if (saved.relief) material.userData.relief = saved.relief;
        if (saved.leaf) material.userData.leaf = saved.leaf;
        if (saved.swap) material.userData.swap = saved.swap;
        if (saved.grainScale) material.userData.grainScale = saved.grainScale;
        material.onBeforeCompile = source.onBeforeCompile;
      }
      set(material);
      const stand = new THREE.Mesh(mesh.geometry, material);
      stand.castShadow = mesh.castShadow;
      stand.receiveShadow = mesh.receiveShadow;
      group.add(stand);
    };
    const both = [0, 1];
    [[cloth, frontCover], [spineBandMaterial, spineBands.children[0]], [coverArt, coverPlane], [backArt, backPlane], [spineArt, spine]].forEach(([material, mesh]) => {
      both.forEach((sheen) => both.forEach((coat) => variant(material, mesh, (target) => {
        target.sheen = sheen * 0.4;
        target.clearcoat = coat * 0.2;
      })));
    });
    [[foreEdgeMaterial, foreEdge], [headTailEdgeMaterial, foreEdge]].forEach(([material, mesh]) => {
      both.forEach((sheen) => variant(material, mesh, (target) => {
        target.sheen = sheen * 0.02;
      }));
    });
    [[foilArt, foilPlane], [backFoilArt, backFoilPlane], [spineFoilArt, spineFoil], [cornerMetalMaterial, frontTopCorner]].forEach(([material, mesh]) => {
      both.forEach((coat) => both.forEach((grain) => both.forEach((film) => variant(material, mesh, (target) => {
        target.clearcoat = coat * 0.18;
        target.anisotropy = grain * 0.34;
        target.iridescence = film * 0.5;
      }))));
    });
    return group;
  }

  function setResolution(next, { defer = false } = {}) {
    if (next === scale) return false;
    scale = next;
    if (defer) return rig.painted;
    if (rig.painted) repaint();
    Object.values(targets).forEach((target) => target.trim());
    return false;
  }

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

  // Organic flexible bend + shelf-rest floor deflection on draped satin ribbons,
  // with inline analytical normals (zero computeVertexNormals cost!).
  let lastRibbonAngle = 999;
  let ribbonShelfRest = 1;
  let lastRibbonRest = -1;
  function bendRibbon(geo, base, angle, length, anchorY, rest) {
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const posArr = pos.array;
    const normArr = norm.array;
    const count = pos.count;
    const sinA = Math.sin(angle);
    const billow = Math.abs(angle) * 0.045;
    // Shelf top surface in body-local coordinates sits just below y = -d.height * 0.5;
    // keep the ribbon safely behind the front cover all the way to the board's bottom
    // edge before curving forward (+z) across the shelf timber.
    const coverClearDrop = Math.max(0.18, d.height * 0.5 - (-anchorY) + 0.006);
    const floorDrop = coverClearDrop + 0.012;
    const turnStart = coverClearDrop;

    for (let i = 0; i < count; i += 1) {
      const o = i * 3;
      const bx = base[o];
      const by = base[o + 1];
      const bz = base[o + 2];
      const drop = -by; // positive downward distance from anchor
      const t = clamp(drop / length, 0, 1);
      const bend = t * t;

      // Free studio hang coordinates
      const freeX = bx + sinA * bend * length * 0.36;
      const freeY = by + Math.abs(sinA) * bend * length * 0.04;
      const freeZ = bz + Math.sin(t * Math.PI) * billow;
      let dYdT = -1;
      let dZdT = Math.cos(t * Math.PI) * Math.PI * (billow / length);

      // Shelf-draped coordinates: falls to shelf top, curves smoothly forward (+z) across timber.
      let x = freeX;
      let y = freeY;
      let z = freeZ;
      if (rest > 0.0005 && drop > turnStart) {
        const excess = drop - turnStart;
        const arcR = 0.045;
        let shelfY;
        let shelfZ;
        let sDy;
        let sDz;
        if (excess < arcR * Math.PI * 0.5) {
          const phi = excess / arcR;
          shelfY = -(turnStart + Math.sin(phi) * arcR);
          shelfZ = bz + (1 - Math.cos(phi)) * arcR;
          sDy = -Math.cos(phi);
          sDz = Math.sin(phi);
        } else {
          const run = excess - arcR * Math.PI * 0.5;
          // Gentle organic curl along the shelf surface, never dipping below floorDrop
          shelfY = -(turnStart + arcR) + Math.sin(run * 14) * 0.0028 + run * 0.012;
          shelfZ = bz + arcR + run;
          sDy = 0.012;
          sDz = 1;
        }
        const shelfX = bx + Math.sin(t * 4.5) * 0.004 * (drop > floorDrop ? 1 : 0);
        x = freeX + (shelfX - freeX) * rest;
        y = freeY + (shelfY - freeY) * rest;
        z = freeZ + (shelfZ - freeZ) * rest;
        dYdT = dYdT + (sDy - dYdT) * rest;
        dZdT = dZdT + (sDz - dZdT) * rest;
      }

      posArr[o] = x;
      posArr[o + 1] = y;
      posArr[o + 2] = z;

      // Analytical outward normal: cross(widthX=(1,0,0), tangent=(dX, dY, dZ)) -> (0, -dZ, dY)
      const dXdT = sinA * 2 * t * 0.36 * (1 - rest);
      // Wait: cross(tangent_down, +X) = (0, dZ, -dY) -> when hanging straight down (dY=-1, dZ=0), normal is (0, 0, +1)!
      // When lying flat forward on shelf (dY=0, dZ=+1), normal is (0, +1, 0) pointing straight up!
      let nx = -dXdT * 0.35;
      let ny = dZdT;
      let nz = -dYdT;
      const invLen = 1 / (Math.hypot(nx, ny, nz) || 1);
      normArr[o] = nx * invLen;
      normArr[o + 1] = ny * invLen;
      normArr[o + 2] = nz * invLen;
    }
    pos.needsUpdate = true;
    norm.needsUpdate = true;
  }

  function updateRibbonGeometry(force = false) {
    const angle = lastRibbonAngle === 999 ? 0 : lastRibbonAngle;
    if (!force && Math.abs(ribbonShelfRest - lastRibbonRest) < 0.001) return;
    lastRibbonRest = ribbonShelfRest;
    if (ribbon.visible) bendRibbon(ribbonGeo1, ribbonBase1, angle, ribbonLength, ribbon.position.y, ribbonShelfRest);
    if (secondRibbon.visible) bendRibbon(ribbonGeo2, ribbonBase2, -angle * 0.78, ribbonLength * 1.08, secondRibbon.position.y, ribbonShelfRest);
  }

  function setRibbonShelfRest(amount) {
    const next = clamp(amount, 0, 1);
    if (Math.abs(next - ribbonShelfRest) < 0.001 && Math.abs(next - lastRibbonRest) < 0.001) return;
    ribbonShelfRest = next;
    updateRibbonGeometry(true);
  }

  function swayRibbon(angle) {
    if (Math.abs(angle - lastRibbonAngle) < 0.0005 && Math.abs(ribbonShelfRest - lastRibbonRest) < 0.001) return;
    lastRibbonAngle = angle;
    lastRibbonRest = ribbonShelfRest;
    if (ribbon.visible) bendRibbon(ribbonGeo1, ribbonBase1, angle, ribbonLength, ribbon.position.y, ribbonShelfRest);
    if (secondRibbon.visible) bendRibbon(ribbonGeo2, ribbonBase2, -angle * 0.78, ribbonLength * 1.08, secondRibbon.position.y, ribbonShelfRest);
  }
  // Initialize ribbon in shelf-resting posture immediately so first shelf render has zero wood clipping.
  updateRibbonGeometry(true);

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

  function setLeafShadows(enabled) {
    leaves.forEach((pivot) => pivot.userData.faces.forEach((face) => {
      face.mesh.castShadow = enabled && pivot.userData.printed;
    }));
  }

  function clearLeaves() {
    leaves.forEach((pivot) => {
      pivot.userData.faces.forEach((face) => {
        face.material.map = rig.paperFace;
        face.target?.dispose();
        face.target = null;
        face.signature = null;
      });
      linkShowThrough(pivot);
    });
  }

  function dispose(releaseMaterial = (material) => material.dispose()) {
    releaseSwaps();
    clearLeaves();
    Object.values(targets).forEach((target) => target.dispose());
    leaves.forEach((pivot) => pivot.userData.faces.forEach((face) => face.surface.geometry.dispose()));
    ribbonGeo1.dispose();
    ribbonGeo2.dispose();
    claspStrapGeo.dispose();
    bandWraps[0].geometry.dispose();
    sealTexture.dispose();
    caseLabelTexture.dispose();
    pocketCardTexture.dispose();
    [...fadeMaterials, hitMaterial, contactShadowMaterial].forEach(releaseMaterial);
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
    flat: [],
    leafCount: 0,
    leafBase: 0,
    setOpacity,
    setSpreadProgress,
    assignLeafSlots,
    applyLook,
    repaint,
    hiddenFaces,
    get paintedFaces() { return paintedFaces; },
    shaderVariants,
    stepSwaps,
    get hasActiveSwaps() { return Object.keys(swapRuns).length > 0; },
    get trimScale() { return body.scale.y; },
    releaseSwaps,
    setResolution,
    setLeafPage,
    setLeafShadows,
    setRibbonShelfRest,
    swayRibbon,
    updateBand,
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
