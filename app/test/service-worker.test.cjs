const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../web/sw.js'), 'utf8');
const scope = 'https://example.test/otjang/preview/mobile/';
const prefix = 'eoul-scope-/otjang/preview/mobile/:';
function worker() {
  const events = {}, deleted = [], opened = [];
  vm.runInNewContext(source, {
    URL,
    self: { registration: { scope }, location: { origin: 'https://example.test' }, addEventListener: (type, fn) => events[type] = fn, clients: { claim: async () => {} } },
    caches: {
      keys: async () => ['eoul-legacy', 'eoul-scope-/otjang/beta/:old', prefix + 'old', prefix + '@@VER@@'],
      delete: async key => deleted.push(key),
      open: async key => { opened.push(key); return { match: async () => 'preview-only' }; }
    },
    fetch: async () => { throw new Error('offline'); }
  });
  return { events, deleted, opened };
}
test('mobile service worker preserves other deployment caches', async () => {
  const w = worker(); let done;
  w.events.activate({ waitUntil: p => done = p }); await done;
  assert.deepEqual(w.deleted, [prefix + 'old']);
});
test('offline navigation reads only its own deployment cache', async () => {
  const w = worker(); let response;
  w.events.fetch({ request: { url: scope, method: 'GET', mode: 'navigate' }, respondWith: p => response = p });
  assert.equal(await response, 'preview-only');
  assert.deepEqual(w.opened, [prefix + '@@VER@@']);
});
test('worker leaves other paths and origins untouched', () => {
  const w = worker();
  for (const url of ['https://example.test/otjang/beta/', 'https://other.test/otjang/preview/mobile/']) {
    w.events.fetch({ request: { url, method: 'GET', mode: 'navigate' }, respondWith: () => assert.fail('intercepted unrelated URL') });
  }
});
