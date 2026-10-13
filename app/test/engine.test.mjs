import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendItems,
  recommendLooks,
  closetLooks,
  essentials,
  search,
  seasonOf,
  josa,
  productsFor,
  harmony,
  brandsFor,
  styleScore,
} from '../src/engine.js';
import { parseQuery } from '../src/query.js';
import { SLOTS, SLOT_BY_ID, STYLES, COLORS } from '../src/data/slots.js';
import { LOOKS, ROLE_ORDER } from '../src/data/looks.js';
import { PRODUCTS } from '../src/data/products.js';
import fs from 'node:fs';

const OCT = '2026-10-13T12:00:00+09:00';
const base = { gender: 'M', styles: ['classic'], now: OCT, closet: [], hidden: [], brands: [] };
const item = (slot, color, extra = {}) => ({ id: `t-${slot}-${color}`, slot, color, ...extra });

test('카탈로그: 모든 행이 알려진 종류·색과 가격·링크 필드를 가진다', () => {
  assert.ok(PRODUCTS.length >= 300, `상품 ${PRODUCTS.length}개`);
  for (const p of PRODUCTS) {
    assert.ok(SLOT_BY_ID[p.slot], `${p.id} 종류 ${p.slot}`);
    assert.ok(COLORS[p.color], `${p.id} 색 ${p.color}`);
    assert.ok(p.price > 0 && p.brand && p.name, p.id);
    assert.match(p.url, /^https:\/\/www\.musinsa\.com\/products\/\d+$/);
    assert.match(p.img, /^https:\/\/image\.msscdn\.net\//);
  }
  assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, PRODUCTS.length, '중복 없음');
});

test('카탈로그: 코디 공식에 쓰인 종류마다 상품이 있다', () => {
  const used = new Set(LOOKS.flatMap((l) => ROLE_ORDER.flatMap((r) => l.roles[r]?.s || [])));
  const empty = [...used].filter((id) => !productsFor(id).length);
  assert.deepEqual(empty, []);
});

test('스타일마다 이 계절에 쓸 코디 공식이 있다', () => {
  for (const [key, s] of Object.entries(STYLES)) {
    for (const g of s.g) {
      const looks = recommendLooks({ ...base, gender: g, styles: [key] });
      assert.ok(looks.length >= 1, `${g} ${key}`);
    }
  }
});

test('계절과 조사', () => {
  assert.equal(seasonOf(new Date('2026-10-13')), 'fall');
  assert.equal(seasonOf(new Date('2026-01-05')), 'winter');
  assert.equal(josa('치노', '과', '와'), '와');
  assert.equal(josa('재킷', '을', '를'), '을');
});

test('아무것도 넣지 않아도 바로 실제 상품을 추천한다', () => {
  const items = recommendItems(base);
  assert.ok(items.length >= 6);
  for (const it of items) assert.ok(it.slot.seasons.includes('fall'), it.slot.id);
  assert.ok(new Set(items.map((i) => i.reasons[0])).size >= 6, '이유가 카드마다 다르다');
  assert.ok(recommendLooks(base).length >= 2);
});

test('여러 스타일: 먼저 고른 스타일을 더 반영한다', () => {
  const ame = recommendLooks({ ...base, styles: ['amekaji', 'classic'] });
  assert.ok(ame[0].look.styles.includes('amekaji'), ame[0].look.id);
  const slot = SLOT_BY_ID['m-workboots'];
  assert.ok(styleScore(slot, ['amekaji', 'classic']) > styleScore(slot, ['classic', 'amekaji']));
});

test('선호 브랜드: 먼저 추천하고, "내 브랜드만"이면 그 브랜드만', () => {
  const top = brandsFor('M')[0].name;
  const withBrand = recommendItems({ ...base, brands: [top] });
  assert.ok(withBrand.some((i) => i.product.brand === top));
  const only = recommendItems({ ...base, brands: [top], brandOnly: true });
  assert.ok(only.length > 0);
  assert.ok(only.every((i) => i.product.brand === top));
});

test('옷장: 가진 옷은 다시 추천하지 않고 코디에 내 옷으로 들어간다', () => {
  const closet = [item('m-chino', 'beige'), item('m-loafer', 'brown'), item('m-oxford', 'white')];
  const s = { ...base, closet };
  assert.ok(recommendItems(s).every((i) => !['m-chino', 'm-loafer', 'm-oxford'].includes(i.slot.id)));
  const looks = recommendLooks(s);
  assert.ok(looks[0].ownedCount >= 2);
  assert.ok(recommendItems(s).some((i) => i.reasons[0]?.startsWith('가진 ')));
});

test('옷장: 가진 옷만으로 되는 코디와 하나만 사면 되는 코디', () => {
  const closet = [
    item('m-harrington', 'navy'),
    item('m-oxford', 'blue'),
    item('m-chino', 'beige'),
    item('m-loafer', 'brown'),
  ];
  const { ready, almost } = closetLooks({ ...base, closet });
  assert.ok(ready.length >= 1, '아이비 캠퍼스는 가진 옷으로 완성');
  assert.ok(ready.every((r) => r.buyCount === 0));
  assert.ok(almost.every((r) => r.buyCount === 1));
});

test('옷장: 같은 종류가 여러 벌이면 색이 어울리는 옷을 고른다', () => {
  const closet = [
    item('m-oxford', 'white'),
    item('m-oxford', 'red'),
    item('m-chino', 'beige'),
    item('m-harrington', 'navy'),
    item('m-loafer', 'brown'),
  ];
  const look = closetLooks({ ...base, closet }).ready.find((r) => r.look.id === 'm-ivy-campus');
  assert.ok(look);
  assert.equal(look.items.find((i) => i.role === 'top').color, 'white');
});

test('색 조화: 포인트 색이 둘 이상이면 감점, 상·하의 밝기 차이는 가점', () => {
  assert.ok(
    harmony([
      { color: 'red', cat: 'top' },
      { color: 'green', cat: 'bottom' },
    ]) <
      harmony([
        { color: 'red', cat: 'top' },
        { color: 'beige', cat: 'bottom' },
      ]),
  );
  assert.ok(
    harmony([
      { color: 'white', cat: 'top' },
      { color: 'navy', cat: 'bottom' },
    ]) >
      harmony([
        { color: 'beige', cat: 'top' },
        { color: 'beige', cat: 'bottom' },
      ]),
  );
});

test('기본템 체크는 고른 스타일의 기본 아이템을 보여 준다', () => {
  const ess = essentials({ ...base, styles: ['amekaji'] });
  assert.ok(ess.some((e) => e.slot.id === 'm-workboots'));
  assert.ok(ess.every((e) => e.slot.style.amekaji >= 3));
});

test('예산을 넘는 상품은 추천하지 않는다', () => {
  const items = recommendItems({ ...base, budget: 50000 });
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.product.price <= 50000));
});

test('상황과 성별', () => {
  assert.ok(recommendLooks({ ...base, occasion: 'work' }).every((l) => l.look.occ.includes('work')));
  const f = { ...base, gender: 'F', styles: ['french'] };
  assert.ok(recommendItems(f).every((i) => i.slot.g === 'F'));
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
  assert.ok(r.outfit);
});

test('한 줄 요청: 브랜드와 스타일', () => {
  const top = brandsFor('M').find((b) => b.name === '리바이스') ? '리바이스' : brandsFor('M')[0].name;
  const r = search(base, `${top} 청바지`);
  assert.equal(r.query.brand, top);
  assert.ok(r.items.length > 0 && r.items.every((i) => i.product.brand === top));
  assert.equal(parseQuery('아메카지 재킷').style, 'amekaji');
});

test('이해하지 못한 요청도 추천을 돌려주고, 같은 입력이면 같은 결과', () => {
  const r = search(base, '아무거나 멋있는 거');
  assert.equal(r.understood, false);
  assert.ok(r.items.length > 0);
  assert.deepEqual(
    recommendItems(base).map((i) => i.product.id),
    recommendItems(base).map((i) => i.product.id),
  );
});

test('모든 종류 정의가 올바르다', () => {
  for (const s of SLOTS) {
    assert.ok(['M', 'F'].includes(s.g));
    assert.ok(s.why && s.tip && s.name && s.colors.every((c) => COLORS[c]), s.id);
    for (const k of Object.keys(s.style)) assert.ok(STYLES[k]?.g.includes(s.g), `${s.id} ${k}`);
  }
});

test('한 파일 빌드에서 모듈의 최상위 이름이 겹치지 않는다', () => {
  const files = ['data/slots.js', 'data/looks.js', 'data/products.js', 'query.js', 'engine.js', 'icons.js', 'main.js'];
  const seen = new Map();
  for (const f of files) {
    const src = fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/^(?:export\s+)?(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      assert.ok(!seen.has(m[1]), `${m[1]}: ${seen.get(m[1])} / ${f}`);
      seen.set(m[1], f);
    }
  }
});

test('search anchors never invent ownership and a selected product stays a purchasable product', () => {
  const result = search(base, '청바지에 어울리는 신발');
  assert.ok(result.outfit);
  assert.equal(result.outfit.ownedCount, 0);
  const p = PRODUCTS.find((p) => p.slot === 'm-oxford');
  const look = recommendLooks(base, { limit: 1, pinnedProduct: p })[0];
  assert.ok(look);
  assert.ok(look.items.some((i) => i.product?.id === p.id && !i.owned));
});
test('generic garment IDs are counted once and cannot fill two outfit roles', () => {
  const generic = { id: 'only-shirt', slot: null, kind: 'shirt', gender: 'M', color: null, label: '내 셔츠' };
  const looks = recommendLooks({ ...base, closet: [generic] }, { limit: 100 });
  assert.ok(looks.some((r) => r.ownedCount === 1));
  for (const look of looks) {
    const ids = look.items.filter((i) => i.owned).map((i) => i.item.id);
    assert.equal(ids.length, new Set(ids).size);
  }
  const ess = essentials({ ...base, closet: [generic] });
  assert.ok(ess.some((e) => e.slot.shape === 'shirt' && e.needsCheck));
  assert.ok(ess.filter((e) => e.slot.shape === 'shirt').every((e) => !e.owned));
});

test('all 52 previous slot types can migrate without dropping garment IDs', async () => {
  const { legacyWardrobeV2 } = await import('../src/legacy-wardrobe.js');
  const { upgradeWardrobe } = await import('../src/wardrobe.js');
  for (const slot of legacyWardrobeV2.SLOTS) {
    const previous = legacyWardrobeV2.migrateLegacyWardrobe(
      JSON.stringify({ onboarded: true, gender: slot.g, style: 'classic', owned: [slot.id], saved: [] }),
    );
    const converted = upgradeWardrobe(previous);
    assert.equal(converted.garments[0].id, previous.garments[0].id);
    assert.ok(SLOT_BY_ID[converted.garments[0].slot]);
  }
});
test('care tools and childrenswear are excluded in catalog, classification, search and recommendations', async () => {
  const { productExclusionReason } = await import('../src/catalog-policy.js');
  const { classify } = await import('../tools/catalog/classify.mjs');
  for (const name of [
    '23인치 구두주걱 슈혼 95191',
    '구두 슈트리',
    '가죽 클리너',
    '옥스퍼드 쇼트올',
    '베이비 니트',
    '신발 끈',
  ]) {
    assert.ok(productExclusionReason({ name, price: 41000 }));
    assert.equal(classify(name, 'M'), null);
  }
  assert.equal(
    PRODUCTS.some((p) => p.id === 'ms-7384409' || p.id === 'ms-6317624'),
    false,
  );
  const found = search(base, '레드윙 구두');
  assert.equal(found.items.length, 0);
  for (const k of Object.keys(STYLES))
    for (const g of STYLES[k].g) {
      const s = { ...base, gender: g, styles: [k] };
      for (const row of recommendItems(s)) {
        assert.equal(productExclusionReason(row.product), null);
      }
    }
});
