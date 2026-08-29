(function () {
'use strict';
const viewRoot = document.getElementById('view-root');
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function setActiveNav(routeHash) {
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.route === routeHash));
}
async function setView(html) {
  viewRoot.innerHTML = html;
  window.scrollTo(0, 0);
}

/* =========================================================================
   STEP 1: Context Bar
   ========================================================================= */

async function updateContextBar() {
  const bar = document.getElementById('dynamic-context-bar');
  if (!bar) return;

  const waitingVisits = await window.KnhosVisits.getWaitingVisits();
  const activeVisitId = localStorage.getItem('knhos_active_visit');
  let html = '';

  if (waitingVisits.length > 0) {
    html += `<button class="context-btn btn-waiting" type="button" id="btn-nav-queue">Waiting Room <span class="badge">${waitingVisits.length}</span></button>`;
  } else {
    html += `<button class="context-btn btn-waiting-empty" type="button" id="btn-nav-queue">Waiting Room (0)</button>`;
  }

  if (activeVisitId) {
    const activeVisit = await window.KnhosVisits.getVisit(activeVisitId);
    if (activeVisit && activeVisit.status !== 'completed') {
      const patient = await window.KnhosPatients.getPatient(activeVisit.patientId);
      html += `<button class="context-btn btn-active-patient" type="button" id="btn-nav-active">Treating: ${escapeHtml(patient ? patient.fullName : 'Unknown')}</button>`;
    } else {
      // Visit no longer exists or was already closed elsewhere - stale pointer, drop it.
      localStorage.removeItem('knhos_active_visit');
    }
  }

  bar.innerHTML = html;

  const queueBtn = document.getElementById('btn-nav-queue');
  if (queueBtn) queueBtn.addEventListener('click', () => window.KnhosRouter.navigate('#/queue'));

  const activeBtn = document.getElementById('btn-nav-active');
  if (activeBtn) {
    activeBtn.addEventListener('click', () => {
      const id = localStorage.getItem('knhos_active_visit');
      if (id) window.KnhosRouter.navigate(`#/visits/${id}`);
    });
  }
}

/* =========================================================================
   STEP 2/3: Odontogram, clinical tabs, auto-summary, rules engine
   (module-scoped state - reset each time a clinical record view is opened)
   ========================================================================= */

const ADULT_UPPER = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28];
const ADULT_LOWER = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38];
const PRIMARY_UPPER = [55,54,53,52,51, 61,62,63,64,65];
const PRIMARY_LOWER = [85,84,83,82,81, 71,72,73,74,75];

const FINDING_LABELS = {
  'deep-caries': 'Deep Caries', 'moderate-caries': 'Moderate Caries', 'mobile': 'Mobile',
  'fractured': 'Fractured', 'periapical-abscess': 'Periapical Abscess', 'missing': 'Missing',
  'impacted': 'Impacted'
};
const TX_LABELS = {
  'rct': 'RCT', 'extraction': 'Extraction', 'crown-prep': 'Crown Prep',
  'filling': 'Filling', 'braces': 'Braces', 'scaling': 'Scaling'
};
const TX_DONE_LABELS = {
  'excavation': 'Excavation', 'rct-started': 'RCT Started', 'rct-completed': 'RCT Completed',
  'extraction-done': 'Extraction Done', 'filling-done': 'Filling Placed'
};
const TREATMENT_TIMELINE_DAYS = {
  'extraction': 7, 'crown-prep': 10, 'braces': 30, 'rct': 5, 'filling': 14, 'scaling': 30
};

let currentMode = 'adult';
let toothRecords = {};
let currentVisit = null;
let currentPatient = null;
let activeToothNumber = null;
let rxItems = [];
let invoiceItems = [];

function getAgeFromDob(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}
function defaultModeForPatient(patient) {
  const age = getAgeFromDob(patient && patient.dob);
  if (age === null) return 'adult';
  return age > 12 ? 'adult' : 'primary';
}

function buildArchPositions(count, isUpper) {
  const positions = [];
  const centerX = 400, radiusX = 340, radiusY = 160;
  const startAngle = Math.PI * 0.12, endAngle = Math.PI * 0.88;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = startAngle + t * (endAngle - startAngle);
    const x = centerX - radiusX * Math.cos(angle);
    const y = isUpper
      ? 30 + radiusY * (1 - Math.sin(angle))
      : 190 - radiusY * (1 - Math.sin(angle));
    const rotation = (angle - Math.PI / 2) * (180 / Math.PI) * (isUpper ? 1 : -1);
    positions.push({ x, y, rotation });
  }
  return positions;
}

function renderArch(svgEl, toothNumbers, isUpper) {
  if (!svgEl) return;
  const positions = buildArchPositions(toothNumbers.length, isUpper);
  svgEl.innerHTML = '';
  toothNumbers.forEach((toothNum, i) => {
    const { x, y, rotation } = positions[i];
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${x},${y}) rotate(${rotation})`);

    const record = toothRecords[toothNum] || {};
    const shapeClass = ['tooth-shape',
      record.finding ? 'has-finding' : '',
      record.txPlanned ? 'has-tx-planned' : '',
      record.txDone ? 'has-tx-done' : ''
    ].filter(Boolean).join(' ');

    g.innerHTML = `
      <circle class="tooth-hit-area" cx="0" cy="0" r="22" data-tooth="${toothNum}"></circle>
      <path class="${shapeClass}" d="M -10,-16 Q 0,-22 10,-16 L 8,10 Q 0,18 -8,10 Z" data-tooth="${toothNum}"></path>
      <text class="tooth-number-label" x="0" y="${isUpper ? -28 : 32}">${toothNum}</text>
    `;
    svgEl.appendChild(g);
  });
}

function renderOdontogram() {
  let upperTeeth, lowerTeeth;
  if (currentMode === 'adult') {
    upperTeeth = ADULT_UPPER; lowerTeeth = ADULT_LOWER;
  } else if (currentMode === 'primary') {
    upperTeeth = PRIMARY_UPPER; lowerTeeth = PRIMARY_LOWER;
  } else {
    upperTeeth = [...ADULT_UPPER, ...PRIMARY_UPPER];
    lowerTeeth = [...ADULT_LOWER, ...PRIMARY_LOWER];
  }
  renderArch(document.getElementById('upper-arch-svg'), upperTeeth, true);
  renderArch(document.getElementById('lower-arch-svg'), lowerTeeth, false);
}

function openToothModal(toothNum) {
  activeToothNumber = toothNum;
  const record = toothRecords[toothNum] || {};
  document.getElementById('tooth-modal-title').textContent = `Tooth #${toothNum}`;
  document.getElementById('finding-select').value = record.finding || '';
  document.getElementById('tx-planned-select').value = record.txPlanned || '';
  document.getElementById('tx-done-select').value = record.txDone || '';
  document.getElementById('consent-linked-badge').classList.toggle('hidden', !record.consentLinked);

  document.querySelectorAll('.tooth-tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.querySelectorAll('.tooth-tab-panel').forEach((p, i) => p.classList.toggle('hidden', i !== 0));

  document.getElementById('tooth-modal-backdrop').classList.remove('hidden');
}
function closeToothModal() {
  document.getElementById('tooth-modal-backdrop').classList.add('hidden');
  activeToothNumber = null;
}

// --- STEP 3: Auto-summary ---
function generateClinicalSummary(records) {
  const findings = [], txPlanned = [], txDone = [];
  Object.keys(records).forEach((toothNum) => {
    const r = records[toothNum];
    if (r.finding) findings.push(`#${toothNum} (${FINDING_LABELS[r.finding] || r.finding})`);
    if (r.txPlanned) txPlanned.push(`#${toothNum} (${TX_LABELS[r.txPlanned] || r.txPlanned})`);
    if (r.txDone) txDone.push(`#${toothNum} (${TX_DONE_LABELS[r.txDone] || r.txDone})`);
  });
  const parts = [];
  if (findings.length) parts.push(`Findings: ${findings.join(', ')}.`);
  if (txPlanned.length) parts.push(`Tx Planned: ${txPlanned.join(', ')}.`);
  if (txDone.length) parts.push(`Tx Done: ${txDone.join(', ')}.`);
  return parts.join(' ') || 'No findings or treatments recorded.';
}

// --- STEP 3: Rules engine ---
function suggestNextAppointment(records, fromDate = new Date()) {
  let shortestDays = null, drivingTreatment = null;
  Object.values(records).forEach((r) => {
    const txKey = r.txPlanned;
    if (!txKey) return;
    const days = TREATMENT_TIMELINE_DAYS[txKey];
    if (days === undefined) return; // unmapped treatment: skip rather than throw
    if (shortestDays === null || days < shortestDays) {
      shortestDays = days;
      drivingTreatment = txKey;
    }
  });
  if (shortestDays === null) {
    return { suggestedDate: null, days: null, reason: 'No treatment planned — no auto-suggestion.' };
  }
  // Constructor args, not string parsing - avoids iPad Safari timezone off-by-one-day bugs.
  const suggested = new Date(
    fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + shortestDays
  );
  return {
    suggestedDate: suggested,
    days: shortestDays,
    reason: `Based on ${TX_LABELS[drivingTreatment]} (${shortestDays}-day timeline, most urgent of planned treatments).`
  };
}
function formatDateForInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function onFinishTreatmentClick() {
  const summary = generateClinicalSummary(toothRecords);
  const suggestion = suggestNextAppointment(toothRecords);

  currentVisit.clinicalSummary = summary;
  currentVisit.toothRecords = toothRecords;
  currentVisit.suggestedNextAppointment = suggestion.suggestedDate ? suggestion.suggestedDate.toISOString() : null;
  currentVisit.suggestedNextAppointmentReason = suggestion.reason;
  await window.KnhosVisits.updateVisit(currentVisit);

  return { summary, suggestion };
}

/* =========================================================================
   STEP 4: Checkout screen helpers
   ========================================================================= */

function renderRxList() {
  const container = document.getElementById('rx-list');
  if (!container) return;
  container.innerHTML = rxItems.map((r, i) =>
    `<div class="rx-line-item">${escapeHtml(r.drug)} — ${escapeHtml(r.dosage)}
      <button type="button" data-idx="${i}" class="rx-remove-btn">✕</button></div>`
  ).join('');
}
function renderInvoiceList() {
  const container = document.getElementById('invoice-list');
  if (!container) return;
  container.innerHTML = invoiceItems.map((it, i) =>
    `<div class="invoice-line-item">${escapeHtml(it.item)} — ₹${it.amount}
      <button type="button" data-idx="${i}" class="invoice-remove-btn">✕</button></div>`
  ).join('');
  const total = invoiceItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const totalEl = document.getElementById('invoice-total-amount');
  if (totalEl) totalEl.textContent = total;
}

function populatePrintRxDoc() {
  document.getElementById('print-rx-patient-name').textContent = currentPatient.fullName;
  const age = getAgeFromDob(currentPatient.dob);
  document.getElementById('print-rx-patient-age').textContent = age === null ? '—' : age;
  document.getElementById('print-rx-patient-sex').textContent = currentPatient.sex || '—';
  document.getElementById('print-rx-date').textContent = new Date().toLocaleDateString();
  document.getElementById('print-rx-items').innerHTML = rxItems
    .map((r) => `<div class="rx-line">${escapeHtml(r.drug)} — ${escapeHtml(r.dosage)}</div>`).join('')
    || '<div class="rx-line">—</div>';
}
function populatePrintInvoiceDoc() {
  document.getElementById('print-invoice-patient-name').textContent = currentPatient.fullName;
  const age = getAgeFromDob(currentPatient.dob);
  document.getElementById('print-invoice-patient-age').textContent = age === null ? '—' : age;
  document.getElementById('print-invoice-date').textContent = new Date().toLocaleDateString();
  document.getElementById('print-invoice-rows').innerHTML = invoiceItems
    .map((it) => `<tr><td>${escapeHtml(it.item)}</td><td>₹${it.amount}</td></tr>`).join('');
  const total = invoiceItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  document.getElementById('print-invoice-total').textContent = `₹${total}`;
}

/* =========================================================================
   Static, page-load-time listeners for the modal & print docs
   (these elements live outside #view-root and are never re-rendered by the router,
   so they are wired exactly once here rather than inside each view function)
   ========================================================================= */

document.getElementById('tooth-modal-close').addEventListener('click', closeToothModal);
document.getElementById('tooth-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'tooth-modal-backdrop') closeToothModal();
});
document.querySelectorAll('.tooth-tab-btn').forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tooth-tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tooth-tab-panel').forEach((p) => p.classList.add('hidden'));
    btn.classList.add('active');
    document.querySelectorAll('.tooth-tab-panel')[idx].classList.remove('hidden');
  });
});

// Link Consent: wired to the REAL window.KnhosConsents utility from the baseline,
// not a stub - the consent record is actually created and persisted in IndexedDB.
document.getElementById('link-consent-btn').addEventListener('click', async () => {
  if (!activeToothNumber || !currentPatient || !currentVisit) return;
  const consent = await window.KnhosConsents.createConsent({
    patientId: currentPatient.patientId,
    visitId: currentVisit.visitId,
    toothNumber: activeToothNumber,
    consentType: 'treatment'
  });
  toothRecords[activeToothNumber] = toothRecords[activeToothNumber] || {};
  toothRecords[activeToothNumber].consentLinked = true;
  toothRecords[activeToothNumber].consentId = consent.consentId;
  document.getElementById('consent-linked-badge').classList.remove('hidden');
});

document.getElementById('tooth-modal-save').addEventListener('click', async () => {
  if (!activeToothNumber) return;
  toothRecords[activeToothNumber] = {
    ...(toothRecords[activeToothNumber] || {}),
    finding: document.getElementById('finding-select').value,
    txPlanned: document.getElementById('tx-planned-select').value,
    txDone: document.getElementById('tx-done-select').value
  };
  // Persist progressively so chart data survives an app close/reload mid-visit.
  if (currentVisit) {
    currentVisit.toothRecords = toothRecords;
    await window.KnhosVisits.updateVisit(currentVisit);
  }
  closeToothModal();
  renderOdontogram();
});

/* =========================================================================
   Views
   ========================================================================= */

function renderHome() {
  setActiveNav('#/home');
  setView(`<h1>Home</h1><div class="card"><p>Welcome to KNHOS Lite</p></div>`);
}

// Patients list, filterable by name/ID. Registered at '#/patients'.
async function renderPatientsListOrSearch() {
  setActiveNav('#/patients');
  setView(`
    <div class="view-header"><h1>Patients</h1></div>
    <div class="field" style="margin-bottom:20px;">
      <input type="search" id="patient-search-input" placeholder="Search by name or patient ID...">
    </div>
    <div id="patient-list-container"></div>
  `);

  const input = document.getElementById('patient-search-input');
  const container = document.getElementById('patient-list-container');

  async function runSearch(q) {
    let results = await window.KnhosPatients.listPatients();
    if (q) {
      const lowerQ = q.toLowerCase();
      results = results.filter((p) =>
        (p.fullName && p.fullName.toLowerCase().includes(lowerQ)) ||
        (p.patientId && p.patientId.toLowerCase().includes(lowerQ)));
    }
    container.innerHTML = results.length === 0
      ? '<div class="card">No matches.</div>'
      : results.map((p) => `
        <div class="patient-row" data-id="${escapeHtml(p.patientId)}">
          <div><strong>${escapeHtml(p.fullName)}</strong><br><small>${escapeHtml(p.patientId)}</small></div>
        </div>
      `).join('');
    container.querySelectorAll('.patient-row').forEach((row) =>
      row.addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${row.dataset.id}`)));
  }

  input.addEventListener('input', () => runSearch(input.value.trim()));
  await runSearch('');
}

// New patient registration form. Registered at '#/patients/new'.
function renderNewPatient() {
  setActiveNav('#/patients/new');
  setView(`
    <div class="view-header"><h1>New Patient</h1></div>
    <div class="card">
      <form id="new-patient-form">
        <div class="form-grid">
          <div class="field"><label>Full Name *</label><input type="text" id="fullName" required></div>
          <div class="field"><label>Date of Birth *</label><input type="date" id="dob" required></div>
          <div class="field"><label>Gender *</label>
            <select id="gender" required>
              <option value="" disabled selected>Select…</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="field"><label>Phone</label><input type="tel" id="phone"></div>
        </div>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save Patient</button></div>
      </form>
    </div>
  `);
  document.getElementById('new-patient-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      fullName: document.getElementById('fullName').value.trim(),
      dob: document.getElementById('dob').value,
      gender: document.getElementById('gender').value,
      phone: document.getElementById('phone').value.trim()
    };
    const record = await window.KnhosPatients.createPatient(data);
    window.KnhosRouter.navigate(`#/patients/${record.patientId}`);
  });
}

// New digital consent, with a real touch/mouse signature pad.
// Wired to the confirmed window.KnhosConsents.createConsent(data) signature.
async function renderNewConsent(patientId) {
  setActiveNav('__none__');
  const patient = await window.KnhosPatients.getPatient(patientId);
  setView(`
    <div class="view-header"><h1>New Consent</h1><p>${escapeHtml(patient.fullName)}</p></div>
    <div class="card">
      <div class="field" style="margin-bottom:12px;">
        <label>Consent Type</label>
        <select id="consent-type">
          <option value="General">General Medical Consent</option>
          <option value="Dental Procedure">Dental Procedure</option>
        </select>
      </div>
      <div class="field">
        <label>Patient Signature *</label>
        <div class="signature-pad-wrapper">
          <canvas id="signature-pad"></canvas>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-sig">Clear Signature</button>
      </div>
      <div class="form-actions"><button type="button" class="btn btn-primary" id="btn-save-consent">Save Consent</button></div>
    </div>
  `);

  const canvas = document.getElementById('signature-pad');
  const ctx = canvas.getContext('2d');
  function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1f4d43';
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  let isDrawing = false;
  function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function startDrawing(e) { e.preventDefault(); isDrawing = true; const { x, y } = getCoords(e); ctx.beginPath(); ctx.moveTo(x, y); }
  function draw(e) { e.preventDefault(); if (!isDrawing) return; const { x, y } = getCoords(e); ctx.lineTo(x, y); ctx.stroke(); }
  function stopDrawing(e) { e.preventDefault(); isDrawing = false; }

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing, { passive: false });

  document.getElementById('btn-clear-sig').addEventListener('click', () => ctx.clearRect(0, 0, canvas.width, canvas.height));

  document.getElementById('btn-save-consent').addEventListener('click', async () => {
    try {
      await window.KnhosConsents.createConsent({
        patientId,
        type: document.getElementById('consent-type').value,
        text: 'I consent to the described treatment.',
        signatureData: canvas.toDataURL('image/png')
      });
      window.KnhosRouter.navigate(`#/patients/${patientId}`);
    } catch (err) {
      alert('Error saving consent: ' + err.message);
    }
  });
}

async function renderPatientProfile(patientId) {
  setActiveNav('__none__');
  const patient = await window.KnhosPatients.getPatient(patientId);
  const visits = await window.KnhosVisits.listVisitsForPatient(patientId);

  const statusClass = (s) => `visit-status-badge visit-status-${s || 'waiting'}`;
  let visitsHtml = visits.map((v) => `
    <div class="card visit-row">
      <span>Visit: ${escapeHtml(v.visitDate)} - ${escapeHtml(v.reason)}</span>
      <span class="${statusClass(v.status)}">${escapeHtml(v.status || 'waiting')}</span>
      <button class="btn btn-secondary open-visit-btn" type="button" data-id="${v.visitId}">Open</button>
    </div>
  `).join('');

  setView(`
    <div class="view-header"><h1>${escapeHtml(patient.fullName)}</h1></div>
    <div class="card">
      <button class="btn btn-primary" id="btn-new-visit" type="button">New Visit Intake</button>
      <button class="btn btn-secondary" id="btn-new-consent" type="button">New Digital Consent</button>
    </div>
    ${visitsHtml}
  `);

  document.getElementById('btn-new-visit').addEventListener('click', () =>
    window.KnhosRouter.navigate(`#/patients/${patientId}/visits/new`));
  document.getElementById('btn-new-consent').addEventListener('click', () =>
    window.KnhosRouter.navigate(`#/patients/${patientId}/consents/new`));
  document.querySelectorAll('.open-visit-btn').forEach((btn) =>
    btn.addEventListener('click', (e) => window.KnhosRouter.navigate(`#/visits/${e.target.dataset.id}`)));
}

async function renderNewVisit(patientId) {
  const patient = await window.KnhosPatients.getPatient(patientId);
  setView(`
    <h1>New Visit Intake for ${escapeHtml(patient.fullName)}</h1>
    <div class="card">
      <form id="visit-form">
        <label>Reason</label><input type="text" id="reason" required>
        <button type="submit" class="btn btn-primary">Create Visit</button>
      </form>
    </div>
  `);
  document.getElementById('visit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await window.KnhosVisits.createVisit({
      patientId,
      department: 'Dental',
      visitDate: new Date().toISOString().split('T')[0],
      reason: document.getElementById('reason').value
    });
    await updateContextBar();
    window.KnhosRouter.navigate(`#/patients/${patientId}`);
  });
}

// STEP 1: Waiting room queue view
async function renderQueue() {
  setActiveNav('__none__');
  const waiting = await window.KnhosVisits.getWaitingVisits();

  const rows = await Promise.all(waiting.map(async (v) => {
    const patient = await window.KnhosPatients.getPatient(v.patientId);
    return `
      <div class="card visit-row">
        <span>${escapeHtml(patient ? patient.fullName : 'Unknown')}</span>
        <span>${escapeHtml(v.reason || '')}</span>
        <button class="btn btn-primary call-to-chair-btn" type="button" data-visit-id="${v.visitId}">Call to Chair</button>
      </div>
    `;
  }));

  setView(`<h1>Waiting Room</h1>${rows.join('') || '<div class="card">No patients waiting.</div>'}`);

  document.querySelectorAll('.call-to-chair-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const visitId = btn.dataset.visitId;
      const visit = await window.KnhosVisits.setVisitStatus(visitId, 'in-progress');
      if (!visit) return;
      localStorage.setItem('knhos_active_visit', visit.visitId);
      await updateContextBar();
      window.KnhosRouter.navigate(`#/visits/${visit.visitId}`);
    });
  });
}

// STEP 2/3/4: The dental clinical record view - odontogram + checkout, one route
async function renderVisitClinicalRecord(visitId) {
  setActiveNav('__none__');

  const visit = await window.KnhosVisits.getVisit(visitId);
  if (!visit) { setView(`<div class="card">Visit not found.</div>`); return; }
  const patient = await window.KnhosPatients.getPatient(visit.patientId);

  // Guard clause: a visit opened directly (e.g. from the patient profile) while
  // still 'waiting' is promoted to 'in-progress' so it doesn't sit orphaned in
  // the queue while a doctor is actively looking at it.
  if (visit.status === 'waiting') {
    visit.status = 'in-progress';
    await window.KnhosVisits.updateVisit(visit);
  }
  if (visit.status !== 'completed') {
    localStorage.setItem('knhos_active_visit', visit.visitId);
  }
  await updateContextBar();

  currentVisit = visit;
  currentPatient = patient;
  toothRecords = visit.toothRecords || {};
  rxItems = visit.rxItems || [];
  invoiceItems = visit.invoiceItems || [];
  currentMode = defaultModeForPatient(patient);

  setView(`
    <div class="clinical-record-header">
      <h1>${escapeHtml(patient.fullName)}</h1>
      <span class="visit-meta">Visit ${escapeHtml(visit.visitId)} &middot; ${escapeHtml(visit.reason || '')}</span>
    </div>

    <section id="odontogram-section" class="odontogram-view">
      <div class="dentition-toggle" role="tablist" aria-label="Dentition type">
        <button class="dent-toggle-btn" type="button" data-mode="adult">Adult (32)</button>
        <button class="dent-toggle-btn" type="button" data-mode="primary">Primary (20)</button>
        <button class="dent-toggle-btn" type="button" data-mode="mixed">Mixed</button>
      </div>

      <div id="odontogram-container">
        <div class="arch-wrapper">
          <div class="arch-label">Upper</div>
          <svg id="upper-arch-svg" viewBox="0 0 800 220"></svg>
        </div>
        <div class="arch-wrapper">
          <div class="arch-label">Lower</div>
          <svg id="lower-arch-svg" viewBox="0 0 800 220"></svg>
        </div>
      </div>

      <div class="odontogram-actions">
        <button id="finish-treatment-btn" type="button" class="btn btn-primary">Finish Treatment</button>
      </div>
    </section>

    <section id="checkout-screen" class="checkout-screen hidden">
      <div class="checkout-header">
        <h2>Finish Treatment — Proofread</h2>
        <span id="checkout-patient-name"></span>
      </div>

      <div class="checkout-block">
        <h3>Clinical Summary</h3>
        <p id="checkout-summary-text" class="summary-readonly"></p>
      </div>

      <div class="checkout-block">
        <h3>Prescription (Rx)</h3>
        <div id="rx-list"></div>
        <div class="rx-add-row">
          <input type="text" id="rx-drug-input" placeholder="Drug name">
          <input type="text" id="rx-dosage-input" placeholder="Dosage (e.g. 500mg TID x 5d)">
          <button id="rx-add-btn" type="button">+ Add</button>
        </div>
      </div>

      <div class="checkout-block">
        <h3>Invoice</h3>
        <div id="invoice-list"></div>
        <div class="invoice-add-row">
          <input type="text" id="invoice-item-input" placeholder="Item / Procedure">
          <input type="number" id="invoice-amount-input" placeholder="₹ Amount">
          <button id="invoice-add-btn" type="button">+ Add</button>
        </div>
        <div class="invoice-total">Total: ₹<span id="invoice-total-amount">0</span></div>
      </div>

      <div class="checkout-block">
        <h3>Next Appointment</h3>
        <label class="next-appt-label">
          Suggested date <span id="next-appt-reason" class="reason-text"></span>
          <input type="date" id="next-appt-date-input">
        </label>
      </div>

      <div class="checkout-actions">
        <button id="print-rx-btn" type="button" class="checkout-btn secondary">Print Rx</button>
        <button id="print-invoice-btn" type="button" class="checkout-btn secondary">Print Invoice</button>
        <button id="save-close-visit-btn" type="button" class="checkout-btn primary">Save &amp; Close Visit</button>
      </div>
    </section>
  `);

  // --- wire dentition toggle ---
  document.querySelectorAll('.dent-toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dent-toggle-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      renderOdontogram();
    });
  });

  // --- wire tooth taps ---
  document.getElementById('odontogram-container').addEventListener('click', (e) => {
    const toothNum = e.target.dataset.tooth;
    if (!toothNum) return;
    openToothModal(toothNum);
  });

  renderOdontogram();

  // --- wire Finish Treatment ---
  document.getElementById('finish-treatment-btn').addEventListener('click', async () => {
    const { summary, suggestion } = await onFinishTreatmentClick();

    document.getElementById('checkout-patient-name').textContent = currentPatient.fullName;
    document.getElementById('checkout-summary-text').textContent = summary;
    document.getElementById('next-appt-reason').textContent = suggestion.reason || '';
    document.getElementById('next-appt-date-input').value = suggestion.suggestedDate
      ? formatDateForInput(suggestion.suggestedDate) : '';

    renderRxList();
    renderInvoiceList();

    document.getElementById('odontogram-section').classList.add('hidden');
    document.getElementById('checkout-screen').classList.remove('hidden');
  });

  // --- wire Rx builder ---
  document.getElementById('rx-add-btn').addEventListener('click', () => {
    const drug = document.getElementById('rx-drug-input').value.trim();
    const dosage = document.getElementById('rx-dosage-input').value.trim();
    if (!drug) return;
    rxItems.push({ drug, dosage });
    document.getElementById('rx-drug-input').value = '';
    document.getElementById('rx-dosage-input').value = '';
    renderRxList();
  });
  document.getElementById('rx-list').addEventListener('click', (e) => {
    const idx = e.target.dataset.idx;
    if (idx === undefined) return;
    rxItems.splice(Number(idx), 1);
    renderRxList();
  });

  // --- wire Invoice builder ---
  document.getElementById('invoice-add-btn').addEventListener('click', () => {
    const item = document.getElementById('invoice-item-input').value.trim();
    const amount = document.getElementById('invoice-amount-input').value;
    if (!item || !amount) return;
    invoiceItems.push({ item, amount: Number(amount) });
    document.getElementById('invoice-item-input').value = '';
    document.getElementById('invoice-amount-input').value = '';
    renderInvoiceList();
  });
  document.getElementById('invoice-list').addEventListener('click', (e) => {
    const idx = e.target.dataset.idx;
    if (idx === undefined) return;
    invoiceItems.splice(Number(idx), 1);
    renderInvoiceList();
  });

  // --- wire Print buttons ---
  document.getElementById('print-rx-btn').addEventListener('click', () => {
    populatePrintRxDoc();
    document.body.classList.add('printing-rx');
    window.print();
    document.body.classList.remove('printing-rx');
  });
  document.getElementById('print-invoice-btn').addEventListener('click', () => {
    populatePrintInvoiceDoc();
    document.body.classList.add('printing-invoice');
    window.print();
    document.body.classList.remove('printing-invoice');
  });

  // --- wire Save & Close Visit ---
  document.getElementById('save-close-visit-btn').addEventListener('click', async () => {
    currentVisit.status = 'completed';
    currentVisit.rxItems = rxItems;
    currentVisit.invoiceItems = invoiceItems;
    currentVisit.nextAppointmentDate = document.getElementById('next-appt-date-input').value;
    await window.KnhosVisits.updateVisit(currentVisit);

    localStorage.removeItem('knhos_active_visit');
    await updateContextBar();
    window.KnhosRouter.navigate(`#/patients/${currentPatient.patientId}`);
  });
}

/* =========================================================================
   Routing & init
   ========================================================================= */

window.KnhosRouter.registerRoute('#/home', renderHome);
window.KnhosRouter.registerRoute('#/patients', renderPatientsListOrSearch);
window.KnhosRouter.registerRoute('#/search', renderPatientsListOrSearch);
window.KnhosRouter.registerRoute('#/patients/new', renderNewPatient);
window.KnhosRouter.registerRoute('#/patients/:id', (params) => renderPatientProfile(params.id));
window.KnhosRouter.registerRoute('#/patients/:id/visits/new', (params) => renderNewVisit(params.id));
window.KnhosRouter.registerRoute('#/patients/:id/consents/new', (params) => renderNewConsent(params.id));
window.KnhosRouter.registerRoute('#/queue', renderQueue);
window.KnhosRouter.registerRoute('#/visits/:id', (params) => renderVisitClinicalRecord(params.id));

navButtons.forEach((btn) => btn.addEventListener('click', () => window.KnhosRouter.navigate(btn.dataset.route)));
document.getElementById('brand-home-btn').addEventListener('click', () => window.KnhosRouter.navigate('#/home'));

// Keep the context bar in sync on every route change, not just on load.
window.addEventListener('hashchange', () => { updateContextBar(); });

async function initApp() {
  await window.KnhosDB.openDatabase();
  window.KnhosRouter.startRouter();
  await updateContextBar();
}
initApp();
})();
