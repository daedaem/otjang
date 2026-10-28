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
import { handleGarmentPhoto } from './functions/api/garment-photo.js';
import { handleMemberAuth, memberFromRequest } from './functions/lib/member-session.js';
import { handleMemberAccounts } from './functions/lib/member-accounts.js';
import { reserveRankBudget } from './functions/lib/rank-budget.js';
import { authorizePrivateRequest } from './functions/lib/private-access.js';
import { handlePrivateSession } from './functions/lib/private-session.js';
import { ACCOUNT_HEADER, memberStorageScope } from './src/domain/account-scope.js';
import { handleReadiness } from './functions/lib/readiness.js';
import { handlePrivateAiCheck } from './functions/lib/private-ai-check.js';
import { appActor, primaryAdmin } from './functions/lib/primary-admin.js';

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

const sessionPaths = new Set(['/_private/login', '/_private/session', '/_private/status', '/_private/logout']);
async function identityTags(role, id) {
  const scope = role === 'owner' ? 'owner' : await memberStorageScope(id);
  return `<meta name="hangit-role" content="${role}"><meta name="hangit-storage-scope" content="${scope}">`;
}
async function scopeMismatch(request, member, required = false) {
  if (['GET', 'HEAD'].includes(request.method)) return null;
  const supplied = request.headers.get(ACCOUNT_HEADER);
  if (!required && !supplied) return null; // existing owner clients remain usable
  const expected = member === 'owner' ? 'owner' : await memberStorageScope(member);
  if (supplied === expected) return null;
  return Response.json({ code: 'account_changed', message: '계정이 바뀌었어요. 현재 계정으로 앱을 다시 열어 주세요.' }, { status: 409, headers: { ...privateHeaders, 'x-hangit-scope-mismatch': '1' } });
}

function denied(access, request, env) {
  const status = access?.status === 401 ? 401 : 503;
  const session = env?.PRIVATE_AUTH_MODE === 'session';
  const login = env?.MEMBER_APP_MODE === 'accounts' ? '/_member/signin' : '/_private/login';
  const url = new URL(request.url);
  const documentPath = url.pathname === '/' || /\.html?$/i.test(url.pathname) ||
    (!url.pathname.startsWith('/api/') && !/\.[^/]+$/.test(url.pathname));
  const htmlNavigation = request.method === 'GET' && documentPath &&
    (url.pathname === '/' || request.headers.get('sec-fetch-mode') === 'navigate' ||
      request.headers.get('accept')?.toLowerCase().includes('text/html'));
  if (session && status === 401 && htmlNavigation) {
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: login } });
  }
  return Response.json({
    error: status === 401 ? 'unauthorized' : 'not_configured',
    message: status === 401 ? (env?.MEMBER_APP_MODE === 'accounts' ? '계정 로그인이 필요해요.' : '본인 전용 로그인이 필요해요.') : '비공개 접속 설정을 확인하고 있어요.',
    ...(session && status === 401 ? { login } : {}),
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
  // 공개 커뮤니티 로그인 경로만 받는다. 초대 회원 경로(/_member/account·invites 등)는 아래 일반 흐름으로 간다.
  if (/^\/_member\/(login\/|callback\/|email\/|logout$)/.test(path)) return memberAuth(request, env);
  if ((path === '/c' || path === '/c/') && request.method === 'GET') {
    // 정적 파일의 HTML 주소 정리가 /community-shell.html을 다른 주소로 돌려 답할 수 있어 한 번 따라간다(보안 검토 10-28).
    let asset = await env.ASSETS.fetch(new Request(new URL('/community-shell.html', url)));
    const moved = asset.status >= 300 && asset.status < 400 && asset.headers.get('location');
    if (moved) asset = await env.ASSETS.fetch(new Request(new URL(moved, url)));
    if (!asset.ok) return null;
    let html = await asset.text();
    let access = null;
    try { access = await authorize(request, env); } catch {}
    const id = access?.ok ? 'owner' : await member(request, env).catch(() => null);
    if (id) html = html.replace('<head>', '<head>' + await identityTags(id === 'owner' ? 'owner' : 'member', id));
    return new Response(html, { status: 200, headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': SHELL_CSP, 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' } });
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
    if (access?.ok === true) return await scopeMismatch(request, 'owner') || community(request, env, { member: 'owner', operator: true });
    // 회원 쿠키는 SameSite=Lax지만, 쓰기 요청은 같은 출처에서 온 것만 받는다.
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== url.origin) {
      return Response.json({ code: 'invalid_origin' }, { status: 403, headers: privateHeaders });
    }
    const id = await member(request, env).catch(() => null);
    return id && await scopeMismatch(request, id) || community(request, env, id ? { member: id, operator: false } : {});
  }
  return null;
}

const INVITE_PUBLIC = new Set(['/_member/signup', '/_member/signin', '/_member/password/signup', '/_member/password/signin']);
// 화면(HTML)에 역할 표시를 붙인다. 회원에게는 바깥 사진(무신사 등)을 막는 CSP를 더한다.
async function withRole(asset, role, member, showRole = true, accountLogin = false) {
  const type = asset.headers.get('content-type') || '';
  let response;
  if (asset.ok && type.includes('text/html')) {
    const tags = await identityTags(role, member);
    const html = (await asset.text()).replace('<head>', '<head>' + (showRole ? tags : tags.replace(/<meta name="hangit-role"[^>]*>/, '')) + (accountLogin ? '<meta name="hangit-account-login" content="password">' : ''));
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
  if (path.startsWith('/api/')) { const mismatch = await scopeMismatch(request, id, true); if (mismatch) return mismatch; }
  if (path.startsWith('/_member/invites')) return Response.json({ code: 'owner_only' }, { status: 403, headers: privateHeaders });
  if (path.startsWith('/_member/')) return h.accounts(request, env, { member: id });
  if (path.startsWith('/_private/')) return Response.json({ code: 'owner_only' }, { status: 403, headers: privateHeaders });
  if (path === '/api/rank') {
    if (request.method !== 'POST') return new Response('POST만 받아요.', { status: 405, headers: privateHeaders });
    return h.rank(request, env, { member: id, authorize: async () => ({ ok: true }), reserve: (e) => reserveRankBudget(e, { member: id }) });
  }
  if (path === '/api/garment-photo') return h.garmentPhoto(request, env, { member: id, authorize: async () => ({ ok: true }), reserve: (e) => reserveRankBudget(e, { member: id }) });
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
  return withRole(await env.ASSETS.fetch(request), 'member', id, true, env.MEMBER_APP_MODE==='accounts');
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
  garmentPhoto = handleGarmentPhoto,
  privateSession = handlePrivateSession,
} = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      // 코디 공유 공개(대표 10-28 08:08·11:47). COMMUNITY_MODE=public이고 운영자 정보·연락처·회원 로그인 설정이
      // 모두 있을 때만 /c 화면, 그 화면의 파일(빌드가 만든 허용 목록), 회원 로그인, 커뮤니티 API가 본인 로그인 없이 열린다.
      // 나머지 앱(상품 자료·옷장 화면·AI)은 그대로 본인 전용이다.
      const invite = env?.MEMBER_APP_MODE === 'invite';
      const accountsMode = env?.MEMBER_APP_MODE === 'accounts';
      const membersEnabled = invite || accountsMode;
      // 초대 회원 가입·로그인 화면(대표 10-28 15:12). 로그인 없이 열린다. 초대 코드가 있어야 가입된다.
      // public 커뮤니티 로그인보다 먼저 본다(보안 검토 10-28).
      if (membersEnabled && INVITE_PUBLIC.has(url.pathname)) return accounts(request, env, {});
      if (env?.COMMUNITY_MODE === 'public' && publicMissing(env).length === 0) {
        const publicOwner = accountsMode ? async (req,e) => {
          const id=await member(req,e,{provider:'password'});
          return id && (await appActor(e,id)).role==='owner' ? {ok:true} : {ok:false,status:401};
        } : authorize;
        const open = await publicCommunity(request, env, url, { authorize:publicOwner, community, member, memberAuth });
        if (open) return open;
      }
      let accountActor=null, bootstrapOwner=false;
      if (accountsMode) {
        try {
          const id=await member(request,env,{provider:'password'});
          if (id) {
            accountActor=await appActor(env,id);
            if (accountActor.role==='member') return memberApp(request,env,url,id,{rank,catalog,weather,rakuten,adpick,openProducts,community,accounts,garmentPhoto});
            if (url.pathname==='/_private/logout') return accounts(new Request(new URL('/_member/account/logout',url),request),env,{owner:true,member:id});
            if (url.pathname==='/_private/status') return request.method==='GET' ? Response.json({authenticated:true},{headers:privateHeaders}) : Response.json({code:'method_not_allowed'},{status:405,headers:{...privateHeaders,allow:'GET'}});
            if (url.pathname==='/_private/login' || url.pathname==='/_private/admin-setup') return request.method==='GET' ? new Response(null,{status:303,headers:{...privateHeaders,location:'/'}}) : Response.json({code:'admin_already_linked'},{status:409,headers:privateHeaders});
            if (url.pathname==='/_private/session') return Response.json({code:'use_account_login',login:'/_member/signin'},{status:403,headers:privateHeaders});
          } else {
            const legacy=await authorize(request,env);
            if (legacy?.ok && !(await primaryAdmin(env))) {
              bootstrapOwner=true;
              if (url.pathname==='/_private/admin-setup') return accounts(request,env,{owner:true});
              if (sessionPaths.has(url.pathname)) return privateSession(request,env);
              if (request.method==='GET' && (url.pathname==='/' || url.pathname==='/index.html')) return new Response(null,{status:303,headers:{...privateHeaders,location:'/_private/admin-setup'}});
            } else {
              // Existing owner authentication is a one-time bootstrap, never a second administrator login.
              if (sessionPaths.has(url.pathname) || url.pathname==='/_private/admin-setup') {
                if (!(await primaryAdmin(env))) {
                  if (sessionPaths.has(url.pathname)) return privateSession(request,env);
                  if (request.method==='GET') return new Response(null,{status:303,headers:{...privateHeaders,location:'/_private/login'}});
                }
              }
              return denied({status:401},request,env);
            }
          }
        } catch { return denied(null,request,env); }
      }
      // Only these exact authentication endpoints may answer before the private gate.
      // Their handler owns method/origin/credential validation. Access/default and
      // unknown modes retain their existing gate even on the login paths.
      if (!accountsMode && env?.PRIVATE_AUTH_MODE === 'session' && sessionPaths.has(url.pathname)) {
        try {
          const response = await privateSession(request, env);
          if (response) return response;
        } catch { return denied(null, request, env); }
      }
      let access;
      try { access = accountActor?.role==='owner' || bootstrapOwner ? {ok:true} : await authorize(request, env); }
      catch { return denied(null, request, env); }
      if (access?.ok !== true) {
        // 본인이 아니면 초대 회원 세션을 본다. 회원은 앱을 쓰되 AI는 하루 한도, 무신사 사진은 막고, 초대 관리는 못 한다.
        if (invite) {
          // 앱은 초대(비밀번호) 회원 세션만 연다. 공개 커뮤니티의 카카오·구글·이메일 코드 회원은 앱에 못 들어온다(보안 검토 10-28).
          const id = await member(request, env, { provider: 'password' }).catch(() => null);
          if (id) return memberApp(request, env, url, id, { rank, catalog, weather, rakuten, adpick, openProducts, community, accounts, garmentPhoto });
        }
        return denied(access, request, env);
      }
      if (membersEnabled && url.pathname.startsWith('/_member/')) return accounts(request, env, { owner: true, ...(accountActor ? {member:accountActor.sessionMember} : {}) });
      if (url.pathname === '/_private/readiness') return handleReadiness(request, env);
      if (url.pathname === '/_private/ai-check') return handlePrivateAiCheck(request);
      if (url.pathname.startsWith('/api/')) { const mismatch = await scopeMismatch(request, 'owner'); if (mismatch) return mismatch; }

      if (url.pathname === '/api/rank') {
        if (request.method !== 'POST') return new Response('POST만 받아요.', { status: 405, headers: privateHeaders });
        return rank(request, env);
      }
      if (url.pathname === '/api/garment-photo') return garmentPhoto(request, env);
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
      return withRole(asset, 'owner', undefined, membersEnabled, !!accountActor);
    },
  };
}

export default createWorker();
