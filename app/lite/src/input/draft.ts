import type { Registration } from './types';
export const DRAFT_KEY = 'eoul-d12-hang:input-draft:v1';
type StoredDraft = { v: 1; step: number; values: Registration; updatedAt: string };
export type DraftRead = { type: 'ready'; value: StoredDraft } | { type: 'blocked'; message: string } | null;
export function readDraft(): DraftRead {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw === null) return null;
    const x = JSON.parse(raw);
    const v = x?.values;
    if (x.v !== 1 || !Number.isInteger(x.step) || x.step < 0 || x.step > 2 || !v ||
      typeof v.draftId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(v.draftId) ||
      !['brand','name','kind','color','url'].every(k => typeof v[k] === 'string' && v[k].length <= (k === 'url' ? 2000 : 80)) ||
      (v.source && (v.source.provider !== 'opf' || !/^\d{6,24}$/.test(v.source.code))) ||
      typeof x.updatedAt !== 'string' || !Number.isFinite(Date.parse(x.updatedAt))) throw new Error();
    return { type: 'ready', value: { v: 1, step: x.step, updatedAt: x.updatedAt, values: {
      draftId: v.draftId, brand: v.brand, name: v.name, kind: v.kind, color: v.color, url: v.url,
      ...(v.source ? {source: {provider: 'opf', code: v.source.code}} : {}),
    } } };
  } catch { return { type: 'blocked', message: '이전에 쓰던 초안을 읽지 못했어요. 초안을 지우기 전까지 원문은 그대로 보관해요.' }; }
}
const assertWritable = () => { if (localStorage.getItem('eoul-backup:transaction') !== null) throw new Error('복원 복구를 먼저 진행해 주세요.'); };
export function writeDraft(values: Registration, step: number) {
  assertWritable();
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, values, step, updatedAt: new Date().toISOString() } satisfies StoredDraft));
}
export function clearDraft() { assertWritable(); localStorage.removeItem(DRAFT_KEY); }
