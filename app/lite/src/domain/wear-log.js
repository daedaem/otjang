// What I wore, by date: the user's own record.
//
// One entry is one outfit on one day: the garments worn together, optionally
// the outfit formula it came from and a short note. A garment with no entries
// has no record yet; it is never called "not worn". Entries are kept until the
// user removes them; nothing here deletes history on its own.
export const MAX_WEAR_ENTRIES = 1000;
export const MAX_WEAR_GARMENTS = 12;
export const WEAR_RECENT_DAYS = 7;

const WEAR_KEYS = ['id', 'date', 'garmentIds', 'lookId', 'note', 'at'];

function wearInstant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function wearDateOK(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '2000-01-01' &&
    Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function validateWearEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      Object.keys(entry).length !== WEAR_KEYS.length || Object.keys(entry).some((key) => !WEAR_KEYS.includes(key)))
    throw new Error('착용 기록 형식을 읽지 못했어요. 원본을 보존했습니다.');
  if (typeof entry.id !== 'string' || !/^w_[A-Za-z0-9_-]{1,64}$/.test(entry.id) ||
      !wearDateOK(entry.date) || !wearInstant(entry.at) ||
      !(entry.lookId === null || (typeof entry.lookId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(entry.lookId))) ||
      typeof entry.note !== 'string' || entry.note.length > 200 || /[\u0000-\u001f\u007f]/.test(entry.note))
    throw new Error('착용 기록 정보를 확인해 주세요.');
  if (!Array.isArray(entry.garmentIds) || !entry.garmentIds.length || entry.garmentIds.length > MAX_WEAR_GARMENTS ||
      entry.garmentIds.some((id) => typeof id !== 'string' || !id || id.length > 100) ||
      new Set(entry.garmentIds).size !== entry.garmentIds.length)
    throw new Error('착용 기록의 옷 목록을 확인해 주세요.');
  return entry;
}

export function validateWears(wears) {
  if (!Array.isArray(wears) || wears.length > MAX_WEAR_ENTRIES)
    throw new Error(`착용 기록은 ${MAX_WEAR_ENTRIES}개까지 보관할 수 있어요. 오래된 기록을 정리해 주세요.`);
  const ids = new Set();
  for (const entry of wears) {
    validateWearEntry(entry);
    if (ids.has(entry.id)) throw new Error('착용 기록 ID가 중복됩니다.');
    ids.add(entry.id);
  }
  return wears;
}

/** This device's calendar date (the wearer's day, not UTC). */
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function newWearId() {
  return `w_${crypto.randomUUID()}`;
}
function wearFullError() {
  const error = new Error(`착용 기록이 ${MAX_WEAR_ENTRIES}개라 더 남길 수 없어요. 정리에서 오래된 기록을 지운 뒤 다시 남겨 주세요.`);
  error.code = 'wear-full';
  return error;
}

/**
 * Adds one outfit. The same garments on the same day are recorded once, so a
 * double tap or a retry never creates a second entry.
 */
export function addWear(wears, { date, garmentIds, lookId = null, note = '', at = new Date().toISOString(), id = newWearId() }) {
  const ids = [...new Set(garmentIds)];
  const key = [...ids].sort().join('|');
  const same = wears.find((entry) => entry.date === date && [...entry.garmentIds].sort().join('|') === key);
  if (same) return { wears, entry: same, added: false };
  if (wears.length >= MAX_WEAR_ENTRIES) throw wearFullError();
  const entry = validateWearEntry({ id, date, garmentIds: ids, lookId, note: note.trim(), at });
  return { wears: [...wears, entry], entry, added: true };
}

/**
 * "Wore it today" on one garment: adds it to that day's latest outfit, or takes
 * it out again when it is already there (an empty outfit is removed).
 */
export function toggleWornOn(wears, garmentId, { date, at = new Date().toISOString(), id = newWearId() }) {
  const holding = wears.filter((entry) => entry.date === date && entry.garmentIds.includes(garmentId));
  if (holding.length) {
    const drop = new Set(holding.map((entry) => entry.id));
    const next = wears.flatMap((entry) => {
      if (!drop.has(entry.id)) return [entry];
      const left = entry.garmentIds.filter((x) => x !== garmentId);
      return left.length ? [{ ...entry, garmentIds: left }] : [];
    });
    return { wears: next, worn: false };
  }
  const sameDay = wears.filter((entry) => entry.date === date && entry.garmentIds.length < MAX_WEAR_GARMENTS);
  if (sameDay.length) {
    const latest = sameDay.reduce((a, b) => (b.at > a.at ? b : a));
    return { wears: wears.map((entry) => entry.id === latest.id ? { ...entry, garmentIds: [...entry.garmentIds, garmentId] } : entry), worn: true };
  }
  return { wears: addWear(wears, { date, garmentIds: [garmentId], at, id }).wears, worn: true };
}

export function deleteWear(wears, id) {
  return wears.filter((entry) => entry.id !== id);
}

/** Per garment: how many recorded days and the latest one. */
export function wearStats(wears) {
  const stats = new Map();
  for (const entry of wears)
    for (const id of entry.garmentIds) {
      const row = stats.get(id) || { count: 0, last: null, days: new Set() };
      if (!row.days.has(entry.date)) {
        row.days.add(entry.date);
        row.count++;
      }
      if (!row.last || entry.date > row.last) row.last = entry.date;
      stats.set(id, row);
    }
  return new Map([...stats].map(([id, row]) => [id, { count: row.count, last: row.last }]));
}

/** The latest day these garments were all recorded in one outfit, or null. */
export function lastWornTogether(wears, garmentIds) {
  if (!garmentIds.length) return null;
  let last = null;
  for (const entry of wears)
    if (garmentIds.every((id) => entry.garmentIds.includes(id)) && (!last || entry.date > last)) last = entry.date;
  return last;
}

export function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
}

/**
 * Ready outfits not recorded together in the last WEAR_RECENT_DAYS come first;
 * the order is otherwise unchanged. Each result says when it was last recorded.
 */
export function orderByRecentWear(results, wears, today) {
  const rows = results.map((result, index) => {
    const ids = result.items.filter((row) => row.owned && row.item).map((row) => row.item.id);
    const last = lastWornTogether(wears, ids);
    const recent = !!last && daysBetween(last, today) >= 0 && daysBetween(last, today) < WEAR_RECENT_DAYS;
    return { result: { ...result, lastWorn: last, recentlyWorn: recent }, index, recent };
  });
  return rows.sort((a, b) => Number(a.recent) - Number(b.recent) || a.index - b.index).map((row) => row.result);
}

/** Entries grouped by month, oldest first, for cleanup. */
export function wearMonths(wears) {
  const months = new Map();
  for (const entry of wears) {
    const month = entry.date.slice(0, 7);
    const row = months.get(month) || { month, count: 0, ids: [] };
    row.count++;
    row.ids.push(entry.id);
    months.set(month, row);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}
