import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outfitCopy } from '../src/outfit-copy.js';
import { SLOT_BY_ID } from '../src/data/slots.js';

test('copy follows substituted garments instead of the original recipe', () => {
  const result = { look: { title: '네이비 재킷 출근', note: '흰 셔츠와 생지 데님' }, items: [
    { role: 'top', slot: SLOT_BY_ID['m-knit'], color: 'grey', owned: true, item: { kind: 'knit' } },
    { role: 'bottom', slot: SLOT_BY_ID['m-denim'], color: 'blue', owned: true, item: { kind: 'jeans' } },
  ] };
  const before = structuredClone(result);
  const copy = outfitCopy(result);
  assert.equal(copy.title, '니트 · 청바지');
  assert.match(copy.note, /그레이 니트/);
  assert.match(copy.note, /블루 청바지/);
  assert.doesNotMatch(`${copy.title} ${copy.note}`, /흰 셔츠|네이비|생지|재킷|출근/);
  assert.deepEqual(result, before, 'display copy cannot mutate the recipe or owned data');
});

test('unknown colours and subtypes are not invented for the copy', () => {
  const result = { look: { title: '흰 옥스퍼드 출근', note: '겨울' }, items: [
    { role: 'top', slot: SLOT_BY_ID['m-oxford'], color: null, owned: true, certainty: 'uncertain', item: { kind: 'shirt' } },
  ] };
  const copy = outfitCopy(result);
  assert.equal(copy.title, '셔츠');
  assert.equal(copy.note, '내 셔츠(종류 확인 필요) 조합이에요.');
  assert.doesNotMatch(copy.note, /흰|옥스퍼드|겨울/);
});

test('composition distinguishes actual, example and candidate clothes without inventing an uncertain colour', () => {
  const result = { look: { title: '흰 셔츠 출근', note: '흰 셔츠와 생지' }, items: [
    { role: 'top', slot: SLOT_BY_ID['m-oxford'], color: 'white', owned: true, certainty: 'uncertain', item: { kind: 'shirt', label: '직접 이름 붙인 셔츠' } },
    { role: 'bottom', slot: SLOT_BY_ID['m-denim'], color: 'blue', owned: false },
  ] };
  const before = structuredClone(result);
  assert.match(outfitCopy(result).note, /내 직접 이름 붙인 셔츠\(종류 확인 필요\)/);
  assert.match(outfitCopy(result).note, /후보 라이트 블루 청바지/);
  assert.match(outfitCopy(result, { demo: true }).note, /예시 직접 이름 붙인 셔츠/);
  assert.doesNotMatch(outfitCopy(result).note, /화이트|옥스퍼드|흰 셔츠/);
  assert.deepEqual(result, before);
});
