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
import { makeGarment, newWardrobeState } from '../src/wardrobe.js';
import { createWardrobeStore } from '../src/wardrobe-store.js';
import { candidateFromProduct } from '../src/purchase-candidate.js';
import { createPurchaseJourney, transitionPurchaseJourney, inactivePurchaseGarmentIds } from '../src/purchase-journey.js';
import { PRODUCT_BY_ID } from '../src/engine.js';
import { storageLimits, removableJourneys, journeysWithout, journeyRemovable } from '../src/record-cleanup.js';
import { keepDraft, loadDraft, dropDraft, DRAFT_KEY } from '../src/draft-keeper.js';
import { openDatabase } from '../../server/src/db.js';
import { createApp } from '../../server/src/app.js';

const memory = (map = new Map()) => ({ map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) });
const at = (minute) => `2026-10-14T00:${String(minute).padStart(2, '0')}:00.000Z`;
function journeys() {
  const candidate = candidateFromProduct(PRODUCT_BY_ID['ms-3323583']);
  const compared = transitionPurchaseJourney(createPurchaseJourney(candidate, { id: 'j_compared', at: at(1) }), 'skip', { at: at(2) });
  let ordered = createPurchaseJourney(candidate, { id: 'j_ordered', at: at(3) });
  ordered = transitionPurchaseJourney(transitionPurchaseJourney(ordered, 'buy', { at: at(4) }), 'ordered', { at: at(5) });
  let returned = createPurchaseJourney(candidate, { id: 'j_returned', at: at(6) });
  for (const [action, minute, changes] of [['buy', 7], ['ordered', 8], ['received', 9, { garmentId: 'g_returned' }], ['returned', 10]])
    returned = transitionPurchaseJourney(returned, action, { at: at(minute), ...(changes ? { changes } : {}) });
  return [compared, ordered, returned];
}
function wardrobeWithJourneys() {
  return { ...newWardrobeState(), demo: false, demoSelected: [], styles: ['classic'],
    garments: [makeGarment({ id: 'g_shirt', slot: 'm-oxford', color: 'white', gender: 'M' }), makeGarment({ id: 'g_returned', slot: 'm-harrington', color: 'navy', gender: 'M' })],
    journeys: journeys() };
}

test('cleanup offers only records without a garment link and refuses the others', () => {
  const state = wardrobeWithJourneys();
  assert.deepEqual(state.journeys.map(journeyRemovable), [true, true, false]);
  assert.deepEqual(removableJourneys(state).map((row) => [row.journey.id, row.kind]), [['j_compared', 'compared'], ['j_ordered', 'ordered']]);
  assert.throws(() => journeysWithout(state, ['j_returned']), /옷과 연결된 구매 기록/);
  const after = { ...state, journeys: journeysWithout(state, ['j_compared', 'j_ordered']) };
  assert.ok(inactivePurchaseGarmentIds(after).has('g_returned'), 'the returned garment stays out of the wardrobe');
  const limits = storageLimits(state);
  assert.deepEqual([limits.garments.count, limits.journeys.count, limits.near, limits.full], [2, 3, false, false]);
  const many = { ...state, garments: Array.from({ length: 180 }, (_, i) => makeGarment({ id: `g${i}`, kind: 'shirt', gender: 'M' })) };
  assert.equal(storageLimits(many).near, true);
});

test('a kept draft lasts a day, for known kinds only, and is dropped on request', () => {
  const s = memory();
  const now = new Date('2026-10-15T00:00:00Z');
  assert.equal(keepDraft(s, 'nonsense', {}), false);
  assert.equal(keepDraft(s, 'candidate', { link: 'x' }, now), true);
  assert.equal(loadDraft(s, now).data.link, 'x');
  assert.equal(loadDraft(s, new Date(now.getTime() + 25 * 3600 * 1000)), null);
  assert.equal(keepDraft(s, 'candidate', { big: 'x'.repeat(70000) }, now), false, 'too big is refused, not truncated');
  dropDraft(s);
  assert.equal(s.getItem(DRAFT_KEY), null);
});

// ── the bundled app
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-robust-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const script = fs.readFileSync(output, 'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, set, kickSync, submitAccountForm, account: () => account, syncState: () => syncState, candidateDraft: () => candidateDraft, storageError: () => storageError, journeyForms: () => journeyForms };\n})();',
);
async function boot({ indexedDB = new IDBFactory(), storage = memory(), session = memory(), base = null } = {}) {
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }]));
  const listeners = new Map(), windowListeners = new Map();
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob, Uint8Array, DataView, TextEncoder, TextDecoder,
    URL: class extends URL { static createObjectURL() { return 'blob:x'; } static revokeObjectURL() {} }, URLSearchParams,
    Image: class { decode() { return Promise.resolve(); } }, fetch: (url, init) => fetch(url, init),
    localStorage: storage, sessionStorage: session, navigator: {},
    ...(base ? { location: { origin: base, search: '', pathname: '/', hash: '' } } : {}),
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      querySelector: (selector) => (base && selector === 'meta[name="eoul-api"]' ? { content: 'same-origin' } : null), querySelectorAll: () => [],
      visibilityState: 'visible', body: { style: {}, append() {} }, createElement: () => ({ click() {}, remove() {} }),
    },
    window: { scrollTo() {}, matchMedia: () => ({ matches: false }), addEventListener(type, fn) { windowListeners.set(type, [...(windowListeners.get(type) || []), fn]); } },
    CSS: { escape: (v) => v }, setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  await context.testApp.ready;
  const page = {
    app: context.testApp, storage, session, indexedDB,
    body: () => nodes.get('app').innerHTML,
    sheet: () => nodes.get('sheet-root').innerHTML,
    state: () => JSON.parse(JSON.stringify(context.testApp.state())),
    async click(dataset) { for (const fn of listeners.get('click') || []) await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} }); },
    async input(id, value, dataset = {}) { for (const fn of listeners.get('input') || []) await fn({ target: { id, value, dataset } }); },
    async change(target) { for (const fn of listeners.get('change') || []) await fn({ target: { id: '', dataset: {}, ...target } }); },
    storageEvent(key) { for (const fn of windowListeners.get('storage') || []) fn({ key }); },
    async signup(email) {
      await page.click({ action: 'account-open', mode: 'signup' });
      await page.input('account-email', email);
      await page.input('account-password', 'correct horse');
      for (const field of ['age14', 'privacy', 'terms']) await page.change({ checked: true, dataset: { action: 'account-check', field } });
      await context.testApp.submitAccountForm({});
      await context.testApp.kickSync();
    },
    async login(email) {
      await page.click({ action: 'account-open', mode: 'login' });
      await context.testApp.submitAccountForm({ email: { value: email }, password: { value: 'correct horse' } });
      await context.testApp.kickSync();
    },
  };
  return page;
}
async function seeded(state) {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  await store.commit(state, first.revision, [], first.epoch);
  store.close();
  return indexedDB;
}

test('the cleanup sheet removes only chosen unlinked records after a second tap', async () => {
  const page = await boot({ indexedDB: await seeded(wardrobeWithJourneys()) });
  await page.click({ action: 'open-profile' });
  assert.match(page.sheet(), /옷 2\/200벌 · 구매 기록 3\/200개/);
  await page.click({ action: 'cleanup-open' });
  assert.match(page.sheet(), /받은·계속 입는·반품한 기록은[\s\S]*\(1개\)/);
  assert.match(page.sheet(), /data-id="j_compared"[\s\S]*data-id="j_ordered"/);
  assert.doesNotMatch(page.sheet(), /data-id="j_returned"/);
  await page.change({ checked: true, dataset: { action: 'cleanup-toggle', id: 'j_compared' } });
  const button = { action: 'cleanup-delete' };
  await page.click(button);
  assert.equal(page.state().journeys.length, 3, 'the first tap only asks again');
  await page.click({ ...button, armed: '1' });
  assert.deepEqual(page.state().journeys.map((j) => j.id), ['j_ordered', 'j_returned']);
  assert.ok(!page.state().closet.some((item) => item.id === 'g_returned'), 'the returned garment stays out');
});

test('after this tab reloads, the unsaved draft is offered back; closing on purpose drops it', async () => {
  const session = memory();
  const indexedDB = new IDBFactory();
  const page = await boot({ indexedDB, session });
  await page.click({ action: 'candidate-start' });
  await page.input('candidate-link', 'https://www.musinsa.com/products/5755268');
  assert.ok(session.getItem('eoul:draft:v1'), 'the draft is kept while typing');
  page.app.store.close();

  const reloaded = await boot({ indexedDB, session });
  assert.match(reloaded.body(), /작성하던 구매 후보가 있어요/);
  await reloaded.click({ action: 'draft-restore' });
  assert.equal(reloaded.app.candidateDraft().link, 'https://www.musinsa.com/products/5755268');
  await reloaded.click({ action: 'close-sheet' });
  assert.equal(session.getItem('eoul:draft:v1'), null);
  reloaded.app.store.close();
  const third = await boot({ indexedDB, session });
  assert.doesNotMatch(third.body(), /작성하던/);
});

test('a journey note typed before leaving for the seller comes back after a reload', async () => {
  const session = memory();
  const indexedDB = await seeded(wardrobeWithJourneys());
  const page = await boot({ indexedDB, session });
  await page.click({ action: 'open-journey', id: 'j_compared' });
  await page.input('journey-option', '네이비 / M', { journey: 'j_compared' });
  page.app.store.close();
  const reloaded = await boot({ indexedDB, session });
  assert.match(reloaded.body(), /작성하던 구매 기록 메모가 있어요/);
  await reloaded.click({ action: 'draft-restore' });
  assert.equal(reloaded.app.journeyForms().get('j_compared').option, '네이비 / M');
  assert.equal(reloaded.state().journeys.find((j) => j.id === 'j_compared').option, '', 'nothing was saved without the user');
});

// ── with the account server: two tabs and moving old data
const db = openDatabase(':memory:');
const server = http.createServer((req, res) => createApp({ db, config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none' } }).handle(req, res));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => new Promise((resolve) => server.close(() => { db.close(); resolve(); })));

test('two tabs of one browser: a sign-in and a save in one tab never conflict in the other', async () => {
  const indexedDB = await seeded({ ...newWardrobeState(), demo: false, demoSelected: [], garments: [makeGarment({ id: 'g_a', slot: 'm-oxford', color: 'white', gender: 'M' })] });
  const storage = memory();
  const tabA = await boot({ indexedDB, storage, base });
  const tabB = await boot({ indexedDB, storage, base });
  await tabA.signup('tabs@example.com');
  tabB.storageEvent('eoul:account');
  assert.equal(tabB.app.account().email, 'tabs@example.com', 'the other tab learns of the sign-in');
  await tabA.app.set({ garments: [...tabA.state().garments, makeGarment({ id: 'g_b', slot: 'm-chino', color: 'beige', gender: 'M' })] });
  await tabA.app.kickSync();
  await tabB.app.kickSync();
  assert.equal(tabB.app.storageError(), '', 'no "changed in another screen" error');
  assert.deepEqual(tabB.state().garments.map((g) => g.id).sort(), ['g_a', 'g_b'], 'the stale tab refreshed from this browser before syncing');
  assert.equal(tabB.app.syncState().phase, 'idle');
  await tabB.click({ action: 'account-logout' });
  tabA.storageEvent('eoul:account');
  assert.equal(tabA.app.account(), null, 'signing out in one tab signs out the other');
});

test('the same account in two tabs: a save and sync in one tab shows up in the other without a conflict', async () => {
  const indexedDB = await seeded({ ...newWardrobeState(), demo: false, demoSelected: [], garments: [makeGarment({ id: 'g_a', slot: 'm-oxford', color: 'white', gender: 'M' })] });
  const storage = memory();
  const tabA = await boot({ indexedDB, storage, base });
  await tabA.signup('same@example.com');
  const tabB = await boot({ indexedDB, storage, base });
  await tabB.app.kickSync();
  await tabA.app.set({ garments: [...tabA.state().garments, makeGarment({ id: 'g_c', slot: 'm-chino', color: 'beige', gender: 'M' })] });
  await tabA.app.kickSync();
  tabB.storageEvent('eoul:account');
  for (let i = 0; i < 50 && !tabB.state().garments.some((g) => g.id === 'g_c'); i++) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(tabB.state().garments.map((g) => g.id).sort(), ['g_a', 'g_c'], 'the other tab shows the new garment');
  await tabB.app.set({ garments: [...tabB.state().garments, makeGarment({ id: 'g_d', slot: 'm-loafer', color: 'brown', gender: 'M' })] });
  assert.equal(tabB.app.storageError(), '', 'its next save does not hit a stale-revision conflict');
});

test('an old-version wardrobe on this browser is moved into the account and reaches another address', async () => {
  const oldState = { onboarded: true, gender: 'M', style: 'classic', owned: ['m-tee-white', 'm-chino'], saved: ['ms-404474'] };
  const oldBrowser = await boot({ storage: memory(new Map([['eoul:v1', JSON.stringify(oldState)]])), base });
  assert.equal(oldBrowser.state().demo, false);
  const migrated = oldBrowser.state().garments.map((g) => g.id).sort();
  assert.ok(migrated.length >= 1);
  await oldBrowser.signup('legacy@example.com');
  const otherAddress = await boot({ base });
  await otherAddress.login('legacy@example.com');
  assert.deepEqual(otherAddress.state().garments.map((g) => g.id).sort(), migrated);
  assert.deepEqual(otherAddress.state().saved, ['ms-404474']);
  assert.equal(otherAddress.state().legacyFingerprint, null, 'the old-version marker stays with the browser that had it');
});
