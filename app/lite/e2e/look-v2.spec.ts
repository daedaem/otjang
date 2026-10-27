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
const top = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().top);

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
  // The home redraws in the new order right away.
  await expect.poll(async () => (await top(page, "#q")) < (await top(page, ".wx"))).toBe(true);
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "지금 디자인으로 보기" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  expect(await look(page)).toBe("");
  expect(await page.evaluate(() => localStorage.getItem("hangit:look"))).toBeNull();
});

// Flow: the search box is the first thing on the 찾기 tab in the new look; the
// weather outfit follows it. The current look keeps the weather card first.
for (const [label, ui] of [["", ""], [" (vanilla)", "&ui=vanilla"]] as const)
test(`the new look puts the search box above the weather card${label}`, async ({ page }) => {
  await open(page, ui);
  await expect(page.locator(".wx").first()).toBeVisible();
  expect(await top(page, ".wx")).toBeLessThan(await top(page, "#q"));
  await open(page, `${ui}&look=v2`);
  await expect(page.locator(".wx").first()).toBeVisible();
  expect(await top(page, "#q")).toBeLessThan(await top(page, ".wx"));
  expect(await page.locator(".hero").first().evaluate((el) => !!el.previousElementSibling?.matches(".top, header"))).toBe(true);
});

test("a hung product keeps its filled hanger in the new look", async ({ page }) => {
  await open(page, "&look=v2");
  await page.evaluate(() => (window as any).K.go("results", { q: "출근용 셔츠 10만원 이하" }));
  const hang = page.locator(".grid .card .hangt").first();
  await hang.click();
  await expect(hang).toHaveAttribute("aria-pressed", "true");
  // The hanger animates its colour; wait for where it settles.
  await expect.poll(() => hang.locator("span").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(31, 63, 128)");
  await expect.poll(() => hang.locator("span").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
});

// Flow: on a product page the verdict (내 옷에 걸어 보면) comes right after the
// price in the new look; measuring, value and mirror follow it.
for (const [label, ui] of [["", ""], [" (vanilla)", "&ui=vanilla"]] as const)
test(`the new look puts the closet verdict right after the price${label}`, async ({ page }) => {
  const go = async (search: string) => {
    await open(page, search);
    await page.evaluate(() => { const K = (window as any).K; K.M.loadTrialCloset(); K.go("detail", { id: K.M.readSearch("블레이저").products[0].id }); });
    await expect(page.locator("#hangbox")).toBeVisible();
  };
  const measure = '.pdp button:has-text("내 기준 옷과 실측 비교")';
  await go(ui);
  expect(await top(page, measure)).toBeLessThan(await top(page, "#hangbox"));
  await go(`${ui}&look=v2`);
  expect(await top(page, "#hangbox")).toBeLessThan(await top(page, measure));
});

// Preview mode (?preview=1) never reads or writes this device's storage: the
// look follows ?look=v2 for that page only and the menu switch stays in memory.
test("preview mode switches the look without touching storage", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__looks = [];
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem, del = Storage.prototype.removeItem;
    Storage.prototype.getItem = function (k) { if (k === "hangit:look") w.__looks.push("get"); return get.call(this, k); };
    Storage.prototype.setItem = function (k, v) { if (k === "hangit:look") w.__looks.push("set"); return set.call(this, k, v); };
    Storage.prototype.removeItem = function (k) { if (k === "hangit:look") w.__looks.push("remove"); return del.call(this, k); };
  });
  await page.goto("/?photos=0&preview=1&look=v2#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  expect(await look(page)).toBe("v2");
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "지금 디자인으로 보기" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  expect(await look(page)).toBe("");
  expect(await page.evaluate(() => (window as any).__looks)).toEqual([]);
});

// The app's core action is labelled on the product page in the new look: the
// hanger on the photo reads 걸어 보기, then 걸어 보는 중 once hung.
test("the new look labels the product page hanger", async ({ page }) => {
  await open(page, "&look=v2");
  await page.evaluate(() => { const K = (window as any).K; K.go("detail", { id: K.M.readSearch("블레이저").products[0].id }); });
  const hang = page.locator(".pdp-photo .hangt").first();
  const label = () => hang.locator("span").evaluate((el) => getComputedStyle(el, "::after").content);
  await expect.poll(label).toBe('"걸어 보기"');
  await hang.click();
  await expect(page.locator(".pdp-photo .hangt").first()).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.locator(".pdp-photo .hangt span").first().evaluate((el) => getComputedStyle(el, "::after").content)).toBe('"걸어 보는 중"');
});
