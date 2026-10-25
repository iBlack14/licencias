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

  page.on('request', req => {
    if (req.url().includes('/api/')) {
      console.log('REQ:', req.method(), req.url());
      console.log('  Headers:', JSON.stringify(req.headers()));
      console.log('  Body:', req.postData());
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      let body = '';
      try { body = await res.text(); } catch {}
      console.log('RES:', res.status(), res.url());
      console.log('  Body:', body.slice(0, 500));
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
  await page.click(`app-captcha-imagenes img[src*="${CAPTCHA_MAP[targetName]}"]`);
  await page.waitForTimeout(1000);
  await page.click('button:has-text("Buscar")');

  await page.waitForURL('**/search**', { timeout: 15000 });
  await page.waitForTimeout(2000);
  await browser.close();
})().catch(e => { console.error('Error tracing:', e); process.exit(1); });
