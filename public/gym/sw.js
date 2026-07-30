// 서비스 워커 — 앱 파일을 캐시해 지하 헬스장처럼 신호가 약한 곳에서도 동작하게 한다.
const CACHE = 'gym4w-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './store.js',
  './speech.js',
  './program.js',
  './exercises.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 앱 파일은 캐시 우선(네트워크로 조용히 갱신), 그 외 요청은 네트워크 우선.
// 경로를 고정하지 않고 등록 범위(scope)로 판단하므로 어떤 하위 경로에 올려도 그대로 동작한다.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.registration.scope)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});
