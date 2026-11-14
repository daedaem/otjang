import { test, expect, type Page } from "@playwright/test";
// 대표 11-12: 개편 방향 A "오늘의 옷장". 11-14 6단계: 새 화면이 기본이고, 이전 화면은 hangit:look=v2(메뉴 「이전 화면으로 보기」)다.
// 첫 단계는 새 홈 — 오늘 코디가 첫 화면 맨 위에 옷걸이 봉에 걸려 있고,
// 옷 찾기는 찾기 탭에 있다. 처음에는 ?look=v3이나 메뉴로 켜는 미리 보기였고, 11-14부터 기본이다
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
  await expect(page.locator("[data-react-home] [data-react-weather]")).toBeVisible();
}
const card = (page: Page) => page.getByRole("region", { name: "오늘 날씨 코디", exact: true });
const edition = (page: Page) => page.evaluate(() => document.documentElement.dataset.edition || "");
const stored = (page: Page) => page.evaluate(() => localStorage.getItem("hangit:look"));

test("the previous screen (v2) keeps its home", async ({ page }) => {
  await open(page);
  await wardrobe(page);
  await realWeather(page);
  await home(page);
  expect(await edition(page)).toBe("");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("뭐 사려고요?");
  await expect(page.locator(".td-rail")).toHaveCount(0);
});

test("?look=v3 turns the today home on for this device: today's outfit hangs on the rail", async ({ page }) => {
  await open(page, "&look=v3");
  expect(await edition(page)).toBe("today");
  expect(await page.evaluate(() => document.documentElement.dataset.look)).toBe("v2");
  expect(await stored(page)).toBeNull();
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
  // 2단계(11-13): 옷 찾기는 홈에서 빠져 찾기 탭으로 갔다(e2e/today-tabs.spec.ts).
  await expect(page.getByLabel("찾는 옷", { exact: true })).toHaveCount(0);
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

test("an empty closet still has a way in: trial closet, add and the search tab", async ({ page }) => {
  await open(page, "&look=v3");
  await realWeather(page);
  await home(page);
  await expect(card(page).getByRole("heading", { level: 1 })).toHaveText("옷장을 채우면 날씨에 맞춰 골라 드려요");
  await expect(card(page).getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(card(page).getByRole("button", { name: "브랜드로 찾아 넣기" })).toBeVisible();
  await page.locator("[data-react-home]").getByRole("button", { name: "옷 찾으러 가기" }).click();
  await expect(page.getByLabel("찾는 옷", { exact: true })).toBeVisible();
  await home(page);
  await card(page).getByRole("button", { name: "체험용 옷장", exact: true }).click();
  await expect(card(page).getByRole("heading", { level: 1 })).toHaveText("오늘은 이렇게 입어요");
  await expect(card(page).locator(".td-rail")).toContainText("체험용");
});

// 빈 저장소로 처음부터 연다(11-14 CI WebKit: 이전 화면으로 연 뒤 저장값을 지우고 다시 읽으면, 첫 화면의 날씨 요청이
// 새로 읽기에 끊기며 WebKit이 그 취소를 페이지 오류로 남겼다 — 검사가 만든 순서라 다시 읽기 없이 연다).
test.describe("with nothing stored", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("the new screen is the default", async ({ page }) => {
    await page.goto("/?photos=0#/");
    await page.waitForFunction(() => !!(window as any).K?.M);
    await expect(page.locator(".hm-today")).toBeVisible();
    expect(await edition(page)).toBe("today");
    expect(await stored(page)).toBeNull();
  });
});

test("the menu goes to the new screen and back to the previous one, and remembers it on this device", async ({ page }) => {
  await open(page);
  await home(page);
  const menu = () => page.locator("[data-react-home]").getByRole("button", { name: "더보기", exact: true }).click();
  await menu();
  await page.getByRole("button", { name: "새 화면으로 보기" }).click();
  await expect(page.locator(".hm-today")).toBeVisible();
  expect(await edition(page)).toBe("today");
  expect(await stored(page)).toBeNull();
  await page.reload();
  await expect(page.locator(".hm-today")).toBeVisible();
  await menu();
  await expect(page.getByRole("button", { name: "이전 디자인으로 보기" })).toHaveCount(0);
  await page.getByRole("button", { name: "이전 화면으로 보기" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("뭐 사려고요?");
  expect(await edition(page)).toBe("");
  expect(await stored(page)).toBe("v2");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("뭐 사려고요?");
});

test("from the previous screen the older design is still one menu row away", async ({ page }) => {
  await open(page);
  await home(page);
  await page.locator("[data-react-home]").getByRole("button", { name: "더보기", exact: true }).click();
  await page.getByRole("button", { name: "이전 디자인으로 보기" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("뭐 사려고요?");
  expect(await edition(page)).toBe("");
  expect(await stored(page)).toBe("v1");
});

test("a preview page shows the new home without touching this device's setting", async ({ page }) => {
  await page.goto("/?photos=0&preview=1&look=v3#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await expect(page.locator(".hm-today")).toBeVisible();
  expect(await stored(page)).toBe("v2");
});
