// client/public/sw.js
const CACHE = 'fa-refill-shell-v1';
const APP_SHELL = ['/', '/index.html', '/styles.css'];

// Precache the minimal shell
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
  })());
  self.clients.claim();
});

// Strategy:
// - SPA navigations → return index.html from cache when offline (so refresh on /visits/:id works)
// - JS/CSS → network-first, fallback to cache
// - Images → cache-first
// - /api/* → ignored (your app handles offline queue itself)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // SPA deep-link refresh & navigation
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { return await fetch(req); }
      catch {
        const cached = await caches.match('/index.html');
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/api/')) return;

  if (req.destination === 'script' || req.destination === 'style') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
        return res;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('/index.html');
      }
    })());
    return;
  }

  if (req.destination === 'image') {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
        return res;
      } catch { return new Response('', { status: 504 }); }
    })());
  }
});
