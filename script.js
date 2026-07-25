//  =========================================================================
// INITIALISATION DE L'APPLICATION
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const markAppReady = () => {
        if (document.body) {
            document.body.classList.add('app-ready');
            document.documentElement.classList.add('app-ready');
        }
    };

    window.markNpfAppReady = markAppReady;

    try {
        if (typeof L === 'undefined') {
            const statusEl = document.getElementById('status-message');
            if (statusEl) statusEl.textContent = "❌ ERREUR : leaflet.min.js non chargé.";
            markAppReady();
            return;
        }

        initializeApp();

        // Laisse Leaflet créer la carte, puis retire l'écran de reprise.
        setTimeout(markAppReady, 250);
    } catch (error) {
        console.error('Erreur initialisation application:', error);
        const statusEl = document.getElementById('status-message');
        if (statusEl) statusEl.textContent = `❌ Erreur initialisation: ${error.message || error}`;
        markAppReady();
    }
});




// =========================================================================
// v2026.52 — version pérenne issue de v12.95 TEST
// Corrige le grand bandeau bas : Safari peut donner une hauteur CSS trop courte
// avec -webkit-fill-available. On force une variable de hauteur réelle et on
// redemande à Leaflet de recalculer sa taille.
// =========================================================================
(function setupNpfMapViewportHeightFix() {
    const applyViewportHeight = () => {
        try {
            const docEl = document.documentElement;
            const vv = window.visualViewport;
            const candidates = [
                window.innerHeight || 0,
                docEl ? docEl.clientHeight || 0 : 0,
                vv ? Math.round(vv.height + Math.max(0, vv.offsetTop || 0)) : 0,
                window.screen ? Math.round(Math.max(window.screen.height || 0, window.screen.availHeight || 0)) : 0
            ].filter(Boolean);

            const height = Math.max(...candidates);
            if (!height || !Number.isFinite(height)) return;

            docEl.style.setProperty('--npf-app-vh', `${height}px`);
            if (document.body) document.body.style.minHeight = `${height}px`;

            const mapEl = document.getElementById('map');
            if (mapEl) {
                mapEl.style.height = `${height}px`;
                mapEl.style.minHeight = `${height}px`;
                mapEl.style.bottom = '0px';
                mapEl.style.backgroundColor = '#dff3fb';
            }

            setTimeout(() => {
                try {
                    if (typeof map !== 'undefined' && map && typeof map.invalidateSize === 'function') {
                        map.invalidateSize(true);
                    }
                    if (typeof baseTileLayer !== 'undefined' && baseTileLayer && typeof baseTileLayer.redraw === 'function') {
                        baseTileLayer.redraw();
                    }
                } catch (_) {}
            }, 80);
        } catch (_) {}
    };

    const scheduleApply = () => {
        applyViewportHeight();
        setTimeout(applyViewportHeight, 250);
        setTimeout(applyViewportHeight, 900);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleApply, { once: true });
    } else {
        scheduleApply();
    }

    window.addEventListener('load', scheduleApply, { passive: true });
    window.addEventListener('resize', scheduleApply, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(scheduleApply, 350), { passive: true });
    window.addEventListener('pageshow', scheduleApply, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleApply(); }, { passive: true });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleApply, { passive: true });
        window.visualViewport.addEventListener('scroll', scheduleApply, { passive: true });
    }
})();

// =========================================================================
// REPRISE iPAD / PWA APRÈS LONGUE PÉRIODE EN ARRIÈRE-PLAN
// =========================================================================
(function setupBackgroundResumeRecovery() {
    const LONG_BACKGROUND_MS = 5 * 60 * 1000;
    const RECOVERY_GUARD_KEY = `npfResumeRecoveryReload:${window.APP_VERSION || 'unknown'}`;
    let hiddenAt = 0;

    const markReady = () => {
        if (document.body) {
            document.body.classList.add('app-ready');
            document.documentElement.classList.add('app-ready');
        }
    };

    const invalidateMapSoon = () => {
        setTimeout(() => {
            try {
                if (typeof map !== 'undefined' && map && typeof map.invalidateSize === 'function') {
                    map.invalidateSize(true);
                }
            } catch (_) {}
            markReady();
        }, 250);
    };

    const recoverIfMapStillBlank = () => {
        setTimeout(() => {
            try {
                const mapEl = document.getElementById('map');
                const mapLooksReady = !!(
                    mapEl
                    && mapEl.classList.contains('leaflet-container')
                    && mapEl.offsetWidth > 0
                    && mapEl.offsetHeight > 0
                );

                if (mapLooksReady) return;

                const alreadyReloaded = sessionStorage.getItem(RECOVERY_GUARD_KEY) === '1';
                if (!alreadyReloaded && typeof window.forceRecoveryReload === 'function') {
                    sessionStorage.setItem(RECOVERY_GUARD_KEY, '1');
                    window.forceRecoveryReload();
                }
            } catch (_) {}
        }, 3500);
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            hiddenAt = Date.now();
            return;
        }

        const wasLongBackground = hiddenAt && (Date.now() - hiddenAt) >= LONG_BACKGROUND_MS;
        invalidateMapSoon();

        if (wasLongBackground) {
            recoverIfMapStillBlank();
        }
    });

    window.addEventListener('pageshow', (event) => {
        markReady();
        invalidateMapSoon();

        if (event.persisted) {
            recoverIfMapStillBlank();
        }
    });

    window.addEventListener('load', () => {
        markReady();
        setTimeout(() => {
            try {
                if (typeof map !== 'undefined' && map && typeof map.invalidateSize === 'function') {
                    map.invalidateSize(true);
                }
            } catch (_) {}
        }, 500);
    });

    // Si Safari/iPad repart sur un état incomplet, on évite un blanc permanent.
    setTimeout(() => {
        markReady();
        recoverIfMapStillBlank();
    }, 9000);
})();


// v12.22 — reprise iPad plus progressive après veille.
(function setupNpfFastResumeAfterWake() {
    const invalidateDelays = [80, 250, 600, 1200, 2200];

    const refreshMapAfterWake = () => {
        invalidateDelays.forEach(delay => {
            setTimeout(() => {
                try {
                    if (typeof map !== 'undefined' && map && typeof map.invalidateSize === 'function') {
                        map.invalidateSize(true);
                    }
                    if (typeof baseTileLayer !== 'undefined' && map && baseTileLayer) {
                        baseTileLayer.redraw();
                    }
                } catch (_) {}
            }, delay);
        });
    };

    window.addEventListener('focus', refreshMapAfterWake);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshMapAfterWake();
    });
    window.addEventListener('pageshow', refreshMapAfterWake);
})();

// v12.71 — Prévi rotation : +1 TMD/CS/HDV et aides détaillées.
(function setupNpfIpadResumeHardening() {
    const LONG_BACKGROUND_MS = 2 * 60 * 1000;
    const RESUME_DELAYS_MS = [0, 80, 180, 350, 700, 1200, 2200, 3600];
    let hiddenAt = 0;
    let resumeToken = 0;

    const markReady = () => {
        try {
            if (document.body) document.body.classList.add('app-ready');
            if (document.documentElement) document.documentElement.classList.add('app-ready');
        } catch (_) {}
    };

    const ensureResumeOverlay = () => {
        let overlay = document.getElementById('npf-resume-overlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'npf-resume-overlay';
        overlay.setAttribute('aria-live', 'polite');
        overlay.innerHTML = '<div class="npf-resume-card">Patience, je réfléchis ...</div>';
        document.body.appendChild(overlay);
        return overlay;
    };

    const showResumeOverlay = () => {
        try {
            if (!document.body) return;
            document.body.classList.add('npf-resuming');
            ensureResumeOverlay();
        } catch (_) {}
    };

    const hideResumeOverlay = (token, delay = 1800) => {
        setTimeout(() => {
            if (token !== resumeToken) return;
            try {
                if (document.body) document.body.classList.remove('npf-resuming');
            } catch (_) {}
        }, delay);
    };

    const forceMapContainerVisible = () => {
        try {
            const mapEl = document.getElementById('map');
            if (mapEl) {
                mapEl.style.visibility = 'visible';
                mapEl.style.opacity = '1';
                mapEl.style.backgroundColor = '#eef2f5';
            }

            document.querySelectorAll('.leaflet-container, .leaflet-pane, .leaflet-map-pane, .leaflet-tile-pane').forEach((el) => {
                el.style.visibility = 'visible';
                el.style.opacity = '1';
            });
        } catch (_) {}
    };

    const redrawVisibleApplicationLayers = () => {
        try {
            if (typeof updateDepartmentsLayerAppearance === 'function' && areDepartmentsVisible) {
                updateDepartmentsLayerAppearance();
            }
        } catch (_) {}

        try {
            if (typeof updateCommunesLayerAppearance === 'function' && areCommunesVisible) {
                updateCommunesLayerAppearance();
            }
        } catch (_) {}

        try {
            if (typeof redrawGaarCircuits === 'function' && isGaarMode) {
                redrawGaarCircuits();
            }
        } catch (_) {}

        try {
            if (typeof updateHighVoltageLinesLayerVisibility === 'function') {
                updateHighVoltageLinesLayerVisibility();
            }
        } catch (_) {}

        try {
            if (typeof refreshUI === 'function') {
                refreshUI();
            }
        } catch (_) {}
    };

    const refreshLeafletOnce = (options = {}) => {
        markReady();
        forceMapContainerVisible();

        try {
            if (typeof map !== 'undefined' && map && typeof map.invalidateSize === 'function') {
                map.invalidateSize(options.pan === true);
            }
        } catch (_) {}

        try {
            if (typeof notifyServiceWorkerActivePacks === 'function') {
                notifyServiceWorkerActivePacks(activeOfflinePacks);
            }
        } catch (_) {}

        try {
            if (typeof baseTileLayer !== 'undefined' && baseTileLayer && typeof baseTileLayer.redraw === 'function') {
                baseTileLayer.redraw();
            }
        } catch (_) {}

        redrawVisibleApplicationLayers();
    };

    const countUsableTiles = () => {
        try {
            const tiles = Array.from(document.querySelectorAll('.leaflet-tile'));
            if (!tiles.length) return 0;
            return tiles.filter((tile) => {
                const img = tile;
                const rect = img.getBoundingClientRect ? img.getBoundingClientRect() : null;
                const hasSize = rect && rect.width > 10 && rect.height > 10;
                return hasSize && img.complete !== false && img.style.display !== 'none' && img.style.visibility !== 'hidden';
            }).length;
        } catch (_) {
            return 0;
        }
    };

    const softRebuildTileLayerIfNeeded = () => {
        try {
            if (typeof isZipImportRunning !== 'undefined' && isZipImportRunning) return;
            if (countUsableTiles() > 0) return;
            if (typeof setupBaseTileLayer === 'function' && typeof map !== 'undefined' && map) {
                setupBaseTileLayer();
                if (typeof map.invalidateSize === 'function') map.invalidateSize(true);
            }
        } catch (_) {}
    };

    const runResumeSequence = (reason = 'resume') => {
        const token = ++resumeToken;
        const wasLongBackground = hiddenAt && (Date.now() - hiddenAt) >= LONG_BACKGROUND_MS;
        const shouldShowOverlay = wasLongBackground || reason === 'pageshow-persisted';

        markReady();
        forceMapContainerVisible();
        if (shouldShowOverlay) showResumeOverlay();

        RESUME_DELAYS_MS.forEach((delay, index) => {
            setTimeout(() => {
                if (token !== resumeToken) return;
                refreshLeafletOnce({ pan: index >= 2 });
            }, delay);
        });

        if (shouldShowOverlay) {
            setTimeout(() => {
                if (token !== resumeToken) return;
                softRebuildTileLayerIfNeeded();
            }, 2400);
            hideResumeOverlay(token, 3200);
        } else {
            hideResumeOverlay(token, 900);
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            hiddenAt = Date.now();
            return;
        }
        runResumeSequence('visible');
    }, { passive: true });

    window.addEventListener('pageshow', (event) => {
        runResumeSequence(event && event.persisted ? 'pageshow-persisted' : 'pageshow');
    });

    window.addEventListener('focus', () => {
        runResumeSequence('focus');
    });
})();


// =========================================================================
// VARIABLES GLOBALES
// =========================================================================
let allCommunes = [], map, baseTileLayer, permanentAirportLayer, routesLayer, waterPointsLayer, currentCommune = null, selectedPelicanOACI = null;
let communeAliases = [];
let communesByCodeInsee = new Map();
let disabledAirports = new Set(), waterAirports = new Set(), customPelicanAirports = new Set();
const MAGNETIC_DECLINATION = 1.0;
let userMarker = null, watchId = null, accuracyCircle = null, headingLayer = null, lastPosition = null;
let centerGpsFollowActive = false;
let centerGpsFollowProgrammaticMove = false;
let centerGpsFollowPauseTimer = null;
let centerGpsFollowPausedUntil = 0;
let centerGpsFollowStartedLiveGps = false;
let centerGpsFollowHandlersInstalled = false;
let centerGpsFollowUserGestureActive = false;
let centerGpsFollowLastUserGestureAt = 0;
const CENTER_GPS_FOLLOW_RECENTER_DELAY_MS = 10000;
let ownGpsVectorLayer = null, ownGpsVectorMarkers = [];
let userToTargetLayer = null, lftwRouteLayer = null, fireHistoryLayer = null;
let showLftwRoute = true;
let departmentsLayerGroup = null;
let departmentsLabelsLayer = null;
let departmentsPolygonData = [];
let departmentsLayerLoadPromise = null;
let highVoltageLinesLayer = null;
let highVoltageLinesRenderer = null;
let areDepartmentsVisible = false;
let hasLoadedDepartments = false;
let communesLayerGroup = null;
let communesLabelsLayer = null;
let areCommunesVisible = false;
let hasLoadedCommunes = false;
let communesLabelData = [];
let communesViewportLayerData = [];
let communesPolygonData = [];
let communesLayerLoadController = null;
let communesLayerLoadPromise = null;

/*
 * v13.93 TEST — priorité des libellés de communes selon la population.
 * La géométrie Etalab reste la source des contours. La population est chargée
 * séparément depuis l'API officielle geo.api.gouv.fr et mise en cache localement.
 */
const COMMUNES_POPULATION_API_URL = 'https://geo.api.gouv.fr/communes?fields=nom,code,population&format=json';
const COMMUNES_POPULATION_CACHE_KEY = 'npfCommunesPopulationV1';
const COMMUNES_POPULATION_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
let communesPopulationByInsee = new Map();
let communesPopulationLoadPromise = null;
const DEFAULT_BASE_OACI = 'LFTW';
let selectedBaseOACI = DEFAULT_BASE_OACI;
let gaarCircuits = [];
let isGaarMode = false;
let isDrawingMode = false;
const manualCircuitColors = ['#ff00ff', '#00ffff', '#ff8c00', '#00ff00', '#ff1493'];
let gaarLayer = null;
let db; // Variable pour la connexion à la base de données IndexedDB
const OFFLINE_DB_NAME = 'OfflineTilesDB_v13_70_clean';
const OFFLINE_TILES_ENABLED_KEY = 'offlineTilesEnabled';
const DEFAULT_OFFLINE_TILES_ENABLED = true;
const MAP_SOURCE_MODE_KEY = 'mapSourceMode';
const DEFAULT_MAP_SOURCE_MODE = 'online';
const OFFLINE_ONLINE_FALLBACK_KEY = 'offlineOnlineFallback';
const DEFAULT_OFFLINE_ONLINE_FALLBACK = true;
const OFFLINE_TILES_MAX_ZOOM_KEY = 'offlineTilesMaxZoom';
const OFFLINE_TILES_MIN_ZOOM_KEY = 'offlineTilesMinZoom';
const OFFLINE_ACTIVE_PACKS_KEY = 'offlineActivePacks';
const OFFLINE_ACTIVE_PACK_DATABASES_KEY = 'offlineActivePackDatabases';
const OFFLINE_MAP_DATABASE_PREFIX = 'OfflineMap_';
const COMMUNES_CACHE_KEY = 'communesDataCacheV1';
const COMMUNES_ALIASES_CACHE_KEY = 'communesAliasesCacheV2';
const AIRPORT_PDF_STORE_NAME = 'airportPdfs';
const AIRPORT_PDF_DB_NAME = 'AirportPdfsDB';
const AIRPORT_PDF_DB_VERSION = 1;
const FDF_REDUCED_PDF_KEY = 'DOC_FDF_REDUITE';
const FDF_REDUCED_PDF_FILENAME = 'Doc Fdf Réduite.pdf';
const FDF_REDUCED_PDF_LABEL = 'Doc FDF réduite';
const FDF_REDUCED_PDF_SERVER_CANDIDATES = [
    './pdf/Doc%20Fdf%20R%C3%A9duite.pdf',
    './pdf/Doc%20Fdf%20R%C3%A9duit%C3%A9.pdf',
    './pdf/Doc Fdf Réduite.pdf',
    './pdf/Doc Fdf Réduité.pdf'
];
const OPS_FREQUENCIES_PDF_KEY = 'CARTE_FREQUENCES_OPS';
const OPS_FREQUENCIES_PDF_FILENAME = 'Carte Fréquences OPS.pdf';
const OPS_FREQUENCIES_PDF_LABEL = 'Carte Fréquences OPS';
const OPS_FREQUENCIES_PDF_SERVER_CANDIDATES = [
    './pdf/Carte%20Fr%C3%A9quences%20OPS.pdf',
    './pdf/Carte%20Frequences%20OPS.pdf',
    './pdf/Carte Fréquences OPS.pdf',
    './pdf/Carte Frequences OPS.pdf'
];
let airportPdfDb = null;
const WATER_POINTS_LAYER_KEY = 'showWaterPointsLayer';
let showWaterPointsLayer = localStorage.getItem(WATER_POINTS_LAYER_KEY) === 'true';
const HIGH_VOLTAGE_LINES_LAYER_KEY = 'showHighVoltageLinesLayer';
const HIGH_VOLTAGE_LINES_GEOJSON_URL = 'lignes_ht_rte_simplifiees.geojson';
let showHighVoltageLinesLayer = localStorage.getItem(HIGH_VOLTAGE_LINES_LAYER_KEY) === 'true';
let hasLoadedHighVoltageLines = false;
let isHighVoltageLinesLoading = false;
const TRAFFIC_LAYER_KEY = 'showTrafficLayer';

/*
 * v13.96 TEST — intégration SafeSky préparée sans exposer la clé.
 *
 * La clé SafeSky ne devra jamais apparaître ici ni dans GitHub.
 * SAFESKY_PROXY_URL recevra plus tard l'adresse du proxy serveur chargé :
 * - d'ajouter l'en-tête x-api-key ;
 * - d'appeler /v1/beacons ;
 * - de renvoyer le JSON SafeSky sans modification.
 *
 * Exemple de contrat attendu côté NPF :
 * GET <proxy>?viewport=lat_min,lng_min,lat_max,lng_max&show_grounded=false
 */
const SAFESKY_PROXY_URL = '';
const SAFESKY_PROVIDER = Object.freeze({
    label: 'SafeSky',
    baseUrl: SAFESKY_PROXY_URL,
    urlFormat: 'viewport',
    dataFormat: 'safesky'
});
const TRAFFIC_PROVIDER_LABEL = SAFESKY_PROXY_URL
    ? 'SafeSky'
    : 'adsb.fi v3 / adsb.lol / airplanes.live';

/*
 * v13.98 :
 * - avant la clé : les anciennes sources permettent de travailler sur l'interface ;
 * - dès que SAFESKY_PROXY_URL est renseigné : SafeSky devient l'unique source.
 *
 * Les anciennes sources ne sont donc jamais fusionnées avec SafeSky et ne peuvent
 * pas créer de doublons avec les données agrégées SafeSky.
 */
const TRAFFIC_API_PROVIDERS = SAFESKY_PROXY_URL
    ? [SAFESKY_PROVIDER]
    : [
        { label: 'adsb.fi v3', baseUrl: 'https://opendata.adsb.fi/api/v3', urlFormat: 'latlon', dataFormat: 'readsb' },
        { label: 'adsb.lol v2', baseUrl: 'https://api.adsb.lol/v2', urlFormat: 'latlon', dataFormat: 'readsb' },
        { label: 'airplanes.live v2', baseUrl: 'https://api.airplanes.live/v2', urlFormat: 'point', dataFormat: 'readsb' }
    ];
const TRAFFIC_RADIUS_NM = 50;
const TRAFFIC_REFRESH_INTERVAL_MS = 5000;
const TRAFFIC_MAX_AIRCRAFT = 80;
const TRAFFIC_MAX_SEEN_SECONDS = 90;

/*
 * v13.97 TEST — moteur trafic réactivé pour travailler sur l'interface et
 * les filtres. Tant que SAFESKY_PROXY_URL est vide, SafeSky n'est pas appelé :
 * les sources ADS-B existantes restent utilisées automatiquement.
 */
const TRAFFIC_DISABLED_FOR_NOW = false;
let trafficLayer = null;
let showTrafficLayer = localStorage.getItem(TRAFFIC_LAYER_KEY) === 'true';
let isTrafficLoading = false;
let trafficRefreshTimer = null;
let lastTrafficRefreshAt = 0;
let lastTrafficError = '';
let lastTrafficDisplayedCount = 0;
const TRAFFIC_SETTINGS_STORAGE_KEY = 'trafficLayerSettingsV1';
const DEFAULT_TRAFFIC_SETTINGS = Object.freeze({
    radiusNm: TRAFFIC_RADIUS_NM,
    maxAircraft: TRAFFIC_MAX_AIRCRAFT,
    minAltitudeFt: 0,
    maxAltitudeFt: null,
    showAltitudeLabel: false,
    relativeAltitudeEnabled: false,
    relativeAltitudeBandFt: 1500,
    trafficAroundOwnPosition: true,
    trafficAroundFire: true
});
let trafficSettings = loadTrafficSettings();
const FIRE_HISTORY_STORAGE_KEY = 'fireHistoryV1';
const FIRE_HISTORY_COLLAPSED_STORAGE_KEY = 'fireHistoryCollapsedV1';
const FIRE_HISTORY_MAX_ITEMS = 20;
const FORCE_DISPLAY_MODE = new URLSearchParams(window.location.search).get('force_display') === '1';
const SHOW_DEPARTMENTS_LAYER_KEY = 'showDepartmentsLayer';
const SHOW_COMMUNES_LAYER_KEY = 'showCommunesLayer';
const LAST_GPS_POSITION_KEY = 'lastGpsPositionV1';
const COMMUNES_DISPLAY_MIN_ZOOM = 10.5;
const ONLINE_MAX_NATIVE_ZOOM = 18;
const OFFLINE_FALLBACK_NATIVE_ZOOM = 14;
const OFFLINE_HARD_MAX_NATIVE_ZOOM = 13;
// v13.58 — iPad : démarrage offline séquencé, sans scan IndexedDB lourd au lancement.
// Buffer augmenté modérément pour réduire les flashes blancs furtifs sur la carte NPF sans revenir au keepBuffer 32.
const OFFLINE_TILE_KEEP_BUFFER = 6;
const OFFLINE_TILE_UPDATE_INTERVAL_MS = 80;
// Tuile neutre opaque : évite l'effet page blanche si une tuile manque brièvement.
const OFFLINE_TILE_PLACEHOLDER_DATA_URL = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22256%22%20height%3D%22256%22%3E%3Crect%20width%3D%22256%22%20height%3D%22256%22%20fill%3D%22%23d8e2e8%22/%3E%3C/svg%3E';
// Carte OACI/IGN : plafond plus strict pour éviter de demander des tuiles inexistantes.
const OACI_OFFLINE_MAX_NATIVE_ZOOM = 10;
const OFFLINE_TILE_WAKE_DELAYS_MS = [250, 900, 1800, 3500, 6500, 10000];
const OFFLINE_AUX_LAYER_START_DELAY_MS = 6500;
const OFFLINE_DISABLE_STARTUP_FORCE_SCAN = true;
let offlineTileWakeToken = 0;
let offlineMapSwitchToken = 0;
let highVoltageLinesRetryToken = 0;
const GLOBAL_MAX_ZOOM = 18;
const GLOBAL_MIN_ZOOM = 0;
let baseTileMaxNativeZoom = ONLINE_MAX_NATIVE_ZOOM;
let baseTileMinNativeZoom = GLOBAL_MIN_ZOOM;
let offlineTilesMode = DEFAULT_OFFLINE_TILES_ENABLED;
let mapSourceMode = DEFAULT_MAP_SOURCE_MODE;
let offlineOnlineFallbackMode = DEFAULT_OFFLINE_ONLINE_FALLBACK;
let activeOfflinePacks = [];
let activeOfflinePackDatabases = [];
let isMapSourceSwitching = false;
let isZipImportRunning = false;
const STARTUP_GPS_CENTER_ZOOM = 10;
const UPDATE_REMINDER_STORAGE_KEY = 'npfUpdateReminderLastShownAt';
const UPDATE_REMINDER_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000;
let startupGpsAutoCenteredWithRealPosition = false;
let startupGpsStoredCenterAppliedAt = 0;
let isSimulationMode = false;
let simulationMapClickHandler = null;
let simulationSuppressNextClickUntil = 0;
let simulationActionPopup = null;
let simulationWasLiveGpsActiveBeforeSimulation = false;

// v12.22 — sécurité : un import interrompu ne doit pas bloquer les suppressions suivantes.
try {
    sessionStorage.removeItem('npfZipImportRunning');
} catch (_) {}
const CHAT_STORAGE_KEY = 'teamChatConfig';
const CHAT_HISTORY_KEY = 'teamChatHistory';
let chatClient = null;
let chatTopic = null;
let chatHistoryTopic = null;
let chatPresenceTopic = null;
let chatLocationTopic = null;
let chatConnected = false;
const CHAT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const MQTT_SCRIPT_URL = 'https://unpkg.com/mqtt/dist/mqtt.min.js';

// =========================================================================
// CHAT - NOTIFICATIONS PUSH PWA
// =========================================================================
// À REMPLIR quand le serveur push sera en place.
// Exemple: const CHAT_PUSH_API_URL = 'https://ton-domaine.fr/api/chat-push';
// Exemple: const CHAT_PUSH_VAPID_PUBLIC_KEY = 'BAB6UkrM0OzfJPCKYux_BdLfQJbMo7qKoXPhIoTB99J93yCS69c5qk2VWYBz0aftsKwdpVrVm0JMmkdwrNRfBpY';
const CHAT_PUSH_API_URL = 'https://grisonb.synology.me:8443';
const CHAT_PUSH_VAPID_PUBLIC_KEY = 'BAB6UkrM0OzfJPCKYux_BdLfQJbMo7qKoXPhIoTB99J93yCS69c5qk2VWYBz0aftsKwdpVrVm0JMmkdwrNRfBpY';
let mqttLoaderPromise = null;

const pelicanAirports = [
    { oaci: "LFLU", name: "Valence-Chabeuil", lat: 44.920, lon: 4.968 }, { oaci: "LFMU", name: "Béziers-Vias", lat: 43.323, lon: 3.354 }, { oaci: "LFJR", name: "Angers-Marcé", lat: 47.560, lon: -0.312 }, { oaci: "LFHO", name: "Aubenas-Ardèche Méridionale", lat: 44.545, lon: 4.385 }, { oaci: "LFLX", name: "Châteauroux-Déols", lat: 46.861, lon: 1.720 }, { oaci: "LFBM", name: "Mont-de-Marsan", lat: 43.894, lon: -0.509 }, { oaci: "LFBL", name: "Limoges-Bellegarde", lat: 45.862, lon: 1.180 }, { oaci: "LFAQ", name: "Albert-Bray", lat: 49.972, lon: 2.698 }, { oaci: "LFBP", name: "Pau-Pyrénées", lat: 43.380, lon: -0.418 }, { oaci: "LFTH", name: "Toulon-Hyères", lat: 43.097, lon: 6.146 }, { oaci: "LFSG", name: "Épinal-Mirecourt", lat: 48.325, lon: 6.068 }, { oaci: "LFKC", name: "Calvi-Sainte-Catherine", lat: 42.530, lon: 8.793 }, { oaci: "LFMD", name: "Cannes-Mandelieu", lat: 43.542, lon: 6.956 }, { oaci: "LFKB", name: "Bastia-Poretta", lat: 42.552, lon: 9.483 }, { oaci: "LFMH", name: "Saint-Étienne-Bouthéon", lat: 45.541, lon: 4.296 }, { oaci: "LFKF", name: "Figari-Sud-Corse", lat: 41.500, lon: 9.097 }, { oaci: "LFCC", name: "Cahors-Lalbenque", lat: 44.351, lon: 1.475 }, { oaci: "LFML", name: "Marseille-Provence", lat: 43.436, lon: 5.215 }, { oaci: "LFKJ", name: "Ajaccio-Napoléon-Bonaparte", lat: 41.923, lon: 8.802 }, { oaci: "LFMK", name: "Carcassonne-Salvaza", lat: 43.215, lon: 2.306 }, { oaci: "LFRV", name: "Vannes-Meucon", lat: 47.720, lon: -2.721 }, { oaci: "LFTW", name: "Nîmes-Garons", lat: 43.757, lon: 4.416 }, { oaci: "LFMP", name: "Perpignan-Rivesaltes", lat: 42.740, lon: 2.870 }, { oaci: "LFBD", name: "Bordeaux-Mérignac", lat: 44.828, lon: -0.691 }, { oaci: "LFCR", name: "Rodez-Aveyron", lat: 44.4079, lon: 2.4827 }, { oaci: "LFBN", name: "Niort-Souché", lat: 46.3135, lon: -0.3945 }, { oaci: "LFSJ", name: "Dole-Tavaux", lat: 47.039, lon: 5.428 }
];


const waterPoints = [{"id":"AIGUEBLETTE","name":"Aigueblette","countryCode":"FR","lat":45.55,"lon":5.8},{"id":"AJACCIO","name":"Ajaccio","countryCode":"FR","lat":41.916667,"lon":8.75},{"id":"ANDANCE","name":"Andance","countryCode":"FR","lat":45.216667,"lon":4.8},{"id":"ANNECY","name":"Annecy","countryCode":"FR","lat":45.85,"lon":6.166667},{"id":"BAGES","name":"Bages","countryCode":"FR","lat":43.1,"lon":3.0},{"id":"BASSE_SEINE","name":"Basse Seine","countryCode":"FR","lat":49.433333,"lon":0.6},{"id":"BASTIA","name":"Bastia","countryCode":"FR","lat":42.516667,"lon":9.55},{"id":"BEAULIEU_MENTON","name":"Beaulieu-Menton","countryCode":"FR","lat":43.7,"lon":7.333333},{"id":"BEAUTIRAN","name":"Beautiran","countryCode":"FR","lat":44.716667,"lon":-0.45},{"id":"BEC_D_AMBES","name":"Bec D’Ambes","countryCode":"FR","lat":45.016667,"lon":-0.583333},{"id":"BERRE","name":"Berre","countryCode":"FR","lat":43.483333,"lon":5.1},{"id":"BISCAROSSE","name":"Biscarosse","countryCode":"FR","lat":44.35,"lon":-1.183333},{"id":"BORT_LES_ORGUES","name":"Bort Les Orgues","countryCode":"FR","lat":45.45,"lon":2.5},{"id":"BOULOGNE_SUR_GESSE","name":"Boulogne Sur Gesse","countryCode":"FR","lat":43.333333,"lon":0.666667},{"id":"BREST","name":"Brest","countryCode":"FR","lat":48.3,"lon":-4.433333},{"id":"CALVI","name":"Calvi","countryCode":"FR","lat":42.566667,"lon":8.783333},{"id":"CANNES_NICE","name":"Cannes-Nice","countryCode":"FR","lat":43.533333,"lon":7.083333},{"id":"CARRO","name":"Carro","countryCode":"FR","lat":43.35,"lon":5.016667},{"id":"CASTELLANE","name":"Castellane","countryCode":"FR","lat":43.9,"lon":6.533333},{"id":"CAZAUBON","name":"Cazaubon","countryCode":"FR","lat":43.933333,"lon":-0.05},{"id":"CAZAUX","name":"Cazaux","countryCode":"FR","lat":44.5,"lon":-1.15},{"id":"CHARMES","name":"Charmes","countryCode":"FR","lat":44.866667,"lon":4.85},{"id":"CHATEAUNEUF_DU_PAPE","name":"Chateauneuf Du Pape","countryCode":"FR","lat":44.033333,"lon":4.816667},{"id":"CHAUMARD","name":"Chaumard","countryCode":"FR","lat":47.15,"lon":3.9},{"id":"DER","name":"Der","countryCode":"FR","lat":48.583333,"lon":4.75},{"id":"DONGE","name":"Donge","countryCode":"FR","lat":47.3,"lon":-2.1},{"id":"DONZERE","name":"Donzere","countryCode":"FR","lat":44.45,"lon":4.7},{"id":"DUC","name":"Duc","countryCode":"FR","lat":47.95,"lon":-2.416667},{"id":"EGUZON","name":"Eguzon","countryCode":"FR","lat":46.4,"lon":1.616667},{"id":"FIGARI","name":"Figari","countryCode":"FR","lat":41.466667,"lon":9.066667},{"id":"FORET_D_ORIENT","name":"Foret D’Orient","countryCode":"FR","lat":48.266667,"lon":4.316667},{"id":"FOS","name":"Fos","countryCode":"FR","lat":43.4,"lon":4.933333},{"id":"GABAS","name":"Gabas","countryCode":"FR","lat":43.283333,"lon":-0.133333},{"id":"GOLFE_DU_MOBIHAN","name":"Golfe Du Mobihan","countryCode":"FR","lat":47.566667,"lon":-2.833333},{"id":"GRAU_DU_ROI","name":"Grau Du Roi","countryCode":"FR","lat":43.533333,"lon":4.116667},{"id":"GUERLEDAN","name":"Guerledan","countryCode":"FR","lat":48.2,"lon":-3.05},{"id":"HOURTIN","name":"Hourtin","countryCode":"FR","lat":45.133333,"lon":-1.116667},{"id":"HYERES","name":"Hyeres","countryCode":"FR","lat":43.066667,"lon":6.116667},{"id":"ILE_ROUSSE","name":"Ile Rousse","countryCode":"FR","lat":42.633333,"lon":8.95},{"id":"L_ESCOUROU","name":"L’Escourou","countryCode":"FR","lat":44.666667,"lon":0.35},{"id":"L_ESTRADE","name":"L’Estrade","countryCode":"FR","lat":43.333333,"lon":1.8},{"id":"LA_CIOTAT","name":"La Ciotat","countryCode":"FR","lat":43.166667,"lon":5.633333},{"id":"LA_HONCE","name":"La Honce","countryCode":"FR","lat":43.5,"lon":-1.383333},{"id":"LA_LIEZ","name":"La Liez","countryCode":"FR","lat":47.866667,"lon":5.4},{"id":"LA_MADINE","name":"La Madine","countryCode":"FR","lat":48.916667,"lon":5.733333},{"id":"LA_PIERRE_PERCEE","name":"La Pierre Percee","countryCode":"FR","lat":48.466667,"lon":6.916667},{"id":"LA_RANCE","name":"La Rance","countryCode":"FR","lat":48.43,"lon":-2.02},{"id":"LA_ROCHE_DE_GLUN","name":"La Roche De Glun","countryCode":"FR","lat":45.0,"lon":4.85},{"id":"LA_SALVETAT","name":"La Salvetat","countryCode":"FR","lat":43.6,"lon":2.616667},{"id":"LAC_LEMAN","name":"Lac Leman","countryCode":"FR","lat":46.416667,"lon":6.5},{"id":"LACANAU","name":"Lacanau","countryCode":"FR","lat":44.966667,"lon":-1.116667},{"id":"LAFFREY","name":"Laffrey","countryCode":"FR","lat":45.016667,"lon":5.783333},{"id":"LAVAUD","name":"Lavaud","countryCode":"FR","lat":45.816667,"lon":0.666667},{"id":"LE_BOURGET","name":"Le Bourget","countryCode":"FR","lat":45.733333,"lon":5.866667},{"id":"LE_BRUSC","name":"Le Brusc","countryCode":"FR","lat":43.1,"lon":5.8},{"id":"LE_LANVANDOU","name":"Le Lanvandou","countryCode":"FR","lat":43.133333,"lon":6.383333},{"id":"LE_STOCK","name":"Le Stock","countryCode":"FR","lat":48.766667,"lon":6.933333},{"id":"LE_VERDON","name":"Le Verdon","countryCode":"FR","lat":47.016667,"lon":-0.816667},{"id":"LEON","name":"Leon","countryCode":"FR","lat":43.9,"lon":-1.316667},{"id":"LES_MUREAUX","name":"Les Mureaux","countryCode":"FR","lat":49.0,"lon":1.933333},{"id":"LIBOURNE","name":"Libourne","countryCode":"FR","lat":44.916667,"lon":-0.316667},{"id":"LISSAC","name":"Lissac","countryCode":"FR","lat":45.1,"lon":1.45},{"id":"LORIENT","name":"Lorient","countryCode":"FR","lat":47.733333,"lon":-3.35},{"id":"MACON","name":"Macon","countryCode":"FR","lat":46.216667,"lon":4.8},{"id":"MARCKOLSHEIM","name":"Marckolsheim","countryCode":"FR","lat":48.183333,"lon":7.633333},{"id":"MAS_THIBERT","name":"Mas Thibert","countryCode":"FR","lat":43.566667,"lon":4.7},{"id":"MATEMALE","name":"Matemale","countryCode":"FR","lat":42.566667,"lon":2.1},{"id":"MELUN","name":"Melun","countryCode":"FR","lat":48.483333,"lon":2.683333},{"id":"MIMIZAN","name":"Mimizan","countryCode":"FR","lat":44.233333,"lon":-1.216667},{"id":"MOISSAC","name":"Moissac","countryCode":"FR","lat":44.083333,"lon":1.0},{"id":"MONTBEL","name":"Montbel","countryCode":"FR","lat":42.966667,"lon":1.95},{"id":"MONTELIMAR","name":"Montelimar","countryCode":"FR","lat":44.6,"lon":4.733333},{"id":"MONTEYNARD","name":"Monteynard","countryCode":"FR","lat":44.9,"lon":5.683333},{"id":"MORCENX","name":"Morcenx","countryCode":"FR","lat":44.033333,"lon":-0.85},{"id":"MORLAIX","name":"Morlaix","countryCode":"FR","lat":48.65,"lon":-3.866667},{"id":"NAUSSAC","name":"Naussac","countryCode":"FR","lat":44.75,"lon":3.8},{"id":"PINARELO_CIPRIANO","name":"Pinarelo-Cipriano","countryCode":"FR","lat":41.666667,"lon":9.383333},{"id":"PALADRU","name":"Paladru","countryCode":"FR","lat":45.45,"lon":5.533333},{"id":"PARELOUP","name":"Pareloup","countryCode":"FR","lat":44.216667,"lon":2.766667},{"id":"PAUILLAC","name":"Pauillac","countryCode":"FR","lat":45.166667,"lon":-0.716667},{"id":"PINCEMAILLE","name":"Pincemaille","countryCode":"FR","lat":47.466667,"lon":0.2},{"id":"PLOBSHEIM","name":"Plobsheim","countryCode":"FR","lat":48.433333,"lon":7.75},{"id":"POINTE_ROUGE","name":"Pointe Rouge","countryCode":"FR","lat":43.266667,"lon":5.333333},{"id":"PORT_DE_MARSEILLE","name":"Port De Marseille","countryCode":"FR","lat":43.333333,"lon":5.333333},{"id":"PORT_VENDRES","name":"Port Vendres","countryCode":"FR","lat":42.55,"lon":3.066667},{"id":"PORTO","name":"Porto","countryCode":"FR","lat":42.283333,"lon":8.666667},{"id":"PORTO_VECCHIO","name":"Porto Vecchio","countryCode":"FR","lat":41.6,"lon":9.3},{"id":"PROPRIANO","name":"Propriano","countryCode":"FR","lat":41.683333,"lon":8.9},{"id":"RHINAU","name":"Rhinau","countryCode":"FR","lat":48.35,"lon":7.75},{"id":"ROUCARIE","name":"Roucarie","countryCode":"FR","lat":44.083333,"lon":2.15},{"id":"SAGONE","name":"Sagone","countryCode":"FR","lat":42.1,"lon":8.7},{"id":"SALAGOU","name":"Salagou","countryCode":"FR","lat":43.65,"lon":3.383333},{"id":"SALSES","name":"Salses","countryCode":"FR","lat":42.816667,"lon":2.983333},{"id":"SANTA_MANZA","name":"Santa Manza","countryCode":"FR","lat":41.416667,"lon":9.233333},{"id":"SERRE_PONCON","name":"Serre Poncon","countryCode":"FR","lat":44.483333,"lon":6.3},{"id":"SOUSTON","name":"Souston","countryCode":"FR","lat":43.783333,"lon":-1.316667},{"id":"SAINT_CASSIEN","name":"Saint Cassien","countryCode":"FR","lat":43.6,"lon":6.816667},{"id":"SAINT_CHRISTOLY","name":"Saint Christoly","countryCode":"FR","lat":45.366667,"lon":-0.816667},{"id":"SAINT_ETIENNE_DE_CANTALES","name":"Saint Etienne De Cantales","countryCode":"FR","lat":44.933333,"lon":2.233333},{"id":"SAINT_ETIENNE_DES_SORTS","name":"Saint Etienne Des Sorts","countryCode":"FR","lat":44.183333,"lon":4.716667},{"id":"SAINT_FLORENT","name":"Saint Florent","countryCode":"FR","lat":42.7,"lon":9.3},{"id":"SAINT_MANDRIER","name":"Saint Mandrier","countryCode":"FR","lat":43.1,"lon":5.933333},{"id":"SAINT_MICHEL","name":"Saint Michel","countryCode":"FR","lat":48.35,"lon":-3.9},{"id":"SAINT_POINT","name":"Saint Point","countryCode":"FR","lat":46.816667,"lon":6.316667},{"id":"SAINT_RAPHAEL","name":"Saint Raphael","countryCode":"FR","lat":43.42,"lon":6.75},{"id":"SAINT_TROPEZ","name":"Saint Tropez","countryCode":"FR","lat":43.283333,"lon":6.616667},{"id":"SAINTE_CROIX","name":"Sainte Croix","countryCode":"FR","lat":43.75,"lon":6.166667},{"id":"THAU","name":"Thau","countryCode":"FR","lat":43.383333,"lon":3.616667},{"id":"URBINO","name":"Urbino","countryCode":"FR","lat":42.05,"lon":9.466667},{"id":"URT","name":"Urt","countryCode":"FR","lat":43.5,"lon":-1.283333},{"id":"VALLABREGUES","name":"Vallabregues","countryCode":"FR","lat":43.866667,"lon":4.633333},{"id":"VALRAS","name":"Valras","countryCode":"FR","lat":43.233333,"lon":3.283333},{"id":"VASSIVIERE","name":"Vassiviere","countryCode":"FR","lat":45.8,"lon":1.883333},{"id":"VICHY","name":"Vichy","countryCode":"FR","lat":46.133333,"lon":3.416667},{"id":"VIELLES_FORGES","name":"Vielles Forges","countryCode":"FR","lat":49.866667,"lon":4.616667},{"id":"VILLEFRANCHE_DE_PANAT","name":"Villefranche De Panat","countryCode":"FR","lat":44.1,"lon":2.7},{"id":"VILLEFRANCHE_SUR_SAONE","name":"Villefranche Sur Saone","countryCode":"FR","lat":46.033333,"lon":4.75},{"id":"VILLENEUVE_DE_LA_RAHO","name":"Villeneuve De La Raho","countryCode":"FR","lat":42.633333,"lon":2.9},{"id":"VINCA","name":"Vinca","countryCode":"FR","lat":42.65,"lon":2.533333},{"id":"VOLGELSHEIM","name":"Volgelsheim","countryCode":"FR","lat":48.066667,"lon":7.566667},{"id":"VOUGLANS","name":"Vouglans","countryCode":"FR","lat":46.433333,"lon":5.7},{"id":"WANTZENAU","name":"Wantzenau","countryCode":"FR","lat":48.633333,"lon":7.833333},{"id":"ZI_PORTUAIRE_FOS","name":"Zi Portuaire Fos","countryCode":"FR","lat":43.416667,"lon":4.85}];


const otherAirports = [
    { oaci: "LFBC", name: "Cazaux", lat: 44.534, lon: -1.155 }, { oaci: "LFBH", name: "La Rochelle-Île de Ré", lat: 46.179, lon: -1.195 }, { oaci: "LFBF", name: "Toulouse-Francazal", lat: 43.546, lon: 1.365 }, { oaci: "LFBG", name: "Cognac-Châteaubernard", lat: 45.660, lon: -0.354 }, { oaci: "LFBI", name: "Poitiers-Biard", lat: 46.587, lon: 0.309 }, { oaci: "LFBK", name: "Saint-Brieuc-Armor", lat: 48.538, lon: -2.852 }, { oaci: "LFBO", name: "Toulouse-Blagnac", lat: 43.635, lon: 1.363 }, { oaci: "LFBS", name: "Chambéry-Savoie", lat: 45.640, lon: 5.881 }, { oaci: "LFBT", name: "Tarbes-Lourdes-Pyrénées", lat: 43.185, lon: -0.003 }, { oaci: "LFBU", name: "Angoulême-Cognac", lat: 45.729, lon: 0.220 }, { oaci: "LFBV", name: "Brive-Souillac", lat: 45.040, lon: 1.484 }, { oaci: "LFCU", name: "Avord", lat: 47.056, lon: 2.637 }, { oaci: "LFLA", name: "Auxerre-Branches", lat: 47.848, lon: 3.497 }, { oaci: "LFLC", name: "Clermont-Ferrand-Auvergne", lat: 45.786, lon: 3.169 }, { oaci: "LFLD", name: "Bourges", lat: 47.059, lon: 2.370 }, { oaci: "LFLL", name: "Lyon-Saint Exupéry", lat: 45.725, lon: 5.081 }, { oaci: "LFLN", name: "Saint-Yan", lat: 46.409, lon: 4.013 }, { oaci: "LFLS", name: "Grenoble-Isère", lat: 45.363, lon: 5.331 }, { oaci: "LFLV", name: "Vichy-Charmeil", lat: 46.167, lon: 3.403 }, { oaci: "LFLW", name: "Aurillac", lat: 44.887, lon: 2.418 }, { oaci: "LFLY", name: "Lyon-Bron", lat: 45.729, lon: 4.945 }, { oaci: "LFLZ", name: "Le Puy-Loudes", lat: 45.079, lon: 3.762 }, { oaci: "LFMC", name: "Le Luc-Le Cannet", lat: 43.385, lon: 6.368 }, { oaci: "LFMI", name: "Istres-Le Tubé", lat: 43.524, lon: 4.944 }, { oaci: "LFMN", name: "Nice-Côte d'Azur", lat: 43.665, lon: 7.215 }, { oaci: "LFMQ", name: "Le Castellet", lat: 43.253, lon: 5.786 }, { oaci: "LFMV", name: "Avignon-Provence", lat: 43.906, lon: 4.902 }, { oaci: "LFMY", name: "Salon-de-Provence", lat: 43.606, lon: 5.110 }, { oaci: "LFOA", name: "Avord", lat: 47.056, lon: 2.637 }, { oaci: "LFOC", name: "Châteaudun", lat: 48.058, lon: 1.378 }, { oaci: "LFOE", name: "Évreux-Fauville", lat: 49.028, lon: 1.218 }, { oaci: "LFOK", name: "Châlons-Vatry", lat: 48.776, lon: 4.185 }, { oaci: "LFOJ", name: "Orléans-Bricy", lat: 47.989, lon: 1.758 }, { oaci: "LFOP", name: "Rouen-Vallée de Seine", lat: 49.385, lon: 1.182 }, { oaci: "LFOQ", name: "Blois-Le Breuil", lat: 47.678, lon: 1.217 }, { oaci: "LFOR", name: "Chartres-Métropole", lat: 48.455, lon: 1.530 }, { oaci: "LFOT", name: "Tours-Val de Loire", lat: 47.432, lon: 0.722 }, { oaci: "LFOU", name: "Cholet-Le Pontreau", lat: 47.081, lon: -0.871 }, { oaci: "LFOV", name: "Laval-Entrammes", lat: 48.033, lon: -0.749 }, { oaci: "LFPB", name: "Paris-Le Bourget", lat: 48.969, lon: 2.441 }, { oaci: "LFPC", name: "Creil", lat: 49.253, lon: 2.520 }, { oaci: "LFPG", name: "Paris-Charles-de-Gaulle", lat: 49.009, lon: 2.547 }, { oaci: "LFPO", name: "Paris-Orly", lat: 48.723, lon: 2.379 }, { oaci: "LFPV", name: "Villacoublay-Vélizy", lat: 48.773, lon: 2.203 }, { oaci: "LFRB", name: "Brest-Bretagne", lat: 48.447, lon: -4.418 }, { oaci: "LFRC", name: "Cherbourg-Manche", lat: 49.650, lon: -1.478 }, { oaci: "LFRD", name: "Dinard-Pleurtuit-Saint-Malo", lat: 48.587, lon: -2.080 }, { oaci: "LFRE", name: "La Baule-Escoublac", lat: 47.289, lon: -2.348 }, { oaci: "LFRF", name: "Granville-Mont-Saint-Michel", lat: 48.887, lon: -1.564 }, { oaci: "LFRG", name: "Deauville-Normandie", lat: 49.365, lon: 0.154 }, { oaci: "LFRH", name: "Lorient-Bretagne-Sud", lat: 47.760, lon: -3.440 }, { oaci: "LFRI", name: "La Roche-sur-Yon-Les Ajoncs", lat: 46.702, lon: -1.381 }, { oaci: "LFRJ", name: "Landivisiau", lat: 48.527, lon: -4.156 }, { oaci: "LFRK", name: "Caen-Carpiquet", lat: 49.173, lon: -0.450 }, { oaci: "LFRL", name: "Lanvéoc-Poulmic", lat: 48.278, lon: -4.437 }, { oaci: "LFRM", name: "Le Mans-Arnage", lat: 47.949, lon: 0.203 }, { oaci: "LFRN", name: "Rennes-Saint-Jacques", lat: 48.070, lon: -1.732 }, { oaci: "LFRO", name: "Lannion-Côte de Granit Rose", lat: 48.755, lon: -3.472 }, { oaci: "LFRQ", name: "Quimper-Pluguffan", lat: 47.975, lon: -4.167 }, { oaci: "LFRS", name: "Nantes-Atlantique", lat: 47.153, lon: -1.607 }, { oaci: "LFRT", name: "Saint-Nazaire-Montoir", lat: 47.312, lon: -2.152 }, { oaci: "LFRU", name: "Morlaix-Ploujean", lat: 48.604, lon: -3.818 }, { oaci: "LFSD", name: "Dijon-Longvic", lat: 47.268, lon: 5.088 }, { oaci: "LFSF", name: "Metz-Nancy-Lorraine", lat: 48.981, lon: 6.251 }, { oaci: "LFSH", name: "Haguenau", lat: 48.790, lon: 7.820 }, { oaci: "LFSK", name: "Colmar-Houssen", lat: 48.110, lon: 7.359 }, { oaci: "LFSO", name: "Nancy-Ochey", lat: 48.577, lon: 5.955 }, { oaci: "LFSQ", name: "Luxeuil-Saint-Sauveur", lat: 47.779, lon: 6.353 }, { oaci: "LFQA", name: "Reims-Prunay", lat: 49.207, lon: 4.148 }, { oaci: "LFST", name: "Strasbourg-Entzheim", lat: 48.542, lon: 7.628 }, { oaci: "LFSX", name: "Montbéliard-Courcelles", lat: 47.487, lon: 6.852 }, { oaci: "LFYR", name: "Romorantin-Pruniers", lat: 47.352, lon: 1.670 }, { oaci: "LFYD", name: "Dinard", lat: 48.587, lon: -2.080 }, { oaci: "LFSR", name: "Reims-Champagne", lat: 49.308, lon: 4.045 }, { oaci: "LFPM", name: "Melun-Villaroche", lat: 48.604, lon: 2.676 }, { oaci: "LFOB", name: "Beauvais-Tillé", lat: 49.454, lon: 2.112 }, { oaci: "LFQN", name: "Saint-Omer-Wizernes", lat: 50.727, lon: 2.233 }, { oaci: "LFKS", name: "Solenzara", lat: 41.924, lon: 9.405 },

    // Terrains ajoutés depuis le PDF "piste revêtue > 1500 m"
    { oaci: "LFBA", name: "Agen-La Garenne", lat: 44.1747, lon: 0.5906 },
    { oaci: "LFBE", name: "Bergerac-Roumanière", lat: 44.8253, lon: 0.5186 },
    { oaci: "LFDN", name: "Rochefort-Saint-Agnant", lat: 45.8878, lon: -0.9831 },
    { oaci: "LFBZ", name: "Biarritz-Pays Basque", lat: 43.4683, lon: -1.5311 },
    { oaci: "LFSL", name: "Brive-Vallée de la Dordogne", lat: 45.0397, lon: 1.4856 },
    { oaci: "LFJL", name: "Metz-Nancy-Lorraine", lat: 48.9821, lon: 6.2513 },
    { oaci: "LFSB", name: "Bâle-Mulhouse", lat: 47.5896, lon: 7.5299 },
    { oaci: "LFGA", name: "Colmar-Houssen", lat: 48.1099, lon: 7.3590 },
    { oaci: "LFSI", name: "Saint-Dizier-Robinson", lat: 48.6360, lon: 4.8994 },
    { oaci: "LFOH", name: "Le Havre-Octeville", lat: 49.5339, lon: 0.0881 },
    { oaci: "LFOI", name: "Abbeville", lat: 50.1435, lon: 1.8319 },
    { oaci: "LFMO", name: "Orange-Caritat", lat: 44.1405, lon: 4.8667 },
    { oaci: "LFLB", name: "Chambéry-Savoie", lat: 45.6381, lon: 5.8802 },
    { oaci: "LFLP", name: "Annecy-Meythet", lat: 45.9292, lon: 6.0999 },
    { oaci: "LFLO", name: "Roanne-Renaison", lat: 46.0583, lon: 4.0014 },
    { oaci: "LFHP", name: "Le Puy-Loudes", lat: 45.0807, lon: 3.7629 },
    { oaci: "LFMT", name: "Montpellier-Méditerranée", lat: 43.5762, lon: 3.9630 },
    { oaci: "LFQQ", name: "Lille-Lesquin", lat: 50.5633, lon: 3.0869 },
    { oaci: "LFRZ", name: "Saint-Nazaire-Montoir", lat: 47.3122, lon: -2.1492 }
];

// =========================================================================
// FONCTIONS UTILITAIRES
// =========================================================================
const toRad = deg => deg * Math.PI / 180, toDeg = rad => rad * 180 / Math.PI;
const simplifyString = str => typeof str !== 'string' ? '' : str.toLowerCase().replace(/\bst\b/g, 'saint').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, ' ').trim().replace(/\s+/g, ' ');
const calculateDistanceInNm = (lat1, lon1, lat2, lon2) => { const R = 6371, dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1), a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2), c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return (R * c) / 1.852; };
const calculateBearing = (lat1, lon1, lat2, lon2) => { const lat1Rad = toRad(lat1), lon1Rad = toRad(lon1), lat2Rad = toRad(lat2), lon2Rad = toRad(lon2), dLon = lon2Rad - lon1Rad, y = Math.sin(dLon) * Math.cos(lat2Rad), x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon); let bearingRad = Math.atan2(y, x), bearingDeg = toDeg(bearingRad); return (bearingDeg + 360) % 360; };
const formatRouteDegrees = (bearing) => {
    const roundedBearing = Math.round(Number(bearing));
    if (!Number.isFinite(roundedBearing)) return '---°';
    const normalizedBearing = ((roundedBearing % 360) + 360) % 360;
    return `${String(normalizedBearing).padStart(3, '0')}°`;
};
function calculateOneWayFlightTimeMinutes(distanceNm) {
    /*
     * v11.58 — temps de vol étiquette carte.
     * Distance prise uniquement : feu ↔ base ou feu ↔ pélicandrome.
     * Formule identique transit : 210 kt jusqu'à 70 Nm, 240 kt au-delà.
     */
    const distance = Number(distanceNm);
    if (!Number.isFinite(distance) || distance <= 0) return null;
    const speedKt = distance <= 70 ? 210 : 240;
    return Math.round(distance * 60 / speedKt);
}

function formatFlightTimeLabel(distanceNm) {
    const minutes = calculateOneWayFlightTimeMinutes(distanceNm);
    return Number.isFinite(minutes) ? `${minutes}'` : "--'";
}

const convertToDMM = (deg, type) => { if (deg === null || isNaN(deg)) return 'N/A'; const absDeg = Math.abs(deg), degrees = Math.floor(absDeg), minutesTotal = (absDeg - degrees) * 60, minutesFormatted = minutesTotal.toFixed(2).padStart(5, '0'); let direction = type === 'lat' ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W'); return `${degrees}° ${minutesFormatted}' ${direction}`; };
const levenshteinDistance = (a, b) => { const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null)); for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i; for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j; for (let j = 1; j <= b.length; j += 1) for (let i = 1; i <= a.length; i += 1) { const indicator = a[i - 1] === b[j - 1] ? 0 : 1; matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator); } return matrix[b.length][a.length]; };
const withTimeout = (promise, timeoutMs, timeoutMessage) => new Promise((resolve, reject) => {
    const timerId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise.then(
        (value) => { clearTimeout(timerId); resolve(value); },
        (error) => { clearTimeout(timerId); reject(error); }
    );
});

const TILE_CACHE_PREFIX = 'test-communes-tile-cache-';


function buildStoredTileKey(tileUrl, packName) {
    const safeUrl = String(tileUrl || '');
    const safePack = String(packName || '').trim();
    return safePack ? `${safeUrl}::${safePack}` : safeUrl;
}

function getTileUrlFromStoredKey(storedUrl) {
    return String(storedUrl || '').split('::')[0];
}

function getPreferredTileCacheName(cacheKeys = []) {
    const tileCacheNames = cacheKeys.filter((name) => name.startsWith(TILE_CACHE_PREFIX)).sort();
    if (tileCacheNames.length) {
        return tileCacheNames[tileCacheNames.length - 1];
    }
    const versionDigits = (typeof APP_VERSION !== 'undefined' ? String(APP_VERSION) : '').replace(/[^0-9]/g, '');
    return `${TILE_CACHE_PREFIX}v${versionDigits || 'fallback'}`;
}

async function persistTilesBatchToCache(batch = []) {
    if (!('caches' in window) || !Array.isArray(batch) || batch.length === 0) return;
    try {
        const cacheKeys = await caches.keys();
        const tileCacheName = getPreferredTileCacheName(cacheKeys);
        const cache = await caches.open(tileCacheName);
        await Promise.all(batch.map(({ url, tile, tileUrl }) => {
            const targetUrl = tileUrl || getTileUrlFromStoredKey(url);
            if (!targetUrl || !tile) return Promise.resolve();
            const contentType = tile.type || (targetUrl.endsWith('.jpg') || targetUrl.endsWith('.jpeg') ? 'image/jpeg' : 'image/png');
            return cache.put(targetUrl, new Response(tile, { headers: { 'Content-Type': contentType } }));
        }));
    } catch (error) {
        console.warn('Impossible de persister les tuiles dans Cache Storage:', error);
    }
}

async function clearTileCaches() {
    if (!('caches' in window)) return;
    const cacheNames = await caches.keys();
    const targets = cacheNames.filter((name) => name.startsWith(TILE_CACHE_PREFIX));
    await Promise.all(targets.map((name) => caches.delete(name)));
}

async function refreshOfflineTilesRendering() {
    notifyServiceWorkerActivePacks(activeOfflinePacks);
    if (map) {
        setupBaseTileLayer();
        scheduleOfflineTileWake('refreshOfflineTilesRendering');
    }
}


function normalizeDepartmentCode(value) {
    if (value === undefined || value === null) return '';
    const raw = String(value).trim().toUpperCase();
    if (!raw) return '';

    if (/^(2A|2B)$/.test(raw)) return raw;
    if (/^2[AB]$/.test(raw)) return raw;
    if (/^\d$/.test(raw)) return `0${raw}`;
    if (/^\d{2,3}$/.test(raw)) return raw;

    return raw;
}

function deriveDepartmentCodeFromInsee(codeInsee) {
    if (codeInsee === undefined || codeInsee === null) return '';
    const code = String(codeInsee).trim().toUpperCase();
    if (!code) return '';

    if (/^2[AB]\d{3}$/.test(code)) return code.slice(0, 2);
    if (/^97[1-6]\d{2}$/.test(code)) return code.slice(0, 3);
    if (/^98\d{3}$/.test(code)) return code.slice(0, 3);
    if (/^\d{5}$/.test(code)) return code.slice(0, 2);

    return '';
}

function getCommuneCodeInsee(commune = {}) {
    const directCandidates = [
        commune.code_insee,
        commune.codeInsee,
        commune.insee,
        commune.insee_code,
        commune.code_commune,
        commune.codeCommune,
        commune.code
    ];

    for (const candidate of directCandidates) {
        const value = candidate === undefined || candidate === null ? '' : String(candidate).trim().toUpperCase();
        if (value) return value;
    }

    return '';
}

function formatCommuneDepartment(commune) {
    if (!commune || typeof commune !== 'object') return '';

    const directCandidates = [
        commune.dep_code,
        commune.dep,
        commune.depCode,
        commune.department_code,
        commune.departmentCode,
        commune.code_departement,
        commune.codeDepartement,
        commune.departement_code,
        commune.departementCode
    ];

    for (const candidate of directCandidates) {
        const value = normalizeDepartmentCode(candidate);
        if (value) return value;
    }

    const fromInsee = deriveDepartmentCodeFromInsee(getCommuneCodeInsee(commune));
    if (fromInsee) return fromInsee;

    const postalCode = commune.code_postal || commune.postal_code || commune.postcode;
    if (postalCode !== undefined && postalCode !== null) {
        const value = String(postalCode).trim();
        if (/^\d{5}$/.test(value)) return value.slice(0, 2);
    }

    return '';
}

function getCommuneFromDatabaseByNameAndDepartment(commune) {
    if (!commune || !Array.isArray(allCommunes) || !allCommunes.length) return null;

    const targetCodeInsee = getCommuneCodeInsee(commune);
    if (targetCodeInsee && communesByCodeInsee instanceof Map) {
        const exactByCode = communesByCodeInsee.get(targetCodeInsee);
        if (exactByCode) return exactByCode;
    }

    const targetName = simplifyString(commune.nom_standard || commune.name || '');
    if (!targetName) return null;

    const targetDep = formatCommuneDepartment(commune);
    const sameName = allCommunes.filter(item => simplifyString(item.nom_standard || item.name || '') === targetName);

    if (!sameName.length) return null;
    if (targetDep) {
        const sameDep = sameName.find(item => formatCommuneDepartment(item) === targetDep);
        if (sameDep) return sameDep;
    }

    return sameName[0];
}

function buildManualFireCommuneFromPoint(lat, lon, fallbackName = 'Feu manuel') {
    /*
     * v12.59 — nommage feu par polygone communal uniquement.
     * On ne persiste plus une commune calculée par simple proximité, car cela
     * peut nommer à tort un feu situé dans Marseille avec une commune limitrophe.
     */
    const containedFromMap = findCommuneContainingPoint(lat, lon);
    const databaseCommune = getCommuneFromDatabaseByNameAndDepartment(containedFromMap) || containedFromMap;

    if (databaseCommune) {
        return {
            nom_standard: databaseCommune.nom_standard || databaseCommune.name || 'Feu manuel',
            dep_code: databaseCommune.dep_code || null,
            dep_nom: databaseCommune.dep_nom || null,
            latitude_mairie: lat,
            longitude_mairie: lon,
            isManual: true,
            communeSource: 'polygon'
        };
    }

    return {
        nom_standard: fallbackName,
        dep_code: null,
        dep_nom: null,
        latitude_mairie: lat,
        longitude_mairie: lon,
        isManual: true,
        communeSource: 'coordinates'
    };
}

async function buildManualFireCommuneFromPointAsync(lat, lon, fallbackName = 'Feu manuel') {
    if (!hasLoadedCommunes) {
        try {
            await ensureCommunesLayerDataLoaded();
        } catch (error) {
            console.warn('Identification commune par polygone indisponible:', error);
        }
    }

    return buildManualFireCommuneFromPoint(lat, lon, fallbackName);
}

function repairManualFireCommuneLabelsFromPolygons() {
    if (!hasLoadedCommunes) return;

    let shouldRefreshCurrent = false;

    try {
        if (currentCommune && currentCommune.isManual) {
            const repairedCurrent = normalizeHistoryCommune(currentCommune);
            if (repairedCurrent) {
                const before = JSON.stringify(currentCommune);
                const after = JSON.stringify(repairedCurrent);
                if (before !== after) {
                    currentCommune = repairedCurrent;
                    localStorage.setItem('currentCommune', JSON.stringify(repairedCurrent));
                    shouldRefreshCurrent = true;
                }
            }
        }
    } catch (_) {}

    try {
        const rawHistory = JSON.parse(localStorage.getItem(FIRE_HISTORY_STORAGE_KEY) || '[]');
        if (Array.isArray(rawHistory)) {
            const repairedHistory = rawHistory
                .map(normalizeHistoryCommune)
                .filter(Boolean)
                .slice(0, FIRE_HISTORY_MAX_ITEMS);
            localStorage.setItem(FIRE_HISTORY_STORAGE_KEY, JSON.stringify(repairedHistory));
        }
    } catch (_) {}

    displayFireHistory();
    drawFireHistoryMarkers();

    if (shouldRefreshCurrent && currentCommune) {
        displayCommuneDetails(currentCommune, false);
    }
}


function normalizeHistoryCommune(commune) {
    if (!commune || typeof commune !== 'object') return null;
    const lat = Number(commune.latitude_mairie);
    const lon = Number(commune.longitude_mairie);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const polygonCommune = findCommuneContainingPoint(lat, lon);
    const polygonDatabaseCommune = polygonCommune ? (getCommuneFromDatabaseByNameAndDepartment(polygonCommune) || polygonCommune) : null;

    let name = String(polygonDatabaseCommune?.nom_standard || polygonDatabaseCommune?.name || commune.nom_standard || commune.name || 'Feu').trim();
    if (!name) return null;

    /*
     * v12.58 — historique feux : priorité au polygone communal.
     * La commune la plus proche n'est plus utilisée pour enrichir un feu,
     * afin d'éviter les erreurs aux limites de Marseille / communes voisines.
     */
    let depCode = polygonDatabaseCommune?.dep_code || commune.dep_code || null;
    let depNom = polygonDatabaseCommune?.dep_nom || commune.dep_nom || null;

    /*
     * Si le nom contient déjà un suffixe "(12)", on récupère ce code
     * et on nettoie le nom pour éviter "Prades-d'Aubrac (12) (12)".
     */
    const depInNameMatch = name.match(/\s*\((\d{1,3}|2A|2B)\)\s*$/i);
    if (depInNameMatch) {
        if (!depCode) depCode = depInNameMatch[1].toUpperCase().padStart(2, '0');
        name = name.replace(/\s*\((\d{1,3}|2A|2B)\)\s*$/i, '').trim();
    }

    return {
        nom_standard: name,
        dep_code: depCode,
        dep_nom: depNom,
        latitude_mairie: lat,
        longitude_mairie: lon,
        isManual: !!commune.isManual,
        savedAt: commune.savedAt || Date.now()
    };
}

function getFireHistory() {
    try {
        const rawHistory = localStorage.getItem(FIRE_HISTORY_STORAGE_KEY);
        const parsed = JSON.parse(rawHistory || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(normalizeHistoryCommune)
            .filter(Boolean)
            .slice(0, FIRE_HISTORY_MAX_ITEMS);
    } catch (_) {
        return [];
    }
}

function getFireHistoryItemKey(item) {
    const normalized = normalizeHistoryCommune(item);
    if (!normalized) return '';
    return [
        simplifyString(normalized.nom_standard || ''),
        normalized.dep_code || '',
        Number(normalized.latitude_mairie).toFixed(5),
        Number(normalized.longitude_mairie).toFixed(5)
    ].join('|');
}

function deleteFireHistoryItemByCommune(item) {
    const targetKey = getFireHistoryItemKey(item);
    if (!targetKey) return;

    const nextHistory = getFireHistory().filter(entry => getFireHistoryItemKey(entry) !== targetKey);
    localStorage.setItem(FIRE_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
    displayFireHistory();
    drawFireHistoryMarkers();
}


function saveFireHistory(commune) {
    const normalized = normalizeHistoryCommune(commune);
    if (!normalized) return;

    const keyFor = (item) => [
        simplifyString(item.nom_standard || ''),
        item.dep_code || '',
        Number(item.latitude_mairie).toFixed(5),
        Number(item.longitude_mairie).toFixed(5)
    ].join('|');

    const currentHistory = getFireHistory();
    const normalizedKey = keyFor(normalized);
    const nextHistory = [
        normalized,
        ...currentHistory.filter(item => keyFor(item) !== normalizedKey)
    ].slice(0, FIRE_HISTORY_MAX_ITEMS);

    try {
        localStorage.setItem(FIRE_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
        drawFireHistoryMarkers();
    } catch (error) {
        console.warn('Impossible de mémoriser le feu:', error);
    }
}

function buildFireDisplayName(item) {
    const normalized = normalizeHistoryCommune(item) || item || {};
    const name = normalized.dep_code
        ? `${normalized.nom_standard || normalized.name || 'Feu'} (${normalized.dep_code})`
        : (normalized.nom_standard || normalized.name || 'Feu');
    return String(name || 'Feu');
}

function buildFireMapIcon(label, markerClassName = 'fire-history-map-marker') {
    /*
     * v12.51 — retour à l'étiquette Leaflet au-dessus du feu.
     * La flamme reste dans une zone tactile 34 px ; le nom du feu est affiché
     * par tooltip permanent, avec la petite flèche Leaflet, mais rapproché de
     * l'icône par tooltipAnchor + offset.
     */
    return L.divIcon({
        className: `${markerClassName} fire-touch-hitbox`,
        html: `<span class="fire-marker-glyph">🔥</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -16],
        tooltipAnchor: [0, -10]
    });
}

function bindFireMapTooltip(marker, label, isActive = false) {
    if (!marker) return marker;

    marker.bindTooltip(escapeHtml(label || 'Feu'), {
        permanent: true,
        direction: 'top',
        offset: [0, -2],
        opacity: 1,
        className: `fire-history-map-tooltip-permanent${isActive ? ' fire-active-map-tooltip' : ''}`
    });

    return marker;
}

function buildFireHistoryIcon(label = 'Feu') {
    return buildFireMapIcon(label, 'fire-history-map-marker');
}

function buildActiveFireIcon(label = 'Feu') {
    return buildFireMapIcon(label, 'active-fire-map-marker');
}

function selectFireFromHistoryMap(item) {
    const normalized = normalizeHistoryCommune(item);
    if (!normalized) return;

    currentCommune = normalized;
    localStorage.setItem('currentCommune', JSON.stringify(normalized));
    displayCommuneDetails(normalized, false);

    if (map && Number.isFinite(Number(normalized.latitude_mairie)) && Number.isFinite(Number(normalized.longitude_mairie))) {
        map.panTo([Number(normalized.latitude_mairie), Number(normalized.longitude_mairie)]);
    }
}

function drawFireHistoryMarkers() {
    if (!map || !fireHistoryLayer) return;

    fireHistoryLayer.clearLayers();

    const history = getFireHistory();
    const currentLat = currentCommune ? Number(currentCommune.latitude_mairie) : null;
    const currentLon = currentCommune ? Number(currentCommune.longitude_mairie) : null;

    history.forEach((item) => {
        const lat = Number(item.latitude_mairie);
        const lon = Number(item.longitude_mairie);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        /*
         * Le feu actuellement sélectionné est déjà dessiné dans routesLayer.
         * On évite donc de superposer deux flammes au même endroit.
         */
        if (
            Number.isFinite(currentLat)
            && Number.isFinite(currentLon)
            && Math.abs(lat - currentLat) < 0.00001
            && Math.abs(lon - currentLon) < 0.00001
        ) {
            return;
        }

        const name = buildFireDisplayName(item);

        const marker = L.marker([lat, lon], {
            icon: buildFireHistoryIcon(name),
            title: name,
            keyboard: false
        });
        bindFireMapTooltip(marker, name, false);

        marker.bindPopup(() => {
            const container = document.createElement('div');
            container.className = 'fire-history-map-popup';
            container.innerHTML = `<b>${escapeHtml(name)}</b><br>${convertToDMM(lat, 'lat')}<br>${convertToDMM(lon, 'lon')}`;

            const actions = document.createElement('div');
            actions.className = 'fire-history-map-popup-actions';

            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.textContent = 'Sélectionner';
            selectButton.className = 'fire-history-map-select-btn';
            selectButton.addEventListener('click', () => {
                selectFireFromHistoryMap(item);
                try { map.closePopup(); } catch (_) {}
            });

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.textContent = 'Supprimer';
            deleteButton.className = 'fire-history-map-delete-btn';
            deleteButton.addEventListener('click', () => {
                if (!confirm('Supprimer ce feu de la carte et de l’historique ?')) return;
                deleteFireHistoryItemByCommune(item);
                try { map.closePopup(); } catch (_) {}
            });

            actions.appendChild(selectButton);
            actions.appendChild(deleteButton);
            container.appendChild(actions);
            return container;
        });
        marker.addTo(fireHistoryLayer);
    });
}

function clearFireHistory() {
    try {
        localStorage.removeItem(FIRE_HISTORY_STORAGE_KEY);
    } catch (_) {}

    displayFireHistory();
    drawFireHistoryMarkers();
}

function isFireHistoryCollapsed() {
    try {
        return localStorage.getItem(FIRE_HISTORY_COLLAPSED_STORAGE_KEY) === 'true';
    } catch (_) {
        return false;
    }
}

function setFireHistoryCollapsed(collapsed) {
    try {
        localStorage.setItem(FIRE_HISTORY_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
    } catch (_) {}
}

function displayFireHistory() {
    // v13.31 — flèche de repli conservée à droite de « Tout effacer » quand l’historique est ouvert.
    const resultsList = document.getElementById('results-list');
    if (!resultsList) return;

    const history = getFireHistory();
    resultsList.innerHTML = '';

    if (!history.length) {
        resultsList.style.display = 'none';
        return;
    }

    const collapsed = isFireHistoryCollapsed();

    const header = document.createElement('li');
    header.className = 'fire-history-header';

    const toggleHistory = () => {
        setFireHistoryCollapsed(!collapsed);
        displayFireHistory();
    };

    const titleButton = document.createElement('button');
    titleButton.type = 'button';
    titleButton.className = 'fire-history-toggle fire-history-title-toggle';
    titleButton.setAttribute('aria-label', collapsed ? 'Afficher l’historique des feux' : 'Masquer l’historique des feux');
    titleButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    /* v13.34 — la flèche reste dans la zone du titre, loin de la colonne des X de suppression. */
    titleButton.innerHTML = `<span>Historique des feux</span><span class="fire-history-arrow">${collapsed ? '▼' : '▲'}</span>`;
    titleButton.addEventListener('click', toggleHistory);
    header.appendChild(titleButton);

    if (!collapsed) {
        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'fire-history-clear-all';
        clearButton.textContent = '🗑️ Tout effacer';
        clearButton.addEventListener('click', (event) => {
            event.stopPropagation();
            window.clearFireHistory();
        });
        header.appendChild(clearButton);
    }

    resultsList.appendChild(header);

    if (collapsed) {
        resultsList.style.display = 'block';
        return;
    }

    history.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'fire-history-item';

        const name = item.dep_code ? `${item.nom_standard || item.name || 'Feu'} (${item.dep_code})` : (item.nom_standard || item.name || 'Feu');

        li.innerHTML = `
            <button type="button" class="fire-history-select" title="Reprendre ce feu">${name}</button>
            <div class="fire-history-export-actions" aria-label="Exports du feu">
                <button type="button" class="fire-history-export-btn fire-history-export-kml" title="Exporter ce feu vers ForeFlight">ForeFlight</button>
                <button type="button" class="fire-history-export-btn fire-history-export-sdvfr" title="Exporter ce feu vers SDVFR Next">SDVFR</button>
            </div>
            <button type="button" class="fire-history-delete" title="Supprimer ce feu">✕</button>
        `;

        li.querySelector('.fire-history-export-kml')?.addEventListener('click', (event) => {
            exportCurrentFireKml(event, item, event.currentTarget);
        });

        li.querySelector('.fire-history-export-sdvfr')?.addEventListener('click', (event) => {
            exportCurrentFireSdvfrCsv(event, item, event.currentTarget);
        });

        li.querySelector('.fire-history-select').addEventListener('click', () => {
            currentCommune = item;
            localStorage.setItem('currentCommune', JSON.stringify(item));
            displayCommuneDetails(item);
            resultsList.style.display = 'none';

            const searchInput = document.getElementById('search-input');
            if (searchInput && searchInput.value) {
                setTimeout(() => {
                    try {
                        const end = searchInput.value.length;
                        searchInput.setSelectionRange(end, end);
                    } catch (_) {}
                }, 0);
            }
        });

        li.querySelector('.fire-history-delete').addEventListener('click', (event) => {
            event.stopPropagation();
            window.deleteFireHistoryItem(index);
        });

        resultsList.appendChild(li);
    });

    resultsList.style.display = 'block';
}

window.toggleFireHistoryCollapsed = function() {
    setFireHistoryCollapsed(!isFireHistoryCollapsed());
    displayFireHistory();
};

window.deleteFireHistoryItem = function(index) {
    const history = getFireHistory();
    if (!Number.isInteger(index) || index < 0 || index >= history.length) return;

    history.splice(index, 1);
    localStorage.setItem(FIRE_HISTORY_STORAGE_KEY, JSON.stringify(history));
    displayFireHistory();
    drawFireHistoryMarkers();
};

window.deleteFireHistoryItemByCommune = deleteFireHistoryItemByCommune;

window.clearFireHistory = function() {
    if (!confirm('Effacer tous les derniers feux mémorisés ?')) return;
    localStorage.removeItem(FIRE_HISTORY_STORAGE_KEY);
    drawFireHistoryMarkers();

    const resultsList = document.getElementById('results-list');
    if (resultsList) {
        resultsList.innerHTML = '';
        resultsList.style.display = 'none';
    }
};

function getRouteTooltipLatLng(startLatLng, endLatLng, ratio = 0.5) {
    const startLat = Number(startLatLng[0]);
    const startLon = Number(startLatLng[1]);
    const endLat = Number(endLatLng[0]);
    const endLon = Number(endLatLng[1]);
    return [
        startLat + ((endLat - startLat) * ratio),
        startLon + ((endLon - startLon) * ratio)
    ];
}

function getRouteTooltipOffset(kind = 'default') {
    if (!window.__routeTooltipOffsetCounter) {
        window.__routeTooltipOffsetCounter = { default: 0, pelic: 0, base: 0, user: 0 };
    }

    const offsetsByKind = {
        pelic: [[12, -24], [12, 22], [-80, -24], [-80, 22], [32, -46], [32, 44]],
        base: [[18, -34], [-95, -34], [18, 34], [-95, 34]],
        user: [[0, -36], [0, 36], [-80, -36], [80, 36]],
        default: [[10, -24], [10, 24], [-70, -24], [-70, 24]]
    };

    const safeKind = offsetsByKind[kind] ? kind : 'default';
    const offsets = offsetsByKind[safeKind];
    const index = window.__routeTooltipOffsetCounter[safeKind] % offsets.length;
    window.__routeTooltipOffsetCounter[safeKind] += 1;
    return offsets[index];
}

function resetRouteTooltipOffsets() {
    window.__routeTooltipOffsetCounter = { default: 0, pelic: 0, base: 0, user: 0 };
}

function getRouteLabelNearAirportOptions(fireLatLng, airportLatLng, kind = 'default') {
    /*
     * v11.71 — règle anti-recouvrement pélicandrome :
     * pour les pélicandromes, l'étiquette est placée sur un côté de l'icône
     * avec direction Leaflet top/bottom/left/right. Elle ne doit donc plus
     * se centrer sur l'icône ni la masquer.
     */
    const fallback = {
        latLng: Array.isArray(airportLatLng) ? airportLatLng : [airportLatLng.lat, airportLatLng.lng],
        offset: [0, 30],
        direction: 'bottom'
    };

    if (!map || !map.latLngToLayerPoint || !Array.isArray(fireLatLng) || !Array.isArray(airportLatLng)) {
        return fallback;
    }

    const firePoint = map.latLngToLayerPoint(L.latLng(fireLatLng[0], fireLatLng[1]));
    const airportPoint = map.latLngToLayerPoint(L.latLng(airportLatLng[0], airportLatLng[1]));

    const dx = firePoint.x - airportPoint.x;
    const dy = firePoint.y - airportPoint.y;

    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) {
        return fallback;
    }

    if (kind === 'pelic') {
        /*
         * Le trait arrive sur l'icône depuis la direction dx/dy.
         * L'étiquette part du côté opposé, avec une marge courte.
         */
        if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx >= 0) {
                return { latLng: airportLatLng, offset: [-16, 0], direction: 'left' };
            }
            return { latLng: airportLatLng, offset: [16, 0], direction: 'right' };
        }

        if (dy >= 0) {
            return { latLng: airportLatLng, offset: [0, -16], direction: 'top' };
        }
        return { latLng: airportLatLng, offset: [0, 16], direction: 'bottom' };
    }

    /*
     * Base/autres routes : on conserve le principe d'étiquette proche de l'icône,
     * à l'opposé du trait, sans l'éloignement fort appliqué aux pélicandromes.
     */
    const length = Math.sqrt((dx * dx) + (dy * dy));
    const distanceFromIcon = kind === 'base' ? 86 : 42;
    let offsetX = Math.round((-dx / length) * distanceFromIcon);
    let offsetY = Math.round((-dy / length) * distanceFromIcon);

    if (Math.abs(offsetX) < 12) offsetX = offsetX < 0 ? -12 : 12;
    if (Math.abs(offsetY) < 12) offsetY = offsetY < 0 ? -12 : 12;

    return {
        latLng: airportLatLng,
        offset: [offsetX, offsetY],
        direction: 'center'
    };
}

const calculateDestinationPoint = (lat, lon, bearing, distanceNm) => {
    const R = 3440.065; // Rayon de la Terre en milles nautiques
    const latRad = toRad(lat);
    const lonRad = toRad(lon);
    const bearingRad = toRad(bearing);
    const distRad = distanceNm / R;

    const destLatRad = Math.asin(Math.sin(latRad) * Math.cos(distRad) + Math.cos(latRad) * Math.sin(distRad) * Math.cos(bearingRad));
    let destLonRad = lonRad + Math.atan2(Math.sin(bearingRad) * Math.sin(distRad) * Math.cos(latRad), Math.cos(distRad) - Math.sin(latRad) * Math.sin(destLatRad));

    return [toDeg(destLatRad), toDeg(destLonRad)];
};

function computeConvexHull(latLngPoints) {
    const uniquePoints = new Map();
    latLngPoints.forEach(([lat, lon]) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
        if (!uniquePoints.has(key)) uniquePoints.set(key, [lat, lon]);
    });

    const points = Array.from(uniquePoints.values());
    if (points.length < 3) return points;

    points.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0])); // tri par longitude puis latitude
    const cross = (o, a, b) => ((a[1] - o[1]) * (b[0] - o[0])) - ((a[0] - o[0]) * (b[1] - o[1]));

    const lower = [];
    for (const p of points) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }

    const upper = [];
    for (let i = points.length - 1; i >= 0; i -= 1) {
        const p = points[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

// =========================================================================
// LOGIQUE PRINCIPALE DE L'APPLICATION
// =========================================================================
async function initializeApp() {
    const statusMessage = document.getElementById('status-message');
    const searchSection = document.getElementById('search-section');
    try {
        loadState();
    } catch (stateError) {
        console.error('État local invalide, réinitialisation.', stateError);
        localStorage.removeItem('disabled_airports');
        localStorage.removeItem('water_airports');
        localStorage.removeItem('selected_base_oaci');
    }
    // v12.67 — le bouton Route BASE a été retiré de l'interface, mais la route base reste active.
    // On ignore donc l'ancien état local éventuel (ex. utilisateur avait désactivé la route avant suppression du bouton).
    showLftwRoute = true;
    localStorage.setItem('showLftwRoute', 'true');
    localStorage.setItem(SHOW_DEPARTMENTS_LAYER_KEY, 'false');
    const savedGaarJSON = localStorage.getItem('gaarCircuits');
    if (savedGaarJSON) {
        try {
            const parsedGaar = JSON.parse(savedGaarJSON);
            gaarCircuits = Array.isArray(parsedGaar) ? parsedGaar : [];
        } catch (gaarError) {
            console.error('Données GAAR invalides, réinitialisation.', gaarError);
            gaarCircuits = [];
            localStorage.removeItem('gaarCircuits');
        }
    }
    if (!FORCE_DISPLAY_MODE) {
        activeOfflinePacks = JSON.parse(localStorage.getItem(OFFLINE_ACTIVE_PACKS_KEY) || '[]');
        if (!Array.isArray(activeOfflinePacks)) activeOfflinePacks = [];
        activeOfflinePackDatabases = JSON.parse(localStorage.getItem(OFFLINE_ACTIVE_PACK_DATABASES_KEY) || '[]');
        if (!Array.isArray(activeOfflinePackDatabases) || !activeOfflinePackDatabases.length) {
            activeOfflinePackDatabases = getOfflineActivePackDatabasesForPacks(activeOfflinePacks);
        }
        const savedMapSourceMode = localStorage.getItem(MAP_SOURCE_MODE_KEY);
        mapSourceMode = savedMapSourceMode === 'offline' ? 'offline' : DEFAULT_MAP_SOURCE_MODE;
        offlineOnlineFallbackMode = localStorage.getItem(OFFLINE_ONLINE_FALLBACK_KEY) === null
            ? DEFAULT_OFFLINE_ONLINE_FALLBACK
            : localStorage.getItem(OFFLINE_ONLINE_FALLBACK_KEY) === 'true';

        try {
            await withTimeout(initDB(), 12000, 'Timeout ouverture IndexedDB');
        } catch (startupError) {
            console.warn('Initialisation IndexedDB lente/indisponible au démarrage:', startupError);
            setTimeout(() => {
                initDB().catch(() => {});
            }, 0);
        }

        await initializeOfflineTilePreference();
        if (mapSourceMode === 'offline') {
            setTimeout(() => { ensureServiceWorkerControlsPageForOffline().catch(() => {}); }, 400);
        }
        // v13.58 — démarrage rapide : pas de scan complet IndexedDB au lancement.
        await updateBaseTileNativeZoomFromAvailability({ forceScan: false });
        displayInstalledMaps();
    } else {
        mapSourceMode = DEFAULT_MAP_SOURCE_MODE;
        offlineOnlineFallbackMode = DEFAULT_OFFLINE_ONLINE_FALLBACK;
        activeOfflinePacks = [];
        activeOfflinePackDatabases = [];
        displayInstalledMaps();
        setTimeout(() => {
            initDB()
                .then(() => displayInstalledMaps())
                .catch(() => {});
        }, 0);
        try {
            const cleanedUrl = new URL(window.location.href);
            cleanedUrl.searchParams.delete('force_display');
            cleanedUrl.searchParams.delete('ts');
            window.history.replaceState({}, '', cleanedUrl.toString());
        } catch (_) {}
    }
    let communesLoadError = null;
    try {
        let data = null;
        if (FORCE_DISPLAY_MODE) {
            const cachedData = localStorage.getItem(COMMUNES_CACHE_KEY);
            if (cachedData) {
                try {
                    const parsed = JSON.parse(cachedData);
                    if (parsed && Array.isArray(parsed.data)) data = parsed;
                } catch (_) {}
            }
        }
        if (!data) data = await loadCommunesData();
        allCommunes = data.data.map(c => {
            const normalizedName = simplifyString(c.nom_standard);
            const searchParts = normalizedName.split(' ').filter(Boolean);
            return {
                ...c,
                normalized_name: normalizedName,
                search_parts: searchParts,
                search_compact: searchParts.join(''),
                soundex_parts: searchParts.map(part => soundex(part))
            };
        });
        communesByCodeInsee = new Map(allCommunes.map((commune) => [String(commune.code_insee || '').trim(), commune]).filter(([code]) => code));
        communeAliases = await loadCommunesAliases();
    } catch (error) {
        communesLoadError = error;
        allCommunes = [];
        console.error('Chargement communes indisponible:', error);
    }

    statusMessage.style.display = 'none';
    searchSection.style.display = 'block';
    initMap();
    initializeTeamChat();
    try {
        setupEventListeners();
    } catch (uiError) {
        console.error('Erreur setupEventListeners:', uiError);
    }
    setTimeout(showPostUpdateRestartNoticeIfNeeded, 900);
    setTimeout(showUpdateReminderIfDue, 1700);
    setTimeout(() => {
        scheduleOfflineTileWake('startup-post-init');
    }, 250);
    setupGpsResumeHandlers();
    setTimeout(() => {
        ensureCommunesLayerDataLoaded()
            .then(() => {
                repairManualFireCommuneLabelsFromPolygons();
                if (typeof refreshNearestCommuneDisplayFromKnownGps === 'function') {
                    refreshNearestCommuneDisplayFromKnownGps();
                }
            })
            .catch((error) => {
                console.warn('Préchargement polygones communes impossible:', error);
                if (typeof refreshNearestCommuneDisplayFromKnownGps === 'function') {
                    refreshNearestCommuneDisplayFromKnownGps();
                }
            });
    }, 500);
    setTimeout(() => {
        ensureDepartmentsLayerDataLoaded()
            .then(() => {
                if (typeof refreshNearestCommuneDisplayFromKnownGps === 'function') {
                    refreshNearestCommuneDisplayFromKnownGps();
                }
                repairManualFireCommuneLabelsFromPolygons();
            })
            .catch((error) => {
                console.warn('Préchargement calque départements impossible:', error);
            });
    }, 650);
    primeGpsFromStoredPosition();
    setTimeout(() => {
        if (typeof refreshNearestCommuneDisplayFromKnownGps === 'function') refreshNearestCommuneDisplayFromKnownGps();
    }, 900);
    setTimeout(() => {
        if (typeof refreshNearestCommuneDisplayFromKnownGps === 'function') refreshNearestCommuneDisplayFromKnownGps();
    }, 2600);
    if (localStorage.getItem('liveGpsActive') === 'true') {
        restartLiveGpsWatch({ silent: true });
    } else {
        requestOneShotGps({ silent: true, highAccuracy: true, timeout: 30000, maximumAge: 600000 });
    }
    const savedCommuneJSON = localStorage.getItem('currentCommune');
    if (savedCommuneJSON) {
        currentCommune = JSON.parse(savedCommuneJSON);
        displayCommuneDetails(currentCommune, true);
        setTimeout(() => fitMapToStartupFireContext({ reason: 'saved-fire-after-display' }), 350);
        setTimeout(() => fitMapToStartupFireContext({ reason: 'saved-fire-after-gps' }), 1400);
    }

    setTimeout(() => {
        if (!startupGpsAutoCenteredWithRealPosition) {
            applyStoredGpsStartupCenter({ force: true });
        }
    }, 750);

    /*
     * v12.13 — restauration plans d'eau au démarrage.
     * Si le bouton Plan d'eau était actif avant fermeture, les points doivent
     * réapparaître sans devoir désélectionner/résélectionner le bouton.
     */
    setTimeout(() => {
        try {
            refreshWaterPointsButtonState();
            drawWaterPointMarkersForCommune(currentCommune);
        } catch (_) {}
    }, 250);

    if (communesLoadError) {
        setTimeout(() => {
            alert("Mode dégradé: base communes indisponible au démarrage. La carte reste utilisable, réessayez avec réseau pour la recherche commune.");
        }, 400);
    }
}

async function loadCommunesData() {
    const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    };

    const parseAndStore = async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.data)) {
            throw new Error("Format JSON invalide.");
        }
        try {
            localStorage.setItem(COMMUNES_CACHE_KEY, JSON.stringify(payload));
        } catch (_) {}
        return payload;
    };

    try {
        const networkResponse = await fetchWithTimeout('./communes.json', { cache: 'no-cache' }, 8000);
        return await parseAndStore(networkResponse);
    } catch (_) {
        try {
            const cachedData = localStorage.getItem(COMMUNES_CACHE_KEY);
            if (cachedData) {
                const parsed = JSON.parse(cachedData);
                if (parsed && Array.isArray(parsed.data)) {
                    return parsed;
                }
            }
        } catch (_) {}

        try {
            const fallbackResponse = await fetchWithTimeout('./communes.json', { cache: 'force-cache' }, 4000);
            return await parseAndStore(fallbackResponse);
        } catch (_) {
            throw new Error("Impossible de charger les données communes (réseau indisponible et cache local absent).");
        }
    }
}

async function loadCommunesAliases() {
    const fetchWithTimeout = async (url, options = {}, timeoutMs = 5000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    };

    const buildAliasEntry = (entry, key = null) => {
        if (!entry) return null;

        if (typeof entry === 'string') {
            return null;
        }

        const displayName = String(entry.nom_affiche || entry.display_name || entry.nom || '').trim();
        const targetCode = String(entry.code_insee || entry.target_code_insee || '').trim();
        if (!displayName || !targetCode) return null;

        const targetCommune = communesByCodeInsee.get(targetCode);
        if (!targetCommune) return null;

        const searchKeys = Array.isArray(entry.cles_recherche) && entry.cles_recherche.length
            ? entry.cles_recherche
            : [key, displayName];

        const normalizedName = simplifyString(displayName);
        const searchParts = normalizedName.split(' ').filter(Boolean);

        return {
            ...targetCommune,
            code_insee: targetCommune.code_insee,
            nom_standard: displayName,
            nom_sans_pronom: displayName,
            nom_sans_accent: normalizedName.replace(/\s+/g, '-'),
            dep_code: entry.dep_code || targetCommune.dep_code,
            dep_nom: entry.dep_nom || targetCommune.dep_nom,
            alias_match: true,
            alias_nom_affiche: displayName,
            alias_commune_actuelle: entry.nom_commune_actuelle || targetCommune.nom_standard,
            alias_target_code_insee: targetCode,
            alias_old_code_insee: entry.ancien_code_insee || null,
            normalized_name: normalizedName,
            search_parts: searchParts,
            search_compact: searchParts.join(''),
            soundex_parts: searchParts.map(part => soundex(part)),
            alias_search_keys: searchKeys
        };
    };

    const parseAliasPayload = (payload) => {
        if (!payload) return [];

        if (Array.isArray(payload.aliases)) {
            return payload.aliases.map((entry) => buildAliasEntry(entry)).filter(Boolean);
        }

        if (payload.aliases && typeof payload.aliases === 'object') {
            return Object.entries(payload.aliases)
                .map(([key, value]) => {
                    if (typeof value === 'string') {
                        const targetCommune = communesByCodeInsee.get(String(value).trim());
                        if (!targetCommune) return null;
                        return buildAliasEntry({
                            nom_affiche: key.replace(/-/g, ' '),
                            code_insee: value,
                            nom_commune_actuelle: targetCommune.nom_standard
                        }, key);
                    }
                    return buildAliasEntry(value, key);
                })
                .filter(Boolean);
        }

        return [];
    };

    const storeAliases = (payload) => {
        const aliases = parseAliasPayload(payload);
        try {
            localStorage.setItem(COMMUNES_ALIASES_CACHE_KEY, JSON.stringify({ aliases }));
        } catch (_) {}
        return aliases;
    };

    try {
        const response = await fetchWithTimeout('./communes_aliases.json', { cache: 'no-cache' }, 5000);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return storeAliases(await response.json());
    } catch (_) {
        try {
            const cachedData = localStorage.getItem(COMMUNES_ALIASES_CACHE_KEY);
            if (cachedData) {
                return parseAliasPayload(JSON.parse(cachedData));
            }
        } catch (_) {}

        try {
            const fallbackResponse = await fetchWithTimeout('./communes_aliases.json', { cache: 'force-cache' }, 3000);
            if (!fallbackResponse.ok) throw new Error(`HTTP ${fallbackResponse.status}`);
            return storeAliases(await fallbackResponse.json());
        } catch (_) {
            console.warn('Alias communes indisponibles: recherche principale conservée.');
            return [];
        }
    }
}

function shouldSearchCandidate(candidate, searchWords, searchCompact, departmentFilter = null) {
    /*
     * v11.94 — fluidité saisie.
     * Sans filtre département, on évite de calculer Levenshtein/Soundex sur
     * 35k communes + alias à chaque recherche. On garde la recherche exhaustive
     * si un département est fourni, car le volume est alors faible.
     */
    if (departmentFilter) return true;
    if (!candidate || !Array.isArray(searchWords) || !searchWords.length) return false;

    const firstWord = searchWords[0] || '';
    if (firstWord.length < 2) return false;

    const normalizedName = candidate.normalized_name || simplifyString(candidate.nom_standard);
    const compactName = candidate.search_compact || normalizedName.replace(/\s+/g, '');

    if (searchCompact.length >= 4 && compactName.includes(searchCompact.slice(0, Math.min(5, searchCompact.length)))) {
        return true;
    }

    const parts = Array.isArray(candidate.search_parts) && candidate.search_parts.length
        ? candidate.search_parts
        : normalizedName.split(' ').filter(Boolean);

    const firstPrefix = firstWord.slice(0, 2);
    if (parts.some(part => part.startsWith(firstPrefix) || firstWord.startsWith(part.slice(0, Math.min(3, part.length))))) {
        return true;
    }

    const firstSoundex = soundex(firstWord);
    const soundexParts = Array.isArray(candidate.soundex_parts) && candidate.soundex_parts.length
        ? candidate.soundex_parts
        : parts.map(part => soundex(part));

    return soundexParts.includes(firstSoundex);
}

function scoreCommuneSearchCandidate(candidate, searchWords) {
    if (!candidate || !Array.isArray(searchWords) || !searchWords.length) return 999;

    const parts = Array.isArray(candidate.search_parts) && candidate.search_parts.length
        ? candidate.search_parts
        : simplifyString(candidate.nom_standard).split(' ').filter(Boolean);

    const soundexParts = Array.isArray(candidate.soundex_parts) && candidate.soundex_parts.length
        ? candidate.soundex_parts
        : parts.map(part => soundex(part));

    /*
     * v11.84 — recherche alias plus tolérante.
     * Cas visé : "La Tourlandry" doit sortir avec "la tour landri 49".
     * Le moteur historique compare mot par mot. Cela échoue quand l'utilisateur
     * sépare un toponyme composé dans un ancien nom écrit en un seul bloc.
     * On ajoute donc une comparaison compacte sans espaces avant le scoring mot par mot.
     */
    const searchCompact = searchWords.join('');
    const candidateCompact = candidate.search_compact || parts.join('');

    if (searchCompact.length >= 4 && candidateCompact.length >= 4) {
        if (candidateCompact.startsWith(searchCompact) || searchCompact.startsWith(candidateCompact)) {
            return 0.1;
        }

        const compactDistance = levenshteinDistance(searchCompact, candidateCompact);
        const compactTolerance = Math.max(1, Math.floor(searchCompact.length / 4));
        if (compactDistance <= compactTolerance) {
            return 0.5 + compactDistance;
        }
    }

    let totalScore = 0;
    let wordsFound = 0;

    for (const word of searchWords) {
        let bestWordScore = 999;
        const wordSoundex = soundex(word);

        for (let i = 0; i < parts.length; i++) {
            const communePart = parts[i];
            const communeSoundex = soundexParts[i];
            let currentScore = 999;

            if (communePart.startsWith(word)) {
                currentScore = 0;
            } else if (communeSoundex === wordSoundex) {
                currentScore = 1;
            } else if (candidate.dep_code === '07' && (word === 'talo' || word === 'talaud') && communePart === 'toulaud') {
                /*
                 * v12.80 — recherche commune Ardèche : l'utilisateur saisit
                 * souvent "Talo 07" ou "Talaud 07" pour Toulaud (07323).
                 * Ce cas doit primer sur les autres communes du département.
                 */
                currentScore = -1;
            } else if (word.length >= 4 && communePart.startsWith(word.slice(0, 3))) {
                /*
                 * v12.78/v12.80 — recherche filtrée par département :
                 * accepter les préfixes courts approximatifs, sans forcer
                 * une commune précise hors du cas Toulaud ci-dessus.
                 */
                currentScore = 3.8 + Math.min(2, Math.abs(communePart.length - word.length) / 10);
            } else {
                const dist = levenshteinDistance(word, communePart);
                if (dist <= Math.floor(word.length / 3) + 1) {
                    currentScore = 2 + dist;
                }
            }

            if (currentScore < bestWordScore) bestWordScore = currentScore;
        }

        if (bestWordScore < 999) {
            wordsFound++;
            totalScore += bestWordScore;
        }
    }

    return wordsFound === searchWords.length ? totalScore : 999;
}

function searchAliasCommunes(searchWords, departmentFilter = null) {
    if (!Array.isArray(communeAliases) || !communeAliases.length) return [];

    const compactQuery = searchWords.join('');
    if (!departmentFilter && compactQuery.length < 6) return [];

    const candidates = departmentFilter
        ? communeAliases.filter(alias => alias.dep_code === departmentFilter)
        : communeAliases.filter(alias => shouldSearchCandidate(alias, searchWords, compactQuery, departmentFilter));

    return candidates
        .map(alias => {
            const score = scoreCommuneSearchCandidate(alias, searchWords);
            return { ...alias, score: score + 0.25 };
        })
        .filter(alias => alias.score < 999)
        .sort((a, b) => a.score - b.score || a.nom_standard.length - b.nom_standard.length)
        .slice(0, 10);
}



function applyMapNoBackgroundStyle() {
    /*
     * v13.58 — le fond transparent laissait apparaître le bleu de l'app pendant
     * les très courts chargements de tuiles au zoom/dézoom. On garde un fond
     * neutre fixe : si une tuile manque brièvement, l'écran ne devient plus bleu.
     */
    const mapLoadingBackground = '#d8e2e8';
    const styleId = 'map-no-background-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            #map,
            .leaflet-container,
            .leaflet-pane,
            .leaflet-map-pane,
            .leaflet-tile-pane {
                background: ${mapLoadingBackground} !important;
                background-color: ${mapLoadingBackground} !important;
            }

            .leaflet-tile {
                background: ${mapLoadingBackground} !important;
            }
        `;
        document.head.appendChild(style);
    }

    const mapElement = document.getElementById('map');
    if (mapElement) {
        mapElement.style.background = mapLoadingBackground;
        mapElement.style.backgroundColor = mapLoadingBackground;
    }

    if (map && map.getContainer) {
        const container = map.getContainer();
        if (container) {
            container.style.background = mapLoadingBackground;
            container.style.backgroundColor = mapLoadingBackground;
        }
    }

    document.querySelectorAll('.leaflet-container, .leaflet-pane, .leaflet-map-pane, .leaflet-tile-pane').forEach((element) => {
        element.style.background = mapLoadingBackground;
        element.style.backgroundColor = mapLoadingBackground;
    });
}



/* v13.77 — échelle nautique dynamique permanente.
 * Indépendante du fond de carte : fonctionne sur carte NPF, OACI et cartes offline.
 * Affichage bas-gauche : nautique uniquement.
 */
let nauticalScaleControl = null;
let nauticalScaleElement = null;

function injectNauticalScaleStyle() {
    const styleId = 'npf-nautical-scale-style';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .npf-nautical-scale {
            position: fixed !important;
            left: calc(env(safe-area-inset-left, 0px) + 12px) !important;
            bottom: calc(env(safe-area-inset-bottom, 0px) + 0px) !important;
            z-index: 1350 !important;
            background: rgba(255, 255, 255, 0.95);
            border: 2px solid rgba(0, 67, 112, 0.86);
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
            padding: 6px 8px 5px 8px;
            color: #003f6b;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 13px;
            font-weight: 800;
            line-height: 1;
            pointer-events: none;
            min-width: 74px;
        }
        .npf-nautical-scale-bar-wrap {
            height: 8px;
            border-left: 2px solid #003f6b;
            border-right: 2px solid #003f6b;
            border-bottom: 3px solid #003f6b;
            margin-bottom: 4px;
        }
        .npf-nautical-scale-label {
            display: flex;
            flex-direction: column;
            gap: 2px;
            text-align: center;
            white-space: nowrap;
        }
        .npf-nautical-scale-label .nm {
            font-size: 13px;
            font-weight: 1000;
            color: #003f6b;
        }
        .npf-nautical-scale-label .km {
            font-size: 11px;
            font-weight: 900;
            color: #41556a;
        }
        .npf-two-finger-ruler-label {
            background: rgba(255, 255, 255, 0.96);
            border: 2px solid rgba(0, 67, 112, 0.90);
            border-radius: 9px;
            box-shadow: 0 2px 8px rgba(0,0,0,.30);
            padding: 5px 8px;
            color: #003f6b;
            font-family: Arial, Helvetica, sans-serif;
            font-weight: 1000;
            line-height: 1.08;
            text-align: center;
            white-space: nowrap;
            pointer-events: none;
        }
        .npf-two-finger-ruler-label .nm { font-size: 15px; }
        .npf-two-finger-ruler-label .km { font-size: 12px; color:#41556a; margin-top:2px; }
        .npf-two-finger-ruler-help {
            position: fixed;
            left: 50%;
            top: calc(env(safe-area-inset-top, 0px) + 14px);
            transform: translateX(-50%);
            z-index: 1850;
            background: rgba(0,67,112,.92);
            color: #fff;
            border-radius: 999px;
            padding: 6px 12px;
            font: 900 13px/1 Arial, Helvetica, sans-serif;
            box-shadow: 0 2px 9px rgba(0,0,0,.28);
            pointer-events: none;
        }
        @media (max-width: 900px) {
            .npf-nautical-scale {
                font-size: 12px;
                padding: 5px 7px 4px 7px;
            }
        }
    `;
    document.head.appendChild(style);
}

function formatNauticalMiles(value) {
    if (!Number.isFinite(value) || value <= 0) return '-- NM';
    if (value < 1) {
        return `${Number(value.toFixed(1)).toString()} NM`;
    }
    if (value < 10) {
        return `${Number(value.toFixed(value % 1 ? 1 : 0)).toString()} NM`;
    }
    return `${Math.round(value)} NM`;
}

function formatKilometers(value) {
    if (!Number.isFinite(value) || value <= 0) return '-- km';
    if (value < 10) return `${Number(value.toFixed(1)).toString()} km`;
    return `${Math.round(value)} km`;
}

function chooseNiceNauticalScale(maxNm) {
    const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    let selected = candidates[0];
    for (const candidate of candidates) {
        if (candidate <= maxNm) selected = candidate;
    }
    return selected;
}

function updateNauticalScale() {
    if (!map || !nauticalScaleElement || !map.getSize || !map.containerPointToLatLng || !map.distance) return;
    const size = map.getSize();
    if (!size || !size.x || !size.y) return;

    const samplePixels = Math.min(160, Math.max(80, Math.floor(size.x * 0.16)));
    const y = Math.max(10, Math.floor(size.y / 2));
    const x1 = Math.max(5, Math.floor((size.x - samplePixels) / 2));
    const x2 = x1 + samplePixels;

    const ll1 = map.containerPointToLatLng(L.point(x1, y));
    const ll2 = map.containerPointToLatLng(L.point(x2, y));
    const meters = map.distance(ll1, ll2);
    const metersPerPixel = meters / samplePixels;
    if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return;

    const maxPixels = 110;
    const maxNm = (metersPerPixel * maxPixels) / 1852;
    const niceNm = chooseNiceNauticalScale(maxNm);
    const pixelWidth = Math.max(26, Math.round((niceNm * 1852) / metersPerPixel));

    nauticalScaleElement.innerHTML = `
        <div class="npf-nautical-scale-bar-wrap" style="width:${pixelWidth}px"></div>
        <div class="npf-nautical-scale-label"><span class="nm">${formatNauticalMiles(niceNm)}</span></div>
    `;
}

function ensureNauticalScaleControl() {
    if (!map || !window.L || nauticalScaleControl) return;
    injectNauticalScaleStyle();

    /* v13.75 — l'échelle est sortie des contrôles Leaflet.
     * Sur iPad, les contrôles bottom-left pouvaient être masqués/décalés par le zoom,
     * la safe-area ou les bandeaux. Un overlay fixe reste visible sur NPF, OACI,
     * online et offline, y compris avec les anciennes cartes.
     */
    nauticalScaleElement = document.getElementById('npf-nautical-scale-fixed');
    if (!nauticalScaleElement) {
        nauticalScaleElement = document.createElement('div');
        nauticalScaleElement.id = 'npf-nautical-scale-fixed';
        nauticalScaleElement.className = 'npf-nautical-scale';
        nauticalScaleElement.innerHTML = '<div class="npf-nautical-scale-label"><span class="nm">-- NM</span></div>';
        document.body.appendChild(nauticalScaleElement);
    }
    nauticalScaleControl = { fixedOverlay: true };

    map.on('zoomend moveend resize viewreset', updateNauticalScale);
    setTimeout(updateNauticalScale, 0);
    setTimeout(updateNauticalScale, 350);
    setTimeout(updateNauticalScale, 1200);
}


/* v13.77 — règle mobile 2 doigts, graduée en NM/km.
 * Appui prolongé à 2 doigts : affichage de la règle tant que les doigts restent posés.
 * Fonctionne avec carte NPF, OACI, online et offline car elle utilise la géométrie Leaflet.
 */
let twoFingerRulerLayer = null;
let twoFingerRulerTimer = null;
let twoFingerRulerActive = false;
let twoFingerRulerWasDraggingEnabled = null;
let twoFingerRulerWasTouchZoomEnabled = null;
let twoFingerRulerPreviousTouchAction = null;
let twoFingerRulerStartPoints = null;
let twoFingerRulerHelpEl = null;

function getTouchContainerPoints(event) {
    if (!map || !map.getContainer || !event || !event.touches || event.touches.length < 2) return null;
    const rect = map.getContainer().getBoundingClientRect();
    const t1 = event.touches[0];
    const t2 = event.touches[1];
    return [
        L.point(t1.clientX - rect.left, t1.clientY - rect.top),
        L.point(t2.clientX - rect.left, t2.clientY - rect.top)
    ];
}

function clearTwoFingerRulerLayer() {
    if (twoFingerRulerLayer) {
        twoFingerRulerLayer.clearLayers();
    }
}

function ensureTwoFingerRulerLayer() {
    if (!map || !window.L) return null;
    if (!twoFingerRulerLayer) twoFingerRulerLayer = L.layerGroup().addTo(map);
    return twoFingerRulerLayer;
}

function showTwoFingerRulerHelp() {
    if (twoFingerRulerHelpEl) return;
    twoFingerRulerHelpEl = document.createElement('div');
    twoFingerRulerHelpEl.className = 'npf-two-finger-ruler-help';
    twoFingerRulerHelpEl.textContent = 'Règle mobile — zoom suspendu';
    document.body.appendChild(twoFingerRulerHelpEl);
}

function hideTwoFingerRulerHelp() {
    if (twoFingerRulerHelpEl && twoFingerRulerHelpEl.parentNode) {
        twoFingerRulerHelpEl.parentNode.removeChild(twoFingerRulerHelpEl);
    }
    twoFingerRulerHelpEl = null;
}

function drawTwoFingerRulerFromTouches(event) {
    const points = getTouchContainerPoints(event);
    const layer = ensureTwoFingerRulerLayer();
    if (!points || !layer || !map || !map.containerPointToLatLng || !map.distance) return;

    const [p1, p2] = points;
    const ll1 = map.containerPointToLatLng(p1);
    const ll2 = map.containerPointToLatLng(p2);
    const meters = map.distance(ll1, ll2);
    if (!Number.isFinite(meters) || meters <= 0) return;

    clearTwoFingerRulerLayer();

    const nm = meters / 1852;
    const km = meters / 1000;

    /* v13.77 — la règle est dessinée au-dessus des doigts, sinon elle est masquée en vol.
     * La mesure reste basée sur les deux points réellement touchés.
     */
    let offsetY = -72;
    const minTouchY = Math.min(p1.y, p2.y);
    if (minTouchY + offsetY < 18) offsetY = 18 - minTouchY;
    const visualOffset = L.point(0, offsetY);
    const vp1 = p1.add(visualOffset);
    const vp2 = p2.add(visualOffset);
    const vll1 = map.containerPointToLatLng(vp1);
    const vll2 = map.containerPointToLatLng(vp2);

    L.polyline([vll1, vll2], {
        color: '#111827',
        weight: 8,
        opacity: 0.80,
        interactive: false,
        lineCap: 'round'
    }).addTo(layer);
    L.polyline([vll1, vll2], {
        color: '#ffffff',
        weight: 5,
        opacity: 0.95,
        interactive: false,
        lineCap: 'round'
    }).addTo(layer);
    L.polyline([vll1, vll2], {
        color: '#003f6b',
        weight: 3,
        opacity: 1,
        interactive: false,
        lineCap: 'round'
    }).addTo(layer);

    const dx = vp2.x - vp1.x;
    const dy = vp2.y - vp1.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const tickLength = 16;
    const fractions = [0, 0.25, 0.5, 0.75, 1];
    fractions.forEach((fraction) => {
        const px = vp1.x + dx * fraction;
        const py = vp1.y + dy * fraction;
        const a = L.point(px - nx * tickLength / 2, py - ny * tickLength / 2);
        const b = L.point(px + nx * tickLength / 2, py + ny * tickLength / 2);
        L.polyline([map.containerPointToLatLng(a), map.containerPointToLatLng(b)], {
            color: '#003f6b',
            weight: fraction === 0 || fraction === 1 || fraction === 0.5 ? 4 : 3,
            opacity: 1,
            interactive: false,
            lineCap: 'round'
        }).addTo(layer);
    });

    let labelPoint = L.point((vp1.x + vp2.x) / 2, (vp1.y + vp2.y) / 2 - 42);
    if (labelPoint.y < 20) labelPoint = L.point(labelPoint.x, 20);
    const labelLatLng = map.containerPointToLatLng(labelPoint);

    L.marker(labelLatLng, {
        interactive: false,
        icon: L.divIcon({
            className: 'npf-two-finger-ruler-label',
            html: `<div class="nm">${formatNauticalMiles(nm)}</div><div class="km">${formatKilometers(km)}</div>`,
            iconSize: [112, 44],
            iconAnchor: [56, 22]
        })
    }).addTo(layer);
}

function cancelTwoFingerRulerTimer() {
    if (twoFingerRulerTimer) {
        clearTimeout(twoFingerRulerTimer);
        twoFingerRulerTimer = null;
    }
}

function startTwoFingerRuler(event) {
    cancelTwoFingerRulerTimer();
    twoFingerRulerActive = true;
    showTwoFingerRulerHelp();
    try {
        twoFingerRulerWasDraggingEnabled = map?.dragging?.enabled ? map.dragging.enabled() : null;
        twoFingerRulerWasTouchZoomEnabled = map?.touchZoom?.enabled ? map.touchZoom.enabled() : null;
        const container = map?.getContainer ? map.getContainer() : null;
        if (container) {
            twoFingerRulerPreviousTouchAction = container.style.touchAction || '';
            container.style.touchAction = 'none';
        }
        if (map?.dragging?.disable) map.dragging.disable();
        if (map?.touchZoom?.disable) map.touchZoom.disable();
    } catch (_) {}
    if (event) {
        if (event.cancelable) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }
    drawTwoFingerRulerFromTouches(event);
}

function endTwoFingerRuler() {
    cancelTwoFingerRulerTimer();
    twoFingerRulerStartPoints = null;
    if (twoFingerRulerActive) {
        twoFingerRulerActive = false;
        clearTwoFingerRulerLayer();
        hideTwoFingerRulerHelp();
        try {
            if (twoFingerRulerWasDraggingEnabled && map?.dragging?.enable) map.dragging.enable();
            if (twoFingerRulerWasTouchZoomEnabled && map?.touchZoom?.enable) map.touchZoom.enable();
            const container = map?.getContainer ? map.getContainer() : null;
            if (container) container.style.touchAction = twoFingerRulerPreviousTouchAction || '';
        } catch (_) {}
    }
    twoFingerRulerWasDraggingEnabled = null;
    twoFingerRulerWasTouchZoomEnabled = null;
    twoFingerRulerPreviousTouchAction = null;
}

function handleTwoFingerRulerTouchStart(event) {
    if (!event || !event.touches || event.touches.length !== 2 || !map) {
        endTwoFingerRuler();
        return;
    }
    injectNauticalScaleStyle();
    twoFingerRulerStartPoints = getTouchContainerPoints(event);
    cancelTwoFingerRulerTimer();
    twoFingerRulerTimer = setTimeout(() => {
        if (event.touches && event.touches.length === 2) startTwoFingerRuler(event);
    }, 420);
}

function handleTwoFingerRulerTouchMove(event) {
    if (twoFingerRulerActive) {
        if (event.cancelable) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        drawTwoFingerRulerFromTouches(event);
        return;
    }
    if (!twoFingerRulerTimer || !twoFingerRulerStartPoints || !event.touches || event.touches.length !== 2) return;
    const currentPoints = getTouchContainerPoints(event);
    if (!currentPoints) return;
    const moved = Math.max(
        Math.hypot(currentPoints[0].x - twoFingerRulerStartPoints[0].x, currentPoints[0].y - twoFingerRulerStartPoints[0].y),
        Math.hypot(currentPoints[1].x - twoFingerRulerStartPoints[1].x, currentPoints[1].y - twoFingerRulerStartPoints[1].y)
    );
    if (moved > 18) cancelTwoFingerRulerTimer();
}

function handleTwoFingerRulerTouchEnd() {
    endTwoFingerRuler();
}

function ensureTwoFingerRulerControl() {
    if (!map || !map.getContainer || map.__npfTwoFingerRulerReady) return;
    const container = map.getContainer();
    container.addEventListener('touchstart', handleTwoFingerRulerTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTwoFingerRulerTouchMove, { passive: false });
    container.addEventListener('touchend', handleTwoFingerRulerTouchEnd, { passive: false });
    container.addEventListener('touchcancel', handleTwoFingerRulerTouchEnd, { passive: false });
    map.__npfTwoFingerRulerReady = true;
}

function initMap() {
    if (map) return;
    map = L.map('map', {
        attributionControl: false,
        zoomControl: false,
        maxZoom: GLOBAL_MAX_ZOOM,
        // v13.58 — iPad : moins d'animations Leaflet pour éviter les anciennes tuiles étirées/bleues après zoom.
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false
    }).setView([46.6, 2.2], 5.5);

    map.on('zoomend', enforceOfflineZoomLimit);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    ensureNauticalScaleControl();
    ensureTwoFingerRulerControl();
    applyMapNoBackgroundStyle();

    if (map.createPane && !map.getPane('highVoltageLinesPane')) {
        map.createPane('highVoltageLinesPane');
        const htPane = map.getPane('highVoltageLinesPane');
        if (htPane) htPane.style.zIndex = '385';
    }
    if (map.createPane && !map.getPane('trafficPane')) {
        map.createPane('trafficPane');
        const trafficPane = map.getPane('trafficPane');
        if (trafficPane) trafficPane.style.zIndex = '690';
    }
    highVoltageLinesRenderer = L.canvas ? L.canvas({ padding: 0.35 }) : null;

    setupBaseTileLayer();
    permanentAirportLayer = L.layerGroup().addTo(map);
    routesLayer = L.layerGroup().addTo(map);
    fireHistoryLayer = L.layerGroup().addTo(map);
    waterPointsLayer = L.layerGroup().addTo(map);
    userToTargetLayer = L.layerGroup().addTo(map);
    lftwRouteLayer = L.layerGroup().addTo(map);
    gaarLayer = L.layerGroup().addTo(map);
    departmentsLayerGroup = L.layerGroup();
    departmentsLabelsLayer = L.layerGroup();
    highVoltageLinesLayer = L.layerGroup();
    trafficLayer = L.layerGroup();
    communesLayerGroup = L.layerGroup();
    communesLabelsLayer = L.layerGroup();
    drawPermanentAirportMarkers();
    drawFireHistoryMarkers();
    redrawGaarCircuits();

    scheduleStartupAuxiliaryLayers();

    map.on('click', handleGaarMapClick);

    map.on('contextmenu', async (e) => {
        if (isDrawingMode) return;
        if (!e || !e.latlng) return;
        L.DomEvent.preventDefault(e.originalEvent);

        if (isSimulationMode) {
            simulationSuppressNextClickUntil = Date.now() + 900;
            openSimulationActionPopup(e.latlng);
            return;
        }

        selectedPelicanOACI = null;
        const manualCommune = await buildManualFireCommuneFromPointAsync(e.latlng.lat, e.latlng.lng, 'Feu manuel');
        currentCommune = manualCommune;
        localStorage.setItem('currentCommune', JSON.stringify(manualCommune));
        displayCommuneDetails(manualCommune, false);
    });
}

function enforceOfflineZoomLimit() {
    if (!map || !offlineTilesMode) return;

    const activeOfflineMaxZoomLimit = getOfflinePackMaxNativeZoomLimitForPacks(activeOfflinePacks);
    const safeMaxZoom = Math.max(
        GLOBAL_MIN_ZOOM,
        Math.min(
            GLOBAL_MAX_ZOOM,
            activeOfflineMaxZoomLimit,
            Number.isFinite(baseTileMaxNativeZoom) ? baseTileMaxNativeZoom : activeOfflineMaxZoomLimit
        )
    );

    map.options.maxZoom = safeMaxZoom;

    if (map.getMaxZoom && map.getMaxZoom() !== safeMaxZoom) {
        map.setMaxZoom(safeMaxZoom);
    }

    if (map.getZoom() > safeMaxZoom) {
        map.setView(map.getCenter(), safeMaxZoom, { animate: false });
    }
}


function normalizeOfflineTileHostPrefix(packName) {
    /*
     * v12.15 — host logique stable par groupe.
     *
     * Un pack découpé en plusieurs ZIP doit utiliser le même host fictif :
     * IGN_01 / IGN_02 / IGN_03 => ign.tile.openstreetmap.org
     *
     * Sinon Leaflet ne demande les tuiles que sur le host du premier pack actif,
     * et IndexedDB doit chercher dans des clés incohérentes.
     */
    const raw = String(packName || '').trim();
    const groupName = typeof getOfflinePackGroupName === 'function'
        ? getOfflinePackGroupName(raw)
        : raw;

    const simplified = String(groupName || raw || '')
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, '');

    if (!simplified || /open\s*street|openstreet|\bosm\b/.test(simplified)) {
        return 'a';
    }

    if (/\bign\b|scan25|scan\s*25|oaci\s*ign/.test(simplified)) {
        return 'ign';
    }

    if (/oaci|carte\s*oaci/.test(simplified)) {
        return 'oaci';
    }

    const compact = simplified.replace(/[^a-z0-9]+/g, '').slice(0, 20);
    return compact || 'pack';
}


function isOpenStreetOfflinePackName(packName) {
    const simplified = String(packName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');
    return /open\s*street|openstreet|\bosm\b/.test(simplified);
}

function isIgnOfflinePackName(packName) {
    const simplified = String(packName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');
    return /\bign\b|scan25|scan\s*25|oaci\s*ign/.test(simplified);
}

function isOaciOfflinePackName(packName) {
    const simplified = String(packName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');
    return /\boaci\b|carte\s*oaci/.test(simplified);
}

function getOfflinePackMaxNativeZoomLimitForPacks(packs = activeOfflinePacks) {
    /*
     * v13.58 — plafond plus strict pour les packs OACI/IGN.
     * Dans certains imports, la carte OACI peut être groupée ou nommée comme IGN ;
     * on limite donc aussi les packs reconnus IGN/Scan pour éviter que Leaflet
     * demande des z11/z12/z13 absents et laisse un écran vide.
     */
    const packList = Array.isArray(packs) ? packs.filter(Boolean) : [];
    const hasOaciOrIgnPack = packList.some(name => {
        const simplified = String(name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return isOaciOfflinePackName(name)
            || isIgnOfflinePackName(name)
            || /oaci|sia|scan\s*oaci|carte\s*oaci|\bign\b|scan\s*25|scan25/.test(simplified);
    });
    if (hasOaciOrIgnPack) {
        return Math.min(OFFLINE_HARD_MAX_NATIVE_ZOOM, OACI_OFFLINE_MAX_NATIVE_ZOOM);
    }
    return OFFLINE_HARD_MAX_NATIVE_ZOOM;
}

function buildOfflineTileUrlForPack(tilePath, packName, isLargeZip = false) {
    /*
     * v12.14 — correction IGN multi-ZIP.
     *
     * Avant, tous les gros ZIP forçaient le host "a.tile.openstreetmap.org".
     * Résultat : OpenStreet et IGN pouvaient partager le même tileUrl z/x/y,
     * ce qui ralentissait fortement la recherche et pouvait provoquer des collisions.
     *
     * Maintenant :
     * - OpenStreet/OSM reste sur "a" ;
     * - IGN obtient son propre host fictif "ign" ;
     * - les autres packs gardent un host dérivé de leur nom.
     *
     * Le service worker intercepte *.tile.openstreetmap.org, donc ce host fictif
     * sert seulement de clé logique locale.
     */
    const hostPrefix = normalizeOfflineTileHostPrefix(packName);
    return `https://${hostPrefix}.tile.openstreetmap.org/${tilePath}`;
}


function scheduleOfflineTileWake(reason = 'startup') {
    const token = ++offlineTileWakeToken;

    OFFLINE_TILE_WAKE_DELAYS_MS.forEach((delay, index) => {
        setTimeout(() => {
            if (token !== offlineTileWakeToken) return;
            try {
                if (!map || !baseTileLayer) return;

                if (typeof map.invalidateSize === 'function') {
                    map.invalidateSize({ animate: false, pan: false });
                }

                if (typeof baseTileLayer.redraw === 'function' && index <= 2) {
                    baseTileLayer.redraw();
                }

                if (index === OFFLINE_TILE_WAKE_DELAYS_MS.length - 1 && typeof enforceOfflineZoomLimit === 'function') {
                    enforceOfflineZoomLimit();
                }
            } catch (error) {
                console.warn('Réveil carte offline impossible:', reason, error);
            }
        }, delay);
    });
}

function scheduleStartupAuxiliaryLayers() {
    /*
     * v13.58 — iPad : on ne charge plus les couches annexes en même temps que les
     * premières tuiles offline. Safari/IndexedDB devient très lent si la carte,
     * les lignes HT, les communes et les départements démarrent simultanément.
     */
    const baseDelay = offlineTilesMode ? OFFLINE_AUX_LAYER_START_DELAY_MS : 900;

    if (areDepartmentsVisible) {
        setTimeout(() => { toggleDepartmentsLayer(true); }, baseDelay + 600);
    }

    areCommunesVisible = localStorage.getItem(SHOW_COMMUNES_LAYER_KEY) === 'true';
    if (areCommunesVisible) {
        setTimeout(() => { toggleCommunesLayer(true); }, baseDelay + 1400);
    }

    if (showHighVoltageLinesLayer) {
        setTimeout(() => {
            toggleHighVoltageLinesLayer(true, { silent: true, retry: true, source: 'startup' });
        }, baseDelay + 2200);
    }

    if (showTrafficLayer) {
        setTimeout(() => { toggleTrafficLayer(true); }, baseDelay + 3200);
    }
}

function setOfflineMapSwitchBusy(message = 'Changement de carte offline...') {
    try {
        const statusMessage = document.getElementById('import-status-message');
        if (statusMessage) statusMessage.textContent = message;
    } catch (_) {}
}

function closeOfflineMapModalSoon(delay = 120) {
    setTimeout(() => {
        try {
            const modal = document.getElementById('offline-map-modal');
            if (modal) modal.style.display = 'none';
        } catch (_) {}
    }, delay);
}

function rebuildBaseTileLayerAfterOfflineSwitch(reason = 'offline-switch') {
    try {
        if (map) {
            setupBaseTileLayer();
            scheduleOfflineTileWake(reason);
        }
    } catch (error) {
        console.warn('Reconstruction carte offline impossible:', reason, error);
    }
}

function setupBaseTileLayer() {
    if (!map) return;
    if (baseTileLayer) {
        map.removeLayer(baseTileLayer);
    }

    /*
     * Mode offline ultra stable :
     * - pas de sur-zoom ;
     * - pas de fallback parent ;
     * - plafond dur z12 pour éviter que Leaflet demande des tuiles absentes ;
     * - animations désactivées pour éviter le flash blanc pendant le rafraîchissement.
     */
    const activeOfflineMaxZoomLimit = getOfflinePackMaxNativeZoomLimitForPacks(activeOfflinePacks);
    const offlineNativeMaxZoom = Math.max(
        GLOBAL_MIN_ZOOM,
        Math.min(
            GLOBAL_MAX_ZOOM,
            activeOfflineMaxZoomLimit,
            Number.isFinite(baseTileMaxNativeZoom) ? baseTileMaxNativeZoom : activeOfflineMaxZoomLimit
        )
    );

    const effectiveMinZoom = offlineTilesMode
        ? Math.max(GLOBAL_MIN_ZOOM, Math.min(baseTileMinNativeZoom, offlineNativeMaxZoom))
        : GLOBAL_MIN_ZOOM;

    const effectiveMaxZoom = offlineTilesMode
        ? offlineNativeMaxZoom
        : Math.min(GLOBAL_MAX_ZOOM, baseTileMaxNativeZoom + 2);

    map.options.minZoom = effectiveMinZoom;
    map.options.maxZoom = effectiveMaxZoom;
    map.setMinZoom(effectiveMinZoom);
    map.setMaxZoom(effectiveMaxZoom);

    if (map.getZoom() > effectiveMaxZoom) {
        map.setView(map.getCenter(), effectiveMaxZoom, { animate: false });
    }

    const activeTilePackName = Array.isArray(activeOfflinePacks) && activeOfflinePacks.length ? activeOfflinePacks[0] : '';
    const tileHostPrefix = offlineTilesMode ? normalizeOfflineTileHostPrefix(activeTilePackName) : 'a';
    const tileLayerUrl = `https://${tileHostPrefix}.tile.openstreetmap.org/{z}/{x}/{y}.png`;

    baseTileLayer = L.tileLayer(tileLayerUrl, {
        minNativeZoom: effectiveMinZoom,
        maxNativeZoom: effectiveMaxZoom,
        minZoom: effectiveMinZoom,
        maxZoom: effectiveMaxZoom,
        attribution: '© OpenStreetMap',
        keepBuffer: OFFLINE_TILE_KEEP_BUFFER,
        updateWhenZooming: false,
        updateWhenIdle: true,
        updateInterval: OFFLINE_TILE_UPDATE_INTERVAL_MS,
        noWrap: true,
        errorTileUrl: OFFLINE_TILE_PLACEHOLDER_DATA_URL
    }).addTo(map);

    enforceOfflineZoomLimit();


    applyMapNoBackgroundStyle();
    scheduleOfflineTileWake('setupBaseTileLayer');
}

function clearCurrentSelection(options = {}) {
    const preserveMapView = !!options.preserveMapView;
    selectedPelicanOACI = null;
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search');
    searchInput.value = '';
    document.getElementById('results-list').style.display = 'none';
    clearSearchBtn.style.display = 'none';
    routesLayer.clearLayers();
    if (waterPointsLayer) drawWaterPointMarkersForCommune(null);
    userToTargetLayer.clearLayers();
    lftwRouteLayer.clearLayers();
    drawPermanentAirportMarkers();
    currentCommune = null;
    drawFireHistoryMarkers();
    localStorage.removeItem('currentCommune');
    updateBaseLabels();
    updateCalculatorData();
    masterRecalculate();
    updateCommuneDisplay(null);
    document.getElementById('bingo-map-display').style.display = 'none';
    if (!preserveMapView) {
        centerMapOnGpsOverviewAfterClear();
    }
}


let searchInputClearRefocusTimer = null;

function keepKeyboardAfterSearchClear() {
    /*
     * v11.99 — iPad : lorsque l'utilisateur efface la commune saisie
     * avec le X de la barre de recherche, Safari peut retirer le focus.
     * On réapplique le focus tant que la recherche est ouverte.
     */
    const searchInput = document.getElementById('search-input');
    const searchContainer = document.getElementById('search-container');
    if (!searchInput) return;
    if (searchInput.value !== '') return;
    if (searchContainer && searchContainer.style.display === 'none') return;

    clearTimeout(searchInputClearRefocusTimer);
    searchInputClearRefocusTimer = setTimeout(() => {
        try {
            searchInput.focus({ preventScroll: true });
            searchInput.setSelectionRange(0, 0);
        } catch (_) {
            searchInput.focus();
        }
    }, 80);
}

function setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search');
    const airportCountInput = document.getElementById('airport-count');
    const gpsFeuButton = document.getElementById('gps-feu-button');
    const centerGpsButton = document.getElementById('center-gps-button');
    const liveGpsButton = document.getElementById('live-gps-button');
    const lftwRouteButton = document.getElementById('lftw-route-button');
    const gaarModeButton = document.getElementById('gaar-mode-button');
    const editCircuitsButton = document.getElementById('edit-circuits-button');
    const deleteCircuitsButton = document.getElementById('delete-circuits-btn');
    const toggleSearchButton = document.getElementById('toggle-search-button');
    const mainActionButtons = document.getElementById('main-action-buttons');
    const calculatorButton = document.getElementById('calculator-button');
    const blocFuelShortcutButton = document.getElementById('bloc-fuel-shortcut-button');
    const calculatorModal = document.getElementById('calculator-modal');
    const closeCalculatorButton = document.getElementById('close-calculator-btn');
    const departmentsLayerButton = document.getElementById('departments-layer-button');
    const communesLayerButton = document.getElementById('communes-layer-button');
    const waterPointsButton = document.getElementById('water-points-button');
    const highVoltageLinesButton = document.getElementById('high-voltage-lines-button');
    const opsFrequenciesButton = document.getElementById('ops-frequencies-pdf-button');
    const trafficLayerButton = document.getElementById('traffic-layer-button');
    const offlineMapsButton = document.getElementById('offline-maps-button');
    const offlineMapModal = document.getElementById('offline-map-modal');
    const closeOfflineMapButton = document.getElementById('close-offline-map-btn');
    const zipImporterInput = document.getElementById('zip-importer-input');
    const folderImporterInput = document.getElementById('folder-importer-input');
    const tilesImporterInput = document.getElementById('tiles-importer-input');
    const airportPdfImporterInput = document.getElementById('airport-pdf-importer-input');
    const mapSourceOnlineBtn = document.getElementById('map-source-online-btn');
    const mapSourceOfflineBtn = document.getElementById('map-source-offline-btn');
    const purgeInactivePacksBtn = document.getElementById('purge-inactive-packs-btn');
    const refreshOfflineTilesBtn = document.getElementById('refresh-offline-tiles-btn');
    const simulationModeButton = document.getElementById('simulation-mode-button');
    
    if (mainActionButtons) {
        const versionDisplay = document.getElementById('app-version-display');
        if (versionDisplay) {
            versionDisplay.innerText = (typeof APP_VERSION !== 'undefined' && APP_VERSION) ? APP_VERSION : 'version inconnue';
        }

        const forceUpdateButton = document.getElementById('force-update-button');
        if (forceUpdateButton && forceUpdateButton.dataset.bound !== '1') {
            forceUpdateButton.dataset.bound = '1';
            forceUpdateButton.addEventListener('click', async () => {
                forceUpdateButton.disabled = true;
                forceUpdateButton.textContent = '⏳ MAJ...';
                try {
                    if (typeof window.forceRecoveryReload === 'function') {
                        await window.forceRecoveryReload();
                    } else {
                        window.location.reload();
                    }
                } catch (error) {
                    alert(`Mise à jour impossible: ${error.message}`);
                } finally {
                    forceUpdateButton.disabled = false;
                    forceUpdateButton.textContent = '🔄 MAJ';
                }
            });
        }
    }

    if (departmentsLayerButton) {
        departmentsLayerButton.classList.toggle('active', areDepartmentsVisible);
        departmentsLayerButton.addEventListener('click', () => {
            toggleDepartmentsLayer(!areDepartmentsVisible);
        });

        if (map && map._departmentZoomStyleBound !== true) {
            map._departmentZoomStyleBound = true;
            map.on('zoomend', updateDepartmentsLayerAppearance);
        }
    }

    if (communesLayerButton) {
        communesLayerButton.classList.toggle('active', areCommunesVisible);
        communesLayerButton.addEventListener('click', () => {
            toggleCommunesLayer(!areCommunesVisible);
        });

        if (map && map._communesZoomStyleBound !== true) {
            map._communesZoomStyleBound = true;
            // v12.62 — performance iPad : recalcul du calque Communes uniquement en fin de déplacement/zoom.
            map.on('zoomend moveend', updateCommunesLayerAppearance);
        }
    }

    if (waterPointsButton) {
        waterPointsButton.classList.toggle('active', showWaterPointsLayer);
        waterPointsButton.addEventListener('click', () => {
            toggleWaterPointsLayer();
        });
    }

    if (highVoltageLinesButton) {
        refreshHighVoltageLinesButtonState();
        highVoltageLinesButton.addEventListener('click', () => {
            toggleHighVoltageLinesLayer();
        });
    }

    if (opsFrequenciesButton) {
        opsFrequenciesButton.addEventListener('click', () => {
            openOpsFrequenciesPdf();
        });
    }

    if (trafficLayerButton) {
        refreshTrafficButtonState();
        installTrafficButtonInteractions(trafficLayerButton);
    }

    let searchInputDebounceTimer = null;

    const runCommuneSearch = () => {
        selectedPelicanOACI = null;
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
            if (rawSearch.trim().length === 0) {
                displayFireHistory();
            } else {
                document.getElementById('results-list').style.display = 'none';
            }
            return;
        }
        const searchWords = simplifiedSearch.split(' ').filter(Boolean);
        const searchCompact = searchWords.join('');
        const communesToSearch = departmentFilter ? allCommunes.filter(c => c.dep_code === departmentFilter) : allCommunes;

        const scoredResults = communesToSearch
            .filter(c => shouldSearchCandidate(c, searchWords, searchCompact, departmentFilter))
            .map(c => ({ ...c, score: scoreCommuneSearchCandidate(c, searchWords) }))
            .filter(c => c.score < 999);

        const aliasResults = searchAliasCommunes(searchWords, departmentFilter);
        const seenResultKeys = new Set(scoredResults.map(c => `commune:${c.code_insee}:${simplifyString(c.nom_standard)}`));

        aliasResults.forEach((alias) => {
            const key = `alias:${alias.alias_target_code_insee}:${simplifyString(alias.nom_standard)}`;
            const sameVisibleNameAlreadyPresent = seenResultKeys.has(`commune:${alias.code_insee}:${simplifyString(alias.nom_standard)}`);
            if (!seenResultKeys.has(key) && !sameVisibleNameAlreadyPresent) {
                seenResultKeys.add(key);
                scoredResults.push(alias);
            }
        });

        scoredResults.sort((a, b) => a.score - b.score || a.nom_standard.length - b.nom_standard.length);
        displayResults(scoredResults.slice(0, 10));
    };

    searchInput.addEventListener('input', keepKeyboardAfterSearchClear);
    searchInput.addEventListener('search', () => {
        clearSearchBtn.style.display = searchInput.value.length > 0 ? 'block' : 'none';
        if (searchInput.value.length === 0) {
            displayFireHistory();
        }
        keepKeyboardAfterSearchClear();
    });

    searchInput.addEventListener('input', () => {
        clearSearchBtn.style.display = searchInput.value.length > 0 ? 'block' : 'none';

        if (searchInputDebounceTimer) {
            clearTimeout(searchInputDebounceTimer);
        }

        /*
         * v11.85 — fluidité saisie.
         * Le scoring complet communes + alias ne tourne plus à chaque frappe.
         * Il est déclenché après une courte pause, ou immédiatement si la saisie
         * se termine par un département, cas typique pour affiner les alias.
         */
        const value = searchInput.value;
        const immediateDepartmentSearch = /\s(\d{1,3}|2A|2B)$/i.test(value);

        searchInputDebounceTimer = setTimeout(runCommuneSearch, immediateDepartmentSearch ? 0 : 260);
    });

    const showFireHistoryFromSearch = () => {
        /*
         * v11.25 — correction saisie commune après sélection d'un feu.
         * L'historique reste accessible au clic, mais la barre de recherche
         * garde toujours le focus et le clavier doit pouvoir s'ouvrir.
         */
        searchInput.disabled = false;
        searchInput.readOnly = false;
        displayFireHistory();

        if (searchInput.value && searchInput.value.trim().length > 0) {
            setTimeout(() => {
                try {
                    const end = searchInput.value.length;
                    searchInput.focus();
                    searchInput.setSelectionRange(end, end);
                } catch (_) {}
            }, 0);
        }
    };

    const collapseSearchInputSelection = () => {
        if (document.activeElement !== searchInput || !searchInput.value) return;
        try {
            const end = searchInput.value.length;
            searchInput.setSelectionRange(end, end);
        } catch (_) {}
    };

    searchInput.addEventListener('focus', showFireHistoryFromSearch);
    searchInput.addEventListener('click', showFireHistoryFromSearch);
    document.addEventListener('pointerdown', (event) => {
        if (event.target === searchInput) return;

        /*
         * v11.95 — iPad : ne pas laisser le gestionnaire global interférer
         * avec le bouton X du feu en cours. Le clavier doit rester ouvert.
         */
        if (event.target && event.target.closest && (
            event.target.closest('#clear-commune-btn') ||
            event.target.closest('#clear-search') ||
            event.target.closest('#search-container')
        )) {
            return;
        }

        setTimeout(collapseSearchInputSelection, 0);
    }, true);
    searchInput.addEventListener('pointerdown', () => {
        searchInput.disabled = false;
        searchInput.readOnly = false;
    });

    const focusSearchInputForKeyboard = () => {
        searchInput.disabled = false;
        searchInput.readOnly = false;
        try {
            searchInput.focus({ preventScroll: true });
        } catch (_) {
            searchInput.focus();
        }
    };

    const prepareSearchClearAndKeyboard = (event = null) => {
        if (event) event.stopPropagation();
        focusSearchInputForKeyboard();
    };

    const clearSearchInputAndKeepKeyboard = (event = null) => {
        /*
         * v12.66 — iPad : lorsque le champ contient déjà un feu et que l'on clique
         * sur X, on force le focus dans le geste utilisateur pour rouvrir le clavier.
         */
        if (event) {
            event.stopPropagation();
        }

        focusSearchInputForKeyboard();
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        document.getElementById('results-list').style.display = 'none';
        displayFireHistory();

        const refocus = () => {
            try {
                searchInput.focus({ preventScroll: true });
                searchInput.setSelectionRange(0, 0);
            } catch (_) {
                searchInput.focus();
            }
        };

        refocus();
        setTimeout(refocus, 40);
        setTimeout(refocus, 140);
    };

    ['touchstart', 'pointerdown', 'mousedown'].forEach((eventName) => {
        clearSearchBtn.addEventListener(eventName, prepareSearchClearAndKeyboard, { passive: false });
    });

    clearSearchBtn.addEventListener('touchend', (event) => {
        event.preventDefault();
        clearSearchInputAndKeepKeyboard(event);
    }, { passive: false });

    clearSearchBtn.addEventListener('click', (event) => {
        event.preventDefault();
        clearSearchInputAndKeepKeyboard(event);
    });

    airportCountInput.addEventListener('change', () => {
        if (currentCommune) {
            displayCommuneDetails(currentCommune, false);
        }
    });

    gpsFeuButton.addEventListener('click', () => {
        if (!navigator.geolocation) { alert("La géolocalisation n'est pas supportée par votre navigateur."); return; }
        selectedPelicanOACI = null;
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords;
                const gpsCommune = await buildManualFireCommuneFromPointAsync(latitude, longitude, 'Feu GPS');
                currentCommune = gpsCommune;
                localStorage.setItem('currentCommune', JSON.stringify(gpsCommune));
                displayCommuneDetails(gpsCommune, false);
            },
            () => { alert("Impossible d'obtenir la position GPS. Veuillez vérifier vos autorisations."); },
            { enableHighAccuracy: true }
        );
    });

    if (centerGpsButton) {
        refreshCenterGpsFollowButtonState();
        installCenterGpsFollowHandlers();
        centerGpsButton.addEventListener('click', toggleCenterGpsFollow);
    }

    liveGpsButton.addEventListener('click', toggleLiveGps);
    if (lftwRouteButton) {
        lftwRouteButton.addEventListener('click', toggleLftwRoute);
    }
    gaarModeButton.addEventListener('click', toggleGaarVisibility);
    editCircuitsButton.addEventListener('click', toggleGaarDrawingMode);
    deleteCircuitsButton.addEventListener('click', () => { if (confirm("Voulez-vous vraiment supprimer tous les circuits GAAR ?")) { clearAllGaarCircuits(); } });

    toggleSearchButton.addEventListener('click', () => {
        const uiOverlay = document.getElementById('ui-overlay');
        const communeDisplay = document.getElementById('commune-info-display');
        if (uiOverlay.style.display === 'none') {
            uiOverlay.style.display = 'block';
            communeDisplay.style.display = 'none';
            toggleSearchButton.classList.add('active');
            setTimeout(() => {
                try {
                    searchInput.disabled = false;
                    searchInput.readOnly = false;
                    searchInput.focus();
                    if (searchInput.value) searchInput.select();
                } catch (_) {}
            }, 80);
        } else {
            uiOverlay.style.display = 'none';
            toggleSearchButton.classList.remove('active');
            if (communeDisplay.innerHTML.trim() !== '' && currentCommune) {
                communeDisplay.style.display = 'flex';
            }
        }
    });

    document.addEventListener('communeSelected', () => {
        document.getElementById('ui-overlay').style.display = 'none';
        document.getElementById('toggle-search-button').classList.remove('active');
        if (currentCommune) {
            document.getElementById('commune-info-display').style.display = 'flex';
        }
    });

    function openCalculatorTab(tabId) {
        if (!calculatorModal) return;
        calculatorModal.style.display = 'flex';
        const targetTab = calculatorModal.querySelector(`.onglet-bouton[data-onglet="${tabId}"]`);
        if (targetTab) targetTab.click();
    }

    calculatorButton.addEventListener('click', () => { openCalculatorTab('previ-rotations'); });
    if (blocFuelShortcutButton) {
        blocFuelShortcutButton.addEventListener('click', () => { openCalculatorTab('bloc-fuel'); });
    }
    closeCalculatorButton.addEventListener('click', () => { calculatorModal.style.display = 'none'; });
    calculatorModal.addEventListener('click', (e) => { if (e.target === calculatorModal) { calculatorModal.style.display = 'none'; } });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && calculatorModal.style.display === 'flex') { calculatorModal.style.display = 'none'; } });
    offlineMapsButton.addEventListener('click', () => { offlineMapModal.style.display = 'flex'; displayInstalledMaps(); displayInstalledAirportPdfs(); refreshSimulationModeButtonState(); });
    closeOfflineMapButton.addEventListener('click', () => { offlineMapModal.style.display = 'none'; });
    offlineMapModal.addEventListener('click', (e) => { if (e.target === offlineMapModal) { offlineMapModal.style.display = 'none'; } });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && offlineMapModal.style.display === 'flex') { offlineMapModal.style.display = 'none'; } });
    zipImporterInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        handleZipImport(file);
        event.target.value = '';
    });
    if (airportPdfImporterInput) {
        airportPdfImporterInput.addEventListener('change', async (event) => {
            const files = Array.from(event.target.files || []);
            await importAirportPdfFiles(files);
            event.target.value = '';
        });
    }
    if (folderImporterInput) {
        folderImporterInput.addEventListener('change', (event) => {
            const files = Array.from(event.target.files || []);
            handleFolderImport(files);
            event.target.value = '';
        });
    }
    if (tilesImporterInput) {
        tilesImporterInput.addEventListener('change', (event) => {
            const files = Array.from(event.target.files || []);
            handleFolderImport(files, { fromDirectoryPicker: false });
            event.target.value = '';
        });
    }

    if (mapSourceOnlineBtn) {
        mapSourceOnlineBtn.addEventListener('click', async () => {
            try {
                await setMapSourceMode('online');
            } catch (error) {
                console.error('Erreur activation mode online:', error);
                alert(`Impossible d'activer le mode online: ${error.message || error}`);
            }
        });
    }

    if (mapSourceOfflineBtn) {
        mapSourceOfflineBtn.addEventListener('click', async () => {
            if (!activeOfflinePacks.length) {
                alert('Aucun pack offline actif. Activez (ou importez) un pack avant de passer en mode offline.');
                return;
            }
            try {
                await setMapSourceMode('offline');
            } catch (error) {
                console.error('Erreur activation mode offline:', error);
                alert(`Impossible d'activer le mode offline: ${error.message || error}`);
            }
        });
    }

    if (purgeInactivePacksBtn) {
        purgeInactivePacksBtn.addEventListener('click', async () => {
            await purgeInactivePacksCache();
        });
    }

    if (refreshOfflineTilesBtn) {
        refreshOfflineTilesBtn.addEventListener('click', async () => {
            refreshOfflineTilesBtn.disabled = true;
            refreshOfflineTilesBtn.textContent = '⏳ Rafraîchissement...';
            try {
                await refreshOfflineTilesRendering();
            } finally {
                refreshOfflineTilesBtn.disabled = false;
                refreshOfflineTilesBtn.textContent = "Rafraîchir l'affichage des cartes offline";
            }
        });
    }


    if (simulationModeButton) {
        refreshSimulationModeButtonState();
        simulationModeButton.addEventListener('click', () => {
            toggleSimulationMode();
        });
    }

    setupBaseOaciInputs();
    updateBaseLabels();
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
            if (c.alias_match && c.alias_commune_actuelle) {
                li.title = `Rattachée à ${c.alias_commune_actuelle}`;
            }
            li.addEventListener('click', () => {
                currentCommune = c;
                localStorage.setItem('currentCommune', JSON.stringify(c));
                displayCommuneDetails(c);
            });
            resultsList.appendChild(li);
        });
    } else {
        if (!document.getElementById('search-input')?.value.trim()) {
            displayFireHistory();
        } else {
            resultsList.style.display = 'none';
        }
    }
}

async function findOfflineTileZoomRange() {
    if (!db) return null;
    const targetPacks = new Set(activeOfflinePacks);
    return new Promise((resolve) => {
        let settled = false;
        const finalize = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(safetyTimer);
            resolve(value);
        };

        const safetyTimer = setTimeout(() => {
            console.warn('Scan zoom offline interrompu (timeout sécurité).');
            finalize(null);
        }, 8000);

        const tx = db.transaction('tiles', 'readonly');
        const store = tx.objectStore('tiles');
        const request = store.openCursor();
        let minZoom = null;
        let maxZoom = null;

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) {
                finalize(minZoom === null || maxZoom === null ? null : { minZoom, maxZoom });
                return;
            }
            if (targetPacks.size && !targetPacks.has(cursor.value?.packName || '')) {
                cursor.continue();
                return;
            }
            const storedUrl = cursor.value?.url;
            const url = getTileUrlFromStoredKey(storedUrl);
            if (typeof url === 'string') {
                const match = url.match(/\/(\d+)\/\d+\/\d+\.(png|jpg|jpeg)(?:\?.*)?$/i);
                if (match) {
                    const zoom = Number.parseInt(match[1], 10);
                    if (Number.isFinite(zoom)) {
                        minZoom = minZoom === null ? zoom : Math.min(minZoom, zoom);
                        maxZoom = maxZoom === null ? zoom : Math.max(maxZoom, zoom);
                    }
                }
            }
            cursor.continue();
        };

        request.onerror = () => finalize(null);
        tx.onerror = () => finalize(null);
        tx.onabort = () => finalize(null);
        tx.oncomplete = () => finalize(minZoom === null || maxZoom === null ? null : { minZoom, maxZoom });
    });
}

async function updateBaseTileNativeZoomFromAvailability({ forceScan = false } = {}) {
    const offlineEnabled = await getOfflineTilesEnabled();
    const shouldForceScan = forceScan;
    const activeOfflineMaxZoomLimit = getOfflinePackMaxNativeZoomLimitForPacks(activeOfflinePacks);
    if (!offlineEnabled) {
        baseTileMinNativeZoom = GLOBAL_MIN_ZOOM;
        baseTileMaxNativeZoom = ONLINE_MAX_NATIVE_ZOOM;
    } else {
        const storedOfflineMinZoom = Number.parseInt(localStorage.getItem(OFFLINE_TILES_MIN_ZOOM_KEY) || '', 10);
        const storedOfflineMaxZoom = Number.parseInt(localStorage.getItem(OFFLINE_TILES_MAX_ZOOM_KEY) || '', 10);
        let offlineMinZoom = Number.isFinite(storedOfflineMinZoom) ? storedOfflineMinZoom : null;
        let offlineMaxZoom = Number.isFinite(storedOfflineMaxZoom) ? storedOfflineMaxZoom : null;

        if (shouldForceScan && !OFFLINE_DISABLE_STARTUP_FORCE_SCAN) {
            const zoomRange = await findOfflineTileZoomRange();
            if (!zoomRange) {
                offlineMinZoom = null;
                offlineMaxZoom = null;
                localStorage.removeItem(OFFLINE_TILES_MIN_ZOOM_KEY);
                localStorage.removeItem(OFFLINE_TILES_MAX_ZOOM_KEY);
            } else {
                offlineMinZoom = zoomRange.minZoom;
                offlineMaxZoom = zoomRange.maxZoom;
                localStorage.setItem(OFFLINE_TILES_MIN_ZOOM_KEY, String(offlineMinZoom));
                localStorage.setItem(OFFLINE_TILES_MAX_ZOOM_KEY, String(offlineMaxZoom));
            }
        }

        if (offlineMinZoom === null || offlineMaxZoom === null) {
            baseTileMinNativeZoom = GLOBAL_MIN_ZOOM;
            baseTileMaxNativeZoom = activeOfflineMaxZoomLimit;
        } else {
            baseTileMinNativeZoom = Math.max(GLOBAL_MIN_ZOOM, Math.min(GLOBAL_MAX_ZOOM, offlineMinZoom));
            baseTileMaxNativeZoom = Math.max(0, Math.min(activeOfflineMaxZoomLimit, offlineMaxZoom));
        }
    }

    if (map && baseTileLayer) {
        setupBaseTileLayer();
    }
}


function showPostUpdateRestartNoticeIfNeeded() {
    try {
        const pending = localStorage.getItem('npfPostUpdateRestartNoticePending') === '1';
        const noticeVersion = localStorage.getItem('npfPostUpdateRestartNoticeVersion') || '';
        const currentVersion = (typeof window.APP_VERSION !== 'undefined' && window.APP_VERSION) ? window.APP_VERSION : '';
        const forcedByTransition = window.NPF_FORCE_POST_UPDATE_NOTICE === true;
        if (!forcedByTransition && !pending && !noticeVersion) return;
        // v12.92 — si pending=1, afficher même si le marqueur de version vient de l'ancienne version.
        if (!pending && currentVersion && noticeVersion && noticeVersion !== currentVersion) return;
        showPostUpdateRestartNoticeModal();
    } catch (_) {}
}

function showPostUpdateRestartNoticeModal() {
    if (document.getElementById('post-update-restart-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'post-update-restart-modal';
    modal.className = 'update-reminder-modal post-update-restart-modal';
    modal.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:2147483647',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:24px',
        'box-sizing:border-box',
        'background:rgba(0,0,0,.58)'
    ].join(';');
    modal.innerHTML = `
        <div class="update-reminder-modal-content post-update-restart-modal-content" role="dialog" aria-modal="true" aria-labelledby="post-update-restart-title">
            <h3 id="post-update-restart-title">Mise à jour installée</h3>
            <p>Une nouvelle version de NPF-Q400 vient d’être chargée.</p>
            <p>Ferme complètement l’application puis relance-la pour finaliser la mise à jour.</p>
            <p>Ce message peut apparaître plusieurs fois : c’est normal. Relance simplement l’application à chaque demande jusqu’à disparition du message.</p>
            <p>Si à un moment l’application devient anormalement lente à s’ouvrir ou reste bloquée au démarrage, supprime-la de l’écran d’accueil puis réinstalle-la depuis Safari.</p>
        </div>
    `;

    const modalContent = modal.firstElementChild;
    if (modalContent) {
        modalContent.style.cssText = [
            'width:min(620px,calc(100vw - 48px))',
            'max-height:calc(100vh - 48px)',
            'overflow:auto',
            'box-sizing:border-box',
            'padding:24px',
            'border-radius:16px',
            'background:#fff',
            'color:#1f2937',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
            'box-shadow:0 18px 50px rgba(0,0,0,.35)'
        ].join(';');
    }
    document.body.appendChild(modal);

    /*
     * v13.92 — même règle que l'alerte précoce : le marqueur n'est consommé
     * qu'après deux secondes de visibilité réelle.
     */
    setTimeout(() => {
        try {
            if (!document.body || !document.body.contains(modal)) return;
            if (document.visibilityState === 'hidden') return;

            const remainingKey = 'npfPostUpdateRestartNoticeRemaining';
            const remainingRaw = Number(localStorage.getItem(remainingKey) || '1');
            const remaining = Number.isFinite(remainingRaw) ? remainingRaw : 1;
            if (remaining > 1) {
                localStorage.setItem(remainingKey, String(remaining - 1));
                localStorage.setItem('npfPostUpdateRestartNoticePending', '1');
            } else {
                localStorage.removeItem('npfPostUpdateRestartNoticeVersion');
                localStorage.removeItem('npfPostUpdateRestartNoticePending');
                localStorage.removeItem(remainingKey);
                window.NPF_FORCE_POST_UPDATE_NOTICE = false;
            }
        } catch (_) {}
    }, 2000);
}

function showUpdateReminderIfDue() {
    try {
        if (document.getElementById('post-update-restart-modal')) return;
        const lastShown = Number(localStorage.getItem(UPDATE_REMINDER_STORAGE_KEY) || '0');
        const now = Date.now();
        if (lastShown && (now - lastShown) < UPDATE_REMINDER_INTERVAL_MS) return;
        showUpdateReminderModal(now);
    } catch (_) {}
}

function showUpdateReminderModal(timestamp = Date.now()) {
    if (document.getElementById('update-reminder-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'update-reminder-modal';
    modal.className = 'update-reminder-modal';
    modal.innerHTML = `
        <div class="update-reminder-modal-content" role="dialog" aria-modal="true" aria-labelledby="update-reminder-title">
            <h3 id="update-reminder-title">Mise à jour</h3>
            <p>Pensez à cliquer sur <span class="update-reminder-maj-button" aria-label="bouton MAJ"><span class="update-reminder-maj-symbol">🔄</span><span>MAJ</span></span> de temps en temps pour être certain d’avoir la dernière version à jour.<br><strong>Relancer l’application après mise à jour.</strong></p>
            <div class="update-reminder-actions">
                <button id="update-reminder-now-button" class="update-reminder-primary" type="button">Vérifier maintenant</button>
                <button id="update-reminder-later-button" class="update-reminder-secondary" type="button">Plus tard</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const rememberAndClose = () => {
        try {
            localStorage.setItem(UPDATE_REMINDER_STORAGE_KEY, String(timestamp));
        } catch (_) {}
        modal.remove();
    };

    const laterButton = document.getElementById('update-reminder-later-button');
    if (laterButton) {
        laterButton.addEventListener('click', rememberAndClose);
    }

    const nowButton = document.getElementById('update-reminder-now-button');
    if (nowButton) {
        nowButton.addEventListener('click', () => {
            rememberAndClose();
            if (typeof window.forceRecoveryReload === 'function') {
                window.forceRecoveryReload();
                return;
            }
            const forceUpdateButton = document.getElementById('force-update-button');
            if (forceUpdateButton) forceUpdateButton.click();
        });
    }

    modal.addEventListener('click', (event) => {
        if (event.target === modal) rememberAndClose();
    });
}

function updateCommuneDisplay(commune) {
    const communeDisplay = document.getElementById('commune-info-display');
    if (!commune) {
        communeDisplay.innerHTML = '';
        communeDisplay.style.display = 'none';
        return;
    }

    const dbCommune = getCommuneFromDatabaseByNameAndDepartment(commune);
    const fallbackClosest = (!commune.dep_code && commune.latitude_mairie != null && commune.longitude_mairie != null)
        ? findClosestCommune(commune.latitude_mairie, commune.longitude_mairie, 27)
        : null;
    const displayCommune = dbCommune || fallbackClosest || commune;
    const depLabel = formatCommuneDepartment(displayCommune);
    const depCode = depLabel ? ` (${depLabel})` : '';
    const communeNameHTML = `<span class="commune-name">${displayCommune.nom_standard || commune.nom_standard}${depCode}</span>`;
    const closeButtonHTML = `<span id="clear-commune-btn" class="clear-commune-btn" title="Effacer le feu">×</span>`;
    const routeInfoHTML = `<div id="gps-feu-route-info" class="gps-feu-route-info" title="Route, distance et temps GPS vers le feu">---° / -- Nm / -- min</div><div id="gps-feu-rotation-info" class="gps-feu-rotation-info" title="Durée de rotation issue de l’onglet Suivi rotation">Rot. -- min</div>`;
    let sunsetHTML = '';
    if (typeof SunCalc !== 'undefined') {
        try {
            const now = new Date();
            const times = SunCalc.getTimes(now, commune.latitude_mairie, commune.longitude_mairie);
            const sunsetString = times.sunset.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
            sunsetHTML = `<div class="sunset-info">🌅&nbsp;CS&nbsp;<b>${sunsetString}</b></div>${routeInfoHTML}`;
        } catch (e) {
            sunsetHTML = `<div class="sunset-info"></div>${routeInfoHTML}`;
        }
    } else {
        sunsetHTML = routeInfoHTML;
    }
    communeDisplay.innerHTML = communeNameHTML + sunsetHTML + closeButtonHTML;
    updateCommuneGpsRouteDisplay();

    // On attache l'événement de clic au nouveau bouton
    const clearCommuneBtn = document.getElementById('clear-commune-btn');
    if (clearCommuneBtn) {
        const preserveSearchFocusBeforeClear = (event) => {
            /*
             * v11.95 — iPad : pointerdown seul ne suffit pas toujours.
             * On intercepte touchstart + mousedown + pointerdown avant que Safari
             * ne retire le focus du champ et ferme le clavier.
             */
            const searchInput = document.getElementById('search-input');
            if (document.activeElement === searchInput) {
                clearCommuneBtn.dataset.keepSearchKeyboard = '1';
                event.preventDefault();
                event.stopPropagation();
            }
        };

        ['touchstart', 'pointerdown', 'mousedown'].forEach((eventName) => {
            clearCommuneBtn.addEventListener(eventName, preserveSearchFocusBeforeClear, { passive: false });
        });

        clearCommuneBtn.addEventListener('click', (event) => {
            const searchInput = document.getElementById('search-input');
            const shouldKeepKeyboard = clearCommuneBtn.dataset.keepSearchKeyboard === '1' || document.activeElement === searchInput;

            event.preventDefault();
            event.stopPropagation();

            clearCurrentSelection();
            clearCommuneBtn.dataset.keepSearchKeyboard = '0';

            if (shouldKeepKeyboard && searchInput) {
                setTimeout(() => {
                    try {
                        searchInput.focus({ preventScroll: true });
                        const end = searchInput.value.length;
                        searchInput.setSelectionRange(end, end);
                    } catch (_) {
                        searchInput.focus();
                    }
                }, 0);
            }
        });
    }
}

function getCurrentGpsGroundSpeedKt() {
    const speedMps = Number(lastPosition?.speedMps);
    if (!Number.isFinite(speedMps) || speedMps <= 0) return null;
    return speedMps * 1.9438444924406;
}

function formatGpsEtaMinutes(distanceNm) {
    const speedKt = getCurrentGpsGroundSpeedKt();
    if (!Number.isFinite(distanceNm) || distanceNm <= 0 || !Number.isFinite(speedKt) || speedKt < 30) {
        return '-- min';
    }
    const minutes = Math.max(1, Math.round((distanceNm * 60) / speedKt));
    return `${minutes} min`;
}

function getSuiviRotationDurationMinutesForMap() {
    const suiviInput = document.querySelector('#suivi-duree-rotation-wrapper .display-input');
    const suiviMinutes = parseTime(suiviInput?.value || '');
    if (Number.isFinite(suiviMinutes) && suiviMinutes > 0) return suiviMinutes;

    const previText = document.getElementById('duree-rotation')?.textContent || '';
    const previMinutes = parseTime(previText);
    if (Number.isFinite(previMinutes) && previMinutes > 0) return previMinutes;

    if (Number.isFinite(CALCULATOR_DATA?.distPelicFeu) && CALCULATOR_DATA.distPelicFeu > 0) {
        const computed = Math.round(calculateRotationTime(CALCULATOR_DATA.distPelicFeu));
        if (Number.isFinite(computed) && computed > 20) return computed;
    }

    return null;
}

function updateCommuneMapRotationInfo() {
    const rotationInfo = document.getElementById('gps-feu-rotation-info');
    if (!rotationInfo) return;

    const minutes = getSuiviRotationDurationMinutesForMap();
    rotationInfo.textContent = Number.isFinite(minutes) && minutes > 0
        ? `Rot. ${Math.round(minutes)} min`
        : 'Rot. -- min';
    rotationInfo.classList.toggle('gps-feu-route-info-empty', !(Number.isFinite(minutes) && minutes > 0));
}

function updateCommuneGpsRouteDisplay() {
    const routeInfo = document.getElementById('gps-feu-route-info');
    const rotationInfo = document.getElementById('gps-feu-rotation-info');
    if (!routeInfo && !rotationInfo) return;

    if (!currentCommune || !userMarker || !userMarker.getLatLng) {
        if (routeInfo) {
            routeInfo.textContent = '---° / -- Nm / -- min';
            routeInfo.classList.add('gps-feu-route-info-empty');
        }
        updateCommuneMapRotationInfo();
        return;
    }

    const targetLat = Number(currentCommune.latitude_mairie);
    const targetLon = Number(currentCommune.longitude_mairie);
    const userLatLng = userMarker.getLatLng();

    if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon) || !userLatLng) {
        if (routeInfo) {
            routeInfo.textContent = '---° / -- Nm / -- min';
            routeInfo.classList.add('gps-feu-route-info-empty');
        }
        updateCommuneMapRotationInfo();
        return;
    }

    const distance = calculateDistanceInNm(userLatLng.lat, userLatLng.lng, targetLat, targetLon);
    const trueBearingToTarget = calculateBearing(userLatLng.lat, userLatLng.lng, targetLat, targetLon);
    const magneticBearing = (trueBearingToTarget - MAGNETIC_DECLINATION + 360) % 360;

    if (routeInfo) {
        routeInfo.textContent = `${formatRouteDegrees(magneticBearing)} / ${Math.round(distance)} Nm / ${formatGpsEtaMinutes(distance)}`;
        routeInfo.classList.remove('gps-feu-route-info-empty');
    }
    updateCommuneMapRotationInfo();
}


function getClosestWaterPoints(lat, lon, count = 3) {
    return waterPoints
        .map(point => ({
            ...point,
            distance: calculateDistanceInNm(lat, lon, point.lat, point.lon)
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, count);
}

function buildWaterPointIcon(isClosest = false) {
    /*
     * v12.08 — plans d'eau :
     * - tous les plans d'eau = petit point bleu ;
     * - les 3 plus proches = même point bleu, très légèrement agrandi.
     * La zone tactile reste plus large que le point visuel.
     */
    const size = isClosest ? 18 : 16;
    const dotSize = isClosest ? 8 : 6;
    return L.divIcon({
        className: isClosest ? 'water-point-dot-marker water-point-dot-marker-closest' : 'water-point-dot-marker',
        html: `<span style="width:${dotSize}px;height:${dotSize}px;"></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}

function drawWaterPointMarkersForCommune(commune) {
    if (!waterPointsLayer) return;
    waterPointsLayer.clearLayers();

    if (!showWaterPointsLayer) {
        return;
    }

    /*
     * v12.03 — Plan d'eau :
     * - bouton actif = toutes les gouttes affichées partout en France ;
     * - si un feu est sélectionné = les 3 plus proches reçoivent une étiquette nom + distance ;
     * - aucun impact sur les calculs.
     */
    let closestWaterPointIds = new Set();
    let closestWaterPointDistances = new Map();

    if (commune) {
        const lat = Number(commune.latitude_mairie);
        const lon = Number(commune.longitude_mairie);

        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            getClosestWaterPoints(lat, lon, 3).forEach(point => {
                closestWaterPointIds.add(point.id);
                closestWaterPointDistances.set(point.id, point.distance);
            });
        }
    }

    waterPoints.forEach(point => {
        const isClosest = closestWaterPointIds.has(point.id);
        const marker = L.marker([point.lat, point.lon], {
            icon: buildWaterPointIcon(isClosest),
            interactive: true,
            zIndexOffset: isClosest ? 540 : 420
        });

        if (isClosest) {
            const distance = closestWaterPointDistances.get(point.id);
            const label = `<div class="water-point-label-name">${escapeHtml(point.name)}</div><div class="water-point-label-distance">${Math.round(distance)} Nm</div>`;

            marker.bindTooltip(label, {
                permanent: true,
                direction: 'right',
                offset: [10, 0],
                className: 'water-point-tooltip'
            });
        }
        marker.bindPopup(`<div class="water-point-popup"><b>${escapeHtml(point.name)}</b></div>`);
        marker.addTo(waterPointsLayer);
    });
}

function refreshWaterPointsButtonState() {
    const button = document.getElementById('water-points-button');
    if (button) {
        button.classList.toggle('active', showWaterPointsLayer);
    }
}

function toggleWaterPointsLayer(forceState = null) {
    showWaterPointsLayer = forceState === null ? !showWaterPointsLayer : Boolean(forceState);
    localStorage.setItem(WATER_POINTS_LAYER_KEY, showWaterPointsLayer ? 'true' : 'false');
    refreshWaterPointsButtonState();

    drawWaterPointMarkersForCommune(currentCommune);
}


function getHighVoltageLineStyle(feature) {
    const props = feature?.properties || {};
    const tension = String(props.tension || '').toLowerCase();

    let weight = 1.5;
    let opacity = 0.72;
    let dashArray = '5 4';

    if (tension.includes('400')) {
        weight = 3.0;
        opacity = 0.86;
        dashArray = null;
    } else if (tension.includes('225')) {
        weight = 2.4;
        opacity = 0.82;
        dashArray = null;
    } else if (tension.includes('90')) {
        weight = 1.9;
        opacity = 0.78;
        dashArray = '7 4';
    } else if (tension.includes('63')) {
        weight = 1.6;
        opacity = 0.70;
        dashArray = '4 4';
    }

    return {
        color: '#d8232a',
        weight,
        opacity,
        dashArray,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        pane: 'highVoltageLinesPane'
    };
}

function refreshHighVoltageLinesButtonState() {
    const button = document.getElementById('high-voltage-lines-button');
    if (!button) return;

    button.classList.toggle('active', showHighVoltageLinesLayer);
    button.classList.toggle('loading', isHighVoltageLinesLoading);
    button.disabled = isHighVoltageLinesLoading;
    button.title = isHighVoltageLinesLoading
        ? 'Chargement des lignes haute tension RTE…'
        : 'Afficher/Masquer les lignes haute tension RTE';
}

async function fetchHighVoltageLinesGeojson() {
    const url = `${HIGH_VOLTAGE_LINES_GEOJSON_URL}?appv=${encodeURIComponent(window.APP_VERSION || 'v12.59')}`;
    let response = null;

    try {
        if ('caches' in window) {
            const cached = await caches.match(HIGH_VOLTAGE_LINES_GEOJSON_URL, { ignoreSearch: true });
            if (cached && cached.ok) response = cached;
        }
    } catch (_) {}

    if (!response) {
        response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        try {
            if ('caches' in window) {
                const cache = await caches.open(`npf-q400-lignes-ht-${window.APP_VERSION || 'v12.59'}`);
                await cache.put(HIGH_VOLTAGE_LINES_GEOJSON_URL, response.clone());
            }
        } catch (cacheError) {
            console.warn('Cache lignes HT impossible:', cacheError);
        }
    }

    return await response.json();
}

async function loadHighVoltageLinesLayerData() {
    if (!map || !highVoltageLinesLayer) return;
    if (hasLoadedHighVoltageLines) return;

    isHighVoltageLinesLoading = true;
    refreshHighVoltageLinesButtonState();

    try {
        const geojson = await fetchHighVoltageLinesGeojson();
        const featuresCount = Array.isArray(geojson?.features) ? geojson.features.length : 0;

        const geoJsonLayer = L.geoJSON(geojson, {
            style: getHighVoltageLineStyle,
            pane: 'highVoltageLinesPane',
            renderer: highVoltageLinesRenderer || undefined,
            interactive: false,
            filter: feature => !!feature?.geometry
        });

        geoJsonLayer.addTo(highVoltageLinesLayer);
        hasLoadedHighVoltageLines = true;
        console.log(`Lignes HT chargées: ${featuresCount} tronçons`);
    } finally {
        isHighVoltageLinesLoading = false;
        refreshHighVoltageLinesButtonState();
    }
}

function scheduleHighVoltageLinesRetry(source = 'retry') {
    const token = ++highVoltageLinesRetryToken;
    const delays = [2500, 7000, 15000, 30000];
    delays.forEach((delay) => {
        setTimeout(() => {
            if (token !== highVoltageLinesRetryToken) return;
            if (!showHighVoltageLinesLayer || hasLoadedHighVoltageLines) return;
            toggleHighVoltageLinesLayer(true, { silent: true, retry: false, source }).catch(() => {});
        }, delay);
    });
}

async function toggleHighVoltageLinesLayer(forceState = null, options = {}) {
    const shouldShow = forceState === null ? !showHighVoltageLinesLayer : Boolean(forceState);
    const silent = !!options.silent;
    const allowRetry = options.retry !== false;

    if (shouldShow && !hasLoadedHighVoltageLines) {
        try {
            await loadHighVoltageLinesLayerData();
        } catch (error) {
            console.warn('Chargement lignes HT différé:', options.source || 'manual', error);
            showHighVoltageLinesLayer = true;
            localStorage.setItem(HIGH_VOLTAGE_LINES_LAYER_KEY, 'true');
            refreshHighVoltageLinesButtonState();
            if (allowRetry) scheduleHighVoltageLinesRetry(options.source || 'load-error');
            if (!silent) {
                alert("Chargement Lignes HT différé. L'application va réessayer automatiquement.");
            }
            return;
        }
    }

    showHighVoltageLinesLayer = shouldShow;

    if (showHighVoltageLinesLayer) {
        if (highVoltageLinesLayer && !map.hasLayer(highVoltageLinesLayer)) {
            highVoltageLinesLayer.addTo(map);
        }
    } else if (highVoltageLinesLayer && map.hasLayer(highVoltageLinesLayer)) {
        map.removeLayer(highVoltageLinesLayer);
    }

    localStorage.setItem(HIGH_VOLTAGE_LINES_LAYER_KEY, String(showHighVoltageLinesLayer));
    refreshHighVoltageLinesButtonState();
}




// =========================================================================
// v13.01 TEST — réglages calque trafic ADS-B
// =========================================================================
function sanitizeTrafficSettings(candidate = {}) {
    const fallback = DEFAULT_TRAFFIC_SETTINGS;
    const parseIntOr = (value, defaultValue) => {
        const num = Number(value);
        return Number.isFinite(num) ? Math.round(num) : defaultValue;
    };

    const asBool = (value, defaultValue = false) => {
        if (value === undefined || value === null || value === '') return !!defaultValue;
        return value === true || value === 'true' || value === '1' || value === 'on' || value === 1;
    };

    const radiusNm = Math.max(5, Math.min(250, parseIntOr(candidate.radiusNm, fallback.radiusNm)));
    const maxAircraft = Math.max(1, Math.min(150, parseIntOr(candidate.maxAircraft, fallback.maxAircraft)));
    const minAltitudeFt = Math.max(0, Math.min(60000, parseIntOr(candidate.minAltitudeFt, fallback.minAltitudeFt)));

    let maxAltitudeFt = candidate.maxAltitudeFt;
    if (maxAltitudeFt === '' || maxAltitudeFt === null || maxAltitudeFt === undefined) {
        maxAltitudeFt = null;
    } else {
        maxAltitudeFt = Math.max(0, Math.min(60000, parseIntOr(maxAltitudeFt, fallback.maxAltitudeFt ?? 60000)));
    }

    if (maxAltitudeFt !== null && maxAltitudeFt < minAltitudeFt) {
        maxAltitudeFt = minAltitudeFt;
    }

    const showAltitudeLabel = asBool(candidate.showAltitudeLabel, fallback.showAltitudeLabel);
    const relativeAltitudeEnabled = asBool(candidate.relativeAltitudeEnabled, fallback.relativeAltitudeEnabled);
    const relativeAltitudeBandFt = Math.max(100, Math.min(10000, parseIntOr(candidate.relativeAltitudeBandFt, fallback.relativeAltitudeBandFt)));
    let trafficAroundOwnPosition = asBool(candidate.trafficAroundOwnPosition, fallback.trafficAroundOwnPosition);
    let trafficAroundFire = asBool(candidate.trafficAroundFire, fallback.trafficAroundFire);

    if (!trafficAroundOwnPosition && !trafficAroundFire) {
        trafficAroundOwnPosition = true;
    }

    return {
        radiusNm,
        maxAircraft,
        minAltitudeFt,
        maxAltitudeFt,
        showAltitudeLabel,
        relativeAltitudeEnabled,
        relativeAltitudeBandFt,
        trafficAroundOwnPosition,
        trafficAroundFire
    };
}

function loadTrafficSettings() {
    try {
        const raw = localStorage.getItem(TRAFFIC_SETTINGS_STORAGE_KEY);
        if (!raw) return sanitizeTrafficSettings(DEFAULT_TRAFFIC_SETTINGS);
        return sanitizeTrafficSettings(JSON.parse(raw));
    } catch (_) {
        return sanitizeTrafficSettings(DEFAULT_TRAFFIC_SETTINGS);
    }
}

function saveTrafficSettings(settings) {
    trafficSettings = sanitizeTrafficSettings(settings);
    try {
        localStorage.setItem(TRAFFIC_SETTINGS_STORAGE_KEY, JSON.stringify(trafficSettings));
    } catch (_) {}
    return trafficSettings;
}

function getTrafficSettingsSummary() {
    const settings = sanitizeTrafficSettings(trafficSettings);
    const altitudeMaxLabel = settings.maxAltitudeFt === null ? 'sans maxi' : `${settings.maxAltitudeFt} ft`;
    const altitudeLabel = settings.showAltitudeLabel ? 'étiquette alt ON' : 'étiquette alt OFF';
    const relativeLabel = settings.relativeAltitudeEnabled ? `±${settings.relativeAltitudeBandFt} ft autour GPS` : 'altitude absolue';
    const referenceLabels = [];
    if (settings.trafficAroundOwnPosition) referenceLabels.push('GPS');
    if (settings.trafficAroundFire) referenceLabels.push('feu');
    return `Rayon ${settings.radiusNm} Nm · Max ${settings.maxAircraft} avions · Alt ${settings.minAltitudeFt} ft à ${altitudeMaxLabel} · ${relativeLabel} · ${altitudeLabel} · autour ${referenceLabels.join(' + ')}`;
}

function ensureTrafficSettingsModal() {
    let modal = document.getElementById('traffic-settings-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'traffic-settings-modal';
    modal.className = 'traffic-settings-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="traffic-settings-card" role="dialog" aria-modal="true" aria-labelledby="traffic-settings-title">
            <div class="traffic-settings-header">
                <div>
                    <div id="traffic-settings-title" class="traffic-settings-title">Filtres trafic</div>
                    <div class="traffic-settings-subtitle">Réglages du calque trafic indicatif</div>
                </div>
                <button type="button" id="traffic-settings-close" class="traffic-settings-close" aria-label="Fermer">×</button>
            </div>

            <div class="traffic-settings-grid">
                <label class="traffic-settings-field">
                    <span>Rayon d'affichage</span>
                    <div class="traffic-settings-input-row">
                        <input id="traffic-radius-input" type="number" inputmode="numeric" min="5" max="250" step="1">
                        <em>Nm</em>
                    </div>
                </label>

                <label class="traffic-settings-field">
                    <span>Nombre maximal d'avions</span>
                    <div class="traffic-settings-input-row">
                        <input id="traffic-max-aircraft-input" type="number" inputmode="numeric" min="1" max="150" step="1">
                        <em>avions</em>
                    </div>
                </label>

                <label id="traffic-min-altitude-field" class="traffic-settings-field traffic-absolute-altitude-field">
                    <span>Altitude mini</span>
                    <div class="traffic-settings-input-row">
                        <input id="traffic-min-altitude-input" type="number" inputmode="numeric" min="0" max="60000" step="100">
                        <em>ft</em>
                    </div>
                </label>

                <label id="traffic-max-altitude-field" class="traffic-settings-field traffic-absolute-altitude-field">
                    <span>Altitude maxi</span>
                    <div class="traffic-settings-input-row">
                        <input id="traffic-max-altitude-input" type="number" inputmode="numeric" min="0" max="60000" step="100" placeholder="vide">
                        <em>ft</em>
                    </div>
                </label>

                <label class="traffic-settings-field traffic-settings-checkbox-field traffic-settings-relative-line">
                    <div class="traffic-settings-check-row traffic-settings-inline-band-row">
                        <input id="traffic-relative-altitude-input" type="checkbox">
                        <em>Tranche autour de mon altitude</em>
                        <span class="traffic-relative-plusminus">±</span>
                        <input id="traffic-relative-band-input" type="number" inputmode="numeric" min="100" max="10000" step="100">
                        <strong>ft</strong>
                    </div>
                </label>

                <label class="traffic-settings-field traffic-settings-checkbox-field">
                    <div class="traffic-settings-check-row">
                        <input id="traffic-around-own-input" type="checkbox">
                        <em>Trafic autour de ma position</em>
                    </div>
                </label>

                <label class="traffic-settings-field traffic-settings-checkbox-field">
                    <div class="traffic-settings-check-row">
                        <input id="traffic-around-fire-input" type="checkbox">
                        <em>Trafic autour du feu</em>
                    </div>
                </label>

                <label class="traffic-settings-field traffic-settings-checkbox-field">
                    <div class="traffic-settings-check-row">
                        <input id="traffic-altitude-label-input" type="checkbox">
                        <em>Etiquette Alt. Trafics</em>
                    </div>
                </label>
            </div>

            <div class="traffic-settings-note">Altitude maxi vide = pas de limite haute. La tranche autour de mon altitude utilise l'altitude GPS disponible. Rafraîchissement trafic toutes les 5 secondes. Ces filtres ne changent pas la nature indicative et non certifiée des données SafeSky/ADS-B.</div>

            <div class="traffic-settings-actions">
                <button type="button" id="traffic-settings-reset" class="traffic-settings-secondary">Défaut</button>
                <button type="button" id="traffic-settings-cancel" class="traffic-settings-secondary">Annuler</button>
                <button type="button" id="traffic-settings-apply" class="traffic-settings-primary">Appliquer</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    };

    const updateAltitudeModeUi = () => {
        const relativeAltitudeInput = modal.querySelector('#traffic-relative-altitude-input');
        const minAltitudeInput = modal.querySelector('#traffic-min-altitude-input');
        const maxAltitudeInput = modal.querySelector('#traffic-max-altitude-input');
        const minAltitudeField = modal.querySelector('#traffic-min-altitude-field');
        const maxAltitudeField = modal.querySelector('#traffic-max-altitude-field');
        const disabled = !!relativeAltitudeInput?.checked;

        [minAltitudeInput, maxAltitudeInput].forEach(input => {
            if (input) input.disabled = disabled;
        });
        [minAltitudeField, maxAltitudeField].forEach(field => {
            if (field) field.classList.toggle('traffic-settings-field-disabled', disabled);
        });
    };

    const fillDefaults = () => {
        const defaults = sanitizeTrafficSettings(DEFAULT_TRAFFIC_SETTINGS);
        modal.querySelector('#traffic-radius-input').value = String(defaults.radiusNm);
        modal.querySelector('#traffic-max-aircraft-input').value = String(defaults.maxAircraft);
        modal.querySelector('#traffic-min-altitude-input').value = String(defaults.minAltitudeFt);
        modal.querySelector('#traffic-max-altitude-input').value = '';
        modal.querySelector('#traffic-around-own-input').checked = !!defaults.trafficAroundOwnPosition;
        modal.querySelector('#traffic-around-fire-input').checked = !!defaults.trafficAroundFire;
        modal.querySelector('#traffic-relative-altitude-input').checked = !!defaults.relativeAltitudeEnabled;
        modal.querySelector('#traffic-relative-band-input').value = String(defaults.relativeAltitudeBandFt);
        modal.querySelector('#traffic-altitude-label-input').checked = !!defaults.showAltitudeLabel;
        updateAltitudeModeUi();
    };

    modal.querySelector('#traffic-relative-altitude-input').addEventListener('change', updateAltitudeModeUi);

    modal.querySelector('#traffic-settings-close').addEventListener('click', closeModal);
    modal.querySelector('#traffic-settings-cancel').addEventListener('click', closeModal);
    modal.querySelector('#traffic-settings-reset').addEventListener('click', fillDefaults);

    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });

    modal.querySelector('#traffic-settings-apply').addEventListener('click', () => {
        const radiusInput = modal.querySelector('#traffic-radius-input');
        const maxAircraftInput = modal.querySelector('#traffic-max-aircraft-input');
        const minAltitudeInput = modal.querySelector('#traffic-min-altitude-input');
        const maxAltitudeInput = modal.querySelector('#traffic-max-altitude-input');
        const aroundOwnInput = modal.querySelector('#traffic-around-own-input');
        const aroundFireInput = modal.querySelector('#traffic-around-fire-input');
        const relativeAltitudeInput = modal.querySelector('#traffic-relative-altitude-input');
        const relativeBandInput = modal.querySelector('#traffic-relative-band-input');
        const altitudeLabelInput = modal.querySelector('#traffic-altitude-label-input');

        saveTrafficSettings({
            radiusNm: radiusInput.value,
            maxAircraft: maxAircraftInput.value,
            minAltitudeFt: minAltitudeInput.value,
            maxAltitudeFt: maxAltitudeInput.value.trim() === '' ? null : maxAltitudeInput.value,
            trafficAroundOwnPosition: !!aroundOwnInput.checked,
            trafficAroundFire: !!aroundFireInput.checked,
            relativeAltitudeEnabled: !!relativeAltitudeInput.checked,
            relativeAltitudeBandFt: relativeBandInput.value,
            showAltitudeLabel: !!altitudeLabelInput.checked
        });

        refreshTrafficButtonState(lastTrafficDisplayedCount);

        if (showTrafficLayer) {
            refreshTrafficLayer({ force: true, reason: 'settings' });
        }

        closeModal();
    });

    return modal;
}

function openTrafficSettingsDialog() {
    const current = sanitizeTrafficSettings(trafficSettings);
    const modal = ensureTrafficSettingsModal();

    modal.querySelector('#traffic-radius-input').value = String(current.radiusNm);
    modal.querySelector('#traffic-max-aircraft-input').value = String(current.maxAircraft);
    modal.querySelector('#traffic-min-altitude-input').value = String(current.minAltitudeFt);
    modal.querySelector('#traffic-max-altitude-input').value = current.maxAltitudeFt === null ? '' : String(current.maxAltitudeFt);
    modal.querySelector('#traffic-around-own-input').checked = !!current.trafficAroundOwnPosition;
    modal.querySelector('#traffic-around-fire-input').checked = !!current.trafficAroundFire;
    modal.querySelector('#traffic-relative-altitude-input').checked = !!current.relativeAltitudeEnabled;
    modal.querySelector('#traffic-relative-band-input').value = String(current.relativeAltitudeBandFt);
    modal.querySelector('#traffic-altitude-label-input').checked = !!current.showAltitudeLabel;

    try {
        const relativeAltitudeInput = modal.querySelector('#traffic-relative-altitude-input');
        const minAltitudeInput = modal.querySelector('#traffic-min-altitude-input');
        const maxAltitudeInput = modal.querySelector('#traffic-max-altitude-input');
        const minAltitudeField = modal.querySelector('#traffic-min-altitude-field');
        const maxAltitudeField = modal.querySelector('#traffic-max-altitude-field');
        const disabled = !!relativeAltitudeInput?.checked;
        [minAltitudeInput, maxAltitudeInput].forEach(input => { if (input) input.disabled = disabled; });
        [minAltitudeField, maxAltitudeField].forEach(field => { if (field) field.classList.toggle('traffic-settings-field-disabled', disabled); });
    } catch (_) {}

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');

    setTimeout(() => {
        try {
            modal.querySelector('#traffic-radius-input').focus({ preventScroll: true });
        } catch (_) {}
    }, 50);
}

function installTrafficButtonInteractions(button) {
    if (!button || button.dataset.trafficBound === '1') return;
    button.dataset.trafficBound = '1';

    try {
        button.setAttribute('draggable', 'false');
        button.querySelectorAll('*').forEach(child => child.setAttribute('draggable', 'false'));
    } catch (_) {}

    let longPressTimer = null;
    let longPressTriggered = false;

    const clearLongPress = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    const startLongPress = (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        clearLongPress();
        longPressTriggered = false;
        longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            openTrafficSettingsDialog();
        }, 650);
    };

    button.addEventListener('selectstart', (event) => event.preventDefault());
    button.addEventListener('dragstart', (event) => event.preventDefault());
    button.addEventListener('pointerdown', startLongPress);
    button.addEventListener('pointerup', clearLongPress);
    button.addEventListener('pointerleave', clearLongPress);
    button.addEventListener('pointercancel', clearLongPress);
    button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        clearLongPress();
        longPressTriggered = true;
        openTrafficSettingsDialog();
    });
    button.addEventListener('click', (event) => {
        if (longPressTriggered) {
            event.preventDefault();
            event.stopPropagation();
            longPressTriggered = false;
            return;
        }
        toggleTrafficLayer();
    });
}

function getTrafficRadiusNm() {
    return sanitizeTrafficSettings(trafficSettings).radiusNm;
}

function parseTrafficAltitudeFeet(raw) {
    const altitudeRaw = raw?.alt_baro ?? raw?.alt_geom ?? raw?.altitude;
    if (altitudeRaw === 'ground') return 0;
    const altitudeNumber = Number(altitudeRaw);
    return Number.isFinite(altitudeNumber) ? Math.round(altitudeNumber) : null;
}

function getOwnTrafficPoint() {
    if (userMarker && typeof userMarker.getLatLng === 'function') {
        const ll = userMarker.getLatLng();
        if (ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng)) {
            return { lat: ll.lat, lon: ll.lng, label: 'GPS', kind: 'own' };
        }
    }

    if (lastPosition) {
        const lat = Number(lastPosition.lat ?? lastPosition.latitude);
        const lon = Number(lastPosition.lng ?? lastPosition.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            return { lat, lon, label: 'GPS', kind: 'own' };
        }
    }

    return null;
}

function getFireTrafficPoint() {
    if (!currentCommune) return null;
    const lat = Number(currentCommune.latitude_mairie);
    const lon = Number(currentCommune.longitude_mairie);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, label: buildFireDisplayName(currentCommune) || 'feu', kind: 'fire' };
}

function getTrafficQueryPoints() {
    const settings = sanitizeTrafficSettings(trafficSettings);
    const points = [];

    if (settings.trafficAroundOwnPosition) {
        const ownPoint = getOwnTrafficPoint();
        if (ownPoint) points.push(ownPoint);
    }

    if (settings.trafficAroundFire) {
        const firePoint = getFireTrafficPoint();
        if (firePoint) points.push(firePoint);
    }

    if (!points.length) {
        const ownPoint = getOwnTrafficPoint();
        if (ownPoint) points.push(ownPoint);
    }

    if (!points.length) {
        const firePoint = getFireTrafficPoint();
        if (firePoint) points.push(firePoint);
    }

    if (!points.length && map && typeof map.getCenter === 'function') {
        const center = map.getCenter();
        if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
            points.push({ lat: center.lat, lon: center.lng, label: 'centre carte', kind: 'map' });
        }
    }

    const unique = [];
    const keys = new Set();
    points.forEach(point => {
        const key = `${point.kind}:${Number(point.lat).toFixed(4)}:${Number(point.lon).toFixed(4)}`;
        if (keys.has(key)) return;
        keys.add(key);
        unique.push(point);
    });

    return unique;
}

function getOwnTrafficAltitudeFeet() {
    const candidates = [
        lastPosition?.altitudeFt,
        lastPosition?.altitudeFeet
    ];

    for (const candidate of candidates) {
        const num = Number(candidate);
        if (Number.isFinite(num)) return Math.round(num);
    }

    return null;
}

function getNearestTrafficReference(ac, points = []) {
    if (!ac || !Array.isArray(points) || !points.length) return null;
    let best = null;
    points.forEach(point => {
        const distance = calculateDistanceInNm(point.lat, point.lon, ac.lat, ac.lon);
        if (!Number.isFinite(distance)) return;
        if (!best || distance < best.distance) {
            best = { point, distance };
        }
    });
    return best;
}

function buildTrafficReferenceLabel(points = []) {
    if (!Array.isArray(points) || !points.length) return '';
    return points.map(point => point.label).filter(Boolean).join(' + ');
}

function buildTrafficAircraftKey(ac) {
    if (!ac) return '';
    if (ac.hex) return `hex:${ac.hex}`;
    return `pos:${ac.callsign}:${Number(ac.lat).toFixed(4)}:${Number(ac.lon).toFixed(4)}`;
}

async function fetchTrafficAircraftForPoint(point, providers) {
    const errors = [];

    for (const provider of providers) {
        try {
            const result = await fetchTrafficAircraftFromProvider(point, provider);
            return { provider: result.provider, aircraft: result.aircraft, raw: result.raw, point };
        } catch (providerError) {
            const errText = providerError && providerError.message ? providerError.message : String(providerError);
            errors.push(`${provider.label}: ${errText}`);
            console.warn(`Trafic ADS-B indisponible via ${provider.label} autour ${point.label}:`, providerError);
        }
    }

    throw new Error(errors.length ? `${point.label}: ${errors.join(' / ')}` : `${point.label}: aucune source disponible`);
}

// =========================================================================
// v12.96 TEST — calque trafic ADS-B indicatif
// =========================================================================
function getTrafficQueryPoint() {
    const points = getTrafficQueryPoints();
    return points.length ? points[0] : null;
}


function buildSafeSkyViewport(point, radiusNm = getTrafficRadiusNm()) {
    const lat = Number(point?.lat);
    const lon = Number(point?.lon);
    const radius = Math.max(5, Math.min(250, Number(radiusNm) || TRAFFIC_RADIUS_NM));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error('Point SafeSky invalide');
    }

    /*
     * 1 degré de latitude ≈ 60 NM.
     * La longitude est corrigée par le cosinus de la latitude.
     * Une petite marge évite de couper un trafic placé exactement sur la limite.
     */
    const marginFactor = 1.03;
    const latDelta = (radius / 60) * marginFactor;
    const cosLatitude = Math.max(0.08, Math.cos(lat * Math.PI / 180));
    const lonDelta = (radius / (60 * cosLatitude)) * marginFactor;

    const latMin = Math.max(-90, lat - latDelta);
    const latMax = Math.min(90, lat + latDelta);
    const lonMin = Math.max(-180, lon - lonDelta);
    const lonMax = Math.min(180, lon + lonDelta);

    return [latMin, lonMin, latMax, lonMax]
        .map(value => Number(value).toFixed(4))
        .join(',');
}

function buildTrafficApiUrl(point, provider = null) {
    const activeProvider = provider || TRAFFIC_API_PROVIDERS[0];
    const lat = Number(point.lat).toFixed(4);
    const lon = Number(point.lon).toFixed(4);
    const radius = Math.max(5, Math.min(250, getTrafficRadiusNm()));

    if (!activeProvider?.baseUrl) {
        throw new Error(`${activeProvider?.label || 'Source trafic'} non configurée`);
    }

    if (activeProvider.urlFormat === 'viewport') {
        const viewport = buildSafeSkyViewport(point, radius);
        const separator = activeProvider.baseUrl.includes('?') ? '&' : '?';
        return `${activeProvider.baseUrl}${separator}viewport=${encodeURIComponent(viewport)}&show_grounded=false`;
    }

    if (activeProvider.urlFormat === 'point') {
        return `${activeProvider.baseUrl}/point/${lat}/${lon}/${radius}`;
    }

    return `${activeProvider.baseUrl}/lat/${lat}/lon/${lon}/dist/${radius}`;
}

function extractTrafficAircraftList(data) {
    if (Array.isArray(data?.ac)) return data.ac;
    if (Array.isArray(data?.aircraft)) return data.aircraft;
    if (Array.isArray(data)) return data;
    return [];
}

async function fetchTrafficAircraftFromProvider(point, provider) {
    const url = buildTrafficApiUrl(point, provider);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7500);
    try {
        const response = await fetch(url, {
            cache: 'no-store',
            mode: 'cors',
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return { provider, aircraft: extractTrafficAircraftList(data), raw: data };
    } finally {
        clearTimeout(timeoutId);
    }
}

function normalizeTrafficAircraft(raw) {
    if (!raw) return null;

    const safeSkyFormat = (
        raw.latitude !== undefined
        || raw.longitude !== undefined
        || raw.beacon_type !== undefined
        || raw.transponder_type !== undefined
        || raw.call_sign !== undefined
    );

    /*
     * SafeSky ADVISORY décrit une zone déclarée d'activité drone.
     * Ce n'est pas une position mobile : elle ne doit pas utiliser le symbole avion.
     * Le support cartographique des zones ADVISORY pourra être ajouté séparément.
     */
    if (String(raw.transponder_type || '').toUpperCase() === 'ADVISORY') {
        return null;
    }

    const latitudeRaw = raw.lat ?? raw.latitude;
    const longitudeRaw = raw.lon ?? raw.longitude;
    if (!Number.isFinite(Number(latitudeRaw)) || !Number.isFinite(Number(longitudeRaw))) {
        return null;
    }

    const callsign = String(
        raw.flight
        || raw.callsign
        || raw.call_sign
        || raw.registration
        || raw.r
        || raw.id
        || raw.hex
        || ''
    ).trim() || 'N/A';

    const trafficId = String(raw.hex || raw.id || '').trim().toUpperCase();
    const lat = Number(latitudeRaw);
    const lon = Number(longitudeRaw);

    let seenPos = null;
    if (safeSkyFormat && Number.isFinite(Number(raw.last_update))) {
        const eventTimestampSeconds = Number(raw.last_update);
        seenPos = Math.max(0, (Date.now() / 1000) - eventTimestampSeconds);
    } else if (Number.isFinite(Number(raw.seen_pos))) {
        seenPos = Number(raw.seen_pos);
    } else if (Number.isFinite(Number(raw.seen))) {
        seenPos = Number(raw.seen);
    }

    let altitudeFeet = null;
    let altitude = '--';
    if (safeSkyFormat && Number.isFinite(Number(raw.altitude))) {
        altitudeFeet = Math.round(Number(raw.altitude) * 3.280839895);
        altitude = `${altitudeFeet} ft`;
    } else {
        const altitudeRaw = raw.alt_baro ?? raw.alt_geom ?? raw.altitude;
        altitudeFeet = parseTrafficAltitudeFeet(raw);
        altitude = altitudeRaw === 'ground'
            ? 'GND'
            : (Number.isFinite(Number(altitudeRaw)) ? `${Math.round(Number(altitudeRaw))} ft` : '--');
    }

    let groundSpeedKnots = null;
    if (safeSkyFormat && Number.isFinite(Number(raw.ground_speed))) {
        groundSpeedKnots = Number(raw.ground_speed) * 1.943844492;
    } else if (Number.isFinite(Number(raw.gs))) {
        groundSpeedKnots = Number(raw.gs);
    }
    const gs = Number.isFinite(groundSpeedKnots) ? `${Math.round(groundSpeedKnots)} kt` : '--';

    const trackRaw = safeSkyFormat ? raw.course : raw.track;
    const track = Number.isFinite(Number(trackRaw)) ? Number(trackRaw) : null;
    const type = String(raw.beacon_type || raw.t || raw.aircraft_type || raw.type || '').trim();
    const registration = String(raw.registration || raw.r || '').trim();
    const source = String(raw.transponder_type || raw.source || raw.type || raw.dbFlags || '').trim();
    const status = String(raw.status || '').trim().toUpperCase();

    if (status === 'GROUNDED' || status === 'INACTIVE') {
        return null;
    }

    return {
        callsign,
        hex: trafficId,
        lat,
        lon,
        seenPos,
        altitude,
        altitudeFeet,
        gs,
        track,
        type,
        registration,
        source,
        providerFormat: safeSkyFormat ? 'safesky' : 'readsb',
        raw
    };
}

function formatTrafficAge(seconds) {
    if (!Number.isFinite(seconds)) return 'âge inconnu';
    if (seconds < 60) return `${Math.round(seconds)} s`;
    return `${Math.round(seconds / 60)} min`;
}

function getTrafficRelativeAltitudeState(aircraft) {
    const ownAltitudeFt = getOwnTrafficAltitudeFeet();
    const trafficAltitudeFt = Number(aircraft?.altitudeFeet);

    if (!Number.isFinite(ownAltitudeFt) || !Number.isFinite(trafficAltitudeFt)) {
        return {
            className: 'traffic-altitude-unknown',
            label: 'Altitude relative inconnue',
            deltaFt: null
        };
    }

    const deltaFt = Math.round(trafficAltitudeFt - ownAltitudeFt);

    if (Math.abs(deltaFt) <= 500) {
        return {
            className: 'traffic-altitude-same',
            label: 'Même tranche d’altitude ±500 ft',
            deltaFt
        };
    }

    if (deltaFt < -500) {
        return {
            className: 'traffic-altitude-below',
            label: 'Trafic en dessous',
            deltaFt
        };
    }

    return {
        className: 'traffic-altitude-above',
        label: 'Trafic au-dessus',
        deltaFt
    };
}

function buildTrafficMarkerIcon(aircraft) {
    const track = Number.isFinite(aircraft.track) ? aircraft.track : 0;
    const settings = sanitizeTrafficSettings(trafficSettings);
    const altitudeState = getTrafficRelativeAltitudeState(aircraft);
    const altitudeHtml = settings.showAltitudeLabel && aircraft.altitude && aircraft.altitude !== '--'
        ? `<span class="traffic-aircraft-altitude-label">${escapeHtml(aircraft.altitude)}</span>`
        : '';

    return L.divIcon({
        className: 'traffic-aircraft-icon',
        html: `<span class="traffic-aircraft-symbol-wrap ${altitudeState.className}" title="${escapeHtml(altitudeState.label)}"><span class="traffic-aircraft-vector-wrap" style="transform: rotate(${track}deg);"><span class="traffic-aircraft-dotted-vector"></span></span><span class="traffic-aircraft-arrow" style="transform: translate(-50%, -50%) rotate(${track}deg);">▲</span>${altitudeHtml}</span>`,
        iconSize: [128, 128],
        iconAnchor: [64, 64],
        popupAnchor: [0, -52]
    });
}

function renderTrafficAircraft(aircraftList, meta = {}) {
    if (!trafficLayer) return;
    trafficLayer.clearLayers();

    const settings = sanitizeTrafficSettings(trafficSettings);
    const points = Array.isArray(meta.points) && meta.points.length ? meta.points : (meta.point ? [meta.point] : []);
    const ownAltitudeFt = getOwnTrafficAltitudeFeet();
    const useRelativeAltitude = settings.relativeAltitudeEnabled && Number.isFinite(ownAltitudeFt);
    const relativeMinAltitudeFt = useRelativeAltitude ? ownAltitudeFt - settings.relativeAltitudeBandFt : null;
    const relativeMaxAltitudeFt = useRelativeAltitude ? ownAltitudeFt + settings.relativeAltitudeBandFt : null;
    const uniqueAircraft = [];
    const seenAircraft = new Set();

    aircraftList
        .map(normalizeTrafficAircraft)
        .filter(Boolean)
        .filter(ac => !Number.isFinite(ac.seenPos) || ac.seenPos <= TRAFFIC_MAX_SEEN_SECONDS)
        .filter(ac => settings.relativeAltitudeEnabled || ac.altitudeFeet === null || ac.altitudeFeet >= settings.minAltitudeFt)
        .filter(ac => settings.relativeAltitudeEnabled || settings.maxAltitudeFt === null || ac.altitudeFeet === null || ac.altitudeFeet <= settings.maxAltitudeFt)
        .filter(ac => !useRelativeAltitude || ac.altitudeFeet === null || (ac.altitudeFeet >= relativeMinAltitudeFt && ac.altitudeFeet <= relativeMaxAltitudeFt))
        .forEach(ac => {
            const reference = getNearestTrafficReference(ac, points);
            if (points.length && (!reference || reference.distance > settings.radiusNm + 0.5)) return;
            ac._trafficReference = reference;
            const key = buildTrafficAircraftKey(ac);
            if (seenAircraft.has(key)) return;
            seenAircraft.add(key);
            uniqueAircraft.push(ac);
        });

    const aircraft = uniqueAircraft.slice(0, settings.maxAircraft);

    aircraft.forEach(ac => {
        const marker = L.marker([ac.lat, ac.lon], {
            icon: buildTrafficMarkerIcon(ac),
            pane: 'trafficPane',
            zIndexOffset: 7000,
            keyboard: false
        });

        const title = escapeHtml(ac.callsign);
        const subtitle = [ac.type, ac.source, ac.registration, ac.hex].filter(Boolean).map(escapeHtml).join(' · ');
        const reference = ac._trafficReference;
        const distance = reference ? reference.distance : null;
        const referenceLabel = reference?.point?.label ? escapeHtml(reference.point.label) : '';
        const altitudeState = getTrafficRelativeAltitudeState(ac);
        const relativeAltitudeText = Number.isFinite(altitudeState.deltaFt)
            ? `${altitudeState.deltaFt > 0 ? '+' : ''}${altitudeState.deltaFt} ft`
            : '--';
        const popup = `
            <div class="traffic-popup">
                <div class="traffic-popup-title">${title}</div>
                ${subtitle ? `<div class="traffic-popup-subtitle">${subtitle}</div>` : ''}
                <div>Altitude : <b>${escapeHtml(ac.altitude)}</b></div>
                <div>Écart avec moi : <b>${escapeHtml(relativeAltitudeText)}</b> — ${escapeHtml(altitudeState.label)}</div>
                <div>Vitesse sol : <b>${escapeHtml(ac.gs)}</b></div>
                <div>Route : <b>${Number.isFinite(ac.track) ? Math.round(ac.track) + '°' : '--'}</b></div>
                ${Number.isFinite(distance) ? `<div>Distance ${referenceLabel ? `à ${referenceLabel}` : ''} : <b>${Math.round(distance)} Nm</b></div>` : ''}
                <div>Âge position : <b>${escapeHtml(formatTrafficAge(ac.seenPos))}</b></div>
                ${useRelativeAltitude ? `<div>Filtre altitude GPS : <b>${Math.round(relativeMinAltitudeFt)} / ${Math.round(relativeMaxAltitudeFt)} ft</b></div>` : ''}
                <div class="traffic-popup-warning">Trafic SafeSky/ADS-B indicatif — non certifié</div>
            </div>`;
        marker.bindPopup(popup);
        marker.bindTooltip(title, { direction: 'top', offset: [0, -10], className: 'traffic-tooltip' });
        marker.addTo(trafficLayer);
    });

    lastTrafficDisplayedCount = aircraft.length;
    refreshTrafficButtonState(aircraft.length);
    updateTrafficStatus({
        visible: showTrafficLayer,
        state: 'ok',
        count: aircraft.length,
        pointLabel: buildTrafficReferenceLabel(points),
        now: meta.now || Date.now()
    });
}

function updateTrafficStatus({ visible = showTrafficLayer, state = 'idle', count = null, pointLabel = '', message = '', now = Date.now() } = {}) {
    /* v13.03 : plus de fenêtre/bandeau d'alerte ADS-B sur la carte.
       L'état est porté uniquement par le bouton TRAFIC : rouge = erreur, bleu = chargement, vert = OK. */
    const status = document.getElementById('traffic-status-display');
    if (!status) return;
    status.style.display = 'none';
    status.textContent = '';
    status.className = 'traffic-status-display';
}

function refreshTrafficButtonState(count = null) {
    const button = document.getElementById('traffic-layer-button');
    const countEl = document.getElementById('traffic-button-count');
    if (!button) return;

    if (count !== null && count !== undefined && count !== '') {
        const numericCount = Number(count);
        if (Number.isFinite(numericCount)) {
            lastTrafficDisplayedCount = Math.max(0, Math.round(numericCount));
        }
    }

    const hasSuccessfulTrafficConnection = (
        Number.isFinite(Number(lastTrafficRefreshAt))
        && Number(lastTrafficRefreshAt) > 0
        && !lastTrafficError
    );

    button.classList.toggle('active', showTrafficLayer);
    button.classList.toggle('loading', isTrafficLoading);
    button.classList.toggle(
        'traffic-state-loading',
        !!showTrafficLayer && isTrafficLoading && !hasSuccessfulTrafficConnection
    );
    button.classList.toggle(
        'traffic-state-error',
        !!showTrafficLayer && !isTrafficLoading && !!lastTrafficError
    );
    button.classList.toggle(
        'traffic-state-ok',
        !!showTrafficLayer
            && !lastTrafficError
            && (!isTrafficLoading || hasSuccessfulTrafficConnection)
    );
    button.classList.toggle('traffic-state-idle', !showTrafficLayer);
    button.disabled = false;
    button.title = isTrafficLoading
        ? `Chargement du trafic aérien… — ${getTrafficSettingsSummary()}`
        : `Afficher/Masquer le trafic aérien indicatif — appui long: filtres — ${getTrafficSettingsSummary()}`;

    if (countEl) {
        if (showTrafficLayer) {
            /*
             * v13.99 — le nombre reste stable pendant l'interrogation suivante.
             * Il passe directement de l'ancienne valeur à la nouvelle valeur
             * lorsque les données ont été reçues, sans étape « … ».
             */
            if (lastTrafficError && !isTrafficLoading) {
                countEl.textContent = '!';
            } else {
                countEl.textContent = String(lastTrafficDisplayedCount);
            }
            countEl.style.display = 'inline-flex';
        } else {
            countEl.textContent = '0';
            countEl.style.display = 'none';
        }
    }
}

async function refreshTrafficLayer(options = {}) {
    const { force = false } = options;
    if (!showTrafficLayer || !trafficLayer) return;

    const now = Date.now();
    if (!force && lastTrafficRefreshAt && now - lastTrafficRefreshAt < 4500) return;

    const points = getTrafficQueryPoints();
    if (!points.length) {
        lastTrafficError = 'Aucun point de référence';
        lastTrafficDisplayedCount = 0;
        refreshTrafficButtonState(0);
        updateTrafficStatus({ state: 'error', message: 'Trafic : aucun point de référence', visible: true });
        return;
    }

    isTrafficLoading = true;
    refreshTrafficButtonState();
    updateTrafficStatus({ state: 'loading', visible: true });

    try {
        const providers = Array.isArray(TRAFFIC_API_PROVIDERS) && TRAFFIC_API_PROVIDERS.length
            ? TRAFFIC_API_PROVIDERS
            : [{ label: TRAFFIC_PROVIDER_LABEL || 'ADS-B', baseUrl: 'https://opendata.adsb.fi/api/v2' }];
        const errors = [];
        const combinedAircraft = [];
        const usedProviders = [];

        for (const point of points) {
            try {
                const result = await fetchTrafficAircraftForPoint(point, providers);
                combinedAircraft.push(...result.aircraft);
                if (result.provider?.label && !usedProviders.includes(result.provider.label)) {
                    usedProviders.push(result.provider.label);
                }
            } catch (pointError) {
                const errText = pointError && pointError.message ? pointError.message : String(pointError);
                errors.push(errText);
            }
        }

        if (!combinedAircraft.length && errors.length === points.length) {
            throw new Error(errors.join(' / ') || 'aucune source disponible');
        }

        lastTrafficRefreshAt = Date.now();
        lastTrafficError = '';
        renderTrafficAircraft(combinedAircraft, {
            points,
            provider: { label: usedProviders.join(' + ') },
            now: lastTrafficRefreshAt
        });
    } catch (error) {
        lastTrafficError = error && error.message ? error.message : String(error);
        lastTrafficDisplayedCount = 0;
        console.warn('Trafic temporairement indisponible:', error);
        if (trafficLayer) trafficLayer.clearLayers();
        refreshTrafficButtonState(0);
        updateTrafficStatus({ state: 'error', visible: true, message: 'Trafic temporairement indisponible — nouvelle tentative automatique' });
    } finally {
        isTrafficLoading = false;
        refreshTrafficButtonState();
    }
}

function startTrafficAutoRefresh() {
    stopTrafficAutoRefresh();
    trafficRefreshTimer = setInterval(() => {
        refreshTrafficLayer({ force: false, reason: 'timer' });
    }, TRAFFIC_REFRESH_INTERVAL_MS);
}

function stopTrafficAutoRefresh() {
    if (trafficRefreshTimer) {
        clearInterval(trafficRefreshTimer);
        trafficRefreshTimer = null;
    }
}

function toggleTrafficLayer(forceState = null) {
    if (TRAFFIC_DISABLED_FOR_NOW) {
        showTrafficLayer = false;
        try { localStorage.setItem(TRAFFIC_LAYER_KEY, 'false'); } catch (_) {}
        stopTrafficAutoRefresh();
        if (trafficLayer) trafficLayer.clearLayers();
        if (trafficLayer && map && map.hasLayer(trafficLayer)) map.removeLayer(trafficLayer);
        updateTrafficStatus({ visible: false });
        refreshTrafficButtonState(0);
        return;
    }
    const shouldShow = forceState === null ? !showTrafficLayer : Boolean(forceState);
    showTrafficLayer = shouldShow;
    localStorage.setItem(TRAFFIC_LAYER_KEY, showTrafficLayer ? 'true' : 'false');

    if (showTrafficLayer) {
        if (trafficLayer && map && !map.hasLayer(trafficLayer)) trafficLayer.addTo(map);
        startTrafficAutoRefresh();
        refreshTrafficButtonState();
        refreshTrafficLayer({ force: true, reason: 'toggle' });
    } else {
        stopTrafficAutoRefresh();
        lastTrafficDisplayedCount = 0;
        if (trafficLayer) trafficLayer.clearLayers();
        if (trafficLayer && map && map.hasLayer(trafficLayer)) map.removeLayer(trafficLayer);
        refreshTrafficButtonState(0);
        updateTrafficStatus({ visible: false });
    }
}

window.toggleTrafficLayer = toggleTrafficLayer;
window.refreshTrafficLayer = refreshTrafficLayer;
window.getSafeSkyIntegrationStatus = () => ({
    codeReady: true,
    proxyConfigured: Boolean(SAFESKY_PROXY_URL),
    trafficEnabled: !TRAFFIC_DISABLED_FOR_NOW,
    safeSkyProviderActive: TRAFFIC_API_PROVIDERS.some(provider => provider?.dataFormat === 'safesky'),
    activeProviders: TRAFFIC_API_PROVIDERS.map(provider => provider?.label).filter(Boolean),
    safeSkyExclusiveWhenConfigured: true,
    refreshIntervalMs: TRAFFIC_REFRESH_INTERVAL_MS
});

function updateMapBingoDisplay() {
    const bingoDisplay = document.getElementById('bingo-map-display');
    if (!currentCommune) {
        bingoDisplay.style.display = 'none';
        return;
    }

    const bingoBase = calculateBingo(CALCULATOR_DATA.distBaseFeu);
    const bingoPelic = calculateBingo(CALCULATOR_DATA.distPelicFeu);

    const lftwEl = document.getElementById('map-bingo-lftw');
    const pelicEl = document.getElementById('map-bingo-pelic');

    lftwEl.innerHTML = `<span class="bingo-title">BINGO BASE <span class="bingo-oaci">${selectedBaseOACI}</span>:</span> <b>${bingoBase} kg</b>`;

    if (bingoPelic !== 700 && selectedPelicanOACI) {
        pelicEl.innerHTML = `<span class="bingo-title">BINGO <span class="bingo-oaci">${selectedPelicanOACI}</span>:</span> <b>${bingoPelic} kg</b>`;
        pelicEl.style.display = 'inline-block';
    } else {
        pelicEl.style.display = 'none';
    }

    bingoDisplay.style.display = 'flex';
}

function displayCommuneDetails(commune, shouldFitBounds = true) {
    saveFireHistory(commune);
    routesLayer.clearLayers();
    lftwRouteLayer.clearLayers();
    resetRouteTooltipOffsets();
    drawPermanentAirportMarkers();
    drawFireHistoryMarkers();

    updateCommuneDisplay(commune);

    const { latitude_mairie: lat, longitude_mairie: lon, nom_standard: name } = commune;
    // v13.54 — après validation d'un feu, la barre de recherche est vidée.
    // Le feu reste sélectionné via currentCommune + bandeau carte ; seul le texte de recherche est nettoyé.
    const fireSearchInput = document.getElementById('search-input');
    const fireResultsList = document.getElementById('results-list');
    const fireClearSearchButton = document.getElementById('clear-search');
    if (fireSearchInput) fireSearchInput.value = '';
    if (fireResultsList) fireResultsList.style.display = 'none';
    if (fireClearSearchButton) fireClearSearchButton.style.display = 'none';

    const allPoints = [[lat, lon]];
    const fireLabel = buildFireDisplayName(commune);
    const fireIcon = buildActiveFireIcon(fireLabel);
    const activeFireMarker = L.marker([lat, lon], { icon: fireIcon, title: fireLabel, keyboard: false });
    bindFireMapTooltip(activeFireMarker, fireLabel, true);
    activeFireMarker
        .bindPopup(() => {
            const container = document.createElement('div');
            container.className = 'fire-history-map-popup active-fire-map-popup';
            container.innerHTML = `<b>${escapeHtml(fireLabel)}</b><br>${convertToDMM(lat, 'lat')}<br>${convertToDMM(lon, 'lon')}`;

            const actions = document.createElement('div');
            actions.className = 'fire-history-map-popup-actions';

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.textContent = 'Supprimer';
            deleteButton.className = 'fire-history-map-delete-btn';
            deleteButton.title = 'Supprimer ce feu de la carte et de l’historique';
            deleteButton.addEventListener('click', () => {
                if (!confirm('Supprimer ce feu de la carte et de l’historique ?')) return;
                deleteFireHistoryItemByCommune(commune);
                clearCurrentSelection({ preserveMapView: true });
                try { map.closePopup(); } catch (_) {}
            });

            actions.appendChild(deleteButton);
            container.appendChild(actions);
            return container;
        })
        .addTo(routesLayer);

    const numAirports = parseInt(document.getElementById('airport-count').value, 10);
    const closestAirports = getClosestAirports(lat, lon, numAirports);
    const selectedPelicAirport = getSelectedPelicanAirport();
    if (selectedPelicAirport && !disabledAirports.has(selectedPelicAirport.oaci) && !closestAirports.some(ap => ap.oaci === selectedPelicAirport.oaci)) {
        closestAirports.push({
            ...selectedPelicAirport,
            distance: calculateDistanceInNm(lat, lon, selectedPelicAirport.lat, selectedPelicAirport.lon)
        });
    }

    const closestOACIs = new Set(closestAirports.map(ap => ap.oaci));
    if (!selectedPelicanOACI || !closestOACIs.has(selectedPelicanOACI) || !isSelectablePelicanAirport(selectedPelicanOACI)) {
        selectedPelicanOACI = closestAirports.length > 0 ? closestAirports[0].oaci : null;
    }

    closestAirports.forEach(ap => {
        allPoints.push([ap.lat, ap.lon]);
        drawRoute([lat, lon], [ap.lat, ap.lon], { oaci: ap.oaci });
    });

    drawWaterPointMarkersForCommune(commune);

    const isLftwInClosest = closestAirports.some(ap => ap.oaci === 'LFTW');
    if (showLftwRoute && !isLftwInClosest) {
        drawLftwRoute();
    }

    updateBaseLabels();
    updateCalculatorData();
    updateMapBingoDisplay();
    // Nous appelons directement la fonction de dessin. Si le GPS est actif, elle utilisera la dernière position.
    drawUserToTargetRoute();

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

    if (showTrafficLayer) {
        refreshTrafficLayer({ force: true, reason: 'commune' });
    }

    document.dispatchEvent(new Event('communeSelected'));
}

function selectPelicanOaciFromRoute(oaci) {
    const normalizedOaci = String(oaci || '').trim().toUpperCase();
    if (!normalizedOaci) return;
    selectedPelicanOACI = normalizedOaci;
    displayCommuneDetails(currentCommune, false);
}

function drawRoute(startLatLng, endLatLng, options = {}) {
    const { oaci, isUser, isLftwRoute, magneticBearing } = options;
    const distance = calculateDistanceInNm(startLatLng[0], startLatLng[1], endLatLng[0], endLatLng[1]);
    let labelText, color = 'var(--primary-color)', dashArray = '', layer = routesLayer;

    if (isUser) {
        labelText = `${formatRouteDegrees(magneticBearing)} / ${Math.round(distance)} Nm`;
        color = 'var(--secondary-color)';
        dashArray = '5, 10';
        layer = userToTargetLayer;
    } else if (isLftwRoute) {
        labelText = `<b>BASE ${selectedBaseOACI}</b><span class="route-label-sub">${formatRouteDegrees(magneticBearing)} / ${Math.round(distance)} Nm / ${formatFlightTimeLabel(distance)}</span>`;
        color = 'var(--success-color)';
        dashArray = '5, 10';
        layer = lftwRouteLayer;
    } else if (oaci) {
        const isSelected = selectedPelicanOACI === oaci;
        color = isSelected ? 'var(--success-color)' : 'var(--primary-color)';
        const tooltipClass = isSelected ? 'route-tooltip route-tooltip-selected route-tooltip-near-icon' : 'route-tooltip route-tooltip-near-icon';
        labelText = `<div class="route-label-oaci">${oaci}</div><div class="route-label-sub">${Math.round(distance)} Nm / ${formatFlightTimeLabel(distance)}</div>`;

        L.polyline([startLatLng, endLatLng], { color, weight: 3, opacity: 0.8 }).addTo(layer);

        const hitbox = L.polyline([startLatLng, endLatLng], { color: 'transparent', weight: 20, opacity: 0 }).addTo(layer);
        const selectPelicRoute = (event) => {
            try {
                if (event && event.originalEvent && typeof event.originalEvent.stopPropagation === 'function') {
                    event.originalEvent.stopPropagation();
                }
            } catch (_) {}
            selectPelicanOaciFromRoute(oaci);
        };

        hitbox.on('click', selectPelicRoute);

        const tooltipOptions = getRouteLabelNearAirportOptions(startLatLng, endLatLng, 'pelic');

        const tooltip = L.tooltip({
            permanent: true,
            interactive: true,
            direction: tooltipOptions.direction,
            offset: tooltipOptions.offset,
            className: `${tooltipClass} route-tooltip-clickable`,
            bubblingMouseEvents: false
        }).setLatLng(tooltipOptions.latLng).setContent(labelText).addTo(layer);

        tooltip.on('click', selectPelicRoute);
        tooltip.on('touchstart', selectPelicRoute);
        return;
    } else {
        labelText = `${Math.round(distance)} Nm`;
    }

    if (isUser) {
        /* v13.04 — route GPS -> feu rendue plus lisible : halo blanc + trait rouge épais. */
        L.polyline([startLatLng, endLatLng], {
            color: '#ffffff',
            weight: 9,
            opacity: 0.95,
            dashArray,
            interactive: false,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(layer);
        L.polyline([startLatLng, endLatLng], {
            color: '#e3001b',
            weight: 5,
            opacity: 1,
            dashArray,
            interactive: false,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(layer);
        // Pas d'étiquette sur la route rouge GPS -> Feu : l'information est affichée dans le bandeau commune.
        return;
    }

    L.polyline([startLatLng, endLatLng], { color, weight: 3, opacity: 0.8, dashArray }).addTo(layer);

    if (isLftwRoute) {
        const tooltipOptions = getRouteLabelNearAirportOptions(startLatLng, endLatLng, 'base');
        L.tooltip({
            permanent: true,
            direction: tooltipOptions.direction,
            offset: tooltipOptions.offset,
            className: 'route-tooltip route-tooltip-base route-tooltip-near-icon'
        }).setLatLng(tooltipOptions.latLng).setContent(labelText).addTo(layer);
    } else if (oaci) {
        const tooltipOptions = getRouteLabelNearAirportOptions(startLatLng, endLatLng, 'default');
        L.tooltip({
            permanent: true,
            direction: tooltipOptions.direction,
            offset: tooltipOptions.offset,
            className: 'route-tooltip route-tooltip-near-icon'
        }).setLatLng(tooltipOptions.latLng).setContent(labelText).addTo(layer);
    }
}


function getPelicCandidateAirports() {
    /*
     * v13.59 — les terrains ajoutés manuellement comme PÉLIC sont traités
     * comme de vrais pélicandromes pour les routes, les bingos et les calculs.
     */
    const merged = [...pelicanAirports];
    otherAirports.forEach(ap => {
        if (customPelicanAirports.has(ap.oaci) && !merged.some(existing => existing.oaci === ap.oaci)) {
            merged.push(ap);
        }
    });
    return merged;
}

function isSelectablePelicanAirport(oaci) {
    const normalized = normalizeOaciCodeInput(oaci);
    if (!normalized) return false;
    return pelicanAirports.some(ap => ap.oaci === normalized) || customPelicanAirports.has(normalized);
}

function getSelectedPelicanAirport() {
    if (!selectedPelicanOACI || !isSelectablePelicanAirport(selectedPelicanOACI)) return null;
    return getAirportByOaci(selectedPelicanOACI);
}

function getClosestAirports(lat, lon, count) {
    return getPelicCandidateAirports()
        .filter(ap => !disabledAirports.has(ap.oaci))
        .map(ap => ({ ...ap, distance: calculateDistanceInNm(lat, lon, ap.lat, ap.lon) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, count);
}

function getAirportByOaci(oaci) {
    const normalized = normalizeOaciCodeInput(oaci);
    return [...pelicanAirports, ...otherAirports].find(ap => ap.oaci === normalized) || null;
}

function normalizeOaciCodeInput(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}


function normalizeBaseOaciLockedLfInput(value) {
    const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!raw) return 'LF';
    if (raw.startsWith('LF')) return `LF${raw.slice(2, 4)}`;
    if (raw.length <= 2) return `LF${raw.slice(0, 2)}`;
    return `LF${raw.slice(-2)}`;
}

function selectBaseOaciSuffix(input) {
    if (!input) return;
    if (!input.value || !String(input.value).toUpperCase().startsWith('LF')) {
        input.value = normalizeBaseOaciLockedLfInput(input.value || selectedBaseOACI || 'LF');
    }
    try {
        requestAnimationFrame(() => {
            input.focus?.();
            input.setSelectionRange?.(2, Math.min(4, String(input.value || '').length));
        });
        setTimeout(() => input.setSelectionRange?.(2, Math.min(4, String(input.value || '').length)), 80);
    } catch (_) {}
}

function updateBaseOaciInputs() {
    const inputs = [
        document.getElementById('base-oaci-input'),
        document.getElementById('previ-base-oaci-input')
    ].filter(Boolean);

    inputs.forEach(input => {
        if (document.activeElement !== input) {
            input.value = selectedBaseOACI;
        }
        input.classList.remove('base-oaci-invalid');
        input.title = `Base actuelle : ${selectedBaseOACI}`;
    });
}

function applyBaseOaciFromInput(input, { silent = false } = {}) {
    if (!input) return false;

    const requestedOaci = normalizeBaseOaciLockedLfInput(input.value);
    input.value = requestedOaci;

    if (!requestedOaci || requestedOaci.length !== 4) {
        input.classList.add('base-oaci-invalid');
        if (!silent) alert('Code OACI base incomplet. Exemple : LFTW.');
        updateBaseOaciInputs();
        return false;
    }

    const airport = getAirportByOaci(requestedOaci);
    if (!airport) {
        input.classList.add('base-oaci-invalid');
        if (!silent) alert(`Base ${requestedOaci} inconnue dans la base terrains.`);
        updateBaseOaciInputs();
        return false;
    }

    selectedBaseOACI = requestedOaci;
    saveState();
    updateBaseLabels();
    updateCalculatorData();
    if (typeof window.updateBaseSunsetDisplay === 'function') {
        window.updateBaseSunsetDisplay();
    }
    refreshUI();
    return true;
}

function setupBaseOaciInputs() {
    const inputs = [
        document.getElementById('base-oaci-input'),
        document.getElementById('previ-base-oaci-input')
    ].filter(Boolean);

    inputs.forEach(input => {
        if (input.dataset.baseOaciBound === '1') return;
        input.dataset.baseOaciBound = '1';

        input.addEventListener('input', () => {
            const previousLength = input.value.length;
            input.value = normalizeBaseOaciLockedLfInput(input.value);
            input.classList.remove('base-oaci-invalid');
            if (input.value.length <= 2 || previousLength <= 2) {
                try { input.setSelectionRange(2, 2); } catch (_) {}
            }
        });

        input.addEventListener('change', () => {
            applyBaseOaciFromInput(input);
        });

        input.addEventListener('blur', () => {
            if (normalizeBaseOaciLockedLfInput(input.value) !== selectedBaseOACI) {
                applyBaseOaciFromInput(input);
            } else {
                updateBaseOaciInputs();
            }
        });

        input.addEventListener('focus', () => selectBaseOaciSuffix(input));
        input.addEventListener('click', () => selectBaseOaciSuffix(input));
        input.addEventListener('pointerup', () => selectBaseOaciSuffix(input));

        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyBaseOaciFromInput(input);
                input.blur();
            } else if (event.key === 'Escape') {
                input.value = selectedBaseOACI;
                input.classList.remove('base-oaci-invalid');
                input.blur();
            }
        });
    });

    updateBaseOaciInputs();
}

function updateBaseLabels() {
    const routeButton = document.getElementById('lftw-route-button');
    if (routeButton) {
        routeButton.innerHTML = `Route BASE<br>${selectedBaseOACI}`;
        routeButton.title = `Afficher/Masquer la route vers la base ${selectedBaseOACI}`;
    }
    const csBaseLabel = document.getElementById('cs-base-label');
    if (csBaseLabel) csBaseLabel.textContent = 'Base';
    const previCsBaseLabel = document.getElementById('previ-cs-base-label');
    if (previCsBaseLabel) previCsBaseLabel.textContent = 'Base';
    updateBaseOaciInputs();
    document.querySelectorAll('.base-bingo-label').forEach(el => {
        el.textContent = 'BINGO BASE';
    });
    const deroutFuelMiniBaseLabel = document.getElementById('derout-fuel-mini-base-label');
    if (deroutFuelMiniBaseLabel) deroutFuelMiniBaseLabel.textContent = `Fuel mini 1 Lrg / BASE (${selectedBaseOACI}) :`;

    const deroutFuelMiniPelicLabel = document.getElementById('derout-fuel-mini-pelic-label');
    if (deroutFuelMiniPelicLabel) {
        const selectedPelic = selectedPelicanOACI ? getAirportByOaci(selectedPelicanOACI) : null;
        const pelicCode = selectedPelic ? selectedPelic.oaci : 'PÉLIC';
        deroutFuelMiniPelicLabel.textContent = `Fuel mini 1 Lrg / Pélic (${pelicCode}) :`;
    }
}
function refreshUI() { drawPermanentAirportMarkers(); if (currentCommune) displayCommuneDetails(currentCommune, false); }

function initAirportPdfDB() {
    return new Promise((resolve, reject) => {
        if (airportPdfDb) {
            resolve(airportPdfDb);
            return;
        }
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB indisponible'));
            return;
        }
        const request = indexedDB.open(AIRPORT_PDF_DB_NAME, AIRPORT_PDF_DB_VERSION);
        request.onupgradeneeded = event => {
            const dbInstance = event.target.result;
            if (!dbInstance.objectStoreNames.contains(AIRPORT_PDF_STORE_NAME)) {
                dbInstance.createObjectStore(AIRPORT_PDF_STORE_NAME, { keyPath: 'oaci' });
            }
        };
        request.onsuccess = event => {
            airportPdfDb = event.target.result;
            airportPdfDb.onversionchange = () => {
                try { airportPdfDb.close(); } catch (_) {}
                airportPdfDb = null;
            };
            resolve(airportPdfDb);
        };
        request.onerror = event => {
            reject(event.target.error || new Error('Ouverture base PDF impossible'));
        };
        request.onblocked = () => {
            reject(new Error("Base PDF bloquée par une autre instance de l'application"));
        };
    });
}

function normalizeAirportPdfOaciFromFilename(filename) {
    const baseName = String(filename || '').split(/[\\/]/).pop().trim();
    const nameWithoutExt = baseName.replace(/\.pdf$/i, '').trim();
    const simplifiedName = nameWithoutExt
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    /*
     * v13.66 — PDF commun FDF réduite :
     * accepte "Doc Fdf Réduite.pdf" ou "Doc Fdf Réduité.pdf"
     * et le stocke avec une clé unique, commune à tous les pélicandromes.
     * v13.67 — accepte aussi "Carte Fréquences OPS.pdf" comme PDF commun.
     */
    if (simplifiedName === 'docfdfreduite') {
        return FDF_REDUCED_PDF_KEY;
    }
    if (simplifiedName === 'cartefrequencesops') {
        return OPS_FREQUENCIES_PDF_KEY;
    }

    const match = baseName.match(/^([A-Z0-9]{4})\.pdf$/i);
    return match ? match[1].toUpperCase() : null;
}

function getAirportPdfDisplayLabel(recordOrKey) {
    const key = typeof recordOrKey === 'string' ? recordOrKey : String((recordOrKey && recordOrKey.oaci) || '');
    if (key === FDF_REDUCED_PDF_KEY) return FDF_REDUCED_PDF_LABEL;
    if (key === OPS_FREQUENCIES_PDF_KEY) return OPS_FREQUENCIES_PDF_LABEL;
    return key;
}

async function getAirportPdfRecord(oaci) {
    const safeOaci = String(oaci || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!safeOaci) return null;
    try {
        const pdfDb = await initAirportPdfDB();
        return await new Promise((resolve, reject) => {
            const tx = pdfDb.transaction(AIRPORT_PDF_STORE_NAME, 'readonly');
            const store = tx.objectStore(AIRPORT_PDF_STORE_NAME);
            const request = store.get(safeOaci);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error('Lecture PDF impossible'));
        });
    } catch (error) {
        console.warn('PDF offline indisponible:', error);
        return null;
    }
}

async function importAirportPdfFiles(files = []) {
    const pdfFiles = Array.from(files || []).filter(file => file && /\.pdf$/i.test(file.name));
    if (!pdfFiles.length) {
        alert('Sélectionne un ou plusieurs fichiers PDF : LFTW.pdf pour un aérodrome, Doc Fdf Réduité.pdf pour le document FDF réduit commun, ou Carte Fréquences OPS.pdf pour la carte fréquences OPS.');
        return;
    }

    const invalidNames = [];
    const records = [];
    for (const file of pdfFiles) {
        const oaci = normalizeAirportPdfOaciFromFilename(file.name);
        if (!oaci) {
            invalidNames.push(file.name);
            continue;
        }
        records.push({
            oaci,
            filename: oaci === FDF_REDUCED_PDF_KEY ? FDF_REDUCED_PDF_FILENAME : (oaci === OPS_FREQUENCIES_PDF_KEY ? OPS_FREQUENCIES_PDF_FILENAME : `${oaci}.pdf`),
            blob: file,
            size: file.size || 0,
            updatedAt: Date.now()
        });
    }

    if (!records.length) {
        alert(`Aucun PDF importé. Les fichiers doivent être nommés LFTW.pdf, LFKJ.pdf, etc., Doc Fdf Réduité.pdf ou Carte Fréquences OPS.pdf.${invalidNames.length ? `\nIgnorés : ${invalidNames.join(', ')}` : ''}`);
        return;
    }

    try {
        const pdfDb = await initAirportPdfDB();
        await new Promise((resolve, reject) => {
            const tx = pdfDb.transaction(AIRPORT_PDF_STORE_NAME, 'readwrite');
            const store = tx.objectStore(AIRPORT_PDF_STORE_NAME);
            records.forEach(record => store.put(record));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Import PDF impossible'));
            tx.onabort = () => reject(tx.error || new Error('Import PDF interrompu'));
        });
        displayInstalledAirportPdfs();
        alert(`${records.length} PDF(s) FDF/aérodrome/OPS stocké(s) hors ligne.${invalidNames.length ? `\nIgnorés : ${invalidNames.join(', ')}` : ''}`);
    } catch (error) {
        console.error('Import PDF aérodromes impossible:', error);
        alert(`Import PDF impossible : ${error.message || error}`);
    }
}

async function getInstalledAirportPdfRecords() {
    try {
        const pdfDb = await initAirportPdfDB();
        return await new Promise((resolve, reject) => {
            const tx = pdfDb.transaction(AIRPORT_PDF_STORE_NAME, 'readonly');
            const store = tx.objectStore(AIRPORT_PDF_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve((request.result || []).sort((a, b) => String(a.oaci).localeCompare(String(b.oaci))));
            request.onerror = () => reject(request.error || new Error('Liste PDF impossible'));
        });
    } catch (error) {
        console.warn('Liste PDF aérodromes indisponible:', error);
        return [];
    }
}

async function displayInstalledAirportPdfs() {
    const list = document.getElementById('installed-airport-pdfs-list');
    if (!list) return;

    const records = await getInstalledAirportPdfRecords();
    list.innerHTML = '';

    if (!records.length) {
        list.innerHTML = '<li class="no-pdfs-placeholder">Aucun PDF FDF/aérodrome/OPS stocké.</li>';
        return;
    }

    records.forEach(record => {
        const li = document.createElement('li');
        const sizeKb = record.size ? `${Math.max(1, Math.round(record.size / 1024))} ko` : 'taille inconnue';
        const date = record.updatedAt ? new Date(record.updatedAt).toLocaleDateString('fr-FR') : '--/--/----';
        const openAction = record.oaci === FDF_REDUCED_PDF_KEY
            ? 'window.openFdfReducedPdf()'
            : (record.oaci === OPS_FREQUENCIES_PDF_KEY ? 'window.openOpsFrequenciesPdf()' : `window.openAirportPdf('${record.oaci}')`);
        li.innerHTML = `
            <span><strong>${getAirportPdfDisplayLabel(record)}</strong> — ${record.filename || `${record.oaci}.pdf`} <small>(${sizeKb}, ${date})</small></span>
            <div class="airport-pdf-actions">
                <button type="button" class="open-pdf-btn" onclick="${openAction}">Ouvrir</button>
                <button type="button" class="delete-pdf-btn" onclick="window.deleteAirportPdf('${record.oaci}')">Supprimer</button>
            </div>
        `;
        list.appendChild(li);
    });
}

async function deleteAirportPdf(oaci) {
    const safeOaci = String(oaci || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!safeOaci) return;
    if (!confirm(`Supprimer le PDF offline ${getAirportPdfDisplayLabel(safeOaci)} ?`)) return;
    try {
        const pdfDb = await initAirportPdfDB();
        await new Promise((resolve, reject) => {
            const tx = pdfDb.transaction(AIRPORT_PDF_STORE_NAME, 'readwrite');
            tx.objectStore(AIRPORT_PDF_STORE_NAME).delete(safeOaci);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Suppression PDF impossible'));
            tx.onabort = () => reject(tx.error || new Error('Suppression PDF interrompue'));
        });
        displayInstalledAirportPdfs();
    } catch (error) {
        alert(`Suppression PDF impossible : ${error.message || error}`);
    }
}

async function airportServerPdfExists(url) {
    try {
        const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        return !!(response && response.ok);
    } catch (_) {
        return false;
    }
}

async function openAirportPdfByKey(pdfKey, options = {}) {
    const safeKey = String(pdfKey || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!safeKey) return;

    /*
     * v12.58/v13.66 — sécurité PDF pélicandrome/aérodrome/FDF réduite :
     * si aucun PDF offline ni serveur n'est trouvé, on n'envoie plus l'iPad
     * vers une page PDF inexistante. La fenêtre pré-ouverte est fermée proprement.
     */
    const openedWindow = window.open('', '_blank');
    const label = options.label || getAirportPdfDisplayLabel(safeKey);
    const serverPdfUrls = Array.isArray(options.serverPdfUrls) && options.serverPdfUrls.length
        ? options.serverPdfUrls
        : [`./pdf/${safeKey}.pdf`];

    try {
        const record = await getAirportPdfRecord(safeKey);
        if (record && record.blob) {
            const pdfUrl = URL.createObjectURL(record.blob);
            if (openedWindow) {
                openedWindow.location.href = pdfUrl;
            } else {
                window.location.href = pdfUrl;
            }
            setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
            return;
        }
    } catch (error) {
        console.warn('Ouverture PDF offline impossible:', error);
    }

    for (const serverPdfUrl of serverPdfUrls) {
        const hasServerPdf = await airportServerPdfExists(serverPdfUrl);
        if (hasServerPdf) {
            if (openedWindow) {
                openedWindow.location.href = serverPdfUrl;
            } else {
                window.location.href = serverPdfUrl;
            }
            return;
        }
    }

    try {
        if (openedWindow && !openedWindow.closed) openedWindow.close();
    } catch (_) {}

    alert(`Aucun PDF associé à ${label}.`);
}

async function openAirportPdf(oaci) {
    const safeOaci = String(oaci || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!safeOaci) return;
    return openAirportPdfByKey(safeOaci, {
        label: safeOaci,
        serverPdfUrls: [`./pdf/${safeOaci}.pdf`]
    });
}

async function openFdfReducedPdf() {
    return openAirportPdfByKey(FDF_REDUCED_PDF_KEY, {
        label: FDF_REDUCED_PDF_LABEL,
        serverPdfUrls: FDF_REDUCED_PDF_SERVER_CANDIDATES
    });
}

async function openOpsFrequenciesPdf() {
    return openAirportPdfByKey(OPS_FREQUENCIES_PDF_KEY, {
        label: OPS_FREQUENCIES_PDF_LABEL,
        serverPdfUrls: OPS_FREQUENCIES_PDF_SERVER_CANDIDATES
    });
}

window.openAirportPdf = openAirportPdf;
window.openFdfReducedPdf = openFdfReducedPdf;
window.openOpsFrequenciesPdf = openOpsFrequenciesPdf;
window.deleteAirportPdf = deleteAirportPdf;


function buildPermanentAirportDotIcon() {
    /*
     * v12.09 — points noirs aéroports :
     * point noir + cerclage blanc + liseré noir extérieur.
     * Correction : les points étaient dessinés par HTML inline, donc le CSS v12.08
     * ne touchait pas la bonne classe.
     */
    return L.divIcon({
        className: 'permanent-airport-black-dot-icon',
        html: '<span></span>',
        iconSize: [10, 10],
        iconAnchor: [5, 5]
    });
}


function buildPelicPdfButtonsHtml(oaci) {
    const safeOaci = String(oaci || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return `<div class="popup-buttons popup-pdf-buttons"><button class="pdf-btn" onclick="window.openAirportPdf('${safeOaci}')">PDF Pélic</button><button class="pdf-btn fdf-reduced-pdf-btn" onclick="window.openFdfReducedPdf()">Doc PDF Réduite</button></div>`;
}


function addAirportTouchHitbox(airport, popupHtml) {
    /* v13.81 — icône visuelle ramenée à 16 px ; zone tactile invisible de 40 px inchangée. */
    if (!airport || !Number.isFinite(Number(airport.lat)) || !Number.isFinite(Number(airport.lon)) || !popupHtml) return null;
    const hitbox = L.circleMarker([airport.lat, airport.lon], {
        radius: 20,
        color: 'transparent',
        weight: 1,
        opacity: 0,
        fillColor: 'transparent',
        fillOpacity: 0,
        interactive: true,
        keyboard: false
    }).bindPopup(popupHtml);
    hitbox.addTo(permanentAirportLayer);
    try { if (hitbox.bringToFront) hitbox.bringToFront(); } catch (_) {}
    return hitbox;
}

function drawPermanentAirportMarkers() {
    permanentAirportLayer.clearLayers();

    otherAirports.forEach(airport => {
        const isCustomPelic = customPelicanAirports.has(airport.oaci);
        const isBase = selectedBaseOACI === airport.oaci;
        const baseButtonText = isBase ? 'BASE ✓' : 'BASE';
        const baseButtonClass = isBase ? 'base-btn base-btn-active' : 'base-btn';
        const customPelicText = isCustomPelic ? 'PÉLIC ✓' : 'PÉLIC';
        const customPelicClass = isCustomPelic ? 'base-btn base-btn-active' : 'base-btn';

        if (isCustomPelic) {
            const isDisabled = disabledAirports.has(airport.oaci);
            const isWater = waterAirports.has(airport.oaci);
            let iconClass = "custom-marker-icon airport-marker-base ", iconHTML = "✈️";
            isDisabled ? (iconClass += "airport-marker-disabled", iconHTML = "<b>+</b>") : isWater ? (iconClass += "airport-marker-water", iconHTML = "💧") : iconClass += "airport-marker-active";
            const waterButtonText = isWater ? "RETARDANT" : "EAU";
            const waterButtonClass = isWater ? "water-btn water-btn-retardant" : "water-btn";
            const disableButtonText = isDisabled ? "Activer" : "Désactiver";
            const disableButtonClass = isDisabled ? "enable-btn" : "disable-btn";
            const popupHtml = `<div class="airport-popup"><b>${airport.oaci}</b><br>${airport.name}<div class="popup-buttons"><button class="${waterButtonClass}" onclick="window.toggleWater('${airport.oaci}')">${waterButtonText}</button><button class="${disableButtonClass}" onclick="window.toggleAirport('${airport.oaci}')">${disableButtonText}</button><button class="${baseButtonClass}" onclick="window.setBaseAirport('${airport.oaci}')">${baseButtonText}</button><button class="${customPelicClass}" onclick="window.toggleCustomPelican('${airport.oaci}')">${customPelicText}</button></div>${buildPelicPdfButtonsHtml(airport.oaci)}</div>`;
            const marker = L.marker([airport.lat, airport.lon], { icon: L.divIcon({ className: iconClass, html: iconHTML, iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10] }), zIndexOffset: 2500, keyboard: false });
            marker.bindPopup(popupHtml);
            marker.addTo(permanentAirportLayer);
            addAirportTouchHitbox(airport, popupHtml);
            return;
        }

        /*
         * v12.10 — points noirs aéroports réellement cerclés :
         * les aéroports non pélicandromes étaient des L.circleMarker avec
         * un gros trait transparent pour la zone tactile. Le CSS ne pouvait
         * donc pas modifier leur rendu. On dessine maintenant :
         * - un cercle externe noir ;
         * - un cercle blanc ;
         * - un point noir central ;
         * - un cercle transparent séparé pour conserver une grande zone tactile.
         */
        L.circleMarker([airport.lat, airport.lon], {
            radius: 5,
            color: '#111111',
            weight: 1,
            fillColor: '#ffffff',
            fillOpacity: 1,
            interactive: false
        }).addTo(permanentAirportLayer);

        L.circleMarker([airport.lat, airport.lon], {
            radius: 3,
            color: '#ffffff',
            weight: 1,
            fillColor: '#111111',
            fillOpacity: 1,
            interactive: false
        }).addTo(permanentAirportLayer);

        const marker = L.circleMarker([airport.lat, airport.lon], {
            radius: 10,
            fillColor: 'transparent',
            fillOpacity: 0,
            color: 'transparent',
            weight: 1,
            opacity: 0
        }).bindPopup(`<div class="airport-popup"><b>${airport.oaci}</b><br>${airport.name}<div class="popup-buttons"><button class="${baseButtonClass}" onclick="window.setBaseAirport('${airport.oaci}')">${baseButtonText}</button><button class="${customPelicClass}" onclick="window.toggleCustomPelican('${airport.oaci}')">${customPelicText}</button></div></div>`);
        marker.addTo(permanentAirportLayer);
    });

    pelicanAirports.forEach(airport => {
        const isDisabled = disabledAirports.has(airport.oaci);
        const isWater = waterAirports.has(airport.oaci);
        let iconClass = "custom-marker-icon airport-marker-base ", iconHTML = "✈️";
        isDisabled ? (iconClass += "airport-marker-disabled", iconHTML = "<b>+</b>") : isWater ? (iconClass += "airport-marker-water", iconHTML = "💧") : iconClass += "airport-marker-active";
        const icon = L.divIcon({ className: iconClass, html: iconHTML, iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10] });
        const marker = L.marker([airport.lat, airport.lon], { icon: icon, zIndexOffset: 2500, keyboard: false });
        const disableButtonText = isDisabled ? "Activer" : "Désactiver";
        const disableButtonClass = isDisabled ? "enable-btn" : "disable-btn";
        const waterButtonText = isWater ? "RETARDANT" : "EAU";
        const waterButtonClass = isWater ? "water-btn water-btn-retardant" : "water-btn";
        const isBase = selectedBaseOACI === airport.oaci;
        const baseButtonText = isBase ? 'BASE ✓' : 'BASE';
        const baseButtonClass = isBase ? 'base-btn base-btn-active' : 'base-btn';
        const popupHtml = `<div class="airport-popup"><b>${airport.oaci}</b><br>${airport.name}<div class="popup-buttons"><button class="${waterButtonClass}" onclick="window.toggleWater('${airport.oaci}')">${waterButtonText}</button><button class="${disableButtonClass}" onclick="window.toggleAirport('${airport.oaci}')">${disableButtonText}</button><button class="${baseButtonClass}" onclick="window.setBaseAirport('${airport.oaci}')">${baseButtonText}</button></div>${buildPelicPdfButtonsHtml(airport.oaci)}</div>`;
        marker.bindPopup(popupHtml);
        marker.addTo(permanentAirportLayer);
        addAirportTouchHitbox(airport, popupHtml);
    });
}


function getDepartmentBoundaryStyle() {
    const zoom = map && Number.isFinite(map.getZoom()) ? map.getZoom() : 6;

    let weight = 1.2;
    let opacity = 0.8;

    if (zoom >= 7) {
        weight = 1.8;
        opacity = 0.9;
    }

    if (zoom >= 9) {
        weight = 2.8;
        opacity = 0.95;
    }

    if (zoom >= 11) {
        weight = 4.0;
        opacity = 1;
    }

    return {
        color: '#000000',
        weight,
        opacity,
        fillColor: '#ffffff',
        fillOpacity: 0.02,
        pane: 'overlayPane'
    };
}

function buildDepartmentCodeIcon(depCode) {
    const zoom = map && Number.isFinite(map.getZoom()) ? map.getZoom() : 6;

    let fontSize = 13;
    let padding = '2px 5px';
    let borderWidth = 2;

    if (zoom >= 7) {
        fontSize = 15;
        padding = '3px 6px';
        borderWidth = 2;
    }

    if (zoom >= 9) {
        fontSize = 18;
        padding = '4px 8px';
        borderWidth = 3;
    }

    if (zoom >= 11) {
        fontSize = 22;
        padding = '5px 10px';
        borderWidth = 3;
    }

    return L.divIcon({
        className: 'department-code-label',
        html: `<span style="
            display:inline-block;
            min-width:24px;
            padding:${padding};
            border:${borderWidth}px solid #000;
            border-radius:8px;
            background:rgba(255,255,255,.92);
            color:#000;
            font-size:${fontSize}px;
            font-weight:900;
            line-height:1;
            text-align:center;
            text-shadow:
                -1px -1px 0 #fff,
                1px -1px 0 #fff,
                -1px 1px 0 #fff,
                1px 1px 0 #fff;
            box-shadow:0 1px 5px rgba(0,0,0,.45);
            white-space:nowrap;
        ">${escapeHtml(depCode)}</span>`,
        iconSize: [1, 1],
        iconAnchor: [0, 0]
    });
}

function updateDepartmentsLayerAppearance() {
    if (!map || !hasLoadedDepartments) return;

    const style = getDepartmentBoundaryStyle();

    if (departmentsLayerGroup) {
        departmentsLayerGroup.eachLayer((layer) => {
            if (layer && typeof layer.setStyle === 'function') {
                layer.setStyle(style);
            }
        });
    }

    if (departmentsLabelsLayer) {
        departmentsLabelsLayer.eachLayer((marker) => {
            const depCode = marker?.options?.depCode;
            if (depCode && typeof marker.setIcon === 'function') {
                marker.setIcon(buildDepartmentCodeIcon(depCode));
            }
        });
    }
}

async function loadDepartmentsLayerData() {
    if (hasLoadedDepartments) return;

    const DEPARTMENTS_GEOJSON_URL = 'https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/latest/geojson/departements-1000m.geojson';
    const DEPARTMENTS_CACHE_NAME = 'npf-q400-departments-v13-54';
    let response = null;

    /*
     * v12.38 — consolidation offline :
     * - on tente d'abord le cache applicatif/Cache Storage ;
     * - si absent, on télécharge et on stocke explicitement ;
     * - si hors ligne et jamais préchargé, le calque reste impossible.
     */
    try {
        if ('caches' in window) {
            const cached = await caches.match(DEPARTMENTS_GEOJSON_URL, { ignoreSearch: true });
            if (cached && cached.ok) {
                response = cached;
            }
        }
    } catch (_) {}

    if (!response) {
        response = await fetch(DEPARTMENTS_GEOJSON_URL, { cache: 'force-cache' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        try {
            if ('caches' in window) {
                const cache = await caches.open(DEPARTMENTS_CACHE_NAME);
                await cache.put(DEPARTMENTS_GEOJSON_URL, response.clone());
            }
        } catch (cacheError) {
            console.warn('Cache départements impossible:', cacheError);
        }
    }

    const departmentsGeojson = await response.json();
    departmentsPolygonData = buildDepartmentPolygonIndex(departmentsGeojson);

    if (departmentsLayerGroup && typeof departmentsLayerGroup.clearLayers === 'function') {
        departmentsLayerGroup.clearLayers();
    }
    if (departmentsLabelsLayer && typeof departmentsLabelsLayer.clearLayers === 'function') {
        departmentsLabelsLayer.clearLayers();
    }

    const geoJsonLayer = L.geoJSON(departmentsGeojson, {
        style: getDepartmentBoundaryStyle
    });

    geoJsonLayer.eachLayer((layer) => {
        departmentsLayerGroup.addLayer(layer);
        const properties = layer.feature?.properties || {};
        const depCode = properties.code || properties.code_departement || properties.dep_code || '';
        if (!depCode || !layer.getBounds) return;
        const center = layer.getBounds().getCenter();
        departmentsLabelsLayer.addLayer(L.marker(center, {
            icon: buildDepartmentCodeIcon(depCode),
            interactive: false,
            keyboard: false,
            depCode
        }));
    });

    hasLoadedDepartments = true;
    updateDepartmentsLayerAppearance();
}

function ensureDepartmentsLayerDataLoaded() {
    if (hasLoadedDepartments) return Promise.resolve();
    if (departmentsLayerLoadPromise) return departmentsLayerLoadPromise;

    departmentsLayerLoadPromise = loadDepartmentsLayerData()
        .catch((error) => {
            departmentsLayerLoadPromise = null;
            throw error;
        });

    return departmentsLayerLoadPromise;
}

async function toggleDepartmentsLayer(shouldShow) {
    const departmentsLayerButton = document.getElementById('departments-layer-button');

    if (shouldShow && !hasLoadedDepartments) {
        try {
            await ensureDepartmentsLayerDataLoaded();
        } catch (error) {
            console.error('Erreur de chargement du calque départements:', error);
            alert("Impossible de générer le calque des départements. Si l'appareil est hors ligne, il faut que le calque ait été préchargé au moins une fois après la mise à jour.");
            areDepartmentsVisible = false;
            localStorage.setItem(SHOW_DEPARTMENTS_LAYER_KEY, 'false');
            if (departmentsLayerButton) departmentsLayerButton.classList.remove('active');
            return;
        }
    }

    areDepartmentsVisible = shouldShow;

    if (areDepartmentsVisible) {
        departmentsLayerGroup.addTo(map);
        departmentsLabelsLayer.addTo(map);
        updateDepartmentsLayerAppearance();
    } else {
        map.removeLayer(departmentsLayerGroup);
        map.removeLayer(departmentsLabelsLayer);
    }

    localStorage.setItem(SHOW_DEPARTMENTS_LAYER_KEY, String(areDepartmentsVisible));
    if (departmentsLayerButton) departmentsLayerButton.classList.toggle('active', areDepartmentsVisible);
}

function getCommunesBoundaryStyle() {
    const zoom = map && Number.isFinite(map.getZoom()) ? map.getZoom() : 8;

    /*
     * Contours communes renforcés :
     * - plus visibles sur fond OSM/OACI ;
     * - restent moins épais que les limites départementales.
     */
    let weight = 0.9;
    let opacity = 0.72;

    if (zoom >= 10.5) {
        weight = 1.15;
        opacity = 0.82;
    }

    if (zoom >= 12) {
        weight = 1.65;
        opacity = 0.92;
    }

    if (zoom >= 14) {
        weight = 2.15;
        opacity = 1;
    }

    return {
        color: '#111111',
        weight,
        opacity,
        fillColor: '#ffffff',
        fillOpacity: 0,
        pane: 'overlayPane'
    };
}


function buildCommuneNameIcon(communeName) {
    const zoom = map && Number.isFinite(map.getZoom()) ? map.getZoom() : 12;

    /*
     * Tailles strictement inchangées :
     * 10 px, 11 px à partir du zoom 13, 12 px à partir du zoom 15.
     */
    let fontSize = 10;
    let maxWidth = 120;

    if (zoom >= 13) {
        fontSize = 11;
        maxWidth = 150;
    }

    if (zoom >= 15) {
        fontSize = 12;
        maxWidth = 180;
    }

    return L.divIcon({
        className: 'commune-name-label',
        html: `<span style="
            display:inline-block;
            max-width:${maxWidth}px;
            overflow:hidden;
            text-overflow:ellipsis;
            padding:1px 4px;
            border-radius:6px;
            background:rgba(255,255,255,.90);
            color:#050505;
            font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Arial,sans-serif;
            font-size:${fontSize}px;
            font-weight:700;
            font-synthesis:none;
            font-kerning:normal;
            letter-spacing:0;
            line-height:1.05;
            text-align:center;
            text-rendering:optimizeLegibility;
            -webkit-font-smoothing:auto;
            -webkit-text-stroke:0 transparent;
            text-shadow:none;
            box-shadow:
                inset 0 0 0 1px rgba(255,255,255,.95),
                0 1px 2px rgba(0,0,0,.22);
            white-space:nowrap;
        ">${escapeHtml(communeName)}</span>`,
        iconSize: [1, 1],
        iconAnchor: [0, 0]
    });
}

function updateCommunesLayerAppearance() {
    if (!map || !hasLoadedCommunes) return;

    const zoom = map.getZoom();
    const shouldDrawCommunes = areCommunesVisible && zoom >= COMMUNES_DISPLAY_MIN_ZOOM;

    /*
     * Calque Communes :
     * - sous COMMUNES_DISPLAY_MIN_ZOOM : aucun contour / aucun nom ;
     * - à partir du seuil : contours + noms.
     */
    if (!shouldDrawCommunes) {
        communesLabelsLayer.clearLayers();

        if (map.hasLayer(communesLabelsLayer)) {
            map.removeLayer(communesLabelsLayer);
        }

        if (map.hasLayer(communesLayerGroup)) {
            map.removeLayer(communesLayerGroup);
        }

        updateOfflineStatus();
        return;
    }

    if (!map.hasLayer(communesLayerGroup)) {
        communesLayerGroup.addTo(map);
    }

    if (!map.hasLayer(communesLabelsLayer)) {
        communesLabelsLayer.addTo(map);
    }

    renderVisibleCommuneLayers();
    renderVisibleCommuneLabels();
}


function renderVisibleCommuneLayers() {
    if (!map || !communesLayerGroup || !areCommunesVisible || !hasLoadedCommunes) return;

    communesLayerGroup.clearLayers();

    const zoom = map.getZoom();
    if (zoom < COMMUNES_DISPLAY_MIN_ZOOM) return;

    const viewportBounds = map.getBounds().pad(0.08);
    const style = getCommunesBoundaryStyle();
    let visibleCount = 0;

    for (const item of communesViewportLayerData) {
        if (!item || !item.layer || !item.bounds) continue;
        if (!viewportBounds.intersects(item.bounds)) continue;

        if (typeof item.layer.setStyle === 'function') {
            item.layer.setStyle(style);
        }

        communesLayerGroup.addLayer(item.layer);
        visibleCount += 1;
    }

    updateOfflineStatus();
}



function normalizeCommuneLabelKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function hydrateCommunesPopulationMap(entries) {
    const nextMap = new Map();

    for (const entry of Array.isArray(entries) ? entries : []) {
        const code = String(Array.isArray(entry) ? entry[0] : entry?.code || '').trim();
        const population = Number(Array.isArray(entry) ? entry[1] : entry?.population);

        if (!code || !Number.isFinite(population) || population < 0) continue;
        nextMap.set(code, population);
    }

    if (nextMap.size) communesPopulationByInsee = nextMap;
    return communesPopulationByInsee;
}

function readCachedCommunesPopulation() {
    try {
        const raw = localStorage.getItem(COMMUNES_POPULATION_CACHE_KEY);
        if (!raw) return false;

        const cached = JSON.parse(raw);
        const savedAt = Number(cached?.savedAt || 0);
        const entries = Array.isArray(cached?.entries) ? cached.entries : [];

        hydrateCommunesPopulationMap(entries);
        return communesPopulationByInsee.size > 0
            && savedAt > 0
            && (Date.now() - savedAt) <= COMMUNES_POPULATION_CACHE_MAX_AGE_MS;
    } catch (_) {
        return false;
    }
}

function applyPopulationToCommuneLabels() {
    for (const item of communesLabelData) {
        if (!item) continue;
        const population = item.inseeCode
            ? Number(communesPopulationByInsee.get(item.inseeCode))
            : NaN;

        if (Number.isFinite(population) && population >= 0) {
            item.population = population;
        }
    }
}

async function loadCommunesPopulationIndex() {
    if (communesPopulationLoadPromise) return communesPopulationLoadPromise;

    const cacheIsFresh = readCachedCommunesPopulation();

    communesPopulationLoadPromise = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6500);

        try {
            const response = await fetch(COMMUNES_POPULATION_API_URL, {
                cache: cacheIsFresh ? 'force-cache' : 'default',
                signal: controller.signal
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const entries = [];

            for (const commune of Array.isArray(data) ? data : []) {
                const code = String(commune?.code || '').trim();
                const population = Number(commune?.population);
                if (!code || !Number.isFinite(population) || population < 0) continue;
                entries.push([code, population]);
            }

            hydrateCommunesPopulationMap(entries);

            try {
                localStorage.setItem(COMMUNES_POPULATION_CACHE_KEY, JSON.stringify({
                    savedAt: Date.now(),
                    entries
                }));
            } catch (_) {}
        } catch (error) {
            console.warn('[Communes] Population indisponible, classement de secours conservé :', error);
        } finally {
            clearTimeout(timeoutId);
        }

        applyPopulationToCommuneLabels();

        if (areCommunesVisible && hasLoadedCommunes) {
            renderVisibleCommuneLabels();
        }

        return communesPopulationByInsee;
    })();

    return communesPopulationLoadPromise;
}

function isCurrentCommuneLabel(item) {
    if (!item || !currentCommune) return false;

    const itemCode = String(item.inseeCode || '');
    const currentCode = String(getCommuneInseeCodeFromProperties(currentCommune) || '');
    if (itemCode && currentCode && itemCode === currentCode) return true;

    const currentName = currentCommune.nom_standard
        || currentCommune.nom
        || currentCommune.name
        || currentCommune.libelle
        || '';

    return normalizeCommuneLabelKey(item.name) === normalizeCommuneLabelKey(currentName);
}

function getCommuneLabelDistanceToCenter(item, center) {
    if (!item?.latLng || !center) return Number.POSITIVE_INFINITY;
    const latDiff = Number(item.latLng.lat) - Number(center.lat);
    const lngDiff = Number(item.latLng.lng) - Number(center.lng);
    return (latDiff * latDiff) + (lngDiff * lngDiff);
}

function renderVisibleCommuneLabels() {
    if (!map || !communesLabelsLayer || !areCommunesVisible || !hasLoadedCommunes) return;

    communesLabelsLayer.clearLayers();

    const zoom = map.getZoom();
    if (zoom < COMMUNES_DISPLAY_MIN_ZOOM) return;

    const bounds = map.getBounds().pad(0.05);
    const center = map.getCenter();
    const maxLabels = zoom >= 14 ? 450 : 220;

    /*
     * Priorité :
     * 1. commune sélectionnée ;
     * 2. population décroissante ;
     * 3. proximité du centre à population égale ou inconnue.
     */
    const visibleItems = communesLabelData
        .filter(item => item?.latLng && bounds.contains(item.latLng))
        .sort((a, b) => {
            const selectedDifference = Number(isCurrentCommuneLabel(b)) - Number(isCurrentCommuneLabel(a));
            if (selectedDifference) return selectedDifference;

            const populationA = Number.isFinite(Number(a.population)) ? Number(a.population) : 0;
            const populationB = Number.isFinite(Number(b.population)) ? Number(b.population) : 0;
            if (populationA !== populationB) return populationB - populationA;

            return getCommuneLabelDistanceToCenter(a, center)
                - getCommuneLabelDistanceToCenter(b, center);
        })
        .slice(0, maxLabels);

    for (const item of visibleItems) {
        communesLabelsLayer.addLayer(L.marker(item.latLng, {
            icon: buildCommuneNameIcon(item.name),
            interactive: false,
            keyboard: false
        }));
    }
}



function simplifyCommuneDisplayName(name) {
    return String(name || '')
        .replace(/\s+Arrondissement$/i, '')
        .replace(/\s+arrondissement$/i, '')
        .trim();
}

function getCommuneNameFromProperties(properties = {}) {
    const rawName = properties.nom || properties.nom_commune || properties.name || properties.libelle || properties.nom_standard || '';
    return simplifyCommuneDisplayName(rawName);
}

/*
 * v13.29 — commune survolée : l'identification du département ne doit plus
 * dépendre d'une recherche par nom. Les communes homonymes comme Mérignac
 * existent dans plusieurs départements ; on utilise donc le code INSEE du
 * polygone Etalab quand il est disponible.
 */
function getCommuneInseeCodeFromProperties(properties = {}) {
    const directCandidates = [
        properties.code,
        properties.code_insee,
        properties.codeInsee,
        properties.insee,
        properties.insee_code,
        properties.code_commune,
        properties.codeCommune
    ];

    for (const candidate of directCandidates) {
        const value = candidate === undefined || candidate === null ? '' : String(candidate).trim().toUpperCase();
        if (/^(?:\d{5}|2[AB]\d{3})$/.test(value)) return value;
    }

    return '';
}

function getCommuneDepCodeFromProperties(properties = {}) {
    const directDep = properties.code_departement || properties.dep_code || properties.dep || properties.codeDepartement || '';
    const normalizedDirectDep = normalizeDepartmentCode(directDep);
    if (normalizedDirectDep) return normalizedDirectDep;

    return deriveDepartmentCodeFromInsee(getCommuneInseeCodeFromProperties(properties));
}

/*
 * v13.30 — commune survolée : le département affiché est calculé à partir
 * du calque départements au même point GPS. Le nom vient du calque communes,
 * le département vient du calque départements ; le code INSEE reste un secours.
 */
function getDepartmentCodeFromProperties(properties = {}) {
    const directCandidates = [
        properties.code,
        properties.code_departement,
        properties.dep_code,
        properties.dep,
        properties.codeDepartement,
        properties.num_dep,
        properties.numero
    ];

    for (const candidate of directCandidates) {
        const value = normalizeDepartmentCode(candidate);
        if (value) return value;
    }

    return '';
}

function getDepartmentNameFromProperties(properties = {}) {
    return String(properties.nom || properties.nom_departement || properties.name || properties.libelle || properties.dep_nom || '').trim();
}

function buildDepartmentPolygonIndex(departmentsGeojson) {
    const features = Array.isArray(departmentsGeojson?.features) ? departmentsGeojson.features : [];
    const index = [];

    features.forEach((feature) => {
        const properties = feature.properties || {};
        const depCode = getDepartmentCodeFromProperties(properties);
        if (!depCode) return;

        const rings = coordinatesToRings(feature.geometry);
        const bounds = getGeometryBoundsFromRings(rings);
        if (!bounds) return;

        index.push({
            depCode,
            depName: getDepartmentNameFromProperties(properties),
            rings,
            bounds
        });
    });

    return index;
}

function findDepartmentContainingPoint(lat, lon) {
    if (!Array.isArray(departmentsPolygonData) || !departmentsPolygonData.length) return null;

    const numericLat = Number(lat);
    const numericLon = Number(lon);
    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLon)) return null;

    for (const department of departmentsPolygonData) {
        const bounds = department.bounds;
        if (!bounds) continue;

        if (
            numericLat < bounds.minLat
            || numericLat > bounds.maxLat
            || numericLon < bounds.minLon
            || numericLon > bounds.maxLon
        ) {
            continue;
        }

        if (isPointInPolygonRings(numericLat, numericLon, department.rings)) {
            return {
                dep_code: department.depCode,
                dep_nom: department.depName || ''
            };
        }
    }

    return null;
}

function coordinatesToRings(geometry) {
    if (!geometry || !geometry.type || !Array.isArray(geometry.coordinates)) return [];

    if (geometry.type === 'Polygon') {
        return geometry.coordinates;
    }

    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.flat();
    }

    return [];
}

function getGeometryBoundsFromRings(rings) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;

    rings.forEach((ring) => {
        if (!Array.isArray(ring)) return;
        ring.forEach((coord) => {
            if (!Array.isArray(coord) || coord.length < 2) return;
            const lon = Number(coord[0]);
            const lat = Number(coord[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLon = Math.min(minLon, lon);
            maxLon = Math.max(maxLon, lon);
        });
    });

    if (!Number.isFinite(minLat) || !Number.isFinite(minLon)) return null;

    return { minLat, maxLat, minLon, maxLon };
}

function isPointInRing(lat, lon, ring) {
    if (!Array.isArray(ring) || ring.length < 3) return false;

    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = Number(ring[i][0]);
        const yi = Number(ring[i][1]);
        const xj = Number(ring[j][0]);
        const yj = Number(ring[j][1]);

        if (!Number.isFinite(xi) || !Number.isFinite(yi) || !Number.isFinite(xj) || !Number.isFinite(yj)) {
            continue;
        }

        const intersects = ((yi > lat) !== (yj > lat))
            && (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);

        if (intersects) inside = !inside;
    }

    return inside;
}

function isPointInPolygonRings(lat, lon, rings) {
    if (!Array.isArray(rings) || !rings.length) return false;

    /*
     * Convention GeoJSON :
     * - premier anneau = contour extérieur ;
     * - anneaux suivants = trous éventuels.
     */
    if (!isPointInRing(lat, lon, rings[0])) return false;

    for (let i = 1; i < rings.length; i += 1) {
        if (isPointInRing(lat, lon, rings[i])) return false;
    }

    return true;
}

function buildCommunePolygonIndex(communesGeojson) {
    const features = Array.isArray(communesGeojson?.features) ? communesGeojson.features : [];
    const index = [];

    features.forEach((feature) => {
        const properties = feature.properties || {};
        const name = getCommuneNameFromProperties(properties);
        if (!name) return;

        const rings = coordinatesToRings(feature.geometry);
        const bounds = getGeometryBoundsFromRings(rings);
        if (!bounds) return;

        const codeInsee = getCommuneInseeCodeFromProperties(properties);

        index.push({
            name,
            codeInsee,
            depCode: getCommuneDepCodeFromProperties(properties),
            rings,
            bounds
        });
    });

    return index;
}

function findCommuneContainingPoint(lat, lon) {
    if (!Array.isArray(communesPolygonData) || !communesPolygonData.length) return null;

    for (const commune of communesPolygonData) {
        const bounds = commune.bounds;
        if (!bounds) continue;

        if (
            lat < bounds.minLat
            || lat > bounds.maxLat
            || lon < bounds.minLon
            || lon > bounds.maxLon
        ) {
            continue;
        }

        if (isPointInPolygonRings(lat, lon, commune.rings)) {
            const departmentAtPoint = findDepartmentContainingPoint(lat, lon);
            return {
                nom_standard: commune.name,
                dep_code: departmentAtPoint?.dep_code || commune.depCode || deriveDepartmentCodeFromInsee(commune.codeInsee) || '',
                dep_nom: departmentAtPoint?.dep_nom || '',
                code_insee: commune.codeInsee || ''
            };
        }
    }

    return null;
}

function ensureCommunesLayerDataLoaded() {
    if (hasLoadedCommunes) return Promise.resolve();
    if (communesLayerLoadPromise) return communesLayerLoadPromise;

    communesLayerLoadPromise = loadCommunesLayerData()
        .catch((error) => {
            communesLayerLoadPromise = null;
            throw error;
        });

    return communesLayerLoadPromise;
}


function isTouchTabletForCommunesLayer() {
    const ua = navigator.userAgent || '';
    const isIPadClassic = /iPad/i.test(ua);
    const isIPadDesktopUA = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
    const isTouchLargeScreen = navigator.maxTouchPoints > 1 && Math.min(window.innerWidth, window.innerHeight) >= 700;

    return isIPadClassic || isIPadDesktopUA || isTouchLargeScreen;
}

function getCommunesGeojsonUrl() {
    /*
     * Sur PC, le 50 m fonctionne.
     * Sur iPad, le 50 m peut être trop lourd à charger/parser et l'app retombe
     * alors sur l'ancien calcul par centre-ville.
     *
     * On utilise donc 1000 m sur iPad/tablette : beaucoup plus léger, suffisant
     * pour identifier la commune/arrondissement sous le point GPS dans l'immense
     * majorité des cas.
     */
    const precision = isTouchTabletForCommunesLayer() ? '100m' : '50m';
    return {
        precision,
        url: `https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/latest/geojson/communes-${precision}.geojson`
    };
}

async function loadCommunesLayerData() {
    if (hasLoadedCommunes) return;

    // Chargement en parallèle : la population ne bloque pas la carte.
    loadCommunesPopulationIndex().catch(() => null);

    const communesSource = getCommunesGeojsonUrl();
    const COMMUNES_GEOJSON_URL = communesSource.url;

    updateOfflineStatus();

    if (!communesLayerLoadController) {
        communesLayerLoadController = new AbortController();
    }

    const response = await fetch(COMMUNES_GEOJSON_URL, {
        cache: 'force-cache',
        signal: communesLayerLoadController.signal
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const communesGeojson = await response.json();

    communesPolygonData = buildCommunePolygonIndex(communesGeojson);
    communesLabelData = [];
    communesViewportLayerData = [];
    communesLayerGroup.clearLayers();
    communesLabelsLayer.clearLayers();

    const geoJsonLayer = L.geoJSON(communesGeojson, {
        style: getCommunesBoundaryStyle
    });

    geoJsonLayer.eachLayer((layer) => {
        const properties = layer.feature?.properties || {};
        const communeName = getCommuneNameFromProperties(properties);
        if (!communeName || !layer.getBounds) return;

        const layerBounds = layer.getBounds();
        communesViewportLayerData.push({
            layer,
            bounds: layerBounds
        });

        const center = layerBounds.getCenter();
        const inseeCode = getCommuneInseeCodeFromProperties(properties);
        const directPopulationCandidates = [
            properties.population,
            properties.population_municipale,
            properties.populationMunicipale,
            properties.pop
        ];
        const directPopulation = directPopulationCandidates
            .map(value => Number(value))
            .find(value => Number.isFinite(value) && value >= 0);
        const indexedPopulation = inseeCode
            ? Number(communesPopulationByInsee.get(String(inseeCode)))
            : NaN;

        communesLabelData.push({
            name: communeName,
            inseeCode: String(inseeCode || ''),
            latLng: center,
            population: Number.isFinite(indexedPopulation)
                ? indexedPopulation
                : (Number.isFinite(directPopulation) ? directPopulation : 0)
        });
    });

    hasLoadedCommunes = true;
    updateCommunesLayerAppearance();

    updateOfflineStatus();
}

async function toggleCommunesLayer(shouldShow) {
    const communesLayerButton = document.getElementById('communes-layer-button');

    if (shouldShow && !hasLoadedCommunes) {
        try {
            await loadCommunesLayerData();
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.error('Erreur de chargement du calque communes:', error);
            alert("Impossible de générer le calque des communes.");
            areCommunesVisible = false;
            localStorage.setItem(SHOW_COMMUNES_LAYER_KEY, 'false');
            if (communesLayerButton) communesLayerButton.classList.remove('active');
            return;
        }
    }

    areCommunesVisible = shouldShow;

    if (areCommunesVisible) {
        updateCommunesLayerAppearance();
    } else {
        if (map.hasLayer(communesLayerGroup)) map.removeLayer(communesLayerGroup);
        if (map.hasLayer(communesLabelsLayer)) map.removeLayer(communesLabelsLayer);
    }

    localStorage.setItem(SHOW_COMMUNES_LAYER_KEY, String(areCommunesVisible));
    if (communesLayerButton) communesLayerButton.classList.toggle('active', areCommunesVisible);
}

const loadState = () => {
    const savedDisabled = localStorage.getItem('disabled_airports');
    if (savedDisabled) disabledAirports = new Set(JSON.parse(savedDisabled));
    const savedWater = localStorage.getItem('water_airports');
    if (savedWater) waterAirports = new Set(JSON.parse(savedWater));
    const savedCustomPelic = localStorage.getItem('custom_pelican_airports');
    if (savedCustomPelic) customPelicanAirports = new Set(JSON.parse(savedCustomPelic));
    const savedBase = localStorage.getItem('selected_base_oaci');
    if (savedBase && getAirportByOaci(savedBase)) {
        selectedBaseOACI = savedBase;
    }
};
const saveState = () => {
    localStorage.setItem('disabled_airports', JSON.stringify([...disabledAirports]));
    localStorage.setItem('water_airports', JSON.stringify([...waterAirports]));
    localStorage.setItem('selected_base_oaci', selectedBaseOACI);
    localStorage.setItem('custom_pelican_airports', JSON.stringify([...customPelicanAirports]));
};
window.toggleAirport = oaci => { disabledAirports.has(oaci) ? disabledAirports.delete(oaci) : (disabledAirports.add(oaci), waterAirports.delete(oaci)), saveState(), refreshUI() };
window.toggleWater = oaci => { waterAirports.has(oaci) ? waterAirports.delete(oaci) : (waterAirports.add(oaci), disabledAirports.delete(oaci)), saveState(), refreshUI() };
window.toggleCustomPelican = oaci => {
    const normalizedOaci = normalizeOaciCodeInput(oaci);
    if (!normalizedOaci || !getAirportByOaci(normalizedOaci)) return;

    if (customPelicanAirports.has(normalizedOaci)) {
        customPelicanAirports.delete(normalizedOaci);
        waterAirports.delete(normalizedOaci);
        disabledAirports.delete(normalizedOaci);
        if (selectedPelicanOACI === normalizedOaci) selectedPelicanOACI = null;
    } else {
        customPelicanAirports.add(normalizedOaci);
        disabledAirports.delete(normalizedOaci);
        selectedPelicanOACI = normalizedOaci;
    }
    saveState();
    refreshUI();
    if (map) map.closePopup();
};
window.setBaseAirport = oaci => {
    const normalizedOaci = normalizeOaciCodeInput(oaci);
    if (!getAirportByOaci(normalizedOaci)) return;
    selectedBaseOACI = normalizedOaci;
    saveState();
    updateBaseLabels();
    updateCalculatorData();
    if (typeof window.updateBaseSunsetDisplay === 'function') {
        window.updateBaseSunsetDisplay();
    }
    refreshUI();
    if (map) map.closePopup();
};


function getStoredGpsPosition() {
    try {
        const raw = localStorage.getItem(LAST_GPS_POSITION_KEY);
        const parsed = JSON.parse(raw || 'null');
        if (!parsed) return null;
        const lat = Number(parsed.lat);
        const lng = Number(parsed.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng, timestamp: Number(parsed.timestamp) || 0 };
    } catch (_) {
        return null;
    }
}

function saveStoredGpsPosition(lat, lng, timestamp = Date.now()) {
    try {
        localStorage.setItem(LAST_GPS_POSITION_KEY, JSON.stringify({ lat, lng, timestamp }));
    } catch (_) {}
}

function getStartupGpsCenterZoom() {
    if (!map) return STARTUP_GPS_CENTER_ZOOM;

    const minZoom = typeof map.getMinZoom === 'function' ? map.getMinZoom() : GLOBAL_MIN_ZOOM;
    const maxZoom = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : GLOBAL_MAX_ZOOM;

    return Math.max(
        minZoom,
        Math.min(maxZoom, STARTUP_GPS_CENTER_ZOOM)
    );
}


function fitMapToStartupFireContext({ reason = 'startup-fire-context' } = {}) {
    /*
     * v13.41 — ouverture avec feu sélectionné : la carte doit afficher dans la
     * même vue la position avion connue, le feu actif et les pélicandromes
     * affichés/sélectionnés. On l'utilise uniquement comme cadrage de démarrage,
     * sans activer le suivi GPS.
     */
    if (!map || !currentCommune) return false;

    const fireLat = Number(currentCommune.latitude_mairie);
    const fireLon = Number(currentCommune.longitude_mairie);
    if (!Number.isFinite(fireLat) || !Number.isFinite(fireLon)) return false;

    const points = [[fireLat, fireLon]];
    const seen = new Set();
    const addPoint = (lat, lon) => {
        const numericLat = Number(lat);
        const numericLon = Number(lon);
        if (!Number.isFinite(numericLat) || !Number.isFinite(numericLon)) return;
        const key = `${numericLat.toFixed(5)},${numericLon.toFixed(5)}`;
        if (seen.has(key)) return;
        seen.add(key);
        points.push([numericLat, numericLon]);
    };

    const gpsPos = getKnownGpsLatLngForCentering();
    if (gpsPos) addPoint(gpsPos.lat, gpsPos.lng);

    try {
        const countInput = document.getElementById('airport-count');
        const count = Number.parseInt(countInput?.value || '0', 10);
        const closest = Number.isFinite(count) && count > 0 ? getClosestAirports(fireLat, fireLon, count) : [];
        closest.forEach(ap => addPoint(ap.lat, ap.lon));
    } catch (_) {}

    try {
        const selectedPelic = selectedPelicanOACI ? getAirportByOaci(selectedPelicanOACI) : null;
        if (selectedPelic) addPoint(selectedPelic.lat, selectedPelic.lon);
    } catch (_) {}

    if (!points.length) return false;

    centerGpsFollowProgrammaticMove = true;
    try {
        if (points.length === 1) {
            map.setView(points[0], Math.min(Math.max(getStartupGpsCenterZoom(), 9), 11), { animate: false });
        } else {
            map.fitBounds(L.latLngBounds(points).pad(0.25), {
                animate: false,
                padding: [34, 34],
                maxZoom: 11
            });
        }
    } finally {
        setTimeout(() => {
            centerGpsFollowProgrammaticMove = false;
        }, 350);
    }
    return true;
}

function applyStartupGpsAutoCenter(lat, lng, { source = 'real', force = false } = {}) {
    /*
     * v12.54 — ouverture centrée GPS.
     * Objectif : ouvrir la carte sur la position GPS avec un zoom large,
     * sans suivre ensuite l'utilisateur en permanence.
     * - position stockée : recentrage provisoire rapide ;
     * - position GPS réelle : recentrage prioritaire une seule fois au lancement.
     */
    if (!map) return false;

    const numericLat = Number(lat);
    const numericLng = Number(lng);
    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) return false;

    const isRealPosition = source !== 'stored';

    if (isRealPosition) {
        if (startupGpsAutoCenteredWithRealPosition && !force) return false;
        startupGpsAutoCenteredWithRealPosition = true;
    } else {
        if (startupGpsAutoCenteredWithRealPosition) return false;
        if (startupGpsStoredCenterAppliedAt && !force) return false;
        startupGpsStoredCenterAppliedAt = Date.now();
    }

    if (currentCommune && fitMapToStartupFireContext({ reason: `startup-${source}` })) {
        return true;
    }

    map.setView([numericLat, numericLng], getStartupGpsCenterZoom(), { animate: false });
    return true;
}

function applyStoredGpsStartupCenter({ force = false } = {}) {
    const stored = getStoredGpsPosition();
    if (!stored) return false;
    return applyStartupGpsAutoCenter(stored.lat, stored.lng, { source: 'stored', force });
}

function centerMapOnGpsOverviewAfterClear() {
    /*
     * v12.58 — fermeture du bandeau feu conservée.
     * Le bouton X ne doit plus renvoyer sur une vue France dézoomée.
     * On reprend la logique d'ouverture : position GPS connue, zoom large 10,
     * puis correction par GPS réel si disponible.
     */
    if (!map) return;

    const zoom = getStartupGpsCenterZoom();

    const centerOn = (lat, lng) => {
        const numericLat = Number(lat);
        const numericLng = Number(lng);
        if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) return false;
        map.setView([numericLat, numericLng], zoom, { animate: false });
        return true;
    };

    let centered = false;

    try {
        if (userMarker && typeof userMarker.getLatLng === 'function') {
            const latlng = userMarker.getLatLng();
            centered = centerOn(latlng.lat, latlng.lng);
        }
    } catch (_) {}

    if (!centered && lastPosition) {
        centered = centerOn(lastPosition.lat, lastPosition.lng);
    }

    if (!centered) {
        const stored = getStoredGpsPosition();
        if (stored) centered = centerOn(stored.lat, stored.lng);
    }

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            updateUserPosition(pos);
            const { latitude, longitude } = pos.coords || {};
            centerOn(latitude, longitude);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 600000 }
    );
}

function primeGpsFromStoredPosition() {
    if (userMarker || !map) return false;
    const stored = getStoredGpsPosition();
    if (!stored) return false;

    const fakePosition = {
        coords: {
            latitude: stored.lat,
            longitude: stored.lng,
            altitude: null,
            heading: null,
            speed: null,
            accuracy: null
        },
        timestamp: stored.timestamp || Date.now(),
        npfIsStoredPosition: true
    };

    updateUserPosition(fakePosition);
    return true;
}

function requestOneShotGps({ silent = true, highAccuracy = true, timeout = 30000, maximumAge = 600000 } = {}) {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
        updateUserPosition,
        (error) => {
            console.warn('GPS ponctuel indisponible:', error);
            primeGpsFromStoredPosition();
            if (!silent) alert("Impossible d'obtenir la position GPS. Vérifiez les autorisations.");
        },
        { enableHighAccuracy: highAccuracy, timeout, maximumAge }
    );
}

function restartLiveGpsWatch({ silent = true } = {}) {
    if (!navigator.geolocation) {
        if (!silent) alert("La géolocalisation n'est pas supportée.");
        return;
    }

    const liveGpsButton = document.getElementById('live-gps-button');

    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    primeGpsFromStoredPosition();

    watchId = navigator.geolocation.watchPosition(
        updateUserPosition,
        (error) => {
            console.warn('Erreur de suivi GPS:', error);
            primeGpsFromStoredPosition();

            /*
             * v11.61 — après longue période sans réseau, Safari/Android peut rendre
             * une erreur temporaire. On ne coupe plus le mode GPS : on relance
             * une demande ponctuelle puis le watchPosition continue dès que possible.
             */
            setTimeout(() => requestOneShotGps({ silent: true, timeout: 30000, maximumAge: 600000 }), 2000);
        },
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 600000 }
    );

    if (liveGpsButton) liveGpsButton.classList.add('active');
    localStorage.setItem('liveGpsActive', 'true');
}

function setupGpsResumeHandlers() {
    const resumeGps = () => {
        if (typeof refreshNearestCommuneDisplayFromKnownGps === 'function') {
            refreshNearestCommuneDisplayFromKnownGps();
        }
        if (localStorage.getItem('liveGpsActive') === 'true') {
            restartLiveGpsWatch({ silent: true });
        } else {
            requestOneShotGps({ silent: true, highAccuracy: true, timeout: 30000, maximumAge: 600000 });
        }
        setTimeout(() => {
            if (typeof refreshNearestCommuneDisplayFromKnownGps === 'function') refreshNearestCommuneDisplayFromKnownGps();
        }, 1500);
    };

    window.addEventListener('online', resumeGps);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) resumeGps();
    });
}


function getKnownGpsLatLngForCentering() {
    if (userMarker && typeof userMarker.getLatLng === 'function') {
        try {
            const pos = userMarker.getLatLng();
            if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)) {
                return { lat: pos.lat, lng: pos.lng };
            }
        } catch (_) {}
    }

    if (lastPosition) {
        const lat = Number(lastPosition.lat ?? lastPosition.latitude);
        const lng = Number(lastPosition.lng ?? lastPosition.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
        }
    }

    return null;
}

function refreshCenterGpsFollowButtonState() {
    const button = document.getElementById('center-gps-button');
    if (!button) return;
    button.classList.toggle('center-follow-active', centerGpsFollowActive);
    button.classList.toggle('active', centerGpsFollowActive);
    button.setAttribute('aria-pressed', centerGpsFollowActive ? 'true' : 'false');
    button.title = centerGpsFollowActive
        ? 'Suivi position actif — cliquer pour désactiver'
        : 'Centrer puis suivre ma position GPS';
}

function recenterMapOnKnownGpsPosition(reason = 'manual') {
    if (!map) return false;
    const pos = getKnownGpsLatLngForCentering();
    if (!pos) return false;

    /*
     * v13.40 — retour base v13.34 : le bouton Suivi ne doit plus provoquer
     * de changement de zoom. Sur iPad/PWA, ce changement rechargeait les tuiles
     * et pouvait faire disparaître la carte quelques secondes.
     */
    const currentZoom = Number.isFinite(map.getZoom()) ? map.getZoom() : 10;
    centerGpsFollowProgrammaticMove = true;
    try {
        map.setView([pos.lat, pos.lng], currentZoom, {
            animate: false,
            noMoveStart: true
        });
    } finally {
        setTimeout(() => {
            centerGpsFollowProgrammaticMove = false;
        }, 350);
    }
    return true;
}

function scheduleCenterGpsFollowRecentering() {
    if (!centerGpsFollowActive) return;

    centerGpsFollowPausedUntil = Date.now() + CENTER_GPS_FOLLOW_RECENTER_DELAY_MS;
    if (centerGpsFollowPauseTimer) {
        clearTimeout(centerGpsFollowPauseTimer);
        centerGpsFollowPauseTimer = null;
    }

    centerGpsFollowPauseTimer = setTimeout(() => {
        centerGpsFollowPauseTimer = null;
        centerGpsFollowPausedUntil = 0;
        if (centerGpsFollowActive) {
            recenterMapOnKnownGpsPosition('manual-delay');
        }
    }, CENTER_GPS_FOLLOW_RECENTER_DELAY_MS);
}

function installCenterGpsFollowHandlers() {
    if (!map || centerGpsFollowHandlersInstalled) return;
    centerGpsFollowHandlersInstalled = true;

    const shouldIgnoreCenterFollowDomEvent = (event) => {
        try {
            const target = event && event.target;
            if (!target || typeof target.closest !== 'function') return false;
            return !!target.closest('.leaflet-control, .leaflet-popup, .leaflet-tooltip, button, input, textarea, select, a, #results-list, #commune-info-display, #nearest-commune-display');
        } catch (_) {
            return false;
        }
    };

    const markUserMapGesture = (event, { active = true } = {}) => {
        if (!centerGpsFollowActive) return;
        if (event && shouldIgnoreCenterFollowDomEvent(event)) return;

        centerGpsFollowUserGestureActive = active;
        centerGpsFollowLastUserGestureAt = Date.now();

        /*
         * v13.34 — on arme la pause de 10 secondes dès le contact utilisateur
         * sur la carte, avant les événements Leaflet. Sur iPad, le premier drag
         * pouvait sinon arriver pendant le fanion de recentrage programmatique
         * et être ignoré, ce qui provoquait un recentrage immédiat.
         */
        scheduleCenterGpsFollowRecentering();
    };

    const endUserMapGesture = (event) => {
        if (!centerGpsFollowActive) {
            centerGpsFollowUserGestureActive = false;
            return;
        }
        if (event && shouldIgnoreCenterFollowDomEvent(event)) return;
        markUserMapGesture(event, { active: false });
        centerGpsFollowUserGestureActive = false;
    };

    const container = typeof map.getContainer === 'function' ? map.getContainer() : null;
    if (container) {
        ['pointerdown', 'touchstart', 'mousedown', 'wheel'].forEach((eventName) => {
            container.addEventListener(eventName, (event) => markUserMapGesture(event, { active: true }), { passive: true, capture: true });
        });

        ['pointermove', 'touchmove'].forEach((eventName) => {
            container.addEventListener(eventName, (event) => {
                if (centerGpsFollowUserGestureActive) markUserMapGesture(event, { active: true });
            }, { passive: true, capture: true });
        });

        ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'mouseup'].forEach((eventName) => {
            container.addEventListener(eventName, endUserMapGesture, { passive: true, capture: true });
        });
    }

    const forcePauseForMapGesture = () => {
        if (!centerGpsFollowActive) return;
        centerGpsFollowLastUserGestureAt = Date.now();
        centerGpsFollowPausedUntil = Date.now() + CENTER_GPS_FOLLOW_RECENTER_DELAY_MS;
        scheduleCenterGpsFollowRecentering();
    };

    const onManualMapMove = (event) => {
        if (!centerGpsFollowActive) return;

        const recentDomUserGesture = Date.now() - centerGpsFollowLastUserGestureAt < 1500;
        const isUserInteraction = !!(
            (event && event.originalEvent)
            || centerGpsFollowUserGestureActive
            || recentDomUserGesture
        );

        if (centerGpsFollowProgrammaticMove && !isUserInteraction) return;

        scheduleCenterGpsFollowRecentering();
    };

    map.on('dragstart zoomstart', forcePauseForMapGesture);
    map.on('drag moveend dragend zoomend', onManualMapMove);
    map.on('movestart', (event) => {
        if (event && event.originalEvent) {
            forcePauseForMapGesture();
            onManualMapMove(event);
        }
    });
}
function enableCenterGpsFollow() {
    centerGpsFollowActive = true;
    centerGpsFollowPausedUntil = 0;
    if (centerGpsFollowPauseTimer) {
        clearTimeout(centerGpsFollowPauseTimer);
        centerGpsFollowPauseTimer = null;
    }

    refreshCenterGpsFollowButtonState();
    installCenterGpsFollowHandlers();

    const liveGpsWasActive = !!watchId || localStorage.getItem('liveGpsActive') === 'true';
    centerGpsFollowStartedLiveGps = !liveGpsWasActive;

    if (!liveGpsWasActive) {
        restartLiveGpsWatch({ silent: false });
    } else {
        requestOneShotGps({ silent: true, highAccuracy: true, timeout: 30000, maximumAge: 600000 });
    }

    if (!recenterMapOnKnownGpsPosition('enable') && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                updateUserPosition(pos);
                recenterMapOnKnownGpsPosition('enable-current');
            },
            () => {
                if (!recenterMapOnKnownGpsPosition('enable-fallback')) {
                    alert("Impossible d'obtenir la position GPS. Vérifiez les autorisations.");
                    disableCenterGpsFollow({ keepLiveGps: true });
                }
            },
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 600000 }
        );
    }
}

function disableCenterGpsFollow({ keepLiveGps = false } = {}) {
    centerGpsFollowActive = false;
    centerGpsFollowPausedUntil = 0;
    centerGpsFollowUserGestureActive = false;
    centerGpsFollowLastUserGestureAt = 0;
    if (centerGpsFollowPauseTimer) {
        clearTimeout(centerGpsFollowPauseTimer);
        centerGpsFollowPauseTimer = null;
    }

    if (!keepLiveGps && centerGpsFollowStartedLiveGps && watchId) {
        try { navigator.geolocation.clearWatch(watchId); } catch (_) {}
        watchId = null;
        const liveGpsButton = document.getElementById('live-gps-button');
        if (liveGpsButton) liveGpsButton.classList.remove('active');
        localStorage.setItem('liveGpsActive', 'false');
    }

    centerGpsFollowStartedLiveGps = false;
    refreshCenterGpsFollowButtonState();
}

function toggleCenterGpsFollow() {
    if (centerGpsFollowActive) {
        disableCenterGpsFollow();
    } else {
        enableCenterGpsFollow();
    }
}

function centerMapOnCurrentPosition() {
    // Conservé pour compatibilité avec d'éventuels appels existants : action ponctuelle sans activer le suivi.
    if (!map) return;

    if (!navigator.geolocation) {
        if (recenterMapOnKnownGpsPosition('legacy')) return;
        alert("La géolocalisation n'est pas supportée par votre navigateur.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            updateUserPosition(pos);
            recenterMapOnKnownGpsPosition('legacy-current');
        },
        () => {
            if (!recenterMapOnKnownGpsPosition('legacy-fallback')) {
                alert("Impossible d'obtenir la position GPS. Vérifiez les autorisations.");
            }
        },
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 600000 }
    );
}

function toggleLiveGps() {
    const liveGpsButton = document.getElementById('live-gps-button');
    if (watchId) {
        if (centerGpsFollowActive) {
            disableCenterGpsFollow({ keepLiveGps: true });
        }
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        if (liveGpsButton) liveGpsButton.classList.remove('active');
        localStorage.setItem('liveGpsActive', 'false');
        centerGpsFollowStartedLiveGps = false;
    } else {
        centerGpsFollowStartedLiveGps = false;
        restartLiveGpsWatch({ silent: false });
    }
}

function drawUserToTargetRoute() {
    userToTargetLayer.clearLayers();
    if (currentCommune && userMarker && userMarker.getLatLng()) {
        const { latitude_mairie: lat, longitude_mairie: lon } = currentCommune;
        const userLatLng = userMarker.getLatLng();

        const trueBearingToTarget = calculateBearing(userLatLng.lat, userLatLng.lng, lat, lon);
        const magneticBearing = (trueBearingToTarget - MAGNETIC_DECLINATION + 360) % 360;

        drawRoute([userLatLng.lat, userLatLng.lng], [lat, lon], { isUser: true, magneticBearing: magneticBearing });
    }
    updateCommuneGpsRouteDisplay();
}


function getOrCreateNearestCommuneDisplay() {
    let display = document.getElementById('nearest-commune-display');
    if (!display && document.body) {
        display = document.createElement('div');
        display.id = 'nearest-commune-display';
        display.className = 'gps-waiting';
        display.innerHTML = '📍 Survolée: <b>GPS en attente</b>';
        document.body.appendChild(display);
    }
    return display;
}

function forceNearestCommuneHudVisible(display) {
    if (!display) return;
    const importantStyles = {
        position: 'fixed',
        display: 'flex',
        visibility: 'visible',
        opacity: '1',
        zIndex: '980',
        pointerEvents: 'none'
    };

    Object.entries(importantStyles).forEach(([prop, value]) => {
        try { display.style.setProperty(prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), value, 'important'); } catch (_) {}
    });

    try {
        display.setAttribute('aria-live', 'polite');
        display.dataset.npfHud = 'commune-survolee';
    } catch (_) {}
}

function updateNearestCommuneDisplay(lat, lon) {
    const nearestDisplay = getOrCreateNearestCommuneDisplay();
    if (!nearestDisplay) return;
    forceNearestCommuneHudVisible(nearestDisplay);

    const showDisplay = (html, extraClass = '') => {
        nearestDisplay.style.display = 'flex';
        nearestDisplay.className = extraClass ? `nearest-commune-display ${extraClass}` : 'nearest-commune-display';
        nearestDisplay.innerHTML = html;
    };

    const enrichCommuneForDisplay = (commune) => {
        if (!commune) return null;
        return getCommuneFromDatabaseByNameAndDepartment(commune) || commune;
    };

    const buildLabel = (commune, prefix = 'Commune') => {
        const displayCommune = enrichCommuneForDisplay(commune);
        if (!displayCommune) return '';
        const departmentAtPoint = findDepartmentContainingPoint(lat, lon);
        const depLabel = departmentAtPoint?.dep_code || formatCommuneDepartment(displayCommune);
        return `<span class="nearest-commune-prefix">📍 ${prefix}:</span> <b class="nearest-commune-name">${displayCommune.nom_standard || displayCommune.name || 'non déterminée'}${depLabel ? ` (${depLabel})` : ''}</b>`;
    };

    const numericLat = Number(lat);
    const numericLon = Number(lon);
    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLon)) {
        showDisplay('📍 Survolée: <b>GPS en attente</b>', 'gps-waiting');
        return;
    }

    const containedCommune = findCommuneContainingPoint(numericLat, numericLon);
    if (containedCommune) {
        showDisplay(buildLabel(containedCommune, 'Survolée'));

        if (!hasLoadedDepartments) {
            ensureDepartmentsLayerDataLoaded()
                .then(() => {
                    const display = document.getElementById('nearest-commune-display');
                    if (!display) return;
                    const refreshedCommune = findCommuneContainingPoint(numericLat, numericLon) || containedCommune;
                    display.style.display = 'flex';
                    display.className = 'nearest-commune-display';
                    display.innerHTML = buildLabel(refreshedCommune, 'Survolée');
                })
                .catch((error) => console.warn('Chargement calque départements pour commune survolée impossible:', error));
        }
        return;
    }

    /*
     * v12.99 — restauration robuste du bandeau "commune survolée".
     * Le bandeau doit rester visible même si les polygones ne sont pas encore
     * chargés ou si le réseau est mauvais. La valeur précise est mise à jour
     * dès que les polygones deviennent disponibles.
     */
    if (!hasLoadedCommunes) {
        showDisplay('📍 Survolée: <b>chargement...</b>', 'loading');
        ensureCommunesLayerDataLoaded()
            .then(() => {
                const preciseCommune = findCommuneContainingPoint(numericLat, numericLon);
                const display = document.getElementById('nearest-commune-display');
                if (!display) return;
                if (preciseCommune) {
                    display.style.display = 'flex';
                    display.className = 'nearest-commune-display';
                    display.innerHTML = buildLabel(preciseCommune, 'Survolée');
                } else {
                    display.style.display = 'flex';
                    display.className = 'nearest-commune-display unknown';
                    display.innerHTML = '📍 Survolée: <b>non déterminée</b>';
                }
                repairManualFireCommuneLabelsFromPolygons();
            })
            .catch((error) => {
                console.warn('Chargement du calque communes pour identification impossible:', error);
                const display = document.getElementById('nearest-commune-display');
                if (!display) return;
                display.style.display = 'flex';
                display.className = 'nearest-commune-display unavailable';
                display.innerHTML = '📍 Survolée: <b>indisponible</b>';
            });
        return;
    }

    showDisplay('📍 Survolée: <b>non déterminée</b>', 'unknown');
}

function refreshNearestCommuneDisplayFromKnownGps() {
    /*
     * v12.99 — le bandeau bas droit doit être visible en permanence :
     * - commune précise si GPS + polygones disponibles ;
     * - chargement/attente si la position ou les polygones ne sont pas prêts.
     */
    let lat = NaN;
    let lon = NaN;

    try {
        if (userMarker && typeof userMarker.getLatLng === 'function') {
            const ll = userMarker.getLatLng();
            if (ll && Number.isFinite(Number(ll.lat)) && Number.isFinite(Number(ll.lng))) {
                lat = Number(ll.lat);
                lon = Number(ll.lng);
            }
        }
    } catch (_) {}

    if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && lastPosition) {
        lat = Number(lastPosition.lat ?? lastPosition.latitude);
        lon = Number(lastPosition.lng ?? lastPosition.longitude);
    }

    if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && typeof getStoredGpsPosition === 'function') {
        const stored = getStoredGpsPosition();
        if (stored) {
            lat = Number(stored.lat);
            lon = Number(stored.lng);
        }
    }

    updateNearestCommuneDisplay(lat, lon);
    return Number.isFinite(lat) && Number.isFinite(lon);
}

function ensureNearestCommuneDisplayBootstrapped() {
    const display = getOrCreateNearestCommuneDisplay();
    if (!display) return;
    forceNearestCommuneHudVisible(display);
    display.classList.add('gps-waiting');
    if (!display.innerHTML || !display.textContent.trim()) {
        display.innerHTML = '📍 Survolée: <b>GPS en attente</b>';
    }
}

(function bootstrapNearestCommuneDisplayPersistence() {
    const run = () => {
        ensureNearestCommuneDisplayBootstrapped();
        if (typeof refreshNearestCommuneDisplayFromKnownGps === 'function') {
            refreshNearestCommuneDisplayFromKnownGps();
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
    [100, 700, 2000, 5000].forEach(delay => setTimeout(run, delay));
    setInterval(run, 5000);

    try {
        const observer = new MutationObserver(() => {
            const display = getOrCreateNearestCommuneDisplay();
            if (!display) return;
            forceNearestCommuneHudVisible(display);
            if (!display.textContent || !display.textContent.trim()) {
                display.innerHTML = '📍 Survolée: <b>GPS en attente</b>';
            }
        });
        if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
})();


function findClosestCommune(lat, lon, maxDistanceNm = null) {
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

    if (maxDistanceNm !== null && minDistance >= maxDistanceNm) {
        return null;
    }

    return closestCommune;
}


function shouldShowOwnGpsAltitude() {
    try {
        return chatConnected === true && localStorage.getItem('teamChatLocationSharing') === 'true';
    } catch (_) {
        return false;
    }
}

function formatGpsAltitudeFtFromCoords(coords) {
    if (!coords) return '--- ft';
    const altitudeMeters = Number(coords.altitude);
    return Number.isFinite(altitudeMeters) ? `${Math.round(altitudeMeters * 3.28084)} ft` : '--- ft';
}

function sanitizeFilePart(value) {
    return simplifyString(value || 'feu')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'feu';
}

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

let exportKmlInProgress = false;
let exportKmlLastActionTime = 0;

async function exportCurrentFireKml(event = null, communeOverride = null, buttonOverride = null) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const now = Date.now();
    if (exportKmlInProgress || now - exportKmlLastActionTime < 1200) {
        return;
    }

    exportKmlInProgress = true;
    exportKmlLastActionTime = now;

    const targetCommune = normalizeHistoryCommune(communeOverride) || currentCommune;
    const exportButton = buttonOverride || document.getElementById('export-kml-btn');
    if (exportButton) {
        exportButton.disabled = true;
        exportButton.classList.add('busy');
    }

    try {
        if (!targetCommune) {
            alert('Aucun feu sélectionné.');
            return;
        }

        const lat = Number(targetCommune.latitude_mairie);
        const lon = Number(targetCommune.longitude_mairie);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            alert('Coordonnées du feu indisponibles.');
            return;
        }

        /*
         * v11.93 — KML minimal téléchargé, sans feuille de partage iOS.
         * Objectif : éviter la réouverture de la feuille de partage iOS
         * et fournir un vrai fichier .kml à ouvrir/importer ensuite depuis Fichiers.
         * Coordonnées KML : longitude,latitude,altitude.
         */
        const rawName = targetCommune.nom_standard || 'POINT_Q400';
        const safeName = rawName
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 30) || 'POINT_Q400';

        const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>${escapeXml(safeName)}</name>
      <description>Point exporte depuis NPF-Q400</description>
      <Point>
        <coordinates>${lon.toFixed(7)},${lat.toFixed(7)},0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

        const fileName = `${safeName}.kml`;
        const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = fileName;
        link.rel = 'noopener';
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 15000);
    } finally {
        setTimeout(() => {
            exportKmlInProgress = false;
            if (exportButton) {
                exportButton.disabled = false;
                exportButton.classList.remove('busy');
            }
        }, 900);
    }
}

function formatSdvfrCsvValue(value) {
    return String(value ?? '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/;/g, ',')
        .trim();
}

function buildSdvfrPointName(value) {
    return (value || 'POINT_Q400')
        .toString()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 30) || 'POINT_Q400';
}

let exportSdvfrCsvInProgress = false;
let exportSdvfrCsvLastActionTime = 0;

async function exportCurrentFireSdvfrCsv(event = null, communeOverride = null, buttonOverride = null) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const now = Date.now();
    if (exportSdvfrCsvInProgress || now - exportSdvfrCsvLastActionTime < 1200) {
        return;
    }

    exportSdvfrCsvInProgress = true;
    exportSdvfrCsvLastActionTime = now;

    const targetCommune = normalizeHistoryCommune(communeOverride) || currentCommune;
    const exportButton = buttonOverride || document.getElementById('export-sdvfr-csv-btn');
    if (exportButton) {
        exportButton.disabled = true;
        exportButton.classList.add('busy');
    }

    try {
        if (!targetCommune) {
            alert('Aucun feu sélectionné.');
            return;
        }

        const lat = Number(targetCommune.latitude_mairie);
        const lon = Number(targetCommune.longitude_mairie);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            alert('Coordonnées du feu indisponibles.');
            return;
        }

        /*
         * v11.96 — Export CSV SDVFR Next.
         * Format validé :
         * name;description;type;latitude;longitude;shape;color
         * BELCODENE;Belcodene;FEU;43.427222;5.589444;diamond;yellow
         */
        const pointName = buildSdvfrPointName(targetCommune.nom_standard || 'POINT_Q400');
        const description = formatSdvfrCsvValue(targetCommune.nom_standard || pointName);
        const csv = [
            'name;description;type;latitude;longitude;shape;color',
            `${formatSdvfrCsvValue(pointName)};${description};FEU;${lat.toFixed(6)};${lon.toFixed(6)};diamond;yellow`
        ].join('\n') + '\n';

        const fileName = `Fichier_cibles_NEXT_${pointName}.csv`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = fileName;
        link.rel = 'noopener';
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 15000);
    } finally {
        setTimeout(() => {
            exportSdvfrCsvInProgress = false;
            if (exportButton) {
                exportButton.disabled = false;
                exportButton.classList.remove('busy');
            }
        }, 900);
    }
}


function ensureOwnGpsAltitudeMarkerStyle() {
    const styleId = 'own-gps-altitude-marker-style';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .own-gps-altitude-marker {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
        }
    `;
    document.head.appendChild(style);
}

function buildOwnGpsIcon(altitudeLabel = '', options = {}) {
    ensureOwnGpsAltitudeMarkerStyle();
    const isSimulation = options && options.simulation === true;
    const hasAltitudeLabel = !!String(altitudeLabel || '').trim();
    const safeAltitude = escapeHtml(altitudeLabel || '');
    const altitudeHtml = hasAltitudeLabel
        ? `<div class="own-gps-plane-altitude">${safeAltitude}</div>`
        : '';
    const simulationHtml = isSimulation ? '<div class="own-gps-sim-badge">SIM</div>' : '';

    return L.divIcon({
        className: `own-gps-altitude-marker own-gps-plane-icon${hasAltitudeLabel ? ' has-own-gps-altitude' : ' no-own-gps-altitude'}${isSimulation ? ' own-gps-simulation-icon' : ''}`,
        html: `${altitudeHtml}${simulationHtml}<div class="own-gps-plane-body"><span class="own-gps-plane-shape">✈</span></div>`,
        iconSize: [74, 58],
        iconAnchor: [37, 38]
    });
}

function applyOwnGpsPlaneHeading(courseDegrees) {
    if (!userMarker || !Number.isFinite(courseDegrees)) return;
    const element = userMarker.getElement && userMarker.getElement();
    const plane = element ? element.querySelector('.own-gps-plane-body') : null;
    if (!plane) return;

    /*
     * Le symbole ✈ pointe visuellement vers le NE dans la police emoji.
     * On compense par -45° pour que 0° corresponde au nord.
     */
    plane.style.transform = `rotate(${courseDegrees - 45}deg)`;
}




function calculateDestinationLatLng(lat, lon, bearingDeg, distanceMeters) {
    const earthRadiusMeters = 6371000;
    const angularDistance = distanceMeters / earthRadiusMeters;
    const bearingRad = toRad(bearingDeg);
    const latRad = toRad(lat);
    const lonRad = toRad(lon);

    const destLatRad = Math.asin(
        Math.sin(latRad) * Math.cos(angularDistance)
        + Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
    );

    const destLonRad = lonRad + Math.atan2(
        Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destLatRad)
    );

    return [toDeg(destLatRad), toDeg(destLonRad)];
}

function estimateMotionFromLastPosition(latitude, longitude, currentTimestampMs) {
    if (!lastPosition || !Number.isFinite(lastPosition.latitude) || !Number.isFinite(lastPosition.longitude)) {
        return { heading: null, speed: null };
    }

    const previousTimestampMs = Number(lastPosition.timestamp || 0);
    const elapsedSeconds = (currentTimestampMs - previousTimestampMs) / 1000;

    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 2 || elapsedSeconds > 120) {
        return { heading: null, speed: null };
    }

    const distanceNm = calculateDistanceInNm(lastPosition.latitude, lastPosition.longitude, latitude, longitude);
    const distanceMeters = distanceNm * 1852;

    if (!Number.isFinite(distanceMeters) || distanceMeters < 3) {
        return { heading: null, speed: null };
    }

    return {
        heading: calculateBearing(lastPosition.latitude, lastPosition.longitude, latitude, longitude),
        speed: distanceMeters / elapsedSeconds
    };
}

function ensureOwnGpsVectorLayer() {
    if (!map) return null;

    if (!ownGpsVectorLayer) {
        ownGpsVectorLayer = L.layerGroup().addTo(map);
    }

    return ownGpsVectorLayer;
}

function clearOwnGpsVector() {
    if (ownGpsVectorLayer) {
        ownGpsVectorLayer.clearLayers();
    }
    ownGpsVectorMarkers = [];
}

function buildOwnGpsVectorLabel(minutes, latLng) {
    return L.marker(latLng, {
        interactive: false,
        icon: L.divIcon({
            className: 'own-gps-vector-time-marker',
            html: `<div style="font-size:17px;font-weight:1000;color:#ffea00;text-shadow:-2px -2px 0 #111827,2px -2px 0 #111827,-2px 2px 0 #111827,2px 2px 0 #111827,0 2px 7px rgba(0,0,0,.85);white-space:nowrap;line-height:1;">${minutes}'</div>`,
            iconSize: [42, 22],
            iconAnchor: [-8, 11]
        })
    });
}

function updateOwnGpsVector(latitude, longitude, headingDeg, speedMps) {
    const layer = ensureOwnGpsVectorLayer();
    if (!layer) return;

    layer.clearLayers();
    ownGpsVectorMarkers = [];

    if (!Number.isFinite(headingDeg) || !Number.isFinite(speedMps) || speedMps < 1) {
        return;
    }

    const start = [latitude, longitude];
    const timeMarksMinutes = [2, 5, 10];
    const maxMinutes = Math.max(...timeMarksMinutes);
    const endDistanceMeters = speedMps * maxMinutes * 60;
    const end = calculateDestinationLatLng(latitude, longitude, headingDeg, endDistanceMeters);

    /* v13.04 — vecteur de position plus visible : halo noir + trait jaune. */
    L.polyline([start, end], {
        color: '#111827',
        weight: 9,
        opacity: 0.82,
        dashArray: '12,7',
        interactive: false,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(layer);

    const vectorLine = L.polyline([start, end], {
        color: '#ffea00',
        weight: 5,
        opacity: 1,
        dashArray: '12,7',
        interactive: false,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(layer);

    timeMarksMinutes.forEach((minutes) => {
        const markDistanceMeters = speedMps * minutes * 60;
        const point = calculateDestinationLatLng(latitude, longitude, headingDeg, markDistanceMeters);

        L.circleMarker(point, {
            radius: 8,
            color: '#111827',
            weight: 4,
            fillColor: '#ffea00',
            fillOpacity: 1,
            interactive: false
        }).addTo(layer);

        ownGpsVectorMarkers.push(buildOwnGpsVectorLabel(minutes, point).addTo(layer));
    });
}

function updateUserPosition(pos) {
    if (!pos || !pos.coords) return;

    const isSimulationPosition = pos.npfIsSimulation === true;
    if (isSimulationMode && !isSimulationPosition) {
        return;
    }

    const { latitude, longitude } = pos.coords;
    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return;

    const ownAltitudeLabel = (!isSimulationPosition && shouldShowOwnGpsAltitude()) ? formatGpsAltitudeFtFromCoords(pos.coords) : '';
    const gpsTimestampMs = Number(pos.timestamp) || Date.now();
    const estimatedMotion = isSimulationPosition ? { heading: null, speed: null } : estimateMotionFromLastPosition(latitude, longitude, gpsTimestampMs);
    const rawHeading = Number(pos.coords.heading);
    const rawSpeed = Number(pos.coords.speed);
    const motionHeading = Number.isFinite(rawHeading) ? rawHeading : estimatedMotion.heading;
    const motionSpeed = Number.isFinite(rawSpeed) ? rawSpeed : estimatedMotion.speed;

    if (isSimulationPosition) {
        clearOwnGpsVector();
        lastPosition = {
            lat: latitude,
            lng: longitude,
            latitude,
            longitude,
            timestamp: gpsTimestampMs,
            speedMps: null,
            speedKt: null,
            simulation: true
        };
    } else {
        updateOwnGpsVector(latitude, longitude, motionHeading, motionSpeed);
        const storedSpeedMps = Number.isFinite(motionSpeed) ? motionSpeed : null;
        lastPosition = {
            lat: latitude,
            lng: longitude,
            latitude,
            longitude,
            timestamp: gpsTimestampMs,
            speedMps: storedSpeedMps,
            speedKt: storedSpeedMps !== null ? storedSpeedMps * 1.9438444924406 : null,
            altitudeFt: Number.isFinite(Number(pos.coords.altitude)) ? Math.round(Number(pos.coords.altitude) * 3.28084) : null,
            altitudeTimeMs: Number.isFinite(Number(pos.coords.altitude)) ? gpsTimestampMs : null
        };
        saveStoredGpsPosition(latitude, longitude, gpsTimestampMs);
        applyStartupGpsAutoCenter(latitude, longitude, {
            source: pos && pos.npfIsStoredPosition ? 'stored' : 'real'
        });
    }

    if (!userMarker) {
        const userIcon = buildOwnGpsIcon(ownAltitudeLabel, { simulation: isSimulationPosition });
        userMarker = L.marker([latitude, longitude], { icon: userIcon, zIndexOffset: 500, keyboard: false, interactive: false }).addTo(map);
    } else {
        userMarker.setLatLng([latitude, longitude]);
        userMarker.setIcon(buildOwnGpsIcon(ownAltitudeLabel, { simulation: isSimulationPosition }));
        try { if (typeof userMarker.unbindPopup === 'function') userMarker.unbindPopup(); } catch (_) {}
    }

    /* v12.85 — priorité tactile : les icônes pélicandrome restent au-dessus de l'avion si les deux sont superposées. */
    try { if (userMarker && typeof userMarker.setZIndexOffset === 'function') userMarker.setZIndexOffset(500); } catch (_) {}

    applyOwnGpsPlaneHeading(motionHeading);

    updateNearestCommuneDisplay(latitude, longitude);
    setTimeout(() => { if (typeof refreshNearestCommuneDisplayFromKnownGps === 'function') refreshNearestCommuneDisplayFromKnownGps(); }, 250);

    if (typeof window.refreshCalculatorAirportContext === 'function') {
        window.refreshCalculatorAirportContext();
    }

    if (typeof updateDeroutementGpsStatus === 'function') {
        updateDeroutementGpsStatus(isSimulationPosition ? 'GPS simulation' : 'GPS actualisé');
    }

    if (centerGpsFollowActive) {
        const nowForFollow = Date.now();
        const recentManualMapGesture = (nowForFollow - centerGpsFollowLastUserGestureAt) < CENTER_GPS_FOLLOW_RECENTER_DELAY_MS;
        if (!centerGpsFollowUserGestureActive && !recentManualMapGesture && nowForFollow >= centerGpsFollowPausedUntil) {
            recenterMapOnKnownGpsPosition('gps-update');
        }
    }

    // Synchronise les calculs (dont GPS->Feu) dès qu'une position GPS est reçue.
    if (currentCommune) {
        updateCalculatorData();
    }

    // On appelle toujours la fonction qui redessine la route
    drawUserToTargetRoute();
}



function closeSimulationActionPopup() {
    try {
        if (map && simulationActionPopup) {
            map.closePopup(simulationActionPopup);
        }
    } catch (_) {}
    simulationActionPopup = null;
}

async function createSimulatedFireAtPoint(lat, lng) {
    const numericLat = Number(lat);
    const numericLng = Number(lng);
    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) return;

    selectedPelicanOACI = null;
    const simulatedFire = await buildManualFireCommuneFromPointAsync(numericLat, numericLng, 'Feu SIM');
    currentCommune = simulatedFire;
    localStorage.setItem('currentCommune', JSON.stringify(simulatedFire));
    displayCommuneDetails(simulatedFire, false);
}

function openSimulationActionPopup(latlng) {
    if (!map || !latlng) return;

    closeSimulationActionPopup();

    const container = document.createElement('div');
    container.className = 'simulation-action-popup-content';

    const title = document.createElement('div');
    title.className = 'simulation-action-popup-title';
    title.textContent = 'Mode simulation';

    const actions = document.createElement('div');
    actions.className = 'simulation-action-popup-actions';

    const aircraftButton = document.createElement('button');
    aircraftButton.type = 'button';
    aircraftButton.className = 'simulation-action-popup-btn simulation-aircraft-btn';
    aircraftButton.textContent = 'Positionner avion';
    aircraftButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        applySimulatedUserPosition(latlng.lat, latlng.lng);
        closeSimulationActionPopup();
    });

    const fireButton = document.createElement('button');
    fireButton.type = 'button';
    fireButton.className = 'simulation-action-popup-btn simulation-fire-btn';
    fireButton.textContent = 'Positionner feu';
    fireButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await createSimulatedFireAtPoint(latlng.lat, latlng.lng);
        closeSimulationActionPopup();
    });

    actions.appendChild(aircraftButton);
    actions.appendChild(fireButton);
    container.appendChild(title);
    container.appendChild(actions);

    try {
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach((eventName) => {
            container.addEventListener(eventName, (event) => {
                event.stopPropagation();
            }, { passive: true });
        });
    } catch (_) {}

    simulationActionPopup = L.popup({
        className: 'simulation-action-popup',
        closeButton: true,
        autoClose: true,
        closeOnClick: false,
        autoPan: true,
        maxWidth: 280
    })
        .setLatLng(latlng)
        .setContent(container)
        .openOn(map);
}

function refreshSimulationModeButtonState() {
    const button = document.getElementById('simulation-mode-button');
    if (document.body) {
        document.body.classList.toggle('simulation-mode-active', isSimulationMode);
    }
    if (!button) return;
    button.classList.toggle('active', isSimulationMode);
    button.textContent = isSimulationMode ? 'Quitter le mode simulation avion' : 'Mode simulation avion';
}

function applySimulatedUserPosition(lat, lng) {
    const numericLat = Number(lat);
    const numericLng = Number(lng);
    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) return;

    updateUserPosition({
        coords: {
            latitude: numericLat,
            longitude: numericLng,
            altitude: null,
            heading: null,
            speed: null,
            accuracy: null
        },
        timestamp: Date.now(),
        npfIsSimulation: true
    });
}

function enableSimulationMode() {
    if (!map || isSimulationMode) return;

    simulationWasLiveGpsActiveBeforeSimulation = (localStorage.getItem('liveGpsActive') === 'true') || !!watchId;
    isSimulationMode = true;
    if (watchId && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        const liveGpsButton = document.getElementById('live-gps-button');
        if (liveGpsButton) liveGpsButton.classList.remove('active');
        localStorage.setItem('liveGpsActive', 'false');
    }

    simulationMapClickHandler = null;
    refreshSimulationModeButtonState();

    const offlineMapModal = document.getElementById('offline-map-modal');
    if (offlineMapModal) offlineMapModal.style.display = 'none';

    alert('Mode simulation actif : appui long sur la carte pour choisir avion ou feu.');
}

function disableSimulationMode({ restoreGps = true } = {}) {
    if (!isSimulationMode && !simulationMapClickHandler) return;

    if (map && simulationMapClickHandler) {
        map.off('click', simulationMapClickHandler);
    }
    simulationMapClickHandler = null;
    simulationSuppressNextClickUntil = 0;
    closeSimulationActionPopup();
    isSimulationMode = false;
    refreshSimulationModeButtonState();

    if (restoreGps) {
        localStorage.setItem('liveGpsActive', 'true');
        restartLiveGpsWatch({ silent: true });
        setTimeout(() => requestOneShotGps({ silent: true, highAccuracy: true, timeout: 12000, maximumAge: 600000 }), 250);
    }
    simulationWasLiveGpsActiveBeforeSimulation = false;
}

function toggleSimulationMode() {
    if (isSimulationMode) {
        disableSimulationMode({ restoreGps: true });
    } else {
        enableSimulationMode();
    }
}

function findClosestCommuneName(lat, lon) {
    const closestCommune = findClosestCommune(lat, lon, 27);
    return closestCommune ? closestCommune.nom_standard : null;
}

function toggleLftwRoute() {
    showLftwRoute = !showLftwRoute;
    localStorage.setItem('showLftwRoute', showLftwRoute);
    updateLftwButtonState();
    if(currentCommune) { displayCommuneDetails(currentCommune, false); }
}

function updateLftwButtonState() {
    const lftwRouteButton = document.getElementById('lftw-route-button');
    if (!lftwRouteButton) return;
    lftwRouteButton.classList.toggle('active', showLftwRoute);
}

function drawLftwRoute() {
    lftwRouteLayer.clearLayers();
    if (!showLftwRoute || !currentCommune) return;
    const baseAirport = getAirportByOaci(selectedBaseOACI);
    if (!baseAirport) return;
    const { latitude_mairie: lat, longitude_mairie: lon } = currentCommune;
    const { lat: baseLat, lon: baseLon } = baseAirport;
    const trueBearing = calculateBearing(lat, lon, baseLat, baseLon);
    const magneticBearing = (trueBearing - MAGNETIC_DECLINATION + 360) % 360;
    drawRoute([lat, lon], [baseLat, baseLon], { isLftwRoute: true, magneticBearing: magneticBearing });
}

function toggleGaarVisibility() { isGaarMode = !isGaarMode; updateGaarButtonState(); if (isGaarMode) { redrawGaarCircuits(); } else { gaarLayer.clearLayers(); if (isDrawingMode) { toggleGaarDrawingMode(); } } }
function updateGaarButtonState() { const gaarButton = document.getElementById('gaar-mode-button'); const gaarControls = document.getElementById('gaar-controls'); gaarButton.classList.toggle('active', isGaarMode); gaarControls.style.display = isGaarMode ? 'flex' : 'none'; }

function setGaarEditingBannerVisible(active) {
    try {
        let banner = document.getElementById('gaar-editing-banner');
        if (active) {
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'gaar-editing-banner';
                banner.className = 'gaar-editing-banner';
                banner.innerHTML = 'Mode création/modification circuit GAAR activé<span class="gaar-editing-banner-subtitle">Touchez un point pour modifier ou supprimer — touchez la carte pour ajouter un point</span>';
                document.body.appendChild(banner);
            }
        } else if (banner && banner.parentNode) {
            banner.parentNode.removeChild(banner);
        }
        if (document.body) {
            document.body.classList.toggle('gaar-editing-active-ui', !!active);
        }
    } catch (_) {}
}

function suppressNextGaarMapClick(durationMs = 650) {
    try {
        window.__gaarSuppressMapClickUntil = Date.now() + durationMs;
    } catch (_) {}
}

function shouldIgnoreGaarMapClick(e) {
    try {
        if (Date.now() < (window.__gaarSuppressMapClickUntil || 0)) return true;
        const original = e && e.originalEvent;
        const target = original && original.target;
        if (target && typeof target.closest === 'function') {
            if (target.closest('.leaflet-interactive, .leaflet-marker-icon, .leaflet-tooltip, .leaflet-popup, .leaflet-control, .gaar-point-search-overlay, .gaar-editing-banner')) {
                return true;
            }
        }
    } catch (_) {}
    return false;
}

function stopGaarUiEvent(event, options = {}) {
    try { suppressNextGaarMapClick(options.durationMs || 800); } catch (_) {}
    try { if (event && typeof event.stopPropagation === 'function') event.stopPropagation(); } catch (_) {}
    if (options.preventDefault !== false) {
        try { if (event && typeof event.preventDefault === 'function') event.preventDefault(); } catch (_) {}
    }
    try {
        const original = event && event.originalEvent;
        if (original && typeof original.stopPropagation === 'function') original.stopPropagation();
        if (options.preventDefault !== false && original && typeof original.preventDefault === 'function') original.preventDefault();
        if (typeof L !== 'undefined' && L.DomEvent && original) L.DomEvent.stop(original);
    } catch (_) {}
}

function updateGaarDrawingButtonState() {
    const editButton = document.getElementById('edit-circuits-button');
    const mapContainer = document.getElementById('map');
    const status = document.getElementById('gaar-status');

    if (editButton) {
        editButton.classList.toggle('active', isDrawingMode);
        editButton.setAttribute('aria-pressed', isDrawingMode ? 'true' : 'false');
        editButton.innerHTML = isDrawingMode
            ? 'Créer/Modifier<br><span class="gaar-edit-state-label">ACTIF</span>'
            : 'Créer/Modifier';
    }

    if (mapContainer) {
        mapContainer.classList.toggle('crosshair-cursor', isDrawingMode);
        mapContainer.classList.toggle('gaar-editing-active', isDrawingMode);
    }

    setGaarEditingBannerVisible(isDrawingMode);

    if (status) {
        status.textContent = isDrawingMode
            ? 'Mode CRÉER/MODIFIER actif. Cliquez sur la carte pour ajouter un point ou sur un point pour renommer.'
            : '';
    }
}

function toggleGaarDrawingMode() {
    isDrawingMode = !isDrawingMode;
    updateGaarDrawingButtonState();
    /* v13.64 : étiquettes visibles en mode modification + état du bouton beaucoup plus lisible. */
    redrawGaarCircuits();
}
async function handleGaarMapClick(e) {
    if (!isDrawingMode) return;
    if (!e || !e.latlng) return;
    if (shouldIgnoreGaarMapClick(e)) return;

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
async function reverseGeocode(latlng) { document.getElementById('gaar-status').textContent = 'Recherche du nom...'; try { if (!navigator.onLine) { throw new Error("Application hors ligne."); } const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latlng.lat}&lon=${latlng.lng}&zoom=10`); if (!response.ok) throw new Error('La réponse du réseau n\'était pas OK.'); const data = await response.json(); const name = data.address.city || data.address.town || data.address.village || data.display_name.split(',')[0]; document.getElementById('gaar-status').textContent = `Point ajouté près de ${name}.`; return name; } catch (error) { const closestCommuneName = findClosestCommuneName(latlng.lat, latlng.lng); if (closestCommuneName) { document.getElementById('gaar-status').textContent = `Point ajouté près de ${closestCommuneName} (hors-ligne).`; return closestCommuneName; } else { document.getElementById('gaar-status').textContent = 'Nom non trouvé (hors-ligne).'; return null; } } }
function getGaarPointDisplayName(point) {
    const raw = String(point?.name || '').trim();
    return raw || 'Point GAAR';
}

function formatGaarCommuneResultName(c) {
    const name = c?.nom_standard || c?.name || '';
    const dep = c?.dep_code || '';
    return dep ? `${name} (${dep})` : name;
}

function searchCommunesForGaarPoint(rawSearch) {
    let departmentFilter = null;
    let searchTerm = String(rawSearch || '');
    const depRegex = /\s(\d{1,3}|2A|2B)$/i;
    const match = searchTerm.match(depRegex);
    if (match) {
        departmentFilter = match[1].length === 1 ? '0' + match[1] : match[1].toUpperCase();
        searchTerm = searchTerm.substring(0, match.index).trim();
    }

    const simplifiedSearch = simplifyString(searchTerm);
    if (simplifiedSearch.length < 2) return [];

    const searchWords = simplifiedSearch.split(' ').filter(Boolean);
    const searchCompact = searchWords.join('');
    const communesToSearch = departmentFilter ? allCommunes.filter(c => c.dep_code === departmentFilter) : allCommunes;

    const scoredResults = communesToSearch
        .filter(c => shouldSearchCandidate(c, searchWords, searchCompact, departmentFilter))
        .map(c => ({ ...c, score: scoreCommuneSearchCandidate(c, searchWords) }))
        .filter(c => c.score < 999);

    const aliasResults = searchAliasCommunes(searchWords, departmentFilter);
    const seenResultKeys = new Set(scoredResults.map(c => `commune:${c.code_insee}:${simplifyString(c.nom_standard)}`));

    aliasResults.forEach((alias) => {
        const key = `alias:${alias.alias_target_code_insee}:${simplifyString(alias.nom_standard)}`;
        const sameVisibleNameAlreadyPresent = seenResultKeys.has(`commune:${alias.code_insee}:${simplifyString(alias.nom_standard)}`);
        if (!seenResultKeys.has(key) && !sameVisibleNameAlreadyPresent) {
            seenResultKeys.add(key);
            scoredResults.push(alias);
        }
    });

    return scoredResults
        .sort((a, b) => a.score - b.score || a.nom_standard.length - b.nom_standard.length)
        .slice(0, 10);
}

function getGaarCommuneLatLng(commune) {
    if (!commune) return null;
    const lat = Number(
        commune.latitude_mairie ??
        commune.lat ??
        commune.latitude ??
        commune.centre_lat
    );
    const lng = Number(
        commune.longitude_mairie ??
        commune.lng ??
        commune.lon ??
        commune.longitude ??
        commune.centre_lon
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
}

function findBestGaarCommuneForInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const normalizedInput = simplifyString(
        raw
            .replace(/\s*\([^)]*\)\s*$/g, '')
            .replace(/\s+/g, ' ')
            .trim()
    );

    const results = searchCommunesForGaarPoint(raw);
    if (!results.length) return null;

    const exact = results.find((candidate) => {
        const candidateName = simplifyString(candidate?.nom_standard || candidate?.name || '');
        const candidateWithDep = simplifyString(formatGaarCommuneResultName(candidate));
        return candidateName === normalizedInput || candidateWithDep === simplifyString(raw);
    });

    return exact || results[0];
}

function applyGaarPointCommune(circuitIndex, pointIndex, commune, fallbackName = '') {
    const circuit = gaarCircuits[circuitIndex];
    const point = circuit && circuit.points ? circuit.points[pointIndex] : null;
    if (!point || !commune) return false;

    const latLng = getGaarCommuneLatLng(commune);
    if (!latLng) return false;

    point.name = formatGaarCommuneResultName(commune) || String(fallbackName || point.name || 'Point GAAR').trim();
    point.lat = latLng.lat;
    point.lng = latLng.lng;

    redrawGaarCircuits();
    saveGaarCircuits();
    closeGaarPointSearchOverlay();
    if (map) {
        map.closePopup();
        try { map.panTo([point.lat, point.lng], { animate: false }); } catch (_) {}
    }

    const status = document.getElementById('gaar-status');
    if (status) status.textContent = `Point GAAR déplacé sur ${point.name}.`;
    return true;
}

function setGaarPointName(circuitIndex, pointIndex, value, options = {}) {
    const newName = String(value || '').trim();
    if (!newName) return false;

    if (options && options.moveToCommune === true) {
        const commune = options.commune || findBestGaarCommuneForInput(newName);
        if (commune && applyGaarPointCommune(circuitIndex, pointIndex, commune, newName)) {
            return true;
        }
    }

    const circuit = gaarCircuits[circuitIndex];
    const point = circuit && circuit.points ? circuit.points[pointIndex] : null;
    if (!point) return false;

    /* v13.64 — saisie libre sans commune reconnue : renommage simple.
       Sélection d'une commune / OK sur une ville reconnue : déplacement du point sur la commune. */
    point.name = newName;

    redrawGaarCircuits();
    saveGaarCircuits();
    closeGaarPointSearchOverlay();
    if (map) map.closePopup();
    return true;
}


function closeGaarPointSearchOverlay() {
    try {
        const overlay = document.getElementById('gaar-point-search-overlay');
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (document.body) document.body.classList.remove('gaar-point-search-open');
    } catch (_) {}
    gaarPointSearchOverlayState = null;
}

function closeFireSearchPanelForGaarPointEdit() {
    /*
     * v13.64 — édition nom point GAAR en panneau haut iPad :
     * on ferme la fenêtre de recherche feu pour libérer l'écran et éviter que
     * la liste de résultats du point passe dessous / soit masquée par le clavier.
     * Les états GAAR (affichage + modification/création de circuit) ne sont pas modifiés.
     */
    try {
        const uiOverlay = document.getElementById('ui-overlay');
        const toggleSearchButton = document.getElementById('toggle-search-button');
        const communeDisplay = document.getElementById('commune-info-display');
        const resultsList = document.getElementById('results-list');
        const searchInput = document.getElementById('search-input');

        if (resultsList) resultsList.style.display = 'none';
        if (searchInput) searchInput.blur();
        if (uiOverlay) uiOverlay.style.display = 'none';
        if (toggleSearchButton) toggleSearchButton.classList.remove('active');

        if (communeDisplay && currentCommune && communeDisplay.innerHTML.trim() !== '') {
            communeDisplay.style.display = 'flex';
        }
    } catch (_) {}
}

function openGaarPointSearchOverlay(circuitIndex, pointIndex) {
    closeFireSearchPanelForGaarPointEdit();
    if (map) map.closePopup();

    const point = gaarCircuits[circuitIndex]?.points?.[pointIndex];
    if (!point) return;

    closeGaarPointSearchOverlay();
    gaarPointSearchOverlayState = { circuitIndex, pointIndex };

    const overlay = document.createElement('div');
    overlay.id = 'gaar-point-search-overlay';
    overlay.className = 'gaar-point-search-overlay';
    if (document.body) document.body.classList.add('gaar-point-search-open');
    ['click', 'pointerdown', 'touchstart', 'mousedown'].forEach(type => {
        overlay.addEventListener(type, (event) => stopGaarUiEvent(event, { preventDefault: false, durationMs: 900 }), { passive: true });
    });

    const panel = document.createElement('div');
    panel.className = 'gaar-point-search-panel';

    const header = document.createElement('div');
    header.className = 'gaar-point-search-header';

    const title = document.createElement('div');
    title.className = 'gaar-point-search-title';
    title.innerHTML = `<b>Point ${pointIndex + 1}</b><span>${escapeHtml(getGaarPointDisplayName(point))}</span>`;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'gaar-point-search-close';
    closeButton.setAttribute('aria-label', 'Fermer');
    closeButton.textContent = '×';
    closeButton.addEventListener('pointerdown', (event) => stopGaarUiEvent(event), { passive: false });
    closeButton.addEventListener('click', (event) => {
        stopGaarUiEvent(event);
        closeGaarPointSearchOverlay();
    });

    header.appendChild(title);
    header.appendChild(closeButton);

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'gaar-point-search-field-wrapper gaar-point-search-field-wrapper-top';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'gaar-point-search-input gaar-point-search-input-top';
    input.id = `gaar-input-${circuitIndex}-${pointIndex}`;
    input.value = getGaarPointDisplayName(point);
    input.placeholder = 'Rechercher une commune...';
    input.autocomplete = 'off';
    input.autocapitalize = 'words';
    input.spellcheck = false;
    input.inputMode = 'text';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'gaar-point-search-clear';
    clearButton.setAttribute('aria-label', 'Effacer la recherche');
    clearButton.textContent = '×';

    inputWrapper.appendChild(input);
    inputWrapper.appendChild(clearButton);

    const resultsList = document.createElement('ul');
    resultsList.className = 'gaar-point-results gaar-point-results-top';
    resultsList.style.display = 'none';

    const renderResults = () => {
        const results = searchCommunesForGaarPoint(input.value);
        resultsList.innerHTML = '';
        if (!results.length) {
            resultsList.style.display = 'none';
            return;
        }

        results.forEach((result) => {
            const li = document.createElement('li');
            li.textContent = `${result.nom_standard} (${result.dep_nom || result.dep_code} - ${result.dep_code})`;
            const applyResultName = (event) => {
                if (event) {
                    try { event.preventDefault(); } catch (_) {}
                    try { event.stopPropagation(); } catch (_) {}
                }
                suppressNextGaarMapClick(900);
                const selectedName = formatGaarCommuneResultName(result);
                input.value = selectedName;
                /* v13.64 : sélection d'une commune = déplacement du point sur cette commune. */
                setGaarPointName(circuitIndex, pointIndex, selectedName, { moveToCommune: true, commune: result });
            };
            li.addEventListener('pointerdown', applyResultName, { passive: false });
            li.addEventListener('click', applyResultName);
            resultsList.appendChild(li);
        });
        resultsList.style.display = 'block';
    };

    const updateClearButtonVisibility = () => {
        clearButton.style.display = input.value ? 'inline-flex' : 'none';
    };

    const clearGaarPointSearchInput = () => {
        input.value = '';
        resultsList.innerHTML = '';
        resultsList.style.display = 'none';
        updateClearButtonVisibility();
    };

    let searchTimer = null;
    input.addEventListener('input', () => {
        updateClearButtonVisibility();
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(renderResults, 160);
    });

    clearButton.addEventListener('pointerdown', (event) => {
        stopGaarUiEvent(event, { durationMs: 900 });
        clearGaarPointSearchInput();
        /* Garder le clavier ouvert quand iPad l'a déjà affiché. */
        try { input.focus({ preventScroll: true }); } catch (_) { try { input.focus(); } catch (_) {} }
    }, { passive: false });

    clearButton.addEventListener('click', (event) => {
        stopGaarUiEvent(event, { durationMs: 900 });
        clearGaarPointSearchInput();
        try { input.focus({ preventScroll: true }); } catch (_) { try { input.focus(); } catch (_) {} }
    });

    updateClearButtonVisibility();

    /* v13.64 : on ne force plus le focus par JS sur iPad.
       Le clavier s'ouvre via le tap natif dans l'input ; on bloque seulement la propagation vers la carte. */
    input.addEventListener('focus', renderResults);
    input.addEventListener('pointerdown', (event) => {
        try { event.stopPropagation(); } catch (_) {}
        suppressNextGaarMapClick(900);
    }, { passive: true });
    input.addEventListener('touchstart', (event) => {
        try { event.stopPropagation(); } catch (_) {}
        suppressNextGaarMapClick(900);
    }, { passive: true });
    input.addEventListener('click', (event) => {
        try { event.stopPropagation(); } catch (_) {}
        suppressNextGaarMapClick(900);
        renderResults();
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            setGaarPointName(circuitIndex, pointIndex, input.value, { moveToCommune: true });
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeGaarPointSearchOverlay();
        }
    });

    const actions = document.createElement('div');
    actions.className = 'gaar-point-popup-actions gaar-point-search-actions';

    const okButton = document.createElement('button');
    okButton.type = 'button';
    okButton.className = 'gaar-point-ok-btn';
    okButton.textContent = 'OK';
    okButton.addEventListener('pointerdown', (event) => stopGaarUiEvent(event), { passive: false });
    okButton.addEventListener('click', (event) => {
        stopGaarUiEvent(event);
        setGaarPointName(circuitIndex, pointIndex, input.value, { moveToCommune: true });
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-point-btn gaar-point-delete-btn';
    deleteButton.textContent = 'Supprimer';
    deleteButton.addEventListener('pointerdown', (event) => stopGaarUiEvent(event), { passive: false });
    deleteButton.addEventListener('click', (event) => {
        stopGaarUiEvent(event);
        window.deleteGaarPoint(circuitIndex, pointIndex);
    });

    actions.appendChild(okButton);
    actions.appendChild(deleteButton);

    panel.appendChild(header);
    panel.appendChild(inputWrapper);
    panel.appendChild(resultsList);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

function redrawGaarCircuits() {
    gaarLayer.clearLayers();
    gaarCircuits.forEach((circuit, circuitIndex) => {
        if (!circuit || circuit.points.length === 0) return;
        const latlngs = circuit.points.map(p => [p.lat, p.lng]);
        const lineStyleOptions = {
            color: circuit.color,
            weight: 3,
            opacity: 0.75,
            fillColor: 'transparent',
            fillOpacity: 0
        };

        if (latlngs.length >= 3) {
            L.polygon(latlngs, lineStyleOptions).addTo(gaarLayer);
        } else if (latlngs.length > 1) {
            L.polyline(latlngs, lineStyleOptions).addTo(gaarLayer);
        }

        circuit.points.forEach((point, pointIndex) => {
            const marker = L.circleMarker([point.lat, point.lng], {
                radius: 8,
                fillColor: circuit.color,
                color: '#000',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.85
            }).addTo(gaarLayer);

            ['mousedown', 'touchstart', 'pointerdown'].forEach(type => {
                marker.on(type, (event) => {
                    stopGaarUiEvent(event, { preventDefault: false, durationMs: 900 });
                });
            });

            marker.on('click', (event) => {
                stopGaarUiEvent(event, { durationMs: 900 });

                if (isDrawingMode) {
                    openGaarPointSearchOverlay(circuitIndex, pointIndex);
                    return;
                }

                /*
                 * v13.65 — hors mode Créer/Modifier :
                 * un clic sur un point GAAR affiche seulement une petite étiquette
                 * avec le nom du point/ville. Aucune fenêtre d'édition, aucun bouton.
                 */
                try {
                    if (map && typeof map.closePopup === 'function') map.closePopup();
                    if (typeof L !== 'undefined' && L.popup && map) {
                        L.popup({
                            autoPan: false,
                            closeButton: false,
                            className: 'gaar-point-name-popup',
                            offset: [0, -8]
                        })
                            .setLatLng([point.lat, point.lng])
                            .setContent(`<div class="gaar-point-simple-label">${escapeHtml(getGaarPointDisplayName(point))}</div>`)
                            .openOn(map);
                    }
                } catch (_) {}
            });

            if (isDrawingMode) {
                marker.bindTooltip(escapeHtml(getGaarPointDisplayName(point)), {
                    permanent: true,
                    direction: 'top',
                    offset: [0, -10],
                    className: 'gaar-point-label'
                });
            }
        });
    });
}

window.updateGaarPoint = function(circuitIndex, pointIndex) {
    const input = document.getElementById(`gaar-input-${circuitIndex}-${pointIndex}`);
    setGaarPointName(circuitIndex, pointIndex, input ? input.value : '', { moveToCommune: true });
};
window.deleteGaarPoint = function(circuitIndex, pointIndex) {
    suppressNextGaarMapClick(1200);
    if (!gaarCircuits[circuitIndex] || !gaarCircuits[circuitIndex].points[pointIndex]) return;
    gaarCircuits[circuitIndex].points.splice(pointIndex, 1);
    if (gaarCircuits[circuitIndex].points.length === 0) {
        gaarCircuits.splice(circuitIndex, 1);
    }
    redrawGaarCircuits();
    saveGaarCircuits();
    closeGaarPointSearchOverlay();
    if (map) map.closePopup();
    const status = document.getElementById('gaar-status');
    if (status && isDrawingMode) {
        status.textContent = 'Point GAAR supprimé. Mode création/modification toujours actif.';
    }
};
function clearAllGaarCircuits() { gaarCircuits = []; gaarLayer.clearLayers(); saveGaarCircuits(); }
function saveGaarCircuits() { localStorage.setItem('gaarCircuits', JSON.stringify(gaarCircuits)); }

function updateCalculatorData() {
    if (!currentCommune) {
        CALCULATOR_DATA = { distBaseFeu: 0, distPelicFeu: 0, csFeu: '--:--', distGpsFeu: 0 };
    } else {
        const baseAirport = getAirportByOaci(selectedBaseOACI);
        const selectedPelican = getSelectedPelicanAirport();
        const { latitude_mairie: feuLat, longitude_mairie: feuLon } = currentCommune;
        let distBaseFeu = 0; if (baseAirport) { distBaseFeu = calculateDistanceInNm(baseAirport.lat, baseAirport.lon, feuLat, feuLon); }
        let distPelicFeu = 0; if (selectedPelican) { distPelicFeu = calculateDistanceInNm(selectedPelican.lat, selectedPelican.lon, feuLat, feuLon); }
        let csFeu = '--:--'; if (typeof SunCalc !== 'undefined') { try { const now = new Date(); const times = SunCalc.getTimes(now, feuLat, feuLon); csFeu = times.sunset.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }); } catch (e) { /* ignore */ } }
        let distGpsFeu = 0; if (userMarker && userMarker.getLatLng()) { const userLatLng = userMarker.getLatLng(); distGpsFeu = calculateDistanceInNm(userLatLng.lat, userLatLng.lng, feuLat, feuLon); }
        CALCULATOR_DATA.distBaseFeu = Math.round(distBaseFeu);
        CALCULATOR_DATA.distPelicFeu = Math.round(distPelicFeu);
        CALCULATOR_DATA.csFeu = csFeu;
        CALCULATOR_DATA.distGpsFeu = Math.round(distGpsFeu);
    }
    if (typeof masterRecalculate === 'function') { masterRecalculate(); }
}

function soundex(s) { if (!s) return ""; const a = s.toLowerCase().split(""), f = a.shift(); if (!f) return ""; let r = ""; const codes = { a: "", e: "", i: "", o: "", u: "", b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 }; return r = f + a.map(v => codes[v]).filter((v, i, a) => 0 === i ? v !== codes[f] : v !== a[i - 1]).join(""), (r + "000").slice(0, 4).toUpperCase() }
// =========================================================================
// GESTION DES CARTES HORS-LIGNE
// =========================================================================
function initDB() {
    /*
     * v11.27 — retour au module offline ancien/simple.
     * Ouverture conservée en version 3 pour rester compatible avec les bases déjà créées
     * par les versions récentes, mais sans scan ni logique avancée pendant l'import.
     */
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB indisponible'));
            return;
        }

        const request = indexedDB.open(OFFLINE_DB_NAME, 3);

        request.onupgradeneeded = event => {
            const dbInstance = event.target.result;

            if (!dbInstance.objectStoreNames.contains('tiles')) {
                const store = dbInstance.createObjectStore('tiles', { keyPath: 'url' });
                store.createIndex('packName', 'packName', { unique: false });
                store.createIndex('tileUrl', 'tileUrl', { unique: false });
            } else {
                const store = event.target.transaction.objectStore('tiles');
                if (!store.indexNames.contains('packName')) {
                    store.createIndex('packName', 'packName', { unique: false });
                }
                if (!store.indexNames.contains('tileUrl')) {
                    store.createIndex('tileUrl', 'tileUrl', { unique: false });
                }
            }

            if (!dbInstance.objectStoreNames.contains('settings')) {
                dbInstance.createObjectStore('settings', { keyPath: 'key' });
            }
        };

        request.onsuccess = event => {
            db = event.target.result;
            try {
                db.onversionchange = () => {
                    try { db.close(); } catch (_) {}
                    if (window.db === db) window.db = null;
                };
            } catch (_) {}
            console.log("[DB] Connexion réussie.");
            resolve(db);
        };

        request.onerror = event => {
            console.error("[DB] Erreur de connexion:", event.target.error);
            reject(event.target.error);
        };

        request.onblocked = () => {
            reject(new Error("Base IndexedDB bloquée. Fermez les autres onglets de l'application puis réessayez."));
        };
    });
}



function sanitizeOfflineDatabaseToken(value) {
    const base = String(value || 'Carte')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 72);
    return base || 'Carte';
}

function getOfflineMapDatabaseNameForGroup(groupName) {
    return `${OFFLINE_MAP_DATABASE_PREFIX}${sanitizeOfflineDatabaseToken(groupName)}`;
}

function getInstalledMapPacksSafe() {
    try {
        const packs = JSON.parse(localStorage.getItem('installedMapPacks') || '[]');
        return Array.isArray(packs) ? packs : [];
    } catch (_) {
        return [];
    }
}

function getOfflinePackDatabaseName(packName) {
    const installed = getInstalledMapPacksSafe();
    const found = installed.find(pack => pack && pack.name === packName);
    if (found && found.dbName) return found.dbName;

    const groupName = typeof getOfflinePackGroupName === 'function'
        ? getOfflinePackGroupName(packName)
        : String(packName || '').trim();
    const sameGroupWithDb = installed.find(pack => pack && pack.dbName && typeof getOfflinePackGroupName === 'function' && getOfflinePackGroupName(pack.name) === groupName);
    if (sameGroupWithDb && sameGroupWithDb.dbName) return sameGroupWithDb.dbName;

    // Compatibilité cartes déjà installées avant v13.73 : ancienne base commune.
    return OFFLINE_DB_NAME;
}

function getOfflineActivePackDatabasesForPacks(packs = activeOfflinePacks) {
    const names = [];
    (Array.isArray(packs) ? packs : []).forEach(packName => {
        const dbName = getOfflinePackDatabaseName(packName);
        if (dbName && !names.includes(dbName)) names.push(dbName);
    });
    return names;
}

function openOfflineTileDatabaseByName(dbName = OFFLINE_DB_NAME, version = 3) {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB indisponible'));
            return;
        }
        const safeName = String(dbName || OFFLINE_DB_NAME);
        const request = indexedDB.open(safeName, version);
        request.onupgradeneeded = event => {
            const dbInstance = event.target.result;
            if (!dbInstance.objectStoreNames.contains('tiles')) {
                const store = dbInstance.createObjectStore('tiles', { keyPath: 'url' });
                store.createIndex('packName', 'packName', { unique: false });
                store.createIndex('tileUrl', 'tileUrl', { unique: false });
            } else {
                const store = event.target.transaction.objectStore('tiles');
                if (!store.indexNames.contains('packName')) store.createIndex('packName', 'packName', { unique: false });
                if (!store.indexNames.contains('tileUrl')) store.createIndex('tileUrl', 'tileUrl', { unique: false });
            }
            if (!dbInstance.objectStoreNames.contains('settings')) {
                dbInstance.createObjectStore('settings', { keyPath: 'key' });
            }
        };
        request.onsuccess = event => {
            const openedDb = event.target.result;
            try { openedDb.onversionchange = () => { try { openedDb.close(); } catch (_) {} }; } catch (_) {}
            resolve(openedDb);
        };
        request.onerror = event => reject(event.target.error || new Error(`Erreur ouverture ${safeName}`));
        request.onblocked = () => reject(new Error(`Base IndexedDB bloquée : ${safeName}`));
    });
}

function getOfflineTilesEnabled() {
    return new Promise((resolve) => {
        if (!db) {
            resolve(DEFAULT_OFFLINE_TILES_ENABLED);
            return;
        }

        const transaction = db.transaction('settings', 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get(OFFLINE_TILES_ENABLED_KEY);

        request.onsuccess = () => {
            if (!request.result || typeof request.result.value !== 'boolean') {
                resolve(DEFAULT_OFFLINE_TILES_ENABLED);
                return;
            }
            resolve(request.result.value);
        };
        request.onerror = () => resolve(DEFAULT_OFFLINE_TILES_ENABLED);
    });
}

function setOfflineTilesEnabled(enabled) {
    offlineTilesMode = !!enabled;
    localStorage.setItem(OFFLINE_TILES_ENABLED_KEY, String(offlineTilesMode));
    notifyServiceWorkerOfflineTilesPreference(offlineTilesMode);

    if (!db) {
        return Promise.resolve();
    }

    try {
        const transaction = db.transaction('settings', 'readwrite');
        const store = transaction.objectStore('settings');
        store.put({ key: OFFLINE_TILES_ENABLED_KEY, value: offlineTilesMode });
        transaction.onerror = () => console.warn('[Offline] Impossible de persister la préférence offline:', transaction.error);
        transaction.onabort = () => console.warn('[Offline] Transaction annulée lors de la persistance offline:', transaction.error);
    } catch (error) {
        console.warn('[Offline] IndexedDB indisponible, préférence conservée en localStorage uniquement:', error);
    }

    return Promise.resolve();
}

function notifyServiceWorkerOfflineTilesPreference(enabled) {
    if (!('serviceWorker' in navigator)) return;
    if (!navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({
        type: 'OFFLINE_TILES_ENABLED_CHANGED',
        value: !!enabled
    });
}

function notifyServiceWorkerOfflineOnlineFallback(enabled) {
    if (!('serviceWorker' in navigator)) return;
    if (!navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({
        type: 'OFFLINE_ONLINE_FALLBACK_CHANGED',
        value: !!enabled
    });
}

function notifyServiceWorkerActivePacks(packs) {
    const safePacks = Array.isArray(packs) ? packs.filter(Boolean) : [];
    const dbNames = getOfflineActivePackDatabasesForPacks(safePacks);
    activeOfflinePackDatabases = dbNames;
    try { localStorage.setItem(OFFLINE_ACTIVE_PACK_DATABASES_KEY, JSON.stringify(dbNames)); } catch (_) {}

    if (!('serviceWorker' in navigator)) return;
    if (!navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({
        type: 'OFFLINE_ACTIVE_PACKS_CHANGED',
        value: safePacks,
        dbNames
    });
}

async function setOfflineActivePacks(packs) {
    activeOfflinePacks = Array.isArray(packs) ? packs.filter(Boolean) : [];
    activeOfflinePackDatabases = getOfflineActivePackDatabasesForPacks(activeOfflinePacks);
    localStorage.setItem(OFFLINE_ACTIVE_PACKS_KEY, JSON.stringify(activeOfflinePacks));
    localStorage.setItem(OFFLINE_ACTIVE_PACK_DATABASES_KEY, JSON.stringify(activeOfflinePackDatabases));
    if (db) {
        try {
            const tx = db.transaction('settings', 'readwrite');
            const store = tx.objectStore('settings');
            store.put({ key: OFFLINE_ACTIVE_PACKS_KEY, value: activeOfflinePacks });
            store.put({ key: OFFLINE_ACTIVE_PACK_DATABASES_KEY, value: activeOfflinePackDatabases });
        } catch (_) {}
    }
    notifyServiceWorkerActivePacks(activeOfflinePacks);
    await refreshOfflineTilesRendering();
}

function setOfflineOnlineFallbackMode(enabled) {
    offlineOnlineFallbackMode = !!enabled;
    localStorage.setItem(OFFLINE_ONLINE_FALLBACK_KEY, String(offlineOnlineFallbackMode));
    if (db) {
        try {
            const tx = db.transaction('settings', 'readwrite');
            tx.objectStore('settings').put({ key: OFFLINE_ONLINE_FALLBACK_KEY, value: offlineOnlineFallbackMode });
        } catch (_) {}
    }
    notifyServiceWorkerOfflineOnlineFallback(offlineOnlineFallbackMode);
}

function updateMapSourceButtons() {
    const onlineBtn = document.getElementById('map-source-online-btn');
    const offlineBtn = document.getElementById('map-source-offline-btn');
    if (!onlineBtn || !offlineBtn) return;
    onlineBtn.classList.toggle('active', mapSourceMode !== 'offline');
    offlineBtn.classList.toggle('active', mapSourceMode === 'offline');
    onlineBtn.disabled = isMapSourceSwitching;
    offlineBtn.disabled = isMapSourceSwitching;
    onlineBtn.setAttribute('aria-pressed', String(mapSourceMode !== 'offline'));
    offlineBtn.setAttribute('aria-pressed', String(mapSourceMode === 'offline'));
}


async function ensureServiceWorkerControlsPageForOffline() {
    /*
     * v13.71 — restauration mode hors ligne après reset profond.
     * Le reset v13.70 pouvait désinscrire le service worker : la carte offline
     * se retrouvait avec des URLs de tuiles que personne n'interceptait. Ici,
     * avant d'activer la carte offline, on vérifie qu'un service worker contrôle
     * réellement la page. Si ce n'est pas le cas, on le réinstalle puis on force
     * une seule relance propre.
     */
    if (!('serviceWorker' in navigator)) return true;
    if (navigator.serviceWorker.controller) return true;

    try {
        const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
        if (registration && typeof registration.update === 'function') {
            await registration.update().catch(() => {});
        }
        await navigator.serviceWorker.ready.catch(() => null);
    } catch (error) {
        console.warn('[Offline] Service worker non prêt pour le mode hors ligne:', error);
    }

    if (!navigator.serviceWorker.controller) {
        const guardKey = `npfOfflineSwControlReload:${window.APP_VERSION || 'unknown'}`;
        if (sessionStorage.getItem(guardKey) !== '1') {
            sessionStorage.setItem(guardKey, '1');
            const refreshUrl = new URL(window.location.href);
            refreshUrl.searchParams.set('appv', window.APP_VERSION || 'v13.73');
            refreshUrl.searchParams.set('swctl', Date.now().toString());
            window.location.replace(refreshUrl.toString());
            await new Promise(() => {});
        }
    }

    return !!navigator.serviceWorker.controller;
}

async function setMapSourceMode(mode) {
    if (isMapSourceSwitching) return;
    const previousMode = mapSourceMode;
    const nextMode = mode === 'offline' ? 'offline' : 'online';
    if (nextMode === 'offline') {
        await ensureServiceWorkerControlsPageForOffline();
    }
    if (previousMode === nextMode) {
        updateMapSourceButtons();
        updateOfflineStatus();
        return;
    }
    isMapSourceSwitching = true;
    mapSourceMode = nextMode;
    localStorage.setItem(MAP_SOURCE_MODE_KEY, mapSourceMode);
    updateMapSourceButtons();
    updateOfflineStatus();
    setOfflineMapSwitchBusy(nextMode === 'offline' ? 'Activation carte offline...' : 'Retour carte online...');
    try {
        await setOfflineTilesEnabled(mapSourceMode === 'offline');
        setOfflineOnlineFallbackMode(false);
        notifyServiceWorkerActivePacks(activeOfflinePacks);
        await updateBaseTileNativeZoomFromAvailability({ forceScan: false });
        rebuildBaseTileLayerAfterOfflineSwitch('setMapSourceMode');
    } catch (error) {
        mapSourceMode = previousMode;
        localStorage.setItem(MAP_SOURCE_MODE_KEY, mapSourceMode);
        try {
            await setOfflineTilesEnabled(mapSourceMode === 'offline');
        } catch (_) {}
        throw error;
    } finally {
        isMapSourceSwitching = false;
        updateMapSourceButtons();
        updateOfflineStatus();
    }
}

function updateOfflineStatus() {
    const status = document.getElementById('offline-status');
    if (!status) return;
    status.textContent = mapSourceMode === 'offline' ? 'Mode OFFLINE' : 'Mode ONLINE';
}

async function initializeOfflineTilePreference() {
    const enabled = mapSourceMode === 'offline';
    await setOfflineTilesEnabled(enabled);
    setOfflineOnlineFallbackMode(false);

    /*
     * v13.78 — au démarrage avec une carte déjà installée, on réécrit les
     * bases actives dans IndexedDB settings pour que le service worker puisse
     * lancer la PWA et servir la bonne carte même après relance/offline.
     */
    if (Array.isArray(activeOfflinePacks) && activeOfflinePacks.length) {
        await persistSimpleActiveOfflinePacks(activeOfflinePacks);
    }

    notifyServiceWorkerOfflineTilesPreference(enabled);
    notifyServiceWorkerOfflineOnlineFallback(false);
    notifyServiceWorkerActivePacks(activeOfflinePacks);
    updateMapSourceButtons();
    updateOfflineStatus();
}

async function purgeInactivePacksCache() {
    if (!db) {
        try {
            await initDB();
        } catch (_) {
            alert('Base offline indisponible.');
            return;
        }
    }
    const installedPacks = JSON.parse(localStorage.getItem('installedMapPacks') || '[]');
    const inactiveNames = installedPacks.map((p) => p.name).filter((name) => !activeOfflinePacks.includes(name));
    if (!inactiveNames.length) {
        alert('Aucun pack désélectionné à purger.');
        return;
    }
    if (!confirm(`Supprimer définitivement le cache de ${inactiveNames.length} pack(s) désélectionné(s) ?`)) {
        return;
    }

    const inactiveSet = new Set(inactiveNames);
    let deletedCount = 0;
    await new Promise((resolve, reject) => {
        const tx = db.transaction('tiles', 'readwrite');
        const store = tx.objectStore('tiles');
        const request = store.openCursor();
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) return;
            if (inactiveSet.has(cursor.value?.packName || '')) {
                cursor.delete();
                deletedCount += 1;
            }
            cursor.continue();
        };
        request.onerror = () => reject(request.error || new Error('Erreur purge cache offline'));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Erreur transaction purge offline'));
    });

    const updatedInstalled = installedPacks.filter((pack) => !inactiveSet.has(pack.name));
    localStorage.setItem('installedMapPacks', JSON.stringify(updatedInstalled));
    await updateBaseTileNativeZoomFromAvailability({ forceScan: false });
    displayInstalledMaps();
    alert(`Purge terminée: ${deletedCount} tuiles supprimées (${inactiveNames.length} pack(s)).`);
}



async function persistOfflineImportPauseSettings() {
    /*
     * v13.70 — import ZIP stable iPad.
     * On écrit réellement dans IndexedDB/settings que les tuiles offline sont suspendues
     * et qu'aucun pack n'est actif. Le service worker relit périodiquement ces settings :
     * si on ne les met pas à jour, il peut reprendre la lecture de l'ancien pack pendant
     * que l'import écrit le nouveau ZIP, ce qui bloque Safari/iPadOS dès le premier lot.
     */
    try { localStorage.setItem(OFFLINE_TILES_ENABLED_KEY, 'false'); } catch (_) {}
    try { localStorage.setItem(OFFLINE_ACTIVE_PACKS_KEY, JSON.stringify([])); } catch (_) {}
    try { localStorage.setItem(OFFLINE_ACTIVE_PACK_DATABASES_KEY, JSON.stringify([])); } catch (_) {}

    if (!db) {
        try { await initDB(); } catch (_) {}
    }

    if (!db) return;

    await new Promise((resolve, reject) => {
        try {
            const tx = db.transaction('settings', 'readwrite');
            const store = tx.objectStore('settings');
            store.put({ key: OFFLINE_TILES_ENABLED_KEY, value: false });
            store.put({ key: OFFLINE_ACTIVE_PACKS_KEY, value: [] });
            store.put({ key: OFFLINE_ACTIVE_PACK_DATABASES_KEY, value: [] });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error || new Error('Erreur suspension settings offline'));
            tx.onabort = () => reject(tx.error || new Error('Transaction suspension settings annulée'));
        } catch (error) {
            reject(error);
        }
    }).catch((error) => {
        console.warn('[Offline] Suspension settings import incomplète:', error);
    });
}

function postServiceWorkerMessageWithAck(message, expectedType = 'OFFLINE_IMPORT_READY', timeoutMs = 2500) {
    return new Promise((resolve) => {
        try {
            if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller || typeof MessageChannel === 'undefined') {
                resolve(false);
                return;
            }

            const channel = new MessageChannel();
            let done = false;
            const finish = (value) => {
                if (done) return;
                done = true;
                try { channel.port1.close(); } catch (_) {}
                resolve(value);
            };

            const timer = setTimeout(() => finish(false), timeoutMs);
            channel.port1.onmessage = (event) => {
                const data = event.data || {};
                if (data.type === expectedType) {
                    clearTimeout(timer);
                    finish(true);
                }
            };

            navigator.serviceWorker.controller.postMessage(message, [channel.port2]);
        } catch (error) {
            console.warn('[Offline] ACK service worker impossible:', error);
            resolve(false);
        }
    });
}


async function suspendOfflineMapRenderingDuringImport(reason = 'Import offline en cours') {
    /*
     * v13.70 — suspension renforcée.
     * La suspension n'est plus seulement en mémoire/localStorage : elle est aussi
     * écrite dans IndexedDB/settings pour empêcher le service worker de reprendre
     * l'ancien pack en plein import.
     */

    await persistOfflineImportPauseSettings();
    offlineTilesMode = false;

    /*
     * v12.16 — accélération du deuxième gros import.
     *
     * Symptôme confirmé :
     * - première carte importée : rapide ;
     * - deuxième carte importée : très lente ou bloquée.
     *
     * Cause probable :
     * pendant le deuxième import, Leaflet + le service worker continuent à lire
     * les tuiles de la carte active dans la même IndexedDB pendant que l'import
     * écrit massivement. Sur Safari/iPadOS, lecture + écriture simultanées sur une
     * grosse IndexedDB ralentissent très fortement les transactions.
     *
     * Correction :
     * - désactiver temporairement la carte offline active ;
     * - retirer la couche tuiles de Leaflet ;
     * - informer le service worker qu'il ne doit plus chercher de pack actif ;
     * - laisser l'import écrire seul dans IndexedDB.
     *
     * À la fin de l'import, le nouveau groupe importé est réactivé par le code existant.
     */
    try {
        activeOfflinePacks = [];
        activeOfflinePackDatabases = [];
        localStorage.setItem(OFFLINE_ACTIVE_PACKS_KEY, JSON.stringify([]));
        localStorage.setItem(OFFLINE_ACTIVE_PACK_DATABASES_KEY, JSON.stringify([]));
    } catch (_) {}

    try {
        notifyServiceWorkerOfflineTilesPreference(false);
        notifyServiceWorkerActivePacks([]);
    } catch (_) {}

    try {
        if (map && baseTileLayer) {
            map.removeLayer(baseTileLayer);
            baseTileLayer = null;
        }
    } catch (_) {}

    try {
        const statusEl = document.getElementById('offline-status');
        if (statusEl) {
            statusEl.textContent = `${reason} — carte suspendue pour accélérer l'écriture.`;
        }
    } catch (_) {}

    await new Promise(resolve => setTimeout(resolve, 250));
}


async function releaseOfflineDatabaseForHeavyOperation(reason = 'Opération offline lourde') {
    /*
     * v12.18 — libération réelle IndexedDB avant import/suppression.
     *
     * v12.17 envoyait un message au service worker, mais postMessage n'est pas
     * awaitable : l'import/suppression pouvait démarrer avant que le SW ait fermé
     * sa connexion IndexedDB.
     *
     * Ici on :
     * - suspend la carte ;
     * - demande au SW de fermer sa connexion ;
     * - ferme aussi la connexion IndexedDB de la page ;
     * - attend brièvement ;
     * - rouvre une connexion propre côté page.
     */
    await suspendOfflineMapRenderingDuringImport(reason);

    try {
        await postServiceWorkerMessageWithAck({ type: 'OFFLINE_IMPORT_START' }, 'OFFLINE_IMPORT_READY', 3000);
    } catch (_) {}

    try {
        if (db) db.close();
    } catch (_) {}
    db = null;

    await new Promise(resolve => setTimeout(resolve, 1200));
    await initDB();
}

async function handleZipImport(file) {
    if (!file) return;
    if (isZipImportRunning) {
        alert("Un import est déjà en cours. Veuillez attendre la fin avant d'importer un autre ZIP.");
        return;
    }
    if (typeof JSZip === 'undefined') {
        alert("ERREUR : La librairie d'importation (JSZip) n'est pas chargée.");
        return;
    }

    const packName = file.name.replace(/\.zip$/i, '');
    const packGroupNameForImport = getOfflinePackGroupName(packName);
    const isolatedImportDbName = getOfflineMapDatabaseNameForGroup(packGroupNameForImport);
    let importTileDb = null;
    const progressSection = document.getElementById('import-progress-section');
    const statusMessage = document.getElementById('import-status-message');
    const progressBar = document.getElementById('import-progress-bar');

    progressSection.style.display = 'block';
    progressBar.style.width = '0%';
    statusMessage.textContent = `Ouverture du ZIP ${packName}...`;
    isZipImportRunning = true;
    try { sessionStorage.setItem('npfZipImportRunning', '1'); } catch (_) {}

    const previousImportOfflineTilesMode = !!offlineTilesMode;
    const previousImportMapSourceMode = mapSourceMode;
    const previousImportActiveOfflinePacks = Array.isArray(activeOfflinePacks) ? [...activeOfflinePacks] : [];
    let zipImportCompletedSuccessfully = false;

    /*
     * v12.25 — OpenStreet en ZIP découpés : import progressif.
     * Le profil v12.24 en lots de 260 donnait des paliers longs 251/511/771...
     * On garde l'absence de libération lourde IndexedDB, mais on réduit les lots
     * pour éviter les pauses longues sur iPad/Safari.
     */
    const earlyPackNameForImport = packName;
    const earlyIsOpenStreetPack = isOpenStreetOfflinePackName(earlyPackNameForImport);
    const earlyIsLargeZip = file.size > 300 * 1024 * 1024;
    if (earlyIsOpenStreetPack && !earlyIsLargeZip) {
        await suspendOfflineMapRenderingDuringImport(`Import ${packName}`);
    } else {
        await releaseOfflineDatabaseForHeavyOperation(`Import ${packName}`);
    }

    const idle = (delay = 0) => new Promise((resolve) => setTimeout(resolve, delay));
    const nextFrame = () => new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(resolve, 0);
        }
    });

    const updateImportProgress = async (message, percent = null, forceFrame = false) => {
        if (typeof percent === 'number') {
            progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        }
        statusMessage.textContent = message;
        if (forceFrame) {
            await nextFrame();
        }
    };

    const reopenDbCleanly = async () => {
        try {
            if (importTileDb) importTileDb.close();
        } catch (_) {}
        importTileDb = null;
        await idle(180);
        importTileDb = await openOfflineTileDatabaseByName(isolatedImportDbName, 3);
    };

    const getTileWriteTransaction = () => {
        /*
         * v13.73 — import isolé par carte.
         * Les tuiles sont écrites dans une base dédiée au groupe de carte,
         * afin de ne plus écrire dans la base IndexedDB déjà utilisée par la carte active.
         */
        const targetDb = importTileDb || db;
        if (!targetDb) throw new Error('Base de tuiles import indisponible');
        try {
            return targetDb.transaction('tiles', 'readwrite', { durability: 'relaxed' });
        } catch (_) {
            return targetDb.transaction('tiles', 'readwrite');
        }
    };

    const putTileBatch = (batch, timeoutMs = 22000) => new Promise((resolve, reject) => {
        if (!batch.length) {
            resolve();
            return;
        }

        const transaction = getTileWriteTransaction();
        const store = transaction.objectStore('tiles');
        let finished = false;

        const finish = (callback, value) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            callback(value);
        };

        const timer = setTimeout(() => {
            try { transaction.abort(); } catch (_) {}
            finish(reject, new Error(`Transaction IndexedDB bloquée plus de ${Math.round(timeoutMs / 1000)} s`));
        }, timeoutMs);

        try {
            batch.forEach(tileData => {
                store.put(tileData);
            });
        } catch (error) {
            try { transaction.abort(); } catch (_) {}
            finish(reject, error);
            return;
        }

        transaction.oncomplete = () => finish(resolve);
        transaction.onerror = () => finish(reject, transaction.error || new Error('Erreur transaction IndexedDB'));
        transaction.onabort = () => finish(reject, transaction.error || new Error('Transaction IndexedDB annulée'));
    });

    const putTileBatchResilient = async (batch) => {
        try {
            await putTileBatch(batch);
            return;
        } catch (error) {
            /*
             * v13.70 — reprise automatique si Safari bloque une transaction.
             * Le blocage observé à 171/22387 correspond typiquement au premier
             * gros lot qui ne se termine jamais après utilisation d'une carte active.
             * On rouvre la base et on réécrit le même lot en micro-lots.
             */
            console.warn('[Offline] Lot IndexedDB bloqué, reprise micro-lots:', error);
            await updateImportProgress('Base iPad occupée : reprise en petits lots...', null, true);
            await reopenDbCleanly();
            for (let i = 0; i < batch.length; i += 12) {
                await putTileBatch(batch.slice(i, i + 12), 18000);
                await idle(6);
            }
        }
    };

    const deleteExistingTilesForPack = (packNameToDelete, isLargeZipPack) => new Promise((resolve, reject) => {
        /*
         * Avant de réimporter un gros pack, on libère l'ancien contenu.
         * C'est critique pour OpenStreet ~900 Mo : sans purge préalable,
         * Safari/iPadOS peut atteindre le quota avant d'avoir remplacé les tuiles.
         */
        if (!importTileDb || !packNameToDelete) {
            resolve(0);
            return;
        }

        let deleted = 0;
        const tx = getTileWriteTransaction();
        const store = tx.objectStore('tiles');

        const deleteCursor = (request) => {
            request.onsuccess = event => {
                const cursor = event.target.result;
                if (!cursor) return;

                const value = cursor.value || {};
                const key = cursor.primaryKey || value.url || '';
                const keyText = String(key);
                const shouldDelete = value.packName === packNameToDelete
                    || keyText.endsWith(`::${packNameToDelete}`);

                if (shouldDelete) {
                    cursor.delete();
                    deleted += 1;
                }
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        };

        try {
            if (store.indexNames && store.indexNames.contains('packName')) {
                deleteCursor(store.index('packName').openCursor(IDBKeyRange.only(packNameToDelete)));
            } else {
                deleteCursor(store.openCursor());
            }
        } catch (error) {
            reject(error);
            return;
        }

        tx.oncomplete = () => resolve(deleted);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction purge IndexedDB annulée'));
    });

    try {
        /*
         * v12.11 — renforcement gros volumes à partir de v11.33.
         *
         * Symptôme validé :
         * - OpenStreet 900 Mo s'installe, mais peut planter en toute fin.
         * - OACI finit par s'installer mais démarre très lentement après OpenStreet.
         *
         * Correction :
         * - avant chaque import, fermeture/réouverture IndexedDB pour repartir propre ;
         * - OpenStreet garde la clé simple qui fonctionne ;
         * - OACI garde la clé pack-scopée ;
         * - après gros import, on recharge immédiatement AVANT displayInstalledMaps()
         *   et AVANT notifyServiceWorkerActivePacks(), car le crash arrive en fin d'installation.
         */
        await reopenDbCleanly();

        await idle(80);
        const zip = await JSZip.loadAsync(file);

        const tileFiles = Object.values(zip.files || {}).filter(f => {
            return !f.dir && /\d+\/\d+\/\d+\.(png|jpg|jpeg)$/i.test(f.name);
        });

        const totalFiles = tileFiles.length;
        if (totalFiles === 0) {
            throw new Error("Aucune tuile valide trouvée dans le ZIP. La structure doit être /zoom/colonne/ligne.png");
        }

        await updateImportProgress(`Préparation terminée. Base isolée ${isolatedImportDbName}. Lecture de ${totalFiles} tuiles...`, 1, true);
        await idle(120);

        const isLargeZip = file.size > 300 * 1024 * 1024;
        const isOpenStreetPack = isOpenStreetOfflinePackName(packName);
        const isIgnPack = isIgnOfflinePackName(packName);
        const isOaciPack = isOaciOfflinePackName(packName);

        /*
         * v12.14 — OpenStreet reste sur le profil conservateur validé.
         * IGN, même en gros ZIP, passe sur un profil plus rapide :
         * - plus gros lots IndexedDB ;
         * - pas de fermeture/réouverture toutes les 700 tuiles ;
         * - clé pack-scopée pour éviter les collisions entre ZIP/hosts.
         */
        const useConservativeLargeImport = isLargeZip && isOpenStreetPack;
        const useSplitZipFastProfile = isOpenStreetPack && !isLargeZip;
        const useSafeMultiZipImport = !isLargeZip && totalFiles >= 5000 && !useSplitZipFastProfile;

        /*
         * v13.70 — profil multi-ZIP stable iPad.
         * Les nouveaux ZIP de carte France peuvent contenir ~20 000 à 25 000 tuiles par bloc
         * sans être nommés OpenStreet. Après utilisation d'une carte active, Safari bloquait
         * le premier gros lot autour de 171/22387. On force donc un profil plus petit,
         * progressif et rouvert régulièrement pour ces ZIP.
         */
        const batchSize = useConservativeLargeImport
            ? 35
            : (useSafeMultiZipImport ? 40 : (useSplitZipFastProfile ? 240 : (isIgnPack ? 320 : (isOaciPack ? 35 : (isLargeZip ? 160 : 180)))));
        const reopenEveryTiles = useConservativeLargeImport ? 700 : (useSafeMultiZipImport ? 400 : (isOaciPack ? 350 : 0));
        const splitZipReadConcurrency = useSplitZipFastProfile ? 48 : 1;
        const splitZipUiYieldEveryTiles = useSplitZipFastProfile ? 960 : 0;
        const usePackScopedKey = !isOpenStreetPack;
        /*
         * v12.19 : OACI passe en mode sécurisé.
         * Symptôme : blocage/crash vers Lecture tuiles 51/3347 quand OACI est la 3e carte.
         * Mesure : petits lots de 10, réouverture périodique IndexedDB, lecture blob.
         */
        const tileReadMode = useSplitZipFastProfile ? 'arraybuffer' : (isIgnPack ? 'arraybuffer' : 'blob');
        let skippedTiles = 0;

        const alreadyInstalledPacks = JSON.parse(localStorage.getItem('installedMapPacks') || '[]');
        const alreadyInstalled = alreadyInstalledPacks.some(p => p && p.name === packName);
        if (alreadyInstalled || (isLargeZip && isOpenStreetPack)) {
            statusMessage.textContent = `Nettoyage préalable du pack ${packName}...`;
            progressBar.style.width = '2%';
            await idle(120);
            try {
                const deletedBeforeImport = await deleteExistingTilesForPack(packName, isLargeZip && isOpenStreetPack);
                if (deletedBeforeImport > 0) {
                    statusMessage.textContent = `Ancien pack nettoyé : ${deletedBeforeImport} tuiles supprimées.`;
                    await idle(250);
                }
                await reopenDbCleanly();
            } catch (cleanupError) {
                console.warn('[Offline] Nettoyage préalable impossible, import poursuivi:', cleanupError);
            }
        }
        /*
         * v11.36 : les petits packs utilisent aussi un host dédié dans tileUrl.
         * L'index tileUrl du service worker tombe donc directement sur le bon pack
         * et l'affichage OACI redevient rapide.
         */

        let batch = [];
        let processedFiles = 0;
        let lastUiUpdate = Date.now();

        const flushBatch = async () => {
            if (!batch.length) return;
            const toWrite = batch;
            batch = [];
            await putTileBatchResilient(toWrite);
            processedFiles += toWrite.length;

            const percent = Math.min(100, Math.round((processedFiles / totalFiles) * 100));
            await updateImportProgress(
                useSplitZipFastProfile
                    ? `ZIP fractionné rapide : ${processedFiles} / ${totalFiles} tuiles`
                    : (useSafeMultiZipImport
                        ? `Import sécurisé iPad : ${processedFiles} / ${totalFiles} tuiles`
                        : `Écriture iPad... ${processedFiles} / ${totalFiles} tuiles`),
                percent,
                useConservativeLargeImport || useSplitZipFastProfile || useSafeMultiZipImport
            );

            if (reopenEveryTiles && processedFiles > 0 && processedFiles % reopenEveryTiles < toWrite.length) {
                await updateImportProgress(`Stabilisation base offline... ${processedFiles} / ${totalFiles}`, percent, true);
                await reopenDbCleanly();
            }

            await idle(useConservativeLargeImport ? 20 : 0);
        };

        await updateImportProgress(`Début lecture des tuiles ${packName}...`, 2, true);
        await idle(120);

        if (useSplitZipFastProfile) {
            /*
             * v12.51 — ZIP fractionné RAPIDE :
             * On garde la lecture parallèle, mais avec des transactions moyennes
             * de 240 tuiles : assez grandes pour accélérer l'import, assez courtes pour
             * éviter le palier bloquant observé à 1008 tuiles.
             */
            for (let i = 0; i < tileFiles.length; i += splitZipReadConcurrency) {
                const slice = tileFiles.slice(i, i + splitZipReadConcurrency);

                const readItems = await Promise.all(slice.map(async (tileFile, offset) => {
                    const absoluteIndex = i + offset;
                    try {
                        const tile = await tileFile.async(tileReadMode);
                        const tileUrl = buildOfflineTileUrlForPack(tileFile.name, packName, isLargeZip);
                        return {
                            url: usePackScopedKey ? buildStoredTileKey(tileUrl, packName) : tileUrl,
                            tileUrl,
                            tile,
                            packName
                        };
                    } catch (tileReadError) {
                        console.warn('[Offline] Tuile ZIP fractionné ignorée:', absoluteIndex + 1, tileReadError);
                        skippedTiles += 1;
                        return null;
                    }
                }));

                for (const item of readItems) {
                    if (item) batch.push(item);
                }

                if (batch.length >= batchSize) {
                    await flushBatch();
                    if (splitZipUiYieldEveryTiles && processedFiles > 0 && processedFiles % splitZipUiYieldEveryTiles === 0) {
                        await updateImportProgress(`Import rapide : ${processedFiles} / ${totalFiles} tuiles`, Math.min(99, Math.round((processedFiles / totalFiles) * 100)), true);
                        await idle(8);
                    }
                }

                const now = Date.now();
                if (now - lastUiUpdate > 900) {
                    lastUiUpdate = now;
                    const readCount = Math.min(i + splitZipReadConcurrency, totalFiles);
                    const percent = Math.min(99, Math.round((Math.max(processedFiles, readCount) / totalFiles) * 100));
                    await updateImportProgress(
                        `ZIP fractionné rapide : lu ${readCount} / ${totalFiles}, écrit ${processedFiles}`,
                        percent,
                        true
                    );
                }
            }
        } else {
            for (let i = 0; i < tileFiles.length; i += 1) {
                const tileFile = tileFiles[i];

                if (!useConservativeLargeImport && !useSplitZipFastProfile && (i === 0 || i % 10 === 0)) {
                    const readPercent = Math.min(95, Math.max(2, Math.round((i / totalFiles) * 100)));
                    await updateImportProgress(useSafeMultiZipImport
                        ? `Import sécurisé : lecture ${i + 1} / ${totalFiles}`
                        : `Lecture tuiles... ${i + 1} / ${totalFiles}`, readPercent, true);
                }

                if (useConservativeLargeImport && (i === 0 || i % 10 === 0)) {
                    const readPercent = Math.min(96, Math.max(1, Math.round((i / totalFiles) * 100)));
                    await updateImportProgress(`Lecture ZIP... ${i + 1} / ${totalFiles} tuiles`, readPercent, true);
                }

                let blob;
                try {
                    blob = await tileFile.async(tileReadMode);
                } catch (tileReadError) {
                    await idle(isOaciPack ? 300 : 160);
                    try {
                        blob = await tileFile.async(tileReadMode);
                    } catch (secondTileReadError) {
                        if (isOaciPack) {
                            skippedTiles += 1;
                            await updateImportProgress(`OACI : tuile ignorée ${i + 1} / ${totalFiles} (${skippedTiles} erreur(s))`, null, true);
                            continue;
                        }
                        throw secondTileReadError;
                    }
                }
                const tileUrl = buildOfflineTileUrlForPack(tileFile.name, packName, isLargeZip);

                batch.push({
                    url: usePackScopedKey ? buildStoredTileKey(tileUrl, packName) : tileUrl,
                    tileUrl,
                    tile: blob,
                    packName
                });

                if (batch.length >= batchSize) {
                    await flushBatch();
                }

                const now = Date.now();
                if (now - lastUiUpdate > (useConservativeLargeImport ? 350 : 700)) {
                    lastUiUpdate = now;
                    const percent = Math.min(99, Math.round((Math.max(processedFiles, i + 1) / totalFiles) * 100));
                    await updateImportProgress(`Importation... lecture ${i + 1} / ${totalFiles}, écrit ${processedFiles}`, percent, true);
                }
            }
        }

        await flushBatch();

        await updateImportProgress(skippedTiles > 0 ? `Importation de ${packName} terminée — ${skippedTiles} tuile(s) ignorée(s).` : `Importation de ${packName} terminée !`, 100, true);

        const installedPacks = JSON.parse(localStorage.getItem('installedMapPacks') || '[]');
        const existingPack = installedPacks.find(p => p.name === packName);
        if (existingPack) {
            existingPack.date = new Date().toLocaleDateString();
            existingPack.groupName = packGroupNameForImport;
            existingPack.dbName = isolatedImportDbName;
            existingPack.storageMode = 'isolated-v13.73';
        } else {
            installedPacks.push({
                name: packName,
                date: new Date().toLocaleDateString(),
                groupName: packGroupNameForImport,
                dbName: isolatedImportDbName,
                storageMode: 'isolated-v13.73'
            });
        }
        localStorage.setItem('installedMapPacks', JSON.stringify(installedPacks));

        const importedGroupName = getOfflinePackGroupName(packName);
        const importedGroupPacks = getInstalledPackNamesForGroup(importedGroupName);
        await persistSimpleActiveOfflinePacks(importedGroupPacks.length ? importedGroupPacks : [packName]);

        try {
            localStorage.removeItem(OFFLINE_TILES_MIN_ZOOM_KEY);
            localStorage.removeItem(OFFLINE_TILES_MAX_ZOOM_KEY);
        } catch (_) {}

        const restoreOfflineAfterImport = previousImportMapSourceMode === 'offline' || previousImportOfflineTilesMode;
        mapSourceMode = restoreOfflineAfterImport ? 'offline' : 'online';
        localStorage.setItem(MAP_SOURCE_MODE_KEY, mapSourceMode);
        await setOfflineTilesEnabled(restoreOfflineAfterImport);
        notifyServiceWorkerActivePacks(activeOfflinePacks);
        updateMapSourceButtons();
        updateOfflineStatus();
        zipImportCompletedSuccessfully = true;

        try { if (importTileDb) importTileDb.close(); } catch (_) {}
        importTileDb = null;

        if (isLargeZip) {
            reloadAfterOfflinePackChange(`Importation de ${packName} terminée. Rechargement mémoire...`);
            return;
        }

        reloadAfterOfflinePackChange(`Importation de ${packName} terminée. Rechargement de la carte...`);
        return;

    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        statusMessage.textContent = `Erreur: ${message}`;
        if (/quota|storage|abort|transaction/i.test(message)) {
            statusMessage.textContent += " — vérifiez l'espace iPad disponible, puis relancez après fermeture/réouverture de NPF.";
        }
        console.error("Erreur d'importation ZIP:", error);

        if (!zipImportCompletedSuccessfully) {
            try {
                mapSourceMode = previousImportMapSourceMode || 'online';
                localStorage.setItem(MAP_SOURCE_MODE_KEY, mapSourceMode);
                await persistSimpleActiveOfflinePacks(previousImportActiveOfflinePacks);
                await setOfflineTilesEnabled(previousImportOfflineTilesMode);
                notifyServiceWorkerActivePacks(previousImportActiveOfflinePacks);
                updateMapSourceButtons();
                updateOfflineStatus();
            } catch (restoreError) {
                console.warn('[Offline] Restauration état offline après échec import impossible:', restoreError);
            }
        }
    } finally {
        try { if (importTileDb) importTileDb.close(); } catch (_) {}
        importTileDb = null;
        isZipImportRunning = false;
        try { sessionStorage.removeItem('npfZipImportRunning'); } catch (_) {}
        setTimeout(() => { progressSection.style.display = 'none'; }, 7000);
    }
}

function isPlausibleTileZoom(value) {
    return Number.isFinite(value) && value >= 0 && value <= 22;
}

function parseTilePathFromName(name) {
    const normalizedName = String(name || '').replace(/\\/g, '/');
    const xyzMatch = normalizedName.match(/(?:^|\/)(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg)$/i);
    if (xyzMatch) {
        const zoom = Number.parseInt(xyzMatch[1], 10);
        if (!isPlausibleTileZoom(zoom)) return [];
        return [{ tilePath: `${xyzMatch[1]}/${xyzMatch[2]}/${xyzMatch[3]}.png`, zoom }];
    }

    const flatMatch = normalizedName.match(/(?:^|\/)(\d+)[-_](\d+)[-_](\d+)\.(png|jpg|jpeg)$/i);
    if (!flatMatch) return [];

    const a = Number.parseInt(flatMatch[1], 10);
    const c = Number.parseInt(flatMatch[3], 10);
    const candidates = [];

    if (isPlausibleTileZoom(a)) {
        candidates.push({ tilePath: `${flatMatch[1]}/${flatMatch[2]}/${flatMatch[3]}.png`, zoom: a });
    }
    // Compatibilité imports plats potentiellement en x_y_z : on ajoute aussi z/x/y.
    if (isPlausibleTileZoom(c)) {
        const altTilePath = `${flatMatch[3]}/${flatMatch[1]}/${flatMatch[2]}.png`;
        if (!candidates.some((entry) => entry.tilePath === altTilePath)) {
            candidates.push({ tilePath: altTilePath, zoom: c });
        }
    }

    return candidates;
}


async function persistSimpleActiveOfflinePacks(packs) {
    /*
     * v13.78 — cartes multi-ZIP en bases séparées.
     *
     * Correction critique :
     * v13.73 persistait bien la liste des packs actifs, mais pas toujours la
     * liste des bases IndexedDB isolées dans la base settings. Après relance,
     * le service worker pouvait donc revenir sur la base héritée et ne lire
     * qu'une fraction de carte, typiquement une seule tuile visible.
     *
     * On persiste maintenant systématiquement :
     * - les packs actifs ;
     * - les bases IndexedDB correspondantes ;
     * - les seuils de zoom sont invalidés au changement de groupe.
     */
    activeOfflinePacks = Array.isArray(packs) ? packs.filter(Boolean) : [];
    activeOfflinePackDatabases = getOfflineActivePackDatabasesForPacks(activeOfflinePacks);
    localStorage.setItem(OFFLINE_ACTIVE_PACKS_KEY, JSON.stringify(activeOfflinePacks));
    localStorage.setItem(OFFLINE_ACTIVE_PACK_DATABASES_KEY, JSON.stringify(activeOfflinePackDatabases));

    try {
        localStorage.removeItem(OFFLINE_TILES_MIN_ZOOM_KEY);
        localStorage.removeItem(OFFLINE_TILES_MAX_ZOOM_KEY);
    } catch (_) {}

    if (!db) {
        try {
            await initDB();
        } catch (_) {}
    }

    if (db) {
        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction('settings', 'readwrite');
                const store = tx.objectStore('settings');
                store.put({ key: OFFLINE_ACTIVE_PACKS_KEY, value: activeOfflinePacks });
                store.put({ key: OFFLINE_ACTIVE_PACK_DATABASES_KEY, value: activeOfflinePackDatabases });
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('Transaction settings annulée'));
            });
        } catch (error) {
            console.warn('[Offline] Impossible de persister les packs/bases actifs dans IndexedDB:', error);
        }
    }

    notifyServiceWorkerActivePacks(activeOfflinePacks);
}

function reloadAfterOfflinePackChange(message = 'Rechargement de la carte...') {
    const statusMessage = document.getElementById('import-status-message');
    if (statusMessage) statusMessage.textContent = message;

    try {
        if (map && baseTileLayer) {
            map.removeLayer(baseTileLayer);
            baseTileLayer = null;
        }
    } catch (_) {}

    try {
        if (db) db.close();
    } catch (_) {}
    db = null;

    setTimeout(() => {
        const refreshUrl = new URL(window.location.href);
        refreshUrl.searchParams.set('appv', APP_VERSION);
        refreshUrl.searchParams.set('ts', Date.now().toString());
        window.location.replace(refreshUrl.toString());
    }, 300);
}


function getOfflinePackGroupName(packName) {
    /*
     * v12.15 — groupes de packs offline plus tolérants.
     * Exemples :
     * OpenStreet_01, OpenStreet-02, IGN_001, IGN 03, IGN_part04 => groupe IGN.
     */
    const name = String(packName || '').trim();
    const cleaned = name
        .replace(/\s*\(\d+\)\s*$/i, '')
        .replace(/\s+(copy|copie)\s*$/i, '')
        .trim();

    const match = cleaned.match(/^(.+?)(?:[\s_-]*(?:part|partie|zip)?[\s_-]*)(\d{1,3})$/i);
    if (match && match[1].trim().length >= 2) {
        return match[1].replace(/[\s_-]+$/g, '').trim();
    }

    return cleaned;
}

function groupInstalledMapPacks(installedPacks = []) {
    const groups = new Map();
    installedPacks.forEach(pack => {
        if (!pack || !pack.name) return;
        const groupName = getOfflinePackGroupName(pack.name);
        if (!groups.has(groupName)) {
            groups.set(groupName, {
                name: groupName,
                packs: [],
                date: pack.date || ''
            });
        }
        const group = groups.get(groupName);
        group.packs.push(pack);
        group.date = pack.date || group.date;
    });
    return Array.from(groups.values()).map(group => {
        group.packs.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr', { numeric: true }));
        return group;
    });
}

function getInstalledPackNamesForGroup(groupName) {
    const installedPacks = JSON.parse(localStorage.getItem('installedMapPacks') || '[]');
    return installedPacks
        .filter(pack => pack && getOfflinePackGroupName(pack.name) === groupName)
        .map(pack => pack.name);
}

function displayInstalledMaps() {
    /*
     * v12.12 — affichage par groupes.
     * Les packs OpenStreet_01...OpenStreet_05 apparaissent comme une seule ligne OpenStreet.
     */
    const list = document.getElementById('installed-maps-list');
    if (!list) return;

    const installedPacks = JSON.parse(localStorage.getItem('installedMapPacks') || '[]');
    const groups = groupInstalledMapPacks(installedPacks);
    list.innerHTML = '';

    if (groups.length > 0) {
        const resetLi = document.createElement('li');
        resetLi.className = 'offline-map-reset-line';
        resetLi.innerHTML = `
            <span class="offline-map-name-line">
                <strong>Réparation stockage offline</strong><br>
                <small>À utiliser si une suppression reste bloquée.</small>
            </span>
            <div class="offline-map-actions">
                <button class="delete-map-btn offline-full-reset-btn" onclick="window.resetAllOfflineMapsStorage()">Réinitialiser profond</button>
            </div>
        `;
        list.appendChild(resetLi);
    }

    if (groups.length === 0) {
        list.innerHTML = '<li class="no-maps-placeholder">Aucun pack de cartes installé.</li>';
        return;
    }

    groups.forEach(group => {
        const li = document.createElement('li');
        const packNames = group.packs.map(pack => pack.name);
        const activeCount = packNames.filter(name => activeOfflinePacks.includes(name)).length;
        const isActive = activeCount === packNames.length && packNames.length > 0;
        const partiallyActive = activeCount > 0 && !isActive;
        const packLabel = packNames.length > 1 ? `${packNames.length} fichiers` : '1 fichier';
        const dateLabel = group.date ? `Installé le ${group.date}` : 'Installé';
        const storageLabel = group.packs.some(pack => pack && pack.dbName) ? 'base séparée' : 'base héritée';

        li.className = packNames.length > 1 ? 'offline-map-group-line' : '';
        li.innerHTML = `
            <span class="offline-map-name-line">
                <input type="checkbox" class="offline-map-select-checkbox" ${isActive ? 'checked' : ''} data-partial="${partiallyActive ? 'true' : 'false'}" onchange="window.selectSimpleMapGroup('${group.name}', this.checked)">
                <strong>${group.name}</strong> (${packLabel} — ${dateLabel} — ${storageLabel})${isActive ? ' — actif' : partiallyActive ? ` — partiel ${activeCount}/${packNames.length}` : ''}
            </span>
            <div class="offline-map-actions">
                <button class="delete-map-btn" onclick="window.deleteMapGroup('${group.name}')">Supprimer</button>
            </div>
        `;
        list.appendChild(li);
    });

    updateOfflineStatus();
}

async function applyOfflineMapGroupSelectionInPlace(groupName, checked, packNames) {
    /*
     * v13.58 — changement de carte sans recharger toute la PWA.
     * Le rechargement complet relançait service worker + IndexedDB + couches annexes,
     * ce qui pouvait bloquer la fenêtre de sélection plusieurs dizaines de secondes sur iPad.
     */
    const token = ++offlineMapSwitchToken;
    const nextPacks = checked ? packNames : [];
    const nextMode = checked ? 'offline' : 'online';

    isMapSourceSwitching = true;
    updateMapSourceButtons();
    setOfflineMapSwitchBusy(
        checked
            ? `Carte ${groupName} sélectionnée (${packNames.length} fichier(s)). Chargement progressif...`
            : 'Carte offline désactivée. Retour online...'
    );
    closeOfflineMapModalSoon(120);

    try {
        await persistSimpleActiveOfflinePacks(nextPacks);
        if (token !== offlineMapSwitchToken) return;

        try {
            localStorage.removeItem(OFFLINE_TILES_MIN_ZOOM_KEY);
            localStorage.removeItem(OFFLINE_TILES_MAX_ZOOM_KEY);
        } catch (_) {}

        mapSourceMode = nextMode;
        localStorage.setItem(MAP_SOURCE_MODE_KEY, mapSourceMode);
        await setOfflineTilesEnabled(mapSourceMode === 'offline');
        setOfflineOnlineFallbackMode(false);
        notifyServiceWorkerActivePacks(activeOfflinePacks);
        await updateBaseTileNativeZoomFromAvailability({ forceScan: false });
        rebuildBaseTileLayerAfterOfflineSwitch('selectSimpleMapGroup');

        setTimeout(() => rebuildBaseTileLayerAfterOfflineSwitch('selectSimpleMapGroup-second-pass'), 1200);
        setTimeout(() => scheduleStartupAuxiliaryLayers(), 2500);
    } catch (error) {
        console.error('Changement de carte offline impossible:', error);
        alert(`Impossible de changer de carte offline: ${error.message || error}`);
    } finally {
        if (token === offlineMapSwitchToken) {
            isMapSourceSwitching = false;
            updateMapSourceButtons();
            updateOfflineStatus();
            displayInstalledMaps();
        }
    }
}

window.selectSimpleMapGroup = async function(groupName, checked = true) {
    const packNames = getInstalledPackNamesForGroup(groupName);
    if (!packNames.length) {
        alert(`Aucun pack trouvé pour ${groupName}.`);
        displayInstalledMaps();
        return;
    }

    /*
     * v12.12 — une seule carte active à la fois, mais une carte peut être composée
     * de plusieurs ZIP indépendants : OpenStreet_01...OpenStreet_05.
     */
    await applyOfflineMapGroupSelectionInPlace(groupName, checked, packNames);
};

window.selectSimpleMapPack = async function(packName, checked = true) {
    const groupName = getOfflinePackGroupName(packName);
    return window.selectSimpleMapGroup(groupName, checked);
};





function removeInstalledOfflinePacksLogically(packNames = []) {
    const targetSet = new Set((packNames || []).filter(Boolean));
    if (!targetSet.size) return 0;

    let installedPacks = JSON.parse(localStorage.getItem('installedMapPacks') || '[]');
    const beforeCount = installedPacks.length;
    installedPacks = installedPacks.filter(pack => !pack || !targetSet.has(pack.name));
    localStorage.setItem('installedMapPacks', JSON.stringify(installedPacks));

    if (Array.isArray(activeOfflinePacks) && activeOfflinePacks.some(name => targetSet.has(name))) {
        activeOfflinePacks = activeOfflinePacks.filter(name => !targetSet.has(name));
        activeOfflinePackDatabases = getOfflineActivePackDatabasesForPacks(activeOfflinePacks);
        localStorage.setItem(OFFLINE_ACTIVE_PACKS_KEY, JSON.stringify(activeOfflinePacks));
        localStorage.setItem(OFFLINE_ACTIVE_PACK_DATABASES_KEY, JSON.stringify(activeOfflinePackDatabases));
        notifyServiceWorkerActivePacks(activeOfflinePacks);
    }

    return beforeCount - installedPacks.length;
}

function shouldUseLogicalDeleteForOfflineGroup(groupName, packNames = []) {
    /*
     * v12.22 — OpenStreet est trop volumineux pour une suppression physique fiable
     * sur iPad/Safari. On retire donc le pack de la liste active/installée, sans
     * parcourir 1 Go de tuiles dans IndexedDB.
     */
    if (isOpenStreetOfflinePackName(groupName)) return true;
    return (packNames || []).some(name => isOpenStreetOfflinePackName(name));
}


window.resetAllOfflineMapsStorage = async function() {
    /*
     * v12.20 — reset sans deleteDatabase bloquant.
     *
     * Le deleteDatabase('OfflineTilesDB') peut rester bloqué si Safari/iPadOS ou
     * l'ancien service worker garde encore une connexion ouverte.
     *
     * La v12.20 abandonne donc l'ancienne base et utilise une nouvelle base :
     * OfflineTilesDB_v12_20.
     *
     * Conséquence :
     * - le reset fonctionne même si l'ancienne base est verrouillée ;
     * - les anciennes tuiles peuvent rester dans les données Safari du site ;
     * - si l'espace iPad devient insuffisant, il faudra effacer les données du site
     *   depuis Réglages Safari.
     */
    const confirmed = confirm(
        'Réinitialiser la liste des cartes offline ?\n\n' +
        'La v12.20 utilise une nouvelle base offline propre.\n' +
        'Les anciennes données verrouillées seront ignorées.'
    );
    if (!confirmed) return;

    const progressSection = document.getElementById('import-progress-section');
    const statusMessage = document.getElementById('import-status-message') || document.getElementById('offline-status');
    const progressBar = document.getElementById('import-progress-bar');

    if (progressSection) progressSection.style.display = 'block';
    if (progressBar) progressBar.style.width = '10%';
    if (statusMessage) statusMessage.textContent = 'Réinitialisation logique du stockage offline...';

    try {
        await suspendOfflineMapRenderingDuringImport('Réinitialisation stockage offline');

        try {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'OFFLINE_FACTORY_RESET' });
            }
        } catch (_) {}

        try {
            if (db) db.close();
        } catch (_) {}
        db = null;

        if (progressBar) progressBar.style.width = '35%';

        try {
            await clearTileCaches();
        } catch (_) {}

        if (progressBar) progressBar.style.width = '60%';

        /*
         * Tentative non bloquante de supprimer l'ancienne base historique.
         * Si elle est bloquée, on n'échoue plus : la nouvelle base v12.20 sera utilisée.
         */
        try {
            if (typeof indexedDB !== 'undefined') {
                const legacyReq = indexedDB.deleteDatabase('OfflineTilesDB');
                legacyReq.onerror = () => {};
                legacyReq.onblocked = () => {};
            }
        } catch (_) {}

        localStorage.removeItem('installedMapPacks');
        localStorage.removeItem(OFFLINE_ACTIVE_PACKS_KEY);
        localStorage.removeItem(OFFLINE_ACTIVE_PACK_DATABASES_KEY);
        localStorage.setItem(OFFLINE_TILES_ENABLED_KEY, String(DEFAULT_OFFLINE_TILES_ENABLED));
        activeOfflinePacks = [];

        await initDB();

        if (progressBar) progressBar.style.width = '100%';
        if (statusMessage) statusMessage.textContent = 'Stockage offline réinitialisé sur nouvelle base. Rechargement...';

        setTimeout(() => {
            const refreshUrl = new URL(window.location.href);
            refreshUrl.searchParams.set('appv', APP_VERSION);
            refreshUrl.searchParams.set('ts', Date.now().toString());
            window.location.replace(refreshUrl.toString());
        }, 700);
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        if (statusMessage) statusMessage.textContent = `Réinitialisation impossible : ${message}`;
        alert(`Réinitialisation impossible : ${message}`);
    }
};;


/*
 * v13.70 — reset profond offline iPad.
 * Le reset logique ne suffit pas sur iPadOS quand IndexedDB reste verrouillée :
 * l'import suivant peut bloquer dès 31 tuiles, et seule la suppression de la PWA
 * libère réellement le stockage. Cette version :
 * - utilise une nouvelle base OfflineTilesDB_v13_70_clean ;
 * - ferme la connexion page + service worker ;
 * - supprime les bases OfflineTilesDB connues quand Safari l'autorise ;
 * - désinscrit le service worker uniquement pendant le reset, puis recharge l'app
 *   pour qu'il soit réinstallé proprement.
 */
function deleteIndexedDatabaseWithTimeoutForNpf(name, timeoutMs = 3200) {
    return new Promise((resolve) => {
        if (!name || typeof indexedDB === 'undefined') {
            resolve({ name, status: 'skipped' });
            return;
        }
        let done = false;
        const finish = (status, detail = '') => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve({ name, status, detail });
        };
        const timer = setTimeout(() => finish('timeout'), timeoutMs);
        try {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => finish('deleted');
            request.onerror = () => finish('error', request.error && request.error.message ? request.error.message : 'deleteDatabase error');
            request.onblocked = () => finish('blocked');
        } catch (error) {
            finish('exception', error && error.message ? error.message : String(error));
        }
    });
}

async function getNpfOfflineDatabaseNamesForReset() {
    const names = new Set([
        OFFLINE_DB_NAME,
        'OfflineTilesDB',
        'OfflineTilesDB_v12_20',
        'OfflineTilesDB_v12_21',
        'OfflineTilesDB_v13_70_clean'
    ]);
    try {
        if (indexedDB && typeof indexedDB.databases === 'function') {
            const databases = await indexedDB.databases();
            (databases || []).forEach((entry) => {
                const name = entry && entry.name ? String(entry.name) : '';
                if (/^OfflineTilesDB/i.test(name) || /^OfflineMap_/i.test(name)) names.add(name);
            });
        }
    } catch (_) {}
    return Array.from(names).filter(Boolean);
}

window.resetAllOfflineMapsStorage = async function() {
    const confirmed = confirm(
        'Réinitialisation profonde des cartes offline ?\n\n' +
        'Cette action désactive la carte offline, ferme IndexedDB, nettoie les bases de tuiles et recharge NPF.\n' +
        'Elle remplace la suppression complète de la PWA dans la plupart des cas.'
    );
    if (!confirmed) return;

    const progressSection = document.getElementById('import-progress-section');
    const statusMessage = document.getElementById('import-status-message') || document.getElementById('offline-status');
    const progressBar = document.getElementById('import-progress-bar');
    const setProgress = async (message, percent) => {
        if (progressSection) progressSection.style.display = 'block';
        if (progressBar && typeof percent === 'number') progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        if (statusMessage) statusMessage.textContent = message;
        await new Promise(resolve => setTimeout(resolve, 60));
    };

    try {
        isZipImportRunning = false;
        try { sessionStorage.removeItem('npfZipImportRunning'); } catch (_) {}

        await setProgress('Réinitialisation profonde : suspension carte offline...', 5);
        try {
            mapSourceMode = 'online';
            localStorage.setItem(MAP_SOURCE_MODE_KEY, 'online');
            offlineTilesMode = false;
            activeOfflinePacks = [];
            localStorage.setItem(OFFLINE_TILES_ENABLED_KEY, 'false');
            localStorage.setItem(OFFLINE_ACTIVE_PACKS_KEY, JSON.stringify([]));
            localStorage.setItem(OFFLINE_ACTIVE_PACK_DATABASES_KEY, JSON.stringify([]));
            localStorage.setItem(OFFLINE_ONLINE_FALLBACK_KEY, 'false');
            localStorage.removeItem('installedMapPacks');
            notifyServiceWorkerOfflineTilesPreference(false);
            notifyServiceWorkerOfflineOnlineFallback(false);
            notifyServiceWorkerActivePacks([]);
        } catch (_) {}

        try {
            if (map && baseTileLayer) {
                map.removeLayer(baseTileLayer);
                baseTileLayer = null;
            }
        } catch (_) {}

        await setProgress('Fermeture service worker / IndexedDB...', 18);
        try {
            await postServiceWorkerMessageWithAck({ type: 'OFFLINE_FACTORY_RESET' }, 'OFFLINE_IMPORT_READY', 2500);
        } catch (_) {}

        try {
            if (db) db.close();
        } catch (_) {}
        db = null;

        await setProgress('Nettoyage caches de tuiles...', 35);
        try { await clearTileCaches(); } catch (_) {}

        await setProgress('Service worker conservé pour le mode hors ligne...', 48);
        /*
         * v13.71 — on ne désinscrit plus le service worker pendant le reset.
         * La désinscription v13.70 nettoyait parfois trop bien : la PWA pouvait
         * repartir sans contrôleur SW, donc les tuiles offline n'étaient plus
         * servies. On ferme seulement sa connexion IndexedDB via OFFLINE_FACTORY_RESET.
         */
        await new Promise(resolve => setTimeout(resolve, 600));

        await setProgress('Suppression bases offline...', 62);
        const dbNames = await getNpfOfflineDatabaseNamesForReset();
        const results = [];
        for (const name of dbNames) {
            const result = await deleteIndexedDatabaseWithTimeoutForNpf(name, 3200);
            results.push(result);
        }
        const blockedOrTimedOut = results.filter(r => r && (r.status === 'blocked' || r.status === 'timeout'));

        try {
            localStorage.removeItem('installedMapPacks');
            localStorage.removeItem(OFFLINE_ACTIVE_PACKS_KEY);
            localStorage.removeItem(OFFLINE_ACTIVE_PACK_DATABASES_KEY);
            localStorage.setItem(OFFLINE_TILES_ENABLED_KEY, 'false');
            localStorage.setItem(MAP_SOURCE_MODE_KEY, 'online');
            localStorage.setItem('npfOfflineDeepResetAt', String(Date.now()));
        } catch (_) {}

        await setProgress(blockedOrTimedOut.length
            ? 'Reset profond terminé avec bases verrouillées ignorées. Rechargement sur base neuve...'
            : 'Reset profond terminé. Rechargement sur base neuve...', 100);

        try {
            await ensureServiceWorkerControlsPageForOffline();
        } catch (_) {}

        setTimeout(() => {
            const refreshUrl = new URL(window.location.href);
            refreshUrl.searchParams.set('appv', APP_VERSION);
            refreshUrl.searchParams.set('resetdb', Date.now().toString());
            refreshUrl.searchParams.set('swkeep', '1');
            window.location.replace(refreshUrl.toString());
        }, 900);
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        if (statusMessage) statusMessage.textContent = `Réinitialisation profonde impossible : ${message}`;
        alert(`Réinitialisation profonde impossible : ${message}\n\nDernier recours : supprimer la PWA puis la réinstaller.`);
    }
};


window.deleteMapGroup = async function(groupName) {
    const packNames = getInstalledPackNamesForGroup(groupName);
    if (!packNames.length) {
        alert(`Aucun pack trouvé pour ${groupName}.`);
        displayInstalledMaps();
        return;
    }

    if (shouldUseLogicalDeleteForOfflineGroup(groupName, packNames)) {
        if (!confirm(`Retirer "${groupName}" de l'application ?\n\nOpenStreet est très volumineux : la suppression physique des tuiles peut bloquer l'iPad.\nCette action désactive la carte et la retire de la liste installée.`)) {
            return;
        }

        const removedCount = removeInstalledOfflinePacksLogically(packNames);
        displayInstalledMaps();
        alert(`Carte "${groupName}" retirée (${removedCount} fichier(s)).\nLes anciennes tuiles pourront rester dans le stockage Safari jusqu'à un nettoyage système.`);
        return;
    }

    if (!confirm(`Supprimer définitivement la carte "${groupName}" (${packNames.length} fichier(s)) ?\nCette opération peut prendre du temps sur iPad.`)) {
        return;
    }

    const statusMessage = document.getElementById('import-status-message') || document.getElementById('offline-status');
    const progressSection = document.getElementById('import-progress-section');
    const progressBar = document.getElementById('import-progress-bar');

    if (progressSection) progressSection.style.display = 'block';
    if (progressBar) progressBar.style.width = '0%';

    try {
        await releaseOfflineDatabaseForHeavyOperation(`Suppression ${groupName}`);
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'OFFLINE_MASS_DELETE_START' });
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    } catch (_) {}

    let totalDeleted = 0;
    for (let i = 0; i < packNames.length; i += 1) {
        const packName = packNames[i];
        if (statusMessage) {
            statusMessage.textContent = `Suppression ${i + 1}/${packNames.length} : ${packName}...`;
        }
        if (progressBar) {
            progressBar.style.width = `${Math.round((i / packNames.length) * 100)}%`;
        }

        const deleted = await window.deleteMapPack(packName, {
            silent: true,
            noReload: true,
            alreadyConfirmed: true,
            onProgress: (deletedSoFar, mode, loops) => {
                if (statusMessage) {
                    statusMessage.textContent = `Suppression ${i + 1}/${packNames.length} : ${packName} — ${deletedSoFar} tuiles (${mode})`;
                }
                if (progressBar) {
                    const basePercent = (i / packNames.length) * 100;
                    const chunkPercent = Math.min(1, loops / 50) * (100 / packNames.length);
                    progressBar.style.width = `${Math.min(99, Math.round(basePercent + chunkPercent))}%`;
                }
            }
        });
        totalDeleted += Number(deleted || 0);

        await new Promise(resolve => setTimeout(resolve, 40));
    }

    if (progressBar) progressBar.style.width = '100%';

    if (activeOfflinePacks.some(name => packNames.includes(name))) {
        await persistSimpleActiveOfflinePacks([]);
    }

    displayInstalledMaps();

    if (statusMessage) {
        statusMessage.textContent = `Carte "${groupName}" supprimée : ${totalDeleted} tuile(s).`;
    }
    alert(`Carte "${groupName}" supprimée (${packNames.length} fichier(s), ${totalDeleted} tuile(s)).`);
};

window.deleteMapPack = async function(packName, options = {}) {
    if (!options.alreadyConfirmed && !options.silent) {
        if (!confirm(`Voulez-vous vraiment supprimer le pack de cartes "${packName}" ?\nCette opération peut prendre du temps.`)) {
            return 0;
        }
    }

    try {
        const deletedCount = await deleteTilesForPackName(packName, options.onProgress || null);

        if (!options.silent) {
            alert(`${deletedCount} tuiles du pack "${packName}" ont été supprimées.`);
        }

        let installedPacks = JSON.parse(localStorage.getItem('installedMapPacks') || '[]');
        installedPacks = installedPacks.filter(p => p.name !== packName);
        localStorage.setItem('installedMapPacks', JSON.stringify(installedPacks));

        if (Array.isArray(activeOfflinePacks) && activeOfflinePacks.includes(packName)) {
            await persistSimpleActiveOfflinePacks(activeOfflinePacks.filter(name => name !== packName));
            if (!options.noReload) {
                reloadAfterOfflinePackChange(`Pack ${packName} supprimé. Rechargement...`);
                return deletedCount;
            }
        }

        if (!options.noReload) displayInstalledMaps();
        return deletedCount;

    } catch (error) {
        alert(`Erreur lors de la suppression du pack : ${error.message || error}`);
        console.error("Erreur de suppression:", error);
        return 0;
    }
};

async function deleteTilesForPackName(packName, onProgress = null) {
    /*
     * v12.18 — suppression par getAllKeys + lots courts.
     *
     * v12.17 utilisait un curseur et s'arrêtait volontairement par chunk.
     * Sur Safari/iPadOS, cette méthode peut rester silencieuse au premier curseur
     * sur une très grosse IndexedDB.
     *
     * Nouvelle méthode :
     * - récupérer jusqu'à 500 clés du pack par l'index packName ;
     * - supprimer ces clés dans une transaction courte ;
     * - recommencer jusqu'à zéro clé ;
     * - fallback scan complet si l'index ne trouve rien.
     */
    if (!packName) return 0;
    const tileDbNameForDelete = getOfflinePackDatabaseName(packName);
    let targetDbForDelete = db;
    let closeTargetDbForDelete = false;
    if (tileDbNameForDelete && tileDbNameForDelete !== OFFLINE_DB_NAME) {
        targetDbForDelete = await openOfflineTileDatabaseByName(tileDbNameForDelete, 3);
        closeTargetDbForDelete = true;
    }
    if (!targetDbForDelete) return 0;

    const CHUNK_SIZE = 500;
    let totalDeleted = 0;
    const sleep = (delay = 0) => new Promise(resolve => setTimeout(resolve, delay));

    const getKeysByIndex = () => new Promise((resolve, reject) => {
        try {
            const tx = targetDbForDelete.transaction('tiles', 'readonly');
            const store = tx.objectStore('tiles');

            if (!(store.indexNames && store.indexNames.contains('packName')) || typeof store.index('packName').getAllKeys !== 'function') {
                resolve(null);
                return;
            }

            const req = store.index('packName').getAllKeys(IDBKeyRange.only(packName), CHUNK_SIZE);
            req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
            req.onerror = () => reject(req.error || new Error('Erreur getAllKeys suppression'));
        } catch (error) {
            reject(error);
        }
    });

    const deleteKeys = (keys = []) => new Promise((resolve, reject) => {
        if (!keys.length) {
            resolve(0);
            return;
        }

        try {
            let tx;
            try {
                tx = targetDbForDelete.transaction('tiles', 'readwrite', { durability: 'relaxed' });
            } catch (_) {
                tx = targetDbForDelete.transaction('tiles', 'readwrite');
            }

            const store = tx.objectStore('tiles');
            keys.forEach(key => store.delete(key));

            tx.oncomplete = () => resolve(keys.length);
            tx.onerror = () => reject(tx.error || new Error('Erreur suppression clés'));
            tx.onabort = () => reject(tx.error || new Error('Transaction suppression annulée'));
        } catch (error) {
            reject(error);
        }
    });

    const scanAndDeleteChunk = () => new Promise((resolve, reject) => {
        try {
            let tx;
            try {
                tx = targetDbForDelete.transaction('tiles', 'readwrite', { durability: 'relaxed' });
            } catch (_) {
                tx = targetDbForDelete.transaction('tiles', 'readwrite');
            }

            const store = tx.objectStore('tiles');
            const req = store.openCursor();
            let deleted = 0;
            let reachedEnd = false;

            req.onsuccess = event => {
                const cursor = event.target.result;
                if (!cursor) {
                    reachedEnd = true;
                    return;
                }

                const value = cursor.value || {};
                const primaryKey = cursor.primaryKey || value.url || '';
                const shouldDelete = value.packName === packName
                    || String(primaryKey).endsWith(`::${packName}`)
                    || String(value.url || '').endsWith(`::${packName}`);

                if (shouldDelete) {
                    cursor.delete();
                    deleted += 1;
                }

                if (deleted >= CHUNK_SIZE) return;
                cursor.continue();
            };

            req.onerror = () => reject(req.error || new Error('Erreur scan suppression'));
            tx.oncomplete = () => resolve({ deleted, done: reachedEnd || deleted === 0 });
            tx.onerror = () => reject(tx.error || new Error('Erreur transaction scan suppression'));
            tx.onabort = () => reject(tx.error || new Error('Transaction scan suppression annulée'));
        } catch (error) {
            reject(error);
        }
    });

    let loops = 0;
    while (true) {
        loops += 1;

        const keys = await getKeysByIndex();
        if (keys === null) break;
        if (!keys.length) break;

        const deleted = await deleteKeys(keys);
        totalDeleted += deleted;

        if (typeof onProgress === 'function') {
            onProgress(totalDeleted, 'index-keys', loops);
        }

        await sleep(60);

        if (loops > 20000) {
            throw new Error(`Suppression interrompue par sécurité (${packName})`);
        }
    }

    if (totalDeleted === 0) {
        loops = 0;
        while (true) {
            loops += 1;
            const result = await scanAndDeleteChunk();
            totalDeleted += result.deleted || 0;

            if (typeof onProgress === 'function') {
                onProgress(totalDeleted, 'scan', loops);
            }

            await sleep(60);

            if (result.done) break;
            if (loops > 20000) {
                throw new Error(`Suppression scan interrompue par sécurité (${packName})`);
            }
        }
    }

    try { if (closeTargetDbForDelete && targetDbForDelete) targetDbForDelete.close(); } catch (_) {}
    return totalDeleted;
};

// =========================================================================
// LOGIQUE DU CALCULATEUR DE MISSION
// =========================================================================
let CALCULATOR_DATA = { distBaseFeu: 0, distPelicFeu: 0, csFeu: '--:--', distGpsFeu: 0 };
const calculateBingo = (dist) => (dist <= 70) ? (dist * 5) + 700 : (dist * 4) + 700;
const calculateFuelToGo = (dist) => (dist <= 70) ? (dist * 5) : (dist * 4);
const calculateConsoRotation = (dist) => { const effectiveDist = Math.max(dist, 10); return (effectiveDist <= 70) ? (effectiveDist * 10) + 250 : (effectiveDist * 8) + 250; };
const calculateTransitTime = (dist) => (dist <= 70) ? (dist * (60 / 210)) : (dist * (60 / 240));
const calculateRotationTime = (dist) => {
    const effectiveDist = Math.max(dist, 10);
    const rotationDistance = effectiveDist * 2;
    return (effectiveDist <= 50) ? (20 + (rotationDistance / 3.5)) : (20 + (rotationDistance / 4));
};
let masterRecalculate = () => {};
let isSuiviConsoManual = false, isSuiviDureeManual = false;
const MULTI_FLIGHT_STORAGE_KEY = 'calculator_flights_v12_28';
const ACTIVE_FLIGHT_ID_STORAGE_KEY = 'calculator_active_flight_id_v12_28';
const DEROUT_EMPTY_RETARDANT_KEY = 'derout_empty_retardant_v12_29';
let dailyFlights = [];
let activeFlightId = null;
let isApplyingFlightState = false;
const parseTime = (timeString) => { if (!timeString || !timeString.includes(':')) return null; const parts = timeString.split(':'); return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10); };
const formatTime = (totalMinutes) => { if (totalMinutes === null || isNaN(totalMinutes) || totalMinutes < 0) return ''; const roundedMinutes = Math.round(totalMinutes); const hours = Math.floor(roundedMinutes / 60); const minutes = roundedMinutes % 60; return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`; };
function normalizeClockLimitAfterReference(limitMinutes, referenceMinutes) {
    if (limitMinutes === null || !Number.isFinite(limitMinutes)) return limitMinutes;
    if (referenceMinutes === null || !Number.isFinite(referenceMinutes)) return limitMinutes;
    let normalized = limitMinutes;
    while (normalized < referenceMinutes) normalized += 1440;
    return normalized;
}
function formatClockLimitTime(totalMinutes) {
    if (totalMinutes === null || !Number.isFinite(totalMinutes) || totalMinutes < 0) return '';
    const roundedMinutes = Math.round(totalMinutes);
    const dayOffset = Math.floor(roundedMinutes / 1440);
    const minutesOfDay = ((roundedMinutes % 1440) + 1440) % 1440;
    const hours = Math.floor(minutesOfDay / 60);
    const minutes = minutesOfDay % 60;
    const suffix = dayOffset > 0 ? ` +${dayOffset}j` : '';
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}${suffix}`;
}
const parseNumeric = (numericString) => { if (!numericString) return null; const value = parseInt(numericString.replace(/[^0-9]/g, ''), 10); return isNaN(value) ? null : value; };

function updateAndSortRotations(container, current, params) {
    const FIRST_DROP_FORFAIT_MIN = Number.isFinite(params.firstDropForfaitMin) ? params.firstDropForfaitMin : 10;
    const lines = Array.from(container.querySelectorAll('.result-line'));
    const resultsData = [];
    let minTimeLimit = Infinity;
    let minFuelLimit = Infinity;

    const containerId = container?.id || '';
    const isSuiviRotation = containerId === 'suivi-rotation-results-container';
    const isPreviRotation = containerId === 'previ-rotation-results-container';
    const isDeroutRotation = containerId === 'derout-rotation-results-container';
    const fuelImmediateDropAllowed = (typeof params.allowFuelImmediateDrop === 'boolean') ? params.allowFuelImmediateDrop : !isSuiviRotation;

    const returnBaseTime = Math.round(calculateTransitTime(CALCULATOR_DATA.distBaseFeu || 0));
    const effectivePelicDistance = Math.max(CALCULATOR_DATA.distPelicFeu || 0, 10);
    const rotationSpeedLabel = effectivePelicDistance <= 50 ? '3,5 Nm/min (210 kt)' : '4,0 Nm/min (240 kt)';
    const rotationSpeedValue = effectivePelicDistance <= 50 ? 3.5 : 4;
    const rotationConsoRate = effectivePelicDistance <= 70 ? 10 : 8;
    const baseConsoRate = (CALCULATOR_DATA.distBaseFeu || 0) <= 70 ? 5 : 4;
    const pelicConsoRate = (CALCULATOR_DATA.distPelicFeu || 0) <= 70 ? 5 : 4;

    const numberOrNA = value => Number.isFinite(value) ? value : 'N/A';
    const kgOrNA = value => Number.isFinite(value) ? `${value} kg` : 'N/A';
    const minOrNA = value => Number.isFinite(value) ? `${Math.round(value)} min` : 'N/A';
    const timeOrNA = value => (value !== null && Number.isFinite(value)) ? formatTime(value) : 'N/A';

    const rotationFormulaDetails = () => [
        `Durée rotation feu ↔ pélic = 20 min + ((Distance retenue × 2) / Vitesse)`,
        `Distance retenue = max(Distance Feu → Pélic, 10 Nm) = ${effectivePelicDistance} Nm`,
        `Vitesse = ${rotationSpeedLabel}`,
        `Durée rotation = 20 + ((${effectivePelicDistance} × 2) / ${rotationSpeedValue}) = ${minOrNA(params.rotationTime)}`,
        ``,
        `Conso rotation feu ↔ pélic = Distance retenue × conso aller-retour + forfait largage`,
        `Conso aller-retour = 10 kg/Nm si distance ≤ 70 Nm, sinon 8 kg/Nm`,
        `Forfait largage = 250 kg`,
        `Conso rotation = (${effectivePelicDistance} × ${rotationConsoRate}) + 250 = ${kgOrNA(params.consoRotation)}`
    ].join('\n');

    const bingoBaseDetails = () => [
        `BINGO Base = 700 kg + conso Feu → Base`,
        `Distance Feu → Base = ${numberOrNA(CALCULATOR_DATA.distBaseFeu)} Nm`,
        `Conso = ${baseConsoRate} kg/Nm (${(CALCULATOR_DATA.distBaseFeu || 0) <= 70 ? 'distance ≤ 70 Nm' : 'distance > 70 Nm'})`,
        `BINGO Base = 700 + (${numberOrNA(CALCULATOR_DATA.distBaseFeu)} × ${baseConsoRate}) = ${kgOrNA(params.bingoBase)}`
    ].join('\n');

    const bingoPelicDetails = () => [
        `BINGO Pélic = 700 kg + conso Feu → Pélic`,
        `Distance Feu → Pélic = ${numberOrNA(CALCULATOR_DATA.distPelicFeu)} Nm`,
        `Conso = ${pelicConsoRate} kg/Nm (${(CALCULATOR_DATA.distPelicFeu || 0) <= 70 ? 'distance ≤ 70 Nm' : 'distance > 70 Nm'})`,
        `BINGO Pélic = 700 + (${numberOrNA(CALCULATOR_DATA.distPelicFeu)} × ${pelicConsoRate}) = ${kgOrNA(params.bingoPelic)}`
    ].join('\n');

    const currentContextDetails = () => [
        params.currentTimeLabel ? `${params.currentTimeLabel} = ${timeOrNA(current.time)}` : `Heure sur feu = ${timeOrNA(current.time)}`,
        `Fuel sur feu = ${kgOrNA(current.fuel)}`,
        params.transitSourceLabel ? `Terrain départ premier transit = ${params.transitSourceLabel}` : null,
        params.preTransitForfaitMin ? `Forfait départ/roulage/décollage = ${params.preTransitForfaitMin} min` : null,
        `Transit vers feu = ${minOrNA(params.rawTransitTime ?? params.transitTime)}`,
        params.effectiveTransitDistance !== undefined ? `Distance transit retenue = ${numberOrNA(params.effectiveTransitDistance)} Nm` : null,
        `Forfait validation premier largage = ${FIRST_DROP_FORFAIT_MIN} min`,
        `Retour feu → base = ${minOrNA(returnBaseTime)}`
    ].filter(Boolean).join('\n');

    // --- Première passe : calculer toutes les valeurs et trouver les limites ---
    lines.forEach(line => {
        const type = line.dataset.rotationType;
        let value = null;
        let formulaString = "Données insuffisantes pour le calcul.";

        const canCalculateFuel = current.fuel !== null && Number.isFinite(current.fuel) && params.consoRotation !== null && Number.isFinite(params.consoRotation) && params.consoRotation > 0;
        const canCalculateTime = current.time !== null && Number.isFinite(current.time) && params.rotationTime !== null && Number.isFinite(params.rotationTime) && params.rotationTime > 0;

        const hasFuelForFirstDropBase = fuelImmediateDropAllowed && canCalculateFuel && current.fuel >= (250 + params.bingoBase);
        const hasFuelForFirstDropPelic = fuelImmediateDropAllowed && canCalculateFuel && current.fuel >= (250 + params.bingoPelic);

        if (type === 'base') {
            const plusOne = hasFuelForFirstDropBase ? 1 : 0;
            formulaString = [
                `FUEL RETOUR BASE`,
                ``,
                currentContextDetails(),
                ``,
                bingoBaseDetails(),
                ``,
                rotationFormulaDetails(),
                ``,
                `Validation du +1 :`,
                fuelImmediateDropAllowed
                    ? `+1 possible si Fuel sur feu ≥ 250 kg + BINGO Base.`
                    : `+1 fuel neutralisé : l'avion n'est pas considéré en situation de largage immédiat.`,
                fuelImmediateDropAllowed
                    ? `Test : ${kgOrNA(current.fuel)} ≥ 250 + ${kgOrNA(params.bingoBase)} = ${kgOrNA(250 + params.bingoBase)} → ${hasFuelForFirstDropBase ? 'OUI' : 'NON'}`
                    : `+1 = 0`,
                ``,
                `Formule finale :`,
                `Nbr rotations = ((Fuel sur feu - BINGO Base) / Conso rotation) + ${plusOne}`,
                `Calcul = ((${kgOrNA(current.fuel)} - ${kgOrNA(params.bingoBase)}) / ${kgOrNA(params.consoRotation)}) + ${plusOne}`
            ].join('\n');
            if (canCalculateFuel) value = ((current.fuel - params.bingoBase) / params.consoRotation) + plusOne;
        }
        if (type === 'pelic') {
            const plusOne = hasFuelForFirstDropPelic ? 1 : 0;
            formulaString = [
                `FUEL RETOUR PÉLIC`,
                ``,
                currentContextDetails(),
                ``,
                bingoPelicDetails(),
                ``,
                rotationFormulaDetails(),
                ``,
                `Validation du +1 :`,
                fuelImmediateDropAllowed
                    ? `+1 possible si Fuel sur feu ≥ 250 kg + BINGO Pélic.`
                    : `+1 fuel neutralisé : l'avion n'est pas considéré en situation de largage immédiat.`,
                fuelImmediateDropAllowed
                    ? `Test : ${kgOrNA(current.fuel)} ≥ 250 + ${kgOrNA(params.bingoPelic)} = ${kgOrNA(250 + params.bingoPelic)} → ${hasFuelForFirstDropPelic ? 'OUI' : 'NON'}`
                    : `+1 = 0`,
                ``,
                `Formule finale :`,
                `Nbr rotations = ((Fuel sur feu - BINGO Pélic) / Conso rotation) + ${plusOne}`,
                `Calcul = ((${kgOrNA(current.fuel)} - ${kgOrNA(params.bingoPelic)}) / ${kgOrNA(params.consoRotation)}) + ${plusOne}`
            ].join('\n');
            if (canCalculateFuel) value = ((current.fuel - params.bingoPelic) / params.consoRotation) + plusOne;
        }
        if (type === 'cs') {
            const firstDropTime = canCalculateTime ? current.time + FIRST_DROP_FORFAIT_MIN : null;
            const canFirstDropBeforeCs = canCalculateTime && params.csFeuTime !== null && Number.isFinite(params.csFeuTime) && firstDropTime <= params.csFeuTime;
            const remainingAfterFirstDrop = canFirstDropBeforeCs ? (params.csFeuTime - firstDropTime) : null;
            formulaString = [
                `COUCHER SOLEIL`,
                ``,
                currentContextDetails(),
                `Coucher soleil sur feu = ${timeOrNA(params.csFeuTime)}`,
                ``,
                rotationFormulaDetails(),
                ``,
                `Validation du +1 :`,
                `+1 possible uniquement si Heure sur feu + ${FIRST_DROP_FORFAIT_MIN} min ≤ CS.`,
                `Test : ${timeOrNA(current.time)} + ${FIRST_DROP_FORFAIT_MIN} min = ${timeOrNA(firstDropTime)} ≤ ${timeOrNA(params.csFeuTime)} → ${canFirstDropBeforeCs ? 'OUI' : 'NON'}`,
                ``,
                `Si le +1 est impossible : résultat = 0.`,
                `Si le +1 est possible :`,
                `Nbr rotations CS = 1 + ((CS - Heure premier largage) / Durée rotation)`,
                `Heure premier largage = Heure sur feu + ${FIRST_DROP_FORFAIT_MIN} min`,
                `Calcul = 1 + ((${timeOrNA(params.csFeuTime)} - ${timeOrNA(firstDropTime)}) / ${minOrNA(params.rotationTime)})`
            ].join('\n');
            if (canCalculateTime && params.csFeuTime !== null && Number.isFinite(params.csFeuTime)) {
                value = canFirstDropBeforeCs ? 1 + (remainingAfterFirstDrop / params.rotationTime) : 0;
            }
        }
        if (type === 'tmd') {
            const firstDropTime = canCalculateTime ? current.time + FIRST_DROP_FORFAIT_MIN : null;
            const backBaseAfterFirstDropTime = canCalculateTime ? firstDropTime + returnBaseTime : null;
            const effectiveTmdTime = normalizeClockLimitAfterReference(params.tmdTime, current.time);
            const canFirstDropAndReturnBeforeTmd = canCalculateTime && effectiveTmdTime !== null && Number.isFinite(effectiveTmdTime) && backBaseAfterFirstDropTime <= effectiveTmdTime;
            const remainingForRotations = canFirstDropAndReturnBeforeTmd ? (effectiveTmdTime - firstDropTime - returnBaseTime) : null;
            formulaString = [
                `TMD`,
                ``,
                currentContextDetails(),
                `Fin TMD = ${formatClockLimitTime(effectiveTmdTime) || 'N/A'}`,
                ``,
                rotationFormulaDetails(),
                ``,
                `Validation du +1 :`,
                `+1 possible uniquement si l'avion peut arriver sur feu, larguer avec le forfait ${FIRST_DROP_FORFAIT_MIN} min, puis revenir base avant la fin TMD.`,
                `Test : Heure sur feu + ${FIRST_DROP_FORFAIT_MIN} min + retour base ≤ TMD`,
                `Test : ${timeOrNA(current.time)} + ${FIRST_DROP_FORFAIT_MIN} min + ${minOrNA(returnBaseTime)} = ${formatClockLimitTime(backBaseAfterFirstDropTime) || 'N/A'} ≤ ${formatClockLimitTime(effectiveTmdTime) || 'N/A'} → ${canFirstDropAndReturnBeforeTmd ? 'OUI' : 'NON'}`,
                ``,
                `Si le +1 est impossible : résultat = 0.`,
                `Si le +1 est possible :`,
                `Nbr rotations TMD = 1 + ((TMD - Heure premier largage - Retour base final) / Durée rotation)`,
                `Heure premier largage = Heure sur feu + ${FIRST_DROP_FORFAIT_MIN} min`,
                `Calcul = 1 + ((${formatClockLimitTime(effectiveTmdTime) || 'N/A'} - ${formatClockLimitTime(firstDropTime) || 'N/A'} - ${minOrNA(returnBaseTime)}) / ${minOrNA(params.rotationTime)})`
            ].join('\n');
            if (canCalculateTime && effectiveTmdTime !== null && Number.isFinite(effectiveTmdTime)) {
                value = canFirstDropAndReturnBeforeTmd ? 1 + (remainingForRotations / params.rotationTime) : 0;
            }
        }
        if (type === 'hdv') {
            const canFirstDropAndReturnWithinHdv = canCalculateTime && params.limiteHDV !== null && Number.isFinite(params.limiteHDV)
                && params.transitTime !== null && Number.isFinite(params.transitTime)
                && (params.transitTime + FIRST_DROP_FORFAIT_MIN + returnBaseTime) <= params.limiteHDV;
            const remainingForRotations = canFirstDropAndReturnWithinHdv ? (params.limiteHDV - params.transitTime - FIRST_DROP_FORFAIT_MIN - returnBaseTime) : null;
            formulaString = [
                `HDV RESTANTES`,
                ``,
                currentContextDetails(),
                `HDV restantes disponibles = ${timeOrNA(params.limiteHDV)}`,
                ``,
                rotationFormulaDetails(),
                ``,
                `Validation du +1 :`,
                `Même logique que TMD, mais en durée restante : +1 possible uniquement si Transit vers feu + ${FIRST_DROP_FORFAIT_MIN} min + retour base ≤ HDV restantes.`,
                `Test : ${minOrNA(params.transitTime)} + ${FIRST_DROP_FORFAIT_MIN} min + ${minOrNA(returnBaseTime)} = ${minOrNA((params.transitTime || 0) + FIRST_DROP_FORFAIT_MIN + returnBaseTime)} ≤ ${timeOrNA(params.limiteHDV)} → ${canFirstDropAndReturnWithinHdv ? 'OUI' : 'NON'}`,
                ``,
                `Si le +1 est impossible : résultat = 0.`,
                `Si le +1 est possible :`,
                `Nbr rotations HDV = 1 + ((HDV restantes - Transit vers feu - ${FIRST_DROP_FORFAIT_MIN} min - Retour base final) / Durée rotation)`,
                `Calcul = 1 + ((${timeOrNA(params.limiteHDV)} - ${minOrNA(params.transitTime)} - ${FIRST_DROP_FORFAIT_MIN} min - ${minOrNA(returnBaseTime)}) / ${minOrNA(params.rotationTime)})`
            ].join('\n');
            if (canCalculateTime && params.limiteHDV !== null && Number.isFinite(params.limiteHDV)) {
                value = canFirstDropAndReturnWithinHdv ? 1 + (remainingForRotations / params.rotationTime) : 0;
            }
        }

        resultsData.push({ type, value, element: line, formulaString });

        if ((type === 'cs' || type === 'tmd' || type === 'hdv') && value !== null) {
            minTimeLimit = Math.min(minTimeLimit, value);
        }
        if ((type === 'base' || type === 'pelic') && value !== null) {
            minFuelLimit = Math.min(minFuelLimit, value);
        }
    });

    // Si une limite temporelle est la première limite atteinte,
    // toute valeur suivante (plus élevée) est impossible et passe en rouge.
    const shouldForceTimeConstraint = minTimeLimit !== Infinity;

    // --- Deuxième passe : appliquer les styles et mettre à jour le DOM ---
    resultsData.forEach(result => {
        const { type, value, element, formulaString } = result;
        const valueCell = element.querySelector('.value');
        const helpIcon = element.querySelector('.formula-help-icon');
        const isTimeLimited = shouldForceTimeConstraint && value !== null && value > minTimeLimit;

        if (value === null) {
            valueCell.textContent = '--';
        } else {
            valueCell.textContent = Math.max(0, value).toFixed(1);
        }

        valueCell.classList.remove('rotation-value-default', 'rotation-value-green', 'rotation-value-yellow', 'rotation-value-red');

        if (isTimeLimited) {
            valueCell.classList.add('rotation-value-red');
        } else {
            if (value === null) {
                 valueCell.classList.add('rotation-value-default');
                 valueCell.textContent = '--';
            } else if (value > 1.5) {
                valueCell.classList.add('rotation-value-green');
            } else if (value >= 1.1) {
                valueCell.classList.add('rotation-value-yellow');
            } else {
                valueCell.classList.add('rotation-value-red');
            }
        }

        if (helpIcon) { helpIcon.onclick = () => alert(formulaString); }
    });

    // --- Trier et ré-insérer les éléments dans le DOM ---
    resultsData.sort((a, b) => {
        const valA = a.value !== null ? Math.max(0, a.value) : Infinity;
        const valB = b.value !== null ? Math.max(0, b.value) : Infinity;
        return valA - valB;
    });

    resultsData.forEach(item => container.appendChild(item.element));
}

function recalculateBlocFuel() {
    const blocDepartWrapper = document.getElementById('bloc-depart');
    const fuelDepartWrapper = document.getElementById('fuel-depart');
    const limiteHdvWrapper = document.getElementById('limite-hdv');

    const blocDepart = parseTime(blocDepartWrapper?.querySelector('.display-input')?.value || '');
    const fuelDepart = parseNumeric(fuelDepartWrapper?.querySelector('.display-input')?.value || '');
    const limiteHDV = (typeof getEffectiveLimitHdvForActiveFlight === 'function')
        ? getEffectiveLimitHdvForActiveFlight()
        : parseTime(limiteHdvWrapper?.querySelector('.display-input')?.value || '');

    /*
     * v12.31 : le champ LIMITE HDV du vol actif affiche déjà le restant journée
     * avant ce vol. Le cumul du tableau repart donc à 0 pour le vol actif.
     */
    let previousBlocArrivee = blocDepart;
    let previousFuelPelic = fuelDepart;
    let cumulativeTpsVol = 0;

    const tableRows = document.querySelectorAll('#bloc-fuel tbody tr');
    tableRows.forEach((row) => {
        const blocArrivee = parseTime(row.querySelector('.time-input-wrapper .display-input')?.value || '');
        const fuelPelic = parseNumeric(row.querySelector('.numeric-input-wrapper .display-input')?.value || '');

        const dureeCell = row.querySelector('.duree-rotation-cell');
        const fuelCell = row.querySelector('.fuel-rotation-cell');
        const tpsVolCell = row.querySelector('.tps-vol-cell');
        const tpsRestantCell = row.querySelector('.tps-vol-restant-cell');
        const rltWrapper = row.querySelector('.rlt-mass-input-wrapper');
        const isFirstFullRlt = rltWrapper?.dataset.rltFirstFull === '1' || rltWrapper?.dataset.rltMode === 'firstFull';
        row.classList.toggle('bloc-fuel-first-full-row', !!isFirstFullRlt);
        if (!isFirstFullRlt) {
            row.classList.remove('bloc-fuel-first-full-row');
        }
        if (isFirstFullRlt) {
            /*
             * v12.84 — Plein au départ : la ligne reste une ligne de départ
             * exploitable. On ne verrouille/masque plus Fuel ni OACI : ces
             * deux valeurs servent notamment au premier transit Suivi rotations.
             * Seules les colonnes de rotations calculées restent vides pour
             * cette ligne.
             */
            if (dureeCell) dureeCell.textContent = '';
            if (fuelCell) fuelCell.textContent = '';
            if (tpsVolCell) tpsVolCell.textContent = '';
            if (tpsRestantCell) tpsRestantCell.textContent = '';
            try { updateRowAirportOaci(row); } catch (_) {}
            if (blocArrivee !== null) previousBlocArrivee = blocArrivee;
            if (fuelPelic !== null) previousFuelPelic = fuelPelic;
            return;
        }

        let dureeRotation = null;
        if (blocArrivee !== null && previousBlocArrivee !== null) {
            dureeRotation = blocArrivee - previousBlocArrivee;
        }

        let fuelRotation = null;
        if (fuelPelic !== null && previousFuelPelic !== null) {
            fuelRotation = previousFuelPelic - fuelPelic;
        }

        if (dureeCell) dureeCell.textContent = formatTime(dureeRotation) || '--';
        if (fuelCell) fuelCell.textContent = (fuelRotation === null) ? '--' : `${fuelRotation}`;

        if (blocArrivee !== null) {
            if (dureeRotation !== null && dureeRotation > 0) {
                cumulativeTpsVol += dureeRotation;
            }

            let tpsVolRestant = null;
            if (limiteHDV !== null) {
                tpsVolRestant = limiteHDV - cumulativeTpsVol;
            }

            if (tpsVolCell) tpsVolCell.textContent = formatTime(cumulativeTpsVol) || '00:00';
            if (tpsRestantCell) tpsRestantCell.textContent = formatTime(tpsVolRestant) || '--';
        } else {
            if (tpsVolCell) tpsVolCell.textContent = '--';
            if (tpsRestantCell) tpsRestantCell.textContent = '--';
        }

        if (blocArrivee !== null) previousBlocArrivee = blocArrivee;
        if (fuelPelic !== null) previousFuelPelic = fuelPelic;
    });
}

// v13.88 TEST — Fuel sur feu Prévi en lecture seule, RLT départ et espacements ajustés.
function updatePreviTab() {
    const defaultFormula = "Données insuffisantes pour le calcul.";
    const setHelp = (id, formula) => {
        const icon = document.getElementById(id);
        if (icon) { icon.onclick = () => alert(formula || defaultFormula); }
    };

    if (!currentCommune) {
        document.getElementById('previ-bingo-base').innerHTML = '-- kg';
        document.getElementById('previ-bingo-pelic').innerHTML = '-- kg';
        document.querySelectorAll('#previ-rotation-results-container .value').forEach(el => { el.textContent = '--'; el.className = 'value rotation-value-default'; });
        document.getElementById('heure-sur-feu').textContent = '--:--';
        document.getElementById('duree-transit').textContent = '--:--';
        document.getElementById('conso-aller-feu').textContent = '-- kg';
        const previFuelSurFeuNoCommune = document.getElementById('fuel-sur-feu'); if (previFuelSurFeuNoCommune) previFuelSurFeuNoCommune.textContent = '-- kg';
        document.getElementById('duree-rotation').textContent = '--:--';
        document.getElementById('conso-par-rotation').textContent = '-- kg';
        document.getElementById('cs-sur-feu').textContent = '--:--';
        setHelp('heure-sur-feu-help'); setHelp('duree-transit-help'); setHelp('conso-aller-feu-help');
        setHelp('fuel-sur-feu-help'); setHelp('duree-rotation-help'); setHelp('conso-par-rotation-help');
        return;
    }

    const bingoBase = calculateBingo(CALCULATOR_DATA.distBaseFeu);
    const bingoPelic = calculateBingo(CALCULATOR_DATA.distPelicFeu);
    const bingoBaseDisplay = document.getElementById('previ-bingo-base');
    if (bingoBase === 700) { bingoBaseDisplay.innerHTML = '-- kg'; } else { bingoBaseDisplay.innerHTML = `${selectedBaseOACI} / ${CALCULATOR_DATA.distBaseFeu} Nm /&nbsp;<b>${bingoBase} kg</b>`; }
    const bingoPelicDisplay = document.getElementById('previ-bingo-pelic');
    if (bingoPelic === 700 || !selectedPelicanOACI) { bingoPelicDisplay.innerHTML = '-- kg'; } else { bingoPelicDisplay.innerHTML = `${selectedPelicanOACI} / ${CALCULATOR_DATA.distPelicFeu} Nm /&nbsp;<b>${bingoPelic} kg</b>`; }

    const heureTO = parseTime(document.getElementById('previ-bloc-depart').querySelector('.display-input').value);
    const fuelDepart = parseNumeric(document.getElementById('previ-fuel-depart').querySelector('.display-input').value);
    const limiteHDV = parseTime(document.getElementById('previ-limite-hdv').querySelector('.display-input').value);
    const tmdTime = parseTime(document.getElementById('previ-tmd').querySelector('.display-input').value);
    const csFeuTime = parseTime(CALCULATOR_DATA.csFeu);

    const transitTime = Math.round(calculateTransitTime(CALCULATOR_DATA.distBaseFeu));
    const rotationTime = Math.round(calculateRotationTime(CALCULATOR_DATA.distPelicFeu));
    const consoRotation = calculateConsoRotation(CALCULATOR_DATA.distPelicFeu);
    const consoAller = calculateFuelToGo(CALCULATOR_DATA.distBaseFeu);
    const heureSurFeu = heureTO !== null ? heureTO + transitTime : null;

    document.getElementById('duree-transit').textContent = formatTime(transitTime) || '--:--';
    setHelp('duree-transit-help', `DURÉE TRANSIT BASE → FEU\n\nFormule : Distance Base → Feu × (60 / Vitesse)\n\nRègle vitesse :\n- Distance ≤ 70 Nm : 210 kt\n- Distance > 70 Nm : 240 kt\n\nDistance Base → Feu : ${CALCULATOR_DATA.distBaseFeu} Nm\nVitesse retenue : ${CALCULATOR_DATA.distBaseFeu <= 70 ? 210 : 240} kt\n\nCalcul : ${CALCULATOR_DATA.distBaseFeu} × (60 / ${CALCULATOR_DATA.distBaseFeu <= 70 ? 210 : 240}) = ${formatTime(transitTime)} (${transitTime} min)`);

    document.getElementById('heure-sur-feu').textContent = formatTime(heureSurFeu) || '--:--';
    setHelp('heure-sur-feu-help', `HEURE SUR FEU\n\nFormule : HEURE TO + Durée transit Base → Feu\n\nHEURE TO : ${formatTime(heureTO) || 'N/A'}\nDurée transit : ${formatTime(transitTime)} (${transitTime} min)\n\nCalcul : ${formatTime(heureTO) || 'N/A'} + ${formatTime(transitTime)} = ${formatTime(heureSurFeu) || 'N/A'}\n\nCette heure sert ensuite à vérifier le +1 Coucher Soleil et TMD avec le forfait de 10 min avant largage.`);

    document.getElementById('conso-aller-feu').textContent = `${consoAller} kg`;
    setHelp('conso-aller-feu-help', `CONSO TRANSIT BASE → FEU\n\nFormule : Distance Base → Feu × Conso au Nm\n\nRègle consommation :\n- Distance ≤ 70 Nm : 5 kg/Nm\n- Distance > 70 Nm : 4 kg/Nm\n\nDistance Base → Feu : ${CALCULATOR_DATA.distBaseFeu} Nm\nConso retenue : ${CALCULATOR_DATA.distBaseFeu <= 70 ? 5 : 4} kg/Nm\n\nCalcul : ${CALCULATOR_DATA.distBaseFeu} × ${CALCULATOR_DATA.distBaseFeu <= 70 ? 5 : 4} = ${consoAller} kg`);

    document.getElementById('duree-rotation').textContent = rotationTime === 20 ? '--:--' : formatTime(rotationTime);
    setHelp('duree-rotation-help', `DURÉE ROTATION FEU ↔ PÉLIC\n\nFormule : 20 min + ((Distance retenue × 2) / Vitesse)\n\nDistance retenue :\n- Distance Feu → Pélicandrome mesurée si ≥ 10 Nm\n- 10 Nm minimum si la distance mesurée est < 10 Nm\n\nDistance Feu → Pélic mesurée : ${CALCULATOR_DATA.distPelicFeu} Nm\nDistance retenue : ${Math.max(CALCULATOR_DATA.distPelicFeu, 10)} Nm\n\nRègle vitesse :\n- Distance retenue ≤ 50 Nm : 3,5 Nm/min, soit 210 kt\n- Distance retenue > 50 Nm : 4,0 Nm/min, soit 240 kt\n\nCalcul : 20 + ((${Math.max(CALCULATOR_DATA.distPelicFeu, 10)} × 2) / ${Math.max(CALCULATOR_DATA.distPelicFeu, 10) <= 50 ? 3.5 : 4}) = ${formatTime(rotationTime)} (${rotationTime} min)\n\nCette durée sert pour les rotations supplémentaires après validation éventuelle du +1.`);

    document.getElementById('conso-par-rotation').textContent = consoRotation === 250 ? '-- kg' : `${consoRotation} kg`;
    setHelp('conso-par-rotation-help', `CONSO ROTATION FEU ↔ PÉLIC\n\nFormule : (Distance retenue × conso aller-retour) + forfait largage\n\nDistance retenue :\n- Distance Feu → Pélicandrome mesurée si ≥ 10 Nm\n- 10 Nm minimum si la distance mesurée est < 10 Nm\n\nDistance Feu → Pélic mesurée : ${CALCULATOR_DATA.distPelicFeu} Nm\nDistance retenue : ${Math.max(CALCULATOR_DATA.distPelicFeu, 10)} Nm\n\nRègle consommation aller-retour :\n- Distance retenue ≤ 70 Nm : 10 kg/Nm\n- Distance retenue > 70 Nm : 8 kg/Nm\n\nForfait largage : 250 kg\n\nCalcul : (${Math.max(CALCULATOR_DATA.distPelicFeu, 10)} × ${Math.max(CALCULATOR_DATA.distPelicFeu, 10) <= 70 ? 10 : 8}) + 250 = ${consoRotation} kg`);

    const fuelSurFeuDisplay = document.getElementById('fuel-sur-feu');
    const fuelEstime = fuelDepart !== null ? fuelDepart - consoAller : null;
    if (fuelSurFeuDisplay) fuelSurFeuDisplay.textContent = fuelEstime !== null ? `${fuelEstime} kg` : '-- kg';
    setHelp('fuel-sur-feu-help', `FUEL SUR FEU

Valeur calculée automatiquement et non modifiable.

Formule : FUEL Départ - Conso transit Base → Feu

FUEL Départ : ${fuelDepart !== null ? fuelDepart : 'N/A'} kg
Conso transit : ${consoAller} kg

Calcul : ${fuelDepart !== null ? fuelDepart : 'N/A'} - ${consoAller} = ${fuelEstime !== null ? fuelEstime + ' kg' : 'N/A'}

Cette valeur sert aux calculs Fuel retour Base/Pélic.`);

    const fuelSurFeu = fuelEstime;

    document.getElementById('cs-sur-feu').textContent = CALCULATOR_DATA.csFeu;
    document.getElementById('tmd-display').textContent = formatTime(tmdTime);
    document.getElementById('hdv-restant-display').textContent = formatTime(limiteHDV);

    updateAndSortRotations(document.getElementById('previ-rotation-results-container'), { fuel: fuelSurFeu, time: heureSurFeu }, { bingoBase, bingoPelic, consoRotation, rotationTime, csFeuTime, tmdTime, limiteHDV, transitTime, consoTransitFromGps: consoAller });
}

function updateSuiviTab() {
    const suiviConsoInput = document.getElementById('suivi-conso-rotation-wrapper').querySelector('.display-input');
    const suiviDureeInput = document.getElementById('suivi-duree-rotation-wrapper').querySelector('.display-input');
    const setSuiviHelp = (id, formula) => {
        const icon = document.getElementById(id);
        if (icon) icon.onclick = () => alert(formula || 'Données insuffisantes pour le calcul.');
    };

    if (!currentCommune) {
        document.getElementById('suivi-bingo-base').innerHTML = '-- kg';
        document.getElementById('suivi-bingo-pelic').innerHTML = '-- kg';
        document.querySelectorAll('#suivi-rotation-results-container .value').forEach(el => { el.textContent = '--'; el.className = 'value rotation-value-default'; });
        document.getElementById('suivi-heure-sur-feu').textContent = '--:--';
        const suiviDureeTransitNoCommune = document.getElementById('suivi-duree-transit'); if (suiviDureeTransitNoCommune) suiviDureeTransitNoCommune.textContent = '--:--';
        const suiviFuelSurFeuNoCommune = document.getElementById('suivi-fuel-sur-feu'); if (suiviFuelSurFeuNoCommune) suiviFuelSurFeuNoCommune.textContent = '-- kg';
        document.getElementById('suivi-cs-sur-feu').textContent = '--:--';
        const suiviHeureHelpIcon = document.getElementById('suivi-heure-sur-feu-help');
        if (suiviHeureHelpIcon) { suiviHeureHelpIcon.onclick = () => alert('Données insuffisantes pour le calcul.'); }
        setSuiviHelp('suivi-duree-transit-help');
        setSuiviHelp('suivi-fuel-sur-feu-help');
        setSuiviHelp('suivi-duree-rotation-help');
        setSuiviHelp('suivi-conso-rotation-help');
        suiviConsoInput.value = '';
        suiviDureeInput.value = '';
        return;
    }
    const bingoBase = calculateBingo(CALCULATOR_DATA.distBaseFeu);
    const bingoPelic = calculateBingo(CALCULATOR_DATA.distPelicFeu);
    const bingoBaseDisplay = document.getElementById('suivi-bingo-base');
    if (bingoBase === 700) { bingoBaseDisplay.innerHTML = '-- kg'; } else { bingoBaseDisplay.innerHTML = `${selectedBaseOACI} / ${CALCULATOR_DATA.distBaseFeu} Nm /&nbsp;<b>${bingoBase} kg</b>`; }
    const bingoPelicDisplay = document.getElementById('suivi-bingo-pelic');
    if (bingoPelic === 700 || !selectedPelicanOACI) { bingoPelicDisplay.innerHTML = '-- kg'; } else { bingoPelicDisplay.innerHTML = `${selectedPelicanOACI} / ${CALCULATOR_DATA.distPelicFeu} Nm /&nbsp;<b>${bingoPelic} kg</b>`; }

    if (!isSuiviConsoManual) {
        const previConso = document.getElementById('conso-par-rotation').textContent;
        suiviConsoInput.value = previConso.includes('--') ? '' : previConso;
    }
    if (!isSuiviDureeManual) {
        const previDuree = document.getElementById('duree-rotation').textContent;
        suiviDureeInput.value = previDuree.includes('--') ? '' : previDuree;
    }

    const allRows = Array.from(document.querySelectorAll('#bloc-fuel tbody tr'));
    const firstRow = allRows[0] || null;
    const firstRowRltWrapper = firstRow?.querySelector('.rlt-mass-input-wrapper') || null;
    const isFirstRowFullDeparture = !!firstRowRltWrapper && (
        firstRowRltWrapper.dataset.rltFirstFull === '1'
        || firstRowRltWrapper.dataset.rltMode === 'firstFull'
    );

    const getRowTime = row => parseTime(row?.querySelector('.time-input-wrapper .display-input')?.value || '');
    const getRowFuel = row => parseNumeric(row?.querySelector('.numeric-input-wrapper .display-input')?.value || '');
    const getRowOaci = row => {
        const datasetOaci = String(row?.dataset?.airportOaci || '').trim().toUpperCase();
        if (datasetOaci) return datasetOaci;
        const cellText = String(row?.querySelector('.airport-oaci-cell')?.textContent || '').replace('--', '').trim().toUpperCase();
        return cellText || '';
    };
    const getDistanceFromOaciToFire = oaci => {
        if (!currentCommune || !oaci) return null;
        const airport = getAirportByOaci(oaci);
        if (!airport) return null;
        const { latitude_mairie: feuLat, longitude_mairie: feuLon } = currentCommune;
        return Math.round(calculateDistanceInNm(airport.lat, airport.lon, feuLat, feuLon));
    };

    let lastFilledRow = null;
    allRows.forEach(row => {
        if (getRowTime(row) !== null || getRowFuel(row) !== null) {
            lastFilledRow = row;
        }
    });

    const blocDepartTime = parseTime(document.getElementById('bloc-depart')?.querySelector('.display-input')?.value || '');
    const fuelDepart = parseNumeric(document.getElementById('fuel-depart')?.querySelector('.display-input')?.value || '');
    const limiteHdvDepart = (typeof getEffectiveLimitHdvForActiveFlight === 'function')
        ? getEffectiveLimitHdvForActiveFlight()
        : parseTime(document.getElementById('limite-hdv')?.querySelector('.display-input')?.value || '');

    let currentFuel = null;
    let currentTime = null;
    let currentHdv = null;
    let transitDistanceVersFeu = null;
    let transitEffectiveDistanceVersFeu = null;
    let transitConsoDistanceVersFeu = null;
    let preTransitForfaitMin = 0;
    let transitSourceLabel = '';
    let transitSourceDetail = '';

    const isKnownPelicOaci = (oaci) => {
        const normalized = String(oaci || '').trim().toUpperCase();
        if (!normalized) return false;
        if (normalized === selectedPelicanOACI) return true;
        return [...pelicanAirports, ...otherAirports].some(ap => {
            if (ap.oaci !== normalized) return false;
            return pelicanAirports.includes(ap) || customPelicanAirports.has(ap.oaci);
        });
    };

    const setTransitDistancePolicy = ({ measuredDistance, usePelicMinimum = false }) => {
        if (!Number.isFinite(measuredDistance)) {
            transitDistanceVersFeu = null;
            transitEffectiveDistanceVersFeu = null;
            transitConsoDistanceVersFeu = null;
            return;
        }
        transitDistanceVersFeu = measuredDistance;
        transitEffectiveDistanceVersFeu = usePelicMinimum ? Math.max(measuredDistance, 10) : measuredDistance;
        transitConsoDistanceVersFeu = measuredDistance;
    };

    if (lastFilledRow) {
        currentFuel = getRowFuel(lastFilledRow);
        currentTime = getRowTime(lastFilledRow);
        preTransitForfaitMin = 10;

        if (lastFilledRow === firstRow && isFirstRowFullDeparture) {
            const firstRowOaci = getRowOaci(firstRow);
            const firstRowDistance = getDistanceFromOaciToFire(firstRowOaci);
            setTransitDistancePolicy({ measuredDistance: firstRowDistance, usePelicMinimum: isKnownPelicOaci(firstRowOaci) });
            currentHdv = limiteHdvDepart;
            transitSourceLabel = firstRowOaci ? `1re ligne Plein au départ (${firstRowOaci})` : '1re ligne Plein au départ — OACI non renseigné';
            transitSourceDetail = `Terrain départ retenu : 1re ligne BLOC/FUEL en mode Plein au départ`;
        } else {
            currentHdv = parseTime(lastFilledRow.querySelector('.tps-vol-restant-cell')?.textContent || '');
            const hasSelectedPelicForSuivi = !!selectedPelicanOACI && Number.isFinite(CALCULATOR_DATA.distPelicFeu);
            setTransitDistancePolicy({ measuredDistance: hasSelectedPelicForSuivi ? CALCULATOR_DATA.distPelicFeu : null, usePelicMinimum: true });
            transitSourceLabel = selectedPelicanOACI ? `Pélic sélectionné (${selectedPelicanOACI})` : 'Pélic sélectionné non renseigné';
            transitSourceDetail = `Terrain départ retenu : pélicandrome sélectionné après le premier transit`;
        }
    } else {
        currentFuel = fuelDepart;
        currentTime = blocDepartTime;
        currentHdv = limiteHdvDepart;
        preTransitForfaitMin = 0;
        setTransitDistancePolicy({ measuredDistance: Number.isFinite(CALCULATOR_DATA.distBaseFeu) ? CALCULATOR_DATA.distBaseFeu : null, usePelicMinimum: false });
        transitSourceLabel = selectedBaseOACI ? `BLOC DÉPART / base (${selectedBaseOACI})` : 'BLOC DÉPART / base non renseignée';
        transitSourceDetail = `Terrain départ retenu : ligne BLOC DÉPART / FUEL DÉPART / BASE`;
    }

    const consoRotation = parseNumeric(suiviConsoInput.value);
    const rotationTime = parseTime(suiviDureeInput.value);
    const csFeuTime = parseTime(CALCULATOR_DATA.csFeu);
    const tmdTime = parseTime(document.getElementById('tmd').querySelector('.display-input').value);
    const transitTimeVersFeu = Number.isFinite(transitEffectiveDistanceVersFeu) ? Math.round(calculateTransitTime(transitEffectiveDistanceVersFeu)) : null;
    const consoTransitVersFeu = Number.isFinite(transitConsoDistanceVersFeu) ? calculateFuelToGo(transitConsoDistanceVersFeu) : null;
    const tempsAvantFeu = (transitTimeVersFeu !== null) ? preTransitForfaitMin + transitTimeVersFeu : null;
    const heureSurFeu = (currentTime !== null && tempsAvantFeu !== null) ? currentTime + tempsAvantFeu : null;
    const fuelSurFeu = (currentFuel !== null && consoTransitVersFeu !== null) ? currentFuel - consoTransitVersFeu : currentFuel;

    const transitSpeedKt = Number.isFinite(transitEffectiveDistanceVersFeu)
        ? (transitEffectiveDistanceVersFeu <= 70 ? 210 : 240)
        : null;
    const transitConsoRate = Number.isFinite(transitConsoDistanceVersFeu)
        ? (transitConsoDistanceVersFeu <= 70 ? 5 : 4)
        : null;
    const rotationDistanceRetained = Number.isFinite(CALCULATOR_DATA.distPelicFeu)
        ? Math.max(CALCULATOR_DATA.distPelicFeu, 10)
        : null;
    const rotationSpeedNmMin = Number.isFinite(rotationDistanceRetained)
        ? (rotationDistanceRetained <= 50 ? 3.5 : 4)
        : null;
    const rotationConsoRate = Number.isFinite(rotationDistanceRetained)
        ? (rotationDistanceRetained <= 70 ? 10 : 8)
        : null;

    setSuiviHelp('suivi-duree-transit-help', transitTimeVersFeu !== null
        ? `DURÉE TRANSIT SOURCE → FEU — SUIVI ROTATIONS

${transitSourceDetail}
Source utilisée : ${transitSourceLabel}

Distance mesurée : ${Number.isFinite(transitDistanceVersFeu) ? transitDistanceVersFeu : 'N/A'} Nm
Distance retenue pour la durée : ${Number.isFinite(transitEffectiveDistanceVersFeu) ? transitEffectiveDistanceVersFeu : 'N/A'} Nm
Règle vitesse : ≤ 70 Nm = 210 kt ; > 70 Nm = 240 kt
Vitesse retenue : ${transitSpeedKt ?? 'N/A'} kt

Calcul : ${Number.isFinite(transitEffectiveDistanceVersFeu) ? transitEffectiveDistanceVersFeu : 'N/A'} × (60 / ${transitSpeedKt ?? 'N/A'}) = ${formatTime(transitTimeVersFeu)} (${transitTimeVersFeu} min)

La valeur affichée correspond uniquement au temps de vol source → feu.
Forfait avant transit : ${preTransitForfaitMin} min, intégré à « Heure sur Feu » mais pas à la durée affichée.`
        : 'Distance vers le feu indisponible. Vérifiez le terrain de départ, le pélicandrome sélectionné et le feu.');

    setSuiviHelp('suivi-fuel-sur-feu-help', fuelSurFeu !== null && currentFuel !== null && consoTransitVersFeu !== null
        ? `FUEL SUR FEU — SUIVI ROTATIONS

Formule : Fuel retenu au départ du transit - Conso transit vers le feu

${transitSourceDetail}
Source utilisée : ${transitSourceLabel}
Fuel retenu au départ du transit : ${currentFuel} kg
Distance retenue pour la consommation : ${Number.isFinite(transitConsoDistanceVersFeu) ? transitConsoDistanceVersFeu : 'N/A'} Nm
Règle consommation : ≤ 70 Nm = 5 kg/Nm ; > 70 Nm = 4 kg/Nm
Taux retenu : ${transitConsoRate ?? 'N/A'} kg/Nm
Conso transit : ${consoTransitVersFeu} kg

Calcul : ${currentFuel} - ${consoTransitVersFeu} = ${fuelSurFeu} kg

Le forfait avant transit de ${preTransitForfaitMin} min n'ajoute pas de consommation forfaitaire dans ce calcul.`
        : 'Fuel de départ du transit ou distance vers le feu indisponible.');

    setSuiviHelp('suivi-duree-rotation-help', rotationDistanceRetained !== null && rotationTime !== null
        ? `DURÉE ROTATION FEU ↔ PÉLIC — SUIVI ROTATIONS

Mode actuel : ${isSuiviDureeManual ? 'MANUEL' : 'AUTO'}
Valeur utilisée : ${formatTime(rotationTime) || 'N/A'}${rotationTime !== null ? ` (${rotationTime} min)` : ''}

Référence du mode AUTO :
20 min + ((Distance retenue × 2) / Vitesse)

Pélic sélectionné : ${selectedPelicanOACI || 'N/A'}
Distance Feu → Pélic mesurée : ${Number.isFinite(CALCULATOR_DATA.distPelicFeu) ? CALCULATOR_DATA.distPelicFeu : 'N/A'} Nm
Distance retenue : ${rotationDistanceRetained} Nm, avec un minimum de 10 Nm
Vitesse retenue : ${rotationSpeedNmMin} Nm/min (${rotationSpeedNmMin === 3.5 ? 210 : 240} kt)
Calcul AUTO : 20 + ((${rotationDistanceRetained} × 2) / ${rotationSpeedNmMin}) = ${formatTime(Math.round(calculateRotationTime(CALCULATOR_DATA.distPelicFeu)))}

${isSuiviDureeManual ? 'La valeur manuelle remplace actuellement le calcul AUTO dans le nombre de rotations.' : 'La valeur AUTO est utilisée dans le nombre de rotations.'}`
        : 'Sélectionnez un pélicandrome et renseignez une durée de rotation exploitable.');

    setSuiviHelp('suivi-conso-rotation-help', rotationDistanceRetained !== null && consoRotation !== null
        ? `CONSO ROTATION FEU ↔ PÉLIC — SUIVI ROTATIONS

Mode actuel : ${isSuiviConsoManual ? 'MANUEL' : 'AUTO'}
Valeur utilisée : ${consoRotation} kg

Référence du mode AUTO :
(Distance retenue × conso aller-retour) + forfait largage

Pélic sélectionné : ${selectedPelicanOACI || 'N/A'}
Distance Feu → Pélic mesurée : ${Number.isFinite(CALCULATOR_DATA.distPelicFeu) ? CALCULATOR_DATA.distPelicFeu : 'N/A'} Nm
Distance retenue : ${rotationDistanceRetained} Nm, avec un minimum de 10 Nm
Conso aller-retour retenue : ${rotationConsoRate} kg/Nm
Forfait largage : 250 kg
Calcul AUTO : (${rotationDistanceRetained} × ${rotationConsoRate}) + 250 = ${calculateConsoRotation(CALCULATOR_DATA.distPelicFeu)} kg

${isSuiviConsoManual ? 'La valeur manuelle remplace actuellement le calcul AUTO dans le nombre de rotations.' : 'La valeur AUTO est utilisée dans le nombre de rotations.'}`
        : 'Sélectionnez un pélicandrome et renseignez une consommation de rotation exploitable.');

    if (currentFuel === null && currentTime === null) {
        document.getElementById('suivi-fuel-actuel').textContent = '-- kg';
        document.getElementById('suivi-heure-sur-feu').textContent = '--:--';
        document.getElementById('suivi-cs-sur-feu').textContent = '--:--';
        const suiviDureeTransitEl = document.getElementById('suivi-duree-transit'); if (suiviDureeTransitEl) suiviDureeTransitEl.textContent = '--:--';
        const suiviFuelSurFeuEl = document.getElementById('suivi-fuel-sur-feu'); if (suiviFuelSurFeuEl) suiviFuelSurFeuEl.textContent = '-- kg';
        const suiviHeureHelpIcon = document.getElementById('suivi-heure-sur-feu-help');
        if (suiviHeureHelpIcon) { suiviHeureHelpIcon.onclick = () => alert('Données insuffisantes pour calculer l’heure sur feu.'); }
        document.querySelectorAll('#suivi-rotation-results-container .value').forEach(el => { el.textContent = '--'; el.className = 'value rotation-value-default'; });
    } else {
        document.getElementById('suivi-fuel-actuel').textContent = currentFuel !== null ? `${currentFuel} kg` : '--';
        document.getElementById('suivi-heure-sur-feu').textContent = formatTime(heureSurFeu) || '--:--';
        document.getElementById('suivi-cs-sur-feu').textContent = CALCULATOR_DATA.csFeu;
        const suiviDureeTransitEl = document.getElementById('suivi-duree-transit'); if (suiviDureeTransitEl) suiviDureeTransitEl.textContent = transitTimeVersFeu !== null ? (formatTime(transitTimeVersFeu) || '--:--') : '--:--';
        const suiviFuelSurFeuEl = document.getElementById('suivi-fuel-sur-feu'); if (suiviFuelSurFeuEl) suiviFuelSurFeuEl.textContent = fuelSurFeu !== null ? `${fuelSurFeu} kg` : '-- kg';
        const suiviHeureHelpIcon = document.getElementById('suivi-heure-sur-feu-help');
        if (suiviHeureHelpIcon) {
            suiviHeureHelpIcon.onclick = () => alert(`HEURE SUR FEU — SUIVI ROTATION

Règle v12.88 :
- depuis BLOC DÉPART / FUEL DÉPART / BASE : premier transit depuis la base ;
- depuis une ligne BLOC/FUEL en mode Plein au départ : premier transit depuis l'OACI de cette ligne ;
- depuis une arrivée pélicandrome : 10 min de mise en œuvre/roulage/décollage, puis transit vers le feu ;
- le largage est ensuite validé avec 10 min supplémentaires avant largage.

${transitSourceDetail}
Source utilisée : ${transitSourceLabel}
Heure départ retenue : ${formatTime(currentTime) || 'N/A'}
Forfait avant transit : ${preTransitForfaitMin} min
Distance source → Feu mesurée : ${Number.isFinite(transitDistanceVersFeu) ? transitDistanceVersFeu : 'N/A'} Nm
Distance transit retenue : ${Number.isFinite(transitEffectiveDistanceVersFeu) ? transitEffectiveDistanceVersFeu : 'N/A'} Nm
Règle vitesse : ≤70 Nm = 210 kt, >70 Nm = 240 kt
Durée transit : ${transitTimeVersFeu !== null ? `${formatTime(transitTimeVersFeu)} (${transitTimeVersFeu} min)` : 'N/A'}
Conso transit : ${consoTransitVersFeu !== null ? `${consoTransitVersFeu} kg` : 'N/A'}
Fuel sur feu retenu : ${fuelSurFeu !== null ? `${fuelSurFeu} kg` : 'N/A'}

Calcul heure sur feu : ${formatTime(currentTime) || 'N/A'} + ${preTransitForfaitMin} min + ${transitTimeVersFeu !== null ? formatTime(transitTimeVersFeu) : 'N/A'} = ${formatTime(heureSurFeu) || 'N/A'}

Validation du largage : Heure sur feu + 10 min avant CS/TMD/HDV.`);
        }
        updateAndSortRotations(
            document.getElementById('suivi-rotation-results-container'),
            { fuel: fuelSurFeu, time: heureSurFeu },
            {
                bingoBase,
                bingoPelic,
                consoRotation,
                rotationTime,
                csFeuTime,
                tmdTime,
                limiteHDV: currentHdv,
                transitTime: tempsAvantFeu,
                rawTransitTime: transitTimeVersFeu,
                preTransitForfaitMin,
                effectiveTransitDistance: transitEffectiveDistanceVersFeu,
                transitSourceLabel,
                currentTimeLabel: 'Heure sur feu',
                allowFuelImmediateDrop: true,
                firstDropForfaitMin: 10
            }
        );
    }
}

function updateDeroutementTab() {
    if (typeof updateDeroutementGpsStatus === 'function') {
        updateDeroutementGpsStatus();
    }
    const resultsContainer = document.getElementById('derout-rotation-results-container');
    const setHelp = (id, formula) => {
        const icon = document.getElementById(id);
        if (icon) { icon.onclick = () => alert(formula || "Données insuffisantes pour le calcul."); }
    };
    const isEmptyRetardant = document.getElementById('derout-empty-retardant-checkbox')?.checked === true;
    const deroutEmptyModeState = isEmptyRetardant
        ? 'COCHÉE — trajet initial GPS → Pélic → Feu, avec 10 min au pélicandrome'
        : 'NON COCHÉE — trajet initial direct GPS → Feu';
    const deroutModeImpactText = isEmptyRetardant
        ? 'La case modifie le trajet initial vers le feu. Elle ne modifie pas la durée ni la consommation des rotations suivantes Feu ↔ Pélic.'
        : 'Le trajet initial est direct vers le feu. La durée et la consommation de rotation concernent ensuite les rotations Feu ↔ Pélic.';

    const deroutFuelMiniPelicLabel = document.getElementById('derout-fuel-mini-pelic-label');
    if (deroutFuelMiniPelicLabel) {
        const selectedPelic = selectedPelicanOACI ? getAirportByOaci(selectedPelicanOACI) : null;
        const pelicCode = selectedPelic ? selectedPelic.oaci : 'PÉLIC';
        deroutFuelMiniPelicLabel.textContent = `Fuel mini 1 Lrg / Pélic (${pelicCode}) :`;
    }

    if (!currentCommune) {
        document.getElementById('derout-bingo-base').innerHTML = '-- kg';
        document.getElementById('derout-bingo-pelic').innerHTML = '-- kg';
        resultsContainer.querySelectorAll('.value').forEach(el => { el.textContent = '--'; el.className = 'value rotation-value-default'; });
        document.getElementById('derout-fuel-mini-base').textContent = '-- kg';
        document.getElementById('derout-fuel-mini-pelic').textContent = '-- kg';
        document.getElementById('derout-heure-sur-feu').textContent = '--:--';
        const deroutDureeRotationEmpty = document.getElementById('derout-duree-rotation');
        if (deroutDureeRotationEmpty) deroutDureeRotationEmpty.textContent = '--:--';
        const deroutConsoRotationEmpty = document.getElementById('derout-conso-rotation');
        if (deroutConsoRotationEmpty) deroutConsoRotationEmpty.textContent = '-- kg';
        document.getElementById('derout-cs-sur-feu').textContent = '--:--';
        setHelp('derout-duree-rotation-help', `DURÉE ROTATION — DÉROUT. / GAAR

Case « Retour Pélic avant feu » : ${deroutEmptyModeState}
${deroutModeImpactText}

Sélectionnez un feu pour afficher le calcul détaillé.`);
        setHelp('derout-conso-rotation-help', `CONSO ROTATION — DÉROUT. / GAAR

Case « Retour Pélic avant feu » : ${deroutEmptyModeState}
${deroutModeImpactText}

Sélectionnez un feu pour afficher le calcul détaillé.`);
        setHelp('derout-fuel-mini-base-help', `Case « Retour Pélic avant feu » : ${deroutEmptyModeState}

Sélectionnez un feu pour afficher le calcul détaillé.`);
        setHelp('derout-fuel-mini-pelic-help', `Case « Retour Pélic avant feu » : ${deroutEmptyModeState}

Sélectionnez un feu pour afficher le calcul détaillé.`);
        setHelp('derout-heure-sur-feu-help', `Case « Retour Pélic avant feu » : ${deroutEmptyModeState}

Sélectionnez un feu pour afficher le calcul détaillé.`);
        return;
    }

    const fuelActuel = parseNumeric(document.getElementById('deroutement-fuel-wrapper').querySelector('.display-input').value);
    const heureActuelle = parseTime(document.getElementById('deroutement-heure-wrapper').querySelector('.display-input').value);

    const bingoBase = calculateBingo(CALCULATOR_DATA.distBaseFeu);
    const bingoPelic = calculateBingo(CALCULATOR_DATA.distPelicFeu);
    const rotationTime = Math.round(calculateRotationTime(CALCULATOR_DATA.distPelicFeu));
    const consoRotation = calculateConsoRotation(CALCULATOR_DATA.distPelicFeu);
    const deroutDureeRotationDisplay = document.getElementById('derout-duree-rotation');
    if (deroutDureeRotationDisplay) {
        deroutDureeRotationDisplay.textContent = (rotationTime === 20 || !selectedPelicanOACI) ? '--:--' : formatTime(rotationTime);
    }
    const deroutConsoRotationDisplay = document.getElementById('derout-conso-rotation');
    if (deroutConsoRotationDisplay) {
        deroutConsoRotationDisplay.textContent = (consoRotation === 250 || !selectedPelicanOACI) ? '-- kg' : `${consoRotation} kg`;
    }

    const deroutRotationDistance = Number.isFinite(CALCULATOR_DATA.distPelicFeu)
        ? Math.max(CALCULATOR_DATA.distPelicFeu, 10)
        : null;
    const deroutRotationSpeedNmMin = deroutRotationDistance !== null
        ? (deroutRotationDistance <= 50 ? 3.5 : 4)
        : null;
    const deroutRotationConsoRate = deroutRotationDistance !== null
        ? (deroutRotationDistance <= 70 ? 10 : 8)
        : null;

    setHelp('derout-duree-rotation-help', selectedPelicanOACI && deroutRotationDistance !== null
        ? `DURÉE ROTATION FEU ↔ PÉLIC — DÉROUT. / GAAR

Case « Retour Pélic avant feu » : ${deroutEmptyModeState}
${deroutModeImpactText}

Pélic sélectionné : ${selectedPelicanOACI}
Distance Feu → Pélic mesurée : ${CALCULATOR_DATA.distPelicFeu} Nm
Distance retenue : ${deroutRotationDistance} Nm, avec un minimum de 10 Nm
Règle vitesse : ≤ 50 Nm = 3,5 Nm/min (210 kt) ; > 50 Nm = 4 Nm/min (240 kt)
Vitesse retenue : ${deroutRotationSpeedNmMin} Nm/min
Forfait rotation : 20 min

Calcul : 20 + ((${deroutRotationDistance} × 2) / ${deroutRotationSpeedNmMin}) = ${formatTime(rotationTime)} (${rotationTime} min)`
        : `DURÉE ROTATION — DÉROUT. / GAAR

Case « Retour Pélic avant feu » : ${deroutEmptyModeState}
${deroutModeImpactText}

Sélectionnez un pélicandrome pour calculer la durée de rotation.`);

    setHelp('derout-conso-rotation-help', selectedPelicanOACI && deroutRotationDistance !== null
        ? `CONSO ROTATION FEU ↔ PÉLIC — DÉROUT. / GAAR

Case « Retour Pélic avant feu » : ${deroutEmptyModeState}
${deroutModeImpactText}

Pélic sélectionné : ${selectedPelicanOACI}
Distance Feu → Pélic mesurée : ${CALCULATOR_DATA.distPelicFeu} Nm
Distance retenue : ${deroutRotationDistance} Nm, avec un minimum de 10 Nm
Règle consommation aller-retour : ≤ 70 Nm = 10 kg/Nm ; > 70 Nm = 8 kg/Nm
Taux retenu : ${deroutRotationConsoRate} kg/Nm
Forfait largage : 250 kg

Calcul : (${deroutRotationDistance} × ${deroutRotationConsoRate}) + 250 = ${consoRotation} kg`
        : `CONSO ROTATION — DÉROUT. / GAAR

Case « Retour Pélic avant feu » : ${deroutEmptyModeState}
${deroutModeImpactText}

Sélectionnez un pélicandrome pour calculer la consommation de rotation.`);

    const csFeuTime = parseTime(CALCULATOR_DATA.csFeu);
    const tmdTime = parseTime(document.getElementById('tmd').querySelector('.display-input').value);
    const limiteHDV = parseTime(document.getElementById('limite-hdv').querySelector('.display-input').value);
    const markerLatLng = (userMarker && typeof userMarker.getLatLng === 'function') ? userMarker.getLatLng() : null;
    const lastGpsLat = lastPosition ? Number(lastPosition.lat ?? lastPosition.latitude) : NaN;
    const lastGpsLng = lastPosition ? Number(lastPosition.lng ?? lastPosition.longitude) : NaN;
    const userLatLng = (markerLatLng && Number.isFinite(markerLatLng.lat) && Number.isFinite(markerLatLng.lng))
        ? markerLatLng
        : (Number.isFinite(lastGpsLat) && Number.isFinite(lastGpsLng) ? { lat: lastGpsLat, lng: lastGpsLng } : null);
    const hasGpsPosition = !!userLatLng;
    const selectedPelicForDeroutement = selectedPelicanOACI ? getAirportByOaci(selectedPelicanOACI) : null;
    const distGpsFeu = (hasGpsPosition && currentCommune)
        ? Math.round(calculateDistanceInNm(userLatLng.lat, userLatLng.lng, currentCommune.latitude_mairie, currentCommune.longitude_mairie))
        : null;
    const distGpsPelic = (hasGpsPosition && selectedPelicForDeroutement)
        ? Math.round(calculateDistanceInNm(userLatLng.lat, userLatLng.lng, selectedPelicForDeroutement.lat, selectedPelicForDeroutement.lon))
        : null;
    const distFirstPelicFeu = selectedPelicForDeroutement ? CALCULATOR_DATA.distPelicFeu : null;

    const firstLegDistance = (isEmptyRetardant && distGpsPelic !== null && distFirstPelicFeu !== null)
        ? distGpsPelic + distFirstPelicFeu
        : distGpsFeu;

    const transitTimeFromGps = firstLegDistance !== null
        ? (
            isEmptyRetardant
                ? Math.round(calculateTransitTime(distGpsPelic)) + 10 + Math.round(calculateTransitTime(distFirstPelicFeu))
                : Math.round(calculateTransitTime(distGpsFeu))
        )
        : null;

    const consoTransitFromGps = firstLegDistance !== null
        ? (
            isEmptyRetardant
                ? calculateFuelToGo(distGpsPelic) + calculateFuelToGo(distFirstPelicFeu)
                : calculateFuelToGo(distGpsFeu)
        )
        : null;

    const bingoBaseDisplay = document.getElementById('derout-bingo-base');
    if (bingoBase === 700) { bingoBaseDisplay.innerHTML = '-- kg'; } else { bingoBaseDisplay.innerHTML = `${selectedBaseOACI} / ${CALCULATOR_DATA.distBaseFeu} Nm /&nbsp;<b>${bingoBase} kg</b>`; }
    const bingoPelicDisplay = document.getElementById('derout-bingo-pelic');
    if (bingoPelic === 700 || !selectedPelicanOACI) { bingoPelicDisplay.innerHTML = '-- kg'; } else { bingoPelicDisplay.innerHTML = `${selectedPelicanOACI} / ${CALCULATOR_DATA.distPelicFeu} Nm /&nbsp;<b>${bingoPelic} kg</b>`; }

    const fuelMiniBase = consoTransitFromGps !== null ? consoTransitFromGps + 250 + bingoBase : null;
    const fuelMiniPelic = consoTransitFromGps !== null ? consoTransitFromGps + 250 + bingoPelic : null;
    document.getElementById('derout-fuel-mini-base').textContent = fuelMiniBase !== null ? `${fuelMiniBase} kg` : '-- kg';
    document.getElementById('derout-fuel-mini-pelic').textContent = fuelMiniPelic !== null ? `${fuelMiniPelic} kg` : '-- kg';
    const deroutFirstLegLabel = isEmptyRetardant
        ? `GPS → Pélic (${selectedPelicForDeroutement ? selectedPelicForDeroutement.oaci : 'PÉLIC'}) → Feu`
        : 'GPS → Feu';
    const deroutFirstLegDetail = isEmptyRetardant
        ? `Distance GPS → Pélic : ${distGpsPelic ?? 'N/A'} Nm\nDistance Pélic → Feu : ${distFirstPelicFeu ?? 'N/A'} Nm\nForfait sol Pélic : 10 min`
        : `Distance GPS → Feu : ${distGpsFeu ?? 'N/A'} Nm`;

    setHelp('derout-fuel-mini-base-help', consoTransitFromGps !== null
        ? `FUEL MINI 1 LRG / BASE\n\nCase « Retour Pélic avant feu » : ${deroutEmptyModeState}\n${deroutModeImpactText}\n\nFormule : Conso ${deroutFirstLegLabel} + forfait largage + BINGO Base\n\n${deroutFirstLegDetail}\n\nRègle conso transit :\n- Distance ≤ 70 Nm : 5 kg/Nm\n- Distance > 70 Nm : 4 kg/Nm\n\nForfait largage : 250 kg\n\nBINGO Base :\n700 kg + conso Feu → Base = ${bingoBase} kg\n\nCalcul : ${consoTransitFromGps} + 250 + ${bingoBase} = ${fuelMiniBase} kg`
        : (isEmptyRetardant && !selectedPelicForDeroutement)
            ? 'Sélectionnez un pélicandrome pour le mode “vide retardant”.'
            : 'Distance GPS indisponible. Utilisez “🛰️ Rafraîchir GPS”.');
    setHelp('derout-fuel-mini-pelic-help', consoTransitFromGps !== null
        ? `FUEL MINI 1 LRG / PÉLIC\n\nCase « Retour Pélic avant feu » : ${deroutEmptyModeState}\n${deroutModeImpactText}\n\nFormule : Conso ${deroutFirstLegLabel} + forfait largage + BINGO Pélic\n\n${deroutFirstLegDetail}\n\nRègle conso transit :\n- Distance ≤ 70 Nm : 5 kg/Nm\n- Distance > 70 Nm : 4 kg/Nm\n\nForfait largage : 250 kg\n\nBINGO Pélic :\n700 kg + conso Feu → Pélic = ${bingoPelic} kg\n\nCalcul : ${consoTransitFromGps} + 250 + ${bingoPelic} = ${fuelMiniPelic} kg`
        : (isEmptyRetardant && !selectedPelicForDeroutement)
            ? 'Sélectionnez un pélicandrome pour le mode “vide retardant”.'
            : 'Distance GPS indisponible. Utilisez “🛰️ Rafraîchir GPS”.');

    const heureSurFeu = (heureActuelle !== null && transitTimeFromGps !== null) ? heureActuelle + transitTimeFromGps : null;
    document.getElementById('derout-heure-sur-feu').textContent = formatTime(heureSurFeu) || '--:--';
    document.getElementById('derout-cs-sur-feu').textContent = CALCULATOR_DATA.csFeu;
    setHelp('derout-heure-sur-feu-help', transitTimeFromGps !== null
        ? `HEURE SUR FEU — DÉROUTEMENT\n\nCase « Retour Pélic avant feu » : ${deroutEmptyModeState}\n${deroutModeImpactText}\n\nFormule : Heure actuelle + Durée ${deroutFirstLegLabel}\n\n${deroutFirstLegDetail}\n\nRègle vitesse :\n- Distance ≤ 70 Nm : 210 kt\n- Distance > 70 Nm : 240 kt\n\nHeure actuelle : ${formatTime(heureActuelle) || 'N/A'}\nDurée ${deroutFirstLegLabel} : ${formatTime(transitTimeFromGps) || 'N/A'} (${transitTimeFromGps} min)\n\nCalcul : ${formatTime(heureActuelle) || 'N/A'} + ${formatTime(transitTimeFromGps) || 'N/A'} = ${formatTime(heureSurFeu) || 'N/A'}`
        : (isEmptyRetardant && !selectedPelicForDeroutement)
            ? 'Sélectionnez un pélicandrome pour le mode “vide retardant”.'
            : 'Distance GPS indisponible. Utilisez “🛰️ Rafraîchir GPS”.');

    if (fuelActuel === null || heureActuelle === null || consoTransitFromGps === null || transitTimeFromGps === null || (isEmptyRetardant && !selectedPelicForDeroutement)) {
        resultsContainer.querySelectorAll('.value').forEach(el => { el.textContent = '--'; el.className = 'value rotation-value-default'; });
        resultsContainer.querySelectorAll('.formula-help-icon').forEach(icon => icon.onclick = () => alert(
            isEmptyRetardant && !selectedPelicForDeroutement
                ? 'Mode vide retardant : sélectionnez un pélicandrome.'
                : "Données insuffisantes pour le calcul."
        ));
        return;
    }

    const fuelSurFeu = fuelActuel - consoTransitFromGps;

    updateAndSortRotations(
        resultsContainer,
        { fuel: fuelSurFeu, time: heureSurFeu },
        { bingoBase, bingoPelic, consoRotation, rotationTime, csFeuTime, tmdTime, limiteHDV, transitTime: transitTimeFromGps, consoTransitFromGps: consoTransitFromGps }
    );
}

function ensureMqttClientLoaded() {
    if (typeof mqtt !== 'undefined') return Promise.resolve();
    if (mqttLoaderPromise) return mqttLoaderPromise;

    mqttLoaderPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = MQTT_SCRIPT_URL;
        script.async = true;
        script.crossOrigin = 'anonymous';
        const timeoutId = setTimeout(() => {
            reject(new Error('Chargement MQTT trop long'));
        }, 8000);
        script.onload = () => {
            clearTimeout(timeoutId);
            if (typeof mqtt === 'undefined') {
                reject(new Error('Librairie MQTT indisponible après chargement'));
                return;
            }
            resolve();
        };
        script.onerror = () => {
            clearTimeout(timeoutId);
            reject(new Error('Échec de chargement du client MQTT'));
        };
        document.head.appendChild(script);
    }).finally(() => {
        if (typeof mqtt === 'undefined') mqttLoaderPromise = null;
    });

    return mqttLoaderPromise;
}


function setupChatKeyboardSafeArea() {
    const chatPanel = document.getElementById('team-chat-panel');
    const messageInput = document.getElementById('chat-message-input');
    const messagesBox = document.getElementById('chat-messages');

    if (!chatPanel || !messageInput) return;

    const originalBottom = chatPanel.style.bottom || '';
    const originalMaxHeight = chatPanel.style.maxHeight || '';

    const applyKeyboardOffset = () => {
        const visualViewport = window.visualViewport;

        if (!visualViewport) {
            chatPanel.style.bottom = originalBottom || '';
            chatPanel.style.maxHeight = originalMaxHeight || '';
            return;
        }

        const keyboardOffset = Math.max(
            0,
            Math.round(window.innerHeight - visualViewport.height - visualViewport.offsetTop)
        );

        if (keyboardOffset > 40 && document.activeElement === messageInput) {
            chatPanel.style.bottom = `calc(10px + env(safe-area-inset-bottom) + ${keyboardOffset}px)`;
            chatPanel.style.maxHeight = `calc(100dvh - 20px - ${keyboardOffset}px)`;

            setTimeout(() => {
                try {
                    messageInput.scrollIntoView({
                        block: 'nearest',
                        inline: 'nearest'
                    });
                } catch (_) {}

                if (messagesBox) {
                    messagesBox.scrollTop = messagesBox.scrollHeight;
                }
            }, 80);
        } else if (document.activeElement !== messageInput) {
            chatPanel.style.bottom = originalBottom || '';
            chatPanel.style.maxHeight = originalMaxHeight || '';
        }
    };

    if (window.visualViewport && chatPanel.dataset.keyboardSafeAreaBound !== '1') {
        chatPanel.dataset.keyboardSafeAreaBound = '1';
        window.visualViewport.addEventListener('resize', applyKeyboardOffset);
        window.visualViewport.addEventListener('scroll', applyKeyboardOffset);
    }

    if (messageInput.dataset.keyboardSafeAreaBound !== '1') {
        messageInput.dataset.keyboardSafeAreaBound = '1';

        messageInput.addEventListener('focus', () => {
            setTimeout(applyKeyboardOffset, 80);
            setTimeout(applyKeyboardOffset, 220);
            setTimeout(applyKeyboardOffset, 420);
        });

        messageInput.addEventListener('input', () => {
            if (messagesBox) {
                messagesBox.scrollTop = messagesBox.scrollHeight;
            }
            setTimeout(applyKeyboardOffset, 40);
        });

        messageInput.addEventListener('blur', () => {
            setTimeout(() => {
                chatPanel.style.bottom = originalBottom || '';
                chatPanel.style.maxHeight = originalMaxHeight || '';
            }, 180);
        });
    }
}

function initializeTeamChat() {
    const panel = document.getElementById('team-chat-panel');
    const toggleButton = document.getElementById('chat-toggle-button');
    const minimizeButton = document.getElementById('chat-minimize-button');
    const clearButton = document.getElementById('chat-clear-button');
    const alertBadge = document.getElementById('chat-alert-badge');
    const offlineBadge = document.getElementById('chat-offline-badge');
    const roomInput = document.getElementById('chat-room-input');
    const userInput = document.getElementById('chat-user-input');
    const connectButton = document.getElementById('chat-connect-button');
    const sendButton = document.getElementById('chat-send-button');
    const messageInput = document.getElementById('chat-message-input');
    const messagesBox = document.getElementById('chat-messages');
    const connectionState = document.getElementById('chat-connection-state');
    const onlineUsersLabel = document.getElementById('chat-online-users');
    const clearModal = document.getElementById('chat-clear-modal');
    const clearLocalButton = document.getElementById('chat-clear-local-button');
    const clearChannelButton = document.getElementById('chat-clear-channel-button');
    const clearCancelButton = document.getElementById('chat-clear-cancel-button');
    if (!panel || !toggleButton || !minimizeButton || !clearButton || !alertBadge || !offlineBadge || !roomInput || !userInput || !connectButton || !sendButton || !messageInput || !messagesBox || !connectionState || !onlineUsersLabel || !clearModal || !clearLocalButton || !clearChannelButton || !clearCancelButton) return;

    /*
     * v11.88 — iPad/Safari : éviter l'appel du bandeau de connexion/passkey
     * au focus du champ message. On neutralise aussi les champs canal/pseudo,
     * car Safari les interprète parfois comme un formulaire de connexion.
     */
    [
        [roomInput, 'off'],
        [userInput, 'off'],
        [messageInput, 'one-time-code']
    ].forEach(([input, autocompleteValue]) => {
        input.setAttribute('autocomplete', autocompleteValue);
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-1p-ignore', 'true');
    });

    setupChatKeyboardSafeArea();

    const locationShareButton = document.createElement('button');
    locationShareButton.id = 'chat-location-share-button';
    locationShareButton.type = 'button';
    locationShareButton.title = 'Partager ma position GPS avec les autres utilisateurs du canal';
    locationShareButton.style.border = '0';
    locationShareButton.style.borderRadius = '8px';
    locationShareButton.style.padding = '4px 7px';
    locationShareButton.style.fontWeight = '700';
    locationShareButton.style.cursor = 'pointer';
    locationShareButton.style.whiteSpace = 'nowrap';
    clearButton.parentNode.insertBefore(locationShareButton, clearButton);

    const validateChatConfigButton = document.createElement('button');
    validateChatConfigButton.id = 'chat-validate-config-button';
    validateChatConfigButton.type = 'button';
    validateChatConfigButton.textContent = 'Valider';
    validateChatConfigButton.title = 'Valider le changement de canal ou pseudo';
    validateChatConfigButton.className = 'chat-validate-config-button';
    validateChatConfigButton.disabled = true;
    clearButton.parentNode.insertBefore(validateChatConfigButton, clearButton);

    const CHAT_CLIENT_ID_KEY = 'teamChatClientId';
    const CHAT_OUTBOX_KEY = 'teamChatOutbox';
    const CHAT_SEEN_IDS_KEY = 'teamChatSeenIds';
    let unreadCount = 0;
    let reconnectAfterOnlineTimeout = null;
    let isChatConnecting = false;
    let hasAnnouncedConnection = true;
    const pendingChatMessages = [];
    const renderedMessageIds = new Set();
    const sentMessageElements = new Map();
    const activeUsers = new Map();
    const CHAT_RECENT_USER_MAX_AGE_MS = 30 * 60 * 1000;
    const CHAT_PRESENCE_HEARTBEAT_MS = 60 * 1000;
    let chatPresenceHeartbeatTimer = null;
    let chatRecentUsersRefreshTimer = null;
    let chatPushSubscriptionPromise = null;
    const myClientId = getOrCreateClientId();
    const CHAT_LOCATION_SHARING_KEY = 'teamChatLocationSharing';
    const CHAT_LOCATION_PUBLISH_INTERVAL_MS = 10000;
    const CHAT_LOCATION_DISPLAY_MAX_AGE_MS = 30000; // Ignore les positions retenues trop anciennes au démarrage.
    const CHAT_LOCATION_STALE_MS = 60000;
    const CHAT_LOCATION_REMOVE_MS = 300000;
    const CHAT_ALTITUDE_STALE_MS = 30000;
    let locationSharingEnabled = localStorage.getItem(CHAT_LOCATION_SHARING_KEY) === 'true';
    let locationPublishTimer = null;
    let lastLocationPublishAt = 0;
    const remoteLocationMarkers = new Map();
    minimizeButton.textContent = '✕ Fermer';
    minimizeButton.title = 'Fermer la fenêtre chat';
    minimizeButton.setAttribute('aria-label', 'Fermer la fenêtre chat');

    const defaultConfig = { room: 'Milan', user: '' };
    const savedConfig = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || 'null') || defaultConfig;
    roomInput.value = savedConfig.room || defaultConfig.room;
    userInput.value = savedConfig.user || defaultConfig.user;

    const persistedSeenIds = new Set(JSON.parse(localStorage.getItem(CHAT_SEEN_IDS_KEY) || '[]'));
    const history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
    history.forEach((item) => {
        if (item?.id) renderedMessageIds.add(item.id);
        appendChatMessage(item.user, item.text, item.time, item.system === true, item);
    });

    const setConnectionState = (isOnline, label = null) => {
        chatConnected = isOnline;
        const effectiveLabel = label || (isOnline ? 'Connecté' : 'Hors ligne');
        connectionState.textContent = effectiveLabel;
        connectionState.classList.toggle('online', isOnline);
        connectionState.classList.toggle('offline', !isOnline);
        offlineBadge.style.display = isOnline ? 'none' : 'flex';

        if (connectButton) {
            connectButton.disabled = effectiveLabel === 'Connexion...';
            connectButton.textContent = isOnline ? 'Déconnexion' : (effectiveLabel === 'Connexion...' ? 'Connexion...' : 'Connexion');
        }
    };
    setConnectionState(false);

    const persistConfig = () => {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
            room: (roomInput.value || '').trim().replace(/[^a-zA-Z0-9-_]/g, ''),
            user: (userInput.value || '').trim().slice(0, 24)
        }));
    };

    let lastValidatedChatConfig = {
        room: (roomInput.value || '').trim().replace(/[^a-zA-Z0-9-_]/g, ''),
        user: (userInput.value || '').trim()
    };

    const getCurrentChatConfig = () => ({
        room: (roomInput.value || '').trim().replace(/[^a-zA-Z0-9-_]/g, ''),
        user: (userInput.value || '').trim()
    });

    const updateChatValidateButtonState = () => {
        /*
         * v12.24 — plus de reconnexion automatique.
         * Le bouton Valider se dégrise uniquement quand canal ou pseudo change.
         */
        const current = getCurrentChatConfig();
        const changed = current.room !== lastValidatedChatConfig.room || current.user !== lastValidatedChatConfig.user;
        const valid = !!current.room && !!current.user;

        validateChatConfigButton.disabled = !(changed && valid);
        validateChatConfigButton.classList.toggle('is-dirty', changed && valid);
    };

    const applyChatConfigValidation = async () => {
        const current = getCurrentChatConfig();
        if (!current.room || !current.user) {
            setConnectionState(false, 'Canal/pseudo requis');
            return;
        }

        persistConfig();
        validateChatConfigButton.disabled = true;
        validateChatConfigButton.textContent = 'Validation...';

        try {
            if (chatConnected || isChatConnecting || chatClient) {
                appendChatMessage('Système', 'Paramètres chat validés — reconnexion...', new Date().toISOString(), true);
                disconnectFromChat();
                await new Promise(resolve => setTimeout(resolve, 450));
                await connectToChat();
            }

            lastValidatedChatConfig = current;
            updateChatValidateButtonState();
        } catch (error) {
            appendChatMessage('Système', `Validation chat impossible: ${error.message || error}`, new Date().toISOString(), true);
        } finally {
            validateChatConfigButton.textContent = 'Valider';
            updateChatValidateButtonState();
        }
    };

    const saveMessageInHistory = (entry) => {
        const current = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
        if (entry?.id && current.some((msg) => msg.id === entry.id)) return;
        current.push(entry);
        const recent = current.slice(-200);
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(recent));
    };

    function getOrCreateClientId() {
        const stored = localStorage.getItem(CHAT_CLIENT_ID_KEY);
        if (stored && stored.trim()) return stored;
        const created = `pelic_device_${Math.random().toString(16).slice(2, 10)}_${Date.now()}`;
        localStorage.setItem(CHAT_CLIENT_ID_KEY, created);
        return created;
    }

    const updateUnreadBadge = () => {
        if (!unreadCount) {
            alertBadge.style.display = 'none';
            return;
        }
        alertBadge.style.display = 'flex';
        alertBadge.textContent = unreadCount > 99 ? '99+' : `${unreadCount}`;
    };

    const shouldWarnUnread = () => panel.style.display !== 'flex';

    const notifyWhenInBackground = (title, body, tag = 'pelic-chat') => {
        if (typeof document === 'undefined' || !document.hidden) return;
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        try {
            new Notification(title, { body, tag });
        } catch (_) {}
    };

    const isChatPushConfigured = () => {
        return typeof CHAT_PUSH_API_URL === 'string'
            && CHAT_PUSH_API_URL.trim()
            && typeof CHAT_PUSH_VAPID_PUBLIC_KEY === 'string'
            && CHAT_PUSH_VAPID_PUBLIC_KEY.trim();
    };

    const getChatPushApiUrl = (path) => {
        return `${CHAT_PUSH_API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    };

    const urlBase64ToUint8Array = (base64String) => {
        const cleaned = String(base64String || '').trim();
        const padding = '='.repeat((4 - cleaned.length % 4) % 4);
        const base64 = (cleaned + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; i += 1) {
            outputArray[i] = rawData.charCodeAt(i);
        }

        if (outputArray.length !== 65 || outputArray[0] !== 4) {
            throw new Error(`VAPID public key invalid: ${outputArray.length} bytes, first byte ${outputArray[0]}`);
        }

        return outputArray;
    };

    const ensureChatPushSubscription = async () => {
        if (chatPushSubscriptionPromise) return chatPushSubscriptionPromise;

        chatPushSubscriptionPromise = (async () => {
            if (!isChatPushConfigured()) return false;
            if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
                appendChatMessage('Système', 'Notifications push non supportées par ce navigateur.', new Date().toISOString(), true);
                return false;
            }

        const roomName = (roomInput.value || '').trim().replace(/[^a-zA-Z0-9-_]/g, '');
        const userName = (userInput.value || '').trim().slice(0, 24);
        if (!roomName || !userName) return false;

        try {
            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await Notification.requestPermission();
            }
            if (permission !== 'granted') {
                appendChatMessage('Système', 'Notifications non autorisées sur cet appareil.', new Date().toISOString(), true);
                return false;
            }

            const registration = await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();
            const vapidKeyArray = urlBase64ToUint8Array(CHAT_PUSH_VAPID_PUBLIC_KEY);
            let mustCreateNewSubscription = !subscription;

            if (subscription && subscription.options && subscription.options.applicationServerKey) {
                try {
                    const existingKey = new Uint8Array(subscription.options.applicationServerKey);
                    const sameKey = existingKey.length === vapidKeyArray.length
                        && existingKey.every((value, index) => value === vapidKeyArray[index]);

                    if (!sameKey) {
                        await subscription.unsubscribe();
                        subscription = null;
                        mustCreateNewSubscription = true;
                    }
                } catch (compareError) {
                    console.warn('Comparaison abonnement Push impossible, réabonnement forcé:', compareError);
                    try {
                        await subscription.unsubscribe();
                    } catch (_) {}
                    subscription = null;
                    mustCreateNewSubscription = true;
                }
            } else if (subscription) {
                try {
                    await subscription.unsubscribe();
                } catch (_) {}
                subscription = null;
                mustCreateNewSubscription = true;
            }

            if (mustCreateNewSubscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: vapidKeyArray
                });
            }

            const response = await fetch(getChatPushApiUrl('subscribe'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room: roomName,
                    user: userName,
                    clientId: myClientId,
                    subscription
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            localStorage.setItem('teamChatPushEnabled', 'true');
            return true;
        } catch (error) {
            console.warn('Activation Web Push impossible:', error);
            appendChatMessage('Système', `Push arrière-plan indisponible (${error.message || error}).`, new Date().toISOString(), true);
            return false;
        }
        })();

        try {
            return await chatPushSubscriptionPromise;
        } finally {
            chatPushSubscriptionPromise = null;
        }
    };

    const sendChatPushNotification = async (payload) => {
        if (!isChatPushConfigured() || !payload || payload.type !== 'chat') return;
        const roomName = (roomInput.value || '').trim().replace(/[^a-zA-Z0-9-_]/g, '');
        if (!roomName) return;

        try {
            await fetch(getChatPushApiUrl('message'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room: roomName,
                    senderClientId: myClientId,
                    user: payload.user,
                    text: payload.text,
                    time: payload.time,
                    id: payload.id
                })
            });
        } catch (error) {
            console.warn('Envoi push arrière-plan impossible:', error);
        }
    };

    const formatRecentUserAge = (timeMs) => {
        const ageSeconds = Math.max(0, Math.round((Date.now() - timeMs) / 1000));
        if (ageSeconds < 60) return `${ageSeconds} s`;
        return `${Math.round(ageSeconds / 60)} min`;
    };

    const refreshOnlineUsersLabel = () => {
        const now = Date.now();

        const users = Array.from(activeUsers.entries())
            .map(([clientId, record]) => {
                if (typeof record === 'string') {
                    return { clientId, user: record, timeMs: now, status: 'online', isSelf: clientId === myClientId };
                }
                return { ...record, clientId, isSelf: clientId === myClientId };
            })
            .filter((record) => record && typeof record.user === 'string' && record.user.trim())
            .filter((record) => Number.isFinite(record.timeMs) && (now - record.timeMs) <= CHAT_RECENT_USER_MAX_AGE_MS)
            .sort((a, b) => {
                if (a.isSelf && !b.isSelf) return -1;
                if (!a.isSelf && b.isSelf) return 1;
                return a.user.localeCompare(b.user, 'fr');
            });

        if (!users.length) {
            onlineUsersLabel.textContent = 'Vus <30 min: 0';
            onlineUsersLabel.title = 'Aucun utilisateur vu sur ce canal dans les 30 dernières minutes.';
            return;
        }

        const preview = users
            .map((record) => record.isSelf ? `${record.user}` : `${record.user} ${formatRecentUserAge(record.timeMs)}`)
            .join(', ');
        onlineUsersLabel.textContent = `Vus <30 min: ${users.length}${preview ? ` (${preview})` : ''}`;
        onlineUsersLabel.title = users
            .map((record) => record.isSelf
                ? `${record.user} — cet appareil`
                : `${record.user} — vu il y a ${formatRecentUserAge(record.timeMs)}${record.status === 'offline' ? ' (hors ligne)' : ''}`)
            .join('\n');
    };

    const publishPresence = (status, explicitUser = null) => {
        if (!chatClient || !chatPresenceTopic || !myClientId) return;
        const username = (explicitUser || userInput.value || '').trim();
        chatClient.publish(`${chatPresenceTopic}/${myClientId}`, JSON.stringify({
            type: 'presence',
            senderClientId: myClientId,
            user: username || 'inconnu',
            status,
            time: new Date().toISOString()
        }), { qos: 1, retain: true });
    };

    const startPresenceHeartbeat = () => {
        if (chatPresenceHeartbeatTimer) clearInterval(chatPresenceHeartbeatTimer);
        if (chatRecentUsersRefreshTimer) clearInterval(chatRecentUsersRefreshTimer);

        publishPresence('online');

        chatPresenceHeartbeatTimer = setInterval(() => {
            publishPresence('online');
            refreshOnlineUsersLabel();
        }, CHAT_PRESENCE_HEARTBEAT_MS);

        chatRecentUsersRefreshTimer = setInterval(refreshOnlineUsersLabel, 30 * 1000);
    };

    const stopPresenceHeartbeat = () => {
        if (chatPresenceHeartbeatTimer) {
            clearInterval(chatPresenceHeartbeatTimer);
            chatPresenceHeartbeatTimer = null;
        }
        if (chatRecentUsersRefreshTimer) {
            clearInterval(chatRecentUsersRefreshTimer);
            chatRecentUsersRefreshTimer = null;
        }
    };

    const updateLocationShareButton = () => {
        locationShareButton.textContent = locationSharingEnabled ? '📍 Position ON' : '📍 Position OFF';
        locationShareButton.style.background = locationSharingEnabled ? '#1f8f3a' : '#6b7280';
        locationShareButton.style.color = '#ffffff';
        locationShareButton.classList.toggle('active', locationSharingEnabled);
    };

    const getOwnLocationTopic = () => {
        return chatLocationTopic && myClientId ? `${chatLocationTopic}/${myClientId}` : null;
    };

    const formatLocationAge = (timeMs) => {
        const ageSeconds = Math.max(0, Math.round((Date.now() - timeMs) / 1000));
        if (ageSeconds < 60) return `${ageSeconds} s`;
        const ageMinutes = Math.round(ageSeconds / 60);
        return `${ageMinutes} min`;
    };

    const formatAltitudeLabel = (altitudeFt, altitudeTimeMs) => {
        const hasFreshAltitude = Number.isFinite(altitudeFt)
            && Number.isFinite(altitudeTimeMs)
            && (Date.now() - altitudeTimeMs) <= CHAT_ALTITUDE_STALE_MS;

        return hasFreshAltitude ? `${Math.round(altitudeFt)} ft` : '--- ft';
    };

    const buildRemoteLocationIcon = (user, timeMs, altitudeFt = null, altitudeTimeMs = null, labelOffset = { x: 0, y: 0 }) => {
        const ageMs = Date.now() - timeMs;

        let color = '#2563eb'; // Bleu : position récente < 20 s
        if (ageMs >= 20000 && ageMs < 60000) {
            color = '#f97316'; // Orange : 20 s à 1 min
        } else if (ageMs >= 60000) {
            color = '#dc2626'; // Rouge : plus de 1 min
        }

        const opacity = ageMs > CHAT_LOCATION_STALE_MS ? 0.75 : 0.98;
        const altitudeLabel = formatAltitudeLabel(altitudeFt, altitudeTimeMs);
        const label = `${escapeHtml(user || 'inconnu')}<br><span>${formatLocationAge(timeMs)}</span><br><span>${altitudeLabel}</span>`;
        const safeOffsetX = Number.isFinite(labelOffset?.x) ? labelOffset.x : 0;
        const safeOffsetY = Number.isFinite(labelOffset?.y) ? labelOffset.y : 0;

        return L.divIcon({
            className: 'chat-location-marker',
            html: `<div style="display:flex;align-items:center;gap:5px;opacity:${opacity};">
                    <div style="flex:0 0 auto;width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45);"></div>
                    <div style="transform:translate(${safeOffsetX}px,${safeOffsetY}px);background:#ffffff;border:1px solid ${color};border-radius:8px;padding:3px 6px;font-size:11px;line-height:1.15;font-weight:700;color:#111;box-shadow:0 1px 5px rgba(0,0,0,.25);white-space:nowrap;text-align:center;min-width:44px;">${label}</div>
                </div>`,
            iconSize: [118, 76],
            iconAnchor: [7, 38]
        });
    };

    const removeRemoteLocation = (senderClientId) => {
        const record = remoteLocationMarkers.get(senderClientId);
        if (record?.marker && map) {
            map.removeLayer(record.marker);
        }
        remoteLocationMarkers.delete(senderClientId);
    };

    const updateRemoteLocationLabelOffsets = () => {
        if (!map || !remoteLocationMarkers.size) return;

        /*
         * Anti-chevauchement v2 :
         * - on tient compte de l'étiquette de notre propre position ;
         * - on teste plusieurs positions possibles pour chaque vignette ;
         * - on choisit la première position qui ne croise pas une vignette déjà placée.
         *
         * Les ronds restent sur les vraies positions GPS. Seules les vignettes bougent.
         */
        const labelWidth = 62;
        const labelHeight = 46;
        const margin = 8;

        const makeBox = (point, offset) => ({
            left: point.x + 22 + offset.x,
            top: point.y - 23 + offset.y,
            right: point.x + 22 + offset.x + labelWidth,
            bottom: point.y - 23 + offset.y + labelHeight
        });

        const makeOwnBox = () => {
            if (!userMarker || !map) return null;
            const latLng = userMarker.getLatLng && userMarker.getLatLng();
            if (!latLng) return null;
            const point = map.latLngToLayerPoint(latLng);

            return {
                left: point.x + 22,
                top: point.y - 25,
                right: point.x + 22 + 56,
                bottom: point.y - 25 + 28
            };
        };

        const intersects = (a, b) => {
            if (!a || !b) return false;
            return !(
                a.right + margin < b.left
                || a.left - margin > b.right
                || a.bottom + margin < b.top
                || a.top - margin > b.bottom
            );
        };

        /*
         * v11.88 — étiquette utilisateurs distants :
         * position normale accolée à l'icône, comme les pélicandromes.
         * Les décalages ne servent qu'en anti-chevauchement.
         */
        const offsets = [
            { x: 0, y: 0 },
            { x: 0, y: -34 },
            { x: 0, y: 34 },
            { x: 58, y: 0 },
            { x: -72, y: 0 },
            { x: 58, y: -28 },
            { x: 58, y: 28 },
            { x: -72, y: -28 },
            { x: -72, y: 28 },
            { x: 0, y: -68 },
            { x: 0, y: 68 }
        ];

        const placedBoxes = [];
        const ownBox = makeOwnBox();
        if (ownBox) placedBoxes.push(ownBox);

        const records = Array.from(remoteLocationMarkers.entries())
            .map(([senderClientId, record]) => {
                if (!record?.marker || !Number.isFinite(record.lat) || !Number.isFinite(record.lon)) return null;
                const point = map.latLngToLayerPoint([record.lat, record.lon]);
                return { senderClientId, record, point };
            })
            .filter(Boolean)
            .sort((a, b) => (a.point.y - b.point.y) || (a.point.x - b.point.x));

        records.forEach((item) => {
            let selectedOffset = offsets[offsets.length - 1];
            let selectedBox = makeBox(item.point, selectedOffset);

            for (const offset of offsets) {
                const candidateBox = makeBox(item.point, offset);
                const collision = placedBoxes.some((box) => intersects(candidateBox, box));

                if (!collision) {
                    selectedOffset = offset;
                    selectedBox = candidateBox;
                    break;
                }
            }

            item.record.labelOffset = selectedOffset;
            item.record.marker.setIcon(buildRemoteLocationIcon(
                item.record.user,
                item.record.timeMs,
                item.record.altitudeFt,
                item.record.altitudeTimeMs,
                selectedOffset
            ));

            placedBoxes.push(selectedBox);
        });
    };


    const refreshRemoteLocationMarkers = () => {
        if (!map) return;
        remoteLocationMarkers.forEach((record, senderClientId) => {
            const ageMs = Date.now() - record.timeMs;
            if (ageMs > CHAT_LOCATION_REMOVE_MS) {
                removeRemoteLocation(senderClientId);
                return;
            }
            record.marker.setIcon(buildRemoteLocationIcon(record.user, record.timeMs, record.altitudeFt, record.altitudeTimeMs, record.labelOffset));
        });
        updateRemoteLocationLabelOffsets();
    };

    const updateRemoteLocationMarker = (payload) => {
        if (!map || !payload || payload.senderClientId === myClientId) return;
        const lat = Number(payload.lat);
        const lon = Number(payload.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const user = String(payload.user || 'inconnu').trim().slice(0, 24) || 'inconnu';
        const timeMs = Date.parse(payload.time || '');
        const safeTimeMs = Number.isFinite(timeMs) ? timeMs : Date.now();

        if ((Date.now() - safeTimeMs) > CHAT_LOCATION_DISPLAY_MAX_AGE_MS) {
            removeRemoteLocation(payload.senderClientId);
            return;
        }

        const position = [lat, lon];
        const existing = remoteLocationMarkers.get(payload.senderClientId);

        const altitudeMeters = Number(payload.altitude);
        const hasAltitude = Number.isFinite(altitudeMeters);
        const altitudeFt = hasAltitude
            ? Math.round(altitudeMeters * 3.28084)
            : (Number.isFinite(existing?.altitudeFt) ? existing.altitudeFt : null);
        const altitudeTimeMs = hasAltitude
            ? safeTimeMs
            : (Number.isFinite(existing?.altitudeTimeMs) ? existing.altitudeTimeMs : null);

        const altitudeLabel = formatAltitudeLabel(altitudeFt, altitudeTimeMs);
        const popupHtml = `<b>${escapeHtml(user)}</b><br>Position: ${formatLocationAge(safeTimeMs)}<br>${altitudeLabel}`;

        if (existing?.marker) {
            existing.marker.setLatLng(position);
            existing.marker.setIcon(buildRemoteLocationIcon(user, safeTimeMs, altitudeFt, altitudeTimeMs, existing.labelOffset));
            existing.marker.bindPopup(popupHtml);
            existing.user = user;
            existing.timeMs = safeTimeMs;
            existing.lat = lat;
            existing.lon = lon;
            existing.altitudeFt = altitudeFt;
            existing.altitudeTimeMs = altitudeTimeMs;
            existing.altitudeAccuracy = Number.isFinite(Number(payload.altitudeAccuracy)) ? Number(payload.altitudeAccuracy) : null;
            updateRemoteLocationLabelOffsets();
            return;
        }

        const marker = L.marker(position, {
            icon: buildRemoteLocationIcon(user, safeTimeMs, altitudeFt, altitudeTimeMs, { x: 0, y: 0 }),
            interactive: true
        }).bindPopup(popupHtml);

        marker.addTo(map);
        remoteLocationMarkers.set(payload.senderClientId, {
            marker,
            user,
            timeMs: safeTimeMs,
            lat,
            lon,
            altitudeFt,
            altitudeTimeMs,
            altitudeAccuracy: Number.isFinite(Number(payload.altitudeAccuracy)) ? Number(payload.altitudeAccuracy) : null,
            labelOffset: { x: 0, y: 0 }
        });
        updateRemoteLocationLabelOffsets();
    };

    const publishOwnLocationClear = () => {
        const ownTopic = getOwnLocationTopic();
        if (!chatClient || !ownTopic) return;
        chatClient.publish(ownTopic, '', { qos: 1, retain: true });
    };

    const publishOwnLocation = (pos) => {
        const ownTopic = getOwnLocationTopic();
        if (!chatClient || !chatConnected || !ownTopic || !pos?.coords) return;

        const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        const userName = (userInput.value || '').trim().slice(0, 24) || 'inconnu';
        const payload = {
            type: 'location',
            room: (roomInput.value || '').trim().replace(/[^a-zA-Z0-9-_]/g, ''),
            senderClientId: myClientId,
            user: userName,
            lat: latitude,
            lon: longitude,
            accuracy: Number.isFinite(accuracy) ? accuracy : null,
            altitude: Number.isFinite(altitude) ? altitude : null,
            altitudeAccuracy: Number.isFinite(altitudeAccuracy) ? altitudeAccuracy : null,
            heading: Number.isFinite(heading) ? heading : null,
            speed: Number.isFinite(speed) ? speed : null,
            time: new Date().toISOString()
        };

        chatClient.publish(ownTopic, JSON.stringify(payload), { qos: 1, retain: true });
        lastLocationPublishAt = Date.now();
    };

    const requestAndPublishOwnLocation = () => {
        if (!locationSharingEnabled || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                updateUserPosition(pos);
                publishOwnLocation(pos);
            },
            (error) => {
                console.warn('Position GPS chat indisponible:', error);
                console.warn('[Chat] Position GPS indisponible:', error);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
    };

    const startLocationSharing = (silent = false) => {
        if (!navigator.geolocation) {
            console.warn('[Chat] Partage position impossible: GPS non supporté.');
            return;
        }
        if (!chatClient || !chatConnected || !chatLocationTopic) {
            appendChatMessage('Système', 'Connecte le chat avant d’activer le partage de position.', new Date().toISOString(), true);
            return;
        }

        locationSharingEnabled = true;
        localStorage.setItem(CHAT_LOCATION_SHARING_KEY, 'true');
        updateLocationShareButton();

        if (locationPublishTimer) clearInterval(locationPublishTimer);
        requestAndPublishOwnLocation();
        locationPublishTimer = setInterval(requestAndPublishOwnLocation, CHAT_LOCATION_PUBLISH_INTERVAL_MS);

        if (!silent) {
            appendChatMessage('Système', 'Partage de position activé.', new Date().toISOString(), true);
        }
    };

    const stopLocationSharing = (silent = false) => {
        locationSharingEnabled = false;
        localStorage.setItem(CHAT_LOCATION_SHARING_KEY, 'false');
        updateLocationShareButton();

        if (locationPublishTimer) {
            clearInterval(locationPublishTimer);
            locationPublishTimer = null;
        }

        publishOwnLocationClear();

        if (!silent) {
            appendChatMessage('Système', 'Partage de position désactivé.', new Date().toISOString(), true);
        }
    };

    setInterval(refreshRemoteLocationMarkers, 15000);
    if (map) {
        map.on('zoomend moveend', updateRemoteLocationLabelOffsets);
    }
    updateLocationShareButton();

    const persistSeenIds = () => {
        localStorage.setItem(CHAT_SEEN_IDS_KEY, JSON.stringify(Array.from(persistedSeenIds).slice(-400)));
    };

    const updateMessageStatus = (messageId, nextStatus) => {
        if (!messageId || !sentMessageElements.has(messageId)) return;
        const statusEl = sentMessageElements.get(messageId);
        if (!statusEl) return;
        const isRead = nextStatus === 'read';
        statusEl.textContent = isRead ? '✓✓' : (nextStatus === 'sent' ? '✓' : '⏳');
        statusEl.classList.toggle('read', isRead);

        const current = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
        const index = current.findIndex((m) => m.id === messageId);
        if (index >= 0) {
            current[index].status = nextStatus;
            localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(current));
        }
    };

    const addToOutbox = (payload) => {
        const outbox = JSON.parse(localStorage.getItem(CHAT_OUTBOX_KEY) || '[]');
        outbox.push(payload);
        localStorage.setItem(CHAT_OUTBOX_KEY, JSON.stringify(outbox.slice(-100)));
    };

    const publishChatPayload = (payload, onLiveAck = null) => {
        if (!chatClient || !chatTopic || !chatHistoryTopic) return;
        chatClient.publish(chatTopic, JSON.stringify(payload), { qos: 1 }, (err) => {
            if (!err && typeof onLiveAck === 'function') onLiveAck();
        });
        chatClient.publish(`${chatHistoryTopic}/${payload.id}`, JSON.stringify(payload), { qos: 1, retain: true });

        // Push Web pour les appareils où la PWA est en arrière-plan/suspendue.
        // Cette ligne ne fait rien tant que CHAT_PUSH_API_URL et CHAT_PUSH_VAPID_PUBLIC_KEY ne sont pas configurés.
        sendChatPushNotification(payload);
    };

    const flushOutbox = () => {
        if (!chatClient || !chatConnected || !chatTopic) return;
        const outbox = JSON.parse(localStorage.getItem(CHAT_OUTBOX_KEY) || '[]');
        if (!outbox.length) return;
        outbox.forEach((payload) => {
            publishChatPayload(payload, () => updateMessageStatus(payload.id, 'sent'));
        });
        localStorage.removeItem(CHAT_OUTBOX_KEY);
        console.info(`[Chat] ${outbox.length} message(s) hors-ligne envoyé(s).`);
    };

    const renderIncomingChatMessage = (parsed, isCurrentChatTopic) => {
        if (!parsed || !parsed.id || !parsed.user || !parsed.text || !parsed.time) return;
        if (renderedMessageIds.has(parsed.id)) return;

        renderedMessageIds.add(parsed.id);
        persistedSeenIds.add(parsed.id);
        persistSeenIds();
        const isOwnMessage = parsed.senderClientId === myClientId;
        appendChatMessage(parsed.user, parsed.text, parsed.time, false, { ...parsed, isOwnMessage, status: isOwnMessage ? 'sent' : 'read' });
        saveMessageInHistory({ ...parsed, status: isOwnMessage ? 'sent' : 'read' });

        if (!isOwnMessage) {
            chatClient.publish(chatTopic, JSON.stringify({
                type: 'read_receipt',
                messageId: parsed.id,
                reader: (userInput.value || '').trim() || 'inconnu',
                time: new Date().toISOString()
            }), { qos: 1 });
        }

        if (!isOwnMessage && shouldWarnUnread()) {
            unreadCount += 1;
            updateUnreadBadge();
        }

        if (!isOwnMessage && isCurrentChatTopic) {
            notifyWhenInBackground(`Pelic Chat • ${(roomInput.value || '').trim() || 'canal'}`, `${parsed.user}: ${parsed.text}`, `pelic-chat-${chatTopic}`);
        }
    };

    const reconnectIfNeeded = (reasonLabel = 'Reconnexion...') => {
        const roomName = (roomInput.value || '').trim().replace(/[^a-zA-Z0-9-_]/g, '');
        const userName = (userInput.value || '').trim();
        if (!roomName || !userName) return;
        if (chatConnected || isChatConnecting) return;
        console.info('[Chat]', reasonLabel);
        connectToChat();
    };

    async function connectToChat() {
        if (isChatConnecting) return;
        isChatConnecting = true;

        if (typeof mqtt === 'undefined') {
            try {
                console.info('[Chat] Chargement du module chat…');
                await ensureMqttClientLoaded();
            } catch (mqttError) {
                isChatConnecting = false;
                appendChatMessage('Système', `Client MQTT introuvable (${mqttError.message || mqttError}).`, new Date().toISOString(), true);
                return;
            }
        }
        const roomName = (roomInput.value || '').trim().replace(/[^a-zA-Z0-9-_]/g, '');
        const userName = (userInput.value || '').trim();
        if (!roomName || !userName) {
            appendChatMessage('Système', 'Canal et pseudo obligatoires.', new Date().toISOString(), true);
            isChatConnecting = false;
            return;
        }

        const desiredChatTopic = `pelic/chat/${roomName}`;
        if (chatClient && chatConnected && chatTopic === desiredChatTopic) {
            isChatConnecting = false;
            ensureChatPushSubscription().catch(() => {});
            return;
        }

        persistConfig();
        const previousUser = activeUsers.get(myClientId) || (userInput.value || '').trim();
        publishPresence('offline', previousUser);
        if (chatClient) {
            try { chatClient.end(true); } catch (_) {}
            chatClient = null;
        }
        activeUsers.clear();
        refreshOnlineUsersLabel();

        chatTopic = `pelic/chat/${roomName}`;
        chatHistoryTopic = `pelic/chat_history/${roomName}`;
        chatPresenceTopic = `pelic/chat_presence/${roomName}`;
        chatLocationTopic = `pelic/chat_location/${roomName}`;
        setConnectionState(false, 'Connexion...');
        hasAnnouncedConnection = false;
        pendingChatMessages.length = 0;
        chatClient = mqtt.connect(CHAT_BROKER_URL, {
            keepalive: 45,
            reconnectPeriod: 5000,
            connectTimeout: 20000,
            clean: true, // session non persistante: évite de conserver des abonnements d'anciens canaux
            protocolVersion: 4,
            clientId: myClientId,
            will: {
                topic: `${chatPresenceTopic}/${myClientId}`,
                payload: JSON.stringify({
                    type: 'presence',
                    senderClientId: myClientId,
                    user: userName,
                    status: 'offline',
                    time: new Date().toISOString()
                }),
                qos: 1,
                retain: true
            }
        });

        chatClient.on('connect', () => {
            const announceConnection = () => {
                if (hasAnnouncedConnection) return;
                hasAnnouncedConnection = true;
                setConnectionState(true);
                isChatConnecting = false;
                lastValidatedChatConfig = getCurrentChatConfig();
                updateChatValidateButtonState();
                console.info(`[Chat] Connecté au canal "${roomName}" (${CHAT_BROKER_URL}).`);

                while (pendingChatMessages.length) {
                    const pendingItem = pendingChatMessages.shift();
                    renderIncomingChatMessage(pendingItem.parsed, pendingItem.isCurrentChatTopic);
                }
            };

            chatClient.subscribe(chatTopic, { qos: 1 }, (err) => {
                if (err) {
                    setConnectionState(false, 'Erreur abonnement');
                    isChatConnecting = false;
                    appendChatMessage('Système', `Abonnement impossible: ${err.message}`, new Date().toISOString(), true);
                    return;
                }

                // On annonce la connexion dès que le canal de chat principal est prêt,
                // pour conserver un ordre visuel cohérent avec les messages reçus juste après reconnexion.
                announceConnection();
                if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                    Notification.requestPermission().catch(() => {});
                }
                ensureChatPushSubscription().catch(() => {});

                chatClient.subscribe(`${chatHistoryTopic}/#`, { qos: 1 }, (historyErr) => {
                    if (historyErr) {
                        setConnectionState(false, 'Erreur historique');
                        isChatConnecting = false;
                        appendChatMessage('Système', `Abonnement historique impossible: ${historyErr.message}`, new Date().toISOString(), true);
                        return;
                    }
                    chatClient.subscribe(`${chatPresenceTopic}/#`, { qos: 1 }, (presenceErr) => {
                        if (presenceErr) {
                            setConnectionState(false, 'Erreur présence');
                            isChatConnecting = false;
                            appendChatMessage('Système', `Abonnement présence impossible: ${presenceErr.message}`, new Date().toISOString(), true);
                            return;
                        }

                        chatClient.subscribe(`${chatLocationTopic}/#`, { qos: 1 }, (locationErr) => {
                            if (locationErr) {
                                setConnectionState(false, 'Erreur positions');
                                isChatConnecting = false;
                                appendChatMessage('Système', `Abonnement positions impossible: ${locationErr.message}`, new Date().toISOString(), true);
                                return;
                            }

                            announceConnection();
                            publishPresence('online', userName);
                            startPresenceHeartbeat();
                            if (locationSharingEnabled) {
                                startLocationSharing(true);
                            }
                            flushOutbox();
                        });
                    });
                });
            });
        });

        chatClient.on('message', (receivedTopic, payload) => {
            try {
                const isCurrentChatTopic = receivedTopic === chatTopic;
                const isCurrentHistoryTopic = receivedTopic.startsWith(`${chatHistoryTopic}/`);
                const isCurrentPresenceTopic = receivedTopic.startsWith(`${chatPresenceTopic}/`);
                const isCurrentLocationTopic = chatLocationTopic && receivedTopic.startsWith(`${chatLocationTopic}/`);
                if (!isCurrentChatTopic && !isCurrentHistoryTopic && !isCurrentPresenceTopic && !isCurrentLocationTopic) return;

                const rawPayload = payload.toString();
                if (isCurrentLocationTopic && !rawPayload) {
                    removeRemoteLocation(receivedTopic.split('/').pop());
                    return;
                }

                const parsed = JSON.parse(rawPayload);
                if (!parsed || !parsed.type) return;

                if (parsed.type === 'location' && parsed.senderClientId) {
                    const locationTimeMs = Date.parse(parsed.time || '');
                    const locationAgeMs = Number.isFinite(locationTimeMs) ? (Date.now() - locationTimeMs) : Infinity;

                    if (locationAgeMs > CHAT_LOCATION_DISPLAY_MAX_AGE_MS) {
                        removeRemoteLocation(parsed.senderClientId);

                        // Nettoie aussi la position conservée sur le broker MQTT pour éviter
                        // qu'elle revienne brièvement à chaque ouverture de l'application.
                        if (chatClient && isCurrentLocationTopic && receivedTopic) {
                            chatClient.publish(receivedTopic, '', { qos: 1, retain: true });
                        }
                        return;
                    }

                    updateRemoteLocationMarker(parsed);
                    return;
                }

                if (parsed.type === 'read_receipt' && parsed.messageId) {
                    updateMessageStatus(parsed.messageId, 'read');
                    return;
                }

                if (parsed.type === 'presence' && parsed.senderClientId) {
                    const presenceTimeMs = Date.parse(parsed.time || '');
                    const safePresenceTimeMs = Number.isFinite(presenceTimeMs) ? presenceTimeMs : Date.now();
                    activeUsers.set(parsed.senderClientId, {
                        user: (parsed.user || '').trim() || 'inconnu',
                        timeMs: safePresenceTimeMs,
                        status: parsed.status || 'online'
                    });
                    refreshOnlineUsersLabel();
                    return;
                }

                if (parsed.type !== 'chat' || !parsed.user || !parsed.text || !parsed.time || !parsed.id) return;
                if (receivedTopic.startsWith(chatHistoryTopic)) {
                    const ageHours = Math.abs(Date.now() - new Date(parsed.time).getTime()) / 3600000;
                    if (Number.isFinite(ageHours) && ageHours > 12) {
                        // Nettoyage automatique des messages retenus trop anciens (>12h) sur le canal.
                        if (parsed.id && chatClient && chatHistoryTopic) {
                            chatClient.publish(`${chatHistoryTopic}/${parsed.id}`, '', { qos: 1, retain: true });
                        }
                        return;
                    }
                }

                if (!hasAnnouncedConnection) {
                    pendingChatMessages.push({ parsed, isCurrentChatTopic });
                    return;
                }

                renderIncomingChatMessage(parsed, isCurrentChatTopic);
            } catch (_) {}
        });

        chatClient.on('reconnect', () => {
            hasAnnouncedConnection = false;
            setConnectionState(false, 'Reconnexion...');
        });
        chatClient.on('close', () => {
            stopPresenceHeartbeat();
            hasAnnouncedConnection = false;
            isChatConnecting = false;
            setConnectionState(false);
            if (locationPublishTimer) {
                clearInterval(locationPublishTimer);
                locationPublishTimer = null;
            }
            activeUsers.clear();
            refreshOnlineUsersLabel();
        });
        chatClient.on('offline', () => {
            stopPresenceHeartbeat();
            hasAnnouncedConnection = false;
            isChatConnecting = false;
            setConnectionState(false, 'Hors ligne');
            if (locationPublishTimer) {
                clearInterval(locationPublishTimer);
                locationPublishTimer = null;
            }
            activeUsers.clear();
            refreshOnlineUsersLabel();
        });
        chatClient.on('error', (err) => {
            isChatConnecting = false;
            setConnectionState(false, 'Erreur réseau');
            appendChatMessage('Système', `Erreur réseau: ${err.message}`, new Date().toISOString(), true);
        });
    }

    function disconnectFromChat() {
        stopPresenceHeartbeat();
        isChatConnecting = false;
        publishOwnLocationClear();
        publishPresence('offline', (userInput.value || '').trim());

        if (locationPublishTimer) {
            clearInterval(locationPublishTimer);
            locationPublishTimer = null;
        }

        if (chatClient) {
            const clientToClose = chatClient;
            chatClient = null;
            try { clientToClose.end(true); } catch (_) {}
        }

        activeUsers.clear();
        refreshOnlineUsersLabel();
        setConnectionState(false, 'Hors ligne');
        appendChatMessage('Système', 'Déconnecté du chat.', new Date().toISOString(), true);
    }


    function sendCurrentMessage() {
        const text = (messageInput.value || '').trim();
        const user = (userInput.value || '').trim();
        if (!text) return;
        const payload = {
            type: 'chat',
            id: `msg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            senderClientId: myClientId,
            user,
            text: text.slice(0, 280),
            time: new Date().toISOString()
        };
        renderedMessageIds.add(payload.id);
        persistedSeenIds.add(payload.id);
        persistSeenIds();
        appendChatMessage(payload.user, payload.text, payload.time, false, { ...payload, isOwnMessage: true, status: 'pending' });
        saveMessageInHistory({ ...payload, status: 'pending' });

        if (!chatClient || !chatConnected || !chatTopic) {
            addToOutbox(payload);
            console.info('[Chat] Réseau indisponible: message mis en file hors-ligne.');
            messageInput.value = '';
            return;
        }

        publishChatPayload(payload, () => updateMessageStatus(payload.id, 'sent'));
        messageInput.value = '';
    }

    const toggleChatPanel = () => {
        const visible = panel.style.display === 'flex';
        panel.style.display = visible ? 'none' : 'flex';
        if (!visible) {
            unreadCount = 0;
            updateUnreadBadge();
        }
    };
    toggleButton.addEventListener('click', toggleChatPanel);

    minimizeButton.addEventListener('click', () => {
        toggleChatPanel();
    });

    const clearLocalHistory = () => {
        messagesBox.innerHTML = '';
        localStorage.removeItem(CHAT_HISTORY_KEY);
        localStorage.removeItem(CHAT_SEEN_IDS_KEY);
        renderedMessageIds.clear();
        persistedSeenIds.clear();
        sentMessageElements.clear();
        unreadCount = 0;
        updateUnreadBadge();
    };

    const openClearModal = () => {
        clearModal.style.display = 'flex';
    };

    const closeClearModal = () => {
        clearModal.style.display = 'none';
    };

    clearButton.addEventListener('click', openClearModal);
    clearCancelButton.addEventListener('click', closeClearModal);
    clearModal.addEventListener('click', (event) => {
        if (event.target === clearModal) closeClearModal();
    });

    clearLocalButton.addEventListener('click', () => {
        clearLocalHistory();
        appendChatMessage('Système', 'Historique local supprimé.', new Date().toISOString(), true);
        closeClearModal();
    });

    clearChannelButton.addEventListener('click', () => {
        const history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
        if (!chatClient || !chatConnected || !chatHistoryTopic) {
            alert('Connexion au canal requise pour supprimer les messages enregistrés du canal.');
            return;
        }
        const historyIds = Array.from(new Set(history.map((item) => item?.id).filter(Boolean)));
        historyIds.forEach((messageId) => {
            chatClient.publish(`${chatHistoryTopic}/${messageId}`, '', { qos: 1, retain: true });
        });
        clearLocalHistory();
        appendChatMessage('Système', `Historique local supprimé + ${historyIds.length} message(s) canal nettoyé(s).`, new Date().toISOString(), true);
        closeClearModal();
    });

    roomInput.addEventListener('input', updateChatValidateButtonState);
    roomInput.addEventListener('change', updateChatValidateButtonState);
    userInput.addEventListener('input', updateChatValidateButtonState);
    userInput.addEventListener('change', updateChatValidateButtonState);
    validateChatConfigButton.addEventListener('click', applyChatConfigValidation);
    updateChatValidateButtonState();

    connectButton.addEventListener('click', () => {
        if (chatConnected || isChatConnecting) {
            disconnectFromChat();
        } else {
            connectToChat();
        }
    });
    locationShareButton.addEventListener('click', () => {
        if (locationSharingEnabled) {
            stopLocationSharing();
        } else {
            startLocationSharing();
        }
    });
    sendButton.addEventListener('click', sendCurrentMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendCurrentMessage();
        }
    });

    window.addEventListener('online', () => {
        if (reconnectAfterOnlineTimeout) clearTimeout(reconnectAfterOnlineTimeout);
        reconnectAfterOnlineTimeout = setTimeout(() => {
            reconnectIfNeeded('Réseau récupéré, tentative de reconnexion.');
        }, 400);
    });
    window.addEventListener('offline', () => {
        if (reconnectAfterOnlineTimeout) {
            clearTimeout(reconnectAfterOnlineTimeout);
            reconnectAfterOnlineTimeout = null;
        }
        setConnectionState(false, 'Hors ligne');
        console.info('[Chat] Réseau perdu, les messages sortants seront mis en file.');
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            if (reconnectAfterOnlineTimeout) clearTimeout(reconnectAfterOnlineTimeout);
            reconnectAfterOnlineTimeout = setTimeout(() => {
                reconnectIfNeeded('Retour au premier plan, reconnexion du chat.');
            }, 200);
        }
    });

    window.addEventListener('beforeunload', () => {
        publishOwnLocationClear();
        publishPresence('offline');
    });

    function getChatSenderStyle(user, isSystemMessage = false) {
    if (isSystemMessage) {
        return {
            color: '#6b7280',
            background: '#f3f4f6',
            border: '#9ca3af'
        };
    }

    const palette = [
        { color: '#1d4ed8', background: '#eff6ff', border: '#3b82f6' },
        { color: '#047857', background: '#ecfdf5', border: '#10b981' },
        { color: '#b45309', background: '#fffbeb', border: '#f59e0b' },
        { color: '#be123c', background: '#fff1f2', border: '#f43f5e' },
        { color: '#6d28d9', background: '#f5f3ff', border: '#8b5cf6' },
        { color: '#0f766e', background: '#f0fdfa', border: '#14b8a6' },
        { color: '#c2410c', background: '#fff7ed', border: '#fb923c' },
        { color: '#0369a1', background: '#f0f9ff', border: '#38bdf8' }
    ];

    const key = String(user || 'inconnu');
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
        hash = ((hash << 5) - hash) + key.charCodeAt(i);
        hash |= 0;
    }

    return palette[Math.abs(hash) % palette.length];
}

function appendChatMessage(user, text, isoTime, isSystemMessage = false, meta = null) {
        const row = document.createElement('div');
        row.className = 'chat-message';
        const time = new Date(isoTime || Date.now());
        const hh = `${time.getHours()}`.padStart(2, '0');
        const mm = `${time.getMinutes()}`.padStart(2, '0');
        const isOwnMessage = meta?.isOwnMessage === true;
        const baseStatus = meta?.status || 'sent';
        const statusSymbol = baseStatus === 'read' ? '✓✓' : (baseStatus === 'sent' ? '✓' : '⏳');
        const statusClass = baseStatus === 'read' ? 'chat-message-status read' : 'chat-message-status';
        const statusMarkup = (!isSystemMessage && isOwnMessage) ? `<span class="${statusClass}" data-message-status="${meta?.id || ''}">${statusSymbol}</span>` : '';
        const senderStyle = getChatSenderStyle(user, isSystemMessage);
        const senderLabel = isSystemMessage ? 'Système' : escapeHtml(user);

        if (!isSystemMessage) {
            row.classList.add(isOwnMessage ? 'chat-message-own' : 'chat-message-remote');
        }

        row.style.borderLeft = `4px solid ${senderStyle.border}`;
        row.style.backgroundColor = senderStyle.background;
        row.style.borderRadius = '8px';
        row.style.paddingLeft = '8px';

        row.innerHTML = `<b style="color:${senderStyle.color}">${senderLabel}</b> <span style="color:#7a7a7a">(${hh}:${mm})</span>${statusMarkup}<br>${escapeHtml(text)}`;
        messagesBox.appendChild(row);
        messagesBox.scrollTop = messagesBox.scrollHeight;
        if (meta?.id && isOwnMessage) {
            const statusEl = row.querySelector(`[data-message-status=\"${meta.id}\"]`);
            if (statusEl) sentMessageElements.set(meta.id, statusEl);
        }
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function initializeCalculator() {
    let isSharedHeaderSyncing = false;
    let activeRltMassWrapper = null;
    let activeRltMassLastEdited = null;
    let activeRltMassCalculationMode = null;
    let activeRltFirstFull = false;

    function getSharedHeaderMainId(wrapper) {
        if (!wrapper) return '';
        return wrapper.dataset?.syncTarget || wrapper.id || '';
    }

    function getSharedHeaderMirrorWrapper(mainId) {
        return document.querySelector(`.previ-shared-header-section [data-sync-target="${mainId}"]`);
    }

    function copyWrapperValue(sourceWrapper, targetWrapper) {
        if (!sourceWrapper || !targetWrapper) return;

        const sourceDisplay = sourceWrapper.querySelector('.display-input');
        const targetDisplay = targetWrapper.querySelector('.display-input');
        if (sourceDisplay && targetDisplay && targetDisplay.value !== sourceDisplay.value) {
            targetDisplay.value = sourceDisplay.value;
        }

        const sourceEngine = sourceWrapper.querySelector('.engine-input');
        const targetEngine = targetWrapper.querySelector('.engine-input');
        if (sourceEngine && targetEngine && targetEngine.value !== sourceEngine.value) {
            targetEngine.value = sourceEngine.value;
        }
    }

    function syncSharedHeaderFromWrapper(wrapper) {
        if (!wrapper || isSharedHeaderSyncing) return;

        const mainId = getSharedHeaderMainId(wrapper);
        if (!mainId) return;

        const mainWrapper = document.getElementById(mainId);
        const mirrorWrapper = getSharedHeaderMirrorWrapper(mainId);
        if (!mainWrapper || !mirrorWrapper) return;

        isSharedHeaderSyncing = true;
        try {
            if (wrapper === mirrorWrapper) {
                copyWrapperValue(mirrorWrapper, mainWrapper);
            } else if (wrapper === mainWrapper) {
                copyWrapperValue(mainWrapper, mirrorWrapper);
            }
        } finally {
            isSharedHeaderSyncing = false;
        }
    }

    function refreshSharedHeaderMirrorValues() {
        /*
         * v12.88 — Prévi indépendant : HEURE TO et FUEL Départ de
         * l'onglet Prévi ne sont plus synchronisés avec BLOC DÉPART / FUEL
         * DÉPART de BLOC/FUEL. Seuls TMD et LIMITE HDV restent communs.
         */
        ['tmd', 'limite-hdv'].forEach((mainId) => {
            copyWrapperValue(document.getElementById(mainId), getSharedHeaderMirrorWrapper(mainId));
        });

        const mainCs = document.getElementById('cs-lftw-display');
        const previCs = document.getElementById('previ-cs-lftw-display');
        if (mainCs && previCs) previCs.value = mainCs.value;

        const previBlocLabel = document.getElementById('previ-bloc-depart-label');
        if (previBlocLabel) previBlocLabel.textContent = 'HEURE TO';

        const mainCsLabel = document.getElementById('cs-base-label');
        const previCsLabel = document.getElementById('previ-cs-base-label');
        if (mainCsLabel && previCsLabel) previCsLabel.textContent = mainCsLabel.textContent;
    }


    const resetButton = document.getElementById('reset-all-btn');
    const onglets = document.querySelectorAll('.onglet-bouton');
    const csLftwDisplay = document.getElementById('cs-lftw-display');
    const refreshGpsBtn = document.getElementById('refresh-gps-btn');
    const deroutEmptyRetardantCheckbox = document.getElementById('derout-empty-retardant-checkbox');

    function getCurrentGpsAgeLabel() {
        if (!lastPosition || !lastPosition.timestamp) return null;
        const ageMs = Date.now() - Number(lastPosition.timestamp);
        if (!Number.isFinite(ageMs) || ageMs < 0) return null;
        const ageMinutes = Math.floor(ageMs / 60000);
        if (ageMinutes < 1) return 'moins d’1 min';
        if (ageMinutes < 60) return `${ageMinutes} min`;
        const ageHours = Math.floor(ageMinutes / 60);
        const remainingMinutes = ageMinutes % 60;
        return remainingMinutes ? `${ageHours} h ${remainingMinutes} min` : `${ageHours} h`;
    }

    function updateDeroutementGpsStatus(extraText = '') {
        const status = document.getElementById('derout-gps-status');
        if (!status) return;

        const hasMarkerGps = !!(userMarker && typeof userMarker.getLatLng === 'function' && userMarker.getLatLng());
        const hasLastGps = !!(lastPosition && Number.isFinite(Number(lastPosition.lat ?? lastPosition.latitude)) && Number.isFinite(Number(lastPosition.lng ?? lastPosition.longitude)));

        if (!hasMarkerGps && !hasLastGps) {
            status.textContent = extraText || 'GPS non disponible';
            status.className = 'derout-gps-status derout-gps-status-missing';
            return;
        }

        const timestamp = lastPosition && lastPosition.timestamp ? Number(lastPosition.timestamp) : Date.now();
        const updatedAt = new Date(timestamp);
        const hhmm = updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const ageLabel = getCurrentGpsAgeLabel();
        const ageMs = Number.isFinite(timestamp) ? Date.now() - timestamp : 0;
        const isOld = Number.isFinite(ageMs) && ageMs > 15 * 60000;
        const label = extraText || (isOld ? 'GPS ancien' : 'GPS actualisé');
        status.textContent = `${label} à ${hhmm}${ageLabel ? ` — ${ageLabel}` : ''}`;
        status.className = `derout-gps-status ${isOld ? 'derout-gps-status-old' : 'derout-gps-status-ok'}`;
    }

    if (deroutEmptyRetardantCheckbox) {
        deroutEmptyRetardantCheckbox.checked = localStorage.getItem(DEROUT_EMPTY_RETARDANT_KEY) === 'true';
        deroutEmptyRetardantCheckbox.addEventListener('change', () => {
            localStorage.setItem(DEROUT_EMPTY_RETARDANT_KEY, deroutEmptyRetardantCheckbox.checked ? 'true' : 'false');
            masterRecalculate();
        });
    }

    updateDeroutementGpsStatus();

    if (refreshGpsBtn) refreshGpsBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("La géolocalisation n'est pas supportée par votre navigateur.");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                updateUserPosition(pos);
                updateDeroutementGpsStatus('GPS actualisé');
                masterRecalculate();
            },
            () => {
                updateDeroutementGpsStatus('GPS non disponible');
                alert("Impossible d'obtenir la position GPS. Vérifiez les autorisations.");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });

    function updateLftwSunset() {
        const baseAirport = getAirportByOaci(selectedBaseOACI);
        if (baseAirport && typeof SunCalc !== 'undefined') {
            try {
                const now = new Date();
                const times = SunCalc.getTimes(now, baseAirport.lat, baseAirport.lon);
                const sunsetString = times.sunset.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
                if (csLftwDisplay) csLftwDisplay.value = sunsetString;
                const previCsDisplay = document.getElementById('previ-cs-lftw-display');
                if (previCsDisplay) previCsDisplay.value = sunsetString;
                return;
            } catch (e) {
                // ignore
            }
        }
        if (csLftwDisplay) csLftwDisplay.value = '--:--';
        const previCsDisplay = document.getElementById('previ-cs-lftw-display');
        if (previCsDisplay) previCsDisplay.value = '--:--';
    }
    window.updateBaseSunsetDisplay = updateLftwSunset;
    updateLftwSunset();
    setInterval(updateLftwSunset, 60000);

    const AIRPORT_DETECTION_RADIUS_NM = 2;

    function getCurrentGpsLatLngForAirportDetection() {
        if (userMarker && userMarker.getLatLng) {
            const latLng = userMarker.getLatLng();
            if (latLng && Number.isFinite(latLng.lat) && Number.isFinite(latLng.lng)) {
                return { lat: latLng.lat, lon: latLng.lng };
            }
        }

        if (lastPosition) {
            const lat = Number.isFinite(lastPosition.lat) ? lastPosition.lat : lastPosition.latitude;
            const lon = Number.isFinite(lastPosition.lng) ? lastPosition.lng : lastPosition.longitude;
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
                return { lat, lon };
            }
        }

        return null;
    }

    function getAirportAtCurrentPosition(maxDistanceNm = AIRPORT_DETECTION_RADIUS_NM) {
        const gps = getCurrentGpsLatLngForAirportDetection();
        if (!gps) return null;

        const airports = [...pelicanAirports, ...otherAirports];
        let bestAirport = null;
        let bestDistance = Infinity;

        airports.forEach((airport) => {
            const distance = calculateDistanceInNm(gps.lat, gps.lon, airport.lat, airport.lon);
            if (Number.isFinite(distance) && distance < bestDistance) {
                bestDistance = distance;
                bestAirport = airport;
            }
        });

        if (!bestAirport || bestDistance > maxDistanceNm) return null;
        return { ...bestAirport, distance: bestDistance };
    }

    function normalizeBlocDepartAirportOaci(value) {
        return String(value || '').trim().toUpperCase();
    }

    function getBlocDepartAirportOaci() {
        const blocDepartWrapper = document.getElementById('bloc-depart');
        const blocDepartValue = blocDepartWrapper?.querySelector('.display-input')?.value || '';

        if (parseTime(blocDepartValue) === null) {
            if (blocDepartWrapper) blocDepartWrapper.dataset.airportOaci = '';
            return '';
        }

        return normalizeBlocDepartAirportOaci(blocDepartWrapper?.dataset?.airportOaci || '');
    }

    function setBlocDepartAirportOaci(oaci) {
        const blocDepartWrapper = document.getElementById('bloc-depart');
        if (!blocDepartWrapper) return '';
        const normalized = normalizeBlocDepartAirportOaci(oaci);
        blocDepartWrapper.dataset.airportOaci = normalized;
        return normalized;
    }

    function clearBlocDepartAirportOaci() {
        setBlocDepartAirportOaci('');
    }

    function lockBlocDepartAirportOaciIfNeeded({ force = false } = {}) {
        const blocDepartWrapper = document.getElementById('bloc-depart');
        const blocDepartValue = blocDepartWrapper?.querySelector('.display-input')?.value || '';

        if (parseTime(blocDepartValue) === null) {
            clearBlocDepartAirportOaci();
            return '';
        }

        const existing = getBlocDepartAirportOaci();
        if (existing && !force) return existing;

        const airport = getAirportAtCurrentPosition();
        return setBlocDepartAirportOaci(airport ? airport.oaci : '');
    }

    function updateBlocDepartAirportLabel() {
        const label = document.getElementById('bloc-depart-label');
        const previLabel = document.getElementById('previ-bloc-depart-label');

        const oaci = getBlocDepartAirportOaci();
        const text = oaci ? `BLOC DÉPART ${oaci}` : 'BLOC DÉPART';

        if (label) label.textContent = text;
        if (previLabel) previLabel.textContent = 'HEURE TO';
    }

    function updateRowAirportOaci(row, { forceDetect = false } = {}) {
        if (!row) return;
        const cell = row.querySelector('.airport-oaci-cell');
        if (!cell) return;

        const rowTimeValue = row.querySelector('.time-input-wrapper .display-input')?.value || '';
        if (parseTime(rowTimeValue) === null) {
            row.dataset.airportOaci = '';
            cell.textContent = '--';
            return;
        }

        if (forceDetect || !row.dataset.airportOaci) {
            const airport = getAirportAtCurrentPosition();
            row.dataset.airportOaci = airport ? airport.oaci : '';
        }

        cell.textContent = row.dataset.airportOaci || '--';
    }

    function refreshBlocFuelAirportOaciCells() {
        document.querySelectorAll('#bloc-fuel tbody tr').forEach((row) => {
            updateRowAirportOaci(row);
        });
    }

    window.refreshCalculatorAirportContext = () => {
        updateBlocDepartAirportLabel();
        refreshBlocFuelAirportOaciCells();
    };

    const activateTab = (onglet) => { document.querySelectorAll('.onglet-bouton').forEach(btn => btn.classList.remove('active')); document.querySelectorAll('.onglet-panneau').forEach(p => p.classList.remove('active')); onglet.classList.add('active'); document.getElementById(onglet.dataset.onglet).classList.add('active'); resetButton.style.display = (onglet.dataset.onglet === 'bloc-fuel') ? 'flex' : 'none'; };
    onglets.forEach(onglet => {
        onglet.addEventListener('click', () => activateTab(onglet));
        onglet.addEventListener('pointerup', (event) => {
            event.preventDefault();
            activateTab(onglet);
        });
    });

    function handleCalculatorTabHitByCoordinates(event) {
        if (!calculatorModal || calculatorModal.style.display !== 'flex') return false;
        const nav = calculatorModal.querySelector('.onglets-navigation');
        if (!nav) return false;

        const targetElement = event.target instanceof Element ? event.target : null;
        const blockedInteractive = targetElement?.closest('button, input, select, textarea, a, [role="button"]');
        if (blockedInteractive && !blockedInteractive.classList.contains('onglet-bouton') && !blockedInteractive.closest('.onglets-navigation')) {
            return false;
        }

        const point = event.changedTouches && event.changedTouches[0]
            ? event.changedTouches[0]
            : (event.touches && event.touches[0] ? event.touches[0] : event);
        const x = Number(point.clientX);
        const y = Number(point.clientY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

        const rect = nav.getBoundingClientRect();
        const verticalMarginTop = 105;
        const verticalMarginBottom = 42;
        if (x < rect.left || x > rect.right || y < rect.top - verticalMarginTop || y > rect.bottom + verticalMarginBottom) return false;

        const buttons = Array.from(nav.querySelectorAll('.onglet-bouton'));
        if (!buttons.length) return false;

        let target = buttons.find((button) => {
            const b = button.getBoundingClientRect();
            return x >= b.left && x <= b.right;
        });

        if (!target) {
            const ratio = Math.max(0, Math.min(0.999, (x - rect.left) / Math.max(1, rect.width)));
            target = buttons[Math.floor(ratio * buttons.length)];
        }

        if (!target) return false;
        event.preventDefault();
        activateTab(target);
        return true;
    }

    ['pointerdown', 'pointerup', 'touchend', 'click'].forEach((eventName) => {
        document.addEventListener(eventName, handleCalculatorTabHitByCoordinates, { passive: false, capture: true });
    });


    function createEmptyFlight(number = 1) {
        return {
            id: `flight_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            number,
            closed: false,
            state: {
                'bloc-depart': '',
                'bloc-depart-oaci': '',
                'fuel-depart': '3500 kg',
                'rlt-depart': '',
                'previ-bloc-depart': '',
                'previ-fuel-depart': '3500 kg',
                'tmd': '21:30',
                'limite-hdv': '08:00',
                calculator_table_data: []
            }
        };
    }


    function calculatorRowDataHasContent(rowData) {
        if (!rowData) return false;
        return !!(
            rowData.time
            || rowData.fuel
            || rowData.oaci
            || rowData.rltMass
            || rowData.rltVolume
            || rowData.rltDensity
            || rowData.rltTopMass
            || rowData.rltTopDensity
            || rowData.rltTopVolume
            || rowData.rltBottomVolume
            || rowData.rltBottomDensity
            || rowData.rltBottomMass
            || rowData.rltRefracto
            || rowData.rltMode
            || rowData.rltFirstFull
            || rowData.rltFirstFullPending
            || rowData.rltFirstFullWanted
        );
    }

    function compactCalculatorTableData(tableData = []) {
        return (Array.isArray(tableData) ? tableData : []).filter(calculatorRowDataHasContent);
    }

    function normalizeFlightNumbers() {
        dailyFlights.forEach((flight, index) => {
            flight.number = index + 1;
        });
    }

    function normalizeHdvLimitLabel(value) {
        const minutes = parseTime(value);
        return minutes !== null ? (formatTime(minutes) || '00:00') : '';
    }

    function getLimitHdvWrappers() {
        return [
            document.getElementById('limite-hdv'),
            document.getElementById('previ-limite-hdv')
        ].filter(Boolean);
    }

    function setStoredGlobalLimitHdvLabel(value, options = {}) {
        const { persistFirstFlight = true } = options;
        const label = normalizeHdvLimitLabel(value);
        if (!label) return '';

        getLimitHdvWrappers().forEach(wrapper => {
            wrapper.dataset.globalHdvLimit = label;
            const display = wrapper.querySelector('.display-input');
            const engine = wrapper.querySelector('.engine-input');
            if (display) display.dataset.globalHdvLimit = label;
            if (engine) engine.dataset.globalHdvLimit = label;
        });

        if (persistFirstFlight && dailyFlights[0]) {
            dailyFlights[0].state = dailyFlights[0].state || {};
            dailyFlights[0].state['limite-hdv'] = label;
        }

        return label;
    }

    function getStoredGlobalLimitHdvLabel() {
        const firstFlightLabel = normalizeHdvLimitLabel(dailyFlights[0]?.state?.['limite-hdv']);
        if (firstFlightLabel) return firstFlightLabel;

        for (const wrapper of getLimitHdvWrappers()) {
            const wrapperLabel = normalizeHdvLimitLabel(wrapper?.dataset?.globalHdvLimit);
            if (wrapperLabel) return wrapperLabel;

            const displayLabel = normalizeHdvLimitLabel(wrapper?.querySelector('.display-input')?.dataset?.globalHdvLimit);
            if (displayLabel) return displayLabel;
        }

        const visibleLabel = normalizeHdvLimitLabel(document.getElementById('limite-hdv')?.querySelector('.display-input')?.value || '');
        return visibleLabel || '08:00';
    }

    function readCalculatorStateFromDom() {
        const state = {};
        document.querySelectorAll('#calculator-modal .input-wrapper').forEach(wrapper => {
            if (wrapper.id) {
                let value = wrapper.querySelector('.display-input')?.value || '';

                /*
                 * v2026.54 — LIMITE HDV dynamique :
                 * le champ affiché peut montrer le restant après les BLOC ARRIVÉE
                 * saisis. En stockage, on conserve la limite journée de référence
                 * pour éviter qu'elle baisse à chaque sauvegarde.
                 */
                if (wrapper.id === 'limite-hdv') {
                    value = getStoredGlobalLimitHdvLabel() || value;
                }

                state[wrapper.id] = value;
            }
        });

        state['bloc-depart-oaci'] = getBlocDepartAirportOaci();

        const tableData = [];
        document.querySelectorAll('#bloc-fuel tbody tr').forEach(row => {
            const time = row.querySelector('.time-input-wrapper .display-input')?.value || '';
            const fuel = row.querySelector('.numeric-input-wrapper .display-input')?.value || '';
            const rltWrapper = row.querySelector('.rlt-mass-input-wrapper');
            const rltMass = rltWrapper?.querySelector('.display-input')?.value || '';
            const rltVolume = rltWrapper?.dataset.volume || '';
            const rltDensity = rltWrapper?.dataset.density || '';
            const rltTopMass = rltWrapper?.dataset.topMass || '';
            const rltTopDensity = rltWrapper?.dataset.topDensity || '';
            const rltTopVolume = rltWrapper?.dataset.topVolume || '';
            const rltBottomVolume = rltWrapper?.dataset.bottomVolume || '';
            const rltBottomDensity = rltWrapper?.dataset.bottomDensity || '';
            const rltBottomMass = rltWrapper?.dataset.bottomMass || '';
            const rltRefracto = rltWrapper?.dataset.refracto || '';
            const rltMode = rltWrapper?.dataset.rltMode || '';
            const rltFirstFull = rltWrapper?.dataset.rltFirstFull || '';
            const rltFirstFullPending = rltWrapper?.dataset.rltFirstFullPending || '';
            const rltFirstFullWanted = rltWrapper?.dataset.rltFirstFullWanted || '';
            const oaci = row.dataset.airportOaci || row.querySelector('.airport-oaci-cell')?.textContent?.replace('--', '').trim() || '';
            if (time || fuel || oaci || rltMass || rltVolume || rltDensity || rltTopMass || rltTopDensity || rltTopVolume || rltBottomVolume || rltBottomDensity || rltBottomMass || rltRefracto || rltMode || rltFirstFull || rltFirstFullPending || rltFirstFullWanted) {
                tableData.push({ time, fuel, oaci, rltMass, rltVolume, rltDensity, rltTopMass, rltTopDensity, rltTopVolume, rltBottomVolume, rltBottomDensity, rltBottomMass, rltRefracto, rltMode, rltFirstFull, rltFirstFullPending, rltFirstFullWanted });
            }
        });
        state.calculator_table_data = compactCalculatorTableData(tableData);
        return state;
    }

    function getFlightDurationFromState(state) {
        if (!state) return 0;

        let previousBlocArrivee = parseTime(state['bloc-depart']);
        let cumulative = 0;

        (state.calculator_table_data || []).forEach(rowData => {
            const blocArrivee = parseTime(rowData.time);
            if (blocArrivee !== null && previousBlocArrivee !== null) {
                const delta = blocArrivee - previousBlocArrivee;
                if (delta > 0) cumulative += delta;
            }
            if (blocArrivee !== null) previousBlocArrivee = blocArrivee;
        });

        return cumulative;
    }

    function getActiveFlightIndex() {
        return dailyFlights.findIndex(flight => flight.id === activeFlightId);
    }

    function getCumulativeHdvBeforeActiveFlight() {
        const activeIndex = getActiveFlightIndex();
        if (activeIndex <= 0) return 0;

        return dailyFlights
            .slice(0, activeIndex)
            .reduce((total, flight) => total + getFlightDurationFromState(flight.state), 0);
    }


    function formatDurationForFlightSummary(totalMinutes) {
        const value = formatTime(totalMinutes) || '00:00';
        return value.replace(':', 'h');
    }

    function updateFlightDurationSummary() {
        const summary = document.getElementById('flight-duration-summary');
        if (!summary) return;

        const activeFlight = dailyFlights.find(flight => flight.id === activeFlightId);
        if (!activeFlight) {
            summary.textContent = '';
            summary.style.display = 'none';
            return;
        }

        let state = activeFlight.state || {};
        try {
            if (!isApplyingFlightState && document.querySelector('#bloc-fuel tbody')) {
                state = readCalculatorStateFromDom();
            }
        } catch (_) {}

        const flightDuration = getFlightDurationFromState(state);
        const activeIndex = getActiveFlightIndex();
        const flightText = `Tps de vol : ${formatDurationForFlightSummary(flightDuration)}`;

        if (activeIndex > 0) {
            const totalDuration = getCumulativeHdvBeforeActiveFlight() + flightDuration;
            summary.innerHTML = `<span>${flightText}</span><span class="flight-duration-separator">/</span><span class="flight-duration-total">Total : ${formatDurationForFlightSummary(totalDuration)}</span>`;
        } else {
            summary.textContent = flightText;
        }

        summary.style.display = 'inline-flex';
    }

    function getGlobalLimitHdvMinutes() {
        /*
         * v2026.54 — Limite HDV journée :
         * la valeur stockée reste la limite journée de référence, même si le
         * champ affiché montre le restant après les BLOC ARRIVÉE déjà saisis.
         */
        const storedLimit = parseTime(getStoredGlobalLimitHdvLabel());
        return storedLimit !== null ? storedLimit : parseTime('08:00');
    }

    function getCurrentActiveFlightDurationFromDom() {
        try {
            const currentState = readCalculatorStateFromDom();
            return getFlightDurationFromState(currentState);
        } catch (_) {
            return 0;
        }
    }

    function getEffectiveLimitHdvForActiveFlight(options = {}) {
        const includeCurrentFlight = !!options.includeCurrentFlight;
        const globalLimit = getGlobalLimitHdvMinutes();
        let used = 0;
        try {
            used = getCumulativeHdvBeforeActiveFlight();
        } catch (_) {
            used = 0;
        }

        if (includeCurrentFlight) {
            used += getCurrentActiveFlightDurationFromDom();
        }

        if (globalLimit === null) return null;
        return Math.max(0, globalLimit - used);
    }

    function updateDisplayedLimitHdvForActiveFlight() {
        /*
         * v13.54 — LIMITE HDV figée par vol :
         * - vol n°1 : affiche la limite journée saisie par l'utilisateur ;
         * - vols n°2 et suivants : affiche le restant disponible après les vols précédents ;
         * - la durée du vol actif n'est pas retranchée de son propre champ LIMITE HDV.
         */
        const globalLabel = getStoredGlobalLimitHdvLabel();
        setStoredGlobalLimitHdvLabel(globalLabel, { persistFirstFlight: false });

        const effectiveLimit = getEffectiveLimitHdvForActiveFlight({ includeCurrentFlight: false });
        const effectiveLabel = formatTime(effectiveLimit) || '00:00';

        const mainWrapper = document.getElementById('limite-hdv');
        const previWrapper = document.getElementById('previ-limite-hdv');

        [mainWrapper, previWrapper].forEach(wrapper => {
            const input = wrapper?.querySelector('.display-input');
            const engine = wrapper?.querySelector('.engine-input');
            if (!input) return;
            wrapper.dataset.currentHdvRemaining = effectiveLabel;
            input.value = effectiveLabel;
            input.dataset.effectiveMultiflightLimit = effectiveLabel;
            if (engine) engine.value = effectiveLabel;
        });
    }

    function persistFlights() {
        normalizeFlightNumbers();
        localStorage.setItem(MULTI_FLIGHT_STORAGE_KEY, JSON.stringify(dailyFlights));
        if (activeFlightId) {
            localStorage.setItem(ACTIVE_FLIGHT_ID_STORAGE_KEY, activeFlightId);
        }
    }

    function updateActiveFlightStateFromDom() {
        if (!activeFlightId || isApplyingFlightState) return;
        const activeFlight = dailyFlights.find(flight => flight.id === activeFlightId);
        if (!activeFlight) return;
        const nextState = readCalculatorStateFromDom();

        /*
         * v12.31 : pour les vols n°2 et suivants, le champ LIMITE HDV affiché
         * est le restant journée. On ne doit pas l'utiliser comme nouvelle limite
         * globale, sinon elle baisse à chaque changement de vol.
         */
        if (getActiveFlightIndex() > 0 && dailyFlights[0]?.state?.['limite-hdv']) {
            nextState['limite-hdv'] = dailyFlights[0].state['limite-hdv'];
        }

        activeFlight.state = nextState;
        persistFlights();
    }


    function buildRltExportCalculationLabel(rowData = {}) {
        const parseExportNumber = (value) => {
            if (value === null || value === undefined) return null;
            const normalized = String(value).replace(/[^0-9,.-]/g, '').replace(',', '.');
            const num = Number(normalized);
            return Number.isFinite(num) ? num : null;
        };
        const formatExportNumber = (value, decimals = 0) => {
            const num = parseExportNumber(value);
            if (num === null) return '';
            return decimals > 0 ? num.toFixed(decimals) : String(Math.round(num));
        };

        const candidates = [
            { volume: rowData.rltBottomVolume, density: rowData.rltBottomDensity, mass: rowData.rltBottomMass || rowData.rltMass },
            { volume: rowData.rltVolume, density: rowData.rltDensity, mass: rowData.rltMass },
            { volume: rowData.rltTopVolume, density: rowData.rltTopDensity, mass: rowData.rltTopMass || rowData.rltMass }
        ];

        for (const candidate of candidates) {
            const volume = parseExportNumber(candidate.volume);
            const density = parseExportNumber(candidate.density);
            const mass = parseExportNumber(candidate.mass);
            if (volume !== null && density !== null) {
                const computedMass = mass !== null ? mass : volume * density;
                return `${formatExportNumber(volume)} L × ${formatExportNumber(density, 3)} = ${formatExportNumber(computedMass)} kg`;
            }
        }

        return '';
    }

    function getBlocFuelExportRowCalculations(state, flightIndex = 0) {
        const rows = [];
        const globalLimit = parseTime(dailyFlights[0]?.state?.['limite-hdv']) ?? parseTime(state?.['limite-hdv']);
        const hdvBeforeFlight = dailyFlights
            .slice(0, Math.max(0, flightIndex))
            .reduce((total, flight) => total + getFlightDurationFromState(flight.state), 0);
        const limitForFlight = globalLimit !== null ? Math.max(0, globalLimit - hdvBeforeFlight) : null;

        let previousBlocArrivee = parseTime(state?.['bloc-depart']);
        let previousFuelPelic = parseNumeric(state?.['fuel-depart']);
        let cumulativeTpsVol = 0;

        compactCalculatorTableData(state?.calculator_table_data || []).forEach((rowData) => {
            const blocArrivee = parseTime(rowData.time || '');
            const fuelPelic = parseNumeric(rowData.fuel || '');
            const isFirstFullRlt = rowData.rltFirstFull === '1' || rowData.rltMode === 'firstFull';

            let dureeRotation = null;
            let fuelRotation = null;
            let tpsVol = null;
            let tpsVolRestant = null;

            if (!isFirstFullRlt) {
                if (blocArrivee !== null && previousBlocArrivee !== null) {
                    dureeRotation = blocArrivee - previousBlocArrivee;
                }
                if (fuelPelic !== null && previousFuelPelic !== null) {
                    fuelRotation = previousFuelPelic - fuelPelic;
                }
                if (blocArrivee !== null) {
                    if (dureeRotation !== null && dureeRotation > 0) cumulativeTpsVol += dureeRotation;
                    tpsVol = cumulativeTpsVol;
                    tpsVolRestant = limitForFlight !== null ? limitForFlight - cumulativeTpsVol : null;
                }
            }

            rows.push({
                blocArrivee: rowData.time || '',
                fuelPelic: rowData.fuel || '',
                oaci: rowData.oaci || '',
                rlt: rowData.rltMass || '',
                rltCalculation: buildRltExportCalculationLabel(rowData),
                dureeRotation: isFirstFullRlt ? '' : (formatTime(dureeRotation) || '--'),
                fuelRotation: isFirstFullRlt ? '' : (fuelRotation === null ? '--' : String(fuelRotation)),
                tpsVol: isFirstFullRlt ? '' : (formatTime(tpsVol) || (blocArrivee !== null ? '00:00' : '--')),
                tpsVolRestant: isFirstFullRlt ? '' : (formatTime(tpsVolRestant) || '--'),
                isFirstFullRlt
            });

            if (blocArrivee !== null) previousBlocArrivee = blocArrivee;
            if (fuelPelic !== null) previousFuelPelic = fuelPelic;
        });

        return rows;
    }

    function getBlocFuelExportTimestamp(date = new Date()) {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yy = String(date.getFullYear()).slice(-2);
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yy} ${hh}:${min}`;
    }

    function getBlocFuelExportTitle(date = new Date()) {
        return `NPF-Q400 ${getBlocFuelExportTimestamp(date)}`;
    }

    function getBlocFuelExportSafeFileName(extension = 'pdf', date = new Date()) {
        const timestamp = getBlocFuelExportTimestamp(date)
            .replace(/\//g, '-')
            .replace(/:/g, 'h');
        return `NPF-Q400 ${timestamp}.${extension}`;
    }

    function getBlocFuelExportPrintDocumentTitle(date = new Date()) {
        /*
         * iPadOS refuse les / et : comme nom de fichier. Le titre interne du
         * document garde le format demandé, mais le nom PDF proposé utilise une
         * variante compatible fichiers : NPF-Q400 10-07-26 15h10.
         */
        const timestamp = getBlocFuelExportTimestamp(date)
            .replace(/\//g, '-')
            .replace(/:/g, 'h');
        return `NPF-Q400 ${timestamp}`;
    }

    function getBlocFuelFlightsForExport() {
        return dailyFlights
            .map((flight, originalIndex) => ({ flight, originalIndex }))
            .filter(({ flight }) => parseTime(flight?.state?.['bloc-depart']) !== null);
    }

    function buildBlocFuelExportHtml(options = {}) {
        updateActiveFlightStateFromDom();
        ensureFlightsLoadedFromStorage();
        normalizeFlightNumbers();

        const exportGeneratedAt = options.exportGeneratedAt instanceof Date ? options.exportGeneratedAt : new Date();
        const exportDate = getBlocFuelExportTimestamp(exportGeneratedAt);
        const exportTitle = getBlocFuelExportTitle(exportGeneratedAt);
        const exportPrintDocumentTitle = getBlocFuelExportPrintDocumentTitle(exportGeneratedAt);
        const exportHtmlFileName = getBlocFuelExportSafeFileName('html', exportGeneratedAt);
        const includeControls = !!options.includeControls;
        const safe = (value) => escapeHtml(value || '');
        const stripKgForExport = (value) => String(value ?? '')
            .replace(/kg/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        const kgExportHtml = (value, fallback = '--') => {
            const raw = stripKgForExport(value);
            const clean = raw || fallback;
            if (!clean || clean === '--') return '<span class="kg-inline"><span class="kg-number">--</span></span>';
            return `<span class="kg-inline"><span class="kg-number">${safe(clean)}</span><span class="kg-unit">kg</span></span>`;
        };
        const plainExportHtml = (value, fallback = '--') => safe(String(value ?? '').trim() || fallback);
        const flightsForExport = getBlocFuelFlightsForExport();
        const totalHdv = flightsForExport.reduce((total, item) => total + getFlightDurationFromState(item.flight.state), 0);
        let cumulativeExportHdv = 0;

        const flightSections = flightsForExport.length ? flightsForExport.map(({ flight, originalIndex }, exportIndex) => {
            const state = flight.state || {};
            const rows = getBlocFuelExportRowCalculations(state, originalIndex);
            const flightDuration = getFlightDurationFromState(state);
            cumulativeExportHdv += flightDuration;
            const flightDurationLabel = formatDurationForFlightSummary(flightDuration);
            const titleDurationLabel = exportIndex > 0
                ? `Tps de vol : ${safe(flightDurationLabel)} / Total : ${safe(formatDurationForFlightSummary(cumulativeExportHdv))}`
                : `Tps de vol : ${safe(flightDurationLabel)}`;
            const rowsHtml = rows.length
                ? rows.map(row => `
                    <tr${row.isFirstFullRlt ? ' class="first-full-row"' : ''}>
                        <td>${plainExportHtml(row.blocArrivee)}</td>
                        <td class="kg-cell">${kgExportHtml(row.fuelPelic)}</td>
                        <td>${plainExportHtml(row.oaci, '--')}</td>
                        <td class="kg-cell rlt-export-cell">${kgExportHtml(row.rlt)}${row.rltCalculation ? `<div class="rlt-calc-line">${safe(row.rltCalculation)}</div>` : ''}</td>
                        <td>${plainExportHtml(row.dureeRotation)}</td>
                        <td>${plainExportHtml(row.fuelRotation)}</td>
                        <td>${plainExportHtml(row.tpsVol)}</td>
                        <td>${plainExportHtml(row.tpsVolRestant)}</td>
                    </tr>`).join('')
                : '<tr><td colspan="8" class="empty-row">Aucune ligne BLOC arrivée saisie</td></tr>';

            return `
                <section class="flight-section">
                    <div class="flight-title-row">
                        <h2>Vol n°${flight.number || exportIndex + 1}${flight.closed ? ' — clôturé' : ''}</h2>
                        <span>${titleDurationLabel}</span>
                    </div>
                    <div class="header-grid">
                        <div><b>BLOC DÉPART</b><span>${plainExportHtml(state['bloc-depart'], '--:--')}</span></div>
                        <div class="header-card-fuel-depart"><b>FUEL DÉPART</b><span class="fuel-depart-export-value">${kgExportHtml(state['fuel-depart'])}</span></div>
                        <div class="header-card-rlt-depart"><b>RLT</b><span>${kgExportHtml(state['rlt-depart'])}</span></div>
                        <div><b>BASE</b><span>${plainExportHtml(state['base-oaci-input'] || selectedBaseOACI || DEFAULT_BASE_OACI)}</span></div>
                        <div><b>TMD</b><span>${plainExportHtml(state['tmd'], '--:--')}</span></div>
                        <div><b>LIMITE HDV</b><span>${plainExportHtml(state['limite-hdv'], '--:--')}</span></div>
                    </div>
                    <table class="bloc-fuel-export-table">
                        <colgroup>
                            <col class="col-bloc-arrivee">
                            <col class="col-fuel-pelic">
                            <col class="col-oaci">
                            <col class="col-masse-rlt">
                            <col class="col-duree-rot">
                            <col class="col-fuel-rot">
                            <col class="col-tps-vol">
                            <col class="col-tps-restant">
                        </colgroup>
                        <thead>
                            <tr>
                                <th>BLOC Arrivée</th>
                                <th>FUEL Pélic.</th>
                                <th>OACI</th>
                                <th>Masse Rlt</th>
                                <th>Durée Rot.</th>
                                <th>Fuel Rot.</th>
                                <th>Tps de Vol</th>
                                <th>Tps de Vol Restant</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </section>`;
        }).join('') : '<section class="flight-section"><h2>Aucun vol avec BLOC DÉPART renseigné</h2></section>';

        return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${safe(exportPrintDocumentTitle)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
    @page { size: A4 landscape; margin: 5mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin: 0; padding: 8px 10px; color: #111827; background: #fff; }
    .topbar { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 10px; border-bottom: 3px solid #005a9c; padding-bottom: 8px; }
    h1 { margin: 0; font-size: 24px; color: #005a9c; }
    .meta { text-align: right; font-size: 13px; color: #475569; font-weight: 700; }
    .export-toolbar { position: fixed; right: 18px; bottom: 18px; z-index: 10; display: flex; gap: 8px; align-items: center; }
    .export-toolbar button { border: 0; border-radius: 12px; background: #005a9c; color: #fff; padding: 12px 16px; font-size: 15px; font-weight: 900; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
    .export-toolbar .close-export-btn { background: #334155; }
    .flight-section { page-break-inside: avoid; margin: 0 0 12px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; overflow: hidden; }
    .flight-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 9px; }
    h2 { margin: 0; font-size: 20px; color: #0f172a; }
    .flight-title-row span { font-size: 15px; font-weight: 900; color: #005a9c; white-space: nowrap; }
    .header-grid { display: grid; grid-template-columns: .9fr 1.15fr .85fr .85fr .9fr .95fr; gap: 7px; margin-bottom: 10px; }
    .header-grid div { border: 1px solid #d7dee8; background: #fff; border-radius: 10px; padding: 8px 9px; min-height: 76px; overflow: hidden; display: grid; grid-template-rows: 28px 1fr; align-items: stretch; }
    .header-grid b { display: flex; align-items: flex-start; min-height: 28px; margin: 0; font-size: 10.5px; line-height: 1.1; letter-spacing: .04em; color: #64748b; text-transform: uppercase; }
    .header-grid span { display: flex; align-items: center; justify-content: flex-start; width: 100%; min-width: 0; margin: 0; font-size: 19px; line-height: 1; font-weight: 950; color: #111827; white-space: nowrap; overflow: visible; }
    .header-grid span .kg-inline { justify-content: flex-start !important; max-width: 100%; min-width: 0; }
    .header-grid span .kg-unit { font-size: .50em !important; }
    .header-card-fuel-depart { overflow: visible !important; }
    .header-card-fuel-depart .fuel-depart-export-value { font-size: 19px !important; letter-spacing: -0.04em; overflow: visible !important; white-space: nowrap !important; }
    .header-card-fuel-depart .kg-inline { gap: 5px !important; transform: none !important; transform-origin: left center; flex-shrink: 0; }
    .header-grid .header-card-fuel-depart .fuel-depart-export-value .kg-inline,
    .header-grid .header-card-fuel-depart .fuel-depart-export-value .kg-number,
    .header-grid .header-card-fuel-depart .fuel-depart-export-value .kg-unit { font-size: 1em !important; line-height: 1 !important; }
    .header-grid .header-card-fuel-depart .fuel-depart-export-value .kg-unit { margin-left: 0 !important; }
    .header-card-rlt-depart .kg-inline { justify-content: flex-start !important; gap: 4px !important; }
    .header-card-rlt-depart .kg-number { font-size: 1em !important; }
    .header-card-rlt-depart .kg-unit { font-size: .55em !important; }
    .kg-inline { display: inline-flex !important; align-items: baseline; justify-content: center; gap: 4px; white-space: nowrap; line-height: 1 !important; }
    .kg-number { display: inline-block; line-height: 1 !important; }
    .kg-unit { display: inline-block; font-size: .48em; line-height: 1 !important; font-weight: 900; color: #111827; }
    table.bloc-fuel-export-table { width: 100%; table-layout: fixed; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; }
    .bloc-fuel-export-table .col-bloc-arrivee { width: 10%; }
    .bloc-fuel-export-table .col-fuel-pelic { width: 11%; }
    .bloc-fuel-export-table .col-oaci { width: 8%; }
    .bloc-fuel-export-table .col-masse-rlt { width: 27%; }
    .bloc-fuel-export-table .col-duree-rot { width: 9%; }
    .bloc-fuel-export-table .col-fuel-rot { width: 9%; }
    .bloc-fuel-export-table .col-tps-vol { width: 10%; }
    .bloc-fuel-export-table .col-tps-restant { width: 16%; }
    th, td { border: 1px solid #d7dee8; padding: 6px 4px; text-align: center; font-size: 12.5px; line-height: 1.12; vertical-align: middle; overflow: hidden; }
    th { background: #005a9c; color: #fff; font-weight: 900; font-size: 12px; line-height: 1.08; }
    td { font-weight: 800; }
    th:nth-child(5), th:nth-child(6) { font-size: 11.8px; }
    td:nth-child(5), td:nth-child(6) { font-size: 12.5px; white-space: nowrap; }
    td.kg-cell .kg-inline { font-size: 14px; }
    td.kg-cell .kg-unit { font-size: .68em; }
    .rlt-export-cell { line-height: 1.06; padding-left: 3px; padding-right: 3px; white-space: nowrap; overflow: hidden; }
    .rlt-export-cell .kg-inline { font-size: 13px; }
    .rlt-calc-line { display: block; margin-top: 2px; font-size: 8.4px; line-height: 1.05; font-weight: 800; color: #475569; white-space: nowrap; letter-spacing: -0.055em; overflow: visible; }
    tr.first-full-row td { background: #fff7ed; }
    .empty-row { color: #64748b; font-style: italic; padding: 16px; }

    .header-card-fuel-depart .kg-number,
    .header-card-fuel-depart .kg-unit { font-size: 1em !important; line-height: 1 !important; }
    .header-card-fuel-depart .kg-unit { color: #111827 !important; font-weight: 950 !important; }
    .rlt-export-cell .kg-number { font-size: 13px; }
    @media print { .export-toolbar { display: none; } body { padding: 0; } .flight-section { background: #fff; } }
</style>
</head>
<body>
    ${includeControls ? `<div class="export-toolbar"><button onclick="shareBlocFuelPreview()">Partager</button><button onclick="window.print()">PDF / Imprimer</button><button class="close-export-btn" onclick="closeBlocFuelPreview()">Fermer</button></div>` : ''}
    <div class="topbar">
        <div>
            <h1>${safe(exportTitle)}</h1>
            <div>Total vols exportés : ${flightsForExport.length} · Total HDV : ${safe(formatDurationForFlightSummary(totalHdv))}</div>
        </div>
        <div class="meta">Export : ${safe(exportDate)}<br>Vols exportés : ${flightsForExport.length}<br>Version : ${safe(window.APP_VERSION || 'v13.26')}</div>
    </div>
    ${flightSections}
    <script>
    function closeBlocFuelPreview() {
        try { window.close(); } catch (_) {}
        setTimeout(function () {
            try {
                if (!window.closed) {
                    document.body.classList.add('export-close-failed');
                    alert("Fermez cet aperçu avec le bouton retour ou la gestion des fenêtres de l’iPad.");
                }
            } catch (_) {}
        }, 250);
    }
    async function shareBlocFuelPreview() {
        try {
            const clone = document.documentElement.cloneNode(true);
            clone.querySelectorAll('.export-toolbar, script').forEach(function (el) { el.remove(); });
            const html = '<!doctype html>\n' + clone.outerHTML;
            const file = new File([html], '${safe(exportHtmlFileName)}', { type: 'text/html' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ title: '${safe(exportPrintDocumentTitle)}', text: 'Export BLOC/FUEL NPF-Q400', files: [file] });
                return;
            }
            if (navigator.share) {
                await navigator.share({ title: '${safe(exportPrintDocumentTitle)}', text: 'Export BLOC/FUEL NPF-Q400' });
                return;
            }
            alert('Partage natif non disponible sur ce navigateur. Utilisez PDF / Imprimer.');
        } catch (error) {
            if (error && error.name === 'AbortError') return;
            alert('Partage impossible : ' + (error && error.message ? error.message : error));
        }
    }
    <\/script>
</body>
</html>`;
    }

    function buildBlocFuelExportFileName(extension = 'pdf') {
        return getBlocFuelExportSafeFileName(extension, new Date());
    }

    function normalizePdfText(value) {
        return String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[’‘]/g, "'")
            .replace(/[“”]/g, '"')
            .replace(/[–—]/g, '-')
            .replace(/°/g, 'deg')
            .replace(/[^\x20-\x7E]/g, ' ');
    }

    function escapePdfText(value) {
        return normalizePdfText(value)
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)');
    }

    function fitPdfCell(value, width) {
        const text = normalizePdfText(value).replace(/\s+/g, ' ').trim();
        if (text.length <= width) return text.padEnd(width, ' ');
        return (text.slice(0, Math.max(0, width - 1)) + '…').replace(/[^\x20-\x7E]/g, '.');
    }

    function splitPdfLine(value, maxChars = 118) {
        const text = normalizePdfText(value).replace(/\s+/g, ' ').trimEnd();
        if (text.length <= maxChars) return [text];

        const lines = [];
        let rest = text;
        while (rest.length > maxChars) {
            let cut = rest.lastIndexOf(' ', maxChars);
            if (cut < 40) cut = maxChars;
            lines.push(rest.slice(0, cut).trimEnd());
            rest = rest.slice(cut).trimStart();
        }
        if (rest) lines.push(rest);
        return lines;
    }

    function buildBlocFuelExportPdfPages() {
        updateActiveFlightStateFromDom();
        ensureFlightsLoadedFromStorage();
        normalizeFlightNumbers();

        const pages = [[]];
        const maxLinesPerPage = 36;
        const addLine = (line = '') => {
            const parts = splitPdfLine(line, 118);
            parts.forEach((part) => {
                if (pages[pages.length - 1].length >= maxLinesPerPage) pages.push([]);
                pages[pages.length - 1].push(part);
            });
        };
        const addBlank = () => addLine('');
        const addSeparator = () => addLine('-'.repeat(118));

        const exportGeneratedAt = new Date();
        const exportDate = getBlocFuelExportTimestamp(exportGeneratedAt);
        const exportTitle = getBlocFuelExportTitle(exportGeneratedAt);
        const flightsForExport = getBlocFuelFlightsForExport();
        const totalHdv = flightsForExport.reduce((total, item) => total + getFlightDurationFromState(item.flight.state), 0);
        let cumulativeExportHdv = 0;

        addLine(exportTitle);
        addLine(`Export : ${exportDate}    Version : ${window.APP_VERSION || 'v13.20'}`);
        addLine(`Total vols exportes : ${flightsForExport.length}    Total HDV : ${formatDurationForFlightSummary(totalHdv)}`);
        addSeparator();

        flightsForExport.forEach(({ flight, originalIndex }, exportIndex) => {
            const state = flight.state || {};
            const rows = getBlocFuelExportRowCalculations(state, originalIndex);
            const flightDuration = getFlightDurationFromState(state);
            cumulativeExportHdv += flightDuration;
            const durationText = exportIndex > 0
                ? `Tps de vol : ${formatDurationForFlightSummary(flightDuration)} / Total : ${formatDurationForFlightSummary(cumulativeExportHdv)}`
                : `Tps de vol : ${formatDurationForFlightSummary(flightDuration)}`;
            addBlank();
            addLine(`VOL N°${flight.number || exportIndex + 1}${flight.closed ? ' - cloture' : ''}    ${durationText}`);
            addLine(`BLOC DEPART : ${state['bloc-depart'] || '--:--'}    FUEL Depart : ${state['fuel-depart'] || '-- kg'}    RLT : ${state['rlt-depart'] || '-- kg'}    Base : ${state['base-oaci-input'] || selectedBaseOACI || DEFAULT_BASE_OACI}    TMD : ${state['tmd'] || '--:--'}    LIMITE HDV : ${state['limite-hdv'] || '--:--'}`);
            addLine('BLOC Arr | FUEL Pelic | OACI | Masse Rlt | Duree Rot | Fuel Rot | Tps Vol | Restant');
            addSeparator();

            if (!rows.length) {
                addLine('Aucune ligne BLOC arrivee saisie');
                return;
            }

            rows.forEach((row) => {
                addLine([
                    fitPdfCell(row.blocArrivee || '--:--', 8),
                    fitPdfCell(row.fuelPelic || '--', 10),
                    fitPdfCell(row.oaci || '--', 4),
                    fitPdfCell(row.rlt || '--', 9),
                    fitPdfCell(row.dureeRotation || '--', 9),
                    fitPdfCell(row.fuelRotation || '--', 8),
                    fitPdfCell(row.tpsVol || '--', 7),
                    fitPdfCell(row.tpsVolRestant || '--', 7)
                ].join(' | '));
                if (row.rltCalculation) addLine(`          Calcul RLT : ${row.rltCalculation}`);
            });
        });

        return pages;
    }

    function createSimplePdfBlobFromPages(pages) {
        const pageWidth = 842;
        const pageHeight = 595;
        const marginLeft = 32;
        const startY = 560;
        const lineHeight = 13;
        const objects = [];

        const addObject = (body) => {
            objects.push(body);
            return objects.length;
        };

        const catalogId = addObject('');
        const pagesId = addObject('');
        const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
        const pageIds = [];

        pages.forEach((lines, pageIndex) => {
            const contentLines = [
                'BT',
                `/F1 ${pageIndex === 0 ? 10 : 9.5} Tf`,
                `${marginLeft} ${startY} Td`,
                `${lineHeight} TL`
            ];
            lines.forEach((line) => {
                contentLines.push(`(${escapePdfText(line)}) Tj`);
                contentLines.push('T*');
            });
            contentLines.push('ET');
            const stream = contentLines.join('\n');
            const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
            const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
            pageIds.push(pageId);
        });

        objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
        objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

        let pdf = '%PDF-1.4\n%NPF-Q400\n';
        const offsets = [0];
        objects.forEach((body, index) => {
            offsets[index + 1] = pdf.length;
            pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
        });
        const xrefOffset = pdf.length;
        pdf += `xref\n0 ${objects.length + 1}\n`;
        pdf += '0000000000 65535 f \n';
        for (let i = 1; i <= objects.length; i += 1) {
            pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
        }
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

        return new Blob([pdf], { type: 'application/pdf' });
    }

    function buildBlocFuelExportPdfBlob() {
        const pages = buildBlocFuelExportPdfPages();
        return createSimplePdfBlobFromPages(pages);
    }

    async function shareBlocFuelPdfFile() {
        if (!navigator.share || typeof File === 'undefined') return false;

        const pdfBlob = buildBlocFuelExportPdfBlob();
        const pdfFile = new File([pdfBlob], buildBlocFuelExportFileName('pdf'), { type: 'application/pdf' });

        if (!navigator.canShare || !navigator.canShare({ files: [pdfFile] })) {
            return false;
        }

        await navigator.share({
            title: 'NPF-Q400 — BLOC/FUEL',
            text: 'Export PDF BLOC/FUEL NPF-Q400',
            files: [pdfFile]
        });
        return true;
    }

    function openBlocFuelExportPreview() {
        const exportGeneratedAt = new Date();
        const exportPrintDocumentTitle = getBlocFuelExportPrintDocumentTitle(exportGeneratedAt);
        const html = buildBlocFuelExportHtml({ includeControls: false, exportGeneratedAt });
        let overlay = document.getElementById('bloc-fuel-export-overlay');
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = 'bloc-fuel-export-overlay';
        overlay.dataset.exportPrintTitle = exportPrintDocumentTitle;
        overlay.innerHTML = `
            <div class="bloc-fuel-export-panel" role="dialog" aria-modal="true" aria-label="Aperçu export BLOC/FUEL">
                <div class="bloc-fuel-export-toolbar">
                    <div class="bloc-fuel-export-title">Export BLOC/FUEL</div>
                    <div class="export-hint">Aperçu imprimable. Utiliser “PDF / Imprimer” puis “Partager / Enregistrer en PDF” sur iPad.</div>
                    <button type="button" id="bloc-fuel-export-print-btn" class="print-primary">PDF / Imprimer</button>
                    <button type="button" id="bloc-fuel-export-close-btn" class="secondary">Fermer</button>
                </div>
                <iframe id="bloc-fuel-export-frame" title="${escapeHtml(exportPrintDocumentTitle)}"></iframe>
            </div>`;
        document.body.appendChild(overlay);

        const cleanupPreview = () => {
            try {
                const blobUrl = overlay.dataset.exportBlobUrl;
                if (blobUrl) URL.revokeObjectURL(blobUrl);
            } catch (_) {}
            overlay.remove();
        };

        const frame = overlay.querySelector('#bloc-fuel-export-frame');
        if (frame) {
            try {
                const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                const blobUrl = URL.createObjectURL(blob);
                overlay.dataset.exportBlobUrl = blobUrl;
                frame.src = blobUrl;
            } catch (_) {
                frame.srcdoc = html;
            }
            frame.addEventListener('load', () => {
                try {
                    frame.contentWindow.document.title = exportPrintDocumentTitle;
                } catch (_) {}
            }, { once: true });
        }

        overlay.querySelector('#bloc-fuel-export-close-btn')?.addEventListener('click', cleanupPreview);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) cleanupPreview();
        });
        overlay.querySelector('#bloc-fuel-export-print-btn')?.addEventListener('click', () => {
            try {
                const win = frame?.contentWindow;
                const printTitle = overlay.dataset.exportPrintTitle || exportPrintDocumentTitle;
                const previousAppTitle = document.title;
                if (win) {
                    try { document.title = printTitle; } catch (_) {}
                    try { win.document.title = printTitle; } catch (_) {}
                    win.focus();
                    win.print();
                    setTimeout(() => {
                        try { document.title = previousAppTitle || 'NPF-Q400'; } catch (_) {}
                    }, 12000);
                }
            } catch (error) {
                alert(`Impression impossible : ${error.message || error}`);
            }
        });
    }

    async function exportBlocFuelPdf() {
        try {
            /*
             * v13.13 — retour au rendu imprimable HTML, plus propre que le PDF
             * généré en texte pur. L'export s'ouvre dans une modale fermable.
             */
            openBlocFuelExportPreview();
        } catch (error) {
            console.error('Export BLOC/FUEL impossible:', error);
            alert(`Export BLOC/FUEL impossible : ${error.message || error}`);
        }
    }

    function ensureFlightsLoadedFromStorage() {
        try {
            const savedFlights = JSON.parse(localStorage.getItem(MULTI_FLIGHT_STORAGE_KEY) || 'null');
            if (Array.isArray(savedFlights) && savedFlights.length) {
                dailyFlights = savedFlights;
            }
        } catch (_) {
            dailyFlights = [];
        }

        if (!dailyFlights.length) {
            let legacyState = {};
            try {
                legacyState = JSON.parse(localStorage.getItem('calculator_state') || '{}') || {};
            } catch (_) {
                legacyState = {};
            }
            dailyFlights = [createEmptyFlight(1)];
            dailyFlights[0].state = {
                'bloc-depart': legacyState['bloc-depart'] || '',
                'bloc-depart-oaci': legacyState['bloc-depart-oaci'] || '',
                'fuel-depart': legacyState['fuel-depart'] || '3500 kg',
                'rlt-depart': legacyState['rlt-depart'] || '',
                'previ-bloc-depart': legacyState['previ-bloc-depart'] || legacyState['bloc-depart'] || '',
                'previ-fuel-depart': legacyState['previ-fuel-depart'] || legacyState['fuel-depart'] || '3500 kg',
                'tmd': legacyState['tmd'] || '21:30',
                'limite-hdv': legacyState['limite-hdv'] || '08:00',
                'deroutement-heure-wrapper': legacyState['deroutement-heure-wrapper'] || '',
                'deroutement-fuel-wrapper': legacyState['deroutement-fuel-wrapper'] || '',
                'suivi-conso-rotation-wrapper': legacyState['suivi-conso-rotation-wrapper'] || '',
                'suivi-duree-rotation-wrapper': legacyState['suivi-duree-rotation-wrapper'] || '',
                calculator_table_data: legacyState.calculator_table_data || []
            };
        }

        normalizeFlightNumbers();

        const savedActiveId = localStorage.getItem(ACTIVE_FLIGHT_ID_STORAGE_KEY);
        activeFlightId = dailyFlights.some(flight => flight.id === savedActiveId)
            ? savedActiveId
            : dailyFlights[dailyFlights.length - 1].id;

        persistFlights();
    }

    function refreshFlightSelector() {
        const select = document.getElementById('flight-select');
        const closeButton = document.getElementById('close-flight-btn');
        if (!select) return;

        if (!Array.isArray(dailyFlights) || !dailyFlights.length) {
            dailyFlights = [createEmptyFlight(1)];
            activeFlightId = dailyFlights[0].id;
        }

        select.innerHTML = '';
        dailyFlights.forEach(flight => {
            const option = document.createElement('option');
            option.value = flight.id;
            option.textContent = `Vol n°${flight.number}${flight.closed ? ' — clôturé' : ' — en cours'}`;
            select.appendChild(option);
        });
        select.value = activeFlightId || '';

        const activeFlight = dailyFlights.find(flight => flight.id === activeFlightId);
        if (closeButton) {
            closeButton.textContent = activeFlight?.closed ? 'Réouvrir' : 'Clôturer';
        }

        updateActiveFlightLockState();
        updateFlightDurationSummary();
    }

    function updateActiveFlightLockState() {
        const activeFlight = dailyFlights.find(flight => flight.id === activeFlightId);
        const isClosed = !!activeFlight?.closed;
        const blocFuelPanel = document.getElementById('bloc-fuel');
        const lockStatus = document.getElementById('flight-lock-status');

        if (blocFuelPanel) {
            blocFuelPanel.classList.toggle('flight-locked', isClosed);
        }

        if (lockStatus) {
            lockStatus.textContent = '';
            lockStatus.style.display = 'none';
        }

        updateFlightDurationSummary();

        /*
         * v12.44 — verrouillage réel des vols clôturés :
         * les champs du vol restent lisibles mais ne doivent plus être modifiables
         * tant que l'utilisateur n'a pas cliqué sur “Réouvrir”.
         */
        const editableSelectors = [
            '#bloc-fuel .header-section .input-wrapper',
            '#bloc-fuel .table-wrapper .input-wrapper'
        ];

        editableSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(wrapper => {
                wrapper.classList.toggle('locked-input-wrapper', isClosed);
                wrapper.setAttribute('aria-disabled', isClosed ? 'true' : 'false');
            });
        });
    }

    function applyFlightStateToDom(state) {
        isApplyingFlightState = true;
        try {
            const tableBody = document.querySelector('#bloc-fuel tbody');
            tableBody.innerHTML = '';

            initializeTimeInput(document.getElementById('bloc-depart'), state['bloc-depart']);
            setBlocDepartAirportOaci(state['bloc-depart-oaci'] || '');
            initializeNumericInput(document.getElementById('fuel-depart'), state['fuel-depart'] || '3500 kg');
            initializeNumericInput(document.getElementById('rlt-depart'), state['rlt-depart'] || '');
            initializeTimeInput(document.getElementById('tmd'), state['tmd'] || '21:30');
            initializeTimeInput(document.getElementById('limite-hdv'), state['limite-hdv'] || '08:00');

            initializeTimeInput(document.getElementById('previ-bloc-depart'), state['previ-bloc-depart'] || state['bloc-depart'] || '');
            initializeNumericInput(document.getElementById('previ-fuel-depart'), state['previ-fuel-depart'] || state['fuel-depart'] || '3500 kg');
            initializeTimeInput(document.getElementById('previ-tmd'), state['tmd'] || '21:30');
            initializeTimeInput(document.getElementById('previ-limite-hdv'), state['limite-hdv'] || '08:00');

            refreshSharedHeaderMirrorValues();
            initializeTimeInput(document.getElementById('deroutement-heure-wrapper'), state['deroutement-heure-wrapper']);
            initializeNumericInput(document.getElementById('deroutement-fuel-wrapper'), state['deroutement-fuel-wrapper']);
            initializeNumericInput(document.getElementById('suivi-conso-rotation-wrapper'), state['suivi-conso-rotation-wrapper']);
            initializeTimeInput(document.getElementById('suivi-duree-rotation-wrapper'), state['suivi-duree-rotation-wrapper']);

            const tableData = compactCalculatorTableData(state.calculator_table_data || []);
            const activeFlight = dailyFlights.find(flight => flight.id === activeFlightId);
            const isClosedFlight = !!activeFlight?.closed;
            tableData.forEach(rowData => addNewRow(tableBody, rowData, false));

            if (!isClosedFlight) {
                const rowsToAdd = Math.max(6, tableBody.rows.length + 1) - tableBody.rows.length;
                for (let i = 0; i < rowsToAdd; i++) {
                    addNewRow(tableBody, null, i === rowsToAdd - 1);
                }
            }
        } finally {
            isApplyingFlightState = false;
        }

        updateBlocDepartAirportLabel();
        refreshBlocFuelAirportOaciCells();
        updateDisplayedLimitHdvForActiveFlight();
        refreshSharedHeaderMirrorValues();
        updateActiveFlightLockState();
        masterRecalculate();
        updateFlightDurationSummary();
    }

    function loadActiveFlightState() {
        ensureFlightsLoadedFromStorage();
        const activeFlight = dailyFlights.find(flight => flight.id === activeFlightId) || dailyFlights[dailyFlights.length - 1];
        activeFlightId = activeFlight.id;
        applyFlightStateToDom(activeFlight.state || createEmptyFlight(activeFlight.number).state);
        refreshFlightSelector();
    }

    function saveCalculatorState() {
        const state = readCalculatorStateFromDom();
        localStorage.setItem('calculator_state', JSON.stringify(state));
        updateActiveFlightStateFromDom();
    }

    function getPreviousBlocFuelArrivalTimeForWrapper(wrapper) {
        try {
            const row = wrapper?.closest?.('tr');
            const table = row?.closest?.('#bloc-fuel');
            if (!row || !table) return '';

            const rows = Array.from(table.querySelectorAll('tbody tr'));
            const rowIndex = rows.indexOf(row);
            for (let i = rowIndex - 1; i >= 0; i -= 1) {
                const previousValue = rows[i].querySelector('.time-input-wrapper .display-input')?.value || '';
                if (parseTime(previousValue) !== null) return previousValue;
            }

            const blocDepartValue = document.getElementById('bloc-depart')?.querySelector('.display-input')?.value || '';
            return parseTime(blocDepartValue) !== null ? blocDepartValue : '';
        } catch (_) {
            return '';
        }
    }

    function initializeTimeInput(wrapper, initialValue = '') {
        if (!wrapper) return;
        const displayInput = wrapper.querySelector('.display-input');
        const engineInput = wrapper.querySelector('.engine-input');
        const clearBtn = wrapper.querySelector('.clear-btn');
        const wrapperRole = wrapper.dataset.syncTarget || wrapper.id;

        const setTimeValue = (time) => {
            const safeTime = time || '';
            displayInput.value = safeTime;
            if (engineInput) {
                if (String(safeTime).match(/^\d{2}:\d{2}$/)) {
                    engineInput.value = safeTime;
                } else {
                    engineInput.value = '';
                }
            }
        };

        const recalculateAndSave = () => {
            if (wrapperRole === 'limite-hdv' && getActiveFlightIndex() <= 0) {
                /*
                 * v13.54 — LIMITE HDV journée figée par le vol n°1 :
                 * seul le premier vol peut modifier la limite de référence.
                 * Les vols suivants affichent le restant issu des vols précédents.
                 */
                setStoredGlobalLimitHdvLabel(displayInput.value);
            }

            syncSharedHeaderFromWrapper(wrapper);

            if (wrapperRole === 'bloc-depart') {
                if (parseTime(displayInput.value || '') === null) {
                    clearBlocDepartAirportOaci();
                } else {
                    lockBlocDepartAirportOaciIfNeeded();
                }
                updateBlocDepartAirportLabel();
            } else {
                const row = wrapper.closest('tr');
                if (row && row.closest('#bloc-fuel')) {
                    updateRowAirportOaci(row, { forceDetect: true });
                }
            }

            refreshSharedHeaderMirrorValues();
            masterRecalculate();
            saveCalculatorState();
        };

        const getAutoTimeValue = () => {
            if (wrapperRole === 'tmd') {
                return '21:30';
            }

            if (wrapperRole === 'limite-hdv') {
                return '08:00';
            }

            const now = new Date();
            return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        };

        const getClearTimeValue = () => {
            if (wrapperRole === 'tmd') {
                return '21:30';
            }

            if (wrapperRole === 'limite-hdv') {
                return '08:00';
            }

            return '';
        };

        setTimeValue(initialValue);

        /*
         * Saisie manuelle PC uniquement.
         * Important : ne rien changer au comportement iPad.
         */
        const isPcKeyboardDevice = window.matchMedia('(hover: hover) and (pointer: fine)').matches
            && navigator.maxTouchPoints === 0;

        if (isPcKeyboardDevice) {
            displayInput.readOnly = false;
            displayInput.removeAttribute('readonly');
            displayInput.inputMode = 'numeric';
            displayInput.placeholder = '--:--';
            displayInput.autocomplete = 'off';
            displayInput.maxLength = 5;

            const commitTypedTime = () => {
                const rawValue = String(displayInput.value || '').trim();

                if (rawValue === '') {
                    setTimeValue('');
                    recalculateAndSave();
                    return;
                }

                const compactValue = rawValue.replace(/\D/g, '');
                let hh = '';
                let mm = '';

                if (/^\d{3,4}$/.test(compactValue)) {
                    const padded = compactValue.padStart(4, '0');
                    hh = padded.slice(0, 2);
                    mm = padded.slice(2, 4);
                } else {
                    const match = /^(\d{1,2}):(\d{1,2})$/.exec(rawValue);
                    if (match) {
                        hh = match[1].padStart(2, '0');
                        mm = match[2].padStart(2, '0');
                    }
                }

                const hourNumber = Number(hh);
                const minuteNumber = Number(mm);

                if (!Number.isInteger(hourNumber) || !Number.isInteger(minuteNumber) || hourNumber < 0 || hourNumber > 23 || minuteNumber < 0 || minuteNumber > 59) {
                    setTimeValue('');
                    recalculateAndSave();
                    return;
                }

                setTimeValue(`${hh}:${mm}`);
                recalculateAndSave();
            };

            displayInput.addEventListener('focus', () => {
                displayInput.select();
            });

            displayInput.addEventListener('click', (event) => {
                event.stopPropagation();
                displayInput.focus();
            });

            displayInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commitTypedTime();
                    displayInput.blur();
                }

                if (event.key === 'Escape') {
                    event.preventDefault();
                    setTimeValue(engineInput && engineInput.value ? engineInput.value : displayInput.value);
                    displayInput.blur();
                }
            });

            displayInput.addEventListener('blur', () => {
                commitTypedTime();
            });
        }

        displayInput.addEventListener('dblclick', (e) => {
            e.preventDefault();
            let timeString;
            if (wrapperRole === 'tmd') {
                timeString = '21:30';
            } else if (wrapperRole === 'limite-hdv') {
                timeString = '08:00';
            } else {
                timeString = getAutoTimeValue();
            }
            setTimeValue(timeString);
            recalculateAndSave();
        });

        if (engineInput) {
            const prepareTimePickerDefault = () => {
                try {
                    const isBlocFuelArrival = !!wrapper.closest('tr')?.closest('#bloc-fuel');
                    if (isBlocFuelArrival && !displayInput.value) {
                        const previousTime = getPreviousBlocFuelArrivalTimeForWrapper(wrapper);
                        if (previousTime) engineInput.value = previousTime;
                        return;
                    }
                    if (!engineInput.value && !displayInput.value) {
                        engineInput.value = getAutoTimeValue();
                    }
                } catch (_) {}
            };

            ['pointerdown', 'touchstart', 'mousedown', 'focus'].forEach((eventName) => {
                engineInput.addEventListener(eventName, prepareTimePickerDefault, { passive: true });
            });

            engineInput.addEventListener('change', () => {
                if (engineInput.value) {
                    setTimeValue(engineInput.value);
                    recalculateAndSave();
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                setTimeValue(getClearTimeValue());
                recalculateAndSave();
            });
        }
    }

    function getFuelSplitModalElements() {
        return {
            modal: document.getElementById('fuel-split-modal'),
            leftInput: document.getElementById('fuel-split-left'),
            rightInput: document.getElementById('fuel-split-right'),
            totalInput: document.getElementById('fuel-split-total'),
            validateBtn: document.getElementById('fuel-split-validate-btn'),
            cancelBtn: document.getElementById('fuel-split-cancel-btn'),
            clearBtn: document.getElementById('fuel-split-clear-btn'),
            closeBtn: document.getElementById('fuel-split-close-btn')
        };
    }

    function cleanFuelDigits(value) {
        return String(value || '').replace(/[^0-9]/g, '');
    }

    function formatFuelKg(value) {
        const digits = cleanFuelDigits(value);
        return digits ? `${parseInt(digits, 10)} kg` : '';
    }

    function resetFuelSplitKeyboardOffset() {
        const { modal } = getFuelSplitModalElements();
        if (!modal) return;

        const content = modal.querySelector('.fuel-split-modal-content');

        document.body.classList.remove('fuel-keyboard-open');

        modal.style.alignItems = '';
        modal.style.justifyContent = '';
        modal.style.paddingTop = '';
        modal.style.paddingBottom = '';

        if (content) {
            content.style.position = '';
            content.style.left = '';
            content.style.top = '';
            content.style.bottom = '';
            content.style.transform = '';
            content.style.maxHeight = '';
            content.style.overflowY = '';
        }
    }

    function applyFuelSplitKeyboardOffset() {
        const { modal } = getFuelSplitModalElements();
        if (!modal || modal.style.display === 'none') return;

        const visualViewport = window.visualViewport;
        if (!visualViewport || !modal.contains(document.activeElement)) {
            resetFuelSplitKeyboardOffset();
            return;
        }

        const keyboardOffset = Math.max(
            0,
            Math.round(window.innerHeight - visualViewport.height - visualViewport.offsetTop)
        );

        if (keyboardOffset > 40) {
            /*
             * La fenêtre carburant est maintenant compacte par défaut.
             * On ne force plus de position fixe ni de gros décalage au clavier :
             * ces styles inline étaient responsables du décalage vers le haut/droite sur iPad.
             */
            document.body.classList.add('fuel-keyboard-open');
        } else {
            resetFuelSplitKeyboardOffset();
        }
    }
    function closeFuelSplitModal() {
        const { modal, leftInput, rightInput, totalInput } = getFuelSplitModalElements();

        try {
            [leftInput, rightInput, totalInput].forEach(input => {
                if (input && typeof input.blur === 'function') input.blur();
            });
        } catch (_) {}

        if (modal) {
            modal.style.setProperty('display', 'none', 'important');
            modal.classList.remove('active', 'open', 'show');
            modal.setAttribute('aria-hidden', 'true');
        }

        resetFuelSplitKeyboardOffset();
        activeFuelSplitInput = null;
    }

    function updateFuelSplitTotalFromTanks() {
        const { leftInput, rightInput, totalInput } = getFuelSplitModalElements();
        if (!leftInput || !rightInput || !totalInput) return;

        leftInput.value = cleanFuelDigits(leftInput.value);
        rightInput.value = cleanFuelDigits(rightInput.value);

        const left = leftInput.value ? parseInt(leftInput.value, 10) : 0;
        const right = rightInput.value ? parseInt(rightInput.value, 10) : 0;
        totalInput.value = (leftInput.value || rightInput.value) ? String(left + right) : '';
    }

    function setupFuelSplitModalOnce() {
        const { modal, leftInput, rightInput, totalInput, validateBtn, cancelBtn, clearBtn, closeBtn } = getFuelSplitModalElements();
        if (!modal || modal.dataset.bound === '1') return;
        modal.dataset.bound = '1';

        const modalContent = modal.querySelector('.rlt-mass-modal-content');
        if (modalContent && modalContent.dataset.rltStopBound !== '1') {
            modalContent.dataset.rltStopBound = '1';
            ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach(type => {
                modalContent.addEventListener(type, (event) => {
                    /*
                     * v12.80 — boutons Retardant : ne pas bloquer les événements
                     * des boutons internes. Le stopPropagation global de la fenêtre
                     * interceptait parfois Plein au départ avant le handler du bouton
                     * sur iPad, ce qui donnait seulement un état visuel fugitif.
                     */
                    if (event.target?.closest?.('#rlt-first-full-btn, #rlt-mass-validate-btn, #rlt-mass-clear-btn, #rlt-mass-cancel-btn')) {
                        return;
                    }
                    event.stopPropagation();
                }, { capture: true });
            });
        }

        if (window.visualViewport && modal.dataset.keyboardOffsetBound !== '1') {
            modal.dataset.keyboardOffsetBound = '1';
            window.visualViewport.addEventListener('resize', applyFuelSplitKeyboardOffset);
            window.visualViewport.addEventListener('scroll', applyFuelSplitKeyboardOffset);
        }

        [leftInput, rightInput].forEach((input) => {
            if (!input) return;
            input.addEventListener('input', updateFuelSplitTotalFromTanks);
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    if (input === leftInput && rightInput) rightInput.focus();
                    else if (totalInput) totalInput.focus();
                }
            });
        });

        if (totalInput) {
            totalInput.addEventListener('input', () => {
                totalInput.value = cleanFuelDigits(totalInput.value);
            });
            totalInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    validateBtn?.click();
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeFuelSplitModal();
                }
            });
        }

        [leftInput, rightInput, totalInput].forEach((input) => {
            if (!input) return;
            input.addEventListener('focus', () => {
                setTimeout(applyFuelSplitKeyboardOffset, 0);
                setTimeout(applyFuelSplitKeyboardOffset, 250);
            });
            input.addEventListener('blur', () => {
                setTimeout(applyFuelSplitKeyboardOffset, 80);
            });
        });

        if (validateBtn) {
            validateBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                if (!activeFuelSplitInput) {
                    closeFuelSplitModal();
                    return;
                }

                const targetInput = activeFuelSplitInput;
                const total = cleanFuelDigits(totalInput?.value || '');
                targetInput.value = total ? `${parseInt(total, 10)} kg` : '';

                const targetWrapper = targetInput.closest('.input-wrapper');
                syncSharedHeaderFromWrapper(targetWrapper);
                refreshSharedHeaderMirrorValues();

                /*
                 * v12.30 — correction Bloc/Fuel multi-vols :
                 * on force le recalcul immédiat avant fermeture de la fenêtre carburant,
                 * puis on sauvegarde le vol actif. Cela évite les colonnes dérivées vides.
                 */
                try { recalculateBlocFuel(); } catch (_) {}
                masterRecalculate();
                saveCalculatorState();

                closeFuelSplitModal();
                setTimeout(closeFuelSplitModal, 80);
                setTimeout(closeFuelSplitModal, 250);
            }, { capture: true });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (leftInput) leftInput.value = '';
                if (rightInput) rightInput.value = '';
                if (totalInput) {
                    totalInput.value = '';
                    totalInput.focus();
                }
            });
        }

        if (cancelBtn) cancelBtn.addEventListener('click', closeFuelSplitModal);
        if (closeBtn) closeBtn.addEventListener('click', closeFuelSplitModal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeFuelSplitModal();
        });
    }

    function openFuelSplitModal(displayInput) {
        const { modal, leftInput, rightInput, totalInput } = getFuelSplitModalElements();
        if (!modal || !totalInput) return;

        setupFuelSplitModalOnce();
        activeFuelSplitInput = displayInput;
        if (leftInput) leftInput.value = '';
        if (rightInput) rightInput.value = '';
        totalInput.value = cleanFuelDigits(displayInput?.value || '');
        resetFuelSplitKeyboardOffset();
        modal.style.removeProperty('display');
        modal.style.display = 'flex';
        modal.removeAttribute('aria-hidden');

        /*
         * Focus immédiat : indispensable sur iPad/iPhone pour ouvrir le clavier
         * quand la fenêtre est déclenchée par le bouton AUTO -> MANUEL.
         */
        totalInput.focus({ preventScroll: false });
        totalInput.select();
        applyFuelSplitKeyboardOffset();

        requestAnimationFrame(() => {
            totalInput.focus({ preventScroll: false });
            totalInput.select();
            applyFuelSplitKeyboardOffset();
        });

        setTimeout(() => {
            totalInput.focus({ preventScroll: false });
            totalInput.select();
            applyFuelSplitKeyboardOffset();
        }, 250);
    }

    function initializeNumericInput(wrapper, initialValue = '') {
        if (!wrapper) return;
        const displayInput = wrapper.querySelector('.display-input');
        const clearBtn = wrapper.querySelector('.clear-btn');
        const unit = wrapper.dataset.unit || '';
        let shouldClearOnNextInput = false;
        displayInput.value = initialValue;

        if (wrapper.classList.contains('fuel-split-input-wrapper')) {
            setupFuelSplitModalOnce();
            displayInput.readOnly = true;
            displayInput.setAttribute('readonly', 'readonly');
            displayInput.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                openFuelSplitModal(displayInput);
            });
            wrapper.addEventListener('click', (event) => {
                if (event.target === clearBtn) return;
                openFuelSplitModal(displayInput);
            });
            if (clearBtn) {
                clearBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    displayInput.value = '';
                    syncSharedHeaderFromWrapper(wrapper);
                    refreshSharedHeaderMirrorValues();
                    masterRecalculate();
                    saveCalculatorState();
                });
            }
            return;
        }

        displayInput.addEventListener('focus', () => { if (displayInput.readOnly) return; if (displayInput.value) { shouldClearOnNextInput = true; } displayInput.value = displayInput.value.replace(/[^0-9]/g, ''); });
        displayInput.addEventListener('blur', () => { if (displayInput.readOnly) return; shouldClearOnNextInput = false; let v = displayInput.value.replace(/[^0-9]/g, ''); if (v) { displayInput.value = `${v} ${unit}`; } else { displayInput.value = ''; } masterRecalculate(); saveCalculatorState(); });
        displayInput.addEventListener('input', (e) => { if (displayInput.readOnly) return; if (shouldClearOnNextInput && e.data) { displayInput.value = e.data.replace(/[^0-9]/g, ''); shouldClearOnNextInput = false; } else { displayInput.value = displayInput.value.replace(/[^0-9]/g, ''); } masterRecalculate(); });
        displayInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); displayInput.blur(); } });
        if (clearBtn) {
            if (wrapper.id === 'rlt-depart') {
                /*
                 * v13.90 — cellule RLT de l'en-tête BLOC / FUEL.
                 * Sur iPad, le premier appui sur × donnait auparavant le focus au champ :
                 * le gestionnaire focus retirait seulement le suffixe « kg », puis un second
                 * appui était nécessaire pour vider la valeur. L'effacement est désormais
                 * exécuté dès pointerdown, avant toute prise de focus du champ.
                 */
                if (clearBtn.dataset.rltDirectClearBound !== '1') {
                    clearBtn.dataset.rltDirectClearBound = '1';

                    const clearRltDepartImmediately = (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        shouldClearOnNextInput = false;
                        displayInput.value = '';
                        if (document.activeElement === displayInput) displayInput.blur();
                        masterRecalculate();
                        saveCalculatorState();
                    };

                    if (window.PointerEvent) {
                        clearBtn.addEventListener('pointerdown', clearRltDepartImmediately);
                    } else {
                        clearBtn.addEventListener('touchstart', clearRltDepartImmediately, { passive: false });
                        clearBtn.addEventListener('mousedown', clearRltDepartImmediately);
                    }

                    clearBtn.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (displayInput.value) clearRltDepartImmediately(event);
                    });
                }
            } else {
                clearBtn.addEventListener('click', () => {
                    displayInput.value = '';
                    masterRecalculate();
                    saveCalculatorState();
                });
            }
        }
    }


    function parseDecimalInput(value) {
        if (value === null || value === undefined) return null;
        const normalized = String(value).trim().replace(',', '.').replace(/[^0-9.]/g, '');
        if (!normalized) return null;
        const number = Number(normalized);
        return Number.isFinite(number) ? number : null;
    }

    function normalizeRltDensityInput(value) {
        const raw = String(value || '').replace(',', '.').replace(/[^0-9.]/g, '');

        /*
         * v12.42 — densité retardant :
         * l'usage attendu est toujours 1.06 à 1.10.
         * On garde donc le préfixe visuel "1." et l'utilisateur ne saisit
         * que la partie décimale si besoin.
         */
        const digits = raw.replace(/\D/g, '');

        if (!digits) return '1.';

        let decimals = '';
        if (digits.startsWith('1')) {
            decimals = digits.slice(1);
        } else {
            decimals = digits;
        }

        decimals = decimals.slice(0, 3);
        return `1.${decimals}`;
    }

    function parseRltDensityInput(value) {
        const rawString = String(value || '').trim().replace(',', '.');
        const normalized = rawString.replace(/[^0-9.]/g, '');
        if (normalized === '1.' || normalized === '1' || normalized === '') return null;

        let density = Number(normalized);

        /*
         * v12.75 — sécurité densité retardant.
         * La densité attendue est autour de 1,06 à 1,10. Sur iPad, selon
         * le clavier et les anciennes valeurs, une saisie visuelle "1.1" peut
         * parfois être relue comme 0.11. Dans ce cas opérationnel impossible,
         * on reconstruit la densité à partir des chiffres saisis.
         */
        const digits = normalized.replace(/\D/g, '');
        if (Number.isFinite(density) && density > 0 && density < 0.5 && digits.startsWith('1') && digits.length >= 2) {
            const decimals = digits.slice(1, 4);
            density = Number(`1.${decimals}`);
        }

        if (!Number.isFinite(density) || density <= 0) return null;
        return density;
    }

    function markRltCalculatedField(fieldName) {
        const elements = getRltMassModalElements();
        [
            elements.massToVolumeVolumeInput,
            elements.massInput
        ].filter(Boolean).forEach(input => {
            input.classList.remove('rlt-calculated-field');
        });

        if (fieldName === 'volumeFromMass') elements.massToVolumeVolumeInput?.classList.add('rlt-calculated-field');
        if (fieldName === 'massFromVolume') elements.massInput?.classList.add('rlt-calculated-field');
    }

    function formatDecimalValue(value, decimals = 2) {
        if (!Number.isFinite(value)) return '';
        /*
         * v12.77 — correction Masse RLT :
         * ne jamais supprimer les zéros significatifs sur les valeurs entières.
         * L'ancien nettoyage transformait par exemple 8500 en 85.
         */
        if (decimals === 0) return String(Math.round(value));
        return value.toFixed(decimals).replace(/\.?0+$/, '').replace('.', ',');
    }

    function formatKgValue(value) {
        if (!Number.isFinite(value)) return '';
        return `${Math.round(value)} kg`;
    }

    function parseRltRefractoInput(value) {
        const normalized = String(value || '').trim().replace(',', '.').replace(/[^0-9.]/g, '');
        if (!normalized) return null;
        let number = Number(normalized);
        if (!Number.isFinite(number)) return null;
        /* Tolérance iPad : 145 peut représenter 14,5. */
        if (number > 30 && number <= 300) number = number / 10;
        return Number.isFinite(number) ? number : null;
    }

    function getRltDensityFromRefracto(value) {
        const refracto = parseRltRefractoInput(value);
        if (refracto === null) return null;
        if (refracto >= 11.5 && refracto <= 13.9) return 1.04;
        if (refracto >= 14 && refracto <= 17.4) return 1.08;
        if (refracto >= 17.5 && refracto <= 20.4) return 1.10;
        if (refracto >= 20.5 && refracto <= 23.9) return 1.12;
        if (refracto >= 24 && refracto <= 26.9) return 1.14;
        if (refracto >= 27 && refracto <= 30) return 1.16;
        return null;
    }

    function formatRltDensityForInput(value) {
        if (!Number.isFinite(value)) return '';
        return value.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
    }

    function normalizeRltRefractoInputValue(value) {
        return String(value || '').replace(',', '.').replace(/[^0-9.]/g, '');
    }

    function updateRltRefractoDensityOutput({ applyToDensityInputs = false } = {}) {
        const {
            refractoInput,
            refractoDensityOutput,
            massToVolumeDensityInput,
            densityInput
        } = getRltMassModalElements();

        if (!refractoInput) return null;
        const density = getRltDensityFromRefracto(refractoInput.value);
        const densityLabel = density !== null ? formatRltDensityForInput(density) : '';

        if (refractoDensityOutput) {
            refractoDensityOutput.value = densityLabel;
            refractoDensityOutput.classList.toggle('rlt-calculated-field', !!densityLabel);
        }

        if (applyToDensityInputs && densityLabel) {
            if (massToVolumeDensityInput) massToVolumeDensityInput.value = densityLabel;
            if (densityInput) densityInput.value = densityLabel;
        }

        return density;
    }

    function getRltMassModalElements() {
        return {
            modal: document.getElementById('rlt-mass-modal'),
            massToVolumeMassInput: document.getElementById('rlt-mass-to-volume-mass-input'),
            massToVolumeDensityInput: document.getElementById('rlt-mass-to-volume-density-input'),
            massToVolumeVolumeInput: document.getElementById('rlt-mass-to-volume-volume-input'),
            refractoInput: document.getElementById('rlt-refracto-input'),
            refractoDensityOutput: document.getElementById('rlt-refracto-density-output'),
            volumeInput: document.getElementById('rlt-volume-input'),
            densityInput: document.getElementById('rlt-density-input'),
            massInput: document.getElementById('rlt-mass-input'),
            validateBtn: document.getElementById('rlt-mass-validate-btn'),
            clearBtn: document.getElementById('rlt-mass-clear-btn'),
            cancelBtn: document.getElementById('rlt-mass-cancel-btn'),
            closeBtn: document.getElementById('rlt-mass-close-btn'),
            firstFullBtn: document.getElementById('rlt-first-full-btn')
        };
    }

    function closeRltMassModal() {
        const elements = getRltMassModalElements();
        const { modal } = elements;
        try {
            [
                elements.massToVolumeMassInput,
                elements.massToVolumeDensityInput,
                elements.massToVolumeVolumeInput,
                elements.refractoInput,
                elements.refractoDensityOutput,
                elements.volumeInput,
                elements.densityInput,
                elements.massInput
            ].forEach(input => input && input.blur && input.blur());
        } catch (_) {}
        if (modal) {
            modal.style.setProperty('display', 'none', 'important');
            modal.setAttribute('aria-hidden', 'true');
        }
        activeRltMassWrapper = null;
        activeRltMassLastEdited = null;
        activeRltMassCalculationMode = null;
        activeRltFirstFull = false;
        markRltCalculatedField(null);
    }

    function ensureRltDensityDefaults() {
        const { massToVolumeDensityInput, densityInput } = getRltMassModalElements();
        [massToVolumeDensityInput, densityInput].filter(Boolean).forEach(input => {
            if (!input.value || input.value === '1') input.value = '1.';
        });
    }

    function isFirstBlocFuelRltRow(wrapper) {
        const row = wrapper?.closest?.('#bloc-fuel tbody tr');
        if (!row || !row.parentElement) return false;
        const rows = Array.from(row.parentElement.querySelectorAll('tr'));
        return rows.indexOf(row) === 0;
    }

    function setRltFirstFullActive(active, persistPending = true) {
        const canUseFirstFull = isFirstBlocFuelRltRow(activeRltMassWrapper);
        activeRltFirstFull = !!active && canUseFirstFull;

        /*
         * v12.85 — Plein au départ : interrupteur volontaire protégé.
         * Le bouton peut être activé/désactivé volontairement. Sur iPad, la même action
         * peut produire touchstart + pointerdown + click ; chaque événement doit
         * conduire au même état actif, jamais à une désactivation involontaire.
         */
        if (persistPending && activeRltMassWrapper) {
            if (activeRltFirstFull) {
                activeRltMassWrapper.dataset.rltFirstFullPending = '1';
                activeRltMassWrapper.dataset.rltFirstFullWanted = '1';
            } else {
                activeRltMassWrapper.dataset.rltFirstFullPending = '';
                activeRltMassWrapper.dataset.rltFirstFullWanted = '';
                activeRltMassWrapper.dataset.rltFirstFull = '';
                if (activeRltMassWrapper.dataset.rltMode === 'firstFull') {
                    activeRltMassWrapper.dataset.rltMode = '';
                }
            }

            const pendingRow = activeRltMassWrapper.closest('tr');
            if (pendingRow) {
                pendingRow.classList.toggle('bloc-fuel-first-full-row-pending', activeRltFirstFull);
                if (!activeRltFirstFull) {
                    pendingRow.classList.remove('bloc-fuel-first-full-row');
                }
            }
            try { saveCalculatorState(); } catch (_) {}
        }

        const { firstFullBtn } = getRltMassModalElements();
        if (firstFullBtn) {
            firstFullBtn.classList.toggle('active', activeRltFirstFull);
            firstFullBtn.setAttribute('aria-pressed', activeRltFirstFull ? 'true' : 'false');
        }
    }

    function toggleRltFirstFullActive() {
        const canUseFirstFull = isFirstBlocFuelRltRow(activeRltMassWrapper);
        const nextActive = canUseFirstFull ? !(activeRltFirstFull === true) : false;

        setRltFirstFullActive(nextActive, true);
        syncRltMassModalFromInputs();

        if (nextActive) {
            applyRltFirstFullIfPossible();
        } else {
            const row = activeRltMassWrapper?.closest?.('tr');
            if (row) {
                row.classList.remove('bloc-fuel-first-full-row');
                row.classList.remove('bloc-fuel-first-full-row-pending');
            }
            try { masterRecalculate(); } catch (_) {}
            try { saveCalculatorState(); } catch (_) {}
        }
    }

    function applyRltFirstFullIfPossible() {
        if (!activeRltMassWrapper || !isFirstBlocFuelRltRow(activeRltMassWrapper) || !activeRltFirstFull) return false;

        const {
            massToVolumeMassInput,
            massToVolumeDensityInput,
            massToVolumeVolumeInput,
            volumeInput,
            densityInput,
            massInput
        } = getRltMassModalElements();

        const topMass = parseDecimalInput(massToVolumeMassInput?.value);
        const topDensity = parseRltDensityInput(massToVolumeDensityInput?.value);
        const bottomVolume = parseDecimalInput(volumeInput?.value);
        const bottomDensity = parseRltDensityInput(densityInput?.value);
        const existingBottomMass = parseDecimalInput(massInput?.value);

        const topComputedVolume = (topMass !== null && topDensity !== null) ? (topMass / topDensity) : null;
        const bottomComplete = bottomVolume !== null && bottomDensity !== null;
        const bottomComputedMass = bottomComplete
            ? (existingBottomMass !== null ? existingBottomMass : (bottomVolume * bottomDensity))
            : null;

        /*
         * v12.83 — Plein au départ : ne plus dépendre uniquement de la
         * ligne 1 « Masse ÷ Densité ». Si l'utilisateur travaille avec la
         * ligne 2 « Volume × Densité = Masse » (ex. 8500 × 1,1), le bouton
         * doit aussi appliquer le mode Plein au départ avec cette masse.
         */
        const selectedMass = bottomComputedMass !== null ? bottomComputedMass : topMass;
        const selectedVolume = bottomComputedMass !== null ? bottomVolume : topComputedVolume;
        const selectedDensity = bottomComputedMass !== null ? bottomDensity : topDensity;
        if (selectedMass === null) return false;

        if (massToVolumeVolumeInput && topComputedVolume !== null) {
            massToVolumeVolumeInput.value = formatDecimalValue(topComputedVolume, 0);
        }
        if (massInput && bottomComputedMass !== null) {
            massInput.value = formatDecimalValue(bottomComputedMass, 0);
        }

        activeRltMassWrapper.dataset.topMass = topMass !== null ? String(Math.round(topMass)) : '';
        activeRltMassWrapper.dataset.topDensity = topDensity !== null ? formatDecimalValue(topDensity, 3) : '';
        activeRltMassWrapper.dataset.topVolume = topComputedVolume !== null ? formatDecimalValue(topComputedVolume, 0) : '';
        activeRltMassWrapper.dataset.bottomVolume = bottomVolume !== null ? formatDecimalValue(bottomVolume, 0) : '';
        activeRltMassWrapper.dataset.bottomDensity = bottomDensity !== null ? formatDecimalValue(bottomDensity, 3) : '';
        activeRltMassWrapper.dataset.bottomMass = bottomComputedMass !== null ? String(Math.round(bottomComputedMass)) : '';
        activeRltMassWrapper.dataset.refracto = normalizeRltRefractoInputValue(getRltMassModalElements().refractoInput?.value || '');
        activeRltMassWrapper.dataset.volume = selectedVolume !== null ? formatDecimalValue(selectedVolume, 0) : '';
        activeRltMassWrapper.dataset.density = selectedDensity !== null ? formatDecimalValue(selectedDensity, 3) : '';
        activeRltMassWrapper.dataset.mass = String(Math.round(selectedMass));
        activeRltMassWrapper.dataset.rltMode = 'firstFull';
        activeRltMassWrapper.dataset.rltFirstFull = '1';
        activeRltMassWrapper.dataset.rltFirstFullPending = '1';
        activeRltMassWrapper.dataset.rltFirstFullWanted = '1';

        const displayInput = activeRltMassWrapper.querySelector('.display-input');
        if (displayInput) displayInput.value = formatKgValue(selectedMass);

        const row = activeRltMassWrapper.closest('tr');
        if (row) {
            row.classList.add('bloc-fuel-first-full-row');
            row.classList.add('bloc-fuel-first-full-row-pending');
            /* v12.84 — ne plus vider Fuel ni OACI en mode Plein au départ. */
            try { updateRowAirportOaci(row); } catch (_) {}
        }

        try { masterRecalculate(); } catch (_) {}
        try { saveCalculatorState(); } catch (_) {}
        return true;
    }

    function syncRltMassModalFromInputs() {
        const {
            massToVolumeMassInput,
            massToVolumeDensityInput,
            massToVolumeVolumeInput,
            refractoInput,
            refractoDensityOutput,
            volumeInput,
            densityInput,
            massInput,
            firstFullBtn
        } = getRltMassModalElements();

        ensureRltDensityDefaults();
        updateRltRefractoDensityOutput({ applyToDensityInputs: false });
        markRltCalculatedField(null);

        const topMass = parseDecimalInput(massToVolumeMassInput?.value);
        const topDensity = parseRltDensityInput(massToVolumeDensityInput?.value);
        const bottomVolume = parseDecimalInput(volumeInput?.value);
        const bottomDensity = parseRltDensityInput(densityInput?.value);
        const topComputedVolume = (topMass !== null && topDensity !== null) ? (topMass / topDensity) : null;

        if (massToVolumeVolumeInput) {
            if (topComputedVolume !== null) {
                massToVolumeVolumeInput.value = formatDecimalValue(topComputedVolume, 0);
                markRltCalculatedField('volumeFromMass');
            } else {
                massToVolumeVolumeInput.value = '';
            }
        }

        /*
         * v12.71 — les deux lignes sont indépendantes.
         * Ligne 1 : Masse ÷ Densité = Volume. Elle calcule uniquement son volume.
         * Ligne 2 : Volume × Densité = Masse. Elle calcule uniquement sa masse.
         * La ligne 1 ne remplit plus la ligne 2 et inversement.
         */
        if (massInput) {
            if (bottomVolume !== null && bottomDensity !== null) {
                massInput.value = formatDecimalValue(bottomVolume * bottomDensity, 0);
                markRltCalculatedField('massFromVolume');
            } else {
                massInput.value = '';
            }
        }

        if (firstFullBtn) {
            /*
             * v12.75 — le bouton Plein au départ dépend de la ligne du tableau
             * BLOC/FUEL ouverte, pas de la première ligne de calcul de la
             * fenêtre. Il n'est disponible que sur la première ligne du tableau.
             */
            const canUseFirstFull = isFirstBlocFuelRltRow(activeRltMassWrapper);
            firstFullBtn.hidden = !canUseFirstFull;
            firstFullBtn.style.display = canUseFirstFull ? 'flex' : 'none';
            if (!canUseFirstFull) activeRltFirstFull = false;
            firstFullBtn.classList.toggle('active', !!activeRltFirstFull && canUseFirstFull);
            firstFullBtn.setAttribute('aria-pressed', (!!activeRltFirstFull && canUseFirstFull) ? 'true' : 'false');
        }
    }

    function setupRltMassModalOnce() {
        const elements = getRltMassModalElements();
        const {
            modal,
            massToVolumeMassInput,
            massToVolumeDensityInput,
            massToVolumeVolumeInput,
            refractoInput,
            refractoDensityOutput,
            volumeInput,
            densityInput,
            massInput,
            validateBtn,
            clearBtn,
            cancelBtn,
            closeBtn,
            firstFullBtn
        } = elements;
        if (!modal || modal.dataset.bound === '1') return;
        modal.dataset.bound = '1';

        const modalContent = modal.querySelector('.rlt-mass-modal-content');
        if (modalContent && modalContent.dataset.rltStopBound !== '1') {
            modalContent.dataset.rltStopBound = '1';
            ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach(type => {
                modalContent.addEventListener(type, (event) => {
                    /*
                     * v12.80 — boutons Retardant : ne pas bloquer les événements
                     * des boutons internes. Le stopPropagation global de la fenêtre
                     * interceptait parfois Plein au départ avant le handler du bouton
                     * sur iPad, ce qui donnait seulement un état visuel fugitif.
                     */
                    if (event.target?.closest?.('#rlt-first-full-btn, #rlt-mass-validate-btn, #rlt-mass-clear-btn, #rlt-mass-cancel-btn')) {
                        return;
                    }
                    event.stopPropagation();
                }, { capture: true });
            });
        }

        [massToVolumeVolumeInput, refractoDensityOutput, massInput].filter(Boolean).forEach(input => {
            input.readOnly = true;
            input.setAttribute('readonly', 'readonly');
            input.setAttribute('aria-readonly', 'true');
            input.addEventListener('focus', () => input.blur());
        });

        const bindInput = (input, field, mode) => {
            if (!input) return;
            input.addEventListener('focus', () => {
                /*
                 * v12.60 — iPad : quand le clavier apparaît, la fenêtre
                 * Masse RLT doit remonter comme lorsqu'une cellule déjà
                 * renseignée est ouverte. On force un recentrage visuel
                 * de la boîte au focus de chaque champ éditable.
                 */
                setTimeout(() => {
                    try {
                        const content = input.closest('.rlt-mass-modal-content');
                        if (content && typeof content.scrollIntoView === 'function') {
                            content.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
                        }
                    } catch (_) {}
                }, 160);
            });
            input.addEventListener('input', () => {
                if (field === 'density') {
                    input.value = normalizeRltDensityInput(input.value);
                    try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
                } else if (field === 'volume' || field === 'mass') {
                    input.value = String(input.value || '').replace(/[^0-9]/g, '');
                }
                activeRltMassLastEdited = field;
                activeRltMassCalculationMode = mode;
                syncRltMassModalFromInputs();
            });
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    validateBtn?.click();
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeRltMassModal();
                }
            });
        };

        bindInput(massToVolumeMassInput, 'mass', 'massToVolume');
        bindInput(massToVolumeDensityInput, 'density', 'massToVolume');
        bindInput(volumeInput, 'volume', 'volumeToMass');
        bindInput(densityInput, 'density', 'volumeToMass');

        if (refractoInput && refractoInput.dataset.rltRefractoBound !== '1') {
            refractoInput.dataset.rltRefractoBound = '1';
            refractoInput.addEventListener('focus', () => {
                setTimeout(() => {
                    try {
                        const content = refractoInput.closest('.rlt-mass-modal-content');
                        if (content && typeof content.scrollIntoView === 'function') {
                            content.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
                        }
                    } catch (_) {}
                }, 160);
            });
            refractoInput.addEventListener('input', () => {
                refractoInput.value = normalizeRltRefractoInputValue(refractoInput.value);
                try { refractoInput.setSelectionRange(refractoInput.value.length, refractoInput.value.length); } catch (_) {}
                const density = updateRltRefractoDensityOutput({ applyToDensityInputs: true });
                if (density !== null) {
                    activeRltMassLastEdited = 'density';
                    activeRltMassCalculationMode = 'refractoToDensity';
                }
                syncRltMassModalFromInputs();
            });
            refractoInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    volumeInput?.focus?.({ preventScroll: false });
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeRltMassModal();
                }
            });
        }

        if (firstFullBtn && firstFullBtn.dataset.rltFirstFullBound !== '1') {
            firstFullBtn.dataset.rltFirstFullBound = '1';
            ['touchstart', 'pointerdown', 'mousedown', 'click'].forEach(type => {
                firstFullBtn.addEventListener(type, handleRltFirstFullButtonEvent, { capture: true, passive: false });
            });
        }

        const stopRltButtonEvent = (event) => {
            if (!event) return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        };

        const runRltButtonActionOnce = (action, actionKey = 'rlt') => {
            const now = Date.now();
            const lastRun = Number(modal?.dataset.rltLastButtonActionAt || '0');
            const lastKey = modal?.dataset.rltLastButtonActionKey || '';
            const dedupeDelayMs = 320;
            if (lastKey === actionKey && now - lastRun < dedupeDelayMs) return;
            if (modal) {
                modal.dataset.rltLastButtonActionAt = String(now);
                modal.dataset.rltLastButtonActionKey = actionKey;
            }
            action();
        };

        function handleRltFirstFullButtonEvent(event) {
            /*
             * v12.88 — Plein au départ : gestion tactile déterministe.
             * Le bouton est volontairement traité sur le premier événement tactile
             * réel, puis les événements souris/click synthétiques du même appui sont
             * ignorés. Un second appui tactile reste possible pour désélectionner.
             */
            const now = Date.now();
            const type = event?.type || '';
            const pointerType = String(event?.pointerType || '').toLowerCase();
            const isTouchLike = type === 'touchstart' || (type === 'pointerdown' && pointerType === 'touch');
            const isMouseSyntheticCandidate = type === 'mousedown' || type === 'click' || (type === 'pointerdown' && pointerType === 'mouse');

            stopRltButtonEvent(event);

            if (isTouchLike) {
                const lastTouchAt = Number(modal?.dataset.rltFirstFullLastTouchAt || '0');
                if (now - lastTouchAt < 250) return;
                if (modal) {
                    modal.dataset.rltFirstFullLastTouchAt = String(now);
                    modal.dataset.rltFirstFullIgnoreMouseUntil = String(now + 5000);
                }
                runRltButtonActionOnce(() => {
                    toggleRltFirstFullActive();
                }, 'rlt-firstfull-touch');
                return;
            }

            if (isMouseSyntheticCandidate) {
                const ignoreMouseUntil = Number(modal?.dataset.rltFirstFullIgnoreMouseUntil || '0');
                if (now < ignoreMouseUntil) return;
                if (type !== 'click') return;
                runRltButtonActionOnce(() => {
                    toggleRltFirstFullActive();
                }, 'rlt-firstfull-click');
            }
        }

        const validateRltModalFields = () => {
            if (!activeRltMassWrapper) {
                closeRltMassModal();
                return;
            }

            syncRltMassModalFromInputs();

            const topMass = parseDecimalInput(massToVolumeMassInput?.value);
            const topDensity = parseRltDensityInput(massToVolumeDensityInput?.value);
            const topVolume = parseDecimalInput(massToVolumeVolumeInput?.value);
            const refractoValue = normalizeRltRefractoInputValue(refractoInput?.value || '');
            const bottomVolume = parseDecimalInput(volumeInput?.value);
            const bottomDensity = parseRltDensityInput(densityInput?.value);
            const bottomMass = parseDecimalInput(massInput?.value);

            const topComplete = topMass !== null && topDensity !== null;
            const bottomComplete = bottomVolume !== null && bottomDensity !== null;

            const topComputedVolume = topComplete
                ? (topVolume !== null ? topVolume : (topMass / topDensity))
                : null;
            const bottomComputedMass = bottomComplete
                ? (bottomMass !== null ? bottomMass : (bottomVolume * bottomDensity))
                : null;

            let volume = null;
            let density = null;
            let mass = null;
            let selectedMode = '';

            /*
             * v12.83 — Plein au départ : l'appui sur le bouton doit primer sur
             * le choix de ligne de calcul. Avant, si la ligne 2 était remplie
             * (Volume × Densité = Masse), le bloc `bottomComplete` passait avant
             * `firstFull` et réécrivait l'état en `volumeToMass`, ce qui
             * désactivait le bouton à la réouverture. Désormais, dès que le
             * bouton est actif et qu'une masse existe, le mode validé reste
             * `firstFull`.
             */
            const firstFullMass = bottomComputedMass !== null ? bottomComputedMass : topMass;
            const firstFullVolume = bottomComputedMass !== null ? bottomVolume : topComputedVolume;
            const firstFullDensity = bottomComputedMass !== null ? bottomDensity : topDensity;
            const isFirstFull = !!activeRltFirstFull && isFirstBlocFuelRltRow(activeRltMassWrapper) && firstFullMass !== null;

            if (isFirstFull) {
                volume = firstFullVolume;
                density = firstFullDensity;
                mass = firstFullMass;
                selectedMode = 'firstFull';
            } else if (bottomComplete) {
                volume = bottomVolume;
                density = bottomDensity;
                mass = bottomComputedMass;
                selectedMode = 'volumeToMass';
            } else if (topComplete) {
                volume = topComputedVolume;
                density = topDensity;
                mass = topMass;
                selectedMode = 'massToVolume';
            }

            activeRltMassWrapper.dataset.topMass = topMass !== null ? String(Math.round(topMass)) : '';
            activeRltMassWrapper.dataset.topDensity = topDensity !== null ? formatDecimalValue(topDensity, 3) : '';
            activeRltMassWrapper.dataset.topVolume = topComputedVolume !== null ? formatDecimalValue(topComputedVolume, 0) : '';
            activeRltMassWrapper.dataset.bottomVolume = bottomVolume !== null ? formatDecimalValue(bottomVolume, 0) : '';
            activeRltMassWrapper.dataset.bottomDensity = bottomDensity !== null ? formatDecimalValue(bottomDensity, 3) : '';
            activeRltMassWrapper.dataset.bottomMass = bottomMass !== null ? String(Math.round(bottomMass)) : '';
            activeRltMassWrapper.dataset.refracto = refractoValue;
            activeRltMassWrapper.dataset.rltMode = selectedMode;
            activeRltMassWrapper.dataset.rltFirstFull = selectedMode === 'firstFull' ? '1' : '';
            activeRltMassWrapper.dataset.rltFirstFullPending = selectedMode === 'firstFull' ? '1' : '';
            activeRltMassWrapper.dataset.rltFirstFullWanted = selectedMode === 'firstFull' ? '1' : '';

            const activeRltRow = activeRltMassWrapper.closest('tr');
            if (activeRltRow) {
                activeRltRow.classList.toggle('bloc-fuel-first-full-row', selectedMode === 'firstFull');
                activeRltRow.classList.toggle('bloc-fuel-first-full-row-pending', selectedMode === 'firstFull');
                if (selectedMode === 'firstFull') {
                    /* v12.84 — Plein au départ ne vide plus Fuel ni OACI. */
                    try { updateRowAirportOaci(activeRltRow); } catch (_) {}
                }
            }

            activeRltMassWrapper.dataset.volume = volume !== null ? formatDecimalValue(volume, 0) : '';
            activeRltMassWrapper.dataset.density = density !== null ? formatDecimalValue(density, 3) : '';
            activeRltMassWrapper.dataset.mass = mass !== null ? String(Math.round(mass)) : '';

            const displayInput = activeRltMassWrapper.querySelector('.display-input');
            if (displayInput) displayInput.value = mass !== null ? formatKgValue(mass) : '';

            masterRecalculate();
            saveCalculatorState();
            closeRltMassModal();
        };

        const clearRltModalFields = () => {
            if (massToVolumeMassInput) massToVolumeMassInput.value = '';
            if (massToVolumeDensityInput) massToVolumeDensityInput.value = '1.';
            if (massToVolumeVolumeInput) massToVolumeVolumeInput.value = '';
            if (refractoInput) refractoInput.value = '';
            if (refractoDensityOutput) refractoDensityOutput.value = '';
            if (volumeInput) volumeInput.value = '';
            if (densityInput) densityInput.value = '1.';
            if (massInput) massInput.value = '';
            activeRltMassLastEdited = null;
            activeRltMassCalculationMode = null;
            activeRltFirstFull = false;
            markRltCalculatedField(null);
            ensureRltDensityDefaults();

            /*
             * v12.72 — Effacer ne ferme ni le clavier ni la fenêtre.
             * On refocalise un champ éditable après le nettoyage pour empêcher
             * Safari/iPad de transformer le premier appui en simple fermeture clavier.
             */
            try {
                const current = document.activeElement && modal?.contains(document.activeElement)
                    && document.activeElement.tagName === 'INPUT'
                    && !document.activeElement.readOnly
                    ? document.activeElement
                    : null;
                const refocusInput = current || volumeInput || massToVolumeMassInput;
                requestAnimationFrame(() => refocusInput?.focus?.({ preventScroll: false }));
                setTimeout(() => refocusInput?.focus?.({ preventScroll: false }), 80);
                setTimeout(() => refocusInput?.focus?.({ preventScroll: false }), 220);
            } catch (_) {}
        };

        const bindRltActionButton = (button, action) => {
            if (!button || button.dataset.rltActionBound === '1') return;
            button.dataset.rltActionBound = '1';
            const handler = (event) => {
                stopRltButtonEvent(event);
                runRltButtonActionOnce(action, button.id || 'rlt-action');
            };
            ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach(type => {
                button.addEventListener(type, handler, { capture: true, passive: false });
            });
        };


        const getRltActionPoint = (event) => {
            const source = event?.touches?.[0] || event?.changedTouches?.[0] || event;
            if (!source || typeof source.clientX !== 'number' || typeof source.clientY !== 'number') return null;
            return { x: source.clientX, y: source.clientY };
        };

        const buttonContainsPoint = (button, point) => {
            if (!button || !point) return false;
            const rect = button.getBoundingClientRect();
            const margin = 12;
            return point.x >= rect.left - margin
                && point.x <= rect.right + margin
                && point.y >= rect.top - margin
                && point.y <= rect.bottom + margin;
        };

        const bindRltGlobalButtonCapture = () => {
            if (!modal || modal.dataset.rltGlobalButtonCaptureBound === '1') return;
            modal.dataset.rltGlobalButtonCaptureBound = '1';

            const captureHandler = (event) => {
                try {
                    if (modal.getAttribute('aria-hidden') === 'true' || modal.style.display === 'none') return;
                    const point = getRltActionPoint(event);
                    if (!point) return;

                    if (buttonContainsPoint(validateBtn, point)) {
                        stopRltButtonEvent(event);
                        runRltButtonActionOnce(validateRltModalFields, 'rlt-validate-global');
                        return;
                    }
                    if (buttonContainsPoint(clearBtn, point)) {
                        stopRltButtonEvent(event);
                        runRltButtonActionOnce(clearRltModalFields, 'rlt-clear-global');
                        return;
                    }
                    if (buttonContainsPoint(firstFullBtn, point)) {
                        handleRltFirstFullButtonEvent(event);
                        return;
                    }
                    if (buttonContainsPoint(cancelBtn, point) || buttonContainsPoint(closeBtn, point)) {
                        stopRltButtonEvent(event);
                        runRltButtonActionOnce(closeRltMassModal, 'rlt-close-global');
                    }
                } catch (_) {}
            };

            ['touchstart', 'pointerdown', 'mousedown'].forEach(type => {
                document.addEventListener(type, captureHandler, { capture: true, passive: false });
            });
        };

        bindRltGlobalButtonCapture();

        bindRltActionButton(validateBtn, validateRltModalFields);
        bindRltActionButton(clearBtn, clearRltModalFields);

        const bindRltModalCloseButton = (button) => {
            if (!button || button.dataset.rltCloseBound === '1') return;
            button.dataset.rltCloseBound = '1';
            const handler = (event) => {
                if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                closeRltMassModal();
            };
            ['pointerdown', 'touchstart', 'mousedown'].forEach(type => {
                button.addEventListener(type, handler, { capture: true });
            });
            button.addEventListener('click', handler, { capture: true });
        };

        bindRltModalCloseButton(cancelBtn);
        bindRltModalCloseButton(closeBtn);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeRltMassModal();
        });
    }

    function openRltMassModal(wrapper) {
        const elements = getRltMassModalElements();
        const {
            modal,
            massToVolumeMassInput,
            massToVolumeDensityInput,
            massToVolumeVolumeInput,
            refractoInput,
            refractoDensityOutput,
            volumeInput,
            densityInput,
            massInput
        } = elements;
        if (!modal || !wrapper) return;

        setupRltMassModalOnce();
        activeRltMassWrapper = wrapper;
        activeRltMassLastEdited = null;
        activeRltMassCalculationMode = null;
        activeRltFirstFull = isFirstBlocFuelRltRow(wrapper) && (wrapper.dataset.rltFirstFullPending === '1' || wrapper.dataset.rltFirstFullWanted === '1' || wrapper.dataset.rltFirstFull === '1' || wrapper.dataset.rltMode === 'firstFull');

        const storedVolume = wrapper.dataset.volume || '';
        const storedDensity = wrapper.dataset.density || '1.';
        const storedMass = wrapper.dataset.mass || String(wrapper.querySelector('.display-input')?.value || '').replace(/[^0-9]/g, '');
        const storedTopMass = wrapper.dataset.topMass || '';
        const storedTopDensity = wrapper.dataset.topDensity || '';
        const storedTopVolume = wrapper.dataset.topVolume || '';
        const storedBottomVolume = wrapper.dataset.bottomVolume || '';
        const storedBottomDensity = wrapper.dataset.bottomDensity || '';
        const storedBottomMass = wrapper.dataset.bottomMass || '';
        const storedRefracto = wrapper.dataset.refracto || '';
        const storedMode = wrapper.dataset.rltMode || '';
        const storedFirstFull = wrapper.dataset.rltFirstFull || '';

        /*
         * v12.71 — restauration indépendante des deux lignes.
         * Compatibilité ancienne donnée : s'il n'existe pas encore de détail
         * ligne 1/ligne 2, on restaure l'ancienne valeur comme ligne 2.
         */
        const hasDetailedRltData = !!(storedTopMass || storedTopDensity || storedTopVolume || storedBottomVolume || storedBottomDensity || storedBottomMass || storedMode);

        if (massToVolumeMassInput) massToVolumeMassInput.value = hasDetailedRltData ? storedTopMass : '';
        if (massToVolumeDensityInput) massToVolumeDensityInput.value = hasDetailedRltData ? (storedTopDensity || '1.') : '1.';
        if (massToVolumeVolumeInput) massToVolumeVolumeInput.value = hasDetailedRltData ? storedTopVolume : '';
        if (refractoInput) refractoInput.value = storedRefracto;
        if (refractoDensityOutput) refractoDensityOutput.value = '';
        updateRltRefractoDensityOutput({ applyToDensityInputs: false });
        if (volumeInput) volumeInput.value = hasDetailedRltData ? storedBottomVolume : storedVolume;
        if (densityInput) densityInput.value = hasDetailedRltData ? (storedBottomDensity || '1.') : (storedDensity || '1.');
        if (massInput) massInput.value = hasDetailedRltData ? storedBottomMass : storedMass;

        markRltCalculatedField(null);
        syncRltMassModalFromInputs();

        modal.style.removeProperty('display');
        modal.style.display = 'flex';
        modal.removeAttribute('aria-hidden');

        setTimeout(() => {
            try {
                /*
                 * v12.60 — on privilégie la ligne opérationnelle
                 * Volume × Densité = Masse. Sur iPad, focaliser ce champ
                 * fait remonter la fenêtre avec le clavier, y compris quand
                 * la cellule Masse RLT était vide.
                 */
                const preferredInput = volumeInput || massToVolumeMassInput;
                if (preferredInput) {
                    preferredInput.focus({ preventScroll: false });
                    const content = preferredInput.closest('.rlt-mass-modal-content');
                    setTimeout(() => {
                        try {
                            if (content && typeof content.scrollIntoView === 'function') {
                                content.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
                            }
                        } catch (_) {}
                    }, 180);
                }
            } catch (_) {}
        }, 80);
    }

    function initializeRltMassInput(wrapper, data = {}) {
        if (!wrapper) return;
        const displayInput = wrapper.querySelector('.display-input');
        const clearBtn = wrapper.querySelector('.clear-btn');

        wrapper.dataset.volume = data?.rltVolume || '';
        wrapper.dataset.density = data?.rltDensity || '';
        wrapper.dataset.mass = data?.rltMass ? String(data.rltMass).replace(/[^0-9]/g, '') : '';
        wrapper.dataset.topMass = data?.rltTopMass || '';
        wrapper.dataset.topDensity = data?.rltTopDensity || '';
        wrapper.dataset.topVolume = data?.rltTopVolume || '';
        wrapper.dataset.bottomVolume = data?.rltBottomVolume || '';
        wrapper.dataset.bottomDensity = data?.rltBottomDensity || '';
        wrapper.dataset.bottomMass = data?.rltBottomMass || '';
        wrapper.dataset.refracto = data?.rltRefracto || '';
        wrapper.dataset.rltMode = data?.rltMode || '';
        wrapper.dataset.rltFirstFull = data?.rltFirstFull || '';
        wrapper.dataset.rltFirstFullPending = data?.rltFirstFullPending || data?.rltFirstFull || '';
        wrapper.dataset.rltFirstFullWanted = data?.rltFirstFullWanted || data?.rltFirstFullPending || data?.rltFirstFull || '';
        const rowForFirstFull = wrapper.closest('tr');
        if (rowForFirstFull) {
            rowForFirstFull.classList.toggle('bloc-fuel-first-full-row', wrapper.dataset.rltFirstFull === '1' || wrapper.dataset.rltMode === 'firstFull');
            rowForFirstFull.classList.toggle('bloc-fuel-first-full-row-pending', wrapper.dataset.rltFirstFullPending === '1' || wrapper.dataset.rltFirstFullWanted === '1');
        }
        if (displayInput) displayInput.value = data?.rltMass || '';

        setupRltMassModalOnce();

        const open = (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            if (wrapper.closest('#bloc-fuel') && wrapper.classList.contains('locked-input-wrapper')) return;
            openRltMassModal(wrapper);
        };

        wrapper.addEventListener('click', open);
        if (displayInput) displayInput.addEventListener('click', open);

        if (clearBtn) {
            clearBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                wrapper.dataset.volume = '';
                wrapper.dataset.density = '';
                wrapper.dataset.mass = '';
                wrapper.dataset.topMass = '';
                wrapper.dataset.topDensity = '';
                wrapper.dataset.topVolume = '';
                wrapper.dataset.bottomVolume = '';
                wrapper.dataset.bottomDensity = '';
                wrapper.dataset.bottomMass = '';
                wrapper.dataset.refracto = '';
                wrapper.dataset.rltMode = '';
                wrapper.dataset.rltFirstFull = '';
                wrapper.dataset.rltFirstFullPending = '';
                wrapper.dataset.rltFirstFullWanted = '';
                const rowForClear = wrapper.closest('tr');
                if (rowForClear) {
                    rowForClear.classList.remove('bloc-fuel-first-full-row');
                    rowForClear.classList.remove('bloc-fuel-first-full-row-pending');
                }
                if (displayInput) displayInput.value = '';
                masterRecalculate();
                saveCalculatorState();
            });
        }
    }

    const addNewRow = (tableBody, data, isLastRow = false) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td><div class="input-wrapper time-input-wrapper"><input type="text" class="display-input" readonly placeholder="--:--"><span class="clear-btn">&times;</span><span class="clock-icon">🕒</span><input type="time" class="engine-input"></div></td><td><div class="input-wrapper numeric-input-wrapper fuel-split-input-wrapper" data-unit="kg"><input type="text" class="display-input" inputmode="numeric" placeholder="[valeur]"><span class="clear-btn">&times;</span></div></td><td class="airport-oaci-cell">--</td><td><div class="input-wrapper rlt-mass-input-wrapper" data-unit="kg"><input type="text" class="display-input" readonly placeholder="[kg]"><span class="clear-btn">&times;</span></div></td><td class="duree-rotation-cell"></td><td class="fuel-rotation-cell"></td><td class="tps-vol-cell"></td><td class="tps-vol-restant-cell"></td>`;
        tableBody.appendChild(row);

        const timeWrapper = row.querySelector('.time-input-wrapper');
        const numericWrapper = row.querySelector('.numeric-input-wrapper');
        const rltMassWrapper = row.querySelector('.rlt-mass-input-wrapper');

        initializeTimeInput(timeWrapper, data ? data.time : '');
        initializeNumericInput(numericWrapper, data ? data.fuel : '');
        initializeRltMassInput(rltMassWrapper, data || {});
        row.dataset.airportOaci = data?.oaci || '';
        updateRowAirportOaci(row);

        const forceRowRecalculateAndSave = () => {
            /*
             * v12.30 — sécurité : une modification dans une ligne BLOC/FUEL doit
             * toujours recalculer les colonnes Durée/Fuel/Tps de vol.
             */
            try { updateRowAirportOaci(row); } catch (_) {}
            try { recalculateBlocFuel(); } catch (_) {}
            masterRecalculate();
            saveCalculatorState();
        };

        [
            timeWrapper.querySelector('.display-input'),
            timeWrapper.querySelector('.engine-input'),
            numericWrapper.querySelector('.display-input'),
            rltMassWrapper.querySelector('.display-input')
        ].filter(Boolean).forEach(input => {
            input.addEventListener('change', forceRowRecalculateAndSave);
            input.addEventListener('input', forceRowRecalculateAndSave);
            input.addEventListener('blur', forceRowRecalculateAndSave);
        });

        const checkAndAddRow = () => {
            if (row.nextSibling) {
                timeWrapper.querySelector('.engine-input').removeEventListener('change', checkAndAddRow);
                timeWrapper.querySelector('.display-input').removeEventListener('blur', checkAndAddRow);
                numericWrapper.querySelector('.display-input').removeEventListener('blur', checkAndAddRow);
                return;
            }
            if (timeWrapper.querySelector('.display-input').value || numericWrapper.querySelector('.display-input').value) {
                addNewRow(tableBody, null, true);
            }
        };

        if (isLastRow) {
            timeWrapper.querySelector('.engine-input').addEventListener('change', checkAndAddRow);
            timeWrapper.querySelector('.display-input').addEventListener('blur', checkAndAddRow);
            numericWrapper.querySelector('.display-input').addEventListener('blur', checkAndAddRow);
        }
    };

    function loadCalculatorState() {
        loadActiveFlightState();
    }

    loadCalculatorState();
    updateBlocDepartAirportLabel();
    refreshBlocFuelAirportOaciCells();

    function setupManualButton(btnId, wrapperId, flagSetter) {
        const btn = document.getElementById(btnId);
        const wrapper = document.getElementById(wrapperId);
        const input = wrapper?.querySelector('.display-input');
        if (!btn || !wrapper || !input) return;

        btn.addEventListener('click', () => {
            const isManual = flagSetter();
            const isFuelManualField = wrapper.classList.contains('numeric-input-wrapper') && (wrapper.dataset.unit || '') === 'kg';

            if (isManual) {
                btn.textContent = 'MANUEL';
                btn.classList.add('active');

                if (isFuelManualField) {
                    input.readOnly = true;
                    input.setAttribute('readonly', 'readonly');
                    openFuelSplitModal(input);
                } else {
                    input.readOnly = false;
                    input.removeAttribute('readonly');
                }
            } else {
                btn.textContent = 'AUTO';
                btn.classList.remove('active');
                input.readOnly = true;
                input.setAttribute('readonly', 'readonly');
            }

            masterRecalculate();
        });
    }
    setupManualButton('suivi-conso-rotation-manual-btn', 'suivi-conso-rotation-wrapper', () => isSuiviConsoManual = !isSuiviConsoManual);
    setupManualButton('suivi-duree-rotation-manual-btn', 'suivi-duree-rotation-wrapper', () => isSuiviDureeManual = !isSuiviDureeManual);

    ['suivi-conso-rotation-wrapper'].forEach((wrapperId) => {
        const wrapper = document.getElementById(wrapperId);
        const input = wrapper?.querySelector('.display-input');
        if (!wrapper || !input || wrapper.dataset.fuelSplitManualBound === '1') return;
        wrapper.dataset.fuelSplitManualBound = '1';
        wrapper.addEventListener('click', (event) => {
            if (event.target && event.target.classList && event.target.classList.contains('clear-btn')) return;
            const isManualWrapper = wrapperId === 'suivi-conso-rotation-wrapper' && isSuiviConsoManual;
            if (isManualWrapper) {
                event.preventDefault();
                event.stopPropagation();
                openFuelSplitModal(input);
            }
        });
    });

    const flightSelect = document.getElementById('flight-select');
    const newFlightButton = document.getElementById('new-flight-btn');
    const closeFlightButton = document.getElementById('close-flight-btn');
    const deleteFlightButton = document.getElementById('delete-flight-btn');
    const exportBlocFuelPdfButton = document.getElementById('export-bloc-fuel-pdf-btn');

    if (flightSelect) {
        flightSelect.addEventListener('change', () => {
            updateActiveFlightStateFromDom();
            activeFlightId = flightSelect.value;
            persistFlights();
            loadActiveFlightState();
        });
    }

    if (newFlightButton) {
        newFlightButton.addEventListener('click', () => {
            updateActiveFlightStateFromDom();
            const newFlight = createEmptyFlight(dailyFlights.length + 1);
            const activeFlight = dailyFlights.find(flight => flight.id === activeFlightId);
            if (activeFlight) {
                newFlight.state['tmd'] = activeFlight.state?.['tmd'] || document.getElementById('tmd')?.querySelector('.display-input')?.value || '21:30';
                newFlight.state['limite-hdv'] = activeFlight.state?.['limite-hdv'] || document.getElementById('limite-hdv')?.querySelector('.display-input')?.value || '08:00';
                newFlight.state['fuel-depart'] = activeFlight.state?.['fuel-depart'] || document.getElementById('fuel-depart')?.querySelector('.display-input')?.value || '3500 kg';
                newFlight.state['previ-bloc-depart'] = activeFlight.state?.['previ-bloc-depart'] || document.getElementById('previ-bloc-depart')?.querySelector('.display-input')?.value || '';
                newFlight.state['previ-fuel-depart'] = activeFlight.state?.['previ-fuel-depart'] || document.getElementById('previ-fuel-depart')?.querySelector('.display-input')?.value || '3500 kg';
            }
            dailyFlights.push(newFlight);
            activeFlightId = newFlight.id;
            persistFlights();
            loadActiveFlightState();
        });
    }

    if (closeFlightButton) {
        closeFlightButton.addEventListener('click', () => {
            updateActiveFlightStateFromDom();
            const activeFlight = dailyFlights.find(flight => flight.id === activeFlightId);
            if (!activeFlight) return;
            activeFlight.closed = !activeFlight.closed;
            if (activeFlight.state) {
                activeFlight.state.calculator_table_data = compactCalculatorTableData(activeFlight.state.calculator_table_data || []);
            }
            persistFlights();

            if (activeFlight.closed) {
                const allClosed = dailyFlights.every(flight => flight.closed);
                if (allClosed) {
                    const nextFlight = createEmptyFlight(dailyFlights.length + 1);
                    nextFlight.state['tmd'] = activeFlight.state?.['tmd'] || '21:30';
                    nextFlight.state['limite-hdv'] = activeFlight.state?.['limite-hdv'] || '08:00';
                    nextFlight.state['fuel-depart'] = activeFlight.state?.['fuel-depart'] || '3500 kg';
                    nextFlight.state['previ-bloc-depart'] = activeFlight.state?.['previ-bloc-depart'] || '';
                    nextFlight.state['previ-fuel-depart'] = activeFlight.state?.['previ-fuel-depart'] || '3500 kg';
                    dailyFlights.push(nextFlight);
                    activeFlightId = nextFlight.id;
                    persistFlights();
                    loadActiveFlightState();
                    return;
                }
            }

            loadActiveFlightState();
        });
    }

    if (deleteFlightButton) {
        deleteFlightButton.addEventListener('click', () => {
            if (!confirm('Supprimer ce vol ?')) return;
            dailyFlights = dailyFlights.filter(flight => flight.id !== activeFlightId);
            if (!dailyFlights.length) {
                dailyFlights = [createEmptyFlight(1)];
            }
            normalizeFlightNumbers();
            activeFlightId = dailyFlights[Math.min(dailyFlights.length - 1, 0)].id;
            persistFlights();
            loadActiveFlightState();
        });
    }


    if (exportBlocFuelPdfButton) {
        exportBlocFuelPdfButton.addEventListener('click', exportBlocFuelPdf);
    }

    resetButton.addEventListener('click', () => {
        if (confirm("Voulez-vous vraiment supprimer tous les vols et remettre le Bloc/Fuel à zéro ?")) {
            localStorage.removeItem('calculator_state');
            localStorage.removeItem(MULTI_FLIGHT_STORAGE_KEY);
            localStorage.removeItem(ACTIVE_FLIGHT_ID_STORAGE_KEY);
            dailyFlights = [createEmptyFlight(1)];
            activeFlightId = dailyFlights[0].id;
            persistFlights();
            loadCalculatorState();
            masterRecalculate();
        }
    });

    masterRecalculate = () => {
        if (!isApplyingFlightState && typeof updateDisplayedLimitHdvForActiveFlight === 'function') {
            updateDisplayedLimitHdvForActiveFlight();
        }
        recalculateBlocFuel();
        updatePreviTab();
        updateSuiviTab();
        updateCommuneGpsRouteDisplay();
        updateDeroutementTab();
        if (typeof updateFlightDurationSummary === 'function') updateFlightDurationSummary();
    };

    masterRecalculate();
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('calculator-modal')) {
        initializeCalculator();
    }
});
/*
 * v11.43 — reprise arrière-plan plus rapide.
 * Si iPadOS garde la page mais fige Leaflet, on évite une reconstruction lourde :
 * on invalide la taille de la carte et on redessine la couche active.
 */
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    setTimeout(() => {
        try {
            if (map) map.invalidateSize(false);
        } catch (_) {}

        try {
            notifyServiceWorkerActivePacks(activeOfflinePacks);
        } catch (_) {}

        try {
            if (baseTileLayer && typeof baseTileLayer.redraw === 'function') {
                baseTileLayer.redraw();
            }
        } catch (_) {}
    }, 200);
});



// v13.89 TEST — corrections d'affichage RLT/Suivi et alerte post-MAJ gérées par index.html/style.css.
