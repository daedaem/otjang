// 접근성 자동 검사(axe-core 4.10.3, WCAG 2.1 A·AA 규칙): 웹 배포판의 주요 화면과 대화 상자를 열어 보고 위반을 센다.
// 자동 검사는 문제의 일부만 잡는다(화면 읽기 프로그램으로 실제 써 보는 것을 대신하지 않는다).
// 사용: npm run build:web && node tools/check-a11y.mjs        (두 환경: 밝음 1280×900, 어두움 390×844)
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, process.env.WEB || 'dist/web');
const axeSrc = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), f = path.join(web, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(web) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
let total = 0;
for (const m of [{ name: 'light', w: 1280, h: 900, scheme: 'light' }, { name: 'dark', w: 390, h: 844, scheme: 'dark' }]) {
  const ctx = await browser.newContext({ viewport: { width: m.w, height: m.h }, colorScheme: m.scheme, bypassCSP: true });   // 검사 도구를 넣으려고 이 검사에서만 CSP 를 끈다
  const page = await ctx.newPage();
  await page.goto(origin + '/'); await page.waitForFunction(() => window.__app);
  const audit = async (label, include) => {
    await page.evaluate(axeSrc);
    const r = await page.evaluate(async (inc) => {
      const res = await window.axe.run(inc ? { include: [inc] } : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
      return res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, target: v.nodes.slice(0, 3).map((x) => x.target.join(' ')), why: (v.nodes[0] && v.nodes[0].failureSummary || '').split('\n').slice(1, 2).join('') }));
    }, include || null);
    total += r.length;
    console.log((r.length ? '  FAIL ' : '  ok   ') + m.name + ' · ' + label + (r.length ? ' → ' + r.length + '종' : ''));
    for (const v of r) console.log('         - [' + v.impact + '] ' + v.id + ' ×' + v.n + ': ' + v.help + ' @ ' + v.target.join(' | ') + (v.why ? ' — ' + v.why.trim() : ''));
  };
  await audit('첫 화면(빈 옷장, 환영 안내)');
  await page.click('#startQuick'); await audit('기본 옷 골라 넣기 창', '#quickDlg');
  for (const n of ['흰 셔츠', '네이비 니트', '진청 데님', '베이지 치노', '검정 원피스']) await page.locator('#qBody .qchip', { hasText: n }).click();
  await page.click('#qAdd'); await audit('옷장(5벌, 다음 할 일)');
  await page.click('#nextJudge'); await audit('고민 중인 옷 바로 판정 창', '#qcDlg');
  await page.selectOption('#qc-cat', 'outer'); await page.selectOption('#qc-kind', 'trench'); await page.selectOption('#qc-family', 'beige'); await page.locator('#qc-lean input[value="buy"]').check(); await page.click('#qcGo');
  await page.waitForSelector('#vCombos'); await audit('살까 말까 판정 화면');
  await page.click('#askFriend'); await page.waitForFunction(() => window.__share && window.__share.bytes > 0); await audit('친구에게 물어보기 창', '#shareDlg'); await page.click('#shClose');
  await page.click('#tabbtn-outfits'); await audit('코디');
  await page.click('#tabbtn-shop'); await audit('살 만한 옷');
  await page.click('#tabbtn-compare'); await audit('옷장 구경');
  await page.click('#tabbtn-log'); await page.click('#opsBox > summary'); await audit('기록(받은 의견 모아 보기 펼침)');
  await page.click('#helpBtn'); await audit('안내 창', '#helpDlg'); await page.click('#helpClose');
  await page.click('#fbBtn'); await audit('의견 보내기 창', '#fbDlg'); await page.click('#fbClose');
  await page.click('#tabbtn-closet'); await page.click('#addOwned'); await audit('옷 추가 마법사', '#wizard'); await page.click('#wzCancel');
  const px = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAJAAH/AbQhAAAAAElFTkSuQmCC', 'base64');   // 2×2 PNG
  await page.setInputFiles('#bulkFile', [{ name: 'a.png', mimeType: 'image/png', buffer: px }, { name: 'b.png', mimeType: 'image/png', buffer: px }]);
  await page.waitForFunction(() => document.querySelectorAll('#bkList .brow').length === 2); await audit('사진으로 여러 벌 넣기 창', '#bulkDlg'); await page.click('#bkCancel');
  await ctx.close();
}
await browser.close(); server.close();
console.log(total ? '위반 ' + total + '종' : '모두 통과(자동 검사 범위)');
process.exit(total ? 1 : 0);
