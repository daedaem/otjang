/*
 * Sync — 앱(브라우저 저장)과 내 서버(server/, Spring Boot) 사이의 보내기·받기. 사용자가 단추를 누를 때만 움직이고 자동으로 보내지 않는다.
 * 서버 API: POST /api/wardrobe/import (+ Idempotency-Key), GET /api/wardrobe, POST /api/catalog/import, GET /api/catalog.
 * 사진: 주소가 이 컴퓨터(localhost·127.0.0.1)일 때만 기본으로 함께 보낸다. 다른 주소면 기본으로 빼고, 사용자가 고를 때만 보낸다.
 * 받은 자료는 Wardrobe.cleanWardrobe / Catalog.cleanCatalog 로 다시 정리한다(서버도 믿지 않는다).
 *
 *  normalizeBase(url) → 'http(s)://호스트[:포트]' 또는 ''         isLocalAddress(base) → boolean
 *  wardrobePayload(state, { photos }) → 옷장 파일(스키마 2) — 보유·후보·처분 모두, 판정 기록 포함
 *  catalogPayload(state, { photos }) → 상품 목록 파일(스키마 1)
 *  mergePulled(localItems, pulledItems) → 받은 옷 목록. 서버에 내 사진이 없고 이 브라우저에 있으면 내 사진을 남긴다
 *  idempotencyKey(text) → Promise<'otjang-' + SHA-256 앞 32자>  — 같은 내용을 다시 보내면 서버가 저장된 결과를 돌려준다
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./wardrobe.js'));
  else root.Sync = factory(root.Wardrobe);
})(typeof self !== 'undefined' ? self : this, function (W) {
  'use strict';

  function normalizeBase(url) {
    if (typeof url !== 'string') return '';
    const m = /^\s*(https?):\/\/([a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])(:\d{1,5})?\/?\s*$/i.exec(url);
    if (!m) return '';
    const port = m[3] ? Number(m[3].slice(1)) : 0;
    if (m[3] && (port < 1 || port > 65535)) return '';
    return m[1].toLowerCase() + '://' + m[2].toLowerCase() + (m[3] || '');
  }

  function isLocalAddress(base) {
    const b = normalizeBase(base);
    if (!b) return false;
    const host = b.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const CONTRACT = 2;
  const FOLLOWUP = {
    outcomes: ['purchased', 'not-purchased', 'pending', 'returned'],
    sizeResults: ['right', 'small', 'large', 'unknown'],
    returnReasons: ['size', 'fit', 'color', 'material', 'quality', 'changed', 'price', 'other', 'unknown']
  };
  const FOLLOWUP_KEYS = ['outcome', 'worn', 'regret', 'sizeResult', 'returnReason', 'note', 'at'];
  const NO_DECISION = JSON.stringify({ presence: 'absent-decision' });
  const NO_FOLLOWUP = JSON.stringify({ presence: 'null-followup' });

  function followupFingerprint(decision) {
    const clean = W.cleanDecision(decision);
    if (!clean) return NO_DECISION;
    return clean.followup ? JSON.stringify({ presence: 'present', values: FOLLOWUP_KEYS.map((key) => clean.followup[key]) }) : NO_FOLLOWUP;
  }

  function explicitFollowup(decision) {
    const raw = decision && decision.followup, cleaned = W.cleanDecision(decision)?.followup;
    return !!raw && !!cleaned && FOLLOWUP_KEYS.every((key) => Object.prototype.hasOwnProperty.call(raw, key) && raw[key] === cleaned[key]);
  }
  function explicitFollowupState(decision) {
    return !!W.cleanDecision(decision) && Object.prototype.hasOwnProperty.call(decision, 'followup') && (decision.followup === null || explicitFollowup(decision));
  }

  function cleanFollowupAck(raw) {
    if (!raw || typeof raw !== 'object' || !normalizeBase(raw.origin) || !Number.isSafeInteger(raw.ownerId) || raw.ownerId < 1 || !Number.isSafeInteger(raw.serverVersion) || raw.serverVersion < 0 || !Array.isArray(raw.decisions) || raw.decisions.length > 500) return null;
    const seen = new Set(), decisions = [];
    for (const d of raw.decisions) {
      if (!d || typeof d.id !== 'string' || !d.id || W.str(d.id, 40) !== d.id || typeof d.itemId !== 'string' || !d.itemId || W.str(d.itemId, 40) !== d.itemId || typeof d.fingerprint !== 'string' || d.fingerprint.length > 2500) return null;
      let parsed; try { parsed = JSON.parse(d.fingerprint); } catch (e) { return null; }
      // Normalize old fixed-order arrays and values with the same current cleaner
      // used for local state, so a calendar-cleanup upgrade creates no false edit.
      if (!Array.isArray(parsed) && (!parsed || typeof parsed !== 'object' || Object.keys(parsed).sort().join(',') !== (parsed.presence === 'present' ? 'presence,values' : 'presence'))) return null;
      const values = Array.isArray(parsed) ? parsed : parsed.presence === 'present' ? parsed.values : null;
      let fingerprint;
      if (values) {
        if (!Array.isArray(values) || values.length !== FOLLOWUP_KEYS.length) return null;
        const followup = Object.fromEntries(FOLLOWUP_KEYS.map((key, i) => [key, values[i]]));
        const fixture = { before: { lean: 'unsure' }, after: { decision: 'buy' }, followup }, cleaned = W.cleanDecision(fixture).followup;
        if (!cleaned || !FOLLOWUP_KEYS.filter((key) => key !== 'at').every((key) => followup[key] === cleaned[key]) || typeof followup.at !== 'string' || (followup.at !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(followup.at))) return null;
        fingerprint = followupFingerprint(fixture);
      } else if (parsed && ['absent-decision', 'null-followup'].includes(parsed.presence)) fingerprint = parsed.presence === 'absent-decision' ? NO_DECISION : NO_FOLLOWUP;
      else return null;
      const key = d.id + '\u0000' + d.itemId; if (seen.has(key)) return null; seen.add(key);
      decisions.push({ id: d.id, itemId: d.itemId, fingerprint });
    }
    if (raw.capture != null && !['push', 'pull'].includes(raw.capture)) return null;
    if (raw.completeSnapshot != null && typeof raw.completeSnapshot !== 'boolean') return null;
    const capture = raw.capture || 'push';
    return { origin: normalizeBase(raw.origin), ownerId: raw.ownerId, serverVersion: raw.serverVersion, capture, completeSnapshot: capture === 'pull' && raw.completeSnapshot === true, decisions };
  }

  /** Capture the exact acknowledged payload/snapshot, never state after an await. */
  function makeFollowupAck(source, decisions) {
    return cleanFollowupAck({ ...source, decisions: (Array.isArray(decisions) ? decisions : []).filter((d) => d && W.cleanDecision(d)).map((d) => ({ id: d.id, itemId: d.itemId, fingerprint: followupFingerprint(d) })) });
  }

  // These values are absent from the old server contract. Inspect all decisions,
  // including records for candidates, owned garments and garments already removed.
  function protectedFollowups(decisions) {
    return (Array.isArray(decisions) ? decisions : []).filter((d) => d && d.followup && (
      d.followup.outcome === 'returned' ||
      (typeof d.followup.sizeResult === 'string' && d.followup.sizeResult !== 'unknown') ||
      (typeof d.followup.returnReason === 'string' && d.followup.returnReason !== 'unknown')));
  }

  /** A 404 or explicit old contract is legacy; an unreadable/malformed reply is not. */
  function checkPushSupport(decisions, discovery) {
    const protectedCount = protectedFollowups(decisions).length;
    const status = discovery && discovery.status, meta = discovery && discovery.meta;
    const legacy = status === 404 || (status === 200 && meta && Number.isSafeInteger(meta.contract) && meta.contract >= 0 && meta.contract < CONTRACT);
    if (legacy) return { ok: protectedCount === 0, reason: protectedCount ? 'legacy-followup' : '', protectedCount };
    if (status !== 200 || !meta || !Number.isSafeInteger(meta.contract) || meta.contract < CONTRACT || meta.wardrobeSchema !== W.SCHEMA ||
      !meta.followup || !Object.keys(FOLLOWUP).every((key) => Array.isArray(meta.followup[key]) && FOLLOWUP[key].every((value) => meta.followup[key].includes(value))))
      return { ok: false, reason: 'unverified-capabilities', protectedCount };
    return { ok: true, reason: '', protectedCount };
  }

  /** Protect local results; permit a newer complete correction of an acknowledged result. */
  function checkPullProtection(localDecisions, pulledDecisions, context) {
    const local = new Map((Array.isArray(localDecisions) ? localDecisions : []).filter(Boolean).map((d) => [d.id + '\u0000' + d.itemId, d]));
    const pulled = new Map((Array.isArray(pulledDecisions) ? pulledDecisions : []).filter(Boolean).map((d) => [d.id + '\u0000' + d.itemId, d]));
    const losses = [], acknowledgedChanges = [], keptLocal = [], conflicts = [], conflictRows = [], ack = cleanFollowupAck(context && context.ack);
    const source = context && context.source, discovery = context && context.discovery;
    const sourceMatches = ack && source && normalizeBase(source.origin) === ack.origin && source.ownerId === ack.ownerId && Number.isSafeInteger(context.serverVersion) && context.serverVersion >= ack.serverVersion;
    const newer = sourceMatches && context.serverVersion > ack.serverVersion;
    const serverSupports = discovery && discovery.status === 200 && discovery.meta && discovery.meta.contract >= CONTRACT && checkPushSupport([], discovery).ok;
    const baseline = new Map((ack ? ack.decisions : []).map((d) => [d.id + '\u0000' + d.itemId, d.fingerprint]));
    const targets = new Set([...baseline.keys(), ...Array.from(local).filter(([, d]) => d.followup).map(([key]) => key)]);
    for (const key of targets) {
      const d = local.get(key), next = pulled.get(key), from = d && d.followup, to = next && next.followup;
      const [id, itemId] = key.split('\u0000'), mine = followupFingerprint(d), theirs = followupFingerprint(next);
      const fields = [];
      if (from || to) for (const field of FOLLOWUP_KEYS) if (!from || !to || !Object.prototype.hasOwnProperty.call(to, field) || to[field] !== from[field]) fields.push(field);
      if (mine !== theirs && !fields.length) fields.push('presence');
      if (next && !explicitFollowupState(next) && (from || baseline.has(key)) && !fields.length) fields.push('followup');
      if (fields.length) {
        const change = { id, itemId, fields }, base = baseline.has(key) ? baseline.get(key) : ack?.completeSnapshot ? NO_DECISION : undefined;
        const incomingExplicit = explicitFollowupState(next);
        const chooseConflict = (localOnly) => {
          const conflict = { ...change, key, local: from ? clone(from) : null, remote: to ? clone(to) : null, localFingerprint: mine, remoteFingerprint: theirs, localOnly };
          conflictRows.push(conflict);
          const choice = context.resolutions && context.resolutions[key];
          if (choice && choice.localFingerprint === mine && choice.remoteFingerprint === theirs && (choice.value === 'local' || (!localOnly && choice.value === 'server'))) {
            if (choice.value === 'server') acknowledgedChanges.push(change);
            else keptLocal.push({ ...change, decision: d ? clone(d) : null });
          } else conflicts.push(conflict);
        };
        if (!sourceMatches || !serverSupports) {
          const actor = source && normalizeBase(source.origin) && Number.isSafeInteger(source.ownerId) && source.ownerId > 0 && Number.isSafeInteger(context.serverVersion) && context.serverVersion >= 0;
          const staleSameSource = ack && source && ack.origin === normalizeBase(source.origin) && ack.ownerId === source.ownerId && context.serverVersion < ack.serverVersion;
          // Without a trusted baseline automatic replacement stays blocked. The
          // user can explicitly retain their local result after a complete,
          // authenticated current GET; this establishes a safe next-push version.
          if (actor && serverSupports && !staleSameSource && context.completeIncoming && d && (incomingExplicit || !next)) chooseConflict(true);
          else losses.push(change);
        }
        else if (base === undefined) {
          // A successful upsert does not prove missing records were absent from
          // the server. A complete current GET can offer explicit keep-local
          // recovery, but never invent a deletion from an omitted record.
          if (context.completeIncoming && d && (incomingExplicit || !next)) chooseConflict(!next);
          else losses.push(change);
        }
        else if (mine !== base && theirs === base && (incomingExplicit || (base === NO_DECISION && !next))) keptLocal.push({ ...change, decision: d ? clone(d) : null });
        else if (!incomingExplicit) losses.push(change);
        else if (!newer) losses.push(change);
        else if (next.followup === null && context.completeIncoming) chooseConflict(false); // clearing a valid record needs an explicit choice
        else if (!explicitFollowup(next)) losses.push(change);
        else if (mine === base) acknowledgedChanges.push(change);
        else chooseConflict(false);
      }
    }
    const keep = new Map(keptLocal.map((row) => [row.id + '\u0000' + row.itemId, row.decision]));
    const decisions = (Array.isArray(pulledDecisions) ? pulledDecisions : []).filter(Boolean).filter((d) => !keep.has(d.id + '\u0000' + d.itemId) || keep.get(d.id + '\u0000' + d.itemId)).map((d) => {
      const value = clone(d), key = d.id + '\u0000' + d.itemId;
      if (keep.has(key)) value.followup = clone(keep.get(key).followup);
      return value;
    });
    for (const [key, d] of keep) if (d && !pulled.has(key)) decisions.push(clone(d));
    return { ok: losses.length === 0 && conflicts.length === 0, losses, acknowledgedChanges, keptLocal, conflicts, conflictRows, decisions };
  }

  function mergePullPlanItems(localItems, pulledItems, plan) {
    const mine = new Map(localItems.map((item) => [item.id, item]));
    const keep = new Set((plan.keptLocal || []).map((row) => row.itemId));
    const merged = mergePulled(localItems, pulledItems).filter((item) => !keep.has(item.id) || mine.has(item.id)).map((item) => keep.has(item.id) && mine.has(item.id) ? { ...item, status: mine.get(item.id).status, boughtYear: mine.get(item.id).boughtYear } : item);
    const received = new Set(merged.map((item) => item.id));
    for (const id of keep) if (mine.has(id) && !received.has(id)) merged.push(clone(mine.get(id)));
    return merged;
  }

  function completePullSnapshot(raw, clean) {
    const stable = (v) => JSON.stringify(v, function (key, value) { return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]])) : value; });
    return !!raw && !!clean && Array.isArray(clean.items) && Array.isArray(clean.decisions) && Array.isArray(raw.items) && raw.items.length <= 500 && Array.isArray(raw.decisions) && raw.decisions.length <= 500 && raw.items.length === clean.items.length && raw.decisions.length === clean.decisions.length && stable(raw.items) === stable(clean.items) && stable(raw.decisions) === stable(clean.decisions);
  }


  function wardrobePayload(state, opts) {
    const photos = !!(opts && opts.photos);
    const items = state.items.map((i) => {
      const it = clone(i);
      if (!photos) {                                                                                   // 사진을 빼면: 내 사진은 지우고(상태는 '사진 없음'), 상품 사진은 상태·출처만 남기고 그림은 뺀다
        it.photo.ownImg = '';
        if (it.photo.kind === 'own') it.photo = { kind: 'none', img: '', ownImg: '', sourceName: '', sourceUrl: '', checkedAt: '' };
        else it.photo.img = '';
      }
      return it;
    });
    return { schema: W.SCHEMA, kind: 'wardrobe', name: '', owner: clone(state.owner), items, decisions: clone(state.decisions || []) };
  }

  function catalogPayload(state, opts) {
    const photos = !!(opts && opts.photos);
    const products = clone((state.catalog && state.catalog.products) || []).map((p) => (photos ? p : Object.assign(p, { img: '' })));
    return { schema: 1, kind: 'catalog', name: '', note: '', products };
  }

  // A server backup has stricter wrapper keys than the regular import payload.
  // Change only image fields; do not add client-export metadata such as name.
  function withoutBackupPhotos(backup) {
    const b = clone(backup);
    b.wardrobe.items = wardrobePayload(b.wardrobe, { photos: false }).items;
    b.catalog.products = catalogPayload({ catalog: b.catalog }, { photos: false }).products;
    return b;
  }

  function mergePulled(localItems, pulledItems) {
    const local = new Map(localItems.map((i) => [i.id, i]));
    return pulledItems.map((it) => {
      const mine = local.get(it.id);
      if (mine && mine.photo.ownImg && !it.photo.ownImg) return W.setOwnPhoto(it, mine.photo.ownImg);
      return it;
    });
  }

  async function idempotencyKey(text) {
    const bytes = new TextEncoder().encode(text);
    const buf = await (globalThis.crypto && globalThis.crypto.subtle ? globalThis.crypto.subtle.digest('SHA-256', bytes) : Promise.reject(new Error('crypto.subtle 없음')));
    return 'otjang-' + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }

  return { CONTRACT, normalizeBase, isLocalAddress, wardrobePayload, catalogPayload, withoutBackupPhotos, mergePulled, mergePullPlanItems, completePullSnapshot, idempotencyKey, protectedFollowups, checkPushSupport, checkPullProtection, followupFingerprint, cleanFollowupAck, makeFollowupAck };
});
