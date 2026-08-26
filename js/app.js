/**
 * app.js
 * Step 1: Context-Aware Navigation (Bulletproof Version)
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

// FIX: Added bulletproof safety net to prevent app freezing if cache gets stuck
async function updateContextBar() {
  const bar = document.getElementById('dynamic-context-bar');
  if (!bar) return;

  try {
    if (!window.KnhosVisits || typeof window.KnhosVisits.getWaitingVisits !== 'function') {
      console.warn("Safety net triggered: Waiting for visits.js to update via service worker.");
      return;
    }

    const waitingVisits = await window.KnhosVisits.getWaitingVisits();
    const activeVisitId = localStorage.getItem('knhos_active_visit');
    let html = '';

    if (waitingVisits.length > 0) {
      html += `<button class="context-btn btn-waiting" id="btn-nav-queue">Waiting Room <span class="badge">${waitingVisits.length}</span></button>`;
    } else {
      html += `<button class="context-btn btn-waiting-empty" id="btn-nav-queue">Waiting Room (0)</button>`;
    }

    if (activeVisitId) {
      const activeVisit = await window.KnhosVisits.getVisit(activeVisitId);
      if (activeVisit) {
        const patient = await window.KnhosPatients.getPatient(activeVisit.patientId);
        const name = patient ? patient.fullName : 'Unknown';
        html += `<button class="context-btn btn-active-patient" id="btn-nav-active">Treating: ${escapeHtml(name)}</button>`;
      } else {
        localStorage.removeItem('knhos_active_visit');
      }
    }

    bar.innerHTML = html;

    const queueBtn = document.getElementById('btn-nav-queue');
    if (queueBtn) queueBtn.addEventListener('click', () => window.KnhosRouter.navigate('#/queue'));

    const activeBtn = document.getElementById('btn-nav-active');
    if (activeBtn) activeBtn.addEventListener('click', () => window.KnhosRouter.navigate(`#/visits/${encodeURIComponent(activeVisitId)}`));
  } catch (err) {
    console.error("Context bar error gracefully caught:", err);
  }
}

async function setView(html) {
  viewRoot.innerHTML = html;
  viewRoot.scrollTop = 0;
  window.scrollTo(0, 0);
  await updateContextBar();
}

/* ==========================================================
   THE WAITING ROOM QUEUE
   ========================================================== */
async function renderQueue() {
  setActiveNav('__none__');
  
  if (typeof window.KnhosVisits.getWaitingVisits !== 'function') {
    setView(`<div class="alert alert-warn"><h3>Update in progress</h3><p>Please refresh the page to load the waiting room module.</p></div>`);
    return;
  }

  const waitingVisits = await window.KnhosVisits.getWaitingVisits();

  let listHtml = '';
  if (waitingVisits.length === 0) {
    listHtml = `<div class="empty-state">No patients currently waiting.</div>`;
  } else {
    const items = await Promise.all(waitingVisits.map(async (v) => {
      const p = await window.KnhosPatients.getPatient(v.patientId) || { fullName: 'Unknown Patient' };
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
   HOME & NEW PATIENT
   ========================================================== */
function renderHome() {
  setActiveNav('#/home');
  setView(`
    <div class="view-header"><h1>Home</h1><p>KNHOS Lite — temporary patient records.</p></div>
    <div class="home-grid">
      <a class="home-tile" href="#/patients/new"><span class="home-tile-icon">＋</span><span class="home-tile-title">New Patient</span><span class="home-tile-desc">Register a new patient and get an automatic ID.</span></a>
      <a class="home-tile" href="#/patients"><span class="home-tile-icon">☰</span><span class="home-tile-title">Patients</span><span class="home-tile-desc">Browse all registered patients.</span></a>
      <a class="home-tile" href="#/search"><span class="home-tile-icon">⌕</span><span class="home-tile-title">Search</span><span class="home-tile-desc">Find a patient by ID, name, or phone.</span></a>
    </div>
  `);
}

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
  document.getElementById('cancel-new-patient').addEventListener('click', () => {
    pendingRegistration = null;
    window.KnhosRouter.navigate('#/home');
  });
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
    const items = duplicates.map((p) => `
      <div class="patient-row" style="cursor:default;">
        <div><span class="patient-row-name">${escapeHtml(p.fullName)}</span><span class="patient-row-id">${escapeHtml(p.patientId)}</span></div>
        <div><button class="btn btn-secondary btn-sm open-existing-btn" data-id="${escapeHtml(p.patientId)}">Open Patient</button></div>
      </div>
    `).join('');

    renderNewPatient(data, `
      <div class="alert alert-warn">
        <h3>Possible duplicate patient found</h3>
        <div class="patient-list" style="margin-top: 12px;">${items}</div>
        <div class="alert-actions"><button class="btn btn-primary" id="continue-anyway-btn">Continue Anyway</button></div>
      </div>
    `);
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
async function renderPatientsListOrSearch(routeHash, heading, initialQuery) {
  setActiveNav(routeHash);
  setView(`
    <div class="view-header"><h1>${heading}</h1></div>
    <div class="search-bar"><input type="search" id="patient-search-input" placeholder="Search by ID, name, or phone..." value="${escapeHtml(initialQuery || '')}"></div>
    <ul class="patient-list" id="patient-list-container"></ul>
  `);
  const input = document.getElementById('patient-search-input'); const container = document.getElementById('patient-list-container');
  
  async function runSearch(q) {
    const results = q ? await window.KnhosPatients.searchPatients(q) : await window.KnhosPatients.listPatients();
    if (results.length === 0) { container.innerHTML = `<div class="empty-state">No matches.</div>`; return; }
    container.innerHTML = results.map(p => `
      <li>
        <button class="patient-row" data-id="${escapeHtml(p.patientId)}" style="cursor:pointer;">
          <div><span class="patient-row-name">${escapeHtml(p.fullName)}</span><span class="patient-row-id">${escapeHtml(p.patientId)}</span></div>
          <div style="text-align:right; font-size:0.9rem; color:#555;">${escapeHtml(p.phone || 'No phone')}</div>
        </button>
      </li>
    `).join('');
    container.querySelectorAll('.patient-row').forEach(btn => btn.addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(btn.dataset.id)}`)));
  }
  
  input.addEventListener('input', () => runSearch(input.value.trim())); 
  await runSearch(initialQuery || '');
}

/* ==========================================================
   PATIENT PROFILE & NEW VISIT
   ========================================================== */
async function renderPatientProfile(patientId, justCreated) {
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
          ${v.status ? `<span class="visit-status-badge" style="${getStatusColor(v.status)}">${escapeHtml(v.status)}</span>` : ''}
        </div>
        <button class="btn btn-secondary btn-sm open-record-btn" data-visit="${escapeHtml(v.visitId)}">Open Record</button>
      </div>
      <div class="visit-datetime">${formatDate(v.visitDate)} ${v.reason ? `• <strong>${escapeHtml(v.reason)}</strong>` : ''}</div>
    </li>`).join('')}</ul>`;

  const consentHtml = consents.length === 0 ? '<div class="notice-inline">No consents yet.</div>' : consents.map(c => `<div class="consent-card"><div class="visit-card-header"><span class="visit-id">${escapeHtml(c.consentId)}</span><span class="visit-dept-badge">${escapeHtml(c.type)}</span></div><div class="visit-datetime">${formatDateTime(c.createdAt)}</div><div><img src="${c.signatureData}" class="consent-sig-img" /></div></div>`).join('');

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
   CLINICAL RECORD STAGING AREA
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
   CONSENT & ROUTER
   ========================================================== */
async function renderNewConsent(patientId) {
  const patient = await window.KnhosPatients.getPatient(patientId);
  setView(`<div class="view-header"><h1>New Consent</h1></div><div class="card"><div class="form-grid"><div class="field" style="grid-column: 1 / -1;"><label>Consent Type *</label><select id="consent-type"><option value="General Medical Consent">General Medical Consent</option><option value="Dental Procedure Consent">Dental Procedure</option></select></div><div class="field" style="grid-column: 1 / -1;"><label>Patient Signature *</label><div class="signature-container"><canvas id="signature-pad"></canvas></div><div><button type="button" class="btn btn-secondary btn-sm" id="btn-clear-sig">Clear</button></div></div></div><div class="form-actions"><button type="button" class="btn btn-primary" id="btn-save-consent">Save Consent</button><button type="button" class="btn btn-secondary" id="cancel-new-consent">Cancel</button></div></div>`);
  
  document.getElementById('cancel-new-consent').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(patientId)}`));
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

function renderBackup() { setView(`<div class="view-header"><h1>Backup</h1></div><div class="card"><p>Placeholder module</p></div>`); }

window.KnhosRouter.registerRoute('#/home', renderHome);
window.KnhosRouter.registerRoute('#/patients/new', () => renderNewPatient(pendingRegistration));
window.KnhosRouter.registerRoute('#/patients', () => renderPatientsListOrSearch('#/patients', 'Patients', ''));
window.KnhosRouter.registerRoute('#/search', () => renderPatientsListOrSearch('#/search', 'Search', ''));
window.KnhosRouter.registerRoute('#/queue', renderQueue);
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
