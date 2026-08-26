/**
 * db.js
 * IndexedDB initialization and low-level generic helpers.
 */

(function () {
'use strict';

const KNHOS_DB_NAME = 'knhos_lite';
const KNHOS_DB_VERSION = 3;

let dbInstance = null;

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

      // --- visits store (added in DB version 2 / Stage 2A) ---
      if (!db.objectStoreNames.contains('visits')) {
        const visitStore = db.createObjectStore('visits', { keyPath: 'visitId' });
        visitStore.createIndex('patientId', 'patientId', { unique: false });
        visitStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // --- consents store (added in DB version 3 / Stage 3) ---
      if (!db.objectStoreNames.contains('consents')) {
        const consentStore = db.createObjectStore('consents', { keyPath: 'consentId' });
        consentStore.createIndex('patientId', 'patientId', { unique: false });
        consentStore.createIndex('createdAt', 'createdAt', { unique: false });
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
