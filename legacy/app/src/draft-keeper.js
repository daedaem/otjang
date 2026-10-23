// Unsaved input survives this tab being reloaded.
//
// On phones, opening a seller page can push this tab out of memory; coming back
// reloads it and in-memory drafts are gone. The text of the open draft (never a
// password or a photo) is kept in sessionStorage for this tab only and offered
// back after a reload. Closing a sheet on purpose or saving removes it.
export const DRAFT_KEY = 'eoul:draft:v1';
const MAX_AGE_MS = 24 * 3600 * 1000;
const KINDS = new Set(['garment', 'candidate', 'journey', 'offer']);

export function keepDraft(storage, kind, data, now = new Date()) {
  if (!KINDS.has(kind)) return false;
  try {
    const text = JSON.stringify({ v: 1, kind, at: now.toISOString(), data });
    if (text.length > 64 * 1024) return false;
    storage?.setItem(DRAFT_KEY, text);
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(storage, now = new Date()) {
  try {
    const value = JSON.parse(storage?.getItem(DRAFT_KEY) || 'null');
    if (!value || value.v !== 1 || !KINDS.has(value.kind) || !value.data || typeof value.data !== 'object') return null;
    const at = Date.parse(value.at);
    if (!Number.isFinite(at) || now - at > MAX_AGE_MS) return null;
    return value;
  } catch {
    return null;
  }
}

export function dropDraft(storage) {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {}
}
