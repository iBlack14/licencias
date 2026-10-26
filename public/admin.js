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
  'cofipro-a': 'Registrar curso RECATEGORIZACIÓN COFIPRO A',
  'cofipro-b': 'Registrar curso REVALIDACIÓN COFIPRO B',
  'cofipro-b-ii': 'Registrar curso COFIPRO para B II',
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
    if (section === 'cofipro-a') renderCofipro('a');
    if (section === 'cofipro-b') renderCofipro('b');
    if (section === 'cofipro-b-ii') renderCofipro('b-ii');
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
  renderCofipro('a');
  renderCofipro('b');
  renderCofipro('b-ii');
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
  $('modal-title').textContent = 'Nueva Licencia';
  recordForm.reset();
  $('f-restrictions').value = 'SIN RESTRICCIONES';
  $('f-points').value = '0';
  formError.hidden = true;
  resetModalPosition(recordModal);
  recordModal.hidden = false;
  $('f-docNum').focus();
}

function openEditModal(docNumber) {
  const rec = allRecords.find(r => r.documentNumber === docNumber);
  if (!rec) return;
  editingDoc = docNumber;
  $('modal-title').textContent = 'Editar Licencia';
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
    ...(editingDoc ? (allRecords.find(r => r.documentNumber === editingDoc)?.evaluations || {}) : {})
  };

  let result;
  if (editingDoc) {
    result = await apiFetch(`/api/admin/records/${encodeURIComponent(editingDoc)}`, { method: 'PUT', body });
  } else {
    result = await apiFetch('/api/admin/records', { method: 'POST', body });
  }

  btn.disabled = false;
  btn.innerHTML = '<span class="material-icons">save</span> Guardar licencia';

  if (result.ok) {
    closeRecordModal();
    await loadRecords();
    toast(editingDoc ? 'Licencia actualizada correctamente' : 'Licencia creada correctamente', 'success');
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
let knowledgeEditingDoc = null;
let knowledgeMode = 'conocimiento';
const cofiproSearchTerms = { a: '', b: '', 'b-ii': '' };
const cofiproConfigs = {
  a: { prefix: 'cofiproA', label: 'Registrar curso RECATEGORIZACIÓN COFIPRO A', empty: 'RECATEGORIZACIÓN COFIPRO A', tramite: 'RECATEGORIZACIÓN' },
  b: { prefix: 'cofiproB', label: 'Registrar curso REVALIDACIÓN COFIPRO B', empty: 'REVALIDACIÓN COFIPRO B', tramite: 'REVALIDACIÓN' },
  'b-ii': { prefix: 'cofiproBII', label: 'Registrar curso COFIPRO para B II', empty: 'COFIPRO para B II', tramite: 'REVALIDACIÓN' }
};

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
      openKnowledgeModal(btn.dataset.doc);
    });
  });
}

$('ec-search').addEventListener('input', e => {
  ecSearchTerm = e.target.value.trim();
  renderExamConocimiento();
});

$('ec-add-btn').addEventListener('click', () => {
  openKnowledgeModal(null, 'conocimiento');
});

function renderCofipro(type) {
  const tbody = $(`cofipro-${type}-tbody`);
  const q = cofiproSearchTerms[type].toLowerCase();
  const config = cofiproConfigs[type];
  const prefix = config.prefix;
  const filtered = q ? allRecords.filter(r =>
    (r.documentNumber || '').toLowerCase().includes(q) ||
    (r.lastNames || '').toLowerCase().includes(q) ||
    (r.firstNames || '').toLowerCase().includes(q) ||
    (r.evaluations?.[`${prefix}Centro`] || '').toLowerCase().includes(q)
  ) : allRecords;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><span class="material-icons">menu_book</span><p>${q ? 'No hay coincidencias.' : `No hay registros de ${config.empty} aún.`}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(r => {
    const ev = r.evaluations || {};
    return `<tr>
      <td class="doc-chip">${r.documentType || 'DNI'} · ${r.documentNumber || ''}</td>
      <td><strong>${r.lastNames || ''}</strong><br><span style="font-size:.83rem;color:var(--text-muted)">${r.firstNames || ''}</span></td>
      <td style="font-size:.85rem">${ev[`${prefix}Centro`] || r.issuer || 'TOURING Y AUTOMOVIL CLUB DEL PERU'}</td>
      <td style="font-size:.83rem;text-align:center">${ev[`${prefix}Fecha`] || r.issuedAt || '—'}</td>
      <td style="font-size:.83rem;text-align:center">${ev[`${prefix}Vence`] || r.expiresAt || '—'}</td>
      <td style="text-align:center"><span class="doc-chip">${ev[`${prefix}Tramite`] || config.tramite}</span></td>
      <td style="text-align:center"><strong>${ev[`${prefix}Categoria`] || r.licenseClass || 'A I'}</strong></td>
      <td style="text-align:center"><button class="action-btn edit" title="Editar revalidación" data-doc="${r.documentNumber}"><span class="material-icons">edit</span></button></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.action-btn.edit').forEach(btn => btn.addEventListener('click', () => openKnowledgeModal(btn.dataset.doc, `cofipro-${type}`)));
}

['a', 'b', 'b-ii'].forEach(type => {
  $(`cofipro-${type}-search`).addEventListener('input', e => {
    cofiproSearchTerms[type] = e.target.value.trim();
    renderCofipro(type);
  });
  $(`cofipro-${type}-add-btn`).addEventListener('click', () => openKnowledgeModal(null, `cofipro-${type}`));
});

const knowledgeModal = $('knowledge-modal');
const knowledgeForm = $('knowledge-form');
const knowledgeError = $('knowledge-error');

function openKnowledgeModal(docNumber = null, mode = 'conocimiento') {
  const rec = docNumber ? allRecords.find(r => r.documentNumber === docNumber) : null;
  const ev = rec?.evaluations || {};
  knowledgeMode = mode;
  const cofiproKey = mode.startsWith('cofipro-') ? mode.slice(8) : '';
  const config = cofiproConfigs[cofiproKey];
  const prefix = config?.prefix || 'con';
  const label = config?.label || 'Examen de Conocimiento';
  knowledgeEditingDoc = rec?.documentNumber || null;
  knowledgeForm.reset();
  knowledgeError.hidden = true;
  $('knowledge-title').textContent = `${rec ? 'Editar' : 'Nuevo'} ${label}`;
  $('knowledge-section-label').textContent = label;
  $('k-docType').value = rec?.documentType || 'DNI';
  $('k-docNum').value = rec?.documentNumber || '';
  $('k-firstNames').value = rec?.firstNames || '';
  $('k-lastNames').value = rec?.lastNames || '';
  $('k-tramite').value = ev[config ? `${prefix}Tramite` : 'tramite'] || config?.tramite || 'REVALIDACIÓN';
  $('k-category').value = ev[config ? `${prefix}Categoria` : 'evalCategoria'] || rec?.licenseClass || (cofiproKey === 'b-ii' ? 'B II' : 'A I');
  $('k-center').value = ev[`${prefix}Centro`] || 'TOURING Y AUTOMOVIL CLUB DEL PERU';
  $('k-date').value = ev[`${prefix}Fecha`] || '';
  $('k-expiry').value = ev[`${prefix}Vence`] || '';
  resetModalPosition(knowledgeModal);
  knowledgeModal.hidden = false;
  $('k-docNum').focus();
}

function closeKnowledgeModal() {
  knowledgeModal.hidden = true;
  knowledgeEditingDoc = null;
  resetModalPosition(knowledgeModal);
}

$('knowledge-close').addEventListener('click', closeKnowledgeModal);
$('knowledge-cancel').addEventListener('click', closeKnowledgeModal);
$('knowledge-backdrop').addEventListener('click', closeKnowledgeModal);

knowledgeForm.addEventListener('submit', async e => {
  e.preventDefault();
  knowledgeError.hidden = true;
  if (!knowledgeForm.checkValidity()) {
    knowledgeForm.reportValidity();
    return;
  }
  const existing = knowledgeEditingDoc
    ? allRecords.find(r => r.documentNumber === knowledgeEditingDoc)
    : null;
  const ev = existing?.evaluations || {};
  const documentNumber = $('k-docNum').value.trim().toUpperCase();
  const category = $('k-category').value.trim().toUpperCase();
  const cofiproKey = knowledgeMode.startsWith('cofipro-') ? knowledgeMode.slice(8) : '';
  const config = cofiproConfigs[cofiproKey];
  const prefix = config?.prefix || 'con';
  const evaluationFields = config ? {
    [`${prefix}Tramite`]: $('k-tramite').value,
    [`${prefix}Categoria`]: category,
    [`${prefix}Centro`]: $('k-center').value.trim().toUpperCase(),
    [`${prefix}Fecha`]: $('k-date').value.trim(),
    [`${prefix}Vence`]: $('k-expiry').value.trim()
  } : {
    tramite: $('k-tramite').value,
    evalCategoria: category,
    conCentro: $('k-center').value.trim().toUpperCase(),
    conFecha: $('k-date').value.trim(),
    conVence: $('k-expiry').value.trim()
  };
  const body = {
    ...(existing || {}),
    ...ev,
    documentType: $('k-docType').value,
    documentNumber,
    firstNames: $('k-firstNames').value.trim().toUpperCase(),
    lastNames: $('k-lastNames').value.trim().toUpperCase(),
    licenseClass: existing?.licenseClass || category,
    licenseNumber: existing?.licenseNumber || `PENDIENTE-${documentNumber}`,
    ...evaluationFields
  };

  const btn = $('knowledge-save');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="border-top-color:#fff;width:14px;height:14px;border-width:2px"></span> Guardando…';
  const result = knowledgeEditingDoc
    ? await apiFetch(`/api/admin/records/${encodeURIComponent(knowledgeEditingDoc)}`, { method: 'PUT', body })
    : await apiFetch('/api/admin/records', { method: 'POST', body });
  btn.disabled = false;
  btn.innerHTML = '<span class="material-icons">save</span> Guardar examen';

  if (!result.ok) {
    knowledgeError.textContent = result.data.message || 'No se pudo guardar el examen.';
    knowledgeError.hidden = false;
    return;
  }
  const wasEditing = Boolean(knowledgeEditingDoc);
  closeKnowledgeModal();
  await loadRecords();
  const savedLabel = config?.label || 'Examen de conocimiento';
  toast(`${savedLabel} ${wasEditing ? 'actualizado' : 'registrado'}`, 'success');
});

/* ——————————————————————————————
   EXAMEN DE CONDUCCIÓN
   —————————————————————————————— */
let ecdSearchTerm = '';
let drivingEditingDoc = null;

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
      openDrivingModal(btn.dataset.doc);
    });
  });
}

$('ecd-search').addEventListener('input', e => {
  ecdSearchTerm = e.target.value.trim();
  renderExamConduccion();
});

$('ecd-add-btn').addEventListener('click', () => {
  openDrivingModal();
});

const drivingModal = $('driving-modal');
const drivingForm = $('driving-form');
const drivingError = $('driving-error');

function openDrivingModal(docNumber = null) {
  const rec = docNumber ? allRecords.find(r => r.documentNumber === docNumber) : null;
  const ev = rec?.evaluations || {};
  drivingEditingDoc = rec?.documentNumber || null;
  drivingForm.reset();
  drivingError.hidden = true;
  $('driving-title').textContent = rec ? 'Editar Examen de Conducción' : 'Nuevo Examen de Conducción';
  $('d-docType').value = rec?.documentType || 'DNI';
  $('d-docNum').value = rec?.documentNumber || '';
  $('d-firstNames').value = rec?.firstNames || '';
  $('d-lastNames').value = rec?.lastNames || '';
  $('d-tramite').value = ev.tramite || 'REVALIDACIÓN';
  $('d-category').value = ev.evalCategoria || rec?.licenseClass || 'A I';
  $('d-center').value = ev.habCentro || 'CIRCUITO OFICIAL DE EVALUACIÓN DE MANEJO';
  $('d-date').value = ev.habFecha || '';
  $('d-expiry').value = ev.habVence || '';
  resetModalPosition(drivingModal);
  drivingModal.hidden = false;
  $('d-docNum').focus();
}

function closeDrivingModal() {
  drivingModal.hidden = true;
  drivingEditingDoc = null;
  resetModalPosition(drivingModal);
}

$('driving-close').addEventListener('click', closeDrivingModal);
$('driving-cancel').addEventListener('click', closeDrivingModal);
$('driving-backdrop').addEventListener('click', closeDrivingModal);

drivingForm.addEventListener('submit', async e => {
  e.preventDefault();
  drivingError.hidden = true;
  if (!drivingForm.checkValidity()) {
    drivingForm.reportValidity();
    return;
  }
  const existing = drivingEditingDoc
    ? allRecords.find(r => r.documentNumber === drivingEditingDoc)
    : null;
  const ev = existing?.evaluations || {};
  const documentNumber = $('d-docNum').value.trim().toUpperCase();
  const category = $('d-category').value.trim().toUpperCase();
  const body = {
    ...(existing || {}),
    ...ev,
    documentType: $('d-docType').value,
    documentNumber,
    firstNames: $('d-firstNames').value.trim().toUpperCase(),
    lastNames: $('d-lastNames').value.trim().toUpperCase(),
    licenseClass: existing?.licenseClass || category,
    licenseNumber: existing?.licenseNumber || `PENDIENTE-${documentNumber}`,
    tramite: $('d-tramite').value,
    evalCategoria: category,
    habCentro: $('d-center').value.trim().toUpperCase(),
    habFecha: $('d-date').value.trim(),
    habVence: $('d-expiry').value.trim()
  };
  const btn = $('driving-save');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="border-top-color:#fff;width:14px;height:14px;border-width:2px"></span> Guardando…';
  const result = drivingEditingDoc
    ? await apiFetch(`/api/admin/records/${encodeURIComponent(drivingEditingDoc)}`, { method: 'PUT', body })
    : await apiFetch('/api/admin/records', { method: 'POST', body });
  btn.disabled = false;
  btn.innerHTML = '<span class="material-icons">save</span> Guardar examen';
  if (!result.ok) {
    drivingError.textContent = result.data.message || 'No se pudo guardar el examen.';
    drivingError.hidden = false;
    return;
  }
  const wasEditing = Boolean(drivingEditingDoc);
  closeDrivingModal();
  await loadRecords();
  toast(wasEditing ? 'Examen de conducción actualizado' : 'Examen de conducción registrado', 'success');
});

/* ——————————————————————————————
   KEYBOARD SHORTCUTS
   —————————————————————————————— */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!recordModal.hidden) closeRecordModal();
    if (!knowledgeModal.hidden) closeKnowledgeModal();
    if (!drivingModal.hidden) closeDrivingModal();
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
makeModalDraggable(knowledgeModal);
makeModalDraggable(drivingModal);
makeModalDraggable(deleteModal);
