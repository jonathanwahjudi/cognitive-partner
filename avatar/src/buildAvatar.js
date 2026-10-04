// Procedural, rigged 3D model of the Cognitive Partner companion character:
// long dark-brown hair with bangs, white cami crop top, light-grey sweatpants, white socks.
// Units are meters, Y up, character faces +Z, feet on y = 0. Total height ~1.65 m.
//
// Output: a skinned humanoid (VRM-style bone names) with three meshes — Body, Face (with
// blendshapes) and Hair — plus Idle / Wave / Talk clips. Needs a browser (textures use canvas).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeTextures } from './textures.js';
import { buildSkeleton, applySkin, rigid, hairWeights } from './rig.js';
import { buildBody } from './body.js';
import { buildFace, MORPHS } from './face.js';
import { buildHair } from './hair.js';
import { buildClips } from './animations.js';

export { MORPHS };

function makeMaterials(t) {
  const std = (name, color, opts = {}) =>
    new THREE.MeshStandardMaterial({ name, color, roughness: 0.75, metalness: 0, ...opts });
  const hair = (i, color) => std(`Hair${i}`, color, {
    map: t.hair, normalMap: t.hairNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.42, side: THREE.DoubleSide,
  });
  return {
    skin: std('Skin', 0xf7dccb, { map: t.skin, roughness: 0.58 }),
    skinShade: std('SkinShade', 0xe9bfae, { roughness: 0.6 }),
    nail: std('Nails', 0xf6cfc6, { roughness: 0.25 }),
    blush: std('Blush', 0xf2a5a0, { transparent: true, opacity: 0.35, depthWrite: false }),
    sclera: std('Sclera', 0xfbf8f6, { roughness: 0.3 }),
    iris: std('Iris', 0x4a3029, { roughness: 0.2 }),
    irisLight: std('IrisLight', 0x7a5245, { roughness: 0.2 }),
    pupil: std('Pupil', 0x1e1210, { roughness: 0.2 }),
    highlight: std('EyeHighlight', 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 }),
    lash: std('Lash', 0x231512, { roughness: 0.5, side: THREE.DoubleSide }),
    brow: std('Brow', 0x4a3027, { roughness: 0.6, side: THREE.DoubleSide }),
    lips: std('Lips', 0xcf7f7c, { roughness: 0.5, side: THREE.DoubleSide }),
    mouthInner: std('MouthInner', 0x7a2f33, { roughness: 0.6 }),
    tongue: std('Tongue', 0xd9787a, { roughness: 0.5 }),
    hairCap: std('HairCap', 0x30201b, { map: t.hair, roughness: 0.5, side: THREE.DoubleSide }),
    hair0: hair(0, 0x3b2620),
    hair1: hair(1, 0x33211c),
    hair2: hair(2, 0x452d25),
    top: std('CropTop', 0xf4efea, { normalMap: t.rib, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.88 }),
    pants: std('Sweatpants', 0xffffff, { map: t.fleece, normalMap: t.fleeceNormal, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.95 }),
    pantsBand: std('Waistband', 0xe6e4e7, { normalMap: t.rib, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95 }),
    string: std('Drawstring', 0xd2d0d4, { roughness: 0.8 }),
    sock: std('Socks', 0xf8f8f8, { normalMap: t.rib, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95 }),
  };
}

const KEEP = new Set(['position', 'normal', 'uv', 'skinIndex', 'skinWeight']);

// Skins every piece, merges per material, then into one geometry with a group per material.
function skinnedMesh(name, pieces, M, skeleton, boneIndex) {
  const byMat = new Map();
  for (const { geo, mat, skin } of pieces) {
    for (const key of Object.keys(geo.attributes)) if (!KEEP.has(key)) geo.deleteAttribute(key);
    applySkin(geo, skin || rigid('Head'), boneIndex);
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(geo);
  }
  const mats = [];
  const geos = [];
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    if (!merged) throw new Error(`could not merge ${name}/${mat}`);
    geos.push(merged);
    mats.push(M[mat]);
  }
  const geometry = mergeGeometries(geos, true);
  // merging drops attribute names; morph target names are what clips and apps address
  (geometry.morphAttributes.position || []).forEach((a, i) => { a.name = MORPHS[i]; });
  const mesh = new THREE.SkinnedMesh(geometry, mats);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.bind(skeleton);
  return mesh;
}

export function buildAvatar() {
  const M = makeMaterials(makeTextures());
  const root = new THREE.Group();
  root.name = 'CompanionAvatar';
  const { root: hips, list } = buildSkeleton();
  root.add(hips);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);
  const boneIndex = Object.fromEntries(list.map((b, i) => [b.name, i]));

  root.add(skinnedMesh('Body', buildBody(), M, skeleton, boneIndex));
  root.add(skinnedMesh('Face', buildFace(), M, skeleton, boneIndex));
  root.add(skinnedMesh('Hair', buildHair().map((p) => ({ ...p, skin: p.mat === 'hairCap' ? rigid('Head') : hairWeights })),
    M, skeleton, boneIndex));
  return { scene: root, clips: buildClips() };
}
