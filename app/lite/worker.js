// Cloudflare Workers로 올릴 때의 입구(Workers Builds: `npx wrangler deploy`). Pages로 올리면 이 파일은 쓰지 않고 functions/를 쓴다.
// 정적 자산까지 반드시 이 입구를 지난다(assets.run_worker_first: true).
// 선택한 본인 인증(Access JWT 또는 서명 세션)을 검증하기 전에는 API/상품 자산을 보내지 않는다.
import { handle } from './functions/api/rank.js';
import { handleCatalog } from './functions/api/catalog.js';
import { handleWeather } from './functions/api/weather.js';
import { handleRakuten } from './functions/api/rakuten.js';
import { handleAdpick } from './functions/api/adpick.js';
import { handleOpenProducts } from './functions/api/open-products.js';
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
  privateSession = handlePrivateSession,
} = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
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
