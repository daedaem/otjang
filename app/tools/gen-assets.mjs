// assets/closet/ (Blender로 구운 옷장·옷 자산)을 모아 src/closet/assets.gen.js를 만든다. 자료는 빌드할 때 바이트로 들어간다.
// 사용: node tools/gen-assets.mjs    (환경 변수 CLOSET_DIR로 다른 자산 폴더를 줄 수 있다)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const d = path.resolve(process.env.CLOSET_DIR || path.join(root, 'assets/closet'));
const gd = process.env.GLB_DIR ? path.resolve(process.env.GLB_DIR) : d;                              // GLB_DIR=assets/closet-src 이면 압축하지 않은 형태 파일을 넣는다 (WebAssembly를 막는 환경용, 더 크다)
const out = path.join(root, 'src/closet/assets.gen.js');
if (!fs.existsSync(path.join(d, 'meta.json'))) {                                                     // 자산이 없으면 3D 없이 빌드할 수 있게 빈 모듈을 쓴다
  fs.writeFileSync(out, "export const closet = null;\nexport const garments = {};\nexport const weaves = {};\nexport const meta = { closet: { SLOTS: [] }, garments: {}, tiles: {}, light: {} };\n");
  console.log('closet assets not found at', d, '→ empty assets.gen.js'); process.exit(0);
}
const meta = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8'));
const L = [], v = (s) => s.replace(/[^a-zA-Z0-9]/g, '_');
const seen = new Map();                                                                             // 내용이 같은 그림은 한 번만 넣는다
const rel = (file, base) => path.relative(path.dirname(out), path.join(base || d, file)).split(path.sep).join('/');
const imp = (name, file) => {
  const base = file.endsWith('.glb') ? gd : d;
  if (!fs.existsSync(path.join(base, file))) throw new Error('missing ' + file);
  const h = crypto.createHash('md5').update(fs.readFileSync(path.join(base, file))).digest('hex');
  if (seen.has(h)) return seen.get(h);
  seen.set(h, name); L.push(`import ${name} from '${rel(file, base)}';`); return name;
};
const closet = `{ glb: ${imp('closetGlb', 'closet.glb')}, light: { closet: ${imp('lmCloset', 'light-closet.webp')}, floor: ${imp('lmFloor', 'light-floor.webp')}, wall: ${imp('lmWall', 'light-wall.webp')} }, tiles: { oak: ${imp('tOak', 'tile-oak.webp')}, floor: ${imp('tFloor', 'tile-floor.webp')}, wall: ${imp('tWall', 'tile-wall.webp')} } }`;
const gs = [];
for (const k of Object.keys(meta.garments)) {
  const g = meta.garments[k], tiles = Object.keys(g.tiles).map((p) => `'${p}': ${imp(v(k + '_' + p), p + '.webp')}`).join(', ');
  const normals = (g.normals || []).filter((p) => fs.existsSync(path.join(d, p + '-n.webp'))).map((p) => `'${p}': ${imp(v(k + '_' + p + '_n'), p + '-n.webp')}`).join(', ');
  gs.push(`${k}: { glb: ${imp(k + 'Glb', k + '.glb')}, light: { hi: ${imp(k + 'Lhi', k + '-light-hi.webp')}, lo: ${imp(k + 'Llo', k + '-light-lo.webp')} }, ` +
    `shadow: { back: { hi: ${imp(k + 'Sbh', k + '-shadow-back-hi.webp')}, lo: ${imp(k + 'Sbl', k + '-shadow-back-lo.webp')} }, floor: { hi: ${imp(k + 'Sfh', k + '-shadow-floor-hi.webp')}, lo: ${imp(k + 'Sfl', k + '-shadow-floor-lo.webp')} } }, tiles: { ${tiles} }, normals: { ${normals} } }`);
}
const ws = Object.entries(meta.weaves || {}).map(([w, spec]) => `${w}: { albedo: ${imp('wv_' + v(w), spec.albedo + '.webp')}, normal: ${JSON.stringify(spec.normal)}, repeat: ${JSON.stringify(spec.repeat)} }`);
L.push(`export const closet = ${closet};`, `export const garments = { ${gs.join(',\n  ')} };`, `export const weaves = { ${ws.join(',\n  ')} };`, `export const meta = ${JSON.stringify(meta)};`);
fs.writeFileSync(out, L.join('\n') + '\n'); console.log('assets.gen.js written from', d, '(' + seen.size + ' files)');
