import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createMock } from "../src/core.mjs";
import { photoRecord, createPhotoBackup } from "../src/photos/photo-backup.js";
const api = await import("../src/domain/mirror-draft.js").catch(() => ({}));
const KEY = "eoul-d12-hang:mirror:v1",
  MAIN = "eoul-d12-hang:v1",
  PHOTO = "p_" + "a".repeat(64);
const body = () => ({ photoId: PHOTO, width: 400, height: 800 });
const memory = () => {
  const m = new Map();
  return {
    m,
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
function backup(storage, m) {
  const source = fs.readFileSync(
      new URL("../src/screen.html", import.meta.url),
      "utf8",
    ),
    ctx = {
      localStorage: storage,
      window: { EOUL_MOCK_KEY: MAIN },
      M: m,
      REG_KEY: "eoul-d12-hang:reg",
      CHAT_KEY: "eoul-d12-hang:consult",
      TextEncoder,
      URL,
    };
  vm.runInNewContext(
    source.slice(
      source.indexOf("  const BK = {"),
      source.indexOf("  function backupSheet("),
    ) + ";globalThis.bk=BK;",
    ctx,
  );
  return ctx.bk;
}
test("mirror raw keeps unfinished height and one calibration point without changing wardrobe or filling a fake height", () => {
  assert.equal(typeof api.newMirrorDraft, "function");
  const d = api.newMirrorDraft();
  d.body = body();
  d.heightRaw = "172.";
  d.head = { x: 200, y: 50 };
  const raw = " " + JSON.stringify(d) + "\n",
    read = api.readMirrorDraft(raw);
  assert.equal(read.heightRaw, "172.");
  assert.equal(read.feet, null);
  assert.deepEqual(api.readMirrorDraft(null), api.readMirrorDraft(null));
  const storage = memory(),
    m = createMock({ storage, key: MAIN, requireStorage: true }),
    before = [...storage.m];
  assert.equal(typeof m.mirrorCalibration, "function");
  const state = m.mirrorCalibration(read);
  assert.equal(state.ok, false);
  assert.match(state.note, /핏 근거 아님/);
  assert.deepEqual([...storage.m], before);
});
test("future, damaged, duplicated, out-of-image or duplicate-layer drafts are rejected without normalizing them", () => {
  assert.equal(typeof api.readMirrorDraft, "function");
  const valid = api.newMirrorDraft();
  valid.body = body();
  const invalid = [
    "broken",
    '{"v":99}',
    '{"v":99,"v":1}',
    JSON.stringify({ ...valid, future: true }),
    JSON.stringify({ ...valid, body: { ...body(), width: 30001 } }),
    JSON.stringify({ ...valid, head: { x: 401, y: 20 } }),
    JSON.stringify({
      ...valid,
      head: { x: 200, y: 400 },
      feet: { x: 200, y: 350 },
    }),
    JSON.stringify({
      ...valid,
      layers: [
        { garmentId: "g_first", dx: 0, dy: 0 },
        { garmentId: "g_first", dx: 1, dy: 0 },
      ],
    }),
  ];
  for (const raw of invalid) assert.throws(() => api.readMirrorDraft(raw));
});
test("calibration and garment placement use recorded lengths, known offsets and fixed preview limitations", () => {
  const m = createMock();
  assert.equal(typeof m.mirrorPlacement, "function");
  const g = m.addGarment({
    kind: "shirt",
    color: "white",
    profile: { v: 1, measures: { length: { cm: 70, source: "measured" } } },
  });
  m.updateGarmentPhoto(g.id, PHOTO);
  const d = api.newMirrorDraft();
  Object.assign(d, {
    body: body(),
    heightRaw: "175",
    head: { x: 200, y: 50 },
    feet: { x: 210, y: 750 },
    layers: [{ garmentId: g.id, dx: 12, dy: -7 }],
  });
  const c = m.mirrorCalibration(d);
  assert.equal(c.ok, true);
  assert.equal(c.scale.pxPerCm, 4);
  assert.equal(c.centerX, 205);
  const placed = m.mirrorPlacement(g.id, d, {
    photoId: PHOTO,
    width: 200,
    height: 400,
  });
  assert.equal(placed.height, 280);
  assert.equal(placed.width, 140);
  assert.equal(placed.x, 147);
  assert.equal(placed.y, 169);
  assert.equal(placed.assumedLength, false);
  assert.match(placed.note, /분위기 미리보기/);
  const other = m.addGarment({ kind: "shirt", color: "blue" });
  m.updateGarmentPhoto(other.id, PHOTO);
  d.layers.push({ garmentId: other.id, dx: 0, dy: 0 });
  assert.equal(
    m.mirrorPlacement(other.id, d, { photoId: PHOTO, width: 200, height: 400 })
      .assumedLength,
    true,
  );
});
test("merchant-only, trial, wrong-photo and unsupported placements cannot become body collage layers", () => {
  const m = createMock();
  assert.equal(typeof m.mirrorPlacement, "function");
  const g = m.addOwnedProduct("ms-728000"),
    d = api.newMirrorDraft();
  Object.assign(d, {
    body: body(),
    heightRaw: "175",
    head: { x: 200, y: 50 },
    feet: { x: 200, y: 750 },
    layers: [{ garmentId: g.id, dx: 0, dy: 0 }],
  });
  assert.throws(() =>
    m.mirrorPlacement(g.id, d, { photoId: PHOTO, width: 200, height: 400 }),
  );
  m.updateGarmentPhoto(g.id, PHOTO);
  assert.throws(() =>
    m.mirrorPlacement(g.id, d, {
      photoId: "p_" + "b".repeat(64),
      width: 200,
      height: 400,
    }),
  );
  m.loadTrialCloset();
  const trial = m.getState().closet.find((g) => g.trial);
  d.layers.push({ garmentId: trial.id, dx: 0, dy: 0 });
  assert.throws(() =>
    m.mirrorPlacement(trial.id, d, { photoId: PHOTO, width: 200, height: 400 }),
  );
  const shoe = m.addGarment({
    kind: "sneaker",
    slot: "m-white-sneaker",
    color: "white",
  });
  m.updateGarmentPhoto(shoe.id, PHOTO);
  d.layers.push({ garmentId: shoe.id, dx: 0, dy: 0 });
  assert.equal(
    m.mirrorPlacement(shoe.id, d, { photoId: PHOTO, width: 200, height: 400 }),
    null,
  );
});
test("mirror future source is backed up inertly while valid active calibration and separate counts stay unchanged", () => {
  assert.equal(typeof api.newMirrorDraft, "function");
  const storage = memory(),
    m = createMock(),
    bk = backup(storage, m),
    d = api.newMirrorDraft();
  d.body = body();
  d.layers = [{ garmentId: "g_first", dx: 0, dy: 0 }];
  const raw = " " + JSON.stringify(d) + "\n";
  storage.setItem(KEY, raw);
  const before = [...storage.m],
    future = ' {"v":99,"body":{"photoId":"future"},"keep":"raw"} ',
    plan = bk.prepareRestore({ [KEY]: future }, bk.snapshot());
  assert.equal(plan.data[KEY], raw);
  assert.ok(Object.values(plan.data).includes(future));
  assert.deepEqual([...storage.m], before);
  const counts = bk.count({ [KEY]: raw });
  assert.equal(counts.garments, 0);
  assert.equal(counts.mirrorDrafts, 1);
  assert.equal(counts.mirrorLayers, 1);
  assert.match(bk.countText(counts), /거울 초안 1개/);
});
test("photo bundle recognizes a body reference, reports a missing body and preserves its actual original bytes", async () => {
  assert.equal(typeof api.newMirrorDraft, "function");
  const storage = memory(),
    m = createMock(),
    bk = backup(storage, m),
    photos = new Map(),
    repository = {
      list: async () => [...photos.values()],
      pending: async () => null,
      withLock: async (run) => run(),
    };
  const blob = new Blob(
      [
        Uint8Array.from(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6z3sAAAAASUVORK5CYII=",
            "base64",
          ),
        ),
      ],
      { type: "image/png" },
    ),
    record = await photoRecord(blob, { role: "body", width: 1, height: 1 });
  const d = api.newMirrorDraft();
  d.body = { photoId: record.id, width: 1, height: 1 };
  storage.setItem(KEY, JSON.stringify(d));
  const client = createPhotoBackup({ storage, repository, textBackup: bk }),
    emptyFile = await client.makeFile();
  assert.deepEqual((await client.preview(emptyFile)).missing, [record.id]);
  photos.set(record.id, record);
  const file = await client.makeFile(),
    parsed = await client.readFile(file),
    plan = await client.preview(parsed);
  assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.orphans, []);
  assert.equal(parsed.photos[0].role, "body");
  assert.deepEqual(
    new Uint8Array(await parsed.photos[0].blob.arrayBuffer()),
    new Uint8Array(await blob.arrayBuffer()),
  );
  const original = storage.getItem(KEY),
    wire = await client.make();
  wire.text.data[KEY] = JSON.stringify({
    v: 99,
    body: { photoId: PHOTO, width: 400, height: 800 },
  });
  const futurePlan = await client.preview(
    await client.read(JSON.stringify(wire)),
  );
  assert.deepEqual(futurePlan.missing, []);
  assert.deepEqual(futurePlan.orphans, []);
  assert.equal(storage.getItem(KEY), original);
});
