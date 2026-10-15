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
import { openDatabase } from '../../server/src/db.js';
import { createApp } from '../../server/src/app.js';
import { makeGarment, newWardrobeState } from '../src/wardrobe.js';
import { createWardrobeStore, photoAsset } from '../src/wardrobe-store.js';
import { validateCommunityLook, communityLookFrom, nameProblem } from '../src/community-post.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-community-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const script = fs.readFileSync(output, 'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { ready: appReady, features: accountFeatures, submitAccountForm, kickSync, state: () => state, shareDraft: () => shareDraft, communityView: () => communityView };\n})();',
);

const db = openDatabase(':memory:');
const app = createApp({ db, config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none', community: true } });
const server = http.createServer((req, res) => app.handle(req, res));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
after(() => new Promise((resolve) => server.close(() => { db.close(); resolve(); })));
const base = `http://127.0.0.1:${server.address().port}`;

const g = (slot, color, id, extra = {}) => makeGarment({ id, slot, color, gender: 'M', ...extra });
const jpeg = new Blob([new Uint8Array([255, 216, 255, 0xe0, 1, 2, 3])], { type: 'image/jpeg' });
async function seeded() {
  const asset = await photoAsset(jpeg);
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  await store.commit({ ...newWardrobeState(), demo: false, demoSelected: [], garments: [
    g('m-oxford', 'white', 'g_oxford', { photoId: asset.id, brand: '유니클로' }),
    g('m-chino', 'beige', 'g_chino'), g('m-loafer', 'brown', 'g_loafer'), g('m-rugby', 'navy', 'g_rugby'),
    g('m-canvas', 'ivory', 'g_canvas'), g('m-knit', 'navy', 'g_knit'),
    ...['m-balmacaan', 'm-harrington'].map((slot) => g(slot, slot === 'm-balmacaan' ? 'beige' : 'navy', `g_${slot}`, { productId: slot === 'm-balmacaan' ? 'ms-5596303' : 'ms-3323583' })),
  ] }, first.revision, [asset], first.epoch);
  store.close();
  return indexedDB;
}

async function boot({ indexedDB = new IDBFactory(), storage = new Map() } = {}) {
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }]));
  const listeners = new Map();
  const toasts = [];
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob, Uint8Array, DataView, TextEncoder, TextDecoder,
    URL: class extends URL { static createObjectURL() { return 'blob:community/1'; } static revokeObjectURL() {} }, URLSearchParams,
    Image: class { decode() { return Promise.resolve(); } }, fetch: (url, init) => fetch(url, init),
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    location: { origin: base, search: '', pathname: '/', hash: '' }, history: { replaceState() {} }, navigator: {},
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      querySelector: (selector) => (selector === 'meta[name="eoul-api"]' ? { content: 'same-origin' } : null), querySelectorAll: () => [],
      visibilityState: 'visible', body: { style: {}, append() {} }, createElement: () => ({ click() {}, remove() {} }),
    },
    window: { scrollTo() {}, matchMedia: () => ({ matches: false }) }, CSS: { escape: (v) => v },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  Object.defineProperty(nodes.get('toast'), 'innerHTML', { get: () => toasts.at(-1) || '', set: (v) => toasts.push(v) });
  vm.runInContext(script, context);
  await context.testApp.ready;
  await context.testApp.features;
  const fire = async (type, target) => { for (const fn of listeners.get(type) || []) await fn({ target, preventDefault() {}, stopPropagation() {} }); };
  const page = {
    app: context.testApp, storage, toasts,
    body: () => nodes.get('app').innerHTML,
    sheet: () => nodes.get('sheet-root').innerHTML,
    click: (dataset) => fire('click', { closest: () => ({ dataset }) }),
    change: (dataset, checked) => fire('change', { id: '', checked, dataset }),
    input: (id, value) => fire('input', { id, value, dataset: {} }),
    async signup(email) {
      await page.click({ action: 'account-open', mode: 'signup' });
      await page.input('account-email', email);
      await page.input('account-password', 'correct horse');
      for (const field of ['age14', 'privacy', 'terms']) await page.change({ action: 'account-check', field }, true);
      await context.testApp.submitAccountForm({});
      await context.testApp.kickSync();
    },
  };
  return page;
}

test('the shared look carries the outfit shape only, and the server-side check accepts exactly that', () => {
  const garment = g('m-oxford', 'white', 'g_secret', { photoId: 'p_' + 'a'.repeat(64), brand: '유니클로', productId: 'ms-3323583', label: '회사 근처에서 산 셔츠' });
  const result = { look: { id: 'm-ivy-campus', title: '아이비 캠퍼스' }, items: [
    { role: 'top', owned: true, item: garment }, { role: 'shoes', owned: true, item: g('m-loafer', 'brown', 'g_shoes') },
    { role: 'acc', owned: false, slot: { id: 'm-belt' }, product: {} },
  ] };
  const plain = communityLookFrom(result);
  assert.deepEqual(plain.photoIds, []);
  assert.deepEqual(plain.look.items.map((item) => item.photo), [null, null]);
  const text = JSON.stringify(plain.look);
  for (const secret of ['g_secret', 'p_aaaa', '회사 근처', 'createdAt']) assert.ok(!text.includes(secret), `${secret} is not shared`);
  assert.equal(validateCommunityLook(plain.look), plain.look);
  const withPhoto = communityLookFrom(result, { photoPicks: new Set(['g_secret', 'g_shoes']) });
  assert.deepEqual(withPhoto.photoIds, ['p_' + 'a'.repeat(64)], 'only a garment that has a photo');
  assert.equal(validateCommunityLook(withPhoto.look, 1), withPhoto.look);
  assert.throws(() => validateCommunityLook(withPhoto.look, 0), /사진 연결/);
  assert.equal(nameProblem('민지'), '');
  assert.ok(nameProblem('a@b.co'));
  assert.match(nameProblem('01012345678'), /전화번호/);
});

test('share an outfit with members: rules first, no photo unless chosen and agreed; another member sees it, opens its product, reports it', async () => {
  const a = await boot({ indexedDB: await seeded() });
  await a.signup('sharer@example.com');
  assert.match(a.body(), /회원 코디 보기/, 'home shows the community when the server turned it on');
  await a.click({ action: 'tab', tab: 'closet' });
  await a.click({ action: 'open-look', index: '0' });
  assert.match(a.sheet(), /이 코디를 회원들과 나누기/);
  const index = /data-action="community-share-open" data-index="(\d+)"/.exec(a.sheet())[1];
  await a.click({ action: 'community-share-open', index });
  assert.match(a.sheet(), /이 서버 회원에게 아래 내용만 보여요/);
  assert.match(a.sheet(), /보내지 않는 것: 구매 링크, 메모, 옷장 기록, 고르지 않은 사진/);
  await a.input('community-caption', '출근 첫날');
  await a.click({ action: 'community-share' });
  assert.match(a.sheet(), /회원 코디 규칙/, 'the first share asks for the rules and a name');
  assert.match(a.sheet(), /data-action="community-join" disabled/);
  await a.input('community-name', '민지');
  await a.change({ action: 'community-agree' }, true);
  await a.click({ action: 'community-join' });
  assert.match(a.sheet(), /코디 나누기/, 'back to the same share after joining');
  assert.equal(a.app.shareDraft().caption, '출근 첫날', 'the caption typed before joining is kept');
  await a.click({ action: 'community-share' });
  assert.match(a.toasts.at(-1), /회원 코디에 올렸어요/);
  assert.match(a.sheet(), /민지 \(나\)/);
  assert.match(a.sheet(), /출근 첫날/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM post_photos').get().n, 0, 'no photo was sent');

  // A second post with the shirt photo: the button waits for consent.
  await a.click({ action: 'tab', tab: 'closet' });
  await a.click({ action: 'open-look', index: '0' });
  await a.click({ action: 'community-share-open', index: /data-action="community-share-open" data-index="(\d+)"/.exec(a.sheet())[1] });
  assert.match(a.sheet(), /data-action="community-photo-pick" data-id="g_oxford"/, 'the shirt in this outfit has a photo to offer');
  assert.doesNotMatch(a.sheet(), /data-id="g_chino"[^>]*community-photo-pick|community-photo-pick" data-id="g_chino"/, 'garments without a photo are not offered');
  await a.change({ action: 'community-photo-pick', id: 'g_oxford' }, true);
  assert.match(a.sheet(), /고른 사진 1장을 이 서버 회원이 볼 수 있어요/);
  assert.match(a.sheet(), /data-action="community-share" disabled/, 'no upload before agreeing for this post');
  await a.click({ action: 'community-share' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 1, 'a click on the disabled button sends nothing');
  await a.change({ action: 'community-photo-consent' }, true);
  await a.click({ action: 'community-share' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM post_photos').get().n, 1);
  assert.deepEqual([...db.prepare('SELECT bytes FROM post_photos').get().bytes], [255, 216, 255, 0xe0, 1, 2, 3], 'the exact photo bytes');

  const b = await boot();
  await b.signup('reader@example.com');
  await b.click({ action: 'community-open' });
  assert.match(b.sheet(), /회원 코디 규칙/);
  await b.input('community-name', '지수');
  await b.change({ action: 'community-agree' }, true);
  await b.click({ action: 'community-join' });
  assert.match(b.sheet(), /민지 · \d{4}-\d{2}-\d{2}/);
  assert.ok(!b.sheet().includes('sharer@example.com'), 'no email is shown');
  assert.ok(!/g_oxford|g_chino|p_[a-f0-9]{8}/.test(b.sheet()), 'no garment or photo names');
  assert.match(b.sheet(), /사진 1장 보기/);
  const photoPost = /data-action="community-photos" data-id="([^"]+)"/.exec(b.sheet())[1];
  await b.click({ action: 'community-photos', id: photoPost });
  assert.match(b.sheet(), /<img src="blob:community\/1" alt="회원이 올린 옷 사진">/);
  assert.match(b.sheet(), /유니클로/, 'the brand the member entered');
  const shared = b.app.communityView().posts.flatMap((post) => post.look.items.map((item) => item.productId)).filter(Boolean);
  assert.ok(shared.length, 'a listed product travelled with the outfit');
  const productId = shared[0];
  assert.match(b.sheet(), new RegExp(`data-action="open-item" data-id="${productId}"`));
  await b.click({ action: 'open-item', id: productId });
  assert.match(b.sheet(), new RegExp(`data-action="candidate-product" data-id="${productId}"`), 'from a member’s outfit to comparing with my own clothes');
  await b.click({ action: 'community-open' });
  const first = b.app.communityView().posts.at(-1).id;
  await b.click({ action: 'community-report-open', id: first });
  assert.match(b.sheet(), /개인정보가 보여요/);
  await b.click({ action: 'community-report', id: first, reason: 'privacy' });
  assert.match(b.toasts.at(-1), /신고했어요/);
  assert.ok(!b.app.communityView().posts.some((post) => post.id === first));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM post_reports').get().n, 1);

  // The author deletes the remaining posts with a second tap each.
  await a.click({ action: 'community-open' });
  await a.click({ action: 'community-filter', mine: '1' });
  for (const post of [...a.app.communityView().posts]) {
    await a.click({ action: 'community-delete', id: post.id });
    assert.match(a.sheet(), /한 번 더 누르면 지워요/);
    await a.click({ action: 'community-delete', id: post.id });
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM post_photos').get().n, 0);
});
