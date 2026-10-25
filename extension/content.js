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

