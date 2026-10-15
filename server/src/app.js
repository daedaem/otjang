// HTTP API for accounts, wardrobe sync and photos, plus the built app page.
// No framework: node:http, node:sqlite and node:crypto only.
//
// The wardrobe is synced as a whole snapshot with a revision number, the same
// model the app uses on the device (IndexedDB revision CAS). The server checks
// every snapshot with the app's own validateWardrobe, so it never stores a
// record the app could not read back.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateWardrobe } from '../../app/src/wardrobe.js';
import { MAX_GARMENT_PHOTO_BYTES } from '../../app/src/wardrobe-store.js';
import { transaction } from './db.js';
import {
  normalizeEmail, passwordProblem, hashPassword, verifyPassword, burnPasswordTime,
  newSessionToken, tokenHash, newUserId,
} from './auth.js';
import { createRateLimiter } from './rate-limit.js';
import { MASK_INPUT_BYTES } from './photo-mask.js';
// The sign-up notice the app shows and the version the server requires are one constant.
import { AGREEMENT_VERSION } from '../../app/src/account.js';

export { AGREEMENT_VERSION };
export const MAX_PHOTOS_PER_USER = 400; // 200 garments plus room for uploads not yet referenced
export const MAX_PHOTO_BYTES_PER_USER = 250 * 1024 * 1024;
const MAX_AUTH_BODY = 16 * 1024;
const MAX_WARDROBE_BODY = 1100 * 1024; // state is capped at 850KB by validateWardrobe
const UNREFERENCED_PHOTO_GRACE_MS = 24 * 3600 * 1000;
const PHOTO_ID = /^p_[a-f0-9]{64}$/;
const HOUR = 3600 * 1000;

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function send(res, status, body, headers = {}) {
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), ...headers });
  res.end(text);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new HttpError(413, 'too-large', '보내는 자료가 너무 커요.'));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0, failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        reject(new HttpError(413, 'too-large', '보내는 자료가 너무 커요.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', (error) => { if (!failed) { failed = true; reject(error); } });
  });
}

async function readJson(req, limit) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || ''))
    throw new HttpError(415, 'json-required', 'JSON 형식으로 보내 주세요.');
  const raw = await readBody(req, limit);
  try {
    const value = JSON.parse(raw.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new HttpError(400, 'bad-json', '보낸 자료를 읽지 못했어요.');
  }
}

function sameText(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function referencedPhotos(state) {
  return new Set((state?.garments || []).map((garment) => garment.photoId).filter(Boolean));
}

export function createApp({ db, config, maskService = null, supply = null, mailer = null, now = () => Date.now(), log = () => {} }) {
  const mail = mailer || { enabled: false, kind: 'off', reason: '메일 발송이 설정되지 않았어요.' };
  const limiter = createRateLimiter({ now });
  const q = {
    identity: db.prepare("SELECT user_id, email, password_hash FROM identities WHERE provider = 'email' AND subject = ?"),
    insertUser: db.prepare('INSERT INTO users (id, created_at, agreement_version, agreed_at) VALUES (?, ?, ?, ?)'),
    insertIdentity: db.prepare("INSERT INTO identities (provider, subject, user_id, email, password_hash, created_at) VALUES ('email', ?, ?, ?, ?, ?)"),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?)'),
    session: db.prepare('SELECT s.user_id, s.last_used_at, s.expires_at, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'),
    touchSession: db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    userEmail: db.prepare("SELECT email, password_hash, verified_at FROM identities WHERE provider = 'email' AND user_id = ?"),
    insertEmailToken: db.prepare('INSERT INTO email_tokens (token_hash, user_id, purpose, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'),
    emailToken: db.prepare('SELECT user_id, purpose, email, expires_at, used_at FROM email_tokens WHERE token_hash = ?'),
    useEmailTokens: db.prepare('UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL'),
    setVerified: db.prepare("UPDATE identities SET verified_at = ? WHERE provider = 'email' AND user_id = ? AND email = ?"),
    setPassword: db.prepare("UPDATE identities SET password_hash = ? WHERE provider = 'email' AND user_id = ?"),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    pruneEmailTokens: db.prepare('DELETE FROM email_tokens WHERE expires_at <= ?'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    wardrobe: db.prepare('SELECT revision, state, updated_at FROM wardrobes WHERE user_id = ?'),
    wardrobeMeta: db.prepare('SELECT revision, updated_at FROM wardrobes WHERE user_id = ?'),
    upsertWardrobe: db.prepare(`INSERT INTO wardrobes (user_id, revision, state, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, state = excluded.state, updated_at = excluded.updated_at`),
    photo: db.prepare('SELECT bytes FROM photos WHERE user_id = ? AND id = ?'),
    photoExists: db.prepare('SELECT 1 AS found FROM photos WHERE user_id = ? AND id = ?'),
    photoList: db.prepare('SELECT id, created_at FROM photos WHERE user_id = ?'),
    photoUsage: db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM photos WHERE user_id = ?'),
    insertPhoto: db.prepare('INSERT OR IGNORE INTO photos (user_id, id, bytes, size, created_at) VALUES (?, ?, ?, ?, ?)'),
    deletePhoto: db.prepare('DELETE FROM photos WHERE user_id = ? AND id = ?'),
  };

  function clientAddress(req) {
    const socket = req.socket?.remoteAddress || 'unknown';
    if (config.trustProxy === 'cloudflare' && /^(127\.|::1$|::ffff:127\.)/.test(socket)) {
      const forwarded = req.headers['cf-connecting-ip'];
      if (typeof forwarded === 'string' && forwarded.length < 64) return forwarded;
    }
    return socket;
  }

  function limit(key, count, windowMs) {
    if (!limiter.take(key, count, windowMs))
      throw new HttpError(429, 'rate-limited', '시도가 너무 많아요. 잠시 후 다시 해 주세요.');
  }

  const VERIFY_MINUTES = 24 * 60, RESET_MINUTES = 30;
  async function sendEmailLink(userId, email, purpose) {
    const token = newSessionToken(), t = now();
    const minutes = purpose === 'verify' ? VERIFY_MINUTES : RESET_MINUTES;
    transaction(db, () => {
      // A new link replaces earlier unused ones of the same purpose.
      q.useEmailTokens.run(t, userId, purpose);
      q.insertEmailToken.run(tokenHash(token), userId, purpose, email, t, t + minutes * 60000);
    });
    const link = `${mail.publicUrl}/#${purpose}=${token}`;
    const text = purpose === 'verify'
      ? `어울 계정의 이메일을 확인하려면 아래 링크를 열어 주세요. 24시간 동안 한 번만 쓸 수 있어요.

${link}

가입하지 않았다면 이 메일은 무시해 주세요.`
      : `어울 비밀번호를 다시 정하려면 아래 링크를 열어 주세요. ${RESET_MINUTES}분 동안 한 번만 쓸 수 있어요.

${link}

요청하지 않았다면 이 메일은 무시해 주세요. 비밀번호는 바뀌지 않아요.`;
    await mail.send({ to: email, subject: purpose === 'verify' ? '어울 이메일 확인' : '어울 비밀번호 재설정', text });
  }
  // Marks a one-time link used and returns its row, or refuses it.
  function takeToken(token, purpose) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token))
      throw new HttpError(400, 'bad-token', '링크가 올바르지 않아요.');
    const row = q.emailToken.get(tokenHash(token));
    if (!row || row.purpose !== purpose || row.used_at || row.expires_at <= now())
      throw new HttpError(400, 'bad-token', purpose === 'verify' ? '확인 링크가 만료됐거나 이미 썼어요. 프로필에서 다시 보내 주세요.' : '링크가 만료됐거나 이미 썼어요. 비밀번호 찾기를 다시 해 주세요.');
    q.useEmailTokens.run(now(), row.user_id, purpose);
    return row;
  }

  function startSession(userId) {
    const token = newSessionToken(), t = now();
    q.insertSession.run(tokenHash(token), userId, t, t, t + config.sessionDays * 24 * HOUR);
    return token;
  }

  function authenticate(req) {
    const header = req.headers.authorization || '';
    const match = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(header);
    if (!match) throw new HttpError(401, 'signed-out', '다시 로그인해 주세요.');
    const hash = tokenHash(match[1]);
    const row = q.session.get(hash);
    const t = now();
    if (!row || row.expires_at <= t) {
      if (row) q.deleteSession.run(hash);
      throw new HttpError(401, 'signed-out', '로그인이 만료됐어요. 다시 로그인해 주세요.');
    }
    // Sliding expiry, written at most once an hour per session.
    if (t - row.last_used_at > HOUR) q.touchSession.run(t, t + config.sessionDays * 24 * HOUR, hash);
    return { userId: row.user_id, tokenHash: hash, createdAt: row.created_at };
  }

  function account(userId, createdAt) {
    const identity = q.userEmail.get(userId);
    const meta = q.wardrobeMeta.get(userId);
    const usage = q.photoUsage.get(userId);
    return {
      user: { id: userId, email: identity?.email ?? null, createdAt: new Date(createdAt).toISOString() },
      providers: identity ? ['email'] : [],
      emailVerified: !!identity?.verified_at,
      wardrobe: { revision: meta?.revision ?? 0, updatedAt: meta ? new Date(meta.updated_at).toISOString() : null },
      photos: { count: usage.count, bytes: usage.bytes },
    };
  }

  const routes = {
    'GET /v1/health': () => ({
      ok: true,
      api: 1,
      agreementVersion: AGREEMENT_VERSION,
      signup: { inviteRequired: !!config.inviteCode },
      providers: { email: true, kakao: false, google: false },
      features: { photoMask: !!maskService, offers: !!supply, email: !!mail.enabled },
      supply: supply ? supply.sources().map(({ id, name, status, needs = [] }) => ({ id, name, status, needs })) : [],
    }),

    'POST /v1/auth/signup': async (req) => {
      const ip = clientAddress(req);
      limit(`signup:${ip}`, 10, HOUR);
      const body = await readJson(req, MAX_AUTH_BODY);
      const email = normalizeEmail(body.email);
      if (!email) throw new HttpError(400, 'invalid-email', '이메일 주소를 확인해 주세요.');
      const problem = passwordProblem(body.password);
      if (problem) throw new HttpError(400, 'weak-password', problem);
      if (config.inviteCode && !sameText(body.inviteCode ?? '', config.inviteCode))
        throw new HttpError(403, 'invite-required', '초대 코드가 맞지 않아요. 운영자에게 받은 코드를 입력해 주세요.');
      const a = body.agreements;
      if (!a || a.version !== AGREEMENT_VERSION || a.terms !== true || a.privacy !== true || a.age14 !== true)
        throw new HttpError(400, 'agreement-required', '필수 항목에 동의해야 가입할 수 있어요. 화면을 새로고침한 뒤 다시 확인해 주세요.');
      if (q.identity.get(email)) throw new HttpError(409, 'email-taken', '이미 가입한 이메일이에요. 로그인해 주세요.');
      const hash = await hashPassword(body.password, config.scryptLog2N);
      const userId = newUserId(), t = now();
      const token = transaction(db, () => {
        if (q.identity.get(email)) throw new HttpError(409, 'email-taken', '이미 가입한 이메일이에요. 로그인해 주세요.');
        q.insertUser.run(userId, t, AGREEMENT_VERSION, t);
        q.insertIdentity.run(email, userId, email, hash, t);
        return startSession(userId);
      });
      log('signup');
      // The first verification mail goes out in the background; sign-up never waits for it.
      if (mail.enabled) sendEmailLink(userId, email, 'verify').catch((error) => log('mail-failed', error.message));
      return [201, { token, ...account(userId, t) }];
    },

    'POST /v1/auth/login': async (req) => {
      const ip = clientAddress(req);
      limit(`login-ip:${ip}`, 30, 15 * 60 * 1000);
      const body = await readJson(req, MAX_AUTH_BODY);
      const email = normalizeEmail(body.email);
      if (email) limit(`login-email:${email}`, 10, 15 * 60 * 1000);
      const identity = email ? q.identity.get(email) : null;
      if (!identity) {
        await burnPasswordTime(body.password, config.scryptLog2N);
        throw new HttpError(401, 'invalid-credentials', '이메일 또는 비밀번호가 맞지 않아요.');
      }
      if (!(await verifyPassword(body.password, identity.password_hash)))
        throw new HttpError(401, 'invalid-credentials', '이메일 또는 비밀번호가 맞지 않아요.');
      const token = startSession(identity.user_id);
      const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(identity.user_id);
      return [200, { token, ...account(identity.user_id, user.created_at) }];
    },

    // ── Email verification and password reset with one-time, expiring links.
    'POST /v1/auth/verify/request': async (req) => {
      const session = authenticate(req);
      if (!mail.enabled) throw new HttpError(503, 'mail-off', `메일 발송이 아직 설정되지 않았어요. 운영자에게 문의해 주세요. (${mail.reason})`);
      limit(`verify:${session.userId}`, 3, HOUR);
      const identity = q.userEmail.get(session.userId);
      if (!identity) throw new HttpError(404, 'not-found', '이메일 계정이 아니에요.');
      if (identity.verified_at) return { sent: false, emailVerified: true };
      await sendEmailLink(session.userId, identity.email, 'verify');
      return [202, { sent: true, expiresInMinutes: VERIFY_MINUTES }];
    },
    'POST /v1/auth/verify/confirm': async (req) => {
      limit(`verify-confirm:${clientAddress(req)}`, 20, HOUR);
      const body = await readJson(req, MAX_AUTH_BODY);
      const row = takeToken(body.token, 'verify');
      q.setVerified.run(now(), row.user_id, row.email);
      return { emailVerified: true };
    },
    // Always the same answer, whether or not the email has an account.
    'POST /v1/auth/password/forgot': async (req) => {
      const ip = clientAddress(req);
      limit(`forgot-ip:${ip}`, 5, HOUR);
      const body = await readJson(req, MAX_AUTH_BODY);
      const email = normalizeEmail(body.email);
      if (!email) throw new HttpError(400, 'invalid-email', '이메일 주소를 확인해 주세요.');
      if (!mail.enabled) throw new HttpError(503, 'mail-off', '메일 발송이 아직 설정되지 않아 비밀번호를 재설정할 수 없어요. 운영자에게 문의해 주세요.');
      const identity = q.identity.get(email);
      if (identity && limiter.take(`forgot-email:${email}`, 3, HOUR))
        await sendEmailLink(identity.user_id, email, 'reset').catch((error) => log('mail-failed', error.message));
      return [202, { message: `가입한 이메일이면 재설정 링크를 보냈어요. ${RESET_MINUTES}분 안에 한 번만 쓸 수 있어요.` }];
    },
    'POST /v1/auth/password/reset': async (req) => {
      limit(`reset:${clientAddress(req)}`, 10, HOUR);
      const body = await readJson(req, MAX_AUTH_BODY);
      const problem = passwordProblem(body.password);
      if (problem) throw new HttpError(400, 'weak-password', problem);
      const peek = q.emailToken.get(tokenHash(String(body.token || '')));
      if (!peek || peek.purpose !== 'reset' || peek.used_at || peek.expires_at <= now())
        throw new HttpError(400, 'bad-token', '링크가 만료됐거나 이미 썼어요. 비밀번호 찾기를 다시 해 주세요.');
      const hash = await hashPassword(body.password, config.scryptLog2N);
      transaction(db, () => {
        const row = takeToken(body.token, 'reset');
        q.setPassword.run(hash, row.user_id);
        // Proving the mailbox also verifies it; every device signs in again.
        q.setVerified.run(now(), row.user_id, row.email);
        q.deleteUserSessions.run(row.user_id);
      });
      log('password-reset');
      return { reset: true };
    },

    'POST /v1/auth/logout': (req) => {
      const session = authenticate(req);
      q.deleteSession.run(session.tokenHash);
      return [204];
    },

    'GET /v1/me': (req) => {
      const session = authenticate(req);
      return account(session.userId, session.createdAt);
    },

    // Deleting the account removes the user, every session, the wardrobe and
    // every photo in one transaction. Backups taken earlier still hold copies.
    'DELETE /v1/me': async (req) => {
      const session = authenticate(req);
      limit(`delete:${session.userId}`, 5, 15 * 60 * 1000);
      const body = await readJson(req, MAX_AUTH_BODY);
      const identity = q.userEmail.get(session.userId);
      if (!identity || !(await verifyPassword(body.password ?? '', identity.password_hash)))
        throw new HttpError(401, 'invalid-credentials', '비밀번호가 맞지 않아요.');
      transaction(db, () => q.deleteUser.run(session.userId));
      try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
      log('account-deleted');
      return [204];
    },

    // Seller prices for one product from the connected sources. Signed in only,
    // to keep third-party quotas for this server's own users.
    'GET /v1/offers': async (req, url) => {
      const session = authenticate(req);
      if (!supply) throw new HttpError(404, 'feature-off', '이 서버는 가격 조회를 켜지 않았어요.');
      limit(`offers:${session.userId}`, 30, 10 * 60 * 1000);
      const productId = url.searchParams.get('productId');
      if (productId !== null && !/^ms-\d{1,16}$/.test(productId)) throw new HttpError(400, 'bad-product', '상품 번호가 올바르지 않아요.');
      const query = (url.searchParams.get('q') || '').slice(0, 100);
      if (!productId && !query.trim()) throw new HttpError(400, 'bad-query', '상품 번호나 검색어가 필요해요.');
      return supply.lookup({ productId, query });
    },

    'GET /v1/wardrobe': (req, url) => {
      const session = authenticate(req);
      if (url.searchParams.get('meta') === '1') {
        const meta = q.wardrobeMeta.get(session.userId);
        return { revision: meta?.revision ?? 0, updatedAt: meta ? new Date(meta.updated_at).toISOString() : null };
      }
      const row = q.wardrobe.get(session.userId);
      if (!row) return { revision: 0, updatedAt: null, state: null, photoIds: [] };
      const state = JSON.parse(row.state);
      return { revision: row.revision, updatedAt: new Date(row.updated_at).toISOString(), state, photoIds: [...referencedPhotos(state)] };
    },

    'PUT /v1/wardrobe': async (req) => {
      const session = authenticate(req);
      const body = await readJson(req, MAX_WARDROBE_BODY);
      if (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0)
        throw new HttpError(400, 'bad-revision', '동기화 기준 버전이 올바르지 않아요.');
      if (body.state?.schema !== 5)
        throw new HttpError(400, 'old-app', '앱을 새로고침한 뒤 다시 저장해 주세요.');
      try {
        validateWardrobe(body.state);
      } catch (error) {
        throw new HttpError(400, 'invalid-wardrobe', error.message || '옷장 형식을 확인하지 못했어요.');
      }
      const text = JSON.stringify(body.state);
      const needed = referencedPhotos(body.state);
      const result = transaction(db, () => {
        const old = q.wardrobe.get(session.userId);
        const current = old?.revision ?? 0;
        if (current !== body.baseRevision)
          throw new HttpError(409, 'conflict', '다른 기기에서 계정 옷장이 바뀌었어요.', {
            revision: current, updatedAt: old ? new Date(old.updated_at).toISOString() : null,
          });
        const missing = [...needed].filter((id) => !q.photoExists.get(session.userId, id));
        if (missing.length) throw new HttpError(409, 'missing-photos', '사진을 먼저 올려야 해요.', { missing });
        const revision = current + 1, t = now();
        q.upsertWardrobe.run(session.userId, revision, text, t);
        // Collect a photo only when this change removed its last reference, or
        // when an upload was never referenced for a day (an abandoned sync).
        const before = old ? referencedPhotos(JSON.parse(old.state)) : new Set();
        for (const row of q.photoList.all(session.userId))
          if (!needed.has(row.id) && (before.has(row.id) || t - row.created_at > UNREFERENCED_PHOTO_GRACE_MS))
            q.deletePhoto.run(session.userId, row.id);
        return { revision, updatedAt: new Date(t).toISOString() };
      });
      return result;
    },
  };

  // A 320×320 RGB copy in, a 320×320 mask out. Held only in memory; not stored or logged.
  async function photoMaskRoute(req, res) {
    const session = authenticate(req);
    if (!maskService) throw new HttpError(404, 'feature-off', '이 서버는 사진 배경 처리를 켜지 않았어요.');
    limit(`mask:${session.userId}`, 60, 10 * 60 * 1000);
    if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/octet-stream')
      throw new HttpError(415, 'bytes-required', '사진 픽셀을 바이트로 보내 주세요.');
    const rgb = await readBody(req, MASK_INPUT_BYTES);
    if (rgb.length !== MASK_INPUT_BYTES) throw new HttpError(400, 'bad-size', '사진 크기가 맞지 않아요.');
    let mask;
    try {
      mask = await maskService.mask(new Uint8Array(rgb.buffer, rgb.byteOffset, rgb.length));
    } catch (error) {
      if (error.code === 'busy') throw new HttpError(503, 'busy', '서버가 다른 사진을 처리하고 있어요.');
      throw error;
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': mask.length, 'Cache-Control': 'no-store' });
    res.end(Buffer.from(mask.buffer, mask.byteOffset, mask.length));
  }

  async function photoRoute(req, res, method, id) {
    const session = authenticate(req);
    if (method === 'GET') {
      const row = q.photo.get(session.userId, id);
      if (!row) throw new HttpError(404, 'not-found', '사진을 찾지 못했어요.');
      const bytes = Buffer.from(row.bytes);
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
      res.end(bytes);
      return;
    }
    if (method !== 'PUT') throw new HttpError(405, 'method', '지원하지 않는 요청이에요.');
    if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'image/jpeg')
      throw new HttpError(415, 'jpeg-required', 'JPEG 사진만 올릴 수 있어요.');
    const bytes = await readBody(req, MAX_GARMENT_PHOTO_BYTES);
    if (bytes.length < 3 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
      throw new HttpError(400, 'not-jpeg', 'JPEG 사진을 읽지 못했어요.');
    // The id is the SHA-256 of the bytes, the same rule as the app's photoAsset.
    if (`p_${crypto.createHash('sha256').update(bytes).digest('hex')}` !== id)
      throw new HttpError(400, 'photo-mismatch', '사진과 이름이 맞지 않아요.');
    const stored = transaction(db, () => {
      if (q.photoExists.get(session.userId, id)) return false;
      const usage = q.photoUsage.get(session.userId);
      if (usage.count >= MAX_PHOTOS_PER_USER || usage.bytes + bytes.length > MAX_PHOTO_BYTES_PER_USER)
        throw new HttpError(413, 'photo-quota', '계정에 저장할 수 있는 사진 용량을 넘었어요.');
      q.insertPhoto.run(session.userId, id, bytes, bytes.length, now());
      return true;
    });
    send(res, stored ? 201 : 200, { id });
  }

  function serveApp(res) {
    let html;
    try {
      html = fs.readFileSync(config.appFile, 'utf8');
    } catch {
      send(res, 404, { error: { code: 'app-not-built', message: '앱을 먼저 빌드해 주세요: node app/tools/build.mjs' } });
      return;
    }
    // The page learns that its API lives on this same origin.
    const meta = '<meta name="eoul-api" content="same-origin">';
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => `${head}\n${meta}`) : `${meta}\n${html}`;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Frame-Options': 'DENY',
    });
    res.end(html);
  }

  let lastSweep = 0;
  async function handle(req, res) {
    const started = now();
    const url = new URL(req.url || '/', 'http://localhost');
    const method = req.method || 'GET';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (origin && config.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    try {
      if (started - lastSweep > HOUR) {
        lastSweep = started;
        q.deleteExpired.run(started);
        q.pruneEmailTokens.run(started - 7 * 24 * HOUR);
      }
      if (method === 'OPTIONS') return send(res, 204);
      if (url.pathname.startsWith('/v1/')) res.setHeader('Cache-Control', 'no-store');
      if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return serveApp(res);
      if (method === 'POST' && url.pathname === '/v1/photo-mask') return await photoMaskRoute(req, res);
      const photo = /^\/v1\/photos\/([^/]+)$/.exec(url.pathname);
      if (photo) {
        if (!PHOTO_ID.test(photo[1])) throw new HttpError(400, 'bad-photo-id', '사진 이름이 올바르지 않아요.');
        await photoRoute(req, res, method, photo[1]);
        return;
      }
      const route = routes[`${method} ${url.pathname}`];
      if (!route) throw new HttpError(404, 'not-found', '없는 주소예요.');
      const result = await route(req, url);
      if (Array.isArray(result)) send(res, result[0], result[1]);
      else send(res, 200, result);
    } catch (error) {
      if (error instanceof HttpError) {
        send(res, error.status, { error: { code: error.code, message: error.message, ...error.extra } });
      } else {
        log('error', error);
        if (!res.headersSent) send(res, 500, { error: { code: 'server-error', message: '서버에서 문제가 생겼어요. 잠시 후 다시 해 주세요.' } });
        else res.destroy();
      }
    } finally {
      // Paths and status only: no tokens, emails or bodies in the log.
      log('request', `${method} ${url.pathname} ${res.statusCode} ${now() - started}ms`);
    }
  }

  return { handle };
}
