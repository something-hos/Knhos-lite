(function () {
'use strict';
const viewRoot = document.getElementById('view-root');
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));

function escapeHtml(str) { return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function setActiveNav(routeHash) { navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.route === routeHash)); }

// --- GLOBALS FOR CLINICAL WORKFLOW ---
let toothRecords = {}; 
let currentVisitId = null;
let currentPatient = null;
let activeToothNumber = null;
let currentMode = 'adult';
let rxItems = [];
let invoiceItems = [];

const ADULT_UPPER = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28];
const ADULT_LOWER = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38];
const PRIMARY_UPPER = [55,54,53,52,51, 61,62,63,64,65];
const PRIMARY_LOWER = [85,84,83,82,81, 71,72,73,74,75];

const FINDING_LABELS = { 'deep-caries': 'Deep Caries', 'moderate-caries': 'Moderate Caries', 'mobile': 'Mobile', 'fractured': 'Fractured', 'periapical-abscess': 'Periapical Abscess', 'missing': 'Missing', 'impacted': 'Impacted' };
const TX_LABELS = { 'rct': 'RCT', 'extraction': 'Extraction', 'crown-prep': 'Crown Prep', 'filling': 'Filling', 'braces': 'Braces', 'scaling': 'Scaling' };
const TX_DONE_LABELS = { 'excavation': 'Excavation', 'rct-started': 'RCT Started', 'rct-completed': 'RCT Completed', 'extraction-done': 'Extraction Done', 'filling-done': 'Filling Placed' };
const TREATMENT_TIMELINE_DAYS = { 'extraction': 7, 'crown-prep': 10, 'braces': 30, 'rct': 5, 'filling': 14, 'scaling': 30 };

// --- CONTEXT BAR (Step 1) ---
async function updateContextBar() {
  const bar = document.getElementById('dynamic-context-bar');
  if (!bar) return;
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
      html += `<button class="context-btn btn-active-patient" id="btn-nav-active">Treating: ${escapeHtml(patient ? patient.fullName : 'Unknown')}</button>`;
    } else {
      localStorage.removeItem('knhos_active_visit');
    }
  }
  bar.innerHTML = html;

  const queueBtn = document.getElementById('btn-nav-queue');
  if (queueBtn) queueBtn.addEventListener('click', () => window.KnhosRouter.navigate('#/queue'));
  const activeBtn = document.getElementById('btn-nav-active');
  if (activeBtn) activeBtn.addEventListener('click', () => window.KnhosRouter.navigate(`#/visits/${encodeURIComponent(activeVisitId)}`));
}

async function setView(html) { 
  viewRoot.innerHTML = html; 
  window.scrollTo(0, 0); 
  await updateContextBar();
}

// --- STANDARD VIEWS ---
function renderHome() {
  setActiveNav('#/home');
  setView(`<h1>Home</h1><div class="card"><p>Welcome to KNHOS Lite</p></div>`);
}

async function renderPatientProfile(patientId) {
  setActiveNav('__none__');
  const patient = await window.KnhosPatients.getPatient(patientId);
  const visits = await window.KnhosVisits.listVisitsForPatient(patientId);
  let visitsHtml = visits.map(v => `<div class="patient-row" data-visit="${v.visitId}"><div><strong>Visit:</strong> ${v.visitDate} - ${escapeHtml(v.reason)} <br><small>Status: ${v.status.toUpperCase()}</small></div> <button class="btn btn-secondary open-visit-btn" data-id="${v.visitId}">Open</button></div>`).join('');
  
  setView(`
    <h1>${escapeHtml(patient.fullName)}</h1>
    <div class="card"><button class="btn btn-primary" id="btn-new-visit">New Visit Intake</button></div>
    ${visitsHtml}
  `);
  
  document.getElementById('btn-new-visit').addEventListener('click', () => window.KnhosRouter.navigate(`#/patients/${patientId}/visits/new`));
  
  document.querySelectorAll('.open-visit-btn').forEach(btn => btn.addEventListener('click', async (e) => {
    // Guard clause: Promote 'waiting' to 'in-progress' if opened directly
    const visitId = e.target.dataset.id;
    const visit = await window.KnhosVisits.getVisit(visitId);
    if(visit.status === 'waiting') {
      visit.status = 'in-progress';
      await window.KnhosVisits.updateVisit(visit);
    }
    localStorage.setItem('knhos_active_visit', visitId);
    window.KnhosRouter.navigate(`#/visits/${visitId}`);
  }));
}

async function renderNewVisit(patientId) {
  const patient = await window.KnhosPatients.getPatient(patientId);
  setView(`
    <h1>New Visit Intake for ${escapeHtml(patient.fullName)}</h1>
    <div class="card">
      <form id="visit-form">
        <label style="font-weight:bold;display:block;margin-bottom:8px;">Reason (Chief Complaint)</label>
        <input type="text" id="reason" style="width:100%; padding:12px; border-radius:8px; border:1px solid #ccc;" required>
        <button type="submit" class="btn btn-primary" style="margin-top:16px;">Send to Waiting Room</button>
      </form>
    </div>
  `);
  document.getElementById('visit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await window.KnhosVisits.createVisit({ patientId, department: 'Dental', visitDate: new Date().toISOString().split('T')[0], reason: document.getElementById('reason').value });
    window.KnhosRouter.navigate(`#/patients/${patientId}`);
  });
}

// --- QUEUE VIEW (Step 1) ---
async function renderQueue() {
  setActiveNav('__none__');
  const waitingVisits = await window.KnhosVisits.getWaitingVisits();
  let html = `<h1>Waiting Room</h1>`;
  if(waitingVisits.length === 0) {
    html += `<div class="card">No patients waiting.</div>`;
  } else {
    for (const v of waitingVisits) {
      const p = await window.KnhosPatients.getPatient(v.patientId);
      html += `<div class="patient-row"><div><strong>${escapeHtml(p.fullName)}</strong><br>Reason: ${escapeHtml(v.reason)}</div><button class="btn btn-primary btn-call-chair" data-id="${v.visitId}">Call to Chair</button></div>`;
    }
  }
  await setView(html);
  
  document.querySelectorAll('.btn-call-chair').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const visitId = e.target.dataset.id;
      const visit = await window.KnhosVisits.getVisit(visitId);
      visit.status = 'in-progress';
      await window.KnhosVisits.updateVisit(visit);
      localStorage.setItem('knhos_active_visit', visitId);
      window.KnhosRouter.navigate(`#/visits/${visitId}`);
    });
  });
}

// --- CLINICAL UTILS (Step 2 & 3) ---
function getAgeFromDob(dob) {
  if(!dob) return 30;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function buildArchPositions(count, isUpper) {
  const positions = [];
  const centerX = 300, radiusX = 240, radiusY = 120;
  const startAngle = Math.PI * 0.15, endAngle = Math.PI * 0.85;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = startAngle + t * (endAngle - startAngle);
    const x = centerX - radiusX * Math.cos(angle);
    const y = isUpper ? 30 + radiusY * (1 - Math.sin(angle)) : 170 - radiusY * (1 - Math.sin(angle));
    const rotation = (angle - Math.PI / 2) * (180 / Math.PI) * (isUpper ? 1 : -1);
    positions.push({ x, y, rotation });
  }
  return positions;
}

function renderArch(svgEl, toothNumbers, isUpper) {
  const positions = buildArchPositions(toothNumbers.length, isUpper);
  svgEl.innerHTML = '';
  toothNumbers.forEach((toothNum, i) => {
    const { x, y, rotation } = positions[i];
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${x},${y}) rotate(${rotation})`);
    
    const record = toothRecords[toothNum] || {};
    const shapeClass = ['tooth-shape', record.finding ? 'has-finding' : '', record.txPlanned ? 'has-tx-planned' : '', record.txDone ? 'has-tx-done' : ''].filter(Boolean).join(' ');

    g.innerHTML = `
      <circle class="tooth-hit-area" cx="0" cy="0" r="22" data-tooth="${toothNum}"></circle>
      <path class="${shapeClass}" d="M -8,-12 Q 0,-18 8,-12 L 6,8 Q 0,14 -6,8 Z" data-tooth="${toothNum}"></path>
      <text class="tooth-number-label" x="0" y="${isUpper ? -22 : 26}">${toothNum}</text>
    `;
    svgEl.appendChild(g);
  });
}

function renderOdontogram() {
  let upperTeeth, lowerTeeth;
  if (currentMode === 'adult') { upperTeeth = ADULT_UPPER; lowerTeeth = ADULT_LOWER; } 
  else if (currentMode === 'primary') { upperTeeth = PRIMARY_UPPER; lowerTeeth = PRIMARY_LOWER; } 
  else { upperTeeth = [...ADULT_UPPER, ...PRIMARY_UPPER]; lowerTeeth = [...ADULT_LOWER, ...PRIMARY_LOWER]; }
  renderArch(document.getElementById('upper-arch-svg'), upperTeeth, true);
  renderArch(document.getElementById('lower-arch-svg'), lowerTeeth, false);
}

function generateClinicalSummary(records) {
  const findings = [], txPlanned = [], txDone = [];
  Object.keys(records).forEach(toothNum => {
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

function suggestNextAppointment(records, fromDate = new Date()) {
  let shortestDays = null, drivingTreatment = null;
  Object.values(records).forEach(r => {
    const txKey = r.txPlanned; 
    if (!txKey || TREATMENT_TIMELINE_DAYS[txKey] === undefined) return;
    const days = TREATMENT_TIMELINE_DAYS[txKey];
    if (shortestDays === null || days < shortestDays) { shortestDays = days; drivingTreatment = txKey; }
  });
  if (shortestDays === null) return { suggestedDate: null, reason: 'No treatment planned — no auto-suggestion.' };
  const suggested = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + shortestDays);
  return { suggestedDate: suggested, reason: `Based on ${TX_LABELS[drivingTreatment]} (${shortestDays}-day timeline).` };
}

// --- CLINICAL DASHBOARD (Step 2) ---
async function renderClinicalRecord(visitId) {
  setActiveNav('__none__');
  currentVisitId = visitId;
  const visit = await window.KnhosVisits.getVisit(visitId);
  currentPatient = await window.KnhosPatients.getPatient(visit.patientId);
  toothRecords = visit.toothRecords || {};
  currentMode = getAgeFromDob(currentPatient.dob) > 12 ? 'adult' : 'primary';

  await setView(`
    <div class="view-header"><h1>Clinical Dashboard</h1><p>${escapeHtml(currentPatient.fullName)}</p></div>
    <div class="card">
      <section id="odontogram-section">
        <div class="dentition-toggle">
          <button class="dent-toggle-btn ${currentMode==='adult'?'active':''}" data-mode="adult">Adult</button>
          <button class="dent-toggle-btn ${currentMode==='primary'?'active':''}" data-mode="primary">Primary</button>
          <button class="dent-toggle-btn ${currentMode==='mixed'?'active':''}" data-mode="mixed">Mixed</button>
        </div>
        <div id="odontogram-container">
          <div class="arch-wrapper"><div class="arch-label">Upper</div><svg id="upper-arch-svg" viewBox="0 0 600 200"></svg></div>
          <div class="arch-wrapper"><div class="arch-label">Lower</div><svg id="lower-arch-svg" viewBox="0 0 600 200"></svg></div>
        </div>
      </section>
      <div style="margin-top:20px;">
        <button id="btn-finish-treatment" class="btn btn-primary" style="width:100%; height: 54px; font-size: 1.1rem;">Finish Treatment (Checkout) ➔</button>
      </div>
    </div>
  `);

  renderOdontogram();

  document.querySelectorAll('.dent-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dent-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      renderOdontogram();
    });
  });

  document.getElementById('odontogram-container').addEventListener('click', (e) => {
    if(!e.target.classList.contains('tooth-hit-area')) return;
    activeToothNumber = e.target.dataset.tooth;
    const record = toothRecords[activeToothNumber] || {};
    
    document.getElementById('tooth-modal-title').textContent = `Tooth #${activeToothNumber}`;
    document.getElementById('finding-select').value = record.finding || '';
    document.getElementById('tx-planned-select').value = record.txPlanned || '';
    document.getElementById('tx-done-select').value = record.txDone || '';
    document.getElementById('consent-linked-badge').classList.toggle('hidden', !record.consentLinked);
    
    document.querySelectorAll('.tooth-tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.querySelectorAll('.tooth-tab-panel').forEach((p, i) => p.classList.toggle('hidden', i !== 0));
    document.getElementById('tooth-modal-backdrop').classList.remove('hidden');
  });

  document.getElementById('btn-finish-treatment').addEventListener('click', async () => {
    visit.toothRecords = toothRecords;
    await window.KnhosVisits.updateVisit(visit);
    renderCheckout();
  });
}

// --- CHECKOUT & PRINT (Step 4) ---
async function renderCheckout() {
  const summary = generateClinicalSummary(toothRecords);
  const suggestion = suggestNextAppointment(toothRecords);
  
  await setView(`
    <div class="checkout-screen">
      <div class="checkout-header"><h2>Finish Treatment</h2><span>${escapeHtml(currentPatient.fullName)}</span></div>
      
      <div class="checkout-block"><h3>Clinical Summary</h3><p class="summary-readonly">${escapeHtml(summary)}</p></div>
      
      <div class="checkout-block">
        <h3>Prescription (Rx)</h3>
        <div id="rx-list"></div>
        <div class="rx-add-row"><input type="text" id="rx-drug-input" placeholder="Drug"><input type="text" id="rx-dosage-input" placeholder="Dosage"><button id="rx-add-btn">+ Add</button></div>
      </div>
      
      <div class="checkout-block">
        <h3>Invoice</h3>
        <div id="invoice-list"></div>
        <div class="invoice-add-row"><input type="text" id="invoice-item-input" placeholder="Item"><input type="number" id="invoice-amount-input" placeholder="Amount"><button id="invoice-add-btn">+ Add</button></div>
        <div class="invoice-total">Total: ₹<span id="invoice-total-amount">0</span></div>
      </div>
      
      <div class="checkout-block">
        <h3>Next Appointment</h3>
        <label class="next-appt-label">Suggested Date <span class="reason-text">${suggestion.reason}</span>
          <input type="date" id="next-appt-date-input" value="${suggestion.suggestedDate ? suggestion.suggestedDate.toISOString().split('T')[0] : ''}">
        </label>
      </div>
      
      <div class="checkout-actions">
        <button id="print-rx-btn" class="checkout-btn secondary">Print Rx</button>
        <button id="print-invoice-btn" class="checkout-btn secondary">Print Invoice</button>
        <button id="save-close-visit-btn" class="checkout-btn primary">Save & Close Visit</button>
      </div>
    </div>
  `);

  rxItems = []; invoiceItems = [];
  
  const renderRxList = () => { document.getElementById('rx-list').innerHTML = rxItems.map((r, i) => `<div class="rx-line-item">${r.drug} — ${r.dosage} <button data-idx="${i}" class="rx-remove-btn">✕</button></div>`).join(''); };
  const renderInvList = () => { document.getElementById('invoice-list').innerHTML = invoiceItems.map((it, i) => `<div class="invoice-line-item">${it.item} — ₹${it.amount} <button data-idx="${i}" class="invoice-remove-btn">✕</button></div>`).join(''); document.getElementById('invoice-total-amount').textContent = invoiceItems.reduce((sum, it) => sum + Number(it.amount), 0); };

  document.getElementById('rx-add-btn').addEventListener('click', () => {
    const drug = document.getElementById('rx-drug-input').value.trim(), dosage = document.getElementById('rx-dosage-input').value.trim();
    if(drug) { rxItems.push({drug, dosage}); document.getElementById('rx-drug-input').value=''; document.getElementById('rx-dosage-input').value=''; renderRxList(); }
  });
  
  document.getElementById('invoice-add-btn').addEventListener('click', () => {
    const item = document.getElementById('invoice-item-input').value.trim(), amount = document.getElementById('invoice-amount-input').value;
    if(item && amount) { invoiceItems.push({item, amount: Number(amount)}); document.getElementById('invoice-item-input').value=''; document.getElementById('invoice-amount-input').value=''; renderInvList(); }
  });
  
  document.getElementById('rx-list').addEventListener('click', (e) => { if(e.target.classList.contains('rx-remove-btn')) { rxItems.splice(Number(e.target.dataset.idx), 1); renderRxList(); }});
  document.getElementById('invoice-list').addEventListener('click', (e) => { if(e.target.classList.contains('invoice-remove-btn')) { invoiceItems.splice(Number(e.target.dataset.idx), 1); renderInvList(); }});

  // Print Handlers
  document.getElementById('print-rx-btn').addEventListener('click', () => {
    document.getElementById('print-rx-patient-name').textContent = currentPatient.fullName;
    document.getElementById('print-rx-patient-age').textContent = getAgeFromDob(currentPatient.dob);
    document.getElementById('print-rx-patient-sex').textContent = currentPatient.gender || '—';
    document.getElementById('print-rx-date').textContent = new Date().toLocaleDateString();
    document.getElementById('print-rx-items').innerHTML = rxItems.length ? rxItems.map(r => `<div class="rx-line"><strong>${r.drug}</strong> — ${r.dosage}</div>`).join('') : '—';
    document.body.classList.add('printing-rx'); window.print(); document.body.classList.remove('printing-rx');
  });

  document.getElementById('print-invoice-btn').addEventListener('click', () => {
    document.getElementById('print-invoice-patient-name').textContent = currentPatient.fullName;
    document.getElementById('print-invoice-patient-age').textContent = getAgeFromDob(currentPatient.dob);
    document.getElementById('print-invoice-date').textContent = new Date().toLocaleDateString();
    document.getElementById('print-invoice-rows').innerHTML = invoiceItems.map(it => `<tr><td>${it.item}</td><td>₹${it.amount}</td></tr>`).join('');
    document.getElementById('print-invoice-total').textContent = `₹${invoiceItems.reduce((s, it) => s + it.amount, 0)}`;
    document.body.classList.add('printing-invoice'); window.print(); document.body.classList.remove('printing-invoice');
  });

  document.getElementById('save-close-visit-btn').addEventListener('click', async () => {
    const visit = await window.KnhosVisits.getVisit(currentVisitId);
    visit.status = 'completed';
    visit.rxItems = rxItems;
    visit.invoiceItems = invoiceItems;
    visit.nextAppointmentDate = document.getElementById('next-appt-date-input').value;
    visit.clinicalSummary = summary;
    await window.KnhosVisits.updateVisit(visit);
    
    localStorage.removeItem('knhos_active_visit');
    window.KnhosRouter.navigate(`#/patients/${currentPatient.patientId}`);
  });
}

// --- GLOBAL EVENT LISTENERS (Run once to prevent memory leaks) ---
document.getElementById('tooth-modal-close').addEventListener('click', () => document.getElementById('tooth-modal-backdrop').classList.add('hidden'));

document.querySelectorAll('.tooth-tab-btn').forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tooth-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tooth-tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.querySelectorAll('.tooth-tab-panel')[idx].classList.remove('hidden');
  });
});

document.getElementById('tooth-modal-save').addEventListener('click', () => {
  if (!activeToothNumber) return;
  toothRecords[activeToothNumber] = { 
    ...(toothRecords[activeToothNumber] || {}), 
    finding: document.getElementById('finding-select').value, 
    txPlanned: document.getElementById('tx-planned-select').value, 
    txDone: document.getElementById('tx-done-select').value 
  };
  document.getElementById('tooth-modal-backdrop').classList.add('hidden');
  renderOdontogram();
});

document.getElementById('link-consent-btn').addEventListener('click', async () => {
  if (!activeToothNumber || !currentPatient) return;
  await window.KnhosConsents.createConsent({ 
    patientId: currentPatient.patientId, 
    type: 'Dental Procedure', 
    text: `Consent for Tx on Tooth #${activeToothNumber}`,
    signatureData: '' // Will hook into canvas logic in future, valid stub for now
  });
  toothRecords[activeToothNumber] = toothRecords[activeToothNumber] || {};
  toothRecords[activeToothNumber].consentLinked = true;
  document.getElementById('consent-linked-badge').classList.remove('hidden');
});

// --- ROUTER INIT ---
window.KnhosRouter.registerRoute('#/home', renderHome);
window.KnhosRouter.registerRoute('#/patients/:id', (params) => renderPatientProfile(params.id));
window.KnhosRouter.registerRoute('#/patients/:id/visits/new', (params) => renderNewVisit(params.id));
window.KnhosRouter.registerRoute('#/queue', renderQueue);
window.KnhosRouter.registerRoute('#/visits/:id', (params) => renderClinicalRecord(params.id));
navButtons.forEach((btn) => btn.addEventListener('click', () => window.KnhosRouter.navigate(btn.dataset.route)));

async function initApp() {
  await window.KnhosDB.openDatabase();
  window.KnhosRouter.startRouter();
}
initApp();
})();
