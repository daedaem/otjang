import { communityBoard } from '../domain/community.js';
export const COMMUNITY_RETURN_KEY = 'hangit:community-entry:v1';

export function readCommunityRoute(hash = '') {
  const [path, query = ''] = String(hash).replace(/^#/, '').split('?');
  if (path && path !== '/' && path !== '/community') return { board: null, mine: false };
  const params = new URLSearchParams(query);
  const board = communityBoard(params.has('board') ? params.get('board') : undefined);
  const mine = params.get('mine');
  return { board: mine && mine !== '1' && mine !== '0' ? null : board, mine: mine === '1' };
}

export function communityHref(board = 'outfits', mine = false) {
  if (!communityBoard(board)) throw Error('invalid community board');
  const query = new URLSearchParams();
  if (board !== 'outfits') query.set('board', board);
  if (mine) query.set('mine', '1');
  const text = query.toString();
  return '#/community' + (text ? '?' + text : '');
}

export const communityRouteKey = route => `${route.board ?? '!'}:${route.mine ? '1' : '0'}`;

// Same-tab login hint: only a board/filter, no content, ids, URL target or credential.
export function rememberCommunityEntry(storage, route) {
  if (!storage || !communityBoard(route?.board)) return;
  try { storage.setItem(COMMUNITY_RETURN_KEY, JSON.stringify({ board: route.board, mine: route.mine === true })); } catch {}
}

export function resumeCommunityEntry(storage, hash = '') {
  let saved;
  try { saved = storage?.getItem(COMMUNITY_RETURN_KEY); storage?.removeItem(COMMUNITY_RETURN_KEY); } catch {}
  const current = readCommunityRoute(hash);
  if (hash && hash !== '#' && hash !== '#/') return { route: current, href: null };
  try {
    const value = JSON.parse(saved);
    if (!value || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'board') || !Object.hasOwn(value, 'mine') || !communityBoard(value.board) || typeof value.mine !== 'boolean') return { route: current, href: null };
    return { route: value, href: communityHref(value.board, value.mine) };
  } catch { return { route: current, href: null }; }
}
