function valueFor(map, ...labels) {
  for (const label of labels) {
    if (map[label]) return map[label];
  }
  return '';
}

function extractRecord() {
  const map = {};
  document.querySelectorAll('mat-form-field').forEach(field => {
    const label = field.querySelector('mat-label')?.textContent?.trim();
    const input = field.querySelector('input');
    if (label && input?.value) map[label] = input.value.trim();
  });

  const record = {
    documentType: valueFor(map, 'Tipo de documento') || 'DNI',
    documentNumber: valueFor(map, 'Número de documento', 'Documento de identidad'),
    lastNames: valueFor(map, 'Apellidos'),
    firstNames: valueFor(map, 'Nombres'),
    licenseClass: valueFor(map, 'Clase y categoría', 'Clase y Categoria'),
    licenseNumber: valueFor(map, 'Número de licencia', 'N° de licencia'),
    licenseType: valueFor(map, 'Tipo de Licencia') || 'FISICA',
    status: valueFor(map, 'Estado') || 'Vigente',
    issuedAt: valueFor(map, 'Fecha de expedición', 'Fecha de Expedición'),
    expiresAt: valueFor(map, 'Vigente hasta', 'Fecha de vencimiento'),
    restrictions: valueFor(map, 'Restricciones') || 'SIN RESTRICCIONES',
    issuer: valueFor(map, 'Centro de emisión', 'Centro de Emisión') || 'MTC',
    points: 0
  };

  const required = ['documentNumber', 'lastNames', 'firstNames', 'licenseClass', 'licenseNumber'];
  const missing = required.filter(key => !record[key]);
  if (missing.length) {
    return { ok: false, message: 'No se encontró un resultado completo. Realiza primero la consulta manual en el MTC.', missing };
  }
  return { ok: true, record };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'EXTRACT_MTC_RECORD') sendResponse(extractRecord());
});

function installPortalBridge() {
  document.documentElement.dataset.mtcExtension = 'ready';
  document.addEventListener('mtc-extension-lookup', event => {
    const detail = event.detail || {};
    chrome.runtime.sendMessage({
      type: 'OPEN_MTC_LOOKUP',
      lookup: {
        documentType: detail.documentType || 'DNI',
        documentNumber: String(detail.documentNumber || '').trim(),
        createdAt: new Date().toISOString()
      }
    });
  });
}

function showAssistant(message, action) {
  let box = document.querySelector('#mtc-extension-assistant');
  if (!box) {
    box = document.createElement('section');
    box.id = 'mtc-extension-assistant';
    Object.assign(box.style, {
      position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483647', width: '330px',
      padding: '16px', borderRadius: '8px', color: '#222', background: '#fff',
      boxShadow: '0 6px 28px rgba(0,0,0,.35)', font: '14px/1.4 Arial,sans-serif'
    });
    document.body.append(box);
  }
  box.replaceChildren();
  const text = document.createElement('p');
  text.textContent = message;
  text.style.margin = '0 0 10px';
  box.append(text);
  if (action) {
    const button = document.createElement('button');
    button.textContent = action.label;
    Object.assign(button.style, { width: '100%', padding: '10px', border: '0', borderRadius: '4px', background: '#b71c1c', color: '#fff', fontWeight: '700', cursor: 'pointer' });
    button.addEventListener('click', action.run);
    box.append(button);
  }
}

async function installMtcAssistant() {
  const { pendingLookup } = await chrome.storage.local.get('pendingLookup');
  if (!pendingLookup?.documentNumber) return;

  showAssistant(`Consulta solicitada para ${pendingLookup.documentNumber}. Espera mientras se prepara el formulario.`);
  const deadline = Date.now() + 20000;
  let input;
  while (!input && Date.now() < deadline) {
    input = [...document.querySelectorAll('input')].find(element =>
      /documento/i.test(element.getAttribute('data-placeholder') || element.getAttribute('placeholder') || '')
    );
    if (!input) await new Promise(resolve => setTimeout(resolve, 400));
  }
  if (input) {
    input.focus();
    input.value = pendingLookup.documentNumber;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const offerSave = () => {
    const extracted = extractRecord();
    if (!extracted.ok) return false;
    showAssistant('Resultado detectado. Puedes guardarlo en tu sistema.', {
      label: 'Guardar y volver al portal',
      run: async () => {
        showAssistant('Guardando resultado…');
        const result = await chrome.runtime.sendMessage({ type: 'SAVE_MTC_RECORD', record: extracted.record });
        if (!result?.ok) return showAssistant(result?.message || 'No se pudo guardar el resultado.');
        showAssistant('Resultado guardado correctamente. Regresando al portal…');
        setTimeout(() => { location.href = `${result.endpoint.replace(/\/$/, '')}/?imported=${encodeURIComponent(result.record.documentNumber)}`; }, 900);
      }
    });
    return true;
  };

  if (!offerSave()) {
    showAssistant('DNI preparado. Completa el captcha, acepta los términos y pulsa Buscar. La extensión detectará el resultado.');
    const observer = new MutationObserver(() => { if (offerSave()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

if (location.hostname === 'soat-licencia.stkkft.easypanel.host') installPortalBridge();
if (location.hostname === 'licencias.mtc.gob.pe') installMtcAssistant();
