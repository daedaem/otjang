// 격리 브라우저에서 옷장 파일 추가·취소·중복을 확인한다. 원래 옷장 파일과 사용자 브라우저 자료를 바꾸지 않는다.
// 기본은 합성 예시다. PRIVATE_WARDROBE / CANDIDATE_FILE을 지정하면 별도 파일로 같은 검사를 할 수 있다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url), W = require('../src/wardrobe.js'), C = require('../src/catalog.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'shots/import'); fs.mkdirSync(evidence, { recursive: true });
const source = process.env.PRIVATE_WARDROBE || path.join(root, 'data/sample-wardrobe.json');
const sourceBytes = fs.readFileSync(source), hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const base = W.cleanWardrobe(JSON.parse(sourceBytes));
const fixture = process.env.CANDIDATE_FILE ? JSON.parse(fs.readFileSync(process.env.CANDIDATE_FILE, 'utf8')) : {
  schema: 2, kind: 'wardrobe', owner: {}, items: [{ id: 'qa-purchase-candidate', status: 'candidate', cat: 'outer', kind: 'jacket', name: '합성 검증용 구매 후보', family: 'beige', attrSource: 'photo-draft', look3d: null }], decisions: [],
};
const candidate = W.cleanWardrobe(fixture).items[0];
const seed = { ...base, owner: { nickname: '합성 검증 소유자', height: 180, topSize: '검증용', bottomSize: '검증용' },
  decisions: [{ id: 'qa-existing-decision', itemId: base.items[0].id, name: '합성 검증 기록', before: { lean: 'unsure', reason: '검증용', at: '2026-10-12' }, summary: { overlaps: 0, added: 0, blockers: 0 }, after: null }],
  catalog: C.cleanCatalog({ schema: 1, kind: 'catalog', products: [{ id: 'qa-existing-product', cat: 'top', kind: 'shirt', name: '합성 검증 상품', family: 'blue' }] }),
  others: [W.cleanWardrobe(JSON.parse(fs.readFileSync(path.join(root, 'data/template-ivy.json'), 'utf8')))],
  rack: base.items.filter((it) => it.look3d).slice(0, 2).map((it, i) => ({ id: it.id, slot: 5 - i })) };
const file = pathToFileURL(path.join(root, process.env.PAGE || 'dist/index.html')).href;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
const results = [], errors = [], external = [];
const check = (pass, label, detail) => { results.push({ pass: !!pass, label, ...(detail === undefined ? {} : { detail }) }); console.log((pass ? 'ok ' : 'FAIL ') + label); };
const state = (page) => page.evaluate(() => window.__app.state);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const flush = (page) => page.evaluate(() => window.__app.flush());
const asFile = (json) => ({ name: 'import-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
async function open() {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  await context.addInitScript((initial) => {
    if (!localStorage.getItem('__importQaSeeded')) { localStorage.setItem('otjang.v2', JSON.stringify(initial)); localStorage.setItem('__importQaSeeded', '1'); }
  }, seed);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (!/^(file|data|blob):/.test(request.url())) external.push(request.url()); });
  await page.goto(file); await page.waitForFunction(() => window.__app); await flush(page); await page.click('#tabbtn-log');
  return { page, context };
}
async function offer(page, input = fixture) {
  await page.setInputFiles('#importFile', asFile(input)); await page.waitForSelector('#importWarn');
}
const unchangedContext = (before, after) => ['owner', 'decisions', 'catalog', 'others', 'rack'].every((key) => equal(before[key], after[key]));
try {
  const { page, context } = await open(), before = await state(page);
  await offer(page);
  check(equal(before, await state(page)), '파일 선택만으로 기존 옷장 자료를 바꾸지 않음');
  check(await page.locator('#importAdd').innerText() === '기존 옷장에 추가 (1벌)', '기존 옷장에 추가할 새 옷 수 안내');
  await page.screenshot({ path: path.join(evidence, 'before-add.png'), fullPage: true });
  await page.click('#importCancel'); check(equal(before, await state(page)), '추가 취소가 모든 기존 자료를 보존');
  await offer(page); await page.click('#importAdd'); await flush(page); const added = await state(page);
  check(added.items.filter((it) => it.status === 'owned').length === 13 && added.items.filter((it) => it.status === 'candidate').length === 1, '기존 보유 13벌을 유지하고 후보 1벌만 추가');
  check(equal(before.items, added.items.slice(0, before.items.length)), '기존 13벌의 모든 필드가 그대로');
  check(unchangedContext(before, added), '주인·판정 기록·상품 목록·다른 옷장·걸린 자리 유지');
  const newItem = added.items.find((it) => it.id === candidate.id);
  check(newItem.status === 'candidate' && !newItem.product && !newItem.photo.img && !newItem.photo.ownImg && !newItem.look3d && newItem.price === null && newItem.checkedAt === '',
    '추가 후보는 미확인·사진 없음·3D 없음·가격 미확인 상태');
  await offer(page); check(await page.isDisabled('#importAdd') && (await page.locator('#importAdd').innerText()).includes('(0벌)'), '같은 파일을 다시 읽으면 중복 추가가 없음');
  await page.click('#importCancel'); check(equal(added, await state(page)), '중복 파일 선택과 취소가 기존 상태를 바꾸지 않음');
  const conflict = { schema: 2, kind: 'wardrobe', owner: { nickname: '덮어쓰면 안 되는 이름' },
    items: [{ ...base.items[0], name: '덮어쓰면 안 되는 옷', status: 'gone' }, candidate], decisions: [] };
  await offer(page, conflict); check(await page.isDisabled('#importAdd'), '기존 옷 번호를 가진 파일은 덮어쓰지 않고 중복으로 처리');
  await page.click('#importCancel'); check(equal(added, await state(page)), '다른 주인·기존 옷 수정값·빈 판정 기록이 섞여도 기존 상태 유지');
  const mixed = { ...conflict, items: [conflict.items[0], { ...candidate, id: 'qa-second-candidate', name: '합성 두 번째 후보' }] };
  await offer(page, mixed); await page.click('#importAdd'); await flush(page); const mixedAdded = await state(page);
  check(mixedAdded.items.length === added.items.length + 1 && equal(mixedAdded.items.slice(0, added.items.length), added.items) && unchangedContext(added, mixedAdded),
    '기존 옷 수정값과 새 옷이 섞인 파일에서도 새 옷만 추가');
  await page.reload(); await page.waitForFunction(() => window.__app); await flush(page); const again = await state(page);
  check(equal(again.items, mixedAdded.items) && unchangedContext(mixedAdded, again), '다시 열어도 추가한 후보와 기존 자료 유지');
  await page.click('#tabbtn-judge');
  check(await page.locator('#beforeForm').isVisible() && again.decisions.length === before.decisions.length, '보기 전 마음과 실제 결정 기록을 자동으로 만들지 않음');
  await page.screenshot({ path: path.join(evidence, 'candidate-before-intent.png'), fullPage: true });
  await context.close();
  {
    const { page, context } = await open(), before = await state(page);
    const large = { schema: 2, kind: 'wardrobe', owner: {}, items: Array.from({ length: 500 }, (_, i) => ({ ...candidate, id: 'qa-large-' + i })), decisions: [] };
    await offer(page, large);
    check(await page.isDisabled('#importAdd') && (await page.locator('main').innerText()).includes('500벌을 넘으면'), '합쳐 500벌을 넘으면 조용히 자르지 않고 추가를 막음');
    await page.click('#importCancel'); check(equal(before, await state(page)), '한도 초과 파일을 읽어도 기존 자료 유지');
    await context.close();
  }
  check(hash(fs.readFileSync(source)) === hash(sourceBytes), '검증에 쓴 원래 옷장 파일 SHA 불변');
  check(errors.length === 0, '브라우저 JavaScript 오류 없음', errors);
  check(external.length === 0, '외부 요청 없음', external);
} catch (error) { check(false, '검사 실행 오류', error.stack || String(error)); }
finally {
  await browser.close();
  const report = { page: file, sourceSha256: hash(sourceBytes), fixtureMode: process.env.CANDIDATE_FILE ? 'provided candidate file' : 'synthetic candidate',
    actualUserUsageRecorded: false, total: results.length, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results };
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ total: report.total, passed: report.passed, failed: report.failed })); if (report.failed) process.exitCode = 1;
}
