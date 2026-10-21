// 비용 없는 실제 SQLite SQL 검증. 원격 D1·Anthropic API·개인 자료는 사용하지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { reserveRankBudget } from '../functions/lib/rank-budget.js';

function fakeD1(raw = new DatabaseSync(':memory:')) {
  return {
    raw,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...values) { args = values; return stmt; },
        async run() {
          const r = raw.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
        async first() { return raw.prepare(sql).get(...args) ?? null; },
      };
      return stmt;
    },
  };
}
const time = (date) => Date.parse(date);
const NOW = time('2026-10-21T10:20:30Z');
const count = (db) => db.raw.prepare('SELECT COALESCE(SUM(calls), 0) AS n FROM rank_budget_usage').get().n;

test('D1 공유 바인딩이 없으면 메모리/KV로 대체하지 않고 닫는다', async () => {
  for (const env of [undefined, {}, { RANK_KV: {} }, { RANK_DB: 'not-a-binding' }]) {
    assert.deepEqual(await reserveRankBudget(env, { now: NOW }), { ok: false, status: 503, code: 'not_configured' });
  }
});

test('기본값은 UTC 하루300·월300·분10이며 날짜와 횟수만 저장한다', async () => {
  const db = fakeD1();
  const env = { RANK_DB: db };
  for (let i = 0; i < 300; i += 1) {
    assert.deepEqual(await reserveRankBudget(env, { now: NOW + i * 60_000 }), { ok: true });
  }
  assert.deepEqual(await reserveRankBudget(env, { now: NOW + 300 * 60_000 }), { ok: false, status: 429, code: 'monthly_limit' });
  assert.equal(count(db), 300);
  const columns = db.raw.prepare('PRAGMA table_info(rank_budget_usage)').all().map((c) => c.name);
  assert.deepEqual(columns, ['utc_day', 'utc_month', 'utc_minute', 'calls']);
  const row = db.raw.prepare('SELECT * FROM rank_budget_usage LIMIT 1').get();
  assert.deepEqual({ ...row }, { utc_day: '2026-10-21', utc_month: '2026-10', utc_minute: '2026-10-21T10:20', calls: 1 });
  const db2 = fakeD1();
  for (let i = 0; i < 10; i += 1) assert.equal((await reserveRankBudget({ CROWD_DB: db2 }, { now: NOW })).ok, true);
  assert.deepEqual(await reserveRankBudget({ CROWD_DB: db2 }, { now: NOW }), { ok: false, status: 429, code: 'rate_limited' });
});

test('한도는 양의 안전정수 10000 이하만 받으며 잘못된 설정은 DB에 닿지 않는다', async () => {
  let queries = 0;
  const db = { prepare() { queries += 1; throw new Error('must not reach DB'); } };
  const invalid = [0, -1, Infinity, NaN, null, true, {}, [], '', '0', '-1', 'Infinity', 'abc', '1.5', '1e2', ' 3 ', 1.5, 10_001, '10001', Number.MAX_SAFE_INTEGER + 1];
  for (const name of ['DAILY_LIMIT', 'MONTHLY_LIMIT', 'MINUTE_LIMIT']) for (const value of invalid) {
    assert.deepEqual(await reserveRankBudget({ RANK_DB: db, [name]: value }, { now: NOW }), { ok: false, status: 503, code: 'not_configured' }, `${name}=${String(value)}`);
  }
  assert.equal(queries, 0);
  assert.deepEqual(await reserveRankBudget({ RANK_DB: fakeD1(), DAILY_LIMIT: '10000', MONTHLY_LIMIT: 10_000, MINUTE_LIMIT: '1' }, { now: NOW }), { ok: true });
});

test('일 한도는 UTC 자정에 초기화되지만 월 사용량은 남는다', async () => {
  const db = fakeD1();
  const env = { RANK_DB: db, DAILY_LIMIT: '1', MONTHLY_LIMIT: '3', MINUTE_LIMIT: '10' };
  assert.deepEqual(await reserveRankBudget(env, { now: time('2026-10-21T23:59:59.999Z') }), { ok: true });
  assert.deepEqual(await reserveRankBudget(env, { now: time('2026-10-21T23:59:59.999Z') }), { ok: false, status: 429, code: 'daily_limit' });
  assert.deepEqual(await reserveRankBudget(env, { now: time('2026-10-22T00:00:00Z') }), { ok: true });
  assert.equal(count(db), 2);
});

test('UTC 달이 바뀌면 월·일·분 한도가 새 구간에서 시작한다', async () => {
  const db = fakeD1();
  const env = { RANK_DB: db, DAILY_LIMIT: 1, MONTHLY_LIMIT: 1, MINUTE_LIMIT: 1 };
  const end = time('2026-10-31T23:59:59.999Z');
  assert.deepEqual(await reserveRankBudget(env, { now: end }), { ok: true });
  assert.deepEqual(await reserveRankBudget(env, { now: end }), { ok: false, status: 429, code: 'monthly_limit' });
  assert.deepEqual(await reserveRankBudget(env, { now: end + 1 }), { ok: true });
  assert.equal(count(db), 2);
});

test('분이 바뀌어도 이전 분을 덮어쓰지 않아 늦은 요청이 상한을 초기화하지 못한다', async () => {
  const db = fakeD1();
  const env = { RANK_DB: db, MINUTE_LIMIT: 1 };
  assert.equal((await reserveRankBudget(env, { now: NOW })).ok, true);
  assert.equal((await reserveRankBudget(env, { now: NOW + 60_000 })).ok, true);
  assert.deepEqual(await reserveRankBudget(env, { now: NOW }), { ok: false, status: 429, code: 'rate_limited' });
  assert.equal(count(db), 2);
});

test('동시 65요청에서도 일·월·분의 각 한도1은 하나만 예약한다', async () => {
  for (const name of ['DAILY_LIMIT', 'MONTHLY_LIMIT', 'MINUTE_LIMIT']) {
    const db = fakeD1();
    const env = { RANK_DB: db, DAILY_LIMIT: 100, MONTHLY_LIMIT: 100, MINUTE_LIMIT: 100, [name]: 1 };
    const results = await Promise.all(Array.from({ length: 65 }, () => reserveRankBudget(env, { now: NOW })));
    assert.equal(results.filter((r) => r.ok).length, 1, name);
    assert.equal(results.filter((r) => r.status === 429).length, 64, name);
    assert.equal(count(db), 1);
  }
});

test('다른 모듈 인스턴스와 D1 객체도 같은 DB 원장을 공유한다', async () => {
  const raw = new DatabaseSync(':memory:');
  const other = await import('../functions/lib/rank-budget.js?independent-isolate=1');
  const results = await Promise.all(Array.from({ length: 65 }, (_, i) => {
    const reserve = i % 2 ? other.reserveRankBudget : reserveRankBudget;
    return reserve({ RANK_DB: fakeD1(raw), DAILY_LIMIT: 1, MONTHLY_LIMIT: 100, MINUTE_LIMIT: 100 }, { now: NOW });
  }));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(count({ raw }), 1);
});

test('상류 API 실패·취소 뒤에도 예약은 그대로이며 다음 요청을 막는다', async () => {
  for (const failure of ['upstream failure', 'cancelled']) {
    const db = fakeD1();
    const env = { RANK_DB: db, MONTHLY_LIMIT: 1 };
    let upstreamCalls = 0;
    const invoke = async () => {
      const budget = await reserveRankBudget(env, { now: NOW });
      if (!budget.ok) return budget;
      upstreamCalls += 1;
      throw new Error(failure);
    };
    await assert.rejects(invoke, new RegExp(failure));
    assert.equal((await invoke()).code, 'monthly_limit');
    assert.equal(upstreamCalls, 1);
    assert.equal(count(db), 1);
  }
});

test('DB 생성·예약·거절이유 조회 실패와 불명확한 응답은 상류0회로 닫는다', async () => {
  const failAt = (stage) => ({
    prepare(sql) {
      const stmt = {
        bind() { return stmt; },
        async run() {
          if (stage === 'schema' || (sql.startsWith('INSERT') && stage === 'reserve')) throw new Error('local DB failure');
          if (sql.startsWith('INSERT')) return { meta: stage === 'unknown-result' ? {} : { changes: 0 } };
          return { meta: { changes: 0 } };
        },
        async first() { throw new Error('local read failure'); },
      };
      return stmt;
    },
  });
  let upstreamCalls = 0;
  for (const stage of ['schema', 'reserve', 'reason-read', 'unknown-result']) {
    const result = await reserveRankBudget({ RANK_DB: failAt(stage) }, { now: NOW });
    if (result.ok) upstreamCalls += 1;
    assert.deepEqual(result, { ok: false, status: 503, code: 'budget_unavailable' }, stage);
  }
  assert.equal(upstreamCalls, 0);
});

test('RANK_DB를 우선 사용하고 실패 시 다른 DB로 우회하지 않는다', async () => {
  const crowd = fakeD1();
  const result = await reserveRankBudget({ RANK_DB: { prepare() { throw new Error('down'); } }, CROWD_DB: crowd }, { now: NOW });
  assert.deepEqual(result, { ok: false, status: 503, code: 'budget_unavailable' });
  assert.equal(crowd.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'rank_budget_usage'").get().n, 0);
});
