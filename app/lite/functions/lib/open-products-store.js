// Independent, redistributable ODbL snapshot. Never mix retailer or personal rows here.
import snapshot from '../../data/open-products/clothing.json' with { type: 'json' };
import { normalizeProduct, searchProducts, MAX_RECORDS } from '../../src/open-products.mjs';

const ready = new WeakMap();
let version;
const metadata = () => Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== 'items'));
const decode = (row) => normalizeProduct({ code: row.code, brands: row.brand, product_name: row.name, categories_tags: JSON.parse(row.categories) });
async function snapshotId() {
  version ||= crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot))).then((bytes) =>
    [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join(''));
  return version;
}
async function ensure(db) {
  if (!db?.prepare || !db?.batch) throw Error('open_database_unavailable');
  let pending = ready.get(db);
  if (!pending) {
    pending = (async () => {
      if (snapshot.license !== 'ODbL-1.0' || !snapshot.items.length || snapshot.items.length > MAX_RECORDS ||
        snapshot.items.some((p) => JSON.stringify(normalizeProduct({ code: p.code, brands: p.brand, product_name: p.name, categories_tags: p.categories })) !== JSON.stringify(p))) throw Error('invalid_open_snapshot');
      const id = await snapshotId();
      await db.batch([
        db.prepare('CREATE TABLE IF NOT EXISTS open_product_snapshots (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, count INTEGER NOT NULL)'),
        db.prepare('CREATE TABLE IF NOT EXISTS open_product_facts (snapshot TEXT NOT NULL, code TEXT NOT NULL, brand TEXT NOT NULL, name TEXT NOT NULL, categories TEXT NOT NULL, PRIMARY KEY (snapshot, code))'),
      ]);
      const stored = await db.prepare('SELECT count FROM open_product_snapshots WHERE id = ?').bind(id).first();
      if (!stored) {
        // D1 batch is transactional: marker and all rows commit together; concurrent isolates are idempotent.
        // <=100 bound parameters/statement and <50 queries/invocation on D1 Free.
        const inserts = [];
        for (let i = 0; i < snapshot.items.length; i += 20) {
          const rows = snapshot.items.slice(i, i + 20);
          inserts.push(db.prepare('INSERT OR IGNORE INTO open_product_facts (snapshot, code, brand, name, categories) VALUES ' + rows.map(() => '(?, ?, ?, ?, ?)').join(', '))
            .bind(...rows.flatMap((p) => [id, p.code, p.brand, p.name, JSON.stringify(p.categories)])));
        }
        await db.batch([
          ...inserts,
          db.prepare('INSERT OR IGNORE INTO open_product_snapshots (id, metadata, count) VALUES (?, ?, ?)').bind(id, JSON.stringify(metadata()), snapshot.items.length),
        ]);
      } else if (stored.count !== snapshot.items.length) throw Error('invalid_open_snapshot');
      return id;
    })();
    ready.set(db, pending);
  }
  try { return await pending; } catch (e) { ready.delete(db); throw e; }
}
export async function readOpenProducts(env) {
  const db = env?.CROWD_DB || env?.RANK_DB, id = await ensure(db);
  const { results } = await db.prepare('SELECT code, brand, name, categories FROM open_product_facts WHERE snapshot = ? ORDER BY code LIMIT ?').bind(id, MAX_RECORDS + 1).all();
  const items = results.map(decode);
  if (items.length !== snapshot.items.length || items.some((p) => !p)) throw Error('invalid_open_snapshot');
  return { ...metadata(), storage: 'D1', snapshot: id, items };
}
export async function findOpenProducts(env, query) {
  const data = await readOpenProducts(env);
  return { ...data, items: searchProducts(data.items, query) };
}
export async function openProductFacts(env, ids) {
  const data = await readOpenProducts(env), byId = new Map(data.items.map((p) => [p.code, p]));
  const items = ids.map((id) => byId.get(id));
  return items.every(Boolean) ? { source: data.source, license: data.license, fetchedAt: data.fetchedAt, items } : null;
}
