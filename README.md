# Liga Pareja · Landing de inscripción

Página para que las parejas se anoten en la liga. HTML, CSS y JS sin build; se publica en Vercel.

- `index.html`, `styles.css`, `app.js`: la página. Los colores y componentes salen del design system de Liga Pareja.
- `organizadores/index.html`: página para organizadores de ligas, en `/organizadores`. Usa los mismos estilos.
- `liga/`: la app de la liga, en `/liga`. Cada jugador entra con su link personal (`/liga/?j=CODIGO`) y ve sus partidos, carga resultados y confirma o rechaza los de la rival. Sin link, muestra la tabla y el fixture.
- `apps-script/Code.gs`: recibe el formulario de inscripción y atiende la app de la liga. No se publica en Vercel.

## Conectar la planilla

1. En la planilla: Extensiones → Apps Script, pegar `apps-script/Code.gs` y guardar.
2. Implementar → Nueva implementación → Aplicación web, ejecutar como "Yo", acceso "Cualquier persona".
3. Copiar la URL que termina en `/exec` en `SCRIPT_URL`, al principio de `app.js`.

Mientras `SCRIPT_URL` esté vacía, el formulario funciona en modo prueba y no guarda nada. La app de la liga usa la misma dirección, en `liga/liga.js`.

## La liga en la planilla

La planilla es el back office. El script crea solas las hojas Ligas, Parejas, Jugadores, Partidos y Tabla, y suma el menú **Liga Pareja**:

- **Crear liga de prueba:** ocho parejas inventadas con las primeras fechas jugadas. Los links para probar están en la hoja Jugadores.
- **Pasar inscripciones aceptadas a la liga:** las filas de Inscripciones con estado `aceptada` pasan a Parejas y Jugadores, cada jugador con su link. La columna `mandar_link` abre WhatsApp con el mensaje ya escrito.
- **Armar fixture:** todos contra todos, salteando la fecha libre de la hoja Ligas.
- **Armar siguiente ronda del playoff:** cuartos (1º-8º, 4º-5º, 2º-7º, 3º-6º), semifinal y final.
- **Generar links nuevos:** para un jugador cuyo link se filtró, se borra su `codigo` y este menú le genera otro.

Si el organizador resuelve una disputa o una ausencia, edita el partido en la hoja Partidos (`estado` en `confirmado` con los `sets` correctos, o `cancelado` con la pareja que se presentó en `se_presento`) y la tabla se recalcula sola. Los puntos por partido ganado y perdido se configuran en la hoja Ligas.

Después de cambiar `Code.gs`: Implementar → Administrar implementaciones → editar → Versión nueva. Así la URL no cambia.

## Publicar en Vercel

Add New → Project → importar este repo → Framework Preset "Other", sin Build Command → Deploy. Cada push a `main` se publica solo.
