if (!globalThis.__mtcLicenciasContentLoaded) {
globalThis.__mtcLicenciasContentLoaded = true;

const capturedJson = [];
let refreshAssistantFromJson = null;

function isCaptureNoise(entry) {
  const data = entry?.data;
  if (!data || typeof data !== 'object') return true;
  if (data.encryptedKey || data.encryptedData) return true;
  if (data.token && data.version && data.spa) return true;
  if (data.Token && data.Data == null && !data.Message) return true;
  return false;
}

function formatCapturedJson() {
  return JSON.stringify(capturedJson, null, 2);
}

function updateCaptureCounter() {
  const button = document.querySelector('#mtc-json-captures');
  if (button) button.textContent = `Ver JSON capturados (${capturedJson.length})`;
}

if (location.hostname === 'licencias.mtc.gob.pe') {
  window.addEventListener('message', event => {
    const message = event.data;
    if (event.source !== window || message?.source !== 'mtc-json-monitor' || message?.type !== 'JSON_RESPONSE') return;
    if (isCaptureNoise(message.entry)) return;
    capturedJson.push(message.entry);
    if (capturedJson.length > 50) capturedJson.shift();
    chrome.storage.local.set({ mtcJsonCaptures: capturedJson }).catch(() => {});
    console.info('[MTC → Licencias] Respuesta JSON capturada:', message.entry);
    updateCaptureCounter();
    refreshAssistantFromJson?.();
  });
}

function valueFor(map, ...labels) {
  for (const label of labels) {
    if (map[label]) return map[label];
  }
  return '';
}

function cleanDate(value) {
  return String(value || '').split(' ')[0];
}

function extractRecordFromJson() {
  const payloads = capturedJson
    .filter(entry => entry.transport === 'json.parse' && entry.method === 'DECRYPTED')
    .map(entry => entry.data);
  const general = [...payloads].reverse().find(payload => payload?.IsSuccess && payload?.Data?.Administrados?.length);
  const score = [...payloads].reverse().find(payload => payload?.IsSuccess && payload?.Data?.Administrado?.var_numdocumento);
  if (!general) return null;

  const data = general.Data;
  const person = data.Administrados[0];
  const license = data.LicenciaA || data.LicenciaB || {};
  const scorePerson = score?.Data?.Administrado || {};
  const restrictions = [license.Restriccion1 || person.Restricciones1, license.Restriccion2 || person.Restricciones2]
    .filter(Boolean)
    .join(' - ');

  return {
    documentType: person.NomTipoDoc || scorePerson.var_tipodocumento || 'DNI',
    documentNumber: person.NumDocumento || scorePerson.var_numdocumento || '',
    lastNames: [person.ApellidoPaterno, person.ApellidoMaterno].filter(Boolean).join(' ').trim(),
    firstNames: String(person.Nombre || '').trim(),
    licenseClass: license.Categoria || person.Categoria || scorePerson.clase_categoria || '',
    licenseNumber: license.NroLicencia || person.NumLicencia || scorePerson.num_licencia || '',
    licenseType: Number(license.LicenciaElectronica) === 1 ? 'ELECTRONICA' : 'FISICA',
    status: license.Estado || person.EstadoLicencia || scorePerson.estado || 'Vigente',
    issuedAt: cleanDate(license.FechaExpedicion || person.FechaExpedicion || scorePerson.fechaexpedicion),
    expiresAt: cleanDate(license.FechaRevalidacion || person.FechaRevalidacion || scorePerson.fecharevalidacion),
    restrictions: restrictions || 'SIN RESTRICCIONES',
    issuer: license.CentroEmision || 'MTC',
    points: Number(scorePerson.PtsAcumulados || 0)
  };
}

function extractRecord() {
  const jsonRecord = extractRecordFromJson();
  if (jsonRecord) return { ok: true, record: jsonRecord, source: 'decrypted_json' };

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
  window.addEventListener('message', event => {
    const message = event.data;
    if (event.source !== window || message?.source !== 'mtc-portal' || message?.type !== 'OPEN_MTC_LOOKUP') return;
    chrome.runtime.sendMessage({ type: 'OPEN_MTC_LOOKUP', lookup: message.lookup }, response => {
      window.postMessage({ source: 'mtc-extension', type: 'OPEN_MTC_RESULT', requestId: message.requestId, ok: Boolean(response?.ok) }, location.origin);
    });
  });
  window.postMessage({ source: 'mtc-extension', type: 'READY' }, location.origin);
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
  if (location.hostname === 'licencias.mtc.gob.pe') {
    const jsonButton = document.createElement('button');
    jsonButton.id = 'mtc-json-captures';
    jsonButton.textContent = `Ver JSON capturados (${capturedJson.length})`;
    Object.assign(jsonButton.style, { width: '100%', marginTop: '8px', padding: '9px', border: '1px solid #455a73', borderRadius: '4px', background: '#fff', color: '#26384e', fontWeight: '700', cursor: 'pointer' });
    jsonButton.addEventListener('click', () => showJsonViewer());
    box.append(jsonButton);
  }
}

function showJsonViewer() {
  let viewer = document.querySelector('#mtc-json-viewer');
  if (!viewer) {
    viewer = document.createElement('section');
    viewer.id = 'mtc-json-viewer';
    Object.assign(viewer.style, { position: 'fixed', inset: '5%', zIndex: '2147483647', padding: '16px', borderRadius: '8px', background: '#fff', boxShadow: '0 8px 40px rgba(0,0,0,.5)', font: '13px Arial,sans-serif', display: 'flex', flexDirection: 'column' });
    document.body.append(viewer);
  }
  viewer.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = `Respuestas JSON detectadas: ${capturedJson.length}`;
  const pre = document.createElement('pre');
  pre.textContent = capturedJson.length ? formatCapturedJson() : 'Todavía no se detectaron respuestas JSON. Realiza una consulta en el MTC.';
  Object.assign(pre.style, { flex: '1', overflow: 'auto', whiteSpace: 'pre-wrap', background: '#f4f6f8', padding: '12px', border: '1px solid #ddd' });
  const controls = document.createElement('div');
  Object.assign(controls.style, { display: 'flex', gap: '8px' });
  const copy = document.createElement('button');
  copy.textContent = 'Copiar JSON';
  copy.onclick = async () => { await navigator.clipboard.writeText(formatCapturedJson()); copy.textContent = 'Copiado ✓'; };
  const clear = document.createElement('button');
  clear.textContent = 'Limpiar';
  clear.onclick = async () => { capturedJson.length = 0; await chrome.storage.local.remove('mtcJsonCaptures'); viewer.remove(); updateCaptureCounter(); };
  const close = document.createElement('button');
  close.textContent = 'Cerrar';
  close.onclick = () => viewer.remove();
  [copy, clear, close].forEach(button => Object.assign(button.style, { padding: '9px 14px', cursor: 'pointer' }));
  controls.append(copy, clear, close);
  viewer.append(title, pre, controls);
}

async function installMtcAssistant() {
  const saved = await chrome.storage.local.get('mtcJsonCaptures');
  if (Array.isArray(saved.mtcJsonCaptures)) {
    capturedJson.push(...saved.mtcJsonCaptures.filter(entry => !isCaptureNoise(entry)).slice(-50));
  }
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

  refreshAssistantFromJson = offerSave;

  if (!offerSave()) {
    showAssistant('DNI preparado. Completa el captcha, acepta los términos y pulsa Buscar. La extensión detectará el resultado.');
    const observer = new MutationObserver(() => { if (offerSave()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

if (location.hostname === 'soat-licencia.stkkft.easypanel.host') installPortalBridge();
if (location.hostname === 'licencias.mtc.gob.pe') installMtcAssistant();
}
