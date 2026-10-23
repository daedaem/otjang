import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';

// Design-comparison builds (--theme): the same bundled app under another name,
// look and judgment summary. The default build must stay unchanged.
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-theme-test-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const themes = fs.readdirSync(path.join(root, 'themes')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();

function build(theme) {
  const output = path.join(temp, `${theme || 'base'}.html`);
  execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output, ...(theme ? ['--theme', theme] : [])]);
  return fs.readFileSync(output, 'utf8');
}

async function boot(html) {
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
    /\n\}\)\(\);\s*$/,
    '\nglobalThis.testApp = { ready: appReady, set, state: () => state, BRAND, themeVerdict, demoThemeVerdict, demoFor, stylesFor, renderHome, renderCloset, renderSaved, stampLedger, journey: (product, decision) => transitionPurchaseJourney(createPurchaseJourney(candidateFromProduct(product)), decision), product: (id) => PRODUCT_BY_ID[id], products: () => Object.values(PRODUCT_BY_ID) };\n})();',
  );
  const storage = new Map();
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }]));
  const context = vm.createContext({
    indexedDB: new IDBFactory(), Blob, crypto: globalThis.crypto, structuredClone, btoa, atob, Uint8Array, DataView, TextEncoder, TextDecoder,
    URL: class extends URL { static createObjectURL() { return 'blob:theme/1'; } static revokeObjectURL() {} }, URLSearchParams,
    Image: class { decode() { return Promise.resolve(); } },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    location: { origin: 'http://localhost', search: '', pathname: '/', hash: '' }, history: { replaceState() {} }, navigator: {},
    document: {
      getElementById: (id) => nodes.get(id) ?? null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
      visibilityState: 'visible', body: { style: {}, append() {} }, createElement: () => ({ click() {}, remove() {} }),
    },
    window: { scrollTo() {}, matchMedia: () => ({ matches: false }) }, CSS: { escape: (v) => v },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  await context.testApp.ready;
  return context.testApp;
}

async function onExampleCloset(app) {
  const styles = app.stylesFor('M').slice(0, 1);
  await app.set({ onboarded: true, gender: 'M', styles, demo: true, demoSelected: app.demoFor('M', styles) });
  assert.ok(app.state().demoSelected.length > 0);
  return app.products().find((p) => p.slot.startsWith('m-') && p.color);
}

test('the default build keeps its own name and shows no theme summary', async () => {
  const html = build();
  assert.doesNotMatch(html, /\/\* ── theme:/);
  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  const app = await boot(html);
  assert.equal(app.BRAND.name, '어울');
  assert.equal(app.BRAND.stamps, null);
  assert.equal(app.BRAND.deck, false);
  const product = await onExampleCloset(app);
  assert.equal(app.demoThemeVerdict(product), '');
  assert.doesNotMatch(app.renderHome(), /class="deck"/);
  assert.doesNotMatch(app.renderCloset(), /class="wardrobe/);
  await app.set({ demo: false, demoSelected: [], journeys: [app.journey(product, 'skip')] });
  assert.equal(app.stampLedger(), '');
  assert.doesNotMatch(app.renderSaved(), /stamp-mark/);
});

for (const id of themes) {
  test(`theme ${id}: name, fonts, styles and a working judgment summary`, async () => {
    const theme = JSON.parse(fs.readFileSync(path.join(root, 'themes', `${id}.json`), 'utf8'));
    assert.ok(fs.existsSync(path.join(root, 'themes', `${id}.css`)));
    const html = build(id);
    assert.match(html, new RegExp(`<title>${theme.brand.name} · `));
    assert.match(html, new RegExp(`/\\* ── theme: ${id} \\*/`));
    if (theme.fonts) assert.ok(html.includes(theme.fonts));
    if (theme.themeColor) assert.deepEqual(html.match(/<meta name="theme-color"[^>]*>/g), [`<meta name="theme-color" content="${theme.themeColor}">`]);
    assert.ok(html.indexOf('<meta charset="utf-8">') < html.indexOf('<link rel="stylesheet"'));
    assert.doesNotMatch(html, /\bexport (const|function)\b|^import /m);

    const app = await boot(html);
    assert.deepEqual(JSON.parse(JSON.stringify(app.BRAND)), theme.brand);
    const product = await onExampleCloset(app);
    const summary = app.demoThemeVerdict(product);
    assert.match(summary, /class="tv tv-stamp"/);
    assert.match(summary, new RegExp(`class="tv-seal tv-(buy|hold)" aria-hidden="true">(${theme.brand.stamps.buy}|${theme.brand.stamps.hold})<`));
    assert.match(summary, /예시 옷장으로 본 모습이에요/);
    assert.doesNotMatch(summary, /undefined|NaN|\[object /);

    // Home leads with the stamp deck; the closet is a room with racks.
    const home = app.renderHome();
    assert.equal(/class="deck"/.test(home), !!theme.brand.deck);
    if (theme.brand.deck) assert.match(home, /오늘의 판정 <span class="deck-count">1 \/ \d+<\/span>/);
    const closet = app.renderCloset();
    assert.equal(/class="wardrobe wardrobe-opening"/.test(closet), !!theme.brand.wardrobe);
    if (theme.brand.wardrobe) {
      assert.match(closet, /class="rack rack-hang"/);
      assert.doesNotMatch(app.renderCloset(), /wardrobe-opening/, 'the doors open once per visit');
    }
    // My own decisions become stamps and add up in the 도장 수첩.
    const other = app.products().find((p) => p.id !== product.id && p.slot.startsWith('m-') && p.price);
    await app.set({ demo: false, demoSelected: [], journeys: [app.journey(product, 'buy'), app.journey(other, 'skip')] });
    const ledger = app.stampLedger();
    assert.match(ledger, new RegExp(`<span class="stamp-word">${theme.brand.stamps.skip}</span><b>1</b>`));
    assert.match(ledger, new RegExp(`${other.price.toLocaleString('ko-KR')}`));
    assert.match(app.renderSaved(), new RegExp(`class="stamp-mark stamp-skip" aria-hidden="true">${theme.brand.stamps.skip}<`));
  });
}
