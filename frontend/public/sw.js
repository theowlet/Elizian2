/* ============================================================
   Elizian Service Worker
   - Offline caching (App Shell strategy)
   - Push notification handling
   - Background sync placeholder
   ============================================================ */

const CACHE_NAME = 'elizian-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/assets/z.png',
];

/* ---- Install: precache app shell ---- */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

/* ---- Activate: clean old caches ---- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

/* ---- Fetch: network-first with cache fallback ---- */
self.addEventListener('fetch', (event) => {
  // Skip non-GET and API requests
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('/')))
  );
});

/* ---- Push notification handling ---- */
self.addEventListener('push', (event) => {
  let data = { title: 'Elizian', body: 'You have a new notification', icon: '/assets/z.png' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (_) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/assets/z.png',
    badge: '/assets/z.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/home',
      dateOfArrival: Date.now(),
    },
    actions: data.actions || [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    tag: data.tag || 'elizian-notification',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

/* ---- Notification click ---- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/home';

  if (event.action === 'dismiss') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});

/* ---- Background sync placeholder ---- */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-bookings') {
    event.waitUntil(
      // Future: sync offline booking data
      Promise.resolve()
    );
  }
});
