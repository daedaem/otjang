import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { handleTryOn, TRYON_CONSENT } from "../functions/api/try-on.js";
import { createWorker } from "../worker.js";
import {
  memberStorageScope,
  ACCOUNT_HEADER,
} from "../src/domain/account-scope.js";
const picture =
  "data:image/jpeg;base64," +
  Buffer.from([255, 216, 255, 224, 1, 2, 3, 255, 217]).toString("base64");
function fixture() {
  const raw = new DatabaseSync(":memory:");
  const db = {
    prepare(sql) {
      let values = [];
      const st = {
        bind(...v) {
          values = v;
          return st;
        },
        async run() {
          return {
            meta: { changes: Number(raw.prepare(sql).run(...values).changes) },
          };
        },
        async first() {
          return raw.prepare(sql).get(...values) || null;
        },
      };
      return st;
    },
  };
  const env = {
    RANK_DB: db,
    TRYON_MODE: "private",
    FASHN_API_KEY: "qa-secret-never-return",
    TRYON_DAILY_CREDITS: "20",
    TRYON_MONTHLY_CREDITS: "40",
    TRYON_MEMBER_DAILY_CREDITS: "10",
  };
  let at = Date.UTC(2026, 9, 29),
    calls = [];
  let provider = async (url, init) => {
    calls.push({ url, init });
    return Response.json(
      url.endsWith("/run")
        ? { id: "qa-prediction-0123456789" }
        : { status: "completed", output: [picture] },
    );
  };
  const call = (
    method,
    path,
    body,
    actor = { member: "owner", owner: true },
    extra = {},
  ) =>
    handleTryOn(
      new Request("https://app.test/api/try-on/" + path, {
        method,
        headers: {
          origin: "https://app.test",
          "content-type": "application/json",
          ...extra.headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
      actor,
      { now: () => at, fetchImpl: (...args) => provider(...args) },
    );
  return {
    raw,
    env,
    calls,
    call,
    tick(ms = 4000) {
      at += ms;
    },
    setProvider(fn) {
      provider = fn;
    },
  };
}
const input = (requestId = crypto.randomUUID()) => ({
  requestId,
  person: picture,
  garment: picture,
  rightsConfirmed: true,
  consentVersion: TRYON_CONSENT,
});
test("try-on stays closed without explicit mode, key and three credit limits; no provider or tables", async () => {
  for (const field of [
    "TRYON_MODE",
    "FASHN_API_KEY",
    "TRYON_DAILY_CREDITS",
    "TRYON_MONTHLY_CREDITS",
    "TRYON_MEMBER_DAILY_CREDITS",
  ]) {
    const f = fixture();
    delete f.env[field];
    assert.equal((await f.call("POST", "jobs", input())).status, 503);
    assert.equal(f.calls.length, 0);
    assert.equal(
      f.raw
        .prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='tryon_jobs'")
        .get().n,
      0,
    );
  }
  const f = fixture();
  const res = await f.call("GET", "config");
  const text = await res.text();
  assert.ok(!text.includes(f.env.FASHN_API_KEY));
  assert.equal(JSON.parse(text).available, true);
  assert.equal((await f.call("GET", "config", null, {})).status, 401);
  assert.equal(
    (await f.call("GET", "config", null, { member: "another", owner: false }))
      .status,
    200,
  );
  assert.equal(
    (
      await (
        await f.call("GET", "config", null, { member: "another", owner: false })
      ).json()
    ).available,
    false,
  );
});
test("try-on requires same origin, explicit consent and rights, valid small JPEGs before reserving", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.call("POST", "jobs", input(), undefined, {
        headers: { origin: "https://outside.test" },
      })
    ).status,
    403,
  );
  for (const data of [
    { ...input(), rightsConfirmed: false },
    { ...input(), consentVersion: "old" },
    { ...input(), person: "https://internal.test/photo" },
    { ...input(), garment: picture + "?" },
    { ...input(), member: "owner" },
  ])
    assert.equal((await f.call("POST", "jobs", data)).status, 400);
  assert.equal(f.calls.length, 0);
  assert.equal(f.raw.prepare("SELECT COUNT(*) n FROM tryon_jobs").get().n, 0);
});
test("try-on reserves exactly three quality credits, never stores images, and returns one base64 result through owner check", async () => {
  const f = fixture(),
    body = input();
  assert.equal((await f.call("POST", "jobs", body)).status, 202);
  assert.equal(f.calls.length, 1);
  const request = JSON.parse(f.calls[0].init.body);
  assert.equal(request.inputs.return_base64, true);
  assert.equal(request.inputs.num_images, 1);
  assert.equal(request.inputs.resolution, "1k");
  assert.equal(request.model_name, "tryon-max");
  assert.equal(request.inputs.generation_mode, "quality");
  const row = f.raw.prepare("SELECT * FROM tryon_jobs").get();
  assert.equal(row.credits, 3);
  assert.ok(!JSON.stringify(row).includes(picture));
  assert.ok(!JSON.stringify(row).includes(f.env.FASHN_API_KEY));
  f.env.TRYON_MODE = "members";
  assert.equal(
    (
      await f.call("GET", "jobs/" + body.requestId, null, {
        member: "other",
        owner: false,
      })
    ).status,
    404,
  );
  assert.equal(f.calls.length, 1);
  const res = await f.call("GET", "jobs/" + body.requestId);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control"), /private, no-store/);
  const result = await res.json();
  assert.equal(result.image, picture);
  assert.equal(result.state, "completed");
  assert.ok(!JSON.stringify(result).includes("qa-prediction"));
});
test("try-on replays and simultaneous identical posts submit only once; changed payload gets 409", async () => {
  const f = fixture(),
    body = input();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => f.call("POST", "jobs", body)),
  );
  assert.ok(results.every((r) => [200, 202].includes(r.status)));
  assert.equal(f.calls.length, 1);
  assert.equal((await f.call("POST", "jobs", body)).status, 200);
  assert.equal(f.calls.length, 1);
  const other =
    "data:image/jpeg;base64," +
    Buffer.from([255, 216, 255, 224, 4, 5, 6, 255, 217]).toString("base64");
  assert.notEqual(other, picture);
  assert.equal(
    (await f.call("POST", "jobs", { ...body, garment: other })).status,
    409,
  );
  assert.equal(f.calls.length, 1);
});
test("try-on global/member budgets and active reservations cannot be exceeded across callers", async () => {
  const f = fixture();
  f.env.TRYON_MODE = "members";
  f.env.TRYON_DAILY_CREDITS = "6";
  f.env.TRYON_MONTHLY_CREDITS = "6";
  f.env.TRYON_MEMBER_DAILY_CREDITS = "3";
  const requests = await Promise.all(
    ["a", "b", "c", "d"].map((member) =>
      f.call("POST", "jobs", input(), { member, owner: false }),
    ),
  );
  assert.equal(requests.filter((r) => r.status === 202).length, 2);
  assert.equal(f.calls.length, 2);
  assert.equal(
    f.raw.prepare("SELECT SUM(credits) n FROM tryon_jobs").get().n,
    6,
  );
  assert.equal(
    (await f.call("POST", "jobs", input(), { member: "a", owner: false }))
      .status,
    429,
  );
});
test("try-on ambiguous transport failure is not automatically re-submitted or refunded", async () => {
  const f = fixture(),
    body = input();
  let sends = 0;
  f.setProvider(async () => {
    sends++;
    throw Error("private-error-with-photos");
  });
  const response = await f.call("POST", "jobs", body);
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("private-error"));
  assert.equal(
    (await (await f.call("POST", "jobs", body)).json()).state,
    "unknown",
  );
  assert.equal(
    (await (await f.call("GET", "jobs/" + body.requestId)).json()).state,
    "unknown",
  );
  assert.equal(sends, 1);
  assert.equal(
    f.raw.prepare("SELECT SUM(credits) n FROM tryon_jobs").get().n,
    3,
  );
});
test("try-on rate-limits result polling and rejects URL outputs without fetching them", async () => {
  const f = fixture(),
    body = input();
  await f.call("POST", "jobs", body);
  await f.call("GET", "jobs/" + body.requestId);
  await f.call("GET", "jobs/" + body.requestId);
  assert.equal(f.calls.length, 2);
  f.tick();
  f.setProvider(async () =>
    Response.json({
      status: "completed",
      output: ["https://arbitrary.test/private"],
    }),
  );
  assert.equal((await f.call("GET", "jobs/" + body.requestId)).status, 502);
  f.tick(3600001);
  assert.equal((await f.call("GET", "jobs/" + body.requestId)).status, 410);
});
test("Worker try-on path keeps authentication, same-origin and account-scope protection", async () => {
  const calls = [];
  const worker = createWorker({
    authorize: async () => ({ ok: false, status: 401 }),
    tryOn: async () => {
      calls.push(1);
      return Response.json({ ok: true });
    },
  });
  assert.equal(
    (await worker.fetch(new Request("https://app.test/api/try-on/config"), {}))
      .status,
    401,
  );
  assert.equal(calls.length, 0);
  const owner = createWorker({
    authorize: async () => ({ ok: true }),
    tryOn: async (_r, _e, actor) => {
      calls.push(actor);
      return Response.json(actor);
    },
  });
  const response = await owner.fetch(
    new Request("https://app.test/api/try-on/config"),
    {},
  );
  assert.deepEqual(await response.json(), { member: "owner", owner: true });
});
test("an account member cannot spend from a stale tab or pass a client-side owner identity", async () => {
  const f = fixture(),
    member = "a".repeat(32),
    calls = [];
  f.env.COMMUNITY_DB = f.env.RANK_DB;
  f.env.MEMBER_APP_MODE = "accounts";
  const worker = createWorker({
    member: async () => member,
    tryOn: async (_r, _e, actor) => {
      calls.push(actor);
      return Response.json(actor);
    },
  });
  const send = (headers = {}) =>
    worker.fetch(
      new Request("https://app.test/api/try-on/jobs", {
        method: "POST",
        headers: {
          origin: "https://app.test",
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ member: "owner", owner: true }),
      }),
      f.env,
    );
  assert.equal((await send()).status, 409);
  assert.equal((await send({ [ACCOUNT_HEADER]: "owner" })).status, 409);
  assert.equal(
    (
      await send({
        [ACCOUNT_HEADER]: await memberStorageScope(member),
        origin: "https://outside.test",
      })
    ).status,
    403,
  );
  assert.equal(calls.length, 0);
  assert.deepEqual(
    await (
      await send({ [ACCOUNT_HEADER]: await memberStorageScope(member) })
    ).json(),
    { member, owner: false },
  );
});
