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
// 주의: MEMBER_SESSION_SECRET을 바꾸면 회원 id가 모두 바뀌어 기존 회원이 글·이름과 끊긴다. 한 번 정하면 바꾸지 않는다.
// 카카오 문서에 PKCE가 없어(10-28 확인) 카카오는 상태값과 클라이언트 시크릿만 쓴다. KAKAO_CLIENT_SECRET을 켜 두기를 권한다.
//   GET  /_member/login/kakao|google   → 공급자 로그인으로 302
//   GET  /_member/callback/kakao|google → 세션 쿠키를 주고 /c로 303
//   POST /_member/logout               → 세션 삭제(같은 출처만)
//   POST /_member/email/start {email}  → 6자리 코드 메일, POST /_member/email/verify {email, code} → 세션(같은 출처만)
import { MEMBER_SESSION_COOKIE, clearOwnerCookie } from './auth-cookies.js';
import { memberStorageScope } from '../../src/domain/account-scope.js';
const STATE_COOKIE = '__Host-hangit-login';
export const SESSION_COOKIE = MEMBER_SESSION_COOKIE;
const STATE_TTL = 10 * 60;
const SESSION_TTL = 30 * 24 * 60 * 60;
const HOME = '/c';
const encoder = new TextEncoder();
const HEADERS = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const KAKAO = { authorize: 'https://kauth.kakao.com/oauth/authorize', token: 'https://kauth.kakao.com/oauth/token', me: 'https://kapi.kakao.com/v2/user/me' };
const GOOGLE = { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', issuers: ['https://accounts.google.com', 'accounts.google.com'] };

const dbOf = (env) => env?.COMMUNITY_DB || env?.CROWD_DB;
const secretOf = (env) => (typeof env?.MEMBER_SESSION_SECRET === 'string' && env.MEMBER_SESSION_SECRET.length >= 32 ? env.MEMBER_SESSION_SECRET : null);
export function memberLoginOptions(env) {
  const ok = !!secretOf(env) && !!dbOf(env);
  return {
    kakao: ok && !!env.KAKAO_REST_KEY,
    google: ok && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
    email: ok && !!env.EMAIL_FROM && (!!env.RESEND_API_KEY || typeof env.EMAIL?.send === 'function'),
  };
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
  // 이메일 인증 코드: 이메일은 비밀값으로 HMAC한 값만, 코드는 해시만 둔다.
  'CREATE TABLE IF NOT EXISTS member_email_codes (email_hash TEXT PRIMARY KEY, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS member_email_sends (id TEXT PRIMARY KEY, email_hash TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS member_email_sends_email ON member_email_sends (email_hash, created_at)',
  'CREATE INDEX IF NOT EXISTS member_email_sends_time ON member_email_sends (created_at)',
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
  await ensureSchema(dbOf(env));
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
  return redirect(303, HOME, [clear, await newSession(env, member, provider, nowMs), clearOwnerCookie()]);
}

export async function newSession(env, member, provider, nowMs) {
  const token = random(32);
  const db = dbOf(env);
  await ensureSchema(db);
  await db.batch([
    db.prepare('DELETE FROM member_sessions WHERE expires_at <= ?1').bind(nowMs),
    db.prepare('INSERT INTO member_sessions (token_hash, member, provider, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(await sha256(token), member, provider, nowMs, nowMs + SESSION_TTL * 1000),
  ]);
  return setCookie(SESSION_COOKIE, token, SESSION_TTL);
}

// ── 이메일 인증 코드(대표 10-28 12:25·12:26). 비밀번호 없이 6자리 코드로 가입·로그인한다.
// 설정: EMAIL_FROM(보내는 주소, 인증된 내 도메인) + RESEND_API_KEY 또는 Cloudflare 바인딩 EMAIL(Email Sending, Workers 유료·베타).
// 이메일 원문은 저장하지 않는다(HMAC 값만). 한 주소 한 시간 5통, 서버 전체 하루 EMAIL_DAILY_MAX(기본 90, Resend 무료 하루 100통 아래).
const CODE_TTL = 10 * 60 * 1000;
const CODE_ATTEMPTS = 5;
const SENDS_PER_EMAIL_HOUR = 5;
const json = (status, body, cookies = []) => {
  const headers = new Headers({ ...HEADERS, 'content-type': 'application/json; charset=utf-8' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
};
function normalEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.normalize('NFKC').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@"<>(),;:]{1,64}@[a-z0-9.-]{1,252}\.[a-z]{2,24}$/.test(email) && !email.includes('..') ? email : null;
}
function sixDigits() {
  const max = 4_294_000_000; // 10^6의 배수 아래만 써서 치우침을 없앤다
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0];
    if (n < max) return String(n % 1_000_000).padStart(6, '0');
  }
}
async function readBody(request, keys) {
  try {
    const text = await request.text();
    if (text.length > 1024) return null;
    const body = JSON.parse(text);
    return body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every((k) => keys.includes(k)) ? body : null;
  } catch { return null; }
}
async function sendMail(env, fetchImpl, to, code) {
  const subject = '[행잇] 인증 코드';
  const text = `행잇 코디 공유 인증 코드: ${code}\n\n10분 안에 입력해 주세요. 직접 요청하지 않았다면 이 메일은 무시해 주세요.`;
  if (typeof env.EMAIL?.send === 'function') {
    await env.EMAIL.send({ to, from: env.EMAIL_FROM, subject, text });
    return true;
  }
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
  });
  return res.ok;
}
async function emailStart(request, env, { fetchImpl, now }) {
  const body = await readBody(request, ['email']);
  const email = normalEmail(body?.email);
  if (!email) return json(400, { code: 'invalid_email', message: '이메일 주소를 확인해 주세요.' });
  const secret = secretOf(env), db = dbOf(env), at = now();
  await ensureSchema(db);
  const key = hex(await hmac(secret, 'email', email));
  const hour = await db.prepare('SELECT COUNT(*) AS n FROM member_email_sends WHERE email_hash = ?1 AND created_at > ?2').bind(key, at - 3_600_000).first();
  if (Number(hour?.n) >= SENDS_PER_EMAIL_HOUR) return json(429, { code: 'email_limit', message: '코드를 너무 자주 요청했어요. 한 시간 뒤에 다시 해 주세요.' });
  const day = await db.prepare('SELECT COUNT(*) AS n FROM member_email_sends WHERE created_at > ?1').bind(at - 86_400_000).first();
  if (Number(day?.n) >= Math.max(1, Number(env.EMAIL_DAILY_MAX) || 90)) return json(429, { code: 'daily_limit', message: '오늘 보낼 수 있는 인증 메일을 다 썼어요. 내일 다시 해 주세요.' });
  const code = sixDigits();
  await db.batch([
    db.prepare('DELETE FROM member_email_sends WHERE created_at <= ?1').bind(at - 86_400_000),
    db.prepare('INSERT INTO member_email_sends (id, email_hash, created_at) VALUES (?1, ?2, ?3)').bind(crypto.randomUUID(), key, at),
    db.prepare(`INSERT INTO member_email_codes (email_hash, code_hash, attempts, expires_at) VALUES (?1, ?2, 0, ?3)
      ON CONFLICT (email_hash) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at`)
      .bind(key, hex(await hmac(secret, 'email-code', `${key}|${code}`)), at + CODE_TTL),
  ]);
  let sent = false;
  try { sent = await sendMail(env, fetchImpl, email, code); } catch {}
  if (!sent) {
    await db.prepare('DELETE FROM member_email_codes WHERE email_hash = ?1').bind(key).run();
    return json(502, { code: 'mail_unavailable', message: '메일을 보내지 못했어요. 잠시 뒤에 다시 해 주세요.' });
  }
  return json(200, { ok: true });
}
async function emailVerify(request, env, { now }) {
  const body = await readBody(request, ['email', 'code']);
  const email = normalEmail(body?.email);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const no = () => json(400, { code: 'invalid_code', message: '코드가 맞지 않거나 시간이 지났어요. 다시 받아 주세요.' });
  if (!email || !/^\d{6}$/.test(code)) return no();
  const secret = secretOf(env), db = dbOf(env), at = now();
  await ensureSchema(db);
  const key = hex(await hmac(secret, 'email', email));
  const row = await db.prepare('SELECT code_hash, attempts, expires_at FROM member_email_codes WHERE email_hash = ?1').bind(key).first();
  if (!row || Number(row.expires_at) <= at || Number(row.attempts) >= CODE_ATTEMPTS) return no();
  if (!same(hex(await hmac(secret, 'email-code', `${key}|${code}`)), row.code_hash)) {
    await db.prepare('UPDATE member_email_codes SET attempts = attempts + 1 WHERE email_hash = ?1').bind(key).run();
    return no();
  }
  const used = await db.prepare('DELETE FROM member_email_codes WHERE email_hash = ?1 AND code_hash = ?2').bind(key, row.code_hash).run();
  if (!used.meta?.changes) return no();
  const member = hex(await hmac(secret, 'member', `email|${email}`)).slice(0, 32);
  return json(200, { ok: true, scope: await memberStorageScope(member) }, [await newSession(env, member, 'email', at), clearOwnerCookie()]);
}

// 요청의 회원 쿠키 → 회원 id(32자 hex) 또는 null.
// provider를 주면 그 로그인 방식의 세션만 받는다(앱은 초대 회원 'password'만, 보안 검토 10-28).
export async function memberFromRequest(request, env, { now = Date.now, provider = null } = {}) {
  const token = cookies(request)[SESSION_COOKIE];
  const db = dbOf(env);
  // 세션 토큰은 무작위 값이고 해시로만 찾으므로 비밀값이 없어도 된다(초대 회원은 MEMBER_SESSION_SECRET 없이 쓴다).
  if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token) || !db) return null;
  try {
    await ensureSchema(db);
    const row = await db.prepare('SELECT member, provider FROM member_sessions WHERE token_hash = ?1 AND expires_at > ?2').bind(await sha256(token), now()).first();
    if (provider && row?.provider !== provider) return null;
    return row?.member || null;
  } catch { return null; }
}

// 커뮤니티 '나가기' 뒤에는 그 회원의 모든 세션도 지운다.
export async function memberSessionRemovalStatement(env, member) {
  const db = dbOf(env);
  if (!db || !member) return null;
  await ensureSchema(db);
  return db.prepare('DELETE FROM member_sessions WHERE member = ?1').bind(member);
}
export async function endMemberSessions(env, member) {
  const statement = await memberSessionRemovalStatement(env, member);
  if (statement) await statement.run();
}

export async function handleMemberAuth(request, env = {}, { fetchImpl = fetch, now = Date.now } = {}) {
  if (env.COMMUNITY_MODE !== 'public') return null;
  const url = new URL(request.url);
  const mail = /^\/_member\/email\/(start|verify)$/.exec(url.pathname);
  if (mail) {
    if (request.method !== 'POST') return fail(405, 'method_not_allowed');
    if (request.headers.get('origin') !== url.origin) return fail(403, 'invalid_origin');
    if (!memberLoginOptions(env).email) return fail(503, 'not_configured');
    try { return mail[1] === 'start' ? await emailStart(request, env, { fetchImpl, now }) : await emailVerify(request, env, { now }); }
    catch { return fail(503, 'login_unavailable'); }
  }
  const m = /^\/_member\/(login|callback)\/(kakao|google)$/.exec(url.pathname);
  if (url.pathname === '/_member/logout') {
    if (request.method !== 'POST') return fail(405, 'method_not_allowed');
    if (request.headers.get('origin') !== url.origin) return fail(403, 'invalid_origin');
    const token = cookies(request)[SESSION_COOKIE];
    if (token && dbOf(env)) {
      try { await ensureSchema(dbOf(env)); await dbOf(env).prepare('DELETE FROM member_sessions WHERE token_hash = ?1').bind(await sha256(token)).run(); } catch {}
    }
    const headers = new Headers({ ...HEADERS, 'content-type': 'application/json; charset=utf-8' });
    headers.append('set-cookie', setCookie(SESSION_COOKIE, '', 0));
    headers.append('set-cookie', clearOwnerCookie());
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
