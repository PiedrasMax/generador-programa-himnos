// Optional integration suite: requires Playwright and an installed Edge browser.
// Run from the repository root: node tests/flujos.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const BASE = '73fc69a4ce463444d76fe5b2e846170d9dcd87e5';
const root = path.resolve(__dirname, '..');
const artifacts = path.resolve(root, '..', 'evidencia-himnos');
fs.mkdirSync(artifacts, { recursive: true });
const baseline = execFileSync('git', ['show', `${BASE}:app.js`], { cwd: root });
const files = new Set(['index.html', 'app.js', 'styles.css', 'catalogo.json']);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const name = url.pathname.split('/').pop() || 'index.html';
  if (!files.has(name)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript; charset=utf-8' :
    name.endsWith('.json') ? 'application/json' : name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
  res.end(url.pathname.startsWith('/baseline/') && name === 'app.js' ? baseline : fs.readFileSync(path.join(root, name)));
});
const first = '#SD\nFecha: 2026-10-04\nTexto: HC 84\n';
const second = '#SD\nFecha: 2026-10-18\nFinal Coro: HC 84\n';
const checks = [];
function pass(name) { checks.push(name); console.log('PASS', name); }
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async text => { window.__copied = text; }
    } });
  });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  async function open(mode = 'current') {
    await page.goto(`${baseURL}/${mode === 'baseline' ? 'baseline/' : ''}index.html`);
    await page.evaluate(() => catalogoReady);
    await page.waitForFunction(() => !!window.jspdf?.jsPDF?.API.autoTable);
    await page.locator('#modoMaestro').click();
  }
  async function process(text) {
    await page.locator('#inputMaestro').fill(text);
    await page.locator('#procesar').click();
  }
  const state = () => page.evaluate(() => JSON.stringify(maestroState.servicios));
  const warn = () => page.locator('#avisoRepeticionesMaestro').innerText();
  // data-label is the stable function identity in the real form.
  const editorField = rol => page.locator(`#editorArea .campo-himno[data-label="${rol}"]`);
  async function expand(scope) { await page.locator(`${scope} details`).evaluateAll(nodes => nodes.forEach(n => n.open = true)); }
  async function installCapture() {
    await page.evaluate(() => {
      window.__pdfs = [];
      window.jspdf.jsPDF.API.save = function (name) {
        window.__pdfs.push({ name, bytes: Array.from(new Uint8Array(this.output('arraybuffer'))) });
        return this;
      };
    });
  }
  async function capture(file) {
    await installCapture();
    const before = dialogs.length;
    await page.locator('#maestro #exportarPDF').click();
    await page.waitForFunction(() => window.__pdfs.length === 1);
    assert.equal(dialogs.length, before, 'PDF must not require a dialog');
    const pdf = await page.evaluate(() => window.__pdfs[0]);
    fs.writeFileSync(path.join(artifacts, file), Buffer.from(pdf.bytes));
    return pdf;
  }
  await open();
  assert.equal(await page.evaluate(() => catalogo.length), 737);
  await process(first);
  assert.equal(await page.locator('#avisoRepeticionesMaestro').isVisible(), false);
  await process(second);
  const progressive = await state();
  assert.match(await warn(), /84 HC/);
  assert.match(await warn(), /04\/10\/2026 — Texto/);
  assert.match(await warn(), /18\/10\/2026 — Final Coro/);
  assert.match(await warn(), /Aviso informativo: las repeticiones no impiden generar el PDF/);
  const beforeButton = await page.evaluate(() => document.querySelector('#avisoRepeticionesMaestro').compareDocumentPosition(document.querySelector('#maestro #exportarPDF')) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(beforeButton);
  pass('progressive imports warn before the PDF action, with every date and function');
  await open();
  await process(first + second);
  assert.equal(await state(), progressive);
  pass('full-month and progressive imports produce identical accumulated services');
  await page.locator('.btnEditar').nth(1).click();
  await expand('#editorArea');
  await editorField('Final Coro').locator('.numero').fill('85');
  assert.equal(await state(), progressive);
  assert.match(await warn(), /84 HC/);
  assert.doesNotMatch(await page.locator('#avisoRepeticionesBorrador').innerText(), /84 HC/);
  await capture('editor-sin-guardar.pdf');
  assert.equal(await state(), progressive);
  await page.locator('#btnCancelarSD').click();
  assert.equal(await state(), progressive);
  pass('draft preview does not mutate/export unsaved values; cancel restores the saved view');
  await page.locator('.btnEditar').nth(1).click();
  await expand('#editorArea');
  await editorField('Final Coro').locator('.chkUsarLista').check();
  await editorField('Final Coro').locator('.numeroSel').selectOption('85');
  await page.locator('#btnGuardarSD').click();
  assert.equal(await page.evaluate(() => maestroState.servicios[1].himnos.find(h => h.rol === 'Final Coro').numero), '85');
  assert.equal(await page.locator('#avisoRepeticionesMaestro').isVisible(), false);
  pass('saving the active list value removes the repetition without reading stale written input');
  await page.locator('.btnEditar').nth(1).click();
  await expand('#editorArea');
  await editorField('Final Coro').locator('.numero').fill('84');
  await page.locator('#edFecha').fill('2026-11-18');
  await page.locator('#btnGuardarSD').click();
  assert.equal(await page.locator('#avisoRepeticionesMaestro').isVisible(), false);
  pass('moving an edited service to another month avoids a cross-month false positive');
  await page.locator('#btnAgregarSD').click();
  assert.match(await warn(), /sin fecha válida/);
  await expand('#editorArea');
  await page.locator('#edFecha').fill('2026-10-25');
  await editorField('Final Coro').locator('.himnario').selectOption('HC');
  await editorField('Final Coro').locator('.numero').fill('84');
  await page.locator('#btnGuardarSD').click();
  assert.match(await warn(), /25\/10\/2026 — Final Coro/);
  await page.locator('.btnBorrar').nth(2).click();
  assert.equal(await page.locator('#avisoRepeticionesMaestro').isVisible(), false);
  pass('add, save and delete recalculate warnings; missing dates are informative');
  const savedMaestro = await state();
  await page.locator('#modoColaborador').click();
  await expand('#colaborador');
  await page.locator('#listaSD .fecha').fill('2026-10-04');
  const collab = rol => page.locator(`#listaSD .campo-himno[data-label="${rol}"]`);
  for (const rol of ['Texto', 'Previo 2']) {
    await collab(rol).locator('.himnario').selectOption('HC');
    await collab(rol).locator('.numero').fill('84');
  }
  assert.match(await page.locator('#avisoRepeticionesColaborador').innerText(), /84 HC/);
  assert.equal(await page.locator('#avisoRepeticionesColaborador li').count(), 2);
  await collab('Previo 2').locator('.chkUsarLista').check();
  await collab('Previo 2').locator('.numeroSel').selectOption('85');
  assert.equal(await page.locator('#avisoRepeticionesColaborador').isVisible(), false);
  await collab('Previo 2').locator('.numeroSel').selectOption('84');
  await page.locator('#colaborador #copiar').click();
  const copied = await page.locator('#salida').inputValue();
  assert.match(copied, /Texto: HC 84/);
  assert.match(copied, /Previo 2: HC 84/);
  assert.doesNotMatch(copied, /Aviso informativo/);
  assert.equal(copied, await page.evaluate(() => window.__copied));
  assert.equal(await state(), savedMaestro);
  pass('Colaborador warns for same-day optional roles, supports list mode and preserves copied #SD format');
  await page.locator('#btnSearchGlobal').click();
  await page.locator('#searchInput').fill('HC 84');
  assert.ok(await page.locator('.search-item').count());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#searchPanel').isVisible(), false);
  await page.locator('#modoMaestro').click();
  assert.equal(await state(), savedMaestro);
  pass('catalog search and mode changes preserve the accumulated Maestro state');
  await process(copied);
  assert.match(await warn(), /84 HC/);
  pass('Colaborador output imports back into Maestro with all repeated occurrences');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#avisoRepeticionesMaestro').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('#avisoRepeticionesMaestro').isVisible());
  assert.equal(await page.locator('#maestro #exportarPDF').isEnabled(), true);
  await page.screenshot({ path: path.join(artifacts, 'aviso-movil.png') });
  pass('warning and enabled PDF button remain available at a mobile viewport');
  await page.setViewportSize({ width: 1280, height: 900 });
  await open();
  await process('#SD\nFecha: 2026-10-04\nTexto: hi 107a\nInicio: HC 084\n' +
    '#SD\nFecha: 2026-10-18\nFinal Coro: HI 107A\nFinal Comunidad: HC 84\n');
  assert.match(await warn(), /107A HI/);
  assert.match(await warn(), /84 HC/);
  await process('#SD\nFecha: 2026-11-01\nTexto: HC 84\n');
  assert.doesNotMatch(await warn(), /01\/11\/2026/);
  pass('imported suffixes, case and leading zeros normalize without crossing calendar months');
  const originalWarnings = await warn();
  await process('#SD\nFecha: 2026-11-01\nTexto: HC 84\n');
  assert.match(await warn(), /01\/11\/2026/);
  assert.notEqual(await warn(), originalWarnings);
  pass('reimporting appends and warns, preserving the existing import behavior');
  await page.evaluate(() => {
    const target = document.createElement('div');
    target.id = 'testAvisoSeguro';
    document.body.appendChild(target);
    renderAvisoRepeticiones(target, [{ fecha: '2026-10-04', himnos: [
      { himnario: '<b>HC</b>', numero: '84', rol: '<img src=x onerror=alert(1)>' },
      { himnario: '<b>HC</b>', numero: '84', rol: 'Texto' }
    ] }]);
  });
  assert.equal(await page.locator('#testAvisoSeguro img, #testAvisoSeguro b').count(), 0);
  assert.match(await page.locator('#testAvisoSeguro').innerText(), /<img src=x/);
  pass('warning renderer treats imported identifiers and roles as text');
  await open();
  await page.route('**/catalogo.json', route => route.abort());
  await page.reload();
  await page.evaluate(() => catalogoReady);
  await page.locator('#modoMaestro').click();
  await process(first + second);
  assert.match(await warn(), /84 HC/);
  assert.ok(await page.locator('#banner').isVisible());
  await page.unroute('**/catalogo.json');
  pass('duplicate warning remains available when the catalog fetch fails');
  // Test data exercises 13 roles, suffixes, stanzas, watermark and multiple pages.
  const roles = ['Previo 1','Previo 2','Inicio','Texto','Lectura Bíblica','Cambio de Cargo','Arrepentimiento','Santa Cena','Especial 1','Final Comunidad','Final Coro','Descongregación 1','Descongregación 2'];
  const fixture = Array.from({ length: 12 }, (_, i) => ({
    fecha: `2026-10-${String(i * 2 + 1).padStart(2, '0')}`,
    himnos: roles.map((rol, j) => ({ rol, himnario: j === 4 ? 'HI' : 'HC', numero: j === 4 ? '107a' : '84',
      nombre: 'Himno de prueba para verificar texto y distribución', estrofas: j % 2 ? '1°, 2°' : '' }))
  }));
  async function preparePDF(mode) {
    await open(mode);
    await page.evaluate(data => {
      maestroState.servicios = data;
      maestroState.comunidad = 'Comunidad de prueba';
      maestroState.ensayos = '28/10/2026 17 hs';
      maestroState.periodo = '10-2026';
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 80;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#aaccee'; ctx.fillRect(0, 0, 80, 80);
      maestroState.marcaAguaDataUrl = canvas.toDataURL('image/png');
      renderTablaResultado();
    }, fixture);
  }
  await preparePDF('baseline');
  const pdfBefore = await capture('pdf-base.pdf');
  await preparePDF('current');
  const beforeState = await state();
  const pdfAfter = await capture('pdf-mejora.pdf');
  assert.equal(await state(), beforeState);
  assert.equal(pdfBefore.name, pdfAfter.name);
  pass('actual jsPDF/AutoTable exports duplicates in one click, without dialogs or state mutation');
  const { pathToFileURL } = require('node:url');
  const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  async function inspectPDF(bytes, prefix) {
    const pdf = await pdfjs.getDocument({ data: Uint8Array.from(bytes), useSystemFonts: false, disableFontFace: true, standardFontDataUrl: path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').split(path.sep).join('/') + '/' }).promise;
    const content = [];
    const { createCanvas } = require('@napi-rs/canvas');
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i);
      const text = await p.getTextContent();
      content.push({ view: p.view, items: text.items.map(x => ({ str: x.str, transform: x.transform, width: x.width, height: x.height })) });
      const viewport = p.getViewport({ scale: 1 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await p.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      fs.writeFileSync(path.join(artifacts, `${prefix}-${i}.png`), canvas.toBuffer('image/png'));
    }
    return content;
  }
  const before = await inspectPDF(pdfBefore.bytes, 'pdf-base');
  const after = await inspectPDF(pdfAfter.bytes, 'pdf-mejora');
  assert.deepEqual(after, before);
  assert.ok(after.length > 1);
  assert.doesNotMatch(JSON.stringify(after), /Aviso informativo|Repeticiones|Vista previa/);
  for (let i = 1; i <= after.length; i++) {
    assert.deepEqual(fs.readFileSync(path.join(artifacts, `pdf-base-${i}.png`)),
      fs.readFileSync(path.join(artifacts, `pdf-mejora-${i}.png`)));
  }
  pass(`PDF regression: ${after.length} pages, identical text/positions and rendered pixels against the base commit`);
  assert.deepEqual(errors, []);
  pass('no uncaught JavaScript errors in browser flows');
  fs.writeFileSync(path.join(artifacts, 'resultado-flujos.json'), JSON.stringify({ base: BASE, checks, pageErrors: errors, pdfPages: after.length, pdfPixelIdentical: true }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.close();
});
