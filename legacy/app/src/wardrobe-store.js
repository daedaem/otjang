import { validateWardrobe, migrateLegacyWardrobe } from '../../../app/lite/src/domain/wardrobe.js';
import { purchaseJourneyDetails, MAX_WARDROBE_STATE_BYTES } from '../../../app/lite/src/domain/purchase-journey.js';

export const MAX_GARMENT_PHOTO_BYTES = 800000;
export const MAX_JOURNEY_STATE_BYTES = 600 * 1024;
export const MAX_OWNERSHIP_JOURNEY_STATE_BYTES = 680 * 1024;
export const JOURNEY_STATE_WARNING_BYTES = 500 * 1024;
export const WARDROBE_STATE_WARNING_BYTES = MAX_WARDROBE_STATE_BYTES - 64 * 1024;
const BACKUP_MAGIC = 'EOULBK02';
const MAX_BACKUP_MANIFEST_BYTES = 1000000;
const MAX_BACKUP_FILE_BYTES = 200 * MAX_GARMENT_PHOTO_BYTES + MAX_BACKUP_MANIFEST_BYTES + 12;

export function journeyStorageUsage(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(state?.journeys ?? [])).length;
  return {
    bytes, limitBytes: MAX_JOURNEY_STATE_BYTES, warningBytes: JOURNEY_STATE_WARNING_BYTES,
    warning: bytes >= JOURNEY_STATE_WARNING_BYTES, overBudget: bytes > MAX_JOURNEY_STATE_BYTES,
  };
}

export function wardrobeStateStorageUsage(state) {
  // closet and tab belong to the screen view. Photo Blobs live in a separate
  // object store; only their metadata references contribute to this JSON limit.
  const { closet, tab, ...record } = state ?? {};
  const bytes = new TextEncoder().encode(JSON.stringify(record)).length;
  return {
    bytes, limitBytes: MAX_WARDROBE_STATE_BYTES, warningBytes: WARDROBE_STATE_WARNING_BYTES,
    warning: bytes >= WARDROBE_STATE_WARNING_BYTES, overBudget: bytes > MAX_WARDROBE_STATE_BYTES,
  };
}

/** The shared price/diary allowance after reserving future ownership and clothes. */
export function noteStorageUsage(state) {
  const encodedBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
  const offerBytes = encodedBytes(state?.offerRecords ?? []);
  const wearBytes = encodedBytes(state?.wears ?? []);
  const bytes = offerBytes + wearBytes;
  const futureJourneyBytes = Math.max(0, MAX_OWNERSHIP_JOURNEY_STATE_BYTES - journeyStorageUsage(state).bytes);
  const clothingHeadroomBytes = 64 * 1024;
  const otherBytes = wardrobeStateStorageUsage(state).bytes - bytes;
  const limitBytes = Math.max(0, MAX_WARDROBE_STATE_BYTES - otherBytes - futureJourneyBytes - clothingHeadroomBytes);
  const warningBytes = Math.ceil(limitBytes * 0.9);
  return {
    bytes, offerBytes, wearBytes, limitBytes,
    remainingBytes: Math.max(0, limitBytes - bytes),
    warningBytes, warning: bytes >= warningBytes, overBudget: bytes > limitBytes,
    futureJourneyBytes, clothingHeadroomBytes,
  };
}

// Notes must not consume space that ownership transitions may still need.
// Reserve the unused portion of the journey allowance, plus clothing headroom,
// when prices/wear notes grow. Existing imports and shrink-only cleanup stay
// readable even when they predate this reserve.
export function validateNoteGrowth(previous, next) {
  if (!previous) return;
  const usage = noteStorageUsage(next);
  if (usage.bytes <= noteStorageUsage(previous).bytes) return;
  if (usage.overBudget)
    throw Object.assign(new Error('옷과 반품·수령 기록을 위한 공간을 남겨 두었어요. 백업한 뒤 필요 없는 가격·착용 기록을 정리해 주세요. 기존 기록은 유지했습니다.'), { code: 'offer-budget' });
}

// This is a small metadata reserve, not separate storage partitions. Old records
// and confirmed backup replacements keep the full wardrobe validation contract.
// Only exact lossless journey conversion may grow past the new reserve at boot.
function losslessJourneyV5Upgrade(previous, next) {
  if (previous?.schema !== 4 || ![5, 6, 7].includes(next.schema) || previous.journeys.length !== next.journeys.length)
    return false;
  const expected = previous.journeys.map((journey, index) => {
    const converted = {
      ...structuredClone(journey), feedback: { fit: null, returnReason: null },
      history: journey.history.map((entry) => ({ ...entry, details: null })),
    };
    const candidate = next.journeys[index];
    if (candidate.history.length === converted.history.length + 1 &&
        candidate.history.at(-1).action === 'imported')
      converted.history.push({ action: 'imported', at: candidate.history.at(-1).at,
        details: purchaseJourneyDetails(converted) });
    return converted;
  });
  return rawRecordToken(expected, true) === rawRecordToken(next.journeys, true);
}

function essentialOwnershipJourneyChange(previous, next) {
  if (![5, 6, 7].includes(previous?.schema) || ![5, 6, 7].includes(next.schema) || previous.journeys.length !== next.journeys.length)
    return false;
  let changed = false;
  for (let index = 0; index < previous.journeys.length; index++) {
    const old = previous.journeys[index], current = next.journeys[index];
    if (rawRecordToken(old, true) === rawRecordToken(current, true)) continue;
    if (changed || current.history.length !== old.history.length + 1 ||
        rawRecordToken(old.history, true) !== rawRecordToken(current.history.slice(0, -1), true))
      return false;
    const event = current.history.at(-1);
    const lifecycle = ['received', 'kept', 'returned'].includes(event.action);
    const retirement = event.action === 'details-change' && old.replacementConfirmed !== current.replacementConfirmed;
    if (!lifecycle && !retirement) return false;
    const expected = {
      ...old, history: current.history,
      stage: lifecycle ? event.action : old.stage,
      garmentId: event.action === 'received' ? current.garmentId : old.garmentId,
      replacementConfirmed: retirement ? current.replacementConfirmed : old.replacementConfirmed,
    };
    if (rawRecordToken(expected, true) !== rawRecordToken(current, true) ||
        rawRecordToken(event.details, true) !== rawRecordToken(purchaseJourneyDetails(current), true))
      return false;
    changed = true;
  }
  return changed;
}

function validateJourneyGrowth(previous, next) {
  // Schema 2/3/4 are supported legacy read/write formats. The reserve applies to
  // new schema 5+ changes, not a retroactive rejection of those original bytes.
  if (next.schema < 5) return;
  const currentBytes = journeyStorageUsage(previous).bytes;
  const nextBytes = journeyStorageUsage(next).bytes;
  if (nextBytes <= MAX_JOURNEY_STATE_BYTES || nextBytes <= currentBytes || losslessJourneyV5Upgrade(previous, next))
    return;
  const essential = essentialOwnershipJourneyChange(previous, next);
  if (essential && nextBytes <= MAX_OWNERSHIP_JOURNEY_STATE_BYTES) return;
  const error = new Error(essential ?
    '구매 기록이 보유·반품 상태를 정리할 추가 공간까지 사용했어요. 기존 기록은 유지했습니다. 먼저 백업해 주세요.' :
    '옷 기록을 위한 공간을 남기기 위해 구매 기록의 추가 저장을 멈췄어요. 기존 기록은 유지했습니다. 먼저 백업해 주세요.');
  error.code = 'journey-budget';
  error.bytes = nextBytes;
  error.limitBytes = essential ? MAX_OWNERSHIP_JOURNEY_STATE_BYTES : MAX_JOURNEY_STATE_BYTES;
  throw error;
}

function packBackup(metadata, rows) {
  let offset = 0;
  const parts = [],
    photos = [];
  for (const row of rows) {
    if (!(row.blob instanceof Blob)) {
      photos.push({ id: row.id, invalidValue: row.value });
      continue;
    }
    photos.push({ id: row.id, type: row.blob.type, offset, bytes: row.blob.size });
    parts.push(row.blob);
    offset += row.blob.size;
  }
  const content = { ...metadata, photos };
  if (metadata.format === 'eoul-wardrobe-recovery') {
    try {
      // Only actual photo Blobs use the binary section. Records, keys and
      // invalid photo values must retain their exact JSON representation.
      rawRecordToken(content, true);
    } catch (cause) {
      const error = new Error(
        '진단 백업 파일로 정확히 보존할 수 없는 기록이 있습니다. 원본은 변경하지 않았습니다. 개발 지원으로 복구해 주세요.',
        { cause },
      );
      error.code = 'unsupported-diagnostic-value';
      throw error;
    }
  }
  const manifest = new TextEncoder().encode(JSON.stringify(content));
  if (manifest.length > MAX_BACKUP_MANIFEST_BYTES)
    throw new Error('백업의 기록 정보가 너무 큽니다. 원본은 변경하지 않았습니다.');
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
  if (!(blob instanceof Blob) || blob.type !== 'image/jpeg' || blob.size < 3 || blob.size > MAX_GARMENT_PHOTO_BYTES)
    throw new Error('저장할 사진의 형식이나 용량을 확인해 주세요.');
  const bytes = await blob.arrayBuffer();
  const head = new Uint8Array(bytes, 0, 3);
  if (head[0] !== 255 || head[1] !== 216 || head[2] !== 255) throw new Error('JPEG 사진을 읽지 못했습니다.');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return { id: 'p_' + [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join(''), blob };
}

// Recovery must compare the exact JSON record, including unknown future fields.
// Values JSON would silently drop or change require developer-assisted recovery.
function rawRecordToken(row, exists) {
  if (!exists) return 'missing';
  const seen = new Set();
  function exact(value, depth = 0) {
    if (depth > 100) throw new Error('원문의 중첩 구조가 너무 깊습니다. 원본을 보존했습니다.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if (!value || typeof value !== 'object' || seen.has(value))
      throw new Error('원문을 안전하게 비교할 수 없습니다. 원본을 보존하고 개발 지원으로 복구해 주세요.');
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length)
        throw new Error('원문을 안전하게 비교할 수 없습니다. 원본을 보존했습니다.');
      result = [];
      for (let i = 0; i < value.length; i++) {
        if (!Object.hasOwn(value, i)) throw new Error('원문을 안전하게 비교할 수 없습니다. 원본을 보존했습니다.');
        result.push(exact(value[i], depth + 1));
      }
    } else if (Object.prototype.toString.call(value) === '[object Object]') {
      result = Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, exact(value[key], depth + 1)]),
      );
    } else throw new Error('원문을 안전하게 비교할 수 없습니다. 원본을 보존하고 개발 지원으로 복구해 주세요.');
    seen.delete(value);
    return result;
  }
  return JSON.stringify(exact(row));
}

export function createWardrobeStore({ indexedDB = globalThis.indexedDB, name = 'eoul-wardrobe-v2' } = {}) {
  let connection,
    observedEpoch = null;
  async function open() {
    if (!indexedDB) throw new Error('이 브라우저에서 옷장을 저장할 수 없습니다. 다른 일반 브라우저에서 열어 주세요.');
    if (connection) return connection;
    connection = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new Error('저장소를 열지 못했습니다. 다른 옷장 탭을 닫고 다시 시도해 주세요.'));
      }, 5000);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('records');
        request.result.createObjectStore('photos');
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error);
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) {
          request.result.close();
          return;
        }
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = null;
        };
        resolve(db);
      };
    });
    return connection;
  }

  function validateEnvelope(row) {
    if (
      !row ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 1 ||
      Object.keys(row).some((key) => !['revision', 'state', 'epoch'].includes(key)) ||
      (Object.hasOwn(row, 'epoch') && (typeof row.epoch !== 'string' || !/^[a-f0-9-]{36}$/.test(row.epoch)))
    )
      throw new Error('저장된 버전을 읽지 못했습니다. 원본을 보존했습니다.');
    validateWardrobe(row.state);
  }

  async function read() {
    const db = await open();
    const snapshot = await new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'photos'], 'readonly');
      const request = tx.objectStore('records').get('current');
      let result = null,
        failure;
      request.onsuccess = () => {
        if (request.result === undefined) return;
        try {
          validateEnvelope(request.result);
        } catch (error) {
          failure = error;
          tx.abort();
          return;
        }
        result = { ...request.result, photos: new Map() };
        for (const id of new Set(result.state.garments.map((garment) => garment.photoId).filter(Boolean))) {
          const photo = tx.objectStore('photos').get(id);
          photo.onsuccess = () => {
            if (!(photo.result instanceof Blob)) {
              failure = new Error('일부 사진을 읽지 못했습니다. 기록을 덮어쓰지 않았습니다.');
              tx.abort();
              return;
            }
            result.photos.set(id, photo.result);
          };
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('옷장을 읽지 못했습니다.'));
    });
    // Blob values are immutable snapshots. Hash them after the transaction ends
    // so asynchronous validation cannot leave IndexedDB requests inactive.
    for (const [id, blob] of snapshot?.photos || []) {
      try {
        const checked = await photoAsset(blob);
        if (checked.id !== id) throw new Error('사진과 참조 정보가 다릅니다.');
      } catch (cause) {
        throw new Error('일부 사진을 읽지 못했습니다. 기록을 덮어쓰지 않았습니다.', { cause });
      }
    }
    observedEpoch = snapshot?.epoch || null;
    return snapshot;
  }

  async function commit(state, expectedRevision, assets = [], expectedEpoch = observedEpoch, { replacingNotes = false } = {}) {
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
      const records = tx.objectStore('records'),
        photos = tx.objectStore('photos');
      const request = records.get('current');
      let failure, revision, epoch;
      request.onsuccess = () => {
        const old = request.result;
        try {
          if (old !== undefined) validateEnvelope(old);
          if ((old?.revision || 0) !== expectedRevision || (old?.epoch || null) !== expectedEpoch) {
            failure = new Error('다른 화면에서 옷장이 바뀌었습니다. 최신 옷장을 불러온 뒤 다시 저장해 주세요.');
            failure.code = 'conflict';
            tx.abort();
            return;
          }
          // Compare with the CAS-checked persisted state inside the same
          // transaction, before any metadata or photo write can take place.
          validateJourneyGrowth(old?.state, next);
          if (!replacingNotes) validateNoteGrowth(old?.state, next);
          revision = (old?.revision || 0) + 1;
          epoch = old?.epoch || crypto.randomUUID();
          const needed = new Set(next.garments.map((garment) => garment.photoId).filter(Boolean));
          for (const asset of verified) {
            if (!needed.has(asset.id)) throw new Error('옷에 연결되지 않은 사진은 저장하지 않습니다.');
            photos.put(asset.blob, asset.id);
          }
          for (const id of needed) {
            const check = photos.get(id);
            check.onsuccess = () => {
              if (!(check.result instanceof Blob)) {
                failure = new Error('사진을 함께 저장하지 못했습니다. 다시 시도해 주세요.');
                tx.abort();
              }
            };
          }
          // Only confirmed removal/replacement can collect a photo, and only its last reference.
          for (const id of new Set((old?.state.garments || []).map((garment) => garment.photoId).filter(Boolean)))
            if (!needed.has(id)) photos.delete(id);
          records.put({ revision, epoch, state: next }, 'current');
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        observedEpoch = epoch;
        resolve(revision);
      };
      tx.onabort = () =>
        reject(failure || tx.error || new Error('저장하지 못했습니다. 용량을 확인하고 다시 시도해 주세요.'));
    });
  }

  async function recoveryState() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'photos'], 'readonly');
      const row = tx.objectStore('records').get('current'),
        exists = tx.objectStore('records').count('current');
      const count = tx.objectStore('photos').count();
      tx.oncomplete = () => {
        try {
          resolve({
            token: rawRecordToken(row.result, !!exists.result),
            photoCount: count.result,
            schema: row.result?.state?.schema ?? null,
          });
        } catch (error) {
          reject(error);
        }
      };
      tx.onabort = () => reject(tx.error || new Error('복구할 원문을 읽지 못했습니다.'));
    });
  }

  // A user-confirmed replacement preserves the raw source and every photo first.
  // Both preservation and replacement roll back if CAS or any write fails.
  async function recover(state, expected, assets = [], legacyRaw = null) {
    validateWardrobe(state);
    if (!expected || typeof expected.token !== 'string') throw new Error('복구할 자료를 먼저 확인해 주세요.');
    const next = structuredClone(state),
      verified = [],
      needed = new Set(next.garments.map((g) => g.photoId).filter(Boolean));
    for (const asset of assets) {
      const checked = await photoAsset(asset.blob);
      if (checked.id !== asset.id || !needed.has(checked.id)) throw new Error('백업 사진과 옷의 참조가 다릅니다.');
      verified.push(checked);
    }
    if (needed.size !== new Set(verified.map((a) => a.id)).size)
      throw new Error('복구할 백업에 필요한 사진이 빠져 있습니다.');
    const db = await open(),
      id = crypto.randomUUID(),
      epoch = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'photos'], 'readwrite');
      const records = tx.objectStore('records'),
        photos = tx.objectStore('photos');
      const row = records.get('current'),
        exists = records.count('current'),
        values = photos.getAll(),
        keys = photos.getAllKeys();
      let remaining = 4,
        failure,
        revision;
      for (const request of [row, exists, values, keys])
        request.onsuccess = () => {
          if (--remaining) return;
          try {
            if (rawRecordToken(row.result, !!exists.result) !== expected.token) {
              failure = new Error('다른 화면에서 복구할 자료가 바뀌었습니다. 백업을 다시 선택해 확인해 주세요.');
              failure.code = 'conflict';
              tx.abort();
              return;
            }
            revision =
              Number.isSafeInteger(row.result?.revision) &&
              row.result.revision >= 1 &&
              row.result.revision < Number.MAX_SAFE_INTEGER
                ? row.result.revision + 1
                : 1;
            const mapping = keys.result.map((sourceKey, index) => ({
              sourceKey,
              // Archived keys are never overwritten or collected by normal commits.
              // Refer to them directly instead of recursively copying older archives.
              snapshotKey:
                typeof sourceKey === 'string' && sourceKey.startsWith('recovery-photo:')
                  ? sourceKey
                  : `recovery-photo:${id}:${index}`,
            }));
            for (let index = 0; index < mapping.length; index++)
              if (mapping[index].snapshotKey !== mapping[index].sourceKey)
                photos.add(values.result[index], mapping[index].snapshotKey);
            records.add(
              {
                format: 'eoul-wardrobe-recovery-snapshot',
                version: 1,
                createdAt: new Date().toISOString(),
                source: { key: 'current', exists: !!exists.result, ...(exists.result ? { row: row.result } : {}) },
                legacyRaw,
                photos: mapping,
              },
              `recovery:${id}`,
            );
            // Keep original and prior recovery photos; no recovery performs garbage collection.
            for (const asset of verified) photos.put(asset.blob, asset.id);
            records.put({ revision, epoch, state: next }, 'current');
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
      tx.oncomplete = () => {
        observedEpoch = epoch;
        resolve({ revision, epoch, state: next, photos: new Map(verified.map((a) => [a.id, a.blob])) });
      };
      tx.onabort = () =>
        reject(
          failure ||
            tx.error ||
            new Error('원문과 사진을 보관하지 못했습니다. 복구하지 않고 기존 자료를 유지했습니다.'),
        );
    });
  }

  async function load(legacyRaw = null) {
    const existing = await read();
    if (existing) return existing;
    const initial = migrateLegacyWardrobe(legacyRaw);
    if (initial.garments.some((item) => item.photoMissing))
      throw new Error('이전 사진을 확인한 뒤 옷 기록을 가져와 주세요.');
    initial.legacyFingerprint = await legacyWardrobeFingerprint(legacyRaw);
    try {
      await commit(initial, 0);
    } catch (error) {
      if (error.code !== 'conflict') throw error;
    }
    return read();
  }

  async function backup() {
    const current = await read();
    if (!current) throw new Error('백업할 옷장이 없습니다.');
    return packBackup(
      { format: 'eoul-wardrobe-backup', version: 2, exportedAt: new Date().toISOString(), state: current.state },
      [...current.photos].map(([id, blob]) => ({ id, blob })),
    );
  }

  // Validation failures must never force a reset. Keep an export path for unknown JSON fields,
  // missing references and unreferenced photo blobs; normal restore refuses this diagnostic file.
  async function recoveryBackup(legacyRaw = null) {
    const db = await open();
    const snapshot = await new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'photos'], 'readonly');
      const records = tx.objectStore('records').getAll(),
        recordKeys = tx.objectStore('records').getAllKeys();
      const photos = tx.objectStore('photos').getAll(),
        photoKeys = tx.objectStore('photos').getAllKeys();
      tx.oncomplete = () =>
        resolve({
          records: records.result.map((value, index) => ({ key: recordKeys.result[index], value })),
          photos: photos.result.map((value, index) => ({ key: photoKeys.result[index], value })),
        });
      tx.onabort = () => reject(tx.error || new Error('저장 원문을 읽지 못했습니다. 원본은 변경하지 않았습니다.'));
    });
    return packBackup(
      {
        format: 'eoul-wardrobe-recovery',
        version: 2,
        exportedAt: new Date().toISOString(),
        legacyRaw,
        records: snapshot.records,
      },
      snapshot.photos.map((row) => ({
        id: row.key,
        ...(row.value instanceof Blob ? { blob: row.value } : { value: row.value }),
      })),
    );
  }

  // Revision and epoch only (no photos): a cheap check that this tab is not stale.
  async function peek() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['records'], 'readonly');
      const request = tx.objectStore('records').get('current');
      tx.oncomplete = () => resolve(request.result ? { revision: request.result.revision, epoch: request.result.epoch || null } : null);
      tx.onabort = () => reject(tx.error || new Error('옷장을 읽지 못했습니다.'));
    });
  }

  return {
    load,
    read,
    peek,
    commit,
    backup,
    recoveryState,
    recover,
    recoveryBackup,
    currentEpoch: () => observedEpoch,
    close() {
      connection?.close();
      connection = null;
    },
  };
}

async function parseLegacyWardrobeBackup(text) {
  if (text.length > 10000000) throw new Error('이전 JSON 백업이 너무 큽니다. 개발 지원으로 원본을 보존해 주세요.');
  const backup = JSON.parse(text);
  if (
    !backup ||
    backup.format !== 'eoul-wardrobe-backup' ||
    backup.version !== 1 ||
    Object.keys(backup).some((key) => !['format', 'version', 'exportedAt', 'state', 'photos'].includes(key))
  )
    throw new Error('지원하는 옷장 백업 파일이 아닙니다.');
  validateWardrobe(backup.state);
  if (!Array.isArray(backup.photos) || backup.photos.length > 200) throw new Error('백업 사진 목록을 읽지 못했습니다.');
  const refs = new Set(backup.state.garments.map((garment) => garment.photoId).filter(Boolean));
  const assets = [],
    ids = new Set();
  for (const value of backup.photos) {
    if (
      !value ||
      Object.keys(value).some((key) => !['id', 'type', 'base64'].includes(key)) ||
      !refs.has(value.id) ||
      ids.has(value.id) ||
      value.type !== 'image/jpeg' ||
      typeof value.base64 !== 'string' ||
      value.base64.length > Math.ceil(MAX_GARMENT_PHOTO_BYTES / 3) * 4
    )
      throw new Error('백업 사진 정보가 올바르지 않습니다.');
    const decoded = Uint8Array.from(atob(value.base64), (character) => character.charCodeAt(0));
    const asset = await photoAsset(new Blob([decoded], { type: value.type }));
    if (asset.id !== value.id) throw new Error('백업 사진이 변경되거나 손상됐습니다.');
    ids.add(asset.id);
    assets.push(asset);
  }
  if (refs.size !== ids.size) throw new Error('백업에 필요한 사진이 빠져 있습니다.');
  return { state: backup.state, assets };
}

export async function parseWardrobeBackup(file) {
  if (typeof file === 'string') return parseLegacyWardrobeBackup(file);
  if (!(file instanceof Blob) || file.size > MAX_BACKUP_FILE_BYTES)
    throw new Error('지원 크기를 넘거나 읽을 수 없는 백업 파일입니다.');
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (new TextDecoder().decode(header.subarray(0, 8)) !== BACKUP_MAGIC) {
    if (file.size > 10000000) throw new Error('이전 JSON 백업이 너무 큽니다. 개발 지원으로 원본을 보존해 주세요.');
    return parseLegacyWardrobeBackup(await file.text());
  }
  if (header.length !== 12) throw new Error('백업 파일의 머리 부분이 손상됐습니다.');
  const length = new DataView(header.buffer).getUint32(8, true);
  if (!length || length > MAX_BACKUP_MANIFEST_BYTES || file.size < 12 + length)
    throw new Error('백업 기록의 길이가 올바르지 않습니다.');
  const backup = JSON.parse(await file.slice(12, 12 + length).text());
  if (
    !backup ||
    backup.format !== 'eoul-wardrobe-backup' ||
    backup.version !== 2 ||
    Object.keys(backup).some((key) => !['format', 'version', 'exportedAt', 'state', 'photos'].includes(key))
  )
    throw new Error('지원하는 옷장 백업 파일이 아닙니다.');
  validateWardrobe(backup.state);
  if (!Array.isArray(backup.photos) || backup.photos.length > 200)
    throw new Error('백업 사진 목록이 올바르지 않습니다.');
  const refs = new Set(backup.state.garments.map((garment) => garment.photoId).filter(Boolean));
  const assets = [],
    ids = new Set();
  let offset = 0;
  for (const row of backup.photos) {
    if (
      !row ||
      Object.keys(row).some((key) => !['id', 'type', 'offset', 'bytes'].includes(key)) ||
      !refs.has(row.id) ||
      ids.has(row.id) ||
      row.type !== 'image/jpeg' ||
      row.offset !== offset ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 3 ||
      row.bytes > MAX_GARMENT_PHOTO_BYTES ||
      12 + length + offset + row.bytes > file.size
    )
      throw new Error('백업 사진의 구간 정보가 올바르지 않습니다.');
    const asset = await photoAsset(file.slice(12 + length + offset, 12 + length + offset + row.bytes, row.type));
    if (asset.id !== row.id) throw new Error('백업 사진이 변경되거나 손상됐습니다.');
    ids.add(asset.id);
    assets.push(asset);
    offset += row.bytes;
  }
  if (ids.size !== refs.size || 12 + length + offset !== file.size)
    throw new Error('백업 사진이 빠지거나 불필요한 내용이 포함돼 있습니다.');
  return { state: backup.state, assets };
}
