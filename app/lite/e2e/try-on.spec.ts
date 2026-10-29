import { test, expect, type Page } from "@playwright/test";
import { handleTryOn } from "../functions/api/try-on.js";
import { fakeD1 } from "./community-fixture.mjs";

const ID = "ms-728000";
async function photo(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 450;
    canvas.height = 600;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#e9e7e2";
    c.fillRect(0, 0, 450, 600);
    c.fillStyle = "#1f2b46";
    c.fillRect(100, 80, 250, 450);
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/jpeg"),
    );
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const raw = Buffer.from(bytes),
    metadata = Buffer.from("Exif\0\0qa-metadata-marker");
  const length = Buffer.alloc(2);
  length.writeUInt16BE(metadata.length + 2);
  return {
    name: "synthetic-local.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.concat([
      raw.subarray(0, 2),
      Buffer.from([255, 225]),
      length,
      metadata,
      raw.subarray(2),
    ]),
  };
}
async function setup(page: Page, mode = "ready", loseAcknowledgement = false) {
  const env: any = {
    RANK_DB: fakeD1(),
    TRYON_MODE: mode === "ready" ? "private" : "off",
    FASHN_API_KEY: "qa-only-not-a-real-key",
    TRYON_DAILY_CREDITS: "10",
    TRYON_MONTHLY_CREDITS: "20",
    TRYON_MEMBER_DAILY_CREDITS: "10",
  };
  const posts: any[] = [],
    provider: any[] = [];
  let output = "";
  await page.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    if (u.origin !== "http://127.0.0.1:8792") return route.abort();
    if (u.pathname.startsWith("/api/try-on/")) {
      const body = req.postDataBuffer();
      if (req.method() === "POST") {
        const value = JSON.parse(String(body));
        posts.push(value);
        output = value.person;
      }
      const res = await handleTryOn(
        new Request(u.href, {
          method: req.method(),
          headers: await req.allHeaders(),
          ...(body ? { body } : {}),
        }),
        env,
        { member: "owner", owner: true },
        {
          fetchImpl: async (url: any, init: any) => {
            provider.push({ url, init });
            return Response.json(
              String(url).endsWith("/run")
                ? { id: "qa-prediction-0123456789" }
                : { status: "completed", output: [output] },
            );
          },
        },
      );
      if (loseAcknowledgement && req.method() === "POST") {
        loseAcknowledgement = false;
        return route.abort();
      }
      return route.fulfill({
        status: res.status,
        headers: Object.fromEntries(res.headers),
        body: Buffer.from(await res.arrayBuffer()),
      });
    }
    if (u.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"code":"not_configured"}',
      });
    return route.continue();
  });
  await page.goto("/?photos=0#/closet");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate((id) => (window as any).K.go("detail", { id }), ID);
  await page
    .getByRole("button", { name: "내 사진에 입혀 보기", exact: true })
    .click();
  await expect(page.locator("[data-react-tryon]")).toBeVisible();
  return { env, posts, provider };
}
async function choose(page: Page) {
  const image = await photo(page);
  await page.getByLabel("내 사진 고르기", { exact: true }).setInputFiles(image);
  await expect(page.getByAltText("내 사진 선택한 사진")).toBeVisible();
  await page
    .getByLabel("입혀 볼 옷 고르기", { exact: true })
    .setInputFiles(image);
  await expect(page.getByAltText("입혀 볼 옷 선택한 사진")).toBeVisible();
  return image;
}
const consent = (page: Page) =>
  page.getByRole("checkbox", {
    name: "내 사진과 합성에 사용할 수 있는 옷 사진을 FASHN으로 보내는 데 동의해요.",
  });

test("try-on opens from the product, stays honest when disabled, and selected photos never leave without consent", async ({
  page,
}) => {
  const f = await setup(page, "off");
  await choose(page);
  await expect(page).toHaveURL(/#\/tryon\?id=ms-728000$/);
  await expect(
    page.getByText(
      "착용 이미지 연결을 준비하고 있어요. 사진은 전송되지 않아요.",
      { exact: true },
    ),
  ).toBeVisible();
  await consent(page).check();
  await expect(
    page.getByRole("button", { name: "이 옷 입혀 보기", exact: true }),
  ).toBeDisabled();
  expect(f.posts).toHaveLength(0);
  expect(f.provider).toHaveLength(0);
  await page.getByRole("button", { name: "상품으로 돌아가기" }).click();
  await expect(page).toHaveURL(new RegExp("#/p/" + ID + "$"));
});
test("one explicit generation strips metadata and automatically shows a result with original comparisons", async ({
  page,
}) => {
  const f = await setup(page);
  await choose(page);
  const button = page.getByRole("button", {
    name: "이 옷 입혀 보기",
    exact: true,
  });
  await expect(button).toBeDisabled();
  expect(f.posts).toHaveLength(0);
  await consent(page).check();
  await expect(button).toBeEnabled();
  await button.evaluate((el) => {
    (el as HTMLButtonElement).click();
    (el as HTMLButtonElement).click();
  });
  await expect(page.getByAltText("AI로 생성한 착용 미리보기")).toBeVisible();
  expect(f.posts).toHaveLength(1);
  expect(f.provider.filter((x) => x.url.endsWith("/run"))).toHaveLength(1);
  for (const field of ["person", "garment"]) {
    const value = f.posts[0][field];
    expect(value).toMatch(/^data:image\/jpeg;base64,/);
    expect(
      Buffer.from(value.slice(23), "base64").includes(
        Buffer.from("qa-metadata-marker"),
      ),
    ).toBe(false);
  }
  await page.getByRole("button", { name: "입기 전", exact: true }).click();
  await expect(page.getByAltText("선택한 내 원본 사진")).toBeVisible();
  await page.getByRole("button", { name: "옷 원본", exact: true }).click();
  await expect(page.getByAltText("합성에 사용한 옷 원본 사진")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  const saved = await page.evaluate(async () => {
    const p = await (window as any).EOUL_PHOTO_LOAD();
    return (
      await (await p.photoLibrary((window as any).EOUL_MOCK_KEY)).list()
    ).map((x: any) => ({ role: x.role, mime: x.mime }));
  });
  expect(saved).toEqual([{ role: "body", mime: "image/jpeg" }]);
});
test("lost acknowledgement and page reload resume the same request without a second generation", async ({
  page,
}) => {
  const f = await setup(page, "ready", true);
  await choose(page);
  await consent(page).check();
  await page
    .getByRole("button", { name: "이 옷 입혀 보기", exact: true })
    .click();
  await expect(
    page.getByText(
      "연결을 확인해 주세요. 같은 요청의 결과 확인으로 이어갈 수 있어요.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "같은 요청의 결과 확인", exact: true }),
  ).toBeEnabled();
  expect(f.provider.filter((x) => x.url.endsWith("/run"))).toHaveLength(1);
  await page.reload();
  await expect(page.getByAltText("AI로 생성한 착용 미리보기")).toBeVisible();
  expect(f.posts).toHaveLength(1);
  expect(f.provider.filter((x) => x.url.endsWith("/run"))).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "옷 원본", exact: true }),
  ).toBeDisabled();
});
test("a remembered body photo is reused locally and does not overwrite the existing mirror or wardrobe", async ({
  page,
}) => {
  const f = await setup(page);
  await choose(page);
  const before = await page.evaluate(() =>
    JSON.stringify((window as any).K.M.getState()),
  );
  await consent(page).check();
  await page
    .getByRole("button", { name: "이 옷 입혀 보기", exact: true })
    .click();
  await expect(page.getByAltText("AI로 생성한 착용 미리보기")).toBeVisible();
  await page
    .getByRole("button", { name: "다른 사진으로 새로 입혀 보기", exact: true })
    .click();
  await expect(page.getByAltText("내 사진 선택한 사진")).toBeVisible();
  expect(f.posts).toHaveLength(1);
  expect(
    await page.evaluate(() => JSON.stringify((window as any).K.M.getState())),
  ).toBe(before);
  await page.getByRole("button", { name: "상품으로 돌아가기" }).click();
  await page.getByRole("button", { name: "내 사진에 입혀 보기", exact: true }).click();
  await expect(page.getByAltText("내 사진 선택한 사진")).toBeVisible();
  await expect(consent(page)).not.toBeChecked();
  expect(f.posts).toHaveLength(1);
});
test("a definite budget refusal keeps selected photos and never leaves a fake pending generation", async ({
  page,
}) => {
  const f = await setup(page);
  f.env.TRYON_MEMBER_DAILY_CREDITS = "3";
  await choose(page);
  await consent(page).check();
  await page
    .getByRole("button", { name: "이 옷 입혀 보기", exact: true })
    .click();
  await expect(page.getByAltText("AI로 생성한 착용 미리보기")).toBeVisible();
  await page
    .getByRole("button", { name: "다른 사진으로 새로 입혀 보기", exact: true })
    .click();
  await consent(page).check();
  await page
    .getByRole("button", { name: "이 옷 입혀 보기", exact: true })
    .click();
  await expect(
    page.getByText(
      "생성 한도에 닿았거나 진행 중인 요청이 있어요. 잠시 뒤 다시 확인해 주세요.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "이 옷 입혀 보기", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "같은 요청의 결과 확인", exact: true }),
  ).toHaveCount(0);
  expect(f.provider.filter((x) => x.url.endsWith("/run"))).toHaveLength(1);
});
