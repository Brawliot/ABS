/**
 * Service Worker - Production Implementation
 * Maneja caching, offline support, background sync, push notifications
 */

const CACHE_VERSION = 'abs-v1';
const CACHE_NAMES = {
  api: `${CACHE_VERSION}-api`,
  html: `${CACHE_VERSION}-html`,
  assets: `${CACHE_VERSION}-assets`,
};

// Rutas para cachear
const API_CACHE_PATTERNS = [/^\/api\//];
const HTML_CACHE_PATTERNS = [/\.html$/, /^\/$/];
const ASSET_CACHE_PATTERNS = [/\.(js|css|png|jpg|jpeg|gif|svg|webp|woff2?)$/];

/**
 * Install event - precachea assets críticos
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAMES.html).then((cache) => {
      // Precachea página principal
      return cache.add('/').catch(() => {
        // Silencioso si falla
      });
    })
  );
  self.skipWaiting();
});

/**
 * Activate event - limpia caches viejos
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!Object.values(CACHE_NAMES).includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

/**
 * Fetch event - implementa estrategias de cache
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignora requests no-GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Determina estrategia según tipo de recurso
  if (isApiRequest(url)) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_NAMES.api));
  } else if (isHtmlRequest(url)) {
    event.respondWith(networkFirst(event.request, CACHE_NAMES.html));
  } else if (isAssetRequest(url)) {
    event.respondWith(cacheFirst(event.request, CACHE_NAMES.assets));
  } else {
    event.respondWith(networkFirst(event.request, CACHE_NAMES.html));
  }
});

/**
 * Sync event - sincroniza pendientes
 */
self.addEventListener('sync', (event) => {
  if (event.tag.startsWith('sync-')) {
    event.waitUntil(
      (async () => {
        try {
          // Intenta sincronizar
          const response = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });

          if (response.ok) {
            // Notifica al cliente
            self.clients.matchAll().then((clients) => {
              clients.forEach((client) => {
                client.postMessage({
                  type: 'sync-complete',
                  tag: event.tag,
                });
              });
            });
          }
        } catch (error) {
          // Fallback silencioso
          console.error('Sync error:', error);
        }
      })()
    );
  }
});

/**
 * Push event - maneja notificaciones push
 */
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'Nueva notificación',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: data.tag || 'notification',
    ...data.options,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Notificación', options)
  );
});

/**
 * Notification click event
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Busca cliente ya abierto
      for (const client of clients) {
        if (client.url === '/' && 'focus' in client) {
          return (client as any).focus();
        }
      }
      // Abre nueva ventana si no existe
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );

  // Notifica al cliente
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'notification-click',
        notification: event.notification,
      });
    });
  });
});

/**
 * Cache strategies
 */

/**
 * Stale-while-revalidate: sirve del cache mientras actualiza en background
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    // No cachea respuestas no-OK
    if (!response || response.status !== 200) {
      return response;
    }

    // Cachea copia de respuesta exitosa
    const responseToCache = response.clone();
    cache.put(request, responseToCache);
    return response;
  });

  // Retorna cached inmediatamente si existe, sino espera fetch
  return cached || fetchPromise;
}

/**
 * Network-first: intenta red, fallback a cache
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);

    // Cachea respuestas exitosas
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    // Fallback a cache
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    if (cached) {
      return cached;
    }

    // Fallback a offline page
    return new Response('Offline - página no disponible', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain',
      }),
    });
  }
}

/**
 * Cache-first: sirve del cache, fallback a red
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);

    // Cachea respuestas exitosas
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    // Sin fallback para assets
    return new Response('Recurso no disponible', {
      status: 404,
      statusText: 'Not Found',
    });
  }
}

/**
 * Helpers
 */

function isApiRequest(url) {
  return API_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

function isHtmlRequest(url) {
  return HTML_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

function isAssetRequest(url) {
  return ASSET_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname));
}
