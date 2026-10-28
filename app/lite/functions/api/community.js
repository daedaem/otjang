// 코디 공유(커뮤니티) API. Cloudflare D1(바인딩 CROWD_DB, 같은 DB) 위에서 돈다.
// 대표 10-28 08:08: 누구나 가입, 직접 찍은 사진, 코디 공유 먼저. 09:39 "끝까지". 설계: docs/log/2026-10/community-plan-20261028.md
//
// 스위치 COMMUNITY_MODE (Cloudflare 변수, 기본 없음 = 꺼짐)
//   없음·off·그 밖의 값 → 503 community_off. 아무것도 읽거나 쓰지 않는다.
//   private → 지금의 본인 전용 로그인으로 들어온 한 사람(member 'owner', 운영자)만 쓴다. 혼자 시험하는 단계.
//   public  → 누구나 가입(대표 10-28 08:08). 운영자 이름(COMMUNITY_OPERATOR)·연락처(COMMUNITY_CONTACT)·회원 로그인 설정
//             (MEMBER_SESSION_SECRET + 카카오 또는 구글 키)이 모두 있어야 열리고, 하나라도 없으면 503 public_not_ready와 빠진 것을 알린다.
//             로그인하지 않은 사람은 상태만 볼 수 있다. 회원은 worker.js가 회원 세션으로 확인해 넘긴다.
//
// 사진은 화면이 긴 변 1080px JPEG로 다시 그려(위치 정보 등 메타데이터 없음) 보낸다. 글에 동의가 있어야만 받는다.
// 지금은 D1에 base64로 둔다(새 서비스·비용 없음). 서버 전체 상한 COMMUNITY_MAX_MB(기본 300MB)를 넘으면 사진 글만 막는다.
// R2로 옮기는 것은 C3(대표 승인 뒤)다. 로그에는 경로·결과만 남기고 글·이름·사진은 남기지 않는다.
//
//   GET    /api/community/status            → {mode, member:{name}|null, rules, reasons, contact, reviewDays, operator, limits}
//   POST   /api/community/join              {name, rules}
//   GET    /api/community/feed?board=outfits|sale|free&cursor=&limit=&mine=1 → {items, next}
//   POST   /api/community/posts             {post:{board?,title?,sale?,text,pieces,consent},photos:[base64 JPEG]}
//   PATCH  /api/community/posts/:id         {post,revision} (작성자, 글자만·충돌 거절, 사진/게시판 고정)
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
  validateCommunityPost, validateNickname, isCommunityJpeg, reportReasonIds, communityBoard, COMMUNITY_BOARDS,
} from '../../src/domain/community.js';
import { memberLoginOptions, endMemberSessions } from '../lib/member-session.js';

const HOUR = 60 * 60 * 1000;
const POSTS_PER_HOUR = 10;
const AUTO_HIDE_REPORTS = 3;
const MEMBER_PHOTOS_MAX = 200;
const MEMBER_BYTES_MAX = 60 * 1024 * 1024;
const BLOCKS_MAX = 500;
const BODY_MAX = 4 * 1024 * 1024;
const COMMUNITY_MIN_AGE = 14; // 대표 10-28 11:47: 만 14세 미만은 받지 않는다(법정대리인 동의 절차 없음)
const REASONS = new Set(reportReasonIds());

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS community_members (
    member TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, rules INTEGER NOT NULL, joined_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS community_posts (
    id TEXT PRIMARY KEY, member TEXT NOT NULL, text TEXT NOT NULL, pieces TEXT NOT NULL, photos INTEGER NOT NULL,
    created_at INTEGER NOT NULL, hidden TEXT, hidden_at INTEGER, reports_since INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS community_posts_time ON community_posts (created_at DESC, id DESC)',
  'CREATE INDEX IF NOT EXISTS community_posts_member ON community_posts (member, created_at)',
  // 부가 정보만 새 테이블에 둔다. 옛 글/사진의 스키마·바이트를 수정하지 않는다.
  `CREATE TABLE IF NOT EXISTS community_post_details (
    post TEXT PRIMARY KEY, board TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', sale TEXT,
    revision INTEGER NOT NULL, updated_at INTEGER NOT NULL, edit_token TEXT)`,
  'CREATE INDEX IF NOT EXISTS community_details_board ON community_post_details (board, post)',
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

// 공개 커뮤니티는 개인 앱 DB와 다른 D1(바인딩 COMMUNITY_DB)에 둔다(보안 검토 10-28: 누구나 가입하면 개인 자료와 같은 DB를 채울 수 있음).
// private에서는 COMMUNITY_DB가 없으면 기존 CROWD_DB를 쓴다.
export const communityDb = (env) => env.COMMUNITY_DB || env.CROWD_DB;
export function publicMissing(env) {
  const missing = [];
  if (!env.COMMUNITY_DB || env.COMMUNITY_DB === env.CROWD_DB || env.COMMUNITY_DB === env.RANK_DB) missing.push('database');
  if (!env.COMMUNITY_OPERATOR) missing.push('operator');
  if (!env.COMMUNITY_CONTACT) missing.push('contact');
  const login = memberLoginOptions(env);
  if (!login.kakao && !login.google && !login.email) missing.push('login');
  return missing;
}
const operatorInfo = (env) => (env.COMMUNITY_OPERATOR || env.COMMUNITY_CONTACT ? {
  name: env.COMMUNITY_OPERATOR || null, contact: env.COMMUNITY_CONTACT || null, privacyOfficer: env.COMMUNITY_PRIVACY_OFFICER || env.COMMUNITY_OPERATOR || null,
} : null);

async function status(env, db, who) {
  const signedIn = typeof who.member === 'string' && !!who.member;
  const row = signedIn ? await memberRow(db, who.member) : null;
  return reply(200, {
    mode: env.COMMUNITY_MODE,
    signedIn,
    login: env.COMMUNITY_MODE === 'public' ? memberLoginOptions(env) : null,
    operator: operatorInfo(env),
    minAge: COMMUNITY_MIN_AGE,
    member: row && row.rules === COMMUNITY_RULES_VERSION ? { name: row.name } : null,
    rules: { version: COMMUNITY_RULES_VERSION, items: COMMUNITY_RULES },
    reasons: REPORT_REASONS.map(([id, label]) => ({ id, label })),
    contact: env.COMMUNITY_CONTACT || null,
    reviewDays: reviewDays(env),
    isOperator: who.operator === true,
    boards: COMMUNITY_BOARDS,
    limits: { textMax: COMMUNITY_LIMITS.textMax, piecesMax: COMMUNITY_LIMITS.piecesMax, photosMax: COMMUNITY_LIMITS.photosMax, photoBytesMax: COMMUNITY_LIMITS.photoBytesMax, writesPerHour: POSTS_PER_HOUR },
  });
}

async function join(request, db, who, now) {
  const { body, error } = await readJson(request);
  if (error) return error;
  if (body?.rules !== COMMUNITY_RULES_VERSION) return fail(400, 'rules_required', '규칙을 읽고 동의해 주세요.');
  if (body?.age14 !== true) return fail(400, 'age_required', '만 14세 이상만 가입할 수 있어요.');
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
  const board = communityBoard(url.searchParams.has('board') ? url.searchParams.get('board') : undefined);
  if (!board) return fail(400, 'invalid_board', '게시판을 목록에서 골라 주세요.');
  const args = [who.member, limit + 1, board];
  let where = VISIBLE + " AND COALESCE(d.board, 'outfits') = ?3";
  if (mine) where += ' AND p.member = ?1';
  if (cursor) {
    const legacy = board === 'outfits' && /^(\d{1,16})\.([0-9a-f-]{36})$/.exec(cursor);
    const scoped = /^(outfits|sale|free)\.(\d{1,16})\.([0-9a-f-]{36})$/.exec(cursor);
    const m = legacy || (scoped?.[1] === board ? [scoped[0], scoped[2], scoped[3]] : null);
    if (!m) return fail(400, 'bad_request', '목록 위치가 올바르지 않아요.');
    args.push(Number(m[1]), m[2]);
    where += ' AND (p.created_at < ?4 OR (p.created_at = ?4 AND p.id < ?5))';
  }
  const { results } = await db.prepare(`SELECT p.id, p.member, p.text, p.pieces, p.created_at, p.hidden, m.name,
      d.board, d.title, d.sale, d.revision, d.updated_at
    FROM community_posts p JOIN community_members m ON m.member = p.member
    LEFT JOIN community_post_details d ON d.post = p.id
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
      ...postDetails(r),
    })),
    next: results.length > limit && last ? `${board}.${last.created_at}.${last.id}` : null,
  });
}

function postDetails(row) {
  return {
    board: row.board ?? 'outfits', title: row.title || '', sale: row.sale ? JSON.parse(row.sale) : null,
    revision: row.revision == null ? 0 : Number(row.revision), updatedAt: row.updated_at == null ? null : Number(row.updated_at),
  };
}

async function postingLimit(db, member, now) {
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM community_post_usage WHERE member = ?1 AND created_at > ?2').bind(member, now - HOUR).first();
  return Number(recent?.n) >= POSTS_PER_HOUR;
}
const limited = () => fail(429, 'hourly_limit', `글 작성·수정은 한 시간에 합쳐 ${POSTS_PER_HOUR}번까지 할 수 있어요.`);

// 옛 DB에서 빠진 게시 예약만 보충한다. 이전 예약은 게시 시각과 회원으로 짝을 맞춘다.
// 같은 시각의 여러 글/기존 예약을 함께 세며, 수정 예약은 게시 예약과 구분한다.
// MATERIALIZED가 INSERT 전 스냅샷을 고정하고, 이 문장도 실제 쓰기와 같은 batch에 넣는다.
function legacyReservations(db, member, now) {
  return db.prepare(`WITH recent AS MATERIALIZED (
    SELECT p.id, p.member, p.created_at,
      ROW_NUMBER() OVER (PARTITION BY p.member, p.created_at ORDER BY p.id) AS position,
      (SELECT COUNT(*) FROM community_post_usage u WHERE u.member = p.member
        AND u.created_at = p.created_at AND u.id NOT LIKE 'edit:%') AS reserved
    FROM community_posts p WHERE p.member = ?1 AND p.created_at > ?2)
    INSERT OR IGNORE INTO community_post_usage (id, member, created_at)
    SELECT 'legacy:' || id, member, created_at FROM recent WHERE position > reserved`)
    .bind(member, now - HOUR);
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
  if (await postingLimit(db, who.member, now)) return limited();
  const adding = photos.reduce((n, p) => n + p.size, 0);
  if (photos.length) {
    const total = await db.prepare('SELECT COALESCE(SUM(size), 0) AS bytes FROM community_photos').first();
    if (Number(total?.bytes) + adding > maxBytes(env)) return fail(507, 'storage_full', '사진 저장 공간이 다 찼어요. 사진 없이 올리거나 운영자에게 알려 주세요.');
    const mine = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM community_photos WHERE member = ?1').bind(who.member).first();
    if (Number(mine?.n) + photos.length > MEMBER_PHOTOS_MAX || Number(mine?.bytes) + adding > MEMBER_BYTES_MAX) return fail(507, 'member_storage_full', '내 사진 저장 한도에 닿았어요. 예전 글을 지우면 다시 올릴 수 있어요.');
  }
  const id = crypto.randomUUID();
  const statements = [
    db.prepare('DELETE FROM community_post_usage WHERE created_at <= ?1').bind(now - HOUR),
    legacyReservations(db, who.member, now),
    // 한도 확인·예약·삽입을 같은 트랜잭션 안에 둬 동시 제출도 전 게시판의 상한을 지킨다.
    db.prepare(`INSERT INTO community_posts (id, member, text, pieces, photos, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE
      (SELECT COUNT(*) FROM community_post_usage WHERE member = ?2 AND created_at > ?7) < ?8
      AND (?5 = 0 OR (
        (SELECT COALESCE(SUM(size),0) FROM community_photos) + ?9 <= ?10
        AND (SELECT COUNT(*) FROM community_photos WHERE member = ?2) + ?5 <= ?11
        AND (SELECT COALESCE(SUM(size),0) FROM community_photos WHERE member = ?2) + ?9 <= ?12))`)
      .bind(id, who.member, checked.post.text, JSON.stringify(checked.post.pieces), photos.length, now, now - HOUR, POSTS_PER_HOUR, adding, maxBytes(env), MEMBER_PHOTOS_MAX, MEMBER_BYTES_MAX),
    db.prepare(`INSERT INTO community_post_details (post, board, title, sale, revision, updated_at)
      SELECT ?1, ?2, ?3, ?4, 1, ?5 WHERE EXISTS (SELECT 1 FROM community_posts WHERE id = ?1 AND member = ?6)`)
      .bind(id, checked.post.board ?? 'outfits', checked.post.title || '', checked.post.sale ? JSON.stringify(checked.post.sale) : null, now, who.member),
    db.prepare(`INSERT INTO community_post_usage (id, member, created_at)
      SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM community_posts WHERE id = ?4 AND member = ?2)`)
      .bind('post:' + id, who.member, now, id),
    ...photos.map((p, i) => db.prepare(`INSERT INTO community_photos (id, post, member, idx, data, size, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS (SELECT 1 FROM community_posts WHERE id = ?2 AND member = ?3)`)
      .bind(crypto.randomUUID(), id, who.member, i, p.data, p.size, now)),
  ];
  const [, , inserted] = await db.batch(statements);
  if (!inserted.meta?.changes) {
    if (await postingLimit(db, who.member, now)) return limited();
    return fail(507, 'storage_full', '사진 저장 한도에 닿았어요. 사진 없이 올리거나 잠시 뒤에 다시 해 주세요.');
  }
  return reply(200, { id });
}

async function editPost(request, db, who, id, now) {
  const { body, error } = await readJson(request);
  if (error) return error;
  if (!body || Object.keys(body).some(k => !['post', 'revision'].includes(k)) || !Number.isSafeInteger(body.revision) || body.revision < 0)
    return fail(400, 'invalid', '수정할 글과 목록에서 읽은 버전이 필요해요.');
  const row = await db.prepare(`SELECT p.id, p.pieces, p.photos, d.board, d.revision
    FROM community_posts p LEFT JOIN community_post_details d ON d.post = p.id WHERE p.id = ?1 AND p.member = ?2`).bind(id, who.member).first();
  if (!row) return fail(404, 'not_found', '내 글을 찾지 못했어요.');
  const checked = validateCommunityPost(body.post, { photos: Number(row.photos) });
  if (!checked.ok) return fail(400, 'invalid', checked.message);
  const board = row.board ?? 'outfits';
  if ((checked.post.board ?? 'outfits') !== board || JSON.stringify(checked.post.pieces) !== JSON.stringify(JSON.parse(row.pieces)))
    return fail(400, 'immutable', '수정할 때는 게시판·옷 조각·사진을 바꿀 수 없어요.');
  if (await postingLimit(db, who.member, now)) return limited();
  const token = 'edit:' + crypto.randomUUID();
  const [, , saved] = await db.batch([
    db.prepare('DELETE FROM community_post_usage WHERE created_at <= ?1').bind(now - HOUR),
    legacyReservations(db, who.member, now),
    db.prepare(`INSERT INTO community_post_details (post, board, title, sale, revision, updated_at, edit_token)
      SELECT p.id, ?4, ?5, ?6, 1, ?7, ?8 FROM community_posts p
      WHERE p.id = ?1 AND p.member = ?2
        AND COALESCE((SELECT revision FROM community_post_details WHERE post = p.id),0) = ?3
        AND (SELECT COUNT(*) FROM community_post_usage WHERE member = ?2 AND created_at > ?9) < ?10
      ON CONFLICT(post) DO UPDATE SET title = excluded.title, sale = excluded.sale,
        revision = community_post_details.revision + 1, updated_at = excluded.updated_at, edit_token = excluded.edit_token
      WHERE community_post_details.board = excluded.board AND community_post_details.revision = ?3`)
      .bind(id, who.member, body.revision, board, checked.post.title || '', checked.post.sale ? JSON.stringify(checked.post.sale) : null, now, token, now - HOUR, POSTS_PER_HOUR),
    db.prepare(`UPDATE community_posts SET text = ?1 WHERE id = ?2 AND member = ?3
      AND EXISTS (SELECT 1 FROM community_post_details WHERE post = ?2 AND edit_token = ?4)`)
      .bind(checked.post.text, id, who.member, token),
    db.prepare(`INSERT INTO community_post_usage (id, member, created_at) SELECT ?1, ?2, ?3
      WHERE EXISTS (SELECT 1 FROM community_post_details WHERE post = ?4 AND edit_token = ?1)`)
      .bind(token, who.member, now, id),
  ]);
  if (!saved.meta?.changes) return await postingLimit(db, who.member, now) ? limited() : fail(409, 'conflict', '다른 창에서 글이 바뀌었어요. 작성한 내용을 보관하고 목록을 새로 읽어 주세요.');
  return reply(200, { ok: true, revision: body.revision + 1 });
}

async function deletePost(db, who, id, now) {
  const own = await db.prepare('SELECT id FROM community_posts WHERE id = ?1 AND member = ?2').bind(id, who.member).first();
  if (!own) return fail(404, 'not_found', '글을 찾지 못했어요.');
  const [, , , , gone] = await db.batch([
    legacyReservations(db, who.member, now),
    db.prepare('DELETE FROM community_photos WHERE post = ?1 AND EXISTS (SELECT 1 FROM community_posts WHERE id = ?1 AND member = ?2)').bind(id, who.member),
    db.prepare('DELETE FROM community_reports WHERE post = ?1 AND EXISTS (SELECT 1 FROM community_posts WHERE id = ?1 AND member = ?2)').bind(id, who.member),
    db.prepare('DELETE FROM community_post_details WHERE post = ?1 AND EXISTS (SELECT 1 FROM community_posts WHERE id = ?1 AND member = ?2)').bind(id, who.member),
    db.prepare('DELETE FROM community_posts WHERE id = ?1 AND member = ?2').bind(id, who.member),
  ]);
  if (!gone.meta?.changes) return fail(404, 'not_found', '글을 찾지 못했어요.');
  return reply(200, { ok: true });
}

async function photo(db, who, id) {
  const row = await db.prepare(`SELECT ph.data FROM community_photos ph JOIN community_posts p ON p.id = ph.post
    WHERE ph.id = ?2 AND ${VISIBLE}`).bind(who.member, id).first();
  if (!row) return fail(404, 'not_found', '사진을 찾지 못했어요.');
  // 사진에도 회원/규칙 경계가 있으므로 계정 전환 뒤 장기 HTTP 캐시를 재사용하지 않는다.
  return new Response(toBytes(row.data), { status: 200, headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', vary: 'Cookie', 'x-content-type-options': 'nosniff' } });
}

async function report(request, env, db, who, now) {
  const { body, error } = await readJson(request);
  if (error) return error;
  if (!REASONS.has(body?.reason)) return fail(400, 'invalid', '신고 이유를 골라 주세요.');
  const post = await db.prepare('SELECT id, member, hidden, reports_since FROM community_posts WHERE id = ?1').bind(String(body?.post || '')).first();
  if (!post) return fail(404, 'not_found', '글을 찾지 못했어요.');
  if (post.member === who.member) return fail(400, 'invalid', '내 글은 신고할 수 없어요. 지우기를 써 주세요.');
  await db.prepare('INSERT OR IGNORE INTO community_reports (post, member, reason, created_at) VALUES (?1, ?2, ?3, ?4)').bind(post.id, who.member, body.reason, now).run();
  // public에서는 가입한 지 COMMUNITY_REPORTER_MIN_DAYS(기본 3)일이 지난 회원의 신고만 자동 숨김에 센다. 신고 자체와 신고자에게 안 보이기는 그대로다.
  const minDays = env.COMMUNITY_MODE === 'public' ? Math.max(0, Number(env.COMMUNITY_REPORTER_MIN_DAYS ?? 3) || 0) : 0;
  const count = await db.prepare(`SELECT COUNT(*) AS n, MIN(r.created_at) AS first FROM community_reports r JOIN community_members m ON m.member = r.member
    WHERE r.post = ?1 AND r.created_at >= ?2 AND m.joined_at <= ?3`).bind(post.id, Number(post.reports_since) || 0, now - minDays * 86400000).first();
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

async function leave(request, env, db, who, now) {
  const { body, error } = await readJson(request);
  if (error) return error;
  if (body?.confirm !== true) return fail(400, 'confirm_required', '나가기를 한 번 더 확인해 주세요.');
  await db.batch([
    legacyReservations(db, who.member, now),
    db.prepare('DELETE FROM community_photos WHERE member = ?1').bind(who.member),
    db.prepare('DELETE FROM community_reports WHERE member = ?1 OR post IN (SELECT id FROM community_posts WHERE member = ?1)').bind(who.member),
    db.prepare('DELETE FROM community_post_details WHERE post IN (SELECT id FROM community_posts WHERE member = ?1)').bind(who.member),
    db.prepare('DELETE FROM community_posts WHERE member = ?1').bind(who.member),
    db.prepare('DELETE FROM community_blocks WHERE member = ?1 OR blocked = ?1').bind(who.member),
    db.prepare('DELETE FROM community_members WHERE member = ?1').bind(who.member),
  ]);
  if (env.COMMUNITY_MODE === 'public') await endMemberSessions(env, who.member);
  return reply(200, { ok: true });
}

async function review(request, db, who, now, rest) {
  if (who.operator !== true) return fail(403, 'operator_only', '운영자만 볼 수 있어요.');
  if (request.method === 'GET' && !rest) {
    const { results } = await db.prepare(`SELECT p.id, p.text, p.pieces, p.hidden, p.created_at, m.name,
        d.board, d.title, d.sale, d.revision, d.updated_at,
        (SELECT COUNT(*) FROM community_reports r WHERE r.post = p.id AND r.created_at >= p.reports_since) AS reports,
        (SELECT MIN(created_at) FROM community_reports r WHERE r.post = p.id AND r.created_at >= p.reports_since) AS first,
        (SELECT group_concat(reason) FROM community_reports r WHERE r.post = p.id AND r.created_at >= p.reports_since) AS reasons
      FROM community_posts p JOIN community_members m ON m.member = p.member
      LEFT JOIN community_post_details d ON d.post = p.id
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
        ...postDetails(r), createdAt: Number(r.created_at),
        hidden: r.hidden ?? null, reports: Number(r.reports), firstReportAt: r.first === null ? null : Number(r.first),
        reasons: String(r.reasons || '').split(',').filter(Boolean).reduce((o, k) => ({ ...o, [k]: (o[k] || 0) + 1 }), {}),
      })),
    });
  }
  if (request.method === 'POST' && rest) {
    const { body, error } = await readJson(request);
    if (error) return error;
    const post = await db.prepare('SELECT id, member FROM community_posts WHERE id = ?1').bind(rest).first();
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
        legacyReservations(db, post.member, now),
        db.prepare('DELETE FROM community_photos WHERE post = ?1').bind(post.id),
        db.prepare('DELETE FROM community_reports WHERE post = ?1').bind(post.id),
        db.prepare('DELETE FROM community_post_details WHERE post = ?1').bind(post.id),
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
  if (mode !== 'private' && mode !== 'public') return fail(503, 'community_off', '코디 공유는 아직 열지 않았어요.');
  if (mode === 'public') {
    const missing = publicMissing(env);
    if (missing.length) return reply(503, { code: 'public_not_ready', message: '코디 공유는 공개 준비가 끝나면 열어요.', missing });
  }
  const db = communityDb(env);
  if (!db) return fail(503, 'not_configured', '코디 공유 저장소가 연결되지 않았어요.');
  const url = new URL(request.url);
  const [, , , section = '', rest = '', extra] = url.pathname.split('/');
  if (extra !== undefined) return fail(404, 'not_found', '없는 주소예요.');
  const signedIn = typeof who?.member === 'string' && !!who.member;
  // public에서는 로그인 전에도 상태(로그인 방법·규칙·운영자 정보)만 볼 수 있다.
  if (!signedIn && !(mode === 'public' && section === 'status' && request.method === 'GET')) return fail(401, 'unauthorized', '로그인이 필요해요.');
  const at = now();
  try {
    await ensureSchema(db);
    const method = request.method;
    if (section === 'status' && method === 'GET') return await status(env, db, who);
    if (section === 'join' && method === 'POST') return await join(request, db, who, at);
    if (section === 'leave' && method === 'POST') return await leave(request, env, db, who, at);
    if (section === 'review') return await review(request, db, who, at, rest);
    // 아래는 가입한 회원만.
    const row = await memberRow(db, who.member);
    if (!row || row.rules !== COMMUNITY_RULES_VERSION) return fail(403, 'join_required', '규칙에 동의하고 이름을 정한 뒤에 쓸 수 있어요.');
    if (section === 'photos' && method === 'GET' && rest) return await photo(db, who, rest);
    if (section === 'feed' && method === 'GET') return await feed(url, db, who);
    if (section === 'posts' && method === 'POST' && !rest) return await createPost(request, env, db, who, at);
    if (section === 'posts' && method === 'PATCH' && rest) return await editPost(request, db, who, rest, at);
    if (section === 'posts' && method === 'DELETE' && rest) return await deletePost(db, who, rest, at);
    if (section === 'reports' && method === 'POST') return await report(request, env, db, who, at);
    if (section === 'blocks') return await blocks(request, url, db, who, at, rest);
    return fail(404, 'not_found', '없는 주소예요.');
  } catch {
    // 글·이름·사진은 남기지 않는다.
    return fail(500, 'error', '잠시 뒤에 다시 해 주세요.');
  }
}
