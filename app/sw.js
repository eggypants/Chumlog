/* Build substitutes the release hash. App content only; never IndexedDB records. */
const RELEASE = '__RELEASE__';
const PREFIX = `chumlog:${self.registration.scope}:`;
const CACHE = PREFIX + RELEASE;
const FILES = ['index.html','styles.css','app.js','db.js','model.js','strings.js','manifest.webmanifest','icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png'];
const urls = FILES.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls.map(url => new Request(url, { cache: 'reload' })))));
  // An update waits until the user chooses Reload (or all old tabs close).
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'ACTIVATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const root = new URL(self.registration.scope).pathname;
  const navigation = event.request.mode === 'navigate' && (url.pathname === root || url.pathname === `${root}index.html`);
  const asset = urls.find(x => new URL(x).pathname === url.pathname);
  if (!navigation && !asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(navigation ? new URL('index.html', self.registration.scope).href : asset);
    return cached || fetch(event.request);
  })());
});
