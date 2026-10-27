import { test, expect, type Page } from "@playwright/test";
// WO-03b: the search results body is a React screen that reuses the shared
// supplier panels. The vanilla screen stays for ?ui=vanilla and for a failed
// island load. Behaviour itself is pinned by results.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "not_configured" }),
      });
    return r.continue();
  });
});
async function open(page: Page, search = "") {
  await page.goto(`/?photos=0${search}#/closet`);
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const w = window as any;
    delete w.EOUL_OPEN_PRODUCT_SEARCH;
    delete w.EOUL_RAKUTEN;
    w.ranks = 0;
    w.EOUL_ADPICK = async () => ({ fetchedAt: "2026-10-27T00:00:00.000Z", items: [] });
    w.EOUL_SERVER_AI = async (req: any) => {
      if (req.task !== "rank") throw Object.assign(Error("x"), { code: "not_configured" });
      w.ranks++;
      return { summary: "합성 총평", ranking: req.items.map((x: any) => ({ id: x.id, reason: "합성", fit: "추천" })) };
    };
  });
}
async function results(page: Page, q: string) {
  await page.evaluate((q) => (window as any).K.go("results", { q }), q);
  await expect(page.getByRole("button", { name: `다시 찾기: ${q}`, exact: true })).toBeVisible();
}

test("search results render as React with the shared supplier panels", async ({ page }) => {
  await open(page);
  await results(page, "셔츠");
  await expect(page.locator("[data-react-results]")).toHaveCount(1);
  await expect(page.locator("[data-react-results] [data-react-retail] [data-adpick-panel]")).toHaveCount(1);
  await expect(page.locator("#ai")).toContainText("합성 총평");
  await expect(page.locator("#grid [data-card]")).toHaveCount(12);
  // A refresh (e.g. a trial closet) updates in place instead of remounting.
  const box = await page.locator("[data-react-results]").elementHandle();
  await page.evaluate(() => {
    (window as any).K.M.loadTrialCloset();
    (window as any).K.refresh();
  });
  expect(await box!.evaluate((el) => el.isConnected)).toBe(true);
  expect(await page.evaluate(() => (window as any).ranks)).toBe(1);
});

test("?ui=vanilla keeps the vanilla results screen", async ({ page }) => {
  await open(page, "&ui=vanilla");
  await results(page, "셔츠");
  await expect(page.locator("[data-react-results]")).toHaveCount(0);
  await expect(page.locator("#grid [data-card]")).toHaveCount(12);
  await expect(page.locator("#ai")).toContainText("합성 총평");
});

test("a failed results island load falls back to the vanilla results screen", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).EOUL_RESULTS_LOAD = () => Promise.reject(Error("synthetic chunk failure"));
  });
  await results(page, "셔츠");
  await expect(page.getByText("새 결과 화면을 열지 못해 기존 화면으로 열었어요.")).toBeVisible();
  await expect(page.locator("[data-react-results]")).toHaveCount(0);
  await expect(page.locator("#grid [data-card]")).toHaveCount(12);
  await expect(page.locator("#ai")).toContainText("합성 총평");
});
