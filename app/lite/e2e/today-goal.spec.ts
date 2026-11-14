import { test, expect, type Page } from "@playwright/test";
// 개편 A 3~5단계(대표 11-12 "추천대로", 11-14 "네네 진행해서 완료지어주세요"). 새 화면(?look=v3)에서만:
// 3 상품 화면 「살까 말까」 — 내 옷장 판정 먼저, 「이 옷을 넣으면」 목표 변화, 「어디서 살까」, 내 사진 옆에 놓고 보기.
// 4 옷장 탭 「스타일 목표」 — 목표 고르기(이 기기에 기억), 기본 옷 중 가진 것·빈자리 지도, 먼저 채울 옷.
// 5 「찾는 중」 — 본 옷·상품을 적어 두고 판매처·중고에서 다시 찾기(자동 알림 없음).
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

async function open(page: Page, search = "&look=v3", hash = "#/closet") {
  await page.goto(`/?photos=0${search}${hash}`);
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "shirt", slot: "m-oxford", color: "white", label: "내 셔츠", gender: "M" });
    m.addGarment({ kind: "pants", slot: "m-chino", color: "beige", label: "내 치노", gender: "M" });
    m.addGarment({ kind: "sneaker", slot: "m-white-sneaker", color: "white", label: "내 스니커즈", gender: "M" });
  });
}
const missing = (page: Page) =>
  page.evaluate(() => (window as any).K.M.styleGoal("classic").items.find((i: any) => i.state === "missing" && i.product));
const goal = (page: Page) => page.getByRole("region", { name: "스타일 목표", exact: true });
const nav = (page: Page) => page.locator('nav[aria-label="메뉴"]');

test("the closet tab shows the style goal: what I have, the gaps and what to fill first", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).K.tab("closet"));
  const g = goal(page);
  await expect(g).toBeVisible();
  const total = await page.evaluate(() => (window as any).K.M.styleGoal("classic").total);
  await expect(g.getByRole("heading", { level: 2 })).toHaveText(`목표까지 ${total - 2}벌 남았어요`);
  await expect(g).toContainText(`기본 ${total}벌 중 2벌 있어요`);
  await expect(g.getByLabel("목표 스타일")).toHaveValue("classic");
  await expect(g.locator('[data-goal="owned"]')).toHaveCount(2);
  await expect(g.getByText("먼저 채우면 좋은 옷")).toBeVisible();
  const first = await missing(page);
  await g.getByRole("button", { name: `${first.name} 후보 보기` }).click();
  await expect(page.locator("[data-react-detail]")).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe(`#/p/${first.product.id}`);
});

test("choosing another goal is remembered on this device", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).K.tab("closet"));
  await goal(page).getByLabel("목표 스타일").selectOption("amekaji");
  await expect(goal(page)).toContainText("아메카지");
  expect(await page.evaluate(() => localStorage.getItem("hangit:style-goal"))).toBe("amekaji");
  await page.reload();
  await expect(goal(page).getByLabel("목표 스타일")).toHaveValue("amekaji");
});

test("the product screen decides first: my closet, what changes, where to buy and my photo", async ({ page }) => {
  await open(page);
  const first = await missing(page);
  await page.evaluate((id) => (window as any).K.go("detail", { id }), first.product.id);
  const decide = page.getByRole("region", { name: "살까 말까", exact: true });
  await expect(decide).toBeVisible();
  await expect(page.getByRole("region", { name: "이 옷을 넣으면", exact: true })).toContainText(`아메리칸 클래식 목표 2 → 3`);
  const where = page.getByRole("region", { name: "어디서 살까", exact: true });
  await expect(where.getByRole("link", { name: /새 상품/ })).toBeVisible();
  await expect(where.getByRole("link", { name: /당근/ })).toHaveAttribute("href", /daangn\.com/);
  const top = (sel: string) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().top);
  expect(await top('[aria-label="살까 말까"]')).toBeLessThan(await top('[aria-label="어디서 살까"]'));
  await expect(page.getByRole("button", { name: "내 사진 옆에 놓고 보기" })).toBeVisible();
});

test("a product goes into 찾는 중 and comes back from the 찾기 tab", async ({ page }) => {
  await open(page);
  const first = await missing(page);
  await page.evaluate((id) => (window as any).K.go("detail", { id }), first.product.id);
  await page.getByRole("button", { name: "찾는 중에 넣기" }).click();
  await expect(page.getByRole("button", { name: "찾는 중이에요" })).toBeVisible();
  // 상품 화면에는 탭 줄이 없다: 뒤로 나와 찾기 탭으로 간다.
  await page.goBack();
  await nav(page).getByRole("button", { name: "찾기", exact: true }).click();
  const watching = page.getByRole("region", { name: "찾는 중", exact: true });
  await expect(watching).toContainText(first.product.name.slice(0, 8));
  await watching.getByRole("button", { name: /상품 보기/ }).first().click();
  expect(await page.evaluate(() => location.hash)).toBe(`#/p/${first.product.id}`);
});

test("a garment seen elsewhere can be written down and searched in used markets", async ({ page }) => {
  await open(page, "&look=v3", "#/find");
  const watching = page.getByRole("region", { name: "찾는 중", exact: true });
  await watching.getByLabel("본 옷 적어 두기").fill("바라쿠타 G9 네이비 38");
  await watching.getByRole("button", { name: "적어 두기" }).click();
  await expect(watching).toContainText("바라쿠타 G9 네이비 38");
  await expect(watching.getByRole("link", { name: /당근/ })).toHaveAttribute("href", /daangn\.com.*%EB%B0%94%EB%9D%BC%EC%BF%A0%ED%83%80/);
  await page.reload();
  await expect(page.getByRole("region", { name: "찾는 중", exact: true })).toContainText("바라쿠타 G9 네이비 38");
  await page.getByRole("region", { name: "찾는 중", exact: true }).getByRole("button", { name: "바라쿠타 G9 네이비 38 지우기" }).click();
  await expect(page.getByRole("region", { name: "찾는 중", exact: true })).not.toContainText("바라쿠타 G9 네이비 38");
});

test("the default look keeps its closet and product screens", async ({ page }) => {
  await open(page, "");
  await page.evaluate(() => (window as any).K.tab("closet"));
  await expect(page.locator("[data-react-closet]")).toBeVisible();
  await expect(goal(page)).toHaveCount(0);
  const first = await missing(page);
  await page.evaluate((id) => (window as any).K.go("detail", { id }), first.product.id);
  await expect(page.locator("[data-react-detail]")).toBeVisible();
  await expect(page.getByRole("region", { name: "어디서 살까", exact: true })).toHaveCount(0);
});
