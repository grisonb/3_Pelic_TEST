// --- FICHIER sw.js ---

const APP_CACHE_NAME = 'communes-app-cache-v110'; // Version radicalement nouvelle pour forcer la réinitialisation
const DATA_CACHE_NAME = 'communes-data-cache-v110';
const TILE_CACHE_NAME = 'communes-tile-cache-v110';

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
    // Force le nouveau Service Worker à s'activer dès qu'il a fini de s'installer.
    event.waitUntil(
        Promise.all([
            caches.open(APP_CACHE_NAME).then(cache => {
                console.log('SW: Mise en cache des fichiers de l\'application');
                return cache.addAll(APP_SHELL_URLS);
            }),
            caches.open(DATA_CACHE_NAME).then(cache => {
                console.log('SW: Mise en cache des données');
                return cache.addAll(DATA_URLS);
            })
        ]).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    // Prend le contrôle de la page immédiatement et nettoie les anciens caches.
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames.map(cacheName => {
                if (cacheName !== APP_CACHE_NAME && cacheName !== DATA_CACHE_NAME && cacheName !== TILE_CACHE_NAME) {
                    console.log('SW: Suppression de l\'ancien cache :', cacheName);
                    return caches.delete(cacheName);
                }
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Stratégie pour les tuiles de carte (Cache, puis réseau)
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
    
    // Stratégie pour les fichiers de l'application et les données (Cache, puis réseau)
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                return cachedResponse || fetch(event.request);
            })
            .catch(() => {
                // En cas d'erreur (hors-ligne), si c'est une navigation, renvoyer l'index.html
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            })
    );
});
