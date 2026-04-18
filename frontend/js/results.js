/**
 * results.js — CelastiCast results page
 *
 * Reads prediction data from sessionStorage (set by analyze.js)
 * and renders:
 *  - Summary stat cards
 *  - Distribution bars
 *  - Confidence histogram (canvas)
 *  - Sortable, filterable, paginated predictions table
 *  - CSV export
 */

const PAGE_SIZE = 20;
const COLORS = { STAR: '#a3d4ff', GALAXY: '#7ec8e3', QSO: '#e8b87c' };

let allPredictions = [];
let filteredPredictions = [];
let currentPage = 1;
let sortCol = 'id';
let sortDir = 1; // 1 = asc, -1 = desc
let filterClass = 'ALL';

document.addEventListener('DOMContentLoaded', () => {
  const raw = sessionStorage.getItem('celesticast_results');
  if (!raw) {
    showEmpty('No results found. Please run a classification first.');
    return;
  }

  let data;
  try { data = JSON.parse(raw); }
  catch { showEmpty('Results data is corrupted.'); return; }

  allPredictions = data.predictions || [];
  filteredPredictions = [...allPredictions];

  if (allPredictions.length === 0) {
    showEmpty('Classification returned no results.');
    return;
  }

  renderSummary(data);
  renderModelInfo(data.model_info || {});
  renderDistBars(data.summary || {});
  renderConfHistogram(allPredictions);
  renderRedshiftChart(allPredictions);
  setupTable();
  renderTable();
  setupExport();
});

// ── Summary cards ────────────────────────────────────────
function renderSummary(data) {
  const s = data.summary || {};
  const counts = s.counts || {};
  setText('sum-total',   s.total || allPredictions.length);
  setText('sum-star',    counts.STAR   || 0);
  setText('sum-galaxy',  counts.GALAXY || 0);
  setText('sum-qso',     counts.QSO    || 0);
  setText('sum-conf',    s.avg_confidence ? (s.avg_confidence * 100).toFixed(1) + '%' : '—');
}

// ── Model info bar ───────────────────────────────────────
function renderModelInfo(info) {
  setText('mi-algo',    info.algorithm || 'Random Forest');
  setText('mi-trees',   info.n_estimators || '—');
  setText('mi-acc',     info.accuracy ? (info.accuracy * 100).toFixed(2) + '%' : '—');
  setText('mi-objects', allPredictions.length);
}

// ── Distribution bars ────────────────────────────────────
function renderDistBars(summary) {
  const total = summary.total || allPredictions.length || 1;
  const counts = summary.counts || countClasses(allPredictions);
  for (const cls of ['STAR', 'GALAXY', 'QSO']) {
    const pct = ((counts[cls] || 0) / total * 100).toFixed(1);
    const bar = document.getElementById(`bar-${cls.toLowerCase()}`);
    const pctEl = document.getElementById(`pct-${cls.toLowerCase()}`);
    const countEl = document.getElementById(`count-${cls.toLowerCase()}`);
    if (bar) setTimeout(() => { bar.style.width = pct + '%'; }, 100);
    if (pctEl) pctEl.textContent = pct + '%';
    if (countEl) countEl.textContent = counts[cls] || 0;
  }
}

// ── Confidence histogram ─────────────────────────────────
function renderConfHistogram(predictions) {
  const canvas = document.getElementById('conf-histogram');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 400;
  const H = 140;
  canvas.width = W;
  canvas.height = H;

  // 10 bins: 0.5-1.0
  const bins = Array(10).fill(0);
  for (const p of predictions) {
    const idx = Math.min(9, Math.floor((p.confidence - 0.0) * 10));
    bins[Math.max(0, idx)]++;
  }
  const maxBin = Math.max(...bins, 1);
  const pad = { l: 10, r: 10, t: 10, b: 24 };
  const bW = (W - pad.l - pad.r) / 10;

  ctx.clearRect(0, 0, W, H);

  bins.forEach((count, i) => {
    const x = pad.l + i * bW;
    const barH = ((H - pad.t - pad.b) * count / maxBin);
    const y = H - pad.b - barH;
    // color by bin (green → purple)
    const alpha = 0.5 + 0.5 * (i / 9);
    ctx.fillStyle = `rgba(85, 72, 228, ${alpha})`;
    ctx.fillRect(x + 1, y, bW - 2, barH);
  });

  // x axis labels
  ctx.fillStyle = '#6e7190';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 10; i += 2) {
    const val = (i * 0.1).toFixed(1);
    ctx.fillText(val, pad.l + i * bW, H - 6);
  }
}

// ── Redshift scatter (by class) ──────────────────────────
function renderRedshiftChart(predictions) {
  const canvas = document.getElementById('redshift-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 400;
  const H = 140;
  canvas.width = W;
  canvas.height = H;

  const pad = { l: 10, r: 10, t: 10, b: 24 };

  const rzMax = Math.max(...predictions.map(p => p.input?.redshift ?? 0), 0.1) * 1.05;
  const rzMin = 0;

  ctx.clearRect(0, 0, W, H);

  // grid lines
  ctx.strokeStyle = '#1a1b2e';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + i * (H - pad.t - pad.b) / 4;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
  }

  for (const p of predictions) {
    const rz = p.input?.redshift ?? 0;
    const conf = p.confidence ?? 0.5;
    const x = pad.l + ((rz - rzMin) / (rzMax - rzMin)) * (W - pad.l - pad.r);
    const y = H - pad.b - (conf * (H - pad.t - pad.b));
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = (COLORS[p.class] || '#888') + 'bb';
    ctx.fill();
  }

  // axis labels
  ctx.fillStyle = '#6e7190';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('redshift →', pad.l, H - 6);
  ctx.textAlign = 'right';
  ctx.fillText(rzMax.toFixed(2), W - pad.r, H - 6);
}

// ── Table ────────────────────────────────────────────────
function setupTable() {
  // Filter
  const filterEl = document.getElementById('class-filter');
  filterEl?.addEventListener('change', () => {
    filterClass = filterEl.value;
    applyFilter();
    currentPage = 1;
    renderTable();
  });

  // Sort headers
  document.querySelectorAll('thead th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) { sortDir *= -1; }
      else { sortCol = col; sortDir = 1; }
      document.querySelectorAll('thead th').forEach(t => t.classList.remove('sorted'));
      th.classList.add('sorted');
      applyFilter();
      renderTable();
    });
  });
}

function applyFilter() {
  filteredPredictions = filterClass === 'ALL'
    ? [...allPredictions]
    : allPredictions.filter(p => p.class === filterClass);

  filteredPredictions.sort((a, b) => {
    let av, bv;
    switch (sortCol) {
      case 'id':         av = a.id;         bv = b.id;         break;
      case 'class':      av = a.class;      bv = b.class;      break;
      case 'confidence': av = a.confidence; bv = b.confidence; break;
      case 'redshift':   av = a.input?.redshift ?? 0; bv = b.input?.redshift ?? 0; break;
      default:           av = a.id;         bv = b.id;
    }
    return typeof av === 'string'
      ? av.localeCompare(bv) * sortDir
      : (av - bv) * sortDir;
  });
}

function renderTable() {
  const tbody = document.getElementById('results-tbody');
  const totalEl = document.getElementById('table-total');
  const paginationEl = document.getElementById('pagination-btns');
  if (!tbody) return;

  const total = filteredPredictions.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = filteredPredictions.slice(start, start + PAGE_SIZE);

  // Render rows
  tbody.innerHTML = slice.map(p => {
    const confPct = (p.confidence * 100).toFixed(1);
    const rz = p.input?.redshift?.toFixed(4) ?? '—';
    const u  = p.input?.u?.toFixed(3) ?? '—';
    const g  = p.input?.g?.toFixed(3) ?? '—';
    const r  = p.input?.r?.toFixed(3) ?? '—';
    return `
      <tr class="${p.class}">
        <td>${p.id}</td>
        <td><span class="class-badge ${p.class}">${p.class}</span></td>
        <td>
          <div class="conf-bar">
            <div class="conf-bar__track">
              <div class="conf-bar__fill" style="width:${confPct}%"></div>
            </div>
            ${confPct}%
          </div>
        </td>
        <td>${u}</td>
        <td>${g}</td>
        <td>${r}</td>
        <td>${rz}</td>
        <td style="font-size:11px;color:var(--text-muted)">
          S:${(p.probabilities?.STAR*100).toFixed(0)}%
          G:${(p.probabilities?.GALAXY*100).toFixed(0)}%
          Q:${(p.probabilities?.QSO*100).toFixed(0)}%
        </td>
      </tr>`;
  }).join('');

  if (totalEl) totalEl.textContent = `${total} object${total !== 1 ? 's' : ''}`;

  // Pagination
  if (paginationEl) {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 || i === totalPages ||
        (i >= currentPage - 1 && i <= currentPage + 1)
      ) {
        pages.push(i);
      } else if (
        i === currentPage - 2 || i === currentPage + 2
      ) {
        pages.push('…');
      }
    }
    // Dedupe ellipsis
    const uniq = pages.filter((v, i, a) => !(v === '…' && a[i-1] === '…'));
    paginationEl.innerHTML = uniq.map(p => p === '…'
      ? `<span style="padding:0 4px;color:var(--text-muted)">…</span>`
      : `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`
    ).join('');

    paginationEl.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page);
        renderTable();
      });
    });
  }
}

// ── Export ───────────────────────────────────────────────
function setupExport() {
  document.getElementById('export-btn')?.addEventListener('click', () => {
    const rows = [
      ['id', 'class', 'confidence', 'prob_STAR', 'prob_GALAXY', 'prob_QSO', 'u', 'g', 'r', 'i', 'z', 'redshift'],
      ...allPredictions.map(p => [
        p.id, p.class, p.confidence,
        p.probabilities?.STAR, p.probabilities?.GALAXY, p.probabilities?.QSO,
        p.input?.u, p.input?.g, p.input?.r, p.input?.i, p.input?.z, p.input?.redshift,
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'celesticast_results.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ── Helpers ──────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function countClasses(predictions) {
  const c = { STAR: 0, GALAXY: 0, QSO: 0 };
  for (const p of predictions) { if (c[p.class] !== undefined) c[p.class]++; }
  return c;
}

function showEmpty(msg) {
  const layout = document.querySelector('.results-layout');
  if (!layout) return;
  layout.innerHTML = `
    <div class="empty-state">
      <h3>No Results</h3>
      <p>${msg}</p>
      <a href="analyze.html" class="btn btn-primary">Classify Objects</a>
    </div>`;
}
