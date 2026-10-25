// PR #61의 백업 검사 중 master #66 정본 구현으로 검증할 수 있는 빈틈만 보강한다.
// transaction journal·recover·core 쓰기 잠금은 #66 계약이 아니므로 이 파일에서 요구하지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const page = fs.readFileSync(new URL('../src/screen.html', import.meta.url), 'utf8');
const start = page.indexOf('  const BK = {');
const end = page.indexOf('  function backupSheet(');
assert.ok(start > 0 && end > start);
const block = page.slice(start, end);
const ENGINE = 'eoul-d12-hang:v1';
const UI = 'eoul-d12-hang:ui';
const EXTRA = 'eoul-d12-hang:extra';
const STASH = 'eoul-backup:stash';
const NEXT = 'eoul-backup:stash-next';
const engineState = (n) => JSON.stringify({ v: 1, garments: Array.from({ length: n }, (_, i) => ({ id: `g${i}`, kind: 'shirt', color: 'white' })), journeys: [], opaque: '원문 그대로 ☃ "따옴표"' });
const storage = (initial = {}) => {
  const entries = new Map(Object.entries(initial));
  return {
    trace: [],
    get length() { return entries.size; },
    key(i) { return [...entries.keys()][i] ?? null; },
    getItem(k) { return entries.has(k) ? entries.get(k) : null; },
    setItem(k, value) { const v = String(value); this.fault?.('set', k, v); this.trace.push(['set', k, v]); entries.set(k, v); },
    removeItem(k) { this.fault?.('remove', k); this.trace.push(['remove', k]); entries.delete(k); },
    dump() { return Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b))); },
  };
};
const run = (local) => {
  const context = { localStorage: local, window: { EOUL_MOCK_KEY: ENGINE }, CHAT_KEY: 'eoul-d12-hang:consult', REG_KEY: 'eoul-d12-hang:reg' };
  vm.runInNewContext(`${block}\nglobalThis.BK = BK;`, context);
  return context.BK;
};
const original = () => ({ [ENGINE]: engineState(1), [UI]: '{"view":"original"}', [EXTRA]: '', 'other-app:key': 'untouched', [STASH]: '{"at":"older","data":{"eoul-d12-hang:ui":"older"}}' });
const target = () => ({ [ENGINE]: engineState(2), [UI]: '{"view":"restored"}', 'eoul-d12-hang:new': 'new' });
const personal = (operation) => operation[1] !== STASH && operation[1] !== NEXT;

test('복원 중 각 set/remove 실패점에서 원문·기존 보관본·빈 문자열을 보존한다', () => {
  const successful = storage(original()); run(successful).restore(target());
  const attempted = successful.trace.filter(personal);
  assert.ok(attempted.some(([op]) => op === 'remove'));
  assert.ok(attempted.some(([op]) => op === 'set'));
  for (let failureAt = 1; failureAt <= attempted.length; failureAt++) {
    const local = storage(original()), before = local.dump(); let count = 0;
    local.fault = (op, key) => { if (personal([op, key]) && ++count === failureAt) throw new Error('one-shot failure'); };
    assert.throws(() => run(local).restore(target()), /바꾸지 않았어요/, `복원 변경 ${failureAt}`);
    assert.deepEqual(local.dump(), before, `복원 변경 ${failureAt}`);
    local.fault = null;
    run(local).restore(target()); // 새 클라이언트에서 재시도할 수 있다.
    assert.equal(local.getItem(ENGINE), target()[ENGINE]);
  }
});

test('되돌리기 중 각 set/remove 실패점에서 현재 원문과 보관본을 보존하고 재시도한다', () => {
  const ready = storage(original()); run(ready).restore(target()); const before = ready.dump();
  ready.trace = []; run(ready).undo(); const attempted = ready.trace.filter(personal);
  assert.ok(attempted.some(([op]) => op === 'remove'));
  assert.ok(attempted.some(([op]) => op === 'set'));
  for (let failureAt = 1; failureAt <= attempted.length; failureAt++) {
    const local = storage(before); let count = 0;
    local.fault = (op, key) => { if (personal([op, key]) && ++count === failureAt) throw new Error('one-shot failure'); };
    assert.throws(() => run(local).undo(), /바꾸지 않았어요/, `되돌리기 변경 ${failureAt}`);
    assert.deepEqual(local.dump(), before, `되돌리기 변경 ${failureAt}`);
    local.fault = null; run(local).undo();
    assert.equal(local.getItem(ENGINE), original()[ENGINE]);
    assert.equal(local.getItem(EXTRA), '');
    assert.equal(local.getItem(STASH), null);
    assert.equal(local.getItem('other-app:key'), 'untouched');
  }
});

test('되돌리기와 그 보상까지 실패해도 보관본 원문을 유지해 새 클라이언트가 다시 되돌린다', () => {
  const local = storage(original()); run(local).restore(target()); const stash = local.getItem(STASH);
  let interrupted = false;
  local.fault = (op, key, value) => {
    if (op === 'set' && key === ENGINE && value === original()[ENGINE]) { interrupted = true; throw new Error('undo interrupted'); }
    if (interrupted && op === 'set' && key === UI && value === target()[UI]) throw new Error('compensation interrupted');
  };
  assert.throws(() => run(local).undo(), (e) => e.code === 'partial');
  assert.equal(local.getItem(STASH), stash);
  local.fault = null; run(local).undo();
  assert.equal(local.getItem(ENGINE), original()[ENGINE]);
  assert.equal(local.getItem(UI), original()[UI]);
  assert.equal(local.getItem(EXTRA), '');
  assert.equal(local.getItem(STASH), null);
});

test('등록 영수증·입력 초안·모르는 속성은 백업과 복원 후에도 원문 그대로 남는다', () => {
  const state = JSON.parse(engineState(1));
  state.registrations = { v: 1, receipts: [{ garmentId: 'g0', at: '2026-10-23T00:00:00Z', input: { draftId: 'draft-abcdefgh', brand: '합성', name: '합성 셔츠', kind: 'shirt', color: 'white', url: '' } }] };
  const draft = '{ "v": 1, "step": 1, "updatedAt":"2026-10-25T00:00:00Z", "values": {"draftId":"draft-abcdefgh","brand":"합성","name":"합성 셔츠","kind":"shirt","color":"white","url":""}, "unknown":"保留 ☃" }';
  const local = storage({ [ENGINE]: JSON.stringify(state), 'eoul-d12-hang:input-draft:v1': draft, 'eoul-d12-hang:reg': '{"items":{},"catalog":{},"unknown":"원문"}' });
  const file = run(local).make(), destination = storage(); const bk = run(destination);
  bk.restore(bk.read(JSON.stringify(file)).data);
  assert.deepEqual(JSON.parse(JSON.stringify(bk.make().data)), JSON.parse(JSON.stringify(file.data)));
  assert.equal(destination.getItem('eoul-d12-hang:input-draft:v1'), draft);
  assert.equal(JSON.parse(destination.getItem(ENGINE)).registrations.receipts[0].input.draftId, 'draft-abcdefgh');
});

test('손상·미래 형식 기존 원문도 정상 백업으로 바꾼 뒤 되돌리면 글자 그대로 복구한다', () => {
  for (const raw of ['broken', '{"v":99,"unknown":"원문 ☃"}']) {
    const local = storage({ [ENGINE]: raw, 'eoul-d12-hang:reg': 'unreadable reg', [UI]: '' }); const before = local.dump();
    const bk = run(local); bk.restore({ [ENGINE]: engineState(2) });
    run(local).undo();
    assert.deepEqual(local.dump(), before);
  }
});
