// 실행: node --test test/   — 옷장 파일 스키마 2: 옮기기, 사진 상태, 상품 매칭 분리, 내보내기, 정리
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const W = require('../src/wardrobe.js');
const v1 = JSON.parse(fs.readFileSync(__dirname + '/fixtures/wardrobe-v1.json', 'utf8'));
const v2 = JSON.parse(fs.readFileSync(__dirname + '/../data/sample-wardrobe.json', 'utf8'));
const IMG = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
const RULE = ['id', 'status', 'cat', 'kind', 'family', 'light', 'formality', 'pattern', 'seasons'];
const rules = (items) => items.map((i) => Object.fromEntries(RULE.map((k) => [k, i[k]])));

test('스키마 1 파일을 옮기면 13벌 모두 사진 초안(photo-draft)이고 확인된 제품은 0벌이다', () => {
  const w = W.migrate(v1);
  assert.equal(w.schema, 2);
  assert.equal(w.items.length, 13);
  assert.ok(w.items.every((i) => i.attrSource === 'photo-draft' && i.product === null && i.matchCandidates.length === 0 && i.look3d === null));
  assert.ok(w.items.every((i) => i.photo.kind === 'none' || i.photo.kind === 'own'));
});

test('옮기기는 멱등이다: 두 번 옮겨도 같다', () => {
  const once = W.migrate(v1), twice = W.migrate(once);
  assert.deepEqual(twice, once);
});

test('스키마 1의 source·confirmed가 attrSource로 옮겨진다', () => {
  const mk = (o) => W.cleanItem(Object.assign({ cat: 'top', kind: 'shirt', name: 'x' }, o), 0).attrSource;
  assert.equal(mk({ source: 'photo-draft', confirmed: false }), 'photo-draft');
  assert.equal(mk({ source: 'photo-draft', confirmed: true }), 'owner-confirmed');
  assert.equal(mk({ source: 'manual' }), 'owner');
  assert.equal(mk({}), 'owner');
  assert.equal(mk({ attrSource: 'owner-confirmed' }), 'owner-confirmed');
});

test('스키마 1의 img는 내 사진(own)으로 옮겨지고 ownImg에도 남는다', () => {
  const it = W.cleanItem({ cat: 'top', kind: 'shirt', name: 'x', img: IMG }, 0);
  assert.equal(it.photo.kind, 'own'); assert.equal(it.photo.img, IMG); assert.equal(it.photo.ownImg, IMG);
});

test('규칙 필드는 옮기기 전후가 같다 (13벌)', () => {
  assert.deepEqual(rules(W.migrate(v1).items), rules(v1.items.map((i) => W.cleanItem(i, 0))));
  assert.deepEqual(rules(W.migrate(v2).items), rules(W.migrate(v1).items));
});

test('사진 상태는 사용자 동작으로만 오른다: 정리 함수가 상태를 올리는 길은 없다', () => {
  const base = W.cleanItem({ cat: 'top', kind: 'shirt', name: 'x', img: IMG }, 0);
  // 파일에 '확인됨'이라고 적혀 있어도 확인 기록(product.confirmedAt)이 없으면 후보로 내려간다
  const fake = W.cleanItem({ cat: 'top', kind: 'shirt', name: 'x', photo: { kind: 'confirmed', img: IMG, sourceName: '쇼핑몰' } }, 0);
  assert.equal(fake.photo.kind, 'candidate'); assert.equal(fake.product, null);
  const fake2 = W.cleanItem({ cat: 'top', kind: 'shirt', name: 'x', photo: { kind: 'confirmed' }, product: { brand: 'B', name: 'N' } }, 0);
  assert.equal(fake2.photo.kind, 'candidate'); assert.equal(fake2.product, null);
  // product만 있고 사진 상태가 아니면 product는 버려진다
  const fake3 = W.cleanItem({ cat: 'top', kind: 'shirt', name: 'x', photo: { kind: 'own', img: IMG }, product: { brand: 'B', name: 'N', confirmedAt: '2026-10-12' } }, 0);
  assert.equal(fake3.product, null);
  // 확인은 confirmProduct로만
  const sub = W.setProductPhoto(base, 'substitute', { img: IMG, sourceName: '다른 상품 사진', sourceUrl: 'https://example.com/p' });
  assert.equal(sub.photo.kind, 'substitute'); assert.equal(sub.product, null); assert.equal(sub.photo.ownImg, IMG);
  const cand = W.setProductPhoto(sub, 'candidate', { sourceName: '같아 보이는 상품', brand: 'B', name: 'N' });
  assert.equal(cand.photo.kind, 'candidate'); assert.equal(cand.product, null); assert.equal(cand.matchCandidates.length, 1); assert.equal(cand.brand, '');
  const ok = W.confirmProduct(cand, { brand: 'B', name: 'N', code: '123' });
  assert.equal(ok.photo.kind, 'confirmed'); assert.deepEqual(ok.product, { brand: 'B', name: 'N', code: '123', confirmedAt: W.today() });
  assert.equal(ok.brand, 'B'); assert.equal(ok.model, 'N'); assert.equal(ok.matchCandidates.length, 0);
  assert.equal(W.cleanItem(ok, 0).photo.kind, 'confirmed', '확인 기록이 있는 확인됨은 정리해도 유지된다');
  const undo = W.unconfirm(ok);
  assert.equal(undo.photo.kind, 'candidate'); assert.equal(undo.product, null); assert.equal(undo.brand, 'B', '내 기록은 그대로');
  const back = W.clearProductPhoto(undo);
  assert.equal(back.photo.kind, 'own'); assert.equal(back.photo.img, IMG, '상품 사진을 떼면 내 사진으로 돌아간다');
  assert.throws(() => W.confirmProduct(base, {}), /브랜드나 상품명/);
  assert.throws(() => W.setProductPhoto(base, 'confirmed', {}));
});

test('대체 이미지·후보의 브랜드·이름·주소·가격은 내 옷 정보(brand, model, link, price)에 들어가지 않는다', () => {
  const base = W.cleanItem({ cat: 'outer', kind: 'jacket', name: '내 재킷', brand: '', link: '', price: null }, 0);
  const sub = W.setProductPhoto(base, 'substitute', { sourceName: '어느 브랜드 재킷', sourceUrl: 'https://shop.example/x', brand: '어느 브랜드', name: '재킷 A' });
  assert.equal(sub.brand, ''); assert.equal(sub.model, ''); assert.equal(sub.link, ''); assert.equal(sub.price, null);
  assert.equal(sub.matchCandidates.length, 0, '대체 이미지는 후보도 만들지 않는다');
  const cand = W.addCandidate(sub, { brand: '어느 브랜드', name: '재킷 A', evidence: 'logo', url: 'https://shop.example/x' });
  assert.equal(cand.brand, ''); assert.equal(cand.link, '');
  const exp = W.exportWardrobe({ owner: { nickname: '', height: null, topSize: '', bottomSize: '' }, items: [cand], decisions: [] }, {});
  assert.equal(exp.items[0].brand, ''); assert.equal(exp.items[0].link, ''); assert.deepEqual(exp.items[0].matchCandidates, []);
  const back = W.cleanWardrobe(exp).items[0];
  assert.equal(back.brand, ''); assert.equal(back.photo.kind, 'substitute', '브랜드 후보를 더해도 걸린 사진의 상태는 바뀌지 않는다'); assert.equal(back.photo.sourceName, '어느 브랜드 재킷');
});

test('내보내기: 스키마 2, 보유 옷만, 기본값에서 남의 상품 사진·후보 목록·가격·체형·판정 기록이 빠지고, 다시 가져오면 같다', () => {
  const w = W.migrate(v2);
  w.items[0] = W.setOwnPhoto(w.items[0], IMG);
  w.items[1] = W.setProductPhoto(w.items[1], 'substitute', { img: IMG, sourceName: '쇼핑몰', sourceUrl: 'https://shop.example/a' });
  w.items[2] = W.confirmProduct(W.setProductPhoto(w.items[2], 'candidate', { img: IMG, sourceName: '공식몰' }), { brand: 'B', name: 'N' });
  w.items[3] = Object.assign({}, w.items[3], { price: 10000, link: 'https://shop.example/b', checkedAt: '2026-10-01' });
  w.items.push(W.cleanItem({ id: 'c1', status: 'candidate', cat: 'top', kind: 'tee', name: '후보' }, 0));
  w.items.push(W.cleanItem({ id: 'g1', status: 'gone', cat: 'top', kind: 'tee', name: '처분' }, 0));
  w.owner = { nickname: '나', height: 175, topSize: 'M', bottomSize: '32' };
  w.decisions = [{ id: 'd1', itemId: 'c1', name: '후보', before: { lean: 'buy', reason: '', at: '2026-10-01' }, summary: { overlaps: 0, added: 1, blockers: 0 }, after: null }];
  const exp = W.exportWardrobe(w, {});
  assert.equal(exp.schema, 2); assert.equal(exp.kind, 'wardrobe');
  assert.equal(exp.items.length, 13, '구매 후보와 처분한 옷은 빠진다');
  assert.equal(exp.items[0].photo.img, IMG, '내 사진은 기본 포함');
  assert.equal(exp.items[1].photo.img, '', '대체 이미지는 기본 제외'); assert.equal(exp.items[1].photo.sourceName, '쇼핑몰'); assert.equal(exp.items[1].photo.sourceUrl, 'https://shop.example/a');
  assert.equal(exp.items[2].photo.img, '', '확인된 제품 사진도 남의 사진이라 기본 제외'); assert.equal(exp.items[2].photo.kind, 'confirmed'); assert.equal(exp.items[2].product.brand, 'B');
  assert.ok(exp.items.every((i) => i.matchCandidates.length === 0), '후보 목록은 기본 제외');
  assert.equal(exp.items[3].price, null); assert.equal(exp.items[3].link, ''); assert.equal(exp.items[3].checkedAt, '');
  assert.equal(exp.owner.height, null); assert.equal(exp.decisions.length, 0);
  const back = W.cleanWardrobe(exp);
  assert.deepEqual(W.exportWardrobe(Object.assign(back, { owner: exp.owner }), {}).items, exp.items, '내보낸 파일을 다시 가져와 내보내면 같다');
  const full = W.exportWardrobe(w, { img: true, otherImg: true, cands: true, price: true, body: true, log: true });
  assert.equal(full.items[1].photo.img, IMG); assert.equal(full.items[3].price, 10000); assert.equal(full.owner.height, 175); assert.equal(full.decisions.length, 1);
  assert.ok(full.items.some((i) => i.matchCandidates.length > 0));
  const noImg = W.exportWardrobe(w, { img: false });
  assert.equal(noImg.items[0].photo.kind, 'none'); assert.equal(noImg.items[0].photo.ownImg, ''); assert.equal(noImg.items[1].photo.ownImg, '');
});

test('정리: 새 필드의 위험한 주소, 마크업 글자, 너무 긴 값이 걸러진다', () => {
  const it = W.cleanItem({ cat: 'top', kind: 'shirt', name: '<b>x</b>', attrSource: 'hacked', photo: { kind: 'substitute', img: 'javascript:alert(1)', sourceName: 'a'.repeat(500), sourceUrl: 'javascript:alert(2)', checkedAt: 'yesterday' },
    product: { brand: 'B', confirmedAt: '2026-10-12' }, matchCandidates: Array.from({ length: 9 }, (_, i) => ({ brand: 'b' + i, url: 'javascript:' + i, evidence: 'magic', note: 'n'.repeat(900) })), look3d: { kind: 'robot', fabric: 'x' }, model: 'm'.repeat(200) }, 0);
  assert.equal(it.name, '<b>x</b>', '글자는 그대로 두되 화면에서 textContent로만 넣는다');
  assert.equal(it.attrSource, 'owner');
  assert.equal(it.photo.img, ''); assert.equal(it.photo.sourceUrl, ''); assert.equal(it.photo.checkedAt, ''); assert.equal(it.photo.sourceName.length, 80);
  assert.equal(it.product, null, '대체 이미지 상태의 product는 버린다');
  assert.equal(it.matchCandidates.length, W.MAX_CANDS); assert.ok(it.matchCandidates.every((c) => c.url === '' && c.evidence === 'owner' && c.note.length <= 200));
  assert.equal(it.look3d, null); assert.equal(it.model.length, 80);
  assert.equal(W.cleanWardrobe({ schema: 3, items: [] }), null, '모르는 스키마는 읽지 않는다');
  assert.equal(W.cleanWardrobe({ schema: 2, items: 'x' }), null);
});

test('draftItems: 확인할 초안 속성 목록을 돌려준다', () => {
  const w = W.migrate(v2);
  w.items[0] = W.setAttrSource(w.items[0], 'owner-confirmed');
  const used = [w.items[0].id, w.items[1].id, 'no-such'];
  assert.deepEqual(W.draftItems(w.items, used).map((i) => i.id), [w.items[1].id]);
  assert.equal(W.draftItems(w.items).length, 12);
});

test('look3d: 아는 종류만 받고, 원단 이름은 영문·숫자·하이픈만 남긴다', () => {
  const it = W.setLook3d(W.cleanItem({ cat: 'top', kind: 'shirt', name: 'x' }, 0), { kind: 'shirt', fabric: 'mine-stripe<script>' });
  assert.deepEqual(it.look3d, { kind: 'shirt', fabric: 'mine-stripescript' });
  assert.equal(W.setLook3d(it, { kind: 'pants' }).look3d, null);
  for (const k of ['sweat', 'cardigan']) assert.equal(W.setLook3d(it, { kind: k, fabric: '' }).look3d.kind, k, k + ' 형태(10-12 추가)');
  assert.equal(W.migrate(v2).items.filter((i) => i.look3d).length, 5, '예시 자료에는 3D 형태가 있는 옷이 5벌이다');
});
