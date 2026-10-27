import { test, expect, type Page } from "@playwright/test";
const KEY = "eoul-d12-hang:v1";
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return route.abort();
    if (u.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          count: 1,
          min: 3,
          fetchedAt: "2026-10-27T00:00:00.000Z",
          usableCount: 0,
        }),
      });
    return route.continue();
  });
  await page.goto("/?photos=0#/closet");
  await expect(page.locator("[data-react-closet]")).toBeVisible();
});
async function open(page: Page) {
  await page.evaluate(() => (window as any).K.go("add", {}));
  await expect(
    page.getByLabel("브랜드나 상품명", { exact: true }),
  ).toBeVisible();
}
test("searching to register owned clothes leaves the wardrobe, purchase decisions and recent query exactly unchanged", async ({
  page,
}) => {
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "pants", color: "black" });
    m.decide("ms-728000", "hold");
  });
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await open(page);
  await page.getByLabel("브랜드나 상품명", { exact: true }).fill("옥스퍼드");
  await expect(page.locator("[data-own-add]").first()).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
});
test("typing never submits retailer search and a submitted query does not carry into edited text", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as any;
    w.domesticQueries = [];
    w.EOUL_ADPICK = async (q: string) => {
      w.domesticQueries.push(q);
      return { items: [], omitted: 0, fetchedAt: "2026-10-27T00:00:00.000Z" };
    };
  });
  await open(page);
  const q = page.getByLabel("브랜드나 상품명", { exact: true });
  await q.fill("합성 셔츠");
  await expect(page.locator("#aopen")).toContainText("공개 상품");
  expect(await page.evaluate(() => (window as any).domesticQueries)).toEqual(
    [],
  );
  await q.press("Enter");
  await expect
    .poll(() => page.evaluate(() => (window as any).domesticQueries))
    .toEqual(["합성 셔츠"]);
  await q.fill("다른 합성 셔츠");
  await expect(page.locator("#adom")).toBeEmpty();
  expect(await page.evaluate(() => (window as any).domesticQueries)).toEqual([
    "합성 셔츠",
  ]);
});
test("late public-product results cannot replace a newer search and selected facts enter the existing registration draft", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as any,
      old = w.EOUL_OPEN_PRODUCTS;
    w.pendingFacts = {};
    w.EOUL_OPEN_PRODUCTS = {
      ...old,
      search: (q: string) =>
        !q
          ? Promise.resolve({
              items: [],
              fetchedAt: "2026-10-27T00:00:00.000Z",
              usableCount: 2,
            })
          : new Promise((resolve) => (w.pendingFacts[q] = resolve)),
    };
  });
  await open(page);
  const q = page.getByLabel("브랜드나 상품명", { exact: true });
  await q.fill("합성 첫 검색");
  await page.waitForFunction(
    () => !!(window as any).pendingFacts["합성 첫 검색"],
  );
  await q.fill("합성 둘 검색");
  await page.waitForFunction(
    () => !!(window as any).pendingFacts["합성 둘 검색"],
  );
  await page.evaluate(() => {
    (window as any).pendingFacts["합성 둘 검색"]({
      items: [
        {
          code: "1234567890123",
          brand: "합성 브랜드",
          name: "둘째 합성 셔츠",
          categories: ["en:clothing", "en:shirts"],
          url: "https://world.openproductsfacts.org/product/1234567890123",
        },
      ],
      fetchedAt: "2026-10-27T00:00:00.000Z",
      usableCount: 2,
    });
  });
  await expect(page.locator("#aopen")).toContainText("둘째 합성 셔츠");
  await page.evaluate(() => {
    (window as any).pendingFacts["합성 첫 검색"]({
      items: [
        {
          code: "1234567890124",
          brand: "합성 브랜드",
          name: "첫째 합성 셔츠",
          categories: ["en:clothing", "en:shirts"],
          url: "https://world.openproductsfacts.org/product/1234567890124",
        },
      ],
      fetchedAt: "2026-10-27T00:00:00.000Z",
      usableCount: 2,
    });
  });
  await expect(page.locator("#aopen")).not.toContainText("첫째 합성 셔츠");
  await page.locator("[data-opf-add]").click();
  await expect(page.getByLabel("브랜드", { exact: true })).toHaveValue(
    "합성 브랜드",
  );
  await expect(page.getByLabel("상품명", { exact: true })).toHaveValue(
    "둘째 합성 셔츠",
  );
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
});
test("failed catalog ownership save preserves the query and retries the same product once", async ({
  page,
}) => {
  await open(page);
  const q = page.getByLabel("브랜드나 상품명", { exact: true });
  await q.fill("옥스퍼드");
  const own = page.locator("[data-own-add]").first();
  await expect(own).toBeVisible();
  const id = await own.getAttribute("data-own-add");
  await page.evaluate((k) => {
    const w = window as any;
    w.addSet = Storage.prototype.setItem;
    w.failAdd = true;
    Storage.prototype.setItem = function (key, value) {
      if (w.failAdd && key === k)
        throw new DOMException("quota", "QuotaExceededError");
      return w.addSet.call(this, key, value);
    };
  }, KEY);
  await own.click();
  await expect(page.locator(".k-toast")).toContainText("저장");
  await expect(q).toHaveValue("옥스퍼드");
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
  await page.evaluate(() => ((window as any).failAdd = false));
  await own.click();
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (window as any).K.M.getState().closet.filter(
            (g: any) => g.productId === id,
          ).length,
        id,
      ),
    )
    .toBe(1);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (window as any).K.M.getState().closet.filter(
            (g: any) => g.productId === id,
          ).length,
        id,
      ),
    )
    .toBe(1);
});

test("direct add entry and reload preserve existing raw records and Back has a closet fallback", async ({
  page,
}) => {
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "pants", color: "black" });
    m.decide("ms-728000", "hold");
  });
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await page.goto("/?photos=0&entry=direct-add#/add");
  await expect(
    page.getByLabel("브랜드나 상품명", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
  await page.reload();
  await expect(
    page.getByLabel("브랜드나 상품명", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await expect(page.locator("[data-react-closet]")).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
});
