// --- FICHIER sw.js AVEC LE FIX POUR LE CACHE DE DONNÉES ---

const APP_CACHE_NAME = 'communes-app-cache-v66'; // Version 5.1
const DATA_CACHE_NAME = 'communes-data-cache-v1';
const TILE_CACHE_NAME_DYNAMIC = 'communes-tile-dynamic-v1';
const TILE_CACHE_NAME_OFFLINE = 'communes-tile-offline-v1';

const APP_SHELL_URLS = [
    './', './index.html', './style.css', './script.js',
    './leaflet.min.js', './leaflet.css', './manifest.json',
    './suncalc.js'
];
const DATA_URLS = ['./communes.json'];

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
                // CORRECTION : DATA_CACHE_NAME est maintenant dans la liste
                if (cacheName !== APP_CACHE_NAME && cacheName !== DATA_CACHE_NAME && cacheName !== TILE_CACHE_NAME_DYNAMIC && cacheName !== TILE_CACHE_NAME_OFFLINE) {
                    console.log(`[SW] Suppression de l'ancien cache: ${cacheName}`);
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
            caches.match(event.request, { cacheName: TILE_CACHE_NAME_OFFLINE }).then(response => {
                return response || caches.open(TILE_CACHE_NAME_DYNAMIC).then(cache => {
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

self.addEventListener('message', event => {
    if (event.data.type === 'download_tiles') {
        downloadTilesInBackground(event.source);
    }
    if (event.data.type === 'delete_tiles') {
        deleteTilesInBackground(event.source);
    }
});

async function downloadTilesInBackground(client) {
    console.log('[SW] Démarrage du téléchargement des tuiles en arrière-plan.');
    
    const toRad = deg => deg * Math.PI / 180;
    const latLonToTileCoords = (lat, lon, zoom) => {
        const latRad = toRad(lat);
        const n = Math.pow(2, zoom);
        const xtile = Math.floor(n * ((lon + 180) / 360));
        const ytile = Math.floor(n * (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2);
        return { x: xtile, y: ytile };
    };

    const bounds = { minLat: 42.1, maxLat: 51.2, minLon: -5.3, maxLon: 8.4 };
    const zoomLevels = [5, 6, 7, 8, 9, 10, 11, 12, 13];
    const tilesToFetch = [];
    zoomLevels.forEach(zoom => {
        const topLeft = latLonToTileCoords(bounds.maxLat, bounds.minLon, zoom);
        const bottomRight = latLonToTileCoords(bounds.minLat, bounds.maxLon, zoom);
        for (let x = topLeft.x; x <= bottomRight.x; x++) {
            for (let y = topLeft.y; y <= bottomRight.y; y++) {
                tilesToFetch.push(`https://a.tile.openstreetmap.org/${zoom}/${x}/${y}.png`);
            }
        }
    });

    const total = tilesToFetch.length;
    let downloaded = 0;
    const tileCache = await caches.open(TILE_CACHE_NAME_OFFLINE);

    const chunkSize = 50;
    for (let i = 0; i < tilesToFetch.length; i += chunkSize) {
        const chunk = tilesToFetch.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (url) => {
            const cachedResponse = await tileCache.match(url);
            if (!cachedResponse) {
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        await tileCache.put(url, response);
                    }
                } catch (e) { console.error(e); }
            }
        }));
        downloaded += chunk.length;
        client.postMessage({ type: 'download_progress', payload: { downloaded, total } });
        await new Promise(r => setTimeout(r, 100));
    }

    client.postMessage({ type: 'download_complete' });
    console.log('[SW] Téléchargement des tuiles terminé.');
}

async function deleteTilesInBackground(client) {
    console.log('[SW] Suppression du cache des tuiles...');
    await caches.delete(TILE_CACHE_NAME_OFFLINE);
    console.log('[SW] Cache des tuiles supprimé.');
}
