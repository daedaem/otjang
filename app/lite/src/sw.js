// 설치형 앱 서비스 워커: 연결이 없어도 앱을 열 수 있게 앱 파일만 저장한다.
// 저장하지 않는 것: AI 순위 요청(/api/), 다른 사이트의 상품 사진. 옷장·기록은 원래 이 브라우저 저장소(localStorage)에 있다.
// 앱 페이지는 네트워크를 먼저 써서 새 배포가 바로 보이고, 실패할 때만 저장한 사본을 쓴다.
// 새 버전은 열린 이전 탭이 닫힐 때까지 기다린다. 활성화할 때만 옛 저장본을 지운다.
const CACHE = 'lite-__VERSION__';
const SHELL = __SHELL__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('lite-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || /^\/(?:api|_private|_member)(?:\/|$)/.test(url.pathname) || /^\/c(?:\/|$)/.test(url.pathname)) return;
  if (request.mode === 'navigate') {
    // 계정/초대/공개 문서를 앱의 '/' 사본으로 저장하지 않는다.
    if (url.pathname !== '/' && url.pathname !== '/index.html') return;
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && !response.redirected && /text\/html/i.test(response.headers.get('content-type') || '')) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put('/', copy)));
      }
      return response;
    }).catch(async () => {
      const hit = await (await caches.open(CACHE)).match('/');
      if (!hit) return Response.error();
      if (!/text\/html/i.test(hit.headers.get('content-type') || '')) return hit;
      const headers = new Headers(hit.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      headers.delete('etag');
      headers.delete('last-modified');
      const body = (await hit.text()).replace(/<head\b[^>]*>/i, '$&<meta name="hangit-offline" content="1">');
      return new Response(body, { status: hit.status, statusText: hit.statusText, headers });
    }));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((response) => {
    // 설치 뒤 다른 배포의 정상 React 파일을 받은 경우에도 보관한다. 로그인 HTML은 보관하지 않는다.
    if (response.ok && /^\/react\/.+\.(js|css)$/.test(url.pathname) && /(?:javascript|text\/css)/.test(response.headers.get('content-type') || '')) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
    }
    return response;
  })));
});
