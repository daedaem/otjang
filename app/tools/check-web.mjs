// 웹 배포판(dist/web, npm run build:web)을 처음 온 사람처럼 열어 본다: 첫 안내 → 예시 둘러보기 → 내 옷장으로 시작 → 옷 넣기 → 백업 알림 → 3D 는 탭을 열 때만 받기 → 안내·의견 보내기.
// 사용: npm run build:web && node tools/check-web.mjs      (두 환경: 1280×900 밝음, 390×844 어두움)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, process.env.WEB || 'dist/web');
const shots = path.join(root, 'shots'); fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const ok = (c, label, extra) => { if (!c) failed++; console.log((c ? '  ok   ' : '  FAIL ') + label + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); };
const modes = process.env.QUICK ? [{ name: 'web-desk', w: 1280, h: 900, scheme: 'light' }] : [{ name: 'web-desk', w: 1280, h: 900, scheme: 'light' }, { name: 'web-phone', w: 390, h: 844, scheme: 'dark' }];
for (const m of modes) {
  console.log(m.name);
  const ctx = await browser.newContext({ viewport: { width: m.w, height: m.h }, colorScheme: m.scheme, acceptDownloads: true });
  const page = await ctx.newPage();
  const logs = [], ext = [], files = [];
  page.on('console', (x) => { if (x.type() === 'error' || x.type() === 'warning') logs.push(x.text().slice(0, 200)); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (u.startsWith('file:')) files.push(path.basename(new URL(u).pathname)); else if (!u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u); });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.goto(pathToFileURL(path.join(web, 'index.html')).href);
  await page.waitForFunction(() => window.__app);
  const st = () => page.evaluate(() => ({ n: window.__app.state.items.length, sample: window.__app.state.meta.sample, rack: window.__app.state.rack.length }));

  // 1. 첫 방문: 빈 옷장 + 환영 안내, 3D 파일은 아직 받지 않음, 이름은 임시 이름
  const title = await page.title(), h1 = await page.locator('h1.mark').innerText();
  ok(title.includes('어울') && title.includes('가칭') && h1 === title, '화면 이름은 brand.json 의 임시 이름(가칭 표시)', { title, h1 });
  ok((await st()).n === 0 && await page.locator('#welcome').isVisible(), '처음 열면 빈 옷장과 환영 안내가 보인다');
  ok(!files.includes('closet.js'), '처음에는 3D 파일(closet.js)을 받지 않는다', files);
  ok(!(await overflow()), '첫 화면에 가로 넘침이 없다');
  await page.screenshot({ path: path.join(shots, m.name + '-1-welcome.png'), fullPage: true });

  // 2. 예시 둘러보기 → 내 옷장으로 시작
  await page.click('#startSample');
  let s = await st();
  ok(s.n === 13 && s.sample && s.rack === 5 && await page.locator('#sampleNote').isVisible(), '예시 옷장으로 둘러보기: 13벌, 예시 표시', s);
  await page.click('#tabbtn-closet3d');
  await page.waitForFunction(() => window.__closet && Object.keys(window.__closet.things).length >= 5 && !window.__closet.busy, null, { timeout: 180000 }).catch(() => logs.push('3d timeout'));
  ok(files.includes('closet.js') && (await page.evaluate(() => Object.keys(window.__closet.things).length)) === 5, '3D 탭을 열 때 closet.js 를 받아 5벌을 건다', files);
  await page.click('#tabbtn-closet');
  await page.click('#leaveSample');
  s = await st();
  ok(s.n === 0 && !s.sample && s.rack === 0 && !(await page.locator('#sampleNote').count()) && await page.locator('#startOwn').isVisible(), '내 옷장으로 시작하면 예시가 지워지고 "첫 옷 넣기"가 보인다', s);

  // 3. 옷 3벌 넣기 → 백업 알림 → 백업
  for (const [kind, name, fam] of [['shirt', '흰 셔츠', 'white'], ['knit', '네이비 니트', 'navy'], ['tee', '회색 티', 'gray']]) {
    await page.click('#addOwned');
    await page.selectOption('#z-cat', 'top'); await page.selectOption('#z-kind', kind); await page.fill('#z-name', name); await page.click('#wzNext');
    await page.selectOption('#z-family', fam); await page.click('#wzNext');
    await page.click('#wzNext'); await page.waitForFunction(() => !document.querySelector('#wizard').open);
  }
  ok((await st()).n === 3 && await page.locator('#backupNote').isVisible(), '3벌을 넣으면 백업 알림이 보인다');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backupNow')]);
  const bf = path.join(shots, m.name + '-backup.json'); await dl.saveAs(bf);
  const bk = JSON.parse(fs.readFileSync(bf, 'utf8'));
  ok(bk.schema === 2 && bk.items.length === 3 && !(await page.locator('#backupNote').count()) && (await page.evaluate(() => window.__app.state.meta.lastBackupAt)) !== '', '백업 파일(스키마 2, 3벌)을 받으면 알림이 사라지고 백업일이 남는다', dl.suggestedFilename());

  // 4. 안내와 의견 보내기
  await page.click('#helpBtn');
  ok((await page.locator('#helpBody').innerText()).includes('이 브라우저 안에만 저장'), '안내에 저장 위치와 한계가 적혀 있다');
  await page.click('#helpClose');
  await page.click('#fbBtn'); await page.fill('#fbText', '시험 의견');
  const pv = await page.locator('#fbPreview').innerText();
  ok(pv.includes('시험 의견') && pv.includes('0.5.0-beta') && pv.includes('옷 3벌') && pv.includes('연 날 1일') && !pv.includes('흰 셔츠') && !pv.includes('네이비 니트'), '의견 미리보기에 사용 요약은 있고 옷 이름은 없다', pv.split('\n').slice(0, 3));
  await page.click('#fbCopy'); await page.waitForTimeout(200);
  ok((await page.locator('#fbMsg').innerText()).length > 0, '복사하기를 누르면 결과를 알려 준다', await page.locator('#fbMsg').innerText());
  await page.click('#fbClose');

  // 5. 다시 열어도 남아 있다 (IndexedDB)
  await page.evaluate(() => window.__app.flush()); await page.reload(); await page.waitForFunction(() => window.__app);
  s = await st();
  ok(s.n === 3 && (await page.evaluate(() => window.__app.state.loadedFrom)) === 'idb', '다시 열어도 3벌이 남아 있다', s);
  ok(!(await overflow()), '가로 넘침이 없다');
  await page.screenshot({ path: path.join(shots, m.name + '-2-closet.png'), fullPage: true });
  ok(ext.length === 0, '인터넷으로 나간 요청이 없다', ext);
  ok(logs.length === 0, '콘솔 오류·경고가 없다', logs);
  await ctx.close();
}
await browser.close();
console.log(failed ? failed + '건 실패' : '모두 통과');
process.exit(failed ? 1 : 0);
