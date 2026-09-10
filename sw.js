// Keep this before Firebase Messaging imports so notification taps use the PWA route.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
    const existing = list[0];
    if (existing) return existing.focus().then(client => client.navigate?.('./index.html?push=1') || client);
    return clients.openWindow('./index.html?push=1');
  }));
});

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCFbblyrEXmg7ZSNJwJeCQBYMKHed4fHZk',
  authDomain: 'chatwithme-6238a.firebaseapp.com',
  projectId: 'chatwithme-6238a',
  messagingSenderId: '160412914629',
  appId: '1:160412914629:web:b9bbc3f3ebd045f42931ac'
});
firebase.messaging().onBackgroundMessage(payload => {
  if (payload.notification) return;
  const data = payload.data || {};
  self.registration.showNotification(data.title || '新消息', {
    body: data.body || '你收到一条新消息',
    icon: './icon/wechat-app-icon-192.png',
    badge: './icon/wechat-app-icon-192.png',
    tag: data.tag || 'chatwithme-message',
    data
  });
});

const CACHE_NAME = 'tarot-wechat-v45';
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
