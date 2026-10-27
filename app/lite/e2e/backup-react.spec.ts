import { test, expect, type Page } from "@playwright/test";
// WO-07: the backup sheet (text backup and the photo section) is React and
// reuses BK and the photo backup controller unchanged. ?ui=vanilla and a
// failed island load keep the vanilla sheet. Behaviour is pinned by
// backup.spec.ts and the restore/photo specs.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
});
async function openBackup(page: Page, search = "", before?: () => Promise<void>) {
  await page.goto(`/?photos=0${search}#/closet`);
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => (window as any).K.M.addGarment({ kind: "shirt", color: "white" }));
  if (before) await before();
  await page.evaluate(() => (window as any).K.tab("closet"));
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.getByRole("button", { name: "백업 · 복원" }).click();
  await expect(page.getByRole("heading", { name: "백업 · 복원" })).toBeVisible();
}

test("the backup sheet renders as React with its photo section", async ({ page }) => {
  await openBackup(page);
  await expect(page.locator("[data-react-backup]")).toHaveCount(1);
  await expect(page.locator(".bk [data-photo-ready=true]")).toHaveCount(1);
  await page.locator("[data-bk-copy]").click();
  await expect(page.locator(".bk-msg")).not.toHaveText("");
});

test("?ui=vanilla keeps the vanilla backup sheet", async ({ page }) => {
  await openBackup(page, "&ui=vanilla");
  await expect(page.locator("[data-react-backup]")).toHaveCount(0);
  await expect(page.locator(".bk [data-photo-ready=true]")).toHaveCount(1);
});

test("a failed backup island load falls back to the vanilla backup sheet", async ({ page }) => {
  await openBackup(page, "", async () => {
    await page.evaluate(() => {
      (window as any).EOUL_BACKUP_LOAD = () => Promise.reject(Error("synthetic chunk failure"));
    });
  });
  await expect(page.locator("[data-react-backup]")).toHaveCount(0);
  await expect(page.locator(".bk-msg")).toHaveText("새 백업 화면을 열지 못해 기존 화면으로 열었어요.");
  await expect(page.locator("[data-bk-save]")).toBeVisible();
});
