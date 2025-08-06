// --- FICHIER sw.js ---

const APP_CACHE_NAME = 'communes-app-cache-v100'; // Version majeure pour forcer la réinitialisation
const DATA_CACHE_NAME = 'communes-data-cache-v100';
const TILE_CACHE_NAME = 'communes-tile-cache-v100';

const APP_SHELL_URLS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './leaflet.min.js',
    './leaflet.css',
    './manifest.json',
    './suncalc.js'
];

const DATA_URLS = [
    './communes.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        Promise.all([
            caches.open(APP_CACHE_NAME).then(cache => cache.addAll(APP_SHELL_URLS)),
            caches.open(DATA_CACHE_NAME).then(cache => cache.addAll(DATA_URLS))
        ]).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames.map(cacheName => {
                // Suppression de TOUS les anciens caches qui ne correspondent pas
                if (cacheName !== APP_CACHE_NAME && cacheName !== DATA_CACHE_NAME && cacheName !== TILE_CACHE_NAME) {
                    console.log('Service Worker: suppression de l\'ancien cache :', cacheName);
                    return caches.delete(cacheName);
                }
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Stratégie pour les tuiles de carte
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
        return;
    }
    
    // Stratégie pour les autres requêtes (fichiers de l'app et données)
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Si la ressource est en cache, la retourner
                if (cachedResponse) {
                    return cachedResponse;
                }
                // Sinon, la récupérer sur le réseau
                return fetch(event.request).catch(error => {
                    // Si la navigation échoue (hors ligne), retourner la page d'accueil
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});
