import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function worker({ response, offline = false } = {}) {
  const handlers = {}, puts = [], waits = [], matches = [];
  const original = new Response('<html><head></head><body>cached-app</body></html>', { headers: { 'content-type': 'text/html' } });
  const cache = { addAll: async () => {}, put: async (key) => puts.push(key), match: async () => original.clone() };
  const context = vm.createContext({
    URL, Response, Headers,
    fetch: async () => { if (offline) throw Error('offline'); return response.clone(); },
    caches: {
      open: async () => cache,
      match: async (request) => { matches.push(request); return new Response('foreign-cache'); },
      keys: async () => [], delete: async () => true,
    },
    self: { location: { origin: 'https://app.test' }, clients: { claim: async () => {} }, skipWaiting: async () => {}, addEventListener: (name, handler) => { handlers[name] = handler; } },
  });
  const code = fs.readFileSync(new URL('../src/sw.js', import.meta.url), 'utf8').replace('= __SHELL__;', '= [];');
  vm.runInContext(code, context);
  const get = async (path, mode = 'navigate') => {
    let output;
    handlers.fetch({ request: { method: 'GET', url: 'https://app.test' + path, mode }, respondWith: (value) => { output = value; }, waitUntil: (value) => waits.push(value) });
    const result = output ? await output : null;
    await Promise.all(waits);
    return result;
  };
  return { get, puts, matches };
}

test('account, login, API and public-community documents bypass the app shell cache', async () => {
  const w = worker({ response: new Response('auth') });
  for (const path of ['/_member/signin', '/_member/signup', '/_private/login', '/_private/status', '/api/community/photo/id', '/c', '/c/']) {
    assert.equal(await w.get(path), null, path);
  }
  assert.deepEqual(w.puts, []);
  assert.deepEqual(w.matches, []);
});
test('a followed login redirect is never saved as the offline app', async () => {
  const response = new Response('<form>login</form>', { headers: { 'content-type': 'text/html' } });
  Object.defineProperty(response, 'clone', { value: () => { const copy = new Response('<form>login</form>', { headers: { 'content-type': 'text/html' } }); Object.defineProperty(copy, 'redirected', { value: true }); return copy; } });
  const w = worker({ response });
  assert.equal((await w.get('/')).status, 200);
  assert.deepEqual(w.puts, []);
});
test('a successful non-HTML response cannot replace the offline app shell', async () => {
  const w = worker({ response: Response.json({ status: 'not-an-app' }) });
  await w.get('/');
  assert.deepEqual(w.puts, []);
});
test('offline navigation uses this worker\'s app cache and marks the cached document', async () => {
  const w = worker({ offline: true });
  const result = await w.get('/');
  const html = await result.text();
  assert.match(html, /cached-app/);
  assert.match(html, /name="hangit-offline" content="1"/);
  assert.doesNotMatch(html, /foreign-cache/);
});
test('normal authenticated HTML still refreshes the offline app shell', async () => {
  const w = worker({ response: new Response('<html><head></head><body>app</body></html>', { headers: { 'content-type': 'text/html' } }) });
  assert.equal((await w.get('/')).status, 200);
  assert.deepEqual(w.puts, ['/']);
});
