// dist/index.html을 헤드리스 브라우저로 열어 핵심 흐름을 끝까지 실행하고 화면을 찍는다. 개발 확인용.
// 기대값은 data/sample-wardrobe.json(예시 옷장 13벌)에 맞춰져 있다. 다른 옷장 자료로 빌드한 파일에는 그대로 쓸 수 없다.
// 사용: node tools/check.mjs            환경 변수: PAGE(다른 파일), NO3D=1(3D 탭 건너뛰기), QUICK=1(밝은 화면만)
// CHROMIUM_EXECUTABLE(설치된 브라우저), NATIVE_GPU=1(맥 등에서 기본 GPU로 전체 검사)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'shots'); fs.mkdirSync(shots, { recursive: true });
const file = pathToFileURL(path.join(root, process.env.PAGE || 'dist/index.html')).href;
const mobileBuild = (process.env.PAGE || '').includes('mobile/');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: process.env.NATIVE_GPU === '1' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const results = [];
const ok = (cond, label, extra) => { if (!cond) failed++; results.push({ pass: !!cond, label, ...(extra === undefined ? {} : { detail: extra }) }); console.log((cond ? '  ok   ' : '  FAIL ') + label + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); };
// 경로에 한글·공백이 있으면 Chromium 파일 선택이 조용히 실패해서, 파일 내용을 버퍼로 넘긴다
const asFile = (f, mimeType = 'application/json') => ({ name: path.basename(f), mimeType, buffer: fs.readFileSync(f) });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR4nGP4z8DwHwYZAB5pA/1Oxp5HAAAAAElFTkSuQmCC', 'base64');   // 2×2 png
const pngFile = (name) => ({ name, mimeType: 'image/png', buffer: PNG });
// 단색 PNG 를 만든다(사진에서 색 뽑기 확인용)
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function solidPng(w, hgt, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * hgt);
  for (let y = 0; y < hgt; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2]; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(hgt, 4); ihdr[8] = 8; ihdr[9] = 2;
  return { name: 'solid.png', mimeType: 'image/png', buffer: Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]) };
}
const v1fixture = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/wardrobe-v1.json'), 'utf8'));
const modes = process.env.QUICK ? [{ name: 'desk-light', w: 1280, h: 900, scheme: 'light' }] : [{ name: 'desk-light', w: 1280, h: 900, scheme: 'light' }, { name: 'phone-dark', w: 390, h: 844, scheme: 'dark' }];
for (const m of modes) {
  console.log(m.name);
  const ctx = await browser.newContext({ viewport: { width: m.w, height: m.h }, colorScheme: m.scheme, acceptDownloads: true });
  const page = await ctx.newPage();
  const logs = [], reqs = [], dialogs = [];
  page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') logs.push(msg.text().slice(0, 200)); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  const MOCK = 'http://127.0.0.1:8099';                                                              // 내 서버 흉내(page.route). 실제 서버(server/)와의 연결은 여기서 확인하지 않는다
  const syncReqs = [];
  page.on('request', (r) => { if (r.url().startsWith(MOCK)) { syncReqs.push(r.method() + ' ' + r.url().slice(MOCK.length)); return; } if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) reqs.push(r.url()); });
  const mockToken = 'synthetic-regression-token-000000000000000000';
  const srv = { wardrobe: null, catalog: null, keys: new Set(), version: 0 };
  const cors = { 'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Expose-Headers': 'Idempotent-Replayed,X-Wardrobe-Version' };
  await page.route(MOCK + '/**', async (route) => {
    const q = route.request(), u = new URL(q.url());
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const json = (o, status = 200) => route.fulfill({ status, headers: Object.assign({ 'Content-Type': 'application/json', 'X-Wardrobe-Version': String(srv.version) }, cors), body: JSON.stringify(o) });
    if (q.method() === 'POST' && u.pathname === '/api/auth/login') return json({ token: mockToken, expiresAt: '2099-01-01T00:00:00Z', user: { username: 'synthetic-qa', ownerId: 77 } });
    if (q.headers().authorization !== 'Bearer ' + mockToken) return json({ detail: '로그인이 필요합니다' }, 401);
    if (q.method() === 'GET' && u.pathname === '/api/auth/me') return json({ username: 'synthetic-qa', ownerId: 77 });
    if (q.method() === 'POST' && u.pathname === '/api/auth/logout') return route.fulfill({ status: 204, headers: cors });
    if (q.method() === 'POST' && (u.pathname === '/api/wardrobe/import' || u.pathname === '/api/catalog/import')) {
      const key = q.headers()['idempotency-key'] || '', body = JSON.parse(q.postData()), wardrobe = u.pathname.includes('wardrobe');
      if (!q.headers()['if-match']) return json({ detail: '서버 버전을 확인해 주세요' }, 428);
      if (q.headers()['if-match'] !== '"' + srv.version + '"') return json({ detail: '더 새로운 서버 기록이 있습니다' }, 409);
      const replayed = srv.keys.has(key); srv.keys.add(key);
      if (wardrobe) srv.wardrobe = body; else srv.catalog = body;
      if (!replayed) srv.version++;
      return json({ items: (wardrobe ? body.items : body.products).length, created: replayed ? 0 : 1, updated: 0, decisions: wardrobe ? body.decisions.length : 0, replayed });
    }
    if (q.method() === 'GET' && u.pathname === '/api/wardrobe') { const w = JSON.parse(JSON.stringify(srv.wardrobe)); w.items[1].name = w.items[1].name + ' (서버)'; return json(w); }
    if (q.method() === 'GET' && u.pathname === '/api/catalog') return json(srv.catalog);
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const shot = (n, opts) => page.screenshot(Object.assign({ path: path.join(shots, m.name + '-' + n + '.png'), fullPage: true, timeout: 120000 }, opts || {}));
  const st = () => page.evaluate(() => window.__app.state);
  const flush = () => page.evaluate(() => window.__app.flush());
  const noOpenDialogs = async (label) => ok(await page.locator('dialog[open]').count() === 0, label);

  // 0. 데스크톱은 v0.3 저장소 이전을, 모바일 미리보기는 빈 상태에서 예시 선택과 저장을 확인한다.
  const v1state = Object.assign({}, v1fixture, { others: [] });
  v1state.items[0] = Object.assign({}, v1state.items[0], { brand: 'Brand A', confirmed: true, img: 'data:image/png;base64,' + PNG.toString('base64') });
  if (!mobileBuild) await ctx.addInitScript((s) => { try { if (!localStorage.getItem('otjang.v2') && !localStorage.getItem('__migrated')) { localStorage.setItem('otjang.v1', JSON.stringify(s)); localStorage.setItem('__migrated', '1'); } } catch (e) { /* 무시 */ } }, v1state);
  await page.goto(file);
  await page.waitForFunction(() => window.__app);
  if (mobileBuild) {
    await page.locator('#startMore > summary').click(); await page.click('#startSample');
    await page.waitForFunction(() => window.__app.state.items.length === 13 && window.__app.state.meta.sample);
    await flush(); await page.reload(); await page.waitForFunction(() => window.__app);
    ok((await page.evaluate(() => window.__app.state.loadedFrom)) === 'idb', '모바일 미리보기에서 예시 옷장을 선택하고 새로고침 뒤에도 불러온다');
  } else {
    await page.click('#tabbtn-closet');
    const mig = await page.evaluate(() => { const s = window.__app.state; return { from: s.loadedFrom, n: s.items.length, src0: s.items[0].attrSource, src1: s.items[1].attrSource, photo0: s.items[0].photo.kind, own0: s.items[0].photo.ownImg.slice(0, 15), brand0: s.items[0].brand, v1kept: !!localStorage.getItem('otjang.v1'), rack: s.rack.length, mode: window.__app.store.mode }; });
    ok(mig.from === 'ls1' && mig.n === 13 && mig.src0 === 'owner-confirmed' && mig.src1 === 'photo-draft' && mig.photo0 === 'own' && mig.own0.startsWith('data:image/png') && mig.brand0 === 'Brand A' && mig.v1kept, 'v0.3 저장소(스키마 1)를 읽어 스키마 2로 옮기고, 예전 저장소는 그대로 둔다', mig);
    ok(mig.mode === 'idb', '저장은 IndexedDB를 쓴다', mig.mode);
    ok(mig.rack === 0, 'v0.3 자료에는 3D 형태 정보가 없어 처음에는 걸린 옷이 없다', mig.rack);
    await flush();
    await page.reload(); await page.waitForFunction(() => window.__app);
    ok((await page.evaluate(() => window.__app.state.loadedFrom)) === 'idb', '다시 열면 IndexedDB에 저장된 상태를 읽는다');
    await page.evaluate(async () => { await window.__app.store; });
    await page.click('#tabbtn-log'); await page.click('#resetBtn'); await page.click('#resetBtn'); await flush();
  }
  await page.click('#tabbtn-closet');
  const base = await page.evaluate(() => ({ n: window.__app.state.items.length, rack: window.__app.state.rack.length, drafts: window.__app.state.items.filter((i) => i.attrSource === 'photo-draft').length, cands: window.__app.state.items.filter((i) => i.matchCandidates.length).length }));
  ok(base.n === 13 && base.rack === 5 && base.drafts === 13 && base.cands === 2, '처음 상태: 13벌 모두 초안, 3D 형태 5벌이 걸려 있고, 미확인 브랜드 후보 2벌', base);
  const draftVerdict = await page.evaluate(() => window.__app.J.judgeCandidate(window.__app.state.items, { ...window.__app.state.items[0], status: 'candidate' }));
  ok(draftVerdict.status === 'needs-confirmation' && draftVerdict.before === null && draftVerdict.after === null, '합성 예시 초안은 확인 전 조합 수를 만들지 않는다');
  const reviewEntry = await page.locator('#reviewPhotoDrafts').evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, viewport: innerHeight }; });
  ok(reviewEntry.top >= 0 && reviewEntry.bottom <= reviewEntry.viewport, '사진 초안 일괄 확인 버튼이 옷장 첫 화면 안에 보인다', reviewEntry);
  const firstViewPrimary = await page.locator('#main .btn.primary').evaluateAll((els) => els.filter((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).length);
  ok(firstViewPrimary === 1, '사진 초안이 남아 있을 때 첫 화면의 강조 행동은 하나다', firstViewPrimary);
  await page.click('#reviewPhotoDrafts');
  ok(await page.locator('#draftReview').isVisible() && await page.locator('#draftReview [data-confirm-draft]').count() > 0, '옷장 첫 화면에서 사진 초안 검토를 열 수 있다');
  await page.getByRole('button', { name: '나중에', exact: true }).click();
  await noOpenDialogs('사진 초안 검토를 닫으면 열린 대화상자가 남지 않는다');
  await page.click('#tabbtn-outfits');
  const outfitDraftReview = page.getByRole('button', { name: /사진 초안 한 번에 확인/ });
  ok(await outfitDraftReview.count() === 1, '코디 화면에서도 초안 일괄 검토로 이동할 수 있다');
  await outfitDraftReview.click(); await page.getByRole('button', { name: '나중에', exact: true }).click();
  await page.click('#tabbtn-closet');

  // 1. 옷장: 배지, 기록 편집, 확인하기(모르는 것만 묻기)
  ok(await page.locator('#closetGrid .card').count() === 13, '옷장에 13벌이 보인다');
  ok(await page.locator('#closetGrid .badge.draft', { hasText: '사진에서 뽑은 초안' }).count() === 13 && await page.locator('#closetGrid .badge', { hasText: '브랜드 후보 1' }).count() === 2, '초안 배지 13개와 브랜드 후보 배지 2개가 보인다');
  ok(!(await overflow()), '옷장 화면에 가로 넘침이 없다');
  await shot('1-closet');
  let blazerCard = page.locator('#closetGrid .card', { hasText: '네이비 블레이저' });
  await blazerCard.locator('details.item-tools > summary').click();
  await blazerCard.getByRole('button', { name: '기록 수정' }).click();
  await page.fill('#f-brand', 'Brand A'); await page.fill('#f-size', '38'); await page.fill('#f-year', '2022');
  await page.fill('#f-review', '세 해째 입는다. 소매 시보리가 조금 늘었다.'); await page.selectOption('#f-rebuy', 'yes'); await page.check('#f-confirmed');
  await page.setInputFiles('#f-photo', pngFile('my.png'));
  if (m.name === 'desk-light') await page.screenshot({ path: path.join(shots, m.name + '-1b-editor.png') });
  await page.click('#edSave'); await page.waitForFunction(() => !document.querySelector('#editor').open);
  const blazerText = await page.locator('#closetGrid .card', { hasText: '네이비 블레이저' }).innerText();
  const it0 = await page.evaluate(() => { const i = window.__app.state.items.find((x) => x.id === 's-blazer-navy'); return { src: i.attrSource, photo: i.photo.kind, own: i.photo.ownImg.slice(0, 15) }; });
  ok(blazerText.includes('Brand A') && blazerText.includes('사이즈 38') && blazerText.includes('년째') && blazerText.includes('다시 산다') && !blazerText.includes('초안') && it0.src === 'owner-confirmed' && it0.photo === 'own' && it0.own.startsWith('data:image'), '기록을 저장하면 카드에 보이고, 확인 체크로 초안 표시가 사라지며, 내 사진이 들어간다', it0);
  // 확인하기: 현재 카드 동선은 빠른 정보 확인이며 모르는 속성은 비워 둔다.
  const oliveCard = page.locator('#closetGrid .card', { hasText: '올리브 필드 재킷' });
  await oliveCard.getByRole('button', { name: /정보 확인/ }).click();
  ok(await page.locator('#quickItemForm').isVisible() && (await page.inputValue('#q-name')) === '올리브 필드 재킷', '사진 초안의 기존 이름과 값이 빠른 확인 화면에 채워진다');
  await page.fill('#q-brand', '브랜드 C'); await page.check('#q-confirmed'); await page.click('#quickSave');
  await page.waitForFunction(() => !document.querySelector('#quickItem')?.open);
  await noOpenDialogs('빠른 정보 확인 뒤 대화상자가 닫힌다');
  const fj = await page.evaluate(() => { const i = window.__app.state.items.find((x) => x.id === 's-field-olive'); return { src: i.attrSource, brand: i.brand, model: i.model, photo: i.photo.kind, product: i.product, look: i.look3d }; });
  ok(fj.src === 'owner-confirmed' && fj.brand === '브랜드 C' && fj.model === '' && fj.photo === 'none' && fj.product === null && fj.look && fj.look.kind === 'field', '빠른 확인은 직접 확인한 속성만 확정하고 상품 사진·3D 형태는 유지한다', fj);

  // 2. 상품 사진과 확인: 대체 이미지 → 후보 → 확인 → 취소 → 떼기. 브랜드·가격은 내 옷 정보에 섞이지 않는다
  blazerCard = page.locator('#closetGrid .card', { hasText: '네이비 블레이저' });
  await blazerCard.locator('details.item-tools > summary').click();
  await blazerCard.getByRole('button', { name: '상품 사진' }).click();
  await page.fill('#mt-brand', '어느 브랜드'); await page.fill('#mt-source', '쇼핑몰'); await page.fill('#mt-url', 'https://shop.example/x'); await page.setInputFiles('#mt-photo', pngFile('sub.png'));
  await page.click('#mtSub'); await page.waitForFunction(() => window.__app.state.items.find((x) => x.id === 's-blazer-navy').photo.kind === 'substitute');
  let bl = await page.evaluate(() => { const i = window.__app.state.items.find((x) => x.id === 's-blazer-navy'); return { photo: i.photo.kind, img: i.photo.img.slice(0, 10), own: i.photo.ownImg.slice(0, 10), brand: i.brand, src: i.photo.sourceName, url: i.photo.sourceUrl, product: i.product, cands: i.matchCandidates.length }; });
  ok(bl.photo === 'substitute' && bl.img === 'data:image' && bl.own === 'data:image' && bl.brand === 'Brand A' && bl.src === '쇼핑몰' && bl.url === 'https://shop.example/x' && bl.product === null && bl.cands === 0, '대체 이미지를 걸어도 내 브랜드 기록은 그대로이고 사진 출처만 남는다', bl);
  await page.fill('#mt-brand', '브랜드 A'); await page.fill('#mt-name', '모델 1'); await page.click('#mtAddCand');
  bl = await page.evaluate(() => { const i = window.__app.state.items.find((x) => x.id === 's-blazer-navy'); return { cands: i.matchCandidates.map((c) => c.brand + '/' + c.name + '/' + c.evidence), photo: i.photo.kind, product: i.product }; });
  ok(bl.cands.length === 1 && bl.cands[0] === '브랜드 A/모델 1/owner' && bl.photo === 'substitute' && bl.product === null, '후보만 적으면 후보 목록에만 들어가고 사진 상태는 그대로다', bl);
  await page.locator('#mtBody .candrow button', { hasText: '같은 상품으로 확인' }).click();
  bl = await page.evaluate(() => { const i = window.__app.state.items.find((x) => x.id === 's-blazer-navy'); return { photo: i.photo.kind, product: i.product, brand: i.brand, model: i.model, cands: i.matchCandidates.length }; });
  ok(bl.photo === 'confirmed' && bl.product && bl.product.brand === '브랜드 A' && bl.product.name === '모델 1' && bl.product.confirmedAt && bl.brand === 'Brand A' && bl.model === '모델 1' && bl.cands === 0, '사용자가 확인하면 확인된 동일 제품이 되고 확인일이 남는다', bl);
  await page.click('#mtUnconfirm');
  bl = await page.evaluate(() => { const i = window.__app.state.items.find((x) => x.id === 's-blazer-navy'); return { photo: i.photo.kind, product: i.product, cands: i.matchCandidates.length }; });
  ok(bl.photo === 'candidate' && bl.product === null && bl.cands === 1, '확인을 취소하면 미확인 후보로 내려가고 후보 목록으로 돌아간다', bl);
  await page.click('#mtClear');
  bl = await page.evaluate(() => { const i = window.__app.state.items.find((x) => x.id === 's-blazer-navy'); return { photo: i.photo.kind, img: i.photo.img === i.photo.ownImg }; });
  ok(bl.photo === 'own' && bl.img, '상품 사진을 떼면 내 사진으로 돌아간다', bl);
  await page.click('#mtCancel');
  ok(await page.locator('#closetGrid .card', { hasText: '네이비 블레이저' }).locator('.badge', { hasText: '브랜드 후보' }).count() === 1, '카드에 브랜드 후보 배지가 보인다');

  // 2b. 품질이 낮은 사진은 색을 추정하지 않고, 필요한 분류를 확인한 뒤에만 임시 옷장에 넣는다.
  await page.locator('.owned-registration-tools > summary').click(); await page.click('#addPhotos');
  await page.setInputFiles('#bulkFile', solidPng(32, 32, [128, 128, 128]));
  await page.waitForSelector('#bulkDlg .brow');
  const intakeText = await page.locator('#bulkDlg .brow').innerText();
  ok(intakeText.includes('사진이 작아 세부를 확인하기 어렵습니다') && intakeText.includes('사진에서 옷의 구분이 어렵습니다') && await page.getByRole('button', { name: '실제 옷 색과 같아요' }).count() === 0, '작고 구분이 어려운 사진은 색을 추정하지 않고 촬영 안내를 표시한다', intakeText);
  await page.selectOption('#bk-cat-0', 'top'); await page.selectOption('#bk-kind-0', 'knit');
  await page.fill('#bk-name-0', '저화질 사진 시험용 니트'); await page.locator('#bkList .brow input[type="checkbox"]').check();
  ok(await page.isEnabled('#bkAdd'), '한 벌 여부와 분류를 확인해야 사진 등록을 진행할 수 있다');
  await page.click('#bkAdd'); await page.waitForFunction(() => !document.querySelector('#bulkDlg').open);
  const gi = await page.evaluate(() => { const i = window.__app.state.items.find((x) => x.name === '저화질 사진 시험용 니트'); return i && { source: i.attrSource, family: i.family, light: i.light, photo: i.photo.kind, own: i.photo.ownImg.startsWith('data:image'), missing: window.__app.W.assessment(i).missing }; });
  ok(gi && gi.source === 'owner' && gi.family === null && gi.light === null && gi.photo === 'own' && gi.own && gi.missing.includes('family') && gi.missing.includes('light'), '저화질 사진의 색은 미확정으로 남아 추천 계산에 들어가지 않는다', gi);
  const testPhotoCard = page.locator('#closetGrid .card', { hasText: '저화질 사진 시험용 니트' });
  await testPhotoCard.locator('details.item-tools > summary').click(); await testPhotoCard.getByRole('button', { name: '삭제' }).click();
  await page.waitForFunction(() => !window.__app.state.items.some((x) => x.name === '저화질 사진 시험용 니트'));
  // 이번 핵심 검사는 버튼을 통해 확인하고 저장한 뒤 새로고침해도 유지되는지 본다.
  const draftsBeforeBulkReview = await page.evaluate(() => window.__app.state.items.filter(window.__app.W.isDraft).length);
  await page.click('#reviewPhotoDrafts');
  const draftChecks = await page.locator('#draftReview [data-confirm-draft]').all();
  for (const checkbox of draftChecks) await checkbox.check();
  await page.click('#applyDraftConfirmation');
  await page.waitForFunction(() => !document.querySelector('#draftReview')?.open);
  await noOpenDialogs('일괄 확인을 저장하면 초안 검토 대화상자가 닫힌다');
  const draftsAfterBulkReview = await page.evaluate(() => window.__app.state.items.filter(window.__app.W.isDraft).length);
  ok(draftChecks.length > 0 && draftsBeforeBulkReview - draftsAfterBulkReview === draftChecks.length, '확인 가능한 사진 초안만 골라 옷장에 일괄 반영한다', { selected: draftChecks.length, before: draftsBeforeBulkReview, after: draftsAfterBulkReview });
  await page.reload(); await page.waitForFunction(() => window.__app);
  const draftsAfterReload = await page.evaluate(() => window.__app.state.items.filter(window.__app.W.isDraft).length);
  ok(draftsAfterReload === draftsAfterBulkReview, '사진 초안 확인 결과가 새로고침 뒤에도 저장되어 있다', draftsAfterReload);
  // 이후 숫자 골든은 완성된 합성 입력을 기준으로 한다. 원본 예시 JSON과 사용자의 실제 저장 자료는 바꾸지 않는다.
  await page.evaluate(() => { window.__app.state.items = window.__app.state.items.map((item) => window.__app.W.cleanItem({ ...item, attrSource: 'owner-confirmed' }, 0)); });
  await page.click('#tabbtn-closet');
  const readyFirstViewPrimary = await page.locator('#main .btn.primary').evaluateAll((els) => els.filter((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).length);
  ok(readyFirstViewPrimary === 1, '확인된 옷장 첫 화면에도 강조 행동이 하나다', readyFirstViewPrimary);

  // 3. 살까 말까: 빠른 후보 추가 → 판정(확인 전 속성 표시) → 결정 → 보유로
  await page.click('#tabbtn-judge');
  ok(await page.locator('#firstCompare').count() === 1 && await page.locator('#quickCand').count() === 1 && await page.locator('#quickCandidate').count() === 0 && await page.locator('#addCand').count() === 0, '후보가 없을 때 입력 경로를 직접 입력과 링크 붙여넣기로 나눈다');
  await page.click('#quickCand'); await page.fill('#q-paste', '무신사 흰색 반팔 티셔츠 https://www.musinsa.com/products/5755268');
  const pastedCandidate = await page.evaluate(() => ({ name: document.querySelector('#q-name').value, link: document.querySelector('#q-link').value, kind: document.querySelector('#q-kind').value, family: document.querySelector('#q-family').value }));
  ok(pastedCandidate.name.includes('흰색') && pastedCandidate.link === 'https://www.musinsa.com/products/5755268' && pastedCandidate.kind === 'tee' && pastedCandidate.family === 'white', '상품 링크·공유 글을 같은 등록 화면에서 읽어 이름과 확인 전 추측값을 채운다', pastedCandidate);
  await page.click('#quickCancel'); await noOpenDialogs('붙여넣기 후보 입력을 취소하면 열린 대화상자가 남지 않는다');
  await page.click('#firstCompare');
  ok(await page.locator('#quickItemForm').isVisible() && (await page.inputValue('#q-light')) === '', '후보 빠른 등록은 모르는 밝기를 비워 두고 시작한다');
  await page.selectOption('#q-cat', 'top'); await page.selectOption('#q-kind', 'sweat'); await page.fill('#q-name', '그레이 스웻셔츠');
  await page.fill('#q-brand', '브랜드'); await page.fill('#q-price', '89000'); await page.fill('#q-link', 'https://shop.example/gray-sweat');
  await page.selectOption('#q-family', 'gray'); await page.fill('#q-light', '50'); await page.selectOption('#q-formality', '1'); await page.selectOption('#q-pattern', 'solid'); await page.check('#q-confirmed'); await page.click('#quickSave');
  await page.locator('#beforeForm').getByRole('button', { name: '후보 수정' }).click();
  ok((await page.inputValue('#f-brand')) === '브랜드' && (await page.inputValue('#f-price')) === '89000', '빠른 상품 입력의 브랜드와 가격이 자세히 수정하는 화면에도 남는다');
  await page.click('#edSave');
  await page.locator('#beforeForm').getByRole('button', { name: '후보 수정' }).click(); await page.click('#f-match');
  await page.fill('#mt-brand', '브랜드'); await page.fill('#mt-name', '합성 확인 상품'); await page.setInputFiles('#mt-photo', pngFile('prod.png')); await page.click('#mtConfirm'); await page.click('#mtCancel');
  const cnd = await page.evaluate(() => { const c = window.__app.state.items.find((i) => i.status === 'candidate'); return c && { photo: c.photo.kind, product: c.product && c.product.brand, brand: c.brand, price: c.price, checkedAt: c.checkedAt, link: c.link, src: c.attrSource }; });
  ok(cnd && cnd.photo === 'confirmed' && cnd.product === '브랜드' && cnd.brand === '브랜드' && cnd.price === 89000 && cnd.checkedAt && cnd.link === 'https://shop.example/gray-sweat' && cnd.src === 'owner-confirmed', '후보에 입력한 상품명·브랜드·가격·링크와 확인된 상품 사진이 남는다', cnd);
  ok(await page.locator('#beforeForm').count() === 1 && await page.locator('#vCombos').count() === 0, '판정 전에는 결과가 보이지 않고 지금 마음을 먼저 묻는다');
  await page.locator('#beforeForm .choice', { hasText: '모르겠다' }).click();
  await page.fill('#beforeReason', '스웻셔츠가 이미 한 벌 있다');
  await page.click('#showVerdict');
  const v = await page.evaluate(() => window.__verdict);
  ok(v.added === 1 && v.overlaps.length === 0 && v.top3 === 1 && v.after - v.before === 1 && v.blockers.length === 3, '그레이 스웻셔츠 후보: 겹침 0, 새 조합 1개(생지 데님), 걸리는 점 3가지', v);
  ok((await page.locator('#vBlock').innerText()).includes('하의 3벌 중 1벌'), '걸리는 점에 걸린 옷의 수가 나온다');
  ok(await page.locator('#vDraft').count() === 0, '확인한 합성 옷만 계산한 결과에 초안 사용 표시가 없다');
  const priceTxt = await page.locator('main').innerText();
  ok(priceTxt.includes('89,000원') && priceTxt.includes('확인)'), '직접 넣은 가격과 확인 날짜가 보인다');
  ok(!/\d+\s?%/.test(priceTxt), '화면에 % 표시가 없다');
  ok(!(await overflow()), '판정 화면에 가로 넘침이 없다');
  await shot('2-verdict');
  await page.locator('#afterForm .choice', { hasText: /^산다$/ }).click();
  await page.locator('#afterForm .choice', { hasText: '도움이 됐다' }).click();
  await page.fill('#afterNote', '생지 데님과만 조합이 되는 줄 몰랐다');
  await page.click('#saveDecision');
  await page.waitForFunction(() => {
    const summary = document.querySelector('#decided'), followup = document.querySelector('#purchaseFollowup');
    if (!summary || !followup) return false;
    const s = summary.getBoundingClientRect(), f = followup.getBoundingClientRect();
    return s.top >= 112 && s.top < 210 && f.top >= 0 && f.bottom <= innerHeight;
  }, null, { timeout: 10000 });
  const surfacedFollowup = await page.evaluate(() => ({ scrollY: scrollY, summaryTop: document.querySelector('#decided').getBoundingClientRect().top, followupTop: document.querySelector('#purchaseFollowup').getBoundingClientRect().top, followupBottom: document.querySelector('#purchaseFollowup').getBoundingClientRect().bottom, viewport: innerHeight }));
  ok(surfacedFollowup.followupTop >= 0 && surfacedFollowup.followupBottom <= surfacedFollowup.viewport, '결정 저장 후 구매 결과 기록 패널이 한 화면 안으로 이동한다', surfacedFollowup);
  ok((await page.locator('#decided').innerText()).includes('결정: 산다') && (await page.locator('#decided').innerText()).includes('정해짐'), '결정이 기록되고 보기 전 마음과의 차이가 나온다');
  await shot('3-decided');
  await page.click('#openPurchaseFollowup');
  ok(await page.locator('#followupDialog').isVisible(), '구매 결과 입력은 후속 기록 대화상자에서 열린다');
  await page.selectOption('#followupOutcome', 'purchased');
  ok(await page.locator('#followupSizeResult').isVisible() && !(await page.locator('#followupReturnReason').isVisible()), '구매 결과를 고르면 착용 결과를 기록하고 반품 사유는 숨긴다');
  await page.selectOption('#followupSizeResult', 'small'); await page.selectOption('#followupOutcome', 'returned'); await page.selectOption('#followupReturnReason', 'fit'); await page.selectOption('#followupOutcome', 'not-purchased');
  await page.click('#saveFollowup'); await page.waitForFunction(() => !document.querySelector('#followupDialog')?.open && window.__app.state.decisions[0].followup.outcome === 'not-purchased');
  const clearedFollowup = await page.evaluate(() => window.__app.state.decisions[0].followup);
  ok(clearedFollowup.sizeResult === 'unknown' && clearedFollowup.returnReason === 'unknown', '사지 않음으로 바꾸면 숨겨 둔 사이즈·반품 값은 저장하지 않는다', clearedFollowup);
  await page.click('#openPurchaseFollowup'); await page.selectOption('#followupOutcome', 'purchased');
  await page.selectOption('#followupSizeResult', 'right'); await page.fill('#followupNote', '판매처에서 결제 완료'); await page.click('#saveFollowup');
  await page.waitForFunction(() => !document.querySelector('#followupDialog')?.open && window.__app.state.decisions[0].followup.outcome === 'purchased');
  await noOpenDialogs('구매 결과 저장 뒤 대화상자가 닫힌다');
  ok((await page.locator('#followupStatus').innerText()).includes('사이즈: 잘 맞았다'), '마지막 구매 결과에 실제 착용 사이즈가 보인다');
  await page.click('#moveOwnedAfterPurchase');
  await page.waitForFunction(() => document.querySelectorAll('#closetGrid .card').length === 14 && window.__app.state.items.find((i) => i.name === '그레이 스웻셔츠').status === 'owned');
  const moved = await page.evaluate(() => { const s = window.__app.state; const i = s.items.find((x) => x.name === '그레이 스웻셔츠'); return { n: document.querySelectorAll('#closetGrid .card').length, cand: s.items.filter((x) => x.status === 'candidate').length, status: i.status, photo: i.photo.kind, product: !!i.product }; });
  ok(moved.n === 14 && moved.cand === 0 && moved.status === 'owned' && moved.photo === 'confirmed' && moved.product, '산 옷이 보유로 옮겨져 옷장이 14벌이 되고 확인된 상품 정보는 유지된다', moved);

  // 4. 코디
  await page.click('#tabbtn-outfits');
  ok(await page.locator('#recGrid .outfit').count() === 3, '코디 3개가 나온다');
  ok(await page.locator('#recGrid .draftnote').count() === 0, '확인한 합성 옷만 코디에 사용한다');
  const before = await page.evaluate(() => window.__recs.map((c) => c.top + c.bottom + c.outer).join());
  await page.click('#moreRecs');
  const after = await page.evaluate(() => window.__recs.map((c) => c.top + c.bottom + c.outer).join());
  ok(before !== after && after.length > 0, '다른 추천 보기를 누르면 다른 조합이 나온다');
  await page.getByRole('button', { name: '여름' }).click();
  ok(await page.evaluate(() => window.__recs.length === 0) && await page.locator('#recGrid .outfit').count() === 0, '계절이 모르는 하의뿐이면 여름 조합을 확정하지 않는다');
  await page.evaluate(() => { window.__app.state.items = window.__app.state.items.map((item) => window.__app.W.cleanItem({ ...item, seasons: item.seasons.length ? item.seasons : window.__app.W.SEASONS.slice() }, 0)); });
  await page.getByRole('button', { name: '모든 계절', exact: true }).click(); await page.getByRole('button', { name: '여름', exact: true }).click();
  ok(await page.evaluate(() => window.__recs.length > 0 && window.__recs.every((c) => [c.top, c.bottom, c.outer].filter(Boolean).every((id) => window.__app.state.items.find((i) => i.id === id).seasons.includes('여름')))), '합성 옷의 빈 계절을 직접 확인한 뒤 여름 옷만 추천한다');
  await shot('4-outfits');

  // 5. 살 만한 옷: 상품을 직접 넣고, 목록 안에서만 순서를 매기고, 후보로 넣는다
  await page.click('#tabbtn-shop');
  await page.click('#shopOwn > summary');
  ok(await page.locator('#shopEmpty').count() === 1, '상품이 없으면 비어 있다고 알려 준다 (지어내지 않는다)');
  await page.click('#addProduct');
  await page.fill('#p-brand', '어느 브랜드'); await page.fill('#p-name', '네이비 크루넥 니트'); await page.selectOption('#p-cat', 'top'); await page.selectOption('#p-kind', 'knit'); await page.selectOption('#p-family', 'navy');
  await page.fill('#p-light', '20'); await page.selectOption('#p-formality', '2'); await page.selectOption('#p-pattern', 'solid');
  await page.fill('#p-price', '129000'); await page.fill('#p-checked', '2026-01-05'); await page.fill('#p-link', 'https://shop.example/knit'); await page.setInputFiles('#p-photo', pngFile('p.png'));
  await page.click('#pdSave'); await page.waitForFunction(() => !document.querySelector('#product').open);
  await page.click('#addProduct');
  await page.fill('#p-name', '네이비 그래픽 스웻'); await page.selectOption('#p-cat', 'top'); await page.selectOption('#p-kind', 'sweat'); await page.selectOption('#p-family', 'navy'); await page.selectOption('#p-pattern', 'graphic'); await page.fill('#p-price', '59000');
  await page.fill('#p-light', '20'); await page.selectOption('#p-formality', '1');
  await page.click('#pdSave'); await page.waitForFunction(() => !document.querySelector('#product').open);
  const shop = await page.evaluate(() => window.__shop);
  ok(shop.length === 2 && shop[0].gap === 't-knit-navy' && shop[0].stale === true && shop[1].stale === false && shop[0].score > shop[1].score, '두 상품이 목록 안에서만 순서가 매겨지고, 빈틈을 채우는 니트가 앞서며, 오래된 가격은 재확인 필요다', shop);
  const shopTxt = await page.locator('#shopList').innerText();
  ok(shopTxt.includes('129,000원') && shopTxt.includes('재확인 필요') && shopTxt.includes('자리를 채웁니다') && !/\d+\s?%/.test(shopTxt), '상품 화면에 적은 가격, 재확인 필요, 빈틈 이유가 보이고 확률 표현은 없다');
  await shot('5-shop');
  const [cdl] = await Promise.all([page.waitForEvent('download'), page.click('#catExportBtn')]);
  const cexp = path.join(shots, m.name + '-catalog.json'); await cdl.saveAs(cexp);
  const cdata = JSON.parse(fs.readFileSync(cexp, 'utf8'));
  ok(cdata.schema === 1 && cdata.kind === 'catalog' && cdata.products.length === 2, '상품 목록을 파일로 내보낸다');
  await page.setInputFiles('#catFile', asFile(cexp));
  await page.click('#catMerge');
  ok((await page.evaluate(() => window.__app.state.catalog.products.length)) === 2, '같은 상품 목록 파일을 다시 열어 더해도 겹치지 않는다');
  await page.locator('#shopList .prod').first().getByRole('button', { name: '후보로 넣어 판정' }).click();
  const fromShop = await page.evaluate(() => { const c = window.__app.state.items.find((i) => i.status === 'candidate'); return c && { name: c.name, photo: c.photo.kind, product: c.product && c.product.name, price: c.price, link: c.link, checkedAt: c.checkedAt }; });
  ok(fromShop && fromShop.name === '네이비 크루넥 니트' && fromShop.photo === 'confirmed' && fromShop.product === '네이비 크루넥 니트' && fromShop.price === 129000 && fromShop.link === 'https://shop.example/knit' && fromShop.checkedAt === '2026-01-05', '상품을 후보로 넣으면 살까 말까로 이어지고 가격·링크·확인일이 함께 간다', fromShop);
  ok(await page.locator('#beforeForm h2').innerText() === '네이비 크루넥 니트', '후보 화면이 열린다');

  // 6. 옷장 구경: 기본 옷장
  await page.click('#tabbtn-compare');
  const c1 = await page.evaluate(() => window.__cmp);
  ok(!c1.onlyTheirs.includes('t-sweat-gray') && c1.onlyTheirs.includes('t-knit-navy') && c1.both >= 10, '기본 옷장과 견주면 방금 산 그레이 스웻셔츠는 빠진 것에서 사라진다', c1);
  ok(!(await overflow()), '옷장 구경 화면에 가로 넘침이 없다');
  await shot('6-compare-template');
  await page.locator('#cmpMissing .card', { hasText: '네이비 크루넥 니트' }).getByRole('button', { name: '후보로 넣기' }).click();
  ok(await page.locator('#beforeForm h2').innerText() === '네이비 크루넥 니트', '빠진 옷을 후보로 넣으면 살까 말까로 이어진다');

  // 7. 기록, 내보내기, 다른 사람 옷장으로 열기
  await page.click('#tabbtn-log');
  ok((await page.locator('#gate').innerText()).includes('판정 기록 1건'), '판정 기록이 1건 쌓였다');
  ok((await page.locator('#photoStat').innerText()).includes('확인된 동일 제품 1벌') && (await page.locator('#photoStat').innerText()).includes('내 사진 1벌'), '사진 상태 요약이 맞다');
  await page.fill('#o-nick', '시험'); await page.locator('#o-nick').blur();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const exp = path.join(shots, m.name + '-export.json'); await dl.saveAs(exp);
  const data = JSON.parse(fs.readFileSync(exp, 'utf8'));
  const bought = data.items.find((i) => i.name === '그레이 스웻셔츠');
  ok(data.schema === 2 && data.items.length === 14 && data.items.every((i) => i.status === 'owned') && data.items.every((i) => i.price == null && !i.link) && data.owner.height == null && data.decisions.length === 0, '내보낸 파일(스키마 2)에는 보유 옷만 있고 가격, 체형, 판정 기록은 기본으로 빠진다');
  ok(bought.photo.kind === 'confirmed' && bought.photo.img === '' && bought.product.brand === '브랜드' && data.items[0].photo.img.startsWith('data:image') && data.items.every((i) => i.matchCandidates.length === 0), '남의 상품 사진과 브랜드 후보는 기본으로 빠지고, 내 사진과 확인된 상품 정보는 남는다');
  await shot('7-log');
  // 7b. 데스크톱 동기화 패널. 모바일 미리보기는 로컬 저장 안내만 제공한다.
  if (mobileBuild) {
    ok(await page.locator('#mobileStorageNote').count() === 1, '모바일 미리보기는 이 브라우저에 저장된다는 안내를 표시한다');
  } else {
  // 내 서버와 맞추기 (흉내 서버): 보내기 → 같은 내용 다시 보내기(멱등 키 같음) → 받기 → 바꾸기
  ok(await page.locator('#syncPanel').count() === 1, '동기화 설정은 기록 탭에서 바로 찾을 수 있다');
  await page.locator('#syncPanel').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  ok((await page.isChecked('#syncPhotos')) === false || (await page.inputValue('#syncBase')).includes('localhost'), '기본 주소는 이 컴퓨터(localhost)다');
  await page.fill('#syncBase', 'http://192.168.0.10:8099'); await page.locator('#syncBase').blur(); await page.waitForTimeout(100);
  ok((await page.isChecked('#syncPhotos')) === false, '이 컴퓨터가 아닌 주소면 사진은 기본으로 보내지 않는다');
  await page.fill('#syncBase', MOCK); await page.locator('#syncBase').blur(); await page.waitForTimeout(100);
  ok(await page.isChecked('#syncPhotos'), '이 컴퓨터(127.0.0.1) 주소면 사진을 기본으로 함께 보낸다');
  const localBeforeAuth = await st();
  const localBackupBeforeAuth = await page.evaluate(() => window.Beta.makeBackup(window.__app.state));
  ok(await page.isDisabled('#syncPush'), '미인증 상태에서는 서버 보내기를 사용할 수 없다');
  await page.fill('#syncUser', 'synthetic-qa'); await page.fill('#syncPassword', 'synthetic-regression-password'); await page.click('#syncLogin');
  await page.waitForSelector('#syncLogout');
  ok((await st()).items.length === 0 && srv.wardrobe === null, '모의 인증 후 빈 계정 옷장을 열고 기존 개인 옷장을 자동 전송하지 않는다');
  await page.setInputFiles('#backupFile', { name: 'synthetic-account-restore.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(localBackupBeforeAuth)) });
  await page.click('#backupRestoreConfirm'); await flush();
  await page.click('#syncPush'); await page.waitForFunction(() => /보냈습니다|닿지|답/.test((document.querySelector('#syncMsg') || {}).textContent || ''));
  const pushMsg = await page.locator('#syncMsg').innerText();
  const sw = srv.wardrobe;
  ok(pushMsg.includes('보냈습니다') && sw && sw.schema === 2 && sw.items.length === (await page.evaluate(() => window.__app.state.items.length)) && JSON.stringify(sw).includes('data:image') && srv.catalog && srv.catalog.products.length === 2, '서버로 보내기: 옷장 전체(후보·기록 포함)와 상품 목록을 보낸다', { pushMsg, n: sw && sw.items.length });
  await page.click('#syncPush'); await page.waitForFunction(() => /저장된 결과/.test((document.querySelector('#syncMsg') || {}).textContent || ''));
  ok(srv.keys.size === 2, '같은 내용을 다시 보내면 같은 멱등 키를 쓴다(옷장 1, 상품 1)', srv.keys.size);
  await page.click('#syncPull'); await page.waitForSelector('#pullWarn');
  await page.click('#pullGo');
  const pulled = await page.evaluate(() => ({ n: window.__app.state.items.length, name1: window.__app.state.items[1].name, own0: window.__app.state.items[0].photo.ownImg.slice(0, 10) }));
  ok(pulled.name1.endsWith('(서버)') && pulled.own0 === 'data:image' && pulled.n === sw.items.length, '서버에서 받기: 확인을 누르면 서버 내용으로 바뀌고 내 사진은 남는다', pulled);
  ok(syncReqs.filter((r) => !r.startsWith('OPTIONS') && !r.includes('/api/auth/')).join() === 'POST /api/wardrobe/import,POST /api/catalog/import,POST /api/wardrobe/import,POST /api/catalog/import,GET /api/wardrobe?photos=true,GET /api/catalog', '인증 외에는 누른 만큼만 자료 요청한다', syncReqs);
  await page.click('#syncLogout');
  ok((await st()).items.length === localBeforeAuth.items.length && (await st()).owner.nickname === localBeforeAuth.owner.nickname, '로그아웃하면 전송 전 개인 옷장으로 돌아온다');
  }
  await page.click('#tabbtn-compare');
  await page.setInputFiles('#otherFile', asFile(exp));
  await page.waitForFunction(() => window.__app.state.others.length === 1);
  const c2 = await page.evaluate(() => window.__cmp);
  ok(c2.both === 14 && c2.onlyTheirs.length === 0 && c2.onlyMine === 0, '내보낸 내 옷장을 다시 열면 모두 "둘 다 가진 것"이 된다', c2);
  ok((await page.locator('#cmpTour').innerText()).includes('세 해째 입는다') && (await page.locator('#cmpTour').innerText()).includes('확인된 동일 제품'), '다른 사람 옷장에서 장기 후기와 사진 상태가 보인다');
  await shot('8-compare-file');

  // 8. 나쁜 파일: 글자가 마크업으로 해석되지 않고, 위험한 주소가 버려지고, 확인 기록 없는 "확인됨"은 후보로 내려간다
  const bad = path.join(shots, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ schema: 2, owner: { nickname: '<img src=x onerror=alert(1)>' }, items: [{ id: 'b1', cat: 'top', kind: 'shirt', name: '<script>alert(2)</script><img src=x onerror=alert(3)>', family: 'white', light: 90, formality: 2, pattern: 'solid',
    photo: { kind: 'confirmed', img: 'javascript:alert(4)', sourceUrl: 'javascript:alert(5)', sourceName: '<b onmouseover=alert(7)>s</b>' }, product: { brand: 'B', name: 'N' }, matchCandidates: [{ brand: 'x', url: 'javascript:alert(8)' }], link: 'javascript:alert(5)', review: '<b onmouseover=alert(6)>x</b>' }] }));
  await page.setInputFiles('#otherFile', asFile(bad));
  await page.waitForFunction(() => window.__app.state.others.length === 2);
  await page.waitForTimeout(300);
  const inj = await page.evaluate(() => ({ imgs: Array.from(document.querySelectorAll('main img')).filter((i) => !i.src.startsWith('data:image/')).length, scripts: document.querySelectorAll('main script').length, b: document.querySelectorAll('main b[onmouseover]').length, item: window.__app.state.others[0].items[0] }));
  ok(dialogs.length === 0 && inj.imgs === 0 && inj.scripts === 0 && inj.b === 0 && inj.item.photo.img === '' && inj.item.photo.sourceUrl === '' && inj.item.link === '' && inj.item.photo.kind === 'candidate' && inj.item.product === null && inj.item.matchCandidates[0].url === '', '악의적인 옷장 파일의 글자와 주소가 실행되지 않고, 확인 기록 없는 확인됨은 후보로 내려간다', { dialogs: dialogs.length, photo: inj.item.photo.kind, link: inj.item.link });
  await page.setInputFiles('#otherFile', asFile(path.join(root, 'README.md'), 'text/markdown')).catch(() => {});
  await page.waitForTimeout(200);
  ok(await page.locator('#otherMsg').isVisible(), 'JSON이 아닌 파일은 읽지 못했다고 알려 준다');

  // 9. 3D 옷장: 걸린 5벌, 형태 고르기(색으로 만든 원단), 고르기·카드·내리기
  if (!process.env.NO3D) {
    await page.click('#tabbtn-closet3d');
    await page.waitForFunction(() => window.__closet && Object.keys(window.__closet.things).length >= 5 && !window.__closet.busy, null, { timeout: 180000 }).catch(() => logs.push('3d timeout'));
    ok(await page.evaluate(() => Object.keys(window.__closet.things).length) === 5, '3D 옷장에 형태가 있는 5벌이 걸린다');
    ok((await page.locator('#rackPanel').innerText()).includes('3D 형태 없음') && (await page.locator('#rackPanel .row').count()) >= 14, '걸 옷 목록에 형태 없는 옷이 표시된다');
    await page.locator('#rackPanel .row', { hasText: '네이비 스웻셔츠' }).getByRole('button', { name: '형태 고르기' }).click();
    ok((await page.locator('#lk-kind').inputValue()) === 'sweat', '스웻셔츠는 형태 고르기에서 스웻셔츠 형태가 먼저 골라져 있다');
    await page.click('#lk-save');
    await page.locator('#rackPanel .row', { hasText: '네이비 스웻셔츠' }).getByRole('button', { name: '걸기' }).click();
    await page.waitForFunction(() => Object.keys(window.__closet.things).length >= 6 && !window.__closet.busy, null, { timeout: 180000 }).catch(() => logs.push('3d timeout 2'));
    const r5 = await page.evaluate(() => ({ things: Object.keys(window.__closet.things).length, rack: window.__app.state.rack.length, look: window.__app.state.items.find((i) => i.id === 's-sweat-navy').look3d }));
    ok(r5.things === 6 && r5.rack === 6 && r5.look && r5.look.kind === 'sweat' && r5.look.fabric === '', '형태를 고르면(색으로 만든 원단) 옷장에 걸린다', r5);
    await page.evaluate(() => window.__closet.rest());
    await shot('9-closet3d', { fullPage: false });
    await page.locator('#stageChips button').first().click();
    await page.waitForTimeout(1500);
    const cardTxt = await page.locator('#stageCard').innerText();
    ok(!(await page.locator('#stageCard').isHidden()) && cardTxt.includes('특정 상품을 재현한 것이 아닙니다') && cardTxt.includes('원단'), '옷을 고르면 카드에 실제 정보와 "상품 재현 아님" 안내가 보인다');
    await page.locator('#stageCard').getByRole('button', { name: '옷장에 다시 걸기' }).click();
    await page.waitForTimeout(800);
    ok(await page.locator('#stageCard').isHidden(), '다시 걸면 카드가 닫힌다');
    await page.locator('#rackPanel .row', { hasText: '네이비 스웻셔츠' }).getByRole('button', { name: '내리기' }).click();
    await page.waitForTimeout(500);
    ok((await page.evaluate(() => ({ t: Object.keys(window.__closet.things).length, r: window.__app.state.rack.length }))).t === 5, '내리면 옷장에서 사라진다');
    ok(!(await overflow()), '3D 화면에 가로 넘침이 없다');
    await page.click('#tabbtn-closet');
  }

  // 구매 뒤에 반환한 결과도 기록 화면에서 남기고 옷장에서 내린다
  await page.click('#tabbtn-log');
  if (m.w === 390) {
    const pinned = await page.evaluate(() => { const sc = document.querySelector('#gate .scroll'); sc.scrollLeft = sc.scrollWidth; const cell = sc.querySelector('tbody td:first-child'), r = cell.getBoundingClientRect(), s = sc.getBoundingClientRect(); return { left: r.left, right: r.right, containerLeft: s.left, containerRight: s.right, position: getComputedStyle(cell).position }; });
    ok(pinned.position === 'sticky' && pinned.left >= pinned.containerLeft && pinned.right <= pinned.containerRight, '휴대폰에서 옆으로 움직여도 구매 결과 수정 버튼이 보인다', pinned);
  }
  await page.getByRole('button', { name: '구매·반품 기록 수정' }).first().click();
  await page.selectOption('#followupOutcome', 'returned'); await page.selectOption('#followupSizeResult', 'small'); await page.selectOption('#followupReturnReason', 'fit');
  await page.fill('#followupNote', '입어 보니 어깨가 맞지 않아 반품'); await page.click('#saveFollowup');
  await page.waitForFunction(() => !document.querySelector('#followupDialog')?.open && window.__app.state.decisions[0].followup.outcome === 'returned');
  const returned = await page.evaluate(() => ({ status: window.__app.state.items.find((i) => i.name === '그레이 스웻셔츠').status,
    outcome: window.__app.state.decisions.find((d) => d.name === '그레이 스웻셔츠').followup.outcome,
    sizeResult: window.__app.state.decisions.find((d) => d.name === '그레이 스웻셔츠').followup.sizeResult,
    returnReason: window.__app.state.decisions.find((d) => d.name === '그레이 스웻셔츠').followup.returnReason,
    label: document.querySelector('#gate').innerText.includes('구매 후 반품했다') }));
  ok(returned.status === 'gone' && returned.outcome === 'returned' && returned.sizeResult === 'small' && returned.returnReason === 'fit' && returned.label, '반품 결과와 사이즈·반품 이유를 함께 남기고 옷장에서는 내린다', returned);

  // 10. 다시 열어도 남아 있다
  await flush();
  await page.reload(); await page.waitForFunction(() => window.__app);
  const st2 = await page.evaluate(() => ({ owned: window.__app.state.items.filter((i) => i.status === 'owned').length, cand: window.__app.state.items.filter((i) => i.status === 'candidate').length, gone: window.__app.state.items.filter((i) => i.status === 'gone').length, outcome: window.__app.state.decisions[0].followup.outcome, dec: window.__app.state.decisions.length, others: window.__app.state.others.length, brand: window.__app.state.items[0].brand, products: window.__app.state.catalog.products.length, rack: window.__app.state.rack.length, from: window.__app.state.loadedFrom }));
  ok(st2.owned === 13 && st2.cand === 2 && st2.gone === 1 && st2.outcome === 'returned' && st2.dec === 1 && st2.others === 2 && st2.brand === 'Brand A' && st2.products === 2 && st2.rack === 5 && st2.from === 'idb', '다시 열어도 구매·반품 결과, 옷장, 판정 기록, 상품 목록과 걸린 옷이 남아 있다', st2);
  ok(reqs.length === 0, '외부로 나간 요청이 없다', reqs);
  ok(logs.length === 0, '콘솔 오류와 경고가 없다', logs);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(shots, 'regression-result.json'), JSON.stringify({ total: results.length, passed: results.filter(r => r.pass).length, failed, actualUserUsageRecorded: false, mockServerOnly: true, results }, null, 2) + '\n');
console.log(failed ? failed + '건 실패' : '모두 통과');
process.exit(failed ? 1 : 0);
