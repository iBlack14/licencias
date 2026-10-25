const form = document.querySelector('#consultation-form');
const typeSelect = document.querySelector('#document-type');
const documentInput = document.querySelector('#document-number');
const captchaInput = document.querySelector('#captcha-answer');
const captchaImage = document.querySelector('#captcha-image');
const refreshButton = document.querySelector('#refresh-captcha');
const modal = document.querySelector('#modal');
const modalMessage = document.querySelector('#modal-message');
const submitButton = document.querySelector('.submit-button');
let captchaToken = '';
let lastFocused = null;

function showModal(message, success = false) {
  lastFocused = document.activeElement;
  modalMessage.textContent = message;
  modalMessage.classList.toggle('success', success);
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.querySelector('.accept-button').focus();
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
  lastFocused?.focus();
}

async function refreshCaptcha() {
  refreshButton.disabled = true;
  try {
    const response = await fetch('/api/captcha', { cache: 'no-store' });
    const data = await response.json();
    captchaToken = data.token;
    captchaImage.src = data.image;
    captchaInput.value = '';
  } catch {
    showModal('No se pudo generar el texto de verificación. Inténtelo nuevamente.');
  } finally {
    refreshButton.disabled = false;
  }
}

function updateInputMode() {
  const isDni = typeSelect.value === 'DNI';
  documentInput.inputMode = isDni ? 'numeric' : 'text';
  documentInput.maxLength = isDni ? 8 : 15;
  documentInput.value = '';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!documentInput.value.trim()) return showModal('Debe ingresar su número de Documento.');
  if (typeSelect.value === 'DNI' && !/^\d{8}$/.test(documentInput.value.trim())) return showModal('El DNI debe contener 8 dígitos.');
  if (!captchaInput.value.trim()) return showModal('Debe ingresar el texto de verificación.');
  submitButton.disabled = true;
  submitButton.textContent = 'CONSULTANDO...';
  try {
    const response = await fetch('/api/consulta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentType: typeSelect.value,
        documentNumber: documentInput.value,
        licenseClass: document.querySelector('#license-class').value,
        captchaAnswer: captchaInput.value,
        captchaToken
      })
    });
    const data = await response.json();
    if (response.ok && data.record) {
      renderEvaluationResults(data.record);
    } else {
      showModal(data.message || 'No se encontraron registros de evaluaciones.', false);
      await refreshCaptcha();
    }
  } catch {
    showModal('No se pudo completar la consulta local. Verifique que el servidor esté activo.');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'CONSULTAR';
  }
});

function renderEvaluationResults(record) {
  const consultationSection = document.querySelector('#consultation-section');
  const resultsContainer = document.querySelector('#eval-results-container');

  // Nombre en mayúsculas
  const fullName = `${record.firstNames || ''} ${record.lastNames || ''}`.trim() || 'TORIBIO BUSTAMANTE DIAZ';
  document.querySelector('#eval-applicant-name').textContent = fullName.toUpperCase();

  // Evaluaciones específicas o derivadas del registro
  const ev = record.evaluations || record;
  const tramite = ev.tramite || 'REVALIDACIÓN';
  const categoria = ev.evalCategoria || record.licenseClass || 'A I';

  // 1. Evaluación Médica
  document.querySelector('#eval-med-centro').textContent = ev.medCentro || record.issuer || 'SERVICIOS MEDICOS VIRGEN DE LA PUERTA E.I.R.L.';
  document.querySelector('#eval-med-fecha').textContent = ev.medFecha || record.issuedAt || '16/10/2026';
  document.querySelector('#eval-med-vence').textContent = ev.medVence || record.expiresAt || '16/04/2027';
  document.querySelector('#eval-med-tramite').textContent = ev.medTramite || tramite;
  document.querySelector('#eval-med-categoria').textContent = ev.medCategoria || categoria;

  // 2. Examen de Conocimiento
  document.querySelector('#eval-con-centro').textContent = ev.conCentro || record.issuer || 'TOURING Y AUTOMOVIL CLUB DEL PERU';
  document.querySelector('#eval-con-fecha').textContent = ev.conFecha || record.issuedAt || '16/10/2026';
  document.querySelector('#eval-con-vence').textContent = ev.conVence || record.expiresAt || '16/04/2027';
  document.querySelector('#eval-con-tramite').textContent = ev.conTramite || tramite;
  document.querySelector('#eval-con-categoria').textContent = ev.conCategoria || categoria;

  // 3. Examen de Conducción
  document.querySelector('#eval-hab-centro').textContent = ev.habCentro || record.issuer || 'CIRCUITO OFICIAL DE EVALUACIÓN DE MANEJO';
  document.querySelector('#eval-hab-fecha').textContent = ev.habFecha || record.issuedAt || '16/10/2026';
  document.querySelector('#eval-hab-vence').textContent = ev.habVence || record.expiresAt || '16/04/2027';
  document.querySelector('#eval-hab-tramite').textContent = ev.habTramite || tramite;
  document.querySelector('#eval-hab-categoria').textContent = ev.habCategoria || categoria;

  // Ocultar búsqueda y mostrar resultados
  consultationSection.hidden = true;
  resultsContainer.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Botón para volver a consultar
const backBtn = document.querySelector('#eval-back-btn');
if (backBtn) {
  backBtn.addEventListener('click', () => {
    document.querySelector('#eval-results-container').hidden = true;
    document.querySelector('#consultation-section').hidden = false;
    documentInput.value = '';
    captchaInput.value = '';
    refreshCaptcha();
    documentInput.focus();
  });
}

typeSelect.addEventListener('change', updateInputMode);
refreshButton.addEventListener('click', refreshCaptcha);
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });
refreshCaptcha();
