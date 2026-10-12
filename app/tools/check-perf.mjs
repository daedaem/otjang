// 첫 화면과 3D 탭이 느린 휴대폰 회선에서 얼마나 걸리는지 잰다. 배포처(GitHub Pages)처럼 gzip 으로 보내는 작은 HTTP 서버를 쓰고,
// Chromium 의 네트워크 흉내(CDP)로 회선을 늦춘다. 회선 값은 가정이다: 느린 4G 1.6Mbps·150ms, 보통 LTE 12Mbps·40ms. 3D 그리기 시간은 GPU 없는 환경이라 실제 폰과 다르다.
// 사용: npm run build:web && node tools/check-perf.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, process.env.WEB || 'dist/web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const gz = new Map(), bytes = {};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), f = path.join(web, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(web) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const type = TYPES[path.extname(f)] || 'application/octet-stream', text = /text|javascript|json/.test(type);
  if (text && /gzip/.test(req.headers['accept-encoding'] || '')) {
    if (!gz.has(f)) gz.set(f, zlib.gzipSync(fs.readFileSync(f), { level: 9 }));
    const b = gz.get(f); bytes[path.basename(f)] = b.length;
    res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip', 'Content-Length': b.length }); res.end(b); return;
  }
  res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const nets = [['느린 4G(가정 1.6Mbps·150ms)', 1.6, 0.75, 150], ['보통 LTE(가정 12Mbps·40ms)', 12, 4, 40]];
for (const [label, down, up, rtt] of nets) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: down * 125000, uploadThroughput: up * 125000 });
  const t0 = Date.now();
  await page.goto(origin + '/'); await page.waitForSelector('#welcome');
  const first = Date.now() - t0;
  await page.click('#startSample');
  const t1 = Date.now();
  await page.click('#tabbtn-closet3d');
  await page.waitForFunction(() => window.__closet && Object.keys(window.__closet.things).length >= 5 && !window.__closet.busy, null, { timeout: 600000 });
  const three = Date.now() - t1;
  console.log(label + ': 첫 화면(안내가 보일 때까지) ' + (first / 1000).toFixed(1) + '초 · 3D 탭(5벌이 걸릴 때까지) ' + (three / 1000).toFixed(1) + '초');
  await ctx.close();
}
console.log('보낸 크기(gzip): ' + Object.entries(bytes).map(([k, v]) => k + ' ' + (v / 1e6).toFixed(2) + 'MB').join(', '));
await browser.close(); server.close();
