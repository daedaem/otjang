import { validateProfile } from './garment-profile.js';
// Versioned registration records live inside the core snapshot: one durable write
// commits the garment, its metadata and the idempotency receipt together.
export const REGISTRATION_SCHEMA = 2;
export function registrationInput(value) {
  if (value?.url !== undefined && typeof value.url !== 'string') throw new Error('링크를 다시 확인해 주세요.');
  const text = (key, min, max) => {
    const s = typeof value[key] === 'string' ? value[key].trim() : '';
    if (s.length < min || s.length > max) throw new Error('입력한 옷 정보를 다시 확인해 주세요.');
    return s;
  };
  const draftId = text('draftId', 1, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(draftId)) throw new Error('등록 번호를 다시 확인해 주세요.');
  const input = { draftId, brand: text('brand', 1, 80), name: text('name', 2, 80), kind: text('kind', 1, 40), color: text('color', 1, 40), url: text('url', 0, 2000) };
  if (input.url) {
    let url; try { url = new URL(input.url); } catch { throw new Error('링크를 다시 확인해 주세요.'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('링크는 https:// 또는 http://로 시작해야 해요.');
  }
  if (value.source) {
    if (value.source.provider !== 'opf' || !/^\d{6,24}$/.test(value.source.code)) throw new Error('상품 출처를 다시 확인해 주세요.');
    input.source = { provider: 'opf', code: value.source.code };
  }
  if (value.profile !== undefined) input.profile = validateProfile(value.profile, { kind: input.kind });
  return input;
}
export function readRegistrations(value) {
  if (value === undefined) return { v: REGISTRATION_SCHEMA, receipts: [] };
  if (![1, REGISTRATION_SCHEMA].includes(value?.v) || !Array.isArray(value.receipts) || value.receipts.length > 2000) throw new Error('unsupported_registration_schema');
  const ids = new Set();
  for (const r of value.receipts) {
    if (!r || typeof r.garmentId !== 'string' || typeof r.at !== 'string') throw new Error('invalid_registration');
    const input = registrationInput(r.input);
    if (ids.has(input.draftId)) throw new Error('duplicate_registration');
    ids.add(input.draftId);
  }
  return { ...structuredClone(value), v: REGISTRATION_SCHEMA };
}
