/*
 * Feedback — 베타 참여자가 "의견 보내기"로 복사해 보낸 글에서 사용 요약 한 줄(EOUL1|…)을 찾아 베타 지표를 계산한다.
 * 서버가 없으므로 운영자가 받은 글(카카오톡 등)을 붙여 넣어야 숫자가 나온다. 이 계산은 그 브라우저 안에서만 하고 아무 데도 보내지 않는다.
 *
 * 요약 줄: EOUL1|id=무작위|v=버전|at=날짜|first=첫 사용|own=옷|draft=초안|photo=내 사진|cand=후보|done=판정 끝|prod=상품|rack=3D 걸림|quick=빠른 시작|days=연 날|d30=최근 30일 연 날
 *          |fol=2주 뒤 답|good=잘함|ok=그저|regret=후회·아쉬움|nb=결국 안 삼|due=물을 차례|pk=추천 받음(날·조건마다 한 번)|pko=판매처 엶|pkc=추천→후보|pka=이걸로 할래요|pkb=샀어요|pkf=2주 뒤 답|pkfit=사이즈 잘 맞음
 *          |pkr=아니에요|pkal=대안이 나음|pknow=지금 보는 상품 견줌|pksh=친구에게 물어봄|pkx=상품id~산 사이즈~fit|small|big~good|ok|regret~추천 사이즈(쉼표로, 고른 사람만)|nx=다음에 받고 싶은 품목(쉼표로)
 *          |pkw=아닌 이유 수(비쌈~브랜드~핏~이미 있음~기타)|nwd=보던 상품 결정 수(그대로 삼~1위로 바꿈~안 삼)
 *          |pmf=very·some·not·quit|nps=0~10|err=오류 수|scr=화면
 * id 는 브라우저마다 처음 한 번 만드는 무작위 글자다(사람을 알아볼 수 없다). 같은 사람이 여러 번 보내면 가장 최근 것만 센다.
 *
 * 기준(THRESH)은 docs/beta-plan 의 제안값이고, PMF 40% 는 업계에서 흔히 쓰는 참고선(Sean Ellis 질문)이다. 지인 표본은 작고 치우쳐 있어 숫자를 일반화하지 않는다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Feedback = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PREFIX = 'EOUL1';
  const NUMS = ['own', 'draft', 'photo', 'cand', 'done', 'prod', 'rack', 'quick', 'days', 'd30', 'fol', 'good', 'ok', 'regret', 'nb', 'due', 'pk', 'pko', 'pkc', 'pka', 'pkb', 'pkf', 'pkfit', 'pkr', 'pkal', 'pknow', 'pksh', 'err'];   // pksh: 추천을 친구에게 물어본 횟수   // pkr: '아니에요', pkal: 대안이 나음, pknow: '지금 보는 상품'을 견줌   // pk: 기준 추천을 받아 본 횟수, pko: 판매처를 연 횟수, pkc: 후보로 넣은 수, pka: '이걸로 할래요', pkb: 샀어요, pkf: 2주 뒤 답, pkfit: 사이즈 잘 맞음
  const PMF = { very: '매우 아쉽다', some: '조금 아쉽다', not: '아쉽지 않다', quit: '이미 안 쓴다' };
  // [제안값] 추천을 받아 본 사람 절반, 판매처까지 연 사람 절반, 샀다고 한 사람 20%, 2주 뒤 '사이즈 잘 맞음' 70%(답 5개 이상), 보던 상품을 견줘 본 사람 30%, 유지 1/3, PMF 40%(참고선)
  const THRESH = { activated: 0.5, outbound: 0.5, bought: 0.2, fit: 0.7, now: 0.3, retained: 1 / 3, pmf: 0.4 };
  const WHY = ['price', 'brand', 'fit', 'have', 'other'];                                             // '아니에요' 이유(pkw 순서)

  /** 요약 줄 객체를 글자 한 줄로. 값의 | 와 공백은 지운다. */
  function line(o) {
    const keys = ['id', 'v', 'at', 'first'].concat(NUMS.filter((k) => k !== 'err')).concat(['pkx', 'pkw', 'nwd', 'nx', 'pmf', 'nps', 'err', 'scr']);
    return PREFIX + keys.map((k) => '|' + k + '=' + String(o[k] == null ? '' : o[k]).replace(/[|\s]+/g, '')).join('');
  }
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
  function parseOne(s) {
    const o = {};
    for (const part of s.split('|').slice(1)) { const at = part.indexOf('='); if (at > 0) o[part.slice(0, at)] = part.slice(at + 1); }
    const out = { id: String(o.id || '').slice(0, 16), v: String(o.v || '').slice(0, 20), at: date(o.at), first: date(o.first), pmf: Object.prototype.hasOwnProperty.call(PMF, o.pmf) ? o.pmf : '', scr: String(o.scr || '').slice(0, 12) };
    out.nx = String(o.nx || '').split(',').filter((x) => /^[a-z][a-z-]{1,15}$/.test(x)).slice(0, 10);   // 다음에 추천받고 싶은 옷(품목 열쇠)
    out.pkx = String(o.pkx || '').split(',').map((x) => /^([a-z0-9-]{1,60})~([A-Za-z0-9]{0,8})~(fit|small|big)~(good|ok|regret)(?:~([A-Za-z0-9]{0,8}))?$/.exec(x)).filter(Boolean).slice(0, 10).map((m) => ({ product: m[1], size: m[2], fit: m[3], feel: m[4], rec: m[5] || '' }));   // 추천에서 산 상품의 2주 뒤 사이즈 결과(고른 사람만). rec: 그때 추천한 사이즈
    const cnt3 = (v, n) => { const a = String(v || '').split('~').map(Number); return Array.from({ length: n }, (_, i) => (Number.isInteger(a[i]) && a[i] >= 0 && a[i] < 1000 ? a[i] : 0)); };
    const w = cnt3(o.pkw, WHY.length); out.pkw = {}; WHY.forEach((k, i) => { out.pkw[k] = w[i]; });   // '아니에요' 이유별 수
    const d = cnt3(o.nwd, 3); out.nwd = { keep: d[0], switch: d[1], skip: d[2] };                    // 보던 상품: 그대로 삼·1위로 바꿈·안 삼
    for (const k of NUMS) { const n = Number(o[k]); out[k] = Number.isFinite(n) && n >= 0 && n < 100000 ? Math.floor(n) : 0; }
    const nps = o.nps === '' || o.nps == null ? NaN : Number(o.nps);
    out.nps = Number.isInteger(nps) && nps >= 0 && nps <= 10 ? nps : null;
    return out.id ? out : null;
  }
  /** 붙여 넣은 글 전체에서 요약 줄을 모두 찾는다. 같은 id 는 날짜가 가장 늦은 것(같으면 나중 것)만 남긴다. */
  function parse(text) {
    const found = String(text || '').match(new RegExp(PREFIX + '\\|[^\\s]+', 'g')) || [];
    const by = new Map();
    for (const s of found) { const e = parseOne(s); if (!e) continue; const prev = by.get(e.id); if (!prev || e.at >= prev.at) by.set(e.id, e); }
    return Array.from(by.values());
  }
  const rate = (k, n) => ({ count: k, total: n, pct: n ? Math.round((k / n) * 100) : null });
  /** 베타 지표. 비율은 사람 수 기준이다. */
  function summarize(entries) {
    const n = entries.length, cnt = (f) => entries.filter(f).length, sum = (k) => entries.reduce((a, e) => a + e[k], 0);
    const pmfAns = entries.filter((e) => e.pmf), npsAns = entries.filter((e) => e.nps != null);
    const prom = npsAns.filter((e) => e.nps >= 9).length, det = npsAns.filter((e) => e.nps <= 6).length;
    return {
      n,
      activated: rate(cnt((e) => e.own >= 5), n),                                                   // 옷 5벌 이상 넣음
      value: rate(cnt((e) => e.done >= 1), n),                                                      // 살까 말까를 끝까지(결정 기록) 1건 이상
      retained: rate(cnt((e) => e.d30 >= 3), n),                                                    // 최근 30일에 3일 이상 엶
      follow: { answers: sum('fol'), good: sum('good'), ok: sum('ok'), regret: sum('regret'), notbought: sum('nb'), due: sum('due') },
      decisions: sum('done'),
      picked: rate(cnt((e) => e.pk >= 1), n),                                                      // 기준 추천을 한 번이라도 받아 본 사람
      outbound: rate(cnt((e) => e.pko >= 1), n),                                                   // 추천에서 판매처까지 열어 본 사람(살 마음의 신호)
      accepted: rate(cnt((e) => e.pka >= 1), n),                                                   // '이걸로 할래요'를 누른 사람
      bought: rate(cnt((e) => e.pkb >= 1), n),                                                     // 추천에서 샀다고 한 사람
      pickFollow: { answers: sum('pkf'), fit: sum('pkfit') },
      rejected: rate(cnt((e) => e.pkr >= 1), n), altChosen: sum('pkal'), nowUsers: rate(cnt((e) => e.pknow >= 1), n),   // '아니에요'를 누른 사람, 대안이 낫다고 한 수, '지금 보는 상품'을 써 본 사람
      fitOutcomes: entries.reduce((a, e) => a.concat(e.pkx), []), shared: sum('pksh'),
      rejectWhy: WHY.reduce((m, k) => { m[k] = entries.reduce((a, e) => a + (e.pkw ? e.pkw[k] : 0), 0); return m; }, {}),
      nowDecide: ['keep', 'switch', 'skip'].reduce((m, k) => { m[k] = entries.reduce((a, e) => a + (e.nwd ? e.nwd[k] : 0), 0); return m; }, {}),
      wishes: entries.reduce((m, e) => { for (const k of e.nx) m[k] = (m[k] || 0) + 1; return m; }, {}),   // 다음 품목 수요: 품목 → 사람 수
      pmf: Object.assign(rate(pmfAns.filter((e) => e.pmf === 'very').length, pmfAns.length), { answered: pmfAns.length, very: cnt((e) => e.pmf === 'very'), some: cnt((e) => e.pmf === 'some'), not: cnt((e) => e.pmf === 'not'), quit: cnt((e) => e.pmf === 'quit') }),
      nps: { answered: npsAns.length, promoters: prom, detractors: det, passives: npsAns.length - prom - det, score: npsAns.length ? Math.round(((prom - det) / npsAns.length) * 100) : null },
      errors: cnt((e) => e.err > 0),
      versions: Array.from(new Set(entries.map((e) => e.v))).sort(),
    };
  }
  /** 기준과 견준 판정. 아직 사람이 적으면(5명 미만, 사이즈 답 5개 미만) 판단하지 않는다. 추천 제품 기준: 추천 받음 → 판매처 → 샀어요 → 2주 뒤 사이즈. */
  function verdicts(sm) {
    const judge = (r, th) => (sm.n < 5 || r.pct == null ? 'few' : r.count / r.total >= th ? 'pass' : 'below');
    const fa = sm.pickFollow.answers;
    return { picked: judge(sm.picked, THRESH.activated), outbound: judge(sm.outbound, THRESH.outbound), bought: judge(sm.bought, THRESH.bought),
      fit: fa < 5 ? 'few' : sm.pickFollow.fit / fa >= THRESH.fit ? 'pass' : 'below', now: judge(sm.nowUsers, THRESH.now), retained: judge(sm.retained, THRESH.retained),
      pmf: sm.pmf.answered < 5 ? 'few' : sm.pmf.count / sm.pmf.total >= THRESH.pmf ? 'pass' : 'below',
      activated: judge(sm.activated, 0.5), value: judge(sm.value, 1 / 3) };                           // 옷장 쪽(옷 5벌·살까 말까 끝까지)은 참고로만
  }
  return { PREFIX, PMF, THRESH, WHY, line, parse, parseOne, summarize, verdicts };
});
