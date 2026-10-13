const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const W = require('../src/wardrobe.js'), C = require('../src/catalog.js'), B = require('../src/beta.js'), SY = require('../src/sync.js'), PK = require('../src/pick.js');
const contract = require('../../contracts/record-limits.json'), PICKS = PK.cleanPicks(require('../data/picks.json'));
const html = fs.readFileSync(__dirname + '/../src/app.html', 'utf8'), betaUi = fs.readFileSync(__dirname + '/../src/beta-ui.js', 'utf8');
const extract = (text, from, to) => { const a = text.indexOf(from), b = text.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return text.slice(a, b); };
const production = extract(html, '  function cleanPrefs(raw)', '  let state = null') +
  extract(html, '  function save() {', '\n  const owned =') + extract(html, '  function capacityCounts(', '  const newId =') +
  extract(html, '  function logFor(pid)', '  /** 같은 상품에 30일') + extract(html, '  function storeLink(', '  /** 내 옷장과:') +
  extract(html, '  function saveBought(', '  /** 산 지 2주:') + extract(betaUi, 'async function enterAccount(', 'async function authenticate(');
const copy = (x) => JSON.parse(JSON.stringify(x));
const item = (id) => W.cleanItem({ id, cat: 'top', name: id, status: 'owned' }, 0);
const decision = (id) => W.cleanDecision({ id, itemId: 'item-0', name: id, before: { lean: 'unsure', at: '2026-10-13' }, after: { decision: 'hold', at: '2026-10-13' } });
const product = (id) => C.cleanProduct({ id, name: id, cat: 'top' }, 0);
const picks = (n) => Array.from({ length: n }, (_, i) => ({ id: 'pick-' + i, productId: 'product-' + i, at: '2026-10-13' }));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

// Run production entry/read/save/repair functions with an exact-copy CAS adapter.
// Real browser UI, IndexedDB and PostgreSQL are separate integration checks.
function harness(options = {}) {
  const idb = new Map(), ls = new Map(), commits = [], downloads = [], toasts = [], nodes = new Map();
  const store = { db: {}, mode: 'idb', revision: 0, idbUnverified: false, persistedSnapshots: new Map(), recoveryByScope: new Map(), conflicts: new Set() };
  const note = { textContent: '', classList: { toggle() {} }, setAttribute() {}, focus() {} };
  let ctx, ids = 0;
  const h = (type, props, ...children) => { const node = { type, props: props || {}, children, append(...rows) { this.children.push(...rows); }, focus() {}, setAttribute() {} }; if (props?.id) nodes.set(props.id, node); return node; };
  ctx = vm.createContext({ W, C, B, SY, PK, PICKS, WISH: {}, N: require('../src/needs.js'), SEASONS: W.SEASONS, TAB_IDS: {}, BASE: { schema: 2, owner: {}, items: [], decisions: [] }, KEY1: 'v1', KEY2: 'v2', store,
    state: null, ui: { syncScope: '', syncVersion: null, syncObservedVersion: 7, buyStep: '', buySize: 'M', buyOwn: true }, storageOk: true, savePromise: Promise.resolve(),
    str: W.str, num: W.num, h, window: { localStorage: {} }, navigator: { locks: {} },
    openDb: async () => store.db, kvGet: async (key) => idb.has(key) ? idb.get(key) : null,
    lsSnapshot: (key) => ls.has(key) ? ls.get(key) : null, lsGet: (key) => ls.get(key) ?? null,
    accountScope: () => ctx.ui.syncScope || 'state', localStorageKey: () => ctx.ui.syncScope ? 'v2:' + ctx.ui.syncScope : 'v2',
    today: () => '2026-10-13', daysAgo: () => 0, addDays: () => '2026-10-27', md: (x) => x, pname: (p) => PK.pname(PICKS, p), newId: (p) => p + (++ids),
    cands: () => ctx.state.items.filter((x) => x.status === 'candidate'), render() {}, toast: (text) => toasts.push(text),
    $: () => note, download: (name, value, raw) => downloads.push({ name, value, raw }),
    syncFetch: async () => { if (options.me) await options.me(); return {}; },
    SC: { commitSnapshot: async (o) => {
      commits.push(o);
      if (options.commit && !await options.commit(o, commits.length)) return { ok: false, conflict: false, mode: 'idb' };
      if ((idb.get(o.idbKey) ?? null) !== o.expectedIdb || (ls.get(o.lsKey) ?? null) !== o.expectedLs) return { ok: false, conflict: true, mode: 'idb' };
      idb.set(o.idbKey, o.data); return { ok: true, conflict: false, mode: 'idb', idbValue: o.data, lsValue: o.expectedLs };
    } }
  });
  vm.runInContext(production, ctx);
  ctx.state = ctx.cleanState(ctx.BASE);
  store.persistedSnapshots.set('state', { idbValue: null, lsValue: null });
  const seed = (raw, key = 'state', revision = 4) => { const text = typeof raw === 'string' ? raw : JSON.stringify({ ...raw, _storageRevision: revision }); idb.set(key, text); return text; };
  const setState = (raw) => { const state = ctx.cleanState(raw); assert.ok(state); ctx.state = state; return state; };
  return { ctx, store, idb, ls, commits, downloads, toasts, nodes, seed, setState };
}
const rawState = (n, logCount = 150) => ({ schema: 2, owner: {}, items: Array.from({ length: n }, (_, i) => item('item-' + i)),
  decisions: Array.from({ length: n }, (_, i) => decision('decision-' + i)), catalog: { products: Array.from({ length: n }, (_, i) => product('product-' + i)) }, pickLog: picks(logCount), others: [], rack: [] });

test('공유 JSON을 실제 Node·브라우저 cleaner와 생성 trigger가 사용한다', () => {
  assert.deepEqual(W.RECORD_LIMITS, contract);
  const browser = vm.createContext({ RecordLimits: { version: 1, createLimit: 1, pickLogCreateLimit: 2, otherWardrobeCreateLimit: 1, readCeiling: 3 } }); browser.self = browser;
  vm.runInContext(fs.readFileSync(__dirname + '/../src/wardrobe.js', 'utf8'), browser);
  assert.equal(browser.Wardrobe.cleanWardrobe({ schema: 2, items: Array.from({ length: 4 }, (_, i) => item('i' + i)) }), null);
  const t = harness(); t.ctx.W = browser.Wardrobe; t.ctx.state.items = [item('one')];
  assert.equal(t.ctx.canAdd('items'), false); assert.equal(t.ctx.canAdd('items', 0), true);
  assert.ok(html.includes('window.RecordLimits = /*@@RECORD_LIMITS@@*/;'));
  assert.match(fs.readFileSync(__dirname + '/../build.mjs', 'utf8'), /contracts\/record-limits\.json/);
});

test('legacy 501벌·판정·상품과 추천150건은 실제 load→save→reload와 백업에서 모두 보존된다', async () => {
  const t = harness(), original = t.setState(rawState(501)); t.seed(original);
  t.ctx.state = await t.ctx.load(); assert.equal(await t.ctx.save(), true);
  t.ctx.state = await t.ctx.load();
  assert.deepEqual([t.ctx.state.items.length, t.ctx.state.decisions.length, t.ctx.state.catalog.products.length, t.ctx.state.pickLog.length], [501, 501, 501, 150]);
  for (const key of ['items', 'decisions', 'pickLog']) assert.deepEqual(copy(t.ctx.state[key]), copy(original[key]));
  assert.deepEqual(copy(t.ctx.state.catalog), copy(original.catalog));
  assert.ok(B.readBackup(B.makeBackup(t.ctx.state), t.ctx.cleanState));
});

test('600벌 완전 서버 snapshot과 2000건 ack를 자르지 않고 complete로 인정한다', () => {
  const raw = W.cleanWardrobe(rawState(600)), clean = W.cleanWardrobe(raw);
  assert.equal(SY.completePullSnapshot(raw, clean), true);
  const rows = Array.from({ length: contract.readCeiling }, (_, i) => decision('d-' + i));
  assert.equal(SY.makeFollowupAck({ origin: 'http://localhost:8080', ownerId: 1, serverVersion: 3 }, rows).decisions.length, 2000);
});

test('모든 업무 목록 2001개 및 중첩 비교 옷장 초과는 전체 거부하며 bootstrap 저장도 원문을 보존한다', async () => {
  for (const kind of ['items', 'decisions', 'products', 'pickLog', 'others', 'nestedItems', 'nestedDecisions']) {
    const t = harness(), raw = rawState(1, 1), n = contract.readCeiling + 1;
    if (kind === 'products') raw.catalog.products = Array.from({ length: n }, (_, i) => product('p' + i));
    else if (kind === 'nestedItems' || kind === 'nestedDecisions') raw.others = [{ schema: 2, items: kind === 'nestedItems' ? Array.from({ length: n }, (_, i) => item('o' + i)) : [], decisions: kind === 'nestedDecisions' ? Array.from({ length: n }, (_, i) => decision('o' + i)) : [] }];
    else raw[kind] = Array.from({ length: n }, (_, i) => kind === 'items' ? item('i' + i) : kind === 'decisions' ? decision('d' + i) : kind === 'pickLog' ? picks(n)[i] : { schema: 2, items: [], decisions: [] });
    const text = t.seed(raw); t.ctx.state = await t.ctx.load();
    assert.equal(await t.ctx.save(), false, kind); assert.equal(t.commits.length, 0, kind); assert.equal(t.idb.get('state'), text, kind);
    assert.ok(t.ctx.recoveryFor()); assert.equal(t.ctx.recoveryFor().rawCopies[0].text, text);
    await assert.rejects(t.ctx.requireFreshStorage(), /원문 복구/);
  }
});

test('최신 invalid raw·잘못된 revision·같은 revision의 상이한 raw를 옛 유효사본으로 덮지 않는다', async () => {
  for (const bad of ['99', -1, 1.2, Number.MAX_SAFE_INTEGER + 1, 'malformed', 'ceiling', 'future', 'tie']) {
    const t = harness(), valid = t.setState(rawState(1, 1));
    let raw = { ...copy(valid), _storageRevision: bad };
    if (bad === 'ceiling') raw = { ...rawState(1), items: Array.from({ length: 2001 }, (_, i) => item('i' + i)), _storageRevision: 9 };
    if (bad === 'future') raw = { ...copy(valid), schema: 3, _storageRevision: 9 };
    if (bad === 'tie') raw = { ...copy(valid), owner: { ...valid.owner, nickname: 'different' }, _storageRevision: 1 };
    const text = t.seed(bad === 'malformed' ? '{invalid' : JSON.stringify(raw)); t.ls.set('v2', JSON.stringify({ ...valid, _storageRevision: 1 }));
    t.ctx.state = await t.ctx.load(); assert.ok(t.ctx.recoveryFor(), String(bad));
    assert.equal(await t.ctx.save(), false); assert.equal(t.commits.length, 0); assert.equal(t.idb.get('state'), text);
  }
});

test('invalid 계정 cache도 enterAccount 자동 저장 없이 잠그고 원래 개인 상태로 돌아갈 수 있다', async () => {
  const t = harness(), personal = t.ctx.state, key = 'account:http://localhost:8080:1';
  const text = t.seed({ schema: 2, items: 'invalid' }, key);
  await t.ctx.enterAccount({ token: 'x'.repeat(43), user: { ownerId: 1, username: 'synthetic' } }, 'http://localhost:8080');
  assert.ok(t.store.recoveryByScope.has(key)); assert.equal(t.commits.length, 0); assert.equal(t.idb.get(key), text);
  assert.equal(t.ctx.state.syncStamp, null); await t.ctx.leaveAccount(false); assert.equal(t.ctx.state, personal);
  assert.equal(t.ctx.ui.syncScope, ''); assert.equal(t.store.recoveryByScope.has(key), true);
});

test('로그인 /me 대기 중 로그아웃·다른계정 전환은 개인/새계정 stamp와 저장을 바꾸지 않는다', async () => {
  for (const scope of ['', 'account:other:2']) {
    const gate = deferred(), entered = deferred(), t = harness({ me: () => { entered.resolve(); return gate.promise; } });
    const pending = t.ctx.enterAccount({ token: 'x'.repeat(43), user: { ownerId: 1, username: 'synthetic' } }, 'http://localhost:8080');
    await entered.promise;
    const replacement = t.ctx.cleanState(rawState(1, 1)); t.ctx.state = replacement; t.ctx.ui.syncScope = scope; t.ctx.ui.syncToken = 'other';
    gate.resolve(); await assert.rejects(pending, /계정이 바뀌었습니다/);
    assert.equal(t.ctx.state, replacement); assert.equal(replacement.syncStamp, null); assert.equal(t.commits.length, 0);
  }
});

test('원문 다운로드는 exact text이며 명시적 정상600벌 backup 복구만 CAS로 잠금을 해제한다', async () => {
  const t = harness(), text = t.seed(' { "schema": 2, "items": "invalid" } \n'); t.ctx.state = await t.ctx.load();
  const main = { append() {} }; t.ctx.renderRecovery(main);
  const root = [...t.nodes.values()].find((node) => node.props.id === 'storageRecovery');
  const all = (node) => [node, ...(node.children || []).flat(Infinity).filter((x) => x && typeof x === 'object').flatMap(all)];
  all(root).find((n) => n.props['data-raw-copy'] === 'idb').props.onclick();
  assert.equal(t.downloads[0].value, text); assert.equal(t.downloads[0].raw, true);
  const next = t.ctx.cleanState(rawState(600)); assert.ok(B.readBackup(B.makeBackup(next), t.ctx.cleanState));
  assert.equal(await t.ctx.restoreRecovery(next), true); assert.equal(t.ctx.recoveryFor(), null);
  assert.equal(JSON.parse(t.idb.get('state')).items.length, 600); assert.equal(t.ctx.state.items.length, 600);
});

test('명시 복구도 stale CAS·실패이면 원문과 복구 잠금을 유지한다', async () => {
  const t = harness(), text = t.seed('{invalid'); t.ctx.state = await t.ctx.load(); const placeholder = t.ctx.state;
  const next = t.ctx.cleanState(rawState(1)); t.idb.set('state', 'new other-tab raw');
  assert.equal(await t.ctx.restoreRecovery(next), false); assert.ok(t.ctx.recoveryFor()); assert.equal(t.ctx.state, placeholder);
  assert.equal(t.idb.get('state'), 'new other-tab raw'); assert.equal(await t.ctx.save(), false);
  assert.equal(t.commits.length, 1); assert.equal(t.ctx.recoveryFor().rawCopies[0].text, text);
});

test('상한에서 새로운 log 동작·판매처 열기·복합 후보추가는 모두 중단하고 기존 log수정은 계속된다', async () => {
  const t = harness(); t.setState(rawState(500, 1000)); t.ctx.state.meta.pickOut = 0; t.ctx.state.meta.pickCand = 0;
  const r = { product: PICKS.products[0], krw: 10000, fit: {} }, before = copy(t.ctx.state);
  assert.equal(t.ctx.logEntry(r), null); let prevented = false; t.ctx.storeLink(r).props.onclick({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(await t.ctx.pickToCand(r), false); assert.deepEqual(copy(t.ctx.state), before); assert.equal(t.commits.length, 0);
  t.ctx.state.pickLog[0].productId = r.product.id; const existing = t.ctx.state.pickLog[0]; assert.equal(t.ctx.logEntry(r), existing);
  assert.equal(t.ctx.canAdd('items', 0), true); assert.equal(t.ctx.canAdd('decisions', 0), true); assert.equal(t.ctx.canAdd('products', 0), true);
});

test('구매 상한에서는 신규 보유 추가만 거부하고 후보→보유·기존 followup은 가능하다', async () => {
  const t = harness(), p = PICKS.products[0]; t.setState(rawState(500, 1));
  t.ctx.state.pickLog[0].productId = p.id; const e = t.ctx.state.pickLog[0];
  const before = copy(t.ctx.state); assert.equal(await t.ctx.saveBought(e, p), false); assert.deepEqual(copy(t.ctx.state), before);
  const candidate = PK.toCandidate(p, PICKS, '2026-10-13'); candidate.id = 'candidate'; t.ctx.state.items[499] = candidate;
  assert.equal(await t.ctx.saveBought(e, p), true); assert.equal(t.ctx.state.items.length, 500); assert.equal(t.ctx.state.items[499].status, 'owned');
});

test('사용자 선택정리는 백업·지문확인 없이는 실행하지 않고 선택한 기록만 지운다', async () => {
  const t = harness(), state = t.setState(rawState(1, 150)); state.pickLog[0].bought = 'yes'; state.pickLog[0].follow = { at: '2026-10-13', size: 'fit', feel: 'good' };
  const row = state.pickLog[1], selected = [{ key: row.id, fingerprint: JSON.stringify(row) }];
  assert.equal(await t.ctx.cleanupSelected('pickLog', selected, null), false);
  const backup = { state, scope: 'state', raw: JSON.stringify(state) };
  assert.equal(await t.ctx.cleanupSelected('pickLog', selected, backup), true); assert.equal(state.pickLog.length, 149);
  assert.equal(state.pickLog[0].bought, 'yes'); assert.equal(state.pickLog[0].follow.size, 'fit'); assert.ok(!state.pickLog.some((e) => e.id === row.id));
  assert.ok(B.readBackup(B.makeBackup(state), t.ctx.cleanState));
});

test('선택정리 저장 실패·새 편집·다른계정은 기록을 조용히 버리지 않는다', async () => {
  const t = harness({ commit: async () => false }), state = t.setState(rawState(1, 150)), before = copy(state);
  const row = state.pickLog[1], selected = [{ key: row.id, fingerprint: JSON.stringify(row) }], backup = { state, scope: 'state', raw: JSON.stringify(state) };
  assert.equal(await t.ctx.cleanupSelected('pickLog', selected, backup), false); assert.deepEqual(copy(state), before);
  state.pickLog[1].label = 'new edit'; assert.equal(await t.ctx.cleanupSelected('pickLog', selected, backup), false); assert.equal(t.commits.length, 1);
  t.ctx.ui.syncScope = 'other'; assert.equal(await t.ctx.cleanupSelected('pickLog', selected, backup), false); assert.equal(t.commits.length, 1);
});

test('비교옷장 legacy7묶음은 모두 읽고 신규는6에서 막으며 중첩600벌도 백업 왕복한다', () => {
  const t = harness(), raw = rawState(1, 1); raw.others = Array.from({ length: 7 }, (_, i) => ({ ...W.cleanWardrobe(rawState(600, 0)), name: 'other-' + i }));
  const state = t.setState(raw); assert.equal(state.others.length, 7); assert.equal(state.others[6].items.length, 600);
  assert.equal(t.ctx.canAdd('others'), false); assert.ok(B.readBackup(B.makeBackup(state), t.ctx.cleanState));
});

test('일반 가져오기 신규600은 거부하며 기존id600 수정과 검증 전체백업600 복원은 허용한다', () => {
  const t = harness(), incoming = t.ctx.cleanState(rawState(600, 150)), before = copy(t.ctx.state);
  assert.equal(t.ctx.canImportReplace(incoming), false); assert.deepEqual(copy(t.ctx.state), before);
  t.ctx.state = t.ctx.cleanState(rawState(600, 150)); incoming.items[0].name = '기존 옷 수정';
  assert.equal(t.ctx.canImportReplace(incoming), true); assert.ok(B.readBackup(B.makeBackup(incoming), t.ctx.cleanState));
});

test('실제 beforeForm·빠른시작·catalog 병합은 생성 상한에서 필드·UI·저장에 변화가 없다', async () => {
  const t = harness(); t.setState(rawState(500)); const before = copy(t.ctx.state);
  t.ctx.c = { id: 'candidate', name: '후보' }; t.ctx.LEAN = W.LEAN; t.ctx.FormData = class { get() { return 'unsure'; } };
  vm.runInContext(extract(html, "      const form = h('form', { class: 'panel', id: 'beforeForm'", '      right.append(form);'), t.ctx);
  t.nodes.get('beforeForm').props.onsubmit({ preventDefault() {} }); assert.deepEqual(copy(t.ctx.state), before);
  t.ctx.PRESETS = [{ key: 'one', cat: 'top', name: '새 옷' }]; t.ctx.ui.quickPick = ['one'];
  vm.runInContext(extract(html, '  function addQuick() {', "  $('#qAdd').addEventListener"), t.ctx); t.ctx.addQuick();
  assert.deepEqual(copy(t.ctx.state), before); assert.deepEqual(copy(t.ctx.ui.quickPick), ['one']);
  t.ctx.ui.catImport = { products: [product('new-product')] };
  const body = /id: 'catMerge', onclick: \(\) => \{([^\n]+?)\}, text: '더하기'/.exec(html)[1];
  vm.runInContext('var catalogMerge = () => {' + body + '};', t.ctx); t.ctx.catalogMerge();
  assert.deepEqual(copy(t.ctx.state), before); assert.ok(t.ctx.ui.catImport); assert.equal(t.commits.length, 0);
});

test('실제 editor·wizard 저장도 상한을 초과하지 않고 기존501번째 수정은 계속한다', async () => {
  const t = harness(); t.setState(rawState(501)); const before = copy(t.ctx.state), fields = new Map(); let closes = 0;
  t.ctx.$ = (id) => { if (!fields.has(id)) fields.set(id, { value: '', checked: false, files: [], hidden: true, close() { closes++; }, addEventListener(event, fn) { this[event] = fn; } }); return fields.get(id); };
  for (const [key, value] of [['#f-cat', 'top'], ['#f-name', 'new'], ['#f-kind', 'knit'], ['#f-rebuy', 'unknown']]) t.ctx.$(key).value = value;
  Object.assign(t.ctx, { MEASURES: W.MEASURES, safeLink: W.safeLink, readNumber: (el) => el.value === '' ? null : Number(el.value), document: { querySelectorAll: () => [] },
    ed: { state: t.ctx.state, scope: 'state', item: null, status: 'owned', ownImg: '' } });
  vm.runInContext(extract(html, '  function replaceItem(it)', '\n  const B ='), t.ctx);
  vm.runInContext(extract(html, "  $('#edForm').addEventListener('submit'", '\n  // ---------- 등록 마법사:'), t.ctx);
  await t.ctx.$('#edForm').submit({ preventDefault() {} }); assert.deepEqual(copy(t.ctx.state), before); assert.equal(closes, 0);
  Object.assign(t.ctx, { wz: { state: t.ctx.state, scope: 'state', step: 2, item: null, status: 'owned', ownImg: '', prodImg: '', data: { cat: 'top', kind: 'knit', name: 'new', seasons: [] } }, collect() {}, firstStep: () => 3 });
  vm.runInContext(extract(html, '  async function wizardNext()', "  $('#wzNext').addEventListener"), t.ctx);
  await t.ctx.wizardNext(); assert.deepEqual(copy(t.ctx.state), before); assert.equal(closes, 0);
  const existing = t.ctx.state.items[500]; assert.ok(t.ctx.replaceItem({ ...existing, name: '501번째 수정' })); assert.equal(t.ctx.state.items[500].name, '501번째 수정'); assert.equal(t.ctx.state.items.length, 501);
});

test('사진 bulk가 상한에서 한 건도 변환·추가하지 않는다', async () => {
  const t = harness(); t.setState(rawState(500)); const before = copy(t.ctx.state), fields = new Map(); let thumbnails = 0;
  t.ctx.$ = (id) => { if (!fields.has(id)) fields.set(id, { addEventListener(event, fn) { this[event] = fn; } }); return fields.get(id); };
  t.ctx.bk = { generation: 1, rows: [{ drop: false, single: true, cat: 'top', img: 'synthetic' }] };
  t.ctx.photoThumbnail = async () => { thumbnails++; return ''; };
  vm.runInContext(extract(html, "  $('#bkAdd').addEventListener('click'", '  const closeBulk ='), t.ctx);
  await t.ctx.$('#bkAdd').click(); assert.equal(thumbnails, 0); assert.deepEqual(copy(t.ctx.state), before); assert.equal(t.commits.length, 0);
});

test('pickToCand 중복 대기는 성공 전 true를 돌려주지 않고 뒤 큐의 임시 후보도 복구한다', async () => {
  const gate = deferred(), t = harness({ commit: async (o, n) => { if (n === 1) { await gate.promise; return false; } return true; } });
  const r = { product: PICKS.products[0], krw: 10000, fit: {} }, before = copy(t.ctx.state);
  const pending = t.ctx.pickToCand(r), duplicate = t.ctx.pickToCand(r); await Promise.resolve();
  assert.equal(pending, duplicate); assert.equal(t.commits.length, 1); t.ctx.state.items = t.ctx.state.items.concat([item('unrelated')]); const later = t.ctx.save();
  gate.resolve(); assert.equal(await pending, false); assert.equal(await duplicate, false); await later; await t.ctx.savePromise;
  const saved = JSON.parse(t.idb.get('state')); assert.equal(saved.items.length, 1); assert.equal(saved.items[0].id, 'unrelated'); assert.equal(saved.pickLog.length, 0);
  assert.equal(t.ctx.state.meta.pickCand, before.meta.pickCand); assert.equal(t.commits.length, 3);
});

test('pickToCand 복구 저장까지 실패하면 남은 임시 후보를 숨기거나 완료로 안내하지 않는다', async () => {
  const gate = deferred(), t = harness({ commit: async (o, n) => { if (n === 1) { await gate.promise; return false; } return n === 2; } });
  const pending = t.ctx.pickToCand({ product: PICKS.products[0], krw: 10000, fit: {} }); await Promise.resolve(); const later = t.ctx.save();
  gate.resolve(); assert.equal(await pending, false); await later; await t.ctx.savePromise;
  assert.equal(t.ctx.state.items.length, 0); assert.equal(JSON.parse(t.idb.get('state')).items.length, 1);
  assert.match(t.toasts.at(-1), /복구 저장/); assert.match(t.toasts.at(-1), /남아 있을 수/);
});

test('일반 JSON 50MB 초과는 text 파싱 전에 전체 거부한다', async () => {
  const t = harness(); vm.runInContext(extract(html, '  async function readFileJson(', '\n\n  // ---------- 저장소:'), t.ctx); let reads = 0;
  const result = await t.ctx.readFileJson({ files: [{ size: 50 * 1024 * 1024 + 1, text: async () => { reads++; return '{}'; } }] });
  assert.equal(result, null); assert.equal(reads, 0); assert.match(t.ctx.ui.inputError, /50MB/);
});

test('선택정리 실패 뒤 큐가 캡처했던 삭제도 복구하며 다른 기록의 새 편집을 보존한다', async () => {
  const gate = deferred(), t = harness({ commit: async (o, n) => { if (n === 1) { await gate.promise; return false; } return true; } });
  const state = t.setState(rawState(1, 150)), row = state.pickLog[1], backup = { state, scope: 'state', raw: JSON.stringify(state) };
  const pending = t.ctx.cleanupSelected('pickLog', [{ key: row.id, fingerprint: JSON.stringify(row) }], backup); await Promise.resolve();
  state.pickLog[0].label = '다른 기록 수정'; const later = t.ctx.save(); gate.resolve(); assert.equal(await pending, false); await later; await t.ctx.savePromise;
  const saved = JSON.parse(t.idb.get('state')); assert.equal(saved.pickLog.length, 150); assert.equal(saved.pickLog[0].label, '다른 기록 수정'); assert.equal(saved.pickLog[1].id, row.id); assert.equal(t.commits.length, 3);
});
