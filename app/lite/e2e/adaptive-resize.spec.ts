import { test, expect } from "@playwright/test";
import { resizeTo } from "./adaptive-helpers";
// 다기기 검사의 창 크기 바꾸기(11-01). WebKit CI 실행 41281268565(#148)에서 긴 상담 검사가 690×840 단계에서 한 번
// 실패했다(마지막 답 아래 끝 745 > 입력 막대 위 722, 같은 제품 코드의 다른 WebKit 실행 4번은 통과). 추정: 브라우저가
// resize 이벤트를 새 배치가 이미 잴 수 있게 된 뒤 몇 프레임 늦게 보내, viewport.js가 아래 막대를 다시 재거나 스크롤
// 기준을 되돌리기 전에 검사가 쟀다. 여기서는 페이지의 resize 처리를 300ms 늦춰 그 상황을 어느 브라우저에서나 되풀이하고,
// resizeTo가 viewport.js가 그 크기를 처리한 뒤에 검사를 넘기는지 본다. 실제 기기 확인이 아니다.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, fn: any, opts?: any) {
      if (type === "resize" && (this === window || this === window.visualViewport) && typeof fn === "function") {
        const self = this;
        return add.call(this, type, function (e: Event) { setTimeout(() => fn.call(self, e), 300); }, opts);
      }
      return add.call(this, type, fn, opts);
    } as typeof EventTarget.prototype.addEventListener;
  });
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
});

test("after resizeTo the bottom space is measured for the new size even when resize arrives late", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?photos=0#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => (window as any).K.tab("consult"));
  await expect(page.getByLabel("코디 질문", { exact: true })).toBeVisible();
  // Phone (bottom tabs under the chat bar) → short landscape (menu rail, chat bar at the bottom) → middle → wide.
  for (const [w, h] of [[844, 390], [690, 840], [1180, 820], [390, 844]] as const) {
    await resizeTo(page, w, h);
    const s = await page.evaluate(() => ({
      measured: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chrome-b")),
      bars: Math.round(innerHeight - document.querySelector(".chatbar")!.getBoundingClientRect().top),
    }));
    expect(s.measured, `${w}×${h}: bottom space is the chat bar (and tabs) of this size`).toBe(s.bars);
  }
});

test("after resizeTo the scroll position has been restored for the new size even when resize arrives late", async ({ page }) => {
  // Chromium keeps the scroll position on its own (CSS scroll anchoring); turn that off so only viewport.js puts
  // the reference garment back, as in a browser without it (추정: CI의 WebKit 실패 때처럼 되돌림이 늦게 일어난다).
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style");
    st.textContent = "html, body { overflow-anchor: none; }";
    document.head.append(st);
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?photos=0#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => { const K = (window as any).K; K.M.loadTrialCloset("M"); K.tab("closet"); });
  const item = page.locator("[data-closet-section=trial] [data-rail-item]").nth(5);
  await expect(item).toBeVisible();
  const id = await item.getAttribute("data-rail-item");
  await item.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 200));
  // Let the scroll event register the reference garment (it is ignored for 0.5s after a resize; none happened yet).
  await page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 50)));
  const at = () => page.locator(`[data-rail-item="${id}"]`).evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const before = await at();
  for (const [w, h] of [[844, 390], [690, 840], [1180, 820], [390, 844]] as const) {
    await resizeTo(page, w, h);
    // Hand over to the checks only after viewport.js has restored the position: nothing moves afterwards.
    const first = await at();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    expect(await at(), `${w}×${h}: reference garment does not move after resizeTo returned`).toBe(first);
  }
  expect(Math.abs((await at()) - before), "reference garment back near its place").toBeLessThanOrEqual(48);
});
