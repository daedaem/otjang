import crypto from 'node:crypto';
import path from 'node:path';

// Older installed workers match cached assets with ignoreSearch:true, so a query
// string cannot invalidate them. Change the pathname whenever script bytes change.
export function versionedAssetPath(rel, bytes) {
  const ext = path.posix.extname(rel);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  return `${rel.slice(0, -ext.length)}.${hash}${ext}`;
}
