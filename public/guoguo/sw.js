// 果果日記離線快取：頁面與圖示先存；資料由 Firebase 自己離線同步
const CACHE = 'guoguo-v9';
const CORE = ['./', './index.html', './config.js', './app.webmanifest', './icons/b-icon-192.png', './icons/b-icon-512.png', './icons/b-apple-touch-icon.png', './icons/face.jpg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isStatic = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'].includes(url.hostname);
  if (!sameOrigin && !isStatic) return; // Firebase / Gemini 走網路
  if (req.mode === 'navigate' || url.pathname.endsWith('/config.js') || url.pathname.endsWith('.webmanifest')) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(req.mode === 'navigate' ? './index.html' : req, c)); return r; })
      .catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req)));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
