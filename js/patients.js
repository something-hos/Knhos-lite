(function() {
  async function createPatient(data) {
    const patientId = await window.KnhosIdGen.getNextId('pat');
    const patient = { patientId, ...data, createdAt: new Date().toISOString() };
    await window.KnhosDB.dbAdd('patients', patient);
    return patient;
  }
  async function getPatient(id) { return window.KnhosDB.dbGet('patients', id); }
  async function listPatients() { return window.KnhosDB.dbGetAll('patients'); }
  window.KnhosPatients = { createPatient, getPatient, listPatients };
})();
