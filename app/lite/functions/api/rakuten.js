// Official API only. Display in provider order, linking to the original offer.
// No database copy, currency conversion, image transformation, AI forwarding or affiliate rewriting.
import { authorizePrivateRequest } from '../lib/private-access.js';
export const ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const text = (s, max) => typeof s === 'string' && s.length <= max && !/[\x00-\x1f\x7f]/.test(s) ? s.trim() : '';
const secret = (s) => typeof s === 'string' && /^[\x21-\x7e]{8,512}$/.test(s) ? s : null;
function safeURL(value, hosts) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && hosts.includes(u.hostname) ? u.href : null;
  } catch { return null; }
}
export function offers(data) {
  if (!Array.isArray(data?.Items)) return null;
  return data.Items.slice(0, 12).flatMap((entry) => {
    const p = entry?.Item || entry;
    const name = text(p?.itemName, 1200), shop = text(p?.shopName, 160);
    const url = safeURL(p?.itemUrl, ['item.rakuten.co.jp', 'www.rakuten.co.jp']);
    if (!name || !shop || !url || !Number.isSafeInteger(p?.itemPrice) || p.itemPrice <= 0 || p.availability !== 1) return [];
    const image = (Array.isArray(p.mediumImageUrls) ? p.mediumImageUrls : []).map((x) => safeURL(x?.imageUrl, ['thumbnail.image.rakuten.co.jp', 'image.rakuten.co.jp', 'tshop.r10s.jp', 'shop.r10s.jp'])).find(Boolean) || null;
    return [{ name, shop, url, image, price: p.itemPrice, currency: 'JPY', taxFlag: p.taxFlag === 0 || p.taxFlag === 1 ? p.taxFlag : null }];
  });
}
export async function takeSlot(db, now = Date.now()) {
  if (!db) return false;
  await db.prepare('CREATE TABLE IF NOT EXISTS external_source_usage (bucket TEXT PRIMARY KEY, used INTEGER NOT NULL, expires INTEGER NOT NULL)').run();
  const seconds = Math.floor(now / 1000), minute = Math.floor(seconds / 60);
  const results = await db.batch([
    db.prepare('DELETE FROM external_source_usage WHERE expires < ?').bind(seconds),
    ...[[`rakuten:s:${seconds}`, 1], [`rakuten:m:${minute}`, 10]].map(([bucket, limit]) => db.prepare('INSERT INTO external_source_usage (bucket, used, expires) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used').bind(bucket, seconds + 120, limit)),
  ]);
  return results[1]?.results?.length === 1 && results[2]?.results?.length === 1;
}

export async function handleRakuten(request, env, { fetcher = fetch, now = Date.now(), timeoutMs = 8000 } = {}) {
  if (request.method !== 'GET') return reply(405, { code: 'method_not_allowed', message: 'GET만 받아요.' });
  const q = new URL(request.url).searchParams.get('q');
  if (!q || q.trim().length < 2 || !text(q, 80) || new TextEncoder().encode(q).length > 128) return reply(400, { code: 'invalid', message: '브랜드나 상품명을 짧게 입력해 주세요.' });
  const appId = secret(env?.RAKUTEN_APPLICATION_ID), accessKey = secret(env?.RAKUTEN_ACCESS_KEY);
  if (!appId || !accessKey) return reply(503, { code: 'not_configured', message: '라쿠텐 API 연결 준비 중이에요. 라쿠텐 사이트에서 검색할 수 있어요.' });
  try {
    if (!env.RANK_DB) return reply(503, { code: 'not_configured', message: '검색 연결을 준비하고 있어요.' });
    if (!await takeSlot(env.RANK_DB, now)) return reply(429, { code: 'rate_limited', message: '잠시 후 다시 검색해 주세요.' });
  } catch { return reply(503, { code: 'unavailable', message: '검색 연결을 준비하고 있어요.' }); }
  const api = new URL(ENDPOINT);
  api.search = new URLSearchParams({ applicationId: appId, keyword: q.trim(), format: 'json', hits: '12', page: '1', availability: '1', elements: 'itemName,itemPrice,itemUrl,mediumImageUrls,availability,shopName,taxFlag' }).toString();
  const controller = new AbortController();
  let timer;
  try {
    // Race also bounds a test/upstream fetcher that ignores AbortSignal.
    const upstream = async () => {
      const res = await fetcher(api.toString(), { headers: { accessKey, Accept: 'application/json' }, redirect: 'error', cache: 'no-store', signal: controller.signal });
      if (!res.ok) return { status: res.status };
      // Bound memory as well as elapsed time. Never expose an upstream error body.
      const reader = res.body?.getReader();
      if (!reader) throw new Error('empty');
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1000000) throw new Error('oversized');
          chunks.push(value);
        }
      } catch (error) { reader.cancel().catch(() => {}); throw error; }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return { status: res.status, data: JSON.parse(new TextDecoder().decode(bytes)) };
    };
    const result = await Promise.race([
      upstream(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs); }),
    ]);
    if (result.status === 404) return reply(200, { source: 'Rakuten Ichiba', items: [], fetchedAt: new Date(now).toISOString() });
    if (result.status < 200 || result.status >= 300) return reply(result.status === 429 ? 429 : 502, { code: result.status === 429 ? 'rate_limited' : 'upstream', message: '라쿠텐 검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' });
    const items = offers(result.data);
    if (!items) throw new Error('invalid');
    return reply(200, { source: 'Rakuten Ichiba', items, fetchedAt: new Date(now).toISOString() });
  } catch { return reply(502, { code: 'upstream', message: '라쿠텐 검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }); }
  finally { clearTimeout(timer); }
}
// Pages entry also fails closed; Worker invokes handle only after its central gate.
export const onRequest = async ({ request, env }) => {
  let access;
  try { access = await authorizePrivateRequest(request, env); } catch {}
  if (access?.ok !== true) return reply(access?.status === 401 ? 401 : 503, { code: 'unauthorized', message: '본인 전용 로그인이 필요해요.' });
  return handleRakuten(request, env);
};
