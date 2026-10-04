# Companion Avatar (3D)

A procedural 3D model of the companion character: long dark-brown hair with bangs, a white cami crop top, light-grey sweatpants and white socks. It is built entirely in code with three.js, so you can tweak proportions, colors or hair in `src/buildAvatar.js` and re-export.

- `model/companion.glb`: the exported model (glTF binary, about 1.7 MB). It opens in Blender, three.js, Babylon, Unity/Unreal (through a glTF importer) or https://gltf-viewer.donmccurdy.com.
- `src/buildAvatar.js`: the model source. It covers the head, face features, hair strands, body and clothes.
- `scripts/export-glb.mjs`: rebuilds the `.glb` file.
- `viewer.html`: an orbit viewer. Serve this folder (for example `npx http-server .`), then open `viewer.html?view=front|quarter|side|back|face`.
- `preview.png`: front, three-quarter, side and back renders.

```sh
npm install
npm run export
```

Scale is in meters, with Y up and the character facing +Z. She is about 1.65 m tall and stands with her feet at the origin. The model is static (not rigged). Rigging and blendshapes for facial expressions are the next step if it gets animated.
