// 유료 AI 호출 전에 공유 D1에 한 번 예약한다. 실패·취소한 API 호출도 사용량을 돌려주지 않는다.
// UTC 달력 기준 일/월/분 한도이며, 개인 식별자·질문·사진·IP는 저장하지 않는다.
// 기본 월 300건이므로 원장도 월 최대 300행이다(한도를 올리면 최대 10,000행/월).
const DEFAULTS = { DAILY_LIMIT: 300, MONTHLY_LIMIT: 300, MINUTE_LIMIT: 10 };
const MAX_LIMIT = 10_000;
const schemaReady = new WeakMap();
const unavailable = (code = 'budget_unavailable') => ({ ok: false, status: 503, code });
const limited = (code) => ({ ok: false, status: 429, code });

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rank_budget_usage (
    utc_day TEXT NOT NULL, utc_month TEXT NOT NULL, utc_minute TEXT NOT NULL,
    calls INTEGER NOT NULL CHECK (calls = 1))`,
  'CREATE INDEX IF NOT EXISTS rank_budget_day ON rank_budget_usage (utc_day)',
  'CREATE INDEX IF NOT EXISTS rank_budget_month ON rank_budget_usage (utc_month)',
  'CREATE INDEX IF NOT EXISTS rank_budget_minute ON rank_budget_usage (utc_minute)',
];

function positiveLimit(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_LIMIT ? n : null;
}

async function ensureSchema(db) {
  let pending = schemaReady.get(db);
  if (!pending) {
    pending = (async () => { for (const sql of SCHEMA) await db.prepare(sql).run(); })();
    schemaReady.set(db, pending);
  }
  try { await pending; } catch (error) { schemaReady.delete(db); throw error; }
}

export async function reserveRankBudget(env, { now = Date.now() } = {}) {
  const db = env?.RANK_DB || env?.CROWD_DB;
  if (!db || typeof db.prepare !== 'function') return unavailable('not_configured');
  const daily = positiveLimit(env.DAILY_LIMIT, DEFAULTS.DAILY_LIMIT);
  const monthly = positiveLimit(env.MONTHLY_LIMIT, DEFAULTS.MONTHLY_LIMIT);
  const perMinute = positiveLimit(env.MINUTE_LIMIT, DEFAULTS.MINUTE_LIMIT);
  if (daily === null || monthly === null || perMinute === null) return unavailable('not_configured');

  try {
    if (!Number.isSafeInteger(now)) return unavailable();
    const iso = new Date(now).toISOString();
    const day = iso.slice(0, 10), month = iso.slice(0, 7), minute = iso.slice(0, 16);
    await ensureSchema(db);
    // 먼저 읽고 나중에 늘리는 분리 처리를 피한다. 단일 INSERT가 모든 상한을 판단하고 원자적으로 예약한다.
    // 같은 D1을 공유하는 다른 Worker/isolate에서도 메모리나 KV의 값에 의존하지 않는다.
    const reserved = await db.prepare(`INSERT INTO rank_budget_usage (utc_day, utc_month, utc_minute, calls)
      SELECT ?1, ?2, ?3, 1
      WHERE COALESCE((SELECT SUM(calls) FROM rank_budget_usage WHERE utc_day = ?1), 0) < ?4
        AND COALESCE((SELECT SUM(calls) FROM rank_budget_usage WHERE utc_month = ?2), 0) < ?5
        AND COALESCE((SELECT SUM(calls) FROM rank_budget_usage WHERE utc_minute = ?3), 0) < ?6`)
      .bind(day, month, minute, daily, monthly, perMinute).run();
    if (reserved.meta?.changes === 1) return { ok: true };
    if (reserved.meta?.changes !== 0) return unavailable();

    // 거절 이유는 예약 판단 뒤에만 읽는다. 읽기가 실패해도 API 호출을 허용하지 않는다.
    const used = await db.prepare(`SELECT
      COALESCE((SELECT SUM(calls) FROM rank_budget_usage WHERE utc_day = ?1), 0) AS daily,
      COALESCE((SELECT SUM(calls) FROM rank_budget_usage WHERE utc_month = ?2), 0) AS monthly,
      COALESCE((SELECT SUM(calls) FROM rank_budget_usage WHERE utc_minute = ?3), 0) AS minute`)
      .bind(day, month, minute).first();
    if (Number(used?.monthly) >= monthly) return limited('monthly_limit');
    if (Number(used?.daily) >= daily) return limited('daily_limit');
    if (Number(used?.minute) >= perMinute) return limited('rate_limited');
    return unavailable();
  } catch { return unavailable(); }
}
