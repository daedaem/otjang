import { test, expect, type Page } from "@playwright/test";
import { serveCommunity } from "./community-fixture.mjs";
// 검토(11-01): 커뮤니티 작성창(.cm-veil/.cm-sheet)도 키보드가 열리면 닫기·제목과 맨 아래 올리기 버튼이 보이거나
// 작성창 안 스크롤로 닿아야 한다. 앱 안 커뮤니티와 독립 /c 모두, 실제 처리기 + 메모리 SQLite 합성 자료만 쓴다.
// 키보드는 visualViewport를 336px 줄이는 모형이며 실제 화면 키보드 확인이 아니다. iOS처럼 보이는 영역이 아래로 밀린
// 경우(offsetTop 100px, 검토 11-01)도 본다: 보이는 구간은 offsetTop ~ offsetTop + 보이는 높이다.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const vv = new EventTarget() as any;
    vv.offsetLeft = 0; vv.scale = 1;
    Object.defineProperty(vv, "offsetTop", { get: () => (window as any).__vvTop || 0 });
    Object.defineProperty(vv, "width", { get: () => innerWidth });
    Object.defineProperty(vv, "height", { get: () => innerHeight - ((window as any).__kb || 0) });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    (window as any).__setKb = (px: number, top = 0) => { (window as any).__kb = px; (window as any).__vvTop = top; vv.dispatchEvent(new Event("resize")); };
  });
});
test.afterEach(async ({ context }) => {
  await Promise.all(context.pages().filter((p) => !p.isClosed()).map((p) => p.waitForLoadState("networkidle")));
  await context.unrouteAll({ behavior: "wait" });
});
async function setup(page: Page, standalone: boolean) {
  const who = { member: "qa-board-a", operator: false };
  await serveCommunity(page, standalone ? "public" : "private", standalone ? {
    MEMBER_SESSION_SECRET: "qa-only-".repeat(6), KAKAO_REST_KEY: "qa-not-a-live-key",
  } : {}, who, { start: standalone ? "/c#/community?board=sale" : "/?photos=0#/community?board=sale", standalone });
  await page.getByLabel("이름").fill("합성작성자");
  await page.getByRole("checkbox", { name: /규칙을 읽었고 따를게요/ }).check();
  await page.getByRole("checkbox", { name: /만 14세 이상이에요/ }).check();
  await page.getByRole("button", { name: "가입하기", exact: true }).click();
}
const box = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom }; });
for (const standalone of [false, true])
  for (const [w, h] of [[390, 844], [1180, 820]] as const)
  for (const top of [0, 100])
    test(`${standalone ? "/c" : "app"} ${w}×${h}${top ? " (visible area pushed down 100px)" : ""}: the sale editor stays usable above the keyboard`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await setup(page, standalone);
      await page.getByRole("button", { name: "세일 제보하기", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "세일 제보하기", exact: true });
      const title = editor.getByLabel("제목", { exact: true });
      await title.fill("작성 중인 합성 제보");
      await page.evaluate((top) => (window as any).__setKb(336, top), top);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      // The visible band: from the visual viewport's top to its bottom.
      const upper = top, visible = top + h - 336;
      // Top of the editor: close button and title reachable (scroll the editor to its start).
      await editor.evaluate((el) => { const s = el.closest(".cm-sheet") || el; (s as HTMLElement).scrollTop = 0; });
      const close = await box(page, '[role=dialog] .cm-sheet-head button, .cm-sheet .cm-sheet-head button');
      expect(close.t, "close button below the top of the visible area").toBeGreaterThanOrEqual(upper - 0.5);
      expect(close.b, "close button above the keyboard").toBeLessThanOrEqual(visible + 0.5);
      const t = await title.evaluate((e) => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom }; });
      expect(t.t, "title below the top of the visible area").toBeGreaterThanOrEqual(upper - 0.5);
      expect(t.b, "title above the keyboard").toBeLessThanOrEqual(visible + 0.5);
      // Bottom of the editor: scroll it to the end; the post button sits above the keyboard.
      await editor.evaluate((el) => { const s = el.closest(".cm-sheet") || el; (s as HTMLElement).scrollTop = (s as HTMLElement).scrollHeight; });
      const post = await editor.getByRole("button", { name: "올리기", exact: true }).evaluate((e) => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom }; });
      expect(post.t, "post button below the top of the visible area").toBeGreaterThanOrEqual(upper - 0.5);
      expect(post.b, "post button above the keyboard").toBeLessThanOrEqual(visible + 0.5);
      await expect(title).toHaveValue("작성 중인 합성 제보");
    });
