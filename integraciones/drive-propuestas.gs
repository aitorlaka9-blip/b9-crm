/**
 * B9 CRM · Propuestas desde Google Drive
 *
 * Cada 10 minutos revisa la carpeta "B9 · Propuestas CRM" de tu Drive.
 * Cada PDF o .md nuevo se envía al CRM, que lo lee con IA y crea la propuesta
 * como "Enviada" (marcada "Por revisar"). Después el archivo se mueve a la
 * subcarpeta "Procesadas" para no volver a enviarlo.
 *
 * Instalación (una sola vez): ver README → "Propuestas automáticas desde Drive".
 */

var CARPETA = 'B9 · Propuestas CRM';

function config_() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('CRM_URL');
  var secreto = p.getProperty('INGESTA_SECRET');
  if (!url || !secreto) throw new Error('Faltan las propiedades CRM_URL e INGESTA_SECRET (Configuración del proyecto → Propiedades del script).');
  return { url: url.replace(/\/$/, ''), secreto: secreto };
}

function carpeta_(nombre, padre) {
  var it = padre ? padre.getFoldersByName(nombre) : DriveApp.getFoldersByName(nombre);
  if (it.hasNext()) return it.next();
  return padre ? padre.createFolder(nombre) : DriveApp.createFolder(nombre);
}

function revisarCarpeta() {
  var cfg = config_();
  var raiz = carpeta_(CARPETA);
  var procesadas = carpeta_('Procesadas', raiz);
  var descartadas = carpeta_('No son propuestas', raiz);
  var archivos = raiz.getFiles();
  var limite = 10; // máximo por ejecución (el script de Google tiene 6 min)

  while (archivos.hasNext() && limite-- > 0) {
    var f = archivos.next();
    var nombre = f.getName();
    if (!/\.(pdf|md|markdown)$/i.test(nombre)) continue;
    if (f.getSize() > 4 * 1024 * 1024) {
      Logger.log('Demasiado grande (más de 4 MB), súbelo a mano en el CRM: ' + nombre);
      continue;
    }
    var resp = UrlFetchApp.fetch(cfg.url + '/api/ingesta', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + cfg.secreto },
      payload: JSON.stringify({
        nombre: nombre,
        contenido_base64: Utilities.base64Encode(f.getBlob().getBytes()),
        fecha: f.getDateCreated().toISOString()
      }),
      muteHttpExceptions: true
    });
    var codigo = resp.getResponseCode();
    var cuerpo = {};
    try { cuerpo = JSON.parse(resp.getContentText()); } catch (e) {}
    Logger.log(nombre + ' → ' + codigo + ' ' + resp.getContentText());

    if (codigo === 200 && (cuerpo.estado === 'creada' || cuerpo.estado === 'duplicada')) f.moveTo(procesadas);
    else if (codigo === 200 && (cuerpo.estado === 'no_es_propuesta' || cuerpo.estado === 'ignorado')) f.moveTo(descartadas);
    // si hay error se deja en la carpeta y se reintenta en la siguiente pasada
  }
}

/** Ejecuta esta función UNA vez: crea las carpetas y programa la revisión cada 10 minutos. */
function instalar() {
  config_();
  var raiz = carpeta_(CARPETA);
  carpeta_('Procesadas', raiz);
  carpeta_('No son propuestas', raiz);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarCarpeta') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarCarpeta').timeBased().everyMinutes(10).create();
  Logger.log('Listo. Carpeta: ' + raiz.getUrl());
}
