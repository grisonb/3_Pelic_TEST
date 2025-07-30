// Version complète et vérifiée de script.js

// ... (tout le début du code est identique)

async function initializeApp() {
    // ...
    // NOUVEAU : Vérification de SunCalc au démarrage
    if (typeof SunCalc === 'undefined') {
        console.error("SunCalc.js n'est pas chargé. Le calcul des heures de soleil échouera.");
        // Optionnel : Afficher un message d'erreur à l'utilisateur
        // document.getElementById('status-message').textContent = "❌ ERREUR : suncalc.js non chargé.";
    }
    // ...
}

// ...

function displayCommuneDetails(commune, shouldFitBounds = true) {
    routesLayer.clearLayers();
    const { latitude_mairie: lat, longitude_mairie: lon, nom_standard: name } = commune;
    document.getElementById('search-input').value = name;
    document.getElementById('results-list').style.display = 'none';
    document.getElementById('clear-search').style.display = 'block';

    let sunsetString = 'N/A';
    if (typeof SunCalc !== 'undefined') {
        const now = new Date();
        const times = SunCalc.getTimes(now, lat, lon);
        const sunsetTime = times.sunset;
        sunsetString = sunsetTime.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Paris'
        });
    }

    const popupContent = `<b>${name}</b><br>
                          ${convertToDMM(lat, 'lat')}<br>
                          ${convertToDMM(lon, 'lon')}<br>
                          <hr style="margin: 5px 0;">
                          🌅 Coucher: <b>${sunsetString}</b>`;

    const numAirports = parseInt(document.getElementById('airport-count').value, 10);
    const closestAirports = getClosestAirports(lat, lon, numAirports);
    const allPoints = [[lat, lon]];
    const fireIcon = L.divIcon({ className: 'custom-marker-icon fire-marker', html: '🔥' });
    L.marker([lat, lon], { icon: fireIcon }).bindPopup(popupContent).addTo(routesLayer);
    
    // Le reste de la fonction est inchangé
    closestAirports.forEach(ap => { /* ... */ });
    if (navigator.geolocation) { /* ... */ }
}

// ... (tout le reste du fichier est identique à la version précédente qui fonctionnait)

// Dans la définition de SearchToggleControl à la fin du fichier :
const SearchToggleControl = L.Control.extend({
    // ...
    onAdd: function (map) {
        // ...
        const versionDisplay = L.DomUtil.create('div', 'version-display', mainContainer);
        versionDisplay.innerText = 'v1.8'; // Mettez à jour la version ici
        // ...
    }
    // ...
});
