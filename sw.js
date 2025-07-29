// --- NOUVEAU CONTENU COMPLET ET CORRIGÉ POUR sw.js ---

// MODIFICATION ICI 👇
const APP_CACHE_NAME = 'communes-app-cache-v29'; // Version incrémentée
const TILE_CACHE_NAME = 'communes-tile-cache-v29';
const DATA_CACHE_NAME = 'communes-data-cache-v29'; // Pas besoin de changer, les données n'ont pas changé

// On utilise des chemins relatifs pour que ça fonctionne partout
const APP_SHELL_URLS = [
    './', 
    './index.html', 
    './style.css', 
    './script.js',
    './leaflet.min.js', 
    './leaflet.css', 
    './manifest.json'
];

// ... le reste du fichier sw.js reste identique ...
