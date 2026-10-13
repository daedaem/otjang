import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendItems, recommendLooks, search, seasonOf, josa, productsFor } from '../src/engine.js';
import { parseQuery } from '../src/query.js';
import { SLOTS, SLOT_BY_ID } from '../src/data/slots.js';
import { LOOKS } from '../src/data/looks.js';
import { PRODUCTS } from '../src/data/products.js';

const OCT = '2026-10-13T12:00:00+09:00';
const base = { gender: 'M', style: 'classic', now: OCT, owned: [], hidden: [] };

test('카탈로그: 모든 상품이 실제 자리·가격·링크를 가진다', () => {
  assert.ok(PRODUCTS.length >= 80, `상품 ${PRODUCTS.length}개`);
  for (const p of PRODUCTS) {
    assert.ok(SLOT_BY_ID[p.slot], `${p.id} 자리 ${p.slot}`);
    assert.ok(p.price > 0 && p.brand && p.name, p.id);
    assert.match(p.url, /^https:\/\/www\.musinsa\.com\/products\/\d+$/);
    assert.match(p.img, /^https:\/\/image\.msscdn\.net\//);
  }
});

test('카탈로그: 코디 공식에 쓰인 모든 자리에 상품이 하나 이상 있다', () => {
  const used = new Set(LOOKS.flatMap((l) => Object.values(l.roles).flat()));
  const empty = [...used].filter((id) => !productsFor(id).length);
  assert.deepEqual(empty, []);
});

test('계절은 날짜로 정한다', () => {
  assert.equal(seasonOf(new Date('2026-10-13')), 'fall');
  assert.equal(seasonOf(new Date('2026-01-05')), 'winter');
  assert.equal(seasonOf(new Date('2026-07-01')), 'summer');
});

test('조사: 받침에 따라 와/과', () => {
  assert.equal(josa('치노', '과', '와'), '와');
  assert.equal(josa('로퍼', '과', '와'), '와');
  assert.equal(josa('블레이저', '과', '와'), '와');
  assert.equal(josa('셔츠', '과', '와'), '와');
  assert.equal(josa('데님 스트레이트', '과', '와'), '와');
  assert.equal(josa('니트', '과', '와'), '와');
  assert.equal(josa('코트', '을', '를'), '를');
  assert.equal(josa('재킷', '을', '를'), '을');
});

test('아무것도 입력하지 않아도 바로 실제 상품을 추천한다', () => {
  const items = recommendItems(base);
  assert.ok(items.length >= 6);
  for (const it of items) {
    assert.ok(it.product.price > 0);
    assert.ok(it.slot.seasons.includes('fall'), `${it.slot.id}는 가을 아이템`);
  }
  const looks = recommendLooks(base);
  assert.ok(looks.length >= 2);
  for (const l of looks) assert.ok(l.items.some((i) => i.role === 'top' || i.role === 'dress'));
});

test('가진 옷은 다시 추천하지 않고, 코디에는 내 옷으로 들어간다', () => {
  const owned = ['m-chino', 'm-loafer', 'm-oxford-white'];
  const items = recommendItems({ ...base, owned });
  assert.ok(items.every((i) => !owned.includes(i.slot.id)));
  const looks = recommendLooks({ ...base, owned });
  assert.ok(looks[0].ownedCount >= 2, '가진 옷을 많이 쓰는 코디가 먼저');
  assert.ok(items.some((i) => i.reasons[0]?.startsWith('가진 ')), '가진 옷과의 조합을 이유로 먼저 보여 준다');
  assert.ok(new Set(recommendItems(base).map((i) => i.reasons[0])).size >= 6, '이유가 카드마다 다르다');
});

test('예산을 넘는 상품은 추천하지 않는다', () => {
  const items = recommendItems({ ...base, budget: 50000 });
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.product.price <= 50000));
  for (const l of recommendLooks({ ...base, budget: 50000 })) for (const i of l.items) if (!i.owned) assert.ok(i.product.price <= 50000);
});

test('상황을 고르면 그 상황에 맞는 코디가 먼저 나온다', () => {
  const looks = recommendLooks({ ...base, occasion: 'work' });
  assert.ok(looks.length > 0);
  assert.ok(looks.every((l) => l.look.occ.includes('work')));
  assert.equal(recommendItems({ ...base, occasion: 'work' })[0].slot.occ.includes('work'), true);
});

test('여성 옷을 고르면 여성 아이템만 나온다', () => {
  const s = { ...base, gender: 'F' };
  assert.ok(recommendItems(s).every((i) => i.slot.g === 'F'));
  assert.ok(recommendLooks(s).every((l) => l.look.g === 'F'));
});

test('한 줄 요청: 출근용 셔츠 10만원 이하', () => {
  const q = parseQuery('출근용 셔츠 10만원 이하');
  assert.equal(q.occasion, 'work');
  assert.equal(q.maxPrice, 100000);
  const r = search(base, '출근용 셔츠 10만원 이하');
  assert.ok(r.items.length >= 3);
  assert.ok(r.items.every((i) => i.slot.shape === 'shirt' && i.product.price <= 100000));
});

test('한 줄 요청: 청바지에 어울리는 신발', () => {
  const r = search(base, '청바지에 어울리는 신발');
  assert.ok(r.items.length >= 3);
  assert.ok(r.items.every((i) => i.slot.cat === 'shoes'));
  assert.ok(r.outfit, '청바지를 넣은 코디도 보여 준다');
  assert.ok(r.outfit.items.some((i) => i.slot.id === 'm-denim' && !i.owned && i.product));
  assert.equal(r.outfit.ownedCount, 0, '검색 단어는 보유 사실이 아니다');
});

test('검색 기준이 실제 옷장에도 있으면 그 옷만 보유로 반영한다', () => {
  const r = search({ ...base, owned: ['m-denim'] }, '청바지에 어울리는 신발');
  assert.ok(r.outfit.items.some((i) => i.slot.id === 'm-denim' && i.owned));
  assert.equal(r.outfit.ownedCount, 1);
});

test('상품 상세 코디는 다른 브랜드의 같은 종류 대신 선택한 상품을 사용한다', () => {
  const product = productsFor('m-oxford-white').at(-1);
  const looks = recommendLooks({ ...base, owned: ['m-oxford-white'] }, { product, limit: 10 });
  assert.ok(looks.length);
  for (const look of looks) {
    const item = look.items.find((i) => i.slot.id === product.slot);
    assert.equal(item.product.id, product.id);
    assert.equal(item.owned, false);
    assert.equal(look.buyTotal, look.items.filter((i) => !i.owned).reduce((sum, i) => sum + i.product.price, 0));
  }
});

test('한 줄 요청: 만원대·가성비·색', () => {
  assert.equal(parseQuery('5만원대 니트').maxPrice, 59999);
  assert.equal(parseQuery('가성비 니트').maxPrice, 60000);
  assert.equal(parseQuery('네이비 니트').color, 'navy');
  const r = search(base, '겨울 데이트 코트');
  assert.ok(r.items.length > 0);
  assert.ok(r.items.every((i) => i.slot.shape === 'coat'));
});

test('이해하지 못한 요청도 빈 화면 대신 추천을 돌려준다', () => {
  const r = search(base, '아무거나 멋있는 거');
  assert.equal(r.understood, false);
  assert.ok(r.items.length > 0);
});

test('같은 입력이면 같은 결과', () => {
  assert.deepEqual(recommendItems(base).map((i) => i.product.id), recommendItems(base).map((i) => i.product.id));
});

test('모든 자리 정의가 올바르다', () => {
  for (const s of SLOTS) {
    assert.ok(['M', 'F'].includes(s.g));
    assert.ok(s.why && s.tip && s.name);
    assert.ok(s.seasons.length > 0);
  }
});
