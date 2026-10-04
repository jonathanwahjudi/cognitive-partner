// Builds the avatar and writes model/companion.glb.
// Usage: npm run export
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildAvatar } from '../src/buildAvatar.js';

// GLTFExporter reads Blobs through FileReader, which Node does not provide.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
};

const out = fileURLToPath(new URL('../model/companion.glb', import.meta.url));
const glb = await new GLTFExporter().parseAsync(buildAvatar(), { binary: true });
writeFileSync(out, Buffer.from(glb));
console.log(`wrote ${out} (${(glb.byteLength / 1024).toFixed(0)} KB)`);
