import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relatedReturnRecords } from '../src/related-returns.js';

const candidate = { brand: '검증 브랜드', kind: 'shirt', productId: 'new', url: 'https://shop.example/new' };
const old = (id, changes = {}) => ({ id, candidate: { brand: '나중에 정정한 브랜드' }, history: [{
  action: 'returned', at: '2026-10-18T10:00:00.000Z', details: {
    candidate: { ...candidate, productId: id, url: `https://shop.example/${id}`, name: '과거 셔츠', ...changes },
    option: 'M', feedback: { fit: 'small', returnReason: 'size' },
  },
}] });

test('related returns use return-time brand, kind, option and feedback without changing any record', () => {
  const journeys = [old('old')], before = structuredClone(journeys);
  const rows = relatedReturnRecords(journeys, candidate);
  assert.deepEqual(rows.map((r) => [r.journeyId, r.option, r.fit, r.returnReason]), [['old', 'M', 'small', 'size']]);
  assert.deepEqual(journeys, before);
});
test('same product, own journey, other brand/kind and unknown brand are not related-product warnings', () => {
  const journeys = [old('own'), old('other-brand', { brand: '다른 브랜드' }), old('other-kind', { kind: 'knit' }), old('same', { productId: 'new' })];
  assert.deepEqual(relatedReturnRecords(journeys, candidate, 'own'), []);
  assert.deepEqual(relatedReturnRecords([old('unknown', { brand: '' })], { ...candidate, brand: '' }), []);
});
test('a legacy return without a snapshot does not borrow the current product or feedback', () => {
  const journey = old('old'); journey.history[0].details = null;
  assert.deepEqual(relatedReturnRecords([journey], candidate), []);
});
test('the latest three related returns are shown and missing feedback remains unknown', () => {
  const journeys = [1, 2, 3, 4].map((day) => { const j = old(`old-${day}`); j.history[0].at = `2026-10-0${day}T00:00:00.000Z`; j.history[0].details.feedback = {}; return j; });
  const rows = relatedReturnRecords(journeys, candidate);
  assert.deepEqual(rows.map((r) => r.journeyId), ['old-4', 'old-3', 'old-2']);
  assert.equal(rows[0].fit, null);
});
