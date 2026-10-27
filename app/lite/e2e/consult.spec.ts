import { test, expect, type Page } from "@playwright/test";
// WO-06 baseline: the consult screen (asking, answers with price-check lines,
// AI response facts, recommended cards, the out-of-scope refusal, errors,
// history and threads, the button-only domestic search for brands not in the
// app) had no browser coverage. These tests pin today's vanilla behaviour so
// the React move must keep it. All AI answers here are synthetic.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const w = window as any;
    delete w.EOUL_ADPICK;
    delete w.EOUL_OPEN_PRODUCT_SEARCH;
    delete w.EOUL_RAKUTEN;
    w.consultCalls = [];
    // answers.consult: an object, an error code string, a function or "hold".
    w.EOUL_SERVER_AI = async (req: any) => {
      w.consultCalls.push(req);
      const a = w.answers?.[req.task];
      if (a === "hold") return new Promise((resolve) => (w.release = resolve));
      if (typeof a === "function") return a(req);
      if (typeof a === "string") throw Object.assign(Error(a), { code: a });
      if (a) return a;
      throw Object.assign(Error("not_configured"), { code: "not_configured" });
    };
  });
});
async function consult(page: Page) {
  await page.evaluate(() => (window as any).K.tab("consult"));
  await expect(page).toHaveURL(/#\/consult$/);
}
const input = (page: Page) => page.getByLabel("코디 질문", { exact: true });
async function ask(page: Page, text: string) {
  await input(page).fill(text);
  await input(page).press("Enter");
}
const ANSWER = (id: string) => ({
  on_topic: true,
  answer: "합성 답: 흰 셔츠가 잘 어울려요.",
  product_ids: [id, "ms-0000000"],
  price_check: { lines: ["합성 대조 줄: 33,890원은 예산 안이에요."] },
  ai: { provider: "anthropic", model: "claude-synthetic-1", requestId: "msg_synthetic", inputTokens: 12, outputTokens: 34 },
});

test("an empty consult offers examples; an answer shows text, the price-check line, AI facts and a hangable card", async ({
  page,
}) => {
  await consult(page);
  await expect(page.getByRole("heading", { level: 1, name: "코디 상담" })).toBeVisible();
  await expect(page.getByText("옷·코디 이야기만 답해요")).toBeVisible();
  await page.evaluate(() => ((window as any).answers = { consult: "hold" }));
  await page.getByRole("button", { name: "하객룩 뭐 입을까요?" }).click();
  await expect(page.locator(".msg.me")).toHaveText("하객룩 뭐 입을까요?");
  await expect(page.getByRole("status").filter({ hasText: "생각하는 중이에요" })).toBeVisible();
  await expect(input(page)).toBeDisabled();
  const req = await page.evaluate(() => (window as any).consultCalls[0]);
  expect(req.task).toBe("consult");
  expect(req.query).toBe("하객룩 뭐 입을까요?");
  expect(req.history).toEqual([]);
  expect(req.items.length).toBeGreaterThan(0);
  const id = req.items[0].id;
  await page.evaluate((v) => (window as any).release(v), ANSWER(id));
  const bot = page.locator(".msg.bot");
  await expect(bot).toContainText("AI 코디 상담");
  await expect(bot).toContainText("합성 답: 흰 셔츠가 잘 어울려요.");
  await expect(bot.getByRole("note")).toContainText("합성 대조 줄: 33,890원은 예산 안이에요.");
  await bot.getByText("AI 응답 정보").click();
  await expect(bot).toContainText("claude-synthetic-1");
  await expect(bot).toContainText("msg_synthetic");
  await expect(input(page)).toBeEnabled();
  // Only ids among the given candidates become cards.
  const cards = page.locator(".recs [data-card]");
  await expect(cards).toHaveCount(1);
  await cards.getByRole("button", { name: "걸어 보기", exact: true }).click();
  await expect(cards.getByRole("button", { name: "걸어 보는 중 · 내리기", exact: true })).toHaveAttribute("aria-pressed", "true");
  // The hanger strip is not shown on the consult screen (vanilla rule).
  await expect(page.locator("#strip")).toBeHidden();
  expect(await page.evaluate(() => (window as any).K.M.compareList())).toEqual([id]);
  await cards.locator(".open-p").click();
  await expect(page).toHaveURL(new RegExp(`#/p/${id}$`));
});

test("off-topic, errors, empty and over-long questions are handled without a second send", async ({ page }) => {
  await consult(page);
  await page.evaluate(() => ((window as any).answers = { consult: { on_topic: false, answer: "" } }));
  await ask(page, "오늘 주식 어때요?");
  await expect(page.locator(".msg.bot.refuse")).toContainText("상담 범위 밖이에요");
  await expect(page.locator(".msg.bot.refuse")).toContainText("옷이나 코디 이야기만 도와드릴 수 있어요.");
  await page.evaluate(() => ((window as any).answers = { consult: "daily_limit" }));
  await ask(page, "셔츠 추천해 줘");
  await expect(page.locator(".msg.err")).toContainText("오늘 AI 사용 한도에 도달했어요. 내일 다시 물어봐 주세요.");
  await ask(page, "가".repeat(301));
  await expect(page.locator(".msg.err").last()).toContainText("질문이 301자예요. 300자 안으로 줄여서 다시 물어봐 주세요.");
  await input(page).fill("   ");
  await input(page).press("Enter");
  await expect(input(page)).toBeFocused();
  expect(await page.evaluate(() => (window as any).consultCalls.map((r: any) => r.query))).toEqual(["오늘 주식 어때요?", "셔츠 추천해 줘"]);
});

test("a follow-up sends the earlier turns as history and threads are kept, listed, reopened and deleted", async ({
  page,
}) => {
  await consult(page);
  await page.evaluate(() => ((window as any).answers = { consult: { on_topic: true, answer: "합성 첫 답", product_ids: [] } }));
  await ask(page, "셔츠 추천해 줘");
  await expect(page.locator(".msg.bot")).toContainText("합성 첫 답");
  await ask(page, "더 밝은 색은?");
  await expect(page.locator(".msg.bot").last()).toContainText("합성 첫 답");
  const second = await page.evaluate(() => (window as any).consultCalls[1]);
  expect(second.history).toEqual([
    { role: "user", content: "셔츠 추천해 줘" },
    { role: "assistant", content: "합성 첫 답" },
  ]);
  await expect(page.locator(".ttl")).toContainText("셔츠 추천해 줘");
  // The thread survives a reload of the page.
  await page.reload();
  await page.waitForFunction(() => !!(window as any).K?.M);
  await consult(page);
  await expect(page.locator(".msg.me")).toHaveCount(2);
  await page.getByRole("button", { name: "새 상담" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "코디 상담" })).toBeVisible();
  const hist = page.locator(".hist");
  await expect(hist.locator(".hrow")).toHaveCount(1);
  await expect(hist).toContainText("셔츠 추천해 줘");
  await expect(hist).toContainText("주고받은 말 4개");
  await hist.getByRole("button", { name: /셔츠 추천해 줘/ }).click();
  await expect(page.locator(".msg.me")).toHaveCount(2);
  await page.getByRole("button", { name: "이전 상담" }).click();
  await hist.getByRole("button", { name: "이 상담 지우기" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("‘셔츠 추천해 줘’ 상담을 지울까요?");
  await sheet.getByRole("button", { name: "지우기", exact: true }).click();
  await expect(page.locator(".hist .hrow")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("eoul-d12-hang:consult") || "{}").threads)).toEqual([]);
});

test("a brand not in the app offers a domestic search that only runs when pressed", async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.domestic = [];
    w.EOUL_ADPICK = async (q: string) => {
      w.domestic.push(q);
      return { fetchedAt: "2026-10-27T00:00:00.000Z", items: [{ name: "합성 국내 셔츠", shop: "합성몰", price: "19,900원", image: null, url: "https://link.adpick.co.kr/c" }] };
    };
    w.answers = { consult: { on_topic: true, answer: "합성 답: 앱에서 확인한 정보는 아니에요.", product_ids: [] } };
  });
  await consult(page);
  await ask(page, "유니클로 셔츠 추천해 줘");
  await expect(page.locator(".msg.bot")).toContainText("앱에서 확인한 정보는 아니에요.");
  const req = await page.evaluate(() => (window as any).consultCalls[0]);
  expect(req.conditions.join(" ")).toContain("유니클로 상품은 이 앱 목록에 없어요");
  const panel = page.locator("[data-adpick-panel]");
  const button = panel.getByRole("button", { name: /국내 쇼핑몰에서 '유니클로 .*' 찾기/ });
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => (window as any).domestic)).toEqual([]);
  await button.click();
  await expect(panel).toContainText("합성 국내 셔츠");
  await expect(panel).toContainText("수수료가 지급될 수 있습니다");
  expect((await page.evaluate(() => (window as any).domestic)).length).toBe(1);
  expect(await page.evaluate(() => (window as any).consultCalls.length)).toBe(1);
});
