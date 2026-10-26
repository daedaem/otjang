import test from "node:test";
import assert from "node:assert/strict";
import { createMock } from "../src/core.mjs";
import fs from "node:fs";
import vm from "node:vm";
const api = await import("../src/domain/collection-settings.js").catch(
  () => ({}),
);
const client = await import("../src/collection/session.js").catch(() => ({}));
const KEY = "eoul-d12-hang:collection:v1";
const empty = () => ({ v: 1, candidates: {}, goals: [] });
const pref = (purpose = "collect") => ({
  purpose,
  series: "LVC 501",
  updatedAt: "2026-10-27T00:00:00.000Z",
});
const memory = () => {
  const m = new Map();
  return {
    map: m,
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
test("collection settings preserve chosen intent without turning candidates or targets into owned clothes", () => {
  assert.equal(typeof api.readCollectionSettings, "function");
  const bag = empty();
  bag.candidates["ms-728000"] = pref();
  bag.goals = [{ series: "LVC 501", target: 5 }];
  const raw = " " + JSON.stringify(bag) + "\n";
  assert.deepEqual(api.readCollectionSettings(raw), bag);
  assert.deepEqual(api.readCollectionSettings(null), empty());
  const m = createMock();
  assert.equal(typeof m.collectionInfo, "function");
  const info = m.collectionInfo("ms-728000", bag);
  assert.equal(info.axes.duplicateWarning, false);
  assert.equal(m.getState().closetCount, 0);
  assert.equal(info.shelves[0].count, 0);
  assert.equal(info.shelves[0].empty, 5);
});
test("future settings, duplicate names and invalid goals are rejected rather than normalized", () => {
  assert.equal(typeof api.readCollectionSettings, "function");
  for (const raw of [
    "broken",
    '{"v":99,"candidates":{},"goals":[]}',
    '{"v":99,"v":1,"candidates":{},"goals":[]}',
    JSON.stringify({ ...empty(), future: true }),
    JSON.stringify({
      ...empty(),
      goals: [
        { series: "LVC 501", target: 2 },
        { series: "lvc501", target: 3 },
      ],
    }),
    JSON.stringify({ ...empty(), goals: [{ series: "LVC", target: 101 }] }),
    JSON.stringify({ ...empty(), candidates: { "ms-728000": pref("resell") } }),
  ])
    assert.throws(() => api.readCollectionSettings(raw));
});
test("candidate writes merge unrelated entries and refuse to overwrite a newer same-candidate intent", async () => {
  assert.equal(typeof client.createCollectionSession, "function");
  const storage = memory(),
    core = {
      collectionKey: KEY,
      collectionSeriesKey: api.collectionSeriesKey,
      readCollectionSettings: api.readCollectionSettings,
      assertPhotoReady() {},
      withStorageLock: (run) => run(),
    };
  const a = client.createCollectionSession({ core, storage }),
    b = client.createCollectionSession({ core, storage });
  await a.saveCandidate("ms-728000", pref());
  await b.saveCandidate("ms-728001", pref("wear"));
  assert.equal(
    api.readCollectionSettings(storage.getItem(KEY)).candidates["ms-728000"]
      .purpose,
    "collect",
  );
  const old = client.createCollectionSession({ core, storage });
  await a.saveCandidate("ms-728000", pref("both"));
  const newer = storage.getItem(KEY);
  await old.saveCandidate("ms-728000", pref("wear"));
  assert.equal(storage.getItem(KEY), newer);
  assert.equal(old.getSnapshot().persisted, false);
  assert.match(old.getSnapshot().notice, /다른/);
});
test("failed collection writes retain visible input and a later successful retry clears the error", async () => {
  assert.equal(typeof client.createCollectionSession, "function");
  const storage = memory(),
    set = storage.setItem;
  let fail = true;
  storage.setItem = (k, v) => {
    if (fail) throw Error("quota");
    return set(k, v);
  };
  const core = {
    collectionKey: KEY,
    collectionSeriesKey: api.collectionSeriesKey,
    readCollectionSettings: api.readCollectionSettings,
    assertPhotoReady() {},
    withStorageLock: (run) => run(),
  };
  const session = client.createCollectionSession({ core, storage });
  await session.saveCandidate("ms-728000", pref());
  assert.equal(
    session.getSnapshot().bag.candidates["ms-728000"].purpose,
    "collect",
  );
  assert.equal(session.getSnapshot().persisted, false);
  assert.equal(storage.getItem(KEY), null);
  fail = false;
  await session.retry();
  assert.equal(session.getSnapshot().persisted, true);
  assert.equal(session.getSnapshot().notice, "");
});
test("shelves count real owned series only, and an owned collection intent does not equate zero wear to failure", () => {
  const m = createMock();
  assert.equal(typeof m.collectionInfo, "function");
  m.loadTrialCloset();
  const own = m.addGarment({
    kind: "shirt",
    color: "white",
    profile: { v: 1, purpose: "collect", series: "My Archive" },
  });
  const info = m.collectionInfo(null, empty());
  assert.deepEqual(
    info.shelves.map((s) => [s.name, s.count, s.empty]),
    [["My Archive", 1, 0]],
  );
  assert.equal(info.ownedCount, 1);
  assert.equal(m.collectionWear(own.id).expectation, "not-expected");
  assert.match(m.collectionWear(own.id).line, /기록한 착용 0회/);
  assert.doesNotMatch(m.collectionWear(own.id).line, /실패|후회/);
});

test("saving an unrelated target never rebases a failed candidate over a newer window", async () => {
  const storage = memory(),
    core = {
      collectionKey: KEY,
      collectionSeriesKey: api.collectionSeriesKey,
      readCollectionSettings: api.readCollectionSettings,
      assertPhotoReady() {},
      withStorageLock: (run) => run(),
    };
  const setup = client.createCollectionSession({ core, storage });
  await setup.saveCandidate("ms-728000", pref());
  const a = client.createCollectionSession({ core, storage }),
    b = client.createCollectionSession({ core, storage });
  const set = storage.setItem;
  let fail = true;
  storage.setItem = (k, v) => {
    if (fail) {
      fail = false;
      throw Error("quota");
    }
    return set(k, v);
  };
  await a.saveCandidate("ms-728000", {
    ...pref("wear"),
    series: "old pending",
  });
  await b.saveCandidate("ms-728000", {
    ...pref("both"),
    series: "newer other window",
  });
  await a.saveGoal("unrelated goal", 3);
  const newer = storage.getItem(KEY);
  await a.retry();
  assert.equal(storage.getItem(KEY), newer);
  assert.equal(a.getSnapshot().persisted, false);
  assert.match(a.getSnapshot().notice, /다른/);
});

test("a durable write followed by a read error retries idempotently without overwriting anything", async () => {
  const storage = memory(),
    core = createMock(),
    get = storage.getItem,
    set = storage.setItem;
  let verifyError = false,
    writes = 0;
  storage.getItem = (k) => {
    if (verifyError) {
      verifyError = false;
      throw Error("read failure");
    }
    return get(k);
  };
  storage.setItem = (k, v) => {
    writes++;
    set(k, v);
    verifyError = true;
  };
  const s = client.createCollectionSession({ core, storage });
  await s.saveCandidate("ms-728000", pref());
  assert.equal(s.getSnapshot().persisted, false);
  const raw = get(KEY);
  await s.retry();
  assert.equal(s.getSnapshot().persisted, true);
  assert.equal(get(KEY), raw);
  assert.equal(writes, 1);
});
test("collection backup keeps future raw inert, retains current valid settings and counts notes separately", () => {
  const storage = memory(),
    m = createMock(),
    bag = empty();
  bag.candidates["ms-728000"] = pref();
  bag.goals = [{ series: "LVC", target: 2 }];
  const raw = " " + JSON.stringify(bag) + "\n";
  storage.setItem(KEY, raw);
  const html = fs.readFileSync(
    new URL("../src/screen.html", import.meta.url),
    "utf8",
  );
  const source = html.slice(
    html.indexOf("  const BK = {"),
    html.indexOf("  function backupSheet("),
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
  vm.runInNewContext(source + ";globalThis.bk=BK;", ctx);
  const future = ' {"v":99,"candidates":{},"goals":[],"raw":"keep"} ',
    before = [...storage.map];
  const plan = ctx.bk.prepareRestore({ [KEY]: future }, ctx.bk.snapshot());
  assert.equal(plan.data[KEY], raw);
  assert.ok(Object.values(plan.data).includes(future));
  assert.deepEqual([...storage.map], before);
  const count = ctx.bk.count({ [KEY]: raw });
  assert.equal(count.garments, 0);
  assert.equal(count.reg, 0);
  assert.equal(count.collectionIntents, 1);
  assert.equal(count.collectionGoals, 1);
  assert.match(ctx.bk.countText(count), /후보 목적 1개 · 진열 목표 1개/);
});
test("collection purchase context is read-only and an explicitly edited owned purpose wins over old candidate intent", () => {
  const storage = memory(),
    m = createMock({ storage, key: "eoul-d12-hang:v1", requireStorage: true }),
    bag = empty();
  bag.candidates["ms-728000"] = pref();
  m.decide("ms-728000", "buy");
  m.advance("ms-728000", "ordered");
  m.advance("ms-728000", "received");
  m.advance("ms-728000", "kept");
  const raw = storage.getItem("eoul-d12-hang:v1");
  assert.equal(
    m.collectionRecord("ms-728000", bag).expectation,
    "not-expected",
  );
  assert.match(m.collectionRecord("ms-728000", bag).line, /후보 메모/);
  assert.equal(storage.getItem("eoul-d12-hang:v1"), raw);
  const own = m.getState().closet.find((g) => g.productId === "ms-728000");
  m.updateGarmentProfile(own.id, { v: 1, purpose: "wear" });
  assert.equal(m.collectionRecord("ms-728000", bag).expectation, "expected");
  assert.equal(m.collectionRecord("ms-728000", bag).source, "옷 정보");
});
test("a failed goal is not rebased when an unrelated candidate later saves", async () => {
  const storage = memory(),
    core = createMock(),
    initial = client.createCollectionSession({ core, storage });
  await initial.saveGoal("LVC", 2);
  const a = client.createCollectionSession({ core, storage }),
    b = client.createCollectionSession({ core, storage }),
    set = storage.setItem;
  let fail = true;
  storage.setItem = (k, v) => {
    if (fail) {
      fail = false;
      throw Error("quota");
    }
    set(k, v);
  };
  await a.saveGoal("LVC", 3);
  await b.saveGoal("LVC", 4);
  await a.saveCandidate("ms-728000", pref());
  const newer = storage.getItem(KEY);
  await a.retry();
  assert.equal(storage.getItem(KEY), newer);
  assert.equal(a.getSnapshot().persisted, false);
});
