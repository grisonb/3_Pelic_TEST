// --- FICHIER sw.js AVEC STRATÉGIE HYBRIDE ---

const APP_CACHE_NAME = 'communes-app-cache-v60'; // Version pour cache hybride
const DATA_CACHE_NAME = 'communes-data-cache-v1';
const TILE_CACHE_API_NAME = 'communes-tile-api-cache-v1'; // Le cache rapide
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
                // On nettoie les vieux caches de l'app, mais on garde les caches de données et de tuiles
                if (cacheName !== APP_CACHE_NAME && cacheName !== DATA_CACHE_NAME && cacheName !== TILE_CACHE_API_NAME) {
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

// =========================================================================
// GESTIONNAIRE FETCH AVEC STRATÉGIE HYBRIDE
// =========================================================================
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    if (requestUrl.hostname.includes('tile.openstreetmap.org')) {
        event.respondWith(
            caches.open(TILE_CACHE_API_NAME).then(async (cache) => {
                // 1. On cherche d'abord dans le cache rapide (Cache API)
                const cachedResponse = await cache.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }

                // 2. Si pas trouvé, on cherche dans le stockage long terme (IndexedDB)
                try {
                    const idbBlob = await idb.get(TILE_STORE_NAME, event.request.url);
                    if (idbBlob) {
                        // On a trouvé la tuile dans la base de données !
                        const response = new Response(idbBlob);
                        // On la met dans le cache rapide pour la prochaine fois
                        await cache.put(event.request, response.clone());
                        return response;
                    }
                } catch (error) {
                    console.error("Erreur de lecture IndexedDB:", error);
                }
                
                // 3. Si la tuile n'est nulle part (cas où on est en ligne et on explore une nouvelle zone)
                // on va la chercher sur le réseau. Le SW de la page la mettra dans IndexedDB.
                return fetch(event.request);
            })
        );
        return;
    }
    
    // Stratégie pour le reste de l'application (inchangée)
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
