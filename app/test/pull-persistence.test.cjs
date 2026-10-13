// Real pull apply, queue, account/logout and HTTP orchestration; only browser,
// HTTP and storage adapters are synthetic. This is not a browser/device E2E.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const W = require('../src/wardrobe.js'), C = require('../src/catalog.js'), SY = require('../src/sync.js'), B = require('../src/beta.js');
const html = fs.readFileSync(__dirname + '/../src/app.html', 'utf8'), beta = fs.readFileSync(__dirname + '/../src/beta-ui.js', 'utf8');
const part = (source, first, end) => { const a = source.indexOf(first), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a); return source.slice(a, b); };
const production = part(html, '  function save() {', '\n  const owned =') + '\n' +
  part(html, '  async function syncFetch(', '\n  // ---------- 편집 창') + '\n' +
  part(beta, 'async function leaveAccount(', 'async function authenticate(') + '\n' + part(html, '  function hang(', '  function renderCloset3d(') + '\n' + part(html, '  function capacityCounts(', '  function canImportReplace(') + '\n' + part(html, '  function replaceItem(', '\n  const B = Beta;') + '\n' + part(beta, 'const FOLLOWUP_OUTCOMES', 'function renderFullBackup(');
const clone = (value) => JSON.parse(JSON.stringify(value));
const origin = 'http://127.0.0.1:8124', keyA = 'account:' + origin + ':77';
const photo = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
const meta = { contract: 2, wardrobeSchema: 2, followup: { outcomes: ['purchased', 'not-purchased', 'pending', 'returned'], sizeResults: ['right', 'small', 'large', 'unknown'], returnReasons: ['size', 'fit', 'color', 'material', 'quality', 'changed', 'price', 'other', 'unknown'] } };
const item = (id, name) => W.cleanItem({ id, name, cat: 'top', brand: name, price: 20000 }, 0);
const decision = (id, reason) => W.cleanDecision({ id, itemId: 'common', name: reason, before: { lean: 'unsure', reason, at: '2026-10-12' }, after: { decision: 'hold', note: reason, at: '2026-10-12' }, followup: null });
const product = (id, name) => C.cleanProduct({ id, name, cat: 'top', brand: name, note: name, price: 10000 }, 0);
function wardrobe(name, remote = false) {
  const data = W.cleanWardrobe({ schema: 2, owner: { nickname: name }, items: [item('common', name), item(remote ? 'server-only' : 'local-only', name)], decisions: [decision('decision-common', name), decision(remote ? 'server-decision' : 'local-decision', name)] });
  return { ...data, rack: [{ id: 'common', slot: 0 }], catalog: { products: [product('product-common', name), product(remote ? 'server-product' : 'local-product', name)], note: '개인 상품 설정' },
    prefs: { style: 'classic' }, pickLog: [], meta: { installId: 'synthetic-pull' }, syncStamp: { origin, ownerId: 77, version: 7 },
    syncFollowupAck: SY.makeFollowupAck({ origin, ownerId: 77, serverVersion: 7, capture: 'pull', completeSnapshot: true }, data.decisions.filter((d) => d.id === 'decision-common')) };
}
function harness(options = {}) {
  const target = wardrobe('로컬 A'), remote = wardrobe('서버 A', true), personal = wardrobe('개인'), nodes = new Map(), buttons = [], calls = [], rows = new Map();
  personal.syncStamp = null; personal.syncFollowupAck = null;
  if (options.prepareLocal) options.prepareLocal(target); if (options.prepareRemote) options.prepareRemote(remote);
  const stored = JSON.stringify({ ...target, _storageRevision: 1 }); rows.set(keyA, stored); rows.set('state', JSON.stringify({ ...personal, _storageRevision: 0 }));
  const source = { origin, ownerId: 77 }, context = { source, discovery: { status: 200, meta }, serverVersion: 7, completeIncoming: true, resolutions: {} };
  const ui = { syncBase: origin, syncOrigin: origin, syncScope: keyA, syncToken: 'synthetic-token', syncUserInfo: { ownerId: 77, username: 'A' }, syncVersion: 7, syncPhotos: false, syncMsg: '기존 안내', syncProtectionBlocked: true, stageSel: 'initial-stage', localBeforeLogin: personal,
    pullArm: { w: remote, c: remote.catalog, version: 7, context, rawDecisions: remote.decisions, plan: SY.checkPullProtection(target.decisions, remote.decisions, { ...context, ack: target.syncFollowupAck }) } };
  const store = { db: {}, mode: 'idb', revision: 1, persistedSnapshots: new Map([[keyA, { idbValue: stored, lsValue: null }], ['state', { idbValue: rows.get('state'), lsValue: null }]]), conflicts: new Set(), recoveryByScope: new Map() };
  let releaseFirst, resolveLogout, logoutStarted = false, renders = 0;
  const note = { textContent: '', classList: { toggle() {} } };
  const ctx = vm.createContext({ state: target, storageOk: true, savePromise: Promise.resolve(), ui, store, W, C, SY, B, str: W.str, BRAND: {}, YEAR: 2026, AbortController, setTimeout, clearTimeout,
    accountScope: () => ui.syncScope || 'state', localStorageKey: () => 'local:' + (ui.syncScope || 'state'), window: { localStorage: {} }, navigator: { locks: {} },
    kvGet: async (key) => rows.get(key) ?? null, lsSnapshot: () => null, $: () => note,
    SC: { commitSnapshot: async (o) => {
      calls.push(o); const n = calls.length;
      if (n === 1 && options.gate !== false) await new Promise((resolve) => { releaseFirst = resolve; });
      const outcome = options.outcomes?.[n - 1] || (n === 1 ? options.first || 'true' : n === (options.repairAt || 3) ? options.repair || 'true' : 'true');
      if (outcome === 'throw') throw new Error('synthetic storage rejection');
      if (outcome === 'false' || outcome === 'conflict') return { ok: false, conflict: outcome === 'conflict', mode: 'idb' };
      assert.equal(o.expectedIdb, rows.get(o.idbKey) ?? null, 'CAS uses last successful raw for this exact key');
      assert.equal(o.expectedLs, null); rows.set(o.idbKey, o.data);
      return { ok: true, mode: 'idb', idbValue: o.data, lsValue: null };
    } },
    fetch: async (url) => { assert.equal(new URL(url).pathname, '/api/auth/logout'); logoutStarted = true; await new Promise((resolve) => { resolveLogout = resolve; }); return new Response('{}', { headers: { 'X-Wardrobe-Version': '7' } }); },
    h: (tag, props, ...children) => { const node = { tag, props, value: props?.value || '', hidden: !!props?.hidden, children, append(...entries) { children.push(...entries); }, addEventListener() {} }; if (props?.id) nodes.set(props.id, node); if (tag === 'button') buttons.push(node); return node; },
    renderAccount() {}, toast() {}, render() { renders++; }, defaultRack: () => [], today: () => '2026-10-13', download() {}, followupLabel() {}, followupDetails() {} });
  ctx.optionSelect = (id, dictionary, value) => ctx.h('select', { id, value: value || '' });
  vm.runInContext(production, ctx);
  const until = async (predicate) => { for (let i = 0; i < 50 && !predicate(); i++) await new Promise((r) => setImmediate(r)); assert.ok(predicate(), 'production operation reached adapter'); };
  const start = () => { ctx.renderSync(); const go = nodes.get('pullGo'); assert.equal(go.props.onclick, ctx.applySyncPull); return go.props.onclick(); };
  const switchState = (next, scope = 'state', ownerId = null) => {
    ctx.state = next; ui.syncScope = scope; ui.syncOrigin = scope === 'state' ? '' : origin; ui.syncToken = scope === 'state' ? '' : 'new-token'; ui.syncUserInfo = ownerId ? { ownerId, username: 'B' } : null; ui.syncVersion = null; ui.syncMsg = '새 상태 안내'; ui.stageSel = 'new-stage'; ui.pullArm = null; ui.syncProtectionBlocked = true;
    if (!rows.has(scope)) { rows.set(scope, null); store.persistedSnapshots.set(scope, { idbValue: null, lsValue: null }); }
  };
  return { ctx, ui, store, target, remote, personal, calls, rows, nodes, buttons, note, start, until, switchState, release: () => releaseFirst(), logoutStarted: () => logoutStarted, finishLogout: () => resolveLogout(), renders: () => renders, persisted: (key = keyA) => JSON.parse(rows.get(key)) };
}

test('실제 pull 성공은 한 번 저장한 원격 snapshot·ack를 표시한다', async () => {
  const t = harness(), pending = t.start(); await t.until(() => t.calls.length === 1); t.release();
  assert.equal(await pending, true); assert.equal(t.calls.length, 1);
  assert.deepEqual(t.persisted().items.map((i) => i.id), ['common', 'server-only']);
  assert.equal(t.persisted().syncFollowupAck.capture, 'pull'); assert.match(t.ui.syncMsg, /서버에서 받았습니다/); assert.equal(t.ui.pullSaving, null);
});
for (const first of ['false', 'throw']) test('실제 pull ' + first + ': 뒤 저장이 없으면 적용한 값만 취소한다', async () => {
  const t = harness({ first }), before = clone(t.target), pending = t.start(); await t.until(() => t.calls.length === 1); t.release();
  assert.equal(await pending, false); assert.equal(t.ctx.state, t.target); assert.deepEqual(clone(t.ctx.state), before); assert.equal(t.calls.length, 1); assert.doesNotMatch(t.ui.syncMsg, /서버에서 받았습니다/);
});
for (const first of ['true', 'false', 'throw']) test('실제 logout 네트워크 대기→pull ' + first + ': 개인 state·UI를 이전 계정이 덮지 않는다', async () => {
  const t = harness({ first }), logout = t.ctx.leaveAccount(true); await t.until(t.logoutStarted);
  const pending = t.start(); await t.until(() => t.calls.length === 1); t.finishLogout(); await logout;
  const personalBefore = clone(t.ctx.state), msg = t.ui.syncMsg; assert.equal(t.ctx.state, t.personal);
  t.release(); await pending;
  assert.equal(t.ctx.state, t.personal); assert.deepEqual(clone(t.ctx.state), personalBefore); assert.equal(t.ui.syncScope, ''); assert.equal(t.ui.syncVersion, null); assert.equal(t.ui.syncMsg, msg);
  await t.ctx.save(); assert.equal(t.persisted('state').owner.nickname, '개인');
});
for (const first of ['true', 'false', 'throw']) test('실제 pull ' + first + ': 대기 중 다른 계정 state·선택을 보존한다', async () => {
  const t = harness({ first }), pending = t.start(); await t.until(() => t.calls.length === 1);
  const next = wardrobe('계정 B'); t.switchState(next, 'account:' + origin + ':88', 88); const nextBefore = clone(next);
  t.release(); await pending;
  assert.equal(t.ctx.state, next); assert.deepEqual(clone(next), nextBefore); assert.equal(t.ui.syncVersion, null); assert.equal(t.ui.syncMsg, '새 상태 안내'); assert.equal(t.ui.stageSel, 'new-stage'); assert.equal(t.ui.syncProtectionBlocked, true);
});

test('pull 실패 동안 옷·사진·판정·상품·owner·설정 편집과 신규 기록을 모두 보존한다', async () => {
  const t = harness({ first: 'false' }), pending = t.start(); await t.until(() => t.calls.length === 1);
  const current = t.ctx.state;
  current.items[0] = W.setOwnPhoto({ ...current.items[0], name: '대기 중 이름 수정' }, photo); current.items.push(item('during-item', '대기 중 새 옷'));
  current.decisions[0].after.note = '대기 중 판정 메모'; current.decisions[0].followup = { outcome: 'purchased', worn: 'yes', regret: 'no', sizeResult: 'right', returnReason: 'unknown', note: '대기 중 후속', at: '2026-10-13' }; current.decisions.push(decision('during-decision', '대기 중 신규 판정'));
  current.catalog.products[0].price = 99000; current.catalog.products.push(product('during-product', '대기 중 새 상품')); current.catalog.note = '대기 중 설정'; current.owner.nickname = '대기 중 별명'; current.prefs.style = 'modern'; t.ui.stageSel = 'edited-stage';
  t.release(); assert.equal(await pending, false);
  const restored = t.ctx.state;
  assert.equal(restored.items[0].name, '대기 중 이름 수정'); assert.equal(restored.items[0].photo.ownImg, photo); assert.equal(restored.items[0].brand, '로컬 A');
  assert.deepEqual(clone(restored.items.map((i) => i.id)), ['common', 'during-item', 'local-only']);
  assert.equal(restored.decisions[0].after.note, '대기 중 판정 메모'); assert.equal(restored.decisions[0].before.reason, '로컬 A'); assert.equal(restored.decisions[0].followup.note, '대기 중 후속'); assert.ok(restored.decisions.some((d) => d.id === 'during-decision'));
  assert.equal(restored.catalog.products[0].price, 99000); assert.equal(restored.catalog.products[0].name, '로컬 A'); assert.ok(restored.catalog.products.some((p) => p.id === 'during-product'));
  assert.equal(restored.catalog.note, '대기 중 설정'); assert.equal(restored.owner.nickname, '대기 중 별명'); assert.equal(restored.prefs.style, 'modern'); assert.equal(t.ui.stageSel, 'edited-stage');
});

test('첫 pull 실패·뒤 큐 성공은 최신 원문을 큐 끝에서 정정하고 중간 편집을 저장한다', async () => {
  const t = harness({ first: 'false' }), pending = t.start(); await t.until(() => t.calls.length === 1);
  t.ctx.state.items.push(item('during-item', '대기 중 새 옷')); t.ctx.state.decisions.push(decision('during-decision', '대기 중 판정')); t.ctx.state.catalog.products.push(product('during-product', '대기 중 상품')); t.ctx.state.prefs.style = 'modern';
  const later = t.ctx.save(); t.release(); assert.equal(await pending, false); assert.equal(await later, true); assert.equal(t.calls.length, 3);
  const saved = t.persisted(); assert.deepEqual(saved.items.map((i) => i.id), ['common', 'during-item', 'local-only']); assert.equal(saved.items[0].name, '로컬 A'); assert.ok(saved.decisions.some((d) => d.id === 'during-decision')); assert.ok(saved.catalog.products.some((p) => p.id === 'during-product')); assert.equal(saved.prefs.style, 'modern');
  assert.deepEqual(saved.syncFollowupAck, clone(t.ctx.state.syncFollowupAck)); assert.match(t.ui.syncMsg, /그동안 편집한 기록은 유지/);
});

for (const first of ['true', 'false', 'throw']) test('새 same-account 전체 state의 뒤 저장 성공을 old pull ' + first + '가 덮지 않는다', async () => {
  const t = harness({ first }), pending = t.start(); await t.until(() => t.calls.length === 1);
  const next = wardrobe('명시 복원'); t.switchState(next, keyA, 77); const replacement = t.ctx.save();
  t.release(); assert.equal(await pending, first === 'true'); assert.equal(await replacement, true); assert.equal(t.calls.length, 2); assert.equal(t.ctx.state, next); assert.equal(t.persisted().owner.nickname, '명시 복원'); assert.equal(t.ui.syncMsg, '새 상태 안내');
});

test('old account의 뒤 저장만 captured key로 수리하고 새 계정 원문·UI는 보존한다', async () => {
  const t = harness({ first: 'false' }), pending = t.start(); await t.until(() => t.calls.length === 1);
  t.ctx.state.items.push(item('during-A', 'A 중간 편집')); const oldLater = t.ctx.save();
  const next = wardrobe('B 새 상태'), keyB = 'account:' + origin + ':88'; t.switchState(next, keyB, 88); const newLater = t.ctx.save();
  t.release(); assert.equal(await pending, false); assert.equal(await oldLater, true); assert.equal(await newLater, true);
  assert.deepEqual(t.calls.map((o) => o.idbKey), [keyA, keyA, keyB, keyA]); assert.equal(t.calls[3].lsKey, 'local:' + keyA);
  assert.equal(t.persisted().items[0].name, '로컬 A'); assert.ok(t.persisted().items.some((i) => i.id === 'during-A')); assert.equal(t.persisted(keyB).owner.nickname, 'B 새 상태'); assert.equal(t.ctx.state, next); assert.equal(t.ui.syncMsg, '새 상태 안내'); assert.equal(t.ui.syncVersion, null);
});

test('같은 객체에서 가져오기로 baseline을 지운 새 source는 이전 pull rollback으로 변경하지 않는다', async () => {
  const t = harness({ first: 'false' }), pending = t.start(); await t.until(() => t.calls.length === 1);
  t.ctx.state.items = [item('imported-item', '명시 가져온 옷')]; t.ctx.state.syncFollowupAck = null; t.ctx.state.syncStamp = null; t.ui.syncVersion = null; t.ui.syncMsg = '새 가져오기 안내'; t.ui.stageSel = 'import-stage'; const later = t.ctx.save();
  t.release(); assert.equal(await pending, false); assert.equal(await later, true); assert.equal(t.calls.length, 2); assert.deepEqual(t.persisted().items.map((i) => i.id), ['imported-item']); assert.equal(t.persisted().syncFollowupAck, null); assert.equal(t.ui.syncMsg, '새 가져오기 안내'); assert.equal(t.ui.syncVersion, null); assert.equal(t.ui.stageSel, 'import-stage');
});

for (const repair of ['false', 'throw', 'conflict']) test('보상 ' + repair + '는 임시 원문 잔존 가능성을 알리고 완료를 주장하지 않는다', async () => {
  const t = harness({ first: 'false', repair }), pending = t.start(); await t.until(() => t.calls.length === 1); t.ctx.state.items.push(item('during-item', '중간 새 옷')); const later = t.ctx.save();
  t.release(); assert.equal(await pending, false); assert.equal(await later, true); assert.equal(t.calls.length, 3); assert.equal(t.persisted().items[0].name, '서버 A'); assert.equal(t.ctx.state.items[0].name, '로컬 A');
  assert.match(t.ui.syncMsg, /임시로 받은 기록이 남아 있을 수/); assert.doesNotMatch(t.ui.syncMsg, /서버에서 받았습니다|기존 브라우저 자료를 유지|그동안 편집한 기록은 유지/); assert.ok(t.store.pullRepairFailures.has(keyA));
  t.ctx.renderSync(); assert.match(t.nodes.get('pullRepairFailure').props.text, /임시로 받은 기록/); if (repair === 'conflict') assert.ok(t.store.conflicts.has(keyA));
});

test('중복 적용과 apply 도중 push/pull은 새로운 저장·요청을 시작하지 않는다', async () => {
  const t = harness(), pending = t.start(); await t.until(() => t.calls.length === 1); const arm = t.ui.pullArm;
  assert.equal(await t.ctx.applySyncPull(), false); assert.equal(await t.ctx.syncPush(), false); assert.equal(await t.ctx.syncPull(), false); assert.equal(t.ui.pullArm, arm); assert.equal(t.calls.length, 1);
  t.ctx.renderSync(); assert.equal(t.nodes.get('pullGo').props.disabled, true); assert.equal(t.nodes.get('syncPush').props.disabled, true); assert.equal(t.nodes.get('syncPull').props.disabled, true);
  t.release(); assert.equal(await pending, true); assert.equal(t.ui.pullSaving, null);
});

test('freshness 검사 await 중 새 state로 교체되면 mutation·save를 시작하지 않는다', async () => {
  const t = harness(); let releaseRead; t.ctx.kvGet = async (key) => { await new Promise((r) => { releaseRead = r; }); return t.rows.get(key); };
  const pending = t.start(); await t.until(() => !!releaseRead); const next = wardrobe('읽기 중 새 상태'); t.switchState(next, keyA, 77); releaseRead();
  assert.equal(await pending, false); assert.equal(t.ctx.state, next); assert.equal(t.calls.length, 0); assert.equal(t.ui.syncMsg, '새 상태 안내');
});


test('비활성 계정의 복구도 시도하며 실패 안내를 해당 scope에만 남긴다', async () => {
  const t = harness({ first: 'false', repairAt: 4, repair: 'throw' }), pending = t.start(); await t.until(() => t.calls.length === 1);
  t.ctx.state.items.push(item('during-A', 'A 중간 편집')); const oldLater = t.ctx.save();
  const next = wardrobe('B 새 상태'), keyB = 'account:' + origin + ':88'; t.switchState(next, keyB, 88); const newLater = t.ctx.save();
  t.release(); assert.equal(await pending, false); assert.equal(await oldLater, true); assert.equal(await newLater, true);
  assert.deepEqual(t.calls.map((o) => o.idbKey), [keyA, keyA, keyB, keyA]); assert.ok(t.store.pullRepairFailures.has(keyA)); assert.equal(t.store.pullRepairFailures.has(keyB), false);
  assert.equal(t.ctx.state, next); assert.equal(t.persisted(keyB).owner.nickname, 'B 새 상태'); assert.equal(t.ui.syncMsg, '새 상태 안내'); assert.equal(t.persisted().items[0].name, '서버 A');
  t.ctx.renderSync(); assert.equal(t.nodes.has('pullRepairFailure'), false);
  t.switchState(t.target, keyA, 77); t.ctx.renderSync(); assert.match(t.nodes.get('pullRepairFailure').props.text, /임시로 받은 기록이 남아 있을 수/);
});


test('실제 취소 handler는 freshness 대기 중 잠긴 apply를 취소했다고 표시하지 않는다', async () => {
  const t = harness(); let releaseRead; t.ctx.kvGet = async (key) => { await new Promise((r) => { releaseRead = r; }); return t.rows.get(key); };
  const pending = t.start(); await t.until(() => !!releaseRead); t.ctx.renderSync();
  const cancel = t.buttons.findLast((button) => button.props.text === '취소'), arm = t.ui.pullArm;
  assert.equal(cancel.props.disabled, true); assert.equal(cancel.props.onclick(), false); assert.equal(t.ui.pullArm, arm);
  releaseRead(); await t.until(() => t.calls.length === 1); t.release(); assert.equal(await pending, true); assert.equal(t.calls.length, 1);
});

test('same-scope 새 state는 이전 저장 실패의 saveNote·storageOk로 바뀌지 않는다', async () => {
  const t = harness({ first: 'false' }), pending = t.start(); await t.until(() => t.calls.length === 1);
  const next = wardrobe('새 같은 계정 state'); t.switchState(next, keyA, 77); t.note.textContent = '새 state의 저장 안내'; t.ctx.storageOk = true;
  t.release(); assert.equal(await pending, false); assert.equal(t.note.textContent, '새 state의 저장 안내'); assert.equal(t.ctx.storageOk, true); assert.equal(t.ctx.state, next);
});


const imageA = photo.replace('UklGR', 'VklGR'), imageB = photo.replace('UklGR', 'WklGR'), imageC = photo.replace('UklGR', 'XklGR');
const confirmed = (garment, image) => W.confirmProduct(garment, { brand: '확인 브랜드', name: '확인 상품', img: image, sourceName: '공식몰', sourceUrl: 'https://example.test/product', at: '2026-10-12' });
test('상품사진→개인사진 pull 뒤 새 개인사진 편집은 confirmed 출처와 섞이지 않는다', async () => {
  const t = harness({ first: 'false', prepareLocal: (s) => { s.items[0] = confirmed(s.items[0], imageA); }, prepareRemote: (s) => { s.items[0] = W.setOwnPhoto(s.items[0], imageB); } });
  const pending = t.start(); await t.until(() => t.calls.length === 1); t.ctx.state.items[0] = W.setOwnPhoto(t.ctx.state.items[0], imageC); const later = t.ctx.save();
  t.release(); assert.equal(await pending, false); assert.equal(await later, true);
  for (const actual of [t.ctx.state.items[0], t.persisted().items[0]]) {
    assert.equal(actual.photo.kind, 'own'); assert.equal(actual.photo.img, imageC); assert.equal(actual.photo.ownImg, imageC); assert.equal(actual.photo.sourceName, ''); assert.equal(actual.photo.sourceUrl, ''); assert.equal(actual.product, null);
  }
});

test('표시 상품사진을 복구할 때 별도 개인사진 편집도 일관된 own 표시로 보존한다', async () => {
  const t = harness({ first: 'false', prepareLocal: (s) => { s.items[0] = W.setOwnPhoto(s.items[0], imageA); }, prepareRemote: (s) => { s.items[0] = confirmed(s.items[0], imageB); } });
  const pending = t.start(); await t.until(() => t.calls.length === 1); t.ctx.state.items[0] = W.setOwnPhoto(t.ctx.state.items[0], imageC); const later = t.ctx.save();
  t.release(); assert.equal(await pending, false); assert.equal(await later, true);
  for (const actual of [t.ctx.state.items[0], t.persisted().items[0]]) { assert.equal(actual.photo.kind, 'own'); assert.equal(actual.photo.img, imageC); assert.equal(actual.photo.ownImg, imageC); assert.equal(actual.product, null); assert.equal(actual.photo.sourceName, ''); }
});

test('실제 hang이 대기 중 점유한 슬롯을 old rack 복원이 중복 사용하지 않는다', async () => {
  const t = harness({ first: 'false', prepareLocal: (s) => { s.items[0] = { ...s.items[0], look3d: { kind: 'shirt', fabric: '' } }; } });
  const pending = t.start(); await t.until(() => t.calls.length === 1);
  t.ctx.state.items.push({ ...item('during-rack', '새로 건 셔츠'), look3d: { kind: 'shirt', fabric: '' } }); assert.equal(t.ctx.hang('during-rack'), true);
  t.release(); assert.equal(await pending, false); await t.ctx.savePromise;
  for (const actual of [clone(t.ctx.state.rack), t.persisted().rack]) { assert.deepEqual(actual, [{ id: 'during-rack', slot: 0 }]); assert.equal(new Set(actual.map((r) => r.slot)).size, actual.length); }
  assert.ok(t.ctx.state.items.some((i) => i.id === 'common')); assert.ok(t.ctx.state.items.some((i) => i.id === 'during-rack'));
});


for (const kind of ['items', 'decisions', 'products']) test('legacy ' + kind + ' 2000→원격1 대기 중 신규 예약은 false, 기존 수정은 허용한다', async () => {
  const t = harness({ first: 'false', prepareLocal: (s) => {
    if (kind === 'items') s.items = Array.from({ length: 2000 }, (_, i) => item(i === 0 ? 'common' : 'old-' + i, '옛 옷' + i));
    else if (kind === 'decisions') s.decisions = Array.from({ length: 2000 }, (_, i) => decision(i === 0 ? 'decision-common' : 'old-decision-' + i, '옛 판정' + i));
    else s.catalog.products = Array.from({ length: 2000 }, (_, i) => product(i === 0 ? 'product-common' : 'old-product-' + i, '옛 상품' + i));
  }, prepareRemote: (s) => { if (kind === 'items') s.items = [s.items[0]]; else if (kind === 'decisions') s.decisions = [s.decisions[0]]; else s.catalog.products = [s.catalog.products[0]]; } });
  const pending = t.start(); await t.until(() => t.calls.length === 1);
  assert.equal(t.ctx.canAdd(kind, 1, t.ctx.state, true), false); assert.equal(t.ctx.canAdd(kind, 0, t.ctx.state, true), true);
  if (kind === 'items') { assert.equal(t.ctx.replaceItem(item('during-new', '새 옷')), false); assert.ok(t.ctx.replaceItem({ ...t.ctx.state.items[0], name: '기존 옷 수정' })); }
  else if (kind === 'decisions') t.ctx.state.decisions[0].before.reason = '기존 판정 수정'; else t.ctx.state.catalog.products[0].price = 99999;
  const later = t.ctx.save(); t.release(); assert.equal(await pending, false); assert.equal(await later, true);
  const saved = t.persisted(), rows = kind === 'products' ? saved.catalog.products : saved[kind]; assert.equal(rows.length, 2000); assert.ok(W.cleanWardrobe(saved)); assert.ok(C.cleanCatalog({ schema: 1, kind: 'catalog', products: saved.catalog.products }));
});

const resultRecord = (outcome, sizeResult, returnReason, note) => ({ outcome, sizeResult, returnReason, worn: 'unknown', regret: 'unknown', note, at: '2026-10-13' });
function followupHarness(before, after, options = {}) {
  const t = harness({ ...options, first: 'false', prepareLocal: (s) => { s.decisions[0].followup = before; s.items[0].status = before.outcome === 'returned' ? 'gone' : 'owned'; s.syncFollowupAck = SY.makeFollowupAck({ origin, ownerId: 77, serverVersion: 7, capture: 'pull', completeSnapshot: true }, [s.decisions[0]]); }, prepareRemote: (s) => { s.decisions[0].followup = after; s.items[0].status = after.outcome === 'returned' ? 'gone' : 'owned'; } });
  t.ui.pullArm.context.serverVersion = 8; t.ui.pullArm.version = 8; return t;
}
test('새 pending followup은 이전 반품 이유·일자와 섞이지 않고 canonical 그대로 저장된다', async () => {
  const t = followupHarness(resultRecord('returned', 'small', 'size', '옛 반품'), resultRecord('purchased', 'right', 'unknown', '서버 구매'));
  const pending = t.start(); await t.until(() => t.calls.length === 1); const next = resultRecord('pending', 'unknown', 'unknown', '기다리기로 변경'); t.ctx.state.decisions[0].followup = next; const later = t.ctx.save();
  t.release(); assert.equal(await pending, false); assert.equal(await later, true); assert.deepEqual(t.persisted().decisions[0].followup, next); assert.deepEqual(W.cleanDecision(t.persisted().decisions[0]).followup, next);
});

test('새 returned followup·item gone·rack 제거를 함께 보존한다', async () => {
  const t = followupHarness(resultRecord('purchased', 'right', 'unknown', '옛 구매'), resultRecord('returned', 'small', 'size', '서버 반품'));
  const pending = t.start(); await t.until(() => t.calls.length === 1); const next = resultRecord('returned', 'right', 'color', '색 때문에 반품'); t.ctx.state.decisions[0].followup = next;
  assert.ok(t.ctx.replaceItem(W.cleanItem({ ...t.ctx.state.items[0], status: 'gone' }, 0))); t.ctx.state.rack = t.ctx.state.rack.filter((r) => r.id !== 'common'); const later = t.ctx.save();
  t.release(); assert.equal(await pending, false); assert.equal(await later, true);
  for (const actual of [clone(t.ctx.state), t.persisted()]) { assert.deepEqual(actual.decisions[0].followup, next); assert.deepEqual(W.cleanDecision(actual.decisions[0]).followup, next); assert.equal(actual.items.find((i) => i.id === 'common').status, 'gone'); assert.equal(actual.rack.some((r) => r.id === 'common'), false); }
});

test('legacy follow 편집과 연결 skip 선택을 atomic으로 보존한다', async () => {
  const t = harness({ first: 'false', prepareLocal: (s) => { s.decisions[0].after.decision = 'buy'; s.decisions[0].follow = { at: '2026-10-12', worn: 'few', feel: 'good' }; }, prepareRemote: (s) => { s.decisions[0].after.decision = 'skip'; s.decisions[0].follow = { at: '2026-10-13', worn: '', feel: 'good' }; } });
  const pending = t.start(); await t.until(() => t.calls.length === 1); const next = { at: '2026-10-13', worn: '', feel: 'regret' }; t.ctx.state.decisions[0].follow = next; const later = t.ctx.save();
  t.release(); assert.equal(await pending, false); assert.equal(await later, true); const saved = t.persisted().decisions[0]; assert.equal(saved.after.decision, 'skip'); assert.deepEqual(saved.follow, next); assert.deepEqual(W.cleanDecision(saved).follow, next);
});


for (const kind of ['items', 'decisions', 'products']) test('before+remote ' + kind + ' ID union 2001은 mutation·저장 전에 거절한다', async () => {
  const t = harness({ gate: false, prepareLocal: (s) => {
    if (kind === 'items') s.items = Array.from({ length: 2000 }, (_, i) => item(i === 0 ? 'common' : 'old-' + i, '옛 옷' + i));
    else if (kind === 'decisions') s.decisions = Array.from({ length: 2000 }, (_, i) => decision(i === 0 ? 'decision-common' : 'old-decision-' + i, '옛 판정' + i));
    else s.catalog.products = Array.from({ length: 2000 }, (_, i) => product(i === 0 ? 'product-common' : 'old-product-' + i, '옛 상품' + i));
  } });
  const before = clone(t.target), raw = t.rows.get(keyA); assert.equal(await t.start(), false); assert.equal(t.calls.length, 0); assert.deepEqual(clone(t.ctx.state), before); assert.equal(t.rows.get(keyA), raw); assert.match(t.ui.syncMsg, /모두 보존하면 읽기 상한/); assert.match(t.ui.syncMsg, /전체 백업/);
});

test('똑같은 returned 값을 실제 새 followup 객체로 재제출한 명령도 lifecycle과 함께 보존한다', async () => {
  const t = followupHarness(resultRecord('purchased', 'right', 'unknown', '옛 구매'), resultRecord('returned', 'small', 'size', '서버 반품'));
  const pending = t.start(); await t.until(() => t.calls.length === 1); const next = clone(t.ctx.state.decisions[0].followup), previousRef = t.ctx.state.decisions[0].followup;
  const root = { append() {} }, dialog = { open: false }; t.ctx.renderFollowup(root, t.ctx.state.decisions[0], { dialog });
  const submitted = t.nodes.get('followupForm').props.onsubmit({ preventDefault() {} });
  assert.notEqual(t.ctx.state.decisions[0].followup, previousRef); assert.deepEqual(clone(t.ctx.state.decisions[0].followup), next);
  t.release(); assert.equal(await pending, false); await submitted;
  for (const actual of [clone(t.ctx.state), t.persisted()]) { assert.deepEqual(actual.decisions[0].followup, next); assert.equal(actual.items.find((i) => i.id === 'common').status, 'gone'); assert.equal(actual.rack.some((r) => r.id === 'common'), false); assert.deepEqual(W.cleanDecision(actual.decisions[0]).followup, next); }
});

test('똑같은 legacy follow 재제출도 skip 해석과 함께 보존한다', async () => {
  const t = harness({ first: 'false', prepareLocal: (s) => { s.decisions[0].after.decision = 'buy'; s.decisions[0].follow = { at: '2026-10-12', worn: 'few', feel: 'good' }; }, prepareRemote: (s) => { s.decisions[0].after.decision = 'skip'; s.decisions[0].follow = { at: '2026-10-13', worn: '', feel: 'good' }; } });
  const pending = t.start(); await t.until(() => t.calls.length === 1); const next = clone(t.ctx.state.decisions[0].follow); t.ctx.state.decisions[0].follow = next; const later = t.ctx.save();
  t.release(); assert.equal(await pending, false); assert.equal(await later, true); const actual = t.persisted().decisions[0]; assert.equal(actual.after.decision, 'skip'); assert.deepEqual(actual.follow, next); assert.deepEqual(W.cleanDecision(actual).follow, next);
});


test('분류가 다른 remote 종류·실측 편집도 cleaner-invalid hybrid를 만들지 않는다', async () => {
  const t = harness({ first: 'false', prepareLocal: (s) => { s.items[0] = W.cleanItem({ ...s.items[0], cat: 'outer', kind: 'blazer', measures: { chest: 50 } }, 0); s.catalog.products[0] = C.cleanProduct({ ...s.catalog.products[0], cat: 'outer', kind: 'blazer' }, 0); }, prepareRemote: (s) => { s.items[0] = W.cleanItem({ ...s.items[0], cat: 'top', kind: 'tee', measures: { chest: 55 } }, 0); s.catalog.products[0] = C.cleanProduct({ ...s.catalog.products[0], cat: 'top', kind: 'tee' }, 0); } });
  const pending = t.start(); await t.until(() => t.calls.length === 1); assert.ok(t.ctx.replaceItem(W.cleanItem({ ...t.ctx.state.items[0], kind: 'shirt', measures: { chest: 57 } }, 0))); t.ctx.state.catalog.products[0] = C.cleanProduct({ ...t.ctx.state.catalog.products[0], kind: 'shirt' }, 0); const later = t.ctx.save();
  t.release(); assert.equal(await pending, false); assert.equal(await later, true); const saved = t.persisted(), garment = saved.items[0], offer = saved.catalog.products[0];
  assert.equal(garment.cat, 'top'); assert.equal(garment.kind, 'shirt'); assert.equal(garment.measures.chest, 57); assert.deepEqual(W.cleanItem(garment, 0), garment); assert.equal(offer.cat, 'top'); assert.equal(offer.kind, 'shirt'); assert.deepEqual(C.cleanProduct(offer, 0), offer);
});


for (const second of ['true', 'false']) for (const third of ['true', 'false']) test('실제 연속 후속 제출 pull=false, 첫제출=' + second + ', 다음제출=' + third + ': 마지막 성공 의도만 복구한다', async () => {
  const t = followupHarness(resultRecord('purchased', 'right', 'unknown', '원래 구매'), resultRecord('returned', 'small', 'size', '서버 반품'), { outcomes: ['false', second, third, 'true', 'true'] });
  const pending = t.start(); await t.until(() => t.calls.length === 1); const firstValue = clone(t.ctx.state.decisions[0].followup), root = { append() {} }, dialog = { open: false };
  t.ctx.renderFollowup(root, t.ctx.state.decisions[0], { dialog }); const firstForm = t.nodes.get('followupForm'), firstSubmit = firstForm.props.onsubmit({ preventDefault() {} });
  t.ctx.renderFollowup(root, t.ctx.state.decisions[0], { dialog }); t.nodes.get('followupReturnReason').value = 'color'; t.nodes.get('followupNote').value = '색 때문에 반품'; const secondValue = { ...firstValue, returnReason: 'color', note: '색 때문에 반품' }, secondSubmit = t.nodes.get('followupForm').props.onsubmit({ preventDefault() {} });
  t.release(); assert.equal(await pending, false); await firstSubmit; await secondSubmit; await t.ctx.savePromise;
  const expected = third === 'true' ? secondValue : second === 'true' ? firstValue : resultRecord('purchased', 'right', 'unknown', '원래 구매');
  for (const actual of [clone(t.ctx.state), t.persisted()]) { assert.deepEqual(actual.decisions[0].followup, expected); assert.equal(actual.items[0].name, '로컬 A'); assert.equal(actual.items[0].status, expected.outcome === 'returned' ? 'gone' : 'owned'); assert.equal(actual.rack.some((row) => row.id === 'common'), expected.outcome !== 'returned'); assert.deepEqual(W.cleanDecision(actual.decisions[0]).followup, expected); }
});


test('실패한 다음 제출이 뒤 ordinary 저장에 섞여도 snapshot receipt로 마지막 성공 결과를 정정한다', async () => {
  const t = followupHarness(resultRecord('purchased', 'right', 'unknown', '원래 구매'), resultRecord('returned', 'small', 'size', '서버 반품'), { outcomes: ['false', 'true', 'false', 'true', 'true', 'true'] });
  const pending = t.start(); await t.until(() => t.calls.length === 1); const firstValue = clone(t.ctx.state.decisions[0].followup), root = { append() {} }, dialog = { open: false };
  t.ctx.renderFollowup(root, t.ctx.state.decisions[0], { dialog }); const firstSubmit = t.nodes.get('followupForm').props.onsubmit({ preventDefault() {} });
  t.ctx.renderFollowup(root, t.ctx.state.decisions[0], { dialog }); t.nodes.get('followupReturnReason').value = 'color'; t.nodes.get('followupNote').value = '실패할 색상 수정'; const nextSubmit = t.nodes.get('followupForm').props.onsubmit({ preventDefault() {} });
  t.ctx.state.prefs.style = 'modern'; const otherSave = t.ctx.save(); t.release(); assert.equal(await pending, false); await firstSubmit; await nextSubmit; assert.equal(await otherSave, true); await t.ctx.savePromise;
  for (const actual of [clone(t.ctx.state), t.persisted()]) { assert.deepEqual(actual.decisions[0].followup, firstValue); assert.equal(actual.items[0].name, '로컬 A'); assert.equal(actual.items[0].status, 'gone'); assert.equal(actual.prefs.style, 'modern'); }
  assert.equal(t.calls.length, 5);
});

for (const result of ['true', 'false', 'throw']) test('실제 followup 응답 ' + result + ': 다른 계정으로 바뀐 뒤 state·UI·rack를 덮지 않는다', async () => {
  const t = followupHarness(resultRecord('purchased', 'right', 'unknown', '원래 구매'), resultRecord('returned', 'small', 'size', '서버 반품'), { outcomes: ['false', result, 'true', 'true', 'true'] });
  const pending = t.start(); await t.until(() => t.calls.length === 1); const root = { append() {} }, dialog = { open: false };
  t.ctx.renderFollowup(root, t.ctx.state.decisions[0], { dialog }); const submitted = t.nodes.get('followupForm').props.onsubmit({ preventDefault() {} });
  const next = wardrobe('계정 B'), keyB = 'account:' + origin + ':88'; t.switchState(next, keyB, 88); t.ui.tab = 'new-account-tab'; const before = clone(next), nextSave = t.ctx.save();
  t.release(); await pending; await submitted; assert.equal(await nextSave, true); await t.ctx.savePromise;
  assert.equal(t.ctx.state, next); assert.deepEqual(clone(next), before); assert.equal(t.ui.syncMsg, '새 상태 안내'); assert.equal(t.ui.tab, 'new-account-tab'); assert.deepEqual(t.persisted(keyB).rack, before.rack); assert.equal(t.persisted(keyB).owner.nickname, '계정 B');
});
