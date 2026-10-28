import { test, expect, type Page } from "@playwright/test";
// 초대 회원(지인 테스트, 대표 10-28 15:11~15:12). Worker가 화면에 <meta name="hangit-role">를 붙인다.
// 회원에게는 무신사 상품 사진 대신 색 칸을 보여 준다(추천대로). 메뉴에 본인은 '지인 초대', 회원은 '내 계정'이 있다.
async function openAs(page: Page, role: "member" | "owner" | null, ui = "") {
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return route.abort();
    if (u.pathname.startsWith("/api/")) return route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"not_configured"}' });
    if (route.request().resourceType() === "document" && role) {
      const res = await route.fetch();
      const html = (await res.text()).replace("<head>", `<head><meta name="hangit-role" content="${role}">`);
      return route.fulfill({ response: res, body: html });
    }
    return route.continue();
  });
  await page.goto(`/${ui ? `?${ui}` : ""}#/`);
  await page.waitForFunction(() => !!(window as any).K?.M);
}
const menu = async (page: Page) => {
  await page.getByRole("button", { name: "더보기" }).first().click();
};

test("a member sees colour tiles instead of store photos", async ({ page }) => {
  await openAs(page, "member");
  expect(await page.evaluate(() => (window as any).K.M.boot.photos)).toBe(false);
});
test("the owner keeps store photos", async ({ page }) => {
  await openAs(page, "owner");
  expect(await page.evaluate(() => (window as any).K.M.boot.photos)).toBe(true);
});
for (const [label, ui] of [["", ""], [" (vanilla)", "ui=vanilla"]] as const) {
  test(`the owner's menu has 지인 초대 and a member's has 내 계정${label}`, async ({ page }) => {
    await openAs(page, "owner", ui);
    await menu(page);
    await expect(page.getByRole("link", { name: "지인 초대" })).toHaveAttribute("href", "/_member/invites");
    await expect(page.getByRole("link", { name: "내 계정" })).toHaveCount(0);
    const other = await page.context().newPage();
    await openAs(other, "member", ui);
    await menu(other);
    await expect(other.getByRole("link", { name: "내 계정" })).toHaveAttribute("href", "/_member/account");
    await expect(other.getByRole("link", { name: "지인 초대" })).toHaveCount(0);
  });
}
test("without invite mode the menu has neither", async ({ page }) => {
  await openAs(page, null);
  await menu(page);
  await expect(page.getByRole("link", { name: "지인 초대" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "내 계정" })).toHaveCount(0);
});
