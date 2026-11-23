// Pruebas del cálculo de premios: node test/premios.test.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = { console };
vm.createContext(ctx);
['Premios.gs', 'Fuente.gs'].forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx));
const run = (code) => vm.runInContext(code, ctx);
let ok = 0;
function t(nombre, fn) { fn(); ok++; console.log('✔ ' + nombre); }

const filas = [
  { numero: '72480', tipo: 'PRIMERO' }, { numero: '58303', tipo: 'SEGUNDO' }, { numero: '15905', tipo: 'TERCERO' },
  { numero: '24262', tipo: 'CUARTO' }, { numero: '62246', tipo: 'CUARTO' },
  { numero: '11840', tipo: 'QUINTO' }, { numero: '00001', tipo: 'PEDREA' }, { numero: '72480', tipo: 'PEDREA' }
];
ctx.filas = filas;
run('ext = construirExtraccion(filas)');
const total = (n) => run(`premiosDeNumero('${n}', ext).reduce((s,x)=>s+x.euros,0)`);
const tipos = (n) => run(`premiosDeNumero('${n}', ext).map(x=>x.tipo).join(',')`);

t('el número del Gordo no suma pedrea, centena, terminación ni reintegro', () => assert.strictEqual(total('72480'), 400000));
t('aproximaciones del 1º', () => { assert.strictEqual(tipos('72479'), 'APROX_PRIMERO,CENTENA_PRIMERO'); assert.strictEqual(total('72481'), 2100); });
t('centena + dos cifras + reintegro', () => assert.strictEqual(tipos('72410'), 'CENTENA_PRIMERO,REINTEGRO'));
t('dos últimas cifras del 1º (incluye reintegro)', () => { assert.strictEqual(tipos('00080'), 'DOS_PRIMERO,REINTEGRO'); assert.strictEqual(total('00080'), 120); });
t('reintegro solo', () => assert.strictEqual(tipos('12340'), 'REINTEGRO'));
t('sin premio', () => assert.strictEqual(total('12345'), 0));
t('pedrea', () => assert.strictEqual(tipos('00001'), 'PEDREA'));
t('4º premio y su centena', () => { assert.strictEqual(total('24262'), 20000); assert.strictEqual(tipos('24299'), 'CENTENA_CUARTO'); });
t('aproximación al 3º y terminación del 3º', () => { assert.strictEqual(tipos('15906'), 'APROX_TERCERO,CENTENA_TERCERO'); assert.strictEqual(tipos('99905'), 'DOS_TERCERO'); });
t('00000 y 99999 son consecutivos', () => {
  ctx.f2 = [{ numero: '0', tipo: 'PRIMERO' }]; run('ext2 = construirExtraccion(f2)');
  assert.ok(run(`premiosDeNumero('99999', ext2).some(x=>x.tipo==='APROX_PRIMERO')`));
});
t('reparto individual, 10 € y Hacienda', () => {
  ctx.parts = [
    { id: 'a', nombre: 'Pepe', numero: '72480', importe: 20 },
    { id: 'b', nombre: 'Juan', numero: '72480', importe: 10 },
    { id: 'c', nombre: 'Ana', numero: '12340', importe: 20 },
    { id: 'd', nombre: 'Ana', numero: '12345', importe: 20 }];
  const r = run('calcularResultados(parts, ext, "individual")');
  assert.strictEqual(r.totales.jugado, 70);
  assert.strictEqual(r.participaciones[0].bruto, 400000);
  assert.strictEqual(r.participaciones[0].neto, 400000 - 0.2 * 360000);
  assert.strictEqual(r.participaciones[1].bruto, 200000);
  assert.strictEqual(r.participaciones[1].neto, 200000 - 0.2 * 180000);
  const ana = r.personas.find(p => p.nombre === 'Ana');
  assert.strictEqual(ana.neto, 20); assert.strictEqual(ana.jugado, 40);
});
t('reparto en bote', () => {
  const r = run('calcularResultados(parts, ext, "bote")');
  const juan = r.personas.find(p => p.nombre === 'Juan');
  assert.ok(Math.abs(juan.neto - r.totales.neto * 10 / 70) < 0.01);
});
t('interpretar respuesta de SELAE', () => {
  ctx.d = {
    primerPremio: { decimo: '72480', prize: 40000000 }, segundoPremio: { decimo: '58303', prize: 12500000 },
    tercerosPremios: [{ decimo: '15905', prize: 5000000 }], cuartosPremios: [{ decimo: '24262' }, { decimo: '62246' }],
    quintosPremios: [{ decimo: '11840' }],
    compruebe: [{ decimo: '72480', prize: 40000000 }, { decimo: '00001', prize: 10000 }, { decimo: '44444', prize: 600000 }, { decimo: '33', prize: 10000 }]
  };
  const l = run('interpretarSelae_(d)');
  const m = Object.fromEntries(l.map(x => [x.numero, x.tipo]));
  assert.deepStrictEqual(m, { '72480': 'PRIMERO', '58303': 'SEGUNDO', '15905': 'TERCERO', '24262': 'CUARTO', '62246': 'CUARTO',
    '11840': 'QUINTO', '00001': 'PEDREA', '44444': 'QUINTO', '00033': 'PEDREA' });
});
t('interpretar la fuente de la comunidad (deduce la pedrea y comprueba el año)', () => {
  ctx.resumen = { timestamp: 1766414850, status: 4, error: 0, numero1: 72480, numero2: 58303, numero3: 15905,
    numero4: 24262, numero5: 62246, numero6: 11840, numero7: -1, numero8: -1, numero9: -1, numero10: -1,
    numero11: -1, numero12: -1, numero13: -1 };
  // € por billete (10 décimos): 00001 pedrea; 72481 aproximación; 72401 centena + pedrea; 00080 terminación + reintegro
  ctx.lista = { status: '4', '72480': '4000000', '1': '1000', '72481': '20000', '72401': '2000', '80': '1200' };
  const l = run('interpretarComunidad_(resumen, lista, "2025")');
  const m = Object.fromEntries(l.map(x => [x.numero, x.tipo]));
  assert.deepStrictEqual(m, { '72480': 'PRIMERO', '58303': 'SEGUNDO', '15905': 'TERCERO', '24262': 'CUARTO', '62246': 'CUARTO',
    '11840': 'QUINTO', '00001': 'PEDREA', '72401': 'PEDREA' });
  assert.strictEqual(run('interpretarComunidad_(resumen, lista, "2026").length'), 0, 'datos del año anterior se ignoran');
});
console.log(`\n${ok} pruebas OK`);
