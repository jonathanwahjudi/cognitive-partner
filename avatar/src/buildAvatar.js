// Procedural 3D model of the Cognitive Partner companion character:
// long dark-brown hair with bangs, white cami crop top, light-grey sweatpants, white socks.
// Units are meters, Y up, character faces +Z, feet on y = 0. Total height ~1.65 m.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Palette (sampled from the reference sheet)
// ---------------------------------------------------------------------------
const COLORS = {
  skin: 0xf7dccb,
  skinShade: 0xe9bfae,
  blush: 0xf2a5a0,
  hair: [0x3b2620, 0x33211c, 0x452d25],
  hairCap: 0x30201b,
  sclera: 0xfbf8f6,
  iris: 0x4a3029,
  pupil: 0x1e1210,
  lash: 0x231512,
  brow: 0x4a3027,
  lips: 0xcf7f7c,
  top: 0xf4efea,
  pants: 0xe5e3e6,
  pantsBand: 0xdcdadd,
  string: 0xd2d0d4,
  sock: 0xf8f8f8,
};

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts });

function makeMaterials() {
  return {
    skin: mat(COLORS.skin, { name: 'Skin', roughness: 0.6 }),
    skinShade: mat(COLORS.skinShade, { name: 'SkinShade', roughness: 0.6 }),
    blush: mat(COLORS.blush, { name: 'Blush', transparent: true, opacity: 0.35, depthWrite: false }),
    hair: COLORS.hair.map((c, i) =>
      mat(c, { name: `Hair${i}`, roughness: 0.45, side: THREE.DoubleSide })),
    hairCap: mat(COLORS.hairCap, { name: 'HairCap', roughness: 0.5, side: THREE.DoubleSide }),
    sclera: mat(COLORS.sclera, { name: 'Sclera', roughness: 0.3 }),
    iris: mat(COLORS.iris, { name: 'Iris', roughness: 0.2 }),
    pupil: mat(COLORS.pupil, { name: 'Pupil', roughness: 0.2 }),
    highlight: mat(0xffffff, { name: 'EyeHighlight', emissive: 0xffffff, emissiveIntensity: 0.6 }),
    lash: mat(COLORS.lash, { name: 'Lash', roughness: 0.5, side: THREE.DoubleSide }),
    brow: mat(COLORS.brow, { name: 'Brow', roughness: 0.6, side: THREE.DoubleSide }),
    lips: mat(COLORS.lips, { name: 'Lips', roughness: 0.5, side: THREE.DoubleSide }),
    top: mat(COLORS.top, { name: 'CropTop', roughness: 0.85 }),
    pants: mat(COLORS.pants, { name: 'Sweatpants', roughness: 0.95 }),
    pantsBand: mat(COLORS.pantsBand, { name: 'Waistband', roughness: 0.95 }),
    string: mat(COLORS.string, { name: 'Drawstring', roughness: 0.8 }),
    sock: mat(COLORS.sock, { name: 'Socks', roughness: 0.95 }),
  };
}

// Deterministic RNG so every export produces the same model.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// Loft through horizontal rings. Each ring: { y, rx, rzF, rzB, x0?, z0?, wobble? }.
// rzF / rzB are the front / back depths so chest, seat etc. can bulge independently.
function loft(rings, segs = 48, { capBottom = false } = {}) {
  const pos = [];
  const idx = [];
  rings.forEach((r) => {
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const w = r.wobble ? 1 + r.wobble * Math.sin(a * 5 + r.y * 90) * Math.sin(a * 3 + 1.3) : 1;
      const x = (r.x0 || 0) + r.rx * s * w;
      const z = (r.z0 || 0) + (c >= 0 ? r.rzF : r.rzB) * c * w;
      pos.push(x, r.y, z);
    }
  });
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + segs + 1;
      // rings go top -> bottom or bottom -> top; fix winding afterwards via normals
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (capBottom) {
    const last = rings[rings.length - 1];
    const center = pos.length / 3;
    pos.push(last.x0 || 0, last.y, last.z0 || 0);
    const base = (rings.length - 1) * (segs + 1);
    for (let i = 0; i < segs; i++) idx.push(base + i, center, base + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // Lofts here are always listed top -> bottom, which with this index order faces outward.
  g.computeVertexNormals();
  return g;
}

// Tapered cylinder between two points with rounded joints.
function limb(a, b, r0, r1, segs = 24) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, segs, 4, true);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

function ellipsoid(c, rx, ry, rz, ws = 32, hs = 24) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.translate(c.x, c.y, c.z);
  return g;
}

function stripIndexed(g) {
  // GLTF exporter is happier with consistent attribute sets: position + normal only.
  const out = g.index ? g : g;
  if (out.attributes.uv) out.deleteAttribute('uv');
  return out;
}

function merged(geos) {
  return mergeGeometries(geos.map((g) => stripIndexed(g.index ? g : g)), false);
}

// Flat ribbon along a curve. `outFn(p)` gives the direction the ribbon faces.
function ribbon(points, { width = 0.02, widthEnd = 0.006, samples = 40, outFn, lift = 0, tipStart = 0.7, tipMin = 0 }) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos = [];
  const idx = [];
  const across = 3; // left, ridge, right: a slight ridge gives rounder shading
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const out = outFn(p).normalize();
    const B = new THREE.Vector3().crossVectors(T, out).normalize();
    const N = new THREE.Vector3().crossVectors(B, T).normalize();
    // taper: full width most of the way, pointed tip
    const taper = t < 0.08 ? lerp(0.5, 1, t / 0.08) : t > tipStart ? lerp(1, tipMin, (t - tipStart) / (1 - tipStart)) : 1;
    const w = Math.max(lerp(width, widthEnd, t) * taper, 0.0008);
    const base = p.clone().addScaledVector(N, lift);
    pos.push(...base.clone().addScaledVector(B, -w / 2).toArray());
    pos.push(...base.clone().addScaledVector(N, w * 0.18).toArray());
    pos.push(...base.clone().addScaledVector(B, w / 2).toArray());
  }
  for (let i = 0; i < samples; i++) {
    for (let k = 0; k < across - 1; k++) {
      const a = i * across + k;
      const b = a + across;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Head surface: a deformed ellipsoid with an anime-style tapered jaw.
// ---------------------------------------------------------------------------
const HEAD = { c: V(0, 1.545, 0), rx: 0.083, ry: 0.105, rz: 0.092, front: 0.95 };

const jawX = (ny) => (ny < 0 ? 1 - 0.55 * Math.pow(-ny, 2.5) : 1);
const jawZ = (ny, nz) => {
  let k = nz > 0 ? HEAD.front : 1.05;
  if (ny < 0) k *= nz > 0 ? 1 - 0.12 * ny * ny : 1 - 0.38 * ny * ny;
  return k;
};

// Point on the head surface for a unit direction, optionally inflated by `scale`.
function headPoint(nx, ny, nz, scale = 1) {
  return V(
    HEAD.c.x + nx * HEAD.rx * jawX(ny) * scale,
    HEAD.c.y + ny * HEAD.ry * scale,
    HEAD.c.z + nz * HEAD.rz * jawZ(ny, nz) * scale,
  );
}

// Azimuth phi: 0 = front (+Z), +PI/2 = character's left (+X). ny = normalized height.
function headPolar(phi, ny, scale = 1) {
  const h = Math.sqrt(Math.max(0, 1 - ny * ny));
  return headPoint(Math.sin(phi) * h, ny, Math.cos(phi) * h, scale);
}

// Front surface depth of the face at (x, y) — used to paint features onto the face.
function faceZ(x, y) {
  const ny = (y - HEAD.c.y) / HEAD.ry;
  const nx = (x - HEAD.c.x) / (HEAD.rx * jawX(ny));
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return HEAD.c.z + nz * HEAD.rz * jawZ(ny, 1);
}

function buildHead(M) {
  let g = new THREE.SphereGeometry(1, 72, 56);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = headPoint(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const head = new THREE.Mesh(g, M.skin);
  head.name = 'Head';
  return head;
}

// Features drawn as thin shells conforming to the face surface.
function conformedDisc(cx, cy, radiusFn, lift, rings = 8, segs = 40) {
  const pos = [];
  const idx = [];
  pos.push(cx, cy, faceZ(cx, cy) + lift);
  for (let r = 1; r <= rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const [dx, dy] = radiusFn(a);
      const x = cx + dx * (r / rings);
      const y = cy + dy * (r / rings);
      pos.push(x, y, faceZ(x, y) + lift);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segs;
    const b0 = 1 + r * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(a0 + s, b0 + s, b0 + s1, a0 + s, b0 + s1, a0 + s1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function conformedStroke(pts2, widthFn, lift, samples = 40) {
  const curve = new THREE.SplineCurve(pts2.map(([x, y]) => new THREE.Vector2(x, y)));
  const pos = [];
  const idx = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const n = new THREE.Vector2(-T.y, T.x);
    const w = widthFn(t) / 2;
    for (const s of [-1, 1]) {
      const x = p.x + n.x * w * s;
      const y = p.y + n.y * w * s;
      pos.push(x, y, faceZ(x, y) + lift);
    }
  }
  for (let i = 0; i < samples; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const ellipseFn = (rx, ry) => (a) => [rx * Math.cos(a), ry * Math.sin(a)];

function buildFace(M) {
  const face = new THREE.Group();
  face.name = 'Face';
  const parts = { sclera: [], iris: [], pupil: [], highlight: [], lash: [], brow: [], lips: [], blush: [] };

  for (const side of [-1, 1]) {
    const ex = side * 0.034;
    const ey = 1.521;
    // Sclera: almond shape, flatter on top
    const sx = 0.0165;
    const sy = 0.0128;
    const scleraFn = (a) => {
      const s = Math.sin(a);
      return [sx * Math.cos(a), (s > 0 ? sy : sy * 0.85) * s];
    };
    parts.sclera.push(conformedDisc(ex, ey, scleraFn, 0.0006));
    // Iris clipped to the sclera, set slightly inward (gentle gaze toward viewer)
    const ix = ex - side * 0.0012;
    const irisR = (a) => {
      const [x, y] = [0.0108 * Math.cos(a), 0.0135 * Math.sin(a)];
      // clip: shrink until inside sclera (both shapes are star-shaped around ~the same center)
      const k = Math.pow(x / sx, 2) + Math.pow(y / (y > 0 ? sy : sy * 0.85), 2);
      const f = k > 0.92 ? Math.sqrt(0.92 / k) : 1;
      return [x * f, y * f];
    };
    parts.iris.push(conformedDisc(ix, ey - 0.0005, irisR, 0.0011));
    parts.pupil.push(conformedDisc(ix, ey - 0.0005, ellipseFn(0.0052, 0.0072), 0.0016));
    parts.highlight.push(conformedDisc(ix - side * 0.004, ey + 0.0045, ellipseFn(0.0026, 0.0028), 0.0021));
    parts.highlight.push(conformedDisc(ix + side * 0.0035, ey - 0.0055, ellipseFn(0.0013, 0.0013), 0.0021));

    // Upper lash line: thick, sweeping out at the outer corner
    const upper = [];
    const aIn = side > 0 ? Math.PI : 0;
    const aOut = side > 0 ? 0.03 : Math.PI - 0.03;
    for (let i = 0; i <= 12; i++) {
      const a = lerp(aIn, aOut, i / 12);
      upper.push([ex + sx * 1.04 * Math.cos(a), ey + sy * 1.05 * Math.sin(a)]);
    }
    upper.push([ex + side * (sx + 0.003), ey + 0.0022]);
    parts.lash.push(conformedStroke(upper, (t) => lerp(0.0016, 0.0042, Math.min(1, t * 1.3)) * (t > 0.92 ? (1 - t) / 0.08 + 0.2 : 1), 0.0024));
    // Lower lash: faint short line at the outer half
    const lower = [];
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI * 0.5 + side * (i / 6) * Math.PI * 0.42;
      lower.push([ex + sx * Math.cos(a), ey + sy * 0.95 * Math.sin(a)]);
    }
    parts.lash.push(conformedStroke(lower, (t) => 0.0009 * (1 - t * 0.6), 0.0018, 16));
    // Double eyelid crease, toward the outer corner
    const crease = [];
    for (let i = 0; i <= 8; i++) {
      const a = side > 0 ? lerp(0.62, 0.15, i / 8) * Math.PI : lerp(0.38, 0.85, i / 8) * Math.PI;
      crease.push([ex + sx * 1.05 * Math.cos(a), ey + sy * 1.5 * Math.sin(a) + 0.001]);
    }
    parts.brow.push(conformedStroke(crease, () => 0.0006, 0.0012, 16));

    // Eyebrow: soft, thin, slightly arched
    const by = 1.5525;
    parts.brow.push(conformedStroke(
      [[side * 0.017, by - 0.001], [side * 0.032, by + 0.0035], [side * 0.05, by + 0.001]],
      (t) => lerp(0.0028, 0.001, t), 0.0012, 24));

    // Blush
    parts.blush.push(conformedDisc(side * 0.045, 1.497, ellipseFn(0.013, 0.006), 0.0008, 4, 32));
  }

  // Mouth: small closed smile
  parts.lips.push(conformedStroke(
    [[-0.0085, 1.4705], [-0.004, 1.4675], [0, 1.4668], [0.004, 1.4675], [0.0085, 1.4705]],
    (t) => 0.0012 * (0.6 + 0.4 * Math.sin(Math.PI * t)), 0.001, 24));
  parts.lips.push(conformedStroke(
    [[-0.004, 1.4645], [0, 1.4638], [0.004, 1.4645]],
    () => 0.0018, 0.0006, 12));

  const add = (key, material, name) => {
    const m = new THREE.Mesh(merged(parts[key]), material);
    m.name = name;
    face.add(m);
  };
  add('sclera', M.sclera, 'EyeWhites');
  add('iris', M.iris, 'Irises');
  add('pupil', M.pupil, 'Pupils');
  add('highlight', M.highlight, 'EyeHighlights');
  add('lash', M.lash, 'Lashes');
  add('brow', M.brow, 'Brows');
  add('lips', M.lips, 'Mouth');
  add('blush', M.blush, 'Blush');

  // Small nose with a soft tip
  const nz = faceZ(0, 1.497);
  const nose = new THREE.Mesh(ellipsoid(V(0, 1.494, nz - 0.0045), 0.0048, 0.01, 0.0072), M.skin);
  nose.name = 'Nose';
  face.add(nose);

  // Ears (mostly hidden by hair)
  const ears = [];
  for (const side of [-1, 1]) {
    const e = ellipsoid(V(0, 0, 0), 0.006, 0.022, 0.014);
    e.rotateZ(side * -0.15);
    e.translate(side * 0.081, 1.522, -0.008);
    ears.push(e);
  }
  const earMesh = new THREE.Mesh(merged(ears), M.skin);
  earMesh.name = 'Ears';
  face.add(earMesh);
  return face;
}

// ---------------------------------------------------------------------------
// Hair
// ---------------------------------------------------------------------------
function hairOut(p) {
  const cy = p.y >= 1.5 ? clamp(p.y, 1.5, 1.6) : p.y;
  return new THREE.Vector3(p.x, p.y - cy, p.z - (p.y < 1.5 ? -0.01 : 0));
}

function buildHair(M) {
  const rand = rng(7);
  const hair = new THREE.Group();
  hair.name = 'Hair';
  const byMat = M.hair.map(() => []);
  const push = (g) => byMat[Math.floor(rand() * byMat.length)].push(g);

  // Base "hood" over the skull. Lower edge rises from the nape to the forehead.
  {
    const S = 1.07;
    const cols = 96;
    const rows = 32;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= cols; i++) {
      const phi = (i / cols) * Math.PI * 2;
      const vmin = -0.15 + 0.6 * Math.cos(phi) - 0.02;
      for (let j = 0; j <= rows; j++) {
        const ny = lerp(1, vmin, j / rows);
        const p = headPolar(phi, ny, S);
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const a = i * (rows + 1) + j;
        const b = a + rows + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const cap = new THREE.Mesh(g, M.hairCap);
    cap.name = 'HairCap';
    hair.add(cap);
  }

  // Back curtain: long straight hair falling behind the shoulders, blunt-cut at mid-back.
  const BACK = 96;
  for (let i = 0; i < BACK; i++) {
    const s = lerp(-1, 1, (i + rand() * 0.6) / BACK); // -1 = right side, +1 = left side
    const phi = Math.PI + s * 1.62; // spans the back and sides of the head
    const jitter = (rand() - 0.5) * 0.008;
    const depth = 1.09 + rand() * 0.035;
    const side = Math.abs(s);
    // falls almost straight from the widest part of the head, flaring slightly
    const wx = (y) => s * lerp(0.125, 0.155, clamp((1.47 - y) / 0.35, 0, 1));
    const cz = (y) => -0.1 - 0.035 * (1 - s * s) * clamp((1.5 - y) / 0.15, 0.4, 1) + jitter + side * side * 0.03;
    const yEnd = 1.09 + side * 0.012 + (rand() - 0.5) * 0.012;
    const pts = [
      headPolar(Math.PI + s * 0.35, 0.985, 1.08),
      headPolar(Math.PI + s * 1.0, 0.72, depth),
      headPolar(phi, 0.3, depth + 0.01),
      V(Math.sin(phi) * 0.1, 1.5, Math.cos(phi) * 0.108 + jitter),
      V(wx(1.44), 1.44, cz(1.44)),
      V(wx(1.33), 1.33, cz(1.33)),
      V(wx(1.2), 1.2, cz(1.2) - 0.004),
      V(wx(yEnd), yEnd, cz(yEnd) - 0.008),
    ];
    push(ribbon(pts, { width: 0.034, widthEnd: 0.024, samples: 52, outFn: hairOut, tipStart: 0.97, tipMin: 0.5 }));
  }

  // Side/front sheet: falls over the collarbones in front of the shoulders, down to the chest.
  for (const side of [-1, 1]) {
    const N = 16;
    for (let i = 0; i < N; i++) {
      const u = (i + rand() * 0.5) / N; // 0 = toward the face, 1 = toward the back
      const phi = side * lerp(1.15, 1.75, u);
      const yEnd = lerp(1.15, 1.2, u) + (rand() - 0.5) * 0.02;
      const zs = (y) => lerp(0.05, 0.005, u) + (1.45 - y) * lerp(0.18, 0.2, u);
      const pts = [
        headPolar(side * 0.3, 0.985, 1.08),
        headPolar(phi * 0.8, 0.7, 1.1),
        headPolar(phi, 0.2, 1.11),
        V(side * lerp(0.104, 0.112, u), 1.47, lerp(0.035, -0.012, u)),
        V(side * lerp(0.118, 0.13, u), 1.4, zs(1.4)),
        V(side * lerp(0.128, 0.148, u), 1.3, zs(1.3) - 0.004),
        V(side * lerp(0.135, 0.158, u), 1.22, Math.min(zs(1.22), 0.088)),
        V(side * lerp(0.138, 0.16, u), yEnd, Math.min(zs(yEnd), 0.092)),
      ];
      push(ribbon(pts, { width: 0.03, widthEnd: 0.018, samples: 48, outFn: hairOut, lift: 0.002, tipStart: 0.93, tipMin: 0.4 }));
    }
  }

  // Bangs: soft, slightly see-through fringe to the brows; longer pieces frame the face.
  const BANGS = 26;
  for (let i = 0; i < BANGS; i++) {
    const u = lerp(-1, 1, (i + 0.5 * rand()) / (BANGS - 0.5));
    const phi = u * 1.0;
    const au = Math.abs(u);
    const outer = au > 0.74;
    const xe = Math.sin(phi) * 0.07 + (rand() - 0.5) * 0.004;
    const yEnd = outer
      ? lerp(1.535, 1.46, (au - 0.74) / 0.26)
      : 1.558 + (rand() - 0.5) * 0.008 + au * au * 0.02;
    const ym = lerp(1.6, Math.max(yEnd, 1.54), 0.45);
    const fz = (x, y) => faceZ(clamp(x, -0.072, 0.072), clamp(y, 1.5, 1.66));
    const pts = [
      headPolar(phi * 0.25, 0.985, 1.08),
      headPolar(phi * 0.7, 0.8, 1.1),
      headPolar(phi, 0.52, 1.11),
      V(xe, ym, fz(xe, ym) + 0.012),
      V(xe * 1.02, yEnd, fz(xe, yEnd) + 0.008),
    ];
    if (outer) {
      // face-framing: hang outside the cheek
      const sx = Math.sign(u);
      pts[3] = V(sx * 0.077, 1.55, 0.05);
      pts[4] = V(sx * lerp(0.08, 0.088, (au - 0.74) / 0.26), yEnd, 0.035);
    }
    push(ribbon(pts, {
      width: 0.03,
      widthEnd: outer ? 0.012 : 0.016,
      samples: 36,
      outFn: (p) => new THREE.Vector3().subVectors(p, HEAD.c),
      lift: 0.003,
      tipStart: 0.8,
      tipMin: 0.12,
    }));
  }

  byMat.forEach((geos, i) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(merged(geos), M.hair[i]);
    m.name = `HairStrands${i}`;
    hair.add(m);
  });
  return hair;
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------
function buildBody(M) {
  const body = new THREE.Group();
  body.name = 'Body';

  // Torso skin (hips are inside the pants)
  const torso = loft([
    { y: 1.41, rx: 0.034, rzF: 0.03, rzB: 0.032, z0: -0.004 },
    { y: 1.385, rx: 0.07, rzF: 0.045, rzB: 0.05, z0: -0.006 },
    { y: 1.365, rx: 0.13, rzF: 0.055, rzB: 0.062, z0: -0.008 },
    { y: 1.335, rx: 0.152, rzF: 0.07, rzB: 0.075, z0: -0.008 },
    { y: 1.29, rx: 0.145, rzF: 0.08, rzB: 0.08, z0: -0.006 },
    { y: 1.22, rx: 0.135, rzF: 0.085, rzB: 0.078, z0: -0.004 },
    { y: 1.15, rx: 0.123, rzF: 0.08, rzB: 0.072 },
    { y: 1.09, rx: 0.112, rzF: 0.074, rzB: 0.068 },
    { y: 1.04, rx: 0.111, rzF: 0.074, rzB: 0.068 },
    { y: 0.99, rx: 0.125, rzF: 0.078, rzB: 0.075 },
    { y: 0.93, rx: 0.14, rzF: 0.08, rzB: 0.085 },
  ], 56);
  const torsoMesh = new THREE.Mesh(torso, M.skin);
  torsoMesh.name = 'Torso';
  body.add(torsoMesh);

  // Navel
  const navel = new THREE.Mesh(ellipsoid(V(0, 1.0, 0.0755), 0.0028, 0.005, 0.002), M.skinShade);
  navel.name = 'Navel';
  body.add(navel);

  // Neck
  const neck = new THREE.Mesh(limb(V(0, 1.37, -0.006), V(0, 1.48, 0.002), 0.034, 0.03), M.skin);
  neck.name = 'Neck';
  body.add(neck);

  // Arms: relaxed, hanging slightly away from the body
  const armGeos = [];
  for (const side of [-1, 1]) {
    const sh = V(side * 0.158, 1.335, -0.008);
    const el = V(side * 0.198, 1.075, -0.018);
    const wr = V(side * 0.218, 0.84, 0.004);
    armGeos.push(ellipsoid(V(side * 0.15, 1.33, -0.008), 0.046, 0.042, 0.043));
    armGeos.push(limb(sh, el, 0.041, 0.03));
    armGeos.push(ellipsoid(el, 0.03, 0.03, 0.03, 20, 14));
    armGeos.push(limb(el, wr, 0.03, 0.021));
    armGeos.push(ellipsoid(wr, 0.021, 0.021, 0.021, 16, 12));
    // Hand: palm faces the thigh
    const hand = ellipsoid(V(0, 0, 0), 0.013, 0.048, 0.03);
    hand.rotateZ(side * 0.08);
    hand.translate(side * 0.222, 0.785, 0.008);
    armGeos.push(hand);
    // Fingers hint
    for (let f = 0; f < 4; f++) {
      const fz = lerp(-0.016, 0.02, f / 3);
      const len = [0.05, 0.058, 0.055, 0.045][f];
      armGeos.push(limb(V(side * 0.222, 0.77, fz), V(side * 0.227, 0.77 - len, fz + 0.003), 0.0075, 0.006, 10));
      armGeos.push(ellipsoid(V(side * 0.227, 0.77 - len, fz + 0.003), 0.006, 0.006, 0.006, 10, 8));
    }
    // Thumb, toward the front
    armGeos.push(limb(V(side * 0.218, 0.8, 0.03), V(side * 0.214, 0.755, 0.045), 0.008, 0.0065, 10));
    armGeos.push(ellipsoid(V(side * 0.214, 0.755, 0.045), 0.0065, 0.0065, 0.0065, 10, 8));
  }
  const arms = new THREE.Mesh(merged(armGeos), M.skin);
  arms.name = 'Arms';
  body.add(arms);
  return body;
}

function buildClothes(M) {
  const clothes = new THREE.Group();
  clothes.name = 'Clothes';

  // --- Cami crop top -------------------------------------------------------
  const top = loft([
    { y: 1.268, rx: 0.142, rzF: 0.088, rzB: 0.083, z0: -0.005 },
    { y: 1.22, rx: 0.14, rzF: 0.092, rzB: 0.083, z0: -0.004 },
    { y: 1.195, rx: 0.136, rzF: 0.094, rzB: 0.08, z0: -0.002 },
    { y: 1.16, rx: 0.13, rzF: 0.087, rzB: 0.077 },
    { y: 1.115, rx: 0.121, rzF: 0.081, rzB: 0.074 },
    { y: 1.105, rx: 0.12, rzF: 0.08, rzB: 0.073 },
  ], 56);
  const topGeos = [top];
  // Bust volume (under the fabric)
  for (const side of [-1, 1]) {
    topGeos.push(ellipsoid(V(side * 0.05, 1.2, 0.05), 0.054, 0.048, 0.045));
  }
  // Straps over the shoulders
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      V(side * 0.075, 1.262, 0.085),
      V(side * 0.082, 1.33, 0.066),
      V(side * 0.088, 1.374, 0.035),
      V(side * 0.09, 1.384, -0.01),
      V(side * 0.088, 1.36, -0.07),
      V(side * 0.082, 1.3, -0.088),
      V(side * 0.078, 1.262, -0.09),
    ]);
    topGeos.push(new THREE.TubeGeometry(curve, 40, 0.0045, 8, false));
  }
  // Hem: a slightly thicker rolled edge
  const hemCurve = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const c = Math.cos(a);
    hemCurve.push(V(0.1205 * Math.sin(a), 1.107, (c >= 0 ? 0.0805 : 0.0735) * c));
  }
  topGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hemCurve, true), 96, 0.004, 8, true));
  const topMesh = new THREE.Mesh(merged(topGeos), M.top);
  topMesh.name = 'CropTop';
  clothes.add(topMesh);

  // --- Sweatpants ----------------------------------------------------------
  const pantsGeos = [];
  // Hip section from the waistband to the crotch
  pantsGeos.push(loft([
    { y: 0.945, rx: 0.148, rzF: 0.088, rzB: 0.095 },
    { y: 0.9, rx: 0.157, rzF: 0.092, rzB: 0.105 },
    { y: 0.85, rx: 0.166, rzF: 0.095, rzB: 0.115 },
    { y: 0.8, rx: 0.172, rzF: 0.096, rzB: 0.115 },
    { y: 0.76, rx: 0.17, rzF: 0.092, rzB: 0.105 },
    { y: 0.72, rx: 0.12, rzF: 0.03, rzB: 0.03 },
  ], 64));
  // Legs: loose, straight, bunching over the socks
  for (const side of [-1, 1]) {
    const rings = [
      { y: 0.8, x0: 0.082, r: 0.092, z0: 0.0 },
      { y: 0.7, x0: 0.088, r: 0.09, z0: 0.004 },
      { y: 0.58, x0: 0.093, r: 0.084, z0: 0.006 },
      { y: 0.46, x0: 0.097, r: 0.079, z0: 0.008 },
      { y: 0.34, x0: 0.1, r: 0.077, z0: 0.006 },
      { y: 0.22, x0: 0.102, r: 0.078, z0: 0.004, wobble: 0.03 },
      { y: 0.15, x0: 0.103, r: 0.082, z0: 0.004, wobble: 0.05 },
      { y: 0.1, x0: 0.103, r: 0.086, z0: 0.006, wobble: 0.06 },
      { y: 0.065, x0: 0.103, r: 0.085, z0: 0.008, wobble: 0.05 },
      { y: 0.04, x0: 0.103, r: 0.078, z0: 0.01, wobble: 0.03 },
      { y: 0.03, x0: 0.103, r: 0.07, z0: 0.01 },
    ].map((r) => ({ y: r.y, x0: side * r.x0, rx: r.r, rzF: r.r * 0.95, rzB: r.r, z0: r.z0, wobble: r.wobble }));
    pantsGeos.push(loft(rings, 48));
  }
  const pants = new THREE.Mesh(merged(pantsGeos), M.pants);
  pants.name = 'Sweatpants';
  clothes.add(pants);

  // Elastic waistband
  const band = new THREE.Mesh(loft([
    { y: 0.985, rx: 0.142, rzF: 0.087, rzB: 0.09 },
    { y: 0.975, rx: 0.147, rzF: 0.091, rzB: 0.094 },
    { y: 0.95, rx: 0.151, rzF: 0.092, rzB: 0.098 },
    { y: 0.935, rx: 0.152, rzF: 0.092, rzB: 0.1 },
  ], 64), M.pantsBand);
  band.name = 'Waistband';
  clothes.add(band);

  // Drawstrings tied loosely at the front
  const strings = [];
  for (const side of [-1, 1]) {
    strings.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      V(side * 0.008, 0.965, 0.093),
      V(side * 0.016, 0.958, 0.097),
      V(side * 0.012, 0.93, 0.097),
      V(side * 0.015, 0.89, 0.095),
      V(side * 0.013, 0.86, 0.094),
    ]), 24, 0.0024, 6, false));
    strings.push(ellipsoid(V(side * 0.013, 0.857, 0.094), 0.0035, 0.007, 0.0035, 10, 8));
    // second, shorter loop of the bow
    strings.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      V(side * 0.006, 0.962, 0.095),
      V(side * 0.024, 0.952, 0.098),
      V(side * 0.026, 0.94, 0.097),
      V(side * 0.008, 0.958, 0.096),
    ]), 20, 0.0022, 6, false));
  }
  const drawstring = new THREE.Mesh(merged(strings), M.string);
  drawstring.name = 'Drawstring';
  clothes.add(drawstring);

  // Socks / feet
  const feet = [];
  for (const side of [-1, 1]) {
    const f = ellipsoid(V(0, 0, 0), 0.042, 0.032, 0.098);
    f.rotateY(side * 0.08);
    f.translate(side * 0.104, 0.032, 0.05);
    feet.push(f);
  }
  const socks = new THREE.Mesh(merged(feet), M.sock);
  socks.name = 'Socks';
  clothes.add(socks);

  return clothes;
}

export function buildAvatar() {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 'CompanionAvatar';
  root.add(buildBody(M));
  root.add(buildHead(M));
  root.add(buildFace(M));
  root.add(buildHair(M));
  root.add(buildClothes(M));
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}
