// 이 기기에 저장하는 정보: 취향·옷장·찜은 localStorage, 옷 사진은 IndexedDB(main.js).
// 저장에 실패하면 성공한 것처럼 보이지 않도록 결과를 돌려준다. 백업 파일로 옮기고 되살릴 수 있다.

import { SLOT_BY_ID, STYLES, COLORS, OCCASIONS } from './data/slots.js';
import { PRODUCT_BY_ID } from './engine.js';

export const STORE_KEY = 'eoul:v2';
// 첫 버전과 다른 브랜치의 앱이 같이 쓰는 이름이라 읽기만 하고 덮어쓰지 않는다
export const OLD_STORE_KEY = 'eoul:v1';
export const BROKEN_KEY = 'eoul:v2:unreadable';

export const DEFAULT_STATE = {
  v: 2, onboarded: false, gender: null, styles: [], brands: [], brandOnly: false, occasion: null, budget: null,
  closet: [], saved: [], hidden: [], example: false, tab: 'home',
};

// 첫 버전(색이 붙은 종류 이름)에서 옮겨 오기
const OLD_SLOTS = {
  'm-oxford-white': ['m-oxford', 'white'], 'm-oxford-blue': ['m-oxford', 'blue'], 'm-tee-white': ['m-tee', 'white'], 'm-knit-crew': ['m-knit', 'navy'],
  'm-knit-cable': ['m-cable', 'ivory'], 'm-denim': ['m-denim-raw', 'indigo'], 'm-slacks-grey': ['m-slacks', 'grey'], 'm-slacks-wide': ['m-slacks', 'black'],
  'm-fatigue': ['m-work-pants', 'olive'], 'm-sneaker-leather': ['m-white-sneaker', 'white'], 'm-chuck': ['m-canvas', 'ivory'], 'm-nb': ['m-runner', 'grey'],
  'm-boots': ['m-chelsea', 'brown'], 'm-barbour': ['m-wax', 'olive'], 'f-shirt-white': ['f-shirt', 'white'], 'f-shirt-stripe': ['f-stripe', 'blue'],
  'f-maryjane': ['f-flat', 'black'],
};

const str = (x) => (typeof x === 'string' && x ? x : null);

function cleanItem(i, n) {
  if (!i || typeof i !== 'object' || !SLOT_BY_ID[i.slot]) return null;
  const slot = SLOT_BY_ID[i.slot];
  return {
    id: str(i.id) || `c${n}`,
    slot: slot.id,
    color: COLORS[i.color] ? i.color : slot.colors[0],
    brand: str(i.brand),
    ...(PRODUCT_BY_ID[i.productId] ? { productId: i.productId } : {}),
    photo: i.photo === true,
    ...(i.example ? { example: true } : {}),
    addedAt: Number.isFinite(i.addedAt) ? i.addedAt : 0,
  };
}

// 저장된 값(어느 버전이든)을 지금 앱이 쓰는 모양으로 바꾼다. 알 수 없는 값은 버린다.
export function migrateState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const gender = s.gender === 'M' || s.gender === 'F' ? s.gender : null;
  let styles = Array.isArray(s.styles) ? s.styles : [];
  if (!styles.length && s.style) styles = [{ casual: gender === 'F' ? 'casual' : 'cityboy' }[s.style] || s.style];
  let closet = Array.isArray(s.closet) ? s.closet : [];
  if (!closet.length && Array.isArray(s.owned)) {
    closet = s.owned.map((id, n) => {
      const [slot, color] = OLD_SLOTS[id] || [id, SLOT_BY_ID[id]?.colors?.[0]];
      return { id: `c${n}`, slot, color };
    });
  }
  const ids = new Set();
  const items = closet.map(cleanItem).filter((i) => i && !ids.has(i.id) && ids.add(i.id));
  return {
    v: 2,
    onboarded: !!s.onboarded,
    gender,
    styles: [...new Set(styles.filter((k) => STYLES[k]))].slice(0, 3),
    brands: [...new Set((Array.isArray(s.brands) ? s.brands : []).filter((b) => typeof b === 'string'))],
    brandOnly: !!s.brandOnly,
    occasion: OCCASIONS[s.occasion] ? s.occasion : null,
    budget: Number.isFinite(s.budget) && s.budget > 0 ? s.budget : null,
    closet: items,
    saved: [...new Set((Array.isArray(s.saved) ? s.saved : []).filter((id) => PRODUCT_BY_ID[id]))],
    hidden: (Array.isArray(s.hidden) ? s.hidden : []).filter((id) => typeof id === 'string'),
    example: !!s.example && items.some((i) => i.example),
  };
}

// 저장소를 쓸 수 있는지 (사생활 보호 모드·차단 설정에서는 쓰기가 막힌다)
export function canStore(storage) {
  if (!storage) return false;
  try {
    storage.setItem('eoul:probe', '1');
    storage.removeItem('eoul:probe');
    return true;
  } catch {
    return false;
  }
}

// { state, from: 'v2' | 'v1' | null, unreadable: 원문 | null }
export function loadState(storage) {
  let raw = null;
  let from = null;
  try {
    raw = storage?.getItem(STORE_KEY) ?? null;
    from = raw ? 'v2' : null;
    if (!raw) {
      raw = storage?.getItem(OLD_STORE_KEY) ?? null;
      from = raw ? 'v1' : null;
    }
  } catch {
    return { state: { ...DEFAULT_STATE }, from: null, unreadable: null };
  }
  if (!raw) return { state: { ...DEFAULT_STATE }, from: null, unreadable: null };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return { state: { ...DEFAULT_STATE, ...migrateState(parsed), tab: 'home' }, from, unreadable: null };
  } catch {
    // 읽지 못한 원문은 지우지 않고 따로 남겨 둔다
    if (from === 'v2') {
      try {
        if (!storage.getItem(BROKEN_KEY)) storage.setItem(BROKEN_KEY, raw);
      } catch {
        /* 남길 공간이 없으면 원래 자리에 그대로 둔다 */
      }
    }
    return { state: { ...DEFAULT_STATE }, from, unreadable: raw };
  }
}

// 성공하면 true. 공간 부족 등으로 실패하면 false (호출한 쪽이 화면을 되돌린다)
export function saveState(storage, state) {
  if (!storage) return false;
  try {
    const { tab, ...rest } = state;
    storage.setItem(STORE_KEY, JSON.stringify(rest));
    return true;
  } catch {
    return false;
  }
}

// ── 백업 파일: 옷장·찜·취향과 옷 사진을 JSON 파일 하나로
export const BACKUP_FORMAT = 'eoul-backup';
export const BACKUP_VERSION = 1;
const PHOTO_DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_PHOTO = 3_000_000; // 사진 한 장(base64 글자 수) 한도. 앱은 긴 변 720px JPEG로 저장한다

export function makeBackup(state, photos, now = new Date()) {
  const { tab, ...rest } = state;
  const ids = new Set(rest.closet.filter((i) => i.photo).map((i) => i.id));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    state: rest,
    photos: Object.fromEntries([...photos].filter(([id]) => ids.has(id))),
  };
}

// { ok, state, photos(Map), missingPhotos } 또는 { ok: false, error }
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: '백업 파일을 읽지 못했어요.' };
  }
  if (data?.format !== BACKUP_FORMAT) return { ok: false, error: '어울에서 만든 백업 파일이 아니에요.' };
  if (data.version !== BACKUP_VERSION) return { ok: false, error: '이 앱이 읽을 수 없는 버전의 백업이에요.' };
  if (!data.state || typeof data.state !== 'object' || !Array.isArray(data.state.closet)) return { ok: false, error: '백업 내용이 손상됐어요.' };
  const state = migrateState(data.state);
  const photos = new Map();
  let missingPhotos = 0;
  for (const item of state.closet) {
    if (!item.photo) continue;
    const p = data.photos?.[item.id];
    if (typeof p === 'string' && p.length <= MAX_PHOTO && PHOTO_DATA.test(p)) photos.set(item.id, p);
    else {
      item.photo = false;
      missingPhotos += 1;
    }
  }
  return { ok: true, state, photos, missingPhotos, exportedAt: str(data.exportedAt) };
}
