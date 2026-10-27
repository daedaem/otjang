import { test, expect, type Page } from "@playwright/test";
const KEY = "eoul-d12-hang:v1";
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
        body: JSON.stringify({
          items: [],
          fetchedAt: "2026-10-27T00:00:00.000Z",
          usableCount: 0,
        }),
      });
    return r.continue();
  });
  await page.goto("/?photos=0#/closet");
  await expect(page.locator("[data-react-closet]")).toBeVisible();
});
async function home(page: Page) {
  await page.evaluate(() => (window as any).K.tab("home"));
  await expect(page.getByLabel("찾는 옷", { exact: true })).toBeVisible();
}
async function wx(page: Page) {
  await page.evaluate(
    (data) => ((window as any).EOUL_WEATHER = async () => data),
    weather,
  );
}
test("home starts product search without a wardrobe and records only the submitted query", async ({
  page,
}) => {
  await wx(page);
  await home(page);
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
  const q = "출근 셔츠 10만원 이하";
  await page.getByLabel("찾는 옷", { exact: true }).fill(q);
  await page
    .getByRole("search")
    .getByRole("button", { name: "찾기", exact: true })
    .click();
  await expect(page.locator("#grid")).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).recent[0],
      KEY,
    ),
  ).toBe(q);
});
test("passive owned home and resolved weather leave the wardrobe purchase and recent raw unchanged", async ({
  page,
}) => {
  await wx(page);
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "shirt", color: "white" });
    m.addGarment({ kind: "pants", color: "black" });
    m.addGarment({ kind: "sneaker", color: "white" });
    m.decide("ms-728000", "hold");
  });
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await home(page);
  await expect(
    page.getByRole("region", { name: "오늘 날씨 코디", exact: true }),
  ).toContainText("합성 지역");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
});
test("late weather resolution and a day change retain the unsubmitted home question", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as any;
    w.EOUL_WEATHER = () =>
      new Promise((resolve) => (w.finishWeather = resolve));
  });
  await home(page);
  await page.waitForFunction(() => !!(window as any).finishWeather);
  const q = "아직 쓰고 있는 출근 셔츠 질문";
  await page.getByLabel("찾는 옷", { exact: true }).fill(q);
  await page.evaluate((data) => (window as any).finishWeather(data), weather);
  await expect(
    page.getByRole("region", { name: "오늘 날씨 코디", exact: true }),
  ).toContainText("합성 지역");
  await expect(page.getByLabel("찾는 옷", { exact: true })).toHaveValue(q);
  await page.getByRole("button", { name: "내일", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "오늘 날씨 코디", exact: true }),
  ).toContainText("아침 9°");
  await expect(page.getByLabel("찾는 옷", { exact: true })).toHaveValue(q);
});
