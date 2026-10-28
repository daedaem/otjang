import test from "node:test";
import assert from "node:assert/strict";
import { createWorker } from "../worker.js";
import {
  handlePrivateAiCheck,
  CHECK_REQUESTS,
  CHECK_CANDIDATES,
} from "../functions/lib/private-ai-check.js";
import { handle } from "../functions/api/rank.js";
const URL = "https://app.test/_private/ai-check";
test("private AI check is owner only and render never enters a paid handler", async () => {
  for (const owner of [true, false])
    for (const member of [null, "qa-member"]) {
      let calls = 0;
      const worker = createWorker({
        authorize: async () =>
          owner ? { ok: true } : { ok: false, status: 401 },
        member: async () => member,
        rank: async () => {
          calls++;
          throw Error("paid");
        },
        garmentPhoto: async () => {
          calls++;
          throw Error("paid");
        },
      });
      const response = await worker.fetch(new Request(URL), {
        PRIVATE_AUTH_MODE: "session",
        MEMBER_APP_MODE: "invite",
      });
      assert.equal(response.status, owner ? 200 : member ? 403 : 401);
      assert.equal(calls, 0);
    }
});
test("GET page has no storage/core/photo repository and no secrets, with nonce CSP", async () => {
  const r = await handlePrivateAiCheck(new Request(URL)),
    html = await r.text();
  assert.match(r.headers.get("cache-control"), /no-store/);
  assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(html, /요청 시도 0 \/ 3/);
  assert.match(html, /used\.add\(kind\)/);
  assert.doesNotMatch(
    html,
    /localStorage|sessionStorage|indexedDB|EoulMock|\.key\b|ANTHROPIC_API_KEY|PRIVATE_APP_ACCESS_KEY/,
  );
  assert.match(html, /x-hangit-scope/);
  assert.match(html, /responseIdReturned/);
});
test("fixed public candidate requests are empty of wardrobe/history and stay within budget", () => {
  assert.ok(CHECK_CANDIDATES.length >= 2);
  assert.ok(
    CHECK_CANDIDATES.every(
      (p) =>
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        p.price <= 100000,
    ),
  );
  for (const request of Object.values(CHECK_REQUESTS)) {
    assert.deepEqual(request.closet, []);
    assert.ok(request.items.every((p) => p.closet === "옷장 정보 없음"));
  }
  assert.deepEqual(CHECK_REQUESTS.consult.history, []);
});
test("both seeded text requests pass the real gateway contract with synthetic provider responses", async () => {
  for (const [kind, body] of Object.entries(CHECK_REQUESTS)) {
    let used = 0;
    const messages = [];
    const answer =
      kind === "rank"
        ? {
            summary: "합성 검증",
            ranking: body.items.map((p) => ({
              id: p.id,
              reason: "수집 사실",
              fit: "추천",
            })),
          }
        : {
            on_topic: true,
            answer: "합성 상담",
            product_ids: [body.items[0].id],
          };
    const response = await handle(
      new Request("https://app.test/api/rank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      {},
      {
        authorize: async () => ({ ok: true }),
        reserve: async () => {
          used++;
          return { ok: true };
        },
        client: {
          messages: {
            create: async (request) => {
              messages.push(request);
              return {
                stop_reason: "end_turn",
                content: [{ type: "text", text: JSON.stringify(answer) }],
              };
            },
          },
        },
      },
    );
    assert.equal(response.status, 200);
    assert.equal(used, 1);
    assert.deepEqual(JSON.parse(messages[0].messages[0].content).closet, []);
  }
});
test("test page never accepts a POST that could implicitly call or reset a test", async () => {
  const r = await handlePrivateAiCheck(new Request(URL, { method: "POST" }));
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("allow"), "GET");
});
