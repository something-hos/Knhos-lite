(function() {
  const DB_NAME = 'KNHOSLiteDB';
  const DB_VERSION = 1;
  const OBJECT_STORE_NAMES = ['patients', 'visits', 'consents', 'counters'];
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

  // --- v1.0: Data Backup & Restore ---
  // Reads every record out of every object store and packages them into a
  // single JSON-serialisable object. Kept schema-driven off OBJECT_STORE_NAMES
  // so it automatically covers patients, visits, consents, and counters.
  async function exportDatabase() {
    const stores = {};
    for (const storeName of OBJECT_STORE_NAMES) {
      stores[storeName] = await runTx(storeName, 'readonly', (s) => s.getAll());
    }
    return {
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      exportedAt: new Date().toISOString(),
      stores
    };
  }
  // Wipes every object store and repopulates it from a payload produced by
  // exportDatabase(). Runs as a single readwrite transaction across all
  // stores so the clear+repopulate is atomic — if anything fails, none of
  // the stores are left partially overwritten.
  function importDatabase(jsonData) {
    const stores = (jsonData && jsonData.stores) ? jsonData.stores : (jsonData || {});
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(OBJECT_STORE_NAMES, 'readwrite');
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Restore transaction aborted'));
      OBJECT_STORE_NAMES.forEach((storeName) => {
        const store = tx.objectStore(storeName);
        store.clear();
        const records = Array.isArray(stores[storeName]) ? stores[storeName] : [];
        records.forEach((record) => store.put(record));
      });
    }));
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
    },
    exportDatabase,
    importDatabase
  };
})();
