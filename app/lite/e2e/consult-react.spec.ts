import { test, expect, type Page } from "@playwright/test";
// WO-06: the consult screen and its chat bar are React and reuse askConsult,
// the thread store and the confirm sheet. The vanilla screen stays for
// ?ui=vanilla and a failed island load. Behaviour is pinned by consult.spec.ts.
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
  await page.evaluate(() => {
    (window as any).EOUL_SERVER_AI = async () => ({ on_topic: true, answer: "합성 답", product_ids: [] });
    (window as any).K.tab("consult");
  });
  await expect(page.getByRole("heading", { level: 1, name: "코디 상담" })).toBeVisible();
}
async function ask(page: Page, text: string) {
  const input = page.getByLabel("코디 질문", { exact: true });
  await input.fill(text);
  await input.press("Enter");
  await expect(page.locator(".msg.bot")).toContainText("합성 답");
}

test("consult renders as React with a React chat bar and updates in place", async ({ page }) => {
  await open(page);
  await expect(page.locator("[data-react-consult]")).toHaveCount(1);
  await expect(page.locator("#bar [data-react-chatbar]")).toHaveCount(1);
  const box = await page.locator("[data-react-consult]").elementHandle();
  await ask(page, "셔츠 추천해 줘");
  expect(await box!.evaluate((el) => el.isConnected)).toBe(true);
  await expect(page.getByLabel("코디 질문", { exact: true })).toHaveValue("");
});

test("?ui=vanilla keeps the vanilla consult screen", async ({ page }) => {
  await open(page, "&ui=vanilla");
  await expect(page.locator("[data-react-consult]")).toHaveCount(0);
  await ask(page, "셔츠 추천해 줘");
});

test("a failed consult island load falls back to the vanilla consult screen", async ({ page }) => {
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const w = window as any;
    w.EOUL_CONSULT_LOAD = () => Promise.reject(Error("synthetic chunk failure"));
    w.EOUL_SERVER_AI = async () => ({ on_topic: true, answer: "합성 답", product_ids: [] });
    w.K.tab("consult");
  });
  await expect(page.getByText("새 상담 화면을 열지 못해 기존 화면으로 열었어요.")).toBeVisible();
  await expect(page.locator("[data-react-consult]")).toHaveCount(0);
  await ask(page, "셔츠 추천해 줘");
});
