// Dirección del Apps Script publicado como aplicación web.
// Vacía mientras la planilla no esté conectada: el formulario funciona en modo prueba.
const SCRIPT_URL = '';

// WhatsApp de quien recibe a los organizadores, con código de país y sin espacios (ej. 5492215551234).
const WHATSAPP_ORGANIZADOR = '5492215678025';
if (WHATSAPP_ORGANIZADOR) {
  document.getElementById('registrar-liga').href =
    'https://wa.me/' + WHATSAPP_ORGANIZADOR + '?text=' + encodeURIComponent('Hola, quiero registrar mi liga en Liga Pareja');
}

const form = document.getElementById('form');
const errorBox = document.getElementById('error');
const errorTitle = document.getElementById('error-title');
const errorText = document.getElementById('error-text');
const done = document.getElementById('done');

// La fuente se toma de la URL, por ejemplo ?fuente=grupo-liga
form.fuente.value = new URLSearchParams(location.search).get('fuente') || 'directo';

function soloDigitos(valor) {
  return valor.replace(/\D/g, '');
}

function validar(datos) {
  const faltan = [...form.querySelectorAll('[required]')].filter(el =>
    el.type === 'checkbox' ? !el.checked : !el.value.trim()
  );
  if (faltan.length) return 'Completá todos los campos y aceptá el uso de los datos.';
  if (!/^\S+@\S+\.\S+$/.test(datos.get('email'))) return 'Revisá el email.';
  for (const campo of ['whatsapp1', 'whatsapp2']) {
    if (soloDigitos(datos.get(campo)).length < 10) return 'Revisá los WhatsApp: tienen que tener código de área.';
  }
  return '';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const datos = new FormData(form);
  const error = validar(datos);
  errorBox.hidden = !error;
  errorTitle.textContent = 'Revisá los datos';
  errorText.textContent = error;
  if (error) return;

  const boton = form.querySelector('button');
  boton.disabled = true;
  boton.textContent = 'Enviando…';

  try {
    if (SCRIPT_URL) {
      // no-cors: Apps Script no devuelve encabezados que el navegador acepte; se asume éxito si no hay error de red.
      await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(datos) });
    } else {
      console.info('Modo prueba, sin planilla conectada:', Object.fromEntries(datos));
    }
    form.hidden = true;
    done.hidden = false;
    done.scrollIntoView({ block: 'center' });
  } catch {
    errorBox.hidden = false;
    errorTitle.textContent = 'No se pudo enviar';
    errorText.textContent = 'Probá de nuevo en un rato.';
    boton.disabled = false;
    boton.textContent = 'Anotarnos';
  }
});
