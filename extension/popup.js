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

async function loadSettings() {
  const saved = await chrome.storage.local.get(['endpoint', 'token', 'savedAt']);
  endpointInput.value = saved.endpoint || '';
  tokenInput.value = saved.token || '';
  if (saved.endpoint && saved.token) renderSaved(saved.endpoint, saved.savedAt);
}

async function saveSettings() {
  const endpoint = endpointInput.value.trim().replace(/\/$/, '');
  const token = tokenInput.value.trim();
  if (!endpoint || !token) throw new Error('Completa la URL y el token.');
  const origin = `${new URL(endpoint).origin}/*`;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error('Debes permitir el acceso al dominio del sistema.');
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
    const response = await fetch(`${settings.endpoint}/api/integrations/status`, { headers: { Authorization: `Bearer ${settings.token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Error HTTP ${response.status}`);
    show('Conexión correcta: dominio y token válidos.', 'success');
  } catch (error) { show(error.message, 'error'); }
});
document.querySelector('#open-mtc').addEventListener('click', () => chrome.tabs.create({ url: 'https://licencias.mtc.gob.pe/#/index' }));

importButton.addEventListener('click', async () => {
  importButton.disabled = true;
  show('Leyendo el resultado…');
  try {
    const settings = await saveSettings();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('https://licencias.mtc.gob.pe/')) throw new Error('Abre primero el resultado en licencias.mtc.gob.pe.');
    const extracted = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_MTC_RECORD' });
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

