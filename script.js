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
let userMarker = null, watchId = null;
let userToTargetLayer = null, lftwRouteLayer = null;
let showLftwRoute = true;
const TILE_CACHE_NAME_OFFLINE = 'communes-tile-offline-v1'; // Le cache pour les tuiles téléchargées
const airports = [
    { oaci: "LFLU", name: "Valence-Chabeuil", lat: 44.920, lon: 4.968 }, { oaci: "LFMU", name: "Béziers-Vias", lat: 43.323, lon: 3.354 }, { oaci: "LFJR", name: "Angers-Marcé", lat: 47.560, lon: -0.312 }, { oaci: "LFHO", name: "Aubenas-Ardèche Méridionale", lat: 44.545, lon: 4.385 }, { oaci: "LFLX", name: "Châteauroux-Déols", lat: 46.861, lon: 1.720 }, { oaci: "LFBM", name: "Mont-de-Marsan", lat: 43.894, lon: -0.509 }, { oaci: "LFBL", name: "Limoges-Bellegarde", lat: 45.862, lon: 1.180 }, { oaci: "LFAQ", name: "Albert-Bray", lat: 49.972, lon: 2.698 }, { oaci: "LFBP", name: "Pau-Pyrénées", lat: 43.380, lon: -0.418 }, { oaci: "LFTH", name: "Toulon-Hyères", lat: 43.097, lon: 6.146 }, { oaci: "LFSG", name: "Épinal-Mirecourt", lat: 48.325, lon: 6.068 }, { oaci: "LFKC", name: "Calvi-Sainte-Catherine", lat: 42.530, lon: 8.793 }, { oaci: "LFMD", name: "Cannes-Mandelieu", lat: 43.542, lon: 6.956 }, { oaci: "LFKB", name: "Bastia-Poretta", lat: 42.552, lon: 9.483 }, { oaci: "LFMH", name: "Saint-Étienne-Bouthéon", lat: 45.541, lon: 4.296 }, { oaci: "LFKF", name: "Figari-Sud-Corse", lat: 41.500, lon: 9.097 }, { oaci: "LFCC", name: "Cahors-Lalbenque", lat: 44.351, lon: 1.475 }, { oaci: "LFML", name: "Marseille-Provence", lat: 43.436, lon: 5.215 }, { oaci: "LFKJ", name: "Ajaccio-Napoléon-Bonaparte", lat: 41.923, lon: 8.802 }, { oaci: "LFMK", name: "Carcassonne-Salvaza", lat: 43.215, lon: 2.306 }, { oaci: "LFRV", name: "Vannes-Meucon", lat: 47.720, lon: -2.721 }, { oaci: "LFTW", name: "Nîmes-Garons", lat: 43.757, lon: 4.416 }, { oaci: "LFMP", name: "Perpignan-Rivesaltes", lat: 42.740, lon: 2.870 }, { oaci: "LFBD", name: "Bordeaux-Mérignac", lat: 44.828, lon: -0.691 }
];

// =========================================================================
// FONCTIONS UTILITAIRES
// =========================================================================
const toRad = deg => deg * Math.PI / 180, toDeg = rad => rad * 180 / Math.PI;
const simplifyString = str => typeof str !== 'string' ? '' : str.toLowerCase().replace(/\bst\b/g, 'saint').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, ' ');
const calculateDistanceInNm = (lat1, lon1, lat2, lon2) => { const R = 6371, dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1), a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2), c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return (R * c) / 1.852; };
const calculateBearing = (lat1, lon1, lat2, lon2) => { const lat1Rad = toRad(lat1), lon1Rad = toRad(lon1), lat2Rad = toRad(lat2), lon2Rad = toRad(lon2), dLon = lon2Rad - lon1Rad, y = Math.sin(dLon) * Math.cos(lat2Rad), x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon); let bearingRad = Math.atan2(y, x), bearingDeg = toDeg(bearingRad); return (bearingDeg + 360) % 360; };
const convertToDMM = (deg, type) => { if (deg === null || isNaN(deg)) return 'N/A'; const absDeg = Math.abs(deg), degrees = Math.floor(absDeg), minutesTotal = (absDeg - degrees) * 60, minutesFormatted = minutesTotal.toFixed(2).padStart(5, '0'); let direction = type === 'lat' ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W'); return `${degrees}° ${minutesFormatted}' ${direction}`; };
const levenshteinDistance = (a, b) => { const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null)); for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i; for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j; for (let j = 1; j <= b.length; j += 1) for (let i = 1; i <= a.length; i += 1) { const indicator = a[i - 1] === b[j - 1] ? 0 : 1; matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator); } return matrix[b.length][a.length]; };

// =========================================================================
// LOGIQUE PRINCIPALE DE L'APPLICATION
// =========================================================================
async function initializeApp() {
    const statusMessage = document.getElementById('status-message');
    const searchSection = document.getElementById('search-section');
    loadState();
    const savedLftwState = localStorage.getItem('showLftwRoute');
    showLftwRoute = savedLftwState === null ? true : (savedLftwState === 'true');
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
        } else {
            navigator.geolocation.getCurrentPosition(updateUserPosition, () => {}, { enableHighAccuracy: true });
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

function initMap() {
    if (map) return;
    map = L.map('map', { attributionControl: false, zoomControl: false }).setView([46.6, 2.2], 5.5);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    searchToggleControl = new SearchToggleControl().addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
    permanentAirportLayer = L.layerGroup().addTo(map);
    routesLayer = L.layerGroup().addTo(map);
    userToTargetLayer = L.layerGroup().addTo(map);
    lftwRouteLayer = L.layerGroup().addTo(map);
    drawPermanentAirportMarkers();
    map.on('contextmenu', (e) => {
        L.DomEvent.preventDefault(e.originalEvent);
        const pointName = 'Feu manuel';
        const manualCommune = { nom_standard: pointName, latitude_mairie: e.latlng.lat, longitude_mairie: e.latlng.lng, isManual: true };
        currentCommune = manualCommune;
        localStorage.setItem('currentCommune', JSON.stringify(manualCommune));
        displayCommuneDetails(manualCommune, false);
        document.getElementById('ui-overlay').style.display = 'none';
    });
}

function setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search');
    const airportCountInput = document.getElementById('airport-count');
    const resultsList = document.getElementById('results-list');
    const gpsFeuButton = document.getElementById('gps-feu-button');
    const downloadMapButton = document.getElementById('download-map-button');
    const deleteMapButton = document.getElementById('delete-map-button');
    const liveGpsButton = document.getElementById('live-gps-button');
    const lftwRouteButton = document.getElementById('lftw-route-button');

    searchInput.addEventListener('input', () => { /* ... */ });
    clearSearchBtn.addEventListener('click', () => { /* ... */ });
    airportCountInput.addEventListener('input', () => { if (currentCommune) displayCommuneDetails(currentCommune, false); });
    gpsFeuButton.addEventListener('click', () => { /* ... */ });
    downloadMapButton.addEventListener('click', downloadOfflineMap);
    deleteMapButton.addEventListener('click', deleteOfflineMap);
    liveGpsButton.addEventListener('click', toggleLiveGps);
    lftwRouteButton.addEventListener('click', toggleLftwRoute);
    updateLftwButtonState();

    // Écoute les messages venant du Service Worker
    navigator.serviceWorker.addEventListener('message', event => {
        const { type, payload } = event.data;
        if (type === 'download_progress') {
            const { downloaded, total } = payload;
            const percent = Math.round((downloaded / total) * 100);
            document.getElementById('progress-bar').value = percent;
            document.getElementById('progress-text').textContent = `Téléchargement: ${downloaded} / ${total} tuiles...`;
        } else if (type === 'download_complete') {
            document.getElementById('progress-text').textContent = 'Carte hors ligne téléchargée !';
            document.getElementById('download-map-button').disabled = false;
            localStorage.setItem('offlineMapDownloaded', 'true');
            updateOfflineButtonsState();
        }
    });
}

// ... (fonctions de la v4.3 jusqu'à la gestion de la carte)

// =========================================================================
// GESTION CARTE HORS LIGNE (LOGIQUE FIABILISÉE AVEC MESSAGES SW)
// =========================================================================
function updateOfflineButtonsState() {
    const downloadButton = document.getElementById('download-map-button');
    const deleteButton = document.getElementById('delete-map-button');
    if (localStorage.getItem('offlineMapDownloaded') === 'true') {
        downloadButton.textContent = "Mettre à jour la carte hors ligne";
        deleteButton.style.display = 'block';
    } else {
        downloadButton.textContent = "Télécharger la carte pour usage hors ligne";
        deleteButton.style.display = 'none';
    }
}

function latLonToTileCoords(lat, lon, zoom) {
    const latRad = toRad(lat);
    const n = Math.pow(2, zoom);
    const xtile = Math.floor(n * ((lon + 180) / 360));
    const ytile = Math.floor(n * (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2);
    return { x: xtile, y: ytile };
}

function downloadOfflineMap() {
    if (!navigator.serviceWorker.controller) {
        alert("Service Worker non actif. Veuillez recharger la page et réessayer.");
        return;
    }

    if (!confirm("Ceci va télécharger un volume important de données pour la carte (jusqu'à 1 Go) en arrière-plan. Êtes-vous sûr de vouloir continuer (recommandé en Wi-Fi) ?")) {
        return;
    }

    const downloadButton = document.getElementById('download-map-button');
    const progressContainer = document.getElementById('download-progress');
    
    downloadButton.disabled = true;
    downloadButton.textContent = "Préparation...";
    progressContainer.style.display = 'block';

    // Envoyer le message au Service Worker pour qu'IL fasse le travail
    navigator.serviceWorker.controller.postMessage({ type: 'download_tiles' });
}

async function deleteOfflineMap() {
    if (!confirm("Êtes-vous sûr de vouloir supprimer toutes les données de la carte hors ligne ?")) {
        return;
    }
    if (!navigator.serviceWorker.controller) {
        alert("Service Worker non actif. Veuillez recharger la page et réessayer.");
        return;
    }
    
    // Envoyer le message au Service Worker pour qu'IL fasse le travail
    navigator.serviceWorker.controller.postMessage({ type: 'delete_tiles' });
    
    localStorage.removeItem('offlineMapDownloaded');
    updateOfflineButtonsState();
    alert("La suppression des tuiles a commencé en arrière-plan.");
}

const SearchToggleControl = L.Control.extend({
    // ...
    onAdd: function (map) {
        // ...
        versionDisplay.innerText = 'v5.0';
        // ...
    }
});

// ... (coller le reste des fonctions de la v4.3 ici)
