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
import { makeGarment, newWardrobeState } from '../../../app/lite/src/domain/wardrobe.js';
import { createWardrobeStore, photoAsset } from '../src/wardrobe-store.js';
import { validateCommunityLook, communityLookFrom, nameProblem } from '../src/community-post.js';
import { stripJpegMetadata } from '../src/jpeg-clean.js';

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
const segment = (marker, text) => { const body = [...Buffer.from(text, 'latin1')]; return [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body]; };
// An old-version photo that still carries EXIF with a location and a comment.
const exifPhoto = [0xff, 0xd8, ...segment(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'), ...segment(0xe1, 'Exif\0\0GPS 37.5665N 126.9780E'),
  ...segment(0xfe, 'shot at home'), 0xff, 0xda, 0x00, 0x02, 0x41, 0x42, 0xff, 0xd9];
const jpeg = new Blob([new Uint8Array(exifPhoto)], { type: 'image/jpeg' });
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

async function boot({ indexedDB = new IDBFactory(), storage = new Map(), at = base } = {}) {
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }]));
  const listeners = new Map();
  const toasts = [];
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob, Uint8Array, DataView, TextEncoder, TextDecoder,
    URL: class extends URL { static createObjectURL() { return 'blob:community/1'; } static revokeObjectURL() {} }, URLSearchParams,
    Image: class { decode() { return Promise.resolve(); } }, fetch: (url, init) => fetch(url, init),
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    location: { origin: at, search: '', pathname: '/', hash: '' }, history: { replaceState() {} }, navigator: {},
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

test('JPEG metadata is removed without touching the picture data; a broken file is refused', () => {
  const xmp = segment(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>');
  const icc = segment(0xe2, 'ICC_PROFILE\0\x01\x01sRGB');
  const mpf = segment(0xe2, 'MPF\0second picture');
  const adobe = segment(0xee, 'Adobe\0d\0\0\0\0\x01');
  const dqt = [0xff, 0xdb, 0x00, 0x04, 0x00, 0x01];
  const file = new Uint8Array([0xff, 0xd8, ...segment(0xe0, 'JFIF\0\x01\x01'), ...segment(0xe1, 'Exif\0\0GPS'), ...xmp, ...icc, ...mpf, ...adobe,
    ...segment(0xed, 'Photoshop 3.0'), ...segment(0xe5, 'maker'), ...segment(0xfe, 'comment'), ...dqt, 0xff, 0xda, 0x00, 0x02, 0xff, 0x00, 0x7f, 0xff, 0xd9]);
  const { bytes, removed } = stripJpegMetadata(file);
  assert.equal(removed, 6);
  assert.deepEqual([...bytes], [0xff, 0xd8, ...segment(0xe0, 'JFIF\0\x01\x01'), ...icc, ...adobe, ...dqt, 0xff, 0xda, 0x00, 0x02, 0xff, 0x00, 0x7f, 0xff, 0xd9]);
  assert.deepEqual([...stripJpegMetadata(bytes).bytes], [...bytes], 'stripping twice changes nothing');
  for (const broken of [[0xff, 0xd8], [0x89, 0x50, 0x4e, 0x47], [0xff, 0xd8, 0xff, 0xe1, 0x00, 0x40, 0x01], [0xff, 0xd8, 0x00, 0x00]])
    assert.throws(() => stripJpegMetadata(new Uint8Array(broken)), /JPEG/);
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
  const stored = Buffer.from(db.prepare('SELECT bytes FROM post_photos').get().bytes);
  assert.deepEqual([...stored], [...stripJpegMetadata(new Uint8Array(exifPhoto)).bytes], 'the photo, minus its metadata');
  assert.ok(!stored.includes('GPS') && !stored.includes('shot at home'), 'no location or comment reaches other members');

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
  assert.match(b.sheet(), /신고는 운영자가 7일 안에 확인해요\./, 'the operator’s promise is shown before reporting');
  await b.click({ action: 'community-report', id: first, reason: 'privacy' });
  assert.match(b.toasts.at(-1), /신고했어요\. 운영자가 7일 안에 확인해요/);
  assert.ok(!b.app.communityView().posts.some((post) => post.id === first));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM post_reports').get().n, 1);

  // Blocking the author takes a second tap, hides their posts and can be undone from the list.
  const left = b.app.communityView().posts[0].id;
  await b.click({ action: 'community-block', id: left });
  assert.match(b.sheet(), /한 번 더 누르면 민지님과 서로 글이 안 보여요/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM community_blocks').get().n, 0, 'nothing before the second tap');
  await b.click({ action: 'community-block', id: left });
  assert.match(b.toasts.at(-1), /민지님을 차단했어요/);
  assert.equal(b.app.communityView().posts.length, 0);
  assert.match(b.sheet(), /차단한 회원 1명 보기/);
  await b.click({ action: 'community-blocks' });
  assert.match(b.sheet(), /<li>민지 · <button class="link" data-action="community-unblock"/);
  assert.match(b.sheet(), /상대에게는 알리지 않아요/);
  const blockId = /data-action="community-unblock" data-id="([^"]+)"/.exec(b.sheet())[1];
  await b.click({ action: 'community-unblock', id: blockId });
  assert.match(b.toasts.at(-1), /차단을 풀었어요/);
  assert.deepEqual([...b.app.communityView().posts.map((post) => post.id)], [left], 'their post is back');

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

test('when the operator turns the community off, a member is told what is left and can remove it', async () => {
  const offApp = createApp({ db, config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none', community: false } });
  const offServer = http.createServer((req, res) => offApp.handle(req, res));
  await new Promise((resolve) => offServer.listen(0, '127.0.0.1', resolve));
  after(() => new Promise((resolve) => offServer.close(resolve)));
  const offBase = `http://127.0.0.1:${offServer.address().port}`;

  const member = await boot();
  await member.signup('leftover@example.com');
  await member.click({ action: 'community-open' });
  await member.input('community-name', '남은글');
  await member.change({ action: 'community-agree' }, true);
  await member.click({ action: 'community-join' });
  const token = JSON.parse(member.storage.get('eoul:account')).token;
  await fetch(`${base}/v1/community/posts`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ look: { v: 1, lookId: null, title: '남은 코디', items: [{ role: 'top', slot: 'm-oxford', kind: 'shirt', color: 'white', brand: '', productId: null, photo: null }] }, caption: '' }) });

  const storage = new Map([...member.storage].map(([key, value]) => [key, key === 'eoul:account' ? value.replace(JSON.stringify(base), JSON.stringify(offBase)) : value]));
  const later = await boot({ storage, at: offBase });
  assert.doesNotMatch(later.body(), /회원 코디 보기/, 'no community entry while it is off');
  await later.click({ action: 'open-settings' });
  assert.match(later.sheet(), /회원 코디에 남긴 글 1개가 서버에 있어요/);
  await later.click({ action: 'community-open' });
  assert.match(later.sheet(), /지금 회원 코디를 꺼 두었어요. 내가 남긴 글 1개와 그 사진이 서버에 남아 있어요/);
  await later.click({ action: 'community-leave' });
  await later.click({ action: 'community-leave' });
  assert.match(later.toasts.at(-1), /내 글과 사진을 지웠어요/);
  const userId = db.prepare("SELECT user_id FROM identities WHERE email = 'leftover@example.com'").get().user_id;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(userId).n, 0);
});
