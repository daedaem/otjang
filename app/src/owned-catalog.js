// Search an existing catalog when the user explicitly identifies an owned item.
// This does not fetch a page, recognize a photo, or confirm ownership.
function ownedCatalogNormalize(value) {
  return String(value ?? '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

function ownedCatalogLooksLikeLink(value) {
  return /^[a-z][a-z\d+.-]*:/i.test(value) || /^\/\//.test(value) ||
    /(?:^|\s)(?:https?:\/\/|www\.|(?:[\w-]+\.)+(?:com|net|org|co|kr)(?:[/:?#]|$))/i.test(value);
}

function ownedCatalogLinkId(value) {
  // URL parsers normalize backslashes, controls, escaped hostnames and dot paths.
  // Only a literal supported HTTPS authority and product path count as an ID.
  if (/[\\\u0000-\u001f\u007f-\u009f]/u.test(value)) return null;
  const authority = value.match(/^https:\/\/([^/?#]+)(\/[^?#]*)(?:[?#][^\s]*)?$/i);
  if (!authority || !/^(?:(?:www|m)\.)?musinsa\.com(?::443)?$/i.test(authority[1])) return null;
  const path = authority[2].match(/^\/(?:products|app\/goods)\/([1-9]\d{0,15})\/?$/);
  return path?.[1] || null;
}

/**
 * Find user-entered brand/name text or an exact supported product identifier.
 * The caller supplies its catalog; shopping preferences are intentionally absent.
 * Results remain in source order and contain the original product references.
 */
export function findOwnedCatalog(query, products, { limit = 24 } = {}) {
  const raw = typeof query === 'string' || typeof query === 'number' ? String(query) : '';
  const input = raw.trim();
  const empty = (status) => ({ items: [], total: 0, status });
  if (!input) return empty('empty');
  if (/[\\\u0000-\u001f\u007f-\u009f]/u.test(raw)) return empty('unsupported-link');
  const catalog = Array.isArray(products) ? products.filter((product) => product && typeof product.id === 'string') : [];
  let matches;
  const identifier = input.normalize('NFC').toLowerCase();
  const explicitId = identifier.match(/^ms-(\d+)$/)?.[1];
  const bareNumber = identifier.match(/^(\d+)$/)?.[1];
  const exactNumber = bareNumber ? catalog.filter((product) => product.id === `ms-${bareNumber}`) : [];
  if (explicitId) {
    matches = catalog.filter((product) => product.id === `ms-${explicitId}`);
  } else if (exactNumber.length) {
    matches = exactNumber;
  } else if (ownedCatalogLooksLikeLink(input)) {
    const linkId = ownedCatalogLinkId(input);
    if (!linkId) return empty('unsupported-link');
    matches = catalog.filter((product) => product.id === `ms-${linkId}`);
  } else {
    const normalized = ownedCatalogNormalize(input);
    if (!normalized) return empty('empty');
    const tokens = normalized.split(' ');
    matches = catalog.filter((product) => {
      const text = ownedCatalogNormalize(`${product.brand ?? ''} ${product.name ?? ''}`);
      const compact = text.replace(/\s+/gu, '');
      return tokens.every((token) => text.includes(token) || compact.includes(token));
    });
  }
  const maximum = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 24;
  return { items: matches.slice(0, maximum), total: matches.length, status: matches.length ? 'match' : 'no-match' };
}
