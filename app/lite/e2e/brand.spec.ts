import { test, expect, type Page } from "@playwright/test";
// WO-11 brand: the service name 행잇 (Hangit) and its mark replace the
// "이름 미정" placeholder in the page title, the install manifest, the icons
// and the top bar of every screen, in both the React and the vanilla screens.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
});
async function open(page: Page, hash: string, search = "") {
  await page.goto(`/?photos=0${search}#${hash}`);
  await page.waitForFunction(() => !!(window as any).K?.M);
}

test("the page title, install manifest and icon carry the name", async ({ page, request }) => {
  await open(page, "/");
  await expect(page).toHaveTitle("행잇");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "행잇");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.short_name).toBe("행잇");
  expect(manifest.name).toContain("행잇");
  expect(manifest.name).not.toContain("이름 미정");
  const icon = await (await request.get("/icons/icon.svg")).text();
  expect(icon).toContain("<title>행잇");
});

// The React outfits screen titles its own top bar ("내 옷으로") and has no
// name mark; every other tab's top bar starts with the name.
for (const ui of ["", "&ui=vanilla"]) {
  test(`the tab top bars show the 행잇 mark${ui ? " (vanilla)" : ""}`, async ({ page }) => {
    await open(page, "/closet", ui);
    for (const tab of ["home", "looks", "closet", "consult", "records"]) {
      await page.evaluate((t) => (window as any).K.tab(t), tab);
      if (ui || tab !== "looks") {
        const mark = page.locator("#app .top .mark").first();
        await expect(mark.getByRole("img", { name: "행잇" })).toBeVisible();
      }
      await expect(page.locator("#app")).not.toContainText("이름 미정");
    }
  });
}
