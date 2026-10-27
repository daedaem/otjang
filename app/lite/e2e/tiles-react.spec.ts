import { test, expect, type Page, type Locator } from "@playwright/test";
// WO-08c: the shared picture tiles (product / garment / outfit piece), the
// weather card's missing-item product cards and the trial garment info sheet
// are React elements instead of screen.html HTML injected into React. Looks
// and behaviour are pinned by the detail, weather and common-ui specs.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
});
async function open(page: Page, search = "") {
  await page.goto(`/?photos=0${search}#/closet`);
  await page.waitForFunction(() => !!(window as any).K?.M);
}
// React keeps a fiber on every element it rendered; HTML set through
// innerHTML inside a React tree has none.
const fromReact = (l: Locator) =>
  l.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber")));
const wardrobe = (page: Page) =>
  page.evaluate(() => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "shirt", color: "white" });
    m.addGarment({ kind: "pants", color: "black" });
    m.addGarment({ kind: "sneaker", color: "white" });
    m.addGarment({ kind: "shirt", color: "navy" });
    m.addGarment({ kind: "pants", color: "beige" });
  });

test("detail owned and outfit tiles are React tiles", async ({ page }) => {
  await open(page);
  await wardrobe(page);
  await page.evaluate(() => (window as any).K.go("detail", { id: "ms-728000" }));
  const owned = page.locator(".owned .o .ph-box").first();
  await expect(owned).toBeVisible();
  expect(await fromReact(owned)).toBe(true);
  const piece = page.locator(".looks2 .p1 .ph-box").first();
  await expect(piece).toBeVisible();
  expect(await fromReact(piece)).toBe(true);
});

test("weather pieces and missing-item cards are React and hang like the vanilla cards", async ({ page }) => {
  await open(page);
  await wardrobe(page);
  await page.evaluate(() => {
    (window as any).EOUL_WEATHER = async () => ({
      place: "합성 지역",
      today: { min: 14, max: 24, rain: true, date: "2026-10-27" },
      tomorrow: { min: 9, max: 17, rain: false, date: "2026-10-28" },
    });
    (window as any).K.tab("home");
  });
  const card = page.getByRole("region", { name: "오늘 날씨 코디", exact: true });
  await expect(card).toContainText("합성 지역");
  const piece = card.locator(".wx-ps .p1 .ph-box").first();
  await expect(piece).toBeVisible();
  expect(await fromReact(piece)).toBe(true);
  const missing = card.locator(".wx-mg .card").first();
  await expect(missing).toBeVisible();
  expect(await fromReact(missing)).toBe(true);
  const id = await missing.getAttribute("data-card");
  await missing.getByRole("button", { name: "걸어 보기" }).click();
  expect(await page.evaluate((id) => (window as any).K.M.compareHas(id), id)).toBe(true);
  await expect(page.locator("#strip")).toBeVisible();
  await page.evaluate((id) => {
    const m = (window as any).K.M;
    m.compareRemove(id);
    const others = m.readSearch("셔츠").products.map((p: any) => p.id).filter((x: string) => x !== id);
    for (const x of others) if (m.compareList().length < 4) m.compareAdd(x);
    (window as any).K.refresh();
  }, id);
  const again = card.locator(`.wx-mg .card[data-card="${id}"]`);
  await again.getByRole("button", { name: "걸어 보기" }).click();
  await expect(again.locator(".card-note")).toHaveText("옷걸이에는 4벌까지 걸 수 있어요. 하나를 내리고 다시 걸어 주세요.");
  await again.locator(".open-p").first().click();
  await expect(page).toHaveURL(new RegExp(`#/p/${id}$`));
});

test("add-by-kind pictures are React tiles", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "종류·색으로 넣기" }).click();
  const tile = page.locator(".sheet .kinds button .ph-box").first();
  await expect(tile).toBeVisible();
  expect(await fromReact(tile)).toBe(true);
});

test("a trial garment's info sheet is React and keeps colour and removal", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).K.M.loadTrialCloset();
    (window as any).K.refresh();
  });
  const info = page.getByRole("button", { name: /옷 정보$/ }).first();
  await info.click();
  const sheet = page.locator(".sheet[data-react-sheet]");
  await expect(sheet).toContainText("이 옷으로 입을 수 있는 코디");
  await expect(sheet).toContainText("체험용");
  const count = await page.evaluate(() => (window as any).K.M.getState().closet.length);
  await sheet.getByRole("button", { name: "옷장에서 빼기" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).K.M.getState().closet.length)).toBe(count - 1);
});

test("?ui=vanilla keeps the vanilla garment info sheet", async ({ page }) => {
  await open(page, "&ui=vanilla");
  await page.evaluate(() => {
    (window as any).K.M.loadTrialCloset();
    (window as any).K.refresh();
  });
  await page.locator("[data-g]").first().click();
  await expect(page.locator(".sheet")).toContainText("이 옷으로 입을 수 있는 코디");
  await expect(page.locator(".sheet[data-react-sheet]")).toHaveCount(0);
});
