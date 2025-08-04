// =========================================================================
// VARIABLES GLOBALES (Ajouts)
// =========================================================================
let gaarCircuits = [];
let isGaarMode = false;
const manualCircuitColors = ['#ff00ff', '#00ffff', '#ff8c00', '#00ff00', '#ff1493'];
let gaarLayer = null;

// =========================================================================
// LOGIQUE PRINCIPALE DE L'APPLICATION
// =========================================================================
async function initializeApp() {
    // ...
    // Charger les circuits GAAR sauvegardés
    const savedGaarJSON = localStorage.getItem('gaarCircuits');
    if (savedGaarJSON) {
        gaarCircuits = JSON.parse(savedGaarJSON);
    }
    // ...
}

function initMap() {
    // ...
    gaarLayer = L.layerGroup().addTo(map);
    // ...
    map.on('click', handleGaarMapClick); // NOUVELLE GESTION DE CLIC
}

function setupEventListeners() {
    // ...
    const gaarModeButton = document.getElementById('gaar-mode-button');
    gaarModeButton.addEventListener('click', toggleGaarMode);

    const deleteCircuitsButton = document.getElementById('delete-circuits-btn');
    deleteCircuitsButton.addEventListener('click', () => {
        if (confirm("Voulez-vous vraiment supprimer tous les circuits GAAR ?")) {
            clearAllGaarCircuits();
        }
    });
}

// ... (fonctions de base inchangées) ...

// =========================================================================
// FONCTIONS DE GESTION DES CIRCUITS GAAR
// =========================================================================

function toggleGaarMode() {
    const gaarButton = document.getElementById('gaar-mode-button');
    const gaarControls = document.getElementById('gaar-controls');
    const mapContainer = document.getElementById('map');
    isGaarMode = !isGaarMode;

    if (isGaarMode) {
        gaarButton.classList.add('active');
        gaarControls.style.display = 'block';
        mapContainer.classList.add('crosshair-cursor');
        // On cache les autres tracés pour ne voir que les circuits
        routesLayer.clearLayers();
        userToTargetLayer.clearLayers();
        lftwRouteLayer.clearLayers();
        permanentAirportLayer.removeFrom(map);
        redrawGaarCircuits();
    } else {
        gaarButton.classList.remove('active');
        gaarControls.style.display = 'none';
        mapContainer.classList.remove('crosshair-cursor');
        // On réaffiche les tracés normaux
        gaarLayer.clearLayers();
        permanentAirportLayer.addTo(map);
        if (currentCommune) {
            displayCommuneDetails(currentCommune, false);
        }
    }
}

async function handleGaarMapClick(e) {
    if (!isGaarMode) return;
    
    // Logique pour trouver le circuit à compléter (le dernier circuit manuel avec moins de 3 points)
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
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latlng.lat}&lon=${latlng.lng}&zoom=10`);
        const data = await response.json();
        const name = data.address.city || data.address.town || data.address.village || data.display_name.split(',')[0];
        document.getElementById('gaar-status').textContent = `Point ajouté près de ${name}.`;
        return name;
    } catch (error) {
        document.getElementById('gaar-status').textContent = 'Nom non trouvé.';
        return null;
    }
}

function redrawGaarCircuits() {
    gaarLayer.clearLayers();
    gaarCircuits.forEach((circuit, circuitIndex) => {
        if (!circuit || circuit.points.length === 0) return;
        
        const latlngs = circuit.points.map(p => [p.lat, p.lng]);
        
        // Dessiner le polygone/ligne
        if (latlngs.length >= 3) {
            L.polygon(latlngs, { color: circuit.color }).addTo(gaarLayer);
        } else if (latlngs.length > 1) {
            L.polyline(latlngs, { color: circuit.color }).addTo(gaarLayer);
        }

        // Dessiner les marqueurs
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
