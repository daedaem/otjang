import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createMock } from "../src/core.mjs";
test("rail read-model layout, roles and sort choices do not alter persisted state or core version", () => {
  const values = new Map();
  let writes = 0,
    notifications = 0;
  const m = createMock({
    storage: {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => {
        writes++;
        values.set(k, v);
      },
    },
    key: "rail-read",
    requireStorage: true,
  });
  const a = m.addGarment({ kind: "shirt", color: "white" });
  m.updateGarmentProfile(a.id, {
    v: 1,
    measures: { length: { cm: 30, source: "measured" } },
  });
  const b = m.addGarment({ kind: "pants", color: "black" });
  m.updateGarmentProfile(b.id, {
    v: 1,
    measures: { length: { cm: 140, source: "seller" } },
  });
  const before = [...values],
    count = writes,
    version = m.version();
  m.subscribe(() => notifications++);
  const garments = m.getState().closet;
  const layout = m.railLayout(garments, { sort: "recent", tallestPx: 196 });
  assert.equal(layout.rails.find((r) => r.id === "top").items[0].heightPx, 42);
  assert.equal(
    layout.rails.find((r) => r.id === "bottom").items[0].heightPx,
    196,
  );
  assert.equal(m.railCategory(garments[0]), "top");
  assert.equal(m.railSortChoices().length, 5);
  assert.deepEqual([...values], before);
  assert.equal(writes, count);
  assert.equal(m.version(), version);
  assert.equal(notifications, 0);
});
test("legacy own-photo placeholder does not request a lookalike or product image", () => {
  const source = fs.readFileSync(
    new URL("../src/browser/kit.js", import.meta.url),
    "utf8",
  );
  const fn = source.slice(
    source.indexOf("  function garmentImg("),
    source.indexOf("  // 조합 칸"),
  );
  let imageCalls = 0;
  const context = {
    M: {
      getState: () => ({ gender: "M" }),
      photo() {
        imageCalls++;
      },
      photoHtml() {
        imageCalls++;
      },
    },
    CUT: { "M|shirt|white": ["ms-728000"] },
    esc: (s) => String(s),
    productImg() {
      imageCalls++;
    },
    imgTag() {
      imageCalls++;
    },
  };
  vm.runInNewContext(fn + "\nglobalThis.render = garmentImg;", context);
  const html = context.render({
    id: "own",
    label: "내 셔츠",
    kind: "shirt",
    color: "white",
    photoId: "p_" + "a".repeat(64),
  });
  assert.match(html, /내 사진 연결됨/);
  assert.doesNotMatch(html, /<img|https?:/);
  assert.equal(imageCalls, 0);
});
