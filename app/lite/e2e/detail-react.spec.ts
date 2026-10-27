import { test, expect, type Page } from "@playwright/test";
// WO-04: the product detail (photo, facts, AI reason, judgement, used-market
// links) and its decision bar are a React screen; compare is React too. The
// vanilla screens stay for ?ui=vanilla and a failed island load. Behaviour is
// pinned by detail.spec.ts.
const ID = "ms-728000";
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
async function detail(page: Page, id = ID) {
  await page.evaluate((id) => (window as any).K.go("detail", { id }), id);
  await expect(page.getByRole("heading", { level: 1, name: "베이식 옥스포드 셔츠 [화이트]" })).toBeVisible();
}

test("the detail and its decision bar render as React and update in place", async ({ page }) => {
  await open(page);
  await detail(page);
  await expect(page.locator("[data-react-detail]")).toHaveCount(1);
  await expect(page.locator("#bar [data-react-decision]")).toHaveCount(1);
  const box = await page.locator("[data-react-detail]").elementHandle();
  await page.locator("#bar").getByRole("button", { name: "보류", exact: true }).click();
  await expect(page.locator("#bar").getByRole("status")).toContainText("보류로 남겼어요");
  await page.evaluate(() => {
    (window as any).K.M.loadTrialCloset();
    (window as any).K.refresh();
  });
  expect(await box!.evaluate((el) => el.isConnected)).toBe(true);
});

test("compare renders as React", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.compareAdd("ms-728000");
    m.compareAdd("ms-854339");
    (window as any).K.go("compare", {});
  });
  await expect(page.getByRole("heading", { name: "걸어 본 2벌" })).toBeVisible();
  await expect(page.locator("[data-react-compare]")).toHaveCount(1);
});

test("?ui=vanilla keeps the vanilla detail, decision bar and compare", async ({ page }) => {
  await open(page, "&ui=vanilla");
  await detail(page);
  await expect(page.locator("[data-react-detail]")).toHaveCount(0);
  await page.locator("#bar").getByRole("button", { name: "보류", exact: true }).click();
  await expect(page.locator("#bar").getByRole("status")).toContainText("보류로 남겼어요");
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.compareAdd("ms-728000");
    m.compareAdd("ms-854339");
    (window as any).K.go("compare", {});
  });
  await expect(page.getByRole("heading", { name: "걸어 본 2벌" })).toBeVisible();
  await expect(page.locator("[data-react-compare]")).toHaveCount(0);
});

test("a failed detail island load falls back to the vanilla detail", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).EOUL_DETAIL_LOAD = () => Promise.reject(Error("synthetic chunk failure"));
  });
  await detail(page);
  await expect(page.getByText("새 상품 화면을 열지 못해 기존 화면으로 열었어요.")).toBeVisible();
  await expect(page.locator("[data-react-detail]")).toHaveCount(0);
  await page.locator("#bar").getByRole("button", { name: "안 살래요", exact: true }).click();
  await expect(page.locator("#bar").getByRole("status")).toContainText("안 살래요로 남겼어요");
});
