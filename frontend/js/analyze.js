/**
 * analyze.js — CelastiCast data input page logic
 *
 * Handles three input modes:
 *  1. CSV file upload
 *  2. Manual field-by-field input (one or more rows)
 *  3. Pasted CSV text
 */

// ── Config ──────────────────────────────────────────────
const DEFAULT_API = 'http://localhost:8080';
const FIELDS = [
  { key: 'u',        label: 'u',        hint: 'e.g. 19.84', desc: 'UV filter magnitude' },
  { key: 'g',        label: 'g',        hint: 'e.g. 19.52', desc: 'Green filter magnitude' },
  { key: 'r',        label: 'r',        hint: 'e.g. 19.46', desc: 'Red filter magnitude' },
  { key: 'i',        label: 'i',        hint: 'e.g. 19.17', desc: 'NIR filter magnitude' },
  { key: 'z',        label: 'z',        hint: 'e.g. 19.10', desc: 'IR filter magnitude' },
  { key: 'redshift', label: 'redshift', hint: 'e.g. 0.083',  desc: 'Spectroscopic redshift' },
];

// ── State ────────────────────────────────────────────────
let activeTab = 'upload';
let selectedFile = null;
let manualRowCount = 1;

// ── Elements ─────────────────────────────────────────────
const tabBtns     = document.querySelectorAll('.tab-btn');
const tabPanels   = document.querySelectorAll('.tab-panel');
const apiInput    = document.getElementById('api-url');
const alertEl     = document.getElementById('alert');
const submitBtn   = document.getElementById('submit-btn');
const loadingEl   = document.getElementById('loading-overlay');

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  apiInput.value = localStorage.getItem('celesticast_api') || DEFAULT_API;
  apiInput.addEventListener('change', () => {
    localStorage.setItem('celesticast_api', apiInput.value.trim());
  });

  setupTabs();
  setupUploadTab();
  setupManualTab();
  setupPasteTab();
  setupSubmit();
  loadSampleHint();
});

// ── Tabs ─────────────────────────────────────────────────
function setupTabs() {
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.toggle('active', b === btn));
      tabPanels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + activeTab));
      hideAlert();
    });
  });
}

// ── Upload Tab ───────────────────────────────────────────
function setupUploadTab() {
  const dropzone   = document.getElementById('dropzone');
  const fileInput  = document.getElementById('file-input');
  const fileInfo   = document.getElementById('file-info');
  const fileName   = document.getElementById('file-name');
  const fileSize   = document.getElementById('file-size');
  const clearBtn   = document.getElementById('clear-file');

  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.remove('visible');
  });

  function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(csv|txt)$/i)) {
      showAlert('Only .csv files are accepted.', 'error');
      return;
    }
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    fileInfo.classList.add('visible');
    hideAlert();
  }
}

// ── Manual Tab ───────────────────────────────────────────
function setupManualTab() {
  const container = document.getElementById('manual-rows');
  const addBtn    = document.getElementById('add-row-btn');

  renderManualRow(container, 1);

  addBtn.addEventListener('click', () => {
    manualRowCount++;
    renderManualRow(container, manualRowCount);
  });
}

function renderManualRow(container, idx) {
  const div = document.createElement('div');
  div.className = 'manual-row';
  div.dataset.rowIdx = idx;
  div.innerHTML = `
    <div class="manual-row__label">Object #${idx}</div>
    ${idx > 1 ? `<button class="manual-row__remove" title="Remove" data-rm="${idx}">&times;</button>` : ''}
    <div class="form-grid">
      ${FIELDS.map(f => `
        <div class="form-field">
          <label>${f.label} <span>*</span>
            <span style="font-weight:300;color:#44455a;margin-left:4px;">${f.desc}</span>
          </label>
          <input type="number" step="any" placeholder="${f.hint}"
                 data-row="${idx}" data-field="${f.key}" autocomplete="off">
        </div>
      `).join('')}
    </div>
  `;
  container.appendChild(div);

  div.querySelector('[data-rm]')?.addEventListener('click', () => {
    div.remove();
  });
}

function collectManualRows() {
  const rows = document.querySelectorAll('.manual-row');
  const records = [];
  for (const row of rows) {
    const obj = {};
    const inputs = row.querySelectorAll('input[data-field]');
    let hasVal = false;
    for (const inp of inputs) {
      const val = inp.value.trim();
      if (val === '') {
        throw new Error(`Row ${row.dataset.rowIdx}: field "${inp.dataset.field}" is required.`);
      }
      obj[inp.dataset.field] = parseFloat(val);
      hasVal = true;
    }
    if (hasVal) records.push(obj);
  }
  return records;
}

// ── Paste Tab ────────────────────────────────────────────
function setupPasteTab() {
  // Nothing special to init; textarea is raw input
}

function collectPastedCSV() {
  const text = document.getElementById('csv-paste').value.trim();
  if (!text) throw new Error('Please paste CSV data before submitting.');
  return text;
}

// ── Sample hint loader ───────────────────────────────────
async function loadSampleHint() {
  const api = (localStorage.getItem('celesticast_api') || DEFAULT_API).replace(/\/$/, '');
  try {
    const res = await fetch(`${api}/api/sample`);
    if (res.ok) {
      const data = await res.json();
      const hint = document.getElementById('sample-hint');
      if (hint && data.samples && data.samples.length > 0) {
        const row = data.samples[0];
        const cols = ['u', 'g', 'r', 'i', 'z', 'redshift'];
        const header = cols.join(',');
        const vals = cols.map(c => row[c]).join(',');
        hint.textContent = `Example: ${header}\n        ${vals}`;
      }
    }
  } catch { /* backend may not be running */ }
}

// ── Submit ───────────────────────────────────────────────
function setupSubmit() {
  submitBtn.addEventListener('click', handleSubmit);
}

async function handleSubmit() {
  hideAlert();
  const api = (apiInput.value.trim() || DEFAULT_API).replace(/\/$/, '');

  let result;
  try {
    setLoading(true);

    if (activeTab === 'upload') {
      result = await submitUpload(api);
    } else if (activeTab === 'manual') {
      result = await submitManual(api);
    } else {
      result = await submitPaste(api);
    }
  } catch (err) {
    setLoading(false);
    showAlert(err.message || 'An unexpected error occurred.', 'error');
    return;
  }

  setLoading(false);

  // Store result in sessionStorage and navigate
  sessionStorage.setItem('celesticast_results', JSON.stringify(result));
  window.location.href = 'results.html';
}

async function submitUpload(api) {
  if (!selectedFile) throw new Error('Please select a CSV file first.');
  const fd = new FormData();
  fd.append('file', selectedFile);
  const res = await fetch(`${api}/api/classify/csv`, { method: 'POST', body: fd });
  return handleResponse(res);
}

async function submitManual(api) {
  const records = collectManualRows(); // throws on validation error
  if (records.length === 0) throw new Error('Add at least one object row.');
  const res = await fetch(`${api}/api/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  });
  return handleResponse(res);
}

async function submitPaste(api) {
  const csvText = collectPastedCSV(); // throws if empty
  const res = await fetch(`${api}/api/classify/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv_text: csvText }),
  });
  return handleResponse(res);
}

async function handleResponse(res) {
  let body;
  try { body = await res.json(); } catch { throw new Error('Server returned invalid JSON.'); }
  if (!res.ok) throw new Error(body.error || `Server error ${res.status}`);
  return body;
}

// ── Helpers ──────────────────────────────────────────────
function showAlert(msg, type = 'error') {
  alertEl.textContent = msg;
  alertEl.className = `alert alert-${type} visible`;
}

function hideAlert() {
  alertEl.className = 'alert';
}

function setLoading(on) {
  loadingEl.classList.toggle('visible', on);
  submitBtn.disabled = on;
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
