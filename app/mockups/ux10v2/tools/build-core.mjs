// 목업 공통 코어 2판을 브라우저용 스크립트 한 파일(shared/eoul-mock.js)로 묶는다.
// 실제 앱 엔진(app/src)의 필요한 모듈 + src/core.mjs. 앱 화면(main.js)과 저장소 코드는 넣지 않는다.
// 상품 사진은 파일로 넣지 않는다. 상품 자료의 사진 주소(무신사 이미지 서버)를 그대로 두고 브라우저가 불러온다.
// 사진의 사용 권리는 확인되지 않았다(CATALOG.rights). ?photos=0을 붙이면 사진 없이 색 카드로 본다.
// 사용: node app/mockups/ux10v2/tools/build-core.mjs
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
  'src/icons.js', 'src/lite-registration.js',
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
const body = modules.map((file) => `// ── ${file}\n${strip(fs.readFileSync(path.join(app, file), 'utf8'))}`).join('\n');
let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD', { cwd: app }).toString().trim(); } catch { /* 저장소 밖 */ }
const core = strip(fs.readFileSync(path.join(mock, 'src/core.mjs'), 'utf8'));
const photoCount = (fs.readFileSync(path.join(app, 'src/data/products.js'), 'utf8').match(/"img":"https:\/\/image\.msscdn\.net\//g) || []).length;
const out = `/* 자동 생성 파일: app/mockups/ux10v2/tools/build-core.mjs 로 다시 만든다. 직접 고치지 않는다.
   내용: 어울 앱 엔진(app/src, 커밋 ${commit}) ${modules.length}개 모듈 + 목업 코어 2판(app/mockups/ux10v2/src/core.mjs).
   상품 사진 ${photoCount}개는 파일이 아니라 무신사 이미지 서버 주소다(사용 권리 미확인). ?photos=0이면 사진 없이 본다.
   window.EoulMock 하나만 내보낸다. */
(function () {
'use strict';
${body}
// ── mockups/ux10v2/src/core.mjs
${core}
const bootParams = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
let bootStorage = null;
try { bootStorage = window.localStorage; bootStorage.getItem('eoul-mockup-ux10v2:probe'); } catch { bootStorage = null; }
const bootPhotos = bootParams.get('photos') !== '0';
// ?preview=1: 갤러리 미리보기. 저장하지 않고 메모리에서만 동작해 다른 창의 기록과 섞이지 않는다.
const bootPreview = bootParams.get('preview') === '1';
// 한 주소에서 여러 시안을 열 때 기록이 섞이지 않게, 페이지가 코어보다 먼저 window.EOUL_MOCK_KEY를 적으면 그 이름으로 저장한다.
const bootKey = typeof window !== 'undefined' && typeof window.EOUL_MOCK_KEY === 'string' && window.EOUL_MOCK_KEY ? window.EOUL_MOCK_KEY : undefined;
const mock = createMock({ storage: bootPreview ? null : bootStorage, requireStorage: !bootPreview, key: bootKey, photos: bootPhotos });
let bootStorageError = null;
const bootChange = (fn) => { try { fn(); } catch (error) { if (!['storage_write_failed', 'storage_unreadable'].includes(error.code)) throw error; bootStorageError = error.message; } };
if (bootParams.get('reset') === '1' || bootPreview) bootChange(() => mock.reset());
// 검색 엔진에 실리지 않게 한다(접근 통제는 아니다. 링크를 아는 사람은 열 수 있다).
if (typeof document !== 'undefined' && document.head && !document.querySelector('meta[name="robots"]')) {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow, noimageindex';
  document.head.appendChild(meta);
}
const bootGender = bootParams.get('g');
if (bootGender === 'M' || bootGender === 'F') bootChange(() => mock.setGender(bootGender));
if (bootParams.get('closet') === 'trial') bootChange(() => mock.loadTrialCloset(bootGender || undefined));
mock.boot = { q: bootParams.get('q') || '', photos: bootPhotos, preview: bootPreview, reset: bootParams.get('reset') === '1', closet: bootParams.get('closet') || '', engineCommit: ${JSON.stringify(commit)} };
window.EoulMock = mock;
// 저장소를 쓸 수 없거나 저장된 원문을 읽지 못한 상태도 첫 화면에서 알린다(빈 옷장을 새 사용자로 오해하지 않게).
mock.boot.storageError = bootStorageError || mock.storageIssue()?.message || null;
})();
`;
fs.writeFileSync(path.join(mock, 'shared/eoul-mock.js'), out);
console.log(`shared/eoul-mock.js ${(out.length / 1024).toFixed(0)} KB · modules ${modules.length} · photo urls ${photoCount} · engine ${commit}`);
