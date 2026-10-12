// 실행: node --test test/*.cjs — 베타 의견 요약 줄(EOUL1|…)을 읽어 지표를 계산한다 (src/feedback.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/feedback.js');

const mk = (o) => F.line(Object.assign({ id: 'a1', v: '0.5.0-beta', at: '2026-10-20', own: 0, cand: 0, done: 0, days: 1, d30: 1, first: '2026-10-13', pmf: '', nps: '', err: 0, scr: '390x844' }, o));

test('요약 줄은 한 줄이고, 다시 읽으면 같은 값이 나온다. 이상한 값은 버리거나 0 으로 둔다', () => {
  const s = mk({ id: 'k3x9q2', own: 6, cand: 2, done: 1, quick: 5, fol: 1, good: 1, pmf: 'very', nps: 9 });
  assert.ok(!/\s/.test(s) && s.startsWith('EOUL1|id=k3x9q2|'));
  const e = F.parseOne(s);
  assert.deepEqual([e.id, e.own, e.cand, e.done, e.quick, e.fol, e.good, e.pmf, e.nps, e.at], ['k3x9q2', 6, 2, 1, 5, 1, 1, 'very', 9, '2026-10-20']);
  const bad = F.parseOne('EOUL1|id=z|own=-3|done=abc|pmf=love|nps=11|at=어제');
  assert.deepEqual([bad.own, bad.done, bad.pmf, bad.nps, bad.at], [0, 0, '', null, '']);
  assert.equal(F.parseOne('EOUL1|own=3'), null);                                                     // id 없는 줄은 세지 않는다
  assert.ok(!F.line({ id: 'a b|c' }).includes(' ') && F.line({ id: 'a b|c' }).includes('id=abc'));
});

test('카톡에 섞인 글에서 요약 줄을 찾고, 같은 사람(id)은 가장 최근 것만 센다', () => {
  const chat = ['[민지] 오후 9:01 써 봤어요 좋네요', '[어울 0.5.0-beta]', mk({ id: 'p1', own: 3, at: '2026-10-14' }), '[민지] 오후 9:30 다시 보냄', mk({ id: 'p1', own: 7, done: 1, at: '2026-10-21' }),
    '[준호] 오후 10:00 ' + mk({ id: 'p2', own: 12, done: 2, d30: 4, pmf: 'very', nps: 10 }), '상관없는 글 EOUL2|id=x'].join('\n');
  const es = F.parse(chat);
  assert.deepEqual(es.map((e) => [e.id, e.own]), [['p1', 7], ['p2', 12]]);
});

test('지표: 활성화(5벌)·핵심 가치(판정 끝)·유지(30일 3일)·2주 뒤 답·PMF·NPS·오류', () => {
  const es = [mk({ id: 'a', own: 6, done: 1, d30: 3, fol: 1, good: 1, pmf: 'very', nps: 9 }), mk({ id: 'b', own: 2, d30: 1, pmf: 'not', nps: 5, err: 2 }), mk({ id: 'c', own: 9, done: 2, d30: 5, fol: 2, regret: 1, good: 1, pmf: 'some', nps: 8 }),
    mk({ id: 'd', own: 5, d30: 2 }), mk({ id: 'e', own: 0, d30: 1, pmf: 'quit', nps: 0 })].map(F.parseOne);
  const s = F.summarize(es);
  assert.equal(s.n, 5);
  assert.deepEqual([s.activated.count, s.activated.pct], [3, 60]);
  assert.deepEqual([s.value.count, s.value.pct], [2, 40]);
  assert.deepEqual([s.retained.count, s.retained.pct], [2, 40]);
  assert.deepEqual(s.follow, { answers: 3, good: 2, ok: 0, regret: 1, notbought: 0, due: 0 });
  assert.deepEqual([s.pmf.answered, s.pmf.very, s.pmf.pct], [4, 1, 25]);
  assert.deepEqual([s.nps.answered, s.nps.promoters, s.nps.detractors, s.nps.score], [4, 1, 2, -25]);
  assert.equal(s.errors, 1);
  const v = F.verdicts(s);
  assert.deepEqual(v, { activated: 'pass', value: 'pass', retained: 'pass', pmf: 'few' });          // PMF 는 답한 사람이 5명 미만이라 판단하지 않는다
  assert.deepEqual(F.verdicts(F.summarize(es.slice(0, 3))).activated, 'few');                         // 5명 미만이면 판단하지 않는다
  assert.deepEqual(F.summarize([]).activated, { count: 0, total: 0, pct: null });
});
