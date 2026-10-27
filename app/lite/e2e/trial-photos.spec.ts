import { readFileSync } from "node:fs";
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
async function trial(page: Page, search = "", route = "closet") {
  await page.goto(`/?photos=0${search}#/${route}`);
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => { const K = (window as any).K; K.M.loadTrialCloset("M"); K.refresh(); });
}
const loaded = (img: ReturnType<Page["locator"]>) =>
  img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0);

test("the closet rail shows trial clothes as example photos", async ({ page }) => {
  await trial(page);
  const shirt = page.locator('.wr img[src$="examples/m-oxford.webp"]');
  await expect(shirt).toHaveCount(1);
  await expect.poll(() => loaded(shirt)).toBe(true);
  await expect(shirt).toHaveAttribute("alt", /예시 사진/);
  // No example photo yet: the drawing stays.
  await expect(page.getByRole("img", { name: "인디고 워시드 데님 · 사진 없음" })).toBeVisible();
});

for (const [label, ui] of [["", ""], [" (vanilla)", "&ui=vanilla"]] as const)
  test(`a product page shows my similar trial clothes as example photos${label}`, async ({ page }) => {
    await trial(page, ui, "");
    await page.evaluate(() => { const K = (window as any).K; K.go("detail", { id: K.M.readSearch("블레이저").products[0].id }); });
    const blazer = page.locator('#hangbox img[src$="examples/m-blazer.webp"]');
    await expect(blazer.first()).toBeVisible();
    await expect.poll(() => loaded(blazer.first())).toBe(true);
  });

// Until the owner makes the remaining example photos (10-27: "나중에… 잊지 말고"),
// trial clothes without one borrow the core's similar store photo, labelled, but
// only while store photos are on (the private app; ?photos=0 keeps the drawing).
test("trial clothes without an example photo borrow a labelled similar store photo", async ({ page }) => {
  const body = readFileSync(new URL("../public/examples/m-tee.webp", import.meta.url));
  await page.route("https://image.msscdn.net/**", (r) => r.fulfill({ status: 200, contentType: "image/webp", body }));
  await page.goto("/#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => { const K = (window as any).K; K.M.loadTrialCloset("M"); K.refresh(); });
  const denim = page.locator(".wr-card", { hasText: "인디고 워시드 데님" });
  const img = denim.locator('img[src^="https://image.msscdn.net/"]');
  await expect(img).toHaveCount(1);
  await expect.poll(() => loaded(img)).toBe(true);
  await expect(denim).toContainText("비슷한 상품 사진");
  // The bundled example still wins over the store photo.
  await expect(page.locator(".wr-card", { hasText: "흰 옥스퍼드 셔츠" }).locator('img[src$="examples/m-oxford.webp"]')).toHaveCount(1);
});
