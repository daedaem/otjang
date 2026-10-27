import { test, expect, type Page } from "@playwright/test";
// WO-04 baseline: the product detail, the purchase decision bar and sheets,
// and the side-by-side comparison had no browser coverage. These tests pin
// today's vanilla behaviour so the React move must keep it.
const ID = "ms-728000"; // 무신사 스탠다드 베이식 옥스포드 셔츠 [화이트]
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
  });
});
async function detail(page: Page, id = ID) {
  await page.evaluate((id) => (window as any).K.go("detail", { id }), id);
  await expect(page).toHaveURL(new RegExp(`#/p/${id}$`));
}
const hangbox = (page: Page) => page.getByRole("region", { name: "내 옷에 걸어 보면" });
const bar = (page: Page) => page.locator("#bar");

test("the detail shows the product facts, the judgement basis and used-market links", async ({ page }) => {
  await detail(page);
  await expect(page.getByRole("heading", { level: 1, name: "베이식 옥스포드 셔츠 [화이트]" })).toBeVisible();
  const pdp = page.locator(".pdp");
  await expect(pdp).toContainText("무신사 스탠다드");
  await expect(pdp).toContainText("33,890원");
  await expect(pdp).toContainText("10월 13일 수집가");
  await expect(pdp).toContainText("화이트 · 옥스퍼드·베이직 셔츠 · 평점 4.7 · 후기 21,040개");
  // With an empty closet the detail asks right away, before any hanging.
  await expect(hangbox(page)).toContainText("내 옷에 걸어 보면 · 옷장 없이 판단했어요");
  await expect(hangbox(page).getByRole("heading", { level: 2 })).toHaveText("화이트 셔츠 있어요?");
  await expect(page.getByRole("region", { name: "AI 이유" })).toHaveCount(0);
  const used = page.locator("details.used");
  await expect(used.locator("summary")).toContainText("외부 검색 · 9곳");
  await used.locator("summary").click();
  await expect(used.getByRole("link")).toHaveCount(9);
  await expect(used.getByRole("link").first()).toHaveAttribute("target", "_blank");
  await page.getByRole("button", { name: "내 기준 옷과 실측 비교" }).click();
  await expect(page).toHaveURL(/#\/measure/);
  await page.evaluate(() => (window as any).K.back());
  await expect(page).toHaveURL(new RegExp(`#/p/${ID}$`));
  await page.getByRole("button", { name: /활용·소장 가치 비교/ }).click();
  await expect(page).toHaveURL(/#\/collection/);
  await page.evaluate(() => (window as any).K.back());
  await page.getByRole("button", { name: /내 사진 거울 옆에 놓고 보기/ }).click();
  await expect(page).toHaveURL(/#\/mirror/);
});

test("a product opened from ranked results shows its AI rank and reason", async ({ page }) => {
  await page.evaluate(() => {
    (window as any).EOUL_SERVER_AI = async (req: any) => {
      if (req.task !== "rank") throw Object.assign(Error("x"), { code: "not_configured" });
      return { summary: "합성 총평", ranking: req.items.map((x: any, i: number) => ({ id: x.id, reason: `합성 이유 ${i + 1}`, fit: "추천" })) };
    };
    (window as any).K.go("results", { q: "셔츠" });
  });
  await expect(page.locator("#ai")).toContainText("합성 총평");
  await page.locator("#grid [data-card]").first().getByRole("button").first().click();
  const why = page.getByRole("region", { name: "AI 이유" });
  await expect(why).toContainText("AI 순위 1위 · 추천");
  await expect(why).toContainText("합성 이유 1");
});

test("hanging on the detail asks once: no records no overlap, yes adds an owned shirt in the picked colour", async ({
  page,
}) => {
  await detail(page);
  const hang = page.locator(".pdp-photo").getByRole("button", { name: "걸어 보기", exact: true });
  await hang.click();
  await expect(page.locator(".pdp-photo").getByRole("button", { name: "걸어 보는 중 · 내리기", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(hangbox(page).getByRole("heading", { level: 2 })).toHaveText("화이트 셔츠 있어요?");
  await hangbox(page).getByRole("button", { name: "없어요", exact: true }).click();
  await expect(hangbox(page).getByRole("heading", { level: 2 })).toHaveText("겹치는 셔츠가 없어요");
  await expect(hangbox(page)).toContainText("가진 셔츠가 없다고 답했어요.");
  expect(await page.evaluate(() => (window as any).K.M.getState().closet.length)).toBe(0);
  await detail(page, "ms-854339");
  await page.locator(".pdp-photo").getByRole("button", { name: "걸어 보기", exact: true }).click();
  // The "no" above was for white shirts (gender|kind|colour), so this blue
  // shirt still asks.
  const h2 = hangbox(page).getByRole("heading", { level: 2 });
  await expect(h2).toHaveText("라이트 블루 셔츠 있어요?");
  await hangbox(page).getByRole("button", { name: "있어요", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("가진 셔츠는 무슨 색이에요?");
  await sheet.getByRole("button", { name: "라이트 블루 (이 옷과 같은 색)" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(h2).toHaveText("비슷한 옷이 1벌 걸려 있어요");
  expect(await page.evaluate(() => (window as any).K.M.getState().closet.map((g: any) => [g.kind, g.color]))).toEqual([
    ["shirt", await page.evaluate(() => (window as any).K.M.product("ms-854339").color)],
  ]);
  expect(await page.evaluate(() => (window as any).K.M.compareList())).toEqual([ID, "ms-854339"]);
});

test("the decision bar records hold and skip, can change it, and a return from the seller asks once", async ({
  page,
  context,
}) => {
  await detail(page);
  await expect(bar(page)).toContainText("33,890원");
  await expect(bar(page)).toContainText("무신사");
  const seller = bar(page).getByRole("link", { name: /판매처에서 사기/ });
  await expect(seller).toHaveAttribute("href", "https://www.musinsa.com/products/728000");
  await expect(seller).toHaveAttribute("target", "_blank");
  await bar(page).getByRole("button", { name: "보류", exact: true }).click();
  await expect(bar(page).getByRole("status")).toContainText("보류로 남겼어요");
  await bar(page).getByRole("button", { name: "바꾸기", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("어떻게 할까요?");
  await expect(sheet.getByRole("button", { name: "기록 지우기" })).toBeVisible();
  await sheet.getByRole("button", { name: "안 살래요" }).click();
  await expect(bar(page).getByRole("status")).toContainText("안 살래요로 남겼어요");
  expect(await page.evaluate((id) => (window as any).K.M.product(id).verdict.record.decision, ID)).toBe("skip");
  // A different product, opened at the seller and back again.
  await detail(page, "ms-854339");
  const popup = context.waitForEvent("page");
  await bar(page).getByRole("link", { name: /판매처에서 사기/ }).click();
  await (await popup).close();
  await page.waitForTimeout(800);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const back = page.getByRole("dialog");
  await expect(back).toContainText("판매처에서 돌아왔어요 · 어떻게 하셨어요?");
  await expect(back.getByRole("button", { name: "기록 지우기" })).toHaveCount(0);
  await back.getByRole("button", { name: "샀어요" }).click();
  await expect(bar(page).getByRole("status")).toContainText("살게요로 남겼어요 · 주문·도착은 기록에서");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(400);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a kept purchase can be marked returned with a reason from the detail bar", async ({ page }) => {
  await page.evaluate((id) => {
    const m = (window as any).K.M;
    m.decide(id, "buy");
    m.advance(id, "ordered");
    m.advance(id, "received");
    m.advance(id, "kept");
  }, ID);
  await detail(page);
  await expect(bar(page).getByRole("status")).toContainText("살게요로 남겼어요 · 계속 입는 내 옷");
  await expect(bar(page).getByRole("button", { name: "바꾸기" })).toHaveCount(0);
  expect(await page.evaluate((id) => (window as any).K.M.getState().closet.filter((g: any) => g.productId === id).length, ID)).toBe(1);
  await bar(page).getByRole("button", { name: "반품했어요", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("베이식 옥스포드 셔츠 [화이트] · 왜 반품했어요?");
  await sheet.getByRole("button", { name: "사이즈가 안 맞아요" }).click();
  await expect(page.getByRole("status").filter({ hasText: "반품으로 기록했어요 · 옷장에서 내렸어요" })).toBeVisible();
  expect(await page.evaluate((id) => (window as any).K.M.product(id).verdict.record.stage, ID)).toBe("returned");
  expect(await page.evaluate((id) => (window as any).K.M.getState().closet.filter((g: any) => g.productId === id).length, ID)).toBe(0);
});

test("compare needs two hung products, lines them up, folds equal rows and can unhang", async ({ page }) => {
  await page.evaluate(() => {
    (window as any).K.M.compareAdd("ms-728000");
    (window as any).K.go("compare", {});
  });
  await expect(page.getByRole("heading", { name: "두 벌 이상 걸면 나란히 봐요" })).toBeVisible();
  await expect(page.getByText("지금 1벌 걸려 있어요", { exact: false })).toBeVisible();
  await page.evaluate(() => {
    const m = (window as any).K.M;
    m.compareAdd("ms-854339");
    m.compareAdd("ms-2406919");
    (window as any).K.refresh();
  });
  await expect(page.getByRole("heading", { name: "걸어 본 3벌" })).toBeVisible();
  const table = page.locator("#cmp table");
  await expect(table.locator("thead th[scope=col]")).toHaveCount(4);
  const same = await page.evaluate(() => {
    const m = (window as any).K.M;
    return m.compareRows(m.compareList()).rows.filter((r: any) => r.same).length;
  });
  expect(same).toBeGreaterThan(0);
  await expect(table.locator("tbody tr.same")).toHaveCount(same);
  await expect(table.locator("tbody tr.same").first()).toBeHidden();
  const toggle = page.getByRole("button", { name: `같은 항목 ${same}개 보기` });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByRole("button", { name: `같은 항목 ${same}개 접기` })).toHaveAttribute("aria-expanded", "true");
  await expect(table.locator("tbody tr.same").first()).toBeVisible();
  await table.getByRole("button", { name: "내리기" }).first().click();
  await expect(page.getByRole("heading", { name: "걸어 본 2벌" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).K.M.compareList())).toEqual(["ms-854339", "ms-2406919"]);
  await table.locator("thead").getByRole("button").first().click();
  await expect(page).toHaveURL(/#\/p\/ms-854339$/);
});
