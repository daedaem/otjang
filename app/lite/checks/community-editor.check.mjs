import test from 'node:test';
import assert from 'node:assert/strict';
import { communityDraft, communityPostInput, numericCommunityField, communityDraftChanged } from '../src/community/editor-model.js';
import { readCommunityRoute, communityHref, communityRouteKey, rememberCommunityEntry, resumeCommunityEntry, COMMUNITY_RETURN_KEY } from '../src/community/navigation.js';
import { validateCommunityPost } from '../src/domain/community.js';

test('text board drafts never copy private wardrobe or share fields', () => {
  const share = [{ id: 'PRIVATE_ID', kind: 'shirt', color: 'white', label: 'PRIVATE_LABEL', url: 'https://private.example.com' }];
  const d = communityDraft('free', { share });
  assert.deepEqual(d.pieces, []);
  const body = communityPostInput({ ...d, title: '글', text: '내용', hidden: 'PRIVATE_NOTE' });
  assert.deepEqual(body, { board: 'free', title: '글', text: '내용', pieces: [], consent: false });
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE/);
});

test('outfit descriptors keep only public fields and an initial share is not a user edit', () => {
  const d = communityDraft('outfits', { share: [{ id: 'PRIVATE_ID', kind: 'shirt', color: 'white', label: '흰 셔츠' }] });
  assert.deepEqual(d.pieces, [{ kind: 'shirt', color: 'white', label: '흰 셔츠' }]);
  assert.equal(communityDraftChanged(d, structuredClone(d)), false);
  assert.equal(communityDraftChanged(d, { ...d, text: '변경' }), true);
  assert.equal(communityDraftChanged(d, d, 1), true);
  assert.deepEqual(Object.keys(communityPostInput(d)).sort(), ['consent', 'pieces', 'text']);
});

test('editing preserves both price and discount plus dates/source, without photo upload data', () => {
  const post = { title: '제보', text: '내용', pieces: [], photos: ['PRIVATE_PHOTO_ID'], sale: { merchant: '판매처', price: 39000, discount: 30, endDate: '2026-11-02', sourceUrl: 'https://shop.example.com/sale' } };
  const d = communityDraft('sale', { post });
  const body = communityPostInput({ ...d, title: '제목만 수정' }, true);
  assert.deepEqual(body.sale, { ...post.sale, currency: 'KRW' });
  assert.doesNotMatch(JSON.stringify(body), /PRIVATE_PHOTO_ID/);
  assert.equal(validateCommunityPost(body, { photos: 1 }).ok, true);
});

test('numeric input accepts explicit separators but never reinterprets exponent, decimal or other units', () => {
  assert.equal(numericCommunityField('39,000 원'), 39000);
  assert.equal(numericCommunityField('３０％', true), 30);
  assert.equal(numericCommunityField(''), null);
  for (const raw of ['3e4', '3.9만원', '39000.5', '-1', '무료']) assert.ok(Number.isNaN(numericCommunityField(raw)), raw);
});

test('community addresses keep board/mine explicit and never fall back from unknown input', () => {
  assert.deepEqual(readCommunityRoute('#/community?board=free&mine=1'), { board: 'free', mine: true });
  assert.equal(communityHref('outfits'), '#/community');
  assert.equal(communityHref('sale', true), '#/community?board=sale&mine=1');
  assert.equal(readCommunityRoute('#/community?board=unknown').board, null);
  assert.equal(readCommunityRoute('#/community?board=sale&mine=secret').board, null);
  assert.notEqual(communityRouteKey({ board: 'sale', mine: false }), communityRouteKey({ board: 'sale', mine: true }));
});

test('login return hints accept only a board and filter and consume once, never arbitrary redirects', () => {
  const map = new Map(), storage = { setItem: (k,v) => map.set(k,v), getItem: k => map.get(k), removeItem: k => map.delete(k) };
  rememberCommunityEntry(storage, { board: 'free', mine: true, privateNote: 'PRIVATE' });
  assert.doesNotMatch(map.get(COMMUNITY_RETURN_KEY), /PRIVATE/);
  assert.equal(resumeCommunityEntry(storage, '').href, '#/community?board=free&mine=1');
  assert.equal(map.size, 0);
  map.set(COMMUNITY_RETURN_KEY, JSON.stringify({ board: 'free', mine: false, next: 'https://evil.example.com' }));
  assert.equal(resumeCommunityEntry(storage, '').href, null);
  rememberCommunityEntry(storage, { board: 'free', mine: false });
  assert.deepEqual(resumeCommunityEntry(storage, '#/community?board=sale').route, { board: 'sale', mine: false });
});

test('new text boards preserve paragraphs while the existing outfit single-line rule stays the same', () => {
  assert.equal(validateCommunityPost({ board: 'free', title: '글', text: '첫 줄\n둘째 줄', pieces: [], consent: false }).post.text, '첫 줄\n둘째 줄');
  assert.equal(validateCommunityPost({ text: '첫 줄\n둘째 줄', pieces: [{ kind: 'shirt', color: 'white', label: '셔츠' }], consent: false }).post.text, '첫 줄 둘째 줄');
});
