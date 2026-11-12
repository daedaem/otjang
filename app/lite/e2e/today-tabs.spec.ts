import { test, expect, type Page } from "@playwright/test";
// 개편 A 2단계(대표 11-12 "추천대로", 11-13): 새 화면(?look=v3)에서는 탭이 오늘·옷장·찾기·둘러보기·나 다섯 개다.
// 옷 찾기는 홈에서 찾기 탭으로, 코디 상담은 찾기 탭 안으로, 기록·내 코디·설정은 나 탭으로 간다. 기본 화면은 탭 6개 그대로.
let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], fetchedAt: "2026-10-27T00:00:00.000Z", usableCount: 0 }) });
    return r.continue();
  });
});
test.afterEach(() => expect(errors).toEqual([]));

async function open(page: Page, search = "", hash = "#/") {
  await page.goto(`/?photos=0${search}${hash}`);
  await page.waitForFunction(() => !!(window as any).K?.M);
  await expect(page.locator('nav[aria-label="메뉴"][data-react-chrome]')).toBeVisible();
}
const nav = (page: Page) => page.locator('nav[aria-label="메뉴"]');
const labels = (page: Page) => nav(page).getByRole("button").evaluateAll((els) => els.map((el) => el.textContent!.trim()));
const current = (page: Page) => nav(page).locator('[aria-current="page"]');

test("the default look keeps its six tabs", async ({ page }) => {
  await open(page);
  expect(await labels(page)).toEqual(["찾기", "코디", "옷장", "커뮤니티", "상담", "기록"]);
});

test("the new look has five tabs and opens on 오늘", async ({ page }) => {
  await open(page, "&look=v3");
  expect(await labels(page)).toEqual(["오늘", "옷장", "찾기", "둘러보기", "나"]);
  await expect(current(page)).toHaveText("오늘");
  await expect(page.locator(".hm-today")).toBeVisible();
});

test("찾기 is its own tab: search, chips and consult live there and results stay under it", async ({ page }) => {
  await open(page, "&look=v3");
  await nav(page).getByRole("button", { name: "찾기", exact: true }).click();
  await expect(current(page)).toHaveText("찾기");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("찾는 옷이 있나요?");
  await expect(page.locator("[data-react-weather]")).toHaveCount(0);
  expect(await page.evaluate(() => location.hash)).toBe("#/find");
  await expect(page.locator("[data-react-home]").getByRole("button", { name: "코디 상담에 물어보기" })).toBeVisible();
  await page.getByLabel("찾는 옷", { exact: true }).fill("흰 셔츠");
  await page.getByRole("search").getByRole("button", { name: "찾기", exact: true }).click();
  await expect(page.locator("[data-react-results]")).toBeVisible();
  await expect(current(page)).toHaveText("찾기");
});

test("consult opens from 찾기 and keeps that tab", async ({ page }) => {
  await open(page, "&look=v3", "#/find");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("찾는 옷이 있나요?");
  await page.locator("[data-react-home]").getByRole("button", { name: "코디 상담에 물어보기" }).click();
  await expect(page.locator("[data-react-consult]")).toBeVisible();
  await expect(current(page)).toHaveText("찾기");
});

test("나 gathers records, my outfits, consult history and settings", async ({ page }) => {
  await open(page, "&look=v3");
  await nav(page).getByRole("button", { name: "나", exact: true }).click();
  await expect(current(page)).toHaveText("나");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("나");
  expect(await page.evaluate(() => location.hash)).toBe("#/me");
  const me = page.locator("[data-react-home]");
  await me.getByRole("button", { name: /^기록/ }).click();
  await expect(page.locator("[data-react-records]")).toBeVisible();
  await expect(current(page)).toHaveText("나");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("나");
  await me.getByRole("button", { name: /^설정/ }).click();
  await expect(page.getByRole("dialog")).toContainText("새 홈 화면 끄기");
});

test("둘러보기 is the community and 코디 더 보기 stays under 오늘", async ({ page }) => {
  await open(page, "&look=v3");
  await nav(page).getByRole("button", { name: "둘러보기", exact: true }).click();
  await expect(current(page)).toHaveText("둘러보기");
  await expect(page.locator("#react-community, [data-react-community]").first()).toBeVisible();
  await page.evaluate(() => (window as any).K.tab("looks"));
  await expect(current(page)).toHaveText("오늘");
});

test("turning the new home off from 나 returns to the six tabs on the home", async ({ page }) => {
  await open(page, "&look=v3", "#/me");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("나");
  await page.locator("[data-react-home]").getByRole("button", { name: /^설정/ }).click();
  await page.getByRole("button", { name: "새 홈 화면 끄기" }).click();
  expect(await labels(page)).toEqual(["찾기", "코디", "옷장", "커뮤니티", "상담", "기록"]);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("뭐 사려고요?");
  await expect(current(page)).toHaveText("찾기");
});
