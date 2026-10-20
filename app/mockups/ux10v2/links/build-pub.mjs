// 링크 게시용 폴더를 만든다: 카탈로그를 사진이 있는 상품(검색 예시 결과 + 흰 배경 사진)으로 줄이고, 그 사진만 담는다.
import fs from 'node:fs';
import path from 'node:path';
const D = process.argv[2] || '.'; // 개발 폴더(d1~d10 html, shared/, p/, _query_ids.json)
const OUT = path.join(D, 'pub');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'p'), { recursive: true });
fs.cpSync(path.join(D, 'shared'), path.join(OUT, 'shared'), { recursive: true });
const q = JSON.parse(fs.readFileSync(path.join(D, '_query_ids.json'), 'utf8'));
const cut = fs.readFileSync(path.join(D, 'shared/cutouts.js'), 'utf8');
const keep = new Set([...q, ...[...cut.matchAll(/'(ms-\d+)'/g)].map((m) => m[1])].filter((id) => fs.existsSync(path.join(D, 'p', `${id}.jpg`))));
const corePath = path.join(OUT, 'shared/eoul-mock.js');
const lines = fs.readFileSync(corePath, 'utf8').split('\n');
const i = lines.findIndex((l) => l.startsWith('const PRODUCTS = ['));
const arr = JSON.parse(lines[i].slice('const PRODUCTS = '.length).replace(/;\s*$/, ''));
const kept = arr.filter((p) => keep.has(p.id));
lines[i] = `const PRODUCTS = ${JSON.stringify(kept)}; // 링크 게시용: 사진을 함께 올린 ${kept.length}개만 남김(전체 ${arr.length}개)`;
fs.writeFileSync(corePath, lines.join('\n'));
for (const p of kept) fs.copyFileSync(path.join(D, 'p', `${p.id}.jpg`), path.join(OUT, 'p', `${p.id}.jpg`));
for (const f of fs.readdirSync(D).filter((f) => /^d\d+-.*\.html$/.test(f))) fs.copyFileSync(path.join(D, f), path.join(OUT, f));
console.log('products', kept.length, 'of', arr.length, 'images', fs.readdirSync(path.join(OUT, 'p')).length);
