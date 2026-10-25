chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OPEN_MTC_LOOKUP') {
    chrome.storage.local.set({ pendingLookup: message.lookup })
      .then(() => chrome.tabs.create({ url: 'https://licencias.mtc.gob.pe/#/index' }))
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message?.type === 'SAVE_MTC_RECORD') {
    (async () => {
      const { endpoint, token } = await chrome.storage.local.get(['endpoint', 'token']);
      if (!endpoint || !token) throw new Error('Configura primero el dominio y token en la extensión.');
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/integrations/mtc-record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(message.record)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `Error HTTP ${response.status}`);
      await chrome.storage.local.remove('pendingLookup');
      return { ok: true, record: data.record, endpoint };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }
});
