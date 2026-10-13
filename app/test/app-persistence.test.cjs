const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Execute the production closure functions. Only their browser adapters are
// replaced; the queue, scope, captured snapshot and acknowledgment logic are not.
const source = fs.readFileSync(path.join(__dirname, '../src/app.html'), 'utf8');
const start = source.indexOf('  function save() {');
const end = source.indexOf('\n  const owned =', start);
assert.ok(start >= 0 && end > start);
const production = source.slice(start, end);

function harness(commit) {
  const calls = [], rawIdb = new Map(), rawLs = new Map(), note = { textContent: '', classList: { toggle() {} } };
  const store = { db: {}, mode: 'idb', revision: 0, persistedSnapshots: new Map(), conflicts: new Set(), conflict: false, idbUnverified: false };
  const ui = { syncProtectionBlocked: false };
  const ctx = { state: { marker: 'initial', syncFollowupAck: null }, scope: 'state', store, ui, note,
    SC: { commitSnapshot: async (options) => {
      calls.push(options);
      const result = await commit(options, calls.length);
      if (result.ok && result.idbValue !== undefined) rawIdb.set(options.idbKey, result.idbValue);
      if (result.ok && result.lsValue !== undefined) rawLs.set(options.lsKey, result.lsValue);
      return result;
    } },
    readIdb: async (key) => rawIdb.has(key) ? rawIdb.get(key) : null,
    readLs: (key) => rawLs.has(key) ? rawLs.get(key) : null };
  const app = new Function('ctx', `
    let state = ctx.state, scope = ctx.scope, storageOk = true, savePromise = Promise.resolve();
    const store = ctx.store, ui = ctx.ui, SC = ctx.SC;
    const window = { localStorage: {} }, navigator = { locks: {} };
    const accountScope = () => scope, localStorageKey = () => 'local:' + scope;
    const kvGet = (key) => ctx.readIdb(key), lsSnapshot = (key) => ctx.readLs(key);
    const $ = () => ctx.note;
    ${production}
    return { save, requireFreshStorage, setState: (value) => { state = value; },
      setScope: (value) => { scope = value; }, storageOk: () => storageOk };
  `)(ctx);
  const seed = (key, idbValue, lsValue) => {
    store.persistedSnapshots.set(key, { idbValue, lsValue });
    rawIdb.set(key, idbValue); rawLs.set('local:' + key, lsValue);
  };
  return { app, ctx, store, calls, rawIdb, rawLs, note, seed };
}
const success = (o) => ({ ok: true, conflict: false, mode: 'idb', idbValue: o.data, lsValue: o.expectedLs });

test('실제 save 큐는 실행 시점의 마지막 성공 원문과 호출 시점의 정확한 state·ack를 쓴다', async () => {
  let release;
  const h = harness(async (o, n) => { if (n === 1) await new Promise((r) => { release = r; }); return success(o); });
  h.seed('state', 'original-idb', 'original-ls');
  h.app.setState({ marker: 'first', syncFollowupAck: { serverVersion: 2 } }); const first = h.app.save();
  h.app.setState({ marker: 'second', syncFollowupAck: { serverVersion: 3 } }); const second = h.app.save();
  h.app.setState({ marker: 'later-unsent', syncFollowupAck: null });
  await Promise.resolve(); assert.equal(h.calls.length, 1); release();
  assert.equal(await first, true); assert.equal(await second, true);
  assert.equal(h.calls[0].expectedIdb, 'original-idb');
  assert.equal(h.calls[1].expectedIdb, h.calls[0].data);
  assert.equal(h.calls[1].expectedLs, 'original-ls');
  assert.deepEqual(JSON.parse(h.calls[0].data).syncFollowupAck, { serverVersion: 2 });
  assert.equal(JSON.parse(h.calls[1].data).marker, 'second');
  assert.equal(h.store.persistedSnapshots.get('state').idbValue, h.calls[1].data);
});

test('실패로 관찰한 타 탭 원문은 승인하지 않고 다음 저장도 마지막 성공 기준을 유지한다', async () => {
  const h = harness(async (o, n) => n === 1 ? { ok: false, conflict: true, mode: 'idb', idbValue: 'other-tab', lsValue: 'other-ls' } : success(o));
  h.seed('state', 'original-idb', 'original-ls');
  assert.equal(await h.app.save(), false);
  assert.deepEqual(h.store.persistedSnapshots.get('state'), { idbValue: 'original-idb', lsValue: 'original-ls' });
  assert.equal(h.store.conflicts.has('state'), true); assert.match(h.note.textContent, /다른 탭/);
  assert.equal(await h.app.save(), true);
  assert.equal(h.calls[1].expectedIdb, 'original-idb'); assert.equal(h.calls[1].expectedLs, 'original-ls');
  assert.equal(h.store.conflicts.has('state'), false);
});

test('저장 중 계정이 바뀌어도 각 key의 원문 기준과 UI 결과가 섞이지 않는다', async () => {
  let release;
  const h = harness(async (o, n) => { if (n === 1) { await new Promise((r) => { release = r; }); return { ok: false, conflict: true, mode: 'idb' }; } return success(o); });
  h.seed('account:A', 'A-idb', null); h.seed('account:B', 'B-idb', 'B-ls');
  h.app.setScope('account:A'); h.app.setState({ marker: 'A' }); const first = h.app.save();
  await Promise.resolve(); h.app.setScope('account:B'); h.app.setState({ marker: 'B' }); const second = h.app.save();
  release(); assert.equal(await first, false); assert.equal(await second, true);
  assert.equal(h.calls[0].idbKey, 'account:A'); assert.equal(h.calls[0].expectedIdb, 'A-idb');
  assert.equal(h.calls[1].idbKey, 'account:B'); assert.equal(h.calls[1].expectedIdb, 'B-idb');
  assert.equal(h.store.conflicts.has('account:A'), true); assert.equal(h.store.conflict, false);
  assert.equal(h.app.storageOk(), true); assert.doesNotMatch(h.note.textContent, /다른 탭/);
});

test('같은 revision의 다른 원문도 sync 직전 차단하고 확인할 수 없는 저장소는 빈 값으로 삼지 않는다', async () => {
  const h = harness(async (o) => success(o)), original = JSON.stringify({ _storageRevision: 4, marker: 'mine' });
  h.seed('state', original, null);
  h.rawIdb.set('state', JSON.stringify({ _storageRevision: 4, marker: 'other' }));
  await assert.rejects(h.app.requireFreshStorage(), /다른 탭/);
  assert.equal(h.ctx.ui.syncProtectionBlocked, true); assert.equal(h.calls.length, 0);
  h.store.conflicts.clear(); h.ctx.readIdb = async () => undefined;
  await assert.rejects(h.app.requireFreshStorage(), /확인할 수 없습니다/);
  assert.equal(h.calls.length, 0); assert.equal(h.store.persistedSnapshots.get('state').idbValue, original);
});

test('sync 직전 검사는 대기 중 저장 완료 후 갱신된 원문 기준을 읽는다', async () => {
  let release;
  const h = harness(async (o) => { await new Promise((r) => { release = r; }); return success(o); });
  h.seed('state', null, null); h.app.setState({ marker: 'persisted-before-sync' });
  const pending = h.app.save(), fresh = h.app.requireFreshStorage();
  await Promise.resolve(); release(); assert.equal(await pending, true); await fresh;
  assert.equal(h.rawIdb.get('state'), h.store.persistedSnapshots.get('state').idbValue);
});

test('인증 key의 읽기 실패 baseline은 undefined로 CAS에 전달되고 성공으로 표시하지 않는다', async () => {
  const h = harness(async (o) => ({ ok: false, conflict: false, mode: o.mode, reason: 'invalid_arguments' }));
  h.seed('account:A', undefined, null); h.app.setScope('account:A');
  assert.equal(await h.app.save(), false); assert.equal(h.calls[0].expectedIdb, undefined);
  assert.equal(h.store.persistedSnapshots.get('account:A').idbValue, undefined);
  assert.equal(h.app.storageOk(), false); assert.match(h.note.textContent, /저장할 수 없는/);
});
