const { chromium } = require('playwright');

const CAPTCHA_MAP = {
  'anillo': '1.png', 'arbol': '2.png', 'auto': '3.png', 'avion': '4.png',
  'bicicleta': '5.png', 'billetera': '6.png', 'botella': '7.png', 'camion': '8.png',
  'cinturon': '9.png', 'desarmador': '10.png', 'edificio': '11.png', 'gafas': '12.png',
  'gato': '13.png', 'laptop': '14.png', 'linterna': '15.png', 'llaves': '16.png',
  'manzana': '17.png', 'media': '18.png', 'mesa': '19.png', 'mochila': '20.png',
  'perro': '21.png', 'pez': '22.png', 'pina': '23.png', 'platano': '24.png',
  'puerta': '25.png', 'reloj': '26.png', 'scooter': '27.png', 'silla': '28.png',
  'taza': '29.png', 'tienda': '30.png', 'timon': '31.png', 'zapato': '32.png'
};
function log(event, details = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), scope: 'mtc', event, ...details }));
}

function masked(value) {
  const text = String(value || '');
  return '*'.repeat(Math.max(0, text.length - 4)) + text.slice(-4);
}

/**
 * Consulta en vivo al Portal Oficial del MTC (https://licencias.mtc.gob.pe/)
 * Automatiza la resolución del captcha y extrae los datos del conductor.
 */
async function fetchMtcDriver(docType = 'DNI', docNumber) {
  const number = String(docNumber || '').trim().toUpperCase();
  if (!number) return { ok: false, message: 'Número de documento requerido.' };
  log('lookup_started', { documentType: docType, document: masked(number) });

  let browser;
  let deadline;
  try {
    deadline = setTimeout(() => browser?.close().catch(() => {}), 45000);
    deadline.unref?.();
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    log('browser_started');
    page = await browser.newPage();
    page.on('console', message => { if (['error','warning'].includes(message.type())) log('portal_console', { level: message.type(), text: message.text().slice(0, 300) }); });
    page.on('requestfailed', request => { let host = 'unknown'; try { host = new URL(request.url()).hostname; } catch {} log('request_failed', { host, error: request.failure()?.errorText || 'unknown' }); });

    let rateLimited = false;
    page.on('response', res => {
      if (res.status() === 429) rateLimited = true;
    });

    await page.goto('https://licencias.mtc.gob.pe/#/index', { timeout: 15000, waitUntil: 'domcontentloaded' });
    log('portal_loaded', { url: page.url() });
    const portalTitle = await page.title();
    if (/Attention Required|Cloudflare/i.test(portalTitle)) {
      log('portal_blocked', { title: portalTitle });
      return { ok: false, error: 'blocked', message: 'La consulta externa no está disponible desde este servidor. Inténtelo nuevamente más tarde.' };
    }

    if (docType !== 'DNI') {
      const advToggle = await page.$('#mat-slide-toggle-1-input, .mat-slide-toggle-input');
      if (advToggle) {
        await advToggle.click();
        await page.waitForTimeout(500);
      }
    }

    // Llenar el documento
    const inputSelector = docType === 'DNI' ? '#mat-input-0' : '#mat-input-1, #mat-input-0';
    const documentInput = page.getByRole('textbox', { name: /Documento de identidad/i });
    await documentInput.waitFor({ state: 'visible', timeout: 20000 });
    log('form_ready');
    await documentInput.fill(number);

    // Aceptar consentimiento y abrir captcha
    await page.click('label[for="mat-checkbox-2-input"]').catch(() => {});
    await page.click('label[for="mat-checkbox-1-input"]').catch(() => {});

    // Resolver desafío visual
    await page.waitForSelector('app-captcha-imagenes', { timeout: 12000 });
    const consigna = await page.$eval('.tituloConsigna', el => el.innerText.trim());
    const match = consigna.match(/Selecciona la imagen de (.+)/i);
    if (!match) throw new Error('No se pudo identificar la consigna del captcha');

    const targetName = match[1].trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const fileName = CAPTCHA_MAP[targetName] || '1.png';
    log('captcha_detected', { target: targetName, image: fileName });

    await page.click(`app-captcha-imagenes img[src*="${fileName}"]`);
    await page.waitForTimeout(1200);

    // Verificar si se abrió un modal de bloqueo o alerta antes de buscar
    const swalEarly = await page.$('.swal2-container');
    if (swalEarly) {
      const text = await page.$eval('.swal2-container', el => el.innerText.trim()).catch(() => '');
      await browser.close();
      if (rateLimited || text.includes('rate limited') || text.includes('1015')) {
        return { ok: false, error: 'rate_limited', message: 'No se pudo completar la consulta. Inténtelo nuevamente en unos minutos.' };
      }
      return { ok: false, error: 'not_found', message: '¡No se encontró información de persona natural!!' };
    }

    // Clic en Buscar
    await page.click('button:has-text("Buscar")', { timeout: 5000 });

    // Esperar navegación a search o modal de no encontrado
    const outcome = await Promise.race([
      page.waitForURL('**/search**', { timeout: 15000 }).then(() => 'search_page'),
      page.waitForSelector('.swal2-container', { timeout: 15000 }).then(() => 'swal_modal')
    ]);
    log('portal_outcome', { outcome, rateLimited });

    if (outcome === 'swal_modal') {
      const modalText = await page.$eval('.swal2-container', el => el.innerText.trim()).catch(() => '');
      await browser.close();

      if (rateLimited || modalText.includes('rate limited') || modalText.includes('1015')) {
        return { ok: false, error: 'rate_limited', message: 'No se pudo completar la consulta. Inténtelo nuevamente en unos minutos.' };
      }
      return { ok: false, error: 'not_found', message: '¡No se encontró información de persona natural!!' };
    }

    // En la página de resultados, esperar 1.5s a que Angular renderice
    await page.waitForTimeout(1500);

    const extracted = await page.evaluate(() => {
      const map = {};
      document.querySelectorAll('mat-form-field').forEach(field => {
        const label = field.querySelector('mat-label')?.innerText?.trim();
        const input = field.querySelector('input');
        if (label && input) {
          map[label] = input.value?.trim() || '';
        }
      });
      return map;
    });

    await browser.close();

    if (!extracted['Nombres'] && !extracted['Apellidos']) {
      log('record_not_found');
      return { ok: false, error: 'not_found', message: '¡No se encontró información de persona natural!!' };
    }

    const record = {
      documentType: extracted['Tipo de documento'] || docType,
      documentNumber: extracted['Número de documento'] || number,
      lastNames: extracted['Apellidos'] || '',
      firstNames: extracted['Nombres'] || '',
      licenseClass: extracted['Clase y categoría'] || 'A-I',
      licenseNumber: extracted['Número de licencia'] || `Q${number}`,
      licenseType: (extracted['Tipo de Licencia'] || 'FISICA').toUpperCase(),
      status: 'Vigente',
      issuedAt: extracted['Fecha de expedición'] || new Date().toLocaleDateString('es-PE'),
      expiresAt: extracted['Vigente hasta'] || '',
      restrictions: extracted['Restricciones'] || 'SIN RESTRICCIONES',
      issuer: extracted['Centro de emisión'] || 'MTC',
      points: 0,
      source: 'MTC_OFICIAL',
      updatedAt: new Date().toISOString()
    };

    log('record_found', { document: masked(number), licenseClass: record.licenseClass });
    return { ok: true, record };
  } catch (err) {
    const title = page ? await page.title().catch(() => '') : '';
    let host = ''; try { host = page ? new URL(page.url()).hostname : ''; } catch {}
    log('lookup_failed', { name: err.name, message: err.message, title, host });
    return { ok: false, error: 'error', message: 'La consulta está tardando más de lo esperado. Inténtelo nuevamente.' };
  } finally {
    clearTimeout(deadline);
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { fetchMtcDriver, CAPTCHA_MAP };
