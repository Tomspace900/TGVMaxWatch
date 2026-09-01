/*
 * Service worker.
 *
 * Il n'y a rien a charger : les donnees sont des JSON statiques. Strategie
 * cache first puis revalidation en fond, pour que l'app s'affiche pleine et
 * lisible en moins de 100 ms, hors ligne comprise. Aucun spinner n'existe dans
 * ce produit — la seule information d'etat est la date de fraicheur.
 */

const CACHE = 'tgvmax-v1';
const BASE = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(BASE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);

      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);

      // Cache d'abord, revalidation ensuite : l'affichage ne depend jamais du
      // reseau, et la donnee du jour arrive au rechargement suivant.
      return cached ?? network;
    }),
  );
});

self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'TGVmax', {
      body: payload.body ?? '',
      tag: payload.tag ?? 'tgvmax',
      renotify: true,
      icon: `${BASE}icon-192.png`,
      badge: `${BASE}icon-192.png`,
      data: { url: payload.url ?? BASE },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? BASE;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(BASE) && 'focus' in client) {
          void client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
