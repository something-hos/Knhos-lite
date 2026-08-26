/**
 * consents.js
 * Stage 3: E-Signature and Consent database layer.
 */
(function () {
'use strict';

const { dbAdd, dbGetAllByIndex } = window.KnhosDB;

async function createConsent({ patientId, type, text, signatureData }) {
  if (!patientId) throw new Error('Patient ID is required.');
  if (!signatureData) throw new Error('Signature is required.');

  const consentId = await window.KnhosIdGen.getNextId('consent');
  const record = {
    consentId,
    patientId,
    type: type || 'General Consent',
    text: text || '',
    signatureData,
    createdAt: new Date().toISOString(),
  };

  await dbAdd('consents', record);
  return record;
}

async function listConsentsForPatient(patientId) {
  const consents = await dbGetAllByIndex('consents', 'patientId', patientId);
  return consents.sort((a, b) => {
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

window.KnhosConsents = {
  createConsent,
  listConsentsForPatient,
};
})();
