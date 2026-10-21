// Official affiliate search only: transient display and original commission links.
// No product database, model input, image proxy, account reports or link rewriting.
import { authorizePrivateRequest } from '../lib/private-access.js';
const ORIGIN = 'https://biz.adpick.co.kr';
const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const clean = (s, max) => typeof s === 'string' && s.length <= max && !/[\x00-\x1f\x7f]/.test(s) ? s.trim() : '';
// Names observed on the official public partner page and authenticated search/guide.
// Partnership is not proof that search is supported; only live returned offers are shown.
const domestic = new Set(['쿠팡', '11번가', 'CJ온스타일', 'GS SHOP', 'Hmall', 'H패션몰', 'W컨셉', '더블유컨셉코리아', '필웨이', '포스티', '교복몰', 'SSG', '롯데홈쇼핑', '보리보리'].map((s) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()));
const domesticShop = (name) => domestic.has(name.normalize('NFKC').replace(/\s+/g, '').toLowerCase());
const words = (s) => s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
// The provider's real search also returned unrelated products. Require every literal
// keyword in the title, without inventing synonyms, translating or modifying it.
const matches = (name, query) => words(query).every((word) => words(name).join(' ').includes(word));
function safeURL(value, key, commission = false) {
  try {
    const u = new URL(value);
    if (typeof value !== 'string' || value.length > 4096 || value.includes(key) || u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    if (commission && !['link.adpick.co.kr', 'adpick.co.kr', 'www.adpick.co.kr', 'bitl.bz'].includes(u.hostname)) return null;
    if (!commission && (!/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(u.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(u.hostname))) return null;
    return u.href;
  } catch { return null; }
}
export function offers(data, key, query = '') {
  if (data?.success !== true || !Array.isArray(data.data)) return null;
  return data.data.slice(0, 20).flatMap((p) => {
    const name = clean(p?.title, 1200), shop = clean(p?.cp_name, 160), code = clean(p?.cp_code, 80);
    const url = safeURL(p?.commissionlink, key, true);
    const price = typeof p?.price === 'number' && Number.isSafeInteger(p.price) && p.price > 0 ? `${p.price.toLocaleString('ko-KR')}원` : clean(p?.price, 80);
    if (!name || !shop || !domesticShop(shop) || !code || !price || !url || !matches(name, query) || [name, shop, code, price].some((s) => s.includes(key))) return [];
    return [{ name, shop, code, price, currency: 'KRW', url, image: safeURL(p?.photo, key) }];
  }).slice(0, 12);
}
export function malls(data, key) {
  if (data?.success !== true || !Array.isArray(data.data)) return null;
  return data.data.slice(0, 200).flatMap((p) => {
    const code = clean(p?.cp_code, 80), name = clean(p?.name, 160);
    return code && name && !code.includes(key) && !name.includes(key) ? [{ code, name }] : [];
  });
}
export async function takeSlot(db, kind, now = Date.now()) {
  if (!db) return false;
  await db.prepare('CREATE TABLE IF NOT EXISTS external_source_usage (bucket TEXT PRIMARY KEY, used INTEGER NOT NULL, expires INTEGER NOT NULL)').run();
  const seconds = Math.floor(now / 1000), minute = Math.floor(seconds / 60);
  const results = await db.batch([
    db.prepare('DELETE FROM external_source_usage WHERE expires < ?').bind(seconds),
    ...[[`adpick:${kind}:s:${seconds}`, 1], [`adpick:${kind}:m:${minute}`, kind === 'malls' ? 60 : 10]].map(([bucket, limit]) => db.prepare('INSERT INTO external_source_usage (bucket, used, expires) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used').bind(bucket, seconds + 120, limit)),
  ]);
  return results[1]?.results?.length === 1 && results[2]?.results?.length === 1;
}
export async function handleAdpick(request, env, { fetcher = fetch, now = Date.now(), timeoutMs = 8000 } = {}) {
  if (request.method !== 'GET') return reply(405, { code: 'method_not_allowed', message: 'GET만 받아요.' });
  const u = new URL(request.url), kind = u.pathname === '/api/adpick/malls' ? 'malls' : u.pathname === '/api/adpick' ? 'search' : null;
  if (!kind) return reply(404, { code: 'not_found' });
  const q = u.searchParams.get('q');
  if (kind === 'search' && (!clean(q, 100) || q.trim().length < 2 || !words(q).length || new TextEncoder().encode(q).length > 300)) return reply(400, { code: 'invalid', message: '브랜드나 상품명을 2~100자로 입력해 주세요.' });
  if (![...u.searchParams.keys()].every((name) => kind === 'search' && name === 'q')) return reply(400, { code: 'invalid', message: '지원하지 않는 검색 조건이에요.' });
  const key = env?.ADPICK_API_KEY;
  if (typeof key !== 'string' || !/^[\x21-\x7e]{8,256}$/.test(key)) return reply(503, { code: 'not_configured', message: '국내 상품 검색 연결을 준비하고 있어요.' });
  try {
    if (!env.RANK_DB) return reply(503, { code: 'not_configured', message: '국내 상품 검색 연결을 준비하고 있어요.' });
    if (!await takeSlot(env.RANK_DB, kind, now)) return reply(429, { code: 'rate_limited', message: '잠시 후 다시 검색해 주세요.' });
  } catch { return reply(503, { code: 'unavailable', message: '국내 상품 검색 연결을 준비하고 있어요.' }); }
  const api = new URL(`/api/${encodeURIComponent(key)}/${kind}`, ORIGIN);
  api.search = kind === 'search' ? new URLSearchParams({ q: q.trim(), limit: '20' }).toString() : new URLSearchParams({ rewardmalls: 'false', order: 'popular' }).toString();
  const controller = new AbortController(); let timer;
  try {
    const result = await Promise.race([
      (async () => {
        const res = await fetcher(api.href, { headers: { Accept: 'application/json' }, redirect: 'manual', cache: 'no-store', signal: controller.signal });
        if (!res.ok) return { status: res.status };
        const reader = res.body?.getReader(); if (!reader) throw Error('empty');
        const parts = []; let size = 0;
        try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1000000) throw Error('oversized'); parts.push(value); } }
        catch (error) { void reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
        const bytes = new Uint8Array(size); let pos = 0;
        for (const part of parts) { bytes.set(part, pos); pos += part.length; }
        return { status: res.status, data: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('timeout')); }, timeoutMs); }),
    ]);
    if (result.status < 200 || result.status >= 300 || result.data?.success !== true) {
      const limited = result.status === 429;
      return reply(limited ? 429 : 502, { code: limited ? 'rate_limited' : 'provider_unavailable', message: limited ? '잠시 후 다시 검색해 주세요.' : '애드픽 상품을 불러오지 못했어요. 계정 승인과 API 설정을 확인해 주세요.' });
    }
    const items = kind === 'malls' ? malls(result.data, key) : offers(result.data, key, q.trim());
    if (!items) throw Error('shape');
    // The key is in the provider URL by its specification. Never return/log that URL or raw errors.
    return reply(200, { source: 'ADPICK', [kind === 'malls' ? 'malls' : 'items']: items,
      ...(kind === 'search' ? { omitted: Math.max(0, Math.min(result.data.data.length, 20) - items.length) } : {}), fetchedAt: new Date(now).toISOString() });
  } catch {
    return reply(502, { code: controller.signal.aborted ? 'upstream_timeout' : 'upstream', message: '국내 상품을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' });
  } finally { clearTimeout(timer); }
}
export const onRequest = async ({ request, env }) => {
  let access; try { access = await authorizePrivateRequest(request, env); } catch {}
  if (access?.ok !== true) return reply(access?.status === 401 ? 401 : 503, { code: 'unauthorized', message: '본인 전용 로그인이 필요해요.' });
  return handleAdpick(request, env);
};
