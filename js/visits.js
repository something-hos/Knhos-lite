(function () {
'use strict';
const { dbAdd, dbGet, dbGetAll, dbGetAllByIndex, dbPut } = window.KnhosDB;

async function createVisit({ patientId, department, visitDate, reason }) {
  const visitId = await window.KnhosIdGen.getNextId('visit');
  const record = { 
    visitId, 
    patientId, 
    department, 
    visitDate, 
    reason: reason || '', 
    status: 'waiting', 
    createdAt: new Date().toISOString() 
  };
  await dbAdd('visits', record);
  return record;
}

async function getVisit(visitId) { return dbGet('visits', visitId); }
async function updateVisit(visit) { await dbPut('visits', visit); return visit; }
async function listVisitsForPatient(patientId) {
  const visits = await dbGetAllByIndex('visits', 'patientId', patientId);
  return visits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// STEP 1: Queue helper
async function getWaitingVisits() {
  const all = await dbGetAll('visits');
  return all.filter(v => v.status === 'waiting').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

window.KnhosVisits = { createVisit, getVisit, updateVisit, listVisitsForPatient, getWaitingVisits };
})();
