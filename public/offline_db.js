(function () {
'use strict';

const DB_NAME = 'almoraqebpro_offline';
const DB_VERSION = 1;

const STORES = {
    meta: 'meta',
    auth: 'auth',
    employees: 'employees',
    locations: 'locations',
    shifts: 'shifts',
    salaries: 'salaries',
    loans: 'loans',
    attendance: 'attendance',
    serviceRequests: 'serviceRequests',
    evaluations: 'evaluations',
    supportRequests: 'supportRequests',
    syncQueue: 'syncQueue'
};

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () =>
            reject(request.error);

        request.onsuccess = () =>
            resolve(request.result);

        request.onupgradeneeded = event => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(STORES.meta)) {
                db.createObjectStore(STORES.meta, { keyPath: 'key' });
            }

            if (!db.objectStoreNames.contains(STORES.auth)) {
                db.createObjectStore(STORES.auth, { keyPath: 'companyId' });
            }

            [
                STORES.employees,
                STORES.locations,
                STORES.shifts,
                STORES.salaries,
                STORES.loans,
                STORES.attendance,
                STORES.serviceRequests,
                STORES.evaluations,
                STORES.supportRequests
            ].forEach(storeName => {
                if (!db.objectStoreNames.contains(storeName)) {
                    const store = db.createObjectStore(
                        storeName,
                        { keyPath: '_offlineKey' }
                    );

                    store.createIndex(
                        'companyId',
                        'companyId',
                        { unique: false }
                    );
                }
            });

            if (!db.objectStoreNames.contains(STORES.syncQueue)) {
                const queue = db.createObjectStore(
                    STORES.syncQueue,
                    {
                        keyPath: 'id',
                        autoIncrement: true
                    }
                );

                queue.createIndex(
                    'companyId',
                    'companyId',
                    { unique: false }
                );

                queue.createIndex(
                    'status',
                    'status',
                    { unique: false }
                );
            }
        };
    });
}

async function tx(storeName, mode, callback) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction =
            db.transaction(storeName, mode);

        const store =
            transaction.objectStore(storeName);

        let result;

        try {
            result = callback(store);
        } catch (err) {
            reject(err);
            return;
        }

        transaction.oncomplete = () =>
            resolve(result);

        transaction.onerror = () =>
            reject(transaction.error);

        transaction.onabort = () =>
            reject(transaction.error);
    });
}

function requestPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () =>
            resolve(request.result);

        request.onerror = () =>
            reject(request.error);
    });
}

async function setMeta(key, value) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction =
            db.transaction(STORES.meta, 'readwrite');

        transaction
            .objectStore(STORES.meta)
            .put({ key, value, updatedAt: new Date().toISOString() });

        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
}

async function getMeta(key) {
    const db = await openDB();
    const transaction =
        db.transaction(STORES.meta, 'readonly');

    const result = await requestPromise(
        transaction
            .objectStore(STORES.meta)
            .get(key)
    );

    return result ? result.value : null;
}

function makeKey(companyId, value) {
    return String(companyId || '') +
        ':' +
        String(
            value?._id ||
            value?.id ||
            value?.calculationKey ||
            crypto.randomUUID()
        );
}

async function replaceCompanyData(storeName, companyId, records) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction =
            db.transaction(storeName, 'readwrite');

        const store =
            transaction.objectStore(storeName);

        const index =
            store.index('companyId');

        const range =
            IDBKeyRange.only(String(companyId));

        const cursor =
            index.openCursor(range);

        cursor.onsuccess = event => {
            const current =
                event.target.result;

            if (current) {
                current.delete();
                current.continue();
                return;
            }

            for (const row of records || []) {
                store.put({
                    ...row,
                    companyId:
                        String(
                            row.companyId ||
                            companyId
                        ),
                    _offlineKey:
                        makeKey(companyId, row),
                    _cachedAt:
                        new Date().toISOString()
                });
            }
        };

        cursor.onerror = () =>
            reject(cursor.error);

        transaction.oncomplete = resolve;
        transaction.onerror = () =>
            reject(transaction.error);
    });
}

async function getCompanyData(storeName, companyId) {
    const db = await openDB();

    const transaction =
        db.transaction(storeName, 'readonly');

    const index =
        transaction
            .objectStore(storeName)
            .index('companyId');

    return requestPromise(
        index.getAll(
            IDBKeyRange.only(
                String(companyId)
            )
        )
    );
}

async function putRecord(storeName, companyId, record) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction =
            db.transaction(storeName, 'readwrite');

        transaction
            .objectStore(storeName)
            .put({
                ...record,
                companyId:
                    String(
                        record.companyId ||
                        companyId
                    ),
                _offlineKey:
                    record._offlineKey ||
                    makeKey(companyId, record),
                _cachedAt:
                    new Date().toISOString()
            });

        transaction.oncomplete = resolve;
        transaction.onerror = () =>
            reject(transaction.error);
    });
}

async function queueOperation(operation) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction =
            db.transaction(STORES.syncQueue, 'readwrite');

        const request =
            transaction
                .objectStore(STORES.syncQueue)
                .add({
                    companyId:
                        String(operation.companyId || ''),
                    method:
                        operation.method || 'POST',
                    path:
                        operation.path || '',
                    body:
                        operation.body ?? null,
                    status:
                        'pending',
                    attempts:
                        0,
                    createdAt:
                        new Date().toISOString(),
                    lastError:
                        ''
                });

        request.onsuccess = () =>
            resolve(request.result);

        request.onerror = () =>
            reject(request.error);
    });
}

async function getPendingOperations(companyId) {
    const db = await openDB();

    const transaction =
        db.transaction(STORES.syncQueue, 'readonly');

    const store =
        transaction.objectStore(STORES.syncQueue);

    const all =
        await requestPromise(store.getAll());

    return all.filter(item =>
        item.status === 'pending' &&
        (
            !companyId ||
            String(item.companyId) === String(companyId)
        )
    );
}

async function deleteQueuedOperation(id) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction =
            db.transaction(STORES.syncQueue, 'readwrite');

        transaction
            .objectStore(STORES.syncQueue)
            .delete(id);

        transaction.oncomplete = resolve;
        transaction.onerror = () =>
            reject(transaction.error);
    });
}

async function updateQueuedOperation(item) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction =
            db.transaction(STORES.syncQueue, 'readwrite');

        transaction
            .objectStore(STORES.syncQueue)
            .put(item);

        transaction.oncomplete = resolve;
        transaction.onerror = () =>
            reject(transaction.error);
    });
}


async function cleanupSystem(options = {}) {

    const companyId =
        String(options.companyId || '');

    const syncedOlderThanDays =
        Number(options.syncedOlderThanDays || 30);

    const clearCache =
        options.clearCache === true;

    const cutoff =
        Date.now() -
        (
            syncedOlderThanDays *
            24 * 60 * 60 * 1000
        );

    let removedQueueItems = 0;
    let removedCacheItems = 0;

    /*
     * حذف العمليات التي انتهت مزامنتها فقط.
     * العمليات pending لا تُحذف إطلاقاً.
     */
    const db = await openDB();

    await new Promise((resolve, reject) => {

        const transaction =
            db.transaction(
                STORES.syncQueue,
                'readwrite'
            );

        const store =
            transaction.objectStore(
                STORES.syncQueue
            );

        const cursor =
            store.openCursor();

        cursor.onsuccess = event => {

            const current =
                event.target.result;

            if (!current)
                return;

            const row =
                current.value;

            const rowDate =
                new Date(
                    row.syncedAt ||
                    row.createdAt ||
                    0
                ).getTime();

            const sameCompany =
                !companyId ||
                String(row.companyId) ===
                companyId;

            if (
                sameCompany &&
                row.status === 'synced' &&
                rowDate < cutoff
            ) {
                current.delete();
                removedQueueItems++;
            }

            current.continue();
        };

        cursor.onerror = () =>
            reject(cursor.error);

        transaction.oncomplete =
            resolve;

        transaction.onerror = () =>
            reject(transaction.error);
    });

    /*
     * تنظيف Cache Storage الخاص بالصفحات والملفات.
     * لا يمس IndexedDB الأساسية.
     */
    if (
        clearCache &&
        'caches' in window
    ) {

        const keys =
            await caches.keys();

        for (const key of keys) {

            if (
                key.startsWith(
                    'almoraqebpro-'
                )
            ) {
                const deleted =
                    await caches.delete(key);

                if (deleted)
                    removedCacheItems++;
            }
        }
    }

    /*
     * حذف metadata المؤقت فقط.
     */
    await setMeta(
        'lastCleanupAt',
        new Date().toISOString()
    );

    return {
        success: true,
        removedQueueItems,
        removedCacheItems,
        cleanedAt:
            new Date().toISOString()
    };
}

window.AlMoraqebOfflineDB = {
    STORES,
    openDB,
    setMeta,
    getMeta,
    replaceCompanyData,
    getCompanyData,
    putRecord,
    queueOperation,
    getPendingOperations,
    deleteQueuedOperation,
    updateQueuedOperation,
    cleanupSystem
};

})();
