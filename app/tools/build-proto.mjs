// 콘셉트 시안(app/proto/<id>/)을 HTML 파일 하나로 묶는다. 실제 상품 목록과 비교 엔진을 그대로 쓰고,
// 화면은 시안마다 처음부터 따로 만든다. 기록은 그 브라우저에만 남는다.
// 사용: node app/tools/build-proto.mjs <id> [--images thumbs.json] [--fragment] [--out file]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const id = args[0];
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
if (!id || id.startsWith('--')) throw new Error('시안 id를 적어 주세요. 예: node app/tools/build-proto.mjs itjana');
// An id names app/proto/<id>; a path (used by tests) names any prototype folder.
const dir = id.includes('/') ? path.resolve(id) : path.join(root, 'proto', id);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));

// The engine's modules, in the app's build order, without the app's own screens.
const order = [
  'src/data/slots.js', 'src/data/looks.js', 'src/data/products.js', 'src/catalog-policy.js',
  'src/legacy-wardrobe.js', 'src/legacy-purchase-v4.js', 'src/purchase-journey.js', 'src/wear-log.js',
  'src/wardrobe.js', 'src/closet-view.js', 'src/query.js', 'src/engine.js', 'src/purchase-candidate.js',
  'src/wardrobe-plan.js', 'src/purchase-plan-context.js', 'src/icons.js',
];
const strip = (src) => src
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^export\s+(const|function|async function|let|class)\s/gm, '$1 ');
let js = [
  ...order.map((file) => `// ── ${file}\n${strip(fs.readFileSync(path.join(root, file), 'utf8'))}`),
  `// ── meta\nconst PROTO_META = ${JSON.stringify(meta)};`,
  `// ── proto/core.js\n${strip(fs.readFileSync(path.join(root, 'proto/core.js'), 'utf8'))}`,
  `// ── proto/${meta.id}/app.js\n${strip(fs.readFileSync(path.join(dir, 'app.js'), 'utf8'))}`,
].join('\n');

const imagesFile = option('--images');
if (imagesFile) {
  const map = JSON.parse(fs.readFileSync(imagesFile, 'utf8'));
  let replaced = 0;
  for (const [url, data] of Object.entries(map)) {
    if (js.includes(url)) { js = js.split(JSON.stringify(url)).join(JSON.stringify(data)); replaced += 1; }
  }
  console.log(`images inlined: ${replaced}`);
}

const css = `${fs.readFileSync(path.join(root, 'proto/base.css'), 'utf8')}\n/* ── ${meta.id} */\n${fs.readFileSync(path.join(dir, 'style.css'), 'utf8')}`;
const fonts = meta.fonts ? `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${meta.fonts}">\n` : '';
const title = `<title>${meta.name}</title>`;
const body = `<div id="app"></div>\n<script type="module">\n(() => {\n${js}\n})();\n</script>`;
const html = flag('--fragment')
  ? `${title}\n${fonts}<style>\n${css}</style>\n${body}\n`
  : `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="${meta.themeColor || '#FFFFFF'}">\n${title}\n${fonts}<style>\n${css}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
const out = option('--out') || path.join(root, 'dist', 'proto', meta.id, 'index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${path.relative(process.cwd(), out)} ${(html.length / 1024).toFixed(0)} KB`);
