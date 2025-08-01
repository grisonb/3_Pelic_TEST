// --- FICHIER sw.js AVEC STRATÉGIE INDEXEDDB ---

const APP_CACHE_NAME = 'communes-app-cache-v60'; // Version pour IndexedDB
const DATA_CACHE_NAME = 'communes-data-cache-v1';
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
                if (cacheName !== APP_CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
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
            request.onerror = (event) => reject("Erreur IndexedDB: " + event.target.errorCode);
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };
        });
    },
    get(storeName, key) {
        return new Promise((resolve, reject) => {
            this.init(DB_NAME, storeName).then(db => {
                const transaction = db.transaction([storeName], "readonly");
                const store = transaction.objectStore(storeName);
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
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
                // Si la tuile n'est pas dans IndexedDB, on va la chercher en ligne
                // (utile pour les zones non téléchargées quand on a du réseau)
                return fetch(event.request);
            })
        );
        return;
    }
    
    // Stratégie pour le reste de l'application
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                return cachedResponse || fetch(event.request).catch(error => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});
