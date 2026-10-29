import { test, expect, type Page } from "@playwright/test";
// WO-02: the shared weather card is a React component in both the home and the
// outfits screen, and the place sheet is a React dialog. The vanilla card stays
// only as the explicit ?ui=vanilla / runtime-failure fallback.
const UI_KEY = "eoul-d12-hang:ui";
const weather = {
  place: "합성 지역",
  today: { min: 14, max: 24, rain: true, date: "2026-10-27" },
  tomorrow: { min: 9, max: 17, rain: false, date: "2026-10-28" },
};
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], fetchedAt: "2026-10-27T00:00:00.000Z", usableCount: 0 }),
      });
    return r.continue();
  });
  await page.goto("/?photos=0#/closet");
  await expect(page.locator("[data-react-closet]")).toBeVisible();
});
async function wardrobe(page: Page, extra = false) {
  await page.evaluate((extra) => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "shirt", color: "white" });
    m.addGarment({ kind: "pants", color: "black" });
    m.addGarment({ kind: "sneaker", color: "white" });
    if (extra) {
      m.addGarment({ kind: "shirt", color: "navy" });
      m.addGarment({ kind: "pants", color: "beige" });
    }
  }, extra);
}
async function realWeather(page: Page, data = weather) {
  await page.evaluate((data) => {
    const w = window as any;
    w.weatherCalls = 0;
    w.EOUL_WEATHER = async () => {
      w.weatherCalls++;
      return data;
    };
  }, data);
}
async function home(page: Page) {
  await page.evaluate(() => (window as any).K.tab("home"));
  await expect(page.getByLabel("찾는 옷", { exact: true })).toBeVisible();
}
const card = (page: Page) =>
  page.getByRole("region", { name: "오늘 날씨 코디", exact: true });

test("home weather is a React card: day, next outfit and missing items keep the question", async ({
  page,
}) => {
  await wardrobe(page, true);
  await realWeather(page);
  await home(page);
  await expect(card(page)).toContainText("합성 지역");
  await expect(page.locator("[data-react-home] [data-react-weather]")).toHaveCount(1);
  await expect(page.locator("[data-home-weather]")).toHaveCount(0);
  const q = page.getByLabel("찾는 옷", { exact: true });
  await q.fill("날씨 보며 쓰는 질문");
  await card(page).getByRole("button", { name: "내일", exact: true }).click();
  await expect(card(page)).toContainText("내일 · 아침 9° → 낮 17°");
  await expect(card(page).getByRole("button", { name: "내일", exact: true })).toHaveAttribute("aria-pressed", "true");
  await card(page).getByRole("button", { name: "오늘", exact: true }).click();
  const next = card(page).getByRole("button", { name: /다른 조합/ });
  await expect(next).toContainText("1/");
  await next.click();
  await expect(next).toContainText("2/");
  await expect(card(page)).toContainText("오늘 같은 날엔");
  await expect(q).toHaveValue("날씨 보며 쓰는 질문");
  expect(await page.evaluate(() => (window as any).weatherCalls)).toBe(1);
  const more = card(page).getByRole("button", { name: /더 보기$/ }).last();
  const label = (await more.textContent())!.replace(/\s*더 보기\s*$/, "").trim();
  await more.click();
  await expect(page).toHaveURL(new RegExp("#/search"));
  await expect(page.getByRole("button", { name: `다시 찾기: ${label}`, exact: true })).toBeVisible();
});

test("example weather chips persist the chosen example and a failed lookup says so", async ({
  page,
}) => {
  await wardrobe(page);
  await page.evaluate(() => {
    (window as any).EOUL_WEATHER = async () => {
      throw new Error("offline");
    };
  });
  await home(page);
  await expect(card(page)).toContainText("날씨를 못 받아 예시로");
  const chips = card(page).getByRole("group", { name: "예시 날씨 고르기", exact: true });
  await chips.getByRole("button", { name: "더움 22°/30°", exact: true }).click();
  await expect(chips.getByRole("button", { name: "더움 22°/30°", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(card(page)).toContainText("낮 30°");
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}").wxEx, UI_KEY)).toBe("hot");
  await expect(page.locator("[data-react-home] [data-react-weather]")).toHaveCount(1);
});

test("empty wardrobe invite opens add search and the trial closet from the React card", async ({
  page,
}) => {
  await realWeather(page);
  await home(page);
  await expect(card(page)).toContainText("옷장을 채우면 날씨에 맞춰 골라 드려요");
  await expect(page.locator("[data-react-home] [data-react-weather]")).toHaveCount(1);
  await card(page).getByRole("button", { name: "체험용 옷장", exact: true }).click();
  await expect(card(page)).toContainText("체험용");
  expect(await page.evaluate(() => (window as any).K.M.getState().trialCount)).toBeGreaterThan(0);
});

test("the place sheet is a React dialog that saves a preset, reloads weather and keeps the question", async ({
  page,
}) => {
  await wardrobe(page);
  await page.evaluate(() => {
    const w = window as any;
    w.weatherCalls = 0;
    w.placeState = { mode: "here" };
    w.EOUL_WEATHER_PLACE = {
      presets: [{ name: "합성시", lat: 1.1, lon: 2.2 }],
      get: () => w.placeState,
      set: (p: any) => ((w.placeState = p), p),
      here: async () => null,
    };
    w.EOUL_WEATHER = async () => {
      w.weatherCalls++;
      return {
        place: w.placeState.mode === "fixed" ? w.placeState.name : "현재 위치",
        today: { min: 14, max: 24, rain: false },
        tomorrow: { min: 9, max: 17, rain: false },
      };
    };
  });
  await home(page);
  const q = page.getByLabel("찾는 옷", { exact: true });
  await q.fill("지역 바꾸는 동안의 질문");
  await card(page).getByRole("button", { name: "날씨 지역 바꾸기: 현재 위치", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "날씨 지역", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator("[data-react-place]")).toHaveCount(1);
  await dialog.getByRole("button", { name: /지금 있는 곳을 내 지역으로/ }).click();
  await expect(dialog.getByRole("status")).toContainText("위치를 받지 못했어요");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await card(page).getByRole("button", { name: "날씨 지역 바꾸기: 현재 위치", exact: true }).click();
  await page.getByRole("dialog", { name: "날씨 지역", exact: true }).getByRole("button", { name: "합성시", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "날씨 지역", exact: true })).toHaveCount(0);
  await expect(card(page).getByRole("button", { name: "날씨 지역 바꾸기: 합성시", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).placeState)).toEqual({ mode: "fixed", name: "합성시", lat: 1.1, lon: 2.2 });
  expect(await page.evaluate(() => (window as any).weatherCalls)).toBe(2);
  await expect(q).toHaveValue("지역 바꾸는 동안의 질문");
});

test("the outfits weather slot renders the same React card and still honours the vanilla fallback", async ({
  page,
}) => {
  await wardrobe(page);
  await realWeather(page);
  await page.evaluate(() => (window as any).K.tab("looks"));
  await page.locator(".of-weather>summary").click();
  await expect(page.locator("[data-outfit-weather] [data-react-weather]")).toHaveCount(1);
  await expect(page.locator("[data-outfit-weather]")).toContainText("합성 지역");
  await expect(page.locator("[data-outfit-weather]")).not.toContainText("코디 더 보기");
  await page.goto("/?photos=0&ui=vanilla#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await realWeather(page);
  await home(page);
  await expect(card(page)).toContainText("합성 지역");
  await expect(page.locator("[data-react-weather]")).toHaveCount(0);
});

// 10-29 UX 점검: 새 디자인에서 고른 예시 날씨 칩의 배경이 투명해져 흰 글자가 보이지 않았다.
for (const scheme of ["light", "dark"] as const) {
  test(`the chosen example weather chip stays readable (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await wardrobe(page);
    await page.evaluate(() => {
      (window as any).EOUL_WEATHER = async () => {
        throw new Error("offline");
      };
    });
    await home(page);
    const chips = card(page).getByRole("group", { name: "예시 날씨 고르기", exact: true });
    const on = chips.locator('[aria-pressed="true"]');
    await expect(on).toHaveCount(1);
    const style = await on.evaluate((e) => {
      const s = getComputedStyle(e);
      return { color: s.color, bg: s.backgroundColor };
    });
    expect(style.bg).not.toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);
    expect(style.bg).not.toBe(style.color);
  });
}
