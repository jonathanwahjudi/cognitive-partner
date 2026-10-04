// Long straight hair: a skull cap plus ~180 textured ribbons (back curtain, front locks, bangs).
import * as THREE from 'three';
import { V, lerp, clamp, rng } from './util.js';
import { HEAD, headPolar, faceZ } from './head.js';
import { ribbon, grid } from './geometry.js';

function hairOut(p) {
  const cy = p.y >= 1.5 ? clamp(p.y, 1.5, 1.6) : p.y;
  return new THREE.Vector3(p.x, p.y - cy, p.z - (p.y < 1.5 ? -0.01 : 0));
}

// Returns pieces { geo, mat } where mat is 'hairCap' or 'hair0'..'hair2'.
export function buildHair() {
  const rand = rng(7);
  const pieces = [];
  const push = (geo) => pieces.push({ geo, mat: `hair${Math.floor(rand() * 3)}` });
  const u0 = () => rand() * 4;

  // Skull cap. Lower edge rises from the nape to the forehead.
  pieces.push({
    mat: 'hairCap',
    geo: grid(96, 32, (u, v) => {
      const phi = u * Math.PI * 2;
      const vmin = -0.15 + 0.6 * Math.cos(phi) - 0.02;
      return headPolar(phi, lerp(1, vmin, v), 1.07);
    }),
  });

  // Back curtain: long straight hair falling behind the shoulders, blunt-cut at mid-back.
  const BACK = 96;
  for (let i = 0; i < BACK; i++) {
    const s = lerp(-1, 1, (i + rand() * 0.6) / BACK); // -1 = right side, +1 = left side
    const phi = Math.PI + s * 1.62;
    const jitter = (rand() - 0.5) * 0.008;
    const depth = 1.09 + rand() * 0.035;
    const side = Math.abs(s);
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
    push(ribbon(pts, { width: 0.034, widthEnd: 0.024, samples: 36, outFn: hairOut, tipStart: 0.97, tipMin: 0.5, u0: u0() }));
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
        V(side * lerp(0.135, 0.158, u), 1.22, Math.min(zs(1.22), 0.1)),
        V(side * lerp(0.138, 0.16, u), yEnd, Math.min(zs(yEnd), 0.104)),
      ];
      push(ribbon(pts, { width: 0.03, widthEnd: 0.018, samples: 32, outFn: hairOut, lift: 0.002, tipStart: 0.93, tipMin: 0.4, u0: u0() }));
    }
  }

  // Bangs: soft fringe to the brows; longer pieces frame the face.
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
      const sx = Math.sign(u);
      pts[3] = V(sx * 0.077, 1.55, 0.05);
      pts[4] = V(sx * lerp(0.08, 0.088, (au - 0.74) / 0.26), yEnd, 0.035);
    }
    push(ribbon(pts, {
      width: 0.03,
      widthEnd: outer ? 0.012 : 0.016,
      samples: 28,
      outFn: (p) => new THREE.Vector3().subVectors(p, HEAD.c),
      lift: 0.003,
      tipStart: 0.8,
      tipMin: 0.12,
      u0: u0(),
    }));
  }
  return pieces;
}
