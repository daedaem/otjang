import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db.js';
import { createApp, AGREEMENT_VERSION } from '../src/app.js';
import { createMaskService, installMaskModel, integrityOf, maskInput, MASK_SIZE, MASK_INPUT_BYTES } from '../src/photo-mask.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-mask-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const modelFile = path.join(temp, 'fake.onnx');
fs.writeFileSync(modelFile, 'not really a model');
const fakeIntegrity = integrityOf(fs.readFileSync(modelFile));

// A fake runtime: the "model" marks a box in the middle and a small far patch.
function fakeRuntime(calls, { slow = null } = {}) {
  class Tensor { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } }
  return async () => ({
    default: {
      Tensor,
      InferenceSession: {
        create: async (bytes, options) => {
          calls.push({ create: bytes.length, options });
          return {
            inputNames: ['input'], outputNames: ['out'],
            async run(feeds) {
              calls.push({ input: feeds.input });
              if (slow) await slow;
              const pred = new Float32Array(MASK_SIZE * MASK_SIZE);
              for (let y = 100; y < 220; y++) for (let x = 100; x < 220; x++) pred[y * MASK_SIZE + x] = 5;
              for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) pred[y * MASK_SIZE + x] = 5;
              return { out: { data: pred } };
            },
          };
        },
      },
    },
  });
}

test('the feature stays off without a model, without the runtime, or with a model of another hash', async () => {
  const logs = [];
  const log = (m) => logs.push(m);
  assert.equal(await createMaskService({ modelFile: path.join(temp, 'missing.onnx'), log }), null);
  assert.equal(await createMaskService({ modelFile, integrity: fakeIntegrity, loadRuntime: async () => { throw new Error('not installed'); }, log }), null);
  assert.equal(await createMaskService({ modelFile, loadRuntime: fakeRuntime([]), log }), null, 'the pinned hash does not match this file');
  assert.match(logs.join('\n'), /모델 파일이 없어요[\s\S]*설치되지 않았어요[\s\S]*고정한 버전과 달라요/);
});

test('preprocessing matches rembg and the output keeps only the main subject', async () => {
  const rgb = new Uint8Array(MASK_INPUT_BYTES).fill(200);
  rgb[0] = 250;
  const input = maskInput(rgb);
  assert.equal(input.length, 3 * MASK_SIZE * MASK_SIZE);
  assert.ok(Math.abs(input[1] - (200 / 250 - 0.485) / 0.229) < 1e-6, 'scaled by the image max, then ImageNet mean/std, CHW');
  const calls = [];
  const service = await createMaskService({ modelFile, integrity: fakeIntegrity, threads: 2, loadRuntime: fakeRuntime(calls) });
  assert.equal(calls[0].options.intraOpNumThreads, 2);
  const mask = await service.mask(rgb);
  assert.equal(mask.length, MASK_SIZE * MASK_SIZE);
  assert.equal(mask[150 * MASK_SIZE + 150], 255);
  assert.equal(mask[2 * MASK_SIZE + 2], 0, 'the small far patch is removed');
  assert.deepEqual(calls[1].input.dims, [1, 3, MASK_SIZE, MASK_SIZE]);
  await assert.rejects(service.mask(new Uint8Array(10)), { code: 'bad-input' });
});

test('one photo at a time with a short queue, then busy', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const service = await createMaskService({ modelFile, integrity: fakeIntegrity, loadRuntime: fakeRuntime([], { slow }) });
  const queued = Array.from({ length: 4 }, () => service.mask(new Uint8Array(MASK_INPUT_BYTES)));
  await assert.rejects(service.mask(new Uint8Array(MASK_INPUT_BYTES)), { code: 'busy' });
  release();
  assert.equal((await Promise.all(queued)).length, 4);
});

test('a downloaded or copied model is kept only when it matches the pinned hash', async () => {
  const target = path.join(temp, 'models', 'u2net.onnx');
  await assert.rejects(installMaskModel(target, { fetchImpl: async () => new Response('tampered') }), /고정한 버전과 달라/);
  await assert.rejects(installMaskModel(target, { from: modelFile }), /고정한 버전과 달라/);
  assert.equal(fs.existsSync(target), false);
});

test('the API: signed-in only, exact size, mask back, nothing stored, busy becomes 503', async (t) => {
  const db = openDatabase(':memory:');
  const service = await createMaskService({ modelFile, integrity: fakeIntegrity, loadRuntime: fakeRuntime([]) });
  const busyService = { mask: async () => { throw Object.assign(new Error('busy'), { code: 'busy' }); } };
  const logs = [];
  const make = (maskService) => createApp({ db, maskService, config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none' }, log: (...e) => logs.push(e) });
  const apps = { on: make(service), off: make(null), busy: make(busyService) };
  let current = apps.on;
  const server = http.createServer((req, res) => current.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(() => { db.close(); resolve(); })));
  const base = `http://127.0.0.1:${server.address().port}`;
  const signup = await (await fetch(`${base}/v1/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'mask@example.com', password: 'correct horse', agreements: { version: AGREEMENT_VERSION, terms: true, privacy: true, age14: true } }) })).json();
  const post = (body, { token = signup.token, type = 'application/octet-stream' } = {}) =>
    fetch(`${base}/v1/photo-mask`, { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': type }, body });
  assert.equal((await (await fetch(`${base}/v1/health`)).json()).features.photoMask, true);
  assert.equal((await post(new Uint8Array(MASK_INPUT_BYTES), { token: null })).status, 401);
  assert.equal((await post(new Uint8Array(MASK_INPUT_BYTES), { type: 'image/jpeg' })).status, 415);
  assert.equal((await post(new Uint8Array(100))).status, 400);
  const ok = await post(new Uint8Array(MASK_INPUT_BYTES).fill(120));
  assert.equal(ok.status, 200);
  const mask = new Uint8Array(await ok.arrayBuffer());
  assert.equal(mask.length, MASK_SIZE * MASK_SIZE);
  assert.equal(mask[150 * MASK_SIZE + 150], 255);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n, 0, 'nothing is stored');
  current = apps.busy;
  assert.equal((await post(new Uint8Array(MASK_INPUT_BYTES))).status, 503);
  current = apps.off;
  assert.equal((await (await fetch(`${base}/v1/health`)).json()).features.photoMask, false);
  assert.equal((await post(new Uint8Array(MASK_INPUT_BYTES))).status, 404);
  assert.ok(logs.every((entry) => !/mask@example\.com/.test(JSON.stringify(entry))));
});

// Runs only where the real model and runtime are installed (npm install + npm run fetch-model).
const realModel = fileURLToPath(new URL('../models/u2net.onnx', import.meta.url));
let runtimeInstalled = true;
try { await import('onnxruntime-node'); } catch { runtimeInstalled = false; }
test('the real U-2-Net finds a dark garment-shaped object on a light floor', { skip: !(fs.existsSync(realModel) && runtimeInstalled) && 'model or runtime not installed' }, async () => {
  const service = await createMaskService({ modelFile: realModel, threads: 2 });
  assert.ok(service);
  const rgb = new Uint8Array(MASK_INPUT_BYTES);
  const inside = (x, y) => (x > 90 && x < 230 && y > 70 && y < 260) || (x > 60 && x < 260 && y > 70 && y < 130);
  for (let y = 0; y < MASK_SIZE; y++) for (let x = 0; x < MASK_SIZE; x++) {
    const p = (y * MASK_SIZE + x) * 3, noise = ((x * 7 + y * 13) % 9) - 4;
    const [r, g, b] = inside(x, y) ? [60, 70, 50] : [215 + noise, 210 + noise, 200 + noise];
    rgb[p] = r; rgb[p + 1] = g; rgb[p + 2] = b;
  }
  const t0 = performance.now();
  const mask = await service.mask(rgb);
  const ms = performance.now() - t0;
  let both = 0, either = 0;
  for (let y = 0; y < MASK_SIZE; y++) for (let x = 0; x < MASK_SIZE; x++) {
    const a = mask[y * MASK_SIZE + x] >= 128, b = inside(x, y);
    both += a && b; either += a || b;
  }
  assert.ok(both / either > 0.85, `IoU ${(both / either).toFixed(3)} in ${Math.round(ms)}ms`);
});
