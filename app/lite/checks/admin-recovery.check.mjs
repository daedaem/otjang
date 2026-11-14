// 대표 11-14 "어드민계정 기억이안나네요": 관리자 로그인 이메일·비밀번호를 잊었을 때의 복구.
// 대표가 Cloudflare에 직접 넣는 복구 비밀값(ADMIN_RECOVERY_KEY)을 아는 사람만, 기존 관리자 계정의
// 로그인 이메일·비밀번호를 새로 정한다. 관리자 한 명 구조·회원 id·옷장 범위는 그대로이고 기존 세션은 모두 끊긴다.
// 비밀값이 없으면 이 화면은 없는 주소다. 시도는 15분에 5번.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleMemberAccounts } from '../functions/lib/member-accounts.js';
const origin = 'https://app.test';
const KEY = 'recover-' + 'x'.repeat(32);
function fixture(extra = {}) {
  const raw = new DatabaseSync(':memory:');
  const st = (sql) => {
    let args = [];
    const s = {
      bind(...a) { args = a; return s; },
      async first() { return raw.prepare(sql).get(...args) ?? null; },
      async all() { return { results: raw.prepare(sql).all(...args) }; },
      async run() { return { meta: { changes: Number(raw.prepare(sql).run(...args).changes) } }; },
    };
    return s;
  };
  const db = { raw, prepare: st, async batch(list) { const out = []; raw.exec('BEGIN'); try { for (const x of list) out.push(await x.run()); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } return out; } };
  raw.exec('CREATE TABLE member_sessions (token_hash TEXT PRIMARY KEY, member TEXT NOT NULL, provider TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
  return { db, env: { COMMUNITY_DB: db, MEMBER_APP_MODE: 'accounts', MEMBER_SESSION_SECRET: 's'.repeat(40), ADMIN_RECOVERY_KEY: KEY, ...extra } };
}
const post = (path, body, o = origin) => new Request(origin + path, { method: 'POST', headers: { origin: o, 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function admin(f, email = 'old@example.com', password = 'old-password-1') {
  // 관리자 = 계정 하나 + app_primary_admin 한 행(최초 연결의 본인 인증은 primary-admin 검사가 따로 본다).
  f.db.raw.exec("CREATE TABLE IF NOT EXISTS app_primary_admin (slot INTEGER PRIMARY KEY CHECK(slot=1), member TEXT NOT NULL UNIQUE, linked_at INTEGER NOT NULL)");
  await handleMemberAccounts(new Request(origin + '/_member/signin'), f.env, {}); // 표 만들기
  f.db.raw.prepare("INSERT INTO member_invites (id, code, label, created_at) VALUES ('a0', 'ADMNADMN', '관리자', 1)").run();
  const r = await handleMemberAccounts(post('/_member/password/signup', { code: 'ADMN-ADMN', email, password, age14: true }), f.env, {});
  assert.equal(r.status, 200, `signup ${r.status}`);
  const member = f.db.raw.prepare("SELECT used_by FROM member_invites WHERE id = 'a0'").get().used_by;
  f.db.raw.prepare('INSERT INTO app_primary_admin VALUES (1, ?, 1)').run(member);
  return member;
}
const signin = (f, email, password) => handleMemberAccounts(post('/_member/password/signin', { email, password }), f.env, {});
const recover = (f, b, o) => handleMemberAccounts(post('/_member/admin-recovery', b, o), f.env, {});
const good = { key: KEY, email: 'new@example.com', password: 'new-password-1', confirm: 'new-password-1' };

test('with the recovery key the same administrator gets a new login, and old sessions end', async () => {
  const f = fixture();
  const member = await admin(f);
  f.db.raw.prepare("INSERT INTO member_sessions VALUES ('t1', ?, 'password', 1, 9e15)").run(member);
  const r = await recover(f, good);
  assert.equal(r.status, 200);
  assert.equal(f.db.raw.prepare('SELECT member FROM app_primary_admin').get().member, member);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) AS n FROM member_sessions WHERE member = ?').get(member).n, 0);
  assert.equal((await signin(f, 'old@example.com', 'old-password-1')).status, 401);
  const ok = await signin(f, 'new@example.com', 'new-password-1');
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).scope, 'owner');
});

test('a wrong key changes nothing and attempts are limited', async () => {
  const f = fixture();
  await admin(f);
  for (let i = 0; i < 5; i++) assert.equal((await recover(f, { ...good, key: 'wrong-' + 'y'.repeat(30) })).status, 403);
  assert.equal((await recover(f, good)).status, 429);
  assert.equal((await signin(f, 'old@example.com', 'old-password-1')).status, 200);
});

test('without a configured key, in other modes or from another site the page does not exist', async () => {
  for (const extra of [{ ADMIN_RECOVERY_KEY: undefined }, { ADMIN_RECOVERY_KEY: 'short' }, { MEMBER_APP_MODE: 'invite' }]) {
    const f = fixture(extra);
    const get = await handleMemberAccounts(new Request(origin + '/_member/admin-recovery'), f.env, {});
    assert.equal(get.status, 404);
    assert.equal((await recover(f, good)).status, 404);
  }
  const f = fixture();
  await admin(f);
  assert.equal((await recover(f, good, 'https://evil.test')).status, 403);
  assert.equal((await handleMemberAccounts(new Request(origin + '/_member/admin-recovery'), f.env, {})).status, 200);
});

test('bad input, no administrator yet or an email of another member are refused', async () => {
  const f = fixture();
  assert.equal((await recover(f, good)).status, 409); // 관리자가 없으면 최초 연결 화면을 쓴다
  const member = await admin(f);
  assert.equal((await recover(f, { ...good, confirm: 'different-1' })).status, 400);
  assert.equal((await recover(f, { ...good, password: 'short', confirm: 'short' })).status, 400);
  assert.equal((await recover(f, { ...good, email: 'not-an-email' })).status, 400);
  f.db.raw.prepare("INSERT INTO member_invites (id, code, label, created_at) VALUES ('i1', 'ABCDEFGH', '친구', 1)").run();
  const joined = await handleMemberAccounts(post('/_member/password/signup', { code: 'ABCD-EFGH', email: 'friend@example.com', password: 'friend-pass-1', age14: true }), f.env, {});
  assert.equal(joined.status, 200);
  assert.equal((await recover(f, { ...good, email: 'friend@example.com' })).status, 409);
  assert.equal((await signin(f, 'friend@example.com', 'friend-pass-1')).status, 200);
  assert.equal(f.db.raw.prepare('SELECT member FROM app_primary_admin').get().member, member);
});
