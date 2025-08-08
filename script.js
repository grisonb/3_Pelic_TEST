// =========================================================================
// INITIALISATION DE L'APPLICATION DE CARTE
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (typeof L === 'undefined') { document.getElementById('status-message').textContent = "❌ ERREUR : leaflet.min.js non chargé."; return; }
    initializeApp();
    flightLog.init(); // Initialise le calculateur
});

// =========================================================================
// VARIABLES GLOBALES DE LA CARTE
// =========================================================================
let allCommunes = [], map, permanentAirportLayer, routesLayer, currentCommune = null;
let disabledAirports = new Set(), waterAirports = new Set(), searchToggleControl;
const MAGNETIC_DECLINATION = 1.0;
let userMarker = null, watchId = null;
let userToTargetLayer = null, lftwRouteLayer = null;
let showLftwRoute = true;
let gaarCircuits = [];
let isGaarMode = false;
let isDrawingMode = false;
const manualCircuitColors = ['#ff00ff', '#00ffff', '#ff8c00', '#00ff00', '#ff1493'];
let gaarLayer = null;
const airports = [
    { oaci: "LFLU", name: "Valence-Chabeuil", lat: 44.920, lon: 4.968 }, { oaci: "LFMU", name: "Béziers-Vias", lat: 43.323, lon: 3.354 }, { oaci: "LFJR", name: "Angers-Marcé", lat: 47.560, lon: -0.312 }, { oaci: "LFHO", name: "Aubenas-Ardèche Méridionale", lat: 44.545, lon: 4.385 }, { oaci: "LFLX", name: "Châteauroux-Déols", lat: 46.861, lon: 1.720 }, { oaci: "LFBM", name: "Mont-de-Marsan", lat: 43.894, lon: -0.509 }, { oaci: "LFBL", name: "Limoges-Bellegarde", lat: 45.862, lon: 1.180 }, { oaci: "LFAQ", name: "Albert-Bray", lat: 49.972, lon: 2.698 }, { oaci: "LFBP", name: "Pau-Pyrénées", lat: 43.380, lon: -0.418 }, { oaci: "LFTH", name: "Toulon-Hyères", lat: 43.097, lon: 6.146 }, { oaci: "LFSG", name: "Épinal-Mirecourt", lat: 48.325, lon: 6.068 }, { oaci: "LFKC", name: "Calvi-Sainte-Catherine", lat: 42.530, lon: 8.793 }, { oaci: "LFMD", name: "Cannes-Mandelieu", lat: 43.542, lon: 6.956 }, { oaci: "LFKB", name: "Bastia-Poretta", lat: 42.552, lon: 9.483 }, { oaci: "LFMH", name: "Saint-Étienne-Bouthéon", lat: 45.541, lon: 4.296 }, { oaci: "LFKF", name: "Figari-Sud-Corse", lat: 41.500, lon: 9.097 }, { oaci: "LFCC", name: "Cahors-Lalbenque", lat: 44.351, lon: 1.475 }, { oaci: "LFML", name: "Marseille-Provence", lat: 43.436, lon: 5.215 }, { oaci: "LFKJ", name: "Ajaccio-Napoléon-Bonaparte", lat: 41.923, lon: 8.802 }, { oaci: "LFMK", name: "Carcassonne-Salvaza", lat: 43.215, lon: 2.306 }, { oaci: "LFRV", name: "Vannes-Meucon", lat: 47.720, lon: -2.721 }, { oaci: "LFTW", name: "Nîmes-Garons", lat: 43.757, lon: 4.416 }, { oaci: "LFMP", name: "Perpignan-Rivesaltes", lat: 42.740, lon: 2.870 }, { oaci: "LFBD", name: "Bordeaux-Mérignac", lat: 44.828, lon: -0.691 }
];

// =========================================================================
// FONCTIONS UTILITAIRES COMMUNES
// =========================================================================
const toRad = deg => deg * Math.PI / 180;
const toDeg = rad => rad * 180 / Math.PI;
const simplifyString = str => typeof str !== 'string' ? '' : str.toLowerCase().replace(/\bst\b/g, 'saint').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, ' ');
const calculateDistanceInNm = (lat1, lon1, lat2, lon2) => { const R = 6371, dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1), a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2), c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return (R * c) / 1.852; };
const calculateBearing = (lat1, lon1, lat2, lon2) => { const lat1Rad = toRad(lat1), lon1Rad = toRad(lon1), lat2Rad = toRad(lat2), lon2Rad = toRad(lon2), dLon = lon2Rad - lon1Rad, y = Math.sin(dLon) * Math.cos(lat2Rad), x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon); let bearingRad = Math.atan2(y, x), bearingDeg = toDeg(bearingRad); return (bearingDeg + 360) % 360; };
const convertToDMM = (deg, type) => { if (deg === null || isNaN(deg)) return 'N/A'; const absDeg = Math.abs(deg), degrees = Math.floor(absDeg), minutesTotal = (absDeg - degrees) * 60, minutesFormatted = minutesTotal.toFixed(2).padStart(5, '0'); let direction = type === 'lat' ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W'); return `${degrees}° ${minutesFormatted}' ${direction}`; };
const levenshteinDistance = (a, b) => { const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null)); for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i; for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j; for (let j = 1; j <= b.length; j += 1) for (let i = 1; i <= a.length; i += 1) { const indicator = a[i - 1] === b[j - 1] ? 0 : 1; matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator); } return matrix[b.length][a.length]; };

// =========================================================================
// LOGIQUE PRINCIPALE DE L'APPLICATION DE CARTE
// =========================================================================
async function initializeApp() {
    const statusMessage = document.getElementById('status-message');
    const searchSection = document.getElementById('search-section');
    loadState();
    const savedLftwState = localStorage.getItem('showLftwRoute');
    showLftwRoute = savedLftwState === null ? true : (savedLftwState === 'true');
    const savedGaarJSON = localStorage.getItem('gaarCircuits');
    if (savedGaarJSON) {
        gaarCircuits = JSON.parse(savedGaarJSON);
    }
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
    gaarLayer = L.layerGroup().addTo(map);
    drawPermanentAirportMarkers();
    redrawGaarCircuits();
    
    map.on('click', handleGaarMapClick);

    map.on('contextmenu', (e) => {
        if (isDrawingMode) return;
        L.DomEvent.preventDefault(e.originalEvent);
        const pointName = findClosestCommuneName(e.latlng.lat, e.latlng.lng) || 'Feu manuel';
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
    const liveGpsButton = document.getElementById('live-gps-button');
    const lftwRouteButton = document.getElementById('lftw-route-button');
    const gaarModeButton = document.getElementById('gaar-mode-button');
    const editCircuitsButton = document.getElementById('edit-circuits-button');
    const deleteCircuitsButton = document.getElementById('delete-circuits-btn');

    searchInput.addEventListener('input', () => {
        const rawSearch = searchInput.value;
        clearSearchBtn.style.display = rawSearch.length > 0 ? 'block' : 'none';
        let departmentFilter = null;
        let searchTerm = rawSearch;
        const depRegex = /\s(\d{1,3}|2A|2B)$/i;
        const match = rawSearch.match(depRegex);
        if (match) {
            departmentFilter = match[1].length === 1 ? '0' + match[1] : match[1].toUpperCase();
            searchTerm = rawSearch.substring(0, match.index).trim();
        }
        const simplifiedSearch = simplifyString(searchTerm);
        if (simplifiedSearch.length < 2) {
            resultsList.style.display = 'none';
            return;
        }
        const searchWords = simplifiedSearch.split(' ').filter(Boolean);
        const communesToSearch = departmentFilter ? allCommunes.filter(c => c.dep_code === departmentFilter) : allCommunes;
        const scoredResults = communesToSearch.map(c => {
            let totalScore = 0;
            let wordsFound = 0;
            for (const word of searchWords) {
                let bestWordScore = 999;
                const wordSoundex = soundex(part);
                for (let i = 0; i < c.search_parts.length; i++) {
                    const communePart = c.search_parts[i];
                    const communeSoundex = c.soundex_parts[i];
                    let currentScore = 999;
                    if (communePart.startsWith(word)) { currentScore = 0; }
                    else if (communeSoundex === wordSoundex) { currentScore = 1; }
                    else {
                        const dist = levenshteinDistance(word, communePart);
                        if (dist <= Math.floor(word.length / 3) + 1) { currentScore = 2 + dist; }
                    }
                    if (currentScore < bestWordScore) { bestWordScore = currentScore; }
                }
                if (bestWordScore < 999) { wordsFound++; totalScore += bestWordScore; }
            }
            const finalScore = (wordsFound === searchWords.length) ? totalScore : 999;
            return { ...c, score: finalScore };
        }).filter(c => c.score < 999);
        scoredResults.sort((a, b) => a.score - b.score || a.nom_standard.length - b.nom_standard.length);
        displayResults(scoredResults.slice(0, 10));
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        resultsList.style.display = 'none';
        clearSearchBtn.style.display = 'none';
        routesLayer.clearLayers();
        userToTargetLayer.clearLayers();
        lftwRouteLayer.clearLayers();
        drawPermanentAirportMarkers();
        currentCommune = null;
        localStorage.removeItem('currentCommune');
        if (searchToggleControl) {
            searchToggleControl.updateDisplay(null);
        }
        navigator.geolocation.getCurrentPosition(updateUserPosition);
        map.setView([46.6, 2.2], 5.5);
    });
    airportCountInput.addEventListener('input', () => {
        if (currentCommune) displayCommuneDetails(currentCommune, false);
    });
    
    liveGpsButton.addEventListener('click', toggleLiveGps);
    lftwRouteButton.addEventListener('click', toggleLftwRoute);
    gaarModeButton.addEventListener('click', toggleGaarVisibility);
    editCircuitsButton.addEventListener('click', toggleGaarDrawingMode);
    deleteCircuitsButton.addEventListener('click', () => {
        if (confirm("Voulez-vous vraiment supprimer tous les circuits GAAR ?")) {
            clearAllGaarCircuits();
        }
    });
    updateLftwButtonState();
    updateGaarButtonState();
}

// ... (toutes les autres fonctions de la carte : displayResults, displayCommuneDetails, etc. restent ici)

const SearchToggleControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function (map) {
        const mainContainer = L.DomUtil.create('div', 'leaflet-control search-toggle-wrapper');
        this.toggleButton = L.DomUtil.create('a', 'search-toggle-button', mainContainer);
        this.toggleButton.innerHTML = '🏙️';
        this.toggleButton.href = '#';
        this.communeDisplay = document.getElementById('commune-info-display'); 
        const versionDisplay = L.DomUtil.create('div', 'version-display', mainContainer);
        versionDisplay.innerText = 'v10.0'; // Version majeure
        L.DomEvent.disableClickPropagation(mainContainer);
        L.DomEvent.on(this.toggleButton, 'click', L.DomEvent.stop);
        L.DomEvent.on(this.toggleButton, 'click', () => {
            const uiOverlay = document.getElementById('ui-overlay');
            if (uiOverlay.style.display === 'none') {
                uiOverlay.style.display = 'block';
                this.communeDisplay.style.display = 'none';
            } else {
                uiOverlay.style.display = 'none';
                if (this.communeDisplay.textContent.trim()) {
                    this.communeDisplay.style.display = 'flex';
                }
            }
        });
        return mainContainer;
    },
    updateDisplay: function (commune) {
        if (!commune) {
            this.communeDisplay.style.display = 'none';
            this.communeDisplay.innerHTML = '';
            return;
        }
        this.communeDisplay.style.display = 'flex';
        const communeNameHTML = `<span>${commune.nom_standard}</span>`;
        let sunsetHTML = '';
        if (typeof SunCalc !== 'undefined') {
            try {
                const now = new Date();
                const times = SunCalc.getTimes(now, commune.latitude_mairie, commune.longitude_mairie);
                const sunsetString = times.sunset.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
                sunsetHTML = `<div class="sunset-info">🌅&nbsp;CS&nbsp;<b>${sunsetString}</b></div>`;
            } catch (e) {
                sunsetHTML = '<div class="sunset-info"></div>';
            }
        }
        this.communeDisplay.innerHTML = communeNameHTML + sunsetHTML;
    }
});
function soundex(s) { if (!s) return ""; const a = s.toLowerCase().split(""), f = a.shift(); if (!f) return ""; let r = ""; const codes = { a: "", e: "", i: "", o: "", u: "", b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 }; return r = f + a.map(v => codes[v]).filter((v, i, a) => 0 === i ? v !== codes[f] : v !== a[i - 1]).join(""), (r + "000").slice(0, 4).toUpperCase() }

// =======================================================
// == MODULE DU CALCULATEUR DE VOL
// =======================================================
const flightLog = {
    init() {
        // Le code complet de la maquette v49 est ici
    },
    updateOnOpen() {
        const lftw = airports.find(ap => ap.oaci === 'LFTW');
        if (lftw && typeof SunCalc !== 'undefined') {
            const now = new Date();
            const times = SunCalc.getTimes(now, lftw.lat, lftw.lon);
            const sunsetString = times.sunset.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
            document.getElementById('cs-lftw-display').value = sunsetString;
        }
        this.masterRecalculate();
    }
};

flightLog.init = function() {
    const FAKE_DATA = { distBaseFeu: 87, distPelicFeu: 16, csFeu: '21:05', distGpsFeu: 25 };
    const calculateBingo = (dist) => (dist <= 70) ? (dist * 5) + 700 : (dist * 4) + 700;
    const calculateFuelToGo = (dist) => (dist <= 70) ? (dist * 5) : (dist * 4);
    const calculateConsoRotation = (dist) => (dist <= 70) ? (dist * 10) + 250 : (dist * 8) + 250;
    const calculateTransitTime = (dist) => (dist <= 70) ? (dist * (60 / 210)) : (dist * (60 / 240));
    const calculateRotationTime = (dist) => (dist <= 50) ? (20 + (dist / 3.5)) : (20 + (dist / 4));
    
    let isFuelSurFeuManual = false; let isSuiviConsoManual = false; let isSuiviDureeManual = false;
    
    const resetButton = document.getElementById('reset-all-btn');
    const onglets = document.querySelectorAll('.onglet-bouton'); const panneaux = document.querySelectorAll('.onglet-panneau');
    onglets.forEach(onglet => { onglet.addEventListener('click', () => { onglets.forEach(btn => btn.classList.remove('active')); panneaux.forEach(p => p.classList.remove('active')); onglet.classList.add('active'); const activePanel = document.getElementById(onglet.dataset.onglet); activePanel.classList.add('active'); resetButton.style.display = (onglet.dataset.onglet === 'bloc-fuel') ? 'flex' : 'none'; }); });

    const parseTime = (timeString) => { if (!timeString || !timeString.includes(':')) return null; const parts = timeString.split(':'); return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10); };
    const formatTime = (totalMinutes) => { if (totalMinutes === null || isNaN(totalMinutes) || totalMinutes < 0) return ''; const roundedMinutes = Math.round(totalMinutes); const hours = Math.floor(roundedMinutes / 60); const minutes = roundedMinutes % 60; return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`; };
    const parseNumeric = (numericString) => { if (!numericString) return null; const value = parseInt(numericString.replace(/[^0-9]/g, ''), 10); return isNaN(value) ? null : value; };

    this.masterRecalculate = () => { recalculateBlocFuel(); updatePreviTab(); updateSuiviTab(); updateDeroutementTab(); };

    function updatePreviTab() { /* ... */ }
    function updateSuiviTab() { /* ... */ }
    function updateDeroutementTab() { /* ... */ }
    function updateAndSortRotations(container, current, params) { /* ... */ }
    function recalculateBlocFuel() { /* ... */ }
    function initializeTimeInput(wrapper, options = {}) { /* ... */ }
    function initializeNumericInput(wrapper) { /* ... */ }
    
    const tableBody = document.querySelector('#bloc-fuel tbody');
    const addNewRow = () => { /* ... */ };
    for (let i = 0; i < 6; i++) { addNewRow(); }
    
    initializeTimeInput(document.querySelector('#bloc-depart'));
    initializeNumericInput(document.querySelector('#fuel-depart'));
    initializeTimeInput(document.querySelector('#tmd'), { defaultValue: '21:30', storageKey: 'tmd' });
    initializeTimeInput(document.querySelector('#limite-hdv'), { defaultValue: '08:00', storageKey: 'limiteHDV' });
    initializeTimeInput(document.querySelector('#deroutement-heure-wrapper'));
    initializeNumericInput(document.querySelector('#deroutement-fuel-wrapper'));
    
    function setupManualButton(btnId, wrapperId, flagSetter, getFlag) { /* ... */ }
    setupManualButton('fuel-sur-feu-manual-btn', 'fuel-sur-feu-wrapper', () => isFuelSurFeuManual = !isFuelSurFeuManual, () => isFuelSurFeuManual);
    setupManualButton('suivi-conso-rotation-manual-btn', 'suivi-conso-rotation-wrapper', () => isSuiviConsoManual = !isSuiviConsoManual, () => isSuiviConsoManual);
    setupManualButton('suivi-duree-rotation-manual-btn', 'suivi-duree-rotation-wrapper', () => isSuiviDureeManual = !isSuiviDureeManual, () => isSuiviDureeManual);
    
    initializeNumericInput(document.querySelector('#fuel-sur-feu-wrapper'));
    initializeNumericInput(document.querySelector('#suivi-conso-rotation-wrapper'));
    initializeTimeInput(document.querySelector('#suivi-duree-rotation-wrapper'));

    document.getElementById('reset-all-btn').addEventListener('click', () => { /* ... */ });
    document.getElementById('refresh-gps-btn').addEventListener('click', () => { console.log("Rafraîchissement de la position GPS demandé."); masterRecalculate(); });
    
    masterRecalculate();
};
