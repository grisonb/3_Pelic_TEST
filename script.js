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
let permanentAirportLayer;
let routesLayer;
let currentCommune = null;
let disabledAirports = new Set();
let waterAirports = new Set();
let searchToggleControl;
const MAGNETIC_DECLINATION = 1.0; // Déclinaison Est de 1.0 degré pour la France

const airports = [
    { oaci: "LFLU", name: "Valence-Chabeuil", lat: 44.920, lon: 4.968 },
    { oaci: "LFMU", name: "Béziers-Vias", lat: 43.323, lon: 3.354 },
    { oaci: "LFJR", name: "Angers-Marcé", lat: 47.560, lon: -0.312 },
    { oaci: "LFHO", name: "Aubenas-Ardèche Méridionale", lat: 44.545, lon: 4.385 },
    { oaci: "LFLX", name: "Châteauroux-Déols", lat: 46.861, lon: 1.720 },
    { oaci: "LFBM", name: "Mont-de-Marsan", lat: 43.894, lon: -0.509 },
    { oaci: "LFBL", name: "Limoges-Bellegarde", lat: 45.862, lon: 1.180 },
    { oaci: "LFAQ", name: "Albert-Bray", lat: 49.972, lon: 2.698 },
    { oaci: "LFBP", name: "Pau-Pyrénées", lat: 43.380, lon: -0.418 },
    { oaci: "LFTH", name: "Toulon-Hyères", lat: 43.097, lon: 6.146 },
    { oaci: "LFSG", name: "Épinal-Mirecourt", lat: 48.325, lon: 6.068 },
    { oaci: "LFKC", name: "Calvi-Sainte-Catherine", lat: 42.530, lon: 8.793 },
    { oaci: "LFMD", name: "Cannes-Mandelieu", lat: 43.542, lon: 6.956 },
    { oaci: "LFKB", name: "Bastia-Poretta", lat: 42.552, lon: 9.483 },
    { oaci: "LFMH", name: "Saint-Étienne-Bouthéon", lat: 45.541, lon: 4.296 },
    { oaci: "LFKF", name: "Figari-Sud-Corse", lat: 41.500, lon: 9.097 },
    { oaci: "LFCC", name: "Cahors-Lalbenque", lat: 44.351, lon: 1.475 },
    { oaci: "LFML", name: "Marseille-Provence", lat: 43.436, lon: 5.215 },
    { oaci: "LFKJ", name: "Ajaccio-Napoléon-Bonaparte", lat: 41.923, lon: 8.802 },
    { oaci: "LFMK", name: "Carcassonne-Salvaza", lat: 43.215, lon: 2.306 },
    { oaci: "LFRV", name: "Vannes-Meucon", lat: 47.720, lon: -2.721 },
    { oaci: "LFTW", name: "Nîmes-Garons", lat: 43.757, lon: 4.416 },
    { oaci: "LFMP", name: "Perpignan-Rivesaltes", lat: 42.740, lon: 2.870 },
    { oaci: "LFBD", name: "Bordeaux-Mérignac", lat: 44.828, lon: -0.691 }
];

// =========================================================================
// FONCTIONS UTILITAIRES
// =========================================================================

const toRad = deg => deg * Math.PI / 180;
const toDeg = rad => rad * 180 / Math.PI;

const simplifyString = str => typeof str !== 'string' ? '' : str
    .toLowerCase()
    .replace(/\bst\b/g, 'saint')
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const calculateDistanceInNm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c) / 1.852;
};

const calculateBearing = (lat1, lon1, lat2, lon2) => {
    const lat1Rad = toRad(lat1);
    const lon1Rad = toRad(lon1);
    const lat2Rad = toRad(lat2);
    const lon2Rad = toRad(lon2);
    const dLon = lon2Rad - lon1Rad;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    let bearingRad = Math.atan2(y, x);
    let bearingDeg = toDeg(bearingRad);
    return (bearingDeg + 360) % 360;
};


const convertToDMM = (deg, type) => {
    if (deg === null || isNaN(deg)) return 'N/A';
    const absDeg = Math.abs(deg);
    const degrees = Math.floor(absDeg);
    const minutesTotal = (absDeg - degrees) * 60;
    const minutesFormatted = minutesTotal.toFixed(2).padStart(5, '0');
    let direction = type === 'lat' ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
    return `${degrees}° ${minutesFormatted}' ${direction}`;
};

const levenshteinDistance = (a, b) => {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i += 1) { matrix[0][i] = i; }
    for (let j = 0; j <= b.length; j += 1) { matrix[j][0] = j; }
    for (let j = 1; j <= b.length; j += 1) for (let i = 1; i <= a.length; i += 1) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator);
    }
    return matrix[b.length][a.length];
};

// =========================================================================
// LOGIQUE PRINCIPALE DE L'APPLICATION
// =========================================================================

async function initializeApp() {
    const statusMessage = document.getElementById('status-message');
    const searchSection = document.getElementById('search-section');
    loadState(); // Charge l'état des aéroports
    try {
        const response = await fetch('./communes.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data || !data.data) throw new Error("Format JSON invalide.");

        allCommunes = data.data.map(c => {
            const normalized_name = simplifyString(c.nom_standard);
            const search_parts = normalized_name.split(' ').filter(Boolean);
            const soundex_parts = search_parts.map(part => soundex(part));
            return { ...c, normalized_name, search_parts, soundex_parts };
        });

        statusMessage.style.display = 'none';
        searchSection.style.display = 'block';
        initMap();
        setupEventListeners();

        // --- NOUVEAU : Restauration de la commune sélectionnée au chargement ---
        const savedCommuneJSON = localStorage.getItem('currentCommune');
        if (savedCommuneJSON) {
            const savedCommune = JSON.parse(savedCommuneJSON);
            currentCommune = savedCommune;
            displayCommuneDetails(savedCommune, true); // Affiche la commune restaurée
            
            // Met à jour l'interface
            document.getElementById('ui-overlay').style.display = 'none';
            if (searchToggleControl) {
                searchToggleControl.setName(savedCommune.nom_standard);
                searchToggleControl.communeDisplay.style.display = 'block';
            }
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
    drawPermanentAirportMarkers();
}

function setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search');
    const airportCountInput = document.getElementById('airport-count');
    const resultsList = document.getElementById('results-list');
    const offlineStatus = document.getElementById('offline-status');

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
    
        const communesToSearch = departmentFilter
            ? allCommunes.filter(c => c.dep_code === departmentFilter)
            : allCommunes;
    
        const scoredResults = communesToSearch.map(c => {
            let totalScore = 0;
            let wordsFound = 0;
    
            for (const word of searchWords) {
                let bestWordScore = 999;
                const wordSoundex = soundex(word);
    
                for (let i = 0; i < c.search_parts.length; i++) {
                    const communePart = c.search_parts[i];
                    const communeSoundex = c.soundex_parts[i];
                    let currentScore = 999;
    
                    if (communePart.startsWith(word)) {
                        currentScore = 0;
                    } else if (communeSoundex === wordSoundex) {
                        currentScore = 1;
                    } else {
                        const dist = levenshteinDistance(word, communePart);
                        if (dist <= Math.floor(word.length / 3) + 1) {
                            currentScore = 2 + dist;
                        }
                    }
                    
                    if (currentScore < bestWordScore) {
                        bestWordScore = currentScore;
                    }
                }
    
                if (bestWordScore < 999) {
                    wordsFound++;
                    totalScore += bestWordScore;
                }
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
        currentCommune = null;
        // --- NOUVEAU : On supprime la commune sauvegardée ---
        localStorage.removeItem('currentCommune');
        map.setView([46.6, 2.2], 5.5);
    });

    airportCountInput.addEventListener('input', () => {
        if (currentCommune) displayCommuneDetails(currentCommune, false);
    });

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        offlineStatus.style.display = 'none';
    } else {
        offlineStatus.textContent = 'Initialisation du mode hors ligne...';
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (navigator.serviceWorker.controller) {
            offlineStatus.style.display = 'none';
        }
    });
}

function displayResults(results) {
    const resultsList = document.getElementById('results-list');
    resultsList.innerHTML = '';
    if (results.length > 0) {
        resultsList.style.display = 'block';
        results.forEach(c => {
            const li = document.createElement('li');
            li.textContent = `${c.nom_standard} (${c.dep_nom} - ${c.dep_code})`;
            li.addEventListener('click', () => {
                currentCommune = c;
                // --- NOUVEAU : Sauvegarde de la commune sélectionnée ---
                localStorage.setItem('currentCommune', JSON.stringify(c));
                
                displayCommuneDetails(c);
                document.getElementById('ui-overlay').style.display = 'none';
                if (searchToggleControl) {
                    searchToggleControl.setName(c.nom_standard);
                    searchToggleControl.communeDisplay.style.display = 'block';
                }
            });
            resultsList.appendChild(li);
        });
    } else {
        resultsList.style.display = 'none';
    }
}

function displayCommuneDetails(commune, shouldFitBounds = true) {
    routesLayer.clearLayers();
    const { latitude_mairie: lat, longitude_mairie: lon, nom_standard: name } = commune;
    const searchInput = document.getElementById('search-input');
    const resultsList = document.getElementById('results-list');
    const clearSearchBtn = document.getElementById('clear-search');
    const airportCountInput = document.getElementById('airport-count');

    searchInput.value = name;
    resultsList.style.display = 'none';
    clearSearchBtn.style.display = 'block';

    const numAirports = parseInt(airportCountInput.value, 10);
    const closestAirports = getClosestAirports(lat, lon, numAirports);
    const allPoints = [[lat, lon]];

    const fireIcon = L.divIcon({ className: 'custom-marker-icon fire-marker', html: '🔥' });
    L.marker([lat, lon], { icon: fireIcon }).bindPopup(`<b>${name}</b><br>${convertToDMM(lat, 'lat')}<br>${convertToDMM(lon, 'lon')}`).addTo(routesLayer);
    
    closestAirports.forEach(ap => {
        allPoints.push([ap.lat, ap.lon]);
        drawRoute([lat, lon], [ap.lat, ap.lon], { oaci: ap.oaci });
    });
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                const { latitude: userLat, longitude: userLon } = pos.coords;
                allPoints.push([userLat, userLon]);
                const userIcon = L.divIcon({ className: 'custom-marker-icon user-marker', html: '👤' });
                L.marker([userLat, userLon], { icon: userIcon }).bindPopup('Votre position').addTo(routesLayer);

                const trueBearing = calculateBearing(userLat, userLon, lat, lon);
                const magneticBearing = (trueBearing - MAGNETIC_DECLINATION + 360) % 360; 

                drawRoute([userLat, userLon], [lat, lon], { isUser: true, magneticBearing: magneticBearing });

                if (shouldFitBounds) map.fitBounds(L.latLngBounds(allPoints).pad(0.3));
            },
            () => { 
                if (shouldFitBounds) map.fitBounds(L.latLngBounds(allPoints).pad(0.3));
            }
        );
    } else { 
        if (shouldFitBounds) map.fitBounds(L.latLngBounds(allPoints).pad(0.3));
    }
}

function drawRoute(startLatLng, endLatLng, options = {}) {
    const { oaci, isUser, magneticBearing } = options;
    const distance = calculateDistanceInNm(startLatLng[0], startLatLng[1], endLatLng[0], endLatLng[1]);
    
    let labelText;
    if (isUser) {
        // --- MODIFIÉ : Le "M" a été retiré ---
        labelText = `${Math.round(magneticBearing)}° / ${Math.round(distance)} Nm`;
    } else if (oaci) {
        labelText = `<b>${oaci}</b><br>${Math.round(distance)} Nm`;
    } else {
        labelText = `${Math.round(distance)} Nm`;
    }

    const polyline = L.polyline([startLatLng, endLatLng], {
        color: isUser ? 'var(--secondary-color)' : 'var(--primary-color)',
        weight: 3,
        opacity: 0.8,
        dashArray: isUser ? '5, 10' : ''
    }).addTo(routesLayer);

    if (isUser) {
        polyline.bindTooltip(labelText, {
            permanent: true,
            direction: 'center',
            className: 'route-tooltip route-tooltip-user',
            sticky: true
        });
    } else if (oaci) {
        L.tooltip({
            permanent: true,
            direction: 'right',
            offset: [10, 0],
            className: 'route-tooltip'
        })
        .setLatLng(endLatLng)
        .setContent(labelText)
        .addTo(routesLayer);
    }
}

function getClosestAirports(lat, lon, count) {
    return airports.filter(ap => !disabledAirports.has(ap.oaci)).map(ap => ({ ...ap, distance: calculateDistanceInNm(lat, lon, ap.lat, ap.lon) })).sort((a, b) => a.distance - b.distance).slice(0, count);
}

function refreshUI() {
    drawPermanentAirportMarkers();
    if (currentCommune) displayCommuneDetails(currentCommune, false);
}

function drawPermanentAirportMarkers() {
    permanentAirportLayer.clearLayers();
    airports.forEach(airport => {
        const isDisabled = disabledAirports.has(airport.oaci);
        const isWater = waterAirports.has(airport.oaci);
        let iconClass = 'custom-marker-icon airport-marker-base ';
        let iconHTML = '✈️';
        if (isDisabled) {
            iconClass += 'airport-marker-disabled';
            iconHTML = '<b>+</b>';
        } else if (isWater) {
            iconClass += 'airport-marker-water';
            iconHTML = '💧';
        } else {
            iconClass += 'airport-marker-active';
        }
        const icon = L.divIcon({ className: iconClass, html: iconHTML });
        const marker = L.marker([airport.lat, airport.lon], { icon: icon });
        const disableButtonText = isDisabled ? 'Activer' : 'Désactiver';
        const disableButtonClass = isDisabled ? 'enable-btn' : 'disable-btn';
        marker.bindPopup(`<div class="airport-popup"><b>${airport.oaci}</b><br>${airport.name}<div class="popup-buttons"><button class="water-btn" onclick="window.toggleWater('${airport.oaci}')">Eau</button><button class="${disableButtonClass}" onclick="window.toggleAirport('${airport.oaci}')">${disableButtonText}</button></div></div>`);
        marker.addTo(permanentAirportLayer);
    });
}

const loadState = () => {
    const savedDisabled = localStorage.getItem('disabled_airports');
    if (savedDisabled) disabledAirports = new Set(JSON.parse(savedDisabled));
    const savedWater = localStorage.getItem('water_airports');
    if (savedWater) waterAirports = new Set(JSON.parse(savedWater));
};

const saveState = () => {
    localStorage.setItem('disabled_airports', JSON.stringify([...disabledAirports]));
    localStorage.setItem('water_airports', JSON.stringify([...waterAirports]));
};

window.toggleAirport = (oaci) => {
    if (disabledAirports.has(oaci)) disabledAirports.delete(oaci);
    else {
        disabledAirports.add(oaci);
        waterAirports.delete(oaci);
    }
    saveState();
    refreshUI();
};

window.toggleWater = (oaci) => {
    if (waterAirports.has(oaci)) waterAirports.delete(oaci);
    else {
        waterAirports.add(oaci);
        disabledAirports.delete(oaci);
    }
    saveState();
    refreshUI();
};

// =========================================================================
// CONTRÔLE LEAFLET PERSONNALISÉ (pour la loupe)
// =========================================================================
const SearchToggleControl = L.Control.extend({
    options: {
        position: 'topleft'
    },
    onAdd: function (map) {
        const mainContainer = L.DomUtil.create('div', 'leaflet-control');
        const topBar = L.DomUtil.create('div', 'leaflet-bar search-toggle-container', mainContainer);
        this.toggleButton = L.DomUtil.create('a', 'search-toggle-button', topBar);
        this.toggleButton.innerHTML = '🔍';
        this.toggleButton.href = '#';
        this.communeDisplay = L.DomUtil.create('div', 'commune-display-control', topBar);
        const versionDisplay = L.DomUtil.create('div', 'version-display', mainContainer);
        versionDisplay.innerText = 'v1.1';
        L.DomEvent.disableClickPropagation(mainContainer);
        L.DomEvent.on(this.toggleButton, 'click', L.DomEvent.stop);
        L.DomEvent.on(this.toggleButton, 'click', () => {
            const uiOverlay = document.getElementById('ui-overlay');
            const isHidden = uiOverlay.style.display === 'none';
            if (isHidden) {
                uiOverlay.style.display = 'block';
                this.communeDisplay.style.display = 'none';
            } else {
                uiOverlay.style.display = 'none';
                if (this.communeDisplay.textContent) {
                    this.communeDisplay.style.display = 'block';
                }
            }
        });
        return mainContainer;
    },
    setName: function(name) {
        this.communeDisplay.textContent = name;
    }
});

// =========================================================================
// ALGORITHME PHONÉTIQUE SOUNDEX
// =========================================================================
function soundex(s) {
    if (!s) return '';
    const a = s.toLowerCase().split('');
    const f = a.shift();
    if (!f) return '';
    let r = '';
    const codes = {
        a: '', e: '', i: '', o: '', u: '',
        b: 1, f: 1, p: 1, v: 1,
        c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2,
        d: 3, t: 3,
        l: 4,
        m: 5, n: 5,
        r: 6
    };
    r = f + a.map(v => codes[v]).filter((v, i, a) => (i === 0) ? v !== codes[f] : v !== a[i - 1]).join('');
    return (r + '000').slice(0, 4).toUpperCase();
}
