// 코디 공유(커뮤니티) 글 형식. 화면과 서버가 같은 검사를 쓴다(대표 10-28 08:08, 설계 docs/log/2026-10/community-plan-20261028.md).
// 글에는 사진(직접 찍은 것, 올릴 때 동의), 한마디, 옷 조각(종류·색·짧은 이름)만 들어간다.
// 옷장 id·사진 이름·메모·구매 링크·상품 번호는 보내지 않는다. 다른 키가 있으면 거절한다.
import { GARMENT_KINDS } from './wardrobe.js';
import { COLORS } from './data/slots.js';

export const COMMUNITY_RULES_VERSION = 1;
export const COMMUNITY_LIMITS = Object.freeze({
  textMax: 200,
  piecesMax: 6,
  pieceLabelMax: 30,
  photosMax: 4,
  photoBytesMax: 600 * 1024, // 화면이 긴 변 1080px JPEG로 줄인 뒤의 크기
  nicknameMin: 2,
  nicknameMax: 20,
});
export const REPORT_REASONS = Object.freeze([
  ['not_fashion', '옷·코디와 관계없어요'],
  ['rights', '내 사진이거나 남의 사진을 허락 없이 썼어요'],
  ['private', '얼굴·주소 등 개인 정보가 보여요'],
  ['abuse', '욕설·혐오·괴롭힘'],
  ['ad', '광고·홍보'],
]);
export const COMMUNITY_RULES = Object.freeze([
  '직접 찍었거나 올려도 되는 사진만 올려 주세요.',
  '다른 사람 얼굴이 보이면 그 사람의 허락을 받아 주세요.',
  '광고·홍보, 욕설·혐오·괴롭힘은 숨겨질 수 있어요.',
  '신고가 쌓이면 운영자가 확인할 때까지 글이 숨겨져요.',
  '언제든 글을 지울 수 있고, 커뮤니티를 나가면 내 글과 사진이 모두 지워져요.',
]);

const KIND_IDS = new Set(GARMENT_KINDS.map((k) => k.id));
const tidy = (s) => (typeof s === 'string' ? s.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '');
const LINK = /https?:|www\.|\.(?:com|kr|net|io|co|me|ly)\b/i;
const exactKeys = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every((k) => keys.includes(k));

// 글 본문 검사. 성공하면 {ok:true, post}, 실패하면 {ok:false, message}.
// photos는 사진 개수만 본다(바이트 검사는 readPhoto). consent는 사진이 있을 때 반드시 true.
export function validateCommunityPost(input, { photos = 0 } = {}) {
  const no = (message) => ({ ok: false, message });
  if (!exactKeys(input, ['text', 'pieces', 'consent'])) return no('글 형식이 올바르지 않아요.');
  const text = tidy(input.text ?? '');
  if (text.length > COMMUNITY_LIMITS.textMax) return no(`한마디는 ${COMMUNITY_LIMITS.textMax}자까지 쓸 수 있어요.`);
  if (LINK.test(text)) return no('한마디에는 주소를 넣지 말아 주세요.');
  const raw = input.pieces ?? [];
  if (!Array.isArray(raw) || raw.length > COMMUNITY_LIMITS.piecesMax) return no(`옷은 ${COMMUNITY_LIMITS.piecesMax}벌까지 적을 수 있어요.`);
  const pieces = [];
  for (const p of raw) {
    if (!exactKeys(p, ['kind', 'color', 'label'])) return no('옷 정보 형식이 올바르지 않아요.');
    if (!KIND_IDS.has(p.kind)) return no('옷 종류를 목록에서 골라 주세요.');
    const color = p.color ?? null;
    if (color !== null && !Object.hasOwn(COLORS, color)) return no('색을 목록에서 골라 주세요.');
    const label = tidy(p.label ?? '');
    if (label.length > COMMUNITY_LIMITS.pieceLabelMax) return no(`옷 이름은 ${COMMUNITY_LIMITS.pieceLabelMax}자까지예요.`);
    if (LINK.test(label)) return no('옷 이름에는 주소를 넣지 말아 주세요.');
    pieces.push({ kind: p.kind, color, label });
  }
  if (!Number.isInteger(photos) || photos < 0 || photos > COMMUNITY_LIMITS.photosMax) return no(`사진은 ${COMMUNITY_LIMITS.photosMax}장까지 올릴 수 있어요.`);
  if (photos > 0 && input.consent !== true) return no('사진을 회원들에게 보여 주는 데 동의해 주세요.');
  if (!photos && !pieces.length) return no('사진이나 옷을 하나 이상 넣어 주세요.');
  if (!photos && !text && pieces.length < 2) return no('사진이 없으면 옷 두 벌 이상이나 한마디를 넣어 주세요.');
  return { ok: true, post: { text, pieces, consent: photos > 0 } };
}

// 이름: 2~20자, 글자·숫자·공백·_.- 만. 이메일·전화번호처럼 보이면 거절. 비교용 키는 NFKC·소문자·공백 제거.
export function validateNickname(raw) {
  const name = tidy(raw);
  if (name.length < COMMUNITY_LIMITS.nicknameMin || name.length > COMMUNITY_LIMITS.nicknameMax) return { ok: false, message: `이름은 ${COMMUNITY_LIMITS.nicknameMin}~${COMMUNITY_LIMITS.nicknameMax}자로 지어 주세요.` };
  if (!/^[\p{L}\p{N} _.-]+$/u.test(name)) return { ok: false, message: '이름에는 글자·숫자·공백·_ . - 만 쓸 수 있어요.' };
  if (/@/.test(name) || /\d{3,}[ .-]?\d{3,}/.test(name)) return { ok: false, message: '이메일·전화번호처럼 보이는 이름은 쓸 수 없어요.' };
  return { ok: true, name, key: name.toLowerCase().replace(/\s+/g, '') };
}

// JPEG 바이트만 받는다(화면이 다시 그려 메타데이터가 없는 JPEG). 머리(FF D8 FF)와 끝(FF D9), 크기만 확인한다.
export function isCommunityJpeg(bytes) {
  return bytes instanceof Uint8Array && bytes.length >= 4 && bytes.length <= COMMUNITY_LIMITS.photoBytesMax &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}

export const reportReasonIds = () => REPORT_REASONS.map(([id]) => id);
