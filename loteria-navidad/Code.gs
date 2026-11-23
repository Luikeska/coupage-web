/**
 * Lotería de Navidad · "Los de la Última Fila"
 *
 * App web de Google Apps Script con base de datos en Google Sheets.
 * Hojas: Participantes, Extraccion, Estado, Config (las crea `configurar()`).
 */

var HOJA_PARTICIPANTES = 'Participantes';
var HOJA_EXTRACCION = 'Extraccion';
var HOJA_ESTADO = 'Estado';
var HOJA_CONFIG = 'Config';
var CLAVE_CACHE = 'estado_app_v1';

var CONFIG_POR_DEFECTO = [
  ['ANIO', String(new Date().getFullYear()), 'Año del sorteo (22 de diciembre)'],
  ['NOMBRE_GRUPO', 'Los de la Última Fila', 'Nombre que aparece en la app'],
  ['IMPORTE_DEFECTO', '20', 'Importe por defecto en € (un décimo = 20 €)'],
  ['MODO_REPARTO', 'individual', 'individual = cada uno cobra lo de su número · bote = se suma todo y se reparte según lo jugado'],
  ['ADMIN_PIN', '1234', 'PIN para borrar participaciones y forzar actualización. ¡Cámbialo!'],
  ['FUENTE', 'auto', 'auto = descarga de loteriasyapuestas.es cada 5 min · manual = rellenas tú la hoja Extraccion'],
  ['ID_SORTEO', '', 'Opcional: id del sorteo en SELAE si la búsqueda automática falla'],
  ['ALTAS_ABIERTAS', 'si', 'si/no · se cierran solas cuando empieza el sorteo']
];

// ---------------------------------------------------------------- Web app

function doGet() {
  var cfg = leerConfig();
  var t = HtmlService.createTemplateFromFile('Index');
  t.nombreGrupo = cfg.NOMBRE_GRUPO;
  t.anio = cfg.ANIO;
  return t.evaluate()
    .setTitle('Lotería de Navidad ' + cfg.ANIO + ' · ' + cfg.NOMBRE_GRUPO)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setFaviconUrl('https://fonts.gstatic.com/s/e/notoemoji/latest/1f384/512.png');
}

/** Estado completo para la interfaz (con caché de 30 s). */
function obtenerEstado() {
  var cache = CacheService.getScriptCache();
  var enCache = cache.get(CLAVE_CACHE);
  if (enCache) return JSON.parse(enCache);

  var cfg = leerConfig();
  var participaciones = leerParticipaciones_();
  var filasExt = leerExtraccion_();
  var ext = construirExtraccion(filasExt);
  var res = calcularResultados(participaciones, ext, String(cfg.MODO_REPARTO).toLowerCase());
  var est = leerEstado();
  var fase = ext.total >= TOTAL_EXTRACCIONES ? 'terminado' : (ext.total > 0 ? 'en_curso' : 'antes');

  var salida = {
    grupo: cfg.NOMBRE_GRUPO,
    anio: cfg.ANIO,
    importeDefecto: Number(cfg.IMPORTE_DEFECTO) || 20,
    altasAbiertas: altasAbiertas_(cfg, fase),
    fase: fase,
    inicioSorteo: cfg.ANIO + '-12-22T09:00:00+01:00',
    extraccion: {
      total: ext.total, de: TOTAL_EXTRACCIONES,
      primero: ext.primero, segundo: ext.segundo, tercero: ext.tercero,
      cuartos: ext.cuartos, quintos: ext.quintos
    },
    ultimaActualizacion: textoFecha_(est.ultima_actualizacion),
    ultimoError: String(est.ultimo_error || ''),
    fuente: String(cfg.FUENTE).toLowerCase(),
    url: ScriptApp.getService().getUrl() || '',
    resultado: res
  };
  cache.put(CLAVE_CACHE, JSON.stringify(salida), 30);
  return salida;
}

function textoFecha_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
  return String(v);
}

function altasAbiertas_(cfg, fase) {
  return String(cfg.ALTAS_ABIERTAS).toLowerCase() !== 'no' && fase === 'antes';
}

/** Alta de una participación desde la app. */
function anadirParticipacion(datos) {
  datos = datos || {};
  var cfg = leerConfig();
  var nombre = String(datos.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  var numero = normalizarNumero(datos.numero);
  var importe = Math.round(Number(String(datos.importe || cfg.IMPORTE_DEFECTO).replace(',', '.')) * 100) / 100;

  if (!nombre) throw new Error('Pon tu nombre.');
  if (!numero) throw new Error('El número debe tener entre 1 y 5 cifras (00000 – 99999).');
  if (!(importe > 0) || importe > 5000) throw new Error('El importe debe estar entre 0,01 y 5.000 €.');
  if (!altasAbiertas_(cfg, construirExtraccion(leerExtraccion_()).total > 0 ? 'en_curso' : 'antes')) {
    throw new Error('Las altas están cerradas: el sorteo ya ha empezado.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var hoja = hoja_(HOJA_PARTICIPANTES);
    var id = Utilities.getUuid().slice(0, 8);
    hoja.appendRow([new Date(), nombre, "'" + numero, importe, id]);
  } finally {
    lock.releaseLock();
  }
  invalidarCache_();
  return obtenerEstado();
}

/** Borrado de una participación (requiere PIN de administración). */
function borrarParticipacion(id, pin) {
  comprobarPin_(pin);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var hoja = hoja_(HOJA_PARTICIPANTES);
    var datos = hoja.getDataRange().getValues();
    for (var i = datos.length - 1; i >= 1; i--) {
      if (String(datos[i][4]) === String(id)) { hoja.deleteRow(i + 1); break; }
    }
  } finally {
    lock.releaseLock();
  }
  invalidarCache_();
  return obtenerEstado();
}

/** Fuerza una descarga de resultados ahora mismo (requiere PIN). */
function forzarActualizacion(pin) {
  comprobarPin_(pin);
  var r = actualizarResultados_();
  var estado = obtenerEstado();
  estado.aviso = r.mensaje;
  return estado;
}

function comprobarPin_(pin) {
  if (String(pin || '') !== String(leerConfig().ADMIN_PIN)) throw new Error('PIN incorrecto.');
}

// ---------------------------------------------------------------- Instalación

/**
 * Ejecuta esta función UNA VEZ desde el editor de Apps Script:
 * crea las hojas, la configuración y el activador de cada 5 minutos.
 */
function configurar() {
  var ss = libro_();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());

  var p = asegurarHoja_(ss, HOJA_PARTICIPANTES, ['Fecha', 'Nombre', 'Numero', 'Importe', 'ID']);
  p.getRange('C:C').setNumberFormat('@');
  p.getRange('D:D').setNumberFormat('#,##0.00 "€"');
  var e = asegurarHoja_(ss, HOJA_EXTRACCION, ['Numero', 'Tipo']);
  e.getRange('A:A').setNumberFormat('@');
  e.getRange('D1').setValue('Tipos válidos: PRIMERO, SEGUNDO, TERCERO, CUARTO, QUINTO, PEDREA');
  asegurarHoja_(ss, HOJA_ESTADO, ['Clave', 'Valor']);
  var c = asegurarHoja_(ss, HOJA_CONFIG, ['Clave', 'Valor', 'Descripción']);
  var existentes = c.getDataRange().getValues().map(function (r) { return r[0]; });
  CONFIG_POR_DEFECTO.forEach(function (fila) {
    if (existentes.indexOf(fila[0]) < 0) c.appendRow(fila);
  });
  c.getRange('B:B').setNumberFormat('@');

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tareaCadaCincoMinutos') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tareaCadaCincoMinutos').timeBased().everyMinutes(5).create();

  invalidarCache_();
  console.log('Listo. Hoja de cálculo: ' + ss.getUrl());
  return ss.getUrl();
}

/** Menú en la hoja de cálculo (si el script está vinculado a ella). */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🎄 Lotería')
      .addItem('Configurar / reparar', 'configurar')
      .addItem('Actualizar resultados ahora', 'menuActualizar')
      .addItem('Ver enlace para WhatsApp', 'menuEnlace')
      .addToUi();
  } catch (e) { /* no estamos en una hoja */ }
}

function menuActualizar() {
  var r = actualizarResultados_();
  SpreadsheetApp.getUi().alert(r.mensaje);
}

function menuEnlace() {
  var cfg = leerConfig();
  var url = ScriptApp.getService().getUrl();
  if (!url) { SpreadsheetApp.getUi().alert('Primero implementa la app web (Implementar → Nueva implementación → Aplicación web).'); return; }
  var texto = '🎄 Lotería de Navidad ' + cfg.ANIO + ' · ' + cfg.NOMBRE_GRUPO + '\nApunta tu número aquí: ' + url;
  SpreadsheetApp.getUi().alert('Enlace de la app:\n' + url + '\n\nEnlace para WhatsApp:\nhttps://wa.me/?text=' + encodeURIComponent(texto));
}

// ---------------------------------------------------------------- Acceso a datos

function libro_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') ||
    (typeof SPREADSHEET_ID_POR_DEFECTO !== 'undefined' ? SPREADSHEET_ID_POR_DEFECTO : '');
  if (id) return SpreadsheetApp.openById(id);
  var activo = SpreadsheetApp.getActiveSpreadsheet();
  if (activo) return activo;
  var nuevo = SpreadsheetApp.create('Lotería de Navidad · Los de la Última Fila');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', nuevo.getId());
  return nuevo;
}

function hoja_(nombre) {
  var h = libro_().getSheetByName(nombre);
  if (!h) { configurar(); h = libro_().getSheetByName(nombre); }
  return h;
}

function asegurarHoja_(ss, nombre, cabecera) {
  var h = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  if (h.getLastRow() === 0) {
    h.getRange(1, 1, 1, cabecera.length).setValues([cabecera]).setFontWeight('bold');
    h.setFrozenRows(1);
  }
  return h;
}

function leerConfig() {
  var cfg = {};
  CONFIG_POR_DEFECTO.forEach(function (f) { cfg[f[0]] = f[1]; });
  var h = libro_().getSheetByName(HOJA_CONFIG);
  if (h && h.getLastRow() > 1) {
    h.getRange(2, 1, h.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[0] !== '' && r[1] !== '') cfg[String(r[0]).trim()] = String(r[1]).trim();
    });
  }
  return cfg;
}

function leerParticipaciones_() {
  var h = libro_().getSheetByName(HOJA_PARTICIPANTES);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, 5).getValues()
    .filter(function (r) { return r[1] !== '' && normalizarNumero(r[2]); })
    .map(function (r, i) {
      return { id: String(r[4] || ('fila' + (i + 2))), nombre: String(r[1]), numero: normalizarNumero(r[2]), importe: Number(r[3]) || 0 };
    });
}

function leerExtraccion_() {
  var h = libro_().getSheetByName(HOJA_EXTRACCION);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, 2).getValues()
    .map(function (r) { return { numero: normalizarNumero(r[0]), tipo: String(r[1]).toUpperCase().trim() }; })
    .filter(function (r) { return r.numero && r.tipo; });
}

function guardarExtraccion_(filas) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var h = hoja_(HOJA_EXTRACCION);
    if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, 2).clearContent();
    if (filas.length) {
      h.getRange(2, 1, filas.length, 2).setNumberFormat('@')
        .setValues(filas.map(function (f) { return [f.numero, f.tipo]; }));
    }
  } finally {
    lock.releaseLock();
  }
}

function leerEstado() {
  var est = {};
  var h = libro_().getSheetByName(HOJA_ESTADO);
  if (h && h.getLastRow() > 1) {
    h.getRange(2, 1, h.getLastRow() - 1, 2).getValues().forEach(function (r) { if (r[0]) est[r[0]] = r[1]; });
  }
  return est;
}

function guardarEstado_(cambios) {
  var h = hoja_(HOJA_ESTADO);
  var datos = h.getDataRange().getValues();
  Object.keys(cambios).forEach(function (k) {
    var fila = -1;
    for (var i = 1; i < datos.length; i++) if (datos[i][0] === k) { fila = i + 1; break; }
    if (fila > 0) h.getRange(fila, 2).setValue(cambios[k]);
    else { h.appendRow([k, cambios[k]]); datos.push([k, cambios[k]]); }
  });
}

function invalidarCache_() {
  CacheService.getScriptCache().remove(CLAVE_CACHE);
}
