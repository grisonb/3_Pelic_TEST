// --- FICHIER sw.js ---

const APP_CACHE_NAME = 'communes-app-cache-v58'; // Version pour le fix page blanche final
const DATA_CACHE_NAME = 'communes-data-cache-v1';
// Le cache des tuiles n'est plus géré par le cycle de vie du SW
// const TILE_CACHE_NAME_PERSISTENT = 'communes-tile-persistent-v1';

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
    console.log(`[SW] Installation ${APP_CACHE_NAME}`);
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
                // On ne supprime que les caches de l'app et des données qui ne sont pas les actuels
                if (cacheName !== APP_CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
                    // Important : on ne touche PAS au cache des tuiles
                    if (!cacheName.startsWith('communes-tile-')) {
                         return caches.delete(cacheName);
                    }
                }
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Stratégie "Cache First" pour les tuiles, depuis leur cache dédié
    if (requestUrl.hostname.includes('tile.openstreetmap.org')) {
        event.respondWith(
            caches.open(TILE_CACHE_NAME_PERSISTENT).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    // Si la tuile est dans le cache, on la sert, sinon on va sur le réseau
                    return cachedResponse || fetch(event.request);
                });
            })
        );
        return;
    }
    
    // Stratégie pour le reste de l'application
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).catch(error => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return new Response('', { status: 404, statusText: 'Not Found' });
                });
            })
    );
});
