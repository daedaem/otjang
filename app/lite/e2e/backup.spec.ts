import { test, expect, type Page } from "@playwright/test";
// WO-07 baseline: the text backup sheet paths that other specs do not cover —
// opening from the menu with focus on export, the counts line, an over-size
// or unreadable file, a newer selection revoking an older preview, a pasted
// preview that writes nothing, Escape closing, and the export file name.
// Restore/undo/photo packs are pinned by input, collection, measurement,
// outfits, profile-edit, photo-backup and mirror-backup specs.
const KEY = "eoul-d12-hang:v1";
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "shirt", color: "white" });
    m.addGarment({ kind: "pants", color: "black" });
  });
});
async function openBackup(page: Page) {
  await page.evaluate(() => (window as any).K.tab("records"));
  await page.evaluate(() => (window as any).K.tab("closet"));
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.getByRole("button", { name: "백업 · 복원" }).click();
  const sheet = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "백업 · 복원" }) });
  await expect(sheet).toBeVisible();
  return sheet;
}
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      out[k] = localStorage.getItem(k);
    }
    return out;
  });

test("the sheet opens from the menu with focus on export, shows counts and closes with Escape", async ({ page }) => {
  const sheet = await openBackup(page);
  await expect(sheet.locator("[data-bk-save]")).toBeFocused();
  await expect(sheet.locator(".sub")).toContainText("이 기기의 자료를 글자 파일 하나로 내보내요(사진 없음).");
  await expect(sheet.locator(".sub")).toContainText("옷 2벌");
  await expect(sheet.locator("[data-bk-report]")).toContainText("정상 자료");
  await expect(sheet.locator("[data-bk-undo]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".bk")).toHaveCount(0);
  // Opening twice never stacks two sheets.
  await page.evaluate(() => (window as any).K.tab("closet"));
  await openBackup(page);
  await expect(page.locator(".bk")).toHaveCount(1);
});

test("export downloads a dated JSON file and a pasted backup previews without writing anything", async ({ page }) => {
  const sheet = await openBackup(page);
  const download = page.waitForEvent("download");
  await sheet.locator("[data-bk-save]").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^closet-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  await expect(sheet.locator(".bk-msg")).toContainText("파일을 내보냈어요");
  const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  const before = await snapshot(page);
  await sheet.locator("[data-bk-paste]").click();
  await sheet.getByLabel("백업 글자").fill(text);
  await sheet.locator("[data-bk-read]").click();
  // The photo section has its own preview; the text one is a direct child.
  const preview = sheet.locator(".bk > .bk-preview");
  await expect(preview).toContainText("복원할 백업");
  await expect(preview).toContainText("지금 이 기기: ");
  await expect(preview.locator("[data-bk-go]")).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
});

test("an over-size or unreadable text file is refused and a newer selection revokes the older preview", async ({ page }) => {
  const sheet = await openBackup(page);
  const before = await snapshot(page);
  await sheet.locator("#bkfile").setInputFiles({ name: "big.json", mimeType: "application/json", buffer: Buffer.alloc(5 * 1024 * 1024 + 10, 0x20) });
  await expect(sheet.locator(".bk-msg")).toHaveText("파일이 너무 커요(5MB 초과).");
  await sheet.locator("#bkfile").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{not json") });
  await expect(sheet.locator(".bk-msg")).not.toHaveText("");
  await expect(sheet.locator(".bk > .bk-preview")).toBeHidden();
  const saved = await page.evaluate((k) => localStorage.getItem(k), KEY);
  const good = JSON.stringify({ app: "eoul-lite", format: 1, data: { [KEY]: saved } });
  await sheet.locator("#bkfile").setInputFiles({ name: "good.json", mimeType: "application/json", buffer: Buffer.from(good) });
  await expect(sheet.locator("[data-bk-go]")).toBeVisible();
  // Starting a paste (a new selection) hides the earlier confirmation.
  await sheet.locator("[data-bk-paste]").click();
  await expect(sheet.locator("[data-bk-go]")).toHaveCount(0);
  await expect(sheet.locator("[data-bk-read]")).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
});
