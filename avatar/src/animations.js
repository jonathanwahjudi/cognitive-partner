// Animation clips baked into the GLB: Idle (breathing + blinks), Wave and Talk.
import * as THREE from 'three';

const D = Math.PI / 180;
const quat = ([x, y, z]) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * D, y * D, z * D, 'XYZ')).toArray();
const rot = (bone, times, eulers) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, eulers.flatMap(quat));
const morph = (name, times, values) => new THREE.NumberKeyframeTrack(`Face.morphTargetInfluences[${name}]`, times, values);
const blinks = (at, len) => {
  const t = [0];
  const v = [0];
  for (const s of at) t.push(s, s + 0.07, s + 0.15), v.push(0, 1, 0);
  t.push(len);
  v.push(0);
  return morph('blink', t, v);
};

export function buildClips() {
  const idle = new THREE.AnimationClip('Idle', 4, [
    rot('Chest', [0, 2, 4], [[0, 0, 0], [-1.6, 0, 0], [0, 0, 0]]),
    rot('Spine', [0, 1, 2, 3, 4], [[0, 0, 0], [0, 0, 0.8], [0, 0, 0], [0, 0, -0.8], [0, 0, 0]]),
    rot('Head', [0, 1, 2, 3, 4], [[0, 0, 0], [1, 3, 1.5], [0, 0, 0], [1, -3, -1.5], [0, 0, 0]]),
    rot('LeftUpperArm', [0, 2, 4], [[0, 0, 0], [0, 0, 2], [0, 0, 0]]),
    rot('RightUpperArm', [0, 2, 4], [[0, 0, 0], [0, 0, -2], [0, 0, 0]]),
    rot('LeftLowerArm', [0, 2, 4], [[-4, 0, 0], [-6, 0, 0], [-4, 0, 0]]),
    rot('RightLowerArm', [0, 2, 4], [[-4, 0, 0], [-6, 0, 0], [-4, 0, 0]]),
    blinks([1.6, 3.3], 4),
  ]);

  const wt = [0, 0.45];
  const lower = [[0, 0, -70]];
  for (let t = 0.75, k = 0; t < 2.6; t += 0.3, k++) {
    wt.push(t);
    lower.push([0, 0, k % 2 ? -55 : -90]);
  }
  const waveEnd = wt[wt.length - 1];
  wt.push(waveEnd + 0.45);
  const wave = new THREE.AnimationClip('Wave', waveEnd + 0.45, [
    rot('RightUpperArm', [0, 0.45, waveEnd, waveEnd + 0.45], [[0, 0, 0], [-15, 0, -95], [-15, 0, -95], [0, 0, 0]]),
    rot('RightLowerArm', wt, [[0, 0, 0], ...lower, [0, 0, 0]]),
    rot('RightHand', [0, 0.45, waveEnd, waveEnd + 0.45], [[0, 0, 0], [0, -15, 0], [0, -15, 0], [0, 0, 0]]),
    rot('Head', [0, 0.45, waveEnd, waveEnd + 0.45], [[0, 0, 0], [0, -4, -6], [0, -4, -6], [0, 0, 0]]),
    rot('Spine', [0, 0.45, waveEnd, waveEnd + 0.45], [[0, 0, 0], [0, 0, 2], [0, 0, 2], [0, 0, 0]]),
    morph('smile', [0, 0.45, waveEnd, waveEnd + 0.45], [0, 1, 1, 0]),
    morph('browUp', [0, 0.45, waveEnd, waveEnd + 0.45], [0, 0.5, 0.5, 0]),
  ]);

  // Talk: syllable-like mouth movement with small nods and a hand gesture
  const syll = [0, 0.55, 0.15, 0.8, 0.3, 0.65, 0.05, 0, 0.7, 0.2, 0.9, 0.35, 0.6, 0.1, 0, 0, 0.5, 0.75, 0.2, 0.6, 0.1, 0.45, 0, 0, 0];
  const st = syll.map((_, i) => i * 0.12);
  const len = 3;
  const talk = new THREE.AnimationClip('Talk', len, [
    morph('mouthOpen', [...st, len], [...syll, 0]),
    morph('browUp', [0, 0.4, 0.8, 1.9, 2.3, len], [0, 0.6, 0, 0, 0.4, 0]),
    morph('smile', [0, len], [0.35, 0.35]),
    rot('Head', [0, 0.5, 1, 1.6, 2.2, len], [[0, 0, 0], [3, 2, 1], [-1, 0, 0], [2, -3, -1], [0, 0, 0], [0, 0, 0]]),
    rot('RightLowerArm', [0, 0.6, 1.4, 2.2, len], [[-40, 0, 0], [-55, 0, -5], [-38, 0, 0], [-52, 0, -4], [-40, 0, 0]]),
    rot('RightUpperArm', [0, len], [[-8, 0, -4], [-8, 0, -4]]),
    rot('RightHand', [0, 0.6, 1.4, 2.2, len], [[0, 40, 0], [0, 55, 10], [0, 40, 0], [0, 50, 8], [0, 40, 0]]),
  ]);
  return [idle, wave, talk];
}
