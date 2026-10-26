// UI adapter only. The core owns all draft/profile parsing and the durable
// wardrobe command. Cooperating editors and photo restore share the same lock.
export function createProfileSession({
  core,
  storage,
  garmentId,
  key,
  clock = () => new Date().toISOString(),
}) {
  if (typeof key !== "string" || !key.startsWith("eoul-"))
    throw Error("편집 초안 위치를 확인해 주세요.");
  const listeners = new Set();
  let queue = Promise.resolve(),
    observed = null,
    lastError = null,
    pendingJobs = 0;
  const problem = (code, message, cause) =>
    Object.assign(new Error(message), { code, ...(cause ? { cause } : {}) });
  const find = () => {
    const g = core.getState().closet.find((g) => g.id === garmentId);
    if (!g || g.trial) throw Error("실제 보유한 옷을 골라 주세요.");
    return g;
  };
  const read = () => {
    try {
      return core.readProfileDrafts(storage.getItem(key));
    } catch (error) {
      throw problem(
        "profile_draft_unreadable",
        "옷 정보 초안을 읽지 못해 원문을 보호하고 있어요. 백업에서 원문을 보관해 주세요.",
        error,
      );
    }
  };
  const entry = (bag) =>
    Object.hasOwn(bag.edits, garmentId) ? bag.edits[garmentId] : null;
  const equal = (a, b) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const freeze = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const item of Object.values(value)) freeze(item);
      Object.freeze(value);
    }
    return value;
  };
  let state = {
    draft: core.profileEditDraft(find(), clock()),
    pending: null,
    blocked: "",
    notice: "",
    saving: false,
    committing: false,
    persisted: true,
    dirty: false,
    needsCleanup: false,
  };
  try {
    observed = entry(read());
    if (observed) state.pending = structuredClone(observed);
  } catch (error) {
    state.blocked = error.message;
    state.notice = error.message;
    lastError = error;
  }
  state = freeze(state);
  const publish = (patch) => {
    state = freeze({ ...state, ...patch });
    for (const listener of [...listeners]) listener();
  };
  const lock = (work) =>
    core.withStorageLock(() => {
      core.assertPhotoReady();
      return work();
    });
  const compare = (bag) => {
    if (!equal(entry(bag), observed))
      throw problem(
        "profile_draft_changed",
        "다른 화면에서 이 초안이 바뀌었어요. 입력은 남겨 두고 최신 초안을 확인해 주세요.",
      );
  };
  const write = (bag) => {
    const raw = JSON.stringify(bag);
    core.readProfileDrafts(raw);
    try {
      storage.setItem(key, raw);
      if (storage.getItem(key) !== raw) throw Error("verification");
    } catch (error) {
      throw problem(
        "profile_draft_write_failed",
        "초안을 저장하지 못했어요. 입력은 이 화면에 남아 있어요. 다시 저장하거나 옷 정보 저장을 눌러 주세요.",
        error,
      );
    }
  };
  const remove = () => {
    const bag = read();
    compare(bag);
    const next = { ...bag, edits: { ...bag.edits } };
    delete next.edits[garmentId];
    if (Object.keys(next.edits).length) write(next);
    else {
      try {
        storage.removeItem(key);
        if (storage.getItem(key) !== null) throw Error("verification");
      } catch (error) {
        throw problem(
          "profile_draft_write_failed",
          "편집 초안 정리를 확인하지 못했어요.",
          error,
        );
      }
    }
    observed = null;
  };
  const fatal = () =>
    lastError &&
    ["profile_draft_changed", "profile_draft_unreadable"].includes(
      lastError.code,
    );
  const session = {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    restore() {
      if (state.blocked) throw lastError;
      if (!state.pending) return;
      publish({
        draft: structuredClone(state.pending),
        pending: null,
        dirty: true,
        notice: "저장해 둔 편집을 이어 쓰고 있어요.",
      });
    },
    change(change) {
      if (state.committing) return Promise.resolve();
      if (state.blocked || state.pending) {
        publish({
          notice:
            state.blocked || "저장된 편집을 이어 쓰거나 새로 시작해 주세요.",
        });
        return Promise.resolve();
      }
      const draft = structuredClone(state.draft);
      change(draft.form);
      draft.updatedAt = clock();
      try {
        core.readProfileDrafts(
          JSON.stringify({ v: 1, edits: { [garmentId]: draft } }),
        );
      } catch (error) {
        publish({ notice: error.message });
        return Promise.resolve();
      }
      publish({
        draft,
        dirty: true,
        persisted: false,
        needsCleanup: false,
        saving: true,
        notice: "",
      });
      pendingJobs++;
      queue = queue
        .catch(() => {})
        .then(() =>
          lock(() => {
            const bag = read();
            compare(bag);
            write({ ...bag, edits: { ...bag.edits, [garmentId]: draft } });
            observed = structuredClone(draft);
            lastError = null;
            publish({ persisted: equal(state.draft, observed), notice: "" });
          }),
        )
        .catch((error) => {
          lastError = error;
          publish({ notice: error.message });
        })
        .finally(() => {
          pendingJobs--;
          publish({ saving: pendingJobs > 0 });
        });
      return queue;
    },
    flush: () => queue,
    async retryDraft() {
      return session.change(() => {});
    },
    async restart() {
      if (state.committing)
        throw problem("profile_saving", "옷 정보를 처리하는 중이에요.");
      publish({ committing: true });
      try {
        await queue;
        if (state.blocked) throw lastError;
        await lock(() => {
          const next = core.profileEditDraft(find(), clock());
          remove();
          lastError = null;
          publish({
            draft: next,
            pending: null,
            notice: "",
            persisted: true,
            dirty: false,
            needsCleanup: false,
          });
        });
      } finally {
        publish({ committing: false });
      }
    },
    async save() {
      if (state.committing)
        throw problem("profile_saving", "옷 정보를 저장하는 중이에요.");
      publish({ committing: true });
      try {
        await queue;
        if (state.blocked || fatal()) throw lastError;
        if (state.pending)
          throw problem(
            "profile_resume_required",
            "저장된 편집을 먼저 확인해 주세요.",
          );
        publish({ saving: true, notice: "" });
        try {
          return await lock(() => {
            // If the draft failed only because of quota, the explicit wardrobe save may
            // still succeed. A newer/future draft is never bypassed this way.
            const current = read();
            compare(current);
            const garment = core.applyProfileEdit(structuredClone(state.draft));
            let warning = "";
            try {
              remove();
              lastError = null;
            } catch (error) {
              lastError = error;
              warning =
                "옷 정보는 저장됐지만 초안 정리가 끝나지 않았어요. 다시 저장을 눌러 정리할 수 있어요.";
            }
            if (warning)
              publish({
                draft: {
                  ...structuredClone(state.draft),
                  baseProfile: structuredClone(garment.profile || null),
                },
                dirty: false,
                needsCleanup: true,
                notice: warning,
              });
            else
              publish({
                draft: core.profileEditDraft(garment, clock()),
                pending: null,
                persisted: true,
                dirty: false,
                needsCleanup: false,
                notice: "옷 정보를 저장했어요.",
              });
            return { garment, warning };
          });
        } catch (error) {
          publish({ notice: error.message });
          throw error;
        } finally {
          publish({ saving: false });
        }
      } finally {
        publish({ committing: false });
      }
    },
  };
  return session;
}
