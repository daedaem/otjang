import test from "node:test";
import assert from "node:assert/strict";
import {
  accountStorage,
  installAccountBoundary,
} from "../src/browser/account-storage.js";
import {
  ACCOUNT_ACTIVE_KEY,
  accountNamespace,
  memberStorageScope,
} from "../src/domain/account-scope.js";
const A = "m-" + "a".repeat(32),
  B = "m-" + "b".repeat(32);
const memory = () => {
  const data = new Map(),
    reads = [];
  return {
    reads,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => {
      reads.push(k);
      return data.get(k) ?? null;
    },
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    dump: () => JSON.stringify([...data].sort()),
  };
};
test("owner keys remain byte-identical while members never read or overwrite legacy data", () => {
  const raw = memory();
  raw.setItem("eoul-data", "owner bytes");
  raw.setItem(ACCOUNT_ACTIVE_KEY, A);
  const a = accountStorage(raw, A);
  assert.equal(a.getItem("eoul-data"), null);
  assert.ok(!raw.reads.includes("eoul-data"));
  a.setItem("eoul-data", "A bytes");
  assert.equal(raw.getItem("eoul-data"), "owner bytes");
  raw.setItem(ACCOUNT_ACTIVE_KEY, "owner");
  const owner = accountStorage(raw, "owner");
  assert.equal(owner.getItem("eoul-data"), "owner bytes");
  assert.deepEqual(
    Array.from({ length: owner.length }, (_, i) => owner.key(i)),
    ["eoul-data"],
  );
});
test("member enumeration and removals stay inside that account including opaque backup keys", () => {
  const raw = memory();
  raw.setItem(ACCOUNT_ACTIVE_KEY, A);
  const a = accountStorage(raw, A);
  a.setItem("eoul-extra", "A");
  raw.setItem(ACCOUNT_ACTIVE_KEY, B);
  const b = accountStorage(raw, B);
  b.setItem("eoul-extra", "B");
  assert.equal(b.length, 1);
  assert.equal(b.key(0), "eoul-extra");
  b.removeItem("eoul-extra");
  raw.setItem(ACCOUNT_ACTIVE_KEY, A);
  assert.equal(a.getItem("eoul-extra"), "A");
});
test("account changes block reads, writes and backup enumeration without modifying raw data", () => {
  const raw = memory();
  raw.setItem(ACCOUNT_ACTIVE_KEY, A);
  const a = accountStorage(raw, A);
  a.setItem("eoul-data", "keep");
  raw.setItem(ACCOUNT_ACTIVE_KEY, B);
  const before = raw.dump();
  for (const fn of [
    () => a.getItem("eoul-data"),
    () => a.setItem("eoul-data", "bad"),
    () => a.removeItem("eoul-data"),
    () => a.length,
    () => a.key(0),
  ])
    assert.throws(fn, (e) => e.code === "account_changed");
  assert.equal(raw.dump(), before);
});
test("an account cannot address a physical foreign prefix or the active identity marker", () => {
  const raw = memory();
  raw.setItem(ACCOUNT_ACTIVE_KEY, A);
  const a = accountStorage(raw, A);
  for (const key of [ACCOUNT_ACTIVE_KEY, "hangit-account:" + B + ":eoul-data"])
    assert.throws(
      () => a.setItem(key, "bad"),
      (e) => e.code === "account_changed",
    );
  assert.equal(raw.length, 1);
});
test("photo namespaces preserve owner originals and separate both member repositories", () => {
  assert.equal(accountNamespace("owner", "legacy"), "legacy");
  assert.notEqual(accountNamespace(A, "legacy"), accountNamespace(B, "legacy"));
  assert.notEqual(accountNamespace(A, "legacy"), "legacy");
  assert.throws(() => accountNamespace("forged", "legacy"));
});
test("translated member storage events expose only that account's logical key", () => {
  const raw = memory();
  raw.setItem(ACCOUNT_ACTIVE_KEY, A);
  const a = accountStorage(raw, A);
  assert.equal(
    a.logicalEventKey("hangit-account:" + A + ":eoul-data"),
    "eoul-data",
  );
  assert.equal(a.logicalEventKey("hangit-account:" + B + ":eoul-data"), null);
  assert.equal(a.logicalEventKey("eoul-data"), null);
});
test("member storage tags are stable, distinct and never expose the account identifier", async () => {
  const a = await memberStorageScope("synthetic-user-A"),
    b = await memberStorageScope("synthetic-user-B");
  assert.equal(a, await memberStorageScope("synthetic-user-A"));
  assert.notEqual(a, b);
  assert.match(a, /^m-[a-f0-9]{32}$/);
  assert.doesNotMatch(a, /synthetic-user/);
});
test("preview account setup never opens browser storage or private photos", () => {
  let reads = 0;
  const win = {
    fetch: async () => new Response("ok"),
    Headers,
    Request,
    location: { href: "https://app.test/", origin: "https://app.test" },
    get localStorage() {
      reads++;
      throw Error("must not read");
    },
  };
  const doc = {
    querySelector: (sel) =>
      sel.includes("hangit-role")
        ? { content: "owner" }
        : sel.includes("hangit-storage-scope")
          ? { content: "owner" }
          : null,
  };
  const account = installAccountBoundary({ preview: true, win, doc });
  assert.equal(reads, 0);
  assert.throws(
    () => account.photoNamespace("legacy"),
    (e) => e.code === "preview",
  );
  assert.equal(reads, 0);
});
