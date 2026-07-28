/* This page moved to catalystworks.consulting/kit/ and there is now nothing
   here worth caching. Anyone who opened the old address while it was live
   still has the previous worker installed, and that worker holds a copy of
   the old page and will serve it when the network is slow. On Thursday that
   is the difference between an attendee landing on the maintained page and
   an attendee working inside a stale one.

   So this worker does one thing: take over, empty every cache, unregister
   itself, and reload whatever it was controlling so the redirect can run.

   The browser reaches this file because a controlled navigation triggers an
   update check against this same origin, and the .htaccess rule deliberately
   does not redirect it away. Byte-for-byte different from the old worker, so
   the update is picked up. */

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (clients) {
        clients.forEach(function (c) { c.navigate(c.url); });
      })
      .catch(function () {})
  );
});

/* Until the unregister lands, refuse to answer from cache. Straight to the
   network, which is where the redirect lives. */
self.addEventListener('fetch', function (e) {
  e.respondWith(fetch(e.request).catch(function () {
    return new Response('', { status: 504, statusText: 'Offline' });
  }));
});
