// 웹 배포판(dist/web, npm run build:web)을 처음 온 사람처럼 열어 본다:
// 첫 안내 → 예시 A·B 둘러보기 → 기본 옷 골라 넣기 → 고민 중인 옷 바로 판정(첫 판정까지 누른 횟수) → 친구에게 물어보기 → 결정 → 2주 뒤 물음 → 쇼핑 링크 붙여넣기
// → 한 벌 자세히 넣기 → 백업 → 안내·의견 → 다시 열기 → 공유로 들어오기 → 보안 정책(CSP)이 외부 요청을 막는지.
// 배포와 같은 조건이 되도록 dist/web 을 이 컴퓨터의 작은 HTTP 서버(127.0.0.1)로 연다(파일로 열면 CSP 의 'self' 가 다르게 동작한다).
// 사용: npm run build:web && node tools/check-web.mjs      (두 환경: 1280×900 밝음, 390×844 어두움. QUICK=1 이면 첫 환경만. BROWSER=webkit|firefox 로 다른 엔진, 설치된 경우)
import * as pw from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
// 시험용 단색 PNG(가운데에 옷 색, 가장자리는 흰 배경)를 의존성 없이 만든다
function makePng(w, h, rgb) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const inside = x > w * 0.12 && x < w * 0.88 && y > h * 0.08 && y < h * 0.92, o = y * (w * 3 + 1) + 1 + x * 3; const c = inside ? rgb : [250, 250, 250]; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, process.env.WEB || 'dist/web');
const shots = path.join(root, 'shots'); fs.mkdirSync(shots, { recursive: true });
const engine = process.env.BROWSER || 'chromium';
const browser = await pw[engine].launch(engine === 'chromium' ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : {});
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), f = path.join(web, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(web) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
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
  page.on('request', (r) => { const u = r.url(); if (u.startsWith(origin)) files.push(path.basename(new URL(u).pathname) || 'index.html'); else if (!u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u); });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.goto(origin + '/');
  await page.waitForFunction(() => window.__app);
  const st = () => page.evaluate(() => { const s = window.__app.state; return { n: s.items.length, owned: s.items.filter((i) => i.status === 'owned').length, cand: s.items.filter((i) => i.status === 'candidate').length, sample: s.meta.sample, rack: s.rack.length, quick: s.meta.quickAdded, dec: s.decisions.length }; });

  // 1. 첫 방문: 빈 옷장 + 환영 안내, 3D 파일은 아직 받지 않음, 이름은 임시 이름
  const title = await page.title(), h1 = await page.locator('h1.mark').innerText();
  ok(title.includes('어울') && title.includes('가칭') && h1 === title, '화면 이름은 brand.json 의 임시 이름(가칭 표시)', { title, h1 });
  ok((await st()).n === 0 && await page.locator('#welcome').isVisible() && await page.locator('#startQuick').isVisible(), '처음 열면 빈 옷장과 환영 안내(기본 옷 골라 넣기)가 보인다');
  ok(!files.includes('closet.js'), '처음에는 3D 파일(closet.js)을 받지 않는다', files);
  ok(!(await overflow()), '첫 화면에 가로 넘침이 없다');
  await page.screenshot({ path: path.join(shots, m.name + '-1-welcome.png'), fullPage: true });
  const swOn = await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).then(() => true, () => false);
  ok(swOn, '서비스 워커가 이 폴더만 맡는다(끊겨도 열리게)', await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()) ? (await navigator.serviceWorker.getRegistration()).scope : ''));

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

  // 4b. 친구에게 물어보기: 그림과 글에 내 옷장 이름이 없다, 그림 저장, (공유 기능이 있는 기기라면) 공유 창
  await page.click('#askFriend');
  await page.waitForFunction(() => window.__share && window.__share.bytes > 0);
  const shr = await page.evaluate(() => window.__share);
  ok(shr.w === 1080 && shr.h === 1350 && shr.bytes > 20000 && shr.text.includes('베이지 트렌치코트') && shr.text.includes('조합 4개 가운데 2개') && !/흰 셔츠|네이비 니트|진청 데님|베이지 치노|검정 원피스/.test(shr.text),
    '공유 그림(1080×1350)과 글에 후보와 판정 요약만 있고 내 옷 이름은 없다', { bytes: shr.bytes, text: shr.text.split('\n')[0] });
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('#shSave')]);
  const pf = path.join(shots, m.name + '-ask.png'); await png.saveAs(pf);
  const head = fs.readFileSync(pf).subarray(0, 8).toString('hex');
  ok(head === '89504e470d0a1a0a' && png.suggestedFilename().endsWith('.png'), '그림 저장은 PNG 파일을 내려받는다', png.suggestedFilename());
  await page.click('#shClose');

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
  // 5b. 쇼핑 앱에서 복사한 글과 링크를 붙여 넣으면 판매처와 이름을 채운다(링크는 열지 않는다)
  await page.click('#tabbtn-judge'); await page.click('#quickCand');
  await page.fill('#qc-link', '[무신사] 미니멀 울 코트 https://www.musinsa.com/products/1234567');
  ok((await page.locator('#qc-src').innerText()).includes('무신사') && (await page.inputValue('#qc-name')) === '무신사 미니멀 울 코트', '붙여 넣은 글에서 판매처(무신사)와 이름을 채운다', await page.inputValue('#qc-name'));
  await page.selectOption('#qc-cat', 'outer'); await page.selectOption('#qc-kind', 'coat'); await page.selectOption('#qc-family', 'gray');
  await page.locator('#qc-lean input[value="unsure"]').check(); await page.click('#qcGo');
  await page.waitForSelector('#vCombos');
  const linked = await page.evaluate(() => window.__app.state.items.find((i) => i.name === '무신사 미니멀 울 코트'));
  ok(linked && linked.link === 'https://www.musinsa.com/products/1234567' && (await page.locator('main').innerText()).includes('무신사 · https://www.musinsa.com/products/1234567'), '후보에 링크가 남고 판정 화면에 판매처와 함께 보인다');
  await page.click('#tabbtn-closet');

  // 5c. 옷 사진 여러 장으로 넣기: 사진마다 색 초안, 분류·종류는 사람이 고른다
  await page.setInputFiles('#bulkFile', [{ name: 'a.png', mimeType: 'image/png', buffer: makePng(120, 160, [32, 42, 78]) }, { name: 'b.png', mimeType: 'image/png', buffer: makePng(120, 160, [214, 190, 150]) }, { name: 'c.png', mimeType: 'image/png', buffer: makePng(120, 160, [140, 60, 120]) }]);
  await page.waitForFunction(() => document.querySelectorAll('#bkList .brow').length === 3);
  const fams = await page.evaluate(() => Array.from(document.querySelectorAll('#bkList .brow')).map((r) => r.querySelectorAll('select')[2].value));
  ok(fams.join(',') === 'navy,beige,purple', '사진 3장의 색 초안(네이비·베이지·퍼플)을 뽑는다', fams);
  await page.screenshot({ path: path.join(shots, m.name + '-5-bulk.png') });
  await page.locator('#bkList .brow').nth(1).locator('select').first().selectOption('bottom');
  await page.locator('#bkList .brow').nth(1).locator('select').nth(1).selectOption('chino');
  await page.locator('#bkList .brow').nth(2).getByRole('button', { name: '빼기' }).click();
  ok((await page.locator('#bkAdd').innerText()).includes('2벌'), '뺀 사진은 세지 않는다');
  await page.click('#bkAdd');
  const bulk = await page.evaluate(() => window.__app.state.items.filter((i) => i.photo.ownImg).map((i) => [i.cat, i.kind, i.family, i.attrSource, i.photo.kind]));
  ok(bulk.length === 2 && bulk[0].join() === 'top,shirt,navy,photo-draft,own' && bulk[1].join() === 'bottom,chino,beige,photo-draft,own', '두 벌이 내 사진과 함께 "사진에서 뽑은 초안"으로 들어간다', bulk);
  // 지우기: 카드의 "삭제"는 바로 지우고 7초 동안 되돌릴 수 있다. 기록 창의 "삭제"도 한 번에 지운다
  await page.locator('#closetGrid .card', { hasText: '네이비 셔츠' }).getByRole('button', { name: '삭제' }).click();
  const del1 = (await st()).owned;
  await page.click('#toastAct');
  const undo = await page.evaluate(() => window.__app.state.items.some((i) => i.name === '네이비 셔츠' && i.photo.ownImg));
  await page.locator('#closetGrid .card', { hasText: '네이비 셔츠' }).getByRole('button', { name: '삭제' }).click();
  await page.locator('#closetGrid .card', { hasText: '베이지 치노' }).last().getByRole('button', { name: '기록' }).click();
  await page.click('#edDelete'); await page.waitForFunction(() => !document.querySelector('#editor').open);
  ok(del1 === 6 && undo && (await st()).owned === 5, '카드의 삭제는 바로 지우고 되돌리기가 되며, 기록 창의 삭제도 한 번에 지운다', { del1, undo });

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
  ok(bk.schema === 2 && bk.items.length === 6 && bk.decisions.length === 2 && bk.decisions[0].follow.feel === 'good' && !(await page.locator('#backupNote').count()), '백업 파일(스키마 2)에 옷 6벌과 판정 기록·2주 뒤 답이 들어가고 알림이 사라진다', dl.suggestedFilename());

  // 8. 안내와 의견 보내기
  await page.click('#helpBtn');
  const help = await page.locator('#helpBody').innerText();
  ok(help.includes('이 브라우저 안에만 저장') && help.includes('2주 뒤'), '안내에 저장 위치·한계와 2주 뒤 물음이 적혀 있다');
  await page.click('#helpClose');
  await page.click('#fbBtn'); await page.fill('#fbText', '시험 의견');
  await page.locator('#fbPmf input[value="very"]').check(); await page.selectOption('#fbNps', '9');
  const pv = await page.locator('#fbPreview').innerText();
  const mline = (pv.match(/EOUL1\|\S+/) || [''])[0];
  ok(pv.includes('더는 못 쓰게 되면: 매우 아쉽다 · 추천할 마음: 9/10') && /\|own=6\|/.test(mline) && /\|done=1\|/.test(mline) && /\|quick=5\|/.test(mline) && /\|fol=1\|good=1\|/.test(mline) && /\|pmf=very\|nps=9\|/.test(mline) && /id=[a-z0-9]{6,16}\|/.test(mline),
    '만족도 질문(더는 못 쓰면·추천할 마음)과 운영자가 읽을 요약 한 줄이 붙는다', mline);
  ok(pv.includes('시험 의견') && pv.includes('0.5.0-beta') && pv.includes('옷 6벌') && pv.includes('후보 2') && pv.includes('연 날 1일') && pv.includes('빠른 시작 5벌') && pv.includes('2주 뒤 답 1건(잘함 1') && !pv.includes('흰 셔츠') && !pv.includes('트렌치') && !pv.includes('스커트') && !pv.includes('musinsa'),
    '의견 미리보기에 사용 요약(빠른 시작·2주 뒤 답 포함)은 있고 옷 이름은 없다', pv.split('\n').slice(2));
  await page.click('#fbCopy'); await page.waitForTimeout(200);
  ok((await page.locator('#fbMsg').innerText()).length > 0, '복사하기를 누르면 결과를 알려 준다', await page.locator('#fbMsg').innerText());
  await page.click('#fbClose');

  // 8b. 운영자: 받은 의견 여러 개를 붙여 넣으면 베타 지표를 계산한다 (같은 사람은 최근 것만)
  const mine = await page.evaluate(() => window.__feedback);
  const other = 'EOUL1|id=zz99yy|v=0.5.0-beta|at=2026-10-20|own=2|draft=0|photo=0|cand=0|done=0|prod=0|rack=0|quick=2|days=1|d30=1|fol=0|first=2026-10-19|good=0|ok=0|regret=0|nb=0|due=0|pmf=not|nps=4|err=1|scr=390x844';
  const older = other.replace('at=2026-10-20', 'at=2026-10-19').replace('own=2', 'own=1');
  await page.click('#tabbtn-log'); await page.click('#opsBox > summary');
  await page.fill('#opsText', '[민지] 오후 9:01\n' + mine + '\n[준호] 오후 9:30 써 봤어요\n' + older + '\n[준호] 오후 10:00\n' + other);
  await page.click('#opsGo');
  const ops = await page.evaluate(() => window.__ops);
  ok(ops.sm.n === 2 && ops.sm.activated.count === 1 && ops.sm.value.count === 1 && ops.sm.pmf.very === 1 && ops.sm.pmf.not === 1 && ops.sm.nps.score === 0 && ops.sm.errors === 1 && ops.vd.activated === 'few' && (await page.locator('#opsTable').innerText()).includes('사람이 적어 판단 보류'),
    '받은 의견 3개(같은 사람 2번)에서 2명으로 세고 활성화·판정·만족·추천·오류를 계산한다', { n: ops.sm.n, act: ops.sm.activated, nps: ops.sm.nps.score });
  await page.click('#tabbtn-closet');

  // 9. 다시 열어도 남아 있다 (IndexedDB)
  await page.evaluate(() => window.__app.flush()); await page.reload(); await page.waitForFunction(() => window.__app);
  s = await st();
  const fol2 = await page.evaluate(() => window.__app.state.decisions[0].follow);
  ok(s.owned === 6 && s.cand === 2 && s.dec === 2 && s.quick === 5 && fol2 && fol2.feel === 'good' && (await page.evaluate(() => window.__app.state.loadedFrom)) === 'idb', '다시 열어도 옷 6벌·후보 2·결정·2주 뒤 답이 남아 있다', s);
  ok(!(await overflow()), '가로 넘침이 없다');
  await page.screenshot({ path: path.join(shots, m.name + '-4-closet.png'), fullPage: true });
  // 10. 공유로 들어오기(설치한 앱에서 쇼핑 앱의 "공유"): 주소의 title·url 로 고민 중인 옷 넣기가 열리고, 주소창은 바로 지워진다
  await page.goto(origin + '/?title=' + encodeURIComponent('니트 카디건') + '&url=' + encodeURIComponent('https://www.29cm.co.kr/products/1'));
  await page.waitForFunction(() => window.__app && document.querySelector('#qcDlg').open);
  ok((await page.locator('#qc-src').innerText()).includes('29CM') && (await page.inputValue('#qc-name')) === '니트 카디건' && (await page.evaluate(() => location.search)) === '', '공유로 들어오면 판매처·이름이 채워진 채 열리고 주소창의 값은 지워진다');
  await page.click('#qcCancel');
  ok(ext.length === 0, '인터넷으로 나간 요청이 없다', ext);
  ok(logs.length === 0, '콘솔 오류·경고가 없다(보안 정책 위반 없음)', logs);
  // 10b. 인터넷이 끊겨도: 한 번 연 앱과 한 번 받은 3D 는 그대로 열리고, 옷장도 그대로다
  await ctx.setOffline(true);
  await page.goto(origin + '/'); await page.waitForFunction(() => window.__app);
  const off = await st();
  await page.click('#tabbtn-closet3d');
  const off3d = await page.waitForFunction(() => window.__closet && document.querySelector('#stageLoad').hidden, null, { timeout: 60000 }).then(() => true, () => false);
  ok(off.owned === 6 && off.cand === 2 && off3d && !(await page.locator('#stageMsg').isVisible()), '인터넷이 끊겨도 앱과 3D 옷장이 열리고 옷장 자료가 그대로다', off);
  await ctx.setOffline(false);
  await page.click('#tabbtn-closet');
  // 11. 보안 정책: 이 페이지에서 외부 주소로 보내려 해도 막힌다
  const csp = await page.evaluate(async () => ({ meta: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'), robots: (document.querySelector('meta[name="robots"]') || {}).content || '',
    fetch: await fetch('https://example.com/collect').then(() => 'sent', () => 'blocked'), script: await new Promise((res) => { const sc = document.createElement('script'); sc.src = 'https://example.com/x.js'; sc.onload = () => res('ran'); sc.onerror = () => res('blocked'); document.head.append(sc); }) }));
  ok(csp.meta && csp.robots.includes('noindex') && csp.fetch === 'blocked' && csp.script === 'blocked', '보안 정책이 외부 전송과 외부 스크립트를 막고, 검색 노출을 막는 표시가 있다', csp);
  await ctx.close();
}
await browser.close();
server.close();
console.log(failed ? failed + '건 실패' : '모두 통과');
process.exit(failed ? 1 : 0);
