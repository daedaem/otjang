import { test, expect, type Page } from "@playwright/test";
// WO-08b: the bottom tabs, the hanger strip, toasts and the persistent
// storage notice are React once the chrome island loads. The vanilla chrome
// in screen.html stays for ?ui=vanilla and a failed island load. Behaviour is
// pinned by common-ui and the photo-backup/input specs.
const KEY = "eoul-d12-hang:v1";
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
const tabs = (page: Page) => page.getByRole("navigation", { name: "메뉴" });

test("tabs, the hanger strip and toasts render as React", async ({ page }) => {
  await open(page);
  await expect(page.locator("nav#tabs[data-react-chrome]")).toHaveCount(1);
  await expect(page.locator("#tabs")).toHaveCount(1);
  await tabs(page).getByRole("button", { name: "찾기" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(tabs(page).locator("[aria-current=page]")).toHaveText("찾기");
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.compareAdd("ms-728000");
    (window as any).K.refresh();
  });
  const strip = page.locator("#strip[data-react-chrome]");
  await expect(strip).toBeVisible();
  await expect(page.locator("#strip")).toHaveCount(1);
  await expect(strip).toContainText("옷장");
  await strip.click();
  await expect(page).toHaveURL(/#\/closet$/);
  await expect(page.locator("#strip")).toBeHidden();
  await page.evaluate(() => (window as any).K.toast("알림 확인"));
  const toast = page.locator(".k-toast[data-react-chrome]");
  await expect(toast).toHaveText("알림 확인");
  await expect(toast).toHaveAttribute("role", "status");
  await page.evaluate(() => (window as any).K.toast("두 번째 알림"));
  await expect(page.locator(".k-toast")).toHaveCount(1);
  await expect(page.locator(".k-toast")).toHaveText("두 번째 알림");
  await expect(page.locator(".k-toast")).toHaveCount(0, { timeout: 5000 });
});

test("the storage notice renders as React and keeps the two-step fresh start", async ({ page }) => {
  await open(page);
  await page.evaluate((k) => localStorage.setItem(k, "{broken"), KEY);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).K?.M);
  const notice = page.locator("#eo-storage-issue[data-react-chrome]");
  await expect(notice).toHaveAttribute("role", "alert");
  await expect(page.locator("#eo-storage-issue")).toHaveCount(1);
  await notice.getByRole("button", { name: "원문을 이 기기에 따로 보관하고 새로 시작" }).click();
  await notice.getByRole("button", { name: "한 번 더 누르면 새로 시작해요" }).click();
  await expect(page.locator(".k-toast[data-react-chrome]")).toHaveText("원문은 이 기기에 따로 보관했어요. 새로 시작합니다.");
  await expect(page.locator("#eo-storage-issue")).toHaveCount(0);
});

test("?ui=vanilla keeps the vanilla chrome", async ({ page }) => {
  await open(page, "&ui=vanilla");
  await page.evaluate(() => (window as any).K.toast("알림 확인"));
  await expect(page.locator(".k-toast")).toHaveText("알림 확인");
  await expect(page.locator("[data-react-chrome]")).toHaveCount(0);
  await tabs(page).getByRole("button", { name: "기록" }).click();
  await expect(page).toHaveURL(/#\/records$/);
});

test("a failed chrome island load keeps the vanilla chrome working", async ({ page }) => {
  await page.route("**/react/chrome-*.js", (r) => r.abort());
  await open(page);
  await tabs(page).getByRole("button", { name: "기록" }).click();
  await expect(page).toHaveURL(/#\/records$/);
  await expect(tabs(page).locator("[aria-current=page]")).toHaveText("기록");
  await page.evaluate(() => (window as any).K.toast("알림 확인"));
  await expect(page.locator(".k-toast")).toHaveText("알림 확인");
  await expect(page.locator("[data-react-chrome]")).toHaveCount(0);
  await expect(page.locator("#tabs")).toHaveCount(1);
});
