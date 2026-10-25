const { chromium } = require('playwright');

const CAPTCHA_MAP = {
  'anillo': '1.png', 'arbol': '2.png', 'auto': '3.png', 'avion': '4.png',
  'bicicleta': '5.png', 'billetera': '6.png', 'botella': '7.png', 'camion': '8.png',
  'cinturon': '9.png', 'desarmador': '10.png', 'edificio': '11.png', 'gafas': '12.png',
  'gato': '13.png', 'laptop': '14.png', 'linterna': '15.png', 'llaves': '16.png',
  'manzana': '17.png', 'media': '18.png', 'mesa': '19.png', 'mochila': '20.png',
  'perro': '21.png', 'pez': '22.png', 'pinia': '23.png', 'platano': '24.png',
  'puerta': '25.png', 'reloj': '26.png', 'scooter': '27.png', 'silla': '28.png',
  'tasa': '29.png', 'tienda': '30.png', 'timon': '31.png', 'zapato': '32.png'
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('response', async res => {
    if (res.url().includes('RegisterToken')) {
      console.log('RegisterToken response HTTP status:', res.status(), await res.text().catch(() => ''));
    }
  });

  await page.goto('https://licencias.mtc.gob.pe/#/index', { timeout: 35000, waitUntil: 'networkidle' });
  await page.fill('#mat-input-0', '72218318');
  await page.click('label[for="mat-checkbox-2-input"]');
  await page.click('label[for="mat-checkbox-1-input"]');

  await page.waitForSelector('app-captcha-imagenes', { timeout: 10000 });
  const consigna = await page.$eval('.tituloConsigna', el => el.innerText.trim());
  const match = consigna.match(/Selecciona la imagen de (.+)/i);
  const targetName = match[1].trim().toLowerCase();
  console.log('Consigna:', consigna, '=> Click:', targetName);

  await page.click(`app-captcha-imagenes img[src*="${CAPTCHA_MAP[targetName]}"]`);
  await page.waitForTimeout(1500);

  const swal = await page.$('.swal2-container');
  if (swal) {
    const text = await page.$eval('.swal2-container', el => el.innerText.trim());
    console.log('POPUP APPEARED:', text);
  } else {
    console.log('No popup appeared after captcha.');
  }

  await browser.close();
})().catch(console.error);
