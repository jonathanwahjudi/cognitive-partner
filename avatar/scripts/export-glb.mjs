// Builds the avatar in headless Chromium (textures are painted on a canvas) and writes model/companion.glb.
// Usage: npm run export
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { openPage, ROOT } from './serve.mjs';

const { browser, page, base } = await openPage();
await page.goto(`${base}/scripts/export.html`);
await page.waitForFunction(() => window.__glb || window.__error, null, { timeout: 120000 });
const error = await page.evaluate(() => window.__error);
if (error) {
  await browser.close();
  throw new Error(error);
}
const glb = Buffer.from(await page.evaluate(() => window.__glb), 'base64');
await browser.close();
const out = path.join(ROOT, 'model/companion.glb');
writeFileSync(out, glb);
console.log(`wrote ${out} (${(glb.length / 1024).toFixed(0)} KB)`);
