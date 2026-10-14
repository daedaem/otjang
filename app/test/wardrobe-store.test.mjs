import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createWardrobeStore, photoAsset, parseWardrobeBackup } from '../src/wardrobe-store.js';
import { makeGarment, newWardrobeState, migrateLegacyWardrobe, validateWardrobe } from '../src/wardrobe.js';

const jpeg = (byte = 7) => new Blob([new Uint8Array([255, 216, 255, byte])], { type: 'image/jpeg' });
const personal = (garments) => ({ ...newWardrobeState(), demo: false, demoSelected: [], garments });
const garment = (id, photoId = null) =>
  makeGarment({ id, kind: 'shirt', gender: 'M', photoId, createdAt: '2026-10-14T00:00:00.000Z' });
async function manifest(file) {
  const header = Buffer.from(await file.slice(0, 12).arrayBuffer());
  assert.equal(header.subarray(0, 8).toString(), 'EOULBK02');
  return JSON.parse(await file.slice(12, 12 + header.readUInt32LE(8)).text());
}
async function backupPhotoBytes(file, row) {
  const header = Buffer.from(await file.slice(0, 12).arrayBuffer());
  const start = 12 + header.readUInt32LE(8) + row.offset;
  return new Uint8Array(await file.slice(start, start + row.bytes).arrayBuffer());
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
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'photos'], 'readwrite');
      callback(tx);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function rawSnapshot(indexedDB) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('eoul-wardrobe-v2', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'photos'], 'readonly'),
        records = tx.objectStore('records').getAll(),
        recordKeys = tx.objectStore('records').getAllKeys(),
        photos = tx.objectStore('photos').getAll(),
        photoKeys = tx.objectStore('photos').getAllKeys();
      tx.oncomplete = () =>
        resolve({
          records: records.result,
          recordKeys: recordKeys.result,
          photos: photos.result,
          photoKeys: photoKeys.result,
        });
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

test('new photo write rolls back when metadata write fails; neither a garment nor orphan blob is acknowledged', async () => {
  const { store } = await setup();
  const asset = await photoAsset(jpeg());
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'records') throw new DOMException('metadata quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try {
    await assert.rejects(store.commit(personal([garment('g_a', asset.id)]), 1, [asset]), /metadata quota/);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
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
  assert.deepEqual(
    new Uint8Array(await current.photos.get(asset.id).arrayBuffer()),
    new Uint8Array(await asset.blob.arrayBuffer()),
  );
  store.close();
});

test('a damaged Blob under a valid photo ID blocks reads and survives recovery from a verified backup', async () => {
  const { indexedDB, store } = await setup();
  const asset = await photoAsset(jpeg(41)),
    damaged = jpeg(42);
  await store.commit(personal([garment('g_damaged', asset.id)]), 1, [asset]);
  const backup = await store.backup(),
    original = await store.read(),
    observedEpoch = store.currentEpoch(),
    raw = { revision: original.revision, epoch: crypto.randomUUID(), state: original.state };
  await alter(indexedDB, (tx) => {
    tx.objectStore('records').put(raw, 'current');
    tx.objectStore('photos').put(damaged, asset.id);
  });

  await assert.rejects(store.read(), /일부 사진을 읽지 못했습니다/);
  assert.equal(store.currentEpoch(), observedEpoch, 'an invalid snapshot cannot authorize a new epoch');
  const beforeFile = await store.recoveryBackup(),
    before = await manifest(beforeFile),
    beforePhoto = before.photos.find((row) => row.id === asset.id);
  assert.deepEqual(before.records, [{ key: 'current', value: raw }]);
  assert.deepEqual(await backupPhotoBytes(beforeFile, beforePhoto), new Uint8Array(await damaged.arrayBuffer()));

  const parsed = await parseWardrobeBackup(backup);
  await store.recover(parsed.state, await store.recoveryState(), parsed.assets);
  const current = await store.read(),
    recoveryFile = await store.recoveryBackup(),
    recovery = await manifest(recoveryFile),
    saved = recovery.records.find((row) => row.value?.format === 'eoul-wardrobe-recovery-snapshot'),
    mapping = saved.value.photos.find((row) => row.sourceKey === asset.id),
    archived = recovery.photos.find((row) => row.id === mapping.snapshotKey);
  assert.deepEqual(current.state, parsed.state);
  assert.deepEqual(
    new Uint8Array(await current.photos.get(asset.id).arrayBuffer()),
    new Uint8Array(await asset.blob.arrayBuffer()),
  );
  assert.deepEqual(saved.value.source.row, raw);
  assert.notEqual(mapping.snapshotKey, asset.id);
  assert.deepEqual(await backupPhotoBytes(recoveryFile, archived), new Uint8Array(await damaged.arrayBuffer()));
  store.close();
});

test('stored photos with invalid MIME, size or JPEG signature cannot be read as a valid wardrobe', async () => {
  const oversized = new Uint8Array(800001);
  oversized.set([255, 216, 255]);
  for (const damaged of [
    new Blob([new Uint8Array([255, 216, 255, 43])], { type: 'text/plain' }),
    new Blob([new Uint8Array([255, 216])], { type: 'image/jpeg' }),
    new Blob([new Uint8Array([255, 216, 0, 43])], { type: 'image/jpeg' }),
    new Blob([oversized], { type: 'image/jpeg' }),
  ]) {
    const { indexedDB, store } = await setup();
    const asset = await photoAsset(jpeg(43));
    await store.commit(personal([garment('g_invalid', asset.id)]), 1, [asset]);
    await alter(indexedDB, (tx) => tx.objectStore('photos').put(damaged, asset.id));
    await assert.rejects(store.read(), /일부 사진을 읽지 못했습니다/);
    store.close();
  }
});

test('shared photo is retained until its last garment is deleted; unrelated orphan photos are not collected', async () => {
  const { indexedDB, store } = await setup();
  const asset = await photoAsset(jpeg()),
    orphan = await photoAsset(jpeg(10));
  await store.commit(personal([garment('g_a', asset.id), garment('g_b', asset.id)]), 1, [asset]);
  await alter(indexedDB, (tx) => tx.objectStore('photos').put(orphan.blob, orphan.id));
  await store.commit(personal([garment('g_b', asset.id)]), 2);
  assert.equal((await store.read()).photos.size, 1);
  await store.commit(personal([]), 3);
  const raw = await manifest(await store.recoveryBackup());
  assert.deepEqual(
    raw.photos.map((row) => row.id),
    [orphan.id],
  );
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
  first.close();
  second.close();
});

test('backup round trip retains IDs, preferences, shared photo bytes and duplicate kinds', async () => {
  const { store } = await setup();
  const asset = await photoAsset(jpeg());
  const state = {
    ...personal([garment('g_a', asset.id), garment('g_b', asset.id)]),
    saved: ['ms-1115031'],
    budget: 50000,
  };
  await store.commit(state, 1, [asset]);
  const text = await store.backup(),
    parsed = await parseWardrobeBackup(text);
  assert.equal(parsed.assets.length, 1);
  const target = createWardrobeStore({ indexedDB: new IDBFactory() });
  await target.commit(parsed.state, 0, parsed.assets);
  assert.deepEqual((await target.read()).state, state);
  assert.deepEqual(
    new Uint8Array(await (await target.read()).photos.get(asset.id).arrayBuffer()),
    new Uint8Array(await asset.blob.arrayBuffer()),
  );
  store.close();
  target.close();
});

test('tampered, incomplete, future-format and unreferenced-photo backups fail before commit', async () => {
  const { store } = await setup();
  const asset = await photoAsset(jpeg());
  await store.commit(personal([garment('g_a', asset.id)]), 1, [asset]);
  const binary = await store.backup();
  const good = {
    format: 'eoul-wardrobe-backup',
    version: 1,
    state: (await store.read()).state,
    photos: [{ id: asset.id, type: 'image/jpeg', base64: btoa(String.fromCharCode(255, 216, 255, 7)) }],
  };
  const tampered = structuredClone(good);
  tampered.photos[0].base64 = btoa(String.fromCharCode(255, 216, 255, 8));
  const missing = structuredClone(good);
  missing.photos = [];
  const future = { ...good, futureField: true };
  const unreferenced = structuredClone(good);
  unreferenced.state.garments[0].photoId = null;
  for (const invalid of [tampered, missing, future, unreferenced, null])
    await assert.rejects(parseWardrobeBackup(JSON.stringify(invalid)));
  await assert.rejects(
    parseWardrobeBackup(new Blob([binary.slice(0, binary.size - 1), new Uint8Array([99])])),
    /사진이 변경/,
  );
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
    await alter(indexedDB, (tx) => {
      tx.objectStore('records').put(invalid, 'current');
      tx.objectStore('photos').put(photo.blob, photo.id);
    });
    await assert.rejects(store.load());
    await assert.rejects(store.commit(newWardrobeState(), 0));
    const raw = await manifest(await store.recoveryBackup('original localStorage text'));
    assert.deepEqual(raw.records[0].value, invalid);
    assert.equal(raw.photos.length, 1);
    assert.equal(raw.legacyRaw, 'original localStorage text');
    store.close();
  }
});

test('diagnostic export refuses lossy non-JSON record values and leaves raw records and photo bytes unchanged', async () => {
  const cyclic = {};
  cyclic.self = cyclic;
  let deeplyNested = null;
  for (let depth = 0; depth < 105; depth++) deeplyNested = { nested: deeplyNested };
  for (const value of [
    new Date('2026-10-14T00:00:00.000Z'),
    undefined,
    { attachment: jpeg(81) },
    NaN,
    -0,
    [undefined],
    new Map([['future', 'value']]),
    cyclic,
    deeplyNested,
  ]) {
    const { indexedDB, store } = await setup(),
      raw = { revision: 7, state: { schema: 99, future: value } },
      photo = jpeg(82);
    await alter(indexedDB, (tx) => {
      tx.objectStore('records').put(raw, 'current');
      tx.objectStore('photos').put(photo, 'original-photo');
    });
    const before = await rawSnapshot(indexedDB);
    await assert.rejects(
      store.recoveryBackup('synthetic legacy original'),
      (error) => error.code === 'unsupported-diagnostic-value' && /원본은 변경하지 않았습니다/.test(error.message),
    );
    const after = await rawSnapshot(indexedDB);
    assert.deepEqual(after, before);
    assert.deepEqual(new Uint8Array(await after.photos[0].arrayBuffer()), new Uint8Array(await photo.arrayBuffer()));
    store.close();
  }
});

test('diagnostic export also refuses non-JSON database keys and invalid photo values without changing either store', async () => {
  for (const invalid of [
    { store: 'records', key: new Date('2026-10-14T00:00:00.000Z'), value: { future: 'record' } },
    { store: 'photos', key: new Date('2026-10-14T00:00:00.000Z'), value: jpeg(83) },
    { store: 'photos', key: 'invalid-photo', value: { attachment: jpeg(84) } },
    { store: 'photos', key: 'invalid-photo', value: undefined },
  ]) {
    const { indexedDB, store } = await setup();
    await alter(indexedDB, (tx) => tx.objectStore(invalid.store).put(invalid.value, invalid.key));
    const before = await rawSnapshot(indexedDB);
    await assert.rejects(store.recoveryBackup(), (error) => error.code === 'unsupported-diagnostic-value');
    assert.deepEqual(await rawSnapshot(indexedDB), before);
    store.close();
  }
});

test('supported diagnostic exports retain unknown JSON records, invalid JSON photo values and binary photo bytes', async () => {
  const { indexedDB, store } = await setup(),
    raw = { revision: 7, state: { schema: 99, future: { nested: [null, false, 0, 'keep'] } } },
    invalidPhoto = { reason: 'synthetic invalid photo', value: [1, null] },
    photo = jpeg(85);
  await alter(indexedDB, (tx) => {
    tx.objectStore('records').put(raw, 'current');
    tx.objectStore('photos').put(invalidPhoto, 'invalid-photo');
    tx.objectStore('photos').put(photo, 'original-photo');
  });
  const file = await store.recoveryBackup('synthetic exact legacy text'),
    decoded = await manifest(file);
  assert.deepEqual(decoded.records, [{ key: 'current', value: raw }]);
  assert.equal(decoded.legacyRaw, 'synthetic exact legacy text');
  assert.deepEqual(
    decoded.photos.find((row) => row.id === 'invalid-photo'),
    { id: 'invalid-photo', invalidValue: invalidPhoto },
  );
  assert.deepEqual(
    await backupPhotoBytes(
      file,
      decoded.photos.find((row) => row.id === 'original-photo'),
    ),
    new Uint8Array(await photo.arrayBuffer()),
  );
  store.close();
});

test('recovery from an absent current record creates a JSON-compatible archive instead of an undefined source row', async () => {
  const indexedDB = new IDBFactory(),
    store = createWardrobeStore({ indexedDB });
  await store.recover(personal([]), await store.recoveryState());
  const stored = await rawSnapshot(indexedDB),
    storedArchive = stored.records.find((row) => row?.format === 'eoul-wardrobe-recovery-snapshot');
  assert.deepEqual(storedArchive.source, { key: 'current', exists: false });
  assert.equal(Object.hasOwn(storedArchive.source, 'row'), false);
  const decoded = await manifest(await store.recoveryBackup()),
    archive = decoded.records.find((row) => row.value?.format === 'eoul-wardrobe-recovery-snapshot');
  assert.deepEqual(archive.value.source, { key: 'current', exists: false });
  assert.equal(Object.hasOwn(archive.value.source, 'row'), false);
  assert.equal((await store.read()).state.garments.length, 0);
  store.close();
});

test('legacy migration is deterministic and rejects a corrupt demo flag without dropping owned clothes', () => {
  const raw = JSON.stringify({
    onboarded: true,
    gender: 'M',
    style: 'classic',
    owned: ['m-chino', 'm-chino'],
    saved: ['ms-1115031'],
  });
  const a = migrateLegacyWardrobe(raw),
    b = migrateLegacyWardrobe(raw);
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
  archive.text = () => {
    throw new Error('must not read the whole archive as text');
  };
  archive.arrayBuffer = () => {
    throw new Error('must not read the whole archive into one buffer');
  };
  const slice = archive.slice.bind(archive);
  let largestRead = 0;
  archive.slice = (start, end, type) => {
    largestRead = Math.max(largestRead, end - start);
    return slice(start, end, type);
  };
  const restored = await parseWardrobeBackup(archive);
  assert.equal(restored.assets.length, 200);
  assert.ok(largestRead <= 1000000);
  assert.deepEqual(
    restored.assets.map((asset) => asset.id),
    assets.map((asset) => asset.id),
  );
  const target = createWardrobeStore({ indexedDB: new IDBFactory() });
  await target.commit(restored.state, 0, restored.assets);
  assert.equal((await target.read()).photos.size, 200);
  assert.deepEqual((await target.read()).state, state);
  store.close();
  target.close();
});

test('confirmed recovery preserves a future raw record and every original photo with reconstructable keys', async () => {
  const { indexedDB, store } = await setup();
  const original = await photoAsset(jpeg(61)),
    replacement = await photoAsset(jpeg(62));
  const raw = { revision: 7, state: { schema: 99, futureField: 'preserve this exact synthetic source' } };
  await alter(indexedDB, (tx) => {
    tx.objectStore('records').put(raw, 'current');
    // A damaged source Blob under the backup's photo key must survive its replacement.
    tx.objectStore('photos').put(original.blob, replacement.id);
  });
  const expected = await store.recoveryState();
  const next = personal([garment('g_restored', replacement.id)]);
  const recovered = await store.recover(next, expected, [replacement], 'synthetic old localStorage');
  assert.deepEqual(recovered.state, next);
  assert.equal(recovered.revision, 8);
  const rawBackup = await manifest(await store.recoveryBackup());
  const saved = rawBackup.records.find((row) => row.value?.format === 'eoul-wardrobe-recovery-snapshot');
  assert.deepEqual(saved.value.source.row, raw);
  assert.equal(saved.value.legacyRaw, 'synthetic old localStorage');
  const mapping = saved.value.photos.find((row) => row.sourceKey === replacement.id);
  assert.ok(mapping);
  assert.ok(rawBackup.photos.some((row) => row.id === mapping.snapshotKey));
  const db = await new Promise((resolve) => {
    const request = indexedDB.open('eoul-wardrobe-v2');
    request.onsuccess = () => resolve(request.result);
  });
  const preserved = await new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly'),
      request = tx.objectStore('photos').get(mapping.snapshotKey);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
  });
  assert.deepEqual(new Uint8Array(await preserved.arrayBuffer()), new Uint8Array(await original.blob.arrayBuffer()));
  db.close();
  await store.commit(personal([]), recovered.revision, [], recovered.epoch);
  const afterReset = await manifest(await store.recoveryBackup());
  assert.ok(afterReset.photos.some((row) => row.id === mapping.snapshotKey));
  assert.ok(afterReset.records.some((row) => row.key === saved.key));
  store.close();
});

test('recovery rejects a changed raw record even when its revision is unchanged', async () => {
  const { indexedDB, store } = await setup();
  const raw = { revision: 3, state: { schema: 99, unknown: 'before' } };
  await alter(indexedDB, (tx) => tx.objectStore('records').put(raw, 'current'));
  const expected = await store.recoveryState();
  const changed = { ...raw, state: { ...raw.state, unknown: 'another tab' } };
  await alter(indexedDB, (tx) => tx.objectStore('records').put(changed, 'current'));
  await assert.rejects(store.recover(personal([]), expected), (error) => error.code === 'conflict');
  const preserved = await manifest(await store.recoveryBackup());
  assert.deepEqual(preserved.records, [{ key: 'current', value: changed }]);
  store.close();
});

test('recovery preservation failure rolls back copied photos and replacement together', async () => {
  const { indexedDB, store } = await setup();
  const original = await photoAsset(jpeg(71));
  const raw = { revision: 2, state: { schema: 99 } };
  await alter(indexedDB, (tx) => {
    tx.objectStore('records').put(raw, 'current');
    tx.objectStore('photos').put(original.blob, original.id);
  });
  const expected = await store.recoveryState(),
    add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) {
    if (this.name === 'records') throw new DOMException('recovery quota', 'QuotaExceededError');
    return add.apply(this, args);
  };
  try {
    await assert.rejects(store.recover(personal([]), expected), /recovery quota/);
  } finally {
    IDBObjectStore.prototype.add = add;
  }
  const preserved = await manifest(await store.recoveryBackup());
  assert.deepEqual(preserved.records, [{ key: 'current', value: raw }]);
  assert.deepEqual(
    preserved.photos.map((row) => row.id),
    [original.id],
  );
  store.close();
});

test('recovery epochs reject a stale pre-recovery tab despite revision number reuse', async () => {
  const { indexedDB, store: stale } = await setup();
  const previous = await stale.read();
  await alter(indexedDB, (tx) => tx.objectStore('records').put(null, 'current'));
  const repair = createWardrobeStore({ indexedDB });
  await repair.recover(personal([garment('g_repaired')]), await repair.recoveryState());
  const current = await repair.read();
  assert.equal(current.revision, previous.revision);
  assert.notEqual(current.epoch, previous.epoch);
  // Internal backup reads cannot authorize stale UI state to use the new epoch.
  await stale.backup();
  await assert.rejects(
    stale.commit(previous.state, previous.revision, [], previous.epoch),
    (error) => error.code === 'conflict',
  );
  assert.equal((await repair.read()).state.garments[0].id, 'g_repaired');
  stale.close();
  repair.close();
});

test('clearing the stores creates a fresh epoch and blocks a tab opened before erasure', async () => {
  const { indexedDB, store: stale } = await setup();
  const previous = await stale.read();
  await alter(indexedDB, (tx) => {
    tx.objectStore('records').clear();
    tx.objectStore('photos').clear();
  });
  const restarted = createWardrobeStore({ indexedDB });
  const fresh = await restarted.load();
  assert.equal(fresh.revision, previous.revision);
  assert.notEqual(fresh.epoch, previous.epoch);
  await assert.rejects(
    stale.commit(personal([garment('g_stale')]), previous.revision, [], previous.epoch),
    (error) => error.code === 'conflict',
  );
  assert.equal((await restarted.read()).state.garments.length, 0);
  stale.close();
  restarted.close();
});

test('legacy envelopes without an epoch remain readable and gain an epoch on the next confirmed write', async () => {
  const { indexedDB, store } = await setup();
  await alter(indexedDB, (tx) => tx.objectStore('records').put({ revision: 1, state: newWardrobeState() }, 'current'));
  const legacy = await store.read();
  assert.equal(legacy.epoch, undefined);
  await store.commit(personal([]), legacy.revision, [], null);
  assert.match((await store.read()).epoch, /^[a-f0-9-]{36}$/);
  store.close();
});

test('the actual pre-epoch fd06eb9 store refuses the new envelope after clear and recovery', async () => {
  // Frozen public module from fd06eb9, rather than a made-up revision-only writer.
  const source = fs.readFileSync(new URL('./fixtures/wardrobe-store-fd06eb9.txt', import.meta.url), 'utf8');
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    '937083ff44906adc4dffb0cab57f62fb322b4f31a39f040f6349595cf23771c9',
  );
  const context = vm.createContext({
    Blob,
    crypto: globalThis.crypto,
    structuredClone,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    DataView,
    setTimeout,
    clearTimeout,
    atob,
    btoa,
    validateWardrobe,
    migrateLegacyWardrobe,
  });
  vm.runInContext(
    source.replace(/^import[^\n]+\n/gm, '').replace(/^export\s+/gm, '') +
      '\nglobalThis.oldStore = createWardrobeStore;',
    context,
  );
  for (const operation of ['clear', 'recover']) {
    const { indexedDB, store } = await setup();
    const oldState = personal([garment('old-tab-record')]);
    await alter(indexedDB, (tx) => tx.objectStore('records').put({ revision: 1, state: oldState }, 'current'));
    const old = context.oldStore({ indexedDB });
    const before = await old.read();
    if (operation === 'clear') {
      await alter(indexedDB, (tx) => {
        tx.objectStore('records').clear();
        tx.objectStore('photos').clear();
      });
      await store.load();
    } else {
      await alter(indexedDB, (tx) => tx.objectStore('records').put(null, 'current'));
      await store.recover(personal([]), await store.recoveryState());
    }
    const current = await store.read();
    assert.equal(current.revision, before.revision, operation);
    await assert.rejects(old.commit(before.state, before.revision), /저장된 버전을 읽지 못했습니다/);
    assert.equal((await store.read()).state.garments.length, 0);
    old.close();
    store.close();
  }
});

test('a subsequent recovery retains archive photo keys without recursively copying earlier archives', async () => {
  const { store } = await setup();
  const asset = await photoAsset(jpeg(91));
  const next = personal([garment('repeated-backup', asset.id)]);
  await store.commit(next, 1, [asset]);
  await store.recover(next, await store.recoveryState(), [asset]);
  const first = await manifest(await store.recoveryBackup());
  const archived = first.photos.find((row) => row.id.startsWith('recovery-photo:')).id;
  await store.recover(next, await store.recoveryState(), [asset]);
  const second = await manifest(await store.recoveryBackup());
  assert.equal(
    second.photos.length,
    first.photos.length + 1,
    'only the current original key needs a new preservation copy',
  );
  assert.ok(second.photos.some((row) => row.id === archived));
  const archives = second.records.filter((row) => row.value?.format === 'eoul-wardrobe-recovery-snapshot');
  assert.ok(
    archives.some((row) =>
      row.value.photos.some((photo) => photo.sourceKey === archived && photo.snapshotKey === archived),
    ),
  );
  store.close();
});
