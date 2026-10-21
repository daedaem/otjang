import test from 'node:test';
import assert from 'node:assert/strict';
import { versionedAssetPath } from '../asset-version.mjs';

test('new script contents bypass an installed worker that ignores query parameters', () => {
  const original = '/shared/lite.js';
  const old = '/' + versionedAssetPath('shared/lite.js', Buffer.from('old client'));
  const current = '/' + versionedAssetPath('shared/lite.js', Buffer.from('new retailer client'));
  const cached = [original, old];
  const legacyMatch = (url) => cached.includes(new URL(url, 'https://app.example').pathname);
  assert.equal(legacyMatch(original + '?v=new'), true);
  assert.equal(legacyMatch(current), false);
  assert.notEqual(old, current);
  assert.equal(versionedAssetPath('shared/lite.js', Buffer.from('new retailer client')), current.slice(1));
});

test('module scripts keep their directory and extension after versioning', () => {
  assert.match(versionedAssetPath('shared/open-products.mjs', Buffer.from('module')), /^shared\/open-products\.[a-f0-9]{12}\.mjs$/);
});
