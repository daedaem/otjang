import { test, expect, type Page } from "@playwright/test";
const KEY = "eoul-d12-hang:v1",
  DRAFT = "eoul-d12-hang:profile-drafts:v1",
  INPUT = "eoul-d12-hang:input-draft:v1";
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
async function seed(page: Page) {
  return page.evaluate(() => {
    const m = (window as any).K.M,
      g = m.registerGarment({
        draftId: "owned-profile-test",
        brand: "합성 브랜드",
        name: "합성 옥스퍼드",
        kind: "shirt",
        color: "white",
        url: "https://example.test/own",
        profile: {
          v: 1,
          measures: { length: { cm: 70, source: "seller" } },
          fabric: { value: "코튼", source: "ai" },
        },
      }),
      other = m.addGarment({
        kind: "shirt",
        color: "blue",
        label: "다른 기준 셔츠",
      });
    m.updateGarmentProfile(other.id, { v: 1, reference: true });
    return { id: g.id, other: other.id };
  });
}
async function open(page: Page, id: string) {
  await page.locator(`[data-g="${id}"]`).click();
  await expect(page.locator("[data-profile-editor]")).toBeVisible();
}
test("owned editor saves measurements and one reference atomically without confirming another AI attribute", async ({
  page,
}) => {
  const f = await seed(page);
  await open(page, f.id);
  await page.getByLabel("총장 (cm)", { exact: true }).fill("72");
  await page.getByLabel("총장 출처", { exact: true }).selectOption("measured");
  await page.getByLabel("이 종류의 비교 기준 옷", { exact: true }).check();
  await page.getByRole("button", { name: "옷 정보 저장", exact: true }).click();
  await expect(page.locator("[data-profile-editor]")).toContainText(
    "옷 정보를 저장했어요",
  );
  const result = await page.evaluate(({ id, other }) => {
    const m = (window as any).K.M;
    return {
      a: m.getState().closet.find((g: any) => g.id === id),
      b: m.getState().closet.find((g: any) => g.id === other),
      receipt: JSON.parse(localStorage.getItem("eoul-d12-hang:v1")!)
        .registrations.receipts[0],
    };
  }, f);
  expect(result.a.profile.measures.length).toEqual({
    cm: 72,
    source: "measured",
  });
  expect(result.a.profile.fabric.source).toBe("ai");
  expect(result.a.profile.reference).toBe(true);
  expect(result.b.profile.reference).toBeUndefined();
  expect(result.receipt.input.profile.measures.length.cm).toBe(70);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.reload();
  await open(page, f.id);
  await expect(page.getByLabel("총장 (cm)", { exact: true })).toHaveValue("72");
});
test("unfinished owned measurement resumes after reload and leaves the independent registration input untouched", async ({
  page,
}) => {
  const f = await seed(page);
  await page.evaluate(
    (k) => localStorage.setItem(k, "registration-original"),
    INPUT,
  );
  await open(page, f.id);
  await page.getByLabel("총장 (cm)", { exact: true }).fill("72.");
  await expect
    .poll(() =>
      page.evaluate(
        ({ DRAFT, id }) => {
          try {
            return JSON.parse(localStorage.getItem(DRAFT)!).edits[id].form
              .measures.length;
          } catch {
            return null;
          }
        },
        { DRAFT, id: f.id },
      ),
    )
    .toBe("72.");
  await page.reload();
  await open(page, f.id);
  await page.getByRole("button", { name: "이어서 수정", exact: true }).click();
  await expect(page.getByLabel("총장 (cm)", { exact: true })).toHaveValue(
    "72.",
  );
  await page.getByRole("button", { name: "옷 정보 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("총장");
  expect(await page.evaluate((k) => localStorage.getItem(k), INPUT)).toBe(
    "registration-original",
  );
  expect(
    await page.evaluate(
      (id) =>
        (window as any).K.M.getState().closet.find((g: any) => g.id === id)
          .profile.measures.length.cm,
      f.id,
    ),
  ).toBe(70);
});
test("a failed wardrobe write retains owned draft and existing purchase data then retries once", async ({
  page,
}) => {
  const f = await seed(page);
  const raw = await page.evaluate(() => {
    const m = (window as any).K.M;
    m.decide("ms-728000", "buy");
    m.advance("ms-728000", "ordered");
    const before = localStorage.getItem("eoul-d12-hang:v1");
    const original = Storage.prototype.setItem;
    (window as any).__failProfile = true;
    Storage.prototype.setItem = function (k, v) {
      if (k === "eoul-d12-hang:v1" && (window as any).__failProfile)
        throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, k, v);
    };
    return before;
  });
  await open(page, f.id);
  await page.getByLabel("총장 (cm)", { exact: true }).fill("72");
  await page.getByRole("button", { name: "옷 정보 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("저장하지 못");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  await page.evaluate(() => ((window as any).__failProfile = false));
  await page.getByRole("button", { name: "옷 정보 저장", exact: true }).click();
  await expect(page.locator("[data-profile-editor]")).toContainText(
    "옷 정보를 저장했어요",
  );
  expect(
    await page.evaluate(() => (window as any).K.M.getState().records[0].stage),
  ).toBe("ordered");
});

for (const navigation of ["back", "route"] as const)
  test(`unsaved draft quota failure warns before ${navigation} navigation and keeps visible input until a choice`, async ({
    page,
  }) => {
    const f = await seed(page);
    await page.evaluate(() => {
      (window as any).K.go("home");
      (window as any).K.go("closet");
    });
    await open(page, f.id);
    await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      (window as any).__draftQuota = true;
      Storage.prototype.setItem = function (k, v) {
        if (
          k === "eoul-d12-hang:profile-drafts:v1" &&
          (window as any).__draftQuota
        )
          throw new DOMException("quota", "QuotaExceededError");
        return set.call(this, k, v);
      };
    });
    await page.getByLabel("총장 (cm)", { exact: true }).fill("74");
    await expect(page.locator(".rp-status")).toContainText(
      "초안을 저장하지 못",
    );
    if (navigation === "back") await page.goBack();
    else await page.evaluate(() => (window as any).K.go("records"));
    await expect(page.getByRole("alertdialog")).toContainText(
      "아직 보관하지 못한 입력",
    );
    await expect(page.getByLabel("총장 (cm)", { exact: true })).toHaveValue(
      "74",
    );
    await page.getByRole("button", { name: "계속 수정", exact: true }).click();
    await expect(page.locator("[data-profile-editor]")).toBeVisible();
    await expect(page.getByLabel("총장 (cm)", { exact: true })).toHaveValue(
      "74",
    );
    await page.evaluate(() => ((window as any).__draftQuota = false));
    await page
      .getByRole("button", { name: "옷 정보 저장", exact: true })
      .click();
    await expect(page.locator("[data-profile-editor]")).toContainText(
      "옷 정보를 저장했어요",
    );
    expect(
      await page.evaluate(
        (id) =>
          (window as any).K.M.getState().closet.find((g: any) => g.id === id)
            .profile.measures.length.cm,
        f.id,
      ),
    ).toBe(74);
  });

test("first concurrent closet and profile loaders resolve after a single shared stylesheet response", async ({
  page,
}) => {
  // The registration view has not requested either garment screen stylesheet.
  await page.goto("/?photos=0&input=react&loader=concurrent#/reg");
  await expect(
    page.getByRole("heading", {
      name: "어떤 옷을 가지고 있나요?",
      exact: true,
    }),
  ).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let requested = false;
  await page.route("**/react/OwnedPhoto-*.css", async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  await page.evaluate(() => {
    (window as any).__closetReady = false;
    (window as any).__profileReady = false;
    void (window as any)
      .EOUL_CLOSET_LOAD()
      .then(() => ((window as any).__closetReady = true));
    void (window as any)
      .EOUL_PROFILE_LOAD()
      .then(() => ((window as any).__profileReady = true));
  });
  await expect.poll(() => requested).toBe(true);
  release();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        closet: (window as any).__closetReady,
        profile: (window as any).__profileReady,
      })),
    )
    .toEqual({ closet: true, profile: true });
});

test("saved profile plus failed draft cleanup retries from the UI without another wardrobe write", async ({
  page,
}) => {
  const f = await seed(page);
  await open(page, f.id);
  await page.getByLabel("총장 (cm)", { exact: true }).fill("72");
  await page.evaluate(() => {
    const remove = Storage.prototype.removeItem,
      set = Storage.prototype.setItem;
    (window as any).__failCleanup = true;
    (window as any).__profileWrites = 0;
    Storage.prototype.removeItem = function (k) {
      if (
        k === "eoul-d12-hang:profile-drafts:v1" &&
        (window as any).__failCleanup
      )
        throw new DOMException("quota", "QuotaExceededError");
      return remove.call(this, k);
    };
    Storage.prototype.setItem = function (k, v) {
      if (k === "eoul-d12-hang:v1") (window as any).__profileWrites++;
      return set.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "옷 정보 저장", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "초안 정리 다시", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".rp-status")).toBeInViewport({ ratio: 0.9 });
  const writes = await page.evaluate(() => (window as any).__profileWrites);
  expect(
    await page.evaluate(
      (id) =>
        (window as any).K.M.getState().closet.find((g: any) => g.id === id)
          .profile.measures.length.cm,
      f.id,
    ),
  ).toBe(72);
  await page.evaluate(() => ((window as any).__failCleanup = false));
  await page
    .getByRole("button", { name: "초안 정리 다시", exact: true })
    .click();
  await expect(page.locator("[data-profile-editor]")).toContainText(
    "옷 정보를 저장했어요",
  );
  expect(await page.evaluate(() => (window as any).__profileWrites)).toBe(
    writes,
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), DRAFT)).toBeNull();
});

test("explicit AI attribute confirmation survives reopening and reload with focus restored on Escape", async ({
  page,
}) => {
  const f = await seed(page);
  await open(page, f.id);
  await page.getByRole("tab", { name: "소재·디테일", exact: true }).click();
  await expect(page.locator("[data-profile-editor]")).toContainText(
    "AI 추정 · 확인 전",
  );
  await page.getByLabel("소재 추정을 확인했어요", { exact: true }).check();
  await page.getByRole("button", { name: "옷 정보 저장", exact: true }).click();
  await expect(page.locator("[data-profile-editor]")).toContainText(
    "옷 정보를 저장했어요",
  );
  expect(
    await page.evaluate(
      (id) =>
        (window as any).K.M.getState().closet.find((g: any) => g.id === id)
          .profile.fabric.source,
      f.id,
    ),
  ).toBe("chosen");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-profile-editor]")).toHaveCount(0);
  await expect(page.locator(`[data-g="${f.id}"]`)).toBeFocused();
  await page.reload();
  await open(page, f.id);
  expect(
    await page.evaluate(
      (id) =>
        (window as any).K.M.getState().closet.find((g: any) => g.id === id)
          .profile.fabric.source,
      f.id,
    ),
  ).toBe("chosen");
});

test("durable unsaved edit closes with Escape, reopens as a draft, and future draft keeps an exact raw backup path", async ({
  page,
}) => {
  const f = await seed(page);
  await open(page, f.id);
  await page.getByLabel("총장 (cm)", { exact: true }).fill("73");
  await expect(page.locator("[data-profile-editor]")).toHaveAttribute(
    "data-draft-saved",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-profile-editor]")).toHaveCount(0);
  expect(
    await page.evaluate(
      (id) =>
        (window as any).K.M.getState().closet.find((g: any) => g.id === id)
          .profile.measures.length.cm,
      f.id,
    ),
  ).toBe(70);
  await open(page, f.id);
  await page.getByRole("button", { name: "이어서 수정", exact: true }).click();
  await expect(page.getByLabel("총장 (cm)", { exact: true })).toHaveValue("73");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  const raw = ' {"v":99,"edits":{},"future":"원문"} ';
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: DRAFT,
    raw,
  });
  await open(page, f.id);
  await expect(page.getByRole("alert")).toContainText("원문");
  await page
    .getByRole("button", { name: "백업으로 원문 보관", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "백업 · 복원", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), DRAFT)).toBe(raw);
});

test("existing selected garment combination count and first two distinct previews remain available as rules", async ({
  page,
}) => {
  const f = await seed(page);
  const expected = await page.evaluate((id) => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "pants", slot: "m-chino", color: "beige" });
    m.addGarment({ kind: "sneaker", slot: "m-white-sneaker", color: "white" });
    const list = m
      .closetOutfits({ detail: true })
      .list.filter((o: any) => o.pieces.some((p: any) => p.garmentId === id));
    return {
      count: list.length,
      previews: Math.min(2, new Set(list.map((x: any) => x.key)).size),
    };
  }, f.id);
  expect(expected.count).toBeGreaterThan(0);
  await open(page, f.id);
  await expect(page.locator("[data-owned-outfit-count]")).toHaveText(
    String(expected.count),
  );
  await page.locator(".rp-looks > summary").click();
  await expect(page.locator("[data-owned-look]")).toHaveCount(
    expected.previews,
  );
  await expect(page.locator(".rp-looks")).toContainText("편집 규칙");
  await expect(page.locator("[data-owned-piece]").first()).toBeVisible();
});

test("another window newer profile cannot be overwritten by the open editor", async ({
  page,
  context,
}) => {
  const f = await seed(page);
  await open(page, f.id);
  await page.getByLabel("총장 (cm)", { exact: true }).fill("74");
  await expect(page.locator("[data-profile-editor]")).toHaveAttribute(
    "data-draft-saved",
    "true",
  );
  const other = await context.newPage();
  await other.goto("/?photos=0&tab=other#/closet");
  await other.waitForFunction(() => !!(window as any).K?.M);
  const latest = await other.evaluate((id) => {
    const m = (window as any).K.M,
      g = m.getState().closet.find((g: any) => g.id === id);
    m.updateGarmentProfile(id, {
      ...g.profile,
      measures: {
        ...g.profile.measures,
        length: { cm: 78, source: "measured" },
      },
    });
    return localStorage.getItem("eoul-d12-hang:v1");
  }, f.id);
  await other.close();
  await page.getByRole("button", { name: "옷 정보 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("다른 화면");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(latest);
  await expect(page.getByLabel("총장 (cm)", { exact: true })).toHaveValue("74");
  expect(
    await page.evaluate(
      ({ key, id }) =>
        JSON.parse(localStorage.getItem(key)!).edits[id].form.measures.length,
      { key: DRAFT, id: f.id },
    ),
  ).toBe("74");
});

test("background refresh and fragment navigation do not silently discard a failed draft input", async ({
  page,
}) => {
  const f = await seed(page);
  await open(page, f.id);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "eoul-d12-hang:profile-drafts:v1")
        throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await page.getByLabel("총장 (cm)", { exact: true }).fill("74");
  await expect(page.locator(".rp-status")).toContainText("초안을 저장하지 못");
  await page.evaluate(() => (window as any).K.refresh());
  await expect(page.getByLabel("총장 (cm)", { exact: true })).toHaveValue("74");
  await page.evaluate(() => {
    (window as any).__editorDetached = false;
    const el = document.querySelector("[data-profile-editor]")!;
    new MutationObserver(() => {
      if (!el.isConnected) (window as any).__editorDetached = true;
    }).observe(document.body, { childList: true, subtree: true });
    location.hash = "#/records";
  });
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
  await expect(page.locator("[data-profile-editor]")).toBeVisible();
  await expect(page.getByLabel("총장 (cm)", { exact: true })).toHaveValue("74");
  expect(await page.evaluate(() => (window as any).__editorDetached)).toBe(
    false,
  );
  if (await page.getByRole("alertdialog").count())
    await page.getByRole("button", { name: "계속 수정", exact: true }).click();
});

test("colour change and explicit removal preserve the edit draft and historical registration", async ({
  page,
}) => {
  const f = await seed(page);
  await open(page, f.id);
  await page.getByLabel("총장 (cm)", { exact: true }).fill("74");
  await expect(page.locator("[data-profile-editor]")).toHaveAttribute(
    "data-draft-saved",
    "true",
  );
  await page.getByRole("button", { name: "색 바꾸기", exact: true }).click();
  await page.getByRole("button", { name: "라이트 블루", exact: true }).click();
  await expect(page.getByLabel("총장 (cm)", { exact: true })).toHaveValue("74");
  expect(
    await page.evaluate(
      (id) =>
        (window as any).K.M.getState().closet.find((g: any) => g.id === id)
          .color,
      f.id,
    ),
  ).toBe("blue");
  expect(
    await page.evaluate(
      (id) =>
        (window as any).K.M.getState().closet.find((g: any) => g.id === id)
          .profile.measures.length.cm,
      f.id,
    ),
  ).toBe(70);
  await page
    .locator(".rp-actions")
    .getByRole("button", { name: "옷장에서 빼기", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "옷장에서 빼기", exact: true })
    .click();
  await expect(page.locator("[data-profile-editor]")).toHaveCount(0);
  const saved = await page.evaluate(
    ({ key, draft, id }) => ({
      core: JSON.parse(localStorage.getItem(key)!),
      draft: JSON.parse(localStorage.getItem(draft)!).edits[id],
    }),
    { key: KEY, draft: DRAFT, id: f.id },
  );
  expect(saved.core.garments.some((g: any) => g.id === f.id)).toBe(false);
  expect(
    saved.core.registrations.receipts.some((r: any) => r.garmentId === f.id),
  ).toBe(true);
  expect(saved.draft.form.measures.length).toBe("74");
});

test.describe("owned profile offline", () => {
  test.use({ serviceWorkers: "allow" });
  test("a visited editor reopens the actual shared styles, own photo and unfinished draft with the origin stopped", async ({
    page,
    request,
  }) => {
    const f = await seed(page);
    await page.goto("/?photos=1&offline=profile#/closet");
    await page.waitForFunction(() => !!(window as any).K?.M);
    const original = await page.evaluate(async (id) => {
      const mod = await (window as any).EOUL_PHOTO_LOAD(),
        c = document.createElement("canvas");
      c.width = 2;
      c.height = 2;
      c.getContext("2d")!.fillRect(0, 0, 2, 2);
      const file = await new Promise<Blob>((r) =>
        c.toBlob((b) => r(b!), "image/png"),
      );
      await mod.saveGarmentPhoto({
        namespace: (window as any).EOUL_MOCK_KEY,
        core: (window as any).K.M,
        garmentId: id,
        file,
        width: 2,
        height: 2,
      });
      return {
        bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
        photoId: (window as any).K.M.getState().closet.find(
          (g: any) => g.id === id,
        ).photoId,
      };
    }, f.id);
    await open(page, f.id);
    await expect(page.locator(".rp-photo img")).toHaveAttribute(
      "src",
      /^blob:/,
    );
    await page.getByLabel("총장 (cm)", { exact: true }).fill("72.");
    await expect(page.locator("[data-profile-editor]")).toHaveAttribute(
      "data-draft-saved",
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
          const available = new Set<string>();
          for (const name of await caches.keys())
            for (const req of await (await caches.open(name)).keys())
              available.add(new URL(req.url).pathname);
          return paths.filter((p) => !available.has(p));
        }, visited),
      )
      .toEqual([]);
    const url = page.url();
    await page.unrouteAll({ behavior: "wait" });
    try {
      await request.post("http://127.0.0.1:8793/stop");
      expect(
        await page.evaluate(() =>
          fetch("/__uncached_profile_probe").then(
            () => true,
            () => false,
          ),
        ),
      ).toBe(false);
      await page.goto("about:blank");
      const response = await page.goto(url);
      expect(response?.fromServiceWorker()).toBe(true);
      await expect(page.locator("[data-react-closet]")).toBeVisible();
      await open(page, f.id);
      await page
        .getByRole("button", { name: "이어서 수정", exact: true })
        .click();
      await expect(page.getByLabel("총장 (cm)", { exact: true })).toHaveValue(
        "72.",
      );
      await expect(page.locator(".rp-photo img")).toHaveAttribute(
        "src",
        /^blob:/,
      );
      const bytes = await page.evaluate(async (id) => {
        const mod = await (window as any).EOUL_PHOTO_LOAD(),
          repo = await mod.photoLibrary((window as any).EOUL_MOCK_KEY),
          record = await repo.get(id);
        return Array.from(new Uint8Array(await record.blob.arrayBuffer()));
      }, original.photoId);
      expect(bytes).toEqual(original.bytes);
    } finally {
      await request.post("http://127.0.0.1:8793/start");
    }
  });
});
