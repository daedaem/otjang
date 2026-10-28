// 코디 공유 회원 로그인(카카오·구글) 점검. 대표 10-28 11:47 "카카오+구글 둘 다", 14세 미만 받지 않음.
// 공급자 호출은 가짜 fetch로 대신한다(실제 키·네트워크·비용 없음). D1은 Node SQLite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleMemberAuth, memberFromRequest, memberLoginOptions } from '../functions/lib/member-session.js';

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
const env = (extra = {}) => ({
  CROWD_DB: fakeD1(), COMMUNITY_MODE: 'public', MEMBER_SESSION_SECRET: 's'.repeat(40),
  KAKAO_REST_KEY: 'kakao-rest', KAKAO_CLIENT_SECRET: 'kakao-secret', GOOGLE_CLIENT_ID: 'google-id.apps', GOOGLE_CLIENT_SECRET: 'google-secret', ...extra,
});
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const cookieOf = (res, name) => (res.headers.getSetCookie?.() || [res.headers.get('set-cookie')]).find((c) => c?.startsWith(`${name}=`));
const pair = (c) => c.split(';')[0];
// 공급자 흉내: 요청 기록을 남기고 정해 둔 답을 돌려준다.
function provider({ kakaoId = 4242, google = {}, fail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (fail) throw new Error('network');
    const u = new URL(String(url));
    if (u.host === 'kauth.kakao.com') return Response.json({ access_token: 'kakao-access', token_type: 'bearer' });
    if (u.host === 'kapi.kakao.com') return Response.json({ id: kakaoId });
    if (u.host === 'oauth2.googleapis.com') return Response.json({ id_token: `x.${b64u({ iss: 'https://accounts.google.com', aud: 'google-id.apps', sub: 'g-sub-1', exp: 9_999_999_999, ...google })}.y`, access_token: 'g' });
    return new Response('no', { status: 404 });
  };
  return { calls, fetchImpl };
}
const go = (e, path, init = {}, opts = {}) => handleMemberAuth(new Request(`${ORIGIN}${path}`, init), e, opts);
async function loginFlow(e, kind, p, { tamper } = {}) {
  const start = await go(e, `/_member/login/${kind}`);
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get('location'));
  const state = to.searchParams.get('state');
  const nonce = to.searchParams.get('nonce');
  const stateCookie = pair(cookieOf(start, '__Host-hangit-login') || '');
  const back = await go(e, `/_member/callback/${kind}?code=abc&state=${tamper ? 'wrong' : state}`, { headers: { cookie: stateCookie } }, { fetchImpl: p.fetchImpl, nonceCheck: nonce });
  return { start, to, back };
}

test('설정이 없으면 로그인 경로는 503, 커뮤니티가 public이 아니면 아무 경로도 답하지 않는다', async () => {
  const bare = await go({ CROWD_DB: fakeD1(), COMMUNITY_MODE: 'public' }, '/_member/login/kakao');
  assert.equal(bare.status, 503);
  assert.equal(await go(env({ COMMUNITY_MODE: 'private' }), '/_member/login/kakao'), null);
  assert.equal(await go(env({ COMMUNITY_MODE: undefined }), '/_member/login/kakao'), null);
  assert.deepEqual(memberLoginOptions(env()), { kakao: true, google: true, email: false });
  assert.deepEqual(memberLoginOptions(env({ GOOGLE_CLIENT_SECRET: '' })), { kakao: true, google: false, email: false });
  assert.deepEqual(memberLoginOptions(env({ MEMBER_SESSION_SECRET: 'short' })), { kakao: false, google: false, email: false });
});

test('카카오: 상태값을 맞춘 콜백만 회원 세션을 만들고, 공급자 id 원문은 저장하지 않는다', async () => {
  const e = env();
  const p = provider({ kakaoId: 987654321 });
  const { start, to, back } = await loginFlow(e, 'kakao', p);
  assert.equal(to.origin + to.pathname, 'https://kauth.kakao.com/oauth/authorize');
  assert.equal(to.searchParams.get('client_id'), 'kakao-rest');
  assert.equal(to.searchParams.get('redirect_uri'), `${ORIGIN}/_member/callback/kakao`);
  assert.equal(to.searchParams.get('response_type'), 'code');
  assert.equal(to.searchParams.has('scope'), false, '이메일·프로필을 요청하지 않는다');
  const sc = cookieOf(start, '__Host-hangit-login');
  assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Lax/); assert.match(sc, /Path=\//);
  assert.equal(back.status, 303);
  assert.equal(back.headers.get('location'), '/c');
  const session = cookieOf(back, '__Host-hangit-member');
  assert.match(session, /HttpOnly/); assert.match(session, /Secure/); assert.match(session, /SameSite=Lax/);
  // 토큰 교환은 서버 사이 POST이고 비밀키를 함께 보낸다.
  const token = p.calls.find((c) => c.url.startsWith('https://kauth.kakao.com/oauth/token'));
  assert.equal(token.init.method, 'POST');
  assert.match(String(token.init.body), /client_secret=kakao-secret/);
  const member = await memberFromRequest(new Request(`${ORIGIN}/api/community/status`, { headers: { cookie: pair(session) } }), e);
  assert.match(member, /^[0-9a-f]{32}$/);
  const dump = JSON.stringify(e.CROWD_DB.raw.prepare("SELECT * FROM member_sessions").all());
  assert.equal(dump.includes('987654321'), false);
  assert.equal(dump.includes(pair(session).split('=')[1]), false, '세션 토큰 원문도 저장하지 않는다');
  // 같은 카카오 계정은 같은 회원이다.
  const again = await loginFlow(e, 'kakao', provider({ kakaoId: 987654321 }));
  const m2 = await memberFromRequest(new Request(ORIGIN, { headers: { cookie: pair(cookieOf(again.back, '__Host-hangit-member')) } }), e);
  assert.equal(m2, member);
});

test('상태값이 다르거나 쿠키가 없으면 거절하고 공급자를 부르지 않는다', async () => {
  const e = env();
  const p = provider();
  const { back } = await loginFlow(e, 'kakao', p, { tamper: true });
  assert.equal(back.status, 400);
  assert.equal(p.calls.length, 0);
  const noCookie = await go(e, '/_member/callback/kakao?code=abc&state=x', {}, { fetchImpl: p.fetchImpl });
  assert.equal(noCookie.status, 400);
});

test('구글: PKCE와 nonce를 쓰고, 받는 쪽(aud)·발급자·만료·nonce가 맞아야 한다. 카카오와 다른 회원이다', async () => {
  const e = env();
  const ok = await loginFlow(e, 'google', provider());
  assert.equal(ok.to.origin + ok.to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(ok.to.searchParams.get('scope'), 'openid');
  assert.equal(ok.to.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(ok.to.searchParams.get('code_challenge'));
  assert.ok(ok.to.searchParams.get('nonce'));
  // 구글 콜백은 nonce가 id_token에 들어 있어야 한다: 가짜 공급자가 로그인 때 받은 nonce를 돌려주게 한다.
  const start = await go(e, '/_member/login/google');
  const to = new URL(start.headers.get('location'));
  const sc = pair(cookieOf(start, '__Host-hangit-login'));
  const right = provider({ google: { nonce: to.searchParams.get('nonce') } });
  const good = await go(e, `/_member/callback/google?code=c&state=${to.searchParams.get('state')}`, { headers: { cookie: sc } }, { fetchImpl: right.fetchImpl });
  assert.equal(good.status, 303);
  const tokenCall = right.calls.find((c) => c.url.startsWith('https://oauth2.googleapis.com/token'));
  assert.match(String(tokenCall.init.body), /code_verifier=/);
  const g = await memberFromRequest(new Request(ORIGIN, { headers: { cookie: pair(cookieOf(good, '__Host-hangit-member')) } }), e);
  const k = await loginFlow(e, 'kakao', provider());
  const km = await memberFromRequest(new Request(ORIGIN, { headers: { cookie: pair(cookieOf(k.back, '__Host-hangit-member')) } }), e);
  assert.ok(g && km && g !== km);
  for (const bad of [{ aud: 'someone-else' }, { iss: 'https://evil.test' }, { exp: 1 }, { nonce: 'wrong' }]) {
    const s = await go(e, '/_member/login/google');
    const t = new URL(s.headers.get('location'));
    const r = await go(e, `/_member/callback/google?code=c&state=${t.searchParams.get('state')}`, { headers: { cookie: pair(cookieOf(s, '__Host-hangit-login')) } }, { fetchImpl: provider({ google: { nonce: t.searchParams.get('nonce'), ...bad } }).fetchImpl });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(cookieOf(r, '__Host-hangit-member'), undefined);
  }
});

test('공급자 연결이 실패하면 502이고 세션을 만들지 않는다. 사용자가 취소하면 /c로 돌아간다', async () => {
  const e = env();
  const { back } = await loginFlow(e, 'kakao', provider({ fail: true }));
  assert.equal(back.status, 502);
  assert.equal(e.CROWD_DB.raw.prepare("SELECT COUNT(*) AS n FROM member_sessions").get().n, 0);
  const s = await go(e, '/_member/login/kakao');
  const t = new URL(s.headers.get('location'));
  const cancel = await go(e, `/_member/callback/kakao?error=access_denied&state=${t.searchParams.get('state')}`, { headers: { cookie: pair(cookieOf(s, '__Host-hangit-login')) } });
  assert.equal(cancel.status, 303);
  assert.equal(cancel.headers.get('location'), '/c');
});

test('로그아웃은 같은 출처 POST만, 세션을 지우고 쿠키를 비운다. 만료된 세션은 회원이 아니다', async () => {
  const e = env();
  const { back } = await loginFlow(e, 'kakao', provider());
  const cookie = pair(cookieOf(back, '__Host-hangit-member'));
  const cross = await go(e, '/_member/logout', { method: 'POST', headers: { cookie, origin: 'https://evil.test' } });
  assert.equal(cross.status, 403);
  const out = await go(e, '/_member/logout', { method: 'POST', headers: { cookie, origin: ORIGIN } });
  assert.equal(out.status, 200);
  assert.match(cookieOf(out, '__Host-hangit-member'), /Max-Age=0/);
  assert.equal(await memberFromRequest(new Request(ORIGIN, { headers: { cookie } }), e), null);
  const later = await loginFlow(e, 'kakao', provider());
  const c2 = pair(cookieOf(later.back, '__Host-hangit-member'));
  assert.equal(await memberFromRequest(new Request(ORIGIN, { headers: { cookie: c2 } }), e, { now: () => Date.now() + 31 * 86400_000 }), null);
});

// 이메일 인증 코드 가입·로그인(대표 10-28 12:25 "이메일·이름으로도 가입", 12:26 "인증 메일로 확인").
// 비밀번호 없이 6자리 코드. 이메일 원문은 저장하지 않는다. 발송은 Resend(RESEND_API_KEY) 또는 Cloudflare EMAIL 바인딩.
const emailEnv = (extra = {}) => env({ KAKAO_REST_KEY: '', GOOGLE_CLIENT_ID: '', EMAIL_FROM: 'Hangit <no-reply@hangit.test>', RESEND_API_KEY: 're_test', ...extra });
function mailbox() {
  const sent = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url) === 'https://api.resend.com/emails') { sent.push(JSON.parse(init.body)); return Response.json({ id: 'm1' }); }
    return new Response('no', { status: 404 });
  };
  return { sent, fetchImpl, code: () => /(\d{6})/.exec(sent.at(-1)?.text || '')?.[1] };
}
const post = (e, path, body, opts = {}, headers = {}) => go(e, path, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers }, body: JSON.stringify(body) }, opts);

test('이메일: 설정이 있어야 켜지고, 코드를 보내고, 맞는 코드면 회원 세션을 준다. 이메일 원문은 저장하지 않는다', async () => {
  assert.deepEqual(memberLoginOptions(env({ KAKAO_REST_KEY: '', GOOGLE_CLIENT_ID: '' })), { kakao: false, google: false, email: false });
  assert.equal(memberLoginOptions(emailEnv()).email, true);
  assert.equal(memberLoginOptions(emailEnv({ RESEND_API_KEY: '', EMAIL: { send: async () => {} } })).email, true);
  const e = emailEnv();
  const box = mailbox();
  const start = await post(e, '/_member/email/start', { email: ' Me@Example.COM ' }, { fetchImpl: box.fetchImpl });
  assert.equal(start.status, 200);
  assert.equal(box.sent.length, 1);
  assert.deepEqual(box.sent[0].to, ['me@example.com']);
  assert.equal(box.sent[0].from, 'Hangit <no-reply@hangit.test>');
  assert.match(box.sent[0].text, /\d{6}/);
  const wrong = await post(e, '/_member/email/verify', { email: 'me@example.com', code: '000000' === box.code() ? '111111' : '000000' });
  assert.equal(wrong.status, 400);
  const ok = await post(e, '/_member/email/verify', { email: 'ME@example.com', code: box.code() });
  assert.equal(ok.status, 200);
  const cookie = pair(cookieOf(ok, '__Host-hangit-member'));
  const member = await memberFromRequest(new Request(ORIGIN, { headers: { cookie } }), e);
  assert.match(member, /^[0-9a-f]{32}$/);
  const dump = JSON.stringify(['member_sessions', 'member_email_codes'].map((t) => e.CROWD_DB.raw.prepare(`SELECT * FROM ${t}`).all()));
  assert.equal(/example\.com/i.test(dump), false);
  // 코드는 한 번만 쓴다.
  assert.equal((await post(e, '/_member/email/verify', { email: 'me@example.com', code: box.code() })).status, 400);
  // 같은 이메일로 다시 들어오면 같은 회원이다.
  const box2 = mailbox();
  await post(e, '/_member/email/start', { email: 'me@example.com' }, { fetchImpl: box2.fetchImpl });
  const again = await post(e, '/_member/email/verify', { email: 'me@example.com', code: box2.code() });
  assert.equal(await memberFromRequest(new Request(ORIGIN, { headers: { cookie: pair(cookieOf(again, '__Host-hangit-member')) } }), e), member);
});

test('이메일: 틀린 코드 5번이면 그 코드는 끝나고, 10분이 지나면 만료된다. 다른 출처 요청은 막는다', async () => {
  const e = emailEnv();
  const box = mailbox();
  await post(e, '/_member/email/start', { email: 'a@b.test' }, { fetchImpl: box.fetchImpl });
  const right = box.code();
  const bad = right === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) assert.equal((await post(e, '/_member/email/verify', { email: 'a@b.test', code: bad })).status, 400);
  assert.equal((await post(e, '/_member/email/verify', { email: 'a@b.test', code: right })).status, 400, '5번 틀리면 맞는 코드도 거절');
  const box2 = mailbox();
  await post(e, '/_member/email/start', { email: 'a@b.test' }, { fetchImpl: box2.fetchImpl });
  const late = await post(e, '/_member/email/verify', { email: 'a@b.test', code: box2.code() }, { now: () => Date.now() + 11 * 60_000 });
  assert.equal(late.status, 400);
  assert.equal((await post(e, '/_member/email/start', { email: 'a@b.test' }, { fetchImpl: box.fetchImpl }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await post(e, '/_member/email/start', { email: 'not-an-email' }, { fetchImpl: box.fetchImpl })).status, 400);
});

test('이메일: 한 주소에 한 시간 5통, 서버 전체 하루 상한(EMAIL_DAILY_MAX)을 넘기면 보내지 않는다. 발송 실패는 502', async () => {
  const e = emailEnv({ EMAIL_DAILY_MAX: '7' });
  const box = mailbox();
  for (let i = 0; i < 5; i++) assert.equal((await post(e, '/_member/email/start', { email: 'x@y.test' }, { fetchImpl: box.fetchImpl })).status, 200);
  const sixth = await post(e, '/_member/email/start', { email: 'x@y.test' }, { fetchImpl: box.fetchImpl });
  assert.equal(sixth.status, 429);
  assert.equal(box.sent.length, 5);
  assert.equal((await post(e, '/_member/email/start', { email: 'z1@y.test' }, { fetchImpl: box.fetchImpl })).status, 200);
  assert.equal((await post(e, '/_member/email/start', { email: 'z2@y.test' }, { fetchImpl: box.fetchImpl })).status, 200);
  assert.equal((await post(e, '/_member/email/start', { email: 'z3@y.test' }, { fetchImpl: box.fetchImpl })).status, 429);
  const broken = await post(emailEnv(), '/_member/email/start', { email: 'q@y.test' }, { fetchImpl: async () => new Response('down', { status: 500 }) });
  assert.equal(broken.status, 502);
});

test('이메일: Cloudflare EMAIL 바인딩이 있으면 그것으로 보낸다', async () => {
  const sent = [];
  const e = emailEnv({ RESEND_API_KEY: '', EMAIL: { send: async (m) => { sent.push(m); } } });
  assert.equal((await post(e, '/_member/email/start', { email: 'cf@y.test' })).status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'cf@y.test');
  assert.match(sent[0].text, /\d{6}/);
});
