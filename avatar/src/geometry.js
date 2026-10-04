// Geometry builders shared by the body, clothes and hair.
import * as THREE from 'three';
import { V, lerp, clamp } from './util.js';

function finish(pos, idx, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Loft through horizontal rings listed top -> bottom.
// Ring: { y, rx, rzF, rzB, x0?, z0?, p? } — rzF / rzB are front / back depths, p > 2 squares the section.
// disp(a, y, x, z) may return { dr, dz } for folds, bulges and other surface detail.
export function loft(rings, segs = 48, { uScale = 1, vScale = 1, disp } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (const r of rings) {
    const p = r.p || 2;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const ss = Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
      const cc = Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
      let x = r.rx * ss;
      let z = (c >= 0 ? r.rzF : r.rzB) * cc;
      let dz = 0;
      if (disp) {
        const d = disp(a, r.y, x + (r.x0 || 0), z + (r.z0 || 0)) || {};
        x *= 1 + (d.dr || 0);
        z *= 1 + (d.dr || 0);
        dz = d.dz || 0;
      }
      pos.push(x + (r.x0 || 0), r.y, z + (r.z0 || 0) + dz);
      uv.push((i / segs) * uScale, r.y * vScale);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + segs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = finish(pos, idx, uv);
  // close the seam smoothly: average normals of the first and last column
  const n = g.attributes.normal;
  for (let j = 0; j < rings.length; j++) {
    const a = j * (segs + 1);
    const b = a + segs;
    const v = V(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  return g;
}

// Smoothly interpolated profile: keys sorted top -> bottom, sampled every `step` meters.
export function profile(keys, step = 0.01) {
  const fields = Object.keys(keys[0]).filter((k) => k !== 'y');
  const at = (y) => {
    let i = 0;
    while (i < keys.length - 2 && y < keys[i + 1].y) i++;
    const k1 = keys[i];
    const k2 = keys[i + 1];
    const k0 = keys[Math.max(0, i - 1)];
    const k3 = keys[Math.min(keys.length - 1, i + 2)];
    const t = clamp((k1.y - y) / (k1.y - k2.y), 0, 1);
    const out = { y };
    for (const f of fields) {
      // Catmull-Rom on values (uniform parameterisation is close enough for these keys)
      const p0 = k0[f] ?? k1[f];
      const p1 = k1[f];
      const p2 = k2[f];
      const p3 = k3[f] ?? k2[f];
      const t2 = t * t;
      const t3 = t2 * t;
      out[f] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    }
    return out;
  };
  const rings = (yTop, yBottom, mod) => {
    const n = Math.max(2, Math.round((yTop - yBottom) / step));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const r = at(lerp(yTop, yBottom, i / n));
      out.push(mod ? mod(r) : r);
    }
    return out;
  };
  return { at, rings };
}

// Tapered cylinder between two points.
export function limb(a, b, r0, r1, segs = 24) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, segs, 4, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize()));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

export function ellipsoid(c, rx, ry, rz, ws = 32, hs = 24) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.translate(c.x, c.y, c.z);
  return g;
}

// Chain of tapered capsules through points (fingers, thumbs).
export function capsuleChain(points, radii, segs = 12) {
  const geos = [];
  for (let i = 0; i < points.length - 1; i++) {
    geos.push(limb(points[i], points[i + 1], radii[i], radii[i + 1], segs));
  }
  points.forEach((p, i) => geos.push(ellipsoid(p, radii[i], radii[i], radii[i], segs, Math.max(6, segs * 0.75))));
  return geos;
}

// Flat hair ribbon along a curve. `outFn(p)` gives the direction the ribbon faces.
export function ribbon(points, {
  width = 0.02, widthEnd = 0.006, samples = 40, outFn, lift = 0, tipStart = 0.7, tipMin = 0, u0 = 0,
}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos = [];
  const uv = [];
  const idx = [];
  const across = 3; // left, ridge, right: a slight ridge gives rounder shading
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const out = outFn(p).normalize();
    const B = new THREE.Vector3().crossVectors(T, out).normalize();
    const N = new THREE.Vector3().crossVectors(B, T).normalize();
    const taper = t < 0.08 ? lerp(0.5, 1, t / 0.08) : t > tipStart ? lerp(1, tipMin, (t - tipStart) / (1 - tipStart)) : 1;
    const w = Math.max(lerp(width, widthEnd, t) * taper, 0.0008);
    const base = p.clone().addScaledVector(N, lift);
    pos.push(...base.clone().addScaledVector(B, -w / 2).toArray());
    pos.push(...base.clone().addScaledVector(N, w * 0.18).toArray());
    pos.push(...base.clone().addScaledVector(B, w / 2).toArray());
    for (let k = 0; k < across; k++) uv.push(u0 + (k / (across - 1)) * w * 12, t);
  }
  for (let i = 0; i < samples; i++) {
    for (let k = 0; k < across - 1; k++) {
      const a = i * across + k;
      const b = a + across;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return finish(pos, idx, uv);
}

export function grid(cols, rows, pointFn) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const p = pointFn(i / cols, j / rows);
      pos.push(p.x, p.y, p.z);
      uv.push((i / cols) * 6, j / rows);
    }
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return finish(pos, idx, uv);
}

export function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}
