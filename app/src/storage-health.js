// What the browser says about keeping this site's data, and when the user last
// took a backup file. Nothing here can guarantee retention: the wardrobe lives
// only in this browser until a server backup exists.
//
// Sources (checked 2026-10-15):
// - WebKit, "Full Third-Party Cookie Blocking and More" (2020-03-24): Safari
//   deletes all script-writable storage after seven days of Safari use without
//   user interaction on the site; Home Screen web apps keep their own counter.
// - WebKit, "Updates to Storage Policy" (2023-08-10, Safari 17): the Storage
//   API is supported; persist() is granted by heuristics such as being opened
//   as a Home Screen web app; persistent origins are excluded from eviction.
// - MDN, "Storage quotas and eviction criteria" (modified 2026-01-05).

export const LAST_BACKUP_KEY = 'eoul:last-backup-at';
export const BACKUP_NUDGE_DAYS = 14;

export function isStandaloneApp(win = globalThis.window, nav = globalThis.navigator) {
  try {
    return !!(win?.matchMedia?.('(display-mode: standalone)')?.matches || nav?.standalone === true);
  } catch {
    return false;
  }
}

export function isAppleTouchBrowser(nav = globalThis.navigator) {
  const ua = String(nav?.userAgent || '');
  return /iPhone|iPad|iPod/.test(ua) || (nav?.platform === 'MacIntel' && Number(nav?.maxTouchPoints) > 1);
}

/** Read persistence and usage without asking for anything. */
export async function readStorageHealth(nav = globalThis.navigator) {
  const storage = nav?.storage;
  const health = { supported: !!storage?.persist, persisted: null, usage: null, quota: null };
  try {
    if (storage?.persisted) health.persisted = await storage.persisted();
  } catch {}
  try {
    if (storage?.estimate) {
      const { usage, quota } = await storage.estimate();
      if (Number.isFinite(usage)) health.usage = usage;
      if (Number.isFinite(quota)) health.quota = quota;
    }
  } catch {}
  return health;
}

/**
 * Ask the browser to keep this site's data. Safari and Chromium decide
 * silently from heuristics; Firefox may show a prompt. A refusal is normal.
 */
export async function requestPersistence(nav = globalThis.navigator) {
  try {
    if (!nav?.storage?.persist) return null;
    if (nav.storage.persisted && (await nav.storage.persisted())) return true;
    return !!(await nav.storage.persist());
  } catch {
    return null;
  }
}

export function lastBackupAt(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(LAST_BACKUP_KEY);
    const time = value ? Date.parse(value) : NaN;
    return Number.isFinite(time) ? new Date(time) : null;
  } catch {
    return null;
  }
}

export function markBackup(storage = globalThis.localStorage, now = new Date()) {
  try {
    storage?.setItem(LAST_BACKUP_KEY, now.toISOString());
  } catch {}
}

/** A real wardrobe with no recent backup file gets a gentle reminder. */
export function backupDue({ garmentCount, last, now = new Date() }) {
  if (garmentCount < 3) return false;
  if (!last) return true;
  return now - last > BACKUP_NUDGE_DAYS * 86400000;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}
