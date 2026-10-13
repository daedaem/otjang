// app/ 의 모듈을 HTML 파일 하나로 묶는다. 외부 의존성 없음.
// 사용: node app/tools/build.mjs                         →  app/dist/index.html
//       node app/tools/build.mjs --images thumbs.json   →  상품 이미지 주소를 thumbs.json의 data: URI로 바꿔 넣는다
//                                                          (외부 이미지를 막는 환경에서 미리보기할 때)
//       node app/tools/build.mjs --fragment             →  <html>·<head>·<body> 없이 본문만 (페이지 뼈대를 씌워 주는 호스팅용)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const order = ['src/data/slots.js', 'src/data/looks.js', 'src/data/products.js', 'src/query.js', 'src/engine.js', 'src/store.js', 'src/icons.js', 'src/main.js'];
let js = order
  .map((file) => {
    const src = fs.readFileSync(path.join(root, file), 'utf8')
      .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
      .replace(/^export\s+(const|function|let|class)\s/gm, '$1 ');
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
  html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>\n${css}</style>`)
    .replace('<script type="module" src="./src/main.js"></script>', () => script);
}

const out = option('--out') || path.join(root, 'dist/index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${path.relative(process.cwd(), out)} ${(html.length / 1024).toFixed(0)} KB`);
