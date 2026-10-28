import { test, expect, type Page } from "@playwright/test";
// 사진으로 옷 넣기(대표 10-28 16:46). AI는 동의했을 때만 부르고, 추천은 고쳐서 넣을 수 있다(피드백).
// 사진은 페이지에서 그린 JPEG를 쓴다(WebKit도 확실히 읽는 형식; 거울 검사와 같은 방식).
let PHOTO: { name: string; mimeType: string; buffer: Buffer };
async function photo(page: Page, name = "coat.jpg") {
  const bytes: number[] = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 400;
    const x = c.getContext("2d")!;
    x.fillStyle = "#f4f1ea";
    x.fillRect(0, 0, 300, 400);
    x.fillStyle = "#1f2a44";
    x.fillRect(60, 40, 180, 320);
    const b: Blob = await new Promise((r) => c.toBlob((v) => r(v!), "image/jpeg", 0.9));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  return { name, mimeType: "image/jpeg", buffer: Buffer.from(bytes) };
}
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
  PHOTO = await photo(page);
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

test("if saving one garment fails I am told, the saved one leaves the list and I can try again", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const M = (window as any).K.M;
    const real = M.addGarment.bind(M);
    let n = 0;
    (window as any).__editable = [] as boolean[];
    M.addGarment = (v: any) => {
      (window as any).__editable.push(![...document.querySelectorAll("[data-photo-item] select, [data-photo-item] input")].every((e) => (e as HTMLInputElement).disabled));
      if (++n === 2) throw Error("이 기기 저장 공간이 가득 찼어요.");
      return real(v);
    };
  });
  await go(page);
  await page.locator('input[type="file"]').setInputFiles([PHOTO, await photo(page, "knit.jpg")]);
  const items = page.locator("[data-photo-item]");
  await expect(items).toHaveCount(2);
  await items.nth(0).getByLabel("종류").selectOption("knit");
  await items.nth(1).getByLabel("종류").selectOption("shirt");
  await page.getByRole("button", { name: "옷장에 2벌 넣기" }).click();
  await expect(page.getByText(/1벌은 넣지 못했어요/)).toBeVisible();
  await expect(page.getByText(/저장 공간이 가득 찼어요/)).toBeVisible();
  await expect(items).toHaveCount(1);
  await expect(items.first().getByLabel("종류")).toHaveValue("shirt");
  await expect(page.getByRole("button", { name: "옷장에 1벌 넣기" })).toBeEnabled();
  await expect(items.first().getByLabel("종류")).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__editable)).toEqual([false, false]);
  const saved = await page.evaluate(() => (window as any).K.M.getState().closet.filter((g: any) => !g.trial).map((g: any) => g.kind));
  expect(saved).toEqual(["knit"]);
});
