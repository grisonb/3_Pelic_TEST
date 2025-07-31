// =========================================================================
// INITIALISATION DE L'APPLICATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (typeof L === 'undefined') { document.getElementById('status-message').textContent = "❌ ERREUR : leaflet.min.js non chargé."; return; }
    initializeApp();
});

// =========================================================================
// VARIABLES GLOBALES
// =========================================================================
let allCommunes = [], map, permanentAirportLayer, routesLayer, currentCommune = null;
let disabledAirports = new Set(), waterAirports = new Set(), searchToggleControl;
const MAGNETIC_DECLINATION = 1.0;
let userMarker = null, userRoutePolyline = null, watchId = null;
const TILE_CACHE_NAME_PERSISTENT = 'communes-tile-persistent-v1'; // NOUVEAU NOM DE CACHE
const airports = [
    { oaci: "LFLU", name: "Valence-Chabeuil", lat: 44.920, lon: 4.968 }, { oaci: "LFMU", name: "Béziers-Vias", lat: 43.323, lon: 3.354 }, { oaci: "LFJR", name: "Angers-Marcé", lat: 47.560, lon: -0.312 }, { oaci: "LFHO", name: "Aubenas-Ardèche Méridionale", lat: 44.545, lon: 4.385 }, { oaci: "LFLX", name: "Châteauroux-Déols", lat: 46.861, lon: 1.720 }, { oaci: "LFBM", name: "Mont-de-Marsan", lat: 43.894, lon: -0.509 }, { oaci: "LFBL", name: "Limoges-Bellegarde", lat: 45.862, lon: 1.180 }, { oaci: "LFAQ", name: "Albert-Bray", lat: 49.972, lon: 2.698 }, { oaci: "LFBP", name: "Pau-Pyrénées", lat: 43.380, lon: -0.418 }, { oaci: "LFTH", name: "Toulon-Hyères", lat: 43.097, lon: 6.146 }, { oaci: "LFSG", name: "Épinal-Mirecourt", lat: 48.325, lon: 6.068 }, { oaci: "LFKC", name: "Calvi-Sainte-Catherine", lat: 42.530, lon: 8.793 }, { oaci: "LFMD", name: "Cannes-Mandelieu", lat: 43.542, lon: 6.956 }, { oaci: "LFKB", name: "Bastia-Poretta", lat: 42.552, lon: 9.483 }, { oaci: "LFMH", name: "Saint-Étienne-Bouthéon", lat: 45.541, lon: 4.296 }, { oaci: "LFKF", name: "Figari-Sud-Corse", lat: 41.500, lon: 9.097 }, { oaci: "LFCC", name: "Cahors-Lalbenque", lat: 44.351, lon: 1.475 }, { oaci: "LFML", name: "Marseille-Provence", lat: 43.436, lon: 5.215 }, { oaci: "LFKJ", name: "Ajaccio-Napoléon-Bonaparte", lat: 41.923, lon: 8.802 }, { oaci: "LFMK", name: "Carcassonne-Salvaza", lat: 43.215, lon: 2.306 }, { oaci: "LFRV", name: "Vannes-Meucon", lat: 47.720, lon: -2.721 }, { oaci: "LFTW", name: "Nîmes-Garons", lat: 43.757, lon: 4.416 }, { oaci: "LFMP", name: "Perpignan-Rivesaltes", lat: 42.740, lon: 2.870 }, { oaci: "LFBD", name: "Bordeaux-Mérignac", lat: 44.828, lon: -0.691 }
];

// =========================================================================
// FONCTIONS UTILITAIRES (inchangées)
// =========================================================================
const toRad = deg => deg * Math.PI / 180, toDeg = rad => rad * 180 / Math.PI;
// ... (coller toutes les fonctions utilitaires ici)

// =========================================================================
// LOGIQUE PRINCIPALE DE L'APPLICATION
// =========================================================================
async function initializeApp() {
    const statusMessage = document.getElementById('status-message');
    const searchSection = document.getElementById('search-section');
    loadState();
    try {
        const response = await fetch('./communes.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data || !data.data) throw new Error("Format JSON invalide.");
        allCommunes = data.data.map(c => ({ ...c, normalized_name: simplifyString(c.nom_standard), search_parts: simplifyString(c.nom_standard).split(' ').filter(Boolean), soundex_parts: simplifyString(c.nom_standard).split(' ').filter(Boolean).map(part => soundex(part)) }));
        statusMessage.style.display = 'none';
        searchSection.style.display = 'block';
        initMap();
        setupEventListeners();
        updateOfflineButtonsState();
        if (localStorage.getItem('liveGpsActive') === 'true') {
            toggleLiveGps();
        }
        const savedCommuneJSON = localStorage.getItem('currentCommune');
        if (savedCommuneJSON) {
            currentCommune = JSON.parse(savedCommuneJSON);
            displayCommuneDetails(currentCommune, true);
            document.getElementById('ui-overlay').style.display = 'none';
        }
    } catch (error) {
        statusMessage.textContent = `❌ Erreur: ${error.message}`;
    }
}

// ... (initMap, setupEventListeners, displayResults, displayCommuneDetails, drawRoute, etc. sont inchangés) ...
// ... (copier-coller le bloc complet de la version précédente)

// =========================================================================
// GESTION CARTE HORS LIGNE (LOGIQUE FIABILISÉE)
// =========================================================================
function updateOfflineButtonsState() {
    const downloadButton = document.getElementById('download-map-button');
    const deleteButton = document.getElementById('delete-map-button');
    
    // On se base sur le localStorage, c'est instantané
    if (localStorage.getItem('offlineMapDownloaded') === 'true') {
        downloadButton.textContent = "Mettre à jour la carte hors ligne";
        deleteButton.style.display = 'block';
    } else {
        downloadButton.textContent = "Télécharger la carte pour usage hors ligne";
        deleteButton.style.display = 'none';
    }
}

function latLonToTileCoords(lat, lon, zoom) { /* ... inchangé ... */ }

async function downloadOfflineMap() {
    const downloadButton = document.getElementById('download-map-button');
    const progressContainer = document.getElementById('download-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    if (!confirm("Ceci va télécharger un volume important de données pour la carte (jusqu'à 1 Go). Êtes-vous sûr de vouloir continuer (recommandé en Wi-Fi) ?")) {
        return;
    }

    downloadButton.disabled = true;
    downloadButton.textContent = "Téléchargement en cours...";
    progressContainer.style.display = 'block';

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
    const totalTiles = tilesToFetch.length;
    let downloadedCount = 0;
    progressText.textContent = `Vérification de 0 / ${totalTiles} tuiles...`;
    
    const tileCache = await caches.open(TILE_CACHE_NAME_PERSISTENT); // Utilise le nouveau nom

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
                } catch (error) {
                    console.warn(`Impossible de télécharger la tuile ${url}:`, error);
                }
            }
        }));

        downloadedCount += chunk.length;
        const percent = Math.round((downloadedCount / totalTiles) * 100);
        progressBar.value = percent;
        progressText.textContent = `Vérification/Téléchargement: ${downloadedCount} / ${totalTiles} tuiles...`;

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    progressText.textContent = 'Carte hors ligne téléchargée !';
    downloadButton.disabled = false;
    localStorage.setItem('offlineMapDownloaded', 'true'); // On met le drapeau
    updateOfflineButtonsState();
}

async function deleteOfflineMap() {
    if (!confirm("Êtes-vous sûr de vouloir supprimer toutes les données de la carte hors ligne ?")) {
        return;
    }
    const progressContainer = document.getElementById('download-progress');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');

    progressContainer.style.display = 'block';
    progressText.textContent = 'Suppression des données de la carte...';
    progressBar.value = 0;

    await caches.delete(TILE_CACHE_NAME_PERSISTENT); // Utilise le nouveau nom

    progressText.textContent = 'Données supprimées.';
    progressBar.value = 100;
    setTimeout(() => {
        progressContainer.style.display = 'none';
    }, 2000);
    
    localStorage.removeItem('offlineMapDownloaded'); // On retire le drapeau
    updateOfflineButtonsState();
}

const SearchToggleControl = L.Control.extend({
    // ... (inchangé)
    onAdd: function (map) {
        // ...
        versionDisplay.innerText = 'v3.1'; // Nouvelle version
        // ...
    }
    // ...
});

// ... (soundex, etc.)
