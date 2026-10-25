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
    showModal(data.message, response.ok);
    if (!response.ok) await refreshCaptcha();
  } catch {
    showModal('No se pudo completar la consulta local. Verifique que el servidor esté activo.');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'CONSULTAR';
  }
});

typeSelect.addEventListener('change', updateInputMode);
refreshButton.addEventListener('click', refreshCaptcha);
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });
refreshCaptcha();
