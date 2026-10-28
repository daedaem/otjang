// 코디 공유 회원 로그인(카카오·구글). 대표 10-28 11:47 "카카오+구글 둘 다".
// 본인 전용 로그인(private-session.js)과 따로다. 커뮤니티가 public일 때만 쓴다.
//
// 설정(Cloudflare, 키는 대표가 직접 넣는다. Claude·Git에는 없다):
//   MEMBER_SESSION_SECRET  32자 이상 무작위 값(회원 id와 상태값 서명)
//   KAKAO_REST_KEY, KAKAO_CLIENT_SECRET(선택)   카카오 개발자 앱
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET       구글 OAuth 클라이언트
//   리디렉션 주소: <사이트>/_member/callback/kakao, <사이트>/_member/callback/google
//
// 공급자에게 이메일·이름·프로필을 요청하지 않는다(카카오: 동의 항목 없이 회원번호만, 구글: openid만).
// 회원 id는 공급자 번호를 비밀값으로 HMAC한 값이다. 공급자 번호·세션 토큰 원문은 저장하지 않는다.
//   GET  /_member/login/kakao|google   → 공급자 로그인으로 302
//   GET  /_member/callback/kakao|google → 세션 쿠키를 주고 /c로 303
//   POST /_member/logout               → 세션 삭제(같은 출처만)
const STATE_COOKIE = '__Host-hangit-login';
const SESSION_COOKIE = '__Host-hangit-member';
const STATE_TTL = 10 * 60;
const SESSION_TTL = 30 * 24 * 60 * 60;
const HOME = '/c';
const encoder = new TextEncoder();
const HEADERS = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const KAKAO = { authorize: 'https://kauth.kakao.com/oauth/authorize', token: 'https://kauth.kakao.com/oauth/token', me: 'https://kapi.kakao.com/v2/user/me' };
const GOOGLE = { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', issuers: ['https://accounts.google.com', 'accounts.google.com'] };

const secretOf = (env) => (typeof env?.MEMBER_SESSION_SECRET === 'string' && env.MEMBER_SESSION_SECRET.length >= 32 ? env.MEMBER_SESSION_SECRET : null);
export function memberLoginOptions(env) {
  const ok = !!secretOf(env) && !!env?.CROWD_DB;
  return { kakao: ok && !!env.KAKAO_REST_KEY, google: ok && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET };
}

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const random = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(secret, context, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`hangit/${context}/v1\0${value}`)));
}
const sha256 = async (s) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s))));
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function cookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const setCookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const redirect = (status, location, extra = []) => {
  const headers = new Headers({ ...HEADERS, location });
  for (const c of extra) headers.append('set-cookie', c);
  return new Response(null, { status, headers });
};
const fail = (status, code, extra = []) => {
  const headers = new Headers({ ...HEADERS, 'content-type': 'application/json; charset=utf-8' });
  for (const c of extra) headers.append('set-cookie', c);
  return new Response(JSON.stringify({ code }), { status, headers });
};

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS member_sessions (token_hash TEXT PRIMARY KEY, member TEXT NOT NULL, provider TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS member_sessions_member ON member_sessions (member)',
  'CREATE INDEX IF NOT EXISTS member_sessions_expiry ON member_sessions (expires_at)',
];
const ready = new WeakSet();
async function ensureSchema(db) {
  if (ready.has(db)) return;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  ready.add(db);
}

// 상태 쿠키: {p 공급자, s 상태값, v PKCE 검증값, n nonce, e 만료}를 서명해 둔다. 서버 저장 없이 한 번의 왕복만 맞춘다.
async function packState(secret, data) {
  const body = b64u(encoder.encode(JSON.stringify(data)));
  return `${body}.${b64u(await hmac(secret, 'login-state', body))}`;
}
async function readState(secret, raw, nowSec) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig || !same(sig, b64u(await hmac(secret, 'login-state', body)))) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64u(body)));
    return data && data.e > nowSec ? data : null;
  } catch { return null; }
}

async function start(request, env, provider, nowSec) {
  const secret = secretOf(env);
  const origin = new URL(request.url).origin;
  const state = random(24), verifier = random(32), nonce = random(16);
  const cookie = setCookie(STATE_COOKIE, await packState(secret, { p: provider, s: state, v: verifier, n: nonce, e: nowSec + STATE_TTL }), STATE_TTL);
  const redirectUri = `${origin}/_member/callback/${provider}`;
  let url;
  if (provider === 'kakao') {
    url = new URL(KAKAO.authorize);
    url.search = new URLSearchParams({ client_id: env.KAKAO_REST_KEY, redirect_uri: redirectUri, response_type: 'code', state }).toString();
  } else {
    const challenge = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
    url = new URL(GOOGLE.authorize);
    url.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: 'openid', state, nonce,
      code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
    }).toString();
  }
  return redirect(302, url.href, [cookie]);
}

async function subjectFrom(provider, env, code, redirectUri, state, fetchImpl, nowSec) {
  const form = (o) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' }, body: new URLSearchParams(o).toString() });
  if (provider === 'kakao') {
    const params = { grant_type: 'authorization_code', client_id: env.KAKAO_REST_KEY, redirect_uri: redirectUri, code };
    if (env.KAKAO_CLIENT_SECRET) params.client_secret = env.KAKAO_CLIENT_SECRET;
    const t = await fetchImpl(KAKAO.token, form(params));
    const token = await t.json().catch(() => null);
    if (!t.ok || typeof token?.access_token !== 'string') return { error: 'token' };
    const me = await fetchImpl(KAKAO.me, { headers: { authorization: `Bearer ${token.access_token}` } });
    const body = await me.json().catch(() => null);
    if (!me.ok || !(typeof body?.id === 'number' || typeof body?.id === 'string')) return { error: 'profile' };
    return { subject: String(body.id) };
  }
  const t = await fetchImpl(GOOGLE.token, form({
    grant_type: 'authorization_code', client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri, code, code_verifier: state.v,
  }));
  const token = await t.json().catch(() => null);
  if (!t.ok || typeof token?.id_token !== 'string') return { error: 'token' };
  // 토큰 엔드포인트에서 TLS로 직접 받은 id_token이라 서명 대신 내용(발급자·받는 쪽·만료·nonce)을 확인한다(OIDC Core 3.1.3.7).
  let claims;
  try { claims = JSON.parse(new TextDecoder().decode(fromB64u(token.id_token.split('.')[1] || ''))); } catch { return { error: 'id_token' }; }
  const aud = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
  if (!GOOGLE.issuers.includes(claims?.iss) || !aud.includes(env.GOOGLE_CLIENT_ID) || !(Number(claims?.exp) > nowSec) ||
    claims?.nonce !== state.n || typeof claims?.sub !== 'string' || !claims.sub) return { error: 'id_token' };
  return { subject: claims.sub };
}

async function callback(request, env, provider, { fetchImpl, now }) {
  const secret = secretOf(env);
  const url = new URL(request.url);
  const nowMs = now(), nowSec = Math.floor(nowMs / 1000);
  const clear = setCookie(STATE_COOKIE, '', 0);
  await ensureSchema(env.CROWD_DB);
  const state = await readState(secret, cookies(request)[STATE_COOKIE], nowSec);
  if (!state || state.p !== provider || !same(String(url.searchParams.get('state') || ''), state.s)) return fail(400, 'invalid_state', [clear]);
  if (url.searchParams.get('error')) return redirect(303, HOME, [clear]); // 사용자가 취소함
  const code = url.searchParams.get('code');
  if (!code || code.length > 2048) return fail(400, 'invalid_request', [clear]);
  let found;
  try { found = await subjectFrom(provider, env, code, `${url.origin}/_member/callback/${provider}`, state, fetchImpl, nowSec); }
  catch { return fail(502, 'provider_unavailable', [clear]); }
  if (found.error) return fail(found.error === 'id_token' ? 400 : 502, found.error === 'id_token' ? 'invalid_token' : 'provider_error', [clear]);
  const member = hex(await hmac(secret, 'member', `${provider}|${found.subject}`)).slice(0, 32);
  const token = random(32);
  const db = env.CROWD_DB;
  await db.batch([
    db.prepare('DELETE FROM member_sessions WHERE expires_at <= ?1').bind(nowMs),
    db.prepare('INSERT INTO member_sessions (token_hash, member, provider, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(await sha256(token), member, provider, nowMs, nowMs + SESSION_TTL * 1000),
  ]);
  return redirect(303, HOME, [clear, setCookie(SESSION_COOKIE, token, SESSION_TTL)]);
}

// 요청의 회원 쿠키 → 회원 id(32자 hex) 또는 null.
export async function memberFromRequest(request, env, { now = Date.now } = {}) {
  const token = cookies(request)[SESSION_COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token) || !secretOf(env) || !env?.CROWD_DB) return null;
  try {
    await ensureSchema(env.CROWD_DB);
    const row = await env.CROWD_DB.prepare('SELECT member FROM member_sessions WHERE token_hash = ?1 AND expires_at > ?2').bind(await sha256(token), now()).first();
    return row?.member || null;
  } catch { return null; }
}

// 커뮤니티 '나가기' 뒤에는 그 회원의 모든 세션도 지운다.
export async function endMemberSessions(env, member) {
  if (!env?.CROWD_DB || !member) return;
  await ensureSchema(env.CROWD_DB);
  await env.CROWD_DB.prepare('DELETE FROM member_sessions WHERE member = ?1').bind(member).run();
}

export async function handleMemberAuth(request, env = {}, { fetchImpl = fetch, now = Date.now } = {}) {
  if (env.COMMUNITY_MODE !== 'public') return null;
  const url = new URL(request.url);
  const m = /^\/_member\/(login|callback)\/(kakao|google)$/.exec(url.pathname);
  if (url.pathname === '/_member/logout') {
    if (request.method !== 'POST') return fail(405, 'method_not_allowed');
    if (request.headers.get('origin') !== url.origin) return fail(403, 'invalid_origin');
    const token = cookies(request)[SESSION_COOKIE];
    if (token && env.CROWD_DB) {
      try { await ensureSchema(env.CROWD_DB); await env.CROWD_DB.prepare('DELETE FROM member_sessions WHERE token_hash = ?1').bind(await sha256(token)).run(); } catch {}
    }
    const headers = new Headers({ ...HEADERS, 'content-type': 'application/json; charset=utf-8' });
    headers.append('set-cookie', setCookie(SESSION_COOKIE, '', 0));
    return new Response('{"ok":true}', { status: 200, headers });
  }
  if (!m) return fail(404, 'not_found');
  if (request.method !== 'GET') return fail(405, 'method_not_allowed');
  const [, step, provider] = m;
  if (!memberLoginOptions(env)[provider]) return fail(503, 'not_configured');
  try {
    if (step === 'login') return await start(request, env, provider, Math.floor(now() / 1000));
    return await callback(request, env, provider, { fetchImpl, now });
  } catch { return fail(503, 'login_unavailable'); }
}
