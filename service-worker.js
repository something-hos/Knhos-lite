/**
 * service-worker.js
 * Phase 4 Upgrade - Ultimate Dental & Billing
 */

const CACHE_VERSION = 'knhos-lite-shell-v6';

const SHELL_FILES = [
  './',
  './index.html',
  './styles/main.css',
  './js/db.js',
  './js/idgen.js',
  './js/patients.js',
  './js/router.js',
  './js/visits.js',
  './js/consents.js',
  './js/app.js',
  './pwa/manifest.json',
  './pwa/icon-192.png',
  './pwa/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_VERSION)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return undefined;
        });
    })
  );
});
