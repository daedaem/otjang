import { test, expect, type Page } from "@playwright/test";
const KEY = "eoul-d12-hang:v1",
  NOTE = "eoul-d12-hang:collection:v1",
  ID = "ms-728000";
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return route.abort();
    if (u.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"items":[]}',
      });
    return route.continue();
  });
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
});
async function open(page: Page) {
  await page.evaluate((id) => (window as any).K.go("detail", { id }), ID);
  await page
    .getByRole("button", { name: "활용·소장 가치 비교 →", exact: true })
    .click();
  await expect(page.locator("[data-collection-screen]")).toBeVisible();
}
async function own(page: Page) {
  return page.evaluate(() => {
    const m = (window as any).K.M;
    m.loadTrialCloset();
    const a = m.addGarment({
      kind: "shirt",
      color: "white",
      label: "내 첫 셔츠",
      profile: { v: 1, purpose: "collect", series: "My Archive" },
    });
    m.addGarment({
      kind: "shirt",
      color: "navy",
      label: "내 둘째 셔츠",
      profile: { v: 1, purpose: "both", series: "My Archive" },
    });
    return a.id;
  });
}
async function shelves(page: Page) {
  await page.evaluate(() => (window as any).K.tab("closet"));
  await page.getByRole("button", { name: "내 진열장", exact: true }).click();
  await expect(page.locator("[data-collection-screen]")).toBeVisible();
}
test("candidate intent resumes without an owned garment or fake collection goal and direct back returns", async ({
  page,
}) => {
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await open(page);
  await page.getByRole("button", { name: "소장", exact: true }).click();
  await page.getByLabel("후보 시리즈 이름", { exact: true }).fill("LVC 501");
  await expect(page.locator("[data-collection-screen]")).toHaveAttribute(
    "data-collection-saved",
    "true",
  );
  await expect(page.getByLabel("수집 축", { exact: true })).toContainText(
    "현재 보유 0벌 · 추가하면 1번째",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  expect(await page.locator("[data-empty-slot]").count()).toBe(0);
  await page.reload();
  await expect(
    page.getByLabel("후보 시리즈 이름", { exact: true }),
  ).toHaveValue("LVC 501");
  await expect(
    page.getByRole("button", { name: "소장", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await expect(page.locator(".pdp h1")).toBeVisible();
});
test("shelves count actual owned garments and only explicit targets create removable empty slots", async ({
  page,
}) => {
  await own(page);
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await shelves(page);
  const shelf = page.locator('[data-collection-shelf="My Archive"]');
  await expect(shelf).toContainText("실제 보유 2벌");
  await expect(page.locator("[data-empty-slot]")).toHaveCount(0);
  await page.getByText("목표 직접 정하기", { exact: true }).click();
  await page.getByLabel("목표 시리즈 이름", { exact: true }).fill("My Archive");
  await page.getByLabel("진열 목표 수량", { exact: true }).fill("5");
  await page.getByRole("button", { name: "목표 저장", exact: true }).click();
  await expect(shelf).toContainText("직접 정한 목표 5벌");
  await expect(page.locator("[data-empty-slot]")).toHaveCount(3);
  await page
    .getByRole("button", { name: "My Archive 목표 지우기", exact: true })
    .click();
  await expect(page.locator("[data-empty-slot]")).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("editing an owned series updates the shelf and keeps zero recorded wear separate from collecting value", async ({
  page,
}) => {
  const id = await own(page);
  await shelves(page);
  await page.locator(`[data-collection-g="${id}"]`).click();
  await expect(page.locator("[data-profile-editor]")).toBeVisible();
  await expect(page.locator("[data-owned-wear]")).toContainText(
    "소장 목적 · 기록한 착용 0회",
  );
  await page.getByRole("tab", { name: "소장·컬렉션", exact: true }).click();
  await page
    .getByLabel("컬렉션 이름 (선택)", { exact: true })
    .fill("New Archive");
  await page.getByRole("button", { name: "옷 정보 저장", exact: true }).click();
  await expect(page.locator("[data-profile-editor]")).toContainText(
    "옷 정보를 저장",
  );
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(
    page.locator('[data-collection-shelf="New Archive"]'),
  ).toContainText("실제 보유 1벌");
  await expect(page.locator(`[data-collection-g="${id}"]`)).toBeFocused();
});
test("failed candidate storage preserves RAM on Back and retries without changing ownership", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    (window as any).collectionWrite = set;
    Storage.prototype.setItem = function (k, v) {
      if (k === "eoul-d12-hang:collection:v1")
        throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await page
    .getByLabel("후보 시리즈 이름", { exact: true })
    .fill("not saved yet");
  await expect(page.getByRole("alert")).toContainText("보관하지 못");
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.getByRole("button", { name: "계속 확인", exact: true }).click();
  await expect(
    page.getByLabel("후보 시리즈 이름", { exact: true }),
  ).toHaveValue("not saved yet");
  await page.evaluate(() => {
    Storage.prototype.setItem = (window as any).collectionWrite;
  });
  await page
    .getByRole("button", { name: "입력 보관 다시 시도", exact: true })
    .click();
  await expect(page.locator("[data-collection-screen]")).toHaveAttribute(
    "data-collection-saved",
    "true",
  );
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
});
test("future collection raw blocks editing and remains exact behind the backup recovery path", async ({
  page,
}) => {
  const raw = ' {"v":99,"candidates":{},"goals":[],"future":"keep"} ';
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: NOTE,
    raw,
  });
  await open(page);
  await expect(page.getByRole("alert")).toContainText("원문");
  await page
    .getByRole("button", { name: "백업으로 원문 보관", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "백업 · 복원", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), NOTE)).toBe(raw);
});
test("an unfinished explicit goal warns before navigation and keeps its raw text after cancelling", async ({
  page,
}) => {
  await shelves(page);
  await page.getByText("목표 직접 정하기", { exact: true }).click();
  await page.getByLabel("목표 시리즈 이름", { exact: true }).fill("My Plan");
  await page.getByLabel("진열 목표 수량", { exact: true }).fill("3x");
  await page.getByRole("button", { name: "목표 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("1~100");
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.getByRole("button", { name: "계속 확인", exact: true }).click();
  await expect(page.getByLabel("진열 목표 수량", { exact: true })).toHaveValue(
    "3x",
  );
  await page.getByLabel("진열 목표 수량", { exact: true }).fill("3");
  await page.getByLabel("목표 시리즈 이름", { exact: true }).fill("---");
  await page.getByRole("button", { name: "목표 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByLabel("목표 시리즈 이름", { exact: true }),
  ).toHaveValue("---");
  await expect(page.getByLabel("진열 목표 수량", { exact: true })).toHaveValue(
    "3",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), NOTE)).toBeNull();
});
test("purchase records display collecting intent without turning zero wear into a failure or changing journey data", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "소장", exact: true }).click();
  await expect(page.locator("[data-collection-screen]")).toHaveAttribute(
    "data-collection-saved",
    "true",
  );
  const raw = await page.evaluate((id) => {
    const m = (window as any).K.M;
    m.decide(id, "buy");
    m.advance(id, "ordered");
    m.advance(id, "received");
    m.advance(id, "kept");
    return localStorage.getItem("eoul-d12-hang:v1");
  }, ID);
  await page.evaluate(() => (window as any).K.tab("records"));
  await expect(page.locator("[data-record-collection]")).toContainText(
    "후보 메모 · 소장 목적 · 기록한 착용 0회",
  );
  await expect(page.locator(".tl")).toContainText("계속 소장하는 내 옷");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
});
test("a newer window candidate remains stored when a failed older window retries", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("후보 시리즈 이름", { exact: true }).fill("initial");
  await expect(page.locator("[data-collection-screen]")).toHaveAttribute(
    "data-collection-saved",
    "true",
  );
  const other = await page.context().newPage();
  await other.route("**/*", (route) => {
    const u = new URL(route.request().url());
    return u.origin === "http://127.0.0.1:8792"
      ? route.continue()
      : route.abort();
  });
  try {
    await other.goto("/?photos=0&window=other#/collection?id=ms-728000");
    await expect(
      other.getByLabel("후보 시리즈 이름", { exact: true }),
    ).toHaveValue("initial");
    await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      (window as any).collectionWrite = set;
      Storage.prototype.setItem = function (k, v) {
        if (k === "eoul-d12-hang:collection:v1")
          throw new DOMException("quota", "QuotaExceededError");
        return set.call(this, k, v);
      };
    });
    await page
      .getByLabel("후보 시리즈 이름", { exact: true })
      .fill("old pending");
    await expect(page.getByRole("alert")).toContainText("보관하지 못");
    await other
      .getByLabel("후보 시리즈 이름", { exact: true })
      .fill("newer stored");
    await expect(other.locator("[data-collection-screen]")).toHaveAttribute(
      "data-collection-saved",
      "true",
    );
    const saved = await other.evaluate((k) => localStorage.getItem(k), NOTE);
    await page.evaluate(() => {
      Storage.prototype.setItem = (window as any).collectionWrite;
    });
    await page
      .getByRole("button", { name: "입력 보관 다시 시도", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("다른 화면");
    expect(await page.evaluate((k) => localStorage.getItem(k), NOTE)).toBe(
      saved,
    );
    await expect(
      page.getByLabel("후보 시리즈 이름", { exact: true }),
    ).toHaveValue("old pending");
  } finally {
    await other.close();
  }
});
test("future import keeps current collection settings and undo restores the exact prior raw", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "소장", exact: true }).click();
  await page
    .getByLabel("후보 시리즈 이름", { exact: true })
    .fill("Saved Collection");
  await expect(page.locator("[data-collection-screen]")).toHaveAttribute(
    "data-collection-saved",
    "true",
  );
  const raw = await page.evaluate((k) => localStorage.getItem(k)!, NOTE);
  await page.evaluate(() => (window as any).K.tab("closet"));
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.locator("[data-backup]").click();
  await expect(page.locator('[data-photo-ready="true"]')).toBeVisible();
  await page.locator("[data-photo-options]>summary").click();
  await page.locator("[data-bk-paste]").click();
  const future = ' {"v":99,"candidates":{},"goals":[],"keep":"raw"} ';
  await page
    .getByLabel("백업 글자", { exact: true })
    .fill(
      JSON.stringify({ app: "eoul-lite", format: 2, data: { [NOTE]: future } }),
    );
  await page.locator("[data-bk-read]").click();
  await expect(page.locator(".bk > .bk-preview")).toContainText(
    "소장 목적·진열장",
  );
  await expect(page.locator(".bk > .bk-preview")).toContainText(
    "기존 활성 자료 유지 1개",
  );
  await page.locator("[data-bk-go]").click();
  await page.waitForFunction(() => !document.querySelector(".bk"));
  expect(await page.evaluate((k) => localStorage.getItem(k), NOTE)).toBe(raw);
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.locator("[data-backup]").click();
  await page.locator("[data-bk-undo]").click();
  await page.waitForFunction(() => !document.querySelector(".bk"));
  expect(await page.evaluate((k) => localStorage.getItem(k), NOTE)).toBe(raw);
});
test("a garment removed by another window keeps the open profile and its saved draft recoverable", async ({
  page,
}) => {
  const id = await own(page);
  await shelves(page);
  await page.locator(`[data-collection-g="${id}"]`).click();
  await page.getByLabel("총장 (cm)", { exact: true }).fill("72.");
  await expect(page.locator("[data-profile-editor]")).toHaveAttribute(
    "data-draft-saved",
    "true",
  );
  const draft = await page.evaluate(() =>
    localStorage.getItem("eoul-d12-hang:profile-drafts:v1"),
  );
  const other = await page.context().newPage();
  await other.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:8792"
      ? route.continue()
      : route.abort(),
  );
  try {
    await other.goto("/?photos=0&window=delete#/closet");
    await other.waitForFunction(() => !!(window as any).K?.M);
    await other.evaluate((id) => (window as any).K.M.removeGarment(id), id);
    await expect(page.locator("[data-profile-editor]")).toBeVisible();
    await expect(page.locator("[data-profile-editor]")).toContainText(
      "현재 옷장에 없어요",
    );
    expect(
      await page.evaluate(() =>
        localStorage.getItem("eoul-d12-hang:profile-drafts:v1"),
      ),
    ).toBe(draft);
  } finally {
    await other.close();
  }
});
test("a successful earlier goal save never clears text typed while that write was pending", async ({
  page,
}) => {
  await shelves(page);
  await page.getByText("목표 직접 정하기", { exact: true }).click();
  await page.getByLabel("목표 시리즈 이름", { exact: true }).fill("First Goal");
  await page.getByLabel("진열 목표 수량", { exact: true }).fill("3");
  await page.evaluate(() => {
    const m = (window as any).K.M,
      run = m.withStorageLock;
    m.withStorageLock = (fn: () => unknown) =>
      new Promise((resolve) => {
        (window as any).releaseGoal = () => resolve(run(fn));
      });
  });
  await page.getByRole("button", { name: "목표 저장", exact: true }).click();
  await page.waitForFunction(() => !!(window as any).releaseGoal);
  await page
    .getByLabel("목표 시리즈 이름", { exact: true })
    .fill("Second Goal");
  await page.getByLabel("진열 목표 수량", { exact: true }).fill("4");
  await page.evaluate(() => (window as any).releaseGoal());
  await expect(
    page.locator('[data-collection-shelf="First Goal"]'),
  ).toContainText("직접 정한 목표 3벌");
  await expect(
    page.getByLabel("목표 시리즈 이름", { exact: true }),
  ).toHaveValue("Second Goal");
  await expect(page.getByLabel("진열 목표 수량", { exact: true })).toHaveValue(
    "4",
  );
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
});
test.describe("collection offline", () => {
  test.use({ serviceWorkers: "allow" });
  test("visited shelves reopen from the actual cache with origin stopped", async ({
    page,
    request,
  }) => {
    await own(page);
    await shelves(page);
    const url = page.url();
    const paths = await page.evaluate(() => [
      ...new Set(
        performance
          .getEntriesByType("resource")
          .map((r) => new URL(r.name).pathname)
          .filter((p) => p.startsWith("/react/") && /\.(js|css)$/.test(p)),
      ),
    ]);
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
    });
    await expect
      .poll(() =>
        page.evaluate(async (paths) => {
          const files = new Set<string>();
          for (const name of await caches.keys())
            for (const req of await (await caches.open(name)).keys())
              files.add(new URL(req.url).pathname);
          return paths.filter((p) => !files.has(p));
        }, paths),
      )
      .toEqual([]);
    await page.unrouteAll({ behavior: "wait" });
    try {
      await request.post("http://127.0.0.1:8793/stop");
      expect(
        await page.evaluate(() =>
          fetch("/__uncached_collection_probe").then(
            () => true,
            () => false,
          ),
        ),
      ).toBe(false);
      await page.goto("about:blank");
      const response = await page.goto(url);
      expect(response?.fromServiceWorker()).toBe(true);
      await expect(
        page.locator('[data-collection-shelf="My Archive"]'),
      ).toContainText("실제 보유 2벌");
      await page.getByRole("button", { name: "뒤로", exact: true }).click();
      await expect(page.locator("[data-react-closet]")).toBeVisible();
    } finally {
      await request.post("http://127.0.0.1:8793/start");
    }
  });
});
