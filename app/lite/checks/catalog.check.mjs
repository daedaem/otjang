// 사용자 등록 카탈로그 점검. D1 대신 Node 내장 SQLite로 같은 SQL을 돌린다(비용 0). 실행: npm test (app/lite)
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleCatalog, itemKey, norm, CROWD_MIN } from '../functions/api/catalog.js';

// D1이 쓰는 prepare().bind().first()/all()/run()만 흉내 낸다.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  return {
    raw: db,
    prepare(sql) {
      let args = [];
      const st = { bind(...a) { args = a; return st; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { db.prepare(sql).run(...args); return { success: true }; } };
      return st;
    },
  };
}
const dev = (i) => `device-${String(i).padStart(12, '0')}`;
const call = async (env, method, path, body, headers = {}) => {
  const res = await handleCatalog(new Request(`https://x.test${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined,
  }), env);
  return { status: res.status, body: await res.json() };
};
const coat = { brand: 'COS', name: '울 블렌드 코트', kind: 'coat', color: 'black' };

test('DB가 연결되지 않으면 503 not_configured', async () => {
  const r = await call({}, 'GET', '/api/catalog/search?q=cos');
  assert.deepEqual([r.status, r.body.code], [503, 'not_configured']);
});

test('표기 차이(띄어쓰기·대소문자·기호)는 같은 옷으로 센다', () => {
  assert.equal(itemKey('COS', '울 블렌드-코트', 'coat'), itemKey(' cos ', '울블렌드 코트', 'coat'));
  assert.notEqual(itemKey('COS', '울 블렌드 코트', 'coat'), itemKey('COS', '울 블렌드 코트', 'jacket'));
  assert.equal(norm('ＣＯＳ'), 'cos');
});

test(`서로 다른 기기 ${CROWD_MIN}곳이 등록해야 검색된다. 같은 기기 반복은 한 번`, async () => {
  const env = { CROWD_DB: fakeD1() };
  const first = await call(env, 'POST', '/api/catalog/submit', { device: dev(1), ...coat });
  assert.deepEqual([first.status, first.body.count, first.body.searchable], [200, 1, false]);
  const again = await call(env, 'POST', '/api/catalog/submit', { device: dev(1), ...coat, color: 'navy' });
  assert.equal(again.body.count, 1);
  await call(env, 'POST', '/api/catalog/submit', { device: dev(2), brand: 'cos', name: '울블렌드 코트', kind: 'coat', color: 'black' });
  assert.equal((await call(env, 'GET', '/api/catalog/search?q=코트')).body.items.length, 0);
  const third = await call(env, 'POST', '/api/catalog/submit', { device: dev(3), ...coat, link: 'https://www.cos.com/x' });
  assert.deepEqual([third.body.count, third.body.searchable], [3, true]);
  const found = await call(env, 'GET', '/api/catalog/search?q=cos 울블렌드');
  assert.equal(found.body.items.length, 1);
  const [it] = found.body.items;
  assert.deepEqual({ brand: it.brand, name: it.name, kind: it.kind, color: it.color, count: it.count }, { brand: 'COS', name: '울 블렌드 코트', kind: 'coat', color: 'black', count: 3 });
  assert.equal('link' in it, false, '남이 넣은 판매처 주소는 검색 결과에 내보내지 않는다');
  const st = await call(env, 'GET', `/api/catalog/status?keys=${encodeURIComponent(it.key)},nope`);
  assert.deepEqual(st.body.items, { [it.key]: 3, nope: 0 });
  const back = await call(env, 'POST', '/api/catalog/withdraw', { device: dev(3), key: it.key });
  assert.deepEqual([back.body.count, back.body.searchable], [2, false]);
  assert.equal((await call(env, 'GET', '/api/catalog/search?q=cos')).body.items.length, 0);
});

test('CROWD_MIN으로 기준 수를 바꿀 수 있다(대표 혼자 시험할 때 1)', async () => {
  const env = { CROWD_DB: fakeD1(), CROWD_MIN: '1' };
  await call(env, 'POST', '/api/catalog/submit', { device: dev(1), ...coat });
  const r = await call(env, 'GET', '/api/catalog/search?q=cos');
  assert.deepEqual([r.body.min, r.body.items.length], [1, 1]);
});

test('형식이 틀린 등록은 거절한다(주소 섞인 이름, 없는 종류·색, 이상한 링크, 기기 id)', async () => {
  const env = { CROWD_DB: fakeD1() };
  const bad = [
    { device: 'short', ...coat },
    { device: dev(1), ...coat, kind: 'spaceship' },
    { device: dev(1), ...coat, color: 'rainbow' },
    { device: dev(1), ...coat, name: '싸게 파는 곳 www.spam.com' },
    { device: dev(1), ...coat, brand: '' },
    { device: dev(1), ...coat, name: '가'.repeat(81) },
    { device: dev(1), ...coat, link: 'javascript:alert(1)' },
  ];
  for (const b of bad) assert.equal((await call(env, 'POST', '/api/catalog/submit', b)).status, 400, JSON.stringify(b));
  assert.equal(env.CROWD_DB.raw.prepare('SELECT COUNT(*) AS n FROM crowd_items').get().n, 0);
});

test('검색어의 %·_는 글자 그대로 찾는다', async () => {
  const env = { CROWD_DB: fakeD1(), CROWD_MIN: '1' };
  await call(env, 'POST', '/api/catalog/submit', { device: dev(1), ...coat });
  assert.equal((await call(env, 'GET', '/api/catalog/search?q=%25')).body.items.length, 0);
});

test('한 기기의 하루 등록은 20건까지', async () => {
  const env = { CROWD_DB: fakeD1() };
  for (let i = 0; i < 20; i += 1) {
    assert.equal((await call(env, 'POST', '/api/catalog/submit', { device: dev(1), ...coat, name: `코트 ${i}` })).status, 200);
  }
  const r = await call(env, 'POST', '/api/catalog/submit', { device: dev(1), ...coat, name: '코트 마지막' });
  assert.deepEqual([r.status, r.body.code], [429, 'daily_limit']);
});

test('CROWD_SALT가 있을 때만 IP 해시를 남기고, IP 원문은 저장하지 않는다', async () => {
  const env = { CROWD_DB: fakeD1(), CROWD_SALT: 's' };
  await call(env, 'POST', '/api/catalog/submit', { device: dev(1), ...coat }, { 'cf-connecting-ip': '203.0.113.7' });
  const row = env.CROWD_DB.raw.prepare('SELECT ip FROM crowd_items').get();
  assert.match(row.ip, /^[0-9a-f]{16}$/);
  const env2 = { CROWD_DB: fakeD1() };
  await call(env2, 'POST', '/api/catalog/submit', { device: dev(1), ...coat }, { 'cf-connecting-ip': '203.0.113.7' });
  assert.equal(env2.CROWD_DB.raw.prepare('SELECT ip FROM crowd_items').get().ip, null);
});

test('없는 주소는 404', async () => {
  assert.equal((await call({ CROWD_DB: fakeD1() }, 'GET', '/api/catalog/drop')).status, 404);
});
