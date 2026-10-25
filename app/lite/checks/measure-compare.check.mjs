import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMeasures, closestSize, flatSketch, overlaySketches, NOTE } from '../src/domain/measure-compare.js';
import { parseSizeChart, sizeChartOptions } from '../src/domain/size-chart.js';

const shirt = { kind: 'shirt' };
const jeans = { kind: 'jeans' };
const myShirt = { length: { cm: 72, source: 'measured' }, shoulder: { cm: 47, source: 'measured' }, chest: { cm: 55, source: 'measured' }, sleeve: { cm: 62, source: 'measured' } };

test('comparison states each difference and a short sentence, and is never a fit promise', () => {
  const r = compareMeasures({ length: 75, shoulder: 47.5, chest: 57, sleeve: 62 }, myShirt, shirt);
  assert.equal(r.factLine, '총장 +3cm · 어깨 같음 · 가슴단면 +2cm · 소매 같음');
  assert.equal(r.sentence, '내 기준 옷보다 조금 길고 조금 여유 있어요.');
  assert.equal(r.note, NOTE);
  assert.equal(compareMeasures({ length: 66, chest: 50 }, myShirt, shirt).sentence, '내 기준 옷보다 짧고 타이트해요.');
  assert.equal(compareMeasures({ length: 72.5 }, myShirt, shirt).sentence, '내 기준 옷과 실측이 거의 같아요.');
});

test('no shared measurement means no comparison, not a guess', () => {
  const r = compareMeasures({ length: 70 }, { chest: { cm: 55, source: 'measured' } }, shirt);
  assert.equal(r.shared, 0);
  assert.equal(r.sentence, null);
  assert.match(r.reason, /비교하지 못했어요/);
});

test('closest size needs two shared measurements and refuses to pick between ties', () => {
  const options = [
    { label: 'S', measures: { length: 69, chest: 52 } },
    { label: 'M', measures: { length: 72, chest: 55 } },
    { label: 'L', measures: { length: 75, chest: 58 } },
  ];
  assert.equal(closestSize(options, myShirt, shirt).best, 'M');
  assert.equal(closestSize([{ label: 'M', measures: { length: 72 } }], myShirt, shirt).best, null);
  const tie = closestSize([{ label: 'S', measures: { length: 70, chest: 55 } }, { label: 'M', measures: { length: 74, chest: 55 } }], myShirt, shirt);
  assert.equal(tie.best, null);
  assert.match(tie.reason, /S·M/);
});

test('flat sketches are drawn to the stated centimetres; conventions are listed', () => {
  const top = flatSketch(shirt, myShirt);
  assert.equal(top.bounds.maxY, 72);
  assert.ok(top.bounds.maxX >= 55 / 2);
  assert.deepEqual(top.assumed, []);
  assert.match(top.path, /^M .* Q 0 .* Z$/);
  const noSleeve = flatSketch(shirt, { length: 70, chest: 55 });
  assert.deepEqual(noSleeve.assumed, ['어깨', '소매']);
  const pants = flatSketch(jeans, { length: 102, waist: 40, thigh: 31, hem: 20, rise: 28 });
  assert.equal(pants.bounds.maxY, 102);
  assert.equal(pants.bounds.minX, -(31 * 0.8));
  assert.equal(flatSketch(jeans, { length: 102 }), null);
  assert.equal(flatSketch({ kind: 'sneaker' }, { length: 10 }), null);
  const skirt = flatSketch({ kind: 'skirt' }, { length: 60, waist: 34, hem: 50 });
  assert.equal(skirt.type, 'skirt');
  const both = overlaySketches(shirt, { length: 76, chest: 58, shoulder: 49, sleeve: 63 }, myShirt);
  assert.equal(both.viewBox.split(' ').length, 4);
  assert.ok(both.candidate.bounds.maxY > both.reference.bounds.maxY);
});

test('size chart: rows with a header, columns, one-size-per-line, units and circumference', () => {
  const rows = parseSizeChart('사이즈\t총장\t어깨너비\t가슴 단면\t소매길이\nS\t70\t45\t52\t60\nM\t72\t47\t55\t61\nL\t74\t49\t58\t62');
  assert.deepEqual(rows.sizes.map((s) => s.label), ['S', 'M', 'L']);
  assert.deepEqual(rows.sizes[1].measures, { length: 72, shoulder: 47, chest: 55, sleeve: 61 });
  const cols = parseSizeChart('구분 S M L\n총장 70 72 74\n가슴단면 52 55 58\n화장 80 82 84');
  assert.deepEqual(cols.sizes[2].measures, { length: 74, chest: 58 });
  assert.deepEqual(cols.ignored, ['화장']);
  const pairs = parseSizeChart('M 총장 72 어깨 47 가슴 55\nL 총장 74 어깨 49 가슴 58');
  assert.equal(pairs.sizes[1].measures.shoulder, 49);
  const circ = parseSizeChart('사이즈 | 허리둘레 | 총장\n30 | 80 | 102');
  assert.equal(circ.sizes[0].measures.waist, 40);
  assert.ok(circ.warnings.some((w) => /둘레/.test(w)));
  const inch = parseSizeChart('Size Length(inch) Chest(inch)\nM 28 21');
  assert.equal(inch.sizes[0].measures.length, 71.1);
  assert.ok(inch.warnings.some((w) => /인치/.test(w)));
  const short = parseSizeChart('구분 S M L\n총장 70 72 74\n가슴단면 52 55');
  assert.deepEqual(short.sizes[1].measures, { length: 72 });
  assert.ok(short.warnings.some((w) => /가슴단면 줄의 숫자 개수/.test(w)));
  const mixed = parseSizeChart('Size Length(inch) Chest(cm)\nM 28 55');
  assert.deepEqual(mixed.sizes[0].measures, { length: 71.1, chest: 55 });
  const unclear = parseSizeChart('Size Length(inch) Chest(cm) Sleeve\nM 28 55 24');
  assert.deepEqual(unclear.sizes[0].measures, { length: 71.1, chest: 55 });
  assert.ok(unclear.warnings.some((w) => /소매는 cm인지 인치인지/.test(w)));
  const none = parseSizeChart('정사이즈예요. 편하게 입기 좋아요.');
  assert.deepEqual(none.sizes, []);
  assert.match(none.warnings.at(-1), /직접 넣어/);
});

test('size chart options keep only this garment\'s measurements, sourced to the seller', () => {
  const parsed = parseSizeChart('사이즈 총장 허리단면 허벅지단면 밑단단면 밑위 가슴단면\n30 102 40 31 20 28 50');
  const { options, warnings } = sizeChartOptions(parsed, jeans);
  assert.deepEqual(Object.keys(options[0].measures), ['length', 'waist', 'thigh', 'hem', 'rise']);
  assert.equal(options[0].measures.length.source, 'seller');
  assert.ok(warnings.some((w) => /가슴단면/.test(w)));
});

test('conflicting repeated size-chart measurements are reported and omitted instead of overwritten', () => {
  const parsed = parseSizeChart('Size Length(cm) Length(inch) Chest(cm) Chest(inch) Shoulder(cm)\nM 72 28 55 21 47');
  assert.deepEqual(parsed.sizes[0].measures, { shoulder: 47 });
  assert.ok(parsed.warnings.some((w) => /M.*총장.*다르/.test(w)));
  assert.ok(parsed.warnings.some((w) => /M.*가슴단면.*다르/.test(w)));
  assert.deepEqual(sizeChartOptions(parsed, shirt).options[0].measures, { shoulder: { cm: 47, source: 'seller' } });
  const repeated = parseSizeChart('M 총장 72 총장 75 총장 72 어깨 47');
  assert.deepEqual(repeated.sizes[0].measures, { shoulder: 47 }, 'a later repetition must not reinstate a conflicted field');
  const same = parseSizeChart('Size Length(cm) Length(inch) Chest(cm)\nM 76.2 30 55');
  assert.deepEqual(same.sizes[0].measures, { length: 76.2, chest: 55 });
});

test('closest size refuses incomparable measurement coverage instead of rewarding missing measurements', () => {
  const options = [
    { label: 'S', measures: { length: 72, shoulder: 47 } },
    { label: 'M', measures: { length: 72, shoulder: 47, chest: 56, sleeve: 62 } },
  ];
  for (const variants of [options, [...options].reverse()]) {
    const result = closestSize(variants, myShirt, shirt);
    assert.equal(result.best, null);
    assert.match(result.reason, /항목.*달라/);
  }
  const differentPairs = closestSize([
    { label: 'S', measures: { length: 72, chest: 55 } },
    { label: 'M', measures: { shoulder: 47, sleeve: 62 } },
  ], myShirt, shirt);
  assert.equal(differentPairs.best, null);
  assert.match(differentPairs.reason, /항목.*달라/);
});
