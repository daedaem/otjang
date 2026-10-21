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
import { createMailer } from '../../server/src/mailer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-recovery-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const script = fs.readFileSync(output, 'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { ready: appReady, linkHandled: accountLinkHandled, submitAccountForm, kickSync, account: () => account, accountForm: () => accountForm };\n})();',
);

async function startServer(mailer) {
  const db = openDatabase(':memory:');
  const app = createApp({ db, mailer, config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none' } });
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { db, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(() => { db.close(); resolve(); })) };
}
const outbox = [];
const memoryMailer = { enabled: true, kind: 'memory', publicUrl: 'https://eoul.example', send: async (m) => { outbox.push(m); } };
const server = await startServer(memoryMailer);
const offServer = await startServer(createMailer({}));
after(async () => { await server.close(); await offServer.close(); });
const linkToken = (message, purpose) => new RegExp(`#${purpose}=([A-Za-z0-9_-]+)`).exec(message.text)?.[1];

async function boot({ base = server.base, hash = '', storage = new Map() } = {}) {
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }]));
  const listeners = new Map();
  const toasts = [];
  const historyCalls = [];
  const context = vm.createContext({
    indexedDB: new IDBFactory(), Blob, crypto: globalThis.crypto, structuredClone, btoa, atob, Uint8Array, DataView, TextEncoder, TextDecoder,
    URL: class extends URL { static createObjectURL() { return 'blob:x'; } static revokeObjectURL() {} }, URLSearchParams,
    Image: class { decode() { return Promise.resolve(); } }, fetch: (url, init) => fetch(url, init),
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    location: { origin: base, search: '', pathname: '/', hash }, history: { replaceState: (...args) => historyCalls.push(args) }, navigator: {},
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
  await context.testApp.linkHandled;
  const page = {
    app: context.testApp, storage, toasts, historyCalls,
    sheet: () => nodes.get('sheet-root').innerHTML,
    async click(dataset) { for (const fn of listeners.get('click') || []) await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} }); },
    input(id, value) { for (const fn of listeners.get('input') || []) fn({ target: { id, value, dataset: {} } }); },
    async signup(email) {
      await page.click({ action: 'account-open', mode: 'signup' });
      page.input('account-email', email);
      page.input('account-password', 'correct horse');
      for (const field of ['age14', 'privacy', 'terms'])
        for (const fn of listeners.get('change') || []) await fn({ target: { id: '', checked: true, dataset: { action: 'account-check', field } } });
      await context.testApp.submitAccountForm({});
      await context.testApp.kickSync();
    },
  };
  return page;
}

test('a new account is told the email is unconfirmed; the mailed link confirms it and leaves the address bar', async () => {
  const page = await boot();
  await page.signup('verify@example.com');
  assert.equal(page.app.account().emailVerified, false);
  await page.click({ action: 'open-settings' });
  assert.match(page.sheet(), /이메일 미확인[\s\S]*data-action="verify-send"/);
  await new Promise((resolve) => setImmediate(resolve));
  const token = linkToken(outbox.findLast((m) => m.to === 'verify@example.com'), 'verify');
  assert.ok(token, 'sign-up sent the first link');

  const opened = await boot({ hash: `#verify=${token}`, storage: page.storage });
  assert.match(opened.toasts.at(-1), /이메일을 확인했어요/);
  assert.equal(opened.app.account().emailVerified, true);
  assert.deepEqual(opened.historyCalls[0], [null, '', '/'], 'the token is removed from the address');
  const again = await boot({ hash: `#verify=${token}` });
  assert.match(again.toasts.at(-1), /만료됐거나 이미 썼어요/);
});

test('a verification link for another account never marks the account signed in here', async () => {
  const first = await boot();
  await first.signup('owner-a@example.com');
  await new Promise((resolve) => setImmediate(resolve));
  const tokenA = linkToken(outbox.findLast((m) => m.to === 'owner-a@example.com'), 'verify');
  const other = await boot();
  await other.signup('owner-b@example.com');
  const opened = await boot({ hash: `#verify=${tokenA}`, storage: other.storage });
  assert.match(opened.toasts.at(-1), /이메일을 확인했어요/);
  assert.equal(opened.app.account().email, 'owner-b@example.com');
  assert.equal(opened.app.account().emailVerified, false, 'B is still unverified');
});

test('forgot password → mailed link → new password; this device signs in again with it', async () => {
  const page = await boot();
  await page.signup('reset@example.com');
  await page.click({ action: 'account-logout' });
  await page.click({ action: 'account-open', mode: 'login' });
  assert.match(page.sheet(), /data-mode="forgot">비밀번호를 잊었어요/);
  await page.click({ action: 'account-mode', mode: 'forgot' });
  await page.app.submitAccountForm({ email: { value: 'reset@example.com' } });
  assert.match(page.sheet(), /가입한 이메일이면 재설정 링크를 보냈어요/);
  await new Promise((resolve) => setImmediate(resolve));
  const token = linkToken(outbox.findLast((m) => m.to === 'reset@example.com' && /#reset=/.test(m.text)), 'reset');
  assert.ok(token);

  const opened = await boot({ hash: `#reset=${token}`, storage: page.storage });
  assert.match(opened.sheet(), /새 비밀번호 정하기/);
  await opened.app.submitAccountForm({ password: { value: 'brand new horse' } });
  assert.match(opened.toasts.at(-1), /비밀번호를 바꿨어요/);
  assert.equal(opened.app.accountForm()?.mode, 'login', 'the login sheet opens next');
  await opened.app.submitAccountForm({ email: { value: 'reset@example.com' }, password: { value: 'brand new horse' } });
  assert.equal(opened.app.account().email, 'reset@example.com');
  assert.ok(opened.app.account().token);
  assert.equal(opened.app.account().emailVerified, true, 'the mailbox was proven by the reset link');
});

test('when the server sends no mail, the app says to contact the operator', async () => {
  const page = await boot({ base: offServer.base });
  await page.click({ action: 'account-open', mode: 'login' });
  await page.click({ action: 'account-mode', mode: 'forgot' });
  await page.app.submitAccountForm({ email: { value: 'who@example.com' } });
  assert.match(page.sheet(), /운영자에게 문의/);
});
