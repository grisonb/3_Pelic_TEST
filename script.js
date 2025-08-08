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
    // ... (tout le code de la carte reste identique jusqu'à SearchToggleControl)
}
// ... (toutes les fonctions de la carte: initMap, setupEventListeners, etc. restent identiques)

const SearchToggleControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function (map) {
        const mainContainer = L.DomUtil.create('div', 'leaflet-control search-toggle-wrapper');
        this.toggleButton = L.DomUtil.create('a', 'search-toggle-button', mainContainer);
        this.toggleButton.innerHTML = '🏙️';
        this.toggleButton.href = '#';
        this.communeDisplay = document.getElementById('commune-info-display'); 
        const versionDisplay = L.DomUtil.create('div', 'version-display', mainContainer);
        versionDisplay.innerText = 'v9.0';
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

// =========================================================================
// == NOUVEAU : MODULE DU CALCULATEUR DE VOL
// =========================================================================
const flightLog = {
    init() {
        // ... (tout le code du script de la maquette v49 est ici)
    },
    updateOnOpen() {
        // ... (fonction pour mettre à jour les données à l'ouverture)
    }
};

flightLog.init = function() {
    // Le code complet de la maquette v49 est placé ici
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

    function masterRecalculate() { recalculateBlocFuel(); updatePreviTab(); updateSuiviTab(); updateDeroutementTab(); }

    function updatePreviTab() { const blocDepart = parseTime(document.querySelector('#bloc-depart .display-input').value); const fuelDepart = parseNumeric(document.querySelector('#fuel-depart .display-input').value); const limiteHDV = parseTime(document.querySelector('#limite-hdv .display-input').value); const tmdTime = parseTime(document.querySelector('#tmd .display-input').value); const csFeuTime = parseTime(FAKE_DATA.csFeu); const transitTime = Math.round(calculateTransitTime(FAKE_DATA.distBaseFeu)); const rotationTime = Math.round(calculateRotationTime(FAKE_DATA.distPelicFeu)); const heureSurFeu = blocDepart !== null ? blocDepart + transitTime : null; const consoRotation = calculateConsoRotation(FAKE_DATA.distPelicFeu); document.getElementById('duree-transit').textContent = formatTime(transitTime); document.getElementById('duree-rotation').textContent = formatTime(rotationTime); document.getElementById('heure-sur-feu').textContent = formatTime(heureSurFeu); const fuelSurFeuWrapper = document.querySelector('#fuel-sur-feu-wrapper'); const fuelSurFeuInput = fuelSurFeuWrapper.querySelector('.display-input'); if (!isFuelSurFeuManual) { const consoAller = calculateFuelToGo(FAKE_DATA.distBaseFeu); const fuelEstime = fuelDepart ? fuelDepart - consoAller : null; fuelSurFeuInput.value = fuelEstime ? `${fuelEstime} kg` : ''; fuelSurFeuWrapper.classList.toggle('has-value', !!fuelEstime); } document.getElementById('conso-aller-feu').textContent = `${calculateFuelToGo(FAKE_DATA.distBaseFeu)} kg`; document.getElementById('conso-par-rotation').textContent = `${consoRotation} kg`; document.getElementById('cs-sur-feu').textContent = FAKE_DATA.csFeu; document.getElementById('tmd-display').textContent = formatTime(tmdTime); document.getElementById('hdv-restant-display').textContent = formatTime(limiteHDV); const bingoBase = calculateBingo(FAKE_DATA.distBaseFeu); const bingoPelic = calculateBingo(FAKE_DATA.distPelicFeu); document.getElementById('previ-bingo-base').textContent = `${bingoBase} kg`; document.getElementById('previ-bingo-pelic').textContent = `${bingoPelic} kg`; const fuelSurFeu = parseNumeric(fuelSurFeuInput.value); const resultsContainer = document.getElementById('previ-rotation-results-container'); updateAndSortRotations(resultsContainer, { fuel: fuelSurFeu, time: heureSurFeu }, { bingoBase, bingoPelic, consoRotation, rotationTime, csFeuTime, tmdTime, limiteHDV, transitTime }); }
    function updateSuiviTab() { const suiviPanel = document.querySelector('#suivi-rotations .analyse-grid'); const placeholder = document.querySelector('#suivi-rotations .placeholder-message'); const allRows = document.querySelectorAll('#bloc-fuel tbody tr'); let lastFilledRow = null; allRows.forEach(row => { if (parseTime(row.querySelector('.time-input-wrapper .display-input').value) !== null || parseNumeric(row.querySelector('.numeric-input-wrapper .display-input').value) !== null) { lastFilledRow = row; } }); document.getElementById('suivi-bingo-base').textContent = `${calculateBingo(FAKE_DATA.distBaseFeu)} kg`; document.getElementById('suivi-bingo-pelic').textContent = `${calculateBingo(FAKE_DATA.distPelicFeu)} kg`; if (!lastFilledRow) { suiviPanel.style.display = 'grid'; placeholder.style.display = 'none'; document.getElementById('suivi-fuel-actuel').textContent = '--'; document.querySelectorAll('#suivi-rotation-results-container .value').forEach(el => el.textContent = '--'); const consoWrapper = document.getElementById('suivi-conso-rotation-wrapper'); const dureeWrapper = document.getElementById('suivi-duree-rotation-wrapper'); if (!isSuiviConsoManual) { consoWrapper.querySelector('.display-input').value = `${calculateConsoRotation(FAKE_DATA.distPelicFeu)} kg`; consoWrapper.classList.toggle('has-value', true); } if (!isSuiviDureeManual) { dureeWrapper.querySelector('.display-input').value = formatTime(calculateRotationTime(FAKE_DATA.distPelicFeu)); dureeWrapper.classList.toggle('has-value', true); } return; } suiviPanel.style.display = 'grid'; placeholder.style.display = 'none'; const currentFuel = parseNumeric(lastFilledRow.querySelector('.numeric-input-wrapper .display-input').value); const currentTime = parseTime(lastFilledRow.querySelector('.time-input-wrapper .display-input').value); const currentHdv = parseTime(lastFilledRow.querySelector('.tps-vol-restant-cell').textContent); document.getElementById('suivi-fuel-actuel').textContent = currentFuel ? `${currentFuel} kg` : '--'; const consoWrapper = document.getElementById('suivi-conso-rotation-wrapper'); const dureeWrapper = document.getElementById('suivi-duree-rotation-wrapper'); const consoInput = consoWrapper.querySelector('.display-input'); const dureeInput = dureeWrapper.querySelector('.display-input'); let consoRotation = isSuiviConsoManual ? parseNumeric(consoInput.value) : calculateConsoRotation(FAKE_DATA.distPelicFeu); let rotationTime = isSuiviDureeManual ? parseTime(dureeInput.value) : Math.round(calculateRotationTime(FAKE_DATA.distPelicFeu)); if (!isSuiviConsoManual) { consoInput.value = consoRotation ? `${consoRotation} kg` : ''; consoWrapper.classList.toggle('has-value', !!consoRotation); } if (!isSuiviDureeManual) { dureeInput.value = formatTime(rotationTime) || ''; dureeWrapper.classList.toggle('has-value', !!rotationTime); } const csFeuTime = parseTime(FAKE_DATA.csFeu); const tmdTime = parseTime(document.querySelector('#tmd .display-input').value); const resultsContainer = document.getElementById('suivi-rotation-results-container'); updateAndSortRotations(resultsContainer, { fuel: currentFuel, time: currentTime }, { bingoBase: calculateBingo(FAKE_DATA.distBaseFeu), bingoPelic: calculateBingo(FAKE_DATA.distPelicFeu), consoRotation, rotationTime, csFeuTime, tmdTime, limiteHDV: currentHdv, transitTime: 0 }); }
    function updateDeroutementTab() { document.getElementById('derout-bingo-base').textContent = `${calculateBingo(FAKE_DATA.distBaseFeu)} kg`; document.getElementById('derout-bingo-pelic').textContent = `${calculateBingo(FAKE_DATA.distPelicFeu)} kg`; const fuelForGpsTransit = calculateFuelToGo(FAKE_DATA.distGpsFeu); const fuelMiniBase = fuelForGpsTransit + calculateBingo(FAKE_DATA.distBaseFeu) + 250; const fuelMiniPelic = fuelForGpsTransit + calculateBingo(FAKE_DATA.distPelicFeu) + 250; document.getElementById('derout-fuel-mini-base').textContent = `${fuelMiniBase} kg`; document.getElementById('derout-fuel-mini-pelic').textContent = `${fuelMiniPelic} kg`; const currentFuel = parseNumeric(document.querySelector('#deroutement-fuel-wrapper .display-input').value); const currentTime = parseTime(document.querySelector('#deroutement-heure-wrapper .display-input').value); const rotationTime = Math.round(calculateRotationTime(FAKE_DATA.distPelicFeu)); const consoRotation = calculateConsoRotation(FAKE_DATA.distPelicFeu); const csFeuTime = parseTime(FAKE_DATA.csFeu); const tmdTime = parseTime(document.querySelector('#tmd .display-input').value); const limiteHDV = parseTime(document.querySelector('#limite-hdv .display-input').value); const transitTimeFromGps = Math.round(calculateTransitTime(FAKE_DATA.distGpsFeu)); const resultsContainer = document.getElementById('derout-rotation-results-container'); updateAndSortRotations(resultsContainer, { fuel: currentFuel, time: currentTime }, { bingoBase: calculateBingo(FAKE_DATA.distBaseFeu), bingoPelic: calculateBingo(FAKE_DATA.distPelicFeu), consoRotation, rotationTime, csFeuTime, tmdTime, limiteHDV, transitTime: transitTimeFromGps }); }
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
    document.getElementById('refresh-gps-btn').addEventListener('click', () => { console.log("Rafraîchissement de la position GPS demandé."); masterRecalculate(); });
    
    masterRecalculate();
};
