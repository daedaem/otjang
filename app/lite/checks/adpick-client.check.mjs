import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const page = fs.readFileSync(new URL('../../mockups/ux10v2/links/d16-lens.html', import.meta.url), 'utf8');
const code = page.slice(page.indexOf('  async function searchAdpick('), page.indexOf('  async function planRakuten('));
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function ui(data) {
  const box = { isConnected: true, innerHTML: '' }, button = { disabled: false, dataset: { adpickQ: '합성 셔츠' }, closest: () => ({}) };
  const calls = [];
  const context = vm.createContext({ $, esc, window: { EOUL_ADPICK: async (q) => { calls.push(q); if (data instanceof Error) throw data; return data; }, EOUL_SERVER_AI() { throw Error('Product data must not reach AI'); } } });
  function $(selector) { return selector === '[data-adpick-keyword]' ? { value: '합성 셔츠' } : box; }
  vm.runInContext(code, context);
  return { box, button, calls, run: () => context.searchAdpick(button) };
}
test('Adpick UI keeps provider order, original KRW strings and affiliate disclosure before links without AI or storage', async () => {
  const h = ui({ fetchedAt: '2026-10-21', items: [
    { name: '<합성 첫 상품>', shop: '합성몰', price: '29,900원', image: null, url: 'https://link.adpick.co.kr/synthetic-a' },
    { name: '합성 두 번째 상품', shop: '합성몰', price: '15,000원', image: null, url: 'https://link.adpick.co.kr/synthetic-b' },
  ] });
  await h.run();
  assert.deepEqual(h.calls, ['합성 셔츠']);
  assert.equal(h.button.disabled, false);
  assert.ok(h.box.innerHTML.indexOf('수수료가 지급될 수 있습니다') < h.box.innerHTML.indexOf('<a '));
  assert.ok(h.box.innerHTML.indexOf('synthetic-a') < h.box.innerHTML.indexOf('synthetic-b'));
  assert.match(h.box.innerHTML, /&lt;합성 첫 상품&gt;/);
  assert.match(h.box.innerHTML, /29,900원/);
  assert.match(h.box.innerHTML, /noopener noreferrer sponsored/);
  assert.match(h.box.innerHTML, /가격은 참고값/);
});
test('empty, omitted and failed supplier responses remain different states with no replacement products', async () => {
  for (const [data, expected] of [
    [{ items: [], omitted: 0 }, /상품이 없어요/],
    [{ items: [], omitted: 2 }, /필수 정보를 확인할 수 없어/],
    [Error('연결 준비 중이에요.'), /연결 준비 중이에요/],
  ]) {
    const h = ui(data); await h.run();
    assert.match(h.box.innerHTML, expected);
    assert.doesNotMatch(h.box.innerHTML, /<a /);
    assert.equal(h.button.disabled, false);
  }
});
test('Adpick browser connector calls only the same-origin endpoint with a keyword, and resumes existing owner login on 401', async () => {
  const lite = fs.readFileSync(new URL('../src/lite.js', import.meta.url), 'utf8');
  const source = lite.slice(0, lite.indexOf('  // 사용자 등록 카탈로그')) + '\n})();';
  const calls = [], redirects = [];
  let status = 200;
  const context = vm.createContext({ window: { location: { replace: (url) => redirects.push(url) } }, AbortController, AbortSignal, setTimeout, clearTimeout,
    fetch: async (url, init) => { calls.push({ url, init }); return status === 200 ? Response.json({ items: [] }) : Response.json({ login: '/_private/login', message: '본인 로그인이 필요해요.' }, { status }); },
  });
  vm.runInContext(source, context);
  await context.window.EOUL_ADPICK('옥스포드 셔츠');
  assert.equal(calls[0].url, `/api/adpick?q=${encodeURIComponent('옥스포드 셔츠')}`);
  assert.equal(calls[0].init.body, undefined);
  assert.equal(Object.hasOwn(calls[0].init, 'headers'), false);
  status = 401;
  await assert.rejects(context.window.EOUL_ADPICK('옥스포드 셔츠'), /본인 로그인/);
  assert.deepEqual(redirects, ['/_private/login']);
});

test('submitted search panels start automatically once and stale responses cannot update a detached result', async () => {
  let finish;
  const box = { isConnected: true, innerHTML: '' };
  const panel = { dataset: { adpickQ: '합성 셔츠' }, hasAttribute: () => true };
  const calls = [];
  const context = vm.createContext({ esc, $: () => box, $$: () => [panel], window: { EOUL_ADPICK: async (q) => {
    calls.push(q); return new Promise((resolve) => { finish = resolve; });
  } } });
  vm.runInContext(page.slice(page.indexOf('  function autoDomesticSearch('), page.indexOf('  async function recommendOpenProducts(')) + code, context);
  context.autoDomesticSearch({}); context.autoDomesticSearch({});
  assert.deepEqual(calls, ['합성 셔츠']);
  const loading = box.innerHTML;
  box.isConnected = false;
  finish({ items: [{ name: 'old response' }], omitted: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(box.innerHTML, loading);
});

test('concurrent identical searches share only the in-flight request; completed offers are not persisted', async () => {
  const lite = fs.readFileSync(new URL('../src/lite.js', import.meta.url), 'utf8');
  const source = lite.slice(0, lite.indexOf('  // 사용자 등록 카탈로그')) + '\n})();';
  let calls = 0, finish;
  const context = vm.createContext({ window: {}, AbortController, AbortSignal, setTimeout, clearTimeout,
    fetch: async () => { calls++; return new Promise((resolve) => { finish = () => resolve(Response.json({ items: [] })); }); },
  });
  vm.runInContext(source, context);
  const one = context.window.EOUL_ADPICK('합성 셔츠'), two = context.window.EOUL_ADPICK('합성 셔츠');
  assert.equal(calls, 1); finish(); await Promise.all([one, two]);
  const next = context.window.EOUL_ADPICK('합성 셔츠');
  assert.equal(calls, 2); finish(); await next;
});
