// Explicit operations helper: validates and exports SQL; never connects to a remote DB.
// Existing tables/rows/authentication are preserved. See the dated manifest and handover.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { validateCommunityPost, validateNickname, isCommunityJpeg, COMMUNITY_RULES_VERSION } from '../src/domain/community.js';

const root = new URL('../sample-data/community-20261029/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const quote = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const insert = (table, columns, values, condition = '') => `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) SELECT ${values.map(quote).join(', ')}${condition ? ' WHERE ' + condition : ''};`;
assert.equal(manifest.version, 1);
assert.equal(manifest.publisher.member, 'seed-community-20261029');
assert.equal(manifest.publisher.name, '운영 샘플');
assert.equal(validateNickname(manifest.publisher.name).key, manifest.publisher.nameKey);
assert.ok(Number.isSafeInteger(manifest.createdAt) && manifest.createdAt > 0);
assert.equal(manifest.posts.length, 6);
assert.equal(new Set(manifest.posts.flatMap(p => [p.id, p.photoId])).size, 12);
const imageData = new Map();
for (const entry of manifest.images) {
  assert.match(entry.file, /^[a-z-]+\.jpg$/);
  const bytes = await readFile(new URL(entry.file, root));
  assert.ok(isCommunityJpeg(bytes));
  assert.equal(bytes.length, entry.bytes);
  assert.equal(hash(bytes), entry.sha256);
  imageData.set(entry.file, bytes);
}
const { member, name, nameKey } = manifest.publisher;
const at = manifest.createdAt;
const sql = [insert('community_members', ['member', 'name', 'name_key', 'rules', 'joined_at'], [member, name, nameKey, COMMUNITY_RULES_VERSION, at])];
for (const board of ['outfits', 'sale', 'free']) assert.equal(manifest.posts.filter(p => p.post.board === board).length, 2);
for (const entry of manifest.posts) {
  assert.match(entry.id, /^6f202610-2900-4000-8000-00000000000[1-6]$/);
  assert.match(entry.photoId, /^6f202610-2901-4000-8000-00000000000[1-6]$/);
  assert.match(entry.post.text, /^\[(?:샘플|테스트 데이터)/);
  if (entry.post.board !== 'outfits') assert.match(entry.post.title, /^\[샘플\]/);
  const checked = validateCommunityPost(entry.post, { photos: 1 });
  assert.equal(checked.ok, true, checked.message);
  const p = checked.post, bytes = imageData.get(entry.image);
  assert.ok(bytes);
  if (p.sale) {
    assert.equal(p.sale.price, null); assert.equal(p.sale.sourceUrl, ''); assert.equal(p.sale.endDate, '');
    assert.match(p.sale.merchant, /실제 .*아님/); assert.match(p.text, /가상 수치/);
  }
  const samePost = `EXISTS (SELECT 1 FROM community_posts WHERE id=${quote(entry.id)} AND member=${quote(member)} AND text=${quote(p.text)})`;
  const samePublisher = `EXISTS (SELECT 1 FROM community_members WHERE member=${quote(member)} AND name=${quote(name)} AND name_key=${quote(nameKey)})`;
  sql.push(insert('community_posts', ['id','member','text','pieces','photos','created_at'], [entry.id,member,p.text,JSON.stringify(p.pieces),1,at], samePublisher));
  sql.push(insert('community_post_details', ['post','board','title','sale','revision','updated_at'], [entry.id,p.board,p.title || '',p.sale ? JSON.stringify(p.sale) : null,1,at], samePost));
  sql.push(insert('community_photos', ['id','post','member','idx','data','size','created_at'], [entry.photoId,entry.id,member,0,bytes.toString('base64'),bytes.length,at], samePost));
  sql.push(insert('community_post_usage', ['id','member','created_at'], ['post:'+entry.id,member,at], samePost));
}
// Each statement remains below D1's query-size limit. Retries only fill missing seed rows.
for (const statement of sql) assert.ok(Buffer.byteLength(statement) < 100_000);
const insertSql = sql.join('\n') + '\n';
const ids = manifest.posts.map(p => quote(p.id)).join(',');
const hideSql = `UPDATE community_posts SET hidden='operator', hidden_at=${at} WHERE member=${quote(member)} AND id IN (${ids});\n`;

if (process.argv[2] === '--sql' || process.argv[2] === '--hide-sql') {
  assert.ok(process.argv[3], 'Pass an explicit output file.');
  await writeFile(process.argv[3], process.argv[2] === '--sql' ? insertSql : hideSql);
  console.log(JSON.stringify({ file: process.argv[3], posts: 6, photos: 6, uniqueImages: 4, bytes: Buffer.byteLength(insertSql), remoteWrites: 0 }));
} else if (process.argv[2] === '--verify') {
  const { DatabaseSync } = await import('node:sqlite');
  const { handleCommunity } = await import('../functions/api/community.js');
  const raw = new DatabaseSync(':memory:');
  const db = { prepare(statement) { let args=[]; const st={bind(...values){args=values;return st;},async first(){return raw.prepare(statement).get(...args)??null;},async all(){return {results:raw.prepare(statement).all(...args)};},async run(){return {meta:{changes:Number(raw.prepare(statement).run(...args).changes)}};}}; return st; } };
  const request = async path => handleCommunity(new Request('https://qa.test/api/community/'+path), {COMMUNITY_MODE:'private',COMMUNITY_DB:db}, {member:'qa-reader',operator:true});
  assert.equal((await request('status')).status,200); // initializes the actual schema
  raw.exec("INSERT INTO community_members VALUES ('qa-reader','검증','검증',1,0); INSERT INTO community_posts (id,member,text,pieces,photos,created_at) VALUES ('unchanged','qa-reader','기존 글 보존','[]',0,1)");
  raw.exec(insertSql); raw.exec(insertSql);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n,7);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM community_photos').get().n,6);
  const existing = () => raw.prepare("SELECT * FROM community_posts WHERE id='unchanged'").get();
  const before = existing();
  for (const board of ['outfits','sale','free']) {
    const response=await request('feed?board='+board); assert.equal(response.status,200);
    const body=await response.json(); const examples=body.items.filter(p=>p.author.name===name);
    assert.equal(examples.length,2);
    for (const p of examples) {
      assert.equal(p.mine,false); assert.equal(p.photos.length,1);
      const photo=await request('photos/'+p.photos[0]); assert.equal(photo.status,200);
      assert.match(photo.headers.get('cache-control'),/no-store/);
      const bytes=Buffer.from(await photo.arrayBuffer());
      const entry=manifest.posts.find(e=>e.id===p.id);
      assert.equal(hash(bytes), hash(imageData.get(entry.image)));
    }
  }
  raw.exec(hideSql); assert.deepEqual(existing(),before);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM community_posts WHERE member='seed-community-20261029' AND hidden='operator'").get().n,6);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('member_accounts','member_sessions','app_primary_admin')").get().n,0);
  raw.close();
  console.log(JSON.stringify({manifest:fileURLToPath(root),validatedPosts:6,photoApiHashMatches:6,idempotentReplay:true,existingRowPreserved:true,hideOnlySamples:true,authTablesTouched:false,remoteWrites:0}));
} else {
  throw new Error('Use --verify, --sql <file>, or --hide-sql <file>. Remote execution is deliberately separate.');
}
