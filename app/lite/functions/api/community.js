// 코디 공유(커뮤니티) API. Cloudflare D1(바인딩 CROWD_DB, 같은 DB) 위에서 돈다.
// 대표 10-28 08:08: 누구나 가입, 직접 찍은 사진, 코디 공유 먼저. 09:39 "끝까지". 설계: docs/log/2026-10/community-plan-20261028.md
//
// 스위치 COMMUNITY_MODE (Cloudflare 변수, 기본 없음 = 꺼짐)
//   없음·off·그 밖의 값 → 503 community_off. 아무것도 읽거나 쓰지 않는다.
//   private → 지금의 본인 전용 로그인으로 들어온 한 사람(member 'owner', 운영자)만 쓴다. 혼자 시험하는 단계.
//   public  → 503 public_not_ready. 회원 로그인(카카오 등, C4)이 생기기 전에는 열리지 않는다.
//
// 사진은 화면이 긴 변 1080px JPEG로 다시 그려(위치 정보 등 메타데이터 없음) 보낸다. 글에 동의가 있어야만 받는다.
// 지금은 D1에 base64로 둔다(새 서비스·비용 없음). 서버 전체 상한 COMMUNITY_MAX_MB(기본 300MB)를 넘으면 사진 글만 막는다.
// R2로 옮기는 것은 C3(대표 승인 뒤)다. 로그에는 경로·결과만 남기고 글·이름·사진은 남기지 않는다.
//
//   GET    /api/community/status            → {mode, member:{name}|null, rules, reasons, contact, reviewDays, operator, limits}
//   POST   /api/community/join              {name, rules}
//   GET    /api/community/feed?cursor=&limit=&mine=1 → {items, next}
//   POST   /api/community/posts             {post:{text, pieces, consent}, photos:[base64 JPEG]}
//   DELETE /api/community/posts/:id         (작성자만)
//   GET    /api/community/photos/:id        → image/jpeg (보이는 글의 사진만)
//   POST   /api/community/reports           {post, reason}
//   GET    /api/community/blocks            → {items:[{key, name}]}
//   POST   /api/community/blocks            {post}  (그 글의 작성자를 차단, 상대에게 알리지 않음)
//   DELETE /api/community/blocks/:key
//   POST   /api/community/leave             {confirm:true}  (내 글·사진·신고·차단·이름 삭제)
//   GET    /api/community/review            (운영자) 신고·숨김 글
//   POST   /api/community/review/:id        (운영자) {action: restore|hide|delete, reason?}
import {
  COMMUNITY_LIMITS, COMMUNITY_RULES, COMMUNITY_RULES_VERSION, REPORT_REASONS,
  validateCommunityPost, validateNickname, isCommunityJpeg, reportReasonIds,
} from '../../src/domain/community.js';

const HOUR = 60 * 60 * 1000;
const POSTS_PER_HOUR = 10;
const AUTO_HIDE_REPORTS = 3;
const MEMBER_PHOTOS_MAX = 200;
const MEMBER_BYTES_MAX = 60 * 1024 * 1024;
const BLOCKS_MAX = 500;
const BODY_MAX = 4 * 1024 * 1024;
const REASONS = new Set(reportReasonIds());

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS community_members (
    member TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, rules INTEGER NOT NULL, joined_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS community_posts (
    id TEXT PRIMARY KEY, member TEXT NOT NULL, text TEXT NOT NULL, pieces TEXT NOT NULL, photos INTEGER NOT NULL,
    created_at INTEGER NOT NULL, hidden TEXT, hidden_at INTEGER, reports_since INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS community_posts_time ON community_posts (created_at DESC, id DESC)',
  'CREATE INDEX IF NOT EXISTS community_posts_member ON community_posts (member, created_at)',
  `CREATE TABLE IF NOT EXISTS community_photos (
    id TEXT PRIMARY KEY, post TEXT NOT NULL, member TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS community_photos_post ON community_photos (post, idx)',
  'CREATE INDEX IF NOT EXISTS community_photos_member ON community_photos (member)',
  `CREATE TABLE IF NOT EXISTS community_reports (
    post TEXT NOT NULL, member TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (post, member))`,
  'CREATE INDEX IF NOT EXISTS community_reports_member ON community_reports (member)',
  `CREATE TABLE IF NOT EXISTS community_blocks (
    member TEXT NOT NULL, blocked TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (member, blocked))`,
  'CREATE INDEX IF NOT EXISTS community_blocks_blocked ON community_blocks (blocked)',
  // 글을 지워도 최근 한 시간 올린 수는 남긴다(지우고 다시 올려 한도를 피하지 못하게).
  `CREATE TABLE IF NOT EXISTS community_post_usage (id TEXT PRIMARY KEY, member TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS community_usage_member ON community_post_usage (member, created_at)',
  // 처리 기록: 글 번호·처리·사유·신고 수·시각만. 작성자·글·사진은 없다.
  `CREATE TABLE IF NOT EXISTS community_log (
    id TEXT PRIMARY KEY, post TEXT NOT NULL, action TEXT NOT NULL, reason TEXT, reports INTEGER, first_report_at INTEGER, at INTEGER NOT NULL)`,
];

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const fail = (status, code, message) => reply(status, { code, message });

const ready = new WeakSet();
async function ensureSchema(db) {
  if (ready.has(db)) return;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  ready.add(db);
}
const reviewDays = (env) => Math.max(1, Math.min(30, Number(env.COMMUNITY_REVIEW_DAYS) || 7));
const maxBytes = (env) => Math.max(0, Number(env.COMMUNITY_MAX_MB) || 300) * 1024 * 1024;

function fromBase64(s) {
  if (typeof s !== 'string' || s.length > Math.ceil(COMMUNITY_LIMITS.photoBytesMax / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}
function toBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function blockKey(member, blocked) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${member}|${blocked}`));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function readJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > BODY_MAX) return { error: fail(413, 'too_large', '한 번에 보낼 수 있는 크기를 넘었어요.') };
  try {
    const text = await request.text();
    if (text.length > BODY_MAX) return { error: fail(413, 'too_large', '한 번에 보낼 수 있는 크기를 넘었어요.') };
    return { body: JSON.parse(text) };
  } catch { return { error: fail(400, 'bad_request', 'JSON 본문이 필요해요.') }; }
}

// 보이는 글: 숨겨지지 않았거나 내 글, 내가 신고하지 않은 글, 어느 쪽이든 차단 관계가 없는 글.
const VISIBLE = `(p.hidden IS NULL OR p.member = ?1)
  AND NOT EXISTS (SELECT 1 FROM community_reports r WHERE r.post = p.id AND r.member = ?1)
  AND NOT EXISTS (SELECT 1 FROM community_blocks b WHERE (b.member = ?1 AND b.blocked = p.member) OR (b.member = p.member AND b.blocked = ?1))`;

async function memberRow(db, member) {
  return db.prepare('SELECT name, rules FROM community_members WHERE member = ?1').bind(member).first();
}

async function status(env, db, who) {
  const row = await memberRow(db, who.member);
  return reply(200, {
    mode: 'private',
    member: row && row.rules === COMMUNITY_RULES_VERSION ? { name: row.name } : null,
    rules: { version: COMMUNITY_RULES_VERSION, items: COMMUNITY_RULES },
    reasons: REPORT_REASONS.map(([id, label]) => ({ id, label })),
    contact: env.COMMUNITY_CONTACT || null,
    reviewDays: reviewDays(env),
    operator: who.operator === true,
    limits: { textMax: COMMUNITY_LIMITS.textMax, piecesMax: COMMUNITY_LIMITS.piecesMax, photosMax: COMMUNITY_LIMITS.photosMax, photoBytesMax: COMMUNITY_LIMITS.photoBytesMax },
  });
}

async function join(request, db, who, now) {
  const { body, error } = await readJson(request);
  if (error) return error;
  if (body?.rules !== COMMUNITY_RULES_VERSION) return fail(400, 'rules_required', '규칙을 읽고 동의해 주세요.');
  const name = validateNickname(body?.name);
  if (!name.ok) return fail(400, 'invalid', name.message);
  const taken = await db.prepare('SELECT member FROM community_members WHERE name_key = ?1 AND member <> ?2').bind(name.key, who.member).first();
  if (taken) return fail(409, 'name_taken', '이미 쓰는 이름이에요. 다른 이름을 지어 주세요.');
  try {
    await db.prepare(`INSERT INTO community_members (member, name, name_key, rules, joined_at) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT (member) DO UPDATE SET name = excluded.name, name_key = excluded.name_key, rules = excluded.rules`)
      .bind(who.member, name.name, name.key, COMMUNITY_RULES_VERSION, now).run();
  } catch { return fail(409, 'name_taken', '이미 쓰는 이름이에요. 다른 이름을 지어 주세요.'); }
  return reply(200, { member: { name: name.name } });
}

async function feed(url, db, who) {
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 20));
  const mine = url.searchParams.get('mine') === '1';
  const cursor = url.searchParams.get('cursor') || '';
  const args = [who.member, limit + 1];
  let where = VISIBLE;
  if (mine) where += ' AND p.member = ?1';
  if (cursor) {
    const m = /^(\d{1,16})\.([0-9a-f-]{36})$/.exec(cursor);
    if (!m) return fail(400, 'bad_request', '목록 위치가 올바르지 않아요.');
    args.push(Number(m[1]), m[2]);
    where += ' AND (p.created_at < ?3 OR (p.created_at = ?3 AND p.id < ?4))';
  }
  const { results } = await db.prepare(`SELECT p.id, p.member, p.text, p.pieces, p.created_at, p.hidden, m.name
    FROM community_posts p JOIN community_members m ON m.member = p.member
    WHERE ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT ?2`).bind(...args).all();
  const rows = results.slice(0, limit);
  const photos = new Map(rows.map((r) => [r.id, []]));
  if (rows.length) {
    const marks = rows.map((_, i) => `?${i + 1}`).join(',');
    const { results: ph } = await db.prepare(`SELECT id, post FROM community_photos WHERE post IN (${marks}) ORDER BY post, idx`).bind(...rows.map((r) => r.id)).all();
    for (const p of ph) photos.get(p.post)?.push(p.id);
  }
  const last = rows[rows.length - 1];
  return reply(200, {
    items: rows.map((r) => ({
      id: r.id,
      author: { name: r.name },
      mine: r.member === who.member,
      text: r.text,
      pieces: JSON.parse(r.pieces),
      photos: photos.get(r.id),
      createdAt: Number(r.created_at),
      hidden: r.member === who.member ? r.hidden ?? null : null,
    })),
    next: results.length > limit && last ? `${last.created_at}.${last.id}` : null,
  });
}

async function createPost(request, env, db, who, now) {
  const { body, error } = await readJson(request);
  if (error) return error;
  if (!body || typeof body !== 'object' || Object.keys(body).some((k) => k !== 'post' && k !== 'photos')) return fail(400, 'bad_request', '글 형식이 올바르지 않아요.');
  const raw = body.photos ?? [];
  if (!Array.isArray(raw) || raw.length > COMMUNITY_LIMITS.photosMax) return fail(400, 'invalid', `사진은 ${COMMUNITY_LIMITS.photosMax}장까지 올릴 수 있어요.`);
  const photos = [];
  for (const s of raw) {
    const bytes = fromBase64(s);
    if (!bytes || !isCommunityJpeg(bytes)) return fail(400, 'invalid', '사진을 읽지 못했어요. 다시 골라 주세요.');
    photos.push({ data: s, size: bytes.length });
  }
  const checked = validateCommunityPost(body.post, { photos: photos.length });
  if (!checked.ok) return fail(400, 'invalid', checked.message);
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM community_post_usage WHERE member = ?1 AND created_at > ?2').bind(who.member, now - HOUR).first();
  if (Number(recent?.n) >= POSTS_PER_HOUR) return fail(429, 'hourly_limit', `한 시간에 ${POSTS_PER_HOUR}개까지 올릴 수 있어요. 조금 뒤에 다시 올려 주세요.`);
  if (photos.length) {
    const adding = photos.reduce((n, p) => n + p.size, 0);
    const total = await db.prepare('SELECT COALESCE(SUM(size), 0) AS bytes FROM community_photos').first();
    if (Number(total?.bytes) + adding > maxBytes(env)) return fail(507, 'storage_full', '사진 저장 공간이 다 찼어요. 사진 없이 올리거나 운영자에게 알려 주세요.');
    const mine = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM community_photos WHERE member = ?1').bind(who.member).first();
    if (Number(mine?.n) + photos.length > MEMBER_PHOTOS_MAX || Number(mine?.bytes) + adding > MEMBER_BYTES_MAX) return fail(507, 'member_storage_full', '내 사진 저장 한도에 닿았어요. 예전 글을 지우면 다시 올릴 수 있어요.');
  }
  const id = crypto.randomUUID();
  const statements = [
    db.prepare('DELETE FROM community_post_usage WHERE created_at <= ?1').bind(now - HOUR),
    db.prepare('INSERT INTO community_post_usage (id, member, created_at) VALUES (?1, ?2, ?3)').bind(crypto.randomUUID(), who.member, now),
    db.prepare('INSERT INTO community_posts (id, member, text, pieces, photos, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(id, who.member, checked.post.text, JSON.stringify(checked.post.pieces), photos.length, now),
    ...photos.map((p, i) => db.prepare('INSERT INTO community_photos (id, post, member, idx, data, size, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(crypto.randomUUID(), id, who.member, i, p.data, p.size, now)),
  ];
  await db.batch(statements);
  return reply(200, { id });
}

async function deletePost(db, who, id) {
  const [, , gone] = await db.batch([
    db.prepare('DELETE FROM community_photos WHERE post = ?1 AND EXISTS (SELECT 1 FROM community_posts WHERE id = ?1 AND member = ?2)').bind(id, who.member),
    db.prepare('DELETE FROM community_reports WHERE post = ?1 AND EXISTS (SELECT 1 FROM community_posts WHERE id = ?1 AND member = ?2)').bind(id, who.member),
    db.prepare('DELETE FROM community_posts WHERE id = ?1 AND member = ?2').bind(id, who.member),
  ]);
  if (!gone.meta?.changes) return fail(404, 'not_found', '글을 찾지 못했어요.');
  return reply(200, { ok: true });
}

async function photo(db, who, id) {
  const row = await db.prepare(`SELECT ph.data FROM community_photos ph JOIN community_posts p ON p.id = ph.post
    WHERE ph.id = ?2 AND ${VISIBLE}`).bind(who.member, id).first();
  if (!row) return fail(404, 'not_found', '사진을 찾지 못했어요.');
  return new Response(toBytes(row.data), { status: 200, headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' } });
}

async function report(request, env, db, who, now) {
  const { body, error } = await readJson(request);
  if (error) return error;
  if (!REASONS.has(body?.reason)) return fail(400, 'invalid', '신고 이유를 골라 주세요.');
  const post = await db.prepare('SELECT id, member, hidden, reports_since FROM community_posts WHERE id = ?1').bind(String(body?.post || '')).first();
  if (!post) return fail(404, 'not_found', '글을 찾지 못했어요.');
  if (post.member === who.member) return fail(400, 'invalid', '내 글은 신고할 수 없어요. 지우기를 써 주세요.');
  await db.prepare('INSERT OR IGNORE INTO community_reports (post, member, reason, created_at) VALUES (?1, ?2, ?3, ?4)').bind(post.id, who.member, body.reason, now).run();
  const count = await db.prepare('SELECT COUNT(*) AS n, MIN(created_at) AS first FROM community_reports WHERE post = ?1 AND created_at >= ?2').bind(post.id, Number(post.reports_since) || 0).first();
  if (post.hidden === null && Number(count?.n) >= AUTO_HIDE_REPORTS) {
    await db.batch([
      db.prepare("UPDATE community_posts SET hidden = 'reports', hidden_at = ?2 WHERE id = ?1 AND hidden IS NULL").bind(post.id, now),
      db.prepare('INSERT INTO community_log (id, post, action, reason, reports, first_report_at, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
        .bind(crypto.randomUUID(), post.id, 'auto_hide', 'reports', Number(count.n), Number(count.first), now),
    ]);
  }
  return reply(200, { ok: true, reviewDays: reviewDays(env) });
}

async function blocks(request, url, db, who, now, rest) {
  if (request.method === 'GET') {
    const { results } = await db.prepare(`SELECT b.blocked, m.name FROM community_blocks b LEFT JOIN community_members m ON m.member = b.blocked
      WHERE b.member = ?1 ORDER BY b.created_at`).bind(who.member).all();
    return reply(200, { items: await Promise.all(results.map(async (r) => ({ key: await blockKey(who.member, r.blocked), name: r.name || '나간 회원' }))) });
  }
  if (request.method === 'POST') {
    const { body, error } = await readJson(request);
    if (error) return error;
    const post = await db.prepare('SELECT member FROM community_posts WHERE id = ?1').bind(String(body?.post || '')).first();
    if (!post) return fail(404, 'not_found', '글을 찾지 못했어요.');
    if (post.member === who.member) return fail(400, 'invalid', '나를 차단할 수는 없어요.');
    const n = await db.prepare('SELECT COUNT(*) AS n FROM community_blocks WHERE member = ?1').bind(who.member).first();
    if (Number(n?.n) >= BLOCKS_MAX) return fail(429, 'block_limit', `${BLOCKS_MAX}명까지 차단할 수 있어요.`);
    await db.prepare('INSERT OR IGNORE INTO community_blocks (member, blocked, created_at) VALUES (?1, ?2, ?3)').bind(who.member, post.member, now).run();
    return reply(200, { ok: true });
  }
  if (request.method === 'DELETE' && rest) {
    const { results } = await db.prepare('SELECT blocked FROM community_blocks WHERE member = ?1').bind(who.member).all();
    for (const r of results) {
      if (await blockKey(who.member, r.blocked) === rest) {
        await db.prepare('DELETE FROM community_blocks WHERE member = ?1 AND blocked = ?2').bind(who.member, r.blocked).run();
        return reply(200, { ok: true });
      }
    }
    return fail(404, 'not_found', '차단 목록에 없어요.');
  }
  return fail(405, 'method', '지원하지 않는 요청이에요.');
}

async function leave(request, db, who) {
  const { body, error } = await readJson(request);
  if (error) return error;
  if (body?.confirm !== true) return fail(400, 'confirm_required', '나가기를 한 번 더 확인해 주세요.');
  await db.batch([
    db.prepare('DELETE FROM community_photos WHERE member = ?1').bind(who.member),
    db.prepare('DELETE FROM community_reports WHERE member = ?1 OR post IN (SELECT id FROM community_posts WHERE member = ?1)').bind(who.member),
    db.prepare('DELETE FROM community_posts WHERE member = ?1').bind(who.member),
    db.prepare('DELETE FROM community_blocks WHERE member = ?1 OR blocked = ?1').bind(who.member),
    db.prepare('DELETE FROM community_members WHERE member = ?1').bind(who.member),
  ]);
  return reply(200, { ok: true });
}

async function review(request, db, who, now, rest) {
  if (who.operator !== true) return fail(403, 'operator_only', '운영자만 볼 수 있어요.');
  if (request.method === 'GET' && !rest) {
    const { results } = await db.prepare(`SELECT p.id, p.text, p.pieces, p.hidden, m.name,
        (SELECT COUNT(*) FROM community_reports r WHERE r.post = p.id AND r.created_at >= p.reports_since) AS reports,
        (SELECT MIN(created_at) FROM community_reports r WHERE r.post = p.id AND r.created_at >= p.reports_since) AS first,
        (SELECT group_concat(reason) FROM community_reports r WHERE r.post = p.id AND r.created_at >= p.reports_since) AS reasons
      FROM community_posts p JOIN community_members m ON m.member = p.member
      WHERE p.hidden IS NOT NULL OR EXISTS (SELECT 1 FROM community_reports r WHERE r.post = p.id AND r.created_at >= p.reports_since)
      ORDER BY first IS NULL, first`).all();
    const ids = results.map((r) => r.id);
    const photos = new Map(ids.map((id) => [id, []]));
    if (ids.length) {
      const { results: ph } = await db.prepare(`SELECT id, post FROM community_photos WHERE post IN (${ids.map((_, i) => `?${i + 1}`).join(',')}) ORDER BY post, idx`).bind(...ids).all();
      for (const p of ph) photos.get(p.post)?.push(p.id);
    }
    return reply(200, {
      items: results.map((r) => ({
        id: r.id, author: { name: r.name }, text: r.text, pieces: JSON.parse(r.pieces), photos: photos.get(r.id),
        hidden: r.hidden ?? null, reports: Number(r.reports), firstReportAt: r.first === null ? null : Number(r.first),
        reasons: String(r.reasons || '').split(',').filter(Boolean).reduce((o, k) => ({ ...o, [k]: (o[k] || 0) + 1 }), {}),
      })),
    });
  }
  if (request.method === 'POST' && rest) {
    const { body, error } = await readJson(request);
    if (error) return error;
    const post = await db.prepare('SELECT id FROM community_posts WHERE id = ?1').bind(rest).first();
    if (!post) return fail(404, 'not_found', '글을 찾지 못했어요.');
    const reason = REASONS.has(body?.reason) ? body.reason : null;
    const log = (action) => db.prepare('INSERT INTO community_log (id, post, action, reason, reports, first_report_at, at) VALUES (?1, ?2, ?3, ?4, NULL, NULL, ?5)')
      .bind(crypto.randomUUID(), post.id, action, reason, now);
    if (body?.action === 'restore') {
      await db.batch([db.prepare('UPDATE community_posts SET hidden = NULL, hidden_at = NULL, reports_since = ?2 WHERE id = ?1').bind(post.id, now + 1), log('restore')]);
    } else if (body?.action === 'hide') {
      await db.batch([db.prepare('UPDATE community_posts SET hidden = ?2, hidden_at = ?3 WHERE id = ?1').bind(post.id, reason || 'operator', now), log('hide')]);
    } else if (body?.action === 'delete') {
      await db.batch([
        db.prepare('DELETE FROM community_photos WHERE post = ?1').bind(post.id),
        db.prepare('DELETE FROM community_reports WHERE post = ?1').bind(post.id),
        db.prepare('DELETE FROM community_posts WHERE id = ?1').bind(post.id),
        log('delete'),
      ]);
    } else return fail(400, 'invalid', '처리를 골라 주세요.');
    return reply(200, { ok: true });
  }
  return fail(405, 'method', '지원하지 않는 요청이에요.');
}

export async function handleCommunity(request, env = {}, who = {}, { now = Date.now } = {}) {
  const mode = env.COMMUNITY_MODE;
  if (mode === 'public') return fail(503, 'public_not_ready', '코디 공유는 회원 로그인을 준비한 뒤에 열어요.');
  if (mode !== 'private') return fail(503, 'community_off', '코디 공유는 아직 열지 않았어요.');
  const db = env.CROWD_DB;
  if (!db) return fail(503, 'not_configured', '코디 공유 저장소가 연결되지 않았어요.');
  if (typeof who?.member !== 'string' || !who.member) return fail(401, 'unauthorized', '로그인이 필요해요.');
  const url = new URL(request.url);
  const [, , , section = '', rest = '', extra] = url.pathname.split('/');
  if (extra !== undefined) return fail(404, 'not_found', '없는 주소예요.');
  const at = now();
  try {
    await ensureSchema(db);
    const method = request.method;
    if (section === 'status' && method === 'GET') return await status(env, db, who);
    if (section === 'join' && method === 'POST') return await join(request, db, who, at);
    if (section === 'leave' && method === 'POST') return await leave(request, db, who);
    if (section === 'photos' && method === 'GET' && rest) return await photo(db, who, rest);
    if (section === 'review') return await review(request, db, who, at, rest);
    // 아래는 가입한 회원만.
    const row = await memberRow(db, who.member);
    if (!row || row.rules !== COMMUNITY_RULES_VERSION) return fail(403, 'join_required', '규칙에 동의하고 이름을 정한 뒤에 쓸 수 있어요.');
    if (section === 'feed' && method === 'GET') return await feed(url, db, who);
    if (section === 'posts' && method === 'POST' && !rest) return await createPost(request, env, db, who, at);
    if (section === 'posts' && method === 'DELETE' && rest) return await deletePost(db, who, rest);
    if (section === 'reports' && method === 'POST') return await report(request, env, db, who, at);
    if (section === 'blocks') return await blocks(request, url, db, who, at, rest);
    return fail(404, 'not_found', '없는 주소예요.');
  } catch {
    // 글·이름·사진은 남기지 않는다.
    return fail(500, 'error', '잠시 뒤에 다시 해 주세요.');
  }
}
