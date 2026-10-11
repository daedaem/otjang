import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createState, serializeBackup } from '../src/model.js';

// Real renderer and visible controls: these checks guard against replacing the
// canvas on every IndexedDB save, and against retaining stale item bindings.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const url = new URL(process.env.PROTOTYPE_URL || 'http://127.0.0.1:4173/');
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let checks = 0;
const ok = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS', label); };
const snapshot = page => page.evaluate(() => window.__wearnext.roomSnapshot());
const click = (page, action, id) => page.locator(`[data-action="${action}"]${id ? `[data-id="${id}"]` : ''}:visible`).first().click();
const ready = page => page.waitForFunction(() => window.__wearnext?.roomSnapshot().ready,
  null, { timeout: 120000 });
const sameCanvas = page => page.evaluate(() => window.__persistentCanvas === document.querySelector('#room-canvas'));
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
const saveItem = async (page, id, change) => {
  await click(page, 'edit-item', id);
  await change();
  await page.click('#item-form [type="submit"]');
  await page.waitForFunction(() => !document.querySelector('#dialog').open);
};

try {
  for (const [mode, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]
    .filter(value => !process.env.VIEWPORT || value[0] === process.env.VIEWPORT)) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== url.origin)
        external.push(request.url());
    });
    await page.goto(url.href);
    await click(page, 'start-demo');
    await ready(page);
    await page.evaluate(() => { window.__persistentCanvas = document.querySelector('#room-canvas'); });
    const initial = await snapshot(page);
    const id = 'demo-shirt-blue';
    await click(page, 'room-item', id);
    await page.waitForFunction(id => window.__wearnext.roomSnapshot().selectedId === id, id);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__wearnext.roomSnapshot().selectedId === null);
    ok((await snapshot(page)).view === 'room' && await page.evaluate(id =>
      document.activeElement?.dataset.action === 'room-item' && document.activeElement?.dataset.id === id, id),
    `${mode}: Escape closes inspection and restores focus to the original item selector`);
    await click(page, 'room-item', id);
    await page.waitForFunction(id => window.__wearnext.roomSnapshot().selectedId === id, id);
    // Selection hides the mobile dock, so wait for ResizeObserver and the
    // renderer to agree on its new canvas bounds before using projection data.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const tapSelected = await snapshot(page);
    const tapBounds = tapSelected.slots.find(slot => slot.itemId === id).bounds;
    const emptyCanvas = await page.locator('#room-canvas').boundingBox();
    await page.mouse.click(emptyCanvas.x + (tapBounds.left + tapBounds.right) / 2,
      emptyCanvas.y + (tapBounds.top + tapBounds.bottom) / 2);
    const afterClothTap = await snapshot(page);
    ok(afterClothTap.selectedId === id && afterClothTap.view === 'detail'
      && await page.locator('#room-inspector .room-detail').count() === 1,
    `${mode}: clicking the selected garment keeps inspection open rather than treating cloth as empty space`);
    // This far-left region lies outside the selected garment and all DOM
    // controls. A real canvas click exercises hit testing and onDeselect.
    await page.mouse.click(emptyCanvas.x + 8, emptyCanvas.y + emptyCanvas.height * .25);
    await page.waitForFunction(() => window.__wearnext.roomSnapshot().selectedId === null);
    ok((await snapshot(page)).view === 'room' && await page.locator('#room-inspector .room-detail').count() === 0,
      `${mode}: clicking empty canvas space returns the garment and closes its details`);
    await click(page, 'room-item', id);
    await page.waitForFunction(id => window.__wearnext.roomSnapshot().selectedId === id, id);
    const selected = await snapshot(page);
    const slot = selected.slots.find(slot => slot.itemId === id);
    const canvas = await page.locator('#room-canvas').boundingBox();
    const dragX = canvas.x + (slot.bounds.left + slot.bounds.right) / 2;
    const dragY = canvas.y + (slot.bounds.top + slot.bounds.bottom) / 2;
    await page.mouse.move(dragX, dragY);
    await page.mouse.down();
    await page.mouse.move(dragX + 80, dragY, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => Math.abs(window.__wearnext.roomSnapshot().rotation) > .1);
    const turned = await snapshot(page);
    ok(turned.view === 'detail' && turned.selectedId === id,
      `${mode}: dragging rotates the garment while keeping its inspection open`);

    const name = '나의 셔츠 <b>직접 기록</b>';
    await saveItem(page, id, () => page.fill('#item-form [name="name"]', name));
    const renamed = await snapshot(page);
    ok(await sameCanvas(page) && renamed.generation === initial.generation,
      `${mode}: saving a name preserves the canvas and renderer generation`);
    ok(renamed.itemUpdates === initial.itemUpdates,
      `${mode}: a name with an explicit kind does not rebind geometry`);
    ok(Math.abs(renamed.rotation - turned.rotation) < .0001
      && distance(renamed.camera.position, turned.camera.position) < .0001,
    `${mode}: saving metadata preserves garment rotation and camera`);
    ok((await page.locator('#room-inspector').innerText()).includes(name)
      && (await page.locator(`.room-item[data-id="${id}"]`).innerText()).includes(name)
      && await page.locator('#room-inspector h2 b').count() === 0,
    `${mode}: refreshed detail and selector display the saved name as text`);

    await saveItem(page, id, () => page.selectOption('#item-form [name="color"]', 'pink'));
    const recolored = await snapshot(page);
    const recoloredSlot = recolored.slots.find(slot => slot.itemId === id);
    ok(await sameCanvas(page) && recolored.generation === initial.generation
      && recolored.itemUpdates === renamed.itemUpdates + 1,
    `${mode}: recoloring updates item bindings once without restarting the renderer`);
    ok(recoloredSlot.slotKey === slot.slotKey && Math.abs(recolored.rotation - turned.rotation) < .0001,
      `${mode}: recoloring preserves the selected item's location and rotation`);
    ok(recoloredSlot.materials.some((material, index) => material.color !== slot.materials[index].color),
      `${mode}: the retained renderer displays the new material color`);

    await saveItem(page, id, () => page.uncheck('#item-form [name="available"]'));
    const unavailable = await snapshot(page);
    ok(await sameCanvas(page) && unavailable.generation === initial.generation
      && !unavailable.slots.some(slot => slot.itemId === id) && unavailable.view === 'room',
    `${mode}: excluding a selected item hides its mesh and releases the detail camera`);
    ok((await page.locator('#room-inspector').innerText()).includes('오늘의 코디에서 제외 중'),
      `${mode}: the retained record explains why its mesh is hidden`);
    await saveItem(page, id, () => page.check('#item-form [name="available"]'));
    const available = await snapshot(page);
    ok(await sameCanvas(page) && available.slots.some(slot => slot.itemId === id) && available.view === 'detail',
      `${mode}: restoring availability rebinds and focuses the same record`);

    await saveItem(page, id, () => page.selectOption('#item-form [name="kind"]', 'sweatshirt'));
    const unsupported = await snapshot(page);
    ok(await sameCanvas(page) && unsupported.view === 'room' && unsupported.unplacedIds.includes(id)
      && (await page.locator('#room-inspector').innerText()).includes('이 공간에 놓이지 않은 옷'),
    `${mode}: changing to an unsupported kind releases the camera and keeps the record available`);
    await saveItem(page, id, () => page.selectOption('#item-form [name="kind"]', 'shirt'));
    ok((await snapshot(page)).view === 'detail' && await sameCanvas(page),
      `${mode}: changing back to a supported kind restores its focused geometry`);

    // Import through the room's settings dialog rather than changing routes:
    // a whole wardrobe replacement must clear selection and old demo meshes.
    const replacement = createState('personal');
    replacement.onboarded = true;
    replacement.items = [{ id: 'import-shirt', name: '백업에서 불러온 셔츠', kind: 'shirt',
      category: 'top', color: 'white', available: true, source: 'manual', confirmed: true,
      attributesConfirmed: true, pattern: 'solid', brand: '' }];
    await click(page, 'profile');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click(page, 'import')]);
    await chooser.setFiles({ name: 'persistent-room-synthetic.json', mimeType: 'application/json',
      buffer: Buffer.from(serializeBackup(replacement)) });
    await click(page, 'confirm-import');
    await page.waitForFunction(() => window.__wearnext.snapshot().mode === 'personal'
      && !document.querySelector('#dialog').open);
    const imported = await snapshot(page);
    ok(await sameCanvas(page) && imported.generation === initial.generation,
      `${mode}: replacing a backup in room settings preserves the renderer`);
    ok(imported.selectedId === null && imported.view === 'room'
      && imported.slots.filter(slot => slot.visible).length === 1
      && imported.slots.some(slot => slot.itemId === 'import-shirt')
      && !imported.slots.some(slot => slot.itemId?.startsWith('demo-')),
    `${mode}: a replacement clears stale selection and all previous item bindings`);
    ok((await page.locator('.room-intro').innerText()).includes('1벌')
      && await page.locator('.room-item[data-id]').count() === 1,
    `${mode}: room metadata and selector reflect the replacement wardrobe`);

    await click(page, 'room-item', 'import-shirt');
    await click(page, 'edit-item', 'import-shirt');
    await click(page, 'delete-item', 'import-shirt');
    await click(page, 'confirm-delete-item');
    await page.waitForFunction(() => window.__wearnext.snapshot().items.length === 0
      && !document.querySelector('#dialog').open);
    const deleted = await snapshot(page);
    ok(await sameCanvas(page) && deleted.generation === initial.generation
      && deleted.selectedId === null && deleted.view === 'room'
      && deleted.slots.every(slot => !slot.visible),
    `${mode}: deleting the selected last item clears geometry and detail without recreating the renderer`);
    ok(await page.locator('.room-empty').count() === 1
      && await page.locator('#room-inspector .room-detail').count() === 0,
    `${mode}: deleting the last item shows the empty wardrobe and removes stale details`);

    await click(page, 'manual');
    await page.fill('#item-form [name="name"]', '처음 담은 셔츠');
    await page.selectOption('#item-form [name="kind"]', 'shirt');
    await page.selectOption('#item-form [name="color"]', 'blue');
    await page.click('#item-form [type="submit"]');
    await page.waitForFunction(() => window.__wearnext.snapshot().items.length === 1
      && !document.querySelector('#dialog').open);
    const added = await snapshot(page);
    ok(await sameCanvas(page) && added.generation === initial.generation
      && added.slots.filter(slot => slot.visible).length === 1
      && await page.locator('.room-empty').count() === 0,
    `${mode}: adding the first item updates the existing room and removes its empty state`);

    await click(page, 'room-list');
    await page.waitForSelector('.garment-card');
    ok(!(await sameCanvas(page)), `${mode}: leaving the 3D route releases its canvas`);
    await click(page, 'room-open');
    await ready(page);
    ok((await snapshot(page)).generation > initial.generation,
      `${mode}: returning to the room creates a fresh renderer with current saved items`);
    ok(errors.length === 0, `${mode}: no browser execution errors: ${errors.join('; ')}`);
    ok(external.length === 0, `${mode}: persistence and replacement need no external requests`);
    await context.close();
  }
  console.log(`${checks} room persistence browser checks passed.`);
} finally { await browser.close(); }
