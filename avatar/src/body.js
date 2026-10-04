// Body (torso, neck, arms, hands) and clothes (cami crop top, sweatpants, socks).
// Every piece carries its material key and a skin-weight function for the rig.
import * as THREE from 'three';
import { V, lerp, smoothstep, SIDES } from './util.js';
import { loft, profile, limb, ellipsoid, capsuleChain, scaleUV } from './geometry.js';
import { headGeometry } from './head.js';
import { buildFaceSkin } from './face.js';
import { handLayout, wrist, nearest, rigid, torsoWeights, seatWeights, neckWeights } from './rig.js';

// ---------------------------------------------------------------------------
// Torso shape
// ---------------------------------------------------------------------------
const TORSO = profile([
  { y: 1.41, rx: 0.034, rzF: 0.03, rzB: 0.032, z0: -0.004 },
  { y: 1.385, rx: 0.07, rzF: 0.045, rzB: 0.05, z0: -0.006 },
  { y: 1.365, rx: 0.13, rzF: 0.055, rzB: 0.062, z0: -0.008 },
  { y: 1.335, rx: 0.152, rzF: 0.068, rzB: 0.075, z0: -0.008 },
  { y: 1.29, rx: 0.145, rzF: 0.075, rzB: 0.08, z0: -0.006 },
  { y: 1.22, rx: 0.133, rzF: 0.078, rzB: 0.077, z0: -0.004 },
  { y: 1.15, rx: 0.121, rzF: 0.076, rzB: 0.071, z0: 0 },
  { y: 1.09, rx: 0.111, rzF: 0.073, rzB: 0.067, z0: 0 },
  { y: 1.04, rx: 0.11, rzF: 0.073, rzB: 0.067, z0: 0 },
  { y: 0.99, rx: 0.124, rzF: 0.077, rzB: 0.074, z0: 0 },
  { y: 0.93, rx: 0.14, rzF: 0.08, rzB: 0.085, z0: 0 },
  { y: 0.86, rx: 0.15, rzF: 0.085, rzB: 0.095, z0: 0 },
]);

// Bust: two soft lobes on the chest. `fabric` bridges the gap between them, as a top does.
function bust(x, y, fabric = false) {
  const dy = y - 1.205;
  const vy = Math.exp(-Math.pow(dy / (dy > 0 ? 0.052 : 0.028), 2));
  const g = (cx) => Math.exp(-Math.pow((x - cx) / 0.037, 2));
  let gx = Math.min(1, g(0.052) + g(-0.052));
  if (fabric && Math.abs(x) < 0.052) gx = Math.max(gx, lerp(0.62, 1, Math.pow(Math.abs(x) / 0.052, 2)));
  return 0.038 * vy * gx;
}
const frontMask = (a) => smoothstep(0, 0.35, Math.cos(a));
const bustDisp = (fabric) => (a, y, x) => ({ dz: bust(x, y, fabric) * frontMask(a) });

// Surface depth of the torso (or the top, with `off`) at x on the front or back.
function torsoZ(x, y, front, off = 0) {
  const r = TORSO.at(y);
  const rx = r.rx + off;
  const k = Math.sqrt(Math.max(0, 1 - Math.pow(x / rx, 2)));
  return front ? r.z0 + (r.rzF + off) * k + bust(x, y, true) : r.z0 - (r.rzB + off) * k;
}
function shoulderTop(x) {
  let y = 1.41;
  while (y > 1.3 && TORSO.at(y).rx < x) y -= 0.001;
  return y;
}

// ---------------------------------------------------------------------------
// Hands
// ---------------------------------------------------------------------------
function buildHand(S, s, add) {
  const w = wrist(s);
  const fingers = handLayout(s);
  // Palm: squarish loft from the wrist to the knuckles
  const palm = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    palm.push({
      y: lerp(w.y + 0.006, 0.752, t),
      x0: s * lerp(0.218, 0.222, t),
      z0: lerp(0.004, 0.0005, t),
      rx: lerp(0.0105, 0.0118, Math.sin(t * Math.PI)) - t * 0.0012,
      rzF: lerp(0.023, 0.035, smoothstep(0, 0.7, t)),
      rzB: lerp(0.022, 0.033, smoothstep(0, 0.7, t)),
      p: 3,
    });
  }
  palm.push({ y: 0.7475, x0: s * 0.222, z0: 0.0005, rx: 0.007, rzF: 0.028, rzB: 0.026, p: 3 });
  const palmSkin = nearest([`${S}LowerArm`, `${S}Hand`]);
  add(loft(palm, 32, { uScale: 2, vScale: 8 }), 'skin', palmSkin);
  // Thenar pad at the base of the thumb
  const thenar = ellipsoid(V(0, 0, 0), 0.0105, 0.021, 0.013, 16, 12);
  thenar.rotateX(-0.35);
  thenar.translate(s * 0.2135, 0.806, 0.021);
  add(thenar, 'skin', nearest([`${S}Hand`, `${S}ThumbProximal`]));

  for (const f of fingers) {
    const names = [`${S}Hand`, `${S}${f.name}Proximal`, `${S}${f.name}Intermediate`, `${S}${f.name}Distal`];
    const skin = nearest(names);
    for (const g of capsuleChain(f.pts, f.radii, 12)) add(g, 'skin', skin);
    // Nail on the back of the fingertip
    const d = new THREE.Vector3().subVectors(f.pts[3], f.pts[2]).normalize();
    const back = (f.name === 'Thumb' ? V(s, 0, 0.35) : V(s, 0, 0)).normalize();
    back.addScaledVector(d, -back.dot(d)).normalize();
    const side = new THREE.Vector3().crossVectors(d, back);
    const r = f.radii[3];
    const nail = ellipsoid(V(0, 0, 0), r * 0.72, r * 0.95, 0.0016, 12, 8);
    nail.applyMatrix4(new THREE.Matrix4().makeBasis(side, d, back));
    const c = f.pts[3].clone().addScaledVector(d, -r * 0.55).addScaledVector(back, r * 0.82);
    nail.translate(c.x, c.y, c.z);
    add(nail, 'nail', rigid(`${S}${f.name}Distal`));
  }
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
export function buildBody() {
  const pieces = [];
  const add = (geo, mat, skin) => pieces.push({ geo, mat, skin });

  // Head, nose, ears
  add(headGeometry(), 'skin', rigid('Head'));
  for (const g of buildFaceSkin()) add(g, 'skin', rigid('Head'));

  // Torso skin (hips are inside the pants)
  add(loft(TORSO.rings(1.41, 0.86), 64, { uScale: 4, vScale: 4, disp: bustDisp(false) }), 'skin', torsoWeights);
  add(ellipsoid(V(0, 1.0, torsoZ(0, 1.0, true) - 0.0005), 0.0028, 0.005, 0.002, 12, 8), 'skinShade', torsoWeights);
  // Collarbones: a soft ridge from the neck toward each shoulder
  for (const [, s] of SIDES) {
    const pts = [0.025, 0.06, 0.1].map((x) => V(s * x, 1.372 - x * 0.08, torsoZ(x, 1.372 - x * 0.08, true) - 0.004));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.005, 8, false), 'skin', torsoWeights);
  }

  add(limb(V(0, 1.37, -0.006), V(0, 1.48, 0.002), 0.034, 0.03, 32), 'skin', neckWeights);

  // Arms: relaxed, hanging slightly away from the body
  for (const [S, s] of SIDES) {
    const sh = V(s * 0.158, 1.335, -0.008);
    const el = V(s * 0.198, 1.075, -0.018);
    const wr = wrist(s);
    const skin = nearest([`${S}Shoulder`, `${S}UpperArm`, `${S}LowerArm`, `${S}Hand`]);
    add(ellipsoid(V(s * 0.15, 1.33, -0.008), 0.046, 0.042, 0.043), 'skin', skin);
    add(limb(sh, el, 0.041, 0.03, 32), 'skin', skin);
    add(ellipsoid(el, 0.03, 0.03, 0.03, 24, 16), 'skin', skin);
    add(limb(el, wr, 0.03, 0.021, 32), 'skin', skin);
    add(ellipsoid(wr, 0.021, 0.021, 0.021, 20, 14), 'skin', skin);
    buildHand(S, s, add);
  }

  // --- Cami crop top (ribbed knit) -----------------------------------------
  const OFF = 0.0045;
  const topRings = TORSO.rings(1.268, 1.105, (r) => ({ ...r, rx: r.rx + OFF, rzF: r.rzF + OFF, rzB: r.rzB + OFF }));
  add(loft(topRings, 72, { uScale: 28, vScale: 12, disp: bustDisp(true) }), 'top', torsoWeights);
  // Rolled hem and neckline binding
  for (const [y, rad] of [[1.107, 0.0038], [1.266, 0.0028]]) {
    const pts = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const r = TORSO.at(y);
      const x = (r.rx + OFF) * Math.sin(a);
      const c = Math.cos(a);
      const z = r.z0 + (c >= 0 ? r.rzF + OFF : r.rzB + OFF) * c + bust(x, y, true) * frontMask(a);
      pts.push(V(x, y, z));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, rad, 8, true), 'top', torsoWeights);
  }
  // Straps over the shoulders
  for (const [, s] of SIDES) {
    const x = 0.078;
    const yt = shoulderTop(x + 0.012) + 0.004;
    const curve = new THREE.CatmullRomCurve3([
      V(s * x, 1.264, torsoZ(x, 1.264, true, OFF) + 0.001),
      V(s * (x + 0.005), 1.31, torsoZ(x + 0.005, 1.31, true) + 0.004),
      V(s * (x + 0.01), (yt + 1.31) / 2 + 0.012, torsoZ(x + 0.01, 1.345, true) * 0.6 + 0.004),
      V(s * (x + 0.012), yt, -0.008),
      V(s * (x + 0.01), (yt + 1.31) / 2 + 0.012, torsoZ(x + 0.01, 1.345, false) * 0.6 - 0.004),
      V(s * (x + 0.005), 1.31, torsoZ(x + 0.005, 1.31, false) - 0.004),
      V(s * x, 1.264, torsoZ(x, 1.264, false, OFF) - 0.001),
    ]);
    add(new THREE.TubeGeometry(curve, 48, 0.0042, 8, false), 'top', torsoWeights);
  }

  // --- Sweatpants (heather fleece) -----------------------------------------
  const SEAT = profile([
    { y: 0.945, rx: 0.148, rzF: 0.088, rzB: 0.095 },
    { y: 0.9, rx: 0.157, rzF: 0.092, rzB: 0.105 },
    { y: 0.85, rx: 0.166, rzF: 0.095, rzB: 0.115 },
    { y: 0.8, rx: 0.172, rzF: 0.096, rzB: 0.115 },
    { y: 0.76, rx: 0.17, rzF: 0.092, rzB: 0.105 },
    { y: 0.72, rx: 0.12, rzF: 0.03, rzB: 0.03 },
  ], 0.006);
  // Elastic gathers just under the waistband
  const gathers = (a, y) => ({ dr: 0.012 * Math.sin(a * 46) * smoothstep(0.885, 0.94, y) });
  add(loft(SEAT.rings(0.945, 0.72), 96, { vScale: 2, disp: gathers }), 'pants', seatWeights);

  for (const [S, s] of SIDES) {
    const LEG = profile([
      { y: 0.8, x0: 0.082, r: 0.092, z0: 0.0 },
      { y: 0.7, x0: 0.088, r: 0.09, z0: 0.004 },
      { y: 0.58, x0: 0.093, r: 0.084, z0: 0.006 },
      { y: 0.46, x0: 0.097, r: 0.079, z0: 0.008 },
      { y: 0.34, x0: 0.1, r: 0.077, z0: 0.006 },
      { y: 0.22, x0: 0.102, r: 0.079, z0: 0.004 },
      { y: 0.13, x0: 0.103, r: 0.084, z0: 0.005 },
      { y: 0.07, x0: 0.103, r: 0.086, z0: 0.008 },
      { y: 0.035, x0: 0.103, r: 0.08, z0: 0.01 },
      { y: 0.02, x0: 0.103, r: 0.07, z0: 0.01 },
    ], 0.007);
    const rings = LEG.rings(0.8, 0.02, (r) => ({ y: r.y, x0: s * r.x0, z0: r.z0, rx: r.r, rzF: r.r * 0.95, rzB: r.r }));
    const folds = (a, y) => {
      const bunch = 1 - smoothstep(0.05, 0.3, y);
      const ridge = Math.sin(y * 150 + 2.2 * Math.sin(a * 3 + s) + 0.9 * Math.sin(a * 5 + y * 40)) * (0.6 + 0.4 * Math.sin(a * 2 + y * 60));
      const drape = Math.sin(a * 5 + 1.3 * s) * smoothstep(0.75, 0.35, y) * smoothstep(0.1, 0.3, y);
      const knee = Math.exp(-Math.pow((y - 0.48) / 0.05, 2)) * Math.max(0, Math.cos(a));
      // diagonal crotch folds on the inner front of the thigh
      const inner = Math.max(0, -Math.sin(a) * s) * Math.max(0, Math.cos(a));
      const crotch = inner * smoothstep(0.62, 0.72, y) * (1 - smoothstep(0.74, 0.79, y)) * Math.sin((y + a * s * 0.05) * 160);
      return { dr: 0.034 * bunch * ridge + 0.014 * drape + 0.025 * knee + 0.03 * crotch };
    };
    add(loft(rings, 64, { vScale: 2, disp: folds }), 'pants', nearest([`${S}UpperLeg`, `${S}LowerLeg`, `${S}Foot`], 6));
  }

  add(loft([
    { y: 0.985, rx: 0.142, rzF: 0.087, rzB: 0.09 },
    { y: 0.975, rx: 0.147, rzF: 0.091, rzB: 0.094 },
    { y: 0.95, rx: 0.151, rzF: 0.092, rzB: 0.098 },
    { y: 0.935, rx: 0.152, rzF: 0.092, rzB: 0.1 },
  ], 96, { vScale: 2 }), 'pantsBand', torsoWeights);

  // Drawstrings tied loosely at the front
  for (const [, s] of SIDES) {
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      V(s * 0.008, 0.965, 0.093), V(s * 0.016, 0.958, 0.097), V(s * 0.012, 0.93, 0.097),
      V(s * 0.015, 0.89, 0.095), V(s * 0.013, 0.86, 0.094),
    ]), 24, 0.0024, 6, false), 'string', torsoWeights);
    add(ellipsoid(V(s * 0.013, 0.857, 0.094), 0.0035, 0.007, 0.0035, 10, 8), 'string', torsoWeights);
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      V(s * 0.006, 0.962, 0.095), V(s * 0.024, 0.952, 0.098), V(s * 0.026, 0.94, 0.097), V(s * 0.008, 0.958, 0.096),
    ]), 20, 0.0022, 6, false), 'string', torsoWeights);
    // Eyelets
    add(new THREE.TorusGeometry(0.0035, 0.0012, 6, 16).translate(s * 0.008, 0.965, 0.0935), 'string', torsoWeights);
  }

  // --- Socks ------------------------------------------------------------------
  for (const [S, s] of SIDES) {
    const skin = nearest([`${S}LowerLeg`, `${S}Foot`, `${S}Toes`]);
    const foot = ellipsoid(V(0, 0, 0), 0.041, 0.031, 0.072, 40, 24);
    foot.translate(0, 0, 0.03);
    const heel = ellipsoid(V(0, 0.008, -0.035), 0.036, 0.034, 0.04, 32, 20);
    const ankle = limb(V(0, 0.02, -0.02), V(0, 0.11, -0.012), 0.038, 0.032, 32);
    for (const g of [foot, heel, ankle]) {
      g.rotateY(s * 0.08);
      g.translate(s * 0.104, 0.03, 0.04);
      add(scaleUV(g, 10, 3), 'sock', skin);
    }
  }
  return pieces;
}
