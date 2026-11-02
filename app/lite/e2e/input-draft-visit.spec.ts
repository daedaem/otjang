import { test, expect, type Page } from "@playwright/test";
// 입력 초안(11-01 밤): 로컬 전체 실행(빌드 15df5d5)에서 input.spec.ts B1이 한 번 "이어서 입력" 뒤 빈 1/3 화면으로 시간 초과됐다.
// 원인 재현: B1은 K.M만 기다리고 초안을 저장소에 넣는데, React 입력 화면이 그보다 늦게 마운트되면 마운트 때의 setStep(0)이
// persist로 빈 초안(step 0, 빈 값, 새 draftId)을 써서 넣은 초안을 덮었다. 그 빈 초안은 손대지 않은 방문에서도 저장돼 다음 방문에
// 내용 없는 "· 1/3단계 / 이어서 입력" 안내가 뜬다(vanilla 화면은 저장하지 않음). input-session.js의 "명시적 편집만 저장" 계약에 맞춘다.
// 합성 QA 자료만 쓴다. 저장 키·형식·이어서 입력 동작은 그대로다.
const KEY = "eoul-d12-hang:input-draft:v1";
const island = '[aria-label="직접 등록"], [aria-label="입력 초안 복원"]';

test("an untouched visit to the React registration screen stores no draft and offers no resume (as the vanilla screen)", async ({ page }) => {
  await page.goto("/?photos=0&input=react#/reg");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await expect(page.locator(island)).toHaveCount(1);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY), "no draft written for an untouched visit").toBeNull();
  await page.reload();
  await page.waitForFunction(() => !!(window as any).K?.M);
  await expect(page.locator('[aria-label="직접 등록"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "이어서 입력", exact: true })).toHaveCount(0);
});

// 11-02 PR #156 WebKit CI(run 41366652289, job 125028106248): 첫 확인 "the input screen has not mounted yet"이 0이 아니라 1을 받음.
// 입력 화면 JS를 800ms 늦춰도 page.goto(load 기다림)가 그보다 늦게 돌아오면 화면이 이미 마운트돼 있다. lateLoad는 load를 2초 늦춰 그 순서를 만든다.
async function lateLoadModel(page: Page) {
  await page.route("**/__late-load.png", async (r) => { await new Promise((x) => setTimeout(x, 2000)); return r.fulfill({ contentType: "image/png", body: Buffer.from(PNG, "base64") }); });
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const i = new Image(); i.hidden = true; i.src = "/__late-load.png"; document.body.append(i); }));
}
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function draftBeforeMount(page: Page, lateLoad: boolean) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (lateLoad) await lateLoadModel(page);
  // Hold the React input screen back so it mounts after the draft is written (the order seen in the failed B1 run).
  await page.route("**/react/input-*.js", async (r) => { await new Promise((x) => setTimeout(x, 800)); return r.continue(); });
  await page.goto("/?photos=0&input=react#/reg");
  await page.waitForFunction(() => !!(window as any).K?.M);
  expect(await page.locator(island).count(), "the input screen has not mounted yet").toBe(0);
  const draft = { v: 2, step: 2, updatedAt: "2026-10-25T00:00:00Z", values: { draftId: "draft-visit-e2e", brand: "합성 브랜드", name: "합성 옥스퍼드 셔츠", kind: "shirt", color: "white", url: "" } };
  await page.evaluate(({ k, d }) => localStorage.setItem(k, JSON.stringify(d)), { k: KEY, d: draft });
  await expect(page.locator(island)).toHaveCount(1);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  const kept = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!);
  expect(kept.values, "the saved draft is still the one written").toMatchObject({ draftId: "draft-visit-e2e", brand: "합성 브랜드", name: "합성 옥스퍼드 셔츠" });
  expect(kept.step).toBe(2);
  await page.unroute("**/react/input-*.js");
  await page.reload();
  await expect(page.locator('[aria-label="입력 초안 복원"] p')).toContainText("합성 브랜드 합성 옥스퍼드 셔츠 · 3/3단계");
  await page.getByRole("button", { name: "이어서 입력", exact: true }).click();
  await expect(page.getByRole("button", { name: "옷장에 넣기", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
}

test("a draft saved while the registration screen is still loading is not overwritten by its mount", async ({ page }) => draftBeforeMount(page, false));

test("model: the same holds when the page finishes loading after the held input screen (11-02 WebKit CI order)", async ({ page }) => draftBeforeMount(page, true));

test("typing on the React registration screen still keeps the draft (only the untouched visit stores nothing)", async ({ page }) => {
  await page.goto("/?photos=0&input=react#/reg");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await expect(page.locator('[aria-label="직접 등록"]')).toBeVisible();
  await page.getByLabel("브랜드", { exact: true }).fill("합성 브랜드");
  await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null")?.values?.brand, KEY)).toBe("합성 브랜드");
  await page.reload();
  await expect(page.locator('[aria-label="입력 초안 복원"] p')).toContainText("합성 브랜드");
  await page.getByRole("button", { name: "이어서 입력", exact: true }).click();
  await expect(page.getByLabel("브랜드", { exact: true })).toHaveValue("합성 브랜드");
});
