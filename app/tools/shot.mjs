// 한 화면을 빠르게 찍어 본다. 사용: node tools/shot.mjs <탭> <파일.png> [w] [h] [고를 옷 id]
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [tab, out, w, hgt, sel] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +(w || 1280), height: +(hgt || 900) } }); const logs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text().slice(0, 300)); }); p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
await p.goto(pathToFileURL(path.join(root, process.env.PAGE || 'dist/index.html')).href);
await p.waitForFunction(() => window.__app);
if (tab && tab !== 'closet') await p.click('#tabbtn-' + tab);
if (tab === 'closet3d') {
  await p.waitForFunction(() => window.__closet && Object.keys(window.__closet.things).length >= (window.__app.state.rack.length) && !window.__closet.busy, null, { timeout: 120000 }).catch(() => logs.push('3d timeout'));
  await p.waitForTimeout(2500);
  if (sel) { await p.evaluate((id) => window.__closet.select(id), sel); await p.waitForTimeout(3000); }
}
await p.screenshot({ path: out, fullPage: tab !== 'closet3d' });
console.log(JSON.stringify({ logs, things: await p.evaluate(() => window.__closet ? Object.keys(window.__closet.things) : null) }));
await b.close();
