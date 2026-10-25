// 시안 하나를 실제 웹앱 과업 그대로 눌러 보고 숫자와 화면을 남긴다(모바일 390×844, PC 1280×800).
// 과업: 빈 옷장 검색 → 상품 상세(#/p/…) → (선택) 옷 추가 후 같은 상품 복귀 → 후보 둘 비교 → 보류 기록 → 뒤로가기(결과 위치 복원).
// 시안은 data-flow 표시(README의 "흐름 표시")를 달아야 한다. 상품 사진 서버(image.msscdn.net) 말고는 외부 요청을 모두 막고 기록한다.
// 사용: node app/mockups/ux10v2/tools/flowcheck.mjs <시안.html> [--out 폴더] [--json] [--offline]
//   --offline: 사진 서버도 막는다(사진을 못 불러올 때 색 카드로 바뀌는지 확인).
// 필요: Playwright와 Chromium. PLAYWRIGHT_MODULE, CHROMIUM_PATH 환경 변수로 위치를 바꿀 수 있다.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && /\.html?$/.test(a));
if (!file) throw new Error('시안 HTML 경로를 적어 주세요.');
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const offline = args.includes('--offline');
const outDir = path.resolve(opt('--out', path.join(path.dirname(file), '.flowcheck', path.basename(file, '.html'))));
fs.mkdirSync(outDir, { recursive: true });

let playwright;
try { playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { playwright = await import('/opt/node-tools/node_modules/playwright/index.mjs'); }
const { chromium } = playwright;
const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const base = pathToFileURL(path.resolve(file)).href;
const QUERY = '출근용 셔츠 10만원 이하';
const PHOTO_HOST = /^https:\/\/image\.msscdn\.net\//;
const report = { file: path.basename(file), offline, mobile: {}, pc: {}, a11y: {}, photos: {}, problems: [], shots: [] };
const problem = (text) => { report.problems.push(text); };

async function newPage(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [], external = [], photoRequests = [], consoleErrors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) consoleErrors.push(m.text()); });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (/^(file|data|blob|about):/.test(u)) return route.continue();
    if (PHOTO_HOST.test(u)) { photoRequests.push(u); return offline ? route.abort() : route.continue(); }
    external.push(u);
    return route.abort();
  });
  await ctx.addInitScript(() => { window.open = () => null; }); // 판매처 링크는 검사 중 열지 않는다.
  return { ctx, page, errors, external, photoRequests, consoleErrors };
}
const visible = (page, sel) => page.locator(`${sel}:visible`);
async function has(page, sel, timeout = 0) {
  const loc = visible(page, sel).first();
  if (timeout) { try { await loc.waitFor({ state: 'visible', timeout }); } catch { return false; } }
  return (await loc.count()) > 0;
}
async function tap(page, sel, counter) {
  const loc = visible(page, sel).first();
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.click({ timeout: 4000 });
  counter.n++;
  await page.waitForTimeout(400);
}
async function shot(page, name, full = false) {
  const p = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: p, fullPage: full });
  report.shots.push(path.relative(process.cwd(), p));
}
const state = (page) => page.evaluate(() => window.EoulMock?.getState());
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const waitPhotos = (page) => page.waitForFunction(() => [...document.querySelectorAll('.eo-ph img')].filter((i) => i.getBoundingClientRect().top < innerHeight && i.getBoundingClientRect().bottom > 0).every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
async function verdictText(page) {
  const loc = visible(page, '[data-flow="verdict"]').first();
  return (await loc.count()) ? (await loc.innerText()).replace(/\s+/g, ' ').trim() : null;
}
async function ask(page, text, counter) {
  if (!(await visible(page, '[data-flow="ask-input"]').count()) && await has(page, '[data-flow="nav-ask"]')) await tap(page, '[data-flow="nav-ask"]', counter);
  await page.evaluate(() => window.scrollTo(0, 0)); // 고정 머리글 밑에 입력칸이 가리지 않게 맨 위에서 누른다.
  const box = visible(page, '[data-flow="ask-input"]').first();
  await box.scrollIntoViewIfNeeded().catch(() => {});
  await box.click({ timeout: 5000 });
  await box.fill(text);
  counter.n++;
  if (await has(page, '[data-flow="ask-submit"]')) await tap(page, '[data-flow="ask-submit"]', counter);
  else { await box.press('Enter'); counter.n++; await page.waitForTimeout(400); }
  for (let i = 0; i < 4; i++) { // 단계형 시안: 결과가 나올 때까지 "다음"(최대 4번)
    if (await has(page, '[data-flow="result"], [data-flow="pdp"]', 1500)) break;
    if (await has(page, '[data-flow="next"]')) await tap(page, '[data-flow="next"]', counter);
  }
}
// 지금 화면(첫 화면 높이 안)의 밀도·사진·안내문
async function screenStats(page) {
  return page.evaluate(() => {
    const H = innerHeight, W = innerWidth;
    const inView = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && s.visibility !== 'hidden' && s.display !== 'none'; };
    const results = [...document.querySelectorAll('[data-flow="result"]')].filter(inView);
    const full = results.filter((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= H; });
    const withPhoto = results.filter((el) => el.querySelector('.eo-ph img'));
    const lefts = [...new Set(results.map((el) => Math.round(el.getBoundingClientRect().left / 8)))];
    const photos = [...document.querySelectorAll('.eo-ph img')].filter(inView);
    const loaded = photos.filter((i) => i.complete && i.naturalWidth > 0);
    const firstPhoto = withPhoto[0]?.querySelector('.eo-ph')?.getBoundingClientRect();
    const tiles = [...document.querySelectorAll('.eo-tile')].filter(inView).length;
    const similar = [...document.querySelectorAll('[data-photo="similar"]')].filter(inView).length;
    const broken = [...document.querySelectorAll('img')].filter((i) => inView(i) && i.complete && i.naturalWidth === 0).length;
    const drawings = [...document.querySelectorAll('svg')].filter((s) => inView(s) && s.getBoundingClientRect().width >= 56 && s.getBoundingClientRect().height >= 56).length;
    // 안내문: 고지성 낱말이 들어간 문장(보이는 글 노드 기준)
    const texts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const n = walker.currentNode; const t = n.textContent.trim(); if (t && n.parentElement && inView(n.parentElement)) texts.push(t); }
    const notice = texts.filter((t) => /목업|AI|권리|확인하지 않|확인 안 함|직접 남긴|규칙으로|현재가|최저가|보장하지|실제와 다를|참고용|시험용/.test(t));
    const textChars = texts.join('').length;
    return {
      resultsInView: results.length, resultsFullyInView: full.length, resultColumns: lefts.length,
      resultsWithPhoto: withPhoto.length, photosInView: photos.length, photosLoaded: loaded.length,
      firstPhotoRatio: firstPhoto ? +(firstPhoto.width / firstPhoto.height).toFixed(2) : null, firstPhotoWidthShare: firstPhoto ? +(firstPhoto.width / W).toFixed(2) : null,
      tilesInView: tiles, similarInView: similar, drawingsInView: drawings, brokenImages: broken,
      noticeLines: notice.length, noticeSamples: notice.slice(0, 4).map((t) => t.slice(0, 40)), textChars,
    };
  });
}

// ── 모바일
{
  const { ctx, page, errors, external, photoRequests, consoleErrors } = await newPage({ width: 390, height: 844 }, true);
  const m = report.mobile;
  const c = { n: 0 };
  await page.goto(`${base}?reset=1`);
  await page.waitForTimeout(800);
  await shot(page, 'm1-first');
  m.home = await screenStats(page);
  const inputBox = await visible(page, '[data-flow="ask-input"]').first().boundingBox().catch(() => null);
  m.askOnFirstScreen = !!inputBox && inputBox.y + inputBox.height <= 844;
  // 시안 표시: 짧고, 누르면 고지 한 곳이 열린다.
  const label = visible(page, '[data-flow="mock-label"]').first();
  m.mockLabel = (await label.count()) ? (await label.innerText()).replace(/\s+/g, ' ').trim() : null;
  if (!m.mockLabel) problem('시안 표시(data-flow="mock-label")가 첫 화면에 없어요.');
  else {
    if (m.mockLabel.length > 16) problem(`시안 표시가 길어요(${m.mockLabel.length}자): ${m.mockLabel}`);
    await label.click().catch(() => {});
    await page.waitForTimeout(300);
    m.disclosureOpens = await page.evaluate(() => !!document.querySelector('#eo-disclosure[open]'));
    if (!m.disclosureOpens) problem('시안 표시를 눌러도 고지(EoulMock.openDisclosure)가 열리지 않아요.');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  // 과업(Codex·대표 지정): 빈 옷장 검색 → 실제 상품 상세 → (선택) 옷 추가 후 같은 상품 복귀 → 후보 둘 비교 → 보류 기록 → 뒤로가기
  // 탭 수와 함께 조건 위반·가격/상태 오해·복귀 오류를 본다.
  const violations = async () => page.evaluate(() => {
    const M = window.EoulMock;
    const ids = [...new Set([...document.querySelectorAll('[data-flow="result"][data-product-id], [data-flow="compare-item"][data-product-id]')].filter((el) => el.getBoundingClientRect().height > 0).map((el) => el.dataset.productId))];
    return ids.map((id) => M.product(id, { criteria: null })).filter((p) => p && (p.price > 100000 || p.kind !== 'shirt')).map((p) => `${p.name} ${p.priceText} ${p.kindName}`);
  });
  try {
    await ask(page, QUERY, c);
    m.actionsToResults = c.n;
    await waitPhotos(page);
    m.results = await screenStats(page);
    m.resultsHash = await page.evaluate(() => location.hash);
    if (!m.resultsHash.startsWith('#/search')) problem(`검색 결과 주소가 #/search?q=… 형식이 아니에요(${m.resultsHash || '없음'}).`);
    m.scope = await page.evaluate(() => [...document.querySelectorAll('[data-flow="condition-remove"]')].filter((el) => el.getBoundingClientRect().height > 0).map((el) => el.dataset.key));
    await shot(page, 'm2-results');
    if (!m.results.resultsInView) problem('검색 결과(data-flow="result")가 첫 화면에 없어요.');
    if (m.results.resultsInView && m.results.resultsWithPhoto < m.results.resultsInView) problem(`사진 없는 결과 카드 ${m.results.resultsInView - m.results.resultsWithPhoto}개`);
    if (!m.scope.includes('price')) problem('결과 화면에 현재 검색 범위(예산 조건 칩 data-flow="condition-remove")가 보이지 않아요.');
    const v1 = await violations();
    if (v1.length) problem(`조건 위반 상품 ${v1.length}개: ${v1[0]}`);
    // 결과를 조금 내린 뒤 상품을 연다(뒤로가기 위치 복원 확인용).
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    if (scrollable > 300) { await page.mouse.wheel(0, 400); await page.waitForTimeout(400); }
    const opener = visible(page, '[data-flow="result"]').first();
    await opener.scrollIntoViewIfNeeded().catch(() => {});
    m.scrollBeforeOpen = await page.evaluate(() => scrollY); // 누르기 직전 위치
    await opener.click({ timeout: 4000 }); c.n++;
    await page.waitForTimeout(500);
    m.pdpShown = await has(page, '[data-flow="pdp"]', 2000);
    m.actionsToPdp = c.n;
    m.pdpHash = await page.evaluate(() => location.hash);
    if (!m.pdpShown) problem('상품을 눌러도 상품 상세(data-flow="pdp")가 열리지 않아요.');
    if (!/^#\/p\//.test(m.pdpHash)) problem(`상품 상세 주소가 #/p/… 형식이 아니에요(${m.pdpHash || '없음'}). 뒤로가기·공유가 안 돼요.`);
    await waitPhotos(page);
    m.pdp = await page.evaluate(() => {
      const root = [...document.querySelectorAll('[data-flow="pdp"]')].find((el) => el.getBoundingClientRect().height > 0);
      const img = root?.querySelector('.eo-ph[data-photo="product"] img');
      const r = img?.getBoundingClientRect();
      const hold = [...(root || document).querySelectorAll('[data-flow="decide-hold"]')].find((el) => el.getBoundingClientRect().height > 0)?.getBoundingClientRect();
      const fs = (sel) => { const el = root?.querySelector(sel); return el ? parseFloat(getComputedStyle(el).fontSize) : null; };
      const price = root?.querySelector('[data-flow="pdp-price"]');
      const priceBox = price?.parentElement || price;
      const used = root?.querySelector('[data-flow="used-search"]');
      const usedText = used?.innerText || '';
      return {
        photo: !!img, photoLoaded: !!img && img.complete && img.naturalWidth > 0, photoWidthShare: r ? +(r.width / innerWidth).toFixed(2) : null,
        zoom: !!root?.querySelector('[data-flow="photo-zoom"]'),
        decideInFirstScreen: !!hold && hold.top >= 0 && hold.bottom <= innerHeight,
        brandPx: fs('[data-flow="pdp-brand"]'), namePx: fs('[data-flow="pdp-name"]'), pricePx: fs('[data-flow="pdp-price"]'),
        priceText: price?.innerText.replace(/\s+/g, ' ').trim().slice(0, 30) || null,
        priceLabeled: /수집/.test(priceBox?.innerText || ''), priceMisleading: /현재가|최저가|할인가|특가/.test((root?.innerText || '').replace(/현재가[·ㆍ, ]*최저가가 아니|현재가가 아니|최저가가 아니/g, '')),
        used: !!used, usedHonest: !!used && /확인/.test(usedText), usedHasPrice: /\d[\d,]*\s*원/.test(usedText),
      };
    });
    m.pdpScreen = await screenStats(page);
    await shot(page, 'm3-pdp');
    if (!m.pdp.photo) problem('상품 상세에 상품 사진(.eo-ph[data-photo="product"])이 없어요.');
    else if (m.pdp.photoWidthShare < 0.85) problem(`상품 상세 사진이 작아요(화면 폭의 ${Math.round(m.pdp.photoWidthShare * 100)}%, 85% 이상 권장).`);
    if (!m.pdp.zoom) problem('상품 사진 크게 보기(data-flow="photo-zoom")가 없어요.');
    if (!m.pdp.brandPx || !m.pdp.namePx || !m.pdp.pricePx) problem('상품 상세에 브랜드·품명·가격 표시(data-flow="pdp-brand|pdp-name|pdp-price")가 없어요.');
    if (!m.pdp.priceLabeled) problem('상세 가격 옆에 ‘수집가’ 표기가 없어요(현재가로 오해).');
    if (m.pdp.priceMisleading) problem('상세에 현재가·최저가·할인가·특가 같은 말이 있어요.');
    if (!m.pdp.used) problem('상세에 중고 비교(data-flow="used-search")가 없어요(새 상품/중고를 같은 맥락에서).');
    else { if (!m.pdp.usedHonest) problem('중고 영역에 ‘매물·상태·가격 확인 안 함’ 표기가 없어요.'); if (m.pdp.usedHasPrice) problem('중고 영역에 가격처럼 보이는 숫자가 있어요(지어낸 매물 가격 금지).'); }
    m.verdictNoCloset = await verdictText(page);
    if (!m.verdictNoCloset) problem('상품 상세에서 판정(data-flow="verdict")을 찾지 못했어요.');
    // 사진 크게 보기
    if (m.pdp.zoom) {
      await visible(page, '[data-flow="photo-zoom"]').first().click().catch(() => {});
      await page.waitForTimeout(400);
      m.zoomOpens = await page.evaluate(() => [...document.querySelectorAll('[data-flow="photo-viewer"]')].some((el) => el.getBoundingClientRect().width >= innerWidth * 0.9));
      if (!m.zoomOpens) problem('사진 크게 보기를 눌러도 화면 폭 가득 사진(data-flow="photo-viewer")이 열리지 않아요.');
      await shot(page, 'm3b-zoom');
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      if (await has(page, '[data-flow="photo-viewer"]')) { await page.goBack(); await page.waitForTimeout(400); }
      m.zoomClosesToSame = (await page.evaluate((h) => location.hash === h, m.pdpHash)) && await has(page, '[data-flow="pdp"]');
      if (!m.zoomClosesToSame) problem('사진 크게 보기를 닫으면 같은 상품 상세로 돌아오지 않아요.');
    }
    // (선택) 상세에서 내 옷 한 벌(흰 셔츠) 넣고 같은 상품으로 복귀
    const a = { n: 0 };
    const pdpId = m.pdpHash.replace(/^#\/p\//, '').split('?')[0];
    if (!(await has(page, '[data-flow="closet-add"]'))) problem('상품 상세에서 바로 옷을 넣는 곳(data-flow="closet-add")이 없어요.');
    await tap(page, '[data-flow="closet-add"]', a);
    if (await has(page, '[data-flow="kind-option"][data-kind="shirt"]', 1500)) await tap(page, '[data-flow="kind-option"][data-kind="shirt"]', a);
    if (await has(page, '[data-flow="color-option"][data-color="white"]', 1500)) await tap(page, '[data-flow="color-option"][data-color="white"]', a);
    if (await has(page, '[data-flow="closet-save"]', 800)) await tap(page, '[data-flow="closet-save"]', a);
    m.actionsToAddGarment = a.n;
    const s = await state(page);
    m.closetAdded = s?.closetCount === 1 && s.closet[0].kind === 'shirt' && s.closet[0].color === 'white';
    if (!m.closetAdded) problem('셔츠·화이트로 옷 한 벌을 넣지 못했어요.');
    await page.waitForTimeout(300);
    m.hashAfterAdd = await page.evaluate(() => location.hash);
    m.returnedToSameProduct = m.hashAfterAdd.startsWith(`#/p/${pdpId}`) && await has(page, '[data-flow="pdp"]');
    if (!m.returnedToSameProduct) problem(`옷을 넣은 뒤 같은 상품 상세로 돌아오지 않아요(${m.hashAfterAdd}).`);
    m.verdictAfterAdd = await verdictText(page);
    m.verdictChanged = !!m.verdictAfterAdd && m.verdictAfterAdd !== m.verdictNoCloset;
    if (!m.verdictChanged) problem('옷을 넣은 뒤에도 판정이 바뀌지 않았어요.');
    await waitPhotos(page);
    m.compareScreen = await screenStats(page);
    await shot(page, 'm4-after-add');
    // 후보 둘 비교: 지금 상품 담기 → 다른 후보 담기 → 비교 보기
    const k = { n: 0 };
    const otherSel = `[data-flow="compare-add"][data-product-id]:not([data-product-id="${pdpId}"])`;
    await tap(page, `[data-flow="compare-add"][data-product-id="${pdpId}"], [data-flow="pdp"] [data-flow="compare-add"]:not([data-product-id])`, k);
    if (!(await has(page, otherSel))) {
      if (await has(page, '[data-flow="compare-view"]')) { /* 비교함이 바로 열리는 시안: 거기서 다른 후보를 고른다 */ }
      else { await page.goBack(); await page.waitForTimeout(500); k.n++; }
    }
    if (await has(page, otherSel)) await tap(page, otherSel, k);
    else { await visible(page, `[data-flow="result"]:not([data-product-id="${pdpId}"])`).first().click(); k.n++; await page.waitForTimeout(500); await tap(page, '[data-flow="pdp"] [data-flow="compare-add"]', k); }
    if (!(await has(page, '[data-flow="compare-view"]', 600)) && await has(page, '[data-flow="compare-open"]')) await tap(page, '[data-flow="compare-open"]', k);
    m.actionsToCompare = k.n;
    m.compareHash = await page.evaluate(() => location.hash);
    m.compareItems = await page.evaluate(() => [...document.querySelectorAll('[data-flow="compare-view"] [data-flow="compare-item"]')].filter((el) => el.getBoundingClientRect().height > 0).map((el) => ({ id: el.dataset.productId, photo: !!el.querySelector('.eo-ph img') })));
    if (m.compareItems.length < 2) problem(`후보 둘 비교(data-flow="compare-view" 안 compare-item 2개)가 안 돼요(${m.compareItems.length}개).`);
    if (m.compareItems.some((x) => !x.photo)) problem('비교 화면에 사진 없는 후보가 있어요.');
    const v2 = await violations();
    if (v2.length) problem(`비교 화면에 조건 위반 상품: ${v2[0]}`);
    await waitPhotos(page);
    m.compareView = await screenStats(page);
    await shot(page, 'm5-compare');
    // 보류 기록(비교 화면에서 한 후보를 보류)
    const h = { n: 0 };
    await tap(page, '[data-flow="decide-hold"]', h);
    const recs = (await state(page))?.records || [];
    m.holdRecorded = recs.some((r) => r.decision === 'hold');
    m.otherDecisionByAccident = recs.some((r) => r.decision === 'buy' || r.decision === 'skip');
    if (!m.holdRecorded) problem('보류를 눌렀는데 보류 기록이 생기지 않았어요.');
    if (m.otherDecisionByAccident) problem('보류 과정에서 사기로 함·안 삼 기록이 자동으로 생겼어요.');
    m.actionsTotal = c.n + a.n + k.n + h.n;
    await shot(page, 'm6-held');
    // 뒤로가기: 흰 화면·초기화 없이 앞 화면으로, 기록은 그대로
    const hashBeforeBack = await page.evaluate(() => location.hash);
    await page.goBack(); await page.waitForTimeout(600);
    m.backHash = await page.evaluate(() => location.hash);
    m.backShowsScreen = await has(page, '[data-flow="pdp"], [data-flow="result"], [data-flow="compare-view"]', 1500);
    m.backKeepsRecord = ((await state(page))?.records || []).some((r) => r.decision === 'hold');
    if (!m.backShowsScreen) problem(`보류 뒤 뒤로가기에서 앞 화면이 보이지 않아요(${hashBeforeBack} → ${m.backHash}).`);
    if (!m.backKeepsRecord) problem('뒤로가기 뒤 보류 기록이 사라졌어요.');
    // 결과까지 뒤로가기 → 위치 복원
    const onResults = async () => (await page.evaluate(() => location.hash.startsWith('#/search'))) && await has(page, '[data-flow="result"]');
    for (let i = 0; i < 6 && !(await onResults()); i++) { await page.goBack(); await page.waitForTimeout(400); }
    m.backToResults = await onResults();
    m.scrollAfterBack = await page.evaluate(() => scrollY);
    m.scrollRestored = m.scrollBeforeOpen < 100 ? m.backToResults : m.backToResults && Math.abs(m.scrollAfterBack - m.scrollBeforeOpen) <= Math.max(120, m.scrollBeforeOpen * 0.25);
    if (!m.backToResults) problem('뒤로가기를 이어 눌러도 검색 결과로 돌아오지 않아요.');
    else if (!m.scrollRestored) problem(`뒤로가기 뒤 결과 위치가 바뀌어요(${m.scrollBeforeOpen}px → ${m.scrollAfterBack}px).`);
    await shot(page, 'm7-back');
  } catch (error) { problem(`과업(검색→상세→옷 추가→비교→보류→뒤로) 중 멈췄어요: ${error.message.split('\n')[0]}`); }
  // 조건 빼기
  try {
    const r = { n: 0 };
    await ask(page, QUERY, r);
    const chip = '[data-flow="condition-remove"][data-key="price"]';
    if (await has(page, chip)) { await tap(page, chip, r); m.conditionRemoveWorks = !(await has(page, chip)); }
    else { m.conditionRemoveWorks = false; problem('예산 조건을 빼는 표시(data-flow="condition-remove" data-key="price")가 없어요.'); }
  } catch (error) { problem(`조건 빼기에서 멈췄어요: ${error.message.split('\n')[0]}`); }
  // 빈 결과·못 읽는 말: 상품을 지어내지 않고, 이유와 다음 행동을 준다.
  for (const [key, q, re] of [['notUnderstood', '꾸안꾸 느낌으로', /찾을 수 없|찾지 못|못 읽|이해하지/], ['emptyKind', '남자 원피스', /없어요|없습니다/]]) {
    try {
      const r = { n: 0 };
      await ask(page, q, r);
      await page.waitForTimeout(300);
      const shown = await visible(page, '[data-flow="result"]').count();
      const text = await page.evaluate(() => document.body.innerText);
      const next = await page.evaluate(() => [...document.querySelectorAll('[data-flow="example"], [data-flow="empty-action"]')].filter((el) => el.getBoundingClientRect().height > 0).length);
      m[key] = { honest: (key === 'notUnderstood' ? shown === 0 : true) && re.test(text), nextActions: next };
      if (!m[key].honest) problem(`‘${q}’에 상품을 지어내거나 이유를 말하지 않아요.`);
      if (!next) problem(`‘${q}’ 빈 결과에서 다음 행동(예시 요청 data-flow="example" 또는 data-flow="empty-action")이 없어요.`);
      await shot(page, `m8-${key}`);
    } catch (error) { problem(`‘${q}’에서 멈췄어요: ${error.message.split('\n')[0]}`); }
  }
  // 기록
  try {
    const r = { n: 0 };
    if (!(await has(page, '[data-flow="record"]'))) await tap(page, '[data-flow="nav-records"]', r);
    m.recordsListed = await visible(page, '[data-flow="record"]').count();
    m.recordHasPhoto = await page.evaluate(() => [...document.querySelectorAll('[data-flow="record"]')].some((el) => el.getBoundingClientRect().height > 0 && el.querySelector('.eo-ph')));
    if (!m.recordsListed) problem('기록 목록(data-flow="record")이 보이지 않아요.');
    if (m.recordsListed && !m.recordHasPhoto) problem('기록에 상품 사진이 없어요.');
    await shot(page, 'm9-records');
  } catch (error) { problem(`기록 열기에서 멈췄어요: ${error.message.split('\n')[0]}`); }
  m.horizontalOverflow = await overflow(page);
  report.a11y = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const controls = [...document.querySelectorAll('button, a[href], input, select, [role="button"]')].filter(vis);
    const unnamed = controls.filter((el) => !(el.getAttribute('aria-label') || el.innerText.trim() || el.getAttribute('title') || el.value || el.labels?.length || el.getAttribute('placeholder') || el.querySelector('img[alt]:not([alt=""])')));
    // 1px 이하로 숨긴 요소(건너뛰기 링크 등, 포커스 때만 보임)는 누르는 곳으로 세지 않는다.
    const small = controls.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && (r.width < 24 || r.height < 24); });
    const under44 = controls.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 40 || r.height < 40; });
    const tiny = [...document.querySelectorAll('body *')].filter((el) => vis(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12);
    const imgsNoAlt = [...document.querySelectorAll('img')].filter((i) => vis(i) && !i.hasAttribute('alt')).length;
    return { controls: controls.length, unnamed: unnamed.length, under24: small.length, under40: under44.length, under40Samples: under44.slice(0, 5).map((el) => el.innerText.trim().slice(0, 20) || el.getAttribute('aria-label') || el.tagName), tinyText: tiny.length, imgsNoAlt };
  });
  if (report.a11y.unnamed) problem(`이름 없는 버튼 ${report.a11y.unnamed}개`);
  if (report.a11y.under24) problem(`24px 미만 누르는 곳 ${report.a11y.under24}개(WCAG 2.5.8)`);
  if (report.a11y.tinyText) problem(`12px 미만 글자 ${report.a11y.tinyText}곳`);
  m.pageErrors = errors; m.consoleErrors = consoleErrors.length; m.externalRequests = external;
  report.photos.mobileRequests = photoRequests.length;
  if (errors.length) problem(`페이지 오류 ${errors.length}개: ${errors[0]}`);
  if (external.length) problem(`사진 서버 밖 외부 요청 ${external.length}개: ${external[0]}`);
  if (m.horizontalOverflow > 1) problem(`모바일 가로 넘침 ${m.horizontalOverflow}px`);
  for (const [k, v] of Object.entries({ results: m.results, pdp: m.pdpScreen, afterAdd: m.compareScreen, compare: m.compareView })) {
    if (!v) continue;
    if (v.brokenImages) problem(`${k} 화면에 깨진 사진 ${v.brokenImages}개(못 불러온 사진은 색 카드로 바뀌어야 해요).`);
    if (v.drawingsInView) problem(`${k} 화면에 그림(56px 이상 SVG) ${v.drawingsInView}개가 남아 있어요.`);
    if (!offline && v.tilesInView > (k === 'afterAdd' ? 2 : 0)) problem(`${k} 화면에 사진 대신 색 카드 ${v.tilesInView}개`);
    if (v.noticeLines > 3) problem(`${k} 첫 화면 안내문 ${v.noticeLines}줄(3줄 이하 권장): ${v.noticeSamples.join(' / ')}`);
  }
  await ctx.close();
}

// ── PC (요청 주소로 바로 열기 → 결과 → 상세·판정 → 뒤로)
{
  const { ctx, page, errors, external } = await newPage({ width: 1280, height: 800 }, false);
  const p = report.pc;
  await page.goto(`${base}?reset=1&closet=trial&q=${encodeURIComponent(QUERY)}`);
  await page.waitForTimeout(900);
  await waitPhotos(page);
  p.autoQuery = await visible(page, '[data-flow="result"]').count() > 0;
  if (!p.autoQuery) problem('주소의 ?q= 요청을 열자마자 결과로 보여 주지 않아요.');
  p.results = await screenStats(page);
  await shot(page, 'p1-results');
  try {
    await visible(page, '[data-flow="result"]').first().click({ timeout: 4000 });
    await page.waitForTimeout(600);
    await waitPhotos(page);
    p.pdpShown = await has(page, '[data-flow="pdp"]', 2000);
    p.verdictTrial = await verdictText(page);
    p.pdpScreen = await screenStats(page);
    p.decideInFirstScreen = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-flow="decide-hold"]')].find((el) => el.getBoundingClientRect().height > 0)?.getBoundingClientRect(); return !!b && b.top >= 0 && b.bottom <= innerHeight; });
    await shot(page, 'p2-pdp');
    if (!p.pdpShown) problem('PC에서 상품 상세가 열리지 않아요.');
    await page.goBack(); await page.waitForTimeout(500);
    p.backToResults = (await page.evaluate(() => location.hash.startsWith('#/search') || location.hash === '')) && await has(page, '[data-flow="result"]', 1500);
    if (!p.backToResults) problem('PC에서 뒤로가기로 결과에 돌아오지 않아요.');
  } catch (error) { problem(`PC에서 상세를 열지 못했어요: ${error.message.split('\n')[0]}`); }
  p.horizontalOverflow = await overflow(page);
  if (p.horizontalOverflow > 1) problem(`PC 가로 넘침 ${p.horizontalOverflow}px`);
  p.pageErrors = errors; p.externalRequests = external;
  if (errors.length) problem(`PC 페이지 오류 ${errors.length}개: ${errors[0]}`);
  await ctx.close();
}
await browser.close();
// 사진 서버를 막은 검사에서는 사진이 없는 것이 정상이다. 대신 깨진 사진 없이 색 카드로 바뀌었는지만 본다.
if (offline) report.problems = report.problems.filter((t) => !/사진 없는 결과|상품 사진\(|사진 없는 후보|기록에 상품 사진|사진이 작아요|색 카드/.test(t));
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (args.includes('--json')) console.log(JSON.stringify(report));
else {
  const m = report.mobile, p = report.pc, r = m.results || {}, d = m.pdp || {};
  console.log(`${report.file}${offline ? ' (사진 서버 막음)' : ''}
  시안 표시: ${m.mockLabel ?? '없음'} · 고지 열림 ${m.disclosureOpens ? '예' : '아니요'} · 첫 화면 요청칸 ${m.askOnFirstScreen ? '예' : '아니요'}
  결과 첫 화면: 카드 ${r.resultsInView ?? '-'}(온전히 ${r.resultsFullyInView ?? '-'}) · ${r.resultColumns ?? '-'}열 · 사진 ${r.photosLoaded ?? '-'}/${r.photosInView ?? '-'} · 사진 비율 ${r.firstPhotoRatio ?? '-'} · 안내문 ${r.noticeLines ?? '-'}줄
  상품 상세: 열림 ${m.pdpShown ? '예' : '아니요'}(${m.pdpHash || '-'}) · 사진 폭 ${d.photoWidthShare ?? '-'} · 크게 보기 ${m.zoomOpens ? '됨' : '안 됨'} · 글자 브랜드/품명/가격 ${d.brandPx ?? '-'}/${d.namePx ?? '-'}/${d.pricePx ?? '-'}px · 가격 ${d.priceText ?? '-'}(수집가 표기 ${d.priceLabeled ? '있음' : '없음'}) · 중고 ${d.used ? (d.usedHonest ? '정직' : '표기 부족') : '없음'}
  판정(옷장 없음): ${m.verdictNoCloset ?? '-'}
  옷 추가(동작 ${m.actionsToAddGarment ?? '-'}) → 같은 상품 복귀 ${m.returnedToSameProduct ? '예' : '아니요'} · 바뀐 판정: ${m.verdictAfterAdd ?? '-'}
  후보 둘 비교: ${m.compareItems?.length ?? 0}개(동작 ${m.actionsToCompare ?? '-'}, ${m.compareHash || '-'}) · 보류 기록 ${m.holdRecorded ? '됨' : '안 됨'} · 과업 전체 동작 ${m.actionsTotal ?? '-'}
  뒤로가기: 보류 뒤 ${m.backShowsScreen ? '앞 화면 보임' : '문제'}(${m.backHash || '-'}) · 결과 복귀 ${m.backToResults ? '예' : '아니요'} · 위치 ${m.scrollBeforeOpen ?? '-'}→${m.scrollAfterBack ?? '-'} ${m.scrollRestored ? '(복원)' : ''}
  조건 빼기 ${m.conditionRemoveWorks ? '됨' : '안 됨'} · 못 읽는 말 ${m.notUnderstood?.honest ? '정직' : '문제'} · 없는 종류 ${m.emptyKind?.honest ? '정직' : '문제'} · 기록 ${m.recordsListed ?? 0}건(사진 ${m.recordHasPhoto ? '있음' : '없음'})
  PC: ?q= 결과 ${p.autoQuery ? '예' : '아니요'} · 카드 ${p.results?.resultsInView ?? '-'} · 상세 ${p.pdpShown ? '예' : '아니요'} · 체험 옷장 판정: ${p.verdictTrial ?? '-'}
  접근성: 조작 ${report.a11y.controls} · 이름 없음 ${report.a11y.unnamed} · 24px 미만 ${report.a11y.under24} · 40px 미만 ${report.a11y.under40} · 12px 미만 글자 ${report.a11y.tinyText}
  문제 ${report.problems.length}개${report.problems.length ? `\n   - ${report.problems.join('\n   - ')}` : ''}
  화면: ${outDir}`);
}
