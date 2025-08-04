// --- FICHIER sw.js ---

const APP_CACHE_NAME = 'communes-app-cache-v70'; // Version pour le téléchargement par ZIP
const DATA_CACHE_NAME = 'communes-data-cache-v1';
const TILE_CACHE_DYNAMIC = 'communes-tile-dynamic-v1';
const DB_NAME = 'TileDatabase';
const TILE_STORE_NAME = 'tiles';

const APP_SHELL_URLS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './leaflet.min.js',
    './leaflet.css',
    './manifest.json',
    './suncalc.js',
    './jszip.min.js' // NOUVEAU FICHIER
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
                if (cacheName !== APP_CACHE_NAME && cacheName !== DATA_CACHE_NAME && cacheName !== TILE_CACHE_DYNAMIC) {
                    return caches.delete(cacheName);
                }
            })
        )).then(() => self.clients.claim())
    );
});

// "MINI-BIBLIOTHÈQUE" IndexedDB pour le Service Worker
const idb = {
    db: null,
    init(dbName, storeName) {
        return new Promise((resolve, reject) => {
            if (this.db) return resolve(this.db);
            const request = indexedDB.open(dbName, 1);
            request.onerror = () => reject("Erreur IndexedDB");
            request.onsuccess = () => { this.db = request.result; resolve(this.db); };
            request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) { request.result.createObjectStore(storeName); } };
        });
    },
    get(storeName, key) {
        return new Promise((resolve, reject) => {
            this.init(DB_NAME, storeName).then(db => {
                const request = db.transaction(storeName).objectStore(storeName).get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            }).catch(reject);
        });
    }
};

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    if (requestUrl.hostname.includes('tile.openstreetmap.org')) {
        event.respondWith(
            idb.get(TILE_STORE_NAME, event.request.url).then(cachedBlob => {
                if (cachedBlob) {
                    return new Response(cachedBlob);
                }
                return caches.open(TILE_CACHE_DYNAMIC).then(cache => {
                    return cache.match(event.request).then(response => {
                        const fetchPromise = fetch(event.request).then(networkResponse => {
                            if (networkResponse.ok) {
                                cache.put(event.request, networkResponse.clone());
                            }
                            return networkResponse;
                        });
                        return response || fetchPromise;
                    });
                });
            })
        );
        return;
    }
    
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request).catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
