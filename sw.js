// --- FICHIER sw.js ---

const APP_CACHE_NAME = 'communes-app-cache-v72'; // Version avec JSZip depuis CDN
const DATA_CACHE_NAME = 'communes-data-cache-v1';
const TILE_CACHE_DYNAMIC = 'communes-tile-dynamic-v1';
const TILE_CACHE_NAME_OFFLINE = 'communes-tile-offline-v1';

const APP_SHELL_URLS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './leaflet.min.js',
    './leaflet.css',
    './manifest.json',
    './suncalc.js'
    // jszip.min.js n'est plus dans cette liste
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
                if (cacheName !== APP_CACHE_NAME && cacheName !== DATA_CACHE_NAME && cacheName !== TILE_CACHE_NAME_DYNAMIC && cacheName !== TILE_CACHE_NAME_OFFLINE) {
                    return caches.delete(cacheName);
                }
            })
        )).then(() => self.clients.claim())
    );
});

// ... (le reste du fichier sw.js est identique à la v6.0)
