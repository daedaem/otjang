// 개편 A 5단계(대표 11-12 "추천대로", 의도 2번 「본 옷 찾아 주기」): 커뮤니티·쇼핑에서 본 옷을 「찾는 중」에 적어 두고
// 새 상품·중고 판매처에서 다시 찾는다. 자동 매물 알림은 공식 경로·약관 확인 전이라 없다(저장과 다시 찾기만).
// 저장은 이 기기(회원별 저장 범위)의 한 키, 50개까지. 형식이 다르면 원문을 덮어쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readWatch, addWatch, removeWatch, WATCH_LIMIT } from '../src/domain/watch-list.js';

const at = '2026-11-14T03:00:00.000Z';
test('비어 있으면 빈 목록이고, 적은 글과 상품을 최근 것부터 넣는다', () => {
  let w = readWatch(null);
  assert.deepEqual(w, { v: 1, items: [] });
  w = addWatch(w, { text: '  바라쿠타 G9 네이비 38  ' }, at);
  w = addWatch(w, { productId: 'ms-12345', text: '울 블렌드 네이비 블레이저' }, '2026-11-14T04:00:00.000Z');
  assert.equal(w.items.length, 2);
  assert.equal(w.items[0].productId, 'ms-12345');
  assert.equal(w.items[1].text, '바라쿠타 G9 네이비 38');
  assert.match(w.items[1].id, /^w[0-9a-z]{6,}$/);
  assert.deepEqual(readWatch(JSON.stringify(w)), w);
});

test('같은 상품이나 같은 글은 한 번만, 빈 글·긴 글·잘못된 상품 id는 거절한다', () => {
  let w = addWatch(readWatch(null), { text: '리바이스 501 32' }, at);
  assert.equal(addWatch(w, { text: '리바이스  501 32' }, at), w);
  w = addWatch(w, { productId: 'ms-1', text: 'a' }, at);
  assert.equal(addWatch(w, { productId: 'ms-1', text: 'b' }, at), w);
  assert.throws(() => addWatch(w, { text: '   ' }, at));
  assert.throws(() => addWatch(w, { text: 'x'.repeat(81) }, at));
  assert.throws(() => addWatch(w, { productId: 'evil', text: 'x' }, at));
});

test('50개를 넘으면 가장 오래된 것부터 빠지고, 지우기는 그 하나만 뺀다', () => {
  let w = readWatch(null);
  for (let i = 0; i < WATCH_LIMIT + 3; i++) w = addWatch(w, { text: `옷 ${i}` }, at);
  assert.equal(w.items.length, WATCH_LIMIT);
  assert.equal(w.items[0].text, `옷 ${WATCH_LIMIT + 2}`);
  const gone = w.items[1].id;
  const next = removeWatch(w, gone);
  assert.equal(next.items.length, WATCH_LIMIT - 1);
  assert.ok(!next.items.some((x) => x.id === gone));
});

test('형식이 다른 원문은 읽지 않고 던져 덮어쓰지 않게 한다', () => {
  for (const raw of ['{', '{"v":2,"items":[]}', '{"v":1,"items":{}}', '{"v":1,"items":[{"id":"w1"}]}', '{"v":1,"items":[],"x":1}'])
    assert.throws(() => readWatch(raw), /찾는 중/);
});
