import { test, expect, type Page } from "@playwright/test";
const KEY = "eoul-d12-hang:v1";
async function load(page: Page, query = "", photos = false) {
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
  await page.goto("/?photos=" + (photos ? "1" : "0") + query + "#/closet");
  await expect(page.locator("[data-react-closet]")).toBeVisible();
}
async function own(page: Page) {
  return page.evaluate(() => {
    const m = (window as any).K.M;
    const shirt = m.registerGarment({
      draftId: "rail-shirt",
      brand: "합성 브랜드",
      name: "합성 셔츠",
      kind: "shirt",
      color: "white",
      url: "",
    });
    m.updateGarmentProfile(shirt.id, {
      v: 1,
      measures: { length: { cm: 70, source: "measured" } },
    });
    const jacket = m.addGarment({
      kind: "jacket",
      color: "navy",
      label: "합성 재킷",
    });
    m.updateGarmentProfile(jacket.id, {
      v: 1,
      measures: { length: { cm: 60, source: "measured" } },
    });
    const pants = m.addGarment({
      kind: "pants",
      color: "black",
      label: "합성 바지",
    });
    return { shirt: shirt.id, jacket: jacket.id, pants: pants.id };
  });
}

test("empty React rails start without a wardrobe and trial clothes never become owned photos", async ({
  page,
}) => {
  await load(page);
  await expect(
    page.getByRole("heading", { name: "내 옷장", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tablist", { name: "옷 종류" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "체험용 옷장", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "체험용 옷장", exact: true }).click();
  await expect(page.locator("[data-closet-section=trial]")).toContainText(
    "가진 옷이 아니에요",
  );
  await expect(page.locator("[data-photo-input]")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
});

test("wardrobe tools open by keyboard, retain an explicit brand filter and never write clothes", async ({ page }) => {
  await load(page);
  await own(page);
  const before = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())));
  const tools = page.getByRole("button", { name: "옷장 관리", exact: true });
  await expect(tools).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("옷 정렬")).toBeHidden();
  await expect(page.locator('[data-rail-item]').first()).toBeVisible();
  await tools.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("옷 정렬")).toBeVisible();
  await page.getByLabel("브랜드 필터").selectOption("합성 브랜드");
  await tools.click();
  await expect(page.locator(".wr-filter-status")).toContainText("합성 브랜드 · 1벌");
  await page.getByRole("button", { name: "모든 브랜드 보기", exact: true }).click();
  await expect(page.locator(".wr-filter-status")).toHaveCount(0);
  await expect(page.locator('[data-rail-item]')).toHaveCount(3);
  expect(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())))).toBe(before);
});

test("the previous look keeps its wardrobe controls directly available", async ({ page }) => {
  await load(page, "&look=v1");
  await own(page);
  await expect(page.getByLabel("옷 정렬")).toBeVisible();
  await expect(page.getByRole("button", { name: "옷장 관리", exact: true })).toBeHidden();
});

test("rails use measured lengths, keep unknown lengths explicit, and assemble own layers without changing saved bytes", async ({
  page,
}) => {
  await load(page);
  const ids = await own(page);
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await expect(page.locator(`[data-rail-item="${ids.pants}"]`)).not.toContainText(
    "총장",
  );
  await expect(page.locator(`[data-rail-item="${ids.shirt}"]`)).toContainText(
    "총장 70cm",
  );
  const height = async (id: string) =>
    Number(
      await page
        .locator(`[data-rail-item="${id}"] [data-garment-height]`)
        .getAttribute("data-garment-height"),
    );
  expect((await height(ids.shirt)) / (await height(ids.jacket))).toBeCloseTo(
    70 / 60,
    1,
  );
  await page.locator(`[data-rail-item="${ids.shirt}"] [data-pick]`).click();
  await page.locator(`[data-rail-item="${ids.jacket}"] [data-pick]`).click();
  const sheet = page.getByRole("region", { name: "고른 옷" });
  await sheet.getByRole("button", { name: "겹쳐 보기", exact: true }).click();
  await expect(page.locator("[data-assembly-layer]")).toHaveCount(2);
  const z = await page
    .locator("[data-assembly-layer]")
    .evaluateAll((els) =>
      Object.fromEntries(
        els.map((e) => [
          e.getAttribute("data-assembly-layer"),
          getComputedStyle(e).zIndex,
        ]),
      ),
    );
  expect(Number(z.outer)).toBeGreaterThan(Number(z.top));
  await page.getByRole("button", { name: "옷장 관리", exact: true }).click();
  await page.getByLabel("옷 정렬").selectOption("brand");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  await sheet.getByRole("button", { name: "모두 넣어두기" }).click();
  await expect(sheet).toHaveCount(0);
  await page
    .getByRole("button", { name: "내 옷 코디 보기", exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).K.current().view)).toBe(
    "looks",
  );
  await page.locator('#tabs [data-tab="closet"]').focus();
  await expect(page.locator('#tabs [data-tab="closet"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await page.locator(`[data-rail-item="${ids.shirt}"] [data-g]`).click();
  await expect(
    page.locator(".sheet").getByText("합성 셔츠", { exact: true }),
  ).toBeVisible();
});

test("own PNG is attached locally, thumbnails are lazy, reload preserves bytes and corrupt replacement preserves reference", async ({
  page,
}) => {
  await load(page, "", true);
  const ids = await own(page);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  const bytes = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 24;
    c.getContext("2d")!.fillRect(0, 0, 16, 24);
    const b = await new Promise<Blob>((r) =>
      c.toBlob((b) => r(b!), "image/png"),
    );
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await page
    .locator(`[data-rail-item="${ids.shirt}"] .wr-picture`)
    .scrollIntoViewIfNeeded();
  const input = page.locator(
    `[data-rail-item="${ids.shirt}"] [data-photo-input]`,
  );
  await input.setInputFiles({
    name: "my-own-cutout.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "내 사진을 연결했어요" }),
  ).toBeVisible();
  const photoId = await page.evaluate(
    (id) =>
      (window as any).K.M.getState().closet.find((g: any) => g.id === id)
        .photoId,
    ids.shirt,
  );
  await expect(
    page.locator(`[data-rail-item="${ids.shirt}"] img`),
  ).toHaveAttribute("src", /^blob:/);
  await page.reload();
  await expect(page.locator("[data-react-closet]")).toBeVisible();
  await page
    .locator(`[data-rail-item="${ids.shirt}"] .wr-picture`)
    .scrollIntoViewIfNeeded();
  await expect(
    page.locator(`[data-rail-item="${ids.shirt}"] img`),
  ).toHaveAttribute("src", /^blob:/);
  const stored = await page.evaluate(async (id) => {
    const mod = await (window as any).EOUL_PHOTO_LOAD();
    const repo = await mod.photoLibrary();
    const r = await repo.get(id);
    return Array.from(new Uint8Array(await r.blob.arrayBuffer()));
  }, photoId);
  expect(stored).toEqual(bytes);
  await page
    .locator(`[data-rail-item="${ids.shirt}"] .wr-picture`)
    .scrollIntoViewIfNeeded();
  await page
    .locator(`[data-rail-item="${ids.shirt}"] [data-photo-input]`)
    .setInputFiles({
      name: "bad.png",
      mimeType: "image/png",
      buffer: Buffer.from("not a photo"),
    });
  await expect(page.getByRole("alert")).toBeVisible();
  expect(
    await page.evaluate(
      (id) =>
        (window as any).K.M.getState().closet.find((g: any) => g.id === id)
          .photoId,
      ids.shirt,
    ),
  ).toBe(photoId);
  expect(posts).toEqual([]);
});

test("a large closet mounts one page of tiles at a time and still reaches the last item", async ({
  page,
}) => {
  await load(page);
  await own(page);
  await page.evaluate((k) => {
    const snapshot = JSON.parse(localStorage.getItem(k)!);
    const base = snapshot.garments[0];
    snapshot.garments = Array.from({ length: 200 }, (_, i) => ({
      ...base,
      id: "rail-" + i,
      label: "합성 옷 " + i,
    }));
    snapshot.registrations = { v: 2, receipts: [] };
    snapshot.seq = 1000;
    localStorage.setItem(k, JSON.stringify(snapshot));
    (window as any).K.M.reloadSaved();
  }, KEY);
  await expect(page.locator("[data-rail-item]")).toHaveCount(60);
  const more = page.getByRole("button", { name: /벌 더 보기/ });
  await expect(more).toContainText("남은 140벌");
  for (let i = 0; i < 3; i++) await more.click();
  await expect(page.locator("[data-rail-item]")).toHaveCount(200);
  await expect(more).toHaveCount(0);
  await page.locator('[data-rail-item="rail-0"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-rail-item="rail-0"]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("leaving the React closet releases its thumbnail URLs and keeps a usable vanilla fallback", async ({
  page,
}) => {
  await load(page, "", true);
  const ids = await own(page);
  await page.addInitScript(() => {
    const active = new Set<string>();
    (window as any).__activePhotoUrls = active;
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = function (b) {
      const u = create(b);
      active.add(u);
      return u;
    };
    URL.revokeObjectURL = function (u) {
      active.delete(u);
      return revoke(u);
    };
  });
  const bytes = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const b = await new Promise<Blob>((r) =>
      c.toBlob((b) => r(b!), "image/png"),
    );
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await page
    .locator(`[data-rail-item="${ids.shirt}"] .wr-picture`)
    .scrollIntoViewIfNeeded();
  await page
    .locator(`[data-rail-item="${ids.shirt}"] [data-photo-input]`)
    .setInputFiles({
      name: "my-own.png",
      mimeType: "image/png",
      buffer: Buffer.from(bytes),
    });
  await expect(
    page.locator(`[data-rail-item="${ids.shirt}"] img`),
  ).toBeVisible();
  await page.reload();
  await page
    .locator(`[data-rail-item="${ids.shirt}"] .wr-picture`)
    .scrollIntoViewIfNeeded();
  await expect(
    page.locator(`[data-rail-item="${ids.shirt}"] img`),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__activePhotoUrls.size),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "찾기", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__activePhotoUrls.size))
    .toBe(0);
  await page.goto("/?photos=0&ui=vanilla#/closet");
  await expect(page.locator(".shelf [data-g]")).toHaveCount(3);
  await expect(page.locator("[data-react-closet]")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).K.M.getState().closetCount),
  ).toBe(3);
});

test("desktop rails with verified twofold component text stay inside the page without persisting view preferences", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await load(page);
  await own(page);
  const before = await page.evaluate(() =>
    JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())),
  );
  await page.getByRole("button", { name: "옷장 관리", exact: true }).click();
  await page.getByLabel("옷 정렬").selectOption("worn");
  await page.getByLabel("브랜드 필터").selectOption("합성 브랜드");
  const scale = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>(".wr, .wr *")];
    const sizes = nodes.map(
      (node) => [node, parseFloat(getComputedStyle(node).fontSize)] as const,
    );
    const before = [".wr h1", ".wr-card-name", ".wr select"].map((selector) =>
      parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize),
    );
    for (const [node, size] of sizes)
      node.style.setProperty("font-size", `${size * 2}px`, "important");
    const after = [".wr h1", ".wr-card-name", ".wr select"].map((selector) =>
      parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize),
    );
    return { before, after };
  });
  expect(scale.after).toEqual(scale.before.map((size) => size * 2));
  await expect(
    page.getByRole("heading", { name: "내 옷장", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())),
    ),
  ).toBe(before);
});

test("short and long measured garments retain the same physical display scale", async ({
  page,
}) => {
  await load(page);
  const ids = await own(page);
  await page.evaluate(({ shirt, pants }) => {
    const m = (window as any).K.M;
    m.updateGarmentProfile(shirt, {
      v: 1,
      measures: { length: { cm: 30, source: "measured" } },
    });
    m.updateGarmentProfile(pants, {
      v: 1,
      measures: { length: { cm: 140, source: "measured" } },
    });
  }, ids);
  const a = await page
      .locator(`[data-rail-item="${ids.shirt}"] [data-garment-height]`)
      .boundingBox(),
    b = await page
      .locator(`[data-rail-item="${ids.pants}"] [data-garment-height]`)
      .boundingBox();
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(a!.height / b!.height).toBeCloseTo(30 / 140, 2);
});

test.describe("closet runtime offline", () => {
  test.use({ serviceWorkers: "allow" });
  test("first visited closet caches its actual runtime after worker control and reopens the React rail with origin stopped", async ({
    page,
    request,
  }) => {
    await load(page);
    await own(page);
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
        page.evaluate(async () => {
          const assets: string[] = [];
          for (const key of await caches.keys())
            for (const req of await (await caches.open(key)).keys())
              if (new URL(req.url).pathname.startsWith("/react/"))
                assets.push(new URL(req.url).pathname);
          return {
            closet: assets.some((x) => /closet-.*\.js$/.test(x)),
            shared: assets.some((x) => /assets\/client-.*\.js$/.test(x)),
            css: assets.some((x) => /closet-.*\.css$/.test(x)),
          };
        }),
      )
      .toEqual({ closet: true, shared: true, css: true });
    const raw = await page.evaluate((k) => localStorage.getItem(k), KEY),
      url = page.url();
    await page.unrouteAll({ behavior: "wait" });
    try {
      await request.post("http://127.0.0.1:8793/stop");
      expect(
        await page.evaluate(() =>
          fetch("/__uncached_closet_probe").then(
            () => true,
            () => false,
          ),
        ),
      ).toBe(false);
      await page.goto("about:blank");
      const response = await page.goto(url);
      expect(response?.fromServiceWorker()).toBe(true);
      await expect(page.locator("[data-react-closet]")).toBeVisible();
      await expect(page.locator("[data-rail-item]")).toHaveCount(3);
      expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(
        raw,
      );
    } finally {
      await request.post("http://127.0.0.1:8793/start");
    }
  });
});

test("unavailable React bundle falls back to the preserved closet and still exposes backup without discarding records", async ({
  page,
}) => {
  await page.route("**/react/closet-*.js", (route) => route.abort());
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await own(page);
  await page.evaluate(() => (window as any).K.refresh());
  await expect(
    page.getByText(
      "새 화면을 불러오지 못해 기존 옷장으로 열었어요. 연결되면 다시 열어 주세요.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".shelf [data-g]")).toHaveCount(3);
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.locator("[data-backup]").click();
  await expect(
    page.getByRole("heading", { name: "백업 · 복원", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
});
