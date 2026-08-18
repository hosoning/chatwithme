const CACHE_NAME = 'tarot-wechat-v16';
const ASSETS = [
  './', './index.html',
  './js/tarot.js', './js/wordcards.js', './js/ai.js', './js/cloud.js', './js/app.js',
  './manifest.json'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.ok) { const c = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(e.request, c)).catch(()=>{}); }
      return res;
    }).catch(() => caches.match(e.request))
  );
});