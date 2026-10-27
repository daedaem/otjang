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
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await expect(page.getByLabel("찾는 옷", { exact: true })).toHaveValue(q);
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
  await expect(page.getByLabel("찾는 옷", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "내일", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "오늘 날씨 코디", exact: true }),
  ).toContainText("아침 9°");
  await expect(page.getByLabel("찾는 옷", { exact: true })).toHaveValue(q);
});

test("vanilla home also keeps a question and raw records while weather resolves", async ({
  page,
}) => {
  await page.goto("/?photos=0&ui=vanilla#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const w = window as any;
    w.K.M.addGarment({ kind: "pants", color: "black" });
    w.EOUL_WEATHER = () =>
      new Promise((resolve) => (w.finishWeather = resolve));
  });
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await home(page);
  await page.waitForFunction(() => !!(window as any).finishWeather);
  const q = "보관 중인 홈 질문";
  await page.getByLabel("찾는 옷", { exact: true }).fill(q);
  await page.evaluate((data) => (window as any).finishWeather(data), weather);
  await expect(
    page.getByRole("region", { name: "오늘 날씨 코디", exact: true }),
  ).toContainText("합성 지역");
  await expect(page.getByLabel("찾는 옷", { exact: true })).toHaveValue(q);
  await expect(page.getByLabel("찾는 옷", { exact: true })).toBeFocused();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  await expect(page.locator("[data-react-home]")).toHaveCount(0);
});
test("a failed home runtime opens a working fallback without changing stored owned records", async ({
  page,
}) => {
  await wx(page);
  await page.evaluate(() =>
    (window as any).K.M.addGarment({ kind: "pants", color: "black" }),
  );
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await page.route("**/react/home-*.js", (r) => r.abort());
  await home(page);
  await expect(
    page.getByText("새 홈을 열지 못해 기존 화면으로 열었어요.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "오늘 날씨 코디", exact: true }),
  ).toContainText("합성 지역");
  await expect(page.locator("[data-react-home]")).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
});
test("home candidate preview follows the actual selected ids and opens their comparison", async ({
  page,
}) => {
  await wx(page);
  const ids = await page.evaluate(() => {
    const m = (window as any).K.M,
      ids = m.findProducts("셔츠", { limit: 2 }).map((p: any) => p.id);
    ids.forEach((id: string) => m.compareAdd(id));
    return ids;
  });
  await home(page);
  const proof = page.getByRole("region", { name: "걸어 본 옷", exact: true });
  await expect(proof.locator(".prow")).toHaveCount(2);
  for (const id of ids)
    await expect(proof.locator(`[data-pid="${id}"]`)).toBeVisible();
  await proof.getByRole("button", { name: "나란히 비교", exact: true }).click();
  await expect(page.locator("#cmp")).toBeVisible();
  expect(await page.evaluate(() => (window as any).K.M.compareList())).toEqual(
    ids,
  );
});
test("home native text doubles without page overflow and search remains keyboard accessible", async ({
  page,
}) => {
  await wx(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await home(page);
  await expect(page.locator("[data-react-home]")).toBeVisible();
  await page.evaluate(() => {
    const nodes = [
        ...document.querySelectorAll<HTMLElement>(
          ".hm>.top,.hm>.top *,.hm>h1,.hm>h1 *,.hm>form,.hm>form *,.hm>.chips,.hm>.chips *,.hm>.proof,.hm>.proof *",
        ),
      ],
      sizes = nodes.map((e) => parseFloat(getComputedStyle(e).fontSize));
    nodes.forEach((e, i) => (e.style.fontSize = sizes[i] * 2 + "px"));
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByLabel("찾는 옷", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("search").getByRole("button", { name: "찾기", exact: true }),
  ).toBeFocused();
});
test.describe("React home offline", () => {
  test.use({ serviceWorkers: "allow" });
  test("a visited home opens its React graph and owned preview with the real origin stopped", async ({
    page,
    request,
  }) => {
    await wx(page);
    await page.evaluate(() => {
      const m = (window as any).K.M;
      m.addGarment({ kind: "shirt", color: "white" });
      m.addGarment({ kind: "pants", color: "black" });
      m.addGarment({ kind: "sneaker", color: "white" });
    });
    await home(page);
    await expect(
      page.getByRole("region", { name: "내 옷 기준", exact: true }),
    ).toBeVisible();
    const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((r) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => r(),
            { once: true },
          ),
        );
      await (window as any).EOUL_HOME_LOAD();
    });
    const paths = await page.evaluate(() => [
      ...new Set(
        performance
          .getEntriesByType("resource")
          .map((r) => new URL(r.name).pathname)
          .filter((p) => p.startsWith("/react/") && /\.(js|css)$/.test(p)),
      ),
    ]);
    await expect
      .poll(() =>
        page.evaluate(async (paths) => {
          const files = new Set<string>();
          for (const name of await caches.keys())
            for (const r of await (await caches.open(name)).keys())
              files.add(new URL(r.url).pathname);
          return paths.filter((p) => !files.has(p));
        }, paths),
      )
      .toEqual([]);
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (_s: unknown, e: (x: { code: number }) => void) =>
            e({ code: 1 }),
        },
      }),
    );
    await page.unroute("**/*");
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:8792(?:\/|$))/, (r) =>
      r.abort(),
    );
    try {
      await request.post("http://127.0.0.1:8793/stop");
      await page.reload();
      await expect(page.locator("[data-react-home]")).toBeVisible();
      await expect(
        page.getByRole("region", { name: "내 옷 기준", exact: true }),
      ).toBeVisible();
      expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(
        raw,
      );
      expect(
        await page.evaluate(async () => {
          try {
            await fetch("/not-cached-" + Date.now());
            return true;
          } catch {
            return false;
          }
        }),
      ).toBe(false);
    } finally {
      await request.post("http://127.0.0.1:8793/start");
    }
  });
});
