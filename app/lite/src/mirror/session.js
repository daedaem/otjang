// Body coordinates form one document: never merge points from different photos.
export function createMirrorSession({
  core,
  storage,
  photos,
  clock = () => new Date().toISOString(),
}) {
  const key = core.mirrorDraftKey,
    listeners = new Set();
  let observed = core.newMirrorDraft(),
    attempted = null,
    queue = Promise.resolve(),
    uploadTask = null,
    count = 0,
    holds = 0;
  let state = {
    draft: structuredClone(observed),
    blocked: "",
    notice: "",
    persisted: true,
    saving: false,
    uploading: false,
  };
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  const equal = (a, b) =>
    JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const read = () => {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
      throw Error(
        "거울 기록을 읽지 못했어요. 현재 입력과 원본은 그대로 두고 다시 확인해 주세요.",
      );
    }
    return core.readMirrorDraft(raw);
  };
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const fn of [...listeners]) fn();
  };
  try {
    observed = read();
    state.draft = structuredClone(observed);
  } catch (e) {
    state.blocked = state.notice = e.message;
  }
  const currentMatches = (current) =>
    equal(current, observed) || (attempted && equal(current, attempted));
  const conflict = () =>
    Error(
      "다른 화면에서 거울이 바뀌었어요. 이 화면의 입력은 남겨 두고 최신 기록을 확인해 주세요.",
    );
  function commit(target) {
    core.assertPhotoReady();
    const current = read();
    if (!equal(current, target) && !currentMatches(current)) throw conflict();
    if (!equal(current, target)) {
      const raw = JSON.stringify(target);
      attempted = structuredClone(target);
      try {
        storage.setItem(key, raw);
        if (storage.getItem(key) !== raw) throw Error("verify");
      } catch {
        throw Error(
          "거울 입력을 보관하지 못했어요. 현재 입력은 이 화면에 남아 있어요.",
        );
      }
    }
    observed = structuredClone(target);
    attempted = null;
    const persisted = equal(state.draft, target);
    publish({ persisted, notice: persisted ? "" : state.notice });
  }
  function enqueue(target) {
    count++;
    publish({ saving: true });
    queue = queue
      .catch(() => {})
      .then(() => core.withStorageLock(() => commit(target)))
      .catch((e) => {
        publish({
          notice:
            e.message === "verify"
              ? "거울 입력을 보관하지 못했어요. 현재 입력은 이 화면에 남아 있어요."
              : e.message,
          persisted: false,
        });
      })
      .finally(() => {
        count--;
        publish({ saving: count > 0 });
      });
    return queue;
  }
  function change(edit) {
    if (state.blocked || state.uploading) return Promise.resolve(false);
    let next;
    try {
      next = core.readMirrorDraft(
        JSON.stringify(
          typeof edit === "function"
            ? edit(structuredClone(state.draft))
            : { ...state.draft, ...edit },
        ),
      );
    } catch (e) {
      publish({ notice: e.message });
      return Promise.resolve(false);
    }
    if (equal(next, state.draft)) return Promise.resolve(state.persisted);
    next.updatedAt = clock();
    publish({ draft: next, persisted: false, notice: "" });
    return enqueue(structuredClone(next));
  }
  function upload(file) {
    if (state.blocked || state.uploading) return Promise.resolve(false);
    if (core.boot?.preview) {
      publish({
        notice: "체험 화면에서는 개인 사진을 읽거나 저장하지 않아요.",
      });
      return Promise.resolve(false);
    }
    publish({ uploading: true });
    let savedOriginal = false;
    uploadTask = (async () => {
      await queue;
      if (!state.persisted)
        throw Error("현재 거울 입력을 먼저 다시 보관해 주세요.");
      core.assertPhotoReady();
      const mod = await photos(),
        record = await mod.prepareBodyPhoto(file),
        repo = await mod.photoLibrary();
      return repo.withLock(async () => {
        core.assertPhotoReady();
        if (!currentMatches(read())) throw conflict();
        await repo.put(record);
        savedOriginal = true;
        const body = {
          photoId: record.id,
          width: record.width,
          height: record.height,
        };
        const changed = !equal(body, state.draft.body);
        const next = core.readMirrorDraft(
          JSON.stringify({
            ...state.draft,
            body,
            ...(changed
              ? {
                  head: null,
                  feet: null,
                  layers: state.draft.layers.map((l) => ({
                    ...l,
                    dx: 0,
                    dy: 0,
                  })),
                }
              : {}),
            updatedAt: clock(),
          }),
        );
        // Original is now durable. Keep the desired link in RAM even on conflict,
        // quota failure or interrupted recovery; originals are never deleted.
        publish({ draft: next, persisted: false });
        core.assertPhotoReady();
        commit(next);
        return true;
      });
    })()
      .catch((e) => {
        publish({
          notice:
            (savedOriginal
              ? "전신 사진 원본은 보관했지만 연결을 마치지 못했어요. "
              : "") +
            (e.message ||
              "전신 사진을 보관하지 못했어요. 앞선 사진은 그대로예요."),
        });
        return false;
      })
      .finally(() => publish({ uploading: false }));
    return uploadTask;
  }
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot: () => state,
    change,
    upload,
    hold() {
      holds++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          holds--;
        }
      };
    },
    async flush() {
      if (uploadTask) await uploadTask;
      await queue;
      return state.persisted;
    },
    retry() {
      if (state.blocked || state.uploading) return Promise.resolve(false);
      return enqueue(structuredClone(state.draft));
    },
    sync() {
      if (holds || state.uploading || count || !state.persisted) return;
      try {
        observed = read();
        attempted = null;
        publish({ draft: structuredClone(observed), notice: "", blocked: "" });
      } catch (e) {
        publish({ blocked: e.message, notice: e.message });
      }
    },
  };
}
