import test from "node:test";
import assert from "node:assert/strict";
import { createMock } from "../src/core.mjs";
const api = await import("../src/domain/measurement-draft.js").catch(
  () => ({}),
);
const productId = "ms-728000";
function reference() {
  return {
    id: "own-reference",
    kind: "shirt",
    profile: {
      v: 1,
      reference: true,
      measures: {
        length: { cm: 70, source: "measured" },
        chest: { cm: 55, source: "measured" },
      },
    },
  };
}
test("candidate measurement draft preserves unfinished input and does not create an owned garment", () => {
  assert.equal(typeof api.measurementDraft, "function");
  const d = api.measurementDraft({ id: productId, kind: "shirt" });
  d.manual.length = "72.";
  const raw =
    " " + JSON.stringify({ v: 1, entries: { [productId]: d } }) + "\n";
  assert.equal(
    api.readMeasurementDrafts(raw).entries[productId].manual.length,
    "72.",
  );
  const result = api.measurementResult(d, { kind: "shirt" }, reference());
  assert.ok(result.problems.length);
  assert.equal(result.options.length, 0);
  assert.equal(createMock().getState().closetCount, 0);
});
test("candidate size table compares numeric facts and always carries the fit limitation note", () => {
  assert.equal(typeof api.measurementDraft, "function");
  const d = api.measurementDraft({ id: productId, kind: "shirt" });
  d.mode = "table";
  d.table = "사이즈 총장 가슴\nS 68 53\nM 72 57";
  const r = api.measurementResult(d, { kind: "shirt" }, reference());
  assert.equal(r.closest.best, null);
  assert.match(r.closest.reason, /같아요/);
  assert.equal(r.active, null);
  assert.match(r.note, /착용감이나 핏/);
  d.selected = "M";
  const selected = api.measurementResult(d, { kind: "shirt" }, reference());
  assert.match(selected.comparison.factLine, /총장 \+2cm/);
  assert.equal(selected.active.label, "M");
});
test("a missing reference and mismatched metric coverage never silently pick a size", () => {
  assert.equal(typeof api.measurementDraft, "function");
  const d = api.measurementDraft({ id: productId, kind: "shirt" });
  d.mode = "table";
  d.table = "M 총장 70 가슴 55\nL 총장 71 어깨 47";
  assert.equal(
    api.measurementResult(d, { kind: "shirt" }, null).closest.best,
    null,
  );
  const g = reference();
  g.profile.measures.shoulder = { cm: 46, source: "seller" };
  assert.equal(
    api.measurementResult(d, { kind: "shirt" }, g).closest.best,
    null,
  );
});
test("future, truncated, duplicated or wrong-kind comparison drafts are rejected without normalizing them", () => {
  assert.equal(typeof api.readMeasurementDrafts, "function");
  for (const raw of [
    '{"v":99,"entries":{}}',
    "broken",
    '{"v":99,"v":1,"entries":{}}',
    '{"v":1,"entries":{},"unknown":true}',
  ])
    assert.throws(() => api.readMeasurementDrafts(raw));
  const d = api.measurementDraft({ id: productId, kind: "shirt" });
  d.manual.waist = "30";
  assert.throws(() =>
    api.readMeasurementDrafts(
      JSON.stringify({ v: 1, entries: { [productId]: d } }),
    ),
  );
});
test("quick reference creation stores unknown brand and profile in one atomic wardrobe write", () => {
  const map = new Map();
  let fail = false,
    writes = 0;
  const m = createMock({
    key: "reference",
    storage: {
      getItem: (k) => map.get(k) ?? null,
      setItem(k, v) {
        if (fail) throw Error("quota");
        writes++;
        map.set(k, v);
      },
    },
    requireStorage: true,
  });
  const old = m.addGarment({
    kind: "shirt",
    color: "white",
    profile: {
      v: 1,
      reference: true,
      measures: { length: { cm: 70, source: "measured" } },
    },
  });
  assert.equal(m.getState().closet[0].profile?.reference, true);
  const before = map.get("reference"),
    n = writes;
  fail = true;
  assert.throws(
    () => m.addGarment({ kind: "shirt", profile: { v: 1, reference: true } }),
    (e) => e.code === "storage_write_failed",
  );
  assert.equal(map.get("reference"), before);
  assert.equal(writes, n);
  fail = false;
  const g = m.addGarment({ kind: "shirt", profile: { v: 1, reference: true } });
  assert.equal(writes, n + 1);
  assert.equal(g.brand, null);
  assert.equal(g.profile.reference, true);
  assert.equal(
    m.getState().closet.find((g) => g.id === old.id).profile.reference,
    undefined,
  );
});

test("repeated size labels remain ambiguous and a previously selected label is never replaced silently", () => {
  const d = api.measurementDraft({ id: productId, kind: "shirt" });
  d.mode = "table";
  d.table = "사이즈 총장 가슴\nM 70 55\nM 74 57";
  let r = api.measurementResult(d, { kind: "shirt" }, reference());
  assert.equal(r.options.length, 0);
  assert.equal(r.active, null);
  assert.ok(r.warnings.some((x) => x.includes("두 번")));
  d.table = "사이즈 총장 가슴\nL 70 55";
  d.selected = "M";
  r = api.measurementResult(d, { kind: "shirt" }, reference());
  assert.equal(r.closest.best, "L");
  assert.equal(r.active, null);
  assert.ok(r.warnings.some((x) => x.includes("선택")));
});

test("comparison drafts export raw future values separately and preserve an existing valid active note", async () => {
  const fs = await import("node:fs"),
    vm = await import("node:vm");
  const map = new Map(),
    storage = {
      get length() {
        return map.size;
      },
      key: (i) => [...map.keys()][i] ?? null,
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    },
    m = createMock({ storage, key: "eoul-d12-hang:v1", requireStorage: true });
  const d = api.measurementDraft({ id: productId, kind: "shirt" }),
    key = "eoul-d12-hang:measure-drafts:v1",
    raw = " " + JSON.stringify({ v: 1, entries: { [productId]: d } }) + "\n";
  map.set(key, raw);
  const page = fs.readFileSync(
      new URL("../src/screen.html", import.meta.url),
      "utf8",
    ),
    block = page.slice(
      page.indexOf("  const BK = {"),
      page.indexOf("  function backupSheet("),
    );
  const ctx = {
    localStorage: storage,
    window: { EOUL_MOCK_KEY: "eoul-d12-hang:v1" },
    M: m,
    REG_KEY: "eoul-d12-hang:reg",
    CHAT_KEY: "eoul-d12-hang:consult",
    TextEncoder,
    URL,
  };
  vm.runInNewContext(block + ";globalThis.bk=BK;", ctx);
  const future = ' {"v":99,"entries":{}} ',
    before = [...map],
    classified = ctx.bk.classify({ [key]: future });
  assert.equal(classified.data[key], undefined);
  assert.ok(Object.values(classified.data).includes(future));
  const plan = ctx.bk.prepareRestore({ [key]: future }, ctx.bk.snapshot());
  assert.equal(plan.data[key], raw);
  assert.deepEqual([...map], before);
  assert.equal(ctx.bk.count({ [key]: raw }).measureDrafts, 1);
  assert.match(
    ctx.bk.countText(ctx.bk.count({ [key]: raw })),
    /실측 비교 초안 1개/,
  );
});

test("candidate note session resumes raw text, leaves the wardrobe unchanged and refuses a newer note", async () => {
  const { createMeasureSession } = await import("../src/measure/session.js");
  const map = new Map(),
    storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    },
    core = createMock({
      storage,
      key: "eoul-d12-hang:v1",
      requireStorage: true,
    });
  const a = createMeasureSession({ core, storage, productId });
  const before = map.get("eoul-d12-hang:v1");
  await a.change((d) => {
    d.manual.length = "72.";
  });
  const b = createMeasureSession({ core, storage, productId });
  assert.equal(b.getSnapshot().draft.manual.length, "72.");
  await a.change((d) => {
    d.manual.length = "74";
  });
  const saved = map.get("eoul-d12-hang:measure-drafts:v1");
  await b.change((d) => {
    d.manual.length = "76";
  });
  assert.equal(map.get("eoul-d12-hang:measure-drafts:v1"), saved);
  assert.match(b.getSnapshot().notice, /다른 화면/);
  assert.equal(b.getSnapshot().draft.manual.length, "76");
  assert.equal(map.get("eoul-d12-hang:v1"), before);
});
