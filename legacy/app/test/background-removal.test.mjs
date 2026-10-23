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
import { createBackgroundRemover, maskCoverage, BACKGROUND_FILES, BACKGROUND_MASK_SIZE } from '../src/background-removal.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-background-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, draft: () => draft, beginDraft, chooseGarmentPhoto, saveGarmentDraft, closeSheet, setPhotoAnalysisAllowed: (allowed) => { photoAnalysisAllowed = allowed; }, setBackgroundRemoverFactory: (factory) => { backgroundRemoverFactory = factory; backgroundRemover = null; } };\n})();',
);

// The real bundled callbacks run against fake IndexedDB with a fake remover.
// They check consent, data safety and what is stored; segmentation quality and
// speed were measured separately in Chromium (docs/background-removal-20261015.md).
async function boot({ indexedDB = new IDBFactory() } = {}) {
  const urls = new Map();
  let nextURL = 0;
  const draws = [];
  const control = { failEncodes: 0 };
  class TestURL extends URL {
    static createObjectURL(blob) { const id = `blob:background/${++nextURL}`; urls.set(id, blob); return id; }
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
          getContext: () => ({
            fillRect() {}, putImageData() {}, globalCompositeOperation: 'source-over',
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            drawImage(image, sx, sy, sw, sh) { if (!rect) rect = image?.getContext ? ['composed'] : [sx, sy, sw, sh]; draws.push(rect); },
          }),
          toBlob(callback) {
            if (control.failEncodes > 0) { control.failEncodes--; return callback(null); }
            const label = rect?.[0] === 'composed' ? `bg:${this.width}x${this.height}` : rect.join(',');
            callback(new Blob([new Uint8Array([255, 216, 255, ...new TextEncoder().encode(label)])], { type: 'image/jpeg' }));
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
const SIZE = BACKGROUND_MASK_SIZE;
function boxMask(x0, y0, x1, y1) {
  const mask = new Uint8Array(SIZE * SIZE);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * SIZE + x] = 255;
  return mask;
}
function fakeRemover(result) {
  const calls = [];
  return { calls, factory: () => ({ segment: async (blob) => { calls.push(blob); if (result instanceof Error) throw result; return { mask: result, size: SIZE }; }, dispose() {} }) };
}
async function stored(page) { const row = await page.app.store.read(); return { state: plain(row.state), photos: row.photos }; }

test('mask coverage counts the foreground share at the 50% threshold', () => {
  assert.equal(maskCoverage(new Uint8Array([0, 127, 128, 255])), 0.5);
  assert.equal(maskCoverage(new Uint8Array(0)), 0);
});

test('the first background removal asks for the download, then replaces the photo and can be undone', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  const fake = fakeRemover(boxMask(80, 40, 240, 300));
  page.app.setBackgroundRemoverFactory(fake.factory);
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(photo(3));
  const before = page.app.draft().asset;
  await page.click({ action: 'bg-remove' });
  assert.equal(fake.calls.length, 0, 'nothing is downloaded before consent');
  assert.match(page.sheet(), /배경 지우기 도구\(약 7MB\)를 처음 한 번 내려받아요[\s\S]*밖으로 보내지 않아요/);
  await page.click({ action: 'bg-allow' });
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0], before.blob, 'the current photo is what gets segmented');
  const after = page.app.draft().asset;
  assert.notEqual(after.id, before.id);
  assert.match(await text(after.blob), /^bg:\d+x\d+$/);
  assert.match(page.sheet(), /data-action="bg-restore"/);
  assert.match(page.sheet(), /배경을 흰색으로 바꿨어요/);
  await page.click({ action: 'bg-restore' });
  assert.equal(page.app.draft().asset.id, before.id);
  await page.click({ action: 'bg-remove' });
  assert.equal(fake.calls.length, 2, 'consent lasts for the session');
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  await page.click({ action: 'draft-save' });
  const saved = await stored(page);
  const garment = saved.state.garments.at(-1);
  assert.match(await text(saved.photos.get(garment.photoId)), /^bg:/, 'the white-background photo is what is stored');
  assert.equal(saved.photos.size, 1);
});

test('a mask that finds nothing or everything is rejected and the photo stays as it was', async (t) => {
  for (const mask of [new Uint8Array(SIZE * SIZE), new Uint8Array(SIZE * SIZE).fill(255)]) {
    const page = await boot();
    t.after(() => page.close());
    page.app.setBackgroundRemoverFactory(fakeRemover(mask).factory);
    await page.click({ action: 'add-start' });
    await page.app.chooseGarmentPhoto(photo(4));
    await page.click({ action: 'draft-kind', kind: 'pants' });
    const before = page.app.draft().asset.id;
    await page.click({ action: 'bg-remove' });
    await page.click({ action: 'bg-allow' });
    assert.equal(page.app.draft().asset.id, before);
    assert.equal(page.app.draft().kind, 'pants');
    assert.match(page.sheet(), /옷을 배경과 구분하지 못했어요/);
  }
});

test('a failed or refused tool keeps the photo and the inputs, and the next try can succeed', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.setBackgroundRemoverFactory(fakeRemover(new Error('배경 지우기 도구 파일이 고정한 버전과 달라 사용하지 않았어요.')).factory);
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(photo(5));
  page.input('garment-label', '여름 셔츠');
  const before = page.app.draft().asset.id;
  await page.click({ action: 'bg-remove' });
  await page.click({ action: 'bg-allow' });
  assert.equal(page.app.draft().asset.id, before);
  assert.equal(page.app.draft().label, '여름 셔츠');
  assert.match(page.sheet(), /고정한 버전과 달라 사용하지 않았어요/);
  page.app.setBackgroundRemoverFactory(fakeRemover(boxMask(50, 50, 200, 280)).factory);
  await page.click({ action: 'bg-remove' });
  assert.notEqual(page.app.draft().asset.id, before);
  assert.equal(page.app.draft().bgError, '');
});

test('cropping after removing the background starts again from the original photo', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.setBackgroundRemoverFactory(fakeRemover(boxMask(80, 40, 240, 300)).factory);
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(photo(6));
  await page.click({ action: 'bg-remove' });
  await page.click({ action: 'bg-allow' });
  assert.ok(page.app.draft().bgBefore);
  await page.click({ action: 'crop-start' });
  page.app.draft().cropEdit = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
  await page.click({ action: 'crop-apply' });
  assert.equal(page.app.draft().bgBefore, null, 'the undo target no longer matches the photo');
  assert.equal(await text(page.app.draft().asset.blob), '80,100,400,500');
  assert.match(page.sheet(), /data-action="bg-remove"/);
});

test('the remover runs one photo at a time, times out cleanly and rejects after disposal', async () => {
  const posted = [];
  let worker;
  const remover = createBackgroundRemover({
    timeoutMs: 20,
    createWorker: () => (worker = { postMessage: (m) => posted.push(m), terminate() { this.terminated = true; } }),
  });
  const first = remover.segment(photo());
  await assert.rejects(remover.segment(photo()), /앞선 배경 지우기가 아직 진행 중이에요/);
  worker.onmessage({ data: { type: 'result', id: posted[0].id, mask: new Uint8Array(SIZE * SIZE), size: SIZE } });
  assert.equal((await first).size, SIZE);
  const slow = remover.segment(photo());
  await assert.rejects(slow, { name: 'TimeoutError' });
  assert.equal(worker.terminated, true);
  await assert.rejects(remover.segment(photo()), { name: 'InvalidStateError' });
});

test('saving waits while the background is being removed', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  let finish;
  page.app.setBackgroundRemoverFactory(() => ({ segment: () => new Promise((resolve) => { finish = resolve; }), dispose() {} }));
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(photo(7));
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  await page.click({ action: 'bg-remove' });
  const running = page.click({ action: 'bg-allow' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.app.draft().bgRunning, true);
  assert.match(page.sheet(), /data-action="draft-save" disabled>배경 지우는 중…/);
  await page.app.saveGarmentDraft();
  assert.equal((await stored(page)).state.garments.length, 0, 'nothing is saved with the old photo');
  finish({ mask: boxMask(80, 40, 240, 300), size: SIZE });
  await running;
  await page.click({ action: 'draft-save' });
  const saved = await stored(page);
  assert.match(await text(saved.photos.get(saved.state.garments.at(-1).photoId)), /^bg:/, 'the photo saved is the one with the background removed');
});

test('a worker that fails to start is replaced on the next try instead of waiting for the timeout', async () => {
  const workers = [];
  const remover = createBackgroundRemover({
    timeoutMs: 60000,
    createWorker: () => {
      const worker = { posted: [], postMessage(m) { this.posted.push(m); }, terminate() { this.terminated = true; } };
      workers.push(worker);
      return worker;
    },
  });
  const first = remover.segment(photo());
  workers[0].onerror(new Event('error'));
  await assert.rejects(first, /시작하지 못했어요/);
  assert.equal(workers[0].terminated, true);
  const second = remover.segment(photo());
  assert.equal(workers.length, 2, 'a fresh worker is created');
  workers[1].onmessage({ data: { type: 'result', id: workers[1].posted[0].id, mask: new Uint8Array(SIZE * SIZE), size: SIZE } });
  assert.equal((await second).size, SIZE);
});

test('the worker refuses files whose SHA-384 differs and runs the model from the verified bytes', async () => {
  let source;
  const remover = createBackgroundRemover({ createWorker: (s) => { source = s; return { postMessage() {}, terminate() {} }; } });
  remover.segment(photo()).catch(() => {});
  remover.dispose();
  assert.match(source, /onnxruntime-web@1\.22\.0\/dist\/ort\.wasm\.min\.mjs/);
  assert.match(source, /U-2-Netp\/resolve\/7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8\/onnx\/model\.onnx/);
  const bytes = new TextEncoder().encode('pinned test bytes');
  const fetches = [];
  const fakeFetch = async (url, options) => { fetches.push({ url, options }); return { ok: true, arrayBuffer: async () => bytes.buffer.slice(0) }; };
  const run = async (workerSource) => {
    const posted = [];
    let created = null;
    const fakeOrt = {
      env: { wasm: {} },
      Tensor: class { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } },
      InferenceSession: { async create(model) { created = model; return { inputNames: ['input.1'], outputNames: ['1959'], async run() { const d = new Float32Array(SIZE * SIZE); for (let p = 0; p < d.length; p++) d[p] = p % SIZE; return { 1959: { data: d } }; } }; } },
    };
    class OffscreenCanvas { constructor(w, h) { this.w = w; this.h = h; } getContext() { const n = this.w * this.h * 4; return { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(n).fill(200) }) }; } }
    const self = { OffscreenCanvas, createImageBitmap: async () => ({ close() {} }), postMessage: (data) => posted.push(data) };
    vm.runInNewContext(workerSource.replace('import(config.files.runtime.url)', 'Promise.resolve(testOrt)'), { self, Blob, fetch: fakeFetch, crypto: globalThis.crypto, btoa, Uint8Array, Float32Array, testOrt: fakeOrt, URL });
    await self.onmessage({ data: { type: 'segment', id: 'one', blob: photo() } });
    return { posted, created, fakeOrt };
  };
  const tampered = await run(source);
  assert.match(tampered.posted.find((m) => m.type === 'error').message, /고정한 버전과 달라 사용하지 않았어요/);
  assert.equal(tampered.created, null, 'no model session is created from unverified bytes');
  assert.ok(fetches.every((f) => f.options.credentials === 'omit'));
  assert.equal(new Set(fetches.map((f) => f.url)).size, Object.keys(BACKGROUND_FILES).length);

  const digest = `sha384-${Buffer.from(new Uint8Array(await crypto.subtle.digest('SHA-384', bytes))).toString('base64')}`;
  const ok = await run(source.replace(/"integrity":"sha384-[A-Za-z0-9+/=]+"/g, `"integrity":"${digest}"`));
  const result = ok.posted.find((m) => m.type === 'result');
  assert.ok(result, `matching bytes produce a mask: ${JSON.stringify(ok.posted.filter((m) => m.type !== 'result'))}`);
  assert.equal(result.mask.length, SIZE * SIZE);
  assert.equal(result.mask[0], 0);
  assert.equal(result.mask[SIZE - 1], 255, 'the prediction is min-max normalized to 0–255');
  assert.equal(new Uint8Array(ok.created).length, bytes.length, 'the session is created from the verified model bytes');
  assert.equal(new Uint8Array(ok.fakeOrt.env.wasm.wasmBinary).length, bytes.length, 'the verified WASM bytes are handed to the runtime');
  assert.equal(ok.fakeOrt.env.wasm.numThreads, 1);
});
