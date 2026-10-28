// 운영 코어를 브라우저용 스크립트 한 파일(core-bundle.js)로 묶는다.
// 실제 앱 엔진(app/lite/src/domain)의 필요한 모듈 + src/core.mjs. 앱 화면(main.js)과 저장소 코드는 넣지 않는다.
// 상품 사진은 파일로 넣지 않는다. 상품 자료의 사진 주소(무신사 이미지 서버)를 그대로 두고 브라우저가 불러온다.
// 사진의 사용 권리는 확인되지 않았다(CATALOG.rights). ?photos=0을 붙이면 사진 없이 색 카드로 본다.
// 사용: node app/lite/tools/build-core.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lite = path.resolve(here, '..');
export const CORE_BUNDLE = path.join(lite, '.generated/core-bundle.js');
export function buildCore(outFile = CORE_BUNDLE) {
// 앱 빌드(app/tools/build.mjs)와 같은 순서. 묶을 모듈은 core.mjs의 import를 따라가며 고른다.
const ORDER = [
  'src/domain/data/slots.js', 'src/domain/data/looks.js', 'src/domain/data/products.js', 'src/domain/catalog-policy.js', 'src/domain/legacy-wardrobe.js',
  'src/domain/legacy-purchase-v4.js', 'src/domain/purchase-journey.js', 'src/domain/wear-log.js', 'src/domain/wardrobe.js', 'src/domain/outfit-copy.js',
  'src/domain/search-follow-up.js', 'src/domain/query.js', 'src/domain/engine.js', 'src/domain/purchase-candidate.js',
  'src/domain/related-returns.js', 'src/domain/wardrobe-plan.js', 'src/domain/purchase-plan-context.js', 'src/domain/offers.js', 'src/domain/offer-store.js',
 'src/domain/photo-pending.js', 'src/domain/garment-profile.js', 'src/domain/rail-layout.js', 'src/domain/json-members.js', 'src/domain/profile-edit.js', 'src/domain/measure-compare.js', 'src/domain/size-chart.js', 'src/domain/measurement-draft.js', 'src/domain/collection-settings.js', 'src/domain/collection-value.js', 'src/domain/outfit-facts.js', 'src/domain/outfit-review.js', 'src/domain/mirror-draft.js', 'src/domain/collage.js', 'src/domain/lite-input-draft.js', 'src/domain/lite-registration.js', 'src/domain/legacy-registration.js',
];
const importsOf = (file) => [...fs.readFileSync(file, 'utf8').matchAll(/^import[\s\S]*?from\s+['"]([^'"]+)['"];?\s*$/gm)].map((m) => path.resolve(path.dirname(file), m[1]));
const need = new Set();
const walk = (file) => { for (const dep of importsOf(file)) if (!need.has(dep)) { need.add(dep); walk(dep); } };
walk(path.join(lite, 'src/core.mjs'));
const rel = [...need].map((file) => path.relative(lite, file));
const missing = rel.filter((file) => !ORDER.includes(file));
if (missing.length) throw new Error(`묶음 순서에 없는 모듈: ${missing.join(', ')}`);
const modules = ORDER.filter((file) => rel.includes(file));
const strip = (src) => src
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^export\s+(const|function|async function|let|class)\s/gm, '$1 ');
const body = modules.map((file) => `// ── ${file}\n${strip(fs.readFileSync(path.join(lite, file), 'utf8'))}`).join('\n');
let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD', { cwd: lite }).toString().trim(); } catch { /* 저장소 밖 */ }
const core = strip(fs.readFileSync(path.join(lite, 'src/core.mjs'), 'utf8'));
const photoCount = (fs.readFileSync(path.join(lite, 'src/domain/data/products.js'), 'utf8').match(/"img":"https:\/\/image\.msscdn\.net\//g) || []).length;
const out = `/* 자동 생성 파일: app/lite/tools/build-core.mjs 로 다시 만든다. 직접 고치지 않는다.
   내용: 어울 앱 엔진(app/lite/src/domain, 커밋 ${commit}) ${modules.length}개 모듈 + 운영 코어(app/lite/src/core.mjs).
   상품 사진 ${photoCount}개는 파일이 아니라 무신사 이미지 서버 주소다(사용 권리 미확인). ?photos=0이면 사진 없이 본다.
   window.EoulMock 하나만 내보낸다. */
(function () {
'use strict';
${body}
// ── lite/src/core.mjs
${core}
const bootParams = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
// Preview is isolated before even probing the private browser storage.
const bootPreview = bootParams.get('preview') === '1';
let bootStorage = null;
if (!bootPreview) { try { bootStorage = window.localStorage; bootStorage.getItem('eoul-mockup-ux10v2:probe'); } catch { bootStorage = null; } }
// 초대 회원(지인 테스트, 대표 10-28 15:12)에게는 무신사 상품 사진 대신 색 칸을 보여 준다. Worker가 <meta name="hangit-role" content="member">를 붙이고
// 바깥 사진 주소도 CSP(img-src)로 막는다.
const bootRole = (typeof document !== 'undefined' && document.querySelector('meta[name="hangit-role"]')?.content) || '';
const bootPhotos = bootParams.get('photos') !== '0' && bootRole !== 'member';
// ?preview=1: 갤러리 미리보기. 저장하지 않고 메모리에서만 동작해 다른 창의 기록과 섞이지 않는다.
const previewValues = new Map();
window.EOUL_UI_STORAGE = bootPreview ? {
  get length() { return previewValues.size; },
  key: (index) => [...previewValues.keys()][index] ?? null,
  getItem: (key) => previewValues.get(String(key)) ?? null,
  setItem: (key, value) => { previewValues.set(String(key), String(value)); },
  removeItem: (key) => { previewValues.delete(String(key)); },
} : {
  get length() { return window.localStorage.length; },
  key: (index) => window.localStorage.key(index),
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
// 한 주소에서 여러 시안을 열 때 기록이 섞이지 않게, 페이지가 코어보다 먼저 window.EOUL_MOCK_KEY를 적으면 그 이름으로 저장한다.
const bootKey = typeof window !== 'undefined' && typeof window.EOUL_MOCK_KEY === 'string' && window.EOUL_MOCK_KEY ? window.EOUL_MOCK_KEY : undefined;
const mock = createMock({ storage: bootPreview ? null : bootStorage, requireStorage: !bootPreview, key: bootKey, photos: bootPhotos });
let bootStorageError = null;
const bootChange = (fn) => { try { fn(); } catch (error) {
  if (!['storage_write_failed', 'storage_unreadable', 'photo_recovery_pending'].includes(error.code)) throw error;
  bootStorageError = error.message;
  if (error.code === 'photo_recovery_pending') {
    // A blocked reset/demo request must not replay after recovery reloads the URL.
    for (const name of ['g', 'reset', 'closet']) bootParams.delete(name);
    try { if (typeof location !== 'undefined' && typeof history !== 'undefined') { const url = new URL(location.href); for (const name of ['g', 'reset', 'closet']) url.searchParams.delete(name); history.replaceState(history.state, '', url.pathname + url.search + url.hash); } } catch {}
  }
} };
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
mock.boot = { q: bootParams.get('q') || '', role: bootRole, photos: bootPhotos, preview: bootPreview, reset: bootParams.get('reset') === '1', closet: bootParams.get('closet') || '', engineCommit: ${JSON.stringify(commit)} };
window.EoulMock = mock;
// 저장소를 쓸 수 없거나 저장된 원문을 읽지 못한 상태도 첫 화면에서 알린다(빈 옷장을 새 사용자로 오해하지 않게).
mock.boot.storageError = bootStorageError || mock.storageIssue()?.message || null;
})();
`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out);
return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = buildCore();
  console.log(`core-bundle.js ${(out.length / 1024).toFixed(0)} KB`);
}
