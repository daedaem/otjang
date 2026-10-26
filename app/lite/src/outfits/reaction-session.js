// Each pending reaction retains its own original baseline. Other successful
// writes can merge history, but cannot authorize overwriting that baseline.
export function createReactionSession({ core, storage }) {
  const key = core.outfitReactionsKey,
    listeners = new Set(),
    desired = new Map(),
    baselines = new Map(),
    errors = new Map();
  let observed = { v: 1, reactions: [] },
    queue = Promise.resolve(),
    pending = 0;
  let state = {
    bag: structuredClone(observed),
    blocked: "",
    notice: "",
    persisted: true,
    saving: false,
  };
  const read = () => {
    try {
      return core.readOutfitReactions(storage.getItem(key));
    } catch {
      throw Error(
        "코디 반응을 읽지 못해 원문을 보호하고 있어요. 백업에서 보관해 주세요.",
      );
    }
  };
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
  const stable = (x) =>
    Array.isArray(x)
      ? x.map(stable)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, stable(x[k])]),
          )
        : x;
  const equal = (a, b) =>
    JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));
  const find = (bag, id) => bag.reactions.find((r) => r.id === id) ?? null;
  const merge = (bag, reaction) => {
    const next = structuredClone(bag),
      index = next.reactions.findIndex((r) => r.id === reaction.id);
    if (index === -1) next.reactions.push(structuredClone(reaction));
    else next.reactions[index] = structuredClone(reaction);
    return next;
  };
  const sameTarget = (a, b) =>
    a.occasion === b.occasion &&
    JSON.stringify([...a.garmentIds].sort()) ===
      JSON.stringify([...b.garmentIds].sort());
  const visible = () => {
    let bag = structuredClone(observed);
    for (const edit of desired.values()) bag = merge(bag, edit);
    return bag;
  };
  const enqueue = (reaction) => {
    pending++;
    publish({ saving: true });
    queue = queue
      .catch(() => {})
      .then(() =>
        core.withStorageLock(() => {
          core.assertPhotoReady();
          const current = read(),
            alreadySaved = equal(find(current, reaction.id), reaction);
          if (
            !alreadySaved &&
            !equal(find(current, reaction.id), baselines.get(reaction.id))
          )
            throw Error(
              "다른 화면에서 이 반응이 바뀌었어요. 현재 선택을 남겨 두고 최신 기록을 확인해 주세요.",
            );
          const next = alreadySaved ? current : merge(current, reaction),
            raw = JSON.stringify(next);
          core.readOutfitReactions(raw);
          if (!alreadySaved)
            try {
              storage.setItem(key, raw);
              if (storage.getItem(key) !== raw) throw Error("verify");
            } catch {
              throw Error(
                "반응을 보관하지 못했어요. 지금 고른 내용은 이 화면에 남아 있어요.",
              );
            }
          observed = next;
          if (equal(desired.get(reaction.id), reaction)) {
            desired.delete(reaction.id);
            baselines.delete(reaction.id);
          } else baselines.set(reaction.id, structuredClone(reaction));
          errors.delete(reaction.id);
          publish({
            bag: visible(),
            blocked: "",
            notice: [...errors.values()].at(-1) || "",
            persisted: desired.size === 0,
          });
        }),
      )
      .catch((e) => {
        errors.set(reaction.id, e.message);
        publish({ notice: e.message, persisted: desired.size === 0 });
      })
      .finally(() => {
        pending--;
        publish({ saving: pending > 0 });
      });
    return queue;
  };
  return {
    getSnapshot: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    flush: () => queue,
    put(reaction) {
      if (state.blocked) return Promise.resolve();
      const existing = find(state.bag, reaction.id);
      if (existing && !sameTarget(existing, reaction)) {
        publish({
          notice: "기존 반응과 대상 옷·상황이 달라 덮어쓰지 않았어요.",
        });
        return Promise.resolve();
      }
      try {
        core.readOutfitReactions(
          JSON.stringify({ v: 1, reactions: [reaction] }),
        );
        core.readOutfitReactions(JSON.stringify(merge(state.bag, reaction)));
      } catch {
        publish({
          notice:
            "반응의 형식이나 보관 한도를 확인해 주세요. 기존 기록과 선택은 그대로예요.",
        });
        return Promise.resolve();
      }
      if (equal(find(state.bag, reaction.id), reaction)) return queue;
      if (!baselines.has(reaction.id))
        baselines.set(
          reaction.id,
          structuredClone(find(observed, reaction.id)),
        );
      desired.set(reaction.id, structuredClone(reaction));
      publish({
        bag: visible(),
        notice: [...errors.values()].at(-1) || "",
        persisted: false,
      });
      return enqueue(structuredClone(reaction));
    },
    retry() {
      for (const reaction of [...desired.values()])
        enqueue(structuredClone(reaction));
      return queue;
    },
    sync() {
      try {
        observed = read();
        publish({
          bag: visible(),
          blocked: "",
          notice: [...errors.values()].at(-1) || "",
          persisted: desired.size === 0,
        });
      } catch (e) {
        publish({ blocked: e.message, notice: e.message });
      }
    },
  };
}
