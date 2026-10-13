// 편집자가 고른 상품(curation.json)과 판매 페이지에서 읽은 값(snapshot.json)을 합쳐 src/data/products.js를 만든다.
// 사용: node app/tools/catalog/make-products.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const curation = JSON.parse(fs.readFileSync(path.join(dir, 'curation.json'), 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.join(dir, 'snapshot.json'), 'utf8'));

export function cleanName(name) {
  return name
    .replace(/\[(?:[^\]]*(?:적립금|PICK|pick|단독|콜라보|에디션|Edition|X|×|사계절|기모|추가|SET|담 OOTD|TYPE|컬러|SIZE|ver\.)[^\]]*)\]/g, ' ')
    .replace(/\(\s*\d+\s*(?:co|colors?|컬러|색상|종)\s*\)/gi, ' ')
    .replace(/[_\-–]\s*\d+\s*(?:color|colors|컬러|COLOR)\b/gi, ' ')
    .replace(/\b\d+\s*(?:color|colors|COLOR|Color)\b/g, ' ')
    .replace(/\b[A-Z]{1,6}\d[A-Z0-9]*(?:-[A-Z0-9]+)+\b/g, ' ')
    .replace(/\b\d{5}-\d{4}\b/g, ' ')
    .replace(/\(\s*[A-Z]{1,3}\d{3,}[A-Z0-9-]*\s*\)/g, ' ')
    // 품번: 영문 대문자와 숫자 2개 이상이 섞인 4자 이상 토큰 (예: _SPTJG23G31, COWCD001, A15974C)
    .replace(/(^|[\s_/])(?=[A-Z0-9]*\d[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{4,}(?=$|[\s_/)\]])/g, '$1 ')
    .replace(/(^|[\s/])\d{6,}(?=$|[\s)])/g, '$1 ')
    .replace(/\/\s*\)/g, ')')
    .replace(/\s\/\s*(?=$|\()/g, ' ')
    .replace(/^(?:\(?(?:남성|여성|우먼|W|M)\))\s*/, '')
    .replace(/\[[A-Z]+[_\s]?\d+\]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([\]\)])/g, '$1')
    .replace(/^[\s\-_/]+|[\s\-_/]+$/g, '')
    .trim();
}

const products = [];
const missing = [];
for (const [id, [slot, color, displayName]] of Object.entries(curation)) {
  const s = snapshot[id];
  if (!s?.name || !s.price) { missing.push(id); continue; }
  products.push({
    id: `ms-${id}`,
    slot,
    color,
    brand: s.brand,
    name: displayName || cleanName(s.name),
    price: Math.round(Number(s.price)),
    img: s.image,
    url: `https://www.musinsa.com/products/${id}`,
    rating: s.rating ? Number(s.rating) : null,
    reviews: s.reviews ? Number(s.reviews) : 0,
    store: '무신사',
    checkedAt: s.checkedAt,
  });
}

const dates = [...new Set(products.map((p) => p.checkedAt))].sort();
const last = dates[dates.length - 1] || '';
const [y, m, d] = last.split('-').map(Number);
const out = `// 자동 생성 파일: app/tools/catalog/make-products.mjs 로 다시 만든다. 직접 고치지 않는다.
// 상품명·브랜드·가격·평점·후기 수·이미지는 무신사 상품 페이지의 구조화 데이터(schema.org Product)에서 읽은 값이다.
// 가격은 확인 시점의 판매가이며 쿠폰·회원 할인·배송비는 반영하지 않는다.
export const CATALOG = ${JSON.stringify({ store: '무신사', checkedAt: last, checkedLabel: last ? `${y}년 ${m}월 ${d}일` : '', count: products.length })};

export const PRODUCTS = ${JSON.stringify(products, null, 1)};
`;
fs.writeFileSync(path.join(dir, '../../src/data/products.js'), out);
console.log(`products: ${products.length}, missing: ${missing.length ? missing.join(',') : 'none'}`);
