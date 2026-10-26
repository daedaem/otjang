// The exact immutable request is the cache/source key. Late responses can be
// cached for that same source, but never applied to a different visible source.
export function createOutfitAI({
  request,
  accept,
  clock = () => new Date().toISOString(),
}) {
  const listeners = new Set(),
    cache = new Map(),
    inFlight = new Map();
  let source = null,
    key = "",
    generation = 0,
    alive = true,
    active = null;
  let state = {
    phase: "empty",
    result: null,
    why: "",
    cached: false,
    receivedAt: null,
    sourceKey: "",
  };
  const publish = (patch) => {
    if (!alive) return;
    state = { ...state, ...patch };
    for (const fn of [...listeners]) fn();
  };
  const controller = {
    getSnapshot: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setSource(value) {
      const nextKey = value ? JSON.stringify(value) : "";
      if (nextKey === key) return;
      key = nextKey;
      source = value ? JSON.parse(nextKey) : null;
      generation++;
      active = null;
      const prior = cache.get(key);
      publish({
        phase: prior ? "ready" : source ? "idle" : "empty",
        result: prior?.result || null,
        why: "",
        cached: !!prior,
        receivedAt: prior?.receivedAt || null,
        sourceKey: key,
      });
    },
    ask() {
      if (!alive || !source) return Promise.resolve();
      if (active) return active;
      const existing = cache.get(key);
      if (existing) {
        publish({
          phase: "ready",
          result: existing.result,
          why: "",
          cached: true,
          receivedAt: existing.receivedAt,
        });
        return Promise.resolve();
      }
      const captured = structuredClone(source),
        sourceKey = key,
        epoch = generation;
      publish({
        phase: "loading",
        result: null,
        why: "",
        cached: false,
        receivedAt: null,
      });
      let work = inFlight.get(sourceKey);
      if (!work) {
        let provider;
        try {
          provider = Promise.resolve(request(structuredClone(captured)));
        } catch (e) {
          provider = Promise.reject(e);
        }
        work = provider
          .then((out) => {
            const result = accept(captured, out);
            if (!result) throw Error("parse");
            const record = { result, receivedAt: clock() };
            cache.set(sourceKey, record);
            return record;
          })
          .finally(() => {
            if (inFlight.get(sourceKey) === work) inFlight.delete(sourceKey);
          });
        inFlight.set(sourceKey, work);
      }
      const applying = work
        .then(
          (record) => {
            if (alive && key === sourceKey && generation === epoch)
              publish({
                phase: "ready",
                result: record.result,
                why: "",
                cached: false,
                receivedAt: record.receivedAt,
              });
          },
          (error) => {
            if (alive && key === sourceKey && generation === epoch)
              publish({
                phase: "error",
                result: null,
                why: typeof error?.code === "string" ? error.code : "parse",
                cached: false,
              });
          },
        )
        .finally(() => {
          if (active === applying) active = null;
        });
      active = applying;
      return applying;
    },
    dispose() {
      alive = false;
      generation++;
      listeners.clear();
    },
  };
  return controller;
}
