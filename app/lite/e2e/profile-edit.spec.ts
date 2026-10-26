import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
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
  return page.evaluate(
    ({ KEY, DRAFT, INPUT }) => {
      const m = (window as any).K.M,
        g = m.registerGarment({
          draftId: "profile-edit-ui",
          brand: "합성 브랜드",
          name: "합성 실측 셔츠",
          kind: "shirt",
          color: "white",
          url: "",
        });
      m.updateGarmentProfile(g.id, {
        v: 1,
        measures: { length: { cm: 70, source: "seller" } },
        fabric: { value: "코튼", source: "ai" },
      });
      const garment = m.getState().closet[0],
        d = m.profileEditDraft(garment);
      d.form.measures.length = "72.";
      const raw = " " + JSON.stringify({ v: 1, edits: { [g.id]: d } }) + "\n";
      localStorage.setItem(DRAFT, raw);
      const registration = JSON.stringify({
        v: 2,
        step: 0,
        values: {
          draftId: "separate-input-draft",
          brand: "작성 중 브랜드",
          name: "",
          kind: "",
          color: "",
          url: "",
        },
        updatedAt: "2026-10-27T00:00:00Z",
      });
      localStorage.setItem(INPUT, registration);
      return { id: g.id, raw, core: localStorage.getItem(KEY)!, registration };
    },
    { KEY, DRAFT, INPUT },
  );
}
async function open(page: Page) {
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.locator("[data-backup]").click();
  await expect(page.locator('[data-photo-ready="true"]')).toBeVisible();
}

test("owned edit draft exports exact unfinished input, counts separately, and does not rewrite the wardrobe or registration draft", async ({
  page,
}) => {
  const f = await seed(page),
    before = await page.evaluate(() =>
      JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())),
    );
  await open(page);
  await expect(page.locator(".bk")).toContainText("옷 정보 초안 1개");
  const canShare = await page.evaluate(
    () =>
      !!navigator.canShare?.({
        files: [new File(["{}"], "backup.json", { type: "application/json" })],
      }),
  );
  let text: string;
  if (canShare) {
    await page.evaluate(() => {
      (window as any).__sharedBackup = null;
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async ({ files }: { files: File[] }) => {
          (window as any).__sharedBackup = {
            type: files[0].type,
            text: await files[0].text(),
          };
        },
      });
    });
    await page.locator("[data-bk-save]").click();
    await page.waitForFunction(() => !!(window as any).__sharedBackup);
    const result = await page.evaluate(() => (window as any).__sharedBackup);
    expect(result.type).toBe("application/json");
    text = result.text;
  } else {
    const saved = page.waitForEvent("download");
    await page.locator("[data-bk-save]").click();
    const file = await saved,
      path = await file.path();
    expect(path).not.toBeNull();
    text = await fs.readFile(path!, "utf8");
  }
  const data = JSON.parse(text);
  expect(data.data[DRAFT]).toBe(f.raw);
  expect(data.data[INPUT]).toBe(f.registration);
  expect(
    await page.evaluate(() =>
      JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())),
    ),
  ).toBe(before);
  expect(
    await page.evaluate(
      () => (window as any).K.M.getState().closet[0].profile.measures.length.cm,
    ),
  ).toBe(70);
});

test("future owned edit draft restores as inert original while preserving the current valid draft and unrelated registration input", async ({
  page,
}) => {
  const f = await seed(page),
    future = ' {"v":99,"edits":{},"future":"원문 그대로"} ';
  await open(page);
  await page.locator("[data-photo-options] > summary").click();
  await page.locator("[data-bk-paste]").click();
  await page.getByLabel("백업 글자", { exact: true }).fill(
    JSON.stringify({
      app: "eoul-lite",
      format: 2,
      screen: "d12-hang",
      at: "2026-10-27T00:00:00Z",
      data: { [KEY]: f.core, [DRAFT]: future, [INPUT]: f.registration },
    }),
  );
  await page.locator("[data-bk-read]").click();
  await expect(page.locator(".bk > .bk-preview")).toContainText(
    "옷 정보 편집 초안",
  );
  await expect(page.locator(".bk > .bk-preview")).toContainText(
    "기존 활성 자료 유지 1개",
  );
  await page.locator("[data-bk-go]").click();
  await page.waitForFunction(
    ({ DRAFT, future }) =>
      Object.entries(localStorage).some(
        ([k, v]) => k.startsWith(DRAFT + ":unreadable:") && v === future,
      ),
    { DRAFT, future },
  );
  await page.waitForFunction(() => !document.querySelector(".bk"));
  expect(await page.evaluate((k) => localStorage.getItem(k), DRAFT)).toBe(
    f.raw,
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), INPUT)).toBe(
    f.registration,
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(f.core);
});
