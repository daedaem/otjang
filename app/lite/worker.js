// Cloudflare Workers로 올릴 때의 입구(Workers Builds: `npx wrangler deploy`). Pages로 올리면 이 파일은 쓰지 않고 functions/를 쓴다.
// 정적 자산까지 반드시 이 입구를 지난다(assets.run_worker_first: true).
// 선택한 본인 인증(Access JWT 또는 서명 세션)을 검증하기 전에는 API/상품 자산을 보내지 않는다.
import { handle } from './functions/api/rank.js';
import { handleCatalog } from './functions/api/catalog.js';
import { handleWeather } from './functions/api/weather.js';
import { handleRakuten } from './functions/api/rakuten.js';
import { handleAdpick } from './functions/api/adpick.js';
import { handleOpenProducts } from './functions/api/open-products.js';
import { handleCommunity, publicMissing } from './functions/api/community.js';
import { handleMemberAuth, memberFromRequest } from './functions/lib/member-session.js';
import { handleMemberAccounts } from './functions/lib/member-accounts.js';
import { reserveRankBudget } from './functions/lib/rank-budget.js';
import { authorizePrivateRequest } from './functions/lib/private-access.js';
import { handlePrivateSession } from './functions/lib/private-session.js';

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

const sessionPaths = new Set(['/_private/login', '/_private/session', '/_private/status', '/_private/logout']);

function denied(access, request, env) {
  const status = access?.status === 401 ? 401 : 503;
  const session = env?.PRIVATE_AUTH_MODE === 'session';
  const url = new URL(request.url);
  const documentPath = url.pathname === '/' || /\.html?$/i.test(url.pathname) ||
    (!url.pathname.startsWith('/api/') && !/\.[^/]+$/.test(url.pathname));
  const htmlNavigation = request.method === 'GET' && documentPath &&
    (url.pathname === '/' || request.headers.get('sec-fetch-mode') === 'navigate' ||
      request.headers.get('accept')?.toLowerCase().includes('text/html'));
  if (session && status === 401 && htmlNavigation) {
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: '/_private/login' } });
  }
  return Response.json({
    error: status === 401 ? 'unauthorized' : 'not_configured',
    message: status === 401 ? '본인 전용 로그인이 필요해요.' : '비공개 접속 설정을 확인하고 있어요.',
    ...(session && status === 401 ? { login: '/_private/login' } : {}),
  }, { status, headers: privateHeaders });
}

const SHELL_CSP = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
async function publicFiles(env, url) {
  try {
    const res = await env.ASSETS.fetch(new Request(new URL('/community-public.json', url)));
    const body = res.ok ? await res.json() : null;
    return new Set(Array.isArray(body?.files) ? body.files : []);
  } catch { return new Set(); }
}
async function publicCommunity(request, env, url, { authorize, community, member, memberAuth }) {
  const path = url.pathname;
  if (path.startsWith('/_member/')) return memberAuth(request, env);
  if ((path === '/c' || path === '/c/') && request.method === 'GET') {
    // 정적 파일의 HTML 주소 정리가 /community-shell.html을 다른 주소로 돌려 답할 수 있어 한 번 따라간다(보안 검토 10-28).
    let asset = await env.ASSETS.fetch(new Request(new URL('/community-shell.html', url)));
    const moved = asset.status >= 300 && asset.status < 400 && asset.headers.get('location');
    if (moved) asset = await env.ASSETS.fetch(new Request(new URL(moved, url)));
    if (!asset.ok) return null;
    return new Response(asset.body, { status: 200, headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': SHELL_CSP, 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' } });
  }
  if (request.method === 'GET' && (await publicFiles(env, url)).has(path)) {
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    // 이름에 해시가 있는 /react/ 파일만 오래 묶어 둔다.
    response.headers.set('Cache-Control', path.startsWith('/react/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }
  if (path.startsWith('/api/community/')) {
    let access = null;
    try { access = await authorize(request, env); } catch {}
    if (access?.ok === true) return community(request, env, { member: 'owner', operator: true });
    // 회원 쿠키는 SameSite=Lax지만, 쓰기 요청은 같은 출처에서 온 것만 받는다.
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== url.origin) {
      return Response.json({ code: 'invalid_origin' }, { status: 403, headers: privateHeaders });
    }
    const id = await member(request, env).catch(() => null);
    return community(request, env, id ? { member: id, operator: false } : {});
  }
  return null;
}

const INVITE_PUBLIC = new Set(['/_member/signup', '/_member/signin', '/_member/password/signup', '/_member/password/signin']);
// 화면(HTML)에 역할 표시를 붙인다. 회원에게는 바깥 사진(무신사 등)을 막는 CSP를 더한다.
async function withRole(asset, role) {
  const type = asset.headers.get('content-type') || '';
  let response;
  if (asset.ok && type.includes('text/html')) {
    const html = (await asset.text()).replace('<head>', `<head><meta name="hangit-role" content="${role}">`);
    response = new Response(html, { status: asset.status, headers: asset.headers });
  } else response = new Response(asset.body, asset);
  for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
  if (role === 'member' && type.includes('text/html')) response.headers.set('Content-Security-Policy', "img-src 'self' data: blob:");
  return response;
}
async function memberApp(request, env, url, id, h) {
  const path = url.pathname;
  const write = !['GET', 'HEAD'].includes(request.method);
  if (write && request.headers.get('origin') !== url.origin) return Response.json({ code: 'invalid_origin' }, { status: 403, headers: privateHeaders });
  if (path.startsWith('/_member/invites')) return Response.json({ code: 'owner_only' }, { status: 403, headers: privateHeaders });
  if (path.startsWith('/_member/')) return h.accounts(request, env, { member: id });
  if (path.startsWith('/_private/')) return Response.json({ code: 'owner_only' }, { status: 403, headers: privateHeaders });
  if (path === '/api/rank') {
    if (request.method !== 'POST') return new Response('POST만 받아요.', { status: 405, headers: privateHeaders });
    return h.rank(request, env, { member: id, authorize: async () => ({ ok: true }), reserve: (e) => reserveRankBudget(e, { member: id }) });
  }
  if (path.startsWith('/api/community/')) return h.community(request, env, { member: id, operator: false });
  if (path.startsWith('/api/catalog/')) return h.catalog(request, env);
  if (path === '/api/rakuten') return h.rakuten(request, env);
  if (path === '/api/adpick' || path.startsWith('/api/adpick/')) return h.adpick(request, env);
  if (path === '/api/open-products' || path.startsWith('/api/open-products/')) return h.openProducts(request, env);
  if (path === '/api/weather') {
    if (request.method !== 'GET') return new Response('GET만 받아요.', { status: 405, headers: privateHeaders });
    return h.weather(request, env);
  }
  if (path.startsWith('/api/')) return Response.json({ code: 'not_found' }, { status: 404, headers: privateHeaders });
  return withRole(await env.ASSETS.fetch(request), 'member');
}

// Dependencies can only be supplied by code/tests. HTTP input and environment variables
// cannot replace or bypass authentication in the deployed default export.
export function createWorker({
  authorize = authorizePrivateRequest,
  rank = handle,
  catalog = handleCatalog,
  weather = handleWeather,
  rakuten = handleRakuten,
  adpick = handleAdpick,
  openProducts = handleOpenProducts,
  community = handleCommunity,
  member = memberFromRequest,
  memberAuth = handleMemberAuth,
  accounts = handleMemberAccounts,
  privateSession = handlePrivateSession,
} = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      // 코디 공유 공개(대표 10-28 08:08·11:47). COMMUNITY_MODE=public이고 운영자 정보·연락처·회원 로그인 설정이
      // 모두 있을 때만 /c 화면, 그 화면의 파일(빌드가 만든 허용 목록), 회원 로그인, 커뮤니티 API가 본인 로그인 없이 열린다.
      // 나머지 앱(상품 자료·옷장 화면·AI)은 그대로 본인 전용이다.
      if (env?.COMMUNITY_MODE === 'public' && publicMissing(env).length === 0) {
        const open = await publicCommunity(request, env, url, { authorize, community, member, memberAuth });
        if (open) return open;
      }
      const invite = env?.MEMBER_APP_MODE === 'invite';
      // 초대 회원 가입·로그인 화면(대표 10-28 15:12). 로그인 없이 열린다. 초대 코드가 있어야 가입된다.
      if (invite && INVITE_PUBLIC.has(url.pathname)) return accounts(request, env, {});
      // Only these exact authentication endpoints may answer before the private gate.
      // Their handler owns method/origin/credential validation. Access/default and
      // unknown modes retain their existing gate even on the login paths.
      if (env?.PRIVATE_AUTH_MODE === 'session' && sessionPaths.has(url.pathname)) {
        try {
          const response = await privateSession(request, env);
          if (response) return response;
        } catch { return denied(null, request, env); }
      }
      let access;
      try { access = await authorize(request, env); }
      catch { return denied(null, request, env); }
      if (access?.ok !== true) {
        // 본인이 아니면 초대 회원 세션을 본다. 회원은 앱을 쓰되 AI는 하루 한도, 무신사 사진은 막고, 초대 관리는 못 한다.
        if (invite) {
          const id = await member(request, env).catch(() => null);
          if (id) return memberApp(request, env, url, id, { rank, catalog, weather, rakuten, adpick, openProducts, community, accounts });
        }
        return denied(access, request, env);
      }
      if (invite && url.pathname.startsWith('/_member/')) return accounts(request, env, { owner: true });

      if (url.pathname === '/api/rank') {
        if (request.method !== 'POST') return new Response('POST만 받아요.', { status: 405, headers: privateHeaders });
        return rank(request, env);
      }
      if (url.pathname.startsWith('/api/catalog/')) return catalog(request, env);
      if (url.pathname === '/api/rakuten') return rakuten(request, env);
      if (url.pathname === '/api/adpick' || url.pathname.startsWith('/api/adpick/')) return adpick(request, env);
      if (url.pathname === '/api/open-products' || url.pathname.startsWith('/api/open-products/')) return openProducts(request, env);
      // 코디 공유: 지금 로그인은 본인 한 사람(비밀번호 세션)뿐이라 그 사람을 회원 'owner'이자 운영자로 넘긴다.
      // 여러 회원 로그인(C4)이 생기기 전에는 community.js가 public 모드를 열지 않는다.
      if (url.pathname.startsWith('/api/community/')) return community(request, env, { member: 'owner', operator: true });
      if (url.pathname === '/api/weather') {
        if (request.method !== 'GET') return new Response('GET만 받아요.', { status: 405, headers: privateHeaders });
        return weather(request, env);
      }
      // The internal assets cache may serve bytes only after verification above.
      // Also prevent a downstream shared cache from replaying private responses.
      const asset = await env.ASSETS.fetch(request);
      if (invite) return withRole(asset, 'owner');
      const response = new Response(asset.body, asset);
      for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
      return response;
    },
  };
}

export default createWorker();
