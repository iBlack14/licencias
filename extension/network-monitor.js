(() => {
  if (window.__mtcJsonMonitorInstalled) return;
  window.__mtcJsonMonitorInstalled = true;

  const emit = (entry) => {
    window.postMessage({
      source: 'mtc-json-monitor',
      type: 'JSON_RESPONSE',
      entry: { ...entry, capturedAt: new Date().toISOString() }
    }, location.origin);
  };

  const parseJson = (text, contentType = '') => {
    const value = String(text || '').trim();
    if (!value || (!/json/i.test(contentType) && !/^[\[{]/.test(value))) return null;
    try { return JSON.parse(value); } catch { return null; }
  };

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const clone = response.clone();
      const data = parseJson(await clone.text(), clone.headers.get('content-type') || '');
      if (data !== null) emit({ transport: 'fetch', method: args[1]?.method || 'GET', url: clone.url, status: clone.status, data });
    } catch (_) {}
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__mtcRequest = { method, url: new URL(String(url), location.href).href };
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try {
        let data = this.responseType === 'json' ? this.response : parseJson(this.responseText, this.getResponseHeader('content-type') || '');
        if (data !== null) emit({ transport: 'xhr', method: this.__mtcRequest?.method || 'GET', url: this.responseURL || this.__mtcRequest?.url, status: this.status, data });
      } catch (_) {}
    }, { once: true });
    return originalSend.apply(this, args);
  };
})();
