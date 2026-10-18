import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { legacyWardrobeV2 } from '../src/legacy-wardrobe.js';
import { createWardrobeStore, photoAsset } from '../src/wardrobe-store.js';
import { readLegacyPhotos } from '../src/legacy-photos.js';
import { newWardrobeState, makeGarment, WARDROBE_SCHEMA } from '../src/wardrobe.js';
import { CATALOG } from '../src/data/products.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-experience-test-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html
  .match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(
    /\n\}\)\(\);\s*$/,
    '\nglobalThis.testApp = { state: () => state, ready: appReady, draft: () => draft, store: wardrobeStore, itemSheet, render, recommendItems, recommendLooks, essentials, productsFor, search, lookCard, showLook: (look) => { lastLooks = [look]; lookSheet(0); }, chooseGarmentPhoto, chooseWardrobeBackup, saveGarmentDraft };\n})();',
  );

// Actual bundled callbacks and IDB transactions; DOM, decoding and canvas are test doubles.
// This is persistence/flow verification, not browser layout or real camera QA.
async function boot(initial = new Map(), indexedDB = new IDBFactory()) {
  const storage = initial,
    urls = new Map();
  let nextURL = 0;
  const nodes = new Map(
    ['app', 'sheet-root', 'toast'].map((id) => [
      id,
      {
        innerHTML: '',
        classList: { add() {}, remove() {} },
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return [];
        },
      },
    ]),
  );
  const listeners = new Map();
  class FakeImage {
    naturalWidth = 800;
    naturalHeight = 1000;
    decode() {
      return urls.get(this.src)?.decodePromise || Promise.resolve();
    }
  }
  const context = vm.createContext({
    indexedDB,
    Blob,
    crypto: globalThis.crypto,
    structuredClone,
    btoa,
    atob,
    Uint8Array,
    DataView,
    TextEncoder,
    TextDecoder,
    URL: {
      createObjectURL(blob) {
        const id = `blob:test/${++nextURL}`;
        urls.set(id, blob);
        return id;
      },
      revokeObjectURL(id) {
        urls.delete(id);
      },
    },
    Image: FakeImage,
    HTMLImageElement: FakeImage,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) {
        const list = listeners.get(type) || [];
        list.push(fn);
        listeners.set(type, list);
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      body: { style: {}, append() {} },
      createElement(tag) {
        if (tag !== 'canvas') return { click() {}, remove() {} };
        let outputBlob;
        return {
          getContext() {
            return {
              fillRect() {},
              drawImage(image) {
                outputBlob = urls.get(image.src);
              },
            };
          },
          toBlob(callback) {
            callback(outputBlob);
          },
        };
      },
    },
    window: { scrollTo() {} },
    CSS: { escape: (value) => value },
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  await context.testApp.ready;
  return {
    app: context.testApp,
    storage,
    nodes,
    indexedDB,
    urls,
    click(dataset) {
      return Promise.all(
        listeners
          .get('click')
          .map((fn) => fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} })),
      );
    },
    input(id, value) {
      for (const fn of listeners.get('input')) fn({ target: { id, value } });
    },
    state() {
      return JSON.parse(JSON.stringify(context.testApp.state()));
    },
  };
}
const jpeg = (value = 7) => new Blob([new Uint8Array([255, 216, 255, value])], { type: 'image/jpeg' });
function delayedDatabaseOpen(factory, shouldDelay) {
  let holding = false,
    release,
    entered;
  const pause = new Promise((resolve) => (release = resolve)),
    started = new Promise((resolve) => (entered = resolve));
  return {
    indexedDB: {
      open(name, version) {
        const request = version === undefined ? factory.open(name) : factory.open(name, version);
        if (!holding || !shouldDelay(name, version)) return request;
        const delayed = {};
        for (const property of ['result', 'transaction', 'error'])
          Object.defineProperty(delayed, property, { get: () => request[property] });
        for (const event of ['onblocked', 'onerror', 'onupgradeneeded'])
          request[event] = (value) => delayed[event]?.(value);
        request.onsuccess = async (event) => {
          entered();
          await pause;
          delayed.onsuccess?.(event);
        };
        return delayed;
      },
    },
    hold() {
      holding = true;
    },
    started,
    release: () => release(),
  };
}
async function manifest(file) {
  const header = Buffer.from(await file.slice(0, 12).arrayBuffer());
  return JSON.parse(await file.slice(12, 12 + header.readUInt32LE(8)).text());
}
async function add(page, kind = 'shirt', label = '') {
  await page.click({ action: 'add-start' });
  await page.click({ action: 'draft-kind', kind });
  page.input('garment-label', label);
  await page.click({ action: 'draft-save' });
}
async function mutateWardrobeDB(indexedDB, change) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('eoul-wardrobe-v2');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'photos'], 'readwrite');
      change(tx);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function seedSyntheticDB(indexedDB, name, version, storeName, key, value) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function syntheticDBRows(indexedDB, name, version = 1) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([...db.objectStoreNames], 'readonly'),
        requests = new Map();
      for (const name of db.objectStoreNames) requests.set(name, tx.objectStore(name).getAll());
      tx.oncomplete = () => resolve(Object.fromEntries([...requests].map(([name, request]) => [name, request.result])));
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function addWithPhoto(page, kind, label, file = jpeg()) {
  await page.click({ action: 'add-start' });
  await page.click({ action: 'draft-kind', kind });
  page.input('garment-label', label);
  await page.app.chooseGarmentPhoto(file);
  await page.click({ action: 'draft-save' });
}
async function confirmFullErase(page) {
  await page.click({ action: 'erase-review' });
  await page.click({ action: 'erase-confirm' });
  await page.click({ action: 'erase-execute' });
}
const oldState = { onboarded: true, gender: 'M', style: 'classic', owned: ['m-tee-white'], saved: ['ms-404474'] };
const newerSourceRaw = JSON.stringify({
  v: 2,
  onboarded: true,
  gender: 'M',
  styles: ['classic'],
  brands: [],
  brandOnly: false,
  occasion: null,
  budget: null,
  closet: [{ id: 'c_source_v2', slot: 'm-oxford', color: 'white', photo: false, addedAt: 1791907200000 }],
  saved: [],
  hidden: [],
  example: false,
});
test('first visit has six labeled examples and brand/style recommendations without mandatory onboarding', async () => {
  const page = await boot();
  assert.equal(page.state().demo, true);
  assert.equal(page.state().closet.length, 6);
  assert.equal(page.state().garments.length, 0);
  assert.match(page.nodes.get('app').innerHTML, /예시 옷 6벌로 바로 체험 중/);
  assert.ok(page.app.recommendItems(page.app.state()).length >= 3);
  await page.click({ action: 'set-gender', g: 'F' });
  assert.equal(page.state().closet.length, 6);
  assert.ok(page.state().closet.every((i) => i.gender === 'F'));
  await page.click({ action: 'close-sheet' });
  await page.click({ action: 'open-look', index: '0' });
  assert.doesNotMatch(page.nodes.get('sheet-root').innerHTML, />보유</);
});

test('new upstream eoul:v2 source is preserved and explicitly shown as a separate unimported wardrobe', async () => {
  const raw = JSON.stringify({ v: 2, closet: [{ id: 'upstream-only', slot: 'm-oxford', photo: true }] });
  const page = await boot(new Map([['eoul:v2', raw]]));
  assert.equal(page.storage.get('eoul:v2'), raw);
  assert.match(page.nodes.get('app').innerHTML, /Claude 최신 버전의 기록이 별도로/);
  assert.match(page.nodes.get('app').innerHTML, /자동 이전되지 않았으며 원본은 유지/);
  assert.equal(page.state().garments.length, 0);
  assert.equal(page.state().demo, true);
});
test('v1 migration preserves source bytes, preferences, IDs and saved products across reload', async () => {
  const raw = JSON.stringify(oldState),
    page = await boot(new Map([['eoul:v1', raw]]));
  assert.equal(page.state().demo, false);
  assert.equal(page.state().garments[0].id, 'legacy_m-tee-white');
  assert.equal(page.state().garments[0].slot, 'm-tee');
  assert.equal(page.storage.get('eoul:v1'), raw);
  const again = await boot(page.storage, page.indexedDB);
  assert.deepEqual(again.state(), page.state());
});
test('cancel leaves examples intact; first successful personal save replaces examples only once', async () => {
  const page = await boot();
  await page.click({ action: 'add-start' });
  await page.click({ action: 'close-sheet' });
  assert.equal(page.state().demo, true);
  await add(page, 'shirt', '출근 셔츠');
  assert.equal(page.state().demo, false);
  assert.equal(page.state().garments.length, 1);
  assert.equal(page.state().garments[0].label, '출근 셔츠');
  assert.equal(page.state().garments[0].color, null);
  await add(page, 'shirt', '주말 셔츠');
  assert.equal(new Set(page.state().garments.map((i) => i.id)).size, 2);
});
test('photo, name and unknown color survive reload and appear in wardrobe and outfit data', async () => {
  const page = await boot();
  await page.click({ action: 'add-start' });
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  page.input('garment-label', '내 셔츠');
  await page.app.chooseGarmentPhoto(jpeg());
  await page.click({ action: 'draft-save' });
  assert.equal(page.state().garments.length, 1);
  assert.match(page.nodes.get('app').innerHTML, /blob:test/);
  assert.match(page.nodes.get('app').innerHTML, /내 셔츠/);
  const again = await boot(page.storage, page.indexedDB);
  assert.equal((await again.app.store.read()).photos.size, 1);
  assert.equal(again.state().garments[0].color, null);
  assert.ok(
    again.app
      .recommendLooks(again.app.state(), { limit: 30 })
      .some((r) => r.items.some((i) => i.owned && i.item.label === '내 셔츠')),
  );
});
test('photo quota failure retains draft and demo, succeeds only after atomic retry', async () => {
  const page = await boot();
  await page.click({ action: 'add-start' });
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  page.input('garment-label', '실패 초안');
  await page.app.chooseGarmentPhoto(jpeg());
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'photos') throw new DOMException('quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try {
    await page.click({ action: 'draft-save' });
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  assert.equal(page.state().demo, true);
  assert.equal(page.app.draft().label, '실패 초안');
  assert.match(page.nodes.get('sheet-root').innerHTML, /저장 공간/);
  await page.click({ action: 'draft-save' });
  assert.equal(page.state().garments.length, 1);
  assert.equal((await page.app.store.read()).photos.size, 1);
});
test('late photo decode cannot reopen cancelled draft or alter the next garment', async () => {
  const page = await boot();
  await page.click({ action: 'add-start' });
  const file = jpeg();
  let finish;
  file.decodePromise = new Promise((r) => (finish = r));
  const pending = page.app.chooseGarmentPhoto(file);
  await page.click({ action: 'close-sheet' });
  await page.click({ action: 'add-start' });
  const id = page.app.draft().id;
  finish();
  await pending;
  assert.equal(page.app.draft().id, id);
  assert.equal(page.app.draft().photoId, null);
});
test('backup previews before overwrite and restores exact photo bytes', async () => {
  const page = await boot();
  await page.click({ action: 'add-start' });
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  await page.app.chooseGarmentPhoto(jpeg());
  await page.click({ action: 'draft-save' });
  const backup = await page.app.store.backup();
  await add(page, 'pants', '추가 바지');
  assert.equal(page.state().garments.length, 2);
  await page.app.chooseWardrobeBackup(backup);
  assert.equal(page.state().garments.length, 2);
  await page.click({ action: 'restore-backup' });
  assert.equal(page.state().garments.length, 1);
  const data = await page.app.store.read();
  assert.deepEqual(
    new Uint8Array(await [...data.photos.values()][0].arrayBuffer()),
    new Uint8Array(await jpeg().arrayBuffer()),
  );
});
test('a missing-photo startup can recover a verified backup only after explicit preservation confirmation', async () => {
  const source = await boot();
  await source.click({ action: 'add-start' });
  await source.click({ action: 'draft-kind', kind: 'shirt' });
  await source.app.chooseGarmentPhoto(jpeg(31));
  await source.click({ action: 'draft-save' });
  const before = await source.app.store.read(),
    backup = await source.app.store.backup();
  await mutateWardrobeDB(source.indexedDB, (tx) => tx.objectStore('photos').delete(before.state.garments[0].photoId));
  const broken = await boot(source.storage, source.indexedDB);
  assert.match(broken.nodes.get('app').innerHTML, /일부 사진을 읽지 못했습니다/);
  assert.match(broken.nodes.get('app').innerHTML, /정상 백업으로 복구/);
  await broken.app.chooseWardrobeBackup(backup);
  assert.match(broken.nodes.get('sheet-root').innerHTML, /원문을 보존하고 이 백업으로 교체/);
  await assert.rejects(broken.app.store.read(), /일부 사진/);
  await broken.click({ action: 'restore-backup' });
  const restored = await broken.app.store.read();
  assert.deepEqual(restored.state, before.state);
  assert.deepEqual(
    new Uint8Array(await [...restored.photos.values()][0].arrayBuffer()),
    new Uint8Array(await jpeg(31).arrayBuffer()),
  );
  assert.match(broken.nodes.get('toast').innerHTML, /옷장과 사진을 복원했어요/);
  const raw = await manifest(await broken.app.store.recoveryBackup());
  assert.ok(
    raw.records.some(
      (row) =>
        row.value?.format === 'eoul-wardrobe-recovery-snapshot' && row.value.source.row.revision === before.revision,
    ),
  );
  await add(broken, 'pants', '복구 후 추가');
  assert.equal((await broken.app.store.read()).state.garments.length, 2);
});
test('future-schema startup explicitly confirms replacement and preserves its raw fields', async () => {
  const source = await boot(),
    backup = await source.app.store.backup();
  const future = { revision: 4, state: { schema: 99, syntheticFutureField: 'keep' } };
  await mutateWardrobeDB(source.indexedDB, (tx) => tx.objectStore('records').put(future, 'current'));
  const broken = await boot(source.storage, source.indexedDB);
  await broken.app.chooseWardrobeBackup(backup);
  assert.match(broken.nodes.get('sheet-root').innerHTML, /지원하지 않는 새 버전/);
  assert.match(broken.nodes.get('sheet-root').innerHTML, /영구 삭제하지 않습니다/);
  await assert.rejects(broken.app.store.read(), /지원하지 않는 옷장 형식/);
  await broken.click({ action: 'restore-backup' });
  const raw = await manifest(await broken.app.store.recoveryBackup());
  const preserved = raw.records.find((row) => row.value?.format === 'eoul-wardrobe-recovery-snapshot');
  assert.deepEqual(preserved.value.source.row, future);
  assert.equal((await broken.app.store.read()).state.schema, WARDROBE_SCHEMA);
});
test('a ready tab with a later failed read confirms preserved recovery before replacing a future record or missing photo', async () => {
  for (const failure of ['future', 'missing-photo']) {
    const page = await boot();
    await addWithPhoto(page, 'shirt', '복구할 셔츠', jpeg(41));
    const before = await page.app.store.read(),
      backup = await page.app.store.backup();
    await page.click({ action: 'add-start' });
    await page.click({ action: 'draft-kind', kind: 'pants' });
    page.input('garment-label', '복구 전 입력 유지');
    const rawRecord =
      failure === 'future'
        ? { revision: before.revision, epoch: before.epoch, state: { schema: 99, syntheticFutureField: 'keep' } }
        : { revision: before.revision, epoch: before.epoch, state: before.state };
    await mutateWardrobeDB(page.indexedDB, (tx) => {
      if (failure === 'future') tx.objectStore('records').put(rawRecord, 'current');
      else tx.objectStore('photos').delete(before.state.garments[0].photoId);
    });
    await page.click({ action: 'reload-wardrobe' });
    assert.equal(page.app.draft().label, '복구 전 입력 유지');
    await assert.rejects(page.app.store.read());
    await page.app.chooseWardrobeBackup(backup);
    assert.match(page.nodes.get('sheet-root').innerHTML, /원문을 보존하고 이 백업으로 교체/);
    const beforeConfirmation = await manifest(await page.app.store.recoveryBackup());
    assert.deepEqual(beforeConfirmation.records, [{ key: 'current', value: rawRecord }]);
    await page.click({ action: 'restore-backup' });
    const restored = await page.app.store.read();
    assert.deepEqual(restored.state, before.state);
    assert.deepEqual(
      new Uint8Array(await [...restored.photos.values()][0].arrayBuffer()),
      new Uint8Array(await jpeg(41).arrayBuffer()),
    );
    const afterConfirmation = await manifest(await page.app.store.recoveryBackup()),
      preserved = afterConfirmation.records.find((row) => row.value?.format === 'eoul-wardrobe-recovery-snapshot');
    assert.deepEqual(preserved.value.source.row, rawRecord);
    assert.equal(preserved.value.photos.length, failure === 'future' ? 1 : 0);
    assert.match(page.nodes.get('toast').innerHTML, /옷장과 사진을 복원했어요/);
    await add(page, 'pants', '복구 후 저장');
    assert.equal((await page.app.store.read()).state.garments.length, 2);
  }
});

test('recovery preservation failure does not display restoration success or replace the broken source', async () => {
  const source = await boot(),
    backup = await source.app.store.backup();
  const invalid = { revision: 4, state: { schema: 99 } };
  await mutateWardrobeDB(source.indexedDB, (tx) => tx.objectStore('records').put(invalid, 'current'));
  const broken = await boot(source.storage, source.indexedDB);
  await broken.app.chooseWardrobeBackup(backup);
  const originalAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) {
    if (this.name === 'records') throw new DOMException('preservation quota', 'QuotaExceededError');
    return originalAdd.apply(this, args);
  };
  try {
    await broken.click({ action: 'restore-backup' });
  } finally {
    IDBObjectStore.prototype.add = originalAdd;
  }
  assert.doesNotMatch(broken.nodes.get('toast').innerHTML, /복원했어요/);
  await assert.rejects(broken.app.store.read());
  const raw = await manifest(await broken.app.store.recoveryBackup());
  assert.deepEqual(raw.records, [{ key: 'current', value: invalid }]);
});
test('recovery confirmation cannot replace a source changed by another tab', async () => {
  const source = await boot(),
    backup = await source.app.store.backup();
  const invalid = { revision: 4, state: { schema: 99, syntheticValue: 'before' } };
  await mutateWardrobeDB(source.indexedDB, (tx) => tx.objectStore('records').put(invalid, 'current'));
  const broken = await boot(source.storage, source.indexedDB);
  await broken.app.chooseWardrobeBackup(backup);
  const changed = { ...invalid, state: { ...invalid.state, syntheticValue: 'other tab' } };
  await mutateWardrobeDB(source.indexedDB, (tx) => tx.objectStore('records').put(changed, 'current'));
  await broken.click({ action: 'restore-backup' });
  assert.doesNotMatch(broken.nodes.get('toast').innerHTML, /복원했어요/);
  assert.match(broken.nodes.get('app').innerHTML, /복구할 자료가 바뀌었습니다/);
  const raw = await manifest(await broken.app.store.recoveryBackup());
  assert.deepEqual(raw.records, [{ key: 'current', value: changed }]);
});
test('current-wardrobe reset labels its scope and retains legacy source material', async () => {
  const raw = JSON.stringify(oldState),
    page = await boot(new Map([['eoul:v1', raw]]));
  await page.click({ action: 'open-settings' });
  assert.match(page.nodes.get('sheet-root').innerHTML, /현재 옷장 비우기/);
  assert.match(page.nodes.get('sheet-root').innerHTML, /이전 버전의 자료와 복구용 사본은 유지/);
  assert.doesNotMatch(page.nodes.get('sheet-root').innerHTML, /모두 지우고 처음부터/);
  await page.click({ action: 'reset', armed: '1' });
  assert.equal(page.state().garments.length, 0);
  assert.equal(page.storage.get('eoul:v1'), raw);
  const again = await boot(page.storage, page.indexedDB);
  assert.equal(again.state().garments.length, 0);
});
test('unknown legacy fields block saving and preserve raw data for recovery export', async () => {
  const raw = JSON.stringify({ ...oldState, futureSecret: 'synthetic' }),
    page = await boot(new Map([['eoul:v1', raw]]));
  await add(page);
  assert.equal(page.state().demo, true);
  assert.equal(page.storage.get('eoul:v1'), raw);
  assert.match(page.nodes.get('app').innerHTML, /원본을 보존/);
  assert.equal((await manifest(await page.app.store.recoveryBackup(raw))).legacyRaw, raw);
});
test('another tab cannot be overwritten; new draft survives reload and appends to current state', async () => {
  const first = await boot(),
    second = await boot(first.storage, first.indexedDB);
  await second.click({ action: 'add-start' });
  await second.click({ action: 'draft-kind', kind: 'shirt' });
  second.input('garment-label', '두 번째');
  await add(first, 'pants', '첫 번째');
  await second.click({ action: 'draft-save' });
  assert.equal(second.state().demo, true);
  assert.match(second.app.draft().error, /다른 화면/);
  await second.click({ action: 'reload-wardrobe' });
  await second.click({ action: 'draft-save' });
  assert.deepEqual(
    second.state().garments.map((i) => i.label),
    ['첫 번째', '두 번째'],
  );
});
test('editing an existing garment detects concurrent changes rather than applying stale fields', async () => {
  const first = await boot();
  await add(first, 'shirt', '원래');
  const id = first.state().garments[0].id;
  const second = await boot(first.storage, first.indexedDB);
  await second.click({ action: 'edit-own', id });
  second.input('garment-label', '오래된 초안');
  await first.click({ action: 'edit-own', id });
  first.input('garment-label', '최신 이름');
  await first.click({ action: 'draft-save' });
  await second.click({ action: 'reload-wardrobe' });
  await second.click({ action: 'draft-save' });
  assert.equal(second.state().garments[0].label, '최신 이름');
  assert.match(second.app.draft().error, /다른 화면/);
});
test('cancelled backup parsing leaves a newer editor intact', async () => {
  const page = await boot(),
    backup = await page.app.store.backup();
  const slice = backup.slice.bind(backup);
  let finish;
  const pause = new Promise((r) => (finish = r));
  let once = true;
  backup.slice = (...args) => {
    const part = slice(...args);
    if (once) {
      once = false;
      const read = part.arrayBuffer.bind(part);
      part.arrayBuffer = async () => {
        await pause;
        return read();
      };
    }
    return part;
  };
  const pending = page.app.chooseWardrobeBackup(backup);
  await page.click({ action: 'close-sheet' });
  await page.click({ action: 'add-start' });
  const id = page.app.draft().id;
  finish();
  await pending;
  assert.equal(page.app.draft().id, id);
  assert.match(page.nodes.get('sheet-root').innerHTML, /옷 한 벌 추가/);
});
test('legacy import keeps edited photos, remembers deletions and persists skipping', async () => {
  const storage = new Map([['eoul:v1', JSON.stringify(oldState)]]),
    page = await boot(storage);
  const id = 'legacy_m-tee-white';
  await page.click({ action: 'edit-own', id });
  page.input('garment-label', '내가 고친 티');
  await page.app.chooseGarmentPhoto(jpeg());
  await page.click({ action: 'draft-save' });
  storage.set('eoul:v1', JSON.stringify({ ...oldState, owned: ['m-tee-white', 'm-blazer'] }));
  await page.click({ action: 'review-legacy' });
  await page.click({ action: 'import-legacy' });
  assert.equal(page.state().garments.find((i) => i.id === id).label, '내가 고친 티');
  assert.equal((await page.app.store.read()).photos.size, 1);
  const deletion = { action: 'remove-own', id };
  await page.click(deletion);
  await page.click(deletion);
  await page.click({ action: 'save', id: 'ms-404474' });
  storage.set('eoul:v1', JSON.stringify({ ...oldState, owned: ['m-tee-white', 'm-blazer', 'm-chino'] }));
  await page.click({ action: 'review-legacy' });
  assert.match(page.nodes.get('sheet-root').innerHTML, /옷 1벌 · 찜 0개/);
  await page.click({ action: 'ignore-legacy' });
  const again = await boot(storage, page.indexedDB);
  assert.equal(again.state().garments.length, 1);
  assert.doesNotMatch(again.nodes.get('app').innerHTML, /이전 버전에서 옷장이 바뀌었어요/);
});
test('missing legacy photo requires explicit confirmation, retains garment and flags photo missing', async () => {
  const raw = JSON.stringify({
    v: 2,
    onboarded: true,
    gender: 'M',
    styles: ['classic'],
    brands: ['리바이스'],
    brandOnly: false,
    occasion: null,
    budget: null,
    closet: [{ id: 'c_old', slot: 'm-oxford', color: 'white', photo: true }],
    saved: [],
    hidden: [],
  });
  const page = await boot(new Map([['eoul:v1', raw]]));
  assert.equal(await page.app.store.read(), null);
  assert.match(page.nodes.get('app').innerHTML, /누락 사진 확인/);
  await page.click({ action: 'review-legacy' });
  assert.match(page.nodes.get('sheet-root').innerHTML, /사진이 저장되지 않았던 옷/);
  await page.click({ action: 'import-legacy' });
  assert.equal(page.state().garments[0].id, 'c_old');
  assert.equal(page.state().garments[0].photoMissing, true);
  assert.equal(page.storage.get('eoul:v1'), raw);
  await add(page, 'pants');
  assert.equal(page.state().garments.length, 2);
});
test('initial legacy photo verification blocks closing and full erase until the durable import finishes', async (context) => {
  const factory = new IDBFactory(),
    delayed = delayedDatabaseOpen(factory, (name, version) => name === 'eoul' && version === 1);
  const raw = JSON.stringify({
    v: 2,
    onboarded: true,
    gender: 'M',
    styles: ['classic'],
    brands: [],
    brandOnly: false,
    occasion: null,
    budget: null,
    closet: [
      { id: 'c_present', slot: 'm-oxford', color: 'white', photo: true },
      { id: 'c_missing', slot: 'm-oxford', color: 'blue', photo: true },
    ],
    saved: [],
    hidden: [],
  });
  await seedSyntheticDB(factory, 'eoul', 1, 'photos', 'c_present', 'data:image/jpeg;base64,/9j/Bw==');
  const page = await boot(new Map([['eoul:v1', raw]]), delayed.indexedDB);
  await page.click({ action: 'review-legacy' });
  const importSheet = page.nodes.get('sheet-root').innerHTML,
    previousPhotos = await syntheticDBRows(factory, 'eoul');
  let releasePhoto, photoEntered;
  const photoPause = new Promise((resolve) => (releasePhoto = resolve)),
    photoStarted = new Promise((resolve) => (photoEntered = resolve));
  const arrayBuffer = Blob.prototype.arrayBuffer;
  let first = true;
  context.mock.method(Blob.prototype, 'arrayBuffer', async function () {
    if (this.type === 'image/jpeg' && first) {
      first = false;
      photoEntered();
      await photoPause;
    }
    return arrayBuffer.call(this);
  });
  const importing = page.click({ action: 'import-legacy' });
  let erasing, eraseOpenedLegacy, closeWasBlocked, whilePending, toastWhilePending;
  try {
    await photoStarted;
    await page.click({ action: 'close-sheet' });
    closeWasBlocked = page.nodes.get('sheet-root').innerHTML === importSheet;
    await page.click({ action: 'erase-review' });
    await page.click({ action: 'erase-confirm' });
    delayed.hold();
    erasing = page.click({ action: 'erase-execute' });
    eraseOpenedLegacy = await Promise.race([erasing.then(() => false), delayed.started.then(() => true)]);
    whilePending = await syntheticDBRows(factory, 'eoul-wardrobe-v2');
    toastWhilePending = page.nodes.get('toast').innerHTML;
    // The old implementation writes imported rows after clearing the current DB,
    // before clearing the legacy DB and falsely acknowledging full deletion.
    releasePhoto();
    await importing;
  } finally {
    releasePhoto();
    delayed.release();
    await importing;
    await erasing;
  }
  assert.equal(closeWasBlocked, true);
  assert.equal(eraseOpenedLegacy, false, 'no clear operation starts while import photo verification is pending');
  assert.deepEqual(whilePending, { photos: [], records: [] });
  assert.doesNotMatch(toastWhilePending, /현재·이전 옷장과 사진·복구 사본을 삭제했어요/);
  assert.equal(page.storage.get('eoul:v1'), raw);
  assert.deepEqual(await syntheticDBRows(factory, 'eoul'), previousPhotos);
  const imported = await page.app.store.read();
  assert.deepEqual(
    imported.state.garments.map((item) => item.id),
    ['c_present', 'c_missing'],
  );
  assert.equal(imported.photos.size, 1);
  await confirmFullErase(page);
  assert.deepEqual((await page.app.store.read()).state.garments, []);
  assert.equal((await page.app.store.read()).photos.size, 0);
  assert.equal(page.storage.has('eoul:v1'), false);
});

test('a cancelled legacy read failure preserves a newer garment draft or final erase confirmation', async () => {
  for (const nextSheet of ['draft', 'erase']) {
    const factory = new IDBFactory(),
      delayed = delayedDatabaseOpen(factory, (name, version) => name === 'eoul' && version === undefined);
    await seedSyntheticDB(factory, 'eoul', 1, 'photos', 'c_bad', 'synthetic invalid photo');
    const page = await boot(new Map([['eoul:v1', JSON.stringify(oldState)]]), delayed.indexedDB);
    const legacy = JSON.parse(newerSourceRaw);
    delete legacy.example;
    legacy.closet = [{ id: 'c_bad', slot: 'm-oxford', color: 'white', photo: true }];
    page.storage.set('eoul:v1', JSON.stringify(legacy));
    delayed.hold();
    const reviewing = page.click({ action: 'review-legacy' });
    await delayed.started;
    await page.click({ action: 'close-sheet' });
    if (nextSheet === 'draft') {
      await page.click({ action: 'add-start' });
      await page.click({ action: 'draft-kind', kind: 'shirt' });
      page.input('garment-label', '유지할 새 입력');
    } else {
      await page.click({ action: 'erase-review' });
      await page.click({ action: 'erase-confirm' });
    }
    const expectedSheet = page.nodes.get('sheet-root').innerHTML,
      draftId = page.app.draft()?.id;
    delayed.release();
    await reviewing;
    assert.equal(page.nodes.get('sheet-root').innerHTML, expectedSheet);
    assert.doesNotMatch(expectedSheet, /이전 기록 확인 필요/);
    if (nextSheet === 'draft') {
      assert.equal(page.app.draft().id, draftId);
      assert.equal(page.app.draft().label, '유지할 새 입력');
      await page.click({ action: 'draft-save' });
      assert.equal((await page.app.store.read()).state.garments.at(-1).label, '유지할 새 입력');
    } else {
      assert.match(expectedSheet, /data-action="erase-execute"/);
      await page.click({ action: 'erase-execute' });
      assert.equal(page.storage.has('eoul:v1'), false);
      assert.deepEqual((await page.app.store.read()).state.garments, []);
    }
  }
});

test('durable UI has no legacy write path and bundled script remains executable', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert.doesNotMatch(source, /localStorage\.setItem|function persist\(|photoPut\(/);
  new vm.Script(script);
});
test('product sheet renders exact item, honest basis and owning it preserves existing personal garments', async () => {
  const page = await boot();
  await add(page, 'shirt', '원래 셔츠');
  await page.click({ action: 'open-item', id: 'ms-728000' });
  assert.match(page.nodes.get('sheet-root').innerHTML, /종류·스타일 규칙/);
  assert.match(page.nodes.get('sheet-root').innerHTML, /무신사/);
  await page.click({ action: 'own-product', id: 'ms-728000' });
  await page.click({ action: 'own-product', id: 'ms-728000' });
  assert.equal(page.state().garments.length, 1, 'opening or repeating a product selection does not confirm ownership');
  assert.match(page.nodes.get('sheet-root').innerHTML, /data-action="owned-catalog-confirm"/);
  await page.click({ action: 'owned-catalog-confirm', id: 'ms-728000' });
  await page.click({ action: 'owned-catalog-confirm', id: 'ms-728000' });
  assert.equal(page.state().garments.length, 2);
  assert.equal(page.state().garments[0].label, '원래 셔츠');
  assert.equal(page.state().garments[1].color, null, 'catalog color is not the owned color without an explicit choice');
});

test('Claude v2 migration preserves photo bytes, duplicate kinds, styles, brands and the original databases', async () => {
  const indexedDB = new IDBFactory();
  const data = 'data:image/jpeg;base64,' + Buffer.from(await jpeg().arrayBuffer()).toString('base64');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('eoul', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(data, 'c_old');
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  const raw = JSON.stringify({
    v: 2,
    onboarded: true,
    gender: 'M',
    styles: ['amekaji', 'classic'],
    brands: ['리바이스'],
    brandOnly: true,
    occasion: 'daily',
    budget: 200000,
    closet: [
      {
        id: 'c_old',
        slot: 'm-oxford',
        color: 'blue',
        brand: '리바이스',
        productId: 'ms-728000',
        photo: true,
        addedAt: 1791907200000,
      },
      { id: 'c_other', slot: 'm-oxford', color: 'white', photo: false },
    ],
    saved: ['ms-999999999'],
    hidden: ['ms-404474'],
  });
  const page = await boot(new Map([['eoul:v1', raw]]), indexedDB),
    snapshot = await page.app.store.read();
  assert.deepEqual(page.state().styles, ['amekaji', 'classic']);
  assert.deepEqual(page.state().brands, ['리바이스']);
  assert.equal(page.state().brandOnly, true);
  assert.equal(page.state().budget, 200000);
  assert.equal(snapshot.photos.size, 1);
  const first = page.state().garments[0];
  assert.equal(first.id, 'c_old');
  assert.equal(first.color, 'blue');
  assert.equal(first.productId, 'ms-728000');
  assert.equal(first.photoMissing, false);
  assert.equal(page.state().garments.length, 2);
  assert.deepEqual(
    new Uint8Array(await snapshot.photos.get(first.photoId).arrayBuffer()),
    new Uint8Array(await jpeg().arrayBuffer()),
  );
  assert.equal((await readLegacyPhotos(['c_old'], indexedDB)).get('c_old'), data);
  assert.equal(page.storage.get('eoul:v1'), raw);
  await page.click({ action: 'tab', tab: 'saved' });
  assert.match(page.nodes.get('app').innerHTML, /현재 목록에 없는 찜 1개/);
  assert.match(page.nodes.get('app').innerHTML, /products\/999999999/);
  const again = await boot(page.storage, indexedDB);
  assert.equal(again.state().garments[0].photoId, first.photoId);
  assert.deepEqual(again.state().saved, ['ms-999999999']);
});

test('schema two photo database and backup upgrade without dropping generic garments or inventing attributes', async () => {
  const indexedDB = new IDBFactory(),
    store = createWardrobeStore({ indexedDB }),
    asset = await photoAsset(jpeg(44));
  const state = {
    ...legacyWardrobeV2.newWardrobeState(),
    style: 'casual',
    demo: false,
    demoSelected: [],
    garments: [
      legacyWardrobeV2.makeGarment({ id: 'g_personal', kind: 'bag', gender: 'M', photoId: asset.id, label: '내 가방' }),
    ],
    saved: ['ms-999999999'],
    legacyBaseline: { owned: ['m-tee-white'], saved: [] },
    legacyDismissed: { owned: ['m-blazer'], saved: [] },
  };
  await store.commit(state, 0, [asset]);
  const backup = await store.backup();
  store.close();
  const page = await boot(new Map(), indexedDB);
  assert.equal(page.state().schema, WARDROBE_SCHEMA);
  assert.deepEqual(page.state().styles, ['cityboy']);
  assert.deepEqual(page.state().legacyDismissed.owned, ['legacy_m-blazer']);
  const item = page.state().garments[0];
  assert.equal(item.id, 'g_personal');
  assert.equal(item.slot, null);
  assert.equal(item.color, null);
  assert.equal(item.label, '내 가방');
  assert.equal(item.photoId, asset.id);
  await page.click({ action: 'tab', tab: 'closet' });
  assert.match(page.nodes.get('app').innerHTML, /내 가방/);
  await page.click({ action: 'open-own', id: item.id });
  assert.match(page.nodes.get('sheet-root').innerHTML, /세부|소재·무늬·핏/);
  await add(page, 'pants', '추가');
  await page.app.chooseWardrobeBackup(backup);
  await page.click({ action: 'restore-backup' });
  assert.equal(page.state().schema, WARDROBE_SCHEMA);
  assert.equal(page.state().garments.length, 1);
  const restored = await page.app.store.read();
  assert.deepEqual(
    new Uint8Array(await restored.photos.get(asset.id).arrayBuffer()),
    new Uint8Array(await asset.blob.arrayBuffer()),
  );
});

test('full erase requires scope and final confirmation, clears all wardrobe sources, and leaves unrelated storage intact', async () => {
  const indexedDB = new IDBFactory(),
    raw = JSON.stringify(oldState);
  const storage = new Map([
    ['eoul:v1', raw],
    ['eoul:v2', newerSourceRaw],
    ['eoul:v2:unreadable', 'synthetic unreadable source'],
    ['other-app', 'synthetic unrelated settings'],
    ['eoul:v1:unrelated', 'keep'],
    ['eoul:probe', 'preserve probe'],
  ]);
  await seedSyntheticDB(indexedDB, 'eoul', 1, 'photos', 'legacy-photo', 'synthetic old photo');
  await seedSyntheticDB(indexedDB, 'other-app-db', 1, 'records', 'personal-other-app', { keep: 'synthetic' });
  const page = await boot(storage, indexedDB);
  await addWithPhoto(page, 'shirt', '삭제할 셔츠', jpeg(21));
  await mutateWardrobeDB(indexedDB, (tx) => {
    tx.objectStore('records').put(
      { format: 'eoul-wardrobe-recovery-snapshot', syntheticRaw: 'private test source' },
      'recovery:synthetic',
    );
    tx.objectStore('photos').put(jpeg(22), 'recovery-photo:synthetic');
  });
  const before = await syntheticDBRows(indexedDB, 'eoul-wardrobe-v2');
  await page.click({ action: 'open-settings' });
  assert.match(page.nodes.get('sheet-root').innerHTML, /data-action="erase-review"/);
  await page.click({ action: 'erase-review' });
  const scope = page.nodes.get('sheet-root').innerHTML;
  assert.match(scope, /현재·이전 옷장, 사진, 찜, 구매 여정·옵션·이유·이력, 판매처 가격 기록, 취향, 복구용 사본/);
  assert.match(scope, /다른 앱의 자료는 유지/);
  assert.match(scope, /다른 옷장 탭을 모두 닫아/);
  assert.match(scope, /내려받은 백업 파일은 별도로/);
  assert.match(scope, /data-action="erase-confirm"/);
  assert.doesNotMatch(scope, /data-action="erase-execute"/);
  await page.click({ action: 'erase-execute' });
  assert.deepEqual(await syntheticDBRows(indexedDB, 'eoul-wardrobe-v2'), before);
  assert.equal(storage.get('eoul:v1'), raw);
  await page.click({ action: 'erase-confirm' });
  assert.match(page.nodes.get('sheet-root').innerHTML, /data-action="erase-execute"/);
  assert.deepEqual(await syntheticDBRows(indexedDB, 'eoul-wardrobe-v2'), before);
  await page.click({ action: 'erase-execute' });
  assert.equal(page.state().demo, true);
  assert.equal(page.state().garments.length, 0);
  assert.deepEqual(page.state().saved, []);
  const cleared = await syntheticDBRows(indexedDB, 'eoul-wardrobe-v2');
  assert.equal(cleared.records.length, 1, 'fresh boot creates only a new current record');
  assert.equal(cleared.records[0].state.demo, true);
  assert.deepEqual(cleared.records[0].state.garments, []);
  assert.deepEqual(cleared.photos, []);
  assert.deepEqual(await syntheticDBRows(indexedDB, 'eoul'), { photos: [] });
  assert.deepEqual(await syntheticDBRows(indexedDB, 'other-app-db'), { records: [{ keep: 'synthetic' }] });
  assert.deepEqual(
    [...storage],
    [
      ['other-app', 'synthetic unrelated settings'],
      ['eoul:v1:unrelated', 'keep'],
      ['eoul:probe', 'preserve probe'],
    ],
  );
  assert.equal(page.urls.size, 0);
  assert.match(page.nodes.get('toast').innerHTML, /현재·이전 옷장과 사진·복구 사본을 삭제했어요/);
  const again = await boot(storage, indexedDB);
  assert.equal(again.state().demo, true);
  assert.deepEqual(again.state().garments, []);
});

test('final erase clicks without a reviewed scope, or after cancelling either confirmation, do not mutate storage', async () => {
  const raw = JSON.stringify(oldState),
    storage = new Map([
      ['eoul:v1', raw],
      ['eoul:v2', newerSourceRaw],
      ['eoul:v2:unreadable', 'synthetic unreadable source'],
      ['eoul:probe', 'preserve probe'],
    ]);
  const sourceBefore = [...storage];
  const page = await boot(storage);
  await seedSyntheticDB(page.indexedDB, 'eoul', 1, 'photos', 'legacy-photo', 'synthetic');
  const before = await syntheticDBRows(page.indexedDB, 'eoul-wardrobe-v2');
  await page.click({ action: 'erase-execute' });
  await page.click({ action: 'erase-confirm' });
  await page.click({ action: 'erase-execute' });
  for (const confirmFirst of [false, true]) {
    await page.click({ action: 'erase-review' });
    if (confirmFirst) await page.click({ action: 'erase-confirm' });
    await page.click({ action: 'close-sheet' });
    await page.click({ action: 'erase-confirm' });
    await page.click({ action: 'erase-execute' });
  }
  await page.click({ action: 'erase-review' });
  await page.click({ action: 'erase-confirm' });
  await page.click({ action: 'open-profile' });
  await page.click({ action: 'erase-execute' });
  assert.deepEqual(await syntheticDBRows(page.indexedDB, 'eoul-wardrobe-v2'), before);
  assert.deepEqual(await syntheticDBRows(page.indexedDB, 'eoul'), { photos: ['synthetic'] });
  assert.equal(storage.get('eoul:v1'), raw);
  assert.deepEqual([...storage], sourceBefore);
  assert.doesNotMatch(page.nodes.get('toast').innerHTML, /옷장과 사진·복구 사본을 삭제했어요/);
});

test('partial full erase reports retained legacy scope and never acknowledges complete deletion', async () => {
  const indexedDB = new IDBFactory(),
    raw = JSON.stringify(oldState);
  await seedSyntheticDB(indexedDB, 'eoul', 2, 'photos', 'future-photo', 'synthetic retained photo');
  const page = await boot(
    new Map([
      ['eoul:v1', raw],
      ['eoul:v2', newerSourceRaw],
      ['eoul:v2:unreadable', 'synthetic unreadable source'],
      ['eoul:probe', 'preserve probe'],
    ]),
    indexedDB,
  );
  await addWithPhoto(page, 'shirt', '부분 삭제 전 셔츠', jpeg(23));
  await confirmFullErase(page);
  const sheet = page.nodes.get('sheet-root').innerHTML;
  assert.match(sheet, /전체 삭제 미완료/);
  assert.match(sheet, /현재 옷장·사진·구매 여정·복구 사본<\/b>: 삭제 완료 또는 자료 없음/);
  assert.match(sheet, /이전 사진<\/b>: 보존 또는 아직 시작하지 않음/);
  assert.match(sheet, /더 최신 버전의 저장소/);
  assert.match(sheet, /이전 옷장·찜·취향<\/b>: 보존 또는 아직 시작하지 않음/);
  assert.match(sheet, /Claude 최신 옷장·찜·취향<\/b>: 보존 또는 아직 시작하지 않음/);
  assert.match(sheet, /Claude 최신 저장 원문 사본<\/b>: 보존 또는 아직 시작하지 않음/);
  assert.match(sheet, /현재 저장소·이전 기록 원문 받기/);
  assert.match(sheet, /이전 사진과 Claude 최신 버전의 기록·원문 사본은 해당 버전에서 따로 백업/);
  assert.doesNotMatch(page.nodes.get('toast').innerHTML, /현재·이전 옷장과 사진·복구 사본을 삭제했어요/);
  assert.deepEqual(await syntheticDBRows(indexedDB, 'eoul-wardrobe-v2'), { photos: [], records: [] });
  assert.deepEqual(await syntheticDBRows(indexedDB, 'eoul', 2), { photos: ['synthetic retained photo'] });
  assert.equal(page.storage.get('eoul:v1'), raw);
  assert.equal(page.storage.get('eoul:v2'), newerSourceRaw);
  assert.equal(page.storage.get('eoul:v2:unreadable'), 'synthetic unreadable source');
  assert.equal(page.storage.get('eoul:probe'), 'preserve probe');
  assert.equal(page.urls.size, 0);
  assert.doesNotMatch(page.nodes.get('app').innerHTML, /부분 삭제 전 셔츠/);
  assert.equal(page.storage.get('eoul:erase-pending'), '1');
  const reloaded = await boot(page.storage, indexedDB);
  assert.match(reloaded.nodes.get('app').innerHTML, /남은 자료를 자동으로 가져오지 않습니다/);
  assert.deepEqual(await syntheticDBRows(indexedDB, 'eoul-wardrobe-v2'), { photos: [], records: [] });
  assert.equal(reloaded.state().garments.length, 0);
  await reloaded.app.chooseWardrobeBackup(new Blob(['invalid backup']));
  assert.match(reloaded.nodes.get('toast').innerHTML, /미완료된 전체 삭제를 먼저 마무리/);
  assert.deepEqual(await syntheticDBRows(indexedDB, 'eoul-wardrobe-v2'), { photos: [], records: [] });
});

test('a prior tab cannot resurrect deleted clothes or photos when fresh boot reuses the same revision', async () => {
  const indexedDB = new IDBFactory(),
    store = createWardrobeStore({ indexedDB });
  const asset = await photoAsset(jpeg(24));
  await store.commit(
    {
      ...newWardrobeState(),
      demo: false,
      demoSelected: [],
      garments: [
        makeGarment({ id: 'g_before-erase', kind: 'shirt', gender: 'M', label: '삭제 전 셔츠', photoId: asset.id }),
      ],
    },
    0,
    [asset],
  );
  store.close();
  const first = await boot(new Map(), indexedDB),
    stale = await boot(first.storage, indexedDB);
  const old = await stale.app.store.read();
  await stale.click({ action: 'add-start' });
  await stale.click({ action: 'draft-kind', kind: 'pants' });
  stale.input('garment-label', '오래된 탭의 초안');
  stale.app.store.close();
  await confirmFullErase(first);
  const fresh = await first.app.store.read();
  assert.equal(old.revision, 1);
  assert.equal(fresh.revision, old.revision, 'revision equality alone cannot identify the new wardrobe');
  assert.notEqual(fresh.epoch, old.epoch);
  await stale.click({ action: 'draft-save' });
  assert.match(stale.app.draft().error, /다른 화면/);
  assert.equal(stale.app.draft().label, '오래된 탭의 초안');
  const after = await first.app.store.read();
  assert.deepEqual(after.state.garments, []);
  assert.equal(after.photos.size, 0);
  assert.equal(after.epoch, fresh.epoch);
  const again = await boot(first.storage, indexedDB);
  assert.deepEqual(again.state().garments, []);
  assert.doesNotMatch(again.nodes.get('app').innerHTML, /삭제 전 셔츠|오래된 탭의 초안/);
});

test('generic owned clothes display uncertainty in cards and detail instead of asserting a complete outfit', async () => {
  const page = await boot();
  await add(page, 'shirt', '종류만 등록한 셔츠');
  await add(page, 'pants', '종류만 등록한 바지');
  await add(page, 'sneaker', '종류만 등록한 운동화');
  await add(page, 'jacket', '종류만 등록한 재킷');
  const uncertain = page.app
    .recommendLooks({ ...page.app.state(), now: '2026-10-14T12:00:00+09:00' }, { limit: 50, occasion: null })
    .find((look) => look.uncertainCount > 0 && look.buyCount === 0);
  assert.ok(uncertain, 'the actual recommendation engine returns an owned but unconfirmed outfit');
  const card = page.app.lookCard(uncertain);
  assert.match(card, /옷 종류 확인 필요/);
  assert.match(card, /세부 종류가 미확인/);
  assert.doesNotMatch(card, /가진 옷으로 완성|예시로 완성/);
  page.app.showLook(uncertain);
  const sheet = page.nodes.get('sheet-root').innerHTML;
  assert.match(sheet, /종류 확인 필요/);
  assert.match(sheet, /세부 종류를 확인해야 이 코디를 확정/);
  assert.match(sheet, /확인 전에는 새 옷이 꼭 필요한지 판단하지 않습니다/);
  assert.match(sheet, /<span class="badge">종류 확인<\/span>/);
  assert.doesNotMatch(sheet, /가진 옷으로 완성/);
  await page.click({ action: 'tab', tab: 'closet' });
  assert.match(page.nodes.get('app').innerHTML, /소재·무늬까지 확인되지 않아 세부 기본템 보유 수에 넣지 않았어요/);
  assert.doesNotMatch(page.nodes.get('app').innerHTML, /하나만 사면 완성/);
});

test('owning an opposite-gender product shows both classifications while retaining preferences and garments across reload', async () => {
  const page = await boot();
  await add(page, 'shirt', '기존 남성 셔츠');
  await page.click({ action: 'profile-style', style: 'cityboy' });
  await page.click({ action: 'profile-style', style: 'dandy' });
  await page.click({ action: 'profile-style', style: 'classic' });
  const preferences = Object.fromEntries(['gender', 'styles', 'brands', 'brandOnly', 'budget', 'occasion'].map((key) => [key, page.state()[key]]));
  assert.deepEqual(preferences.styles, ['cityboy', 'dandy']);
  const originalId = page.state().garments[0].id;
  await page.click({ action: 'open-item', id: 'ms-1115031' });
  await page.click({ action: 'own-product', id: 'ms-1115031' });
  assert.equal(page.state().garments.length, 1, 'selecting an opposite-gender product does not write yet');
  await page.click({ action: 'owned-catalog-color', color: 'white' });
  await page.click({ action: 'owned-catalog-confirm', id: 'ms-1115031' });
  const owned = page.state().garments.find((item) => item.productId === 'ms-1115031');
  assert.ok(owned);
  assert.equal(owned.gender, 'F');
  for (const [key, value] of Object.entries(preferences)) assert.deepEqual(page.state()[key], value, key);
  assert.equal(page.state().tab, 'closet');
  assert.equal(page.state().garments.length, 2);
  assert.equal(page.state().garments.find((item) => item.id === originalId).gender, 'M');
  assert.match(page.nodes.get('app').innerHTML, /단테 - 화이트/);
  assert.ok(page.nodes.get('app').innerHTML.includes(`data-action="open-own" data-id="${owned.id}"`));
  assert.ok(page.nodes.get('app').innerHTML.includes(`data-action="open-own" data-id="${originalId}"`));
  await page.click({ action: 'open-item', id: 'ms-1115031' });
  assert.match(page.nodes.get('sheet-root').innerHTML, /보유 옷 확인·추가/);
  await page.click({ action: 'own-product', id: 'ms-1115031' });
  assert.equal(page.state().garments.length, 2);
  assert.match(page.nodes.get('sheet-root').innerHTML, /같은 상품 한 벌 더 저장/);
  await page.click({ action: 'close-sheet' });
  const again = await boot(page.storage, page.indexedDB);
  await again.click({ action: 'tab', tab: 'closet' });
  for (const [key, value] of Object.entries(preferences)) assert.deepEqual(again.state()[key], value, `reloaded ${key}`);
  assert.equal(again.state().garments.length, 2);
  assert.match(again.nodes.get('app').innerHTML, /단테 - 화이트/);
});

test('price-sorted search labels collected-date prices and displays the catalogue date without a live lowest-price guarantee', async () => {
  const page = await boot(),
    query = '셔츠 낮은 가격순';
  await page.click({ action: 'example', q: query });
  const results = page.app.search(page.app.state(), query);
  assert.equal(results.query.priceSort, 'asc');
  assert.ok(results.items.length > 1);
  const prices = results.items.map((entry) => entry.product.price);
  assert.deepEqual(
    [...prices],
    [...prices].sort((a, b) => a - b),
  );
  const view = page.nodes.get('app').innerHTML;
  assert.match(view, /수집일 가격이 낮은 순서/);
  assert.match(view, /옵션과 배송비는 판매 페이지에서 확인/);
  assert.ok(view.includes(CATALOG.checkedLabel));
  assert.match(view, /가격·쿠폰·재고는 구매 전에 판매처에서 확인/);
  assert.doesNotMatch(view, /실시간 최저가|최저가 보장/);
});

test('optional jacket detail can confirm fleece and remove its repeated recommendation, then revert without losing photo or name', async () => {
  const page = await boot();
  await page.click({ action: 'profile-style', style: 'gorp' });
  await page.click({ action: 'profile-style', style: 'classic' });
  await page.click({ action: 'close-sheet' });
  await addWithPhoto(page, 'jacket', '내 사진 재킷', jpeg(25));
  const original = page.state().garments[0];
  assert.equal(original.slot, null);
  const input = () => ({ ...page.app.state(), now: '2026-10-14T12:00:00+09:00' });
  const before = page.app.recommendItems(input(), { limit: 30 }).find((row) => row.slot.id === 'm-fleece');
  assert.ok(before);
  assert.equal(before.ownership, 'uncertain');
  const fleeceProduct = page.app.productsFor('m-fleece')[0];
  assert.ok(fleeceProduct);
  page.app.itemSheet(fleeceProduct.id);
  assert.match(page.nodes.get('sheet-root').innerHTML, /플리스인지 확인한 뒤 추가 구매를 판단/);
  await page.click({ action: 'edit-own', id: original.id });
  assert.match(page.nodes.get('sheet-root').innerHTML, /세부 종류 확인 \(선택\)/);
  await page.click({ action: 'draft-slot', slot: 'f-jacket' });
  assert.equal(page.app.draft().slot, null);
  await page.click({ action: 'draft-slot', slot: 'm-fleece' });
  assert.equal(page.app.draft().slot, 'm-fleece');
  await page.click({ action: 'draft-save' });
  const confirmed = page.state().garments[0];
  assert.equal(confirmed.slot, 'm-fleece');
  assert.equal(confirmed.label, original.label);
  assert.equal(confirmed.photoId, original.photoId);
  assert.equal(confirmed.color, null);
  assert.ok(!page.app.recommendItems(input(), { limit: 30 }).some((row) => row.slot.id === 'm-fleece'));
  let again = await boot(page.storage, page.indexedDB);
  assert.equal(again.state().garments[0].slot, 'm-fleece');
  const essential = again.app
    .essentials({ ...again.app.state(), now: '2026-10-14T12:00:00+09:00' })
    .find((row) => row.slot.id === 'm-fleece');
  assert.equal(essential.owned, true);
  assert.equal(essential.needsCheck, false);
  again.app.itemSheet(fleeceProduct.id);
  assert.doesNotMatch(again.nodes.get('sheet-root').innerHTML, /플리스인지 확인한 뒤 추가 구매를 판단/);
  await again.click({ action: 'edit-own', id: original.id });
  await again.click({ action: 'draft-slot', slot: '' });
  await again.click({ action: 'draft-save' });
  again = await boot(page.storage, page.indexedDB);
  const reverted = again.state().garments[0];
  assert.equal(reverted.slot, null);
  assert.equal(reverted.label, original.label);
  assert.equal(reverted.photoId, original.photoId);
  assert.equal(reverted.color, null);
  const restored = await again.app.store.read();
  assert.deepEqual(
    new Uint8Array(await restored.photos.get(original.photoId).arrayBuffer()),
    new Uint8Array(await jpeg(25).arrayBuffer()),
  );
  const recommendation = again.app
    .recommendItems({ ...again.app.state(), now: '2026-10-14T12:00:00+09:00' }, { limit: 30 })
    .find((row) => row.slot.id === 'm-fleece');
  assert.equal(recommendation.ownership, 'uncertain');
});

test('search-with retains the selected real shirt and its photograph when two shirts share a kind', async () => {
  const page = await boot();
  await addWithPhoto(page, 'shirt', '흰 셔츠 기준', jpeg(71));
  const first = page.state().garments[0];
  await page.click({ action: 'edit-own', id: first.id });
  await page.click({ action: 'draft-slot', slot: 'm-oxford' });
  await page.click({ action: 'draft-color', color: 'white' });
  await page.click({ action: 'draft-save' });
  await addWithPhoto(page, 'shirt', '파란 셔츠 기준', jpeg(72));
  const second = page.state().garments[1];
  await page.click({ action: 'edit-own', id: second.id });
  await page.click({ action: 'draft-slot', slot: 'm-oxford' });
  await page.click({ action: 'draft-color', color: 'blue' });
  await page.click({ action: 'draft-save' });
  for (const selected of page.state().garments) {
    await page.click({ action: 'open-own', id: selected.id });
    await page.click({ action: 'search-with', id: selected.id });
    const view = page.nodes.get('app').innerHTML;
    assert.match(view, /이 옷을 기준으로 찾아요/);
    const result = page.app.search(page.app.state(), '옥스퍼드 셔츠에 어울리는 바지', { anchorItemId: selected.id });
    assert.equal(result.anchorItem.id, selected.id);
    assert.equal(result.anchorItem.photoId, selected.photoId);
    assert.ok(result.outfit.items.some((row) => row.item?.id === selected.id));
    const anchorPart = view.match(
      /<div class="notice search-anchor">([\s\S]*?)<button class="link" data-action="clear-anchor"/,
    )[1];
    assert.ok(anchorPart.includes(selected.label));
    assert.ok(!anchorPart.includes(page.state().garments.find((i) => i.id !== selected.id).label));
  }
  await page.click({ action: 'example', q: '셔츠 높은 가격순' });
  assert.doesNotMatch(page.nodes.get('app').innerHTML, /이 옷을 기준으로 찾아요/);
  assert.match(page.nodes.get('app').innerHTML, /수집일 가격이 높은 순서/);
});

test('unconfirmed outfit row opens that garment detail and returns to a refreshed formula after saving', async () => {
  const page = await boot();
  await addWithPhoto(page, 'shirt', '확인할 셔츠', jpeg(81));
  await add(page, 'pants', '확인할 바지');
  await add(page, 'sneaker', '확인할 운동화');
  await add(page, 'jacket', '확인할 재킷');
  const outfit = page.app
    .recommendLooks(page.app.state(), { limit: 32, occasion: null })
    .find((r) => r.items.some((i) => i.item?.label === '확인할 셔츠' && i.certainty === 'uncertain'));
  assert.ok(outfit);
  page.app.showLook(outfit);
  const row = outfit.items.find((i) => i.item?.label === '확인할 셔츠');
  assert.match(page.nodes.get('sheet-root').innerHTML, /data-action="confirm-own-kind"/);
  await page.click({ action: 'confirm-own-kind', id: row.item.id, look: outfit.look.id });
  assert.match(page.nodes.get('sheet-root').innerHTML, /<details class="garment-name" open><summary>세부 종류 확인/);
  assert.equal(page.app.draft().id, row.item.id);
  await page.click({ action: 'draft-slot', slot: row.slot.id });
  await page.click({ action: 'draft-save' });
  assert.equal(page.state().garments.find((i) => i.id === row.item.id).slot, row.slot.id);
  assert.equal(page.state().garments.find((i) => i.id === row.item.id).photoId, row.item.photoId);
  const refreshed = page.nodes.get('sheet-root').innerHTML;
  assert.ok(refreshed.includes(outfit.look.title));
  assert.ok(!refreshed.includes(`data-action="confirm-own-kind" data-id="${row.item.id}"`));
  assert.ok(refreshed.includes('확인할 셔츠'));
  assert.equal((await page.app.store.read()).state.garments.find((i) => i.id === row.item.id).slot, row.slot.id);
});

test('unregistered recommendations are candidates and keep the similar-owned registration route', async () => {
  const page = await boot();
  await add(page, 'shirt', '등록한 셔츠 한 벌');
  await page.click({ action: 'tab', tab: 'home' });
  const view = page.nodes.get('app').innerHTML;
  assert.match(view, /등록하지 않은 옷이 없다는 뜻은 아니에요/);
  assert.match(view, /등록 안 된 종류 · 이미 가진 옷일 수 있어요/);
  assert.doesNotMatch(view, /지금 사면 좋은 아이템/);
  const candidate = page.app.recommendItems(page.app.state())[0];
  page.app.itemSheet(candidate.product.id);
  assert.match(page.nodes.get('sheet-root').innerHTML, /구매 후보예요|인지 확인한 뒤 추가 구매를 판단/);
  assert.match(page.nodes.get('sheet-root').innerHTML, /data-action="add-slot"/);
});

test('taste save failure retains selections for retry while durable preferences stay unchanged', async (context) => {
  const page = await boot();
  const before = await page.app.store.read();
  await page.click({ action: 'taste-start' });
  await page.click({ action: 'ob-gender', g: 'F' });
  await page.click({ action: 'toggle-style', style: 'french' });
  await page.click({ action: 'ob-next' });
  await page.click({ action: 'toggle-brand', brand: '로라로라' });
  const put = IDBObjectStore.prototype.put;
  context.mock.method(IDBObjectStore.prototype, 'put', function () {
    if (this.name === 'records') throw new DOMException('Synthetic quota', 'QuotaExceededError');
    return put.apply(this, arguments);
  });
  await page.click({ action: 'ob-done' });
  assert.equal(page.state().gender, 'F');
  assert.deepEqual(page.state().styles, ['french']);
  assert.deepEqual(page.state().brands, ['로라로라']);
  assert.match(page.nodes.get('app').innerHTML, /3|브랜드|저장 공간이 부족/);
  assert.deepEqual((await page.app.store.read()).state, before.state);
  context.mock.restoreAll();
  await page.click({ action: 'ob-done' });
  const saved = await page.app.store.read();
  assert.equal(saved.state.gender, 'F');
  assert.deepEqual([...saved.state.styles], ['french']);
  assert.deepEqual([...saved.state.brands], ['로라로라']);
  assert.match(page.nodes.get('app').innerHTML, /내 스타일·브랜드 고르기/);
});

test('reloading during taste selection preserves newly loaded real garments on cancel and subsequent save', async () => {
  const page = await boot();
  await page.click({ action: 'taste-start' });
  await page.click({ action: 'ob-gender', g: 'F' });
  await page.click({ action: 'toggle-style', style: 'french' });
  const latest = await page.app.store.read();
  const incoming = makeGarment({
    id: 'g_loaded-during-taste',
    kind: 'shirt',
    gender: 'M',
    label: '새로 읽은 실제 셔츠',
  });
  await page.app.store.commit(
    { ...latest.state, demo: false, demoSelected: [], garments: [incoming] },
    latest.revision,
    [],
    latest.epoch,
  );
  await page.click({ action: 'reload-wardrobe' });
  assert.equal(page.state().gender, 'F');
  await page.click({ action: 'taste-cancel' });
  assert.equal(page.state().gender, 'M');
  assert.equal(page.state().demo, false);
  assert.equal(page.state().garments[0].id, incoming.id);
  await add(page, 'pants', '취향 취소 뒤 새 바지');
  const saved = await page.app.store.read();
  assert.equal(saved.state.garments.length, 2);
  assert.ok(saved.state.garments.some((i) => i.id === incoming.id));
});

test('borrowed product photos are labeled in own details and outfit tiles rather than presented as personal photographs', async () => {
  const page = await boot();
  await add(page, 'pants', '내 베이지 바지');
  const item = page.state().garments[0];
  await page.click({ action: 'edit-own', id: item.id });
  await page.click({ action: 'draft-slot', slot: 'm-chino' });
  await page.click({ action: 'draft-color', color: 'beige' });
  await page.click({ action: 'draft-save' });
  await page.click({ action: 'open-own', id: item.id });
  const sheet = page.nodes.get('sheet-root').innerHTML;
  assert.match(sheet, /photo-caption">비슷한 상품 사진/);
  assert.match(sheet, /실제 내 옷과 다를 수 있어요/);
  assert.match(sheet, /data-color="beige"/);
  assert.doesNotMatch(sheet, /data-own-photo/);
  const look = page.app.recommendLooks(page.app.state(), { limit: 1, anchorItem: page.state().garments[0] })[0];
  assert.ok(look);
  assert.match(page.app.lookCard(look), /photo-caption">비슷한 상품 사진/);
});

test('a saved taste renders at once: picking women\'s French chic shows the women\'s example closet without a reload', async () => {
  const page = await boot();
  await page.click({ action: 'taste-start' });
  await page.click({ action: 'ob-gender', g: 'F' });
  await page.click({ action: 'toggle-style', style: 'french' });
  await page.click({ action: 'ob-next' });
  await page.click({ action: 'ob-done' });
  assert.equal(page.state().gender, 'F');
  assert.deepEqual(page.state().styles, ['french']);
  assert.ok(page.state().closet.length && page.state().closet.every((item) => item.gender === 'F'),
    'the example closet on screen follows the saved pick, not the state from before picking');
});

test('the example closet can switch between men\'s and women\'s examples from the home notice', async () => {
  const page = await boot();
  assert.match(page.nodes.get('app').innerHTML, /data-action="set-gender" data-g="F" data-stay="1"/);
  await page.click({ action: 'set-gender', g: 'F', stay: '1' });
  assert.equal(page.state().gender, 'F');
  assert.ok(page.state().closet.every((item) => item.gender === 'F'));
  assert.equal(page.nodes.get('sheet-root').innerHTML, '', 'switching examples does not open the profile sheet');
});

test('a first visit starts the closet by picking owned basics: kind and color only, then the picked garment opens with outfits from owned clothes', async () => {
  const page = await boot();
  assert.match(page.nodes.get("app").innerHTML, /어떤 옷 찾으세요\?/);
  assert.match(page.nodes.get("app").innerHTML, /내 옷장을 넣으면 더 정확해져요/);
  await page.click({ action: 'starter-pick', slot: 'm-oxford' });
  await page.click({ action: 'starter-color', slot: 'm-oxford', color: 'white' });
  await page.click({ action: 'starter-pick', slot: 'm-chino' });
  await page.click({ action: 'starter-color', slot: 'm-chino', color: 'beige' });
  await page.click({ action: 'starter-pick', slot: 'm-white-sneaker' });
  await page.click({ action: 'starter-save' });
  const state = page.state();
  assert.equal(state.demo, false);
  assert.equal(state.garments.length, 3);
  for (const item of state.garments) {
    assert.equal(item.source, 'user');
    assert.ok(!item.brand && !item.label && !item.productId && !item.photoId, 'a picked basic never claims a brand, name, product or photo');
  }
  assert.deepEqual(state.garments.map((item) => item.color).sort(), ['beige', 'white', 'white']);
  const sheet = page.nodes.get('sheet-root').innerHTML;
  assert.match(sheet, /이 옷을 꺼내면/);
  assert.match(sheet, /가진 옷 기본 조합/);
  assert.match(page.nodes.get('app').innerHTML, /오늘은 어떤 옷을 꺼낼까요\?/);
});

test('a picked basic may keep its color unknown and one garment is enough to start', async () => {
  const page = await boot();
  await page.click({ action: 'starter-pick', slot: 'm-knit' });
  await page.click({ action: 'starter-save' });
  const [item] = page.state().garments;
  assert.equal(page.state().garments.length, 1);
  assert.equal(item.color, null);
  assert.match(page.nodes.get('sheet-root').innerHTML, /색을 고르면/);
});

test('on the example closet, comparing a product opens registration that remembers the product to come back to', async () => {
  const page = await boot();
  assert.equal(page.state().demo, true);
  const product = page.app.recommendItems(page.app.state())[0].product;
  await page.click({ action: 'candidate-product', id: product.id });
  assert.equal(page.app.draft()?.returnProductId, product.id);
  assert.match(page.nodes.get('sheet-root').innerHTML, /이 상품과 비교하려면 실제 옷을 한 벌만 넣으면 돼요/);
  assert.ok(page.nodes.get('sheet-root').innerHTML.includes(product.name.replace(/&/g, '&amp;')), 'the product being compared stays visible');
});
