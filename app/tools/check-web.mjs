// 웹 배포판(dist/web, npm run build:web)을 처음 온 사람처럼 열어 본다:
// 첫 안내 → 예시 A·B 둘러보기 → 기본 옷 골라 넣기 → 고민 중인 옷 바로 판정(첫 판정까지 누른 횟수) → 결정 → 2주 뒤 물음 → 한 벌 자세히 넣기 → 백업 → 안내·의견 → 다시 열기.
// 사용: npm run build:web && node tools/check-web.mjs      (두 환경: 1280×900 밝음, 390×844 어두움. QUICK=1 이면 첫 환경만)
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
const MAX_ACTIONS = 15;                                                                              // [제안값] 빈 옷장에서 첫 판정까지 누르거나 고르는 횟수의 상한 (예전 흐름은 옷 5벌 + 후보 1벌에 약 51번)
const modes = process.env.QUICK ? [{ name: 'web-desk', w: 1280, h: 900, scheme: 'light' }] : [{ name: 'web-desk', w: 1280, h: 900, scheme: 'light' }, { name: 'web-phone', w: 390, h: 844, scheme: 'dark' }];
const ago = (n) => { const d = new Date(Date.now() - n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
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
  const st = () => page.evaluate(() => { const s = window.__app.state; return { n: s.items.length, owned: s.items.filter((i) => i.status === 'owned').length, cand: s.items.filter((i) => i.status === 'candidate').length, sample: s.meta.sample, rack: s.rack.length, quick: s.meta.quickAdded, dec: s.decisions.length }; });

  // 1. 첫 방문: 빈 옷장 + 환영 안내, 3D 파일은 아직 받지 않음, 이름은 임시 이름
  const title = await page.title(), h1 = await page.locator('h1.mark').innerText();
  ok(title.includes('어울') && title.includes('가칭') && h1 === title, '화면 이름은 brand.json 의 임시 이름(가칭 표시)', { title, h1 });
  ok((await st()).n === 0 && await page.locator('#welcome').isVisible() && await page.locator('#startQuick').isVisible(), '처음 열면 빈 옷장과 환영 안내(기본 옷 골라 넣기)가 보인다');
  ok(!files.includes('closet.js'), '처음에는 3D 파일(closet.js)을 받지 않는다', files);
  ok(!(await overflow()), '첫 화면에 가로 넘침이 없다');
  await page.screenshot({ path: path.join(shots, m.name + '-1-welcome.png'), fullPage: true });

  // 2. 예시 A 둘러보기 → 3D → 지우기
  await page.click('#startSample');
  let s = await st();
  ok(s.n === 13 && s.sample && s.rack === 5 && await page.locator('#sampleNote').isVisible(), '예시 A 둘러보기: 13벌, 예시 표시', s);
  await page.click('#tabbtn-closet3d');
  await page.waitForFunction(() => window.__closet && Object.keys(window.__closet.things).length >= 5 && !window.__closet.busy, null, { timeout: 180000 }).catch(() => logs.push('3d timeout'));
  ok(files.includes('closet.js') && (await page.evaluate(() => Object.keys(window.__closet.things).length)) === 5, '3D 탭을 열 때 closet.js 를 받아 5벌을 건다', files);
  await page.click('#tabbtn-closet');
  await page.click('#leaveSample');
  s = await st();
  ok(s.n === 0 && !s.sample && s.rack === 0 && await page.locator('#startQuick').isVisible(), '내 옷장으로 시작하면 예시가 지워지고 처음 안내로 돌아간다', s);

  // 3. 예시 B: 원피스·스커트가 있는 옷장, 코디에 원피스 차림이 나온다, 3D 목록에서 원피스는 형태 고르기가 없다
  await page.click('#startSampleB');
  s = await st();
  ok(s.n === 15 && s.sample && s.rack === 3, '예시 B 둘러보기: 15벌(원피스 2·스커트 2), 3D 형태 있는 3벌', s);
  await page.click('#tabbtn-outfits');
  const recNames = await page.locator('#recGrid .names').allInnerTexts();
  ok(recNames.length === 3 && recNames.some((t) => t.includes('원피스') && !t.includes('스커트')), '코디 추천에 원피스 한 벌 차림이 들어간다', recNames);
  await page.click('#tabbtn-closet3d');
  await page.waitForFunction(() => window.__closet && !window.__closet.busy && Object.keys(window.__closet.things).length === 3, null, { timeout: 180000 }).catch(() => logs.push('3d timeout B'));
  const dressRow = page.locator('#rackPanel .row', { hasText: '네이비 원피스' });
  ok((await dressRow.innerText()).includes('원피스 형태는 아직 없습니다') && (await dressRow.getByRole('button').count()) === 0, '3D 목록에서 원피스는 형태 없음으로 보이고 고르기 버튼이 없다');
  await page.click('#tabbtn-closet');
  await page.click('#leaveSample');
  ok((await st()).n === 0, '예시 B 도 지워진다');

  // 4. 기본 옷 골라 넣기 → 고민 중인 옷 바로 판정: 첫 판정까지 누른 횟수
  let actions = 0;
  const act = async (fn) => { actions++; await fn(); };
  await act(() => page.click('#startQuick'));
  for (const name of ['흰 셔츠', '네이비 니트', '진청 데님', '베이지 치노', '검정 원피스']) await act(() => page.locator('#qBody .qchip', { hasText: name }).click());
  ok((await page.locator('#qAdd').innerText()).includes('5벌'), '고른 수가 넣기 버튼에 보인다');
  await page.screenshot({ path: path.join(shots, m.name + '-2-quick.png') });
  await act(() => page.click('#qAdd'));
  s = await st();
  ok(s.owned === 5 && s.quick === 5 && !s.sample && await page.locator('#nextNote').isVisible() && await page.locator('#backupNote').isVisible(), '5벌이 한 번에 들어가고, 다음 할 일(판정해 보기)과 백업 알림이 보인다', s);
  const q1 = await page.evaluate(() => window.__app.state.items.find((i) => i.name === '검정 원피스'));
  ok(q1.cat === 'dress' && q1.attrSource === 'owner' && q1.draftNote.includes('대표값'), '빠른 시작 옷은 주인이 고른 대표값으로 남는다', { cat: q1.cat, src: q1.attrSource });
  await act(() => page.click('#nextJudge'));
  await act(() => page.selectOption('#qc-cat', 'outer'));
  await act(() => page.selectOption('#qc-kind', 'trench'));
  ok((await page.locator('#qc-formality').inputValue()) === '2', '종류를 고르면 격식이 그 종류의 기본값으로 바뀐다');
  await act(() => page.selectOption('#qc-family', 'beige'));
  await act(() => page.locator('#qc-lean input[value="buy"]').check());
  await act(() => page.click('#qcGo'));
  await page.waitForSelector('#vCombos');
  const verdict = await page.evaluate(() => window.__verdict);
  ok(actions <= MAX_ACTIONS && await page.locator('#vOverlap').isVisible() && await page.locator('#afterForm').isVisible(), '빈 옷장에서 첫 판정까지 ' + actions + '번 (상한 ' + MAX_ACTIONS + ')', { actions, verdict: { overlaps: verdict.overlaps.length, added: verdict.added, before: verdict.before } });
  ok(verdict.supported && verdict.before === 4 && verdict.added === 2, '트렌치코트 후보는 가진 차림 4개(상의·하의 3쌍 + 원피스 1벌)에 걸쳐 보고 2개에 걸칠 수 있다', verdict);
  await page.screenshot({ path: path.join(shots, m.name + '-3-verdict.png'), fullPage: true });

  // 5. 결정 → 2주 뒤 물음 (날짜를 20일 앞으로 돌려 본다)
  await page.locator('#afterForm input[name="decision"][value="buy"]').check();
  await page.locator('#afterForm input[name="helpful"][value="yes"]').check();
  await page.click('#saveDecision');
  ok(await page.locator('#decided').isVisible(), '결정을 기록하면 결정 화면으로 바뀐다');
  await page.click('#tabbtn-closet');
  ok(!(await page.locator('#followNote').count()), '결정한 날에는 2주 뒤 물음이 나오지 않는다');
  await page.evaluate((d) => { window.__app.state.decisions[0].after.at = d; }, ago(20));
  await page.click('#tabbtn-log'); await page.click('#tabbtn-closet');
  ok(await page.locator('#followNote').isVisible() && (await page.locator('#followNote h2').innerText()).includes('20일 전'), '20일 뒤에는 옷장 탭 위에 "몇 번 입었나, 잘 샀나"를 묻는다');
  await page.click('#followSave');
  ok(await page.locator('#followNote .warnnote').isVisible(), '고르지 않고 저장하면 골라 달라고 한다');
  await page.locator('#followNote input[name="fWorn"][value="few"]').check();
  await page.locator('#followNote input[name="fFeel"][value="good"]').check();
  await page.click('#followSave');
  const fol = await page.evaluate(() => window.__app.state.decisions[0].follow);
  ok(fol && fol.worn === 'few' && fol.feel === 'good' && !(await page.locator('#followNote').count()), '답하면 결정 기록에 남고 물음이 사라진다', fol);
  await page.click('#tabbtn-log');
  ok((await page.locator('#gate').innerText()).includes('1~2번 입음 · 잘 샀다'), '기록 탭 표에 2주 뒤 답이 보인다');
  await page.click('#tabbtn-closet');

  // 6. 한 벌 자세히 넣기(마법사): 새 종류 스커트
  await page.click('#addOwned');
  await page.selectOption('#z-cat', 'bottom'); await page.selectOption('#z-kind', 'skirt'); await page.fill('#z-name', '회색 플리츠 스커트'); await page.click('#wzNext');
  await page.selectOption('#z-family', 'gray'); await page.click('#wzNext');
  await page.click('#wzNext'); await page.waitForFunction(() => !document.querySelector('#wizard').open);
  s = await st();
  ok(s.owned === 6, '마법사로 스커트를 넣을 수 있다', s);

  // 7. 백업
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backupNow')]);
  const bf = path.join(shots, m.name + '-backup.json'); await dl.saveAs(bf);
  const bk = JSON.parse(fs.readFileSync(bf, 'utf8'));
  ok(bk.schema === 2 && bk.items.length === 6 && bk.decisions.length === 1 && bk.decisions[0].follow.feel === 'good' && !(await page.locator('#backupNote').count()), '백업 파일(스키마 2)에 옷 6벌과 결정·2주 뒤 답이 들어가고 알림이 사라진다', dl.suggestedFilename());

  // 8. 안내와 의견 보내기
  await page.click('#helpBtn');
  const help = await page.locator('#helpBody').innerText();
  ok(help.includes('이 브라우저 안에만 저장') && help.includes('2주 뒤'), '안내에 저장 위치·한계와 2주 뒤 물음이 적혀 있다');
  await page.click('#helpClose');
  await page.click('#fbBtn'); await page.fill('#fbText', '시험 의견');
  const pv = await page.locator('#fbPreview').innerText();
  ok(pv.includes('시험 의견') && pv.includes('0.5.0-beta') && pv.includes('옷 6벌') && pv.includes('연 날 1일') && pv.includes('빠른 시작 5벌') && pv.includes('2주 뒤 답 1건(잘함 1') && !pv.includes('흰 셔츠') && !pv.includes('트렌치') && !pv.includes('스커트'),
    '의견 미리보기에 사용 요약(빠른 시작·2주 뒤 답 포함)은 있고 옷 이름은 없다', pv.split('\n').slice(2));
  await page.click('#fbCopy'); await page.waitForTimeout(200);
  ok((await page.locator('#fbMsg').innerText()).length > 0, '복사하기를 누르면 결과를 알려 준다', await page.locator('#fbMsg').innerText());
  await page.click('#fbClose');

  // 9. 다시 열어도 남아 있다 (IndexedDB)
  await page.evaluate(() => window.__app.flush()); await page.reload(); await page.waitForFunction(() => window.__app);
  s = await st();
  const fol2 = await page.evaluate(() => window.__app.state.decisions[0].follow);
  ok(s.owned === 6 && s.cand === 1 && s.dec === 1 && s.quick === 5 && fol2 && fol2.feel === 'good' && (await page.evaluate(() => window.__app.state.loadedFrom)) === 'idb', '다시 열어도 옷 6벌·후보·결정·2주 뒤 답이 남아 있다', s);
  ok(!(await overflow()), '가로 넘침이 없다');
  await page.screenshot({ path: path.join(shots, m.name + '-4-closet.png'), fullPage: true });
  ok(ext.length === 0, '인터넷으로 나간 요청이 없다', ext);
  ok(logs.length === 0, '콘솔 오류·경고가 없다', logs);
  await ctx.close();
}
await browser.close();
console.log(failed ? failed + '건 실패' : '모두 통과');
process.exit(failed ? 1 : 0);
