import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);
const root = fileURLToPath(new URL('../', import.meta.url));
const url = process.env.PROTOTYPE_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
await mkdir(path.join(root, 'shots'), { recursive: true });
let checks = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  checks++;
  console.log('PASS', label);
}
try {
  for (const [mode, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
  ].filter((v) => !process.env.VIEWPORT || v[0] === process.env.VIEWPORT)) {
    const context = await browser.newContext({
      viewport: { width, height },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [],
      external = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('request', (request) => {
      if (/^https?:/.test(request.url()) && !request.url().startsWith(url))
        external.push(request.url());
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__wearnext?.ready);
    await page.screenshot({ path: path.join(root, `shots/${mode}-welcome.png`), fullPage: true });
    await page.click('[data-action="start-demo"]');
    await page.waitForSelector('.room-shell');
    await page.click('[data-action="room-list"]');
    await page.waitForSelector('.garment-card');
    const initialItemCount = (await page.evaluate(() => window.__wearnext.snapshot())).items.length;
    ok(initialItemCount === 10 && (await page.locator('.garment-card').count()) === initialItemCount,
      `${mode}: ten sample garments in the secondary list`);
    ok(
      (await page.locator('main').innerText()).includes('샘플 옷장'),
      `${mode}: sample provenance visible`,
    );
    await page.click('[data-action="filter"][data-id="top"]');
    ok((await page.locator('.garment-card').count()) === 4, `${mode}: category filtering`);
    await page.fill('#closet-search', '니트');
    ok((await page.locator('.garment-card').count()) === 1, `${mode}: text search`);
    await page.fill('#closet-search', '');
    await page.click('[data-action="filter"][data-id="all"]');
    await page.screenshot({ path: path.join(root, `shots/${mode}-closet.png`), fullPage: true });
    await page.locator('[data-action="edit-item"]').first().click();
    await page.fill('#item-form [name="name"]', '블루 셔츠 <img src=x onerror=alert(1)>');
    await page.click('#item-form [type="submit"]');
    await page.waitForFunction(() => !document.querySelector('dialog').open);
    ok(
      (await page.locator('.garment-card').first().innerText()).includes('<img src=x'),
      `${mode}: untrusted names render as text`,
    );
    await page.goto(url + '#outfits');
    await page.waitForSelector('.outfit-card');
    ok((await page.locator('.ai-results .outfit-card').count()) === 6,
      `${mode}: six prepared AI sample recommendations`);
    const basicCombinations = page.locator('details').filter({ hasText: '기본 조합 · 등록한 종류와 색으로 보기' });
    ok((await basicCombinations.locator('.outfit-card').count()) === 3,
      `${mode}: three secondary rule combinations`);
    await page.locator('[data-action="save-outfit"]').first().click();
    await page.waitForFunction(() => window.__wearnext.snapshot().savedOutfits.length === 1);
    await page.locator('[data-action="outfit-detail"]').first().click();
    await page.click('[data-action="wear"]');
    await page.waitForFunction(() => window.__wearnext.snapshot().decisions.length === 1);
    ok(true, `${mode}: bookmark and actual wear are recorded separately`);
    await page.selectOption('#context-form [name="style"]', 'casual');
    await page.selectOption('#context-form [name="occasion"]', 'weekend');
    await page.click('#context-form [type="submit"]');
    await page.waitForFunction(() => window.__wearnext.snapshot().profile.style === 'casual');
    await basicCombinations.locator('summary').click();
    ok(
      (await basicCombinations.locator('.outfit-card').first().innerText()).includes('캐주얼'),
      `${mode}: changed style changes basic combination reasoning`,
    );
    await page.screenshot({ path: path.join(root, `shots/${mode}-outfits.png`), fullPage: true });
    await page.goto(url + '#discover');
    await page.waitForSelector('.product-card');
    ok(
      (await page.locator('.product-card').count()) === 4,
      `${mode}: clearly synthetic candidate catalog`,
    );
    await page.locator('[data-action="product-detail"]').first().click();
    await page.click('[data-action="product-tab"][data-id="reviews"]');
    ok(
      (await page.locator('dialog').innerText()).includes('실제 구매자의 평가가 아닙니다'),
      `${mode}: synthetic reviews disclosed`,
    );
    await page.click('dialog [data-action="save-product"]');
    await page.click('[data-action="product-tab"][data-id="decision"]');
    await page.fill('#decision-form [name="note"]', '가지고 있는 하의부터 입어 보기');
    await page.click('#decision-form [type="submit"]');
    await page.waitForFunction(() => window.__wearnext.snapshot().decisions.length === 2);
    ok(
      (await page.locator('main').innerText()).includes('가지고 있는 하의부터'),
      `${mode}: purchase reasoning persists to records`,
    );
    await page.goto(url + '#discover');
    await page.click('[data-action="add-product"]');
    await page.fill('#product-form [name="name"]', '직접 확인한 후보');
    await page.fill('#product-form [name="price"]', '999000');
    await page.fill('#product-form [name="url"]', 'https://example.com/item');
    await page.fill('#product-form [name="review"]', '직접 기록한 후기 예시');
    await page.click('#product-form [type="submit"]');
    await page.waitForFunction(() => window.__wearnext.snapshot().products.length === 5);
    const card = page.locator('.product-card').filter({ hasText: '직접 확인한 후보' });
    ok(
      (await card.innerText()).includes('예산 초과'),
      `${mode}: an over-budget real input remains identified`,
    );
    await card.locator('[data-action="product-detail"]').click();
    await page.click('[data-action="product-tab"][data-id="decision"]');
    const externalLink = page.locator('dialog a[target="_blank"]');
    ok(
      (await externalLink.getAttribute('href')) === 'https://example.com/item',
      `${mode}: user source URL preserved without fetching it`,
    );
    await page.click('[data-action="mark-owned"]');
    await page.click('[data-action="confirm-owned"]');
    await page.waitForFunction((count) => window.__wearnext.snapshot().items.length === count,
      initialItemCount + 1);
    await page.reload();
    await page.waitForFunction(() => window.__wearnext?.ready);
    ok(
      (await page.evaluate(() => window.__wearnext.snapshot())).items.length === initialItemCount + 1,
      `${mode}: purchase ownership persists after reload`,
    );
    await page.goto(url + '#saved');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-action="export"]'),
    ]);
    const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
    ok(
      backup.state.items.length === initialItemCount + 1 && backup.state.decisions.length === 2,
      `${mode}: downloadable backup includes actual current state`,
    );
    for (const route of ['closet', 'outfits', 'discover', 'saved', 'onboarding']) {
      await page.goto(url + '#' + route);
      await page.waitForFunction(() => window.__wearnext?.ready);
      const fit = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      if (!fit) {
        console.log(
          await page.evaluate(() =>
            [...document.querySelectorAll('body *')]
              .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
              .map((el) => ({
                tag: el.tagName,
                cls: el.className,
                width: el.getBoundingClientRect().width,
                text: el.textContent?.slice(0, 80),
              }))
              .slice(0, 20),
          ),
        );
        await page.screenshot({
          path: path.join(root, `shots/${mode}-overflow.png`),
          fullPage: true,
        });
      }
      ok(fit, `${mode}: no horizontal overflow on ${route}`);
    }
    await page.goto(url + '#discover');
    await page.screenshot({ path: path.join(root, `shots/${mode}-discover.png`), fullPage: true });
    ok(errors.length === 0, `${mode}: no browser execution errors ${errors.join(';')}`);
    ok(external.length === 0, `${mode}: zero external HTTP requests`);
    await context.close();
  }
  console.log(`${checks} browser checks passed.`);
} finally {
  await browser.close();
}
