import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { makeGarment, newWardrobeState } from '../../../app/lite/src/domain/wardrobe.js';
import { createWardrobeStore, photoAsset } from '../src/wardrobe-store.js';
import { dragCrop, normalizeCrop } from '../src/garment-photo.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-photo-crop-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, draft: () => draft, beginDraft, chooseGarmentPhoto, saveGarmentDraft, closeSheet, setPhotoAnalysisAllowed: (allowed) => { photoAnalysisAllowed = allowed; } };\n})();',
);

// The real bundled callbacks run against fake IndexedDB. The canvas double
// encodes the source rectangle it was asked to draw into the JPEG bytes, so a
// crop is observable in the stored photograph. It does not prove how a real
// browser renders, how a finger drag feels, or iPhone HEIC conversion.
async function boot({ indexedDB = new IDBFactory() } = {}) {
  const urls = new Map();
  let nextURL = 0;
  const draws = [];
  const control = { failEncodes: 0 };
  class TestURL extends URL {
    static createObjectURL(blob) { const id = `blob:photo-crop/${++nextURL}`; urls.set(id, blob); return id; }
    static revokeObjectURL(id) { urls.delete(id); }
  }
  class TestImage {
    naturalWidth = 800;
    naturalHeight = 1000;
    decode() {
      const blob = urls.get(this.src);
      return (/^image\/hei[cf]/.test(blob?.type || '') || /\.hei[cf]$/i.test(blob?.name || '')) && !blob.decodable ? Promise.reject(new Error('undecodable')) : Promise.resolve();
    }
  }
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, {
    innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; },
  }]));
  const listeners = new Map();
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob,
    Uint8Array, DataView, TextEncoder, TextDecoder, URL: TestURL,
    Image: TestImage, HTMLImageElement: TestImage,
    fetch: async (url) => ({ blob: async () => urls.get(url) }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      querySelector: () => null, querySelectorAll: () => [],
      body: { style: {}, append() {} },
      createElement(tag) {
        if (tag !== 'canvas') return { click() {}, remove() {} };
        let rect = null;
        return {
          width: 0, height: 0,
          getContext: () => ({ fillRect() {}, drawImage(image, sx, sy, sw, sh) { rect = [sx, sy, sw, sh]; draws.push(rect); } }),
          toBlob(callback) {
            if (control.failEncodes > 0) { control.failEncodes--; return callback(null); }
            callback(new Blob([new Uint8Array([255, 216, 255, ...new TextEncoder().encode(rect.join(','))])], { type: 'image/jpeg' }));
          },
        };
      },
    },
    window: { scrollTo() {} }, CSS: { escape: (value) => value },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  await context.testApp.ready;
  context.testApp.setPhotoAnalysisAllowed(false);
  return {
    app: context.testApp, nodes, urls, draws, control,
    sheet: () => nodes.get('sheet-root').innerHTML,
    state: () => JSON.parse(JSON.stringify(context.testApp.state())),
    async click(dataset) {
      for (const fn of listeners.get('click') || []) await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} });
    },
    input(id, value) { for (const fn of listeners.get('input') || []) fn({ target: { id, value, dataset: {} } }); },
    close() { context.testApp.store.close(); },
  };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const photo = (value = 1) => new Blob([new Uint8Array([255, 216, 255, value])], { type: 'image/jpeg' });
const text = async (blob) => new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(3));
async function stored(page) { const row = await page.app.store.read(); return { state: JSON.parse(JSON.stringify(row.state)), photos: row.photos }; }

test('crop math keeps the box inside the photo and treats the whole photo as no crop', () => {
  assert.equal(normalizeCrop({ x: 0, y: 0, w: 1, h: 1 }), null);
  assert.equal(normalizeCrop(null), null);
  assert.equal(normalizeCrop({ x: NaN, y: 0, w: 1, h: 1 }), null);
  const edge = normalizeCrop({ x: 0.95, y: 0.95, w: 0.5, h: 0.5 });
  assert.ok(edge.x + edge.w <= 1 + 1e-9 && edge.y + edge.h <= 1 + 1e-9, 'stays inside');
  assert.ok(edge.w >= 0.05 && edge.h >= 0.05, 'never collapses to nothing');
  assert.deepEqual(dragCrop({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 'move', 0.9, -0.9), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
  const shrink = dragCrop({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 'nw', 0.9, 0.9);
  assert.ok(Math.abs(shrink.w - 0.08) < 1e-9 && Math.abs(shrink.h - 0.08) < 1e-9, 'a corner cannot pass the opposite corner');
  assert.deepEqual(dragCrop({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, 'se', 1, 1), { x: 0.2, y: 0.2, w: 0.8, h: 0.8 });
});

test('a chosen photo can be cropped to one garment, re-adjusted and reset before it is saved', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(photo(1));
  const whole = page.app.draft().asset;
  assert.equal(await text(whole.blob), '0,0,800,1000', 'the first asset is the whole photo');
  assert.match(page.sheet(), /data-action="crop-start"[^>]*>옷만 자르기/);

  await page.click({ action: 'crop-start' });
  assert.deepEqual(plain(page.app.draft().cropEdit), { x: 0.08, y: 0.06, w: 0.84, h: 0.88 });
  assert.match(page.sheet(), /data-crop-stage[\s\S]*data-crop-box/);
  assert.match(page.sheet(), /원본 사진은 저장하지 않아요/);
  page.app.draft().cropEdit = { x: 0.25, y: 0.1, w: 0.5, h: 0.4 };
  await page.click({ action: 'crop-apply' });
  const cropped = page.app.draft().asset;
  assert.equal(await text(cropped.blob), '200,100,400,400', 'only the chosen rectangle of the source is drawn');
  assert.notEqual(cropped.id, whole.id);
  assert.equal(page.app.draft().photoId, cropped.id);
  assert.equal(page.app.draft().cropEdit, null);
  assert.match(page.sheet(), /자른 영역 다시 조정/);

  await page.click({ action: 'crop-start' });
  assert.deepEqual(plain(page.app.draft().cropEdit), { x: 0.25, y: 0.1, w: 0.5, h: 0.4 }, 're-adjusting starts from the applied crop');
  assert.match(page.sheet(), /data-action="crop-reset"/);
  await page.click({ action: 'crop-reset' });
  assert.equal(page.app.draft().asset.id, whole.id, 'the original whole photo comes back from the in-memory source');
  assert.equal(page.app.draft().crop, null);

  await page.click({ action: 'crop-start' });
  page.app.draft().cropEdit = { x: 0, y: 0.5, w: 1, h: 0.5 };
  await page.click({ action: 'crop-apply' });
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  await page.click({ action: 'draft-save' });
  const saved = await stored(page);
  const garment = saved.state.garments.at(-1);
  assert.equal(saved.photos.size, 1, 'only the cropped photo is stored, never the original file');
  assert.equal(await text(saved.photos.get(garment.photoId)), '0,500,800,500');
});

test('cancelling or failing a crop keeps the previous photo, the chosen kind and typed name', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(photo(2));
  await page.click({ action: 'draft-kind', kind: 'jacket' });
  page.input('garment-label', '주말 재킷');
  const before = page.app.draft().asset.id;

  await page.click({ action: 'crop-start' });
  await page.click({ action: 'crop-cancel' });
  assert.equal(page.app.draft().cropEdit, null);
  assert.equal(page.app.draft().asset.id, before);

  await page.click({ action: 'crop-start' });
  page.app.draft().cropEdit = { x: 0.1, y: 0.1, w: 0.3, h: 0.3 };
  // Every JPEG quality step fails, as when the encoder runs out of memory.
  page.control.failEncodes = 3;
  await page.click({ action: 'crop-apply' });
  const draft = page.app.draft();
  assert.equal(draft.asset.id, before, 'the previous photo is not replaced by a failed crop');
  assert.ok(draft.cropEdit, 'the crop box stays open to try again');
  assert.equal(draft.kind, 'jacket');
  assert.equal(draft.label, '주말 재킷');
  assert.match(page.sheet(), /class="photo-error"/);

  await page.click({ action: 'crop-apply' });
  assert.notEqual(page.app.draft().asset.id, before, 'retrying the same crop succeeds');
  assert.equal(page.app.draft().photoError, '');
});

test('a HEIC photo that the browser can decode (Safari 17+) is converted to a stored JPEG', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await page.click({ action: 'add-start' });
  const heic = Object.assign(new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], { type: 'image/heic' }), { decodable: true });
  await page.app.chooseGarmentPhoto(heic);
  const draft = page.app.draft();
  assert.equal(draft.photoError, '');
  assert.equal(draft.asset.blob.type, 'image/jpeg');
  await page.click({ action: 'crop-start' });
  assert.ok(page.app.draft().cropEdit, 'the decoded HEIC can be cropped too');
});

test('a HEIC file with an empty type is recognized by its name and gets the iPhone guidance when undecodable', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await page.click({ action: 'add-start' });
  const heic = Object.assign(new Blob([new Uint8Array([0, 0, 0, 24])]), { name: 'IMG_0001.HEIC' });
  await page.app.chooseGarmentPhoto(heic);
  assert.match(page.app.draft().photoError, /HEIC 사진을 열지 못했어요/);
  assert.equal(page.app.draft().asset, null);
});

test('a saved photo can be re-cropped when the garment is edited, without touching its ID or date', async (t) => {
  const indexedDB = new IDBFactory();
  const asset = await photoAsset(photo(9));
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  const garment = makeGarment({ id: 'owned-1', kind: 'shirt', gender: 'M', photoId: asset.id, createdAt: '2026-10-10T00:00:00.000Z' });
  await store.commit({ ...newWardrobeState(), demo: false, demoSelected: [], garments: [garment] }, first.revision, [asset], first.epoch);
  store.close();
  const page = await boot({ indexedDB });
  t.after(() => page.close());
  page.app.beginDraft(page.app.state().garments[0]);
  await page.click({ action: 'crop-start' });
  assert.ok(page.app.draft().cropEdit, 'the stored JPEG becomes the crop source');
  page.app.draft().cropEdit = { x: 0.5, y: 0.5, w: 0.5, h: 0.5 };
  await page.click({ action: 'crop-apply' });
  await page.click({ action: 'draft-save' });
  const saved = await stored(page);
  const edited = saved.state.garments.find((g) => g.id === 'owned-1');
  assert.equal(edited.createdAt, '2026-10-10T00:00:00.000Z');
  assert.notEqual(edited.photoId, asset.id);
  assert.equal(await text(saved.photos.get(edited.photoId)), '400,500,400,500');
  assert.equal(saved.photos.has(asset.id), false, 'the replaced uncropped photo is released with the edit');
});
