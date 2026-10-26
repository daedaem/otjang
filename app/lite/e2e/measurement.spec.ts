import { test, expect, type Page } from "@playwright/test";
const KEY = "eoul-d12-hang:v1",
  DRAFT = "eoul-d12-hang:measure-drafts:v1",
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
async function baseline(page: Page) {
  return page.evaluate((id) => {
    const m = (window as any).K.M,
      p = m.product(id),
      g = m.addGarment({
        kind: p.kind,
        color: "white",
        profile: {
          v: 1,
          reference: true,
          measures: {
            length: { cm: 70, source: "measured" },
            chest: { cm: 55, source: "measured" },
          },
        },
      });
    return { id: g.id, raw: localStorage.getItem("eoul-d12-hang:v1") };
  }, ID);
}
async function open(page: Page) {
  await page.evaluate((id) => (window as any).K.go("detail", { id }), ID);
  await page
    .getByRole("button", { name: "내 기준 옷과 실측 비교", exact: true })
    .click();
  await expect(page.locator("[data-measure-screen]")).toBeVisible();
}
test("manual candidate measurements show exact differences and leave owned clothes unchanged", async ({
  page,
}) => {
  const f = await baseline(page);
  await open(page);
  await page.getByLabel("후보 총장 (cm)", { exact: true }).fill("72");
  await page.getByLabel("후보 가슴단면 (cm)", { exact: true }).fill("57");
  await expect(page.locator("[data-measure-fact]")).toContainText("총장 +2cm");
  await expect(page.locator("[data-measure-fact]")).toContainText(
    "가슴단면 +2cm",
  );
  await expect(page.locator("[data-measure-screen]")).toContainText(
    "착용감이나 핏을 보장하지는 않아요",
  );
  expect(
    await page.evaluate(() => (window as any).K.M.getState().closetCount),
  ).toBe(1);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(f.raw);
});
test("tied size table chooses no label until the user explicitly selects one and keeps raw input on reload", async ({
  page,
}) => {
  await baseline(page);
  await open(page);
  await page
    .getByRole("tab", { name: "사이즈표 붙여넣기", exact: true })
    .click();
  const raw = "사이즈 총장 가슴\nS 68 53\nM 72 57";
  await page.getByLabel("후보 사이즈표 글자", { exact: true }).fill(raw);
  await expect(page.locator("[data-no-size-choice]")).toContainText("같아요");
  await expect(page.getByLabel("비교할 사이즈", { exact: true })).toHaveValue(
    "",
  );
  await page.getByLabel("비교할 사이즈", { exact: true }).selectOption("M");
  await expect(page.locator("[data-measure-fact]")).toContainText("총장 +2cm");
  await expect(page.locator("[data-measure-screen]")).toHaveAttribute(
    "data-measure-saved",
    "true",
  );
  await page.reload();
  await expect(page.locator("[data-measure-screen]")).toBeVisible();
  await expect(
    page.getByLabel("후보 사이즈표 글자", { exact: true }),
  ).toHaveValue(raw);
  await expect(page.getByLabel("비교할 사이즈", { exact: true })).toHaveValue(
    "M",
  );
});
test("no wardrobe allows candidate input first and adds only the explicitly confirmed real reference", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("후보 총장 (cm)", { exact: true }).fill("72");
  expect(
    await page.evaluate(() => (window as any).K.M.getState().closetCount),
  ).toBe(0);
  await page.getByRole("button", { name: /가지고 있는 .+ 한 벌 기록/ }).click();
  await expect(page.locator("[data-profile-editor]")).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).K.M.getState().closetCount),
  ).toBe(1);
  await page.getByLabel("총장 (cm)", { exact: true }).fill("70");
  await page.getByLabel("가슴단면 (cm)", { exact: true }).fill("55");
  await page.getByRole("button", { name: "옷 정보 저장", exact: true }).click();
  await expect(page.locator("[data-profile-editor]")).toContainText(
    "옷 정보를 저장했어요",
  );
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByLabel("후보 총장 (cm)", { exact: true })).toHaveValue(
    "72",
  );
  await expect(page.locator("[data-measure-fact]")).toContainText("총장 +2cm");
});

test("duplicate labels and a changed selected size never silently replace the comparison", async ({
  page,
}) => {
  await baseline(page);
  await open(page);
  await page
    .getByRole("tab", { name: "사이즈표 붙여넣기", exact: true })
    .click();
  await page
    .getByLabel("후보 사이즈표 글자", { exact: true })
    .fill("사이즈 총장 가슴\nM 70 55\nM 74 57");
  await expect(page.locator("[data-measure-screen]")).toContainText(
    "두 번 이상",
  );
  await expect(page.getByLabel("비교할 사이즈", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("후보 사이즈표 글자", { exact: true })
    .fill("사이즈 총장 가슴\nM 70 55\nL 72 56");
  await page.getByLabel("비교할 사이즈", { exact: true }).selectOption("M");
  await page
    .getByLabel("후보 사이즈표 글자", { exact: true })
    .fill("사이즈 총장 가슴\nL 70 55");
  await expect(page.getByLabel("비교할 사이즈", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator("[data-measure-screen]")).toContainText(
    "다른 사이즈로 바꾸지 않았어요",
  );
});

test("opening and closing reference editor preserves candidate RAM even if the comparison draft cannot be stored", async ({
  page,
}) => {
  await baseline(page);
  await open(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "eoul-d12-hang:measure-drafts:v1")
        throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await page.getByLabel("후보 총장 (cm)", { exact: true }).fill("74");
  await expect(page.locator("[data-measure-screen]")).toContainText(
    "입력을 보관하지 못",
  );
  await page
    .getByRole("button", { name: "기준 옷 실측 수정", exact: true })
    .click();
  await expect(page.locator("[data-profile-editor]")).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByLabel("후보 총장 (cm)", { exact: true })).toHaveValue(
    "74",
  );
  await expect(page.locator("[data-reference-edit]")).toBeFocused();
});

test("future comparison notes remain unchanged behind a backup recovery path", async ({
  page,
}) => {
  await baseline(page);
  const raw = ' {"v":99,"entries":{},"future":"그대로"} ';
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: DRAFT,
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
  expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT)).toBe(
    raw,
  );
});

test("table conversion warnings and diagram assumptions stay visible without a fit claim", async ({
  page,
}) => {
  await baseline(page);
  await open(page);
  await page
    .getByRole("tab", { name: "사이즈표 붙여넣기", exact: true })
    .click();
  await page
    .getByLabel("후보 사이즈표 글자", { exact: true })
    .fill("사이즈 총장 가슴둘레\nM 72 114");
  await expect(page.locator("[data-measure-screen]")).toContainText(
    "반으로 나눠",
  );
  await expect(page.locator("[data-measure-fact]")).toContainText(
    "가슴단면 +2cm",
  );
  await expect(
    page.getByRole("img", {
      name: "같은 축척의 기준 옷과 후보 실측 도식",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".mc-sketch")).toContainText("그림용 가정");
  await expect(page.locator("[data-measure-screen]")).toContainText(
    "착용감이나 핏을 보장하지는 않아요",
  );
});

test("failed comparison storage warns on Back and keeps entered values after cancelling", async ({
  page,
}) => {
  await baseline(page);
  await open(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "eoul-d12-hang:measure-drafts:v1")
        throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await page.getByLabel("후보 총장 (cm)", { exact: true }).fill("74");
  await expect(page.locator("[data-measure-screen]")).toContainText(
    "입력을 보관하지 못",
  );
  await page.goBack();
  await expect(page.getByRole("dialog")).toContainText(
    "보관하지 못한 비교 입력",
  );
  await page.getByRole("button", { name: "계속 비교", exact: true }).click();
  await expect(page.getByLabel("후보 총장 (cm)", { exact: true })).toHaveValue(
    "74",
  );
});

test("a failed reference switch preserves the previous reference and comparison input", async ({
  page,
}) => {
  const f = await baseline(page);
  const other = await page.evaluate((id) => {
    const m = (window as any).K.M,
      p = m.product(id);
    return m.addGarment({
      kind: p.kind,
      color: "blue",
      label: "두 번째 실제 기준 옷",
    }).id;
  }, ID);
  await open(page);
  await page.getByLabel("후보 총장 (cm)", { exact: true }).fill("72");
  await expect(page.locator("[data-measure-screen]")).toHaveAttribute(
    "data-measure-saved",
    "true",
  );
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "eoul-d12-hang:v1")
        throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await page.getByLabel("비교할 내 옷", { exact: true }).selectOption(other);
  await expect(page.getByRole("alert")).toContainText("저장하지 못");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  await expect(page.getByLabel("비교할 내 옷", { exact: true })).toHaveValue(
    f.id,
  );
  await expect(page.getByLabel("후보 총장 (cm)", { exact: true })).toHaveValue(
    "72",
  );
});

test("size rows with different metric coverage are not automatically ranked as a fitting choice", async ({
  page,
}) => {
  const f = await baseline(page);
  await page.evaluate((id) => {
    const m = (window as any).K.M,
      g = m.getState().closet.find((g: any) => g.id === id);
    m.updateGarmentProfile(id, {
      ...g.profile,
      measures: {
        ...g.profile.measures,
        shoulder: { cm: 46, source: "measured" },
      },
    });
  }, f.id);
  await open(page);
  await page
    .getByRole("tab", { name: "사이즈표 붙여넣기", exact: true })
    .click();
  await page
    .getByLabel("후보 사이즈표 글자", { exact: true })
    .fill("M 총장 70 가슴 55\nL 총장 71 어깨 47");
  await expect(page.locator("[data-no-size-choice]")).toContainText(
    "항목이 달라",
  );
  await expect(page.getByLabel("비교할 사이즈", { exact: true })).toHaveValue(
    "",
  );
});

test("future comparison import preserves the current active note and undo restores the prior snapshot", async ({
  page,
}) => {
  await baseline(page);
  await open(page);
  await page.getByLabel("후보 총장 (cm)", { exact: true }).fill("72.");
  await expect(page.locator("[data-measure-screen]")).toHaveAttribute(
    "data-measure-saved",
    "true",
  );
  const f = await page.evaluate(
    ({ key, draft }) => ({
      core: localStorage.getItem(key)!,
      raw: localStorage.getItem(draft)!,
    }),
    { key: KEY, draft: DRAFT },
  );
  await page.evaluate(() => (window as any).K.tab("closet"));
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.locator("[data-backup]").click();
  await expect(page.locator('[data-photo-ready="true"]')).toBeVisible();
  await page.locator("[data-photo-options]>summary").click();
  await page.locator("[data-bk-paste]").click();
  const future = ' {"v":99,"entries":{}} ';
  await page
    .getByLabel("백업 글자", { exact: true })
    .fill(
      JSON.stringify({
        app: "eoul-lite",
        format: 2,
        data: { [KEY]: f.core, [DRAFT]: future },
      }),
    );
  await page.locator("[data-bk-read]").click();
  await expect(page.locator(".bk > .bk-preview")).toContainText(
    "실측 비교 초안",
  );
  await expect(page.locator(".bk > .bk-preview")).toContainText(
    "기존 활성 자료 유지 1개",
  );
  await page.locator("[data-bk-go]").click();
  await page.waitForFunction(() => !document.querySelector(".bk"));
  expect(await page.evaluate((k) => localStorage.getItem(k), DRAFT)).toBe(
    f.raw,
  );
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.locator("[data-backup]").click();
  await page.locator("[data-bk-undo]").click();
  await page.waitForFunction(() => !document.querySelector(".bk"));
  expect(await page.evaluate((k) => localStorage.getItem(k), DRAFT)).toBe(
    f.raw,
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(f.core);
});

test("direct comparison entry and reload return to the product without discarding unsaved input", async ({ page }) => {
  await page.goto("/?photos=0&entry=direct#/measure?id=ms-728000");
  await expect(page.locator("[data-measure-screen]")).toBeVisible();
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await expect(page.locator(".pdp h1")).toBeVisible();
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).K.current().view)).toBe("home");
  await open(page);
  await page.getByLabel("후보 총장 (cm)", { exact: true }).fill("72");
  await expect(page.locator("[data-measure-screen]")).toHaveAttribute("data-measure-saved", "true");
  await page.reload();
  await expect(page.getByLabel("후보 총장 (cm)", { exact: true })).toHaveValue("72");
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "eoul-d12-hang:measure-drafts:v1") throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
  await page.getByLabel("후보 총장 (cm)", { exact: true }).fill("73");
  await expect(page.locator("[data-measure-screen]")).toHaveAttribute("data-measure-saved", "false");
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.getByRole("button", { name: "계속 비교", exact: true }).click();
  await expect(page.getByLabel("후보 총장 (cm)", { exact: true })).toHaveValue("73");
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await page.getByRole("button", { name: "저장된 초안만 남기고 이동", exact: true }).click();
  await expect(page.locator(".pdp h1")).toBeVisible();
});

test.describe("measurement offline", () => {
  test.use({ serviceWorkers: "allow" });
  test("visited comparison and stored table reopen with the origin genuinely stopped", async ({
    page,
    request,
  }) => {
    await baseline(page);
    await open(page);
    await page
      .getByRole("tab", { name: "사이즈표 붙여넣기", exact: true })
      .click();
    const table = "사이즈 총장 가슴\nM 72 57";
    await page.getByLabel("후보 사이즈표 글자", { exact: true }).fill(table);
    await expect(page.locator("[data-measure-screen]")).toHaveAttribute(
      "data-measure-saved",
      "true",
    );
    const visited = await page.evaluate(() => [
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
        }, visited),
      )
      .toEqual([]);
    const url = page.url();
    await page.unrouteAll({ behavior: "wait" });
    try {
      await request.post("http://127.0.0.1:8793/stop");
      expect(
        await page.evaluate(() =>
          fetch("/__uncached_measure_probe").then(
            () => true,
            () => false,
          ),
        ),
      ).toBe(false);
      await page.goto("about:blank");
      const response = await page.goto(url);
      expect(response?.fromServiceWorker()).toBe(true);
      await expect(page.locator("[data-measure-screen]")).toBeVisible();
      await expect(
        page.getByLabel("후보 사이즈표 글자", { exact: true }),
      ).toHaveValue(table);
      await expect(page.locator("[data-measure-fact]")).toContainText(
        "총장 +2cm",
      );
    } finally {
      await request.post("http://127.0.0.1:8793/start");
    }
  });
});
