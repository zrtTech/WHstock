/* WHstock Service Worker
   Стратегия: Cache First для статики, Network First для API
*/
const CACHE_NAME = 'whstock-v1';
const STATIC_ASSETS = [
    './index.html',
    './manifest.webmanifest'
];

/* Установка — кэшируем статику */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

/* Активация — удаляем старые кэши */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

/* Fetch — стратегия зависит от типа запроса */
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    /* API-запросы к 1С / серверу печати — только сеть, без кэша */
    if (url.pathname.includes('/product') ||
        url.pathname.includes('/post-document') ||
        url.pathname.includes('/update-product') ||
        url.pathname.includes('/print') ||
        url.pathname.includes('/printers') ||
        url.pathname.includes('/trigger-sync') ||
        url.pathname.includes('/cells') ||
        url.hostname === 'api.printnode.com') {
        event.respondWith(fetch(event.request));
        return;
    }

    /* Внешние ресурсы (Google Fonts и т.д.) — сеть с fallback на кэш */
    if (url.origin !== location.origin) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    /* Статика (index.html, manifest) — Cache First */
    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) return cached;
                return fetch(event.request)
                    .then(response => {
                        if (response.ok) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, clone));
                        }
                        return response;
                    });
            })
    );
});
