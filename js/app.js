/**
 * app.js
 * Stage 4: The Ultimate Dental Clinical Upgrade with Interactive Odontogram, 
 * Dynamic Prescription Engine, and Print functionality.
 */

(function () {
'use strict';

const viewRoot = document.getElementById('view-root');
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

function setActiveNav(routeHash) {
  navButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === routeHash);
  });
}

function setView(html) {
  viewRoot.innerHTML = html;
  viewRoot.scrollTop = 0;
  window.scrollTo(0, 0);
}

const LAST_BACKUP_KEY = 'knhos_last_backup_iso';
function getLastBackupDate() { return localStorage.getItem(LAST_BACKUP_KEY); }

/* ==========================================================
   HOME
   ========================================================== */
function renderHome() {
  setActiveNav('#/home');
  const lastBackup = getLastBackupDate();
  const backupLine = lastBackup ? `Last backup: ${formatDate(lastBackup)}` : 'No backup taken yet';

  setView(`
    <div class="view-header">
      <h1>Home</h1>
      <p>KNHOS Lite — temporary patient records, until the full KNHOS system is ready.</p>
    </div>
    <div class="home-grid">
      <a class="home-tile" href="#/patients/new">
        <span class="home-tile-icon">＋</span><span class="home-tile-title">New Patient</span><span class="home-tile-desc">Register a new patient and get an automatic ID.</span>
      </a>
      <a class="home-tile" href="#/patients">
        <span class="home-tile-icon">☰</span><span class="home-tile-title">Patients</span><span class="home-tile-desc">Browse all registered patients.</span>
      </a>
      <a class="home-tile" href="#/search">
        <span class="home-tile-icon">⌕</span><span class="home-tile-title">Search</span><span class="home-tile-desc">Find a patient by ID, name, or phone.</span>
      </a>
      <a class="home-tile home-tile-backup" href="#/backup">
        <span class="home-tile-icon">⇩</span><span class="home-tile-title">Backup / Export</span><span class="home-tile-desc">Local storage is not a substitute for backup.</span>
        <span class="backup-status-line">${backupLine}</span>
      </a>
    </div>
  `);
}

/* ==========================================================
   NEW PATIENT
   ========================================================== */
let pendingRegistration = null;
function renderNewPatient(prefill, duplicateWarningHtml) {
  setActiveNav('#/patients/new');
  const v = prefill || {};
  setView(`
    <div class="view-header"><h1>New Patient</h1><p>Patient ID is generated automatically after saving.</p></div>
    ${duplicateWarningHtml || ''}
    <div class="card">
      <form id="new-patient-form">
        <div class="form-grid">
          <div class="field"><label>Full Name <span class="required-mark">*</span></label><input type="text" id="fullName" required autocomplete="off" value="${escapeHtml(v.fullName)}"></div>
          <div class="field"><label>Date of Birth <span class="required-mark">*</span></label><input type="date" id="dob" required value="${escapeHtml(v.dob)}"></div>
          <div class="field">
            <label>Gender <span class="required-mark">*</span></label>
            <select id="gender" required>
              <option value="" ${!v.gender ? 'selected' : ''} disabled>Select…</option>
              <option value="Female" ${v.gender === 'Female' ? 'selected' : ''}>Female</option>
              <option value="Male" ${v.gender === 'Male' ? 'selected' : ''}>Male</option>
              <option value="Other" ${v.gender === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="field"><label>Phone Number</label><input type="tel" id="phone" autocomplete="off" value="${escapeHtml(v.phone)}"></div>
          <div class="field" style="grid-column: 1 / -1;"><label>Address</label><textarea id="address" rows="2">${escapeHtml(v.address)}</textarea></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save Patient</button>
          <button type="button" class="btn btn-secondary" id="cancel-new-patient">Cancel</button>
        </div>
      </form>
    </div>
  `);
  document.getElementById('new-patient-form').addEventListener('submit', onSubmitNewPatient);
  document.getElementById('cancel-new-patient').addEventListener('click', () => { pendingRegistration = null; window.KnhosRouter.navigate('#/home'); });
}

function readNewPatientForm() {
  return { fullName: document.getElementById('fullName').value.trim(), dob: document.getElementById('dob').value, gender: document.getElementById('gender').value, phone: document.getElementById('phone').value.trim(), address: document.getElementById('address').value.trim() };
}

async function onSubmitNewPatient(event) {
  event.preventDefault();
  const data = readNewPatientForm();
  const duplicates = await window.KnhosPatients.findPossibleDuplicates(data);
  if (duplicates.length > 0) {
    pendingRegistration = data;
    const items = duplicates.map((p) => `<div class="patient-row" style="cursor:default;"><div class="patient-row-main"><span class="patient-row-name">${escapeHtml(p.fullName)}</span><span class="patient-row-id">${escapeHtml(p.patientId)}</span></div><div class="alert-actions"><button class="btn btn-secondary btn-sm open-existing-btn" data-id="${escapeHtml(p.patientId)}">Open Patient</button></div></div>`).join('');
    renderNewPatient(data, `<div class="alert alert-warn"><h3>Possible duplicate patient found</h3><div class="patient-list" style="margin-top: 12px;">${items}</div><div class="alert-actions"><button class="btn btn-primary" id="continue-anyway-btn">Continue Anyway</button></div></div>`);
    document.querySelectorAll('.open-existing-btn').forEach((btn) => btn.addEventListener('click', () => { pendingRegistration = null; window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(btn.dataset.id)}`); }));
    document.getElementById('continue-anyway-btn').addEventListener('click', async () => await finalizeRegistration(pendingRegistration));
    return;
  }
  await finalizeRegistration(data);
}

async function finalizeRegistration(data) {
  const record = await window.KnhosPatients.createPatient(data);
  pendingRegistration = null;
  window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(record.patientId)}?created=1`);
}

/* ==========================================================
   PATIENTS LIST / SEARCH
   ========================================================== */
function renderPatientRow(p) {
  return `<li><button class="patient-row" data-id="${escapeHtml(p.patientId)}"><div class="patient-row-main"><span class="patient-row-name">${escapeHtml(p.fullName)}</span><span class="patient-row-id">${escapeHtml(p.patientId)}</span></div><div class="patient-row-meta">DOB: ${escapeHtml(p.dob)}<br>${p.phone ? escapeHtml(p.phone) : 'No phone'}</div></button></li>`;
}

async function renderPatientsListOrSearch(routeHash, heading, subheading, initialQuery) {
  setActiveNav(routeHash);
  setView(`<div class="view-header"><h1>${heading}</h1><p>${subheading}</p></div><div class="search-bar"><input type="search" id="patient-search-input" placeholder="Search by Patient ID, name, or phone number…" value="${escapeHtml(initialQuery || '')}"></div><ul class="patient-list" id="patient-list-container"></ul>`);
  const input = document.getElementById('patient-search-input');
  const container = document.getElementById('patient-list-container');
  async function runSearch(q) {
    const results = q ? await window.KnhosPatients.searchPatients(q) : await window.KnhosPatients.listPatients();
    if (results.length === 0) { container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">⌕</span>${q ? 'No matches.' : 'No patients.'}</div>`; return; }
    container.innerHTML = results.map(renderPatientRow).join('');
    container.querySelectorAll('.patient-row').forEach((btn) => btn.addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(btn.dataset.id)}`)));
  }
  input.addEventListener('input', () => runSearch(input.value.trim()));
  await runSearch(initialQuery || '');
  if (routeHash === '#/search') input.focus();
}

/* ==========================================================
   PATIENT PROFILE
   ========================================================== */
function renderVisitHistory(visits) {
  if (!visits || visits.length === 0) return '<div class="notice-inline">No visits recorded yet.</div>';
  const items = visits.map((v) => `
    <li class="visit-card">
      <div class="visit-card-header">
        <div><span class="visit-id">${escapeHtml(v.visitId)}</span><span class="visit-dept-badge" style="margin-left: 8px;">${escapeHtml(v.department)}</span></div>
        <button class="btn btn-secondary btn-sm open-record-btn" data-visit="${escapeHtml(v.visitId)}">Open Record</button>
      </div>
      <div class="visit-datetime">${formatDate(v.visitDate)} • ${escapeHtml(v.visitTime)}</div>
      ${v.reason ? `<div style="font-size: 0.9rem; margin-top: 6px;"><strong>Reason:</strong> ${escapeHtml(v.reason)}</div>` : ''}
    </li>
  `).join('');
  return `<ul class="visit-list">${items}</ul>`;
}

function renderConsentHistory(consents) {
  if (!consents || consents.length === 0) return '<div class="notice-inline" style="margin-top:10px;">No consents recorded yet.</div>';
  const items = consents.map((c) => `
    <div class="consent-card">
      <div class="visit-card-header"><span class="visit-id">${escapeHtml(c.consentId)}</span><span class="visit-dept-badge">${escapeHtml(c.type)}</span></div>
      <div class="visit-datetime">${formatDateTime(c.createdAt)}</div>
      <div><img src="${c.signatureData}" class="consent-sig-img" /></div>
    </div>
  `).join('');
  return `<div style="margin-top:14px;">${items}</div>`;
}

async function renderPatientProfile(patientId, justCreated) {
  setActiveNav('__none__');
  const patient = await window.KnhosPatients.getPatient(patientId);
  if (!patient) return window.KnhosRouter.navigate('#/home');
  const visits = await window.KnhosVisits.listVisitsForPatient(patient.patientId);
  const consents = window.KnhosConsents ? await window.KnhosConsents.listConsentsForPatient(patient.patientId) : [];
  setView(`
    <div class="view-header"><h1>${escapeHtml(patient.fullName)}</h1><p><span class="profile-id-badge">${escapeHtml(patient.patientId)}</span></p></div>
    ${justCreated ? `<div class="alert alert-success"><h3>Patient registered</h3></div>` : ''}
    <div class="card">
      <div class="section-title">Patient Information</div>
      <div class="profile-fields">
        <div><div class="profile-field-label">DOB</div><div class="profile-field-value">${escapeHtml(patient.dob)}</div></div>
        <div><div class="profile-field-label">Gender</div><div class="profile-field-value">${escapeHtml(patient.gender)}</div></div>
        <div><div class="profile-field-label">Phone</div><div class="profile-field-value">${patient.phone ? escapeHtml(patient.phone) : '—'}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">Visits</div>
      ${renderVisitHistory(visits)}
      <div class="form-actions" style="margin-top: 14px; margin-bottom: 24px;"><button class="btn btn-primary" id="new-visit-btn">+ New Visit</button></div>
      <hr style="border: 0; border-top: 1px solid var(--color-border); margin: 20px 0;">
      <div class="section-title">Consents</div>
      ${renderConsentHistory(consents)}
      <div class="form-actions" style="margin-top: 14px;"><button class="btn btn-primary" id="new-consent-btn">+ New Consent</button></div>
    </div>
  `);
  document.getElementById('new-visit-btn').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patient.patientId)}/visits/new`));
  document.getElementById('new-consent-btn').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patient.patientId)}/consents/new`));
  document.querySelectorAll('.open-record-btn').forEach((btn) => btn.addEventListener('click', () => window.KnhosRouter.navigate(`#/visits/${encodeURIComponent(btn.dataset.visit)}`)));
}

/* ==========================================================
   NEW VISIT & CLINICAL RECORD (PHASE 4: ULTIMATE DENTAL)
   ========================================================== */
function pad2(n) { return String(n).padStart(2, '0'); }
function todayDateValue() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function nowTimeValue() { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

async function renderNewVisit(patientId) {
  setActiveNav('__none__');
  const patient = await window.KnhosPatients.getPatient(patientId);
  if (!patient) return window.KnhosRouter.navigate('#/home');
  setView(`
    <div class="view-header"><h1>New Visit</h1><p>Patient: <strong>${escapeHtml(patient.fullName)}</strong></p></div>
    <div class="card">
      <form id="new-visit-form">
        <div class="form-grid">
          <div class="field">
            <label>Department <span class="required-mark">*</span></label>
            <select id="department" required><option value="" selected disabled>Select…</option><option value="Dental">Dental</option><option value="Naturopathy">Naturopathy</option></select>
          </div>
          <div class="field"><label>Visit Date *</label><input type="date" id="visitDate" required value="${todayDateValue()}"></div>
          <div class="field"><label>Visit Time *</label><input type="time" id="visitTime" required value="${nowTimeValue()}"></div>
          <div class="field" style="grid-column: 1 / -1;"><label>Reason for Visit</label><input type="text" id="reason" autocomplete="off"></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Create Visit</button>
          <button type="button" class="btn btn-secondary" id="cancel-new-visit">Cancel</button>
        </div>
      </form>
    </div>
  `);
  document.getElementById('cancel-new-visit').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patientId)}`));
  document.getElementById('new-visit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newVisit = await window.KnhosVisits.createVisit({ patientId, department: document.getElementById('department').value, visitDate: document.getElementById('visitDate').value, visitTime: document.getElementById('visitTime').value, reason: document.getElementById('reason').value.trim() });
    window.KnhosRouter.navigate(`#/visits/${encodeURIComponent(newVisit.visitId)}`);
  });
}

// THE ULTIMATE CLINICAL RECORD
async function renderClinicalRecord(visitId) {
  setActiveNav('__none__');
  const visit = await window.KnhosVisits.getVisit(visitId);
  if (!visit) return window.KnhosRouter.navigate('#/home');
  const patient = await window.KnhosPatients.getPatient(visit.patientId);

  // Dental Data State
  let dentalChart = visit.dental_chart || {};
  let rxList = visit.rx_list || [];

  // Generate Tooth Grid HTML
  const ur = [18,17,16,15,14,13,12,11]; const ul = [21,22,23,24,25,26,27,28];
  const lr = [48,47,46,45,44,43,42,41]; const ll = [31,32,33,34,35,36,37,38];
  
  function getToothHtml(num) {
    const status = dentalChart[num] ? dentalChart[num].status : '';
    const title = dentalChart[num] && dentalChart[num].notes ? `Notes: ${dentalChart[num].notes}` : '';
    return `<div class="tooth ${status}" data-tooth="${num}" title="${escapeHtml(title)}">${num}</div>`;
  }

  const odontogramHtml = `
    <div class="odontogram">
      <div style="font-size:0.85rem; font-weight:bold; color:#666; text-align:center; margin-bottom:4px;">UPPER</div>
      <div class="arch-row">
        <div class="arch-half arch-left">${ur.map(getToothHtml).join('')}</div>
        <div class="arch-half">${ul.map(getToothHtml).join('')}</div>
      </div>
      <div class="arch-row" style="margin-top:6px;">
        <div class="arch-half arch-left">${lr.map(getToothHtml).join('')}</div>
        <div class="arch-half">${ll.map(getToothHtml).join('')}</div>
      </div>
      <div style="font-size:0.85rem; font-weight:bold; color:#666; text-align:center; margin-top:4px;">LOWER</div>
    </div>
  `;

  // Prescription HTML generator
  function renderRxTable() {
    if (rxList.length === 0) return '<div class="notice-inline">No medicines prescribed.</div>';
    return `<table class="rx-table">
      <tr><th>Drug Name</th><th>Dosage</th><th>Frequency</th><th>Days</th><th>Action</th></tr>
      ${rxList.map((rx, idx) => `
        <tr>
          <td>${escapeHtml(rx.drug)}</td><td>${escapeHtml(rx.dose)}</td>
          <td>${escapeHtml(rx.freq)}</td><td>${escapeHtml(rx.days)}</td>
          <td><button type="button" class="btn btn-danger btn-sm btn-delete-rx" data-idx="${idx}">X</button></td>
        </tr>
      `).join('')}
    </table>`;
  }

  const dentalHtml = `
    <div class="clinical-section">
      <h3 style="margin-top:0;">1. Medical Alerts</h3>
      <div class="field"><input type="text" id="clin-alerts" placeholder="e.g., Diabetic, Penicillin Allergy" value="${escapeHtml(visit.clin_alerts || '')}"></div>
    </div>

    <div class="clinical-section">
      <h3 style="margin-top:0;">2. Odontogram (Tap a tooth to set status)</h3>
      <div id="odontogram-container">${odontogramHtml}</div>
    </div>

    <div class="clinical-section">
      <h3 style="margin-top:0;">3. Clinical Notes</h3>
      <div class="form-grid">
        <div class="field" style="grid-column: 1 / -1;"><label>Chief Complaint (CC)</label><textarea id="clin-cc" rows="2">${escapeHtml(visit.clin_cc || '')}</textarea></div>
        <div class="field" style="grid-column: 1 / -1;"><label>Diagnosis (Dx)</label><input type="text" id="clin-dx" value="${escapeHtml(visit.clin_dx || '')}"></div>
        <div class="field" style="grid-column: 1 / -1;"><label>Treatment Planned</label><textarea id="clin-tx-plan" rows="2">${escapeHtml(visit.clin_tx_plan || '')}</textarea></div>
        <div class="field" style="grid-column: 1 / -1;"><label>Treatment Done Today</label><textarea id="clin-tx-done" rows="2">${escapeHtml(visit.clin_tx_done || '')}</textarea></div>
      </div>
    </div>

    <div class="clinical-section">
      <h3 style="margin-top:0; display:flex; justify-content:space-between; align-items:center;">
        4. Prescription (Rx)
        <button type="button" class="btn btn-secondary btn-sm" id="btn-print-rx">Print Rx</button>
      </h3>
      <div class="form-grid" style="align-items: end; background: #f0f4f2; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        <div class="field"><label>Drug Name</label><input type="text" id="rx-drug"></div>
        <div class="field"><label>Dosage</label><input type="text" id="rx-dose" placeholder="e.g., 500mg"></div>
        <div class="field"><label>Frequency</label><input type="text" id="rx-freq" placeholder="e.g., 1-0-1"></div>
        <div class="field"><label>Days</label><input type="text" id="rx-days" placeholder="e.g., 5 Days"></div>
        <div><button type="button" class="btn btn-primary" id="btn-add-rx" style="width:100%;">Add</button></div>
      </div>
      <div id="rx-container">${renderRxTable()}</div>
    </div>
  `;

  const natHtml = `
    <div class="clinical-section">
      <h3 style="margin-top:0;">Naturopathy Record <span style="font-size:0.8rem; font-weight:normal; color:#666;">(Preview Mode)</span></h3>
      <div class="form-grid">
        <div class="field"><label>Patient Type</label><select id="nat-type"><option value="OP" ${visit.nat_type === 'OP' ? 'selected' : ''}>Outpatient (OP)</option><option value="IP" ${visit.nat_type === 'IP' ? 'selected' : ''}>Inpatient (IP)</option></select></div>
        <div class="field" style="grid-column: 1 / -1;"><label>Therapy Notes</label><textarea id="nat-notes" rows="3">${escapeHtml(visit.nat_notes || '')}</textarea></div>
      </div>
    </div>
  `;

  setView(`
    <div class="view-header"><h1>Clinical Record</h1><p>${escapeHtml(patient.fullName)} • <span class="visit-id">${escapeHtml(visit.visitId)}</span></p></div>
    <div class="card">
      <form id="clinical-form">
        <div class="clinical-section">
          <h3 style="margin-top:0; font-size:0.95rem; text-transform:uppercase; color:#666;">Vitals</h3>
          <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));">
            <div class="field"><label>BP (mmHg)</label><input type="text" id="vitals-bp" placeholder="120/80" value="${escapeHtml(visit.vitals_bp || '')}"></div>
            <div class="field"><label>Pulse (bpm)</label><input type="number" id="vitals-pulse" value="${escapeHtml(visit.vitals_pulse || '')}"></div>
          </div>
        </div>
        ${visit.department === 'Dental' ? dentalHtml : natHtml}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save Entire Record</button>
          <button type="button" class="btn btn-secondary" id="btn-cancel-clinical">Back to Profile</button>
        </div>
      </form>
    </div>
    
    <!-- Hidden Print Layout -->
    <div id="print-area">
      <div class="print-header">
        <h1>KNHOS Dental Clinic</h1>
        <p style="margin:5px 0 0;">Karur, Tamil Nadu</p>
      </div>
      <div class="print-patient-info">
        <div><strong>Patient:</strong> ${escapeHtml(patient.fullName)} (${escapeHtml(patient.gender)})<br><strong>ID:</strong> ${escapeHtml(patient.patientId)}</div>
        <div style="text-align:right;"><strong>Date:</strong> ${formatDate(visit.visitDate)}<br><strong>Age/DOB:</strong> ${escapeHtml(patient.dob)}</div>
      </div>
      <h3 style="margin-bottom:10px;">Prescription (Rx)</h3>
      <div id="print-rx-body"></div>
      <div class="print-footer">
        <div class="print-signature-line"></div>
        <strong>Doctor's Signature</strong>
      </div>
    </div>
  `);

  document.getElementById('btn-cancel-clinical').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patient.patientId)}`));

  // --- Dental Specific Logic ---
  if (visit.department === 'Dental') {
    // Tooth Click Modal Logic
    document.getElementById('odontogram-container').addEventListener('click', (e) => {
      if (e.target.classList.contains('tooth')) {
        const tNum = e.target.dataset.tooth;
        const currentStatus = dentalChart[tNum] ? dentalChart[tNum].status : '';
        const currentNotes = dentalChart[tNum] ? dentalChart[tNum].notes : '';
        
        // Create quick modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="modal-content">
            <h3>Tooth ${tNum} Details</h3>
            <div class="field" style="margin-bottom:12px;">
              <label>Status</label>
              <select id="modal-status" class="form-control" style="width:100%;">
                <option value="" ${currentStatus === '' ? 'selected' : ''}>Healthy / Normal</option>
                <option value="decayed" ${currentStatus === 'decayed' ? 'selected' : ''}>Decayed</option>
                <option value="filled" ${currentStatus === 'filled' ? 'selected' : ''}>Filled</option>
                <option value="missing" ${currentStatus === 'missing' ? 'selected' : ''}>Missing</option>
                <option value="planned" ${currentStatus === 'planned' ? 'selected' : ''}>Treatment Planned</option>
              </select>
            </div>
            <div class="field" style="margin-bottom:16px;">
              <label>Notes</label>
              <input type="text" id="modal-notes" style="width:100%;" value="${escapeHtml(currentNotes)}">
            </div>
            <div class="form-actions" style="margin-top:0;">
              <button type="button" class="btn btn-primary" id="modal-save">Save Tooth</button>
              <button type="button" class="btn btn-secondary" id="modal-close">Cancel</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('modal-close').addEventListener('click', () => document.body.removeChild(modal));
        document.getElementById('modal-save').addEventListener('click', () => {
          const status = document.getElementById('modal-status').value;
          const notes = document.getElementById('modal-notes').value.trim();
          if (status === '' && notes === '') { delete dentalChart[tNum]; } 
          else { dentalChart[tNum] = { status, notes }; }
          document.body.removeChild(modal);
          // Re-render just the odontogram visually
          e.target.className = `tooth ${status}`;
          e.target.title = notes ? `Notes: ${notes}` : '';
        });
      }
    });

    // Rx Add Logic
    document.getElementById('btn-add-rx').addEventListener('click', () => {
      const drug = document.getElementById('rx-drug').value.trim();
      const dose = document.getElementById('rx-dose').value.trim();
      const freq = document.getElementById('rx-freq').value.trim();
      const days = document.getElementById('rx-days').value.trim();
      if (!drug) { alert('Drug name is required.'); return; }
      rxList.push({ drug, dose, freq, days });
      document.getElementById('rx-container').innerHTML = renderRxTable();
      document.getElementById('rx-drug').value = ''; document.getElementById('rx-dose').value = '';
      document.getElementById('rx-freq').value = ''; document.getElementById('rx-days').value = '';
      bindRxDeletes();
    });

    function bindRxDeletes() {
      document.querySelectorAll('.btn-delete-rx').forEach(btn => {
        btn.addEventListener('click', (e) => {
          rxList.splice(e.target.dataset.idx, 1);
          document.getElementById('rx-container').innerHTML = renderRxTable();
          bindRxDeletes();
        });
      });
    }
    bindRxDeletes();

    // Print Logic
    document.getElementById('btn-print-rx').addEventListener('click', () => {
      if (rxList.length === 0) { alert('No medicines to print.'); return; }
      let rxHtml = `<table class="print-rx-table"><tr><th>Drug Name</th><th>Dosage</th><th>Frequency</th><th>Days</th></tr>`;
      rxList.forEach(rx => { rxHtml += `<tr><td><strong>${escapeHtml(rx.drug)}</strong></td><td>${escapeHtml(rx.dose)}</td><td>${escapeHtml(rx.freq)}</td><td>${escapeHtml(rx.days)}</td></tr>`; });
      rxHtml += `</table>`;
      document.getElementById('print-rx-body').innerHTML = rxHtml;
      window.print();
    });
  }

  // Handle Save
  document.getElementById('clinical-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    visit.vitals_bp = document.getElementById('vitals-bp').value.trim();
    visit.vitals_pulse = document.getElementById('vitals-pulse').value.trim();
    
    if (visit.department === 'Dental') {
      visit.clin_alerts = document.getElementById('clin-alerts').value.trim();
      visit.clin_cc = document.getElementById('clin-cc').value.trim();
      visit.clin_dx = document.getElementById('clin-dx').value.trim();
      visit.clin_tx_plan = document.getElementById('clin-tx-plan').value.trim();
      visit.clin_tx_done = document.getElementById('clin-tx-done').value.trim();
      visit.dental_chart = dentalChart;
      visit.rx_list = rxList;
    } else {
      visit.nat_type = document.getElementById('nat-type').value;
      visit.nat_notes = document.getElementById('nat-notes').value.trim();
    }

    await window.KnhosVisits.updateVisit(visit);
    window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patient.patientId)}`);
  });
}

/* ==========================================================
   NEW CONSENT (E-SIGNATURE)
   ========================================================== */
async function renderNewConsent(patientId) {
  setActiveNav('__none__');
  const patient = await window.KnhosPatients.getPatient(patientId);
  if (!patient) return window.KnhosRouter.navigate('#/home');

  setView(`
    <div class="view-header"><h1>New Consent</h1><p>Patient: <strong>${escapeHtml(patient.fullName)}</strong></p></div>
    <div class="card">
      <div class="form-grid">
        <div class="field" style="grid-column: 1 / -1;">
          <label>Consent Type <span class="required-mark">*</span></label>
          <select id="consent-type" required>
            <option value="General Medical Consent">General Medical Consent</option>
            <option value="Dental Procedure Consent">Dental Procedure Consent</option>
            <option value="Naturopathy Treatment Consent">Naturopathy Treatment Consent</option>
          </select>
        </div>
        <div class="field" style="grid-column: 1 / -1;">
          <label>Patient Signature <span class="required-mark">*</span></label>
          <div class="signature-container"><canvas id="signature-pad"></canvas></div>
          <div><button type="button" class="btn btn-secondary btn-sm" id="btn-clear-sig">Clear Signature</button></div>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-primary" id="btn-save-consent">Save Consent</button>
        <button type="button" class="btn btn-secondary" id="cancel-new-consent">Cancel</button>
      </div>
    </div>
  `);

  document.getElementById('cancel-new-consent').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patientId)}`));
  const canvas = document.getElementById('signature-pad'); const ctx = canvas.getContext('2d');
  function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio; canvas.height = canvas.offsetHeight * ratio;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#1f4d43';
  }
  resizeCanvas(); window.addEventListener('resize', resizeCanvas);

  let isDrawing = false;
  function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function startDrawing(e) { e.preventDefault(); isDrawing = true; const { x, y } = getCoordinates(e); ctx.beginPath(); ctx.moveTo(x, y); }
  function draw(e) { e.preventDefault(); if (!isDrawing) return; const { x, y } = getCoordinates(e); ctx.lineTo(x, y); ctx.stroke(); }
  function stopDrawing(e) { e.preventDefault(); isDrawing = false; }

  canvas.addEventListener('mousedown', startDrawing); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stopDrawing); canvas.addEventListener('mouseout', stopDrawing);
  canvas.addEventListener('touchstart', startDrawing, { passive: false }); canvas.addEventListener('touchmove', draw, { passive: false }); canvas.addEventListener('touchend', stopDrawing, { passive: false });

  document.getElementById('btn-clear-sig').addEventListener('click', () => ctx.clearRect(0, 0, canvas.width, canvas.height));
  document.getElementById('btn-save-consent').addEventListener('click', async () => {
    const blankCanvas = document.createElement('canvas'); blankCanvas.width = canvas.width; blankCanvas.height = canvas.height;
    if (canvas.toDataURL() === blankCanvas.toDataURL()) { alert("Please provide a signature before saving."); return; }
    try {
      await window.KnhosConsents.createConsent({ patientId, type: document.getElementById('consent-type').value, text: `I hereby consent to the procedure.`, signatureData: canvas.toDataURL('image/png') });
      window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patientId)}`);
    } catch (err) { alert('Error: ' + err.message); }
  });
}

/* ==========================================================
   BACKUP STUB
   ========================================================== */
function renderBackup() {
  setActiveNav('#/backup');
  const lastBackup = getLastBackupDate();
  setView(`<div class="view-header"><h1>Backup</h1></div><div class="card"><p>${lastBackup ? `Last: ${formatDate(lastBackup)}` : 'No backup taken.'}</p></div>`);
}

/* ==========================================================
   ROUTES
   ========================================================== */
window.KnhosRouter.registerRoute('#/home', renderHome);
window.KnhosRouter.registerRoute('#/patients/new', () => renderNewPatient(pendingRegistration));
window.KnhosRouter.registerRoute('#/patients', () => renderPatientsListOrSearch('#/patients', 'Patients', 'All registered patients.', ''));
window.KnhosRouter.registerRoute('#/search', () => renderPatientsListOrSearch('#/search', 'Search', 'Find a patient.', ''));
window.KnhosRouter.registerRoute('#/backup', renderBackup);
window.KnhosRouter.registerRoute('#/patients/:id/visits/new', (params) => renderNewVisit(params.id));
window.KnhosRouter.registerRoute('#/patients/:id/consents/new', (params) => renderNewConsent(params.id));
window.KnhosRouter.registerRoute('#/visits/:id', (params) => renderClinicalRecord(params.id));
window.KnhosRouter.registerRoute('#/patients/:id', (params, query) => renderPatientProfile(params.id, query.get('created') === '1'));

navButtons.forEach((btn) => btn.addEventListener('click', () => { pendingRegistration = null; window.KnhosRouter.navigate(btn.dataset.route); }));
document.getElementById('brand-home-btn').addEventListener('click', () => window.KnhosRouter.navigate('#/home'));

async function initApp() {
  try { await window.KnhosDB.openDatabase(); } catch (err) { setView(`<div class="alert alert-error"><h3>Storage Error</h3><p>${escapeHtml(err && err.message)}</p></div>`); return; }
  window.KnhosRouter.startRouter();
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('service-worker.js', { scope: './' }).catch(()=>{}); }
}
initApp();
})();
