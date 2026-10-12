// 소스 조각을 합쳐 브라우저에서 바로 여는 파일 하나(dist/index.html)를 만든다. 외부 요청이 없는 파일이다.
// 3D 옷장(src/closet/, three.js)은 esbuild로 한 덩어리(IIFE, 전역 OtjangCloset)로 묶어 같은 파일에 넣는다. 자산(glb, webp)은 바이트로 들어간다.
// 사용: node build.mjs            환경 변수: WARDROBE(옷장 자료, 기본: data/wardrobe.json이 있으면 그것, 없으면 data/sample-wardrobe.json), OUT(결과 파일), NO3D=1(3D 없이)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));   // 한글·공백이 든 경로에서도 동작
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const wardrobe = process.env.WARDROBE || (fs.existsSync(path.join(dir, 'data/wardrobe.json')) ? 'data/wardrobe.json' : 'data/sample-wardrobe.json');   // 내 옷장(data/wardrobe.json, 저장소에 넣지 않음)이 있으면 그것, 없으면 예시 옷장
JSON.parse(read(wardrobe)); JSON.parse(read('data/template-ivy.json'));                            // JSON이 깨졌으면 여기서 멈춘다

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
const parts = { '/*@@RECOMMEND@@*/': read('src/recommend.js'), '/*@@JUDGE@@*/': read('src/judge.js'), '/*@@WARDROBE_LIB@@*/': read('src/wardrobe.js'), '/*@@CATALOG_LIB@@*/': read('src/catalog.js'), '/*@@COLORGUESS@@*/': read('src/colorguess.js'),
  '/*@@WARDROBE@@*/': read(wardrobe), '/*@@TEMPLATE@@*/': read('data/template-ivy.json') };
for (const [m, text] of Object.entries(parts)) {
  if (!src.includes(m)) throw new Error('marker missing ' + m);
  if (text.includes('</')) throw new Error('이 조각은 script 태그를 닫을 수 있습니다: ' + m);
  src = src.replace(m, () => text);
}
// 앱 쪽 코드에 외부 주소가 없는지 본다 (3D 번들은 라이브러리 안의 문자열이 있을 수 있어 따로 본다: 실행 중 요청이 0건인지 tools/check.mjs가 확인한다)
if (/https?:\/\/(?!")/.test(src.replace(/placeholder="https:\/\/"/g, '').replace(/http:\/\/ 또는 https:\/\//g, '').replace(/\/\^https\?:[^\n]*/g, ''))) throw new Error('외부 주소가 들어 있습니다');
if (!src.includes('/*@@CLOSET@@*/')) throw new Error('marker missing /*@@CLOSET@@*/');
src = src.replace('/*@@CLOSET@@*/', () => closet.replace(/<\/script/g, '<\\/script'));
const out = process.env.OUT || 'dist/index.html';
fs.mkdirSync(path.dirname(path.join(dir, out)), { recursive: true });
fs.writeFileSync(path.join(dir, out), src);
console.log(out, (src.length / 1048576).toFixed(2), 'MB' + (closet ? ' (3D 포함)' : ' (3D 없음)'));
if (process.env.ARTIFACT) {                                                                          // 게시용: 문서 뼈대(doctype, html, head, body)는 게시할 때 씌워지므로 뺀다
  const art = src.replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*$/i, '').replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '').replace(/<meta [^>]*>\s*/gi, '').replace(/<title>[^<]*<\/title>\s*/i, '').replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '');
  fs.writeFileSync(path.join(dir, process.env.ARTIFACT), art); console.log(process.env.ARTIFACT, (art.length / 1048576).toFixed(2), 'MB (게시용)');
}
