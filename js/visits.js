/**
 * visits.js
 * Stage 2A: visit database layer.
 *
 * Visits live in their own "visits" object store (added in DB version 2)
 * and are linked to a patient purely by patientId — patient records are
 * never modified to hold nested visit data.
 *
 * Scope for Stage 2A: create / read / list only. Editing, deletion, and
 * the full visit history UI belong to later stages.
 */

(function () {
'use strict';

const { dbAdd, dbGet, dbGetAllByIndex } = window.KnhosDB;

const VALID_DEPARTMENTS = ['Dental', 'Naturopathy'];

/**
 * Create a new visit for an existing patient.
 * Required: patientId, department, visitDate, visitTime
 * Optional: reason, notes
 *
 * Verifies the patient exists before creating anything, so an invalid
 * patientId can never result in an orphan visit record.
 */
async function createVisit({ patientId, department, visitDate, visitTime, reason, notes }) {
  if (!patientId || !String(patientId).trim()) {
    throw new Error('Patient ID is required.');
  }
  if (!department || !VALID_DEPARTMENTS.includes(department)) {
    throw new Error('Department is required and must be Dental or Naturopathy.');
  }
  if (!visitDate) {
    throw new Error('Visit date is required.');
  }
  if (!visitTime) {
    throw new Error('Visit time is required.');
  }

  // Verify the patient actually exists before creating a visit — never
  // allow an orphan visit record.
  const patient = await window.KnhosPatients.getPatient(patientId);
  if (!patient) {
    throw new Error(`Cannot create visit: no patient exists with ID "${patientId}".`);
  }

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

/** Fetch a single visit by its visitId. */
async function getVisit(visitId) {
  return dbGet('visits', visitId);
}

/**
 * List all visits belonging to a single patient, newest first
 * (by createdAt). Uses the "patientId" index so only that patient's
 * visits are ever retrieved — visits for other patients are never
 * fetched or filtered client-side.
 */
async function listVisitsForPatient(patientId) {
  const visits = await dbGetAllByIndex('visits', 'patientId', patientId);
  return visits.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

window.KnhosVisits = {
  createVisit,
  getVisit,
  listVisitsForPatient,
};
})();
