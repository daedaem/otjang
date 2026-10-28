import { test, expect, type Page } from "@playwright/test";
import {
  handlePrivateAiCheck,
  CHECK_REQUESTS,
} from "../functions/lib/private-ai-check.js";
async function serve(page: Page, fail = false) {
  const requests: any[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw Error("private storage touched");
      },
    });
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw Error("private photo DB touched");
      },
    });
  });
  await page.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    if (u.protocol === "blob:" && u.origin === "http://127.0.0.1:8792") return route.continue();
    if (u.origin !== "http://127.0.0.1:8792") return route.abort();
    if (u.pathname === "/_private/ai-check") {
      const r = await handlePrivateAiCheck(new Request(req.url()));
      return route.fulfill({
        status: r.status,
        headers: Object.fromEntries(r.headers),
        body: await r.text(),
      });
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      requests.push({
        path: u.pathname,
        body,
        scope: req.headers()["x-hangit-scope"],
      });
      if (fail)
        return route.fulfill({
          status: 502,
          json: { code: "provider_forbidden", message: "합성 실패" },
        });
      const ai = {
        model: "qa-model",
        inputTokens: 123,
        outputTokens: 45,
        requestId: "msg_PRIVATE_RESPONSE_ID",
        providerRequestId: "req_PRIVATE_HEADER_ID",
      };
      const result =
        u.pathname === "/api/garment-photo"
          ? {
              clothing: true,
              kind: "shirt",
              color: "white",
              label: "흰 셔츠",
              confidence: "high",
              ai,
            }
          : body.task === "rank"
            ? {
                summary: "합성 순위",
                ranking: body.items.map((p: any) => ({
                  id: p.id,
                  reason: "확인한 사실",
                  fit: "추천",
                })),
                ai,
              }
            : {
                on_topic: true,
                answer: "합성 상담",
                product_ids: [body.items[0].id],
                ai,
              };
      return route.fulfill({ json: result });
    }
    return route.abort();
  });
  await page.goto("/_private/ai-check");
  return requests;
}
async function sample(page: Page) {
  const bytes = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 2;
    c.getContext("2d")!.fillRect(0, 0, 2, 2);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("생성 셔츠 시험 사진")
    .setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from(bytes, "base64"),
    });
}
test("fixed calls exclude private storage, require a photo action, and stop after one call of each type", async ({
  page,
}) => {
  const requests = await serve(page);
  expect(requests).toHaveLength(0);
  await page
    .getByRole("button", { name: "추천 1회 시험", exact: true })
    .click();
  await expect(page.locator("#rank-result")).toContainText("qa-model");
  await page
    .getByRole("button", { name: "상담 1회 시험", exact: true })
    .click();
  await expect(page.locator("#consult-result")).toContainText("합성 상담");
  expect(requests.slice(0, 2).map((r) => r.body)).toEqual([
    CHECK_REQUESTS.rank,
    CHECK_REQUESTS.consult,
  ]);
  await sample(page);
  expect(requests).toHaveLength(2);
  const photo = page.getByRole("button", {
    name: "사진 분석 1회 시험",
    exact: true,
  });
  await expect(photo).toBeDisabled();
  await page
    .getByLabel(
      "선택한 시험 사진 한 장을 Anthropic에 보내 분석하는 데 동의해요",
    )
    .check();
  expect(requests).toHaveLength(2);
  await photo.click();
  await expect(page.locator("#photo-result")).toContainText("흰 셔츠");
  expect(requests).toHaveLength(3);
  expect(requests[2].path).toBe("/api/garment-photo");
  expect(Object.keys(requests[2].body)).toEqual(["image"]);
  expect(Buffer.from(requests[2].body.image, "base64").subarray(0, 3)).toEqual(
    Buffer.from([255, 216, 255]),
  );
  expect(requests.every((r) => r.scope === "owner")).toBe(true);
  await expect(page.locator("#count")).toHaveText("요청 시도 3 / 3");
  for (const button of await page.locator("[data-test]").all())
    await expect(button).toBeDisabled();
  await expect(page.locator("body")).not.toContainText("PRIVATE_RESPONSE_ID");
  await expect(page.locator("body")).not.toContainText("PRIVATE_HEADER_ID");
});
test("a failed call consumes its slot and is never retried automatically", async ({
  page,
}) => {
  const requests = await serve(page, true);
  await page
    .getByRole("button", { name: "추천 1회 시험", exact: true })
    .click();
  await expect(page.locator("#rank-result")).toContainText(
    "provider_forbidden",
  );
  await expect(page.locator('[data-test="rank"]')).toBeDisabled();
  expect(requests).toHaveLength(1);
  await expect(page.locator("#count")).toHaveText("요청 시도 1 / 3");
});
