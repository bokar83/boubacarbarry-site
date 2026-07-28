/* Offline support for the workshop kit page.

   Venue bandwidth for 15 to 30 laptops at once is the biggest unknown of
   the night, so once this page has loaded it must keep working with the
   connection gone: a reload, a reopened laptop, or a dropped wifi should
   never cost an attendee their work.

   This worker only ever touches this page and its own assets. It stores
   nothing an attendee types. Their answers live in localStorage, which a
   service worker cannot read, and nothing typed is ever put in a URL, so
   nothing typed can end up in this cache.

   THREE THINGS THIS FILE IS CAREFUL ABOUT

   1. The slides PDF is NOT precached. It is 950KB against a 132KB page.
      Precaching it meant every laptop in the room pulled roughly 1.1MB in
      the same sixty seconds the QR went up on screen, for a file most
      people open later at home. It is now cached only once someone
      actually downloads it, which is also when they are most likely to
      want it available offline.

   2. Network first, but on a CLOCK. A dead connection rejects fast and
      falls back to cache. Bad conference wifi does something worse: it
      accepts the socket and then stalls, so fetch() neither resolves nor
      rejects and the page hangs. If the network has not answered within
      NET_TIMEOUT and we hold a cached copy, we serve the cache at once
      and let the real response land in the background for next time.

   3. The update path. skipWaiting plus clients.claim plus network-first
      means a fix pushed on the day reaches a laptop that already loaded
      the page, on its next load, without anyone clearing anything. Bump
      CACHE on every deploy so the activate handler drops the old one. */

var CACHE = 'kit0730-v4';

/* The page itself only. Small, and the thing every attendee needs first. */
var ASSETS = ['./', './index.html'];

/* Served from cache when the network stalls rather than fails. Long enough
   that a merely slow connection still wins and delivers a fresh page,
   short enough that nobody in the room stares at a blank screen. */
var NET_TIMEOUT = 2500;

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

/* Lets the erase button empty the cache too, so that when an attendee asks
   what this page kept, the honest answer is nothing. */
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'PURGE') {
    e.waitUntil(caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }));
  }
});

function putInCache(req, res) {
  if (res && res.status === 200 && res.type === 'basic') {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
  }
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { return putInCache(req, res); });

      /* Nothing cached yet: the network is the only answer we have, so
         wait it out rather than fail early. Falls back to the page shell
         for a navigation so an offline first load still shows something. */
      if (!hit) {
        return net.catch(function () {
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      }

      /* We hold a copy. Give the network NET_TIMEOUT to beat it, then stop
         waiting. The in-flight fetch keeps going and refreshes the cache,
         so the next load gets whatever was deployed. */
      return new Promise(function (resolve) {
        var settled = false;
        function done(r) { if (!settled) { settled = true; resolve(r); } }
        setTimeout(function () { done(hit); }, NET_TIMEOUT);
        net.then(done).catch(function () { done(hit); });
      });
    })
  );
});
