import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createState, serializeBackup } from '../src/model.js';

// The room is exercised through visible controls and real pointer events. The
// read-only snapshot supplies projection coordinates; it cannot change state.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const prototypeURL = new URL(process.env.PROTOTYPE_URL || 'http://127.0.0.1:4173/');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
await mkdir(path.join(root, 'shots'), { recursive: true });
let checks = 0;
const ok = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS', label); };
const roomState = page => page.evaluate(() => window.__wearnext.roomSnapshot());
const click = (page, action, id) => page.locator(`[data-action="${action}"]${id ? `[data-id="${id}"]` : ''}:visible`).first().click();
const ready = async page => {
  await page.waitForSelector('.room-shell[data-ready="true"]', { timeout: 120000 });
  await page.waitForFunction(() => window.__wearnext.roomSnapshot()?.ready, null, { timeout: 120000 });
};
const fitsViewport = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
async function sceneColorCount(page, screenshot) {
  const bounds = await page.locator('#room-canvas').boundingBox();
  return page.evaluate(async ({ png, bounds }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const sample = document.createElement('canvas');
    sample.width = 32;
    sample.height = 32;
    const context = sample.getContext('2d');
    // Sample the cabinet interior, away from the header, footer and controls.
    context.drawImage(image, bounds.x + bounds.width * .3, bounds.y + bounds.height * .25,
      bounds.width * .4, bounds.height * .4, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 4)
      colors.add(`${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`);
    return colors.size;
  }, { png: screenshot.toString('base64'), bounds });
}
async function importFixture(page, state) {
  await page.goto(prototypeURL.href + '#saved');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click(page, 'import')]);
  await chooser.setFiles({ name: 'room-synthetic-fixture.json', mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(state)) });
  await click(page, 'confirm-import');
  await ready(page);
}
function fixtureItem(id, name, kind, color = 'blue') {
  return { id, name, kind, color, category: 'top', source: 'manual', available: true,
    confirmed: true, attributesConfirmed: true, pattern: 'solid', brand: '' };
}
function track(page) {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== prototypeURL.origin)
      external.push(request.url());
  });
  return { errors, external };
}
try {
  for (const [mode, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]
    .filter(value => !process.env.VIEWPORT || value[0] === process.env.VIEWPORT)) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const { errors, external } = track(page);
    await page.goto(prototypeURL.href);
    await click(page, 'start-demo');
    await ready(page);
    const initial = await roomState(page);
    ok(initial.slots.filter(slot => slot.visible).length === 10,
      `${mode}: ten owned sample items are bound to Blender garment geometry`);
    ok(new Set(initial.slots.map(slot => slot.itemId)).size === 10,
      `${mode}: a recorded item occupies only one compatible location`);
    ok((await page.locator('#room-canvas').boundingBox()).width > 300,
      `${mode}: the primary wardrobe is a visible interactive canvas`);
    ok(await fitsViewport(page), `${mode}: room fits the viewport`);
    const screenshot = await page.screenshot({ path: path.join(root, `shots/${mode}-room.png`), fullPage: true, timeout: 90000 });
    ok(await sceneColorCount(page, screenshot) > 12,
      `${mode}: ready state contains rendered cabinet pixels rather than a blank canvas`);

    const selectedItem = 'demo-shirt-blue';
    if (mode === 'desktop') {
      const shirt = initial.slots.find(slot => slot.itemId === selectedItem);
      ok(shirt?.screen?.visible, 'desktop: the hanging shirt projects into the room viewport');
      const canvas = await page.locator('#room-canvas').boundingBox();
      await page.mouse.click(canvas.x + shirt.screen.x, canvas.y + shirt.screen.y);
      await page.waitForFunction(id => window.__wearnext.roomSnapshot().selectedId === id, selectedItem);
      ok(true, 'desktop: clicking the actual shirt mesh opens its recorded item');
    } else {
      await click(page, 'room-item', selectedItem);
      await page.waitForFunction(id => window.__wearnext.roomSnapshot().selectedId === id, selectedItem);
      ok(true, 'mobile: the garment selector focuses the corresponding 3D item');
    }
    await page.waitForSelector('#room-inspector .room-detail');
    ok((await page.locator('#room-inspector').innerText()).includes('블루 옥스퍼드'),
      `${mode}: item details match the selected garment`);
    ok((await roomState(page)).view === 'detail', `${mode}: selection moves to a garment inspection view`);
    ok(await fitsViewport(page), `${mode}: detail view does not overflow horizontally`);
    const panel = await page.locator('#room-inspector .room-detail').boundingBox();
    ok(panel.x >= 0 && panel.x + panel.width <= width + 1,
      `${mode}: item inspector remains within the viewport`);
    await page.waitForTimeout(650);
    await page.screenshot({ path: path.join(root, `shots/${mode}-room-detail.png`), fullPage: true, timeout: 90000 });
    await click(page, 'room-reset');
    await page.waitForFunction(() => !window.__wearnext.roomSnapshot().selectedId);
    ok((await roomState(page)).view === 'room', `${mode}: returning a garment restores the room view`);
    await click(page, 'room-view', 'right');
    await page.waitForFunction(() => window.__wearnext.roomSnapshot().view === 'right');
    ok(true, `${mode}: cabinet section control changes the viewpoint`);
    await click(page, 'room-view', 'front');
    await page.waitForFunction(() => window.__wearnext.roomSnapshot().view === 'room');

    if (mode === 'desktop') {
      // Wait for the documented camera transition, then test the actual drag.
      await page.waitForTimeout(650);
      const before = (await roomState(page)).slots.find(slot => slot.itemId === selectedItem).screen;
      const bounds = await page.locator('#room-canvas').boundingBox();
      await page.mouse.move(bounds.x + bounds.width * .50, bounds.y + bounds.height * .58);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * .63, bounds.y + bounds.height * .58, { steps: 12 });
      await page.mouse.up();
      await page.waitForFunction(({ id, x }) => {
        const screen = window.__wearnext.roomSnapshot().slots.find(slot => slot.itemId === id).screen;
        return Math.abs(screen.x - x) > 3;
      }, { id: selectedItem, x: before.x });
      ok(!(await roomState(page)).selectedId, 'desktop: dragging rotates the room without selecting a garment');
    }

    await click(page, 'room-item', selectedItem);
    await click(page, 'room-outfit', selectedItem);
    await page.waitForSelector('.outfit-card');
    await click(page, 'save-outfit');
    await page.waitForFunction(() => window.__wearnext.snapshot().savedOutfits.length === 1);
    ok(await page.evaluate(id => window.__wearnext.snapshot().savedOutfits[0].items.includes(id), selectedItem),
      `${mode}: a saved outfit created from the room contains the selected garment`);
    await page.locator('a[href="#closet"]:visible').first().click();
    await ready(page);
    await click(page, 'room-list');
    await page.waitForSelector('.garment-card');
    ok((await page.locator('.garment-card').count()) === 10, `${mode}: list shares the same ten stored items`);
    await click(page, 'room-open');
    await ready(page);
    ok((await roomState(page)).slots.filter(slot => slot.visible).length === 10,
      `${mode}: leaving and reopening the viewer reloads without losing item bindings`);

    const personal = createState('personal');
    personal.onboarded = true;
    await importFixture(page, personal);
    const empty = await roomState(page);
    ok(empty.slots.every(slot => !slot.visible && !slot.itemId),
      `${mode}: an empty personal wardrobe hides every sample garment`);
    ok((await page.locator('[data-action="room-item"]').count()) === 0,
      `${mode}: sample clothes are not offered as personal possessions`);
    await page.screenshot({ path: path.join(root, `shots/${mode}-room-empty.png`), fullPage: true, timeout: 90000 });

    personal.items = [fixtureItem('personal-blue', '나의 블루 셔츠', 'shirt'),
      fixtureItem('personal-white', '나의 화이트 셔츠', 'shirt', 'white'),
      fixtureItem('personal-third', '세 번째 셔츠', 'shirt', 'pink'),
      fixtureItem('personal-hoodie', '아직 모델이 없는 후디', 'hoodie', 'gray'),
      fixtureItem('personal-unknown', 'shirt.jpg · 전체 사진', 'unknown', 'unknown')];
    await importFixture(page, personal);
    const populated = await roomState(page);
    ok(populated.slots.filter(slot => slot.visible).length === 2,
      `${mode}: only the two compatible shirt locations are populated`);
    ok(populated.unplacedIds.length === 3 && populated.unplacedIds.includes('personal-hoodie')
      && populated.unplacedIds.includes('personal-unknown'),
      `${mode}: unsupported kinds and capacity overflow remain explicitly unplaced`);
    const unplaced = await page.locator('#room-unplaced').innerText();
    ok(/3/.test(unplaced), `${mode}: unplaced garment count is shown to the user`);
    await click(page, 'room-item', 'personal-blue');
    await page.waitForFunction(() => window.__wearnext.roomSnapshot().view === 'detail');
    await click(page, 'room-item', 'personal-unknown');
    await page.waitForFunction(() => window.__wearnext.roomSnapshot().view === 'room');
    ok((await roomState(page)).selectedId === 'personal-unknown',
      `${mode}: selecting an unplaced item returns the previous garment and opens the correct record`);
    await click(page, 'room-list');
    await page.waitForSelector('.garment-card');
    ok((await page.locator('.garment-card').count()) === 5,
      `${mode}: all personal items stay accessible in the list`);

    // Keep all shirt slots free: otherwise overflow alone could mask a bug
    // that guesses a shirt from its filename before the user confirms its kind.
    personal.items = [fixtureItem('personal-unknown', 'shirt.jpg · 전체 사진', 'unknown', 'unknown')];
    await importFixture(page, personal);
    const unknown = await roomState(page);
    ok(unknown.slots.every(slot => !slot.visible) && unknown.unplacedIds.includes('personal-unknown'),
      `${mode}: a filename never substitutes for explicit kind confirmation`);
    await click(page, 'room-item', 'personal-unknown');
    await click(page, 'edit-item', 'personal-unknown');
    await page.selectOption('#item-form [name="kind"]', 'shirt');
    await page.click('#item-form [type="submit"]');
    await ready(page);
    await page.waitForFunction(() => window.__wearnext.roomSnapshot().slots.some(
      slot => slot.visible && slot.itemId === 'personal-unknown'));
    ok((await roomState(page)).unplacedIds.length === 0,
      `${mode}: confirming the clothing kind places the existing record in the room`);
    ok(errors.length === 0, `${mode}: no execution errors ${errors.join('; ')}`);
    ok(external.length === 0, `${mode}: all scene assets load locally without external HTTP requests`);
    await context.close();
  }

  // An explicit no-WebGL context exercises the real browser-support fallback.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const { errors, external } = track(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (/webgl|experimental-webgl/.test(String(kind))) return null;
      return original.call(this, kind, ...args);
    };
  });
  await page.goto(prototypeURL.href);
  await click(page, 'start-demo');
  await page.waitForSelector('.room-shell[data-error]');
  ok((await page.locator('.room-shell').innerText()).includes('목록'),
    'fallback: unsupported WebGL offers the functional garment list');
  await click(page, 'room-list');
  await page.waitForSelector('.garment-card');
  ok((await page.locator('.garment-card').count()) === 10,
    'fallback: the same owned garments remain usable without WebGL');
  ok(errors.length === 0 && external.length === 0,
    'fallback: graceful support failure has no uncaught errors or external requests');
  await context.close();
  console.log(`${checks} Blender room browser checks passed.`);
} finally {
  await browser.close();
}
