/**
 * app.js
 * Step 1: Context-Aware Navigation & Waiting Room  Queue
 */

(function () {
'use strict';

const viewRoot = document.getElementById('view-root');
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));

function escapeHtml(str) { return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatDate(isoString) { if (!isoString) return '—'; const d = new Date(isoString); if (Number.isNaN(d.getTime())) return isoString; return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatDateTime(isoString) { if (!isoString) return '—'; const d = new Date(isoString); if (Number.isNaN(d.getTime())) return isoString; return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`; }

function setActiveNav(routeHash) {
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.route === routeHash));
}

// Automatically updates the top navigation badges every time the screen changes
async function updateContextBar() {
  const bar = document.getElementById('dynamic-context-bar');
  if (!bar) return;

  const waitingVisits = await window.KnhosVisits.getWaitingVisits();
  const activeVisitId = localStorage.getItem('knhos_active_visit');
  let html = '';

  // 1. The Waiting Room Badge
  if (waitingVisits.length > 0) {
    html += `<button class="context-btn btn-waiting" id="btn-nav-queue">Waiting Room <span class="badge">${waitingVisits.length}</span></button>`;
  } else {
    html += `<button class="context-btn btn-waiting-empty" id="btn-nav-queue">Waiting Room (0)</button>`;
  }

  // 2. The Active Patient Tracker (The Dentist's Chair)
  if (activeVisitId) {
    const activeVisit = await window.KnhosVisits.getVisit(activeVisitId);
    if (activeVisit) {
      const patient = await window.KnhosPatients.getPatient(activeVisit.patientId);
      const name = patient ? patient.fullName : 'Unknown';
      html += `<button class="context-btn btn-active-patient" id="btn-nav-active">Treating: ${escapeHtml(name)}</button>`;
    } else {
      localStorage.removeItem('knhos_active_visit'); // Cleanup if deleted
    }
  }

  bar.innerHTML = html;

  const queueBtn = document.getElementById('btn-nav-queue');
  if (queueBtn) queueBtn.addEventListener('click', () => window.KnhosRouter.navigate('#/queue'));

  const activeBtn = document.getElementById('btn-nav-active');
  if (activeBtn) activeBtn.addEventListener('click', () => window.KnhosRouter.navigate(`#/visits/${encodeURIComponent(activeVisitId)}`));
}

// Master view setter
async function setView(html) {
  viewRoot.innerHTML = html;
  viewRoot.scrollTop = 0;
  window.scrollTo(0, 0);
  await updateContextBar();
}

/* ==========================================================
   THE WAITING ROOM QUEUE (NEW ROUTE)
   ========================================================== */
async function renderQueue() {
  setActiveNav('__none__');
  const waitingVisits = await window.KnhosVisits.getWaitingVisits();

  let listHtml = '';
  if (waitingVisits.length === 0) {
    listHtml = `<div class="empty-state">No patients currently waiting.</div>`;
  } else {
    // We map through the waiting visits to grab the patient names
    const items = await Promise.all(waitingVisits.map(async (v) => {
      const p = await window.KnhosPatients.getPatient(v.patientId);
      return `
        <div class="patient-row">
          <div style="flex:1;">
            <span class="patient-row-name">${escapeHtml(p.fullName)}</span>
            <span class="patient-row-id">Cause: ${escapeHtml(v.reason || 'Not specified')}</span>
            <div style="margin-top: 6px;"><span class="visit-dept-badge">${escapeHtml(v.department)}</span></div>
          </div>
          <div>
            <button class="btn btn-primary btn-start-visit" data-visit="${escapeHtml(v.visitId)}">Call to Chair (Start)</button>
          </div>
        </div>
      `;
    }));
    listHtml = `<div class="patient-list">${items.join('')}</div>`;
  }

  setView(`
    <div class="view-header">
      <h1>Waiting Room Queue</h1>
      <p>Patients waiting to be seen by the doctor.</p>
    </div>
    <div class="card">${listHtml}</div>
  `);

  // When doctor clicks "Call to Chair", update status and lock the patient into the active dashboard
  document.querySelectorAll('.btn-start-visit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const visitId = e.target.dataset.visit;
      const visit = await window.KnhosVisits.getVisit(visitId);
      
      visit.status = 'in-progress';
      await window.KnhosVisits.updateVisit(visit);
      
      localStorage.setItem('knhos_active_visit', visitId);
      window.KnhosRouter.navigate(`#/visits/${encodeURIComponent(visitId)}`);
    });
  });
}

/* ==========================================================
   CLINICAL RECORD SKELETON (Ready for Step 2)
   ========================================================== */
async function renderClinicalRecord(visitId) {
  setActiveNav('__none__');
  const visit = await window.KnhosVisits.getVisit(visitId);
  if (!visit) return window.KnhosRouter.navigate('#/home');
  const patient = await window.KnhosPatients.getPatient(visit.patientId);

  setView(`
    <div class="view-header">
      <h1>Clinical Dashboard</h1>
      <p>Patient: <strong>${escapeHtml(patient.fullName)}</strong> • Visit: <span style="font-family:monospace;">${escapeHtml(visit.visitId)}</span></p>
    </div>
    
    <div class="card">
      <div class="notice-inline" style="margin-bottom: 24px;">
        <strong>Step 2 Staging Area:</strong> The Patient is successfully locked in the chair. The advanced SVG Odontogram and Rx engine will be injected here next.
      </div>
      
      <div class="form-actions">
        <button type="button" class="btn btn-primary" id="btn-complete-visit">Finish Treatment (Clear Chair)</button>
        <button type="button" class="btn btn-secondary" id="btn-leave-chair">Keep Active (Go Back)</button>
      </div>
    </div>
  `);

  // Clicking "Finish Treatment" removes them from the active top nav and sets them to completed
  document.getElementById('btn-complete-visit').addEventListener('click', async () => {
    visit.status = 'completed';
    await window.KnhosVisits.updateVisit(visit);
    localStorage.removeItem('knhos_active_visit');
    window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patient.patientId)}`);
  });

  document.getElementById('btn-leave-chair').addEventListener('click', () => {
    window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patient.patientId)}`);
  });
}

/* ==========================================================
   HOME & PATIENT SEARCH
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
    container.innerHTML = results.length === 0 ? '<div class="empty-state">No matches.</div>' : results.map(p => `<li><button class="patient-row" data-id="${escapeHtml(p.patientId)}" style="cursor:pointer;"><div class="patient-row-main"><span class="patient-row-name">${escapeHtml(p.fullName)}</span><span class="patient-row-id">${escapeHtml(p.patientId)}</span></div></button></li>`).join('');
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

  function getStatusColor(status) {
    if(status === 'waiting') return 'background:#fff3e0; color:#e65100;';
    if(status === 'in-progress') return 'background:#e8f5e9; color:#1b5e20;';
    return 'background:#f5f5f5; color:#757575;';
  }

  const visitHtml = visits.length === 0 ? '<div class="notice-inline">No visits yet.</div>' : `<ul class="visit-list">${visits.map(v => `
    <li class="visit-card">
      <div class="visit-card-header">
        <div>
          <span class="visit-id">${escapeHtml(v.visitId)}</span>
          <span class="visit-dept-badge" style="margin-left: 8px;">${escapeHtml(v.department)}</span>
          <span class="visit-status-badge" style="${getStatusColor(v.status)}">${escapeHtml(v.status)}</span>
        </div>
        <button class="btn btn-secondary btn-sm open-record-btn" data-visit="${escapeHtml(v.visitId)}">Open Record</button>
      </div>
      <div class="visit-datetime">${formatDate(v.visitDate)} • ${escapeHtml(v.reason)}</div>
    </li>`).join('')}</ul>`;

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
    <div class="view-header"><h1>New Visit (Intake)</h1><p>Patient: <strong>${escapeHtml(patient.fullName)}</strong></p></div>
    <div class="card">
      <form id="new-visit-form">
        <div class="form-grid">
          <div class="field"><label>Department *</label><select id="department" required><option value="" selected disabled>Select…</option><option value="Dental">Dental</option><option value="Naturopathy">Naturopathy</option></select></div>
          <div class="field"><label>Visit Date *</label><input type="date" id="visitDate" required value="${new Date().toISOString().split('T')[0]}"></div>
          <div class="field" style="grid-column: 1 / -1;"><label>Cause of Visit (Chief Complaint) *</label><input type="text" id="reason" required placeholder="e.g., Tooth ache, consultation"></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Send to Waiting Room</button>
          <button type="button" class="btn btn-secondary" id="cancel-new-visit">Cancel</button>
        </div>
      </form>
    </div>
  `);
  document.getElementById('cancel-new-visit').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patientId)}`));
  document.getElementById('new-visit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await window.KnhosVisits.createVisit({ 
      patientId, 
      department: document.getElementById('department').value, 
      visitDate: document.getElementById('visitDate').value,
      reason: document.getElementById('reason').value.trim()
    });
    window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patientId)}`);
  });
}

/* ==========================================================
   NEW CONSENT (E-SIGNATURE)
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

/* ==========================================================
   ROUTES & INIT
   ========================================================== */
window.KnhosRouter.registerRoute('#/home', renderHome);
window.KnhosRouter.registerRoute('#/patients/new', () => renderNewPatient(pendingRegistration));
window.KnhosRouter.registerRoute('#/patients', () => renderPatientsListOrSearch('#/patients', 'Patients', ''));
window.KnhosRouter.registerRoute('#/search', () => renderPatientsListOrSearch('#/search', 'Search', ''));
window.KnhosRouter.registerRoute('#/queue', renderQueue); // NEW ROUTE
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
