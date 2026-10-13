import { validateWardrobe, migrateLegacyWardrobe } from './wardrobe.js';

export const MAX_GARMENT_PHOTO_BYTES = 800000;
const BACKUP_MAGIC = 'EOULBK02';
const MAX_BACKUP_MANIFEST_BYTES = 1000000;
const MAX_BACKUP_FILE_BYTES = 200 * MAX_GARMENT_PHOTO_BYTES + MAX_BACKUP_MANIFEST_BYTES + 12;

function packBackup(metadata, rows) {
  let offset = 0;
  const parts = [], photos = [];
  for (const row of rows) {
    if (!(row.blob instanceof Blob)) { photos.push({ id: row.id, invalidValue: row.value }); continue; }
    photos.push({ id: row.id, type: row.blob.type, offset, bytes: row.blob.size });
    parts.push(row.blob); offset += row.blob.size;
  }
  const manifest = new TextEncoder().encode(JSON.stringify({ ...metadata, photos }));
  if (manifest.length > MAX_BACKUP_MANIFEST_BYTES) throw new Error('백업의 기록 정보가 너무 큽니다. 원본은 변경하지 않았습니다.');
  const header = new Uint8Array(12);
  header.set(new TextEncoder().encode(BACKUP_MAGIC));
  new DataView(header.buffer).setUint32(8, manifest.length, true);
  return new Blob([header, manifest, ...parts], { type: 'application/octet-stream' });
}

export async function legacyWardrobeFingerprint(raw) {
  if (raw === null) return null;
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  return [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function photoAsset(blob) {
  if (!(blob instanceof Blob) || blob.type !== 'image/jpeg' || blob.size < 3 || blob.size > MAX_GARMENT_PHOTO_BYTES) throw new Error('저장할 사진의 형식이나 용량을 확인해 주세요.');
  const bytes = await blob.arrayBuffer();
  const head = new Uint8Array(bytes, 0, 3);
  if (head[0] !== 255 || head[1] !== 216 || head[2] !== 255) throw new Error('JPEG 사진을 읽지 못했습니다.');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return { id: 'p_' + [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join(''), blob };
}

export function createWardrobeStore({ indexedDB = globalThis.indexedDB, name = 'eoul-wardrobe-v2' } = {}) {
  let connection;
  async function open() {
    if (!indexedDB) throw new Error('이 브라우저에서 옷장을 저장할 수 없습니다. 다른 일반 브라우저에서 열어 주세요.');
    if (connection) return connection;
    connection = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      let settled = false;
      const timer = setTimeout(() => { settled = true; reject(new Error('저장소를 열지 못했습니다. 다른 옷장 탭을 닫고 다시 시도해 주세요.')); }, 5000);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('records');
        request.result.createObjectStore('photos');
      };
      request.onerror = () => { clearTimeout(timer); reject(request.error); };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) { request.result.close(); return; }
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = null; };
        resolve(db);
      };
    });
    return connection;
  }

  function validateEnvelope(row) {
    if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1 || Object.keys(row).some((key) => !['revision', 'state'].includes(key))) throw new Error('저장된 버전을 읽지 못했습니다. 원본을 보존했습니다.');
    validateWardrobe(row.state);
  }

  async function read() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'photos'], 'readonly');
      const request = tx.objectStore('records').get('current');
      let result = null, failure;
      request.onsuccess = () => {
        if (request.result === undefined) return;
        try { validateEnvelope(request.result); } catch (error) { failure = error; tx.abort(); return; }
        result = { ...request.result, photos: new Map() };
        for (const id of new Set(result.state.garments.map((garment) => garment.photoId).filter(Boolean))) {
          const photo = tx.objectStore('photos').get(id);
          photo.onsuccess = () => {
            if (!(photo.result instanceof Blob)) { failure = new Error('일부 사진을 읽지 못했습니다. 기록을 덮어쓰지 않았습니다.'); tx.abort(); return; }
            result.photos.set(id, photo.result);
          };
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('옷장을 읽지 못했습니다.'));
    });
  }

  async function commit(state, expectedRevision, assets = []) {
    validateWardrobe(state);
    const next = structuredClone(state);
    const verified = [];
    for (const asset of assets) {
      const checked = await photoAsset(asset.blob);
      if (checked.id !== asset.id) throw new Error('사진과 참조 정보가 다릅니다.');
      verified.push(checked);
    }
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'photos'], 'readwrite');
      const records = tx.objectStore('records'), photos = tx.objectStore('photos');
      const request = records.get('current');
      let failure, revision;
      request.onsuccess = () => {
        const old = request.result;
        try {
          if (old !== undefined) validateEnvelope(old);
          if ((old?.revision || 0) !== expectedRevision) {
            failure = new Error('다른 화면에서 옷장이 바뀌었습니다. 최신 옷장을 불러온 뒤 다시 저장해 주세요.');
            failure.code = 'conflict';
            tx.abort(); return;
          }
          revision = (old?.revision || 0) + 1;
          const needed = new Set(next.garments.map((garment) => garment.photoId).filter(Boolean));
          for (const asset of verified) {
            if (!needed.has(asset.id)) throw new Error('옷에 연결되지 않은 사진은 저장하지 않습니다.');
            photos.put(asset.blob, asset.id);
          }
          for (const id of needed) {
            const check = photos.get(id);
            check.onsuccess = () => {
              if (!(check.result instanceof Blob)) { failure = new Error('사진을 함께 저장하지 못했습니다. 다시 시도해 주세요.'); tx.abort(); }
            };
          }
          // Only confirmed removal/replacement can collect a photo, and only its last reference.
          for (const id of new Set((old?.state.garments || []).map((garment) => garment.photoId).filter(Boolean))) if (!needed.has(id)) photos.delete(id);
          records.put({ revision, state: next }, 'current');
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(revision);
      tx.onabort = () => reject(failure || tx.error || new Error('저장하지 못했습니다. 용량을 확인하고 다시 시도해 주세요.'));
    });
  }

  async function load(legacyRaw = null) {
    const existing = await read();
    if (existing) return existing;
    const initial = migrateLegacyWardrobe(legacyRaw);
    initial.legacyFingerprint = await legacyWardrobeFingerprint(legacyRaw);
    try { await commit(initial, 0); }
    catch (error) { if (error.code !== 'conflict') throw error; }
    return read();
  }

  async function backup() {
    const current = await read();
    if (!current) throw new Error('백업할 옷장이 없습니다.');
    return packBackup({ format: 'eoul-wardrobe-backup', version: 2, exportedAt: new Date().toISOString(), state: current.state }, [...current.photos].map(([id, blob]) => ({ id, blob })));
  }

  // Validation failures must never force a reset. Keep an export path for unknown JSON fields,
  // missing references and unreferenced photo blobs; normal restore refuses this diagnostic file.
  async function recoveryBackup(legacyRaw = null) {
    const db = await open();
    const snapshot = await new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'photos'], 'readonly');
      const records = tx.objectStore('records').getAll(), recordKeys = tx.objectStore('records').getAllKeys();
      const photos = tx.objectStore('photos').getAll(), photoKeys = tx.objectStore('photos').getAllKeys();
      tx.oncomplete = () => resolve({ records: records.result.map((value, index) => ({ key: recordKeys.result[index], value })), photos: photos.result.map((value, index) => ({ key: photoKeys.result[index], value })) });
      tx.onabort = () => reject(tx.error || new Error('저장 원문을 읽지 못했습니다. 원본은 변경하지 않았습니다.'));
    });
    return packBackup({ format: 'eoul-wardrobe-recovery', version: 2, exportedAt: new Date().toISOString(), legacyRaw, records: snapshot.records }, snapshot.photos.map((row) => ({ id: row.key, ...(row.value instanceof Blob ? { blob: row.value } : { value: row.value }) })));
  }

  return { load, read, commit, backup, recoveryBackup, close() { connection?.close(); connection = null; } };
}

async function parseLegacyWardrobeBackup(text) {
  if (text.length > 10000000) throw new Error('이전 JSON 백업이 너무 큽니다. 개발 지원으로 원본을 보존해 주세요.');
  const backup = JSON.parse(text);
  if (!backup || backup.format !== 'eoul-wardrobe-backup' || backup.version !== 1 || Object.keys(backup).some((key) => !['format', 'version', 'exportedAt', 'state', 'photos'].includes(key))) throw new Error('지원하는 옷장 백업 파일이 아닙니다.');
  validateWardrobe(backup.state);
  if (!Array.isArray(backup.photos) || backup.photos.length > 200) throw new Error('백업 사진 목록을 읽지 못했습니다.');
  const refs = new Set(backup.state.garments.map((garment) => garment.photoId).filter(Boolean));
  const assets = [], ids = new Set();
  for (const value of backup.photos) {
    if (!value || Object.keys(value).some((key) => !['id', 'type', 'base64'].includes(key)) || !refs.has(value.id) || ids.has(value.id) || value.type !== 'image/jpeg' || typeof value.base64 !== 'string' || value.base64.length > Math.ceil(MAX_GARMENT_PHOTO_BYTES / 3) * 4) throw new Error('백업 사진 정보가 올바르지 않습니다.');
    const decoded = Uint8Array.from(atob(value.base64), (character) => character.charCodeAt(0));
    const asset = await photoAsset(new Blob([decoded], { type: value.type }));
    if (asset.id !== value.id) throw new Error('백업 사진이 변경되거나 손상됐습니다.');
    ids.add(asset.id); assets.push(asset);
  }
  if (refs.size !== ids.size) throw new Error('백업에 필요한 사진이 빠져 있습니다.');
  return { state: backup.state, assets };
}

export async function parseWardrobeBackup(file) {
  if (typeof file === 'string') return parseLegacyWardrobeBackup(file);
  if (!(file instanceof Blob) || file.size > MAX_BACKUP_FILE_BYTES) throw new Error('지원 크기를 넘거나 읽을 수 없는 백업 파일입니다.');
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (new TextDecoder().decode(header.subarray(0, 8)) !== BACKUP_MAGIC) {
    if (file.size > 10000000) throw new Error('이전 JSON 백업이 너무 큽니다. 개발 지원으로 원본을 보존해 주세요.');
    return parseLegacyWardrobeBackup(await file.text());
  }
  if (header.length !== 12) throw new Error('백업 파일의 머리 부분이 손상됐습니다.');
  const length = new DataView(header.buffer).getUint32(8, true);
  if (!length || length > MAX_BACKUP_MANIFEST_BYTES || file.size < 12 + length) throw new Error('백업 기록의 길이가 올바르지 않습니다.');
  const backup = JSON.parse(await file.slice(12, 12 + length).text());
  if (!backup || backup.format !== 'eoul-wardrobe-backup' || backup.version !== 2 || Object.keys(backup).some((key) => !['format', 'version', 'exportedAt', 'state', 'photos'].includes(key))) throw new Error('지원하는 옷장 백업 파일이 아닙니다.');
  validateWardrobe(backup.state);
  if (!Array.isArray(backup.photos) || backup.photos.length > 200) throw new Error('백업 사진 목록이 올바르지 않습니다.');
  const refs = new Set(backup.state.garments.map((garment) => garment.photoId).filter(Boolean));
  const assets = [], ids = new Set();
  let offset = 0;
  for (const row of backup.photos) {
    if (!row || Object.keys(row).some((key) => !['id', 'type', 'offset', 'bytes'].includes(key)) || !refs.has(row.id) || ids.has(row.id) || row.type !== 'image/jpeg' || row.offset !== offset || !Number.isSafeInteger(row.bytes) || row.bytes < 3 || row.bytes > MAX_GARMENT_PHOTO_BYTES || 12 + length + offset + row.bytes > file.size) throw new Error('백업 사진의 구간 정보가 올바르지 않습니다.');
    const asset = await photoAsset(file.slice(12 + length + offset, 12 + length + offset + row.bytes, row.type));
    if (asset.id !== row.id) throw new Error('백업 사진이 변경되거나 손상됐습니다.');
    ids.add(asset.id); assets.push(asset); offset += row.bytes;
  }
  if (ids.size !== refs.size || 12 + length + offset !== file.size) throw new Error('백업 사진이 빠지거나 불필요한 내용이 포함돼 있습니다.');
  return { state: backup.state, assets };
}
