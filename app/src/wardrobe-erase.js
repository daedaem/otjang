// Call only after showing this scope, confirming twice, stopping saves and closing
// this tab's store connections. Other wardrobe tabs must be closed by the user.
// Transactions are atomic within one database; this entire operation is not.
export const WARDROBE_ERASE_SCOPE = Object.freeze({
  databases: Object.freeze(['eoul-wardrobe-v2', 'eoul']),
  localStorageKeys: Object.freeze(['eoul:v1', 'eoul:v2', 'eoul:v2:unreadable']),
});

const DATABASE_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 5000;
const finished = (entry) => entry.status === 'cleared' || entry.status === 'absent' || entry.status === 'removed';

function failure(code, status, phase, reason, cause) {
  return { code, status, phase, reason, cause };
}

function clearDatabase(indexedDB, name, timeoutMs) {
  return new Promise((resolve, reject) => {
    let request,
      db,
      tx,
      settled = false,
      missing = false,
      blocked = false,
      transactionFailure;
    const close = () => {
      try {
        db?.close();
      } catch {
        /* Already closed. */
      }
    };
    const finish = (outcome, failed = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      close();
      if (failed) reject(outcome);
      else resolve(outcome);
    };
    const timer = setTimeout(() => {
      // An IDB open cannot be cancelled. Its late success closes the connection;
      // its late upgrade is aborted. Clear transactions can be aborted. Never
      // start deleteDatabase: a blocked deletion could run after reporting failure.
      try {
        tx?.abort();
      } catch {
        /* Completion might already be queued. */
      }
      finish(
        failure(
          blocked ? 'blocked' : 'timeout',
          'uncertain',
          blocked ? 'blocked' : tx ? 'clearing' : 'opening',
          blocked
            ? '다른 옷장 탭 때문에 제한 시간 안에 저장소에 접근하지 못했습니다.'
            : '저장소 작업의 완료를 제한 시간 안에 확인하지 못했습니다.',
        ),
        true,
      );
    }, timeoutMs);

    try {
      request = indexedDB.open(name, DATABASE_VERSION);
    } catch (cause) {
      finish(failure('open-failed', 'retained', 'opening', '저장소를 열지 못해 삭제하지 않았습니다.', cause), true);
      return;
    }

    request.onblocked = () => {
      blocked = true;
    };
    request.onupgradeneeded = () => {
      // Opening a missing DB would create an empty DB. Abort instead, including
      // upgrades arriving after the timeout; no empty legacy DB is left behind.
      missing = true;
      db = request.result;
      try {
        request.transaction.abort();
      } catch (cause) {
        finish(
          failure('open-failed', 'uncertain', 'opening', '빈 저장소 생성 취소 여부를 확인하지 못했습니다.', cause),
          true,
        );
      }
    };
    request.onerror = () => {
      if (settled) return;
      if (missing && request.error?.name === 'AbortError') {
        finish({ status: 'absent', phase: 'complete', reason: '저장소가 없어 삭제할 자료가 없습니다.' });
        return;
      }
      const higherVersion = request.error?.name === 'VersionError';
      finish(
        failure(
          higherVersion ? 'higher-version' : 'open-failed',
          'retained',
          'opening',
          higherVersion ? '더 최신 버전의 저장소라서 원본을 보존했습니다.' : '저장소를 열지 못해 삭제하지 않았습니다.',
          request.error,
        ),
        true,
      );
    };
    request.onsuccess = () => {
      db = request.result;
      if (settled) {
        close();
        return;
      }
      db.onversionchange = () => {
        try {
          tx?.abort();
        } catch {
          /* The exact completion state is uncertain. */
        }
        finish(
          failure(
            'version-change',
            'uncertain',
            tx ? 'clearing' : 'opening',
            '다른 탭에서 저장소 버전이 바뀌어 삭제 완료를 확인하지 못했습니다.',
          ),
          true,
        );
      };
      const stores = [...db.objectStoreNames];
      if (!stores.length) {
        finish({ status: 'cleared', phase: 'complete', reason: '저장소에 보관된 자료가 없습니다.' });
        return;
      }
      try {
        tx = db.transaction(stores, 'readwrite');
        tx.oncomplete = () =>
          finish({ status: 'cleared', phase: 'complete', reason: '기록·사진·저장 원문을 모두 삭제했습니다.' });
        tx.onabort = () =>
          finish(
            failure(
              'transaction-failed',
              'retained',
              'clearing',
              '삭제 작업이 취소되어 이 저장소의 자료는 보존됐습니다.',
              transactionFailure || tx.error,
            ),
            true,
          );
        for (const store of stores) tx.objectStore(store).clear();
      } catch (cause) {
        if (!tx) {
          finish(
            failure(
              'transaction-failed',
              'retained',
              'clearing',
              '삭제 작업을 시작하지 못해 이 저장소의 자료는 보존됐습니다.',
              cause,
            ),
            true,
          );
          return;
        }
        transactionFailure = cause;
        try {
          tx.abort();
        } catch {
          finish(
            failure('transaction-failed', 'uncertain', 'clearing', '삭제 작업 취소 여부를 확인하지 못했습니다.', cause),
            true,
          );
        }
      }
    };
  });
}

function eraseError(result, cause) {
  result.ok = false;
  const entries = [...result.databases, ...result.localStorageEntries];
  result.mayRemain = entries.filter((entry) => !finished(entry)).map((entry) => entry.name || entry.key);
  result.uncertain = entries.filter((entry) => entry.status === 'uncertain').map((entry) => entry.name || entry.key);
  const done = entries.filter(finished).map((entry) => entry.name || entry.key);
  const message = result.mayRemain.length
    ? `전체 삭제를 완료하지 못했습니다. ${done.length ? `삭제 완료 또는 자료 없음: ${done.join(', ')}. ` : ''}남아 있거나 삭제 여부를 확인하지 못한 범위: ${result.mayRemain.join(', ')}. 다른 옷장 탭을 모두 닫은 뒤 다시 시도해 주세요.`
    : '각 저장 범위는 삭제된 상태로 확인됐지만 삭제 작업 중 오류가 발생했습니다. 완료 상태를 다시 확인해 주세요.';
  const error = new Error(message, { cause });
  error.name = 'WardrobeEraseError';
  error.code = entries.find((entry) => entry.code)?.code || 'erase-failed';
  // A detached snapshot cannot later turn into success when a delayed IDB event
  // arrives. It contains only scope/status metadata, never customer record values.
  error.result = structuredClone(result);
  return error;
}

export async function eraseWardrobeData(options = {}) {
  const localStorageEntries = WARDROBE_ERASE_SCOPE.localStorageKeys.map((key) => ({
    key,
    status: 'not-started',
    phase: 'not-started',
  }));
  const result = {
    ok: false,
    databases: WARDROBE_ERASE_SCOPE.databases.map((name) => ({ name, status: 'not-started', phase: 'not-started' })),
    localStorageEntries,
    // Compatibility alias; all scope reporting must use localStorageEntries.
    localStorage: localStorageEntries[0],
    mayRemain: [],
    uncertain: [],
  };
  let indexedDB, localStorage, timeoutMs, inspectedEntry;
  try {
    indexedDB = Object.hasOwn(options, 'indexedDB') ? options.indexedDB : globalThis.indexedDB;
    localStorage = Object.hasOwn(options, 'localStorage') ? options.localStorage : globalThis.localStorage;
    timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('삭제 확인 제한 시간이 올바르지 않습니다.');
    if (!indexedDB?.open || !localStorage?.getItem || !localStorage?.removeItem)
      throw new Error('브라우저 저장소에 접근할 수 없습니다.');
    // Check every allowed source before any database mutation. A source that
    // cannot be inspected must not be silently left behind by a success result.
    for (const entry of localStorageEntries) {
      inspectedEntry = entry;
      entry.status = localStorage.getItem(entry.key) === null ? 'absent' : 'retained';
    }
  } catch (cause) {
    Object.assign(inspectedEntry || localStorageEntries[0], {
      status: 'uncertain',
      code: 'unavailable',
      reason: '브라우저 저장소에 접근하지 못했습니다.',
    });
    throw eraseError(result, cause);
  }

  for (const entry of result.databases) {
    try {
      Object.assign(entry, await clearDatabase(indexedDB, entry.name, timeoutMs));
    } catch ({ cause, ...outcome }) {
      Object.assign(entry, outcome);
      throw eraseError(result, cause);
    }
  }

  // Keep every migration/raw-recovery source until BOTH DB transactions finish.
  // Removal is sequential so a partial failure can report each exact key.
  for (const entry of localStorageEntries) {
    try {
      localStorage.removeItem(entry.key);
      if (localStorage.getItem(entry.key) !== null) throw new Error('이전 기록 키의 삭제가 반영되지 않았습니다.');
      Object.assign(entry, { status: 'removed', phase: 'complete', reason: '이전 기록 키를 삭제했습니다.' });
    } catch (cause) {
      let status = 'uncertain';
      try {
        status = localStorage.getItem(entry.key) === null ? 'removed' : 'retained';
      } catch {
        /* Access itself may have failed. */
      }
      Object.assign(entry, {
        status,
        phase: 'removing',
        code: 'storage-failed',
        reason: '이전 기록 키의 삭제 완료를 확인하지 못했습니다.',
      });
      throw eraseError(result, cause);
    }
  }
  result.ok = true;
  return result;
}
