import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
// 사진으로 옷 넣기(대표 10-28 16:46). AI는 동의했을 때만 부르고, 추천은 고쳐서 넣을 수 있다(피드백).
const PHOTO = fileURLToPath(new URL("../public/examples/m-blazer.webp", import.meta.url));
async function open(page: Page, answer: any = { clothing: true, kind: "blazer", color: "navy", label: "네이비 블레이저", confidence: "high" }) {
  const sent: any[] = [];
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return route.abort();
    if (u.pathname === "/api/garment-photo") {
      sent.push(JSON.parse(route.request().postData() || "{}"));
      return route.fulfill(typeof answer === "number" ? { status: answer, contentType: "application/json", body: JSON.stringify({ code: "member_daily_limit", message: "x" }) } : { status: 200, contentType: "application/json", body: JSON.stringify(answer) });
    }
    if (u.pathname.startsWith("/api/")) return route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"not_configured"}' });
    return route.continue();
  });
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  return sent;
}
const go = (page: Page) => page.evaluate(() => (window as any).K.go("photoadd", {}));

test("the add page offers adding by photo", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).K.go("add", {}));
  await page.getByRole("button", { name: /사진으로 넣기/ }).click();
  await expect(page.getByRole("heading", { name: "사진으로 옷 넣기" })).toBeVisible();
});

test("with consent the photo is analysed, the suggestion can be corrected, and the garment is saved with my photo", async ({ page }) => {
  const sent = await open(page);
  await go(page);
  await page.getByRole("checkbox", { name: /AI에게 보내 종류·색을 알아보는 데 동의해요/ }).check();
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  const item = page.locator("[data-photo-item]").first();
  await expect(item.getByText("AI 추천")).toBeVisible();
  await expect(item.getByLabel("종류")).toHaveValue("blazer");
  await expect(item.getByLabel("색")).toHaveValue("navy");
  expect(sent).toHaveLength(1);
  const bytes = Buffer.from(sent[0].image, "base64");
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
  expect(bytes.length).toBeLessThan(200 * 1024);
  await item.getByLabel("색").selectOption("black");
  await page.getByRole("button", { name: "옷장에 1벌 넣기" }).click();
  await expect(page.getByText(/옷장에 1벌 넣었어요/)).toBeVisible();
  const saved = await page.evaluate(() => (window as any).K.M.getState().closet.filter((g: any) => !g.trial).map((g: any) => ({ kind: g.kind, color: g.color, label: g.label, photo: !!g.photoId })));
  expect(saved).toEqual([{ kind: "blazer", color: "black", label: "네이비 블레이저", photo: true }]);
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem("eoul-d12-hang:photo-ai:v1") || "{}"));
  expect(stats).toMatchObject({ suggested: 1, saved: 1, kindChanged: 0, colorChanged: 1 });
});

test("without consent nothing is sent and I pick kind and colour myself", async ({ page }) => {
  const sent = await open(page);
  await go(page);
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  const item = page.locator("[data-photo-item]").first();
  await expect(item.getByText("직접 골라 주세요")).toBeVisible();
  await item.getByLabel("종류").selectOption("knit");
  await item.getByLabel("색").selectOption("grey");
  await page.getByRole("button", { name: "옷장에 1벌 넣기" }).click();
  await expect(page.getByText(/옷장에 1벌 넣었어요/)).toBeVisible();
  expect(sent).toHaveLength(0);
});

test("a member over the daily AI limit is told so and can still pick by hand", async ({ page }) => {
  await open(page, 429);
  await go(page);
  await page.getByRole("checkbox", { name: /동의해요/ }).check();
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(page.locator("[data-photo-item]").first().getByText(/AI 10번을 다 썼어요|직접 골라 주세요/).first()).toBeVisible();
});
