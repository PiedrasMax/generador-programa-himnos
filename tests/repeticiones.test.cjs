const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
// Evaluate the actual application; only startup DOM/fetch are stubbed.
const element = { addEventListener() {}, classList: { add() {}, remove() {}, contains() { return true; } } };
const context = vm.createContext({
  document: { getElementById: () => element, querySelector: () => element,
    querySelectorAll: () => [], addEventListener() {} },
  fetch: async () => ({ json: async () => [] }), console, setTimeout
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), context);
const { detectarRepeticionesMensuales: detect, normalizarReferenciaHimno: normalize } = context;
const h = (numero = '84', himnario = 'HC', rol = 'Texto', extra = {}) => ({ numero, himnario, rol, ...extra });
const sd = (fecha, ...himnos) => ({ fecha, himnos });
const plain = x => JSON.parse(JSON.stringify(x));

test('lists every date and role, including optional and same-day functions', () => {
  const result = plain(detect([
    sd('2026-10-18', h('84', 'HC', 'Final Coro')),
    sd('2026-10-04', h(), h('84', 'HC', 'Previo 2'))
  ]));
  assert.equal(result.repeticiones.length, 1);
  assert.deepEqual(result.repeticiones[0].ocurrencias, [
    { fecha: '2026-10-04', rol: 'Texto', indiceServicio: 1 },
    { fecha: '2026-10-04', rol: 'Previo 2', indiceServicio: 1 },
    { fecha: '2026-10-18', rol: 'Final Coro', indiceServicio: 0 }
  ]);
});
test('same-day services remain distinct occurrences', () => {
  const result = detect([sd('2026-10-04', h()), sd('2026-10-04', h())]);
  assert.equal(result.repeticiones[0].ocurrencias.length, 2);
});
test('groups the entire calendar month, isolates months, years and hymnals', () => {
  const result = detect([
    sd('2026-10-01', h()), sd('2026-10-31', h()),
    sd('2026-11-01', h()), sd('2027-10-01', h()), sd('2026-10-01', h('84', 'HR'))
  ]);
  assert.equal(result.repeticiones.length, 1);
  assert.equal(result.repeticiones[0].mes, '2026-10');
  assert.equal(result.repeticiones[0].ocurrencias.length, 2);
});
test('normalizes case, whitespace and decimal leading zeros without losing suffixes', () => {
  assert.equal(normalize(h(' 084 ', ' hc ')).clave, normalize(h(84)).clave);
  assert.equal(normalize(h('107a', 'HI')).clave, normalize(h('107A', 'hi')).clave);
  assert.notEqual(normalize(h('107a', 'HI')).clave, normalize(h('107', 'HI')).clave);
  assert.notEqual(normalize(h('144a', 'HI')).clave, normalize(h('144b', 'HI')).clave);
  assert.equal(normalize(h('000')).numero, '0');
});
test('name, stanzas and catalog membership do not affect identity', () => {
  const result = detect([sd('2026-10-04',
    h('99999', 'HC', 'Texto', { nombre: 'Libre', estrofas: '1' }),
    h('99999', 'HC', 'Final Coro', { nombre: 'Otro', estrofas: '2' }))]);
  assert.equal(result.repeticiones.length, 1);
});
test('ignores empty references and dash placeholders', () => {
  for (const item of [h(''), h('84', ''), h('-'), h('84', '-'), h('   '), null]) {
    assert.equal(normalize(item), null);
  }
  assert.equal(detect([sd('2026-10-01', h(''), h('-'), h('84', ''))]).repeticiones.length, 0);
  assert.deepEqual(plain(detect([])), { repeticiones: [], serviciosSinFecha: [] });
});
test('reports undated/invalid services and validates leap days', () => {
  const result = plain(detect([
    sd('', h()), sd('2026-02-29', h()), sd('2026-13-01', h()),
    sd('2026-10-32', h()), sd('2024-02-29', h(), h()), sd('not-a-date', h())
  ]));
  assert.deepEqual(result.serviciosSinFecha, [0, 1, 2, 3, 5]);
  assert.equal(result.repeticiones[0].mes, '2024-02');
});
test('does not mutate inputs or depend on previous calls', () => {
  const hymn = Object.freeze(h());
  const input = Object.freeze([
    Object.freeze({ fecha: '2026-10-04', himnos: Object.freeze([hymn]) }),
    Object.freeze({ fecha: '2026-10-18', himnos: Object.freeze([hymn]) })
  ]);
  const before = JSON.stringify(input);
  assert.equal(detect(input).repeticiones.length, 1);
  assert.equal(detect(input.slice(0, 1)).repeticiones.length, 0);
  assert.equal(JSON.stringify(input), before);
});
test('multiple monthly groups retain all occurrences', () => {
  const result = detect([
    sd('2026-11-04', h(), h()), sd('2026-10-04', h(), h()),
    sd('2026-10-18', h('107a', 'HI'), h('107A', 'HI'))
  ]);
  assert.deepEqual(plain(result.repeticiones.map(g => [g.mes, g.himnario, g.numero])),
    [['2026-10', 'HC', '84'], ['2026-10', 'HI', '107A'], ['2026-11', 'HC', '84']]);
});
