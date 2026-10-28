import { test, expect, type Page } from "@playwright/test";
// 체험용 옷은 그림 대신 함께 묶은 예시 사진으로 보인다(2026-10-27 대표 요청).
// 상품 사진을 끈 ?photos=0에서도 보인다: 앱 안의 파일이라 외부 요청이 없다.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
});
async function trial(page: Page, search = "", route = "closet", gender: "M" | "F" = "M") {
  await page.goto(`/?photos=0${search}#/${route}`);
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate((g) => { const K = (window as any).K; K.M.loadTrialCloset(g); K.refresh(); }, gender);
}
const loaded = (img: ReturnType<Page["locator"]>) =>
  img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0);

for (const [gender, count] of [["M", 8], ["F", 7]] as const)
  test(`the ${gender} closet rail shows every trial garment as an example photo`, async ({ page }) => {
    await trial(page, "", "closet", gender);
    const photos = page.locator('.wr img[src^="examples/"]');
    await expect(photos).toHaveCount(count);
    for (let i = 0; i < count; i++) {
      const photo = photos.nth(i);
      await photo.scrollIntoViewIfNeeded();
      await expect.poll(() => loaded(photo)).toBe(true);
      await expect(photo).toHaveAttribute("alt", /예시 사진/);
    }
    await expect(page.locator('.wr img[src^="https://"]')).toHaveCount(0);
  });

for (const [label, ui] of [["", ""], [" (vanilla)", "&ui=vanilla"]] as const)
  test(`a product page shows my similar trial clothes as example photos${label}`, async ({ page }) => {
    await trial(page, ui, "");
    await page.evaluate(() => { const K = (window as any).K; K.go("detail", { id: K.M.readSearch("블레이저").products[0].id }); });
    const blazer = page.locator('#hangbox img[src$="examples/m-blazer.webp"]');
    await expect(blazer.first()).toBeVisible();
    await expect.poll(() => loaded(blazer.first())).toBe(true);
  });

// All 14 generated images are now bundled. Store-photo settings must not send
// trial clothes back to an external product image (members block those images).
test("bundled trial photos win over store photos for both closets", async ({ page }) => {
  const externalPhotos: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("https://image.msscdn.net/")) externalPhotos.push(request.url()); });
  await page.goto("/#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  for (const [gender, count] of [["M", 8], ["F", 7]] as const) {
    await page.evaluate((g) => { const K = (window as any).K; K.M.loadTrialCloset(g); K.refresh(); }, gender);
    await expect(page.locator('.wr img[src^="examples/"]')).toHaveCount(count);
    await expect(page.locator('.wr img[src^="https://"]')).toHaveCount(0);
    await expect(page.locator('.wr')).not.toContainText("비슷한 상품 사진");
  }
  expect(externalPhotos).toEqual([]);
});
