import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createMock } from '../src/core.mjs';
import { PRODUCTS } from '../src/domain/data/products.js';

function fixture() {
  const values = new Map();
  let failing = false;
  const storage = { getItem: (key) => values.get(key) ?? null, setItem(key, value) {
    if (failing) throw new Error('private browser error');
    values.set(key, value);
  } };
  const options = { storage, requireStorage: true, key: 'test', clock: () => new Date('2026-10-22T12:00:00Z') };
  return { storage, values, options, fail(value) { failing = value; }, m: createMock(options) };
}
const failed = (fn) => assert.throws(fn, (e) => e.code === 'storage_write_failed' && !e.message.includes('private browser error'));

test('failed writes preserve state, persisted bytes, version and subscribers; retries commit once', () => {
  const f = fixture(), m = f.m;
  const first = m.addGarment({ kind: 'shirt', color: 'white' });
  const product = PRODUCTS.find((p) => p.gender === 'M') || PRODUCTS[0];
  m.decide(product.id, 'buy'); m.advance(product.id, 'ordered');
  let notifications = 0;
  m.subscribe(() => notifications++);
  const before = structuredClone(m.getState()), bytes = f.values.get('test'), version = m.version();
  f.fail(true);
  for (const change of [
    () => m.addGarment({ kind: 'knit', color: 'navy' }),
    () => m.addOwnedProduct(product.id),
    () => m.updateGarment(first.id, { color: 'black' }),
    () => m.removeGarment(first.id),
    () => m.advance(product.id, 'received'),
    () => m.reset(),
  ]) {
    failed(change);
    assert.deepEqual(m.getState(), before);
    assert.equal(m.version(), version);
    assert.equal(notifications, 0);
    assert.equal(f.values.get('test'), bytes);
    assert.deepEqual(createMock(f.options).getState(), before);
  }
  f.fail(false);
  m.advance(product.id, 'received');
  assert.equal(notifications, 1);
  assert.equal(JSON.parse(f.values.get('test')).garments.length, JSON.parse(bytes).garments.length + 1);
  // ID allocation also rolls back on failure (no invisible sequence increments).
  assert.equal(JSON.parse(f.values.get('test')).seq, JSON.parse(bytes).seq + 1);
});

test('failed worn/returned transitions preserve existing purchase and wear records after reload', () => {
  const f = fixture(), id = PRODUCTS[0].id;
  f.m.decide(id, 'buy'); f.m.advance(id, 'ordered'); f.m.advance(id, 'received');
  f.m.advance(id, 'kept'); f.m.advance(id, 'worn');
  const before = structuredClone(f.m.getState()), bytes = f.values.get('test');
  f.fail(true);
  failed(() => f.m.advance(id, 'worn'));
  failed(() => f.m.advance(id, 'returned', { reason: 'size' }));
  assert.deepEqual(f.m.getState(), before);
  assert.equal(f.values.get('test'), bytes);
  assert.deepEqual(createMock(f.options).getState(), before);
});

test('search still returns results when recent-history storage fails, without leaking unsaved history', () => {
  const f = fixture();
  f.m.ask('셔츠');
  const bytes = f.values.get('test');
  f.fail(true);
  assert.ok(f.m.ask('니트'));
  assert.equal(f.values.get('test'), bytes);
  f.fail(false); f.m.setGender('M');
  assert.deepEqual(JSON.parse(f.values.get('test')).recent, JSON.parse(bytes).recent);
});

test('unavailable persistent storage rejects writes; explicit memory mode remains supported', () => {
  failed(() => createMock({ requireStorage: true }).addGarment({ kind: 'shirt' }));
  assert.equal(createMock().addGarment({ kind: 'shirt' }).kind, 'shirt');
});

test('generated browser core retains saved state when boot reset cannot be persisted', () => {
  const f = fixture(); f.m.addGarment({ kind: 'shirt' }); f.fail(true);
  const window = { localStorage: f.storage, EOUL_MOCK_KEY: 'test', location: { search: '?reset=1' }, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(new URL('../.generated/core-bundle.js', import.meta.url), 'utf8'), { window, location: window.location, URLSearchParams, structuredClone, TextEncoder, console });
  assert.equal(window.EoulMock.getState().closetCount, 1);
  assert.match(window.EoulMock.boot.storageError, /저장하지 못/);
  failed(() => window.EoulMock.addGarment({ kind: 'shirt' }));
});

test('registration metadata throws on failure, restores memory, and retries without erasing prior metadata', () => {
  const html = fs.readFileSync(new URL('../src/screen.html', import.meta.url), 'utf8');
  const source = html.slice(html.indexOf('  const REG_KEY ='), html.indexOf('  const normKey ='));
  const f = fixture();
  f.storage.setItem('eoul-d12-hang:reg', JSON.stringify({ items: { old: { brand: 'existing' } }, catalog: {} }));
  const ctx = vm.createContext({ localStorage: f.storage, structuredClone });
  vm.runInContext(source + '\nglobalThis.reg = REG; globalThis.save = saveReg;', ctx);
  const before = JSON.stringify(ctx.reg);
  ctx.reg.items.new = { brand: 'new' };
  f.fail(true);
  assert.throws(() => ctx.save(), (e) => e.code === 'registration_write_failed');
  assert.equal(JSON.stringify(ctx.reg), before);
  assert.equal(f.values.get('eoul-d12-hang:reg'), before);
  f.fail(false); ctx.reg.items.new = { brand: 'new' }; ctx.save();
  assert.equal(JSON.parse(f.values.get('eoul-d12-hang:reg')).items.old.brand, 'existing');
  assert.equal(JSON.parse(f.values.get('eoul-d12-hang:reg')).items.new.brand, 'new');
});

// 읽지 못한 기록: 빈 옷장으로 보이더라도 다음 저장이 원문을 덮어쓰면 안 된다.
const store = (init = {}) => {
  const values = new Map(Object.entries(init));
  let failWrites = false, failReads = false;
  return {
    values, failWrites: (v) => { failWrites = v; }, failReads: (v) => { failReads = v; },
    storage: {
      getItem(k) { if (failReads) throw new Error('private browser error'); return values.get(k) ?? null; },
      setItem(k, v) { if (failWrites) throw new Error('private browser error'); values.set(k, v); },
    },
  };
};
const optsFor = (storage) => ({ storage, requireStorage: true, key: 'test', clock: () => new Date('2026-10-22T12:00:00Z') });
const unreadable = (fn) => assert.throws(fn, (e) => e.code === 'storage_unreadable');
const UNREADABLE_RECORDS = {
  'future schema': JSON.stringify({ v: 2, gender: 'M', garments: [{ id: 'g1', kind: 'shirt', label: '내 셔츠' }], journeys: [] }),
  'truncated JSON': '{"v":1,"gender":"M","garments":[{"id":"g1"',
  'non-object JSON': '"text"',
};

for (const [name, raw] of Object.entries(UNREADABLE_RECORDS)) {
  test(`unreadable record (${name}) is reported and never overwritten by later writes`, () => {
    const s = store({ test: raw });
    const m = createMock(optsFor(s.storage));
    assert.equal(m.storageIssue().code, 'storage_unreadable');
    assert.equal(m.unreadableRaw(), raw);
    assert.equal(m.getState().closetCount, 0);
    const version = m.version();
    const product = PRODUCTS[0];
    for (const change of [
      () => m.addGarment({ kind: 'shirt' }),
      () => m.addOwnedProduct(product.id),
      () => m.decide(product.id, 'buy'),
      () => m.setGender('F'),
      () => m.reset(),
      () => m.clearRecent(),
    ]) unreadable(change);
    assert.ok(m.ask('셔츠')); // 검색은 계속 되지만 이력은 쓰지 않는다.
    assert.equal(s.values.get('test'), raw);
    assert.equal(m.version(), version);
    assert.equal([...s.values.keys()].join(), 'test');
  });
}

test('start fresh keeps the exact unreadable bytes in a separate key before writing a blank record', () => {
  const raw = UNREADABLE_RECORDS['future schema'];
  const s = store({ test: raw });
  const m = createMock(optsFor(s.storage));
  let notifications = 0; m.subscribe(() => notifications++);
  s.failWrites(true);
  assert.throws(() => m.startFresh(), (e) => e.code === 'storage_write_failed');
  assert.equal(s.values.get('test'), raw);
  assert.equal(m.storageIssue().code, 'storage_unreadable');
  assert.equal(notifications, 0);
  s.failWrites(false);
  const archiveKey = m.startFresh();
  assert.equal(s.values.get(archiveKey), raw);
  assert.equal(m.storageIssue(), null);
  assert.equal(JSON.parse(s.values.get('test')).v, 1);
  m.addGarment({ kind: 'shirt' });
  assert.equal(JSON.parse(s.values.get('test')).garments.length, 1);
  assert.equal(s.values.get(archiveKey), raw);
});

test('start fresh re-reads instead of overwriting when another tab changed the record meanwhile', () => {
  const raw = UNREADABLE_RECORDS['truncated JSON'];
  const s = store({ test: raw });
  const m = createMock(optsFor(s.storage));
  const fresh = JSON.stringify({ v: 1, gender: 'M', garments: [], journeys: [], trialIds: [], absences: {}, compare: [], recent: [], seq: 0 });
  s.values.set('test', fresh);
  assert.throws(() => m.startFresh(), (e) => e.code === 'storage_changed');
  assert.equal(s.values.get('test'), fresh);
  assert.equal(m.storageIssue(), null);
  assert.equal([...s.values.keys()].join(), 'test');
});

test('a failed read blocks writes even if writing would succeed', () => {
  const raw = JSON.stringify({ v: 1, gender: 'M', garments: [], journeys: [] });
  const s = store({ test: raw }); s.failReads(true);
  const m = createMock(optsFor(s.storage));
  assert.equal(m.storageIssue().code, 'storage_unavailable');
  s.failReads(false);
  failed(() => m.addGarment({ kind: 'shirt' }));
  assert.equal(s.values.get('test'), raw);
});

const bootCore = (window) => vm.runInNewContext(fs.readFileSync(new URL('../.generated/core-bundle.js', import.meta.url), 'utf8'), { window, location: window.location, URLSearchParams, structuredClone, TextEncoder, console });

test('generated core reports inaccessible storage at boot instead of looking like a new user', () => {
  const window = { get localStorage() { throw new Error('SecurityError'); }, location: { search: '' }, addEventListener() {} };
  bootCore(window);
  assert.match(window.EoulMock.boot.storageError, /저장소를 쓸 수 없어요/);
  assert.equal(window.EoulMock.storageIssue().code, 'storage_unavailable');
});

test('generated core boots with an unreadable record, reports it, and survives ?reset=1 without erasing it', () => {
  const raw = UNREADABLE_RECORDS['future schema'];
  const s = store({ test: raw });
  const listeners = [];
  const window = { localStorage: s.storage, EOUL_MOCK_KEY: 'test', location: { search: '?reset=1&g=F' }, addEventListener: (type, fn) => listeners.push([type, fn]) };
  bootCore(window);
  assert.match(window.EoulMock.boot.storageError, /읽지 못했어요/);
  assert.equal(s.values.get('test'), raw);
  // 다른 탭이 읽을 수 있는 기록을 쓰면 다시 읽고 저장 차단을 푼다.
  const valid = JSON.stringify({ v: 1, gender: 'M', garments: [], journeys: [], trialIds: [], absences: {}, compare: [], recent: [], seq: 0 });
  s.values.set('test', valid);
  for (const [type, fn] of listeners) if (type === 'storage') fn({ key: 'test' });
  assert.equal(window.EoulMock.storageIssue(), null);
  window.EoulMock.addGarment({ kind: 'shirt' });
  // 다시 읽을 수 없는 기록으로 바뀌면 저장을 멈춘다.
  s.values.set('test', raw);
  for (const [type, fn] of listeners) if (type === 'storage') fn({ key: 'test' });
  assert.throws(() => window.EoulMock.addGarment({ kind: 'knit' }), (e) => e.code === 'storage_unreadable');
  assert.equal(s.values.get('test'), raw);
});

const regContext = (s) => {
  const html = fs.readFileSync(new URL('../src/screen.html', import.meta.url), 'utf8');
  const source = html.slice(html.indexOf('  const REG_KEY ='), html.indexOf('  const normKey ='));
  const ctx = vm.createContext({ localStorage: s.storage, structuredClone });
  vm.runInContext(source + '\nglobalThis.reg = REG; globalThis.save = saveReg; globalThis.fresh = startFreshReg; globalThis.raw = () => regRaw;', ctx);
  return ctx;
};

for (const [name, raw] of Object.entries({ 'truncated JSON': '{"items":{"g_old":{"brand":"A"', 'array root': '[1,2]', 'array items': '{"items":[1],"catalog":{}}' })) {
  test(`unreadable registration metadata (${name}) is kept and only replaced after it is archived`, () => {
    const s = store({ 'eoul-d12-hang:reg': raw });
    const ctx = regContext(s);
    assert.equal(ctx.raw(), raw);
    ctx.reg.items.g_new = { brand: 'B' };
    assert.throws(() => ctx.save(), (e) => e.code === 'registration_write_failed');
    assert.equal(s.values.get('eoul-d12-hang:reg'), raw);
    assert.equal(ctx.reg.items.g_new, undefined);
    s.failWrites(true);
    assert.throws(() => ctx.fresh(), (e) => e.code === 'registration_write_failed');
    assert.equal(s.values.get('eoul-d12-hang:reg'), raw);
    s.failWrites(false);
    const archiveKey = ctx.fresh();
    assert.equal(s.values.get(archiveKey), raw);
    ctx.reg.items.g_new = { brand: 'B' }; ctx.save();
    assert.equal(JSON.parse(s.values.get('eoul-d12-hang:reg')).items.g_new.brand, 'B');
  });
}
