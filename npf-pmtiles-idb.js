/*
 * NPF-Q400 v13.48 TEST — stockage IndexedDB des blocs PMTiles.
 * Objectif : conserver les blocs dans IndexedDB, séparément de OfflineTilesDB_v12_21.
 * Aucun bloc PMTiles n'est stocké dans localStorage ni dans le Cache Storage du service worker.
 */
(function () {
    'use strict';

    const DB_NAME = 'NPF_PMTiles_DB';
    const DB_VERSION = 1;
    const PARTS_STORE = 'pmtilesParts';
    const METADATA_STORE = 'pmtilesMetadata';

    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(PARTS_STORE)) {
                    const store = db.createObjectStore(PARTS_STORE, { keyPath: 'id' });
                    store.createIndex('mapName', 'mapName', { unique: false });
                    store.createIndex('mapNameNumber', ['mapName', 'number'], { unique: true });
                }
                if (!db.objectStoreNames.contains(METADATA_STORE)) {
                    db.createObjectStore(METADATA_STORE, { keyPath: 'mapName' });
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => {
                    try { db.close(); } catch (_) {}
                    dbPromise = null;
                };
                resolve(db);
            };
            request.onerror = () => reject(request.error || new Error('Ouverture IndexedDB PMTiles impossible.'));
            request.onblocked = () => reject(new Error('IndexedDB PMTiles bloquée par un autre onglet ou une ancienne instance PWA.'));
        });
        return dbPromise;
    }

    function txDone(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('Transaction IndexedDB PMTiles en erreur.'));
            tx.onabort = () => reject(tx.error || new Error('Transaction IndexedDB PMTiles annulée.'));
        });
    }

    async function get(storeName, key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const request = tx.objectStore(storeName).get(key);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error('Lecture IndexedDB PMTiles impossible.'));
        });
    }

    async function put(storeName, value) {
        const db = await openDB();
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value);
        await txDone(tx);
        return value;
    }

    function partId(mapName, number) {
        return `${mapName}:${Number(number)}`;
    }

    async function getMetadata(mapName) {
        return get(METADATA_STORE, mapName);
    }

    async function putMetadata(mapName, metadata) {
        return put(METADATA_STORE, { ...metadata, mapName });
    }

    async function getPart(mapName, number) {
        return get(PARTS_STORE, partId(mapName, number));
    }

    async function putPart(mapName, part) {
        const record = {
            ...part,
            id: partId(mapName, part.number),
            mapName,
            number: Number(part.number),
            validated: part.validated === true
        };
        return put(PARTS_STORE, record);
    }

    async function listParts(mapName) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PARTS_STORE, 'readonly');
            const store = tx.objectStore(PARTS_STORE);
            const index = store.index('mapName');
            const req = index.getAll(IDBKeyRange.only(mapName));
            req.onsuccess = () => resolve((req.result || []).sort((a, b) => Number(a.number) - Number(b.number)));
            req.onerror = () => reject(req.error || new Error('Liste des blocs PMTiles impossible.'));
        });
    }

    async function getDownloadedBytes(mapName) {
        const parts = await listParts(mapName);
        return parts.filter(p => p && p.validated === true).reduce((sum, p) => sum + (Number(p.size) || 0), 0);
    }

    async function deleteMap(mapName) {
        const db = await openDB();
        const tx = db.transaction([PARTS_STORE, METADATA_STORE], 'readwrite');
        const partsStore = tx.objectStore(PARTS_STORE);
        const index = partsStore.index('mapName');
        const cursorReq = index.openCursor(IDBKeyRange.only(mapName));
        cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        tx.objectStore(METADATA_STORE).delete(mapName);
        await txDone(tx);
    }

    async function sha256Hex(buffer) {
        const hash = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function readRange(mapName, offset, length) {
        const metadata = await getMetadata(mapName);
        if (!metadata || !metadata.manifest || !Array.isArray(metadata.manifest.parts)) {
            throw new Error('Carte PMTiles non installée ou manifeste absent.');
        }
        const start = Number(offset);
        const end = start + Number(length);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
            throw new Error('Plage PMTiles invalide.');
        }
        const output = new Uint8Array(length);
        let outOffset = 0;
        for (const part of metadata.manifest.parts) {
            const partStart = Number(part.offset || 0);
            const partEnd = partStart + Number(part.size || 0);
            if (partEnd <= start || partStart >= end) continue;
            const sliceStart = Math.max(start, partStart) - partStart;
            const sliceEnd = Math.min(end, partEnd) - partStart;
            const record = await getPart(mapName, part.number);
            if (!record || record.validated !== true || !record.data) {
                throw new Error(`Bloc PMTiles manquant ou invalide : ${part.number}.`);
            }
            const blob = record.data instanceof Blob ? record.data : new Blob([record.data], { type: 'application/octet-stream' });
            const chunkBuffer = await blob.slice(sliceStart, sliceEnd).arrayBuffer();
            output.set(new Uint8Array(chunkBuffer), outOffset);
            outOffset += chunkBuffer.byteLength;
        }
        if (outOffset !== length) {
            throw new Error('Lecture PMTiles incomplète : plage à cheval sur un bloc manquant.');
        }
        return output.buffer;
    }

    function createVirtualSource(mapName) {
        return {
            getKey: () => `indexeddb://${DB_NAME}/${mapName}`,
            getBytes: async (offset, length) => ({ data: await readRange(mapName, offset, length) }),
            readRange: (offset, length) => readRange(mapName, offset, length)
        };
    }

    window.NPFPMTilesLocal = {
        DB_NAME,
        PARTS_STORE,
        METADATA_STORE,
        openDB,
        getMetadata,
        putMetadata,
        getPart,
        putPart,
        listParts,
        getDownloadedBytes,
        deleteMap,
        sha256Hex,
        readRange,
        createVirtualSource
    };
})();
