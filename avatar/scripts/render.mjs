// Renders preview images of the exported model.
// Usage: npm run render -- [out-prefix] [view[:anim[@time]][+morph=value]...]   (RENDER_SIZE=WxH to resize)
//   e.g. npm run render -- shots front quarter side back face face+blink=1 quarter:Wave@1.2
import { openPage } from './serve.mjs';

const [prefix = 'preview', ...shots] = process.argv.slice(2);
const list = shots.length ? shots : ['front', 'quarter', 'side', 'back'];
const [w, h] = (process.env.RENDER_SIZE || '420x720').split('x').map(Number);
const { browser, page, base } = await openPage({ width: w, height: h });
for (const shot of list) {
  const [head, ...morphs] = shot.split('+');
  const [view, animSpec] = head.split(':');
  const [anim, time] = (animSpec || '').split('@');
  const q = new URLSearchParams({ view, static: '1' });
  if (anim) q.set('anim', anim), q.set('t', time || '1');
  if (morphs.length) q.set('morph', morphs.join(','));
  await page.goto(`${base}/viewer.html?${q}`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const file = `${prefix}-${shot.replace(/[^\w.=-]+/g, '_')}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
