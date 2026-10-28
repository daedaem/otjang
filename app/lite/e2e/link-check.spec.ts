import { test, expect, type Page } from "@playwright/test";
// 링크로 바로 판단: 붙여 넣은 링크가 목록 상품이면 상세 판단으로, 아니면 종류·색을 골라 옷장 기준 판단.
async function open(page: Page) {
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return route.abort();
    if (u.pathname.startsWith("/api/")) return route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"not_configured"}' });
    return route.continue();
  });
  await page.goto("/?photos=0#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const m = (window as any).K.M;
    for (const [kind, slot, color, label] of [["shirt", "m-oxford", "white", "흰 셔츠"], ["pants", "m-chino", "beige", "베이지 바지"], ["sneaker", "m-white-sneaker", "white", "흰 신발"]]) m.addGarment({ kind, slot, color, label });
  });
}
test("home offers checking a link before buying", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /링크로 사도 될지 보기/ }).click();
  await expect(page.getByRole("heading", { name: "이거 사도 될까?" })).toBeVisible();
});
test("a catalog link opens the product verdict", async ({ page }) => {
  await open(page);
  const id = await page.evaluate(() => (window as any).K.M.readSearch("코트").products[0].id.replace("ms-", ""));
  await page.evaluate(() => (window as any).K.go("check", {}));
  await page.getByLabel("상품 링크").fill(`이거 살까 https://www.musinsa.com/products/${id}`);
  await page.getByRole("button", { name: "판단하기" }).click();
  await expect(page.locator("#hangbox")).toBeVisible();
});
test("an outside link asks kind and colour and shows overlap or new outfits", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).K.go("check", {}));
  await page.getByLabel("상품 링크").fill("https://shop.example.com/item/123");
  await page.getByRole("button", { name: "판단하기" }).click();
  await page.getByLabel("종류").selectOption("shirt");
  await page.getByLabel("색").selectOption("white");
  await expect(page.locator("[data-check-verdict]")).toContainText("비슷한 옷이 이미 있어요");
  await expect(page.locator("[data-check-verdict]")).toContainText("흰 셔츠");
  await page.getByLabel("종류").selectOption("jeans");
  await page.getByLabel("색").selectOption("indigo");
  await expect(page.locator("[data-check-verdict]")).toContainText(/새 코디 \d+개/);
  await expect(page.getByRole("link", { name: /판매처에서 보기/ })).toHaveAttribute("href", "https://shop.example.com/item/123");
});
test("a non-https or broken link is refused with a message", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).K.go("check", {}));
  await page.getByLabel("상품 링크").fill("그냥 글자");
  await page.getByRole("button", { name: "판단하기" }).click();
  await expect(page.getByRole("alert")).toContainText(/링크/);
  await expect(page.locator("[data-check-verdict]")).toHaveCount(0);
});
test("the plain (fallback) home offers it too", async ({ page }) => {
  await page.goto("/?photos=0&ui=vanilla#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.getByRole("button", { name: /링크로 사도 될지 보기/ }).click();
  await expect(page.getByRole("heading", { name: "이거 사도 될까?" })).toBeVisible();
});
