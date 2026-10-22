// 개발 계획 2번: 기기 저장 개인 자료의 무손실 왕복. 화면의 백업 블록(BK)을 그대로 떼어 가짜 localStorage로 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const page = fs.readFileSync(new URL('../../mockups/ux10v2/links/d12-hang.html', import.meta.url), 'utf8');
const start = page.indexOf('  const BK = {');
const end = page.indexOf('  function backupSheet()');
assert.ok(start > 0 && end > start, 'd12 백업 블록(BK)을 찾아야 한다');
const block = page.slice(start, end);

const storage = () => {
  const m = new Map();
  return {
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem(k, v) { if (this.quota !== undefined && String(v).length > this.quota) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, dump: () => Object.fromEntries([...m.entries()].sort()),
  };
};
const ENGINE = 'eoul-d12-hang:v1';
const run = (local) => {
  const context = { localStorage: local, window: { EOUL_MOCK_KEY: ENGINE }, CHAT_KEY: 'eoul-d12-hang:consult', REG_KEY: 'eoul-d12-hang:reg' };
  vm.runInNewContext(`${block}\nglobalThis.BK = BK;`, context);
  return context.BK;
};
const engineState = (n) => JSON.stringify({ v: 1, gender: 'M', garments: Array.from({ length: n }, (_, i) => ({ id: `g${i}`, kind: 'm-oxford', color: 'white', label: `직접 등록 ${i}` })), journeys: [{ id: 'j1', productId: 'ms-1', step: 'ordered', note: '원문 그대로 ☃ "따옴표"' }], trialIds: ['g0'], absences: {}, compare: [], recent: ['10만원 이하 셔츠'] });
const seed = (local) => {
  local.setItem(ENGINE, engineState(3));
  local.setItem('eoul-d12-hang:ui', '{"absent":{"ms-1":true}}');
  local.setItem('eoul-d12-hang:reg', '{"items":{"g1":{"brand":"브랜드","name":"이름","kind":"m-oxford","color":null,"key":"k","at":"2026-10-23T00:00:00.000Z"}},"catalog":{}}');
  local.setItem('eoul-d12-hang:consult', '{"threads":[{"id":"t1","title":"10만원 이하 셔츠","at":"2026-10-23T00:00:00.000Z","turns":[{"role":"user","text":"10만원 이하 셔츠"},{"role":"assistant","text":"답","ids":["ms-1"],"check":["가격 확인: …"]}]}],"cur":"t1"}');
  local.setItem('eoul-crowd:device', 'abcdef0123456789abcdef0123456789');
  local.setItem('eoul-weather:place', '{"mode":"fixed","name":"서울","lat":37.5,"lon":127}');
  local.setItem('eoul-weather:last', '{"at":1,"value":{}}'); // 캐시: 백업에 넣지 않는다
  local.setItem('eoul-mockup-ux10v2:probe', '1');
  local.setItem('other-app:key', 'x'); // 다른 앱 키: 건드리지 않는다
};

test('내보내기는 eoul- 개인 자료 키의 원문을 그대로 담고 캐시·다른 앱 키는 빼며, 복원하면 글자 하나까지 같다', () => {
  const a = storage(); seed(a); const BK = run(a);
  const file = BK.make();
  assert.equal(file.app, 'eoul-lite'); assert.equal(file.format, 1); assert.match(file.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(file.data), ['eoul-crowd:device', 'eoul-d12-hang:consult', 'eoul-d12-hang:reg', 'eoul-d12-hang:ui', 'eoul-d12-hang:v1', 'eoul-weather:place']);
  assert.equal(file.data[ENGINE], a.getItem(ENGINE));
  assert.deepEqual(JSON.parse(JSON.stringify(BK.count(file.data))), { garments: 2, journeys: 1, threads: 1, reg: 1 }); // 체험용(trialIds) 옷은 세지 않는다
  const text = JSON.stringify(file);
  // 새 기기(빈 저장소)에서 복원
  const b = storage(); const BK2 = run(b);
  const read = BK2.read(text);
  assert.equal(read.at, file.at);
  BK2.restore(read.data);
  const expected = { ...file.data };
  const got = b.dump(); const stash = JSON.parse(got['eoul-backup:stash']); delete got['eoul-backup:stash'];
  assert.deepEqual(got, expected);
  assert.deepEqual(stash.data, {}); // 빈 기기였으니 보관본도 비어 있다
  // 같은 자료를 다시 내보내면 글자가 같다(왕복 무손실)
  assert.equal(JSON.stringify(BK2.make().data), JSON.stringify(file.data));
});

test('복원은 현재 자료를 먼저 보관하고 백업 시점 그대로 바꾸며, 되돌리기는 복원 전 상태로 돌아간다. 다른 앱 키는 건드리지 않는다', () => {
  const a = storage(); seed(a); const BK = run(a);
  const before = a.dump();
  const other = storage(); other.setItem(ENGINE, engineState(5)); other.setItem('eoul-d12-hang:consult', '{"threads":[],"cur":null}');
  const text = JSON.stringify(run(other).make());
  BK.restore(BK.read(text).data);
  assert.equal(a.getItem(ENGINE), other.getItem(ENGINE));
  assert.equal(a.getItem('eoul-d12-hang:reg'), null); // 백업에 없던 키는 지운다(백업 시점 그대로)
  assert.equal(a.getItem('eoul-weather:last'), before['eoul-weather:last']); // 캐시는 그대로
  assert.equal(a.getItem('other-app:key'), 'x');
  assert.ok(BK.stash());
  BK.undo();
  assert.equal(a.getItem('eoul-backup:stash'), null);
  assert.deepEqual(a.dump(), before);
  assert.throws(() => BK.undo(), /보관본이 없어요/);
});

test('이 앱 파일이 아니거나 옷장 자료를 읽을 수 없으면 아무것도 바꾸지 않고 거절한다', () => {
  const a = storage(); seed(a); const BK = run(a);
  const before = a.dump();
  const ok = BK.make();
  const bad = [
    ['', /비어 있어요/], ['not json', /JSON/], ['[]', /이 앱의 백업/], [JSON.stringify({ ...ok, app: 'x' }), /이 앱의 백업/], [JSON.stringify({ ...ok, format: 2 }), /이 앱의 백업/],
    [JSON.stringify({ ...ok, data: [] }), /이 앱의 백업/], [JSON.stringify({ ...ok, data: {} }), /자료가 없어요/],
    [JSON.stringify({ ...ok, data: { 'other-app:key': 'x' } }), /모르는 항목/], [JSON.stringify({ ...ok, data: { 'eoul-backup:stash': 'x' } }), /모르는 항목/],
    [JSON.stringify({ ...ok, data: { [ENGINE]: 5 } }), /글자가 아니에요/], [JSON.stringify({ ...ok, data: { [ENGINE]: 'broken' } }), /옷장 자료를 읽을 수 없어요/],
    [JSON.stringify({ ...ok, data: { [ENGINE]: '{"v":2,"garments":[],"journeys":[]}' } }), /옷장 자료를 읽을 수 없어요/],
    ['x'.repeat(5 * 1024 * 1024 + 1), /너무 커요/],
  ];
  for (const [text, re] of bad) assert.throws(() => BK.read(text), re, text.slice(0, 40));
  assert.deepEqual(a.dump(), before);
  // 보관본을 쓸 수 없으면 복원하지 않는다
  const full = storage(); seed(full); const BKf = run(full); full.quota = 10;
  assert.throws(() => BKf.restore(BKf.read(JSON.stringify(ok)).data), /보관본을 저장하지 못해/);
  assert.deepEqual(full.dump(), before);
});
