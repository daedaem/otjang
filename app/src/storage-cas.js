/* Commit the whole local snapshot only while both persisted copies still match
 * the caller's last acknowledged raw values. Revision counters alone cannot
 * distinguish two legacy snapshots with the same counter (or no counter).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StorageCas = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const raw = (value) => value === undefined ? null : value;
  const baseline = (value) => value === null || typeof value === 'string';

  function readLocal(storage, key) {
    try { return { readable: true, value: raw(storage.getItem(key)) }; }
    catch (e) { return { readable: false, value: undefined }; }
  }

  // A failed transaction must finish aborting before fallback starts. Resolving
  // at the request's error event could otherwise race an in-flight transaction.
  function compareIdb(options, write) {
    return new Promise((resolve) => {
      let tx, checked = false, validated = false, conflict = false, reason = 'idb_unavailable';
      let idbValue, lsValue;
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        resolve({ ok, validated, conflict, reason: ok ? '' : reason, idbValue: ok && write ? options.data : idbValue, lsValue });
      };
      const abort = () => { try { tx.abort(); } catch (e) { finish(false); } };
      try {
        tx = options.db.transaction('kv', write ? 'readwrite' : 'readonly');
        tx.oncomplete = () => finish(checked && !conflict && reason === '');
        tx.onabort = () => { if (!conflict && !reason) reason = 'idb_unavailable'; finish(false); };
        tx.onerror = () => { if (!conflict) reason = 'idb_unavailable'; };
        const object = tx.objectStore('kv'), request = object.get(options.idbKey);
        request.onerror = () => abort();
        request.onsuccess = () => {
          try {
            checked = true;
            idbValue = raw(request.result);
            const local = readLocal(options.localStorage, options.lsKey);
            lsValue = local.value;
            if (!local.readable) { reason = 'local_storage_unavailable'; abort(); return; }
            if (idbValue !== options.expectedIdb || lsValue !== options.expectedLs) {
              conflict = true; reason = 'snapshot_changed'; abort(); return;
            }
            validated = true;
            reason = '';
            if (write) {
              const put = object.put(options.data, options.idbKey);
              if (put) put.onerror = () => { reason = 'idb_unavailable'; abort(); };
            }
          } catch (e) { reason = 'idb_unavailable'; abort(); }
        };
      } catch (e) { if (tx) abort(); else finish(false); }
    });
  }

  /**
   * The caller serializes its saves and supplies the baseline for this key at
   * execution time. Only an ok result acknowledges a new baseline. Undefined
   * metadata means that store could not be read; retain its previous baseline.
   * All writers for a key must use this helper's Web Lock where available.
   */
  async function commitSnapshot(options) {
    const opts = options || {}, mode = opts.mode;
    const failed = (reason, conflict, values) => ({ ok: false, conflict: !!conflict, mode, idbValue: opts.expectedIdb, lsValue: opts.expectedLs, reason, ...values });
    if (!['idb', 'ls', 'memory'].includes(mode) || typeof opts.idbKey !== 'string' || !opts.idbKey || typeof opts.lsKey !== 'string' || !opts.lsKey || typeof opts.data !== 'string' || !baseline(opts.expectedIdb) || !baseline(opts.expectedLs)) return failed('invalid_arguments');
    if (mode === 'memory') return failed('memory_only');

    const commit = async (locked) => {
      let local = readLocal(opts.localStorage, opts.lsKey), idbValue;
      if (!local.readable) return failed('local_storage_unavailable', false, { lsValue: undefined });
      if (local.value !== opts.expectedLs) return failed('snapshot_changed', true, { lsValue: local.value });
      if (mode === 'ls' && !locked) return failed('fallback_requires_lock');
      if (opts.db) {
        const result = await compareIdb(opts, mode === 'idb');
        idbValue = result.idbValue;
        if (result.conflict) return failed(result.reason, true, { idbValue, lsValue: result.lsValue });
        if (result.ok && mode === 'idb') return { ok: true, conflict: false, mode: 'idb', idbValue: result.idbValue, lsValue: result.lsValue, reason: '' };
        // An inaccessible fallback store cannot safely be treated as empty.
        if (result.reason === 'local_storage_unavailable') return failed(result.reason, false, { idbValue, lsValue: undefined });
        // A read error is not evidence of an unchanged IDB snapshot. Writing a
        // newer fallback copy now could hide another tab's unobserved edit.
        if (!result.validated) return failed('idb_unverified', false, { idbValue, lsValue: result.lsValue });
      }
      if (!locked) return failed('fallback_requires_lock', false, { idbValue });

      // Locks serialize localStorage's otherwise non-atomic get/set pair. Check
      // again after an IDB abort, then verify the value actually persisted.
      local = readLocal(opts.localStorage, opts.lsKey);
      if (!local.readable) return failed('local_storage_unavailable', false, { idbValue, lsValue: undefined });
      if (local.value !== opts.expectedLs) return failed('snapshot_changed', true, { idbValue, lsValue: local.value });
      try { opts.localStorage.setItem(opts.lsKey, opts.data); } catch (e) { /* Readback determines whether anything persisted. */ }
      local = readLocal(opts.localStorage, opts.lsKey);
      if (!local.readable) return failed('local_storage_unavailable', false, { idbValue, lsValue: undefined });
      if (local.value === opts.data) return { ok: true, conflict: false, mode: 'ls', idbValue, lsValue: local.value, reason: '' };
      return failed(local.value === opts.expectedLs ? 'local_storage_unavailable' : 'snapshot_changed', local.value !== opts.expectedLs, { idbValue, lsValue: local.value });
    };

    if (opts.locks && typeof opts.locks.request === 'function') {
      try { return await opts.locks.request('otjang-store:' + opts.idbKey, () => commit(true)); }
      catch (e) { return failed('lock_unavailable'); }
    }
    return commit(false);
  }

  return { commitSnapshot };
});
