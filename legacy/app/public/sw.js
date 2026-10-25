// 어울 service worker: lets the installed app open without a connection.
//
// It keeps only the app page, this manifest and the icons. It never stores
// account, wardrobe or photo requests (/v1/...) or other sites' images: the
// wardrobe already lives in this browser's IndexedDB, and API answers must
// always come from the server. The page is fetched from the network first, so
// a new build appears as soon as it is online; the stored copy is used only
// when the network fails.
const CACHE = 'eoul-shell-v1';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('eoul-shell-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/v1/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put('./', copy)));
      }
      return response;
    }).catch(() => caches.match('./').then((hit) => hit || Response.error())));
    return;
  }
  if (!SHELL.some((path) => new URL(path, self.location.href).pathname === url.pathname)) return;
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});
