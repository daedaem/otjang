// Entry-level compare-and-swap under the shared app lock. A failed write keeps
// its desired value in RAM; other products and unrelated goals are merged.
export function createCollectionSession({
  core,
  storage,
  clock = () => new Date().toISOString(),
}) {
  const collectionSeriesKey = (s) => core.collectionSeriesKey(s);
  const key = core.collectionKey,
    listeners = new Set(),
    desired = new Map(),
    baselines = new Map(),
    errors = new Map();
  let observed = { v: 1, candidates: {}, goals: [] },
    queue = Promise.resolve(),
    pending = 0;
  let state = {
    bag: structuredClone(observed),
    blocked: "",
    notice: "",
    saving: false,
    persisted: true,
  };
  const read = () => core.readCollectionSettings(storage.getItem(key));
  try {
    observed = read();
    state.bag = structuredClone(observed);
  } catch (e) {
    state.blocked = e.message;
    state.notice = e.message;
  }
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const fn of [...listeners]) fn();
  };
  const equal = (a, b) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const select = (bag, t) =>
    t.kind === "candidate"
      ? (bag.candidates[t.id] ?? null)
      : (bag.goals.find((g) => collectionSeriesKey(g.series) === t.id) ?? null);
  const merge = (bag, t) => {
    const next = structuredClone(bag);
    if (t.kind === "candidate") {
      if (t.value === null) delete next.candidates[t.id];
      else next.candidates[t.id] = structuredClone(t.value);
    } else {
      const index = next.goals.findIndex(
        (g) => collectionSeriesKey(g.series) === t.id,
      );
      if (t.value === null) {
        if (index !== -1) next.goals.splice(index, 1);
      } else if (index === -1) next.goals.push(structuredClone(t.value));
      else next.goals[index] = structuredClone(t.value);
    }
    return next;
  };
  const targetKey = (t) => t.kind + ":" + t.id;
  const enqueue = (t) => {
    pending++;
    publish({ saving: true });
    queue = queue
      .catch(() => {})
      .then(() =>
        core.withStorageLock(() => {
          core.assertPhotoReady();
          const current = read();
          const alreadySaved = equal(select(current, t), t.value);
          if (
            !alreadySaved &&
            !equal(select(current, t), baselines.get(targetKey(t)))
          )
            throw Error(
              "다른 화면에서 이 목적이나 목표가 바뀌었어요. 현재 입력을 남겨 두고 최신 기록을 확인해 주세요.",
            );
          const next = alreadySaved ? current : merge(current, t),
            raw = JSON.stringify(next);
          core.readCollectionSettings(raw);
          if (!alreadySaved)
            try {
              storage.setItem(key, raw);
              if (storage.getItem(key) !== raw) throw Error("verify");
            } catch {
              throw Error(
                "소장 입력을 보관하지 못했어요. 이 화면의 입력은 그대로예요.",
              );
            }
          observed = next;
          if (equal(desired.get(targetKey(t))?.value, t.value)) {
            desired.delete(targetKey(t));
            baselines.delete(targetKey(t));
          } else baselines.set(targetKey(t), structuredClone(t.value));
          errors.delete(targetKey(t));
          let bag = structuredClone(observed);
          for (const edit of desired.values()) bag = merge(bag, edit);
          publish({
            bag,
            notice: [...errors.values()].at(-1) || "",
            persisted: desired.size === 0,
          });
        }),
      )
      .catch((e) => {
        errors.set(targetKey(t), e.message);
        publish({ notice: e.message, persisted: desired.size === 0 });
      })
      .finally(() => {
        pending--;
        publish({ saving: pending > 0 });
      });
    return queue;
  };
  const edit = (t) => {
    if (state.blocked) return Promise.resolve();
    if (t.kind === "candidate" && !/^ms-\d+$/.test(t.id)) {
      publish({ notice: "상품을 다시 골라 주세요." });
      return Promise.resolve();
    }
    const bag = merge(state.bag, t);
    try {
      core.readCollectionSettings(JSON.stringify(bag));
    } catch (e) {
      publish({ notice: e.message });
      return Promise.resolve();
    }
    desired.set(targetKey(t), structuredClone(t));
    if (!baselines.has(targetKey(t)))
      baselines.set(targetKey(t), structuredClone(select(observed, t)));
    publish({ bag, notice: "", persisted: false });
    return enqueue(t);
  };
  return {
    getSnapshot: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    flush: () => queue,
    saveCandidate(id, value) {
      return edit({
        kind: "candidate",
        id,
        value: { ...value, updatedAt: value.updatedAt || clock() },
      });
    },
    saveGoal(series, target) {
      return edit({
        kind: "goal",
        id: collectionSeriesKey(series.trim()),
        value: { series: series.trim(), target },
      });
    },
    removeGoal(series) {
      return edit({
        kind: "goal",
        id: collectionSeriesKey(series),
        value: null,
      });
    },
    retry() {
      for (const t of [...desired.values()]) enqueue(t);
      return queue;
    },
  };
}
