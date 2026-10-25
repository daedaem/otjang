// 설치형 앱 서비스 워커: 연결이 없어도 앱을 열 수 있게 앱 파일만 저장한다.
// 저장하지 않는 것: AI 순위 요청(/api/), 다른 사이트의 상품 사진. 옷장·기록은 원래 이 브라우저 저장소(localStorage)에 있다.
// 앱 페이지는 네트워크를 먼저 써서 새 배포가 바로 보이고, 실패할 때만 저장한 사본을 쓴다.
// __VERSION__과 __SHELL__은 build.mjs가 채운다(파일 내용이 바뀌면 버전이 바뀌어 옛 저장본을 지운다).
const CACHE = 'lite-__VERSION__';
const SHELL = __SHELL__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
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
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put('/', copy)));
      }
      return response;
    }).catch(() => caches.match('/').then((hit) => hit || Response.error())));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((response) => {
    // React input assets are cached only after this device visits that screen.
    if (response.ok && /^\/react\/.+\.(js|css)$/.test(url.pathname) && /(?:javascript|text\/css)/.test(response.headers.get('content-type') || '')) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
    }
    return response;
  })));
});
