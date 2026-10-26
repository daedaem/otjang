// Deterministic visual evidence only: synthetic clothing and generated pixels.
// All non-local requests are aborted; no private photo or provider call is used.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const before = process.env.B3B_BASE_DIST,
  after = path.join(root, "app/lite/dist");
if (!before)
  throw Error("B3B_BASE_DIST must point to the built baseline77bfebb");
const output = path.join(root, "docs/log/2026-10/evidence/b3b");
await fsp.mkdir(output, { recursive: true });
async function serve(folder) {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
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
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: "http://127.0.0.1:" + server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
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
  base: "77bfebb7a05041d3f61f504a9fba1138b99313d9",
  date: "2026-10-27",
  synthetic: true,
  externalRequests: "blocked",
  captures: [],
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
          colorScheme: "light",
          locale: "ko-KR",
          reducedMotion: "reduce",
          serviceWorkers: "block",
        }),
        page = await context.newPage();
      await page.clock.setFixedTime(new Date("2026-10-27T12:00:00Z"));
      await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.origin !== server.url) return route.abort();
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
      const id = await page.evaluate(() => {
        const m = window.K.M,
          g = m.registerGarment({
            draftId: "visual-owned-profile",
            brand: "합성 브랜드",
            name: "합성 옥스퍼드 셔츠",
            kind: "shirt",
            color: "white",
            url: "https://example.test/own",
            profile: {
              v: 1,
              measures: {
                length: { cm: 70, source: "seller" },
                chest: { cm: 55, source: "measured" },
              },
              fabric: { value: "코튼", source: "ai" },
            },
          });
        m.addGarment({
          kind: "pants",
          slot: "m-chino",
          color: "beige",
          label: "합성 치노 팬츠",
        });
        m.addGarment({
          kind: "sneaker",
          slot: "m-white-sneaker",
          color: "white",
          label: "합성 스니커즈",
        });
        window.K.refresh();
        return g.id;
      });
      await page.locator(`[data-g="${id}"]`).click();
      await page.getByRole("dialog").waitFor({ state: "visible" });
      await page.evaluate(() => document.fonts.ready);
      const shot = async (state) => {
        await page.screenshot({
          path: path.join(output, `${version}-${device}-${state}.png`),
          fullPage: false,
          animations: "disabled",
        });
        manifest.captures.push(`${version}-${device}-${state}.png`);
      };
      if (version === "before") {
        await shot("owned");
      } else {
        await page.waitForSelector("[data-profile-editor]");
        await shot("owned");
        await page
          .getByRole("tab", { name: "소재·디테일", exact: true })
          .click();
        await shot("attributes");
        await page.getByRole("tab", { name: "실측", exact: true }).click();
        await page.getByLabel("총장 (cm)", { exact: true }).fill("72.");
        await page.waitForFunction(
          () =>
            document
              .querySelector("[data-profile-editor]")
              ?.getAttribute("data-draft-saved") === "true",
        );
        await page.getByRole("button", { name: "닫기", exact: true }).click();
        await page.locator(`[data-g="${id}"]`).click();
        await page
          .getByRole("button", { name: "이어서 수정", exact: true })
          .waitFor();
        await shot("resume");
        await page
          .getByRole("button", { name: "이어서 수정", exact: true })
          .click();
        await page.getByLabel("총장 (cm)", { exact: true }).fill("72");
        await page.evaluate(() => {
          const remove = Storage.prototype.removeItem;
          Storage.prototype.removeItem = function (key) {
            if (key === "eoul-d12-hang:profile-drafts:v1")
              throw new DOMException("quota", "QuotaExceededError");
            return remove.call(this, key);
          };
        });
        await page
          .getByRole("button", { name: "옷 정보 저장", exact: true })
          .click();
        await page
          .getByRole("button", { name: "초안 정리 다시", exact: true })
          .waitFor();
        await shot("cleanup-warning");
      }
      await context.close();
    }
  const files = [
    "src/profile/index.tsx",
    "src/profile/Fields.tsx",
    "src/profile/Summary.tsx",
    "src/profile/Outfits.tsx",
    "src/profile/profile.css",
    "src/profile/draft-session.js",
    "src/profile/types.ts",
    "src/photos/OwnedPhoto.tsx",
    "src/photos/owned-photo.css",
    "src/screen.html",
    "src/browser/kit.js",
    "src/core.mjs",
    "build.mjs",
  ];
  manifest.sourceSha256 = Object.fromEntries(
    files.map((f) => [
      f,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, "app/lite", f)))
        .digest("hex"),
    ]),
  );
  await fsp.writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(JSON.stringify({ captures: manifest.captures.length, output }));
} finally {
  await browser.close();
  await base.close();
  await next.close();
}
