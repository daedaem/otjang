import { communityBoard, COMMUNITY_LIMITS, validateCommunityPost } from '../domain/community.js';

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

// The post to show the moment an edit is confirmed, without waiting for the list to be read again: the same
// normalization the server stores (validateCommunityPost), the revision it answered, and nothing else changed.
// Returns null unless the save is confirmed, so a failure or conflict never changes what the list shows.
export function communityEditedPost(post, input, result, at) {
  if (!post || result?.ok !== true || !Number.isSafeInteger(result.revision)) return null;
  const checked = validateCommunityPost(input, { photos: Array.isArray(post.photos) ? post.photos.length : 0 });
  if (!checked.ok) return null;
  const board = communityBoard(post.board);
  return {
    ...post, text: checked.post.text, revision: result.revision, updatedAt: at,
    ...(board === 'outfits' ? {} : { title: checked.post.title, sale: board === 'sale' ? checked.post.sale : null }),
  };
}

export function communityDraftChanged(original, current, photos = 0) {
  return photos > 0 || JSON.stringify(original) !== JSON.stringify(current);
}
