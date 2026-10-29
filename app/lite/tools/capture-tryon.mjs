// Isolated UI evidence only. Never invokes FASHN or any live AI provider.
import { chromium, webkit } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const dist = path.join(root, "app/lite/dist"),
  out = path.join(root, "docs/log/2026-10/evidence/try-on");
fs.mkdirSync(out, { recursive: true });
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
const server = http.createServer((req, res) => {
  const file = path.resolve(
    dist,
    "." +
      new URL(req.url, "http://local").pathname.replace(/^\/$/, "/index.html"),
  );
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file))
    return res.writeHead(404).end();
  res.writeHead(200, {
    "content-type": types[path.extname(file)] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const manifest = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  capturedAt: new Date().toISOString(),
  realProviderCalls: 0,
  syntheticPerson: true,
  resultQuality: "not_tested",
  captures: [],
};
try {
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch({
      headless: true,
      ...(engine === "chromium" && process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
    });
    try {
      for (const device of [
        { name: "mobile", width: 390, height: 844, colorScheme: "light" },
        { name: "dark", width: 390, height: 844, colorScheme: "dark" },
        { name: "desktop", width: 1440, height: 1000, colorScheme: "light" },
      ]) {
        const context = await browser.newContext({
            viewport: { width: device.width, height: device.height },
            colorScheme: device.colorScheme,
            serviceWorkers: "block",
            locale: "ko-KR",
            reducedMotion: "reduce",
          }),
          page = await context.newPage();
        await page.route("**/*", (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === "/api/try-on/config")
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                available: false,
                creditsPerImage: 3,
                consentVersion: "fashn-2026-10-29",
                message:
                  "착용 이미지 연결을 준비하고 있어요. 사진은 전송되지 않아요.",
              }),
            });
          if (url.pathname.startsWith("/api/"))
            return route.fulfill({
              status: 503,
              contentType: "application/json",
              body: '{"code":"not_configured"}',
            });
          return route.continue();
        });
        await page.goto(origin + "/?photos=0#/tryon?id=ms-728000");
        await page.locator("[data-react-tryon]").waitFor();
        await page
          .getByLabel("내 사진 고르기", { exact: true })
          .setInputFiles(
            path.join(root, "app/lite/e2e/assets/try-on/fictional-person.jpg"),
          );
        await page.getByAltText("내 사진 선택한 사진").waitFor();
        await page
          .getByLabel("입혀 볼 옷 고르기", { exact: true })
          .setInputFiles(
            path.join(root, "app/lite/public/examples/m-oxford.webp"),
          );
        await page.getByAltText("입혀 볼 옷 선택한 사진").waitFor();
        await page.evaluate(() => document.fonts.ready);
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          )
        )
          throw Error("Horizontal overflow");
        const file = engine + "-" + device.name + "-inputs.png";
        await page.screenshot({
          path: path.join(out, file),
          fullPage: true,
          animations: "disabled",
        });
        const bytes = fs.readFileSync(path.join(out, file));
        manifest.captures.push({
          file,
          engine,
          viewport: { width: device.width, height: device.height },
          theme: device.colorScheme,
          bytes: bytes.length,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          note: "Local input screen; fictional model and generated shirt; configured=false; no try-on result is represented.",
        });
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(
    path.join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      output: out,
      captures: manifest.captures.length,
      realProviderCalls: 0,
    }),
  );
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
