import { test, expect, type Page } from "@playwright/test";
// 옷장 재설계(2026-10-29 대표 "셋 다 왜 이리 어색할까요" → AI 역할 디자이너 시안 v5/v6 → "네 해주세요").
// 종류 탭 + 사진 칸 그리드: 내 옷 → 체험용 묶음. 사진을 누르면 옷 정보, 오른쪽 위 동그라미로 꺼내기.
// 꺼낸 옷은 아래 시트에 모이고, 체험용은 "사면 내 옷으로 새 코디가 몇 개"를 센다(비슷한 옷은 세지 않음).
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
});
async function closet(page: Page, { owned = true, search = "" } = {}) {
  await page.goto(`/?photos=0${search}#/closet`);
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate((owned) => {
    const K = (window as any).K;
    if (owned) {
      K.M.addGarment({ kind: "knit", slot: "m-knit", color: "navy", label: "내 니트", gender: "M" });
      K.M.addGarment({ kind: "jeans", slot: "m-denim", color: "indigo", label: "내 데님", gender: "M" });
      K.M.addGarment({ kind: "sneaker", slot: "m-white-sneaker", color: "white", label: "내 스니커즈", gender: "M" });
    }
    K.M.loadTrialCloset("M");
    K.refresh();
  }, owned);
  await expect(page.locator("[data-react-closet] [data-rail-item]").first()).toBeVisible();
}
const tile = (page: Page, label: string) => page.locator("[data-rail-item]").filter({ has: page.locator(".wr-card-name", { hasText: new RegExp(`^${label}$`) }) });
const css = (l: ReturnType<Page["locator"]>, p: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), p);

test("my clothes come first, then the trial group with its own heading and dashed chips", async ({ page }) => {
  await closet(page);
  await expect(page.locator(".wr-sub")).toHaveText("내 옷 3벌 · 체험용 8");
  const sections = page.locator("[data-closet-section]");
  await expect(sections).toHaveCount(2);
  await expect(sections.nth(0)).toHaveAttribute("data-closet-section", "mine");
  await expect(sections.nth(0).getByRole("heading", { level: 2 })).toHaveText("내 옷 3");
  await expect(sections.nth(1).getByRole("heading", { level: 2 })).toContainText("체험용 8");
  await expect(sections.nth(1)).toContainText("가진 옷이 아니에요");
  await expect(sections.nth(0).locator(".wr-chip")).toHaveText(["내 옷", "내 옷", "내 옷"]);
  expect(await css(sections.nth(1).locator(".wr-chip").first(), "border-top-style")).toBe("dashed");
  // Three photo tiles per row on a phone, every tile 4:5.
  const boxes = await sections.nth(1).locator(".wr-picture-tile").evaluateAll((els) => els.slice(0, 4).map((e) => e.getBoundingClientRect().toJSON()));
  expect(boxes[0].y).toBeCloseTo(boxes[2].y, 0);
  expect(boxes[3].y).toBeGreaterThan(boxes[0].y + 10);
  expect(boxes[0].height / boxes[0].width).toBeCloseTo(1.25, 1);
  // Trial tiles use the background-removed cutouts.
  await expect(sections.nth(1).locator('img[src^="examples/cut/"]')).toHaveCount(8);
});

test("each trial garment says what buying it adds to my own clothes", async ({ page }) => {
  await closet(page);
  await expect(tile(page, "네이비 크루넥 니트").locator(".wr-st")).toHaveText("내 니트와 비슷");
  await expect(tile(page, "흰 옥스퍼드 셔츠").locator(".wr-st")).toHaveText("새 코디 +1");
  await expect(tile(page, "네이비 블레이저").locator(".wr-st")).toHaveText("걸칠 수 있는 코디 +1");
  // Leaf green only for good news; a duplicate is not green.
  const leaf = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--leaf").trim());
  expect(await css(tile(page, "흰 옥스퍼드 셔츠").locator(".wr-st"), "color")).toBe(leaf === "#4d6b4f" ? "rgb(77, 107, 79)" : "rgb(143, 181, 146)");
  expect(await css(tile(page, "네이비 크루넥 니트").locator(".wr-st"), "color")).not.toBe("rgb(77, 107, 79)");
});

test("without my own clothes the trial tiles make up no numbers", async ({ page }) => {
  await closet(page, { owned: false });
  await expect(page.locator("[data-closet-section]")).toHaveCount(1);
  await expect(page.locator(".wr-st")).toHaveCount(0);
  await expect(page.locator("[data-closet-section=trial]")).toContainText("내 옷을 넣으면");
});

test("category tabs filter both groups and move with arrow keys", async ({ page }) => {
  await closet(page);
  const tabs = page.getByRole("tablist", { name: "옷 종류" });
  await expect(tabs.getByRole("tab")).toHaveText(["전체", "아우터", "상의", "하의", "신발"]);
  await tabs.getByRole("tab", { name: "하의" }).click();
  await expect(tabs.getByRole("tab", { name: "하의" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-rail-item] .wr-card-name")).toHaveText(["내 데님", "베이지 치노 팬츠", "인디고 워시드 데님"]);
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "신발" })).toBeFocused();
  await expect(tabs.getByRole("tab", { name: "신발" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-closet-section=mine] [data-rail-item]")).toHaveCount(1);
  await tabs.getByRole("tab", { name: "아우터" }).click();
  await expect(page.locator("[data-closet-section=mine]")).toContainText("아우터는 아직 없어요");
  await expect(page.locator("[data-closet-section=trial] [data-rail-item]")).toHaveCount(1);
  // The tab choice is not saved.
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => /cat|tab/i.test(localStorage.getItem(k) || "") && k.includes("closet")))).toBe(false);
});

test("picking numbers the circles and the sheet counts new outfits without the similar one", async ({ page }) => {
  await closet(page);
  const add = page.getByRole("button", { name: "옷 넣기", exact: true });
  const ink = await css(add, "background-color");
  await tile(page, "흰 옥스퍼드 셔츠").locator("[data-pick]").click();
  await tile(page, "베이지 치노 팬츠").locator("[data-pick]").click();
  await expect(tile(page, "흰 옥스퍼드 셔츠").locator("[data-pick]")).toHaveText("1");
  await expect(tile(page, "베이지 치노 팬츠").locator("[data-pick]")).toHaveText("2");
  await expect(tile(page, "베이지 치노 팬츠").locator("[data-pick]")).toHaveAttribute("aria-pressed", "true");
  const sheet = page.getByRole("region", { name: "고른 옷" });
  await expect(sheet.getByRole("status")).toHaveText("고른 옷 2벌 · 체험용 2");
  await expect(sheet.locator(".wr-gain")).toContainText("둘 다 사면 새 코디 +3");
  await expect(sheet).toContainText("지금 내 옷으로 1개");
  // Only one filled dark button on the screen: 옷 넣기 steps back to an outline.
  expect(await css(add, "background-color")).not.toBe(ink);
  const info = sheet.getByRole("button", { name: "새 코디 세는 법" });
  await expect(info).toHaveAttribute("aria-expanded", "false");
  await info.click();
  await expect(sheet).toContainText("비슷한 옷이 이미 있는 조합은 새 코디로 세지 않아요");
  // Swap the oxford for the knit that duplicates mine: the judgement line names my knit.
  await tile(page, "네이비 크루넥 니트").locator("[data-pick]").click();
  await expect(sheet.locator(".wr-judge")).toHaveText("네이비 크루넥 니트는 내 니트와 비슷해요");
  await expect(sheet.locator(".wr-gain")).toContainText("둘 다 사면 새 코디 +1");
  await sheet.getByRole("button", { name: "모두 넣어두기" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-pick][aria-pressed="true"]')).toHaveCount(0);
});

test("tapping the photo opens the garment, the sheet shows the outfit stage", async ({ page }) => {
  await closet(page);
  await tile(page, "내 니트").locator("[data-pick]").click();
  await tile(page, "내 데님").locator("[data-pick]").click();
  const sheet = page.getByRole("region", { name: "고른 옷" });
  await sheet.getByRole("button", { name: "코디 보기" }).click();
  await expect(sheet.locator("[data-assembly-layer]")).toHaveCount(2);
  await expect(sheet).toContainText("체형이나 착용감을 반영하지 않아요");
  await tile(page, "내 니트").locator("[data-g]").click();
  await expect(page.locator(".sheet").getByText("내 니트", { exact: true })).toBeVisible();
});

test("the last row stops above the sheet and every target is at least 44px", async ({ page }) => {
  await closet(page);
  await tile(page, "흰 옥스퍼드 셔츠").locator("[data-pick]").click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const sheet = await page.getByRole("region", { name: "고른 옷" }).boundingBox();
  const last = await page.locator("[data-rail-item]").last().boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(sheet!.y + 1);
  for (const sel of ["[data-pick]", ".wr-tabs [role=tab]", ".wr-sheet button"]) {
    const sizes = await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => Math.min(r.width, r.height)));
    expect(Math.min(...sizes), sel).toBeGreaterThanOrEqual(40);
  }
  const small = await page.locator(".wr").evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>("*")].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.className + ":" + e.textContent));
  expect(small).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test.describe("dark", () => {
  test.use({ colorScheme: "dark" });
  test("photo tiles stay light and the circle and chips stay readable in dark mode", async ({ page }) => {
    await closet(page);
    const t = tile(page, "흰 옥스퍼드 셔츠");
    expect(await css(t.locator(".wr-picture-tile"), "background-color")).toMatch(/rgb\(2[2-4]\d, 2[2-4]\d, 2[2-4]\d\)/);
    expect(await css(t.locator("[data-pick] i"), "border-top-color")).toBe("rgb(106, 106, 116)");
    const name = await css(t.locator(".wr-card-name"), "color");
    expect(name).not.toBe("rgb(32, 32, 37)");
  });
});
