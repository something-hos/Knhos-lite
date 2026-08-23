/**
 * app.js
 * Stage 1: view rendering + wiring for Home, New Patient (with duplicate
 * warning), Patients list, Search, Patient profile, and a Backup/Export
 * stub screen (ZIP packaging itself is a later stage).
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

/* ---------------- Backup status (metadata only, not patient data) ---------------- */

const LAST_BACKUP_KEY = 'knhos_last_backup_iso';

function getLastBackupDate() {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

/* ==========================================================
   HOME
   ========================================================== */

function renderHome() {
  setActiveNav('#/home');
  const lastBackup = getLastBackupDate();
  const backupLine = lastBackup
    ? `Last backup: ${formatDate(lastBackup)}`
    : 'No backup taken yet';

  setView(`
    <div class="view-header">
      <h1>Home</h1>
      <p>KNHOS Lite — temporary patient records, until the full KNHOS system is ready.</p>
    </div>
    <div class="home-grid">
      <a class="home-tile" href="#/patients/new">
        <span class="home-tile-icon">＋</span>
        <span class="home-tile-title">New Patient</span>
        <span class="home-tile-desc">Register a new patient and get an automatic ID.</span>
      </a>
      <a class="home-tile" href="#/patients">
        <span class="home-tile-icon">☰</span>
        <span class="home-tile-title">Patients</span>
        <span class="home-tile-desc">Browse all registered patients.</span>
      </a>
      <a class="home-tile" href="#/search">
        <span class="home-tile-icon">⌕</span>
        <span class="home-tile-title">Search</span>
        <span class="home-tile-desc">Find a patient by ID, name, or phone.</span>
      </a>
      <a class="home-tile home-tile-backup" href="#/backup">
        <span class="home-tile-icon">⇩</span>
        <span class="home-tile-title">Backup / Export</span>
        <span class="home-tile-desc">Local storage is not a substitute for backup.</span>
        <span class="backup-status-line">${backupLine}</span>
      </a>
    </div>
  `);
}

/* ==========================================================
   NEW PATIENT (with duplicate detection)
   ========================================================== */

let pendingRegistration = null; // holds form data while a duplicate warning is shown

function renderNewPatient(prefill, duplicateWarningHtml) {
  setActiveNav('#/patients/new');
  const v = prefill || {};
  setView(`
    <div class="view-header">
      <h1>New Patient</h1>
      <p>Patient ID is generated automatically after saving.</p>
    </div>
    ${duplicateWarningHtml || ''}
    <div class="card">
      <form id="new-patient-form">
        <div class="form-grid">
          <div class="field">
            <label for="fullName">Full Name <span class="required-mark">*</span></label>
            <input type="text" id="fullName" name="fullName" required autocomplete="off" value="${escapeHtml(v.fullName)}">
          </div>
          <div class="field">
            <label for="dob">Date of Birth <span class="required-mark">*</span></label>
            <input type="date" id="dob" name="dob" required value="${escapeHtml(v.dob)}">
          </div>
          <div class="field">
            <label for="gender">Gender <span class="required-mark">*</span></label>
            <select id="gender" name="gender" required>
              <option value="" ${!v.gender ? 'selected' : ''} disabled>Select…</option>
              <option value="Female" ${v.gender === 'Female' ? 'selected' : ''}>Female</option>
              <option value="Male" ${v.gender === 'Male' ? 'selected' : ''}>Male</option>
              <option value="Other" ${v.gender === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="field">
            <label for="phone">Phone Number</label>
            <input type="tel" id="phone" name="phone" autocomplete="off" value="${escapeHtml(v.phone)}">
            <span class="field-hint">Optional</span>
          </div>
          <div class="field" style="grid-column: 1 / -1;">
            <label for="address">Address</label>
            <textarea id="address" name="address" rows="2">${escapeHtml(v.address)}</textarea>
            <span class="field-hint">Optional</span>
          </div>
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
  return {
    fullName: document.getElementById('fullName').value.trim(),
    dob: document.getElementById('dob').value,
    gender: document.getElementById('gender').value,
    phone: document.getElementById('phone').value.trim(),
    address: document.getElementById('address').value.trim(),
  };
}

async function onSubmitNewPatient(event) {
  event.preventDefault();
  const data = readNewPatientForm();

  if (!data.fullName || !data.dob || !data.gender) {
    renderNewPatient(data, `
      <div class="alert alert-error">
        <h3>Missing required information</h3>
        <p>Full Name, Date of Birth, and Gender are required.</p>
      </div>
    `);
    return;
  }

  const duplicates = await window.KnhosPatients.findPossibleDuplicates(data);

  if (duplicates.length > 0) {
    pendingRegistration = data;
    const items = duplicates.map((p) => `
      <div class="patient-row" style="cursor:default;">
        <div class="patient-row-main">
          <span class="patient-row-name">${escapeHtml(p.fullName)}</span>
          <span class="patient-row-id">${escapeHtml(p.patientId)}</span>
        </div>
        <div class="patient-row-meta">
          DOB: ${escapeHtml(p.dob)}<br>
          ${p.phone ? `Phone: ${escapeHtml(p.phone)}` : 'No phone on file'}
        </div>
        <div class="alert-actions">
          <button class="btn btn-secondary open-existing-btn" data-id="${escapeHtml(p.patientId)}">Open This Patient</button>
        </div>
      </div>
    `).join('');

    renderNewPatient(data, `
      <div class="alert alert-warn">
        <h3>Possible duplicate patient found</h3>
        <p>A patient with a matching phone number or matching name + date of birth already exists. Please check before creating a new record.</p>
        <div class="patient-list" style="margin-top: 12px;">${items}</div>
        <div class="alert-actions">
          <button class="btn btn-primary" id="continue-anyway-btn">Continue Anyway — Register as New Patient</button>
        </div>
      </div>
    `);

    document.querySelectorAll('.open-existing-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingRegistration = null;
        window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(btn.dataset.id)}`);
      });
    });
    document.getElementById('continue-anyway-btn').addEventListener('click', async () => {
      await finalizeRegistration(pendingRegistration);
    });
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
   PATIENTS LIST / SEARCH (shared implementation)
   ========================================================== */

function renderPatientRow(p) {
  return `
    <li>
      <button class="patient-row" data-id="${escapeHtml(p.patientId)}">
        <div class="patient-row-main">
          <span class="patient-row-name">${escapeHtml(p.fullName)}</span>
          <span class="patient-row-id">${escapeHtml(p.patientId)}</span>
        </div>
        <div class="patient-row-meta">
          DOB: ${escapeHtml(p.dob)}<br>
          ${p.phone ? escapeHtml(p.phone) : 'No phone on file'}
        </div>
      </button>
    </li>
  `;
}

async function renderPatientsListOrSearch(routeHash, heading, subheading, initialQuery) {
  setActiveNav(routeHash);
  setView(`
    <div class="view-header">
      <h1>${heading}</h1>
      <p>${subheading}</p>
    </div>
    <div class="search-bar">
      <input type="search" id="patient-search-input" placeholder="Search by Patient ID, name, or phone number…" value="${escapeHtml(initialQuery || '')}">
    </div>
    <ul class="patient-list" id="patient-list-container"></ul>
  `);

  const input = document.getElementById('patient-search-input');
  const container = document.getElementById('patient-list-container');

  async function runSearch(q) {
    const results = q ? await window.KnhosPatients.searchPatients(q) : await window.KnhosPatients.listPatients();
    if (results.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">⌕</span>
          ${q ? 'No patients match your search.' : 'No patients registered yet.'}
        </div>
      `;
      return;
    }
    container.innerHTML = results.map(renderPatientRow).join('');
    container.querySelectorAll('.patient-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.KnhosRouter.navigate(`#/patients/${encodeURIComponent(btn.dataset.id)}`);
      });
    });
  }

  input.addEventListener('input', () => runSearch(input.value.trim()));
  await runSearch(initialQuery || '');
  if (routeHash === '#/search') input.focus();
}

/* ==========================================================
   PATIENT PROFILE
   ========================================================== */

async function renderPatientProfile(patientId, justCreated) {
  setActiveNav('__none__');
  const patient = await window.KnhosPatients.getPatient(patientId);

  if (!patient) {
    setView(`
      <div class="alert alert-error">
        <h3>Patient not found</h3>
        <p>No patient exists with ID "${escapeHtml(patientId)}".</p>
        <div class="alert-actions">
          <button class="btn btn-secondary" id="back-to-patients-btn">Back to Patients</button>
        </div>
      </div>
    `);
    document.getElementById('back-to-patients-btn').addEventListener('click', () => {
      window.KnhosRouter.navigate('#/patients');
    });
    return;
  }

  setView(`
    <div class="view-header">
      <h1>${escapeHtml(patient.fullName)}</h1>
      <p><span class="profile-id-badge">${escapeHtml(patient.patientId)}</span></p>
    </div>
    ${justCreated ? `
      <div class="alert alert-success">
        <h3>Patient registered</h3>
        <p>Patient ID ${escapeHtml(patient.patientId)} has been created and saved to this iPad.</p>
      </div>
    ` : ''}
    <div class="card">
      <div class="section-title">Patient Information</div>
      <div class="profile-fields">
        <div>
          <div class="profile-field-label">Patient ID</div>
          <div class="profile-field-value">${escapeHtml(patient.patientId)}</div>
        </div>
        <div>
          <div class="profile-field-label">Full Name</div>
          <div class="profile-field-value">${escapeHtml(patient.fullName)}</div>
        </div>
        <div>
          <div class="profile-field-label">Date of Birth</div>
          <div class="profile-field-value">${escapeHtml(patient.dob)}</div>
        </div>
        <div>
          <div class="profile-field-label">Gender</div>
          <div class="profile-field-value">${escapeHtml(patient.gender)}</div>
        </div>
        <div>
          <div class="profile-field-label">Phone</div>
          <div class="profile-field-value">${patient.phone ? escapeHtml(patient.phone) : '—'}</div>
        </div>
        <div>
          <div class="profile-field-label">Address</div>
          <div class="profile-field-value">${patient.address ? escapeHtml(patient.address) : '—'}</div>
        </div>
        <div>
          <div class="profile-field-label">Registered</div>
          <div class="profile-field-value">${formatDateTime(patient.createdAt)}</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">Visit &amp; Consent History</div>
      <div class="notice-inline">Visits, consents, and signatures are not part of this stage yet. They will appear here once that part of KNHOS Lite is built.</div>
    </div>
  `);
}

/* ==========================================================
   BACKUP / EXPORT (stub for Stage 1)
   ========================================================== */

function renderBackup() {
  setActiveNav('#/backup');
  const lastBackup = getLastBackupDate();
  setView(`
    <div class="view-header">
      <h1>Backup / Export</h1>
      <p>Local storage on this iPad is not a substitute for backup.</p>
    </div>
    <div class="card">
      <div class="section-title">Status</div>
      <p>${lastBackup ? `Last backup: <strong>${formatDate(lastBackup)}</strong>` : 'No backup has been taken yet.'}</p>
      <div class="notice-inline" style="margin-top: 14px;">
        Export/backup functionality (JSON + signatures package) will be built in a later development stage, after the core patient/visit/consent workflow is complete. This screen is a placeholder so the feature has a permanent, visible home from day one.
      </div>
    </div>
  `);
}

/* ==========================================================
   ROUTES
   ========================================================== */

window.KnhosRouter.registerRoute('#/home', renderHome);
window.KnhosRouter.registerRoute('#/patients/new', () => renderNewPatient(pendingRegistration));
window.KnhosRouter.registerRoute('#/patients', () => renderPatientsListOrSearch('#/patients', 'Patients', 'All registered patients.', ''));
window.KnhosRouter.registerRoute('#/search', () => renderPatientsListOrSearch('#/search', 'Search', 'Find a patient by ID, name, or phone number.', ''));
window.KnhosRouter.registerRoute('#/backup', renderBackup);
window.KnhosRouter.registerRoute('#/patients/:id', (params) => {
  const url = new URL(window.location.href);
  const justCreated = url.hash.includes('created=1');
  renderPatientProfile(params.id, justCreated);
});

/* ---------------- Global nav wiring ---------------- */

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    pendingRegistration = null;
    window.KnhosRouter.navigate(btn.dataset.route);
  });
});
document.getElementById('brand-home-btn').addEventListener('click', () => {
  window.KnhosRouter.navigate('#/home');
});

/* ---------------- App init ---------------- */

async function initApp() {
  try {
    await window.KnhosDB.openDatabase();
  } catch (err) {
    setView(`
      <div class="alert alert-error">
        <h3>Storage unavailable</h3>
        <p>This device or browser could not open local storage (IndexedDB), so KNHOS Lite cannot run. Details: ${escapeHtml(err && err.message)}</p>
      </div>
    `);
    return;
  }

  window.KnhosRouter.startRouter();

  if ('serviceWorker' in navigator) {
    // service-worker.js lives at the project root (not pwa/) specifically
    // so its default scope already covers the whole app — see the comment
    // at the top of service-worker.js for why.
    navigator.serviceWorker.register('service-worker.js', { scope: './' }).catch(() => {
      // Non-fatal: app still works online; offline caching just won't be active.
    });
  }
}

initApp();
})();
