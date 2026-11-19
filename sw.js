// Offline support for the installed (Home Screen) app. Network-first so a fresh
// deploy is picked up immediately; falls back to the cache when offline.
// Only same-origin GETs for the game's own files are ever touched.
const CACHE = 'shardfront-v1';
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'src/data.js', 'src/sim/rng.js', 'src/sim/map.js', 'src/sim/pathfinding.js', 'src/sim/spatial.js', 'src/sim/game.js', 'src/sim/commands.js',
  'src/sim/units.js', 'src/sim/buildings.js', 'src/sim/movement.js', 'src/sim/combat.js', 'src/sim/fog.js', 'src/sim/ai.js',
  'src/client/main.js', 'src/client/app.js', 'src/client/settings.js', 'src/client/audio.js', 'src/client/sprites.js', 'src/client/renderer.js',
  'src/client/input.js', 'src/client/ui.js', 'src/client/controller.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
