const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const W = require('../src/wardrobe.js'), PK = require('../src/pick.js');
const html = fs.readFileSync(__dirname + '/../src/app.html', 'utf8');
const needs = fs.readFileSync(__dirname + '/../src/needs-ui.js', 'utf8');
const extract = (text, from, to) => {
  const start = text.indexOf(from), end = text.indexOf(to, start);
  assert.ok(start >= 0 && end > start, from);
  return text.slice(start, end);
};
const production = extract(html, '  function capacityCounts(', '  const newId =') + extract(html, '  function logFor(pid)', '  /** 같은 상품에 30일') +
  extract(html, '  function pickToCand(r)', '  /** 내 옷장과:') +
  extract(needs, 'async function compareNeedOffer(', 'function needOutfit(');
const PICKS = PK.cleanPicks(require('../data/picks.json'));
const descendants = (node) => [node, ...(node.children || []).flat(Infinity).filter(x => x && typeof x === 'object').flatMap(descendants)];

// Exercise the production offer card, click handler and candidate/log functions.
// DOM and persistence adapters are synthetic; this is not a browser E2E test.
function harness(query = {}, catalog = PICKS) {
  const bottom = W.cleanItem({ id: 'owned-bottom', cat: 'bottom', kind: 'denim', status: 'owned', name: '보유 데님', family: 'indigo', light: 20, formality: 1, pattern: 'solid', attrSource: 'owner-confirmed' }, 0);
  const state = { items: [bottom], pickLog: [], meta: { pickCand: 0 }, prefs: { pri: [], use: 'any' } };
  const ui = { tab: 'shop', judgeId: '' }, saved = [], toasts = [];
  const h = (type, props, ...children) => ({ type, props: props || {}, children });
  let renders = 0, ids = 0, ctx;
  ctx = vm.createContext({ state, ui, store: { recoveryByScope: new Map() }, accountScope: () => 'needs-local', PICKS: catalog, PK, W, h, scope: 'account:A',
    accountScope: () => ctx.scope,
    today: () => '2026-10-13', daysAgo: () => 0, newId: (prefix) => prefix + (++ids),
    pname: (p) => PK.pname(catalog, p), cands: () => state.items.filter(x => x.status === 'candidate'),
    pickQuery: () => ({ line: 'white-tee', ...query }), md: (date) => date,
    priceView: (r) => h('span', { text: String(r.krw) }),
    storeLink: (r, label, cls) => h('a', { href: r.product.store.url, text: label, class: cls }),
    save: async () => { saved.push(JSON.parse(JSON.stringify(state))); return true; },
    render: () => { renders++; }, toast: (text, action) => toasts.push({ text, action }) });
  vm.runInContext(production, ctx);
  return { ctx, state, ui, saved, toasts, renders: () => renders };
}

test('실제 추천 상품 버튼이 브랜드·상품명·가격·확인일·판매처를 유지하며 내 옷 비교로 이어진다', async () => {
  const t = harness(), card = t.ctx.needOfferCard({ line: 'white-tee' });
  const button = descendants(card).find(x => x.type === 'button' && x.props['data-need-offer']);
  assert.ok(button, '조건에 맞는 실제 상품 카드에 비교 버튼이 있다');
  const product = PICKS.products.find(x => x.id === button.props['data-need-offer']);
  const expected = PK.toCandidate(product, PICKS, '2026-10-13');
  await button.props.onclick();
  const candidate = t.state.items.find(x => x.status === 'candidate');
  assert.ok(candidate);
  for (const key of ['name', 'brand', 'model', 'price', 'checkedAt', 'link', 'cat', 'kind']) assert.equal(candidate[key], expected[key], key);
  assert.equal(t.ui.tab, 'judge'); assert.equal(t.ui.judgeId, candidate.id);
  assert.equal(t.state.pickLog.length, 1); assert.equal(t.state.pickLog[0].candidateId, candidate.id);
  assert.equal(t.saved.length, 1); assert.equal(t.saved[0].items[1].link, product.store.url);
  const anchor = descendants(card).find(x => x.type === 'a'); assert.equal(anchor.props.href, candidate.link);
});

test('같은 상품을 다시 비교해도 후보와 추천 기록을 중복 생성하지 않고 기존 비교를 연다', async () => {
  const t = harness(), card = t.ctx.needOfferCard({ line: 'white-tee' });
  const button = descendants(card).find(x => x.props['data-need-offer']);
  await button.props.onclick();
  const id = t.ui.judgeId;
  t.ui.tab = 'shop'; t.ui.judgeId = '';
  await button.props.onclick();
  assert.equal(t.state.items.filter(x => x.status === 'candidate').length, 1);
  assert.equal(t.state.pickLog.length, 1); assert.equal(t.state.meta.pickCand, 1);
  assert.equal(t.ui.tab, 'judge'); assert.equal(t.ui.judgeId, id); assert.equal(t.saved.length, 1);
});

test('조건에 맞는 실제 상품이 없으면 구매 링크나 비교 가능한 상품을 만들지 않는다', () => {
  const t = harness({}, { ...PICKS, products: [] }), card = t.ctx.needOfferCard({ line: 'white-tee' });
  assert.equal(descendants(card).filter(x => x.props['data-need-offer'] || x.type === 'a').length, 0);
  assert.equal(t.state.items.length, 1); assert.equal(t.state.pickLog.length, 0); assert.equal(t.saved.length, 0);
});

test('후보 등록이 거부되면 비교 화면을 열거나 다른 상품을 선택하지 않는다', async () => {
  const t = harness(); t.ctx.pickToCand = async () => false;
  const card = t.ctx.needOfferCard({ line: 'white-tee' });
  await descendants(card).find(x => x.props['data-need-offer']).props.onclick();
  assert.equal(t.ui.tab, 'shop'); assert.equal(t.ui.judgeId, '');
  assert.equal(t.state.items.length, 1); assert.equal(t.state.pickLog.length, 0); assert.equal(t.renders(), 0);
});

test('후보 저장 중 계정이 바뀌면 새 계정의 같은 상품 후보를 선택하지 않는다', async () => {
  const t = harness(); let finish;
  t.ctx.pickToCand = () => new Promise(resolve => { finish = resolve; });
  const card = t.ctx.needOfferCard({ line: 'white-tee' });
  const button = descendants(card).find(x => x.props['data-need-offer']);
  const pending = button.props.onclick();
  const product = PICKS.products.find(x => x.id === button.props['data-need-offer']);
  const candidate = { ...PK.toCandidate(product, PICKS, '2026-10-13'), id: 'new-account-candidate' };
  t.ctx.state = { items: [candidate], pickLog: [], prefs: {} }; t.ctx.scope = 'account:B';
  t.ctx.cands = () => t.ctx.state.items;
  t.ui.tab = 'closet'; t.ui.judgeId = '';
  finish(true); assert.equal(await pending, false);
  assert.equal(t.ui.tab, 'closet'); assert.equal(t.ui.judgeId, ''); assert.equal(t.renders(), 0);
});

test('후보 저장이 reject되면 성공 이동 없이 실패를 알린다', async () => {
  const t = harness(); t.ctx.pickToCand = async () => { throw new Error('synthetic persistence rejection'); };
  const card = t.ctx.needOfferCard({ line: 'white-tee' });
  assert.equal(await descendants(card).find(x => x.props['data-need-offer']).props.onclick(), false);
  assert.equal(t.ui.tab, 'shop'); assert.equal(t.ui.judgeId, ''); assert.equal(t.renders(), 0);
  assert.equal(t.toasts.length, 1); assert.match(t.toasts[0].text, /저장하지 못/);
});
