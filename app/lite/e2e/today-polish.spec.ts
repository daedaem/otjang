import { test, expect, type Page } from "@playwright/test";
// 대표 11-15 "개선할게 있으면 다 해주세요". 휴대폰 크기(344·375·412px)로 새 화면을 찍어 보고 고친 것:
// 1 사진을 못 보는 회원의 상품 칸이 전부 회색 「옷」이던 것 → 상품 색·종류 이름, 상품 화면에서는 낮은 칸.
// 2 옷장 탭 「스타일 목표」 지도(16칸)가 내 옷을 한 화면 아래로 밀던 것 → 먼저 채울 옷을 위에(누르면 후보), 지도는 8칸만 펼쳐 둔다.
// 3 옷이 하나도 없는 첫 화면이 비어 있던 것 → 처음 할 일 두 가지.
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

async function open(page: Page, hash = "#/closet") {
  await page.goto(`/?photos=0&look=v3${hash}`);
  await page.waitForFunction(() => !!(window as any).K?.M);
}
async function mine(page: Page) {
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "shirt", slot: "m-oxford", color: "white", label: "내 셔츠", gender: "M" });
    m.addGarment({ kind: "pants", slot: "m-chino", color: "beige", label: "내 치노", gender: "M" });
  });
}
const goal = (page: Page) => page.getByRole("region", { name: "스타일 목표", exact: true });

test("a product without a photo shows its own colour and kind, in a lower box on the product screen", async ({ page }) => {
  await open(page);
  const p = await page.evaluate(() => (window as any).K.M.product("ms-728000"));
  await page.evaluate((id) => (window as any).K.go("detail", { id }), p.id);
  const tile = page.locator(".pdp-photo .eo-tile");
  await expect(tile).toHaveText(p.kindName);
  const hex = (await tile.evaluate((el) => getComputedStyle(el).backgroundColor)).match(/\d+/g)!.map(Number);
  expect(hex).toEqual([parseInt(p.colorHex.slice(1, 3), 16), parseInt(p.colorHex.slice(3, 5), 16), parseInt(p.colorHex.slice(5, 7), 16)]);
  const box = (await page.locator(".pdp-photo").boundingBox())!;
  expect(box.height).toBeLessThan(box.width * 0.7);
  // 살까 말까가 첫 화면 안에서 시작한다.
  const decide = (await page.getByRole("region", { name: "살까 말까", exact: true }).boundingBox())!;
  expect(decide.y).toBeLessThan(page.viewportSize()!.height);
});

test("the style goal puts what to fill first on top and opens its candidate", async ({ page }) => {
  await open(page);
  await mine(page);
  await page.evaluate(() => (window as any).K.tab("closet"));
  const g = goal(page);
  const next = await page.evaluate(() => (window as any).K.M.styleGoal("classic").next);
  const first = g.getByRole("button", { name: new RegExp(`^먼저 채우면 좋은 옷 · ${next.name}`) });
  await expect(first).toBeVisible();
  const top = (l: ReturnType<Page["locator"]>) => l.evaluate((el) => el.getBoundingClientRect().top);
  expect(await top(first)).toBeLessThan(await top(g.locator(".wr-goal-map")));
  await first.click();
  await expect(page.locator("[data-react-detail]")).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe(`#/p/${next.product.id}`);
});

test("the goal map opens with eight pieces and unfolds the rest", async ({ page }) => {
  await open(page);
  await mine(page);
  await page.evaluate(() => (window as any).K.tab("closet"));
  const g = goal(page);
  const total = await page.evaluate(() => (window as any).K.M.styleGoal("classic").total);
  expect(total).toBeGreaterThan(8);
  await expect(g.locator(".wr-goal-map li")).toHaveCount(8);
  const more = g.getByRole("button", { name: `나머지 ${total - 8}벌 보기` });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(g.locator(".wr-goal-map li")).toHaveCount(total);
  const less = g.getByRole("button", { name: "접기" });
  await expect(less).toHaveAttribute("aria-expanded", "true");
  await less.click();
  await expect(g.locator(".wr-goal-map li")).toHaveCount(8);
});

test("an empty closet's first screen says what to do first", async ({ page }) => {
  await open(page, "#/");
  const start = page.getByRole("region", { name: "처음이라면", exact: true });
  await expect(start).toBeVisible();
  await expect(start.getByRole("button", { name: /사려는 옷 물어보기/ })).toBeVisible();
  await start.getByRole("button", { name: /스타일 목표 고르기/ }).click();
  await expect(goal(page)).toBeVisible();
  await mine(page);
  await page.evaluate(() => (window as any).K.tab("home"));
  await expect(page.locator(".hm-today")).toBeVisible();
  await expect(page.getByRole("region", { name: "처음이라면", exact: true })).toHaveCount(0);
});

test("what I wrote down in 찾는 중 is one tap away from the first screen", async ({ page }) => {
  await open(page, "#/");
  await mine(page);
  await expect(page.getByRole("button", { name: /^찾는 중/ })).toHaveCount(0);
  await page.evaluate(() => (window as any).K.tab("find"));
  const watching = page.getByRole("region", { name: "찾는 중", exact: true });
  await watching.getByLabel("본 옷 적어 두기").fill("바라쿠타 G9 네이비 38");
  await watching.getByRole("button", { name: "적어 두기" }).click();
  await expect(watching).toContainText("바라쿠타 G9 네이비 38");
  await page.evaluate(() => (window as any).K.tab("home"));
  await expect(page.locator(".hm-today")).toBeVisible();
  const row = page.locator("[data-react-home]").getByRole("button", { name: /^찾는 중 1벌/ });
  await expect(row).toContainText("바라쿠타 G9 네이비 38");
  await row.click();
  await expect(page.getByRole("region", { name: "찾는 중", exact: true })).toContainText("바라쿠타 G9 네이비 38");
});
