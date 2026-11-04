// Offline cache. Bump CACHE on every deploy so phones pick up the new version.
const CACHE = 'flywheel-v4';
const ASSETS = ['./', './index.html', './pm5.js', './manifest.json', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './vendor/plotly-4.2.0.min.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // versioned vendor files and icons never change: cache first
  if (url.pathname.includes('/vendor/') || /icon-\d+\.png$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
    return;
  }
  // app code: network first so updates land, cache when offline
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
