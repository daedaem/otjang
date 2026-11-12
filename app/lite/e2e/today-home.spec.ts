import { test, expect, type Page } from "@playwright/test";
// 대표 11-12: 개편 방향 A "오늘의 옷장". 첫 단계는 새 홈 — 오늘 코디가 첫 화면 맨 위에 옷걸이 봉에 걸려 있고,
// 옷 찾기는 그 아래에 남는다. 기본 화면은 그대로 두고 ?look=v3이나 메뉴 '새 홈 화면 미리 보기'로 이 기기에서 켠다
// (대표가 써 본 뒤 기본으로 바꾸고 옛 화면을 지운다).
const weather = {
  place: "합성 지역",
  today: { min: 14, max: 24, rain: true, date: "2026-10-27" },
  tomorrow: { min: 9, max: 17, rain: false, date: "2026-10-28" },
};
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

async function open(page: Page, search = "") {
  await page.goto(`/?photos=0${search}#/closet`);
  await expect(page.locator("[data-react-closet]")).toBeVisible();
}
async function wardrobe(page: Page) {
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "shirt", color: "white" });
    m.addGarment({ kind: "pants", color: "black" });
    m.addGarment({ kind: "sneaker", color: "white" });
    m.addGarment({ kind: "shirt", color: "navy" });
    m.addGarment({ kind: "pants", color: "beige" });
  });
}
async function realWeather(page: Page) {
  await page.evaluate((data) => { (window as any).EOUL_WEATHER = async () => data; }, weather);
}
async function home(page: Page) {
  await page.evaluate(() => (window as any).K.tab("home"));
  await expect(page.getByLabel("찾는 옷", { exact: true })).toBeVisible();
}
const card = (page: Page) => page.getByRole("region", { name: "오늘 날씨 코디", exact: true });
const edition = (page: Page) => page.evaluate(() => document.documentElement.dataset.edition || "");
const stored = (page: Page) => page.evaluate(() => localStorage.getItem("hangit:look"));
const top = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().top);

test("the default home is unchanged while the new home is off", async ({ page }) => {
  await open(page);
  await wardrobe(page);
  await realWeather(page);
  await home(page);
  expect(await edition(page)).toBe("");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("뭐 사려고요?");
  await expect(page.locator(".td-rail")).toHaveCount(0);
});

test("?look=v3 turns the today home on for this device: today's outfit hangs on the rail before the search", async ({ page }) => {
  await open(page, "&look=v3");
  expect(await edition(page)).toBe("today");
  expect(await page.evaluate(() => document.documentElement.dataset.look)).toBe("v2");
  expect(await stored(page)).toBe("v3");
  await wardrobe(page);
  await realWeather(page);
  await home(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(card(page).getByRole("heading", { level: 1 })).toHaveText("오늘은 이렇게 입어요");
  await expect(card(page)).toContainText("오늘 · 아침 14° → 낮 24° · 비");
  await expect(page.getByText("뭐 사려고요?")).toHaveCount(0);
  // 옷이 봉에 걸려 있다: 봉(6px, 월넛)과 옷마다 고리, 상의·하의·신발 세 벌 이상.
  const rail = card(page).locator(".td-rail");
  expect(await rail.locator(".p1").count()).toBeGreaterThanOrEqual(3);
  const bar = await rail.evaluate((el) => { const s = getComputedStyle(el, "::before"); return { h: s.height, bg: s.backgroundColor }; });
  expect(bar).toEqual({ h: "6px", bg: "rgb(91, 58, 36)" });
  expect(await rail.locator(".p1").first().evaluate((el) => getComputedStyle(el, "::before").height)).toBe("14px");
  // 오늘 코디가 먼저, 옷 찾기는 그 아래에 그대로 있다.
  expect(await top(page, ".td-rail")).toBeLessThan(await top(page, "#q"));
  await page.getByLabel("찾는 옷", { exact: true }).fill("흰 셔츠");
  await page.getByRole("search").getByRole("button", { name: "찾기", exact: true }).click();
  await expect(page.locator("[data-react-results]")).toBeVisible();
});

test("another outfit and tomorrow keep working on the rail", async ({ page }) => {
  await open(page, "&look=v3");
  await wardrobe(page);
  await realWeather(page);
  await home(page);
  const next = card(page).getByRole("button", { name: /^다른 조합/ });
  await expect(next).toContainText("1/");
  await next.click();
  await expect(next).toContainText("2/");
  await card(page).getByRole("button", { name: "내일", exact: true }).click();
  await expect(card(page).getByRole("heading", { level: 1 })).toHaveText("내일은 이렇게 입어요");
  await expect(card(page)).toContainText("내일 · 아침 9° → 낮 17°");
});

test("an empty closet still has a way in: trial closet, add and search", async ({ page }) => {
  await open(page, "&look=v3");
  await realWeather(page);
  await home(page);
  await expect(card(page).getByRole("heading", { level: 1 })).toHaveText("옷장을 채우면 날씨에 맞춰 골라 드려요");
  await expect(card(page).getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(card(page).getByRole("button", { name: "브랜드로 찾아 넣기" })).toBeVisible();
  await expect(page.getByLabel("찾는 옷", { exact: true })).toBeVisible();
  await card(page).getByRole("button", { name: "체험용 옷장", exact: true }).click();
  await expect(card(page).getByRole("heading", { level: 1 })).toHaveText("오늘은 이렇게 입어요");
  await expect(card(page).locator(".td-rail")).toContainText("체험용");
});

test("the menu turns the new home on and off and remembers it on this device", async ({ page }) => {
  await open(page);
  await home(page);
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.getByRole("button", { name: "새 홈 화면 미리 보기", exact: true }).click();
  await expect(page.locator(".hm-today")).toBeVisible();
  expect(await edition(page)).toBe("today");
  expect(await stored(page)).toBe("v3");
  await page.reload();
  await expect(page.locator(".hm-today")).toBeVisible();
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.getByRole("button", { name: "새 홈 화면 끄기", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("뭐 사려고요?");
  expect(await edition(page)).toBe("");
  expect(await stored(page)).toBeNull();
});

test("going back to the previous look also leaves the new home", async ({ page }) => {
  await open(page, "&look=v3");
  await home(page);
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.getByRole("button", { name: "이전 디자인으로 보기", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("뭐 사려고요?");
  expect(await edition(page)).toBe("");
  expect(await stored(page)).toBe("v1");
});

test("a preview page shows the new home without touching this device's setting", async ({ page }) => {
  await page.goto("/?photos=0&preview=1&look=v3#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await expect(page.locator(".hm-today")).toBeVisible();
  expect(await stored(page)).toBeNull();
});
