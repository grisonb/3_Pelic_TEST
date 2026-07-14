/*
 * NPF-Q400 v13.45 TEST — couche Leaflet pour PMTiles France Sud.
 * Ce fichier ne charge aucun CDN. Il expose une couche Leaflet séparée du moteur raster ZIP.
 * Si un moteur vectoriel PMTiles/VectorGrid complet est ajouté localement plus tard, cette passerelle
 * est le point unique à remplacer sans toucher au stockage IndexedDB ni aux cartes raster.
 */
(function () {
    'use strict';

    const DEFAULT_TILE_SIZE = 256;

    function createFallbackTile(coords, done) {
        const tile = document.createElement('div');
        tile.className = 'npf-pmtiles-fallback-tile';
        tile.innerHTML = `France Sud<br>PMTiles<br>z${coords.z}/${coords.x}/${coords.y}`;
        if (done) requestAnimationFrame(() => done(null, tile));
        return tile;
    }

    const FranceSudPMTilesLayer = L.GridLayer.extend({
        initialize: function (options) {
            L.GridLayer.prototype.initialize.call(this, {
                tileSize: DEFAULT_TILE_SIZE,
                updateWhenIdle: true,
                updateWhenZooming: false,
                keepBuffer: 3,
                noWrap: true,
                attribution: '© OpenStreetMap / Protomaps — PMTiles local',
                ...options
            });
            this._mapName = options && options.mapName ? options.mapName : 'france-sud';
            this._maxZoom = options && Number.isFinite(options.maxZoom) ? options.maxZoom : 14;
            this._ready = false;
            this._source = null;
            this._initPromise = null;
        },

        onAdd: function (map) {
            L.GridLayer.prototype.onAdd.call(this, map);
            this._ensureReady().catch((error) => {
                console.error('[PMTiles France Sud] initialisation impossible:', error);
                this.fire('tileerror', { error });
            });
        },

        _ensureReady: function () {
            if (this._initPromise) return this._initPromise;
            this._initPromise = (async () => {
                if (!window.NPFPMTilesLocal) throw new Error('Module NPFPMTilesLocal absent.');
                const metadata = await window.NPFPMTilesLocal.getMetadata(this._mapName);
                if (!metadata || !metadata.installed) throw new Error('Carte PMTiles France Sud non installée.');
                this._source = window.NPFPMTilesLocal.createVirtualSource(this._mapName);
                this._ready = true;
                return metadata;
            })();
            return this._initPromise;
        },

        createTile: function (coords, done) {
            // Couche technique Leaflet. La v13.45 installe et active la source PMTiles locale
            // sans CDN et sans impacter les couches opérationnelles. Le rendu vectoriel complet
            // doit rester concentré ici pour ne pas fragiliser le moteur NPF-Q400.
            this._ensureReady().then(() => {
                const tile = createFallbackTile(coords, done);
                tile.dataset.pmtilesMap = this._mapName;
                return tile;
            }).catch((error) => {
                const tile = createFallbackTile(coords, done);
                tile.classList.add('npf-pmtiles-error-tile');
                tile.title = error.message || String(error);
                return tile;
            });
            return createFallbackTile(coords, done);
        }
    });

    function createFranceSudLayer(options = {}) {
        return new FranceSudPMTilesLayer(options);
    }

    window.NPFLeafletPMTiles = {
        FranceSudPMTilesLayer,
        createFranceSudLayer
    };
})();
