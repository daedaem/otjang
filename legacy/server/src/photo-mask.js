// Optional: a higher-quality garment mask on this server.
//
// Model: U-2-Net (Apache-2.0, xuebinqin/U-2-Net) as converted to ONNX by rembg
// (MIT, danielgatis/rembg release v0.0.0), pinned by SHA-384. Runtime:
// onnxruntime-node 1.22.0 (MIT), CPU. Both are optional: without them the
// server runs as before and the app removes backgrounds on the device.
//
// The app sends only a 320×320 RGB copy of the photo and receives a 320×320
// mask; it builds the white-background photo itself. Nothing is stored or logged.
// Measured 2026-10-15 on 20 synthetic home scenes (docs/server-photo-mask-20261015.md):
// mean IoU 0.970, worst 0.938, 0.33s median with 4 threads on a 2.1GHz vCPU.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { keepMainSubject } from '../../app/src/mask-cleanup.js';

export const MASK_SIZE = 320;
export const MASK_INPUT_BYTES = MASK_SIZE * MASK_SIZE * 3;
export const MASK_MODEL = Object.freeze({
  url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx',
  integrity: 'sha384-pslaVs2eLwRhJVMJOxlMJ9mEO0BRz0QTECl+DYOTrNJwivv/k6lECapcWXCU6n77',
  bytes: 175997641,
});
const MAX_WAITING = 4;

export function integrityOf(bytes) {
  return `sha384-${crypto.createHash('sha384').update(bytes).digest('base64')}`;
}

/** Same preprocessing as rembg's U-2-Net session: scale by the image max, ImageNet mean/std, CHW. */
export function maskInput(rgb, size = MASK_SIZE) {
  const n = size * size;
  let max = 1;
  for (const v of rgb) if (v > max) max = v;
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const input = new Float32Array(3 * n);
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) input[c * n + p] = (rgb[p * 3 + c] / max - mean[c]) / std[c];
  return input;
}

export function maskOutput(pred, size = MASK_SIZE) {
  let lo = Infinity, hi = -Infinity;
  for (const v of pred) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;
  const mask = new Uint8Array(size * size);
  for (let p = 0; p < mask.length; p++) mask[p] = Math.round(((pred[p] - lo) / span) * 255);
  return keepMainSubject(mask, size);
}

/**
 * Returns null when the feature is off (no model file, no runtime, or a model
 * that does not match the pinned hash); the reason goes to the log.
 */
export async function createMaskService({
  modelFile, threads = 4, integrity = MASK_MODEL.integrity,
  loadRuntime = () => import('onnxruntime-node'), log = () => {},
}) {
  if (!modelFile || !fs.existsSync(modelFile)) {
    log(`사진 배경 처리 꺼짐: 모델 파일이 없어요 (${modelFile}). 켜려면 npm run fetch-model`);
    return null;
  }
  let ort;
  try {
    const loaded = await loadRuntime();
    ort = loaded.default?.InferenceSession ? loaded.default : loaded;
  } catch {
    log('사진 배경 처리 꺼짐: onnxruntime-node가 설치되지 않았어요. 켜려면 server에서 npm install');
    return null;
  }
  const bytes = fs.readFileSync(modelFile);
  if (integrityOf(bytes) !== integrity) {
    log('사진 배경 처리 꺼짐: 모델 파일이 고정한 버전과 달라요. npm run fetch-model로 다시 받아 주세요.');
    return null;
  }
  const session = await ort.InferenceSession.create(bytes, { intraOpNumThreads: threads, executionProviders: ['cpu'] });
  let chain = Promise.resolve(), waiting = 0;
  async function infer(rgb) {
    const tensor = new ort.Tensor('float32', maskInput(rgb), [1, 3, MASK_SIZE, MASK_SIZE]);
    const output = await session.run({ [session.inputNames[0]]: tensor });
    return maskOutput(output[session.outputNames[0]].data);
  }
  log(`사진 배경 처리 켜짐 (U-2-Net, 스레드 ${threads}개)`);
  return {
    /** One photo at a time; a short queue, then "busy" so the app falls back at once. */
    async mask(rgb) {
      if (!(rgb instanceof Uint8Array) || rgb.length !== MASK_INPUT_BYTES) throw Object.assign(new Error('bad input'), { code: 'bad-input' });
      if (waiting >= MAX_WAITING) throw Object.assign(new Error('busy'), { code: 'busy' });
      waiting++;
      const run = chain.then(() => infer(rgb));
      chain = run.catch(() => {});
      try {
        return await run;
      } finally {
        waiting--;
      }
    },
  };
}

/** Download (or take a local copy of) the pinned model and keep it only if the hash matches. */
export async function installMaskModel(target, { from = null, fetchImpl = globalThis.fetch } = {}) {
  let bytes;
  if (from) bytes = fs.readFileSync(from);
  else {
    const response = await fetchImpl(MASK_MODEL.url);
    if (!response.ok) throw new Error(`모델을 내려받지 못했어요 (${response.status}).`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (integrityOf(bytes) !== MASK_MODEL.integrity) throw new Error('받은 모델이 고정한 버전과 달라 저장하지 않았어요.');
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  const temp = `${target}.part`;
  fs.writeFileSync(temp, bytes);
  fs.renameSync(temp, target);
  return bytes.length;
}
