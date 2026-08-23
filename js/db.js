/**
 * db.js
 * IndexedDB initialization and low-level generic helpers.
 *
 * Stage 1 scope: only the "patients" store and the "counters" store
 * (counters back automatic ID generation and are never exported as
 * patient data). Additional stores (visits, consents, signatures, etc.)
 * will be added in later stages via a DB version bump.
 */

(function () {
'use strict';

const KNHOS_DB_NAME = 'knhos_lite';
const KNHOS_DB_VERSION = 1;

let dbInstance = null;

/**
 * Open (or create/upgrade) the KNHOS Lite database.
 * Returns a Promise<IDBDatabase>.
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(KNHOS_DB_NAME, KNHOS_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // --- patients store ---
      if (!db.objectStoreNames.contains('patients')) {
        const patientStore = db.createObjectStore('patients', { keyPath: 'patientId' });
        patientStore.createIndex('name', 'fullNameLower', { unique: false });
        patientStore.createIndex('phone', 'phone', { unique: false });
        patientStore.createIndex('dob', 'dob', { unique: false });
        patientStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // --- counters store (internal use only; never exported) ---
      if (!db.objectStoreNames.contains('counters')) {
        db.createObjectStore('counters', { keyPath: 'name' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Run a transaction against one or more stores.
 * @param {string|string[]} storeNames
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => void} work - synchronous work using tx.objectStore(...)
 * @returns {Promise<void>} resolves when the transaction completes
 */
async function withTransaction(storeNames, mode, work) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    try {
      result = work(tx);
    } catch (err) {
      reject(err);
    }
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Add a new record. Rejects if the key already exists. */
async function dbAdd(storeName, record) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Put (insert or overwrite) a record. Used sparingly; consent/signature
 * records must never use this to overwrite history — see consents.js
 * in later stages. */
async function dbPut(storeName, record) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Get a single record by primary key. */
async function dbGet(storeName, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/** Get all records in a store. */
async function dbGetAll(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** Get all records matching an index value. */
async function dbGetAllByIndex(storeName, indexName, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

window.KnhosDB = {
  openDatabase,
  withTransaction,
  dbAdd,
  dbPut,
  dbGet,
  dbGetAll,
  dbGetAllByIndex,
};
})();
