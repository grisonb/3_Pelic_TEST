/*
 * NPF-Q400 v13.46 TEST — rendu Leaflet local des PMTiles France Sud.
 * Aucun CDN. Lecture PMTiles depuis IndexedDB via NPFPMTilesLocal + rendu Canvas MVT simplifié.
 */
(function () {
    'use strict';

    const TILE_SIZE = 256;
    const PMTILES_HEADER_SIZE = 127;
    const COMPRESSION_UNKNOWN = 0;
    const COMPRESSION_NONE = 1;
    const COMPRESSION_GZIP = 2;
    const TILE_TYPE_MVT = 1;

    function readUint64(view, offset) {
        if (typeof view.getBigUint64 === 'function') {
            return Number(view.getBigUint64(offset, true));
        }
        const lo = view.getUint32(offset, true);
        const hi = view.getUint32(offset + 4, true);
        return hi * 4294967296 + lo;
    }

    async function decompressBuffer(buffer, compression) {
        if (!buffer || buffer.byteLength === 0) return buffer;
        if (compression === COMPRESSION_NONE || compression === COMPRESSION_UNKNOWN || !compression) return buffer;
        if (compression !== COMPRESSION_GZIP) {
            throw new Error(`Compression PMTiles non prise en charge: ${compression}`);
        }
        if (typeof DecompressionStream !== 'function') {
            throw new Error('Décompression gzip indisponible dans ce Safari/iPadOS.');
        }
        const ds = new DecompressionStream('gzip');
        const stream = new Blob([buffer]).stream().pipeThrough(ds);
        return await new Response(stream).arrayBuffer();
    }

    class VarintReader {
        constructor(buffer) {
            this.buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            this.pos = 0;
            this.len = this.buf.length;
            this.view = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
        }
        eof() { return this.pos >= this.len; }
        readVarint() {
            let val = 0;
            let shift = 0;
            while (this.pos < this.len) {
                const b = this.buf[this.pos++];
                if (shift < 28) {
                    val += (b & 0x7f) << shift;
                } else {
                    val += (b & 0x7f) * Math.pow(2, shift);
                }
                if ((b & 0x80) === 0) return val;
                shift += 7;
            }
            throw new Error('Varint incomplet.');
        }
        readSVarint() {
            const n = this.readVarint();
            return (n >> 1) ^ (-(n & 1));
        }
        readBytes(length) {
            const end = this.pos + length;
            if (end > this.len) throw new Error('Lecture hors limites.');
            const out = this.buf.subarray(this.pos, end);
            this.pos = end;
            return out;
        }
        readString(length) {
            const bytes = this.readBytes(length);
            if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
            let s = '';
            for (const b of bytes) s += String.fromCharCode(b);
            try { return decodeURIComponent(escape(s)); } catch (_) { return s; }
        }
        readFloat() {
            const v = this.view.getFloat32(this.pos, true);
            this.pos += 4;
            return v;
        }
        readDouble() {
            const v = this.view.getFloat64(this.pos, true);
            this.pos += 8;
            return v;
        }
        skip(wireType) {
            if (wireType === 0) { this.readVarint(); return; }
            if (wireType === 1) { this.pos += 8; return; }
            if (wireType === 2) { this.pos += this.readVarint(); return; }
            if (wireType === 5) { this.pos += 4; return; }
            throw new Error(`Type protobuf non pris en charge: ${wireType}`);
        }
    }

    function deserializeDirectory(buffer) {
        const p = new VarintReader(buffer);
        const numEntries = p.readVarint();
        const entries = new Array(numEntries);
        let lastId = 0;
        for (let i = 0; i < numEntries; i++) {
            lastId += p.readVarint();
            entries[i] = { tileId: lastId, runLength: 0, length: 0, offset: 0 };
        }
        for (let i = 0; i < numEntries; i++) entries[i].runLength = p.readVarint();
        for (let i = 0; i < numEntries; i++) entries[i].length = p.readVarint();
        for (let i = 0; i < numEntries; i++) {
            const offset = p.readVarint();
            if (offset === 0 && i > 0) {
                entries[i].offset = entries[i - 1].offset + entries[i - 1].length;
            } else {
                entries[i].offset = offset - 1;
            }
        }
        return entries;
    }

    function findEntry(entries, tileId) {
        let m = 0;
        let n = entries.length - 1;
        while (m <= n) {
            const k = (n + m) >> 1;
            const entry = entries[k];
            if (tileId < entry.tileId) {
                n = k - 1;
            } else if (tileId > entry.tileId + Math.max(0, entry.runLength) - 1) {
                m = k + 1;
            } else {
                return entry;
            }
        }
        return null;
    }

    function rotateHilbert(n, x, y, rx, ry) {
        if (ry === 0) {
            if (rx === 1) {
                x = n - 1 - x;
                y = n - 1 - y;
            }
            const t = x;
            x = y;
            y = t;
        }
        return [x, y];
    }

    function zxyToTileId(z, x, y) {
        let acc = 0;
        for (let i = 0; i < z; i++) acc += Math.pow(4, i);
        let n = 1 << z;
        let d = 0;
        for (let s = n >> 1; s > 0; s >>= 1) {
            const rx = (x & s) > 0 ? 1 : 0;
            const ry = (y & s) > 0 ? 1 : 0;
            d += s * s * ((3 * rx) ^ ry);
            const r = rotateHilbert(s, x, y, rx, ry);
            x = r[0];
            y = r[1];
        }
        return acc + d;
    }

    class LocalPMTilesArchive {
        constructor(source) {
            this.source = source;
            this.header = null;
            this.rootDirectory = null;
            this.leafCache = new Map();
        }
        async read(offset, length) {
            if (this.source && typeof this.source.readRange === 'function') return this.source.readRange(offset, length);
            if (this.source && typeof this.source.getBytes === 'function') {
                const res = await this.source.getBytes(offset, length);
                return res && res.data ? res.data : res;
            }
            throw new Error('Source PMTiles locale invalide.');
        }
        async getHeader() {
            if (this.header) return this.header;
            const buffer = await this.read(0, PMTILES_HEADER_SIZE);
            const bytes = new Uint8Array(buffer);
            const magic = String.fromCharCode.apply(null, Array.from(bytes.slice(0, 7)));
            if (magic !== 'PMTiles') throw new Error('Fichier PMTiles invalide: signature absente.');
            const view = new DataView(buffer);
            const header = {
                specVersion: view.getUint8(7),
                rootDirectoryOffset: readUint64(view, 8),
                rootDirectoryLength: readUint64(view, 16),
                jsonMetadataOffset: readUint64(view, 24),
                jsonMetadataLength: readUint64(view, 32),
                leafDirectoryOffset: readUint64(view, 40),
                leafDirectoryLength: readUint64(view, 48),
                tileDataOffset: readUint64(view, 56),
                tileDataLength: readUint64(view, 64),
                addressedTilesCount: readUint64(view, 72),
                tileEntriesCount: readUint64(view, 80),
                tileContentsCount: readUint64(view, 88),
                clustered: view.getUint8(96),
                internalCompression: view.getUint8(97),
                tileCompression: view.getUint8(98),
                tileType: view.getUint8(99),
                minZoom: view.getUint8(100),
                maxZoom: view.getUint8(101)
            };
            if (header.specVersion !== 3) throw new Error(`Version PMTiles non prise en charge: ${header.specVersion}.`);
            if (header.tileType !== TILE_TYPE_MVT) throw new Error(`Type de tuile PMTiles non pris en charge: ${header.tileType}.`);
            this.header = header;
            return header;
        }
        async getRootDirectory() {
            if (this.rootDirectory) return this.rootDirectory;
            const h = await this.getHeader();
            const buf = await this.read(h.rootDirectoryOffset, h.rootDirectoryLength);
            const dec = await decompressBuffer(buf, h.internalCompression);
            this.rootDirectory = deserializeDirectory(dec);
            return this.rootDirectory;
        }
        async getLeafDirectory(entry) {
            const key = `${entry.offset}:${entry.length}`;
            if (this.leafCache.has(key)) return this.leafCache.get(key);
            const h = await this.getHeader();
            const buf = await this.read(h.leafDirectoryOffset + entry.offset, entry.length);
            const dec = await decompressBuffer(buf, h.internalCompression);
            const dir = deserializeDirectory(dec);
            this.leafCache.set(key, dir);
            return dir;
        }
        async getTile(z, x, y) {
            const h = await this.getHeader();
            if (z < h.minZoom || z > h.maxZoom) return null;
            const tileId = zxyToTileId(z, x, y);
            const root = await this.getRootDirectory();
            let entry = findEntry(root, tileId);
            if (!entry) return null;
            if (entry.runLength === 0) {
                const leaf = await this.getLeafDirectory(entry);
                entry = findEntry(leaf, tileId);
                if (!entry || entry.runLength === 0) return null;
            }
            const raw = await this.read(h.tileDataOffset + entry.offset, entry.length);
            return decompressBuffer(raw, h.tileCompression);
        }
    }

    function readPackedVarints(bytes) {
        const p = new VarintReader(bytes);
        const out = [];
        while (!p.eof()) out.push(p.readVarint());
        return out;
    }

    function parseValue(bytes) {
        const p = new VarintReader(bytes);
        let value = null;
        while (!p.eof()) {
            const tag = p.readVarint();
            const field = tag >> 3;
            const wire = tag & 7;
            if (field === 1 && wire === 2) value = p.readString(p.readVarint());
            else if (field === 2 && wire === 5) value = p.readFloat();
            else if (field === 3 && wire === 1) value = p.readDouble();
            else if (field === 4 && wire === 0) value = p.readVarint();
            else if (field === 5 && wire === 0) value = p.readVarint();
            else if (field === 6 && wire === 0) value = p.readSVarint();
            else if (field === 7 && wire === 0) value = !!p.readVarint();
            else p.skip(wire);
        }
        return value;
    }

    function parseFeature(bytes) {
        const p = new VarintReader(bytes);
        const feature = { id: null, tags: [], type: 0, geometry: [] };
        while (!p.eof()) {
            const tag = p.readVarint();
            const field = tag >> 3;
            const wire = tag & 7;
            if (field === 1 && wire === 0) feature.id = p.readVarint();
            else if (field === 2 && wire === 2) feature.tags = readPackedVarints(p.readBytes(p.readVarint()));
            else if (field === 3 && wire === 0) feature.type = p.readVarint();
            else if (field === 4 && wire === 2) feature.geometry = readPackedVarints(p.readBytes(p.readVarint()));
            else p.skip(wire);
        }
        return feature;
    }

    function parseLayer(bytes) {
        const p = new VarintReader(bytes);
        const layer = { name: '', features: [], keys: [], values: [], extent: 4096, version: 2 };
        while (!p.eof()) {
            const tag = p.readVarint();
            const field = tag >> 3;
            const wire = tag & 7;
            if (field === 1 && wire === 2) layer.name = p.readString(p.readVarint());
            else if (field === 2 && wire === 2) layer.features.push(parseFeature(p.readBytes(p.readVarint())));
            else if (field === 3 && wire === 2) layer.keys.push(p.readString(p.readVarint()));
            else if (field === 4 && wire === 2) layer.values.push(parseValue(p.readBytes(p.readVarint())));
            else if (field === 5 && wire === 0) layer.extent = p.readVarint();
            else if (field === 15 && wire === 0) layer.version = p.readVarint();
            else p.skip(wire);
        }
        for (const feature of layer.features) {
            const props = {};
            for (let i = 0; i < feature.tags.length; i += 2) {
                const k = layer.keys[feature.tags[i]];
                if (k !== undefined) props[k] = layer.values[feature.tags[i + 1]];
            }
            feature.properties = props;
        }
        return layer;
    }

    function parseVectorTile(buffer) {
        const p = new VarintReader(buffer);
        const layers = [];
        while (!p.eof()) {
            const tag = p.readVarint();
            const field = tag >> 3;
            const wire = tag & 7;
            if (field === 3 && wire === 2) layers.push(parseLayer(p.readBytes(p.readVarint())));
            else p.skip(wire);
        }
        return layers;
    }

    function decodeGeometry(feature) {
        const geom = feature.geometry || [];
        const paths = [];
        let path = [];
        let x = 0;
        let y = 0;
        let i = 0;
        while (i < geom.length) {
            const cmd = geom[i++];
            const id = cmd & 7;
            const count = cmd >> 3;
            if (id === 1 || id === 2) {
                for (let c = 0; c < count; c++) {
                    x += (geom[i] >> 1) ^ (-(geom[i] & 1));
                    y += (geom[i + 1] >> 1) ^ (-(geom[i + 1] & 1));
                    i += 2;
                    if (id === 1) {
                        if (path.length) paths.push(path);
                        path = [[x, y]];
                    } else {
                        path.push([x, y]);
                    }
                }
            } else if (id === 7) {
                if (path.length) path.closed = true;
            } else {
                break;
            }
        }
        if (path.length) paths.push(path);
        return paths;
    }

    function propText(props, keys) {
        for (const k of keys) {
            const v = props && props[k];
            if (v !== undefined && v !== null && String(v).trim()) return String(v);
        }
        return '';
    }

    function getKind(feature) {
        const p = feature.properties || {};
        return String(p.kind || p.class || p.type || p.subclass || p.brunnel || '').toLowerCase();
    }

    function pathToCanvas(ctx, paths, extent, tileSize) {
        const scale = tileSize / extent;
        ctx.beginPath();
        for (const path of paths) {
            if (!path.length) continue;
            ctx.moveTo(path[0][0] * scale, path[0][1] * scale);
            for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0] * scale, path[i][1] * scale);
            if (path.closed) ctx.closePath();
        }
    }

    function styleForFill(layerName, kind) {
        if (/water|ocean|river|lake/.test(layerName) || /water|river|lake|reservoir|wetland/.test(kind)) return '#a9d9ee';
        if (/urban|built/.test(layerName) || /residential|commercial|industrial/.test(kind)) return '#ece7dc';
        if (/landuse|landcover|earth|park|forest|wood|natural/.test(layerName) || /forest|wood|park|grass|scrub|farmland|meadow/.test(kind)) return '#dfead7';
        if (/building/.test(layerName)) return null;
        return null;
    }

    function styleForLine(layerName, kind, zoom) {
        if (/boundary/.test(layerName)) return { color: '#b8a68a', width: zoom >= 9 ? 0.9 : 0.5, dash: [4, 3] };
        if (/water|river/.test(layerName) || /river|stream|canal/.test(kind)) return { color: '#7bbbd5', width: zoom >= 12 ? 1.2 : 0.8 };
        if (/road|transport|highway/.test(layerName) || /motorway|trunk|primary|secondary|tertiary|minor|service|street|path/.test(kind)) {
            if (/motorway|trunk/.test(kind)) return { color: '#d08b43', width: zoom >= 10 ? 2.2 : 1.5 };
            if (/primary|secondary/.test(kind)) return { color: '#d3a45f', width: zoom >= 10 ? 1.8 : 1.1 };
            if (/tertiary|minor|street/.test(kind)) return { color: '#cfc5ae', width: zoom >= 13 ? 1.0 : 0.55 };
            return { color: '#d6d0c4', width: zoom >= 13 ? 0.7 : 0.35 };
        }
        return null;
    }

    function rankPlace(kind) {
        if (/country|region|state|province/.test(kind)) return 0;
        if (/city|municipality/.test(kind)) return 1;
        if (/town/.test(kind)) return 2;
        if (/village/.test(kind)) return 3;
        if (/hamlet|locality|neighbourhood/.test(kind)) return 4;
        return 5;
    }

    function renderTileToCanvas(layers, canvas, coords) {
        const ctx = canvas.getContext('2d');
        const tileSize = canvas.width;
        ctx.clearRect(0, 0, tileSize, tileSize);
        ctx.fillStyle = '#f7f3e9';
        ctx.fillRect(0, 0, tileSize, tileSize);

        const labels = [];

        for (const layer of layers) {
            const layerName = String(layer.name || '').toLowerCase();
            if (/poi|shop|housenumber|address|transit|aerodrome_label/.test(layerName)) continue;
            for (const feature of layer.features) {
                const kind = getKind(feature);
                if (feature.type !== 3) continue;
                const fill = styleForFill(layerName, kind);
                if (!fill) continue;
                const paths = decodeGeometry(feature);
                pathToCanvas(ctx, paths, layer.extent, tileSize);
                ctx.fillStyle = fill;
                ctx.globalAlpha = /building/.test(layerName) ? 0.12 : 0.72;
                ctx.fill('evenodd');
                ctx.globalAlpha = 1;
            }
        }

        for (const layer of layers) {
            const layerName = String(layer.name || '').toLowerCase();
            for (const feature of layer.features) {
                const kind = getKind(feature);
                if (feature.type !== 2) continue;
                const st = styleForLine(layerName, kind, coords.z);
                if (!st) continue;
                const paths = decodeGeometry(feature);
                pathToCanvas(ctx, paths, layer.extent, tileSize);
                ctx.strokeStyle = st.color;
                ctx.lineWidth = Math.max(0.35, st.width);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                if (st.dash) ctx.setLineDash(st.dash); else ctx.setLineDash([]);
                ctx.globalAlpha = /boundary/.test(layerName) ? 0.75 : 1;
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }
        ctx.setLineDash([]);

        for (const layer of layers) {
            const layerName = String(layer.name || '').toLowerCase();
            if (!/place|label/.test(layerName)) continue;
            for (const feature of layer.features) {
                if (feature.type !== 1) continue;
                const name = propText(feature.properties, ['name:fr', 'name_fr', 'name', 'label']);
                if (!name) continue;
                const kind = getKind(feature);
                const rank = rankPlace(kind);
                if (coords.z < 8 && rank > 1) continue;
                if (coords.z < 10 && rank > 2) continue;
                if (coords.z < 12 && rank > 3) continue;
                const paths = decodeGeometry(feature);
                const p = paths[0] && paths[0][0];
                if (!p) continue;
                labels.push({ name, kind, rank, x: p[0] * tileSize / layer.extent, y: p[1] * tileSize / layer.extent });
            }
        }

        labels.sort((a, b) => a.rank - b.rank);
        const placed = [];
        for (const l of labels) {
            const size = l.rank <= 1 ? 13 : l.rank === 2 ? 12 : l.rank === 3 ? 11 : 10;
            ctx.font = `${l.rank <= 2 ? '600' : '500'} ${size}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
            const w = ctx.measureText(l.name).width;
            const h = size + 3;
            const box = { x1: l.x - w / 2 - 3, y1: l.y - h / 2, x2: l.x + w / 2 + 3, y2: l.y + h / 2 };
            if (placed.some(b => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2))) continue;
            placed.push(box);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.fillStyle = l.rank <= 2 ? '#33302b' : '#4d4942';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeText(l.name, l.x, l.y);
            ctx.fillText(l.name, l.x, l.y);
        }
    }

    function renderMessage(canvas, message, error) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = error ? '#fff1f1' : '#f7f3e9';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = error ? '#d36b6b' : '#e5dfd1';
        ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
        ctx.fillStyle = error ? '#9d1b1b' : '#746b5c';
        ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = String(message || '').split('\n').slice(0, 4);
        lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * 15));
    }

    const FranceSudPMTilesLayer = L.GridLayer.extend({
        initialize: function (options) {
            L.GridLayer.prototype.initialize.call(this, {
                tileSize: TILE_SIZE,
                updateWhenIdle: true,
                updateWhenZooming: false,
                keepBuffer: 2,
                noWrap: true,
                attribution: '© OpenStreetMap / Protomaps — PMTiles local',
                ...options
            });
            this._mapName = options && options.mapName ? options.mapName : 'france-sud';
            this._ready = false;
            this._archive = null;
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
                const source = window.NPFPMTilesLocal.createVirtualSource(this._mapName);
                this._archive = new LocalPMTilesArchive(source);
                await this._archive.getHeader();
                this._ready = true;
                return metadata;
            })();
            return this._initPromise;
        },
        createTile: function (coords, done) {
            const canvas = L.DomUtil.create('canvas', 'npf-pmtiles-vector-tile');
            const size = this.getTileSize();
            canvas.width = size.x;
            canvas.height = size.y;
            renderMessage(canvas, 'PMTiles\nchargement...', false);
            this._ensureReady().then(async () => {
                const data = await this._archive.getTile(coords.z, coords.x, coords.y);
                if (!data) {
                    renderMessage(canvas, '', false);
                } else {
                    const layers = parseVectorTile(data);
                    renderTileToCanvas(layers, canvas, coords);
                }
                if (done) done(null, canvas);
            }).catch((error) => {
                console.error('[PMTiles France Sud] tuile impossible:', coords, error);
                renderMessage(canvas, `PMTiles indisponible\nz${coords.z}/${coords.x}/${coords.y}\n${error.message || error}`, true);
                if (done) done(null, canvas);
            });
            return canvas;
        }
    });

    function createFranceSudLayer(options = {}) {
        return new FranceSudPMTilesLayer(options);
    }

    window.NPFLeafletPMTiles = {
        FranceSudPMTilesLayer,
        createFranceSudLayer,
        LocalPMTilesArchive
    };
})();
