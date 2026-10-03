/* ==========================================================================
   Week OS — service worker. Cache-first, offline after first load.
   BUMP CACHE_VERSION ON EVERY DEPLOY — it drives the "Updated — reload"
   toast in the app.
   ========================================================================== */
'use strict';

const CACHE_VERSION = 'week-os-v5.14.1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/run-import.js',
  './js/run-stream.js',
  './js/strava.js',
  './js/day-builder.js',
  './js/ef-chart.js',
  './js/run-progress.js',
  './data/plan.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-512.png',
  './fonts/archivo-latin-800-normal.woff2',
  './fonts/archivo-latin-900-normal.woff2',
  './fonts/space-mono-latin-400-normal.woff2',
  './fonts/space-mono-latin-700-normal.woff2',
  './fonts/inter-latin-400-normal.woff2',
  './fonts/inter-latin-600-normal.woff2',
];

self.addEventListener('install', (event) => {
  /* cache: 'reload' goes past the browser's HTTP cache, so a release
     never precaches a file the previous release left there (v5.10.2) */
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  /* other sites (Strava, v5.12) go straight to the network: never cached,
     never answered from the app's cache */
  if (new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((res) => {
        if (res.ok && new URL(event.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
