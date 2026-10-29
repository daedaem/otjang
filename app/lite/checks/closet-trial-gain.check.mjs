// 옷장 재설계(2026-10-29 대표 결정): 체험용 옷마다 "사면 내 옷으로 새 코디가 몇 개 생기는지"를 보여 준다.
// 코디 = 상의+하의+신발(원피스+신발), 겉옷은 따로 "걸칠 수 있는 코디"로 센다.
// 내 옷과 같은 종류·색인 체험용 옷으로 생기는 조합은 새 코디로 세지 않는다(대표 선택 "세지 않기").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMock } from '../src/core.mjs';

function closet() {
  const M = createMock({ photos: false });
  M.addGarment({ kind: 'knit', slot: 'm-knit', color: 'navy', label: '내 니트', gender: 'M' });
  M.addGarment({ kind: 'jeans', slot: 'm-denim', color: 'indigo', label: '내 데님', gender: 'M' });
  M.addGarment({ kind: 'sneaker', slot: 'm-white-sneaker', color: 'white', label: '내 스니커즈', gender: 'M' });
  M.loadTrialCloset('M');
  const by = (label) => M.getState().closet.find((g) => g.trial && g.label === label);
  return { M, by };
}

test('내 옷과 같은 종류·색인 체험용 옷은 "비슷"이고 새 코디로 세지 않는다', () => {
  const { M, by } = closet();
  for (const g of M.getState().closet.filter((x) => !x.trial)) assert.ok(g.kind, 'owned kind');
  const knit = by('네이비 크루넥 니트');
  const r = M.trialGain([knit.id]);
  assert.equal(r.ownedCount, 3);
  assert.equal(r.before, 1);
  assert.equal(r.newOutfits, 0);
  assert.equal(r.items[0].verdict, 'similar');
  assert.equal(r.items[0].similarTo.label, '내 니트');
  assert.equal(r.items[0].text, '내 니트와 비슷');
  assert.equal(r.items[0].tone, 'dup');
});

test('겹치지 않는 체험용 옷은 내 옷으로 새로 생기는 코디 수를 준다', () => {
  const { M, by } = closet();
  const oxford = M.trialGain([by('흰 옥스퍼드 셔츠').id]).items[0];
  assert.equal(oxford.verdict, 'new');
  assert.equal(oxford.gain, 1);
  assert.equal(oxford.text, '새 코디 +1');
  assert.equal(oxford.tone, 'good');
  const loafer = M.trialGain([by('브라운 로퍼').id]).items[0];
  assert.equal(loafer.gain, 1);
});

test('겉옷은 따로 "걸칠 수 있는 코디"로 센다', () => {
  const { M, by } = closet();
  const blazer = M.trialGain([by('네이비 블레이저').id]).items[0];
  assert.equal(blazer.verdict, 'outer');
  assert.equal(blazer.gain, 0);
  assert.equal(blazer.layerable, 1);
  assert.equal(blazer.text, '걸칠 수 있는 코디 +1');
});

test('여러 벌을 함께 사면: 비슷한 옷은 빼고 나머지로 새 코디를 센다', () => {
  const { M, by } = closet();
  const pair = M.trialGain([by('네이비 크루넥 니트').id, by('베이지 치노 팬츠').id]);
  assert.equal(pair.newOutfits, 1);
  assert.deepEqual(pair.items.map((x) => x.verdict), ['similar', 'new']);
  const two = M.trialGain([by('흰 옥스퍼드 셔츠').id, by('베이지 치노 팬츠').id]);
  // (내 니트·옥스퍼드) × (내 데님·치노) × 내 스니커즈 = 4, 원래 1 → +3
  assert.equal(two.newOutfits, 3);
});

test('내 옷이 없으면 숫자를 지어내지 않고 비교할 내 옷이 없다고 알린다', () => {
  const M = createMock({ photos: false });
  M.loadTrialCloset('M');
  const t = M.getState().closet.find((g) => g.label === '흰 옥스퍼드 셔츠');
  const r = M.trialGain([t.id]);
  assert.equal(r.ownedCount, 0);
  assert.equal(r.items[0].verdict, 'no_closet');
  assert.equal(r.items[0].text, '');
  // 내 옷이 없어도 고른 체험용 옷끼리 갖춰지면 그 조합을 센다.
  const all = M.getState().closet.filter((g) => ['흰 옥스퍼드 셔츠', '베이지 치노 팬츠', '브라운 로퍼'].includes(g.label)).map((g) => g.id);
  assert.equal(M.trialGain(all).newOutfits, 1);
});

test('내 옷·없는 id는 무시하고 옷장을 바꾸지 않는다', () => {
  const { M, by } = closet();
  const before = JSON.stringify(M.getState().closet);
  const mine = M.getState().closet.find((g) => !g.trial);
  const r = M.trialGain([mine.id, 'nope', by('흰 무지 티셔츠').id]);
  assert.deepEqual(r.items.map((x) => x.label), ['흰 무지 티셔츠']);
  assert.equal(JSON.stringify(M.getState().closet), before);
});

test('옷장 칸에는 배경을 지운 투명 예시 사진을 쓴다', () => {
  const { M } = closet();
  for (const g of M.getState().closet.filter((x) => x.trial)) {
    assert.match(g.photo.cut, /^examples\/cut\/[a-z-]+\.webp$/, g.label);
    assert.equal(g.photo.cut.replace('cut/', ''), g.photo.src);
    const bytes = readFileSync(new URL(`../public/${g.photo.cut}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    // VP8X 확장 형식의 알파 플래그(0x10)가 켜져 있어야 투명하다.
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8X');
    assert.ok(bytes[20] & 0x10, `${g.label} has alpha`);
  }
});

// Codex 검토(#145): 한 종류에 8벌이 넘어도 빠짐없이 센다(미리보기 도우미의 종류별 8벌 제한을 쓰지 않음).
test('한 종류에 옷이 많아도 새 체험용 옷의 코디를 빠짐없이 센다', () => {
  const M = createMock({ photos: false });
  const tops = [['m-tee', 'black'], ['m-tee', 'grey'], ['m-tee', 'navy'], ['m-knit', 'grey'], ['m-knit', 'beige'], ['m-polo', 'navy'], ['m-sweat', 'grey'], ['m-hoodie', 'black'], ['m-longtee', 'white']];
  for (const [slot, color] of tops) M.addGarment({ kind: slot === 'm-knit' ? 'knit' : slot === 'm-polo' || slot === 'm-rugby' ? 'polo' : slot === 'm-sweat' || slot === 'm-hoodie' ? 'sweat' : slot === 'm-longtee' ? 'longtee' : 'tee', slot, color, gender: 'M' });
  M.addGarment({ kind: 'jeans', slot: 'm-denim', color: 'indigo', gender: 'M' });
  M.addGarment({ kind: 'sneaker', slot: 'm-white-sneaker', color: 'white', gender: 'M' });
  M.loadTrialCloset('M');
  const oxford = M.getState().closet.find((g) => g.trial && g.label === '흰 옥스퍼드 셔츠');
  const r = M.trialGain([oxford.id]);
  assert.equal(r.before, 9);
  assert.equal(r.items[0].gain, 1);
  assert.equal(r.newOutfits, 1);
});

// Codex 검토(#145): 원피스+신발도 코디로 센다.
test('원피스와 신발 조합도 코디로 센다', () => {
  const M = createMock({ photos: false });
  M.addGarment({ kind: 'dress', slot: 'f-dress', color: 'black', label: '내 원피스', gender: 'F' });
  M.addGarment({ kind: 'loafer', slot: 'f-loafer', color: 'brown', label: '내 로퍼', gender: 'F' });
  M.loadTrialCloset('F');
  const sneaker = M.getState().closet.find((g) => g.trial && g.label === '흰 스니커즈');
  const r = M.trialGain([sneaker.id]);
  assert.equal(r.before, 1);
  assert.equal(r.items[0].gain, 1);
  const trench = M.getState().closet.find((g) => g.trial && g.label === '베이지 트렌치 코트');
  assert.equal(M.trialGain([trench.id]).items[0].layerable, 1);
});
