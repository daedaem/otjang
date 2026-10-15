// On-device background removal for one garment photo.
//
// Model: U-2-Netp (Apache-2.0; ONNX from rembg, HF port BritishWerewolf/U-2-Netp,
// pinned revision). Runtime: onnxruntime-web 1.22.0 (MIT), WASM, one thread.
// The photo never leaves the device. Every downloaded file is checked against
// a pinned SHA-384 before use; the WASM binary and the model run from the
// verified bytes, the two small JS modules are imported by URL after the check.
// Measured 2026-10-15 (docs/background-removal-20261015.md): about 7MB to
// transfer the first time; 1.6–1.9s per photo in desktop Chromium WASM on a
// 2.1GHz server vCPU. Phone timing is not measured.

const BG_ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
export const BACKGROUND_FILES = Object.freeze({
  runtime: { url: `${BG_ORT}ort.wasm.min.mjs`, integrity: 'sha384-gnybD0DbcdbgochNJEKfs1JeM+0iPWzSESNavtMDLT/E34RAPtXngFE4AVdlcScw' },
  glue: { url: `${BG_ORT}ort-wasm-simd-threaded.mjs`, integrity: 'sha384-LXMGGJ76ujT3yGw+OWQZVB6vBmJ7lqTO957Fh6ov3385aw3EncleBNFfYFAl3vXW' },
  wasm: { url: `${BG_ORT}ort-wasm-simd-threaded.wasm`, integrity: 'sha384-Eu/XUdOA62yl+TueG792KtrQlAGAMW3g10sY4G3LBYyYZUtM126Z4Gr3ljTlXUGG' },
  model: {
    url: 'https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8/onnx/model.onnx',
    integrity: 'sha384-UpjzLoU+lZEVpKFraDciVxXXwOeulVBvJo0I/V2HCFa+3IfH/NVWG+LnDKlaZDM4',
  },
});
export const BACKGROUND_DOWNLOAD_LABEL = '약 7MB';
export const BACKGROUND_MASK_SIZE = 320;
const BACKGROUND_TIMEOUT = 120000;

function backgroundError(message, name = 'Error') {
  const error = new Error(message);
  error.name = name;
  return error;
}

// Stringified into a standalone module worker; no closure references.
function backgroundWorkerMain(config) {
  let sessionPromise = null;
  let ort = null;
  const verified = async (file) => {
    const response = await fetch(file.url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) throw new Error('배경 지우기 도구를 내려받지 못했어요. 인터넷 연결을 확인해 주세요.');
    const bytes = await response.arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-384', bytes));
    let binary = '';
    for (const byte of digest) binary += String.fromCharCode(byte);
    if (`sha384-${btoa(binary)}` !== file.integrity) throw new Error('배경 지우기 도구 파일이 고정한 버전과 달라 사용하지 않았어요.');
    return bytes;
  };
  const session = () => {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        // The WASM binary and the model are used from the verified bytes. The two
        // small JS modules are hash-checked here and then imported by URL (normally
        // from the HTTP cache this fetch filled): ONNX Runtime locates its glue
        // from its own URL and does not start from a blob: URL (checked 2026-10-15).
        const [, , wasm, model] = await Promise.all([
          verified(config.files.runtime), verified(config.files.glue), verified(config.files.wasm), verified(config.files.model),
        ]);
        ort = await import(config.files.runtime.url);
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        ort.env.wasm.wasmBinary = wasm;
        return ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
      })().catch((error) => { sessionPromise = null; throw error; });
    }
    return sessionPromise;
  };
  self.onmessage = async ({ data }) => {
    if (!data || data.type !== 'segment' || typeof data.id !== 'string') return;
    const { id } = data;
    try {
      if (!(data.blob instanceof Blob) || data.blob.type !== 'image/jpeg') throw new Error('사진을 읽지 못했어요.');
      if (typeof self.OffscreenCanvas !== 'function' || typeof self.createImageBitmap !== 'function')
        throw new Error('이 브라우저는 배경 지우기를 지원하지 않아요.');
      self.postMessage({ type: 'progress', id, stage: 'model-loading' });
      const s = await session();
      self.postMessage({ type: 'progress', id, stage: 'segmenting' });
      const size = config.size;
      const bitmap = await self.createImageBitmap(data.blob);
      const canvas = new self.OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, size, size);
      bitmap.close?.();
      const px = ctx.getImageData(0, 0, size, size).data;
      // Same preprocessing as rembg's U-2-Net session: scale by the image max,
      // then ImageNet mean/std, CHW float32.
      let max = 1;
      for (let p = 0; p < px.length; p++) if (p % 4 !== 3 && px[p] > max) max = px[p];
      const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
      const input = new Float32Array(3 * size * size);
      for (let p = 0; p < size * size; p++) for (let c = 0; c < 3; c++) input[c * size * size + p] = (px[p * 4 + c] / max - mean[c]) / std[c];
      const output = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, size, size]) });
      const pred = output[s.outputNames[0]].data;
      let lo = Infinity, hi = -Infinity;
      for (const v of pred) { if (v < lo) lo = v; if (v > hi) hi = v; }
      const mask = new Uint8Array(size * size);
      const span = hi - lo || 1;
      for (let p = 0; p < mask.length; p++) mask[p] = Math.round(((pred[p] - lo) / span) * 255);
      self.postMessage({ type: 'result', id, mask, size }, [mask.buffer]);
    } catch (error) {
      self.postMessage({ type: 'error', id, message: error?.message || '배경을 지우지 못했어요.' });
    }
  };
}

function backgroundWorkerSource() {
  return `(${backgroundWorkerMain.toString()})(${JSON.stringify({ files: BACKGROUND_FILES, size: BACKGROUND_MASK_SIZE })});`;
}

/** Share of the mask that is foreground (0–1), using the 50% threshold. */
export function maskCoverage(mask) {
  let on = 0;
  for (const v of mask) if (v >= 128) on++;
  return mask.length ? on / mask.length : 0;
}

/**
 * A remover runs one photo at a time in a module worker. `segment` resolves
 * with a 320×320 foreground mask (0–255) or rejects with a user message.
 */
export function createBackgroundRemover({ createWorker = null, timeoutMs = BACKGROUND_TIMEOUT, onProgress = () => {} } = {}) {
  let worker = null, url = null, pending = null, disposed = false, next = 0;
  const start = () => {
    if (worker) return;
    if (createWorker) { worker = createWorker(backgroundWorkerSource()); }
    else {
      if (typeof Worker !== 'function' || typeof URL?.createObjectURL !== 'function')
        throw backgroundError('이 브라우저는 배경 지우기를 지원하지 않아요.', 'NotSupportedError');
      url = URL.createObjectURL(new Blob([backgroundWorkerSource()], { type: 'text/javascript' }));
      worker = new Worker(url, { type: 'module' });
    }
    worker.onmessage = ({ data }) => {
      if (!pending || data?.id !== pending.id) return;
      if (data.type === 'progress') { onProgress(data.stage); return; }
      const { resolve, reject, timer } = pending;
      pending = null;
      clearTimeout(timer);
      if (data.type === 'result' && data.mask?.length === data.size * data.size) resolve({ mask: data.mask, size: data.size });
      else reject(backgroundError(data.message || '배경을 지우지 못했어요.'));
    };
    worker.onerror = () => {
      if (!pending) return;
      const { reject, timer } = pending;
      pending = null;
      clearTimeout(timer);
      reject(backgroundError('배경 지우기 도구를 시작하지 못했어요.'));
    };
  };
  const remover = {
    segment(blob) {
      if (disposed) return Promise.reject(backgroundError('배경 지우기를 닫았어요.', 'InvalidStateError'));
      if (pending) return Promise.reject(backgroundError('앞선 배경 지우기가 아직 진행 중이에요.'));
      try { start(); } catch (error) { return Promise.reject(error); }
      const id = `bg-${++next}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending?.id !== id) return;
          pending = null;
          remover.dispose();
          reject(backgroundError('배경 지우기가 오래 걸려 멈췄어요. 원래 사진은 그대로예요.', 'TimeoutError'));
        }, timeoutMs);
        pending = { id, resolve, reject, timer };
        worker.postMessage({ type: 'segment', id, blob });
      });
    },
    dispose() {
      disposed = true;
      if (pending) { clearTimeout(pending.timer); pending.reject(backgroundError('배경 지우기를 취소했어요.', 'AbortError')); pending = null; }
      try { worker?.terminate?.(); } catch {}
      if (url) URL.revokeObjectURL(url);
      worker = null; url = null;
    },
  };
  return remover;
}
