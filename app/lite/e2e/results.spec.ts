import { test, expect, type Page } from "@playwright/test";
// WO-03 baseline: the search results screen and its supplier panels had no
// browser coverage. These tests pin the current behaviour and must keep
// passing when the screen moves to React (only the vanilla `?ui=vanilla` path
// keeps the old markup).
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
});
// No supplier connectors unless a test installs its own synthetic ones.
async function noSuppliers(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    delete w.EOUL_ADPICK;
    delete w.EOUL_OPEN_PRODUCT_SEARCH;
    delete w.EOUL_RAKUTEN;
  });
}
// Synthetic AI: `rank` answers from window.rankAnswer (a value, an error code
// or a pending promise); every request is recorded.
async function ai(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.aiCalls = [];
    w.EOUL_SERVER_AI = async (req: any) => {
      w.aiCalls.push(req);
      const answer = w.answers?.[req.task];
      if (typeof answer === "function") return answer(req);
      if (typeof answer === "string") throw Object.assign(Error(answer), { code: answer });
      if (answer) return answer;
      throw Object.assign(Error("not_configured"), { code: "not_configured" });
    };
  });
}
async function results(page: Page, q: string) {
  await page.evaluate((q) => (window as any).K.go("results", { q }), q);
  await expect(page.getByRole("button", { name: `다시 찾기: ${q}`, exact: true })).toBeVisible();
}
const cards = (page: Page) => page.locator("#grid [data-card]");
const ids = (page: Page) => cards(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.card));

test("a home question opens ranked results: AI waits, reorders with reasons and keeps the question", async ({
  page,
}) => {
  await noSuppliers(page);
  await ai(page);
  await page.evaluate(() => {
    const w = window as any;
    w.answers = {
      rank: (req: any) =>
        new Promise((resolve) => {
          w.finishRank = () =>
            resolve({
              summary: "합성 총평",
              ranking: [...req.items].reverse().map((x: any, i: number) => ({ id: x.id, reason: `합성 이유 ${i + 1}`, fit: "추천" })),
            });
        }),
    };
    w.K.tab("home");
  });
  const q = page.getByLabel("찾는 옷", { exact: true });
  await q.fill("셔츠");
  await q.press("Enter");
  await expect(page.getByRole("button", { name: "다시 찾기: 셔츠", exact: true })).toBeVisible();
  await expect(page.getByText("12개", { exact: false }).first()).toBeVisible();
  const status = page.locator("#ai");
  await expect(status).toContainText("AI가 후보 순서를 정하는 중이에요");
  const before = await ids(page);
  expect(before).toHaveLength(12);
  await page.waitForFunction(() => typeof (window as any).finishRank === "function");
  await page.evaluate(() => (window as any).finishRank());
  await expect(status).toContainText("합성 총평");
  await expect.poll(() => ids(page)).toEqual([...before].reverse());
  await expect(cards(page).first().getByLabel("AI 순위 1위")).toBeVisible();
  const req = await page.evaluate(() => (window as any).aiCalls[0]);
  expect(req.task).toBe("rank");
  expect(req.query).toBe("셔츠");
  expect(req.items.map((x: any) => x.id)).toEqual(before);
  // Opening a product and coming back keeps the AI order without asking again.
  await cards(page).first().getByRole("button").first().click();
  await expect(page).toHaveURL(/#\/p\//);
  await page.evaluate(() => (window as any).K.back());
  await expect(page.getByRole("button", { name: "다시 찾기: 셔츠", exact: true })).toBeVisible();
  await expect.poll(() => ids(page)).toEqual([...before].reverse());
  expect(await page.evaluate(() => (window as any).aiCalls.length)).toBe(1);
  await page.getByRole("button", { name: "다시 찾기: 셔츠", exact: true }).click();
  await expect(page.getByLabel("찾는 옷", { exact: true })).toHaveValue("셔츠");
});

test("coming back from a product restores the results scroll position", async ({ page }) => {
  await noSuppliers(page);
  await ai(page);
  await results(page, "셔츠");
  await cards(page).nth(9).scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  expect(y).toBeGreaterThan(300);
  await cards(page).nth(9).getByRole("button").first().click();
  await expect(page).toHaveURL(/#\/p\//);
  await page.evaluate(() => (window as any).K.back());
  await expect(page.getByRole("button", { name: "다시 찾기: 셔츠", exact: true })).toBeAttached();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(y);
  await expect(cards(page).nth(9)).toBeInViewport();
});

test("an AI failure keeps the engine order and says why", async ({ page }) => {
  await noSuppliers(page);
  await ai(page);
  await page.evaluate(() => ((window as any).answers = { rank: "daily_limit" }));
  await results(page, "셔츠");
  const engine = await page.evaluate(() => (window as any).K.M.ask("셔츠", {}).products.slice(0, 12).map((p: any) => p.id));
  await expect(page.locator("#ai")).toContainText("오늘 AI 순위 사용량을 다 써서 기본 순서로 보여 드려요");
  expect(await ids(page)).toEqual(engine);
  await expect(cards(page).first().getByLabel(/AI 순위/)).toHaveCount(0);
});

test("conditions can be removed and an empty search offers a wider search without filling in other clothes", async ({
  page,
}) => {
  await noSuppliers(page);
  await ai(page);
  await results(page, "흰 셔츠 5만원 이하");
  await expect(cards(page)).toHaveCount(1);
  await page.getByRole("button", { name: "화이트 조건 빼기", exact: true }).click();
  await expect(cards(page)).toHaveCount(8);
  await expect(page.getByRole("button", { name: "화이트 조건 빼기", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "5만원 이하 조건 빼기", exact: true })).toBeVisible();
  await results(page, "검정 코트 3만원 이하");
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "조건에 맞는 옷이 없어요" })).toBeVisible();
  await expect(page.getByText("조건을 자동으로 넓히지 않았어요", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "‘3만원 이하’ 빼고 1개" }).click();
  await expect(cards(page)).toHaveCount(1);
  // Every result page with products asks once; the empty page does not.
  expect(await page.evaluate(() => (window as any).aiCalls.map((r: any) => [r.task, r.items.length]))).toEqual([
    ["rank", 1],
    ["rank", 8],
    ["rank", 1],
  ]);
});

test("an unreadable request shows no products and offers examples; a partly unknown request is not padded", async ({
  page,
}) => {
  await noSuppliers(page);
  await ai(page);
  await results(page, "asdf");
  await expect(page.getByRole("heading", { name: "무슨 옷인지 못 알아들었어요" })).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  const example = await page.evaluate(() => (window as any).K.M.examples()[0]);
  await page.getByRole("button", { name: example, exact: true }).click();
  await expect(page.getByRole("button", { name: `다시 찾기: ${example}`, exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as any).EOUL_ADPICK = async () => ({ items: [], omitted: 0, fetchedAt: "2026-10-27T00:00:00.000Z" });
  });
  await results(page, "구찌 셔츠");
  await expect(page.locator("[data-card]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "국내 쇼핑몰 상품" })).toBeVisible();
  await page.getByText("기존 상품 목록에서 찾지 못한 이유").click();
  await expect(page.getByText("다른 상품으로 채우지 않았어요", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as any).aiCalls.map((r: any) => r.query))).toEqual([example]);
});

test("hanging a result asks once, a no answer marks the card, and the fifth hanger explains the limit", async ({
  page,
}) => {
  await noSuppliers(page);
  await ai(page);
  await results(page, "셔츠");
  const first = cards(page).first();
  await first.getByRole("button", { name: "걸어 보기", exact: true }).click();
  await expect(first.getByRole("button", { name: "걸어 보는 중 · 내리기", exact: true })).toHaveAttribute("aria-pressed", "true");
  const ask = page.getByRole("group", { name: /셔츠 있어요\?$/ });
  await expect(ask).toHaveCount(1);
  await expect(page.locator("#strip")).toBeVisible();
  await ask.getByRole("button", { name: "없어요", exact: true }).click();
  await expect(ask).toHaveCount(0);
  await expect(first).toContainText("겹치는 셔츠 없음");
  for (let i = 1; i < 4; i++)
    await cards(page).nth(i).getByRole("button", { name: "걸어 보기", exact: true }).click();
  await expect(page.getByRole("button", { name: "걸어 보는 중 · 내리기", exact: true })).toHaveCount(4);
  await cards(page).nth(4).getByRole("button", { name: "걸어 보기", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "4벌까지" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).K.M.compareList().length)).toBe(4);
  await first.getByRole("button", { name: "걸어 보는 중 · 내리기", exact: true }).click();
  await expect(first.getByRole("button", { name: "걸어 보기", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => (window as any).K.M.compareList().length)).toBe(3);
});

test("domestic results start once, keep provider order, prices and the ad disclosure, and can retry a failure", async ({
  page,
}) => {
  await noSuppliers(page);
  await ai(page);
  await page.evaluate(() => {
    const w = window as any;
    w.domestic = [];
    w.failDomestic = true;
    w.EOUL_ADPICK = async (q: string) => {
      w.domestic.push(q);
      if (w.failDomestic) throw Error("합성 연결 실패예요.");
      return {
        fetchedAt: "2026-10-27T00:00:00.000Z",
        items: [
          { name: "<합성 첫 상품>", shop: "합성몰", price: "29,900원", image: null, url: "https://link.adpick.co.kr/synthetic-a" },
          { name: "합성 둘째 상품", shop: "합성몰", price: "15,000원", image: null, url: "https://link.adpick.co.kr/synthetic-b" },
        ],
      };
    };
  });
  await results(page, "셔츠");
  const panel = page.locator("[data-adpick-panel]");
  await expect(panel).toContainText("애드픽 제휴 광고");
  await expect(panel).toContainText("합성 연결 실패예요.");
  expect(await page.evaluate(() => (window as any).domestic)).toEqual(["셔츠"]);
  await page.evaluate(() => ((window as any).failDomestic = false));
  await panel.getByRole("button", { name: "다시 시도", exact: true }).click();
  const links = panel.getByRole("link");
  await expect(links).toHaveCount(2);
  await expect(links.first()).toContainText("<합성 첫 상품>");
  await expect(links.first()).toContainText("29,900원");
  await expect(links.nth(1)).toContainText("15,000원");
  await expect(links.first()).toHaveAttribute("rel", /sponsored/);
  await expect(links.first()).toHaveAttribute("href", "https://link.adpick.co.kr/synthetic-a");
  const text = await panel.innerText();
  expect(text.indexOf("수수료가 지급될 수 있습니다")).toBeGreaterThan(-1);
  expect(text.indexOf("수수료가 지급될 수 있습니다")).toBeLessThan(text.indexOf("<합성 첫 상품>"));
  await expect(panel).toContainText("가격은 참고값");
  expect(await page.evaluate(() => (window as any).domestic)).toEqual(["셔츠", "셔츠"]);
  expect(await page.evaluate(() => (window as any).aiCalls.filter((r: any) => r.task !== "rank"))).toEqual([]);
});

test("a late domestic answer for an earlier search cannot fill the newer results", async ({ page }) => {
  await noSuppliers(page);
  await ai(page);
  await page.evaluate(() => {
    const w = window as any;
    w.pending = {};
    w.EOUL_ADPICK = (q: string) => new Promise((resolve) => (w.pending[q] = resolve));
  });
  await results(page, "셔츠");
  await page.waitForFunction(() => !!(window as any).pending["셔츠"]);
  await results(page, "니트");
  await page.waitForFunction(() => !!(window as any).pending["니트"]);
  const item = (name: string) => ({ fetchedAt: "2026-10-27T00:00:00.000Z", items: [{ name, shop: "합성몰", price: "1원", image: null, url: "https://link.adpick.co.kr/x" }] });
  await page.evaluate((v) => (window as any).pending["셔츠"](v), item("늦은 셔츠 응답"));
  await page.evaluate((v) => (window as any).pending["니트"](v), item("니트 응답"));
  const panel = page.locator("[data-adpick-panel]");
  await expect(panel).toContainText("니트 응답");
  await expect(panel).not.toContainText("늦은 셔츠 응답");
});

test("public product facts are ranked only as facts with attribution, and an AI failure keeps code order", async ({
  page,
}) => {
  await noSuppliers(page);
  await ai(page);
  await page.evaluate(() => {
    const w = window as any;
    const facts = [
      { code: "1111111111111", brand: "합성 A", name: "첫 공개 셔츠", url: "https://world.openproductsfacts.org/product/1111111111111" },
      { code: "2222222222222", brand: "합성 B", name: "둘째 공개 셔츠", url: "https://world.openproductsfacts.org/product/2222222222222" },
    ];
    w.EOUL_OPEN_PRODUCT_SEARCH = async () => ({ items: facts, fetchedAt: "2026-10-27T00:00:00.000Z" });
    w.answers = {
      rank: "not_configured",
      open_rank: {
        summary: "합성 공개 비교",
        ranking: [
          { id: "2222222222222", reason: "합성 이유 둘" },
          { id: "1111111111111", reason: "합성 이유 하나" },
        ],
        ai: { model: "synthetic-model", inputTokens: 1, outputTokens: 2, requestId: "req_synthetic" },
      },
    };
  });
  await results(page, "셔츠");
  const box = page.locator("[data-open-recommendations]");
  await expect(box).toContainText("공개 상품 후보 2개");
  await expect(box).toContainText("AI 후보 비교 · 합성 공개 비교");
  await expect(box.getByRole("link").first()).toContainText("둘째 공개 셔츠");
  await expect(box.getByRole("link").first()).toContainText("합성 이유 둘");
  await expect(box).toContainText("가격·재고·구매처 없는 상품 정보예요");
  await expect(box.getByRole("link", { name: "ODbL" })).toHaveAttribute("href", "https://opendatacommons.org/licenses/odbl/1-0/");
  await expect(box).toContainText("2026-10-27 기준");
  const open = await page.evaluate(() => (window as any).aiCalls.find((r: any) => r.task === "open_rank"));
  expect(open).toEqual({ task: "open_rank", query: "셔츠", items: ["1111111111111", "2222222222222"] });
  await page.evaluate(() => ((window as any).answers.open_rank = "provider_timeout"));
  await results(page, "니트");
  await expect(box).toContainText("AI 비교를 완료하지 못해 상품 코드 순서로 보여드려요");
  await expect(box).toContainText("(provider_timeout)");
  await expect(box.getByRole("link").first()).toContainText("첫 공개 셔츠");
});

test("Rakuten search needs an explicit action, can use an edited AI keyword and keeps currency and attribution", async ({
  page,
}) => {
  await noSuppliers(page);
  await ai(page);
  await page.evaluate(() => {
    const w = window as any;
    w.rakuten = [];
    w.EOUL_RAKUTEN = async (q: string) => {
      w.rakuten.push(q);
      return {
        fetchedAt: "2026-10-27T00:00:00.000Z",
        items: [{ name: "合成シャツ", shop: "合成ショップ", price: 1980, taxFlag: 1, image: null, url: "https://item.rakuten.co.jp/synthetic/1/" }],
      };
    };
    w.answers = { rank: "not_configured", retailer_search: { on_topic: true, keyword: "シャツ", notes: ["합성 메모"] } };
  });
  await results(page, "셔츠");
  const panel = page.locator("[data-rakuten-panel]");
  await expect(panel.getByRole("link", { name: /라쿠텐 사이트에서 직접 검색/ })).toHaveAttribute(
    "href",
    "https://search.rakuten.co.jp/search/mall/%EC%85%94%EC%B8%A0/",
  );
  expect(await page.evaluate(() => (window as any).rakuten)).toEqual([]);
  await panel.getByRole("button", { name: "AI로 일본어 검색어 만들기", exact: true }).click();
  const keyword = panel.getByLabel("AI가 제안한 일본어 검색어");
  await expect(keyword).toHaveValue("シャツ");
  expect(await page.evaluate(() => (window as any).rakuten)).toEqual([]);
  await keyword.fill("白シャツ");
  await panel.getByRole("button", { name: "이 검색어로 찾아보기", exact: true }).click();
  await expect(panel).toContainText("合成シャツ");
  await expect(panel).toContainText("¥1,980 JPY (세전)");
  await expect(panel).toContainText("검색어: 白シャツ");
  await expect(panel).toContainText("라쿠텐 제공 순서(AI 추천 순위 아님)");
  await expect(panel.getByRole("link", { name: "Supported by Rakuten Developers" })).toHaveAttribute("href", "https://developers.rakuten.com/");
  expect(await page.evaluate(() => (window as any).rakuten)).toEqual(["白シャツ"]);
  await panel.getByRole("button", { name: "입력한 말로 라쿠텐 검색", exact: true }).click();
  await expect(panel).toContainText("검색어: 셔츠");
  expect(await page.evaluate(() => (window as any).rakuten)).toEqual(["白シャツ", "셔츠"]);
  const req = await page.evaluate(() => (window as any).aiCalls.find((r: any) => r.task === "retailer_search"));
  expect(req).toEqual({ task: "retailer_search", query: "셔츠" });
});

test("submitting on the add screen shows the shared domestic and Rakuten panels only for the submitted words", async ({
  page,
}) => {
  await noSuppliers(page);
  await page.evaluate(() => {
    const w = window as any;
    w.domestic = [];
    w.EOUL_ADPICK = async (q: string) => {
      w.domestic.push(q);
      return { fetchedAt: "2026-10-27T00:00:00.000Z", items: [{ name: "합성 등록 상품", shop: "합성몰", price: "9,900원", image: null, url: "https://link.adpick.co.kr/reg" }] };
    };
    w.K.go("add", {});
  });
  const q = page.getByLabel("브랜드나 상품명", { exact: true });
  await q.fill("합성 셔츠");
  await q.press("Enter");
  const dom = page.locator("#adom");
  await expect(dom.locator("[data-adpick-panel]")).toContainText("합성 등록 상품");
  await expect(dom.locator("[data-adpick-panel]")).toContainText("수수료가 지급될 수 있습니다");
  await expect(dom.locator("[data-rakuten-panel]").getByRole("link", { name: /라쿠텐 사이트에서 직접 검색/ })).toBeVisible();
  await expect(dom.locator("[data-open-recommendations]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).domestic)).toEqual(["합성 셔츠"]);
  await q.fill("합성 바지");
  await expect(dom).toBeEmpty();
});
