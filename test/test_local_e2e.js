const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });

  // Fill search form
  await page.fill('#identity', '72218318');
  await page.click('label.accept');

  // Trigger captcha
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
  const licenseNum = await page.$eval('#res-license-num', el => el.textContent.trim());
  const licenseClass = await page.$eval('#res-class', el => el.textContent.trim());

  console.log('E2E Search Result Loaded:', { lastName, firstName, licenseNum, licenseClass });

  await page.screenshot({ path: 'output/playwright/e2e-search-flow-verified.png', fullPage: true });
  await browser.close();
})().catch(err => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
