// 합성 자료·격리 브라우저만 쓴다. 실제 사용자 브라우저·개인 옷장·구매 결과는 변경하지 않는다.
// 파일 흐름: PAGE=dist/otjang-beta.html node tools/beta-check.mjs
// 인증 흐름 추가: 임시 QA DB의 BETA_BASE/BETA_INVITE/BETA_QA_ALLOW_REGISTER=1을 지정한다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url), W = require('../src/wardrobe.js'), C = require('../src/catalog.js');
const pageFile = path.resolve(root, process.env.PAGE || 'dist/otjang-beta.html');
const output = path.resolve(root, process.env.EVIDENCE || 'shots/beta'); fs.mkdirSync(output, { recursive: true });
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const results = [], errors = [], external = [], skipped = [], secrets = [process.env.BETA_INVITE].filter(Boolean);
const redact = (text) => secrets.reduce((out, value) => out.split(value).join('[비밀값 생략]'), String(text));
const check = (pass, label, detail) => { results.push({ pass: !!pass, label, ...(detail === undefined ? {} : { detail }) }); console.log((pass ? 'ok ' : 'FAIL ') + label); };
const equal = (a, b) => isDeepStrictEqual(a, b);
const photo = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
const makeItem = (id, cat, kind, extra = {}) => W.cleanItem({ id, status: 'owned', name: '합성 검증 ' + id, cat, kind,
  family: cat === 'bottom' ? 'navy' : 'white', light: cat === 'bottom' ? 20 : 80, formality: 2, pattern: 'solid',
  seasons: ['spring', 'summer', 'autumn', 'winter'], attrSource: 'owner-confirmed', ...extra }, 0);
const top = W.setOwnPhoto(makeItem('qa-top', 'top', 'shirt', { look3d: { kind: 'shirt', fabric: 'mine-stripe' } }), photo);
const bottom = makeItem('qa-bottom', 'bottom', 'chino');
const unknown = makeItem('qa-unknown', 'outer', 'jacket', { status: 'candidate', light: null, formality: null, pattern: null, seasons: [], attrSource: 'photo-draft', matchCandidates: [{ brand: '합성 후보 브랜드', name: '미확인 합성 제품', evidence: 'owner' }] });
const gone = makeItem('qa-gone', 'top', 'shirt', { status: 'gone' });
const base = { schema: 2, owner: { nickname: '합성 검증 옷장', height: 175, topSize: '검증용', bottomSize: '검증용' },
  items: [top, bottom], decisions: [], catalog: { products: [] }, others: [], rack: [{ id: top.id, slot: 4 }] };
const full = { ...base, items: [top, bottom, unknown, gone], catalog: C.cleanCatalog({ schema: 1, kind: 'catalog', products: [
  { id: 'qa-catalog', name: '합성 검증 상품', cat: 'outer', kind: 'jacket', family: 'beige', light: null, formality: null, pattern: null, seasons: [], price: 12000, checkedAt: '2026-10-13', img: photo },
] }), others: [W.cleanWardrobe({ schema: 2, owner: { nickname: '합성 비교 옷장' }, items: [bottom], decisions: [] })] };
const clone = (value) => JSON.parse(JSON.stringify(value));
const cleanSnapshot = (value) => { const out = clone(value); delete out.loadedFrom; delete out._storageRevision; return out; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
const snapshot = (page) => page.evaluate(() => window.__app.state);
const flush = (page) => page.evaluate(() => window.__app.flush());
const jsonFile = (value, name = 'synthetic-backup.json') => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
async function open(seed = null, url = pathToFileURL(pageFile).href) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  if (seed) await context.addInitScript((value) => { if (!localStorage.getItem('__betaQaSeeded')) { localStorage.setItem('otjang.v2', JSON.stringify(value)); localStorage.setItem('__betaQaSeeded', '1'); } }, seed);
  const allowed = /^https?:/.test(url) ? new URL(url).origin : null;
  await context.route('**/*', (route) => {
    const target = route.request().url();
    if (/^(file|data|blob):/.test(target) || (allowed && new URL(target).origin === allowed)) return route.continue();
    external.push(target); return route.abort();
  });
  const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url); await page.waitForFunction(() => window.__app); await flush(page);
  return { page, context };
}
async function reload(page) { await page.reload(); await page.waitForFunction(() => window.__app); await flush(page); }
async function fillChoice(page, id, preferences, text) {
  const locator = page.locator(id), type = await locator.evaluate((element) => element.tagName.toLowerCase());
  if (type === 'select') {
    const options = await locator.locator('option').evaluateAll((all) => all.filter((option) => option.value && !option.disabled).map((option) => option.value));
    const selected = preferences.find((value) => options.includes(value)) || options[0];
    if (!selected) throw new Error('선택 가능한 검증 항목이 없습니다: ' + id);
    await locator.selectOption(selected); return selected;
  }
  await locator.fill(text); return text;
}
async function offerBackup(page, value) {
  await page.click('#tabbtn-log'); const oldInput = await page.locator('#backupFile').elementHandle();
  await page.setInputFiles('#backupFile', jsonFile(value));
  await page.waitForFunction((element) => !element.isConnected, oldInput); await oldInput.dispose();
}
async function downloadBackup(page) {
  await page.click('#tabbtn-log'); const wait = page.waitForEvent('download'); await page.click('#fullBackupBtn');
  const download = await wait, target = path.join(output, 'synthetic-full-backup.json'); await download.saveAs(target);
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}
let localCompleted = false, authCompleted = false;
try {
  {
    const { page, context } = await open(); const state = await snapshot(page);
    check(state.items.length === 0 && state.decisions.length === 0 && state.catalog.products.length === 0, '빈 베타 빌드에 보유 옷·후보·결정·상품이 없음');
    await page.click('#tabbtn-judge');
    check(await page.locator('#firstCompare').isVisible(), 'Claude 화면의 판단 탭에서 첫 구매 비교 시작 버튼을 볼 수 있음');
    await page.click('#firstCompare'); await flush(page);
    check((await snapshot(page)).decisions.length === 0, '구매 비교 시작 버튼은 실제 구매 결정을 만들지 않음');
    await context.close();
  }
  {
    const { page, context } = await open(base);
    if (await page.locator('#firstCompare').count() && await page.locator('#firstCompare').isVisible()) {
      await page.click('#firstCompare');
      if (await page.locator('#quickCancel').isVisible()) await page.click('#quickCancel');
    }
    await page.click('#tabbtn-judge'); await page.click('#quickCandidate');
    await page.fill('#q-name', '합성 구매 비교 후보'); await page.selectOption('#q-cat', 'outer'); await page.selectOption('#q-kind', 'jacket');
    await page.selectOption('#q-family', 'beige'); await page.fill('#q-light', '');
    await page.uncheck('#q-confirmed'); await page.click('#quickSave'); await flush(page);
    const added = await snapshot(page), candidate = added.items.find((item) => item.name === '합성 구매 비교 후보');
    check(candidate?.status === 'candidate' && candidate.light === null && candidate.attrSource !== 'owner-confirmed', '확인 전 후보는 밝기 모름·미확인 상태로 저장');
    check(added.decisions.length === 0, '후보 등록만으로 보기 전 마음·결정·후속 기록을 만들지 않음');
    await page.check('input[name="lean"][value="unsure"]'); await page.fill('#beforeReason', '합성 검증: 기존 옷과 어울릴지 모름'); await page.click('#showVerdict'); await flush(page);
    check(await page.locator('#vPending').isVisible(), '후보 속성 미확인일 때 계산 전 확인 화면 표시');
    const pending = await page.evaluate((id) => window.__app.J.judgeCandidate(window.__app.state.items, window.__app.state.items.find((item) => item.id === id)), candidate.id);
    check(pending.status === 'needs-confirmation' && pending.before === null && pending.after === null && pending.added.length === 0, '모르는 속성으로 확정 조합 수를 만들지 않음');
    await page.click('#confirmCandidate'); await page.fill('#q-light', '60'); await page.selectOption('#q-formality', '2'); await page.selectOption('#q-pattern', 'solid'); await page.check('#q-confirmed');
    await page.click('#quickSave'); await flush(page);
    check((await snapshot(page)).items.find((item) => item.id === candidate.id).attrSource === 'owner-confirmed', '사용자가 확인한 후보만 확인 상태로 변경');
    await page.waitForSelector('#afterForm');
    check((await snapshot(page)).decisions.filter((decision) => decision.after).length === 0, '판정 확인 이후에도 결정은 직접 제출 전 0건');
    await page.check('input[name="decision"][value="hold"]'); await page.check('input[name="helpful"][value="some"]');
    await page.fill('#afterNote', '합성 QA 결정. 실제 구매 결과가 아님');
    const insight = await fillChoice(page, '#afterInsight', [], '합성 QA: 새 조합의 근거를 이해함');
    const comparedWith = await fillChoice(page, '#afterComparedWith', ['shopping', 'none'], '합성 비교');
    await page.fill('#afterComparisonNote', '합성 QA 비교 메모'); await page.click('#saveDecision'); await flush(page);
    const decided = await snapshot(page), decision = decided.decisions.find((entry) => entry.itemId === candidate.id && entry.after);
    check(decision?.after.decision === 'hold' && decision.after.insight === insight && decision.after.comparedWith === comparedWith, '직접 제출한 결정·얻은 정보·비교 대상을 기록');
    check(!decision.followup, '결정을 기록해도 실제 구매·착용·후회 결과를 자동 생성하지 않음');
    const beforeFollowupBackup = await downloadBackup(page); await offerBackup(page, beforeFollowupBackup);
    check(await page.locator('#backupRestoreConfirm').count() === 1, '후속 결과를 아직 적지 않은 결정도 자신이 받은 전체백업으로 복원 가능');
    await page.click('#backupRestoreCancel'); await page.click('#tabbtn-judge');
    const outcome = await fillChoice(page, '#followupOutcome', ['not-purchased', 'not-bought', 'not_bought', 'held', 'hold'], '합성 결과');
    const worn = await fillChoice(page, '#followupWorn', ['unknown', 'no'], '0');
    const regret = await fillChoice(page, '#followupRegret', ['unknown', 'none'], '확인하지 않음');
    await page.fill('#followupNote', '합성 QA 후속 기록. 실제 사용 성과가 아님'); await page.click('#saveFollowup'); await flush(page);
    const followed = await snapshot(page), stored = followed.decisions.find((entry) => entry.id === decision.id);
    check(stored.followup?.outcome === outcome && stored.followup.worn === worn && stored.followup.regret === regret && stored.followup.note.includes('합성 QA'), '직접 제출한 후속 결과만 기록');
    fs.writeFileSync(path.join(output, 'synthetic-decisions-before-reload.json'), JSON.stringify(followed.decisions, null, 2) + '\n');
    await reload(page); const reopened = await snapshot(page);
    fs.writeFileSync(path.join(output, 'synthetic-decisions-after-reload.json'), JSON.stringify(reopened.decisions, null, 2) + '\n');
    check(equal(reopened.decisions, followed.decisions), '재실행 후 결정·얻은 정보·후속 기록 보존');
    const backup = await downloadBackup(page);
    check(equal(backup.state.decisions, followed.decisions) && backup.state.betaTrial != null, '전체백업에 판단·후속 기록과 체험 기록 포함');
    const oldFollowupBackup = clone(backup);
    for (const d of oldFollowupBackup.state.decisions) if (d.followup) { delete d.followup.sizeResult; delete d.followup.returnReason; }
    await offerBackup(page, oldFollowupBackup);
    check(await page.locator('#backupRestoreConfirm').count() === 1 && equal((await snapshot(page)).decisions, followed.decisions), '이전 전체백업의 새 후속 선택 키 누락을 호환하고 현재 기록은 파일 선택만으로 바꾸지 않음');
    await page.click('#backupRestoreConfirm'); await flush(page);
    check(equal((await snapshot(page)).decisions, followed.decisions), '이전 후속 백업 복원 시 sizeResult·returnReason의 missing 기본값만 채워 메모와 판정을 보존');
    await page.screenshot({ path: path.join(output, 'synthetic-purchase-flow.png'), fullPage: true }); await context.close();
  }
  {
    const { page, context } = await open(full);
    const backup = await downloadBackup(page); await flush(page);
    const initial = cleanSnapshot(await snapshot(page));
    check(backup.kind === 'otjang-backup' && backup.version === 1, '공유용 옷장 내보내기와 다른 전체백업 형식');
    check(['owned', 'candidate', 'gone'].every((status) => backup.state.items.some((item) => item.status === status)), '전체백업에 보유·후보·처분한 옷 모두 포함');
    check(equal(backup.state.items, initial.items) && equal(backup.state.catalog, initial.catalog) && equal(backup.state.others, initial.others) && equal(backup.state.rack, initial.rack), '전체백업에 사진·미확인 속성·상품 목록·비교 옷장·3D 자리 유지');
    const protectedContent = JSON.stringify(backup);
    check(!/"(?:token|password|inviteCode|_storageRevision)"\s*:/.test(protectedContent), '전체백업에 인증 비밀값·저장 순서 메타데이터 없음');
    await offerBackup(page, backup); check(equal(cleanSnapshot(await snapshot(page)), initial), '복원 파일 선택만으로 기존 자료를 변경하지 않음');
    await page.click('#backupRestoreCancel'); check(equal(cleanSnapshot(await snapshot(page)), initial), '전체백업 복원 취소는 전체 상태 보존');
    const legacy = clone(backup);
    for (const key of ['meta', 'prefs', 'pickLog', 'betaTrial', 'syncStamp']) delete legacy.state[key];
    for (const d of legacy.state.decisions) { delete d.follow; if (d.followup === null) delete d.followup; }
    await offerBackup(page, legacy);
    check(await page.locator('#backupRestoreConfirm').count() === 1, '이전 버전 전체백업의 선택 항목이 없어도 복원 확인 가능');
    await page.click('#backupRestoreCancel');
    check(equal(cleanSnapshot(await snapshot(page)), initial), '이전 버전 백업 확인·취소가 현재 추천 설정과 자료를 바꾸지 않음');
    for (const future of [
      { ...clone(backup), version: 2 },
      { ...clone(backup), state: { ...clone(backup.state), schema: 3 } },
      { ...clone(backup), state: { ...clone(backup.state), catalog: { ...clone(backup.state.catalog), schema: 2 } } },
      { ...clone(backup), state: { ...clone(backup.state), others: [{ schema: 3, items: [], decisions: [] }] } }
    ]) {
      await offerBackup(page, future);
      check(await page.locator('#backupRestoreConfirm').count() === 0 && equal(cleanSnapshot(await snapshot(page)), initial) && (await page.locator('#backupRestoreMessage').innerText()).includes('새 버전'), '미래 전체·중첩 스키마를 복원 정리 전에 거부하고 현재 자료 보존');
    }
    const revised = clone(backup); revised.state.owner.nickname = '복원 검증 이름'; revised.state.items[0].review = '복원 검증 기록';
    await offerBackup(page, revised); await page.click('#backupRestoreConfirm'); await flush(page);
    const restored = cleanSnapshot(await snapshot(page));
    check(restored.owner.nickname === revised.state.owner.nickname && restored.items[0].review === revised.state.items[0].review && equal(restored.items.slice(1), initial.items.slice(1)), '확인 후 전체복원은 수정한 기록과 나머지 옷을 보존');
    await reload(page); check(equal(cleanSnapshot(await snapshot(page)), restored), '전체복원 후 재실행은 같은 상태');
    await offerBackup(page, { kind: 'wardrobe', schema: 2, items: [] });
    check(await page.locator('#backupRestoreConfirm').count() === 0 && equal(cleanSnapshot(await snapshot(page)), restored), '공유용 옷장 파일을 전체백업 복원으로 오인하지 않음');
    await offerBackup(page, { kind: 'otjang-backup', version: 1, state: { schema: 2, items: '손상' } });
    check(await page.locator('#backupRestoreConfirm').count() === 0 && equal(cleanSnapshot(await snapshot(page)), restored), '손상된 전체백업이 기존 자료를 바꾸지 않음');
    const overLimit = clone(backup); overLimit.state.items = Array.from({ length: 501 }, (_, index) => ({ ...top, id: 'qa-large-' + index }));
    await offerBackup(page, overLimit);
    check(await page.locator('#backupRestoreConfirm').count() === 0 && equal(cleanSnapshot(await snapshot(page)), restored), '옷 한도 초과 백업을 조용히 잘라 복원하지 않음');
    await page.setViewportSize({ width: 390, height: 844 }); await page.click('#tabbtn-log');
    check(await page.locator('#fullBackupBtn').isVisible(), '모바일 화면에서 전체백업 버튼 접근 가능');
    await page.screenshot({ path: path.join(output, 'synthetic-backup-mobile.png'), fullPage: true }); await context.close();
  }
  {
    const { page, context } = await open(full);
    const backup = await downloadBackup(page); await flush(page);
    const initial = cleanSnapshot(await snapshot(page)); backup.state.owner.nickname = '저장 실패로 복원하면 안 되는 이름';
    await offerBackup(page, backup);
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put, setItem = Storage.prototype.setItem;
      IDBObjectStore.prototype.put = function (...args) { const request = put.apply(this, args); if (args[1] === 'state') this.transaction.abort(); return request; };
      Storage.prototype.setItem = function (key, value) { if (this === localStorage && key === 'otjang.v2') throw new DOMException('합성 QA 저장 실패', 'QuotaExceededError'); return setItem.call(this, key, value); };
    });
    await page.click('#backupRestoreConfirm'); await flush(page);
    check(equal(cleanSnapshot(await snapshot(page)), initial) && (await page.locator('#backupRestoreMessage').innerText()).includes('취소'), '전체복원 저장이 두 저장소에서 실패하면 성공 안내 없이 원래 상태로 돌아감');
    await reload(page); check(equal(cleanSnapshot(await snapshot(page)), initial), '복원 저장 실패 후 재실행해도 기존 영구 기록 보존');
    await context.close();
  }
  localCompleted = true;
  if (process.env.BETA_BASE) {
    const address = new URL(process.env.BETA_BASE);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname) || address.protocol !== 'http:') throw new Error('인증 QA는 이 PC의 격리 임시 서버에서만 실행합니다.');
    if (process.env.BETA_QA_ALLOW_REGISTER !== '1' || !process.env.BETA_INVITE) throw new Error('인증 QA에는 임시 QA DB·BETA_QA_ALLOW_REGISTER=1·BETA_INVITE가 필요합니다. 사용자 DB를 대상으로 실행하지 마세요.');
    const baseUrl = address.origin, { page, context } = await open(base, process.env.BETA_URL || baseUrl + '/');
    const suffix = crypto.randomBytes(6).toString('hex'), username = 'qa_a_' + suffix, secondUser = 'qa_b_' + suffix;
    const password = crypto.randomBytes(24).toString('base64url'); secrets.push(password);
    const versions = new Map();
    const request = async (method, suffix, data, token, options = {}) => {
      const headers = token ? { Authorization: 'Bearer ' + token } : {};
      if (method === 'POST' && /^\/api\/(wardrobe\/import|catalog\/import|backup\/restore)$/.test(suffix)) {
        if (options.contract !== null) headers['X-Eoul-Contract'] = String(options.contract ?? 2);
        const version = Object.hasOwn(options, 'ifMatch') ? options.ifMatch : versions.get(token);
        if (version != null) headers['If-Match'] = '"' + version + '"';
      }
      const response = await context.request.fetch(baseUrl + suffix, { method, headers, ...(data ? { data } : {}) });
      const next = response.headers()['x-wardrobe-version']; if (token && typeof next === 'string' && /^\d+$/.test(next)) versions.set(token, next);
      return response;
    };
    check((await request('GET', '/api/wardrobe')).status() === 401, '인증 없는 옷장 읽기는 401');
    const capabilities = await request('GET', '/api/meta'), meta = await capabilities.json();
    check(capabilities.ok() && meta.contract === 2 && meta.wardrobeSchema === 2 && meta.followup?.outcomes.includes('returned') && meta.followup?.sizeResults.includes('right'), '공개 서버 지원 정보가 계약 2·반품·사이즈를 명시');
    check((await request('POST', '/api/wardrobe/import', full)).status() === 401, '인증 없는 옷장 쓰기는 401');
    check((await request('GET', '/api/wardrobe', null, 'invalid-qa-token')).status() === 401, '잘못된 토큰으로 접근 거절');
    check((await request('POST', '/api/auth/register', { username, password, inviteCode: 'invalid-qa-invite' })).status() === 403, '틀린 초대 코드로 가입 거절');
    const firstResponse = await request('POST', '/api/auth/register', { username, password, inviteCode: process.env.BETA_INVITE });
    check(firstResponse.ok(), '격리 QA DB에서 올바른 초대 코드로 합성 계정 생성');
    const first = await firstResponse.json(); secrets.push(first.token);
    const secondResponse = await request('POST', '/api/auth/register', { username: secondUser, password, inviteCode: process.env.BETA_INVITE });
    if (!secondResponse.ok()) throw new Error('두 번째 합성 QA 계정을 만들지 못했습니다.');
    const second = await secondResponse.json(); secrets.push(second.token);
    check(first.user.ownerId !== second.user.ownerId && (await (await request('GET', '/api/wardrobe', null, first.token)).json()).items.length === 0, '합성 계정마다 다른 소유자와 빈 서버 옷장');
    check((await request('POST', '/api/wardrobe/import', full, first.token, { contract: null })).status() === 409 && (await (await request('GET', '/api/wardrobe', null, first.token)).json()).items.length === 0, '구 클라이언트 계약 헤더가 없으면 전체 쓰기를 거부하고 빈 서버 자료 유지');
    check((await request('POST', '/api/wardrobe/import', full, first.token, { ifMatch: null })).status() === 428, '전체 서버 자료 변경은 확인한 버전 헤더 없으면 428로 거절');
    const validWebp = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#80a0c0'; ctx.fillRect(0, 0, 2, 2); return canvas.toDataURL('image/webp'); });
    const serverFull = clone(full); serverFull.items[0] = W.setOwnPhoto(serverFull.items[0], validWebp); serverFull.catalog.products[0].img = validWebp;
    serverFull.decisions = JSON.parse(fs.readFileSync(path.join(output, 'synthetic-decisions-after-reload.json'), 'utf8')).map((decision) => ({ ...decision, itemId: unknown.id, name: unknown.name }));
    check((await request('POST', '/api/wardrobe/import', serverFull, first.token)).ok(), '브라우저가 생성한 WebP 사진·미확인 후보를 포함한 합성 옷장 서버 저장 성공');
    check((await request('POST', '/api/catalog/import', serverFull.catalog, first.token)).ok(), 'WebP 상품 사진·모르는 속성을 포함한 합성 상품 목록 서버 저장 성공');
    const firstStored = await (await request('GET', '/api/wardrobe?photos=true', null, first.token)).json();
    check(firstStored.items.find((item) => item.id === top.id)?.photo.ownImg === validWebp, '앱이 사용하는 WebP 사진을 서버에 저장한 뒤 같은 바이트로 읽음');
    check(equal(firstStored.decisions, serverFull.decisions), '새 평가·후속 기록을 실제 서버에 저장하고 값 손실 없이 받음');
    check((await request('POST', '/api/wardrobe/import', full, first.token, { ifMatch: '0' })).status() === 409, '오래된 서버 버전의 전체 보내기는 409로 거절');
    check((await (await request('GET', '/api/wardrobe', null, second.token)).json()).items.length === 0, '다른 인증 소유자의 옷장에 첫 소유자 자료가 보이지 않음');
    check((await request('GET', '/api/items/' + top.id, null, second.token)).status() === 404, '다른 소유자의 옷 번호를 알아도 개별 옷·사진을 읽을 수 없음');
    await page.click('#tabbtn-log'); const beforeLogin = cleanSnapshot(await snapshot(page));
    await page.fill('#syncUser', username); await page.fill('#syncPassword', password); await page.click('#syncLogin');
    await page.waitForFunction(() => document.querySelector('#syncLogout') && !document.querySelector('#syncLogout').disabled); await flush(page);
    check((await snapshot(page)).items.length === 0, '로그인할 때 개인 브라우저 옷장을 새 소유자 서버로 자동 전송하지 않음');
    await page.click('#syncPull'); await page.waitForSelector('#pullGo');
    check((await snapshot(page)).items.length === 0, '인증 후 서버에서 받기도 확인 전 로컬 자료를 바꾸지 않음');
    await page.click('#pullGo'); await flush(page);
    check((await snapshot(page)).items.length === full.items.length, '확인 후 로그인한 소유자의 서버 옷장을 받음');
    await page.click('#syncPush'); await page.waitForFunction(() => document.querySelector('#syncMsg')?.textContent.includes('보냈습니다'));
    check((await (await request('GET', '/api/wardrobe', null, first.token)).json()).items.length === full.items.length, 'UI 인증 후 같은 주소의 실제 서버 보내기 성공');
    const serverDownloadWait = page.waitForEvent('download'); await page.click('#serverBackupBtn');
    const serverDownload = await serverDownloadWait, serverBackupPath = path.join(output, 'synthetic-server-backup.json'); await serverDownload.saveAs(serverBackupPath);
    const serverBackup = JSON.parse(fs.readFileSync(serverBackupPath, 'utf8'));
    check(serverBackup.kind === 'otjang-server-backup' && serverBackup.schema === 1 && serverBackup.wardrobe.items.length === full.items.length && equal(serverBackup.wardrobe.decisions, serverFull.decisions) && serverBackup.catalog.products.length === 1, 'UI에서 현재 계정 옷·사진·평가·후속 기록·상품의 서버 전체백업 받기');
    const offerServerBackup = async (value) => {
      const oldInput = await page.locator('#serverBackupFile').elementHandle(); await page.setInputFiles('#serverBackupFile', jsonFile(value, 'synthetic-server-backup.json'));
      await page.waitForFunction((element) => !element.isConnected, oldInput); await oldInput.dispose();
    };
    const beforeServerRestore = await (await request('GET', '/api/wardrobe', null, first.token)).json();
    await offerServerBackup(serverBackup);
    check(await page.locator('#serverRestoreConfirm').count() === 1 && equal(await (await request('GET', '/api/wardrobe', null, first.token)).json(), beforeServerRestore), '서버 백업 선택만으로 현재 계정 자료를 바꾸지 않음');
    await page.click('#serverRestoreCancel');
    check(equal(await (await request('GET', '/api/wardrobe', null, first.token)).json(), beforeServerRestore), '서버 백업 복원 취소가 계정 자료를 보존');
    const amendedServerBackup = clone(serverBackup); amendedServerBackup.wardrobe.items[0].review = '합성 QA 서버 복원 검증';
    const browserItemsBeforeRestore = clone((await snapshot(page)).items);
    await page.uncheck('#syncPhotos');
    await offerServerBackup(amendedServerBackup); await page.click('#serverRestoreConfirm');
    await page.waitForFunction(() => document.querySelector('#syncMsg')?.textContent.includes('서버 계정 백업을 복원했습니다'));
    const serverRestored = await (await request('GET', '/api/wardrobe', null, first.token)).json();
    check(serverRestored.items[0].review === '합성 QA 서버 복원 검증' && equal(serverRestored.decisions, serverBackup.wardrobe.decisions) && equal((await snapshot(page)).items, browserItemsBeforeRestore), '사진 제외 서버 복원은 허용 키만 보내며 계정 결과·브라우저 옷장 보존');
    await offerServerBackup({ schema: 2, kind: 'wardrobe', items: [] });
    check(await page.locator('#serverRestoreConfirm').count() === 0, '공유용 옷장 파일을 서버 전체백업으로 오인하지 않음');
    const beforeFutureServer = await (await request('GET', '/api/wardrobe', null, first.token)).json();
    await offerServerBackup({ ...clone(serverBackup), wardrobe: { ...clone(serverBackup.wardrobe), schema: 3 } });
    check(await page.locator('#serverRestoreConfirm').count() === 0 && equal(await (await request('GET', '/api/wardrobe', null, first.token)).json(), beforeFutureServer) && (await page.locator('#syncMsg').innerText()).includes('새 버전'), '미래 중첩 옷장 스키마의 계정 백업은 서버 복원 전에 거부하고 서버 기록 보존');
    const beforeFailure = cleanSnapshot(await snapshot(page));
    await page.route(baseUrl + '/api/wardrobe/import', (route) => route.fulfill({ status: 401, contentType: 'application/problem+json', body: JSON.stringify({ status: 401, detail: '합성 QA 세션 거절' }) }));
    await page.click('#syncPush'); await page.waitForFunction(() => document.querySelector('#syncMsg')?.textContent.includes('401'));
    check(equal(cleanSnapshot(await snapshot(page)), beforeFailure), '서버가 인증 요청을 거절해도 현재 로컬 옷장·결정·후속 기록 보존');
    await page.unroute(baseUrl + '/api/wardrobe/import');
    await page.click('#syncLogout'); await flush(page);
    check(equal(cleanSnapshot(await snapshot(page)), beforeLogin), '로그아웃하면 원래 개인 브라우저 옷장으로 복귀');
    const storedSecrets = await page.evaluate(() => ({ state: JSON.stringify(window.__app.state), ls: JSON.stringify(Object.entries(localStorage)) }));
    check(!storedSecrets.state.includes(password) && !storedSecrets.state.includes(first.token) && !storedSecrets.ls.includes(password) && !storedSecrets.ls.includes(first.token), '앱 상태·localStorage에 인증 비밀값 없음');
    await request('POST', '/api/auth/logout', null, first.token);
    check((await request('GET', '/api/wardrobe', null, first.token)).status() === 401, '서버 로그아웃한 토큰은 재사용 불가');
    await page.fill('#syncUser', secondUser); await page.fill('#syncPassword', password); await page.click('#syncLogin'); await page.waitForSelector('#syncLogout');
    await page.locator('#deleteAccountDetails summary').click(); await page.fill('#deleteAccountPassword', password);
    check((await request('GET', '/api/auth/me', null, second.token)).status() === 200, '계정 삭제 폼 입력만으로 합성 QA 계정을 삭제하지 않음');
    await page.check('#deleteAccountConfirm'); await page.click('#deleteAccountSubmit');
    await page.waitForFunction(() => document.querySelector('#syncMsg')?.textContent.includes('계정과 서버 자료'));
    check((await request('GET', '/api/auth/me', null, second.token)).status() === 401 && equal(cleanSnapshot(await snapshot(page)), beforeLogin), '명시적 재인증·확인 후 합성 계정 삭제와 원래 개인 옷장 보존');
    await context.close(); authCompleted = true;
  } else skipped.push('실제 인증 서버·같은 주소 연결: BETA_BASE 미지정. 이 결과만으로 인증 출시 검증을 완료로 쓰지 않음');
  check(errors.length === 0, '브라우저 JavaScript 오류 없음', errors);
  check(external.length === 0, '허용한 로컬 주소 밖 요청 없음', external);
} catch (error) { check(false, '검사 실행 오류', redact(error.message)); }
finally {
  await browser.close();
  const report = { page: pageFile, pageSha256: fs.existsSync(pageFile) ? sha(fs.readFileSync(pageFile)) : null, fixtureMode: 'synthetic QA only',
    actualUserUsageRecorded: false, actualPurchaseDecisionRecorded: false, privateWardrobeFileChanged: false,
    localCompleted, authCompleted, skipped, total: results.length, passed: results.filter((item) => item.pass).length, failed: results.filter((item) => !item.pass).length, results };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ total: report.total, passed: report.passed, failed: report.failed, localCompleted, authCompleted, skipped }));
  if (report.failed || (process.env.BETA_REQUIRE_AUTH === '1' && !authCompleted)) process.exitCode = 1;
}
