import { test, expect, type Page } from "@playwright/test";
import { covered, overflowX, rect } from "./adaptive-helpers";
// 다기기 대응(2026-11-01 대표 "그럼 만들어줘야죠", Codex 전달): 대표 창 크기(CSS px) 시험이다.
// 실제 아이폰 듀오·폴드·플립·아이패드·갤럭시탭 기기 확인이 아니다(물리 픽셀을 환산하지 않는다).
// 단계: 휴대폰(<600) · 중간(600~899, 세로 태블릿·펼친 폴더블·분할 창) · 넓음(≥900) · 낮은 가로 창(높이 ≤500).
// 넓음과 낮은 가로 창에서는 하단 탭이 왼쪽 메뉴 줄(레일)이 된다.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
});
const SIZES = [
  ["작은 폰", 320, 568], ["좁고 긴 폰", 344, 882], ["폰", 390, 844], ["큰 폰", 430, 932],
  ["폰 가로", 844, 390], ["작은 폰 가로", 667, 375],
  ["분할 창 1/2", 507, 820], ["중간 세로", 690, 840], ["태블릿 세로", 820, 1180], ["넓은 가로 창", 890, 626],
  ["태블릿 가로", 1180, 820], ["큰 태블릿 가로", 1366, 1024],
] as const;
const VIEWS = ["home", "results", "detail", "closet", "looks", "consult", "records", "community"] as const;
async function start(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/?photos=0#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const K = (window as any).K;
    K.M.addGarment({ kind: "knit", slot: "m-knit", color: "navy", label: "내 니트", gender: "M" });
    K.M.loadTrialCloset("M");
  });
}
async function open(page: Page, v: string) {
  await page.evaluate((v) => {
    const K = (window as any).K;
    if (v === "results") K.go("results", { q: "셔츠" });
    else if (v === "detail") K.go("detail", { id: K.M.readSearch("셔츠").products[0].id });
    else K.tab(v);
  }, v);
  await page.waitForFunction((v) => (window as any).K.current().view === (v === "detail" ? "detail" : v), v);
  // Wait until the screen's island has replaced its "…여는 중이에요" placeholder and two frames have painted.
  await page.waitForFunction(() => !/여는 중이에요/.test(document.getElementById("app")?.textContent || ""));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
for (const [label, w, h] of SIZES)
  test(`${label} ${w}×${h}: every main screen fits, nothing hides under fixed bars, the menu is reachable`, async ({ page }) => {
    await start(page, w, h);
    for (const v of VIEWS) {
      await open(page, v);
      expect(await overflowX(page), `${v} sideways overflow`).toBeLessThanOrEqual(1);
      expect(await covered(page), `${v} controls under fixed bars`).toEqual([]);
      if (v !== "detail") {
        // All six menu buttons inside the window and at least 44px, read in one pass.
        const tabs = await page.locator("#tabs button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
        expect(tabs, `${v} menu`).toHaveLength(6);
        for (const r of tabs) {
          expect(r.x, `${v} tab inside`).toBeGreaterThanOrEqual(0);
          expect(r.right, `${v} tab inside`).toBeLessThanOrEqual(w + 1);
          expect(r.bottom, `${v} tab inside`).toBeLessThanOrEqual(h + 1);
          expect(Math.min(r.width, r.height), `${v} tab size`).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });

test("middle-width windows use the width instead of a 560px phone column", async ({ page }) => {
  for (const [w, h] of [[690, 840], [820, 1180]]) {
    await start(page, w, h);
    await open(page, "closet");
    const app = await rect(page, "#app");
    expect(app.w, `${w}px content`).toBeGreaterThanOrEqual(Math.min(w, 760) - 2);
    await open(page, "results");
    // Three product columns in the middle range.
    const tops = await page.locator("#grid [data-card]").evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(tops[0]).toBe(tops[2]);
    expect(tops[3]).toBeGreaterThan(tops[0]);
  }
});

for (const [label, w, h] of [["태블릿 가로", 1180, 820], ["폰 가로", 844, 390], ["작은 폰 가로", 667, 375]] as const)
  test(`${label}: the tabs become a side rail and the screen keeps its height`, async ({ page }) => {
    await start(page, w, h);
    await open(page, "closet");
    const tabs = await rect(page, "#tabs");
    expect(tabs.x).toBe(0);
    expect(tabs.w).toBeLessThanOrEqual(104);
    expect(tabs.h).toBeGreaterThanOrEqual(h - 1);
    const app = await rect(page, "#app");
    expect(app.x).toBeGreaterThanOrEqual(tabs.r);
    // The first tab sits near the top-left, labels stay readable.
    const first = await page.locator('#tabs [data-tab="home"]').boundingBox();
    expect(first!.y).toBeLessThan(h / 2);
    // Nothing is left at the bottom where the tab bar used to be.
    const bottom = await page.evaluate(() => document.elementFromPoint(innerWidth - 20, innerHeight - 10)?.closest("#tabs"));
    expect(bottom).toBeNull();
  });

test("wide closets show more columns and product pages lay out side by side from the middle range", async ({ page }) => {
  await start(page, 1180, 820);
  await open(page, "closet");
  const tops = await page.locator("[data-closet-section=trial] [data-rail-item]").evaluateAll((els) => els.slice(0, 6).map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops[0]).toBe(tops[4]);
  await page.setViewportSize({ width: 690, height: 840 });
  await open(page, "detail");
  const head = await rect(page, ".pdp-head");
  const photo = await rect(page, ".pdp-photo");
  expect(head.x).toBeGreaterThanOrEqual(photo.r - 1);
  expect(head.y).toBeLessThan(840 / 2);
});

test("on wide screens a sheet opens as a centred window, not a bottom strip", async ({ page }) => {
  await start(page, 1180, 820);
  await open(page, "closet");
  await page.getByRole("button", { name: "더보기", exact: true }).first().click();
  await page.locator("[data-backup]").click();
  const sheet = await rect(page, ".sheet");
  expect(sheet.b).toBeLessThan(820 - 16);
  expect(sheet.y).toBeGreaterThan(16);
  expect(Math.abs(sheet.x + sheet.w / 2 - 1180 / 2)).toBeLessThan(60);
});

test.describe("keyboard", () => {
  // A stand-in for the on-screen keyboard: the visual viewport shrinks while the layout viewport stays.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const vv = new EventTarget() as any;
      vv.offsetTop = 0;
      vv.offsetLeft = 0;
      vv.scale = 1;
      Object.defineProperty(vv, "width", { get: () => innerWidth });
      Object.defineProperty(vv, "height", { get: () => innerHeight - ((window as any).__kb || 0) });
      Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
      (window as any).__setKb = (px: number) => {
        (window as any).__kb = px;
        vv.dispatchEvent(new Event("resize"));
      };
    });
  });
  test("bottom input bars rise above the keyboard and the tab bar steps aside", async ({ page }) => {
    await start(page, 390, 844);
    await open(page, "consult");
    const input = page.locator("[data-react-chatbar] input, .chatbar input").first();
    await input.click();
    await input.fill("베이지 니트에 어울리는 바지");
    await page.evaluate(() => (window as any).__setKb(336));
    await expect.poll(() => rect(page, ".chatbar").then((r) => r.b)).toBeLessThanOrEqual(844 - 336 + 1);
    await expect(page.locator("#tabs")).toBeHidden();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("베이지 니트에 어울리는 바지");
    await page.evaluate(() => (window as any).__setKb(0));
    await expect(page.locator("#tabs")).toBeVisible();
    await expect.poll(() => rect(page, ".chatbar").then((r) => r.b)).toBeGreaterThan(844 - 120);
  });
  test("a sheet stays inside the area above the keyboard", async ({ page }) => {
    await start(page, 390, 844);
    await open(page, "closet");
    await page.getByRole("button", { name: "더보기", exact: true }).first().click();
    await page.locator("[data-backup]").click();
    await page.evaluate(() => (window as any).__setKb(336));
    await page.waitForFunction(() => document.querySelector(".sheet")?.getAnimations().length === 0);
    await expect.poll(() => rect(page, ".sheet").then((r) => r.b)).toBeLessThanOrEqual(844 - 336 + 1);
    const s = await rect(page, ".sheet");
    expect(s.y).toBeGreaterThanOrEqual(0);
  });
});

test("unfolding, rotating and resizing keep typing, focus, picks and scroll", async ({ page }) => {
  await start(page, 390, 844);
  await open(page, "home");
  const ask = page.locator(".ask input, input[type=search]").first();
  await ask.click();
  await ask.fill("가을 아우터 20만원 이하");
  const steps = [[844, 390], [690, 840], [820, 1180], [1180, 820], [507, 820], [390, 844]];
  for (const [w, h] of steps) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(120);
    await expect(ask).toHaveValue("가을 아우터 20만원 이하");
    await expect(ask).toBeFocused();
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
  }
  await open(page, "closet");
  const pick = page.locator("[data-closet-section=trial] [data-pick]").nth(1);
  await pick.click();
  await page.evaluate(() => window.scrollTo(0, 600));
  const item = page.locator("[data-closet-section=trial] [data-rail-item]").nth(5);
  const id = await item.getAttribute("data-rail-item");
  for (const [w, h] of steps) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(120);
    await expect(pick).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "고른 옷" })).toBeVisible();
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
  }
  // The same garment stays on screen after the round trip (scroll is kept relative to the content).
  expect(await page.locator(`[data-rail-item="${id}"]`).count()).toBe(1);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

// Codex 검토(#147) 3건: 메뉴 줄 옆 걸린 옷 띠의 폭, 넓은 화면 시트와 키보드, 아주 넓은 화면의 옷장 시트 여백.
for (const [w, h] of [[1180, 820], [844, 390]] as const)
  test(`${w}×${h}: the hung strip fits beside the side rail`, async ({ page }) => {
    await start(page, w, h);
    await page.evaluate(() => (window as any).K.go("results", { q: "셔츠" }));
    await page.locator("#grid .card .hangt").first().click();
    const strip = page.locator(".strip").first();
    await expect(strip).toBeVisible();
    // The strip slides up when it appears (.pop, 320ms); measure once it has settled.
    // CI caught the end of that slide (the end of the strip 8–27px below the window) on slower runners.
    await page.waitForFunction(() => document.querySelector(".strip")!.getAnimations({ subtree: true }).every((a) => a.playState !== "running"));
    const r = await rect(page, ".strip");
    const tabs = await rect(page, "#tabs");
    expect(r.x).toBeGreaterThanOrEqual(tabs.r - 1);
    expect(r.r).toBeLessThanOrEqual(w + 1);
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    // The strip's "옷장 >" end sits fully inside the window, compared by its box with half-pixel slack.
    const go = await rect(page, ".strip .go");
    expect(go.r, "strip end inside").toBeLessThanOrEqual(w + 0.5);
    expect(go.b, "strip end inside").toBeLessThanOrEqual(h + 0.5);
    expect(go.x).toBeGreaterThanOrEqual(r.x);
  });

test.describe("keyboard on a wide screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const vv = new EventTarget() as any;
      vv.offsetTop = 0; vv.offsetLeft = 0; vv.scale = 1;
      Object.defineProperty(vv, "width", { get: () => innerWidth });
      Object.defineProperty(vv, "height", { get: () => innerHeight - ((window as any).__kb || 0) });
      Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
      (window as any).__setKb = (px: number) => { (window as any).__kb = px; vv.dispatchEvent(new Event("resize")); };
    });
  });
  test("a centred sheet moves into the area above the keyboard instead of past the top", async ({ page }) => {
    await start(page, 1180, 820);
    await open(page, "closet");
    await page.getByRole("button", { name: "더보기", exact: true }).first().click();
    await page.locator("[data-backup]").click();
    await page.evaluate(() => (window as any).__setKb(336));
    await page.waitForFunction(() => document.querySelector(".sheet")?.getAnimations().length === 0);
    await expect.poll(() => rect(page, ".sheet").then((r) => r.b)).toBeLessThanOrEqual(820 - 336 + 1);
    expect((await rect(page, ".sheet")).y).toBeGreaterThanOrEqual(0);
  });
});

test("on a very wide window the picked-clothes sheet still leaves room for the last closet row", async ({ page }) => {
  await start(page, 1920, 1000);
  await open(page, "closet");
  await page.locator("[data-closet-section=trial] [data-pick]").first().click();
  const sheet = page.getByRole("region", { name: "고른 옷" });
  await expect(sheet).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const top = (await sheet.boundingBox())!.y;
  // The end of the closet content (whatever column it sits in) stops above the sheet.
  const end = await page.evaluate(() => Math.max(...[...document.querySelectorAll<HTMLElement>("#app *")].filter((e) => e.offsetParent && e.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })).map((e) => e.getBoundingClientRect().bottom)));
  expect(end).toBeLessThanOrEqual(top + 1);
  expect(await covered(page)).toEqual([]);
});
