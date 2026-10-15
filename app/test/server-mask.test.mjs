import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { BACKGROUND_MASK_SIZE } from '../src/background-removal.js';
import { openDatabase } from '../../server/src/db.js';
import { createApp } from '../../server/src/app.js';

const SIZE = BACKGROUND_MASK_SIZE;
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-server-mask-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const script = fs.readFileSync(output, 'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, draft: () => draft, chooseGarmentPhoto, submitAccountForm, kickSync, setPhotoAnalysisAllowed: (allowed) => { photoAnalysisAllowed = allowed; }, setBackgroundRemoverFactory: (factory) => { backgroundRemoverFactory = factory; backgroundRemover = null; } };\n})();',
);

function boxMask(x0, y0, x1, y1, extra = null) {
  const mask = new Uint8Array(SIZE * SIZE);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * SIZE + x] = 255;
  if (extra) for (let y = extra[1]; y < extra[3]; y++) for (let x = extra[0]; x < extra[2]; x++) mask[y * SIZE + x] = 255;
  return mask;
}
// The server's mask service is replaced by a stand-in; the real model is checked in server/test.
const mask = { calls: [], fail: null };
const db = openDatabase(':memory:');
const service = { mask: async (rgb) => { mask.calls.push(rgb); if (mask.fail) throw mask.fail; return boxMask(80, 40, 240, 300); } };
const app = createApp({ db, maskService: service, config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none' } });
const server = http.createServer((req, res) => app.handle(req, res));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => new Promise((resolve) => server.close(() => { db.close(); resolve(); })));

async function boot() {
  const urls = new Map();
  let nextURL = 0;
  class TestURL extends URL {
    static createObjectURL(blob) { const id = `blob:mask/${++nextURL}`; urls.set(id, blob); return id; }
    static revokeObjectURL(id) { urls.delete(id); }
  }
  class TestImage { naturalWidth = 800; naturalHeight = 1000; decode() { return Promise.resolve(); } }
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }]));
  const listeners = new Map();
  const storage = new Map();
  const context = vm.createContext({
    indexedDB: new IDBFactory(), Blob, crypto: globalThis.crypto, structuredClone, btoa, atob,
    Uint8Array, Uint8ClampedArray, DataView, TextEncoder, TextDecoder, URL: TestURL, URLSearchParams,
    Image: TestImage, HTMLImageElement: TestImage,
    fetch: (url, init) => (String(url).startsWith('blob:') ? Promise.resolve({ blob: async () => urls.get(url) }) : fetch(url, init)),
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    location: { origin: base, search: '' }, navigator: {},
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      querySelector: (selector) => (selector === 'meta[name="eoul-api"]' ? { content: 'same-origin' } : null), querySelectorAll: () => [],
      visibilityState: 'visible', body: { style: {}, append() {} },
      createElement(tag) {
        if (tag !== 'canvas') return { click() {}, remove() {} };
        let rect = null;
        return {
          width: 0, height: 0,
          getContext: () => ({
            fillRect() {}, putImageData() {}, globalCompositeOperation: 'source-over',
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(180) }),
            drawImage(image, sx, sy, sw, sh) { if (!rect) rect = image?.getContext ? ['composed'] : [sx, sy, sw, sh]; },
          }),
          toBlob(callback) {
            const label = rect?.[0] === 'composed' ? `bg:${this.width}x${this.height}` : (rect || []).join(',');
            callback(new Blob([new Uint8Array([255, 216, 255, ...new TextEncoder().encode(label)])], { type: 'image/jpeg' }));
          },
        };
      },
    },
    window: { scrollTo() {}, matchMedia: () => ({ matches: false }) }, CSS: { escape: (v) => v },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  await context.testApp.ready;
  context.testApp.setPhotoAnalysisAllowed(false);
  const page = {
    app: context.testApp,
    sheet: () => nodes.get('sheet-root').innerHTML,
    async click(dataset) { for (const fn of listeners.get('click') || []) await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} }); },
    input(id, value) { for (const fn of listeners.get('input') || []) fn({ target: { id, value, dataset: {} } }); },
    async signup(email) {
      await page.click({ action: 'account-open', mode: 'signup' });
      page.input('account-email', email);
      page.input('account-password', 'correct horse');
      for (const field of ['age14', 'privacy', 'terms'])
        for (const fn of listeners.get('change') || []) await fn({ target: { id: '', checked: true, dataset: { action: 'account-check', field } } });
      await context.testApp.submitAccountForm({});
      await context.testApp.kickSync();
    },
    close() { context.testApp.store.close(); },
  };
  return page;
}
const photo = (value) => new Blob([new Uint8Array([255, 216, 255, value])], { type: 'image/jpeg' });
const text = async (blob) => new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(3));
function deviceRemover(result) {
  const calls = [];
  return { calls, factory: () => ({ segment: async (blob) => { calls.push(blob); return { mask: result, size: SIZE }; }, dispose() {} }) };
}

test('signed in: the server removes the background without the 7MB download, from a 320×320 copy only', async (t) => {
  mask.calls.length = 0;
  mask.fail = null;
  const page = await boot();
  t.after(() => page.close());
  await page.signup('server-mask@example.com');
  const device = deviceRemover(boxMask(0, 0, 10, 10));
  page.app.setBackgroundRemoverFactory(device.factory);
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(photo(9));
  const before = page.app.draft().asset.id;
  await page.click({ action: 'bg-remove' });
  assert.equal(mask.calls.length, 1, 'no download consent first; the server was asked');
  assert.equal(mask.calls[0].length, SIZE * SIZE * 3, 'only a small RGB copy is sent');
  assert.equal(device.calls.length, 0);
  assert.notEqual(page.app.draft().asset.id, before);
  assert.match(await text(page.app.draft().asset.blob), /^bg:/);
  assert.match(page.sheet(), /운영자 서버에서 처리했고, 서버에 사진을 남기지 않아요/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n, 0, 'the mask request stores nothing');
});

test('when the server cannot do it, the photo stays and the next try uses this device', async (t) => {
  mask.calls.length = 0;
  mask.fail = Object.assign(new Error('busy'), { code: 'busy' });
  const page = await boot();
  t.after(() => { mask.fail = null; page.close(); });
  await page.signup('server-busy@example.com');
  const device = deviceRemover(boxMask(60, 60, 260, 300));
  page.app.setBackgroundRemoverFactory(device.factory);
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(photo(10));
  const before = page.app.draft().asset.id;
  await page.click({ action: 'bg-remove' });
  assert.equal(page.app.draft().asset.id, before, 'the photo is unchanged');
  assert.match(page.sheet(), /서버에서 배경을 지우지 못했어요. 다시 누르면 이 기기에서 지워요/);
  await page.click({ action: 'bg-remove' });
  assert.match(page.sheet(), /배경 지우기 도구\(약 7MB\)를 처음 한 번 내려받아요/, 'the device path still asks before downloading');
  await page.click({ action: 'bg-allow' });
  assert.equal(device.calls.length, 1);
  assert.equal(mask.calls.length, 1, 'the server is not asked again in this session');
  assert.notEqual(page.app.draft().asset.id, before);
});

test('not signed in: the server is never asked, and a stray object in the mask is dropped', async (t) => {
  mask.calls.length = 0;
  const page = await boot();
  t.after(() => page.close());
  // Garment box plus a separate small box far away (another object).
  const device = deviceRemover(boxMask(100, 100, 200, 200, [280, 280, 300, 300]));
  page.app.setBackgroundRemoverFactory(device.factory);
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(photo(11));
  await page.click({ action: 'bg-remove' });
  await page.click({ action: 'bg-allow' });
  assert.equal(mask.calls.length, 0);
  // Without cleanup the crop would reach to x=300; with it the result is the garment box plus 6% margin.
  const [w, h] = (await text(page.app.draft().asset.blob)).slice(3).split('x').map(Number);
  assert.ok(w < 400 && h < 450, `cropped to the garment only (${w}x${h})`);
});
