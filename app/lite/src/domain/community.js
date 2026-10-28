// 코디 공유(커뮤니티) 글 형식. 화면과 서버가 같은 검사를 쓴다(대표 10-28 08:08, 설계 docs/log/2026-10/community-plan-20261028.md).
// 코디 규칙을 보존한다. 자유 글/세일 제보는 별도 필드이며 옷장 원문을 자동 복사하지 않는다.
// 세일 출처는 작성자가 직접 입력한 공개 HTTPS 주소다. 주소를 읽어 오거나 사실 여부를 확인하지 않는다.
import { GARMENT_KINDS } from './wardrobe.js';
import { COLORS } from './data/slots.js';

export const COMMUNITY_RULES_VERSION = 1;
export const COMMUNITY_BOARDS = Object.freeze([
  Object.freeze({ id: 'outfits', label: '코디 공유' }),
  Object.freeze({ id: 'sale', label: '세일 정보' }),
  Object.freeze({ id: 'free', label: '자유게시판' }),
]);
const BOARD_IDS = new Set(COMMUNITY_BOARDS.map(b => b.id));
export const communityBoard = value => value === undefined ? 'outfits' : BOARD_IDS.has(value) ? value : null;
export const COMMUNITY_LIMITS = Object.freeze({
  textMax: 200,
  piecesMax: 6,
  pieceLabelMax: 30,
  photosMax: 4,
  photoBytesMax: 600 * 1024, // 화면이 긴 변 1080px JPEG로 줄인 뒤의 크기
  nicknameMin: 2,
  nicknameMax: 20,
  titleMax: 80,
  merchantMax: 60,
  sourceUrlMax: 2048,
});
export const REPORT_REASONS = Object.freeze([
  ['not_fashion', '옷·코디와 관계없어요'],
  ['rights', '내 사진이거나 남의 사진을 허락 없이 썼어요'],
  ['private', '얼굴·주소 등 개인 정보가 보여요'],
  ['abuse', '욕설·혐오·괴롭힘'],
  ['ad', '상업 광고·무단 홍보'],
]);
export const COMMUNITY_RULES = Object.freeze([
  '직접 찍었거나 올려도 되는 사진만 올려 주세요.',
  '다른 사람 얼굴이 보이면 그 사람의 허락을 받아 주세요.',
  '세일 정보 제보는 나눌 수 있어요. 상업 광고·무단 홍보, 욕설·혐오·괴롭힘은 숨겨질 수 있어요.',
  '신고가 쌓이면 운영자가 확인할 때까지 글이 숨겨져요.',
  '언제든 글을 지울 수 있고, 커뮤니티를 나가면 내 글과 사진이 모두 지워져요.',
]);

const KIND_IDS = new Set(GARMENT_KINDS.map((k) => k.id));
const tidy = (s) => (typeof s === 'string' ? s.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '');
const paragraphs = s => typeof s === 'string' ? s.normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim() : '';
const LINK = /https?:|www\.|\.(?:com|kr|net|io|co|me|ly)\b/i;
const exactKeys = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every((k) => keys.includes(k));

// 링크 미리보기/서버 fetch는 하지 않는다. 로컬 주소·자격증명·다른 프로토콜을 게시 링크로 받지 않는다.
export function communitySourceUrl(raw) {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string' || raw.length > COMMUNITY_LIMITS.sourceUrlMax || /[\u0000-\u0020\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw), host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > COMMUNITY_LIMITS.sourceUrlMax) return null;
    if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)) return null;
    if (host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
    return url.href;
  } catch { return null; }
}

function saleDetails(raw) {
  const no = message => ({ ok: false, message });
  if (!exactKeys(raw, ['merchant', 'price', 'discount', 'endDate', 'sourceUrl', 'currency'])) return no('세일 정보 형식이 올바르지 않아요.');
  const merchant = tidy(raw.merchant);
  if (!merchant || merchant.length > COMMUNITY_LIMITS.merchantMax || LINK.test(merchant)) return no(`판매처 이름을 ${COMMUNITY_LIMITS.merchantMax}자 이내로 적어 주세요.`);
  if (raw.currency !== undefined && raw.currency !== 'KRW') return no('가격은 원(KRW) 단위로 적어 주세요. 다른 통화는 본문에 설명해 주세요.');
  const price = raw.price ?? null, discount = raw.discount ?? null;
  if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000)) return no('가격은 0~10억 원의 정수로 적어 주세요.');
  if (discount !== null && (!Number.isInteger(discount) || discount < 1 || discount > 100)) return no('할인율은 1~100%로 적어 주세요.');
  if (price === null && discount === null) return no('작성할 때 본 가격이나 할인율 중 하나를 적어 주세요.');
  const endDate = raw.endDate ?? '';
  if (typeof endDate !== 'string') return no('종료일을 달력에서 골라 주세요.');
  if (endDate) {
    const date = /^((?:19|20)\d{2}|2100)-(\d{2})-(\d{2})$/.exec(endDate);
    if (!date) return no('종료일을 달력에서 골라 주세요.');
    const d = new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])));
    if (d.toISOString().slice(0, 10) !== endDate) return no('실제로 있는 종료일을 골라 주세요.');
  }
  const sourceUrl = communitySourceUrl(raw.sourceUrl);
  if (sourceUrl === null) return no('출처는 계정 정보가 없는 공개 HTTPS 주소로 적어 주세요.');
  return { ok: true, sale: { merchant, price, discount, currency: 'KRW', endDate, sourceUrl } };
}

// 글 본문 검사. 성공하면 {ok:true, post}, 실패하면 {ok:false, message}.
// photos는 사진 개수만 본다(바이트 검사는 readPhoto). consent는 사진이 있을 때 반드시 true.
export function validateCommunityPost(input, { photos = 0 } = {}) {
  const no = (message) => ({ ok: false, message });
  if (!exactKeys(input, ['text', 'pieces', 'consent', 'board', 'title', 'sale'])) return no('글 형식이 올바르지 않아요.');
  const board = communityBoard(input.board);
  if (!board) return no('게시판을 목록에서 골라 주세요.');
  const title = tidy(input.title ?? '');
  if (title.length > COMMUNITY_LIMITS.titleMax) return no(`제목은 ${COMMUNITY_LIMITS.titleMax}자까지 적을 수 있어요.`);
  if (LINK.test(title)) return no('제목에는 주소를 넣지 말아 주세요.');
  if (board !== 'outfits' && !title) return no('제목을 적어 주세요.');
  if (board === 'outfits' && (title || input.sale != null)) return no('코디 공유에는 기존 한마디와 옷·사진을 써 주세요.');
  if (board === 'free' && input.sale != null) return no('가격·할인 정보는 세일 게시판에 적어 주세요.');
  const text = board === 'outfits' ? tidy(input.text ?? '') : paragraphs(input.text ?? '');
  if (text.length > COMMUNITY_LIMITS.textMax) return no(`한마디는 ${COMMUNITY_LIMITS.textMax}자까지 쓸 수 있어요.`);
  if (LINK.test(text)) return no('한마디에는 주소를 넣지 말아 주세요.');
  const raw = input.pieces ?? [];
  if (!Array.isArray(raw) || raw.length > COMMUNITY_LIMITS.piecesMax) return no(`옷은 ${COMMUNITY_LIMITS.piecesMax}벌까지 적을 수 있어요.`);
  if (board !== 'outfits' && raw.length) return no('이 게시판에는 옷장 조각을 자동으로 붙이지 않아요.');
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
  if (board === 'outfits') {
    if (!photos && !pieces.length) return no('사진이나 옷을 하나 이상 넣어 주세요.');
    if (!photos && !text && pieces.length < 2) return no('사진이 없으면 옷 두 벌 이상이나 한마디를 넣어 주세요.');
    // 오래된 호출자가 받던 정규화 결과도 유지한다.
    return { ok: true, post: { text, pieces, consent: photos > 0, ...(input.board === undefined ? {} : { board }) } };
  }
  if (board === 'free' && !text) return no('이야기할 내용을 적어 주세요.');
  if (board === 'sale') {
    const detail = saleDetails(input.sale);
    if (!detail.ok) return detail;
    return { ok: true, post: { board, title, text, pieces, consent: photos > 0, sale: detail.sale } };
  }
  return { ok: true, post: { board, title, text, pieces, consent: photos > 0 } };
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
