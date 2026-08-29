(function() {
  const DB_NAME = 'KNHOSLiteDB';
  const DB_VERSION = 1;
  let dbPromise = null;
  function openDatabase() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('patients')) db.createObjectStore('patients', { keyPath: 'patientId' });
          if (!db.objectStoreNames.contains('visits')) {
            const vs = db.createObjectStore('visits', { keyPath: 'visitId' });
            vs.createIndex('patientId', 'patientId', { unique: false });
          }
          if (!db.objectStoreNames.contains('consents')) {
            const cs = db.createObjectStore('consents', { keyPath: 'consentId' });
            cs.createIndex('patientId', 'patientId', { unique: false });
          }
          if (!db.objectStoreNames.contains('counters')) db.createObjectStore('counters', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function runTx(storeName, mode, callback) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = callback(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  window.KnhosDB = {
    openDatabase,
    dbGet: (store, key) => runTx(store, 'readonly', s => s.get(key)),
    dbPut: (store, val) => runTx(store, 'readwrite', s => s.put(val)),
    dbAdd: (store, val) => runTx(store, 'readwrite', s => s.add(val)),
    dbGetAll: (store) => runTx(store, 'readonly', s => s.getAll()),
    dbGetAllByIndex: async (store, index, key) => {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).index(index).getAll(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
  };
})();

