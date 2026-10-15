// A shared outfit, as members of the same server see it.
//
// What leaves the device is the outfit's shape only: each piece's role, type,
// colour, brand and (when the piece is a listed catalog product) its product
// number. Garment IDs, purchase links, notes and wardrobe photo names never go.
// A photo goes only when the member ticks it and agrees for that post.
// The app and the server check a post with this same function.
import { SLOT_BY_ID, COLORS } from './data/slots.js';

export const COMMUNITY_RULES_VERSION = '2026-10-15.1';
export const COMMUNITY_RULES = [
  '이 서버에 가입한 회원끼리만 보는 공간이에요. 검색이나 외부 공유는 없어요.',
  '얼굴, 집 주소, 연락처처럼 나를 알아볼 수 있는 정보가 보이는 사진·글은 올리지 마세요.',
  '다른 사람의 사진이나 직접 찍지 않은 상품 사진은 올리지 마세요.',
  '광고·홍보, 욕설·비하는 삭제될 수 있어요.',
  '신고가 3건 모이면 운영자가 확인할 때까지 글이 숨겨져요. 운영자는 규칙에 맞지 않는 글을 지울 수 있어요.',
  '내 글은 언제든 지울 수 있고, 커뮤니티를 나가거나 계정을 지우면 내 글과 사진도 함께 지워져요.',
];
export const COMMUNITY_REPORT_REASONS = {
  privacy: '개인정보가 보여요',
  rights: '남의 사진이나 권리 침해',
  spam: '광고·도배',
  abuse: '욕설·비하',
  other: '기타',
};
export const MAX_POST_ITEMS = 8;
export const MAX_POST_PHOTOS = 4;
export const MAX_POST_PHOTO_BYTES = 800000;
export const MAX_CAPTION = 300;
const POST_ROLES = ['outer', 'top', 'inner', 'dress', 'bottom', 'shoes', 'acc'];
const POST_KINDS = new Set(Object.values(SLOT_BY_ID).map((slot) => slot.shape));

function postText(value, max) {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function postKeys(value, keys) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}
const postFail = (message) => { throw Object.assign(new Error(message), { code: 'invalid-post' }); };

/** Checks the look part of a post; photo indexes must point into photoCount photos. */
export function validateCommunityLook(look, photoCount = 0) {
  if (!postKeys(look, ['v', 'lookId', 'title', 'items']) || look.v !== 1)
    postFail('코디 형식을 읽지 못했어요.');
  if (!(look.lookId === null || (typeof look.lookId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(look.lookId))))
    postFail('코디 공식 정보가 올바르지 않아요.');
  if (!postText(look.title, 60) || !look.title.trim()) postFail('코디 이름을 확인해 주세요.');
  if (!Array.isArray(look.items) || !look.items.length || look.items.length > MAX_POST_ITEMS)
    postFail(`옷은 1~${MAX_POST_ITEMS}벌까지 올릴 수 있어요.`);
  const usedPhotos = new Set();
  for (const item of look.items) {
    if (!postKeys(item, ['role', 'slot', 'kind', 'color', 'brand', 'productId', 'photo'])) postFail('옷 정보 형식을 읽지 못했어요.');
    if (!POST_ROLES.includes(item.role)) postFail('옷의 역할이 올바르지 않아요.');
    if (!(item.slot === null || SLOT_BY_ID[item.slot])) postFail('옷 종류가 올바르지 않아요.');
    if (!POST_KINDS.has(item.kind) || (item.slot && SLOT_BY_ID[item.slot].shape !== item.kind)) postFail('옷 종류가 올바르지 않아요.');
    if (!(item.color === null || Object.hasOwn(COLORS, item.color))) postFail('옷 색이 올바르지 않아요.');
    if (!postText(item.brand, 60)) postFail('브랜드 이름을 확인해 주세요.');
    // Brand names only; a link or an address would carry more than the outfit.
    if (/https?:|www\.|@|\/\//i.test(item.brand)) postFail('브랜드에는 이름만 적어 주세요.');
    if (!(item.productId === null || (typeof item.productId === 'string' && /^ms-\d{1,16}$/.test(item.productId))))
      postFail('상품 번호가 올바르지 않아요.');
    if (item.photo !== null) {
      if (!Number.isInteger(item.photo) || item.photo < 0 || item.photo >= photoCount || usedPhotos.has(item.photo))
        postFail('사진 연결이 올바르지 않아요.');
      usedPhotos.add(item.photo);
    }
  }
  if (usedPhotos.size !== photoCount) postFail('옷과 연결되지 않은 사진이 있어요.');
  return look;
}

export function validateCaption(caption) {
  if (!postText(caption, MAX_CAPTION)) postFail(`한마디는 줄바꿈 없이 ${MAX_CAPTION}자까지 적을 수 있어요.`);
  return caption;
}

export function nameProblem(name) {
  if (typeof name !== 'string') return '이름을 적어 주세요.';
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 20) return '이름은 2~20자로 적어 주세요.';
  if (!/^[\p{L}\p{N}_.\- ]+$/u.test(trimmed)) return '이름에는 글자·숫자·공백·_.-만 쓸 수 있어요.';
  if (/@/.test(trimmed) || /\d{6,}/.test(trimmed)) return '이메일이나 전화번호처럼 보이는 이름은 쓸 수 없어요.';
  return '';
}

/**
 * The outfit as it would be shared, from an outfit result made of my own
 * garments. photoPicks is the set of garment IDs whose photo the member chose
 * to include; nothing else about a garment is copied.
 */
export function communityLookFrom(result, { photoPicks = new Set(), title = result.look.title } = {}) {
  let photo = 0;
  const photoOrder = [];
  const items = result.items.filter((row) => row.owned && row.item).slice(0, MAX_POST_ITEMS).map((row) => {
    const garment = row.item;
    const slot = SLOT_BY_ID[garment.slot] || null;
    const withPhoto = photoPicks.has(garment.id) && !!garment.photoId && photoOrder.length < MAX_POST_PHOTOS;
    if (withPhoto) photoOrder.push(garment.photoId);
    return {
      role: POST_ROLES.includes(row.role) ? row.role : 'top',
      slot: slot ? slot.id : null,
      kind: slot ? slot.shape : garment.kind,
      color: Object.hasOwn(COLORS, garment.color) ? garment.color : null,
      brand: (garment.brand || '').slice(0, 60),
      productId: garment.productId || null,
      photo: withPhoto ? photo++ : null,
    };
  });
  return { look: { v: 1, lookId: result.look.id || null, title: String(title).slice(0, 60), items }, photoIds: photoOrder };
}
