import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-experience-test-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, toggleOwn, itemSheet, render, recommendItems, recommendLooks };\n})();',
);

// Execute the actual bundled callbacks with in-memory storage and minimal DOM stubs.
// This verifies flow and persistence, not browser layout or camera behavior.
function boot(initial = new Map()) {
  const storage = new Map(initial);
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, {
    innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; },
  }]));
  const listeners = new Map();
  const context = vm.createContext({
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener: (type, fn) => listeners.set(type, fn),
      querySelector: () => null, querySelectorAll: () => [], body: { style: {} },
    },
    window: { scrollTo() {} }, CSS: { escape: (value) => value },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  return {
    app: context.testApp, storage, nodes,
    click(dataset) { listeners.get('click')({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} }); },
    state() { return JSON.parse(JSON.stringify(context.testApp.state())); },
  };
}

test('fresh visit shows six labeled example clothes and recommendations without onboarding', () => {
  const page = boot();
  assert.equal(page.state().demo, true);
  assert.equal(page.state().owned.length, 6);
  const markup = page.nodes.get('app').innerHTML;
  assert.match(markup, /예시 옷 6벌로 바로 체험 중/);
  assert.match(markup, /오늘의 코디/);
  assert.match(markup, /예시 옷장에 더할 한 벌/);
  assert.doesNotMatch(markup, /1\. 누구의 옷을/);
  const items = page.app.recommendItems(page.app.state());
  assert.ok(items.length >= 3);
  assert.ok(items.every((item) => !page.state().owned.includes(item.slot.id)));
  assert.ok(page.app.recommendLooks(page.app.state()).some((look) => look.ownedCount >= 2));
});

test('existing personal wardrobe, preferences and saved products are preserved without sample injection', () => {
  const saved = { onboarded: true, gender: 'F', style: 'minimal', owned: ['f-denim', 'f-knit'], saved: ['ms-1115031'], hidden: [], budget: 50000 };
  const raw = JSON.stringify(saved);
  const page = boot(new Map([['eoul:v1', raw], ['eoul.mobile-preview', 'existing-other-app-data']]));
  assert.equal(page.state().demo, false);
  assert.deepEqual(page.state().owned, saved.owned);
  assert.deepEqual(page.state().saved, saved.saved);
  assert.equal(page.state().budget, 50000);
  assert.equal(page.storage.get('eoul:v1'), raw);
  assert.equal(page.storage.get('eoul.mobile-preview'), 'existing-other-app-data');
  assert.doesNotMatch(page.nodes.get('app').innerHTML, /예시 옷 6벌로/);
});

test('switching to personal mode removes example ownership and keeps the empty wardrobe after reload', () => {
  const page = boot();
  page.click({ action: 'start-personal' });
  assert.equal(page.state().demo, false);
  assert.deepEqual(page.state().owned, []);
  assert.equal(page.state().tab, 'closet');
  assert.match(page.nodes.get('app').innerHTML, /옷 추가하기/);
  const reloaded = boot(page.storage);
  assert.equal(reloaded.state().demo, false);
  assert.deepEqual(reloaded.state().owned, []);
  reloaded.click({ action: 'toggle-own', slot: 'm-chino' });
  assert.deepEqual(boot(reloaded.storage).state().owned, ['m-chino']);
});

test('demo edits remain explicitly demo after persistence and reload', () => {
  const page = boot();
  page.click({ action: 'toggle-own', slot: 'm-chino' });
  const reloaded = boot(page.storage);
  assert.equal(reloaded.state().demo, true);
  assert.equal(reloaded.state().owned.length, 5);
  assert.match(reloaded.nodes.get('app').innerHTML, /예시 옷 5벌로/);
});

test('female demo uses a distinct sample wardrobe and never injects male items', () => {
  const page = boot();
  page.click({ action: 'set-gender', g: 'F' });
  assert.equal(page.state().owned.length, 6);
  assert.ok(page.state().owned.every((id) => id.startsWith('f-')));
  assert.ok(page.app.recommendItems(page.app.state()).every((item) => item.slot.g === 'F'));
});

test('already-own action on product details cannot remove existing ownership', () => {
  const page = boot();
  page.click({ action: 'start-personal' });
  page.click({ action: 'toggle-own', slot: 'm-chino' });
  page.click({ action: 'own', slot: 'm-chino' });
  assert.deepEqual(page.state().owned, ['m-chino']);
  assert.match(page.nodes.get('toast').innerHTML, /이미 옷장에 있어요/);
});
