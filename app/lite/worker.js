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
    const asset = await env.ASSETS.fetch(new Request(new URL('/community-shell.html', url)));
    if (!asset.ok) return null;
    return new Response(asset.body, { status: 200, headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': SHELL_CSP, 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' } });
  }
  if (request.method === 'GET' && (await publicFiles(env, url)).has(path)) {
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
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
      if (access?.ok !== true) return denied(access, request, env);

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
      const response = new Response(asset.body, asset);
      for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
      return response;
    },
  };
}

export default createWorker();
