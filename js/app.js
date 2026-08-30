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

  /* ==========================================================
     Shared waiting-room helpers (used by Home, Queue, and the
     context bar's live refresh of the Home feed).
     ========================================================== */
  async function buildWaitingRowsHtml(waitingVisits) {
    const rows = await Promise.all(waitingVisits.map(async (v) => {
      const patient = await window.KnhosPatients.getPatient(v.patientId);
      return `
        <div class="card visit-row">
          <span>${escapeHtml(patient ? patient.fullName : 'Unknown')} — ${escapeHtml(v.reason || '')}</span>
          <button class="btn btn-primary call-to-chair-btn" type="button" data-visit-id="${escapeHtml(v.visitId)}">Call to Chair</button>
        </div>
      `;
    }));
    return rows.join('') || '<div class="card">No patients waiting.</div>';
  }

  async function callToChair(visitId) {
    const visit = await window.KnhosVisits.setVisitStatus(visitId, 'in-progress');
    if (!visit) return;
    localStorage.setItem('knhos_active_visit', visit.visitId);
    await updateContextBar();
    window.KnhosRouter.navigate(`#/visits/${visit.visitId}`);
  }

  function wireCallToChairButtons(root) {
    root.querySelectorAll('.call-to-chair-btn').forEach((btn) => {
      btn.addEventListener('click', () => callToChair(btn.dataset.visitId));
    });
  }

  /* ==========================================================
     Context bar (Waiting Room badge + active-patient pill).
     Also refreshes the Home screen's live waiting feed, if the
     Home view happens to be mounted, so nothing needs a hard
     browser refresh to stay current.

     Bug fix (Stage 1): the active-visit pill is re-validated
     against IndexedDB - never trusted from stale memory - every
     single time this runs, which includes every hashchange (so
     every navigation between patient dashboards). That is what
     guarantees an in-progress visit's status/pill survives you
     browsing away to a different patient and back.
     ========================================================== */
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

    // If the Home screen's live waiting-room feed is currently in the DOM,
    // refresh it too - this is what makes the feed update on every route
    // load/hashchange without a hard browser refresh.
    const homeList = document.getElementById('home-waiting-list');
    const homeCount = document.getElementById('home-waiting-count');
    if (homeList) {
      homeList.innerHTML = await buildWaitingRowsHtml(waitingVisits);
      wireCallToChairButtons(homeList);
    }
    if (homeCount) homeCount.textContent = String(waitingVisits.length);
  }

  /* ==========================================================
     Odontogram, clinical tabs, auto-summary, rules engine.
     Module-scoped state - reset each time a clinical record
     view is opened.
     ========================================================== */
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

  let currentMode = 'adult';
  let toothRecords = {};
  let currentVisit = null;
  let currentPatient = null;
  let activeToothNumber = null;
  let rxItems = [];
  let invoiceItems = [];
  let checkoutReadOnly = false; // true only when viewing a completed (locked) visit

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

  // Bug fix carried forward: bordered "tooth card" (rect + crown/root divider
  // line) instead of an organic blob.
  //
  // Stage 3 addition: `selectedTooth` - when a tooth number matches, an extra
  // scale() is appended to its transform attribute, and the CSS transition on
  // .tooth-group (see main.css) animates that change smoothly - this is the
  // "tapping a tooth enlarges it" behavior, done via transform, not opacity.
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

  // Stage 3: live clinical summary, docked bottom-left, refreshed every time
  // toothRecords changes - not just when "Finish Treatment" is clicked.
  function updateLiveSummary() {
    const el = document.getElementById('live-summary-content');
    if (!el) return;
    el.innerHTML = generateClinicalSummary(toothRecords);
  }

  // Stage 3: opening a tooth both shows the slide-in panel on the right AND
  // enlarges/re-renders the odontogram so the tapped tooth visually pops out
  // and the arches shift left to make room (via the .panel-open margin).
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
  }

  function closeToothModal() {
    document.getElementById('tooth-modal-backdrop').classList.add('closed');
    activeToothNumber = null;
    const odontoView = document.getElementById('odontogram-section');
    if (odontoView) odontoView.classList.remove('panel-open');
    // Only re-render if the odontogram is actually still mounted (it won't
    // be if Finish Treatment already swapped to the checkout screen).
    if (document.getElementById('upper-arch-svg')) renderOdontogram();
  }

  // Bug fix carried forward (Stage 1, re-verified): structured HTML
  // (Findings / Planned / Done sections) instead of one concatenated text
  // blob. Safe to use innerHTML - all inputs are our own fixed dropdown
  // labels plus numeric tooth IDs, never free-typed text. This same function
  // backs both the live summary panel (Stage 3) and the Close Visit /
  // completed-visit summary, so there is a single source of truth and no
  // path where the Close Visit screen can end up blank while data exists.
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

  // Bug fix (Stage 1): the clinical summary is generated and written to
  // currentVisit.clinicalSummary BEFORE navigating to the checkout/Close
  // Visit screen, and that same saved string (with a live fallback) is what
  // the checkout screen reads back - so there is no window where the Close
  // Visit screen can render before the summary exists.
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

  /* ==========================================================
     Checkout screen helpers
     ========================================================== */
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

  function populatePrintRxDoc() {
    document.getElementById('print-rx-patient-name').textContent = currentPatient.fullName;
    const age = getAgeFromDob(currentPatient.dob);
    document.getElementById('print-rx-patient-age').textContent = age === null ? '—' : age;
    document.getElementById('print-rx-patient-sex').textContent = currentPatient.gender || '—';
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

  /* ==========================================================
     Reusable signature pad. One implementation shared by the
     standalone New Consent view and the tooth-modal inline
     capture, instead of two copies of touch/mouse drawing logic.
     ========================================================== */
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

  // Wired once at load - the tooth-modal signature canvas is static markup,
  // unlike the odontogram/checkout which get rebuilt on every route render.
  const toothSignaturePad = wireSignaturePad(document.getElementById('tooth-signature-pad'));

  /* ==========================================================
     Static, page-load-time listeners for the modal & print docs
     (these elements live outside #view-root and are never
     re-rendered by the router, so they are wired exactly once
     here rather than inside each view function)
     ========================================================== */
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

  // "Link Consent" instantly opens the signature pad inline, captures a real
  // signature, and only then saves via window.KnhosConsents.createConsent()
  // and locks the badge.
  document.getElementById('link-consent-btn').addEventListener('click', () => {
    document.getElementById('tooth-signature-capture').classList.remove('hidden');
    toothSignaturePad.clear();
    toothSignaturePad.resize(); // must run after unhiding - offsetWidth is 0 while hidden
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
    // Persist progressively so chart data survives an app close/reload mid-visit.
    if (currentVisit) {
      currentVisit.toothRecords = toothRecords;
      await window.KnhosVisits.updateVisit(currentVisit);
    }
    updateLiveSummary(); // Stage 3: instant update, no need to close first
    closeToothModal();
  });

  /* ==========================================================
     Views
     ========================================================== */

  // Home shows functional action cards plus a live waiting-room feed. It
  // fetches fresh data on every render (every navigation to #/home,
  // including hashchange) and is also refreshed by updateContextBar on
  // every subsequent hashchange/status change - no hard refresh needed.
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

  // Patients list, filterable by name/ID. Registered at '#/patients'.
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

  // New digital consent, with a real touch/mouse signature pad.
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

  // Patient's Age (from DOB), Gender, Phone, and Address are shown in a
  // styled summary card BEFORE the visit history list. Visit history is
  // sorted newest-first by visits.js (untouched) - verified below.
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

    await setView(`
      <div class="view-header"><h1>${escapeHtml(patient.fullName)}</h1></div>
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

    // Bug fix (Stage 1): re-validate the context bar every time a patient
    // profile is opened, not just on hashchange. This is what guarantees
    // that switching from Patient A's dashboard to Patient B's dashboard
    // never leaves a stale/incorrect "Treating: ..." pill, and that the
    // in-progress visit's true DB status (not a cached value) always drives
    // what's shown.
    await updateContextBar();
  }

  async function renderNewVisit(patientId) {
    const patient = await window.KnhosPatients.getPatient(patientId);
    await setView(`
      <div class="view-header"><h1>New Visit Intake for ${escapeHtml(patient.fullName)}</h1></div>
      <div class="card">
        <form id="visit-form">
          <div class="field"><label>Reason</label><input type="text" id="reason" required></div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Create Visit</button></div>
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

  // Waiting room queue view. Stage 2: denser rows + internally-scrolling
  // list (via #queue-list/.queue-view CSS) so the queue is visible without
  // scrolling the whole page for typical queue sizes. For very large queues
  // the list itself will still scroll internally - there's no way to
  // guarantee zero scrolling for an unbounded number of patients.
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

  // The dental clinical record view - odontogram + checkout, one route.
  async function renderVisitClinicalRecord(visitId) {
    setActiveNav('__none__');
    const visit = await window.KnhosVisits.getVisit(visitId);
    if (!visit) { await setView(`<div class="card">Visit not found.</div>`); return; }
    const patient = await window.KnhosPatients.getPatient(visit.patientId);

    // A visit opened directly (e.g. from the patient profile) while still
    // 'waiting' is promoted to 'in-progress' so it doesn't sit orphaned in
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
    activeToothNumber = null;

    // A completed visit is historical - it renders straight into the
    // read-only checkout view with no odontogram/editing surface at all,
    // rather than a live workspace that merely looks disabled.
    const isCompleted = visit.status === 'completed';
    checkoutReadOnly = isCompleted;
    const lockedAttr = isCompleted ? 'disabled' : '';

    await setView(`
      <div class="clinical-record-header">
        <h1>${escapeHtml(patient.fullName)}</h1>
        <span class="visit-meta">Visit ${escapeHtml(visit.visitId)}</span>
      </div>

      <div class="reason-banner">
        <div class="reason-banner-label">Reason for Visit</div>
        <div class="reason-banner-text">${escapeHtml(visit.reason || '—')}</div>
      </div>

      ${isCompleted ? '<div class="readonly-banner">This visit is completed and locked. Viewing read-only record.</div>' : ''}

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
          <h3>Prescription (Rx)</h3>
          <div id="rx-list"></div>
          <div class="rx-add-row">
            <input type="text" id="rx-drug-input" placeholder="Drug name" list="rx-drug-datalist" ${lockedAttr}>
            <input type="text" id="rx-dosage-input" placeholder="Dosage" list="rx-dosage-datalist" ${lockedAttr}>
            <button id="rx-add-btn" type="button" ${lockedAttr}>+ Add</button>
          </div>
        </div>

        <div class="checkout-block">
          <h3>Invoice</h3>
          <div id="invoice-list"></div>
          <div class="invoice-add-row">
            <input type="text" id="invoice-item-input" placeholder="Item / Procedure" list="invoice-item-datalist" ${lockedAttr}>
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

        <div class="checkout-actions">
          <button id="print-rx-btn" type="button" class="checkout-btn secondary">Print Rx</button>
          <button id="print-invoice-btn" type="button" class="checkout-btn secondary">Print Invoice</button>
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
    } else {
      // Completed: populate the read-only checkout view directly from saved
      // data - no odontogram, no onFinishTreatmentClick (that would re-write the record).
      document.getElementById('checkout-patient-name').textContent = currentPatient.fullName;
      document.getElementById('checkout-summary-text').innerHTML = currentVisit.clinicalSummary || generateClinicalSummary(toothRecords);
      document.getElementById('next-appt-reason').textContent = currentVisit.suggestedNextAppointmentReason || '';
      document.getElementById('next-appt-date-input').value = currentVisit.nextAppointmentDate || '';
      renderRxList();
      renderInvoiceList();
    }

    // --- Rx builder ---
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

    // --- Invoice builder ---
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

    // --- Print buttons ---
    // Fix (Stage 1, re-verified): add the printing-* class, then defer
    // window.print() by one tick via setTimeout so the browser actually
    // repaints display:block on the print doc before the print dialog
    // captures the page - without this, iPad Safari can capture the
    // pre-repaint (still display:none) frame and print blank.
    document.getElementById('print-rx-btn').addEventListener('click', () => {
      populatePrintRxDoc();
      document.body.classList.add('printing-rx');
      setTimeout(() => {
        window.print();
        document.body.classList.remove('printing-rx');
      }, 100);
    });
    document.getElementById('print-invoice-btn').addEventListener('click', () => {
      populatePrintInvoiceDoc();
      document.body.classList.add('printing-invoice');
      setTimeout(() => {
        window.print();
        document.body.classList.remove('printing-invoice');
      }, 100);
    });

    // --- Save & Close Visit (not rendered at all when already completed) ---
    const saveCloseBtn = document.getElementById('save-close-visit-btn');
    if (saveCloseBtn) {
      saveCloseBtn.addEventListener('click', async () => {
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
  }

  /* ==========================================================
     Routing & init
     ========================================================== */
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

  // Keep the context bar (and, when mounted, the Home waiting feed) in sync
  // on every route change, not just on load.
  window.addEventListener('hashchange', () => { updateContextBar(); });

  async function initApp() {
    await window.KnhosDB.openDatabase();
    window.KnhosRouter.startRouter();
    await updateContextBar();
  }

  initApp();
})();
