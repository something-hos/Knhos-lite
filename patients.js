/**
 * patients.js
 * Patient registration, listing, search, and duplicate detection.
 * Stage 1 scope only — no visits/consents/signatures here yet.
 */

(function () {
'use strict';

const { dbAdd, dbGet, dbGetAll } = window.KnhosDB;

/**
 * Normalize a name for comparison/search (lowercase, collapsed whitespace).
 */
function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Normalize a phone number for comparison (digits only).
 */
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Check existing patients for likely duplicates of the given (unsaved) data.
 * Matching rules (per spec section 5):
 *  - same phone number (non-empty)
 *  - same name + DOB
 * Returns an array of matching patient records (may be empty).
 */
async function findPossibleDuplicates({ fullName, dob, phone }) {
  const all = await dbGetAll('patients');
  const normName = normalizeName(fullName);
  const normPhone = normalizePhone(phone);

  return all.filter((p) => {
    const phoneMatch = normPhone && normalizePhone(p.phone) === normPhone;
    const nameDobMatch = normalizeName(p.fullName) === normName && p.dob === dob;
    return phoneMatch || nameDobMatch;
  });
}

/**
 * Register a new patient. Does NOT perform duplicate checking itself —
 * callers (UI layer) should call findPossibleDuplicates first, warn the
 * user, and only call this once the user has confirmed they want to
 * proceed with a new record.
 *
 * Required: fullName, dob, gender
 * Optional: phone, address
 */
async function createPatient({ fullName, dob, gender, phone, address }) {
  if (!fullName || !fullName.trim()) throw new Error('Full name is required.');
  if (!dob) throw new Error('Date of birth is required.');
  if (!gender) throw new Error('Gender is required.');

  const patientId = await window.KnhosIdGen.getNextId('patient');
  const record = {
    patientId,
    fullName: fullName.trim(),
    fullNameLower: normalizeName(fullName),
    dob,
    gender,
    phone: phone ? phone.trim() : '',
    address: address ? address.trim() : '',
    createdAt: new Date().toISOString(),
  };

  await dbAdd('patients', record);
  return record;
}

/** Fetch a single patient by ID. */
async function getPatient(patientId) {
  return dbGet('patients', patientId);
}

/** Fetch all patients, most recently created first. */
async function listPatients() {
  const all = await dbGetAll('patients');
  return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * Search patients by ID, name (partial, case-insensitive), or phone
 * (partial match on digits).
 */
async function searchPatients(query) {
  const q = String(query || '').trim();
  if (!q) return listPatients();

  const all = await dbGetAll('patients');
  const qLower = q.toLowerCase();
  const qDigits = normalizePhone(q);

  return all
    .filter((p) => {
      const idMatch = p.patientId.toLowerCase().includes(qLower);
      const nameMatch = p.fullNameLower.includes(qLower);
      const phoneMatch = qDigits && normalizePhone(p.phone).includes(qDigits);
      return idMatch || nameMatch || phoneMatch;
    })
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

window.KnhosPatients = {
  findPossibleDuplicates,
  createPatient,
  getPatient,
  listPatients,
  searchPatients,
};
})();
