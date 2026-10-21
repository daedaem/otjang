// UX 시안 10개가 함께 쓰는 목업 코어.
// 실제 앱의 엔진(검색·비교·코디·구매 기록)을 화면과 무관한 API로 감싼다.
// 시안은 화면만 다르게 만들고, 판단 문장과 규칙은 모두 여기서 온다(현재 앱의 구매 비교 화면과 같은 순서).
// 저장은 이 브라우저에만, 앱과 다른 키로 한다. 앱 저장소·서버는 건드리지 않는다.
import { CATALOG, PRODUCTS } from '../../../src/data/products.js';
import { SLOT_BY_ID, SLOTS, COLORS, STYLES } from '../../../src/data/slots.js';
import { ROLE_LABEL, ROLE_ORDER } from '../../../src/data/looks.js';
import {
  search, recommendLooks, recommendItems, formatPrice, josa, PRODUCT_BY_ID, productsFor, meetsCriteria,
  productCriteria, criteriaLine, productReasons, scoreSlot, seasonOf, SEASON_LABEL, SAFE_PRODUCTS,
} from '../../../src/engine.js';
import { newWardrobeState, wardrobeView, makeGarment, garmentKindChoices, garmentKindName, garmentLabel, GARMENT_KINDS } from '../../../src/wardrobe.js';
import { candidateFromProduct, compareCandidate, quickCompare } from '../../../src/purchase-candidate.js';
import { createPurchaseJourney, transitionPurchaseJourney, JOURNEY_RETURN_REASONS } from '../../../src/purchase-journey.js';
import { relatedReturnRecords } from '../../../src/related-returns.js';
import { purchasePlanContext } from '../../../src/purchase-plan-context.js';
import { resolveSearchFollowUp } from '../../../src/search-follow-up.js';
import { outfitCopy } from '../../../src/outfit-copy.js';
import { garmentSvg } from '../../../src/icons.js';

export const MOCK_API_VERSION = 1;

export function createMock({ storage = null, key = 'eoul-mockup-ux10:v1', clock = () => new Date(), reset = false, photos = false } = {}) {
  const DECISION_LABEL = { buy: '사기로 함', hold: '보류', skip: '안 사기로 함' };
  const RETURN_LABEL = { size: '사이즈', color: '색', quality: '품질', 'change-of-mind': '마음이 바뀜', other: '기타' };
  const FINE = '종류·색과 코디 공식으로 비교했어요. 소재·핏·사이즈·현재 가격은 판매처에서 확인해요.';
  const NOTE = {
    mock: '목업 · AI 역할 시안 · 저장은 이 브라우저에만',
    ai: '실제 전문가가 참여한 결과가 아니라 AI가 디자이너·프론트 개발자 역할로 만든 시안이에요.',
    catalog: `상품 이름·가격은 ${CATALOG.checkedLabel} ${CATALOG.store}에서 수집한 개인 시험용 자료예요(공개 권리 미확인). 사진은 넣지 않고 종류·색 그림으로 대신했어요.`,
    price: '수집일 가격이에요. 현재가·최저가가 아니에요. 쿠폰·배송비 제외.',
    rules: '대화형 AI가 아니라 정해진 규칙으로 요청을 읽어요. 못 읽은 말은 못 읽었다고 알려요.',
    records: '주문·수령·반품은 직접 남긴 기록이에요. 확인된 거래가 아니에요.',
  };
  // 체험용 옷장: 같은 요청 안에서도 "겹쳐요·색만 달라요"가 갈리고, 코트처럼 없는 종류에서는 새 코디가 생기도록 고른 구성.
  const TRIAL = {
    M: [['m-oxford', 'white', '흰 옥스퍼드 셔츠'], ['m-tee', 'white', '흰 무지 티셔츠'], ['m-knit', 'navy', '네이비 크루넥 니트'], ['m-blazer', 'navy', '네이비 블레이저'],
      ['m-chino', 'beige', '베이지 치노 팬츠'], ['m-denim', 'indigo', '인디고 워시드 데님'], ['m-loafer', 'brown', '브라운 로퍼'], ['m-white-sneaker', 'white', '흰 스니커즈']],
    F: [['f-tee', 'white', '흰 티셔츠'], ['f-knit', 'beige', '베이지 니트'], ['f-trench', 'beige', '베이지 트렌치 코트'], ['f-slacks', 'black', '블랙 슬랙스'],
      ['f-denim', 'blue', '라이트 블루 데님'], ['f-loafer', 'black', '블랙 로퍼'], ['f-sneaker', 'white', '흰 스니커즈']],
  };
  const EXAMPLES = {
    M: ['출근용 셔츠 10만원 이하', '겨울 데이트 코트', '검정 말고 주말에 입을 편한 바지', '흰 스니커즈 10만원 이하', '하객룩 셔츠', '아메카지 재킷'],
    F: ['출근용 셔츠 10만원 이하', '원피스 10만원 이하', '겨울 코트 20만원 이하', '데이트 스커트', '가성비 니트', '흰 스니커즈'],
  };
  // 정직한 답을 보여 주는 요청: 없는 종류, 성별과 맞지 않는 종류, 못 읽는 말, 이어서 묻기.
  const EDGE_EXAMPLES = ['반바지', '남자 원피스', '꾸안꾸 느낌으로', '더 싼 걸로'];

  const listeners = new Set();
  const blank = () => ({ v: 1, gender: 'M', garments: [], journeys: [], trialIds: [], absences: {}, seq: 0 });
  let S = blank();
  let version = 0;
  let cache = { version: -1, state: null, judge: new Map() };
  let lastAsk = null;

  const iso = () => clock().toISOString();
  const today = () => {
    const d = clock();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const nextId = (prefix) => `${prefix}_mock_${Date.now().toString(36)}_${(S.seq++).toString(36)}`;
  const uniq = (rows) => [...new Map(rows.map((row) => [row.id, row])).values()];
  const colorLabel = (c) => COLORS[c]?.label || '색 미확인';
  const colorHex = (c) => COLORS[c]?.hex || null;

  function buildState(record) {
    const base = {
      ...newWardrobeState(), demo: false, demoSelected: [], gender: record.gender,
      garments: record.garments, journeys: record.journeys,
    };
    return { ...wardrobeView(base), now: today() };
  }
  function load() {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return blank();
      const v = JSON.parse(raw);
      if (v?.v !== 1 || !Array.isArray(v.garments) || !Array.isArray(v.journeys)) return blank();
      const next = { ...blank(), ...v, trialIds: Array.isArray(v.trialIds) ? v.trialIds : [], absences: v.absences && typeof v.absences === 'object' ? v.absences : {} };
      next.gender = next.gender === 'F' ? 'F' : 'M';
      buildState(next); // 읽을 수 없는 기록이면 처음 상태로 시작한다.
      return next;
    } catch {
      return blank();
    }
  }
  function save() {
    try { storage?.setItem(key, JSON.stringify(S)); } catch { /* 저장이 막힌 브라우저에서도 화면은 동작한다. */ }
  }
  function notify() {
    for (const fn of [...listeners]) {
      try { fn(api.getState()); } catch (error) { console.error(error); }
    }
  }
  function commit(change) {
    const before = structuredClone(S);
    try {
      change();
      buildState(S); // 엔진 검증을 통과해야만 저장한다.
    } catch (error) {
      S = before;
      throw error;
    }
    version++;
    save();
    notify();
  }
  function engineState() {
    if (cache.version !== version || !cache.state) cache = { version, state: buildState(S), judge: new Map() };
    return cache.state;
  }
  const isTrial = (id) => S.trialIds.includes(id);
  const journeyFor = (productId) => S.journeys.find((j) => j.candidate.productId === productId) || null;
  const replaceJourney = (next) => { S.journeys = [...S.journeys.filter((j) => j.id !== next.id), next]; };

  // ── 보이는 모양
  function garmentView(g) {
    const slot = SLOT_BY_ID[g.slot];
    const bought = !!g.productId;
    return {
      id: g.id, kind: g.kind, kindName: garmentKindName(g.kind), slot: g.slot || null, slotName: slot?.name || null,
      label: g.label || garmentLabel(g), gender: g.gender, color: g.color, colorLabel: colorLabel(g.color), colorHex: colorHex(g.color),
      trial: isTrial(g.id), bought, productId: g.productId || null,
      sourceLabel: isTrial(g.id) ? '체험용' : bought ? '기록에서 산 옷' : '내 옷',
      detailMissing: !g.slot ? '세부 종류 미확인' : !g.color ? '색 미확인' : null,
    };
  }
  function card(product, { slot = SLOT_BY_ID[product.slot], reasons = null, offOccasion = false } = {}) {
    const fixed = productReasons(product, slot, reasons || [slot.why]);
    const st = engineState();
    return {
      id: product.id, brand: product.brand, name: product.name,
      price: product.price, priceText: formatPrice(product.price),
      priceNote: `${Number(product.checkedAt.slice(5, 7))}월 ${Number(product.checkedAt.slice(8, 10))}일 수집가`,
      checkedAt: product.checkedAt, store: product.store, url: product.url,
      color: product.color, colorLabel: colorLabel(product.color), colorHex: colorHex(product.color),
      colorFromPhoto: product.colorSource === 'image',
      kind: slot.shape, kindName: garmentKindName(slot.shape), slot: slot.id, slotName: slot.name, gender: slot.g,
      rating: product.rating ?? null, reviews: product.reviews ?? null,
      reason: fixed.reasons[0] || slot.why, reasons: fixed.reasons, traitLine: fixed.traitLine && fixed.traitLine !== fixed.reasons[0] ? fixed.traitLine : null,
      offOccasion: !!offOccasion,
      owned: ownedQuick(product, slot, st),
      record: recordView(journeyFor(product.id)),
    };
  }
  // 목록용 빠른 보유 판정: 앱의 카드 문장(ownedLine)과 같은 규칙.
  function ownedQuick(product, slot, st) {
    const mine = st.closet.filter((i) => i.gender === slot.g && ['user', 'legacy'].includes(i.source));
    if (!mine.length) return { tone: 'none', label: '옷장 없이', text: '' };
    const kind = garmentKindName(slot.shape);
    const same = mine.filter((i) => i.productId === product.id);
    if (same.length) return { tone: 'stop', label: '이미 있어요', text: '옷장에 있는 상품이에요' };
    const qc = quickCompare(st, { kind: slot.shape, color: product.colorSource === 'image' ? null : product.color, gender: slot.g });
    // 겹친 옷이 모두 체험용이면 '내 옷장'이 아니라 체험용 옷장이라고 쓴다.
    const where = (rows) => rows.every((g) => isTrial(g.id)) ? '체험용 옷장에' : '옷장에';
    const tag = (rows) => rows.every((g) => isTrial(g.id)) ? ' · 체험용' : '';
    if (qc.sameColor.length) return { tone: 'stop', label: `겹쳐요${tag(qc.sameColor)}`, text: `${where(qc.sameColor)} 같은 종류·색 ${kind} ${qc.sameColor.length}벌`, trial: qc.sameColor.every((g) => isTrial(g.id)) };
    if (qc.otherColor.length) return { tone: 'info', label: `색만 달라요${tag(qc.otherColor)}`, text: `${where(qc.otherColor)} ${kind} ${qc.otherColor.length}벌 · 색은 달라요`, trial: qc.otherColor.every((g) => isTrial(g.id)) };
    if (qc.unknownColor.length) return { tone: 'info', label: `색 확인${tag(qc.unknownColor)}`, text: `${where(qc.unknownColor)} ${kind} ${qc.unknownColor.length}벌 · 색 확인 필요`, trial: qc.unknownColor.every((g) => isTrial(g.id)) };
    return { tone: 'new', label: '없는 종류', text: `${mine.every((g) => isTrial(g.id)) ? '체험용 옷' : '등록한 옷'} 중 ${kind}${josa(kind, '은', '는')} 아직 없어요` };
  }
  function outfitView(result, { candidateId = null, focusId = null } = {}) {
    if (!result) return null;
    const copy = outfitCopy(result);
    const pieces = [...result.items]
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
      .map((row) => {
        const isCandidate = row.source === 'candidate' || (!row.owned && row.candidate);
        const product = row.product || (isCandidate && candidateId ? PRODUCT_BY_ID[candidateId] : null);
        const slot = row.slot || (row.item ? SLOT_BY_ID[row.item.slot] : null) || (product ? SLOT_BY_ID[product.slot] : null);
        const color = row.owned ? row.item?.color ?? row.color : product?.color ?? row.color;
        return {
          role: row.role, roleLabel: ROLE_LABEL[row.role] || '',
          owned: !!row.owned, trial: !!(row.owned && row.item && isTrial(row.item.id)),
          candidate: !!isCandidate || (!!product && product.id === candidateId),
          focus: !!product && product.id === focusId,
          label: row.owned ? (row.item?.label || garmentLabel(row.item || { kind: slot?.shape })) : product ? `${product.brand} ${product.name}` : slot?.name || '',
          kindName: garmentKindName(slot?.shape || row.item?.kind), slot: slot?.id || null,
          color, colorLabel: colorLabel(color), colorHex: colorHex(color),
          uncertain: row.certainty === 'uncertain',
          product: product && !row.owned ? { id: product.id, brand: product.brand, name: product.name, price: product.price, priceText: formatPrice(product.price), url: product.url } : null,
        };
      });
    const buy = pieces.filter((p) => !p.owned && p.product && !p.candidate);
    return {
      id: result.look?.id || null, formula: result.look?.title || '', title: copy.title, note: copy.note,
      pieces, ownedCount: pieces.filter((p) => p.owned).length, buyCount: buy.length,
      buyTotal: buy.reduce((sum, p) => sum + (p.product?.price || 0), 0),
      buyTotalText: buy.length ? formatPrice(buy.reduce((sum, p) => sum + (p.product?.price || 0), 0)) : '',
      uncertainCount: result.uncertainCount || 0,
    };
  }
  function recordView(j) {
    if (!j) return null;
    const p = PRODUCT_BY_ID[j.candidate.productId];
    const stageLabel = {
      candidate: j.decision === 'buy' ? '사기로 함 · 주문 전' : j.decision ? DECISION_LABEL[j.decision] : '비교 중',
      ordered: '주문했다고 기록함', received: '받음 · 계속 입을지 결정 전', kept: '계속 입는 내 옷', returned: '반품했다고 기록함',
    }[j.stage];
    const next = {
      candidate: [{ step: 'ordered', label: '주문했어요' }],
      ordered: [{ step: 'received', label: '받았어요' }],
      received: [{ step: 'kept', label: '계속 입을게요' }, { step: 'returned', label: '반품했어요', needsReason: true }],
      kept: [{ step: 'worn', label: '오늘 입었어요' }, { step: 'returned', label: '반품했어요', needsReason: true }],
      returned: [],
    }[j.stage];
    const last = j.history[j.history.length - 1];
    return {
      id: j.id, productId: j.candidate.productId,
      product: p ? { id: p.id, brand: p.brand, name: p.name, price: p.price, priceText: formatPrice(p.price), url: p.url, color: p.color, colorHex: colorHex(p.color), colorLabel: colorLabel(p.color), slot: p.slot, kind: SLOT_BY_ID[p.slot]?.shape, kindName: garmentKindName(SLOT_BY_ID[p.slot]?.shape) } : null,
      decision: j.decision, decisionLabel: j.decision ? DECISION_LABEL[j.decision] : '결정 전',
      stage: j.stage, stageLabel, next, wearCount: j.wearCount,
      returnReason: j.feedback?.returnReason || null, returnReasonLabel: RETURN_LABEL[j.feedback?.returnReason] || null,
      updatedAt: last?.at || null,
    };
  }

  // ── API
  const api = {
    apiVersion: MOCK_API_VERSION,
    note: NOTE,
    catalog: { store: CATALOG.store, checkedLabel: CATALOG.checkedLabel, count: CATALOG.count, rights: CATALOG.rights },
    returnReasons: JOURNEY_RETURN_REASONS.map((id) => ({ id, label: RETURN_LABEL[id] })),
    version: () => version,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getState() {
      const st = engineState();
      const closet = st.closet.map(garmentView);
      return {
        gender: S.gender,
        closet,
        closetCount: closet.length,
        trialCount: closet.filter((g) => g.trial).length,
        mineCount: closet.filter((g) => !g.trial).length,
        records: S.journeys.map(recordView).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
      };
    },
    setGender(g) { commit(() => { S.gender = g === 'F' ? 'F' : 'M'; }); },
    reset() { commit(() => { S = blank(); }); lastAsk = null; },
    examples: (gender = S.gender) => [...EXAMPLES[gender === 'F' ? 'F' : 'M']],
    edgeExamples: () => [...EDGE_EXAMPLES],
    kindChoices: (gender = S.gender) => garmentKindChoices(gender === 'F' ? 'F' : 'M').map((k) => ({ id: k.id, name: k.name })),
    slotChoices: (kind, gender = S.gender) => SLOTS.filter((s) => s.g === (gender === 'F' ? 'F' : 'M') && s.shape === kind).map((s) => ({ id: s.id, name: s.name })),
    colorChoices: () => Object.entries(COLORS).map(([id, c]) => ({ id, label: c.label, hex: c.hex, light: c.light ?? 50 })),
    formatPrice,

    addGarment({ kind, color = null, slot = null, gender = S.gender, label = '', trial = false } = {}) {
      const g = gender === 'F' ? 'F' : 'M';
      if (!GARMENT_KINDS.some((k) => k.id === kind)) throw new Error('옷 종류를 골라 주세요.');
      const s = slot && SLOT_BY_ID[slot]?.shape === kind && SLOT_BY_ID[slot]?.g === g ? slot : null;
      const garment = makeGarment({ id: nextId('g'), slot: s, kind, gender: g, color: COLORS[color] ? color : null, label: String(label || ''), source: 'user', createdAt: iso() });
      commit(() => {
        S.garments = [...S.garments, garment];
        if (trial) S.trialIds = [...S.trialIds, garment.id];
      });
      return garmentView(garment);
    },
    updateGarment(id, { color, slot } = {}) {
      commit(() => {
        S.garments = S.garments.map((g) => {
          if (g.id !== id) return g;
          const next = { ...g };
          if (color !== undefined) next.color = COLORS[color] ? color : null;
          if (slot !== undefined) next.slot = slot && SLOT_BY_ID[slot]?.shape === g.kind && SLOT_BY_ID[slot]?.g === g.gender ? slot : null;
          return next;
        });
      });
    },
    removeGarment(id) {
      const linked = S.journeys.some((j) => j.garmentId === id);
      if (linked) throw new Error('구매 기록과 연결된 옷이에요. 기록에서 반품으로 정리해 주세요.');
      commit(() => {
        S.garments = S.garments.filter((g) => g.id !== id);
        S.trialIds = S.trialIds.filter((x) => x !== id);
      });
    },
    loadTrialCloset(gender = S.gender) {
      const g = gender === 'F' ? 'F' : 'M';
      commit(() => {
        const old = new Set(S.trialIds);
        S.garments = S.garments.filter((x) => !old.has(x.id));
        const rows = TRIAL[g].map(([slot, color, label]) => makeGarment({ id: nextId('g'), slot, kind: SLOT_BY_ID[slot].shape, gender: g, color, label, source: 'user', createdAt: iso() }));
        S.garments = [...S.garments, ...rows];
        S.trialIds = rows.map((x) => x.id);
        S.gender = g;
      });
    },
    clearTrialCloset() {
      commit(() => {
        const old = new Set(S.trialIds);
        S.garments = S.garments.filter((x) => !old.has(x.id));
        S.trialIds = [];
      });
    },

    // 한 줄 요청 → 실제 상품과 조건·안내. 조건을 몰래 넓히지 않는다(검색 엔진 규칙 그대로).
    ask(text, { drop = [], previous = null } = {}) {
      const said = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const base = { said, text: said, understood: false, title: '', conditions: [], dropped: [], notices: [], products: [], offOccasion: [], total: 0, outfit: null, outfitNote: null, listNote: '', criteria: null, gender: S.gender, season: null, seasonLabel: '', examples: api.examples() };
      if (!said) return { ...base, title: '찾고 싶은 옷을 적어 주세요', notices: [{ kind: 'empty-input', text: '예: 출근용 셔츠 10만원 이하' }] };
      let query = said, follow = null;
      const prev = typeof previous === 'string' ? previous : previous?.text;
      if (prev) {
        const resolved = resolveSearchFollowUp(prev, said);
        if (resolved) { query = resolved.query; follow = resolved.follow; }
      }
      let r;
      try {
        r = search(engineState(), query, { drop });
      } catch (error) {
        return { ...base, text: query, title: '요청을 읽지 못했어요', notices: [{ kind: 'error', text: '다른 말로 다시 적어 주세요.' }] };
      }
      const conditions = r.conds.map((c) => ({ key: c.key, label: c.saved ? `${c.label} (내 설정)` : c.label, removable: c.key !== 'kind' }));
      const notices = [];
      if (follow) notices.push({ kind: 'follow', text: follow.clarification ? `‘${follow.said}’: ${follow.clarification}` : `‘${follow.said}’는 이전 조건을 그대로 두고 ${follow.order}으로 다시 찾았어요. 새로 찾으려면 종류까지 적어 주세요.` });
      else if (/^\s*(?:좀\s*)?더\s*(싼|저렴한|비싼|좋은|나은|괜찮은)/.test(said) && !prev)
        notices.push({ kind: 'follow-missing', text: '이어서 물을 이전 요청이 없어요. 찾을 옷 종류부터 적어 주세요.' });
      if (!r.understood) {
        lastAsk = null;
        return { ...base, text: query, title: `‘${said}’는 아직 찾을 수 없어요`, notices: [...notices, { kind: 'not-understood', text: '이 말에 맞는 조건을 찾지 못해서 상품을 고르지 않았어요. 옷 종류·상황·예산으로 다시 적어 주세요.' }], examples: api.examples(r.gender) };
      }
      const kindLabel = r.conds.find((x) => x.key === 'kind')?.label || '이 종류';
      if (r.genderFromKind) notices.push({ kind: 'gender', text: `${kindLabel}${josa(kindLabel, '은', '는')} ${r.genderFromKind === 'F' ? '여성' : '남성'} 상품에만 있어서 ${r.genderFromKind === 'F' ? '여성' : '남성'} 상품에서 찾았어요.` });
      if (r.query.unsupported?.length) notices.push({ kind: 'unsupported', text: `반영하지 못한 조건: ${r.query.unsupported.join(', ')}. 상품 자료에 이 정보가 없어서 이 조건 없이 골랐어요.` });
      if (r.query.unknown?.length) notices.push({ kind: 'unknown', text: `이해하지 못한 말: ${r.query.unknown.join(', ')}. 이 말은 빼고 골랐어요.` });
      if (r.query.comfort) notices.push({ kind: 'comfort', text: '착용감 자료는 없어요. 상품명에 ‘밴딩·이지·와이드’ 같은 표기가 있는 상품을 앞에 뒀어요.' });
      if (r.query.qualityUnavailable) notices.push({ kind: 'quality', text: '품질을 비교할 자료는 없어요. 가격으로 품질을 판단하지 않았어요.' });
      const none = !r.items.length;
      if (none) {
        notices.push(r.kindUnavailable
          ? { kind: 'kind-unavailable', text: `${r.kindNowhere ? '상품 목록에 아직' : `${r.gender === 'F' ? '여성' : '남성'} 상품에는`} ${r.kindUnavailable}${josa(r.kindUnavailable, '이', '가')} 없어요. 다른 종류로 바꿔 채우지 않았어요.` }
          : { kind: 'empty', text: `조건에 맞는 상품이 없어요. 조건을 자동으로 넓히지 않았어요.${conditions.some((c) => c.removable) ? ' 조건을 직접 빼고 다시 찾을 수 있어요.' : ''}` });
      }
      const fit = r.items.filter((x) => !x.offOccasion).map((x) => card(x.product, { slot: x.slot, reasons: x.reasons, offOccasion: false }));
      const off = r.items.filter((x) => x.offOccasion).map((x) => card(x.product, { slot: x.slot, reasons: x.reasons, offOccasion: true }));
      const occLabel = r.conds.find((x) => x.key === 'occasion')?.label || '';
      const outfit = r.outfit && !none ? outfitView(r.outfit) : null;
      const outfitNote = outfit
        ? (r.criteria.maxPrice != null ? '예산은 상품 한 벌 기준이에요(코디 합계 아님).' : null)
        : r.outfitTried && !none && (r.criteria.occasionFromQuery || r.criteria.excludedItems.length)
          ? `검색 조건(${criteriaLine({ occasion: r.criteria.occasion, season: r.criteria.season, style: r.criteria.style, excludedItems: r.criteria.excludedItems })})을 지키는 코디 공식은 없어요. 조건을 풀지 않았어요.`
          : null;
      const result = {
        ...base,
        text: query, understood: true,
        title: none ? '맞는 상품이 없어요' : r.dropped.length ? `${r.conds.map((x) => x.label).join(' · ') || '조건 없이'} 조건으로 다시 골랐어요` : (r.query.summary || `‘${said}’ 결과`),
        conditions, dropped: r.dropped, notices,
        products: fit, offOccasion: off, offOccasionTitle: off.length ? `${occLabel}에는 덜 맞는 대안 ${off.length}개` : '',
        total: r.items.length,
        outfit, outfitNote,
        listNote: r.query.priceSort ? `수집일 가격이 ${r.query.priceSort === 'desc' ? '높은' : '낮은'} 순서예요` : `${SEASON_LABEL[r.season]} 기준 · 평점과 후기 수를 함께 봤어요`,
        criteria: r.criteria, gender: r.gender, season: r.season, seasonLabel: SEASON_LABEL[r.season],
        examples: api.examples(r.gender),
      };
      lastAsk = { ids: new Set(r.items.map((x) => x.product.id)), criteria: r.criteria };
      return result;
    },

    // 상품 자세히: 이유, 같은 조건의 다른 선택, 이 상품으로 만든 코디, 판정.
    product(id, { criteria = 'auto' } = {}) {
      const p = PRODUCT_BY_ID[id];
      if (!p) return null;
      const slot = SLOT_BY_ID[p.slot];
      const st = engineState();
      const cr = criteria === 'auto' ? (lastAsk?.ids.has(id) ? lastAsk.criteria : null) : criteria;
      const g = slot.g;
      const styles = st.styles.filter((k) => STYLES[k]?.g.includes(g));
      const closet = st.closet.filter((i) => i.gender === g);
      const c = { gender: g, styles: styles.length ? styles : ['classic'], occasion: st.occasion, season: seasonOf(new Date(st.now)), closet, ownedSlots: new Set(closet.map((i) => i.slot)) };
      const { reasons } = scoreSlot(slot, c);
      const allowed = (text) => !(cr?.excludedItems || []).some((kind) => text.includes(kind));
      const fixed = productReasons(p, slot, [slot.why, ...reasons]);
      const why = [...new Set([...(fixed.traitLine ? [fixed.traitLine] : []), ...fixed.reasons])].filter(allowed).slice(0, 4);
      const sameKind = productsFor(slot.id).filter((x) => x.id !== p.id);
      const alts = sameKind.filter((x) => meetsCriteria(x, cr));
      const outside = sameKind.length - alts.length;
      const look = recommendLooks(
        { ...st, closet: st.closet.filter((item) => !(cr?.excludeColors || []).includes(item.color)), gender: g,
          styles: cr?.style ? [cr.style] : c.styles, season: cr?.season || undefined,
          budget: cr ? cr.maxPrice : null, minPrice: cr?.minPrice ?? null,
          minPriceExclusive: !!cr?.minPriceExclusive, maxPriceExclusive: !!cr?.maxPriceExclusive,
          hidden: [...(st.hidden || []), ...(cr?.excludeColors?.length ? SAFE_PRODUCTS.filter((x) => cr.excludeColors.includes(x.color)).map((x) => x.id) : [])] },
        { limit: 1, occasion: cr?.occasion || null, strictOccasion: !!cr?.occasionFromQuery, excludeSlot: cr?.excludeSlot || null, pinnedProduct: p },
      )[0] || null;
      const kept = cr ? criteriaLine({ ...cr, color: null, tone: null, brand: null }) : '';
      return {
        ...card(p, { slot }),
        why, tip: allowed(slot.tip) ? `이렇게 입어요: ${slot.tip}` : null,
        popularity: p.rating ? `평점 ${p.rating} · 후기 ${Number(p.reviews || 0).toLocaleString('ko-KR')}개 (인기 정보예요. 색·사이즈·핏을 보장하지 않아요.)` : null,
        colorNote: p.colorSource === 'image' ? '색은 상품 사진에서 추정했어요' : '색은 상품명·편집 분류 기준이에요',
        alternatives: alts.slice(0, 8).map((x) => card(x, { slot })),
        alternativesNote: cr && outside ? `검색 조건(${criteriaLine(productCriteria(cr))})에 맞지 않는 같은 종류 ${outside}개는 뺐어요.` : null,
        outfit: outfitView(look, { focusId: p.id }),
        outfitNote: look ? (kept ? `검색 조건(${kept})을 코디의 다른 옷에도 그대로 적용했어요. 예산은 옷 한 벌마다 같은 기준이에요.` : null)
          : kept ? `검색 조건(${kept})을 지키면서 만들 수 있는 코디가 없어요. 조건을 풀지 않았어요.` : null,
        keptConditions: kept || null,
        verdict: api.judge(id),
      };
    },

    // 내 옷 기준 판정. 현재 앱의 구매 비교 화면과 같은 순서로 결론을 고른다.
    judge(id) {
      const st = engineState();
      if (cache.judge.has(id)) return cache.judge.get(id);
      const p = PRODUCT_BY_ID[id];
      if (!p) return null;
      const slot = SLOT_BY_ID[p.slot];
      const j = journeyFor(id);
      const mine = st.closet.filter((g) => g.gender === slot.g && ['user', 'legacy'].includes(g.source));
      const trialN = mine.filter((g) => isTrial(g.id)).length, ownN = mine.length - trialN;
      const basis = !mine.length ? 'none' : !ownN ? 'trial' : !trialN ? 'mine' : 'mixed';
      const basisLabel = basis === 'none' ? '옷장 없이 판단했어요' : basis === 'trial' ? `체험용 옷 ${trialN}벌 기준` : basis === 'mine' ? `내 옷 ${ownN}벌 기준` : `내 옷 ${ownN}벌 · 체험용 ${trialN}벌 기준`;
      const kindName = garmentKindName(slot.shape);
      let candidate;
      try { candidate = candidateFromProduct(p); } catch (error) {
        const v = { basis, basisLabel, tone: 'info', title: '이 상품은 비교에 쓸 수 없어요', lines: [error.message], lean: null, owned: [], looks: [], newLookCount: 0, existingLookCount: 0, companion: null, ask: null, addSuggestion: null, cautions: [], record: recordView(j), fine: FINE };
        cache.judge.set(id, v);
        return v;
      }
      const cautions = relatedReturnRecords(S.journeys, candidate, j?.id)
        .map((r) => `같은 브랜드의 ${kindName}${josa(kindName, '을', '를')} 반품한 적 있어요 · ${r.name}${r.returnReason ? ` (${RETURN_LABEL[r.returnReason]})` : ''}`);
      if (j?.stage === 'returned') cautions.unshift(`이 상품을 반품했다고 기록했어요${j.feedback?.returnReason ? ` (${RETURN_LABEL[j.feedback.returnReason]})` : ''}`);
      const addSuggestion = { kind: slot.shape, kindName, slot: slot.id, slotName: slot.name, gender: slot.g, color: p.colorSource === 'image' ? null : p.color };
      if (basis === 'none') {
        const v = {
          basis, basisLabel, tone: 'none', title: '옷장 없이 고른 후보예요',
          lines: ['요청한 조건에는 맞아요. 가진 옷과 겹치는지는 아직 몰라요.', `가진 ${kindName}${josa(kindName, '을', '를')} 한 벌만 넣어도 겹치는지 바로 알려 드려요.`],
          lean: null, owned: [], looks: [], newLookCount: 0, existingLookCount: 0, companion: null, ask: null, addSuggestion, cautions, record: recordView(j), fine: FINE,
        };
        cache.judge.set(id, v);
        return v;
      }
      const self = j && ['received', 'kept'].includes(j.stage) && j.garmentId;
      const others = self ? { ...st, garments: st.garments.filter((g) => g.id !== j.garmentId), closet: st.closet.filter((g) => g.id !== j.garmentId) } : st;
      const absence = S.absences[id] || 'unknown';
      const cmp = compareCandidate(others, candidate, { absence, intent: 'add' });
      const ownershipCheck = cmp.missingChecks.find((x) => x.code === 'ownership-unknown');
      const needsOwnership = !cmp.sameTypeOwned.length && !cmp.sameProduct.length;
      const similarHeld = cmp.decision.kind !== 'skip' ? uniq([...cmp.similarOwned, ...(cmp.kindMatch?.sameColor || [])]) : [];
      const pair = cmp.newFormulaCount || cmp.decision.kind === 'skip' || similarHeld.length ? null : purchasePlanContext(others, candidate, { intent: 'add' });
      const firstLook = cmp.looks.find((l) => l.new) || cmp.looks[0];
      const otherKind = cmp.kindMatch?.otherColor || [], unsureKind = cmp.kindMatch?.unknownColor || [];
      const roughOnly = !cmp.newFormulaCount && cmp.decision.kind === 'hold' && cmp.actualGarmentIds.length;
      const title = j?.stage === 'kept' ? '계속 입는 내 옷이에요'
        : j?.stage === 'received' ? '받은 옷이에요 · 계속 입을지 정해 주세요'
        : cmp.decision.kind === 'skip' ? '같은 상품이 이미 있어요'
        : similarHeld.length ? '비슷한 옷이 이미 있어요'
        : firstLook && cmp.newFormulaCount ? `${firstLook.look.title} 코디가 새로 연결돼요`
        : pair ? '이 옷 하나로는 새 코디가 생기지 않아요'
        : cmp.decision.kind === 'consider' ? '가진 옷과 활용해볼 수 있어요'
        : roughOnly && unsureKind.length ? `${kindName}${josa(kindName, '은', '는')} 이미 ${otherKind.length + unsureKind.length}벌 있어요 · 색은 확인이 필요해요`
        : roughOnly && otherKind.length ? `${kindName}${josa(kindName, '은', '는')} 이미 ${otherKind.length}벌 있어요 · 색은 달라요`
        : roughOnly ? `등록한 옷 중 ${kindName}${josa(kindName, '은', '는')} 아직 없어요`
        : '결정 전에 조금 더 확인해요';
      const tone = j?.stage === 'kept' ? 'own' : j?.stage === 'received' ? 'info'
        : cmp.decision.kind === 'skip' || similarHeld.length ? 'stop'
        : cmp.newFormulaCount ? 'go' : pair ? 'pair' : cmp.decision.kind === 'consider' ? 'think' : roughOnly ? 'info' : 'think';
      const lean = cmp.decision.kind === 'skip' || similarHeld.length ? 'hold' : cmp.newFormulaCount ? 'buy' : null;
      const name = (g) => `${colorLabel(g.color)} ${garmentLabel(g)}`.trim();
      const lines = [];
      if (similarHeld.length) lines.push(`${similarHeld.slice(0, 3).map(name).join(', ')}${similarHeld.length > 3 ? ` 외 ${similarHeld.length - 3}벌` : ''} · 같은 종류·색이에요. 새로 더할 이유가 있는지 먼저 확인해 주세요.`);
      if (roughOnly && !similarHeld.length && !pair) lines.push('종류·색으로 먼저 비교했어요. 내 옷의 세부 종류·색을 채우면 어떤 코디가 생기는지도 알려 드려요.');
      if (pair) lines.push(`${pair.companionSlot.name}${josa(pair.companionSlot.name, '을', '를')} 함께 더해야 ${pair.pair.look.title} 조합이 돼요.`);
      if (firstLook && cmp.newFormulaCount) lines.push(`등록한 옷 기준으로 새 코디 공식 ${cmp.newFormulaCount}개. 실제 핏·사이즈는 따로 확인이 필요해요.`);
      if (ownershipCheck) lines.push(`${firstLook ? '어울리는 조합은 찾았어요. ' : ''}구매가 필요한지는 가진 옷을 한 번 더 확인해요.`);
      const reasons = [...new Set(pair || similarHeld.length ? cmp.missingChecks.map((x) => x.message) : cmp.decision.reasons)]
        .filter((x) => x !== ownershipCheck?.message && !lines.includes(x));
      const rel = new Map();
      const put = (rows, relation, label) => rows.forEach((g) => { if (!rel.has(g.id)) rel.set(g.id, { g, relation, label }); });
      put(cmp.exactOwned, 'same-product', '같은 상품·색');
      put(cmp.sameProduct, 'same-product', '같은 상품 · 옵션 확인 필요');
      put(cmp.similarOwned, 'same-color', '같은 세부 종류·색');
      put(cmp.kindMatch?.sameColor || [], 'same-color', '같은 종류·색');
      put(otherKind, 'other-color', '같은 종류 · 색 다름');
      put(unsureKind, 'unknown-color', '같은 종류 · 색 확인 필요');
      const looks = [...cmp.looks].sort((a, b) => Number(b.new) - Number(a.new)).slice(0, 3)
        .map((l) => ({ ...outfitView({ ...l, items: l.items }, { candidateId: id, focusId: id }), new: !!l.new }));
      const v = {
        basis, basisLabel, tone, title, lean, lines, reasons,
        owned: [...rel.values()].map(({ g, relation, label }) => ({ ...garmentView(g), relation, relationLabel: label })),
        looks, newLookCount: cmp.newFormulaCount, existingLookCount: cmp.existingFormulaCount,
        companion: pair ? { ...card(pair.companion.product), pairTitle: pair.pair.look.title, slotName: pair.companionSlot.name } : null,
        ask: needsOwnership && (!j || j.stage === 'candidate') ? {
          question: `${slot.name}${josa(slot.name, '이', '가')} 이미 있나요?`, value: absence,
          choices: [{ id: 'absent', label: '없어요' }, { id: 'present', label: '있어요' }, { id: 'unknown', label: '아직 몰라요' }],
          hint: absence === 'present' ? '가진 옷을 넣으면 겹치는지 정확히 비교해요.' : null,
        } : null,
        addSuggestion, cautions, record: recordView(j), fine: FINE,
      };
      cache.judge.set(id, v);
      return v;
    },
    setOwnership(productId, value) {
      if (!['absent', 'present', 'unknown'].includes(value)) throw new Error('있는지 여부를 골라 주세요.');
      commit(() => { S.absences = { ...S.absences, [productId]: value }; });
    },

    // 결정과 그 뒤의 기록(주문 → 받음 → 계속 입음 또는 반품).
    decide(productId, decision) {
      if (!['buy', 'hold', 'skip'].includes(decision)) throw new Error('결정을 골라 주세요.');
      const p = PRODUCT_BY_ID[productId];
      if (!p) throw new Error('상품을 다시 확인해 주세요.');
      const candidate = candidateFromProduct(p);
      commit(() => {
        let j = journeyFor(productId);
        if (!j) { j = createPurchaseJourney(candidate, { id: nextId('j'), at: iso() }); S.journeys = [...S.journeys, j]; }
        replaceJourney(transitionPurchaseJourney(j, decision, { at: iso() }));
      });
      return recordView(journeyFor(productId));
    },
    advance(productId, step, { reason = null } = {}) {
      const p = PRODUCT_BY_ID[productId];
      if (!p) throw new Error('상품을 다시 확인해 주세요.');
      const slot = SLOT_BY_ID[p.slot];
      commit(() => {
        let j = journeyFor(productId);
        if (!j) { j = createPurchaseJourney(candidateFromProduct(p), { id: nextId('j'), at: iso() }); S.journeys = [...S.journeys, j]; }
        if (step === 'received') {
          const garment = makeGarment({ id: nextId('g'), slot: slot.id, kind: slot.shape, gender: slot.g, color: p.colorSource === 'image' ? null : p.color, brand: p.brand, productId: p.id, label: p.name.slice(0, 80), source: 'user', createdAt: iso() });
          S.garments = [...S.garments, garment];
          replaceJourney(transitionPurchaseJourney(j, 'received', { at: iso(), changes: { garmentId: garment.id } }));
        } else if (step === 'returned') {
          if (!JOURNEY_RETURN_REASONS.includes(reason)) throw new Error('반품 사유를 골라 주세요.');
          replaceJourney(transitionPurchaseJourney(j, 'returned', { at: iso(), changes: { feedback: { fit: null, returnReason: reason } } }));
        } else if (['ordered', 'kept', 'worn'].includes(step)) {
          replaceJourney(transitionPurchaseJourney(j, step, { at: iso() }));
        } else throw new Error('지원하지 않는 기록이에요.');
      });
      return recordView(journeyFor(productId));
    },
    removeRecord(productId) {
      const j = journeyFor(productId);
      if (!j) return;
      if (j.stage !== 'candidate') throw new Error('주문 뒤의 기록은 지우지 않아요. 반품으로 정리해 주세요.');
      commit(() => { S.journeys = S.journeys.filter((x) => x.id !== j.id); const { [productId]: _, ...rest } = S.absences; S.absences = rest; });
    },
    records() { return api.getState().records; },

    // 옷장 기준 다음 한 벌(요청 없이). 옷장이 없으면 이번 계절 기본템이라고 밝힌다.
    suggest({ limit = 3 } = {}) {
      const st = engineState();
      const mine = st.closet.filter((g) => g.gender === S.gender && ['user', 'legacy'].includes(g.source));
      const rows = recommendItems(st, { limit });
      return {
        basis: mine.length ? 'closet' : 'none',
        title: mine.length ? '옷장 기준 다음 한 벌' : `옷장 없이 고른 ${SEASON_LABEL[seasonOf(new Date(st.now))]} 기본템`,
        items: rows.map((r) => ({ ...card(r.product, { slot: r.slot, reasons: r.reasons }), why: r.reasons[0] })),
      };
    },

    // 중고 매물: 앱 안 통합이 아니라 외부 사이트의 공개 검색 결과로 보내는 링크다.
    // 어울은 매물·가격·재고·판매 상태를 읽거나 저장하지 않는다(공식 연동 전).
    usedSearch(target) {
      const p = typeof target === 'string' ? PRODUCT_BY_ID[target] : target?.id ? PRODUCT_BY_ID[target.id] : null;
      const text = typeof target === 'object' && target?.text ? String(target.text).slice(0, 80) : null;
      if (!p && !text) return null;
      const slot = p ? SLOT_BY_ID[p.slot] : null;
      const clean = (name) => name.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      const ko = p ? `${p.brand} ${clean(p.name)}`.slice(0, 60) : text;
      const EN = { shirt: 'shirt', tee: 't-shirt', longtee: 'long sleeve t-shirt', polo: 'polo shirt', knit: 'sweater', sweat: 'sweatshirt', cardigan: 'cardigan', vest: 'vest', blazer: 'blazer', jacket: 'jacket', coat: 'coat', down: 'down jacket', pants: 'pants', jeans: 'jeans', skirt: 'skirt', dress: 'dress', sneaker: 'sneakers', loafer: 'loafers', boot: 'boots', bag: 'bag', cap: 'cap', beanie: 'beanie', belt: 'belt' };
      const JA = { shirt: 'シャツ', tee: 'Tシャツ', longtee: 'ロンT', polo: 'ポロシャツ', knit: 'ニット', sweat: 'スウェット', cardigan: 'カーディガン', vest: 'ベスト', blazer: 'ブレザー', jacket: 'ジャケット', coat: 'コート', down: 'ダウン', pants: 'パンツ', jeans: 'デニム', skirt: 'スカート', dress: 'ワンピース', sneaker: 'スニーカー', loafer: 'ローファー', boot: 'ブーツ', bag: 'バッグ', cap: 'キャップ', beanie: 'ニット帽', belt: 'ベルト' };
      const CEN = { white: 'white', ivory: 'ivory', beige: 'beige', blue: 'light blue', grey: 'grey', olive: 'olive', brown: 'brown', indigo: 'indigo', charcoal: 'charcoal', navy: 'navy', black: 'black', green: 'green', red: 'burgundy', pink: 'pink', yellow: 'yellow', purple: 'purple', orange: 'orange' };
      const CJA = { white: '白', ivory: 'アイボリー', beige: 'ベージュ', blue: 'ライトブルー', grey: 'グレー', olive: 'オリーブ', brown: 'ブラウン', indigo: 'インディゴ', charcoal: 'チャコール', navy: 'ネイビー', black: '黒', green: 'グリーン', red: 'ボルドー', pink: 'ピンク', yellow: 'イエロー', purple: 'パープル', orange: 'オレンジ' };
      const latin = p && /[A-Za-z]{3,}/.test(p.name) ? clean(p.name).replace(/[^A-Za-z0-9 \-]/g, ' ').replace(/\s+/g, ' ').trim() : '';
      const en = p ? (latin || [CEN[p.color], EN[slot.shape]].filter(Boolean).join(' ')) : '';
      const ja = p ? [CJA[p.color], JA[slot.shape]].filter(Boolean).join(' ') : '';
      const e = encodeURIComponent;
      const domestic = [
        { id: 'bunjang', label: '번개장터', url: `https://m.bunjang.co.kr/search/products?q=${e(ko)}`, query: ko },
        { id: 'daangn', label: '당근', url: `https://www.daangn.com/kr/search/buy-sell/?q=${e(ko)}`, query: ko, note: '동네 기준 검색' },
        { id: 'joongna', label: '중고나라', url: `https://web.joongna.com/search/${e(ko)}`, query: ko },
        { id: 'fruits', label: '후루츠패밀리', url: `https://fruitsfamily.com/search/${e(ko)}`, query: ko, note: '패션 중고' },
      ];
      const abroad = p ? [
        { id: 'ebay', label: 'eBay', url: `https://www.ebay.com/sch/i.html?_nkw=${e(en)}&LH_ItemCondition=3000`, query: en, note: '영어로 비슷한 종류·색 검색' },
        { id: 'mercari-jp', label: '메루카리(일본)', url: `https://jp.mercari.com/search?keyword=${e(ja)}&status=on_sale`, query: ja, note: '일본어로 비슷한 종류·색 검색' },
      ] : [];
      return {
        kind: 'search-links',
        note: '외부 사이트의 검색 결과로 이동해요. 어울은 매물·가격·재고·상태를 확인하지 않았어요.',
        exactNote: p ? `국내는 ‘${ko}’로 같은 상품을, 해외는 비슷한 종류·색을 찾아요.` : `‘${ko}’로 찾아요.`,
        abroadNote: '해외 매물은 배송대행·관세·반품 조건이 따로 있어요. 결제 전 판매처에서 확인해 주세요.',
        groups: [{ region: '국내 중고', links: domestic }, ...(abroad.length ? [{ region: '해외 중고', links: abroad }] : [])],
      };
    },

    // 사진 대신 쓰는 종류·색 그림. 받은 대상의 slot(세부 종류) 또는 kind와 색을 쓴다.
    art(target, { size = '100%', line = '#3a3a3a' } = {}) {
      const slot = SLOT_BY_ID[target?.slot] || { id: `k-${target?.kind || 'tee'}`, shape: target?.kind || target?.shape || 'tee' };
      const hex = target?.colorHex || colorHex(target?.color) || '#cfcfcf';
      const svg = garmentSvg(slot, { size, color: hex }).replace('var(--art-line)', `var(--art-line, ${line})`);
      // 비공개 시험 링크(?photos=1)에서만, 묶을 때 고른 몇 개 상품에 한해 판매처 사진을 겹친다.
      // 사진을 못 불러오면 그림이 그대로 보인다. 공개 권리는 확인되지 않았다.
      const pid = PRODUCT_BY_ID[target?.id] ? target.id : target?.product?.id || target?.productId || null;
      const src = photos && pid ? PRODUCT_BY_ID[pid]?.img : null;
      if (!src || !/^https:\/\/image\.msscdn\.net\//.test(src)) return svg;
      return `<span style="position:relative;display:block;width:100%;height:100%">${svg}<img src="${src}" alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async" onerror="this.remove()" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff;border-radius:inherit"></span>`;
    },
    photos: { on: !!photos, count: PRODUCTS.filter((p) => p.img).length, note: '사진 일부 · 권리 미확인 · 비공개 시험용' },
  };

  if (reset) { S = blank(); save(); } else S = load();
  if (typeof window !== 'undefined' && window.addEventListener)
    window.addEventListener('storage', (event) => {
      if (event.key !== key) return;
      S = load();
      version++;
      lastAsk = null;
      notify();
    });
  return api;
}
