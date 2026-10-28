import { test, expect, type Page } from "@playwright/test";
import { serveCommunity, communityCall, communityRequest } from "./community-fixture.mjs";

async function setup(page: Page, standalone = false, operator = false) {
  const who = { member: operator ? "owner" : "qa-board-a", operator };
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

test("leaving the public community returns to sign-in instead of an expired membership form", async ({ page }) => {
  await setup(page, true);
  await page.getByRole("button", { name: "커뮤니티 나가기", exact: true }).click();
  await page.getByRole("button", { name: "한 번 더 누르면 내 글·사진을 모두 지우고 나가요", exact: true }).click();
  await expect(page.getByRole("link", { name: "카카오 로그인", exact: true })).toBeVisible();
  await expect(page.getByLabel("이름", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "게시판", exact: true }).getByRole("link", { name: "자유게시판", exact: true })).toHaveAttribute("aria-current", "page");
});

test("the private owner keeps the authenticated join form after leaving a public community", async ({ page }) => {
  await setup(page, true, true);
  await page.getByRole("button", { name: "커뮤니티 나가기", exact: true }).click();
  await page.getByRole("button", { name: "한 번 더 누르면 내 글·사진을 모두 지우고 나가요", exact: true }).click();
  await expect(page.getByLabel("이름")).toBeVisible();
  await expect(page.getByRole("link", { name: "카카오 로그인", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "로그아웃", exact: true })).toBeVisible();
  const actualStatus = await page.evaluate(async () => (await fetch('/api/community/status')).json());
  expect(actualStatus).toMatchObject({ signedIn: true, isOperator: true, member: null });
});

test("a late community chunk does not steal focus from another footer control", async ({ page }) => {
  let release!: () => void, seen!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  const requested = new Promise<void>(resolve => seen = resolve);
  try {
    await serveCommunity(page, "private", {}, { member: "qa-focus", operator: false }, {
      start: "/?photos=0#/", communityChunkGate: () => { seen(); return gate; },
    });
    await expect(page.locator("#tabs[data-react-chrome]")).toBeVisible();
    await page.getByRole("button", { name: "커뮤니티", exact: true }).click();
    await requested;
    const other = page.getByRole("button", { name: "상담", exact: true });
    await other.focus();
    release();
    await expect(page.getByRole("heading", { name: "코디 공유", exact: true })).toBeVisible();
    await expect(other).toBeFocused();
  } finally { release?.(); }
});

test("an already open community follows same-document board and mine hashes without a fallback feed", async ({ page }) => {
  const f = await setup(page);
  await communityCall(f.env, "posts", { post: { board: "free", title: "내 직접 주소 글", text: "내용", pieces: [], consent: false }, photos: [] }, f.who);
  const b = { member: "qa-board-b", operator: false };
  await communityCall(f.env, "join", { name: "다른회원", rules: 1, age14: true }, b);
  await communityCall(f.env, "posts", { post: { board: "free", title: "다른 직접 주소 글", text: "내용", pieces: [], consent: false }, photos: [] }, b);
  await page.evaluate(() => { location.hash = "/community?board=free"; });
  await expect(page.locator("[data-community-post]")).toHaveCount(2);
  await page.evaluate(() => { location.hash = "/community?board=free&mine=1"; });
  await expect(page.getByRole("button", { name: "내 글", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-community-post]")).toHaveCount(1);
  await expect(page.locator("[data-community-post]")).toContainText("내 직접 주소 글");
  await page.goBack();
  await expect(page.locator("[data-community-post]")).toHaveCount(2);
  await page.goForward();
  await expect(page.locator("[data-community-post]")).toHaveCount(1);
  await page.evaluate(() => { location.hash = "/community?board=unsupported"; });
  await expect(page.getByRole("heading", { name: "게시판을 찾지 못했어요", exact: true })).toBeVisible();
  await expect(page.locator("[data-community-post]")).toHaveCount(0);
});

test("the outfits entry returns through board Back/Forward to the original outfits tab", async ({ page }) => {
  await serveCommunity(page, "private");
  await page.evaluate(() => (window as any).K.tab("looks"));
  await page.getByRole("button", { name: "코디 공유", exact: true }).click();
  await page.getByLabel("이름").fill("합성진입회원");
  await page.getByRole("checkbox", { name: /규칙을 읽었고 따를게요/ }).check();
  await page.getByRole("checkbox", { name: /만 14세 이상이에요/ }).check();
  await page.getByRole("button", { name: "가입하기", exact: true }).click();
  await page.getByRole("navigation", { name: "게시판", exact: true }).getByRole("link", { name: "세일 정보", exact: true }).click();
  await expect(page.getByRole("heading", { name: "세일 정보", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "코디 공유", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "세일 정보", exact: true })).toBeVisible();
  await page.goBack(); await expect(page.getByRole("heading", { name: "코디 공유", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator('#tabs [data-tab="looks"]')).toHaveAttribute("aria-current", "page");
});

test("edits keep typed text on failure or conflict and only a successful save changes stored text", async ({ page }) => {
  const f = await setup(page);
  const created = await communityCall(f.env, "posts", { post: { board: "free", title: "수정할 글", text: "처음 본문", pieces: [], consent: false }, photos: [] }, f.who);
  const { id } = await created.json();
  await page.getByRole("navigation", { name: "게시판", exact: true }).getByRole("link", { name: "자유게시판", exact: true }).click();
  const article = page.locator(`[data-community-post="${id}"]`);
  await article.getByRole("button", { name: "수정", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "자유게시판 글 수정", exact: true });
  const text = editor.getByLabel("내용", { exact: true });
  await text.fill("보존할 수정\n두번째 줄");
  let release!: () => void, seen!: () => void, failed = false;
  const gate = new Promise<void>(resolve => release = resolve), started = new Promise<void>(resolve => seen = resolve);
  await page.route("**/api/community/posts/*", async route => {
    if (route.request().method() === "PATCH" && !failed) {
      failed = true; seen(); await gate;
      return route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"error","message":"잠시 뒤에 다시 해 주세요."}' });
    }
    return route.fallback();
  });
  try {
    await editor.getByRole("button", { name: "수정 저장", exact: true }).click();
    await started;
    await expect(text).toBeDisabled();
    await expect(editor.getByRole("button", { name: "취소", exact: true })).toBeDisabled();
    release();
    await expect(editor.getByRole("alert")).toContainText("잠시 뒤");
    await expect(text).toHaveValue("보존할 수정\n두번째 줄");
    const before = await communityRequest(f.env, "GET", "feed?board=free", undefined, f.who);
    expect((await before.json()).items.find((p: any) => p.id === id).text).toBe("처음 본문");
    await editor.getByRole("button", { name: "수정 저장", exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect(await article.locator(".cm-text").textContent()).toBe("보존할 수정\n두번째 줄");
    await page.reload(); await expect(article).toBeVisible();
    expect(await article.locator(".cm-text").textContent()).toBe("보존할 수정\n두번째 줄");
    await article.getByRole("button", { name: "수정", exact: true }).click();
    await text.fill("내가 보관할 초안");
    expect((await communityRequest(f.env, "PATCH", "posts/" + id, { post: { board: "free", title: "다른 창 제목", text: "서버 최신 본문", pieces: [], consent: false }, revision: 2 }, f.who)).status).toBe(200);
    await editor.getByRole("button", { name: "수정 저장", exact: true }).click();
    await expect(editor.getByRole("alert")).toContainText("다른 창");
    await expect(text).toHaveValue("내가 보관할 초안");
    const latest = await communityRequest(f.env, "GET", "feed?board=free", undefined, f.who);
    expect((await latest.json()).items.find((p: any) => p.id === id).text).toBe("서버 최신 본문");
  } finally { release?.(); }
});

test("cancelled close and browser Back retain the draft and the editor traps keyboard focus", async ({ page }) => {
  await setup(page);
  await page.getByRole("navigation", { name: "게시판", exact: true }).getByRole("link", { name: "자유게시판", exact: true }).click();
  await page.getByRole("button", { name: "글쓰기", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "자유게시판 글쓰기", exact: true });
  await editor.getByLabel("제목", { exact: true }).fill("보관할 제목");
  await editor.getByLabel("내용", { exact: true }).fill("보관할 본문");
  page.once("dialog", dialog => dialog.dismiss());
  await editor.getByRole("button", { name: "취소", exact: true }).click();
  await expect(editor.getByLabel("내용", { exact: true })).toHaveValue("보관할 본문");
  page.once("dialog", dialog => dialog.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(/#\/community\?board=free$/);
  await expect(editor.getByLabel("제목", { exact: true })).toHaveValue("보관할 제목");
  await editor.getByRole("button", { name: "올리기", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(editor.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(editor.getByRole("button", { name: "올리기", exact: true })).toBeFocused();
  page.once("dialog", dialog => dialog.accept());
  await editor.getByRole("button", { name: "취소", exact: true }).click();
  await expect(editor).toHaveCount(0);
});

test("operator review shows a bodyless sale and only the operator can inspect queued photos", async ({ page, browser }) => {
  const op = { member: "owner", operator: true };
  const envReady = { MEMBER_SESSION_SECRET: "qa-only-".repeat(6), KAKAO_REST_KEY: "qa-not-a-live-key" };
  const f = await serveCommunity(page, "public", envReady, op, { start: "/?photos=0#/community" });
  await page.getByLabel("이름").fill("검토담당");
  await page.getByRole("checkbox", { name: /규칙을 읽었고 따를게요/ }).check();
  await page.getByRole("checkbox", { name: /만 14세 이상이에요/ }).check();
  await page.getByRole("button", { name: "가입하기", exact: true }).click();
  const author = { member: "qa-sale-author", operator: false };
  await communityCall(f.env, "join", { name: "합성제보자", rules: 1, age14: true }, author);
  const jpeg = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 2; c.getContext("2d")!.fillRect(0,0,2,2); return c.toDataURL("image/jpeg").split(",")[1]; });
  const created = await communityCall(f.env, "posts", { post: { board: "sale", title: "검토할 가격 제보", text: "", pieces: [], consent: true, sale: { merchant: "예시 판매처", price: 39000, discount: 30, sourceUrl: "https://shop.example.com/review", endDate: "2026-11-03" } }, photos: [jpeg] }, author);
  const { id } = await created.json();
  await communityCall(f.env, "reports", { post: id, reason: "rights" }, op);
  await communityCall(f.env, "review/" + id, { action: "hide" }, op);
  const queue = page.getByRole("region", { name: "신고·숨김 확인", exact: true });
  await queue.getByRole("button", { name: "신고 목록 새로고침", exact: true }).click();
  const row = queue.locator(`[data-community-review="${id}"]`);
  await expect(row).toContainText("세일 정보"); await expect(row).toContainText("검토할 가격 제보");
  await expect(row).toContainText("예시 판매처"); await expect(row).toContainText("39,000원");
  await expect(row).toContainText("30% 할인 제보"); await expect(row).toContainText("2026-11-03");
  await expect(row.getByRole("list", { name: "신고 이유", exact: true })).toContainText("허락 없이");
  await expect(row.getByRole("link", { name: "출처 보기", exact: true })).toHaveAttribute("href", "https://shop.example.com/review");
  await row.getByRole("button", { name: "사진 확인 1장", exact: true }).click();
  const image = row.getByRole("img", { name: "검토할 사진 1", exact: true });
  await expect(image).toHaveJSProperty("naturalWidth", 2);
  const imageUrl = await image.getAttribute("src");
  expect(imageUrl).toContain("?review=1");
  const secondContext = await browser.newContext({ viewport: page.viewportSize() || { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const other = await secondContext.newPage();
    await serveCommunity(other, "public", { ...f.env }, author, { start: "/c#/community?board=sale", standalone: true });
    await expect(other.locator(".cm-review")).toHaveCount(0);
    expect(await other.evaluate(async url => (await fetch(url!)).status, imageUrl)).toBe(403);
    await row.getByRole("button", { name: "지우기", exact: true }).click();
    await expect(row).toBeVisible();
    const notDeleted = await communityRequest(f.env, "GET", "review", undefined, op);
    expect((await notDeleted.json()).items).toHaveLength(1);
    await row.getByRole("button", { name: "한 번 더 누르면 글과 사진을 지워요", exact: true }).click();
    await expect(row).toHaveCount(0);
    expect((await communityRequest(f.env, "GET", imageUrl!.split('/api/community/')[1], undefined, op)).status).toBe(404);
    await other.reload();
    await expect(other.locator("[data-community-post]")).toHaveCount(0);
  } finally { await secondContext.close(); }
});
