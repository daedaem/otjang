import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import { pilotMetrics, formatMetrics, signupWeek } from '../src/metrics.js';
import { newWardrobeState, makeGarment, validateWardrobe } from '../../app/src/wardrobe.js';
import { createPurchaseJourney, transitionPurchaseJourney } from '../../app/src/purchase-journey.js';
import { addWear } from '../../app/src/wear-log.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-metrics-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse('2026-10-15T03:00:00Z');
const iso = (t) => new Date(t).toISOString();
const candidate = () => ({
  productId: 'ms-728000', url: 'https://www.musinsa.com/products/728000', originalUrl: 'https://www.musinsa.com/products/728000',
  slot: 'm-oxford', kind: 'shirt', gender: 'm', color: 'white', colorSource: 'user',
  brand: '테스트 브랜드', name: '흰 셔츠', price: 33890, priceSource: 'user', checkedAt: '2026-10-14', source: 'user', classificationConfirmed: true,
});

function wardrobe({ garmentDays = [], journeyDay = null, ordered = false, wore = false }, signup) {
  const garments = garmentDays.map((day, i) => makeGarment({ id: `g${i}`, kind: 'shirt', gender: 'M', color: 'white', createdAt: iso(signup + day * DAY) }));
  const journeys = [];
  if (journeyDay !== null) {
    let journey = createPurchaseJourney(candidate(), { id: 'j1', at: iso(signup + journeyDay * DAY) });
    journey = transitionPurchaseJourney(journey, 'buy', { at: iso(signup + (journeyDay + 0.1) * DAY) });
    if (ordered) journey = transitionPurchaseJourney(journey, 'ordered', { at: iso(signup + (journeyDay + 0.2) * DAY) });
    journeys.push(journey);
  }
  const wears = wore && garments.length ? addWear([], { date: '2026-09-20', garmentIds: [garments[0].id], at: iso(signup + DAY) }).wears : [];
  const state = { ...newWardrobeState(), demo: false, demoSelected: [], garments, journeys, wears };
  validateWardrobe(state);
  return state;
}

function seed(db, accounts) {
  for (const a of accounts) {
    const signup = NOW - a.ageDays * DAY;
    db.prepare('INSERT INTO users (id, created_at, agreement_version, agreed_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .run(a.id, signup, 'v', signup, signup + (a.seenDay ?? 0) * DAY);
    db.prepare("INSERT INTO identities (provider, subject, user_id, email, password_hash, created_at) VALUES ('email', ?, ?, ?, 'x', ?)")
      .run(a.email.toLowerCase(), a.id, a.email, signup); // the server keeps the normalized address as the subject
    if (a.wardrobe) db.prepare('INSERT INTO wardrobes (user_id, revision, state, updated_at) VALUES (?, 1, ?, ?)')
      .run(a.id, JSON.stringify(wardrobe(a.wardrobe, signup)), signup + (a.syncDay ?? 0) * DAY);
  }
}

const ACCOUNTS = [
  // Garments added on the device before signing up count toward the first week.
  { id: 'u_active', email: 'active@example.com', ageDays: 40, seenDay: 25,
    wardrobe: { garmentDays: [-3, -2, 0, 1, 6], journeyDay: 2, ordered: true, wore: true } },
  { id: 'u_four', email: 'four@example.com', ageDays: 40, seenDay: 3, wardrobe: { garmentDays: [0, 1, 2, 3] } },
  { id: 'u_late', email: 'late@example.com', ageDays: 30, seenDay: 1, syncDay: 9, wardrobe: { garmentDays: [0, 1, 2, 3, 9], journeyDay: 8 } },
  { id: 'u_empty', email: 'empty@example.com', ageDays: 20, seenDay: 0 },
  { id: 'u_new', email: 'new@example.com', ageDays: 10, seenDay: 9, wardrobe: { garmentDays: [0, 0, 0, 0, 0], journeyDay: 0 } },
  { id: 'u_operator', email: 'Owner@Example.com', ageDays: 60, seenDay: 59,
    wardrobe: { garmentDays: [0, 0, 0, 0, 0, 0], journeyDay: 0, ordered: true, wore: true } },
];

test('pilot metrics count accounts by what they did, leaving out the operator', () => {
  const db = openDatabase(':memory:');
  seed(db, ACCOUNTS);
  db.prepare("INSERT INTO community_members (user_id, name, name_key, rules_version, joined_at) VALUES ('u_active', '가', '가', 'r', ?), ('u_operator', '운영', '운영', 'r', ?)").run(NOW, NOW);
  db.prepare("INSERT INTO posts (id, user_id, created_at, look, caption) VALUES ('p1', 'u_active', ?, '{}', ''), ('p2', 'u_operator', ?, '{}', '')").run(NOW - DAY, NOW - DAY);
  const m = pilotMetrics(db, { now: NOW, exclude: [' OWNER@example.com'] });

  assert.equal(m.excludedAccounts, 1);
  assert.deepEqual(m.overall, {
    signups: 5,
    registered: { count: 4, of: 5 },
    // u_late's fifth garment came on day 9; u_four has four.
    activated: { count: 2, of: 5 },
    compared: { count: 2, of: 5 },
    wore: { count: 1, of: 5 },
    // Only accounts 14 (28) days or older can answer; u_late's sync on day 9 counts as use.
    back7: { count: 2, of: 4 },
    back21: { count: 1, of: 3 },
  });
  assert.deepEqual(m.purchases, { journeys: 3, decided: 3, ordered: 1, kept: 0, returned: 0 });
  assert.deepEqual(m.community, { members: 1, postersLast7Days: 1, postsLast7Days: 1, reportsLast7Days: 0, hiddenPosts: 0 });
  // Every sign-up week has fewer than five accounts, so only their sizes show.
  assert.ok(m.weeks.length >= 3);
  assert.ok(m.weeks.every((w) => w.small && Object.keys(w).sort().join() === 'signups,small,week'));
  assert.equal(m.weeks.reduce((n, w) => n + w.signups, 0), 5);

  const text = formatMetrics(m);
  for (const secret of [...ACCOUNTS.flatMap((a) => [a.id, a.email]), 'owner@example.com', 'g0', 'j1', 'ms-728000', '흰 셔츠'])
    assert.ok(!text.includes(secret) && !JSON.stringify(m).includes(secret), `metrics must not include ${secret}`);
  assert.match(text, /활성화\(7일 안에 5벌 이상\)\s+2\/5 \(40%\)/);
  assert.match(text, /5명 미만이라 비율을 숨겨요/);
  db.close();
});

test('small groups show only their size unless the operator asks', () => {
  const db = openDatabase(':memory:');
  seed(db, ACCOUNTS.slice(0, 2));
  const hidden = pilotMetrics(db, { now: NOW });
  assert.deepEqual(hidden.overall, { signups: 2, small: true });
  assert.equal(hidden.purchases, null);
  assert.equal(hidden.community, null);
  const shown = pilotMetrics(db, { now: NOW, showSmall: true });
  assert.deepEqual(shown.overall.activated, { count: 1, of: 2 });
  assert.deepEqual(shown.weeks.map((w) => w.signups), [2]);
  assert.match(formatMetrics(pilotMetrics(openDatabase(':memory:'), { now: NOW })), /가입 0명/);
  db.close();
});

test('sign-up weeks start on Monday in Korean time', () => {
  assert.equal(signupWeek(Date.parse('2026-10-15T15:30:00Z')), '2026-10-12'); // Fri 00:30 KST
  assert.equal(signupWeek(Date.parse('2026-10-11T15:30:00Z')), '2026-10-12'); // Mon 00:30 KST
  assert.equal(signupWeek(Date.parse('2026-10-11T14:59:00Z')), '2026-10-05'); // Sun 23:59 KST
});

test('an older database learns each account\'s last use from its sessions', () => {
  const file = path.join(temp, 'v3.db');
  let db = openDatabase(file);
  db.exec('ALTER TABLE users DROP COLUMN last_seen_at; PRAGMA user_version = 3;');
  db.prepare("INSERT INTO users (id, created_at, agreement_version, agreed_at) VALUES ('a', 100, 'v', 100), ('b', 200, 'v', 200)").run();
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at) VALUES ('t1', 'a', 100, 500, 9999), ('t2', 'a', 100, 700, 9999)").run();
  db.close();
  db = openDatabase(file);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
  assert.deepEqual(db.prepare('SELECT id, last_seen_at FROM users ORDER BY id').all().map((r) => ({ ...r })),
    [{ id: 'a', last_seen_at: 700 }, { id: 'b', last_seen_at: 200 }]);
  db.close();
});
