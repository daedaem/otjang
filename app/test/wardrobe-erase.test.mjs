import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { eraseWardrobeData, WARDROBE_ERASE_SCOPE } from '../src/wardrobe-erase.js';

const currentName = 'eoul-wardrobe-v2',
  legacyName = 'eoul';
const storageKeys = ['eoul:v1', 'eoul:v2', 'eoul:v2:unreadable'];
const photograph = new Blob([new Uint8Array([255, 216, 255, 7])], { type: 'image/jpeg' });

function storage(
  initial = [
    ['eoul:v1', 'synthetic legacy text'],
    ['eoul:v2', 'synthetic newer text'],
    ['eoul:v2:unreadable', 'synthetic unreadable source'],
    ['other-app', 'keep me'],
    ['eoul:v1:unrelated', 'also keep'],
    ['eoul:probe', 'untouched probe'],
  ],
) {
  const rows = new Map(initial),
    calls = [];
  return {
    rows,
    calls,
    getItem(key) {
      calls.push(['get', key]);
      return rows.get(key) ?? null;
    },
    removeItem(key) {
      calls.push(['remove', key]);
      rows.delete(key);
    },
  };
}
function open(indexedDB, name, version = 1, initialize) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => initialize?.(request.result, request.transaction);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
async function seed(indexedDB, name, version = 1, stores = ['records', 'photos', 'recovery']) {
  const db = await open(indexedDB, name, version, (db) => stores.forEach((name) => db.createObjectStore(name)));
  await new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const name of stores) {
      tx.objectStore(name).put(
        name === 'photos' ? photograph : { unrecognizedRawField: 'synthetic source' },
        'arbitrary-key',
      );
    }
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}
async function counts(indexedDB, name, version = 1) {
  const db = await open(indexedDB, name, version);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([...db.objectStoreNames], 'readonly'),
        requests = new Map();
      for (const name of db.objectStoreNames) requests.set(name, tx.objectStore(name).count());
      tx.oncomplete = () => resolve(Object.fromEntries([...requests].map(([name, request]) => [name, request.result])));
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

test('explicit erase clears all current/legacy rows and recovery evidence, preserving other apps and DB layouts', async () => {
  const indexedDB = new IDBFactory(),
    localStorage = storage();
  await seed(indexedDB, currentName);
  await seed(indexedDB, legacyName, 1, ['photos']);
  await seed(indexedDB, 'other-app-db');
  const result = await eraseWardrobeData({ indexedDB, localStorage });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.databases.map((entry) => entry.status),
    ['cleared', 'cleared'],
  );
  assert.deepEqual(await counts(indexedDB, currentName), { photos: 0, records: 0, recovery: 0 });
  assert.deepEqual(await counts(indexedDB, legacyName), { photos: 0 });
  assert.deepEqual(await counts(indexedDB, 'other-app-db'), { photos: 1, records: 1, recovery: 1 });
  assert.deepEqual(
    [...localStorage.rows],
    [
      ['other-app', 'keep me'],
      ['eoul:v1:unrelated', 'also keep'],
      ['eoul:probe', 'untouched probe'],
    ],
  );
  assert.ok(localStorage.calls.every(([, key]) => storageKeys.includes(key)));
  assert.deepEqual(WARDROBE_ERASE_SCOPE.databases, [currentName, legacyName]);
  assert.deepEqual(WARDROBE_ERASE_SCOPE.localStorageKeys, storageKeys);
  assert.deepEqual(
    result.localStorageEntries.map((entry) => [entry.key, entry.status]),
    storageKeys.map((key) => [key, 'removed']),
  );
  assert.equal(result.localStorage, result.localStorageEntries[0]);
});

test('missing databases are treated as absent without creating an empty legacy/current DB', async () => {
  const indexedDB = new IDBFactory(),
    localStorage = storage();
  const result = await eraseWardrobeData({ indexedDB, localStorage });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.databases.map((entry) => entry.status),
    ['absent', 'absent'],
  );
  assert.deepEqual(await indexedDB.databases(), []);
});

test('higher-version legacy DB preserves its records and localStorage after current DB is cleared', async () => {
  const indexedDB = new IDBFactory(),
    localStorage = storage();
  await seed(indexedDB, currentName);
  await seed(indexedDB, legacyName, 2, ['photos', 'future-records']);
  await assert.rejects(eraseWardrobeData({ indexedDB, localStorage }), (error) => {
    assert.equal(error.name, 'WardrobeEraseError');
    assert.equal(error.code, 'higher-version');
    assert.deepEqual(
      error.result.databases.map((entry) => entry.status),
      ['cleared', 'retained'],
    );
    assert.deepEqual(error.result.mayRemain, [legacyName, ...storageKeys]);
    assert.match(error.message, /eoul-wardrobe-v2.*eoul.*eoul:v1/);
    return true;
  });
  assert.deepEqual(await counts(indexedDB, currentName), { photos: 0, records: 0, recovery: 0 });
  assert.deepEqual(await counts(indexedDB, legacyName, 2), { 'future-records': 1, photos: 1 });
  assert.equal(localStorage.rows.get('eoul:v1'), 'synthetic legacy text');
  assert.ok(storageKeys.every((key) => localStorage.rows.has(key)));
  assert.equal(localStorage.calls.filter(([action]) => action === 'remove').length, 0);
});

test('a clear failure rolls back the complete DB transaction and reports the untouched later scopes', async () => {
  const indexedDB = new IDBFactory(),
    localStorage = storage();
  await seed(indexedDB, currentName);
  await seed(indexedDB, legacyName, 1, ['photos']);
  const original = IDBObjectStore.prototype.clear;
  IDBObjectStore.prototype.clear = function () {
    if (this.name === 'records') throw new DOMException('synthetic quota', 'QuotaExceededError');
    return original.call(this);
  };
  try {
    await assert.rejects(eraseWardrobeData({ indexedDB, localStorage }), (error) => {
      assert.equal(error.result.databases[0].status, 'retained');
      assert.equal(error.result.databases[1].status, 'not-started');
      assert.equal(error.result.localStorage.status, 'retained');
      return true;
    });
  } finally {
    IDBObjectStore.prototype.clear = original;
  }
  assert.deepEqual(await counts(indexedDB, currentName), { photos: 1, records: 1, recovery: 1 });
  assert.deepEqual(await counts(indexedDB, legacyName), { photos: 1 });
  assert.ok(localStorage.rows.has('eoul:v1'));
});

test('success and localStorage removal occur only after both clear transactions complete', async () => {
  const indexedDB = new IDBFactory(),
    localStorage = storage();
  await seed(indexedDB, currentName);
  await seed(indexedDB, legacyName, 1, ['photos']);
  let resolved = false,
    successfulClears = 0;
  const original = IDBObjectStore.prototype.clear;
  IDBObjectStore.prototype.clear = function () {
    const request = original.call(this);
    request.onsuccess = () => {
      successfulClears += 1;
      assert.equal(resolved, false);
      assert.ok(storageKeys.every((key) => localStorage.rows.has(key)));
    };
    return request;
  };
  try {
    const result = await eraseWardrobeData({ indexedDB, localStorage }).then((result) => {
      resolved = true;
      return result;
    });
    assert.equal(result.ok, true);
    assert.equal(successfulClears, 4);
    assert.ok(storageKeys.every((key) => !localStorage.rows.has(key)));
  } finally {
    IDBObjectStore.prototype.clear = original;
  }
});

test('blocked defaults to five seconds; a late open never clears records or changes the uncertain failure snapshot', async (context) => {
  const factory = new IDBFactory(),
    localStorage = storage();
  await seed(factory, currentName);
  await seed(factory, legacyName, 1, ['photos']);
  let release;
  const indexedDB = {
    open(name, version) {
      assert.equal(name, currentName);
      const delayed = {};
      queueMicrotask(() => delayed.onblocked?.());
      release = () =>
        new Promise((resolve, reject) => {
          const actual = factory.open(name, version);
          actual.onerror = () => reject(actual.error);
          actual.onsuccess = () => {
            delayed.result = actual.result;
            delayed.onsuccess?.();
            resolve();
          };
        });
      return delayed;
    },
    deleteDatabase() {
      throw new Error('uncancellable deletion must not be used');
    },
  };
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let snapshot,
    settled = false;
  const pending = eraseWardrobeData({ indexedDB, localStorage }).finally(() => {
    settled = true;
  });
  const rejection = assert.rejects(pending, (error) => {
    snapshot = error.result;
    assert.equal(error.code, 'blocked');
    assert.equal(snapshot.databases[0].status, 'uncertain');
    assert.deepEqual(snapshot.uncertain, [currentName]);
    assert.equal(snapshot.ok, false);
    return true;
  });
  await Promise.resolve();
  context.mock.timers.tick(4999);
  await Promise.resolve();
  assert.equal(settled, false);
  context.mock.timers.tick(1);
  await rejection;
  context.mock.timers.reset();
  const originalSnapshot = structuredClone(snapshot);
  await release();
  assert.deepEqual(snapshot, originalSnapshot);
  assert.deepEqual(await counts(factory, currentName), { photos: 1, records: 1, recovery: 1 });
  assert.ok(localStorage.rows.has('eoul:v1'));
});

test('a transaction timeout aborts the pending clear and cannot later report success or remove the legacy source', async (context) => {
  const indexedDB = new IDBFactory(),
    localStorage = storage();
  await seed(indexedDB, currentName);
  await seed(indexedDB, legacyName, 1, ['photos']);
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const original = IDBObjectStore.prototype.clear;
  IDBObjectStore.prototype.clear = function () {
    const request = original.call(this);
    if (this.name === 'records')
      request.onsuccess = () => {
        // A real fake-indexeddb request keeps the transaction active while its
        // deadline expires after clear requests succeeded but before commit.
        const pending = this.count();
        pending.onerror = (event) => event.preventDefault();
        context.mock.timers.tick(5000);
      };
    return request;
  };
  let snapshot;
  try {
    await assert.rejects(eraseWardrobeData({ indexedDB, localStorage }), (error) => {
      snapshot = error.result;
      assert.equal(error.code, 'timeout');
      assert.equal(snapshot.databases[0].status, 'uncertain');
      assert.equal(snapshot.databases[0].phase, 'clearing');
      assert.equal(snapshot.databases[1].status, 'not-started');
      return true;
    });
  } finally {
    IDBObjectStore.prototype.clear = original;
    context.mock.timers.reset();
  }
  const beforeLateAbort = structuredClone(snapshot);
  assert.deepEqual(await counts(indexedDB, currentName), { photos: 1, records: 1, recovery: 1 });
  assert.deepEqual(snapshot, beforeLateAbort);
  assert.ok(localStorage.rows.has('eoul:v1'));
});

test('a localStorage removal that does not take effect is never acknowledged as success', async () => {
  const indexedDB = new IDBFactory(),
    localStorage = storage();
  await seed(indexedDB, currentName);
  await seed(indexedDB, legacyName, 1, ['photos']);
  localStorage.removeItem = () => {};
  await assert.rejects(eraseWardrobeData({ indexedDB, localStorage }), (error) => {
    assert.equal(error.result.ok, false);
    assert.equal(error.result.localStorage.status, 'retained');
    assert.deepEqual(error.result.mayRemain, storageKeys);
    return true;
  });
});

test('localStorage failure reports already-cleared databases and the retained legacy key', async () => {
  const indexedDB = new IDBFactory(),
    localStorage = storage();
  await seed(indexedDB, currentName);
  await seed(indexedDB, legacyName, 1, ['photos']);
  localStorage.removeItem = () => {
    throw new DOMException('synthetic storage denial', 'SecurityError');
  };
  await assert.rejects(eraseWardrobeData({ indexedDB, localStorage }), (error) => {
    assert.deepEqual(
      error.result.databases.map((entry) => entry.status),
      ['cleared', 'cleared'],
    );
    assert.equal(error.result.localStorage.status, 'retained');
    assert.deepEqual(error.result.mayRemain, storageKeys);
    assert.equal(error.result.ok, false);
    return true;
  });
  assert.ok(localStorage.rows.has('eoul:v1'));
});

test('all three source keys are inspected before the first database operation', async () => {
  const factory = new IDBFactory(),
    localStorage = storage();
  const indexedDB = {
    open(name, version) {
      assert.deepEqual(
        localStorage.calls.filter(([action]) => action === 'get').slice(0, 3),
        storageKeys.map((key) => ['get', key]),
      );
      return factory.open(name, version);
    },
  };
  const result = await eraseWardrobeData({ indexedDB, localStorage });
  assert.equal(result.ok, true);
});

test('an unreadable source key fails before database mutation and reports that exact uncertain key', async () => {
  const indexedDB = new IDBFactory(),
    localStorage = storage();
  await seed(indexedDB, currentName);
  await seed(indexedDB, legacyName, 1, ['photos']);
  const getItem = localStorage.getItem;
  localStorage.getItem = (key) => {
    if (key === 'eoul:v2') throw new DOMException('synthetic access denial', 'SecurityError');
    return getItem(key);
  };
  await assert.rejects(eraseWardrobeData({ indexedDB, localStorage }), (error) => {
    assert.deepEqual(
      error.result.databases.map((entry) => entry.status),
      ['not-started', 'not-started'],
    );
    assert.deepEqual(
      error.result.localStorageEntries.map((entry) => entry.status),
      ['retained', 'uncertain', 'not-started'],
    );
    assert.deepEqual(error.result.uncertain, ['eoul:v2']);
    assert.deepEqual(error.result.mayRemain, [currentName, legacyName, ...storageKeys]);
    assert.doesNotMatch(error.message, /eoul:probe|other-app/);
    return true;
  });
  assert.deepEqual(await counts(indexedDB, currentName), { photos: 1, records: 1, recovery: 1 });
  assert.deepEqual(await counts(indexedDB, legacyName), { photos: 1 });
  assert.ok(storageKeys.every((key) => localStorage.rows.has(key)));
  assert.equal(localStorage.calls.filter(([action]) => action === 'remove').length, 0);
});

test('failure while removing v2 reports v1 completed and the two later sources retained', async () => {
  const indexedDB = new IDBFactory(),
    localStorage = storage();
  await seed(indexedDB, currentName);
  await seed(indexedDB, legacyName, 1, ['photos']);
  const removeItem = localStorage.removeItem;
  localStorage.removeItem = (key) => {
    if (key === 'eoul:v2') throw new DOMException('synthetic remove denial', 'SecurityError');
    removeItem(key);
  };
  await assert.rejects(eraseWardrobeData({ indexedDB, localStorage }), (error) => {
    assert.deepEqual(
      error.result.databases.map((entry) => entry.status),
      ['cleared', 'cleared'],
    );
    assert.deepEqual(
      error.result.localStorageEntries.map((entry) => entry.status),
      ['removed', 'retained', 'retained'],
    );
    assert.equal(error.result.localStorage.status, 'removed');
    assert.deepEqual(error.result.mayRemain, ['eoul:v2', 'eoul:v2:unreadable']);
    assert.doesNotMatch(error.message, /eoul:probe|other-app/);
    return true;
  });
  assert.equal(localStorage.rows.has('eoul:v1'), false);
  assert.equal(localStorage.rows.get('eoul:v2'), 'synthetic newer text');
  assert.equal(localStorage.rows.get('eoul:v2:unreadable'), 'synthetic unreadable source');
  assert.equal(localStorage.rows.get('eoul:probe'), 'untouched probe');
});

test('post-removal access failure keeps only that source uncertain and does not remove the later raw recovery key', async () => {
  const indexedDB = new IDBFactory(),
    localStorage = storage();
  const getItem = localStorage.getItem;
  localStorage.getItem = (key) => {
    if (key === 'eoul:v2' && !localStorage.rows.has(key))
      throw new DOMException('synthetic verification denial', 'SecurityError');
    return getItem(key);
  };
  await assert.rejects(eraseWardrobeData({ indexedDB, localStorage }), (error) => {
    assert.equal(error.result.ok, false);
    assert.deepEqual(
      error.result.localStorageEntries.map((entry) => entry.status),
      ['removed', 'uncertain', 'retained'],
    );
    assert.deepEqual(error.result.mayRemain, ['eoul:v2', 'eoul:v2:unreadable']);
    assert.deepEqual(error.result.uncertain, ['eoul:v2']);
    return true;
  });
  assert.equal(localStorage.rows.has('eoul:v2'), false);
  assert.equal(localStorage.rows.has('eoul:v2:unreadable'), true);
});
