import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {
  createPhotoRecognizer, PHOTO_RECOGNITION_MODEL, PHOTO_RECOGNITION_REVISION,
  PHOTO_RECOGNITION_DTYPE, PHOTO_RECOGNITION_KIND_LABELS, PHOTO_RECOGNITION_COLOR_LABELS,
  PHOTO_RECOGNITION_KIND_ALIASES, PHOTO_RECOGNITION_DISTRACTORS,
} from '../src/photo-recognition.js';
import { GARMENT_KINDS } from '../src/wardrobe.js';
import { COLORS } from '../src/data/slots.js';

const image = () => new Blob([new Uint8Array([255, 216, 255, 7])], { type: 'image/jpeg' });
const turn = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const candidateResult = {
  kinds: [{ kind: 'shirt', label: 'untrusted label', score: 0.61 }, { kind: 'knit', score: 0.2 }],
  colors: [{ color: 'white', score: 0.7 }, { color: 'ivory', score: 0.2 }],
};
function harness({ ocrCreate, ocrResult = { data: { text: 'PATAGONIA\nL' } }, timeoutMs = 5000 } = {}) {
  const workers = [], ocrWorkers = [];
  const workerFactory = ({ source, type }) => {
    const worker = {
      source, type, messages: [], terminated: 0,
      postMessage(value) { this.messages.push(value); },
      terminate() { this.terminated++; },
      emit(data) { this.onmessage?.({ data }); },
    };
    workers.push(worker);
    return worker;
  };
  const ocrFactory = async (options) => {
    if (ocrCreate) return ocrCreate(options, ocrWorkers);
    const worker = {
      terminated: 0, options, images: [],
      async recognize(blob) { this.images.push(blob); return ocrResult; },
      async terminate() { this.terminated++; },
    };
    ocrWorkers.push(worker);
    options.onCreated(worker);
    return worker;
  };
  const recognizer = createPhotoRecognizer({ workerFactory, ocrFactory, timeoutMs });
  const completeVision = (index = workers.length - 1, result = candidateResult) => {
    const worker = workers[index];
    worker.emit({ type: 'result', id: worker.messages.at(-1).id, result });
  };
  return { recognizer, workers, ocrWorkers, completeVision };
}

test('supported kind/color suggestions cover current registration choices without concrete product slots', () => {
  assert.deepEqual(new Set(PHOTO_RECOGNITION_KIND_LABELS.map((row) => row[0])), new Set(GARMENT_KINDS.map((kind) => kind.id)));
  assert.deepEqual(new Set(PHOTO_RECOGNITION_COLOR_LABELS.map((row) => row[0])), new Set(Object.keys(COLORS)));
  assert.ok(PHOTO_RECOGNITION_KIND_LABELS.every((row) => row.length === 3 && !row[0].startsWith('m-')));
});

test('remote image addresses, paths, base64 and fake blob objects never reach workers', async () => {
  const h = harness();
  for (const invalid of ['https://private.example/person.jpg', 'data:image/jpeg;base64,/9j/', '/private/person.jpg',
    null, { type: 'image/jpeg', size: 4, arrayBuffer: async () => new ArrayBuffer(4) },
    new Blob(['<svg/>'], { type: 'image/svg+xml' }), new Blob([], { type: 'image/jpeg' })]) {
    await assert.rejects(h.recognizer.analyze(invalid), { name: 'TypeError' });
  }
  assert.equal(h.workers.length, 0);
  assert.equal(h.ocrWorkers.length, 0);
  h.recognizer.dispose();
});

test('local blob results stay suggestions and cannot introduce brands, slots or probabilities', async () => {
  const h = harness(), blob = image();
  const resultPromise = h.recognizer.analyze(blob);
  const sent = h.workers[0].messages[0];
  assert.equal(sent.blob, blob);
  assert.equal(sent.type, 'analyze');
  assert.deepEqual(Object.keys(sent).sort(), ['blob', 'id', 'type']);
  h.completeVision();
  const result = await resultPromise;
  assert.equal(h.ocrWorkers[0].images[0], blob);
  assert.equal(result.kinds[0].label, '셔츠');
  assert.equal(result.colors[0].label, '화이트');
  assert.equal(result.text, 'PATAGONIA\nL');
  assert.equal(result.model, PHOTO_RECOGNITION_MODEL);
  assert.equal(result.revision, PHOTO_RECOGNITION_REVISION);
  assert.equal(result.scoreMeaning, 'relative-label-score');
  assert.equal(result.requiresConfirmation, true);
  assert.equal('brand' in result, false);
  assert.equal('slot' in result.kinds[0], false);
  assert.equal('confidence' in result.kinds[0], false);
  h.recognizer.dispose();
});

test('worker messages with missing/wrong job ids are ignored rather than completing the photo', async () => {
  const h = harness(), progress = [];
  const promise = h.recognizer.analyze(image(), { onProgress: (event) => progress.push(event) });
  const worker = h.workers[0];
  worker.emit({ type: 'progress', id: 'photo-other', stage: 'wrong', progress: 0.9 });
  worker.emit({ type: 'result', result: candidateResult });
  worker.emit({ type: 'error', id: 'photo-other', message: 'wrong error' });
  await turn();
  assert.ok(!progress.some((event) => event.stage === 'wrong'));
  h.completeVision();
  assert.equal((await promise).kinds[0].kind, 'shirt');
  h.recognizer.dispose();
});

test('candidate protocol ignores unknown values and invalid scores, deduplicates, and bounds OCR text', async () => {
  const h = harness({ ocrResult: { data: { text: 'A'.repeat(1600) } } });
  const promise = h.recognizer.analyze(image());
  h.completeVision(0, {
    kinds: [{ kind: 'm-oxford', score: 1 }, { kind: 'shirt', score: 0.7 }, { kind: 'shirt', score: 0.6 },
      { kind: 'pants', score: NaN }, { kind: 'dress', score: 5 }, { kind: 'knit', score: -1 }],
    colors: [{ color: 'imaginary', score: 1 }, { color: 'white', score: 0.5 }, { color: 'black', score: Infinity }],
  });
  const result = await promise;
  assert.deepEqual(result.kinds, [{ kind: 'shirt', label: '셔츠', score: 0.7 }]);
  assert.deepEqual(result.colors, [{ color: 'white', label: '화이트', score: 0.5 }]);
  assert.equal(result.text.length, 1200);
  h.recognizer.dispose();
});

test('multiple garments/background lead to crop request and clear both category and color suggestions', async () => {
  const h = harness(), promise = h.recognizer.analyze(image());
  h.completeVision(0, { ...candidateResult, requiresCrop: true });
  const result = await promise;
  assert.equal(result.requiresCrop, true);
  assert.deepEqual(result.kinds, []);
  assert.deepEqual(result.colors, []);
  assert.match(result.warnings.join(' '), /옷 한 벌/);
  assert.equal(result.text, 'PATAGONIA\nL');
  h.recognizer.dispose();
});

test('label mode runs only OCR and valid empty text does not manufacture identity', async () => {
  const h = harness({ ocrResult: { data: { text: '' } } });
  const result = await h.recognizer.analyze(image(), { mode: 'label' });
  assert.equal(h.workers.length, 0);
  assert.equal(result.model, null);
  assert.equal(result.text, '');
  assert.deepEqual(result.kinds, []);
  h.recognizer.dispose();
});

test('OCR succeeds independently when vision loading fails, and a new worker retries next time', async () => {
  const h = harness(), first = h.recognizer.analyze(image());
  h.workers[0].emit({ type: 'error', id: h.workers[0].messages[0].id, message: 'model unavailable' });
  const result = await first;
  assert.equal(result.text, 'PATAGONIA\nL');
  assert.deepEqual(result.kinds, []);
  assert.deepEqual(result.warnings, ['model unavailable']);
  assert.equal(h.workers[0].terminated, 1);
  const retry = h.recognizer.analyze(image());
  assert.equal(h.workers.length, 2);
  h.completeVision();
  assert.equal((await retry).kinds[0].kind, 'shirt');
  h.recognizer.dispose();
});

test('vision succeeds independently when OCR initialization fails', async () => {
  const h = harness({ ocrCreate: async () => { throw new Error('OCR unavailable'); } });
  const promise = h.recognizer.analyze(image());
  h.completeVision();
  const result = await promise;
  assert.equal(result.text, '');
  assert.equal(result.kinds[0].kind, 'shirt');
  assert.deepEqual(result.warnings, ['OCR unavailable']);
  h.recognizer.dispose();
});

test('no Worker/document environment gives a meaningful fallback error, not false recognition', async () => {
  const recognizer = createPhotoRecognizer();
  await assert.rejects(recognizer.analyze(image()), /브라우저.*분석.*지원하지 않습니다/);
  recognizer.dispose();
});

test('cancel rejects immediately, terminates handles and isolates late progress/results/errors from retry', async () => {
  const pending = deferred();
  const h = harness({ ocrCreate: async (options, workers) => {
    const worker = { options, terminated: 0, async recognize() { return pending.promise; }, async terminate() { this.terminated++; } };
    workers.push(worker); options.onCreated(worker); return worker;
  } });
  const first = h.recognizer.analyze(image());
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await turn();
  const oldVision = h.workers[0], oldOcr = h.ocrWorkers[0];
  h.recognizer.cancel();
  await rejected;
  assert.equal(oldVision.terminated, 1);
  assert.equal(oldOcr.terminated, 1);
  const progress = [], retry = h.recognizer.analyze(image(), { onProgress: (event) => progress.push(event) });
  oldVision.emit({ type: 'result', id: oldVision.messages[0].id, result: { kinds: [{ kind: 'dress', score: 1 }] } });
  oldVision.onerror();
  oldOcr.options.onProgress({ status: 'stale-ocr', progress: 1 });
  oldVision.emit({ type: 'progress', id: oldVision.messages[0].id, stage: 'stale-vision', progress: 1 });
  h.completeVision();
  pending.resolve({ data: { text: 'NEW' } });
  assert.equal((await retry).kinds[0].kind, 'shirt');
  assert.ok(!progress.some((event) => event.stage.startsWith('stale-')));
  h.recognizer.dispose();
});

test('cancel during asynchronous OCR bootstrap terminates the late handle and permits another job', async () => {
  const loading = deferred(), lateWorker = { terminated: 0, async recognize() { throw new Error('must not run'); }, async terminate() { this.terminated++; } };
  let calls = 0;
  const h = harness({ ocrCreate: async (options) => {
    if (++calls === 1) { await loading.promise; options.onCreated(lateWorker); return lateWorker; }
    return { async recognize() { return { data: { text: 'RETRY' } }; }, async terminate() {} };
  } });
  const first = h.recognizer.analyze(image()), rejected = assert.rejects(first, { name: 'AbortError' });
  h.recognizer.cancel();
  await rejected;
  const retry = h.recognizer.analyze(image());
  h.completeVision();
  assert.equal((await retry).text, 'RETRY');
  loading.resolve();
  await turn();
  assert.equal(lateWorker.terminated, 1);
  h.recognizer.dispose();
});

test('starting another photo cancels a pending job and preserves job ids across reused workers', async () => {
  const h = harness(), first = h.recognizer.analyze(image());
  const rejected = assert.rejects(first, { name: 'AbortError' });
  const second = h.recognizer.analyze(image());
  await rejected;
  assert.notEqual(h.workers[0].messages[0].id, h.workers[1].messages[0].id);
  h.completeVision();
  await second;
  const third = h.recognizer.analyze(image());
  assert.equal(h.workers.length, 2);
  assert.notEqual(h.workers[1].messages[0].id, h.workers[1].messages[1].id);
  h.completeVision();
  await third;
  h.recognizer.dispose();
});

test('cached OCR worker progress belongs to the current photo and throwing observers cannot break recognition', async () => {
  const h = harness(), first = h.recognizer.analyze(image());
  h.completeVision();
  await first;
  const progress = [], next = h.recognizer.analyze(image(), { onProgress: (event) => { progress.push(event); throw new Error('UI observer'); } });
  h.ocrWorkers[0].options.onProgress({ status: 'recognizing text', progress: 0.5 });
  h.completeVision();
  assert.equal((await next).kinds[0].kind, 'shirt');
  assert.ok(progress.some((event) => event.task === 'ocr' && event.progress === 0.5));
  assert.equal(h.ocrWorkers.length, 1);
  h.recognizer.dispose();
});

test('deadline retains a completed subtask, terminates stalled resources and allows retry', async () => {
  const h = harness({ timeoutMs: 15 });
  const partial = await h.recognizer.analyze(image());
  assert.equal(partial.text, 'PATAGONIA\nL');
  assert.deepEqual(partial.kinds, []);
  assert.match(partial.warnings.join(' '), /옷 종류.*시간.*초과/);
  assert.equal(h.workers[0].terminated, 1);
  assert.equal(h.ocrWorkers[0].terminated, 1);
  const retry = h.recognizer.analyze(image());
  h.completeVision();
  assert.equal((await retry).kinds[0].kind, 'shirt');
  h.recognizer.dispose();
});

test('deadline with both subtasks stalled rejects rather than completing unknown fields', async () => {
  const pending = deferred();
  const h = harness({ timeoutMs: 10, ocrCreate: async () => pending.promise });
  await assert.rejects(h.recognizer.analyze(image()), { name: 'TimeoutError' });
  assert.equal(h.workers[0].terminated, 1);
  h.recognizer.dispose();
});

test('dispose terminates completed cached workers, remains idempotent and forbids later analysis', async () => {
  const h = harness(), promise = h.recognizer.analyze(image());
  h.completeVision();
  await promise;
  h.recognizer.dispose();
  h.recognizer.dispose();
  assert.equal(h.workers[0].terminated, 1);
  assert.equal(h.ocrWorkers[0].terminated, 1);
  await assert.rejects(h.recognizer.analyze(image()), { name: 'InvalidStateError' });
});

test('default worker loads pinned public assets, analyzes local garment kinds, omits failed color prediction, and rejects URL inputs', async () => {
  const h = harness(), captured = h.recognizer.analyze(image());
  h.completeVision();
  await captured;
  const source = h.workers[0].source, calls = [], posted = [];
  assert.equal(h.workers[0].type, 'module');
  assert.match(source, /@huggingface\/transformers@3\.8\.1\/dist\/transformers\.min\.js/);
  assert.match(source, new RegExp(PHOTO_RECOGNITION_REVISION));
  const env = { backends: { onnx: { wasm: {} } } };
  const runtime = { env, async pipeline(task, model, options) {
    assert.equal(task, 'zero-shot-image-classification');
    assert.equal(model, PHOTO_RECOGNITION_MODEL);
    assert.equal(options.revision, PHOTO_RECOGNITION_REVISION);
    assert.equal(options.dtype, PHOTO_RECOGNITION_DTYPE);
    assert.equal(options.device, 'wasm');
    return async (blob, labels) => {
      assert.ok(blob instanceof Blob);
      calls.push({ blob, labels });
      return [{ label: labels[0], score: 0.6 }, { label: labels[1], score: 0.3 }];
    };
  } };
  const self = { OffscreenCanvas() {}, createImageBitmap() {}, postMessage: (data) => posted.push(data) };
  vm.runInNewContext(source.replace('import(config.runtime)', 'Promise.resolve(testRuntime)'), { self, Blob, testRuntime: runtime });
  const localBlob = image();
  await self.onmessage({ data: { type: 'analyze', id: 'real-protocol', blob: localBlob } });
  assert.equal(env.allowLocalModels, false);
  assert.equal(env.backends.onnx.wasm.numThreads, 1);
  assert.equal(env.backends.onnx.wasm.proxy, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].blob, localBlob);
  assert.equal(calls[0].labels.length, PHOTO_RECOGNITION_KIND_LABELS.length + PHOTO_RECOGNITION_KIND_ALIASES.length + PHOTO_RECOGNITION_DISTRACTORS.length);
  const actualResult = posted.find((data) => data.type === 'result').result;
  assert.equal(actualResult.kinds[0].kind, 'shirt');
  assert.deepEqual(Array.from(actualResult.colors), []);
  assert.ok(!posted.some((data) => data.stage === 'color-analysis'));
  await self.onmessage({ data: { type: 'analyze', id: 'remote-input', blob: 'https://private.example/photo.jpg' } });
  assert.equal(calls.length, 1);
  assert.ok(posted.some((data) => data.id === 'remote-input' && data.type === 'error'));
  h.recognizer.dispose();
});

test('default browser OCR uses documented separate worker with fixed library/core/language paths and local input', async () => {
  const moduleSource = fs.readFileSync(new URL('../src/photo-recognition.js', import.meta.url), 'utf8')
    .replace(/^export\s+/gm, '');
  const scripts = [], localWorkers = [], urls = [], revoked = [], ocrCalls = [];
  class LocalWorker {
    constructor(url, options) { this.url = url; this.options = options; this.messages = []; this.terminated = 0; localWorkers.push(this); }
    postMessage(data) { this.messages.push(data); }
    terminate() { this.terminated++; }
  }
  const ocr = {
    terminated: 0, parameters: null,
    async setParameters(parameters) { this.parameters = parameters; },
    async recognize(blob) { ocrCalls.push(blob); return { data: { text: 'NIKE' } }; },
    async terminate() { this.terminated++; },
  };
  const context = vm.createContext({
    Blob, URL: { createObjectURL(blob) { const url = `blob:test-${urls.length}`; urls.push({ url, blob }); return url; }, revokeObjectURL(url) { revoked.push(url); } },
    Worker: LocalWorker, setTimeout, clearTimeout,
    document: { createElement(tag) { assert.equal(tag, 'script'); return { remove() {} }; }, head: { appendChild(script) { scripts.push(script); queueMicrotask(() => script.onload()); } } },
    Tesseract: { PSM: { SPARSE_TEXT: '11' }, async createWorker(...args) { ocrCalls.push(args); return ocr; } },
  });
  vm.runInContext(`${moduleSource}\nglobalThis.testRecognizer = createPhotoRecognizer();`, context);
  const blob = image(), promise = context.testRecognizer.analyze(blob);
  await turn();
  const worker = localWorkers[0];
  worker.onmessage({ data: { type: 'result', id: worker.messages[0].id, result: candidateResult } });
  const result = await promise;
  assert.equal(result.text, 'NIKE');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js');
  assert.equal(localWorkers.length, 1, 'the model worker is created by the app; OCR creates its own worker via the library');
  assert.equal(worker.options.type, 'module');
  const [langs, oem, options] = ocrCalls[0];
  assert.deepEqual(Array.from(langs), ['eng', 'kor']);
  assert.equal(oem, 1);
  assert.equal(options.workerPath, 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js');
  assert.equal(options.corePath, 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0');
  assert.equal(options.langPath, 'https://tessdata.projectnaptha.com/4.0.0');
  assert.equal(ocrCalls[1], blob);
  assert.equal(ocr.parameters.tessedit_pageseg_mode, '11');
  context.testRecognizer.dispose();
  assert.equal(ocr.terminated, 1);
  assert.deepEqual(revoked, [worker.url]);
});

test('worker maps tested jacket/hoodie aliases to existing kinds and offers distinct choices', async () => {
  const h = harness(), captured = h.recognizer.analyze(image());
  h.completeVision();
  await captured;
  const posted = [], env = { backends: { onnx: { wasm: {} } } };
  const runtime = { env, async pipeline() {
    return async (_, labels) => labels.includes('denim jacket') ? [
      { label: 'denim jacket', score: 0.7 }, { label: 'jacket', score: 0.1 },
      { label: 'hoodie', score: 0.09 }, { label: 'sweatshirt', score: 0.05 },
      { label: 'coat', score: 0.04 },
    ] : [{ label: labels[0], score: 0.6 }];
  } };
  const self = { OffscreenCanvas() {}, createImageBitmap() {}, postMessage: (data) => posted.push(data) };
  vm.runInNewContext(h.workers[0].source.replace('import(config.runtime)', 'Promise.resolve(testRuntime)'), { self, Blob, testRuntime: runtime });
  await self.onmessage({ data: { type: 'analyze', id: 'aliases', blob: image() } });
  const result = posted.find((data) => data.type === 'result').result;
  assert.deepEqual(Array.from(result.kinds, (row) => row.kind), ['jacket', 'sweat', 'coat']);
  assert.equal(result.kinds[0].score, 0.7);
  assert.equal(result.kinds[1].score, 0.09);
  h.recognizer.dispose();
});

test('default OCR bootstrap cancelled before library readiness does not create an OCR worker', async () => {
  const moduleSource = fs.readFileSync(new URL('../src/photo-recognition.js', import.meta.url), 'utf8')
    .replace(/^export\s+/gm, '');
  const scripts = [], calls = [];
  class LocalWorker { postMessage() {} terminate() {} }
  const context = vm.createContext({
    Blob, URL: { createObjectURL() { return 'blob:local'; }, revokeObjectURL() {} },
    Worker: LocalWorker, setTimeout, clearTimeout,
    document: { createElement() { return { remove() {} }; }, head: { appendChild(script) { scripts.push(script); } } },
    Tesseract: { async createWorker() { calls.push('created'); } },
  });
  vm.runInContext(`${moduleSource}\nglobalThis.testRecognizer = createPhotoRecognizer();`, context);
  const promise = context.testRecognizer.analyze(image(), { mode: 'label' });
  const rejected = assert.rejects(promise, { name: 'AbortError' });
  context.testRecognizer.cancel();
  await rejected;
  scripts[0].onload();
  await turn();
  assert.equal(calls.length, 0);
  context.testRecognizer.dispose();
});
