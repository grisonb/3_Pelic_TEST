// --- NOUVEAU CONTENU COMPLET ET CORRIGÉ POUR sw.js ---

const APP_CACHE_NAME = 'communes-app-cache-v27'; // Version incrémentée
const TILE_CACHE_NAME = 'communes-tile-cache-v9';
const DATA_CACHE_NAME = 'communes-data-cache-v5'; // Version incrémentée

// On utilise des chemins relatifs pour que ça fonctionne partout
const APP_SHELL_URLS = [
    './', 
    './index.html', 
    './style.css', 
    './script.js',
    './leaflet.min.js', 
    './leaflet.css', 
    './manifest.json'
];

const DATA_URLS = [
    './communes.json' // Chemin relatif
];

self.addEventListener('install', event => {
    console.log(`[SW] Installation ${APP_CACHE_NAME}`);
    event.waitUntil(
        Promise.all([
            caches.open(APP_CACHE_NAME).then(cache => {
                console.log('[SW] Mise en cache du App Shell');
                return cache.addAll(APP_SHELL_URLS);
            }),
            caches.open(DATA_CACHE_NAME).then(cache => {
                console.log('[SW] Mise en cache des données des communes');
                return cache.addAll(DATA_URLS);
            })
        ]).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames.map(cacheName => {
                if (cacheName !== APP_CACHE_NAME && cacheName !== TILE_CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
                    return caches.delete(cacheName);
                }
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    if (requestUrl.hostname.includes('tile.openstreetmap.org')) {
        event.respondWith(
            caches.open(TILE_CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        if (networkResponse.ok) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                    return cachedResponse || fetchPromise;
                });
            })
        );
    } else {
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    return response || fetch(event.request);
                })
        );
    }
});
