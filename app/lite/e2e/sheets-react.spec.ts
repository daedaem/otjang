import { test, expect, type Page } from "@playwright/test";
// WO-08a: the shared bottom sheets (menu, disclosure, confirm, colour, add by
// kind, return reason, purchase decision) are React. The vanilla sheets stay
// for ?ui=vanilla and a failed island load. Behaviour is pinned by
// common-ui, consult, detail and records specs.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
});
async function open(page: Page, search = "") {
  await page.goto(`/?photos=0${search}#/closet`);
  await page.waitForFunction(() => !!(window as any).K?.M);
}
const reactSheet = (page: Page) => page.locator(".sheet[data-react-sheet]");

test("menu, disclosure, add by kind and colour sheets render as React", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "더보기" }).first().click();
  await expect(reactSheet(page)).toHaveCount(1);
  await reactSheet(page).getByRole("button", { name: "이 시안에 대해" }).click();
  await expect(reactSheet(page).getByRole("heading", { level: 3, name: "AI 순위와 상담" })).toBeVisible();
  await reactSheet(page).getByRole("button", { name: "닫기" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await page.getByRole("button", { name: "종류·색으로 넣기" }).click();
  await expect(reactSheet(page).getByRole("heading", { name: "어떤 옷을 걸까요?" })).toBeVisible();
  await reactSheet(page).getByRole("button", { name: "셔츠 셔츠", exact: true }).click();
  await reactSheet(page).getByRole("button", { name: "화이트", exact: true }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).K.M.getState().closet.length)).toBe(1);
});

test("decision and return sheets from the detail bar render as React", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.decide("ms-728000", "hold");
    (window as any).K.go("detail", { id: "ms-728000" });
  });
  await page.locator("#bar").getByRole("button", { name: "바꾸기" }).click();
  await expect(reactSheet(page)).toContainText("어떻게 할까요?");
  await reactSheet(page).getByRole("button", { name: "샀어요" }).click();
  await expect(page.locator("#bar").getByRole("status")).toContainText("살게요로 남겼어요");
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.advance("ms-728000", "ordered");
    m.advance("ms-728000", "received");
    m.advance("ms-728000", "kept");
    (window as any).K.refresh();
  });
  await page.locator("#bar").getByRole("button", { name: "반품했어요" }).click();
  await expect(reactSheet(page)).toContainText("왜 반품했어요?");
  await reactSheet(page).getByRole("button", { name: "품질이 아쉬워요" }).click();
  await expect(page.locator(".k-toast")).toHaveText("반품으로 기록했어요 · 옷장에서 내렸어요");
});

test("?ui=vanilla keeps the vanilla sheets", async ({ page }) => {
  await open(page, "&ui=vanilla");
  await page.getByRole("button", { name: "더보기" }).first().click();
  await expect(page.locator(".sheet")).toHaveCount(1);
  await expect(reactSheet(page)).toHaveCount(0);
});

test("a failed sheets island load falls back to the vanilla sheet", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).EOUL_CHROME_LOAD = () => Promise.reject(Error("synthetic chunk failure"));
  });
  await page.getByRole("button", { name: "더보기" }).first().click();
  await expect(page.locator(".sheet")).toHaveCount(1);
  await expect(reactSheet(page)).toHaveCount(0);
  await expect(page.getByRole("dialog").getByRole("button", { name: "처음부터 다시" })).toBeVisible();
});
