// Serves the avatar folder to a headless Chromium page through request interception (no port needed).
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const CDN = /cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/;

export async function openPage(viewport = { width: 420, height: 720 }) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH, // optional override
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    const cdn = url.href.match(CDN);
    const file = cdn ? path.join(ROOT, 'node_modules/three', cdn[1]) : url.hostname === 'avatar.local' ? path.join(ROOT, url.pathname) : null;
    if (!file || !existsSync(file)) return route.abort();
    route.fulfill({ body: readFileSync(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
  });
  return { browser, page, base: 'http://avatar.local' };
}
