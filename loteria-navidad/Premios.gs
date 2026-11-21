/**
 * Cálculo de premios del Sorteo Extraordinario de Navidad (22 de diciembre).
 *
 * Importes por DÉCIMO de 20 € (el billete son 10 décimos). Si alguien juega
 * otra cantidad, el premio se escala de forma proporcional (importe / 20).
 *
 * Este fichero no usa ningún servicio de Google: se puede probar con Node
 * (ver test/premios.test.js).
 */

var PRECIO_DECIMO = 20;
var EXENTO_POR_DECIMO = 40000; // Premios exentos de IRPF hasta 40.000 € por décimo
var TIPO_GRAVAMEN = 0.20;      // Gravamen especial del 20 % sobre el exceso
var TOTAL_EXTRACCIONES = 1807; // 1º + 2º + 3º + 2 cuartos + 8 quintos + 1.794 pedreas

var PREMIOS = {
  PRIMERO:         { euros: 400000, etiqueta: '1er premio · El Gordo', clase: 'gordo' },
  SEGUNDO:         { euros: 125000, etiqueta: '2º premio',              clase: 'mayor' },
  TERCERO:         { euros:  50000, etiqueta: '3er premio',             clase: 'mayor' },
  CUARTO:          { euros:  20000, etiqueta: '4º premio',              clase: 'mayor' },
  QUINTO:          { euros:   6000, etiqueta: '5º premio',              clase: 'mayor' },
  PEDREA:          { euros:    100, etiqueta: 'Pedrea',                 clase: 'pedrea' },
  APROX_PRIMERO:   { euros:   2000, etiqueta: 'Aproximación al 1º',     clase: 'menor' },
  APROX_SEGUNDO:   { euros:   1250, etiqueta: 'Aproximación al 2º',     clase: 'menor' },
  APROX_TERCERO:   { euros:    960, etiqueta: 'Aproximación al 3º',     clase: 'menor' },
  CENTENA_PRIMERO: { euros:    100, etiqueta: 'Centena del 1º',         clase: 'menor' },
  CENTENA_SEGUNDO: { euros:    100, etiqueta: 'Centena del 2º',         clase: 'menor' },
  CENTENA_TERCERO: { euros:    100, etiqueta: 'Centena del 3º',         clase: 'menor' },
  CENTENA_CUARTO:  { euros:    100, etiqueta: 'Centena de un 4º',       clase: 'menor' },
  DOS_PRIMERO:     { euros:    100, etiqueta: 'Dos últimas cifras del 1º', clase: 'menor' },
  DOS_SEGUNDO:     { euros:    100, etiqueta: 'Dos últimas cifras del 2º', clase: 'menor' },
  DOS_TERCERO:     { euros:    100, etiqueta: 'Dos últimas cifras del 3º', clase: 'menor' },
  REINTEGRO:       { euros:     20, etiqueta: 'Reintegro',              clase: 'reintegro' }
};

/** Normaliza un número a 5 cifras ("123" -> "00123"). Devuelve '' si no es válido. */
function normalizarNumero(valor) {
  if (valor === null || valor === undefined) return '';
  var s = String(valor).replace(/\D/g, '');
  if (!s || s.length > 5) return '';
  while (s.length < 5) s = '0' + s;
  return s;
}

function numeroVecino_(n, delta) {
  var v = (parseInt(n, 10) + delta + 100000) % 100000;
  return normalizarNumero(v);
}

/**
 * Construye la estructura de extracción a partir de filas {numero, tipo}.
 * tipo ∈ PRIMERO | SEGUNDO | TERCERO | CUARTO | QUINTO | PEDREA
 */
function construirExtraccion(filas) {
  var ext = { primero: '', segundo: '', tercero: '', cuartos: [], quintos: [], pedrea: {}, total: 0 };
  var mayores = {};
  (filas || []).forEach(function (f) {
    var n = normalizarNumero(f.numero);
    var t = String(f.tipo || '').toUpperCase().trim();
    if (!n) return;
    if (t === 'PRIMERO') { ext.primero = n; mayores[n] = true; }
    else if (t === 'SEGUNDO') { ext.segundo = n; mayores[n] = true; }
    else if (t === 'TERCERO') { ext.tercero = n; mayores[n] = true; }
    else if (t === 'CUARTO' && ext.cuartos.indexOf(n) < 0) { ext.cuartos.push(n); mayores[n] = true; }
    else if (t === 'QUINTO' && ext.quintos.indexOf(n) < 0) { ext.quintos.push(n); mayores[n] = true; }
  });
  (filas || []).forEach(function (f) {
    var n = normalizarNumero(f.numero);
    if (n && String(f.tipo || '').toUpperCase().trim() === 'PEDREA' && !mayores[n]) ext.pedrea[n] = true;
  });
  ext.total = (ext.primero ? 1 : 0) + (ext.segundo ? 1 : 0) + (ext.tercero ? 1 : 0) +
    ext.cuartos.length + ext.quintos.length + Object.keys(ext.pedrea).length;
  return ext;
}

/** Lista de premios (por décimo) que obtiene un número. Los premios son acumulables. */
function premiosDeNumero(numero, ext) {
  var n = normalizarNumero(numero);
  var lista = [];
  if (!n || !ext) return lista;
  function add(tipo) {
    var p = PREMIOS[tipo];
    lista.push({ tipo: tipo, etiqueta: p.etiqueta, euros: p.euros, clase: p.clase });
  }

  // Premios extraídos directamente
  if (n === ext.primero) add('PRIMERO');
  if (n === ext.segundo) add('SEGUNDO');
  if (n === ext.tercero) add('TERCERO');
  if (ext.cuartos.indexOf(n) >= 0) add('CUARTO');
  if (ext.quintos.indexOf(n) >= 0) add('QUINTO');
  if (ext.pedrea[n]) add('PEDREA');

  // Aproximaciones (número anterior y posterior; 00000 y 99999 son consecutivos)
  [['primero', 'APROX_PRIMERO'], ['segundo', 'APROX_SEGUNDO'], ['tercero', 'APROX_TERCERO']].forEach(function (par) {
    var p = ext[par[0]];
    if (p && (n === numeroVecino_(p, -1) || n === numeroVecino_(p, 1))) add(par[1]);
  });

  // Centenas: los 99 números restantes de la centena del 1º, 2º, 3º y de cada 4º
  var centenas = [[ext.primero, 'CENTENA_PRIMERO'], [ext.segundo, 'CENTENA_SEGUNDO'], [ext.tercero, 'CENTENA_TERCERO']];
  ext.cuartos.forEach(function (c) { centenas.push([c, 'CENTENA_CUARTO']); });
  centenas.forEach(function (par) {
    var p = par[0];
    if (p && n !== p && n.substr(0, 3) === p.substr(0, 3)) add(par[1]);
  });

  // Dos últimas cifras del 1º, 2º y 3º
  [[ext.primero, 'DOS_PRIMERO'], [ext.segundo, 'DOS_SEGUNDO'], [ext.tercero, 'DOS_TERCERO']].forEach(function (par) {
    var p = par[0];
    if (p && n !== p && n.substr(3) === p.substr(3)) add(par[1]);
  });

  // Reintegro: última cifra del 1º
  if (ext.primero && n !== ext.primero && n.charAt(4) === ext.primero.charAt(4)) add('REINTEGRO');

  return lista;
}

function redondear2_(x) { return Math.round(x * 100) / 100; }

/**
 * Calcula premios de todas las participaciones.
 * participaciones: [{id, nombre, numero, importe}]
 * modo: 'individual' (cada uno cobra lo de su número) | 'bote' (todo se reparte según lo jugado)
 */
function calcularResultados(participaciones, ext, modo) {
  var totalJugado = 0, totalBruto = 0, totalNeto = 0;
  var filas = participaciones.map(function (p) {
    var importe = Number(p.importe) || 0;
    var premios = premiosDeNumero(p.numero, ext);
    var porDecimo = premios.reduce(function (s, x) { return s + x.euros; }, 0);
    var factor = importe / PRECIO_DECIMO;
    var bruto = redondear2_(porDecimo * factor);
    var exento = EXENTO_POR_DECIMO * factor;
    var impuesto = redondear2_(Math.max(0, bruto - exento) * TIPO_GRAVAMEN);
    var neto = redondear2_(bruto - impuesto);
    totalJugado += importe; totalBruto += bruto; totalNeto += neto;
    return {
      id: p.id, nombre: p.nombre, numero: normalizarNumero(p.numero), importe: importe,
      premios: premios, porDecimo: porDecimo, bruto: bruto, impuesto: impuesto, neto: neto
    };
  });
  totalJugado = redondear2_(totalJugado); totalBruto = redondear2_(totalBruto); totalNeto = redondear2_(totalNeto);

  // Reparto final por persona
  var personas = {};
  filas.forEach(function (f) {
    var clave = String(f.nombre).trim().toLowerCase();
    if (!personas[clave]) personas[clave] = { nombre: String(f.nombre).trim(), jugado: 0, bruto: 0, neto: 0, numeros: [] };
    var per = personas[clave];
    per.jugado += f.importe; per.bruto += f.bruto; per.neto += f.neto;
    if (per.numeros.indexOf(f.numero) < 0) per.numeros.push(f.numero);
  });
  var listaPersonas = Object.keys(personas).map(function (k) {
    var per = personas[k];
    if (modo === 'bote' && totalJugado > 0) {
      var cuota = per.jugado / totalJugado;
      per.bruto = totalBruto * cuota;
      per.neto = totalNeto * cuota;
    }
    per.jugado = redondear2_(per.jugado); per.bruto = redondear2_(per.bruto); per.neto = redondear2_(per.neto);
    per.balance = redondear2_(per.neto - per.jugado);
    return per;
  }).sort(function (a, b) { return b.neto - a.neto || a.nombre.localeCompare(b.nombre); });

  return {
    modo: modo === 'bote' ? 'bote' : 'individual',
    participaciones: filas,
    personas: listaPersonas,
    totales: {
      jugado: totalJugado, bruto: totalBruto, neto: totalNeto,
      impuesto: redondear2_(totalBruto - totalNeto),
      numerosPremiados: filas.filter(function (f) { return f.porDecimo > 0; }).length,
      participaciones: filas.length, personas: listaPersonas.length
    }
  };
}

// Exportación para pruebas con Node (en Apps Script `module` no existe)
if (typeof module !== 'undefined') {
  module.exports = {
    PREMIOS: PREMIOS, normalizarNumero: normalizarNumero, construirExtraccion: construirExtraccion,
    premiosDeNumero: premiosDeNumero, calcularResultados: calcularResultados
  };
}
