const test = require('node:test');
const assert = require('node:assert/strict');
const { commitSnapshot } = require('../src/storage-cas.js');

const KEY = 'state:user:1', LS_KEY = 'otjang:v2:user:1';
const text = (revision, name) => JSON.stringify({ _storageRevision: revision, name });

function memoryLocal(initial = null) {
  const values = new Map(initial === null ? [] : [[LS_KEY, initial]]);
  return {
    values, writes: 0, denyRead: false, denyWrite: false,
    getItem(key) { if (this.denyRead) throw new Error('denied'); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { if (this.denyWrite) throw new Error('quota'); this.writes++; values.set(key, value); }
  };
}

function memoryLocks() {
  const tails = new Map();
  return {
    names: [],
    request(name, callback) {
      this.names.push(name);
      const result = (tails.get(name) || Promise.resolve()).catch(() => {}).then(() => callback({ name }));
      tails.set(name, result.catch(() => {}));
      return result;
    }
  };
}

// Readwrite transactions are serialized, request callbacks run asynchronously,
// and staged writes become visible only at transaction completion. A request
// error precedes abort; the promise must not enable fallback until abort finishes.
function fakeIdb(initial = null, plans = []) {
  const values = new Map(initial === null ? [] : [[KEY, initial]]);
  let tail = Promise.resolve();
  const db = {
    values, puts: 0, aborted: 0, completed: 0, transactions: [],
    transaction(store, mode) {
      assert.equal(store, 'kv');
      const plan = plans.shift() || {}, staged = [];
      let aborted = false, request, queryKey;
      const tx = {
        oncomplete: null, onerror: null, onabort: null,
        abort() { aborted = true; },
        objectStore(name) {
          assert.equal(name, 'kv');
          if (plan.objectStoreThrow) throw new Error('unavailable');
          return {
            get(key) { queryKey = key; request = {}; return request; },
            put(value, key) {
              assert.equal(mode, 'readwrite');
              const putRequest = {}; staged.push({ key, value, request: putRequest });
              db.puts++; return putRequest;
            }
          };
        }
      };
      db.transactions.push({ mode, tx });
      const run = async () => {
        await Promise.resolve();
        if (!aborted && plan.getError) {
          request.onerror?.({ target: request }); tx.onerror?.({ target: tx }); aborted = true;
        } else if (!aborted) {
          request.result = values.get(queryKey); request.onsuccess?.({ target: request });
        }
        if (!aborted && plan.putError) {
          staged[0]?.request.onerror?.({ target: staged[0].request }); tx.onerror?.({ target: tx }); aborted = true;
        }
        if (plan.abortAfterRead) aborted = true;
        if (plan.afterRead) plan.afterRead();
        await Promise.resolve();
        if (aborted) { db.aborted++; tx.onabort?.({ target: tx }); }
        else { staged.forEach(({ key, value }) => values.set(key, value)); db.completed++; tx.oncomplete?.({ target: tx }); }
      };
      tail = tail.then(run);
      return tx;
    }
  };
  return db;
}

function opts(db, localStorage, extra = {}) {
  return { db, mode: 'idb', idbKey: KEY, lsKey: LS_KEY, expectedIdb: null, expectedLs: null, data: text(1, 'new'), localStorage, ...extra };
}

test('two tabs cannot overwrite the same IDB baseline, even without Web Locks', async () => {
  const db = fakeIdb(), localStorage = memoryLocal();
  const [first, second] = await Promise.all([
    commitSnapshot(opts(db, localStorage, { data: text(1, 'first') })),
    commitSnapshot(opts(db, localStorage, { data: text(1, 'second') }))
  ]);
  assert.equal(first.ok, true); assert.equal(first.mode, 'idb');
  assert.equal(second.ok, false); assert.equal(second.conflict, true);
  assert.equal(db.values.get(KEY), text(1, 'first')); assert.equal(db.puts, 1);
  assert.equal(localStorage.writes, 0, 'conflict cannot create a newer fallback copy');
  assert.equal(first.idbValue, text(1, 'first')); assert.equal(first.lsValue, null);
});

test('the raw baseline detects different JSON with the same legacy counter', async () => {
  for (const [expected, actual] of [[text(0, 'old'), text(0, 'other')], ['{"name":"old"}', '{"name":"other"}']]) {
    const db = fakeIdb(actual), localStorage = memoryLocal();
    const result = await commitSnapshot(opts(db, localStorage, { expectedIdb: expected, locks: memoryLocks() }));
    assert.equal(result.conflict, true); assert.equal(result.ok, false);
    assert.equal(db.values.get(KEY), actual); assert.equal(db.puts, 0); assert.equal(localStorage.writes, 0);
  }
});

test('a changed localStorage copy prevents an IDB write before it begins', async () => {
  const db = fakeIdb(), localStorage = memoryLocal(text(0, 'other'));
  const result = await commitSnapshot(opts(db, localStorage, { locks: memoryLocks() }));
  assert.equal(result.conflict, true); assert.equal(db.transactions.length, 0);
  assert.equal(localStorage.writes, 0); assert.equal(db.values.size, 0);
});

test('a generic IDB abort falls back under the same lock and returns exact acknowledged metadata', async () => {
  const initial = text(0, 'old'), db = fakeIdb(initial, [{ abortAfterRead: true }]);
  const localStorage = memoryLocal(initial), locks = memoryLocks();
  const set = localStorage.setItem;
  localStorage.setItem = function (key, value) { assert.equal(db.aborted, 1, 'abort must finish before fallback'); return set.call(this, key, value); };
  const first = await commitSnapshot(opts(db, localStorage, { expectedIdb: initial, expectedLs: initial, locks }));
  assert.equal(first.ok, true); assert.equal(first.mode, 'ls'); assert.equal(db.aborted, 1);
  assert.equal(db.values.get(KEY), initial, 'aborted IDB puts do not persist');
  assert.equal(first.idbValue, initial); assert.equal(first.lsValue, text(1, 'new'));
  assert.equal(localStorage.getItem(LS_KEY), first.lsValue, 'reload sees the acknowledged fallback value');
  const second = await commitSnapshot(opts(db, localStorage, { mode: first.mode, expectedIdb: first.idbValue, expectedLs: first.lsValue, data: text(2, 'next'), locks }));
  assert.equal(second.ok, true); assert.equal(second.mode, 'ls');
  assert.equal(second.idbValue, initial); assert.equal(second.lsValue, text(2, 'next'));
  assert.deepEqual(locks.names, ['otjang-store:' + KEY, 'otjang-store:' + KEY]);
});

test('an IDB read error cannot hide an unobserved newer snapshot with fallback', async () => {
  for (const mode of ['idb', 'ls']) {
    const initial = text(0, 'old'), actual = text(1, 'other'), db = fakeIdb(actual, [{ getError: true }]), localStorage = memoryLocal(initial);
    const result = await commitSnapshot(opts(db, localStorage, { mode, expectedIdb: initial, expectedLs: initial, data: text(2, 'stale'), locks: memoryLocks() }));
    assert.equal(result.ok, false); assert.equal(result.mode, mode); assert.equal(result.reason, 'idb_unverified');
    assert.equal(db.aborted, 1); assert.equal(db.values.get(KEY), actual); assert.equal(localStorage.writes, 0);
    assert.equal(result.idbValue, undefined, 'unreadable IDB baseline must not be invented');
    assert.equal(localStorage.getItem(LS_KEY), initial);
  }
});

test('both stores failing leaves the old snapshots untouched', async () => {
  const initial = text(0, 'old'), db = fakeIdb(initial, [{ putError: true }]), localStorage = memoryLocal(initial);
  localStorage.denyWrite = true;
  const result = await commitSnapshot(opts(db, localStorage, { expectedIdb: initial, expectedLs: initial, locks: memoryLocks() }));
  assert.equal(result.ok, false); assert.equal(result.conflict, false);
  assert.equal(db.values.get(KEY), initial); assert.equal(localStorage.getItem(LS_KEY), initial);
  assert.equal(result.idbValue, initial); assert.equal(result.lsValue, initial);
});

test('a fallback copy which changes during an IDB abort is never overwritten', async () => {
  const initial = text(0, 'old'), actual = text(1, 'other'), localStorage = memoryLocal(initial);
  const db = fakeIdb(initial, [{ abortAfterRead: true, afterRead() { localStorage.values.set(LS_KEY, actual); } }]);
  const result = await commitSnapshot(opts(db, localStorage, { expectedIdb: initial, expectedLs: initial, locks: memoryLocks() }));
  assert.equal(result.ok, false); assert.equal(result.conflict, true);
  assert.equal(db.values.get(KEY), initial); assert.equal(localStorage.getItem(LS_KEY), actual);
  assert.equal(localStorage.writes, 0);
});

test('localStorage cannot save without a lock when IDB is missing or aborts', async () => {
  for (const [db, mode] of [[null, 'ls'], [null, 'idb'], [fakeIdb(null, [{ putError: true }]), 'idb']]) {
    const localStorage = memoryLocal();
    const result = await commitSnapshot(opts(db, localStorage, { mode }));
    assert.equal(result.ok, false); assert.equal(result.conflict, false); assert.equal(result.reason, 'fallback_requires_lock');
    assert.equal(localStorage.writes, 0); assert.equal(localStorage.getItem(LS_KEY), null);
    if (db) assert.equal(db.values.size, 0);
  }
});

test('two fallback tabs use one shared lock so only the first snapshot commits', async () => {
  const localStorage = memoryLocal(), locks = memoryLocks();
  const [first, second] = await Promise.all([
    commitSnapshot(opts(null, localStorage, { locks, data: text(1, 'first') })),
    commitSnapshot(opts(null, localStorage, { locks, data: text(1, 'second') }))
  ]);
  assert.equal(first.ok, true); assert.equal(second.conflict, true); assert.equal(second.ok, false);
  assert.equal(localStorage.getItem(LS_KEY), text(1, 'first')); assert.equal(localStorage.writes, 1);
});

test('a queued retry keeps its original baseline after the first save fails', async () => {
  const initial = text(0, 'old'), db = fakeIdb(initial, [{ putError: true }]), localStorage = memoryLocal(initial), locks = memoryLocks();
  let acknowledged = { idbValue: initial, lsValue: initial }, queue = Promise.resolve();
  const enqueue = (data, after) => {
    const persist = async () => {
      const result = await commitSnapshot(opts(db, localStorage, { expectedIdb: acknowledged.idbValue, expectedLs: acknowledged.lsValue, locks, data }));
      if (result.ok) acknowledged = { idbValue: result.idbValue, lsValue: result.lsValue };
      if (after) after(result);
      return result;
    };
    queue = queue.then(persist); return queue;
  };
  localStorage.denyWrite = true;
  const first = enqueue(text(1, 'first'), () => { localStorage.denyWrite = false; });
  const second = enqueue(text(2, 'second'));
  assert.equal((await first).ok, false);
  assert.equal((await second).ok, true);
  assert.equal(db.values.get(KEY), text(2, 'second')); assert.equal(localStorage.getItem(LS_KEY), initial);
  assert.equal(acknowledged.idbValue, text(2, 'second')); assert.equal(acknowledged.lsValue, initial);
});

test('already queued snapshots read the last successful baseline when they execute', async () => {
  const db = fakeIdb(), localStorage = memoryLocal(), locks = memoryLocks();
  let acknowledged = { idbValue: null, lsValue: null }, queue = Promise.resolve();
  const enqueue = (data) => {
    const persist = async () => {
      const result = await commitSnapshot(opts(db, localStorage, { expectedIdb: acknowledged.idbValue, expectedLs: acknowledged.lsValue, locks, data }));
      if (result.ok) acknowledged = { idbValue: result.idbValue, lsValue: result.lsValue };
      return result;
    };
    queue = queue.then(persist); return queue;
  };
  const first = enqueue(text(1, 'first')), second = enqueue(text(2, 'second'));
  assert.equal((await first).ok, true); assert.equal((await second).ok, true);
  assert.equal(db.values.get(KEY), text(2, 'second')); assert.equal(localStorage.writes, 0);
});

test('a broken IDB connection cannot use fallback without verifying its existing snapshot', async () => {
  const db = { transaction() { throw new Error('closed'); } }, localStorage = memoryLocal();
  const result = await commitSnapshot(opts(db, localStorage, { locks: memoryLocks() }));
  assert.equal(result.ok, false); assert.equal(result.mode, 'idb'); assert.equal(result.idbValue, undefined);
  assert.equal(result.reason, 'idb_unverified'); assert.equal(localStorage.writes, 0);
  const otherLocal = memoryLocal();
  const denied = await commitSnapshot(opts(db, otherLocal));
  assert.equal(denied.ok, false); assert.equal(otherLocal.writes, 0);
});

test('a stale IDB copy cannot bypass a conflict when the current mode is fallback', async () => {
  const initial = text(0, 'old'), actual = text(0, 'other'), db = fakeIdb(actual), localStorage = memoryLocal(initial);
  const result = await commitSnapshot(opts(db, localStorage, { mode: 'ls', expectedIdb: initial, expectedLs: initial, locks: memoryLocks() }));
  assert.equal(result.conflict, true); assert.equal(result.ok, false);
  assert.equal(localStorage.getItem(LS_KEY), initial); assert.equal(localStorage.writes, 0);
  assert.equal(db.values.get(KEY), actual);
});

test('missing baseline, unavailable locks, and unreadable fallback stores fail closed', async () => {
  const db = fakeIdb(), localStorage = memoryLocal();
  assert.equal((await commitSnapshot(opts(db, localStorage, { expectedIdb: undefined }))).reason, 'invalid_arguments');
  assert.equal((await commitSnapshot(opts(db, localStorage, { locks: { request() { throw new Error('denied'); } } }))).reason, 'lock_unavailable');
  localStorage.denyRead = true;
  assert.equal((await commitSnapshot(opts(db, localStorage, { locks: memoryLocks() }))).reason, 'local_storage_unavailable');
  assert.equal(db.puts, 0); assert.equal(localStorage.writes, 0);
});
