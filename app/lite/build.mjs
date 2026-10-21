// 설치형 앱 묶기: 시안 화면(SCREEN, 지금은 d12 "걸어 보고 사기")을 그대로 쓰고, 홈 화면 설치·오프라인·AI 순위 서버 함수 연결만 더해 dist/에 만든다.
// Cloudflare Pages 설정: 루트 디렉터리 app/lite, 빌드 명령 `npm run build`, 출력 디렉터리 dist (functions/는 Pages가 알아서 올린다).
// 상품 사진은 판매처 이미지 서버 주소를 그대로 쓴다(저장소·배포본에 사진 파일 없음). 글꼴은 npm 패키지(OFL·MIT)에서 복사한다.
import { assertBuildAllowed } from './deployment-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

assertBuildAllowed();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UX = path.join(HERE, '../mockups/ux10v2');
const OUT = path.join(HERE, 'dist');
const NM = path.join(HERE, 'node_modules');
export const APP_NAME = '옷 고르기';
export const APP_FULL_NAME = '옷 고르기 (이름 미정 · 시험판)';

const read = (p) => fs.readFileSync(p, 'utf8');
const put = (rel, data) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
};
const copy = (from, rel) => put(rel, fs.readFileSync(from));

fs.rmSync(OUT, { recursive: true, force: true });

// 1) 공통 코어·화면 보조 파일(시안과 같은 파일)
copy(path.join(UX, 'shared/eoul-mock.js'), 'shared/eoul-mock.js');
copy(path.join(UX, 'design/cutouts.js'), 'shared/cutouts.js');
for (const f of ['kit.js', 'photo-kinds.js', 'ai-rank.js']) copy(path.join(UX, 'links/shared', f), `shared/${f}`);
copy(path.join(HERE, 'src/lite.js'), 'shared/lite.js');
copy(path.join(HERE, 'src/open-products.mjs'), 'shared/open-products.mjs');
for (const f of ['clothing.json', 'README.md']) copy(path.join(HERE, 'data/open-products', f), `data/open-products/${f}`);

// 2) 글꼴: Pretendard Variable(SIL OFL 1.1), Phosphor 아이콘(MIT)
copy(path.join(NM, 'pretendard/dist/web/variable/woff2/PretendardVariable.woff2'), 'shared/fonts/PretendardVariable.woff2');
put('shared/fonts/pretendard.css', "/* Pretendard Variable (SIL OFL 1.1, github.com/orioncactus/pretendard) */\n@font-face { font-family: 'Pretendard Variable'; font-weight: 45 920; font-style: normal; font-display: swap; src: url('./PretendardVariable.woff2') format('woff2-variations'), url('./PretendardVariable.woff2') format('woff2'); }\n");
for (const [dir, name, css] of [['regular', 'Phosphor', 'regular.css'], ['fill', 'Phosphor-Fill', 'fill.css']]) {
  const src = path.join(NM, '@phosphor-icons/web/src', dir);
  copy(path.join(src, `${name}.woff2`), `shared/icons/${name}.woff2`);
  const style = read(path.join(src, 'style.css')).replace(/src:[^;]+;/, `src: url("./${name}.woff2") format("woff2");`);
  put(`shared/icons/${css}`, `/* Phosphor Icons (MIT, github.com/phosphor-icons/web) */\n${style}`);
}

// 3) 아이콘(기존 앱과 같은 옷걸이 그림)
const ICONS = ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'icon.svg'];
for (const f of ICONS) copy(path.join(HERE, '../public/icons', f), `icons/${f}`);

// 4) 화면: 시안 본문 조각을 완전한 문서로 감싼다. 링크 페이지 전용 줄(사진 폴더, claude 메타, 제목)은 뺀다.
//    저장 키(EOUL_MOCK_KEY)는 남겨서 링크 시안과 같은 이름으로 이 기기에 저장한다.
export const SCREEN = 'd12-hang.html';
const body = read(path.join(UX, 'links', SCREEN))
  .replace(/<title>[^<]*<\/title>\n?/, '')
  .replace(/<meta name="claude:[^>]*>\n?/, '')
  .replace(/window\.EOUL_PHOTO_BASE\s*=\s*'[^']*';\s*/, '')
  .replace(/<script>\s*<\/script>\n?/, '')
  // 예전 설치 앱(d7, 기본 저장 키)에 옷장이 있으면 새 화면의 저장 키로 한 번 옮긴다(덮어쓰지 않음).
  .replace(/<script>window\.EOUL_MOCK_KEY='([^']+)';<\/script>/, (m, key) => `<script>window.EOUL_MOCK_KEY='${key}';try{var o=localStorage.getItem('eoul-mockup-ux10v2:v1');if(o&&!localStorage.getItem('${key}'))localStorage.setItem('${key}',o)}catch(e){}</script>`)
  .replace('<script src="shared/ai-rank.js"></script>', '<script type="module" src="shared/open-products.mjs"></script>\n<script src="shared/lite.js"></script>\n<script src="shared/ai-rank.js"></script>');
if (/EOUL_PHOTO_BASE\s*=(?!=)/.test(body) || !body.includes('shared/lite.js')) throw new Error(`${SCREEN} 화면 구조가 바뀌었어요. build.mjs의 바꾸기 규칙을 확인해 주세요.`);
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${APP_NAME}</title>
<meta name="robots" content="noindex, nofollow, noimageindex">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#17171c" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${APP_NAME}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<style>:root{color-scheme:light dark;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}
</body>
</html>
`;
put('index.html', html);

// 5) 설치 정보, Pages 헤더
put('manifest.webmanifest', JSON.stringify({
  id: '/',
  name: APP_FULL_NAME,
  short_name: APP_NAME,
  description: '대충 말해도 실제 옷을 골라 주고, 내 옷장과 비교해 사기 전에 판단을 돕는 시험판이에요.',
  lang: 'ko',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
}, null, 2));
put('_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow, noimageindex
  Permissions-Policy: camera=(), microphone=(), geolocation=(self)
/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
`);

// 6) 서비스 워커: 저장할 앱 파일 목록과, 내용으로 만든 버전
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(path.relative(OUT, p).split(path.sep).join('/'));
  }
};
walk(OUT);
const shell = ['/', ...files.filter((f) => f !== '_headers' && f !== 'index.html').map((f) => `/${f}`)].sort();
const hash = crypto.createHash('sha256');
for (const f of files.sort()) hash.update(f).update(fs.readFileSync(path.join(OUT, f)));
const version = hash.digest('hex').slice(0, 12);
const sw = read(path.join(HERE, 'src/sw.js')).replace("'lite-__VERSION__'", `'lite-${version}'`).replace('= __SHELL__;', `= ${JSON.stringify(shell)};`);
if (/__VERSION__'|= __SHELL__;/.test(sw)) throw new Error('sw.js 자리표시를 채우지 못했어요.');
put('sw.js', sw);

console.log(`dist/ 완성: 파일 ${files.length + 1}개, 버전 ${version}`);
