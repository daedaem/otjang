// app/ 의 모듈을 HTML 파일 하나로 묶는다. 빌드 도구는 외부 의존성 없음.
// 선택 기능인 사진 분석은 고정된 공개 런타임·모델을 다운로드한다.
// 사용: node app/tools/build.mjs                         →  app/dist/index.html
//       node app/tools/build.mjs --images thumbs.json   →  상품 이미지 주소를 thumbs.json의 data: URI로 바꿔 넣는다
//                                                          (외부 이미지를 막는 환경에서 미리보기할 때)
//       node app/tools/build.mjs --fragment             →  <html>·<head>·<body> 없이 본문만 (페이지 뼈대를 씌워 주는 호스팅용)
//       node app/tools/build.mjs --server https://…     →  그 주소의 어울 서버로 계정·동기화를 켠다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const order = [
  'src/data/slots.js',
  'src/data/looks.js',
  'src/data/products.js',
  'src/catalog-policy.js',
  'src/legacy-wardrobe.js',
  'src/legacy-purchase-v4.js',
  'src/purchase-journey.js',
  'src/wardrobe.js',
  'src/wardrobe-store.js',
  'src/wardrobe-erase.js',
  'src/garment-photo.js',
  'src/photo-recognition.js',
  'src/mask-cleanup.js',
  'src/background-removal.js',
  'src/photo-identity.js',
  'src/owned-catalog.js',
  'src/storage-health.js',
  'src/account.js',
  'src/legacy-photos.js',
  'src/query.js',
  'src/engine.js',
  'src/purchase-candidate.js',
  'src/wardrobe-plan.js',
  'src/offers.js',
  'src/offer-store.js',
  'src/icons.js',
  'src/zip-store.js',
  'src/main.js',
];
let js = order
  .map((file) => {
    const src = fs
      .readFileSync(path.join(root, file), 'utf8')
      .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
      .replace(/^export\s+(const|function|async function|let|class)\s/gm, '$1 ');
    return `// ── ${file}\n${src}`;
  })
  .join('\n');

const imagesFile = option('--images');
if (imagesFile) {
  const map = JSON.parse(fs.readFileSync(imagesFile, 'utf8'));
  let replaced = 0;
  for (const [url, data] of Object.entries(map)) {
    if (js.includes(url)) {
      js = js.split(JSON.stringify(url)).join(JSON.stringify(data));
      replaced += 1;
    }
  }
  console.log(`images inlined: ${replaced}`);
}

const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const script = `<script type="module">\n(() => {\n${js}\n})();\n</script>`;
let html;
if (flag('--fragment')) {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const title = source.match(/<title>[\s\S]*?<\/title>/)[0];
  const body = source.match(/<body>([\s\S]*?)<script/)[1].trim();
  html = `${title}\n<style>\n${css}</style>\n${body}\n${script}\n`;
} else {
  html = fs
    .readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>\n${css}</style>`)
    .replace('<script type="module" src="./src/main.js"></script>', () => script);
}

// --server https://… : 다른 곳(예: GitHub Pages)에 올린 앱이 이 주소의 어울 서버를 쓰게 한다.
// 서버가 직접 앱을 내보낼 때는 서버가 같은 주소 표시를 넣으므로 필요 없다.
const serverURL = option('--server');
if (serverURL) {
  const url = new URL(serverURL);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('--server는 https 주소여야 해요.');
  if (flag('--fragment')) html = `<meta name="eoul-api" content="${url.origin}">\n${html}`;
  else html = html.replace(/<head>/, () => `<head>\n  <meta name="eoul-api" content="${url.origin}">`);
}

const out = option('--out') || path.join(root, 'dist/index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${path.relative(process.cwd(), out)} ${(html.length / 1024).toFixed(0)} KB`);
