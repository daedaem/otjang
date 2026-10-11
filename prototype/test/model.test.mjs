import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  demoItems,
  getOutfits,
  rankProducts,
  getGaps,
  serializeBackup,
  parseBackup,
  loadState,
  saveState,
  clearState,
} from '../src/model.js';
import { garmentSVG } from '../src/art.js';

test('personal state starts without example clothes, products or an invented budget', () => {
  const state = createState('personal');
  assert.equal(state.profile.budget, null);
  assert.equal(state.onboarded, false);
  assert.deepEqual([state.items, state.products, state.drafts], [[], [], []]);
  const demo = createState();
  demo.items[0].name = 'changed';
  assert.notEqual(demoItems[0].name, 'changed');
});

test('unconfirmed and unavailable items never enter outfits or product pairing evidence', () => {
  const state = createState();
  state.items
    .filter((item) => item.category === 'bottom')
    .forEach((item) => {
      item.confirmed = false;
    });
  state.items.find((item) => item.category === 'top').available = false;
  assert.deepEqual(getOutfits(state), []);
  const excluded = state.items
    .filter((item) => !item.confirmed || !item.available)
    .map((item) => item.id);
  for (const product of rankProducts(state))
    assert.ok(product.pairings.every((id) => !excluded.includes(id)));
  assert.ok(getGaps(state).some((gap) => gap.title.includes('하의 기록')));
});

test('style and occasion affect selection while identical inputs are reproducible', () => {
  const state = createState();
  const original = getOutfits(state);
  assert.deepEqual(original, getOutfits(state));
  state.profile.style = 'casual';
  state.profile.occasion = 'weekend';
  const weekend = getOutfits(state);
  assert.notDeepEqual(weekend[0].items, original[0].items);
  assert.ok(weekend[0].items.includes('demo-sneaker-white'));
  state.profile.occasion = 'work';
  assert.ok(getOutfits(state)[0].items.includes('demo-jacket-brown'));
});

test('existing outfit alternative precedes shopping and no item shortage implies a purchase', () => {
  assert.equal(getGaps(createState())[0].category, 'existing');
  assert.ok(
    getGaps(createState('personal')).every((gap) => gap.description.includes('이미 가진 옷')),
  );
});

test('budget overflow, missing price and unset budget stay distinct', () => {
  const state = createState();
  state.products[0].price = null;
  const ranked = rankProducts(state);
  assert.equal(ranked.find((item) => item.id === state.products[0].id).budgetState, 'unknown');
  assert.equal(ranked.at(-1).budgetState, 'over');
  state.profile.budget = null;
  assert.ok(rankProducts(state).every((item) => item.budgetState === 'unknown'));
  assert.ok(
    rankProducts(state).every((item) =>
      item.reasons.some((reason) => reason.includes('합성 예시')),
    ),
  );
});

test('backup roundtrip preserves references, decisions, draft metadata and photo omission', () => {
  const state = createState();
  const image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0AAAAABJRU5ErkJggg==';
  state.items[0].image = image;
  state.drafts.push({
    ...state.items[0],
    id: 'draft-one',
    confirmed: false,
    source: 'photo',
    sourceImage: image,
    region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    duplicateOf: state.items[0].id,
    selected: true,
    mergedImages: [image],
  });
  state.savedOutfits.push(getOutfits(state)[0]);
  state.savedProducts.push(state.products[0].id);
  state.decisions.push({
    id: 'decision-one',
    type: 'hold',
    productId: state.products[0].id,
    itemIds: [state.items[0].id],
    note: '실측 확인 후 결정',
  });
  assert.deepEqual(parseBackup(serializeBackup(state)), state);
  const stripped = parseBackup(serializeBackup(state, { includeImages: false }));
  assert.equal(stripped.items[0].image, undefined);
  assert.equal(stripped.drafts[0].sourceImage, undefined);
  assert.deepEqual(stripped.drafts[0].mergedImages, []);
  assert.equal(stripped.savedOutfits[0].items[0], state.savedOutfits[0].items[0]);
  assert.equal(state.items[0].image, image);
});

test('import rejects script URLs, SVG, prototype pollution and broken relationships', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://user:secret@example.com',
  ]) {
    const state = createState();
    state.products[0].url = url;
    assert.throws(() => parseBackup(JSON.stringify(state)));
  }
  const imageState = createState();
  imageState.items[0].image = 'data:image/svg+xml;base64,PHN2Zz4=';
  assert.throws(() => parseBackup(JSON.stringify(imageState)), /PNG/);
  imageState.items[0].image = 'data:image/png;base64,PHN2Zz4=';
  assert.throws(() => parseBackup(JSON.stringify(imageState)), /PNG/);
  const merged = createState();
  merged.items[0].mergedImages = ['https://example.com/tracking.png'];
  assert.throws(() => parseBackup(JSON.stringify(merged)), /PNG/);
  assert.throws(() => parseBackup('{"__proto__":{"polluted":true}}'), /데이터 키/);
  const referenceState = createState();
  referenceState.savedOutfits.push({ id: 'bad', items: ['missing'] });
  assert.throws(() => parseBackup(JSON.stringify(referenceState)), /없는 옷/);
  const decisionState = createState();
  decisionState.decisions.push({ productId: 'missing' });
  assert.throws(() => parseBackup(JSON.stringify(decisionState)), /없는 상품/);
  assert.equal({}.polluted, undefined);
});

test('invalid versions, malformed JSON and oversize images are rejected without mutating state', () => {
  const state = createState();
  const before = JSON.stringify(state);
  assert.throws(() => parseBackup('{'), /JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, schemaVersion: 2 })), /버전/);
  const large = createState();
  large.items[0].image = 'data:image/png;base64,' + 'a'.repeat(8 * 1024 * 1024);
  assert.throws(() => parseBackup(JSON.stringify(large)), /크기 제한/);
  assert.equal(JSON.stringify(state), before);
});

test('unsupported browser storage reports a failure rather than silently succeeding', async () => {
  const previous = globalThis.indexedDB;
  try {
    delete globalThis.indexedDB;
    await assert.rejects(loadState(), /IndexedDB/);
    await assert.rejects(saveState(createState()), /IndexedDB/);
  } finally {
    if (previous !== undefined) globalThis.indexedDB = previous;
  }
});

test('imports reject render-breaking enum values and object fields before persistence', () => {
  for (const collection of ['items', 'products']) {
    for (const [key, value] of [
      ['color', 'constructor'],
      ['color', '__proto__'],
      ['kind', { toString: 'not callable' }],
      ['brand', { toString: 'not callable' }],
      ['image', { toString: 'not callable' }],
    ]) {
      const state = createState();
      state[collection][0][key] = value;
      assert.throws(
        () => parseBackup(JSON.stringify(state)),
        `${collection}.${key} must be rejected`,
      );
    }
  }
  for (const key of ['style', 'occasion', 'fit']) {
    const state = createState();
    state.profile[key] = 'constructor';
    assert.throws(() => parseBackup(JSON.stringify(state)), /프로필/);
  }
  const review = createState();
  review.products[0].reviews[0].sourceLabel = { toString: 'not callable' };
  assert.throws(() => parseBackup(JSON.stringify(review)), /sourceLabel/);
  const decision = createState();
  decision.decisions.push({ type: 'hold', note: { toString: 'not callable' } });
  assert.throws(() => parseBackup(JSON.stringify(decision)), /메모/);
  for (const itemIds of ['', false, null]) {
    const malformed = createState();
    malformed.decisions.push({ type: 'wear', itemIds });
    assert.throws(() => parseBackup(JSON.stringify(malformed)), /없는 옷/);
  }
});

test('supported photo colors and legacy cream survive import and render', () => {
  for (const color of ['orange', 'purple', 'cream', 'ivory', 'unknown']) {
    const state = createState();
    state.items[0].color = color;
    state.products[0].color = color;
    const restored = parseBackup(JSON.stringify(state));
    assert.equal(restored.items[0].color, color);
    assert.match(garmentSVG(restored.items[0]), /^<svg/);
    assert.match(garmentSVG(restored.products[0]), /^<svg/);
  }
});

test('IndexedDB waits for transaction commit and a quota abort preserves previous data', async () => {
  const previous = globalThis.indexedDB;
  let stored;
  let failNextWrite = false;
  let commits = 0;
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          close() {},
          transaction() {
            const tx = {};
            function operation(kind, value) {
              const op = {};
              queueMicrotask(() => {
                if (kind === 'put' && failNextWrite) {
                  failNextWrite = false;
                  tx.error = { name: 'QuotaExceededError', message: 'quota' };
                  tx.onabort();
                  return;
                }
                op.result = kind === 'get' ? stored : undefined;
                op.onsuccess?.();
                queueMicrotask(() => {
                  if (kind === 'put') stored = structuredClone(value);
                  if (kind === 'delete') stored = undefined;
                  commits += 1;
                  tx.oncomplete();
                });
              });
              return op;
            }
            tx.objectStore = () => ({
              get: () => operation('get'),
              put: (value) => operation('put', value),
              delete: () => operation('delete'),
            });
            return tx;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  try {
    assert.equal(await loadState(), null);
    const original = createState();
    await saveState(original);
    assert.equal(commits, 2);
    assert.deepEqual(await loadState(), original);
    const changed = createState();
    changed.profile.budget = 1;
    failNextWrite = true;
    await assert.rejects(saveState(changed), /저장 공간/);
    assert.deepEqual(await loadState(), original);
    await clearState();
    assert.equal(await loadState(), null);
  } finally {
    if (previous === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previous;
  }
});

test('selected wardrobe item is included in every anchored outfit, including alternate shoes and outerwear', () => {
  const state = createState('demo');
  for (const item of state.items) {
    const outfits = getOutfits(state, 20, item.id);
    assert.ok(outfits.length > 0, `${item.id} should support an outfit`);
    assert.ok(outfits.every(outfit => outfit.items.includes(item.id)));
  }
});

test('missing, unconfirmed or unavailable anchor cannot produce a misleading outfit', () => {
  const state = createState('demo');
  const anchor = state.items[0];
  anchor.available = false;
  assert.deepEqual(getOutfits(state, 20, anchor.id), []);
  anchor.available = true;
  anchor.confirmed = false;
  assert.deepEqual(getOutfits(state, 20, anchor.id), []);
  assert.deepEqual(getOutfits(state, 20, 'missing'), []);
});
