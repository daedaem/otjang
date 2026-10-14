import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GARMENT_PHOTO_BYTES } from '../src/wardrobe-store.js';
import { MAX_ZIP_BACKUP_BYTES, zipStore, unzipSingle } from '../src/zip-store.js';

function trackReads(blob, reads = { sizes: [], active: 0, peak: 0, slices: 0 }, root = true) {
  const slice = blob.slice.bind(blob);
  blob.slice = (start, end, type) => {
    reads.slices++;
    return trackReads(slice(start, end, type), reads, false);
  };
  blob.arrayBuffer = async () => {
    assert.equal(root, false, 'the complete input Blob must remain intact');
    assert.ok(blob.size <= MAX_GARMENT_PHOTO_BYTES, `read ${blob.size} bytes at once`);
    reads.sizes.push(blob.size);
    reads.active++;
    reads.peak = Math.max(reads.peak, reads.active);
    try {
      await Promise.resolve();
      return await Blob.prototype.arrayBuffer.call(blob);
    } finally {
      reads.active--;
    }
  };
  return blob;
}

test('a maximum 200-photo payload is wrapped and checked with sequential reads of at most 800 KB', async () => {
  const photo = new Blob([new Uint8Array(MAX_GARMENT_PHOTO_BYTES).fill(71)]);
  const payload = new Blob([...Array(200).fill(photo), new Uint8Array(1000012).fill(19)]);
  assert.equal(payload.size, MAX_ZIP_BACKUP_BYTES);
  const writing = { sizes: [], active: 0, peak: 0, slices: 0 };
  const archive = await zipStore('옷장.eoul', trackReads(payload, writing));
  assert.equal(writing.peak, 1);
  assert.equal(writing.sizes.length, Math.ceil(payload.size / MAX_GARMENT_PHOTO_BYTES));
  const reading = { sizes: [], active: 0, peak: 0, slices: 0 };
  const unwrapped = await unzipSingle(trackReads(archive, reading));
  assert.equal(unwrapped.name, '옷장.eoul');
  assert.equal(unwrapped.blob.size, payload.size);
  assert.equal(reading.peak, 1);
  assert.ok(reading.sizes.filter((size) => size === MAX_GARMENT_PHOTO_BYTES).length >= 200);
  assert.deepEqual(new Uint8Array(await unwrapped.blob.slice(0, 8).arrayBuffer()), new Uint8Array(8).fill(71));
  assert.deepEqual(new Uint8Array(await unwrapped.blob.slice(-8).arrayBuffer()), new Uint8Array(8).fill(19));
});

test('ZIP size limits give an explicit refusal before reading oversized input or payload', async () => {
  const payload = new Blob(['original diagnostic bytes']);
  Object.defineProperty(payload, 'size', { value: MAX_ZIP_BACKUP_BYTES + 1 });
  const writing = { sizes: [], active: 0, peak: 0, slices: 0 };
  await assert.rejects(
    zipStore('diagnostic.eoul', trackReads(payload, writing)),
    /지원 용량.*원본은 변경하지 않았습니다/,
  );
  assert.equal(writing.slices, 0);
  assert.equal(await Blob.prototype.text.call(payload), 'original diagnostic bytes');

  const archive = await zipStore('backup.eoul', new Blob(['valid data']));
  Object.defineProperty(archive, 'size', { value: MAX_ZIP_BACKUP_BYTES + 98 + 2 * 65535 + 1 });
  const reading = { sizes: [], active: 0, peak: 0, slices: 0 };
  await assert.rejects(unzipSingle(trackReads(archive, reading)), /지원 용량/);
  assert.equal(reading.slices, 0);

  const forged = new Uint8Array(await (await zipStore('backup.eoul', new Blob(['valid data']))).arrayBuffer());
  new DataView(forged.buffer).setUint32(18, MAX_ZIP_BACKUP_BYTES + 1, true);
  const forgedReads = { sizes: [], active: 0, peak: 0, slices: 0 };
  await assert.rejects(unzipSingle(trackReads(new Blob([forged]), forgedReads)), /지원 용량/);
  assert.deepEqual(forgedReads.sizes, [30], 'declared oversized payload is refused after its fixed header');
});

test('single-file ZIP rejects extra files, trailing bytes, invalid offsets and inconsistent headers', async () => {
  const archive = await zipStore('backup.eoul', new Blob(['payload to preserve']));
  const original = new Uint8Array(await archive.arrayBuffer());
  const head = new DataView(original.buffer);
  const central = 30 + head.getUint16(26, true) + head.getUint32(18, true);
  const end = original.length - 22;
  const cases = [
    ['encrypted local entry', (v) => v.setUint16(6, 0x0801, true)],
    ['data descriptor', (v) => v.setUint16(6, 0x0808, true)],
    ['compression', (v) => v.setUint16(8, 8, true)],
    ['local extra section', (v) => v.setUint16(28, 1, true)],
    ['different uncompressed size', (v) => v.setUint32(22, 1, true)],
    ['second file count', (v) => v.setUint16(end + 10, 2, true)],
    ['other disk', (v) => v.setUint16(end + 4, 1, true)],
    ['wrong central offset', (v) => v.setUint32(end + 16, central + 1, true)],
    ['wrong directory size', (v) => v.setUint32(end + 12, 1, true)],
    ['end comment', (v) => v.setUint16(end + 20, 1, true)],
    ['central extra section', (v) => v.setUint16(central + 30, 1, true)],
    ['central second file pointer', (v) => v.setUint32(central + 42, 1, true)],
    ['central CRC mismatch', (v) => v.setUint32(central + 16, 1, true)],
    ['different central filename', (v) => v.setUint8(central + 46, 65)],
    ['corrupt contents', (v) => v.setUint8(30 + head.getUint16(26, true), 0)],
  ];
  for (const [label, mutate] of cases) {
    const changed = original.slice();
    mutate(new DataView(changed.buffer));
    assert.equal(await unzipSingle(new Blob([changed])), null, label);
  }
  assert.equal(await unzipSingle(new Blob([archive, archive])), null, 'two complete ZIP files');
  assert.equal(await unzipSingle(new Blob([archive, new Uint8Array([0])])), null, 'trailing bytes');
  assert.equal(await unzipSingle(archive.slice(0, archive.size - 1)), null, 'truncated directory');
  const restored = await unzipSingle(archive);
  assert.equal(await restored.blob.text(), 'payload to preserve');
  assert.deepEqual(
    new Uint8Array(await archive.arrayBuffer()),
    original,
    'all rejected copies leave the original intact',
  );
});

test('small plain backups pass through and ZIP file-name bounds are checked before payload reads', async () => {
  assert.equal(await unzipSingle(new Blob(['not a ZIP'])), null);
  const empty = await unzipSingle(await zipStore('a', new Blob([])));
  assert.equal(empty.name, 'a');
  assert.equal(empty.blob.size, 0);
  const payload = trackReads(new Blob(['source']));
  await assert.rejects(zipStore('', payload), /이름/);
  await assert.rejects(zipStore('가'.repeat(22000), payload), /이름/);
});
