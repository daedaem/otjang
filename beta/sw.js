// 어울(가칭) 베타 서비스 워커 — 한 번 연 뒤에는 인터넷이 끊겨도 앱이 열리게 한다.
// 옷장·사진 자료는 다루지 않는다(브라우저 IndexedDB 에 그대로 있다). 같은 주소(이 폴더)의 파일만 저장하고 다른 주소의 요청에는 손대지 않는다.
// 화면(index.html)은 먼저 인터넷에서 받고(새 버전이 바로 보이게), 안 되면 저장해 둔 것을 쓴다. 3D(closet.js?v=해시)는 이름에 버전이 있어 한 번 받으면 그대로 쓴다.
const CACHE = 'eoul-b905edd8dd';
const CORE = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('eoul-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); } return r; }).catch(() => caches.match('./')));
    return;
  }
  if (url.pathname.endsWith('/closet.js')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
