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

test('a saved edit yields the stored post at once: normalized text, next revision, untouched identity and photos', async () => {
  const { communityEditedPost } = await import('../src/community/editor-model.js');
  assert.equal(typeof communityEditedPost, 'function');
  const post = { id: 'p1', author: { name: '작성자' }, mine: true, text: '처음 본문', pieces: [], photos: ['PHOTO'], createdAt: 10, hidden: null, board: 'free', title: '처음 제목', sale: null, revision: 3, updatedAt: null };
  const before = structuredClone(post);
  const input = communityPostInput({ ...communityDraft('free', { post }), title: '  고친 제목 ', text: '고친 본문\n\n\n\n둘째 문단  ' }, true); // the editor sends consent for a post that already has photos
  const next = communityEditedPost(post, input, { ok: true, revision: 4 }, 99);
  const stored = validateCommunityPost(input, { photos: 1 }).post;
  assert.deepEqual(next, { ...post, title: stored.title, text: stored.text, sale: null, revision: 4, updatedAt: 99 });
  assert.equal(next.title, '고친 제목');
  assert.deepEqual(post, before);
  const sale = { merchant: '판매처', price: 39000, discount: null, currency: 'KRW', endDate: '', sourceUrl: '' };
  const salePost = { ...post, board: 'sale', sale };
  const edited = communityEditedPost(salePost, communityPostInput({ ...communityDraft('sale', { post: salePost }), price: '29,000' }, true), { ok: true, revision: 4 }, 99);
  assert.deepEqual(edited.sale, { ...sale, price: 29000 });
  const outfit = { ...post, board: undefined, title: undefined, sale: undefined, pieces: [{ kind: 'shirt', color: 'white', label: '셔츠' }], photos: [] };
  const line = communityEditedPost(outfit, communityPostInput({ ...communityDraft('outfits', { post: outfit }), text: '첫 줄\n둘째 줄' }), { ok: true, revision: 4 }, 99);
  assert.equal(line.text, '첫 줄 둘째 줄');
  assert.deepEqual(line.pieces, outfit.pieces);
  assert.equal(line.title, undefined);
  // Anything that is not a confirmed save changes nothing on screen.
  assert.equal(communityEditedPost(post, input, { code: 'conflict' }, 99), null);
  assert.equal(communityEditedPost(post, { ...input, title: '' }, { ok: true, revision: 4 }, 99), null);
});
