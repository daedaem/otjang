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
import { openDatabase } from '../../server/src/db.js';
import { createApp } from '../../server/src/app.js';
import { PRODUCT_BY_ID } from '../src/engine.js';

// The policy pages, the operator section and affiliate labels, with the bundled app and a real server.
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-policy-app-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const script = fs.readFileSync(output, 'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { ready: appReady, features: accountFeatures, submitAccountForm, kickSync, state: () => state, shareDraft: () => shareDraft, communityView: () => communityView };\n})();',
);

async function serve(extra) {
  const db = openDatabase(':memory:');
  const app = createApp({ db, config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none',
    policyDir: path.join(temp, 'none'), ...extra } });
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  after(() => new Promise((resolve) => server.close(() => { db.close(); resolve(); })));
  return `http://127.0.0.1:${server.address().port}`;
}
const operated = await serve({ operator: { name: '어울 스튜디오', email: 'help@example.com', businessNumber: '123-45-67890' }, affiliateHosts: ['musinsa.com'] });
const plain = await serve({});

async function boot({ indexedDB = new IDBFactory(), storage = new Map(), at = base } = {}) {
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }]));
  const listeners = new Map();
  const toasts = [];
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob, Uint8Array, DataView, TextEncoder, TextDecoder,
    URL: class extends URL { static createObjectURL() { return 'blob:community/1'; } static revokeObjectURL() {} }, URLSearchParams,
    Image: class { decode() { return Promise.resolve(); } }, fetch: (url, init) => fetch(url, init),
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    location: { origin: at, search: '', pathname: '/', hash: '' }, history: { replaceState() {} }, navigator: {},
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      querySelector: (selector) => (selector === 'meta[name="eoul-api"]' ? { content: 'same-origin' } : null), querySelectorAll: () => [],
      visibilityState: 'visible', body: { style: {}, append() {} }, createElement: () => ({ click() {}, remove() {} }),
    },
    window: { scrollTo() {}, matchMedia: () => ({ matches: false }) }, CSS: { escape: (v) => v },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  Object.defineProperty(nodes.get('toast'), 'innerHTML', { get: () => toasts.at(-1) || '', set: (v) => toasts.push(v) });
  vm.runInContext(script, context);
  await context.testApp.ready;
  await context.testApp.features;
  const fire = async (type, target) => { for (const fn of listeners.get(type) || []) await fn({ target, preventDefault() {}, stopPropagation() {} }); };
  const page = {
    app: context.testApp, storage, toasts,
    body: () => nodes.get('app').innerHTML,
    sheet: () => nodes.get('sheet-root').innerHTML,
    click: (dataset) => fire('click', { closest: () => ({ dataset }) }),
    change: (dataset, checked) => fire('change', { id: '', checked, dataset }),
    input: (id, value) => fire('input', { id, value, dataset: {} }),
    async signup(email) {
      await page.click({ action: 'account-open', mode: 'signup' });
      await page.input('account-email', email);
      await page.input('account-password', 'correct horse');
      for (const field of ['age14', 'privacy', 'terms']) await page.change({ action: 'account-check', field }, true);
      await context.testApp.submitAccountForm({});
      await context.testApp.kickSync();
    },
  };
  return page;
}

const product = Object.values(PRODUCT_BY_ID).find((p) => /musinsa\.com/.test(p.url));

test('signed out, the operator section and policy links are in settings, and affiliate links are labelled', async () => {
  const page = await boot({ at: operated });
  await page.click({ action: 'open-settings' });
  assert.match(page.sheet(), /<h3>약관과 운영자<\/h3><p class="sub">어울 스튜디오 · help@example\.com · 사업자등록번호 123-45-67890<\/p>/);
  assert.ok(page.sheet().includes(`<a href="${operated}/privacy" target="_blank" rel="noopener">개인정보 처리방침</a>`));
  assert.ok(page.sheet().includes(`<a href="${operated}/terms" target="_blank" rel="noopener">이용약관</a>`));
  assert.match(page.sheet(), /운영자가 아직 확정하지 않은 초안이에요/, 'the repository template is still a draft');
  await page.click({ action: 'open-item', id: product.id });
  assert.match(page.sheet(), /에서 보기 [\s\S]*?<\/a><span class="affiliate-note">제휴 링크 · 이 링크로 사면 어울이 수수료를 받을 수 있어요\. 가격은 같아요\.<\/span>/);

  const other = await boot({ at: plain });
  await other.click({ action: 'open-item', id: product.id });
  assert.ok(!other.sheet().includes('affiliate-note'), 'no label when no seller pays the operator');
  await other.click({ action: 'open-settings' });
  assert.match(other.sheet(), /<h3>약관과 운영자<\/h3><p class="fine policy-links">/, 'links even before the operator is named');
});

test('sign-up shows the full documents next to the summary it asks to agree to', async () => {
  const page = await boot({ at: operated });
  await page.click({ action: 'account-open', mode: 'signup' });
  assert.match(page.sheet(), /<\/details><p class="fine policy-links">전문: <a href="[^"]+\/privacy"/);
  assert.match(page.sheet(), /비밀번호를 잊었어요"로 재설정 메일을 받을 수 있어요/);
  assert.ok(!page.sheet().includes('비밀번호 찾기는 아직 없어요'));
});
