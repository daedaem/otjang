import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, CATALOG } from '../src/data/products.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-public-build-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const build = (out, flag) => spawnSync(process.execPath, ['tools/build.mjs', '--out', out], {
  cwd: root, env: { ...process.env, EOUL_PUBLIC_BUILD: flag }, encoding: 'utf8',
});
test('personal test build preserves collected products and image addresses', () => {
  const out = path.join(temp, 'personal.html');
  const result = build(out, '0');
  assert.equal(result.status, 0, result.stderr);
  const html = fs.readFileSync(out, 'utf8');
  assert.ok(html.includes(JSON.stringify(PRODUCTS[0].img)));
  assert.ok(html.includes(JSON.stringify(PRODUCTS[0].name)));
  assert.equal(CATALOG.rights, 'unverified');
});
test('public build rejects unverified text and images before changing an existing output', () => {
  const out = path.join(temp, 'public.html');
  fs.writeFileSync(out, 'existing output');
  const result = build(out, '1');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /공개 빌드 중단: 무신사/);
  assert.match(result.stderr, /공개 사용 권리와 근거가 확인되지 않았어요/);
  assert.equal(fs.readFileSync(out, 'utf8'), 'existing output');
});
