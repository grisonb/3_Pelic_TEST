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
let allCommunes = [], map, permanentAirportLayer, routesLayer, currentCommune = null, selectedPelicanOACI = null;
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
    // Déclenche l'événement personnalisé pour fermer l'overlay
    document.dispatchEvent(new Event('communeSelected'));
});
}

function setupEventListeners() {
    // --- Récupération des éléments du DOM ---
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search');
    const airportCountInput = document.getElementById('airport-count');
    const resultsList = document.getElementById('results-list');
    const gpsFeuButton = document.getElementById('gps-feu-button');
    const liveGpsButton = document.getElementById('live-gps-button');
    const lftwRouteButton = document.getElementById('lftw-route-button');
    const gaarModeButton = document.getElementById('gaar-mode-button');
    const editCircuitsButton = document.getElementById('edit-circuits-button');
    const deleteCircuitsButton = document.getElementById('delete-circuits-btn');

    // Nouveaux boutons et conteneurs
    const toggleSearchButton = document.getElementById('toggle-search-button');
    const mainActionButtons = document.getElementById('main-action-buttons');
    const calculatorButton = document.getElementById('calculator-button');
    const calculatorModal = document.getElementById('calculator-modal');
    const closeCalculatorButton = document.getElementById('close-calculator-btn');

    // --- Gestion du numéro de version ---
    // On vérifie que le conteneur existe avant de faire quoi que ce soit
    if (mainActionButtons) {
        const versionDisplay = document.createElement('div');
        versionDisplay.className = 'version-display';
        versionDisplay.innerText = 'v10.9'; // Version mise à jour
        mainActionButtons.appendChild(versionDisplay);
    }

    // --- Ajout des écouteurs d'événements ---

    // Barre de recherche
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

    // Bouton pour vider la recherche
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
        document.getElementById('commune-info-display').style.display = 'none';
        navigator.geolocation.getCurrentPosition(updateUserPosition);
        map.setView([46.6, 2.2], 5.5);
    });

    // Nombre de pélicans
    airportCountInput.addEventListener('input', () => {
        if (currentCommune) displayCommuneDetails(currentCommune, false);
    });

    // Bouton GPS Feu (Cible)
    gpsFeuButton.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("La géolocalisation n'est pas supportée par votre navigateur.");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                const pointName = findClosestCommuneName(latitude, longitude) || 'Feu GPS';
                const gpsCommune = { nom_standard: pointName, latitude_mairie: latitude, longitude_mairie: longitude, isManual: true };
                currentCommune = gpsCommune;
                localStorage.setItem('currentCommune', JSON.stringify(gpsCommune));
                displayCommuneDetails(gpsCommune, false);
                document.dispatchEvent(new Event('communeSelected'));
            },
            () => { alert("Impossible d'obtenir la position GPS. Veuillez vérifier vos autorisations."); },
            { enableHighAccuracy: true }
        );
    });

    // Bouton GPS Live (Satellite)
    liveGpsButton.addEventListener('click', toggleLiveGps);

    // Bouton Route LFTW
    lftwRouteButton.addEventListener('click', toggleLftwRoute);

    // Boutons GAAR
    gaarModeButton.addEventListener('click', toggleGaarVisibility);
    editCircuitsButton.addEventListener('click', toggleGaarDrawingMode);
    deleteCircuitsButton.addEventListener('click', () => {
        if (confirm("Voulez-vous vraiment supprimer tous les circuits GAAR ?")) {
            clearAllGaarCircuits();
        }
    });

    // --- NOUVELLE LOGIQUE POUR LES BOUTONS D'ACTION ---

    // Bouton pour ouvrir/fermer le panneau de recherche (Ville)
    toggleSearchButton.addEventListener('click', () => {
        const uiOverlay = document.getElementById('ui-overlay');
        const communeDisplay = document.getElementById('commune-info-display');

        if (uiOverlay.style.display === 'none') {
            uiOverlay.style.display = 'block';
            communeDisplay.style.display = 'none';
            toggleSearchButton.classList.add('active');
        } else {
            uiOverlay.style.display = 'none';
            toggleSearchButton.classList.remove('active');
            if (communeDisplay.innerHTML.trim() !== '' && currentCommune) {
                communeDisplay.style.display = 'flex';
            }
        }
    });

    // Événement personnalisé pour gérer la sélection d'une commune
    document.addEventListener('communeSelected', () => {
        document.getElementById('ui-overlay').style.display = 'none';
        document.getElementById('toggle-search-button').classList.remove('active');
        if (currentCommune) {
            document.getElementById('commune-info-display').style.display = 'flex';
        }
    });

    // --- LOGIQUE POUR LE CALCULATEUR ---

    // Bouton pour ouvrir la modale (Avion)
    calculatorButton.addEventListener('click', () => {
        calculatorModal.style.display = 'flex';
    });

    // Bouton pour fermer la modale
    closeCalculatorButton.addEventListener('click', () => {
        calculatorModal.style.display = 'none';
    });

    // Fermer la modale en cliquant sur le fond
    calculatorModal.addEventListener('click', (e) => {
        if (e.target === calculatorModal) {
            calculatorModal.style.display = 'none';
        }
    });

    // Fermer la modale avec la touche Echap
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && calculatorModal.style.display === 'flex') {
            calculatorModal.style.display = 'none';
        }
    });

    // Mise à jour de l'état des boutons au chargement
    updateLftwButtonState();
    updateGaarButtonState();
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
    // Déclenche l'événement personnalisé pour fermer l'overlay
    document.dispatchEvent(new Event('communeSelected'));
});
            resultsList.appendChild(li);
        });
    } else {
        resultsList.style.display = 'none';
    }
}

function updateCommuneDisplay(commune) {
    const communeDisplay = document.getElementById('commune-info-display');
    if (!commune) {
        communeDisplay.innerHTML = '';
        communeDisplay.style.display = 'none';
        return;
    }

    const communeNameHTML = `<span class="commune-name">${commune.nom_standard}</span>`;
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
    communeDisplay.innerHTML = communeNameHTML + sunsetHTML;
}

function displayCommuneDetails(commune, shouldFitBounds = true) {
    routesLayer.clearLayers();
    userToTargetLayer.clearLayers();
    lftwRouteLayer.clearLayers();
    drawPermanentAirportMarkers();
    
    // --- CORRECTION : Appeler la fonction de mise à jour de l'affichage ---
    updateCommuneDisplay(commune); // On s'assure que l'affichage est mis à jour
    document.dispatchEvent(new Event('communeSelected'));
    
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
    
    const closestOACIs = new Set(closestAirports.map(ap => ap.oaci));
    if (!selectedPelicanOACI || !closestOACIs.has(selectedPelicanOACI)) {
        if (closestAirports.length > 0) {
            selectedPelicanOACI = closestAirports[0].oaci;
        } else {
            selectedPelicanOACI = null;
        }
    }
    
    closestAirports.forEach(ap => {
        allPoints.push([ap.lat, ap.lon]);
        drawRoute([lat, lon], [ap.lat, ap.lon], { oaci: ap.oaci });
    });
    
    const isLftwInClosest = closestAirports.some(ap => ap.oaci === 'LFTW');
    if (showLftwRoute && !isLftwInClosest) {
        drawLftwRoute();
    }
    
    updateCalculatorData();
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
    const { oaci, isUser, isLftwRoute, magneticBearing } = options;
    const distance = calculateDistanceInNm(startLatLng[0], startLatLng[1], endLatLng[0], endLatLng[1]);
    let labelText;
    let color = 'var(--primary-color)';
    let dashArray = '';
    let layer = routesLayer;

    if (isUser) {
        labelText = `${Math.round(magneticBearing)}° / ${Math.round(distance)} Nm`;
        color = 'var(--secondary-color)';
        dashArray = '5, 10';
        layer = userToTargetLayer;
    } else if (isLftwRoute) {
        labelText = `LFTW: ${Math.round(magneticBearing)}° / ${Math.round(distance)} Nm`;
        color = 'var(--success-color)';
        dashArray = '5, 10';
        layer = lftwRouteLayer;
    } else if (oaci) {
        const isSelected = selectedPelicanOACI === oaci;
        color = isSelected ? 'var(--success-color)' : 'var(--primary-color)';
        let tooltipClass = isSelected ? 'route-tooltip route-tooltip-selected' : 'route-tooltip'; // Classe dynamique
        labelText = `<b>${oaci}</b><br>${Math.round(distance)} Nm`;

        L.polyline([startLatLng, endLatLng], { color, weight: 3, opacity: 0.8 }).addTo(layer);
        const hitbox = L.polyline([startLatLng, endLatLng], { color: 'transparent', weight: 20, opacity: 0 }).addTo(layer);

        hitbox.on('click', () => {
            selectedPelicanOACI = oaci;
            displayCommuneDetails(currentCommune, false);
        });

        L.tooltip({ permanent: true, direction: 'right', offset: [10, 0], className: tooltipClass }).setLatLng(endLatLng).setContent(labelText).addTo(layer);
        return;
    } else {
        labelText = `${Math.round(distance)} Nm`;
    }
    
    const polyline = L.polyline([startLatLng, endLatLng], { color, weight: 3, opacity: 0.8, dashArray }).addTo(layer);

    if (isUser) {
        polyline.bindTooltip(labelText, { permanent: true, direction: 'center', className: 'route-tooltip route-tooltip-user', sticky: true });
    } else if (oaci || isLftwRoute) {
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

function findClosestCommuneName(lat, lon) {
    if (!allCommunes || allCommunes.length === 0) return null;
    let closestCommune = null;
    let minDistance = Infinity;
    for (const commune of allCommunes) {
        const distance = calculateDistanceInNm(lat, lon, commune.latitude_mairie, commune.longitude_mairie);
        if (distance < minDistance) {
            minDistance = distance;
            closestCommune = commune;
        }
    }
    if (closestCommune && minDistance < 27) { // ~50 km
        return closestCommune.nom_standard;
    }
    return null;
}

function toggleLftwRoute() {
    showLftwRoute = !showLftwRoute;
    localStorage.setItem('showLftwRoute', showLftwRoute);
    updateLftwButtonState();
    if(currentCommune) {
        displayCommuneDetails(currentCommune, false);
    }
}

function updateLftwButtonState() {
    const lftwRouteButton = document.getElementById('lftw-route-button');
    lftwRouteButton.classList.toggle('active', showLftwRoute);
}

function drawLftwRoute() {
    lftwRouteLayer.clearLayers();
    if (!showLftwRoute || !currentCommune) return;
    const lftwAirport = airports.find(ap => ap.oaci === 'LFTW');
    if (!lftwAirport) return;
    const { latitude_mairie: lat, longitude_mairie: lon } = currentCommune;
    const { lat: lftwLat, lon: lftwLon } = lftwAirport;
    const trueBearing = calculateBearing(lat, lon, lftwLat, lftwLon);
    const magneticBearing = (trueBearing - MAGNETIC_DECLINATION + 360) % 360;
    
    drawRoute([lat, lon], [lftwLat, lftwLon], { isLftwRoute: true, magneticBearing: magneticBearing });
}

function toggleGaarVisibility() {
    isGaarMode = !isGaarMode;
    updateGaarButtonState();
    if (isGaarMode) {
        redrawGaarCircuits();
    } else {
        gaarLayer.clearLayers();
        if (isDrawingMode) {
            toggleGaarDrawingMode();
        }
    }
}

function updateGaarButtonState() {
    const gaarButton = document.getElementById('gaar-mode-button');
    const gaarControls = document.getElementById('gaar-controls');
    gaarButton.classList.toggle('active', isGaarMode);
    gaarControls.style.display = isGaarMode ? 'flex' : 'none';
}

function toggleGaarDrawingMode() {
    const editButton = document.getElementById('edit-circuits-button');
    const mapContainer = document.getElementById('map');
    const status = document.getElementById('gaar-status');
    isDrawingMode = !isDrawingMode;

    editButton.classList.toggle('active', isDrawingMode);
    mapContainer.classList.toggle('crosshair-cursor', isDrawingMode);
    
    status.textContent = isDrawingMode ? 'Mode modification activé. Cliquez pour ajouter des points.' : '';
}

async function handleGaarMapClick(e) {
    if (!isDrawingMode) return;
    
    let targetCircuit = gaarCircuits.find(c => c && c.isManual && c.points.length < 3);
    if (!targetCircuit) {
        const manualCircuitsCount = gaarCircuits.filter(c => c && c.isManual).length;
        targetCircuit = {
            points: [],
            color: manualCircuitColors[manualCircuitsCount % manualCircuitColors.length],
            isManual: true,
        };
        gaarCircuits.push(targetCircuit);
    }
    
    const pointName = await reverseGeocode(e.latlng) || `Point Manuel`;
    targetCircuit.points.push({ lat: e.latlng.lat, lng: e.latlng.lng, name: pointName });
    
    redrawGaarCircuits();
    saveGaarCircuits();
}

async function reverseGeocode(latlng) {
    document.getElementById('gaar-status').textContent = 'Recherche du nom...';
    try {
        if (!navigator.onLine) {
             throw new Error("Application hors ligne.");
        }
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latlng.lat}&lon=${latlng.lng}&zoom=10`);
        if (!response.ok) throw new Error('La réponse du réseau n\'était pas OK.');
        const data = await response.json();
        const name = data.address.city || data.address.town || data.address.village || data.display_name.split(',')[0];
        document.getElementById('gaar-status').textContent = `Point ajouté près de ${name}.`;
        return name;
    } catch (error) {
        console.log("Échec du géocodage inversé en ligne, passage à la recherche hors ligne :", error.message);
        const closestCommuneName = findClosestCommuneName(latlng.lat, latlng.lng);
        if (closestCommuneName) {
            document.getElementById('gaar-status').textContent = `Point ajouté près de ${closestCommuneName} (hors-ligne).`;
            return closestCommuneName;
        } else {
            document.getElementById('gaar-status').textContent = 'Nom non trouvé (hors-ligne).';
            return null;
        }
    }
}

function redrawGaarCircuits() {
    gaarLayer.clearLayers();
    gaarCircuits.forEach((circuit, circuitIndex) => {
        if (!circuit || circuit.points.length === 0) return;
        
        const latlngs = circuit.points.map(p => [p.lat, p.lng]);
        
        const styleOptions = {
            color: circuit.color,
            weight: 3,
            opacity: 0.6,
            fillColor: circuit.color,
            fillOpacity: 0.2
        };

        if (latlngs.length >= 3) {
            L.polygon(latlngs, styleOptions).addTo(gaarLayer);
        } else if (latlngs.length > 1) {
            L.polyline(latlngs, styleOptions).addTo(gaarLayer);
        }

        circuit.points.forEach((point, pointIndex) => {
            const marker = L.circleMarker([point.lat, point.lng], { 
                radius: 8, fillColor: circuit.color, color: '#000', weight: 1, opacity: 1, fillOpacity: 0.8
            }).addTo(gaarLayer);

            marker.bindTooltip(`${pointIndex + 1}. ${point.name}`, { permanent: true, direction: 'top', className: 'gaar-point-label' });

            const popupContent = `<div class="gaar-popup-form">
                <input type="text" id="gaar-input-${circuitIndex}-${pointIndex}" value="${point.name}">
                <button onclick="updateGaarPoint(${circuitIndex}, ${pointIndex})">OK</button>
                <button class="delete-point-btn" onclick="deleteGaarPoint(${circuitIndex}, ${pointIndex})">Supprimer</button>
            </div>`;
            marker.bindPopup(popupContent);
        });
    });
}

window.updateGaarPoint = async function(circuitIndex, pointIndex) {
    const input = document.getElementById(`gaar-input-${circuitIndex}-${pointIndex}`);
    const newName = input.value.trim();
    if (newName) {
        gaarCircuits[circuitIndex].points[pointIndex].name = newName;
        redrawGaarCircuits();
        saveGaarCircuits();
        map.closePopup();
    }
};

window.deleteGaarPoint = function(circuitIndex, pointIndex) {
    gaarCircuits[circuitIndex].points.splice(pointIndex, 1);
    if (gaarCircuits[circuitIndex].points.length === 0) {
        gaarCircuits.splice(circuitIndex, 1);
    }
    redrawGaarCircuits();
    saveGaarCircuits();
};

function clearAllGaarCircuits() {
    gaarCircuits = [];
    gaarLayer.clearLayers();
    saveGaarCircuits();
}

function saveGaarCircuits() {
    localStorage.setItem('gaarCircuits', JSON.stringify(gaarCircuits));
}

function updateCalculatorData() {
    if (!currentCommune) return; // Pas de commune, pas de calcul

    const lftw = airports.find(ap => ap.oaci === 'LFTW');
    const selectedPelican = airports.find(ap => ap.oaci === selectedPelicanOACI);
    const { latitude_mairie: feuLat, longitude_mairie: feuLon } = currentCommune;

    let distBaseFeu = 0;
    if (lftw) {
        distBaseFeu = calculateDistanceInNm(lftw.lat, lftw.lon, feuLat, feuLon);
    }

    let distPelicFeu = 0;
    if (selectedPelican) {
        distPelicFeu = calculateDistanceInNm(selectedPelican.lat, selectedPelican.lon, feuLat, feuLon);
    }

    let csFeu = '--:--';
    if (typeof SunCalc !== 'undefined') {
        try {
            const now = new Date();
            const times = SunCalc.getTimes(now, feuLat, feuLon);
            csFeu = times.sunset.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
        } catch (e) { /* ignore */ }
    }
    
    let distGpsFeu = 0;
    if (userMarker && userMarker.getLatLng()) {
        const userLatLng = userMarker.getLatLng();
        distGpsFeu = calculateDistanceInNm(userLatLng.lat, userLatLng.lng, feuLat, feuLon);
    }

    // Mettre à jour la variable globale du calculateur
    CALCULATOR_DATA.distBaseFeu = Math.round(distBaseFeu);
    CALCULATOR_DATA.distPelicFeu = Math.round(distPelicFeu);
    CALCULATOR_DATA.csFeu = csFeu;
    CALCULATOR_DATA.distGpsFeu = Math.round(distGpsFeu);

    console.log("Données du calculateur mises à jour :", CALCULATOR_DATA);

    // Rafraîchir l'affichage du calculateur
    if (typeof masterRecalculate === 'function') {
        masterRecalculate();
    }
}

function soundex(s) { if (!s) return ""; const a = s.toLowerCase().split(""), f = a.shift(); if (!f) return ""; let r = ""; const codes = { a: "", e: "", i: "", o: "", u: "", b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 }; return r = f + a.map(v => codes[v]).filter((v, i, a) => 0 === i ? v !== codes[f] : v !== a[i - 1]).join(""), (r + "000").slice(0, 4).toUpperCase() }

// =========================================================================
// LOGIQUE DU CALCULATEUR DE MISSION
// =========================================================================

let CALCULATOR_DATA = { distBaseFeu: 0, distPelicFeu: 0, csFeu: '--:--', distGpsFeu: 0 };
const calculateBingo = (dist) => (dist <= 70) ? (dist * 5) + 700 : (dist * 4) + 700;
const calculateFuelToGo = (dist) => (dist <= 70) ? (dist * 5) : (dist * 4);
const calculateConsoRotation = (dist) => (dist <= 70) ? (dist * 10) + 250 : (dist * 8) + 250;
const calculateTransitTime = (dist) => (dist <= 70) ? (dist * (60 / 210)) : (dist * (60 / 240));
const calculateRotationTime = (dist) => (dist <= 50) ? (20 + (dist / 3.5)) : (20 + (dist / 4));

// Déclaration globale pour que la fonction soit accessible
let masterRecalculate = () => {};

function initializeCalculator() {
    let isFuelSurFeuManual = false; let isSuiviConsoManual = false; let isSuiviDureeManual = false;
    
    const resetButton = document.getElementById('reset-all-btn');
    const onglets = document.querySelectorAll('.onglet-bouton');
    const panneaux = document.querySelectorAll('.onglet-panneau');
    
    onglets.forEach(onglet => {
        onglet.addEventListener('click', () => {
            onglets.forEach(btn => btn.classList.remove('active'));
            panneaux.forEach(p => p.classList.remove('active'));
            onglet.classList.add('active');
            const activePanel = document.getElementById(onglet.dataset.onglet);
            activePanel.classList.add('active');
            resetButton.style.display = (onglet.dataset.onglet === 'bloc-fuel') ? 'flex' : 'none';
        });
    });

    const parseTime = (timeString) => { if (!timeString || !timeString.includes(':')) return null; const parts = timeString.split(':'); return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10); };
    const formatTime = (totalMinutes) => { if (totalMinutes === null || isNaN(totalMinutes) || totalMinutes < 0) return ''; const roundedMinutes = Math.round(totalMinutes); const hours = Math.floor(roundedMinutes / 60); const minutes = roundedMinutes % 60; return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`; };
    const parseNumeric = (numericString) => { if (!numericString) return null; const value = parseInt(numericString.replace(/[^0-9]/g, ''), 10); return isNaN(value) ? null : value; };
    
    function updatePreviTab() {
        const bingoBase = calculateBingo(CALCULATOR_DATA.distBaseFeu);
        const bingoPelic = calculateBingo(CALCULATOR_DATA.distPelicFeu);

        const bingoBaseDisplay = document.getElementById('previ-bingo-base');
        if (bingoBase === 700) {
            bingoBaseDisplay.innerHTML = '-- kg';
        } else {
            bingoBaseDisplay.innerHTML = `${CALCULATOR_DATA.distBaseFeu} Nm / <b>${bingoBase} kg</b>`;
        }

        const bingoPelicDisplay = document.getElementById('previ-bingo-pelic');
        if (bingoPelic === 700 || !selectedPelicanOACI) {
            bingoPelicDisplay.innerHTML = '-- kg';
        } else {
            bingoPelicDisplay.innerHTML = `${selectedPelicanOACI} / ${CALCULATOR_DATA.distPelicFeu} Nm / <b>${bingoPelic} kg</b>`;
        }

        const blocDepart = parseTime(document.querySelector('#bloc-depart .display-input').value);
        const fuelDepart = parseNumeric(document.querySelector('#fuel-depart .display-input').value);
        const limiteHDV = parseTime(document.querySelector('#limite-hdv .display-input').value);
        const tmdTime = parseTime(document.querySelector('#tmd .display-input').value);
        const csFeuTime = parseTime(CALCULATOR_DATA.csFeu);
        const transitTime = Math.round(calculateTransitTime(CALCULATOR_DATA.distBaseFeu));
        const rotationTime = Math.round(calculateRotationTime(CALCULATOR_DATA.distPelicFeu));
        const consoRotation = calculateConsoRotation(CALCULATOR_DATA.distPelicFeu);
        const consoAller = calculateFuelToGo(CALCULATOR_DATA.distBaseFeu);
        const heureSurFeu = blocDepart !== null ? blocDepart + transitTime : null;

        document.getElementById('duree-transit').textContent = formatTime(transitTime);
        document.getElementById('heure-sur-feu').textContent = formatTime(heureSurFeu);
        document.getElementById('conso-aller-feu').textContent = `${consoAller} kg`;
        document.getElementById('cs-sur-feu').textContent = CALCULATOR_DATA.csFeu;
        document.getElementById('tmd-display').textContent = formatTime(tmdTime);
        document.getElementById('hdv-restant-display').textContent = formatTime(limiteHDV);
        document.getElementById('duree-rotation').textContent = rotationTime === 20 ? '--:--' : formatTime(rotationTime);
        document.getElementById('conso-par-rotation').textContent = consoRotation === 250 ? '-- kg' : `${consoRotation} kg`;
        
        const fuelSurFeuWrapper = document.querySelector('#fuel-sur-feu-wrapper');
        const fuelSurFeuInput = fuelSurFeuWrapper.querySelector('.display-input');
        if (!isFuelSurFeuManual) {
            const fuelEstime = fuelDepart ? fuelDepart - consoAller : null;
            fuelSurFeuInput.value = fuelEstime ? `${fuelEstime} kg` : '';
            fuelSurFeuWrapper.classList.toggle('has-value', !!fuelEstime);
        }
        
        const fuelSurFeu = parseNumeric(fuelSurFeuInput.value);
        const resultsContainer = document.getElementById('previ-rotation-results-container');
        updateAndSortRotations(resultsContainer, { fuel: fuelSurFeu, time: heureSurFeu }, { bingoBase, bingoPelic, consoRotation, rotationTime, csFeuTime, tmdTime, limiteHDV, transitTime });
    }
    
    function updateSuiviTab() {
        const bingoBase = calculateBingo(CALCULATOR_DATA.distBaseFeu);
        const bingoPelic = calculateBingo(CALCULATOR_DATA.distPelicFeu);

        const bingoBaseDisplay = document.getElementById('suivi-bingo-base');
        if (bingoBase === 700) {
            bingoBaseDisplay.innerHTML = '-- kg';
        } else {
            bingoBaseDisplay.innerHTML = `${CALCULATOR_DATA.distBaseFeu} Nm / <b>${bingoBase} kg</b>`;
        }

        const bingoPelicDisplay = document.getElementById('suivi-bingo-pelic');
        if (bingoPelic === 700 || !selectedPelicanOACI) {
            bingoPelicDisplay.innerHTML = '-- kg';
        } else {
            bingoPelicDisplay.innerHTML = `${selectedPelicanOACI} / ${CALCULATOR_DATA.distPelicFeu} Nm / <b>${bingoPelic} kg</b>`;
        }

        const allRows = document.querySelectorAll('#bloc-fuel tbody tr');
        let lastFilledRow = null;
        allRows.forEach(row => { if (parseTime(row.querySelector('.time-input-wrapper .display-input').value) !== null || parseNumeric(row.querySelector('.numeric-input-wrapper .display-input').value) !== null) { lastFilledRow = row; } });

        if (!lastFilledRow) {
            document.getElementById('suivi-fuel-actuel').textContent = '-- kg';
            document.querySelectorAll('#suivi-rotation-results-container .value').forEach(el => el.textContent = '--');
        } else {
            const currentFuel = parseNumeric(lastFilledRow.querySelector('.numeric-input-wrapper .display-input').value);
            const currentTime = parseTime(lastFilledRow.querySelector('.time-input-wrapper .display-input').value);
            const currentHdv = parseTime(lastFilledRow.querySelector('.tps-vol-restant-cell').textContent);
            document.getElementById('suivi-fuel-actuel').textContent = currentFuel ? `${currentFuel} kg` : '--';
            const resultsContainer = document.getElementById('suivi-rotation-results-container');
            const consoRotation = isSuiviConsoManual ? parseNumeric(document.getElementById('suivi-conso-rotation-wrapper').querySelector('.display-input').value) : calculateConsoRotation(CALCULATOR_DATA.distPelicFeu);
            const rotationTime = isSuiviDureeManual ? parseTime(document.getElementById('suivi-duree-rotation-wrapper').querySelector('.display-input').value) : Math.round(calculateRotationTime(CALCULATOR_DATA.distPelicFeu));
            const csFeuTime = parseTime(CALCULATOR_DATA.csFeu);
            const tmdTime = parseTime(document.querySelector('#tmd .display-input').value);
            updateAndSortRotations(resultsContainer, { fuel: currentFuel, time: currentTime }, { bingoBase, bingoPelic, consoRotation, rotationTime, csFeuTime, tmdTime, limiteHDV: currentHdv, transitTime: 0 });
        }
    }

    function updateDeroutementTab() {
        const bingoBase = calculateBingo(CALCULATOR_DATA.distBaseFeu);
        const bingoPelic = calculateBingo(CALCULATOR_DATA.distPelicFeu);
        
        const bingoBaseDisplay = document.getElementById('derout-bingo-base');
        if (bingoBase === 700) {
            bingoBaseDisplay.innerHTML = '-- kg';
        } else {
            bingoBaseDisplay.innerHTML = `${CALCULATOR_DATA.distBaseFeu} Nm / <b>${bingoBase} kg</b>`;
        }

        const bingoPelicDisplay = document.getElementById('derout-bingo-pelic');
        if (bingoPelic === 700 || !selectedPelicanOACI) {
            bingoPelicDisplay.innerHTML = '-- kg';
        } else {
            bingoPelicDisplay.innerHTML = `${selectedPelicanOACI} / ${CALCULATOR_DATA.distPelicFeu} Nm / <b>${bingoPelic} kg</b>`;
        }
        
        const fuelForGpsTransit = calculateFuelToGo(CALCULATOR_DATA.distGpsFeu);
        const fuelMiniBase = fuelForGpsTransit + bingoBase + 250;
        const fuelMiniPelic = fuelForGpsTransit + bingoPelic + 250;
        
        document.getElementById('derout-fuel-mini-base').textContent = fuelMiniBase === 950 ? '-- kg' : `${fuelMiniBase} kg`;
        document.getElementById('derout-fuel-mini-pelic').textContent = fuelMiniPelic === 950 ? '-- kg' : `${fuelMiniPelic} kg`;
        
        const currentFuel = parseNumeric(document.querySelector('#deroutement-fuel-wrapper .display-input').value);
        const currentTime = parseTime(document.querySelector('#deroutement-heure-wrapper .display-input').value);
        const rotationTime = Math.round(calculateRotationTime(CALCULATOR_DATA.distPelicFeu));
        const consoRotation = calculateConsoRotation(CALCULATOR_DATA.distPelicFeu);
        const csFeuTime = parseTime(CALCULATOR_DATA.csFeu);
        const tmdTime = parseTime(document.querySelector('#tmd .display-input').value);
        const limiteHDV = parseTime(document.querySelector('#limite-hdv .display-input').value);
        const transitTimeFromGps = Math.round(calculateTransitTime(CALCULATOR_DATA.distGpsFeu));
        const resultsContainer = document.getElementById('derout-rotation-results-container');
        updateAndSortRotations(resultsContainer, { fuel: currentFuel, time: currentTime }, { bingoBase, bingoPelic, consoRotation, rotationTime, csFeuTime, tmdTime, limiteHDV, transitTime: transitTimeFromGps });
    }
    
    function updateAndSortRotations(container, current, params) { const lines = container.querySelectorAll('.result-line'); const sortable = []; lines.forEach(line => { const type = line.dataset.rotationType; let value = null; if (type === 'base' && current.fuel && params.consoRotation > 0) { value = ((current.fuel - params.bingoBase) / params.consoRotation); } if (type === 'pelic' && current.fuel && params.consoRotation > 0) { value = ((current.fuel - params.bingoPelic) / params.consoRotation); } if (type === 'cs' && params.csFeuTime !== null && current.time !== null && params.rotationTime > 0) { value = (params.csFeuTime - current.time) / params.rotationTime; } if (type === 'tmd' && params.tmdTime !== null && current.time !== null && params.rotationTime > 0) { value = (params.tmdTime - current.time) / params.rotationTime; } if (type === 'hdv' && params.limiteHDV !== null && params.rotationTime > 0) { const hdvOnSite = params.limiteHDV - (params.transitTime || 0); value = hdvOnSite / params.rotationTime; } line.querySelector('.value').textContent = value !== null && value > 0 ? value.toFixed(2) : '0.00'; sortable.push({ value: value !== null ? value : Infinity, element: line }); }); sortable.sort((a, b) => a.value - b.value); sortable.forEach(item => container.appendChild(item.element)); }
    
    function recalculateBlocFuel() { const blocDepart = parseTime(document.querySelector('#bloc-depart .display-input').value); const fuelDepart = parseNumeric(document.querySelector('#fuel-depart .display-input').value); const limiteHDV = parseTime(document.querySelector('#limite-hdv .display-input').value); let previousBlocArrivee = blocDepart; let previousFuelPelic = fuelDepart; let cumulativeTpsVol = 0; const tableRows = document.querySelectorAll('#bloc-fuel tbody tr'); tableRows.forEach((row) => { const blocArrivee = parseTime(row.querySelector('.time-input-wrapper .display-input').value); const fuelPelic = parseNumeric(row.querySelector('.numeric-input-wrapper .display-input').value); let dureeRotation = null; if (blocArrivee !== null && previousBlocArrivee !== null) { dureeRotation = blocArrivee - previousBlocArrivee; } let fuelRotation = null; if (fuelPelic !== null && previousFuelPelic !== null) { fuelRotation = previousFuelPelic - fuelPelic; } if (dureeRotation !== null && dureeRotation > 0) { cumulativeTpsVol += dureeRotation; } let tpsVolRestant = null; if (limiteHDV !== null) { tpsVolRestant = limiteHDV - cumulativeTpsVol; } if(blocArrivee === null && fuelPelic === null) { row.querySelector('.duree-rotation-cell').textContent = ''; row.querySelector('.fuel-rotation-cell').textContent = ''; row.querySelector('.tps-vol-cell').textContent = ''; row.querySelector('.tps-vol-restant-cell').textContent = ''; } else { row.querySelector('.duree-rotation-cell').textContent = formatTime(dureeRotation); row.querySelector('.fuel-rotation-cell').textContent = fuelRotation === null ? '' : fuelRotation; row.querySelector('.tps-vol-cell').textContent = formatTime(cumulativeTpsVol) || (blocDepart !== null ? '00:00' : ''); row.querySelector('.tps-vol-restant-cell').textContent = formatTime(tpsVolRestant); } if (blocArrivee !== null) previousBlocArrivee = blocArrivee; if (fuelPelic !== null) previousFuelPelic = fuelPelic; }); const lastRow = tableRows[tableRows.length - 1]; if (lastRow) { const lastBloc = parseTime(lastRow.querySelector('.time-input-wrapper .display-input').value); const lastFuel = parseNumeric(lastRow.querySelector('.numeric-input-wrapper .display-input').value); if (lastBloc !== null || lastFuel !== null) { addNewRow(); } } }
    
    function initializeTimeInput(wrapper, options = {}) { const displayInput = wrapper.querySelector('.display-input'); const engineInput = wrapper.querySelector('.engine-input'); const clearBtn = wrapper.querySelector('.clear-btn'); const updateUI = () => { wrapper.classList.toggle('has-value', displayInput.value !== ''); masterRecalculate(); }; const setDefaultValue = () => { if(options.defaultValue) { const savedValue = options.storageKey ? localStorage.getItem(options.storageKey) : null; const valueToSet = savedValue || options.defaultValue; displayInput.value = valueToSet; engineInput.value = valueToSet; updateUI(); } }; displayInput.addEventListener('dblclick', (e) => { e.preventDefault(); const now = new Date(); displayInput.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`; if(options.storageKey) localStorage.setItem(options.storageKey, displayInput.value); updateUI(); }); engineInput.addEventListener('input', () => { if (engineInput.value) { displayInput.value = engineInput.value; if(options.storageKey) localStorage.setItem(options.storageKey, displayInput.value); updateUI(); } }); if(clearBtn){ clearBtn.addEventListener('click', () => { if(options.defaultValue) { displayInput.value = options.defaultValue; engineInput.value = options.defaultValue; if(options.storageKey) localStorage.removeItem(options.storageKey); } else { displayInput.value = ''; engineInput.value = ''; } updateUI(); }); } if(options.defaultValue) setDefaultValue(); else updateUI(); }
    
    function initializeNumericInput(wrapper) { const displayInput = wrapper.querySelector('.display-input'); const clearBtn = wrapper.querySelector('.clear-btn'); const unit = wrapper.dataset.unit || ''; let shouldClearOnNextInput = false; const updateUI = () => wrapper.classList.toggle('has-value', displayInput.value !== ''); const formatValue = () => { let v = displayInput.value.replace(/[^0-9]/g, ''); if(v) { displayInput.value = `${v} ${unit}`; } else { displayInput.value = ''; } masterRecalculate(); }; displayInput.addEventListener('focus', () => { if (displayInput.readOnly) return; if (displayInput.value) { shouldClearOnNextInput = true; } displayInput.value = displayInput.value.replace(/[^0-9]/g, ''); }); displayInput.addEventListener('blur', () => { if (displayInput.readOnly) return; shouldClearOnNextInput = false; formatValue(); }); displayInput.addEventListener('input', () => { if (displayInput.readOnly) return; if (shouldClearOnNextInput && displayInput.value.length > 0) { const lastChar = displayInput.value.slice(-1); displayInput.value = lastChar.replace(/[^0-9]/g, ''); shouldClearOnNextInput = false; } else { displayInput.value = displayInput.value.replace(/[^0-9]/g, ''); } updateUI(); masterRecalculate(); }); displayInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); displayInput.blur(); } }); if(clearBtn){ clearBtn.addEventListener('click', () => { displayInput.value = ''; updateUI(); masterRecalculate(); }); } updateUI(); }
    
    const tableBody = document.querySelector('#bloc-fuel tbody');
    const addNewRow = () => { const row = document.createElement('tr'); row.innerHTML = `<td><div class="input-wrapper time-input-wrapper"><input type="text" class="display-input" readonly placeholder="--:--"><span class="clear-btn">&times;</span><span class="clock-icon">🕒</span><input type="time" class="engine-input"></div></td><td><div class="input-wrapper numeric-input-wrapper" data-unit="kg"><input type="text" class="display-input" inputmode="numeric" placeholder="[valeur]"><span class="clear-btn">&times;</span></div></td><td class="duree-rotation-cell"></td><td class="fuel-rotation-cell"></td><td class="tps-vol-cell"></td><td class="tps-vol-restant-cell"></td>`; tableBody.appendChild(row); initializeTimeInput(row.querySelector('.time-input-wrapper')); initializeNumericInput(row.querySelector('.numeric-input-wrapper')); };
    for (let i = 0; i < 6; i++) { addNewRow(); }
    
    initializeTimeInput(document.querySelector('#bloc-depart'));
    initializeNumericInput(document.querySelector('#fuel-depart'));
    initializeTimeInput(document.querySelector('#tmd'), { defaultValue: '21:30', storageKey: 'tmd' });
    initializeTimeInput(document.querySelector('#limite-hdv'), { defaultValue: '08:00', storageKey: 'limiteHDV' });
    initializeTimeInput(document.querySelector('#deroutement-heure-wrapper'));
    initializeNumericInput(document.querySelector('#deroutement-fuel-wrapper'));
    
    function setupManualButton(btnId, wrapperId, flagSetter, getFlag) { const btn = document.getElementById(btnId); const wrapper = document.getElementById(wrapperId); const input = wrapper.querySelector('.display-input'); btn.addEventListener('click', () => { const isManual = flagSetter(); if (isManual) { btn.textContent = 'MANUEL'; btn.classList.add('active'); input.readOnly = false; if (!wrapper.classList.contains('time-input-wrapper')) {input.focus();} } else { btn.textContent = 'AUTO'; btn.classList.remove('active'); input.readOnly = true; } masterRecalculate(); }); btn.textContent = getFlag() ? 'MANUEL' : 'AUTO'; }
    setupManualButton('fuel-sur-feu-manual-btn', 'fuel-sur-feu-wrapper', () => isFuelSurFeuManual = !isFuelSurFeuManual, () => isFuelSurFeuManual);
    setupManualButton('suivi-conso-rotation-manual-btn', 'suivi-conso-rotation-wrapper', () => isSuiviConsoManual = !isSuiviConsoManual, () => isSuiviConsoManual);
    setupManualButton('suivi-duree-rotation-manual-btn', 'suivi-duree-rotation-wrapper', () => isSuiviDureeManual = !isSuiviDureeManual, () => isSuiviDureeManual);
    initializeNumericInput(document.querySelector('#fuel-sur-feu-wrapper'));
    initializeNumericInput(document.querySelector('#suivi-conso-rotation-wrapper'));
    initializeTimeInput(document.querySelector('#suivi-duree-rotation-wrapper'));

    document.getElementById('reset-all-btn').addEventListener('click', () => { if (confirm("Voulez-vous vraiment remettre tout le tableau à zéro ?")) { document.querySelectorAll('#bloc-fuel .header-section .clear-btn').forEach(b => b.click()); tableBody.innerHTML = ''; for (let i = 0; i < 6; i++) { addNewRow(); } masterRecalculate(); } });
    
    masterRecalculate = () => {
        recalculateBlocFuel();
        updatePreviTab();
        updateSuiviTab();
        updateDeroutementTab();
    };
    
    masterRecalculate();
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('calculator-modal')) {
        initializeCalculator();
    }
});
