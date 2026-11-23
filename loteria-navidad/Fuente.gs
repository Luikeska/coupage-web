/**
 * Descarga de resultados: primero la fuente de la comunidad (JSON público) y, de respaldo,
 * la web oficial de SELAE (Loterías y Apuestas del Estado), que bloquea a Google con 403.
 *
 * Se ejecuta cada 5 minutos con un activador, pero sólo trabaja de verdad el día
 * del sorteo (22/12) entre las 8:00 y las 18:00 (hora de Madrid) y hasta que se
 * han extraído las 1.807 bolas. El resto del tiempo termina al instante.
 *
 * Los números se guardan en la hoja "Extraccion". Si la web oficial cambia de
 * formato o bloquea a Google, pon FUENTE = manual en la hoja "Config" y apunta
 * los números a mano en "Extraccion": la app calcula igual.
 */

var SELAE_BASE = 'https://www.loteriasyapuestas.es/servicios/';
var SELAE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Referer': 'https://www.loteriasyapuestas.es/es/resultados/loteria-nacional'
};

/** Función que llama el activador cada 5 minutos. */
function tareaCadaCincoMinutos() {
  var cfg = leerConfig();
  if (String(cfg.FUENTE).toLowerCase() === 'manual') return;
  if (!esVentanaSorteo_(cfg)) return;
  if (leerEstado().estado === 'terminado') return;
  actualizarResultados_();
}

function esVentanaSorteo_(cfg) {
  var ahora = new Date();
  var dia = Utilities.formatDate(ahora, 'Europe/Madrid', 'yyyy-MM-dd');
  var hora = Number(Utilities.formatDate(ahora, 'Europe/Madrid', 'H'));
  return dia === cfg.ANIO + '-12-22' && hora >= 8 && hora < 18;
}

/** Descarga, interpreta y guarda los resultados. Devuelve un pequeño resumen. */
function actualizarResultados_() {
  var cfg = leerConfig();
  var resumen = { ok: false, mensaje: '', extraidos: 0 };
  try {
    // 1º la fuente de la comunidad; si falla o aún no trae el sorteo de este año, SELAE.
    var lista = [], id = 'comunidad', errores = [];
    try {
      var c = descargarComunidad_();
      lista = interpretarComunidad_(c.resumen, c.lista, cfg.ANIO);
    } catch (e) { errores.push(e.message); }
    if (!lista.length) {
      try {
        id = String(cfg.ID_SORTEO || '').trim() || buscarIdSorteo_(cfg.ANIO);
        if (!id) throw new Error('No encuentro el sorteo de Navidad ' + cfg.ANIO + ' en la web de SELAE.');
        lista = interpretarSelae_(descargarPremios_(id));
      } catch (e) { errores.push(e.message); }
    }
    if (!lista.length && errores.length) throw new Error(errores.join(' · '));
    if (lista.length) guardarExtraccion_(lista);
    var ext = construirExtraccion(lista.length ? lista : leerExtraccion_());
    resumen.ok = true;
    resumen.extraidos = ext.total;
    resumen.mensaje = 'Actualizado: ' + ext.total + ' de ' + TOTAL_EXTRACCIONES + ' números.';
    guardarEstado_({
      estado: ext.total >= TOTAL_EXTRACCIONES ? 'terminado' : (ext.total > 0 ? 'en_curso' : 'antes'),
      ultima_actualizacion: new Date().toISOString(),
      ultimo_error: '',
      extraidos: ext.total,
      id_sorteo: id
    });
  } catch (err) {
    resumen.mensaje = String(err && err.message || err);
    guardarEstado_({ ultimo_error: resumen.mensaje, ultimo_intento: new Date().toISOString() });
    console.warn('Error actualizando resultados: ' + resumen.mensaje);
  }
  invalidarCache_();
  return resumen;
}

function pedirJson_(url) {
  var res = UrlFetchApp.fetch(url, { headers: SELAE_HEADERS, muteHttpExceptions: true, followRedirects: true });
  var code = res.getResponseCode();
  var texto = res.getContentText();
  if (code !== 200) throw new Error('SELAE respondió ' + code + ' en ' + url.replace(SELAE_BASE, ''));
  try { return JSON.parse(texto); }
  catch (e) { throw new Error('SELAE no devolvió JSON (¿bloqueo o cambio de formato?)'); }
}

/** Busca el identificador interno del sorteo del 22 de diciembre del año indicado. */
function buscarIdSorteo_(anio) {
  var props = PropertiesService.getScriptProperties();
  var guardado = props.getProperty('ID_SORTEO_' + anio);
  if (guardado) return guardado;
  var fecha = anio + '1222';
  var urls = [
    SELAE_BASE + 'buscadorSorteos?game_id=LNAC&celebrados=true&fechaInicioInclusiva=' + fecha + '&fechaFinInclusiva=' + fecha,
    SELAE_BASE + 'buscadorSorteos?game_id=LNAC&celebrados=false&fechaInicioInclusiva=' + fecha + '&fechaFinInclusiva=' + fecha
  ];
  for (var i = 0; i < urls.length; i++) {
    try {
      var r = pedirJson_(urls[i]);
      var arr = Array.isArray(r) ? r : (r && (r.sorteos || r.resultados || r.data)) || [];
      for (var j = 0; j < arr.length; j++) {
        var s = arr[j];
        var f = String(s.fecha_sorteo || s.fecha || '');
        var idS = s.id_sorteo || s.idSorteo || s.id;
        if (idS && (f.indexOf(anio + '-12-22') === 0 || arr.length === 1)) {
          props.setProperty('ID_SORTEO_' + anio, String(idS));
          return String(idS);
        }
      }
    } catch (e) { console.warn(e.message); }
  }
  return '';
}

function descargarPremios_(id) {
  var urls = [
    SELAE_BASE + 'premioDecimoProvisionalWeb?idsorteo=' + encodeURIComponent(id),
    SELAE_BASE + 'premioDecimoWeb?idsorteo=' + encodeURIComponent(id)
  ];
  var mejor = null, mejorN = -1, ultimoError = null;
  urls.forEach(function (u) {
    try {
      var d = pedirJson_(u);
      var n = interpretarSelae_(d).length;
      if (n > mejorN) { mejor = d; mejorN = n; }
    } catch (e) { ultimoError = e; }
  });
  if (!mejor && ultimoError) throw ultimoError;
  return mejor || {};
}

// ------------------------------------------------------------ Fuente principal
// JSON público que mantiene la comunidad desde que El País cerró su API:
// https://github.com/pclemente/NumerosLoteriaNavidad
var COMUNIDAD_BASE = 'https://api-loteria.pabloclementeperez.com/output/';

function descargarComunidad_() {
  function pedir(fichero) {
    var res = UrlFetchApp.fetch(COMUNIDAD_BASE + fichero, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) throw new Error('La fuente de la comunidad respondió ' + res.getResponseCode() + ' en ' + fichero);
    try { return JSON.parse(res.getContentText()); }
    catch (e) { throw new Error('La fuente de la comunidad no devolvió JSON en ' + fichero); }
  }
  return { resumen: pedir('LoteriaNavidadResumen.json'), lista: pedir('LoteriaNavidad.json') };
}

/** Año de los datos de la fuente de la comunidad (campo year o, si no, timestamp en hora de Madrid). */
function anioComunidad_(resumen, lista) {
  var y = (resumen && resumen.year) || (lista && lista.year);
  if (y) return String(y);
  var ts = Number(resumen && resumen.timestamp);
  if (!ts) return '';
  return String(new Date((ts + 3600) * 1000).getUTCFullYear()); // +1 h (Madrid en diciembre)
}

/**
 * Convierte la fuente de la comunidad en filas {numero, tipo}.
 * - resumen: numero1 = 1º, numero2 = 2º, numero3 = 3º, numero4-5 = 4º, numero6-13 = 5º (-1 si aún no ha salido).
 * - lista: { "numero": "euros por billete de 10 décimos", ... } con todo lo que cobra cada número.
 *   La pedrea no viene marcada: es el número que cobra 100 €/décimo más de lo que explican los premios mayores.
 * Devuelve [] si los datos no son del año pedido (antes del sorteo siguen siendo los del año anterior).
 */
function interpretarComunidad_(resumen, lista, anio) {
  if (!resumen || Number(resumen.error)) return [];
  if (anio && anioComunidad_(resumen, lista) !== String(anio)) return [];
  var filas = [], mayores = {};
  for (var i = 1; i <= 13; i++) {
    var v = resumen['numero' + i];
    if (v === undefined || v === null || v === '' || Number(v) < 0) continue;
    var n = normalizarNumero(v);
    if (!n || mayores[n]) continue;
    mayores[n] = true;
    filas.push({ numero: n, tipo: i === 1 ? 'PRIMERO' : i === 2 ? 'SEGUNDO' : i === 3 ? 'TERCERO' : i <= 5 ? 'CUARTO' : 'QUINTO' });
  }
  var ext = construirExtraccion(filas);
  Object.keys(lista || {}).forEach(function (k) {
    if (!/^\d{1,5}$/.test(k)) return; // status, error, timestamp, year…
    var n = normalizarNumero(k);
    if (!n || mayores[n]) return;
    var porDecimo = Number(lista[k]) / 10;
    var explicado = premiosDeNumero(n, ext).reduce(function (s, p) { return s + p.euros; }, 0);
    if (porDecimo - explicado >= PREMIOS.PEDREA.euros) filas.push({ numero: n, tipo: 'PEDREA' });
  });
  return filas;
}

/**
 * Convierte la respuesta de SELAE en filas {numero, tipo}. Es tolerante con
 * variaciones de formato: primerPremio / segundoPremio / tercerosPremios /
 * cuartosPremios / quintosPremios y la lista "compruebe" con la pedrea.
 */
function interpretarSelae_(d) {
  var filas = [];
  if (!d || typeof d !== 'object') return filas;
  var vistos = {};
  function numDe(x) {
    if (x === null || x === undefined) return '';
    if (typeof x !== 'object') return normalizarNumero(x);
    return normalizarNumero(x.decimo || x.numero || x.number || x.combinacion || '');
  }
  function poner(x, tipo) {
    var n = numDe(x);
    if (!n || vistos[n]) return;
    vistos[n] = true;
    filas.push({ numero: n, tipo: tipo });
  }
  function lista(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

  lista(d.primerPremio).forEach(function (x) { poner(x, 'PRIMERO'); });
  lista(d.segundoPremio).forEach(function (x) { poner(x, 'SEGUNDO'); });
  lista(d.tercerosPremios || d.tercerPremio).forEach(function (x) { poner(x, 'TERCERO'); });
  lista(d.cuartosPremios || d.cuartoPremio).forEach(function (x) { poner(x, 'CUARTO'); });
  lista(d.quintosPremios || d.quintoPremio).forEach(function (x) { poner(x, 'QUINTO'); });

  // "compruebe": números extraídos con su premio por décimo (normalmente en céntimos)
  var comp = lista(d.compruebe);
  if (comp.length && comp.length <= 2500) {
    var escala = 0.01; // céntimos -> euros
    var gordo = lista(d.primerPremio)[0];
    if (gordo && Number(gordo.prize) > 0) escala = PREMIOS.PRIMERO.euros / Number(gordo.prize);
    var porImporte = { 400000: 'PRIMERO', 125000: 'SEGUNDO', 50000: 'TERCERO', 20000: 'CUARTO', 6000: 'QUINTO' };
    comp.forEach(function (x) {
      var euros = Math.round((Number(x.prize) || 0) * escala);
      if (x.prize !== undefined && euros <= 0) return;
      poner(x, porImporte[euros] || 'PEDREA');
    });
  }
  return filas;
}

/**
 * Prueba las dos fuentes con el sorteo de Navidad de un año anterior (por defecto 2025).
 * No escribe nada en la hoja: solo muestra en el registro lo que llega a Google.
 * Ejecútala desde el editor: función «probarFuente».
 */
function probarFuente(anio) {
  anio = String(anio || '2025');
  function resumir(nombre, lista) {
    var porTipo = {};
    lista.forEach(function (x) { porTipo[x.tipo] = (porTipo[x.tipo] || 0) + 1; });
    console.log(nombre + ': ' + lista.length + ' números · ' + JSON.stringify(porTipo));
    lista.filter(function (x) { return x.tipo !== 'PEDREA'; }).forEach(function (x) { console.log('  ' + x.tipo + ': ' + x.numero); });
  }
  try {
    var c = descargarComunidad_();
    console.log('Comunidad: datos del año ' + anioComunidad_(c.resumen, c.lista) + ', estado ' + c.resumen.status);
    resumir('Comunidad ' + anio, interpretarComunidad_(c.resumen, c.lista, anio));
  } catch (e) { console.warn('Comunidad: ' + e.message); }
  try {
    var id = buscarIdSorteo_(anio);
    if (!id) throw new Error('no encuentro el sorteo (¿bloqueo o cambio de formato?)');
    resumir('SELAE ' + anio, interpretarSelae_(descargarPremios_(id)));
  } catch (e) { console.warn('SELAE: ' + e.message); }
}
