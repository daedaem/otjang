// Same synthetic wardrobe on master24ed71e and the current build. All provider
// replies are intercepted locally; no private photo or live AI request is used.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  ),
  before = process.env.B5B_BASE_DIST,
  after = path.join(root, "app/lite/dist");
if (!before) throw Error("B5B_BASE_DIST must be the built master24ed71e");
const output = path.join(root, "docs/log/2026-10/evidence/b5b");
fs.mkdirSync(output, { recursive: true });
async function serve(folder) {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(
        new URL(req.url, "http://local.invalid").pathname,
      ),
      file = path.resolve(
        folder,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
    if (
      !file.startsWith(path.resolve(folder) + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404).end();
      return;
    }
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".mjs": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: "http://127.0.0.1:" + server.address().port,
    close: () => new Promise((r) => server.close(r)),
  };
}
const base = await serve(before),
  next = await serve(after),
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
const manifest = {
  base: "24ed71e5514f4b1659d02132cca5ffd24cfdfb5d",
  date: "2026-10-27",
  synthetic: true,
  externalRequests: "blocked",
  mockProvider: true,
  realProviderCalls: 0,
  captures: [],
  observations: [],
};
try {
  for (const [device, viewport] of [
    ["mobile", { width: 390, height: 844 }],
    ["desktop", { width: 1440, height: 1000 }],
  ])
    for (const [version, server] of [
      ["before", base],
      ["after", next],
    ]) {
      const context = await browser.newContext({
          viewport,
          locale: "ko-KR",
          timezoneId: "Asia/Seoul",
          colorScheme: "light",
          reducedMotion: "reduce",
          serviceWorkers: "block",
        }),
        page = await context.newPage();
      let aiCalls = 0;
      await page.clock.setFixedTime(new Date("2026-10-27T03:00:00Z"));
      await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.origin !== server.url) return route.abort();
        if (u.pathname === "/api/rank") {
          aiCalls++;
          const body = route.request().postDataJSON();
          const attributeExample = aiCalls > 1;
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              summary: attributeExample
                ? "모의 AI 응답: 속성 오류 대조 예시예요."
                : "모의 AI 응답: 두 조합을 비교했어요.",
              ranking: [...body.outfits].reverse().map((o) => ({
                id: o.id,
                reason:
                  attributeExample &&
                  o.garmentIds.some(
                    (id) =>
                      body.garments.find((g) => g.id === id)?.label ===
                      "내 첫 셔츠",
                  )
                    ? "모의 오류: 내 첫 셔츠는 울 소재예요."
                    : "모의 이유: 기록된 셔츠·치노·스니커즈의 기본 조합이에요.",
              })),
              attribute_check: {
                lines: attributeExample
                  ? ["확인: 내 첫 셔츠의 소재는 '코튼'으로 기록돼 있어요."]
                  : [],
                note: "일부 속성 표현만 대조해요. 답 전체나 실제 핏을 검증한 것은 아니에요.",
              },
              ai: {
                provider: "anthropic",
                model: "claude-synthetic",
                requestId: "msg_visual_synthetic_" + aiCalls,
                inputTokens: 123,
                outputTokens: 45,
              },
            }),
          });
        }
        if (u.pathname.startsWith("/api/"))
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"items":[]}',
          });
        return route.continue();
      });
      await page.goto(server.url + "/?photos=0#/closet");
      await page.waitForFunction(() => !!window.K?.M);
      await page.evaluate(() => {
        const m = window.K.M;
        window.EOUL_WEATHER = async () => ({
          place: "합성 지역",
          today: { min: 22, max: 30, rain: false },
          tomorrow: { min: 20, max: 28, rain: false },
        });
        for (const [kind, slot, color, label] of [
          ["shirt", "m-oxford", "white", "내 첫 셔츠"],
          ["shirt", "m-oxford", "blue", "내 둘째 셔츠"],
          ["pants", "m-chino", "beige", "내 바지"],
          ["sneaker", "m-white-sneaker", "white", "내 신발"],
        ])
          m.addGarment({
            kind,
            slot,
            color,
            label,
            profile: { v: 1, fabric: { value: "코튼", source: "chosen" } },
          });
        window.K.go("looks", {});
      });
      await page.evaluate(() => document.fonts.ready);
      const shot = async (state) => {
        const filename = `${version}-${device}-${state}.png`;
        await page.screenshot({
          path: path.join(output, filename),
          fullPage: false,
          animations: "disabled",
        });
        manifest.captures.push(filename);
      };
      if (version === "before") {
        await page
          .getByRole("region", { name: "오늘 날씨 코디", exact: true })
          .getByText("합성 지역", { exact: false })
          .waitFor();
        await page.evaluate(() => scrollTo(0, 0));
        await shot("looks");
        await page.locator('[data-mood="work"]').click();
        await page
          .getByRole("heading", { name: "출근 코디", exact: true })
          .waitFor();
        await shot("scene");
      } else {
        await page.locator("[data-react-outfits]").waitFor();
        const initial = await page.evaluate(() =>
          localStorage.getItem(window.EOUL_MOCK_KEY),
        );
        await page.evaluate(() => scrollTo(0, 0));
        await shot("entry");
        await page
          .getByRole("button", { name: "AI로 비교", exact: true })
          .click();
        await page.locator("[data-outfit-ai-summary]").waitFor();
        await page
          .locator("[data-outfit-ai-summary]")
          .evaluate((el) =>
            el.scrollIntoView({ block: "start", behavior: "instant" }),
          );
        await shot("ai");
        const priorOrder = await page
          .locator("[data-outfit-card]")
          .evaluateAll((nodes) =>
            nodes.map((n) => n.getAttribute("data-outfit-card")),
          );
        await page
          .locator("[data-outfit-card]")
          .first()
          .getByRole("button", { name: "좋아요", exact: true })
          .click();
        await page.locator('[data-reactions-saved="true"]').waitFor();
        await page
          .locator("[data-outfit-ai-summary]")
          .evaluate((el) =>
            el.scrollIntoView({ block: "start", behavior: "instant" }),
          );
        await shot("feedback");
        const observed = await page.evaluate(() => ({
          core: localStorage.getItem(window.EOUL_MOCK_KEY),
          reactionCount: JSON.parse(
            localStorage.getItem("eoul-d12-hang:outfit-reactions:v1"),
          ).reactions.length,
        }));
        const currentOrder = await page
          .locator("[data-outfit-card]")
          .evaluateAll((nodes) =>
            nodes.map((n) => n.getAttribute("data-outfit-card")),
          );
        const observation = {
          device,
          coreUnchangedByAIAndReaction: initial === observed.core,
          reactionCount: observed.reactionCount,
          primaryFlowAiCalls: aiCalls,
          orderStableAfterReaction:
            JSON.stringify(priorOrder) === JSON.stringify(currentOrder),
        };
        manifest.observations.push(observation);
        await page.locator(".of-weather>summary").click();
        await page
          .getByRole("region", { name: "오늘 날씨 코디", exact: true })
          .getByText("합성 지역", { exact: false })
          .waitFor();
        await page.evaluate(() => scrollTo(0, 0));
        await shot("weather");
        await page
          .getByLabel("코디 비교 요청", { exact: true })
          .fill("속성 대조 검토");
        await page
          .getByRole("button", { name: "AI로 비교", exact: true })
          .click();
        const errorCard = page
          .locator("[data-outfit-card]")
          .filter({ hasText: "모의 오류: 내 첫 셔츠는 울 소재예요." });
        await errorCard.waitFor();
        await page.evaluate(
          () =>
            new Promise((r) =>
              requestAnimationFrame(() => requestAnimationFrame(r)),
            ),
        );
        await errorCard.evaluate((el) =>
          el.scrollIntoView({ block: "start", behavior: "instant" }),
        );
        await shot("attribute");
        observation.attributeExampleAiCalls =
          aiCalls - observation.primaryFlowAiCalls;
        observation.totalMockAiCalls = aiCalls;
      }
      await context.close();
    }
  const files = [
    ...fs
      .readdirSync(path.join(root, "app/lite/src/outfits"))
      .filter((f) => /\.(ts|tsx|js|css)$/.test(f))
      .map((f) => "src/outfits/" + f),
    "src/core.mjs",
    "src/domain/outfit-review.js",
    "src/domain/outfit-facts.js",
    "src/screen.html",
    "build.mjs",
    "tools/build-core.mjs",
  ];
  manifest.sourceSha256 = Object.fromEntries(
    files.map((file) => [
      file,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, "app/lite", file)))
        .digest("hex"),
    ]),
  );
  fs.writeFileSync(
    path.join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      captures: manifest.captures.length,
      observations: manifest.observations,
      output,
    }),
  );
} finally {
  await browser.close();
  await base.close();
  await next.close();
}
