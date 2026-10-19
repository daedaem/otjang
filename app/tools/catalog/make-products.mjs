// 상품 목록(src/data/products.js)을 만든다.
//  1) curation.json + snapshot.json: 편집자가 아이템별로 고른 상품과 상품 페이지에서 읽은 값
//  2) brands.json: 브랜드 목록 화면에서 읽어 classify.mjs로 분류한 상품(+ 사진에서 짐작한 색, 제외 목록)
// 사용: node app/tools/catalog/make-products.mjs
import fs from 'node:fs';
import { productEligible } from '../../src/catalog-policy.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f, fallback) =>
  fs.existsSync(path.join(dir, f)) ? JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) : fallback;

// 첫 버전의 아이템 자리(색이 붙은 이름)를 지금의 종류로 옮긴다
const LEGACY = {
  'm-oxford-white': 'm-oxford',
  'm-oxford-blue': 'm-oxford',
  'm-tee-white': 'm-tee',
  'm-knit-crew': 'm-knit',
  'm-knit-cable': 'm-cable',
  'm-barbour': 'm-wax',
  'm-denim': 'm-denim-raw',
  'm-slacks-grey': 'm-slacks',
  'm-slacks-wide': 'm-slacks',
  'm-fatigue': 'm-work-pants',
  'm-sneaker-leather': 'm-white-sneaker',
  'm-chuck': 'm-canvas',
  'm-nb': 'm-runner',
  'm-boots': 'm-chelsea',
  'f-shirt-white': 'f-shirt',
  'f-shirt-stripe': 'f-stripe',
  'f-maryjane': 'f-flat',
};
const JEANS = new Set(['m-denim-raw', 'm-denim', 'f-denim', 'm-trucker', 'f-jacket']);

export function cleanName(name) {
  return (
    name
      .replace(
        /\[(?:[^\]]*(?:적립금|PICK|pick|단독|콜라보|에디션|Edition|X|×|사계절|기모|추가|SET|담 OOTD|TYPE|컬러|SIZE|ver\.|NEW|신상|선택)[^\]]*)\]/g,
        ' ',
      )
      .replace(/\(\s*\d+\s*(?:co|colors?|컬러|색상|종)\s*\)/gi, ' ')
      .replace(/[_\-–]\s*\d+\s*(?:color|colors|컬러|COLOR)\b/gi, ' ')
      .replace(/\b\d+\s*(?:color|colors|COLOR|Color|컬러)\b/g, ' ')
      .replace(/\b[A-Z]{1,6}\d[A-Z0-9]*(?:-[A-Z0-9]+)+\b/g, ' ')
      .replace(/\b\d{5}-\d{4}\b/g, ' ')
      .replace(/\(\s*[A-Z]{1,3}\d{3,}[A-Z0-9-]*\s*\)/g, ' ')
      // 품번: 영문 대문자와 숫자 2개 이상이 섞인 4자 이상 토큰 (예: _SPTJG23G31, COWCD001, A15974C)
      .replace(/(^|[\s_/(])(?=[A-Z0-9]*\d[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{4,}(?=$|[\s_/)\]])/g, '$1 ')
      .replace(/(^|[\s/])\d{6,}(?=$|[\s)])/g, '$1 ')
      .replace(/\/\s*\)/g, ')')
      .replace(/\s\/\s*(?=$|\()/g, ' ')
      .replace(/^(?:\(?(?:남성|여성|우먼|W|M|공용|UNISEX)\))\s*/i, '')
      .replace(/^(?:남성|여성)\s+/, '')
      .replace(/\[[A-Z]+[_\s]?\d+\]/g, ' ')
      .replace(/_/g, ' ')
      .replace(/\(\s*\)|\[\s*\]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([\]\)])/g, '$1')
      .replace(/^[\s\-_/]+|[\s\-_/]+$/g, '')
      .trim()
  );
}

const quality = (p) => (p.rating ?? 4.4) * Math.log10((p.reviews || 0) + (p.likes || 0) / 8 + 10);
const PER_BRAND_SLOT = 3;
export function selectBrandProducts(list) {
  // 제외되는 인기 상품이 상위 세 자리 안에서 유효한 상품을 밀어내지 않게 한다.
  return list
    .filter(productEligible)
    .sort((a, b) => quality(b) - quality(a))
    .slice(0, PER_BRAND_SLOT);
}

export function buildProducts({
  curation = {},
  snapshot = {},
  brandProducts = [],
  imageColors = {},
  exclude = [],
  fixes = {},
}) {
  const excluded = new Set(exclude);
  const products = new Map();
  const missing = [];

  // 1) 편집자가 고른 상품에도 같은 분류 충돌 검증을 적용한다.
  for (const [id, [slot0, color0, displayName]] of Object.entries(curation)) {
    const s = snapshot[id];
    const fix = fixes[id] || {};
    if (fix.slot === null) continue;
    if (excluded.has(id) || !s?.name || !s.price) {
      missing.push(id);
      continue;
    }
    const slot = fix.slot || LEGACY[slot0] || slot0;
    const sourceColor = fix.color || color0;
    const color = JEANS.has(slot) && sourceColor === 'navy' ? 'indigo' : sourceColor;
    const product = {
      id: `ms-${id}`,
      slot,
      color,
      colorSource: fix.color ? 'correction' : 'curation',
      classification: 'curated',
      brand: s.brand,
      name: cleanName(fix.name || displayName || s.name),
      price: Math.round(Number(s.price)),
      img: s.image,
      url: `https://www.musinsa.com/products/${id}`,
      rating: s.rating ? Number(s.rating) : null,
      reviews: s.reviews ? Number(s.reviews) : 0,
      likes: 0,
      store: '무신사',
      checkedAt: s.checkedAt,
      picked: true,
    };
    // A shortened display title must not hide a conflict in the saved source title.
    if (productEligible(product) && productEligible({ ...product, name: cleanName(fix.name || s.name) }))
      products.set(id, product);
  }

  // 2) 브랜드·종류별로 충돌 없는 후보의 인기 순위를 계산한다.
  const groups = {};
  for (const p of brandProducts) {
    if (excluded.has(p.id) || products.has(p.id)) continue;
    const fix = fixes[p.id] || {};
    const slot = fix.slot || p.slot;
    if (!slot || fix.slot === null) continue;
    const color = fix.color || p.color || imageColors[p.id] || null;
    if (!color) continue;
    const key = `${p.brand}|${slot}`;
    (groups[key] ||= []).push({
      ...p,
      slot,
      color,
      colorSource: fix.color ? 'correction' : p.colorSource || (p.color ? 'name' : 'image'),
      classification: fix.slot ? 'correction' : p.classification || 'name-rules',
      name: cleanName(fix.name || p.name),
    });
  }
  for (const group of Object.values(groups)) {
    for (const p of selectBrandProducts(group)) {
      products.set(p.id, {
        id: `ms-${p.id}`,
        slot: p.slot,
        color: p.color,
        colorSource: p.colorSource,
        classification: p.classification,
        brand: p.brand,
        name: p.name,
        price: p.price,
        img: p.img,
        url: `https://www.musinsa.com/products/${p.id}`,
        rating: p.rating,
        reviews: p.reviews || 0,
        likes: p.likes || 0,
        ...(p.summer ? { summer: true } : {}),
        store: '무신사',
        checkedAt: p.checkedAt || '2026-10-14',
      });
    }
  }
  return {
    list: [...products.values()].filter(productEligible),
    missing,
    pickedCount: [...products.values()].filter((p) => p.picked).length,
  };
}

export function renderProductsModule(list) {
  const dates = [...new Set(list.map((p) => p.checkedAt))].sort();
  const last = dates[dates.length - 1] || '';
  const first = dates[0] || '';
  const label = (d) => {
    const [y, m, dd] = d.split('-').map(Number);
    return `${y}년 ${m}월 ${dd}일`;
  };
  return `// 자동 생성 파일: app/tools/catalog/make-products.mjs 로 다시 만든다. 직접 고치지 않는다.
// 상품명·브랜드·가격·평점·후기 수·이미지는 무신사 상품 페이지와 브랜드 목록 화면에서 읽은 값이다.
// 가격은 확인 시점의 판매가이며 쿠폰·회원 할인·배송비는 반영하지 않는다. 색 일부는 상품 사진에서 짐작한 값이다.
export const CATALOG = ${JSON.stringify({ store: '무신사', rights: 'unverified', rightsEvidence: null, checkedAt: last, checkedLabel: first === last ? label(last) : `${label(first)}~${label(last).replace(/^\d+년 /, '')}`, count: list.length })};

export const PRODUCTS = ${JSON.stringify(list.map(({ picked, ...p }) => p))};
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { list, missing, pickedCount } = buildProducts({
    curation: read('curation.json', {}),
    snapshot: read('snapshot.json', {}),
    brandProducts: read('brands.json', []),
    imageColors: read('image-colors.json', {}),
    exclude: read('exclude.json', []),
    fixes: read('fixes.json', {}),
  });
  fs.writeFileSync(path.join(dir, '../../src/data/products.js'), renderProductsModule(list));
  const bySlot = {};
  for (const p of list) bySlot[p.slot] = (bySlot[p.slot] || 0) + 1;
  console.log(
    `products: ${list.length} (편집 ${pickedCount}), missing: ${missing.length ? missing.join(',') : 'none'}`,
  );
  console.log(
    Object.entries(bySlot)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(' '),
  );
}
