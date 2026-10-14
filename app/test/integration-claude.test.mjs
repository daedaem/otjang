// Claude 쪽 변경을 Codex 통합판에 옮기면서 더한 검사: 카탈로그 이름·종류 충돌, 비슷한 사진, 예시 옷장, 백업 ZIP
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../src/data/products.js';
import { SLOTS, SLOT_BY_ID, STYLES } from '../src/data/slots.js';
import { lookalike, exampleCloset, closetLooks, productsFor, search } from '../src/engine.js';
import { makeGarment, DEMO_SLOTS } from '../src/wardrobe.js';
import { productExclusionReason } from '../src/catalog-policy.js';
import { zipStore, unzipSingle } from '../src/zip-store.js';

const base = { gender: 'M', styles: ['classic'], closet: [], hidden: [], brands: [], now: '2026-10-14T12:00:00+09:00' };

test('카탈로그: 이름이 다른 종류를 가리키는 상품이 없다', () => {
  const conflict = {
    shoes: /팬츠|pants|셔츠|shirt|재킷|자켓|jacket|코트|주걱|슈\s*혼|깔창|인솔|양말/i,
    bottom: /재킷|자켓|jacket|코트|coat|스웨터|sweater|swim|수영|쇼트|shorts\b/i,
    top: /팬츠|pants|슬랙스|스커트|skirt|쇼트(?!\s*슬리브)|shorts\b|재킷|자켓|jacket|코트|swim|수영|장갑|gloves?\b/i,
    outer: /팬츠|pants|슬랙스|스커트|구두|스니커즈|swim|수영|티셔츠/i,
    dress: /팬츠|pants|재킷|자켓|swim|수영/i,
    acc: /팬츠|재킷|자켓|셔츠|swim/i,
  };
  const bad = PRODUCTS.filter((p) => conflict[SLOT_BY_ID[p.slot].cat]?.test(p.name.replace(/HOOD ZIP UP PARKA/i, '')));
  assert.deepEqual(bad.map((p) => `${p.id} ${p.slot} ${p.name}`), []);
  const odd = PRODUCTS.filter((p) => /양키스|루니툰즈|케어베어|리버풀|swim|장갑|gloves|아톰|감마|후디니|R1 |마이크로 D/i.test(p.name) && !['m-down', 'm-shell', 'm-fleece'].includes(p.slot));
  assert.deepEqual(odd.map((p) => `${p.id} ${p.slot} ${p.name}`), []);
  // 신발이 셔츠로 들어가던 레드윙 위켄더는 구두로
  assert.ok(PRODUCTS.filter((p) => /위켄더/.test(p.name)).every((p) => SLOT_BY_ID[p.slot].cat === 'shoes'));
  for (const name of ['STRIPE ONEPIECE SWIMSUIT BLACK', 'Grand Mama Hand Knit Gloves (Khaki)', '코튼 치노 드로스트링 쇼트-블랙', '폴로 랄프 로렌 양키스 티셔츠-블루'])
    assert.ok(productExclusionReason({ name, price: 10000, slot: 'm-tee' }), name);
});

test('사진이 없는 옷은 같은 종류·색(또는 아주 가까운 색)의 상품 사진, 없으면 null', () => {
  const p = lookalike('m-chino', 'beige');
  assert.equal(p.slot, 'm-chino');
  assert.equal(p.color, 'beige');
  assert.equal(lookalike('m-chore', 'purple'), null);
  assert.equal(lookalike('m-chino', null), null);
  const other = productsFor('m-chino').find((x) => x.color === 'beige' && x.brand !== p.brand);
  if (other) assert.equal(lookalike('m-chino', 'beige', { brand: other.brand }).brand, other.brand);
  for (const s of SLOTS) for (const c of s.colors) {
    const x = lookalike(s.id, c);
    if (x) assert.ok(x.slot === s.id && x.img && !productExclusionReason(x), `${s.id} ${c}`);
  }
});

test('예시 옷장: 모든 스타일·성별·계절에서 예시 옷만으로 "오늘 뭐 입지?" 코디가 나온다', () => {
  const seasons = { spring: '2026-04-14T12:00:00+09:00', summer: '2026-07-14T12:00:00+09:00', fall: '2026-10-14T12:00:00+09:00', winter: '2027-01-14T12:00:00+09:00' };
  const missing = [];
  for (const [key, s] of Object.entries(STYLES)) for (const g of s.g) for (const [season, now] of Object.entries(seasons)) {
    const st = { ...base, gender: g, styles: [key], now };
    const closet = exampleCloset(st).map((x, i) => makeGarment({ id: `demo_${g}_${i}`, slot: x.slot, color: x.color, gender: g, source: 'demo' }));
    assert.ok(closet.length >= 3 && closet.length <= 6, `${g} ${key} ${season} ${closet.length}`);
    if (!closetLooks({ ...st, closet }).ready.length) missing.push(`${g} ${key} ${season}`);
  }
  assert.deepEqual(missing, []);
  for (const g of ['M', 'F']) {
    const closet = DEMO_SLOTS[g].map(([slot, color], i) => makeGarment({ id: `demo_${g}_${i}`, slot, color, gender: g, source: 'demo' }));
    assert.ok(closetLooks({ ...base, gender: g, closet }).ready.length >= 1, `기본 예시 ${g}`);
    assert.ok(DEMO_SLOTS[g].every(([slot, color]) => lookalike(slot, color)), `기본 예시 ${g} 사진`);
  }
});

test('백업 ZIP: 무압축 ZIP 한 겹으로 감싸고 그대로 꺼낸다', async () => {
  const bytes = new Uint8Array([69, 79, 85, 76, 66, 75, 48, 50, 0, 1, 2, 3, 255]);
  const zip = await zipStore('eoul-wardrobe.eoul', new Blob([bytes]));
  const head = new Uint8Array(await zip.slice(0, 4).arrayBuffer());
  assert.deepEqual([...head], [0x50, 0x4b, 0x03, 0x04]);
  const out = await unzipSingle(zip);
  assert.equal(out.name, 'eoul-wardrobe.eoul');
  assert.deepEqual([...new Uint8Array(await out.blob.arrayBuffer())], [...bytes]);
  assert.equal(await unzipSingle(new Blob([bytes])), null, 'ZIP이 아니면 그대로 둔다');
  const broken = new Uint8Array(await zip.arrayBuffer());
  broken[30 + 'eoul-wardrobe.eoul'.length + 2] ^= 1; // 백업 내용 한 바이트
  assert.equal(await unzipSingle(new Blob([broken])), null, '내용이 바뀌면 거부');
});

test('레드윙 구두 검색에 구두주걱이 없다', () => {
  assert.ok(search(base, '레드윙 구두').items.every((i) => !/주걱|슈혼/.test(i.product.name) && i.slot.cat === 'shoes'));
});
