// 개발 계획 2번: 기기 저장 개인 자료의 무손실 왕복. 화면의 백업 블록(BK)을 그대로 떼어 가짜 localStorage로 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const page = fs.readFileSync(new URL('../src/screen.html', import.meta.url), 'utf8');
const start = page.indexOf('  const BK = {');
const end = page.indexOf('  function backupSheet(');
assert.ok(start > 0 && end > start, 'd12 백업 블록(BK)을 찾아야 한다');
const block = page.slice(start, end);

// failSetsAfter: 그 횟수만큼 setItem이 성공한 뒤부터 계속 실패한다(저장 공간이 찬 상황). failSetAt: 그 순번의 setItem 한 번만 실패.
const storage = () => {
  const m = new Map();
  return {
    sets: 0,
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      if (this.quota !== undefined && String(v).length > this.quota) throw new Error('QuotaExceededError');
      if (this.failSetsAfter !== undefined && this.sets >= this.failSetsAfter) throw new Error('QuotaExceededError');
      if (this.failSetAt !== undefined && this.sets === this.failSetAt) { this.sets++; throw new Error('QuotaExceededError'); } // 그 한 번만 실패
      this.sets++; m.set(k, String(v));
    },
    removeItem(k) { if (this.failRemoves) throw new Error('SecurityError'); m.delete(k); }, dump: () => Object.fromEntries([...m.entries()].sort()),
  };
};
const ENGINE = 'eoul-d12-hang:v1';
const run = (local, M) => {
  const context = { localStorage: local, window: { EOUL_MOCK_KEY: ENGINE }, CHAT_KEY: 'eoul-d12-hang:consult', REG_KEY: 'eoul-d12-hang:reg', ...(M ? { M } : {}) };
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
    [JSON.stringify({ ...ok, data: { [ENGINE]: 5 } }), /글자가 아니에요/], [JSON.stringify({ ...ok, data: { [ENGINE]: 'broken' } }), /이 앱이 읽을 수 없어요/],
    [JSON.stringify({ ...ok, data: { [ENGINE]: '{"v":2,"garments":[],"journeys":[]}' } }), /이 앱이 읽을 수 없어요/],
    ['x'.repeat(5 * 1024 * 1024 + 1), /너무 커요/],
  ];
  for (const [text, re] of bad) assert.throws(() => BK.read(text), re, text.slice(0, 40));
  assert.deepEqual(a.dump(), before);
  // 보관본을 쓸 수 없으면 복원하지 않는다
  const full = storage(); seed(full); const BKf = run(full); full.quota = 10;
  assert.throws(() => BKf.restore(BKf.read(JSON.stringify(ok)).data), /보관본을 저장하지 못해/);
  assert.deepEqual(full.dump(), before);
});

const other = () => { const o = storage(); o.setItem(ENGINE, engineState(5)); o.setItem('eoul-d12-hang:consult', '{"threads":[],"cur":null}'); o.setItem('eoul-d12-hang:input-draft:v1', '{"v":1}'); return JSON.stringify(run(o).make()); };
const without = (d, k) => { const x = { ...d }; delete x[k]; return x; };

test('복원 중간에 저장이 막히면 바꾼 키만 원래 값으로 되돌리고 지금 자료를 그대로 둔다', () => {
  for (let n = 0; n <= 3; n++) { // n=0: 보관본 쓰기 실패, 1~3: 바꾸는 중 n번째 쓰기 실패(되돌리기 쓰기는 성공)
    const a = storage(); seed(a); const BK = run(a);
    const before = a.dump(); const data = BK.read(other()).data;
    a.sets = 0; a.failSetAt = n;
    assert.throws(() => BK.restore(data), n === 0 ? /보관본을 저장하지 못해/ : /바꾸지 않았어요/, `n=${n}`);
    a.failSetAt = undefined;
    const now = a.dump(); delete now['eoul-backup:stash'];
    assert.deepEqual(now, before, `n=${n}`);
  }
});

test('되돌리기까지 막히면 partial 오류로 알리고 보관본을 남겨 나중에 되돌릴 수 있다', () => {
  const a = storage(); seed(a); const BK = run(a);
  const before = a.dump(); const data = BK.read(other()).data;
  a.sets = 0; a.failSetsAfter = 2; // 보관본 + 한 키만 쓰고 막힘. 되돌리기 쓰기도 막힌다.
  assert.throws(() => BK.restore(data), (e) => e.code === 'partial' && /보관본에 남아 있어요/.test(e.message));
  assert.ok(BK.stash(), '보관본이 남아 있어야 한다');
  a.failSetsAfter = undefined; // 공간을 비운 뒤
  BK.undo();
  assert.deepEqual(a.dump(), before);
  assert.equal(a.getItem('eoul-backup:stash'), null);
});

test('되돌리기 중간에 막히면 보관본을 지우지 않고 지금 자료도 그대로 둔다', () => {
  const a = storage(); seed(a); const BK = run(a);
  BK.restore(BK.read(other()).data);
  const restored = a.dump();
  for (let n = 0; n <= 1; n++) {
    a.sets = 0; a.failSetAt = n;
    assert.throws(() => BK.undo(), /바꾸지 않았어요/, `n=${n}`);
    a.failSetAt = undefined;
  }
  assert.deepEqual(a.dump(), restored);
  assert.ok(BK.stash());
});

test('읽지 못한 원문 보관 키와 모르는 eoul- 키는 복원·되돌리기가 지우지 않는다', () => {
  const a = storage(); seed(a);
  const archive = `${ENGINE}:unreadable:2026-10-23T00:00:00.000Z`;
  a.setItem(archive, '{"v":9,"원문":"그대로"}');
  const BK = run(a);
  assert.ok(Object.keys(BK.make().data).includes(archive), '보관 원문도 백업에 들어간다');
  const data = without(BK.read(other()).data, archive);
  BK.restore(data);
  assert.equal(a.getItem(archive), '{"v":9,"원문":"그대로"}');
  assert.equal(a.getItem('eoul-d12-hang:reg'), null, '이 화면 키는 백업 시점 그대로 지운다');
  assert.equal(a.getItem('eoul-crowd:device'), 'abcdef0123456789abcdef0123456789', '기기 ID는 지우지 않는다');
  BK.undo();
  assert.equal(a.getItem(archive), '{"v":9,"원문":"그대로"}');
});

test('옷장 자료는 지금 엔진의 읽기 규칙(canReadSaved)으로 먼저 검사한다', () => {
  const a = storage(); seed(a);
  const seen = [];
  const BK = run(a, { canReadSaved: (raw) => { seen.push(raw); return !raw.includes('"bad"'); } });
  const ok = BK.make(); BK.read(JSON.stringify(ok));
  assert.equal(seen.at(-1), ok.data[ENGINE]);
  const bad = { ...ok, data: { ...ok.data, [ENGINE]: JSON.stringify({ v: 1, garments: [{ id: 'bad' }], journeys: [] }) } };
  const before = a.dump();
  assert.throws(() => BK.read(JSON.stringify(bad)), /이 앱이 읽을 수 없어요/);
  assert.deepEqual(a.dump(), before);
});

test('복원이 깨끗이 되돌려지면 앞선 복원의 되돌리기 지점(보관본)을 그대로 둔다. 일부만 바뀌면 새 보관본을 남긴다', () => {
  const a = storage(); seed(a); const BK = run(a);
  const original = a.dump();
  BK.restore(BK.read(other()).data); // 첫 복원: 보관본 = 원래 자료
  const firstStash = a.getItem('eoul-backup:stash');
  const afterFirst = a.dump();
  const second = JSON.parse(other()); second.data['eoul-d12-hang:consult'] = '{"threads":[{"id":"x","turns":[]}],"cur":null}';
  a.sets = 0; a.failSetAt = 1; // 두 번째 복원: 보관본은 쓰였지만 바꾸는 중 실패 → 깨끗이 되돌림
  assert.throws(() => BK.restore(BK.read(JSON.stringify(second)).data), /바꾸지 않았어요/);
  a.failSetAt = undefined;
  assert.equal(a.getItem('eoul-backup:stash'), firstStash, '앞선 되돌리기 지점이 남아 있어야 한다');
  assert.deepEqual(a.dump(), afterFirst);
  BK.undo();
  assert.deepEqual(a.dump(), original);
  // 보관본이 없던 상태에서 깨끗이 되돌려지면 새 보관본도 남기지 않는다.
  const b = storage(); seed(b); const BK2 = run(b);
  b.sets = 0; b.failSetAt = 1;
  assert.throws(() => BK2.restore(BK2.read(other()).data), /바꾸지 않았어요/);
  b.failSetAt = undefined;
  assert.equal(b.getItem('eoul-backup:stash'), null);
  // 일부만 바뀌면 이번 보관본이 유일한 복구 지점이라 남긴다.
  const c = storage(); seed(c); const BK3 = run(c);
  const cBefore = JSON.parse(JSON.stringify(BK3.snapshot())); // 보관본은 캐시·다른 앱 키를 뺀 스냅숏이다
  c.sets = 0; c.failSetsAfter = 2;
  assert.throws(() => BK3.restore(BK3.read(other()).data), (e) => e.code === 'partial');
  c.failSetsAfter = undefined;
  assert.deepEqual(JSON.parse(JSON.stringify(BK3.stash().data)), cBefore);
});

test('앞선 되돌리기 지점은 이번 복원이 끝까지 성공하기 전에는 다시 쓰지 않는다(저장 공간이 거의 찬 경우 포함)', () => {
  const a = storage(); seed(a); const BK = run(a);
  const original = a.dump();
  BK.restore(BK.read(other()).data);
  const firstStash = a.getItem('eoul-backup:stash');
  assert.equal(a.getItem('eoul-backup:stash-next'), null, '성공하면 임시 칸을 지운다');
  // 바꾸는 중 실패하고 이후 쓰기도 계속 막히는(되돌림은 지우기·작은 쓰기로 끝나는) 상황에서도 앞선 지점은 그대로다.
  const second = JSON.parse(other()); second.data['eoul-d12-hang:consult'] = 'x'.repeat(50);
  a.sets = 0; a.failSetAt = 1; // 임시 칸(0)은 쓰였고, 바뀌는 키 하나(1)를 쓰다 막힘 → 깨끗이 되돌림
  assert.throws(() => BK.restore(BK.read(JSON.stringify(second)).data), /바꾸지 않았어요/);
  a.failSetAt = undefined;
  assert.equal(a.getItem('eoul-backup:stash'), firstStash);
  assert.equal(a.getItem('eoul-backup:stash-next'), null);
  // 올리기(STASH로 옮기기)가 막혀도 복원은 끝났고, 임시 칸이 되돌리기 지점이 된다.
  const afterFirst = a.dump();
  const b = storage(); seed(b); const BK2 = run(b);
  const bOriginal = JSON.parse(JSON.stringify(BK2.snapshot()));
  b.sets = 0; b.failSetAt = 4; // 임시 칸(0) + 바꾸기 3번(1~3) 뒤 올리기(4)에서 막힘
  BK2.restore(BK2.read(other()).data);
  b.failSetAt = undefined;
  assert.equal(b.getItem('eoul-backup:stash'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(BK2.stash().data)), bOriginal);
  BK2.undo();
  assert.equal(b.getItem('eoul-backup:stash-next'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(BK2.snapshot())), bOriginal);
  BK.undo();
  assert.deepEqual(a.dump(), original);
  assert.ok(afterFirst);
});

test('앞선 복원의 임시 칸이 남아 있으면(일부만 바뀜·올리기 막힘) 새 복원을 시작하지 않고, 되돌리기 뒤에는 다시 복원할 수 있다', () => {
  for (const [label, setup] of [
    ['올리기 막힘', (st) => { st.sets = 0; st.failSetAt = 4; }],      // 임시 칸(0) + 바꾸기(1~3) 성공, 올리기(4) 막힘
    ['일부만 바뀜', (st) => { st.sets = 0; st.failSetsAfter = 2; }],  // 임시 칸·키 하나 뒤 계속 막힘 → partial
  ]) {
    const a = storage(); seed(a); const BK = run(a);
    const original = JSON.parse(JSON.stringify(BK.snapshot()));
    setup(a);
    try { BK.restore(BK.read(other()).data); } catch (e) { assert.equal(e.code, 'partial', label); }
    a.failSetAt = undefined; a.failSetsAfter = undefined;
    const pending = a.getItem('eoul-backup:stash-next');
    assert.ok(pending, label);
    const now = a.dump();
    assert.throws(() => BK.restore(BK.read(other()).data), (e) => e.code === 'pending', label);
    assert.deepEqual(a.dump(), now, `${label}: 아무것도 바꾸지 않는다`);
    BK.undo(); // 깨끗한 복구 지점(임시 칸)으로 돌아간다
    assert.deepEqual(JSON.parse(JSON.stringify(BK.snapshot())), original, label);
    assert.equal(a.getItem('eoul-backup:stash-next'), null);
    BK.restore(BK.read(other()).data); // 이제 다시 복원할 수 있다
  }
});
