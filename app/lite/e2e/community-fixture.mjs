// Local QA only: the real handlers run against in-memory SQLite, never production.
import { DatabaseSync } from "node:sqlite";
import { handleCommunity } from "../functions/api/community.js";
import { handleMemberAuth } from "../functions/lib/member-session.js";
import { createWorker } from "../worker.js";
export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  return {
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) {
          args = a;
          return st;
        },
        async first() {
          return db.prepare(sql).get(...args) ?? null;
        },
        async all() {
          return { results: db.prepare(sql).all(...args) };
        },
        execute() {
          const r = db.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
        async run() {
          return st.execute();
        },
      };
      return st;
    },
    async batch(statements) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const out = statements.map((s) => s.execute());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
export async function communityCall(
  env,
  section,
  body,
  who = { member: "owner", operator: true },
  options = {},
) {
  return communityRequest(env, "POST", section, body, who, options);
}
export async function communityRequest(
  env, method, section, body,
  who = { member: "owner", operator: true }, options = {},
) {
  return handleCommunity(
    new Request("https://qa.test/api/community/" + section, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "GET" || method === "HEAD" || body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    who,
    options,
  );
}
export async function serveCommunity(
  page,
  mode,
  extra = {},
  who = { member: "owner", operator: true },
  options = {},
) {
  const origin = options.origin || "http://127.0.0.1:8792";
  const env = {
      CROWD_DB: fakeD1(),
      COMMUNITY_DB: fakeD1(),
      COMMUNITY_MODE: mode,
      COMMUNITY_CONTACT: "contact@example.test",
      COMMUNITY_OPERATOR: "운영자(예시)",
      ...extra,
    },
    posted = [],
    mails = [];
  const standalone = options.standalone === true;
  await page.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    if (u.origin !== origin) return route.abort();
    if (options.communityChunkGate && /^\/react\/community-[^/]+\.js$/.test(u.pathname)) await options.communityChunkGate();
    if (options.blockChrome && /^\/react\/chrome-.*\.js$/.test(u.pathname))
      return route.abort();
    if (standalone) {
      if (req.method() === "POST" && u.pathname === "/api/community/posts") posted.push(JSON.parse(req.postDataBuffer().toString()));
      const runtime = {
        ...env,
        ASSETS: { async fetch(request) {
          const assetUrl = new URL(request.url);
          const asset = await route.fetch({ url: origin + assetUrl.pathname + assetUrl.search, method: "GET" });
          return new Response(await asset.body(), { status: asset.status(), headers: asset.headers() });
        } },
      };
      const worker = createWorker({
        authorize: async () => who.operator === true ? { ok: true } : { ok: false, status: 401 },
        member: async () => who.member || null,
        community: (request, runtime, identity) => handleCommunity(request, runtime, identity, options.now ? { now: options.now } : {}),
        memberAuth: (request, runtime) => handleMemberAuth(request, runtime, { fetchImpl: async (_url, init) => { mails.push(JSON.parse(init.body)); return Response.json({ id: "qa-mail" }); } }),
      });
      const body = req.postDataBuffer();
      const response = await worker.fetch(new Request(u.href, {
        method: req.method(), headers: await req.allHeaders(),
        body: body && req.method() !== "GET" && req.method() !== "HEAD" ? body : undefined,
      }), runtime);
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    }
    if (u.pathname.startsWith("/_member/")) {
      const body = req.postDataBuffer();
      const res = await handleMemberAuth(
        new Request(u.href, {
          method: req.method(),
          headers: { "content-type": "application/json", origin: u.origin },
          body: body && req.method() !== "GET" ? body : undefined,
        }),
        env,
        {
          fetchImpl: async (_url, init) => {
            mails.push(JSON.parse(init.body));
            return Response.json({ id: "m" });
          },
        },
      );
      return route.fulfill({
        status: res.status,
        headers: Object.fromEntries(res.headers),
        body: Buffer.from(await res.arrayBuffer()),
      });
    }
    if (u.pathname.startsWith("/api/community/")) {
      const body = req.postDataBuffer();
      if (req.method() === "POST" && u.pathname.endsWith("/posts"))
        posted.push(JSON.parse(body.toString()));
      const res = await handleCommunity(
        new Request(u.href, {
          method: req.method(),
          headers: { "content-type": "application/json" },
          body: body && req.method() !== "GET" ? body : undefined,
        }),
        env,
        who,
        options.now ? { now: options.now } : {},
      );
      return route.fulfill({
        status: res.status,
        headers: Object.fromEntries(res.headers),
        body: Buffer.from(await res.arrayBuffer()),
      });
    }
    if (u.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"code":"not_configured"}',
      });
    return route.continue();
  });
  await page.goto(origin + (options.start || "/?photos=0#/"));
  if (standalone) await page.locator("[data-react-community]").waitFor({ state: "visible" });
  else await page.waitForFunction(() => !!window.K?.M);
  return { posted, env, mails };
}
export async function otherPost(env, text) {
  const who = { member: "b", operator: false };
  await communityCall(
    env,
    "join",
    { name: "비회원", rules: 1, age14: true },
    who,
  );
  await communityCall(
    env,
    "posts",
    {
      post: {
        text,
        pieces: [
          { kind: "coat", color: "beige", label: "베이지 코트" },
          { kind: "jeans", color: "indigo", label: "청바지" },
        ],
        consent: false,
      },
      photos: [],
    },
    who,
  );
}
