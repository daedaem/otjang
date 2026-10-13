const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const W = require('../src/wardrobe.js'), PK = require('../src/pick.js');
const html = fs.readFileSync(__dirname + '/../src/app.html', 'utf8');
const section = (start, end) => {
  const at = html.indexOf(start), until = html.indexOf(end, at);
  assert.ok(at >= 0 && until > at, start);
  return html.slice(at, until);
};
const code = section('  function save() {', '\n  const owned =') +
  section('  function askBox(e) {', '  /** 산 지 2주:');
const PICKS = PK.cleanPicks(require('../data/picks.json'));
const product = PICKS.products.find((p) => p.sizes.length && !p.user);
const copy = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

// Run the real purchase function, button and full-snapshot save queue. Only
// browser/storage adapters are synthetic; these are not browser E2E tests.
function harness(commit = async () => true, options = {}) {
  const entry = { id: 'purchase-a', productId: product.id, at: '2026-10-13', label: PK.pname(PICKS, product),
    bought: '', boughtAt: '', boughtSize: '', ownedId: '', recSize: product.sizes[0].label };
  const other = W.cleanItem({ id: 'other-item', cat: 'top', name: '다른 옷', status: 'owned' }, 0);
  const candidate = options.candidate ? PK.toCandidate(product, PICKS, '2026-10-13') : null;
  if (candidate) candidate.id = 'existing-candidate';
  const state = { items: [other, ...(candidate ? [candidate] : [])], pickLog: [entry] };
  const ui = { buyStep: entry.id, buySize: entry.recSize, buyOwn: true };
  const calls = [], stored = new Map(), toasts = [], nodes = new Map(), store = { db: {}, mode: 'idb', revision: 0,
    persistedSnapshots: new Map([['account:A', { idbValue: null, lsValue: null }]]), conflicts: new Set() };
  const note = { textContent: '', classList: { toggle() {} } };
  let renders = 0, focused = 0, nextId = 0, ctx;
  const h = (type, props, ...children) => {
    const node = { type, props: props || {}, children, append(...rest) { this.children.push(...rest); },
      setAttribute() {}, focus() { focused++; }, hidden: props?.hidden };
    if (props?.id) nodes.set('#' + props.id, node);
    return node;
  };
  ctx = vm.createContext({ state, ui, store, storageOk: true, savePromise: Promise.resolve(), scope: 'account:A',
    W, PK, PICKS, h, window: { localStorage: {} }, navigator: { locks: {} },
    accountScope: () => ctx.scope, localStorageKey: () => 'local:' + ctx.scope,
    today: () => '2026-10-13', daysAgo: () => 0, addDays: () => '2026-10-27', md: (v) => v,
    newId: () => 'owned-' + (++nextId), pname: (p) => PK.pname(PICKS, p), josa: (v) => v,
    keepFocus: (id, fn) => fn, pickQuery: () => ({}),
    $: (id) => id === '#saveNote' ? note : nodes.get(id) || null,
    toast: (text) => toasts.push(text), render: () => {
      renders++;
      const current = ctx.state.pickLog.find((e) => e.id === ctx.ui.buyStep);
      if (current && !current.bought) ctx.askBox(current);
    },
    SC: { commitSnapshot: async (o) => {
      calls.push(o);
      const ok = await commit(o, calls.length);
      if (ok) stored.set(o.idbKey, o.data);
      return { ok, conflict: false, mode: 'idb', idbValue: ok ? o.data : o.expectedIdb, lsValue: o.expectedLs };
    } }
  });
  vm.runInContext(code, ctx);
  ctx.render();
  return { ctx, state, ui, entry, other, candidate, calls, stored, toasts, nodes, note,
    renders: () => renders, focused: () => focused };
}

test('실제 구매 저장 false는 구매 필드·새 보유 옷을 되돌리고 사이즈 선택을 남긴다', async () => {
  const t = harness(async () => false), entry = copy(t.entry), items = copy(t.state.items), purchaseUi = copy(t.ui);
  assert.equal(await t.ctx.saveBought(t.entry, product), false);
  assert.deepEqual(copy(t.entry), entry); assert.deepEqual(copy(t.state.items), items);
  for (const key of ['buyStep', 'buySize', 'buyOwn']) assert.equal(t.ui[key], purchaseUi[key]);
  assert.equal(t.ui.buySaving, null); assert.equal(t.toasts.length, 1); assert.match(t.toasts[0], /저장하지 못/);
  assert.equal(t.stored.size, 0); assert.equal(t.nodes.get('#boughtSave').props.disabled, false);
});

test('실제 save 큐가 reject되어도 구매 완료 토스트 없이 구매 변경을 되돌린다', async () => {
  const t = harness(async () => { throw new Error('synthetic storage failure'); }), before = copy(t.state);
  assert.equal(await t.ctx.saveBought(t.entry, product), false);
  assert.deepEqual(copy(t.state), before); assert.equal(t.ui.buySaving, null);
  assert.equal(t.toasts.length, 1); assert.match(t.toasts[0], /저장하지 못/);
});

test('실패한 후보→보유 전환은 기존 후보 객체·정보를 그대로 복구한다', async () => {
  const t = harness(async () => false, { candidate: true }), before = copy(t.candidate);
  assert.equal(await t.ctx.saveBought(t.entry, product), false);
  assert.equal(t.state.items[1], t.candidate); assert.deepEqual(copy(t.state.items[1]), before);
  assert.equal(t.entry.ownedId, ''); assert.equal(t.state.items.length, 2);
});

test('저장 성공 응답을 기다린 뒤에만 구매 UI를 완료하고 성공 토스트를 보여 준다', async () => {
  const gate = deferred(), t = harness(async () => { await gate.promise; return true; });
  const pending = t.ctx.saveBought(t.entry, product);
  await Promise.resolve();
  assert.equal(t.toasts.length, 0); assert.equal(t.ui.buyStep, t.entry.id); assert.equal(t.ui.buySize, t.entry.recSize);
  assert.equal(t.nodes.get('#boughtSave').props.disabled, true); assert.equal(t.calls.length, 1);
  gate.resolve(); assert.equal(await pending, true);
  const saved = JSON.parse(t.stored.get('account:A'));
  assert.equal(saved.pickLog[0].bought, 'yes'); assert.equal(saved.items.length, 2);
  assert.equal(saved.items[1].id, saved.pickLog[0].ownedId); assert.equal(saved.items[1].status, 'owned');
  assert.equal(t.ui.buyStep, ''); assert.equal(t.ui.buySize, ''); assert.equal(t.ui.buySaving, null);
  assert.equal(t.toasts.length, 1); assert.match(t.toasts[0], /^기록했어요/);
  assert.equal(await t.ctx.saveBought(t.entry, product), false, '이미 완료한 오래된 버튼 호출도 다시 저장하지 않는다');
  assert.equal(t.calls.length, 1);
});

test('실제 버튼 호출은 저장을 await하고 중복 클릭은 새 저장·보유 옷을 만들지 않는다', async () => {
  const gate = deferred(), t = harness(async () => { await gate.promise; return true; });
  let completed = false;
  const first = t.nodes.get('#boughtSave').props.onclick().then(() => { completed = true; });
  const second = t.nodes.get('#boughtSave').props.onclick();
  await Promise.resolve(); assert.equal(completed, false); assert.equal(t.calls.length, 1); assert.equal(t.state.items.length, 2);
  gate.resolve(); await first; await second;
  assert.equal(t.toasts.length, 1); assert.equal(t.calls.length, 1); assert.equal(t.state.items.length, 2);
});

test('대기 중 계정과 state가 바뀌면 이전 실패가 새 계정 UI·옷장을 덮지 않는다', async () => {
  const gate = deferred(), t = harness(async () => { await gate.promise; return false; }), oldBefore = copy(t.state);
  const pending = t.ctx.saveBought(t.entry, product); await Promise.resolve();
  const replacement = { items: [{ id: 'b-item', name: '새 계정 옷' }], pickLog: [{ id: 'b-entry', bought: 'no' }] };
  t.ctx.scope = 'account:B'; t.ctx.state = replacement;
  Object.assign(t.ui, { buyStep: 'b-entry', buySize: 'L', buyOwn: false });
  const newLock = { state: replacement, scope: 'account:B' }; t.ui.buySaving = newLock;
  const replacementBefore = copy(replacement);
  gate.resolve(); assert.equal(await pending, false);
  assert.deepEqual(copy(replacement), replacementBefore); assert.equal(t.ctx.state, replacement);
  assert.equal(t.ui.buyStep, 'b-entry'); assert.equal(t.ui.buySize, 'L'); assert.equal(t.ui.buySaving, newLock);
  assert.deepEqual(copy(t.state), oldBefore, '분리된 원래 사본만 되돌린다'); assert.equal(t.toasts.length, 0);
});

test('대기 중 같은 계정의 state가 교체되어도 오래된 실패 snapshot을 적용하지 않는다', async () => {
  const gate = deferred(), t = harness(async () => { await gate.promise; return false; });
  const pending = t.ctx.saveBought(t.entry, product); await Promise.resolve();
  const replacement = { items: [], pickLog: [] }; t.ctx.state = replacement; t.ui.buyStep = 'restored'; t.ui.buySize = '?';
  gate.resolve(); assert.equal(await pending, false);
  assert.equal(t.ctx.state, replacement); assert.deepEqual(copy(replacement), { items: [], pickLog: [] });
  assert.equal(t.ui.buyStep, 'restored'); assert.equal(t.ui.buySize, '?'); assert.equal(t.toasts.length, 0);
});

test('대기 중 배열 교체는 같은 state 참조여도 새 items를 rollback하거나 완료 UI로 바꾸지 않는다', async () => {
  const gate = deferred(), t = harness(async () => { await gate.promise; return false; });
  const oldItems = t.state.items, pending = t.ctx.saveBought(t.entry, product); await Promise.resolve();
  const received = [{ id: 'remote-item', status: 'owned' }]; t.state.items = received;
  gate.resolve(); assert.equal(await pending, false);
  assert.equal(t.state.items, received); assert.deepEqual(copy(received), [{ id: 'remote-item', status: 'owned' }]);
  assert.equal(oldItems.length, 1); assert.match(t.toasts[0], /저장하지 못/);
});

test('첫 저장 실패 뒤 큐에 있던 다른 편집도 끝까지 보존하고 잠정 구매 snapshot을 복구 저장한다', async () => {
  const gate = deferred(), t = harness(async (o, n) => { if (n === 1) { await gate.promise; return false; } return true; });
  const pending = t.ctx.saveBought(t.entry, product); await Promise.resolve();
  t.other.name = '대기 중 다른 옷 수정'; const later = t.ctx.save();
  gate.resolve(); assert.equal(await pending, false); assert.equal(await later, true); await t.ctx.savePromise;
  assert.equal(t.calls.length, 3, '원래 구매, 다른 편집, 복구 사본을 순서대로 저장');
  assert.equal(JSON.parse(t.calls[1].data).pickLog[0].bought, 'yes', '실제 고정 큐 본문은 잠정 구매를 포함했었다');
  const saved = JSON.parse(t.stored.get('account:A'));
  assert.equal(saved.pickLog[0].bought, ''); assert.equal(saved.items.length, 1); assert.equal(saved.items[0].name, '대기 중 다른 옷 수정');
  assert.equal(t.other.name, saved.items[0].name); assert.equal(t.entry.bought, ''); assert.match(t.toasts[0], /저장하지 못/);
});

test('import-add가 배열을 바꾸며 공유한 잠정 구매 객체도 다른 신규 옷을 보존하면서 복구한다', async () => {
  const gate = deferred(), t = harness(async (o, n) => { if (n === 1) { await gate.promise; return false; } return true; });
  const pending = t.ctx.saveBought(t.entry, product); await Promise.resolve();
  const imported = W.cleanItem({ id: 'import-added', cat: 'outer', name: '가져온 새 옷' }, 0);
  t.state.items = t.state.items.concat([imported]); t.state.pickLog = t.state.pickLog.slice();
  const current = t.state.items, later = t.ctx.save();
  gate.resolve(); assert.equal(await pending, false); await later; await t.ctx.savePromise;
  assert.equal(t.calls.length, 3); assert.equal(t.state.items, current, '새 배열 자체는 되돌리지 않는다');
  assert.equal(t.state.items.length, 2); assert.equal(t.state.items[1], imported);
  const saved = JSON.parse(t.stored.get('account:A'));
  assert.equal(saved.pickLog[0].bought, ''); assert.deepEqual(saved.items.map((i) => i.id), ['other-item', 'import-added']);
  assert.match(t.toasts[0], /저장하지 못/);
});

test('후보를 대기 중 새 객체로 다시 편집했다면 실패 rollback이 그 새 편집을 덮지 않는다', async () => {
  const gate = deferred(), t = harness(async () => { await gate.promise; return false; }, { candidate: true });
  const pending = t.ctx.saveBought(t.entry, product); await Promise.resolve();
  const changed = { ...t.state.items[1], name: '대기 중 새 편집' }; t.state.items[1] = changed;
  gate.resolve(); assert.equal(await pending, false);
  assert.equal(t.state.items[1], changed); assert.equal(changed.name, '대기 중 새 편집'); assert.equal(t.entry.bought, '');
});

test('뒤 큐의 잠정 구매를 되돌리는 저장도 실패하면 성공·완전 복구로 알리지 않는다', async () => {
  const gate = deferred(), t = harness(async (o, n) => { if (n === 1) { await gate.promise; return false; } return n === 2; });
  const pending = t.ctx.saveBought(t.entry, product); await Promise.resolve();
  t.other.name = '다른 옷 수정'; const later = t.ctx.save();
  gate.resolve(); assert.equal(await pending, false); await later; await t.ctx.savePromise;
  assert.equal(t.calls.length, 3); assert.equal(t.entry.bought, ''); assert.equal(t.state.items.length, 1);
  assert.equal(JSON.parse(t.stored.get('account:A')).pickLog[0].bought, 'yes', '마지막 성공 사본이 남은 사실을 숨기지 않는다');
  assert.equal(t.toasts.length, 1); assert.match(t.toasts[0], /복구 사본/); assert.match(t.toasts[0], /남아 있을 수/);
  assert.equal(t.ctx.storageOk, false); assert.equal(t.ui.buySaving, null);
});

test('대기 중 보유 옷을 다른 동작으로 제거하면 이전 성공으로 옷 추가 완료를 알리지 않는다', async () => {
  const gate = deferred(), t = harness(async () => { await gate.promise; return true; });
  const pending = t.ctx.saveBought(t.entry, product); await Promise.resolve();
  t.state.items.splice(1, 1); gate.resolve(); assert.equal(await pending, true);
  assert.equal(t.state.items.length, 1); assert.equal(t.toasts.length, 0); assert.equal(t.ui.buyStep, t.entry.id);
});

test('계정 전환 뒤 이전 저장 성공도 새 계정에 성공 토스트·구매 UI 초기화를 적용하지 않는다', async () => {
  const gate = deferred(), t = harness(async () => { await gate.promise; return true; });
  const pending = t.ctx.saveBought(t.entry, product); await Promise.resolve();
  const replacement = { items: [], pickLog: [] }; t.ctx.state = replacement; t.ctx.scope = 'account:B';
  t.ui.buyStep = 'b-new'; t.ui.buySize = 'XL';
  gate.resolve(); assert.equal(await pending, true);
  assert.equal(t.ctx.state, replacement); assert.equal(t.ui.buyStep, 'b-new'); assert.equal(t.ui.buySize, 'XL');
  assert.equal(t.toasts.length, 0); assert.equal(JSON.parse(t.stored.get('account:A')).pickLog[0].bought, 'yes');
});

test('옷장 추가를 선택하지 않은 구매는 기록만 저장하고 보유 옷을 추가하지 않는다', async () => {
  const t = harness(); t.ui.buyOwn = false;
  assert.equal(await t.ctx.saveBought(t.entry, product), true);
  assert.equal(t.state.items.length, 1); assert.equal(t.entry.ownedId, '');
  assert.equal(JSON.parse(t.stored.get('account:A')).items.length, 1); assert.doesNotMatch(t.toasts[0], /옷장에도 넣/);
});
