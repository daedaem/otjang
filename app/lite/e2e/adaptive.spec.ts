import { test, expect, type Page } from "@playwright/test";
import { covered, overflowX, rect, resizeTo } from "./adaptive-helpers";
// 다기기 대응(2026-11-01 대표 "그럼 만들어줘야죠", Codex 전달): 대표 창 크기(CSS px) 시험이다.
// 실제 아이폰 듀오·폴드·플립·아이패드·갤럭시탭 기기 확인이 아니다(물리 픽셀을 환산하지 않는다).
// 단계: 휴대폰(<600) · 중간(600~899, 세로 태블릿·펼친 폴더블·분할 창) · 넓음(≥900) · 낮은 가로 창(높이 ≤500).
// 넓음과 낮은 가로 창에서는 하단 탭이 왼쪽 메뉴 줄(레일)이 된다.
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== "http://127.0.0.1:8792") return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
    return r.continue();
  });
});
const SIZES = [
  ["작은 폰", 320, 568], ["좁고 긴 폰", 344, 882], ["폰", 390, 844], ["큰 폰", 430, 932],
  ["폰 가로", 844, 390], ["작은 폰 가로", 667, 375],
  ["분할 창 1/2", 507, 820], ["중간 세로", 690, 840], ["태블릿 세로", 820, 1180], ["넓은 가로 창", 890, 626],
  ["태블릿 가로", 1180, 820], ["큰 태블릿 가로", 1366, 1024],
] as const;
const VIEWS = ["home", "results", "detail", "closet", "looks", "consult", "records", "community"] as const;
async function start(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/?photos=0#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => {
    const K = (window as any).K;
    K.M.addGarment({ kind: "knit", slot: "m-knit", color: "navy", label: "내 니트", gender: "M" });
    K.M.loadTrialCloset("M");
  });
}
async function open(page: Page, v: string) {
  await page.evaluate((v) => {
    const K = (window as any).K;
    if (v === "results") K.go("results", { q: "셔츠" });
    else if (v === "detail") K.go("detail", { id: K.M.readSearch("셔츠").products[0].id });
    else K.tab(v);
  }, v);
  await page.waitForFunction((v) => (window as any).K.current().view === (v === "detail" ? "detail" : v), v);
  // Wait until the screen's island has replaced its "…여는 중이에요" placeholder, then for the screen to settle.
  await page.waitForFunction(() => !/여는 중이에요/.test(document.getElementById("app")?.textContent || ""));
  await viewSettled(page);
}
// Hand the screen to the checks once it has settled: its entry animation (.view, 240ms translateY(8px) → none) has
// played out, then two frames. Positions read during the animation still carry part of the 8px shift (master 8d9d5d1
// CI: a reference card placed mid-animation ended 3px off).
async function viewSettled(page: Page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".view")).every((v) => v.getAnimations().every((a) => a.playState !== "running")));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
for (const [label, w, h] of SIZES)
  test(`${label} ${w}×${h}: every main screen fits, nothing hides under fixed bars, the menu is reachable`, async ({ page }) => {
    await start(page, w, h);
    for (const v of VIEWS) {
      await open(page, v);
      expect(await overflowX(page), `${v} sideways overflow`).toBeLessThanOrEqual(1);
      expect(await covered(page), `${v} controls under fixed bars`).toEqual([]);
      if (v !== "detail") {
        // All six menu buttons inside the window and at least 44px, read in one pass.
        const tabs = await page.locator("#tabs button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
        expect(tabs, `${v} menu`).toHaveLength(6);
        for (const r of tabs) {
          expect(r.x, `${v} tab inside`).toBeGreaterThanOrEqual(0);
          expect(r.right, `${v} tab inside`).toBeLessThanOrEqual(w + 1);
          expect(r.bottom, `${v} tab inside`).toBeLessThanOrEqual(h + 1);
          expect(Math.min(r.width, r.height), `${v} tab size`).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });

test("middle-width windows use the width instead of a 560px phone column", async ({ page }) => {
  for (const [w, h] of [[690, 840], [820, 1180]]) {
    await start(page, w, h);
    await open(page, "closet");
    const app = await rect(page, "#app");
    expect(app.w, `${w}px content`).toBeGreaterThanOrEqual(Math.min(w, 760) - 2);
    await open(page, "results");
    // Three product columns in the middle range.
    const tops = await page.locator("#grid [data-card]").evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(tops[0]).toBe(tops[2]);
    expect(tops[3]).toBeGreaterThan(tops[0]);
  }
});

for (const [label, w, h] of [["태블릿 가로", 1180, 820], ["폰 가로", 844, 390], ["작은 폰 가로", 667, 375]] as const)
  test(`${label}: the tabs become a side rail and the screen keeps its height`, async ({ page }) => {
    await start(page, w, h);
    await open(page, "closet");
    const tabs = await rect(page, "#tabs");
    expect(tabs.x).toBe(0);
    expect(tabs.w).toBeLessThanOrEqual(104);
    expect(tabs.h).toBeGreaterThanOrEqual(h - 1);
    const app = await rect(page, "#app");
    expect(app.x).toBeGreaterThanOrEqual(tabs.r);
    // The first tab sits near the top-left, labels stay readable.
    const first = await page.locator('#tabs [data-tab="home"]').boundingBox();
    expect(first!.y).toBeLessThan(h / 2);
    // Nothing is left at the bottom where the tab bar used to be.
    const bottom = await page.evaluate(() => document.elementFromPoint(innerWidth - 20, innerHeight - 10)?.closest("#tabs"));
    expect(bottom).toBeNull();
  });

test("wide closets show more columns and product pages lay out side by side from the middle range", async ({ page }) => {
  await start(page, 1180, 820);
  await open(page, "closet");
  const tops = await page.locator("[data-closet-section=trial] [data-rail-item]").evaluateAll((els) => els.slice(0, 6).map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops[0]).toBe(tops[4]);
  await resizeTo(page, 690, 840);
  await open(page, "detail");
  const head = await rect(page, ".pdp-head");
  const photo = await rect(page, ".pdp-photo");
  expect(head.x).toBeGreaterThanOrEqual(photo.r - 1);
  expect(head.y).toBeLessThan(840 / 2);
});

test("on wide screens a sheet opens as a centred window, not a bottom strip", async ({ page }) => {
  await start(page, 1180, 820);
  await open(page, "closet");
  await page.getByRole("button", { name: "더보기", exact: true }).first().click();
  await page.locator("[data-backup]").click();
  const sheet = await rect(page, ".sheet");
  expect(sheet.b).toBeLessThan(820 - 16);
  expect(sheet.y).toBeGreaterThan(16);
  expect(Math.abs(sheet.x + sheet.w / 2 - 1180 / 2)).toBeLessThan(60);
});

test.describe("keyboard", () => {
  // A stand-in for the on-screen keyboard: the visual viewport shrinks while the layout viewport stays.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const vv = new EventTarget() as any;
      vv.offsetTop = 0;
      vv.offsetLeft = 0;
      vv.scale = 1;
      Object.defineProperty(vv, "width", { get: () => innerWidth });
      Object.defineProperty(vv, "height", { get: () => innerHeight - ((window as any).__kb || 0) });
      Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
      (window as any).__setKb = (px: number) => {
        (window as any).__kb = px;
        vv.dispatchEvent(new Event("resize"));
      };
    });
  });
  test("bottom input bars rise above the keyboard and the tab bar steps aside", async ({ page }) => {
    await start(page, 390, 844);
    await open(page, "consult");
    const input = page.locator("[data-react-chatbar] input, .chatbar input").first();
    await input.click();
    await input.fill("베이지 니트에 어울리는 바지");
    await page.evaluate(() => (window as any).__setKb(336));
    await expect.poll(() => rect(page, ".chatbar").then((r) => r.b)).toBeLessThanOrEqual(844 - 336 + 1);
    await expect(page.locator("#tabs")).toBeHidden();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("베이지 니트에 어울리는 바지");
    await page.evaluate(() => (window as any).__setKb(0));
    await expect(page.locator("#tabs")).toBeVisible();
    await expect.poll(() => rect(page, ".chatbar").then((r) => r.b)).toBeGreaterThan(844 - 120);
  });
  test("a sheet stays inside the area above the keyboard", async ({ page }) => {
    await start(page, 390, 844);
    await open(page, "closet");
    await page.getByRole("button", { name: "더보기", exact: true }).first().click();
    await page.locator("[data-backup]").click();
    await page.evaluate(() => (window as any).__setKb(336));
    await page.waitForFunction(() => document.querySelector(".sheet")?.getAnimations().length === 0);
    await expect.poll(() => rect(page, ".sheet").then((r) => r.b)).toBeLessThanOrEqual(844 - 336 + 1);
    const s = await rect(page, ".sheet");
    expect(s.y).toBeGreaterThanOrEqual(0);
  });
});

test("unfolding, rotating and resizing keep typing, focus, picks and scroll", async ({ page }) => {
  await start(page, 390, 844);
  await open(page, "home");
  const ask = page.locator(".ask input, input[type=search]").first();
  await ask.click();
  await ask.fill("가을 아우터 20만원 이하");
  const steps = [[844, 390], [690, 840], [820, 1180], [1180, 820], [507, 820], [390, 844]];
  for (const [w, h] of steps) {
    await resizeTo(page, w, h);
    await expect(ask).toHaveValue("가을 아우터 20만원 이하");
    await expect(ask).toBeFocused();
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
  }
  await open(page, "closet");
  const pick = page.locator("[data-closet-section=trial] [data-pick]").nth(1);
  await pick.click();
  // A reference garment placed 200px below the top of the window (검토 11-01: a count and scrollY>0 would also
  // pass after a jump to the wrong place). It must stay on screen at every size and come back near the same spot.
  const item = page.locator("[data-closet-section=trial] [data-rail-item]").nth(5);
  const id = await item.getAttribute("data-rail-item");
  await item.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 200));
  // Let the scroll settle for a few frames, as a person would before turning the device.
  await page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 50)));
  const start0 = await item.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(start0 - 200)).toBeLessThanOrEqual(2);
  for (const [w, h] of steps) {
    await resizeTo(page, w, h);
    await expect(pick).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "고른 옷" })).toBeVisible();
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    const r = await page.locator(`[data-rail-item="${id}"]`).evaluate((el) => { const b = el.getBoundingClientRect(); return { t: b.top, b: b.bottom }; });
    expect(r.b, `${w}×${h} reference garment on screen`).toBeGreaterThan(0);
    expect(r.t, `${w}×${h} reference garment on screen`).toBeLessThan(h);
  }
  // Back at the first size the reference garment is close to where it was (layout may shift it a little).
  const end0 = await page.locator(`[data-rail-item="${id}"]`).evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(end0 - start0), "reference garment back near its place").toBeLessThanOrEqual(48);
});

// 휴대폰 브라우저는 스크롤하는 동안 주소창이 접히고 펴지며 창 높이만 바뀐다(폭 같음). 그때 스크롤 위치를 되돌리면
// 내리던 화면을 도로 끌어올리게 된다(추정 위험, 11-01). 높이만 바뀌는 크기 변화에서는 스크롤을 건드리지 않고,
// 사이에 한 스크롤도 기준으로 기억한다.
test("a height-only change while scrolling (an address bar folding) does not pull the page back", async ({ page }) => {
  await start(page, 390, 844);
  await open(page, "results");
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 50)));
  await resizeTo(page, 390, 780);
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(600);
  // Far from the end, so the browser has no reason to move the page itself when the window grows back.
  expect(y + 844).toBeLessThan(await page.evaluate(() => document.documentElement.scrollHeight) - 100);
  await resizeTo(page, 390, 844);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - y), "scroll stays where the person left it").toBeLessThanOrEqual(2);
});

// master 8d9d5d1 push CI(run 41301808374)에서 아래 높이 전환 검사의 준비(결과 8번째 칸을 위 150px에 두기)가 3px 어긋났다.
// 진단(브랜치 claude/rail-diag-20261101, CI Chromium): 스크롤 직후와 준비 측정 사이에 layout-shift·DOM 변경 없이 칸만 1px쯤
// 올라갔다(149.9 → 148.8 등) — 변환(transform)만 바뀐 것으로, 화면 진입 애니메이션(.view, 240ms ease-out, translateY(8px)→없음)이
// 아직 도는 중에 스크롤 위치를 잡았기 때문으로 본다. 여기서는 같은 실제 애니메이션을 처음부터 1/4 속도로 다시 돌려(CI처럼 검사
// 진행에 비해 애니메이션이 늦게 끝나는 경우) viewSettled() 뒤 같은 준비를 한다. 준비는 애니메이션이 끝난 화면에서 해야 한다.
test("the reference position is prepared only after the screen's entry animation has finished", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page, 690, 600);
  await open(page, "results");
  const restarted = await page.evaluate(() => {
    const view = document.querySelector<HTMLElement>(".view")!;
    const a = view.getAnimations()[0] as CSSAnimation;
    a.currentTime = 0;
    a.playbackRate = 0.25;
    a.play();
    return `${a.animationName} ${a.playState} ${Math.round(Number(a.currentTime))}`;
  });
  expect(restarted, "the real entry animation runs again from the start").toMatch(/^in running ([0-9]|1[0-9])$/);
  await viewSettled(page);
  const card = page.locator("[data-react-results] [data-card]").nth(7);
  const id = await card.getAttribute("data-card");
  const atScroll = await card.evaluate((el) => { const a = document.querySelector(".view")!.getAnimations()[0]; const t = Math.round(Number(a?.currentTime)); window.scrollBy(0, el.getBoundingClientRect().top - 150); return t; });
  // Read where the card ends up once the animation has played out.
  await page.waitForFunction(() => document.querySelector(".view")!.getAnimations().every((a) => a.playState !== "running"));
  const top = await page.locator(`[data-react-results] [data-card="${id}"]`).evaluate((el) => Math.round(el.getBoundingClientRect().top));
  expect(errors).toEqual([]);
  expect(Math.abs(top - 150), `reference card where it was placed (animation at ${atScroll}ms when placed)`).toBeLessThanOrEqual(2);
});

// Codex #149 검토: 중간 폭 창의 높이가 500px을 넘나들면(예: 690×600 ↔ 690×480) 폭은 같아도 왼쪽 메뉴 줄이 생기고
// 사라져 본문 폭·상품 칸 높이가 바뀐다. 높이만 바뀐 변화라도 배치 단계가 바뀌면 읽던 위치를 되돌린다.
// Chromium은 스스로 위치를 지키므로(CSS scroll anchoring) 꺼서, viewport.js만으로 되돌리는지 본다(WebKit처럼).
test("a height change that switches the layout (the short-window menu rail) keeps the reading position", async ({ page }) => {
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style");
    st.textContent = "html, body { overflow-anchor: none; }";
    document.head.append(st);
  }));
  await start(page, 690, 600);
  await open(page, "results");
  const card = page.locator("[data-react-results] [data-card]").nth(7);
  const id = await card.getAttribute("data-card");
  await card.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 150));
  await page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 50)));
  const at = () => page.locator(`[data-react-results] [data-card="${id}"]`).evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const before = await at();
  expect(Math.abs(before - 150)).toBeLessThanOrEqual(2);
  await resizeTo(page, 690, 480);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--navL").trim()), "menu rail on").not.toBe("0px");
  expect(Math.abs((await at()) - before), "690×480 reference card kept in place").toBeLessThanOrEqual(48);
  await resizeTo(page, 690, 600);
  expect(Math.abs((await at()) - before), "back at 690×600").toBeLessThanOrEqual(48);
});

// WebKit CI(#149 2188b88, push·PR 두 실행)에서는 위 검사가 고친 뒤에도 같은 78px로 실패했다. 추정(로컬 WebKit 없음):
// WebKit은 resize 이벤트 처리 중 matchMedia(...).matches가 아직 이전 값이라(미디어 조건은 resize 다음 단계에서 다시
// 평가) viewport.js가 단계 변화를 못 봤다. 여기서는 그 조건의 matches를 다음 프레임까지 이전 값으로 두는 모형으로
// Chromium에서 같은 상황을 만든다. 모형은 진짜 MediaQueryList를 감싼 보통 객체다(첫 판은 Object.assign이 getter를
// 옮기지 못해 matches를 읽을 때 예외가 났다 — 검토 11-01). 모형이 예외 없이 "resize 중 이전 값 → 다음 프레임 새 값"으로
// 바뀌는지도 같이 본다.
test("the layout switch is seen even when matchMedia still reports the old value during resize (as WebKit)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "html, body { overflow-anchor: none; }";
      document.head.append(st);
    });
    const real = window.matchMedia.bind(window);
    window.matchMedia = ((q: string) => {
      const mql = real(q);
      if (!/max-height:\s*500px/.test(q)) return mql;
      let seen = mql.matches;
      const next = () => { seen = mql.matches; requestAnimationFrame(next); };
      requestAnimationFrame(next);
      return {
        get matches() { return seen; },
        get media() { return mql.media; },
        get onchange() { return mql.onchange; },
        set onchange(v) { mql.onchange = v; },
        addEventListener: mql.addEventListener.bind(mql),
        removeEventListener: mql.removeEventListener.bind(mql),
        addListener: mql.addListener.bind(mql),
        removeListener: mql.removeListener.bind(mql),
        dispatchEvent: mql.dispatchEvent.bind(mql),
      } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
    // Record what the model reports inside the resize event and one frame later.
    const probe = window.matchMedia("(min-width: 600px) and (max-height: 500px)");
    const log: string[] = ((window as any).__mqLog = []);
    addEventListener("resize", () => {
      log.push(`resize ${innerWidth}x${innerHeight} model=${probe.matches}`);
      requestAnimationFrame(() => log.push(`frame model=${probe.matches}`));
    });
  });
  await start(page, 690, 600);
  await open(page, "results");
  const card = page.locator("[data-react-results] [data-card]").nth(7);
  const id = await card.getAttribute("data-card");
  await card.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 150));
  await page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 50)));
  const at = () => page.locator(`[data-react-results] [data-card="${id}"]`).evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const before = await at();
  await resizeTo(page, 690, 480);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // The model behaves as intended: old value inside the resize event, new value a frame later.
  expect(await page.evaluate(() => (window as any).__mqLog.slice(-2))).toEqual(["resize 690x480 model=false", "frame model=true"]);
  expect(errors, "no page errors (the model must not break the page or viewport.js)").toEqual([]);
  expect(await page.evaluate(() => !!(window as any).EOUL_VIEWPORT), "viewport.js ran").toBe(true);
  expect(Math.abs((await at()) - before), "690×480 reference card kept in place").toBeLessThanOrEqual(48);
  await resizeTo(page, 690, 600);
  expect(Math.abs((await at()) - before), "back at 690×600").toBeLessThanOrEqual(48);
  expect(errors).toEqual([]);
});

// 같은 검토의 예외 유지: 안드로이드 키보드(resizes-content)처럼 입력 중에 높이만 줄어 짧은 창 단계로 넘어가도
// (예: 690×800 → 690×420, 메뉴 줄이 켜짐) 키보드 때문이므로 스크롤을 되돌리지 않는다(입력칸을 키보드 뒤로 밀지 않게).
test("a keyboard that shrinks the window into the short-window layout while typing does not move the page", async ({ page }) => {
  // As above, without Chromium's own scroll anchoring, so any movement would come from viewport.js.
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style");
    st.textContent = "html, body { overflow-anchor: none; }";
    document.head.append(st);
  }));
  await start(page, 690, 800);
  await page.evaluate(() => {
    const w = window as any;
    let n = 0;
    w.EOUL_SERVER_AI = async () => ({ on_topic: true, answer: `${++n}. 네이비 니트에는 베이지·그레이·연청 바지가 무난해요. `.repeat(14), product_ids: ["ms-728000", "ms-1599217", "ms-1792946", "ms-389452"] });
    w.K.tab("consult");
  });
  const input = page.getByLabel("코디 질문", { exact: true });
  const asks = ["바지는?", "신발은?", "겉옷은?", "가방은?"];
  for (const q of asks) {
    await input.fill(q);
    await input.press("Enter");
    await expect(page.locator(".msg.bot")).toHaveCount(asks.indexOf(q) + 1);
  }
  await input.fill("비 오는 날은");
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 50)));
  await expect(input).toBeFocused();
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(200);
  await resizeTo(page, 690, 420);
  expect(await page.evaluate(() => matchMedia("(min-width: 600px) and (max-height: 500px)").matches), "short-window layout").toBe(true);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - y), "page not moved while typing").toBeLessThanOrEqual(2);
  await expect(input).toHaveValue("비 오는 날은");
});

// 같은 예외가 창 폭을 바꾼 직후(viewport.js가 위치를 되돌린 뒤 0.5초 안)에도 지켜지는지(검토 11-01: 아래 막대 크기
// 변화로 다시 재는 쪽의 위치 되돌림은 resize 쪽 키보드 예외와 따로 돈다).
test("right after a window change, a keyboard that shrinks the window while typing still does not move the page", async ({ page }) => {
  // As above, without Chromium's own scroll anchoring, so any movement would come from viewport.js.
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style");
    st.textContent = "html, body { overflow-anchor: none; }";
    document.head.append(st);
  }));
  await start(page, 820, 800);
  await page.evaluate(() => {
    const w = window as any;
    let n = 0;
    w.EOUL_SERVER_AI = async () => ({ on_topic: true, answer: `${++n}. 네이비 니트에는 베이지·그레이·연청 바지가 무난해요. `.repeat(14), product_ids: ["ms-728000", "ms-1599217", "ms-1792946", "ms-389452"] });
    w.K.tab("consult");
  });
  const input = page.getByLabel("코디 질문", { exact: true });
  const asks = ["바지는?", "신발은?", "겉옷은?", "가방은?"];
  for (const q of asks) {
    await input.fill(q);
    await input.press("Enter");
    await expect(page.locator(".msg.bot")).toHaveCount(asks.indexOf(q) + 1);
  }
  await input.fill("비 오는 날은");
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 50)));
  // A width change first (820 → 690): its position restore keeps a 0.5s window open in viewport.js, and the
  // keyboard opens inside it (검토 11-01: the bar-size re-measure must not restore the position while typing).
  await resizeTo(page, 690, 800);
  await expect(input).toBeFocused();
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(200);
  await resizeTo(page, 690, 420);
  expect(await page.evaluate(() => matchMedia("(min-width: 600px) and (max-height: 500px)").matches), "short-window layout").toBe(true);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - y), "page not moved while typing").toBeLessThanOrEqual(2);
  await expect(input).toHaveValue("비 오는 날은");
});

// 검토(11-01): 높이 320px 안팎의 짧은 가로·분할 창에서도 메뉴 줄의 마지막 '기록'까지 가리거나 잘리지 않는다.
for (const [w, h] of [[640, 320], [960, 320], [700, 280]] as const)
  test(`${w}×${h}: every rail item down to 기록 is fully reachable in a short window`, async ({ page }) => {
    await start(page, w, h);
    await open(page, "closet");
    const last = page.locator('#tabs [data-tab="records"]');
    await last.scrollIntoViewIfNeeded();
    const b = (await last.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height, "기록 not cut off").toBeLessThanOrEqual(h + 0.5);
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
    const hit = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-tab="records"]'), { x: b.x + b.width / 2, y: b.y + b.height / 2 });
    expect(hit, "기록 not covered").toBe(true);
    await last.click();
    await expect.poll(() => page.evaluate(() => (window as any).K.current().view)).toBe("records");
  });

// Codex 검토(#147) 3건: 메뉴 줄 옆 걸린 옷 띠의 폭, 넓은 화면 시트와 키보드, 아주 넓은 화면의 옷장 시트 여백.
for (const [w, h] of [[1180, 820], [844, 390]] as const)
  test(`${w}×${h}: the hung strip fits beside the side rail`, async ({ page }) => {
    await start(page, w, h);
    await page.evaluate(() => (window as any).K.go("results", { q: "셔츠" }));
    await page.locator("#grid .card .hangt").first().click();
    const strip = page.locator(".strip").first();
    await expect(strip).toBeVisible();
    // The strip slides up when it appears (.pop, 320ms); measure once it has settled.
    // CI caught the end of that slide (the end of the strip 8–27px below the window) on slower runners.
    await page.waitForFunction(() => document.querySelector(".strip")!.getAnimations({ subtree: true }).every((a) => a.playState !== "running"));
    const r = await rect(page, ".strip");
    const tabs = await rect(page, "#tabs");
    expect(r.x).toBeGreaterThanOrEqual(tabs.r - 1);
    expect(r.r).toBeLessThanOrEqual(w + 1);
    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    // The strip's "옷장 >" end sits fully inside the window, compared by its box with half-pixel slack.
    const go = await rect(page, ".strip .go");
    expect(go.r, "strip end inside").toBeLessThanOrEqual(w + 0.5);
    expect(go.b, "strip end inside").toBeLessThanOrEqual(h + 0.5);
    expect(go.x).toBeGreaterThanOrEqual(r.x);
  });

test.describe("keyboard on a wide screen", () => {
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
  test("a centred sheet moves into the area above the keyboard instead of past the top", async ({ page }) => {
    await start(page, 1180, 820);
    await open(page, "closet");
    await page.getByRole("button", { name: "더보기", exact: true }).first().click();
    await page.locator("[data-backup]").click();
    await page.evaluate(() => (window as any).__setKb(336));
    await page.waitForFunction(() => document.querySelector(".sheet")?.getAnimations().length === 0);
    await expect.poll(() => rect(page, ".sheet").then((r) => r.b)).toBeLessThanOrEqual(820 - 336 + 1);
    expect((await rect(page, ".sheet")).y).toBeGreaterThanOrEqual(0);
  });
  // iOS can push the visible area down while typing (offsetTop): the sheet stays inside offsetTop..offsetTop+height.
  test("with the visible area pushed down 100px the sheet stays inside the visible band", async ({ page }) => {
    await start(page, 1180, 820);
    await open(page, "closet");
    await page.getByRole("button", { name: "더보기", exact: true }).first().click();
    await page.locator("[data-backup]").click();
    await page.evaluate(() => (window as any).__setKb(336, 100));
    await page.waitForFunction(() => document.querySelector(".sheet")?.getAnimations().length === 0);
    await expect.poll(() => rect(page, ".sheet").then((r) => r.b)).toBeLessThanOrEqual(100 + 820 - 336 + 1);
    expect((await rect(page, ".sheet")).y).toBeGreaterThanOrEqual(100 - 0.5);
  });
});

test("on a very wide window the picked-clothes sheet still leaves room for the last closet row", async ({ page }) => {
  await start(page, 1920, 1000);
  await open(page, "closet");
  await page.locator("[data-closet-section=trial] [data-pick]").first().click();
  const sheet = page.getByRole("region", { name: "고른 옷" });
  await expect(sheet).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const top = (await sheet.boundingBox())!.y;
  // The end of the closet content (whatever column it sits in) stops above the sheet.
  const end = () => page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); return Math.max(...[...document.querySelectorAll<HTMLElement>("#app *")].filter((e) => e.offsetParent && e.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })).map((e) => e.getBoundingClientRect().bottom)); });
  await expect.poll(end, { timeout: 3000 }).toBeLessThanOrEqual(top + 1);
  expect(await covered(page)).toEqual([]);
});
