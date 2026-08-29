(function() {
  async function createConsent(data) {
    const consentId = await window.KnhosIdGen.getNextId('con');
    const record = { consentId, ...data, createdAt: new Date().toISOString() };
    await window.KnhosDB.dbAdd('consents', record);
    return record;
  }
  async function listConsentsForPatient(patientId) {
    return window.KnhosDB.dbGetAllByIndex('consents', 'patientId', patientId);
  }
  window.KnhosConsents = { createConsent, listConsentsForPatient };
})();


