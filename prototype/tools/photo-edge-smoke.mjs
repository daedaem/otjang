import { pathToFileURL } from 'node:url';

// Run against an already started local prototype server. Fixtures are generated
// inside an isolated browser context and contain no real wardrobe photographs.
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : await import('playwright');
const prototypeURL = new URL(process.env.PROTOTYPE_URL || 'http://127.0.0.1:4173/');
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage'],
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [],
  externalNetwork = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== prototypeURL.origin)
    externalNetwork.push(request.url());
});
await page.addInitScript(() => {
  const original = window.createImageBitmap.bind(window);
  window.decodeCount = 0;
  window.blockAt = Infinity;
  window.createImageBitmap = async (...args) => {
    window.decodeCount++;
    if (window.decodeCount === window.blockAt)
      await new Promise((resolve) => {
        window.releaseDecode = resolve;
        window.waitingDecode = true;
      });
    try {
      return await original(...args);
    } finally {
      window.waitingDecode = false;
      window.finishedDecode = true;
    }
  };
  window.getStored = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open('wearnext-prototype', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('wardrobe', 'readonly');
        const read = tx.objectStore('wardrobe').get('current');
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
        tx.oncomplete = () => db.close();
      };
      request.onerror = () => reject(request.error);
    });
});
const stored = () => page.evaluate(() => window.getStored());
const poll = async (fn, desc) => {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('Timed out ' + desc);
};
const click = (action) => page.locator(`[data-action="${action}"]`).first().click();
try {
  await page.goto(prototypeURL.href);
  await click('start-personal');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const c = canvas.getContext('2d');
    c.fillStyle = 'white';
    c.fillRect(0, 0, 400, 300);
    c.fillStyle = '#204499';
    c.fillRect(50, 50, 100, 180);
    c.fillStyle = '#bb3333';
    c.fillRect(250, 60, 100, 160);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const photo = {
    name: 'synthetic.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  };
  await page.evaluate(() => {
    window.blockAt = 2;
  });
  await page.locator('#photo-files').setInputFiles([photo, { ...photo, name: 'cancelled.png' }]);
  await poll(() => page.evaluate(() => window.waitingDecode === true), 'second decode blocked');
  await click('cancel-analysis');
  await page.evaluate(() => window.releaseDecode());
  await poll(async () => {
    const s = await stored();
    return s?.drafts.length === 2;
  }, 'cancel preserves finished drafts');
  assert.match(await page.locator('body').innerText(), /처리를 취소/);
  console.log('PASS UI cancellation retains two already completed drafts and reports cancellation');
  await click('upload-step');
  await page.evaluate(() => {
    window.decodeCount = 0;
    window.blockAt = 1;
    window.waitingDecode = false;
    window.finishedDecode = false;
  });
  await page.locator('#photo-files').setInputFiles(photo);
  await poll(() => page.evaluate(() => window.waitingDecode), 'reset decode blocked');
  await click('closet');
  await page.locator('a[href="#saved"]').first().click();
  await click('reset');
  await click('confirm-reset');
  await page.locator('[data-action="start-personal"]').waitFor();
  assert.equal(await stored(), undefined);
  await page.evaluate(() => window.releaseDecode());
  await poll(() => page.evaluate(() => window.finishedDecode), 'late decode completed');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await stored(), undefined);
  await page.reload();
  await page.locator('[data-action="start-personal"]').waitFor();
  console.log(
    'PASS deleting all records during blocked decode stays deleted after release and reload',
  );
  await click('start-personal');
  await click('manual');
  await page.locator('#item-form [name="name"]').fill('저장 실패 후 재시도');
  await page.evaluate(() => {
    window.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('test-full', 'QuotaExceededError');
    };
  });
  await page.locator('#item-form [type="submit"]').click();
  await poll(
    async () => /저장 공간이 부족/.test(await page.locator('#toast').textContent()),
    'quota warning',
  );
  assert.equal((await stored()).items.length, 0);
  assert.equal(await page.locator('#dialog').evaluate((e) => e.open), true);
  assert.equal(await page.locator('#item-form [name="name"]').inputValue(), '저장 실패 후 재시도');
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.originalPut;
  });
  await page.locator('#item-form [type="submit"]').click();
  await poll(async () => (await stored())?.items.length === 1, 'save retry');
  console.log('PASS quota failure retains old stored state and unsaved form; retry succeeds');
  await click('closet');
  await page.locator('a[href="#saved"]').first().click();
  const previous = await stored();
  const chooserPromise = page.waitForEvent('filechooser');
  await click('import');
  const chooser = await chooserPromise;
  const malformed = {
    ...previous,
    items: [{ ...previous.items[0], image: 'https://example.com/photo.jpg' }],
  };
  await chooser.setFiles({
    name: 'bad-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(malformed)),
  });
  await poll(
    async () => /이미지는/.test(await page.locator('#toast').textContent()),
    'invalid image rejection',
  );
  assert.ok(
    JSON.stringify(await stored()) === JSON.stringify(previous),
    'invalid import must preserve existing state',
  );
  console.log(
    'PASS invalid backup with remote image URL is rejected without overwriting existing data',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(externalNetwork, []);
  console.log(JSON.stringify({ pageErrors: errors, externalNetwork }));
} catch (error) {
  console.error(error);
  console.error((await page.locator('body').innerText()).slice(-1800));
  process.exitCode = 1;
} finally {
  await browser.close();
}
