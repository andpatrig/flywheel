// Offline cache. Bump CACHE on every deploy so phones pick up the new version.
const CACHE = 'flywheel-v20';
const ASSETS = [
  './', './index.html', './app.js', './manifest.json', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png',
  './core/prepaint.js', './core/ui.css', './core/ui.js', './core/theme.js', './core/format.js', './core/events.js', './core/opponent.js', './core/pm5.js', './core/session.js', './core/store.js', './core/charts.js',
  './screens/live.js', './screens/live.html.js', './screens/history.js', './screens/history.html.js', './screens/about.js', './screens/about.html.js',
  './core/gfx.js', './screens/stones/screen.js', './screens/stones/stage.js', './screens/stones/game.js', './screens/tug/screen.js', './screens/tug/stage.js', './screens/tug/game.js', './core/stroke-clock.js', './screens/panels/boat.js', './screens/panels/cycle.js', './screens/panels/consistency.js', './screens/panels/projection.js',
  './vendor/plotly-4.2.0.min.js', './vendor/three-0.187.0.bundle.min.js',
  './vendor/fonts/ibm-plex-sans-latin-400-normal.woff2', './vendor/fonts/ibm-plex-sans-latin-500-normal.woff2', './vendor/fonts/ibm-plex-sans-latin-600-normal.woff2',
  './vendor/fonts/ibm-plex-mono-latin-400-normal.woff2', './vendor/fonts/ibm-plex-mono-latin-500-normal.woff2',
];
// Install: download every asset fresh from the server (bypass the browser's HTTP cache, which GitHub Pages
// sets to 10 minutes) so a new version can never be built from stale copies.
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
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
  // app code: network first, revalidated with the server (cheap 304 when unchanged), cache when offline
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
