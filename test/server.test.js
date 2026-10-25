const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDocument, verifyCaptcha, makeCaptcha } = require('../server');

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
