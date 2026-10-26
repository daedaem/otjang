// Comparison notes never commit an owned garment. One immutable snapshot per
// visible state keeps useSyncExternalStore stable; writes share the app lock.
export function createMeasureSession({
  core,
  storage,
  productId,
  clock = () => new Date().toISOString(),
}) {
  const initial = core.measurementInfo(productId),
    key = initial.key;
  let observed = null,
    pending = 0,
    queue = Promise.resolve();
  const listeners = new Set();
  const issue = (code, message) => Object.assign(new Error(message), { code });
  const read = () => {
    try {
      return core.readMeasurementDrafts(storage.getItem(key));
    } catch {
      throw issue(
        "measure_draft_unreadable",
        "실측 비교 초안을 읽지 못해 원문을 보호하고 있어요. 백업에서 보관해 주세요.",
      );
    }
  };
  const entry = (bag) =>
    Object.hasOwn(bag.entries, productId) ? bag.entries[productId] : null;
  const equal = (a, b) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  let state = {
    draft: core.measurementDraft(initial.product),
    blocked: "",
    notice: "",
    saving: false,
    persisted: true,
  };
  try {
    observed = entry(read());
    if (observed) {
      if (observed.kind !== initial.product.kind)
        throw issue(
          "measure_kind_changed",
          "상품 종류가 바뀌어 이전 비교 입력을 자동 적용하지 않았어요.",
        );
      state.draft = structuredClone(observed);
    }
  } catch (error) {
    state.blocked =
      error.message || "상품 종류가 바뀌어 원문을 보호하고 있어요.";
    state.notice = state.blocked;
  }
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const fn of [...listeners]) fn();
  };
  const session = {
    getSnapshot: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    change(edit) {
      if (state.blocked) return Promise.resolve();
      const draft = structuredClone(state.draft);
      edit(draft);
      draft.updatedAt = clock();
      try {
        core.readMeasurementDrafts(
          JSON.stringify({ v: 1, entries: { [productId]: draft } }),
        );
      } catch (error) {
        publish({ notice: error.message });
        return Promise.resolve();
      }
      publish({ draft, notice: "", saving: true, persisted: false });
      pending++;
      queue = queue
        .catch(() => {})
        .then(() =>
          core.withStorageLock(() => {
            core.assertPhotoReady();
            const bag = read();
            if (!equal(entry(bag), observed))
              throw issue(
                "measure_draft_changed",
                "다른 화면에서 이 비교 입력이 바뀌었어요. 현재 입력을 남겨 두고 최신 초안을 확인해 주세요.",
              );
            const raw = JSON.stringify({
              ...bag,
              entries: { ...bag.entries, [productId]: draft },
            });
            try {
              storage.setItem(key, raw);
              if (storage.getItem(key) !== raw) throw Error("verify");
            } catch {
              throw issue(
                "measure_draft_write_failed",
                "비교 입력을 보관하지 못했어요. 이 화면의 입력은 그대로예요.",
              );
            }
            observed = structuredClone(draft);
            publish({ notice: "", persisted: equal(state.draft, observed) });
          }),
        )
        .catch((error) => publish({ notice: error.message }))
        .finally(() => {
          pending--;
          publish({ saving: pending > 0 });
        });
      return queue;
    },
    flush: () => queue,
    retry: () => session.change(() => {}),
  };
  return session;
}
