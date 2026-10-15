// Account and wardrobe sync with the operator's own server (server/).
//
// The app stays local-first: every change is committed to IndexedDB first and
// the screen never waits for the network. A signed-in device then copies the
// committed snapshot to the server in the background. Nothing is merged
// silently: when both this device and the account changed since the last sync,
// or this device's storage was replaced (eviction, recovery), the user chooses.

// Bump with the sign-up notice below; the server refuses an outdated version.
// 2026-10-15.2: purposes now include background removal on the operator's server.
export const AGREEMENT_VERSION = '2026-10-15.2';
export const ACCOUNT_KEY = 'eoul:account';
const DEVICE_LOCAL_FIELDS = ['legacyFingerprint', 'legacyBaseline', 'legacyDismissed'];

export class AccountError extends Error {
  constructor(message, { status = 0, code = 'error', extra = {} } = {}) {
    super(message);
    this.name = 'AccountError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** Where the API lives: the page's <meta name="eoul-api">, or null when no server is set up. */
export function accountServer(doc = globalThis.document, loc = globalThis.location) {
  const content = String(doc?.querySelector?.('meta[name="eoul-api"]')?.content || '').trim();
  if (!content) return null;
  if (content === 'same-origin') return loc?.origin && /^https?:/.test(loc.origin) ? loc.origin : null;
  try {
    const url = new URL(content);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function readAccount(storage = globalThis.localStorage, server = null) {
  try {
    const value = JSON.parse(storage?.getItem(ACCOUNT_KEY) || 'null');
    if (!value || value.v !== 1 || value.server !== server || typeof value.email !== 'string') return null;
    return value;
  } catch {
    return null;
  }
}

export function writeAccount(storage = globalThis.localStorage, value) {
  try {
    storage?.setItem(ACCOUNT_KEY, JSON.stringify({ v: 1, ...value }));
  } catch {}
}

export function clearAccount(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(ACCOUNT_KEY);
  } catch {}
}

export function createAccountApi({ base, token = null, fetch: fetchImpl = globalThis.fetch }) {
  async function request(method, path, { json, body, type, raw = false } = {}) {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(json !== undefined ? { 'Content-Type': 'application/json' } : type ? { 'Content-Type': type } : {}),
        },
        body: json !== undefined ? JSON.stringify(json) : body,
      });
    } catch (cause) {
      throw new AccountError('서버에 연결하지 못했어요. 이 기기에는 그대로 저장돼 있어요.', { code: 'offline' });
    }
    if (response.status === 204) return null;
    if (response.ok && raw) return response.blob();
    let data = null;
    try {
      data = await response.json();
    } catch {}
    if (!response.ok) {
      const { code = 'error', message, ...extra } = data?.error || {};
      throw new AccountError(message || `서버가 요청을 처리하지 못했어요 (${response.status}).`, { status: response.status, code, extra });
    }
    return data;
  }
  return {
    health: () => request('GET', '/v1/health'),
    signup: (fields) => request('POST', '/v1/auth/signup', { json: fields }),
    login: (fields) => request('POST', '/v1/auth/login', { json: fields }),
    logout: () => request('POST', '/v1/auth/logout'),
    me: () => request('GET', '/v1/me'),
    deleteAccount: (password) => request('DELETE', '/v1/me', { json: { password } }),
    wardrobeMeta: () => request('GET', '/v1/wardrobe?meta=1'),
    wardrobe: () => request('GET', '/v1/wardrobe'),
    offers: ({ productId = null, q = '' } = {}) => request('GET', `/v1/offers?${new URLSearchParams({ ...(productId ? { productId } : {}), ...(q ? { q } : {}) })}`),
    putWardrobe: (baseRevision, state) => request('PUT', '/v1/wardrobe', { json: { baseRevision, state } }),
    putPhoto: (id, blob) => request('PUT', `/v1/photos/${encodeURIComponent(id)}`, { body: blob, type: 'image/jpeg' }),
    getPhoto: (id) => request('GET', `/v1/photos/${encodeURIComponent(id)}`, { raw: true }),
    // A 320×320 RGB copy in, a 320×320 mask out; the server keeps neither.
    photoMask: async (rgb) => new Uint8Array(await (await request('POST', '/v1/photo-mask', { body: rgb, type: 'application/octet-stream', raw: true })).arrayBuffer()),
  };
}

/** Nothing personal yet: the example closet, no purchases, no saved products. */
export function isEmptyWardrobe(state) {
  return !!state && state.demo === true && !state.garments?.length && !state.journeys?.length && !state.saved?.length;
}

/**
 * What to do now, from the last sync point this device remembers.
 * synced: { remoteRevision, localEpoch, localRevision } or null (never synced here).
 * local:  { revision, epoch, empty }    remote: { revision }
 * Returns 'none' | 'push' | 'pull' | 'choose'.
 */
export function syncDecision({ synced, local, remote }) {
  const fresh = () => (remote.revision === 0 ? 'push' : local.empty ? 'pull' : 'choose');
  // A different local database (cleared, evicted, recovered) is not a change
  // made on top of the synced copy: it must never overwrite the account.
  if (!synced || !local.epoch || synced.localEpoch !== local.epoch) return fresh();
  const localChanged = local.revision !== synced.localRevision;
  const remoteChanged = remote.revision !== synced.remoteRevision;
  if (!localChanged && !remoteChanged) return 'none';
  if (localChanged && !remoteChanged) return 'push';
  // The account moved forward on another device and this one did not change.
  if (!localChanged && remote.revision > synced.remoteRevision) return 'pull';
  // Both changed, or the server went back (restored from an older backup).
  return 'choose';
}

async function eachLimited(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Copy one committed local snapshot to the account. Photos go only when the
 * server says it lacks them, two at a time.
 */
export async function pushWardrobe({ api, snapshot, baseRevision, onPhoto = () => {} }) {
  try {
    return await api.putWardrobe(baseRevision, snapshot.state);
  } catch (error) {
    if (error.code !== 'missing-photos') throw error;
    const missing = (error.extra.missing || []).filter((id) => snapshot.photos.has(id));
    if (missing.length !== (error.extra.missing || []).length)
      throw new AccountError('이 기기에 없는 사진이 옷장에 연결돼 있어요. 다시 불러온 뒤 시도해 주세요.', { code: 'local-photo-missing' });
    let done = 0;
    await eachLimited(missing, 2, async (id) => {
      await api.putPhoto(id, snapshot.photos.get(id));
      onPhoto(++done, missing.length);
    });
    return api.putWardrobe(baseRevision, snapshot.state);
  }
}

/**
 * Download the account's wardrobe and verify every photo against its id
 * (verify = the app's photoAsset). Nothing local changes here.
 */
export async function pullWardrobe({ api, verify, remote = null, onPhoto = () => {} }) {
  const data = remote?.state ? remote : await api.wardrobe();
  if (!data?.state) throw new AccountError('계정에 저장된 옷장이 아직 없어요.', { code: 'empty' });
  const assets = [];
  let done = 0;
  await eachLimited(data.photoIds || [], 3, async (id) => {
    const blob = await api.getPhoto(id);
    const asset = await verify(new Blob([blob], { type: 'image/jpeg' }));
    if (asset.id !== id) throw new AccountError('받은 사진이 손상됐어요. 다시 시도해 주세요.', { code: 'photo-mismatch' });
    assets.push(asset);
    onPhoto(++done, data.photoIds.length);
  });
  return { revision: data.revision, updatedAt: data.updatedAt, state: data.state, assets };
}

/** The account's wardrobe with this device's migration markers kept. */
export function withDeviceFields(remoteState, localState) {
  const next = { ...remoteState };
  for (const key of DEVICE_LOCAL_FIELDS) if (localState && Object.hasOwn(localState, key)) next[key] = localState[key];
  return next;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
/** Same wardrobe apart from this device's migration markers (photos are named by their content). */
export function sameWardrobe(a, b) {
  if (!a || !b) return false;
  const strip = (state) => {
    const copy = { ...state };
    for (const key of DEVICE_LOCAL_FIELDS) delete copy[key];
    return JSON.stringify(canonical(copy));
  };
  return strip(a) === strip(b);
}

export function wardrobeSummary(state, photoCount = null) {
  if (!state) return '비어 있음';
  const garments = state.demo ? 0 : state.garments.length;
  const parts = [garments ? `옷 ${garments}벌` : '개인 옷 없음'];
  if (photoCount) parts.push(`사진 ${photoCount}장`);
  if (state.journeys?.length) parts.push(`구매 기록 ${state.journeys.length}개`);
  if (state.saved?.length) parts.push(`찜 ${state.saved.length}개`);
  return parts.join(' · ');
}
