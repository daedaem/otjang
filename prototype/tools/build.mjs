import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  absWorkingDir: root, entryPoints: ['src/main.js'],
  bundle: true, write: false, format: 'iife', target: 'es2022',
  minify: true, legalComments: 'inline',
  loader: { '.glb': 'dataurl', '.webp': 'dataurl' },
});
const threeLicense = await readFile(path.join(root, 'node_modules/three/LICENSE'), 'utf8');
const js = (`/*! Three.js 0.160.1\n${threeLicense} */\n` + result.outputFiles[0].text)
  .replace(/<\/script/gi, '<\\/script')
  // Bundled Three shader strings contain mixed leading tabs/spaces. Normalize
  // indentation only; keep shader source and its line breaks intact.
  .replace(/^[ ]+\t+/gm, indent => indent.replace(/ /g, ''));
const template = await readFile(path.join(root, 'index.html'), 'utf8');
const css = await readFile(path.join(root, 'src/styles.css'), 'utf8');
const built = template.replace('/*__STYLES__*/', () => css).replace('/*__SCRIPT__*/', () => js).replace(/[ \t]+$/gm, '');
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist/index.html'), built);
await writeFile(path.join(root, 'WearNext.html'), built);
console.log(`Built WearNext.html — ${(Buffer.byteLength(built) / 1048576).toFixed(2)} MB, Blender scene and runtime embedded.`);
