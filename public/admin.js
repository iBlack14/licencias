/* admin.js — Panel Administrativo MTC */
'use strict';

/* ——————————————————————————————
   UTILIDADES
   —————————————————————————————— */
const $ = id => document.getElementById(id);
const qs = (sel, ctx = document) => ctx.querySelector(sel);

function toast(msg, type = 'info') {
  const icons = { success: 'check_circle', error: 'error', info: 'info' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="material-icons toast-icon">${icons[type] || 'info'}</span><span>${msg}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function statusBadge(status) {
  const cls = (status || '').toLowerCase();
  return `<span class="status-badge ${cls}"><span class="status-dot"></span>${status || 'Desconocido'}</span>`;
}

/* ——————————————————————————————
   LOGIN
   —————————————————————————————— */
const loginScreen  = $('login-screen');
const dashboard    = $('dashboard');
const loginForm    = $('login-form');
const loginError   = $('login-error');
const togglePass   = $('toggle-pass');
const loginPassInput = $('login-pass');

togglePass.addEventListener('click', () => {
  const show = loginPassInput.type === 'password';
  loginPassInput.type = show ? 'text' : 'password';
  togglePass.querySelector('.material-icons').textContent = show ? 'visibility_off' : 'visibility';
});

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.hidden = true;
  const btn = $('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="border-top-color:#fff;width:16px;height:16px;border-width:2px"></span> Ingresando…';

  const { ok, data } = await apiFetch('/api/admin/login', {
    method: 'POST',
    body: { username: $('login-user').value.trim(), password: $('login-pass').value }
  });

  if (ok) {
    loginScreen.style.animation = 'fadeOut .3s ease forwards';
    setTimeout(() => {
      loginScreen.hidden = true;
      dashboard.hidden = false;
      $('sidebar-user').textContent = $('login-user').value.trim() || 'admin';
      loadRecords();
    }, 300);
  } else {
    loginError.textContent = data.message || 'Credenciales incorrectas.';
    loginError.hidden = false;
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">login</span> Ingresar al Sistema';
    loginPassInput.value = '';
    loginPassInput.focus();
  }
});

/* ——————————————————————————————
   LOGOUT
   —————————————————————————————— */
$('logout-btn').addEventListener('click', async () => {
  await apiFetch('/api/admin/logout', { method: 'POST' });
  dashboard.hidden = true;
  loginScreen.hidden = false;
  loginScreen.style.animation = '';
  loginForm.reset();
  loginError.hidden = true;
  $('login-user').focus();
  toast('Sesión cerrada correctamente', 'info');
});

/* ——————————————————————————————
   SIDEBAR / NAVIGATION
   —————————————————————————————— */
const menuToggle = $('menu-toggle');
const sidebar    = $('sidebar');

menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('click', e => {
  if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== menuToggle)
    sidebar.classList.remove('open');
});

const sectionTitles = {
  'records': 'Gestión de Licencias',
  'stats': 'Estadísticas',
  'exam-conocimiento': 'Examen de Conocimiento',
  'exam-conduccion': 'Examen de Conducción'
};

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const section = btn.dataset.section;
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    $(`section-${section}`).classList.add('active');
    $('page-title').textContent = sectionTitles[section] || section;
    if (section === 'stats') renderStats();
    if (section === 'exam-conocimiento') renderExamConocimiento();
    if (section === 'exam-conduccion') renderExamConduccion();
    sidebar.classList.remove('open');
  });
});

/* ——————————————————————————————
   RECORDS STATE
   —————————————————————————————— */
let allRecords = [];
let editingDoc  = null; // documentNumber being edited, or null for new
let deleteTarget = null;
let activeFilter = 'all';
let searchTerm   = '';

/* ——————————————————————————————
   LOAD RECORDS
   —————————————————————————————— */
async function loadRecords() {
  const tbody = $('records-tbody');
  tbody.innerHTML = '<tr class="loading-row"><td colspan="8"><div class="spinner-wrap"><div class="spinner"></div><span>Cargando registros…</span></div></td></tr>';

  const { ok, data } = await apiFetch('/api/admin/records');
  if (!ok) {
    if (data.message?.includes('Sesión')) {
      toast('Sesión expirada, vuelve a ingresar.', 'error');
      dashboard.hidden = true;
      loginScreen.hidden = false;
    } else {
      toast('Error cargando registros', 'error');
    }
    return;
  }
  allRecords = data.records || [];
  renderTable();
  renderExamConocimiento();
  renderExamConduccion();
}

/* ——————————————————————————————
   RENDER TABLE
   —————————————————————————————— */
function renderTable() {
  const tbody = $('records-tbody');
  let filtered = allRecords;

  // Filter by status
  if (activeFilter !== 'all') {
    filtered = filtered.filter(r => r.status === activeFilter);
  }

  // Filter by search term
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    filtered = filtered.filter(r =>
      (r.documentNumber || '').toLowerCase().includes(q) ||
      (r.lastNames || '').toLowerCase().includes(q) ||
      (r.firstNames || '').toLowerCase().includes(q) ||
      (r.licenseNumber || '').toLowerCase().includes(q) ||
      (r.licenseClass || '').toLowerCase().includes(q)
    );
  }

  // Update badge
  $('record-count-badge').textContent = `${allRecords.length} registro${allRecords.length !== 1 ? 's' : ''}`;
  $('table-info').textContent = `Mostrando ${filtered.length} de ${allRecords.length} registros`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="material-icons">search_off</span><p>${searchTerm || activeFilter !== 'all' ? 'No hay registros con ese filtro.' : 'No hay registros aún. Añade el primero.'}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td class="doc-chip">${r.documentType || 'DNI'} · ${r.documentNumber || ''}</td>
      <td>
        <strong>${r.lastNames || ''}</strong><br>
        <span style="font-size:.83rem;color:var(--text-muted)">${r.firstNames || ''}</span>
      </td>
      <td><strong>${r.licenseClass || ''}</strong></td>
      <td class="doc-chip">${r.licenseNumber || ''}</td>
      <td>${statusBadge(r.status)}</td>
      <td style="font-size:.83rem">${r.expiresAt || '—'}</td>
      <td style="text-align:center">${r.points ?? 0}</td>
      <td style="text-align:center;white-space:nowrap">
        <button class="action-btn edit" title="Editar" data-doc="${r.documentNumber}">
          <span class="material-icons">edit</span>
        </button>
        <button class="action-btn delete" title="Eliminar" data-doc="${r.documentNumber}" data-name="${r.lastNames} ${r.firstNames}">
          <span class="material-icons">delete</span>
        </button>
      </td>
    </tr>
  `).join('');

  // Edit buttons
  tbody.querySelectorAll('.action-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.doc));
  });
  // Delete buttons
  tbody.querySelectorAll('.action-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.doc, btn.dataset.name));
  });
}

/* ——————————————————————————————
   SEARCH + FILTER
   —————————————————————————————— */
$('search-input').addEventListener('input', e => {
  searchTerm = e.target.value.trim();
  $('clear-search').hidden = !searchTerm;
  renderTable();
});
$('clear-search').addEventListener('click', () => {
  $('search-input').value = '';
  searchTerm = '';
  $('clear-search').hidden = true;
  renderTable();
});
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    renderTable();
  });
});

/* ——————————————————————————————
   MODAL: ADD / EDIT
   —————————————————————————————— */
const recordModal = $('record-modal');
const recordForm  = $('record-form');
const formError   = $('form-error');

function openAddModal() {
  editingDoc = null;
  $('modal-title').textContent = 'Nuevo Registro de Licencia y Evaluaciones';
  recordForm.reset();
  $('f-restrictions').value = 'SIN RESTRICCIONES';
  $('f-points').value = '0';
  $('f-tramite').value = 'REVALIDACIÓN';
  $('f-evalCat').value = 'A I';
  $('f-medCentro').value = 'SERVICIOS MEDICOS VIRGEN DE LA PUERTA E.I.R.L.';
  $('f-medFecha').value = '16/10/2026';
  $('f-medVence').value = '16/04/2027';
  $('f-conCentro').value = 'TOURING Y AUTOMOVIL CLUB DEL PERU';
  $('f-conFecha').value = '16/10/2026';
  $('f-conVence').value = '16/04/2027';
  $('f-habCentro').value = 'CIRCUITO OFICIAL DE EVALUACIÓN DE MANEJO';
  $('f-habFecha').value = '16/10/2026';
  $('f-habVence').value = '16/04/2027';
  formError.hidden = true;
  resetModalPosition(recordModal);
  recordModal.hidden = false;
  $('f-docNum').focus();
}

function openEditModal(docNumber) {
  const rec = allRecords.find(r => r.documentNumber === docNumber);
  if (!rec) return;
  editingDoc = docNumber;
  $('modal-title').textContent = 'Editar Registro de Licencia y Evaluaciones';
  formError.hidden = true;

  // Populate base
  $('f-docType').value      = rec.documentType  || 'DNI';
  $('f-docNum').value       = rec.documentNumber || '';
  $('f-lastNames').value    = rec.lastNames      || '';
  $('f-firstNames').value   = rec.firstNames     || '';
  $('f-licenseClass').value = rec.licenseClass   || 'A-I';
  $('f-licenseNum').value   = rec.licenseNumber  || '';
  $('f-licenseType').value  = rec.licenseType    || 'FISICA';
  $('f-status').value       = rec.status         || 'Vigente';
  $('f-issuedAt').value     = rec.issuedAt       || '';
  $('f-expiresAt').value    = rec.expiresAt      || '';
  $('f-issuer').value       = rec.issuer         || '';
  $('f-points').value       = rec.points ?? 0;
  $('f-restrictions').value = rec.restrictions   || 'SIN RESTRICCIONES';

  // Populate evaluaciones
  const ev = rec.evaluations || {};
  $('f-tramite').value    = ev.tramite || 'REVALIDACIÓN';
  $('f-evalCat').value    = ev.evalCategoria || rec.licenseClass || 'A I';
  $('f-medCentro').value  = ev.medCentro || rec.issuer || 'SERVICIOS MEDICOS VIRGEN DE LA PUERTA E.I.R.L.';
  $('f-medFecha').value   = ev.medFecha || rec.issuedAt || '16/10/2026';
  $('f-medVence').value   = ev.medVence || rec.expiresAt || '16/04/2027';
  $('f-conCentro').value  = ev.conCentro || rec.issuer || 'TOURING Y AUTOMOVIL CLUB DEL PERU';
  $('f-conFecha').value   = ev.conFecha || rec.issuedAt || '16/10/2026';
  $('f-conVence').value   = ev.conVence || rec.expiresAt || '16/04/2027';
  $('f-habCentro').value  = ev.habCentro || rec.issuer || 'CIRCUITO OFICIAL DE EVALUACIÓN DE MANEJO';
  $('f-habFecha').value   = ev.habFecha || rec.issuedAt || '16/10/2026';
  $('f-habVence').value   = ev.habVence || rec.expiresAt || '16/04/2027';

  resetModalPosition(recordModal);
  recordModal.hidden = false;
  $('f-firstNames').focus();
}

function closeRecordModal() { 
  recordModal.hidden = true; 
  resetModalPosition(recordModal);
}

$('add-record-btn').addEventListener('click', openAddModal);
$('modal-close').addEventListener('click', closeRecordModal);
$('cancel-btn').addEventListener('click', closeRecordModal);
$('modal-backdrop').addEventListener('click', closeRecordModal);

recordForm.addEventListener('submit', async e => {
  e.preventDefault();
  formError.hidden = true;
  const btn = $('save-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="border-top-color:#fff;width:14px;height:14px;border-width:2px"></span> Guardando…';

  const body = {
    documentType:   $('f-docType').value,
    documentNumber: $('f-docNum').value.trim().toUpperCase(),
    lastNames:      $('f-lastNames').value.trim().toUpperCase(),
    firstNames:     $('f-firstNames').value.trim().toUpperCase(),
    licenseClass:   $('f-licenseClass').value,
    licenseNumber:  $('f-licenseNum').value.trim().toUpperCase(),
    licenseType:    $('f-licenseType').value,
    status:         $('f-status').value,
    issuedAt:       $('f-issuedAt').value.trim(),
    expiresAt:      $('f-expiresAt').value.trim(),
    issuer:         $('f-issuer').value.trim().toUpperCase(),
    points:         Number($('f-points').value) || 0,
    restrictions:   $('f-restrictions').value.trim().toUpperCase() || 'SIN RESTRICCIONES',
    // Evaluaciones
    tramite:        $('f-tramite').value.trim().toUpperCase(),
    evalCategoria:  $('f-evalCat').value.trim().toUpperCase() || $('f-licenseClass').value,
    medCentro:      $('f-medCentro').value.trim().toUpperCase(),
    medFecha:       $('f-medFecha').value.trim(),
    medVence:       $('f-medVence').value.trim(),
    conCentro:      $('f-conCentro').value.trim().toUpperCase(),
    conFecha:       $('f-conFecha').value.trim(),
    conVence:       $('f-conVence').value.trim(),
    habCentro:      $('f-habCentro').value.trim().toUpperCase(),
    habFecha:       $('f-habFecha').value.trim(),
    habVence:       $('f-habVence').value.trim()
  };

  let result;
  if (editingDoc) {
    result = await apiFetch(`/api/admin/records/${encodeURIComponent(editingDoc)}`, { method: 'PUT', body });
  } else {
    result = await apiFetch('/api/admin/records', { method: 'POST', body });
  }

  btn.disabled = false;
  btn.innerHTML = '<span class="material-icons">save</span> Guardar registro y evaluaciones';

  if (result.ok) {
    closeRecordModal();
    await loadRecords();
    toast(editingDoc ? 'Registro y evaluaciones actualizados correctamente' : 'Registro y evaluaciones creados correctamente', 'success');
    if ($('section-stats').classList.contains('active')) renderStats();
  } else {
    formError.textContent = result.data.message || 'Error al guardar.';
    formError.hidden = false;
  }
});

/* ——————————————————————————————
   MODAL: DELETE
   —————————————————————————————— */
const deleteModal = $('delete-modal');

function openDeleteModal(docNumber, name) {
  deleteTarget = docNumber;
  $('delete-name').textContent = name || docNumber;
  resetModalPosition(deleteModal);
  deleteModal.hidden = false;
}
function closeDeleteModal() { 
  deleteModal.hidden = true; 
  deleteTarget = null; 
  resetModalPosition(deleteModal);
}

$('delete-cancel').addEventListener('click', closeDeleteModal);
$('delete-backdrop').addEventListener('click', closeDeleteModal);

$('delete-confirm').addEventListener('click', async () => {
  if (!deleteTarget) return;
  const btn = $('delete-confirm');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="border-top-color:currentColor;width:14px;height:14px;border-width:2px"></span> Eliminando…';

  const { ok, data } = await apiFetch(`/api/admin/records/${encodeURIComponent(deleteTarget)}`, { method: 'DELETE' });
  btn.disabled = false;
  btn.innerHTML = '<span class="material-icons">delete</span> Eliminar';

  if (ok) {
    closeDeleteModal();
    await loadRecords();
    toast('Registro eliminado correctamente', 'success');
    if ($('section-stats').classList.contains('active')) renderStats();
  } else {
    closeDeleteModal();
    toast(data.message || 'Error al eliminar.', 'error');
  }
});

/* ——————————————————————————————
   STATS
   —————————————————————————————— */
function renderStats() {
  const total      = allRecords.length;
  const vigente    = allRecords.filter(r => r.status === 'Vigente').length;
  const suspendida = allRecords.filter(r => r.status === 'Suspendida').length;
  const revocada   = allRecords.filter(r => r.status === 'Revocada').length;

  $('stat-total').textContent     = total;
  $('stat-vigente').textContent   = vigente;
  $('stat-suspendida').textContent= suspendida;
  $('stat-revocada').textContent  = revocada;

  // Bar chart by licenseClass
  const classes = {};
  allRecords.forEach(r => { classes[r.licenseClass || 'N/A'] = (classes[r.licenseClass || 'N/A'] || 0) + 1; });
  const maxVal = Math.max(1, ...Object.values(classes));
  const chart  = $('bar-chart');
  chart.innerHTML = Object.entries(classes).map(([cls, count]) => `
    <div class="bar-item">
      <div class="bar" style="height:${Math.round((count / maxVal) * 100)}px" title="${count}"></div>
      <span class="bar-label">${cls}<br><strong>${count}</strong></span>
    </div>
  `).join('') || '<p style="color:var(--text-muted);font-size:.85rem">Sin datos aún</p>';
}

/* ——————————————————————————————
   EXAMEN DE CONOCIMIENTO
   —————————————————————————————— */
let ecSearchTerm = '';

function resultBadge(status) {
  // Vigente / Aprobado → verde, Suspendida → naranja, Revocada/Vencida → rojo
  const map = {
    'Vigente':    { cls: 'vigente',    label: 'APROBADO' },
    'Suspendida': { cls: 'suspendida', label: 'SUSPENDIDO' },
    'Revocada':   { cls: 'revocada',   label: 'REVOCADO' },
    'Vencida':    { cls: 'revocada',   label: 'VENCIDO' }
  };
  const item = map[status] || { cls: 'suspendida', label: status || 'PENDIENTE' };
  return `<span class="status-badge ${item.cls}"><span class="status-dot"></span>${item.label}</span>`;
}

function renderExamConocimiento() {
  const tbody = $('ec-tbody');
  const q = ecSearchTerm.toLowerCase();
  const filtered = q
    ? allRecords.filter(r =>
        (r.documentNumber || '').toLowerCase().includes(q) ||
        (r.lastNames || '').toLowerCase().includes(q) ||
        (r.firstNames || '').toLowerCase().includes(q) ||
        (r.evaluations?.conCentro || '').toLowerCase().includes(q)
      )
    : allRecords;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="material-icons">menu_book</span><p>${q ? 'No hay coincidencias.' : 'No hay registros de exámenes de conocimiento aún.'}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const ev = r.evaluations || {};
    const centro = ev.conCentro || r.issuer || 'TOURING Y AUTOMOVIL CLUB DEL PERU';
    const fecha = ev.conFecha || r.issuedAt || '16/10/2026';
    const vence = ev.conVence || r.expiresAt || '16/04/2027';
    const tramite = ev.tramite || 'REVALIDACIÓN';
    const cat = ev.evalCategoria || r.licenseClass || 'A I';

    return `
      <tr>
        <td class="doc-chip">${r.documentType || 'DNI'} · ${r.documentNumber || ''}</td>
        <td>
          <strong>${r.lastNames || ''}</strong><br>
          <span style="font-size:.83rem;color:var(--text-muted)">${r.firstNames || ''}</span>
        </td>
        <td style="font-size:.85rem">${centro}</td>
        <td style="font-size:.83rem;text-align:center">${fecha}</td>
        <td style="font-size:.83rem;text-align:center">${vence}</td>
        <td style="text-align:center"><span class="doc-chip">${tramite}</span></td>
        <td style="text-align:center"><strong>${cat}</strong></td>
        <td style="text-align:center;white-space:nowrap">
          <button class="action-btn edit" title="Editar evaluación" data-doc="${r.documentNumber}">
            <span class="material-icons">edit</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.action-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => {
      openEditModal(btn.dataset.doc);
    });
  });
}

$('ec-search').addEventListener('input', e => {
  ecSearchTerm = e.target.value.trim();
  renderExamConocimiento();
});

$('ec-add-btn').addEventListener('click', () => {
  openAddModal();
});

/* ——————————————————————————————
   EXAMEN DE CONDUCCIÓN
   —————————————————————————————— */
let ecdSearchTerm = '';

function renderExamConduccion() {
  const tbody = $('ecd-tbody');
  const q = ecdSearchTerm.toLowerCase();
  const filtered = q
    ? allRecords.filter(r =>
        (r.documentNumber || '').toLowerCase().includes(q) ||
        (r.lastNames || '').toLowerCase().includes(q) ||
        (r.firstNames || '').toLowerCase().includes(q) ||
        (r.evaluations?.habCentro || '').toLowerCase().includes(q)
      )
    : allRecords;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="material-icons">drive_eta</span><p>${q ? 'No hay coincidencias.' : 'No hay registros de exámenes de conducción aún.'}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const ev = r.evaluations || {};
    const centro = ev.habCentro || r.issuer || 'CIRCUITO OFICIAL DE EVALUACIÓN DE MANEJO';
    const fecha = ev.habFecha || r.issuedAt || '16/10/2026';
    const vence = ev.habVence || r.expiresAt || '16/04/2027';
    const tramite = ev.tramite || 'REVALIDACIÓN';
    const cat = ev.evalCategoria || r.licenseClass || 'A I';

    return `
      <tr>
        <td class="doc-chip">${r.documentType || 'DNI'} · ${r.documentNumber || ''}</td>
        <td>
          <strong>${r.lastNames || ''}</strong><br>
          <span style="font-size:.83rem;color:var(--text-muted)">${r.firstNames || ''}</span>
        </td>
        <td style="font-size:.85rem">${centro}</td>
        <td style="font-size:.83rem;text-align:center">${fecha}</td>
        <td style="font-size:.83rem;text-align:center">${vence}</td>
        <td style="text-align:center"><span class="doc-chip">${tramite}</span></td>
        <td style="text-align:center"><strong>${cat}</strong></td>
        <td style="text-align:center;white-space:nowrap">
          <button class="action-btn edit" title="Editar evaluación" data-doc="${r.documentNumber}">
            <span class="material-icons">edit</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.action-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => {
      openEditModal(btn.dataset.doc);
    });
  });
}

$('ecd-search').addEventListener('input', e => {
  ecdSearchTerm = e.target.value.trim();
  renderExamConduccion();
});

$('ecd-add-btn').addEventListener('click', () => {
  openAddModal();
});

/* ——————————————————————————————
   KEYBOARD SHORTCUTS
   —————————————————————————————— */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!recordModal.hidden) closeRecordModal();
    if (!deleteModal.hidden) closeDeleteModal();
  }
  // Ctrl+N = new record (when dashboard is visible)
  if (e.ctrlKey && e.key === 'n' && !dashboard.hidden) {
    e.preventDefault();
    openAddModal();
  }
});

/* ——————————————————————————————
   MODAL DRAGGABLE / MOVER MODALES
   —————————————————————————————— */
function resetModalPosition(modalOverlay) {
  if (!modalOverlay) return;
  const card = modalOverlay.querySelector('.modal-card');
  if (!card) return;
  card.style.position = '';
  card.style.margin = '';
  card.style.left = '';
  card.style.top = '';
}

function makeModalDraggable(modalOverlay) {
  if (!modalOverlay) return;
  const card = modalOverlay.querySelector('.modal-card');
  const header = modalOverlay.querySelector('.modal-header');
  if (!card || !header) return;

  let isDragging = false;
  let startX = 0, startY = 0;
  let initLeft = 0, initTop = 0;

  header.addEventListener('mousedown', e => {
    if (e.target.closest('.modal-close') || e.target.closest('button')) return;

    isDragging = true;
    card.classList.add('is-dragging');

    const rect = card.getBoundingClientRect();
    card.style.position = 'fixed';
    card.style.margin = '0';
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;

    startX = e.clientX;
    startY = e.clientY;
    initLeft = rect.left;
    initTop = rect.top;

    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const maxLeft = Math.max(10, window.innerWidth - card.offsetWidth - 10);
    const maxTop = Math.max(10, window.innerHeight - card.offsetHeight - 10);

    const newLeft = Math.min(Math.max(10, initLeft + deltaX), maxLeft);
    const newTop = Math.min(Math.max(10, initTop + deltaY), maxTop);

    card.style.left = `${newLeft}px`;
    card.style.top = `${newTop}px`;
  });

  const stopDrag = () => {
    if (isDragging) {
      isDragging = false;
      card.classList.remove('is-dragging');
    }
  };

  document.addEventListener('mouseup', stopDrag);
}

// Inicializar modales arrastrables
makeModalDraggable(recordModal);
makeModalDraggable(deleteModal);
