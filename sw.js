const SW_VERSION = 'sw-v14-30_couleurs_paramoteur_parachute_pendulaire';
const APP_VERSION = 'v14.30';

const DB_NAME = 'OfflineTilesDB_v13_70_clean';
const LEGACY_TILE_DB_NAME = DB_NAME;
const DB_VERSION = 3;

const OFFLINE_TILES_ENABLED_KEY = 'offlineTilesEnabled';
const OFFLINE_ONLINE_FALLBACK_KEY = 'offlineOnlineFallback';
const OFFLINE_ACTIVE_PACKS_KEY = 'offlineActivePacks';
const OFFLINE_ACTIVE_PACK_DATABASES_KEY = 'offlineActivePackDatabases';

const APP_SHELL_CACHE = `npf-q400-app-shell-${SW_VERSION}`;
const DEPARTMENTS_GEOJSON_URL = 'https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/latest/geojson/departements-1000m.geojson';
const HIGH_VOLTAGE_LINES_GEOJSON_URL = './lignes_ht_rte_simplifiees.geojson';
const APP_SHELL_URLS = [
    './',
    './index.html',
    './style.css',
    './icons/safesky-traffic-monochrome.png',
    './script.js',
    './manifest.json',
    './leaflet.css',
    './leaflet.min.js',
    './suncalc.js',
    './jszip.min.js',
    './communes.json',
    './communes_aliases.json',
    HIGH_VOLTAGE_LINES_GEOJSON_URL,
    DEPARTMENTS_GEOJSON_URL,
    './icons/icon-192x192.png',
    './icons/icon-512x512.png'
,
    './icons/apple-touch-icon.png',
    './icons/maskable-icon-512x512.png',
    './icons/bloc-fuel-shortcut-icon.png'    , './icons/calculator-fms-icon.png'
    , './icons/search-commune-icon.png'
    , './icons/center-gps-icon.png'
];

const CORE_APP_SHELL_URLS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './leaflet.css',
    './leaflet.min.js',
    './suncalc.js',
    './jszip.min.js',
    './communes.json',
    './communes_aliases.json'
];


/*
 * IMPORTANT :
 * - pas de cache agressif de index.html / script.js ;
 * - pas de suppression des caches de tuiles ;
 * - service worker conservé pour Push + offline tiles ;
 * - lecture tuiles optimisée IndexedDB, sans boucle Cache Storage à chaque tuile.
 */

let offlineTilesEnabled = false;
let offlineOnlineFallback = false;
let activeOfflinePacks = [];
let activeOfflinePackDatabases = [];

let dbPromise = null;
const tileDbPromises = new Map();
let offlineSettingsLoadedAt = 0;

const SETTINGS_REFRESH_INTERVAL_MS = 5000;
const MEMORY_TILE_CACHE_MAX = 160;
const memoryTileCache = new Map();

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(APP_SHELL_CACHE);
        const failedCoreUrls = [];

        await Promise.all(APP_SHELL_URLS.map(async (url) => {
            try {
                const request = new Request(url, { cache: 'reload', mode: url === DEPARTMENTS_GEOJSON_URL ? 'cors' : 'same-origin' });
                const response = await fetch(request);

                /*
                 * v12.38 :
                 * - les fichiers cœur doivent obligatoirement être cachés ;
                 * - les ressources optionnelles peuvent échouer sans casser l'installation ;
                 * - cela évite d'activer un nouveau SW incomplet qui casserait le lancement hors ligne.
                 */
                if (response && (response.ok || response.type === 'opaque')) {
                    await cache.put(url, response.clone());
                    return;
                }

                if (CORE_APP_SHELL_URLS.includes(url)) {
                    failedCoreUrls.push(url);
                }
            } catch (error) {
                console.warn('[SW] Cache app shell ignoré pour', url, error);
                if (CORE_APP_SHELL_URLS.includes(url)) {
                    failedCoreUrls.push(url);
                }
            }
        }));

        if (failedCoreUrls.length) {
            throw new Error(`[SW] Installation refusée, fichiers cœur absents: ${failedCoreUrls.join(', ')}`);
        }

        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter(name => name.startsWith('npf-q400-app-shell-') && name !== APP_SHELL_CACHE)
                .map(name => caches.delete(name))
        );

        await refreshOfflineSettingsFromDB({ force: true });
        await self.clients.claim();

        /*
         * v12.63 — transition PWA plus propre conservée.
         * Après activation d'un nouveau service worker, on force une navigation
         * des fenêtres ouvertes vers la même URL avec un paramètre de rafraîchissement.
         * Objectif : éviter une page servie par l'ancien app-shell avec des scripts
         * ou styles d'une autre version. Les bases IndexedDB des tuiles offline ne
         * sont pas supprimées.
         */
        /*
         * v13.92 — la transition de version transporte un signal explicite
         * npfupdate=v13.92. Deux passages espacés sécurisent le cas iPad où
         * controllerchange recharge d'abord l'ancien URL avant client.navigate.
         */
        const navigateClientsToUpdatedVersion = async () => {
            try {
                const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                await Promise.all(windowClients.map(async (client) => {
                    try {
                        if (!client || typeof client.navigate !== 'function') return;
                        const url = new URL(client.url);
                        if (url.origin !== self.location.origin) return;
                        if (url.searchParams.get('npfupdate') === APP_VERSION) return;
                        url.searchParams.set('swrefresh', SW_VERSION);
                        url.searchParams.set('npfupdate', APP_VERSION);
                        await client.navigate(url.toString());
                    } catch (_) {}
                }));
            } catch (_) {}
        };

        await navigateClientsToUpdatedVersion();
        await swDelay(900);
        await navigateClientsToUpdatedVersion();
    })());
});


async function closeOfflineDBForHeavyWrite() {
    /*
     * v12.17 — libère la connexion IndexedDB du service worker avant gros import/suppression.
     * Safari/iPadOS ralentit fortement si le SW garde une connexion de lecture
     * pendant que la page écrit ou supprime massivement.
     */
    memoryTileCache.clear();
    offlineSettingsLoadedAt = 0;

    try {
        if (dbPromise) {
            const db = await dbPromise.catch(() => null);
            if (db && typeof db.close === 'function') db.close();
        }
    } catch (_) {}

    dbPromise = null;

    try {
        for (const promise of tileDbPromises.values()) {
            const tileDb = await promise.catch(() => null);
            if (tileDb && typeof tileDb.close === 'function') tileDb.close();
        }
    } catch (_) {}
    tileDbPromises.clear();
}


self.addEventListener('message', event => {
    const data = event.data || {};

    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }

    if (data.type === 'OFFLINE_IMPORT_START' || data.type === 'OFFLINE_MASS_DELETE_START' || data.type === 'OFFLINE_FACTORY_RESET') {
        activeOfflinePacks = [];
        activeOfflinePackDatabases = [];
        offlineTilesEnabled = false;
        offlineSettingsLoadedAt = Date.now();

        const acknowledgeHeavyWriteReady = async () => {
            /*
             * v13.72 — import ZIP iPad : accusé de réception réel.
             * La page attend cette réponse avant de commencer à écrire dans IndexedDB.
             * Cela évite que le service worker garde encore une connexion/lecture active
             * au moment du premier lot d'écriture, blocage constaté vers 171/22387.
             */
            await closeOfflineDBForHeavyWrite();
            try {
                if (event.ports && event.ports[0]) {
                    event.ports[0].postMessage({ type: 'OFFLINE_IMPORT_READY' });
                }
            } catch (_) {}
        };

        if (event.waitUntil) {
            event.waitUntil(acknowledgeHeavyWriteReady());
        } else {
            acknowledgeHeavyWriteReady();
        }
        return;
    }

    if (data.type === 'OFFLINE_TILES_ENABLED_CHANGED') {
        offlineTilesEnabled = !!data.value;
        offlineSettingsLoadedAt = Date.now();
        return;
    }

    if (data.type === 'OFFLINE_ONLINE_FALLBACK_CHANGED') {
        offlineOnlineFallback = !!data.value;
        offlineSettingsLoadedAt = Date.now();
        return;
    }

    if (data.type === 'OFFLINE_ACTIVE_PACKS_CHANGED') {
        activeOfflinePacks = Array.isArray(data.value) ? data.value.filter(Boolean) : [];
        activeOfflinePackDatabases = Array.isArray(data.dbNames) ? data.dbNames.filter(Boolean) : [];
        offlineSettingsLoadedAt = Date.now();
        memoryTileCache.clear();
    }
});


async function swFetchWithTimeout(input, init = {}, timeoutMs = 3500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function swDelay(ms, value = null) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

async function swFetchFallbackToCache(request, timeoutMs = 8000) {
    try {
        return await swFetchWithTimeout(request, {}, timeoutMs);
    } catch (_) {
        return await caches.match(request, { ignoreSearch: true }) || new Response('', { status: 504, statusText: 'Offline asset unavailable' });
    }
}

self.addEventListener('fetch', event => {
    const request = event.request;

    if (request.method !== 'GET') return;

    if (isTrafficApiRequest(request.url)) {
        event.respondWith(fetch(request));
        return;
    }

    if (isOpenStreetMapTileRequest(request.url)) {
        event.respondWith(handleTileRequest(request));
        return;
    }

    if (request.url === DEPARTMENTS_GEOJSON_URL) {
        event.respondWith(handleCachedExternalRequest(request));
        return;
    }

    if (isAppShellRequest(request)) {
        event.respondWith(handleAppShellRequest(request));
        return;
    }

    event.respondWith(swFetchFallbackToCache(request, 8000));
});



function isTrafficApiRequest(url) {
    try {
        const parsed = new URL(url);
        return [
            'opendata.adsb.fi',
            'api.adsb.lol',
            'api.airplanes.live'
        ].includes(parsed.hostname);
    } catch (_) {
        return false;
    }
}

function isAppShellRequest(request) {
    try {
        const parsed = new URL(request.url);
        if (parsed.origin !== self.location.origin) return false;
        if (request.mode === 'navigate') return true;

        const filename = parsed.pathname.split('/').pop() || '';
        return [
            '',
            'index.html',
            'style.css',
            'script.js',
            'manifest.json',
            'leaflet.css',
            'leaflet.min.js',
            'suncalc.js',
            'jszip.min.js',
            'communes.json',
            'communes_aliases.json',
            'lignes_ht_rte_simplifiees.geojson'
        ].includes(filename) || parsed.pathname.includes('/icons/');
    } catch (_) {
        return false;
    }
}

function isCriticalAppShellRequest(request) {
    try {
        if (request.mode === 'navigate') return true;
        const parsed = new URL(request.url);
        const filename = parsed.pathname.split('/').pop() || '';
        return ['index.html', 'script.js', 'style.css', 'manifest.json'].includes(filename);
    } catch (_) {
        return false;
    }
}

async function handleAppShellRequest(request) {
    const cached = await caches.match(request, { ignoreSearch: true });
    const cache = await caches.open(APP_SHELL_CACHE);

    /*
     * v12.55 — fichiers critiques en réseau d'abord.
     * Ancien comportement : index/script/style servis d'abord depuis l'ancien
     * cache, ce qui pouvait bloquer une transition pérenne et laisser la carte
     * blanche avec boutons inactifs. Nouveau comportement : si le réseau est
     * disponible, index.html, script.js, style.css et manifest.json viennent du
     * serveur ; le cache reste le secours hors ligne.
     */
    if (isCriticalAppShellRequest(request)) {
        const cacheKey = request.mode === 'navigate' ? './index.html' : request;
        const fallbackCached = cached || (request.mode === 'navigate' ? await caches.match('./index.html', { ignoreSearch: true }) : null);

        const requestUrl = new URL(request.url);
        const isForcedVersionTransition = request.mode === 'navigate' && requestUrl.searchParams.has('swrefresh');
        const freshTimeoutMs = isForcedVersionTransition ? 5000 : 2200;

        const freshPromise = (async () => {
            try {
                const freshRequest = new Request(request, { cache: 'reload' });
                const fresh = await swFetchWithTimeout(freshRequest, {}, freshTimeoutMs);
                if (fresh && fresh.ok) {
                    await cache.put(cacheKey, fresh.clone());
                    return fresh;
                }
            } catch (_) {}
            return null;
        })();

        /*
         * v13.91 — pendant la navigation forcée qui suit l'activation d'une MAJ,
         * attendre réellement le nouvel index. Pour les lancements ordinaires,
         * conserver le secours rapide de 900 ms sur réseau dégradé.
         */
        if (fallbackCached) {
            if (isForcedVersionTransition) {
                return await freshPromise || fallbackCached;
            }
            const freshOrTimeout = await Promise.race([freshPromise, swDelay(900, null)]);
            return freshOrTimeout || fallbackCached;
        }

        return await freshPromise || new Response('', { status: 504, statusText: 'Offline critical asset unavailable' });
    }

    if (cached) {
        fetch(request).then(async (fresh) => {
            if (fresh && fresh.ok) {
                await cache.put(request, fresh.clone());
            }
        }).catch(() => {});
        return cached;
    }

    try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) {
            await cache.put(request, fresh.clone());
        }
        return fresh;
    } catch (_) {
        return cached || new Response('', { status: 504, statusText: 'Offline asset unavailable' });
    }
}

async function handleCachedExternalRequest(request) {
    const cached = await caches.match(request, { ignoreSearch: true });

    if (cached) {
        fetch(request).then(async (fresh) => {
            if (fresh && (fresh.ok || fresh.type === 'opaque')) {
                const cache = await caches.open(APP_SHELL_CACHE);
                await cache.put(request, fresh.clone());
            }
        }).catch(() => {});
        return cached;
    }

    try {
        const fresh = await fetch(request);
        if (fresh && (fresh.ok || fresh.type === 'opaque')) {
            const cache = await caches.open(APP_SHELL_CACHE);
            await cache.put(request, fresh.clone());
        }
        return fresh;
    } catch (_) {
        return new Response('', { status: 504, statusText: 'Offline external asset unavailable' });
    }
}

async function handleTileRequest(request) {
    await refreshOfflineSettingsFromDB();

    if (offlineTilesEnabled) {
        const offlineResponse = await findOfflineTileResponse(request.url);
        if (offlineResponse) return offlineResponse;

        /*
         * Offline strict : si la tuile n'est pas présente, on ne va pas online.
         */
        return new Response(
            Uint8Array.from(atob('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='), c => c.charCodeAt(0)),
            {
                status: 200,
                headers: {
                    'Content-Type': 'image/gif',
                    'X-Offline-Tile': 'transparent-missing'
                }
            }
        );
    }

    try {
        return await fetch(request);
    } catch (networkError) {
        if (offlineOnlineFallback) {
            const offlineResponse = await findOfflineTileResponse(request.url);
            if (offlineResponse) return offlineResponse;
        }

        throw networkError;
    }
}

function isOpenStreetMapTileRequest(url) {
    try {
        const parsed = new URL(url);
        if (!/\.tile\.openstreetmap\.org$/i.test(parsed.hostname)) return false;
        return /\/\d+\/\d+\/\d+\.(png|jpg|jpeg)$/i.test(parsed.pathname);
    } catch (_) {
        return false;
    }
}

async function findOfflineTileResponse(tileUrl) {
    const cacheKey = `${tileUrl}::${(activeOfflinePacks || []).join('|')}`;

    const cached = memoryTileCache.get(cacheKey);
    if (cached) {
        touchMemoryTile(cacheKey, cached);
        return cached.clone();
    }

    try {
        const dbNames = Array.isArray(activeOfflinePackDatabases) && activeOfflinePackDatabases.length
            ? activeOfflinePackDatabases
            : [LEGACY_TILE_DB_NAME];

        for (const dbName of dbNames) {
            try {
                const tileDb = dbName === LEGACY_TILE_DB_NAME
                    ? await openOfflineDB()
                    : await openOfflineDBByName(dbName);
                const record = await findTileRecordInDB(tileDb, tileUrl);

                if (!record || !record.tile) continue;

                const contentType = record.tile.type || guessTileContentType(tileUrl);
                const response = new Response(record.tile, {
                    headers: {
                        'Content-Type': contentType,
                        'X-Offline-Tile': `indexeddb:${dbName}`
                    }
                });

                rememberMemoryTile(cacheKey, response.clone());
                return response;
            } catch (dbError) {
                console.warn('[SW] Base tuile offline ignorée:', dbName, dbError);
            }
        }
        return null;
    } catch (error) {
        console.warn('[SW] Lecture tuile offline impossible:', error);
        return null;
    }
}

function rememberMemoryTile(key, response) {
    memoryTileCache.set(key, response);

    while (memoryTileCache.size > MEMORY_TILE_CACHE_MAX) {
        const oldestKey = memoryTileCache.keys().next().value;
        memoryTileCache.delete(oldestKey);
    }
}

function touchMemoryTile(key, response) {
    memoryTileCache.delete(key);
    memoryTileCache.set(key, response);
}

function openOfflineDB() {
    if (dbPromise) return dbPromise;
    dbPromise = openOfflineDBByName(DB_NAME);
    return dbPromise;
}

function openOfflineDBByName(dbName = DB_NAME) {
    const safeName = String(dbName || DB_NAME);
    if (tileDbPromises.has(safeName)) return tileDbPromises.get(safeName);

    const promise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB indisponible dans le service worker'));
            return;
        }

        const request = indexedDB.open(safeName, DB_VERSION);
        request.onupgradeneeded = event => {
            const dbInstance = event.target.result;
            if (!dbInstance.objectStoreNames.contains('tiles')) {
                const store = dbInstance.createObjectStore('tiles', { keyPath: 'url' });
                store.createIndex('packName', 'packName', { unique: false });
                store.createIndex('tileUrl', 'tileUrl', { unique: false });
            } else {
                const store = event.target.transaction.objectStore('tiles');
                if (!store.indexNames.contains('packName')) store.createIndex('packName', 'packName', { unique: false });
                if (!store.indexNames.contains('tileUrl')) store.createIndex('tileUrl', 'tileUrl', { unique: false });
            }
            if (!dbInstance.objectStoreNames.contains('settings')) {
                dbInstance.createObjectStore('settings', { keyPath: 'key' });
            }
        };
        request.onsuccess = event => {
            const openedDb = event.target.result;
            try {
                openedDb.onversionchange = () => {
                    try { openedDb.close(); } catch (_) {}
                    tileDbPromises.delete(safeName);
                    if (safeName === DB_NAME) dbPromise = null;
                };
            } catch (_) {}
            resolve(openedDb);
        };
        request.onerror = event => reject(event.target.error || new Error(`Erreur ouverture IndexedDB ${safeName}`));
        request.onblocked = () => reject(new Error(`IndexedDB bloquée : ${safeName}`));
    }).catch(error => {
        tileDbPromises.delete(safeName);
        if (safeName === DB_NAME) dbPromise = null;
        throw error;
    });

    tileDbPromises.set(safeName, promise);
    return promise;
}

function findTileRecordInDB(db, tileUrl) {
    const activeSet = new Set(activeOfflinePacks || []);

    return new Promise((resolve, reject) => {
        const tx = db.transaction('tiles', 'readonly');
        const store = tx.objectStore('tiles');

        let request;

        if (store.indexNames.contains('tileUrl')) {
            /*
             * Chemin rapide : index tileUrl + curseur.
             * On s'arrête dès qu'une tuile correspondant au pack actif est trouvée.
             */
            request = store.index('tileUrl').openCursor(IDBKeyRange.only(tileUrl));
        } else {
            request = store.openCursor();
        }

        request.onsuccess = () => {
            const cursor = request.result;

            if (!cursor) {
                resolve(null);
                return;
            }

            const value = cursor.value || {};
            const storedTileUrl = value.tileUrl || getTileUrlFromStoredKey(value.url);

            if (storedTileUrl === tileUrl && isTileRecordAllowed(value, activeSet)) {
                resolve(value);
                return;
            }

            cursor.continue();
        };

        request.onerror = () => reject(request.error || new Error('Erreur lecture tuile IndexedDB'));
        tx.onerror = () => reject(tx.error || new Error('Erreur transaction IndexedDB'));
        tx.onabort = () => reject(tx.error || new Error('Transaction IndexedDB annulée'));
    });
}

function getOfflinePackGroupNameForSw(packName) {
    const name = String(packName || '').trim();
    const cleaned = name
        .replace(/\s*\(\d+\)\s*$/i, '')
        .replace(/\s+(copy|copie)\s*$/i, '')
        .trim();

    const match = cleaned.match(/^(.+?)(?:[\s_-]*(?:part|partie|zip)?[\s_-]*)(\d{1,3})$/i);
    if (match && match[1].trim().length >= 2) {
        return match[1].replace(/[\s_-]+$/g, '').trim();
    }

    return cleaned;
}

function isTileRecordAllowed(record, activeSet) {
    if (!activeSet || activeSet.size === 0) return true;

    const recordPack = record && record.packName ? String(record.packName) : '';
    if (activeSet.has(recordPack)) return true;

    /*
     * v13.79 — tolérance multi-ZIP.
     * Si une carte fractionnée est active mais que la liste exacte des packs a
     * été partiellement rechargée, on autorise les tuiles dont le groupe est le
     * même : NPF_..._01 / _02 / _10 restent une seule carte.
     */
    const recordGroup = getOfflinePackGroupNameForSw(recordPack);
    for (const activePack of activeSet) {
        if (getOfflinePackGroupNameForSw(activePack) === recordGroup) return true;
    }

    return false;
}

function getTileUrlFromStoredKey(storedUrl) {
    return String(storedUrl || '').split('::')[0];
}

function guessTileContentType(tileUrl) {
    return /\.(jpg|jpeg)(?:\?.*)?$/i.test(tileUrl) ? 'image/jpeg' : 'image/png';
}

async function refreshOfflineSettingsFromDB({ force = false } = {}) {
    const now = Date.now();

    if (!force && (now - offlineSettingsLoadedAt) < SETTINGS_REFRESH_INTERVAL_MS) {
        return;
    }

    try {
        const db = await openOfflineDB();
        const settings = await readOfflineSettings(db);

        if (typeof settings[OFFLINE_TILES_ENABLED_KEY] === 'boolean') {
            offlineTilesEnabled = settings[OFFLINE_TILES_ENABLED_KEY];
        }

        if (typeof settings[OFFLINE_ONLINE_FALLBACK_KEY] === 'boolean') {
            offlineOnlineFallback = settings[OFFLINE_ONLINE_FALLBACK_KEY];
        }

        if (Array.isArray(settings[OFFLINE_ACTIVE_PACKS_KEY])) {
            activeOfflinePacks = settings[OFFLINE_ACTIVE_PACKS_KEY].filter(Boolean);
        }

        if (Array.isArray(settings[OFFLINE_ACTIVE_PACK_DATABASES_KEY])) {
            activeOfflinePackDatabases = settings[OFFLINE_ACTIVE_PACK_DATABASES_KEY].filter(Boolean);
        }

        offlineSettingsLoadedAt = now;
    } catch (error) {
        /*
         * Non bloquant : script.js envoie aussi les changements par postMessage.
         */
    }
}

function readOfflineSettings(db) {
    return new Promise((resolve) => {
        const result = {};
        const keys = [
            OFFLINE_TILES_ENABLED_KEY,
            OFFLINE_ONLINE_FALLBACK_KEY,
            OFFLINE_ACTIVE_PACKS_KEY,
            OFFLINE_ACTIVE_PACK_DATABASES_KEY
        ];

        const tx = db.transaction('settings', 'readonly');
        const store = tx.objectStore('settings');
        let pending = keys.length;

        keys.forEach(key => {
            const request = store.get(key);
            request.onsuccess = () => {
                if (request.result) {
                    result[key] = request.result.value;
                }
                pending -= 1;
                if (pending === 0) resolve(result);
            };
            request.onerror = () => {
                pending -= 1;
                if (pending === 0) resolve(result);
            };
        });

        tx.onerror = () => resolve(result);
        tx.onabort = () => resolve(result);
    });
}

self.addEventListener('push', event => {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (error) {
        data = {
            title: 'Pelic Chat',
            body: event.data ? event.data.text() : 'Nouveau message'
        };
    }

    const title = data.title || 'Pelic Chat';
    const options = {
        body: data.body || data.text || 'Nouveau message',
        icon: './icons/icon-192x192.png',
        badge: './icons/icon-192x192.png',
        tag: data.tag || 'pelic-chat',
        data: data
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(self.clients.openWindow('./'));
});
