// 실행: node --test test/   — 앱 ↔ 내 서버 보내기·받기의 순수 함수
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const S = require('../src/sync.js');
const W = require('../src/wardrobe.js');
const C = require('../src/catalog.js');
const IMG = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
const base = W.migrate(JSON.parse(fs.readFileSync(__dirname + '/../data/sample-wardrobe.json', 'utf8')));

test('주소는 http(s)://호스트[:포트]만 받는다', () => {
  assert.equal(S.normalizeBase('http://localhost:8080/'), 'http://localhost:8080');
  assert.equal(S.normalizeBase(' HTTP://LocalHost:8080 '), 'http://localhost:8080');
  assert.equal(S.normalizeBase('https://192.168.0.10'), 'https://192.168.0.10');
  for (const bad of ['javascript:alert(1)', 'ftp://x', 'http://x/api', 'http://x:99999', 'localhost:8080', '', null]) assert.equal(S.normalizeBase(bad), '', String(bad));
  assert.ok(S.isLocalAddress('http://localhost:8080') && S.isLocalAddress('http://127.0.0.1:9') && !S.isLocalAddress('http://192.168.0.10:8080') && !S.isLocalAddress('bad'));
});

test('보내는 옷장 파일은 보유·후보·처분과 판정 기록을 모두 담고, 서버가 정리해도 같은 옷이 된다', () => {
  const st = { owner: base.owner, items: base.items.concat([W.cleanItem({ id: 'c1', status: 'candidate', cat: 'top', kind: 'knit', name: '후보' }, 0)]), decisions: [], catalog: { products: [] } };
  const p = S.wardrobePayload(st, { photos: true });
  assert.equal(p.schema, 2); assert.equal(p.items.length, 14);
  assert.deepEqual(W.cleanWardrobe(p).items, st.items, '정리해도 그대로');
});

test('사진을 빼고 보내면 내 사진은 사진 없음이 되고, 상품 사진은 상태·출처만 남는다', () => {
  let a = W.setOwnPhoto(base.items[0], IMG);
  let b = W.confirmProduct(W.setOwnPhoto(base.items[1], IMG), { brand: 'B', name: 'N', img: IMG, sourceName: '쇼핑몰' });
  const p = S.wardrobePayload({ owner: base.owner, items: [a, b], decisions: [] }, { photos: false });
  assert.equal(p.items[0].photo.kind, 'none'); assert.equal(p.items[0].photo.ownImg, '');
  assert.equal(p.items[1].photo.kind, 'confirmed'); assert.equal(p.items[1].photo.img, ''); assert.equal(p.items[1].photo.ownImg, ''); assert.equal(p.items[1].photo.sourceName, '쇼핑몰');
  assert.ok(!JSON.stringify(p).includes('data:image'), '사진 데이터가 하나도 없다');
  const w = S.wardrobePayload({ owner: base.owner, items: [a], decisions: [] }, { photos: true });
  assert.equal(w.items[0].photo.ownImg, IMG);
  assert.equal(a.photo.ownImg, IMG, '원본 상태는 바뀌지 않는다');
});

test('받을 때 서버에 내 사진이 없으면 이 브라우저의 내 사진을 남긴다', () => {
  const local = [W.setOwnPhoto(base.items[0], IMG), base.items[1]];
  const pulled = W.cleanWardrobe(S.wardrobePayload({ owner: base.owner, items: local, decisions: [] }, { photos: false })).items;
  const m = S.mergePulled(local, pulled);
  assert.equal(m[0].photo.kind, 'own'); assert.equal(m[0].photo.ownImg, IMG);
  assert.equal(m[1].photo.kind, 'none');
});

test('상품 목록도 같은 모양으로 보내고, 사진을 빼면 img 만 빈다', () => {
  const st = { catalog: { products: [C.cleanProduct({ id: 'p1', name: '니트', cat: 'top', kind: 'knit', img: IMG, price: 1000, checkedAt: '2026-10-12' }, 0)] } };
  const p = S.catalogPayload(st, { photos: false });
  assert.equal(C.cleanCatalog(p).products[0].img, ''); assert.equal(C.cleanCatalog(p).products[0].price, 1000);
  assert.equal(S.catalogPayload(st, { photos: true }).products[0].img, IMG);
});

test('멱등 키는 내용이 같으면 같고 다르면 다르다', async () => {
  const a = await S.idempotencyKey('{"a":1}'), b = await S.idempotencyKey('{"a":1}'), c = await S.idempotencyKey('{"a":2}');
  assert.equal(a, b); assert.notEqual(a, c); assert.match(a, /^otjang-[0-9a-f]{32}$/);
});
