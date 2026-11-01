import { test, expect, type Page } from "@playwright/test";
import { covered, overflowX, rect, resizeTo } from "./adaptive-helpers";
import { serveCommunity, communityCall, otherPost } from "./community-fixture.mjs";
import { fileURLToPath } from "node:url";
// 다기기 대응(11-01) — 내용이 채워진 화면을 대표 창 크기(CSS px)에서 본다. 실기기 확인이 아니다.
// 격리 QA 자료만 쓴다: 상담은 화면 안의 가짜 AI(EOUL_SERVER_AI)로 답하고(유료 호출 0), 구매 기록은 이 브라우저
// 저장소의 합성 기록, 커뮤니티는 메모리 SQLite의 실제 처리기(community-fixture)다. 실제 회원·게시는 없다.
// ADAPTIVE_SHOTS=1이면 크기별 화면을 test-results/adaptive-evidence/에 남긴다(전후 비교용).
const SIZES = [
  ["폰", 390, 844], ["폰 가로", 844, 390], ["중간 세로", 690, 840], ["태블릿 세로", 820, 1180],
  ["태블릿 가로", 1180, 820], ["큰 태블릿 가로", 1366, 1024],
] as const;
const PHOTO = fileURLToPath(new URL("../public/examples/m-blazer.webp", import.meta.url));
const shot = async (page: Page, name: string) => {
  if (process.env.ADAPTIVE_SHOTS) await page.screenshot({ path: `test-results/adaptive-evidence/${name}.png` });
};
function local(page: Page) {
  return page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
}
const LONG = "니트가 네이비라 바지는 베이지·그레이·연청이 무난해요. 출근이면 그레이 슬랙스, 주말이면 연청 데님이 편해요. 신발은 흰 스니커즈나 브라운 로퍼가 어울리고, 겉옷은 베이지 트렌치나 네이비 블레이저를 얹으면 톤이 정리돼요. 가진 옷 중에는 내 니트와 인디고 데님 조합이 바로 입을 수 있어요.";

test("a long consult thread with a draft keeps the input clear of the bars and the last answer readable", async ({ page }) => {
  await local(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  const ids = ["ms-728000", "ms-1599217", "ms-1792946", "ms-389452"];
  await page.evaluate(({ LONG, ids }) => {
    const w = window as any;
    w.K.M.addGarment({ kind: "knit", slot: "m-knit", color: "navy", label: "내 니트", gender: "M" });
    let n = 0;
    w.EOUL_SERVER_AI = async () => ({ on_topic: true, answer: `${++n}. ${LONG}`, product_ids: ids.slice(0, 2 + (n % 3)) });
    w.K.tab("consult");
  }, { LONG, ids });
  const input = page.getByLabel("코디 질문", { exact: true });
  for (const q of ["네이비 니트에 어울리는 바지는?", "출근할 때는요? 너무 딱딱하지 않게", "주말에 입을 신발도 알려 줘요", "겉옷까지 맞추면?"]) {
    await input.fill(q);
    await input.press("Enter");
    await expect(page.locator(".msg.bot").last()).toContainText(LONG.slice(0, 12));
  }
  await input.fill("그럼 비 오는 날은 어떻게 입을까요");
  for (const [label, w, h] of SIZES) {
    await resizeTo(page, w, h);
    expect(await overflowX(page), label).toBeLessThanOrEqual(1);
    await expect(input).toHaveValue("그럼 비 오는 날은 어떻게 입을까요");
    const bar = await rect(page, ".chatbar");
    expect(bar.b, `${label} chat bar inside`).toBeLessThanOrEqual(h + 1);
    expect(bar.x, `${label} chat bar beside the menu`).toBeGreaterThanOrEqual(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--navL")) || 0) - 1);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = await rect(page, ".msg.bot >> nth=-1");
    expect(last.b, `${label} last answer above the chat bar`).toBeLessThanOrEqual(bar.y + 1);
    expect(await covered(page), label).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await shot(page, `consult-${w}x${h}`);
  }
});

test("many purchase records at every step stay readable with their step buttons reachable", async ({ page }) => {
  await local(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const M = (window as any).K.M;
    const ids = ["ms-728000", "ms-1599217", "ms-2098326", "ms-1792946", "ms-389452", "ms-5316168"];
    ids.forEach((id) => M.decide(id, "buy"));
    M.advance(ids[1], "ordered");
    M.advance(ids[2], "ordered"); M.advance(ids[2], "received");
    M.advance(ids[3], "ordered"); M.advance(ids[3], "received"); M.advance(ids[3], "kept");
    M.advance(ids[4], "ordered"); M.advance(ids[4], "received"); M.advance(ids[4], "returned", { reason: "size" });
    M.decide(M.readSearch("코트").products[1].id, "hold");
    (window as any).K.tab("records");
  });
  await expect(page.locator("[data-react-records]")).toHaveCount(1);
  for (const [label, w, h] of SIZES) {
    await resizeTo(page, w, h);
    expect(await overflowX(page), label).toBeLessThanOrEqual(1);
    expect(await covered(page), label).toEqual([]);
    const step = page.getByRole("button", { name: "주문했어요" }).first();
    await step.scrollIntoViewIfNeeded();
    const b = await step.boundingBox();
    expect(b!.x + b!.width, label).toBeLessThanOrEqual(w + 1);
    expect(Math.min(b!.width, b!.height), label).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `records-${w}x${h}`);
  }
});

test("community posts with photos, long titles and sale sources, and the editor, fit every window", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await serveCommunity(page, "private", {}, { member: "owner", operator: true }, { start: "/?photos=0#/community" });
  await expect(page.getByRole("heading", { name: "코디 공유", exact: true })).toBeVisible();
  await page.getByLabel("이름").fill("합성작성자");
  await page.getByRole("checkbox", { name: /규칙을 읽었고 따를게요/ }).check();
  await page.getByRole("checkbox", { name: /만 14세 이상이에요/ }).check();
  await page.getByRole("button", { name: "가입하기", exact: true }).click();
  // A photo post through the real editor, then synthetic posts from another member.
  await page.getByRole("button", { name: "코디 올리기" }).click();
  const dialog = page.getByRole("dialog", { name: "코디 올리기" });
  await dialog.locator('input[type="file"]').setInputFiles(PHOTO);
  await dialog.getByRole("checkbox", { name: /사진을 회원들에게 보여 주는 데 동의해요/ }).check();
  await dialog.getByRole("button", { name: "올리기", exact: true }).click();
  await expect(dialog).toBeHidden();
  await otherPost(f.env, "가을 출근룩 — 베이지 코트에 청바지, 흰 스니커즈로 가볍게 맞춰 봤어요. ".repeat(3));
  await communityCall(f.env, "posts", { post: { board: "sale", title: "아주 긴 제목의 합성 세일 제보: 네이비 울 블레이저 정가 대비 큰 폭 할인, 사이즈 M·L 남음, 오늘 자정까지", text: "합성 예시 글입니다. 실제 행사가 아니에요.", sale: { merchant: "예시 판매처 이름이 꽤 긴 편집숍", price: 129000, sourceUrl: "https://shop.example.com/deal/very/long/path/that/keeps/going" }, pieces: [], consent: false }, photos: [] }, f.who);
  await communityCall(f.env, "posts", { post: { board: "free", title: "긴 제목 자유글: 아메카지와 아메리칸 클래식 사이에서 옷장을 어떻게 채워야 할지 고민이에요", text: "줄바꿈 있는 본문\n둘째 줄\n셋째 줄", pieces: [], consent: false }, photos: [] }, f.who);
  const boards = page.getByRole("navigation", { name: "게시판", exact: true });
  for (const [label, w, h] of SIZES) {
    await resizeTo(page, w, h);
    for (const board of ["코디 공유", "세일 정보", "자유게시판"]) {
      await boards.getByRole("link", { name: board, exact: true }).click();
      await expect(page.locator("[data-community-post]").first()).toBeVisible();
      expect(await overflowX(page), `${label} ${board}`).toBeLessThanOrEqual(1);
      expect(await covered(page), `${label} ${board}`).toEqual([]);
      await shot(page, `community-${board === "코디 공유" ? "outfits" : board === "세일 정보" ? "sale" : "free"}-${w}x${h}`);
    }
    // The sale editor with a draft: inside the window, fields reachable, nothing sideways.
    await boards.getByRole("link", { name: "세일 정보", exact: true }).click();
    await page.getByRole("button", { name: "세일 제보하기", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "세일 제보하기", exact: true });
    await editor.getByLabel("제목", { exact: true }).fill("작성 중인 합성 제보");
    const box = await editor.boundingBox();
    expect(box!.x, label).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width, label).toBeLessThanOrEqual(w + 1);
    expect(await overflowX(page), `${label} editor`).toBeLessThanOrEqual(1);
    const post = editor.getByRole("button", { name: "올리기", exact: true });
    await post.scrollIntoViewIfNeeded();
    const pb = await post.boundingBox();
    expect(pb!.y + pb!.height, `${label} post button visible`).toBeLessThanOrEqual(h + 1);
    await shot(page, `community-editor-${w}x${h}`);
    await resizeTo(page, h > w ? h : w, h > w ? w : h);
    await expect(editor.getByLabel("제목", { exact: true })).toHaveValue("작성 중인 합성 제보");
    await resizeTo(page, w, h);
    // Closing a draft asks first (window.confirm); the synthetic draft is discarded.
    page.once("dialog", (d) => void d.accept());
    await editor.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(editor).toBeHidden();
  }
});

// 독립 커뮤니티 /c(공개 셸, 자체 shell.css)의 게시판 목록도 같은 창 크기에서 옆으로 넘치거나 고정 막대에 가리지 않는다.
// 11-01 마감 때 남은 범위로 적었던 검사다. 실제 처리기 + 메모리 SQLite 합성 자료만 쓴다(실제 회원·게시·사진 전송 0).
test("the standalone /c board lists with photos, long titles and sale sources fit every window", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await serveCommunity(page, "public", {
    MEMBER_SESSION_SECRET: "qa-only-".repeat(6), KAKAO_REST_KEY: "qa-not-a-live-key",
  }, { member: "qa-board-a", operator: false }, { start: "/c#/community?board=free", standalone: true });
  await page.getByLabel("이름").fill("합성작성자");
  await page.getByRole("checkbox", { name: /규칙을 읽었고 따를게요/ }).check();
  await page.getByRole("checkbox", { name: /만 14세 이상이에요/ }).check();
  await page.getByRole("button", { name: "가입하기", exact: true }).click();
  const boards = page.getByRole("navigation", { name: "게시판", exact: true });
  await boards.getByRole("link", { name: "코디 공유", exact: true }).click();
  await page.getByRole("button", { name: "코디 올리기" }).click();
  const dialog = page.getByRole("dialog", { name: "코디 올리기" });
  await dialog.locator('input[type="file"]').setInputFiles(PHOTO);
  await dialog.getByRole("checkbox", { name: /사진을 회원들에게 보여 주는 데 동의해요/ }).check();
  await dialog.getByRole("button", { name: "올리기", exact: true }).click();
  await expect(dialog).toBeHidden();
  await otherPost(f.env, "가을 출근룩 — 베이지 코트에 청바지, 흰 스니커즈로 가볍게 맞춰 봤어요. ".repeat(3));
  // Sale and free posts from the same synthetic member otherPost signed up (public mode posts need a member).
  const other = { member: "b", operator: false };
  await communityCall(f.env, "posts", { post: { board: "sale", title: "아주 긴 제목의 합성 세일 제보: 네이비 울 블레이저 정가 대비 큰 폭 할인, 사이즈 M·L 남음, 오늘 자정까지", text: "합성 예시 글입니다. 실제 행사가 아니에요.", sale: { merchant: "예시 판매처 이름이 꽤 긴 편집숍", price: 129000, sourceUrl: "https://shop.example.com/deal/very/long/path/that/keeps/going" }, pieces: [], consent: false }, photos: [] }, other);
  await communityCall(f.env, "posts", { post: { board: "free", title: "긴 제목 자유글: 아메카지와 아메리칸 클래식 사이에서 옷장을 어떻게 채워야 할지 고민이에요", text: "줄바꿈 있는 본문\n둘째 줄\n셋째 줄", pieces: [], consent: false }, photos: [] }, other);
  for (const [label, w, h] of SIZES) {
    await resizeTo(page, w, h);
    for (const board of ["코디 공유", "세일 정보", "자유게시판"]) {
      await boards.getByRole("link", { name: board, exact: true }).click();
      await expect(page.locator("[data-community-post]").first()).toBeVisible();
      expect(await overflowX(page), `/c ${label} ${board}`).toBeLessThanOrEqual(1);
      expect(await covered(page), `/c ${label} ${board}`).toEqual([]);
      await shot(page, `c-${board === "코디 공유" ? "outfits" : board === "세일 정보" ? "sale" : "free"}-${w}x${h}`);
    }
  }
});
