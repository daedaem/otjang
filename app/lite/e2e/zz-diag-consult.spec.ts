import { test, expect, type Page } from "@playwright/test";
import { overflowX, rect, resizeTo, covered } from "./adaptive-helpers";
// 진단 전용(병합하지 않음, 브랜치 claude/consult-diag-20261101). 긴 상담 검사를 예전처럼 한 번에 재고, 크기마다 첫 측정과
// 50·200·500ms 뒤 측정, 그 사이 사건(resize·visualViewport·scroll·DOM 변경·미디어 조건·초점·스크롤 호출)을 남긴다.
// 결과를 annotation으로 받으려고 항상 실패로 끝낸다.
const SIZES = [["폰", 390, 844], ["폰 가로", 844, 390], ["중간 세로", 690, 840], ["태블릿 세로", 820, 1180], ["태블릿 가로", 1180, 820], ["큰 태블릿 가로", 1366, 1024]] as const;
const LONG = "니트가 네이비라 바지는 베이지·그레이·연청이 무난해요. 출근이면 그레이 슬랙스, 주말이면 연청 데님이 편해요. 신발은 흰 스니커즈나 브라운 로퍼가 어울리고, 겉옷은 베이지 트렌치나 네이비 블레이저를 얹으면 톤이 정리돼요. 가진 옷 중에는 내 니트와 인디고 데님 조합이 바로 입을 수 있어요.";
const snap = (page: Page) => page.evaluate(() => {
  const root = document.documentElement, app = document.getElementById("app")!;
  const bar = document.querySelector(".chatbar")!.getBoundingClientRect();
  const msgs = document.querySelectorAll(".msg.bot"), last = msgs[msgs.length - 1].getBoundingClientRect();
  const vv = window.visualViewport;
  return `t${Math.round(performance.now())} last${Math.round(last.bottom)} bar${Math.round(bar.top)} sy${Math.round(scrollY)}/max${root.scrollHeight - innerHeight} sh${root.scrollHeight} win${innerWidth}x${innerHeight} vv${vv ? Math.round(vv.width) + "x" + Math.round(vv.height) + "@" + Math.round(vv.offsetTop) : "-"} cb${getComputedStyle(root).getPropertyValue("--chrome-b").trim() || "-"} kb${root.hasAttribute("data-kb") ? 1 : 0} pb${getComputedStyle(app).paddingBottom} nav${getComputedStyle(root).getPropertyValue("--navL").trim()} tabs${getComputedStyle(document.getElementById("tabs")!).display} appB${Math.round(app.getBoundingClientRect().bottom)} act${document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName}`;
});
for (let rep = 0; rep < 12; rep++)
  test(`diag consult ${rep}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const g = window as any;
      g.__ev = [];
      const log = (s: string) => g.__ev.push(`${Math.round(performance.now())} ${s}`);
      g.__log = log;
      const lay = () => {
        const r = document.documentElement, b = document.querySelector(".chatbar")?.getBoundingClientRect();
        return `cb${getComputedStyle(r).getPropertyValue("--chrome-b").trim() || "-"} bar${b ? Math.round(b.top) : "-"} nav${getComputedStyle(r).getPropertyValue("--navL").trim()} kb${r.hasAttribute("data-kb") ? 1 : 0} sy${Math.round(scrollY)}/${r.scrollHeight - innerHeight}`;
      };
      addEventListener("resize", () => {
        log(`RESIZE ${innerWidth}x${innerHeight} vv${visualViewport ? Math.round(visualViewport.width) + "x" + Math.round(visualViewport.height) : "-"} ${lay()}`);
        let i = 0;
        const f = () => { log(`  frame${i} ${lay()}`); if (++i < 6) requestAnimationFrame(f); };
        requestAnimationFrame(f);
      }, true);
      document.addEventListener("DOMContentLoaded", () => {
        new MutationObserver(() => log(`root-attr ${lay()}`)).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-kb", "data-chrome"] });
      });
      visualViewport?.addEventListener("resize", () => log(`vvresize ${Math.round(visualViewport!.width)}x${Math.round(visualViewport!.height)}@${Math.round(visualViewport!.offsetTop)}`));
      visualViewport?.addEventListener("scroll", () => log(`vvscroll @${Math.round(visualViewport!.offsetTop)}`));
      addEventListener("scroll", () => log(`scroll sy${Math.round(scrollY)} sh${document.documentElement.scrollHeight} ih${innerHeight}`), { passive: true, capture: true });
      addEventListener("focusin", (e) => log(`focusin ${(e.target as HTMLElement).tagName}`), true);
      addEventListener("focusout", (e) => log(`focusout ${(e.target as HTMLElement).tagName}`), true);
      for (const q of ["(min-width: 600px)", "(min-width: 900px)", "(min-width: 600px) and (max-height: 500px)"]) {
        const m = matchMedia(q);
        m.addEventListener("change", () => log(`mq ${q} ${m.matches}`));
      }
      document.addEventListener("DOMContentLoaded", () => {
        new MutationObserver((ms) => {
          let c = 0, a = 0;
          const names = new Set<string>();
          for (const m of ms) { if (m.type === "childList") c++; else { a++; names.add(m.attributeName || ""); } }
          log(`mut c${c} a${a}[${[...names].join(",")}] sh${document.documentElement.scrollHeight} sy${Math.round(scrollY)}`);
        }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden"] });
      });
      for (const name of ["scrollBy", "scrollTo"] as const) {
        const orig = (window as any)[name].bind(window);
        (window as any)[name] = (...a: any[]) => {
          const at = (new Error().stack || "").split("\n").slice(2, 3).join("").trim().slice(0, 90);
          const r = orig(...a);
          log(`${name}(${JSON.stringify(a)}) → sy${Math.round(scrollY)} ${at}`);
          return r;
        };
      }
      const siv = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element, ...a: any[]) { log(`scrollIntoView ${this.tagName}.${(this as HTMLElement).className}`); return siv.apply(this, a as any); };
    });
    await page.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.protocol === "blob:") return r.continue();
      if (u.origin !== "http://127.0.0.1:8792") return r.abort();
      if (u.pathname.startsWith("/api/")) return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) });
      return r.continue();
    });
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
    const lines: string[] = [];
    let bad = "";
    for (const [label, w, h] of SIZES) {
      await page.evaluate((s) => (window as any).__log(`=== step ${s}`), `${w}x${h}`);
      await resizeTo(page, w, h);
      await page.evaluate(() => (window as any).__log("--- resizeTo done"));
      expect(await overflowX(page), label).toBeLessThanOrEqual(1);
      await expect(input).toHaveValue("그럼 비 오는 날은 어떻게 입을까요");
      const bar = await rect(page, ".chatbar");
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const s0 = await snap(page);
      const lastB = await page.evaluate(() => { const m = document.querySelectorAll(".msg.bot"); return m[m.length - 1].getBoundingClientRect().bottom; });
      await page.waitForTimeout(50); const s1 = await snap(page);
      await page.waitForTimeout(150); const s2 = await snap(page);
      await page.waitForTimeout(300); const s3 = await snap(page);
      const v = lastB > bar.y + 1;
      lines.push(`${w}x${h}${v ? " VIOLATION" : ""} barY${Math.round(bar.y)}\n  s0 ${s0}\n  s1 ${s1}\n  s2 ${s2}\n  s3 ${s3}`);
      if (v && !bad) bad = `${w}x${h}`;
      await page.evaluate(() => (window as any).__log("--- measured"));
      await covered(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    }
    const ev: string[] = await page.evaluate(() => (window as any).__ev);
    const from = ev.findIndex((e) => e.includes("=== step 844x390"));
    const to = ev.findIndex((e) => e.includes("=== step 820x1180"));
    const win = ev.slice(Math.max(0, from), to > 0 ? to : undefined).slice(0, 220);
    expect(`DIAG ${bad ? "VIOLATION at " + bad : "no violation"} errors=${JSON.stringify(errors)}\n${lines.join("\n")}\nEVENTS 844x390→690x840:\n${win.join("\n")}`).toBe("(diagnostic, always fails)");
  });
