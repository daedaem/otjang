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
import {
  addWear, toggleWornOn, deleteWear, wearStats, lastWornTogether, orderByRecentWear, wearMonths, localDate,
  validateWears, MAX_WEAR_ENTRIES,
} from '../src/wear-log.js';
import { makeGarment, newWardrobeState, validateWardrobe, upgradeWardrobe, wardrobeView, WARDROBE_SCHEMA } from '../src/wardrobe.js';
import { createWardrobeStore } from '../src/wardrobe-store.js';
import { storageLimits } from '../src/record-cleanup.js';
import { SAFE_PRODUCTS, closetLooks } from '../src/engine.js';
import { LOOKS } from '../src/data/looks.js';
import { candidateFromProduct } from '../src/purchase-candidate.js';
import { createPurchaseJourney, transitionPurchaseJourney } from '../src/purchase-journey.js';
import { openDatabase } from '../../server/src/db.js';
import { createApp, AGREEMENT_VERSION } from '../../server/src/app.js';

const at = (minute = 0) => new Date(Date.UTC(2026, 9, 15, 9, minute)).toISOString();
const entry = (id, date, garmentIds, extra = {}) => ({ id, date, garmentIds, lookId: null, note: '', at: at(), ...extra });
const g = (slot, color, id) => makeGarment({ id, slot, color, gender: 'M' });
const closet = () => [
  g('m-harrington', 'navy', 'g_jacket'), g('m-oxford', 'white', 'g_oxford'), g('m-chino', 'beige', 'g_chino'),
  g('m-loafer', 'brown', 'g_loafer'), g('m-rugby', 'navy', 'g_rugby'), g('m-canvas', 'ivory', 'g_canvas'),
  g('m-knit', 'navy', 'g_knit'), g('m-balmacaan', 'beige', 'g_coat'),
];
const personal = (extra = {}) => ({ ...newWardrobeState(), demo: false, demoSelected: [], garments: closet(), ...extra });

test('the current schema keeps a strict wear diary; schema 5 upgrades with an empty one; examples and older apps never carry it', () => {
  assert.equal(WARDROBE_SCHEMA, 7);
  const state = personal({ wears: [entry('w_1', '2026-10-14', ['g_oxford', 'g_chino'], { note: '비 옴' })] });
  assert.equal(validateWardrobe(state), state);
  const { wears, offerRecords, ...v5 } = { ...state, schema: 5 };
  assert.deepEqual(upgradeWardrobe(v5).wears, []);
  assert.throws(() => validateWardrobe({ ...v5, wears }), /지원하지 않는 옷장 형식/, 'a schema 5 app refuses the diary instead of dropping it');
  assert.throws(() => validateWardrobe({ ...newWardrobeState(), wears: [entry('w_1', '2026-10-14', ['demo_M_0'])] }), /예시 옷/);
  for (const bad of [
    { ...entry('w_1', '2026-02-30', ['g_oxford']) },
    { ...entry('w_1', '2026-10-14', []) },
    { ...entry('w_1', '2026-10-14', ['g_oxford', 'g_oxford']) },
    { ...entry('w_1', '2026-10-14', ['g_oxford']), note: 'x'.repeat(201) },
    { ...entry('w_1', '2026-10-14', ['g_oxford']), note: '줄\n바꿈' },
    { ...entry('w_1', '2026-10-14', ['g_oxford']), extra: true },
    { ...entry('bad id', '2026-10-14', ['g_oxford']) },
  ]) assert.throws(() => validateWears([bad]), undefined, JSON.stringify(bad));
  assert.throws(() => validateWears([entry('w_1', '2026-10-14', ['a']), entry('w_1', '2026-10-13', ['b'])]), /중복/);
});

test('recording is idempotent per day, "wore it today" toggles, and a full diary says so', () => {
  let wears = [];
  const first = addWear(wears, { date: '2026-10-14', garmentIds: ['g_oxford', 'g_chino'], lookId: 'm-ivy-campus', at: at(1), id: 'w_a' });
  assert.equal(first.added, true);
  const again = addWear(first.wears, { date: '2026-10-14', garmentIds: ['g_chino', 'g_oxford'], at: at(2), id: 'w_b' });
  assert.equal(again.added, false, 'the same garments on the same day are one record');
  assert.equal(again.wears, first.wears);
  wears = first.wears;
  wears = toggleWornOn(wears, 'g_loafer', { date: '2026-10-14', at: at(3), id: 'w_c' }).wears;
  assert.deepEqual(wears.map((e) => e.garmentIds), [['g_oxford', 'g_chino', 'g_loafer']], 'joins that day’s outfit');
  const off = toggleWornOn(wears, 'g_loafer', { date: '2026-10-14' });
  assert.equal(off.worn, false);
  assert.deepEqual(off.wears.map((e) => e.garmentIds), [['g_oxford', 'g_chino']]);
  const alone = toggleWornOn([], 'g_coat', { date: '2026-10-15', at: at(4), id: 'w_d' });
  assert.deepEqual(toggleWornOn(alone.wears, 'g_coat', { date: '2026-10-15' }).wears, [], 'an emptied outfit is removed');

  const full = Array.from({ length: MAX_WEAR_ENTRIES }, (_, i) => entry(`w_${i}`, '2026-01-01', [`g_${i}`]));
  assert.throws(() => addWear(full, { date: '2026-10-15', garmentIds: ['g_new'] }), (error) => error.code === 'wear-full');
  assert.equal(deleteWear(full, 'w_0').length, MAX_WEAR_ENTRIES - 1);
  const limits = storageLimits({ ...personal(), wears: full });
  assert.equal(limits.wearsFull, true);
  assert.equal(limits.full, false, 'a full diary does not block other records');
});

test('stats count recorded days, never call a garment unworn, and recent outfits move back without being hidden', () => {
  const wears = [
    entry('w_1', '2026-10-01', ['g_oxford', 'g_chino']),
    entry('w_2', '2026-10-01', ['g_oxford', 'g_knit']),
    entry('w_3', '2026-10-12', ['g_rugby', 'g_chino', 'g_canvas'], { lookId: 'm-rugby-weekend' }),
  ];
  const stats = wearStats(wears);
  assert.deepEqual(stats.get('g_oxford'), { count: 1, last: '2026-10-01' }, 'two outfits on one day are one day');
  assert.deepEqual(stats.get('g_chino'), { count: 2, last: '2026-10-12' });
  assert.equal(stats.get('g_coat'), undefined, 'no record, not "zero wears"');
  assert.equal(lastWornTogether(wears, ['g_rugby', 'g_chino']), '2026-10-12');
  assert.equal(lastWornTogether(wears, ['g_rugby', 'g_oxford']), null);
  const look = (id, ids) => ({ look: { id }, items: ids.map((x) => ({ owned: true, item: { id: x } })) });
  const ordered = orderByRecentWear([look('a', ['g_rugby', 'g_chino', 'g_canvas']), look('b', ['g_coat']), look('c', ['g_oxford', 'g_chino'])], wears, '2026-10-15');
  assert.deepEqual(ordered.map((r) => [r.look.id, r.recentlyWorn, r.lastWorn]), [['b', false, null], ['c', false, '2026-10-01'], ['a', true, '2026-10-12']]);
  assert.deepEqual(wearMonths([...wears, entry('w_4', '2026-09-30', ['g_coat'])]).map((m) => [m.month, m.count]), [['2026-09', 1], ['2026-10', 3]]);
});

// ── the real bundled screens
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-wear-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const script = fs.readFileSync(output, 'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, chooseWardrobeBackup };\n})();',
);
async function boot(indexedDB) {
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }]));
  const listeners = new Map();
  const toasts = [];
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob, Uint8Array, DataView, TextEncoder, TextDecoder,
    URL: class extends URL { static createObjectURL() { return 'blob:wear/1'; } static revokeObjectURL() {} },
    URLSearchParams, Image: class { decode() { return Promise.resolve(); } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {},
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      querySelector: () => null, querySelectorAll: () => [], body: { style: {}, append() {} }, createElement: () => ({ click() {}, remove() {} }),
    },
    window: { scrollTo() {}, matchMedia: () => ({ matches: false }) }, CSS: { escape: (v) => v },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  Object.defineProperty(nodes.get('toast'), 'innerHTML', { get: () => toasts.at(-1) || '', set: (v) => toasts.push(v) });
  vm.runInContext(script, context);
  await context.testApp.ready;
  const fire = async (type, target) => { for (const fn of listeners.get(type) || []) await fn({ target, preventDefault() {}, stopPropagation() {} }); };
  return {
    app: context.testApp, toasts,
    body: () => nodes.get('app').innerHTML,
    sheet: () => nodes.get('sheet-root').innerHTML,
    click: (dataset) => fire('click', { closest: () => ({ dataset }) }),
    pick: (id, checked) => fire('change', { id: '', checked, dataset: { action: 'wear-pick', id } }),
    change: (dataset, checked) => fire('change', { id: '', checked, dataset }),
    input: (id, value) => fire('input', { id, value, dataset: {} }),
    async clickText(pattern) {
      const html = nodes.get('sheet-root').innerHTML + nodes.get('app').innerHTML;
      const match = new RegExp(`<button[^>]*data-action="([^"]+)"([^>]*)>(?:(?!</button>).)*${pattern}`).exec(html);
      assert.ok(match, `a button with ${pattern}`);
      const dataset = { action: match[1] };
      for (const [, key, value] of match[2].matchAll(/data-([a-z-]+)="([^"]*)"/g)) dataset[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      return fire('click', { closest: () => ({ dataset }) });
    },
  };
}
async function seeded(extra = {}) {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  await store.commit(personal(extra), first.revision, [], first.epoch);
  store.close();
  return indexedDB;
}

test('"wore it today" on a garment is kept, survives a reload, and can be taken back', async () => {
  const indexedDB = await seeded();
  const page = await boot(indexedDB);
  const today = localDate();
  await page.click({ action: 'open-own', id: 'g_oxford' });
  assert.match(page.sheet(), /아직 남긴 착용 기록이 없어요/);
  await page.click({ action: 'wear-toggle', id: 'g_oxford' });
  assert.match(page.toasts.at(-1), /오늘 착용 기록에 남겼어요/);
  assert.match(page.sheet(), new RegExp(`착용 기록 1일 · 최근 ${today}`));
  assert.match(page.sheet(), /aria-pressed="true">오늘 기록에서 빼기/);
  await page.click({ action: 'wear-toggle', id: 'g_chino' });
  assert.deepEqual(page.app.state().wears.map((e) => [e.date, e.garmentIds]), [[today, ['g_oxford', 'g_chino']]], 'one outfit for the day');

  const reloaded = await boot(indexedDB);
  assert.deepEqual(reloaded.app.state().wears.map((e) => e.garmentIds), [['g_oxford', 'g_chino']]);
  await reloaded.click({ action: 'wear-toggle', id: 'g_oxford' });
  assert.deepEqual(reloaded.app.state().wears.map((e) => e.garmentIds), [['g_chino']]);
});

test('an outfit worn today moves behind the others in "오늘 뭐 입지?" and says when it was worn', async () => {
  const page = await boot(await seeded());
  await page.click({ action: 'tab', tab: 'closet' });
  const before = [...page.body().matchAll(/<div class="look-title">([^<]+)</g)].map((m) => m[1]);
  assert.ok(before.length >= 2, 'the closet makes at least two ready outfits this season');
  await page.click({ action: 'open-look', index: '0' });
  assert.match(page.sheet(), /오늘 이렇게 입었어요/);
  await page.clickText('오늘 이렇게 입었어요');
  assert.match(page.toasts.at(-1), /오늘 착용 기록에 남겼어요/);
  const [wear] = page.app.state().wears;
  assert.equal(wear.date, localDate());
  assert.ok(wear.lookId, 'the outfit formula is kept with the record');
  await page.clickText('오늘 이렇게 입었어요');
  assert.match(page.toasts.at(-1), /이미 같은 옷으로 기록했어요/);
  assert.equal(page.app.state().wears.length, 1, 'a second tap does not add another record');

  await page.click({ action: 'tab', tab: 'closet' });
  const afterTitles = [...page.body().matchAll(/<div class="look-title">([^<]+)</g)].map((m) => m[1]);
  assert.notEqual(afterTitles[0], before[0], 'the outfit just worn is no longer first');
  assert.ok(afterTitles.includes(before[0]), 'it is moved back, not hidden');
  assert.match(page.body(), /최근에 입은 조합 · \d{4}-\d{2}-\d{2} 기록/);
  assert.match(page.body(), /최근 7일 안에 같은 옷끼리 입었다고 기록한 코디는 뒤로 보냈어요/);
});

test('the diary records another day with a note, refuses a future day, and deletes after a second tap', async () => {
  const page = await boot(await seeded({ wears: [entry('w_old', '2025-01-05', ['g_coat'])] }));
  await page.click({ action: 'wear-open' });
  assert.match(page.sheet(), /기록하지 않은 날을 안 입은 날로 보지 않아요/);
  assert.match(page.sheet(), /<details class="garment-name"><summary>입은 옷 기록하기/, 'with records, the form starts folded');
  assert.match(page.sheet(), /입은 옷을 골라 주세요/);
  const yesterday = localDate(new Date(Date.now() - 86400000));
  await page.input('wear-date', yesterday);
  await page.pick('g_rugby', true);
  assert.match(page.sheet(), /<details class="garment-name" open><summary>입은 옷 기록하기/, 'the form stays open while choosing');
  await page.pick('g_canvas', true);
  await page.input('wear-note', '친구 결혼식 뒤풀이');
  assert.match(page.sheet(), /2벌 기록 남기기/);
  await page.click({ action: 'wear-add' });
  assert.deepEqual(page.app.state().wears.slice(1).map((e) => [e.date, e.garmentIds, e.note]), [[yesterday, ['g_rugby', 'g_canvas'], '친구 결혼식 뒤풀이']]);
  assert.match(page.sheet(), new RegExp(`<b>${yesterday}</b><br>네이비 [^<]*럭비[^<]* \\+ 아이보리 [^<]*`));
  assert.match(page.sheet(), /최근 30일 기록 1일/);

  await page.pick('g_coat', true);
  await page.input('wear-date', localDate(new Date(Date.now() + 3 * 86400000)));
  await page.click({ action: 'wear-add' });
  assert.match(page.toasts.at(-1), /오늘이나 지난 날짜를 골라 주세요/);
  assert.doesNotMatch(page.body(), /저장 확인이 필요해요/, 'an input problem is not shown as a storage failure');
  assert.equal(page.app.state().wears.length, 2);

  const id = page.app.state().wears[1].id;
  await page.click({ action: 'wear-delete', id });
  assert.match(page.sheet(), /한 번 더 누르면 지워요/);
  assert.equal(page.app.state().wears.length, 2, 'the first tap only asks');
  await page.click({ action: 'wear-delete', id });
  assert.deepEqual(page.app.state().wears.map((e) => e.id), ['w_old']);
});

test('duplicates in the plan show which one is actually recorded as worn; the cleanup sheet removes a month of records only', async () => {
  const twin = makeGarment({ id: 'g_oxford2', slot: 'm-oxford', color: 'white', gender: 'M' });
  const indexedDB = await seeded({ garments: [...closet(), twin], wears: [
    entry('w_1', '2026-09-03', ['g_oxford', 'g_chino']), entry('w_2', '2026-09-10', ['g_oxford']), entry('w_3', '2026-10-01', ['g_rugby']),
  ] });
  const page = await boot(indexedDB);
  await page.click({ action: 'open-plan' });
  assert.match(page.sheet(), /화이트 [^:<]*옥스퍼드[^:<]*: 착용 기록 2일 · 화이트 [^:<]*옥스퍼드[^:<]*: 착용 기록 없음/);
  await page.click({ action: 'cleanup-open' });
  assert.match(page.sheet(), /착용 기록 3\/1000개/);
  assert.match(page.sheet(), /2026-09 · 2개/);
  await page.change({ action: 'cleanup-wear-toggle', month: '2026-09' }, true);
  await page.click({ action: 'cleanup-wear-delete' });
  assert.equal(page.app.state().wears.length, 3, 'the first tap only asks');
  await page.click({ action: 'cleanup-wear-delete', armed: '1' });
  assert.deepEqual(page.app.state().wears.map((e) => e.id), ['w_3']);
  assert.equal(page.app.state().garments.length, 9, 'garments are untouched');
  assert.match(page.toasts.at(-1), /착용 기록 2개를 지웠어요/);
});

test('"wore it today" on a kept purchase also lands in the diary, once per day', async () => {
  const product = SAFE_PRODUCTS.find((p) => p.slot === 'm-oxford' && p.colorSource !== 'image');
  let journey = createPurchaseJourney(candidateFromProduct(product), { id: 'j_kept', at: '2026-10-01T00:00:00.000Z' });
  for (const [action, minute, changes] of [['buy', 1], ['ordered', 2], ['received', 3, { garmentId: 'g_oxford' }], ['kept', 4]])
    journey = transitionPurchaseJourney(journey, action, { at: `2026-10-01T00:0${minute}:00.000Z`, changes });
  const page = await boot(await seeded({ journeys: [journey] }));
  await page.click({ action: 'journey-action', id: 'j_kept', step: 'worn' });
  await page.click({ action: 'journey-action', id: 'j_kept', step: 'worn' });
  const state = page.app.state();
  assert.equal(state.journeys[0].wearCount, 2, 'the purchase record counts each tap as before');
  assert.deepEqual(state.wears.map((e) => [e.date, e.garmentIds]), [[localDate(), ['g_oxford']]], 'the diary keeps one day');
});

test('a fresh outfit ranked below six recently worn ones still comes first; the notice follows the real reordering', async () => {
  // One garment for the first type and colour of every men's outfit formula: many ready outfits.
  const seen = new Map();
  for (const look of LOOKS.filter((l) => l.g === 'M'))
    for (const role of Object.values(look.roles)) {
      const key = `${role.s[0]}|${role.c[0]}`;
      if (!seen.has(key)) seen.set(key, g(role.s[0], role.c[0], `g_${seen.size}`));
    }
  const extra = { garments: [...seen.values()], styles: ['classic', 'amekaji', 'minimal'] };
  const all = closetLooks(wardrobeView({ ...personal(), ...extra }), { limit: 100 }).ready;
  assert.ok(all.length >= 7, `at least seven ready outfits this season (${all.length})`);
  const owned = (r) => r.items.filter((x) => x.owned).map((x) => x.item.id);

  const quiet = await boot(await seeded({ ...extra, wears: [entry('w_old', '2025-01-01', owned(all[0]))] }));
  await quiet.click({ action: 'tab', tab: 'closet' });
  assert.equal(/data-look-id="([^"]+)"/.exec(quiet.body())[1], all[0].look.id, 'worn long ago: order unchanged');
  assert.doesNotMatch(quiet.body(), /뒤로 보냈어요/, 'and no notice claims otherwise');

  const today = localDate();
  const busy = await boot(await seeded({ ...extra, wears: all.slice(0, 6).map((r, i) => entry(`w_${i}`, today, owned(r))) }));
  await busy.click({ action: 'tab', tab: 'closet' });
  assert.equal(/data-look-id="([^"]+)"/.exec(busy.body())[1], all[6].look.id, 'the seventh, not worn this week, comes first');
  assert.match(busy.body(), /뒤로 보냈어요/);
});

test('a backup made by the previous version (schema 5) restores over the current wardrobe with an empty diary', async () => {
  const oldStore = createWardrobeStore({ indexedDB: new IDBFactory() });
  const first = await oldStore.load();
  const { wears, offerRecords, ...v5 } = { ...personal(), schema: 5, garments: [g('m-rugby', 'navy', 'g_from_backup')] };
  await oldStore.commit(v5, first.revision, [], first.epoch);
  const backup = await oldStore.backup();
  oldStore.close();
  const page = await boot(await seeded({ wears: [entry('w_now', '2026-10-14', ['g_oxford'])] }));
  await page.app.chooseWardrobeBackup(backup);
  assert.match(page.sheet(), /백업으로 바꿀까요/);
  await page.click({ action: 'restore-backup' });
  assert.match(page.toasts.at(-1), /옷장과 사진을 복원했어요/);
  const state = page.app.state();
  assert.equal(state.schema, WARDROBE_SCHEMA);
  assert.deepEqual(state.garments.map((x) => x.id), ['g_from_backup']);
  assert.deepEqual(state.wears, [], 'the backup had no diary, so the restored wardrobe has none');
  assert.equal((await page.app.store.read()).state.schema, WARDROBE_SCHEMA);
});

test('the server stores the wear diary only from the current app version', async () => {
  const db = openDatabase(':memory:');
  const app = createApp({ db, config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none' } });
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => new Promise((resolve) => server.close(() => { db.close(); resolve(); })));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { token, json } = {}) => {
    const r = await fetch(base + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: json ? JSON.stringify(json) : undefined });
    return { status: r.status, data: await r.json() };
  };
  const { token } = (await call('POST', '/v1/auth/signup', { json: { email: 'wear@example.com', password: 'correct horse', agreements: { version: AGREEMENT_VERSION, terms: true, privacy: true, age14: true } } })).data;
  const state = personal({ wears: [entry('w_1', '2026-10-14', ['g_oxford'])] });
  assert.equal((await call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 0, state } })).status, 200);
  assert.deepEqual((await call('GET', '/v1/wardrobe', { token })).data.state.wears, state.wears);
  const { wears, offerRecords, ...old } = { ...state, schema: 5 };
  assert.equal((await call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 1, state: old } })).data.error.code, 'old-app',
    'an older app cannot overwrite the diary with a version that has none');
});
