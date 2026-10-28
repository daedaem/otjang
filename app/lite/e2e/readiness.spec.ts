import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { handleReadiness } from "../functions/lib/readiness.js";
test("owner can distinguish configuration, DB reads and self-reported phone results without sending private data", async ({
  page,
}) => {
  const seen: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const db = {
    prepare: (sql: string) => {
      expect(sql).toBe("SELECT 1 AS ok");
      return { first: async () => ({ ok: 1 }) };
    },
  };
  const env = {
    RANK_DB: db,
    CROWD_DB: db,
    MEMBER_APP_MODE: "invite",
    COMMUNITY_MODE: "private",
    ANTHROPIC_API_KEY: "QA_NOT_A_REAL_SECRET",
    ASSETS: { fetch: async () => Response.json({ commit: "b".repeat(40) }) },
  };
  await page.route("**/*", async (route) => {
    const req = route.request();
    seen.push(req.url());
    if (new URL(req.url()).pathname !== "/_private/readiness")
      return route.abort();
    const out = await handleReadiness(new Request(req.url()), env);
    return route.fulfill({
      status: out.status,
      headers: Object.fromEntries(out.headers),
      body: await out.text(),
    });
  });
  await page.goto("/_private/readiness");
  await expect(
    page.getByRole("heading", { name: "운영 점검", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("설정 있음 · 실제 응답 미확인", { exact: true }),
  ).toHaveCount(2);
  await expect(page.locator("body")).not.toContainText("QA_NOT_A_REAL_SECRET");
  await page.getByRole("button", { name: "DB 연결 확인", exact: true }).click();
  await expect(page.locator("#database")).toContainText("AI 한도: 읽기 성공");
  await page
    .getByRole("button", { name: "기기 기능 확인", exact: true })
    .click();
  await expect(page.locator("#device-result")).toContainText(
    "실제 저장·공유·복원 성공은 직접 확인",
  );
  await page.locator('[data-manual="install"]').check();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "점검 결과 파일 받기", exact: true })
    .click();
  const file = await downloaded;
  const value = JSON.parse(await fs.readFile((await file.path())!, "utf8"));
  expect(value.manual.install).toBe("owner_reported");
  expect(value.manual.restore).toBe("not_checked");
  expect(value.server.ai.provider).toBe("not_checked");
  expect(value.device).not.toHaveProperty("userAgent");
  expect(
    seen.every((url) => new URL(url).origin === "http://127.0.0.1:8792"),
  ).toBe(true);
  expect(errors).toEqual([]);
});
