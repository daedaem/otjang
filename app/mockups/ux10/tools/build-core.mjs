// 목업 공통 코어를 브라우저용 스크립트 한 파일(shared/eoul-mock.js)로 묶는다.
// 실제 앱 엔진(app/src)의 필요한 모듈 + src/core.mjs. 앱 화면(main.js)과 저장소 코드는 넣지 않는다.
// 상품 사진 주소(img)는 빼서, 어떤 시안도 외부 사진을 불러올 수 없게 한다.
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
let imgCount = 0;
const body = modules.map((file) => {
  let src = strip(fs.readFileSync(path.join(app, file), 'utf8'));
  if (file === 'src/data/products.js') src = src.replace(/"img":"[^"]*",?/g, () => { imgCount++; return ''; });
  return `// ── ${file}\n${src}`;
}).join('\n');
if (!imgCount) throw new Error('상품 사진 주소를 찾지 못했어요. products.js 형식을 확인해 주세요.');
let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD', { cwd: app }).toString().trim(); } catch { /* 저장소 밖 */ }
const core = strip(fs.readFileSync(path.join(mock, 'src/core.mjs'), 'utf8'));
const out = `/* 자동 생성 파일: app/mockups/ux10/tools/build-core.mjs 로 다시 만든다. 직접 고치지 않는다.
   내용: 어울 앱 엔진(app/src, 커밋 ${commit}) ${modules.length}개 모듈 + 목업 코어(app/mockups/ux10/src/core.mjs).
   상품 사진 주소는 뺐다(${imgCount}개). 외부 요청을 하지 않는다. window.EoulMock 하나만 내보낸다. */
(function () {
'use strict';
${body}
// ── mockups/ux10/src/core.mjs
${core}
const bootParams = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
let bootStorage = null;
try { bootStorage = window.localStorage; bootStorage.getItem('eoul-mockup-ux10:probe'); } catch { bootStorage = null; }
const mock = createMock({ storage: bootStorage, reset: bootParams.get('reset') === '1' });
const bootGender = bootParams.get('g');
if (bootGender === 'M' || bootGender === 'F') mock.setGender(bootGender);
if (bootParams.get('closet') === 'trial') mock.loadTrialCloset(bootGender || undefined);
mock.boot = { q: bootParams.get('q') || '', reset: bootParams.get('reset') === '1', closet: bootParams.get('closet') || '', engineCommit: ${JSON.stringify(commit)} };
window.EoulMock = mock;
})();
`;
fs.writeFileSync(path.join(mock, 'shared/eoul-mock.js'), out);
console.log(`shared/eoul-mock.js ${(out.length / 1024).toFixed(0)} KB · modules ${modules.length} · images removed ${imgCount} · engine ${commit}`);
