import { test, expect } from "@playwright/test";
import { serveCommunity, communityCall } from "./community-fixture.mjs";

// Real handlers and SQLite, synthetic identities/images only. No live provider or account.
for (const audience of ["unjoined", "old rules"] as const) {
  test(`public photo URLs follow the join/rules gate and reporting (${audience})`, async ({ page }) => {
    const reader = { member: "qa-reader", operator: false };
    const { env } = await serveCommunity(page, "public", {
      MEMBER_SESSION_SECRET: "qa-only-".repeat(6),
      KAKAO_REST_KEY: "qa-not-a-live-key",
    }, reader, { start: "/?photos=0#/community" });
    const jpeg = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 2;
      canvas.getContext("2d")!.fillRect(0, 0, 2, 2);
      return canvas.toDataURL("image/jpeg").split(",")[1];
    });
    const author = { member: "qa-author", operator: false };
    expect((await communityCall(env, "join", { name: "작성회원", rules: 1, age14: true }, author)).status).toBe(200);
    const made = await communityCall(env, "posts", {
      post: { text: "합성 사진 접근 검사", pieces: [], consent: true }, photos: [jpeg],
    }, author);
    expect(made.status).toBe(200);
    const { id } = await made.json();
    const photo = await env.COMMUNITY_DB.prepare("SELECT id FROM community_photos WHERE post = ?1").bind(id).first();
    if (audience === "old rules") {
      expect((await communityCall(env, "join", { name: "읽는회원", rules: 1, age14: true }, reader)).status).toBe(200);
      await env.COMMUNITY_DB.prepare("UPDATE community_members SET rules = 0 WHERE member = ?1").bind(reader.member).run();
    }
    await page.reload();
    await expect(page.getByRole("heading", { name: "코디 공유" })).toBeVisible();
    await expect(page.getByRole("button", { name: "가입하기", exact: true })).toBeDisabled();
    const before = await page.evaluate(() => localStorage.getItem((window as any).EOUL_MOCK_KEY));
    const denied = await page.evaluate(async (photoId) => {
      const feed = await fetch("/api/community/feed");
      const image = await fetch("/api/community/photos/" + photoId);
      return [feed.status, image.status];
    }, photo.id);
    expect(denied).toEqual([403, 403]);

    await page.getByLabel("이름").fill("읽는회원");
    await page.getByRole("checkbox", { name: /규칙을 읽었고 따를게요/ }).check();
    await page.getByRole("checkbox", { name: /만 14세 이상이에요/ }).check();
    await page.getByRole("button", { name: "가입하기", exact: true }).click();
    await expect(page.getByRole("button", { name: "코디 올리기", exact: true })).toBeVisible();
    const image = page.getByRole("img", { name: "작성회원님의 코디 사진 1", exact: true });
    await expect(image).toBeVisible();
    await expect(image).toHaveJSProperty("naturalWidth", 2);
    const allowed = await page.evaluate(async (photoId) => {
      const r = await fetch("/api/community/photos/" + photoId);
      return { status: r.status, cache: r.headers.get("cache-control"), vary: r.headers.get("vary") };
    }, photo.id);
    expect(allowed).toEqual({ status: 200, cache: "private, no-store", vary: "Cookie" });

    const article = page.locator("[data-community-post]").filter({ hasText: "합성 사진 접근 검사" });
    await article.getByRole("button", { name: "신고", exact: true }).click();
    await article.getByLabel("신고 이유").selectOption("rights");
    await article.getByRole("button", { name: "신고하기", exact: true }).click();
    await expect(article).toHaveCount(0);
    expect(await page.evaluate(async (photoId) => (await fetch("/api/community/photos/" + photoId)).status, photo.id)).toBe(404);
    expect(await page.evaluate(() => localStorage.getItem((window as any).EOUL_MOCK_KEY))).toBe(before);
  });
}
