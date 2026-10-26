import test from "node:test";
import assert from "node:assert/strict";
import { createMock } from "../src/core.mjs";
import {
  outfitFacts,
  attributeClaimCheck,
} from "../src/domain/outfit-facts.js";
import { handle, MODEL, CLIENT_OPTIONS } from "../functions/api/rank.js";
import fs from "node:fs";
import vm from "node:vm";
const api = await import("../src/domain/outfit-review.js").catch(() => ({}));
const allow = async () => ({ ok: true });
const reaction = {
  id: "r_test",
  garmentIds: ["shirt", "pants"],
  verdict: "like",
  reasons: ["good_color"],
  occasion: "work",
  at: "2026-10-27T00:00:00.000Z",
};
const request = () => ({
  task: "outfit_rank",
  context: {
    query: "내 옷 출근 코디",
    occasion: "work",
    season: "fall",
    styles: [],
  },
  garments: [
    {
      id: "shirt",
      kind: "shirt",
      slot: "m-oxford",
      color: "white",
      label: "내 첫 셔츠",
      profile: { v: 1, fabric: { value: "코튼", source: "chosen" } },
    },
    {
      id: "second",
      kind: "shirt",
      slot: "m-oxford",
      color: "blue",
      label: "내 둘째 셔츠",
    },
    {
      id: "pants",
      kind: "pants",
      slot: "m-chino",
      color: "beige",
      label: "내 바지",
    },
    {
      id: "shoes",
      kind: "sneaker",
      slot: "m-white-sneaker",
      color: "white",
      label: "내 신발",
    },
  ],
  outfits: [
    { id: "o_first", garmentIds: ["shirt", "pants", "shoes"] },
    { id: "o_second", garmentIds: ["second", "pants", "shoes"] },
  ],
  taste: [
    {
      outfitId: "o_first",
      likes: 1,
      dislikes: 0,
      reasons: [{ id: "good_color", count: 1 }],
    },
  ],
});
const post = (body) =>
  new Request("https://local.invalid/api/rank", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const output = () => ({
  summary: "확인된 내 옷 기준이에요.",
  ranking: [
    { id: "o_second", reason: "내 둘째 셔츠를 먼저 비교해 보세요." },
    { id: "o_first", reason: "내 첫 셔츠는 울 소재라 좋아요." },
  ],
});
const fake = (out) => {
  const calls = [];
  return {
    calls,
    messages: {
      async create(body) {
        calls.push(body);
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(out) }],
        };
      },
    },
  };
};
test("reaction envelope rejects future, damaged, duplicate fields and invalid reasons without normalizing history", () => {
  assert.equal(typeof api.readOutfitReactions, "function");
  assert.deepEqual(api.readOutfitReactions(null), { v: 1, reactions: [] });
  const bag = { v: 1, reactions: [reaction] },
    raw = " " + JSON.stringify(bag) + "\n";
  assert.deepEqual(api.readOutfitReactions(raw), bag);
  for (const text of [
    "broken",
    '{"v":99,"reactions":[]}',
    '{"v":99,"v":1,"reactions":[]}',
    JSON.stringify({ ...bag, future: true }),
    JSON.stringify({ v: 1, reactions: [reaction, reaction] }),
  ])
    assert.throws(() => api.readOutfitReactions(text));
});
test("missing classification and colour remain unknown facts, and ambiguous garment names do not produce attribute corrections", () => {
  const facts = outfitFacts({
    items: [{ kind: "shirt", color: null }],
    occasion: "work",
    season: "fall",
    styles: ["classic"],
  });
  assert.equal(facts.find((f) => f.dim === "color").verdict, "unknown");
  assert.equal(facts.find((f) => f.dim === "formality").verdict, "unknown");
  assert.equal(
    outfitFacts({
      items: [
        { slot: "m-oxford", color: "white" },
        { kind: "pants", color: null },
      ],
      occasion: "work",
    }).find((f) => f.dim === "formality").verdict,
    "unknown",
  );
  assert.deepEqual(
    attributeClaimCheck("셔츠는 울 소재예요.", [
      {
        name: "셔츠",
        profile: { v: 1, fabric: { value: "울", source: "chosen" } },
      },
      {
        name: "셔츠",
        profile: { v: 1, fabric: { value: "코튼", source: "chosen" } },
      },
    ]),
    [],
  );
});
test("owned outfit review creates text-only actual candidates without changing wardrobe or including trial photos", () => {
  const map = new Map(),
    storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
    },
    m = createMock({ storage, key: "eoul-d12-hang:v1", requireStorage: true });
  assert.equal(typeof m.outfitReview, "function");
  m.loadTrialCloset();
  assert.equal(m.outfitReview({}, { v: 1, reactions: [] }).request, null);
  for (const [kind, slot, color, label] of [
    ["shirt", "m-oxford", "white", "셔츠"],
    ["pants", "m-chino", "beige", "바지"],
    ["sneaker", "m-white-sneaker", "white", "신발"],
  ])
    m.addGarment({ kind, slot, color, label });
  const before = map.get("eoul-d12-hang:v1"),
    review = m.outfitReview({ occasion: "work" }, { v: 1, reactions: [] });
  assert.ok(review.request?.outfits.length);
  assert.equal(map.get("eoul-d12-hang:v1"), before);
  assert.equal(api.validateOutfitRequest(review.request), true);
  assert.ok(
    review.request.garments.every(
      (g) => !m.getState().closet.find((x) => x.id === g.id).trial,
    ),
  );
  for (const key of ["photoId", "photo", "img", "url", "data:image"])
    assert.ok(!JSON.stringify(review.request).includes(key));
});
test("outfit AI order and reasons come from one authenticated budgeted provider response with separate factual checks", async () => {
  const client = fake(output());
  let reservations = 0;
  const response = await handle(
      post(request()),
      {},
      {
        client,
        authorize: allow,
        reserve: async () => {
          reservations++;
          return { ok: true };
        },
      },
    ),
    body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(
    body.ranking.map((x) => x.id),
    ["o_second", "o_first"],
  );
  assert.match(body.ranking[1].reason, /울/);
  assert.ok(body.attribute_check.lines.some((x) => x.includes("코튼")));
  assert.equal(client.calls.length, 1);
  assert.equal(reservations, 1);
  assert.equal(client.calls[0].model, MODEL);
  assert.equal(client.calls[0].max_tokens, 2000);
  assert.equal(CLIENT_OPTIONS.maxRetries, 0);
  const text = client.calls[0].messages[0].content;
  assert.match(text, /편집 규칙/);
  assert.match(text, /직접 고름/);
  assert.ok(!text.includes("photo"));
});
test("outfit photo fields, invalid profiles, unknown slots and stale references consume no provider reservation", async () => {
  const client = fake(output());
  let reservations = 0;
  const invalid = [];
  for (const patch of [
    { photoId: "private-photo" },
    { img: "data:image/png;base64,secret" },
    { slot: "made-up" },
    { profile: { v: 99 } },
    { label: "data:image/png;base64,secret" },
  ]) {
    const b = request();
    Object.assign(b.garments[0], patch);
    invalid.push(b);
  }
  const missing = request();
  missing.outfits[0].garmentIds = ["missing", "pants"];
  invalid.push(missing);
  for (const b of invalid) {
    const response = await handle(
      post(b),
      {},
      {
        client,
        authorize: allow,
        reserve: async () => {
          reservations++;
          return { ok: true };
        },
      },
    );
    assert.equal(response.status, 400);
  }
  assert.equal(client.calls.length, 0);
  assert.equal(reservations, 0);
});
test("partial, duplicate or invented AI outfit ids cannot become a successful final ranking", async () => {
  for (const out of [
    { ...output(), ranking: [] },
    { ...output(), ranking: [output().ranking[0], output().ranking[0]] },
    { ...output(), ranking: [{ id: "o_invented", reason: "임의" }] },
    {
      ...output(),
      ranking: output().ranking.map((r) => ({ ...r, score: 100 })),
    },
  ]) {
    const response = await handle(
      post(request()),
      {},
      { client: fake(out), authorize: allow, reserve: allow },
    );
    assert.equal(response.status, 502);
  }
  const client = fake(output());
  assert.equal(
    (
      await handle(
        post(request()),
        {},
        {
          client,
          authorize: async () => ({ ok: false, status: 401 }),
          reserve: allow,
        },
      )
    ).status,
    401,
  );
  assert.equal(client.calls.length, 0);
  assert.equal(
    (
      await handle(
        post(request()),
        {},
        {
          client,
          authorize: allow,
          reserve: async () => ({
            ok: false,
            status: 429,
            code: "daily_limit",
          }),
        },
      )
    ).status,
    429,
  );
  assert.equal(client.calls.length, 0);
});
test("future reaction backup remains inert and keeps existing valid history with separate factual counts", () => {
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
    m = createMock(),
    key = "eoul-d12-hang:outfit-reactions:v1";
  const raw = " " + JSON.stringify({ v: 1, reactions: [reaction] }) + "\n";
  map.set(key, raw);
  const source = fs.readFileSync(
    new URL("../src/screen.html", import.meta.url),
    "utf8",
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
  vm.runInNewContext(
    source.slice(
      source.indexOf("  const BK = {"),
      source.indexOf("  function backupSheet("),
    ) + ";globalThis.bk=BK;",
    ctx,
  );
  const before = [...map],
    future = ' {"v":99,"reactions":[],"raw":"keep"} ',
    plan = ctx.bk.prepareRestore({ [key]: future }, ctx.bk.snapshot());
  assert.equal(plan.data[key], raw);
  assert.ok(Object.values(plan.data).includes(future));
  assert.deepEqual([...map], before);
  assert.equal(ctx.bk.count({ [key]: raw }).outfitReactions, 1);
  assert.match(ctx.bk.countText(ctx.bk.count({ [key]: raw })), /코디 반응 1개/);
});
test("request bounds, repeated combinations and invented taste counts are rejected before reserving budget", async () => {
  const invalid = [];
  for (const mutate of [
    (b) => (b.context.model = "override"),
    (b) => (b.context.styles = ["unknown"]),
    (b) => b.outfits.push({ ...b.outfits[0], id: "o_copy" }),
    (b) => b.garments.push({ ...b.garments[0], id: "unused" }),
    (b) => (b.taste[0].likes = 501),
    (b) => (b.taste[0].reasons[0].count = 2),
    (b) =>
      (b.garments[0].profile.measures = { length: { cm: 70, source: "ai" } }),
    (b) => (b.garments[0].slot = "m-chino"),
  ]) {
    const b = request();
    mutate(b);
    invalid.push(b);
  }
  let reservations = 0;
  const client = fake(output());
  for (const b of invalid)
    assert.equal(
      (
        await handle(
          post(b),
          {},
          {
            client,
            authorize: allow,
            reserve: async () => {
              reservations++;
              return { ok: true };
            },
          },
        )
      ).status,
      400,
    );
  assert.equal(reservations, 0);
  assert.equal(client.calls.length, 0);
});
test("text facts retain unconfirmed sources, explicit purpose and omitted-detail limits without modifying the original profile", () => {
  const b = request();
  b.garments[0].profile = {
    v: 1,
    fabric: { value: "코튼", source: "ai" },
    purpose: "collect",
    details: Array.from({ length: 20 }, (_, i) => ({
      text: "기록 디테일 " + i,
      source: "chosen",
    })),
  };
  const before = JSON.stringify(b.garments);
  const compact = api.buildOutfitRequest({
    context: b.context,
    garments: b.garments,
    outfits: b.outfits,
    reactions: [reaction],
  });
  assert.equal(compact.garments[0].profile.details.length, 6);
  assert.equal(compact.garments[0].omittedDetails, 14);
  assert.equal(JSON.stringify(b.garments), before);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(compact)).length <= 28 * 1024,
  );
  const facts = api.outfitReviewFacts(compact);
  assert.match(JSON.stringify(facts), /AI 추정 · 확인 전/);
  assert.match(JSON.stringify(facts), /소장/);
  assert.match(JSON.stringify(facts), /14개/);
  assert.match(facts.outfits[1].reactionBasis, /하나 이상 겹치는 과거 조합/);
  assert.ok(
    facts.outfits[1].facts.some((line) =>
      line.includes("이 후보만의 평가 수 아님"),
    ),
  );
});
test("invented image links in the AI output cannot be accepted as an outfit reason", async () => {
  const out = output();
  out.ranking[0].reason = "https://unknown.invalid/photo.jpg";
  const response = await handle(
    post(request()),
    {},
    { client: fake(out), authorize: allow, reserve: allow },
  );
  assert.equal(response.status, 502);
});

test("large profiles reduce the disclosed candidate set to bounded text without forwarding private photo fields", () => {
  const garments = Array.from({ length: 32 }, (_, i) => ({
    id: "g_" + i,
    kind: "shirt",
    slot: "m-oxford",
    color: "white",
    label: "기록된 셔츠 " + i,
    photoId: "private-photo-" + i,
    img: "data:image/png;base64,private",
    profile: {
      v: 1,
      fabric: { value: "코튼".repeat(15), source: "chosen" },
      silhouette: { value: "over", source: "chosen" },
      thickness: { value: "mid", source: "chosen" },
      surface: { value: "textured", source: "chosen" },
      pattern: { value: "check", source: "chosen" },
      details: Array.from({ length: 20 }, (_, n) => ({
        text: "설명".repeat(15) + n,
        source: "chosen",
      })),
    },
  }));
  const outfits = Array.from({ length: 8 }, (_, i) => ({
    id: "o_" + i,
    garmentIds: garments.slice(i * 4, i * 4 + 4).map((g) => g.id),
  }));
  const original = JSON.stringify(garments),
    sent = api.buildOutfitRequest({
      context: {},
      garments,
      outfits,
      reactions: [],
    });
  assert.ok(sent.outfits.length > 0 && sent.outfits.length <= 6);
  assert.ok(sent.garments.length <= 24);
  assert.ok(new TextEncoder().encode(JSON.stringify(sent)).length <= 28 * 1024);
  assert.ok(!JSON.stringify(sent).includes("private"));
  assert.equal(JSON.stringify(garments), original);
  assert.equal(api.validateOutfitRequest(sent), true);
});
