// App de la liga: lee la liga desde el Apps Script y deja cargar, confirmar o rechazar resultados.
// Es la misma dirección que SCRIPT_URL en /app.js (el mismo script atiende la landing y la liga).
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxI-JFybKHqyVILm9Rqpf7LtdlK2Qqs3k7HvA9QEvq6SVJP8IHocEz1IQzs9KJJxNc9Cw/exec';

const ESTADOS = {
  agendado: ['scheduled', 'Agendado'],
  cargado: ['loaded', 'Cargado'],
  confirmado: ['confirmed', 'Confirmado'],
  'en disputa': ['dispute', 'En disputa'],
  cancelado: ['cancelled', 'Cancelado']
};
const FASES = { cuartos: 'Cuartos de final', semifinal: 'Semifinal', final: 'Final' };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

// El link personal trae ?j=CODIGO. Se guarda en el teléfono para que la próxima vez alcance con entrar a /liga.
let codigo = params.get('j') || leerGuardado();
let datos = null;
let aviso = null; // Mensaje para mostrar arriba de Mis partidos después de una acción.

function leerGuardado() {
  try { return localStorage.getItem('lp-codigo') || ''; } catch { return ''; }
}
function guardar(valor) {
  try { valor ? localStorage.setItem('lp-codigo', valor) : localStorage.removeItem('lp-codigo'); } catch { /* sin almacenamiento */ }
}

async function pedir(metodo, campos) {
  const url = new URL(SCRIPT_URL);
  const opciones = {};
  if (metodo === 'GET') {
    Object.entries(campos).forEach(([k, v]) => v && url.searchParams.set(k, v));
  } else {
    opciones.method = 'POST';
    opciones.body = new URLSearchParams(campos);
  }
  const r = await fetch(url, opciones);
  const json = await r.json();
  if (!json.ok) throw new Error(json.error || 'Algo salió mal. Probá de nuevo en un rato.');
  return json;
}

async function cargarLiga() {
  try {
    datos = await pedir('GET', { j: codigo, liga: params.get('liga') });
    if (codigo) guardar(codigo);
    $('error').hidden = true;
    mostrar();
  } catch (err) {
    $('cargando').hidden = true;
    if (codigo && /link/.test(err.message)) {
      guardar('');
      mostrarError('Este link no funciona', err.message);
    } else {
      mostrarError('No pudimos abrir la liga', err.message === 'Failed to fetch' ? 'Revisá tu conexión y probá de nuevo.' : err.message);
    }
  }
}

function mostrarError(titulo, texto) {
  $('error-title').textContent = titulo;
  $('error-text').textContent = texto;
  $('error').hidden = false;
}

// ---------- Ayudas ----------

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const nombre = id => (datos.parejas.find(x => x.id === id) || {}).nombre || 'A definir';
const esMio = p => datos.yo && (p.a === datos.yo.pareja || p.b === datos.yo.pareja);
const rivalDe = p => p.a === datos.yo.pareja ? p.b : p.a;

function aFecha(dia) {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fechaCorta(dia) {
  const f = aFecha(dia);
  return DIAS[f.getDay()].slice(0, 3) + ' ' + f.getDate() + '/' + (f.getMonth() + 1);
}
function fechaLarga(dia) {
  const f = aFecha(dia);
  const nombreDia = DIAS[f.getDay()];
  return nombreDia[0].toUpperCase() + nombreDia.slice(1) + ' ' + f.getDate() + '/' + (f.getMonth() + 1);
}
function sumarDias(dia, n) {
  const f = aFecha(dia);
  f.setDate(f.getDate() + n);
  return [f.getFullYear(), String(f.getMonth() + 1).padStart(2, '0'), String(f.getDate()).padStart(2, '0')].join('-');
}

// "6-4 3-6 10-7" → [[6,4],[3,6],[10,7]], desde el lado de la pareja A.
const setsDe = p => p.sets ? p.sets.split(/\s+/).map(s => s.split('-').map(Number)) : [];

function ganadorDe(p) {
  if (p.estado === 'cancelado') return p.sePresento;
  const sets = setsDe(p);
  if (!sets.length) return '';
  return sets.filter(([x, y]) => x > y).length >= 2 ? p.a : p.b;
}

// El partido está "en juego" desde su hora y durante dos horas, mientras nadie cargó el resultado.
function enJuego(p) {
  if (p.estado !== 'agendado' || p.dia !== datos.hoy || !/^\d{1,2}:\d{2}$/.test(p.hora)) return false;
  const [h, m] = p.hora.split(':').map(Number);
  const ahora = new Date();
  const minutos = ahora.getHours() * 60 + ahora.getMinutes() - (h * 60 + m);
  return minutos >= 0 && minutos < 120;
}

function estado(p) {
  if (enJuego(p)) return `<span class="lp-status lp-status--playing">En juego · <span class="lp-status__time">${esc(p.hora)}</span></span>`;
  const [clase, texto] = ESTADOS[p.estado] || ESTADOS.agendado;
  return `<span class="lp-status lp-status--${clase}">${texto}</span>`;
}

function etiquetaFecha(p) {
  return (FASES[p.fase] || 'Fecha ' + p.fecha) + ' · ' + fechaCorta(p.dia);
}

// Tarjeta de partido del design system (MatchCard). "extra" va abajo: texto de ayuda y botones.
function tarjeta(p, extra = '') {
  const sets = setsDe(p);
  const gana = ganadorDe(p);
  const fila = (id, lado) => {
    const games = sets.map(s => s[lado]).join(' ');
    return `<span class="lp-match__team${gana === id ? ' lp-match__team--winner' : ''}">${esc(nombre(id))}</span>` +
      `<span class="lp-match__score">${esc(games)}</span>`;
  };
  const meta = [etiquetaFecha(p), p.cancha, p.hora].filter(Boolean).map(esc).join(' · ');
  return `<article class="lp-match${esMio(p) ? ' es-mio' : ''}">
    <div class="lp-match__meta"><span>${meta}</span>${estado(p)}</div>
    <div class="lp-match__teams">${fila(p.a, 0)}${fila(p.b, 1)}</div>
    ${extra}
  </article>`;
}

function ayuda(texto) {
  return `<p class="lp-field__help nota">${texto}</p>`;
}

// Mensaje de WhatsApp ya escrito para que la rival confirme. Lo manda el jugador desde su teléfono.
function botonesAviso(p) {
  const rival = rivalDe(p);
  const mios = setsDe(p).map(([x, y]) => p.a === datos.yo.pareja ? x + '-' + y : y + '-' + x).join(' ');
  return (datos.contactos[rival] || []).filter(c => c.wa.length > 10).map(c => {
    const texto = `Hola ${c.nombre}, cargué el resultado de ${etiquetaFecha(p).toLowerCase()}: ${nombre(datos.yo.pareja)} ${mios} contra ${nombre(rival)}. ` +
      'Confirmalo o rechazalo desde tu link de la liga.';
    return `<a class="lp-btn lp-btn--secondary" href="https://wa.me/${c.wa}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Avisar a ${esc(c.nombre)}</a>`;
  }).join('');
}

// ---------- Vistas ----------

function mostrar() {
  $('cargando').hidden = true;
  $('titulo').textContent = datos.liga.nombre;
  document.title = 'Liga Pareja · ' + datos.liga.nombre;
  $('tabs').hidden = false;
  $('tab-partidos').hidden = !datos.yo;
  $('pie').hidden = false;
  if (datos.yo) {
    $('quien').hidden = false;
    $('quien').textContent = 'Hola, ' + datos.yo.nombre + ' · ' + nombre(datos.yo.pareja);
    $('pie-yo').innerHTML = `Entraste como ${esc(datos.yo.nombre)}. ¿No sos vos? <button class="link" type="button" id="salir">Salir</button>`;
    $('salir').onclick = () => { guardar(''); location.href = location.pathname; };
  } else {
    $('pie-yo').textContent = 'Para cargar o confirmar resultados, entrá con el link personal que te mandó el organizador por WhatsApp.';
  }
  verPartidos();
  verTabla();
  verFixture();
  irA();
}

function verPartidos() {
  if (!datos.yo) return;
  const mios = datos.partidos.filter(esMio).sort((x, y) => x.fecha - y.fecha);
  const yo = datos.yo.pareja;
  const confirmar = mios.filter(p => p.estado === 'cargado' && p.cargo !== yo);
  const cargar = mios.filter(p => p.estado === 'agendado' && p.dia <= datos.hoy);
  const esperando = mios.filter(p => p.estado === 'cargado' && p.cargo === yo);
  const disputa = mios.filter(p => p.estado === 'en disputa');
  const proximo = mios.find(p => p.estado === 'agendado' && p.dia > datos.hoy);
  const jugados = mios.filter(p => p.estado === 'confirmado' || p.estado === 'cancelado').reverse();

  const grupo = (titulo, html) => html ? `<div class="grupo"><h2 class="lp-annot">${titulo}</h2>${html}</div>` : '';
  let html = '';
  if (aviso) {
    html += `<div class="lp-notice lp-notice--${aviso.tipo}" role="status"><span class="lp-notice__title">${esc(aviso.titulo)}</span><span>${esc(aviso.texto)}</span></div>`;
  }

  html += grupo('Para confirmar', confirmar.map(p => tarjeta(p,
    ayuda(`Lo cargó ${esc(nombre(p.cargo))}. ¿Coincide con lo que jugaron?`) +
    `<div class="lp-match__actions"><button class="lp-btn lp-btn--primary" type="button" data-confirmar="${esc(p.id)}">Confirmar</button>` +
    `<button class="lp-btn lp-btn--secondary" type="button" data-rechazar="${esc(p.id)}">Rechazar</button></div>`)).join(''));

  html += grupo('Para cargar', cargar.map(p => tarjeta(p,
    ayuda('Cargá el resultado apenas termine el partido. La pareja rival lo tiene que confirmar.') +
    `<div class="lp-match__actions"><button class="lp-btn lp-btn--primary" type="button" data-cargar="${esc(p.id)}">Cargar resultado</button></div>`)).join(''));

  html += grupo('Esperando a la rival', esperando.map(p => tarjeta(p,
    ayuda(`Falta que ${esc(nombre(rivalDe(p)))} lo confirme. Si no lo vieron, avisales.`) +
    `<div class="lp-match__actions">${botonesAviso(p)}<button class="lp-btn lp-btn--secondary" type="button" data-cargar="${esc(p.id)}">Corregir</button></div>`)).join(''));

  html += grupo('En disputa', disputa.map(p => tarjeta(p,
    ayuda('La pareja rival rechazó el resultado' + (p.motivo ? `: “${esc(p.motivo)}”` : '') + '. Decide el organizador.'))).join(''));

  if (proximo) {
    const libre = datos.liga.fechaLibre ? sumarDias(datos.liga.primeraFecha, 7 * (datos.liga.fechaLibre - 1)) : '';
    html += `<div class="grupo"><h2 class="lp-annot">Próximo partido</h2>
      <article class="proximo">
        <p class="proximo__cuando">${esc(fechaLarga(proximo.dia))}${proximo.hora ? ' · ' + esc(proximo.hora) : ''}</p>
        <p class="proximo__contra">Jugás contra <b>${esc(nombre(rivalDe(proximo)))}</b></p>
        <p class="proximo__donde">${esc([etiquetaFecha(proximo).split(' · ')[0], proximo.cancha].filter(Boolean).join(' · '))}</p>
      </article>
      ${libre && libre > datos.hoy && libre < proximo.dia ? ayuda(`Antes, el ${esc(fechaLarga(libre).toLowerCase())} es fecha libre.`) : ''}
    </div>`;
  } else if (!cargar.length && !confirmar.length) {
    html += grupo('Próximo partido', ayuda('No tenés partidos agendados por ahora.'));
  }

  html += grupo('Jugados', jugados.map(p => tarjeta(p,
    p.estado === 'cancelado' ? ayuda(`No se jugó: suma ${esc(nombre(p.sePresento))}, que se presentó.`) : '')).join(''));

  $('partidos').innerHTML = html;
}

function verTabla() {
  const filas = datos.tabla.map(f => {
    const clases = [f.posicion === 1 && f.pj ? 'is-leader' : '', datos.yo && f.pareja === datos.yo.pareja ? 'is-mine' : ''].filter(Boolean).join(' ');
    const dif = f.dif > 0 ? `<td class="lp-pos">+${f.dif}</td>` : f.dif < 0 ? `<td class="lp-neg">−${-f.dif}</td>` : '<td>0</td>';
    return `<tr${clases ? ` class="${clases}"` : ''}><td>${f.posicion}</td><td>${esc(f.nombre)}</td><td>${f.pj}</td><td class="lp-pts">${f.puntos}</td><td>${f.gf}</td><td>${f.gc}</td>${dif}</tr>`;
  }).join('');
  $('tabla').innerHTML = `<div class="grupo"><h2 class="lp-annot">Tabla</h2>
    <div class="lp-table-wrap"><table class="lp-table">
      <thead><tr><th>#</th><th>Pareja</th><th><abbr title="Partidos jugados">PJ</abbr></th><th>Pts</th><th><abbr title="Games a favor">GF</abbr></th><th><abbr title="Games en contra">GC</abbr></th><th>Dif</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    ${ayuda('Ganar en 2 sets da 3 puntos; en 3 sets, 2 al ganador y 1 al que pierde. Si una pareja no se presenta, la otra suma 3. Solo cuentan los partidos confirmados por las dos parejas.')}
  </div>`;
}

function verFixture() {
  const porFecha = {};
  datos.partidos.forEach(p => (porFecha[p.fecha] = porFecha[p.fecha] || []).push(p));
  const libre = datos.liga.fechaLibre;
  if (libre && !porFecha[libre] && datos.partidos.length) porFecha[libre] = [];

  $('fixture').innerHTML = Object.keys(porFecha).map(Number).sort((x, y) => x - y).map(f => {
    const lista = porFecha[f];
    if (!lista.length) {
      const dia = sumarDias(datos.liga.primeraFecha, 7 * (f - 1));
      return `<div class="grupo"><h2 class="lp-annot">Fecha ${f} · ${esc(fechaCorta(dia))}</h2>${ayuda('Fecha libre: no se juega.')}</div>`;
    }
    const titulo = (FASES[lista[0].fase] || 'Fecha ' + f) + ' · ' + fechaCorta(lista[0].dia);
    return `<div class="grupo"><h2 class="lp-annot">${esc(titulo)}</h2>${lista.map(p => tarjeta(p)).join('')}</div>`;
  }).join('') || ayuda('El organizador todavía no armó el fixture.');
}

// Pestañas: #partidos, #tabla y #fixture.
function irA() {
  if (!datos) return;
  let vista = location.hash.slice(1);
  if (!['partidos', 'tabla', 'fixture'].includes(vista) || (vista === 'partidos' && !datos.yo)) vista = datos.yo ? 'partidos' : 'tabla';
  document.querySelectorAll('.vista').forEach(s => { s.hidden = s.id !== vista; });
  document.querySelectorAll('.tabs__tab').forEach(a => {
    a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + vista);
  });
}
addEventListener('hashchange', () => { irA(); scrollTo(0, 0); });

// ---------- Acciones ----------

async function enviar(campos, boton, okAviso) {
  const texto = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Enviando…';
  try {
    datos = await pedir('POST', Object.assign({ j: codigo }, campos));
    aviso = okAviso;
    mostrar();
    location.hash = 'partidos';
    scrollTo(0, 0);
    return '';
  } catch (err) {
    return err.message === 'Failed to fetch' ? 'No se pudo enviar. Revisá tu conexión y probá de nuevo.' : err.message;
  } finally {
    boton.disabled = false;
    boton.textContent = texto;
  }
}

let partidoActual = null;

$('partidos').addEventListener('click', async event => {
  const b = event.target.closest('button');
  if (!b) return;
  const partido = datos.partidos.find(p => p.id === (b.dataset.cargar || b.dataset.confirmar || b.dataset.rechazar));
  if (!partido) return;
  partidoActual = partido;

  if (b.dataset.cargar) abrirCarga(partido);
  if (b.dataset.rechazar) {
    $('rechazar-form').reset();
    $('rechazar-error').hidden = true;
    $('rechazar').showModal();
  }
  if (b.dataset.confirmar) {
    const error = await enviar({ accion: 'confirmar', partido: partido.id }, b,
      { tipo: 'success', titulo: 'Resultado confirmado', texto: 'Ya suma en la tabla.' });
    if (error) { aviso = { tipo: 'error', titulo: 'No se pudo confirmar', texto: error }; verPartidos(); }
  }
});

function abrirCarga(p) {
  const form = $('cargar-form');
  form.reset();
  $('cargar-error').hidden = true;
  $('cargar-meta').textContent = [etiquetaFecha(p), p.cancha].filter(Boolean).join(' · ');
  $('col-nos').textContent = nombre(datos.yo.pareja);
  $('col-ellos').textContent = nombre(rivalDe(p));
  // Al corregir, se completa con lo que ya estaba cargado.
  setsDe(p).forEach(([x, y], i) => {
    const mio = p.a === datos.yo.pareja;
    form['n' + (i + 1)].value = mio ? x : y;
    form['e' + (i + 1)].value = mio ? y : x;
  });
  $('cargar').showModal();
}

// Misma validación que el script, para avisar antes de enviar.
function leerSets(form) {
  const sets = [];
  for (let i = 1; i <= 3; i++) {
    const n = form['n' + i].value.trim(), e = form['e' + i].value.trim();
    if (!n && !e) continue;
    if (!n || !e) throw new Error(`Completá los dos lados del set ${i}.`);
    if (!/^\d+$/.test(n) || !/^\d+$/.test(e)) throw new Error(`En el set ${i} van solo números.`);
    sets.push([Number(n), Number(e)]);
  }
  if (sets.length < 2) throw new Error('Cargá al menos dos sets.');
  const setValido = ([x, y]) => {
    const alto = Math.max(x, y), bajo = Math.min(x, y);
    return (alto === 6 && bajo <= 4) || (alto === 7 && (bajo === 5 || bajo === 6));
  };
  const superTieBreak = ([x, y]) => Math.max(x, y) >= 10 && Math.abs(x - y) >= 2 && (Math.max(x, y) === 10 || Math.abs(x - y) === 2);
  sets.forEach((s, i) => {
    if (!setValido(s) && !(i === 2 && superTieBreak(s))) throw new Error(`Revisá el set ${i + 1}: ${s.join('-')} no es un resultado posible.`);
  });
  const ganados = sets.map(([x, y]) => x > y);
  if (ganados[0] === ganados[1] && sets.length === 3) throw new Error('Si una pareja ganó los dos primeros sets, no hay tercer set.');
  if (ganados[0] !== ganados[1] && sets.length === 2) throw new Error('Falta el tercer set.');
  return sets.map(s => s.join('-')).join(' ');
}

$('cargar-form').addEventListener('submit', async event => {
  event.preventDefault();
  const error = $('cargar-error');
  let sets;
  try {
    sets = leerSets(event.target);
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    return;
  }
  const mensaje = await enviar({ accion: 'cargar', partido: partidoActual.id, sets }, event.submitter || event.target.querySelector('[type=submit]'),
    { tipo: 'success', titulo: 'Resultado cargado', texto: `Falta que ${nombre(rivalDe(partidoActual))} lo confirme. Avisales por WhatsApp desde la tarjeta.` });
  error.textContent = mensaje;
  error.hidden = !mensaje;
  if (!mensaje) $('cargar').close();
});

$('rechazar-form').addEventListener('submit', async event => {
  event.preventDefault();
  const error = $('rechazar-error');
  const mensaje = await enviar({ accion: 'rechazar', partido: partidoActual.id, motivo: event.target.motivo.value.trim() },
    event.submitter || event.target.querySelector('[type=submit]'),
    { tipo: 'info', titulo: 'Resultado rechazado', texto: 'El organizador va a ver tu mensaje y decide cómo queda el partido.' });
  error.textContent = mensaje;
  error.hidden = !mensaje;
  if (!mensaje) $('rechazar').close();
});

document.querySelectorAll('[data-cerrar]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });

// Al volver a la pestaña, se actualiza por si la rival confirmó mientras tanto.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && datos && !document.querySelector('dialog[open]')) {
    aviso = null;
    cargarLiga();
  }
});

cargarLiga();
