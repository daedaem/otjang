// 초대 회원(지인 테스트). 대표 10-28 15:11~15:12: "가입·로그인을 만들면 되잖아요", 초대 코드 있는 사람만,
// 대표 빼고 Claude AI 하루 10번, 다른 회원에게는 무신사 사진을 끈다(추천대로).
// 켜는 법: Cloudflare 변수 MEMBER_APP_MODE=invite(wrangler.jsonc). 외부 서비스·새 비용 없음.
//
// 저장: 이메일은 서버가 만든 비밀값으로 HMAC한 값만, 비밀번호는 PBKDF2-SHA256(10만 회) 해시와 소금만.
// 회원 id는 무작위 32자 hex. 세션은 member-session.js와 같은 쿠키·표(토큰 해시, 30일).
//   GET  /_member/signup[?code=]       가입 화면           POST /_member/password/signup {code,email,password,age14}
//   GET  /_member/signin               로그인 화면         POST /_member/password/signin {email,password}
//   GET  /_member/account              내 계정(회원)       POST /_member/account/logout, /_member/account/delete {confirm}
//   GET  /_member/invites[?format=json] 초대 관리(본인)    POST /_member/invites {label}, /_member/invites/revoke {code}
import { newSession, SESSION_COOKIE } from './member-session.js';
import { clearOwnerCookie } from './auth-cookies.js';
import { ACCOUNT_ACTIVE_KEY, memberStorageScope } from '../../src/domain/account-scope.js';

const encoder = new TextEncoder();
const ITERATIONS = 100_000;
const ATTEMPT_WINDOW = 15 * 60 * 1000;
const ATTEMPTS_PER_EMAIL = 10;
const SIGNUP_FAILS = 30;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HEADERS = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' };
const dbOf = (env) => env.COMMUNITY_DB || env.CROWD_DB;

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS member_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS member_invites (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
    created_at INTEGER NOT NULL, used_at INTEGER, used_by TEXT, revoked_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS member_accounts (member TEXT PRIMARY KEY, email_key TEXT NOT NULL UNIQUE, salt TEXT NOT NULL,
    hash TEXT NOT NULL, iterations INTEGER NOT NULL, invite TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS member_login_attempts (id TEXT PRIMARY KEY, email_key TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS member_login_attempts_key ON member_login_attempts (email_key, created_at)',
];
const ready = new WeakSet();
async function ensureSchema(db) {
  if (ready.has(db)) return;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  ready.add(db);
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
const sha256 = async (s) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s))));
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// 이메일을 알아볼 수 없게 바꿀 비밀값. 처음 쓸 때 서버가 만들어 D1에 둔다(대표가 넣을 Secret 없음).
async function serverSecret(db) {
  const row = await db.prepare("SELECT v FROM member_settings WHERE k = 'email_secret'").first();
  if (row?.v) return row.v;
  await db.prepare("INSERT OR IGNORE INTO member_settings (k, v) VALUES ('email_secret', ?1)").bind(hex(crypto.getRandomValues(new Uint8Array(32)))).run();
  return (await db.prepare("SELECT v FROM member_settings WHERE k = 'email_secret'").first()).v;
}
async function emailKey(db, email) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(await serverSecret(db)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`hangit/member-email/v1\0${email}`))));
}
async function passwordHash(password, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)));
}
function normalEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.normalize('NFKC').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@"<>(),;:]{1,64}@[a-z0-9.-]{1,252}\.[a-z]{2,24}$/.test(email) && !email.includes('..') ? email : null;
}
const normalCode = (raw) => (typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
const showCode = (c) => `${c.slice(0, 4)}-${c.slice(4, 8)}`;
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
const json = (status, body, cookies = []) => {
  const headers = new Headers({ ...HEADERS, 'content-type': 'application/json; charset=utf-8' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
};
const fail = (status, code, message) => json(status, { code, message });
async function body(request, keys) {
  try {
    const text = await request.text();
    if (text.length > 2048) return null;
    const b = JSON.parse(text);
    return b && typeof b === 'object' && !Array.isArray(b) && Object.keys(b).every((k) => keys.includes(k)) ? b : null;
  } catch { return null; }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 서버가 그리는 작은 화면(앱 파일 없이). 본인 로그인 화면과 같은 방식: nonce CSP, 바깥 자원 없음.
function page(title, inner, script = '') {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} · 행잇</title>
<style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;padding:24px;min-height:100svh;display:grid;place-items:center;background:#f7f7f8;color:#202025;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',system-ui,sans-serif}main{width:min(100%,420px);padding:28px;background:#fff;border-radius:14px}h1{margin:0 0 8px;font-size:24px}.mark{color:#5b3a24;font-weight:700;margin-bottom:16px}p{color:#555560;line-height:1.6;margin:6px 0}label{display:block;margin:16px 0 6px;font-weight:600;font-size:14px}input[type=email],input[type=password],input[type=text]{width:100%;min-height:48px;border:1px solid #d9d9df;border-radius:8px;padding:10px 12px;font:inherit}.check{display:flex;gap:8px;align-items:center;font-weight:400}button{width:100%;min-height:50px;border:0;border-radius:8px;margin-top:16px;background:#202025;color:#fff;font:inherit;font-weight:600;cursor:pointer}button.line{background:#fff;color:#202025;border:1px solid #d9d9df}button:disabled{opacity:.45}a{color:#202025}#notice{min-height:24px;font-size:14px;margin-top:10px}table{width:100%;border-collapse:collapse;font-size:14px;margin-top:12px}td{border-top:1px solid #ececf0;padding:8px 4px;vertical-align:top}code{font-size:15px;font-weight:700}.small{font-size:13px;color:#6a6a74}@media (prefers-color-scheme:dark){body{background:#151519;color:#f7f7f8}main{background:#1c1c21}p,.small{color:#c4c4cb}input[type=email],input[type=password],input[type=text]{background:#151519;color:#f7f7f8;border-color:#33333b}button{background:#f7f7f8;color:#151519}button.line{background:#1c1c21;color:#f7f7f8;border-color:#33333b}a{color:#f7f7f8}td{border-color:#33333b}.mark{color:#c4996b}}</style></head>
<body><main><div class="mark">행잇</div>${inner}<p id="notice" role="status" aria-live="polite"></p></main>${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`;
  return new Response(html, { headers: { ...HEADERS, 'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` } });
}
const POST = `const post=async(p,b)=>{const r=await fetch(p,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});let o=null;try{o=await r.json()}catch{}if(r.ok){try{if(/^m-[a-f0-9]{32}$/.test(o?.scope||''))localStorage.setItem('${ACCOUNT_ACTIVE_KEY}',o.scope);if(p==='/_member/account/logout'||p==='/_member/account/delete')localStorage.setItem('${ACCOUNT_ACTIVE_KEY}','signed-out')}catch{}}return{ok:r.ok,status:r.status,body:o}};const notice=t=>{document.querySelector('#notice').textContent=t};`;

function signupPage(url) {
  const code = normalCode(url.searchParams.get('code') || '');
  return page('가입', `<h1>초대받아 가입하기</h1><p>행잇 시험판이에요. 옷장과 기록은 내 휴대폰에만 저장되고, 이메일은 로그인에만 써요.</p>
<form id="f"><label for="code">초대 코드</label><input id="code" type="text" autocomplete="off" required value="${esc(code ? showCode(code) : '')}">
<label for="email">이메일</label><input id="email" type="email" autocomplete="email" required>
<label for="password">비밀번호 (8자 이상)</label><input id="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
<label class="check"><input id="age" type="checkbox"> 만 14세 이상이에요</label>
<button type="submit">가입하기</button></form><p class="small">이미 가입했나요? <a href="/_member/signin">로그인</a></p>`,
  `${POST}document.querySelector('#f').addEventListener('submit',async e=>{e.preventDefault();notice('확인하고 있어요.');const r=await post('/_member/password/signup',{code:document.querySelector('#code').value,email:document.querySelector('#email').value,password:document.querySelector('#password').value,age14:document.querySelector('#age').checked});if(r.ok){location.replace('/');return}notice(r.body?.message||'가입하지 못했어요.')});`);
}
function signinPage() {
  return page('로그인', `<h1>로그인</h1><p>초대받아 가입한 이메일로 들어와요. 비밀번호를 잊으면 초대해 준 사람에게 알려 주세요.</p>
<form id="f"><label for="email">이메일</label><input id="email" type="email" autocomplete="email" required>
<label for="password">비밀번호</label><input id="password" type="password" autocomplete="current-password" required>
<button type="submit">들어가기</button></form><p class="small">초대 코드가 있나요? <a href="/_member/signup">가입하기</a></p>`,
  `${POST}document.querySelector('#f').addEventListener('submit',async e=>{e.preventDefault();notice('확인하고 있어요.');const r=await post('/_member/password/signin',{email:document.querySelector('#email').value,password:document.querySelector('#password').value});if(r.ok){location.replace('/');return}notice(r.body?.message||'로그인하지 못했어요.')});`);
}
function accountPage() {
  return page('내 계정', `<h1>내 계정</h1><p>옷장·기록은 이 휴대폰에만 있어요. 계정마다 자료를 따로 보관해요. 삭제 전 앱 메뉴의 백업·복원으로 자료를 내보내 주세요. 삭제해도 이 기기 원본은 남지만 새 계정에 자동으로 연결되지 않아요.</p>
<button id="out" class="line" type="button">로그아웃</button><button id="del" type="button">계정 지우기</button><p class="small"><a href="/">앱으로 돌아가기</a></p>`,
  `${POST}let armed=false;document.querySelector('#out').onclick=async()=>{const r=await post('/_member/account/logout',{});if(r.ok){location.replace('/_member/signin');return}notice(r.body?.message||'로그아웃하지 못했어요.')};document.querySelector('#del').onclick=async()=>{if(!armed){armed=true;document.querySelector('#del').textContent='한 번 더 누르면 계정과 코디 공유 글이 지워져요';return}const r=await post('/_member/account/delete',{confirm:true});if(r.ok){location.replace('/_member/signin');return}notice(r.body?.message||'지우지 못했어요.')};`);
}
async function listInvites(db, origin) {
  const { results } = await db.prepare('SELECT code, label, created_at, used_at, revoked_at FROM member_invites ORDER BY created_at DESC').all();
  return results.map((r) => ({ code: showCode(r.code), label: r.label, createdAt: Number(r.created_at), used: r.used_at !== null, usedAt: r.used_at === null ? null : Number(r.used_at), revoked: r.revoked_at !== null, removed: r.used_at !== null && r.revoked_at !== null, link: `${origin}/_member/signup?code=${showCode(r.code)}` }));
}
async function invitesPage(db, origin) {
  const items = await listInvites(db, origin);
  const rows = items.map((i) => `<tr><td>${esc(i.label)}<br><code>${esc(i.code)}</code></td><td>${i.removed ? '끊음' : i.revoked ? '취소함' : i.used ? `가입함 <button class="line" data-remove="${esc(i.code)}" type="button">회원 끊기</button>` : `<button class="line" data-copy="${esc(i.link)}" type="button">링크 복사</button><button class="line" data-revoke="${esc(i.code)}" type="button">취소</button>`}</td></tr>`).join('');
  return page('지인 초대', `<h1>지인 초대</h1><p>한 사람에게 초대 코드 하나를 보내요. 코드는 한 번만 쓸 수 있어요. 초대받은 사람은 Claude AI를 하루 10번까지 쓰고, 무신사 상품 사진 대신 색 칸을 봐요.</p>
<form id="f"><label for="label">누구에게 보낼지 (메모)</label><input id="label" type="text" maxlength="30" required placeholder="예: 민수"><button type="submit">초대 코드 만들기</button></form>
<table>${rows || '<tr><td class="small">아직 만든 초대가 없어요.</td></tr>'}</table><p class="small"><a href="/">앱으로 돌아가기</a></p>`,
  `${POST}document.querySelector('#f').addEventListener('submit',async e=>{e.preventDefault();const r=await post('/_member/invites',{label:document.querySelector('#label').value});if(r.ok){try{await navigator.clipboard.writeText(r.body.link)}catch{}location.reload();return}notice(r.body?.message||'만들지 못했어요.')});document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);notice('가입 링크를 복사했어요.')}catch{notice(b.dataset.copy)}});document.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{await post('/_member/invites/revoke',{code:b.dataset.revoke});location.reload()});document.querySelectorAll('[data-remove]').forEach(b=>{let armed=false;b.onclick=async()=>{if(!armed){armed=true;b.textContent='한 번 더 누르면 계정과 글이 지워져요';return}await post('/_member/invites/remove',{code:b.dataset.remove});location.reload()}});`);
}

async function signup(request, env, db, now) {
  const b = await body(request, ['code', 'email', 'password', 'age14']);
  if (!b) return fail(400, 'bad_request', '입력을 확인해 주세요.');
  if (b.age14 !== true) return fail(400, 'age_required', '만 14세 이상만 가입할 수 있어요.');
  const email = normalEmail(b.email);
  if (!email) return fail(400, 'invalid_email', '이메일 주소를 확인해 주세요.');
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 128) return fail(400, 'weak_password', '비밀번호는 8자 이상으로 정해 주세요.');
  // 초대 코드를 먼저 본다. 맞는 코드 없이는 이메일 가입 여부를 알 수 없고, 비싼 해시도 돌리지 않는다(보안 검토 10-28).
  const since = now - ATTEMPT_WINDOW;
  const fails = await db.prepare("SELECT COUNT(*) AS n FROM member_login_attempts WHERE email_key = 'signup' AND created_at > ?1").bind(since).first();
  if (Number(fails?.n) >= SIGNUP_FAILS) return fail(429, 'too_many', '잠시 뒤에 다시 해 주세요.');
  const code = normalCode(b.code);
  const open = code.length === 8 && await db.prepare('SELECT 1 FROM member_invites WHERE code = ?1 AND used_at IS NULL AND revoked_at IS NULL').bind(code).first();
  if (!open) {
    await db.prepare("INSERT INTO member_login_attempts (id, email_key, created_at) VALUES (?1, 'signup', ?2)").bind(crypto.randomUUID(), now).run();
    return fail(400, 'invalid_invite', '쓸 수 없는 초대 코드예요. 초대해 준 사람에게 새 코드를 받아 주세요.');
  }
  const key = await emailKey(db, email);
  if (await db.prepare('SELECT 1 FROM member_accounts WHERE email_key = ?1').bind(key).first()) return fail(409, 'email_taken', '이미 가입한 이메일이에요. 로그인해 주세요.');
  const member = hex(crypto.getRandomValues(new Uint8Array(16)));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await passwordHash(b.password, salt);
  let results;
  try {
    results = await db.batch([
      db.prepare('UPDATE member_invites SET used_at = ?2, used_by = ?3 WHERE code = ?1 AND used_at IS NULL AND revoked_at IS NULL').bind(code, now, member),
      db.prepare(`INSERT INTO member_accounts (member, email_key, salt, hash, iterations, invite, created_at)
        SELECT ?1, ?2, ?3, ?4, ?5, id, ?6 FROM member_invites WHERE code = ?7 AND used_by = ?1`).bind(member, key, hex(salt), hash, ITERATIONS, now, code),
    ]);
  } catch {
    const taken = await db.prepare('SELECT 1 FROM member_accounts WHERE email_key = ?1').bind(key).first().catch(() => null);
    return taken ? fail(409, 'email_taken', '이미 가입한 이메일이에요. 로그인해 주세요.') : fail(503, 'error', '잠시 뒤에 다시 해 주세요.');
  }
  if (results[0].meta?.changes !== 1 || results[1].meta?.changes !== 1) return fail(400, 'invalid_invite', '쓸 수 없는 초대 코드예요. 초대해 준 사람에게 새 코드를 받아 주세요.');
  return json(200, { ok: true, scope: await memberStorageScope(member) }, [await newSession(env, member, 'password', now), clearOwnerCookie()]);
}

async function signin(request, env, db, now) {
  const b = await body(request, ['email', 'password']);
  const email = normalEmail(b?.email);
  if (!email || typeof b.password !== 'string' || b.password.length > 128) return fail(401, 'invalid_login', '이메일이나 비밀번호가 맞지 않아요.');
  const key = await emailKey(db, email);
  const since = now - ATTEMPT_WINDOW;
  // 확인 전에 시도를 먼저 기록한다(동시에 여러 번 보내도 한도를 넘지 못하게). 맞으면 그 기록을 지운다.
  // 전체 잠금은 두지 않는다(남이 틀려서 모두가 막히지 않게). 한 이메일당 15분 10번.
  const attempt = crypto.randomUUID();
  const [, reserved] = await db.batch([
    db.prepare('DELETE FROM member_login_attempts WHERE created_at <= ?1').bind(since),
    db.prepare(`INSERT INTO member_login_attempts (id, email_key, created_at) SELECT ?1, ?2, ?3
      WHERE (SELECT COUNT(*) FROM member_login_attempts WHERE email_key = ?2 AND created_at > ?4) < ?5`).bind(attempt, key, now, since, ATTEMPTS_PER_EMAIL),
  ]);
  if (reserved.meta?.changes !== 1) return fail(429, 'too_many', '잠시 뒤에 다시 해 주세요.');
  const row = await db.prepare('SELECT member, salt, hash, iterations FROM member_accounts WHERE email_key = ?1').bind(key).first();
  const salt = row ? fromHex(row.salt) : crypto.getRandomValues(new Uint8Array(16));
  const hash = await passwordHash(b.password, salt, row ? Number(row.iterations) : ITERATIONS); // 없는 계정도 같은 시간을 쓴다
  if (!row || !same(hash, row.hash)) return fail(401, 'invalid_login', '이메일이나 비밀번호가 맞지 않아요.');
  await db.prepare('DELETE FROM member_login_attempts WHERE id = ?1').bind(attempt).run();
  return json(200, { ok: true, scope: await memberStorageScope(row.member) }, [await newSession(env, row.member, 'password', now), clearOwnerCookie()]);
}

function sessionToken(request) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return v.join('=');
  }
  return null;
}
const clearCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

async function deleteAccount(request, db, member) {
  const b = await body(request, ['confirm']);
  if (b?.confirm !== true) return fail(400, 'confirm_required', '한 번 더 확인해 주세요.');
  await removeMember(db, member);
  return json(200, { ok: true }, [clearCookie, clearOwnerCookie()]);
}
async function removeMember(db, member, after = []) {
  // 커뮤니티/세션을 아직 쓰지 않았다면 표가 없을 수 있다. 실제 삭제 오류는 삼키지 않는다.
  const { results } = await db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view')").all();
  const optional = new Set(['community_post_details', 'community_photos', 'community_reports', 'community_posts', 'community_post_usage', 'community_blocks', 'community_members', 'member_sessions']);
  const tables = new Set();
  for (const row of results) {
    const name = String(row.name).toLowerCase();
    if (row.type === 'table') tables.add(name);
    else if (optional.has(name) || name === 'member_accounts') throw Error('unsupported member storage');
  }
  if (!tables.has('member_accounts')) throw Error('incomplete member storage');
  // Recover owned post references from photos/usage left by an older partial deletion.
  const related = [];
  if (tables.has('community_posts')) related.push('SELECT id FROM community_posts WHERE member = ?1');
  if (tables.has('community_photos')) related.push('SELECT post FROM community_photos WHERE member = ?1');
  if (tables.has('community_post_usage')) related.push("SELECT substr(id, 6) FROM community_post_usage WHERE member = ?1 AND id LIKE 'post:%'", "SELECT substr(id, 8) FROM community_post_usage WHERE member = ?1 AND id LIKE 'legacy:%'");
  if (tables.has('community_post_details') && !related.length) throw Error('incomplete community storage');
  const relatedIds = related.join(' UNION ');
  const otherAuthor = column => tables.has('community_posts')
    ? ` AND NOT EXISTS (SELECT 1 FROM community_posts p WHERE p.id = ${column} AND p.member <> ?1)` : '';
  const sql = [];
  if (tables.has('community_post_details')) sql.push(`DELETE FROM community_post_details WHERE post IN (${relatedIds})${otherAuthor('community_post_details.post')}`);
  if (tables.has('community_reports')) sql.push(relatedIds
    ? `DELETE FROM community_reports WHERE member = ?1 OR (post IN (${relatedIds})${otherAuthor('community_reports.post')})`
    : 'DELETE FROM community_reports WHERE member = ?1');
  if (tables.has('community_photos')) sql.push('DELETE FROM community_photos WHERE member = ?1');
  if (tables.has('community_blocks')) sql.push('DELETE FROM community_blocks WHERE member = ?1 OR blocked = ?1');
  if (tables.has('community_posts')) sql.push('DELETE FROM community_posts WHERE member = ?1');
  if (tables.has('community_members')) sql.push('DELETE FROM community_members WHERE member = ?1');
  if (tables.has('member_sessions')) sql.push('DELETE FROM member_sessions WHERE member = ?1');
  sql.push('DELETE FROM member_accounts WHERE member = ?1');
  // 새 부가 정보·사진·글·세션·계정과 초대 해제를 같은 DB 트랜잭션에서 마친다.
  // 공용 설정, 다른 회원 자료, 기존 사용량 보존 정책은 바꾸지 않는다.
  await db.batch([...sql.map(query => db.prepare(query).bind(member)), ...after]);
}

// who: {} 로그인 전, {member} 초대 회원, {owner:true} 본인. Worker가 정한다.
export async function handleMemberAccounts(request, env = {}, who = {}, { now = Date.now } = {}) {
  if (env.MEMBER_APP_MODE !== 'invite') return null;
  const db = dbOf(env);
  if (!db) return fail(503, 'not_configured', '저장소가 연결되지 않았어요.');
  const url = new URL(request.url);
  const path = url.pathname, method = request.method;
  if (method === 'POST' && request.headers.get('origin') !== url.origin) return fail(403, 'invalid_origin', '다른 곳에서 온 요청이에요.');
  try {
    await ensureSchema(db);
    const at = now();
    if (path === '/_member/signup' && method === 'GET') return signupPage(url);
    if (path === '/_member/signin' && method === 'GET') return signinPage();
    if (path === '/_member/password/signup' && method === 'POST') return await signup(request, env, db, at);
    if (path === '/_member/password/signin' && method === 'POST') return await signin(request, env, db, at);
    if (path.startsWith('/_member/account')) {
      if (!who.member) return fail(401, 'unauthorized', '로그인이 필요해요.');
      if (path === '/_member/account' && method === 'GET') return accountPage();
      if (path === '/_member/account/logout' && method === 'POST') {
        const token = sessionToken(request);
        if (token) await db.prepare('DELETE FROM member_sessions WHERE token_hash = ?1').bind(await sha256(token)).run();
        return json(200, { ok: true }, [clearCookie, clearOwnerCookie()]);
      }
      if (path === '/_member/account/delete' && method === 'POST') return await deleteAccount(request, db, who.member);
    }
    if (path.startsWith('/_member/invites')) {
      if (who.owner !== true) return fail(403, 'owner_only', '초대는 운영자만 만들 수 있어요.');
      if (path === '/_member/invites' && method === 'GET') {
        return url.searchParams.get('format') === 'json' ? json(200, { items: await listInvites(db, url.origin) }) : await invitesPage(db, url.origin);
      }
      if (path === '/_member/invites' && method === 'POST') {
        const b = await body(request, ['label']);
        const label = typeof b?.label === 'string' ? b.label.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 30) : '';
        if (!label) return fail(400, 'invalid', '누구에게 보낼지 적어 주세요.');
        for (let i = 0; i < 5; i++) {
          const code = newCode();
          try {
            await db.prepare('INSERT INTO member_invites (id, code, label, created_at) VALUES (?1, ?2, ?3, ?4)').bind(crypto.randomUUID(), code, label, at).run();
            return json(200, { code: showCode(code), label, link: `${url.origin}/_member/signup?code=${showCode(code)}` });
          } catch {}
        }
        return fail(503, 'error', '잠시 뒤에 다시 해 주세요.');
      }
      if (path === '/_member/invites/remove' && method === 'POST') {
        // 가입한 회원 끊기: 계정·세션·코디 공유 글을 지운다(보안 검토 10-28: 대표가 회원을 끊을 방법이 없었음).
        const b = await body(request, ['code']);
        const inv = await db.prepare('SELECT used_by FROM member_invites WHERE code = ?1 AND used_by IS NOT NULL').bind(normalCode(b?.code)).first();
        if (!inv) return fail(404, 'not_found', '가입한 회원이 없는 코드예요.');
        await removeMember(db, inv.used_by, [db.prepare('UPDATE member_invites SET revoked_at = ?2 WHERE code = ?1').bind(normalCode(b?.code), at)]);
        return json(200, { ok: true });
      }
      if (path === '/_member/invites/revoke' && method === 'POST') {
        const b = await body(request, ['code']);
        await db.prepare('UPDATE member_invites SET revoked_at = ?2 WHERE code = ?1 AND used_at IS NULL AND revoked_at IS NULL').bind(normalCode(b?.code), at).run();
        return json(200, { ok: true });
      }
    }
    return fail(404, 'not_found', '없는 주소예요.');
  } catch { return fail(503, 'error', '잠시 뒤에 다시 해 주세요.'); }
}
