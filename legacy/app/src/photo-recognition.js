// Optional, on-device suggestions. Only public runtime/model assets are fetched;
// the selected image Blob is passed to local workers, never to an inference API.
// Scores compare the supplied labels and are not calibrated probabilities.
export const PHOTO_RECOGNITION_MODEL = 'Xenova/clip-vit-base-patch32';
export const PHOTO_RECOGNITION_REVISION = 'd15189d7028b43f1d3e65039190477f6af591c2a';
export const PHOTO_RECOGNITION_DTYPE = 'q8';
export const PHOTO_RECOGNITION_KIND_LABELS = [
  ['shirt', '셔츠', 'button-up shirt'], ['tee', '티셔츠', 't-shirt'],
  ['knit', '니트', 'knitted sweater'], ['pants', '바지', 'trousers'],
  ['vest', '베스트·조끼', 'sleeveless vest'],
  ['jeans', '청바지', 'jeans'], ['jacket', '재킷', 'jacket'],
  ['sneaker', '운동화', 'sneakers'], ['cardigan', '카디건', 'cardigan'],
  ['longtee', '긴팔 티', 'long sleeve t-shirt'], ['sweat', '맨투맨·후드', 'sweatshirt'],
  ['polo', '폴로 셔츠', 'polo shirt'], ['blazer', '블레이저', 'blazer'],
  ['coat', '코트', 'coat'], ['down', '패딩', 'puffer jacket'],
  ['dress', '원피스', 'dress'], ['skirt', '스커트', 'skirt'],
  ['loafer', '구두·로퍼', 'leather shoes'], ['boot', '부츠', 'boots'],
  ['bag', '가방', 'bag'], ['cap', '모자', 'hat'], ['beanie', '비니', 'beanie hat'], ['belt', '벨트', 'belt'],
];
export const PHOTO_RECOGNITION_KIND_ALIASES = [['jacket', 'denim jacket'], ['sweat', 'hoodie']];
export const PHOTO_RECOGNITION_DISTRACTORS = ['several garments worn by a person', 'no garment'];
export const PHOTO_RECOGNITION_COLOR_LABELS = [
  ['white', '화이트', 'white'], ['ivory', '아이보리', 'ivory'], ['beige', '베이지', 'beige'],
  ['blue', '라이트 블루', 'light blue'], ['grey', '그레이', 'gray'], ['olive', '올리브', 'olive green'],
  ['brown', '브라운', 'brown'], ['indigo', '인디고', 'indigo blue'], ['charcoal', '차콜', 'charcoal gray'],
  ['navy', '네이비', 'navy blue'], ['black', '블랙', 'black'], ['green', '그린', 'green'],
  ['red', '레드·버건디', 'red or burgundy'], ['pink', '핑크', 'pink'], ['yellow', '옐로', 'yellow'],
  ['purple', '퍼플', 'purple'], ['orange', '오렌지', 'orange'],
];

const PHOTO_RECOGNITION_RUNTIME = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const PHOTO_RECOGNITION_OCR_SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
const PHOTO_RECOGNITION_OCR_WORKER = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js';
const PHOTO_RECOGNITION_OCR_CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0';
const PHOTO_RECOGNITION_OCR_LANG = 'https://tessdata.projectnaptha.com/4.0.0';
// SHA-384 of the pinned files, computed 2026-10-15 from the URLs above. A CDN
// that serves different bytes is refused and the user registers manually.
// Files these libraries fetch themselves (ONNX/Tesseract WASM, OCR worker,
// language data, model weights) are pinned by version/revision but not hashed
// here; see docs/registration-photo-20261015.md.
export const PHOTO_RECOGNITION_RUNTIME_INTEGRITY = 'sha384-sOua6i337lNLWtuIG44PBf5JXIvhoicFClCcI4XHDe/eHW3dwhQ3Y6t6wQjfRrkT';
export const PHOTO_RECOGNITION_OCR_SCRIPT_INTEGRITY = 'sha384-r1ru3tcf6FhnCFR4B7pIFG+BhFF9LlFtz/P1y4pblWn3AGs9y3lBx5SKLNf4+rED';
const PHOTO_RECOGNITION_TIMEOUT = 90000;
const PHOTO_RECOGNITION_PREPARATION_TIMEOUT = 600000;
let photoRecognitionOcrLibrary = null;

function photoRecognitionError(message, name = 'Error') {
  const error = new Error(message);
  error.name = name;
  return error;
}

// This function is stringified into a standalone module worker by the single-
// HTML builder. It deliberately has no closure references or image URL inputs.
function photoRecognitionWorkerMain(config) {
  let pipelinePromise = null;
  let activeId = null;
  const progress = (id, stage, value = null) => self.postMessage({ type: 'progress', id, stage, progress: value });
  // Refuse a runtime whose bytes differ from the pinned SHA-384. The import that
  // follows normally comes from the HTTP cache this fetch filled; a CDN that
  // answers the two requests differently is not covered (see the photo doc).
  const verified = async (url, integrity) => {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) throw new Error('사진 분석 도구를 내려받지 못했습니다. 인터넷 연결을 확인하거나 종류를 직접 골라 주세요.');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-384', await response.arrayBuffer()));
    let binary = '';
    for (const byte of digest) binary += String.fromCharCode(byte);
    if (`sha384-${btoa(binary)}` !== integrity) throw new Error('사진 분석 도구 파일이 고정한 버전과 달라 사용하지 않았어요. 종류를 직접 골라 주세요.');
  };
  const classifier = () => {
    if (!pipelinePromise) {
      pipelinePromise = verified(config.runtime, config.runtimeIntegrity).then(() => import(config.runtime)).then(({ env, pipeline }) => {
        env.allowLocalModels = false;
        env.backends.onnx.wasm.numThreads = 1;
        env.backends.onnx.wasm.proxy = false;
        return pipeline('zero-shot-image-classification', config.model, {
          revision: config.revision, dtype: config.dtype, device: 'wasm',
          progress_callback: (event) => progress(activeId, 'model-loading',
            Number.isFinite(event.progress) ? event.progress / 100 : null),
        });
      }).catch((error) => { pipelinePromise = null; throw error; });
    }
    return pipelinePromise;
  };
  self.onmessage = async ({ data }) => {
    if (!data || data.type !== 'analyze' || typeof data.id !== 'string') return;
    const id = data.id;
    if (!(data.blob instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(data.blob.type)) {
      self.postMessage({ type: 'error', id, message: '선택한 사진을 읽지 못했습니다.' });
      return;
    }
    if (activeId !== null) {
      self.postMessage({ type: 'error', id, message: '앞선 사진 분석이 아직 진행 중입니다.' });
      return;
    }
    activeId = id;
    try {
      if (typeof self.OffscreenCanvas !== 'function' || typeof self.createImageBitmap !== 'function') {
        throw new Error('이 브라우저는 사진 종류 분석을 지원하지 않습니다. 직접 고르거나 다른 브라우저에서 다시 시도해 주세요.');
      }
      progress(id, 'model-loading');
      const classify = await classifier();
      const distractors = config.distractors;
      progress(id, 'kind-analysis');
      const kinds = await classify(data.blob, [...config.kinds.map((row) => row[2]), ...config.aliases.map((row) => row[1]), ...distractors]);
      const requiresCrop = distractors.includes(kinds[0]?.label);
      self.postMessage({ type: 'result', id, result: {
        kinds: requiresCrop ? [] : kinds.flatMap((result) => {
          const alias = config.aliases.find((entry) => entry[1] === result.label);
          const row = config.kinds.find((entry) => entry[2] === result.label || entry[0] === alias?.[0]);
          return row ? [{ kind: row[0], label: row[1], score: result.score }] : [];
        }).filter((row, index, all) => all.findIndex((entry) => entry.kind === row.kind) === index).slice(0, 3),
        // Public-sample testing misclassified a white shirt as charcoal.
        // Do not expose an unverified color prediction; use manual color input.
        colors: [],
        requiresCrop,
      } });
    } catch (error) {
      self.postMessage({ type: 'error', id, message: error?.message || '사진 종류 분석을 완료하지 못했습니다.' });
    } finally { activeId = null; }
  };
}

function photoRecognitionWorkerSource() {
  return `(${photoRecognitionWorkerMain.toString()})(${JSON.stringify({
    runtime: PHOTO_RECOGNITION_RUNTIME, runtimeIntegrity: PHOTO_RECOGNITION_RUNTIME_INTEGRITY, model: PHOTO_RECOGNITION_MODEL, revision: PHOTO_RECOGNITION_REVISION, dtype: PHOTO_RECOGNITION_DTYPE,
    kinds: PHOTO_RECOGNITION_KIND_LABELS, aliases: PHOTO_RECOGNITION_KIND_ALIASES,
    distractors: PHOTO_RECOGNITION_DISTRACTORS,
  })});`;
}

function photoRecognitionDefaultWorker({ source, type }) {
  if (typeof Worker !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw photoRecognitionError('이 브라우저는 사진 분석 Worker를 지원하지 않습니다. 직접 종류를 선택해 주세요.', 'NotSupportedError');
  }
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    const worker = new Worker(url, { type });
    return { worker, dispose() { worker.terminate(); URL.revokeObjectURL(url); } };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

function photoRecognitionLoadOcrLibrary() {
  if (!photoRecognitionOcrLibrary) {
    photoRecognitionOcrLibrary = new Promise((resolve, reject) => {
      if (typeof Worker !== 'function' || typeof document === 'undefined' || !document.head?.appendChild) {
        reject(photoRecognitionError('이 브라우저는 라벨 문자 분석 Worker를 지원하지 않습니다. 라벨 글자를 직접 적어 주세요.', 'NotSupportedError'));
        return;
      }
      const script = document.createElement('script');
      script.src = PHOTO_RECOGNITION_OCR_SCRIPT;
      script.integrity = PHOTO_RECOGNITION_OCR_SCRIPT_INTEGRITY;
      script.async = true;
      script.crossOrigin = 'anonymous';
      const timer = setTimeout(() => finish(photoRecognitionError('라벨 분석 도구 다운로드 시간이 초과되었습니다.', 'TimeoutError')), 30000);
      const finish = (error) => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove?.(); reject(error); }
        else if (typeof globalThis.Tesseract?.createWorker === 'function') resolve(globalThis.Tesseract);
        else reject(photoRecognitionError('라벨 분석 도구를 시작하지 못했습니다. 다시 시도해 주세요.'));
      };
      script.onload = () => finish();
      script.onerror = () => finish(photoRecognitionError('라벨 분석 도구를 내려받지 못했거나 파일이 고정한 버전과 달라 사용하지 않았어요. 인터넷 연결을 확인하거나 라벨 글자를 직접 적어 주세요.'));
      document.head.appendChild(script);
    }).catch((error) => { photoRecognitionOcrLibrary = null; throw error; });
  }
  return photoRecognitionOcrLibrary;
}

async function photoRecognitionDefaultOcr({ onProgress, onCreated, isCurrent }) {
  const tesseract = await photoRecognitionLoadOcrLibrary();
  if (!isCurrent()) throw photoRecognitionError('사진 분석을 취소했습니다.', 'AbortError');
  const worker = await tesseract.createWorker(['eng', 'kor'], 1, {
    workerPath: PHOTO_RECOGNITION_OCR_WORKER, corePath: PHOTO_RECOGNITION_OCR_CORE,
    langPath: PHOTO_RECOGNITION_OCR_LANG, cacheMethod: 'write',
    logger: onProgress, errorHandler: () => {},
  });
  onCreated(worker);
  if (!isCurrent()) throw photoRecognitionError('사진 분석을 취소했습니다.', 'AbortError');
  await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT, preserve_interword_spaces: '1' });
  return worker;
}

function photoRecognitionCandidates(value, type, choices) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((row) => {
    const known = choices.find((entry) => entry[0] === row?.[type]);
    if (!known || seen.has(known[0]) || !Number.isFinite(row.score) || row.score < 0 || row.score > 1) return [];
    seen.add(known[0]);
    return [{ [type]: known[0], label: known[1], score: row.score }];
  }).sort((a, b) => b.score - a.score).slice(0, 3);
}

/**
 * Suggestions stay outside wardrobe state until the caller confirms them.
 * Only image Blobs are accepted: URLs/base64/paths cannot cause remote reads.
 * Runtime/model preparation has a separate ten-minute limit. Each subtask's
 * ninety-second inference limit starts only when its worker is ready.
 * Factories and shorter phase deadlines are injectable for lifecycle tests.
 * Cancelling during Tesseract initialization invalidates the job immediately;
 * its handle is terminated as soon as the library returns it.
 */
export function createPhotoRecognizer({
  workerFactory = photoRecognitionDefaultWorker, ocrFactory = photoRecognitionDefaultOcr,
  timeoutMs = PHOTO_RECOGNITION_TIMEOUT,
  preparationTimeoutMs = PHOTO_RECOGNITION_PREPARATION_TIMEOUT,
} = {}) {
  if (typeof workerFactory !== 'function' || typeof ocrFactory !== 'function' ||
      !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > PHOTO_RECOGNITION_TIMEOUT ||
      !Number.isFinite(preparationTimeoutMs) || preparationTimeoutMs < 1 ||
      preparationTimeoutMs > PHOTO_RECOGNITION_PREPARATION_TIMEOUT) {
    throw new Error('사진 분석 설정이 올바르지 않습니다.');
  }
  let disposed = false, current = null, sequence = 0, vision = null, ocr = null;
  const terminatedOcr = new WeakSet();
  const terminateOcr = (worker) => {
    if (!worker || typeof worker !== 'object' || terminatedOcr.has(worker)) return;
    terminatedOcr.add(worker);
    try { Promise.resolve(worker.terminate?.()).catch(() => {}); } catch {}
  };
  const stopResources = () => {
    if (vision) { try { vision.dispose(); } catch {} vision = null; }
    if (ocr) { terminateOcr(ocr); ocr = null; }
  };
  const clearTaskTimer = (job, task) => {
    clearTimeout(job[`${task}Timer`]);
    job[`${task}Timer`] = null;
  };
  const clearJobTimers = (job) => { clearTaskTimer(job, 'vision'); clearTaskTimer(job, 'ocr'); };
  const abort = (message = '사진 분석을 취소했습니다.', name = 'AbortError') => {
    const job = current;
    current = null;
    if (job?.ocrCreated) { terminateOcr(job.ocrCreated); job.ocrCreated = null; }
    stopResources();
    if (job) { clearJobTimers(job); job.reject(photoRecognitionError(message, name)); }
  };
  const emit = (job, value) => {
    if (current !== job || (value.task === 'ocr' && job.ocrDone) || (value.task === 'vision' && job.visionDone)) return;
    const progress = Number.isFinite(value?.progress) ? Math.max(0, Math.min(1, value.progress)) : null;
    try { job.onProgress({ task: value.task, stage: String(value.stage || '').slice(0, 120), progress }); } catch {}
  };
  const finish = (job) => {
    if (current !== job || !job.visionDone || !job.ocrDone) return;
    clearJobTimers(job);
    current = null;
    if (!job.visionOK && !job.ocrOK) {
      job.reject(photoRecognitionError(job.warnings.join(' ') || '사진 분석을 완료하지 못했습니다. 다시 시도해 주세요.',
        job.timedOut ? 'TimeoutError' : 'NotSupportedError'));
      return;
    }
    job.resolve({
      kinds: job.kinds, colors: job.colors, text: job.text,
      requiresCrop: job.requiresCrop, warnings: job.warnings,
      model: job.mode === 'label' ? null : PHOTO_RECOGNITION_MODEL,
      revision: job.mode === 'label' ? null : PHOTO_RECOGNITION_REVISION,
      scoreMeaning: 'relative-label-score', requiresConfirmation: true,
      elapsedMs: Math.max(0, Date.now() - job.started),
    });
  };
  const expireTask = (job, task, phase) => {
    if (current !== job || job[`${task}Done`]) return;
    clearTaskTimer(job, task);
    job[`${task}Done`] = true;
    job.timedOut = true;
    const subject = task === 'vision' ? '옷 종류' : '라벨 문자';
    job.warnings.push(phase === 'preparation'
      ? `${subject} 분석 도구를 준비하는 시간이 초과되었습니다. 연결을 확인하고 다시 시도하거나 직접 입력해 주세요.`
      : `${subject} 분석 시간이 초과되었습니다. 다시 시도하거나 직접 입력해 주세요.`);
    if (task === 'vision' && vision) { try { vision.dispose(); } catch {} vision = null; }
    if (task === 'ocr' && ocr) { terminateOcr(ocr); ocr = null; }
    if (task === 'ocr' && job.ocrCreated) { terminateOcr(job.ocrCreated); job.ocrCreated = null; }
    finish(job);
  };
  const startPhase = (job, task, phase) => {
    if (current !== job || job[`${task}Done`] || job[`${task}Phase`] === phase) return;
    // A late download progress event must never reset an inference deadline.
    if (phase === 'preparation' && job[`${task}Phase`] === 'inference') return;
    clearTaskTimer(job, task);
    job[`${task}Phase`] = phase;
    job[`${task}Timer`] = setTimeout(() => expireTask(job, task, phase),
      phase === 'preparation' ? preparationTimeoutMs : timeoutMs);
  };
  const failVision = (job, message) => {
    if (current !== job || job.visionDone) return;
    job.visionDone = true;
    clearTaskTimer(job, 'vision');
    job.warnings.push(message || '옷 종류 분석을 완료하지 못했습니다. 직접 골라 주세요.');
    if (vision) { try { vision.dispose(); } catch {} vision = null; }
    finish(job);
  };
  const startVision = (job, blob) => {
    try {
      if (!vision) {
        const handle = workerFactory({ source: photoRecognitionWorkerSource(), type: 'module' });
        const worker = handle?.worker || handle;
        if (!worker || typeof worker.postMessage !== 'function' || typeof worker.terminate !== 'function') {
          try { handle?.dispose?.(); } catch {}
          throw new Error('사진 분석 Worker를 시작하지 못했습니다.');
        }
        vision = { worker, dispose: handle?.dispose ? () => handle.dispose() : () => worker.terminate() };
        worker.onmessage = ({ data }) => {
          const active = current;
          if (!active || data?.id !== active.id || active.visionDone) return;
          if (data.type === 'progress') {
            if (data.stage === 'kind-analysis') startPhase(active, 'vision', 'inference');
            emit(active, { task: 'vision', stage: data.stage, progress: data.progress });
          }
          else if (data.type === 'error') failVision(active, typeof data.message === 'string' ? data.message.slice(0, 500) : '사진 종류 분석을 완료하지 못했습니다.');
          else if (data.type === 'result') {
            active.visionDone = active.visionOK = true;
            clearTaskTimer(active, 'vision');
            active.requiresCrop = data.result?.requiresCrop === true;
            active.kinds = active.requiresCrop ? [] : photoRecognitionCandidates(data.result?.kinds, 'kind', PHOTO_RECOGNITION_KIND_LABELS);
            active.colors = active.requiresCrop ? [] : photoRecognitionCandidates(data.result?.colors, 'color', PHOTO_RECOGNITION_COLOR_LABELS);
            if (active.requiresCrop) active.warnings.push('옷 한 벌이 잘 보이도록 가까이 찍거나 잘라서 다시 분석해 주세요.');
            finish(active);
          }
        };
        worker.onerror = () => {
          if (current && vision?.worker === worker) failVision(current, '사진 분석 도구를 시작하지 못했습니다. 인터넷 연결·브라우저 지원을 확인하고 다시 시도해 주세요.');
        };
        worker.onmessageerror = () => {
          if (current && vision?.worker === worker) failVision(current, '사진 분석 결과를 읽지 못했습니다. 다시 시도해 주세요.');
        };
      }
      vision.worker.postMessage({ type: 'analyze', id: job.id, blob });
    } catch (error) { failVision(job, error?.message); }
  };
  const startOcr = async (job, blob) => {
    let created = null;
    try {
      if (!ocr) {
        const onCreated = (worker) => {
          created = job.ocrCreated = worker;
          if (current !== job || job.ocrDone) terminateOcr(worker);
        };
        const worker = await ocrFactory({
          onCreated, isCurrent: () => current === job && !job.ocrDone,
          onProgress: (event) => {
            const active = current;
            if (active && (active === job || ocr === created)) emit(active, { task: 'ocr', stage: event?.status || 'label-analysis', progress: event?.progress });
          },
        });
        if (current !== job || job.ocrDone) { if (worker !== created) terminateOcr(worker); return; }
        if (!worker || typeof worker.recognize !== 'function' || typeof worker.terminate !== 'function') {
          throw new Error('라벨 분석 Worker를 시작하지 못했습니다.');
        }
        created = ocr = worker;
        job.ocrCreated = null;
      }
      startPhase(job, 'ocr', 'inference');
      emit(job, { task: 'ocr', stage: 'label-analysis', progress: 0 });
      const result = await ocr.recognize(blob);
      if (current !== job || job.ocrDone) return;
      job.text = typeof result?.data?.text === 'string' ? result.data.text.slice(0, 1200) : '';
      job.ocrDone = job.ocrOK = true;
      clearTaskTimer(job, 'ocr');
      finish(job);
    } catch (error) {
      if (current !== job || job.ocrDone) { if (created) terminateOcr(created); return; }
      job.ocrDone = true;
      clearTaskTimer(job, 'ocr');
      job.warnings.push(error?.message || '라벨 문자를 읽지 못했습니다. 라벨 가까이에서 다시 찍어 주세요.');
      if (ocr) { terminateOcr(ocr); ocr = null; }
      else if (created) terminateOcr(created);
      finish(job);
    }
  };
  return {
    analyze(blob, { mode = 'garment', onProgress = () => {} } = {}) {
      if (disposed) return Promise.reject(photoRecognitionError('사진 분석 도구가 닫혔습니다. 다시 열어 주세요.', 'InvalidStateError'));
      if (!(blob instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ||
          blob.size < 1 || blob.size > 25000000) {
        return Promise.reject(photoRecognitionError('25MB 이하 JPG·PNG·WebP 사진을 골라 주세요.', 'TypeError'));
      }
      if (!['garment', 'label'].includes(mode) || typeof onProgress !== 'function') {
        return Promise.reject(photoRecognitionError('사진 분석 방식이 올바르지 않습니다.', 'TypeError'));
      }
      if (current) abort();
      return new Promise((resolve, reject) => {
        const job = {
          id: `photo-${++sequence}`, mode, resolve, reject, onProgress, started: Date.now(),
          kinds: [], colors: [], text: '', requiresCrop: false, warnings: [],
          visionDone: mode === 'label', visionOK: false, ocrDone: false, ocrOK: false,
        };
        current = job;
        if (mode === 'garment') startPhase(job, 'vision', 'preparation');
        startPhase(job, 'ocr', 'preparation');
        emit(job, { task: 'recognition', stage: 'starting', progress: 0 });
        if (mode === 'garment') startVision(job, blob);
        // Do not let factory/worker bootstrap rejections escape the job lifecycle.
        void startOcr(job, blob);
      });
    },
    cancel() { abort(); },
    dispose() { disposed = true; abort(); },
  };
}
