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
    '\nglobalThis.testApp = { state: () => state, ready: appReady, draft: () => draft, store: wardrobeStore, itemSheet, render, recommendItems, recommendLooks, chooseGarmentPhoto, chooseWardrobeBackup, saveGarmentDraft };\n})();',
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
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
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
const oldState = { onboarded: true, gender: 'M', style: 'classic', owned: ['m-tee-white'], saved: ['ms-404474'] };
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
  assert.equal(page.state().garments.length, 2);
  assert.equal(page.state().garments[0].label, '원래 셔츠');
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
  assert.equal(page.state().schema, 3);
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
  assert.equal(page.state().schema, 3);
  assert.equal(page.state().garments.length, 1);
  const restored = await page.app.store.read();
  assert.deepEqual(
    new Uint8Array(await restored.photos.get(asset.id).arrayBuffer()),
    new Uint8Array(await asset.blob.arrayBuffer()),
  );
});
