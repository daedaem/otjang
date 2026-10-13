// 저장소 오류를 실제 브라우저에서 주입한다. 합성 예시만 사용하며 외부 요청은 허용하지 않는다.
// 사용: CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node tools/storage-check.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, process.env.EVIDENCE || 'qa-storage'); fs.mkdirSync(evidence, { recursive: true });
const file = pathToFileURL(path.join(root, process.env.PAGE || 'dist/index.html')).href;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
const results = [], errors = [], external = [];
const check = (condition, label, detail) => {
  results.push({ pass: !!condition, label, ...(detail === undefined ? {} : { detail }) });
  console.log((condition ? 'ok ' : 'FAIL ') + label);
};
const snapshot = (page) => page.evaluate(async () => {
  const saved = await new Promise((resolve) => {
    const req = window.__app.store.db.transaction('kv').objectStore('kv').get('state');
    req.onsuccess = () => resolve(req.result || null); req.onerror = () => resolve(null);
  });
  return { idb: saved, ls: localStorage.getItem('otjang.v2'), state: window.__app.state,
    mode: window.__app.store.mode, note: document.querySelector('#saveNote').textContent, faults: window.__storageFault };
});
async function open() {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await context.addInitScript(() => {
    window.__storageFault = { idb: false, ls: false, aborts: 0, lsFailures: 0 };
    const put = IDBObjectStore.prototype.put, setItem = Storage.prototype.setItem;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === 'kv' && args[1] === 'state' && window.__storageFault.idb) {
        window.__storageFault.aborts++; this.transaction.abort();
      }
      return request;
    };
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'otjang.v2' && window.__storageFault.ls) {
        window.__storageFault.lsFailures++; throw new DOMException('test quota', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (!/^(file|data|blob):/.test(request.url())) external.push(request.url()); });
  await page.goto(file); await page.waitForFunction(() => window.__app); await page.evaluate(() => window.__app.flush());
  await page.click('#tabbtn-log');
  return { page, context };
}
async function edit(page, nickname) {
  await page.fill('#o-nick', nickname); await page.locator('#o-nick').blur();
  await page.evaluate(() => window.__app.flush());
}
async function reload(page) {
  await page.reload(); await page.waitForFunction(() => window.__app); await page.evaluate(() => window.__app.flush());
  await page.click('#tabbtn-log');
}
try {
  {
    const { page, context } = await open();
    await edit(page, '정상 저장'); const saved = await snapshot(page);
    check(JSON.parse(saved.idb).owner.nickname === '정상 저장' && saved.mode === 'idb', '정상 IndexedDB 저장');
    await reload(page); const again = await snapshot(page);
    check(again.state.owner.nickname === '정상 저장' && again.state.loadedFrom === 'idb', '정상 IndexedDB 재실행');
    const clean = await page.evaluate(() => ({ state: Object.hasOwn(window.__app.state, '_storageRevision'),
      exported: Object.hasOwn(window.Wardrobe.exportWardrobe(window.__app.state, {}), '_storageRevision'),
      sent: Object.hasOwn(window.Sync.wardrobePayload(window.__app.state, { photos: false }), '_storageRevision') }));
    check(!clean.state && !clean.exported && !clean.sent, '저장 순서 메타데이터는 상태·내보내기·서버 전송에 없음', clean);
    await context.close();
  }
  {
    const { page, context } = await open(); const before = await snapshot(page);
    await page.evaluate(() => { window.__storageFault.idb = true; });
    await edit(page, '최신 대체 저장');
    await page.click('#tabbtn-closet');
    await page.locator('#closetGrid .card').first().getByRole('button', { name: '기록', exact: true }).click();
    await page.fill('#f-name', '대체 저장한 내 옷'); await page.click('#edSave');
    await page.waitForFunction(() => !document.querySelector('#editor').open); await page.evaluate(() => window.__app.flush());
    const fallback = await snapshot(page);
    check(fallback.idb === before.idb && JSON.parse(fallback.ls).owner.nickname === '최신 대체 저장' && JSON.parse(fallback.ls).items[0].name === '대체 저장한 내 옷' && fallback.faults.aborts === 1,
      'IndexedDB 쓰기 중단 후 이전 DB를 보존하고 최신값을 localStorage에 저장');
    check(fallback.mode === 'ls' && !fallback.note.includes('저장할 수 없는'), '대체 저장 성공 시 저장소 모드 전환과 성공 안내');
    await page.screenshot({ path: path.join(evidence, 'fallback-saved.png') });
    await reload(page); const recovered = await snapshot(page);
    check(recovered.state.owner.nickname === '최신 대체 저장' && recovered.state.items[0].name === '대체 저장한 내 옷' && recovered.state.loadedFrom === 'ls2', '재실행 때 오래된 IndexedDB 대신 최신 대체 저장을 읽음');
    check(JSON.parse(recovered.idb).owner.nickname === '최신 대체 저장' && JSON.parse(recovered.idb)._storageRevision > JSON.parse(fallback.ls)._storageRevision,
      'IndexedDB 복구 후 최신 상태를 더 높은 순서로 저장');
    await edit(page, '복구 후 최신'); await reload(page); const restored = await snapshot(page);
    check(restored.state.owner.nickname === '복구 후 최신' && restored.state.loadedFrom === 'idb', '복구 후 오래된 localStorage가 최신 IndexedDB를 덮지 않음');
    await context.close();
  }
  {
    const { page, context } = await open(); const before = await snapshot(page);
    await page.evaluate(() => { window.__storageFault.idb = true; window.__storageFault.ls = true; });
    await edit(page, '저장 실패한 편집'); const failed = await snapshot(page);
    check(failed.note.includes('저장할 수 없는') && failed.faults.aborts === 1 && failed.faults.lsFailures === 1,
      '두 저장소가 모두 실패하면 저장 실패 안내');
    check(failed.idb === before.idb && failed.ls === before.ls, '두 저장소 실패가 이전 영구 기록을 바꾸지 않음');
    await page.screenshot({ path: path.join(evidence, 'both-failed.png') });
    await reload(page); const again = await snapshot(page);
    check(again.state.owner.nickname === before.state.owner.nickname, '실패한 편집을 저장 성공으로 오인해 재실행하지 않음');
    await context.close();
  }
  {
    const { page, context } = await open();
    await page.evaluate(() => {
      window.__storageFault.idb = true;
      const input = document.querySelector('#o-nick');
      for (let i = 1; i <= 8; i++) { input.value = '연속 편집 ' + i; input.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.evaluate(() => window.__app.flush()); const saved = await snapshot(page);
    check(JSON.parse(saved.ls).owner.nickname === '연속 편집 8' && saved.faults.aborts === 1, '연속 저장 큐가 마지막 편집을 남기고 flush가 전체 큐를 기다림');
    await reload(page); check((await snapshot(page)).state.owner.nickname === '연속 편집 8', '연속 편집 후 재실행도 마지막 기록 유지');
    await context.close();
  }
  {
    const { page, context } = await open(); const before = await snapshot(page);
    await page.evaluate(() => { window.__storageFault.idb = true; });
    await edit(page, '대체 저장 뒤 초기화');
    await page.click('#resetBtn'); await page.click('#resetBtn');
    await page.waitForFunction((nickname) => window.__app.state.owner.nickname === nickname, before.state.owner.nickname);
    await page.evaluate(() => window.__app.flush()); const reset = await snapshot(page);
    check(reset.idb === before.idb && JSON.parse(reset.ls).owner.nickname === before.state.owner.nickname && JSON.parse(reset.ls)._storageRevision > JSON.parse(reset.idb)._storageRevision,
      '대체 저장 초기화는 기존 저장소를 먼저 지우지 않고 더 최신 초기 snapshot을 원자적으로 남김');
    await reload(page); const again = await snapshot(page);
    check(again.state.owner.nickname === before.state.owner.nickname, '초기화 후 재실행할 때 이전 편집이 돌아오지 않음');
    await context.close();
  }
  {
    const { page, context } = await open();
    await page.evaluate(async () => {
      const app = window.__app, valid = JSON.parse(JSON.stringify(app.state)); valid.owner.nickname = '유효한 대체 기록';
      localStorage.setItem('otjang.v2', JSON.stringify({ ...valid, _storageRevision: 1 }));
      await new Promise((resolve, reject) => {
        const tx = app.store.db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(JSON.stringify({ schema: 2, items: '잘못된 파일', _storageRevision: 2 }), 'state');
        tx.oncomplete = resolve; tx.onerror = reject;
      });
    });
    await reload(page); const recovered = await snapshot(page);
    check(recovered.state.loadedFrom === 'recovery' && await page.locator('#storageRecovery').count() === 1, '최신 잘못된 IndexedDB 원문은 옛 LS로 자동 대체하지 않고 복구 화면에서 보존');
    const original = await page.evaluate(async () => { const app = window.__app; return await new Promise((resolve) => { const r = app.store.db.transaction('kv').objectStore('kv').get('state'); r.onsuccess = () => resolve(r.result); }); });
    check(JSON.parse(original)._storageRevision === 2 && JSON.parse(original).items === '잘못된 파일', '복구 화면 bootstrap 저장이 원문을 덮지 않음');
    await context.close();
  }
  check(errors.length === 0, '브라우저 JavaScript 오류 없음', errors);
  check(external.length === 0, '외부 요청 없음', external);
} catch (error) {
  check(false, '검사 실행 오류', error.stack || String(error));
} finally {
  await browser.close();
  const report = { page: file, total: results.length, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results };
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ total: report.total, passed: report.passed, failed: report.failed }));
  if (report.failed) process.exitCode = 1;
}
