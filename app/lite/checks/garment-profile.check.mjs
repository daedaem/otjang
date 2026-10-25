import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProfile, profileFromForm, profileFacts, profileFactLines, confirmEstimate,
  measureFieldsFor, garmentCategory, parseMeasureInput, PROFILE_VERSION,
} from '../src/domain/garment-profile.js';

const shirt = { kind: 'shirt' };
const jeans = { kind: 'jeans' };

test('measurement fields follow the garment category, catalog slot or owned kind', () => {
  assert.deepEqual(measureFieldsFor(shirt), ['length', 'shoulder', 'chest', 'sleeve']);
  assert.deepEqual(measureFieldsFor({ slot: 'm-oxford' }), ['length', 'shoulder', 'chest', 'sleeve']);
  assert.deepEqual(measureFieldsFor(jeans), ['length', 'waist', 'thigh', 'hem', 'rise']);
  assert.deepEqual(measureFieldsFor({ kind: 'skirt' }), ['length', 'waist', 'hem']);
  assert.deepEqual(measureFieldsFor({ kind: 'sneaker' }), []);
  assert.equal(garmentCategory({ kind: 'blazer' }), 'outer');
  assert.equal(garmentCategory({}), null);
});

test('a valid profile is normalized; missing keys stay unknown and nothing is filled in', () => {
  const p = validateProfile({
    v: 1,
    measures: { length: { cm: 72.04, source: 'measured' }, chest: { cm: 55, source: 'seller' } },
    silhouette: { value: 'regular', source: 'chosen' },
    fabric: { value: '  옥스퍼드  ', source: 'seller' },
    pattern: { value: 'stripe', note: '1cm 간격', source: 'chosen' },
    details: [{ text: '셀비지', source: 'chosen' }, { text: '버튼다운', source: 'ai' }],
    purpose: 'collect', series: 'LVC 501', reference: false,
  }, shirt);
  assert.equal(p.measures.length.cm, 72);
  assert.equal(p.fabric.value, '옥스퍼드');
  assert.equal(p.reference, undefined);
  assert.equal(p.thickness, undefined);
  assert.deepEqual(validateProfile({ v: 1 }, shirt), { v: PROFILE_VERSION });
});

test('invalid or foreign values are refused instead of silently dropped', () => {
  const bad = [
    [{ v: 2 }, /새 버전/],
    [{ v: 1, extra: 1 }, /원본을 보존/],
    [{ v: 1, measures: { thigh: { cm: 30, source: 'measured' } } }, /쓰지 않아요/],
    [{ v: 1, measures: { length: { cm: 0, source: 'measured' } } }, /1~200cm/],
    [{ v: 1, measures: { length: { cm: 70, source: 'ai' } } }, /출처/],
    [{ v: 1, measures: { length: { cm: 70 } } }, /출처/],
    [{ v: 1, silhouette: { value: 'baggy', source: 'chosen' } }, /다시 골라/],
    [{ v: 1, details: [{ text: '셀비지', source: 'chosen' }, { text: '셀 비지', source: 'chosen' }] }, /두 번/],
    [{ v: 1, fabric: { value: 'x'.repeat(41), source: 'chosen' } }, /40자/],
    [{ v: 1, purpose: 'sell' }, /목적/],
  ];
  for (const [profile, message] of bad) assert.throws(() => validateProfile(profile, shirt), message, JSON.stringify(profile));
});

test('form input: empty stays unknown, unreadable numbers are reported, cm text is read', () => {
  assert.equal(parseMeasureInput('72cm'), 72);
  assert.equal(parseMeasureInput('72,5'), 72.5);
  assert.equal(parseMeasureInput('약 72'), null);
  const ok = profileFromForm({ measures: { length: '74', chest: '', waist: '' }, fabric: '데님', details: ['셀비지', '셀비지 '] }, jeans);
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.profile.measures, { length: { cm: 74, source: 'measured' } });
  assert.equal(ok.profile.details.length, 1);
  const bad = profileFromForm({ measures: { length: '칠십' } }, jeans);
  assert.equal(bad.profile, null);
  assert.match(bad.problems[0], /총장/);
});

test('facts carry their source; AI estimates are labelled until confirmed; unknowns are listed', () => {
  const p = validateProfile({ v: 1, measures: { length: { cm: 72, source: 'measured' } }, thickness: { value: 'mid', source: 'ai' } }, shirt);
  const { facts, unknown } = profileFacts(p, shirt);
  assert.equal(facts.find((f) => f.key === 'thickness').confirmed, false);
  assert.ok(unknown.includes('어깨') && unknown.includes('소재'));
  assert.ok(profileFactLines(p, shirt).some((l) => l === '두께 보통 (AI 추정 · 확인 전)'));
  const confirmed = confirmEstimate(p, 'thickness');
  assert.equal(confirmed.thickness.source, 'chosen');
  assert.equal(p.thickness.source, 'ai');
});
