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
    const liveGpsButton = document.getElementById('live-gps-button');
    const lftwRouteButton = document.getElementById('lftw-route-button');

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
                const wordSoundex = soundex(word);
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
    gpsFeuButton.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("La géolocalisation n'est pas supportée par votre navigateur.");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                const pointName = 'Feu GPS';
                const gpsCommune = { nom_standard: pointName, latitude_mairie: latitude, longitude_mairie: longitude, isManual: true };
                currentCommune = gpsCommune;
                localStorage.setItem('currentCommune', JSON.stringify(gpsCommune));
                displayCommuneDetails(gpsCommune, false);
                document.getElementById('ui-overlay').style.display = 'none';
            },
            () => { alert("Impossible d'obtenir la position GPS. Veuillez vérifier vos autorisations."); },
            { enableHighAccuracy: true }
        );
    });
    
    liveGpsButton.addEventListener('click', toggleLiveGps);
    lftwRouteButton.addEventListener('click', toggleLftwRoute);
    updateLftwButtonState();
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
                localStorage.setItem('currentCommune', JSON.stringify(c));
                displayCommuneDetails(c);
                document.getElementById('ui-overlay').style.display = 'none';
            });
            resultsList.appendChild(li);
        });
    } else {
        resultsList.style.display = 'none';
    }
}

function displayCommuneDetails(commune, shouldFitBounds = true) {
    routesLayer.clearLayers();
    userToTargetLayer.clearLayers();
    lftwRouteLayer.clearLayers();
    drawPermanentAirportMarkers();
    
    if (searchToggleControl) {
        searchToggleControl.updateDisplay(commune);
    }

    const { latitude_mairie: lat, longitude_mairie: lon, nom_standard: name } = commune;
    document.getElementById('search-input').value = name;
    document.getElementById('results-list').style.display = 'none';
    document.getElementById('clear-search').style.display = 'block';

    const popupContent = `<b>${name}</b><br>${convertToDMM(lat, 'lat')}<br>${convertToDMM(lon, 'lon')}`;
    
    const allPoints = [[lat, lon]];
    const fireIcon = L.divIcon({ className: 'custom-marker-icon fire-marker', html: '🔥' });
    L.marker([lat, lon], { icon: fireIcon }).bindPopup(popupContent).addTo(routesLayer);
    
    const numAirports = parseInt(document.getElementById('airport-count').value, 10);
    const closestAirports = getClosestAirports(lat, lon, numAirports);
    closestAirports.forEach(ap => {
        allPoints.push([ap.lat, ap.lon]);
        drawRoute([lat, lon], [ap.lat, ap.lon], { oaci: ap.oaci });
    });
    
    const isLftwInClosest = closestAirports.some(ap => ap.oaci === 'LFTW');
    if (showLftwRoute && !isLftwInClosest) {
        drawLftwRoute();
    }
    
    navigator.geolocation.getCurrentPosition(updateUserPosition, () => {}, { enableHighAccuracy: true });

    if (shouldFitBounds) {
        setTimeout(() => {
            if (userMarker && userMarker.getLatLng()) {
                allPoints.push(userMarker.getLatLng());
            }
            if (allPoints.length > 1) {
                map.fitBounds(L.latLngBounds(allPoints).pad(0.3));
            } else {
                map.setView([lat, lon], 10);
            }
        }, 300);
    }
}

function drawRoute(startLatLng, endLatLng, options = {}) {
    const { oaci, isUser, magneticBearing, color = 'var(--primary-color)', dashArray = '' } = options;
    const distance = calculateDistanceInNm(startLatLng[0], startLatLng[1], endLatLng[0], endLatLng[1]);
    let labelText;
    if (isUser) { labelText = `${Math.round(magneticBearing)}° / ${Math.round(distance)} Nm`; }
    else if (oaci && oaci.startsWith('LFTW:')) { labelText = oaci; }
    else if (oaci) { labelText = `<b>${oaci}</b><br>${Math.round(distance)} Nm`; }
    else { labelText = `${Math.round(distance)} Nm`; }
    
    let layer = routesLayer;
    if (isUser) layer = userToTargetLayer;
    if (oaci && oaci.startsWith('LFTW')) layer = lftwRouteLayer;

    const polyline = L.polyline([startLatLng, endLatLng], { 
        color: isUser ? 'var(--secondary-color)' : color, 
        weight: 3, 
        opacity: 0.8, 
        dashArray: isUser ? '5, 10' : dashArray 
    }).addTo(layer);

    if (isUser) {
        polyline.bindTooltip(labelText, { permanent: true, direction: 'center', className: 'route-tooltip route-tooltip-user', sticky: true });
    } else if (oaci) {
        L.tooltip({ permanent: true, direction: 'right', offset: [10, 0], className: 'route-tooltip' }).setLatLng(endLatLng).setContent(labelText).addTo(layer);
    }
}

function getClosestAirports(lat, lon, count) { return airports.filter(ap => !disabledAirports.has(ap.oaci)).map(ap => ({ ...ap, distance: calculateDistanceInNm(lat, lon, ap.lat, ap.lon) })).sort((a, b) => a.distance - b.distance).slice(0, count); }
function refreshUI() { drawPermanentAirportMarkers(); if (currentCommune) displayCommuneDetails(currentCommune, false); }
function drawPermanentAirportMarkers() { permanentAirportLayer.clearLayers(); airports.forEach(airport => { const isDisabled = disabledAirports.has(airport.oaci); const isWater = waterAirports.has(airport.oaci); let iconClass = "custom-marker-icon airport-marker-base ", iconHTML = "✈️"; isDisabled ? (iconClass += "airport-marker-disabled", iconHTML = "<b>+</b>") : isWater ? (iconClass += "airport-marker-water", iconHTML = "💧") : iconClass += "airport-marker-active"; const icon = L.divIcon({ className: iconClass, html: iconHTML }); const marker = L.marker([airport.lat, airport.lon], { icon: icon }); const disableButtonText = isDisabled ? "Activer" : "Désactiver"; const disableButtonClass = isDisabled ? "enable-btn" : "disable-btn"; marker.bindPopup(`<div class="airport-popup"><b>${airport.oaci}</b><br>${airport.name}<div class="popup-buttons"><button class="water-btn" onclick="window.toggleWater('${airport.oaci}')">Eau</button><button class="${disableButtonClass}" onclick="window.toggleAirport('${airport.oaci}')">${disableButtonText}</button></div></div>`).addTo(permanentAirportLayer); }); }
const loadState = () => { const savedDisabled = localStorage.getItem('disabled_airports'); if (savedDisabled) disabledAirports = new Set(JSON.parse(savedDisabled)); const savedWater = localStorage.getItem('water_airports'); if (savedWater) waterAirports = new Set(JSON.parse(savedWater)); };
const saveState = () => { localStorage.setItem('disabled_airports', JSON.stringify([...disabledAirports])); localStorage.setItem('water_airports', JSON.stringify([...waterAirports])); };
window.toggleAirport = oaci => { disabledAirports.has(oaci) ? disabledAirports.delete(oaci) : (disabledAirports.add(oaci), waterAirports.delete(oaci)), saveState(), refreshUI() };
window.toggleWater = oaci => { waterAirports.has(oaci) ? waterAirports.delete(oaci) : (waterAirports.add(oaci), disabledAirports.delete(oaci)), saveState(), refreshUI() };

function toggleLiveGps() {
    const liveGpsButton = document.getElementById('live-gps-button');
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        liveGpsButton.classList.remove('active');
        localStorage.setItem('liveGpsActive', 'false');
        console.log("Suivi GPS désactivé.");
    } else {
        if (!navigator.geolocation) {
            alert("La géolocalisation n'est pas supportée.");
            return;
        }
        watchId = navigator.geolocation.watchPosition(
            updateUserPosition, 
            (error) => {
                console.error("Erreur de suivi GPS:", error);
                alert("Impossible d'activer le suivi GPS. Vérifiez les autorisations.");
                if (watchId) toggleLiveGps();
            }, 
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
        liveGpsButton.classList.add('active');
        localStorage.setItem('liveGpsActive', 'true');
        console.log("Suivi GPS activé.");
    }
}

function updateUserPosition(pos) {
    const { latitude: userLat, longitude: userLon } = pos.coords;
    if (!userMarker) {
        const userIcon = L.divIcon({ className: 'custom-marker-icon user-marker', html: '👤' });
        userMarker = L.marker([userLat, userLon], { icon: userIcon }).bindPopup('Votre position').addTo(map);
    } else {
        userMarker.setLatLng([userLat, userLon]);
    }
    
    userToTargetLayer.clearLayers();

    if (currentCommune) {
        const { latitude_mairie: lat, longitude_mairie: lon } = currentCommune;
        if (lat.toFixed(6) !== userLat.toFixed(6) || lon.toFixed(6) !== userLon.toFixed(6)) {
            const trueBearing = calculateBearing(userLat, userLon, lat, lon);
            const magneticBearing = (trueBearing - MAGNETIC_DECLINATION + 360) % 360;
            drawRoute([userLat, userLon], [lat, lon], { isUser: true, magneticBearing: magneticBearing });
        }
    }
}

function toggleLftwRoute() {
    showLftwRoute = !showLftwRoute;
    localStorage.setItem('showLftwRoute', showLftwRoute);
    updateLftwButtonState();
    if (currentCommune) {
        displayCommuneDetails(currentCommune, false);
    }
}

function updateLftwButtonState() {
    const lftwRouteButton = document.getElementById('lftw-route-button');
    if (showLftwRoute) {
        lftwRouteButton.classList.add('active');
    } else {
        lftwRouteButton.classList.remove('active');
    }
}

function drawLftwRoute() {
    lftwRouteLayer.clearLayers();
    if (!showLftwRoute || !currentCommune) {
        return;
    }
    const lftwAirport = airports.find(ap => ap.oaci === 'LFTW');
    if (!lftwAirport) return;
    const { latitude_mairie: lat, longitude_mairie: lon } = currentCommune;
    const { lat: lftwLat, lon: lftwLon } = lftwAirport;
    const trueBearing = calculateBearing(lat, lon, lftwLat, lftwLon);
    const magneticBearing = (trueBearing - MAGNETIC_DECLINATION + 360) % 360;
    const distanceNm = Math.round(calculateDistanceInNm(lat, lon, lftwLat, lftwLon));
    
    drawRoute([lat, lon], [lftwLat, lftwLon], {
        oaci: `LFTW: ${Math.round(magneticBearing)}° / ${distanceNm} Nm`,
        color: 'var(--success-color)',
        dashArray: '5, 10'
    });
}

const SearchToggleControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function (map) {
        const mainContainer = L.DomUtil.create('div', 'leaflet-control');
        const topBar = L.DomUtil.create('div', 'leaflet-bar search-toggle-container', mainContainer);
        this.toggleButton = L.DomUtil.create('a', 'search-toggle-button', topBar);
        this.toggleButton.innerHTML = '🏠';
        this.toggleButton.href = '#';
        this.communeDisplay = L.DomUtil.create('div', 'commune-display-control', topBar);
        this.communeNameSpan = L.DomUtil.create('span', '', this.communeDisplay);
        this.sunsetDisplay = L.DomUtil.create('div', 'sunset-info', this.communeDisplay);
        const versionDisplay = L.DomUtil.create('div', 'version-display', mainContainer);
        versionDisplay.innerText = 'v4.7';
        L.DomEvent.disableClickPropagation(mainContainer);
        L.DomEvent.on(this.toggleButton, 'click', L.DomEvent.stop);
        L.DomEvent.on(this.toggleButton, 'click', () => {
            const uiOverlay = document.getElementById('ui-overlay');
            if (uiOverlay.style.display === 'none') {
                uiOverlay.style.display = 'block';
                this.communeDisplay.style.display = 'none';
            } else {
                uiOverlay.style.display = 'none';
                if (this.communeNameSpan.textContent) {
                    this.communeDisplay.style.display = 'flex';
                }
            }
        });
        return mainContainer;
    },
    updateDisplay: function (commune) {
        if (!commune) {
            this.communeDisplay.style.display = 'none';
            this.communeNameSpan.textContent = '';
            this.sunsetDisplay.textContent = '';
            return;
        }

        this.communeDisplay.style.display = 'flex';
        this.communeNameSpan.textContent = commune.nom_standard;
        
        if (typeof SunCalc !== 'undefined') {
            try {
                const now = new Date();
                const times = SunCalc.getTimes(now, commune.latitude_mairie, commune.longitude_mairie);
                const sunsetString = times.sunset.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
                this.sunsetDisplay.innerHTML = `🌅 CS <b>${sunsetString}</b>`;
            } catch (e) {
                this.sunsetDisplay.innerHTML = '';
            }
        }
    }
});

function soundex(s) { if (!s) return ""; const a = s.toLowerCase().split(""), f = a.shift(); if (!f) return ""; let r = ""; const codes = { a: "", e: "", i: "", o: "", u: "", b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 }; return r = f + a.map(v => codes[v]).filter((v, i, a) => 0 === i ? v !== codes[f] : v !== a[i - 1]).join(""), (r + "000").slice(0, 4).toUpperCase() }
