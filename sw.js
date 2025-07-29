// --- NOUVEAU CONTENU COMPLET ET CORRIGÉ POUR sw.js ---

const APP_CACHE_NAME = 'communes-app-cache-v32'; // Version incrémentée
const TILE_CACHE_NAME = 'communes-tile-cache-v9';
const DATA_CACHE_NAME = 'communes-data-cache-v5';

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
    './communes.json'
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

// =========================================================================
// GESTIONNAIRE FETCH CORRIGÉ ET ROBUSTE
// =========================================================================
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Stratégie pour les tuiles OpenStreetMap
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

    // Stratégie "Cache First, puis Network" (avec fallback pour la navigation)
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Si la ressource est dans le cache, on la sert immédiatement.
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Si c'est une requête de navigation non trouvée, on sert l'index.html de base.
                // C'est LA garantie que l'application se lance toujours hors ligne.
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }

                // Pour les autres requêtes, on tente le réseau.
                return fetch(event.request);
            })
    );
});
