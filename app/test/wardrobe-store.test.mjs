import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createWardrobeStore, photoAsset, parseWardrobeBackup } from '../src/wardrobe-store.js';
import { makeGarment, newWardrobeState, migrateLegacyWardrobe } from '../src/wardrobe.js';

const jpeg = (byte = 7) => new Blob([new Uint8Array([255, 216, 255, byte])], { type: 'image/jpeg' });
const personal = (garments) => ({ ...newWardrobeState(), demo: false, demoSelected: [], garments });
const garment = (id, photoId = null) => makeGarment({ id, kind: 'shirt', gender: 'M', photoId, createdAt: '2026-10-14T00:00:00.000Z' });
async function manifest(file) {
  const header = Buffer.from(await file.slice(0, 12).arrayBuffer());
  assert.equal(header.subarray(0, 8).toString(), 'EOULBK02');
  return JSON.parse(await file.slice(12, 12 + header.readUInt32LE(8)).text());
}
async function setup() {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  await store.load();
  return { indexedDB, store };
}
async function alter(indexedDB, callback) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('eoul-wardrobe-v2', 1);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'photos'], 'readwrite');
      callback(tx); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

test('new photo write rolls back when metadata write fails; neither a garment nor orphan blob is acknowledged', async () => {
  const { store } = await setup();
  const asset = await photoAsset(jpeg());
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'records') throw new DOMException('metadata quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { await assert.rejects(store.commit(personal([garment('g_a', asset.id)]), 1, [asset]), /metadata quota/); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.equal((await store.read()).revision, 1);
  assert.equal((await store.read()).state.demo, true);
  assert.equal((await manifest(await store.recoveryBackup())).photos.length, 0);
  store.close();
});

test('a missing referenced photo aborts replacement and rolls back deletion of the previous photo', async () => {
  const { store } = await setup();
  const asset = await photoAsset(jpeg());
  await store.commit(personal([garment('g_a', asset.id)]), 1, [asset]);
  const missing = (await photoAsset(jpeg(9))).id;
  await assert.rejects(store.commit(personal([garment('g_a', missing)]), 2), /사진을 함께 저장/);
  const current = await store.read();
  assert.equal(current.revision, 2);
  assert.equal(current.state.garments[0].photoId, asset.id);
  assert.deepEqual(new Uint8Array(await current.photos.get(asset.id).arrayBuffer()), new Uint8Array(await asset.blob.arrayBuffer()));
  store.close();
});

test('shared photo is retained until its last garment is deleted; unrelated orphan photos are not collected', async () => {
  const { indexedDB, store } = await setup();
  const asset = await photoAsset(jpeg()), orphan = await photoAsset(jpeg(10));
  await store.commit(personal([garment('g_a', asset.id), garment('g_b', asset.id)]), 1, [asset]);
  await alter(indexedDB, (tx) => tx.objectStore('photos').put(orphan.blob, orphan.id));
  await store.commit(personal([garment('g_b', asset.id)]), 2);
  assert.equal((await store.read()).photos.size, 1);
  await store.commit(personal([]), 3);
  const raw = await manifest(await store.recoveryBackup());
  assert.deepEqual(raw.photos.map((row) => row.id), [orphan.id]);
  assert.equal((await store.read()).photos.size, 0);
  store.close();
});

test('two tabs cannot overwrite each other or resurrect a stale photo reference', async () => {
  const { indexedDB, store: first } = await setup();
  const asset = await photoAsset(jpeg());
  await first.commit(personal([garment('g_a', asset.id)]), 1, [asset]);
  const second = createWardrobeStore({ indexedDB });
  const stale = await second.read();
  await first.commit(personal([]), 2);
  await assert.rejects(second.commit(stale.state, stale.revision), (error) => error.code === 'conflict');
  await assert.rejects(second.commit(personal([garment('g_b', asset.id)]), 3), /사진을 함께 저장/);
  assert.equal((await first.read()).state.garments.length, 0);
  // A deliberate new commit supplying the Blob can create the reference again.
  await second.commit(personal([garment('g_b', asset.id)]), 3, [asset]);
  assert.equal((await first.read()).photos.size, 1);
  first.close(); second.close();
});

test('backup round trip retains IDs, preferences, shared photo bytes and duplicate kinds', async () => {
  const { store } = await setup();
  const asset = await photoAsset(jpeg());
  const state = { ...personal([garment('g_a', asset.id), garment('g_b', asset.id)]), saved: ['ms-1115031'], budget: 50000 };
  await store.commit(state, 1, [asset]);
  const text = await store.backup(), parsed = await parseWardrobeBackup(text);
  assert.equal(parsed.assets.length, 1);
  const target = createWardrobeStore({ indexedDB: new IDBFactory() });
  await target.commit(parsed.state, 0, parsed.assets);
  assert.deepEqual((await target.read()).state, state);
  assert.deepEqual(new Uint8Array(await (await target.read()).photos.get(asset.id).arrayBuffer()), new Uint8Array(await asset.blob.arrayBuffer()));
  store.close(); target.close();
});

test('tampered, incomplete, future-format and unreferenced-photo backups fail before commit', async () => {
  const { store } = await setup();
  const asset = await photoAsset(jpeg());
  await store.commit(personal([garment('g_a', asset.id)]), 1, [asset]);
  const binary = await store.backup();
  const good = { format: 'eoul-wardrobe-backup', version: 1, state: (await store.read()).state, photos: [{ id: asset.id, type: 'image/jpeg', base64: btoa(String.fromCharCode(255, 216, 255, 7)) }] };
  const tampered = structuredClone(good); tampered.photos[0].base64 = btoa(String.fromCharCode(255, 216, 255, 8));
  const missing = structuredClone(good); missing.photos = [];
  const future = { ...good, futureField: true };
  const unreferenced = structuredClone(good); unreferenced.state.garments[0].photoId = null;
  for (const invalid of [tampered, missing, future, unreferenced, null]) await assert.rejects(parseWardrobeBackup(JSON.stringify(invalid)));
  await assert.rejects(parseWardrobeBackup(new Blob([binary.slice(0, binary.size - 1), new Uint8Array([99])])), /사진이 변경/);
  await assert.rejects(parseWardrobeBackup(binary.slice(0, binary.size - 1)), /구간 정보/);
  await assert.rejects(parseWardrobeBackup(new Blob([binary, new Uint8Array([0])])), /불필요한 내용/);
  await assert.rejects(parseWardrobeBackup(await store.recoveryBackup()), /지원하는 옷장 백업/);
  assert.equal((await store.read()).revision, 2);
  store.close();
});

test('unsupported or falsy stored rows block initialization and commits without destroying recovery evidence', async () => {
  for (const invalid of [null, 0, { revision: 7, state: { ...newWardrobeState(), futureField: 'keep' } }]) {
    const { indexedDB, store } = await setup();
    const photo = await photoAsset(jpeg());
    await alter(indexedDB, (tx) => { tx.objectStore('records').put(invalid, 'current'); tx.objectStore('photos').put(photo.blob, photo.id); });
    await assert.rejects(store.load());
    await assert.rejects(store.commit(newWardrobeState(), 0));
    const raw = await manifest(await store.recoveryBackup('original localStorage text'));
    assert.deepEqual(raw.records[0].value, invalid);
    assert.equal(raw.photos.length, 1);
    assert.equal(raw.legacyRaw, 'original localStorage text');
    store.close();
  }
});

test('legacy migration is deterministic and rejects a corrupt demo flag without dropping owned clothes', () => {
  const raw = JSON.stringify({ onboarded: true, gender: 'M', style: 'classic', owned: ['m-chino', 'm-chino'], saved: ['ms-1115031'] });
  const a = migrateLegacyWardrobe(raw), b = migrateLegacyWardrobe(raw);
  assert.deepEqual(a, b);
  assert.equal(a.garments.length, 1);
  assert.equal(a.garments[0].id, 'legacy_m-chino');
  assert.equal(a.garments[0].color, null);
  assert.throws(() => migrateLegacyWardrobe(JSON.stringify({ ...JSON.parse(raw), demo: 'false' })), /원본을 보존/);
});

test('maximum 200-photo archive retains full bytes and uses bounded manifest and per-photo reads', async () => {
  const { store } = await setup();
  const assets = [];
  for (let index = 0; index < 200; index += 1) {
    const bytes = new Uint8Array(800000);
    bytes.set([255, 216, 255, index]);
    assets.push(await photoAsset(new Blob([bytes], { type: 'image/jpeg' })));
  }
  const state = personal(assets.map((asset, index) => garment(`g_${index}`, asset.id)));
  await store.commit(state, 1, assets);
  const archive = await store.backup();
  assert.ok(archive.size >= 160000000 && archive.size < 161000000);
  archive.text = () => { throw new Error('must not read the whole archive as text'); };
  archive.arrayBuffer = () => { throw new Error('must not read the whole archive into one buffer'); };
  const slice = archive.slice.bind(archive);
  let largestRead = 0;
  archive.slice = (start, end, type) => { largestRead = Math.max(largestRead, end - start); return slice(start, end, type); };
  const restored = await parseWardrobeBackup(archive);
  assert.equal(restored.assets.length, 200);
  assert.ok(largestRead <= 1000000);
  assert.deepEqual(restored.assets.map((asset) => asset.id), assets.map((asset) => asset.id));
  const target = createWardrobeStore({ indexedDB: new IDBFactory() });
  await target.commit(restored.state, 0, restored.assets);
  assert.equal((await target.read()).photos.size, 200);
  assert.deepEqual((await target.read()).state, state);
  store.close(); target.close();
});
