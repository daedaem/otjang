/*
 * Wardrobe — 옷장 파일(스키마 2)의 정리, 옮기기, 상태 바꾸기, 내보내기. 화면 코드가 없어 Node 테스트가 된다.
 *
 * 옷 한 벌(items[])의 뼈대
 *   id, status: 'owned' | 'candidate' | 'gone'
 *   cat, kind, name, detail, family, light, formality, pattern, seasons      ← 규칙(판정·코디)이 보는 필드. cat 은 outer·top·bottom·dress(원피스)·shoes
 *   attrSource: 'photo-draft'(사진에서 뽑은 초안) | 'owner'(주인 입력) | 'owner-confirmed'(주인이 확인함)
 *   photo: { kind, img, ownImg, sourceName, sourceUrl, checkedAt }
 *     kind: 'own'(내 사진) | 'confirmed'(확인된 동일 제품 사진) | 'candidate'(미확인 후보 사진) | 'substitute'(대체 이미지, 내 옷 아님) | 'none'
 *     img: 화면에 거는 사진. ownImg: 내가 찍은 사진(상품 사진을 걸어도 남겨 둔다). sourceName·sourceUrl·checkedAt: 상품 사진의 출처와 확인일
 *   product: null | { brand, name, code, confirmedAt }                         ← photo.kind가 'confirmed'일 때만. 사용자가 확인해야 생긴다
 *   matchCandidates: [{ brand, name, evidence: 'logo' | 'text' | 'owner', note, url }]   ← 내 옷 정보가 아니다. 확인 전 후보
 *   look3d: null | { kind: 'shirt' | 'blazer' | 'field' | 'trucker' | 'sweat' | 'cardigan', fabric }            ← 3D 옷장에 거는 종류와 원단. 종류로 그린 모습이지 상품 재현이 아니다
 *   brand, model, size, boughtYear, review, rebuy, fabric, neck, measures, link, price, checkedAt   ← 주인이 직접 적은 내 옷 기록
 *
 * 상태는 자동으로 오르지 않는다. 대체 이미지 → 미확인 후보 → 확인된 동일 제품은 모두 사용자 동작(아래 함수 호출)으로만 바뀐다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Wardrobe = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SCHEMA = 2;
  const SEASONS = ['봄', '여름', '가을', '겨울'];
  const CATS = { outer: '아우터', top: '상의', bottom: '하의', dress: '원피스', shoes: '신발' };   // 원피스: 위아래가 한 벌인 옷. 규칙에서는 상의·하의 한 쌍처럼 차림 하나로 센다
  const KINDS = {
    outer: { jacket: '재킷', blazer: '블레이저', cardigan: '카디건', coat: '코트', padding: '패딩', vest: '조끼', trench: '트렌치코트' },
    top: { shirt: '셔츠', tee: '티셔츠', knit: '니트', sweat: '스웻셔츠', polo: '폴로', hoodie: '후디', blouse: '블라우스', sleeveless: '민소매', turtleneck: '터틀넥' },
    bottom: { denim: '데님', chino: '치노', slacks: '슬랙스', fatigue: '퍼티그 팬츠', cord: '코듀로이 팬츠', shorts: '반바지', skirt: '스커트', wide: '와이드 팬츠', jogger: '조거·트레이닝 팬츠', leggings: '레깅스' },
    dress: { dress: '원피스', jumpsuit: '점프수트' },
    shoes: { derby: '더비', loafer: '로퍼', sneaker: '스니커즈', boots: '부츠', heels: '힐', flats: '플랫슈즈', sandals: '샌들' },
  };   // 새 종류는 뒤에 붙인다: 각 분류의 첫 종류가 모르는 값의 기본값이다
  // 색 계열: [이름, 색상(hue), 채도(%), 기본 밝기]
  const FAM = {
    white: ['흰색', 45, 25, 95], ivory: ['아이보리', 45, 40, 90], beige: ['베이지', 40, 40, 76], khaki: ['카키', 40, 35, 62],
    brown: ['브라운', 20, 38, 25], olive: ['올리브', 58, 24, 45], green: ['그린', 150, 32, 30], blue: ['블루', 215, 50, 78],
    navy: ['네이비', 222, 42, 18], indigo: ['인디고', 222, 34, 16], gray: ['그레이', 40, 4, 55], black: ['블랙', 210, 6, 12],
    red: ['레드', 5, 60, 42], burgundy: ['버건디', 345, 50, 25],
    pink: ['핑크', 345, 70, 82], purple: ['퍼플', 275, 35, 45], yellow: ['옐로', 48, 80, 70], orange: ['오렌지', 25, 75, 55],
  };
  const PATTERNS = { solid: '무지', stripe: '줄무늬', check: '체크', graphic: '프린트' };
  const FORMAL = { 1: '편한 차림', 2: '중간', 3: '단정한 차림' };
  const REBUY = { unknown: '모르겠다', yes: '다시 산다', no: '다시 안 산다' };
  const FABRIC = { '': '적지 않음', thin: '얇다', mid: '보통', thick: '두껍다' };
  const NECK = { '': '적지 않음', low: '낮다', mid: '보통', high: '높다' };
  const MEASURES = { top: [['length', '총장'], ['shoulder', '어깨'], ['chest', '가슴'], ['sleeve', '소매']], outer: [['length', '총장'], ['shoulder', '어깨'], ['chest', '가슴'], ['sleeve', '소매']], bottom: [['waist', '허리'], ['rise', '밑위'], ['thigh', '허벅지'], ['hem', '밑단']], dress: [['length', '총장'], ['shoulder', '어깨'], ['chest', '가슴'], ['waist', '허리']], shoes: [] };
  const LEAN = { buy: '살 쪽', skip: '말 쪽', unsure: '모르겠다' };
  const DECIDE = { buy: '산다', skip: '안 산다', hold: '보류' };
  const HELP = { yes: '도움이 됐다', some: '조금', no: '안 됐다' };
  const SHIFT = { same: '그대로', changed: '바뀜', settled: '정해짐', held: '보류로 바뀜' };
  // 결정 뒤 물음(2주 뒤): 산 옷은 몇 번 입었나와 만족, 안 산 옷은 아쉬움. 판정이 실제로 도움이 됐는지의 증거로 쓴다
  const FOLLOW_DAYS = 14;                                                                             // [제안값]
  const WORN = { none: '0번', few: '1~2번', many: '3번 이상', notbought: '결국 안 샀다' };
  const FEEL_BUY = { good: '잘 샀다', ok: '그저 그렇다', regret: '후회한다' };
  const FEEL_SKIP = { good: '안 사길 잘했다', ok: '모르겠다', regret: '아쉽다' };
  const ATTR_SOURCE = { 'photo-draft': '사진에서 뽑은 초안', owner: '주인이 입력', 'owner-confirmed': '주인이 확인함' };
  const PHOTO_KIND = { own: '내 사진', confirmed: '확인된 동일 제품', candidate: '미확인 후보', substitute: '대체 이미지 · 내 옷 아님', none: '사진 없음' };
  const EVIDENCE = { logo: '사진 속 로고', text: '사진 속 글자', owner: '주인이 말함' };
  const LOOK_KINDS = { shirt: '셔츠(버튼다운)', blazer: '블레이저', field: '필드 재킷', trucker: '트러커 재킷', sweat: '스웻셔츠(크루넥)', cardigan: '카디건(V넥)' };
  const MAX_CANDS = 5;

  const known = (map, v) => typeof v === 'string' && Object.prototype.hasOwnProperty.call(map, v);
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const own = (d, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(d, k);     // 파일에서 온 글자가 사전의 기본 속성 이름(constructor 등)이어도 통과하지 않게
  const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : null);
  const IMG_RE = /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/;
  const safeImg = (v) => (typeof v === 'string' && v.length < 600000 && IMG_RE.test(v) ? v : '');
  const safeLink = (v) => (typeof v === 'string' && /^https?:\/\/[^\s<>"']+$/i.test(v) ? v.slice(0, 400) : '');
  const safeDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function cleanCandidate(c) {
    if (!c || typeof c !== 'object') return null;
    const out = { brand: str(c.brand, 60).trim(), name: str(c.name, 80).trim(), evidence: known(EVIDENCE, c.evidence) ? c.evidence : 'owner', note: str(c.note, 200), url: safeLink(c.url) };
    return out.brand || out.name ? out : null;
  }
  const emptyPhoto = (ownImg) => ({ kind: ownImg ? 'own' : 'none', img: ownImg || '', ownImg: ownImg || '', sourceName: '', sourceUrl: '', checkedAt: '' });
  function cleanPhoto(raw, legacyImg) {
    const p = raw && typeof raw === 'object' ? raw : {};
    let img = safeImg(p.img) || (p.img === undefined ? safeImg(legacyImg) : ''), ownImg = safeImg(p.ownImg);
    let kind = known(PHOTO_KIND, p.kind) ? p.kind : (img ? 'own' : 'none');
    if (kind === 'own') { ownImg = img || ownImg; img = ownImg; if (!img) kind = 'none'; }
    if (kind === 'none') { if (img) { ownImg = img; kind = 'own'; } else if (ownImg) { img = ownImg; kind = 'own'; } }
    if (kind === 'own' || kind === 'none') return emptyPhoto(ownImg);
    return { kind, img, ownImg, sourceName: str(p.sourceName, 80), sourceUrl: safeLink(p.sourceUrl), checkedAt: safeDate(p.checkedAt) };
  }
  function cleanLook(raw) {
    if (!raw || typeof raw !== 'object' || !known(LOOK_KINDS, raw.kind)) return null;
    return { kind: raw.kind, fabric: str(raw.fabric, 40).replace(/[^a-z0-9-]/gi, '') };
  }

  /** 파일이나 저장소에서 온 옷 한 벌을 아는 항목만 남겨 정리한다. 스키마 1(v0.3)과 2를 모두 받아 2로 돌려준다. */
  function cleanItem(raw, i) {
    if (!raw || typeof raw !== 'object') return null;
    const cat = known(CATS, raw.cat) ? raw.cat : null;
    if (!cat) return null;
    const m = {};
    if (raw.measures && typeof raw.measures === 'object') for (const [k] of MEASURES[cat]) { const v = num(raw.measures[k], 1, 300); if (v != null) m[k] = v; }
    let attrSource = known(ATTR_SOURCE, raw.attrSource) ? raw.attrSource : null;
    if (!attrSource) attrSource = raw.source === 'photo-draft' ? (raw.confirmed === true ? 'owner-confirmed' : 'photo-draft') : 'owner';   // 스키마 1: source + confirmed
    const photo = cleanPhoto(raw.photo, raw.img);
    let product = null;
    if (photo.kind === 'confirmed') {
      const p = raw.product && typeof raw.product === 'object' ? raw.product : null;
      if (p && safeDate(p.confirmedAt)) product = { brand: str(p.brand, 60).trim(), name: str(p.name, 80).trim(), code: str(p.code, 60).trim(), confirmedAt: p.confirmedAt };
      else photo.kind = 'candidate';                                                                  // 확인 기록이 없는 '확인됨'은 후보로 내린다
    }
    const matchCandidates = Array.isArray(raw.matchCandidates) ? raw.matchCandidates.slice(0, MAX_CANDS).map(cleanCandidate).filter(Boolean) : [];
    return {
      id: str(raw.id, 40) || 'x' + (i || 0), status: raw.status === 'candidate' ? 'candidate' : raw.status === 'gone' ? 'gone' : 'owned',
      cat, kind: known(KINDS[cat], raw.kind) ? raw.kind : null, name: str(raw.name, 80) || '이름 없음', detail: str(raw.detail, 80),
      family: known(FAM, raw.family) ? raw.family : null, light: num(raw.light, 0, 100) == null ? null : Math.round(raw.light),
      formality: [1, 2, 3].indexOf(raw.formality) >= 0 ? raw.formality : null, pattern: known(PATTERNS, raw.pattern) ? raw.pattern : null,
      seasons: Array.isArray(raw.seasons) ? SEASONS.filter((s) => raw.seasons.indexOf(s) >= 0) : [],
      attrSource, draftNote: str(raw.draftNote, 200),
      photo, product, matchCandidates, look3d: cleanLook(raw.look3d),
      brand: str(raw.brand, 60), model: str(raw.model, 80), size: str(raw.size, 30), boughtYear: num(raw.boughtYear, 1950, 2100), review: str(raw.review, 500),
      rebuy: known(REBUY, raw.rebuy) ? raw.rebuy : 'unknown', fabric: known(FABRIC, raw.fabric) ? raw.fabric : '', neck: known(NECK, raw.neck) ? raw.neck : '', measures: m,
      link: safeLink(raw.link), price: num(raw.price, 0, 1e9), checkedAt: safeDate(raw.checkedAt),
    };
  }
  function cleanDecision(d) {
    if (!d || typeof d !== 'object' || !d.before || !known(LEAN, d.before.lean)) return null;
    const s = d.summary && typeof d.summary === 'object' ? d.summary : {};
    const out = { id: str(d.id, 40), itemId: str(d.itemId, 40), name: str(d.name, 80), before: { lean: d.before.lean, reason: str(d.before.reason, 200), at: str(d.before.at, 10) },
      summary: { overlaps: num(s.overlaps, 0, 999), added: num(s.added, 0, 9999), blockers: num(s.blockers, 0, 999) }, after: null };
    if (d.after && known(DECIDE, d.after.decision)) out.after = { decision: d.after.decision, helpful: known(HELP, d.after.helpful) ? d.after.helpful : 'some', note: str(d.after.note, 300), at: str(d.after.at, 10), shift: known(SHIFT, d.after.shift) ? d.after.shift : 'same',
      insight: str(d.after.insight, 200), comparedWith: ['none', 'chatbot', 'photos', 'other'].includes(d.after.comparedWith) ? d.after.comparedWith : 'none', comparisonNote: str(d.after.comparisonNote, 200) };
    out.followup = null;
    if (out.after && d.followup && typeof d.followup === 'object' && ['purchased', 'not-purchased', 'pending', 'returned'].includes(d.followup.outcome)) out.followup = {
      outcome: d.followup.outcome, worn: ['yes', 'no', 'unknown'].includes(d.followup.worn) ? d.followup.worn : 'unknown', regret: ['yes', 'no', 'unknown'].includes(d.followup.regret) ? d.followup.regret : 'unknown', note: str(d.followup.note, 300), at: safeDate(d.followup.at) };
    out.follow = out.after ? cleanFollow(d.follow, out.after.decision) : null;
    return out;
  }
  /** 결정 뒤 물음의 답. 산다: worn 필수, '결국 안 샀다'가 아니면 feel 필수. 안 산다: feel 필수. 보류는 묻지 않는다. 맞지 않으면 null. */
  function cleanFollow(f, decision) {
    if (!f || typeof f !== 'object' || !safeDate(f.at)) return null;
    if (decision === 'buy') {
      if (!own(WORN, f.worn)) return null;
      if (f.worn === 'notbought') return { at: f.at, worn: 'notbought', feel: '' };
      return own(FEEL_BUY, f.feel) ? { at: f.at, worn: f.worn, feel: f.feel } : null;
    }
    if (decision === 'skip') return own(FEEL_SKIP, f.feel) ? { at: f.at, worn: '', feel: f.feel } : null;
    return null;
  }
  /** 물을 차례가 된 결정(산다·안 산다를 정한 지 days일 이상, 답 없음). 오래된 것부터. */
  function followDue(decisions, today_, days) {
    const lim = days == null ? FOLLOW_DAYS : days, t = Date.parse((today_ || today()) + 'T00:00:00Z');
    return decisions.filter((d) => d.after && d.after.decision !== 'hold' && !d.follow && safeDate(d.after.at) && (t - Date.parse(d.after.at + 'T00:00:00Z')) / 86400000 >= lim)
      .sort((a, b) => (a.after.at < b.after.at ? -1 : a.after.at > b.after.at ? 1 : 0));
  }
  /** 옷장 파일 전체를 정리한다. 스키마 1이든 2든 스키마 2로 돌려준다. 모르는 파일이면 null. */
  function cleanWardrobe(raw) {
    if (!raw || typeof raw !== 'object' || (raw.schema !== 1 && raw.schema !== 2) || !Array.isArray(raw.items)) return null;
    const o = raw.owner && typeof raw.owner === 'object' ? raw.owner : {};
    const ids = new Set();
    const items = raw.items.slice(0, 500).map(cleanItem).filter(Boolean).filter((it) => (ids.has(it.id) ? false : ids.add(it.id)));
    const decisions = Array.isArray(raw.decisions) ? raw.decisions.slice(0, 500).map(cleanDecision).filter(Boolean) : [];
    return { schema: SCHEMA, kind: raw.kind === 'template' ? 'template' : 'wardrobe', name: str(raw.name, 60), draft: raw.draft === true, note: str(raw.note, 200),
      owner: { nickname: str(o.nickname, 30), height: num(o.height, 100, 230), topSize: str(o.topSize, 20), bottomSize: str(o.bottomSize, 20) }, items, decisions };
  }
  const migrate = cleanWardrobe;                                                                       // 옮기기 = 정리. 두 번 해도 같다

  // ---------- 속성 출처 ----------
  const isDraft = (it) => !!it && (it.attrSource === 'photo-draft' || (!known(ATTR_SOURCE, it.attrSource) && it.source === 'photo-draft' && it.confirmed !== true));
  /** Unknown stays unknown. Draft attributes are reviewable values, never evidence for a verdict.
   * Empty seasons means unknown; select all four seasons explicitly for year-round use.
   * Legacy manual rows remain assessable when every required field is valid. */
  function assessment(it, opts) {
    it = it || {}; const missing = [];
    if (!known(CATS, it.cat)) missing.push('cat');
    if (!known(CATS, it.cat) || !known(KINDS[it.cat], it.kind)) missing.push('kind');
    if (!known(FAM, it.family)) missing.push('family');
    if (num(it.light, 0, 100) == null) missing.push('light');
    if ([1, 2, 3].indexOf(it.formality) < 0) missing.push('formality');
    if (!known(PATTERNS, it.pattern)) missing.push('pattern');
    if (opts && opts.season && (!Array.isArray(it.seasons) || !it.seasons.some((s) => SEASONS.includes(s)))) missing.push('seasons');
    const draft = isDraft(it);
    if (draft) missing.push('confirmation');
    return { ready: missing.length === 0, status: missing.length ? 'needs-confirmation' : 'ready', missing, draft };
  }
  /** 등록된 옷 가운데 속성이 초안인 것. 확인 전에는 판정·코디 계산에서 제외한다. */
  function draftItems(items, usedIds) {
    const used = usedIds ? new Set(usedIds) : null;
    return items.filter((it) => isDraft(it) && (!used || used.has(it.id)));
  }
  const photoLabel = (it) => PHOTO_KIND[it.photo.kind];
  const attrLabel = (it) => ATTR_SOURCE[it.attrSource];

  // ---------- 상태 바꾸기 (모두 사용자 동작으로만 부른다. 새 객체를 돌려준다) ----------
  /** 내 사진을 넣거나 바꾼다. 상품 사진이 걸려 있으면 화면에는 그대로 상품 사진이 보이고 내 사진은 ownImg에 남는다. */
  function setOwnPhoto(it, img) {
    const out = clone(it); img = safeImg(img);
    if (out.photo.kind === 'own' || out.photo.kind === 'none') out.photo = emptyPhoto(img);
    else out.photo.ownImg = img;
    return out;
  }
  /** 상품 사진을 임시로 건다(대체 이미지 또는 미확인 후보). 브랜드·이름은 내 옷 정보에 들어가지 않는다. */
  function setProductPhoto(it, kind, p) {
    if (kind !== 'substitute' && kind !== 'candidate') throw new Error('kind must be substitute or candidate');
    const out = clone(it); p = p || {};
    out.photo = { kind, img: safeImg(p.img), ownImg: out.photo.ownImg || '', sourceName: str(p.sourceName, 80).trim(), sourceUrl: safeLink(p.sourceUrl), checkedAt: safeDate(p.checkedAt) || today() };
    out.product = null;
    if (kind === 'candidate' && (p.brand || p.name)) out.matchCandidates = addCandidate(out, { brand: p.brand, name: p.name, evidence: p.evidence || 'owner', note: p.note, url: p.sourceUrl }).matchCandidates;
    return out;
  }
  /** 상품 사진을 뗀다. 내 사진이 있으면 그 사진으로 돌아간다. 확인 기록(product)도 지운다. */
  function clearProductPhoto(it) {
    const out = clone(it);
    if (out.photo.kind === 'own' || out.photo.kind === 'none') return out;
    out.photo = emptyPhoto(out.photo.ownImg); out.product = null; return out;
  }
  function addCandidate(it, c) {
    const out = clone(it); const cc = cleanCandidate(c); if (!cc) return out;
    const dup = out.matchCandidates.some((x) => x.brand === cc.brand && x.name === cc.name);
    if (!dup) out.matchCandidates = out.matchCandidates.concat([cc]).slice(-MAX_CANDS);
    return out;
  }
  function removeCandidate(it, index) { const out = clone(it); out.matchCandidates.splice(index, 1); return out; }
  /**
   * 사용자가 "같은 상품"이라고 확인했을 때만 부른다. 사진 상태가 '확인된 동일 제품'이 되고, 브랜드·상품명·사진 출처·확인일이 내 옷 정보로 들어간다.
   * p: { brand, name, code, img, sourceName, sourceUrl, at }
   */
  function confirmProduct(it, p) {
    p = p || {}; const brand = str(p.brand, 60).trim(), name = str(p.name, 80).trim();
    if (!brand && !name) throw new Error('브랜드나 상품명이 있어야 확인할 수 있습니다');
    const out = clone(it), at = safeDate(p.at) || today();
    out.product = { brand, name, code: str(p.code, 60).trim(), confirmedAt: at };
    const hadProduct = out.photo.kind !== 'own' && out.photo.kind !== 'none';
    out.photo = { kind: 'confirmed', img: safeImg(p.img) || (hadProduct ? out.photo.img : ''), ownImg: out.photo.ownImg || '', sourceName: str(p.sourceName, 80).trim() || (hadProduct ? out.photo.sourceName : ''), sourceUrl: safeLink(p.sourceUrl) || (hadProduct ? out.photo.sourceUrl : ''), checkedAt: at };
    if (!out.brand && brand) out.brand = brand;                                                      // 확인된 제품의 브랜드·상품명은 내 옷 기록이 된다 (이미 적은 값은 두고)
    if (!out.model && name) out.model = name;
    out.matchCandidates = out.matchCandidates.filter((c) => !(c.brand === brand && c.name === name));
    return out;
  }
  /** 확인을 취소한다. 사진은 미확인 후보로 내려가고 product는 비운다. brand·model(내 기록)은 그대로 둔다. */
  function unconfirm(it) {
    const out = clone(it); if (out.photo.kind !== 'confirmed') return out;
    const p = out.product; out.product = null; out.photo.kind = 'candidate';
    if (p && (p.brand || p.name)) out.matchCandidates = addCandidate(out, { brand: p.brand, name: p.name, evidence: 'owner', note: '확인을 취소함' }).matchCandidates;
    return out;
  }
  function setLook3d(it, look) { const out = clone(it); out.look3d = cleanLook(look); return out; }
  function setAttrSource(it, src) { const out = clone(it); out.attrSource = known(ATTR_SOURCE, src) ? src : out.attrSource; return out; }

  // ---------- 내보내기 ----------
  /**
   * opts: { img(내 사진, 기본 true), otherImg(남의 상품 사진, 기본 false), cands(미확인 후보 목록, 기본 false), price(가격·링크, 기본 false), body(키·사이즈, 기본 false), log(판정 기록, 기본 false) }
   * 구매 후보와 처분한 옷은 넣지 않는다.
   */
  function exportWardrobe(state, opts) {
    const e = Object.assign({ img: true, otherImg: false, cands: false, price: false, body: false, log: false }, opts || {});
    const items = state.items.filter((i) => i.status === 'owned').map((i) => {
      const it = clone(i);
      if (!e.img) { it.photo.ownImg = ''; if (it.photo.kind === 'own') it.photo = emptyPhoto(''); }
      if (it.photo.kind !== 'own' && it.photo.kind !== 'none' && !e.otherImg) it.photo.img = '';
      if (!e.cands) it.matchCandidates = [];
      if (!e.price) { it.price = null; it.link = ''; it.checkedAt = ''; }
      return it;
    });
    return { schema: SCHEMA, kind: 'wardrobe', exportedAt: today(), name: state.owner.nickname ? state.owner.nickname + '의 옷장' : '',
      owner: e.body ? clone(state.owner) : { nickname: state.owner.nickname, height: null, topSize: '', bottomSize: '' }, items, decisions: e.log ? clone(state.decisions) : [] };
  }

  /**
   * 상품 이름·공유 글에서 옷의 종류·색·무늬를 짐작한다(붙여 넣은 글을 칸에 미리 채우는 데만 쓴다. 사용자가 고친다).
   * 더 구체적인 말이 먼저다: '케이블 니트 … 카디건'은 카디건, '티셔츠'는 셔츠가 아니라 티. 브랜드 이름 '폴로'는 폴로 셔츠로 보지 않는다.
   * 반환: { cat, kind, family, light, pattern, hits: [짐작에 쓴 말] } — 모르는 것은 null.
   */
  const GUESS_KIND = [
    ['outer', 'cardigan', /카디건|가디건|cardigan/i], ['outer', 'blazer', /블레이저|blazer|테일러드\s*재킷/i], ['outer', 'trench', /트렌치|trench/i], ['outer', 'padding', /패딩|다운\s*재킷|푸퍼|puffer|down\s*jacket/i],
    ['outer', 'coat', /코트|coat/i], ['outer', 'vest', /조끼|베스트(?!셀러)|vest|gilet/i], ['outer', 'jacket', /재킷|자켓|점퍼|블루종|jacket|blouson|트러커|봄버|bomber|파카|parka/i],
    ['top', 'hoodie', /후디|후드\s*티|후드티|hoodie/i], ['top', 'sweat', /맨투맨|스웻\s*셔츠|스웨트\s*셔츠|스웻|sweat\s*shirt|sweatshirt|crewneck\s*sweat/i], ['top', 'turtleneck', /터틀넥|폴라\s*니트|목폴라|turtle\s*neck|turtleneck/i],
    ['top', 'polo', /폴로\s*셔츠|폴로셔츠|폴로\s*티|피케|pique|polo\s*shirt/i], ['top', 'tee', /티셔츠|t-?shirt|반팔\s*티|긴팔\s*티|롱\s*슬리브\s*티|\btee\b|크루넥\s*티|헨리넥/i],
    ['top', 'blouse', /블라우스|blouse/i], ['top', 'sleeveless', /민소매|나시|탱크\s*톱|sleeveless|tank\s*top/i], ['top', 'shirt', /셔츠|남방|옥스퍼드|버튼\s*다운|shirt|oxford|button[\s-]*down/i],
    ['top', 'knit', /니트|스웨터|sweater|knit|풀오버|pullover/i],
    ['bottom', 'chino', /치노|chino/i], ['bottom', 'slacks', /슬랙스|slacks|트라우저|trouser/i], ['bottom', 'cord', /코듀로이\s*팬츠|골덴\s*바지|corduroy\s*pants/i], ['bottom', 'fatigue', /퍼티그|fatigue|카고\s*팬츠|cargo/i],
    ['bottom', 'jogger', /조거|트레이닝\s*팬츠|jogger|track\s*pants|sweat\s*pants/i], ['bottom', 'leggings', /레깅스|leggings/i], ['bottom', 'shorts', /반바지|쇼츠|shorts/i], ['bottom', 'skirt', /스커트|치마|skirt/i],
    ['bottom', 'wide', /와이드\s*팬츠|wide\s*pants/i], ['bottom', 'denim', /데님\s*팬츠|청바지|진\s*팬츠|jeans|denim\s*pants|셀비지|\b50[1-5]\b/i],
    ['dress', 'jumpsuit', /점프\s*수트|jumpsuit/i], ['dress', 'dress', /원피스|드레스|dress/i],
    ['shoes', 'loafer', /로퍼|loafer|페니\s*로퍼/i], ['shoes', 'derby', /더비|derby|옥스퍼드\s*슈즈|oxford\s*shoes/i], ['shoes', 'boots', /부츠|boots?\b|워커/i], ['shoes', 'sneaker', /스니커즈|운동화|sneakers?/i],
    ['shoes', 'heels', /힐|heels?\b|펌프스/i], ['shoes', 'flats', /플랫\s*슈즈|flats?\b|발레리나/i], ['shoes', 'sandals', /샌들|슬리퍼|sandals?/i],
    ['top', 'tee', /크루넥\s*t(?![a-z])|브이넥\s*t(?![a-z])|반팔|반소매|crew\s*neck|크루넥/i],                    // 종류 낱말이 없을 때: 유니클로 '크루넥T', '반팔'만 적힌 글
  ];
  const GUESS_COLOR = [
    ['ivory', /아이보리|크림|에크루|오프\s*화이트|ivory|cream|ecru|off[\s-]*white/i], ['white', /흰색|흰\s|^흰|화이트|white|하양/i], ['beige', /베이지|샌드|카멜|beige|sand|camel|탄\b|tan\b/i], ['khaki', /카키|khaki/i],
    ['olive', /올리브|olive/i], ['navy', /네이비|남색|navy/i], ['indigo', /인디고|진청|생지|indigo|raw\s*denim/i], ['blue', /하늘|스카이|연청|블루|파랑|blue|sky/i], ['green', /그린|초록|녹색|green/i],
    ['burgundy', /버건디|와인|burgundy|wine/i], ['brown', /브라운|갈색|초콜릿|모카|brown|chocolate|mocha/i], ['black', /블랙|검정|검은|black/i], ['gray', /그레이|회색|차콜|멜란지|gray|grey|charcoal|melange/i],
    ['red', /레드|빨강|빨간|red\b/i], ['pink', /핑크|분홍|pink/i], ['purple', /퍼플|보라|purple|lavender|라벤더/i], ['yellow', /옐로|노랑|노란|머스타드|yellow|mustard/i], ['orange', /오렌지|주황|orange/i],
  ];
  const GUESS_PATTERN = [['stripe', /스트라이프|줄무늬|보더|stripe/i], ['check', /체크|깅엄|타탄|플래드|check|gingham|tartan|plaid/i], ['graphic', /프린트|그래픽|꽃무늬|플로럴|print|graphic|floral/i]];
  function guessFromText(text) {
    const s = String(text || '').slice(0, 400).replace(/\[[^\]]{0,20}\]/g, ' ');                  // [무신사] 같은 상점 꼬리표는 뺀다
    const out = { cat: null, kind: null, family: null, light: null, pattern: null, hits: [] };
    for (const [cat, kind, re] of GUESS_KIND) { const m = re.exec(s); if (m) { out.cat = cat; out.kind = kind; out.hits.push(m[0].trim()); break; } }
    let best = null;
    for (const [fam, re] of GUESS_COLOR) { const m = re.exec(s); if (m && (!best || m.index < best.at)) best = { fam, at: m.index, word: m[0].trim() }; }   // 글에서 먼저 나온 색
    if (best) { out.family = best.fam; out.light = /차콜|charcoal/i.test(best.word) ? 28 : FAM[best.fam][3]; out.hits.push(best.word); }
    for (const [pat, re] of GUESS_PATTERN) { const m = re.exec(s); if (m) { out.pattern = pat; out.hits.push(m[0].trim()); break; } }
    return out;
  }

  return { SCHEMA, SEASONS, CATS, KINDS, FAM, PATTERNS, FORMAL, REBUY, FABRIC, NECK, MEASURES, LEAN, DECIDE, HELP, SHIFT, ATTR_SOURCE, PHOTO_KIND, EVIDENCE, LOOK_KINDS, MAX_CANDS, FOLLOW_DAYS, WORN, FEEL_BUY, FEEL_SKIP,
    known, str, num, safeImg, safeLink, safeDate, today, cleanItem, cleanWardrobe, cleanDecision, cleanFollow, followDue, migrate, isDraft, assessment, draftItems, photoLabel, attrLabel,
    setOwnPhoto, setProductPhoto, clearProductPhoto, addCandidate, removeCandidate, confirmProduct, unconfirm, setLook3d, setAttrSource, exportWardrobe, guessFromText };
});
