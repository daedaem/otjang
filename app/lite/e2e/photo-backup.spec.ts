import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
const KEY = "eoul-d12-hang:v1",
  NS = KEY,
  MARKER = "eoul-backup:photos-pending";
async function routes(page: Page) {
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return route.abort();
    if (u.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"items":[],"count":1,"min":3}',
      });
    return route.continue();
  });
}
async function open(page: Page, pending = false, advanced = true) {
  if (pending)
    await page
      .getByRole("button", { name: "전체 백업 열기", exact: true })
      .click();
  else {
    await page.getByRole("button", { name: "더보기", exact: true }).click();
    await page.locator("[data-backup]").click();
  }
  await expect(page.locator('[data-photo-ready="true"]')).toBeVisible();
  if (advanced) await page.locator("[data-photo-options] > summary").click();
}
async function seed(page: Page) {
  return page.evaluate(async () => {
    const m = (window as any).K.M,
      g = m.registerGarment({
        draftId: "photo-e2e-shirt",
        brand: "합성 브랜드",
        name: "합성 셔츠",
        kind: "shirt",
        color: "white",
        url: "",
      });
    m.ask("출근용 셔츠 10만원 이하");
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 2;
    c.getContext("2d")!.fillRect(0, 0, 2, 2);
    const file = await new Promise<Blob>((r) =>
      c.toBlob((b) => r(b!), "image/png"),
    );
    const module = await (window as any).EOUL_PHOTO_LOAD();
    try {
      await module.saveGarmentPhoto({
        namespace: (window as any).EOUL_MOCK_KEY,
        core: m,
        garmentId: g.id,
        file,
        width: 2,
        height: 2,
      });
    } catch (error: any) {
      throw Error(
        JSON.stringify({
          name: error.cause?.name,
          reason: error.cause?.message,
          operation: error.operation,
          message: error.message,
        }),
      );
    }
    return {
      id: g.id,
      photoId: m.getState().closet.find((x: any) => x.id === g.id).photoId,
      bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    };
  });
}
async function pack(page: Page) {
  return page.evaluate(async () => {
    const module = await (window as any).EOUL_PHOTO_LOAD(),
      c = module.currentPhotoClient((window as any).EOUL_MOCK_KEY);
    return Array.from(
      new Uint8Array(await (await c.controller.makeFile()).arrayBuffer()),
    );
  });
}
test.beforeEach(async ({ page }) => {
  await routes(page);
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
});

test("personal photo pack downloads, previews without writes, restores and undoes exact references while retaining bytes", async ({
  page,
}) => {
  const original = await seed(page);
  await open(page, false, false);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-bk-save]").click();
  const download = await downloadPromise;
  const bytes = await fs.readFile((await download.path())!);
  expect(bytes.subarray(0, 8).toString()).toBe("EOULPH01");
  await page.evaluate(() => {
    (window as any).K.M.reset();
  });
  await page.reload();
  await open(page);
  const before = await page.evaluate(() =>
    localStorage.getItem("eoul-d12-hang:v1"),
  );
  await page.locator("#bkfile").setInputFiles({
    name: "synthetic.otjang",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  await expect(page.locator("[data-photo-confirm]")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("eoul-d12-hang:v1")),
  ).toBe(before);
  await expect(page.locator("[data-photo-report]")).toContainText("정상 항목");
  await Promise.all([
    page.waitForEvent("load"),
    page.locator("[data-photo-confirm]").click(),
  ]);
  const state = await page.evaluate(
    () => (window as any).K.M.getState().closet,
  );
  expect(state).toHaveLength(1);
  expect(state[0].id).toBe(original.id);
  expect(state[0].photoId).toBe(original.photoId);
  const saved = await page.evaluate(async (id) => {
    const mod = await (window as any).EOUL_PHOTO_LOAD(),
      repo = await mod.photoLibrary((window as any).EOUL_MOCK_KEY);
    return Array.from(
      new Uint8Array(await (await repo.get(id)).blob.arrayBuffer()),
    );
  }, original.photoId);
  expect(saved).toEqual(original.bytes);
  await open(page);
  await expect(page.locator("[data-photo-undo]")).toBeVisible();
  await Promise.all([
    page.waitForEvent("load"),
    page.locator("[data-photo-undo]").click(),
  ]);
  expect(
    await page.evaluate(() => (window as any).K.M.getState().closetCount),
  ).toBe(0);
  expect(
    await page.evaluate(async () => {
      const mod = await (window as any).EOUL_PHOTO_LOAD();
      return (
        await (await mod.photoLibrary((window as any).EOUL_MOCK_KEY)).list()
      ).length;
    }),
  ).toBe(1);
});

test("promotion interruption survives real IDB restart and recovers the prior wardrobe without losing its photo", async ({
  page,
}) => {
  const original = await seed(page);
  await open(page);
  const bytes = Buffer.from(await pack(page));
  const before = await page.evaluate(() => {
    const m = (window as any).K.M;
    m.reset();
    m.registerGarment({
      draftId: "photo-before-pants",
      brand: "기존 합성",
      name: "기존 바지",
      kind: "pants",
      color: "black",
      url: "",
    });
    m.ask("출근용 셔츠 10만원 이하");
    return localStorage.getItem("eoul-d12-hang:v1");
  });
  await page.evaluate(async () => {
    const mod = await (window as any).EOUL_PHOTO_LOAD();
    mod.currentPhotoClient(
      (window as any).EOUL_MOCK_KEY,
    ).repository.promoteUndo = async () => {
      throw Error("synthetic promotion failure");
    };
  });
  await page.locator("[data-photo-file]").setInputFiles({
    name: "synthetic.otjang",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  await page.locator("[data-photo-confirm]").click();
  await expect(page.locator("[data-photo-status]")).toContainText(
    "synthetic promotion failure",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("eoul-backup:photos-pending"),
    ),
  ).not.toBeNull();
  await page.goto("/?photos=0&g=F&reset=1&closet=trial#/closet");
  await expect(page).not.toHaveURL(/reset=|closet=|[?&]g=/);
  await expect(page.locator("#eo-storage-issue")).toContainText("사진");
  expect(await page.locator("#app").evaluate((e: any) => e.inert)).toBe(true);
  await open(page, true);
  await Promise.all([
    page.waitForEvent("load"),
    page.locator("[data-photo-recover]").click(),
  ]);
  expect(
    await page.evaluate(() => localStorage.getItem("eoul-d12-hang:v1")),
  ).toBe(before);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("eoul-backup:photos-pending"),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(async (id) => {
      const mod = await (window as any).EOUL_PHOTO_LOAD();
      return !!(await (
        await mod.photoLibrary((window as any).EOUL_MOCK_KEY)
      ).get(id));
    }, original.photoId),
  ).toBe(true);
});

test("another open tab cannot edit or bypass photo recovery with JSON restore while the photo lock is held", async ({
  page,
  context,
}) => {
  await seed(page);
  await open(page);
  const other = await context.newPage();
  await routes(other);
  await other.goto("/?photos=0#/closet");
  await other.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(async () => {
    const mod = await (window as any).EOUL_PHOTO_LOAD(),
      c = mod.currentPhotoClient((window as any).EOUL_MOCK_KEY),
      put = c.repository.put.bind(c.repository);
    c.repository.put = async (row: any) => {
      (window as any).__photoHeld = true;
      await new Promise<void>(
        (resolve) => ((window as any).__photoContinue = resolve),
      );
      return put(row);
    };
    (window as any).__photoResult = c.controller
      .makeFile()
      .then((file: any) => c.controller.restore(file));
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__photoHeld))
    .toBe(true);
  await expect(other.locator("#eo-storage-issue")).toContainText("사진");
  const raw = await other.evaluate(() =>
    localStorage.getItem("eoul-d12-hang:v1"),
  );
  expect(
    await other.evaluate(() => {
      try {
        (window as any).K.M.addGarment({ kind: "pants" });
        return "accepted";
      } catch (e: any) {
        return e.code;
      }
    }),
  ).toBe("photo_recovery_pending");
  expect(
    await other.evaluate(() => localStorage.getItem("eoul-d12-hang:v1")),
  ).toBe(raw);
  await open(other, true);
  await other.locator("#bkfile").setInputFiles({
    name: "synthetic-text.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        app: "eoul-lite",
        format: 2,
        data: { "eoul-d12-hang:ui": "{}" },
      }),
    ),
  });
  await other.locator("[data-bk-go]").click();
  await expect(other.locator(".bk-msg")).toContainText("다른 탭");
  expect(
    await other.evaluate(() => localStorage.getItem("eoul-d12-hang:v1")),
  ).toBe(raw);
  await other.locator("[data-photo-recover]").click();
  await expect(other.locator("[data-photo-status]")).toContainText("다른 탭");
  await page.evaluate(() => (window as any).__photoContinue());
  expect(
    await page.evaluate(
      async () => (await (window as any).__photoResult).complete,
    ),
  ).toBe(true);
  await other.close();
});

test("late cleanup from one IDB connection cannot delete another connection journal", async ({
  page,
  context,
}) => {
  await open(page);
  const other = await context.newPage();
  await routes(other);
  await other.goto("/?photos=0#/closet");
  await other.waitForFunction(() => !!(window as any).K?.M);
  await open(other);
  await page.evaluate(async () => {
    const mod = await (window as any).EOUL_PHOTO_LOAD(),
      r = mod.currentPhotoClient((window as any).EOUL_MOCK_KEY).repository;
    await r.saveJournal({
      v: 1,
      id: "owner_A_abcdefgh",
      phase: "committed",
      before: {},
      priorStash: null,
      priorNext: null,
      after: {},
    });
    (window as any).__lateCleanup = new Promise<void>(
      (resolve) => ((window as any).__allowCleanup = resolve),
    ).then(() => r.clearJournal("owner_A_abcdefgh"));
  });
  await other.evaluate(async () => {
    const mod = await (window as any).EOUL_PHOTO_LOAD(),
      r = mod.currentPhotoClient((window as any).EOUL_MOCK_KEY).repository;
    await r.clearJournal("owner_A_abcdefgh");
    await r.saveJournal({
      v: 1,
      id: "owner_B_abcdefgh",
      phase: "prepared",
      before: {},
      priorStash: null,
      priorNext: null,
      after: null,
    });
  });
  await page.evaluate(() => (window as any).__allowCleanup());
  await page.evaluate(() => (window as any).__lateCleanup);
  expect(
    await other.evaluate(async () => {
      const m = await (window as any).EOUL_PHOTO_LOAD();
      return (
        await m
          .currentPhotoClient((window as any).EOUL_MOCK_KEY)
          .repository.pending()
      ).id;
    }),
  ).toBe("owner_B_abcdefgh");
  await other.close();
});

test("storage persistence permission shows granted, denied and unsupported results without promising permanence", async ({
  page,
}) => {
  await open(page);
  for (const allowed of [false, true]) {
    await page.evaluate(
      (allowed) =>
        Object.defineProperty(navigator, "storage", {
          configurable: true,
          value: { persist: async () => allowed },
        }),
      allowed,
    );
    await page.locator("[data-photo-persist]").click();
    await expect(page.locator("[data-photo-status]")).toContainText(
      allowed ? "영구 보장은 아니" : "허용하지 않았어요",
    );
  }
  await page.evaluate(() =>
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {},
    }),
  );
  await page.locator("[data-photo-persist]").click();
  await expect(page.locator("[data-photo-status]")).toContainText(
    "지원하지 않아요",
  );
});

test("photo restore preview discloses quarantined sources and preserves current draft/chat without rendering raw markup", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const draft = "eoul-d12-hang:input-draft:v1",
    chat = "eoul-d12-hang:consult";
  const goodDraft = JSON.stringify({
      v: 2,
      step: 0,
      updatedAt: "2026-10-26T00:00:00Z",
      values: {
        draftId: "draft-kept-photo",
        brand: "기존",
        name: "기존 셔츠",
        kind: "shirt",
        color: "white",
        url: "",
      },
    }),
    goodChat = '{"threads":[],"cur":null}',
    badDraft = '{"v":99,"future":"<img src=x onerror=bad>"}',
    badChat = '{"threads":[{"id":"bad\\\"id","turns":[]}]}';
  const before = await page.evaluate(
    ({ draft, chat, goodDraft, goodChat }) => {
      localStorage.setItem(draft, goodDraft);
      localStorage.setItem(chat, goodChat);
      return {
        raw: JSON.stringify(
          Object.fromEntries(Object.entries(localStorage).sort()),
        ),
        core: localStorage.getItem("eoul-d12-hang:v1"),
      };
    },
    { draft, chat, goodDraft, goodChat },
  );
  const file = {
    app: "eoul-photo-backup",
    format: 1,
    mode: "full",
    text: {
      app: "eoul-lite",
      format: 2,
      data: { [KEY]: before.core, [draft]: badDraft, [chat]: badChat },
    },
    photos: [],
  };
  await page.locator("[data-photo-file]").setInputFiles({
    name: "synthetic-quarantine.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(page.locator("[data-photo-report]")).toContainText(
    "원문 보관 2개",
  );
  await expect(page.locator("[data-photo-report]")).toContainText(
    "기존 활성 자료 유지 2개",
  );
  const draftRow = page.locator(
    '[data-photo-preview] [data-source="eoul-d12-hang:input-draft:v1"]',
  );
  await expect(draftRow).toContainText("입력 초안");
  await expect(draftRow.locator("code")).not.toBeVisible();
  await draftRow.getByText("복구 진단", { exact: true }).click();
  await expect(draftRow.locator("code")).toHaveText(
    "eoul-d12-hang:input-draft:v1",
  );

  expect(
    await page.evaluate(() =>
      JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())),
    ),
  ).toBe(before.raw);
  expect(await page.locator("[data-photo-preview] [onclick]").count()).toBe(0);
  await Promise.all([
    page.waitForEvent("load"),
    page.locator("[data-photo-confirm]").click(),
  ]);
  expect(await page.evaluate((k) => localStorage.getItem(k), draft)).toBe(
    goodDraft,
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), chat)).toBe(
    goodChat,
  );
  const archives = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([k]) => k.includes(":unreadable:"))
      .map(([, v]) => v),
  );
  expect(archives).toContain(badDraft);
  expect(archives).toContain(badChat);
});

test("two IDB connections both read missing photo then deduplicate the concurrent insert", async ({
  page,
  context,
}) => {
  await seed(page);
  await open(page);
  const other = await context.newPage();
  await routes(other);
  await other.goto("/?photos=0#/closet");
  await other.waitForFunction(() => !!(window as any).K?.M);
  await open(other);
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 3;
    canvas.height = 3;
    canvas.getContext("2d")!.fillStyle = "red";
    canvas.getContext("2d")!.fillRect(0, 0, 3, 3);
    const blob = await new Promise<Blob>((r) =>
      canvas.toBlob((b) => r(b!), "image/png"),
    );
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const id = await page.evaluate(
    async (bytes) =>
      "p_" +
      [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
        ),
      ]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
    bytes,
  );
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("eoul-local-photos:eoul-d12-hang:v1", 2);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(["photos", "photo-index"], "readwrite");
    let hold = true;
    (window as any).__releasePhotoReads = () => {
      hold = false;
    };
    const repeat = () => {
      const req = tx.objectStore("photos").get("synthetic-barrier");
      req.onsuccess = () => {
        if (hold) repeat();
      };
    };
    repeat();
    tx.oncomplete = () => db.close();
  });
  const instrument = (target: Page) =>
    target.evaluate((id) => {
      (window as any).__queuedPhotoRead = false;
      (window as any).__readPhotoMissing = false;
      const start = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (
        names: any,
        mode: any,
        ...rest: any[]
      ) {
        const tx = (start as any).call(this, names, mode, ...rest);
        if (mode === "readonly" && Array.from(names).join(",") === "photos")
          (window as any).__queuedPhotoRead = true;
        return tx;
      };
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (key: any) {
        const req = get.call(this, key);
        if (
          this.name === "photos" &&
          this.transaction.mode === "readonly" &&
          key === id
        )
          req.addEventListener("success", () => {
            if (req.result == null) (window as any).__readPhotoMissing = true;
          });
        return req;
      };
    }, id);
  await instrument(page);
  await instrument(other);
  const write = (target: Page) =>
    target.evaluate(
      async ({ bytes, id }) => {
        const mod = await (window as any).EOUL_PHOTO_LOAD(),
          r = await mod.photoLibrary((window as any).EOUL_MOCK_KEY);
        await r.put({
          id,
          digest: id.slice(2),
          mime: "image/png",
          role: "garment",
          width: 3,
          height: 3,
          at: "2026-10-26T00:00:00Z",
          blob: new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        });
        return (await r.list()).length;
      },
      { bytes, id },
    );
  const first = write(page),
    second = write(other);
  try {
    await expect
      .poll(async () => [
        await page.evaluate(() => (window as any).__queuedPhotoRead),
        await other.evaluate(() => (window as any).__queuedPhotoRead),
      ])
      .toEqual([true, true]);
    await page.evaluate(() => (window as any).__releasePhotoReads());
    expect(await Promise.all([first, second])).toEqual([2, 2]);
    expect(await page.evaluate(() => (window as any).__readPhotoMissing)).toBe(
      true,
    );
    expect(await other.evaluate(() => (window as any).__readPhotoMissing)).toBe(
      true,
    );
  } finally {
    await page
      .evaluate(() => (window as any).__releasePhotoReads?.())
      .catch(() => {});
    await other.close();
  }
});

test.describe("visited photo backup stays available offline", () => {
  test.use({ serviceWorkers: "allow" });
  test.afterEach(async ({ request }) => {
    const r = await request.post("http://127.0.0.1:8793/start");
    expect(r.ok()).toBe(true);
  });
  test("cached backup module reads real local photos while origin is stopped", async ({
    page,
    request,
  }) => {
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
    const original = await seed(page);
    await open(page);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          for (const name of await caches.keys()) {
            const c = await caches.open(name);
            for (const req of await c.keys())
              if (/\/react\/photos-/.test(new URL(req.url).pathname))
                return true;
          }
          return false;
        }),
      )
      .toBe(true);
    const url = page.url();
    await page.unrouteAll({ behavior: "wait" });
    await request.post("http://127.0.0.1:8793/stop");
    expect(
      await page.evaluate(() =>
        fetch("/__uncached_photo_probe").then(
          () => true,
          () => false,
        ),
      ),
    ).toBe(false);
    await page.goto("about:blank");
    const response = await page.goto(url);
    expect(response?.fromServiceWorker()).toBe(true);
    await open(page);
    const result = await page.evaluate(async (id) => {
      const m = await (window as any).EOUL_PHOTO_LOAD(),
        client = m.currentPhotoClient((window as any).EOUL_MOCK_KEY);
      const file = await client.controller.makeFile();
      return { size: file.size, photo: !!(await client.repository.get(id)) };
    }, original.photoId);
    expect(result.size).toBeGreaterThan(original.bytes.length);
    expect(result.photo).toBe(true);
  });
});

test("persistent browser upgrades old Blob photo rows without changing original bytes", async ({
  browser,
  browserName,
}, testInfo) => {
  const dir = testInfo.outputPath("synthetic-legacy-profile");
  await fs.mkdir(dir, { recursive: true });
  const context = await browser.browserType().launchPersistentContext(dir, {
    headless: true,
    ...(browserName === "chromium" && process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  try {
    const p = await context.newPage();
    await routes(p);
    await p.goto("/?photos=0#/closet");
    await p.waitForFunction(() => !!(window as any).K?.M);
    const old = await p.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      canvas.getContext("2d")!.fillRect(0, 0, 2, 2);
      const blob = await new Promise<Blob>((r) =>
        canvas.toBlob((b) => r(b!), "image/png"),
      );
      const bytes = new Uint8Array(await blob.arrayBuffer()),
        digest = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        ]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("eoul-local-photos:eoul-d12-hang:v1", 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore("photos", { keyPath: "id" });
          r.result.createObjectStore("meta");
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const row = {
        id: "p_" + digest,
        digest,
        mime: "image/png",
        blob,
        role: "garment",
        width: 2,
        height: 2,
        at: "2026-10-26T00:00:00Z",
      };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["photos"], "readwrite");
        tx.objectStore("photos").add(row);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      });
      return { id: row.id, bytes: Array.from(bytes) };
    });
    await open(p);
    const stored = await p.evaluate(async (id) => {
      const m = await (window as any).EOUL_PHOTO_LOAD(),
        r = await m.photoLibrary((window as any).EOUL_MOCK_KEY);
      const row = await r.get(id),
        all = await r.list();
      return {
        bytes: Array.from(new Uint8Array(await row.blob.arrayBuffer())),
        count: all.length,
        at: row.at,
      };
    }, old.id);
    expect(stored.bytes).toEqual(old.bytes);
    expect(stored.count).toBe(1);
    expect(stored.at).toBe("2026-10-26T00:00:00Z");
  } finally {
    await context.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("selecting an invalid replacement file revokes the previous restore confirmation before parsing", async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const bytes = Buffer.from(await pack(page)),
    before = await page.evaluate(() =>
      JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())),
    );
  await page.locator("[data-photo-file]").setInputFiles({
    name: "A-valid.otjang",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  await expect(page.locator("[data-photo-confirm]")).toBeVisible();
  await page.locator("[data-photo-file]").setInputFiles({
    name: "B-invalid.otjang",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("invalid replacement"),
  });
  await expect(page.locator("[data-photo-status]")).toContainText(
    "JSON이 아니에요",
  );
  await expect(page.locator("[data-photo-confirm]")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())),
    ),
  ).toBe(before);
  await page.locator("[data-photo-file]").setInputFiles({
    name: "A-valid.otjang",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  await expect(page.locator("[data-photo-confirm]")).toBeVisible();
  await page.locator("#bkfile").setInputFiles({
    name: "C-invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("invalid text"),
  });
  await expect(page.locator(".bk-msg")).toContainText("JSON");
  await expect(page.locator("[data-photo-confirm]")).toHaveCount(0);
  const validText = Buffer.from(
    JSON.stringify({
      app: "eoul-lite",
      format: 2,
      data: { "eoul-d12-hang:ui": "{}" },
    }),
  );
  await page.locator("#bkfile").setInputFiles({
    name: "D-valid.json",
    mimeType: "application/json",
    buffer: validText,
  });
  await expect(page.locator("[data-bk-go]")).toBeVisible();
  await page.locator("[data-photo-file]").setInputFiles({
    name: "B-invalid.otjang",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("invalid replacement"),
  });
  await expect(page.locator("[data-photo-status]")).toContainText(
    "JSON이 아니에요",
  );
  await expect(page.locator("[data-bk-go]")).toHaveCount(0);
  await page.locator("#bkfile").setInputFiles({
    name: "D-valid.json",
    mimeType: "application/json",
    buffer: validText,
  });
  await expect(page.locator("[data-bk-go]")).toBeVisible();
  await page.locator("#bkfile").setInputFiles({
    name: "E-too-large.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 32),
  });
  await expect(page.locator(".bk-msg")).toContainText("5MB");
  await expect(page.locator("[data-bk-go]")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())),
    ),
  ).toBe(before);
});
