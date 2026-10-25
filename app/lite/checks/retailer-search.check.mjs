// No live model, supplier request or user storage: exercise the UI confirmation boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const page = fs.readFileSync(new URL('../src/screen.html', import.meta.url), 'utf8');
const code = page.slice(page.indexOf('  async function planRakuten('), page.indexOf('  // 설치 앱이 공용 목록'));
function harness(plan) {
  const box = { innerHTML: '', isConnected: true }, results = { innerHTML: '', isConnected: true };
  const input = { value: 'リーバイス 501' }, panel = {}, calls = [], lookups = [];
  const button = (confirmed = false) => ({ disabled: false, dataset: { rakutenQ: '리바이스 501 청바지' }, closest: () => panel, hasAttribute: () => confirmed });
  const context = vm.createContext({
    window: {
      EOUL_SERVER_AI: async (request) => { calls.push(JSON.parse(JSON.stringify(request))); return typeof plan === 'function' ? plan() : plan; },
      EOUL_RAKUTEN: async (q) => { lookups.push(q); return { fetchedAt: '2026-10-21', items: [{ name: 'Original <title>', shop: 'Original shop', url: 'https://item.rakuten.co.jp/synthetic/item/', image: null, price: 12000, currency: 'JPY' }] }; },
    },
    $: (selector) => ({ '[data-rakuten-plan-result]': box, '[data-rakuten-results]': results, '[data-rakuten-keyword]': input })[selector],
    esc: (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
  });
  vm.runInContext(code, context);
  return { context, box, results, input, calls, lookups, button };
}
test('AI search proposal is separate from supplier lookup and requires a second explicit action', async () => {
  const h = harness({ on_topic: true, keyword: 'リーバイス 501', notes: ['예산 조건은 적용하지 않아요.'] });
  const first = h.button();
  await h.context.planRakuten(first);
  assert.equal(first.disabled, false);
  assert.deepEqual(h.calls, [{ task: 'retailer_search', query: '리바이스 501 청바지' }]);
  assert.deepEqual(h.lookups, []);
  assert.match(h.box.innerHTML, /이 검색어로 찾아보기/);
  assert.match(h.box.innerHTML, /예산·핏·코디 조건은 적용하지 않아요/);
  h.input.value = 'LEVI\'S 501';
  await h.context.searchRakuten(h.button(true));
  assert.deepEqual(h.lookups, ['LEVI\'S 501']);
  assert.equal(h.calls.length, 1);
  assert.match(h.results.innerHTML, /AI 추천 순위 아님/);
  assert.match(h.results.innerHTML, /Original &lt;title&gt;/);
  assert.match(h.results.innerHTML, /12,000 JPY/);
});
test('wrong topics, errors and detached views never trigger automatic retailer lookup', async () => {
  for (const response of [{ on_topic: false }, { on_topic: true }]) {
    const h = harness(response);
    await h.context.planRakuten(h.button());
    assert.equal(h.lookups.length, 0);
    assert.doesNotMatch(h.box.innerHTML, /이 검색어로 찾아보기/);
  }
  const h = harness(() => { h.box.isConnected = false; return { on_topic: true, keyword: 'Levis', notes: [] }; });
  await h.context.planRakuten(h.button());
  assert.equal(h.lookups.length, 0);
  assert.doesNotMatch(h.box.innerHTML, /이 검색어로 찾아보기/);
});
