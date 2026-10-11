import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFile(path.join(root, file), 'utf8');
// A deliberately small bundler for these dependency-free ES modules.
// Source modules remain directly importable by Node's test runner.
async function bundle(name, file) {
  let source = await read(file);
  const exports = [];
  source = source.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/gm, '');
  for (const match of (await read(file)).matchAll(
    /^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm,
  ))
    exports.push(match[1]);
  source = source.replace(/^export\s*\{([^}]+)\};?\s*$/gm, (_, names) => {
    for (const part of names.split(',')) {
      const [local, exposed] = part.trim().split(/\s+as\s+/);
      if (local) exports.push(exposed ? `${exposed}: ${local}` : local);
    }
    return '';
  });
  if (/^\s*(?:import|export)\s/m.test(source))
    throw new Error(`Unsupported module syntax in ${file}`);
  if (!exports.length) throw new Error(`No exports found in ${file}`);
  return `const ${name} = (() => {\n${source}\nreturn {${exports.join(',')}};\n})();`;
}
const modules = await Promise.all([
  bundle('Model', 'src/model.js'),
  bundle('Photo', 'src/photo.js'),
  bundle('Art', 'src/art.js'),
]);
const main = (await read('src/main.js')).replace(/^import .*?;\s*$/gm, '');
const js = `(async () => {\n'use strict';\n${modules.join('\n')}\n${main}\n})();`.replace(
  /<\/script/gi,
  '<\\/script',
);
const template = await read('index.html');
const css = await read('src/styles.css');
const built = template.replace('/*__STYLES__*/', () => css).replace('/*__SCRIPT__*/', () => js);
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist/index.html'), built);
await writeFile(path.join(root, 'WearNext.html'), built);
console.log(
  `Built WearNext.html — ${Math.round(Buffer.byteLength(built) / 1024)} KB, no runtime dependencies.`,
);
