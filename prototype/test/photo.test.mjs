import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPhotoRegions,
  normalizeRegion,
  readImageDimensions,
  analyzePhotos,
  cropImage,
  PHOTO_LIMITS,
} from '../src/photo.js';

function fixture(width = 100, height = 100, color = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(color, offset);
  return { data, width, height };
}
function paint(image, x, y, width, height, color) {
  for (let py = y; py < y + height; py++)
    for (let px = x; px < x + width; px++) image.data.set(color, (py * image.width + px) * 4);
}

test('finds two separate contrasting regions, preserves their own colors and source bounds', () => {
  const pixels = fixture();
  paint(pixels, 10, 20, 20, 40, [20, 70, 180, 255]);
  paint(pixels, 65, 25, 20, 35, [210, 30, 30, 255]);
  const result = detectPhotoRegions(pixels);
  assert.equal(result.mode, 'regions');
  assert.equal(result.regions.length, 2);
  assert.deepEqual(
    result.regions.map((region) => region.color),
    ['blue', 'red'],
  );
  assert.deepEqual(
    result.regions.map((region) => region.pixelCount),
    [800, 700],
  );
  for (const region of result.regions) {
    assert.ok(region.x >= 0 && region.y >= 0);
    assert.ok(region.x + region.width <= 1 && region.y + region.height <= 1);
  }
  assert.ok(result.regions[0].x <= 0.1 && result.regions[0].x + result.regions[0].width >= 0.3);
});

test('ignores isolated noise without inventing clothing in empty images', () => {
  const pixels = fixture();
  for (let n = 10; n < 90; n += 5) paint(pixels, n, n, 1, 1, [0, 0, 0, 255]);
  const noisy = detectPhotoRegions(pixels);
  assert.equal(noisy.mode, 'whole-image');
  assert.equal(noisy.regions.length, 1);
  assert.equal(noisy.regions[0].width, 1);
  const empty = detectPhotoRegions(fixture());
  assert.equal(empty.mode, 'whole-image');
  assert.equal(empty.regions[0].color, 'white');
});

test('uneven edge background yields an explicit fallback instead of arbitrary clothing claims', () => {
  const pixels = fixture();
  paint(pixels, 0, 0, 50, 100, [20, 30, 80, 255]);
  const result = detectPhotoRegions(pixels);
  assert.equal(result.mode, 'whole-image');
  assert.equal(result.backgroundReliable, false);
  assert.match(result.reason, /배경이 고르지/);
});

test('touching regions remain one component and transparent pixels composite to white', () => {
  const pixels = fixture(100, 100, [0, 0, 0, 0]);
  paint(pixels, 20, 20, 20, 30, [15, 70, 170, 255]);
  paint(pixels, 40, 20, 20, 30, [200, 25, 25, 255]);
  const result = detectPhotoRegions(pixels);
  assert.equal(result.mode, 'regions');
  assert.equal(result.regions.length, 1);
  assert.equal(result.regions[0].pixelCount, 1200);
});

test('more than the maximum useful components requires manual review', () => {
  const pixels = fixture(120, 120);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      paint(pixels, 10 + col * 35, 10 + row * 35, 15, 15, [50, 80, 150, 255]);
  const result = detectPhotoRegions(pixels);
  assert.equal(result.mode, 'whole-image');
  assert.match(result.reason, /너무 많아/);
});

test('rejects malformed pixel data and analysis settings', () => {
  assert.throws(() => detectPhotoRegions({ data: new Uint8Array(8), width: 2, height: 2 }));
  assert.throws(() => detectPhotoRegions(fixture(), { threshold: NaN }));
  assert.throws(() => detectPhotoRegions(fixture(), { minAreaRatio: 0 }));
});

test('manual regions clip to image bounds and reject empty/non-finite intersections', () => {
  assert.deepEqual(normalizeRegion({ x: -0.1, y: 0.2, width: 0.6, height: 2 }), {
    x: 0,
    y: 0.2,
    width: 0.5,
    height: 0.8,
  });
  assert.throws(() => normalizeRegion({ x: 1.2, y: 0, width: 0.3, height: 1 }));
  assert.throws(() => normalizeRegion({ x: 0, y: 0, width: 0, height: 1 }));
  assert.throws(() => normalizeRegion({ x: NaN, y: 0, width: 1, height: 1 }));
});

function pngHeader(width, height) {
  const buffer = new Uint8Array(24);
  buffer.set([137, 80, 78, 71, 13, 10, 26, 10]);
  buffer.set([73, 72, 68, 82], 12);
  const view = new DataView(buffer.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return buffer;
}

test('reads JPEG/PNG dimensions before decoding and rejects excessive or unsupported images', () => {
  assert.deepEqual(readImageDimensions(pngHeader(640, 480)), {
    width: 640,
    height: 480,
    type: 'image/png',
  });
  const jpeg = Uint8Array.from([
    255, 216, 255, 192, 0, 11, 8, 1, 224, 2, 128, 1, 1, 17, 0, 255, 217,
  ]);
  assert.deepEqual(readImageDimensions(jpeg), { width: 640, height: 480, type: 'image/jpeg' });
  assert.throws(() => readImageDimensions(pngHeader(10_000, 10_000)), /해상도/);
  assert.throws(() => readImageDimensions(new TextEncoder().encode('<svg/>')), /지원/);
  assert.throws(() => readImageDimensions(jpeg.subarray(0, 8)));
});

test('file errors do not stop subsequent files and file count is bounded', async () => {
  const calls = [];
  const files = Array.from({ length: 14 }, (_, index) => ({
    name: `bad-${index}.jpg`,
    size: index === 0 ? PHOTO_LIMITS.bytes + 1 : 12,
    async arrayBuffer() {
      return new Uint8Array([1, 2, 3]).buffer;
    },
  }));
  const result = await analyzePhotos(files, { onProgress: (state) => calls.push(state) });
  assert.equal(result.drafts.length, 0);
  assert.equal(result.errors.length, 14);
  assert.equal(calls.filter((state) => state.status === 'error').length, 12);
  assert.equal(calls.at(-1).completed, 12);
});

test('already-cancelled analysis does not read files or erase earlier UI state', async () => {
  const controller = new AbortController();
  controller.abort();
  const file = {
    name: 'untouched.jpg',
    size: 10,
    arrayBuffer() {
      assert.fail('must not read cancelled files');
    },
  };
  const result = await analyzePhotos([file], { signal: controller.signal });
  assert.equal(result.drafts.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /취소/);
});

test('cancellation from the progress callback prevents the next file read', async () => {
  const controller = new AbortController();
  const file = {
    name: 'cancel-before-read.jpg',
    size: 10,
    arrayBuffer() {
      assert.fail('must not read cancelled files');
    },
  };
  const result = await analyzePhotos([file], {
    signal: controller.signal,
    onProgress: () => controller.abort(),
  });
  assert.equal(result.drafts.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /취소/);
});

test('manual crop never accepts remote URLs or active inline SVG', async () => {
  await assert.rejects(
    cropImage('https://example.com/private.jpg', { x: 0, y: 0, width: 1, height: 1 }),
    /로컬/,
  );
  await assert.rejects(
    cropImage('data:image/svg+xml;base64,PHN2Zy8+', { x: 0, y: 0, width: 1, height: 1 }),
    /로컬/,
  );
});
