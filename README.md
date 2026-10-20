# Liga Pareja · Landing de inscripción

Página para que las parejas se anoten en la liga. HTML, CSS y JS sin build; se publica en Vercel.

- `index.html`, `styles.css`, `app.js`: la página. Los colores y componentes salen del design system de Liga Pareja.
- `organizadores/index.html`: página para organizadores de ligas, en `/organizadores`. Usa los mismos estilos.
- `apps-script/Code.gs`: recibe el formulario y guarda cada inscripción en la planilla. No se publica en Vercel.

## Conectar la planilla

1. En la planilla: Extensiones → Apps Script, pegar `apps-script/Code.gs` y guardar.
2. Implementar → Nueva implementación → Aplicación web, ejecutar como "Yo", acceso "Cualquier persona".
3. Copiar la URL que termina en `/exec` en `SCRIPT_URL`, al principio de `app.js`.

Mientras `SCRIPT_URL` esté vacía, el formulario funciona en modo prueba y no guarda nada.

## Publicar en Vercel

Add New → Project → importar este repo → Framework Preset "Other", sin Build Command → Deploy. Cada push a `main` se publica solo.
