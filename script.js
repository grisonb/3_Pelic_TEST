// =========================================================================
// INITIALISATION DE L'APPLICATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (typeof L === 'undefined' || typeof JSZip === 'undefined') { 
        document.getElementById('status-message').textContent = "❌ ERREUR : Fichiers JS manquants."; 
        return; 
    }
    initializeApp();
});

// =========================================================================
// "MINI-BIBLIOTHÈQUE" POUR INDEXEDDB
// =========================================================================
const idb = {
    db: null,
    init(dbName, storeName) {
        return new Promise((resolve, reject) => {
            if (this.db) return resolve(this.db);
            const request = indexedDB.open(dbName, 1);
            request.onerror = (event) => reject("Erreur IndexedDB: " + event.target.errorCode);
            request.onsuccess = (event) => { this.db = event.target.result; resolve(this.db); };
            request.onupgradeneeded = (event) => { if (!event.target.result.objectStoreNames.contains(storeName)) { event.target.result.createObjectStore(storeName); } };
        });
    },
    set(storeName, key, value) {
        return new Promise((resolve, reject) => {
            this.init(DB_NAME, storeName).then(db => {
                const tx = db.transaction(storeName, "readwrite");
                tx.objectStore(storeName).put(value, key);
                tx.oncomplete = () => resolve();
                tx.onerror = (event) => reject(event.target.error);
            }).catch(reject);
        });
    },
    clear(storeName) {
        return new Promise((resolve, reject) => {
            this.init(DB_NAME, storeName).then(db => {
                const tx = db.transaction(storeName, "readwrite");
                tx.objectStore(storeName).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = (event) => reject(event.target.error);
            }).catch(reject);
        });
    }
};

// =========================================================================
// VARIABLES GLOBALES
// =========================================================================
let allCommunes = [], map, permanentAirportLayer, routesLayer, currentCommune = null;
let disabledAirports = new Set(), waterAirports = new Set(), searchToggleControl;
const MAGNETIC_DECLINATION = 1.0;
let userMarker = null, watchId = null;
let userToTargetLayer = null, lftwRouteLayer = null;
let showLftwRoute = true;
const DB_NAME = 'TileDatabase';
const TILE_STORE_NAME = 'tiles';
const airports = [ /* ... liste des aéroports ... */ ];

// =========================================================================
// LOGIQUE PRINCIPALE DE L'APPLICATION
// =========================================================================
async function initializeApp() {
    // ...
    await idb.init(DB_NAME, TILE_STORE_NAME);
    // ...
}

// ... (le reste de la logique de l'app est identique à la v4.3) ...

// =========================================================================
// GESTION CARTE HORS LIGNE (LOGIQUE ZIP + INDEXEDDB)
// =========================================================================
function updateOfflineButtonsState() {
    const downloadButton = document.getElementById('download-map-button');
    const deleteButton = document.getElementById('delete-map-button');
    if (localStorage.getItem('offlineMapDownloaded') === 'true') {
        downloadButton.style.display = 'none';
        deleteButton.style.display = 'block';
    } else {
        downloadButton.style.display = 'block';
        deleteButton.style.display = 'none';
    }
}

async function downloadOfflineMap() {
    const downloadButton = document.getElementById('download-map-button');
    const progressContainer = document.getElementById('download-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    // REMPLACEZ CET URL PAR LE LIEN DIRECT VERS VOTRE FICHIER ZIP
    const zipUrl = 'https://github.com/grisonB/3_Pelic_TEST/raw/main/offline_map.zip';

    if (!confirm("Ceci va télécharger le pack de carte hors ligne (environ 1 Go). Cette opération est beaucoup plus rapide et fiable. Continuer en Wi-Fi ?")) {
        return;
    }

    downloadButton.disabled = true;
    progressContainer.style.display = 'block';
    
    try {
        // 1. Téléchargement du ZIP
        progressText.textContent = 'Téléchargement du pack de carte...';
        const response = await fetch(zipUrl);
        if (!response.ok) throw new Error(`Erreur réseau: ${response.statusText}`);
        
        const reader = response.body.getReader();
        const contentLength = +response.headers.get('Content-Length');
        let receivedLength = 0;
        let chunks = [];
        while(true) {
            const {done, value} = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedLength += value.length;
            progressBar.value = (receivedLength / contentLength) * 100;
        }
        
        // 2. Décompression et stockage
        progressText.textContent = 'Décompression... (cela peut prendre une minute)';
        progressBar.value = 0;
        const blob = new Blob(chunks);
        const zip = await JSZip.loadAsync(blob);
        
        const files = Object.values(zip.files);
        let processedCount = 0;
        for (const file of files) {
            if (!file.dir) {
                const blob = await file.async("blob");
                await idb.set(TILE_STORE_NAME, `https://a.tile.openstreetmap.org/${file.name}`, blob);
            }
            processedCount++;
            progressBar.value = (processedCount / files.length) * 100;
        }

        progressText.textContent = 'Carte hors ligne installée !';
        localStorage.setItem('offlineMapDownloaded', 'true');
        updateOfflineButtonsState();

    } catch (error) {
        progressText.textContent = `Erreur : ${error.message}`;
        console.error("Erreur lors du téléchargement/traitement du ZIP:", error);
    } finally {
        downloadButton.disabled = false;
    }
}

async function deleteOfflineMap() {
    if (!confirm("Êtes-vous sûr de vouloir supprimer les données de la carte hors ligne ?")) {
        return;
    }
    const progressContainer = document.getElementById('download-progress');
    const progressText = document.getElementById('progress-text');
    progressContainer.style.display = 'block';
    progressText.textContent = 'Suppression des données...';

    await idb.clear(TILE_STORE_NAME);
    
    localStorage.removeItem('offlineMapDownloaded');
    updateOfflineButtonsState();
    progressText.textContent = 'Données supprimées.';
    setTimeout(() => { progressContainer.style.display = 'none'; }, 2000);
}

const SearchToggleControl = L.Control.extend({
    // ...
    onAdd: function (map) {
        // ...
        versionDisplay.innerText = 'v6.0';
        // ...
    }
});
