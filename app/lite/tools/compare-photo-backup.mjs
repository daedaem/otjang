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
const before = process.env.B2A_BASE_DIST,
  after = path.join(root, "app/lite/dist");
if (!before)
  throw Error("B2A_BASE_DIST must point to the built baseline469255a");
const output = path.join(root, "docs/log/2026-10/evidence/b2a");
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
      await page.clock.install({ time: new Date("2026-10-26T12:00:00Z") });
      await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.origin !== server.url) return route.abort();
        if (u.pathname.startsWith("/api/"))
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"items":[],"count":1,"min":3}',
          });
        return route.continue();
      });
      await page.goto(server.url + "/?photos=0#/closet");
      await page.waitForFunction(() => !!window.K?.M);
      const data = await page.evaluate(async () => {
        const m = window.K.M;
        m.reset();
        m.registerGarment({
          draftId: "visual-draft-abcdefgh",
          brand: "합성 브랜드",
          name: "검증용 셔츠",
          kind: "shirt",
          color: "white",
          url: "",
        });
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        canvas.getContext("2d").fillRect(0, 0, 2, 2);
        const blob = await new Promise((r) => canvas.toBlob(r, "image/png")),
          bytes = await blob.arrayBuffer(),
          digest = [
            ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          ]
            .map((n) => n.toString(16).padStart(2, "0"))
            .join(""),
          id = "p_" + digest;
        const raw = JSON.parse(localStorage.getItem("eoul-d12-hang:v1"));
        raw.garments[0].id = "g_visual_shirt";
        raw.garments[0].createdAt = "2026-10-26T12:00:00Z";
        raw.garments[0].photoId = id;
        raw.registrations.receipts[0].garmentId = "g_visual_shirt";
        raw.registrations.receipts[0].at = "2026-10-26T12:00:00Z";
        raw.recent = ["출근용 셔츠 10만원 이하"];
        localStorage.setItem("eoul-d12-hang:v1", JSON.stringify(raw));
        localStorage.setItem(
          "eoul-d12-hang:input-draft:v1",
          JSON.stringify({
            v: 2,
            step: 0,
            updatedAt: "2026-10-26T12:00:00Z",
            values: {
              draftId: "draft-current-abcdefgh",
              brand: "기존",
              name: "기존 옷",
              kind: "shirt",
              color: "white",
              url: "",
            },
          }),
        );
        const db = await new Promise((resolve, reject) => {
          const q = indexedDB.open("eoul-local-photos:eoul-d12-hang:v1", 2);
          q.onupgradeneeded = () => {
            q.result.createObjectStore("photos", { keyPath: "id" });
            q.result.createObjectStore("photo-index", { keyPath: "id" });
            q.result.createObjectStore("meta");
          };
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
        });
        const meta = {
          id,
          digest,
          mime: "image/png",
          role: "garment",
          width: 2,
          height: 2,
          at: "2026-10-26T12:00:00Z",
        };
        await new Promise((resolve, reject) => {
          const tx = db.transaction(["photos", "photo-index"], "readwrite");
          tx.objectStore("photos").put({ ...meta, encoding: 1, bytes });
          tx.objectStore("photo-index").put({
            ...meta,
            size: bytes.byteLength,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        });
        return JSON.stringify(raw);
      });
      await page.reload();
      await page.waitForFunction(() => !!window.K?.M);
      const open = async (pending = false) => {
        if (pending)
          await page
            .getByRole("button", { name: "전체 백업 열기", exact: true })
            .click();
        else {
          await page
            .getByRole("button", { name: "더보기", exact: true })
            .click();
          await page.locator("[data-backup]").click();
        }
        await page
          .getByRole("heading", { name: "백업 · 복원", exact: true })
          .waitFor();
        if (version === "after")
          await page.locator('[data-photo-ready="true"]').waitFor();
        await page.evaluate(() => document.fonts.ready);
      };
      const shot = async (state) => {
        await page.screenshot({
          path: path.join(output, `${version}-${device}-${state}.png`),
          animations: "disabled",
        });
        console.log(`${version}-${device}-${state}`);
      };
      await open();
      await shot("normal");
      const bad = '{"v":99,"future":"합성 원문"}',
        file =
          version === "before"
            ? {
                app: "eoul-lite",
                format: 2,
                at: "2026-10-26T12:00:00Z",
                data: {
                  "eoul-d12-hang:v1": data,
                  "eoul-d12-hang:input-draft:v1": bad,
                },
              }
            : {
                app: "eoul-photo-backup",
                format: 1,
                mode: "full",
                at: "2026-10-26T12:00:00Z",
                text: {
                  app: "eoul-lite",
                  format: 2,
                  at: "2026-10-26T12:00:00Z",
                  data: {
                    "eoul-d12-hang:v1": data,
                    "eoul-d12-hang:input-draft:v1": bad,
                  },
                },
                photos: [],
              };
      const binary =
        version === "after"
          ? await page.evaluate(async (bad) => {
              const module = await window.EOUL_PHOTO_LOAD(),
                client = module.currentPhotoClient(window.EOUL_MOCK_KEY),
                file = await client.controller.makeFile();
              const prefix = new Uint8Array(
                  await file.slice(0, 12).arrayBuffer(),
                ),
                length = new DataView(prefix.buffer).getUint32(8, false),
                header = JSON.parse(await file.slice(12, 12 + length).text());
              header.text.data["eoul-d12-hang:input-draft:v1"] = bad;
              const body = new TextEncoder().encode(JSON.stringify(header)),
                next = new Uint8Array(12);
              next.set(new TextEncoder().encode("EOULPH01"));
              new DataView(next.buffer).setUint32(8, body.length, false);
              return Array.from(
                new Uint8Array(
                  await new Blob([
                    next,
                    body,
                    file.slice(12 + length),
                  ]).arrayBuffer(),
                ),
              );
            }, bad)
          : null;
      await page.locator("#bkfile").setInputFiles({
        name: binary ? "synthetic-preview.otjang" : "synthetic-preview.json",
        mimeType: binary ? "application/octet-stream" : "application/json",
        buffer: binary
          ? Buffer.from(binary)
          : Buffer.from(JSON.stringify(file)),
      });
      await page
        .locator(version === "before" ? "[data-bk-go]" : "[data-photo-confirm]")
        .waitFor();
      await page
        .locator(version === "before" ? ".bk-preview" : "[data-photo-preview]")
        .last()
        .scrollIntoViewIfNeeded();
      await shot("preview");
      if (version === "before") {
        await page.evaluate(() =>
          localStorage.setItem(
            "eoul-backup:stash-next",
            JSON.stringify({
              at: "2026-10-26T12:00:00Z",
              data: {
                "eoul-d12-hang:v1": localStorage.getItem("eoul-d12-hang:v1"),
              },
            }),
          ),
        );
        await page.locator("[data-bk-go]").click();
        await page
          .locator(".bk-msg")
          .filter({ hasText: "앞선 복원" })
          .waitFor();
        await page.locator(".bk-msg").scrollIntoViewIfNeeded();
      } else {
        await page.evaluate(async () => {
          const m = await window.EOUL_PHOTO_LOAD(),
            c = m.currentPhotoClient(window.EOUL_MOCK_KEY),
            file = await c.controller.makeFile();
          c.repository.promoteUndo = async () => {
            throw Error("synthetic promotion failure");
          };
          try {
            await c.controller.restore(file);
          } catch {}
        });
        await page.reload();
        await open(true);
        await page.locator("[data-photo-recover]").scrollIntoViewIfNeeded();
      }
      await shot("recovery");
      await context.close();
    }
} finally {
  await browser.close();
  await base.close();
  await next.close();
}

const sourceFiles = [
  "app/lite/src/core.mjs",
  "app/lite/src/screen.html",
  "app/lite/src/input-session.js",
  "app/lite/src/lite.js",
  "app/lite/src/photos/index.js",
  "app/lite/src/photos/photo-backup.js",
  "app/lite/src/photos/photo-repository.js",
  "app/lite/src/domain/photo-pending.js",
  "app/lite/build.mjs",
  "app/lite/vite.config.mjs",
  "app/lite/tools/compare-photo-backup.mjs",
];
const sourceHash = crypto.createHash("sha256");
for (const name of sourceFiles) {
  sourceHash.update(name);
  sourceHash.update(await fsp.readFile(path.join(root, name)));
}
await fsp.writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(
    {
      baselineCommit: "469255a5a5b387d4e7ce7476a05f775eac478746",
      implementationHead: execFileSync(
        "git",
        ["-C", root, "rev-parse", "HEAD"],
        { encoding: "utf8" },
      ).trim(),
      sourceHash: sourceHash.digest("hex"),
      sourceFiles,
      fixture:
        "Synthetic garment, draft and generated 2x2 pixels only; all external images/API aborted",
      viewports: {
        mobile: { width: 390, height: 844 },
        desktop: { width: 1440, height: 1000 },
      },
      states: ["normal", "preview", "recovery"],
      captureEngine:
        "Chromium; viewport simulation is not real-device validation",
    },
    null,
    2,
  ) + "\n",
);
