import { communityBoard, COMMUNITY_LIMITS } from '../domain/community.js';

const string = value => typeof value === 'string' ? value : '';
const pieces = (rows, clip) => (Array.isArray(rows) ? rows : []).slice(0, COMMUNITY_LIMITS.piecesMax).map(p => ({
  kind: p.kind, color: p.color ?? null, label: clip ? string(p.label).slice(0, COMMUNITY_LIMITS.pieceLabelMax) : string(p.label),
}));

// Form state contains public post fields only, never wardrobe ids, notes or links.
export function communityDraft(board, { post, share } = {}) {
  board = communityBoard(board);
  if (!board) throw Error('invalid community board');
  const sale = board === 'sale' ? post?.sale : null;
  return {
    board, title: string(post?.title), text: string(post?.text),
    pieces: board === 'outfits' ? pieces(post?.pieces ?? share, !post) : [],
    merchant: string(sale?.merchant), price: sale?.price == null ? '' : String(sale.price),
    discount: sale?.discount == null ? '' : String(sale.discount),
    endDate: string(sale?.endDate), sourceUrl: string(sale?.sourceUrl),
  };
}

export function numericCommunityField(raw, percent = false) {
  const text = string(raw).normalize('NFKC').trim();
  if (!text) return null;
  const cleaned = percent ? text.replace(/\s*%$/, '').trim() : text.replace(/[,\s₩원]/g, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : NaN;
}

export function communityPostInput(draft, consent = false) {
  const board = communityBoard(draft.board);
  if (!board) throw Error('invalid community board');
  return {
    text: string(draft.text), pieces: board === 'outfits' ? pieces(draft.pieces, false) : [], consent: consent === true,
    ...(board === 'outfits' ? {} : { board, title: string(draft.title) }),
    ...(board === 'sale' ? { sale: {
      merchant: string(draft.merchant), price: numericCommunityField(draft.price), discount: numericCommunityField(draft.discount, true),
      currency: 'KRW', endDate: string(draft.endDate), sourceUrl: string(draft.sourceUrl).trim(),
    } } : {}),
  };
}

export function communityDraftChanged(original, current, photos = 0) {
  return photos > 0 || JSON.stringify(original) !== JSON.stringify(current);
}
