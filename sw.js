/* Stoic — service worker.

   Its whole job is making the app open without signal. It never touches your
   data: the day, the history and the notes live in localStorage and in
   Supabase exactly as before, and every request to Supabase goes straight to
   the network, cached by nobody.

   The page itself is served NETWORK FIRST. Whenever there is signal you get
   what was just deployed, and the copy kept here is only the fallback for when
   there is none. Cache-first would be faster and would also mean a bad version
   could pin itself on a phone forever — not worth it.

   Bump CACHE to drop everything the old worker kept. */
const CACHE = 'stoic-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  // addAll fails as a unit, so one missing file would leave no cache at all.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;          // never stand between a save and the cloud
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // The fonts are the one outside thing the page needs to look like itself.
  // Answer from the cache at once, and refresh it in the background.
  if (/(^|\.)(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }

  // Everything else — Supabase above all — is left alone.
});
