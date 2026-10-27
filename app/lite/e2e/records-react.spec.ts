import { test, expect, type Page } from "@playwright/test";
// WO-05: the purchase records screen is React and reuses the core record
// commands and the return sheet. The vanilla screen stays for ?ui=vanilla and
// a failed island load. Behaviour is pinned by records.spec.ts.
const A = "ms-728000";
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
  await page.evaluate((id) => (window as any).K.M.decide(id, "buy"), A);
}
async function records(page: Page) {
  await page.evaluate(() => (window as any).K.tab("records"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("1벌을 정했어요");
}

test("records render as React and a step updates in place", async ({ page }) => {
  await open(page);
  await records(page);
  await expect(page.locator("[data-react-records]")).toHaveCount(1);
  const box = await page.locator("[data-react-records]").elementHandle();
  await page.getByRole("button", { name: "주문했어요" }).click();
  await expect(page.locator(".wait-row")).toContainText("주문했다고 기록함");
  expect(await box!.evaluate((el) => el.isConnected)).toBe(true);
});

test("?ui=vanilla keeps the vanilla records screen", async ({ page }) => {
  await open(page, "&ui=vanilla");
  await records(page);
  await expect(page.locator("[data-react-records]")).toHaveCount(0);
  await page.getByRole("button", { name: "주문했어요" }).click();
  await expect(page.locator(".wait-row")).toContainText("주문했다고 기록함");
});

test("a failed records island load falls back to the vanilla records screen", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).EOUL_RECORDS_LOAD = () => Promise.reject(Error("synthetic chunk failure"));
  });
  await records(page);
  await expect(page.getByText("새 기록 화면을 열지 못해 기존 화면으로 열었어요.")).toBeVisible();
  await expect(page.locator("[data-react-records]")).toHaveCount(0);
  await page.getByRole("button", { name: "주문했어요" }).click();
  await expect(page.locator(".wait-row")).toContainText("주문했다고 기록함");
});
