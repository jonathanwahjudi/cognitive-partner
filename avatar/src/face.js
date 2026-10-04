// Anime-style face features painted onto the head surface, with blendshapes
// (morph targets) for blinking, smiling, talking and brow expressions.
import * as THREE from 'three';
import { V, lerp, clamp } from './util.js';
import { HEAD, faceZ, conformedDisc, conformedStroke, ellipseFn } from './head.js';
import { ellipsoid } from './geometry.js';

export const MORPHS = ['blink', 'blinkLeft', 'blinkRight', 'smile', 'mouthOpen', 'browUp', 'browSad'];

const EYE = { x: 0.034, y: 1.521, sx: 0.0165, sy: 0.0128 };
const MOUTH = { y: 1.4668, w: 0.0085 };

// Upper and lower lid curves of an eye at horizontal position x.
const arc = (x, ex, k) => Math.sqrt(Math.max(0, 1 - Math.pow((x - ex) / (EYE.sx * k), 2)));
const upperLid = (x, ex) => EYE.y + EYE.sy * 1.05 * arc(x, ex, 1.04);
const closedLid = (x, ex) => EYE.y - EYE.sy * 0.55 * arc(x, ex, 1.06);

// Moves a vertex for a given morph. `tag` says which feature it belongs to.
function morphPoint(name, tag, x, y) {
  const { kind, side } = tag;
  const ex = (side || 0) * EYE.x;
  const isEye = ['sclera', 'iris', 'pupil', 'highlight', 'upperLash', 'crease', 'lowerLash'].includes(kind);
  if (name.startsWith('blink') && isEye) {
    if (name === 'blinkLeft' && side < 0) return [x, y];
    if (name === 'blinkRight' && side > 0) return [x, y];
    const gap = upperLid(x, ex) - closedLid(x, ex);
    if (kind === 'upperLash') return [x, y - gap];
    if (kind === 'crease') return [x, y - gap * 0.75];
    if (kind === 'lowerLash') return [x, y + (closedLid(x, ex) - (EYE.y - EYE.sy * 0.95 * arc(x, ex, 1)))];
    return [x, Math.min(y, closedLid(x, ex) - 0.0004)]; // eyeball hidden under the closed lid
  }
  if (name === 'smile') {
    if (isEye && kind !== 'upperLash' && kind !== 'crease' && y < EYE.y) return [x, y + (EYE.y - y) * 0.32];
    if (kind === 'mouthLine') return [x * 1.12, y + 0.0042 * Math.pow(x / MOUTH.w, 2) - 0.0004];
    if (kind === 'lowerLip') return [x * 1.1, y - 0.0003];
    if (kind === 'brow') return [x, y + 0.001];
    if (kind === 'blush') return [x, y + 0.0015];
  }
  if (name === 'mouthOpen') {
    if (kind === 'mouthLine') return [x * 0.92, y + 0.0014 * (1 - Math.pow(x / MOUTH.w, 2))];
    if (kind === 'lowerLip') return [x * 0.95, y - 0.0085];
    if (kind === 'mouthInner' || kind === 'tongue') {
      const { cy, ryRest, cyOpen, ryTop, ryBottom } = tag;
      const n = (y - cy) / ryRest;
      return [x * 0.92, cyOpen + n * (n > 0 ? ryTop : ryBottom)];
    }
  }
  if (name === 'browUp') {
    if (kind === 'brow') return [x, y + 0.0045];
    if (kind === 'crease') return [x, y + 0.0008];
  }
  if (name === 'browSad' && kind === 'brow') {
    const inner = clamp(1 - (Math.abs(x) - 0.017) / 0.033, 0, 1);
    return [x, y + 0.0055 * inner - 0.0012 * (1 - inner)];
  }
  return [x, y];
}

function addMorphs(geo, tag) {
  const p = geo.attributes.position;
  geo.morphAttributes.position = MORPHS.map((name) => {
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      if (!tag.conformed) {
        arr.set([x, y, z], i * 3);
        continue;
      }
      const lift = z - faceZ(x, y);
      const [nx, ny] = morphPoint(name, tag, x, y);
      arr.set([nx, ny, faceZ(nx, ny) + lift], i * 3);
    }
    const attr = new THREE.Float32BufferAttribute(arr, 3);
    attr.name = name;
    return attr;
  });
  return geo;
}

// Returns pieces: { geo, mat } — all rigidly attached to the Head bone.
export function buildFace() {
  const pieces = [];
  const add = (geo, mat, tag) => pieces.push({ geo: addMorphs(geo, { conformed: true, ...tag }), mat });
  const { sx, sy } = EYE;

  for (const side of [-1, 1]) {
    const ex = side * EYE.x;
    const ey = EYE.y;
    // Sclera: almond shape, flatter on top
    const scleraFn = (a) => {
      const s = Math.sin(a);
      return [sx * Math.cos(a), (s > 0 ? sy : sy * 0.85) * s];
    };
    add(conformedDisc(ex, ey, scleraFn, 0.0006), 'sclera', { kind: 'sclera', side });
    // Iris clipped to the sclera, set slightly inward
    const ix = ex - side * 0.0012;
    const irisR = (a) => {
      const [x, y] = [0.0108 * Math.cos(a), 0.0135 * Math.sin(a)];
      const k = Math.pow(x / sx, 2) + Math.pow(y / (y > 0 ? sy : sy * 0.85), 2);
      const f = k > 0.92 ? Math.sqrt(0.92 / k) : 1;
      return [x * f, y * f];
    };
    add(conformedDisc(ix, ey - 0.0005, irisR, 0.0011), 'iris', { kind: 'iris', side });
    // Lighter lower iris for depth
    add(conformedDisc(ix, ey - 0.0058, ellipseFn(0.0072, 0.0035), 0.00135, 4, 32), 'irisLight', { kind: 'iris', side });
    add(conformedDisc(ix, ey - 0.0005, ellipseFn(0.0052, 0.0072), 0.0016), 'pupil', { kind: 'pupil', side });
    add(conformedDisc(ix - side * 0.004, ey + 0.0045, ellipseFn(0.0026, 0.0028), 0.0021), 'highlight', { kind: 'highlight', side });
    add(conformedDisc(ix + side * 0.0035, ey - 0.0055, ellipseFn(0.0013, 0.0013), 0.0021), 'highlight', { kind: 'highlight', side });

    // Upper lash line: thick, sweeping out at the outer corner
    const upper = [];
    const aIn = side > 0 ? Math.PI : 0;
    const aOut = side > 0 ? 0.03 : Math.PI - 0.03;
    for (let i = 0; i <= 12; i++) {
      const a = lerp(aIn, aOut, i / 12);
      upper.push([ex + sx * 1.04 * Math.cos(a), ey + sy * 1.05 * Math.sin(a)]);
    }
    upper.push([ex + side * (sx + 0.003), ey + 0.0022]);
    add(conformedStroke(upper, (t) => lerp(0.0016, 0.0042, Math.min(1, t * 1.3)) * (t > 0.92 ? (1 - t) / 0.08 + 0.2 : 1), 0.0024),
      'lash', { kind: 'upperLash', side });
    // Lower lash: faint short line at the outer half
    const lower = [];
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI * 0.5 + side * (i / 6) * Math.PI * 0.42;
      lower.push([ex + sx * Math.cos(a), ey + sy * 0.95 * Math.sin(a)]);
    }
    add(conformedStroke(lower, (t) => 0.0009 * (1 - t * 0.6), 0.0018, 16), 'lash', { kind: 'lowerLash', side });
    // Double eyelid crease, toward the outer corner
    const crease = [];
    for (let i = 0; i <= 8; i++) {
      const a = side > 0 ? lerp(0.62, 0.15, i / 8) * Math.PI : lerp(0.38, 0.85, i / 8) * Math.PI;
      crease.push([ex + sx * 1.05 * Math.cos(a), ey + sy * 1.5 * Math.sin(a) + 0.001]);
    }
    add(conformedStroke(crease, () => 0.0006, 0.0012, 16), 'brow', { kind: 'crease', side });

    // Eyebrow: soft, thin, slightly arched
    const by = 1.5525;
    add(conformedStroke([[side * 0.017, by - 0.001], [side * 0.032, by + 0.0035], [side * 0.05, by + 0.001]],
      (t) => lerp(0.0028, 0.001, t), 0.0012, 24), 'brow', { kind: 'brow', side });

    add(conformedDisc(side * 0.045, 1.497, ellipseFn(0.013, 0.006), 0.0008, 4, 32), 'blush', { kind: 'blush', side });
  }

  // Mouth: small closed smile, with an interior and tongue that only appear when it opens
  const my = MOUTH.y;
  add(conformedStroke([[-0.0085, my + 0.0037], [-0.004, my + 0.0007], [0, my], [0.004, my + 0.0007], [0.0085, my + 0.0037]],
    (t) => 0.0012 * (0.6 + 0.4 * Math.sin(Math.PI * t)), 0.001, 24), 'lips', { kind: 'mouthLine' });
  add(conformedStroke([[-0.004, my - 0.0023], [0, my - 0.003], [0.004, my - 0.0023]], () => 0.0018, 0.0006, 12),
    'lips', { kind: 'lowerLip' });
  const ryRest = 0.0002;
  add(conformedDisc(0, my - 0.0002, ellipseFn(0.0072, ryRest), 0.0004, 6, 32), 'mouthInner',
    { kind: 'mouthInner', cy: my - 0.0002, ryRest, cyOpen: my - 0.0035, ryTop: 0.0032, ryBottom: 0.0055 });
  add(conformedDisc(0, my - 0.0002, ellipseFn(0.0045, ryRest), 0.0007, 4, 24), 'tongue',
    { kind: 'tongue', cy: my - 0.0002, ryRest, cyOpen: my - 0.0072, ryTop: 0.0016, ryBottom: 0.0018 });

  return pieces;
}

// Nose and ears belong to the skin mesh.
export function buildFaceSkin() {
  const geos = [];
  const nz = faceZ(0, 1.497);
  geos.push(ellipsoid(V(0, 1.494, nz - 0.0045), 0.0048, 0.01, 0.0072));
  for (const side of [-1, 1]) {
    const e = ellipsoid(V(0, 0, 0), 0.006, 0.022, 0.014);
    e.rotateZ(side * -0.15);
    e.translate(side * (HEAD.rx - 0.002), 1.522, -0.008);
    geos.push(e);
  }
  return geos;
}
