/**
 * DEEPFOG v3.0 — Offline-First Service Worker
 * Ensures 100% offline availability in open-pit mine environments.
 */

const CACHE_NAME = 'deepfog-v3-offline-v1';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './dashboard.html',
  './manifest.json',
  './css/style.css',
  './js/fleet.js',
  './fonts/fonts.css',
  './fonts/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuBWYMZg.ttf',
  './fonts/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuDyYMZg.ttf',
  './fonts/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
  './fonts/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf',
  './fonts/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf',
  './fonts/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
  './fonts/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuOKfMZg.ttf',
  './fonts/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8-qxjPQ.ttf',
  './fonts/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8FqtjPQ.ttf',
  './fonts/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8L6tjPQ.ttf',
  './fonts/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPQ.ttf',
  './fonts/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyGy6xpg.ttf',
  './fonts/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyKS6xpg.ttf',
  './fonts/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1ny_Cmxpg.ttf',
  './fonts/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nymymxpg.ttf',
  './fonts/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nysimxpg.ttf',
  './fonts/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyxSmxpg.ttf'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Precache skipped:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  // Bypass API and WebSocket traffic
  if (url.includes('/api/') || url.includes('/ws')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.destination === 'document' || event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
