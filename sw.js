'use strict';

// Service-Worker: legt alle Dateien in den Cache, damit die App offline läuft.
const CACHE = 'kraftsport-v7';

// 'bulgarian' bleibt für die archivierten Bilder im Cache.
const IDS = ['goblet', 'ausfall', 'rdl', 'rudern', 'lat', 'liege', 'schulter', 'seit', 'bulgarian'];
const PHASEN = ['anfang', 'mitte', 'unten'];
const BILDER = IDS.flatMap((id) => PHASEN.map((p) => `bilder/${id}-${p}.png`));
const ASSETS = ['.', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', ...BILDER];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
