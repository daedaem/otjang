// 목업 공통 코어를 브라우저용 스크립트 한 파일(shared/eoul-mock.js)로 묶는다.
// 실제 앱 엔진(app/src)의 필요한 모듈 + src/core.mjs. 앱 화면(main.js)과 저장소 코드는 넣지 않는다.
// 상품 사진 주소(img)는 대표 예시 요청 상위 몇 개 상품만 남기고 뺀다. 남긴 사진도 주소에 ?photos=1을
// 붙인 비공개 시험 링크에서만 보인다(기본은 그림만, 외부 요청 없음). 사진의 공개 권리는 확인되지 않았다.
// 사용: node app/mockups/ux10/tools/build-core.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mock = path.resolve(here, '..');
const app = path.resolve(mock, '../..');
// 앱 빌드(app/tools/build.mjs)와 같은 순서. 묶을 모듈은 core.mjs의 import를 따라가며 고른다.
const ORDER = [
  'src/data/slots.js', 'src/data/looks.js', 'src/data/products.js', 'src/catalog-policy.js', 'src/legacy-wardrobe.js',
  'src/legacy-purchase-v4.js', 'src/purchase-journey.js', 'src/wear-log.js', 'src/wardrobe.js', 'src/outfit-copy.js',
  'src/search-follow-up.js', 'src/closet-view.js', 'src/query.js', 'src/engine.js', 'src/purchase-candidate.js',
  'src/related-returns.js', 'src/wardrobe-plan.js', 'src/purchase-plan-context.js', 'src/offers.js', 'src/offer-store.js',
  'src/icons.js',
];
const importsOf = (file) => [...fs.readFileSync(file, 'utf8').matchAll(/^import[\s\S]*?from\s+['"]([^'"]+)['"];?\s*$/gm)].map((m) => path.resolve(path.dirname(file), m[1]));
const need = new Set();
const walk = (file) => { for (const dep of importsOf(file)) if (!need.has(dep)) { need.add(dep); walk(dep); } };
walk(path.join(mock, 'src/core.mjs'));
const rel = [...need].map((file) => path.relative(app, file));
const missing = rel.filter((file) => !ORDER.includes(file));
if (missing.length) throw new Error(`묶음 순서에 없는 모듈: ${missing.join(', ')}`);
const modules = ORDER.filter((file) => rel.includes(file));
const strip = (src) => src
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^export\s+(const|function|async function|let|class)\s/gm, '$1 ');
const { createMock } = await import(path.join(mock, 'src/core.mjs'));
const picker = createMock();
const KEEP = new Set(['출근용 셔츠 10만원 이하', '겨울 데이트 코트', '검정 말고 주말에 입을 편한 바지', '원피스 10만원 이하']
  .flatMap((q) => picker.ask(q).products.slice(0, 3).map((p) => p.id)));
let imgCount = 0;
const body = modules.map((file) => {
  let src = strip(fs.readFileSync(path.join(app, file), 'utf8'));
  if (file === 'src/data/products.js') src = src.replace(/\{"id":"([^"]+)"[^{}]*\}/g, (obj, id) => KEEP.has(id) ? obj : obj.replace(/"img":"[^"]*",?/, () => { imgCount++; return ''; }));
  return `// ── ${file}\n${src}`;
}).join('\n');
if (!imgCount) throw new Error('상품 사진 주소를 찾지 못했어요. products.js 형식을 확인해 주세요.');
let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD', { cwd: app }).toString().trim(); } catch { /* 저장소 밖 */ }
const core = strip(fs.readFileSync(path.join(mock, 'src/core.mjs'), 'utf8'));
const out = `/* 자동 생성 파일: app/mockups/ux10/tools/build-core.mjs 로 다시 만든다. 직접 고치지 않는다.
   내용: 어울 앱 엔진(app/src, 커밋 ${commit}) ${modules.length}개 모듈 + 목업 코어(app/mockups/ux10/src/core.mjs).
   상품 사진 주소는 ${KEEP.size}개만 남기고 뺐다(${imgCount}개 제거). ?photos=1 비공개 링크에서만 그 사진을 불러오고, 기본은 외부 요청이 없다. window.EoulMock 하나만 내보낸다. */
(function () {
'use strict';
${body}
// ── mockups/ux10/src/core.mjs
${core}
const bootParams = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
let bootStorage = null;
try { bootStorage = window.localStorage; bootStorage.getItem('eoul-mockup-ux10:probe'); } catch { bootStorage = null; }
const bootPhotos = bootParams.get('photos') === '1';
const mock = createMock({ storage: bootStorage, reset: bootParams.get('reset') === '1', photos: bootPhotos });
// 사진을 켠 비공개 링크라는 표시를 각 시안의 목업 표시 옆에 붙인다.
if (bootPhotos && typeof document !== 'undefined') {
  const mark = () => document.querySelectorAll('[data-flow="mock-label"]').forEach((el) => {
    if (el.querySelector('[data-photo-note]')) return;
    const note = document.createElement('span');
    note.dataset.photoNote = '1';
    note.textContent = ' · ' + mock.photos.note;
    note.style.fontWeight = '700';
    el.appendChild(note);
  });
  document.addEventListener('DOMContentLoaded', mark);
  new MutationObserver(mark).observe(document.documentElement, { childList: true, subtree: true });
}
const bootGender = bootParams.get('g');
if (bootGender === 'M' || bootGender === 'F') mock.setGender(bootGender);
if (bootParams.get('closet') === 'trial') mock.loadTrialCloset(bootGender || undefined);
mock.boot = { q: bootParams.get('q') || '', photos: bootPhotos, reset: bootParams.get('reset') === '1', closet: bootParams.get('closet') || '', engineCommit: ${JSON.stringify(commit)} };
window.EoulMock = mock;
})();
`;
fs.writeFileSync(path.join(mock, 'shared/eoul-mock.js'), out);
console.log(`shared/eoul-mock.js ${(out.length / 1024).toFixed(0)} KB · modules ${modules.length} · photos kept ${KEEP.size} · images removed ${imgCount} · engine ${commit}`);
