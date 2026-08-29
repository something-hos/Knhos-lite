(function() {
  async function getNextId(prefix) {
    const db = await window.KnhosDB.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('counters', 'readwrite');
      const store = tx.objectStore('counters');
      const req = store.get(prefix);
      req.onsuccess = () => {
        let count = req.result ? req.result.seq + 1 : 1;
        store.put({ id: prefix, seq: count });
        resolve(`${prefix.toUpperCase()}-${String(count).padStart(5, '0')}`);
      };
      req.onerror = () => reject(req.error);
    });
  }
  window.KnhosIdGen = { getNextId };
})();

