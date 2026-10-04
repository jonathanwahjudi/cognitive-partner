// Procedural textures painted on a canvas (so the model must be built in a browser).
// UVs follow glTF conventions, so textures are created with flipY = false.
import * as THREE from 'three';
import { rng } from './util.js';

function canvasTexture(w, h, paint, { color = true, repeat = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  paint(img.data, w, h);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// Tileable value noise.
function noise2(seed, period) {
  const r = rng(seed);
  const g = Array.from({ length: period * period }, r);
  const at = (i, j) => g[((j % period + period) % period) * period + ((i % period + period) % period)];
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

// Converts a tileable height function h(x, y) in pixels into a tangent-space normal map.
function normalMap(w, h, height, strength) {
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = height(x, y);
  return canvasTexture(w, h, (d) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = H[y * w + ((x + 1) % w)] - H[y * w + ((x - 1 + w) % w)];
        const dy = H[((y + 1) % h) * w + x] - H[((y - 1 + h) % h) * w + x];
        const n = new THREE.Vector3(-dx * strength, -dy * strength, 1).normalize();
        const i = (y * w + x) * 4;
        d[i] = (n.x * 0.5 + 0.5) * 255;
        d[i + 1] = (n.y * 0.5 + 0.5) * 255;
        d[i + 2] = (n.z * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
  }, { color: false });
}

export function makeTextures() {
  // Hair: fine strands running along V, light at the root cuticle, multiplied by the hair color.
  const n1 = noise2(11, 64);
  const n2 = noise2(12, 16);
  const hair = canvasTexture(256, 512, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x / w) * 64;
        const v = (y / h) * 4;
        const streak = 0.55 * n1(u, v * 0.6) + 0.45 * n1(u * 2.3 + 7, v * 0.3);
        const clump = n2((x / w) * 16, v * 0.5);
        const k = 0.72 + 0.38 * streak + 0.12 * (clump - 0.5);
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = Math.min(255, k * 230);
        d[i + 3] = 255;
      }
    }
  });
  const hairNormal = normalMap(256, 512, (x, y) => n1((x / 256) * 64, (y / 512) * 2.4) * 2 + n1((x / 256) * 128, 3), 1.6);

  // Rib knit for the cami and socks: vertical ribs (U repeats around the body).
  const kn = noise2(21, 32);
  const rib = normalMap(128, 128, (x, y) => {
    const rib = Math.pow(Math.abs(Math.sin((x / 128) * Math.PI * 4)), 0.7);
    const stitch = 0.15 * Math.sin((y / 128) * Math.PI * 32 + (x % 32 < 16 ? 0 : Math.PI));
    return rib * 2.2 + stitch + kn((x / 128) * 32, (y / 128) * 32) * 0.3;
  }, 2.2);

  // Heather fleece for the sweatpants: speckled color, soft nap, side seams at U = 0.25 / 0.75.
  const fl = noise2(31, 128);
  const fl2 = noise2(32, 32);
  const seam = (x, w) => {
    const u = x / w;
    const d = Math.min(Math.abs(u - 0.25), Math.abs(u - 0.75));
    return Math.max(0, 1 - d * w / 2.5);
  };
  const r = rng(33);
  const fleece = canvasTexture(1024, 256, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const speck = r() < 0.06 ? (r() - 0.55) * 60 : 0;
        const mottle = (fl2((x / w) * 32, (y / h) * 8) - 0.5) * 14;
        const sm = seam(x, w);
        const k = 226 + speck * 0.7 + mottle - sm * 20;
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = k;
        d[i + 2] = k + 3;
        d[i + 3] = 255;
      }
    }
  });
  const fleeceNormal = normalMap(1024, 256, (x, y) => {
    const u = x / 1024;
    const sm = seam(x, 1024);
    return fl(u * 128, (y / 256) * 32) * 0.5 + fl(u * 256, (y / 256) * 64) * 0.25 + sm * 1.4;
  }, 0.9);

  // Skin: very soft mottling so large surfaces don't look like plastic.
  const sk = noise2(41, 32);
  const skin = canvasTexture(256, 256, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = 248 + (sk((x / w) * 32, (y / h) * 32) - 0.5) * 10;
        const i = (y * w + x) * 4;
        d[i] = Math.min(255, k + 4);
        d[i + 1] = k;
        d[i + 2] = k - 2;
        d[i + 3] = 255;
      }
    }
  });

  return { hair, hairNormal, rib, fleece, fleeceNormal, skin };
}
