import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepMainSubject } from '../src/mask-cleanup.js';

const S = 40;
function paint(mask, x0, y0, x1, y1, value = 255) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * S + x] = value;
  return mask;
}
const on = (mask, x, y) => mask[y * S + x];

test('a small separate region (another object) is removed; the garment and its soft edge stay', () => {
  const mask = paint(new Uint8Array(S * S), 5, 5, 25, 30);
  paint(mask, 25, 5, 27, 30, 90); // soft edge just outside the solid region
  paint(mask, 32, 32, 37, 37); // a box in the corner, 25 px vs 500 px
  const out = keepMainSubject(mask, S);
  assert.equal(on(out, 10, 10), 255);
  assert.equal(on(out, 26, 10), 90, 'soft edge next to the garment is kept');
  assert.equal(on(out, 34, 34), 0, 'the separate small object is removed');
  assert.deepEqual(keepMainSubject(out, S), out, 'cleaning twice changes nothing');
});

test('two large parts of one garment are both kept, and a single region is returned unchanged', () => {
  const twoParts = paint(paint(new Uint8Array(S * S), 2, 2, 18, 38), 22, 2, 36, 38);
  const out = keepMainSubject(twoParts, S);
  assert.equal(on(out, 10, 10), 255);
  assert.equal(on(out, 30, 10), 255, 'a region at least 30% of the largest stays');
  const single = paint(new Uint8Array(S * S), 5, 5, 30, 30);
  assert.deepEqual(keepMainSubject(single, S), single);
  assert.throws(() => keepMainSubject(new Uint8Array(10), S), /크기/);
});
