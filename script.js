// =========================================================================
// INITIALISATION DE L'APPLICATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (typeof L === 'undefined') {
        document.getElementById('status-message').textContent = "❌ ERREUR : leaflet.min.js non chargé.";
        return;
    }
    initializeApp();
});

// =========================================================================
// VARIABLES GLOBALES
// =========================================================================
let allCommunes = [];
let map;
let searchToggleControl;
let currentCommune = null;
let disabledAirports = new Set();
let waterAirports = new Set();
let dynamicMarkers = [];
let permanentMarkers = [];

const searchInput = document.getElementById('search-input');
const resultsList = document.getElementById('results-list');
const clearSearchBtn = document.getElementById('clear-search');
const airportCountInput = document.getElementById('airport-count');
const offlineStatus = document.getElementById('offline-status');
const versionDisplay = document.querySelector('.version-display');
if (versionDisplay) {
    versionDisplay.textContent = `v${APP_CACHE_NAME.split('-v')[1]}`;
}

const airports = [
    { oaci: "LFLU", name: "Valence-Chabeuil", lat: 44.920, lon: 4.968 }, { oaci: "LFMU", name: "Béziers-Vias", lat: 43.323, lon: 3.354 },
    { oaci: "LFJR", name: "Angers-Marcé", lat: 47.560, lon: -0.312 }, { oaci: "LFHO", name: "Aubenas-Ardèche Méridionale", lat: 44.545, lon: 4.385 },
    { oaci: "LFLX", name: "Châteauroux-Déols", lat: 46.861, lon: 1.720 }, { oaci: "LFBM", name: "Mont-de-Marsan", lat: 43.894, lon: -0.509 },
    { oaci: "LFBL", name: "Limoges-Bellegarde", lat: 45.862, lon: 1.180 }, { oaci: "LFAQ", name: "Albert-Bray", lat: 49.972, lon: 2.698 },
    { oaci: "LFBP", name: "Pau-Pyrénées", lat: 43.380, lon: -0.418 }, { oaci: "LFTH", name: "Toulon-Hyères", lat: 43.097, lon: 6.146 },
    { oaci: "LFSG", name: "Épinal-Mirecourt", lat: 48.325, lon: 6.068 }, { oaci: "LFKC", name: "Calvi-Sainte-Catherine", lat: 42.530, lon: 8.793 },
    { oaci: "LFMD", name: "Cannes-Mandelieu", lat: 43.542, lon: 6.956 }, { oaci: "LFKB", name: "Bastia-Poretta", lat: 42.552, lon: 9.483 },
    { oaci: "LFMH", name: "Saint-Étienne-Bouthéon", lat: 45.541, lon: 4.296 }, { oaci: "LFKF", name: "Figari-Sud-Corse", lat: 41.500, lon: 9.097 },
    { oaci: "LFCC", name: "Cahors-Lalbenque", lat: 44.351, lon: 1.475 }, { oaci: "LFML", name: "Marseille-Provence", lat: 43.436, lon: 5.215 },
    { oaci: "LFKJ", name: "Ajaccio-Napoléon-Bonaparte", lat: 41.923, lon: 8.802 }, { oaci: "LFMK", name: "Carcassonne-Salvaza", lat: 43.215, lon: 2.306 },
    { oaci: "LFRV", name: "Vannes-Meucon", lat: 47.720, lon: -2.721 }, { oaci: "LFTW", name: "Nîmes-Garons", lat: 43.757, lon: 4.416 },
    { oaci: "LFMP", name: "Perpignan-Rivesaltes", lat: 42.740, lon: 2.870 }, { oaci: "LFBD", name: "Bordeaux-Mérignac", lat: 44.828, lon: -0.691 }
];

// =========================================================================
// FONCTIONS UTILITAIRES
// =========================================================================
const toRad = deg => deg * Math.PI / 180;
const simplifyString = str => typeof str !== 'string' ? '' : str.toLowerCase().replace(/\bst\b/g, 'saint').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, ' ');
const calculateDistanceInNm = (lat1, lon1, lat2, lon2) => { const R = 6371; const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1); const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return (R * c) / 1.852; };

// =========================================================================
// LOGIQUE PRINCIPALE
// =========================================================================
async function initializeApp() {
    const statusMessage = document.getElementById('status-message');
    const searchSection = document.getElementById('search-section');
    loadState(); // Charge l'état des aéroports (activé/désactivé)

    try {
        const response = await fetch('https://map-assets.s3.amazonaws.com/communes.json');
        if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        const data = await response.json();
        if (!data || !data.data) throw new Error("Format JSON invalide.");
        
        allCommunes = data.data.map(c => ({...c, normalized_name: simplifyString(c.nom_standard)}));
        
        statusMessage.style.display = 'none';
        searchSection.style.display = 'block';
        
        initMap();
        setupEventListeners();

        // AJOUTÉ : Vérifier s'il y a une commune sauvegardée dans le localStorage
        const savedCommuneName = localStorage.getItem('selectedCommuneName');
        if (savedCommuneName) {
            const savedCommune = allCommunes.find(c => c.nom_standard === savedCommuneName);
            if (savedCommune) {
                // Un petit délai pour s'assurer que la carte est prête
                setTimeout(() => {
                    selectCommune(savedCommune);
                }, 100);
            }
        }

    } catch (error) {
        statusMessage.textContent = `❌ Erreur de chargement des données: ${error.message}`;
        console.error(error);
    }
}

function setupEventListeners() {
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('focus', () => searchInput.select());
    clearSearchBtn.addEventListener('click', clearAndFocus);
    airportCountInput.addEventListener('change', () => {
        saveState();
        if (currentCommune) {
            updateMapWithSelection(currentCommune);
        }
    });
    document.addEventListener('click', (e) => {
        if (!document.getElementById('search-section').contains(e.target)) {
            resultsList.style.display = 'none';
        }
    });
}

function handleSearchInput() {
    const query = searchInput.value.trim();
    if (query.length < 2) {
        resultsList.style.display = 'none';
        clearSearchBtn.style.display = query.length > 0 ? 'block' : 'none';
        return;
    }
    clearSearchBtn.style.display = 'block';
    const simplifiedQuery = simplifyString(query);
    const results = allCommunes.filter(c => c.normalized_name.includes(simplifiedQuery)).slice(0, 100);
    displayResults(results);
}

function displayResults(results) {
    if (results.length === 0) {
        resultsList.style.display = 'none';
        return;
    }
    resultsList.innerHTML = '';
    results.forEach(commune => {
        const li = document.createElement('li');
        li.textContent = `${commune.nom_standard} (${commune.code_postal})`;
        li.addEventListener('click', () => selectCommune(commune));
        resultsList.appendChild(li);
    });
    resultsList.style.display = 'block';
}

function selectCommune(commune) {
    currentCommune = commune;
    searchInput.value = commune.nom_standard;
    resultsList.innerHTML = '';
    resultsList.style.display = 'none';
    clearSearchBtn.style.display = 'block';

    // AJOUTÉ : Sauvegarde le nom de la commune dans le localStorage
    localStorage.setItem('selectedCommuneName', commune.nom_standard);

    updateMapWithSelection(commune);
}

function clearAndFocus() {
    clearSearchInput();
    searchInput.focus();
}

function clearSearchInput() {
    searchInput.value = '';
    resultsList.style.display = 'none';
    clearSearchBtn.style.display = 'none';
    
    // AJOUTÉ : Efface la commune sauvegardée et réinitialise l'état
    localStorage.removeItem('selectedCommuneName');
    currentCommune = null;

    removeDynamicElements(); // Enlève les marqueurs et les lignes
    searchToggleControl.updateCommuneDisplay(null); // Met à jour le contrôle sur la carte
}

function updateMapWithSelection(commune) {
    removeDynamicElements();
    
    const communeMarker = createMarker(commune, 'commune-marker', 'C');
    dynamicMarkers.push(communeMarker);
    
    const nearestAirports = findNearestAirports(commune);
    
    const bounds = L.latLngBounds([L.latLng(commune.latitude, commune.longitude)]);
    
    nearestAirports.forEach(airportInfo => {
        const airportMarker = permanentMarkers.find(m => m.options.oaci === airportInfo.oaci);
        if (airportMarker) {
            bounds.extend(airportMarker.getLatLng());
            drawRoute(commune, airportInfo, 'blue');
        }
    });
    
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    searchToggleControl.updateCommuneDisplay(commune.nom_standard);
}

function findNearestAirports(commune) {
    const activeAirports = airports.filter(a => !disabledAirports.has(a.oaci));
    const distances = activeAirports.map(airport => ({
        ...airport,
        distance: calculateDistanceInNm(commune.latitude, commune.longitude, airport.lat, airport.lon)
    }));
    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(0, parseInt(airportCountInput.value, 10));
}

// =========================================================================
// GESTION DE LA CARTE (LEAFLET)
// =========================================================================
function initMap() {
    map = L.map('map', {
        center: [46.603354, 1.888334],
        zoom: 6,
        zoomControl: true,
        attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
    }).addTo(map);

    addPermanentMarkers();
    addSearchToggleControl();
    
    if (navigator.geolocation) {
        map.locate({ setView: true, maxZoom: 10 });
        map.on('locationfound', onLocationFound);
    }
}

function onLocationFound(e) {
    const userMarker = createMarker({ latitude: e.latitude, longitude: e.longitude }, 'user-marker', '★');
    dynamicMarkers.push(userMarker);
}

function addPermanentMarkers() {
    airports.forEach(airport => {
        const marker = createMarker(
            { latitude: airport.lat, longitude: airport.lon },
            getAirportMarkerClass(airport.oaci),
            getAirportMarkerLabel(airport.oaci)
        );
        marker.options.oaci = airport.oaci;
        marker.on('click', () => onAirportClick(airport));
        permanentMarkers.push(marker);
    });
}

function getAirportMarkerClass(oaci) {
    if (disabledAirports.has(oaci)) return 'airport-marker-disabled';
    if (waterAirports.has(oaci)) return 'airport-marker-water';
    return 'airport-marker-active';
}

function getAirportMarkerLabel(oaci) {
    if (disabledAirports.has(oaci)) return 'X';
    if (waterAirports.has(oaci)) return 'E';
    return 'P';
}

function createMarker(coords, className, label) {
    const icon = L.divIcon({
        className: `custom-marker-icon ${className} airport-marker-base`,
        html: `<span>${label}</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
    return L.marker([coords.latitude, coords.longitude], { icon }).addTo(map);
}

function drawRoute(commune, airport) {
    const latlngs = [
        [commune.latitude, commune.longitude],
        [airport.lat, airport.lon]
    ];
    const polyline = L.polyline(latlngs, {
        color: waterAirports.has(airport.oaci) ? 'blue' : 'green',
        weight: 2,
        opacity: 0.8
    }).addTo(map);

    const tooltipContent = `${Math.round(airport.distance)} NM`;
    polyline.bindTooltip(tooltipContent, {
        permanent: true,
        direction: 'center',
        className: 'route-tooltip'
    }).openTooltip();

    dynamicMarkers.push(polyline);
}

function onAirportClick(airport) {
    const popupContent = document.createElement('div');
    popupContent.className = 'airport-popup';
    popupContent.innerHTML = `<strong>${airport.name} (${airport.oaci})</strong>`;

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'popup-buttons';

    // Bouton Eau/Pélican
    const waterBtn = document.createElement('button');
    waterBtn.className = 'water-btn';
    waterBtn.textContent = waterAirports.has(airport.oaci) ? 'Pélic.' : 'Eau';
    waterBtn.onclick = () => {
        toggleAirportState(airport.oaci, 'water');
        map.closePopup();
    };

    // Bouton Activer/Désactiver
    const toggleBtn = document.createElement('button');
    if (disabledAirports.has(airport.oaci)) {
        toggleBtn.textContent = 'Activer';
        toggleBtn.className = 'enable-btn';
    } else {
        toggleBtn.textContent = 'Désact.';
        toggleBtn.className = 'disable-btn';
    }
    toggleBtn.onclick = () => {
        toggleAirportState(airport.oaci, 'disabled');
        map.closePopup();
    };
    
    buttonsContainer.appendChild(waterBtn);
    buttonsContainer.appendChild(toggleBtn);
    popupContent.appendChild(buttonsContainer);
    
    L.popup()
     .setLatLng([airport.lat, airport.lon])
     .setContent(popupContent)
     .openOn(map);
}

function toggleAirportState(oaci, type) {
    const stateSet = type === 'water' ? waterAirports : disabledAirports;
    if (stateSet.has(oaci)) {
        stateSet.delete(oaci);
    } else {
        stateSet.add(oaci);
        // Un aéroport ne peut pas être à la fois désactivé et sur l'eau
        if (type === 'water') disabledAirports.delete(oaci);
        if (type === 'disabled') waterAirports.delete(oaci);
    }
    updateAirportMarkers();
    saveState();
    if (currentCommune) {
        updateMapWithSelection(currentCommune);
    }
}

function updateAirportMarkers() {
    permanentMarkers.forEach(marker => {
        const oaci = marker.options.oaci;
        const icon = marker.options.icon;
        icon.options.className = `custom-marker-icon ${getAirportMarkerClass(oaci)} airport-marker-base`;
        icon.options.html = `<span>${getAirportMarkerLabel(oaci)}</span>`;
        marker.setIcon(icon);
    });
}

function removeDynamicElements() {
    dynamicMarkers.forEach(m => map.removeLayer(m));
    dynamicMarkers = [];
}

// =========================================================================
// CONTRÔLE PERSONNALISÉ LEAFLET
// =========================================================================
function addSearchToggleControl() {
    L.Control.SearchToggle = L.Control.extend({
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar search-toggle-container');
            this._button = L.DomUtil.create('a', 'search-toggle-button', container);
            this._communeDisplay = L.DomUtil.create('div', 'commune-display-control', container);
            
            this._button.innerHTML = '🔍';
            this._button.href = '#';
            this._button.setAttribute('role', 'button');
            this._button.title = 'Rechercher une commune';

            const searchUI = document.getElementById('ui-overlay');
            
            L.DomEvent.on(this._button, 'click', L.DomEvent.stop)
                      .on(this._button, 'click', function() {
                          searchUI.style.display = searchUI.style.display === 'none' ? 'block' : 'none';
                          if (searchUI.style.display === 'block') {
                            searchInput.focus();
                          }
                      });

            L.DomEvent.disableClickPropagation(container);
            return container;
        },
        updateCommuneDisplay: function(communeName) {
            if (communeName) {
                this._communeDisplay.textContent = communeName;
                this._communeDisplay.style.display = 'block';
            } else {
                this._communeDisplay.style.display = 'none';
            }
        }
    });

    L.control.searchToggle = function(opts) {
        return new L.Control.SearchToggle(opts);
    }

    searchToggleControl = L.control.searchToggle({ position: 'topleft' }).addTo(map);
}

// =========================================================================
// PERSISTANCE DES DONNÉES
// =========================================================================
function saveState() {
    const state = {
        disabled: Array.from(disabledAirports),
        water: Array.from(waterAirports),
        airportCount: airportCountInput.value
    };
    localStorage.setItem('airportAppState', JSON.stringify(state));
}

function loadState() {
    const state = JSON.parse(localStorage.getItem('airportAppState'));
    if (state) {
        disabledAirports = new Set(state.disabled || []);
        waterAirports = new Set(state.water || []);
        airportCountInput.value = state.airportCount || 3;
    }
}
