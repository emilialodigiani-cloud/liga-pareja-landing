// Liga Pareja: inscripción a la liga y app de la liga (cargar, confirmar, tabla y fixture).
// Se pega en Extensiones > Apps Script de la planilla y se publica como aplicación web.
// La planilla es el back office: el organizador ve y corrige todo ahí, y usa el menú "Liga Pareja".

const URL_APP = 'https://liga-pareja-landing.vercel.app/liga/';

// Columnas de cada hoja. Si una hoja no existe, se crea con estos encabezados.
const HOJAS = {
  Ligas: ['id', 'nombre', 'categoria', 'dia', 'hora', 'canchas', 'primera_fecha', 'fecha_libre',
    'estado'],
  Inscripciones: ['fecha', 'liga', 'jugador1', 'whatsapp1', 'jugador2', 'whatsapp2', 'email',
    'categoria_declarada', 'partidos_desparejos_mes', 'fuente', 'consentimiento', 'estado'],
  Parejas: ['id', 'liga', 'nombre', 'jugador1', 'jugador2'],
  Jugadores: ['id', 'liga', 'pareja', 'nombre', 'whatsapp', 'codigo', 'link', 'mandar_link'],
  Partidos: ['id', 'liga', 'fase', 'fecha', 'dia', 'hora', 'cancha', 'pareja_a', 'pareja_b', 'sets',
    'estado', 'cargado_por', 'cargado_el', 'respondido_por', 'respondido_el', 'motivo_rechazo', 'se_presento'],
  Tabla: ['liga', 'posicion', 'pareja', 'pj', 'pg', 'pp', 'puntos', 'games_favor', 'games_contra', 'diferencia']
};
const OBLIGATORIOS = ['liga', 'jugador1', 'whatsapp1', 'jugador2', 'whatsapp2', 'email', 'categoria_declarada'];

// Estados de un partido. "En juego" no se guarda: la página lo muestra según la hora.
const AGENDADO = 'agendado', CARGADO = 'cargado', CONFIRMADO = 'confirmado', DISPUTA = 'en disputa', CANCELADO = 'cancelado';

// ---------- Web: lo que piden la landing y la app de la liga ----------

// GET ?liga=ID muestra la liga pública. GET ?j=CODIGO suma los partidos y rivales de ese jugador.
function doGet(e) {
  try {
    return respuesta(verLiga(e.parameter || {}));
  } catch (err) {
    return respuesta({ ok: false, error: err.message });
  }
}

// POST sin "accion" es una inscripción de la landing. Con accion: cargar, confirmar o rechazar.
function doPost(e) {
  const p = e.parameter;
  if (!p.accion) return inscribir(p);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const acciones = { cargar: cargarResultado, confirmar: confirmarResultado, rechazar: rechazarResultado };
    if (!acciones[p.accion]) throw new Error('Acción desconocida.');
    acciones[p.accion](p);
    return respuesta(verLiga({ j: p.j }));
  } catch (err) {
    return respuesta({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function inscribir(p) {
  // Campo trampa lleno: es un robot. Se responde ok para no darle pistas.
  if (p.sitio) return respuesta({ ok: true });

  const falta = OBLIGATORIOS.find(campo => !String(p[campo] || '').trim());
  if (falta || p.consentimiento !== 'si') return respuesta({ ok: false, error: 'datos incompletos' });
  if (!['4', '5', '6', '7', '8'].includes(p.categoria_declarada)) return respuesta({ ok: false, error: 'categoría inválida' });

  // Bloqueo para que dos inscripciones al mismo tiempo no se pisen.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    agregar('Inscripciones', HOJAS.Inscripciones.reduce((fila, col) => {
      if (col === 'fecha') fila[col] = new Date();
      else if (col === 'estado') fila[col] = 'pendiente';
      else fila[col] = limpiar(p[col]);
      return fila;
    }, {}));
  } finally {
    lock.releaseLock();
  }
  return respuesta({ ok: true });
}

// Arma lo que ve la página. Nunca incluye teléfonos, salvo los de los rivales del propio jugador.
function verLiga(p) {
  const jugadores = leer('Jugadores');
  const yo = p.j ? jugadores.find(j => String(j.codigo) === String(p.j)) : null;
  if (p.j && !yo) throw new Error('Este link no funciona. Pedile uno nuevo al organizador.');

  const ligas = leer('Ligas');
  const liga = yo ? ligas.find(l => l.id === yo.liga)
    : p.liga ? ligas.find(l => l.id === p.liga)
    : ligas.find(l => l.estado === 'activa');
  if (!liga) throw new Error('No encontramos la liga.');

  const parejas = leer('Parejas').filter(x => x.liga === liga.id);
  const partidos = leer('Partidos').filter(x => x.liga === liga.id);
  const parejaDe = id => (jugadores.find(j => j.id === id) || {}).pareja || '';

  const datos = {
    ok: true,
    hoy: textoDia(new Date()),
    liga: {
      id: liga.id, nombre: liga.nombre, categoria: String(liga.categoria), hora: textoHora(liga.hora),
      fechaLibre: Number(liga.fecha_libre) || null, primeraFecha: textoDia(liga.primera_fecha)
    },
    parejas: parejas.map(x => ({ id: x.id, nombre: x.nombre })),
    partidos: partidos.map(x => ({
      id: x.id, fase: x.fase, fecha: Number(x.fecha), dia: textoDia(x.dia), hora: textoHora(x.hora),
      cancha: x.cancha, a: x.pareja_a, b: x.pareja_b, sets: String(x.sets || ''), estado: x.estado,
      cargo: parejaDe(x.cargado_por), motivo: x.estado === DISPUTA ? x.motivo_rechazo : '', sePresento: x.se_presento
    })),
    tabla: calcularTabla(liga, parejas, partidos)
  };

  if (yo) {
    const rivales = new Set(partidos
      .filter(x => x.pareja_a === yo.pareja || x.pareja_b === yo.pareja)
      .map(x => x.pareja_a === yo.pareja ? x.pareja_b : x.pareja_a));
    datos.yo = { nombre: nombreDePila(yo.nombre), pareja: yo.pareja };
    datos.contactos = {};
    jugadores.filter(j => rivales.has(j.pareja)).forEach(j => {
      (datos.contactos[j.pareja] = datos.contactos[j.pareja] || []).push({ nombre: nombreDePila(j.nombre), wa: numeroWhatsApp(j.whatsapp) });
    });
  }
  return datos;
}

// ---------- Cargar, confirmar y rechazar ----------

function cargarResultado(p) {
  const { yo, partido } = jugadorYPartido(p);
  const cargoMiPareja = partido.estado === CARGADO && parejaDeJugador(partido.cargado_por) === yo.pareja;
  if (partido.estado !== AGENDADO && !cargoMiPareja) throw new Error('Este partido ya tiene un resultado cargado.');
  if (textoDia(partido.dia) > textoDia(new Date())) throw new Error('Este partido todavía no se jugó.');

  // Los sets llegan desde el lado de quien carga ("nosotros-ellos"); se guardan desde el lado de la pareja A.
  const sets = leerSets(p.sets);
  const desdeA = yo.pareja === partido.pareja_a ? sets : sets.map(([x, y]) => [y, x]);
  actualizar('Partidos', partido, {
    sets: texto(desdeA.map(s => s.join('-')).join(' ')), estado: CARGADO,
    cargado_por: yo.id, cargado_el: new Date(), respondido_por: '', respondido_el: '', motivo_rechazo: ''
  });
}

function confirmarResultado(p) {
  const { yo, partido } = esperandoMiRespuesta(p);
  actualizar('Partidos', partido, { estado: CONFIRMADO, respondido_por: yo.id, respondido_el: new Date() });
  recalcularTabla();
}

function rechazarResultado(p) {
  const { yo, partido } = esperandoMiRespuesta(p);
  actualizar('Partidos', partido, {
    estado: DISPUTA, respondido_por: yo.id, respondido_el: new Date(), motivo_rechazo: limpiar(p.motivo)
  });
}

function esperandoMiRespuesta(p) {
  const datos = jugadorYPartido(p);
  if (datos.partido.estado !== CARGADO) throw new Error('Este partido no tiene un resultado para confirmar.');
  if (parejaDeJugador(datos.partido.cargado_por) === datos.yo.pareja) throw new Error('Lo tiene que confirmar la pareja rival.');
  return datos;
}

function jugadorYPartido(p) {
  const yo = leer('Jugadores').find(j => j.codigo && String(j.codigo) === String(p.j || ''));
  if (!yo) throw new Error('Este link no funciona. Pedile uno nuevo al organizador.');
  const partido = leer('Partidos').find(x => x.id === p.partido);
  if (!partido || (partido.pareja_a !== yo.pareja && partido.pareja_b !== yo.pareja)) throw new Error('Ese partido no es tuyo.');
  return { yo, partido };
}

function parejaDeJugador(id) {
  return (leer('Jugadores').find(j => j.id === id) || {}).pareja || '';
}

// "6-4 3-6 10-8" → [[6,4],[3,6],[10,8]]. Dos o tres sets; el tercero puede ser súper tie-break.
function leerSets(textoSets) {
  const sets = String(textoSets || '').trim().split(/\s+/).map(s => s.split('-').map(Number));
  if (sets.length < 2 || sets.length > 3 || sets.some(s => s.length !== 2 || s.some(n => !Number.isInteger(n) || n < 0))) {
    throw new Error('Revisá el resultado: tienen que ser dos o tres sets.');
  }
  const setValido = ([x, y]) => {
    const alto = Math.max(x, y), bajo = Math.min(x, y);
    return (alto === 6 && bajo <= 4) || (alto === 7 && (bajo === 5 || bajo === 6));
  };
  const superTieBreak = ([x, y]) => Math.max(x, y) >= 10 && Math.abs(x - y) >= 2 && (Math.max(x, y) === 10 || Math.abs(x - y) === 2);
  sets.forEach((s, i) => {
    if (!setValido(s) && !(i === 2 && superTieBreak(s))) throw new Error('Revisá el set ' + (i + 1) + ': ' + s.join('-') + ' no es un resultado posible.');
  });
  const ganados = sets.map(([x, y]) => x > y);
  if (ganados[0] === ganados[1] && sets.length === 3) throw new Error('Si una pareja ganó los dos primeros sets, no hay tercer set.');
  if (ganados[0] !== ganados[1] && sets.length === 2) throw new Error('Falta el tercer set.');
  return sets;
}

// Games de cada lado. El súper tie-break cuenta como un game para quien lo gana.
function contarGames(sets) {
  return sets.reduce(([ga, gb], [x, y]) => Math.max(x, y) >= 10 ? [ga + (x > y ? 1 : 0), gb + (y > x ? 1 : 0)] : [ga + x, gb + y], [0, 0]);
}

// Quién ganó un partido: la pareja A, la B o nadie todavía.
function ganador(partido) {
  if (partido.estado === CANCELADO) return partido.se_presento || '';
  if (partido.estado !== CONFIRMADO) return '';
  const sets = leerSets(partido.sets);
  const setsA = sets.filter(([x, y]) => x > y).length;
  return setsA >= 2 ? partido.pareja_a : partido.pareja_b;
}

// ---------- Tabla ----------

// Puntos: ganar en 2 sets da 3 al ganador y 0 al perdedor; en 3 sets, 2 al ganador y 1 al perdedor.
// Si una pareja no se presenta, la que se presentó suma 3, como si hubiera ganado en 2 sets.
const PUNTOS = { dosSets: [3, 0], tresSets: [2, 1] };

// Suman los partidos confirmados y los cancelados.
function calcularTabla(liga, parejas, partidos) {
  const filas = {};
  parejas.forEach(x => { filas[x.id] = { pareja: x.id, nombre: x.nombre, pj: 0, pg: 0, pp: 0, puntos: 0, gf: 0, gc: 0 }; });

  partidos.filter(x => x.fase === 'liga' && (x.estado === CONFIRMADO || x.estado === CANCELADO)).forEach(x => {
    const a = filas[x.pareja_a], b = filas[x.pareja_b];
    if (!a || !b) return;
    const gana = ganador(x);
    if (!gana) return;
    const sets = x.estado === CONFIRMADO ? leerSets(x.sets) : [];
    const [ga, gb] = contarGames(sets);
    const [ptsGanador, ptsPerdedor] = sets.length === 3 ? PUNTOS.tresSets : PUNTOS.dosSets;
    [[a, ga, gb], [b, gb, ga]].forEach(([fila, favor, contra]) => {
      const gano = fila.pareja === gana;
      fila.pj++; fila.gf += favor; fila.gc += contra;
      if (gano) { fila.pg++; fila.puntos += ptsGanador; }
      else { fila.pp++; fila.puntos += ptsPerdedor; }
    });
  });

  return Object.values(filas)
    .map(f => Object.assign(f, { dif: f.gf - f.gc }))
    .sort((x, y) => y.puntos - x.puntos || y.dif - x.dif || y.gf - x.gf || x.nombre.localeCompare(y.nombre))
    .map((f, i) => Object.assign(f, { posicion: i + 1 }));
}

// Escribe la hoja Tabla de todas las ligas, para que el organizador la vea en la planilla.
function recalcularTabla() {
  const parejas = leer('Parejas'), partidos = leer('Partidos');
  const filas = [];
  leer('Ligas').forEach(liga => {
    calcularTabla(liga, parejas.filter(x => x.liga === liga.id), partidos.filter(x => x.liga === liga.id)).forEach(f => {
      filas.push({ liga: liga.id, posicion: f.posicion, pareja: f.nombre, pj: f.pj, pg: f.pg, pp: f.pp,
        puntos: f.puntos, games_favor: f.gf, games_contra: f.gc, diferencia: f.dif });
    });
  });
  reemplazar('Tabla', filas);
}

// ---------- Fixture y playoff ----------

// Todos contra todos con el método del círculo. Salta la fecha libre y reparte canchas en orden.
function armarFixture(ligaId) {
  const liga = buscarLiga(ligaId);
  if (leer('Partidos').some(x => x.liga === liga.id)) throw new Error('La liga ' + liga.id + ' ya tiene fixture.');
  const ids = leer('Parejas').filter(x => x.liga === liga.id).map(x => x.id);
  if (ids.length < 4) throw new Error('Hacen falta al menos 4 parejas en la hoja Parejas.');
  if (ids.length % 2) ids.push(null); // Con parejas impares, una descansa cada fecha.

  const canchas = String(liga.canchas || 'Cancha 1').split(',').map(c => c.trim()).filter(String);
  const libre = Number(liga.fecha_libre) || 0;
  const ronda = ids.slice();
  let fecha = 0, n = 1;
  for (let r = 0; r < ids.length - 1; r++) {
    fecha++;
    if (fecha === libre) fecha++;
    const cruces = [];
    for (let i = 0; i < ronda.length / 2; i++) {
      const a = ronda[i], b = ronda[ronda.length - 1 - i];
      if (a && b) cruces.push(r % 2 ? [b, a] : [a, b]);
    }
    cruces.forEach(([a, b], k) => agregar('Partidos', partidoNuevo(liga, 'liga', fecha, n++, a, b, canchas[k % canchas.length])));
    ronda.splice(1, 0, ronda.pop()); // Rota todas menos la primera.
  }
  return fecha;
}

// Primero cruza por posición (1º-8º, 4º-5º, 2º-7º, 3º-6º) y después a los ganadores.
function armarPlayoff(ligaId) {
  const liga = buscarLiga(ligaId);
  const partidos = leer('Partidos').filter(x => x.liga === liga.id);
  const deLiga = partidos.filter(x => x.fase === 'liga');
  if (!deLiga.length) throw new Error('Primero hay que armar el fixture.');
  const fases = ['cuartos', 'semifinal', 'final'];
  const jugadas = fases.filter(f => partidos.some(x => x.fase === f));
  // El playoff va después de la última fecha jugada o de la fecha libre, la que venga después.
  const ultimaFecha = Math.max.apply(null, partidos.map(x => Number(x.fecha)).concat(Number(liga.fecha_libre) || 0));
  const canchas = String(liga.canchas || 'Cancha 1').split(',').map(c => c.trim()).filter(String);
  let cruces;

  if (!jugadas.length) {
    const pendientes = deLiga.filter(x => x.estado !== CONFIRMADO && x.estado !== CANCELADO).length;
    if (pendientes) throw new Error('Faltan ' + pendientes + ' partidos de la liga por confirmar o cancelar.');
    const tabla = calcularTabla(liga, leer('Parejas').filter(x => x.liga === liga.id), partidos).map(f => f.pareja);
    if (tabla.length !== 8 && tabla.length !== 4) throw new Error('El playoff automático necesita 4 u 8 parejas.');
    const orden = tabla.length === 8 ? [[0, 7], [3, 4], [1, 6], [2, 5]] : [[0, 3], [1, 2]];
    cruces = orden.map(([x, y]) => [tabla[x], tabla[y]]);
  } else {
    const anterior = jugadas[jugadas.length - 1];
    if (anterior === 'final') throw new Error('El playoff ya terminó.');
    const ronda = partidos.filter(x => x.fase === anterior);
    const ganadores = ronda.map(ganador);
    if (ganadores.some(g => !g)) throw new Error('Faltan resultados confirmados en ' + anterior + '.');
    cruces = [];
    for (let i = 0; i < ganadores.length; i += 2) cruces.push([ganadores[i], ganadores[i + 1]]);
  }

  const fase = fases[fases.length - Math.log2(cruces.length) - 1];
  let n = partidos.length + 1;
  cruces.forEach(([a, b], k) => agregar('Partidos', partidoNuevo(liga, fase, ultimaFecha + 1, n++, a, b, canchas[k % canchas.length])));
  return fase;
}

function partidoNuevo(liga, fase, fecha, n, a, b, cancha) {
  const dia = new Date(liga.primera_fecha);
  dia.setDate(dia.getDate() + 7 * (fecha - 1));
  return { id: liga.id + '-' + n, liga: liga.id, fase, fecha, dia, hora: texto(textoHora(liga.hora)), cancha,
    pareja_a: a, pareja_b: b, estado: AGENDADO };
}

function buscarLiga(ligaId) {
  const ligas = leer('Ligas');
  const liga = ligaId ? ligas.find(l => l.id === ligaId) : ligas.length === 1 ? ligas[0] : null;
  if (!liga) throw new Error(ligaId ? 'No hay una liga con id ' + ligaId + ' en la hoja Ligas.' : 'Indicá el id de la liga.');
  return liga;
}

// ---------- Inscripciones y links personales ----------

// Las inscripciones en estado "aceptada" pasan a Parejas y Jugadores, cada jugador con su link.
function pasarInscripciones() {
  const ligas = leer('Ligas').map(l => l.id);
  const parejas = leer('Parejas');
  let pasadas = 0;
  leer('Inscripciones').filter(x => x.estado === 'aceptada').forEach(x => {
    if (!ligas.includes(x.liga)) throw new Error('Falta la liga "' + x.liga + '" en la hoja Ligas.');
    const id = x.liga + '-p' + (parejas.filter(y => y.liga === x.liga).length + 1);
    const pareja = { id, liga: x.liga, nombre: apellido(x.jugador1) + ' / ' + apellido(x.jugador2), jugador1: x.jugador1, jugador2: x.jugador2 };
    parejas.push(pareja);
    agregar('Parejas', pareja);
    agregarJugador(pareja, x.jugador1, x.whatsapp1, 1);
    agregarJugador(pareja, x.jugador2, x.whatsapp2, 2);
    actualizar('Inscripciones', x, { estado: 'en la liga' });
    pasadas++;
  });
  return pasadas;
}

function agregarJugador(pareja, nombre, whatsapp, n) {
  const codigo = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const link = URL_APP + '?j=' + codigo;
  const mensaje = 'Hola ' + nombreDePila(nombre) + ', este es tu link de la liga. Con él ves tus partidos y la tabla, ' +
    'y cargás o confirmás resultados. Es personal, no lo compartas: ' + link;
  agregar('Jugadores', {
    id: pareja.id + '-j' + n, liga: pareja.liga, pareja: pareja.id, nombre, whatsapp: texto(whatsapp),
    codigo: texto(codigo), link, mandar_link: 'https://wa.me/' + numeroWhatsApp(whatsapp) + '?text=' + encodeURIComponent(mensaje)
  });
}

// Si un link se filtró, se borra el código de ese jugador en la hoja y este menú le genera uno nuevo.
function regenerarLinks() {
  let nuevos = 0;
  leer('Jugadores').filter(j => !j.codigo).forEach(j => {
    const codigo = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    const link = URL_APP + '?j=' + codigo;
    const mensaje = 'Hola ' + nombreDePila(j.nombre) + ', este es tu nuevo link de la liga. El anterior ya no funciona: ' + link;
    actualizar('Jugadores', j, { codigo: texto(codigo), link,
      mandar_link: 'https://wa.me/' + numeroWhatsApp(j.whatsapp) + '?text=' + encodeURIComponent(mensaje) });
    nuevos++;
  });
  return nuevos;
}

// ---------- Liga de prueba ----------

// Ocho parejas inventadas, fixture armado y las primeras fechas jugadas, para probar la app de punta a punta.
function crearLigaDePrueba() {
  const ID = 'prueba';
  ['Parejas', 'Jugadores', 'Partidos'].forEach(nombre => reemplazar(nombre, leer(nombre).filter(x => x.liga !== ID)));
  reemplazar('Ligas', leer('Ligas').filter(x => x.id !== ID));

  // La fecha 3 es el último martes; la 4, el próximo.
  const hoy = new Date();
  const martes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 5) % 7));
  const primera = new Date(martes.getFullYear(), martes.getMonth(), martes.getDate() - 14);
  agregar('Ligas', { id: ID, nombre: 'Liga de prueba · Martes sexta', categoria: 6, dia: 'martes', hora: texto('22:00'),
    canchas: 'Cancha 2, Cancha 3, Cancha 4, Cancha 5', primera_fecha: primera, fecha_libre: 8,
    estado: 'activa' });

  const nombres = [['Lucía Ruiz', 'Paula Ferrari'], ['Martín Sosa', 'Diego Medina'], ['Sofía Luna', 'Carla Vera'],
    ['Juan Paz', 'Tomás Correa'], ['Nico Díaz', 'Ariel Ortiz'], ['Fede Gómez', 'Leo Ibarra'],
    ['Agus Rey', 'Mateo Molina'], ['Santi Castro', 'Bruno Benítez']];
  nombres.forEach(([j1, j2], i) => {
    const pareja = { id: ID + '-p' + (i + 1), liga: ID, nombre: apellido(j1) + ' / ' + apellido(j2), jugador1: j1, jugador2: j2 };
    agregar('Parejas', pareja);
    agregarJugador(pareja, j1, '221 000 ' + String(1000 + i * 2), 1);
    agregarJugador(pareja, j2, '221 000 ' + String(1001 + i * 2), 2);
  });
  armarFixture(ID);

  // Resultados de las fechas 1 a 3. La pareja 1 (Ruiz / Ferrari) tiene la fecha 3 sin cargar.
  const sets = ['6-4 6-3', '3-6 6-4 10-7', '6-2 6-1', '7-5 6-4', '4-6 6-3 6-4', '6-3 7-6', '2-6 4-6', '6-4 6-4'];
  const jugadores = leer('Jugadores');
  const jugadorDe = pareja => jugadores.find(j => j.pareja === pareja).id;
  leer('Partidos').filter(x => x.liga === ID && Number(x.fecha) <= 3).forEach((x, i) => {
    const cargo = jugadorDe(x.pareja_a), respondio = jugadorDe(x.pareja_b);
    const uno = x.pareja_a === ID + '-p1' || x.pareja_b === ID + '-p1';
    if (Number(x.fecha) === 3 && uno) return;
    let cambios = { sets: texto(sets[i % sets.length]), estado: CONFIRMADO, cargado_por: cargo, cargado_el: x.dia, respondido_por: respondio, respondido_el: x.dia };
    if (Number(x.fecha) === 2 && i % 4 === 3) cambios = { estado: CANCELADO, se_presento: x.pareja_b };
    if (Number(x.fecha) === 3 && i % 4 === 1) cambios = { sets: texto('6-3 6-4'), estado: CARGADO, cargado_por: cargo, cargado_el: x.dia };
    if (Number(x.fecha) === 3 && i % 4 === 2) cambios = { sets: texto('7-6 6-4'), estado: DISPUTA, cargado_por: cargo, cargado_el: x.dia,
      respondido_por: respondio, respondido_el: x.dia, motivo_rechazo: 'El segundo set fue 4-6 y hubo súper tie-break.' };
    actualizar('Partidos', x, cambios);
  });
  recalcularTabla();

  const cargado = leer('Partidos').find(x => x.liga === ID && x.estado === CARGADO);
  const confirma = jugadores.find(j => j.pareja === cargado.pareja_b);
  return 'Liga de prueba creada. En la hoja Jugadores, abrí el link de Lucía Ruiz para cargar un resultado y el de ' +
    confirma.nombre + ' para confirmar uno.';
}

// ---------- Menú de la planilla ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Liga Pareja')
    .addItem('Crear liga de prueba', 'menuLigaDePrueba')
    .addSeparator()
    .addItem('Pasar inscripciones aceptadas a la liga', 'menuPasarInscripciones')
    .addItem('Armar fixture', 'menuArmarFixture')
    .addItem('Armar siguiente ronda del playoff', 'menuArmarPlayoff')
    .addItem('Recalcular tabla', 'menuRecalcularTabla')
    .addItem('Generar links nuevos (códigos borrados)', 'menuRegenerarLinks')
    .addToUi();
}

// Si el organizador corrige un partido a mano (por ejemplo, resuelve una disputa), la tabla se actualiza sola.
function onEdit(e) {
  if (e && e.range.getSheet().getName() === 'Partidos') recalcularTabla();
}

function menuLigaDePrueba() {
  conAviso(crearLigaDePrueba);
}
function menuPasarInscripciones() {
  conAviso(() => pasarInscripciones() + ' parejas pasaron a la liga. Mandales el link desde la columna mandar_link de la hoja Jugadores.');
}
function menuArmarFixture() {
  conAviso(() => 'Fixture armado: ' + armarFixture(pedirLiga()) + ' fechas en la hoja Partidos. Revisá canchas y horarios.');
}
function menuArmarPlayoff() {
  conAviso(() => 'Listo: ' + armarPlayoff(pedirLiga()) + ' en la hoja Partidos.');
}
function menuRecalcularTabla() {
  conAviso(() => { recalcularTabla(); return 'Tabla actualizada.'; });
}
function menuRegenerarLinks() {
  conAviso(() => regenerarLinks() + ' links nuevos. Mandalos desde la columna mandar_link.');
}

function pedirLiga() {
  const ligas = leer('Ligas');
  if (ligas.length === 1) return ligas[0].id;
  const r = SpreadsheetApp.getUi().prompt('¿Qué liga? Escribí el id (' + ligas.map(l => l.id).join(', ') + ')');
  return r.getResponseText().trim();
}

function conAviso(fn) {
  const ui = SpreadsheetApp.getUi();
  try { ui.alert(fn()); } catch (err) { ui.alert('No se pudo: ' + err.message); }
}

// ---------- Planilla: leer y escribir hojas como filas con nombre ----------

function hoja(nombre) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(nombre);
  if (!h) {
    h = libro.insertSheet(nombre);
    h.appendRow(HOJAS[nombre]);
    h.setFrozenRows(1);
  }
  return h;
}

// Cada fila es un objeto con las columnas del encabezado y su número de fila en _fila.
function leer(nombre) {
  const valores = hoja(nombre).getDataRange().getValues();
  const cols = valores.shift();
  return valores.map((v, i) => cols.reduce((fila, col, k) => {
    fila[col] = typeof v[k] === 'string' ? v[k].trim() : v[k];
    return fila;
  }, { _fila: i + 2 }));
}

function agregar(nombre, fila) {
  const h = hoja(nombre);
  const cols = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0];
  h.appendRow(cols.map(col => fila[col] === undefined ? '' : fila[col]));
}

function actualizar(nombre, fila, cambios) {
  const h = hoja(nombre);
  const cols = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0];
  Object.keys(cambios).forEach(col => {
    const k = cols.indexOf(col);
    if (k < 0) throw new Error('Falta la columna ' + col + ' en la hoja ' + nombre + '.');
    h.getRange(fila._fila, k + 1).setValue(cambios[col]);
    fila[col] = cambios[col];
  });
}

// Reescribe la hoja entera con estas filas, conservando el encabezado. Los textos se vuelven a guardar como texto.
function reemplazar(nombre, filas) {
  const h = hoja(nombre);
  const cols = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0];
  const valor = v => v === undefined ? '' : typeof v === 'string' && v && v[0] !== "'" ? texto(v) : v;
  if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, cols.length).clearContent();
  if (filas.length) h.getRange(2, 1, filas.length, cols.length).setValues(filas.map(f => cols.map(c => valor(f[c]))));
}

// ---------- Formatos ----------

// Fuerza a la planilla a guardar el valor como texto (si no, "6-4" se vuelve una fecha y "22:00", una hora).
function texto(valor) {
  return "'" + String(valor);
}

// Corta textos largos y evita que un valor que empieza con = se ejecute como fórmula.
function limpiar(valor) {
  const t = String(valor || '').trim().slice(0, 200);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function zona() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}

function textoDia(valor) {
  return valor instanceof Date ? Utilities.formatDate(valor, zona(), 'yyyy-MM-dd') : String(valor || '');
}

function textoHora(valor) {
  return valor instanceof Date ? Utilities.formatDate(valor, zona(), 'HH:mm') : String(valor || '');
}

function nombreDePila(nombre) {
  return String(nombre).trim().split(/\s+/)[0];
}

function apellido(nombre) {
  const partes = String(nombre).trim().split(/\s+/);
  return partes[partes.length - 1];
}

// "221 555-1234" → "5492215551234", el formato que pide wa.me para un celular de Argentina.
function numeroWhatsApp(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  if (d.startsWith('54')) return d;
  d = d.replace(/^0/, '');
  if (d.length === 12) {
    const k = [2, 3, 4].find(i => d.substr(i, 2) === '15');
    if (k) d = d.slice(0, k) + d.slice(k + 2);
  }
  return '549' + d;
}

function respuesta(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
