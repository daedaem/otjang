// 소스 조각을 합쳐 브라우저에서 바로 여는 파일 하나(dist/index.html)를 만든다. 외부 요청이 없는 파일이다.
// 3D 옷장(src/closet/, three.js)은 esbuild로 한 덩어리(IIFE, 전역 OtjangCloset)로 묶어 같은 파일에 넣는다. 자산(glb, webp)은 바이트로 들어간다.
// 사용: node build.mjs            환경 변수: WARDROBE(옷장 자료, 기본: data/wardrobe.json이 있으면 그것, 없으면 data/sample-wardrobe.json), OUT(결과 파일), NO3D=1(3D 없이)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));   // 한글·공백이 든 경로에서도 동작
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const wardrobe = process.env.WARDROBE || (fs.existsSync(path.join(dir, 'data/wardrobe.json')) ? 'data/wardrobe.json' : 'data/sample-wardrobe.json');   // 내 옷장(data/wardrobe.json, 저장소에 넣지 않음)이 있으면 그것, 없으면 예시 옷장
JSON.parse(read(wardrobe)); JSON.parse(read('data/template-ivy.json'));
const brand = JSON.parse(read('brand.json'));
const split = process.env.SPLIT_DIR || '';                                                           // SPLIT_DIR=dist/web: 웹 배포용. 3D(closet.js)를 따로 두고 3D 탭을 열 때 받는다                            // JSON이 깨졌으면 여기서 멈춘다

let closet = '';
if (!process.env.NO3D) {
  const genPath = path.join(dir, 'src/closet/assets.gen.js');
  if (!fs.existsSync(genPath)) throw new Error('src/closet/assets.gen.js 가 없습니다. 먼저 node tools/gen-assets.mjs 를 실행하세요');
  const { build } = await import('esbuild');
  const noMeshopt = { name: 'no-meshopt', setup(b) { b.onResolve({ filter: /\/decoder\.js$/ }, (a) => ({ path: path.join(dir, 'src/closet/decoder-none.js') })); } };   // NO_MESHOPT=1: WebAssembly 해독기를 빼고 압축하지 않은 형태 파일을 쓴다
  const r = await build({ entryPoints: [path.join(dir, 'src/closet/index.js')], bundle: true, format: 'iife', globalName: 'OtjangCloset', minify: true, write: false, target: 'es2019', legalComments: 'none',
    loader: { '.webp': 'binary', '.glb': 'binary' }, absWorkingDir: dir, logLevel: 'warning', plugins: process.env.NO_MESHOPT ? [noMeshopt] : [] });
  closet = r.outputFiles[0].text;
}

let src = read('src/app.html');
const parts = { '/*@@RECOMMEND@@*/': read('src/recommend.js'), '/*@@JUDGE@@*/': read('src/judge.js'), '/*@@WARDROBE_LIB@@*/': read('src/wardrobe.js'), '/*@@CATALOG_LIB@@*/': read('src/catalog.js'), '/*@@PICK@@*/': read('src/pick.js'), '/*@@COLORGUESS@@*/': read('src/colorguess.js'), '/*@@SYNC@@*/': read('src/sync.js'), '/*@@FEEDBACK@@*/': read('src/feedback.js'),
  '/*@@WARDROBE@@*/': read(wardrobe), '/*@@TEMPLATE@@*/': read('data/template-ivy.json'), '/*@@SAMPLE@@*/': read('data/sample-wardrobe.json'), '/*@@SAMPLE_B@@*/': read('data/sample-wardrobe-b.json'), '/*@@BRAND@@*/': JSON.stringify(brand) };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
for (const [m, text] of Object.entries(parts)) {
  if (!src.includes(m)) throw new Error('marker missing ' + m);
  if (text.includes('</')) throw new Error('이 조각은 script 태그를 닫을 수 있습니다: ' + m);
  src = src.replace(m, () => text);
}
// 앱 쪽 코드에 외부 주소가 없는지 본다 (3D 번들은 라이브러리 안의 문자열이 있을 수 있어 따로 본다: 실행 중 요청이 0건인지 tools/check.mjs가 확인한다)
if (/https?:\/\/(?!")/.test(src.replace(/placeholder="https:\/\/"/g, '').replace(/http:\/\/ 또는 https:\/\//g, '').replace(/\/\^https\?:[^\n]*/g, ''))) throw new Error('외부 주소가 들어 있습니다');
// 검증 카탈로그(data/picks.json)는 판매처·근거 주소를 담고 있다. 화면에서 링크로만 쓰고 앱이 요청하지 않으므로 위 검사 뒤에 넣는다(요청 0건은 tools/check*.mjs 가 본다)
{
  const picks = read('data/picks.json');
  const { validate } = await import('./tools/validate-catalog.mjs');
  const v = validate(JSON.parse(picks), process.env.TODAY || new Date().toISOString().slice(0, 10));
  const expired = v.errors.filter((x) => /\[만료\]/.test(x)), hard = v.errors.filter((x) => !/\[만료\]/.test(x));
  if (hard.length || (expired.length && !process.env.ALLOW_STALE)) throw new Error('카탈로그 오류 ' + v.errors.length + '건: ' + v.errors.slice(0, 5).join(' / ') + ' (node tools/validate-catalog.mjs 로 전부 보기' + (expired.length ? '. 30일 지난 상품은 다시 확인하세요 — 개발 중에만 ALLOW_STALE=1' : '') + ')');
  if (expired.length) console.log('카탈로그 주의: 30일 지난 상품 ' + expired.length + '개(ALLOW_STALE=1 로 빌드함 — 배포하지 마세요)');
  if (v.warnings.some((w) => /다시 확인 필요|환율/.test(w))) console.log('카탈로그 주의: ' + v.warnings.filter((w) => /다시 확인 필요|환율/.test(w)).length + '건이 오래됐습니다(node tools/validate-catalog.mjs)');
  if (picks.includes('</')) throw new Error('picks.json 이 script 태그를 닫을 수 있습니다');
  if (!src.includes('/*@@PICKS@@*/')) throw new Error('marker missing /*@@PICKS@@*/');
  src = src.replace('/*@@PICKS@@*/', () => picks);
}
if (!src.includes('/*@@CLOSET@@*/')) throw new Error('marker missing /*@@CLOSET@@*/');
src = src.split('@@APP_NAME@@').join(esc(brand.name + (brand.status ? ' (' + brand.status + ')' : '')));
const out = split ? path.join(split, 'index.html') : process.env.OUT || 'dist/index.html';
if (split) {
  fs.mkdirSync(path.join(dir, split), { recursive: true });
  const crypto = await import('node:crypto');
  const ver = crypto.createHash('sha256').update(closet).digest('hex').slice(0, 10);
  if (closet) fs.writeFileSync(path.join(dir, split, 'closet.js'), closet);
  src = src.replace('/*@@CLOSET@@*/', () => (closet ? "window.__CLOSET_SRC = 'closet.js?v=" + ver + "';" : ''));
  // 보안 정책(CSP): 이 파일 안의 스크립트(해시로 지정)와 같은 주소의 closet.js 만 실행한다. 외부로 보내는 요청은 모두 막는다(개발용 "내 서버와 맞추기"는 DEV_SYNC=1 로 빌드할 때만 이 컴퓨터 주소를 허용한다).
  // 'wasm-unsafe-eval' 은 3D 형태 파일 해독기(WebAssembly) 때문이다. 메타 태그 CSP 라 frame-ancestors 는 쓸 수 없다.
  const hashes = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => "'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
  const csp = ["default-src 'self'", "script-src 'self' " + hashes.join(' ') + " 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "connect-src 'self' blob: data:" + (process.env.DEV_SYNC ? ' http://localhost:* http://127.0.0.1:*' : ''), "font-src 'self' data:", "manifest-src 'self'", "worker-src 'self' blob:", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');
  src = src.replace('<!--@@HEAD_EXTRA@@-->', () => '<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n<meta name="referrer" content="no-referrer">\n' + (brand.beta ? '<meta name="robots" content="noindex, nofollow">\n' : '') +
    '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n<meta name="theme-color" content="#F5F2EA">');
  // share_target: 설치한 앱(안드로이드 크롬)이 쇼핑 앱의 "공유" 목록에 나타나, 공유한 링크·글로 "고민 중인 옷 넣기"를 연다. 아이폰 Safari 는 지원하지 않는다
  fs.writeFileSync(path.join(dir, split, 'manifest.webmanifest'), JSON.stringify({ name: brand.name + ' (' + brand.status + ')', short_name: brand.name, start_url: './', scope: './', display: 'standalone', background_color: '#F5F2EA', theme_color: '#F5F2EA', lang: 'ko',
    share_target: { action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
    icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 1));
  for (const n of ['icon-192.png', 'icon-512.png']) if (fs.existsSync(path.join(dir, 'web', n))) fs.copyFileSync(path.join(dir, 'web', n), path.join(dir, split, n));
  // 서비스 워커: 캐시 이름에 이번 빌드의 해시를 넣어, 새로 배포하면 새 캐시로 바뀌고 옛 캐시는 지워진다
  const swVer = crypto.createHash('sha256').update(src).update(ver).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(dir, split, 'sw.js'), read('web/sw.js').replace('@@VER@@', swVer));
} else {
  src = src.replace('/*@@CLOSET@@*/', () => closet.replace(/<\/script/g, '<\\/script'));
  src = src.replace('<!--@@HEAD_EXTRA@@-->', '');
}
fs.mkdirSync(path.dirname(path.join(dir, out)), { recursive: true });
fs.writeFileSync(path.join(dir, out), src);
console.log(out, (Buffer.byteLength(src) / 1048576).toFixed(2), 'MB' + (split ? (closet ? ' + closet.js ' + (Buffer.byteLength(closet) / 1048576).toFixed(2) + 'MB (3D 탭을 열 때 받음)' : '') : closet ? ' (3D 포함)' : ' (3D 없음)'));
if (process.env.ARTIFACT) {                                                                          // 게시용: 문서 뼈대(doctype, html, head, body)는 게시할 때 씌워지므로 뺀다
  const art = src.replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*$/i, '').replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '').replace(/<meta [^>]*>\s*/gi, '').replace(/<title>[^<]*<\/title>\s*/i, '').replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '');
  fs.writeFileSync(path.join(dir, process.env.ARTIFACT), art); console.log(process.env.ARTIFACT, (art.length / 1048576).toFixed(2), 'MB (게시용)');
}
