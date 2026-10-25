const endpointInput = document.querySelector('#endpoint');
const tokenInput = document.querySelector('#token');
const status = document.querySelector('#status');
const importButton = document.querySelector('#import-record');
const configState = document.querySelector('#config-state');
const saveButton = document.querySelector('#save-settings');

function renderSaved(endpoint, savedAt) {
  configState.textContent = `✓ Guardado: ${new URL(endpoint).host}${savedAt ? ` — ${new Date(savedAt).toLocaleString()}` : ''}`;
  configState.className = 'config-state saved';
  saveButton.textContent = 'Configuración guardada ✓';
}

function show(message, type = '') {
  status.textContent = message;
  status.className = type;
}

async function extractFromMtcTab(tab) {
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_MTC_RECORD' });
  } catch (error) {
    const receiverMissing = /Receiving end does not exist|Could not establish connection/i.test(error.message || '');
    if (!receiverMissing) throw error;
    show('Reconectando la extensión con la pestaña del MTC…');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_MTC_RECORD' });
  }
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(['endpoint', 'token', 'savedAt']);
  endpointInput.value = saved.endpoint || '';
  tokenInput.value = saved.token || '';
  if (saved.endpoint && saved.token) renderSaved(saved.endpoint, saved.savedAt);
}


async function ensureHostPermission(endpoint) {
  const origin = `${new URL(endpoint).origin}/*`;
  const existing = await chrome.permissions.contains({ origins: [origin] });
  if (existing) return;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error('La configuración sí quedó guardada, pero debes permitir el acceso al dominio para conectar.');
}

async function saveSettings() {
  const endpoint = endpointInput.value.trim().replace(/\/$/, '');
  const token = tokenInput.value.trim();
  if (!endpoint || !token) throw new Error('Completa la URL y el token.');
  const savedAt = new Date().toISOString();
  await chrome.storage.local.set({ endpoint, token, savedAt });
  renderSaved(endpoint, savedAt);
  show('Configuración guardada.', 'success');
  return { endpoint, token };
}

saveButton.addEventListener('click', () => saveSettings().catch(error => show(error.message, 'error')));
document.querySelector('#test-connection').addEventListener('click', async () => {
  try {
    const settings = await saveSettings();
    await ensureHostPermission(settings.endpoint);
    const response = await fetch(`${settings.endpoint}/api/integrations/status`, { headers: { Authorization: `Bearer ${settings.token}` } });
    const data = await response.json().catch(() => ({}));
    if (response.status === 404) throw new Error('El backend de EasyPanel está desactualizado: vuelve a implementar el último código.');
    if (!response.ok) throw new Error(data.message || `Error HTTP ${response.status}`);
    show(`Conexión correcta: dominio y token válidos${data.version ? ` (API ${data.version})` : ''}.`, 'success');
  } catch (error) { show(error.message, 'error'); }
});
document.querySelector('#open-mtc').addEventListener('click', () => chrome.tabs.create({ url: 'https://licencias.mtc.gob.pe/#/index' }));

importButton.addEventListener('click', async () => {
  importButton.disabled = true;
  show('Leyendo el resultado…');
  try {
    const settings = await saveSettings();
    await ensureHostPermission(settings.endpoint);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('https://licencias.mtc.gob.pe/')) throw new Error('Abre primero el resultado en licencias.mtc.gob.pe.');
    const extracted = await extractFromMtcTab(tab);
    if (!extracted?.ok) throw new Error(extracted?.message || 'No se pudo leer el resultado.');
    const response = await fetch(`${settings.endpoint}/api/integrations/mtc-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.token}` },
      body: JSON.stringify(extracted.record)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Error HTTP ${response.status}`);
    show(`Registro ${data.record.documentNumber} guardado correctamente.`, 'success');
  } catch (error) {
    show(error.message, 'error');
  } finally {
    importButton.disabled = false;
  }
});

loadSettings();
