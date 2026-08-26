/**
 * visits.js
 * Stage 4: visit database layer (Create, Read, Update).
 */
(function () {
'use strict';

const { dbAdd, dbGet, dbGetAllByIndex, dbPut } = window.KnhosDB;
const VALID_DEPARTMENTS = ['Dental', 'Naturopathy'];

async function createVisit({ patientId, department, visitDate, visitTime, reason, notes }) {
  if (!patientId) throw new Error('Patient ID is required.');
  if (!department || !VALID_DEPARTMENTS.includes(department)) {
    throw new Error('Department is required and must be Dental or Naturopathy.');
  }

  const patient = await window.KnhosPatients.getPatient(patientId);
  if (!patient) throw new Error(`Cannot create visit: no patient exists.`);

  const visitId = await window.KnhosIdGen.getNextId('visit');
  const record = {
    visitId,
    patientId,
    department,
    visitDate,
    visitTime,
    reason: reason ? String(reason).trim() : '',
    notes: notes ? String(notes).trim() : '',
    createdAt: new Date().toISOString(),
  };

  await dbAdd('visits', record);
  return record;
}

async function getVisit(visitId) {
  return dbGet('visits', visitId);
}

// Allows doctors to save clinical data to the visit
async function updateVisit(visit) {
  if (!visit.visitId) throw new Error('Visit ID is required for update.');
  await dbPut('visits', visit);
  return visit;
}

async function listVisitsForPatient(patientId) {
  const visits = await dbGetAllByIndex('visits', 'patientId', patientId);
  return visits.sort((a, b) => {
    const byCreatedAt = (b.createdAt || '').localeCompare(a.createdAt || '');
    if (byCreatedAt !== 0) return byCreatedAt;
    return (b.visitId || '').localeCompare(a.visitId || '');
  });
}

window.KnhosVisits = {
  createVisit,
  getVisit,
  updateVisit,
  listVisitsForPatient,
};
})();
