// Contenu temporaire pour sw.js - Le "SW Suicide"
self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    console.log("Suppression de l'ancien cache:", cacheName);
                    return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});
