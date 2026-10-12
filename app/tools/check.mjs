// dist/index.html을 헤드리스 브라우저로 열어 핵심 흐름을 끝까지 실행하고 화면을 찍는다. 개발 확인용.
// 기대값은 data/sample-wardrobe.json(예시 옷장 13벌)에 맞춰져 있다. 다른 옷장 자료로 빌드한 파일에는 그대로 쓸 수 없다.
// 사용: node tools/check.mjs            환경 변수: PAGE(다른 파일), NO3D=1(3D 탭 건너뛰기), QUICK=1(밝은 화면만)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'shots'); fs.mkdirSync(shots, { recursive: true });
const file = pathToFileURL(path.join(root, process.env.PAGE || 'dist/index.html')).href;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const ok = (cond, label, extra) => { if (!cond) failed++; console.log((cond ? '  ok   ' : '  FAIL ') + label + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); };
// 경로에 한글·공백이 있으면 Chromium 파일 선택이 조용히 실패해서, 파일 내용을 버퍼로 넘긴다
const asFile = (f, mimeType = 'application/json') => ({ name: path.basename(f), mimeType, buffer: fs.readFileSync(f) });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR4nGP4z8DwHwYZAB5pA/1Oxp5HAAAAAElFTkSuQmCC', 'base64');   // 2×2 png
const pngFile = (name) => ({ name, mimeType: 'image/png', buffer: PNG });
const v1fixture = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/wardrobe-v1.json'), 'utf8'));
const modes = process.env.QUICK ? [{ name: 'desk-light', w: 1280, h: 900, scheme: 'light' }] : [{ name: 'desk-light', w: 1280, h: 900, scheme: 'light' }, { name: 'phone-dark', w: 390, h: 844, scheme: 'dark' }];
for (const m of modes) {
  console.log(m.name);
  const ctx = await browser.newContext({ viewport: { width: m.w, height: m.h }, colorScheme: m.scheme, acceptDownloads: true });
  const page = await ctx.newPage();
  const logs = [], reqs = [], dialogs = [];
  page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') logs.push(msg.text().slice(0, 200)); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) reqs.push(r.url()); });
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const shot = (n, opts) => page.screenshot(Object.assign({ path: path.join(shots, m.name + '-' + n + '.png'), fullPage: true, timeout: 120000 }, opts || {}));
  const st = () => page.evaluate(() => window.__app.state);
  const flush = () => page.evaluate(() => window.__app.flush());

  // 0. v0.3 저장소(스키마 1)에서 옮겨 온다: v1 키를 미리 넣어 두고 연다
  const v1state = Object.assign({}, v1fixture, { others: [] });
  v1state.items[0] = Object.assign({}, v1state.items[0], { brand: 'Brand A', confirmed: true, img: 'data:image/png;base64,' + PNG.toString('base64') });
  await ctx.addInitScript((s) => { try { if (!localStorage.getItem('otjang.v2') && !localStorage.getItem('__migrated')) { localStorage.setItem('otjang.v1', JSON.stringify(s)); localStorage.setItem('__migrated', '1'); } } catch (e) { /* 무시 */ } }, v1state);
  await page.goto(file);
  await page.waitForFunction(() => window.__app);
  const mig = await page.evaluate(() => { const s = window.__app.state; return { from: s.loadedFrom, n: s.items.length, src0: s.items[0].attrSource, src1: s.items[1].attrSource, photo0: s.items[0].photo.kind, own0: s.items[0].photo.ownImg.slice(0, 15), brand0: s.items[0].brand, v1kept: !!localStorage.getItem('otjang.v1'), rack: s.rack.length, mode: window.__app.store.mode }; });
  ok(mig.from === 'ls1' && mig.n === 13 && mig.src0 === 'owner-confirmed' && mig.src1 === 'photo-draft' && mig.photo0 === 'own' && mig.own0.startsWith('data:image/png') && mig.brand0 === 'Brand A' && mig.v1kept, 'v0.3 저장소(스키마 1)를 읽어 스키마 2로 옮기고, 예전 저장소는 그대로 둔다', mig);
  ok(mig.mode === 'idb', '저장은 IndexedDB를 쓴다', mig.mode);
  ok(mig.rack === 0, 'v0.3 자료에는 3D 형태 정보가 없어 처음에는 걸린 옷이 없다', mig.rack);
  await flush();
  // 다시 열면 IndexedDB에서 읽는다 (v1 키가 있어도)
  await page.reload(); await page.waitForFunction(() => window.__app);
  ok((await page.evaluate(() => window.__app.state.loadedFrom)) === 'idb', '다시 열면 IndexedDB에 저장된 상태를 읽는다');
  // 이제부터는 예시 자료(스키마 2, 3D 형태 5벌, 브랜드 후보 2벌)로 시험한다
  await page.evaluate(async () => { await window.__app.store; });
  await page.click('#tabbtn-log'); await page.click('#resetBtn'); await page.click('#resetBtn'); await flush();
  await page.click('#tabbtn-closet');
  const base = await page.evaluate(() => ({ n: window.__app.state.items.length, rack: window.__app.state.rack.length, drafts: window.__app.state.items.filter((i) => i.attrSource === 'photo-draft').length, cands: window.__app.state.items.filter((i) => i.matchCandidates.length).length }));
  ok(base.n === 13 && base.rack === 5 && base.drafts === 13 && base.cands === 2, '처음 상태: 13벌 모두 초안, 3D 형태 5벌이 걸려 있고, 미확인 브랜드 후보 2벌', base);

  // 1. 옷장: 배지, 기록 편집, 확인하기(모르는 것만 묻기)
  ok(await page.locator('#closetGrid .card').count() === 13, '옷장에 13벌이 보인다');
  ok(await page.locator('#closetGrid .badge.draft', { hasText: '사진에서 뽑은 초안' }).count() === 13 && await page.locator('#closetGrid .badge', { hasText: '브랜드 후보 1' }).count() === 2, '초안 배지 13개와 브랜드 후보 배지 2개가 보인다');
  ok(!(await overflow()), '옷장 화면에 가로 넘침이 없다');
  await shot('1-closet');
  await page.locator('#closetGrid .card').first().getByRole('button', { name: '기록' }).click();
  await page.fill('#f-brand', 'Brand A'); await page.fill('#f-size', '38'); await page.fill('#f-year', '2022');
  await page.fill('#f-review', '세 해째 입는다. 소매 시보리가 조금 늘었다.'); await page.selectOption('#f-rebuy', 'yes'); await page.check('#f-confirmed');
  await page.setInputFiles('#f-photo', pngFile('my.png'));
  if (m.name === 'desk-light') await page.screenshot({ path: path.join(shots, m.name + '-1b-editor.png') });
  await page.click('#edSave'); await page.waitForFunction(() => !document.querySelector('#editor').open);
  const first = await page.locator('#closetGrid .card').first().innerText();
  const it0 = await page.evaluate(() => { const i = window.__app.state.items[0]; return { src: i.attrSource, photo: i.photo.kind, own: i.photo.ownImg.slice(0, 15) }; });
  ok(first.includes('Brand A') && first.includes('사이즈 38') && first.includes('년째') && first.includes('다시 산다') && !first.includes('초안') && it0.src === 'owner-confirmed' && it0.photo === 'own' && it0.own.startsWith('data:image'), '기록을 저장하면 카드에 보이고, 확인 체크로 초안 표시가 사라지며, 내 사진이 들어간다', it0);
  // 확인하기: 초안 옷에 모르는 것만 묻는다 (속성 + 브랜드)
  await page.locator('#closetGrid .card', { hasText: '올리브 필드 재킷' }).getByRole('button', { name: '확인하기' }).click();
  ok(await page.locator('#wzSteps .step').count() === 2 && (await page.locator('#wzSteps').innerText()).includes('색과 느낌'), '초안 옷의 확인하기는 이름을 다시 묻지 않고 색과 상품만 묻는다');
  await page.check('#z-confirmed'); await page.click('#wzNext');
  await page.fill('#z-brand', '브랜드 C'); await page.locator('#wizard .inl button', { hasText: '모름' }).nth(1).click();
  await page.click('#wzNext'); await page.waitForFunction(() => !document.querySelector('#wizard').open);
  const fj = await page.evaluate(() => { const i = window.__app.state.items.find((x) => x.id === 's-field-olive'); return { src: i.attrSource, brand: i.brand, model: i.model, photo: i.photo.kind, product: i.product, look: i.look3d }; });
  ok(fj.src === 'owner-confirmed' && fj.brand === '브랜드 C' && fj.model === '' && fj.photo === 'none' && fj.product === null && fj.look && fj.look.kind === 'field', '확인하기로 속성 확인과 브랜드가 저장되고, 모름은 비워 두며, 3D 형태는 그대로다', fj);

  // 2. 상품 사진과 확인: 대체 이미지 → 후보 → 확인 → 취소 → 떼기. 브랜드·가격은 내 옷 정보에 섞이지 않는다
  await page.locator('#closetGrid .card', { hasText: '네이비 블레이저' }).getByRole('button', { name: '상품 사진' }).click();
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

  // 3. 살까 말까: 마법사로 후보 추가 → 판정(확인 전 속성 표시) → 결정 → 보유로
  await page.click('#tabbtn-judge');
  await page.click('#addCand');
  ok(await page.locator('#wzSteps .step').count() === 3, '후보 추가는 세 단계를 묻는다');
  await page.selectOption('#z-cat', 'top'); await page.selectOption('#z-kind', 'sweat'); await page.fill('#z-name', '그레이 스웻셔츠'); await page.click('#wzNext');
  await page.selectOption('#z-family', 'gray'); await page.selectOption('#z-formality', '1'); await page.click('#wzNext');
  await page.fill('#z-brand', '브랜드'); await page.fill('#z-price', '89000'); await page.setInputFiles('#z-prodPhoto', pngFile('prod.png'));
  await page.click('#wzNext'); await page.waitForSelector('#wzErr:not([hidden])');
  ok(await page.locator('#wzErr').isVisible() && (await page.locator('#wzErr').innerText()).includes('상태를 골라'), '상품 사진을 넣고 상태를 고르지 않으면 저장하지 않는다');
  await page.locator('#z-photoKind .choice', { hasText: '같은 상품임을 확인' }).click();
  await page.click('#wzNext'); await page.waitForFunction(() => !document.querySelector('#wizard').open);
  const cnd = await page.evaluate(() => { const c = window.__app.state.items.find((i) => i.status === 'candidate'); return c && { photo: c.photo.kind, product: c.product && c.product.brand, price: c.price, checkedAt: c.checkedAt, src: c.attrSource }; });
  ok(cnd && cnd.photo === 'confirmed' && cnd.product === '브랜드' && cnd.price === 89000 && cnd.checkedAt && cnd.src === 'owner', '후보가 확인된 상품 사진과 가격·확인일을 가지고 들어간다', cnd);
  ok(await page.locator('#beforeForm').count() === 1 && await page.locator('#vCombos').count() === 0, '판정 전에는 결과가 보이지 않고 지금 마음을 먼저 묻는다');
  await page.locator('#beforeForm .choice', { hasText: '모르겠다' }).click();
  await page.fill('#beforeReason', '스웻셔츠가 이미 한 벌 있다');
  await page.click('#showVerdict');
  const v = await page.evaluate(() => window.__verdict);
  ok(v.added === 1 && v.overlaps.length === 0 && v.top3 === 1 && v.after - v.before === 1 && v.blockers.length === 3, '그레이 스웻셔츠 후보: 겹침 0, 새 조합 1개(생지 데님), 걸리는 점 3가지', v);
  ok((await page.locator('#vBlock').innerText()).includes('하의 3벌 중 1벌'), '걸리는 점에 걸린 옷의 수가 나온다');
  ok(await page.locator('#vDraft').count() === 1 && (await page.locator('#vDraft').innerText()).includes('확인 전 속성 포함'), '판정에 쓰인 초안 옷을 알려 준다 (점수는 그대로)');
  const priceTxt = await page.locator('main').innerText();
  ok(priceTxt.includes('89,000원') && priceTxt.includes('확인)'), '직접 넣은 가격과 확인 날짜가 보인다');
  ok(!/\d+\s?%/.test(priceTxt), '화면에 % 표시가 없다');
  ok(!(await overflow()), '판정 화면에 가로 넘침이 없다');
  await shot('2-verdict');
  await page.locator('#afterForm .choice', { hasText: /^산다$/ }).click();
  await page.locator('#afterForm .choice', { hasText: '도움이 됐다' }).click();
  await page.fill('#afterNote', '생지 데님과만 조합이 되는 줄 몰랐다');
  await page.click('#saveDecision');
  ok((await page.locator('#decided').innerText()).includes('결정: 산다') && (await page.locator('#decided').innerText()).includes('정해짐'), '결정이 기록되고 보기 전 마음과의 차이가 나온다');
  await shot('3-decided');
  await page.click('#moveOwned');
  const moved = await page.evaluate(() => { const s = window.__app.state; const i = s.items.find((x) => x.name === '그레이 스웻셔츠'); return { n: document.querySelectorAll('#closetGrid .card').length, cand: s.items.filter((x) => x.status === 'candidate').length, status: i.status, photo: i.photo.kind, product: !!i.product }; });
  ok(moved.n === 14 && moved.cand === 0 && moved.status === 'owned' && moved.photo === 'confirmed' && moved.product, '산 옷이 보유로 옮겨져 옷장이 14벌이 되고 확인된 상품 정보는 유지된다', moved);

  // 4. 코디
  await page.click('#tabbtn-outfits');
  ok(await page.locator('#recGrid .outfit').count() === 3, '코디 3개가 나온다');
  ok(await page.locator('#recGrid .draftnote').count() >= 1, '초안 옷이 쓰인 조합에는 확인 전 속성 표시가 붙는다');
  const before = await page.evaluate(() => window.__recs.map((c) => c.top + c.bottom + c.outer).join());
  await page.click('#moreRecs');
  const after = await page.evaluate(() => window.__recs.map((c) => c.top + c.bottom + c.outer).join());
  ok(before !== after && after.length > 0, '다른 추천 보기를 누르면 다른 조합이 나온다');
  await page.getByRole('button', { name: '여름' }).click();
  ok(await page.evaluate(() => window.__recs.length > 0 && window.__recs.every((c) => [c.top, c.bottom, c.outer].filter(Boolean).every((id) => { const s = window.__app.state.items.find((i) => i.id === id).seasons; return !s.length || s.includes('여름'); }))), '계절을 고르면 그 계절의 옷만 쓴다 (계절을 비운 옷은 사계절로 본다)');
  await shot('4-outfits');

  // 5. 살 만한 옷: 상품을 직접 넣고, 목록 안에서만 순서를 매기고, 후보로 넣는다
  await page.click('#tabbtn-shop');
  ok(await page.locator('#shopEmpty').count() === 1, '상품이 없으면 비어 있다고 알려 준다 (지어내지 않는다)');
  await page.click('#addProduct');
  await page.fill('#p-brand', '어느 브랜드'); await page.fill('#p-name', '네이비 크루넥 니트'); await page.selectOption('#p-cat', 'top'); await page.selectOption('#p-kind', 'knit'); await page.selectOption('#p-family', 'navy');
  await page.fill('#p-price', '129000'); await page.fill('#p-checked', '2026-01-05'); await page.fill('#p-link', 'https://shop.example/knit'); await page.setInputFiles('#p-photo', pngFile('p.png'));
  await page.click('#pdSave'); await page.waitForFunction(() => !document.querySelector('#product').open);
  await page.click('#addProduct');
  await page.fill('#p-name', '네이비 그래픽 스웻'); await page.selectOption('#p-cat', 'top'); await page.selectOption('#p-kind', 'sweat'); await page.selectOption('#p-family', 'navy'); await page.selectOption('#p-pattern', 'graphic'); await page.fill('#p-price', '59000');
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
    await page.selectOption('#lk-kind', 'shirt'); await page.click('#lk-save');
    await page.locator('#rackPanel .row', { hasText: '네이비 스웻셔츠' }).getByRole('button', { name: '걸기' }).click();
    await page.waitForFunction(() => Object.keys(window.__closet.things).length >= 6 && !window.__closet.busy, null, { timeout: 180000 }).catch(() => logs.push('3d timeout 2'));
    const r5 = await page.evaluate(() => ({ things: Object.keys(window.__closet.things).length, rack: window.__app.state.rack.length, look: window.__app.state.items.find((i) => i.id === 's-sweat-navy').look3d }));
    ok(r5.things === 6 && r5.rack === 6 && r5.look && r5.look.kind === 'shirt' && r5.look.fabric === '', '형태를 고르면(색으로 만든 원단) 옷장에 걸린다', r5);
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

  // 10. 다시 열어도 남아 있다
  await flush();
  await page.reload(); await page.waitForFunction(() => window.__app);
  const st2 = await page.evaluate(() => ({ owned: window.__app.state.items.filter((i) => i.status === 'owned').length, cand: window.__app.state.items.filter((i) => i.status === 'candidate').length, dec: window.__app.state.decisions.length, others: window.__app.state.others.length, brand: window.__app.state.items[0].brand, products: window.__app.state.catalog.products.length, rack: window.__app.state.rack.length, from: window.__app.state.loadedFrom }));
  ok(st2.owned === 14 && st2.cand === 2 && st2.dec === 1 && st2.others === 2 && st2.brand === 'Brand A' && st2.products === 2 && st2.rack === 5 && st2.from === 'idb', '다시 열어도 옷장, 후보, 판정 기록, 상품 목록, 걸린 옷이 남아 있다', st2);
  ok(reqs.length === 0, '외부로 나간 요청이 없다', reqs);
  ok(logs.length === 0, '콘솔 오류와 경고가 없다', logs);
  await ctx.close();
}
await browser.close();
console.log(failed ? failed + '건 실패' : '모두 통과');
process.exit(failed ? 1 : 0);
