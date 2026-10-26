import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createMock } from "../src/core.mjs";
const edit = await import("../src/domain/profile-edit.js").catch(() => ({}));
const KEY = "eoul-d12-hang:v1",
  DRAFT = "eoul-d12-hang:profile-drafts:v1";
function fixture() {
  const map = new Map();
  let failed = false,
    writes = 0;
  const storage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem(k, v) {
      if (failed) throw Error("quota");
      writes++;
      map.set(k, v);
    },
    removeItem: (k) => map.delete(k),
  };
  const m = createMock({ storage, key: KEY, requireStorage: true });
  const g = m.registerGarment({
    draftId: "profile-edit-fixture",
    brand: "합성 브랜드",
    name: "합성 실측 셔츠",
    kind: "shirt",
    color: "white",
    url: "",
  });
  m.updateGarmentProfile(g.id, {
    v: 1,
    measures: { length: { cm: 70, source: "seller" } },
    fabric: { value: "코튼", source: "ai" },
  });
  return {
    m,
    map,
    storage,
    g: m.getState().closet[0],
    get writes() {
      return writes;
    },
    fail: (v) => (failed = v),
  };
}
function bk(f) {
  const page = fs.readFileSync(
      new URL("../src/screen.html", import.meta.url),
      "utf8",
    ),
    source = page.slice(
      page.indexOf("  const BK = {"),
      page.indexOf("  function backupSheet("),
    );
  const ctx = {
    localStorage: f.storage,
    window: { EOUL_MOCK_KEY: KEY },
    M: f.m,
    REG_KEY: "eoul-d12-hang:reg",
    CHAT_KEY: "eoul-d12-hang:consult",
    TextEncoder,
    URL,
  };
  vm.runInNewContext(source + ";globalThis.bk=BK;", ctx);
  return ctx.bk;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
test("profile edit drafts retain incomplete raw measurements without changing the actual garment", () => {
  assert.equal(typeof edit.profileEditDraft, "function");
  const f = fixture(),
    before = f.map.get(KEY),
    count = f.writes,
    d = edit.profileEditDraft(f.g, "2026-10-27T00:00:00Z");
  d.form.measures.length = "72.";
  const raw = " " + JSON.stringify({ v: 1, edits: { [f.g.id]: d } }) + "\n";
  const value = edit.readProfileDrafts(raw);
  assert.equal(value.edits[f.g.id].form.measures.length, "72.");
  assert.throws(() => edit.profileFromEdit(value.edits[f.g.id]), /총장/);
  assert.equal(f.map.get(KEY), before);
  assert.equal(f.writes, count);
});
test("profile field edits preserve unchanged seller and AI sources until explicit confirmation", () => {
  assert.equal(typeof edit.profileEditDraft, "function");
  const f = fixture(),
    d = edit.profileEditDraft(f.g);
  d.form.measures.chest = "56";
  let p = edit.profileFromEdit(d);
  assert.deepEqual(p.measures.length, { cm: 70, source: "seller" });
  assert.deepEqual(p.measures.chest, { cm: 56, source: "measured" });
  assert.equal(p.fabric.source, "ai");
  d.form.confirmed = ["fabric"];
  p = edit.profileFromEdit(d);
  assert.equal(p.fabric.source, "chosen");
  assert.equal(f.g.profile.fabric.source, "ai");
});
test("stale profile edits cannot overwrite a newer profile and failed saves preserve the original snapshot", () => {
  const f = fixture();
  assert.equal(typeof f.m.applyProfileEdit, "function");
  const d = edit.profileEditDraft(f.g);
  d.form.measures.length = "72";
  f.fail(true);
  const before = f.map.get(KEY);
  assert.throws(
    () => f.m.applyProfileEdit(d),
    (e) => e.code === "storage_write_failed",
  );
  assert.equal(f.map.get(KEY), before);
  f.fail(false);
  f.m.updateGarmentProfile(f.g.id, {
    ...f.g.profile,
    measures: { length: { cm: 74, source: "measured" } },
  });
  const newer = f.map.get(KEY);
  assert.throws(
    () => f.m.applyProfileEdit(d),
    (e) => e.code === "profile_changed",
  );
  assert.equal(f.map.get(KEY), newer);
});
test("retry after a committed profile save is idempotent and leaves registration history untouched", () => {
  const f = fixture();
  assert.equal(typeof f.m.applyProfileEdit, "function");
  const d = edit.profileEditDraft(f.g);
  d.form.measures.length = "72";
  const receipts = JSON.stringify(JSON.parse(f.map.get(KEY)).registrations);
  f.m.applyProfileEdit(d);
  assert.equal(
    JSON.stringify(JSON.parse(f.map.get(KEY)).registrations),
    receipts,
  );
  const before = f.map.get(KEY),
    writes = f.writes;
  f.m.applyProfileEdit(d);
  assert.equal(f.writes, writes);
  assert.equal(f.map.get(KEY), before);
  assert.equal(f.m.getState().closet[0].profile.measures.length.cm, 72);
});
test("future, malformed and duplicate-member profile draft raws are quarantined without writes or loss of current active drafts", () => {
  const f = fixture();
  const backup = bk(f);
  for (const raw of [
    '{"v":99,"edits":{}}',
    "broken",
    '{"v":1,"edits":{},"future":true}',
    '{"v":99,"v":1,"edits":{}}',
  ]) {
    const before = [...f.map],
      count = f.writes,
      result = backup.classify({ [DRAFT]: raw });
    assert.equal(result.data[DRAFT], undefined);
    assert.deepEqual(Object.values(result.data), [raw]);
    assert.deepEqual([...f.map], before);
    assert.equal(f.writes, count);
  }
});
test("normal profile drafts round-trip exact bytes through backup and preview counts do not count them as clothes", () => {
  const f = fixture();
  assert.equal(typeof edit.profileEditDraft, "function");
  const d = edit.profileEditDraft(f.g),
    raw = " " + JSON.stringify({ v: 1, edits: { [f.g.id]: d } }) + "\n";
  const backup = bk(f),
    data = backup.classify({ [DRAFT]: raw });
  assert.equal(data.data[DRAFT], raw);
  assert.equal(backup.count(data.data).garments, 0);
  assert.equal(backup.count(data.data).profileDrafts, 1);
  assert.match(backup.countText(backup.count(data.data)), /옷 정보 초안 1개/);
  assert.equal(backup.sourceLabel(DRAFT), "옷 정보 편집 초안");
});

test("a stale core instance cannot replace another tab wardrobe; explicit reload keeps the edit and unrelated new data", () => {
  const f = fixture(),
    d = edit.profileEditDraft(f.g);
  d.form.measures.length = "72";
  const other = createMock({
    storage: f.storage,
    key: KEY,
    requireStorage: true,
  });
  other.addGarment({
    kind: "pants",
    color: "black",
    label: "다른 창에서 넣은 합성 바지",
  });
  const before = f.map.get(KEY);
  assert.throws(
    () => f.m.applyProfileEdit(d),
    (e) => e.code === "storage_changed",
  );
  assert.equal(f.map.get(KEY), before);
  assert.equal(f.m.getState().closetCount, 1);
  f.m.reloadSaved();
  f.m.applyProfileEdit(d);
  assert.equal(f.m.getState().closetCount, 2);
  assert.equal(
    f.m.getState().closet.find((g) => g.id === f.g.id).profile.measures.length
      .cm,
    72,
  );
});

test("unchanged measurement value can explicitly change source, while missing fields or duplicate members are not silently interpreted", () => {
  const f = fixture(),
    d = edit.profileEditDraft(f.g);
  d.form.measureSources.length = "measured";
  assert.deepEqual(edit.profileFromEdit(d).measures.length, {
    cm: 70,
    source: "measured",
  });
  const incomplete = structuredClone(d);
  delete incomplete.form.measures.length;
  assert.throws(() =>
    edit.readProfileDrafts(
      JSON.stringify({ v: 1, edits: { [d.garmentId]: incomplete } }),
    ),
  );
  assert.throws(() => edit.readProfileDrafts('{"v":99,"v":1,"edits":{}}'));
  const literal = edit.profileEditDraft(f.g);
  literal.form.details = '"v":99,"v":1';
  assert.equal(
    edit.readProfileDrafts(
      JSON.stringify({ v: 1, edits: { [literal.garmentId]: literal } }),
    ).edits[literal.garmentId].form.details,
    literal.form.details,
  );
});
