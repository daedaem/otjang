import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
async function capture(page: Page, name: string) {
  if (!process.env.CAPTURE_B6) return;
  const folder = new URL(
    "../../../docs/log/2026-10/evidence/b6b/",
    import.meta.url,
  );
  await fs.mkdir(folder, { recursive: true });
  await page.screenshot({
    path: fileURLToPath(new URL(name + ".png", folder)),
    fullPage: true,
  });
}
const KEY = "eoul-d12-hang:mirror:v1",
  MAIN = "eoul-d12-hang:v1";
async function local(page: Page) {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    return u.origin === "http://127.0.0.1:8792" &&
      !u.pathname.startsWith("/api/")
      ? r.continue()
      : r.abort();
  });
}
async function png(page: Page, color = "#ddd", width = 200, height = 400) {
  return Buffer.from(
    await page.evaluate(
      async ({ color, width, height }) => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        const x = c.getContext("2d")!;
        x.fillStyle = color;
        x.fillRect(0, 0, width, height);
        const b = await new Promise<Blob>((r) =>
          c.toBlob((b) => r(b!), "image/png"),
        );
        return Array.from(new Uint8Array(await b.arrayBuffer()));
      },
      { color, width, height },
    ),
  );
}
async function open(page: Page, id?: string) {
  await page.evaluate(
    (id) => (window as any).K.go("mirror", id ? { id } : {}),
    id,
  );
  await expect(page.locator("[data-react-mirror]")).toBeVisible();
}
async function upload(page: Page, bytes: Buffer) {
  await page.locator("[data-mirror-file]").setInputFiles({
    name: "synthetic-body.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  await expect(page.locator("[data-mirror-body]")).toHaveAttribute(
    "src",
    /^blob:/,
  );
}
async function saved(page: Page) {
  await expect(
    page.getByText("입력이 이 화면에 남아 있어요. 다시 보관해 주세요.", {
      exact: true,
    }),
  ).toHaveCount(0);
}
async function read(page: Page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY);
}
async function calibrate(page: Page) {
  await page.getByLabel("내 키 cm", { exact: true }).fill("175");
  const stage = page.locator("[data-mirror-stage]");
  await stage.click({ position: { x: 100, y: 20 } });
  const r = await stage.boundingBox();
  await stage.click({ position: { x: r!.width / 2, y: r!.height - 20 } });
  await saved(page);
}
async function own(page: Page) {
  return page.evaluate(async () => {
    const w = window as any,
      m = w.K.M,
      mod = await w.EOUL_PHOTO_LOAD(),
      repo = await mod.photoLibrary(w.EOUL_MOCK_KEY);
    const c = document.createElement("canvas");
    c.width = 100;
    c.height = 140;
    const x = c.getContext("2d");
    x.fillStyle = "#b67552";
    x.fillRect(10, 0, 80, 140);
    const b = await new Promise<Blob>((r) =>
      c.toBlob((v) => r(v!), "image/png"),
    );
    const g = m.addGarment({
      kind: "shirt",
      color: "white",
      label: "내 합성 셔츠",
      profile: { v: 1, measures: { length: { cm: 70, source: "measured" } } },
    });
    await mod.saveGarmentPhoto({
      namespace: w.EOUL_MOCK_KEY,
      core: m,
      garmentId: g.id,
      file: b,
      width: 100,
      height: 140,
    });
    const outer = m.addGarment({
      kind: "jacket",
      color: "navy",
      label: "총장 모르는 내 재킷",
    });
    await mod.saveGarmentPhoto({
      namespace: w.EOUL_MOCK_KEY,
      core: m,
      garmentId: outer.id,
      file: b,
      width: 100,
      height: 140,
    });
    const seller = m.addGarment({
      kind: "shirt",
      color: "blue",
      label: "판매처 사진만 있는 옷",
      productId: "ms-728000",
    });
    return { shirt: g.id, outer: outer.id, seller: seller.id };
  });
}
test.beforeEach(async ({ page }) => {
  await local(page);
  await page.goto("/?photos=1#/closet");
  await expect(page.locator("[data-react-closet]")).toBeVisible();
});
test("direct mirror is read-only, and seller candidate stays outside the local composition", async ({
  page,
}) => {
  const raw = await page.evaluate((k) => localStorage.getItem(k), MAIN),
    posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.goto("/?photos=1&entry=direct#/mirror");
  await expect(page.locator("[data-react-mirror]")).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  expect(await page.evaluate((k) => localStorage.getItem(k), MAIN)).toBe(raw);
  await open(page, "ms-728000");
  await expect(page.locator("[data-mirror-candidate]")).toContainText(
    "판매처 원본 사진",
  );
  await expect(page.locator("[data-mirror-stage] img")).toHaveCount(0);
  const ids = await own(page);
  await upload(page, await png(page));
  await calibrate(page);
  await page.locator(`[data-mirror-pick="${ids.shirt}"]`).click();
  await expect(page.locator("[data-mirror-layer]")).toHaveCount(1);
  expect(
    await page
      .locator("[data-mirror-stage] img")
      .evaluateAll((imgs) =>
        imgs.every((img) => (img as HTMLImageElement).src.startsWith("blob:")),
      ),
  ).toBe(true);
  expect(
    await page
      .locator("[data-mirror-candidate]")
      .evaluate((el) => !el.closest("[data-mirror-stage]")),
  ).toBe(true);
  await page.reload();
  await expect(page.locator("[data-mirror-candidate]")).toContainText(
    "판매처 원본 사진",
  );
  expect(posts).toEqual([]);
});
test("own body and garment layers calibrate, drag once, keyboard nudge, and reload without transmitting photos", async ({
  page,
}, info) => {
  const ids = await own(page),
    body = await png(page);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await open(page);
  await upload(page, body);
  await calibrate(page);
  await expect(page.locator(`[data-mirror-pick="${ids.seller}"]`)).toHaveCount(
    0,
  );
  await page.locator(`[data-mirror-pick="${ids.shirt}"]`).click();
  await page.locator(`[data-mirror-pick="${ids.outer}"]`).click();
  const layer = page.locator(`[data-mirror-layer="${ids.shirt}"]`);
  await expect(layer).toBeVisible();
  await expect(
    page.locator(`[data-mirror-layer="${ids.outer}"]`),
  ).toHaveAttribute("data-assumed", "true");
  await saved(page);
  await page.evaluate((k) => {
    const w = window as any,
      original = Storage.prototype.setItem;
    w.mirrorWrites = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === k) w.mirrorWrites++;
      return original.call(this, key, value);
    };
  }, KEY);
  await page
    .locator(`[data-mirror-layer="${ids.outer}"]`)
    .scrollIntoViewIfNeeded();
  const r = await page
    .locator(`[data-mirror-layer="${ids.outer}"]`)
    .boundingBox();
  await page.mouse.move(r!.x + r!.width / 2, r!.y + r!.height / 2);
  await page.mouse.down();
  await page.mouse.move(r!.x + r!.width / 2 + 20, r!.y + r!.height / 2 + 15, {
    steps: 5,
  });
  expect(await page.evaluate(() => (window as any).mirrorWrites)).toBe(0);
  await page.mouse.up();
  await saved(page);
  const first = await read(page);
  expect(first.layers[1].dx).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).mirrorWrites)).toBe(1);
  await layer.focus();
  await page.keyboard.press("ArrowRight");
  await saved(page);
  expect((await read(page)).layers[0].dx).toBeCloseTo(
    first.layers[0].dx + 1,
    3,
  );
  const final = await read(page);
  await capture(page, `mirror-calibrated-${info.project.name}`);
  await page.reload();
  await expect(
    page.locator(`[data-mirror-layer="${ids.shirt}"]`),
  ).toBeVisible();
  expect(await read(page)).toEqual(final);
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await page.locator("[data-mirror-file]").setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a photo"),
  });
  await page.getByRole("button", { name: "사진 바꾸기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("사진을 읽지 못했어요");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
  expect(posts).toEqual([]);
});
test("failed body link retains original and RAM with a Korean retry and Back guard", async ({
  page,
}) => {
  const bytes = await png(page);
  await open(page);
  await page.evaluate((k) => {
    const w = window as any;
    w.originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === k)
        throw new DOMException("synthetic quota", "QuotaExceededError");
      return w.originalSet.call(this, key, value);
    };
  }, KEY);
  await upload(page, bytes);
  await expect(page.getByRole("alert")).toContainText(
    "전신 사진 원본은 보관했지만 연결을 마치지 못했어요",
  );
  await expect(page.getByRole("alert")).not.toContainText("synthetic quota");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  await page.getByRole("button", { name: "돌아가기", exact: true }).click();
  await expect(page.locator("dialog[open]")).toContainText(
    "보관하지 못한 입력",
  );
  await page.getByRole("button", { name: "계속 편집", exact: true }).click();
  await expect(page.locator("[data-mirror-body]")).toBeVisible();
  await page.evaluate(
    () => (Storage.prototype.setItem = (window as any).originalSet),
  );
  await page.getByRole("button", { name: "다시 보관", exact: true }).click();
  await saved(page);
  const d = await read(page);
  const photos = await page.evaluate(async () => {
    const w = window as any,
      mod = await w.EOUL_PHOTO_LOAD(),
      repo = await mod.photoLibrary(w.EOUL_MOCK_KEY);
    return (await repo.list()).map((p: any) => p.id);
  });
  expect(photos).toEqual([d.body.photoId]);
});
test("changing body confirms reset, cancellation preserves exact input, and earlier originals remain", async ({
  page,
}) => {
  const ids = await own(page);
  await open(page);
  await upload(page, await png(page));
  await calibrate(page);
  await page.locator(`[data-mirror-pick="${ids.shirt}"]`).click();
  await saved(page);
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY),
    next = await png(page, "#ccc", 210, 410);
  await page
    .locator("[data-mirror-file]")
    .setInputFiles({ name: "new.png", mimeType: "image/png", buffer: next });
  await expect(page.locator("dialog[open]")).toContainText("전신");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  await page
    .locator("[data-mirror-file]")
    .setInputFiles({ name: "new.png", mimeType: "image/png", buffer: next });
  await page.getByRole("button", { name: "사진 바꾸기", exact: true }).click();
  await expect.poll(async () => (await read(page)).body.width).toBe(210);
  const d = await read(page);
  expect(d.head).toBeNull();
  expect(d.feet).toBeNull();
  expect(d.heightRaw).toBe("175");
  expect(d.layers).toEqual([{ garmentId: ids.shirt, dx: 0, dy: 0 }]);
  expect(
    await page.evaluate(async () => {
      const w = window as any,
        m = await w.EOUL_PHOTO_LOAD();
      return (await (await m.photoLibrary(w.EOUL_MOCK_KEY)).list()).length;
    }),
  ).toBe(3);
});
test("future mirror remains protected and preview never reads private photo storage", async ({
  page,
}) => {
  await page.evaluate(
    (k) => localStorage.setItem(k, '{"v":99,"private":"keep"}'),
    KEY,
  );
  await open(page);
  await expect(page.getByRole("alert")).toContainText("원문을 보호");
  await expect(page.locator("[data-mirror-file]")).toBeDisabled();
  await page.addInitScript(() => {
    const w = window as any,
      old = indexedDB.open.bind(indexedDB);
    w.photoDBopens = 0;
    indexedDB.open = ((...args: any[]) => {
      w.photoDBopens++;
      return old(args[0], args[1]);
    }) as any;
  });
  await page.goto("/?preview=1#/mirror");
  await expect(page.locator("[data-react-mirror]")).toBeVisible();
  await expect(page.locator("[data-mirror-file]")).toBeDisabled();
  expect(await page.evaluate(() => (window as any).photoDBopens)).toBe(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(
    '{"v":99,"private":"keep"}',
  );
});

test("desktop layout and doubled component text retain keyboard calibration and no horizontal overflow", async ({
  page,
}, info) => {
  const ids = await own(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await upload(page, await png(page));
  await page.getByLabel("내 키 cm", { exact: true }).fill("175");
  const stage = page.locator("[data-mirror-stage]");
  await stage.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await saved(page);
  expect((await read(page)).feet).not.toBeNull();
  await page.locator(`[data-mirror-pick="${ids.shirt}"]`).click();
  await expect(page.locator("[data-mirror-layer]")).toBeVisible();
  await capture(page, `mirror-desktop-${info.project.name}`);
  const width = await page
    .locator(".mr-layout")
    .evaluate((e) => e.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(900);
  await page.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>(".mr,.mr *")];
    const sizes = all.map((e) => parseFloat(getComputedStyle(e).fontSize));
    all.forEach((e, i) => (e.style.fontSize = sizes[i] * 2 + "px"));
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByLabel("내 키 cm", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "머리 끝 다시", exact: true }),
  ).toBeFocused();
});
test("same bytes used as body and garment retain the first immutable metadata and local-only references", async ({
  page,
}) => {
  const g = await own(page);
  const original = await page.evaluate(async (id) => {
    const w = window as any,
      m = await w.EOUL_PHOTO_LOAD(),
      repo = await m.photoLibrary(w.EOUL_MOCK_KEY),
      p = await repo.get(
        w.K.M.getState().closet.find((g: any) => g.id === id).photoId,
      );
    return {
      photoId: p.id,
      role: p.role,
      at: p.at,
      bytes: Array.from(new Uint8Array(await p.blob.arrayBuffer())),
    };
  }, g.shirt);
  await open(page);
  await upload(page, Buffer.from(original.bytes));
  await saved(page);
  expect((await read(page)).body.photoId).toBe(original.photoId);
  const stored = await page.evaluate(async (id) => {
    const w = window as any,
      m = await w.EOUL_PHOTO_LOAD(),
      p = await (await m.photoLibrary(w.EOUL_MOCK_KEY)).get(id);
    return {
      role: p.role,
      at: p.at,
      bytes: Array.from(new Uint8Array(await p.blob.arrayBuffer())),
    };
  }, original.photoId);
  expect(stored).toEqual({
    role: original.role,
    at: original.at,
    bytes: original.bytes,
  });
});
test.describe("mirror own-photo offline", () => {
  test.use({ serviceWorkers: "allow" });
  test("a visited mirror reopens with exact saved photo and positions after the real origin stops", async ({
    page,
    request,
  }) => {
    await own(page);
    await open(page);
    const bytes = await png(page);
    await upload(page, bytes);
    await calibrate(page);
    const raw = await page.evaluate((k) => localStorage.getItem(k), KEY),
      id = (await read(page)).body.photoId;
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
      await (window as any).EOUL_MIRROR_LOAD();
      await (window as any).EOUL_PHOTO_LOAD();
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
          const found = new Set<string>();
          for (const name of await caches.keys())
            for (const req of await (await caches.open(name)).keys())
              found.add(new URL(req.url).pathname);
          return paths.filter((p) => !found.has(p));
        }, paths),
      )
      .toEqual([]);
    await page.unroute("**/*");
    await local(page);
    try {
      await request.post("http://127.0.0.1:8793/stop");
      await page.reload();
      await expect(page.locator("[data-react-mirror]")).toBeVisible();
      await expect(page.locator("[data-mirror-body]")).toHaveAttribute(
        "src",
        /^blob:/,
      );
      expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(
        raw,
      );
      expect(
        await page.evaluate(async (id) => {
          const w = window as any,
            m = await w.EOUL_PHOTO_LOAD(),
            p = await (await m.photoLibrary(w.EOUL_MOCK_KEY)).get(id);
          return Array.from(new Uint8Array(await p.blob.arrayBuffer()));
        }, id),
      ).toEqual([...bytes]);
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

test("two real windows keep a failed older height in RAM without overwriting the newer saved mirror", async ({
  page,
  context,
}) => {
  await open(page);
  await upload(page, await png(page));
  await page.getByLabel("내 키 cm", { exact: true }).fill("175");
  await saved(page);
  const other = await context.newPage();
  await local(other);
  await other.goto("/?photos=1&window=second#/mirror");
  await expect(other.locator("[data-react-mirror]")).toBeVisible();
  await page.evaluate((k) => {
    const w = window as any;
    w.savedSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === k) throw new DOMException("quota", "QuotaExceededError");
      return w.savedSet.call(this, key, value);
    };
  }, KEY);
  await page.getByLabel("내 키 cm", { exact: true }).fill("171");
  await expect(page.getByRole("alert")).toContainText("보관하지 못했어요");
  await other.getByLabel("내 키 cm", { exact: true }).fill("188");
  await saved(other);
  await page.evaluate(
    () => (Storage.prototype.setItem = (window as any).savedSet),
  );
  await page.getByLabel("내 키 cm", { exact: true }).fill("172");
  await expect(page.getByRole("alert")).toContainText(
    "다른 화면에서 거울이 바뀌었어요",
  );
  await page.getByRole("button", { name: "다시 보관", exact: true }).click();
  await expect(page.getByLabel("내 키 cm", { exact: true })).toHaveValue("172");
  expect((await read(other)).heightRaw).toBe("188");
  await other.close();
});

test("a measured length changed in another window updates both the label and the actual placed size", async ({
  page,
  context,
}) => {
  const ids = await own(page);
  await open(page);
  await upload(page, await png(page));
  await calibrate(page);
  await page.locator(`[data-mirror-pick="${ids.outer}"]`).click();
  await saved(page);
  const layer = page.locator(`[data-mirror-layer="${ids.outer}"]`);
  await expect(layer).toHaveAttribute("data-assumed", "true");
  const before = await layer.evaluate(
      (el) => el.getBoundingClientRect().height,
    ),
    raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  const other = await context.newPage();
  await local(other);
  await other.goto("/?photos=1&window=length-edit#/closet");
  await expect(other.locator("[data-react-closet]")).toBeVisible();
  await other.evaluate(
    (id) =>
      (window as any).K.M.updateGarmentProfile(id, {
        v: 1,
        measures: { length: { cm: 100, source: "measured" } },
      }),
    ids.outer,
  );
  await expect(page.locator(`[data-mirror-pick="${ids.outer}"]`)).toContainText(
    "총장 100cm",
  );
  await expect(layer).toHaveAttribute("data-assumed", "false");
  const first = await layer.evaluate((el) => el.getBoundingClientRect().height);
  expect(first).toBeGreaterThan(before);
  await other.evaluate(
    (id) =>
      (window as any).K.M.updateGarmentProfile(id, {
        v: 1,
        measures: { length: { cm: 60, source: "measured" } },
      }),
    ids.outer,
  );
  await expect(page.locator(`[data-mirror-pick="${ids.outer}"]`)).toContainText(
    "총장 60cm",
  );
  await expect
    .poll(
      async () =>
        (await layer.evaluate((el) => el.getBoundingClientRect().height)) /
        first,
    )
    .toBeCloseTo(0.6, 1);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  await other.close();
});
