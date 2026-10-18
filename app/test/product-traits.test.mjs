import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productTraits, whyConflicts } from '../src/catalog-policy.js';
import { search, productsFor, productReasons } from '../src/engine.js';
import { SLOT_BY_ID } from '../src/data/slots.js';
import { newWardrobeState, wardrobeView } from '../src/wardrobe.js';

const firstVisit = () => ({ ...wardrobeView(newWardrobeState()), now: '2026-10-17' });
const labels = (name) => productTraits({ name }).map((t) => t.label);

test('traits come only from the product name', () => {
  assert.deepEqual(labels('프리미어 퓨어 캐시미어 로브 더블 코트 [CHESTNUT BROWN]'), ['롱', '캐시미어']);
  assert.deepEqual(labels('SUEDE FRENCH CAR COAT CAMEL'), ['스웨이드']);
  assert.deepEqual(labels('860 V15 (남성, 2E) (안정화) (L/GRAY)'), ['기능성 표기']);
  assert.deepEqual(labels('롱 슬리브 피케 폴로 셔츠 [네이비]'), ['긴팔'], '"롱 슬리브" is a sleeve, not a length');
  assert.deepEqual(labels('베이식 옥스포드 셔츠 [화이트]'), []);
  assert.deepEqual(labels('캐시미어 블렌드 오버사이즈 미니멀 발마칸 코트 [토프]'), ['오버사이즈', '캐시미어'], '미니멀 is not 미니');
});

test('a slot sentence about a short coat is replaced for a long coat, never shown as is', () => {
  const peacoat = SLOT_BY_ID['m-peacoat'];
  assert.ok(whyConflicts(peacoat.why, productTraits({ name: '캐시미어 로브 더블 코트' })));
  const { reasons, traitLine } = productReasons({ name: '캐시미어 로브 더블 코트' }, peacoat, [peacoat.why]);
  assert.ok(!reasons.includes(peacoat.why));
  assert.equal(reasons[0], traitLine);
});

test('functional shoes rank behind style shoes but are not removed', () => {
  const runners = productsFor('m-runner');
  const idx = runners.findIndex((p) => /안정화/.test(p.name));
  assert.ok(idx > 0, 'the stability runner is not first');
  const r = search(firstVisit(), '청바지에 어울리는 신발');
  const first = r.items.slice(0, 5).map((i) => i.product.name);
  assert.ok(!first.some((n) => /안정화|키높이/.test(n)), first.join(' / '));
});
