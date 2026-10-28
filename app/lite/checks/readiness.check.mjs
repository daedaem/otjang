import test from "node:test";
import assert from "node:assert/strict";
import {
  handleReadiness,
  readinessSnapshot,
} from "../functions/lib/readiness.js";
import { createWorker } from "../worker.js";
const url = "https://app.test/_private/readiness";
test("password account setup is configuration, not a claim of real login or role ownership",async()=>{
  const db={prepare(){throw Error('no account rows may be read');}};
  const snapshot=await readinessSnapshot(new Request(url),{MEMBER_APP_MODE:'accounts',COMMUNITY_DB:db,ASSETS:{fetch:async()=>Response.json({commit:'a'.repeat(40)})}});
  assert.deepEqual(snapshot.accountLogin,{enabled:true,configured:true,realSignin:'not_checked'});
  assert.equal(snapshot.invite.configured,true);
});
function fixture() {
  const statements = [];
  const db = {
    prepare(sql) {
      statements.push(sql);
      return { first: async () => ({ ok: 1 }) };
    },
  };
  const env = {
    PRIVATE_AUTH_MODE: "session",
    MEMBER_APP_MODE: "invite",
    COMMUNITY_MODE: "private",
    CROWD_DB: db,
    RANK_DB: db,
    ANTHROPIC_API_KEY: "NEVER_EXPOSE_KEY",
    PRIVATE_APP_ACCESS_KEY: "NEVER_EXPOSE_PASSWORD",
    COMMUNITY_OPERATOR: "NEVER_EXPOSE_NAME",
    COMMUNITY_CONTACT: "NEVER_EXPOSE_CONTACT",
    ASSETS: { fetch: async () => Response.json({ commit: "a".repeat(40) }) },
  };
  return { env, statements };
}
test("readiness rejects guest/member before DB reads and reveals no configuration", async () => {
  for (const id of [null, "qa-member"]) {
    const { env, statements } = fixture();
    const worker = createWorker({
      authorize: async () => ({ ok: false, status: 401 }),
      member: async () => id,
    });
    const r = await worker.fetch(
      new Request(url + "?format=json&probe=1"),
      env,
    );
    assert.ok(r.status === 401 || r.status === 403);
    assert.deepEqual(statements, []);
    assert.doesNotMatch(await r.text(), /NEVER_EXPOSE|claude-haiku/);
  }
});
test("owner readiness reports settings without calling providers or touching DB", async () => {
  const { env, statements } = fixture();
  const worker = createWorker({ authorize: async () => ({ ok: true }) });
  const r = await worker.fetch(new Request(url + "?format=json"), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  const text = await r.text(),
    o = JSON.parse(text);
  assert.equal(o.ai.configured, true);
  assert.equal(o.ai.provider, "not_checked");
  assert.equal(o.commit, "a".repeat(40));
  assert.deepEqual(statements, []);
  assert.doesNotMatch(text, /NEVER_EXPOSE/);
  assert.deepEqual(o.community.publicMissing, ["database", "login"]);
});
test("explicit connection probe is deduplicated and SELECT only", async () => {
  const { env, statements } = fixture();
  const o = await readinessSnapshot(new Request(url + "?probe=1"), env);
  assert.equal(o.databases.budget.read, "ok");
  assert.equal(o.databases.members.read, "ok");
  assert.deepEqual(statements, ["SELECT 1 AS ok"]);
});
test("DB failure is reported without exception text or initialization", async () => {
  const { env } = fixture();
  env.CROWD_DB = env.RANK_DB = {
    prepare() {
      throw Error("NEVER_EXPOSE_SQL");
    },
  };
  const o = await readinessSnapshot(new Request(url + "?probe=1"), env);
  assert.equal(o.databases.budget.read, "failed");
  assert.doesNotMatch(JSON.stringify(o), /NEVER_EXPOSE/);
});
test("missing configuration is not success or launch approval", async () => {
  const o = await readinessSnapshot(new Request(url + "?probe=1"), {});
  assert.equal(o.ai.configured, false);
  assert.equal(o.databases.budget.read, "missing");
  assert.deepEqual(o.login, {
    kakao: false,
    google: false,
    email: false,
    provider: "not_checked",
  });
  assert.equal(o.catalog.rights, "not_confirmed");
  assert.equal(o.invite.realSignup, "not_checked");
});
test("page has nonce CSP, no environment values and no writes/private storage script", async () => {
  const { env } = fixture();
  const r = await handleReadiness(new Request(url), env),
    s = await r.text();
  assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(s, /DB 연결 확인/);
  assert.match(s, /owner_reported/);
  assert.doesNotMatch(
    s,
    /NEVER_EXPOSE|localStorage|sessionStorage|indexedDB\.open|location\.reload/,
  );
  assert.doesNotMatch(s, /\/api\/rank|\/api\/garment-photo|method:\s*['"]POST/);
});
test("readiness is GET only and invalid build metadata cannot inject HTML", async () => {
  const { env, statements } = fixture();
  assert.equal(
    (await handleReadiness(new Request(url, { method: "POST" }), env)).status,
    405,
  );
  env.ASSETS.fetch = async () =>
    Response.json({ commit: "</script><img src=x onerror=alert(1)>" });
  const r = await handleReadiness(new Request(url), env);
  assert.doesNotMatch(await r.text(), /<img src=x/);
  assert.deepEqual(statements, []);
});

test("invite readiness uses the same community database fallback as account handlers", async () => {
  const { env } = fixture();
  env.COMMUNITY_DB = env.CROWD_DB;
  delete env.CROWD_DB;
  const snapshot = await readinessSnapshot(new Request(url + "?probe=1"), env);
  assert.equal(snapshot.invite.configured, true);
  assert.equal(snapshot.databases.members.read, "ok");
});
