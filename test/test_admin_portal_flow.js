const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1. Login to admin
  await page.goto('http://127.0.0.1:3000/admin.html', { waitUntil: 'networkidle' });
  await page.fill('#login-user', 'admin');
  await page.fill('#login-pass', 'Cambiar123!');
  await page.click('#login-btn');
  await page.waitForSelector('#dashboard:not([hidden])', { timeout: 5000 });

  // 2. Open modal to create a new driver
  await page.click('#add-record-btn');
  await page.waitForSelector('#record-modal:not([hidden])', { timeout: 3000 });

  await page.selectOption('#f-docType', 'CE');
  await page.fill('#f-docNum', 'CE987654');
  await page.fill('#f-lastNames', 'FERNANDEZ MENDOZA');
  await page.fill('#f-firstNames', 'MARIA ELENA');
  await page.selectOption('#f-licenseClass', 'A-I');
  await page.fill('#f-licenseNum', 'A987654');
  await page.selectOption('#f-licenseType', 'DIGITAL');
  await page.selectOption('#f-status', 'Vigente');
  await page.fill('#f-issuedAt', '15/01/2023');
  await page.fill('#f-expiresAt', '15/01/2028');
  await page.fill('#f-restrictions', 'USO DE LENTES');
  await page.fill('#f-issuer', 'MTC - LIMA METROPOLITANA');
  await page.fill('#f-points', '0');

  await page.click('#save-btn');
  await page.waitForTimeout(1000);

  // 3. Go to public portal and search for this new driver
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });

  // Enable advanced mode
  await page.click('#advanced');
  await page.click('#document-type-trigger');
  await page.click('button[role="option"]:has-text("CARNÉ DE EXTRANJERÍA")');
  await page.fill('#identity', 'CE987654');
  await page.click('label.accept');

  // Captcha
  await page.click('.robot');
  await page.waitForSelector('#visual-captcha:not([hidden])', { timeout: 3000 });
  const target = await page.$eval('#captcha-target', el => el.textContent.trim());

  const captchaMap = [
    'anillo','árbol','auto','avión','bicicleta','billetera','botella','camión',
    'cinturón','desarmador','edificio','gafas','gato','laptop','linterna','llaves',
    'manzana','media','mesa','mochila','perro','pez','piña','plátano',
    'puerta','reloj','scooter','silla','taza','tienda','timón','zapato'
  ];
  const targetIndex = captchaMap.indexOf(target) + 1;
  await page.click(`button.captcha-tile[data-index="${targetIndex}"]`);
  await page.waitForTimeout(600);

  // Submit search
  await page.click('.search-button');
  await page.waitForURL('**/search.html**', { timeout: 6000 });
  await page.waitForTimeout(1000);

  const lastName = await page.$eval('#res-last-names', el => el.textContent.trim());
  const firstName = await page.$eval('#res-first-names', el => el.textContent.trim());
  const docType = await page.$eval('#res-doc-type', el => el.textContent.trim());
  const docNum = await page.$eval('#res-doc-number', el => el.textContent.trim());
  const licClass = await page.$eval('#res-class', el => el.textContent.trim());
  const restrictions = await page.$eval('#res-restrictions', el => el.textContent.trim());

  console.log('Admin Created Driver Verified in Portal:', {
    lastName, firstName, docType, docNum, licClass, restrictions
  });

  await page.screenshot({ path: 'output/playwright/admin-created-driver-search.png', fullPage: true });

  // 4. Clean up: delete test record via admin API so records.json stays clean
  await page.goto('http://127.0.0.1:3000/admin.html', { waitUntil: 'networkidle' });
  const deleteResult = await page.evaluate(async () => {
    return await fetch('/api/admin/records/CE987654', { method: 'DELETE' }).then(r => r.json());
  });
  console.log('Cleaned up test record:', deleteResult);

  await browser.close();
})().catch(err => {
  console.error('Admin Portal Flow Failed:', err);
  process.exit(1);
});
