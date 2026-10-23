// One host-owned input session is shared by the vanilla and React views.
// The persisted v1 draft remains compatible with the first React rollout.
(function (scope) {
  const KEY = 'eoul-d12-hang:input-draft:v1';
  const UNREADABLE = '이전에 쓰던 초안을 읽지 못했어요. 초안을 지우기 전까지 원문은 그대로 보관해요.';
  const WRITE_FAILED = '초안을 이 기기에 보관하지 못했어요. 이 화면을 닫으면 입력을 잃을 수 있어요.';
  const CLEAR_FAILED = '초안을 지우지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요.';
  const fresh = (initial) => ({ brand: '', name: '', kind: '', color: '', url: '', ...initial, draftId: scope.crypto.randomUUID() });
  const clean = (v) => ({ draftId: v.draftId, brand: v.brand, name: v.name, kind: v.kind, color: v.color, url: v.url, ...(v.source ? { source: { provider: 'opf', code: v.source.code } } : {}) });
  function read(storage) {
    try {
      const raw = storage.getItem(KEY);
      if (raw === null) return null;
      const x = JSON.parse(raw), v = x?.values;
      if (x.v !== 1 || !Number.isInteger(x.step) || x.step < 0 || x.step > 2 || !v ||
        typeof v.draftId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(v.draftId) ||
        !['brand', 'name', 'kind', 'color', 'url'].every(k => typeof v[k] === 'string' && v[k].length <= (k === 'url' ? 2000 : 80)) ||
        (v.source && (v.source.provider !== 'opf' || typeof v.source.code !== 'string' || !/^\d{6,24}$/.test(v.source.code))) ||
        typeof x.updatedAt !== 'string' || !Number.isFinite(Date.parse(x.updatedAt))) throw new Error();
      return { type: 'ready', value: { v: 1, values: clean(v), step: x.step, updatedAt: x.updatedAt } };
    } catch { return { type: 'blocked', message: UNREADABLE }; }
  }
  function create(storage) {
    let initial = {}, initialKey = '', active = false;
    let state = { values: fresh({}), step: 0, pending: null, notice: '' };
    const listeners = new Set();
    const publish = () => { state = { ...state }; for (const fn of listeners) fn(); };
    const assertWritable = () => { if (storage.getItem('eoul-backup:transaction') !== null) throw Object.assign(new Error('복원 복구를 먼저 진행해 주세요.'), { code: 'storage_recovery_pending' }); };
    const persist = () => {
      if (state.pending) return;
      try { assertWritable(); storage.setItem(KEY, JSON.stringify({ v: 1, values: clean(state.values), step: state.step, updatedAt: new Date().toISOString() })); state.notice = ''; }
      catch (error) { state.notice = error?.code === 'storage_recovery_pending' ? error.message : WRITE_FAILED; }
    };
    const controller = {
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      getSnapshot: () => state,
      get values() { return state.values; },
      enter(seed, step) {
        seed = seed ?? (active ? initial : {});
        const key = JSON.stringify(seed);
        if (!active || key !== initialKey) {
          initial = { ...seed }; initialKey = key; active = true;
          state = { values: fresh(seed), step: 0, pending: read(storage), notice: '' };
          if (!state.pending && (['brand', 'name', 'kind', 'color', 'url'].some(key => state.values[key]) || state.values.source)) persist();
        }
        if (!state.pending && Number.isInteger(step)) state.step = Math.max(0, Math.min(2, step));
        return state;
      },
      change(key, value) {
        if (state.pending) return;
        state.values[key] = value; persist(); publish();
      },
      changed() { persist(); publish(); },
      setStep(step) { if (!state.pending) { state.step = step; persist(); publish(); } },
      restore() {
        if (state.pending?.type !== 'ready') return 0;
        const stored = state.pending.value;
        state = { values: { ...stored.values }, step: stored.step, pending: null, notice: '' };
        persist(); publish(); return state.step;
      },
      restart() {
        try { assertWritable(); storage.removeItem(KEY); }
        catch (error) { state.notice = error?.code === 'storage_recovery_pending' ? error.message : CLEAR_FAILED; publish(); throw error; }
        state = { values: fresh(initial), step: 0, pending: null, notice: '' };
        persist(); publish(); return state;
      },
      finish() {
        // A completed registration does not keep an active in-memory input.
        active = false;
        try { assertWritable(); storage.removeItem(KEY); return undefined; }
        catch { return '옷은 저장했지만 초안을 정리하지 못했어요. 다시 열면 새로 입력을 선택해 주세요.'; }
      },
      reset() { active = false; },
    };
    return controller;
  }
  scope.EOUL_INPUT_STATE = { create, KEY };
})(typeof window === 'undefined' ? globalThis : window);
