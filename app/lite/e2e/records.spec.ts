import { test, expect, type Page } from "@playwright/test";
// WO-05 baseline: the purchase records screen (summary, the "decided to buy"
// rows with their next step and return, the dated timeline) had no browser
// coverage. These tests pin today's vanilla behaviour so the React move must
// keep it.
const A = "ms-728000", // 베이식 옥스포드 셔츠 [화이트]
  B = "ms-854339", // 릴렉스 핏 옥스포드 셔츠 [블루]
  C = "ms-2406919",
  D = "ms-4651485";
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
});
async function records(page: Page) {
  await page.evaluate(() => (window as any).K.tab("records"));
  await expect(page).toHaveURL(/#\/records$/);
}
const waiting = (page: Page) => page.locator("section").filter({ has: page.getByRole("heading", { name: "사기로 한 옷" }) });
const rowOf = (page: Page, name: string) => waiting(page).locator(".wait-row").filter({ hasText: name });

test("with nothing decided the screen says so and leads back to search", async ({ page }) => {
  await records(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("아직 정한 옷이 없어요");
  await expect(page.getByText("걸어 본 옷을 살지 정하면 여기에 남아요.")).toBeVisible();
  await page.getByRole("button", { name: "옷 찾으러 가기" }).click();
  await expect(page.getByLabel("찾는 옷", { exact: true })).toBeVisible();
});

test("holds alone are counted as undecided", async ({ page }) => {
  await page.evaluate((id) => (window as any).K.M.decide(id, "hold"), A);
  await records(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("보류 1벌 · 아직 정하지 않았어요");
  await expect(page.locator(".sum")).toContainText("보류1");
});

test("the summary counts buy, hold and skip, and the timeline opens a product", async ({ page }) => {
  await page.evaluate(
    ([a, b, c, d]) => {
      const m = (window as any).K.M;
      m.decide(a, "buy");
      m.decide(b, "buy");
      m.decide(c, "hold");
      m.decide(d, "skip");
    },
    [A, B, C, D],
  );
  await records(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("3벌을 정했어요");
  const sum = page.locator(".sum");
  const price = await page.evaluate(([a, b]) => {
    const m = (window as any).K.M;
    return (m.product(a).price + m.product(b).price).toLocaleString("ko-KR") + "원 수집가";
  }, [A, B]);
  await expect(sum).toContainText("살게요2");
  await expect(sum).toContainText(price);
  await expect(sum).toContainText("보류1");
  await expect(sum).toContainText("안 살래요1");
  const tl = page.locator(".tl");
  await expect(tl.locator(".day")).toHaveCount(1);
  await expect(tl.locator(".day")).toHaveText(/^\d+월 \d+일$/);
  await expect(tl.locator(".rec")).toHaveCount(4);
  await expect(tl.locator(".rec").filter({ hasText: "베이식 옥스포드 셔츠 [화이트]" })).toContainText("살게요 주문 전");
  await tl.locator(".rec").filter({ hasText: "베이식 옥스포드 셔츠 [화이트]" }).click();
  await expect(page).toHaveURL(new RegExp(`#/p/${A}$`));
});

test("a bought item moves ordered → received → kept and lands in the closet", async ({ page }) => {
  await page.evaluate((id) => (window as any).K.M.decide(id, "buy"), A);
  await records(page);
  const row = rowOf(page, "베이식 옥스포드 셔츠 [화이트]");
  await expect(row).toContainText("사기로 함 · 주문 전");
  await row.getByRole("button", { name: "주문했어요" }).click();
  await expect(row).toContainText("주문했다고 기록함");
  await row.getByRole("button", { name: "받았어요" }).click();
  await expect(row).toContainText("받음 · 계속 입을지 결정 전");
  await expect(row.getByRole("button", { name: "반품했어요" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).K.M.getState().closet.length)).toBe(0);
  await row.getByRole("button", { name: "계속 입을게요 · 걸기" }).click();
  await expect(waiting(page)).toHaveCount(0);
  await expect(page.locator(".tl .rec")).toContainText("계속 입는 내 옷");
  expect(await page.evaluate((id) => (window as any).K.M.getState().closet.filter((g: any) => g.productId === id).length, A)).toBe(1);
});

test("a received item can be returned with a reason and the timeline shows it", async ({ page }) => {
  await page.evaluate((id) => {
    const m = (window as any).K.M;
    m.decide(id, "buy");
    m.advance(id, "ordered");
    m.advance(id, "received");
  }, A);
  await records(page);
  await rowOf(page, "베이식 옥스포드 셔츠 [화이트]").getByRole("button", { name: "반품했어요" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("확인된 거래가 아니라 직접 남기는 기록이에요.");
  await sheet.getByRole("button", { name: "색이 달라요" }).click();
  await expect(page.getByRole("status").filter({ hasText: "반품으로 기록했어요 · 옷장에서 내렸어요" })).toBeVisible();
  await expect(waiting(page)).toHaveCount(0);
  // The timeline uses the short reason label.
  await expect(page.locator(".tl .rec")).toContainText("살게요 반품했다고 기록함 · 색");
  expect(await page.evaluate((id) => (window as any).K.M.product(id).verdict.record.stage, A)).toBe("returned");
});

test("a failed step shows the reason and keeps the stage", async ({ page }) => {
  await page.evaluate((id) => {
    const m = (window as any).K.M;
    m.decide(id, "buy");
    m.advance = () => {
      throw Error("합성 저장 실패예요.");
    };
  }, A);
  await records(page);
  await rowOf(page, "베이식 옥스포드 셔츠 [화이트]").getByRole("button", { name: "주문했어요" }).click();
  await expect(page.getByRole("status").filter({ hasText: "합성 저장 실패예요." })).toBeVisible();
  await expect(rowOf(page, "베이식 옥스포드 셔츠 [화이트]")).toContainText("사기로 함 · 주문 전");
});

test("a collection purpose note changes the keep wording and shows in the timeline", async ({ page }) => {
  await page.evaluate((id) => {
    const w = window as any;
    localStorage.setItem(
      w.K.M.collectionKey,
      JSON.stringify({ v: 1, candidates: { [id]: { purpose: "collect", series: "", updatedAt: "2026-10-27T00:00:00.000Z" } }, goals: [] }),
    );
    const m = w.K.M;
    m.decide(id, "buy");
    m.advance(id, "ordered");
    m.advance(id, "received");
  }, A);
  await records(page);
  await expect(rowOf(page, "베이식 옥스포드 셔츠 [화이트]").getByRole("button", { name: "계속 소장할게요 · 걸기" })).toBeVisible();
  await expect(page.locator(".tl [data-record-collection]")).toContainText("후보 메모 · ");
  await expect(page.locator(".tl [data-record-collection]")).toContainText("소장 목적이면 착용 기록이 적어도 감점하지 않아요.");
});
