const CACHE_NAME = 'bullet-journal-v1';
const urlsToCache = [
  '/bulletjournal-web-app/',
  '/bulletjournal-web-app/index.html',
  '/bulletjournal-web-app/static/js/main.chunk.js',
  '/bulletjournal-web-app/static/js/0.chunk.js',
  '/bulletjournal-web-app/static/js/bundle.js',
  '/bulletjournal-web-app/manifest.json',
  '/bulletjournal-web-app/logo192.png',
  '/bulletjournal-web-app/logo512.png',
  '/bulletjournal-web-app/favicon.ico'
];

// 安裝Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('已開啟快取');
        return cache.addAll(urlsToCache);
      })
  );
});

// 啟動Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('清除舊的快取');
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 攔截請求並返回快取內容
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(response => {
            // 檢查是否為有效的響應
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          });
      })
  );
}); 