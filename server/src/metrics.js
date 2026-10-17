// Pilot metrics (node cli.mjs metrics) from data the server already keeps:
// sign-up time, last use, and each synced wardrobe. The result holds counts
// only. No email, account id, garment, product, note or photo leaves this
// module, and a group of fewer than SMALL_GROUP accounts shows its size only
// unless the operator asks for small groups.
import { normalizeEmail } from './auth.js';

const DAY = 24 * 3600 * 1000;
const KST = 9 * 3600 * 1000; // Korea has no daylight saving time.
export const SMALL_GROUP = 5;
const ORDERED = new Set(['ordered', 'received', 'kept', 'returned']);

const at = (value) => {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
};

// Monday of the account's sign-up week, in Korean time, as YYYY-MM-DD.
export function signupWeek(createdAt) {
  const local = new Date(createdAt + KST);
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - ((local.getUTCDay() + 6) % 7) * DAY;
  return new Date(monday).toISOString().slice(0, 10);
}

function parseState(text) {
  try {
    const state = JSON.parse(text);
    return state && typeof state === 'object' ? state : null;
  } catch {
    return null;
  }
}

// What one account did, reduced to yes/no answers and counts before anything is summed.
function accountFacts(row, now) {
  const state = row.state ? parseState(row.state) : null;
  const garments = Array.isArray(state?.garments) ? state.garments.filter((g) => ['user', 'legacy'].includes(g?.source)) : [];
  const journeys = Array.isArray(state?.journeys) ? state.journeys : [];
  const firstWeek = row.created_at + 7 * DAY;
  const lastSeen = Math.max(row.created_at, row.last_seen_at ?? 0, row.updated_at ?? 0);
  const age = now - row.created_at;
  return {
    week: signupWeek(row.created_at),
    registered: garments.length > 0,
    // Garments added before signing up count: the app is used on the device first.
    activated: garments.filter((g) => (at(g.createdAt) ?? Infinity) <= firstWeek).length >= 5,
    compared: journeys.some((j) => (at(j?.history?.[0]?.at) ?? Infinity) <= firstWeek),
    wore: Array.isArray(state?.wears) && state.wears.length > 0,
    back7: age >= 14 * DAY ? lastSeen >= row.created_at + 7 * DAY : null,
    back21: age >= 28 * DAY ? lastSeen >= row.created_at + 21 * DAY : null,
    journeys: journeys.length,
    decided: journeys.filter((j) => j?.decision).length,
    ordered: journeys.filter((j) => ORDERED.has(j?.stage)).length,
    kept: journeys.filter((j) => j?.stage === 'kept').length,
    returned: journeys.filter((j) => j?.stage === 'returned').length,
  };
}

const share = (facts, key) => {
  const eligible = facts.filter((f) => f[key] !== null);
  return { count: eligible.filter((f) => f[key]).length, of: eligible.length };
};

function summarize(facts, { showSmall }) {
  if (facts.length < SMALL_GROUP && !showSmall) return { signups: facts.length, small: true };
  return {
    signups: facts.length,
    registered: share(facts, 'registered'),
    activated: share(facts, 'activated'),
    compared: share(facts, 'compared'),
    wore: share(facts, 'wore'),
    back7: share(facts, 'back7'),
    back21: share(facts, 'back21'),
  };
}

export function pilotMetrics(db, { now = Date.now(), exclude = [], showSmall = false } = {}) {
  const excluded = new Set();
  const byEmail = db.prepare("SELECT user_id FROM identities WHERE provider = 'email' AND subject = ?");
  for (const email of exclude) {
    const row = byEmail.get(normalizeEmail(email) || '');
    if (row) excluded.add(row.user_id);
  }
  const rows = db.prepare(`SELECT u.id, u.created_at, u.last_seen_at, w.state, w.updated_at
    FROM users u LEFT JOIN wardrobes w ON w.user_id = u.id`).all().filter((row) => !excluded.has(row.id));
  const facts = rows.map((row) => accountFacts(row, now));
  const weeks = [...new Set(facts.map((f) => f.week))].sort();
  const sum = (key) => facts.reduce((total, f) => total + f[key], 0);
  const weekAgo = now - 7 * DAY;
  // Excluded accounts (the operator's own, testers) are left out of every count.
  const ids = [...excluded];
  const others = ids.length ? ` AND user_id NOT IN (${ids.map(() => '?').join(',')})` : '';
  const one = (sql, ...params) => Object.values(db.prepare(sql).get(...params))[0];
  const purchasesShown = facts.length >= SMALL_GROUP || showSmall;
  return {
    generatedAt: new Date(now).toISOString(),
    excludedAccounts: excluded.size,
    smallGroup: SMALL_GROUP,
    overall: summarize(facts, { showSmall }),
    purchases: purchasesShown
      ? { journeys: sum('journeys'), decided: sum('decided'), ordered: sum('ordered'), kept: sum('kept'), returned: sum('returned') }
      : null,
    community: purchasesShown
      ? {
          members: one(`SELECT COUNT(*) FROM community_members WHERE 1${others}`, ...ids),
          postersLast7Days: one(`SELECT COUNT(DISTINCT user_id) FROM posts WHERE created_at >= ?${others}`, weekAgo, ...ids),
          postsLast7Days: one(`SELECT COUNT(*) FROM posts WHERE created_at >= ?${others}`, weekAgo, ...ids),
          reportsLast7Days: one(`SELECT COUNT(*) FROM post_reports WHERE created_at >= ?${others}`, weekAgo, ...ids),
          hiddenPosts: one(`SELECT COUNT(*) FROM posts WHERE hidden_at IS NOT NULL${others}`, ...ids),
        }
      : null,
    weeks: weeks.map((week) => ({ week, ...summarize(facts.filter((f) => f.week === week), { showSmall }) })),
  };
}

const ratio = ({ count, of }) => (of ? `${count}/${of} (${Math.round((count / of) * 100)}%)` : '아직 해당 없음');

export function formatMetrics(m) {
  const lines = [`어울 파일럿 지표 (${m.generatedAt.slice(0, 10)} 기준, 개인을 알아볼 수 있는 정보 없음)`];
  if (m.excludedAccounts) lines.push(`제외한 계정: ${m.excludedAccounts}개`);
  const group = (title, g) => {
    if (g.small) return [`${title}: 가입 ${g.signups}명 (${m.smallGroup}명 미만이라 비율을 숨겨요. 보려면 --show-small)`];
    return [
      `${title}: 가입 ${g.signups}명`,
      `  옷 1벌 이상 등록            ${ratio(g.registered)}`,
      `  활성화(7일 안에 5벌 이상)   ${ratio(g.activated)}`,
      `  7일 안에 "내 옷과 비교"     ${ratio(g.compared)}`,
      `  착용 기록 1번 이상          ${ratio(g.wore)}`,
      `  7일 뒤에도 사용(가입 14일 지난 계정)   ${ratio(g.back7)}`,
      `  21일 뒤에도 사용(가입 28일 지난 계정)  ${ratio(g.back21)}`,
    ];
  };
  lines.push('', ...group('전체', m.overall));
  if (m.purchases) {
    const p = m.purchases;
    lines.push('', `구매 판단: 비교 ${p.journeys}건, 판단(산다·보류·안 산다) ${p.decided}건, 주문 기록 ${p.ordered}건, 보관 ${p.kept}건, 반품 ${p.returned}건`);
  }
  if (m.community) {
    const c = m.community;
    lines.push(`회원 코디: 회원 ${c.members}명, 지난 7일 글쓴 회원 ${c.postersLast7Days}명·글 ${c.postsLast7Days}개·신고 ${c.reportsLast7Days}건, 숨김 글 ${c.hiddenPosts}개`);
  }
  if (m.weeks.length) {
    lines.push('', '가입 주(월요일, 한국 시각)별');
    for (const w of m.weeks) lines.push(...group(w.week, w));
  }
  lines.push('', '서버에 저장한 계정만 셉니다. 기기에만 저장하는 사용자는 포함되지 않아요.');
  return lines.join('\n');
}
