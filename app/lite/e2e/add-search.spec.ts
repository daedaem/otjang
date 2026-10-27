import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
const KEY = "eoul-d12-hang:v1";
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return route.abort();
    if (u.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          count: 1,
          min: 3,
          fetchedAt: "2026-10-27T00:00:00.000Z",
          usableCount: 0,
        }),
      });
    return route.continue();
  });
  await page.goto("/?photos=0#/closet");
  await expect(page.locator("[data-react-closet]")).toBeVisible();
});
async function open(page: Page) {
  await page.evaluate(() => (window as any).K.go("add", {}));
  await expect(
    page.getByLabel("브랜드나 상품명", { exact: true }),
  ).toBeVisible();
}
test("searching to register owned clothes leaves the wardrobe, purchase decisions and recent query exactly unchanged", async ({
  page,
}) => {
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "pants", color: "black" });
    m.decide("ms-728000", "hold");
  });
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await open(page);
  await page.getByLabel("브랜드나 상품명", { exact: true }).fill("옥스퍼드");
  await expect(page.locator("[data-own-add]").first()).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
});
test("typing never submits retailer search and a submitted query does not carry into edited text", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as any;
    w.domesticQueries = [];
    w.EOUL_ADPICK = async (q: string) => {
      w.domesticQueries.push(q);
      return { items: [], omitted: 0, fetchedAt: "2026-10-27T00:00:00.000Z" };
    };
  });
  await open(page);
  const q = page.getByLabel("브랜드나 상품명", { exact: true });
  await q.fill("합성 셔츠");
  await expect(page.locator("#aopen")).toContainText("공개 상품");
  expect(await page.evaluate(() => (window as any).domesticQueries)).toEqual(
    [],
  );
  await q.press("Enter");
  await expect
    .poll(() => page.evaluate(() => (window as any).domesticQueries))
    .toEqual(["합성 셔츠"]);
  await q.fill("다른 합성 셔츠");
  await expect(page.locator("#adom")).toBeEmpty();
  expect(await page.evaluate(() => (window as any).domesticQueries)).toEqual([
    "합성 셔츠",
  ]);
});
test("late public-product results cannot replace a newer search and selected facts enter the existing registration draft", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as any,
      old = w.EOUL_OPEN_PRODUCTS;
    w.pendingFacts = {};
    w.EOUL_OPEN_PRODUCTS = {
      ...old,
      search: (q: string) =>
        !q
          ? Promise.resolve({
              items: [],
              fetchedAt: "2026-10-27T00:00:00.000Z",
              usableCount: 2,
            })
          : new Promise((resolve) => (w.pendingFacts[q] = resolve)),
    };
  });
  await open(page);
  const q = page.getByLabel("브랜드나 상품명", { exact: true });
  await q.fill("합성 첫 검색");
  await page.waitForFunction(
    () => !!(window as any).pendingFacts["합성 첫 검색"],
  );
  await q.fill("합성 둘 검색");
  await page.waitForFunction(
    () => !!(window as any).pendingFacts["합성 둘 검색"],
  );
  await page.evaluate(() => {
    (window as any).pendingFacts["합성 둘 검색"]({
      items: [
        {
          code: "1234567890123",
          brand: "합성 브랜드",
          name: "둘째 합성 셔츠",
          categories: ["en:clothing", "en:shirts"],
          url: "https://world.openproductsfacts.org/product/1234567890123",
        },
      ],
      fetchedAt: "2026-10-27T00:00:00.000Z",
      usableCount: 2,
    });
  });
  await expect(page.locator("#aopen")).toContainText("둘째 합성 셔츠");
  await page.evaluate(() => {
    (window as any).pendingFacts["합성 첫 검색"]({
      items: [
        {
          code: "1234567890124",
          brand: "합성 브랜드",
          name: "첫째 합성 셔츠",
          categories: ["en:clothing", "en:shirts"],
          url: "https://world.openproductsfacts.org/product/1234567890124",
        },
      ],
      fetchedAt: "2026-10-27T00:00:00.000Z",
      usableCount: 2,
    });
  });
  await expect(page.locator("#aopen")).not.toContainText("첫째 합성 셔츠");
  await page.locator("[data-opf-add]").click();
  await expect(page.getByLabel("브랜드", { exact: true })).toHaveValue(
    "합성 브랜드",
  );
  await expect(page.getByLabel("상품명", { exact: true })).toHaveValue(
    "둘째 합성 셔츠",
  );
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
});
test("failed catalog ownership save preserves the query and retries the same product once", async ({
  page,
}) => {
  await open(page);
  const q = page.getByLabel("브랜드나 상품명", { exact: true });
  await q.fill("옥스퍼드");
  const own = page.locator("[data-own-add]").first();
  await expect(own).toBeVisible();
  const id = await own.getAttribute("data-own-add");
  await page.evaluate((k) => {
    const w = window as any;
    w.addSet = Storage.prototype.setItem;
    w.failAdd = true;
    Storage.prototype.setItem = function (key, value) {
      if (w.failAdd && key === k)
        throw new DOMException("quota", "QuotaExceededError");
      return w.addSet.call(this, key, value);
    };
  }, KEY);
  await own.click();
  await expect(page.locator(".k-toast")).toContainText("저장");
  await expect(q).toHaveValue("옥스퍼드");
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
  await page.evaluate(() => ((window as any).failAdd = false));
  await own.click();
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (window as any).K.M.getState().closet.filter(
            (g: any) => g.productId === id,
          ).length,
        id,
      ),
    )
    .toBe(1);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (window as any).K.M.getState().closet.filter(
            (g: any) => g.productId === id,
          ).length,
        id,
      ),
    )
    .toBe(1);
});

test("direct add entry and reload preserve existing raw records and Back has a closet fallback", async ({
  page,
}) => {
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.addGarment({ kind: "pants", color: "black" });
    m.decide("ms-728000", "hold");
  });
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await page.goto("/?photos=0&entry=direct-add#/add");
  await expect(
    page.getByLabel("브랜드나 상품명", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
  await page.reload();
  await expect(
    page.getByLabel("브랜드나 상품명", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await expect(page.locator("[data-react-closet]")).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
});

test("React crowd metadata retry retains the saved garment and refuses a target deleted in another window", async ({
  page,
  context,
}) => {
  await page.evaluate(() => {
    const w = window as any;
    w.EOUL_CROWD = {
      submit: async () => ({}),
      search: async () => ({
        items: [
          {
            brand: "합성 등록 브랜드",
            name: "합성 등록 셔츠",
            kind: "shirt",
            color: "blue",
            count: 3,
          },
        ],
      }),
    };
    w.metaSet = Storage.prototype.setItem;
    w.failMeta = true;
    Storage.prototype.setItem = function (key, value) {
      if (w.failMeta && key === "eoul-d12-hang:reg")
        throw new DOMException("quota", "QuotaExceededError");
      return w.metaSet.call(this, key, value);
    };
  });
  await open(page);
  await expect(page.locator("[data-react-add-search]")).toBeVisible();
  await page.getByLabel("브랜드나 상품명", { exact: true }).fill("합성 등록");
  await expect(page.locator("#acrowd")).toContainText("합성 등록 셔츠");
  await page.locator("#acrowd [data-crowd-add]").click();
  await expect(page.locator(".as-pending")).toBeVisible();
  const id = await page.evaluate(
    () => (window as any).K.M.getState().closet[0].id,
  );
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(1);
  const other = await context.newPage();
  await other.route("**/*", (r) =>
    new URL(r.request().url()).origin === "http://127.0.0.1:8792"
      ? r.continue()
      : r.abort(),
  );
  await other.goto("/?photos=0&window=crowd-delete#/closet");
  await expect(other.locator("[data-react-closet]")).toBeVisible();
  await other.evaluate((id) => (window as any).K.M.removeGarment(id), id);
  await expect
    .poll(() => page.evaluate(() => (window as any).K.M.getState().mineCount))
    .toBe(0);
  await page.evaluate(() => ((window as any).failMeta = false));
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await page.locator(".as-pending button").first().click();
  await expect(page.locator(".as-pending")).toBeVisible();
  await expect(page.locator(".k-toast")).toContainText("삭제");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  expect(
    await page.evaluate(() => localStorage.getItem("eoul-d12-hang:reg")),
  ).toBeNull();
  await page
    .locator(".as-pending")
    .getByRole("button", { name: "입력 내려두기", exact: true })
    .click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "내려두기", exact: true })
    .click();
  await expect(page.locator(".as-pending")).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  await other.close();
});

test("React registration rows keep gender, kind and colour facts, and a partial metadata retry creates one garment", async ({
  page,
}) => {
  const labels = await page.evaluate(() => {
    const w = window as any,
      m = w.K.M,
      p = m.findProducts("옥스퍼드", { limit: 1 })[0];
    m.setGender(p.gender === "M" ? "F" : "M");
    w.EOUL_CROWD = {
      submit: async () => ({}),
      search: async () => ({
        items: [
          {
            brand: "합성 등록 브랜드",
            name: "합성 등록 셔츠",
            kind: "shirt",
            color: "blue",
            count: 3,
          },
        ],
      }),
    };
    w.metaSet = Storage.prototype.setItem;
    w.failMeta = true;
    Storage.prototype.setItem = function (key, value) {
      if (w.failMeta && key === "eoul-d12-hang:reg")
        throw new DOMException("quota", "QuotaExceededError");
      return w.metaSet.call(this, key, value);
    };
    return {
      id: p.id,
      gender: p.gender === "M" ? "남성" : "여성",
      kind: m.kindChoices().find((k: any) => k.id === "shirt").name,
      color: m.colorChoices().find((c: any) => c.id === "blue").label,
    };
  });
  await open(page);
  await page.getByLabel("브랜드나 상품명", { exact: true }).fill("옥스퍼드");
  await expect(page.locator(`[data-srow="${labels.id}"]`)).toContainText(
    labels.gender,
  );
  await expect(page.locator("#acrowd")).toContainText(labels.kind);
  await expect(page.locator("#acrowd")).toContainText(labels.color);
  await page.locator("#acrowd [data-crowd-add]").click();
  await expect(page.locator(".as-pending")).toBeVisible();
  const id = await page.evaluate(
    () => (window as any).K.M.getState().closet[0].id,
  );
  await page.getByRole("button", { name: "뒤로", exact: true }).click();
  await expect(page.locator("dialog[open]")).toContainText(
    "보관하지 못한 추가 정보",
  );
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "계속 보관하기", exact: true })
    .click();
  await expect(page.getByLabel("브랜드나 상품명", { exact: true })).toHaveValue(
    "옥스퍼드",
  );
  await page.evaluate(() => ((window as any).failMeta = false));
  await page.locator(".as-pending button").first().click();
  await expect(page.locator(".as-pending")).toHaveCount(0);
  expect(
    await page.evaluate((id) => {
      const list = (window as any).K.M.getState().closet;
      return list.length === 1 && list[0].id === id;
    }, id),
  ).toBe(true);
  const stored = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem("eoul-d12-hang:reg")!).items[id],
    id,
  );
  expect(stored).toMatchObject({
    brand: "합성 등록 브랜드",
    name: "합성 등록 셔츠",
    kind: "shirt",
    color: "blue",
  });
});
test("React add loader failure keeps the vanilla search usable without changing existing raw", async ({
  page,
}) => {
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await page.route("**/react/addSearch-*.js", (r) => r.abort());
  await open(page);
  await expect(page.locator("[data-react-add-search]")).toHaveCount(0);
  await expect(
    page.getByText("새 검색 화면을 열지 못해 기존 화면으로 열었어요.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("브랜드나 상품명", { exact: true }).fill("옥스퍼드");
  await expect(page.locator("[data-own-add]").first()).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
});
test("explicit vanilla add keeps the original search and existing registration draft", async ({
  page,
}) => {
  const raw = '{"v":99,"keep":"original input"}';
  await page.evaluate(
    (raw) => localStorage.setItem("eoul-d12-hang:input-draft:v1", raw),
    raw,
  );
  await page.goto("/?photos=0&ui=vanilla#/add");
  await expect(
    page.getByLabel("브랜드나 상품명", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-react-add-search]")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("eoul-d12-hang:input-draft:v1"),
    ),
  ).toBe(raw);
});

for (const phase of ["before boot", "after boot"])
  test(`React crowd registration protects future legacy metadata ${phase}`, async ({
    page,
  }) => {
    const raw = ' {"v":99,"items":{},"catalog":{},"future":"keep"}\n';
    if (phase === "before boot") {
      await page.evaluate(() =>
        Object.defineProperty(navigator, "canShare", {
          value: () => false,
          configurable: true,
        }),
      );
      await page.evaluate(
        (raw) => localStorage.setItem("eoul-d12-hang:reg", raw),
        raw,
      );
      await page.goto("/?photos=0&future-reg=boot#/add");
      await expect(page.locator("[data-react-add-search]")).toBeVisible();
    } else {
      await open(page);
      await page.evaluate(
        (raw) => localStorage.setItem("eoul-d12-hang:reg", raw),
        raw,
      );
    }
    await page.evaluate(() => {
      (window as any).EOUL_CROWD = {
        submit: async () => ({}),
        search: async () => ({
          items: [
            {
              brand: "합성 등록 브랜드",
              name: "합성 등록 셔츠",
              kind: "shirt",
              color: "blue",
              count: 3,
            },
          ],
        }),
      };
    });
    await page.getByLabel("브랜드나 상품명", { exact: true }).fill("합성 등록");
    await expect(page.locator("#acrowd")).toContainText("합성 등록 셔츠");
    if (phase === "before boot")
      await expect(page.locator("#acrowd [data-crowd-add]")).toBeDisabled();
    else await page.locator("#acrowd [data-crowd-add]").click();
    expect(
      await page.evaluate(() => localStorage.getItem("eoul-d12-hang:reg")),
    ).toBe(raw);
    expect(
      await page.evaluate(() => (window as any).K.M.getState().mineCount),
    ).toBe(0);
    await expect(
      page.getByText(/브랜드·링크 정보를 읽지 못했어요/).first(),
    ).toBeVisible();
    if (phase === "before boot") {
      await page
        .locator("#eo-storage-issue")
        .getByRole("button", { name: "전체 백업 열기", exact: true })
        .click();
      await page.evaluate(() =>
        Object.defineProperty(navigator, "canShare", {
          value: () => false,
          configurable: true,
        }),
      );
      const getting = page.waitForEvent("download");
      await page.locator("[data-bk-save]").click();
      const file = await getting,
        content = JSON.parse(await fs.readFile((await file.path())!, "utf8"));
      expect(Object.values(content.data)).toContain(raw);
      expect(
        await page.evaluate(() => localStorage.getItem("eoul-d12-hang:reg")),
      ).toBe(raw);
    }
  });
test("untrusted crowd results cannot supply a cached garment id to overwrite another owned garment metadata", async ({
  page,
}) => {
  const old = await page.evaluate(() => {
    const w = window as any,
      m = w.K.M,
      g = m.addGarment({
        kind: "pants",
        color: "black",
        label: "먼저 보관한 내 바지",
      });
    w.EOUL_CROWD = {
      submit: async () => ({}),
      search: async () => ({
        items: [
          {
            brand: "합성 상품",
            name: "합성 셔츠",
            kind: "shirt",
            color: "blue",
            count: 3,
            savedGarment: g,
            pendingNotice: "untrusted control",
          },
        ],
      }),
    };
    return { id: g.id, label: g.label };
  });
  await open(page);
  await page.getByLabel("브랜드나 상품명", { exact: true }).fill("합성");
  await expect(page.locator("#acrowd")).toContainText("합성 셔츠");
  await page.locator("#acrowd [data-crowd-add]").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).K.M.getState().mineCount))
    .toBe(2);
  const data = await page.evaluate(
    (old) => ({
      items: JSON.parse(localStorage.getItem("eoul-d12-hang:reg")!).items,
      old: (window as any).K.M.getState().closet.find(
        (g: any) => g.id === old.id,
      ),
    }),
    old,
  );
  expect(data.items[old.id]).toBeUndefined();
  expect(data.old.label).toBe(old.label);
  expect(data.old.kind).toBe("pants");
});

test("React add text at twice its component size remains keyboard usable and within the page", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator("[data-react-add-search]")).toBeVisible();
  await page.getByLabel("브랜드나 상품명", { exact: true }).fill("옥스퍼드");
  await expect(page.locator("[data-own-add]").first()).toBeVisible();
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>(".as,.as *")],
      sizes = nodes.map((e) => parseFloat(getComputedStyle(e).fontSize));
    nodes.forEach((e, i) => (e.style.fontSize = sizes[i] * 2 + "px"));
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByLabel("브랜드나 상품명", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "상품 검색", exact: true }),
  ).toBeFocused();
});
test.describe("React add offline", () => {
  test.use({ serviceWorkers: "allow" });
  test("visited add search reopens the actual React graph and its local catalog with the real origin stopped", async ({
    page,
    request,
  }) => {
    await page.evaluate(() =>
      (window as any).K.M.addGarment({
        kind: "pants",
        color: "black",
        label: "합성 기존 바지",
      }),
    );
    await open(page);
    await page.getByLabel("브랜드나 상품명", { exact: true }).fill("옥스퍼드");
    await expect(page.locator("[data-own-add]").first()).toBeVisible();
    await expect(page.locator("#aopen")).toContainText("공개 상품 정보");
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
      await (window as any).EOUL_ADD_SEARCH_LOAD();
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
          const saved = new Set<string>();
          for (const name of await caches.keys())
            for (const req of await (await caches.open(name)).keys())
              saved.add(new URL(req.url).pathname);
          return paths.filter((p) => !saved.has(p));
        }, paths),
      )
      .toEqual([]);
    await page.unroute("**/*");
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:8792(?:\/|$))/, (r) =>
      r.abort(),
    );
    try {
      await request.post("http://127.0.0.1:8793/stop");
      await page.reload();
      await expect(page.locator("[data-react-add-search]")).toBeVisible();
      await page
        .getByLabel("브랜드나 상품명", { exact: true })
        .fill("옥스퍼드");
      await expect(page.locator("[data-own-add]").first()).toBeVisible();
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

test("successful crowd markers follow actual garment deletion and allow explicit same-query registration again", async ({
  page,
  context,
}) => {
  await page.evaluate(() => {
    (window as any).EOUL_CROWD = {
      submit: async () => ({}),
      search: async () => ({
        items: [
          {
            brand: "합성 등록 브랜드",
            name: "합성 등록 셔츠",
            kind: "shirt",
            color: "blue",
            count: 3,
          },
        ],
      }),
    };
  });
  await open(page);
  const input = page.getByLabel("브랜드나 상품명", { exact: true });
  await input.fill("합성 등록");
  await page.locator("#acrowd [data-crowd-add]").click();
  await expect(page.locator("#acrowd .ok")).toHaveCount(1);
  const first = await page.evaluate(
    () => (window as any).K.M.getState().closet[0].id,
  );
  const other = await context.newPage();
  await other.route("**/*", (r) =>
    new URL(r.request().url()).origin === "http://127.0.0.1:8792"
      ? r.continue()
      : r.abort(),
  );
  await other.goto("/?photos=0&window=success-delete#/closet");
  await expect(other.locator("[data-react-closet]")).toBeVisible();
  await other.evaluate((id) => (window as any).K.M.removeGarment(id), first);
  await expect
    .poll(() => page.evaluate(() => (window as any).K.M.getState().mineCount))
    .toBe(0);
  await expect(page.locator("#acrowd .ok")).toHaveCount(0);
  await expect(page.locator("#acrowd [data-crowd-add]")).toBeVisible();
  await page.locator("#acrowd [data-crowd-add]").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).K.M.getState().mineCount))
    .toBe(1);
  const second = await page.evaluate(
    () => (window as any).K.M.getState().closet[0].id,
  );
  expect(second).not.toBe(first);
  await other.waitForFunction(
    (id) => (window as any).K.M.getState().closet.some((g: any) => g.id === id),
    second,
  );
  await other.evaluate((id) => (window as any).K.M.removeGarment(id), second);
  await expect
    .poll(() => page.evaluate(() => (window as any).K.M.getState().mineCount))
    .toBe(0);
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await input.fill("");
  await input.fill("합성 등록");
  await expect(page.locator("#acrowd [data-crowd-add]")).toBeVisible();
  await expect(page.locator("#acrowd .ok")).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  await page.locator("#acrowd [data-crowd-add]").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).K.M.getState().mineCount))
    .toBe(1);
  await other.close();
});
