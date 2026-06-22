const CACHE_NAME = "tenfold-secure-cache-v1";

// On install, activate immediately and claim clients
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only intercept GET requests
  if (request.method !== "GET") {
    return;
  }

  // Parse request url
  const url = new URL(request.url);

  // Security filters: Do NOT cache real-time messaging pipelines
  if (
    url.pathname.includes("/api/") ||
    url.pathname.includes("/stream") ||
    url.pathname.includes("hot-update") ||
    url.protocol === "ws:" ||
    url.protocol === "wss:"
  ) {
    return;
  }

  // Stale-While-Revalidate caching strategy for static resources
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in the background to update the cache
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {
            // Silence background check failures
          });
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          // Cache valid resources
          if (networkResponse.status === 200 && networkResponse.type === "basic") {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback to cached index shell for direct app entry routing
          if (request.mode === "navigate") {
            return caches.match("/");
          }
        });
    })
  );
});
