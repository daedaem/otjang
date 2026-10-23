import { migrateLegacyWardrobe } from '../../../app/lite/src/domain/wardrobe.js';
import { photoAsset, legacyWardrobeFingerprint } from './wardrobe-store.js';

export async function readLegacyPhotos(ids, indexedDB = globalThis.indexedDB) {
  if (!ids.length) return new Map();
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('eoul');
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error('이전 사진 저장소를 열지 못했습니다. 다른 탭을 닫고 다시 시도해 주세요.'));
    }, 5000);
    let absent = false;
    req.onupgradeneeded = () => {
      absent = true;
      req.transaction.abort();
    }; // Never create or upgrade the source DB.
    req.onerror = () => {
      clearTimeout(timeout);
      if (absent) {
        resolve(null);
        return;
      }
      reject(new Error('이전 사진 저장소가 없습니다. 원본을 변경하지 않았습니다.'));
    };
    req.onsuccess = () => {
      clearTimeout(timeout);
      if (settled) {
        req.result.close();
        return;
      }
      resolve(req.result);
    };
  });
  if (!db) return new Map();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly'),
        rows = new Map();
      let failure;
      for (const id of ids) {
        const req = tx.objectStore('photos').get(id);
        req.onsuccess = () => {
          if (req.result !== undefined) rows.set(id, req.result);
        };
      }
      tx.oncomplete = () => resolve(rows);
      tx.onabort = () => reject(failure || tx.error);
    });
  } finally {
    db.close();
  }
}
export async function prepareLegacyWardrobe(raw, indexedDB = globalThis.indexedDB) {
  const state = migrateLegacyWardrobe(raw),
    assets = [];
  const old = raw === null ? null : JSON.parse(raw);
  const ids = old?.v === 2 ? old.closet.filter((i) => i.photo).map((i) => i.id) : [];
  const photos = await readLegacyPhotos(ids, indexedDB);
  for (const [id, data] of photos) {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length > 1100000)
      throw new Error('이전 사진 형식이나 크기를 확인해 주세요. 원본은 유지됩니다.');
    const asset = await photoAsset(
      new Blob([Uint8Array.from(atob(data.split(',')[1]), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }),
    );
    const item = state.garments.find((i) => i.id === id);
    item.photoId = asset.id;
    item.photoMissing = false;
    if (!assets.some((a) => a.id === asset.id)) assets.push(asset);
  }
  state.legacyFingerprint = await legacyWardrobeFingerprint(raw);
  return { state, assets, missing: ids.filter((id) => !photos.has(id)) };
}
