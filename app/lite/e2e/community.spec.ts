import { test, expect, type Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-ignore -- plain JS Worker module
import { handleCommunity } from "../functions/api/community.js";
// @ts-ignore -- plain JS Worker module
import { handleMemberAuth } from "../functions/lib/member-session.js";

// 코디 공유(대표 10-28 08:08 누구나 가입·직접 찍은 사진·코디 공유 먼저, 09:39 "끝까지").
// 브라우저의 /api/community/* 요청을 실제 Worker 처리기로 돌린다. DB는 메모리 SQLite(비용 0).
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  return {
    prepare(sql: string) {
      let args: any[] = [];
      const st: any = {
        bind(...a: any[]) { args = a; return st; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        execute() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
        async run() { return st.execute(); },
      };
      return st;
    },
    async batch(statements: any[]) {
      db.exec("BEGIN IMMEDIATE");
      try { const out = statements.map((s) => s.execute()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}
const PHOTO = fileURLToPath(new URL("../public/examples/m-blazer.webp", import.meta.url));
async function serve(page: Page, mode: string | undefined, extra: Record<string, string> = {}, who: any = { member: "owner", operator: true }) {
  const env: any = { CROWD_DB: fakeD1(), COMMUNITY_DB: fakeD1(), COMMUNITY_MODE: mode, COMMUNITY_CONTACT: "contact@example.test", COMMUNITY_OPERATOR: "운영자(예시)", ...extra };
  const posted: any[] = [];
  const mails: any[] = [];
  await page.route("**/*", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.origin !== "http://127.0.0.1:8792") return route.abort();
    if (u.pathname.startsWith("/_member/")) {
      const body = req.postDataBuffer();
      const res: Response = await handleMemberAuth(new Request(u.href, { method: req.method(), headers: { "content-type": "application/json", origin: u.origin }, body: body && req.method() !== "GET" ? body : undefined }), env, { fetchImpl: async (_url: string, init: any) => { mails.push(JSON.parse(init.body)); return Response.json({ id: "m" }); } });
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    }
    if (u.pathname.startsWith("/api/community/")) {
      const body = req.postDataBuffer();
      if (req.method() === "POST" && u.pathname.endsWith("/posts")) posted.push(JSON.parse(body!.toString()));
      const res: Response = await handleCommunity(new Request(u.href, { method: req.method(), headers: { "content-type": "application/json" }, body: body && req.method() !== "GET" ? body : undefined }), env, who);
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    }
    if (u.pathname.startsWith("/api/")) return route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"not_configured"}' });
    return route.continue();
  });
  await page.goto("/?photos=0#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  return { posted, env, mails };
}
// 다른 회원(b)의 글을 서버에 직접 넣는다. 화면 쪽 사용자는 owner다.
async function otherPost(env: any, text: string) {
  const call = (path: string, body: any) => handleCommunity(new Request(`https://x.test/api/community/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), env, { member: "b", operator: false });
  await call("join", { name: "비회원", rules: 1, age14: true });
  await call("posts", { post: { text, pieces: [{ kind: "coat", color: "beige", label: "베이지 코트" }, { kind: "jeans", color: "indigo", label: "청바지" }], consent: false }, photos: [] });
}
const go = (page: Page) => page.evaluate(() => (window as any).K.go("community", {}));
async function joinAs(page: Page, name = "대담") {
  await go(page);
  await expect(page.getByRole("heading", { name: "코디 공유" })).toBeVisible();
  await page.getByLabel("이름").fill(name);
  await page.getByRole("checkbox", { name: /규칙을 읽었고 따를게요/ }).check();
  await page.getByRole("checkbox", { name: /만 14세 이상이에요/ }).check();
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page.getByRole("button", { name: "코디 올리기" })).toBeVisible();
}

test("the outfits tab opens coordination sharing", async ({ page }) => {
  await serve(page, "private");
  await page.evaluate(() => (window as any).K.tab("looks"));
  await page.getByRole("button", { name: "코디 공유", exact: true }).click();
  await expect(page).toHaveURL(/#\/community$/);
  await expect(page.getByRole("heading", { name: "코디 공유" })).toBeVisible();
});

test("while the switch is off the page says sharing is not open and sends nothing", async ({ page }) => {
  const { posted } = await serve(page, undefined);
  await go(page);
  await expect(page.getByText("코디 공유는 아직 열지 않았어요")).toBeVisible();
  await expect(page.getByRole("button", { name: "코디 올리기" })).toHaveCount(0);
  expect(posted).toHaveLength(0);
});

test("public mode stays closed until member login exists", async ({ page }) => {
  await serve(page, "public");
  await go(page);
  await expect(page.getByText(/공개 준비가 끝나면 열어요/)).toBeVisible();
});

test("joining shows the rules first and needs a name and agreement", async ({ page }) => {
  await serve(page, "private");
  await go(page);
  await expect(page.getByText("직접 찍었거나 올려도 되는 사진만 올려 주세요.")).toBeVisible();
  const join = page.getByRole("button", { name: "가입하기" });
  await page.getByLabel("이름").fill("대담");
  await expect(join).toBeDisabled();
  await page.getByRole("checkbox", { name: /규칙을 읽었고 따를게요/ }).check();
  await expect(join).toBeDisabled();
  await page.getByRole("checkbox", { name: /만 14세 이상이에요/ }).check();
  await expect(join).toBeEnabled();
  await join.click();
  await expect(page.getByText("아직 올라온 코디가 없어요")).toBeVisible();
});

test("posting my own photo needs consent, sends a small JPEG and no closet ids, and shows in the feed", async ({ page }) => {
  const { posted } = await serve(page, "private");
  await joinAs(page);
  await page.getByRole("button", { name: "코디 올리기" }).click();
  const dialog = page.getByRole("dialog", { name: "코디 올리기" });
  await dialog.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(dialog.locator("[data-community-thumb]")).toHaveCount(1);
  await dialog.getByLabel("한마디").fill("가을 출근룩");
  await expect(dialog.getByText("보내지 않는 것")).toBeVisible();
  const send = dialog.getByRole("button", { name: "올리기", exact: true });
  await expect(send).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /사진을 회원들에게 보여 주는 데 동의해요/ }).check();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(dialog).toBeHidden();
  const card = page.locator("[data-community-post]").first();
  await expect(card).toContainText("가을 출근룩");
  await expect(card).toContainText("대담");
  const img = card.locator("img").first();
  await expect(img).toHaveAttribute("src", /\/api\/community\/photos\//);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  expect(posted).toHaveLength(1);
  const sent = posted[0];
  expect(Object.keys(sent).sort()).toEqual(["photos", "post"]);
  expect(Object.keys(sent.post).sort()).toEqual(["consent", "pieces", "text"]);
  const bytes = Buffer.from(sent.photos[0], "base64");
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
  expect(bytes.length).toBeLessThan(600 * 1024);
});

test("an outfit made with my clothes can be shared with its pieces filled in", async ({ page }) => {
  const { posted } = await serve(page, "private");
  await page.evaluate(() => {
    const m = (window as any).K.M;
    for (const [kind, slot, color, label] of [["shirt", "m-oxford", "white", "내 셔츠"], ["pants", "m-chino", "beige", "내 바지"], ["sneaker", "m-white-sneaker", "white", "내 신발"]])
      m.addGarment({ kind, slot, color, label });
  });
  await joinAs(page);
  await page.evaluate(() => (window as any).K.tab("looks"));
  const card = page.locator("[data-outfit-card]").first();
  await card.getByRole("button", { name: "이 코디 공유" }).click();
  const dialog = page.getByRole("dialog", { name: "코디 올리기" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-community-piece]")).not.toHaveCount(0);
  await dialog.getByRole("button", { name: "올리기", exact: true }).click();
  await expect(dialog).toBeHidden();
  const pieces = posted[0].post.pieces;
  expect(pieces.length).toBeGreaterThan(1);
  for (const p of pieces) expect(Object.keys(p).sort()).toEqual(["color", "kind", "label"]);
  expect(JSON.stringify(posted[0])).not.toMatch(/"(id|garmentId|photoId)"/);
});

test("I can report or block someone else's post and delete my own with a second tap", async ({ page }) => {
  const { env } = await serve(page, "private");
  await otherPost(env, "남의 글 하나");
  await otherPost(env, "남의 글 둘");
  await joinAs(page);
  const others = page.locator("[data-community-post]");
  await expect(others).toHaveCount(2);
  const first = others.filter({ hasText: "남의 글 둘" });
  await first.getByRole("button", { name: "신고" }).click();
  await first.getByLabel("신고 이유").selectOption("ad");
  await first.getByRole("button", { name: "신고하기" }).click();
  await expect(page.getByText(/신고했어요\. 운영자가 7일 안에 확인해요/)).toBeVisible();
  await expect(page.locator("[data-community-post]", { hasText: "남의 글 둘" })).toHaveCount(0);
  const second = page.locator("[data-community-post]", { hasText: "남의 글 하나" });
  await second.getByRole("button", { name: "이 회원 차단" }).click();
  await second.getByRole("button", { name: "한 번 더 누르면 차단해요" }).click();
  await expect(page.locator("[data-community-post]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /차단한 회원 1명/ })).toBeVisible();
  // 내 글: 신고·차단 없이 두 번 눌러 지운다.
  await page.getByRole("button", { name: "코디 올리기" }).click();
  const dialog = page.getByRole("dialog", { name: "코디 올리기" });
  await dialog.locator('input[type="file"]').setInputFiles(PHOTO);
  await dialog.getByLabel("한마디").fill("지울 글");
  await dialog.getByRole("checkbox", { name: /동의해요/ }).check();
  await dialog.getByRole("button", { name: "올리기", exact: true }).click();
  const mine = page.locator("[data-community-post]", { hasText: "지울 글" });
  await expect(mine.getByRole("button", { name: "신고" })).toHaveCount(0);
  await mine.getByRole("button", { name: "지우기" }).click();
  await mine.getByRole("button", { name: "한 번 더 누르면 지워져요" }).click();
  await expect(page.locator("[data-community-post]")).toHaveCount(0);
});

test("the new look keeps the community page achromatic with walnut only on hung things", async ({ page }) => {
  await serve(page, "private");
  await joinAs(page);
  const btn = page.getByRole("button", { name: "코디 올리기" });
  expect(await btn.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(32, 32, 37)");
});

test("the join screen shows the terms and privacy notice with the operator's name", async ({ page }) => {
  await serve(page, "private");
  await go(page);
  await page.getByRole("button", { name: "이용약관·개인정보처리방침" }).click();
  const terms = page.getByRole("dialog", { name: "이용약관·개인정보처리방침" });
  await expect(terms).toContainText("운영자(예시)");
  await expect(terms).toContainText("contact@example.test");
  await expect(terms).toContainText("만 14세 미만은 가입할 수 없어요");
  await expect(terms).toContainText("옷장 기록·메모·구매 링크");
  await terms.getByRole("button", { name: "닫기" }).click();
  await expect(terms).toBeHidden();
});

test("in public mode a visitor who is not signed in sees Kakao and Google sign-in", async ({ page }) => {
  await serve(page, "public", { MEMBER_SESSION_SECRET: "s".repeat(40), KAKAO_REST_KEY: "k", GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs" }, {});
  await go(page);
  await expect(page.getByRole("link", { name: "카카오로 시작하기" })).toHaveAttribute("href", "/_member/login/kakao");
  await expect(page.getByRole("link", { name: "구글로 시작하기" })).toHaveAttribute("href", "/_member/login/google");
  await expect(page.getByRole("button", { name: "가입하기" })).toHaveCount(0);
});

test("the public page /c is a standalone community shell without the app", async ({ page }) => {
  await serve(page, "private");
  await page.goto("/community-shell.html");
  await expect(page.getByRole("heading", { name: "코디 공유" })).toBeVisible();
  await expect(page.locator("#tabs")).toHaveCount(0);
  expect(await page.evaluate(() => typeof (window as any).K)).toBe("undefined");
});

test("in public mode I can ask for an email code and enter it", async ({ page }) => {
  const { mails } = await serve(page, "public", { MEMBER_SESSION_SECRET: "s".repeat(40), EMAIL_FROM: "no-reply@hangit.test", RESEND_API_KEY: "re_x" }, {});
  await go(page);
  await page.getByLabel("이메일").fill("me@example.com");
  await page.getByRole("button", { name: "인증 코드 받기" }).click();
  await expect(page.getByLabel("인증 코드")).toBeVisible();
  expect(mails).toHaveLength(1);
  const code = /(\d{6})/.exec(mails[0].text)![1];
  await page.getByLabel("인증 코드").fill(code);
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page.getByText(/로그인했어요/)).toBeVisible();
});
