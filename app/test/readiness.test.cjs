// Real readiness semantics, independent of the assumed-confirmed scoring fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const W = require('../src/wardrobe.js');
const J = require('../src/judge.js');
const R = require('../src/recommend.js');
const C = require('../src/catalog.js');
const cases = require('./fixtures/readiness-cases.json');
const checked = (extra = {}) => W.cleanItem(Object.assign({ id: 'checked', status: 'owned', cat: 'top', kind: 'shirt', family: 'white', light: 95, formality: 3, pattern: 'solid', seasons: W.SEASONS, attrSource: 'owner-confirmed' }, extra), 0);
const bottom = checked({ id: 'bottom', cat: 'bottom', kind: 'denim', family: 'indigo', light: 16, formality: 2 });
const candidate = (extra = {}) => checked(Object.assign({ id: 'candidate', status: 'candidate' }, extra));

test('shared JS/Java readiness cases preserve unknowns and explicit legacy confirmation', () => {
  for (const c of cases) {
    const item = W.cleanItem(c.raw, 0), a = W.assessment(item, { season: c.season });
    assert.deepEqual(a.missing, c.missing, c.name); assert.equal(a.ready, c.ready, c.name);
    assert.deepEqual(W.cleanItem(JSON.parse(JSON.stringify(item)), 0), item, c.name + ': null-safe JSON round trip');
  }
});
test('unconfirmed candidate emits no made-up count or overlap and becomes assessable only after explicit review', () => {
  const draft = candidate({ attrSource: 'photo-draft' });
  const pending = J.judgeCandidate([bottom], draft);
  assert.equal(pending.status, 'needs-confirmation'); assert.deepEqual(pending.missing, ['confirmation']);
  assert.equal(pending.before, null); assert.equal(pending.after, null); assert.deepEqual(pending.added, []); assert.deepEqual(pending.overlaps, []);
  const confirmed = W.setAttrSource(draft, 'owner-confirmed');
  const ready = J.judgeCandidate([bottom], confirmed);
  assert.equal(ready.status, 'ready'); assert.equal(ready.added.length, 1); assert.equal(draft.attrSource, 'photo-draft');
});
test('owner-confirmed flag cannot make missing attributes assessable', () => {
  for (const field of ['kind', 'family', 'light', 'formality', 'pattern']) {
    const it = candidate({ [field]: null }); const v = J.judgeCandidate([bottom], it);
    assert.equal(it[field], null); assert.deepEqual(v.missing, [field]); assert.equal(v.after, null);
  }
});
test('only verified owned garments affect counts; review list explains every exclusion', () => {
  const draft = checked({ id: 'draft-bottom', cat: 'bottom', kind: 'chino', family: 'khaki', light: 62, attrSource: 'photo-draft' });
  const v = J.judgeCandidate([bottom, draft], candidate());
  assert.equal(v.status, 'partial'); assert.equal(v.assessedCount, 1); assert.equal(v.added.length, 1);
  assert.deepEqual(v.excludedItems.map((x) => [x.item.id, x.missing]), [['draft-bottom', ['confirmation']]]);
  const empty = J.judgeCandidate([draft], candidate()); assert.equal(empty.after, null); assert.equal(empty.assessedCount, 0);
});
test('13 original photo drafts remain drafts and cannot produce a fabricated outfit verdict', () => {
  const rawText = fs.readFileSync(__dirname + '/fixtures/wardrobe-v1.json', 'utf8');
  const w = W.cleanWardrobe(JSON.parse(rawText));
  assert.equal(w.items.length, 13); assert.ok(w.items.every((it) => !W.assessment(it).ready));
  const v = J.judgeCandidate(w.items, candidate()); assert.equal(v.after, null); assert.equal(v.excludedItems.length, 13);
  assert.equal(fs.readFileSync(__dirname + '/fixtures/wardrobe-v1.json', 'utf8'), rawText);
});
test('missing seasons are not quietly interpreted as all seasons', () => {
  const noSeason = checked({ id: 'no-season', seasons: [] });
  assert.equal(J.inSeason(noSeason, '겨울'), false); assert.equal(J.inSeason(noSeason, ''), true);
  const v = J.judgeCandidate([bottom, noSeason], candidate(), { season: '겨울' });
  assert.deepEqual(v.excludedItems.map((e) => e.missing), [['seasons']]);
  assert.equal(J.judgeCandidate([bottom], candidate({ seasons: [] }), { season: '겨울' }).after, null);
  assert.equal(J.inSeason(checked({ seasons: W.SEASONS }), '겨울'), true);
});
test('unknown/draft garments are excluded from score helpers and recommendation', () => {
  const missing = checked({ light: null }); const draft = checked({ attrSource: 'photo-draft' });
  assert.equal(R.scorePair(missing, bottom).score, null); assert.equal(R.scorePair(draft, bottom).score, null);
  assert.deepEqual(R.recommend([missing, draft, bottom]), []); assert.equal(R.recommend([checked(), missing, bottom]).length, 1);
});
test('unknown similarity and wardrobe slots are unassessed, not proven non-overlaps or missing purchases', () => {
  const draft = checked({ attrSource: 'photo-draft' });
  assert.equal(J.similarity(draft, checked()).overlap, null); assert.equal(J.matchKind(draft, checked()), '');
  const comparison = J.compareWardrobes([draft], [checked()]);
  assert.equal(comparison.status, 'partial'); assert.equal(comparison.unassessedMine.length, 1); assert.equal(comparison.both.length, 0);
});
test('catalog keeps unknown values, scores only assessable products, and does not inflate stale partial inputs', () => {
  const pending = C.cleanProduct({ id: 'a-unknown', name: 'Unknown product', cat: 'top' }, 0);
  for (const f of ['kind', 'family', 'light', 'formality', 'pattern']) assert.equal(pending[f], null);
  const product = C.cleanProduct(candidate({ id: 'z-ready', name: 'Known product' }), 0);
  const ranked = C.rank([bottom], [pending, product]);
  assert.deepEqual(ranked.map((r) => r.product.id), ['z-ready', 'a-unknown']); assert.equal(ranked[1].score, null); assert.equal(ranked[1].added, null);
  assert.equal(C.toCandidate(pending).light, null);
  assert.equal(C.rank([checked({ attrSource: 'photo-draft' })], [product])[0].score, null);
});
test('explicit zero brightness is not mistaken for an unknown value', () => {
  const black = checked({ light: 0, family: 'black' }); assert.equal(W.assessment(black).ready, true);
  assert.equal(typeof R.scorePair(black, bottom).score, 'number');
});
test('prototype-named enum values cannot bypass unknown sanitization', () => {
  assert.equal(W.cleanItem({ cat: '__proto__' }, 0), null);
  const fake = checked({ family: '__proto__', pattern: 'constructor', kind: 'toString' });
  assert.deepEqual(W.assessment(fake).missing, ['kind', 'family', 'pattern']);
});
test('concrete insight, baseline comparison and subsequent actual outcome survive JSON export/import with bounds', () => {
  const raw = { id: 'd', itemId: 'c', before: { lean: 'unsure' }, summary: { overlaps: 0, added: 1, blockers: 0 }, after: { decision: 'hold', helpful: 'some', insight: 'I can wear it with existing denim.', comparedWith: 'photos', comparisonNote: 'Photos made the silhouette clearer.' }, followup: { outcome: 'not-purchased', worn: 'no', regret: 'no', note: 'Budget mattered.', at: '2026-10-13' } };
  const clean = W.cleanDecision(raw); assert.equal(clean.after.insight, raw.after.insight); assert.equal(clean.after.comparedWith, 'photos');
  assert.deepEqual(clean.followup, raw.followup); assert.deepEqual(W.cleanDecision(JSON.parse(JSON.stringify(clean))), clean);
  const unsafe = W.cleanDecision(Object.assign({}, raw, { after: Object.assign({}, raw.after, { insight: 'x'.repeat(900), comparedWith: 'hack' }), followup: { outcome: 'purchased', worn: 'hack', regret: 'hack', note: 'x'.repeat(900), at: 'invalid' } }));
  assert.equal(unsafe.after.insight.length, 200); assert.equal(unsafe.after.comparedWith, 'none'); assert.equal(unsafe.followup.worn, 'unknown'); assert.equal(unsafe.followup.note.length, 300); assert.equal(unsafe.followup.at, '');
  assert.equal(W.cleanDecision(Object.assign({}, raw, { after: null })).followup, null);
});
