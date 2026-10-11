import { pathToFileURL } from 'node:url';

// Run against an already started local prototype server. Fixtures are generated
// inside an isolated browser context and contain no real wardrobe photographs.
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : await import('playwright');
const prototypeURL = new URL(process.env.PROTOTYPE_URL || 'http://127.0.0.1:4173/');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage'],
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const pageErrors = [],
  network = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('request', (request) => {
  if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== prototypeURL.origin)
    network.push(request.url());
});
await page.addInitScript(() => {
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
const state = () => page.evaluate(() => window.getStored());
const wait = async (predicate, arg) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const data = await state();
    if (data && predicate(data, arg)) return data;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('state wait timed out: ' + predicate.toString());
};
const click = (action) => page.locator(`[data-action="${action}"]`).first().click();
try {
  await page.goto(prototypeURL.href);
  await click('start-personal');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = '#224499';
    ctx.fillRect(50, 80, 140, 200);
    ctx.fillRect(25, 80, 190, 50);
    ctx.fillStyle = '#bb2828';
    ctx.fillRect(375, 90, 125, 190);
    ctx.fillRect(350, 90, 175, 45);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const upload = {
    name: 'two-garments.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  };
  await page.locator('#photo-files').setInputFiles([upload, { ...upload, name: 'same-photo.png' }]);
  let stored = await wait((s) => s.drafts.length === 4);
  assert.equal(stored.drafts.filter((d) => d.selected !== false).length, 2);
  const [first, second, third] = stored.drafts.map((d) => d.id);
  console.log(
    'PASS photo upload -> four drafts, two duplicate warnings and two default selections',
  );
  const xss = '<img src=x onerror="window.XSS_RAN=1">';
  await page.locator(`[data-draft-field="name"][data-id="${first}"]`).fill(xss);
  await page.locator(`[data-draft-field="name"][data-id="${first}"]`).press('Tab');
  await wait((s, arg) => s.drafts[0].name === arg, xss);
  await page.locator(`[data-draft-field="category"][data-id="${first}"]`).selectOption('top');
  await wait((s) => s.drafts[0].category === 'top');
  assert.equal(await page.evaluate(() => window.XSS_RAN), undefined);
  console.log('PASS draft name XSS escaped and classification persists');
  await page.locator(`[data-action="crop-draft"][data-id="${first}"]`).click();
  for (const [name, value] of Object.entries({ x: 0, y: 0, width: 45, height: 100 }))
    await page.locator(`#crop-form [name="${name}"]`).evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, String(value));
  await page.locator('#crop-form button[type="submit"]').click();
  await wait((s) => s.drafts[0].region.width === 0.45);
  assert.equal(await page.locator('#dialog').evaluate((el) => el.open), false);
  console.log('PASS manual crop saved normalized bounds');
  await page.locator(`[data-draft-select="${second}"]`).uncheck();
  await wait((s, id) => s.drafts.find((d) => d.id === id).selected === false, second);
  await page.locator(`[data-draft-select="${third}"]`).check();
  await wait((s, id) => s.drafts.find((d) => d.id === id).selected === true, third);
  await click('merge-drafts');
  await click('confirm-merge');
  stored = await wait((s) => s.drafts.length === 3);
  assert.equal(stored.drafts[0].mergedImages.length, 1);
  await click('undo-merge');
  stored = await wait((s) => s.drafts.length === 4);
  assert.equal(stored.drafts[0].region.width, 0.45);
  assert.equal(stored.drafts[0].name, xss);
  console.log('PASS duplicate merge and undo preserves earlier crop and edit');
  await page.locator(`[data-draft-select="${third}"]`).uncheck();
  await wait((s, id) => s.drafts.find((d) => d.id === id).selected === false, third);
  await click('confirm-drafts');
  stored = await wait((s) => s.items.length === 1 && s.drafts.length === 3);
  await page.locator('#profile-form button[type="submit"]').click();
  await page.waitForURL((url) => url.hash === '#closet');
  await page.reload();
  await page.locator('.garment-card').first().waitFor();
  stored = await state();
  assert.equal(stored.items.length, 1);
  assert.equal(stored.drafts.length, 3);
  assert.equal(stored.items[0].name, xss);
  assert.equal(await page.evaluate(() => window.XSS_RAN), undefined);
  console.log(
    'PASS partial confirmation -> personal wardrobe -> reload retains one item and three drafts',
  );
  await page.goto(new URL('#saved', prototypeURL).href);
  const downloadPromise = page.waitForEvent('download');
  await click('export');
  const downloaded = await downloadPromise;
  const exported = await fs.readFile(await downloaded.path(), 'utf8');
  const backup = JSON.parse(exported);
  assert.equal(backup.state.items.length, 1);
  assert.equal(backup.state.drafts.length, 3);
  assert.ok(backup.state.items[0].image.startsWith('data:image/jpeg;'));
  console.log('PASS photo-inclusive backup exported actual state');
  await click('reset');
  await click('confirm-reset');
  await page.locator('[data-action="start-personal"]').waitFor();
  assert.equal(await state(), undefined);
  await click('start-personal');
  await click('closet');
  await page.goto(new URL('#saved', prototypeURL).href);
  const chooserPromise = page.waitForEvent('filechooser');
  await click('import');
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'roundtrip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exported),
  });
  await page.locator('[data-action="confirm-import"]').waitFor();
  await click('confirm-import');
  stored = await wait((s) => s.items.length === 1 && s.drafts.length === 3);
  assert.ok(
    JSON.stringify(stored) === JSON.stringify(backup.state),
    'restored backup must match all saved state',
  );
  console.log('PASS backup reset/import roundtrip retains exact state, photos and edits');
  await page.goto(new URL('#saved', prototypeURL).href);
  const noPhotosPromise = page.waitForEvent('download');
  await click('export-no-images');
  const noPhotosDownload = await noPhotosPromise;
  const stripped = await fs.readFile(await noPhotosDownload.path(), 'utf8');
  assert.ok(!stripped.includes('data:image/'));
  console.log('PASS no-photo export strips all image data');
  console.log(JSON.stringify({ pageErrors, externalNetwork: network }));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(network, []);
} catch (error) {
  console.error(error);
  console.error('URL', page.url());
  console.error((await page.locator('body').innerText()).slice(-3000));
  process.exitCode = 1;
} finally {
  await browser.close();
}
