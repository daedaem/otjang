import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createMock } from '../../mockups/ux10v2/src/core.mjs';
import { PRODUCTS } from '../../src/data/products.js';

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
  vm.runInNewContext(fs.readFileSync(new URL('../../mockups/ux10v2/shared/eoul-mock.js', import.meta.url), 'utf8'), { window, location: window.location, URLSearchParams, structuredClone, TextEncoder, console });
  assert.equal(window.EoulMock.getState().closetCount, 1);
  assert.match(window.EoulMock.boot.storageError, /저장하지 못/);
  failed(() => window.EoulMock.addGarment({ kind: 'shirt' }));
});

test('registration metadata throws on failure, restores memory, and retries without erasing prior metadata', () => {
  const html = fs.readFileSync(new URL('../../mockups/ux10v2/links/d12-hang.html', import.meta.url), 'utf8');
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
