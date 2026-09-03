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
  
  async function buildWaitingRowsHtml(waitingVisits) {
    const rows = await Promise.all(waitingVisits.map(async (v) => {
      const patient = await window.KnhosPatients.getPatient(v.patientId);
      const pendingTag = patient && getPendingConsents(patient.patientId).length
        ? '<span class="pending-consent-tag">⚠ Pending Consent</span>' : '';
      return `
        <div class="card visit-row">
          <span>${escapeHtml(patient ? patient.fullName : 'Unknown')} — ${escapeHtml(v.reason || '')}${pendingTag}</span>
          <button class="btn btn-primary call-to-chair-btn" type="button" data-visit-id="${escapeHtml(v.visitId)}">Call to Chair</button>
        </div>
      `;
    }));
    return rows.join('') || '<div class="card">No patients waiting.</div>';
  }
  async function callToChair(visitId) {
    const visit = await window.KnhosVisits.setVisitStatus(visitId, 'in-progress');
    if (!visit) return;
    await updateContextBar();
    window.KnhosRouter.navigate(`#/visits/${visit.visitId}`);
  }
  function wireCallToChairButtons(root) {
    root.querySelectorAll('.call-to-chair-btn').forEach((btn) => {
      btn.addEventListener('click', () => callToChair(btn.dataset.visitId));
    });
  }
  
  async function updateContextBar() {
    const bar = document.getElementById('dynamic-context-bar');
    if (!bar) return;
    const waitingVisits = await window.KnhosVisits.getWaitingVisits();
    const activeVisits = await window.KnhosVisits.getActiveVisits();
    let html = '';
    if (waitingVisits.length > 0) {
      html += `<button class="context-btn btn-waiting" type="button" id="btn-nav-queue">Waiting Room <span class="badge">${waitingVisits.length}</span></button>`;
    } else {
      html += `<button class="context-btn btn-waiting-empty" type="button" id="btn-nav-queue">Waiting Room (0)</button>`;
    }
    const activePillsHtml = (await Promise.all(activeVisits.map(async (v) => {
      const patient = await window.KnhosPatients.getPatient(v.patientId);
      const name = escapeHtml(patient ? patient.fullName : 'Unknown');
      const pendingTag = patient && getPendingConsents(patient.patientId).length ? ' ⚠' : '';
      if (v.status === 'on-hold') {
        return `<button class="context-btn btn-onhold-patient" type="button" data-visit-id="${escapeHtml(v.visitId)}">😴 Resting: ${name}${pendingTag}</button>`;
      }
      return `<button class="context-btn btn-active-patient" type="button" data-visit-id="${escapeHtml(v.visitId)}">🦷 In Chair: ${name}${pendingTag}</button>`;
    }))).join('');
    html += activePillsHtml;
    bar.innerHTML = html;
    const queueBtn = document.getElementById('btn-nav-queue');
    if (queueBtn) queueBtn.addEventListener('click', () => window.KnhosRouter.navigate('#/queue'));
    bar.querySelectorAll('[data-visit-id]').forEach((btn) => {
      btn.addEventListener('click', () => window.KnhosRouter.navigate(`#/visits/${btn.dataset.visitId}`));
    });
    const homeList = document.getElementById('home-waiting-list');
    const homeCount = document.getElementById('home-waiting-count');
    if (homeList) {
      homeList.innerHTML = await buildWaitingRowsHtml(waitingVisits);
      wireCallToChairButtons(homeList);
    }
    if (homeCount) homeCount.textContent = String(waitingVisits.length);
  }
  
  const ADULT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const ADULT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
  const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];
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
  // --- Phase 4: treatments that require the Stage 6 bilingual consent workflow ---
  const INVASIVE_TREATMENTS = ['rct', 'extraction'];
  const PENDING_CONSENTS_KEY = 'knhosPendingConsents';
  // --- Phase 4: suggestion data for the custom autocomplete dropdowns (replaces <datalist>) ---
  const RX_DRUG_SUGGESTIONS = ['Amoxicillin 500mg', 'Metronidazole 400mg', 'Ibuprofen 400mg', 'Paracetamol 500mg', 'Chlorhexidine Mouthwash'];
  const RX_DOSAGE_SUGGESTIONS = ['1-0-1 x 3 days', '1-1-1 x 5 days', 'SOS', 'TDS'];
  const INVOICE_ITEM_SUGGESTIONS = ['Consultation', 'Scaling & Polishing', 'Filling / Restoration', 'Root Canal Treatment (RCT)', 'Extraction', 'Crown Prep', 'X-Ray (IOPA)', 'Braces / Ortho Adjustment'];
  let currentMode = 'adult';
  let toothRecords = {};
  let currentVisit = null;
  let currentPatient = null;
  let activeToothNumber = null;
  let rxItems = [];
  let invoiceItems = [];
  let checkoutReadOnly = false;
  let consentPromptContext = null;
  let consentOverlayContext = null;
  
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
  
  function renderArch(svgEl, toothNumbers, isUpper, selectedTooth) {
    if (!svgEl) return;
    const positions = buildArchPositions(toothNumbers.length, isUpper);
    svgEl.innerHTML = '';
    toothNumbers.forEach((toothNum, i) => {
      const { x, y, rotation } = positions[i];
      const isSelected = selectedTooth !== null && selectedTooth !== undefined && String(selectedTooth) === String(toothNum);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'tooth-group');
      const scalePart = isSelected ? ' scale(1.8)' : '';
      g.setAttribute('transform', `translate(${x},${y}) rotate(${rotation})${scalePart}`);
      if (isSelected) g.setAttribute('data-selected', 'true');
      const record = toothRecords[toothNum] || {};
      const shapeClass = ['tooth-shape',
        record.finding ? 'has-finding' : '',
        record.txPlanned ? 'has-tx-planned' : '',
        record.txDone ? 'has-tx-done' : ''
      ].filter(Boolean).join(' ');
      g.innerHTML = `
        <circle class="tooth-hit-area" cx="0" cy="0" r="22" data-tooth="${toothNum}"></circle>
        <rect class="${shapeClass}" x="-10" y="-14" width="20" height="28" rx="4" data-tooth="${toothNum}"></rect>
        <line class="tooth-crown-line" x1="-10" y1="-2" x2="10" y2="-2"></line>
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
    renderArch(document.getElementById('upper-arch-svg'), upperTeeth, true, activeToothNumber);
    renderArch(document.getElementById('lower-arch-svg'), lowerTeeth, false, activeToothNumber);
  }
  
  function updateLiveSummary() {
    const el = document.getElementById('live-summary-content');
    if (!el) return;
    el.innerHTML = generateClinicalSummary(toothRecords);
  }
  
  function openToothModal(toothNum) {
    activeToothNumber = toothNum;
    const record = toothRecords[toothNum] || {};
    document.getElementById('tooth-modal-title').textContent = `Tooth #${toothNum}`;
    document.getElementById('finding-select').value = record.finding || '';
    document.getElementById('tx-planned-select').value = record.txPlanned || '';
    document.getElementById('tx-done-select').value = record.txDone || '';
    document.getElementById('consent-linked-badge').classList.toggle('hidden', !record.consentLinked);
    document.getElementById('tooth-signature-capture').classList.add('hidden');
    document.querySelectorAll('.tooth-tab-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.querySelectorAll('.tooth-tab-panel').forEach((p, i) => p.classList.toggle('hidden', i !== 0));
    document.getElementById('tooth-modal-backdrop').classList.remove('closed');
    const odontoView = document.getElementById('odontogram-section');
    if (odontoView) odontoView.classList.add('panel-open');
    renderOdontogram();
    updateToothConsentStatusUI();
  }
  function closeToothModal() {
    document.getElementById('tooth-modal-backdrop').classList.add('closed');
    activeToothNumber = null;
    const odontoView = document.getElementById('odontogram-section');
    if (odontoView) odontoView.classList.remove('panel-open');
    if (document.getElementById('upper-arch-svg')) renderOdontogram();
  }
  // --- Phase 4: reflects this tooth's Stage 6 consent state inside the Tx Planned tab ---
  function updateToothConsentStatusUI() {
    const statusEl = document.getElementById('tooth-consent-status');
    const textEl = document.getElementById('tooth-consent-status-text');
    const resolveBtn = document.getElementById('tooth-consent-resolve-btn');
    if (!statusEl || !textEl || !resolveBtn || !activeToothNumber) return;
    const record = toothRecords[activeToothNumber] || {};
    const treatmentKey = record.consentDecision;
    statusEl.classList.remove('status-pending', 'status-obtained');
    if (!treatmentKey || !INVASIVE_TREATMENTS.includes(treatmentKey)) {
      statusEl.classList.add('hidden');
      resolveBtn.classList.add('hidden');
      return;
    }
    statusEl.classList.remove('hidden');
    if (record.consentStatus === 'obtained') {
      statusEl.classList.add('status-obtained');
      textEl.textContent = `✓ Consent obtained for ${TX_LABELS[treatmentKey] || treatmentKey}.`;
      resolveBtn.classList.add('hidden');
    } else {
      statusEl.classList.add('status-pending');
      textEl.textContent = '🕓 Pending Consent — flagged for next visit.';
      resolveBtn.classList.remove('hidden');
      resolveBtn.onclick = () => openConsentOverlay(activeToothNumber, treatmentKey, { resolvingPending: true });
    }
  }
  
  function generateClinicalSummary(records) {
    const findings = [], txPlanned = [], txDone = [];
    Object.keys(records).forEach((toothNum) => {
      const r = records[toothNum];
      if (r.finding) findings.push(`#${toothNum} — ${FINDING_LABELS[r.finding] || r.finding}`);
      if (r.txPlanned) txPlanned.push(`#${toothNum} — ${TX_LABELS[r.txPlanned] || r.txPlanned}`);
      if (r.txDone) txDone.push(`#${toothNum} — ${TX_DONE_LABELS[r.txDone] || r.txDone}`);
    });
    if (!findings.length && !txPlanned.length && !txDone.length) {
      return '<p class="muted-text">No findings or treatments recorded.</p>';
    }
    function section(title, items) {
      if (!items.length) return '';
      return `<h4>${title}</h4><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
    }
    return `<div class="clinical-summary-block">${section('Findings', findings)}${section('Treatments Planned', txPlanned)}${section('Treatments Done Today', txDone)}</div>`;
  }
  function suggestNextAppointment(records, fromDate = new Date()) {
    let shortestDays = null, drivingTreatment = null;
    Object.values(records).forEach((r) => {
      const txKey = r.txPlanned;
      if (!txKey) return;
      const days = TREATMENT_TIMELINE_DAYS[txKey];
      if (days === undefined) return; 
      if (shortestDays === null || days < shortestDays) {
        shortestDays = days;
        drivingTreatment = txKey;
      }
    });
    if (shortestDays === null) {
      return { suggestedDate: null, days: null, reason: 'No treatment planned — no auto-suggestion.' };
    }
    const suggested = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + shortestDays);
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

  // --- Phase 4: Stage 6 "Pending Consent" persistence ---
  // A "obtain consent next visit" flag has to survive across visits so it can
  // surface on the dashboard the next time this patient is seen — the
  // in-memory visit record only lives for the current visit, so the flag is
  // kept keyed by patientId in localStorage instead.
  function loadPendingConsentStore() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_CONSENTS_KEY) || '{}');
    } catch (err) {
      return {};
    }
  }
  function savePendingConsentStore(store) {
    try {
      localStorage.setItem(PENDING_CONSENTS_KEY, JSON.stringify(store));
    } catch (err) { /* storage unavailable — flag simply won't persist */ }
  }
  function getPendingConsents(patientId) {
    if (!patientId) return [];
    const store = loadPendingConsentStore();
    return store[patientId] || [];
  }
  function addPendingConsent(patientId, toothNumber, treatmentKey) {
    if (!patientId) return;
    const store = loadPendingConsentStore();
    const list = (store[patientId] || []).filter((p) => String(p.toothNumber) !== String(toothNumber));
    list.push({ toothNumber: String(toothNumber), treatment: treatmentKey, flaggedAt: new Date().toISOString() });
    store[patientId] = list;
    savePendingConsentStore(store);
  }
  function removePendingConsent(patientId, toothNumber) {
    if (!patientId) return;
    const store = loadPendingConsentStore();
    const list = (store[patientId] || []).filter((p) => String(p.toothNumber) !== String(toothNumber));
    if (list.length) store[patientId] = list; else delete store[patientId];
    savePendingConsentStore(store);
  }
  function findPendingConsent(patientId, toothNumber) {
    return getPendingConsents(patientId).find((p) => String(p.toothNumber) === String(toothNumber));
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
  
  function renderRxList() {
    const container = document.getElementById('rx-list');
    if (!container) return;
    container.innerHTML = rxItems.map((r, i) =>
      `<div class="rx-line-item">${escapeHtml(r.drug)} — ${escapeHtml(r.dosage)}
        ${checkoutReadOnly ? '' : `<button type="button" data-idx="${i}" class="rx-remove-btn">✕</button>`}</div>`
    ).join('');
  }
  function renderInvoiceList() {
    const container = document.getElementById('invoice-list');
    if (!container) return;
    container.innerHTML = invoiceItems.map((it, i) =>
      `<div class="invoice-line-item">${escapeHtml(it.item)} — ₹${it.amount}
        ${checkoutReadOnly ? '' : `<button type="button" data-idx="${i}" class="invoice-remove-btn">✕</button>`}</div>`
    ).join('');
    const total = invoiceItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    const totalEl = document.getElementById('invoice-total-amount');
    if (totalEl) totalEl.textContent = total;
  }
  // --- Phase 4: custom touch-friendly autocomplete dropdown (replaces native <datalist>) ---
  // Filters the given suggestion list as the user types and renders it as an
  // absolutely-positioned <ul> so it floats above surrounding content without
  // clipping or shifting any other layout elements.
  function wireAutocomplete(inputId, listId, suggestions) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    function renderMatches() {
      const q = input.value.trim().toLowerCase();
      const matches = q ? suggestions.filter((s) => s.toLowerCase().includes(q)) : suggestions;
      list.innerHTML = matches.length
        ? matches.map((m) => `<li data-value="${escapeHtml(m)}">${escapeHtml(m)}</li>`).join('')
        : '<li class="autocomplete-list-empty">No matches</li>';
      list.classList.remove('hidden');
    }
    input.addEventListener('focus', renderMatches);
    input.addEventListener('input', renderMatches);
    input.addEventListener('blur', () => {
      setTimeout(() => list.classList.add('hidden'), 150);
    });
    // Fires before the input's blur handler, so a tap on a suggestion registers
    // before the list gets hidden.
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-value]');
      if (!li) return;
      input.value = li.dataset.value;
      list.classList.add('hidden');
      input.focus();
    });
  }
  // --- Standalone print-window builder (Phase 3) ---
  // iOS Safari standalone PWA shells silently fail / render blank frames when
  // window.print() is called on the app's own document. Instead we build a
  // fully self-contained HTML document (own <style>, no dependency on
  // main.css or #app-shell) and print it from a dedicated new tab/window.
  function buildPrintDocumentHtml({ title, watermarkText, doctorLine, bodyHtml, signatureCaption }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: 'Georgia', serif; }
  .print-doc { position: relative; width: 210mm; min-height: 297mm; padding: 20mm 18mm; }
  .print-watermark { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-25deg); font-size: 140px; font-weight: 900; color: rgba(30, 58, 138, 0.06); z-index: 0; pointer-events: none; }
  .print-header { position: relative; z-index: 1; text-align: center; margin-bottom: 4mm; }
  .print-clinic-name { font-size: 20px; font-weight: 700; letter-spacing: 0.02em; }
  .print-branches { font-size: 12px; color: #444; margin-top: 2px; }
  .print-doctor-line { position: relative; z-index: 1; text-align: center; font-size: 13px; font-style: italic; margin-top: 4px; font-weight: bold; }
  .print-rule { position: relative; z-index: 1; border: none; border-top: 1.5px solid #111; margin: 6mm 0; }
  .print-patient-demo { position: relative; z-index: 1; font-size: 13px; margin-bottom: 8mm; }
  .print-rx-symbol { position: relative; z-index: 1; font-size: 28px; font-weight: 700; margin-bottom: 4mm; }
  .print-rx-items { position: relative; z-index: 1; font-size: 14px; line-height: 2; min-height: 140mm; }
  .print-rx-items .rx-line { border-bottom: 1px dotted #999; padding: 4px 0; }
  .print-invoice-table { position: relative; z-index: 1; width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 100mm; }
  .print-invoice-table th, .print-invoice-table td { border-bottom: 1px solid #ddd; padding: 8px 4px; text-align: left; }
  .print-invoice-table th:last-child, .print-invoice-table td:last-child { text-align: right; }
  .print-invoice-table tfoot td { font-weight: 700; border-top: 2px solid #111; border-bottom: none; }
  .print-signature-block { position: absolute; bottom: 20mm; right: 18mm; width: 60mm; text-align: center; z-index: 1; }
  .print-signature-line { border-top: 1px solid #111; margin-bottom: 4px; }
  .print-signature-caption { font-size: 11px; color: #333; }
  @media print { html, body { width: 210mm; } }
</style>
</head>
<body>
  <div class="print-doc">
    ${watermarkText ? `<div class="print-watermark">${escapeHtml(watermarkText)}</div>` : ''}
    <div class="print-header">
      <div class="print-clinic-name">KNHOS Dental Clinic</div>
      <div class="print-branches">Karur Branch &middot; Sengal Branch</div>
    </div>
    <div class="print-doctor-line">${doctorLine}</div>
    <hr class="print-rule">
    ${bodyHtml}
    <div class="print-signature-block">
      <div class="print-signature-line"></div>
      <div class="print-signature-caption">${escapeHtml(signatureCaption)}</div>
    </div>
  </div>
</body>
</html>`;
  }

  function openPrintWindow(htmlContent) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for KNHOS Lite to print, then try again.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    let hasPrinted = false;
    function triggerPrint() {
      if (hasPrinted) return;
      hasPrinted = true;
      printWindow.focus();
      printWindow.print();
    }
    // 'load' fires reliably on iOS Safari once the spawned tab finishes
    // rendering; the timeout is a fallback for browsers that fire it late
    // or not at all inside a standalone PWA context.
    printWindow.addEventListener('load', triggerPrint);
    setTimeout(triggerPrint, 400);
  }

  function printRxDoc() {
    const age = getAgeFromDob(currentPatient.dob);
    const itemsHtml = rxItems
      .map((r) => `<div class="rx-line">${escapeHtml(r.drug)} — ${escapeHtml(r.dosage)}</div>`).join('')
      || '<div class="rx-line">—</div>';
    const bodyHtml = `
      <div class="print-patient-demo">
        ${escapeHtml(currentPatient.fullName)} &middot;
        Age: ${age === null ? '—' : age} &middot;
        Sex: ${escapeHtml(currentPatient.gender || '—')} &middot;
        Date: ${new Date().toLocaleDateString()}
      </div>
      <div class="print-rx-symbol">℞</div>
      <div class="print-rx-items">${itemsHtml}</div>
    `;
    const html = buildPrintDocumentHtml({
      title: `Rx — ${currentPatient.fullName}`,
      watermarkText: 'Rx',
      doctorLine: '[Dr. Name &amp; Qualifications]',
      bodyHtml,
      signatureCaption: "Doctor's Signature"
    });
    openPrintWindow(html);
  }

  function printInvoiceDoc() {
    const age = getAgeFromDob(currentPatient.dob);
    const rowsHtml = invoiceItems
      .map((it) => `<tr><td>${escapeHtml(it.item)}</td><td>₹${it.amount}</td></tr>`).join('');
    const total = invoiceItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    const bodyHtml = `
      <div class="print-patient-demo">
        ${escapeHtml(currentPatient.fullName)} &middot;
        Age: ${age === null ? '—' : age} &middot;
        Date: ${new Date().toLocaleDateString()}
      </div>
      <table class="print-invoice-table">
        <thead><tr><th>Item / Procedure</th><th>Amount (₹)</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr><td>Total</td><td>₹${total}</td></tr></tfoot>
      </table>
    `;
    const html = buildPrintDocumentHtml({
      title: `Invoice — ${currentPatient.fullName}`,
      watermarkText: '',
      doctorLine: 'OFFICIAL INVOICE',
      bodyHtml,
      signatureCaption: 'Authorized Signature'
    });
    openPrintWindow(html);
  }
  
  function wireSignaturePad(canvas) {
    const ctx = canvas.getContext('2d');
    function resize() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1f4d43';
    }
    let isDrawing = false;
    function getCoords(e) {
      const rect = canvas.getBoundingClientRect();
      if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function start(e) { e.preventDefault(); isDrawing = true; const { x, y } = getCoords(e); ctx.beginPath(); ctx.moveTo(x, y); }
    function move(e) { e.preventDefault(); if (!isDrawing) return; const { x, y } = getCoords(e); ctx.lineTo(x, y); ctx.stroke(); }
    function stop(e) { e.preventDefault(); isDrawing = false; }
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseout', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', stop, { passive: false });
    return {
      resize,
      clear: () => ctx.clearRect(0, 0, canvas.width, canvas.height),
      getDataURL: () => canvas.toDataURL('image/png')
    };
  }
  const toothSignaturePad = wireSignaturePad(document.getElementById('tooth-signature-pad'));
  
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
  
  document.getElementById('link-consent-btn').addEventListener('click', () => {
    document.getElementById('tooth-signature-capture').classList.remove('hidden');
    toothSignaturePad.clear();
    toothSignaturePad.resize();
  });
  document.getElementById('tooth-sig-clear-btn').addEventListener('click', () => {
    toothSignaturePad.clear();
  });
  document.getElementById('tooth-sig-cancel-btn').addEventListener('click', () => {
    document.getElementById('tooth-signature-capture').classList.add('hidden');
  });
  document.getElementById('tooth-sig-save-btn').addEventListener('click', async () => {
    if (!activeToothNumber || !currentPatient || !currentVisit) return;
    const consent = await window.KnhosConsents.createConsent({
      patientId: currentPatient.patientId,
      visitId: currentVisit.visitId,
      toothNumber: activeToothNumber,
      consentType: 'treatment',
      signatureData: toothSignaturePad.getDataURL()
    });
    toothRecords[activeToothNumber] = toothRecords[activeToothNumber] || {};
    toothRecords[activeToothNumber].consentLinked = true;
    toothRecords[activeToothNumber].consentId = consent.consentId;
    document.getElementById('consent-linked-badge').classList.remove('hidden');
    document.getElementById('tooth-signature-capture').classList.add('hidden');
  });
  document.getElementById('tooth-modal-save').addEventListener('click', async () => {
    if (!activeToothNumber) return;
    toothRecords[activeToothNumber] = {
      ...(toothRecords[activeToothNumber] || {}),
      finding: document.getElementById('finding-select').value,
      txPlanned: document.getElementById('tx-planned-select').value,
      txDone: document.getElementById('tx-done-select').value
    };
    if (currentVisit) {
      currentVisit.toothRecords = toothRecords;
      await window.KnhosVisits.updateVisit(currentVisit);
    }
    updateLiveSummary();
    closeToothModal();
  });

  // --- Phase 4: Stage 6 — trigger the consent prompt when an invasive treatment is planned ---
  document.getElementById('tx-planned-select').addEventListener('change', (e) => {
    const treatmentKey = e.target.value;
    if (!activeToothNumber) return;
    toothRecords[activeToothNumber] = toothRecords[activeToothNumber] || {};
    const record = toothRecords[activeToothNumber];
    if (INVASIVE_TREATMENTS.includes(treatmentKey)) {
      if (record.consentDecision !== treatmentKey) {
        openConsentPromptModal(activeToothNumber, treatmentKey);
      }
    } else {
      delete record.consentDecision;
      delete record.consentStatus;
      updateToothConsentStatusUI();
    }
  });
  // --- Phase 4: Stage 6 — Auto-Resolve: marking a planned treatment "Done Today" that
  // still has a Pending Consent flag immediately reopens the consent workflow. ---
  document.getElementById('tx-done-select').addEventListener('change', (e) => {
    const doneKey = e.target.value;
    if (!doneKey || !activeToothNumber || !currentPatient) return;
    const pending = findPendingConsent(currentPatient.patientId, activeToothNumber);
    if (pending) {
      openConsentOverlay(activeToothNumber, pending.treatment, { resolvingPending: true });
    }
  });

  // --- Phase 4: Stage 6 — "Obtain consent this visit / next visit?" prompt ---
  function openConsentPromptModal(toothNumber, treatmentKey) {
    consentPromptContext = { toothNumber, treatmentKey };
    document.getElementById('consent-prompt-title').textContent = 'Consent Required';
    document.getElementById('consent-prompt-message').textContent =
      `Tooth #${toothNumber} — ${TX_LABELS[treatmentKey] || treatmentKey} requires signed patient consent. Obtain consent this visit, or flag it for the next visit?`;
    document.getElementById('consent-prompt-backdrop').classList.remove('closed');
  }
  function closeConsentPromptModal() {
    document.getElementById('consent-prompt-backdrop').classList.add('closed');
    consentPromptContext = null;
  }
  document.getElementById('consent-prompt-close-btn').addEventListener('click', closeConsentPromptModal);
  document.getElementById('consent-prompt-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'consent-prompt-backdrop') closeConsentPromptModal();
  });
  document.getElementById('consent-prompt-this-visit-btn').addEventListener('click', () => {
    if (!consentPromptContext) return;
    const { toothNumber, treatmentKey } = consentPromptContext;
    closeConsentPromptModal();
    openConsentOverlay(toothNumber, treatmentKey);
  });
  document.getElementById('consent-prompt-next-visit-btn').addEventListener('click', async () => {
    if (!consentPromptContext) return;
    const { toothNumber, treatmentKey } = consentPromptContext;
    closeConsentPromptModal();
    toothRecords[toothNumber] = toothRecords[toothNumber] || {};
    toothRecords[toothNumber].consentDecision = treatmentKey;
    toothRecords[toothNumber].consentStatus = 'pending-next-visit';
    if (currentPatient) addPendingConsent(currentPatient.patientId, toothNumber, treatmentKey);
    if (currentVisit) {
      currentVisit.toothRecords = toothRecords;
      await window.KnhosVisits.updateVisit(currentVisit);
    }
    if (String(activeToothNumber) === String(toothNumber)) updateToothConsentStatusUI();
    await updateContextBar();
  });

  // --- Phase 4: Stage 6 — full-screen bilingual consent overlay ---
  const consentSignaturePad = wireSignaturePad(document.getElementById('consent-signature-pad'));
  function buildConsentEnglishText(treatmentKey, toothNumber, patient) {
    const label = TX_LABELS[treatmentKey] || treatmentKey;
    const patientName = escapeHtml(patient ? patient.fullName : 'the patient');
    return `
      <p>I, the undersigned patient (or the patient's parent / legal guardian), confirm that the treating
      dentist at KNHOS Dental Clinic has explained, in a language I understand, the nature of the
      recommended <strong>${escapeHtml(label)}</strong> procedure for tooth #${escapeHtml(String(toothNumber))},
      including its purpose, the available alternatives, the material risks and possible complications, and
      the likely outcome if the treatment is not carried out.</p>
      <p>I have had the opportunity to ask questions, and all my questions have been answered to my
      satisfaction. I understand that dentistry is not an exact science and that no guarantee has been made
      as to the outcome of this treatment.</p>
      <p>I voluntarily consent to the performance of this procedure on ${patientName}, and I authorise the
      clinical team to proceed as clinically necessary.</p>
    `;
  }
  function openConsentOverlay(toothNumber, treatmentKey, opts = {}) {
    consentOverlayContext = { toothNumber, treatmentKey, resolvingPending: !!opts.resolvingPending };
    const label = TX_LABELS[treatmentKey] || treatmentKey;
    document.getElementById('consent-overlay-title').textContent = `Informed Consent — ${label}`;
    document.getElementById('consent-overlay-meta').textContent =
      `${currentPatient ? currentPatient.fullName : 'Unknown patient'} · Tooth #${toothNumber} · ${new Date().toLocaleDateString()}`;
    document.getElementById('consent-overlay-text-en').innerHTML = buildConsentEnglishText(treatmentKey, toothNumber, currentPatient);
    document.getElementById('consent-overlay-backdrop').classList.remove('closed');
    consentSignaturePad.clear();
    consentSignaturePad.resize();
  }
  function closeConsentOverlay() {
    document.getElementById('consent-overlay-backdrop').classList.add('closed');
    consentOverlayContext = null;
  }
  document.getElementById('consent-overlay-close-btn').addEventListener('click', closeConsentOverlay);
  document.getElementById('consent-overlay-cancel-btn').addEventListener('click', closeConsentOverlay);
  document.getElementById('consent-sig-clear-btn').addEventListener('click', () => consentSignaturePad.clear());
  document.getElementById('consent-overlay-save-btn').addEventListener('click', async () => {
    if (!consentOverlayContext || !currentPatient || !currentVisit) { closeConsentOverlay(); return; }
    const { toothNumber, treatmentKey } = consentOverlayContext;
    const consent = await window.KnhosConsents.createConsent({
      patientId: currentPatient.patientId,
      visitId: currentVisit.visitId,
      toothNumber,
      consentType: 'invasive-treatment-bilingual',
      treatment: treatmentKey,
      language: 'en + ta-placeholder',
      signatureData: consentSignaturePad.getDataURL()
    });
    toothRecords[toothNumber] = toothRecords[toothNumber] || {};
    toothRecords[toothNumber].consentDecision = treatmentKey;
    toothRecords[toothNumber].consentStatus = 'obtained';
    toothRecords[toothNumber].consentLinked = true;
    toothRecords[toothNumber].consentId = consent ? consent.consentId : toothRecords[toothNumber].consentId;
    currentVisit.toothRecords = toothRecords;
    await window.KnhosVisits.updateVisit(currentVisit);
    removePendingConsent(currentPatient.patientId, toothNumber);
    if (String(activeToothNumber) === String(toothNumber)) {
      document.getElementById('consent-linked-badge').classList.remove('hidden');
      updateToothConsentStatusUI();
    }
    await updateContextBar();
    closeConsentOverlay();
  });

  async function renderHome() {
    setActiveNav('#/home');
    const waiting = await window.KnhosVisits.getWaitingVisits();
    const rowsHtml = await buildWaitingRowsHtml(waiting);
    await setView(`
      <div class="view-header"><h1>Home</h1></div>
      <div class="home-cards">
        <div class="home-action-card" id="home-card-new-patient">
          <h3>+ New Patient</h3>
          <p>Register a new patient</p>
        </div>
        <div class="home-action-card" id="home-card-search">
          <h3>Patient Search</h3>
          <p>Find an existing patient</p>
        </div>
      </div>
      <div class="home-waiting-feed">
        <h2>Waiting Room (<span id="home-waiting-count">${waiting.length}</span>)</h2>
        <div id="home-waiting-list">${rowsHtml}</div>
      </div>
    `);
    document.getElementById('home-card-new-patient').addEventListener('click', () => window.KnhosRouter.navigate('#/patients/new'));
    document.getElementById('home-card-search').addEventListener('click', () => window.KnhosRouter.navigate('#/patients'));
    wireCallToChairButtons(document.getElementById('home-waiting-list'));
  }
  
  async function renderPatientsListOrSearch() {
    setActiveNav('#/patients');
    await setView(`
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
          (p.patientId && p.patientId.toLowerCase().includes(lowerQ))
        );
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
            <div class="field">
              <label>Phone</label>
              <input type="tel" id="phone" pattern="[0-9]{10}" maxlength="10" placeholder="10-digit number" title="Enter a 10-digit phone number">
            </div>
          </div>
          <div class="field" style="margin-top:18px;">
            <label>Address</label>
            <textarea id="address" rows="3" placeholder="Street, city, postal code"></textarea>
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Save Patient</button></div>
        </form>
      </div>
    `);
    const form = document.getElementById('new-patient-form');
    const phoneInput = document.getElementById('phone');
    phoneInput.addEventListener('input', () => {
      phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        fullName: document.getElementById('fullName').value.trim(),
        dob: document.getElementById('dob').value,
        gender: document.getElementById('gender').value,
        phone: phoneInput.value.trim(),
        address: document.getElementById('address').value.trim()
      };
      const record = await window.KnhosPatients.createPatient(data);
      window.KnhosRouter.navigate(`#/patients/${record.patientId}`);
    });
  }
  
  async function renderNewConsent(patientId) {
    setActiveNav('__none__');
    const patient = await window.KnhosPatients.getPatient(patientId);
    await setView(`
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
    const pad = wireSignaturePad(canvas);
    pad.resize();
    window.addEventListener('resize', pad.resize);
    document.getElementById('btn-clear-sig').addEventListener('click', () => pad.clear());
    document.getElementById('btn-save-consent').addEventListener('click', async () => {
      try {
        await window.KnhosConsents.createConsent({
          patientId,
          type: document.getElementById('consent-type').value,
          text: 'I consent to the described treatment.',
          signatureData: pad.getDataURL()
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
    const age = getAgeFromDob(patient.dob);
    const statusClass = (s) => `visit-status-badge visit-status-${s || 'waiting'}`;
    const visitsHtml = visits.map((v) => `
      <div class="card visit-row">
        <span>Visit: ${escapeHtml(v.visitDate)} - ${escapeHtml(v.reason)}</span>
        <span class="${statusClass(v.status)}">${escapeHtml(v.status || 'waiting')}</span>
        <button class="btn btn-secondary open-visit-btn" type="button" data-id="${escapeHtml(v.visitId)}">Open</button>
      </div>
    `).join('');
    const pendingConsents = getPendingConsents(patientId);
    const pendingBannerHtml = pendingConsents.length ? `
      <div class="pending-consent-banner">
        <h3>⚠ Pending Consent</h3>
        ${pendingConsents.map((p) => `
          <div class="pending-consent-item">
            <span class="pending-consent-item-label">Tooth #${escapeHtml(p.toothNumber)} — ${escapeHtml(TX_LABELS[p.treatment] || p.treatment)} (flagged ${escapeHtml(new Date(p.flaggedAt).toLocaleDateString())})</span>
          </div>
        `).join('')}
        <p class="pending-consent-item-label" style="margin:8px 0 0;">This will resolve automatically once the treatment is marked "Done Today", or can be resolved from the tooth's Tx Planned tab on the next visit.</p>
      </div>
    ` : '';
    await setView(`
      <div class="view-header"><h1>${escapeHtml(patient.fullName)}</h1></div>
      ${pendingBannerHtml}
      <div class="card patient-summary-card">
        <div class="patient-summary-item"><span class="patient-summary-label">Age</span><span class="patient-summary-value">${age === null ? '—' : age}</span></div>
        <div class="patient-summary-item"><span class="patient-summary-label">Gender</span><span class="patient-summary-value">${escapeHtml(patient.gender || '—')}</span></div>
        <div class="patient-summary-item"><span class="patient-summary-label">Phone</span><span class="patient-summary-value">${escapeHtml(patient.phone || '—')}</span></div>
        <div class="patient-summary-item"><span class="patient-summary-label">Address</span><span class="patient-summary-value">${escapeHtml(patient.address || '—')}</span></div>
      </div>
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
    await updateContextBar();
  }
  
  const NEW_VISIT_REASON_CHIPS = [
    'Toothache / Pain',
    'Routine Checkup',
    'Cleaning / Scaling',
    'Filling / Restoration',
    'Swelling / Bleeding',
    'Follow-up',
    'Consultation'
  ];

  async function renderNewVisit(patientId) {
    const patient = await window.KnhosPatients.getPatient(patientId);
    const age = getAgeFromDob(patient.dob);
    const chipsHtml = NEW_VISIT_REASON_CHIPS.map((label) =>
      `<button type="button" class="reason-chip" data-reason="${escapeHtml(label)}">${escapeHtml(label)}</button>`
    ).join('');
    await setView(`
      <span class="view-eyebrow">New Visit Intake</span>
      <div class="patient-context-card">
        <div class="patient-context-name">${escapeHtml(patient.fullName)}</div>
        <div class="patient-context-meta">
          <span class="context-chip"><span class="context-chip-label">ID</span>${escapeHtml(patient.patientId)}</span>
          <span class="context-chip"><span class="context-chip-label">Age</span>${age === null ? '—' : age}</span>
          <span class="context-chip"><span class="context-chip-label">Gender</span>${escapeHtml(patient.gender || '—')}</span>
          <span class="context-chip"><span class="context-chip-label">Phone</span>${escapeHtml(patient.phone || '—')}</span>
        </div>
      </div>
      <div class="card">
        <form id="visit-form">
          <div class="field">
            <label>Reason for Visit</label>
            <div class="reason-chip-grid">${chipsHtml}</div>
            <input type="text" id="reason" placeholder="Tap a reason above or type here..." required>
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Create Visit</button></div>
        </form>
      </div>
    `);
    document.querySelectorAll('.reason-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const reasonInput = document.getElementById('reason');
        const chipText = chip.dataset.reason;
        const isNowActive = chip.classList.toggle('active');
        const parts = reasonInput.value
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s && s !== chipText);
        if (isNowActive) parts.push(chipText);
        reasonInput.value = parts.join(', ');
        reasonInput.focus();
      });
    });
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
  
  async function renderQueue() {
    setActiveNav('__none__');
    const waiting = await window.KnhosVisits.getWaitingVisits();
    const rowsHtml = await buildWaitingRowsHtml(waiting);
    await setView(`
      <div class="queue-view">
        <div class="view-header"><h1>Waiting Room</h1></div>
        <div id="queue-list">${rowsHtml}</div>
      </div>
    `);
    wireCallToChairButtons(viewRoot);
  }
  
  async function renderVisitClinicalRecord(visitId) {
    setActiveNav('__none__');
    const visit = await window.KnhosVisits.getVisit(visitId);
    if (!visit) { await setView(`<div class="card">Visit not found.</div>`); return; }
    const patient = await window.KnhosPatients.getPatient(visit.patientId);

    if (visit.status === 'waiting' || visit.status === 'on-hold') {
      visit.status = 'in-progress';
      await window.KnhosVisits.updateVisit(visit);
    }
    await updateContextBar();
    currentVisit = visit;
    currentPatient = patient;
    toothRecords = visit.toothRecords || {};
    rxItems = visit.rxItems || [];
    invoiceItems = visit.invoiceItems || [];
    currentMode = defaultModeForPatient(patient);
    activeToothNumber = null;
    const isCompleted = visit.status === 'completed';
    checkoutReadOnly = isCompleted;
    const lockedAttr = isCompleted ? 'disabled' : '';
    const pendingConsents = isCompleted ? [] : getPendingConsents(patient.patientId);
    const pendingBannerHtml = pendingConsents.length ? `
      <div class="pending-consent-banner">
        <h3>⚠ Pending Consent from a Previous Visit</h3>
        ${pendingConsents.map((p) => `
          <div class="pending-consent-item">
            <span class="pending-consent-item-label">Tooth #${escapeHtml(p.toothNumber)} — ${escapeHtml(TX_LABELS[p.treatment] || p.treatment)}</span>
            <button type="button" class="pending-consent-resolve-btn" data-tooth="${escapeHtml(p.toothNumber)}" data-treatment="${escapeHtml(p.treatment)}">Resolve Now</button>
          </div>
        `).join('')}
      </div>
    ` : '';
    await setView(`
      <div class="clinical-record-header">
        <div class="clinical-record-header-top">
          <h1>${escapeHtml(patient.fullName)}</h1>
          ${isCompleted ? '' : '<button id="step-out-btn" type="button" class="btn btn-secondary step-out-btn">⏸ Step Out / Resting</button>'}
        </div>
        <span class="visit-meta">Visit ${escapeHtml(visit.visitId)}</span>
      </div>
      <div class="reason-banner">
        <div class="reason-banner-label">Reason for Visit</div>
        <div class="reason-banner-text">${escapeHtml(visit.reason || '—')}</div>
      </div>
      ${isCompleted ? '<div class="readonly-banner">This visit is completed and locked. Viewing read-only record.</div>' : ''}
      ${pendingBannerHtml}
      ${isCompleted ? '' : `
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
      <div id="live-summary-panel" class="live-summary-panel">
        <h4 class="panel-title">Live Clinical Summary</h4>
        <div id="live-summary-content">${generateClinicalSummary(toothRecords)}</div>
      </div>
      `}
      <section id="checkout-screen" class="checkout-screen ${isCompleted ? '' : 'hidden'}" ${isCompleted ? 'data-readonly="true"' : ''}>
        <div class="checkout-header">
          <h2>${isCompleted ? 'Visit Record' : 'Finish Treatment — Proofread'}</h2>
          <span id="checkout-patient-name"></span>
        </div>
        <div class="checkout-block">
          <h3>Clinical Summary</h3>
          <div id="checkout-summary-text" class="summary-readonly"></div>
        </div>
        <div class="checkout-block">
          <h3>Additional Notes</h3>
          <textarea id="manual-note-input" class="manual-note-textarea" placeholder="e.g. No treatment needed today" rows="3" ${lockedAttr}></textarea>
        </div>
        <div class="checkout-block">
          <h3>Prescription (Rx)</h3>
          <div id="rx-list"></div>
          <div class="rx-add-row">
            <div class="autocomplete-field">
              <input type="text" id="rx-drug-input" placeholder="Drug name" autocomplete="off" ${lockedAttr}>
              <ul id="rx-drug-suggestions" class="autocomplete-list hidden"></ul>
            </div>
            <div class="autocomplete-field">
              <input type="text" id="rx-dosage-input" placeholder="Dosage" autocomplete="off" ${lockedAttr}>
              <ul id="rx-dosage-suggestions" class="autocomplete-list hidden"></ul>
            </div>
            <button id="rx-add-btn" type="button" ${lockedAttr}>+ Add</button>
          </div>
        </div>
        <div class="checkout-block">
          <h3>Invoice</h3>
          <div id="invoice-list"></div>
          <div class="invoice-add-row">
            <div class="autocomplete-field">
              <input type="text" id="invoice-item-input" placeholder="Item / Procedure" autocomplete="off" ${lockedAttr}>
              <ul id="invoice-item-suggestions" class="autocomplete-list hidden"></ul>
            </div>
            <input type="number" id="invoice-amount-input" placeholder="₹ Amount" ${lockedAttr}>
            <button id="invoice-add-btn" type="button" ${lockedAttr}>+ Add</button>
          </div>
          <div class="invoice-total">Total: ₹<span id="invoice-total-amount">0</span></div>
        </div>
        <div class="checkout-block">
          <h3>Next Appointment</h3>
          <label class="next-appt-label">
            Suggested date <span id="next-appt-reason" class="reason-text"></span>
            <input type="date" id="next-appt-date-input" ${lockedAttr}>
          </label>
        </div>
        <div id="save-close-error" class="save-close-error hidden"></div>
        <div class="checkout-actions">
          <button id="print-rx-btn" type="button" class="checkout-btn secondary">Print Rx</button>
          <button id="print-invoice-btn" type="button" class="checkout-btn secondary">Print Invoice</button>
          ${isCompleted ? '' : '<button id="step-out-btn-checkout" type="button" class="checkout-btn secondary step-out-btn">⏸ Step Out / Resting</button>'}
          ${isCompleted ? '' : '<button id="save-close-visit-btn" type="button" class="checkout-btn primary">Save &amp; Close Visit</button>'}
        </div>
      </section>
    `);
    if (!isCompleted) {
      document.querySelectorAll('.dent-toggle-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === currentMode);
        btn.addEventListener('click', () => {
          document.querySelectorAll('.dent-toggle-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          currentMode = btn.dataset.mode;
          renderOdontogram();
        });
      });
      document.getElementById('odontogram-container').addEventListener('click', (e) => {
        const toothNum = e.target.dataset.tooth;
        if (!toothNum) return;
        openToothModal(toothNum);
      });
      renderOdontogram();
      document.getElementById('finish-treatment-btn').addEventListener('click', async () => {
        const { summary, suggestion } = await onFinishTreatmentClick();
        document.getElementById('checkout-patient-name').textContent = currentPatient.fullName;
        document.getElementById('checkout-summary-text').innerHTML = summary;
        document.getElementById('next-appt-reason').textContent = suggestion.reason || '';
        document.getElementById('next-appt-date-input').value = suggestion.suggestedDate ? formatDateForInput(suggestion.suggestedDate) : '';
        renderRxList();
        renderInvoiceList();
        document.getElementById('odontogram-section').classList.add('hidden');
        const liveSummaryPanel = document.getElementById('live-summary-panel');
        if (liveSummaryPanel) liveSummaryPanel.classList.add('hidden');
        document.getElementById('checkout-screen').classList.remove('hidden');
      });
      document.querySelectorAll('.pending-consent-resolve-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeToothNumber = btn.dataset.tooth;
          openConsentOverlay(btn.dataset.tooth, btn.dataset.treatment, { resolvingPending: true });
        });
      });
    } else {
      document.getElementById('checkout-patient-name').textContent = currentPatient.fullName;
      document.getElementById('checkout-summary-text').innerHTML = currentVisit.clinicalSummary || generateClinicalSummary(toothRecords);
      document.getElementById('next-appt-reason').textContent = currentVisit.suggestedNextAppointmentReason || '';
      document.getElementById('next-appt-date-input').value = currentVisit.nextAppointmentDate || '';
      document.getElementById('manual-note-input').value = currentVisit.manualNote || '';
      renderRxList();
      renderInvoiceList();
    }
    
    document.querySelectorAll('.step-out-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!currentVisit) return;
        const updated = await window.KnhosVisits.setVisitStatus(currentVisit.visitId, 'on-hold');
        if (updated) currentVisit = updated;
        await updateContextBar();
        window.KnhosRouter.navigate('#/home');
      });
    });
    
    wireAutocomplete('rx-drug-input', 'rx-drug-suggestions', RX_DRUG_SUGGESTIONS);
    wireAutocomplete('rx-dosage-input', 'rx-dosage-suggestions', RX_DOSAGE_SUGGESTIONS);
    wireAutocomplete('invoice-item-input', 'invoice-item-suggestions', INVOICE_ITEM_SUGGESTIONS);

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
    
    document.getElementById('print-rx-btn').addEventListener('click', () => {
      printRxDoc();
    });
    document.getElementById('print-invoice-btn').addEventListener('click', () => {
      printInvoiceDoc();
    });
    
    const saveCloseBtn = document.getElementById('save-close-visit-btn');
    if (saveCloseBtn) {
      saveCloseBtn.addEventListener('click', async () => {
        const manualNote = document.getElementById('manual-note-input').value.trim();
        const hasClinicalData = Object.values(toothRecords).some((r) => r.finding || r.txPlanned || r.txDone);
        const hasRx = rxItems.length > 0;
        const hasInvoice = invoiceItems.length > 0;
        const errorEl = document.getElementById('save-close-error');
        
        if (!hasClinicalData && !hasRx && !hasInvoice && !manualNote) {
          errorEl.textContent = 'Cannot close an empty visit. Record a finding, treatment, Rx item, or invoice item — or add a note (e.g. "No treatment needed today").';
          errorEl.classList.remove('hidden');
          return;
        }
        errorEl.classList.add('hidden');
        
        currentVisit.status = 'completed';
        currentVisit.rxItems = rxItems;
        currentVisit.invoiceItems = invoiceItems;
        currentVisit.manualNote = manualNote;
        currentVisit.nextAppointmentDate = document.getElementById('next-appt-date-input').value;
        await window.KnhosVisits.updateVisit(currentVisit);
        await updateContextBar();
        window.KnhosRouter.navigate(`#/patients/${currentPatient.patientId}`);
      });
    }
  }
  
  // --- v1.0: Settings — Data Backup & Restore ---
  function showSettingsStatus(message, isError) {
    const el = document.getElementById('settings-status');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden', 'settings-status-error', 'settings-status-success');
    el.classList.add(isError ? 'settings-status-error' : 'settings-status-success');
  }
  async function handleExportBackup() {
    try {
      const data = await window.KnhosDB.exportDatabase();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const a = document.createElement('a');
      a.href = url;
      a.download = `knhos_backup_${y}-${m}-${d}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showSettingsStatus('Backup exported successfully.', false);
    } catch (err) {
      showSettingsStatus('Export failed: ' + err.message, true);
    }
  }
  function handleRestoreFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (err) {
        showSettingsStatus('That file is not valid JSON.', true);
        return;
      }
      const confirmed = window.confirm('WARNING: This will permanently overwrite all current clinic data. Are you sure you want to proceed?');
      if (!confirmed) return;
      try {
        showSettingsStatus('Restoring backup…', false);
        await window.KnhosDB.importDatabase(data);
        window.location.reload();
      } catch (err) {
        showSettingsStatus('Restore failed: ' + err.message, true);
      }
    };
    reader.onerror = () => showSettingsStatus('Could not read that file.', true);
    reader.readAsText(file);
  }
  async function renderSettings() {
    setActiveNav('#/settings');
    await setView(`
      <div class="view-header"><h1>⚙️ Settings</h1></div>
      <div class="card settings-card">
        <h2 class="settings-card-title">Data Backup &amp; Restore</h2>
        <p class="settings-note">KNHOS Lite stores all clinic data locally on this device. Export a backup
        regularly and keep the file somewhere safe — restoring from a backup will permanently replace
        everything currently stored on this device.</p>
        <div class="settings-btn-group">
          <button id="export-backup-btn" type="button" class="settings-btn settings-btn-export">
            <span class="settings-btn-icon">⬇️</span>
            <span>Export Database Backup</span>
          </button>
          <button id="restore-backup-btn" type="button" class="settings-btn settings-btn-restore">
            <span class="settings-btn-icon">⬆️</span>
            <span>Restore from Backup</span>
          </button>
          <input type="file" id="restore-file-input" accept=".json" class="hidden">
        </div>
        <div id="settings-status" class="settings-status hidden"></div>
      </div>
    `);
    document.getElementById('export-backup-btn').addEventListener('click', handleExportBackup);
    const fileInput = document.getElementById('restore-file-input');
    document.getElementById('restore-backup-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleRestoreFileSelected);
  }

  window.KnhosRouter.registerRoute('#/home', renderHome);
  window.KnhosRouter.registerRoute('#/patients', renderPatientsListOrSearch);
  window.KnhosRouter.registerRoute('#/search', renderPatientsListOrSearch);
  window.KnhosRouter.registerRoute('#/patients/new', renderNewPatient);
  window.KnhosRouter.registerRoute('#/patients/:id', (params) => renderPatientProfile(params.id));
  window.KnhosRouter.registerRoute('#/patients/:id/visits/new', (params) => renderNewVisit(params.id));
  window.KnhosRouter.registerRoute('#/patients/:id/consents/new', (params) => renderNewConsent(params.id));
  window.KnhosRouter.registerRoute('#/queue', renderQueue);
  window.KnhosRouter.registerRoute('#/visits/:id', (params) => renderVisitClinicalRecord(params.id));
  window.KnhosRouter.registerRoute('#/settings', renderSettings);
  
  navButtons.forEach((btn) => btn.addEventListener('click', () => window.KnhosRouter.navigate(btn.dataset.route)));
  document.getElementById('brand-home-btn').addEventListener('click', () => window.KnhosRouter.navigate('#/home'));
  
  const globalBackBtn = document.getElementById('global-back-btn');
  if (globalBackBtn) {
    globalBackBtn.addEventListener('click', () => window.KnhosRouter.goBack());
  }
  function updateBackButtonVisibility() {
    if (globalBackBtn) globalBackBtn.classList.toggle('hidden', !window.KnhosRouter.canGoBack());
  }
  
  window.addEventListener('hashchange', () => { 
    updateContextBar(); 
    updateBackButtonVisibility(); 
  });
  
  async function initApp() {
    await window.KnhosDB.openDatabase();
    window.KnhosRouter.startRouter();
    await updateContextBar();
    updateBackButtonVisibility();
  }
  initApp();
})();


