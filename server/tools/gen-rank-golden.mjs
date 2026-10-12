// 상품 순위(catalog.rank)와 상품→후보(toCandidate)의 앱(JS) 결과를 스냅샷으로 남긴다. 서버(Java)의 CatalogRank 가 같은 결과를 내는지 GoldenParity 가 견준다.
// 사용: node server/tools/gen-rank-golden.mjs   (저장소 루트에서) → server/src/test/resources/golden/catalog-rank.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const C = require(path.join(root, 'app/src/catalog.js')), J = require(path.join(root, 'app/src/judge.js')), W = require(path.join(root, 'app/src/wardrobe.js'));
const items = W.migrate(JSON.parse(fs.readFileSync(path.join(root, 'app/data/sample-wardrobe.json'), 'utf8'))).items;
const tpl = W.cleanWardrobe(JSON.parse(fs.readFileSync(path.join(root, 'app/data/template-ivy.json'), 'utf8'))).items;
const TODAY = '2026-10-12';
const IMG = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
export const PRODUCTS = [
  { id: 'p-knit-navy', brand: '예시 브랜드 C', name: '네이비 크루넥 니트', cat: 'top', kind: 'knit', family: 'navy', light: 18, formality: 2, pattern: 'solid', seasons: ['가을', '겨울'], price: 129000, checkedAt: '2026-09-01', link: 'https://shop.example/knit', img: IMG, note: '빈틈을 채우는 상품. 가격은 오래됨' },
  { id: 'p-sweat-navy', brand: '', name: '네이비 그래픽 스웻', cat: 'top', kind: 'sweat', family: 'navy', light: 18, formality: 1, pattern: 'graphic', seasons: [], price: 59000, checkedAt: TODAY },
  { id: 'p-shirt-white', brand: '예시 브랜드 D', name: '흰 옥스퍼드 셔츠', code: 'OX-1', cat: 'top', kind: 'shirt', family: 'white', light: 95, formality: 3, pattern: 'solid', seasons: [], price: 89000, checkedAt: '2026-10-05' },
  { id: 'p-knit-burgundy', brand: '', name: '버건디 크루넥 니트', cat: 'top', kind: 'knit', family: 'burgundy', light: 30, formality: 2, pattern: 'solid', seasons: [] },
  { id: 'p-slacks-gray', brand: '', name: '그레이 슬랙스', cat: 'bottom', kind: 'slacks', family: 'gray', light: 45, formality: 3, pattern: 'solid', seasons: [], price: 99000 },
  { id: 'p-harrington', brand: '', name: '베이지 해링턴 재킷', cat: 'outer', kind: 'jacket', family: 'beige', light: 76, formality: 2, pattern: 'solid', seasons: ['봄', '가을'] },
  { id: 'p-sneaker', brand: '', name: '흰 캔버스 스니커즈', cat: 'shoes', kind: 'sneaker', family: 'white', light: 92, formality: 1, pattern: 'solid', seasons: ['여름'] },
].map((p, i) => C.cleanProduct(p, i));
const gaps = J.compareWardrobes(items, tpl).onlyTheirs;
const pick = (r) => ({ id: r.product.id, score: r.score, reasons: r.reasons, cautions: r.cautions, added: r.added, overlaps: r.overlaps, blockers: r.blockers, gap: r.gap ? r.gap.id : null, stale: r.stale, supported: r.supported,
  top3: r.top3.map((c) => ({ top: c.top.id, bottom: c.bottom.id, outer: c.outer ? c.outer.id : null, score: c.score })) });
const out = {
  today: TODAY,
  products: PRODUCTS,
  rank: { all: C.rank(items, PRODUCTS, { gaps, today: TODAY }).map(pick), '겨울': C.rank(items, PRODUCTS, { gaps, today: TODAY, season: '겨울' }).map(pick), noGaps: C.rank(items, PRODUCTS, { today: TODAY }).map(pick), stale30: C.rank(items, PRODUCTS, { gaps, today: TODAY, staleDays: 30 }).map(pick) },
  toCandidate: PRODUCTS.map((p) => C.toCandidate(p, TODAY)),
  stale: PRODUCTS.map((p) => [p.id, C.isStale(p, TODAY), C.daysSince(p.checkedAt, TODAY)]),
};
const file = path.join(root, 'server/src/test/resources/golden/catalog-rank.json'); fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n'); console.log('wrote', file, out.rank.all.map((r) => r.id + ':' + r.score).join(' '));
