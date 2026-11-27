// Service worker: keeps the editor usable offline once it has been opened.
// - App files under assets/ have hashed names, so a cached copy is always right (cache first).
// - Vanilla sounds and language files (/mcres/<hash>) are content-addressed too (cache first).
// - The page itself and Mojang's version lists are fetched fresh, the cache is the fallback.
// The client.jar is kept in IndexedDB by the app itself. Each release has its own cache.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `rpe-${VERSION}`;
const META_HOSTS = new Set(['piston-meta.mojang.com', 'launchermeta.mojang.com']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', './manifest.webmanifest', './icon.svg', './icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('rpe-') && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // a server without the sound proxy answers with the page instead; that must not stick
  if (res.ok && !(res.headers.get('content-type') ?? '').includes('text/html')) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(fallback ?? request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(fallback ?? request);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (/\/(assets|mcres)\//.test(url.pathname)) event.respondWith(cacheFirst(request));
    else if (request.mode === 'navigate') event.respondWith(networkFirst(request, './'));
    else event.respondWith(networkFirst(request));
  } else if (META_HOSTS.has(url.hostname)) {
    event.respondWith(networkFirst(request));
  }
});
