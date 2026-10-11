import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, normalizeProductIdentity, normalizeProductURL, productSearchLink,
  serializeBackup, parseBackup,
} from '../src/model.js';

const photoItem = (identity = {}) => ({
  id: 'my-photo-knit', name: '자주 입는 니트', source: 'photo', category: 'top',
  kind: 'knit', color: 'navy', confirmed: true, available: true, ...identity,
});

test('a product reference never invents a brand or a confirmed identity', () => {
  const identity = normalizeProductIdentity({ productURL: 'https://www.ralphlauren.com/example' });
  assert.equal(identity.brand, '');
  assert.equal(identity.productName, '');
  assert.equal(identity.styleCode, '');
  assert.equal(identity.identityConfirmed, false);
  assert.throws(() => normalizeProductIdentity({ ...identity, identityConfirmed: true }), /먼저 입력/);
});

test('custom brand, exact product name, code and explicit confirmation survive private backup round trips', () => {
  const state = createState('personal');
  const identity = normalizeProductIdentity({
    brand: '  나만의 작은 브랜드  ', productName: 'Cotton Crewneck <2026>',
    styleCode: 'KN-26-NV', productURL: ' https://example.com/products/knit?color=navy#size ',
    identityConfirmed: true,
  });
  state.items.push(photoItem(identity));
  state.drafts.push({ ...photoItem(identity), id: 'review-next', confirmed: false, selected: true });
  for (const includeImages of [true, false]) {
    const restored = parseBackup(serializeBackup(state, { includeImages }));
    for (const key of ['brand', 'productName', 'styleCode', 'productURL', 'identityConfirmed']) {
      assert.deepEqual(restored.items[0][key], identity[key]);
      assert.deepEqual(restored.drafts[0][key], identity[key]);
    }
    assert.equal(restored.items[0].brand, '나만의 작은 브랜드');
    assert.equal(restored.items[0].kind, 'knit');
  }
});

test('reference URLs permit HTTP(S), reject active content and credentials at input and import', () => {
  assert.equal(normalizeProductURL('http://example.com/product'), 'http://example.com/product');
  assert.equal(normalizeProductURL('https://example.com/product'), 'https://example.com/product');
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>1</script>',
    'file:///tmp/photo.jpg', '//example.com/product', 'https://u:p@example.com/',
    'https://example.com/\nproduct', 'not a URL']) {
    assert.throws(() => normalizeProductURL(url), /상품 링크/);
    const state = createState('personal');
    state.items.push(photoItem({ productURL: url }));
    assert.throws(() => parseBackup(JSON.stringify(state)), /상품 링크|이미지/);
  }
});

test('the text search contains only entered identity fields, never a photo or its filename', () => {
  const item = photoItem({ name: 'private-person-bedroom.jpg · 전체 사진',
    image: 'data:image/jpeg;base64,private-image', brand: 'RRL', productName: 'Oxford shirt',
    styleCode: '123 & navy', productURL: 'https://private-reference.example/item' });
  for (const provider of ['google', 'naver']) {
    const result = productSearchLink(item, provider);
    const parsed = new URL(result.url);
    assert.equal(parsed.searchParams.get(provider === 'naver' ? 'query' : 'q'), 'RRL Oxford shirt 123 & navy');
    assert.ok(!result.url.includes('private'));
    assert.equal(parsed.protocol, 'https:');
  }
  assert.equal(productSearchLink({ name: item.name, image: item.image, productURL: item.productURL }), null);
});

test('malformed identity confirmation and oversize product fields cannot enter saved state', () => {
  for (const invalid of [{ identityConfirmed: 'yes' }, { identityConfirmed: true },
    { styleCode: 'x'.repeat(161) }, { productName: 'x'.repeat(301) }, { productURL: 12 }]) {
    const state = createState('personal');
    state.items.push(photoItem(invalid));
    assert.throws(() => serializeBackup(state));
  }
});
