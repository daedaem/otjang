import { test, expect, devices, type Page } from "@playwright/test";
import fs from "node:fs/promises";
const KEY = "eoul-d12-hang:mirror:v1";
async function routes(page: Page) {
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
}
async function open(page: Page) {
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.locator("[data-backup]").click();
  await expect(page.locator('[data-photo-ready="true"]')).toBeVisible();
}
test("body photo pack previews as a real reference, restores in a fresh context and undo retains original bytes", async ({
  page,
  browser,
}, info) => {
  await routes(page);
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  const original = await page.evaluate(async () => {
    const m = (window as any).K.M,
      mod = await (window as any).EOUL_PHOTO_LOAD(),
      repo = await mod.photoLibrary((window as any).EOUL_MOCK_KEY),
      canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 400;
    canvas.getContext("2d")!.fillRect(0, 0, 200, 400);
    const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/png"),
      ),
      bytes = new Uint8Array(await blob.arrayBuffer()),
      digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
      id = "p_" + digest;
    await repo.put({
      id,
      digest,
      mime: "image/png",
      role: "body",
      width: 200,
      height: 400,
      at: new Date().toISOString(),
      blob,
    });
    const d = m.newMirrorDraft();
    Object.assign(d, {
      body: { photoId: id, width: 200, height: 400 },
      heightRaw: "175",
      head: { x: 100, y: 20 },
      feet: { x: 100, y: 380 },
    });
    const raw = " " + JSON.stringify(d) + "\n";
    localStorage.setItem(m.mirrorDraftKey, raw);
    return { id, bytes: Array.from(bytes), raw };
  });
  await open(page);
  const downloading = page.waitForEvent("download");
  await page.locator("[data-bk-save]").click();
  const download = await downloading,
    bytes = await fs.readFile((await download.path())!);
  expect(bytes.subarray(0, 8).toString()).toBe("EOULPH01");
  const context = await browser.newContext({
      ...devices[
        info.project.name === "mobile-webkit" ? "iPhone 13" : "Pixel 7"
      ],
      serviceWorkers: "block",
    }),
    target = await context.newPage();
  try {
    await routes(target);
    await target.goto("http://127.0.0.1:8792/?photos=0#/closet");
    await expect(target.locator("[data-react-closet]")).toBeVisible();
    await open(target);
    await target
      .locator("#bkfile")
      .setInputFiles({
        name: "synthetic-body.otjang",
        mimeType: "application/octet-stream",
        buffer: bytes,
      });
    await expect(target.locator("[data-photo-confirm]")).toBeVisible();
    await expect(target.locator("[data-photo-preview]")).toContainText(
      "사진 없는 연결 0개",
    );
    await expect(target.locator("[data-photo-preview]")).toContainText(
      "연결 안 된 보관 사진 0장",
    );
    expect(
      await target.evaluate((k) => localStorage.getItem(k), KEY),
    ).toBeNull();
    await Promise.all([
      target.waitForEvent("load"),
      target.locator("[data-photo-confirm]").click(),
    ]);
    expect(await target.evaluate((k) => localStorage.getItem(k), KEY)).toBe(
      original.raw,
    );
    const saved = await target.evaluate(async (id) => {
      const mod = await (window as any).EOUL_PHOTO_LOAD(),
        repo = await mod.photoLibrary((window as any).EOUL_MOCK_KEY),
        p = await repo.get(id);
      return {
        role: p.role,
        bytes: Array.from(new Uint8Array(await p.blob.arrayBuffer())),
      };
    }, original.id);
    expect(saved.role).toBe("body");
    expect(saved.bytes).toEqual(original.bytes);
    await open(target);
    await expect(target.locator("[data-photo-undo]")).toBeVisible();
    await Promise.all([
      target.waitForEvent("load"),
      target.locator("[data-photo-undo]").click(),
    ]);
    expect(
      await target.evaluate((k) => localStorage.getItem(k), KEY),
    ).toBeNull();
    const retained = await target.evaluate(async (id) => {
      const mod = await (window as any).EOUL_PHOTO_LOAD(),
        repo = await mod.photoLibrary((window as any).EOUL_MOCK_KEY);
      return Array.from(
        new Uint8Array(await (await repo.get(id)).blob.arrayBuffer()),
      );
    }, original.id);
    expect(retained).toEqual(original.bytes);
  } finally {
    await context.close();
  }
});
