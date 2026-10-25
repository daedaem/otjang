// 시안 하나를 같은 시나리오로 직접 눌러 보고 숫자와 화면을 남긴다(모바일 390×844, PC 1280×800).
// 시안은 data-flow 표시(README의 "흐름 표시")를 달아야 한다. 외부 요청은 모두 막고 기록한다.
// 사용: node app/mockups/ux10/tools/flowcheck.mjs <시안.html> [--out 폴더] [--json]
// 필요: Playwright와 Chromium. PLAYWRIGHT_MODULE, CHROMIUM_PATH 환경 변수로 위치를 바꿀 수 있다.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) throw new Error('시안 HTML 경로를 적어 주세요.');
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
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
const report = { file: path.basename(file), steps: [], mobile: {}, pc: {}, a11y: {}, problems: [], shots: [] };
const problem = (text) => { report.problems.push(text); };

async function newPage(viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [], external = [], consoleErrors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (/^(file|data|blob|about):/.test(u)) return route.continue();
    external.push(u);
    return route.abort();
  });
  await ctx.addInitScript(() => { window.open = () => null; }); // 판매처 링크는 검사 중 열지 않는다.
  return { ctx, page, errors, external, consoleErrors };
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
  await page.waitForTimeout(350);
}
async function shot(page, name, full = true) {
  const p = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: p, fullPage: full });
  report.shots.push(path.relative(process.cwd(), p));
}
const state = (page) => page.evaluate(() => window.EoulMock?.getState());
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function verdictText(page) {
  const loc = visible(page, '[data-flow="verdict"]').first();
  return (await loc.count()) ? (await loc.innerText()).replace(/\s+/g, ' ').trim() : null;
}
async function ask(page, text, counter) {
  const input = visible(page, '[data-flow="ask-input"]').first();
  if (!(await input.count())) {
    if (await has(page, '[data-flow="nav-ask"]')) await tap(page, '[data-flow="nav-ask"]', counter);
  }
  const box = visible(page, '[data-flow="ask-input"]').first();
  await box.scrollIntoViewIfNeeded().catch(() => {});
  await box.click();
  await box.fill(text);
  counter.n++;
  if (await has(page, '[data-flow="ask-submit"]')) await tap(page, '[data-flow="ask-submit"]', counter);
  else { await box.press('Enter'); counter.n++; await page.waitForTimeout(350); }
  // 단계형 시안: 결과나 판정이 나올 때까지 "다음"을 누른다(최대 4번).
  for (let i = 0; i < 4; i++) {
    if (await has(page, '[data-flow="result"], [data-flow="verdict"]', 1500)) break;
    if (await has(page, '[data-flow="next"]')) await tap(page, '[data-flow="next"]', counter);
  }
}

// ── 모바일
{
  const { ctx, page, errors, external, consoleErrors } = await newPage({ width: 390, height: 844 }, true);
  const c = { n: 0 };
  await page.goto(`${base}?reset=1`);
  await page.waitForTimeout(800);
  await shot(page, 'm1-first', false);
  await shot(page, 'm1-first-full');
  const m = report.mobile;
  m.firstScreenHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const inputBox = await visible(page, '[data-flow="ask-input"]').first().boundingBox().catch(() => null);
  m.askOnFirstScreen = !!inputBox && inputBox.y + inputBox.height <= 844;
  m.mockLabel = await has(page, '[data-flow="mock-label"]');
  if (!m.mockLabel) problem('목업 표시(data-flow="mock-label")가 첫 화면에 없어요.');
  try {
    await ask(page, QUERY, c);
    m.actionsToResults = c.n;
    m.resultsShown = await visible(page, '[data-flow="result"]').count();
    await shot(page, 'm2-results');
    if (!(await has(page, '[data-flow="verdict"]'))) {
      if (m.resultsShown) await tap(page, '[data-flow="result"]', c);
    }
    m.verdictNoCloset = await verdictText(page);
    m.actionsToVerdict = m.verdictNoCloset ? c.n : null;
    if (!m.verdictNoCloset) problem('결과에서 판정(data-flow="verdict")을 찾지 못했어요.');
    await shot(page, 'm3-verdict');
    await tap(page, '[data-flow="decide-buy"]', c);
    m.actionsToDecision = c.n;
    m.decisionRecorded = ((await state(page))?.records || []).some((r) => r.decision === 'buy');
    if (!m.decisionRecorded) problem('사기로 함을 눌렀는데 기록이 생기지 않았어요.');
  } catch (error) { problem(`요청→판정→결정 단계에서 멈췄어요: ${error.message.split('\n')[0]}`); }
  // 가진 옷 한 벌(흰 셔츠) 넣고 같은 상품 판정이 바뀌는지
  try {
    const a = { n: 0 };
    if (!(await has(page, '[data-flow="closet-add"]'))) {
      if (await has(page, '[data-flow="nav-closet"]')) await tap(page, '[data-flow="nav-closet"]', a);
    }
    await tap(page, '[data-flow="closet-add"]', a);
    if (await has(page, '[data-flow="kind-option"][data-kind="shirt"]', 1500)) await tap(page, '[data-flow="kind-option"][data-kind="shirt"]', a);
    if (await has(page, '[data-flow="color-option"][data-color="white"]', 1500)) await tap(page, '[data-flow="color-option"][data-color="white"]', a);
    if (await has(page, '[data-flow="closet-save"]', 800)) await tap(page, '[data-flow="closet-save"]', a);
    m.actionsToAddGarment = a.n;
    const s = await state(page);
    m.closetAdded = s?.closetCount === 1 && s.closet[0].kind === 'shirt' && s.closet[0].color === 'white';
    if (!m.closetAdded) problem('셔츠·화이트로 옷 한 벌을 넣지 못했어요.');
    await shot(page, 'm4-after-add');
    let after = await verdictText(page);
    m.returnedToVerdictAfterAdd = !!after;
    if (!after) {
      const r = { n: 0 };
      await ask(page, QUERY, r);
      if (!(await has(page, '[data-flow="verdict"]'))) await tap(page, '[data-flow="result"]', r);
      after = await verdictText(page);
    }
    m.verdictAfterAdd = after;
    m.verdictChanged = !!after && after !== m.verdictNoCloset;
    if (!m.verdictChanged) problem('옷을 넣은 뒤에도 판정이 바뀌지 않았어요.');
    await shot(page, 'm5-verdict-after-add');
  } catch (error) { problem(`옷 넣기 단계에서 멈췄어요: ${error.message.split('\n')[0]}`); }
  // 조건 빼기
  try {
    const r = { n: 0 };
    await ask(page, QUERY, r);
    const before = await visible(page, '[data-flow="result"]').count();
    const chip = '[data-flow="condition-remove"][data-key="price"]';
    if (await has(page, chip)) {
      await tap(page, chip, r);
      const priceStill = await has(page, chip);
      m.conditionRemoveWorks = !priceStill;
      m.resultsAfterRemove = await visible(page, '[data-flow="result"]').count();
      m.resultsBeforeRemove = before;
    } else { m.conditionRemoveWorks = false; problem('예산 조건을 빼는 표시(data-flow="condition-remove" data-key="price")가 없어요.'); }
    await shot(page, 'm6-condition-removed');
  } catch (error) { problem(`조건 빼기에서 멈췄어요: ${error.message.split('\n')[0]}`); }
  // 못 읽는 말
  try {
    const r = { n: 0 };
    await ask(page, '꾸안꾸 느낌으로', r);
    await page.waitForTimeout(300);
    const shown = await visible(page, '[data-flow="result"]').count();
    const text = await page.evaluate(() => document.body.innerText);
    m.notUnderstoodHonest = shown === 0 && /찾을 수 없|찾지 못|못 읽|이해하지/.test(text);
    if (!m.notUnderstoodHonest) problem('못 읽는 요청에 상품을 보여 주거나 안내가 없어요.');
    await shot(page, 'm7-not-understood');
  } catch (error) { problem(`못 읽는 요청에서 멈췄어요: ${error.message.split('\n')[0]}`); }
  // 기록 목록
  try {
    const r = { n: 0 };
    if (!(await has(page, '[data-flow="record"]'))) await tap(page, '[data-flow="nav-records"]', r);
    m.recordsListed = await visible(page, '[data-flow="record"]').count();
    if (!m.recordsListed) problem('기록 목록(data-flow="record")이 보이지 않아요.');
    await shot(page, 'm8-records');
  } catch (error) { problem(`기록 열기에서 멈췄어요: ${error.message.split('\n')[0]}`); }
  m.horizontalOverflow = await overflow(page);
  // 접근성 간이 검사(현재 화면 기준): 이름 없는 버튼, 12px 미만 글자, 40px 미만 누르는 곳
  report.a11y = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const controls = [...document.querySelectorAll('button, a[href], input, select, [role="button"]')].filter(vis);
    const unnamed = controls.filter((el) => !(el.getAttribute('aria-label') || el.innerText.trim() || el.getAttribute('title') || el.value || el.labels?.length || el.getAttribute('placeholder')));
    const small = controls.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 40 || r.height < 40; });
    const tiny = [...document.querySelectorAll('body *')].filter((el) => vis(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12);
    return { controls: controls.length, unnamed: unnamed.length, smallTargets: small.length, smallTargetSamples: small.slice(0, 5).map((el) => el.innerText.trim().slice(0, 20) || el.getAttribute('aria-label') || el.tagName), tinyText: tiny.length };
  });
  m.pageErrors = errors; m.consoleErrors = consoleErrors.length; m.externalRequests = external;
  if (errors.length) problem(`페이지 오류 ${errors.length}개: ${errors[0]}`);
  if (external.length) problem(`외부 요청 ${external.length}개: ${external[0]}`);
  if (m.horizontalOverflow > 1) problem(`모바일 가로 넘침 ${m.horizontalOverflow}px`);
  await ctx.close();
}

// ── PC (요청 주소로 바로 열기 → 결과 → 판정)
{
  const { ctx, page, errors, external } = await newPage({ width: 1280, height: 800 }, false);
  const p = report.pc;
  await page.goto(`${base}?reset=1&closet=trial&q=${encodeURIComponent(QUERY)}`);
  await page.waitForTimeout(900);
  p.autoQuery = await visible(page, '[data-flow="result"]').count() > 0 || await has(page, '[data-flow="verdict"]');
  if (!p.autoQuery) problem('주소의 ?q= 요청을 열자마자 결과로 보여 주지 않아요.');
  await shot(page, 'p1-results', false);
  try {
    if (!(await has(page, '[data-flow="verdict"]'))) await tap(page, '[data-flow="result"]', { n: 0 });
    p.verdictTrial = await verdictText(page);
    await shot(page, 'p2-verdict', false);
  } catch (error) { problem(`PC에서 판정을 열지 못했어요: ${error.message.split('\n')[0]}`); }
  p.horizontalOverflow = await overflow(page);
  if (p.horizontalOverflow > 1) problem(`PC 가로 넘침 ${p.horizontalOverflow}px`);
  p.pageErrors = errors; p.externalRequests = external;
  if (errors.length) problem(`PC 페이지 오류 ${errors.length}개: ${errors[0]}`);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (args.includes('--json')) console.log(JSON.stringify(report));
else {
  const m = report.mobile, p = report.pc;
  console.log(`${report.file}
  첫 화면에서 바로 요청: ${m.askOnFirstScreen ? '예' : '아니요'} · 목업 표시: ${m.mockLabel ? '있음' : '없음'}
  요청→결과 동작 ${m.actionsToResults ?? '-'} · 첫 판정까지 ${m.actionsToVerdict ?? '-'} · 결정까지 ${m.actionsToDecision ?? '-'} · 옷 한 벌 넣기 ${m.actionsToAddGarment ?? '-'}
  판정(옷장 없음): ${m.verdictNoCloset ?? '-'}
  판정(흰 셔츠 넣은 뒤): ${m.verdictAfterAdd ?? '-'} ${m.returnedToVerdictAfterAdd ? '(넣고 바로 판정으로 복귀)' : ''}
  조건 빼기: ${m.conditionRemoveWorks ? '됨' : '안 됨'} · 못 읽는 말 정직: ${m.notUnderstoodHonest ? '예' : '아니요'} · 기록 ${m.recordsListed ?? 0}건
  PC: ?q= 바로 결과 ${p.autoQuery ? '예' : '아니요'} · 체험 옷장 판정: ${p.verdictTrial ?? '-'}
  접근성: 조작 ${report.a11y.controls} · 이름 없음 ${report.a11y.unnamed} · 40px 미만 ${report.a11y.smallTargets} · 12px 미만 글자 ${report.a11y.tinyText}
  문제 ${report.problems.length}개${report.problems.length ? `\n   - ${report.problems.join('\n   - ')}` : ''}
  화면: ${outDir}`);
}
