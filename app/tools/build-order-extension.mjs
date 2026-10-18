import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(repo, 'app/dist/musinsa-orders-extension');
fs.mkdirSync(out, { recursive: true });
for (const name of ['manifest.json', 'popup.html', 'popup.css', 'popup.js'])
  fs.copyFileSync(path.join(repo, 'extensions/musinsa-orders', name), path.join(out, name));
fs.copyFileSync(path.join(repo, 'app/src/musinsa-order-reader.js'), path.join(out, 'musinsa-order-reader.js'));
// The extension needs only parsing and labels, not the wardrobe or its data.
const contract = fs.readFileSync(path.join(repo, 'app/src/order-import.js'), 'utf8')
  .replace(/^import .*\n/gm, '').split('export function importedOrderId')[0];
fs.writeFileSync(path.join(out, 'order-contract.js'), contract);
console.log(out);
