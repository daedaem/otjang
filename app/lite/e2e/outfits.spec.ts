import { test, expect, type Page } from "@playwright/test";
const KEY = "eoul-d12-hang:v1",
  REACTIONS = "eoul-d12-hang:outfit-reactions:v1";
const response = (body: any) => ({
  summary: "실제 기록을 보고 두 조합을 비교했어요.",
  ranking: [...body.outfits].reverse().map((o: any, i: number) => ({
    id: o.id,
    reason:
      i === 0
        ? "내 둘째 셔츠로 먼저 비교해 보세요."
        : "내 첫 셔츠는 울 소재라 좋아요.",
  })),
  attribute_check: {
    lines: ["확인: 내 첫 셔츠의 소재는 코튼으로 기록돼 있어요."],
    note: "일부 속성 표현만 대조했어요. 핏을 검증한 것은 아니에요.",
  },
  ai: {
    provider: "anthropic",
    model: "claude-synthetic",
    requestId: "msg_outfit_synthetic",
    inputTokens: 123,
    outputTokens: 45,
  },
});
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
  await page.evaluate(() => {
    (window as any).EOUL_WEATHER = async () => ({
      place: "합성 지역",
      today: { min: 14, max: 24, rain: false },
      tomorrow: { min: 12, max: 22, rain: true },
    });
  });
});
async function fixture(page: Page) {
  return page.evaluate(() => {
    const m = (window as any).K.M;
    return [
      ["shirt", "m-oxford", "white", "내 첫 셔츠"],
      ["shirt", "m-oxford", "blue", "내 둘째 셔츠"],
      ["pants", "m-chino", "beige", "내 바지"],
      ["sneaker", "m-white-sneaker", "white", "내 신발"],
    ].map(
      ([kind, slot, color, label]) =>
        m.addGarment({
          kind,
          slot,
          color,
          label,
          profile: { v: 1, fabric: { value: "코튼", source: "chosen" } },
        }).id,
    );
  });
}
async function open(page: Page) {
  await page.evaluate(() => (window as any).K.go("looks", {}));
  await expect(page.locator("[data-react-outfits]")).toBeVisible();
}
async function firstLike(page: Page) {
  return page
    .locator("[data-outfit-card]")
    .first()
    .getByRole("button", { name: "좋아요", exact: true });
}
test("delayed outfits mount preserves focus that the user moved to navigation", async ({ page }) => {
  let release!: () => void, requested!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  const seen = new Promise<void>((r) => { requested = r; });
  await page.route("**/react/outfits-*.js", async (route) => {
    requested();
    await held;
    await route.continue();
  });
  await page.evaluate(() => (window as any).K.go("looks", {}));
  await seen;
  const tab = page.locator('#tabs [data-tab="closet"]');
  await tab.focus();
  await expect(tab).toBeFocused();
  release();
  await expect(page.locator("[data-react-outfits]")).toBeVisible();
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await expect(tab).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-react-closet]")).toBeVisible();
});
test("empty wardrobe keeps a product search entry and trial outfits never become owned AI candidates", async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByRole("button", { name: "옷 없이 상품 찾기", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "체험용 코디 보기", exact: true })
    .click();
  await expect(page.locator(".of-demo")).toContainText("가진 옷이 아니에요");
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
  await expect(
    page.getByRole("button", { name: "AI로 비교", exact: true }),
  ).toHaveCount(0);
});
test("opening owned outfits is read-only and a single reaction resumes without changing wardrobe or counting twice", async ({
  page,
}) => {
  await fixture(page);
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await open(page);
  await expect(page.locator("[data-outfit-card]")).toHaveCount(2);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  const like = await firstLike(page);
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-react-outfits]")).toHaveAttribute(
    "data-reactions-saved",
    "true",
  );
  await like.click();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).reactions.length,
      REACTIONS,
    ),
  ).toBe(1);
  await page.reload();
  await expect(page.locator("[data-react-outfits]")).toBeVisible();
  await expect(await firstLike(page)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
});
test("AI order comes from the returned ids, keeps its reason and displays separate facts and real response metadata", async ({
  page,
}) => {
  await fixture(page);
  let calls = 0,
    submitted: any;
  await page.route("**/api/rank", (route) => {
    calls++;
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response(submitted)),
    });
  });
  await open(page);
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect(page.locator("[data-outfit-ai-summary]")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "AI 1위", exact: true }),
  ).toBeInViewport();
  expect(
    await page
      .locator("[data-outfit-card]")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-outfit-card")),
      ),
  ).toEqual([...submitted.outfits].reverse().map((o: any) => o.id));
  await expect(page.locator("[data-outfit-ai-reason]").last()).toContainText(
    "울 소재",
  );
  await expect(page.locator("[data-outfit-attribute-check]")).toContainText(
    "코튼",
  );
  await expect(page.locator("[data-outfit-card]").last()).toContainText(
    "울 소재",
  );
  await expect(
    page
      .locator("[data-outfit-card]")
      .last()
      .locator("[data-outfit-attribute-check]"),
  ).toContainText("코튼");
  expect(calls).toBe(1);
  for (const key of ["photoId", "img", "data:image", "http"])
    expect(JSON.stringify(submitted)).not.toContain(key);
  await page.getByText("AI 응답 정보", { exact: true }).click();
  await expect(page.locator(".of-ai-info")).toContainText("claude-synthetic");
  await expect(page.locator(".of-ai-info")).toContainText("123");
  await expect(page.locator(".of-ai-info")).toContainText("45");
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  expect(calls).toBe(1);
  await expect(page.locator(".of-ai-info")).toContainText("이전 응답");
});
test("failed AI and malformed ranking leave explicitly unranked candidates instead of a rule result labelled AI", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/rank", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: '{"code":"provider_access_denied"}',
    }),
  );
  await open(page);
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("AI 순위가 없는");
  await expect(
    page.getByRole("heading", { name: "AI 1위", exact: true }),
  ).toHaveCount(0);
  await page.route("**/api/rank", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"summary":"invented","ranking":[{"id":"o_wrong","reason":"bad"}],"attribute_check":{"lines":[],"note":"unknown"}}',
    }),
  );
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("AI 응답을 확인하지 못");
  await expect(page.locator("[data-outfit-ai-summary]")).toHaveCount(0);
});
test("late old AI response cannot attach to corrected clothes or replace a newer request", async ({
  page,
}) => {
  const ids = await fixture(page);
  let release: () => void = () => {},
    firstBody: any,
    calls = 0;
  await page.route("**/api/rank", async (route) => {
    const body = route.request().postDataJSON();
    const ordinal = ++calls;
    if (ordinal === 1) {
      firstBody = body;
      await new Promise<void>((resolve) => (release = resolve));
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...response(body),
        summary: ordinal === 1 ? "old source" : "new source",
      }),
    });
  });
  await open(page);
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  await page.evaluate((id) => {
    const m = (window as any).K.M;
    m.updateGarment(id, { color: "grey" });
  }, ids[0]);
  await expect(page.locator("[data-outfit-ai-summary]")).toHaveCount(0);
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.locator("[data-outfit-ai-summary]")).toContainText(
    "new source",
  );
  release();
  await page.waitForTimeout(80);
  await expect(page.locator("[data-outfit-ai-summary]")).toContainText(
    "new source",
  );
  expect(firstBody.garments.find((g: any) => g.id === ids[0]).color).toBe(
    "white",
  );
});
test("unsaved reaction warns on Back and retains its choice after cancelling", async ({
  page,
}) => {
  await fixture(page);
  await open(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    (window as any).reactionWrite = set;
    Storage.prototype.setItem = function (k, v) {
      if (k === "eoul-d12-hang:outfit-reactions:v1")
        throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  const like = await firstLike(page);
  await like.click();
  await expect(page.getByRole("alert")).toContainText("보관하지 못");
  await page.evaluate(() => history.back());
  await expect(
    page.getByRole("heading", {
      name: "보관하지 못한 반응이 있어요",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "계속 비교", exact: true }).click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => {
    Storage.prototype.setItem = (window as any).reactionWrite;
  });
  await page
    .getByRole("button", { name: "반응 보관 다시 시도", exact: true })
    .click();
  await expect(page.locator("[data-react-outfits]")).toHaveAttribute(
    "data-reactions-saved",
    "true",
  );
});
test("future reaction history is protected behind a backup path and no AI call", async ({
  page,
}) => {
  await fixture(page);
  const raw = ' {"v":99,"reactions":[],"private":"keep"} ';
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: REACTIONS,
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
  expect(await page.evaluate((k) => localStorage.getItem(k), REACTIONS)).toBe(
    raw,
  );
});
test("weather refresh preserves a pending query, unsaved reaction and active React screen", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => {
    (window as any).EOUL_WEATHER = () =>
      new Promise((resolve) => {
        (window as any).releaseWeather = () =>
          resolve({
            place: "합성 지역",
            today: { min: 14, max: 24, rain: false },
            tomorrow: { min: 12, max: 22, rain: true },
          });
      });
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "eoul-d12-hang:outfit-reactions:v1")
        throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await open(page);
  await page.locator(".of-weather>summary").click();
  await page.getByLabel("코디 비교 요청", { exact: true }).fill("아직 입력 중");
  const like = await firstLike(page);
  await like.click();
  await expect(page.getByRole("alert")).toContainText("보관하지 못");
  await page.evaluate(() => (window as any).releaseWeather());
  await expect(page.locator("[data-outfit-weather]")).toContainText(
    "합성 지역",
  );
  await expect(page.getByLabel("코디 비교 요청", { exact: true })).toHaveValue(
    "아직 입력 중",
  );
  await expect(like).toHaveAttribute("aria-pressed", "true");
});
test("changing a query hides the previous AI result until the new query is explicitly compared", async ({
  page,
}) => {
  await fixture(page);
  let calls = 0;
  await page.route("**/api/rank", (route) => {
    calls++;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response(route.request().postDataJSON())),
    });
  });
  await open(page);
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect(page.locator("[data-outfit-ai-summary]")).toBeVisible();
  await page
    .getByLabel("코디 비교 요청", { exact: true })
    .fill("주말에 편하게");
  await expect(page.locator("[data-outfit-ai-summary]")).toHaveCount(0);
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.locator("[data-outfit-ai-summary]")).toBeVisible();
});
test("provider metadata absence does not invent model or zero tokens and the response remains a bounded comparison", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/rank", (route) => {
    const out: any = response(route.request().postDataJSON());
    delete out.ai;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(out),
    });
  });
  await open(page);
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect(page.locator("[data-outfit-ai-summary]")).toBeVisible();
  await page.getByText("AI 응답 정보", { exact: true }).click();
  await expect(page.locator(".of-ai-info")).toContainText(
    "모델·사용량을 추정하지 않았어요",
  );
  await expect(page.locator(".of-ai-info")).not.toContainText("0 토큰");
  await expect(page.locator(".of-ai-info dl")).toHaveCount(0);
});

test("feedback keeps the compared cards stable and is sent only on the next explicit AI comparison", async ({
  page,
}) => {
  await fixture(page);
  let calls = 0,
    last: any;
  await page.route("**/api/rank", (route) => {
    calls++;
    last = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response(last)),
    });
  });
  await open(page);
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect(page.locator("[data-outfit-ai-summary]")).toBeVisible();
  const order = await page
    .locator("[data-outfit-card]")
    .evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-outfit-card")),
    );
  await (await firstLike(page)).click();
  await expect(page.locator("[data-react-outfits]")).toHaveAttribute(
    "data-reactions-saved",
    "true",
  );
  await expect(page.locator("[data-outfit-ai-summary]")).toBeVisible();
  await expect(
    page.getByText("새 반응은 다음 AI 비교에 반영해요.", { exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator("[data-outfit-card]")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-outfit-card")),
      ),
  ).toEqual(order);
  await expect(page.locator("[data-unapplied-reactions]")).toHaveAttribute(
    "data-unapplied-reactions",
    "true",
  );
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  expect(last.taste.some((t: any) => t.likes > 0)).toBe(true);
});
test("the prior vanilla outfit screen remains available when explicitly selected", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/?photos=0&ui=vanilla#/looks");
  await expect(page.locator("[data-react-outfits]")).toHaveCount(0);
  await expect(page.locator(".lks .lk").first()).toBeVisible();
  await expect(page.locator('[aria-label="오늘 날씨 코디"]')).toBeVisible();
});

test("AI result retains the actual submitted subset size when more than eight combinations exist", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => {
    const m = (window as any).K.M;
    for (let i = 0; i < 4; i++)
      m.addGarment({
        kind: "shirt",
        slot: "m-oxford",
        color: i % 2 ? "blue" : "white",
        label: "추가 셔츠 " + i,
      });
    m.addGarment({
      kind: "pants",
      slot: "m-chino",
      color: "olive",
      label: "다른 바지",
    });
  });
  let body: any;
  await page.route("**/api/rank", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response(body)),
    });
  });
  await open(page);
  const total = await page.evaluate(
    () => (window as any).K.M.outfitReview({}, { v: 1, reactions: [] }).total,
  );
  expect(total).toBeGreaterThan(8);
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect(page.locator("[data-outfit-ai-summary]")).toBeVisible();
  expect(body.outfits.length).toBe(8);
  await expect(page.locator("[data-outfit-comparison-scope]")).toContainText(
    `${total}개 중 8개 비교`,
  );
});

test("suggested product quick hang keeps its exact id through reload and removes it without nested buttons", async ({
  page,
}) => {
  await fixture(page);
  await open(page);
  const row = page.locator("[data-outfit-product]").first();
  await expect(row).toBeVisible();
  const id = await row.getAttribute("data-outfit-product"),
    button = row.locator("[data-outfit-hang]");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate((id) => (window as any).K.M.compareHas(id), id),
  ).toBe(true);
  expect(await row.locator("button button").count()).toBe(0);
  await page.reload();
  const restored = page.locator(
    `[data-outfit-product="${id}"] [data-outfit-hang]`,
  );
  await expect(restored).toHaveAttribute("aria-pressed", "true");
  await restored.click();
  await expect(restored).toHaveAttribute("aria-pressed", "false");
  expect(
    await page.evaluate((id) => (window as any).K.M.compareHas(id), id),
  ).toBe(false);
});
test("failed quick hang preserves the comparison ids and shows a local action error", async ({
  page,
}) => {
  await fixture(page);
  await open(page);
  const row = page.locator("[data-outfit-product]").first();
  await expect(row).toBeVisible();
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "eoul-d12-hang:v1")
        throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await row.locator("[data-outfit-hang]").click();
  await expect(row.getByRole("alert")).toContainText("저장");
  await expect(row.locator("[data-outfit-hang]")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
});
test("visible dimension evidence uses Korean labels while preserving the editorial-rule boundary", async ({
  page,
}) => {
  await fixture(page);
  await open(page);
  await page
    .getByRole("group", { name: "코디 상황", exact: true })
    .getByRole("button", { name: "출근", exact: true })
    .click();
  const facts = page.locator(".of-facts").first();
  await facts.locator("summary").click();
  await expect(facts).toContainText("편집 규칙");
  await expect(facts).not.toContainText(
    /\b(good|weak|neutral|fits|unknown|too-casual|too-formal)\b/,
  );
});
test("a reference editor over a failed reaction cannot bypass parent navigation protection", async ({
  page,
}) => {
  await fixture(page);
  await open(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "eoul-d12-hang:outfit-reactions:v1")
        throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await (await firstLike(page)).click();
  await expect(page.getByRole("alert")).toContainText("보관하지 못");
  await page
    .getByRole("button", { name: "내 첫 셔츠 옷 정보", exact: true })
    .first()
    .click();
  await expect(page.locator("[data-profile-editor]")).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(
    page.getByRole("heading", {
      name: "보관하지 못한 반응이 있어요",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "계속 비교", exact: true }).click();
  await expect(page.locator("[data-profile-editor]")).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(await firstLike(page)).toHaveAttribute("aria-pressed", "true");
});

test("reaction backup restores future raw as inert data and undo recovers the exact original history", async ({
  page,
}) => {
  await fixture(page);
  await open(page);
  await (await firstLike(page)).click();
  await expect(page.locator("[data-react-outfits]")).toHaveAttribute(
    "data-reactions-saved",
    "true",
  );
  const original = await page.evaluate(
    ({ key, main }) => ({
      reaction: localStorage.getItem(key)!,
      main: localStorage.getItem(main)!,
    }),
    { key: REACTIONS, main: KEY },
  );
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.locator("[data-backup]").click();
  await expect(page.locator('[data-photo-ready="true"]')).toBeVisible();
  await page.locator("[data-photo-options]>summary").click();
  await page.locator("[data-bk-paste]").click();
  const future = ' {"v":99,"reactions":[],"keep":"history"} ';
  await page.getByLabel("백업 글자", { exact: true }).fill(
    JSON.stringify({
      app: "eoul-lite",
      format: 2,
      data: { [KEY]: original.main, [REACTIONS]: future },
    }),
  );
  await page.locator("[data-bk-read]").click();
  await expect(page.locator(".bk > .bk-preview")).toContainText("코디 반응");
  await expect(page.locator(".bk > .bk-preview")).toContainText(
    "기존 활성 자료 유지 1개",
  );
  await page.locator("[data-bk-go]").click();
  await page.waitForFunction(() => !document.querySelector(".bk"));
  expect(await page.evaluate((k) => localStorage.getItem(k), REACTIONS)).toBe(
    original.reaction,
  );
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.locator("[data-backup]").click();
  await page.locator("[data-bk-undo]").click();
  await page.waitForFunction(() => !document.querySelector(".bk"));
  expect(await page.evaluate((k) => localStorage.getItem(k), REACTIONS)).toBe(
    original.reaction,
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(
    original.main,
  );
});
test("another window newer reaction cannot be overwritten by an older failed pending choice", async ({
  page,
}) => {
  await fixture(page);
  await open(page);
  await (await firstLike(page)).click();
  await expect(page.locator("[data-react-outfits]")).toHaveAttribute(
    "data-reactions-saved",
    "true",
  );
  const other = await page.context().newPage();
  await other.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:8792"
      ? route.continue()
      : route.abort(),
  );
  try {
    await other.goto("/?photos=0&window=second#/looks");
    await expect(other.locator("[data-react-outfits]")).toBeVisible();
    await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      (window as any).reactionWrite = set;
      Storage.prototype.setItem = function (k, v) {
        if (k === "eoul-d12-hang:outfit-reactions:v1")
          throw new DOMException("quota", "QuotaExceededError");
        return set.call(this, k, v);
      };
    });
    await page
      .locator("[data-outfit-card]")
      .first()
      .getByRole("button", { name: "별로예요", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("보관하지 못");
    await other
      .locator(".of-reason-choices")
      .first()
      .locator("summary")
      .click();
    await other
      .getByRole("button", { name: "색 조합이 좋아요", exact: true })
      .first()
      .click();
    await expect(other.locator("[data-react-outfits]")).toHaveAttribute(
      "data-reactions-saved",
      "true",
    );
    const saved = await other.evaluate(
      (k) => localStorage.getItem(k),
      REACTIONS,
    );
    await page.evaluate(() => {
      Storage.prototype.setItem = (window as any).reactionWrite;
    });
    await page
      .getByRole("button", { name: "반응 보관 다시 시도", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("다른 화면");
    expect(await page.evaluate((k) => localStorage.getItem(k), REACTIONS)).toBe(
      saved,
    );
    await expect(
      page
        .locator("[data-outfit-card]")
        .first()
        .getByRole("button", { name: "별로예요", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  } finally {
    await other.close();
  }
});
test("current outfit text doubles without page overflow and the comparison form stays keyboard accessible", async ({
  page,
}) => {
  await fixture(page);
  await open(page);
  await page.route("**/api/rank", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response(route.request().postDataJSON())),
    }),
  );
  await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
  await expect(page.locator("[data-outfit-ai-summary]")).toBeVisible();
  const before = await page
    .getByLabel("코디 비교 요청", { exact: true })
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll<HTMLElement>(".of,.of *")],
      values = elements.map((el) => ({
        el,
        size: parseFloat(getComputedStyle(el).fontSize),
        line: parseFloat(getComputedStyle(el).lineHeight),
      }));
    for (const { el, size, line } of values) {
      el.style.fontSize = size * 2 + "px";
      if (Number.isFinite(line)) el.style.lineHeight = line * 2 + "px";
    }
  });
  expect(
    await page
      .getByLabel("코디 비교 요청", { exact: true })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(before * 1.9);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByLabel("코디 비교 요청", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "AI로 비교", exact: true }),
  ).toBeFocused();
});
test("an unavailable React outfit bundle falls back to the preserved vanilla screen", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/react/outfits-*.js", (route) => route.abort());
  await page.evaluate(() => (window as any).K.go("looks", {}));
  await expect(
    page.getByText("새 코디 화면을 열지 못해 기존 화면으로 열었어요.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".lks .lk").first()).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(4);
});

test("memory preview isolates real wardrobe and feedback even while private photo recovery is pending", async ({
  page,
}) => {
  await fixture(page);
  await open(page);
  await (await firstLike(page)).click();
  await expect(page.locator("[data-react-outfits]")).toHaveAttribute(
    "data-reactions-saved",
    "true",
  );
  const saved = await page.evaluate(
    ({ key, main }) => ({
      reactions: localStorage.getItem(key),
      main: localStorage.getItem(main),
    }),
    { key: REACTIONS, main: KEY },
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "eoul-backup:photos-pending",
      '{"v":99,"keep":"private"}',
    ),
  );
  await page.goto("/?preview=1&photos=1#/looks");
  await expect(page.locator("[data-react-outfits]")).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
  await fixture(page);
  await expect(
    page.getByRole("button", { name: "AI로 비교", exact: true }),
  ).toBeDisabled();
  await (await firstLike(page)).click();
  expect(await page.evaluate((k) => localStorage.getItem(k), REACTIONS)).toBe(
    saved.reactions,
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(
    saved.main,
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("eoul-backup:photos-pending"),
    ),
  ).toBe('{"v":99,"keep":"private"}');
});
test.describe("outfit own-photo offline", () => {
  test.use({ serviceWorkers: "allow" });
  test("local own photo and reaction survive real origin shutdown while the AI request contains no photo reference", async ({
    page,
    request,
  }) => {
    const ids = await fixture(page);
    const original = await page.evaluate(async (id) => {
      const mod = await (window as any).EOUL_PHOTO_LOAD(),
        canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      canvas.getContext("2d")!.fillRect(0, 0, 2, 2);
      const blob = await new Promise<Blob>((r) =>
        canvas.toBlob((b) => r(b!), "image/png"),
      );
      await mod.saveGarmentPhoto({
        namespace: (window as any).EOUL_MOCK_KEY,
        core: (window as any).K.M,
        garmentId: id,
        file: blob,
        width: 2,
        height: 2,
      });
      return {
        bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
        photoId: (window as any).K.M.getState().closet.find(
          (g: any) => g.id === id,
        ).photoId,
      };
    }, ids[0]);
    await page.goto("/?photos=1&case=outfit-photo#/looks");
    await expect(page.locator("[data-react-outfits]")).toBeVisible();
    await page.locator("[data-outfit-card]").first().scrollIntoViewIfNeeded();
    await expect(
      page.locator(".of-photo .wr-photo-live img").first(),
    ).toHaveAttribute("src", /^blob:/);
    let sent: any;
    await page.route("**/api/rank", (route) => {
      sent = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(response(sent)),
      });
    });
    await page.getByRole("button", { name: "AI로 비교", exact: true }).click();
    await expect(page.locator("[data-outfit-ai-summary]")).toBeVisible();
    expect(JSON.stringify(sent)).not.toContain(original.photoId);
    for (const text of ["photoId", "data:image", "blob:"])
      expect(JSON.stringify(sent)).not.toContain(text);
    await (await firstLike(page)).click();
    await expect(page.locator("[data-react-outfits]")).toHaveAttribute(
      "data-reactions-saved",
      "true",
    );
    const raw = await page.evaluate((k) => localStorage.getItem(k), REACTIONS),
      url = page.url();
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
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:8792(?:\/|$))/, (route) =>
      route.abort(),
    );
    try {
      await request.post("http://127.0.0.1:8793/stop");
      expect(
        await page.evaluate(() =>
          fetch("/__uncached_outfit_probe").then(
            () => true,
            () => false,
          ),
        ),
      ).toBe(false);
      await page.goto("about:blank");
      const loaded = await page.goto(url);
      expect(loaded?.fromServiceWorker()).toBe(true);
      await page.locator("[data-outfit-card]").first().scrollIntoViewIfNeeded();
      await expect(
        page.locator(".of-photo .wr-photo-live img").first(),
      ).toHaveAttribute("src", /^blob:/);
      expect(
        await page.evaluate((k) => localStorage.getItem(k), REACTIONS),
      ).toBe(raw);
      const bytes = await page.evaluate(async (photoId) => {
        const mod = await (window as any).EOUL_PHOTO_LOAD(),
          repo = await mod.photoLibrary((window as any).EOUL_MOCK_KEY),
          photo = await repo.get(photoId);
        return Array.from(new Uint8Array(await photo.blob.arrayBuffer()));
      }, original.photoId);
      expect(bytes).toEqual(original.bytes);
      await page
        .getByRole("button", { name: "AI로 비교", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText("AI 순위가 없는");
      await expect(page.locator("[data-outfit-ai-summary]")).toHaveCount(0);
    } finally {
      await request.post("http://127.0.0.1:8793/start");
    }
  });
});
