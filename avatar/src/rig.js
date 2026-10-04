// Humanoid skeleton (VRM-style bone names) and procedural skin weights.
import * as THREE from 'three';
import { V, smoothstep, SIDES } from './util.js';

// ---------------------------------------------------------------------------
// Hand layout, shared by the hand mesh and the finger bones.
// Arms hang at the sides with palms facing the thighs; thumbs point forward (+Z).
// ---------------------------------------------------------------------------
const FINGERS = [
  // name, knuckle z, length, base radius, spread, curl per joint (radians)
  ['Index', 0.024, 0.068, 0.0083, 0.1, [0.2, 0.3, 0.22]],
  ['Middle', 0.0075, 0.075, 0.0086, 0.02, [0.24, 0.34, 0.24]],
  ['Ring', -0.0085, 0.07, 0.0081, -0.06, [0.28, 0.38, 0.26]],
  ['Little', -0.0235, 0.056, 0.0069, -0.14, [0.32, 0.42, 0.28]],
];
const SEG = [0.45, 0.3, 0.25];

export function wrist(s) {
  return V(s * 0.218, 0.84, 0.004);
}

export function handLayout(s) {
  const fingers = FINGERS.map(([name, kz, len, r, spread, curl]) => {
    const pts = [V(s * 0.221, 0.757 + Math.abs(kz) * 0.12, kz)];
    let theta = 0;
    for (let j = 0; j < 3; j++) {
      theta += curl[j];
      // bend from straight down toward the palm (palm faces -s * X)
      const dir = V(-s * Math.sin(theta), -Math.cos(theta), spread * Math.cos(theta)).normalize();
      pts.push(pts[j].clone().addScaledVector(dir, len * SEG[j]));
    }
    return { name, pts, radii: [r, r * 0.92, r * 0.84, r * 0.76] };
  });
  // Thumb: from the base of the palm, forward and down, curling toward the palm
  const tp = [V(s * 0.214, 0.812, 0.03)];
  const tl = [0.03, 0.024, 0.021];
  let th = 0;
  for (let j = 0; j < 3; j++) {
    th += [0.15, 0.25, 0.25][j];
    const dir = V(-s * (0.25 + Math.sin(th) * 0.5), -0.72 - th * 0.2, 0.62 - th * 0.35).normalize();
    tp.push(tp[j].clone().addScaledVector(dir, tl[j]));
  }
  fingers.push({ name: 'Thumb', pts: tp, radii: [0.0098, 0.0092, 0.0084, 0.0074] });
  return fingers;
}

// ---------------------------------------------------------------------------
// Bones: [name, parent, head position, tail position]
// ---------------------------------------------------------------------------
function boneDefs() {
  const defs = [
    ['Hips', null, V(0, 0.93, 0), V(0, 1.04, -0.004)],
    ['Spine', 'Hips', V(0, 1.04, -0.004), V(0, 1.2, -0.006)],
    ['Chest', 'Spine', V(0, 1.2, -0.006), V(0, 1.385, -0.006)],
    ['Neck', 'Chest', V(0, 1.385, -0.006), V(0, 1.475, 0)],
    ['Head', 'Neck', V(0, 1.475, 0), V(0, 1.66, 0)],
  ];
  for (const [S, s] of SIDES) {
    const hand = handLayout(s);
    defs.push(
      [`${S}Shoulder`, 'Chest', V(s * 0.03, 1.355, -0.008), V(s * 0.158, 1.335, -0.008)],
      [`${S}UpperArm`, `${S}Shoulder`, V(s * 0.158, 1.335, -0.008), V(s * 0.198, 1.075, -0.018)],
      [`${S}LowerArm`, `${S}UpperArm`, V(s * 0.198, 1.075, -0.018), wrist(s)],
      [`${S}Hand`, `${S}LowerArm`, wrist(s), hand[1].pts[0].clone()],
    );
    for (const f of hand) {
      const names = ['Proximal', 'Intermediate', 'Distal'];
      names.forEach((n, j) => defs.push([
        `${S}${f.name}${n}`, j === 0 ? `${S}Hand` : `${S}${f.name}${names[j - 1]}`, f.pts[j].clone(), f.pts[j + 1].clone(),
      ]));
    }
    defs.push(
      [`${S}UpperLeg`, 'Hips', V(s * 0.088, 0.86, 0), V(s * 0.097, 0.47, 0.008)],
      [`${S}LowerLeg`, `${S}UpperLeg`, V(s * 0.097, 0.47, 0.008), V(s * 0.103, 0.075, 0)],
      [`${S}Foot`, `${S}LowerLeg`, V(s * 0.103, 0.075, 0), V(s * 0.106, 0.025, 0.1)],
      [`${S}Toes`, `${S}Foot`, V(s * 0.106, 0.025, 0.1), V(s * 0.107, 0.02, 0.148)],
    );
  }
  return defs;
}

export const BONES = Object.fromEntries(boneDefs().map(([name, parent, head, tail]) => [name, { name, parent, head, tail }]));

export function buildSkeleton() {
  const bones = {};
  const list = [];
  for (const def of Object.values(BONES)) {
    const b = new THREE.Bone();
    b.name = def.name;
    const parentHead = def.parent ? BONES[def.parent].head : V(0, 0, 0);
    b.position.copy(def.head).sub(parentHead);
    if (def.parent) bones[def.parent].add(b);
    bones[def.name] = b;
    list.push(b);
  }
  return { root: bones.Hips, bones, list };
}

// ---------------------------------------------------------------------------
// Skin weights. Each function maps a rest-pose vertex to [[boneName, weight], ...].
// ---------------------------------------------------------------------------
const tmp = new THREE.Vector3();
function segDist(p, a, b) {
  const ab = tmp.subVectors(b, a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

// Inverse-distance weights to the bone segments: good for limbs and fingers.
export const nearest = (names, power = 5) => (p) =>
  names.map((n) => [n, 1 / Math.pow(segDist(p, BONES[n].head, BONES[n].tail) + 1e-4, power)]);

export const rigid = (name) => () => [[name, 1]];

// Spine chain by height, shoulders blended in toward the arm sockets.
export function torsoWeights(p) {
  const chain = [['Hips', 0.95], ['Spine', 1.08], ['Chest', 1.24], ['Neck', 1.405], ['Head', 1.47]];
  const w = [];
  if (p.y <= chain[0][1]) w.push(['Hips', 1]);
  else if (p.y >= chain[chain.length - 1][1]) w.push(['Head', 1]);
  else {
    for (let i = 0; i < chain.length - 1; i++) {
      const [a, ya] = chain[i];
      const [b, yb] = chain[i + 1];
      if (p.y >= ya && p.y < yb) {
        const t = smoothstep(ya, yb, p.y);
        w.push([a, 1 - t], [b, t]);
      }
    }
  }
  const S = p.x > 0 ? 'Left' : 'Right';
  const ax = Math.abs(p.x);
  const ws = smoothstep(0.05, 0.12, ax) * smoothstep(1.24, 1.33, p.y) * (1 - smoothstep(1.38, 1.42, p.y));
  const wu = smoothstep(0.12, 0.16, ax) * smoothstep(1.25, 1.32, p.y);
  const rest = Math.max(0, 1 - ws - wu);
  return [...w.map(([n, x]) => [n, x * rest]), [`${S}Shoulder`, ws], [`${S}UpperArm`, wu]];
}

// Sweatpants seat: hips above, splitting to the legs toward the crotch.
export function seatWeights(p) {
  const wh = smoothstep(0.74, 0.9, p.y);
  const wl = smoothstep(-0.04, 0.04, p.x);
  return [['Hips', wh], ['LeftUpperLeg', (1 - wh) * wl], ['RightUpperLeg', (1 - wh) * (1 - wl)]];
}

// Long hair follows the head near the scalp and the chest further down.
export function hairWeights(p) {
  const wh = smoothstep(1.3, 1.47, p.y);
  const wn = (1 - wh) * smoothstep(1.2, 1.36, p.y) * 0.4;
  return [['Head', wh], ['Neck', wn], ['Chest', 1 - wh - wn]];
}

export const neckWeights = (p) => {
  const t = smoothstep(1.39, 1.47, p.y);
  const c = 1 - smoothstep(1.36, 1.4, p.y);
  return [['Chest', c], ['Neck', (1 - t) * (1 - c)], ['Head', t]];
};

export function applySkin(geo, weightFn, boneIndex) {
  const p = geo.attributes.position;
  const n = p.count;
  const idx = new Uint16Array(n * 4);
  const wts = new Float32Array(n * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i);
    const w = weightFn(v).filter(([, x]) => x > 1e-6).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = w.reduce((s, [, x]) => s + x, 0) || 1;
    w.forEach(([name, x], k) => {
      const bi = boneIndex[name];
      if (bi === undefined) throw new Error(`unknown bone ${name}`);
      idx[i * 4 + k] = bi;
      wts[i * 4 + k] = x / sum;
    });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  return geo;
}
