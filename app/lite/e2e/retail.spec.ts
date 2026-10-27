import { test, expect, type Page } from "@playwright/test";
// WO-03a: the supplier panels (Adpick domestic offers, Rakuten, public product
// facts) are one shared React component. The add screen uses it instead of
// injecting vanilla HTML; the vanilla global click handler must not handle
// the React buttons a second time.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "not_configured" }),
      });
    return r.continue();
  });
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const w = window as any;
    delete w.EOUL_ADPICK;
    delete w.EOUL_OPEN_PRODUCT_SEARCH;
    delete w.EOUL_RAKUTEN;
    w.aiCalls = [];
    w.EOUL_SERVER_AI = async (req: any) => {
      w.aiCalls.push(req);
      const answer = w.answers?.[req.task];
      if (typeof answer === "string") throw Object.assign(Error(answer), { code: answer });
      if (answer) return answer;
      throw Object.assign(Error("not_configured"), { code: "not_configured" });
    };
  });
});
async function submitAdd(page: Page, words: string) {
  await page.evaluate(() => (window as any).K.go("add", {}));
  const q = page.getByLabel("브랜드나 상품명", { exact: true });
  await q.fill(words);
  await q.press("Enter");
  return q;
}

test("the add screen renders the shared React supplier panels and a retry calls the supplier exactly once", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as any;
    w.domestic = [];
    w.failDomestic = true;
    w.EOUL_ADPICK = async (q: string) => {
      w.domestic.push(q);
      if (w.failDomestic) throw Error("합성 연결 실패예요.");
      return {
        fetchedAt: "2026-10-27T00:00:00.000Z",
        items: [{ name: "<b>합성</b> 상품", shop: "합성몰", price: "9,900원", image: null, url: "https://link.adpick.co.kr/r" }],
      };
    };
  });
  await submitAdd(page, "합성 셔츠");
  const dom = page.locator("#adom");
  await expect(dom.locator("[data-react-retail]")).toHaveCount(1);
  const panel = dom.locator("[data-adpick-panel]");
  await expect(panel).toContainText("합성 연결 실패예요.");
  expect(await page.evaluate(() => (window as any).domestic)).toEqual(["합성 셔츠"]);
  await page.evaluate(() => ((window as any).failDomestic = false));
  await panel.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(panel.getByRole("link")).toHaveCount(1);
  await expect(panel.getByRole("link")).toContainText("<b>합성</b> 상품");
  await expect(panel.locator("b")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).domestic)).toEqual(["합성 셔츠", "합성 셔츠"]);
});

test("Rakuten on the add screen plans and searches once per click with the edited keyword", async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.rakuten = [];
    w.EOUL_RAKUTEN = async (q: string) => {
      w.rakuten.push(q);
      return { fetchedAt: "2026-10-27T00:00:00.000Z", items: [] };
    };
    w.answers = { retailer_search: { on_topic: true, keyword: "シャツ", notes: [] } };
  });
  await submitAdd(page, "합성 셔츠");
  const panel = page.locator("#adom [data-rakuten-panel]");
  await panel.getByRole("button", { name: "AI로 일본어 검색어 만들기", exact: true }).click();
  const keyword = panel.getByLabel("AI가 제안한 일본어 검색어");
  await expect(keyword).toHaveValue("シャツ");
  await keyword.fill("綿シャツ");
  await panel.getByRole("button", { name: "이 검색어로 찾아보기", exact: true }).click();
  await expect(panel).toContainText("라쿠텐에서 일치하는 상품을 찾지 못했어요. 조건을 자동으로 넓히지 않았어요.");
  expect(await page.evaluate(() => (window as any).rakuten)).toEqual(["綿シャツ"]);
  expect(await page.evaluate(() => (window as any).aiCalls)).toEqual([{ task: "retailer_search", query: "합성 셔츠" }]);
});

test("an off-topic or failed keyword plan says so without searching, and a long query is refused before any call", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as any;
    w.rakuten = [];
    w.domestic = [];
    w.EOUL_RAKUTEN = async (q: string) => (w.rakuten.push(q), { items: [] });
    w.EOUL_ADPICK = async (q: string) => (w.domestic.push(q), { items: [], omitted: 2 });
    w.answers = { retailer_search: { on_topic: false } };
  });
  await submitAdd(page, "합성 셔츠");
  const panel = page.locator("#adom [data-rakuten-panel]");
  await expect(page.locator("#adom [data-adpick-panel]")).toContainText("필수 정보를 확인할 수 없어");
  await panel.getByRole("button", { name: "AI로 일본어 검색어 만들기", exact: true }).click();
  await expect(panel).toContainText("찾는 옷이나 브랜드를 말해 주세요.");
  await page.evaluate(() => ((window as any).answers.retailer_search = "bad_request"));
  await panel.getByRole("button", { name: "AI로 일본어 검색어 만들기", exact: true }).click();
  await expect(panel).toContainText("앱을 새로고침하고 다시 시도해 주세요.");
  expect(await page.evaluate(() => (window as any).rakuten)).toEqual([]);
  const long = "가".repeat(101);
  await submitAdd(page, long);
  await expect(page.locator("#adom")).toContainText("국내 상품 검색어는 100자 이내로 입력해 주세요.");
  expect(await page.evaluate(() => (window as any).domestic)).toEqual(["합성 셔츠"]);
});
