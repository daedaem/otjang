import { test, expect, type Page } from "@playwright/test";
// WO-11 design preview: the new look (v2) is opt-in. ?look=v2 or the menu
// row turns it on and it stays on this device; ?look=v1 or the same row turns
// it off. Without it the current screens are unchanged.
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
  await page.goto(`/?photos=0${search}#/`);
  await page.waitForFunction(() => !!(window as any).K?.M);
}
const look = (page: Page) => page.evaluate(() => document.documentElement.dataset.look || "");
const askButton = (page: Page) => page.getByRole("button", { name: "찾기", exact: true }).first();
const bg = (page: Page) => askButton(page).evaluate((el) => getComputedStyle(el).backgroundColor);

test("the current look stays the default", async ({ page }) => {
  await open(page);
  expect(await look(page)).toBe("");
  expect(await bg(page)).toBe("rgb(201, 70, 18)");
});

test("?look=v2 turns the new look on, keeps it after a reload and ?look=v1 turns it off", async ({ page }) => {
  await open(page, "&look=v2");
  expect(await look(page)).toBe("v2");
  expect(await bg(page)).toBe("rgb(31, 63, 128)");
  await page.goto("/?photos=0#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  expect(await look(page)).toBe("v2");
  await open(page, "&look=v1");
  expect(await look(page)).toBe("");
  expect(await bg(page)).toBe("rgb(201, 70, 18)");
});

for (const [label, ui] of [["", ""], [" (vanilla)", "&ui=vanilla"]] as const)
test(`the menu switches between the looks without reloading${label}`, async ({ page }) => {
  await open(page, ui);
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "새 디자인으로 보기" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  expect(await look(page)).toBe("v2");
  expect(await bg(page)).toBe("rgb(31, 63, 128)");
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "지금 디자인으로 보기" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  expect(await look(page)).toBe("");
  expect(await page.evaluate(() => localStorage.getItem("hangit:look"))).toBeNull();
});
