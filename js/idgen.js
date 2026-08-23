/**
 * idgen.js
 * Sequential, zero-padded ID generation backed by the "counters" store.
 * Counter values persist in IndexedDB, so they survive reloads and
 * browser restarts.
 *
 * Stage 1 only needs the "patient" counter (TMP-000001, TMP-000002, ...).
 * Future stages will call getNextId('visit'), getNextId('consent'),
 * getNextId('signature') using the same mechanism.
 */

(function () {
'use strict';

const ID_PREFIXES = {
  patient: 'TMP',
  visit: 'VIS',
  consent: 'CON',
  signature: 'SIG',
};

const ID_PAD_LENGTH = 6;

/**
 * Atomically increments the named counter and returns the new numeric value.
 * Uses a single readwrite transaction on the counters store so the
 * read-modify-write is atomic even if called in quick succession.
 */
async function nextCounterValue(counterName) {
  const db = await window.KnhosDB.openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('counters', 'readwrite');
    const store = tx.objectStore('counters');
    const getReq = store.get(counterName);

    getReq.onsuccess = () => {
      const current = getReq.result ? getReq.result.lastValue : 0;
      const next = current + 1;
      const putReq = store.put({ name: counterName, lastValue: next });
      putReq.onsuccess = () => {
        // resolved on tx.oncomplete below
      };
      putReq.onerror = () => reject(putReq.error);
      tx._nextValue = next;
    };
    getReq.onerror = () => reject(getReq.error);

    tx.oncomplete = () => resolve(tx._nextValue);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Counter transaction aborted'));
  });
}

/**
 * Generates the next formatted ID for the given entity type, e.g.
 * getNextId('patient') -> "TMP-000001"
 */
async function getNextId(entityType) {
  const prefix = ID_PREFIXES[entityType];
  if (!prefix) {
    throw new Error(`Unknown ID entity type: ${entityType}`);
  }
  const value = await nextCounterValue(entityType);
  const padded = String(value).padStart(ID_PAD_LENGTH, '0');
  return `${prefix}-${padded}`;
}

window.KnhosIdGen = {
  getNextId,
};
})();
