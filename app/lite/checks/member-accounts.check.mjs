// 초대 코드 + 이메일·비밀번호 회원(지인 테스트). 대표 10-28 15:11~15:12:
// "가입·로그인을 만들면 되잖아요", 초대 코드 있는 사람만, AI는 대표 빼고 하루 10번, 무신사 사진은 다른 회원에게 끔(추천대로).
// 외부 서비스·새 비용 없음. 비밀번호는 PBKDF2 해시만, 이메일은 비밀값 HMAC만 저장한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleMemberAccounts } from '../functions/lib/member-accounts.js';
import { memberFromRequest } from '../functions/lib/member-session.js';
import { reserveRankBudget } from '../functions/lib/rank-budget.js';
import { handlePrivateSession } from '../functions/lib/private-session.js';
import { createWorker } from '../worker.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  return {
    raw: db,
    prepare(sql) {
      let args = [];
      const st = { bind(...a) { args = a; return st; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        execute() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
        async run() { return st.execute(); } };
      return st;
    },
    async batch(s) { db.exec('BEGIN'); try { const o = s.map((x) => x.execute()); db.exec('COMMIT'); return o; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
const ORIGIN = 'https://hangit.test';
const env = (extra = {}) => { const d = fakeD1(); return { CROWD_DB: d, RANK_DB: d, MEMBER_APP_MODE: 'invite', ...extra }; };
const OWNER = { owner: true };
const cookieOf = (res) => (res.headers.getSetCookie?.() || []).find((c) => c.startsWith('__Host-hangit-member='));
const pair = (c) => c.split(';')[0];
const call = async (e, method, path, body, who = {}, headers = {}) => {
  const res = await handleMemberAccounts(new Request(`${ORIGIN}${path}`, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers }, body: body ? JSON.stringify(body) : undefined }), e, who);
  return res;
};
const json = async (res) => res.json();
async function invite(e, label = '민수') { return json(await call(e, 'POST', '/_member/invites', { label }, OWNER)); }
const signup = (e, code, extra = {}) => call(e, 'POST', '/_member/password/signup', { code, email: 'friend@example.com', password: 'correct-horse-1', age14: true, ...extra });

test('초대 모드가 아니면 아무 경로도 답하지 않는다', async () => {
  assert.equal(await handleMemberAccounts(new Request(`${ORIGIN}/_member/signup`), env({ MEMBER_APP_MODE: undefined }), {}), null);
});

test('본인만 초대 코드를 만들고 볼 수 있다. 가입 링크가 함께 나온다', async () => {
  const e = env();
  assert.equal((await call(e, 'POST', '/_member/invites', { label: 'x' }, {})).status, 403);
  const made = await invite(e);
  assert.match(made.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(made.link, `${ORIGIN}/_member/signup?code=${made.code}`);
  const page = await call(e, 'GET', '/_member/invites', null, OWNER);
  assert.equal(page.status, 200);
  assert.match(await page.text(), new RegExp(made.code));
});

test('초대 코드로 가입하면 회원 세션을 주고, 코드는 한 번만 쓴다. 이메일·비밀번호 원문은 저장하지 않는다', async () => {
  const e = env();
  const { code } = await invite(e);
  const ok = await signup(e, code);
  assert.equal(ok.status, 200);
  const member = await memberFromRequest(new Request(ORIGIN, { headers: { cookie: pair(cookieOf(ok)) } }), e);
  assert.match(member, /^[0-9a-f]{32}$/);
  assert.equal((await signup(e, code, { email: 'other@example.com' })).status, 400, '같은 코드는 다시 못 쓴다');
  const dump = JSON.stringify(e.CROWD_DB.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({ name }) => e.CROWD_DB.raw.prepare(`SELECT * FROM ${name}`).all()));
  assert.equal(/friend@example\.com/i.test(dump), false);
  assert.equal(dump.includes('correct-horse-1'), false);
  const list = await (await call(e, 'GET', '/_member/invites?format=json', null, OWNER)).json();
  assert.equal(list.items[0].used, true);
});

test('가입 조건: 만 14세 확인, 비밀번호 8자 이상, 이미 쓰는 이메일 거절, 취소한 코드 거절, 다른 출처 거절', async () => {
  const e = env();
  const a = await invite(e, 'a'), b = await invite(e, 'b'), c = await invite(e, 'c');
  assert.equal((await signup(e, a.code, { age14: false })).status, 400);
  assert.equal((await signup(e, a.code, { password: 'short' })).status, 400);
  assert.equal((await signup(e, a.code)).status, 200);
  assert.equal((await signup(e, b.code, { email: 'FRIEND@example.com' })).status, 409);
  await call(e, 'POST', '/_member/invites/revoke', { code: c.code }, OWNER);
  assert.equal((await signup(e, c.code, { email: 'c@example.com' })).status, 400);
  assert.equal((await call(e, 'POST', '/_member/password/signup', { code: b.code, email: 'b@example.com', password: 'abcdefgh1', age14: true }, {}, { origin: 'https://evil.test' })).status, 403);
});

test('로그인: 맞는 비밀번호만, 15분에 10번 틀리면 잠시 막는다', async () => {
  const e = env();
  const { code } = await invite(e);
  await signup(e, code);
  const signin = (password, email = 'friend@example.com') => call(e, 'POST', '/_member/password/signin', { email, password });
  const good = await signin('correct-horse-1');
  assert.equal(good.status, 200);
  assert.ok(cookieOf(good));
  assert.equal((await signin('wrong-password')).status, 401);
  for (let i = 0; i < 9; i++) await signin('wrong-password');
  assert.equal((await signin('correct-horse-1')).status, 429);
  assert.equal((await signin('whatever1', 'nobody@example.com')).status, 401);
});

test('내 계정 지우기: 계정과 세션을 지운다', async () => {
  const e = env();
  const { code } = await invite(e);
  const ok = await signup(e, code);
  const cookie = pair(cookieOf(ok));
  const member = await memberFromRequest(new Request(ORIGIN, { headers: { cookie } }), e);
  const del = await call(e, 'POST', '/_member/account/delete', { confirm: true }, { member }, { cookie });
  assert.equal(del.status, 200);
  assert.equal(await memberFromRequest(new Request(ORIGIN, { headers: { cookie } }), e), null);
  assert.equal(e.CROWD_DB.raw.prepare('SELECT COUNT(*) AS n FROM member_accounts').get().n, 0);
});

test('AI: 회원은 하루 10번(MEMBER_AI_DAILY), 본인은 회원 한도와 무관하다', async () => {
  const e = env({ DAILY_LIMIT: '100', MONTHLY_LIMIT: '300', MINUTE_LIMIT: '100' });
  for (let i = 0; i < 10; i++) assert.equal((await reserveRankBudget(e, { member: 'm1' })).ok, true);
  const over = await reserveRankBudget(e, { member: 'm1' });
  assert.deepEqual([over.ok, over.status, over.code], [false, 429, 'member_daily_limit']);
  assert.equal((await reserveRankBudget(e, { member: 'm2' })).ok, true);
  assert.equal((await reserveRankBudget(e)).ok, true, '본인');
  const tight = env({ DAILY_LIMIT: '100', MONTHLY_LIMIT: '300', MINUTE_LIMIT: '100', MEMBER_AI_DAILY: '2' });
  await reserveRankBudget(tight, { member: 'm' }); await reserveRankBudget(tight, { member: 'm' });
  assert.equal((await reserveRankBudget(tight, { member: 'm' })).code, 'member_daily_limit');
  // 전체 한도에 막히면 회원 사용량도 쓰지 않은 것으로 돌린다.
  const full = env({ DAILY_LIMIT: '1', MONTHLY_LIMIT: '300', MINUTE_LIMIT: '100' });
  assert.equal((await reserveRankBudget(full)).ok, true);
  assert.equal((await reserveRankBudget(full, { member: 'z' })).code, 'daily_limit');
  assert.equal(full.CROWD_DB.raw.prepare("SELECT COUNT(*) AS n FROM member_ai_usage WHERE member = 'z'").get().n, 0);
});

test('본인 로그인 화면에 초대받은 분 로그인 링크가 초대 모드에서만 보인다', async () => {
  const page = async (extra) => (await handlePrivateSession(new Request(`${ORIGIN}/_private/login`), { PRIVATE_AUTH_MODE: 'session', ...extra })).text();
  assert.match(await page({ MEMBER_APP_MODE: 'invite' }), /href="\/_member\/signin"/);
  assert.doesNotMatch(await page({}), /_member\/signin/);
});

// Worker 경로.
const ASSETS = { fetch: async (req) => {
  const p = new URL(req.url).pathname;
  if (p === '/' || p === '/index.html') return new Response('<!doctype html><html><head><title>앱</title></head><body></body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (p === '/app.js') return new Response('js', { headers: { 'content-type': 'text/javascript' } });
  return new Response('nf', { status: 404 });
} };
function worker({ owner = false, member = null } = {}) {
  const seen = { rank: [], community: [], accounts: [] };
  const w = createWorker({
    authorize: async () => (owner ? { ok: true } : { ok: false, status: 401 }),
    member: async () => member,
    rank: async (req, e, opts) => { seen.rank.push(opts || null); return Response.json({ ok: true }); },
    community: async (req, e, who) => { seen.community.push(who); return Response.json({ ok: true }); },
    accounts: async (req, e, who) => { seen.accounts.push({ path: new URL(req.url).pathname, who }); return new Response('acc'); },
  });
  return { w, seen };
}
const go = (w, e, path, init = {}) => w.fetch(new Request(`${ORIGIN}${path}`, init), { ASSETS, PRIVATE_AUTH_MODE: 'session', ...e });

test('Worker: 초대 모드가 꺼져 있으면 회원 경로는 모두 본인 로그인 뒤에 있다', async () => {
  const { w, seen } = worker({ member: 'm1' });
  for (const p of ['/_member/signup', '/_member/signin', '/', '/api/rank']) assert.ok([303, 401].includes((await go(w, {}, p)).status), p);
  assert.equal(seen.accounts.length + seen.rank.length, 0);
});

test('Worker 초대 모드: 가입·로그인 화면은 로그인 없이, 앱은 회원 세션이 있어야 열린다', async () => {
  const e = { MEMBER_APP_MODE: 'invite' };
  const anon = worker();
  await go(anon.w, e, '/_member/signup');
  await go(anon.w, e, '/_member/signin');
  assert.deepEqual(anon.seen.accounts.map((x) => x.path), ['/_member/signup', '/_member/signin']);
  for (const p of ['/', '/api/rank', '/app.js', '/_member/account']) assert.ok([303, 401].includes((await go(anon.w, e, p)).status), p);
});

test('Worker 초대 모드: 회원 화면에는 회원 표시와 외부 사진 차단(CSP), AI는 회원 한도로, 초대 관리는 막는다', async () => {
  const e = { MEMBER_APP_MODE: 'invite' };
  const m = worker({ member: 'm1' });
  const page = await go(m.w, e, '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<meta name="hangit-role" content="member">/);
  assert.match(page.headers.get('content-security-policy') || '', /img-src 'self' data: blob:/);
  assert.equal((await go(m.w, e, '/app.js')).status, 200);
  await go(m.w, e, '/api/rank', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(m.seen.rank[0].member, 'm1');
  assert.equal((await m.seen.rank[0].authorize()).ok, true);
  await go(m.w, e, '/api/community/status');
  assert.deepEqual(m.seen.community[0], { member: 'm1', operator: false });
  assert.equal((await go(m.w, e, '/_member/invites')).status, 403);
  await go(m.w, e, '/_member/account');
  assert.deepEqual(m.seen.accounts.at(-1), { path: '/_member/account', who: { member: 'm1' } });
  const cross = await go(m.w, e, '/api/rank', { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(cross.status, 403);
});

test('Worker 초대 모드: 본인은 그대로이고 화면에 본인 표시가 붙으며 초대 관리를 연다', async () => {
  const e = { MEMBER_APP_MODE: 'invite' };
  const o = worker({ owner: true });
  const page = await go(o.w, e, '/');
  assert.match(await page.text(), /<meta name="hangit-role" content="owner">/);
  assert.doesNotMatch(page.headers.get('content-security-policy') || '', /img-src/);
  await go(o.w, e, '/api/rank', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(o.seen.rank[0], null, '본인 AI는 기존 그대로');
  await go(o.w, e, '/_member/invites');
  assert.deepEqual(o.seen.accounts.at(-1), { path: '/_member/invites', who: { owner: true } });
});
