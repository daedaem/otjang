import { test, expect, type Page } from "@playwright/test";
// WO-08 baseline: the shared app chrome and sheets had little browser
// coverage. These tests pin today's behaviour of the bottom tabs, the hanger
// strip, the menu, the disclosure sheet, the theme toggle, starting over,
// adding a garment by kind and colour, toasts and the persistent storage
// notice, so the React move must keep it.
const KEY = "eoul-d12-hang:v1";
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
});
async function open(page: Page) {
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
}
const tabs = (page: Page) => page.getByRole("navigation", { name: "메뉴" });
const current = (page: Page) => tabs(page).locator("[aria-current=page]");

test("bottom tabs move between the five tab screens and mark the current one", async ({ page }) => {
  await open(page);
  await expect(current(page)).toHaveText("옷장");
  for (const [name, hash] of [
    ["찾기", /#\/$/],
    ["코디", /#\/looks$/],
    ["상담", /#\/consult$/],
    ["기록", /#\/records$/],
    ["옷장", /#\/closet$/],
  ] as const) {
    await tabs(page).getByRole("button", { name }).click();
    await expect(page).toHaveURL(hash);
    await expect(current(page)).toHaveText(name);
    await expect(current(page).locator("i")).toHaveClass(/ph-fill/);
  }
  await page.evaluate(() => (window as any).K.go("results", { q: "셔츠" }));
  await expect(current(page)).toHaveText("찾기");
  await page.evaluate(() => (window as any).K.go("detail", { id: "ms-728000" }));
  await expect(tabs(page)).toBeHidden();
});

test("the hanger strip appears with hung items, summarises them and opens the closet", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).K.tab("home"));
  const strip = page.locator("#strip");
  await expect(strip).toBeHidden();
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.compareAdd("ms-728000");
    m.compareAdd("ms-854339");
    (window as any).K.refresh();
  });
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("걸어 봄 2 · 나란히 비교");
  await expect(strip).toContainText("옷장");
  await expect(strip).toHaveAccessibleName("옷걸이 열기");
  await strip.click();
  await expect(page).toHaveURL(/#\/closet$/);
  await expect(strip).toBeHidden();
});

test("the menu opens the disclosure, toggles the theme and starts over", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).K.M.addGarment({ kind: "shirt", color: "white" }));
  await page.getByRole("button", { name: "더보기" }).first().click();
  const menu = page.getByRole("dialog");
  for (const row of ["이 시안에 대해", "백업 · 복원", "밝게 · 어둡게", "처음부터 다시"])
    await expect(menu.getByRole("button", { name: row })).toBeVisible();
  await menu.getByRole("button", { name: "이 시안에 대해" }).click();
  const info = page.getByRole("dialog");
  const title = await page.evaluate(() => (window as any).K.M.disclosure().title);
  await expect(info.getByRole("heading", { level: 2 })).toHaveText(title);
  for (const h of ["오늘 날씨 코디", "AI 순위와 상담", "직접 등록한 옷"])
    await expect(info.getByRole("heading", { level: 3, name: h })).toBeVisible();
  await info.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const before = await page.evaluate(() => document.documentElement.dataset.theme || "");
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "밝게 · 어둡게" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(["light", "dark"]).toContain(after);
  expect(after).not.toBe(before);
  await page.getByRole("button", { name: "더보기" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "처음부터 다시" }).click();
  await expect(page).toHaveURL(/#\/$/);
  expect(await page.evaluate(() => (window as any).K.M.getState().closet.length)).toBe(0);
});

test("the info button opens the disclosure and Escape closes it", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).K.tab("records"));
  await page.getByRole("button", { name: "가격·사진·판단 기준 보기" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { level: 3, name: "AI 순위와 상담" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("adding by kind and colour asks the kind, then the colour, then confirms with a toast", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "종류·색으로 넣기" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "어떤 옷을 걸까요?" })).toBeVisible();
  // Each kind button holds a picture labelled with the kind, then the kind name.
  await sheet.getByRole("button", { name: "셔츠 셔츠", exact: true }).click();
  await expect(sheet.getByRole("heading", { name: "셔츠 색을 골라 주세요" })).toBeVisible();
  await sheet.getByRole("button", { name: "화이트", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const toast = page.locator(".k-toast");
  await expect(toast).toHaveText("옷장에 넣었어요");
  await expect(toast).toHaveAttribute("role", "status");
  expect(await page.evaluate(() => (window as any).K.M.getState().closet.map((g: any) => [g.kind, g.color]))).toEqual([["shirt", "white"]]);
});

test("an unreadable closet keeps a notice with backup, raw download and a two-step fresh start", async ({ page }) => {
  await open(page);
  await page.evaluate((k) => localStorage.setItem(k, "{broken"), KEY);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).K?.M);
  const notice = page.locator("#eo-storage-issue");
  await expect(notice).toHaveAttribute("role", "alert");
  await expect(notice.getByRole("button", { name: "전체 백업 열기" })).toBeVisible();
  const download = page.waitForEvent("download");
  await notice.getByRole("button", { name: "원문 받기(옷장)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^eoul-closet-unreadable-\d{4}-\d{2}-\d{2}\.json$/);
  const fresh = notice.getByRole("button", { name: "원문을 이 기기에 따로 보관하고 새로 시작" });
  await fresh.click();
  await expect(notice.getByRole("button", { name: "한 번 더 누르면 새로 시작해요" })).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe("{broken");
  await notice.getByRole("button", { name: "한 번 더 누르면 새로 시작해요" }).click();
  await expect(page.locator(".k-toast")).toHaveText("원문은 이 기기에 따로 보관했어요. 새로 시작합니다.");
  await expect(page.locator("#eo-storage-issue")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).K.M.storageIssue?.() || null)).toBeNull();
});
