// Only the authenticated Worker supplies `actor`; never accept identity from JSON.
// Photos/results live in request memory only. D1 holds ownership, hashes and cost reservations.

export const TRYON_CONSENT = "fashn-2026-10-29";
export const TRYON_MODEL = "tryon-max";
export const TRYON_CREDITS = 3; // quality / 1k / exactly one output, official API contract 2026-10-29
const MAX_IMAGE = 1024 * 1024,
  MAX_BODY = 2 * Math.ceil(MAX_IMAGE / 3) * 4 + 2048;
const MAX_OUTPUT = 4 * 1024 * 1024,
  LIFETIME = 60 * 60 * 1000;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const fail = (status, code, message) => json(status, { code, message });
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tryon_jobs (member TEXT NOT NULL,id TEXT NOT NULL,payload_hash TEXT NOT NULL,
    state TEXT NOT NULL,provider_id TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
    utc_day TEXT NOT NULL,utc_month TEXT NOT NULL,credits INTEGER NOT NULL,next_poll_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(member,id))`,
  "CREATE INDEX IF NOT EXISTS tryon_budget_day ON tryon_jobs(utc_day)",
  "CREATE INDEX IF NOT EXISTS tryon_budget_month ON tryon_jobs(utc_month)",
];
const ready = new WeakMap();
async function schema(db) {
  if (!ready.has(db))
    ready.set(
      db,
      (async () => {
        for (const sql of SCHEMA) await db.prepare(sql).run();
      })(),
    );
  try {
    await ready.get(db);
  } catch (e) {
    ready.delete(db);
    throw e;
  }
}
const limit = (value) =>
  /^\d+$/.test(String(value ?? "")) &&
  Number(value) >= TRYON_CREDITS &&
  Number(value) <= 10000
    ? Number(value)
    : null;
function settings(env, actor) {
  const db = env.RANK_DB || env.CROWD_DB;
  const limits = {
    daily: limit(env.TRYON_DAILY_CREDITS),
    monthly: limit(env.TRYON_MONTHLY_CREDITS),
    member: limit(env.TRYON_MEMBER_DAILY_CREDITS),
  };
  const enabled =
    (env.TRYON_MODE === "private" && actor.owner === true) ||
    env.TRYON_MODE === "members";
  return {
    db,
    limits,
    enabled,
    configured:
      enabled &&
      typeof env.FASHN_API_KEY === "string" &&
      !!env.FASHN_API_KEY.trim() &&
      !!db?.prepare &&
      Object.values(limits).every(Boolean),
  };
}
export function tryOnConfiguration(env, actor) {
  const s = settings(env, actor);
  return {
    available: !!s.configured,
    provider: "FASHN",
    model: TRYON_MODEL,
    creditsPerImage: TRYON_CREDITS,
    consentVersion: TRYON_CONSENT,
    privacy: {
      input: "base64",
      output: "base64",
      outputMinutes: 60,
      serverPhotoStorage: false,
    },
    message: s.configured
      ? "사진을 고르면 시작할 수 있어요."
      : "착용 이미지 연결을 준비하고 있어요. 사진은 전송되지 않아요.",
  };
}
export function tryOnJpeg(value, max = MAX_IMAGE) {
  if (typeof value !== "string" || !value.startsWith("data:image/jpeg;base64,"))
    return false;
  const encoded = value.slice(23);
  if (
    !encoded ||
    encoded.length > Math.ceil(max / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    return false;
  try {
    const b = atob(encoded);
    return (
      b.length >= 4 &&
      b.length <= max &&
      b.charCodeAt(0) === 255 &&
      b.charCodeAt(1) === 216 &&
      b.charCodeAt(2) === 255 &&
      b.charCodeAt(b.length - 2) === 255 &&
      b.charCodeAt(b.length - 1) === 217
    );
  } catch {
    return false;
  }
}
async function bounded(response, max) {
  if (Number(response.headers.get("content-length") || 0) > max)
    throw Error("too_large");
  const reader = response.body?.getReader();
  if (!reader) throw Error("empty");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw Error("too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let n = 0;
  for (const c of chunks) {
    bytes.set(c, n);
    n += c.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
const view = (row) => ({
  id: row.id,
  state: row.state === "reserved" ? "starting" : row.state,
  expiresAt: row.expires_at,
  creditsReserved: row.credits,
});

export async function handleTryOn(
  request,
  env = {},
  actor = {},
  { fetchImpl = fetch, now = Date.now } = {},
) {
  if (typeof actor.member !== "string" || !actor.member)
    return fail(401, "unauthorized", "로그인이 필요해요.");
  const url = new URL(request.url),
    path = url.pathname;
  if (request.method === "GET" && path === "/api/try-on/config")
    return json(200, tryOnConfiguration(env, actor));
  const s = settings(env, actor);
  if (!s.configured)
    return fail(
      503,
      "not_configured",
      "착용 이미지 연결을 준비하고 있어요. 사진은 전송되지 않았어요.",
    );
  const id = path.startsWith("/api/try-on/jobs/")
    ? path.slice("/api/try-on/jobs/".length)
    : null;
  if (request.method !== "GET" && request.method !== "POST")
    return fail(405, "method_not_allowed", "지원하지 않는 요청이에요.");
  if (request.method === "POST" && (id !== null || path !== "/api/try-on/jobs"))
    return fail(404, "not_found", "요청을 찾지 못했어요.");
  if (request.method === "GET" && (!id || !UUID.test(id)))
    return fail(404, "not_found", "요청을 찾지 못했어요.");
  if (request.method === "POST" && request.headers.get("origin") !== url.origin)
    return fail(403, "invalid_origin", "앱에서 다시 요청해 주세요.");
  try {
    await schema(s.db);
    const at = now();
    const read = (id) =>
      s.db
        .prepare("SELECT * FROM tryon_jobs WHERE member=?1 AND id=?2")
        .bind(actor.member, id)
        .first();
    if (request.method === "POST") {
      if (
        request.headers.get("content-type")?.split(";")[0].trim() !==
        "application/json"
      )
        return fail(415, "invalid_body", "사진을 다시 골라 주세요.");
      if (Number(request.headers.get("content-length") || 0) > MAX_BODY)
        return fail(
          413,
          "too_large",
          "사진이 너무 커요. 작은 사본을 골라 주세요.",
        );
      const text = await request.text();
      if (text.length > MAX_BODY)
        return fail(413, "too_large", "사진이 너무 커요.");
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return fail(400, "invalid_body", "사진을 다시 골라 주세요.");
      }
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).sort().join(",") !==
          "consentVersion,garment,person,requestId,rightsConfirmed"
      )
        return fail(400, "invalid_body", "요청 형식이 맞지 않아요.");
      if (
        !UUID.test(body.requestId || "") ||
        body.consentVersion !== TRYON_CONSENT ||
        body.rightsConfirmed !== true
      )
        return fail(
          400,
          "consent_required",
          "사진 전송과 상품 사진 사용을 확인해 주세요.",
        );
      if (!tryOnJpeg(body.person) || !tryOnJpeg(body.garment))
        return fail(
          400,
          "invalid_image",
          "사진을 읽지 못했어요. JPEG 사진을 다시 골라 주세요.",
        );
      const digest = [
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(body.person + "\0" + body.garment),
          ),
        ),
      ]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      const existing = await read(body.requestId);
      if (existing)
        return existing.payload_hash === digest
          ? json(200, view(existing))
          : fail(
              409,
              "request_changed",
              "사진이 바뀌었어요. 새 생성 요청을 시작해 주세요.",
            );
      const iso = new Date(at).toISOString(),
        day = iso.slice(0, 10),
        month = iso.slice(0, 7);
      // One INSERT reserves global/member budgets and concurrency across isolates atomically.
      await s.db
        .prepare("DELETE FROM tryon_jobs WHERE created_at < ?1")
        .bind(at - 90 * 24 * 60 * 60000)
        .run();
      const inserted = await s.db
        .prepare(
          `INSERT OR IGNORE INTO tryon_jobs(member,id,payload_hash,state,created_at,expires_at,utc_day,utc_month,credits)
        SELECT ?1,?2,?3,'reserved',?4,?5,?6,?7,?8 WHERE
        COALESCE((SELECT SUM(credits) FROM tryon_jobs WHERE utc_day=?6),0)+?8<=?9 AND
        COALESCE((SELECT SUM(credits) FROM tryon_jobs WHERE utc_month=?7),0)+?8<=?10 AND
        COALESCE((SELECT SUM(credits) FROM tryon_jobs WHERE member=?1 AND utc_day=?6),0)+?8<=?11 AND
        (SELECT COUNT(*) FROM tryon_jobs WHERE state IN ('reserved','submitted') AND created_at>?12)<2 AND
        NOT EXISTS(SELECT 1 FROM tryon_jobs WHERE member=?1 AND state IN ('reserved','submitted') AND created_at>?12)`,
        )
        .bind(
          actor.member,
          body.requestId,
          digest,
          at,
          at + LIFETIME,
          day,
          month,
          TRYON_CREDITS,
          s.limits.daily,
          s.limits.monthly,
          s.limits.member,
          at - 10 * 60000,
        )
        .run();
      const row = await read(body.requestId);
      if (!row)
        return fail(
          429,
          "tryon_limit",
          "생성 한도에 닿았거나 진행 중인 요청이 있어요. 잠시 뒤 다시 확인해 주세요.",
        );
      if (row.payload_hash !== digest)
        return fail(
          409,
          "request_changed",
          "같은 요청 번호의 사진이 바뀌었어요.",
        );
      // Only the atomic INSERT winner calls the provider. A racing replay never submits again.
      if (inserted.meta?.changes !== 1) return json(202, view(row));
      let response, out;
      try {
        response = await fetchImpl("https://api.fashn.ai/v1/run", {
          method: "POST",
          redirect: "error",
          headers: {
            authorization: "Bearer " + env.FASHN_API_KEY.trim(),
            "content-type": "application/json",
          },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            model_name: TRYON_MODEL,
            inputs: {
              model_image: body.person,
              product_image: body.garment,
              generation_mode: "quality",
              resolution: "1k",
              num_images: 1,
              output_format: "jpeg",
              return_base64: true,
            },
          }),
        });
        out = await bounded(response, 16384);
      } catch {
        await s.db
          .prepare(
            "UPDATE tryon_jobs SET state='unknown' WHERE member=?1 AND id=?2",
          )
          .bind(actor.member, body.requestId)
          .run();
        return fail(
          502,
          "submission_unknown",
          "생성 접수 여부를 확인하지 못했어요. 중복 결제를 막기 위해 자동으로 다시 보내지 않아요.",
        );
      }
      if (
        !response.ok ||
        typeof out?.id !== "string" ||
        !/^[a-zA-Z0-9-]{10,100}$/.test(out.id) ||
        out.error
      ) {
        await s.db
          .prepare(
            "UPDATE tryon_jobs SET state='failed' WHERE member=?1 AND id=?2",
          )
          .bind(actor.member, body.requestId)
          .run();
        return fail(
          response.status === 429 ? 429 : 502,
          "provider_unavailable",
          "착용 이미지를 생성하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
        );
      }
      await s.db
        .prepare(
          "UPDATE tryon_jobs SET state='submitted',provider_id=?3 WHERE member=?1 AND id=?2",
        )
        .bind(actor.member, body.requestId, out.id)
        .run();
      return json(202, view(await read(body.requestId)));
    }
    const row = await read(id);
    if (!row) return fail(404, "not_found", "내 생성 요청을 찾지 못했어요.");
    if (row.expires_at <= at)
      return fail(410, "expired", "결과를 받을 수 있는 시간이 지났어요.");
    if (!row.provider_id)
      return json(200, {
        ...view(row),
        state:
          row.state === "reserved"
            ? at - row.created_at > 30000
              ? "unknown"
              : "starting"
            : row.state,
      });
    if (row.state === "failed") return json(200, view(row));
    const poll = await s.db
      .prepare(
        "UPDATE tryon_jobs SET next_poll_at=?3 WHERE member=?1 AND id=?2 AND next_poll_at<=?4",
      )
      .bind(actor.member, id, at + 3000, at)
      .run();
    if (poll.meta?.changes !== 1)
      return json(200, {
        ...view(row),
        state: row.state === "completed" ? "processing" : row.state,
      });
    let response, out;
    try {
      response = await fetchImpl(
        "https://api.fashn.ai/v1/status/" + row.provider_id,
        {
          headers: { authorization: "Bearer " + env.FASHN_API_KEY },
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        },
      );
      out = await bounded(response, MAX_OUTPUT);
    } catch {
      return fail(
        502,
        "status_unavailable",
        "연결을 확인하고 결과를 다시 확인해 주세요. 새로 생성하지는 않아요.",
      );
    }
    if (!response.ok)
      return fail(502, "status_unavailable", "생성 결과를 다시 확인해 주세요.");
    if (out.status === "completed") {
      if (
        !Array.isArray(out.output) ||
        out.output.length !== 1 ||
        !tryOnJpeg(out.output[0], 2 * MAX_IMAGE)
      )
        return fail(
          502,
          "invalid_output",
          "생성 이미지를 읽지 못했어요. 결과를 다시 확인해 주세요.",
        );
      await s.db
        .prepare(
          "UPDATE tryon_jobs SET state='completed' WHERE member=?1 AND id=?2",
        )
        .bind(actor.member, id)
        .run();
      return json(200, {
        ...view(row),
        state: "completed",
        image: out.output[0],
        note: "AI 착용 미리보기예요. 실제 사이즈·핏을 보장하지 않아요.",
      });
    }
    if (out.status === "failed") {
      await s.db
        .prepare(
          "UPDATE tryon_jobs SET state='failed' WHERE member=?1 AND id=?2",
        )
        .bind(actor.member, id)
        .run();
      return json(200, { ...view(row), state: "failed" });
    }
    if (!["starting", "in_queue", "processing"].includes(out.status))
      return fail(502, "invalid_output", "생성 상태를 확인하지 못했어요.");
    return json(200, { ...view(row), state: out.status });
  } catch {
    return fail(
      503,
      "tryon_unavailable",
      "생성 요청을 확인하지 못했어요. 같은 요청의 결과 확인을 이용해 주세요.",
    );
  }
}
