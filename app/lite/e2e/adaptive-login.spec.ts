import { test, expect } from "@playwright/test";
import { serveAccounts, ACCOUNT_ORIGIN } from "./account-fixture.mjs";
import { resizeTo } from "./adaptive-helpers";
// 다기기 대응(11-01): 로그인 화면도 대표 창 크기(CSS px)에서 잘리거나 옆으로 넘치지 않는다. 실기기 확인이 아니다.
test.afterEach(async ({ context }) => {
  await Promise.all(context.pages().filter((p) => !p.isClosed()).map((p) => p.waitForLoadState("networkidle")));
  await context.unrouteAll({ behavior: "wait" });
});
test("the sign-in page fits small, landscape and tablet windows and keeps typed text across resizes", async ({ page }) => {
  await serveAccounts(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(ACCOUNT_ORIGIN + "/");
  await expect(page).toHaveURL(ACCOUNT_ORIGIN + "/_member/signin");
  const email = page.getByLabel("이메일");
  await email.fill("someone@example.test");
  for (const [w, h] of [[320, 568], [844, 390], [667, 375], [820, 1180], [1180, 820], [390, 844]]) {
    await resizeTo(page, w, h);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const go = page.getByRole("button", { name: "들어가기", exact: true });
    await go.scrollIntoViewIfNeeded();
    const b = await go.boundingBox();
    expect(b!.x).toBeGreaterThanOrEqual(0);
    expect(b!.x + b!.width).toBeLessThanOrEqual(w + 1);
    expect(b!.height).toBeGreaterThanOrEqual(44);
    await expect(email).toHaveValue("someone@example.test");
  }
});
