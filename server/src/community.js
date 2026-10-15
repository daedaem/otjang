// Outfit sharing among the members of this server.
//
// Off unless the operator turns it on (EOUL_COMMUNITY=on). Only signed-in
// members who agreed to the current community rules can read or post. A post
// holds the outfit shape (checked by the app's own validateCommunityLook), a
// short caption and, only when the member agreed for that post, up to four
// photos. A report hides the post for the reporter at once; three reports hide
// it for everyone until the operator looks (node cli.mjs community …).
// Leaving the community or deleting the account removes every post and photo.
import crypto from 'node:crypto';
import { HttpError } from './http-error.js';
import { transaction } from './db.js';
import {
  validateCommunityLook, validateCaption, nameProblem, COMMUNITY_RULES_VERSION, COMMUNITY_REPORT_REASONS,
  MAX_POST_PHOTOS, MAX_POST_PHOTO_BYTES,
} from '../../app/src/community-post.js';
import { stripJpegMetadata } from '../../app/src/jpeg-clean.js';

export const REPORTS_TO_HIDE = 3;
// Stored photos are bounded per member and for the whole server, so one member
// cannot fill the disk; deleting old posts frees room.
export const MAX_MEMBER_POSTS = 300;
export const MAX_MEMBER_PHOTOS = 120;
export const MAX_MEMBER_PHOTO_BYTES = 40 * 1024 * 1024;
const POST_ID = /^c_[A-Za-z0-9_-]{24}$/;
const PAGE = 20;
const MAX_JOIN_BODY = 4 * 1024;
const MAX_POST_BODY = Math.ceil((MAX_POST_PHOTOS * MAX_POST_PHOTO_BYTES * 4) / 3) + 64 * 1024;
const HOUR = 3600 * 1000;

function statements(db) {
  return {
    member: db.prepare('SELECT name, rules_version FROM community_members WHERE user_id = ?'),
    nameOwner: db.prepare('SELECT user_id FROM community_members WHERE name_key = ?'),
    upsertMember: db.prepare(`INSERT INTO community_members (user_id, name, name_key, rules_version, joined_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, name_key = excluded.name_key, rules_version = excluded.rules_version`),
    deleteMember: db.prepare('DELETE FROM community_members WHERE user_id = ?'),
    deleteUserPosts: db.prepare('DELETE FROM posts WHERE user_id = ?'),
    insertPost: db.prepare('INSERT INTO posts (id, user_id, created_at, look, caption) VALUES (?, ?, ?, ?, ?)'),
    insertPhoto: db.prepare('INSERT INTO post_photos (post_id, idx, bytes) VALUES (?, ?, ?)'),
    post: db.prepare('SELECT id, user_id, hidden_at FROM posts WHERE id = ?'),
    deletePost: db.prepare('DELETE FROM posts WHERE id = ?'),
    photo: db.prepare('SELECT bytes FROM post_photos WHERE post_id = ? AND idx = ?'),
    feed: db.prepare(`SELECT p.id, p.user_id, p.created_at, p.look, p.caption, p.hidden_at, p.hidden_reason, m.name,
        (SELECT COUNT(*) FROM post_photos f WHERE f.post_id = p.id) AS photo_count
      FROM posts p JOIN community_members m ON m.user_id = p.user_id
      WHERE (p.created_at < ? OR (p.created_at = ? AND p.id < ?)) AND (p.hidden_at IS NULL OR p.user_id = ?) AND (? = 0 OR p.user_id = ?)
        AND NOT EXISTS (SELECT 1 FROM post_reports r WHERE r.post_id = p.id AND r.user_id = ?)
      ORDER BY p.created_at DESC, p.id DESC LIMIT ?`),
    report: db.prepare('INSERT OR IGNORE INTO post_reports (post_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)'),
    reportCount: db.prepare('SELECT COUNT(*) AS n FROM post_reports WHERE post_id = ?'),
    hide: db.prepare('UPDATE posts SET hidden_at = ?, hidden_reason = ? WHERE id = ? AND hidden_at IS NULL'),
    memberPosts: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?'),
    memberPhotos: db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(length(f.bytes)), 0) AS bytes
      FROM post_photos f JOIN posts p ON p.id = f.post_id WHERE p.user_id = ?`),
    allPhotoBytes: db.prepare('SELECT COALESCE(SUM(length(bytes)), 0) AS bytes FROM post_photos'),
  };
}

function nameKey(name) {
  return name.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
}

function decodePhoto(entry) {
  if (!entry || typeof entry !== 'object' || entry.mime !== 'image/jpeg' || typeof entry.data !== 'string' ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.data))
    throw new HttpError(400, 'bad-photo', 'JPEG 사진만 올릴 수 있어요.');
  const bytes = Buffer.from(entry.data, 'base64');
  if (bytes.length > MAX_POST_PHOTO_BYTES) throw new HttpError(413, 'photo-too-large', '사진 한 장이 너무 커요.');
  if (bytes.length < 3 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
    throw new HttpError(400, 'bad-photo', 'JPEG 사진을 읽지 못했어요.');
  // Whatever the client did, no location, time or device metadata is stored or shown.
  try {
    return Buffer.from(stripJpegMetadata(bytes).bytes);
  } catch {
    throw new HttpError(400, 'bad-photo', 'JPEG 사진을 읽지 못했어요.');
  }
}

export function createCommunity({ db, enabled, maxBytes = 2 * 1024 ** 3, now, log = () => {}, authenticate, limit, readJson }) {
  const q = statements(db);

  function signedIn(req) {
    const session = authenticate(req);
    if (!enabled) throw new HttpError(404, 'feature-off', '이 서버는 커뮤니티를 켜지 않았어요.');
    return session;
  }
  function memberOf(userId) {
    const row = q.member.get(userId);
    if (!row || row.rules_version !== COMMUNITY_RULES_VERSION)
      throw new HttpError(403, 'join-required', '커뮤니티 규칙을 확인하고 이름을 정한 뒤 이용할 수 있어요.', { rulesVersion: COMMUNITY_RULES_VERSION });
    return row;
  }
  function visiblePost(id, userId) {
    if (!POST_ID.test(id)) throw new HttpError(400, 'bad-post-id', '글 번호가 올바르지 않아요.');
    const row = q.post.get(id);
    if (!row || (row.hidden_at && row.user_id !== userId)) throw new HttpError(404, 'not-found', '글을 찾지 못했어요. 지워졌거나 숨겨졌을 수 있어요.');
    return row;
  }

  const routes = {
    // Also when the feature is off, so a member can still find and remove what they posted.
    'GET /v1/community': (req) => {
      const session = authenticate(req);
      const row = q.member.get(session.userId);
      return {
        enabled,
        rulesVersion: COMMUNITY_RULES_VERSION,
        member: row ? { name: row.name, current: row.rules_version === COMMUNITY_RULES_VERSION, posts: q.memberPosts.get(session.userId).n } : null,
      };
    },

    'POST /v1/community/join': async (req) => {
      const session = signedIn(req);
      limit(`community-join:${session.userId}`, 10, HOUR);
      const body = await readJson(req, MAX_JOIN_BODY);
      if (body.rulesVersion !== COMMUNITY_RULES_VERSION || body.agree !== true)
        throw new HttpError(400, 'rules-required', '커뮤니티 규칙에 동의해야 해요. 화면을 새로고침한 뒤 다시 확인해 주세요.');
      const problem = nameProblem(body.name);
      if (problem) throw new HttpError(400, 'bad-name', problem);
      const name = body.name.trim(), key = nameKey(name);
      transaction(db, () => {
        const owner = q.nameOwner.get(key);
        if (owner && owner.user_id !== session.userId) throw new HttpError(409, 'name-taken', '이미 쓰는 이름이에요. 다른 이름을 정해 주세요.');
        q.upsertMember.run(session.userId, name, key, COMMUNITY_RULES_VERSION, now());
      });
      return { member: { name, current: true } };
    },

    // Leaving removes the display name and every post and photo of this member.
    // Allowed when the feature is off too: removing one's own posts is always possible.
    'DELETE /v1/community/me': (req) => {
      const session = authenticate(req);
      transaction(db, () => {
        q.deleteUserPosts.run(session.userId);
        q.deleteMember.run(session.userId);
      });
      log('community-left');
      return [204];
    },

    'GET /v1/community/posts': (req, url) => {
      const session = signedIn(req);
      memberOf(session.userId);
      // The cursor is "<created_at>.<id>" of the last post shown, so posts made in the same millisecond are not skipped.
      const cursor = /^(\d{1,16})\.(c_[A-Za-z0-9_-]{24})$/.exec(url.searchParams.get('before') || '');
      if (url.searchParams.get('before') && !cursor) throw new HttpError(400, 'bad-cursor', '목록 위치가 올바르지 않아요.');
      const [before, beforeId] = cursor ? [Number(cursor[1]), cursor[2]] : [Number.MAX_SAFE_INTEGER, ''];
      const mine = url.searchParams.get('mine') === '1' ? 1 : 0;
      const rows = q.feed.all(before, before, beforeId, session.userId, mine, session.userId, session.userId, PAGE + 1);
      return {
        posts: rows.slice(0, PAGE).map((row) => ({
          id: row.id,
          author: row.name,
          mine: row.user_id === session.userId,
          createdAt: new Date(row.created_at).toISOString(),
          look: JSON.parse(row.look),
          caption: row.caption,
          photoCount: row.photo_count,
          hidden: row.hidden_at ? (row.hidden_reason === 'reports' ? '신고가 모여 운영자 확인 전까지 숨겨졌어요.' : '운영자가 숨겼어요.') : null,
        })),
        next: rows.length > PAGE ? `${rows[PAGE - 1].created_at}.${rows[PAGE - 1].id}` : null,
      };
    },

    'POST /v1/community/posts': async (req) => {
      const session = signedIn(req);
      memberOf(session.userId);
      limit(`community-post:${session.userId}`, 10, HOUR);
      const body = await readJson(req, MAX_POST_BODY);
      const photos = body.photos ?? [];
      if (!Array.isArray(photos) || photos.length > MAX_POST_PHOTOS)
        throw new HttpError(400, 'bad-photo', `사진은 ${MAX_POST_PHOTOS}장까지 올릴 수 있어요.`);
      if (photos.length && body.photoConsent !== true)
        throw new HttpError(400, 'photo-consent-required', '사진을 올리려면 이 글의 사진 공개에 동의해 주세요.');
      try {
        validateCommunityLook(body.look, photos.length);
        validateCaption(body.caption ?? '');
      } catch (error) {
        throw new HttpError(400, 'invalid-post', error.message);
      }
      const bytes = photos.map(decodePhoto);
      const size = bytes.reduce((n, photo) => n + photo.length, 0);
      const id = `c_${crypto.randomBytes(18).toString('base64url')}`, t = now();
      transaction(db, () => {
        if (q.memberPosts.get(session.userId).n >= MAX_MEMBER_POSTS)
          throw new HttpError(413, 'community-quota', `글은 ${MAX_MEMBER_POSTS}개까지 남길 수 있어요. 예전 글을 지우면 다시 올릴 수 있어요.`);
        if (bytes.length) {
          const mine = q.memberPhotos.get(session.userId);
          if (mine.n + bytes.length > MAX_MEMBER_PHOTOS || mine.bytes + size > MAX_MEMBER_PHOTO_BYTES)
            throw new HttpError(413, 'community-quota', '올릴 수 있는 사진 용량을 다 썼어요. 예전 글을 지우면 다시 올릴 수 있어요. 사진 없이는 올릴 수 있어요.');
          if (q.allPhotoBytes.get().bytes + size > maxBytes)
            throw new HttpError(507, 'community-full', '이 서버의 회원 코디 사진 공간이 가득 찼어요. 사진 없이 올리거나 운영자에게 알려 주세요.');
        }
        q.insertPost.run(id, session.userId, t, JSON.stringify(body.look), body.caption ?? '');
        bytes.forEach((photo, idx) => q.insertPhoto.run(id, idx, photo));
      });
      log('community-post');
      return [201, { id, createdAt: new Date(t).toISOString() }];
    },
  };

  const dynamic = [
    [/^\/v1\/community\/posts\/([^/]+)$/, 'DELETE', (req, match) => {
      const session = authenticate(req); // the author can delete while the feature is off
      const row = visiblePost(match[1], session.userId);
      if (row.user_id !== session.userId) throw new HttpError(403, 'not-yours', '내가 올린 글만 지울 수 있어요.');
      q.deletePost.run(row.id);
      return [204];
    }],
    [/^\/v1\/community\/posts\/([^/]+)\/report$/, 'POST', async (req, match) => {
      const session = signedIn(req);
      memberOf(session.userId);
      limit(`community-report:${session.userId}`, 30, HOUR);
      const body = await readJson(req, MAX_JOIN_BODY);
      if (!Object.hasOwn(COMMUNITY_REPORT_REASONS, body.reason)) throw new HttpError(400, 'bad-reason', '신고 사유를 골라 주세요.');
      const row = visiblePost(match[1], session.userId);
      if (row.user_id === session.userId) throw new HttpError(400, 'own-post', '내 글은 신고 대신 지울 수 있어요.');
      const hidden = transaction(db, () => {
        q.report.run(row.id, session.userId, body.reason, now());
        if (q.reportCount.get(row.id).n >= REPORTS_TO_HIDE) return q.hide.run(now(), 'reports', row.id).changes > 0;
        return false;
      });
      if (hidden) log('community-hidden-by-reports');
      return { reported: true };
    }],
    [/^\/v1\/community\/posts\/([^/]+)\/photos\/(\d)$/, 'GET', (req, match) => {
      const session = signedIn(req);
      memberOf(session.userId);
      const row = visiblePost(match[1], session.userId);
      const photo = q.photo.get(row.id, Number(match[2]));
      if (!photo) throw new HttpError(404, 'not-found', '사진을 찾지 못했어요.');
      return { raw: { type: 'image/jpeg', bytes: Buffer.from(photo.bytes) } };
    }],
  ];

  /** The handler for this request, or null when it is not a community path. */
  function match(method, pathname) {
    const fixed = routes[`${method} ${pathname}`];
    if (fixed) return (req, url) => fixed(req, url);
    for (const [pattern, verb, handler] of dynamic) {
      const found = pattern.exec(pathname);
      if (found && verb === method) return (req) => handler(req, found);
    }
    return null;
  }
  return { match };
}

/** Operator tools for reported and hidden posts (node cli.mjs community …). */
export function communityAdmin(db, now = () => Date.now()) {
  const q = statements(db);
  return {
    review() {
      return db.prepare(`SELECT p.id, p.created_at, p.caption, p.hidden_at, p.hidden_reason, m.name,
          (SELECT COUNT(*) FROM post_photos f WHERE f.post_id = p.id) AS photos,
          (SELECT group_concat(reason) FROM post_reports r WHERE r.post_id = p.id) AS reasons
        FROM posts p LEFT JOIN community_members m ON m.user_id = p.user_id
        WHERE p.hidden_at IS NOT NULL OR EXISTS (SELECT 1 FROM post_reports r WHERE r.post_id = p.id)
        ORDER BY p.created_at DESC`).all().map((row) => ({
        id: row.id, author: row.name, createdAt: new Date(row.created_at).toISOString(),
        hidden: row.hidden_at ? row.hidden_reason : null, photos: row.photos,
        reports: (row.reasons || '').split(',').filter(Boolean), caption: row.caption.slice(0, 80),
      }));
    },
    hide(id) {
      return db.prepare('UPDATE posts SET hidden_at = ?, hidden_reason = ? WHERE id = ?').run(now(), 'operator', id).changes > 0;
    },
    // Restoring clears the reports it was reviewed for, so the same reports do not hide it again.
    restore(id) {
      return transaction(db, () => {
        db.prepare('DELETE FROM post_reports WHERE post_id = ?').run(id);
        return db.prepare('UPDATE posts SET hidden_at = NULL, hidden_reason = NULL WHERE id = ?').run(id).changes > 0;
      });
    },
    remove(id) {
      return q.deletePost.run(id).changes > 0;
    },
  };
}
