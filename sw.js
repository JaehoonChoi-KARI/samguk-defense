// Offline support. Online: always ask the server first, so a new version shows up on the
// very next launch. Offline (or a server slower than 4s): use the cached copy.

const CACHE = 'samguk-td-1.0.18'; // keep in sync with VERSION in js/data.js
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/data.js',
  './js/maps.js',
  './js/waves.js',
  './js/sim.js',
  './js/army.js',
  './js/save.js',
  './js/sprites.js',
  './js/render.js',
  './js/battle-ui.js',
  './js/screens.js',
  './js/chinamap.js',
  './js/progression.js',
  './js/bot.js',
  './js/stories.js',
  './js/audio.js',
  './js/music.js',
  './js/device.js',
  './js/talents.js',
  './js/tutorial.js',
  './js/field.js',
  './js/lore/liubei.js',
  './js/lore/caocao.js',
  './js/lore/sunquan.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  // 'reload' skips the browser's HTTP cache so a new version never caches old files
  const requests = ASSETS.map(url => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Safari refuses redirected responses for page loads; hand back a plain copy instead.
const unredirect = res =>
  res.redirected ? new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers }) : res;

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // 'no-cache' = revalidate with the server (a cheap 304 when nothing changed) instead of
  // trusting GitHub Pages' 10-minute browser cache.
  const network = fetch(req, { cache: 'no-cache' }).then(unredirect);
  event.waitUntil(
    network
      .then(res => (res.ok ? caches.open(CACHE).then(c => c.put(req, res.clone())) : null))
      .catch(() => {}),
  );
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS));
  event.respondWith(
    Promise.race([network.then(res => res.clone()), timeout]).catch(async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      return cached || network.then(res => res.clone()); // nothing cached yet: keep waiting
    }),
  );
});
