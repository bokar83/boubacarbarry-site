/* Offline support for the workshop kit page.
   Venue bandwidth for 15 to 30 laptops at once is the biggest unknown of
   the night, so once this page has loaded it must keep working with the
   connection gone: a reload, a reopened laptop, or a dropped wifi should
   never cost an attendee their work.

   This worker only ever touches this page and its own slides file. It
   stores nothing an attendee types. Their answers live in localStorage,
   which a service worker cannot read. */

var CACHE = 'kit0730-v3';
var ASSETS = ['./', './index.html', './ai-without-getting-burned-slides.pdf'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Cache each asset independently so one failure cannot abort the install.
      return Promise.all(ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Network first so an edit pushed on the day is picked up, cache as the
   fallback the moment the network is unavailable or slow to fail. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
