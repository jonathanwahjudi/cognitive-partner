// Head surface: a deformed ellipsoid with an anime-style tapered jaw, plus helpers that
// paint features (eyes, brows, mouth) as thin shells conforming to it.
import * as THREE from 'three';
import { V } from './util.js';

export const HEAD = { c: V(0, 1.545, 0), rx: 0.083, ry: 0.105, rz: 0.092, front: 0.95 };

const jawX = (ny) => (ny < 0 ? 1 - 0.55 * Math.pow(-ny, 2.5) : 1);
const jawZ = (ny, nz) => {
  let k = nz > 0 ? HEAD.front : 1.05;
  if (ny < 0) k *= nz > 0 ? 1 - 0.12 * ny * ny : 1 - 0.38 * ny * ny;
  return k;
};

export function headPoint(nx, ny, nz, scale = 1) {
  return V(
    HEAD.c.x + nx * HEAD.rx * jawX(ny) * scale,
    HEAD.c.y + ny * HEAD.ry * scale,
    HEAD.c.z + nz * HEAD.rz * jawZ(ny, nz) * scale,
  );
}

// Azimuth phi: 0 = front (+Z), +PI/2 = character's left (+X). ny = normalized height.
export function headPolar(phi, ny, scale = 1) {
  const h = Math.sqrt(Math.max(0, 1 - ny * ny));
  return headPoint(Math.sin(phi) * h, ny, Math.cos(phi) * h, scale);
}

// Front surface depth of the face at (x, y).
export function faceZ(x, y) {
  const ny = (y - HEAD.c.y) / HEAD.ry;
  const nx = (x - HEAD.c.x) / (HEAD.rx * jawX(ny));
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return HEAD.c.z + nz * HEAD.rz * jawZ(ny, 1);
}

export function headGeometry() {
  const g = new THREE.SphereGeometry(1, 72, 56);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = headPoint(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // SphereGeometry duplicates the seam column; give both copies the same normal
  const n = g.attributes.normal;
  const W = 73;
  for (let r = 0; r < p.count / W; r++) {
    const a = r * W;
    const b = a + W - 1;
    const v = V(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  return g;
}

function finish(pos, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function conformedDisc(cx, cy, radiusFn, lift, rings = 8, segs = 40) {
  const pos = [cx, cy, faceZ(cx, cy) + lift];
  const idx = [];
  for (let r = 1; r <= rings; r++) {
    for (let s = 0; s < segs; s++) {
      const [dx, dy] = radiusFn((s / segs) * Math.PI * 2);
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
  return finish(pos, idx);
}

export function conformedStroke(pts2, widthFn, lift, samples = 40) {
  const curve = new THREE.SplineCurve(pts2.map(([x, y]) => new THREE.Vector2(x, y)));
  const pos = [];
  const idx = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const w = widthFn(t) / 2;
    for (const s of [-1, 1]) {
      const x = p.x - T.y * w * s;
      const y = p.y + T.x * w * s;
      pos.push(x, y, faceZ(x, y) + lift);
    }
  }
  for (let i = 0; i < samples; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  return finish(pos, idx);
}

export const ellipseFn = (rx, ry) => (a) => [rx * Math.cos(a), ry * Math.sin(a)];
