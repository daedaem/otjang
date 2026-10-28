// Reproducible local UI evidence. No real users, photos, provider calls or writes.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { serveCommunity, communityCall } from "../e2e/community-fixture.mjs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const baseline = process.argv[2];
if (!baseline) throw Error("Pass the untouched baseline dist directory");
const output = path.join(
  root,
  "docs/log/2026-10/evidence/community-navigation",
);
fs.mkdirSync(output, { recursive: true });
const NOW = Date.parse("2026-10-28T12:00:00Z");
async function serve(folder) {
  const base = path.resolve(folder);
  const server = http.createServer((req, res) => {
    const file = path.resolve(
      base,
      "." +
        new URL(req.url, "http://local").pathname.replace(
          /^\/$/,
          "/index.html",
        ),
    );
    if (
      !file.startsWith(base + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    )
      return res.writeHead(404).end();
    const type = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".mjs": "text/javascript",
      ".css": "text/css",
      ".webp": "image/webp",
      ".png": "image/png",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, {
      "Content-Type": type[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: "http://127.0.0.1:" + server.address().port,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}
const servers = [
  ["before", await serve(baseline)],
  ["after", await serve(path.join(root, "app/lite/dist"))],
];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const manifest = {
  baselineCommunitySource:
    "573eaf711e4abe2c5f3e84e048ef36b40c9f111b (same community UI as fecbb60)",
  afterSource: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  capturedAt: new Date().toISOString(),
  synthetic: true,
  externalRequests: "blocked",
  realPosts: 0,
  fixtureTime: new Date(NOW).toISOString(),
  captures: [],
};
try {
  for (const [version, server] of servers) {
    for (const device of [
      { name: "mobile320", width: 320, height: 780, colorScheme: "light" },
      { name: "mobile390", width: 390, height: 844, colorScheme: "light" },
      { name: "mobile-dark", width: 390, height: 844, colorScheme: "dark" },
      { name: "desktop", width: 1440, height: 1000, colorScheme: "light" },
    ]) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        colorScheme: device.colorScheme,
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
        serviceWorkers: "block",
        reducedMotion: "reduce",
      });
      await context.addInitScript((now) => {
        Date.now = () => now;
      }, NOW);
      const page = await context.newPage();
      const { env, posted } = await serveCommunity(
        page,
        "private",
        {},
        undefined,
        { origin: server.url, start: "/?photos=0#/closet", now: () => NOW },
      );
      const seed = async (
        section,
        body,
        who = { member: "owner", operator: true },
        at = NOW,
      ) => {
        const r = await communityCall(env, section, body, who, {
          now: () => at,
        });
        if (!r.ok)
          throw Error(
            "Synthetic community seed failed " +
              r.status +
              " " +
              (await r.text()),
          );
      };
      await seed(
        "join",
        { name: "합성회원", rules: 1, age14: true },
        undefined,
        NOW - 3000,
      );
      await seed("posts", {
        post: {
          text: "출근할 때 입는 흰 셔츠와 베이지 바지예요. (합성 예시)",
          pieces: [
            { kind: "shirt", color: "white", label: "흰 셔츠" },
            { kind: "pants", color: "beige", label: "베이지 바지" },
          ],
          consent: false,
        },
        photos: [],
      });
      const who = { member: "qa-other", operator: false };
      await seed(
        "join",
        { name: "코디예시", rules: 1, age14: true },
        who,
        NOW - 2000,
      );
      await seed(
        "posts",
        {
          post: {
            text: "선선한 날에는 네이비 니트를 함께 입어요. (합성 예시)",
            pieces: [
              { kind: "knit", color: "navy", label: "네이비 니트" },
              { kind: "jeans", color: "indigo", label: "인디고 데님" },
            ],
            consent: false,
          },
          photos: [],
        },
        who,
        NOW - 1000,
      );
      const shot = async (state) => {
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({
          content:
            "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
        });
        const file = version + "-" + device.name + "-" + state + ".png";
        await page.screenshot({
          path: path.join(output, file),
          animations: "disabled",
        });
        const bytes = fs.readFileSync(path.join(output, file));
        const postOrder = await page
          .locator("[data-community-post] .cm-meta b")
          .allTextContents();
        if (version === "after") {
          const before = manifest.captures.find(
            (c) => c.file === "before-" + device.name + "-" + state + ".png",
          );
          if (
            !before ||
            JSON.stringify(before.postOrder) !== JSON.stringify(postOrder)
          )
            throw Error("Synthetic post order differs");
        }
        manifest.captures.push({
          file,
          postOrder,
          viewport: { width: device.width, height: device.height },
          colorScheme: device.colorScheme,
          state,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          bytes: bytes.length,
          tabLabels: await page.locator("#tabs [data-tab]").allTextContents(),
          activeTab: await page
            .locator('#tabs [aria-current="page"]')
            .allTextContents(),
        });
      };
      await page.locator("[data-react-closet]").waitFor();
      await page.locator("nav#tabs[data-react-chrome]").waitFor();
      await shot("closet");
      // Use each version's real entry; the baseline has no independent tab.
      const communityEntry = page.locator('#tabs [data-tab="community"]');
      if (await communityEntry.count()) await communityEntry.click();
      else {
        await page.locator('#tabs [data-tab="looks"]').click();
        await page
          .getByRole("button", { name: "코디 공유", exact: true })
          .click();
      }
      await page
        .getByRole("button", { name: "코디 올리기", exact: true })
        .waitFor();
      await page.locator("[data-community-post]").nth(1).waitFor();
      await page.locator("nav#tabs[data-react-chrome]").waitFor();
      await shot("feed");
      await page.evaluate(() => {
        const m = window.K.M;
        for (const [kind, slot, color, label] of [
          ["shirt", "m-oxford", "white", "QA 셔츠"],
          ["pants", "m-chino", "beige", "QA 바지"],
          ["sneaker", "m-white-sneaker", "white", "QA 신발"],
        ])
          m.addGarment({ kind, slot, color, label });
        window.K.tab("looks");
      });
      await page
        .locator("[data-outfit-card]")
        .first()
        .getByRole("button", { name: "이 코디 공유", exact: true })
        .click();
      await page.getByRole("dialog", { name: "코디 올리기" }).waitFor();
      await page.locator("[data-community-piece]").nth(2).waitFor();
      await page.locator("[data-community-post]").nth(1).waitFor();
      await shot("share");
      if (posted.length) throw Error("Capture must not post from UI");
      await context.close();
    }
  }
  fs.writeFileSync(
    path.join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(JSON.stringify({ captures: manifest.captures.length, output }));
} finally {
  await browser.close();
  for (const [, s] of servers) await s.close();
}
