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

  return { normalizeBase, isLocalAddress, wardrobePayload, catalogPayload, mergePulled, idempotencyKey };
});
