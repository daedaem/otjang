import { test, expect, type Page } from "@playwright/test";
import { serveCommunity, communityCall } from "./community-fixture.mjs";

async function setup(page: Page, standalone = false) {
  const who = { member: "qa-board-a", operator: false };
  const f = await serveCommunity(page, standalone ? "public" : "private", standalone ? {
    MEMBER_SESSION_SECRET: "qa-only-".repeat(6), KAKAO_REST_KEY: "qa-not-a-live-key",
  } : {}, who, { start: standalone ? "/c#/community?board=free" : "/?photos=0#/community", standalone });
  await expect(page.getByRole("heading", { name: standalone ? "자유게시판" : "코디 공유", exact: true })).toBeVisible();
  await page.getByLabel("이름").fill("합성작성자");
  await page.getByRole("checkbox", { name: /규칙을 읽었고 따를게요/ }).check();
  await page.getByRole("checkbox", { name: /만 14세 이상이에요/ }).check();
  await page.getByRole("button", { name: "가입하기", exact: true }).click();
  return { ...f, who };
}

test("text-only free posts need no wardrobe and each board reads its actual feed", async ({ page }) => {
  const { posted } = await setup(page);
  const boards = page.getByRole("navigation", { name: "게시판", exact: true });
  await expect(boards.getByRole("link")).toHaveCount(3);
  await boards.getByRole("link", { name: "자유게시판", exact: true }).click();
  await expect(page).toHaveURL(/#\/community\?board=free$/);
  await expect(page.getByRole("heading", { name: "자유게시판", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "자유게시판 글쓰기", exact: true });
  await editor.getByLabel("제목", { exact: true }).fill("합성 셔츠 이야기");
  await editor.getByLabel("내용", { exact: true }).fill("첫 줄\n둘째 줄");
  await expect(editor.getByText("내 옷에서 고르기", { exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "올리기", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const article = page.locator("[data-community-post]").filter({ hasText: "합성 셔츠 이야기" });
  await expect(article).toBeVisible();
  expect(await article.locator(".cm-text").textContent()).toBe("첫 줄\n둘째 줄");
  expect(posted).toHaveLength(1);
  expect(posted[0].post).toMatchObject({ board: "free", title: "합성 셔츠 이야기", text: "첫 줄\n둘째 줄", pieces: [], consent: false });
  expect(posted[0].photos).toEqual([]);
  const storedText = await page.evaluate(async () => {
    const body = await (await fetch("/api/community/feed?board=free")).json();
    return body.items.find((p: any) => p.title === "합성 셔츠 이야기")?.text;
  });
  expect(storedText).toBe("첫 줄\n둘째 줄");
  await page.reload();
  await expect(article).toBeVisible();
  expect(await article.locator(".cm-text").textContent()).toBe("첫 줄\n둘째 줄");
  await boards.getByRole("link", { name: "코디 공유", exact: true }).click();
  await expect(page.locator("[data-community-post]")).toHaveCount(0);
  await boards.getByRole("link", { name: "자유게시판", exact: true }).click();
  await expect(page.locator("[data-community-post]")).toContainText("합성 셔츠 이야기");
});

test("sale facts and a source are explicit author fields, never copied from a private wardrobe", async ({ page }) => {
  const { posted } = await setup(page);
  const privateId = await page.evaluate(() => {
    const w = window as any;
    w.EOUL_UI_STORAGE.setItem("qa-private-link", "https://private.example.com/KEEP_PRIVATE");
    return w.K.M.addGarment({ kind: "shirt", color: "white", label: "KEEP_PRIVATE_LABEL" }).id;
  });
  const boardNavigation = page.getByRole("navigation", { name: "게시판", exact: true });
  await expect(boardNavigation).toBeVisible();
  await boardNavigation.getByRole("link", { name: "세일 정보", exact: true }).click();
  await page.getByRole("button", { name: "세일 제보하기", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "세일 제보하기", exact: true });
  await editor.getByLabel("제목", { exact: true }).fill("합성 할인 제보");
  await editor.getByLabel("판매처", { exact: true }).fill("예시 판매처");
  await editor.getByLabel("가격(원)", { exact: true }).fill("39000");
  await editor.getByLabel("출처 링크(선택)", { exact: true }).fill("https://shop.example.com/deal");
  await expect(editor.getByText("KEEP_PRIVATE_LABEL", { exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "올리기", exact: true }).click();
  const article = page.locator("[data-community-post]").filter({ hasText: "합성 할인 제보" });
  await expect(article).toContainText("39,000원");
  await expect(article).toContainText("작성자 제보");
  const source = article.getByRole("link", { name: "출처 보기", exact: true });
  await expect(source).toHaveAttribute("href", "https://shop.example.com/deal");
  await expect(source).toHaveAttribute("target", "_blank");
  await expect(source).toHaveAttribute("rel", /noreferrer/);
  expect(posted).toHaveLength(1);
  expect(posted[0].post).toMatchObject({ board: "sale", pieces: [], sale: { merchant: "예시 판매처", price: 39000, sourceUrl: "https://shop.example.com/deal" } });
  expect(JSON.stringify(posted)).not.toContain(privateId);
  expect(JSON.stringify(posted)).not.toContain("KEEP_PRIVATE");
});

test("direct board and mine addresses survive reload and browser Back/Forward", async ({ page }) => {
  const f = await setup(page);
  await communityCall(f.env, "posts", { post: { board: "free", title: "내 합성 글", text: "내용", pieces: [], consent: false }, photos: [] }, f.who);
  await page.goto("/?photos=0#/community?board=free&mine=1");
  await expect(page.getByRole("heading", { name: "자유게시판", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "내 글", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-community-post]")).toContainText("내 합성 글");
  await page.reload();
  await expect(page.locator("[data-community-post]")).toContainText("내 합성 글");
  await page.getByRole("navigation", { name: "게시판", exact: true }).getByRole("link", { name: "세일 정보", exact: true }).click();
  await expect(page.getByRole("heading", { name: "세일 정보", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "자유게시판", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "내 글", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goForward();
  await expect(page.getByRole("heading", { name: "세일 정보", exact: true })).toBeVisible();
});

test("the standalone community can open the free board without loading a private wardrobe", async ({ page }) => {
  const { posted } = await setup(page, true);
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "자유게시판 글쓰기", exact: true });
  await editor.getByLabel("제목", { exact: true }).fill("공개 셸 합성 글");
  await editor.getByLabel("내용", { exact: true }).fill("비공개 옷장은 읽지 않아요");
  await editor.getByRole("button", { name: "올리기", exact: true }).click();
  await expect(page.locator("[data-community-post]")).toContainText("공개 셸 합성 글");
  expect(posted[0].post.pieces).toEqual([]);
  expect(await page.evaluate(() => typeof (window as any).K)).toBe("undefined");
});
