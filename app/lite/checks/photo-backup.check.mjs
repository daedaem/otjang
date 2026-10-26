import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createMock } from "../src/core.mjs";
import fs from "node:fs";
import vm from "node:vm";
const api = await import("../src/photos/photo-backup.js").catch(() => ({}));
const KEY = "eoul-d12-hang:v1",
  MARKER = "eoul-backup:photos-pending";
const png = () =>
  new Blob(
    [
      Uint8Array.from(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6z3sAAAAASUVORK5CYII=",
          "base64",
        ),
      ),
    ],
    { type: "image/png" },
  );
function fixture() {
  const map = new Map(),
    events = [];
  let failure = null;
  const storage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem(k, v) {
      if (failure?.("set", k)) throw Error("storage fault");
      events.push(["set", k]);
      map.set(k, String(v));
    },
    removeItem(k) {
      if (failure?.("remove", k)) throw Error("storage fault");
      events.push(["remove", k]);
      map.delete(k);
    },
  };
  const photos = new Map();
  let journal = null,
    undo = null;
  const repository = {
    fail: null,
    locked: false,
    async withLock(run) {
      if (this.locked) throw Error("other photo operation");
      this.locked = true;
      try {
        return await run();
      } finally {
        this.locked = false;
      }
    },
    async list() {
      return [...photos.values()];
    },
    async put(record) {
      if (this.fail === "put") throw Error("photo quota");
      const old = photos.get(record.id);
      if (old && old.digest !== record.digest) throw Error("collision");
      photos.set(record.id, record);
    },
    async pending() {
      return journal;
    },
    async saveJournal(v) {
      if (this.fail === "journal") throw Error("journal quota");
      if (journal && journal.id !== v.id)
        throw Error("other pending transaction");
      journal = structuredClone(v);
    },
    async promoteUndo(v) {
      if (this.fail === "promote") throw Error("promotion fault");
      undo = structuredClone(v);
      journal = { ...structuredClone(v), phase: "committed" };
    },
    async clearJournal(id) {
      if (journal?.id === id) journal = null;
    },
    async undo() {
      return undo;
    },
  };
  const m = createMock({ storage, key: KEY, requireStorage: true });
  const src = fs.readFileSync(
      new URL("../src/screen.html", import.meta.url),
      "utf8",
    ),
    block = src.slice(
      src.indexOf("  const BK = {"),
      src.indexOf("  function backupSheet("),
    );
  const ctx = {
    TextEncoder,
    URL,
    localStorage: storage,
    window: { EOUL_MOCK_KEY: KEY },
    REG_KEY: "eoul-d12-hang:reg",
    CHAT_KEY: "eoul-d12-hang:consult",
    M: m,
  };
  vm.runInNewContext(block + ";globalThis.bk=BK", ctx);
  return {
    map,
    events,
    storage,
    repository,
    photos,
    m,
    bk: ctx.bk,
    fault: (f) => (failure = f),
    controller() {
      return api.createPhotoBackup({
        storage,
        repository,
        textBackup: ctx.bk,
        crypto: webcrypto,
      });
    },
  };
}
async function bundle() {
  const f = fixture(),
    g = f.m.addGarment({ kind: "shirt", color: "white" }),
    record = await api.photoRecord(
      png(),
      { role: "garment", width: 1, height: 1 },
      webcrypto,
    );
  await f.repository.put(record);
  f.m.updateGarmentPhoto(g.id, record.id);
  return { f, record, value: await f.controller().make() };
}

test("photo hashing is immutable and rejects URLs, wrong MIME, oversized data and forged hashes", async () => {
  const record = await api.photoRecord(
    png(),
    { role: "garment", width: 1, height: 1 },
    webcrypto,
  );
  assert.match(record.id, /^p_[a-f0-9]{64}$/);
  assert.equal(record.blob.size, png().size);
  assert.equal(record.role, "garment");
  let oversizedRead = false;
  await assert.rejects(
    () =>
      api.photoRecord(
        {
          size: api.MAX_PHOTO_BYTES + 1,
          type: "image/png",
          arrayBuffer: async () => {
            oversizedRead = true;
            return new ArrayBuffer(0);
          },
        },
        {},
        webcrypto,
      ),
    /8MB/,
  );
  assert.equal(
    oversizedRead,
    false,
    "oversized input is rejected before reading its bytes",
  );
  await assert.rejects(() =>
    api.photoRecord("https://seller.test/image.jpg", {}, webcrypto),
  );
  await assert.rejects(() =>
    api.photoRecord(
      new Blob(["<svg/>"], { type: "image/svg+xml" }),
      {},
      webcrypto,
    ),
  );
  const f = fixture(),
    c = f.controller();
  await assert.rejects(() =>
    c.read(
      JSON.stringify({
        app: "eoul-photo-backup",
        format: 1,
        text: f.bk.make(),
        photos: [{ ...record, blob: undefined, data: "AAAA" }],
      }),
    ),
  );
});
test("photo-inclusive export/read/preview preserve exact text and bytes, report missing and orphan references, and never write", async () => {
  const { f, record } = await bundle(),
    c = f.controller();
  f.m.updateGarmentPhoto(f.m.getState().closet[0].id, "p_" + "a".repeat(64));
  const raw = f.map.get(KEY),
    before = f.events.length;
  const value = await c.make(),
    read = await c.read(JSON.stringify(value)),
    plan = await c.preview(read);
  assert.equal(read.text.data[KEY], raw);
  assert.equal(plan.missing.length, 1);
  assert.equal(plan.orphans.length, 1);
  assert.equal(f.events.length, before);
  assert.equal((await f.repository.list())[0].id, record.id);
});
test("bundle restore on an empty device loads photos and exact wardrobe, then undo keeps original references and archives", async () => {
  const { value, record } = await bundle(),
    f = fixture(),
    c = f.controller();
  f.m.addGarment({ kind: "pants", color: "black" });
  const before = f.map.get(KEY);
  const result = await c.restore(await c.read(JSON.stringify(value)));
  assert.equal(result.complete, true);
  assert.equal(f.map.get(MARKER), undefined);
  assert.equal(f.map.get(KEY), value.text.data[KEY]);
  assert.equal(f.photos.get(record.id).blob.size, record.blob.size);
  assert.equal(
    createMock({ storage: f.storage, key: KEY }).getState().closet[0].photoId,
    record.id,
  );
  await c.undo();
  assert.equal(f.map.get(KEY), before);
  assert.equal(f.map.get(MARKER), undefined);
  assert.equal(f.photos.has(record.id), true);
});
test("journal or photo-write failure never overwrites the current wardrobe or previous undo point", async () => {
  const { value } = await bundle();
  for (const stage of ["journal", "put"]) {
    const f = fixture(),
      c = f.controller();
    f.m.addGarment({ kind: "pants" });
    const before = f.map.get(KEY);
    f.repository.fail = stage;
    await assert.rejects(() => c.restore(value));
    assert.equal(f.map.get(KEY), before);
    f.repository.fail = null;
    if (f.map.has(MARKER)) await c.recover();
    assert.equal(f.map.get(KEY), before);
    assert.equal(f.map.has(MARKER), false);
  }
});
test("text write or undo promotion failure retains a recoverable journal and restores original text on restart", async () => {
  const { value } = await bundle();
  for (const stage of ["text", "promote"]) {
    const f = fixture(),
      c = f.controller();
    f.m.addGarment({ kind: "pants" });
    const before = f.map.get(KEY);
    if (stage === "text") f.fault((op, k) => op === "set" && k === KEY);
    else f.repository.fail = "promote";
    await assert.rejects(() => c.restore(value));
    assert.ok(f.map.get(MARKER));
    assert.ok(await f.repository.pending());
    f.fault(null);
    f.repository.fail = null;
    await f.controller().recover();
    assert.equal(f.map.get(KEY), before);
    assert.equal(f.map.has(MARKER), false);
  }
});
test("marker cleanup failure is incomplete, then committed recovery finishes without reverting restored data", async () => {
  const { value } = await bundle(),
    f = fixture(),
    c = f.controller();
  f.m.addGarment({ kind: "pants" });
  f.fault((op, k) => op === "remove" && k === MARKER);
  await assert.rejects(() => c.restore(value));
  assert.equal(f.map.get(KEY), value.text.data[KEY]);
  assert.equal((await f.repository.pending()).phase, "committed");
  f.fault(null);
  await f.controller().recover();
  assert.equal(f.map.get(KEY), value.text.data[KEY]);
  assert.equal(f.map.has(MARKER), false);
});
test("a pending marker blocks new core/draft writes and new restore; malformed or missing recovery data is preserved", async () => {
  const f = fixture();
  f.m.addGarment({ kind: "shirt" });
  f.storage.setItem(MARKER, '{"v":99,"keep":"raw"}');
  const raw = f.map.get(KEY),
    count = f.events.length;
  assert.throws(
    () => f.m.addGarment({ kind: "pants" }),
    (e) => e.code === "photo_recovery_pending",
  );
  assert.equal(f.map.get(KEY), raw);
  assert.equal(f.events.length, count);
  const restarted = createMock({ storage: f.storage, key: KEY });
  assert.equal(restarted.storageIssue()?.code, "photo_recovery_pending");
  assert.equal(restarted.getState().closetCount, 1);
  await assert.rejects(() => f.controller().recover());
  assert.equal(f.map.get(MARKER), '{"v":99,"keep":"raw"}');
});
test("normal JSON restore never deletes photo blobs; bundle bytes/format/duplicates/foreign records are rejected before writes", async () => {
  const { f, record, value } = await bundle(),
    c = f.controller();
  f.bk.restore({ "eoul-d12-hang:ui": "{}" });
  assert.equal(f.photos.has(record.id), true);
  const count = f.events.length;
  for (const text of [
    "",
    '{"app":"other"}',
    JSON.stringify({ ...value, format: 99 }),
    JSON.stringify({ ...value, photos: [...value.photos, ...value.photos] }),
  ])
    await assert.rejects(() => c.read(text));
  assert.equal(f.events.length, count);
});

test("photos-only bundle preserves current text and does not pretend to restore an empty wardrobe", async () => {
  const source = fixture(),
    photo = await api.photoRecord(png(), { role: "body" }, webcrypto);
  await source.repository.put(photo);
  const value = await source.controller().make();
  assert.equal(value.mode, "photos-only");
  const target = fixture();
  target.m.addGarment({ kind: "pants" });
  const before = target.map.get(KEY);
  await target.controller().restore(value);
  assert.equal(target.map.get(KEY), before);
  assert.equal(target.photos.has(photo.id), true);
});
test("JSON restore and undo cannot bypass the photo recovery marker", () => {
  const f = fixture();
  f.m.addGarment({ kind: "shirt" });
  f.storage.setItem(MARKER, '{"v":1,"id":"held"}');
  const before = f.map.get(KEY),
    count = f.events.length;
  assert.throws(
    () => f.bk.restore({ "eoul-d12-hang:ui": "{}" }),
    (e) => e.code === "photo_recovery_pending",
  );
  assert.throws(
    () => f.bk.undo(),
    (e) => e.code === "photo_recovery_pending",
  );
  assert.equal(f.map.get(KEY), before);
  assert.equal(f.events.length, count);
});
test("a changed wardrobe or stash during undo preparation is preserved, never overwritten", async () => {
  for (const field of ["wardrobe", "stash"]) {
    const { value } = await bundle(),
      f = fixture(),
      c = f.controller();
    f.m.addGarment({ kind: "pants" });
    await c.restore(value);
    const save = f.repository.saveJournal.bind(f.repository);
    let changed;
    f.repository.saveJournal = async (v) => {
      await save(v);
      if (v.phase === "prepared") {
        if (field === "wardrobe") {
          const other = createMock({ storage: f.storage, key: KEY });
          other.setGender("F");
          changed = f.map.get(KEY);
        } else {
          changed = JSON.stringify({
            at: "2026-10-26T00:00:00Z",
            data: f.bk.snapshot(),
          });
          f.storage.setItem(f.bk.STASH, changed);
        }
      }
    };
    await assert.rejects(() => c.undo(), /바뀌어/);
    assert.equal(
      field === "wardrobe" ? f.map.get(KEY) : f.map.get(f.bk.STASH),
      changed,
    );
    assert.equal(f.map.has(MARKER), false);
  }
});
test("changes during asynchronous photo insertion abort text replacement without losing the newer state", async () => {
  const { value } = await bundle(),
    f = fixture(),
    c = f.controller();
  f.m.addGarment({ kind: "pants" });
  const put = f.repository.put.bind(f.repository);
  let changed;
  f.repository.put = async (row) => {
    await put(row);
    const state = JSON.parse(f.map.get(KEY));
    state.gender = "F";
    changed = JSON.stringify(state);
    f.storage.setItem(KEY, changed);
  };
  await assert.rejects(() => c.restore(value), /바뀌어/);
  assert.equal(f.map.get(KEY), changed);
  assert.equal(f.map.has(MARKER), false);
});
test("failed undo keeps a restart recovery point and all old/new immutable photos", async () => {
  const { value, record } = await bundle(),
    f = fixture(),
    c = f.controller();
  f.m.addGarment({ kind: "pants" });
  await c.restore(value);
  const before = f.map.get(KEY);
  f.fault((op, k) => op === "set" && k === KEY);
  await assert.rejects(() => c.undo());
  assert.ok(f.map.get(MARKER));
  f.fault(null);
  await f.controller().recover();
  assert.equal(f.map.get(KEY), before);
  assert.equal(f.photos.has(record.id), true);
  assert.equal(f.map.has(MARKER), false);
});

test("binary photo pack preserves original chunks and text without a base64 copy, and detects truncation/tampering", async () => {
  const { f, record } = await bundle(),
    c = f.controller(),
    file = await c.makeFile();
  assert.equal(file.type, "application/octet-stream");
  const before = f.events.length,
    read = await c.readFile(file),
    preview = await c.preview(read);
  assert.equal(read.format, 2);
  assert.equal(read.text.data[KEY], f.map.get(KEY));
  assert.equal(preview.photoCount, 1);
  assert.deepEqual(
    new Uint8Array(await read.photos[0].blob.arrayBuffer()),
    new Uint8Array(await record.blob.arrayBuffer()),
  );
  assert.equal(f.events.length, before);
  await assert.rejects(() => c.readFile(file.slice(0, file.size - 1)));
  const bytes = new Uint8Array(await file.arrayBuffer());
  bytes[bytes.length - 5] ^= 1;
  await assert.rejects(() => c.readFile(new Blob([bytes])), /해시/);
  const dest = fixture();
  await dest.controller().restore(await dest.controller().readFile(file));
  assert.equal(dest.map.get(KEY), read.text.data[KEY]);
  assert.equal(dest.photos.get(record.id).blob.size, record.blob.size);
});
test("photo metadata cannot be altered after verification and old journal cleanup cannot erase a new owner", async () => {
  const { value } = await bundle(),
    f = fixture(),
    c = f.controller(),
    read = await c.read(JSON.stringify(value));
  assert.throws(() => {
    read.photos[0].id = "p_" + "0".repeat(64);
  }, TypeError);
  const save = f.repository.saveJournal.bind(f.repository);
  await save({ id: "new-owner", phase: "prepared" });
  await f.repository.clearJournal("old-owner");
  assert.equal((await f.repository.pending()).id, "new-owner");
});

for (const query of [
  "?g=F",
  "?reset=1",
  "?closet=trial",
  "?g=F&reset=1&closet=trial",
]) {
  test(`pending photo recovery still initializes generated core at ${query}`, () => {
    const f = fixture();
    f.m.addGarment({ kind: "shirt", color: "white" });
    f.storage.setItem(MARKER, '{"v":1,"id":"bootstrap-held"}');
    const raw = f.map.get(KEY),
      events = f.events.length;
    const window = {
      localStorage: f.storage,
      EOUL_MOCK_KEY: KEY,
      location: {
        search: query,
        href: "http://localhost/" + query + "#/closet",
      },
      addEventListener() {},
    };
    const context = {
      window,
      location: window.location,
      URL,
      URLSearchParams,
      structuredClone,
      TextEncoder,
      console,
      history: {
        state: null,
        replaceState(_s, _t, url) {
          window.recoveryUrl = url;
        },
      },
    };
    const source = fs.readFileSync(
      new URL("../.generated/core-bundle.js", import.meta.url),
      "utf8",
    );
    assert.doesNotThrow(() => vm.runInNewContext(source, context));
    assert.equal(window.EoulMock.storageIssue().code, "photo_recovery_pending");
    assert.equal(window.EoulMock.getState().closetCount, 1);
    assert.match(window.EoulMock.boot.storageError, /사진/);
    assert.equal(f.map.get(KEY), raw);
    assert.equal(f.events.length, events);
    assert.equal(window.EoulMock.boot.reset, false);
    assert.equal(window.EoulMock.boot.closet, "");
    assert.doesNotMatch(window.recoveryUrl, /reset=|closet=|g=/);
  });
}
