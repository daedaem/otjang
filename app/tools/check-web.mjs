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
const VER = JSON.parse(fs.readFileSync(new URL('../brand.json', import.meta.url), 'utf8')).version;
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
  const ctx = await browser.newContext({ viewport: { width: m.w, height: m.h }, colorScheme: m.scheme, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
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

  // 1b. 추천: 옷장을 넣기 전에도 "사고 싶은 옷"을 내 기준으로 딱 하나 받는다(검증 카탈로그 안에서만, 판매처 링크는 열지 않는다)
  const ensureOpen = async (sel) => { if ((await page.locator(sel).getAttribute('open')) === null) await page.click(sel + ' > summary'); };
  const setVis = (v) => page.evaluate((v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); }, v);
  const inView = (sel) => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }, sel);
  await page.click('#startPick');
  ok(await page.locator('#pickForm').isVisible() && (await page.locator('#tabbtn-shop').getAttribute('aria-selected')) === 'true' && (await page.locator('#pk-use-any').getAttribute('aria-checked')) === 'true', '첫 안내의 "사고 싶은 옷 골라 받기"가 추천 탭으로 가고, 용도 기본값은 "상관없음"이다');
  await page.click('#pk-use-layer');
  ok((await page.locator('#pk-cond-noLogo').getAttribute('aria-pressed')) === 'true' && (await page.locator('#pk-cond-thin').getAttribute('aria-pressed')) === 'true' && (await page.locator('#pk-use-layer').innerText()) === '받쳐 입기', '"받쳐 입기"를 고르면 꼭 지킬 조건(로고 안 보이게·얇게·목 립 좁게)이 켜진다');
  await page.click('#pk-pri-brand');
  const f1 = await page.evaluate(() => document.activeElement && document.activeElement.id);
  ok(await page.locator('#pickHint').isVisible() && f1 === 'pk-brand-polo' && !(await page.locator('#pk-pri-brand').count()), '브랜드를 1순위로 고르면 취향이 펼쳐지고 첫 브랜드에 초점이 가며 "골라 주세요" 안내가 보인다(고른 기준 칩은 순위 칸으로 옮긴다)', f1);
  await page.click('#pk-pri-quality');
  await ensureOpen('#pickTaste');
  for (const id of ['#pk-brand-polo', '#pk-brand-bronson', '#pk-brand-pottery', '#pk-brand-outstanding', '#pk-brand-brooks', '#pk-brand-lvc', '#pk-style-american-classic']) await page.click(id);
  const focusAfter = await page.evaluate(() => document.activeElement && document.activeElement.id);
  await page.selectOption('#pk-size', 'M');
  const slotTxt = await page.locator('#pk-slots').innerText();
  ok(slotTxt.indexOf('브랜드') < slotTxt.indexOf('품질') && focusAfter === 'pk-style-american-classic' && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'pk-size' && !(await page.locator('#pickHint').count()),
    '순위 칸에 누른 순서대로(1 브랜드, 2 품질) 보이고, 다시 그린 뒤에도 초점이 누른 곳에 남으며, 브랜드를 고르면 안내가 사라진다', { focusAfter, slotTxt });
  ok((await page.locator('#pickBar').innerText()).includes('1위') && (await page.locator('#pk-budget-0').getAttribute('aria-checked')) === 'true', '아래 고정 바에 지금 1위가 보이고, 예산 기본값은 "상관없음"이다');
  await page.click('#pickGo');
  const pk = await page.evaluate(() => window.__pick), pkTxt = await page.locator('#pickResult').innerText();
  const pkProd = await page.evaluate((id) => window.__app.PICKS.products.find((p) => p.id === id), pk.pick);
  ok(await page.locator('#pickSum').isVisible() && !(await page.locator('#pickForm').count()) && pk.pick && ['chest', 'small-chest'].indexOf(pkProd.logo) < 0 && pkProd.fabric.thick !== 'thick' && ['polo', 'bronson', 'pottery', 'outstanding', 'brooks', 'lvc'].indexOf(pkProd.brand) >= 0 && pk.alts.length === 2,
    '딱 하나: 좋아하는 브랜드 가운데 고른 조건(로고·두께)을 어기지 않는 것, 대안 둘. 고른 조건은 위에 한 줄로 접힌다', { pick: pk.pick, alts: pk.alts });
  ok(/요\.( 다만 .*\.)?$/.test(pk.conclusion) && !/좋아하는 브랜드와 같은 계열/.test(pk.conclusion) && pk.checks.some((c) => c.label === '로고 안 보이게') && pk.checks.some((c) => c.label === '브랜드 1순위') && /^조건을 어기지 않은 \d+개 중 1위/.test(pk.rank.text) && /^2위 /.test(pk.gapWhy) && /^좋아하는 브랜드 6곳 중/.test(pk.favNote),
    '결론 한 문장, 2위와 갈린 이유, 좋아하는 브랜드가 빠진 이유, 조건·기준 체크 목록, "조건을 어기지 않은 N개 중 1위"가 보인다', { c: pk.conclusion, g: pk.gapWhy });
  ok((await page.locator('#pickConds .ck.weak .ml').first().innerText()) === '약한 확인' && (await page.locator('#pickConds .ck.unknown .ml').first().innerText()) === '모름' && (await page.locator('#pickSize').innerText()).includes('추천 사이즈') && (await page.locator('#pickChecks .ck .ml, #pickChecks .ck .sr').allInnerTexts()).join().includes('강점'),
    '판매처 설명으로만 본 값은 "약한 확인", 모르는 값은 "모름"이라고 글자로도 보이고(내 기준은 강점·보통·약점), 추천 사이즈가 따로 보인다');
  const cta = await page.evaluate(() => { const a = document.querySelector('#pickTop .cta a.btn.primary'); const r = a.getBoundingClientRect(); return { bottom: r.bottom, h: window.innerHeight, clip: a.scrollWidth > a.clientWidth + 1 }; });
  ok(cta.bottom <= cta.h && !cta.clip, '"딱 하나 보기" 직후 첫 화면에 판매처 버튼이 보이고 버튼 이름이 잘리지 않는다', cta);
  ok(pk.ranked.some((r) => (r[2] || '').includes('조건에 안 맞아요')) && pk.notes.some((n) => n.includes('LVC')) && pk.notes.some((n) => n.includes('아웃스탠딩')), '조건으로 뺀 상품(이유 포함)과 확인한 상품이 없는 브랜드(LVC·아웃스탠딩)를 숨기지 않고 알린다', pk.notes.map((n) => n.slice(0, 30)));
  const links = await page.locator('#pickResult a[target="_blank"]').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.getAttribute('rel'), a.getAttribute('aria-label') || a.textContent]));
  ok(links.length >= 3 && links.every(([href, rel, name]) => /^https:\/\//.test(href) && rel.includes('noopener') && rel.includes('noreferrer') && name.length > 3), '판매처·근거는 이름 있는 새 창 링크(noopener noreferrer)로만 두고 앱이 가져오지 않는다', links.length);
  ok(/\d+월 \d+일 확인/.test(pkTxt) && pkTxt.includes('확률이 아니에요') && pkTxt.includes('사진 아님') && !/1점당|\/10/.test(pkTxt) && (await page.locator('#pickTop svg.tee').count()) === 1 && !(await overflow()), '가격 옆 확인일, 확률이 아니라는 설명, 사진 대신 공개 정보로 그린 모양이 있고, 내부 계산 숫자·가로 넘침이 없다');
  await page.screenshot({ path: path.join(shots, m.name + '-1b-pick.png'), fullPage: true });
  await page.click('#pickShare');
  await page.waitForFunction(() => window.__app.state.meta.pickShare >= 1, null, { timeout: 3000 }).catch(() => {});
  const sh = await page.evaluate(() => ({ t: window.__shareText || '', n: window.__app.state.meta.pickShare }));
  ok(sh.n === 1 && sh.t.includes('어울이 고른 이유') && sh.t.includes('포터리') && sh.t.startsWith('카디건 안에 받쳐 입을 흰 티로 이거 어때?') && !/흰 셔츠|옷장/.test(sh.t), '"친구에게 물어보기"는 용도·상품·값·이유만 담고 내 옷장 정보는 넣지 않으며, 실제로 복사·공유했을 때만 센다', sh);
  await page.click('#pk-wish-oxford');
  ok((await page.evaluate(() => window.__app.state.prefs.wish.join())) === 'oxford' && (await page.locator('#pk-wish-oxford').getAttribute('aria-pressed')) === 'true', '다음에 받고 싶은 옷(옥스퍼드 셔츠)을 눌러 둘 수 있다');
  await page.click('#pv-reject');
  ok(await page.locator('#pr-price').isVisible(), '"아니에요"를 누르면 이유(비싸요·브랜드·핏·이미 있음)를 고를 수 있다');
  await page.click('#pr-price');
  const rj = await page.evaluate(() => window.__app.state.pickLog.map((e) => [e.verdict, e.reason]));
  await page.click('#pv-accept');
  const pv1 = await page.evaluate(() => window.__app.state.pickLog.map((e) => [e.productId, e.verdict, e.reason]));
  ok(rj[0].join() === 'reject,price' && pv1.length === 1 && pv1[0][1] === 'accept' && pv1[0][2] === '' && (await page.locator('#pv-accept').getAttribute('aria-pressed')) === 'true', '"아니에요"의 이유와 "이걸로 할래요"가 같은 추천 기록에 남는다', { rj, pv1 });
  await page.click('#pickCand');
  ok((await page.evaluate(() => window.__app.ui.tab)) === 'shop' && await page.locator('#toastAct').isVisible(), '"살까 말까에 담기"는 화면을 옮기지 않고 알림에 [보기]를 준다');
  await page.click('#pickCand');
  const dupe = await page.evaluate(() => ({ n: window.__app.state.items.filter((i) => i.status === 'candidate').length, c: window.__app.state.meta.pickCand, t: document.querySelector('#toast').textContent }));
  ok(dupe.n === 1 && dupe.c === 1 && dupe.t.includes('이미'), '같은 상품을 두 번 담으면 하나만 남고 "이미 있어요"라고 알린다', dupe);
  const tbg = await page.evaluate(() => { const b = document.querySelector('#toastAct'), t = document.querySelector('#toast'); const c = (el, k) => getComputedStyle(el)[k]; return [c(b, 'color'), c(t, 'backgroundColor'), c(b, 'backgroundColor')]; });
  ok(tbg[2] === 'rgba(0, 0, 0, 0)' && tbg[0] !== tbg[1], '알림 속 단추는 글자와 배경이 구분된다(투명 배경)', tbg);
  await page.click('#toastAct');
  const pc = await page.evaluate(() => { const c = window.__app.state.items.find((i) => i.status === 'candidate'); return c && { link: c.link, price: c.price, checkedAt: c.checkedAt, brand: c.brand, photo: c.photo.kind, tab: window.__app.ui.tab }; });
  ok(pc && /^https:\/\//.test(pc.link) && pc.price > 0 && pc.checkedAt && pc.brand && pc.photo === 'none' && pc.tab === 'judge', '담은 후보에는 판매처 링크·원화 가격·확인일이 들어가고 상품 사진은 없다', pc);
  await page.locator('#beforeForm').getByRole('button', { name: '후보 삭제' }).click();
  const pkMeta = await page.evaluate(() => ({ runs: window.__app.state.meta.pickRuns, cand: window.__app.state.meta.pickCand, pri: window.__app.state.prefs.pri.join(), seen: window.__app.state.prefs.seen, n: window.__app.state.items.length }));
  ok(pkMeta.runs === 1 && pkMeta.cand === 1 && pkMeta.pri === 'brand,quality' && pkMeta.seen && pkMeta.n === 0, '추천을 본 횟수(1, 다시 그려도 늘지 않음)·담은 수와 기준이 이 브라우저에 남고, 후보를 지우면 빈 옷장으로 돌아간다', pkMeta);

  // 1c. 결정 고리: 판매처에 다녀오면 그 카드 안에서 "샀나요?" → 산 사이즈 → 옷장(치수 함께) → 2주 뒤 사이즈 답 → 잘 맞으면 그 치수를 '잘 맞는 티'로
  await page.click('#tabbtn-shop');
  await page.evaluate(() => document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[target="_blank"]'); if (a) e.preventDefault(); }, true));   // 시험에서는 판매처를 실제로 열지 않는다
  await page.click('#pickTop a.btn.primary');
  ok(!(await page.locator('#askBought').count()), '판매처 링크만 누르고 떠나지 않았으면 "샀나요?"를 묻지 않는다');
  await setVis('hidden'); await setVis('visible');
  ok(await page.locator('#pickTop #askBought').isVisible() && await inView('#askBought'), '판매처에서 돌아오면 그 추천 카드 안에 "샀나요?"가 뜨고 화면에 보이게 옮긴다');
  await page.click('#boughtYes');
  const noDef = await page.locator('#askBought [role="radio"][aria-checked="true"]').count();
  await page.click('#boughtSave');
  ok(noDef === 0 && await page.locator('#askErr').isVisible() && (await page.evaluate(() => window.__app.state.pickLog.slice(-1)[0].bought)) === '', '산 사이즈는 미리 골라 두지 않고, 고르지 않고 저장하면 고르라고 알린다(추천 사이즈 일치율이 부풀지 않게)');
  const defSize = await page.locator('#askBought [role="radio"]', { hasText: '(추천)' }).innerText();
  await page.locator('#askBought [role="radio"]', { hasText: '(추천)' }).click();
  await page.click('#boughtSave');
  const bought = await page.evaluate(() => { const s = window.__app.state, e = s.pickLog[s.pickLog.length - 1], it = s.items.find((i) => i.id === e.ownedId); return { b: e.bought, size: e.boughtSize, it: it && { status: it.status, size: it.size, chest: it.measures.chest, link: it.link } }; });
  const afterBuy = await page.evaluate(() => ({ txt: (document.querySelector('#pickBought') || {}).innerText || '', pick: window.__pick.pick, note: (document.querySelector('#pickBoughtNote') || {}).textContent || '' }));
  ok(defSize === '2(M) (추천)' && bought.b === 'yes' && bought.size === '2' && bought.it && bought.it.status === 'owned' && bought.it.size === '2(M)' && bought.it.chest === 54.5 && !(await page.locator('#askBought').count()) && /샽어요|샀어요/.test(afterBuy.txt) && afterBuy.txt.includes('2(M)') && afterBuy.pick !== 'pottery-ss-classic-white' && /1위·대안에서 뺐어요/.test(afterBuy.note),
    '"샀어요"는 추천 사이즈에 (추천)을 붙여 산 사이즈를 받고, 그 치수와 함께 내 옷장에 넣으며, 산 상품은 "샀어요 · 2(M)"로 따로 보이고 1위·대안에서 빠진다', { defSize, bought, afterBuy });
  await page.click('#pickInclBought');
  ok((await page.evaluate(() => window.__pick.pick)) === 'pottery-ss-classic-white' && (await page.locator('#pickTop #pickBought').count()) === 1 && !(await page.locator('#pickTop #pickVerdict').count()) && (await page.locator('#pickTop .cta a').innerText()).includes('주문·교환'), '"산 상품도 넣어 보기"를 누르면 산 상품이 1위로 돌아오고, 카드는 산 뒤 상태(주문·교환 보기, 평가 줄 없음)로 보인다');
  await page.click('#pickOther');
  await page.evaluate(() => window.__app.flush()); await page.reload(); await page.waitForFunction(() => window.__app);
  const again = await page.evaluate(() => ({ tab: window.__app.ui.tab, ask: !!document.querySelector('#askBought'), b: window.__app.state.pickLog.filter((e) => e.bought === 'yes').length }));
  ok(!again.ask && again.b === 1, '다시 열어도 이미 답한 상품은 다시 묻지 않는다', again);
  await page.evaluate((d) => { const s = window.__app.state; s.pickLog[s.pickLog.length - 1].boughtAt = d; return window.__app.flush(); }, ago(15));
  await page.click('#tabbtn-shop'); await page.click('#tabbtn-closet');
  ok(await page.locator('#pickFollow').isVisible() && (await page.locator('#pickFollow legend').allInnerTexts()).join() === '사이즈,만족', '산 지 2주가 지나면 첫 화면(옷장 탭)에서 사이즈·만족을 묻는다(이름 있는 묶음)');
  await page.locator('#pickFollow input[name="pfSize"][value="fit"]').check(); await page.locator('#pickFollow input[name="pfFeel"][value="good"]').check();
  await page.click('#pickFollowSave');
  const learned = await page.evaluate(() => ({ ref: window.__app.state.prefs.ref, l: window.__app.state.pickLog[window.__app.state.pickLog.length - 1].learned, t: (document.querySelector('#fbDone') || {}).textContent || '', follow: !!document.querySelector('#pickFollow'), focus: document.activeElement && document.activeElement.id }));
  ok(learned.ref.chest === 54.5 && learned.ref.length === 67.5 && learned.l === 'ref' && learned.t.includes('잘 맞는 티') && !learned.follow && learned.focus === 'fbDone', '"잘 맞아요"면 산 사이즈 치수를 다음 추천의 "잘 맞는 티"로 쓰고, 물음 자리에 결과 상자 하나(되돌리기·바뀐 사이즈 보기·의견 보내기)가 초점과 함께 온다', learned);
  await page.click('#fbDoneUndo');
  ok(!Object.keys(await page.evaluate(() => window.__app.state.prefs.ref)).length && !(await page.locator('#fbDone').count()), '되돌리기를 누르면 원래 치수(없음)로 돌아간다');
  // 실측을 넣은 채 '커요'라고 답하면 가슴만 2cm 옮기고 총장·어깨는 남긴다
  await page.evaluate(() => { const s = window.__app.state; s.prefs.ref = { chest: 53, length: 69, shoulder: 46 }; s.pickLog[s.pickLog.length - 1].follow = null; return window.__app.flush(); });
  await page.click('#tabbtn-shop'); await page.click('#tabbtn-closet');
  await page.locator('#pickFollow input[name="pfSize"][value="big"]').check(); await page.locator('#pickFollow input[name="pfFeel"][value="ok"]').check(); await page.click('#pickFollowSave');
  const big = await page.evaluate(() => ({ ref: window.__app.state.prefs.ref, t: (document.querySelector('#fbDone') || {}).textContent || '' }));
  ok(big.ref.chest === 52.5 && big.ref.length === 69 && big.ref.shoulder === 46 && /총장·어깨는 그대로/.test(big.t), '"커요"면 가슴만 2cm 작게 잡고 총장·어깨 실측은 지우지 않는다', big);
  await page.evaluate(() => { window.__app.state.prefs.ref = {}; window.__app.ui.fbDone = null; return window.__app.flush(); });
  await page.evaluate(() => { const s = window.__app.state; s.items = []; s.rack = []; return window.__app.flush(); });   // 다음 시험을 빈 옷장에서 시작
  await page.click('#tabbtn-shop');

  // 1d. 지금 보는 상품(쐐기): 무신사에서 보던 흰 티를 적어 같은 기준으로 견준다(링크는 열지 않는다)
  await ensureOpen('#nowBox');
  await page.fill('#now-link', '[무신사] 아웃스탠딩 오버핏 반팔 티셔츠 https://www.musinsa.com/products/123');
  const fillN = await page.evaluate(() => ({ name: document.querySelector('#now-name').value, brand: document.querySelector('#now-brand').value, fit: document.querySelector('#now-fit').value, note: document.querySelector('#nowFill').textContent }));
  ok(fillN.name === '아웃스탠딩 오버핏 반팔 티셔츠' && fillN.brand === '아웃스탠딩' && fillN.fit === 'relaxed' && fillN.note.includes('브랜드'), '붙여 넣은 공유 글에서 [무신사] 꼬리표를 빼고 이름·브랜드·핏(오버핏)을 채우고, 채운 것을 알린다', fillN);
  await page.click('#nowGo');
  ok(await page.locator('#nowErr').isVisible(), '가격 없이 누르면 가격을 넣으라고 알린다');
  await page.fill('#now-price', '39000');
  await ensureOpen('#nowMore'); await page.selectOption('#now-logo', 'none'); await page.selectOption('#now-thick', 'thin');
  await page.fill('#now-size', 'M'); await page.fill('#now-chest', '56'); await page.fill('#now-length', '71');
  await page.click('#nowGo'); await page.click('#nowGo');
  const now = await page.evaluate(() => ({ u: window.__pick.user, runs: window.__app.state.meta.nowRuns, head: (document.querySelector('#nowHead') || {}).textContent || '', sum: (document.querySelector('#nowSum') || {}).textContent || '', rows: document.querySelectorAll('#nowCmp tbody tr').length, txt: (document.querySelector('#nowRes') || {}).textContent || '' }));
  ok(now.u && /^보던 .*(\d+개 중 \d+위예요|1위예요)\.$|고른 조건에 안 맞아요/.test(now.head) && now.rows >= 4 && /1위 .* 싸요|보던 상품이/.test(now.sum) && now.txt.includes('약한 확인') && !/가장 높아요/.test(now.txt) && now.runs === 1 && !(await overflow()),
    '보던 상품이 몇 위인지 한 줄로, 1위와 두 칸 표(값·조건·사이즈·품질 근거)로, 차이를 한 문장으로 보여 주고(두 번 눌러도 한 번만 셈) 적은 값은 약한 확인이라고 밝힌다', now);
  await page.click('#nd-alt');
  const nd = await page.evaluate(() => { const e = window.__app.state.pickLog.find((x) => /^user-/.test(x.productId)); return e && [e.verdict, e.altId]; });
  ok(nd && nd[0] === 'alt' && !!nd[1], '"1위로 바꿀래요"를 누르면 보던 상품 기록에 1위로 바꿨다고 남는다', nd);
  await page.evaluate(() => window.__app.flush()); await page.reload(); await page.waitForFunction(() => window.__app);
  ok((await page.locator('#nowRes').count()) === 1 && (await page.evaluate(() => window.__app.state.prefs.now.price)) === '39000', '새로 고쳐도 적은 값과 견준 결과가 남는다');
  await page.screenshot({ path: path.join(shots, m.name + '-1d-now.png'), fullPage: true });
  await page.click('#nowClear');
  // 주소 없이 이름만 붙여 넣어도 이름으로 쓰고, 이름을 안 적으면 '보던 상품'이라고 부른다
  await ensureOpen('#nowBox');
  await page.fill('#now-link', '베이식 크루넥 반팔 티셔츠 화이트 오버핏');
  const plainN = await page.evaluate(() => ({ name: document.querySelector('#now-name').value, fit: document.querySelector('#now-fit').value }));
  await page.fill('#now-price', '19900'); await page.click('#nowGo');
  const nh1 = await page.evaluate(() => document.querySelector('#nowHead').textContent);
  await page.click('#nowClear'); await ensureOpen('#nowBox'); await page.fill('#now-price', '25000'); await page.click('#nowGo');
  const nh2 = await page.evaluate(() => [document.querySelector('#nowHead').textContent, document.querySelector('#nowRes .fl2').textContent]);
  ok(plainN.name === '베이식 크루넥 반팔 티셔츠 화이트 오버핏' && plainN.fit === 'relaxed' && /^보던 베이식 크루넥 반팔 티셔츠 화이트 오버핏(은|는) 같은 기준으로/.test(nh1) && /^보던 상품은 같은 기준으로 \d+개 중 \d+위예요\.$/.test(nh2[0]) && /^보던 상품 · /.test(nh2[1]) && !/지금 보는 상품/.test(nh2.join('')),
    '주소 없이 이름만 붙여 넣어도 이름·핏을 채우고, 이름이 없으면 "보던 상품"으로 부른다', { plainN, nh1, nh2 });
  await page.click('#nowClear');
  // 카디건 총장을 넣으면 '카디건보다 짧게'가 켜지고, 고른 사이즈 총장과 견준다
  await page.click('#pickEdit');
  ok(await page.locator('#pk-cond-notLonger').isDisabled() && await page.locator('#pk-closed').isVisible(), '총장을 넣기 전에는 "카디건보다 짧게" 자리가 꺼진 채로 있고, 단추 잠금 질문이 보인다');
  await page.fill('#pk-outer', '68');
  const on1 = await page.locator('#pk-cond-notLonger').getAttribute('aria-pressed');
  await page.click('#pickGo');
  const cl = await page.evaluate(() => ({ s: window.__app.state.prefs.outerLen, c: window.__pick.checks.find((x) => x.label === '카디건보다 짧게') }));
  ok(on1 === 'true' && cl.s === 68 && cl.c && /카디건\(68cm\)/.test(cl.c.text), '총장을 치는 동안 화면을 다시 그리지 않아 바로 누른 "딱 하나 보기"가 먹히고, "카디건보다 짧게"로 밑단이 보이는지 본다', cl);
  await page.click('#pickEdit'); await page.fill('#pk-outer', ''); await page.click('#pickGo');
  // 살까 말까에 붙여 넣은 글이 흰 티면 '보던 흰 티'로 보낸다
  await page.goto(origin + '/?text=' + encodeURIComponent('[무신사] 아웃스탠딩 화이트 반팔 티셔츠 https://www.musinsa.com/products/9'));
  await page.waitForFunction(() => window.__app && document.querySelector('#qcDlg').open);
  ok(await page.locator('#qcToPick').isVisible() && (await page.inputValue('#qc-kind')) === 'tee' && (await page.inputValue('#qc-family')) === 'white', '살까 말까에 붙여 넣은 글에서 종류(티셔츠)·색(흰색)을 채우고, 흰 티면 "같은 기준으로 견주기"를 준다');
  await page.click('#qcToPick');
  ok((await page.evaluate(() => window.__app.ui.tab)) === 'shop' && (await page.locator('#nowBox').getAttribute('open')) !== null && (await page.inputValue('#now-name')) === '아웃스탠딩 화이트 반팔 티셔츠', '누르면 추천 탭의 "보던 흰 티"가 열리고 이름이 채워진다');
  await page.click('#tabbtn-closet');

  // 2. 예시 A 둘러보기 → 3D → 지우기
  await ensureOpen('#startMore'); await page.click('#startSample');
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
  await ensureOpen('#startMore'); await page.click('#startSampleB');
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
  ok((await page.locator('#qc-src').innerText()).includes('무신사') && (await page.inputValue('#qc-name')) === '미니멀 울 코트' && (await page.inputValue('#qc-cat')) === 'outer' && (await page.inputValue('#qc-kind')) === 'coat' && (await page.locator('#qcGuess').innerText()).includes('코트'), '붙여 넣은 글에서 판매처(무신사)와 이름을 채우고, 종류(코트)를 골라 두고 알린다', await page.inputValue('#qc-name'));
  await page.fill('#qc-link', ''); await page.fill('#qc-name', '');
  await page.fill('#qc-link', '폴로 랄프로렌 케이블 니트 코튼 브이넥 카디건 네이비 https://www.ralphlauren.co.kr/x');
  ok((await page.inputValue('#qc-kind')) === 'cardigan' && (await page.inputValue('#qc-family')) === 'navy', '"케이블 니트 … 카디건 네이비"는 셔츠·흰색이 아니라 카디건·네이비로 고른다(창업자의 첫 불만)', [await page.inputValue('#qc-kind'), await page.inputValue('#qc-family')]);
  await page.fill('#qc-link', ''); await page.fill('#qc-name', ''); await page.fill('#qc-link', '[무신사] 미니멀 울 코트 https://www.musinsa.com/products/1234567');
  await page.selectOption('#qc-cat', 'outer'); await page.selectOption('#qc-kind', 'coat'); await page.selectOption('#qc-family', 'gray');
  await page.locator('#qc-lean input[value="unsure"]').check(); await page.click('#qcGo');
  await page.waitForSelector('#vCombos');
  const linked = await page.evaluate(() => window.__app.state.items.find((i) => i.name === '미니멀 울 코트'));
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
  ok(bk.schema === 2 && bk.items.filter((i) => i.status === 'owned').length === 6 && bk.items.filter((i) => i.status === 'candidate').length === 2 && bk.decisions.length === 2 && bk.decisions[0].follow.feel === 'good' && bk.prefs && bk.prefs.pri.join() === 'brand,quality' && bk.pickLog.length === 2 && bk.pickLog.some((e) => e.follow) && bk.meta && bk.meta.pickRuns >= 1 && !(await page.locator('#backupNote').count()),
    '백업 파일(스키마 2)에 옷 6벌·살까 말까 후보 2벌과 판정 기록·2주 뒤 답, 추천 설정·기록·사용 횟수가 들어가고 알림이 사라진다', dl.suggestedFilename());
  // 7b. 다른 브라우저(새 환경)에서 백업을 가져오면 추천 설정과 기록도 돌아온다
  {
    const ctx2 = await browser.newContext({ viewport: { width: m.w, height: m.h }, colorScheme: m.scheme });
    const p2 = await ctx2.newPage(); await p2.goto(origin + '/'); await p2.waitForFunction(() => window.__app);
    await p2.click('#tabbtn-log'); await p2.setInputFiles('#importFile', bf); await p2.click('#importGo');
    const got = await p2.evaluate(() => ({ n: window.__app.state.items.length, c: window.__app.state.items.filter((i) => i.status === 'candidate').length, pri: window.__app.state.prefs.pri.join(), log: window.__app.state.pickLog.length, f: window.__app.state.pickLog.some((e) => e.follow && e.follow.size === 'big'), runs: window.__app.state.meta.pickRuns }));
    ok(got.n === 8 && got.c === 2 && got.pri === 'brand,quality' && got.log === 2 && got.f && got.runs >= 1, '백업을 새 브라우저에서 가져오면 옷·후보·추천 설정·추천 기록(2주 뒤 답)·사용 횟수가 돌아온다', got);
    await ctx2.close();
  }

  // 8. 안내와 의견 보내기
  await page.click('#helpBtn');
  const help = await page.locator('#helpBody').innerText();
  ok(help.includes('이 브라우저 안에만 저장') && help.includes('2주 뒤'), '안내에 저장 위치·한계와 2주 뒤 물음이 적혀 있다');
  await page.click('#helpClose');
  await page.click('#fbBtn'); await page.fill('#fbText', '시험 의견');
  await page.locator('#fbPmf input[value="very"]').check(); await page.selectOption('#fbNps', '9');
  const pv = await page.locator('#fbPreview').innerText();
  const mline = (pv.match(/EOUL1\|\S+/) || [''])[0];
  ok(pv.includes('더는 못 쓰게 되면: 매우 아쉽다 · 추천할 마음: 9/10') && /\|own=6\|/.test(mline) && /\|done=1\|/.test(mline) && /\|quick=5\|/.test(mline) && /\|fol=1\|good=1\|/.test(mline) && /\|pmf=very\|nps=9\|/.test(mline) && /\|pk=3\|pko=1\|pkc=1\|pka=1\|pkb=1\|pkf=1\|pkfit=0\|pkr=0\|pkal=0\|pknow=3\|pksh=1\|pkx=pottery-ss-classic-white~2~big~ok~2\|pkw=0~0~0~0~0\|nwd=0~1~0\|nx=oxford\|/.test(mline) && /id=[a-z0-9]{6,16}\|/.test(mline),
    '만족도 질문(더는 못 쓰면·추천할 마음)과 운영자가 읽을 요약 한 줄이 붙는다', mline);
  ok(pv.includes('시험 의견') && pv.includes(VER) && pv.includes('옷 6벌') && pv.includes('후보 2') && pv.includes('연 날 1일') && pv.includes('빠른 시작 5벌') && pv.includes('2주 뒤 답 1건(잘함 1') && !pv.includes('흰 셔츠') && !pv.includes('트렌치') && !pv.includes('스커트') && !pv.includes('musinsa'),
    '의견 미리보기에 사용 요약(빠른 시작·2주 뒤 답 포함)은 있고 옷 이름은 없다', pv.split('\n').slice(2));
  await page.click('#fbCopy'); await page.waitForTimeout(200);
  ok((await page.locator('#fbMsg').innerText()).length > 0, '복사하기를 누르면 결과를 알려 준다', await page.locator('#fbMsg').innerText());
  await page.click('#fbClose');

  // 8b. 운영자: 받은 의견 여러 개를 붙여 넣으면 베타 지표를 계산한다 (같은 사람은 최근 것만)
  const mine = await page.evaluate(() => window.__feedback);
  const other = 'EOUL1|id=zz99yy|v=0.5.0-beta|at=2026-10-20|own=2|draft=0|photo=0|cand=0|done=0|prod=0|rack=0|quick=2|days=1|d30=1|fol=0|first=2026-10-19|good=0|ok=0|regret=0|nb=0|due=0|pmf=not|nps=4|err=1|scr=390x844';
  const older = other.replace('at=2026-10-20', 'at=2026-10-19').replace('own=2', 'own=1');
  await page.click('#tabbtn-log');
  const plb = await page.locator('#pickLogBox').innerText().catch(() => '');
  ok(plb.includes('샀음 · 2(M)') && plb.includes('큼') && plb.includes('1위로 바꿀래요') && !(await page.locator('#advanced').count()), '기록 탭에 추천 기록(샀음·산 사이즈·2주 뒤 답, 보던 상품 결정)이 줄 목록으로 남고, 개발용 서버 맞추기는 웹판에 없다', plb.slice(0, 160));
  await page.click('#opsBox > summary');
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
  const cspText = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  ok(csp.meta && csp.robots.includes('noindex') && csp.fetch === 'blocked' && csp.script === 'blocked' && !/localhost|127\.0\.0\.1/.test(cspText) && !(await page.locator('#advanced').count()), '보안 정책이 외부 전송·외부 스크립트·이 컴퓨터 주소로 보내기를 막고, 개발용 서버 맞추기는 웹판에 없으며, 검색 노출을 막는 표시가 있다', csp);
  await ctx.close();
}
await browser.close();
server.close();
console.log(failed ? failed + '건 실패' : '모두 통과');
process.exit(failed ? 1 : 0);
