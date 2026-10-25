const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDocument, verifyCaptcha, makeCaptcha, normalizeRecord, validateRecord, server } = require('../server');

test('valida el DNI', () => {
  assert.equal(validateDocument('DNI', ''), 'Debe ingresar su número de Documento.');
  assert.equal(validateDocument('DNI', '1234'), 'El DNI debe contener 8 dígitos.');
  assert.equal(validateDocument('DNI', '12345678'), null);
});

test('acepta documentos alfanuméricos válidos', () => {
  assert.equal(validateDocument('CE', 'ABC12345'), null);
  assert.match(validateDocument('CE', '12'), /válido/);
});

test('firma y valida captcha local', () => {
  const { token } = makeCaptcha();
  const [payload] = token.split('.');
  const { code } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.equal(verifyCaptcha(token, code), true);
  assert.equal(verifyCaptcha(token, 'ERROR'), false);
});

test('acepta y normaliza el JSON original del MTC', () => {
  const record = normalizeRecord({
    IsSuccess: true,
    Data: {
      Administrados: [{ NomTipoDoc: 'DNI', NumDocumento: '12345678', ApellidoPaterno: 'PEREZ', ApellidoMaterno: 'DIAZ', Nombre: 'ANA' }],
      LicenciaA: { Categoria: 'A II-B', NroLicencia: 'Q12345678', Estado: 'VIGENTE', FechaExpedicion: '01/02/2024 00:00:00', FechaRevalidacion: '01/02/2029 00:00:00', Restriccion1: 'LENTES', CentroEmision: 'MTC LIMA' }
    }
  });
  assert.equal(validateRecord(record), null);
  assert.equal(record.lastNames, 'PEREZ DIAZ');
  assert.equal(record.expiresAt, '01/02/2029');
  assert.equal(record.restrictions, 'LENTES');
});

test('combina las capturas general y de puntos del MTC', () => {
  const record = normalizeRecord([
    { data: { IsSuccess: true, Data: { Administrados: [{ NumDocumento: '12345678', ApellidoPaterno: 'PEREZ', Nombre: 'ANA' }], LicenciaB: { Categoria: 'B II-C', NroLicencia: 'B12345678' } } } },
    { data: { IsSuccess: true, Data: { Administrado: { var_numdocumento: '12345678', PtsAcumulados: '12' } } } }
  ]);
  assert.equal(validateRecord(record), null);
  assert.equal(record.licenseClass, 'B II-C');
  assert.equal(record.points, 12);
});

test('acepta preflight CORS desde una extensión Chrome', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/integrations/status`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'chrome-extension://testextensionid',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization'
      }
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'chrome-extension://testextensionid');
    assert.match(response.headers.get('access-control-allow-headers'), /Authorization/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('expone el estado de integración con y sin slash final', async () => {
  const previous = process.env.EXTENSION_API_TOKEN;
  // El token se captura al cargar el módulo; sin token configurado ambas rutas deben existir y responder 401, no 404.
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    for (const path of ['/api/integrations/status', '/api/integrations/status/']) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { Origin: 'chrome-extension://testextensionid', Authorization: 'Bearer invalid' }
      });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('access-control-allow-origin'), 'chrome-extension://testextensionid');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.EXTENSION_API_TOKEN;
    else process.env.EXTENSION_API_TOKEN = previous;
  }
});
