import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
const KEY = "eoul-d12-hang:v1";
const A = "m-" + "a".repeat(32),
  B = "m-" + "b".repeat(32);
async function open(page: Page, scope: string, offline = false) {
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return route.abort();
    if (u.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"code":"not_configured"}',
      });
    if (route.request().resourceType() === "document") {
      const res = await route.fetch(),
        role = scope === "owner" ? "owner" : "member";
      return route.fulfill({
        response: res,
        body: (await res.text()).replace(
          "<head>",
          '<head><meta name="hangit-role" content="' +
            role +
            '"><meta name="hangit-storage-scope" content="' +
            scope +
            '">' +
            (offline ? '<meta name="hangit-offline" content="1">' : ""),
        ),
      });
    }
    return route.continue();
  });
  await page.goto(
    "/?photos=0&qa_scope=" +
      scope +
      "&qa_cached=" +
      (offline ? "1" : "0") +
      "#/closet",
  );
  await page.waitForFunction(() => !!(window as any).K?.M);
}
test("a member never reads the owner's legacy wardrobe and stale owner tabs cannot write", async ({
  page,
  context,
}) => {
  await open(page, "owner");
  const photoDigest = await page.evaluate(async () => {
    const w = window as any,
      g = w.K.M.addGarment({
        kind: "shirt",
        color: "white",
        label: "OWNER_QA_SHIRT",
      });
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    canvas.getContext("2d")!.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((r) =>
      canvas.toBlob((b) => r(b!), "image/png"),
    );
    const mod = await w.EOUL_PHOTO_LOAD();
    await mod.saveGarmentPhoto({
      namespace: w.EOUL_MOCK_KEY,
      core: w.K.M,
      garmentId: g.id,
      file: new File([blob], "local-qa.png", { type: "image/png" }),
      width: 2,
      height: 2,
    });
    return (await (await mod.photoLibrary(w.EOUL_MOCK_KEY)).list())[0].digest;
  });
  const raw = await page.evaluate((k) => localStorage.getItem(k), KEY);
  const member = await context.newPage();
  await open(member, B);
  expect(
    await member.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
  expect(
    await member.evaluate(async () => {
      const w = window as any,
        mod = await w.EOUL_PHOTO_LOAD();
      return (await (await mod.photoLibrary(w.EOUL_MOCK_KEY)).list()).length;
    }),
  ).toBe(0);
  await member.evaluate(() => {
    (window as any).K.M.addGarment({
      kind: "pants",
      color: "black",
      label: "MEMBER_QA_PANTS",
    });
  });
  expect(await member.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  await expect(page.locator("#hangit-account-lock")).toBeVisible();
  expect(
    await page.evaluate(() => {
      try {
        (window as any).K.M.addGarment({ kind: "knit", color: "navy" });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  expect(
    await member.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(1);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).K?.M);
  expect(
    await page.evaluate(() =>
      (window as any).K.M.getState().closet.map((g: any) => g.label),
    ),
  ).toEqual(["OWNER_QA_SHIRT"]);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(raw);
  expect(
    await page.evaluate(async () => {
      const w = window as any,
        mod = await w.EOUL_PHOTO_LOAD();
      return (await (await mod.photoLibrary(w.EOUL_MOCK_KEY)).list())[0].digest;
    }),
  ).toBe(photoDigest);
});
test("two members keep separate durable drafts and storage while the owner raw remains untouched", async ({
  page,
  context,
}) => {
  await open(page, A);
  await page.evaluate(() => {
    const w = window as any;
    w.K.M.addGarment({ kind: "shirt", color: "white", label: "MEMBER_A" });
    w.EOUL_UI_STORAGE.setItem("eoul-qa:opaque", "A draft");
  });
  const first = await page.evaluate(() =>
    (window as any).EOUL_UI_STORAGE.getItem("eoul-qa:opaque"),
  );
  expect(first).toBe("A draft");
  const second = await context.newPage();
  await open(second, B);
  expect(
    await second.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
  expect(
    await second.evaluate(() =>
      (window as any).EOUL_UI_STORAGE.getItem("eoul-qa:opaque"),
    ),
  ).toBeNull();
  await second.evaluate(() => {
    (window as any).EOUL_UI_STORAGE.setItem("eoul-qa:opaque", "B draft");
  });
  await expect(page.locator("#hangit-account-lock")).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => !!(window as any).K?.M);
  expect(
    await page.evaluate(() => (window as any).K.M.getState().closet[0].label),
  ).toBe("MEMBER_A");
  expect(
    await page.evaluate(() =>
      (window as any).EOUL_UI_STORAGE.getItem("eoul-qa:opaque"),
    ),
  ).toBe("A draft");
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
});

for (const transport of ["download", "share"] as const)
  test(`member backup via ${transport} exports logical keys only and explicit import never overwrites another account`, async ({
    page,
    context,
  }) => {
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: () => mode === "share",
      });
      if (mode === "share")
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async (payload) => {
            (window as any).__sharedBackup = await payload.files[0].text();
          },
        });
    }, transport);
    await open(page, B);
    await page.evaluate(() => {
      localStorage.setItem("eoul-private-note", "OWNER_OPAQUE");
      (window as any).K.M.addGarment({
        kind: "shirt",
        color: "white",
        label: "BACKUP_MEMBER_B",
      });
    });
    const beforeB = await page.evaluate(
      (k) => (window as any).EOUL_UI_STORAGE.getItem(k),
      KEY,
    );
    await page.getByRole("button", { name: "더보기", exact: true }).click();
    await page.getByRole("button", { name: "백업 · 복원" }).click();
    let text: string;
    if (transport === "download") {
      const event = page.waitForEvent("download");
      await page.locator("[data-bk-save]").click();
      const file = await event,
        path = await file.path();
      expect(path).not.toBeNull();
      text = await fs.readFile(path!, "utf8");
    } else {
      await page.locator("[data-bk-save]").click();
      await expect
        .poll(() => page.evaluate(() => (window as any).__sharedBackup || ""))
        .toContain("BACKUP_MEMBER_B");
      text = await page.evaluate(() => (window as any).__sharedBackup);
    }
    expect(text).toContain("BACKUP_MEMBER_B");
    expect(text).not.toContain("OWNER_OPAQUE");
    expect(text).not.toContain("hangit-account:");
    const target = await context.newPage();
    await open(target, A);
    await target.getByRole("button", { name: "더보기", exact: true }).click();
    await target.getByRole("button", { name: "백업 · 복원" }).click();
    await target
      .locator("#bkfile")
      .setInputFiles({
        name: "member-backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(text),
      });
    await expect(target.locator("[data-bk-go]")).toBeVisible();
    expect(
      await target.evaluate(() => (window as any).K.M.getState().mineCount),
    ).toBe(0);
    await Promise.all([
      target.waitForEvent("load"),
      target.locator("[data-bk-go]").click(),
    ]);
    await target.waitForFunction(() => !!(window as any).K?.M);
    expect(
      await target.evaluate(
        () => (window as any).K.M.getState().closet[0].label,
      ),
    ).toBe("BACKUP_MEMBER_B");
    expect(
      await target.evaluate(
        (k) => localStorage.getItem("hangit-account:" + k.scope + ":" + k.key),
        { scope: B, key: KEY },
      ),
    ).toBe(beforeB);
    expect(
      await target.evaluate(() => localStorage.getItem("eoul-private-note")),
    ).toBe("OWNER_OPAQUE");
  });
test("same-account tabs receive scoped storage updates while a different account locks both", async ({
  page,
  context,
}) => {
  await open(page, A);
  const other = await context.newPage();
  await open(other, A);
  await other.evaluate(() =>
    (window as any).K.M.addGarment({
      kind: "shirt",
      color: "white",
      label: "SHARED_ACCOUNT_A",
    }),
  );
  await expect(
    page.getByText("SHARED_ACCOUNT_A", { exact: true }),
  ).toBeVisible();
  const third = await context.newPage();
  await open(third, B);
  await expect(page.locator("#hangit-account-lock")).toBeVisible();
  await expect(other.locator("#hangit-account-lock")).toBeVisible();
  expect(
    await third.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
});
test("cached account HTML never claims a different active identity", async ({
  page,
}) => {
  await open(page, "owner");
  await page.evaluate((k) => {
    (window as any).K.M.addGarment({
      kind: "shirt",
      color: "white",
      label: "PRIVATE_OWNER",
    });
    localStorage.setItem("hangit:active-account:v1", k);
  }, B);
  const before = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await open(page, A, true);
  await expect(page.locator("#hangit-account-lock")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("hangit:active-account:v1")),
  ).toBe(B);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
  expect(
    await page.evaluate(() => (window as any).K.M.getState().mineCount),
  ).toBe(0);
});

test("design preference also uses the active account without changing the owner preference", async ({
  page,
  context,
}) => {
  await open(page, "owner");
  await page.evaluate(() => localStorage.setItem("hangit:look", "v1"));
  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-look", "v2");
  const member = await context.newPage();
  await open(member, A);
  await expect(member.locator("html")).toHaveAttribute("data-look", "v2");
  expect(await member.evaluate(() => localStorage.getItem("hangit:look"))).toBe(
    "v1",
  );
});
