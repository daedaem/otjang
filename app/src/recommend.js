/*
 * Recommend — 규칙 기반 조합 추천. AI를 쓰지 않는다.
 * 입력: 옷장 아이템 목록. 출력: 점수 높은 조합 3개와 각 조합의 근거 문장.
 * 같은 입력이면 항상 같은 결과가 나온다.
 *
 * 아이템 필드
 *   cat: 'outer' | 'top' | 'bottom' | 'shoes'
 *   family: 색 계열 (navy, indigo, black, gray, white, ivory, beige, khaki, brown, olive, green, blue, red, burgundy …)
 *   light: 밝기 0(검정)~100(흰색)
 *   formality: 1(편한 차림) ~ 3(단정한 차림)
 *   pattern: 'solid' | 'stripe' | 'check' | 'graphic'
 *   kind: 'shirt' | 'sweat' | 'cardigan' | 'jacket' | 'denim' | 'chino' …
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Recommend = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 멀리서 보면 한 색으로 읽히는 계열끼리 묶는다
  const GROUP = { navy: 'deep-blue', indigo: 'deep-blue', black: 'black', gray: 'gray', olive: 'olive', brown: 'brown', khaki: 'khaki', beige: 'khaki', blue: 'light-blue', green: 'green', white: 'white', ivory: 'white', red: 'red', burgundy: 'red' };
  const group = (it) => GROUP[it.family] || it.family;
  const patterned = (it) => it.pattern && it.pattern !== 'solid';

  /** 상의와 하의 한 쌍의 점수와 근거. */
  function scorePair(top, bottom) {
    let score = 0;
    const why = [], caution = [];
    const gap = Math.abs(top.light - bottom.light);
    if (gap >= 35) { score += 2; why.push('상의와 하의의 밝기 차이가 커서 위아래가 또렷하게 나뉩니다.'); }
    else if (gap >= 18) { score += 1; why.push('상의와 하의의 밝기가 적당히 다릅니다.'); }
    else if (group(top) === group(bottom)) { score -= 2; caution.push('상의와 하의가 비슷한 색이라 한 덩어리로 보일 수 있습니다.'); }
    else { score -= 1; caution.push('상의와 하의의 밝기가 비슷합니다.'); }

    const fd = Math.abs(top.formality - bottom.formality);
    if (fd <= 1) { score += 1; why.push('상의와 하의의 격식 수준이 비슷합니다.'); }
    else { score -= 1; caution.push('상의와 하의의 격식 차이가 큽니다.'); }

    if (patterned(top) && !patterned(bottom)) { score += 1; why.push('무늬는 상의 하나에만 있습니다.'); }
    if (patterned(top) && patterned(bottom)) { score -= 2; caution.push('상의와 하의에 모두 무늬가 있습니다.'); }
    return { score, why, caution };
  }

  /** 상의·하의 위에 아우터를 걸쳤을 때 더하거나 빼는 점수와 근거. */
  function scoreOuter(outer, top, bottom) {
    let score = 0;
    const why = [], caution = [];
    if (group(outer) !== group(top)) { score += 1; why.push('아우터와 상의의 색이 달라 겹쳐 입은 층이 보입니다.'); }
    else { score -= 1; caution.push('아우터와 상의의 색이 비슷합니다.'); }

    if (outer.light + 12 < top.light) { score += 1; why.push('밝은 상의 위에 어두운 아우터라 안쪽이 드러납니다.'); }

    if (group(outer) === group(bottom) && Math.abs(outer.light - bottom.light) < 12) { score -= 1; caution.push('아우터와 하의의 색이 겹칩니다.'); }

    if (Math.abs(outer.formality - top.formality) <= 1) { score += 1; why.push('아우터와 상의의 격식 수준이 비슷합니다.'); }
    else { score -= 1; caution.push('아우터와 상의의 격식 차이가 큽니다.'); }

    if (outer.kind === 'cardigan') {
      if (top.kind === 'shirt') { score += 1; why.push('셔츠 위에 카디건은 무난한 겹쳐 입기입니다.'); }
      else if (top.kind === 'sweat') { score -= 2; caution.push('스웻셔츠 위에 카디건은 부피가 겹칩니다.'); }
    }
    if (patterned(outer) && patterned(top)) { score -= 2; caution.push('아우터와 상의에 모두 무늬가 있습니다.'); }
    return { score, why, caution };
  }

  /** 가능한 모든 조합에 점수를 매긴다. 아우터 없는 조합도 포함한다. */
  function allCombos(items) {
    const tops = items.filter((i) => i.cat === 'top');
    const bottoms = items.filter((i) => i.cat === 'bottom');
    const outers = [null].concat(items.filter((i) => i.cat === 'outer'));
    const out = [];
    for (const top of tops) for (const bottom of bottoms) {
      const pair = scorePair(top, bottom);
      for (const outer of outers) {
        const o = outer ? scoreOuter(outer, top, bottom) : { score: 0, why: [], caution: [] };
        out.push({
          top: top.id, bottom: bottom.id, outer: outer ? outer.id : null,
          score: pair.score + o.score,
          why: pair.why.concat(o.why),
          caution: pair.caution.concat(o.caution),
        });
      }
    }
    // 점수가 같으면 id 순서로 정해 결과가 흔들리지 않게 한다
    const key = (c) => [c.top, c.bottom, c.outer || ''].join('|');
    out.sort((a, b) => b.score - a.score || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    return out;
  }

  /**
   * 추천 n개를 고른다. 같은 상의를 두 번 쓰지 않고, 하의와 아우터는 가능한 한 겹치지 않게 한다.
   * exclude: 빼고 싶은 조합 키('top|bottom|outer') 목록.
   */
  function recommend(items, n, exclude) {
    n = n || 3;
    const skip = new Set(exclude || []);
    const combos = allCombos(items);
    const picked = [];
    const usedTop = new Set(), usedBottom = new Set(), usedOuter = new Set();
    for (let pass = 0; pass < 2 && picked.length < n; pass++) {
      for (const c of combos) {
        if (picked.length >= n) break;
        if (picked.indexOf(c) >= 0) continue;
        if (skip.has([c.top, c.bottom, c.outer || ''].join('|'))) continue;
        if (usedTop.has(c.top)) continue;
        // 첫 바퀴에서는 하의와 아우터도 새것만 고른다. 모자라면 둘째 바퀴에서 겹침을 허용한다
        if (pass === 0 && (usedBottom.has(c.bottom) || (c.outer && usedOuter.has(c.outer)))) continue;
        picked.push(c);
        usedTop.add(c.top); usedBottom.add(c.bottom); if (c.outer) usedOuter.add(c.outer);
      }
    }
    return picked;
  }

  return { scorePair, scoreOuter, allCombos, recommend, GROUP };
});
