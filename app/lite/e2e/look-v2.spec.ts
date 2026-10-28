import { test, expect, type Page } from "@playwright/test";
// WO-11: the new look (v2) is the default (owner 10-27 21:55: Claude finishes
// the design, then makes it the default). ?look=v1 or the menu row 이전 디자인으로
// 보기 brings back the previous look on this device; ?look=v2 or 새 디자인으로
// 보기 returns.
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

test("the new look is the default", async ({ page }) => {
  await open(page);
  expect(await look(page)).toBe("v2");
  expect(await bg(page)).toBe("rgb(32, 32, 37)");
  expect(await page.evaluate(() => localStorage.getItem("hangit:look"))).toBeNull();
});

test("?look=v1 brings back the previous look, keeps it after a reload and ?look=v2 returns", async ({ page }) => {
  await open(page, "&look=v1");
  expect(await look(page)).toBe("");
  expect(await bg(page)).toBe("rgb(201, 70, 18)");
  await page.goto("/?photos=0#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  expect(await look(page)).toBe("");
  await open(page, "&look=v2");
  expect(await look(page)).toBe("v2");
  expect(await bg(page)).toBe("rgb(32, 32, 37)");
  expect(await page.evaluate(() => localStorage.getItem("hangit:look"))).toBeNull();
});

for (const [label, ui] of [["", ""], [" (vanilla)", "&ui=vanilla"]] as const)
test(`the menu switches between the looks without reloading${label}`, async ({ page }) => {
  await open(page, ui);
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "이전 디자인으로 보기" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  expect(await look(page)).toBe("");
  expect(await bg(page)).toBe("rgb(201, 70, 18)");
  expect(await page.evaluate(() => localStorage.getItem("hangit:look"))).toBe("v1");
  // The home redraws in the previous order right away.
  await expect.poll(async () => (await top(page, ".wx")) < (await top(page, "#q"))).toBe(true);
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "새 디자인으로 보기" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  expect(await look(page)).toBe("v2");
  await expect.poll(async () => (await top(page, "#q")) < (await top(page, ".wx"))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("hangit:look"))).toBeNull();
});

// Flow: the search box is the first thing on the 찾기 tab in the new look; the
// weather outfit follows it. The current look keeps the weather card first.
for (const [label, ui] of [["", ""], [" (vanilla)", "&ui=vanilla"]] as const)
test(`the new look puts the search box above the weather card${label}`, async ({ page }) => {
  await open(page, `${ui}&look=v1`);
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
  await expect.poll(() => hang.locator("span").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(91, 58, 36)");
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
  await go(`${ui}&look=v1`);
  expect(await top(page, measure)).toBeLessThan(await top(page, "#hangbox"));
  await go(`${ui}&look=v2`);
  expect(await top(page, "#hangbox")).toBeLessThan(await top(page, measure));
});

// Preview mode (?preview=1) never reads or writes this device's storage: it
// opens in the new look, ?look=v1 applies to that page only and the menu
// switch stays in memory.
test("preview mode switches the look without touching storage", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__looks = [];
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem, del = Storage.prototype.removeItem;
    Storage.prototype.getItem = function (k) { if (k === "hangit:look") w.__looks.push("get"); return get.call(this, k); };
    Storage.prototype.setItem = function (k, v) { if (k === "hangit:look") w.__looks.push("set"); return set.call(this, k, v); };
    Storage.prototype.removeItem = function (k) { if (k === "hangit:look") w.__looks.push("remove"); return del.call(this, k); };
  });
  await page.goto("/?photos=0&preview=1#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  expect(await look(page)).toBe("v2");
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "이전 디자인으로 보기" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  expect(await look(page)).toBe("");
  await page.goto("/?photos=0&preview=1&look=v1#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
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

// Owner 10-28 00:04: the screen stays achromatic so the clothes carry the
// colour. 00:07: the brand colour is wood (walnut, like a wooden hanger) and
// stays only in the logo and the app icon.
test("the new look is achromatic and keeps the walnut brand colour only in the logo", async ({ page }) => {
  await open(page);
  expect(await bg(page)).toBe("rgb(32, 32, 37)");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--acc").trim())).toBe("#202025");
  expect(await page.locator(".mark .wm-i").first().evaluate((el) => getComputedStyle(el).stroke)).toBe("rgb(91, 58, 36)");
});

test.describe("dark", () => {
  test.use({ colorScheme: "dark" });
  test("the new look's buttons are light on dark, still without a hue", async ({ page }) => {
    await open(page);
    expect(await bg(page)).toBe("rgb(247, 247, 248)");
    expect(await page.locator(".mark .wm-i").first().evaluate((el) => getComputedStyle(el).stroke)).toBe("rgb(196, 153, 107)");
  });
});

// Owner 10-28 08:00 (panel "D+"): walnut means hung / wardrobe, leaf green only
// good news, buttons stay ink.
const WALNUT = "rgb(91, 58, 36)", LEAF = "rgb(77, 107, 79)";
const css = (l: ReturnType<Page["locator"]>, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test("walnut marks what is hung: the hung hanger and the 걸어 봄 strip", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).K.go("results", { q: "출근용 셔츠 10만원 이하" }));
  const hang = page.locator(".grid .card .hangt").first();
  await hang.click();
  await expect.poll(() => css(hang.locator("span"), "background-color")).toBe(WALNUT);
  expect(await css(hang.locator("span"), "box-shadow")).toContain("rgb(255, 255, 255)");
  await expect(page.locator(".strip").first()).toBeVisible();
  await expect.poll(() => css(page.locator(".strip").first(), "background-color")).toBe(WALNUT);
  expect(await bg(page).catch(() => "")).not.toBe(WALNUT);
});

test("the closet rod is a 4px walnut line with walnut hangers", async ({ page }) => {
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => { const K = (window as any).K; K.M.loadTrialCloset("M"); K.refresh(); });
  const rod = page.locator(".wr-rail-scroll").first();
  await expect(rod).toBeVisible();
  expect(await css(rod, "border-top-width")).toBe("4px");
  expect(await css(rod, "border-top-color")).toBe(WALNUT);
  expect(await css(page.locator(".wr-hanger path").first(), "stroke")).toBe(WALNUT);
});

test("leaf green marks only good news", async ({ page }) => {
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const K = (window as any).K;
    (window as any).EOUL_WEATHER = async () => ({ place: "서울", today: { min: 9, max: 18, rain: false, date: "2026-10-28" }, tomorrow: { min: 8, max: 16, rain: true, date: "2026-10-29" } });
    K.M.loadTrialCloset("M"); K.refresh(); K.tab("home");
  });
  const good = page.locator(".wx-why.good i").first();
  await expect(good).toBeVisible();
  expect(await css(good, "color")).toBe(LEAF);
  // A good verdict (no overlap → new outfits) is green; an overlap is not.
  await page.evaluate(() => { const K = (window as any).K; K.go("detail", { id: K.M.readSearch("코트").products[0].id }); });
  await page.locator("#hangbox").getByRole("button", { name: "없어요", exact: true }).click();
  await expect(page.locator("#hangbox .h2 b.good")).toBeVisible();
  expect(await css(page.locator("#hangbox .h2 b").first(), "color")).toBe(LEAF);
  await page.evaluate(() => { const K = (window as any).K; K.go("detail", { id: K.M.readSearch("블레이저").products[0].id }); });
  await expect(page.locator("#hangbox .h2")).toContainText("비슷한 옷이");
  expect(await css(page.locator("#hangbox .h2 b").first(), "color")).not.toBe(LEAF);
});

test("small grey text meets 4.5:1 in the new look", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ink3").trim())).toBe("#6a6a74");
});

// Panel D+ step 2: the closet shows the clothes, not text. In the new look the
// photos are about 1.5x taller (lengths keep their ratio), the name is one line,
// 체험용 sits on the photo, and info / my photo are small icon buttons.
async function closet(page: Page, search = "") {
  await page.goto(`/?photos=0${search}#/closet`);
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => { const K = (window as any).K; K.M.loadTrialCloset("M"); K.refresh(); });
  await expect(page.locator(".wr-card").first()).toBeVisible();
}
test("the new look's closet shows bigger clothes with less text", async ({ page }) => {
  await closet(page);
  const card = page.locator(".wr-card").first();
  const pic = await card.locator("[data-garment-height]").boundingBox();
  expect(pic!.height).toBeGreaterThanOrEqual(150);
  await expect(card.locator(".wr-trial-chip")).toBeVisible();
  await expect(card.locator(".wr-trial-chip")).toHaveText("체험용");
  await expect(card.locator(".wr-meta")).toBeHidden();
  const info = card.getByRole("button", { name: /옷 정보$/ });
  await expect(info).toBeVisible();
  const box = await info.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(48);
  // The name stays on one line.
  const name = await card.locator(".wr-card-name").boundingBox();
  expect(name!.height).toBeLessThanOrEqual(22);
});
test("the previous look keeps the closet as it was", async ({ page }) => {
  await closet(page, "&look=v1");
  const card = page.locator(".wr-card").first();
  const pic = await card.locator("[data-garment-height]").boundingBox();
  expect(pic!.height).toBeLessThan(120);
  await expect(card.locator(".wr-meta")).toBeVisible();
  await expect(card.locator(".wr-trial-chip")).toBeHidden();
});
test.describe("dark closet", () => {
  test.use({ colorScheme: "dark" });
  // Photo tiles stay light in dark mode, so what sits on the photo stays dark ink.
  test("the closet photo chip and buttons stay readable in dark mode", async ({ page }) => {
    await closet(page);
    const card = page.locator(".wr-card").first();
    expect(await css(card.locator(".wr-trial-chip"), "color")).toBe("rgb(85, 85, 96)");
    expect(await css(card.getByRole("button", { name: /옷 정보$/ }), "color")).toBe("rgb(32, 32, 37)");
  });
});
test("the closet rail leaves no tall gap under the clothes", async ({ page }) => {
  await closet(page);
  const name = await page.locator(".wr-card-name").first().boundingBox();
  const track = await page.locator(".wr-track").first().boundingBox();
  expect(track!.y + track!.height - (name!.y + name!.height)).toBeLessThanOrEqual(40);
});

// Panel D+ step 3: on a product page the outfits made with my clothes are big
// cards (2x2 pieces) that swipe sideways, and the item being bought is outlined
// in walnut. The previous look keeps four small pieces in a row.
async function looksOnDetail(page: Page, search: string) {
  await open(page, search);
  await page.evaluate(() => { const K = (window as any).K; K.M.loadTrialCloset("M"); K.go("detail", { id: K.M.readSearch("코트").products[0].id }); });
  await page.locator("#hangbox").getByRole("button", { name: "없어요", exact: true }).click();
  await expect(page.locator("#hangbox .looks2 .lk").first()).toBeVisible();
}
for (const [label, ui] of [["", ""], [" (vanilla)", "&ui=vanilla"]] as const)
test(`the new look shows outfits on a product page as big swipe cards${label}`, async ({ page }) => {
  await looksOnDetail(page, ui);
  const row = page.locator("#hangbox .looks2");
  expect(await css(row, "overflow-x")).toBe("auto");
  expect(await css(row, "scroll-snap-type")).toContain("x");
  const cards = row.locator(".lk");
  const n = await cards.count();
  const first = await cards.first().boundingBox();
  if (n > 1) {
    const second = await cards.nth(1).boundingBox();
    expect(second!.x).toBeGreaterThan(first!.x + first!.width / 2); // side by side, not stacked
  }
  const pieces = cards.first().locator(".p1 .ph-box, .p1 [data-tile], .p1 img").first();
  const cell = await cards.first().locator(".p1").first().boundingBox();
  expect(cell!.width).toBeGreaterThanOrEqual(130);
  await expect(pieces).toBeVisible();
  const me = cards.first().locator(".p1.me").first();
  await expect(me).toBeVisible();
  // The mark sits on a layer above the photo (the photo is positioned and
  // would cover a shadow or outline on the box itself).
  const mark = await me.locator(".ph-box").first().evaluate((el) => { const c = getComputedStyle(el, "::after"); return { shadow: c.boxShadow, pos: c.position, z: c.zIndex }; });
  expect(mark.shadow).toContain("rgb(91, 58, 36)");
  expect(mark.pos).toBe("absolute");
  expect(mark.z).toBe("1");
});
test("the previous look keeps the product page outfits as four small pieces", async ({ page }) => {
  await looksOnDetail(page, "&look=v1");
  const cell = await page.locator("#hangbox .looks2 .lk .p1").first().boundingBox();
  expect(cell!.width).toBeLessThan(100);
});

// Panel D+ step 3: every hang gives a short pop on the 걸어 봄 strip's hanger
// (200ms), not only the first one. The previous look keeps its behaviour.
for (const [label, ui] of [["", ""], [" (vanilla)", "&ui=vanilla"]] as const)
test(`each hang pops the strip hanger in the new look${label}`, async ({ page }) => {
  await open(page, ui);
  await page.evaluate(() => (window as any).K.go("results", { q: "출근용 셔츠 10만원 이하" }));
  const hangs = page.locator(".grid .card .hangt");
  await hangs.nth(0).click();
  await expect(page.locator(".strip").first()).toBeVisible();
  await hangs.nth(1).click();
  await expect(page.locator(".strip").first()).toContainText("2");
  const icon = page.locator(".strip .in > i").first();
  expect(await css(icon, "animation-name")).toBe("pop");
  expect(await css(icon, "animation-duration")).toBe("0.2s");
});
