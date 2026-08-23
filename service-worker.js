/**
 * service-worker.js
 * Caches the application shell (HTML/CSS/JS/manifest/icons) so KNHOS Lite
 * loads and runs with no network connection after the first visit.
 * All patient data lives in IndexedDB, never in this cache.
 *
 * IMPORTANT: this file lives at the PROJECT ROOT on purpose. A service
 * worker's maximum allowed scope is the directory it is served from
 * (browsers reject a broader scope unless the server sends a
 * "Service-Worker-Allowed" header, which most free static hosts don't let
 * you configure). Keeping this file at the root means its default scope is
 * already the whole site, so it can control index.html, js/, styles/, and
 * pwa/ with no server configuration required.
 *
 * Paths below are relative to THIS file's location (the project root), per
 * the Service Worker / Cache API URL resolution rules.
 */

const CACHE_VERSION = 'knhos-lite-shell-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './styles/main.css',
  './js/db.js',
  './js/idgen.js',
  './js/patients.js',
  './js/router.js',
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

  // Only handle same-origin GET requests; let everything else pass through.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Opportunistically cache newly-seen shell-like assets (best effort).
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Offline and not cached: for navigations, fall back to the shell.
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return undefined;
        });
    })
  );
});
