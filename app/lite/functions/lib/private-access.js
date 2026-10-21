// Access is the private proxy gate; a caller-supplied header alone is not authentication.
// Validate RS256 with only this configured team's authoritative keys. No tokens/IPs are retained.
import { authorizeSession } from './private-session.js';
const TTL = 5 * 60 * 1000;
const REFRESH_GAP = 30 * 1000;
const MAX_BODY = 64 * 1024;
const caches = new WeakMap(); // fetch function -> at most 16 configured issuers; never token keyed
const denied = () => ({ ok: false, status: 401, code: 'unauthorized' });
const unconfigured = () => ({ ok: false, status: 503, code: 'not_configured' });

function configuration(env) {
  const domain = typeof env?.ACCESS_TEAM_DOMAIN === 'string' ? env.ACCESS_TEAM_DOMAIN.trim() : '';
  // Accept the documented https origin or a bare team hostname, never userinfo/ports/paths.
  const match = /^(?:https:\/\/)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com)\/?$/i.exec(domain);
  const aud = typeof env?.ACCESS_AUD === 'string' ? env.ACCESS_AUD.trim() : '';
  if (!match || !aud || aud.length > 512 || /[\s\x00-\x1f\x7f]/.test(aud)) return null;
  return { issuer: `https://${match[1].toLowerCase()}`, aud };
}

function bytes(segment, max) {
  if (!segment || segment.length > max || !/^[A-Za-z0-9_-]+$/.test(segment) || segment.length % 4 === 1) throw Error();
  const binary = atob(segment.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function object(segment, max) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(segment, max)));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
  return value;
}

const numericDate = (n) => Number.isSafeInteger(n) && n >= 0;
function validClaims(p, config, seconds) {
  const aud = typeof p.aud === 'string' ? [p.aud] : p.aud;
  return p.iss === config.issuer && Array.isArray(aud) && aud.length > 0 && aud.length <= 16 &&
    aud.every((a) => typeof a === 'string' && a.length <= 512) && aud.includes(config.aud) &&
    numericDate(p.exp) && numericDate(p.iat) && p.exp > seconds && p.iat <= seconds && p.iat < p.exp &&
    (p.nbf === undefined || (numericDate(p.nbf) && p.nbf <= seconds && p.nbf < p.exp));
}

async function boundedJson(response) {
  if (!response.ok || !response.body) throw Error();
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) throw Error();
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) throw Error();
      parts.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { data.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
}

async function fetchKeys(issuer, fetchImpl) {
  const controller = new AbortController();
  let timer;
  try {
    const work = async () => {
      const response = await fetchImpl(`${issuer}/cdn-cgi/access/certs`, {
        method: 'GET', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const body = await boundedJson(response);
      if (!Array.isArray(body?.keys) || !body.keys.length || body.keys.length > 32) throw Error();
      return body.keys.filter((k) => k && typeof k === 'object' && k.kty === 'RSA' &&
        typeof k.kid === 'string' && k.kid.length > 0 && k.kid.length <= 256 &&
        (k.alg === undefined || k.alg === 'RS256') && (k.use === undefined || k.use === 'sig') &&
        (k.key_ops === undefined || (Array.isArray(k.key_ops) && k.key_ops.includes('verify'))) &&
        typeof k.n === 'string' && k.n.length >= 342 && k.n.length <= 1366 &&
        typeof k.e === 'string' && k.e.length <= 12);
    };
    return await Promise.race([
      work(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error()); }, 2000); }),
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}

async function keysFor(issuer, kid, fetchImpl, ms) {
  let cache = caches.get(fetchImpl);
  if (!cache) { cache = new Map(); caches.set(fetchImpl, cache); }
  let entry = cache.get(issuer);
  const fresh = entry && ms >= entry.at && ms - entry.at < TTL;
  // An unknown kid may be rotation. Bound refreshes so arbitrary kids cannot bypass caching.
  if (fresh && (entry.keys.some((k) => k.kid === kid) || ms - entry.at < REFRESH_GAP)) return entry.keys;
  if (entry?.pending) return entry.pending;
  if (!entry) {
    if (cache.size >= 16) cache.delete(cache.keys().next().value);
    entry = { at: 0, keys: [] };
    cache.set(issuer, entry);
  }
  const previous = entry;
  entry.pending = fetchKeys(issuer, fetchImpl).then((keys) => {
    previous.keys = keys;
    previous.at = ms;
    return keys;
  }).catch((error) => {
    // Never keep expired keys or fall back to them after a failed refresh.
    cache.delete(issuer);
    throw error;
  }).finally(() => { delete previous.pending; });
  return entry.pending;
}

export async function authorizePrivateRequest(request, env, { fetchImpl = fetch, now = Date.now } = {}) {
  // Session mode is an explicit owner-only alternative. Never silently fall back from
  // a missing or failed Access configuration, and reject mistyped modes closed.
  if (env?.PRIVATE_AUTH_MODE === 'session') return authorizeSession(request, env, { now });
  if (env?.PRIVATE_AUTH_MODE !== undefined && env.PRIVATE_AUTH_MODE !== 'access') return unconfigured();
  const config = configuration(env);
  if (!config) return unconfigured();
  try {
    const ms = now();
    if (!Number.isFinite(ms) || ms < 0 || typeof fetchImpl !== 'function') return denied();
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (typeof token !== 'string' || token.length > 16384) return denied();
    const parts = token.split('.');
    if (parts.length !== 3) return denied();
    const header = object(parts[0], 2048);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 256 ||
      header.crit !== undefined || header.b64 !== undefined) return denied();
    const payload = object(parts[1], 12288);
    if (!validClaims(payload, config, Math.floor(ms / 1000))) return denied();
    const signature = bytes(parts[2], 1366);
    const keys = (await keysFor(config.issuer, header.kid, fetchImpl, ms)).filter((k) => k.kid === header.kid);
    if (keys.length !== 1) return denied();
    const key = await crypto.subtle.importKey('jwk', keys[0], { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (key.algorithm.modulusLength < 2048) return denied();
    const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    // The key request may take time: do not authorize a token that expired while waiting.
    return verified && validClaims(payload, config, Math.floor(now() / 1000)) ? { ok: true } : denied();
  } catch { return denied(); }
}
