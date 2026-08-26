/**
 * app.js
 * Stage 4: Ultimate Dental (Smart Dropdowns, Billing Engine, Dual-Print System).
 */

(function () {
'use strict';

const viewRoot = document.getElementById('view-root');
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));

function escapeHtml(str) { return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatDate(isoString) { if (!isoString) return '—'; const d = new Date(isoString); if (Number.isNaN(d.getTime())) return isoString; return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatDateTime(isoString) { if (!isoString) return '—'; const d = new Date(isoString); if (Number.isNaN(d.getTime())) return isoString; return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`; }
function setActiveNav(routeHash) { navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.route === routeHash)); }
function setView(html) { viewRoot.innerHTML = html; viewRoot.scrollTop = 0; window.scrollTo(0, 0); }

/* ==========================================================
   HOME & PATIENT SEARCH (Collapsed for brevity, functionality identical)
   ========================================================== */
function renderHome() {
  setActiveNav('#/home');
  setView(`
    <div class="view-header"><h1>Home</h1><p>KNHOS Lite — temporary patient records.</p></div>
    <div class="home-grid">
      <a class="home-tile" href="#/patients/new"><span class="home-tile-icon">＋</span><span class="home-tile-title">New Patient</span><span class="home-tile-desc">Register a new patient.</span></a>
      <a class="home-tile" href="#/patients"><span class="home-tile-icon">☰</span><span class="home-tile-title">Patients</span><span class="home-tile-desc">Browse all registered patients.</span></a>
      <a class="home-tile" href="#/search"><span class="home-tile-icon">⌕</span><span class="home-tile-title">Search</span><span class="home-tile-desc">Find a patient by ID or name.</span></a>
    </div>
  `);
}

let pendingRegistration = null;
function renderNewPatient(prefill) {
  setActiveNav('#/patients/new'); const v = prefill || {};
  setView(`
    <div class="view-header"><h1>New Patient</h1></div>
    <div class="card">
      <form id="new-patient-form">
        <div class="form-grid">
          <div class="field"><label>Full Name *</label><input type="text" id="fullName" required value="${escapeHtml(v.fullName)}"></div>
          <div class="field"><label>DOB *</label><input type="date" id="dob" required value="${escapeHtml(v.dob)}"></div>
          <div class="field"><label>Gender *</label><select id="gender" required><option value="" disabled selected>Select…</option><option value="Female">Female</option><option value="Male">Male</option><option value="Other">Other</option></select></div>
          <div class="field"><label>Phone</label><input type="tel" id="phone" value="${escapeHtml(v.phone)}"></div>
          <div class="field" style="grid-column: 1 / -1;"><label>Address</label><textarea id="address">${escapeHtml(v.address)}</textarea></div>
        </div>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save Patient</button></div>
      </form>
    </div>
  `);
  document.getElementById('new-patient-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { fullName: document.getElementById('fullName').value.trim(), dob: document.getElementById('dob').value, gender: document.getElementById('gender').value, phone: document.getElementById('phone').value.trim(), address: document.getElementById('address').value.trim() };
    const record = await window.KnhosPatients.createPatient(data);
    window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(record.patientId)}`);
  });
}

async function renderPatientsListOrSearch(routeHash, heading, initialQuery) {
  setActiveNav(routeHash);
  setView(`<div class="view-header"><h1>${heading}</h1></div><div class="search-bar"><input type="search" id="patient-search-input" placeholder="Search..." value="${escapeHtml(initialQuery || '')}"></div><ul class="patient-list" id="patient-list-container"></ul>`);
  const input = document.getElementById('patient-search-input'); const container = document.getElementById('patient-list-container');
  async function runSearch(q) {
    const results = q ? await window.KnhosPatients.searchPatients(q) : await window.KnhosPatients.listPatients();
    container.innerHTML = results.length === 0 ? '<div class="empty-state">No matches.</div>' : results.map(p => `<li><button class="patient-row" data-id="${escapeHtml(p.patientId)}"><div class="patient-row-main"><span class="patient-row-name">${escapeHtml(p.fullName)}</span><span class="patient-row-id">${escapeHtml(p.patientId)}</span></div></button></li>`).join('');
    container.querySelectorAll('.patient-row').forEach(btn => btn.addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(btn.dataset.id)}`)));
  }
  input.addEventListener('input', () => runSearch(input.value.trim())); await runSearch(initialQuery || '');
}

/* ==========================================================
   PATIENT PROFILE
   ========================================================== */
async function renderPatientProfile(patientId) {
  setActiveNav('__none__');
  const patient = await window.KnhosPatients.getPatient(patientId);
  if (!patient) return window.KnhosRouter.navigate('#/home');
  const visits = await window.KnhosVisits.listVisitsForPatient(patient.patientId);
  const consents = window.KnhosConsents ? await window.KnhosConsents.listConsentsForPatient(patient.patientId) : [];

  const visitHtml = visits.length === 0 ? '<div class="notice-inline">No visits yet.</div>' : `<ul class="visit-list">${visits.map(v => `<li class="visit-card"><div class="visit-card-header"><div><span class="visit-id">${escapeHtml(v.visitId)}</span><span class="visit-dept-badge" style="margin-left: 8px;">${escapeHtml(v.department)}</span></div><button class="btn btn-secondary btn-sm open-record-btn" data-visit="${escapeHtml(v.visitId)}">Open Record</button></div><div class="visit-datetime">${formatDate(v.visitDate)}</div></li>`).join('')}</ul>`;
  const consentHtml = consents.length === 0 ? '<div class="notice-inline">No consents yet.</div>' : consents.map(c => `<div class="consent-card"><div class="visit-card-header"><span class="visit-id">${escapeHtml(c.consentId)}</span><span class="visit-dept-badge">${escapeHtml(c.type)}</span></div><div class="visit-datetime">${formatDateTime(c.createdAt)}</div><div><img src="${c.signatureData}" class="consent-sig-img" /></div></div>`).join('');

  setView(`
    <div class="view-header"><h1>${escapeHtml(patient.fullName)}</h1><p><span class="profile-id-badge">${escapeHtml(patient.patientId)}</span></p></div>
    <div class="card">
      <div class="section-title">Visits</div>
      ${visitHtml}
      <div class="form-actions" style="margin-top: 14px;"><button class="btn btn-primary" id="new-visit-btn">+ New Visit</button></div>
      <hr style="border: 0; border-top: 1px solid var(--color-border); margin: 20px 0;">
      <div class="section-title">Consents</div>
      ${consentHtml}
      <div class="form-actions" style="margin-top: 14px;"><button class="btn btn-primary" id="new-consent-btn">+ New Consent</button></div>
    </div>
  `);
  document.getElementById('new-visit-btn').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patient.patientId)}/visits/new`));
  document.getElementById('new-consent-btn').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patient.patientId)}/consents/new`));
  document.querySelectorAll('.open-record-btn').forEach(btn => btn.addEventListener('click', () => window.KnhosRouter.navigate(`#/visits/${encodeURIComponent(btn.dataset.visit)}`)));
}

async function renderNewVisit(patientId) {
  const patient = await window.KnhosPatients.getPatient(patientId);
  setView(`
    <div class="view-header"><h1>New Visit</h1><p>Patient: <strong>${escapeHtml(patient.fullName)}</strong></p></div>
    <div class="card">
      <form id="new-visit-form">
        <div class="form-grid">
          <div class="field"><label>Department *</label><select id="department" required><option value="" selected disabled>Select…</option><option value="Dental">Dental</option><option value="Naturopathy">Naturopathy</option></select></div>
          <div class="field"><label>Visit Date *</label><input type="date" id="visitDate" required value="${new Date().toISOString().split('T')[0]}"></div>
        </div>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Create Visit</button><button type="button" class="btn btn-secondary" id="cancel-new-visit">Cancel</button></div>
      </form>
    </div>
  `);
  document.getElementById('cancel-new-visit').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patientId)}`));
  document.getElementById('new-visit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newVisit = await window.KnhosVisits.createVisit({ patientId, department: document.getElementById('department').value, visitDate: document.getElementById('visitDate').value });
    window.KnhosRouter.navigate(`#/visits/${encodeURIComponent(newVisit.visitId)}`);
  });
}

/* ==========================================================
   THE ULTIMATE DENTAL RECORD (PHASE 4)
   ========================================================== */
async function renderClinicalRecord(visitId) {
  setActiveNav('__none__');
  const visit = await window.KnhosVisits.getVisit(visitId);
  if (!visit) return window.KnhosRouter.navigate('#/home');
  const patient = await window.KnhosPatients.getPatient(visit.patientId);

  // State
  let dentalChart = visit.dental_chart || {};
  let rxList = visit.rx_list || [];
  let invoiceList = visit.invoice_list || [];

  // Tooth Grid
  const ur = [18,17,16,15,14,13,12,11]; const ul = [21,22,23,24,25,26,27,28];
  const lr = [48,47,46,45,44,43,42,41]; const ll = [31,32,33,34,35,36,37,38];
  function getToothHtml(num) {
    const status = dentalChart[num] ? dentalChart[num].status : '';
    const title = dentalChart[num] && dentalChart[num].notes ? `Notes: ${dentalChart[num].notes}` : '';
    return `<div class="tooth ${status}" data-tooth="${num}" title="${escapeHtml(title)}">${num}</div>`;
  }
  const odontogramHtml = `<div class="odontogram"><div style="font-size:0.85rem; font-weight:bold; color:#666; text-align:center; margin-bottom:4px;">UPPER</div><div class="arch-row"><div class="arch-half arch-left">${ur.map(getToothHtml).join('')}</div><div class="arch-half">${ul.map(getToothHtml).join('')}</div></div><div class="arch-row" style="margin-top:6px;"><div class="arch-half arch-left">${lr.map(getToothHtml).join('')}</div><div class="arch-half">${ll.map(getToothHtml).join('')}</div></div><div style="font-size:0.85rem; font-weight:bold; color:#666; text-align:center; margin-top:4px;">LOWER</div></div>`;

  // Rx Table
  function renderRxTable() {
    if (rxList.length === 0) return '<div class="notice-inline">No medicines prescribed.</div>';
    return `<table class="data-table"><tr><th>Drug Name</th><th>Dosage</th><th>Frequency</th><th>Days</th><th>Action</th></tr>${rxList.map((rx, idx) => `<tr><td>${escapeHtml(rx.drug)}</td><td>${escapeHtml(rx.dose)}</td><td>${escapeHtml(rx.freq)}</td><td>${escapeHtml(rx.days)}</td><td><button type="button" class="btn btn-danger btn-sm btn-delete-rx" data-idx="${idx}">X</button></td></tr>`).join('')}</table>`;
  }

  // Invoice Table
  function renderInvoiceTable() {
    if (invoiceList.length === 0) return '<div class="notice-inline">No treatments added to invoice.</div>';
    const total = invoiceList.reduce((sum, item) => sum + Number(item.cost), 0);
    return `<table class="data-table"><tr><th>Treatment / Item</th><th>Cost (₹)</th><th>Action</th></tr>${invoiceList.map((inv, idx) => `<tr><td>${escapeHtml(inv.item)}</td><td>₹${escapeHtml(inv.cost)}</td><td><button type="button" class="btn btn-danger btn-sm btn-delete-inv" data-idx="${idx}">X</button></td></tr>`).join('')}<tr class="total-row"><td>TOTAL</td><td colspan="2">₹${total}</td></tr></table>`;
  }

  // Smart Select Dropdown UI
  function smartSelect(id, label, options, savedVal) {
    const isCustom = savedVal && !options.includes(savedVal);
    const selectVal = isCustom ? 'Other' : (savedVal || '');
    return `
      <div class="field" style="grid-column: 1 / -1;">
        <label>${label}</label>
        <select id="${id}-select">
          <option value="" disabled ${!selectVal ? 'selected' : ''}>Select...</option>
          ${options.map(opt => `<option value="${opt}" ${selectVal === opt ? 'selected' : ''}>${opt}</option>`).join('')}
          <option value="Other" ${selectVal === 'Other' ? 'selected' : ''}>Other (Type Custom)</option>
        </select>
        <input type="text" id="${id}-text" style="display:${isCustom ? 'block' : 'none'}; margin-top:8px;" placeholder="Type custom ${label.toLowerCase()}..." value="${isCustom ? escapeHtml(savedVal) : ''}">
      </div>
    `;
  }

  const dentalHtml = `
    <div class="clinical-section">
      <h3 style="margin-top:0;">1. Medical Alerts</h3>
      <div class="field"><input type="text" id="clin-alerts" placeholder="e.g., Diabetic, Penicillin Allergy" value="${escapeHtml(visit.clin_alerts || '')}"></div>
    </div>

    <div class="clinical-section">
      <h3 style="margin-top:0;">2. Odontogram (Tap a tooth)</h3>
      <div id="odontogram-container">${odontogramHtml}</div>
    </div>

    <div class="clinical-section">
      <h3 style="margin-top:0;">3. Clinical Notes (Smart Select)</h3>
      <div class="form-grid">
        ${smartSelect('clin-cc', 'Chief Complaint (CC)', ['Tooth Ache', 'Sensitivity', 'Bleeding Gums', 'Routine Checkup', 'Broken Tooth'], visit.clin_cc)}
        ${smartSelect('clin-dx', 'Diagnosis (Dx)', ['Dental Caries', 'Pulpitis', 'Gingivitis', 'Periodontitis', 'Impacted Tooth'], visit.clin_dx)}
        ${smartSelect('clin-tx', 'Treatment Done Today', ['Scaling & Polishing', 'Composite Restoration (Filling)', 'Extraction', 'Root Canal Treatment - Step 1', 'Crown Placement'], visit.clin_tx)}
      </div>
    </div>

    <div class="clinical-section">
      <h3 style="margin-top:0; display:flex; justify-content:space-between; align-items:center;">4. Prescription (Rx) <button type="button" class="btn btn-secondary btn-sm" id="btn-print-rx">Print Rx</button></h3>
      <div class="form-grid" style="align-items: end; background: #f0f4f2; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        <div class="field"><label>Drug Preset</label><select id="rx-preset"><option value="">Custom Entry...</option><option value="Amoxicillin|500mg|1-0-1|5 Days">Amoxicillin 500mg</option><option value="Paracetamol|650mg|1-0-1|3 Days">Paracetamol 650mg</option><option value="Ibuprofen|400mg|1-0-1|3 Days">Ibuprofen 400mg</option></select></div>
        <div class="field"><label>Custom Drug</label><input type="text" id="rx-drug"></div>
        <div class="field"><label>Dosage</label><input type="text" id="rx-dose" placeholder="e.g., 500mg"></div>
        <div class="field"><label>Frequency</label><input type="text" id="rx-freq" placeholder="e.g., 1-0-1"></div>
        <div class="field"><label>Days</label><input type="text" id="rx-days" placeholder="e.g., 5 Days"></div>
        <div><button type="button" class="btn btn-primary" id="btn-add-rx" style="width:100%;">Add</button></div>
      </div>
      <div id="rx-container">${renderRxTable()}</div>
    </div>

    <div class="clinical-section">
      <h3 style="margin-top:0; display:flex; justify-content:space-between; align-items:center;">5. Invoice & Billing <button type="button" class="btn btn-secondary btn-sm" id="btn-print-inv">Print Invoice</button></h3>
      <div class="form-grid" style="align-items: end; background: #fdf3e3; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
        <div class="field"><label>Treatment Preset</label><select id="inv-preset"><option value="">Custom Entry...</option><option value="Consultation|500">Consultation</option><option value="Scaling|1500">Scaling</option><option value="Extraction|2000">Extraction</option></select></div>
        <div class="field" style="grid-column: span 2;"><label>Custom Item</label><input type="text" id="inv-item"></div>
        <div class="field"><label>Cost (₹)</label><input type="number" id="inv-cost" placeholder="e.g., 1500"></div>
        <div><button type="button" class="btn btn-primary" id="btn-add-inv" style="width:100%;">Add</button></div>
      </div>
      <div id="inv-container">${renderInvoiceTable()}</div>
    </div>
  `;

  const natHtml = `<div class="clinical-section"><h3>Naturopathy Record</h3><div class="form-grid"><div class="field"><label>Patient Type</label><select id="nat-type"><option value="OP" ${visit.nat_type === 'OP' ? 'selected' : ''}>Outpatient (OP)</option><option value="IP" ${visit.nat_type === 'IP' ? 'selected' : ''}>Inpatient (IP)</option></select></div><div class="field" style="grid-column: 1 / -1;"><label>Notes</label><textarea id="nat-notes" rows="3">${escapeHtml(visit.nat_notes || '')}</textarea></div></div></div>`;

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
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save Entire Record</button><button type="button" class="btn btn-secondary" id="btn-cancel-clinical">Back to Profile</button></div>
      </form>
    </div>
    
    <!-- PRINT LAYOUT: RX -->
    <div class="print-container" id="print-rx-area">
      <div class="print-header">
        <div class="print-header-brand"><h1>[HOSPITAL NAME PLACEHOLDER]</h1><p>Dental & Naturopathy Center<br>Karur / Sengal Branch [PLACEHOLDER]</p></div>
        <div class="print-header-doc"><h2>[DOCTOR NAME PLACEHOLDER]</h2><p>[QUALIFICATIONS PLACEHOLDER]<br>Reg No: [12345]</p></div>
      </div>
      <div class="print-patient-box">
        <div><strong>Patient:</strong> ${escapeHtml(patient.fullName)}<br><strong>ID / Age:</strong> ${escapeHtml(patient.patientId)} / ${escapeHtml(patient.dob)}</div>
        <div style="text-align:right;"><strong>Date:</strong> ${formatDate(visit.visitDate)}<br><strong>Gender:</strong> ${escapeHtml(patient.gender)}</div>
      </div>
      <div class="rx-watermark">Rx</div>
      <div id="print-rx-body"></div>
      <div class="print-footer"><div class="print-footer-address">Address Placeholder, Karur, TN<br>Phone: +91 99999 99999</div><div class="print-signature"><div class="print-signature-line"></div><strong>Doctor's Signature</strong></div></div>
    </div>

    <!-- PRINT LAYOUT: INVOICE -->
    <div class="print-container" id="print-inv-area">
      <div class="print-header">
        <div class="print-header-brand"><h1>[HOSPITAL NAME PLACEHOLDER]</h1><p>Karur / Sengal Branch</p></div>
        <div class="print-header-doc"><h2>OFFICIAL INVOICE</h2></div>
      </div>
      <div class="print-patient-box">
        <div><strong>Patient:</strong> ${escapeHtml(patient.fullName)}<br><strong>Visit ID:</strong> ${escapeHtml(visit.visitId)}</div>
        <div style="text-align:right;"><strong>Date:</strong> ${formatDate(visit.visitDate)}</div>
      </div>
      <div id="print-inv-body"></div>
      <div class="print-footer" style="justify-content: flex-end;"><div class="print-signature"><div class="print-signature-line"></div><strong>Authorized Signatory</strong></div></div>
    </div>
  `);

  document.getElementById('btn-cancel-clinical').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patient.patientId)}`));

  if (visit.department === 'Dental') {
    // Smart Select Toggle Logic
    ['clin-cc', 'clin-dx', 'clin-tx'].forEach(id => {
      document.getElementById(`${id}-select`).addEventListener('change', (e) => {
        document.getElementById(`${id}-text`).style.display = e.target.value === 'Other' ? 'block' : 'none';
      });
    });

    // Odontogram Modal Logic
    document.getElementById('odontogram-container').addEventListener('click', (e) => {
      if (e.target.classList.contains('tooth')) {
        const tNum = e.target.dataset.tooth; const currStatus = dentalChart[tNum] ? dentalChart[tNum].status : ''; const currNotes = dentalChart[tNum] ? dentalChart[tNum].notes : '';
        const modal = document.createElement('div'); modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-content"><h3>Tooth ${tNum}</h3><div class="field" style="margin-bottom:12px;"><label>Status</label><select id="modal-status" class="form-control" style="width:100%;"><option value="" ${currStatus === '' ? 'selected' : ''}>Healthy</option><option value="decayed" ${currStatus === 'decayed' ? 'selected' : ''}>Decayed</option><option value="filled" ${currStatus === 'filled' ? 'selected' : ''}>Filled</option><option value="missing" ${currStatus === 'missing' ? 'selected' : ''}>Missing</option><option value="planned" ${currStatus === 'planned' ? 'selected' : ''}>Treatment Planned</option></select></div><div class="field" style="margin-bottom:16px;"><label>Notes</label><input type="text" id="modal-notes" style="width:100%;" value="${escapeHtml(currNotes)}"></div><div class="form-actions" style="margin-top:0;"><button type="button" class="btn btn-primary" id="modal-save">Save</button><button type="button" class="btn btn-secondary" id="modal-close">Cancel</button></div></div>`;
        document.body.appendChild(modal);
        document.getElementById('modal-close').addEventListener('click', () => document.body.removeChild(modal));
        document.getElementById('modal-save').addEventListener('click', () => {
          const status = document.getElementById('modal-status').value; const notes = document.getElementById('modal-notes').value.trim();
          if (status === '' && notes === '') { delete dentalChart[tNum]; } else { dentalChart[tNum] = { status, notes }; }
          document.body.removeChild(modal); e.target.className = `tooth ${status}`; e.target.title = notes ? `Notes: ${notes}` : '';
        });
      }
    });

    // Rx Logic
    document.getElementById('rx-preset').addEventListener('change', (e) => {
      if(!e.target.value) return; const [dr, do_, fr, da] = e.target.value.split('|');
      document.getElementById('rx-drug').value = dr; document.getElementById('rx-dose').value = do_; document.getElementById('rx-freq').value = fr; document.getElementById('rx-days').value = da;
    });
    document.getElementById('btn-add-rx').addEventListener('click', () => {
      const drug = document.getElementById('rx-drug').value.trim(); if (!drug) return;
      rxList.push({ drug, dose: document.getElementById('rx-dose').value.trim(), freq: document.getElementById('rx-freq').value.trim(), days: document.getElementById('rx-days').value.trim() });
      document.getElementById('rx-container').innerHTML = renderRxTable(); document.getElementById('rx-preset').value = ''; document.getElementById('rx-drug').value = ''; document.getElementById('rx-dose').value = ''; document.getElementById('rx-freq').value = ''; document.getElementById('rx-days').value = ''; bindRxDeletes();
    });
    function bindRxDeletes() { document.querySelectorAll('.btn-delete-rx').forEach(btn => btn.addEventListener('click', (e) => { rxList.splice(e.target.dataset.idx, 1); document.getElementById('rx-container').innerHTML = renderRxTable(); bindRxDeletes(); })); } bindRxDeletes();

    // Invoice Logic
    document.getElementById('inv-preset').addEventListener('change', (e) => {
      if(!e.target.value) return; const [it, co] = e.target.value.split('|');
      document.getElementById('inv-item').value = it; document.getElementById('inv-cost').value = co;
    });
    document.getElementById('btn-add-inv').addEventListener('click', () => {
      const item = document.getElementById('inv-item').value.trim(); const cost = document.getElementById('inv-cost').value.trim(); if (!item || !cost) return;
      invoiceList.push({ item, cost });
      document.getElementById('inv-container').innerHTML = renderInvoiceTable(); document.getElementById('inv-preset').value = ''; document.getElementById('inv-item').value = ''; document.getElementById('inv-cost').value = ''; bindInvDeletes();
    });
    function bindInvDeletes() { document.querySelectorAll('.btn-delete-inv').forEach(btn => btn.addEventListener('click', (e) => { invoiceList.splice(e.target.dataset.idx, 1); document.getElementById('inv-container').innerHTML = renderInvoiceTable(); bindInvDeletes(); })); } bindInvDeletes();

    // Dual Print Logic
    document.getElementById('btn-print-rx').addEventListener('click', () => {
      if (rxList.length === 0) { alert('No medicines to print.'); return; }
      let html = `<table class="print-table"><tr><th>Drug Name</th><th>Dosage</th><th>Frequency</th><th>Days</th></tr>`;
      rxList.forEach(rx => { html += `<tr><td><strong>${escapeHtml(rx.drug)}</strong></td><td>${escapeHtml(rx.dose)}</td><td>${escapeHtml(rx.freq)}</td><td>${escapeHtml(rx.days)}</td></tr>`; });
      document.getElementById('print-rx-body').innerHTML = html + `</table>`;
      document.body.classList.add('printing-rx'); window.print(); document.body.classList.remove('printing-rx');
    });

    document.getElementById('btn-print-inv').addEventListener('click', () => {
      if (invoiceList.length === 0) { alert('No items to print.'); return; }
      let html = `<table class="print-table"><tr><th>Treatment / Item Description</th><th>Amount (₹)</th></tr>`;
      let total = 0;
      invoiceList.forEach(inv => { total += Number(inv.cost); html += `<tr><td>${escapeHtml(inv.item)}</td><td>₹${escapeHtml(inv.cost)}</td></tr>`; });
      document.getElementById('print-inv-body').innerHTML = html + `<tr><td><strong>TOTAL DUE</strong></td><td><strong>₹${total}</strong></td></tr></table>`;
      document.body.classList.add('printing-inv'); window.print(); document.body.classList.remove('printing-inv');
    });
  }

  function getSmartVal(id) { const sel = document.getElementById(`${id}-select`).value; return sel === 'Other' ? document.getElementById(`${id}-text`).value.trim() : sel; }

  document.getElementById('clinical-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    visit.vitals_bp = document.getElementById('vitals-bp').value.trim();
    visit.vitals_pulse = document.getElementById('vitals-pulse').value.trim();
    if (visit.department === 'Dental') {
      visit.clin_alerts = document.getElementById('clin-alerts').value.trim();
      visit.clin_cc = getSmartVal('clin-cc');
      visit.clin_dx = getSmartVal('clin-dx');
      visit.clin_tx = getSmartVal('clin-tx');
      visit.dental_chart = dentalChart; visit.rx_list = rxList; visit.invoice_list = invoiceList;
    } else {
      visit.nat_type = document.getElementById('nat-type').value; visit.nat_notes = document.getElementById('nat-notes').value.trim();
    }
    await window.KnhosVisits.updateVisit(visit);
    window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patient.patientId)}`);
  });
}

/* ==========================================================
   NEW CONSENT & ROUTING (Collapsed for brevity, identical)
   ========================================================== */
async function renderNewConsent(patientId) {
  const patient = await window.KnhosPatients.getPatient(patientId);
  setView(`<div class="view-header"><h1>New Consent</h1></div><div class="card"><div class="form-grid"><div class="field" style="grid-column: 1 / -1;"><label>Consent Type *</label><select id="consent-type"><option value="General Medical Consent">General Medical Consent</option><option value="Dental Procedure Consent">Dental Procedure</option></select></div><div class="field" style="grid-column: 1 / -1;"><label>Patient Signature *</label><div class="signature-container"><canvas id="signature-pad"></canvas></div><div><button type="button" class="btn btn-secondary btn-sm" id="btn-clear-sig">Clear</button></div></div></div><div class="form-actions"><button type="button" class="btn btn-primary" id="btn-save-consent">Save Consent</button></div></div>`);
  const canvas = document.getElementById('signature-pad'); const ctx = canvas.getContext('2d');
  function resizeCanvas() { const ratio = Math.max(window.devicePixelRatio || 1, 1); canvas.width = canvas.offsetWidth * ratio; canvas.height = canvas.offsetHeight * ratio; ctx.scale(ratio, ratio); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#1f4d43'; }
  resizeCanvas(); window.addEventListener('resize', resizeCanvas);
  let isDrawing = false;
  function getCoordinates(e) { const rect = canvas.getBoundingClientRect(); if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }; return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
  function startDrawing(e) { e.preventDefault(); isDrawing = true; const { x, y } = getCoordinates(e); ctx.beginPath(); ctx.moveTo(x, y); }
  function draw(e) { e.preventDefault(); if (!isDrawing) return; const { x, y } = getCoordinates(e); ctx.lineTo(x, y); ctx.stroke(); }
  function stopDrawing(e) { e.preventDefault(); isDrawing = false; }
  canvas.addEventListener('mousedown', startDrawing); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stopDrawing); canvas.addEventListener('mouseout', stopDrawing);
  canvas.addEventListener('touchstart', startDrawing, { passive: false }); canvas.addEventListener('touchmove', draw, { passive: false }); canvas.addEventListener('touchend', stopDrawing, { passive: false });
  document.getElementById('btn-clear-sig').addEventListener('click', () => ctx.clearRect(0, 0, canvas.width, canvas.height));
  document.getElementById('btn-save-consent').addEventListener('click', async () => {
    try { await window.KnhosConsents.createConsent({ patientId, type: document.getElementById('consent-type').value, text: `I consent.`, signatureData: canvas.toDataURL('image/png') }); window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patientId)}`); } catch (err) { alert('Error: ' + err.message); }
  });
}
function renderBackup() { setView(`<div class="view-header"><h1>Backup</h1></div><div class="card"><p>Placeholder</p></div>`); }

window.KnhosRouter.registerRoute('#/home', renderHome);
window.KnhosRouter.registerRoute('#/patients/new', () => renderNewPatient(pendingRegistration));
window.KnhosRouter.registerRoute('#/patients', () => renderPatientsListOrSearch('#/patients', 'Patients', ''));
window.KnhosRouter.registerRoute('#/search', () => renderPatientsListOrSearch('#/search', 'Search', ''));
window.KnhosRouter.registerRoute('#/backup', renderBackup);
window.KnhosRouter.registerRoute('#/patients/:id/visits/new', (params) => renderNewVisit(params.id));
window.KnhosRouter.registerRoute('#/patients/:id/consents/new', (params) => renderNewConsent(params.id));
window.KnhosRouter.registerRoute('#/visits/:id', (params) => renderClinicalRecord(params.id));
window.KnhosRouter.registerRoute('#/patients/:id', (params, query) => renderPatientProfile(params.id, query.get('created') === '1'));
navButtons.forEach((btn) => btn.addEventListener('click', () => { pendingRegistration = null; window.KnhosRouter.navigate(btn.dataset.route); }));
document.getElementById('brand-home-btn').addEventListener('click', () => window.KnhosRouter.navigate('#/home'));

async function initApp() {
  try { await window.KnhosDB.openDatabase(); } catch (err) { alert('DB Error'); return; }
  window.KnhosRouter.startRouter();
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('service-worker.js', { scope: './' }).catch(()=>{}); }
}
initApp();
})();
