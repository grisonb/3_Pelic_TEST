// sw.js

const APP_CACHE_NAME = 'communes-app-cache-v31'; // Version incrémentée
const VECTOR_TILE_CACHE_NAME = 'communes-vector-tile-cache-v4'; // Version incrémentée

const APP_SHELL_URLS = [
    './', 
    './index.html', 
    './style.css', 
    './script.js',
    './leaflet.min.js',
    './leaflet.css',
    './manifest.json',
    // MODIFIÉ : Utilisation du nouveau proxy pour la mise en cache
    'https://thingproxy.freeboard.io/fetch/https://map-assets.s3.amazonaws.com/communes.json'
];

const VECTOR_TILE_URLS = [
    'https://map-assets.s3.amazonaws.com/france.pmtiles'
];

self.addEventListener('install', event => {
    console.log(`[SW] Installation ${APP_CACHE_NAME}`);
    event.waitUntil(
        Promise.all([
            caches.open(APP_CACHE_NAME).then(cache => {
                console.log('[SW] Mise en cache du App Shell et données critiques');
                const requests = APP_SHELL_URLS.map(url => new Request(url, { cache: 'reload' }));
                return cache.addAll(requests);
            }),
            caches.open(VECTOR_TILE_CACHE_NAME).then(cache => {
                console.log('[SW] Mise en cache des tuiles vectorielles depuis l\'URL distante');
                const requests = VECTOR_TILE_URLS.map(url => new Request(url, { cache: 'reload' }));
                return cache.addAll(requests);
            })
        ]).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames.map(cacheName => {
                if (cacheName !== APP_CACHE_NAME && cacheName !== VECTOR_TILE_CACHE_NAME) {
                    console.log(`[SW] Suppression de l'ancien cache: ${cacheName}`);
                    return caches.delete(cacheName);
                }
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    // Stratégie "Cache First"
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request);
        })
    );
});
