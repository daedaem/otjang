import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_KEY, OLD_STORE_KEY, BROKEN_KEY, DEFAULT_STATE, canStore, loadState, saveState, migrateState, makeBackup, parseBackup,
} from '../src/store.js';
import { PRODUCTS } from '../src/data/products.js';

// localStorage 대역: quota를 넘으면 브라우저처럼 예외를 던진다
function fakeStorage(init = {}, { quota = Infinity, blocked = false } = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (blocked) throw new Error('SecurityError');
      const size = [...map].reduce((s, [key, val]) => s + (key === k ? 0 : val.length), 0) + String(v).length;
      if (size > quota) throw new Error('QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };
}
const v2 = { v: 2, onboarded: true, gender: 'M', styles: ['classic'], closet: [{ id: 'a', slot: 'm-chino', color: 'beige' }], saved: [PRODUCTS[0].id] };

test('저장: 새 이름(eoul:v2)에만 쓰고, 첫 버전 이름(eoul:v1)은 읽기만 한다', () => {
  const old = JSON.stringify({ gender: 'M', style: 'classic', owned: ['m-oxford-white', 'm-chino'], onboarded: true });
  const s = fakeStorage({ [OLD_STORE_KEY]: old });
  const { state, from } = loadState(s);
  assert.equal(from, 'v1');
  assert.deepEqual(state.styles, ['classic']);
  assert.deepEqual(state.closet.map((i) => [i.slot, i.color]), [['m-oxford', 'white'], ['m-chino', 'beige']]);
  assert.ok(saveState(s, state));
  assert.equal(s.getItem(OLD_STORE_KEY), old, '첫 버전 자료는 그대로');
  assert.equal(loadState(s).from, 'v2');
});

test('저장: 공간이 부족하면 false를 돌려준다(성공한 척하지 않는다)', () => {
  const s = fakeStorage({}, { quota: 50 });
  assert.equal(saveState(s, { ...DEFAULT_STATE, ...v2 }), false);
  assert.equal(canStore(fakeStorage({}, { blocked: true })), false);
  assert.equal(canStore(fakeStorage()), true);
  assert.equal(canStore(null), false);
});

test('저장: 읽을 수 없는 자료는 지우지 않고 따로 남긴다', () => {
  const s = fakeStorage({ [STORE_KEY]: '{"closet": [' });
  const r = loadState(s);
  assert.equal(r.unreadable, '{"closet": [');
  assert.equal(s.getItem(BROKEN_KEY), '{"closet": [');
  assert.equal(r.state.onboarded, false);
});

test('저장: 알 수 없는 종류·색·상품·중복 ID는 걸러 낸다', () => {
  const s = migrateState({
    gender: 'X', styles: ['classic', 'nope', 'classic'], budget: -1, occasion: 'party',
    closet: [{ id: 'a', slot: 'nope' }, { id: 'b', slot: 'm-chino', color: 'rainbow', productId: 'ms-0' }, { id: 'b', slot: 'm-tee' }, null],
    saved: ['ms-0', PRODUCTS[0].id],
  });
  assert.equal(s.gender, null);
  assert.deepEqual(s.styles, ['classic']);
  assert.equal(s.budget, null);
  assert.equal(s.occasion, null);
  assert.equal(s.closet.length, 1);
  assert.equal(s.closet[0].color, 'beige');
  assert.equal(s.closet[0].productId, undefined);
  assert.deepEqual(s.saved, [PRODUCTS[0].id]);
});

test('백업: 옷장·찜·사진이 그대로 돌아온다', () => {
  const photo = `data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}`;
  const state = { ...DEFAULT_STATE, ...v2, closet: [{ id: 'a', slot: 'm-chino', color: 'beige', photo: true, addedAt: 1 }, { id: 'b', slot: 'm-tee', color: 'white', photo: false, addedAt: 2 }] };
  const data = makeBackup(state, new Map([['a', photo], ['orphan', photo]]), new Date('2026-10-14T00:00:00Z'));
  assert.deepEqual(Object.keys(data.photos), ['a'], '옷장에 없는 사진은 넣지 않는다');
  const r = parseBackup(JSON.stringify(data));
  assert.ok(r.ok);
  assert.equal(r.photos.get('a'), photo);
  assert.deepEqual(r.state.closet.map((i) => i.id), ['a', 'b']);
  assert.deepEqual(r.state.saved, v2.saved);
  assert.equal(r.exportedAt, '2026-10-14T00:00:00.000Z');
});

test('백업: 다른 파일·손상된 사진은 받아들이지 않는다', () => {
  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup(JSON.stringify({ format: 'other' })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ format: 'eoul-backup', version: 9, state: { closet: [] } })).ok, false);
  const r = parseBackup(JSON.stringify({
    format: 'eoul-backup', version: 1,
    state: { ...v2, closet: [{ id: 'a', slot: 'm-chino', color: 'beige', photo: true }] },
    photos: { a: 'javascript:alert(1)' },
  }));
  assert.ok(r.ok);
  assert.equal(r.photos.size, 0);
  assert.equal(r.state.closet[0].photo, false);
  assert.equal(r.missingPhotos, 1);
});
