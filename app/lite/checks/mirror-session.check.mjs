import test from "node:test";
import assert from "node:assert/strict";
import {
  readMirrorDraft,
  newMirrorDraft,
  MIRROR_DRAFT_KEY,
} from "../src/domain/mirror-draft.js";
const { createMirrorSession } = await import("../src/mirror/session.js").catch(
  () => ({}),
);
const id = "p_" + "a".repeat(64);
function fixture() {
  const map = new Map();
  let writes = 0,
    fail = false,
    verifyFail = false;
  const storage = {
    getItem(k) {
      if (verifyFail) {
        verifyFail = false;
        throw Error("read failed");
      }
      return map.get(k) ?? null;
    },
    setItem(k, v) {
      if (fail) throw Error("quota");
      map.set(k, v);
      writes++;
    },
    removeItem: (k) => map.delete(k),
  };
  const core = {
    mirrorDraftKey: MIRROR_DRAFT_KEY,
    newMirrorDraft,
    readMirrorDraft,
    assertPhotoReady() {},
    withStorageLock: (fn) => Promise.resolve().then(fn),
    boot: {},
  };
  const originals = new Map();
  const repo = {
    withLock: (fn) => fn(),
    async put(r) {
      originals.set(r.id, r);
    },
  };
  let prepare = 0;
  const photos = async () => ({
    prepareBodyPhoto: async () => {
      prepare++;
      return { id, width: 200, height: 400, blob: {} };
    },
    photoLibrary: async () => repo,
  });
  return {
    core,
    storage,
    map,
    photos,
    repo,
    originals,
    get writes() {
      return writes;
    },
    set fail(x) {
      fail = x;
    },
    failNextRead() {
      verifyFail = true;
    },
    get prepare() {
      return prepare;
    },
  };
}
function start(f) {
  assert.equal(typeof createMirrorSession, "function");
  return createMirrorSession(f);
}
test("mirror entry reads without writes and partial height/one point survive a fresh session", async () => {
  const f = fixture(),
    s = start(f);
  assert.equal(f.writes, 0);
  await s.change({ heightRaw: "172." });
  await s.upload({});
  await s.change({ head: { x: 100, y: 20 } });
  const d = start(f).getSnapshot().draft;
  assert.equal(d.heightRaw, "172.");
  assert.deepEqual(d.head, { x: 100, y: 20 });
  assert.equal(d.feet, null);
});
test("failed mirror write retains RAM and retry after a durable-but-unverified write is idempotent", async () => {
  const f = fixture(),
    s = start(f);
  f.fail = true;
  await s.change({ heightRaw: "175" });
  assert.equal(s.getSnapshot().persisted, false);
  assert.equal(s.getSnapshot().draft.heightRaw, "175");
  assert.equal(f.writes, 0);
  f.fail = false;
  await s.retry();
  assert.equal(s.getSnapshot().persisted, true);
  const set = f.storage.setItem;
  f.storage.setItem = (k, v) => {
    set(k, v);
    f.failNextRead();
  };
  await s.change({ heightRaw: "176" });
  assert.equal(s.getSnapshot().persisted, false);
  f.storage.setItem = set;
  const writes = f.writes;
  await s.retry();
  assert.equal(f.writes, writes);
  assert.equal(s.getSnapshot().persisted, true);
});
test("pending old mirror cannot overwrite another window, even after later edits", async () => {
  const f = fixture(),
    a = start(f),
    b = start(f);
  f.fail = true;
  await a.change({ heightRaw: "171" });
  f.fail = false;
  await b.change({ heightRaw: "180" });
  await a.change({ heightRaw: "172" });
  await a.retry();
  assert.equal(
    readMirrorDraft(f.storage.getItem(MIRROR_DRAFT_KEY)).heightRaw,
    "180",
  );
  assert.equal(a.getSnapshot().draft.heightRaw, "172");
  assert.equal(a.getSnapshot().persisted, false);
});
test("damaged/future mirror stays protected and preview never opens photo storage", async () => {
  const f = fixture();
  f.map.set(MIRROR_DRAFT_KEY, '{"v":99}');
  const s = start(f);
  await s.change({ heightRaw: "175" });
  await s.upload({});
  await s.retry();
  assert.equal(f.writes, 0);
  assert.equal(f.prepare, 0);
  assert.ok(s.getSnapshot().blocked);
  const g = fixture();
  g.core.boot.preview = true;
  await start(g).upload({});
  assert.equal(g.prepare, 0);
  assert.equal(g.writes, 0);
});
test("body original survives a failed link write and retry links the exact saved original", async () => {
  const f = fixture(),
    s = start(f);
  f.fail = true;
  await s.upload({});
  assert.equal(f.originals.size, 1);
  assert.equal(s.getSnapshot().draft.body.photoId, id);
  assert.equal(s.getSnapshot().persisted, false);
  f.fail = false;
  await s.retry();
  assert.equal(start(f).getSnapshot().draft.body.photoId, id);
  assert.equal(f.originals.size, 1);
});
test("upload blocks concurrent edits and changing body resets coordinates but keeps height and own layer choices", async () => {
  const f = fixture(),
    s = start(f);
  await s.upload({});
  await s.change({
    heightRaw: "175",
    head: { x: 100, y: 20 },
    feet: { x: 100, y: 380 },
    layers: [{ garmentId: "own_1", dx: 5, dy: 10 }],
  });
  let release;
  f.repo.put = async (r) => {
    await new Promise((ok) => (release = ok));
    f.originals.set(r.id, r);
  };
  const originalPhotos = f.photos;
  f.photos = async () => ({
    ...(await originalPhotos()),
    prepareBodyPhoto: async () => ({
      id: "p_" + "b".repeat(64),
      width: 200,
      height: 500,
    }),
  });
  const t = start(f),
    task = t.upload({});
  while (!release) await new Promise((r) => setTimeout(r, 0));
  await t.change({ heightRaw: "190" });
  release();
  await task;
  const d = t.getSnapshot().draft;
  assert.equal(d.heightRaw, "175");
  assert.equal(d.head, null);
  assert.equal(d.feet, null);
  assert.deepEqual(d.layers, [{ garmentId: "own_1", dx: 0, dy: 0 }]);
});
test("body upload rechecks the link after async photo storage and refuses a newer window", async () => {
  const f = fixture(),
    a = start(f),
    b = start(f);
  f.repo.put = async (r) => {
    f.originals.set(r.id, r);
    await b.change({ heightRaw: "188" });
  };
  await a.upload({});
  assert.equal(start(f).getSnapshot().draft.heightRaw, "188");
  assert.equal(a.getSnapshot().draft.body.photoId, id);
  assert.equal(a.getSnapshot().persisted, false);
  await a.retry();
  assert.equal(start(f).getSnapshot().draft.heightRaw, "188");
});

test("same photo with reordered valid body keys preserves calibrated points and offsets", async () => {
  const f = fixture(),
    d = newMirrorDraft();
  Object.assign(d, {
    body: { height: 400, width: 200, photoId: id },
    heightRaw: "175",
    head: { x: 100, y: 20 },
    feet: { x: 100, y: 380 },
    layers: [{ garmentId: "own_1", dx: 5, dy: 10 }],
  });
  f.map.set(MIRROR_DRAFT_KEY, JSON.stringify(d));
  const s = start(f);
  await s.upload({});
  assert.deepEqual(s.getSnapshot().draft.head, d.head);
  assert.deepEqual(s.getSnapshot().draft.feet, d.feet);
  assert.deepEqual(s.getSnapshot().draft.layers, d.layers);
});
