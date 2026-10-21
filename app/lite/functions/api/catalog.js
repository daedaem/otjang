// 사용자 등록 카탈로그(Cloudflare D1, 바인딩 이름 CROWD_DB). 대표 요구 R15.
// 목록에 없는 옷을 사용자가 브랜드·품명·종류·색으로 등록한다. 같은 옷(브랜드+품명+종류가 같은 것)을
// 서로 다른 기기 CROWD_MIN곳(기본 3) 이상이 등록하면 모두의 검색에 나온다. 사진은 받지 않는다(고정 원칙).
//   POST /api/catalog/submit   {device, brand, name, kind, color?, link?} → {key, count, min, searchable}
//   POST /api/catalog/withdraw {device, key} → {key, count, min, searchable}
//   GET  /api/catalog/search?q=단어 → {min, items:[{key, brand, name, kind, color, count}]}
//   GET  /api/catalog/status?keys=k1,k2 → {min, items:{key: count}}
// 판매처 링크는 기록만 하고 남에게 보여 주지 않는다(모르는 사람이 넣은 주소를 퍼뜨리지 않기). 운영자가 확인할 때만 쓴다.
// 기기 id는 화면이 만든 무작위 값이라 위조할 수 있다: 혼자 시험·포트폴리오 단계의 장치이고, 공개 운영 전에는 계정 확인으로 바꾼다.
import { GARMENT_KINDS } from '../../../src/wardrobe.js';
import { COLORS } from '../../../src/data/slots.js';

export const CROWD_MIN = 3;
const DAY = 24 * 60 * 60 * 1000;
const PER_DEVICE_DAY = 20;
const PER_IP_DAY = 60;
const KIND_IDS = new Set(GARMENT_KINDS.map((k) => k.id));

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS crowd_items (
    key TEXT NOT NULL, device TEXT NOT NULL, brand TEXT NOT NULL, name TEXT NOT NULL,
    hay TEXT NOT NULL, kind TEXT NOT NULL, color TEXT, link TEXT, ip TEXT, created_at INTEGER NOT NULL,
    PRIMARY KEY (key, device))`,
  'CREATE INDEX IF NOT EXISTS crowd_device_time ON crowd_items (device, created_at)',
  'CREATE INDEX IF NOT EXISTS crowd_ip_time ON crowd_items (ip, created_at)',
  // 기여를 철회해도 최근 24시간 등록 사용량은 남긴다. 원본 기여 행과 별도이므로 삭제로 상한을 되돌릴 수 없다.
  `CREATE TABLE IF NOT EXISTS crowd_submission_usage (
    id TEXT PRIMARY KEY, device TEXT NOT NULL, ip TEXT, created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS crowd_usage_device_time ON crowd_submission_usage (device, created_at)',
  'CREATE INDEX IF NOT EXISTS crowd_usage_ip_time ON crowd_submission_usage (ip, created_at)',
  'CREATE INDEX IF NOT EXISTS crowd_usage_time ON crowd_submission_usage (created_at)',
];

const reply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (status, code, message) => reply(status, { code, message });

// 띄어쓰기·대소문자·기호·전각 차이를 지운 비교용 글자. "COS 울 블렌드-코트"와 "cos 울블렌드 코트"는 같다.
export const norm = (s) => String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const tidy = (s) => (typeof s === 'string' ? s.normalize('NFKC').replace(/\s+/g, ' ').trim() : '');
export const itemKey = (brand, name, kind) => `${norm(brand)}|${norm(name)}|${kind}`;

const minOf = (env) => Math.max(1, Number(env.CROWD_MIN) || CROWD_MIN);
const validDevice = (d) => typeof d === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(d);
const looksLikeLink = (s) => /https?:|www\.|\.(?:com|kr|net|io|co)\b/i.test(s);

function readItem(body) {
  const brand = tidy(body.brand);
  const name = tidy(body.name);
  const { kind } = body;
  const color = body.color ?? null;
  if (!brand || brand.length > 40 || !norm(brand)) return '브랜드를 1~40자로 적어 주세요.';
  if (!name || name.length > 80 || !norm(name)) return '품명을 1~80자로 적어 주세요.';
  if (looksLikeLink(brand) || looksLikeLink(name)) return '브랜드·품명에는 주소를 넣지 말아 주세요.';
  if (!KIND_IDS.has(kind)) return '옷 종류를 골라 주세요.';
  if (color !== null && !Object.hasOwn(COLORS, color)) return '색을 목록에서 골라 주세요.';
  let link = null;
  if (body.link) {
    try {
      const u = new URL(String(body.link));
      if (!/^https?:$/.test(u.protocol) || String(body.link).length > 500) throw new Error();
      link = u.href;
    } catch { return '판매처 주소가 올바르지 않아요.'; }
  }
  return { brand, name, kind, color, link };
}

// IP는 그대로 저장하지 않는다. 비밀 값 CROWD_SALT가 있을 때만 소금 친 해시 앞부분을 남겨 하루 상한에 쓴다.
async function ipTag(request, env) {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip || !env.CROWD_SALT) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.CROWD_SALT}|${ip}`));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ready = new WeakSet();
async function ensureSchema(db) {
  if (ready.has(db)) return;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  ready.add(db);
}

async function countOf(db, key) {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM crowd_items WHERE key = ?1').bind(key).first();
  return Number(row?.n) || 0;
}
const state = (key, count, min) => ({ key, count, min, searchable: count >= min });

async function submit(request, env, db, now) {
  let body;
  try { body = await request.json(); } catch { return fail(400, 'bad_request', 'JSON 본문이 필요해요.'); }
  if (!validDevice(body?.device)) return fail(400, 'bad_request', '기기 id가 올바르지 않아요.');
  const item = readItem(body);
  if (typeof item === 'string') return fail(400, 'invalid', item);
  const key = itemKey(item.brand, item.name, item.kind);
  const ip = await ipTag(request, env);
  const since = now - DAY;
  const reservation = crypto.randomUUID();
  // D1 batch는 트랜잭션이다. 한 SQL에서 두 상한을 확인하고 예약한 뒤, 같은 트랜잭션에서만 기여를 쓴다.
  // 다른 요청이 검사와 쓰기 사이에 끼어들거나, 쓰기 실패 뒤 사용량만 남는 것을 막는다.
  // "하루"는 자정 초기화가 아닌 최근 24시간이다. 기존 기여의 색·링크 수정은 새 등록으로 세지 않는다.
  const [, , written] = await db.batch([
    db.prepare('DELETE FROM crowd_submission_usage WHERE created_at <= ?1').bind(since),
    db.prepare(`INSERT INTO crowd_submission_usage (id, device, ip, created_at)
      SELECT ?1, ?2, ?3, ?4
      WHERE NOT EXISTS (SELECT 1 FROM crowd_items WHERE key = ?5 AND device = ?2)
        AND (SELECT COUNT(*) FROM crowd_submission_usage WHERE device = ?2 AND created_at > ?6) < ?7
        AND (?3 IS NULL OR (SELECT COUNT(*) FROM crowd_submission_usage WHERE ip = ?3 AND created_at > ?6) < ?8)`)
      .bind(reservation, body.device, ip, now, key, since, PER_DEVICE_DAY, PER_IP_DAY),
    db.prepare(`INSERT INTO crowd_items (key, device, brand, name, hay, kind, color, link, ip, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
      WHERE EXISTS (SELECT 1 FROM crowd_submission_usage WHERE id = ?11)
         OR EXISTS (SELECT 1 FROM crowd_items WHERE key = ?1 AND device = ?2)
      ON CONFLICT (key, device) DO UPDATE SET color = excluded.color, link = excluded.link`)
      .bind(key, body.device, item.brand, item.name, `${norm(item.brand)}|${norm(item.name)}`, item.kind, item.color, item.link, ip, now, reservation),
  ]);
  if (!written.meta?.changes) return fail(429, 'daily_limit', '최근 24시간 등록 한도에 닿았어요. 등록한 지 24시간이 지나면 다시 해 주세요.');
  return reply(200, state(key, await countOf(db, key), minOf(env)));
}

async function withdraw(request, env, db) {
  let body;
  try { body = await request.json(); } catch { return fail(400, 'bad_request', 'JSON 본문이 필요해요.'); }
  if (!validDevice(body?.device) || typeof body.key !== 'string' || body.key.length > 200) return fail(400, 'bad_request', '요청 형식이 아니에요.');
  await db.prepare('DELETE FROM crowd_items WHERE key = ?1 AND device = ?2').bind(body.key, body.device).run();
  return reply(200, state(body.key, await countOf(db, body.key), minOf(env)));
}

// 검색에 나오는 표기는 처음 등록한 사람의 것, 색은 가장 많이 고른 색.
async function search(url, env, db) {
  const words = (url.searchParams.get('q') || '').split(/\s+/).map(norm).filter(Boolean).slice(0, 5);
  const min = minOf(env);
  if (!words.length) return reply(200, { min, items: [] });
  const where = words.map((_, i) => `hay LIKE ?${i + 2} ESCAPE '\\'`).join(' AND ');
  const like = words.map((w) => `%${w.replace(/[\\%_]/g, '\\$&')}%`);
  const { results } = await db.prepare(`SELECT c.key, c.kind, COUNT(*) AS n, MIN(c.created_at) AS first,
      (SELECT brand FROM crowd_items f WHERE f.key = c.key ORDER BY created_at LIMIT 1) AS brand,
      (SELECT name FROM crowd_items f WHERE f.key = c.key ORDER BY created_at LIMIT 1) AS name,
      (SELECT color FROM crowd_items f WHERE f.key = c.key AND color IS NOT NULL GROUP BY color ORDER BY COUNT(*) DESC, MIN(created_at) LIMIT 1) AS color
    FROM crowd_items c WHERE ${where} GROUP BY c.key HAVING n >= ?1 ORDER BY n DESC, first LIMIT 20`)
    .bind(min, ...like).all();
  return reply(200, { min, items: results.map((r) => ({ key: r.key, brand: r.brand, name: r.name, kind: r.kind, color: r.color, count: Number(r.n) })) });
}

async function status(url, env, db) {
  const keys = (url.searchParams.get('keys') || '').split(',').filter((k) => k && k.length <= 200).slice(0, 30);
  const items = {};
  for (const key of keys) items[key] = await countOf(db, key);
  return reply(200, { min: minOf(env), items });
}

// options.now: 시험에서 시각을 고정할 때만 쓴다.
export async function handleCatalog(request, env, { now = Date.now() } = {}) {
  const db = env.CROWD_DB;
  if (!db) return fail(503, 'not_configured', '공유 등록 DB가 아직 연결되지 않았어요. 이 기기에만 저장돼요.');
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`;
  const routes = {
    'POST /api/catalog/submit': () => submit(request, env, db, now),
    'POST /api/catalog/withdraw': () => withdraw(request, env, db),
    'GET /api/catalog/search': () => search(url, env, db),
    'GET /api/catalog/status': () => status(url, env, db),
  };
  if (!routes[route]) return fail(404, 'not_found', '없는 주소예요.');
  try {
    await ensureSchema(db);
    return await routes[route]();
  } catch {
    return fail(502, 'error', '공유 등록 DB에 닿지 못했어요.');
  }
}
