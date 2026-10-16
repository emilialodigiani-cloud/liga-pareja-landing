// Recibe el formulario de inscripción y agrega una fila a la hoja "Inscripciones".
// Se pega en Extensiones > Apps Script de la planilla y se publica como aplicación web.

const HOJA = 'Inscripciones';
const COLUMNAS = [
  'fecha', 'liga', 'jugador1', 'whatsapp1', 'jugador2', 'whatsapp2', 'email',
  'categoria_declarada', 'partidos_desparejos_mes', 'fuente', 'consentimiento', 'estado'
];
const OBLIGATORIOS = ['liga', 'jugador1', 'whatsapp1', 'jugador2', 'whatsapp2', 'email', 'categoria_declarada'];

function doPost(e) {
  const p = e.parameter;

  // Campo trampa lleno: es un robot. Se responde ok para no darle pistas.
  if (p.sitio) return respuesta({ ok: true });

  const falta = OBLIGATORIOS.find(campo => !String(p[campo] || '').trim());
  if (falta || p.consentimiento !== 'si') return respuesta({ ok: false, error: 'datos incompletos' });
  if (!['4', '5', '6', '7', '8'].includes(p.categoria_declarada)) return respuesta({ ok: false, error: 'categoría inválida' });

  // Bloqueo para que dos inscripciones al mismo tiempo no se pisen.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const hoja = obtenerHoja();
    const fila = COLUMNAS.map(col => {
      if (col === 'fecha') return new Date();
      if (col === 'estado') return 'pendiente';
      return limpiar(p[col]);
    });
    hoja.appendRow(fila);
  } finally {
    lock.releaseLock();
  }
  return respuesta({ ok: true });
}

function obtenerHoja() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA);
    hoja.appendRow(COLUMNAS);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

// Corta textos largos y evita que un valor que empieza con = se ejecute como fórmula.
function limpiar(valor) {
  const texto = String(valor || '').trim().slice(0, 200);
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

function respuesta(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
