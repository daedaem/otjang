/*
 * Judge — 구매 후보 판정과 옷장 비교. AI를 쓰지 않는다. 같은 입력이면 같은 결과가 나온다.
 *
 *  findOverlaps(candidate, owned)   후보와 겹쳐 보이는 보유 옷
 *  judgeCandidate(owned, candidate) 겹치는 옷, 새로 생기는 조합, 걸리는 점
 *  compareWardrobes(mine, theirs)   둘 다 가진 것, 한쪽에만 있는 것
 *  inSeason(item, season)           계절 필터
 *
 * 결과에 확률이나 "사라/사지 마라"는 판정은 넣지 않는다. 규칙이 본 사실과 그 근거 문장만 돌려준다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./recommend.js'));
  else root.Judge = factory(root.Recommend);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const LIGHT_NEAR = 15;   // 밝기 차이가 이 안이면 "비슷한 밝기"로 본다 [제안값]
  const group = (it) => R.GROUP[it.family] || it.family;
  const patterned = (it) => !!it.pattern && it.pattern !== 'solid';
  const samePattern = (a, b) => (patterned(a) ? a.pattern === b.pattern : !patterned(b));
  const norm = (s) => String(s || '').toLowerCase().replace(/[\s·.,/()\-_]+/g, '');
  const isOwned = (it) => it.status !== 'candidate' && it.status !== 'gone';

  /** 계절이 비어 있으면 모든 계절로 본다. */
  function inSeason(item, season) {
    if (!season || !item.seasons || !item.seasons.length) return true;
    return item.seasons.indexOf(season) >= 0;
  }

  /** 두 옷이 겹쳐 보이는지. 같은 점과 다른 점을 문장으로 돌려준다. */
  function similarity(a, b) {
    const same = [], diff = [];
    if (a.cat !== b.cat) return { overlap: false, level: 'none', same, diff };
    const gap = Math.abs(a.light - b.light);
    (a.kind === b.kind ? same : diff).push(a.kind === b.kind ? '종류가 같습니다' : '종류가 다릅니다');
    (group(a) === group(b) ? same : diff).push(group(a) === group(b) ? '색 계열이 같습니다' : '색 계열이 다릅니다');
    (gap <= LIGHT_NEAR ? same : diff).push(gap <= LIGHT_NEAR ? '밝기가 비슷합니다' : '밝기가 다릅니다');
    (samePattern(a, b) ? same : diff).push(samePattern(a, b) ? (patterned(a) ? '무늬가 같습니다' : '둘 다 무지입니다') : '무늬가 다릅니다');
    const fgap = Math.abs((a.formality || 2) - (b.formality || 2));
    (fgap <= 1 ? same : diff).push(fgap <= 1 ? '격식이 비슷합니다' : '격식이 다릅니다');
    const colorClose = group(a) === group(b) && gap <= LIGHT_NEAR;
    const overlap = colorClose && (a.kind === b.kind || samePattern(a, b));
    const level = !overlap ? 'none' : (a.kind === b.kind && samePattern(a, b) && fgap <= 1 ? 'strong' : 'partial');
    return { overlap, level, same, diff, gap };
  }

  function findOverlaps(candidate, items) {
    return items.filter((it) => isOwned(it) && it.id !== candidate.id)
      .map((it) => Object.assign({ item: it }, similarity(candidate, it)))
      .filter((r) => r.overlap)
      .sort((x, y) => (x.level === y.level ? x.gap - y.gap : x.level === 'strong' ? -1 : 1));
  }

  /** 상의·하의 쌍 가운데 주의 사항이 없는 것. */
  function cleanPairs(items) {
    const tops = items.filter((i) => i.cat === 'top'), bottoms = items.filter((i) => i.cat === 'bottom');
    const out = [];
    for (const top of tops) for (const bottom of bottoms) {
      const p = R.scorePair(top, bottom);
      if (!p.caution.length) out.push({ top, bottom, score: p.score, why: p.why });
    }
    return out;
  }

  function tally(list) {
    const m = new Map();
    for (const s of list) m.set(s, (m.get(s) || 0) + 1);
    return Array.from(m, ([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : 1));
  }

  /**
   * 후보 한 벌을 보유 옷에 비춰 본다.
   * 반환: { supported, overlaps, before, after, added, top3, blockers, needs, note }
   *   before/after  주의 사항 없는 상의·하의 쌍의 수 (아우터 후보는 그 아우터를 걸칠 수 있는 쌍의 수)
   *   added         후보로 새로 생기는 쌍
   *   top3          대표 조합 3개. 가능한 한 서로 다른 옷과 짝짓는다
   *   blockers      조합이 안 되는 이유와 그 이유에 걸린 옷의 수
   */
  function judgeCandidate(allItems, candidate, opts) {
    const season = opts && opts.season;
    const owned = allItems.filter((it) => isOwned(it) && it.id !== candidate.id && inSeason(it, season));
    const overlaps = findOverlaps(candidate, owned);
    const base = { supported: true, overlaps, before: 0, after: 0, added: [], top3: [], blockers: [], needs: [], note: '' };
    const tops = owned.filter((i) => i.cat === 'top'), bottoms = owned.filter((i) => i.cat === 'bottom'), outers = owned.filter((i) => i.cat === 'outer');
    const pairsBefore = cleanPairs(owned);

    if (candidate.cat === 'top' || candidate.cat === 'bottom') {
      const partners = candidate.cat === 'top' ? bottoms : tops;
      const word = candidate.cat === 'top' ? '하의' : '상의';
      if (!partners.length) {
        base.note = '보유한 ' + word + '가 없어 조합을 만들 수 없습니다.';
        return base;
      }
      const cautions = [];
      for (const p of partners) {
        const top = candidate.cat === 'top' ? candidate : p, bottom = candidate.cat === 'top' ? p : candidate;
        const s = R.scorePair(top, bottom);
        if (!s.caution.length) {
          // 걸칠 수 있는 아우터: 아우터 규칙에서도 주의 사항이 없는 것
          const okOuters = outers.filter((o) => !R.scoreOuter(o, top, bottom).caution.length);
          base.added.push({ top, bottom, partner: p, score: s.score, why: s.why, outers: okOuters });
        } else cautions.push.apply(cautions, s.caution);
      }
      base.before = pairsBefore.length;
      base.after = pairsBefore.length + base.added.length;
      base.blockers = tally(cautions).map((b) => Object.assign(b, { total: partners.length, word }));
      base.top3 = base.added.slice().sort((a, b) => b.score - a.score || (a.partner.id < b.partner.id ? -1 : 1)).slice(0, 3).map((c) => {
        // 아우터가 있으면 점수가 가장 높은 것을 하나 얹어 보여 준다
        let best = null;
        for (const o of c.outers) {
          const so = R.scoreOuter(o, c.top, c.bottom);
          if (!best || so.score > best.s.score) best = { o, s: so };
        }
        return { top: c.top, bottom: c.bottom, outer: best && best.s.score > 0 ? best.o : null, score: c.score + (best && best.s.score > 0 ? best.s.score : 0), why: c.why.concat(best && best.s.score > 0 ? best.s.why : []) };
      });
      if (!base.added.length) {
        const lo = candidate.light - 18, hi = candidate.light + 18;
        const range = [lo >= 0 ? '밝기 ' + lo + ' 이하' : '', hi <= 100 ? '밝기 ' + hi + ' 이상' : ''].filter(Boolean).join('이거나 ');
        if (range) base.needs.push('이 옷과 밝기 차이가 나는 ' + word + '가 있으면 조합이 생깁니다 (' + range + ').');
      }
      return base;
    }

    if (candidate.cat === 'outer') {
      if (!pairsBefore.length) {
        base.note = '주의 사항 없는 상의·하의 조합이 아직 없어 아우터를 얹어 볼 수 없습니다.';
        return base;
      }
      const cautions = [];
      for (const p of pairsBefore) {
        const s = R.scoreOuter(candidate, p.top, p.bottom);
        if (!s.caution.length) base.added.push({ top: p.top, bottom: p.bottom, partner: p.top, score: p.score + s.score, why: p.why.concat(s.why), outers: [] });
        else cautions.push.apply(cautions, s.caution);
      }
      // 지금 아우터들이 걸칠 수 있는 쌍의 수와 견줄 수 있게, 기준은 "쌍의 수"로 둔다
      base.before = pairsBefore.length;
      base.after = base.added.length;
      base.blockers = tally(cautions).map((b) => Object.assign(b, { total: pairsBefore.length, word: '조합' }));
      const seenTop = new Set(), picked = [];
      const sorted = base.added.slice().sort((a, b) => b.score - a.score || (a.top.id + a.bottom.id < b.top.id + b.bottom.id ? -1 : 1));
      for (const c of sorted) { if (picked.length < 3 && !seenTop.has(c.top.id)) { picked.push(c); seenTop.add(c.top.id); } }
      for (const c of sorted) { if (picked.length < 3 && picked.indexOf(c) < 0) picked.push(c); }
      base.top3 = picked.map((c) => ({ top: c.top, bottom: c.bottom, outer: candidate, score: c.score, why: c.why }));
      return base;
    }

    base.supported = false;
    base.note = '신발과 소품은 조합 규칙이 아직 없어 겹치는 옷만 보여 줍니다.';
    return base;
  }

  /** 두 옷이 같은 자리를 채우는 옷인지 (옷장 비교용). 브랜드와 이름이 같으면 같은 옷으로 본다. */
  function matchKind(a, b) {
    if (a.cat !== b.cat) return '';
    if (a.brand && b.brand && norm(a.brand) === norm(b.brand) && norm(a.name) === norm(b.name)) return 'exact';
    // 프린트는 자리(슬롯)를 가르지 않는다. 줄무늬와 체크만 무지와 다른 자리로 본다
    const woven = (x) => x.pattern === 'stripe' || x.pattern === 'check';
    if (a.kind === b.kind && group(a) === group(b) && Math.abs(a.light - b.light) <= LIGHT_NEAR + 5 && woven(a) === woven(b)) return 'similar';
    return '';
  }

  /**
   * 내 옷장과 다른 옷장(또는 기본 옷장)을 견준다. 한 벌은 한 벌과만 짝짓는다.
   * 반환: { both: [{ mine, theirs, how }], onlyTheirs: [item], onlyMine: [item] }
   */
  function compareWardrobes(mineAll, theirsAll, opts) {
    const season = opts && opts.season;
    const mine = mineAll.filter((it) => isOwned(it) && inSeason(it, season));
    const theirs = theirsAll.filter((it) => isOwned(it) && inSeason(it, season));
    const used = new Set(), both = [], onlyTheirs = [];
    for (const pass of ['exact', 'similar']) {
      for (const t of theirs) {
        if (both.some((b) => b.theirs === t)) continue;
        const m = mine.find((x) => !used.has(x.id) && matchKind(x, t) === pass);
        if (m) { used.add(m.id); both.push({ mine: m, theirs: t, how: pass }); }
      }
    }
    for (const t of theirs) if (!both.some((b) => b.theirs === t)) onlyTheirs.push(t);
    const onlyMine = mine.filter((m) => !used.has(m.id));
    return { both, onlyTheirs, onlyMine };
  }

  return { LIGHT_NEAR, similarity, findOverlaps, cleanPairs, judgeCandidate, compareWardrobes, matchKind, inSeason, isOwned };
});
