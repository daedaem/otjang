// 카드·외부 인증 가입 없이 쓰는 본인 전용 접속. 앱 비밀번호는 서버 Secret에만 둔다.
// 서명용 32바이트 난수는 서버 D1에 따로 둔다. 서로 다른 HMAC 문맥을 쓰며
// 앱 비밀번호·공급자 키·IP 원문은 DB·로그·응답에 기록하지 않는다.
import { OWNER_SESSION_COOKIE as COOKIE, clearMemberCookie } from './auth-cookies.js';
const LIFETIME = 7 * 24 * 60 * 60;
const MAX_BODY = 1024;
const encoder = new TextEncoder();
const schemaReady = new WeakMap();
const seedReady = new WeakMap();
const baseHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};
const failure = (status, code) => ({ ok: false, status, code });
const denied = () => failure(401, 'unauthorized');
const unconfigured = () => failure(503, 'not_configured');
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { ...baseHeaders, ...headers },
});
const errorResponse = (result) => json({ error: result.code }, result.status);

function configuration(env) {
  const secret = env?.PRIVATE_APP_ACCESS_KEY;
  if (env?.PRIVATE_AUTH_MODE !== 'session' || typeof secret !== 'string' || !/^[\x21-\x7e]{8,128}$/.test(secret)) return null;
  return secret;
}

function seconds(now) {
  const ms = now();
  if (!Number.isSafeInteger(ms) || ms < 0) throw Error();
  return Math.floor(ms / 1000);
}

function encode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decode(value, max = 1024) {
  if (typeof value !== 'string' || !value || value.length > max || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw Error();
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  if (encode(bytes) !== value) throw Error();
  return bytes;
}

async function sign(secret, context, value) {
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`otjang/${context}/v1\0${value}`)));
}

function equal(a, b) {
  // HMAC digests are fixed length. Do not compare the password or signature as strings.
  let different = a.length ^ b.length;
  for (let i = 0; i < 32; i++) different |= (a[i] || 0) ^ (b[i] || 0);
  return different === 0;
}

function sessionCookie(token, expires = false) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${expires ? 0 : LIFETIME}${expires ? '; Expires=Thu, 01 Jan 1970 00:00:00 GMT' : ''}`;
}

function readCookie(request) {
  const header = request.headers.get('cookie') || '';
  if (header.length > 8192) return null;
  const matching = header.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${COOKIE}=`));
  return matching.length === 1 ? matching[0].slice(COOKIE.length + 1) : null;
}

export async function authorizeSession(request, env, { now = Date.now } = {}) {
  const password = configuration(env);
  if (!password) return unconfigured();
  let secret;
  try { secret = await signingKey(env, password); } catch { return unconfigured(); }
  try {
    const current = seconds(now);
    const token = readCookie(request);
    if (!token || token.length > 512) return denied();
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return denied();
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(parts[1], 400)));
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).sort().join(',') !== 'exp,iat,nonce,v' || body.v !== 1 ||
      !Number.isSafeInteger(body.iat) || !Number.isSafeInteger(body.exp) || body.iat < 0 ||
      body.iat > current || body.exp <= current || body.exp - body.iat !== LIFETIME ||
      typeof body.nonce !== 'string' || decode(body.nonce, 22).length !== 16) return denied();
    const signature = decode(parts[2], 43);
    if (signature.length !== 32) return denied();
    const expected = await sign(secret, 'session', parts[1]);
    return equal(signature, expected) && body.exp > seconds(now) ? { ok: true } : denied();
  } catch { return denied(); }
}

async function ensureSchema(db) {
  let pending = schemaReady.get(db);
  if (!pending) {
    pending = (async () => {
      await db.prepare('CREATE TABLE IF NOT EXISTS private_auth_settings (id INTEGER PRIMARY KEY CHECK (id = 1), seed TEXT NOT NULL)').run();
      await db.prepare('CREATE TABLE IF NOT EXISTS private_login_usage (utc_minute INTEGER NOT NULL, ip_tag TEXT NOT NULL)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS private_login_minute_ip ON private_login_usage (utc_minute, ip_tag)').run();
    })();
    schemaReady.set(db, pending);
  }
  try { await pending; } catch (error) { schemaReady.delete(db); throw error; }
}

async function signingKey(env, password) {
  const db = env?.RANK_DB || env?.CROWD_DB;
  if (!db || typeof db.prepare !== 'function') throw Error();
  let pending = seedReady.get(db);
  if (!pending) {
    pending = (async () => {
      await ensureSchema(db);
      const candidate = encode(crypto.getRandomValues(new Uint8Array(32)));
      // Different isolates may race. All must read the one persisted winner, never
      // continue with their losing local candidate or a password-only signing key.
      await db.prepare('INSERT INTO private_auth_settings (id, seed) VALUES (1, ?1) ON CONFLICT(id) DO NOTHING').bind(candidate).run();
      const row = await db.prepare('SELECT seed FROM private_auth_settings WHERE id = 1').first();
      const seed = decode(row?.seed, 43);
      if (seed.length !== 32) throw Error();
      return seed;
    })();
    seedReady.set(db, pending);
  }
  let seed;
  try { seed = await pending; } catch (error) { seedReady.delete(db); throw error; }
  // The owner's memorable app password is not a signing secret. A strong,
  // server-generated D1 seed supplies entropy. Password rotation changes this
  // derived generation key and invalidates every previously signed cookie.
  return sign(seed, 'owner-generation', password);
}

async function reserveLogin(request, env, secret, current) {
  const db = env?.RANK_DB || env?.CROWD_DB;
  if (!db || typeof db.prepare !== 'function') return unconfigured();
  try {
    const minute = Math.floor(current / 60);
    const rawIp = request.headers.get('CF-Connecting-IP') || '';
    const ip = rawIp.length <= 64 && /^[0-9a-f:.]+$/i.test(rawIp) ? rawIp : 'unknown';
    // Minute-bound tags cannot link a device across time; cleanup keeps at most two minutes.
    const tag = encode(await sign(secret, 'login-ip', `${minute}\0${ip}`));
    await ensureSchema(db);
    await db.prepare('DELETE FROM private_login_usage WHERE utc_minute < ?1').bind(minute - 1).run();
    const reserved = await db.prepare(`INSERT INTO private_login_usage (utc_minute, ip_tag)
      SELECT ?1, ?2 WHERE
      (SELECT COUNT(*) FROM private_login_usage WHERE utc_minute = ?1) < 60
      AND (SELECT COUNT(*) FROM private_login_usage WHERE utc_minute = ?1 AND ip_tag = ?2) < 5`)
      .bind(minute, tag).run();
    if (reserved?.meta?.changes === 1) return { ok: true };
    if (reserved?.meta?.changes === 0) return failure(429, 'rate_limited');
    return failure(503, 'login_unavailable');
  } catch { return failure(503, 'login_unavailable'); }
}

function sameOrigin(request) {
  const url = new URL(request.url);
  return url.protocol === 'https:' && request.headers.get('Origin') === url.origin;
}

async function passwordBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw failure(415, 'invalid_content_type');
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY)) throw failure(413, 'body_too_large');
  if (!request.body) throw failure(400, 'invalid_request');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY) throw failure(413, 'body_too_large');
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== 'password' ||
      typeof body.password !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(body.password)) throw Error();
    return body.password;
  } catch { throw failure(400, 'invalid_request'); }
}

function loginPage(invite = false, setup = false) {
  const nonce = encode(crypto.getRandomValues(new Uint8Array(16)));
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>본인 전용 접속</title>
<style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;padding:24px;min-height:100svh;display:grid;place-items:center;background:#f6f6f8;color:#17171c;font:16px system-ui,sans-serif}main{width:min(100%,390px);padding:32px;background:white;border-radius:24px}h1{margin:0 0 12px;font-size:25px}p{line-height:1.6;color:#606068}label{display:block;margin:24px 0 8px}input,button{width:100%;min-height:48px;border:1px solid #d3d3da;border-radius:12px;padding:12px;font:inherit}button{margin-top:16px;background:#17171c;color:white;cursor:pointer}button:disabled{opacity:.5}#notice{min-height:24px;font-size:14px}</style></head><body><main><h1>본인 전용 접속</h1><p>앱 비밀번호로 시험 앱을 열어요.<br>한 번 로그인하면 이 기기에서 7일 동안 유지돼요.<br>결제나 별도 가입은 필요 없어요.</p><form id="login"><label for="password">앱 비밀번호</label><input id="password" name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="128"><button type="submit">들어가기</button><p id="notice" role="status" aria-live="polite"></p></form>${invite ? '<p>초대받으셨나요? <a href="/_member/signin">이메일로 로그인</a> · <a href="/_member/signup">가입하기</a></p>' : ''}</main>
<script nonce="${nonce}">const form=document.querySelector('#login'),field=document.querySelector('#password'),button=form.querySelector('button'),notice=document.querySelector('#notice');form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;notice.textContent='확인하고 있어요.';try{const response=await fetch('/_private/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:field.value})});if(response.ok){location.replace('/');return}notice.textContent=response.status===429?'시도가 많아요. 잠시 후 다시 해주세요.':response.status===503?'접속 설정을 준비하고 있어요.':'앱 비밀번호를 다시 확인해 주세요.'}catch{notice.textContent='연결을 확인하고 다시 시도해 주세요.'}finally{field.value='';button.disabled=false}});</script></body></html>`;
  const display = setup ? html.replaceAll('본인 전용 접속','관리자 최초 설정 확인')
    .replace('앱 비밀번호로 시험 앱을 열어요.<br>한 번 로그인하면 이 기기에서 7일 동안 유지돼요.<br>결제나 별도 가입은 필요 없어요.','처음 관리자 계정을 연결할 때만 기존 본인 인증을 확인해요. 계정을 만든 뒤에는 일반 이메일 로그인만 사용합니다.')
    .replace('<label for="password">앱 비밀번호</label>','<label for="password">기존 앱 비밀번호</label>')
    .replace('</main>','<p><a href="/_member/signin">일반 계정 로그인으로</a></p></main>') : html;
  return new Response(display, { headers: {
    ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  } });
}

export async function handlePrivateSession(request, env, { now = Date.now } = {}) {
  const path = new URL(request.url).pathname;
  const expected = { '/_private/login': 'GET', '/_private/session': 'POST', '/_private/status': 'GET', '/_private/logout': 'POST' }[path];
  if (!expected) return null;
  if (request.method !== expected) return json({ error: 'method_not_allowed' }, 405, { Allow: expected });
  if (path === '/_private/login') return loginPage(env?.MEMBER_APP_MODE === 'invite', env?.MEMBER_APP_MODE === 'accounts');
  const secret = configuration(env);
  if (!secret) return errorResponse(unconfigured());
  if (path === '/_private/status') {
    const access = await authorizeSession(request, env, { now });
    return access.ok ? json({ authenticated: true }) : json({ authenticated: false, error: access.code }, access.status);
  }
  if (!sameOrigin(request)) return errorResponse(failure(403, 'invalid_origin'));
  if (path === '/_private/logout') {
    const access = await authorizeSession(request, env, { now });
    if (!access.ok) return errorResponse(access);
    const response = json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', true) });
    response.headers.append('Set-Cookie', clearMemberCookie());
    return response;
  }
  try {
    const password = await passwordBody(request);
    const current = seconds(now);
    const generationKey = await signingKey(env, secret);
    const quota = await reserveLogin(request, env, generationKey, current);
    if (!quota.ok) return errorResponse(quota);
    const [expectedPassword, receivedPassword] = await Promise.all([
      sign(generationKey, 'password', secret), sign(generationKey, 'password', password),
    ]);
    if (!equal(expectedPassword, receivedPassword)) return errorResponse(denied());
    const payload = encode(encoder.encode(JSON.stringify({
      v: 1, iat: current, exp: current + LIFETIME, nonce: encode(crypto.getRandomValues(new Uint8Array(16))),
    })));
    const token = `v1.${payload}.${encode(await sign(generationKey, 'session', payload))}`;
    const response = json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
    response.headers.append('Set-Cookie', clearMemberCookie());
    return response;
  } catch (error) {
    return errorResponse(error?.ok === false ? error : failure(503, 'login_unavailable'));
  }
}
