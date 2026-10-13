// 규칙(판정·코디·비교) 결과 스냅샷을 만든다. 스키마를 옮긴 뒤에도 규칙 계산이 그대로인지 test/golden.test.cjs가 이 파일과 견준다.
// 사용: node tools/golden.mjs            (test/golden/sample-results.json 과 sample-b-results.json 을 다시 쓴다. 규칙을 일부러 바꿀 때만 다시 만든다)
// 서버(server/src/test/java/otjang/domain/GoldenParity.java)도 같은 두 파일과 견준다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const J = require(path.join(root, 'src/judge.js')), R = require(path.join(root, 'src/recommend.js'));
const items = JSON.parse(fs.readFileSync(path.join(root, 'data/sample-wardrobe.json'), 'utf8')).items;
const tpl = JSON.parse(fs.readFileSync(path.join(root, 'data/template-ivy.json'), 'utf8')).items;
export const CANDS = [
  { id: 'g-shirt-white', cat: 'top', kind: 'shirt', family: 'white', light: 95, formality: 3 },
  { id: 'g-sweat-navy', cat: 'top', kind: 'sweat', family: 'navy', light: 18, formality: 1, pattern: 'graphic' },
  { id: 'g-knit-navy', cat: 'top', kind: 'knit', family: 'navy', light: 18 },
  { id: 'g-jacket-beige', cat: 'outer', kind: 'jacket', family: 'beige', light: 72 },
  { id: 'g-derby-black', cat: 'shoes', kind: 'derby', family: 'black', light: 10, formality: 3 },
  { id: 'g-slacks-gray', cat: 'bottom', kind: 'slacks', family: 'gray', light: 45, formality: 3 },
].map((o) => Object.assign({ status: 'candidate', formality: 2, pattern: 'solid', seasons: [] }, o));
// 예시 B(원피스·스커트 옷장)에 비춰 볼 후보: 원피스 2, 아우터, 스커트, 블라우스, 힐
export const CANDS_B = [
  { id: 'g-dress-black', cat: 'dress', kind: 'dress', family: 'black', light: 12, formality: 3 },
  { id: 'g-dress-navy', cat: 'dress', kind: 'dress', family: 'navy', light: 20, formality: 3 },
  { id: 'g-blazer-black', cat: 'outer', kind: 'blazer', family: 'black', light: 12, formality: 3 },
  { id: 'g-skirt-pink', cat: 'bottom', kind: 'skirt', family: 'pink', light: 80 },
  { id: 'g-blouse-yellow', cat: 'top', kind: 'blouse', family: 'yellow', light: 70, formality: 3 },
  { id: 'g-heels-black', cat: 'shoes', kind: 'heels', family: 'black', light: 12, formality: 3 },
].map((o) => Object.assign({ status: 'candidate', formality: 2, pattern: 'solid', seasons: [] }, o));
const ids = (c) => ({ top: c.top && (c.top.id || c.top), bottom: c.bottom && (c.bottom.id || c.bottom), outer: c.outer ? c.outer.id || c.outer : null, score: c.score, why: c.why, caution: c.caution || [] });
export function compute(items, tpl, cands) {
  const out = { judge: {}, recommend: {}, compare: {} };
  for (const c of cands || CANDS) for (const season of ['', '겨울']) {
    const r = J.judgeCandidate(items, c, { season });
    out.judge[c.id + (season ? '@' + season : '')] = { supported: r.supported, overlaps: r.overlaps.map((o) => [o.item.id, o.level, o.same, o.diff]), before: r.before, after: r.after,
      added: r.added.map((a) => [a.top.id, a.bottom ? a.bottom.id : null, a.score, a.why]), top3: r.top3.map(ids), blockers: r.blockers, needs: r.needs, note: r.note };
  }
  const owned = items.filter(J.isOwned);
  for (const season of ['', '봄', '여름', '가을', '겨울']) {
    const pool = owned.filter((i) => J.inSeason(i, season));
    const first = R.recommend(pool, 3), key = (c) => [c.top, c.bottom, c.outer || ''].join('|');
    out.recommend[season || 'all'] = { first, next: R.recommend(pool, 3, first.map(key)) };
    const cmp = J.compareWardrobes(items, tpl, { season });
    out.compare[season || 'all'] = { both: cmp.both.map((b) => [b.mine.id, b.theirs.id, b.how]), onlyTheirs: cmp.onlyTheirs.map((i) => i.id), onlyMine: cmp.onlyMine.map((i) => i.id) };
  }
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(root, 'test/golden/sample-results.json'); fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(compute(items, tpl), null, 1) + '\n'); console.log('wrote', out);
  const itemsB = JSON.parse(fs.readFileSync(path.join(root, 'data/sample-wardrobe-b.json'), 'utf8')).items;
  const outB = path.join(root, 'test/golden/sample-b-results.json');
  fs.writeFileSync(outB, JSON.stringify(compute(itemsB, tpl, CANDS_B), null, 1) + '\n'); console.log('wrote', outB);
}
